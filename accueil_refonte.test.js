'use strict';
/* L'accueil en douze sections (01/10/2026) : « blanc dominant, aucune fausse donnee, ne casse
   rien ». Ce que l essai tient : les douze sections sont la, dans l ordre ; tout ce qui vivait
   avant y est encore (economie, classement, offre, liste IA, sport) ; les chiffres de la colonie
   viennent du serveur avec leur effectif, et disent « -- » sans lui ; plus aucune promesse
   invérifiable (« 24/7 », « fastest withdrawals ») ; chaque lien des sections repond au clic ;
   les images et films neufs existent et sont legers ; rien ne deborde a 360 px. */
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.mp4': 'video/mp4' };
const PERP = { bilan: { n: 103, netReel: -0.399, seReel: 0.103, jugeable: false, seuil: 143 } };
const PRED = { toutesCaisses: { trades: 1104, winRate: 49.1, wilson: [46.2, 52.1] }, parConfiance: { pointMort: 51.5 } };
/* 11/10 : les chiffres de l instantane public /poly/etat du 11/10 22:24 UTC (audit des colonies) : une strategie
   au-dessus de la barre sur 1 458 essayees — une CANDIDATE, jamais « proven » ni « edge » —, et les gardees qui
   perdent apres selection (−0,598 $ par pari sur 89 050, Coin −0,917 $). */
const POLY = { evidence: { tested: 1458, proven: 1, bar: 3.98, minWindows: 50 }, calibration: { n: 4596, enough: true, brierModel: 0.1259, brierMarket: 0.1198 },
  survivors: { kept: 146, resolved: 89050, pnl: -53260.75, pnlPerBet: -0.598, coinPerBet: -0.917, minResolved: 500, enough: true } };
/* Relecture du 12/10 : l autre branche de la carte — aucune candidate, et des gardees EN GAIN apres selection :
   « 0 candidates », et rien sur des gardees qui perdent. */
const POLY_ZERO = { evidence: { tested: 405, proven: 0, bar: 3.67, minWindows: 50 }, calibration: { n: 558, enough: true, brierModel: 0.1073, brierMarket: 0.1036 },
  survivors: { kept: 3, resolved: 1600, pnl: 41.5, pnlPerBet: 0.026, coinPerBet: -0.9, minResolved: 500, enough: true } };

console.log('-- 1. les fichiers --');
const src = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
for (const f of ['hero', 'ia', 'colonie', 'jeux', 'bet', 'agents', 'economie', 'wallet', 'cta']) {
  const p = path.join(SITE, 'img/site/accueil/' + f + '.webp');
  ok(fs.existsSync(p) && fs.statSync(p).size < 200 * 1024 && src.includes('img/site/accueil/' + f + '.webp'), f + '.webp : present, sous 200 Ko, utilise');
}
/* 01/10 : « manque des videos a animer » — les neuf visuels sont des films. */
for (const f of ['hero', 'jeux', 'cta', 'ia', 'colonie', 'bet', 'agents', 'economie', 'wallet']) {
  const p = path.join(SITE, 'media/accueil_' + f + '.mp4');
  ok(fs.existsSync(p) && fs.statSync(p).size < 1.5 * 1024 * 1024 && src.includes('media/accueil_' + f + '.mp4'), 'accueil_' + f + '.mp4 : present, sous 1,5 Mo, utilise');
}
ok(!/24\/7|Fastest withdrawals|Provably fair/i.test(src.replace(/<!--[\s\S]*?-->/g, '')), 'aucune promesse invérifiable dans la page (24/7, fastest withdrawals, provably fair)');

(async () => {
  if (!chromium) { console.log('playwright absent : partie navigateur ignoree'); return fin(); }
  const srv = http.createServer((q, r) => { const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  async function ouvre(larg, panne, poly) {
    const ctx = await nav.newContext({ viewport: { width: larg, height: 900 } }), page = await ctx.newPage();
    const vus = [];
    await page.route((u) => !u.href.startsWith(base), (r) => {
      const u = r.request().url(); vus.push(u);
      const j = (b) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
      if (!panne && /\/ai\/perp$/.test(u)) return j(PERP);
      if (!panne && /\/predict\/etat$/.test(u)) return j(PRED);
      if (!panne && /\/poly\/etat$/.test(u)) return j(poly || POLY);
      return r.fulfill({ status: 503, body: '' });
    });
    await page.goto(base + 'index.html', { waitUntil: 'domcontentloaded' });
    return { page, ctx, vus };
  }
  console.log('\n-- 2. les douze sections --');
  {
    const { page, ctx, vus } = await ouvre(1440);
    const ordre = await page.evaluate(() => {
      const t = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + scrollY : -1; };
      return [t('.sw-haut'), t('.acc-hero'), t('#accTEco'), t('#accTIa'), t('#accTCol'), t('#accTJeu'), t('#accTBet'), t('#accTAg'), t('#accTSw'), t('#accTWal'), t('#accTCta'), t('.acc-pied')];
    });
    ok(ordre.every((y, i) => y >= 0 && (i === 0 || y > ordre[i - 1])), 'en-tete, heros, ecosysteme, IA, colonie, jeu, SWOGE BET, agents, $SWOGE, portefeuille, dernier appel, pied — dans cet ordre');
    const garde = await page.evaluate(() => ['#ecoCarte', '#gxRangCarte', '#gxMonde2', '#gxMonde3', '#gxSports', '.ia-liste', '.carte.bonus', '.univers', '#cxVoile'].filter((s) => !document.querySelector(s)));
    ok(garde.length === 0, 'tout ce qui vivait avant est encore la (economie, classement, offre, liste IA, sport, univers, connexion) ' + garde.join(' '));
    ok(!vus.some((u) => /\/poly\/etat$/.test(u)), 'avant de descendre, /poly/etat (180 Ko) n est pas demande');
    /* Les neuf films neufs (media/accueil_*) ; ceux d avant (casino, sport, arcade, poker, roulette) restent tels quels. */
    const films = await page.evaluate(() => [...document.querySelectorAll('main.acc video.film')].map((v) => ({ d: v.getAttribute('data-src'), s: v.getAttribute('src') })).filter((f) => /accueil_/.test(f.d || f.s || '')));
    ok(films.length === 9 && films.filter((f) => f.d).length === 8 && !films.find((f) => /wallet/.test(f.d || '')).s, 'neuf films ; hors du heros, aucun ne se charge avant d approcher de l ecran ' + JSON.stringify(films));
    await page.evaluate(() => document.querySelector('video[data-src*="wallet"]').scrollIntoView());
    await page.waitForFunction(() => !!document.querySelector('video[data-src*="wallet"]').getAttribute('src'), null, { timeout: 5000 });
    ok(true, 'arrive a l ecran, le film du portefeuille se charge et joue');
    await page.evaluate(() => document.getElementById('accColonie').scrollIntoView());
    await page.waitForFunction(() => /candidate/.test(document.querySelector('[data-m="poly"] b').textContent), null, { timeout: 8000 });
    const m = await page.$$eval('#accColonie .acc-m', (l) => l.map((a) => [a.querySelector('b').textContent, a.querySelector('span').textContent]));
    ok(m[0][0] === '-0.40% / trade' && /over 103 closed trades/.test(m[0][1]) && /not judgeable below 143/.test(m[0][1]), 'AI Perps : net par trade aux frais reels, son effectif, et « pas jugeable » [' + m[0].join(' | ') + ']');
    ok(m[1][0] === '49.1% right' && /1,104 calls/.test(m[1][1]) && /51\.5% is needed/.test(m[1][1]), 'Predict : le taux juste, sur combien d appels, contre le point mort');
    ok(m[2][0] === '1 candidate' && /unconfirmed, out of 1,458 strategies tested/.test(m[2][1]) && /not valid at extreme prices/.test(m[2][1]) && /Over 4,596 windows, the market was better calibrated/.test(m[2][1]),
       'Polymarket AI : 1 candidate non confirmee sur 1 458, la barre pas valide aux prix extremes, le marche mieux calibre [' + m[2].join(' | ') + ']');
    ok(/Kept strategies lose after selection: −\$0\.60 per bet over 89,050 settled bets/.test(m[2][1]), 'et les gardees perdent apres selection : −0,60 $ par pari sur 89 050');
    ok(!/edge|proven/i.test(m[2].join(' ')), 'la carte ne dit jamais « edge » ni « proven » pour une candidate');
    const morts = await page.evaluate(() => [...document.querySelectorAll('main.acc a[href], main.acc button')].filter((e) => getComputedStyle(e).pointerEvents === 'none' && e.offsetParent).map((e) => e.textContent.trim().slice(0, 30)));
    ok(morts.length === 0, 'chaque lien et bouton des sections repond au clic ' + JSON.stringify(morts.slice(0, 5)));
    await ctx.close();
  }
  console.log('\n-- 2b. aucune candidate, gardees en gain --');
  {
    const { page, ctx } = await ouvre(1440, false, POLY_ZERO);
    await page.evaluate(() => document.getElementById('accColonie').scrollIntoView());
    await page.waitForFunction(() => /candidate/.test(document.querySelector('[data-m="poly"] b').textContent), null, { timeout: 8000 });
    const m = await page.$$eval('[data-m="poly"]', (l) => [l[0].querySelector('b').textContent, l[0].querySelector('span').textContent]);
    ok(m[0] === '0 candidates' && /out of 405 strategies tested/.test(m[1]) && /not valid at extreme prices/.test(m[1]) && !/Kept strategies lose/.test(m[1]) && !/edge|proven/i.test(m.join(' ')),
       'zero candidate : « 0 candidates », la barre pas valide aux prix extremes ; gardees en gain : rien sur une perte ; jamais « edge » ni « proven » [' + m.join(' | ') + ']');
    await ctx.close();
  }
  console.log('\n-- 3. sans serveur, et a 360 px --');
  {
    const { page, ctx } = await ouvre(360, true);
    await page.evaluate(() => document.getElementById('accColonie').scrollIntoView());
    await page.waitForFunction(() => /did not answer/.test(document.querySelector('[data-m="perp"] span').textContent), null, { timeout: 8000 });
    ok(await page.$$eval('#accColonie .acc-m b', (l) => l.every((b) => b.textContent === '--')), 'serveur muet : « -- » partout, jamais un zero');
    const deb = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(deb <= 1, 'a 360 px, rien ne deborde [' + deb + ']');
    await ctx.close();
  }
  await nav.close(); srv.close(); fin();
})().catch((e) => { console.error(e); process.exit(1); });
function fin() { console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe')); process.exit(rates ? 1 : 0); }
