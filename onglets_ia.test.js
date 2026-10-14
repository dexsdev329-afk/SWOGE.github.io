'use strict';
/* outils/onglets_ia.js (01/10/2026) : « SWOGE AI, Perp, Predict et Polymarket, fusionne-les comme Agents,
   ou tu peux changer de page en haut ». Ce que l essai tient : les pages sont celles que donne le
   script ; les quatre ont la MEME barre, la page courante marquee ; aucun menu du site ne liste plus
   les trois autres pages ; dans un navigateur, la barre mene aux quatre et ne deborde pas a 360 px.
   14/10/2026 : AI Perps, Predict, Solana AI et Ethereum AI sont retirees (demande du proprietaire) ;
   la barre n a plus que SWOGE AI et Polymarket AI, et aucune barre ni aucun menu ne mene plus a une
   page retiree (leurs adresses renvoient vers swoge_ai.html, voir outils/essai_renvoi.js). */
const fs = require('fs'), path = require('path'), http = require('http');
const O = require('./outils/onglets_ia.js');
const { RETIREES } = require('./outils/essai_renvoi.js');
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const lis = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

console.log('-- 1. les pages sont celles que donne le script --');
const perimees = O.pagesDuSite().filter((f) => O.transforme(f, lis(f)) !== lis(f));
ok(perimees.length === 0, perimees.length ? 'pages perimees : ' + perimees.join(', ') + ' — lancer node outils/onglets_ia.js' : 'toutes les pages sont a jour');
for (const p of O.PAGES) {
  const h = lis(p.f), i = h.indexOf(O.DEBUT);
  const b = i >= 0 ? h.slice(i, h.indexOf(O.FIN, i) + O.FIN.length) : '';
  const barre = b.slice(b.indexOf('<nav class="ia-onglets"'));
  ok(b === O.bloc(p.f) && (barre.match(/aria-current="page"/g) || []).length === 1 && barre.includes('href="' + p.f + '" aria-current="page"'), p.f + ' : la barre commune, elle-meme marquee courante');
  ok((h.match(/<nav class="ia-onglets"/g) || []).length === 1, p.f + ' : une seule barre');
}
/* 01/10 : le style commun — chaque page qui porte les marqueurs a la copie exacte de outils/ia_design.css. */
const avecDesign = O.pagesDuSite().filter((f) => lis(f).includes(O.D_DEBUT));
ok(avecDesign.includes('swoge_polymarket_ai.html') && avecDesign.every((f) => lis(f).includes(O.design())), 'le style commun : ' + avecDesign.join(', ') + ' portent la copie exacte de ia_design.css');
/* Les pages d IA autres que SWOGE AI n ont pas d entree de menu ; les pages retirees n en ont plus aucune. */
const caches = O.PAGES.slice(1).map((p) => p.f).concat(RETIREES);
const menus = O.pagesDuSite().filter((f) => { const m = (lis(f).match(/<nav class="(?:sw-nav|wl-nav)">[\s\S]*?<\/nav>/) || [''])[0]; return caches.some((c) => m.includes('href="' + c + '"')); });
ok(menus.length === 0, menus.length ? 'menus qui listent encore les pages d IA : ' + menus.join(', ') : 'aucun menu du site ne liste Polymarket AI ni une page retiree : une entree « AI Trading »');
ok(O.PAGES.map((p) => p.f).join() === 'swoge_ai.html,swoge_polymarket_ai.html' && !O.PAGES.some((p) => RETIREES.includes(p.f)),
   'la barre ne garde que SWOGE AI et Polymarket AI : ' + O.PAGES.map((p) => p.nom).join(', '));
const barres = O.pagesDuSite().filter((f) => { const b = (lis(f).match(/<nav class="ia-onglets"[\s\S]*?<\/nav>/) || [''])[0]; return RETIREES.some((c) => b.includes('href="' + c + '"')); });
ok(barres.length === 0, barres.length ? 'barres qui menent encore a une page retiree : ' + barres.join(', ') : 'aucune barre d onglets ne mene a une page retiree');

let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
(async () => {
  if (!chromium) { console.log('playwright absent : partie navigateur ignoree'); return fin(); }
  const srv = http.createServer((q, r) => { const f = path.join(__dirname, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  console.log('\n-- 2. dans un navigateur --');
  for (const w of [1280, 360]) {
    const ctx = await nav.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    await p.route('**/*', (r) => r.request().url().startsWith(base) ? r.continue() : r.abort());
    await p.goto(base + 'swoge_polymarket_ai.html', { waitUntil: 'domcontentloaded' });
    const r = await p.evaluate(() => { const b = document.querySelector('.ia-onglets'); const rc = b.getBoundingClientRect();
      return { vis: rc.width > 0 && rc.height > 0, liens: [...b.querySelectorAll('a')].map((a) => a.getAttribute('href')), large: document.documentElement.scrollWidth, droite: rc.right }; });
    ok(r.vis && r.liens.length === O.PAGES.length && O.PAGES.every((x) => r.liens.includes(x.f)) && r.large <= w + 1 && r.droite <= w + 1, 'a ' + w + ' px, la barre se voit, un onglet par page (' + r.liens.length + '), rien ne depasse (' + Math.round(r.droite) + ' px)');
    if (w === 1280) {
      await p.click('.ia-onglets a[href="swoge_ai.html"]');
      await p.waitForLoadState('domcontentloaded');
      ok(/swoge_ai\.html$/.test(p.url()) && await p.$eval('.ia-onglets a[aria-current="page"]', (a) => a.getAttribute('href')) === 'swoge_ai.html', 'un clic sur un onglet ouvre la page, marquee courante');
    }
    await ctx.close();
  }
  await nav.close(); srv.close();
  fin();
})().catch((e) => { console.error(e); process.exit(1); });
function fin() { console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe')); process.exit(rates ? 1 : 0); }
