/* SWOGE BONANZA, DE BOUT EN BOUT.
 *
 * Le serveur calcule TOUT — grille, cascades, tours gratuits, gains — et la
 * page ne fait que rejouer ce qu'il envoie. C'est le seul partage qui tienne
 * pour un jeu d'argent : un joueur qui ouvre la console voit le resultat plus
 * tot, il ne le change pas.
 *
 * Cet essai le verifie EN JOUANT, contre le vrai serveur :
 *   1. la page se charge, la grille de 30 cases existe ;
 *   2. on se connecte, le bareme arrive du serveur ;
 *   3. on mise et on tourne — le solde bouge REELLEMENT du bon montant ;
 *   4. ce que la page affiche correspond a ce que le serveur a paye.
 *
 * Le point 3 est celui qui compte : un jeu qui affiche un gain sans crediter,
 * ou qui debite deux fois, ne se voit pas a l'oeil.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('bonanza_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('bonanza_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
process.on('unhandledRejection', (e) => {
  console.log('  RATE essai interrompu : ' + (e && e.message ? e.message : e));
  process.exit(1);
});

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/fiole-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  const { Game } = require(path.join(SERVEUR, 'game'));
  let moteur = null; const _p0 = Game.prototype._p;
  Game.prototype._p = function (a) { moteur = this; return _p0.call(this, a); };
  const { Realm } = require(path.join(SERVEUR, 'realm'));
  let monde0 = null; const pas0 = Realm.prototype.pas;
  Realm.prototype.pas = function (dt) { if (!this.plan) monde0 = this; return pas0.call(this, dt); };
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const M = require(path.join(SERVEUR, 'monde'));
  const P = require(path.join(SERVEUR, 'personnages'));
  await new Promise((r) => setTimeout(r, 1400));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const w = ethers.Wallet.createRandom();
  const erreurs = [];

  const p = await nav.newPage({ viewport: { width: 420, height: 860 },
                                hasTouch: true, isMobile: true });
  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) {
      const s = (pr === undefined) ? new N(u) : new N(u, pr);
      s.__m = []; s.__out = [];
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      const env = s.send.bind(s);
      s.send = function (d) { try { s.__out.push(JSON.parse(d)); } catch (x) {} return env(d); };
      window.__s.push(s); return s;
    }
    C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
    window.WebSocket = C;
  });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));

  await p.goto(`http://127.0.0.1:${site.port}/swoge_bonanza.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1000);
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForTimeout(1600);
  const addr = w.address.toLowerCase();

  /* ================== 1. LA PAGE EST LA ================== */
  console.log('\n-- la page --');
  const grille = await p.$$eval('#bzGrille .bz-c', (e) => e.length);
  ok(grille === 30, `la grille porte 30 cases (${grille})`);
  ok(await p.$('#bzSpin') !== null, 'le bouton SPIN existe');

  /* ================== 2. LE BAREME VIENT DU SERVEUR ================== */
  console.log('\n-- le bareme --');
  const bar = await p.evaluate(() => {
    const m = window.__s.flatMap((s) => s.__m).find((x) => x.type === 'auth' && x.bonanzaBareme);
    return m ? m.bonanzaBareme : null;
  });
  ok(!!bar, 'le serveur envoie le bareme a la connexion');
  if (bar) {
    ok(bar.colonnes === 6 && bar.rangees === 5, `grille 6x5 (${bar.colonnes}x${bar.rangees})`);
    ok(bar.minAmas === 8, 'huit symboles identiques pour payer');
    ok(bar.symboles.length === 9, `neuf symboles payants (${bar.symboles.length})`);
  }

  /* ================== 3. ON JOUE POUR DE VRAI ================== */
  console.log('\n-- on mise et on tourne --');
  const q = moteur._p(w.address);
  /* On joue PAR L'INTERFACE : `BZ` vit dans une IIFE, il n'est pas accessible
     depuis l'essai — et c'est tant mieux, un jeu d'argent n'a rien a exposer.
     On clique donc les jetons puis SPIN, comme un joueur. */
  const soldeAff = await p.evaluate(() => {
    const e = document.getElementById('bal') || document.querySelector('[id*=bal]');
    return e ? e.textContent.trim() : '';
  });
  console.log('     (solde affiche : ' + JSON.stringify(soldeAff) + ')');

  const jetons = await p.$$eval('#bzRail button:not([disabled])', (bs) =>
    bs.map((b) => Number(b.dataset.v)));
  ok(jetons.length > 0, 'des jetons de mise sont proposes : ' + jetons.join(', '));
  /* Le plus GROS jeton disponible : le plus petit (5) est sous le minimum de
     table (10), et la page a raison de refuser de l'envoyer. */
  const MISE = jetons.length ? Math.max.apply(null, jetons) : 0;
  if (MISE) await p.click('#bzRail button[data-v="' + MISE + '"]');
  const miseTexte = await p.evaluate(() => {
    const e = document.getElementById('bzMise');
    return e && !e.hidden ? e.textContent : '';
  });
  ok(/Bet/.test(miseTexte), 'la mise s affiche apres le clic : ' + JSON.stringify(miseTexte));

  const soldeAvant = q.balance.toString();

  /* ---- LES ROULEAUX TOURNENT-ILS VRAIMENT ? ----
   * On observe la grille pendant le tour : on veut voir des cases porter la
   * classe `tourne`, et surtout voir les IMAGES CHANGER. Sans le second
   * controle, une animation qui aurait perdu son minuteur passerait au vert :
   * les cases seraient marquees « en rotation » et parfaitement immobiles. */
  const observe = p.evaluate(() => new Promise((res) => {
    const g = document.getElementById('bzGrille');
    let tourne = 0, poses = 0;
    const vues = new Set();
    const t = setInterval(() => {
      if (g.querySelector('.bz-c.tourne')) tourne++;
      if (g.querySelector('.bz-c.pose')) poses++;
      const im = g.children[0].firstChild;
      if (im && im.getAttribute('src')) vues.add(im.getAttribute('src'));
    }, 40);
    setTimeout(() => { clearInterval(t); res({ tourne, poses, symbolesVus: vues.size }); }, 2600);
  }));
  await p.click('#bzSpin');
  const rou = await observe;
  ok(rou.tourne > 0, `des colonnes tournent pendant le tour (${rou.tourne} releves)`);
  ok(rou.symbolesVus > 2,
     `la premiere case change vraiment de symbole pendant la rotation (${rou.symbolesVus} symboles vus)`);
  ok(rou.poses > 0, `les colonnes se posent en fin de rotation (${rou.poses} releves)`);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'bonanza')),
                          { timeout: 20000 }).catch(() => {});
  const rep = await p.evaluate(() => {
    const m = window.__s.flatMap((s) => s.__m).filter((x) => x.type === 'bonanza').pop();
    const err = window.__s.flatMap((s) => s.__m).filter((x) => x.type === 'error').pop();
    if (!m) return err ? { erreur: err.error } : null;
    return { mise: m.tour.mise, payout: m.tour.payout, net: m.tour.net, multi: m.tour.multi,
             scatters: m.tour.scatters, gratuits: m.tour.toursGratuits,
             etapes: m.tour.base.etapes.length,
             premiere: m.tour.base.etapes[0] ? m.tour.base.etapes[0].grille.length : -1 };
  });
  if (rep && rep.erreur) console.log('     (le serveur refuse : ' + rep.erreur + ')');
  ok(!!rep, 'le serveur repond au spin');
  if (rep) {
    ok(rep.mise === MISE, `la mise retenue est la bonne (${rep.mise})`);
    ok(rep.premiere === 30, `la grille envoyee fait 30 cases (${rep.premiere})`);
    ok(rep.etapes >= 1, `au moins une etape de cascade (${rep.etapes})`);
    ok(rep.net === rep.payout - rep.mise, 'le net est coherent avec le gain et la mise');

    /* LE CONTROLE QUI COMPTE : le solde du serveur a bouge EXACTEMENT du net. */
    const ethers2 = require(path.join(SERVEUR, 'node_modules', 'ethers'));
    const apres = moteur._p(w.address).balance;
    const attendu = ethers2.BigNumber.from(soldeAvant)
      .sub(ethers2.utils.parseEther(String(rep.mise)))
      .add(ethers2.utils.parseEther(String(rep.payout)));
    ok(apres.eq(attendu),
       `le solde a bouge du bon montant (mise ${rep.mise}, gain ${rep.payout}, net ${rep.net})`);
  }

  /* ================== 4. LA PAGE RACONTE LA MEME CHOSE ================== */
  console.log('\n-- la page affiche ce qui a ete paye --');
  await p.waitForFunction(() => {
    const b = document.getElementById('bzSpin');
    return b && !b.disabled;
  }, { timeout: 60000 }).catch(() => {});
  const aff = await p.evaluate(() => {
    document.getElementById('bzHistBtn').click();
    return { gain: (document.getElementById('bzGain').textContent || '').trim(),
             hist: (document.getElementById('bzHist').textContent || '').trim() };
  });
  ok(aff.gain.length > 0, 'un resultat est affiche : ' + JSON.stringify(aff.gain));
  ok(/→/.test(aff.hist), 'le tour est entre dans l historique : ' + JSON.stringify(aff.hist.slice(0, 60)));
  if (rep && !rep.erreur) {
    const signe = rep.net > 0 ? '+' : '';
    ok(aff.gain.indexOf(signe) === 0 || rep.net === 0,
       'le signe affiche correspond au net du serveur (' + rep.net + ')');
  }

  ok(erreurs.length === 0, 'aucune erreur JS' + (erreurs.length ? ' : ' + erreurs[0] : ''));
  console.log('\n' + n + ' verifications, ' + rates + ' echec(s)');
  await nav.close(); site.stop();
  process.exit(rates ? 1 : 0);
})();
