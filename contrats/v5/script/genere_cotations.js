#!/usr/bin/env node
/* ============================================================
   SWOGE V5 — GENERATEUR DE LA LISTE DES MONNAIES DE COTATION

   LECTURE SEULE. Ce script ne signe rien, n'envoie aucune transaction et ne
   lit aucune cle : il fait des eth_call / eth_getCode / eth_getStorageAt sur
   Robinhood Chain (4663) et des GET sur deux API publiques de prix.

     node contrats/v5/script/genere_cotations.js [--registre fichier.json] [--sortie fichier.json]

   Entrees :
     - le registre officiel des actions tokenisees de Robinhood
       (https://api.robinhood.com/rhj/assets, ou sa copie passee en --registre) ;
     - la chaine : pour chaque action, code present, proxy beacon, symbol(),
       decimals(), uiMultiplier(), paused() ; une fois : implementation du
       beacon, isBlocked(PoolManager) et paused() du registre d'acces ;
     - les prix : ETH, USDG et $SWOGE sur DexScreener ; les actions sur
       https://api.robinhood.com/quotes/ (cours de l'ACTION, en dollars).

   Sortie (par defaut contrats/v5/script/cotations_v5.json) : la liste figee
   que lit script/DeployV5.s.sol — `addresses` et `startTicks` dans le meme
   ordre (indice 0 = ETH natif, 1 = USDG, 2 = $SWOGE, puis les actions par
   symbole) — et, pour l'audit, chaque mesure et chaque exclusion avec sa raison.

   Le multiplicateur (voir README, « Le multiplicateur ») : `balanceOf` est
   brut, et `balanceOfUI = balanceOf × uiMultiplier`. Un jeton brut vaut donc
   `uiMultiplier` actions. Le prix d'un jeton brut, celui que voit le pool v4,
   est cours de l'action × uiMultiplier. Le tick de reference l'utilise.

   Tick de reference : FDV d'ouverture ≈ 1 ETH dans chaque monnaie (le depart
   de V4), prix « cotation par jeton » en unites brutes, arrondi a 200 :
     tick = round(ln(FDV_cotation / 1e9 × 10^(dec_cotation − 18)) / ln(1,0001) / 200) × 200
   Le lanceur peut ensuite decaler ce depart de ±MAX_START_SHIFT_TICKS (README).
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const RPC = 'https://rpc.mainnet.chain.robinhood.com';
const REGISTRE_URL = 'https://api.robinhood.com/rhj/assets';
const CHAIN_ID = 4663;
const POOL_MANAGER = '0x8366a39CC670B4001A1121B8F6A443A643e40951';
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const SWOGE = '0x8a166Fb41Cd659a0a43396272FF73973Ce29F817';
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
// emplacements ERC-1967 : beacon et implementation
const SLOT_BEACON = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
const SLOT_IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
// implementation relue et verifiee sur Sourcify (exact_match) le 18/10/2026 : Stock.sol, ERC20ScaledUIUpgradeable
const IMPL_AUDITEE = '0xb35490d6f9163de4f80d88dc75c3516eb64c5ae2';
// bornes du noyau, a garder egales a SwogeTypesV5.sol
const TICK_SPACING = 200;
const RANGE_TICKS = 161200;
const MAX_START_SHIFT_TICKS = 23000;
const MAX_USABLE_TICK = 887200;
const MAX_QUOTES = 255;
const FDV_ETH = 1; // FDV d'ouverture de reference, en ETH

const SEL = {
  symbol: '0x95d89b41', decimals: '0x313ce567', uiMultiplier: '0xa60bf13d',
  paused: '0x5c975abb', implementation: '0x5c60da1b', isBlocked: '0xfbac3951',
};

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

let rid = 0;
async function lot(appels) {
  // JSON-RPC par lots de 40, avec reprises : le RPC public limite le debit
  const out = [];
  for (let i = 0; i < appels.length; i += 40) {
    const corps = appels.slice(i, i + 40).map(([method, params]) => ({ jsonrpc: '2.0', id: ++rid, method, params }));
    for (let essai = 0; ; essai++) {
      try {
        const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
        const j = await r.json();
        if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 200));
        const parId = new Map(j.map((x) => [x.id, x]));
        for (const c of corps) { const x = parId.get(c.id); out.push(x && !x.error ? x.result : null); }
        break;
      } catch (e) {
        if (essai >= 4) throw e;
        await pause(1500 * (essai + 1));
      }
    }
    await pause(300);
  }
  return out;
}
const call = (to, data) => ['eth_call', [{ to, data }, 'latest']];

function chaine(h) {
  if (!h || h === '0x') return null;
  const b = Buffer.from(h.slice(2), 'hex');
  if (b.length === 32) return b.toString('utf8').replace(/\0+$/, '');
  const off = Number(BigInt('0x' + b.subarray(0, 32).toString('hex')));
  const len = Number(BigInt('0x' + b.subarray(off, off + 32).toString('hex')));
  return b.subarray(off + 32, off + 32 + len).toString('utf8');
}
const nombre = (h) => (h && h !== '0x' ? BigInt(h) : null);
const adr = (h) => (h ? '0x' + h.slice(-40).toLowerCase() : null);

function tick(fdvCotation, decCotation) {
  // prix « cotation par jeton » en unites brutes, jeton a 18 decimales et 10^9 d'offre
  const p = (fdvCotation / 1e9) * Math.pow(10, decCotation - 18);
  return Math.round(Math.log(p) / Math.log(1.0001) / TICK_SPACING) * TICK_SPACING;
}
const tickValide = (t) => Math.abs(t) + MAX_START_SHIFT_TICKS + RANGE_TICKS <= MAX_USABLE_TICK;

async function json(url) {
  for (let essai = 0; ; essai++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return await r.json();
    } catch (e) {
      if (essai >= 3) throw e;
      await pause(1500 * (essai + 1));
    }
  }
}

// prix DexScreener d'une adresse : la paire la plus liquide
async function dexPrix(a) {
  const j = await json('https://api.dexscreener.com/tokens/v1/robinhood/' + a);
  const p = (j || []).filter((x) => x.baseToken.address.toLowerCase() === a.toLowerCase())
    .sort((x, y) => (y.liquidity?.usd || 0) - (x.liquidity?.usd || 0))[0];
  return p ? { usd: Number(p.priceUsd), native: Number(p.priceNative), paire: p.pairAddress, liquiditeUsd: p.liquidity?.usd || 0 } : null;
}

(async () => {
  const fichier = arg('--registre');
  const registre = fichier ? JSON.parse(fs.readFileSync(fichier, 'utf8')) : await json(REGISTRE_URL);
  const sortie = arg('--sortie', path.join(__dirname, 'cotations_v5.json'));
  const actifs = registre.assets || [];

  const [cid, bloc] = await lot([['eth_chainId', []], ['eth_blockNumber', []]]);
  if (Number(cid) !== CHAIN_ID) throw new Error('mauvaise chaine : ' + cid);

  // 1. le registre : une entree par action, deploiement sur 4663, statut actif
  const exclues = [];
  const candidats = [];
  const vues = new Set();
  for (const a of actifs) {
    const d = (a.deployments || []).find((x) => x.chainId === CHAIN_ID);
    const raison = !d ? 'aucun deploiement sur 4663' : a.status !== 'ASSET_STATUS_ACTIVE' ? 'statut ' + a.status : null;
    if (raison) { exclues.push({ symbol: a.tokenSymbol, address: d?.contractAddress || null, raison }); continue; }
    const k = d.contractAddress.toLowerCase();
    if (vues.has(k)) { exclues.push({ symbol: a.tokenSymbol, address: d.contractAddress, raison: 'adresse en double dans le registre' }); continue; }
    vues.add(k);
    candidats.push({ symbol: a.tokenSymbol, nom: a.tokenName, address: d.contractAddress, decimalesRegistre: a.tokenDecimals, multiplicateurRegistre: a.currentMultiplier, multiplicateurEnAttente: a.pendingMultiplier || '' });
  }

  // 2. la chaine, pour chaque action
  const appels = [];
  for (const c of candidats) {
    appels.push(['eth_getCode', [c.address, 'latest']], ['eth_getStorageAt', [c.address, SLOT_BEACON, 'latest']],
      call(c.address, SEL.symbol), call(c.address, SEL.decimals), call(c.address, SEL.uiMultiplier), call(c.address, SEL.paused));
  }
  const r = await lot(appels);
  candidats.forEach((c, i) => {
    const [code, beacon, sym, dec, mult, pau] = r.slice(i * 6, i * 6 + 6);
    c.codeOctets = code ? (code.length - 2) / 2 : 0;
    c.beacon = adr(beacon);
    c.symbolChaine = chaine(sym);
    c.decimalesChaine = nombre(dec) === null ? null : Number(nombre(dec));
    c.uiMultiplier = nombre(mult) === null ? null : nombre(mult).toString();
    c.paused = nombre(pau) === null ? null : nombre(pau) !== 0n;
  });

  // 3. beacons et registre d'acces (une lecture par beacon distinct)
  const beacons = [...new Set(candidats.map((c) => c.beacon).filter(Boolean))];
  const rb = await lot(beacons.flatMap((b) => [call(b, SEL.implementation), call(b, SEL.isBlocked + POOL_MANAGER.slice(2).toLowerCase().padStart(64, '0')), call(b, SEL.paused)]));
  const infoBeacon = {};
  beacons.forEach((b, i) => {
    infoBeacon[b] = { implementation: adr(rb[i * 3]), poolManagerBloque: nombre(rb[i * 3 + 1]) !== 0n, registrePause: nombre(rb[i * 3 + 2]) !== 0n };
  });

  // 4. prix : ETH (WETH/USDG), USDG, $SWOGE sur DexScreener ; actions sur Robinhood
  const pWeth = await dexPrix(WETH);
  const pUsdg = await dexPrix(USDG);
  const pSwoge = await dexPrix(SWOGE);
  if (!pWeth) throw new Error('pas de prix ETH');
  const ethUsd = pWeth.usd;
  const usdgUsd = pUsdg?.usd || 1;
  const cours = {};
  const syms = candidats.map((c) => c.symbol);
  for (let i = 0; i < syms.length; i += 25) {
    const j = await json('https://api.robinhood.com/quotes/?symbols=' + syms.slice(i, i + 25).map(encodeURIComponent).join(','));
    for (const q of j.results || []) {
      if (!q) continue;
      const v = Number(q.last_extended_hours_trade_price || q.last_trade_price);
      if (v > 0) cours[q.symbol] = { usd: v, date: q.updated_at, halted: !!q.trading_halted };
    }
    await pause(400);
  }
  /* Un symbole sans cours : l'emetteur a pu changer de symbole sans que le jeton
     change (mesure du 18/10/2026 : SATS, EchoStar, cote ECHO chez Robinhood).
     On cherche l'instrument par son nom et on n'accepte qu'un instrument ACTIF
     dont le nom simple est exactement celui du jeton. */
  for (const c of candidats) {
    if (cours[c.symbol]) continue;
    const nomSimple = String(c.nom || '').split(' \u2022 ')[0].trim();
    if (!nomSimple) continue;
    const j = await json('https://api.robinhood.com/instruments/?query=' + encodeURIComponent(nomSimple));
    const ok = (j.results || []).filter((x) => x.state === 'active' && x.simple_name === nomSimple);
    if (ok.length !== 1) continue;
    const q = (await json('https://api.robinhood.com/quotes/?symbols=' + encodeURIComponent(ok[0].symbol))).results?.[0];
    const v = q ? Number(q.last_extended_hours_trade_price || q.last_trade_price) : 0;
    if (v > 0) cours[c.symbol] = { usd: v, date: q.updated_at, halted: !!q.trading_halted, symboleCours: ok[0].symbol };
    await pause(400);
  }

  // 5. verdict par action
  const retenues = [];
  for (const c of candidats) {
    const b = infoBeacon[c.beacon] || {};
    let raison = null;
    if (c.codeOctets === 0) raison = 'aucun code a cette adresse';
    else if (c.symbolChaine !== c.symbol) raison = `symbol() = ${JSON.stringify(c.symbolChaine)} ≠ registre ${c.symbol}`;
    else if (c.decimalesChaine !== c.decimalesRegistre) raison = `decimals() = ${c.decimalesChaine} ≠ registre ${c.decimalesRegistre}`;
    else if (!c.beacon || b.implementation !== IMPL_AUDITEE) raison = `implementation ${b.implementation || 'inconnue'} ≠ implementation lue (${IMPL_AUDITEE})`;
    else if (b.poolManagerBloque) raison = 'PoolManager bloque par le registre d\'acces';
    else if (c.paused) raison = 'jeton en pause (paused() = true)';
    else if (!c.uiMultiplier) raison = 'uiMultiplier() illisible';
    else if (!cours[c.symbol]) raison = 'aucun cours sur api.robinhood.com/quotes';
    if (!raison) {
      const m = Number(BigInt(c.uiMultiplier)) / 1e18;
      c.coursActionUsd = cours[c.symbol].usd;
      c.coursDate = cours[c.symbol].date;
      c.symboleCours = cours[c.symbol].symboleCours || c.symbol;
      c.prixJetonBrutUsd = c.coursActionUsd * m; // un jeton brut = uiMultiplier actions
      c.startTick = tick(ethUsd * FDV_ETH / c.prixJetonBrutUsd, c.decimalesChaine);
      if (!tickValide(c.startTick)) raison = 'tick de reference hors des ticks utilisables : ' + c.startTick;
    }
    if (raison) exclues.push({ symbol: c.symbol, address: c.address, raison });
    else retenues.push(c);
  }
  retenues.sort((x, y) => (x.symbol < y.symbol ? -1 : x.symbol > y.symbol ? 1 : 0));

  // 6. la liste figee : ETH, USDG, $SWOGE, puis les actions
  const tEth = tick(FDV_ETH, 18);
  const tUsdg = tick(ethUsd * FDV_ETH / usdgUsd, 6);
  const tSwoge = pSwoge ? tick(FDV_ETH / pSwoge.native, 18) : null;
  if (tSwoge === null) throw new Error('pas de prix $SWOGE');
  const liste = [
    { index: 0, symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', decimales: 18, startTick: tEth, source: 'FDV 1 ETH' },
    { index: 1, symbol: 'USDG', address: USDG, decimales: 6, startTick: tUsdg, source: `DexScreener ${pUsdg ? pUsdg.paire : '1 $'} ; ETH ${ethUsd} $` },
    { index: 2, symbol: 'SWOGE', address: SWOGE, decimales: 18, startTick: tSwoge, source: `DexScreener ${pSwoge.paire} ; ${pSwoge.native} ETH` },
    ...retenues.map((c, i) => ({
      index: 3 + i, symbol: c.symbol, nom: c.nom, address: c.address, decimales: c.decimalesChaine, startTick: c.startTick,
      coursActionUsd: c.coursActionUsd, symboleCours: c.symboleCours, uiMultiplier: c.uiMultiplier, prixJetonBrutUsd: c.prixJetonBrutUsd, coursDate: c.coursDate,
      codeOctets: c.codeOctets, beacon: c.beacon, multiplicateurEnAttente: c.multiplicateurEnAttente,
    })),
  ];
  for (const q of liste) if (!tickValide(q.startTick)) throw new Error('tick invalide ' + q.symbol + ' ' + q.startTick);
  if (liste.length > MAX_QUOTES) throw new Error('liste trop longue : ' + liste.length);

  const res = {
    genere: new Date().toISOString(),
    chainId: CHAIN_ID,
    bloc: Number(bloc),
    rpc: RPC,
    registre: fichier ? path.basename(fichier) : REGISTRE_URL,
    actionsAuRegistre: actifs.length,
    beacons: infoBeacon,
    implementationAttendue: IMPL_AUDITEE,
    ethUsd,
    usdgUsd,
    fdvReferenceEth: FDV_ETH,
    maxStartShiftTicks: MAX_START_SHIFT_TICKS,
    nombre: liste.length,
    actionsRetenues: retenues.length,
    // lus par DeployV5.s.sol (vm.parseJsonAddressArray / vm.parseJsonIntArray)
    addresses: liste.map((q) => q.address),
    startTicks: liste.map((q) => q.startTick),
    symbols: liste.map((q) => q.symbol),
    exclues,
    liste,
  };
  fs.writeFileSync(sortie, JSON.stringify(res, null, 2) + '\n');
  console.log(`bloc ${res.bloc} ; ETH ${ethUsd} $ ; ${liste.length} monnaies (${retenues.length} actions) ; ${exclues.length} exclues`);
  for (const e of exclues) console.log('  EXCLUE', e.symbol, e.address, '—', e.raison);
  console.log('ecrit :', sortie);
})().catch((e) => { console.error('ECHEC', e.message); process.exit(1); });
