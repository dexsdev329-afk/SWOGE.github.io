'use strict';
/* ============================================================================
 * PAYER UN APPEL EN USDC SUR BASE DEPUIS LA PAGE (x402_essai.html)
 *
 * La page fait, a la main, ce que fait un agent x402. Ce qu'elle DOIT tenir :
 *   1. elle lit le 402 du serveur et prend l'offre Base (USDC 0x8335…2913) ;
 *   2. le portefeuille signe une autorisation EIP-3009 dont le montant, le
 *      destinataire et le domaine (« USD Coin », v2, chaine 8453) viennent du
 *      402 — la signature se verifie et redonne l'adresse du payeur ;
 *   3. elle renvoie PAYMENT-SIGNATURE (v2 : resource, accepted, payload,
 *      extensions) et montre le resultat et le lien de la transaction ;
 *   4. une offre Base absente, un portefeuille absent, un refus du serveur :
 *      rien n'est signe ou le refus est montre tel quel, echappe ;
 *   5. rien ne deborde a 320 px ; la page est hors moteurs.
 * Portefeuille : une cle de test dans Node (ethers), jamais dans la page.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null, ethers = null;
try { chromium = require('playwright').chromium; } catch (e) {}
try { ethers = require('ethers'); } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript' };
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TRESOR = '0xE81C67c086c83997b41673e1e41e481c14D756F6';
const TYPES = { TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const de64 = (s) => JSON.parse(Buffer.from(s, 'base64').toString());

(async () => {
  if (!chromium || !ethers) { console.log('playwright ou ethers absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const W = ethers.Wallet.createRandom();

  const ouvre = async ({ largeur, sansBase, refus, sansPortefeuille } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1100, height: 900 } });
    const page = await ctx.newPage();
    const vu = { appels: [], signatures: 0, chaine: null };
    const REQ = { x402Version: 2, error: 'PAYMENT-SIGNATURE header is required',
      resource: { url: 'https://srv.example/agentic/call/scan_token', description: 'scan', mimeType: 'application/json' },
      accepts: (sansBase ? [] : [{ scheme: 'exact', network: 'eip155:8453', amount: '20000', asset: USDC, payTo: TRESOR, maxTimeoutSeconds: 120, extra: { name: 'USD Coin', version: '2' } }])
        .concat([{ scheme: 'exact', network: 'eip155:4663', amount: '21617', asset: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', payTo: TRESOR, maxTimeoutSeconds: 120, extra: { name: 'Global Dollar', version: '1' } }]),
      extensions: { bazaar: { info: { input: { type: 'http' } }, schema: {} } } };
    if (!sansPortefeuille) {
      /* Le portefeuille : la page parle EIP-1193, Node signe avec la cle de test. */
      await page.exposeFunction('__portefeuille', async (methode, params) => {
        if (methode === 'eth_requestAccounts') return [W.address];
        if (methode === 'wallet_switchEthereumChain') { vu.chaine = params[0].chainId; return null; }
        if (methode === 'eth_call') return '0x' + (5000000).toString(16);
        if (methode === 'eth_signTypedData_v4') {
          vu.signatures++;
          const t = JSON.parse(params[1]);
          vu.typed = t;
          return W._signTypedData(t.domain, { TransferWithAuthorization: t.types.TransferWithAuthorization }, t.message);
        }
        throw new Error('unsupported ' + methode);
      });
      await page.addInitScript(() => { window.ethereum = { request: ({ method, params }) => window.__portefeuille(method, params || []) }; });
    }
    await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), async (r) => {
      const q = r.request(), u = q.url();
      if (!/\/agentic\/call\/scan_token$/.test(u)) return r.abort();
      const sig = q.headers()['payment-signature'];
      vu.appels.push({ corps: JSON.parse(q.postData() || '{}'), sig: sig || null });
      if (!sig) return r.fulfill({ status: 402, headers: { 'payment-required': b64(REQ), 'access-control-expose-headers': 'payment-required, payment-response' }, contentType: 'application/json', body: '{}' });
      if (refus) return r.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ ok: false, raison: '<img src=x onerror=window.pirate=1>insufficient_funds' }) });
      const p = de64(sig);
      vu.paiement = p;
      const acc = p.accepted, a = p.payload.authorization;
      const qui = ethers.utils.verifyTypedData({ name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: USDC }, TYPES, a, p.payload.signature);
      vu.signataire = qui;
      return r.fulfill({ status: 200, headers: { 'payment-response': b64({ success: true, transaction: '0x' + 'ab'.repeat(32), network: 'eip155:8453', payer: a.from }), 'access-control-expose-headers': 'payment-required, payment-response' },
        contentType: 'application/json', body: JSON.stringify({ ok: true, outil: 'scan_token', texte: 'Token 0x8a16…: <b>Swole Doge</b> …', x402: { network: acc.network } }) });
    });
    await page.goto('http://127.0.0.1:' + port + '/x402_essai.html', { waitUntil: 'domcontentloaded' });
    return { page, vu, ctx };
  };

  console.log('-- 1. le parcours complet --');
  {
    const { page, vu, ctx } = await ouvre();
    await page.click('#connecter');
    await page.waitForFunction(() => !document.getElementById('payer').disabled);
    ok(vu.chaine === '0x2105', 'le portefeuille est mis sur Base (0x2105)');
    ok(/5 USDC/.test(await page.textContent('#solde')), 'le solde USDC sur Base est affiche');
    await page.click('#payer');
    await page.waitForSelector('#resultat:not([hidden])', { timeout: 10000 });
    ok(vu.appels.length === 2 && vu.appels.every((x) => x.corps.arguments.address === '0x8a166fb41cd659a0a43396272ff73973ce29f817'), 'deux appels : le 402 puis le paiement, memes arguments (le devis est lie aux arguments)');
    const p = vu.paiement, a = p.payload.authorization;
    ok(p.x402Version === 2 && p.accepted.network === 'eip155:8453' && p.resource.url === 'https://srv.example/agentic/call/scan_token' && p.extensions && p.extensions.bazaar,
       'PAYMENT-SIGNATURE v2 : resource, offre Base, extensions reprises du 402');
    ok(a.to === TRESOR && a.value === '20000' && a.from === W.address && /^0x[0-9a-f]{64}$/.test(a.nonce), 'autorisation : la tresorerie, 20000 (0,02 USDC), le payeur, un nonce de 32 octets');
    const s = Math.floor(Date.now() / 1000);
    ok(Number(a.validAfter) <= s && Number(a.validBefore) > s && Number(a.validBefore) <= s + 120, 'fenetre de validite dans le maxTimeoutSeconds du 402');
    ok(vu.signataire === W.address, 'la signature se verifie avec le domaine « USD Coin » v2, chaine 8453 : elle redonne le payeur');
    ok(vu.typed.domain.verifyingContract === USDC && vu.typed.domain.chainId === 8453, 'le domaine signe designe l USDC de Base');
    ok(/basescan\.org\/tx\/0x(ab){32}/.test(await page.getAttribute('#tx a', 'href')), 'le lien de la transaction pointe vers BaseScan');
    ok((await page.textContent('#sortie')).includes('<b>Swole Doge</b>') && (await page.$('#sortie b')) === null, 'le resultat est montre en texte, jamais interprete');
    await ctx.close();
  }

  console.log('\n-- 2. ce qui ne signe rien --');
  {
    const { page, vu, ctx } = await ouvre({ sansBase: true });
    await page.click('#connecter');
    await page.waitForFunction(() => !document.getElementById('payer').disabled);
    await page.click('#payer');
    await page.waitForFunction(() => /Not paid/.test(document.getElementById('statut').textContent));
    ok(vu.signatures === 0 && /does not offer Base/.test(await page.textContent('#statut')), 'sans offre Base : rien n est signe, et la page le dit');
    await ctx.close();
  }
  {
    const { page, ctx } = await ouvre({ sansPortefeuille: true });
    await page.click('#connecter');
    ok(/No wallet found/.test(await page.textContent('#statut')), 'sans portefeuille : la page dit d ouvrir le navigateur du wallet');
    await ctx.close();
  }
  {
    const { page, ctx } = await ouvre({ refus: true });
    await page.click('#connecter');
    await page.waitForFunction(() => !document.getElementById('payer').disabled);
    await page.click('#payer');
    await page.waitForFunction(() => /Not paid/.test(document.getElementById('statut').textContent));
    ok(/insufficient_funds/.test(await page.textContent('#statut')) && !(await page.evaluate(() => window.pirate)), 'un refus du serveur est montre tel quel, en texte');
    ok(!(await page.isDisabled('#payer')), 'et on peut reessayer');
    await ctx.close();
  }

  console.log('\n-- 3. telephone et moteurs --');
  {
    const { page, ctx } = await ouvre({ largeur: 320 });
    const deb = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(deb <= 0, 'rien ne deborde a 320 px [' + deb + ']');
    ok(/name="robots"[^>]*noindex/.test(fs.readFileSync(path.join(SITE, 'x402_essai.html'), 'utf8')), 'la page est hors moteurs (noindex)');
    await ctx.close();
  }

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
