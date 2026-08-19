/* LE DEPOT QUI NE DISAIT RIEN — banc d'essai permanent.
 *
 * ---- ce qui s'est passe ----
 *
 * Un joueur connecte PAR E-MAIL, dans le navigateur interne de Telegram, a
 * signale que « Deposit and play » ne faisait RIEN : ni erreur, ni
 * confirmation, rien du tout. Ce n'etait pas un message peint derriere la
 * barre du bas (ca, c'etait la fois d'avant) : c'etait le portefeuille qui ne
 * repondait NI oui NI non.
 *
 * `SwogePrivy.restore()` ouvre une iframe cachee chez Privy et attend qu'elle
 * reponde. Quand cette iframe ne peut pas fonctionner — les navigateurs
 * embarques des applications cloisonnent le stockage des tiers — la promesse
 * ne se resout jamais et ne se rejette jamais. Or `.catch()` ne rattrape pas
 * une promesse qui ne finit pas : tout le depot vivait derriere un `.then()`
 * qui n'arrivait jamais, et le bouton restait grise et muet pour toujours.
 *
 * ---- ce que ce fichier verrouille ----
 *
 * 1. ON PARLE TOUT DE SUITE. Un message apparait dans la seconde qui suit le
 *    clic, avant toute attente — sinon le premier signe de vie dependrait de
 *    la reponse du portefeuille, c'est-a-dire de la chose qui peut ne jamais
 *    venir.
 * 2. ON NE SE TAIT JAMAIS ENTRE-TEMPS. Le message d'attente reste affiche
 *    jusqu'au denouement. Un mot puis huit secondes de silence, c'est le meme
 *    symptome un peu plus tard.
 * 3. ON FINIT TOUJOURS PAR CONCLURE. Meme si le portefeuille ne repond jamais,
 *    le bouton redevient cliquable et le joueur recoit une explication ET une
 *    sortie.
 * 4. UN PORTEFEUILLE QUI REPOND N'EST PAS PENALISE. Le garde-fou ne doit pas
 *    couper un portefeuille lent mais vivant.
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
if (!chromium) { console.log('depot_muet.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('depot_muet.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

/* Un serveur de fichiers minuscule pour la page : on veut la VRAIE page, avec
   ses vrais scripts, pas une reconstitution. */
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

/* Le portefeuille de fabrication. `delai` en millisecondes, ou `null` pour un
   portefeuille qui ne repond JAMAIS — le cas du signalement. */
function fauxPrivy(delai) {
  const reponse = delai === null
    ? 'return new Promise(function () {});'
    : `return new Promise(function (r) { setTimeout(function () {
         window.__adr = '0x2222222222222222222222222222222222222222'; r(window.__adr); }, ${delai}); });`;
  return `window.SwogePrivy = {
    init: function () {},
    restore: function () { window.__restore = (window.__restore||0)+1; ${reponse} },
    getProvider: function () { return { request: function (q) {
      if (q.method === 'eth_chainId') return Promise.resolve('0x1237');
      if (q.method === 'net_version') return Promise.resolve('4663');
      if (q.method === 'eth_accounts') return Promise.resolve([window.__adr]);
      return Promise.reject(new Error('pas de chaine dans cet essai'));
    }, on: function () {}, removeListener: function () {} }; },
    getAddress: function () { return window.__adr || null; },
    isLoggedIn: function () { return !!window.__adr; },
    logout: function () {}, sendCode: function () { return Promise.resolve(); },
    verifyCode: function () { return Promise.resolve(null); }
  };`;
}

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/dmuet-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  /* Sans coffre, le depot s'arrete avant meme de chercher le portefeuille :
     l'essai ne verrait jamais le defaut qu'il traque. */
  process.env.VAULT_ADDRESS = '0x1111111111111111111111111111111111111111';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  await new Promise((r) => setTimeout(r, 1200));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* Un joueur, jusqu'au panneau de depot ouvert et le montant saisi. */
  async function jusquAuDepot(privy) {
    const p = await nav.newPage({ viewport: { width: 420, height: 880 } });
    await p.route('**/privy-swoge.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: privy }));
    await p.addInitScript(function () {
      window.__s = [];
      const N = window.WebSocket;
      function C(u, pr) { const s = (pr === undefined) ? new N(u) : new N(u, pr); s.__m = [];
        s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
        window.__s.push(s); return s; }
      C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
      window.WebSocket = C;
      try { localStorage.setItem('swogeAuth', 'email'); } catch (e) {}
      /* Le navigateur interne de Telegram, sur Android. */
      window.TelegramWebviewProxy = { postEvent: function () {} };
    });
    await p.goto(`http://127.0.0.1:${site.port}/games.html?server=ws://127.0.0.1:${port}`,
                 { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
    const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
    const w = ethers.Wallet.createRandom();
    const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
    const sig = await w.signMessage(msg);
    await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
    await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
    await p.waitForTimeout(1200);
    await p.evaluate(() => { document.querySelector('#menu a[data-panel="dep"]').click(); });
    await p.waitForTimeout(600);
    await p.evaluate(() => { document.getElementById('swcDAmt').value = '100'; });
    return p;
  }

  const lis = (p) => p.evaluate(() => {
    const m = document.querySelector('.swc-msg');
    const b = document.getElementById('swcDGo');
    const visible = m && getComputedStyle(m).opacity !== '0';
    return { texte: visible ? m.textContent.trim() : '', mort: !!(b && b.disabled),
             sortie: !!(m && visible && m.querySelector('button, a')) };
  });

  // ============ 1. LE PORTEFEUILLE QUI NE REPOND JAMAIS ============
  {
    console.log('\n-- le portefeuille ne repond jamais (le cas signale) --');
    const p = await jusquAuDepot(fauxPrivy(null));
    const t0 = Date.now();
    await p.click('#swcDGo');

    await p.waitForTimeout(900);
    const tot = await lis(p);
    ok(tot.texte.length > 0, 'un message apparait dans la seconde qui suit le clic : ' + JSON.stringify(tot.texte));

    /* ON NE SE TAIT PAS. On echantillonne pendant toute l'attente : un seul
       silence suffit a faire croire que le bouton est casse. */
    let muets = 0, echantillons = 0;
    while (Date.now() - t0 < 11000) {
      await p.waitForTimeout(700);
      const e = await lis(p);
      echantillons++;
      if (!e.texte) muets++;
    }
    ok(muets === 0, `aucun silence pendant l attente (${muets} sur ${echantillons} relevés muets)`);

    /* ON CONCLUT. */
    let fin = null;
    for (let i = 0; i < 40 && !fin; i++) {
      await p.waitForTimeout(500);
      const e = await lis(p);
      if (!e.mort) fin = e;
    }
    ok(!!fin, 'le bouton redevient cliquable meme si le portefeuille ne repond jamais');
    if (fin) {
      ok(fin.texte.length > 0, 'et le joueur recoit une explication : ' + JSON.stringify(fin.texte.slice(0, 120)));
      ok(fin.sortie, 'avec une SORTIE a toucher, pas seulement un constat');
      ok(/wallet/i.test(fin.texte), 'qui parle bien du portefeuille');
      /* La phrase n'est pas coupee au milieu du conseil. */
      ok(!/\bsw$|\bswol$|\bswolee$/.test(fin.texte.trim()),
         'et elle n est pas tronquee au milieu du conseil');
    }
    await p.close();
  }

  // ============ 2. UN PORTEFEUILLE LENT MAIS VIVANT PASSE ============
  {
    console.log('\n-- un portefeuille lent (2 s) mais vivant --');
    const p = await jusquAuDepot(fauxPrivy(2000));
    await p.click('#swcDGo');
    let fin = null;
    for (let i = 0; i < 30 && !fin; i++) {
      await p.waitForTimeout(400);
      const e = await lis(p);
      if (!e.mort && e.texte) fin = e;
    }
    ok(!!fin, 'le depot aboutit a une conclusion');
    if (fin) {
      /* Il ne doit PAS avoir ete arrete par le garde-fou : celui-la parle du
         portefeuille qui ne repond pas. Ici il a repondu — la suite echoue
         pour une autre raison (pas de chaine dans cet essai), et c'est bien
         la preuve qu'on est alle plus loin. */
      ok(!/did not answer/i.test(fin.texte),
         'le garde-fou ne coupe pas un portefeuille qui repond : ' + JSON.stringify(fin.texte.slice(0, 100)));
    }
    const appels = await p.evaluate(() => window.__restore || 0);
    ok(appels >= 1, 'le portefeuille a bien ete sollicite (' + appels + ' fois)');
    await p.close();
  }

  await nav.close(); site.stop();
  console.log(rates ? `\ndepot_muet.test.js : ${rates} essai(s) rate(s) sur ${n}\n`
                    : `\ndepot_muet.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
