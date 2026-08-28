'use strict';
/*
 * UN SEUL AVATAR A L'ECRAN.
 *
 * ---- ce qui a ete signale ----
 *
 * « sur certaines pages je le vois afficher en double en haut, le bouton
 * profil » — capture d'une table de Three Card, deux pastilles identiques, une
 * a chaque bout de la barre, avec la meme photo et le meme compte.
 *
 * ---- pourquoi il y en avait deux ----
 *
 * Vingt pages posent le LEUR dans leur en-tete (`#gxProfil`). Trois seulement
 * masquaient celui de `stakebubble.js`, a la main, chacune avec sa regle. Les
 * dix-sept autres montraient les deux depuis toujours — mais ca ne se voyait
 * pas : le notre portait le visage, le leur un bonhomme gris, et deux choses
 * differentes se lisent comme deux boutons. Depuis que les deux portent le
 * meme visage, ce sont deux fois le meme bouton cote a cote.
 *
 * ---- pourquoi cet essai se connecte pour de vrai ----
 *
 * Le bouton de `stakebubble.js` ne se pose QU'APRES l'authentification. Un
 * essai qui ne se connecte pas ne verrait jamais le doublon : il compterait un
 * avatar et se declarerait content — exactement le genre de vert qui ne
 * protege de rien. On ouvre donc un vrai serveur, on signe une vraie
 * connexion, et l'on se donne un visage par le meme message que le panneau.
 */
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('avatar_double.test.js : playwright absent — essai saute'); process.exit(0); }

const SITE = __dirname;
const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('avatar_double.test.js : serveur absent — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json' };

/* Une par famille : le hall, une table, un jeu a part, le monde, l'accueil. */
const PAGES = ['swoge_casino.html', 'swoge_blackjack.html', 'plinko.html',
               'games.html', 'index.html', 'nexus.html', 'swogebet.html'];

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/avdbl-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.VAULT_ADDRESS = '0x1111111111111111111111111111111111111111';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  require(path.join(SERVEUR, 'server'));
  const { ethers } = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  await new Promise((r) => setTimeout(r, 1300));

  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  for (const page of PAGES) {
    const p = await nav.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await p.addInitScript(() => {
      window.__s = [];
      const N = window.WebSocket;
      function C(u, pr) { const x = (pr === undefined) ? new N(u) : new N(u, pr); x.__m = [];
        x.addEventListener('message', (e) => { try { x.__m.push(JSON.parse(e.data)); } catch (y) {} });
        window.__s.push(x); return x; }
      C.prototype = N.prototype;
      ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k) => { C[k] = N[k]; });
      window.WebSocket = C;
    });
    await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p.goto(`http://127.0.0.1:${srv.address().port}/${page}?server=ws://127.0.0.1:${port}`,
                 { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 25000 });
    const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello'))
      .__m.find((m) => m.type === 'hello').loginNonce);
    const w = ethers.Wallet.createRandom();
    const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
    const sig = await w.signMessage(msg);
    await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello'))
      .send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
    await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
    await p.waitForTimeout(1400);
    /* Un visage, par le meme message que le panneau : sans lui les deux
       boutons restent gris, et le doublon se voit moins — mais il est la. */
    await p.evaluate(() => {
      const s = (window.__s || []).find((x) => x.__m.some((m) => m.type === 'auth'));
      if (s) s.send(JSON.stringify({ type: 'setProfile', avatar: 'b3' }));
    });
    await p.waitForTimeout(1500);

    const v = await p.evaluate(() => {
      const tous = [...document.querySelectorAll('#gxProfil, .swpb')];
      const vus = tous.filter((x) => x.offsetParent !== null
        && getComputedStyle(x).display !== 'none'
        && getComputedStyle(x).visibility !== 'hidden');
      return { poses: tous.length, vus: vus.length,
               quoi: vus.map((x) => x.id || x.className),
               aSonAvatar: !!document.getElementById('gxProfil'),
               visage: vus.map((x) => /badge-3/.test(getComputedStyle(x).backgroundImage)) };
    });
    console.log(`\n-- ${page} --`);
    ok(v.aSonAvatar, 'la page porte son propre avatar');
    ok(v.vus === 1, `un seul avatar visible (${v.vus} : ${JSON.stringify(v.quoi)})`);
    ok(v.visage.every(Boolean), 'et il porte bien le visage du compte');
    /* Le notre reste DANS la page : c'est la poignee du tiroir, et le menu
       s'en sert pour l'ouvrir avant de choisir une rangee. Le retirer aurait
       casse l'ouverture par script. */
    ok(v.poses >= 2, `le bouton du tiroir reste pose, masque (${v.poses} en tout)`);
    await p.close();
  }

  await nav.close(); srv.close();
  console.log(rates ? `\navatar_double.test.js : ${rates} echec(s) sur ${n}\n`
                    : `\navatar_double.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
