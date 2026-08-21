/* L ETAL NE SE ROUVRE PAS SOUS LES DOIGTS.
 *
 * « Quand on ferme, il se reouvre car on est sur le shop. »
 *
 * La condition d ouverture etait « on est dessus ET il est ferme » — et
 * fermer la rendait vraie a nouveau. La croix marchait donc parfaitement, et
 * elle etait annulee une demi-seconde plus tard : ce qui se lit exactement
 * comme un bouton mort. On ne pouvait pas s ecarter de l etal sans voir la
 * boutique clignoter.
 *
 * Deux conditions doivent etre reunies pour rouvrir tout seul, et cet essai
 * les separe parce qu elles couvrent deux cas differents :
 *
 *   — s etre ECARTE de l etal depuis la fermeture. C est la regle que le
 *     coffre avait deja, et c est elle qui resout le cas signale ;
 *   — et DIX SECONDES ecoulees, ce qui couvre le rebond de celui qui longe
 *     l etal en repartant.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('etal_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('etal_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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

  /* On vise l etal a l endroit ou il est DESSINE : compter des secondes de
     marche supposerait une vitesse et une taille de carte. */
  await p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionE) return;
    C.__espionE = true;
    window.__moi = null; window.__etal = null;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      if (u.indexOf('obj_market_stall') >= 0 && arguments.length >= 5) {
        window.__etal = { x: arguments[1] + arguments[3] / 2, y: arguments[2] + arguments[4] };
      }
      if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
          && arguments[7] === 150 && arguments[8] === 150) {
        window.__moi = { x: Math.round(arguments[5] + 75), y: Math.round(arguments[6] + 130) };
      }
      return di.apply(this, arguments);
    };
  });
  const marche = async (t, ms) => {
    await p.keyboard.down(t); await p.waitForTimeout(ms);
    await p.keyboard.up(t); await p.waitForTimeout(180);
  };
  const ouvert = () => p.evaluate(() =>
    document.getElementById('nxShopVoile').classList.contains('on'));

  /* On marche jusqu a l etal jusqu a ce qu il s ouvre TOUT SEUL : c est la
     l ouverture automatique dont on parle. */
  for (let k = 0; k < 30 && !(await ouvert()); k++) {
    const v = await p.evaluate(() => ({ moi: window.__moi, e: window.__etal }));
    if (!v.moi || !v.e) { await marche('ArrowLeft', 200); continue; }
    const ex = v.e.x - v.moi.x, ey = v.e.y - v.moi.y;
    if (Math.abs(ex) < 70 && Math.abs(ey) < 70) { await p.waitForTimeout(600); continue; }
    if (Math.abs(ex) > Math.abs(ey)) await marche(ex > 0 ? 'ArrowRight' : 'ArrowLeft', 320);
    else await marche(ey > 0 ? 'ArrowDown' : 'ArrowUp', 320);
  }
  ok(await ouvert(), 'marcher sur l etal ouvre la boutique tout seul');

  /* ================== 1. LA CROIX TIENT ================== */
  console.log('\n-- on ferme, et on RESTE dessus --');
  await p.evaluate(() => document.querySelector('#nxShopVoile .nxcf-x').click());
  await p.waitForTimeout(200);
  ok(!(await ouvert()), 'la croix ferme la boutique');
  /* C EST LE CAS SIGNALE : sans le garde-fou, elle se rouvrait a la demi-
     seconde suivante. On attend BIEN plus que ca, sans bouger. */
  await p.waitForTimeout(2500);
  ok(!(await ouvert()), 'deux secondes et demie plus tard, toujours fermee');
  await p.waitForTimeout(2500);
  ok(!(await ouvert()), 'cinq secondes : toujours fermee');
  /* ---- ET MEME AU-DELA DES DIX SECONDES ----
   * Tant qu on n a pas quitte l etal, elle ne rouvre pas. Le repos seul
   * laisserait la boutique revenir a la onzieme seconde, sur quelqu un qui
   * n a simplement pas bouge. */
  await p.waitForTimeout(6500);
  ok(!(await ouvert()),
     'et passe les dix secondes elle reste fermee : on n a pas quitte l etal');

  /* ================== 2. ON S ECARTE, PUIS ON REVIENT ================== */
  console.log('\n-- on part, on revient --');
  /* On s ecarte franchement — au-dela du rayon du lieu. */
  await marche('ArrowRight', 1400);
  await p.waitForTimeout(300);
  ok(!(await ouvert()), 's ecarter ne rouvre rien');
  /* En revenant APRES le repos, elle se rouvre : c est le comportement
     normal, et le blocage ne doit pas etre definitif. */
  for (let k = 0; k < 20 && !(await ouvert()); k++) {
    const v = await p.evaluate(() => ({ moi: window.__moi, e: window.__etal }));
    if (!v.moi || !v.e) { await marche('ArrowLeft', 200); continue; }
    const ex = v.e.x - v.moi.x, ey = v.e.y - v.moi.y;
    if (Math.abs(ex) < 70 && Math.abs(ey) < 70) { await p.waitForTimeout(600); continue; }
    if (Math.abs(ex) > Math.abs(ey)) await marche(ex > 0 ? 'ArrowRight' : 'ArrowLeft', 320);
    else await marche(ey > 0 ? 'ArrowDown' : 'ArrowUp', 320);
  }
  ok(await ouvert(), 'en revenant plus tard, elle s ouvre a nouveau');

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\netal_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
