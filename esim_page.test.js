'use strict';
/* ============================================================================
 * LA BOUTIQUE eSIM SANS COMPTE (swoge_esim.html, 28 septembre 2026 au soir)
 *
 * Ce que la page DOIT tenir :
 *   1. chercher : les forfaits du serveur, poses en texte (un nom pieges ne
 *      s'interprete pas), au prix de la boutique ;
 *   2. payer sur Base : le 402 de /esim/buy, l'autorisation EIP-3009 signee avec
 *      le montant et le destinataire du 402 (la signature redonne le payeur),
 *      rejouee avec PAYMENT-SIGNATURE pour LE MEME forfait ;
 *   3. payer sur Solana : la transaction du 402, signee par le seul payeur ;
 *   4. le resultat : le lien secret (?order=…) a garder, le code d'activation et
 *      son QR ; rien dans localStorage ;
 *   5. ?order=<lien> : l'eSIM retrouvee sans compte, « en preparation » puis prete ;
 *   6. un refus du serveur : dit, echappe, « not charged » ; 320 px sans debord.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const SITE = __dirname;
let chromium = null, ethers = null;
try { chromium = require('playwright').chromium; } catch (e) {}
try { ethers = require('ethers'); } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript' };
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', TRESOR = '0xE81C67c086c83997b41673e1e41e481c14D756F6';
const SOL_NET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PAYTO_SOL = 'CFg86EW2ZSAgGpf4o2XAt3gU59fgMfsuZyM6QDuDTmoM', FEE = 'CjNFTjvBhbJJd2B5ePPMHRLx1ELZpa8dwQgGL727eKww', BH = '9zJ3sY2qvAoMYrgkXYWkrvBWTTjvP6T9BGFsMwAGrFg6';
const TYPES = { TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const de64 = (s) => JSON.parse(Buffer.from(s, 'base64').toString());
const LIEN = 'f'.repeat(32);
const LPA = 'LPA:1$rsp.truphone.com$QR-G-5C-1LS-1W1Z9P7';
const ACHAT = { id: 'a1', nom: 'Europe 1GB 7 days', go: 1, jours: 7, etat: 'livre', reseau: 'eip155:8453', tx: '0x' + 'ab'.repeat(32),
  activation: { uri: LPA, code: 'QR-G-5C-1LS-1W1Z9P7', smdp: 'rsp.truphone.com', iccid4: '4242' } };

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
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const ADR = ethers.utils.base58.encode(publicKey.export({ format: 'der', type: 'spki' }).slice(-32));
  const SOLS = require('./x402_solana.js');

  const ouvre = async ({ largeur, refus, commande, pret } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1100, height: 900 } });
    const page = await ctx.newPage();
    const vu = { achats: [], signatures: 0, commandes: 0 };
    await page.exposeFunction('__portefeuille', async (methode, params) => {
      if (methode === 'eth_requestAccounts') return [W.address];
      if (methode === 'wallet_switchEthereumChain') { vu.chaine = params[0].chainId; return null; }
      if (methode === 'eth_signTypedData_v4') { vu.signatures++; const t = JSON.parse(params[1]); vu.typed = t;
        return W._signTypedData(t.domain, { TransferWithAuthorization: t.types.TransferWithAuthorization }, t.message); }
      throw new Error('unsupported ' + methode);
    });
    await page.exposeFunction('__solAdresse', async () => ADR);
    await page.exposeFunction('__solSigne', async (octets) => {
      vu.signatures++;
      const b = Buffer.from(octets);
      crypto.sign(null, b.slice(1 + 128), privateKey).copy(b, 1 + 64);
      return Array.from(b);
    });
    await page.addInitScript(() => {
      window.ethereum = { request: ({ method, params }) => window.__portefeuille(method, params || []) };
      const faux = () => {
        const acct = { address: null, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: ['solana:signTransaction'] };
        const w = { version: '1.0.0', name: 'Phantom', icon: 'data:image/svg+xml;base64,PHN2Zy8+', chains: ['solana:mainnet'], accounts: [],
          features: { 'standard:connect': { version: '1.0.0', connect: async () => { acct.address = await window.__solAdresse(); w.accounts = [acct]; return { accounts: [acct] }; } },
            'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: [0], signTransaction: async (...l) => Promise.all(l.map(async (i) =>
              ({ signedTransaction: new Uint8Array(await window.__solSigne(Array.from(i.transaction))) }))) } } };
        return w;
      };
      window.addEventListener('wallet-standard:app-ready', (e) => e.detail.register(faux()));
    });
    const REQ = { x402Version: 2, resource: { url: 'https://srv.example/esim/buy', description: 'eSIM', mimeType: 'application/json' },
      accepts: [{ scheme: 'exact', network: 'eip155:8453', amount: '2500000', asset: USDC, payTo: TRESOR, maxTimeoutSeconds: 120, extra: { name: 'USD Coin', version: '2' } },
        { scheme: 'exact', network: SOL_NET, amount: '2502000', asset: USDC_SOL, payTo: PAYTO_SOL, maxTimeoutSeconds: 120, extra: { feePayer: FEE } }], extensions: {} };
    await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), async (r) => {
      const q = r.request(), u = q.url();
      const H = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'payment-required, payment-response' };
      if (/\/esim\/plans\?/.test(u)) {
        vu.recherche = new URL(u).searchParams.get('country');
        return r.fulfill({ status: 200, headers: H, contentType: 'application/json', body: JSON.stringify({ ok: true, destination: 'France', otherDestinations: ['Europe'],
          plans: [{ plan: 'europe-1gb-7days', name: 'Europe <img src=x onerror=window.pirate=1>', covers: 'Region of 33 countries (Austria, Belgium, Bulgaria…)', gb: 1, days: 7, priceUsd: 2.5 },
            { plan: 'fr-3gb', name: 'France 3GB', covers: 'France', gb: 3, days: 15, priceUsd: 4.23 }],
          unavailable: 1, terms: 'javascript:alert(1)', compatibility: 'https://vamoschips.com/compatibility' }) });
      }
      /* Choisir sans taper (29/09) : les pays vendus, un nom piege, et les images de fond. */
      if (/\/esim\/destinations$/.test(u)) { vu.destinations = (vu.destinations || 0) + 1;
        return r.fulfill({ status: 200, headers: H, contentType: 'application/json', body: JSON.stringify({ ok: true, regions: ['Europe', 'Asia', 'Middle East', 'South America', 'North America', 'Global'],
          countries: [{ code: 'FR', name: 'France' }, { code: 'JP', name: 'Japan' }, { code: 'US', name: 'United States' }, { code: 'ZZ9', name: 'Bad code' }, { code: 'NZ', name: 'New <img src=x onerror=window.pirate=7> Zealand' }],
          backgrounds: ['https://web-production-220a3.up.railway.app/esim/fond/2.jpg', 'javascript:alert(1)'] }) }); }
      if (/\/agentic\/solana\/blockhash$/.test(u)) return r.fulfill({ status: 200, headers: H, contentType: 'application/json', body: JSON.stringify({ ok: true, blockhash: BH }) });
      if (/\/esim\/order\//.test(u)) {
        vu.commandes++;
        const k = decodeURIComponent(u.split('/esim/order/')[1]);
        if (k !== LIEN) return r.fulfill({ status: 404, headers: H, contentType: 'application/json', body: JSON.stringify({ ok: false, raison: 'unknown order link' }) });
        const livre = pret || vu.commandes > 1;
        return r.fulfill({ status: livre ? 200 : 202, headers: H, contentType: 'application/json',
          body: JSON.stringify(livre ? { ok: true, achat: ACHAT } : { ok: false, raison: 'your eSIM is being prepared', achat: Object.assign({}, ACHAT, { etat: 'paye', activation: null }) }) });
      }
      if (/\/esim\/buy$/.test(u)) {
        const sig = q.headers()['payment-signature'];
        vu.achats.push({ corps: JSON.parse(q.postData() || '{}'), sig: sig || null });
        if (!sig) return r.fulfill({ status: 402, headers: Object.assign({ 'payment-required': b64(REQ) }, H), contentType: 'application/json', body: '{}' });
        if (refus) return r.fulfill({ status: 502, headers: H, contentType: 'application/json', body: JSON.stringify({ ok: false, raison: '<b>the eSIM shop answered HTTP 503</b> - you were not charged', paye: false }) });
        const p = de64(sig); vu.paiement = p;
        if (p.accepted.network === 'eip155:8453') {
          vu.signataire = ethers.utils.verifyTypedData({ name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: USDC }, TYPES, p.payload.authorization, p.payload.signature);
        } else {
          const tx = Buffer.from(p.payload.transaction, 'base64');
          const cle = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), publicKey.export({ format: 'der', type: 'spki' }).slice(-32)]), format: 'der', type: 'spki' });
          vu.solValide = crypto.verify(null, tx.slice(1 + 128), cle, tx.slice(65, 129)) && tx.slice(1, 65).every((x) => x === 0);
          vu.solLu = SOLS.lit(tx);
        }
        const net = p.accepted.network;
        return r.fulfill({ status: 200, headers: Object.assign({ 'payment-response': b64({ success: true, transaction: net === SOL_NET ? '5' + 'A'.repeat(87) : '0x' + 'ab'.repeat(32), network: net }) }, H),
          contentType: 'application/json', body: JSON.stringify({ ok: true, achat: ACHAT, delivered: true, orderLink: LIEN, texte: 'eSIM bought' }) });
      }
      return r.abort();
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_esim.html' + (commande ? '?order=' + commande : ''), { waitUntil: 'domcontentloaded' });
    return { page, vu, ctx };
  };
  const cherche = async (page) => { await page.fill('#pays', 'France'); await page.click('#chercher'); await page.waitForSelector('#cartePlans:not([hidden])'); };

  console.log('-- 1. chercher, choisir --');
  {
    const { page, vu, ctx } = await ouvre();
    await cherche(page);
    ok(vu.recherche === 'France' && (await page.$$('#plans .choix')).length === 2, 'la recherche part au serveur, deux forfaits montres');
    ok(/Europe <img src=x onerror=window\.pirate=1>/.test(await page.textContent('#plans')) && (await page.$('#plans img')) === null && !(await page.evaluate(() => window.pirate)),
       'le nom d un forfait est du texte, jamais du HTML');
    ok(/covers Region of 33 countries/.test(await page.textContent('#plans')) && /covers France/.test(await page.textContent('#plans')), 'chaque forfait dit ce qu il couvre : le pays, ou la region qui le contient');
    ok(/\$2\.50/.test(await page.textContent('#plans')) && /\$4\.23/.test(await page.textContent('#plans')) && /1 more plan/.test(await page.textContent('#plansNote')), 'le prix de la boutique, et les forfaits epuises comptes');
    ok((await page.getAttribute('#lienConditions', 'href')).startsWith('https://vamoschips.com/'), 'un lien de conditions qui n est pas https n est jamais pose');
    ok(await page.isHidden('#cartePaiement'), 'rien a payer avant d avoir choisi');
    await page.check('#plans input[value="europe-1gb-7days"]');
    ok(await page.isVisible('#cartePaiement') && (await page.textContent('#prixChoisi')) === '$2.50', 'un forfait choisi : le paiement apparait, a son prix');

    console.log('\n-- 2. payer sur Base --');
    await page.click('#connecter');
    await page.waitForFunction(() => !document.getElementById('payer').disabled);
    ok(vu.chaine === '0x2105', 'le portefeuille est mis sur Base');
    await page.click('#payer');
    await page.waitForSelector('#carteResultat:not([hidden])', { timeout: 10000 });
    const [av, der] = vu.achats.slice(-2);
    ok(!av.sig && !!der.sig && av.corps.plan === 'europe-1gb-7days' && der.corps.plan === 'europe-1gb-7days', 'le 402 puis UN paiement signe, pour le MEME forfait');
    const a = vu.paiement.payload.authorization;
    ok(a.to === TRESOR && a.value === '2500000' && a.from === W.address && vu.signataire === W.address, 'l autorisation : la tresorerie, 2,50 USDC du 402, signee par le payeur (verifiee)');
    ok((await page.textContent('#lienCommande')).endsWith('/swoge_esim.html?order=' + LIEN) && /save it now/.test(await page.textContent('#resLien')), 'le lien secret, a garder, est montre');
    ok(new URL(page.url()).searchParams.get('order') === LIEN, 'et pose dans l adresse de la page (un rechargement retrouve l eSIM)');
    ok(/rsp\.truphone\.com/.test(await page.textContent('#resActivation')) && (await page.$('#resActivation canvas.ach-qr')) !== null, 'le code d activation et son QR');
    ok(/basescan\.org\/tx\/0x(ab){32}/.test(await page.getAttribute('#resTx a', 'href')), 'le paiement sur BaseScan');
    ok((await page.evaluate(() => { try { return JSON.stringify(localStorage); } catch (e) { return ''; } })).indexOf('LPA') < 0, 'rien du code d activation dans localStorage');
    await ctx.close();
  }

  console.log('\n-- 3. payer sur Solana --');
  {
    const { page, vu, ctx } = await ouvre();
    await cherche(page);
    await page.check('#plans input[value="europe-1gb-7days"]');
    await page.check('input[name="reseau"][value="solana"]');
    await page.click('#solConnecter');
    await page.waitForFunction(() => !document.getElementById('solPayer').disabled);
    ok((await page.textContent('#solAdresse')) === ADR, 'Phantom trouve (Wallet Standard), adresse montree');
    await page.click('#solPayer');
    await page.waitForSelector('#carteResultat:not([hidden])', { timeout: 10000 });
    ok(vu.paiement.accepted.network === SOL_NET && vu.solValide, 'la transaction Solana du 402 : signee par le seul payeur (ed25519 verifiee), le feePayer vide');
    ok(vu.solLu && vu.solLu.programmes.length <= 6, 'au plus 6 instructions (le plafond du facilitateur)');
    ok(/solscan\.io\/tx\/5A+/.test(await page.getAttribute('#resTx a', 'href')), 'le paiement sur Solscan');
    await ctx.close();
  }

  console.log('\n-- 4. le lien : l eSIM retrouvee sans compte --');
  {
    const { page, vu, ctx } = await ouvre({ commande: LIEN });
    await page.waitForFunction(() => /being prepared/.test(document.getElementById('statutCommande').textContent));
    ok(await page.isHidden('#carteRecherche') && await page.isVisible('#rafraichir'), '?order= : en preparation, un bouton pour redemander');
    await page.click('#rafraichir');
    await page.waitForSelector('#resActivation canvas.ach-qr');
    ok(vu.commandes === 2 && /QR-G-5C-1LS-1W1Z9P7/.test(await page.textContent('#resActivation')), 'redemande : le code et le QR arrivent');
    await ctx.close();
    const x = await ouvre({ commande: 'e'.repeat(32) });
    await x.page.waitForFunction(() => /unknown order link/.test(document.getElementById('statutCommande').textContent));
    ok(true, 'un lien inconnu : dit');
    await x.ctx.close();
  }

  console.log('\n-- 5. un refus, un telephone --');
  {
    const { page, ctx } = await ouvre({ refus: true, largeur: 320 });
    await cherche(page);
    await page.check('#plans input[value="europe-1gb-7days"]');
    await page.click('#connecter');
    await page.waitForFunction(() => !document.getElementById('payer').disabled);
    await page.click('#payer');
    await page.waitForFunction(() => /Not bought, not charged/.test(document.getElementById('statut').textContent));
    ok(/<b>the eSIM shop answered HTTP 503<\/b>/.test(await page.textContent('#statut')) && (await page.$('#statut b')) === null, 'le refus du serveur, en texte : « not bought, not charged »');
    ok(!(await page.isDisabled('#payer')), 'on peut reessayer');
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 320 px, rien ne deborde [' + larg + ']');
    await ctx.close();
  }
  console.log('\n-- 6. choisir sans taper : drapeaux, pastilles, tous les pays, le fond (29/09) --');
  {
    const { page, vu, ctx } = await ouvre({ largeur: 360 });
    await page.waitForFunction(() => document.querySelectorAll('#listePays button').length > 0);
    const puces = await page.$$eval('#rapides .puce', (l) => l.map((b) => b.textContent));
    ok(puces.includes('\u{1F1EF}\u{1F1F5}Japan') && puces.includes('\u{1F1EB}\u{1F1F7}France') && puces.includes('\u{1F30D}Europe') && puces.includes('\u{1F310}Global'), 'des pastilles avec drapeau : pays courants et regions');
    ok(!puces.some((t) => /Thailand|Mexico/.test(t)), 'les pastilles ne montrent que des pays vraiment vendus (la liste du serveur)');
    await page.click('#rapides .puce:has-text("Japan")');
    await page.waitForSelector('#cartePlans:not([hidden])');
    ok(vu.recherche === 'Japan' && (await page.inputValue('#pays')) === 'Japan', 'un tap sur Japan : la recherche part, sans rien taper');
    await page.click('#tousPays summary');
    const liste = await page.$$eval('#listePays button', (l) => l.map((b) => b.textContent));
    ok(liste.length === 4 && liste[0] === '\u{1F1EB}\u{1F1F7}France' && !liste.some((t) => /Bad code/.test(t)), 'tous les pays, chacun avec son drapeau ; un code invalide est ecarte');
    ok((await page.$('#listePays img')) === null && !(await page.evaluate(() => window.pirate)), 'un nom de pays est du texte, jamais du HTML');
    await page.fill('#pays', 'uni');
    ok((await page.$$eval('#listePays button', (l) => l.map((b) => b.textContent))).join() === '\u{1F1FA}\u{1F1F8}United States', 'taper filtre la liste');
    await page.click('#listePays button');
    await page.waitForFunction(() => /United States/.test(document.getElementById('pays').value));
    ok(vu.recherche === 'United States', 'un pays de la liste : la recherche part');
    await page.waitForFunction(() => document.body.classList.contains('avec-fond'));
    ok(/^url\("img\/esim\/fond_[123]\.jpg"\)$/.test(await page.evaluate(() => document.body.style.getPropertyValue('--image-fond'))), 'le fond : une des trois images Kling, servie par le site');
    ok([1, 2, 3].every((i) => { const t = fs.statSync(path.join(SITE, 'img/esim/fond_' + i + '.jpg')).size; return t > 20000 && t < 300000; }), 'les trois fonds existent et restent legers (moins de 300 Ko chacun)');
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 360 px, rien ne deborde [' + larg + ']');
    await ctx.close();
  }
  ok(/<meta name="robots" content="noindex">/.test(fs.readFileSync(path.join(SITE, 'swoge_esim.html'), 'utf8')), 'hors moteurs pour l instant');

  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
