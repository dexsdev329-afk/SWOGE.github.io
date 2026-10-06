'use strict';
/*
 * LE VERROU FACE ID, DANS LA PAGE (swoge_wallet.html) — on verifie le CABLAGE,
 * pas la crypto (couverte par wallet_passkey.test.js cote serveur) :
 *
 *   A. une reprise SILENCIEUSE d'un portefeuille qui a pose un passkey remet
 *      le VOILE ; le deverrouillage Face ID le retire. Et SURTOUT : meme voile
 *      posé, le signataire est la — le verrou CACHE l'ecran, il ne garde JAMAIS
 *      les fonds (toute transaction fait toujours signer le portefeuille) ;
 *   B. depuis la carte SECURITY, l'interrupteur POSE un passkey (signature du
 *      portefeuille, puis ceremonie WebAuthn) et passe a « on » ;
 *   C. FAIL-OPEN : si le navigateur ou le script @simplewebauthn ne sont pas la,
 *      AUCUN voile, AUCUNE carte — le portefeuille marche comme avant. C'est la
 *      regle du projet : « rien ne s'affiche, et le portefeuille marche comme
 *      avant ».
 *
 * La ceremonie WebAuthn (navigator.credentials) ne peut pas tourner sans vrai
 * appareil : on remplace le script @simplewebauthn/browser par un faux qui
 * resout, et le serveur par des routes qui repondent. On ne teste donc pas la
 * biometrie elle-meme, mais notre enchainement et nos gardes d'affichage.
 *
 * Un fichier a part, court : swoge_wallet.html est long, et cette garde-la —
 * « le verrou ne garde pas les fonds, et il s'efface si le navigateur ne sait
 * pas faire » — doit pouvoir se relancer seule.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
const ETHERS = '/home/user/swoge-pusher-server.github.io/node_modules/ethers/dist/ethers.umd.min.js';
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('wallet_passkey_page.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
            '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };

const MOI = '0x00000000000000000000000000000000000a11ce';

/* Le faux @simplewebauthn/browser : il resout sans toucher a aucun appareil.
   On le pose par addInitScript (avant tout script de page) ET on BLOQUE le vrai
   bundle CDN (sinon il ecraserait notre faux) — voir poseRoutes. */
function poseWebauthn(page) {
  return page.addInitScript(() => {
    window.PublicKeyCredential = window.PublicKeyCredential || function () {};
    const faux = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: {} };
    window.SimpleWebAuthnBrowser = {
      startAuthentication: function () { return Promise.resolve(faux); },
      startRegistration: function () { return Promise.resolve(faux); },
    };
  });
}

/* Un faux portefeuille d'extension : adresse connectee, signature bidon (le
   serveur est muet ici, la signature n'a qu'a ne pas jeter). */
function poseEthereum(page) {
  return page.addInitScript(([moi]) => {
    try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
    window.ethereum = {
      isMetaMask: true,
      request: async (a) => {
        if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
        if (a.method === 'eth_chainId') return '0x1237';
        if (a.method === 'net_version') return '4663';
        if (a.method === 'personal_sign') return '0x' + '11'.repeat(65);
        if (a.method === 'wallet_switchEthereumChain') return null;
        return null;
      },
      on: () => {}, removeListener: () => {},
    };
  }, [MOI]);
}

/* Les routes communes : ethers local, prix et noeud muets mais polis (les
   lectures de solde sont encapsulees et ne jettent pas), et le serveur SWOGE
   reduit a ses routes passkey + un {} pour le reste. `conf` pilote la reponse
   de /etat selon le scenario. */
async function poseRoutes(page, conf) {
  /* Le vrai bundle @simplewebauthn/browser ne doit JAMAIS charger : il
     appellerait navigator.credentials (pas d'appareil ici) et ecraserait notre
     faux. On le bloque ; notre faux est pose par poseWebauthn (scenarios A/B),
     ou absent (scenario C, fail-open). Regex car le glob bute sur le « @ ». */
  await page.route(/simplewebauthn/, (r) => r.abort());
  await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
    contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
  await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
    contentType: 'application/json', body: '{"pairs":[]}' }));
  await page.route('**/rpc.mainnet.chain.robinhood.com/**', (r) => {
    let q = {}; try { q = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    const un = (m) => {
      if (m.method === 'eth_chainId') return '0x1237';
      if (m.method === 'net_version') return '4663';
      if (m.method === 'eth_blockNumber') return '0x1';
      if (m.method === 'eth_gasPrice') return '0x1';
      if (m.method === 'eth_getBalance') return '0x0';
      if (m.method === 'eth_call') return '0x' + '0'.repeat(64);
      if (m.method === 'eth_getLogs') return [];
      return null;
    };
    const b = Array.isArray(q) ? q.map((m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) }))
                               : { jsonrpc: '2.0', id: q.id, result: un(q) };
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
  });
  /* Le serveur SWOGE : routes passkey + {} pour tout le reste (ses autres
     appels de chargement sont encapsules et ne doivent pas partir au reseau). */
  await page.route('**/web-production-220a3.up.railway.app/**', (r) => {
    const u = r.request().url();
    const rep = (status, obj) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
    if (/\/wallet\/passkey\/etat$/.test(u)) return rep(200, { ok: true, actif: conf.actif });
    if (/\/wallet\/passkey\/auth\/options$/.test(u)) return rep(200, { ok: true, options: { challenge: 'defiA', allowCredentials: [] } });
    if (/\/wallet\/passkey\/auth\/verifie$/.test(u)) return rep(200, { ok: true });
    if (/\/wallet\/passkey\/inscription\/options$/.test(u)) return rep(200, { ok: true, options: { challenge: 'defiR' }, aSigner: 'SWOGE Wallet — Face ID setup\naddress: ' + MOI + '\nnonce: abc' });
    if (/\/wallet\/passkey\/inscription\/verifie$/.test(u)) return rep(200, { ok: true });
    if (/\/wallet\/passkey\/retire$/.test(u)) return rep(200, { ok: true });
    return rep(200, {});
  });
}

const vu = (page, id) => page.evaluate((i) => {
  const e = document.getElementById(i); if (!e) return null;
  return !e.hidden && getComputedStyle(e).display !== 'none';
}, id);
/* moi/signer/PK vivent dans l'IIFE de la page — pas sur window. On observe donc
   par le DOM et par window.SwogeWallet.etat() (adresse connectee). */
const adresse = (page) => page.evaluate(() => (window.SwogeWallet && window.SwogeWallet.etat) ? window.SwogeWallet.etat().adresse : null);
const attendConnecte = (page) => page.waitForFunction(
  () => { try { return !!(window.SwogeWallet && window.SwogeWallet.etat && window.SwogeWallet.etat().adresse); } catch (e) { return false; } }, null, { timeout: 15000 });

(async () => {
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    const f = path.join(SITE, u === '/' ? 'index.html' : u.replace(/^\//, ''));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end('nope'); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const port = srv.address().port;
  const base = 'http://127.0.0.1:' + port + '/swoge_wallet.html';
  const nav = await chromium.launch();

  /* ---------- A. voile a la reprise, retire par Face ID ---------- */
  {
    console.log('-- A. un passkey pose -> voile a la reprise silencieuse, Face ID le retire --');
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = []; page.on('pageerror', (e) => boum.push(String(e)));
    await poseEthereum(page);
    await poseWebauthn(page);
    await poseRoutes(page, { actif: true });
    await page.goto(base, { waitUntil: 'domcontentloaded' });

    await attendConnecte(page);
    await page.waitForFunction(() => { const v = document.getElementById('pkVerrou'); return v && !v.hidden; }, null, { timeout: 8000 });
    ok(await vu(page, 'pkVerrou'), 'la reprise d un portefeuille a passkey remet le voile (ecran cache)');

    /* Le verrou ne garde PAS les fonds : voile pose, le portefeuille reste
       PLEINEMENT connecte (adresse lue par la vitrine) — le voile cache l'ecran,
       il ne deconnecte ni ne bloque rien ; toute transaction fera signer. */
    ok((await adresse(page) || '').toLowerCase() === MOI.toLowerCase(),
       'voile pose, le portefeuille reste connecte : le verrou cache l ecran, il ne bloque pas les fonds');

    await page.click('#pkDeverrouille');
    await page.waitForFunction(() => { const v = document.getElementById('pkVerrou'); return v && v.hidden; }, null, { timeout: 8000 });
    ok(!(await vu(page, 'pkVerrou')), 'Face ID (startAuthentication + /auth/verifie) retire le voile');
    ok((await adresse(page) || '').toLowerCase() === MOI.toLowerCase(), 'apres deverrouillage, le portefeuille est toujours connecte');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ---------- B. poser un passkey depuis la carte SECURITY ---------- */
  {
    console.log('\n-- B. l interrupteur SECURITY pose un passkey (signature + WebAuthn) --');
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = []; page.on('pageerror', (e) => boum.push(String(e)));
    await poseEthereum(page);
    await poseWebauthn(page);
    await poseRoutes(page, { actif: false });
    await page.goto(base, { waitUntil: 'domcontentloaded' });

    await attendConnecte(page);
    ok(!(await vu(page, 'pkVerrou')), 'sans passkey : aucun voile');
    /* La carte SECURITY vit dans l'ecran Account : on y va (comme un doigt). */
    await page.evaluate(() => window.SwogeWallet.va('ecCompte'));
    await page.waitForTimeout(250);
    await page.waitForFunction(() => { const c = document.getElementById('pkCarte'); return c && !c.hidden; }, null, { timeout: 8000 });
    ok(await vu(page, 'pkCarte'), 'connecte + navigateur capable : la carte SECURITY s affiche dans Account');
    ok(await page.evaluate(() => document.getElementById('pkToggle').getAttribute('aria-checked') === 'false'), 'l interrupteur part sur « off »');

    await page.click('#pkToggle');
    await page.waitForFunction(() => document.getElementById('pkToggle').getAttribute('aria-checked') === 'true', null, { timeout: 8000 });
    ok(await page.evaluate(() => document.getElementById('pkToggle').getAttribute('aria-checked') === 'true'),
       'apres pose (signature + /inscription/verifie), l interrupteur passe a « on »');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ---------- C. fail-open : script absent -> ni voile ni carte ---------- */
  {
    console.log('\n-- C. @simplewebauthn absent : AUCUN voile meme avec un passkey actif (fail-open) --');
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = []; page.on('pageerror', (e) => boum.push(String(e)));
    await poseEthereum(page);
    /* Le script @simplewebauthn n'arrive jamais (bloque par poseRoutes) et on
       ne pose PAS le faux : window.SimpleWebAuthnBrowser reste indefini, donc
       pkDispo() est faux. */
    await poseRoutes(page, { actif: true });
    await page.goto(base, { waitUntil: 'domcontentloaded' });

    await attendConnecte(page);
    await page.waitForTimeout(500);
    ok(!(await vu(page, 'pkVerrou')), 'navigateur incapable : aucun voile, le portefeuille s ouvre normalement');
    ok(!(await vu(page, 'pkCarte')), 'navigateur incapable : la carte SECURITY reste cachee');
    ok((await adresse(page) || '').toLowerCase() === MOI.toLowerCase(), 'le portefeuille marche comme avant (connecte, aucun blocage)');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
