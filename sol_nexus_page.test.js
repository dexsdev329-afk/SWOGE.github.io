/* LE SAC POSE DANS LE HALL, VU DEPUIS LA PAGE.
 *
 * Le serveur tenait bien les sacs du Nexus, la page les dessinait bien, et
 * pourtant le sol restait vide : la PLANCHE des sacs n'arrivait qu'avec
 * `chargeEffets()`, appele en entrant dans le monde de combat. Celui qui
 * jetait une piece dans le hall sans jamais s'etre battu n'avait aucune
 * image, et le dessin renoncait a sa premiere ligne.
 *
 * Rien dans les essais existants ne pouvait le voir : ceux du serveur
 * verifient les REGLES du sol (rien ne se duplique, rien ne se perd, la
 * distance se mesure sur la position du serveur), et ceux de la page passent
 * tous par le monde de combat avant de regarder un sac.
 *
 * Cet essai-ci ne sort donc JAMAIS du Nexus. C'est toute sa raison d'etre.
 *
 * Ce qui compte, dans l'ordre :
 *
 * 1. LE SAC SE DESSINE. On espionne `drawImage` : la planche des sacs doit
 *    passer a l'ecran. Compter les sacs recus ne prouverait rien — c'etait
 *    deja le cas quand le sol paraissait vide.
 * 2. SANS ETRE PASSE PAR LE COMBAT. On verifie qu'on est bien reste dans le
 *    hall : un essai qui entrerait dans le monde chargerait la planche par la
 *    porte d'a cote et ne verifierait plus rien.
 * 3. ON PEUT LE REPRENDRE. Un sac qu'on voit et qu'on ne peut pas ramasser
 *    serait une piece perdue.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('sol_nexus_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('sol_nexus_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/solnexpage-');
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
  const piece = B.ITEMS_DROP.find((o) => o.rarete === 'commun');
  q.sac = {}; q.sac[piece.id] = 1; q.sacCases = null;
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'sac' })));
  await p.waitForTimeout(500);

  /* ---- L'ESPION ----
   * On regarde ce que la page DESSINE, pas ce qu'elle a recu. C'est toute la
   * difference entre « le serveur m'a envoye un sac » et « je vois un sac » —
   * et c'est exactement entre ces deux-la que le defaut vivait. */
  await p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionSac) return;
    C.__espionSac = true;
    window.__sacsDessines = 0;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      if (u.indexOf('objets/sacs') >= 0) window.__sacsDessines++;
      return di.apply(this, arguments);
    };
  });
  await p.waitForTimeout(400);
  const avant = await p.evaluate(() => window.__sacsDessines);

  /* ================== 1. ON RESTE DANS LE HALL ================== */
  console.log('\n-- on ne sort pas du hall --');
  const scene = await p.evaluate(() => {
    /* La page ne publie pas sa scene ; on la lit sur ce qu'elle affiche. Le
       monde de combat remplace le panneau du hall par la barre de vie. */
    const v = document.getElementById('nxVie');
    return { combat: !!(v && v.offsetParent), sacs: window.__sacsDessines };
  });
  ok(!scene.combat, 'on est bien dans le Nexus, pas dans le monde de combat');
  ok(avant === 0, `et rien ne dessine encore de sac (${avant})`);

  /* ================== 2. ON JETTE, ET ON VOIT ================== */
  console.log('\n-- on jette une piece --');
  await p.evaluate((id) => window.__s[0].send(JSON.stringify({ type: 'nexusDepose', item: id })), piece.id);
  await p.waitForTimeout(1400);
  const pose = await p.evaluate(() => ({
    dessines: window.__sacsDessines,
    recus: (window.__s[0].__m.filter((m) => m.type === 'nexusEtat' && (m.sacs || []).length).length),
    refus: (window.__s[0].__m.find((m) => m.type === 'nexusDepose') || {}).refus || null,
  }));
  ok(!pose.refus, `le serveur accepte le depot (${pose.refus || 'aucun refus'})`);
  ok(pose.recus > 0, `et la page recoit bien le sac (${pose.recus} etat(s) avec un sac)`);
  /* LE COEUR DE L'ESSAI. Les deux lignes du dessus etaient deja vertes quand
     le sol paraissait vide : c'est celle-ci qui manquait. */
  ok(pose.dessines > 0, `LE SAC EST DESSINE (${pose.dessines} fois)`);

  /* ================== 3. ET ON PEUT LE REPRENDRE ================== */
  console.log('\n-- et on le reprend --');
  const auSol = () => moteur ? null : null;
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'nexusRamasse' })));
  await p.waitForTimeout(900);
  const repris = await p.evaluate(() => {
    const m = window.__s[0].__m.filter((x) => x.type === 'nexusRamasse').pop();
    return m ? { refus: m.refus || null } : null;
  });
  ok(repris && !repris.refus,
     `on ramasse ce qu'on a jete (${repris ? repris.refus || 'pris' : 'aucune reponse'})`);
  ok(moteur._p(w.address).sac[piece.id] === 1,
     'et la piece est revenue dans le sac');

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nsol_nexus_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
