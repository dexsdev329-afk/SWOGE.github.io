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
 *   5. rien ne deborde a 320 px ; la page est hors moteurs ;
 *   6. ask_agent (l'agent engage, 27 septembre 2026) : la tache part dans les
 *      arguments, le prix affiche est celui du 402, et l'echeance signee laisse
 *      au moins 180 s (le serveur refuse en dessous : 150 s de travail + 30 s
 *      pour regler) sans depasser le maxTimeoutSeconds annonce (300 s).
 *   7. Solana (27 septembre 2026) : un portefeuille du Wallet Standard est
 *      trouve (annonce app-ready OU inscription tardive), la transaction part
 *      avec le feePayer et le montant du 402, signee par le SEUL payeur (sa
 *      signature ed25519 se verifie, celle du feePayer reste vide), l'offre
 *      absente montre la raison du serveur, ask_agent n'est pas paye sur Solana.
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
    const REQ_DE = (outil) => ({ x402Version: 2, error: 'PAYMENT-SIGNATURE header is required',
      resource: { url: 'https://srv.example/agentic/call/' + outil, description: outil, mimeType: 'application/json' },
      accepts: (sansBase ? [] : [{ scheme: 'exact', network: 'eip155:8453', amount: outil === 'ask_agent' ? '541000' : '20000', asset: USDC, payTo: TRESOR,
        maxTimeoutSeconds: outil === 'ask_agent' ? 300 : 120, extra: { name: 'USD Coin', version: '2' } }])
        .concat([{ scheme: 'exact', network: 'eip155:4663', amount: '21617', asset: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', payTo: TRESOR, maxTimeoutSeconds: 120, extra: { name: 'Global Dollar', version: '1' } }]),
      extensions: { bazaar: { info: { input: { type: 'http' } }, schema: {} } } });
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
      const m = /\/agentic\/call\/(scan_token|ask_agent|can_i_sell|colony_activity|new_launches|swoge_economy)$/.exec(u);
      if (!m) return r.abort();
      const sig = q.headers()['payment-signature'];
      vu.appels.push({ outil: m[1], corps: JSON.parse(q.postData() || '{}'), sig: sig || null });
      if (!sig) return r.fulfill({ status: 402, headers: { 'payment-required': b64(REQ_DE(m[1])), 'access-control-expose-headers': 'payment-required, payment-response' }, contentType: 'application/json', body: '{}' });
      if (refus) return r.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ ok: false, raison: '<img src=x onerror=window.pirate=1>insufficient_funds' }) });
      const p = de64(sig);
      vu.paiement = p;
      const acc = p.accepted, a = p.payload.authorization;
      const qui = ethers.utils.verifyTypedData({ name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: USDC }, TYPES, a, p.payload.signature);
      vu.signataire = qui;
      return r.fulfill({ status: 200, headers: { 'payment-response': b64({ success: true, transaction: '0x' + 'ab'.repeat(32), network: 'eip155:8453', payer: a.from }), 'access-control-expose-headers': 'payment-required, payment-response' },
        contentType: 'application/json', body: JSON.stringify({ ok: true, outil: m[1], texte: m[1] === 'ask_agent' ? 'AGENT ANSWER: <i>hold</i>' : 'Token 0x8a16…: <b>Swole Doge</b> …', x402: { network: acc.network } }) });
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
    /* Le devis lu a la connexion (prix affiche), puis le 402 et le paiement : un seul signe, le dernier. */
    const [av, der] = vu.appels.slice(-2);
    ok(vu.appels.every((x) => x.outil === 'scan_token' && x.corps.arguments.address === '0x8a166fb41cd659a0a43396272ff73973ce29f817'),
       'chaque appel porte les memes arguments (le devis est lie aux arguments) [' + vu.appels.length + ' appels]');
    ok(!av.sig && !!der.sig && vu.appels.filter((x) => x.sig).length === 1, 'le 402 puis UN paiement signe');
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

  console.log('\n-- 3. engager l agent (ask_agent) --');
  {
    const { page, vu, ctx } = await ouvre();
    ok(await page.isHidden('#tache_bloc'), 'la case de la tache est cachee tant que scan_token est choisi');
    await page.click('#connecter');
    await page.waitForFunction(() => !document.getElementById('payer').disabled);
    await page.check('input[value="ask_agent"]');
    ok(await page.isVisible('#tache_bloc'), 'choisir ask_agent montre la case de la tache');
    await page.waitForFunction(() => /0\.541/.test(document.getElementById('prix').textContent));
    ok(/\$0\.541/.test(await page.textContent('#prix_ask_agent')), 'le prix affiche est celui du 402 ($0.541), avant toute signature');
    ok(vu.signatures === 0, 'rien n est signe par le devis');
    await page.fill('#tache', '');
    await page.click('#payer');
    ok(/Write a task/.test(await page.textContent('#statut')) && vu.signatures === 0, 'sans tache : rien n est demande ni signe');
    await page.fill('#tache', 'Compare two tokens <script>');
    const avant = vu.appels.length;
    await page.click('#payer');
    await page.waitForSelector('#resultat:not([hidden])', { timeout: 10000 });
    const nouveaux = vu.appels.slice(avant);
    ok(nouveaux.length === 2 && nouveaux.every((x) => x.outil === 'ask_agent' && x.corps.arguments.task === 'Compare two tokens <script>'),
       'le 402 puis le paiement vont a ask_agent, la tache telle quelle dans les arguments');
    const a = vu.paiement.payload.authorization, s = Math.floor(Date.now() / 1000);
    ok(a.value === '541000' && vu.paiement.accepted.maxTimeoutSeconds === 300, 'le montant et l echeance annonces pour l agent');
    ok(Number(a.validBefore) - s >= 180 && Number(a.validBefore) <= s + 300,
       'l echeance laisse au moins 180 s (le serveur refuse en dessous) sans depasser 300 s [' + (Number(a.validBefore) - s) + ' s]');
    ok(vu.signataire === W.address, 'la signature se verifie');
    ok((await page.textContent('#sortie')).includes('<i>hold</i>') && (await page.$('#sortie i')) === null, 'la reponse de l agent est montree en texte');
    await ctx.close();
  }
  {
    const ctx = await nav.newContext();
    const page = await ctx.newPage();
    await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => r.abort());
    await page.goto('http://127.0.0.1:' + port + '/x402_essai.html?outil=ask_agent', { waitUntil: 'domcontentloaded' });
    ok(await page.isChecked('input[value="ask_agent"]') && await page.isVisible('#tache_bloc'), '?outil=ask_agent preselectionne l agent');
    await ctx.close();
  }

  /* Les autres outils payables d ici (27/09) : un paiement du proprietaire passe
     par PayAI et inscrit l outil dans son catalogue, un outil a la fois. */
  console.log('\n-- 3b. les autres outils, chacun avec ses arguments --');
  {
    const { page, vu, ctx } = await ouvre();
    await page.click('#connecter');
    await page.waitForFunction(() => !document.getElementById('payer').disabled);
    const attendu = { can_i_sell: { address: '0x8a166fb41cd659a0a43396272ff73973ce29f817' }, colony_activity: {}, new_launches: { limit: 5 }, swoge_economy: {} };
    for (const nom of Object.keys(attendu)) {
      await page.check('input[value="' + nom + '"]');
      ok(await page.isHidden('#tache_bloc'), nom + ' : la case de la tache reste cachee');
      const avant = vu.appels.length;
      await page.click('#payer');
      await page.waitForFunction(() => /Done/.test(document.getElementById('statut').textContent), null, { timeout: 10000 });
      const nouveaux = vu.appels.slice(avant).filter((x) => x.outil === nom);
      ok(nouveaux.some((x) => x.sig) && nouveaux.every((x) => JSON.stringify(x.corps.arguments) === JSON.stringify(attendu[nom])),
         nom + ' : le paiement part vers ' + nom + ' avec ' + JSON.stringify(attendu[nom]));
      await page.evaluate(() => { document.getElementById('statut').textContent = ''; });
    }
    ok(/PayAI/.test(await page.textContent('main')), 'la page dit que le portefeuille du proprietaire passe par PayAI');
    await ctx.close();
  }

  console.log('\n-- 3c. payer en USDC sur Solana (Wallet Standard) --');
  {
    const crypto = require('crypto');
    const SOL_NET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const PAYTO_SOL = 'CFg86EW2ZSAgGpf4o2XAt3gU59fgMfsuZyM6QDuDTmoM', FEE = 'CjNFTjvBhbJJd2B5ePPMHRLx1ELZpa8dwQgGL727eKww';
    const BH = '9zJ3sY2qvAoMYrgkXYWkrvBWTTjvP6T9BGFsMwAGrFg6';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const brut = publicKey.export({ format: 'der', type: 'spki' }).slice(-32);
    const ADR = ethers.utils.base58.encode(brut);
    const SOLS = require('./x402_solana.js');
    const ouvreSol = async ({ sansSolana, tardif } = {}) => {
      const ctx = await nav.newContext({ viewport: { width: 1100, height: 900 } });
      const page = await ctx.newPage();
      const vu = { appels: [], signatures: 0, rpc: [] };
      const REQ = (outil) => ({ x402Version: 2, error: 'PAYMENT-SIGNATURE header is required',
        resource: { url: 'https://srv.example/agentic/call/' + outil, description: outil, mimeType: 'application/json' },
        accepts: [{ scheme: 'exact', network: 'eip155:8453', amount: '20000', asset: USDC, payTo: TRESOR, maxTimeoutSeconds: 120, extra: { name: 'USD Coin', version: '2' } }]
          .concat(sansSolana ? [] : [{ scheme: 'exact', network: SOL_NET, amount: '22000', asset: USDC_SOL, payTo: PAYTO_SOL, maxTimeoutSeconds: 120, extra: { feePayer: FEE } }]),
        extensions: { bazaar: { info: { input: { type: 'http' } }, schema: {} } } });
      await page.exposeFunction('__solAdresse', async () => ADR);
      await page.exposeFunction('__solSigne', async (octets) => {
        vu.signatures++;
        const b = Buffer.from(octets);
        const sig = crypto.sign(null, b.slice(1 + 128), privateKey);
        sig.copy(b, 1 + 64);                                   /* le payeur est le 2e signataire */
        return Array.from(b);
      });
      const faux = () => {
        const acct = { address: null, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: ['solana:signTransaction'] };
        const wallet = { version: '1.0.0', name: 'Test Wallet', icon: 'data:image/svg+xml;base64,PHN2Zy8+', chains: ['solana:mainnet'], accounts: [],
          features: {
            'standard:connect': { version: '1.0.0', connect: async () => { acct.address = await window.__solAdresse(); wallet.accounts = [acct]; return { accounts: [acct] }; } },
            'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: [0], signTransaction: async (...l) => Promise.all(l.map(async (i) => {
              window.__vuEntree = { chain: i.chain, meme: i.account === acct, type: Object.prototype.toString.call(i.transaction) };
              return { signedTransaction: new Uint8Array(await window.__solSigne(Array.from(i.transaction))) }; })) } } };
        return wallet;
      };
      if (!tardif) await page.addInitScript(`(${faux})(); window.addEventListener('wallet-standard:app-ready', (e) => e.detail.register((${faux})()));`.replace('(' + faux + ')(); ', ''));
      await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), async (r) => {
        const q = r.request(), u = q.url();
        if (u.startsWith('https://rpc.test/')) {
          const c = JSON.parse(q.postData() || '{}'); vu.rpc.push(c);
          const res = c.method === 'getLatestBlockhash' ? { context: { slot: 1 }, value: { blockhash: BH, lastValidBlockHeight: 100 } }
            : c.method === 'getTokenAccountBalance' ? { context: { slot: 1 }, value: { amount: '5000000', decimals: 6, uiAmount: 5 } } : null;
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: c.id, result: res }) });
        }
        if (/\/agentic\/x402$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, solana: { etat: 'off', raison: 'payTo has no USDC account on Solana yet' } }) });
        const m = /\/agentic\/call\/([a-z_]+)$/.exec(u);
        if (!m) return r.abort();
        const sig = q.headers()['payment-signature'];
        vu.appels.push({ outil: m[1], corps: JSON.parse(q.postData() || '{}'), sig: sig || null });
        if (!sig) return r.fulfill({ status: 402, headers: { 'payment-required': b64(REQ(m[1])), 'access-control-expose-headers': 'payment-required, payment-response' }, contentType: 'application/json', body: '{}' });
        vu.paiement = de64(sig);
        return r.fulfill({ status: 200, headers: { 'payment-response': b64({ success: true, transaction: '5' + 'A'.repeat(87), network: SOL_NET, payer: ADR }), 'access-control-expose-headers': 'payment-required, payment-response' },
          contentType: 'application/json', body: JSON.stringify({ ok: true, outil: m[1], texte: 'Token <b>Swole Doge</b> on Solana' }) });
      });
      await page.goto('http://127.0.0.1:' + port + '/x402_essai.html?solrpc=https://rpc.test/', { waitUntil: 'domcontentloaded' });
      if (tardif) await page.evaluate(`window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: (api) => api.register((${faux})()) }))`);
      return { page, vu, ctx };
    };
    {
      const { page, vu, ctx } = await ouvreSol();
      await page.click('#sol_connecter');
      await page.waitForFunction(() => !document.getElementById('sol_payer').disabled);
      ok((await page.textContent('#sol_adresse')) === ADR && /5 USDC/.test(await page.textContent('#sol_solde')), 'portefeuille trouve par app-ready : adresse et solde USDC (lu au compte associe)');
      const ataPayeur = await SOLS.ata(ADR, USDC_SOL);
      ok(vu.rpc.some((c) => c.method === 'getTokenAccountBalance' && c.params[0] === ataPayeur), 'le solde est lu sur le compte USDC associe du payeur (' + ataPayeur.slice(0, 6) + '…)');
      await page.click('#sol_payer');
      await page.waitForFunction(() => /Done|Not paid/.test(document.getElementById('sol_statut').textContent), null, { timeout: 10000 });
      ok(/Done: paid in USDC on Solana/.test(await page.textContent('#sol_statut')), 'paye et servi : ' + (await page.textContent('#sol_statut')));
      const p = vu.paiement;
      ok(p && p.x402Version === 2 && p.accepted.network === SOL_NET && p.accepted.extra.feePayer === FEE && p.resource.url === 'https://srv.example/agentic/call/scan_token' && p.extensions.bazaar,
         'PAYMENT-SIGNATURE v2 : l offre Solana du 402 telle quelle, la ressource et l extension bazaar');
      const tx = Buffer.from(p.payload.transaction, 'base64');
      const msg = tx.slice(1 + 128);
      const cle = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), brut]), format: 'der', type: 'spki' });
      ok(tx[0] === 2 && tx.slice(1, 65).every((x) => x === 0) && crypto.verify(null, msg, cle, tx.slice(65, 129)),
         'la transaction : 2 signatures, celle du feePayer vide, celle du payeur valide (ed25519 sur le message)');
      const attendu = await SOLS.construit({ amount: '22000', asset: USDC_SOL, payTo: PAYTO_SOL, extra: { feePayer: FEE } }, { payeur: ADR, blockhash: BH, memo: msg.slice(msg.length - 33, msg.length - 1).toString() });
      ok(Buffer.from(attendu.message).equals(msg), 'le message signe = feePayer du 402, 22000 (0,022 USDC) vers le compte USDC de payTo, blockhash du RPC, memo aleatoire');
      const entree = await page.evaluate(() => window.__vuEntree);
      ok(entree && entree.chain === 'solana:mainnet' && entree.meme && entree.type === '[object Uint8Array]', 'signTransaction recoit le compte connecte, des octets (Uint8Array) et la chaine solana:mainnet');
      ok(/solscan\.io\/tx\/5A+/.test(await page.getAttribute('#tx a', 'href')) && (await page.textContent('#sortie')).includes('<b>Swole Doge</b>') && (await page.$('#sortie b')) === null,
         'le lien Solscan de la transaction, et le resultat montre en texte');
      await page.check('input[value="ask_agent"]');
      const avant = vu.appels.length;
      await page.click('#sol_payer');
      ok(/paid on Base only/.test(await page.textContent('#sol_statut')) && vu.appels.length === avant && vu.signatures === 1, 'ask_agent : pas de paiement Solana, rien demande ni signe');
      await ctx.close();
    }
    {
      const { page, vu, ctx } = await ouvreSol({ sansSolana: true, tardif: true });
      await page.click('#sol_connecter');
      await page.waitForFunction(() => !document.getElementById('sol_payer').disabled);
      ok(true, 'portefeuille inscrit apres le chargement (register-wallet) : trouve aussi');
      await page.click('#sol_payer');
      await page.waitForFunction(() => /Not paid/.test(document.getElementById('sol_statut').textContent), null, { timeout: 10000 });
      ok(/does not offer Solana right now \(payTo has no USDC account/.test(await page.textContent('#sol_statut')) && vu.signatures === 0,
         'pas d offre Solana dans le 402 : la raison du serveur est montree, rien n est signe');
      await ctx.close();
    }
    {
      const ctx = await nav.newContext();
      const page = await ctx.newPage();
      await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => r.abort());
      await page.goto('http://127.0.0.1:' + port + '/x402_essai.html', { waitUntil: 'domcontentloaded' });
      await page.click('#sol_connecter');
      ok(/No Solana wallet found/.test(await page.textContent('#sol_statut')) && await page.isDisabled('#sol_payer'), 'aucun portefeuille Solana : le dire, rien d autre');
      await ctx.close();
    }
  }

  console.log('\n-- 4. telephone et moteurs --');
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
