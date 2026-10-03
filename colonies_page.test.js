'use strict';
/* ============================================================================
 * SOLANA & ETHEREUM COLONIES (03/10/2026) — la page montre /ai/observatoire tel quel
 *   1. Solana par defaut : quatre chiffres avec leur effectif ; la barre du t (Bonferroni
 *      sur les cases jugees) ; une case ne « sort » que si t >= barre ET moyenne bornee > 0 ;
 *      sous 30 jetons, une case dit « not enough », jamais un pourcentage ;
 *   2. Ethereum : rien ne sort, la page le dit avec la reference ; ?chain= suit le choix ;
 *   3. Robinhood : les devs qui poussent, lien explorateur pour une adresse de la bonne forme ;
 *   4. trop peu de jetons partout : aucun verdict ; serveur injoignable : dit ;
 *   5. tout ce qui vient du serveur est du texte ; aucun lien hors des explorateurs connus ;
 *      rien ne deborde a 360 px.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const PIEGE = '<img src=x onerror=window.pirate=1>';
const kase = (trait, cas, nb, avg, t, o) => Object.assign({ trait, case: cas, n: nb, partMontes: nb >= 30 ? 6 : null, partEffondres: nb >= 30 ? 14 : null, disparus: 0,
  assez: nb >= 30, avgCapped: nb >= 30 ? avg : null, t: nb >= 30 ? t : null, median: nb >= 30 ? '-10 to -5%' : null, nCapped: nb }, o || {});
/* Solana : dix cases jugees (barre = probit(1 - 0,05/20) = 2,81) ; une seule la passe avec une moyenne
   positive ; une autre a un t fort mais une moyenne NEGATIVE (elle ne sort pas : elle baisse « surement ») ;
   une au nom piege sous 30 jetons. */
const casesSol = [kase('all tokens', 'all tokens', 29730, -12.3, -40.1, { partMontes: 5, partEffondres: 13 }),
  kase('Pool size', '$20-100k', 1078, 8.5, 5.2, { partMontes: 49, partEffondres: 27 }),
  kase('Pool size', '$5-20k', 9000, -9.1, -12, {}), kase('Venue', 'pumpswap', 5000, -2, -1, {}), kase('Venue', 'meteora', 800, 1.2, 1.1, {}),
  kase('Venue', 'raydium', 3000, -5, -4, {}), kase('Market cap', 'under $10k', 12000, -15, 3.5, {}), kase('Market cap', '$10-100k', 7000, -3, -2, {}),
  kase('Security', 'mint renounced', 20000, -11, -20, {}), kase('Security', 'freeze active', 300, -20, -6, {}), kase('Age', 'under 5 min', 25000, -12, -30, {}),
  kase('Venue', PIEGE, 12, 0, 0, {})];
const casesEth = [kase('all tokens', 'all tokens', 2041, -7.4, -9.9, {}), kase('Pool size', '$20-100k', 300, -1.5, -0.7, {}), kase('Venue', 'uniswap', 1500, -6, -8, {})];
const SOL_A = '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', ETH_A = '0x' + 'ab'.repeat(20), RH_DEV = '0x' + 'cd'.repeat(20);
const chaine = (nom, cases, extra) => Object.assign({ nom, depuis: '2026-09-27T10:00:00.000Z', cycles: 2970, recompute: { depuis: Date.parse('2026-10-03T16:00:00Z'), relus: 28000 },
  enCours: 40, compte: { decouverts: 30782, observes: 29730, jamaisIndexes: 512, disparus: 300, pleins: 0, erreurs: {} }, holders: null, cases, jev: null, devs: null,
  derniers: [] }, extra || {});
const ETAT = { actif: true, note: 'Observation only.', horizonMin: 30, chaines: {
  robinhood: chaine('Robinhood Chain', casesEth.map((c) => Object.assign({}, c)), { devs: { recorded: 8301, withThreeTokensOrMore: 422, withThreePlausibleLaunches: 2,
    pushers: [{ dev: RH_DEV, tokens: 9, plausibleLaunches: 5, doubled: 3, medianMultiple: 2.1, vanished: 1, reached100k: 1 },
      { dev: PIEGE, tokens: 4, plausibleLaunches: 3, doubled: 1, medianMultiple: 0.8, vanished: 2 }], bestAvgPeak: [], mostVanished: [] } }),
  solana: chaine('Solana', casesSol, { holders: 'unknown: the public Solana node refuses holder reads — set SOLANA_RPC_URL',
    derniers: [{ addr: SOL_A, dex: 'pumpswap', r: 42.4, t: Date.parse('2026-10-03T15:12:00Z') }, { addr: 'javascript:alert(1)', dex: PIEGE, r: -55, t: Date.parse('2026-10-03T15:10:00Z') },
      { addr: SOL_A, dex: 'meteora', r: null, t: Date.parse('2026-10-03T15:09:00Z') }] }),
  eth: chaine('Ethereum', casesEth, { devs: { recorded: 40, withThreeTokensOrMore: 1, withThreePlausibleLaunches: 0, pushers: [], bestAvgPeak: [], mostVanished: [] }, derniers: [{ addr: ETH_A, dex: 'uniswap', r: 3, t: Date.parse('2026-10-03T15:00:00Z') }] }) } };
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
  const ouvre = async (q, w) => {
    const ctx = await nav.newContext({ viewport: { width: w || 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
    await p.goto(base + 'swoge_colonies.html?' + q, { waitUntil: 'domcontentloaded' });
    return { p, ctx };
  };
  const lit = (p) => p.evaluate(() => {
    const $ = (s) => document.querySelector(s), t = (s) => ($(s) ? $(s).textContent : '');
    return { kpis: [...document.querySelectorAll('#kpis .ds-kpi')].map((k) => k.textContent), verdict: t('#verdict'), vcls: $('#verdict').className,
      lignes: [...document.querySelectorAll('#cases tr')].map((tr) => [...tr.children].map((td) => td.textContent)),
      vertes: [...document.querySelectorAll('#cases td')].filter((td) => td.style.color === 'rgb(14, 138, 79)').map((td) => td.parentNode.children[1].textContent),
      devsCache: $('#carteDevs').hidden, devs: [...document.querySelectorAll('#devs tr')].map((tr) => [...tr.children].map((td) => td.textContent)),
      devsNote: t('#devsNote'), derniers: [...document.querySelectorAll('#derniers tr')].map((tr) => tr.textContent),
      liens: [...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')), presses: [...document.querySelectorAll('#chaines [aria-pressed="true"]')].map((b) => b.dataset.c),
      statut: t('#statut'), pastille: t('#pastilleTxt'), casesNote: t('#casesNote'), pirate: window.pirate, imgs: document.querySelectorAll('main img').length };
  });
  const SURS = /^(https:\/\/dexscreener\.com\/(solana|ethereum|robinhood)\/|https:\/\/etherscan\.io\/address\/|https:\/\/robinhoodchain\.blockscout\.com\/address\/|[a-z_]+\.html)/;

  console.log('-- 1. Solana par defaut --');
  let { p, ctx } = await ouvre('server=' + encodeURIComponent(base + 'api'));
  await p.waitForFunction(() => document.querySelectorAll('#cases tr').length > 0);
  let r = await lit(p);
  ok(r.presses.join() === 'solana' && r.pastille === 'Observing live', 'Solana choisi par defaut, la pastille dit « Observing live »');
  ok(r.kpis.length === 4 && /29,730/.test(r.kpis[0]) && /30,782 discovered/.test(r.kpis[0]) && /-12\.3%/.test(r.kpis[2]) && /over 29,730 tokens/.test(r.kpis[2]), 'quatre chiffres, chacun avec son effectif : ' + r.kpis.slice(0, 3).join(' | '));
  ok(/unknown/.test(r.kpis[3]) && /refuses/.test(r.kpis[3]), 'les detenteurs : « unknown », la raison dite (noeud public)');
  ok(/^ds-verdict ok$/.test(r.vcls) && /1 case stands out/.test(r.verdict) && /t ≥ 2\.81/.test(r.verdict) && /10 cases tested/.test(r.verdict) && /Pool size = \$20-100k \(\+8\.5%, t 5\.2, 1,078 tokens\)/.test(r.verdict),
     'la barre pour 10 cases jugees : 2,81 ; seule « Pool size = $20-100k » sort, avec son effectif : ' + r.verdict.slice(0, 120));
  ok(!/under \$10k/.test(r.verdict) && r.vertes.join() === '$20-100k', 'un t fort avec une moyenne NEGATIVE (« under $10k », t 3,5) ne sort pas ; une seule case en vert');
  ok(/not a trade/.test(r.verdict), 'le verdict dit que c est une piste, pas un trade');
  const sous = r.lignes.find((l) => l[1] === PIEGE);
  ok(sous && sous.length === 4 && sous[3] === 'not enough (under 30)', 'une case de 12 jetons : « not enough (under 30) », aucun pourcentage');
  ok(r.lignes[0][0] === 'all tokens' && r.lignes[1][1] === '$20-100k', 'la reference d abord, puis les cases triees par t');
  ok(/Bar for 10 cases: t ≥ 2\.81/.test(r.casesNote) && /recomputed on 28,000 saved tokens on 2026-10-03/.test(r.casesNote), 'la note dit la barre et le recalcul (28 000 jetons relus le 03/10)');
  ok(r.devsCache === true, 'Solana : pas de carte des devs (aucun dev releve sur cette chaine)');
  const lienSol = r.liens.filter((h) => /dexscreener\.com\/solana\//.test(h));
  ok(lienSol.length === 2 && lienSol.every((h) => h === 'https://dexscreener.com/solana/' + SOL_A) && !r.liens.some((h) => /javascript/i.test(h)), 'derniers jetons : lien DexScreener pour une adresse Solana valide, aucun pour « javascript:… »');
  ok(r.derniers.some((t) => /vanished/.test(t)) && r.derniers.some((t) => /\+42\.4%/.test(t)), 'un jeton disparu dit « vanished », jamais -100 %');
  ok(r.pirate === undefined && r.imgs === 0, 'les noms pieges restent du texte : aucune image injectee, aucun script lance');
  ok(r.liens.every((h) => SURS.test(h)), 'aucun lien hors de DexScreener, des explorateurs connus et du site (' + r.liens.length + ' liens)');

  console.log('\n-- 2. Ethereum : rien ne sort --');
  await p.click('#chaines button[data-c="eth"]');
  r = await lit(p);
  ok(r.presses.join() === 'eth' && /chain=eth/.test(p.url()), 'le bouton Ethereum est presse, l adresse porte ?chain=eth');
  ok(/^ds-verdict non$/.test(r.vcls) && /Nothing stands out on Ethereum/.test(r.verdict) && /none of the 2 cases/.test(r.verdict) && /-7\.4%/.test(r.verdict),
     'rien ne sort : dit, avec le nombre de cases et la reference (-7,4 %) : ' + r.verdict.slice(0, 110));
  ok(r.devsCache === false && r.devs.length === 1 && /No dev has 3 plausible launches yet/.test(r.devs[0][0]), 'aucun pousseur sur Ethereum : dit, aucune ligne inventee');
  await ctx.close();

  console.log('\n-- 3. Robinhood : qui pousse --');
  ({ p, ctx } = await ouvre('chain=robinhood&server=' + encodeURIComponent(base + 'api')));
  await p.waitForFunction(() => document.querySelectorAll('#devs tr').length > 0);
  r = await lit(p);
  ok(r.presses.join() === 'robinhood' && r.devsCache === false, '?chain=robinhood ouvre directement Robinhood, la carte des devs visible');
  ok(r.devs.length === 2 && r.devs[0][1] === '5' && r.devs[0][2] === '3 (60%)' && r.devs[0][3] === '×2.1' && r.devs[0][4] === '1' && r.devs[0][5] === '9',
     'le premier pousseur : 5 lancements plausibles, 3 doubles (60 %), multiple median ×2.1, 1 disparu, 9 en tout');
  ok(r.liens.includes('https://robinhoodchain.blockscout.com/address/' + RH_DEV) && r.liens.filter((h) => /blockscout/.test(h)).length === 1, 'lien Blockscout pour l adresse valide, aucun pour le nom piege');
  ok(/8,301 devs recorded, 2 with 3 plausible launches/.test(r.devsNote), 'la note dit sur combien de devs : ' + r.devsNote.slice(0, 80));
  ok(r.pirate === undefined && r.imgs === 0, 'un dev au nom piege reste du texte');
  await ctx.close();

  console.log('\n-- 4. trop peu, puis serveur injoignable --');
  ({ p, ctx } = await ouvre('server=' + encodeURIComponent(base + 'vide')));
  await p.waitForFunction(() => document.querySelector('#verdict').textContent.length > 0);
  r = await lit(p);
  ok(/^ds-verdict peu$/.test(r.vcls) && /Not enough tokens yet/.test(r.verdict) && r.vertes.length === 0, 'aucune case a 30 jetons : aucun verdict, aucune case en vert');
  await ctx.close();
  ({ p, ctx } = await ouvre('server=' + encodeURIComponent(base + 'panne')));
  await p.waitForFunction(() => /could not be read/.test(document.querySelector('#statut').textContent));
  r = await lit(p);
  ok(r.pastille === 'Unreachable' && r.kpis.length === 0, 'serveur injoignable : « Unreachable », aucun chiffre invente');
  await ctx.close();

  console.log('\n-- 5. a 360 px --');
  for (const c of ['solana', 'robinhood']) {
    ({ p, ctx } = await ouvre('chain=' + c + '&server=' + encodeURIComponent(base + 'api'), 360));
    await p.waitForFunction(() => document.querySelectorAll('#cases tr').length > 0);
    const l = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(l <= 361, c + ' a 360 px : rien ne deborde (' + l + ' px)');
    await ctx.close();
  }
  await nav.close(); srv.close();
  fin();
})().catch((e) => { console.error('  RATE ' + (e.stack || e)); process.exit(1); });
function fin() { console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe')); process.exit(rates ? 1 : 0); }
