'use strict';
/* ============================================================================
 * SWOGE AGENTS — UNE PAGE, DEUX ONGLETS, ET CHACUN GARDE SES MAINS
 *
 * `swoge_agents.html` est generee depuis swolemind.html et swogeagentic.html
 * (`node outils/fusionne_agents.js`). Ce que cet essai tient :
 *   1. la page correspond a ses sources — sinon il donne la commande ;
 *   2. aucun identifiant en double, aucun <script> dans un autre, chaque
 *      script se lit : la premiere fusion, faite a la main, avait injecte le
 *      code des onglets dans neuf scripts et plus rien ne tournait ;
 *   3. dans un vrai navigateur : aucune erreur de script, un onglet a la fois,
 *      `?mode=agent` ouvre l agent, une suggestion de l agent remplit SA zone
 *      et pas celle du chat (et l inverse), rien ne deborde a 360 px.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const SITE = __dirname;
const { fusionne, CIBLE } = require('./outils/fusionne_agents.js');
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const page = fs.readFileSync(path.join(SITE, CIBLE), 'utf8');

console.log('\n-- la page est celle que donnent ses sources --');
ok(page === fusionne(), page === fusionne() ? CIBLE + ' est a jour' : CIBLE + ' est perimee — lancer node outils/fusionne_agents.js');

console.log('\n-- deux pages dans un document, sans se marcher dessus --');
const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const doubles = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
ok(doubles.length === 0, doubles.length ? 'identifiants en double : ' + doubles.join(', ') : 'aucun identifiant en double (' + ids.length + ')');
const scripts = [...page.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const ouverts = (page.match(/<script[\s>]/g) || []).length;
ok(ouverts === scripts.length, 'chaque <script> est ferme une fois (' + scripts.length + ')');
const imbriques = scripts.filter((m) => /<script[\s>]/.test(m[2]));
ok(imbriques.length === 0, 'aucun <script> a l interieur d un autre');
const illisibles = scripts.filter((m) => m[2].trim()).filter((m) => { try { new vm.Script(m[2]); return false; } catch (e) { return true; } });
ok(illisibles.length === 0, illisibles.length ? illisibles.length + ' script(s) ne se lisent pas' : 'chaque script en ligne se lit comme du JavaScript');
ok(!/href="swolemind\.html"|href="swogeagentic\.html"/.test(page.slice(0, page.indexOf('<main'))), 'le menu de la page ne renvoie plus vers les anciennes pages');
const menus = fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).filter((f) => /<nav class="sw-nav">[\s\S]*?(swolemind|swogeagentic)\.html[\s\S]*?<\/nav>/.test(fs.readFileSync(path.join(SITE, f), 'utf8')));
ok(menus.length === 0, menus.length ? 'menus qui listent encore les anciennes pages : ' + menus.join(', ') : 'aucun menu du site ne liste encore les deux anciennes pages');

let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
(async () => {
  if (!chromium) { console.log('\nplaywright absent : partie navigateur ignoree'); return fin(); }
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  const ouvre = async (q, largeur) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1200, height: 900 } });
    const p = await ctx.newPage();
    const erreurs = [];
    p.on('pageerror', (e) => erreurs.push(String(e.message || e)));
    /* Rien ne sort : le serveur de jeu et les CDN sont hors de l essai. */
    await p.route('**/*', (r) => r.request().url().startsWith(base) ? r.continue() : r.abort());
    await p.goto(base + CIBLE + (q || ''), { waitUntil: 'load' });
    await p.waitForTimeout(300);
    return { p, ctx, erreurs };
  };
  const visible = (p, id) => p.evaluate((i) => { const e = document.getElementById(i); return !!e && e.offsetParent !== null; }, id);

  console.log('\n-- dans un navigateur --');
  let { p, ctx, erreurs } = await ouvre('');
  ok(erreurs.length === 0, erreurs.length ? 'erreurs de script : ' + erreurs.slice(0, 3).join(' | ') : 'aucune erreur de script au chargement');
  ok(await visible(p, 'question') && !(await visible(p, 'ag-question')), 'par defaut, le chat est affiche et l agent cache');
  await p.click('#ongletAgent');
  ok(await visible(p, 'ag-question') && !(await visible(p, 'question')), 'un clic sur Agent montre l agent et cache le chat');
  ok(/[?&]mode=agent/.test(p.url()), 'l adresse garde l onglet (?mode=agent), pour un lien partageable');
  ok((await p.$eval('#ag-question', (t) => t.offsetHeight)) >= 20, 'la zone de saisie de l agent a sa hauteur une fois affichee');
  await p.click('#ag-accueil .suggestion');
  const agT = await p.$eval('#ag-question', (t) => t.value), chT = await p.$eval('#question', (t) => t.value);
  ok(agT.length > 0 && chT === '', 'une suggestion de l agent remplit la zone de l agent, pas celle du chat [' + agT.slice(0, 30) + ']');
  await p.click('#ongletChat');
  await p.click('#accueil .suggestion');
  ok((await p.$eval('#ag-question', (t) => t.value)) === agT, 'une suggestion du chat ne touche pas la zone de l agent');
  ok(await p.$eval('#ongletChat', (b) => b.getAttribute('aria-selected')) === 'true', 'l onglet actif le dit aux lecteurs d ecran (aria-selected)');
  ok(erreurs.length === 0, erreurs.length ? 'erreurs de script apres les gestes : ' + erreurs.slice(0, 3).join(' | ') : 'aucune erreur de script apres les gestes');
  await ctx.close();

  ({ p, ctx, erreurs } = await ouvre('?mode=agent'));
  ok(await visible(p, 'ag-question') && !(await visible(p, 'question')), '?mode=agent ouvre directement l agent');
  await ctx.close();

  /* 30/09 : OSINT et eSIM rejoignent la page (« une fusion pour gagner de la place »). */
  console.log('\n-- OSINT et eSIM, deux onglets de plus --');
  ({ p, ctx, erreurs } = await ouvre(''));
  ok((await p.$$('.onglets [role="tab"]')).length === 4, 'quatre onglets : Chat, Agent, OSINT, eSIM');
  await p.click('#ongletOsint');
  ok(await visible(p, 'os-q') && !(await visible(p, 'question')) && !(await visible(p, 'es-pays')), 'OSINT s affiche seul');
  await p.fill('#os-q', 'example.com');
  ok((await p.$eval('#question', (t) => t.value)) === '', 'taper dans OSINT ne touche pas le chat');
  await p.click('#ongletEsim');
  ok(await visible(p, 'es-pays') && !(await visible(p, 'os-q')), 'eSIM s affiche seul');
  /* La carte de paiement n apparait qu apres le choix d un forfait : on coche par le script. */
  await p.evaluate(() => { const r = document.querySelector('#modeEsim input[name="esReseau"][value="solana"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  ok(await p.evaluate(() => document.querySelector('#modeEsim input[name="esReseau"][value="solana"]').checked
     && document.querySelector('input[name="rcReseau"][value="base"]').checked), 'choisir Solana dans eSIM ne change pas le reseau de recharge du chat');
  ok(erreurs.length === 0, erreurs.length ? 'erreurs : ' + erreurs.slice(0, 2).join(' | ') : 'aucune erreur de script en passant par les quatre onglets');
  await ctx.close();
  ({ p, ctx, erreurs } = await ouvre('?q=example.com'));
  ok(await visible(p, 'os-q') && (await p.$eval('#os-q', (t) => t.value)) === 'example.com', 'un lien OSINT partage (?q=) ouvre l onglet OSINT, la cible remplie');
  await ctx.close();
  ({ p, ctx, erreurs } = await ouvre('?order=' + 'a'.repeat(32)));
  ok(await visible(p, 'es-carteResultat'), 'un lien de commande eSIM (?order=) ouvre l onglet eSIM, sur la commande');
  await ctx.close();

  for (const m of ['chat', 'agent', 'osint', 'esim']) {
    ({ p, ctx, erreurs } = await ouvre('?mode=' + m, 360));
    const large = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(large <= 360, 'onglet ' + m + ' a 360 px : rien ne deborde (' + large + ' px)');
    await ctx.close();
  }

  /* Le chat pose le curseur dans sa saisie et le navigateur defile jusqu a
     elle : a 390 px, la barre d onglets finissait 237 px au-dessus de
     l ecran, et le choix Chat/Agent avec elle. */
  console.log('\n-- le choix Chat/Agent est la premiere chose qu on voit --');
  for (const [w, h] of [[1280, 860], [390, 800]]) {
    const ctx2 = await nav.newContext({ viewport: { width: w, height: h } });
    const p2 = await ctx2.newPage();
    await p2.route('**/*', (r) => r.request().url().startsWith(base) ? r.continue() : r.abort());
    await p2.goto(base + CIBLE + '?mode=chat', { waitUntil: 'load' });
    await p2.waitForTimeout(500);
    const r = await p2.evaluate(() => { const b = document.querySelector('.onglets').getBoundingClientRect(); return { haut: Math.round(b.top), bas: Math.round(b.bottom), h: innerHeight }; });
    ok(r.haut >= 0 && r.bas <= r.h, 'a ' + w + ' px, la barre d onglets est entiere a l ecran a l arrivee (' + r.haut + '→' + r.bas + ')');
    if (w > 1000) ok(await p2.evaluate(() => { const b = document.getElementById('question').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; }), 'a ' + w + ' px, la saisie du chat est visible en meme temps');
    await ctx2.close();
  }
  await nav.close(); srv.close();
  fin();
})().catch((e) => { console.error(e); process.exit(1); });

function fin() {
  console.log('\nRATES : ' + rates + '/' + n);
  process.exit(rates ? 1 : 0);
}
