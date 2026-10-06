'use strict';
/*
 * L'APERÇU AVANT SIGNATURE (swoge_wallet.html) — la feuille de revue REJOUE la
 * transaction en lecture seule avant que le portefeuille demande la signature.
 * On verifie le cablage dans la page (la fonction simuleTransfert vit dans
 * l'IIFE ; on l'observe par l'ecran et par un faux noeud) :
 *
 *   A. un envoi que le noeud accepte (eth_estimateGas repond) -> « expected to
 *      succeed », avec le gaz REEL lu (eth_gasPrice) ;
 *   B. un envoi que le noeud refuse (eth_estimateGas revient en erreur
 *      « execution reverted: token is paused ») -> « would FAIL », la raison
 *      affichee, AVANT toute signature ;
 *   C. la page MONTRE, elle ne decide pas : meme sur « would FAIL », le bouton
 *      « Sign and send » reste actif (une simulation n'est pas la chaine).
 *
 * Un fichier a part, court : la garde « on rejoue avant de signer, et un revert
 * se voit sans depenser de gaz » doit pouvoir se relancer seule.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
const ETHERS = '/home/user/swoge-pusher-server.github.io/node_modules/ethers/dist/ethers.umd.min.js';
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('wallet_apercu_page.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
            '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };

const MOI = '0x00000000000000000000000000000000000a11ce';
const DEST = '0x1111111111111111111111111111111111111111';
const enMot = (v) => '0x' + BigInt(v).toString(16);

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

/* Le faux noeud Robinhood : soldes garnis pour passer la porte de l'envoi, et
   eth_estimateGas pilote par `conf` — il repond (succes) ou revient en erreur
   « execution reverted: ... » (echec), exactement ce que fait un jeton en pause
   ou un honeypot qui bloque la revente. */
async function poseRoutes(page, conf) {
  await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
    contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
  await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
    contentType: 'application/json', body: '{"pairs":[]}' }));
  await page.route('**/rpc.mainnet.chain.robinhood.com/**', (r) => {
    let q = {}; try { q = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    const arr = Array.isArray(q) ? q : [q];
    const out = arr.map((m) => {
      if (m.method === 'eth_estimateGas' && conf.revert)
        return { jsonrpc: '2.0', id: m.id, error: { code: 3, message: 'execution reverted: token is paused' } };
      let res = null;
      if (m.method === 'eth_chainId') res = '0x1237';
      else if (m.method === 'net_version') res = '4663';
      else if (m.method === 'eth_blockNumber') res = '0x1';
      else if (m.method === 'eth_gasPrice') res = enMot(1000000000);      // 1 gwei
      else if (m.method === 'eth_estimateGas') res = '0x5208';            // 21000
      else if (m.method === 'eth_getBalance') res = enMot(5000000000000000000n); // 5 ETH
      else if (m.method === 'eth_call') res = '0x' + '0'.repeat(64);
      else if (m.method === 'eth_getLogs') res = [];
      return { jsonrpc: '2.0', id: m.id, result: res };
    });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.isArray(q) ? out : out[0]) });
  });
  await page.route('**/web-production-220a3.up.railway.app/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: '{}' }));
}

const texte = (page, id) => page.evaluate((i) => { const e = document.getElementById(i); return e ? e.textContent : null; }, id);
const classe = (page, id) => page.evaluate((i) => { const e = document.getElementById(i); return e ? e.className : null; }, id);
const attendConnecte = (page) => page.waitForFunction(
  () => { try { return !!(window.SwogeWallet && window.SwogeWallet.etat && window.SwogeWallet.etat().adresse); } catch (e) { return false; } }, null, { timeout: 15000 });

/* Ouvre la feuille de revue sur un envoi d'ETH et attend que le verdict tombe. */
async function ouvreRevueEnvoi(page) {
  await page.evaluate(() => window.SwogeWallet.va('ecEnvoyer'));
  await page.waitForTimeout(150);
  await page.evaluate((d) => {
    var s = document.getElementById('enJeton'); s.value = 'eth';
    document.getElementById('enDest').value = d;
    document.getElementById('enMontant').value = '0.001';
  }, DEST);
  await page.click('#enPartir');
  await page.waitForFunction(() => { const v = document.getElementById('voileRevue'); return v && !v.hidden; }, null, { timeout: 8000 });
  await page.waitForFunction(() => { const b = document.getElementById('rvSim'); return b && b.textContent !== 'checking…' && b.textContent !== '—'; }, null, { timeout: 10000 });
}

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

  /* ---------- A. le noeud accepte -> « expected to succeed » + gaz reel ---------- */
  {
    console.log('-- A. envoi accepte par le noeud : « expected to succeed » + gaz lu --');
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = []; page.on('pageerror', (e) => boum.push(String(e)));
    await poseEthereum(page);
    await poseRoutes(page, { revert: false });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await attendConnecte(page);
    await ouvreRevueEnvoi(page);

    ok(/expected to succeed/i.test(await texte(page, 'rvSim')), 'verdict vert : « expected to succeed »');
    ok(/\bbon\b/.test(await classe(page, 'rvSim')), 'le verdict porte la classe verte');
    const note = await texte(page, 'rvSimNote');
    ok(/gas/i.test(note) && /0\.000021/.test(note), 'la note donne le gaz REEL lu sur le noeud (21000 x 1 gwei)');
    ok(/not a promise/i.test(note), 'elle rappelle qu une simulation n est pas la chaine');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ---------- B. le noeud refuse -> « would FAIL » + la raison ---------- */
  {
    console.log('\n-- B. envoi refuse par le noeud (revert) : « would FAIL » + la raison --');
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = []; page.on('pageerror', (e) => boum.push(String(e)));
    await poseEthereum(page);
    await poseRoutes(page, { revert: true });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await attendConnecte(page);
    await ouvreRevueEnvoi(page);

    ok(/would fail/i.test(await texte(page, 'rvSim')), 'verdict rouge : « would FAIL »');
    ok(/\bmal\b/.test(await classe(page, 'rvSim')), 'le verdict porte la classe rouge');
    const note = await texte(page, 'rvSimNote');
    ok(/revert/i.test(note) && /paused/i.test(note), 'la raison du revert est montree AVANT la signature');
    ok(/gas for nothing/i.test(note), 'elle dit que signer depenserait du gaz pour rien');

    /* C. la page MONTRE, elle ne decide pas : le bouton reste actif. */
    ok(await page.evaluate(() => { const b = document.getElementById('rvOk'); return b && !b.disabled; }),
       'meme sur « would FAIL », « Sign and send » reste actif (la page montre, ne decide pas)');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
