'use strict';
/* ============================================================================
 * SOLANA AI / ETHEREUM AI (08/10/2026) — deux pages mono-chaine propres
 *
 * La page « Solana & ETH » (un toggle 3 chaines) a ete SCINDEE en deux colonies
 * papier separees : swoge_sol_ai.html et swoge_eth_ai.html. Chacune montre UNE
 * chaine, lue telle quelle sur /ai/observatoire. Cet essai garde l'intention de
 * l'ancien (securite des liens, pas d'XSS, rien qui deborde, la barre du t, la
 * banque papier) et verifie en plus les deux reparations de presentation :
 *   A. la banque ne mene plus avec un agregat lumpe : le CONTROLE (la barre a
 *      battre) et les ARMS (strategies) sont montres SEPAREMENT ;
 *   B. le verdict compare la meilleure arm au controle, pas une moyenne lumpee.
 * Et le miroir reel : OFF/owner-gated sur Ethereum, « paper only » sur Solana.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const PIEGE = '<img src=x onerror=window.pirate=1>';
const kase = (trait, cas, nb, avg, t, o) => Object.assign({ trait, case: cas, n: nb, partMontes: nb >= 30 ? 6 : null, partEffondres: nb >= 30 ? 14 : null, disparus: 0,
  assez: nb >= 30, avgCapped: nb >= 30 ? avg : null, t: nb >= 30 ? t : null, median: nb >= 30 ? '-10 to -5%' : null, nCapped: nb }, o || {});
/* Solana : onze cases jugees (barre = probit(1 - 0,05/22) = 2,84) ; une seule la passe avec une moyenne
   positive ; une autre a un t fort mais une moyenne NEGATIVE (elle ne sort pas) ; une au nom piege sous 30. */
const casesSol = [kase('all tokens', 'all tokens', 29730, -12.3, -40.1, { partMontes: 5, partEffondres: 13 }),
  kase('Pool size', '$20-100k', 1078, 8.5, 5.2, { partMontes: 49, partEffondres: 27 }),
  kase('Pool size', '$5-20k', 9000, -9.1, -12, {}), kase('Venue', 'pumpswap', 5000, -2, -1, {}), kase('Venue', 'meteora', 800, 1.2, 1.1, {}),
  kase('Venue', 'raydium', 3000, -5, -4, {}), kase('Market cap', 'under $10k', 12000, -15, 3.5, {}), kase('Market cap', '$10-100k', 7000, -3, -2, {}),
  kase('Security', 'mint renounced', 20000, -11, -20, {}), kase('Security', 'freeze active', 300, -20, -6, {}), kase('Age', 'under 5 min', 25000, -12, -30, {}),
  kase('Venue', 'fluxbeam', 82, 293.9, 129.05, { partMontes: 100, partEffondres: 0 }),
  kase('Venue', PIEGE, 12, 0, 0, {})];
/* Ethereum : rien ne sort (2 cases jugees, barre = probit(1 - 0,05/4) = 2,24), MAIS la reference elle-meme
   est au-dessus de zero (+8,2 %) — la page doit prevenir que le premier prix lu n'est pas celui paye. */
const casesEth = [kase('all tokens', 'all tokens', 2041, 8.2, 9.9, { partMontes: 30, partEffondres: 10 }),
  kase('Pool size', '$20-100k', 300, -1.5, -0.7, {}), kase('Venue', 'uniswap', 1500, -6, -8, {})];
const SOL_A = '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', ETH_A = '0x' + 'ab'.repeat(20), ETH_DEV = '0x' + 'cd'.repeat(20);
const chaine = (nom, cases, extra) => Object.assign({ nom, depuis: '2026-09-27T10:00:00.000Z', cycles: 2970, recompute: { depuis: Date.parse('2026-10-03T16:00:00Z'), relus: 28000 },
  enCours: 40, compte: { decouverts: 30782, observes: 29730, jamaisIndexes: 512, disparus: 300, pleins: 0, erreurs: {} }, holders: null, cases, jev: null, devs: null,
  derniers: [] }, extra || {});
const serieB = (n, net, t, m1, m2, g) => ({ n, net, t, moitie1: m1, moitie2: m2, gagnants: g });
/* Banque Solana : trop tot (4 achats regles) — un temoin, une arm en test, une arm retiree. */
const BANQUE_SOL = { quoter: 'Jupiter', since: '2026-10-03T19:00:00.000Z', stakeUsd: 25, startUsd: 1000, cashUsd: 912.5, openUsd: 100, valueUsd: 1012.5, pnlUsd: 12.5,
  open: 4, closed: 0, all: serieB(4, -3.1, -0.8, -2, -4.2, 25), control: serieB(3, -2, -0.5, -1, -3, 33), bar: 2.13,
  arms: [Object.assign({ case: 'Pool size = $20-100k', state: 'testing', since: '2026-10-03T19:00:00.000Z', retiredBecause: null }, serieB(1, 5, null, null, 5, 100)),
         Object.assign({ case: PIEGE, state: 'retired', since: '2026-10-03T19:00:00.000Z', retiredBecause: 'losing beyond chance' }, serieB(0, null, null, null, null, null))],
  bench: { n: 0 }, entryCost: { n: 4, medianPct: 4.3, refusedMedianPct: 21 }, refusedByVenue: { 'cannot sell · Pump.fun': 2 },
  counts: { proposed: 40, bought: 8, control: 3, refused: { 'cannot sell': 2, 'round trip too costly': 1 }, quotes: 30, rateLimited: 1, errors: 0, lastError: null },
  recent: [{ addr: SOL_A, dex: 'pumpswap', control: true, arm: null, entryCostPct: 4.3, r30: -2.1, unsellable: false, t: 1 },
           { addr: 'javascript:alert(1)', dex: PIEGE, control: false, arm: PIEGE, entryCostPct: 4, r30: -100, unsellable: true, t: 2 }] };
/* Banque Ethereum : rechargee une fois, un bras tient en papier (bat le controle apres frais). */
const BANQUE_ETH = { quoter: 'KyberSwap', since: '2026-10-03T19:00:00.000Z', stakeUsd: 50, startUsd: 1000, refills: 1, investedUsd: 2000, cashUsd: 900, openUsd: 100, valueUsd: 1012.5, pnlUsd: -987.5,
  open: 4, closed: 0, all: serieB(200, 1.2, 1.1, 0.8, 1.6, 48), control: serieB(60, -4.1, -2.2, -4, -4.2, 30), bar: 2.0,
  arms: [Object.assign({ case: 'Dev history = 2+ launches', state: 'holds in paper', since: '2026-10-03T19:00:00.000Z', retiredBecause: null }, serieB(120, 6.2, 3.4, 5.9, 6.5, 58)),
         Object.assign({ case: 'Pool size = $20-100k', state: 'testing', since: '2026-10-03T19:00:00.000Z', retiredBecause: null }, serieB(40, 2, 0.5, 1, 3, 52))],
  bench: { n: 150, at10: serieB(150, 0.5, 0.3), at30: serieB(150, 1.2, 1), at60: serieB(150, -0.8, -0.4), min60vs30: serieB(150, -2, -1.5), min10vs30: serieB(150, -0.7, -0.6) },
  entryCost: { n: 200, medianPct: 5.1, refusedMedianPct: 18 }, refusedByVenue: { 'cannot sell · uniswap-v3': 3 },
  counts: { proposed: 300, bought: 210, control: 60, refused: { 'cannot sell': 3, 'round trip too costly': 2 }, quotes: 280, rateLimited: 2, errors: 0, lastError: null },
  recent: [{ addr: ETH_A, dex: 'uniswap', control: true, arm: null, entryCostPct: 5.1, r30: 1.2, unsellable: false, t: 1 }] };
const ETAT = { actif: true, note: 'Observation only.', horizonMin: 30, chaines: {
  solana: chaine('Solana', casesSol, { bank: BANQUE_SOL, holders: 'unknown: the public Solana node refuses holder reads — set SOLANA_RPC_URL',
    derniers: [{ addr: SOL_A, dex: 'pumpswap', r: 42.4, t: Date.parse('2026-10-03T15:12:00Z') }, { addr: 'javascript:alert(1)', dex: PIEGE, r: -55, t: Date.parse('2026-10-03T15:10:00Z') },
      { addr: SOL_A, dex: 'meteora', r: null, t: Date.parse('2026-10-03T15:09:00Z') }] }),
  eth: chaine('Ethereum', casesEth, { bank: BANQUE_ETH, devs: { recorded: 40, withThreeTokensOrMore: 1, withThreePlausibleLaunches: 1,
    pushers: [{ dev: ETH_DEV, tokens: 9, plausibleLaunches: 5, doubled: 3, medianMultiple: 2.1, vanished: 1, reached100k: 1 },
      { dev: PIEGE, tokens: 4, plausibleLaunches: 3, doubled: 1, medianMultiple: 0.8, vanished: 2 }], bestAvgPeak: [], mostVanished: [] },
    derniers: [{ addr: ETH_A, dex: 'uniswap', r: 3, t: Date.parse('2026-10-03T15:00:00Z') }] }) } };
const VIDE = JSON.parse(JSON.stringify(ETAT));
for (const c of Object.values(VIDE.chaines)) c.cases = c.cases.map((x) => kase(x.trait, x.case, 10, 0, 0, {}));

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return fin(); }
  const T = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
  const srv = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u === '/api/ai/observatoire') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify(ETAT)); }
    if (u === '/vide/ai/observatoire') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify(VIDE)); }
    if (u === '/panne/ai/observatoire') { r.writeHead(503); return r.end(); }
    const f = path.join(SITE, decodeURIComponent(u));
    if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  const ouvre = async (page, q, w) => {
    const ctx = await nav.newContext({ viewport: { width: w || 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
    await p.goto(base + page + '?' + q, { waitUntil: 'domcontentloaded' });
    return { p, ctx };
  };
  const lit = (p) => p.evaluate(() => {
    const $ = (s) => document.querySelector(s), t = (s) => ($(s) ? $(s).textContent : '');
    return { kpis: [...document.querySelectorAll('#kpis .ds-kpi')].map((k) => k.textContent), verdict: t('#verdict'), vcls: ($('#verdict') || {}).className,
      lignes: [...document.querySelectorAll('#cases tr')].map((tr) => [...tr.children].map((td) => td.textContent)),
      vertes: [...document.querySelectorAll('#cases td')].filter((td) => td.style.color === 'rgb(14, 138, 79)').map((td) => td.parentNode.children[1].textContent),
      devsCache: $('#carteDevs').hidden, devs: [...document.querySelectorAll('#devs tr')].map((tr) => [...tr.children].map((td) => td.textContent)),
      devsNote: t('#devsNote'), derniers: [...document.querySelectorAll('#derniers tr')].map((tr) => tr.textContent),
      liens: [...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')),
      statut: t('#statut'), pastille: t('#pastilleTxt'), casesNote: t('#casesNote'), pirate: window.pirate, imgs: document.querySelectorAll('main img').length,
      bkCache: $('#carteBanque').hidden, bkKpis: [...document.querySelectorAll('#bkKpis .ds-kpi')].map((k) => k.textContent), bkVerdict: t('#bkVerdict'), bkVcls: ($('#bkVerdict') || {}).className,
      bkBras: [...document.querySelectorAll('#bkBras tr')].map((tr) => [...tr.children].map((td) => td.textContent)), bkBanc: t('#bkBanc'), bkRefus: t('#bkRefus'),
      bkRecents: [...document.querySelectorAll('#bkRecents tr')].map((tr) => [...tr.children].map((td) => td.textContent)),
      bkLiens: [...document.querySelectorAll('#bkRecents a[href]')].map((a) => a.getAttribute('href')),
      miroir: t('#miroirEtat'), corps: document.querySelector('main').textContent, toggle: document.querySelectorAll('#chaines').length };
  });
  const SURS = /^(https:\/\/dexscreener\.com\/(solana|ethereum|robinhood)\/|https:\/\/etherscan\.io\/address\/|https:\/\/robinhoodchain\.blockscout\.com\/address\/|[a-z_]+\.html)/;

  console.log('-- 1. Solana AI (swoge_sol_ai.html) --');
  let { p, ctx } = await ouvre('swoge_sol_ai.html', 'server=' + encodeURIComponent(base + 'api'));
  await p.waitForFunction(() => document.querySelectorAll('#cases tr').length > 0);
  let r = await lit(p);
  ok(r.toggle === 0 && r.pastille === 'Observing live', 'page mono-chaine : aucun toggle #chaines, la pastille dit « Observing live »');
  ok(r.kpis.length === 4 && /29,730/.test(r.kpis[0]) && /30,782 discovered/.test(r.kpis[0]) && /-12\.3%/.test(r.kpis[2]) && /over 29,730 tokens/.test(r.kpis[2]), 'quatre chiffres, chacun avec son effectif');
  ok(/unknown/.test(r.kpis[3]) && /refuses/.test(r.kpis[3]), 'les detenteurs : « unknown », la raison dite (noeud public)');
  ok(/^ds-verdict ok$/.test(r.vcls) && /1 case stands out/.test(r.verdict) && /t ≥ 2\.84/.test(r.verdict) && /11 cases tested/.test(r.verdict) && /Pool size = \$20-100k \(\+8\.5%, t 5\.2, 1,078 tokens\)/.test(r.verdict),
     'la barre pour 11 cases jugees : 2,84 ; seule « Pool size = $20-100k » sort, avec son effectif');
  ok(!/under \$10k/.test(r.verdict) && r.vertes.join() === '$20-100k', 'un t fort avec une moyenne NEGATIVE ne sort pas ; une seule case en vert');
  ok(/Left out until checked: Venue = fluxbeam \(\+293\.9%, 82 tokens\)/.test(r.verdict) && !r.vertes.includes('fluxbeam'),
     'une moyenne collee au plafond (fluxbeam) : mise de cote et dite, jamais une piste ni en vert');
  const sous = r.lignes.find((l) => l[1] === PIEGE);
  ok(sous && sous.length === 4 && sous[3] === 'not enough (under 30)', 'une case de 12 jetons : « not enough (under 30) », aucun pourcentage');
  ok(r.devsCache === true, 'Solana : pas de carte des devs (aucun dev releve sur cette chaine)');
  const lienSol = await p.$$eval('#derniers a[href]', (l) => l.map((a) => a.getAttribute('href')));
  ok(lienSol.length === 2 && lienSol.every((h) => h === 'https://dexscreener.com/solana/' + SOL_A) && !r.liens.some((h) => /javascript/i.test(h)), 'derniers jetons : lien DexScreener pour une adresse Solana valide, aucun pour « javascript:… »');
  ok(r.derniers.some((t) => /vanished/.test(t)) && r.derniers.some((t) => /\+42\.4%/.test(t)), 'un jeton disparu dit « vanished », jamais -100 %');
  ok(r.pirate === undefined && r.imgs === 0, 'les noms pieges restent du texte : aucune image injectee, aucun script lance');
  ok(r.liens.every((h) => SURS.test(h)), 'aucun lien hors de DexScreener, des explorateurs connus et du site (' + r.liens.length + ' liens)');
  ok(/paper only|not EVM/i.test(r.corps) && !/owner-gated/.test(r.miroir), 'Solana : miroir « paper only » (pas d executeur Solana), rien d owner-gated');

  console.log('\n-- 1b. la banque Solana : controle et arms SEPARES, pas lumpes --');
  ok(r.bkCache === false && r.bkKpis.length === 4 && /\$1,012\.5/.test(r.bkKpis[0]) && /\+\$12\.5/.test(r.bkKpis[1]), 'la banque : valeur 1 012,5 $, +12,5 $');
  ok(/Control \(benchmark\)/.test(r.bkKpis[2]) && /-2%/.test(r.bkKpis[2]) && /3 settled/.test(r.bkKpis[2]) && /the bar to beat/.test(r.bkKpis[2]), 'KPI « Control (benchmark) » : le temoin seul, la barre a battre (' + r.bkKpis[2].slice(0, 70) + ')');
  ok(/Strategy arms/.test(r.bkKpis[3]) && /^.*2/.test(r.bkKpis[3]) && /none proven yet/.test(r.bkKpis[3]) && !/net avg/.test(r.bkKpis.join()), 'KPI « Strategy arms » : le nombre d arms, aucun agregat lumpe « net avg » en tete');
  ok(/^ds-verdict peu$/.test(r.bkVcls) && /Too early: 4 settled paper buy/.test(r.bkVerdict) && /control needs 30/.test(r.bkVerdict), 'sous 30 achats regles : « Too early », aucune conclusion');
  ok(r.bkBras[0][0] === 'Control (any token)' && r.bkBras[0][2] === '3' && r.bkBras.some((l) => l[0] === PIEGE && l[1] === 'retired'), 'le temoin d abord ; un bras retire le dit ; un nom piege reste du texte');
  ok(/cannot sell 2/.test(r.bkRefus) && /median cost of the refused round trips 21%/.test(r.bkRefus) && /By venue: cannot sell · Pump\.fun \(2\)/.test(r.bkRefus), 'les refus dits, avec leur place et le cout median des allers-retours refuses');
  ok(r.bkLiens.length === 1 && r.bkLiens[0] === 'https://dexscreener.com/solana/' + SOL_A && r.bkRecents[1][3] === 'unsellable' && r.bkRecents[0][1] === 'control', 'derniers achats : lien seulement pour une adresse valide ; « unsellable » dit, jamais un prix');

  await ctx.close();

  console.log('\n-- 2. Ethereum AI (swoge_eth_ai.html) --');
  ({ p, ctx } = await ouvre('swoge_eth_ai.html', 'server=' + encodeURIComponent(base + 'api')));
  await p.waitForFunction(() => document.querySelectorAll('#cases tr').length > 0);
  r = await lit(p);
  ok(r.toggle === 0, 'page mono-chaine Ethereum : aucun toggle');
  ok(/^ds-verdict non$/.test(r.vcls) && /Nothing stands out on Ethereum/.test(r.verdict) && /none of the 2 cases/.test(r.verdict), 'rien ne sort : dit, avec le nombre de cases jugees');
  ok(/even the reference, all tokens, moves \+8\.2%/.test(r.verdict) && /only paper trades at real quotes can tell/.test(r.verdict) && !r.vertes.includes('all tokens'),
     'la reference elle-meme monte (+8,2 %) : la page previent que le premier prix lu n est pas celui paye');
  ok(r.devsCache === false && r.devs.length === 2 && r.devs[0][1] === '5' && r.devs[0][2] === '3 (60%)' && r.devs[0][3] === '×2.1', 'Ethereum (EVM) : la carte des devs, le premier pousseur avec ses chiffres');
  ok(r.liens.includes('https://etherscan.io/address/' + ETH_DEV) && r.liens.filter((h) => /etherscan/.test(h)).length === 1, 'lien Etherscan pour l adresse valide, aucun pour le nom piege');
  ok(r.pirate === undefined && r.imgs === 0, 'un dev au nom piege reste du texte');

  console.log('\n-- 2b. la banque Ethereum : rechargee, un bras tient, controle separe --');
  ok(/ran dry 1 time: refilled with \$1,000 each · \$2,000 put in/.test(r.bkKpis[0]) && /−\$987\.5/.test(r.bkKpis[1]) && /-49\.4% of all money put in/.test(r.bkKpis[1]),
     'une banque rechargee le dit (1 fois, 2 000 $ apportes) et sa perte se lit contre les 2 000 $');
  ok(/Control \(benchmark\)/.test(r.bkKpis[2]) && /-4\.1%/.test(r.bkKpis[2]) && /the bar to beat/.test(r.bkKpis[2]), 'KPI controle : -4,1 %, la barre a battre');
  ok(/Strategy arms/.test(r.bkKpis[3]) && /1 hold in paper/.test(r.bkKpis[3]), 'KPI arms : « 1 hold in paper »');
  ok(/^ds-verdict ok$/.test(r.bkVcls) && /1 arm beat the control after fees and hold in paper: Dev history = 2\+ launches \(\+6\.2% net, t 3\.4, 120 tokens\)/.test(r.bkVerdict) && /Still paper/.test(r.bkVerdict),
     'le verdict compare l arm au controle : un bras bat le controle et « holds in paper », avec son effectif');
  ok(/at 10 min \+0\.5%, at 30 min \+1\.2%, at 60 min -0\.8%/.test(r.bkBanc) && /60 vs 30 min: -2% \(t -1\.5\)/.test(r.bkBanc), 'le banc : les memes achats a 10/30/60 min, l ecart apparie 60 contre 30 avec son t');

  console.log('\n-- 2c. le miroir reel ETH : OFF, owner-gated, ne signe jamais --');
  ok(/Real execution/i.test(r.miroir) && /OFF/.test(r.miroir), 'le panneau miroir dit « Real execution: OFF »');
  ok(/owner-gated/.test(r.corps) && /AI_OWNER/.test(r.corps) && /MIROIR_EXECUTE=0/.test(r.corps) && /Nothing is signed today/.test(r.corps), 'le miroir ETH : owner-gated (AI_OWNER), MIROIR_EXECUTE=0, rien n est signe');
  await ctx.close();

  console.log('\n-- 3. trop peu, puis serveur injoignable (Solana AI) --');
  ({ p, ctx } = await ouvre('swoge_sol_ai.html', 'server=' + encodeURIComponent(base + 'vide')));
  await p.waitForFunction(() => document.querySelector('#verdict').textContent.length > 0);
  r = await lit(p);
  ok(/^ds-verdict peu$/.test(r.vcls) && /Not enough tokens yet/.test(r.verdict) && r.vertes.length === 0, 'aucune case a 30 jetons : aucun verdict, aucune case en vert');
  await ctx.close();
  ({ p, ctx } = await ouvre('swoge_eth_ai.html', 'server=' + encodeURIComponent(base + 'panne')));
  await p.waitForFunction(() => /could not be read/.test(document.querySelector('#statut').textContent));
  r = await lit(p);
  ok(r.pastille === 'Unreachable' && r.kpis.length === 0, 'serveur injoignable : « Unreachable », aucun chiffre invente');
  await ctx.close();

  console.log('\n-- 4. a 1440 px : la colonne du milieu ne passe pas sous celle de droite --');
  for (const pg of ['swoge_sol_ai.html', 'swoge_eth_ai.html']) {
    ({ p, ctx } = await ouvre(pg, 'server=' + encodeURIComponent(base + 'api'), 1440));
    await p.waitForFunction(() => document.querySelectorAll('#cases tr').length > 0);
    const g = await p.evaluate(() => { const m = document.querySelector('main').getBoundingClientRect(), l = document.querySelector('.sw-lat');
      const cartes = [...document.querySelectorAll('main .ds-carte')].map((e) => e.getBoundingClientRect().right);
      const tb = document.querySelector('#cases').closest('table'), boite = tb.parentNode;
      return { main: m.right, lat: l ? l.getBoundingClientRect().left : 1e9, cartes: Math.max(...cartes), table: tb.getBoundingClientRect().width, boite: boite.clientWidth }; });
    ok(g.main <= g.lat && g.cartes <= g.lat, pg + ' a 1440 px : <main> et ses cartes s arretent avant la colonne de droite');
    ok(g.table <= g.boite + 1, pg + ' a 1440 px : le tableau des cases tient dans sa carte, le t visible sans defiler');
    await ctx.close();
  }

  console.log('\n-- 5. a 360 px : rien ne deborde --');
  for (const pg of ['swoge_sol_ai.html', 'swoge_eth_ai.html']) {
    ({ p, ctx } = await ouvre(pg, 'server=' + encodeURIComponent(base + 'api'), 360));
    await p.waitForFunction(() => document.querySelectorAll('#cases tr').length > 0);
    const l = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(l <= 361, pg + ' a 360 px : rien ne deborde (' + l + ' px)');
    await ctx.close();
  }
  await nav.close(); srv.close();
  fin();
})().catch((e) => { console.error('  RATE ' + (e.stack || e)); process.exit(1); });
function fin() { console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe')); process.exit(rates ? 1 : 0); }
