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
  ranking: [{ id: 'p_a', name: 'P·FV 1.5pt', resolved: 74, won: 41, pnl: 352.99 }, { id: 'fade', name: 'Longshot', resolved: 224, won: 8, pnl: -1224.77 },
    { id: 'p_b', name: '<img src=x onerror=window.pirate=8>', resolved: 12, won: 3, pnl: -80.1 }, { id: 'coin', name: 'Coin', resolved: 365, won: 195, pnl: -393.75 },
    { id: 'crowd', name: 'Crowd', resolved: 366, won: 313, pnl: 30.14 }, { id: 'p_c', name: 'P·Crowd>55¢', resolved: 0, won: 0, pnl: 0 }],
  summary: { total: 6, inProfit: 2, inLoss: 3, noSettledBet: 1, totalPnl: -1315.49, judgeable: 3 },
  agents: [agent('coin', 'Coin', { bets: 120, resolved: 118, won: 57, winRate: { p: 0.483, low: 0.395, high: 0.572 }, skill: -0.4, avgPricePaid: 0.51, pnl: -41.2, fees: 20.3, drawdown: 55.1, verdict: 'No edge: loses after the spread and fees (skill score -0.4).' }),
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

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
