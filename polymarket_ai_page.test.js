'use strict';
/* ============================================================================
 * POLYMARKET AI — la page montre la colonie papier telle que le serveur l'a mesuree
 *   1. les cinq agents, le temoin Coin marque, chaque chiffre avec son effectif,
 *      le verdict du serveur tel quel ;
 *   2. la calibration : aucun match annonce sous le minimum, puis qui du modele
 *      ou du marche est le mieux calibre ;
 *   3. paris ouverts et regles ; un lien seulement vers polymarket.com ;
 *   4. tout est du texte ; serveur injoignable dit ; rien ne deborde a 360 px ;
 *   5. un redemarrage du serveur n'efface rien a l'ecran : la derniere lecture reste, datee
 *      (29/09 : « on dirait que ca a perdu toutes ses donnees » pendant une mise en ligne).
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const agent = (id, name, o) => Object.assign({ id, name, role: 'Role of ' + name, bank: 1000, bets: 0, resolved: 0, won: 0, voided: 0, winRate: null, skill: null, avgPricePaid: null,
  pnl: 0, fees: 0, drawdown: 0, open: 0, verdict: 'Too few resolved bets to judge (0/100).' }, o || {});
const ETAT = (calib) => ({ ok: true, depuis: '2026-09-29T14:00:00.000Z', stakeUsd: 10, bankUsd: 1000, minResolved: 100,
  totalStrategies: 200, parametric: { running: 100, distinct: 2460, combinations: 110700, note: '<img src=x onerror=window.pirate=9> not simulated.' },
  /* Le classement, volontairement MELANGE : la page doit le trier elle-meme. */
  ranking: [{ id: 'p_a', name: 'P·FV 1.5pt', resolved: 74, won: 41, pnl: 352.99, nextJudgedAt: 500 }, { id: 'fade', name: 'Longshot', resolved: 224, won: 8, pnl: -1224.77, nextJudgedAt: null },
    { id: 'p_b', name: '<img src=x onerror=window.pirate=8>', resolved: 12, won: 3, pnl: -80.1, nextJudgedAt: 500 }, { id: 'coin', name: 'Coin', resolved: 365, won: 195, pnl: -393.75, nextJudgedAt: null },
    { id: 'crowd', name: 'Crowd', resolved: 366, won: 313, pnl: 30.14, nextJudgedAt: null }, { id: 'p_c', name: 'P·Crowd>55¢', resolved: 0, won: 0, pnl: 0, nextJudgedAt: 500 }],
  /* Le tournoi (30/09) : un retire au nom piege, un autre dont les paris se reglent encore ;
     sans aucune calibration (etat « vide »), aucun retire : la page doit le dire. */
  tournament: { threshold: 500, slots: 400, controls: 5, running: 405, retired: calib.n ? 2 : 0, parametricTried: calib.n ? 307 : 305, parametricUntried: calib.n ? 2153 : 2155,
    rule: 'A strategy still in the red after 500 settled bets is retired and replaced by a parameter set never tried before.',
    recentlyRetired: calib.n ? [{ id: 'p_x', name: '<img src=x onerror=window.pirate=7>', type: 'parametric', resolved: 500, won: 230, pnl: -61.4, retiredAt: '2026-10-02T08:15:00.000Z', final: false },
      { id: 'p_y', name: 'P·Fade>80¢ · 2:00–0:30 left', type: 'parametric', resolved: 503, won: 71, pnl: -12.05, retiredAt: '2026-10-01T22:40:00.000Z', final: true }] : [] },
  /* La preuve (30/09) : sans calibration (« vide »), personne n a 50 fenetres ; sinon une prometteuse au nom piege. */
  evidence: { since: '2026-09-30T19:00:00.000Z', minWindows: 50, tested: 405, bar: 3.67, measured: calib.n ? 2 : 0, proven: 0, promising: calib.n ? 1 : 0,
    rule: 'Bets placed in the same 15 minutes count as one observation.',
    leaders: calib.n ? [{ id: 'p_a', name: '<img src=x onerror=window.pirate=6>', windows: 61, skillPerWindow: 2.4, resolved: 150, pnl: 120.5 }, { id: 'crowd', name: 'Crowd', windows: 70, skillPerWindow: 0.3, resolved: 400, pnl: -3 }] : [],
    closest: [{ id: 'p_a', name: 'P·FV 1.5pt', windows: 12, skillPerWindow: 1.1, pnl: 30 }] },
  reality: calib.n ? { orderDelaySeconds: 2, repriced: 200, emptyBook: 7, paperPnl: -40.5, pnlAfterDelay: -95.25, avgPriceMoveAfterDelay: 0.012,
    trades: { marketsChecked: 8, betsChecked: 200, confirmedAtOurPrice: 150, noTradeWithin: 10, withinSeconds: 15, nextTradeSeconds: 30 },
    medianVolumeUsd: { BTC: 16734, ETH: 1083, SOL: null, XRP: 335 }, rule: 'Checked against <b>real</b> trades.' } : undefined,
  summary: { total: 6, inProfit: 2, inLoss: 3, noSettledBet: 1, totalPnl: -1315.49, judgeable: 3 },
  /* 01/10 : apres la selection. « vide » : personne de garde ; « peu » : trop tot ; « marche » : un verdict. */
  survivors: !calib.n ? { kept: 0, stillRunning: 0, retiredAfterKept: 0, resolved: 0, pnl: 0, pnlPerBet: null, coin: null, coinPerBet: null, minResolved: 500, enough: false, strategies: [], rule: 'Only bets settled AFTER <b>selection</b> count.' }
    : calib.enough ? { kept: 3, stillRunning: 2, retiredAfterKept: 1, resolved: 1200, pnl: -96, pnlPerBet: -0.08, coin: { resolved: 700, pnl: -77 }, coinPerBet: -0.11, minResolved: 500, enough: true,
        strategies: [{ id: 'p_a', name: '<img src=x onerror=window.pirate=5>', resolved: 640, won: 330, pnl: -41.2, pnlBefore: 352.99, windows: 70, skillPerWindow: -0.4 }], rule: 'r' }
    : { kept: 1, stillRunning: 1, retiredAfterKept: 0, resolved: 120, pnl: 12.5, pnlPerBet: 0.104, coin: { resolved: 120, pnl: -9 }, coinPerBet: -0.075, minResolved: 500, enough: false, strategies: [], rule: 'r' },
  agents: [agent('coin', 'Coin', { bets: 120, resolved: 118, won: 57, winRate: { p: 0.483, low: 0.395, high: 0.572 }, skill: -0.4, skillPerWindow: -0.3, windows: 42,
    real: { repriced: 30, emptyBook: 2, paperPnl: -5, pnlAfterDelay: -9.5, tradeChecked: 30, confirmedByTrade: 22 }, avgPricePaid: 0.51, pnl: -41.2, fees: 20.3, drawdown: 55.1, verdict: 'No edge: loses after the spread and fees (skill score -0.4).' }),
    agent('crowd', 'Crowd'), agent('fair', 'Fair Value', { role: 'Model <img src=x onerror=window.pirate=1>', pnl: 12.5 }), agent('late', 'Last Minute'), agent('fade', 'Longshot')],
  calibration: calib, open: [{ agent: 'fair', asset: 'BTC', window: '2026-09-29T14:15:00.000Z', side: 'Up', price: 0.55, fee: 0.315, model: 0.716, url: 'https://polymarket.com/event/btc-updown-15m-1790691300' }],
  recent: [{ agent: 'coin', asset: 'ETH', window: '2026-09-29T14:00:00.000Z', side: 'Down', price: 0.47, fee: 0.37, result: 'Up', pnl: -10.37, url: 'javascript:alert(1)' },
    { agent: 'fair', asset: 'SOL', window: '2026-09-29T14:00:00.000Z', side: 'Up', price: 0.6, fee: 0.28, result: 'Up', pnl: 6.39, url: 'https://polymarket.com/event/sol-updown-15m-1790690400' }],
  health: { ticks: 10, errors: 0 } });
const CALIBS = {
  vide: { n: 0, pending: 3, brierModel: null, brierMarket: null, enough: false, minN: 100, buckets: [] },
  peu: { n: 12, pending: 1, brierModel: 0.21, brierMarket: 0.19, enough: false, minN: 100, buckets: [{ range: '0.6–0.7', n: 12, upRate: 0.58, model: 0.65, market: 0.61 }] },
  marche: { n: 240, pending: 0, brierModel: 0.231, brierMarket: 0.198, enough: true, minN: 100, buckets: [] },
};
/* 01/10 : l historique par heure (le serveur garde les sommes) — 30 cases recentes de 4 fenetres,
   le modele a 0,20 de score par fenetre et le marche a 0,18 ; une case vieille de 3 jours en plus. */
const H0 = Math.floor(Date.now() / 3600000) * 3600000;
CALIBS.marche.hourlySince = new Date(H0 - 80 * 3600000).toISOString();
CALIBS.marche.hourly = [{ t: new Date(H0 - 72 * 3600000).toISOString(), n: 4, sqModel: 4, sqMarket: 0 }]
  .concat(Array.from({ length: 30 }, (x, i) => ({ t: new Date(H0 - (29 - i) * 3600000).toISOString(), n: 4, sqModel: 0.8, sqMarket: 0.72 })));
CALIBS.peu.hourly = []; CALIBS.peu.hourlySince = null;

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => { const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port, nav = await chromium.launch();
  async function ouvre(calib, larg, panne) {
    const ctx = await nav.newContext({ viewport: { width: larg || 1100, height: 900 } }), page = await ctx.newPage();
    await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      if (/\/poly\/etat$/.test(r.request().url()) && !(panne === true || (panne && panne.en))) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ETAT(CALIBS[calib])) });
      return r.fulfill({ status: 503, body: '' });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_polymarket_ai.html', { waitUntil: 'domcontentloaded' });
    return { page, ctx };
  }

  console.log('-- 1. les agents --');
  {
    const { page, ctx } = await ouvre('vide');
    await page.waitForFunction(() => document.querySelectorAll('#agents .agent').length === 5);
    const t = await page.textContent('#agents');
    ok(/Coin\s*control/.test(t) && (await page.$$('#agents .temoin')).length === 1, 'cinq agents, et Coin est marque comme le temoin');
    ok(/118 settled/.test(t) && /57 \(48\.3%, 95% range 39\.5%–57\.2%\)/.test(t) && /−\$41\.20/.test(t) && /\$20\.30/.test(t), 'chaque chiffre avec son effectif et sa marge : gagnes, taux et intervalle, gain apres frais, frais');
    ok(/No edge: loses after the spread and fees/.test(t) && /Too few resolved bets to judge \(0\/100\)/.test(t), 'le verdict du serveur tel quel, y compris « trop peu »');
    ok((await page.$('#agents img')) === null && !(await page.evaluate(() => window.pirate)), 'ce que dit le serveur est du texte, jamais du HTML');
    ok(/no verdict under 100 settled bets/.test(await page.textContent('#depuis')), 'la regle est dite en tete');
    /* 30/09 : la page n en montre que quelques-unes ; elle dit combien tournent, et ce qui n est pas simule. */
    const ef = await page.textContent('#effectif');
    ok(/^200 strategies running, including 100 parametric ones picked from 2,460 distinct behaviours\./.test(ef) && /not simulated/.test(ef)
       && await page.evaluate(() => !document.querySelector('#effectif img') && window.pirate === undefined), 'l effectif reel est dit en tete, en texte seulement [' + ef.slice(0, 60) + ']');
    /* 30/09 : « classe du plus gagnant au plus perdant ». */
    const cl = await page.evaluate(() => [...document.querySelectorAll('#clLignes tr')].map((tr) => ({ nom: tr.children[1].textContent, pnl: tr.children[4].textContent, gris: tr.classList.contains('peu') })));
    ok(cl.map((c) => c.nom).join('|') === 'P·FV 1.5pt|Crowd|P·Crowd>55¢|<img src=x onerror=window.pirate=8>|Coin (control)|Longshot',
       'le tableau classe les strategies du plus gagnant au plus perdant, meme si le serveur les envoie en desordre [' + cl.map((c) => c.pnl).join(' ') + ']');
    ok(cl[0].gris && !cl[1].gris && cl[4].gris === false, 'sous 100 paris regles, la ligne est grisee (pas un verdict) ; au-dela, non');
    ok(await page.evaluate(() => !document.querySelector('#clLignes img') && window.pirate === undefined), 'un nom de strategie est ecrit en texte, jamais en HTML');
    ok(/2 in profit, 3 at a loss, 1 with no settled bet yet/.test(await page.textContent('#clResume')), 'le resume dit combien gagnent et combien perdent');
    const juge = await page.evaluate(() => [...document.querySelectorAll('#clLignes tr')].map((tr) => tr.children[6].textContent));
    ok(juge.join('|') === '500|never|500|500|never|never', 'chaque ligne dit a quel palier elle sera jugee ; un temoin, jamais [' + juge.join(' ') + ']');
    const cartes = await page.evaluate(() => [...document.querySelectorAll('#agents .agent .tete .nom')].map((e) => e.textContent));
    const pnlCartes = await page.evaluate(() => [...document.querySelectorAll('#agents .agent .tete .pos, #agents .agent .tete .neg')].map((e) => parseFloat(e.textContent.replace(/[^0-9.\-−+]/g, '').replace('−', '-'))));
    ok(pnlCartes.every((x, i) => i === 0 || pnlCartes[i - 1] >= x), 'les cartes aussi, du plus gagnant au plus perdant [' + cartes.join(', ') + ']');
    await ctx.close();
  }

  console.log('\n-- 2. la calibration --');
  {
    let { page, ctx } = await ouvre('vide');
    await page.waitForFunction(() => document.getElementById('calibVerdict').textContent.length > 0);
    ok(/No window scored yet \(3 waiting/.test(await page.textContent('#calibVerdict')), 'rien de note : on le dit, avec ce qui attend son resultat');
    await ctx.close();
    ({ page, ctx } = await ouvre('peu'));
    await page.waitForFunction(() => document.getElementById('calibVerdict').textContent.length > 0);
    ok(/Too few windows to compare \(12\/100\)/.test(await page.textContent('#calibVerdict')) && !/better calibrated/.test(await page.textContent('#calibVerdict')), 'sous 100 fenetres : les chiffres, mais aucun gagnant annonce');
    ok(/58%/.test(await page.textContent('#seaux')), 'le detail par tranche de probabilite');
    await ctx.close();
    ({ page, ctx } = await ouvre('marche'));
    await page.waitForFunction(() => document.getElementById('calibVerdict').textContent.length > 0);
    ok(/The market has been better calibrated than the model over 240 windows/.test(await page.textContent('#calibVerdict')), 'au-dela : le marche mieux calibre que le modele est dit en clair');
    await ctx.close();
  }

  console.log('\n-- 3. les paris, les liens --');
  {
    const { page, ctx } = await ouvre('vide');
    await page.waitForFunction(() => document.querySelectorAll('#recents tr').length === 2);
    const o = await page.textContent('#ouverts'), r = await page.$$eval('#recents tr', (l) => l.map((x) => [x.textContent, x.querySelector('a') ? x.querySelector('a').getAttribute('href') : null]));
    ok(/Fair Value/.test(o) && /55¢/.test(o) && /Up 71\.6%/.test(o), 'un pari ouvert : l agent, le prix paye, la probabilite du modele');
    ok(/lost \(Up\)/.test(r[0][0]) && /−\$10\.37/.test(r[0][0]) && r[0][1] === null, 'un pari perdu, son resultat ; un lien qui n est pas polymarket.com n est jamais un lien');
    ok(/won \(Up\)/.test(r[1][0]) && r[1][1] === 'https://polymarket.com/event/sol-updown-15m-1790690400', 'un pari gagne, et le lien vers son marche');
    await ctx.close();
  }

  /* 30/09 : « au bout de 500 bets, s il est toujours en negatif, l agent se supprime et un
     nouveau jamais essaye apparait ; retenir tous les agents et parametres essayes ». */
  /* 30/09 : « il a un edge ? » — 3,15 sur 100 paris correles, meilleure de 405 : non prouve. */
  console.log('\n-- 3 bis. y a-t-il un vrai resultat ? --');
  {
    let { page, ctx } = await ouvre('vide');
    await page.waitForFunction(() => !document.getElementById('preuve').hidden);
    ok(/^Not yet: no strategy has 50 windows counted since 2026-09-30\.$/.test(await page.textContent('#prVerdict')), 'personne n a 50 fenetres : « pas encore », et depuis quand on compte');
    ok(/P·FV 1\.5pt/.test(await page.textContent('#prLignes')) && /12\/50/.test(await page.textContent('#prLignes')), 'on montre celles qui approchent (12/50 fenetres)');
    const t = await page.textContent('#agents');
    ok(/Skill per window-0\.3 over 42 windows \(per bet: -0\.4\)/.test(t), 'la carte : score par fenetre, sur combien de fenetres, et le score par pari pour comparer');
    await ctx.close();
    ({ page, ctx } = await ouvre('peu'));
    await page.waitForFunction(() => /promising/.test(document.getElementById('prVerdict').textContent));
    ok(/^Not yet\. 1 promising \(skill 2\+ per window\), none above the 3\.67 bar that 405 strategies tested require\.$/.test(await page.textContent('#prVerdict')),
       'une prometteuse sous la barre : « pas encore », avec la barre et le nombre essaye');
    const l = await page.evaluate(() => [...document.querySelectorAll('#prLignes tr')].map((tr) => [...tr.children].map((td) => td.textContent)));
    ok(l[0][0] === '<img src=x onerror=window.pirate=6>' && l[0][1] === '61' && l[0][2] === '2.4' && await page.evaluate(() => !document.querySelector('#preuve img') && window.pirate === undefined),
       'le meneur : nom en texte, fenetres, score par fenetre [' + l[0].join(' | ') + ']');
    const pr = await page.textContent('#prReel');
    ok(/^Could these bets really be placed\? A real order takes time to arrive: 200 settled bets were re-priced on the real Polymarket order book 2 s after the decision\./.test(pr)
       && /At those prices: −\$95\.25, against −\$40\.50 on paper \(the price moved \+1\.2¢ on average\); 7 bets would have found nothing left to buy\./.test(pr)
       && /150 of 200 saw our side trade at our price within 15 s/.test(pr) && /BTC \$16,734, ETH \$1,083, XRP \$335\./.test(pr) && /<b>real<\/b>/.test(pr),
       'le carnet relu apres le delai d un ordre, les echanges reels, le volume par actif — en texte [' + pr.slice(0, 80) + ']');
    ok(/Real order book30 bets re-priced after the order delay: −\$9\.50 \(paper −\$5\.00\) · 2 with nothing left to buy/.test(await page.textContent('#agents')), 'et sur la carte de l agent');
    const cl = await page.evaluate(() => [...document.querySelectorAll('#clLignes tr')].map((tr) => tr.children[5].textContent));
    ok(cl.every((x) => x === '\u2014'), 'le classement a sa colonne par fenetre (vide quand le serveur ne la donne pas)');
    await ctx.close();
  }

  console.log('\n-- 3 ter. le tournoi --');
  {
    let { page, ctx } = await ouvre('vide');
    await page.waitForFunction(() => !document.getElementById('tournoi').hidden);
    const ch = await page.textContent('#toChiffres');
    ok(/still in the red after 500 settled bets/.test(await page.textContent('#toRegle')), 'la regle est dite, telle que l ecrit le serveur');
    ok(/405 running \(5 controls that are never retired\)/.test(ch) && /0 retired so far/.test(ch) && /305 of 2,460 distinct parameter sets tried, 2,155 never tried yet/.test(ch),
       'combien tournent, combien de jeux de parametres essayes sur 2 460 [' + ch.slice(0, 90) + ']');
    ok(/Closest to its next judgement: P·FV 1\.5pt, 74\/500 settled bets/.test(ch), 'le plus proche du jugement, lu dans le classement (74/500), pas estime');
    ok(/No strategy retired yet: none has reached 500 settled bets in the red/.test(await page.textContent('#toLignes')), 'aucun retire : on le dit');
    await ctx.close();
    ({ page, ctx } = await ouvre('peu'));
    await page.waitForFunction(() => document.querySelectorAll('#toLignes tr').length === 2 && /2 retired/.test(document.getElementById('toChiffres').textContent));
    const r = await page.evaluate(() => [...document.querySelectorAll('#toLignes tr')].map((tr) => [...tr.children].map((td) => td.textContent)));
    ok(r[0][0] === '<img src=x onerror=window.pirate=7> (bets still settling)' && await page.evaluate(() => !document.querySelector('#tournoi img') && window.pirate === undefined),
       'le nom d un retire est du texte, jamais du HTML ; ses paris ouverts se reglent encore, on le dit');
    ok(r[0][1] === '500' && r[0][2] === '46%' && /−\$61\.40/.test(r[0][3]) && r[0][4] === '2026-10-02 08:15', 'son bilan au retrait : 500 regles, 46 % gagnes, −61,40 $, et quand [' + r[0].join(' | ') + ']');
    ok(r[1][0] === 'P·Fade>80¢ · 2:00–0:30 left' && /−\$12\.05/.test(r[1][3]), 'un retire dont tout est regle : son bilan definitif');
    await ctx.close();
  }

  console.log('\n-- 4. panne, 360 px --');
  {
    let { page, ctx } = await ouvre('vide', 1100, true);
    await page.waitForFunction(() => /server is restarting/.test(document.getElementById('statut').textContent));
    ok(/nothing is lost/.test(await page.textContent('#statut')), 'serveur injoignable, sans lecture gardee : on le dit, et qu aucune donnee n est perdue');
    await ctx.close();
    ({ page, ctx } = await ouvre('peu', 360));
    await page.waitForFunction(() => document.querySelectorAll('#agents .agent').length === 5);
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 360 px, rien ne deborde [' + larg + ']');
    await ctx.close();
  }

  console.log('\n-- 5. un redemarrage du serveur n efface rien --');
  {
    const panne = { en: false };
    const { page, ctx } = await ouvre('peu', 1100, panne);
    await page.waitForFunction(() => document.querySelectorAll('#agents .agent').length === 5 && /Updated/.test(document.getElementById('statut').textContent));
    panne.en = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /server is restarting/.test(document.getElementById('statut').textContent), null, { timeout: 15000 });
    const t = await page.textContent('#agents'), st = await page.textContent('#statut');
    ok((/118 settled/.test(t) && (await page.$$('#agents .agent')).length === 5), 'page rouverte pendant la panne : les cinq agents et leurs chiffres sont toujours la');
    ok(/Showing the last reading, from \d\d:\d\d UTC/.test(st) && /retrying every 10 seconds/.test(st), 'et la page dit que c est la derniere lecture, datee, et qu elle reessaie');
    panne.en = false;
    await page.waitForFunction(() => /Updated/.test(document.getElementById('statut').textContent), null, { timeout: 15000 });
    ok(true, 'le serveur revient : la page se remet a jour seule en moins de 15 s');
    const cle = await page.evaluate(() => localStorage.getItem('swogePolyEtat') || '');
    ok(!/key|secret|0x[0-9a-f]{64}/i.test(cle) && cle.length > 0, 'ce qui est garde dans le navigateur : la vue publique, rien d autre');
    await ctx.close();
  }

  /* 01/10 : la refonte (« blanc dominant, paper trading only, aucune fausse donnee ») — chaque
     nouveau bloc est lu sur /poly/etat, et dit « -- » ou se tait quand la donnee manque. */
  console.log('\n-- 6. la refonte : etat, marches, periodes, onglets --');
  {
    let { page, ctx } = await ouvre('peu');
    await page.waitForFunction(() => document.querySelectorAll('#kpis .ds-kpi').length === 6 && document.querySelectorAll('#agents .agent').length === 5);
    ok(/paper trading only/i.test(await page.textContent('.ds-hero .ds-badges')), 'le badge « paper trading only » est en tete');
    const k = await page.evaluate(() => [...document.querySelectorAll('#kpis .ds-kpi')].map((e) => e.textContent));
    ok(/Strategies running200/.test(k[0]) && /Settled paper bets1,041/.test(k[1]) && /Combined paper P&L−\$1,315/.test(k[2]) && /fake money/.test(k[2]),
       'les cartes d etat : strategies, paris regles (somme du classement), P&L papier dit comme tel [' + k.slice(0, 3).join(' | ') + ']');
    ok(/Proven edges0/.test(k[3]) && /above 3\.67/.test(k[3]) && /0\.21 \/ 0\.19/.test(k[4]) && /too few to compare/.test(k[4]) && /75%/.test(k[5]) && /of 200 bets/.test(k[5]),
       'aucune preuve, calibration sous le minimum dite « trop peu », controle des vrais echanges (150/200)');
    const m = await page.evaluate(() => [...document.querySelectorAll('#marches .marche')].map((e) => [e.textContent, e.querySelector('a') && e.querySelector('a').href]));
    ok(m.length === 1 && /BTC/.test(m[0][0]) && /1 open bet/.test(m[0][0]) && /Up 71\.6%/.test(m[0][0]) && /Up at 55¢/.test(m[0][0]) && m[0][1] === 'https://polymarket.com/event/btc-updown-15m-1790691300',
       'les marches en cours : lus dans les paris ouverts, avec le lien polymarket.com');
    ok(/Window closed/.test(m[0][0]), 'une fenetre deja finie ne montre pas de compte a rebours invente');
    ok(/Hourly history starts with the first window scored after this update/.test(await page.textContent('#graphe')) && !(await page.$('#graphe svg')),
       'sans historique horaire : aucune courbe, on dit quand elle commencera');
    ok(await page.isHidden('#boiteRecents') && /2026|UTC/.test(await page.textContent('#ouverts')), 'les paris ouverts d abord');
    await page.click('#ongRecents');
    ok(await page.isVisible('#boiteRecents') && await page.isHidden('#boiteOuverts') && (await page.getAttribute('#ongRecents', 'aria-selected')) === 'true', 'l onglet « Settled » montre les paris regles');
    ok(await page.isHidden('#toutes'), 'cinq agents : pas de bouton « tout montrer »');
    await ctx.close();
    ({ page, ctx } = await ouvre('marche'));
    await page.waitForFunction(() => !!document.querySelector('#graphe svg'));
    let t = await page.textContent('#periodeTxt');
    ok(/^Last 24 hours: 100 windows scored · model 0\.2 · market 0\.18 — the market was better calibrated over this period\.$/.test(t),
       'sur 24 h : chaque case qui touche la periode compte (25 cases de 4 fenetres), et le marche mieux calibre [' + t + ']');
    ok((await page.$$('#graphe svg path')).length === 2, 'deux courbes : le modele et le marche');
    await page.click('#periodes button[data-h="6"]');
    t = await page.textContent('#periodeTxt');
    ok(/^Last 6 hours: 28 windows scored/.test(t) && /too few to compare \(28\/100\)/.test(t) && !/better calibrated/.test(t), 'sur 6 h : 28 fenetres, sous 100 — aucun gagnant nomme [' + t + ']');
    await page.click('#periodes button[data-h="168"]');
    t = await page.textContent('#periodeTxt');
    ok(/^Last 7 days: 124 windows scored · model 0\.2258 · market 0\.1742/.test(t), 'sur 7 jours : la case de 3 jours entre dans le calcul (28/124 et 21,6/124) [' + t + ']');
    await ctx.close();
  }

  console.log('\n-- 7. les gardees, apres leur selection --');
  {
    let { page, ctx } = await ouvre('vide');
    await page.waitForFunction(() => !document.getElementById('survie').hidden);
    ok(/^Not measurable yet: no strategy has passed its first check\. The closest has 74 of 500 settled bets\.$/.test(await page.textContent('#svVerdict')) && /<b>selection<\/b>/.test(await page.textContent('#svRegle')),
       'personne de garde : « pas encore mesurable », et la plus proche du premier jugement (74/500) ; la regle en texte');
    await ctx.close();
    ({ page, ctx } = await ouvre('peu'));
    await page.waitForFunction(() => /Too early/.test(document.getElementById('svVerdict').textContent));
    ok(/1 strategy kept, 120 of 500 settled bets since selection\. No verdict yet\./.test(await page.textContent('#svVerdict')) && !/made money/.test(await page.textContent('#svVerdict')),
       'sous 500 paris apres selection : « trop tot », meme a +12,50 $');
    await ctx.close();
    ({ page, ctx } = await ouvre('marche'));
    await page.waitForFunction(() => /lost money/.test(document.getElementById('svVerdict').textContent));
    const vt = await page.textContent('#svVerdict');
    ok(/lost money after being kept: −\$96\.00 over 1,200 settled bets \(−\$0\.08 per bet, against −\$0\.11 for Coin over the same period\)\./.test(vt), 'au-dela : le P&L apres selection, par pari, contre Coin sur la meme periode [' + vt.slice(0, 120) + ']');
    const l = await page.evaluate(() => [...document.querySelectorAll('#svLignes tr')].map((tr) => [...tr.children].map((td) => td.textContent)));
    ok(l[0][0] === '<img src=x onerror=window.pirate=5>' && l[0][1] === '+$352.99' && l[0][4] === '−$41.20' && await page.evaluate(() => window.pirate === undefined),
       'chaque gardee : son gain AVANT (qui l a fait garder) a part de son P&L APRES ; nom en texte');
    await ctx.close();
  }

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
