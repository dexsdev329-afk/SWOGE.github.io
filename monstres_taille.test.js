/* LA TAILLE D'UNE CREATURE — banc d'essai permanent.
 *
 * ---- ce qui etait faux ----
 *
 * Toutes les creatures etaient dessinees a 118 pixels et lues dans une case
 * d'atlas de 128, ces deux nombres ecrits en dur dans la page. Un insecte et
 * un colosse se ressemblaient donc de loin, et toute creature dont la planche
 * n'etait pas au format des anciennes etait dessinee de travers — on lisait
 * un quart de son dessin.
 *
 * Les deux nombres se DEDUISENT maintenant :
 *   - la case vaut un quart de la largeur de l'image (quatre directions) ;
 *   - la taille a l'ecran vaut le RAYON envoye par le serveur, fois trois.
 *
 * Le rayon est deja ce qui tranche les collisions et les tirs qui portent.
 * En faire aussi la source du dessin est la seule facon d'etre sur qu'on tire
 * sur ce qu'on voit : une table de tailles ecrite a cote finirait par ne plus
 * dire la meme chose, et le desaccord se paierait a chaque coup manque.
 *
 * ---- comment on le verifie ----
 *
 * On n'inspecte pas des variables : elles vivent dans une fermeture, et de
 * toute facon ce qu'on veut savoir c'est ce qui est PEINT. On enregistre donc
 * chaque appel a `drawImage` et on lit les nombres reellement passes au
 * canevas — la source lue dans l'atlas, et la taille posee a l'ecran.
 *
 * Il faut playwright et le depot du serveur a cote. Sans eux, on le dit et on
 * sort en succes : mieux vaut un essai saute qu'un rouge qu'on apprend a
 * ignorer.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('monstres_taille.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('monstres_taille.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp3': 'audio/mpeg' };
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const f = path.join(racine, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
        r.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res({ port: s.address().port, stop: () => s.close() }));
  });
}

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/mtaille-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  /* Le robinet de developpement, celui que le serveur refuse d'ouvrir des
     qu'un coffre ou un signataire existe. On ne fabrique donc pas un solde a
     la main dans l'etat : on prend le chemin que le serveur autorise. */
  process.env.DEV_FAUCET = '1';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const monde = require(path.join(SERVEUR, 'monde'));
  await new Promise((r) => setTimeout(r, 1200));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await nav.newPage({ viewport: { width: 1280, height: 800 } });

  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) { const s = (pr === undefined) ? new N(u) : new N(u, pr); s.__m = [];
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      window.__s.push(s); return s; }
    C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
    window.WebSocket = C;

    /* ---- LE MOUCHARD ----
     * On veut les nombres REELLEMENT passes au canevas, pas ceux qu'on croit
     * avoir calcules. On enregistre donc la forme a neuf arguments — la seule
     * qui decoupe dans un atlas — avec le nom du fichier source. */
    window.__peint = [];
    const D = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img) {
      if (arguments.length === 9) {
        const src = (img && (img.currentSrc || img.src)) || '';
        window.__peint.push({ src: String(src).split('/').pop().split('?')[0],
                              sx: arguments[1], sy: arguments[2], sw: arguments[3], sh: arguments[4],
                              dw: arguments[7], dh: arguments[8] });
        if (window.__peint.length > 4000) window.__peint.splice(0, 2000);
      }
      return D.apply(this, arguments);
    };
  });

  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));

  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const w = ethers.Wallet.createRandom();
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(2000);

  /* ---- UN PERSONNAGE, ACHETE POUR DE BON ----
     Sans personnage le serveur refuse l'entree — et il a raison : on n'entre
     pas dans le monde en spectateur. On passe donc par le vrai achat, avec
     du vrai solde, plutot que d'ecrire un skin dans l'etat par la fenetre. */
  await p.evaluate(async () => {
    const s = window.__s[0];
    for (let i = 0; i < 16; i++) { s.send(JSON.stringify({ type: 'devCredit' })); await new Promise((r) => setTimeout(r, 60)); }
    await new Promise((r) => setTimeout(r, 400));
    s.send(JSON.stringify({ type: 'skinBuy', id: 'andy' }));
  });
  await p.waitForTimeout(1500);
  const perso = await p.evaluate(() => {
    const m = window.__s[0].__m.filter((x) => x.type === 'skins').pop();
    return { actif: m && m.actif, err: m && m.error };
  });
  console.log('\n-- le personnage --');
  console.log('   ' + JSON.stringify(perso));
  ok(perso.actif === 'andy', 'le personnage est achete et porte' + (perso.err ? ' (erreur: ' + perso.err + ')' : ''));

  /* On entre dans le monde par le MEME message que le portail : c'est le
     serveur qui accepte ou refuse, exactement comme en jeu. */
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForTimeout(1500);
  const entre = await p.evaluate(() => {
    const s = window.__s[0];
    const e = s.__m.filter((m) => m.type === 'realmEntre').pop();
    const r = s.__m.filter((m) => m.type === 'realmRefus').pop();
    return { entre: !!e, refus: r ? r.raison : null,
             especes: e ? Object.keys(e.especes || {}).length : 0 };
  });
  console.log('\n-- entree dans le monde --');
  console.log('   ' + JSON.stringify(entre));
  ok(entre.entre, 'on entre dans le monde de combat' + (entre.refus ? ' (refus: ' + entre.refus + ')' : ''));
  ok(entre.especes >= 11, `le serveur envoie les ${entre.especes} especes, rayon compris`);

  /* ---- LES QUATRE TAILLES, SOUS LES YEUX ----
   *
   * On pose quatre creatures autour du personnage par le meme message que le
   * serveur emet dix fois par seconde. Le vrai serveur continue d'envoyer les
   * siennes en meme temps — c'est voulu : on ne coupe rien, on AJOUTE. Le
   * personnage apparait au bord de la carte, ou seuls des limes vivent ; tout
   * dessin de nuee, de colosse ou de gardien vient donc forcement de nous.
   *
   * On injecte pendant une seconde parce que les atlas se chargent a la
   * premiere apparition : les premieres images ne peignent rien encore. */
  const moi = await p.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
    return { x: e.moi.x, y: e.moi.y };
  });
  await p.evaluate(async ([x, y]) => {
    const s = window.__s[0];
    const pose = [
      { i: 90001, e: 'nuee',    x: x - 150, y: y - 120 },
      { i: 90002, e: 'lime',    x: x + 150, y: y - 120 },
      { i: 90003, e: 'colosse', x: x - 150, y: y + 140 },
      { i: 90004, e: 'gardien', x: x + 150, y: y + 140 },
    ].map((m) => ({ ...m, d: 'down', pv: 100, pvMax: 100 }));
    for (let k = 0; k < 60; k++) {
      s.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify({ type: 'realmEtat', monstres: pose, tirs: [], tirsM: [], tombes: [], joueurs: [] }),
      }));
      await new Promise((r) => requestAnimationFrame(r));
    }
  }, [moi.x, moi.y]);
  await p.waitForTimeout(300);

  const peint = await p.evaluate(() => {
    const out = {};
    for (const d of window.__peint) {
      if (!/^(nuee|lime|colosse|gardien)\.webp$/.test(d.src)) continue;
      out[d.src.replace('.webp', '')] = { sw: d.sw, sh: d.sh, dw: Math.round(d.dw), dh: Math.round(d.dh), sx: d.sx };
    }
    return out;
  });

  console.log('\n-- ce qui est reellement peint --');
  Object.keys(peint).sort().forEach((k) => console.log('   ' + k.padEnd(9) + ' ' + JSON.stringify(peint[k])));

  const R = monde.MONSTRES;
  const ATTENDU = {
    nuee:    { cadre: 64,  dessin: R.nuee.rayon * 3 },
    lime:    { cadre: 128, dessin: R.lime.rayon * 3 },
    colosse: { cadre: 160, dessin: R.colosse.rayon * 3 },
    gardien: { cadre: 160, dessin: R.gardien.rayon * 3 },
  };
  Object.keys(ATTENDU).forEach((k) => {
    const d = peint[k], a = ATTENDU[k];
    ok(!!d, `« ${k} » est peint`);
    if (!d) return;
    /* LA CASE LUE DANS L'ATLAS. C'est ici que le 128 en dur faisait le plus de
       degat : sur une planche de 256, il lisait quatre cases a la fois ; sur
       une de 640, un quart d'une case. */
    ok(d.sw === a.cadre && d.sh === a.cadre,
       `« ${k} » : la case lue vaut ${d.sw} (l'atlas en donne ${a.cadre})`);
    /* LA TAILLE A L'ECRAN, deduite du rayon que le serveur a envoye. */
    ok(Math.abs(d.dw - a.dessin) <= 1 && Math.abs(d.dh - a.dessin) <= 1,
       `« ${k} » : dessine a ${d.dw} px (rayon ${a.dessin / 3} x 3 = ${a.dessin})`);
  });

  /* ---- ET SURTOUT : ELLES NE SE RESSEMBLENT PLUS ----
   * Chacune de ces mesures peut etre juste separement et le resultat rester
   * ce qu'on voulait fuir — quatre creatures de meme taille a l'ecran. */
  if (peint.nuee && peint.gardien && peint.lime && peint.colosse) {
    ok(peint.gardien.dw > peint.nuee.dw * 5,
       `le gardien (${peint.gardien.dw} px) ecrase la nuee (${peint.nuee.dw} px)`);
    ok(peint.colosse.dw > peint.lime.dw * 2,
       `le colosse (${peint.colosse.dw} px) fait plus du double du lime (${peint.lime.dw} px)`);
    const tailles = [peint.nuee.dw, peint.lime.dw, peint.colosse.dw, peint.gardien.dw];
    ok(new Set(tailles).size === 4, 'les quatre tailles sont bien quatre : ' + tailles.join(', '));
  }

  ok(erreurs.length === 0, 'aucune erreur de page' + (erreurs.length ? ' : ' + erreurs[0] : ''));

  await nav.close(); site.stop();
  console.log('\nmonstres_taille.test.js : ' + n + ' verifications, ' + rates + ' ratees');
  process.exit(rates ? 1 : 0);
})();
