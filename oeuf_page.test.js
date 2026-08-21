/* L OEUF, DU SOL AU FAMILIER — le fil entier, par la page.
 *
 * Le serveur sait faire tomber un oeuf, le ranger dans un sac et l ouvrir
 * (oeufs.test.js le verifie sur trente-six points). Ce fichier verifie
 * l autre moitie : que la PAGE le montre, et qu un double-appui l ouvre.
 *
 * C est exactement le genre de fil qu on croit branche parce que les deux
 * bouts marchent, et qui ne l est pas parce que personne ne l a suivi en
 * entier — le sac porte maintenant TROIS formes de clef au lieu de deux, et
 * six endroits les lisaient.
 *
 * 1. L OEUF SE VOIT DANS LE SAC, avec son dessin et non un carre vide.
 * 2. IL SE VOIT AU SOL, dans le sac blanc — celui pour lequel on traverse la
 *    carte.
 * 3. UN DOUBLE-APPUI L OUVRE, et le familier arrive.
 * 4. LA CASE SE LIBERE. Un oeuf ouvert qui garderait sa place serait un sac
 *    de sept places.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('oeuf_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('oeuf_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ` [${a} vs ${b}]`);

function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
              '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/oeufpage-');
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
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  await new Promise((r) => setTimeout(r, 1400));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const w = ethers.Wallet.createRandom();
  const erreurs = [];

  const p = await nav.newPage({ viewport: { width: 1100, height: 860 } });
  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) {
      const s = (pr === undefined) ? new N(u) : new N(u, pr);
      s.__m = [];
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      window.__s.push(s); return s;
    }
    C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
    window.WebSocket = C;
  });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);

  const q = moteur._p(w.address);
  q.skins = { andy: true }; q.skinActif = 'andy';
  /* On lui met l oeuf le plus rare du jeu dans le sac, et l on demande au
     serveur de renvoyer le sac — c est le chemin normal, celui qu emprunte un
     ramassage. */
  q.sacOeufs = { legendaire: 1 }; q.sacCases = null;
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'equipable' })));
  await p.waitForTimeout(700);

  /* ================== 1. DANS LE SAC ================== */
  console.log('\n-- l oeuf dans le sac --');
  const caseOeuf = () => p.evaluate(() => {
    const c = document.querySelector('#nxSac [data-oeuf]');
    if (!c) return null;
    const im = c.querySelector('img');
    return { espece: c.getAttribute('data-oeuf'), cle: c.getAttribute('data-sac'),
             src: im ? im.getAttribute('src') : null,
             /* La taille A L ECRAN : une case qui porte un dessin casse a la
                meme forme qu une case pleine, et seule l image le dit. */
             large: im ? im.naturalWidth : 0 };
  });
  let c = await caseOeuf();
  ok(!!c, 'une case du sac porte l oeuf');
  eq(c && c.cle, 'oe:legendaire', 'sous la clef que le serveur comprend');
  ok(c && /oeuf_legendaire/.test(c.src || ''), `avec SON dessin (${c && c.src})`);
  ok(c && c.large > 0, `et l image existe vraiment (${c && c.large}px de large)`);

  /* ================== 2. AU SOL ================== */
  console.log('\n-- et au sol --');
  /* On le jette : c est le chemin qui fait passer l oeuf par le sol du Nexus,
     et donc par la forme courte que la page doit savoir lire. */
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'nexusDepose', item: 'oe:legendaire' })));
  await p.waitForTimeout(900);
  const auSol = await p.evaluate(() => {
    const m = window.__s[0].__m.filter((x) => x.type === 'nexusEtat').pop();
    const s = m && (m.sacs || [])[0];
    return s ? { couleur: s.s, contenu: s.c } : null;
  });
  ok(!!auSol, 'le sol porte quelque chose');
  /* ---- SON PROPRE SAC ----
   * Il portait le BLANC, celui des reliques. Le blanc disait « traverse la
   * carte » sans dire pourquoi, et l on repartait avec un oeuf en croyant
   * courir apres une relique — c est la seule facon de decevoir avec une
   * trouvaille rare. Le nom du sac vient du SERVEUR, jamais recopie ici :
   * deux endroits qui nomment le meme sac finissent par n en nommer plus le
   * meme. */
  const sacOeuf = require(path.join(SERVEUR, 'monde')).OEUF.sac;
  eq(auSol && auSol.couleur, sacOeuf,
     'dans SON sac, qu on reconnait sans le confondre avec une relique');
  ok(sacOeuf !== 'blanc', 'et ce n est plus celui des reliques');
  /* Et la page SAIT le nommer. Un sac que la page ne connait pas s affiche
     « Loot » — le mot du sac le plus commun — sur la chose la plus rare du
     jeu. C est exactement le genre d oubli qui ne casse rien et fait passer
     a cote.
     On marche DESSUS pour que le panneau du sol s ouvre : c est la seule
     facon d avoir l etiquette a l ecran, et c est aussi le geste du joueur. */
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'nexusEtat' })));
  await p.waitForTimeout(600);
  const etiquette = await p.evaluate(() => {
    const el = document.getElementById('nxButinNom');
    const b = document.getElementById('nxButin');
    return { texte: el ? el.textContent : null, ouvert: b ? !b.hidden : false };
  });
  ok(etiquette.ouvert, 'le panneau du sol est ouvert — on est dessus');
  ok(/EGG/i.test(etiquette.texte || ''),
     `et il annonce l oeuf, pas « Loot » (${etiquette.texte})`);
  eq(auSol && auSol.contenu[0] && auSol.contenu[0].oe, 'legendaire',
     'et la page recoit l espece');
  const vu = await p.evaluate(() => {
    const el = document.querySelector('#nxButinCases img, .nxflot img');
    return el ? el.getAttribute('src') : null;
  });
  ok(/oeuf_legendaire/.test(vu || ''), `la grille du sol le dessine (${vu})`);

  /* On le reprend pour la suite. */
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'nexusRamasse', place: 0 })));
  await p.waitForTimeout(800);
  const rep = await p.evaluate(() => window.__s[0].__m.filter((x) => x.type === 'nexusRamasse').pop() || null);
  c = await caseOeuf();
  ok(!!c, 'on le remet dans le sac' + (c ? '' : ' — reponse : ' + JSON.stringify(rep)));

  /* ================== 3. ON L OUVRE ================== */
  console.log('\n-- on l ouvre --');
  const avant = moteur.familiersDe(w.address).length;
  await p.evaluate(() => {
    const el = document.querySelector('#nxSac [data-oeuf]');
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await p.waitForTimeout(900);
  const apres = moteur.familiersDe(w.address);
  eq(apres.length, avant + 1, 'un double-appui fait eclore l oeuf');
  eq(apres[0] && apres[0].espece, 'legendaire', 'et le familier est de la bonne espece');
  eq(apres[0] && apres[0].niveau, 1, 'au niveau un');
  ok(!!(apres[0] && apres[0].pouvoir), `avec son pouvoir (${apres[0] && apres[0].pouvoir && apres[0].pouvoir.nom})`);

  /* ================== 4. LA CASE SE LIBERE ================== */
  c = await caseOeuf();
  ok(!c, 'la case du sac s est liberee — un oeuf ouvert ne prend plus de place');
  eq(moteur.sacRempli(w.address), 0, 'et le sac est vide, cote serveur aussi');

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\noeuf_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
