/* LE BOUTON MAISON, AU TELEPHONE.
 *
 * « Verifie qu il fonctionne pour retourner au nexus. »
 *
 * Un bouton peut echouer de trois facons, et une seule se voit en lisant le
 * code :
 *
 *   1. il ne s affiche pas — la condition d affichage est fausse ;
 *   2. il s affiche mais quelque chose est DEVANT — le joystick, le bouton de
 *      tir, les fioles tactiles. Le clic part alors dans l autre element, et
 *      rien dans le code du bouton ne le dirait ;
 *   3. il s affiche, il recoit le clic, et le retour ne se fait pas.
 *
 * On les verifie donc a l ecran, sur un vrai viewport de telephone :
 * `elementFromPoint` au centre du bouton repond QUI recevrait le doigt.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('maison_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('maison_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/statmax-');
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
  const P = require(path.join(SERVEUR, 'personnages'));
  const B = require(path.join(SERVEUR, 'boutique'));
  await new Promise((r) => setTimeout(r, 1400));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const w = ethers.Wallet.createRandom();
  const erreurs = [];

  const p = await nav.newPage({ viewport: { width: 412, height: 780 }, isMobile: true, hasTouch: true });
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

  /* ---- ON ENTRE DANS LE MONDE PAR LA SOCKET ----
   * L essai porte sur le BOUTON, pas sur le portail du Nexus : y aller a pied
   * ferait dependre le resultat d un trajet qui n a rien a voir avec ce qu on
   * mesure. Le message est celui que le portail envoie, mot pour mot — la
   * page bascule donc exactement comme si on l avait franchi. */
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForFunction(() => window.__s[0].__m.some((m) => m.type === 'realmEntre'),
                          { timeout: 15000 });
  ok(true, 'on est dans le monde de combat');
  await p.waitForTimeout(900);

  /* ================== LE BOUTON, AU DOIGT ================== */
  console.log('\n-- le bouton maison sur un ecran de telephone --');
  const vu = () => p.evaluate(() => {
    const b = document.getElementById('nxMaison');
    if (!b) return { existe: false };
    const r = b.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const dessus = document.elementFromPoint(cx, cy);
    const st = getComputedStyle(b);
    return {
      existe: true, on: b.classList.contains('on'),
      affiche: st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0,
      x: Math.round(r.x), y: Math.round(r.y),
      l: Math.round(r.width), h: Math.round(r.height),
      dansEcran: r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      /* QUI recevrait le doigt. C est la seule question qui compte : un bouton
         parfaitement affiche sous le joystick ne sert a rien. */
      recoit: dessus ? (dessus.id || dessus.className || dessus.tagName) : null,
      cest_lui: !!(dessus && (dessus === b || b.contains(dessus))),
    };
  });

  const av = await vu();
  console.log('   ' + JSON.stringify(av));
  ok(av.existe, 'le bouton existe dans la page');
  ok(av.on && av.affiche, 'il est AFFICHE dans le monde de combat au doigt');
  ok(av.dansEcran, `et entierement dans l ecran (${av.x},${av.y} ${av.l}x${av.h})`);
  ok(av.l >= 44 && av.h >= 44, `assez grand pour un pouce (${av.l}x${av.h})`);
  /* ---- CE QUI SE VOIT NULLE PART AILLEURS ----
   * Le joystick, le bouton de tir et les fioles tactiles vivent tous dans ce
   * coin. Un seul d entre eux pose par-dessus, et le doigt ne touche jamais
   * la maison — sans qu une seule ligne du code du bouton soit fausse. */
  ok(av.cest_lui, `rien ne le recouvre : le doigt tombe sur LUI (${av.recoit})`);

  /* ================== ET IL RAMENE VRAIMENT ================== */
  console.log('\n-- on appuie --');
  await p.evaluate(() => { window.__s[0].__out = window.__s[0].__out || []; });
  const avantSorties = await p.evaluate(() =>
    window.__s[0].__m.filter((m) => m.type === 'realmSorti').length);
  await p.click('#nxMaison');
  await p.waitForTimeout(900);
  const ap = await vu();
  ok(!ap.on, 'apres l appui, le bouton disparait : on n est plus dans le monde');
  /* Le serveur doit AVOIR ETE prevenu : rester dans sa simulation en croyant
     etre rentre laisserait un personnage immobile a se faire tirer dessus. */
  const sorti = await p.evaluate(() =>
    window.__s[0].__m.filter((m) => m.type === 'realmSorti').length);
  ok(sorti > avantSorties, `et le serveur a confirme la sortie (${sorti})`);
  /* On est bien dans le Nexus : sa planche se redessine. */
  const auNexus = await p.evaluate(() => {
    window.__nex = 0;
    const C = CanvasRenderingContext2D.prototype;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      if (u.indexOf('obj_portal') >= 0 || u.indexOf('obj_fountain') >= 0) window.__nex++;
      return di.apply(this, arguments);
    };
    return true;
  });
  await p.waitForTimeout(700);
  const n2 = await p.evaluate(() => window.__nex || 0);
  ok(n2 > 0, `et le Nexus se redessine (${n2} dessins de ses objets)`);

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nmaison_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
