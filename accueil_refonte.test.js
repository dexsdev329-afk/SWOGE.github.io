'use strict';
/* L'accueil en douze sections (01/10/2026) : « blanc dominant, aucune fausse donnee, ne casse
   rien ». Ce que l essai tient : les douze sections sont la, dans l ordre ; tout ce qui vivait
   avant y est encore (economie, classement, offre, liste IA, sport) ; les chiffres de la colonie
   viennent du serveur avec leur effectif, et disent « -- » sans lui ; plus aucune promesse
   invérifiable (« 24/7 », « fastest withdrawals ») ; chaque lien des sections repond au clic ;
   les images et films neufs existent et sont legers ; rien ne deborde a 360 px.
   14/10/2026 (suite) : Polymarket AI est retiree a son tour, apres AI Perps et Predict (demande du
   proprietaire ; colonie eteinte cote serveur, POLY_PAPIER=0). La section « colonie » n avait plus
   aucune carte : elle part. L intention qui reste : onze sections dans l ordre, aucun chiffre de
   colonie retiree n est montre ni DEMANDE au serveur, aucun lien ne mene a une page retiree. */
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.mp4': 'video/mp4' };
/* 14/10/2026 : AI Perps, Predict puis Polymarket AI sont retirees du site (demande du proprietaire). Leurs
   reponses restent servies ici pour une seule raison : prouver que l accueil ne les demande PLUS. */
const PERP = { bilan: { n: 103, netReel: -0.399, seReel: 0.103, jugeable: false, seuil: 143 } };
const PRED = { toutesCaisses: { trades: 1104, winRate: 49.1, wilson: [46.2, 52.1] }, parConfiance: { pointMort: 51.5 } };
/* L instantane public /poly/etat du 11/10 22:24 UTC (sous-ensemble) : servi, jamais demande. */
const POLY = { evidence: { tested: 1458, proven: 1, bar: 3.98, minWindows: 50 } };

console.log('-- 1. les fichiers --');
const src = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
/* 14/10/2026 : colonie.webp et accueil_colonie.mp4 restent dans le depot, plus dans la page. */
for (const f of ['hero', 'ia', 'jeux', 'bet', 'agents', 'economie', 'wallet', 'cta']) {
  const p = path.join(SITE, 'img/site/accueil/' + f + '.webp');
  ok(fs.existsSync(p) && fs.statSync(p).size < 200 * 1024 && src.includes('img/site/accueil/' + f + '.webp'), f + '.webp : present, sous 200 Ko, utilise');
}
/* 01/10 : « manque des videos a animer » — les visuels sont des films (huit depuis le 14/10). */
for (const f of ['hero', 'jeux', 'cta', 'ia', 'bet', 'agents', 'economie', 'wallet']) {
  const p = path.join(SITE, 'media/accueil_' + f + '.mp4');
  ok(fs.existsSync(p) && fs.statSync(p).size < 1.5 * 1024 * 1024 && src.includes('media/accueil_' + f + '.mp4'), 'accueil_' + f + '.mp4 : present, sous 1,5 Mo, utilise');
}
ok(!src.includes('accueil_colonie') && !src.includes('img/site/accueil/colonie.webp') && !/id="accColonie"|data-m="/.test(src), 'la section colonie est partie : ni film, ni affiche, ni carte de mesure');
/* Et aucun script de la page ne lit plus une colonie retiree (le defilement seul ne le prouverait pas :
   un saut jusqu en bas peut passer une section sans que l observateur la voie). */
ok(!/\/poly\/etat|\/ai\/perp|\/predict\/etat/.test(src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'aucun script de l accueil ne lit /poly/etat, /ai/perp ni /predict/etat');
ok(!/24\/7|Fastest withdrawals|Provably fair/i.test(src.replace(/<!--[\s\S]*?-->/g, '')), 'aucune promesse invérifiable dans la page (24/7, fastest withdrawals, provably fair)');

(async () => {
  if (!chromium) { console.log('playwright absent : partie navigateur ignoree'); return fin(); }
  const srv = http.createServer((q, r) => { const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  async function ouvre(larg, panne) {
    const ctx = await nav.newContext({ viewport: { width: larg, height: 900 } }), page = await ctx.newPage();
    const vus = [];
    await page.route((u) => !u.href.startsWith(base), (r) => {
      const u = r.request().url(); vus.push(u);
      const j = (b) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
      if (!panne && /\/ai\/perp$/.test(u)) return j(PERP);
      if (!panne && /\/predict\/etat$/.test(u)) return j(PRED);
      if (!panne && /\/poly\/etat$/.test(u)) return j(POLY);
      return r.fulfill({ status: 503, body: '' });
    });
    await page.goto(base + 'index.html', { waitUntil: 'domcontentloaded' });
    return { page, ctx, vus };
  }
  console.log('\n-- 2. les onze sections --');
  {
    const { page, ctx, vus } = await ouvre(1440);
    const ordre = await page.evaluate(() => {
      const t = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + scrollY : -1; };
      return [t('.sw-haut'), t('.acc-hero'), t('#accTEco'), t('#accTIa'), t('#accTJeu'), t('#accTBet'), t('#accTAg'), t('#accTSw'), t('#accTWal'), t('#accTCta'), t('.acc-pied')];
    });
    ok(ordre.every((y, i) => y >= 0 && (i === 0 || y > ordre[i - 1])), 'en-tete, heros, ecosysteme, IA, jeu, SWOGE BET, agents, $SWOGE, portefeuille, dernier appel, pied — dans cet ordre');
    const garde = await page.evaluate(() => ['#ecoCarte', '#gxRangCarte', '#gxMonde2', '#gxMonde3', '#gxSports', '.ia-liste', '.carte.bonus', '.univers', '#cxVoile'].filter((s) => !document.querySelector(s)));
    ok(garde.length === 0, 'tout ce qui vivait avant est encore la (economie, classement, offre, liste IA, sport, univers, connexion) ' + garde.join(' '));
    /* Les films neufs (media/accueil_*) ; ceux d avant (casino, sport, arcade, poker, roulette) restent tels quels. */
    const films = await page.evaluate(() => [...document.querySelectorAll('main.acc video.film')].map((v) => ({ d: v.getAttribute('data-src'), s: v.getAttribute('src') })).filter((f) => /accueil_/.test(f.d || f.s || '')));
    ok(films.length === 8 && films.filter((f) => f.d).length === 7 && !films.find((f) => /wallet/.test(f.d || '')).s, 'huit films ; hors du heros, aucun ne se charge avant d approcher de l ecran ' + JSON.stringify(films));
    await page.evaluate(() => document.querySelector('video[data-src*="wallet"]').scrollIntoView());
    await page.waitForFunction(() => !!document.querySelector('video[data-src*="wallet"]').getAttribute('src'), null, { timeout: 5000 });
    ok(true, 'arrive a l ecran, le film du portefeuille se charge et joue');
    /* Toute la page defile jusqu en bas : aucune lecture d une colonie retiree ne part, a aucun moment. */
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(1200);
    const lus = vus.filter((u) => /\/ai\/perp$|\/predict\/etat$|\/poly\/etat$/.test(u));
    ok(lus.length === 0, 'pages retirees : ni /ai/perp, ni /predict/etat, ni /poly/etat ne sont demandes, meme en bas de page ' + JSON.stringify(lus));
    const retirees = await page.$$eval('a[href]', (l) => l.map((a) => a.getAttribute('href')).filter((h) => /^swoge_(perp|predict|sol_ai|eth_ai|colonies|polymarket_ai)\.html/.test(h)));
    ok(retirees.length === 0, 'aucun lien de l accueil vers une page retiree ' + JSON.stringify(retirees));
    const morts = await page.evaluate(() => [...document.querySelectorAll('main.acc a[href], main.acc button')].filter((e) => getComputedStyle(e).pointerEvents === 'none' && e.offsetParent).map((e) => e.textContent.trim().slice(0, 30)));
    ok(morts.length === 0, 'chaque lien et bouton des sections repond au clic ' + JSON.stringify(morts.slice(0, 5)));
    await ctx.close();
  }
  console.log('\n-- 3. sans serveur, et a 360 px --');
  {
    const { page, ctx } = await ouvre(360, true);
    const deb = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(deb <= 1, 'a 360 px, rien ne deborde [' + deb + ']');
    await ctx.close();
  }
  await nav.close(); srv.close(); fin();
})().catch((e) => { console.error(e); process.exit(1); });
function fin() { console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe')); process.exit(rates ? 1 : 0); }
