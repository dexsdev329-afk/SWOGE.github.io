'use strict';
/* outils/onglets_ia.js (01/10/2026) : « SWOGE AI, Perp, Predict et Polymarket, fusionne-les comme Agents,
   ou tu peux changer de page en haut ». Ce que l essai tient : les pages sont celles que donne le
   script ; les quatre ont la MEME barre, la page courante marquee ; aucun menu du site ne liste plus
   les trois autres pages ; dans un navigateur, la barre mene aux quatre et ne deborde pas a 360 px.
   14/10/2026 : AI Perps, Predict, Solana AI et Ethereum AI sont retirees (demande du proprietaire) ;
   la barre n a plus que SWOGE AI et Polymarket AI, et aucune barre ni aucun menu ne mene plus a une
   page retiree (leurs adresses renvoient vers swoge_ai.html, voir outils/essai_renvoi.js).
   14/10/2026 (suite) : Polymarket AI est retiree a son tour ; SWOGE AI reste SEULE. Une barre a un
   seul onglet ne mene nulle part : l intention devient « aucune page ne porte de barre d onglets IA,
   le menu garde une seule entree AI Trading qui mene a la colonie, et aucun menu ni aucune barre ne
   mene a une page retiree ». Le script reste la source : s il revenait deux pages, il remettrait la
   barre, et la partie 1 exigerait de nouveau qu elle soit identique sur chacune. */
const fs = require('fs'), path = require('path'), http = require('http');
const O = require('./outils/onglets_ia.js');
const { RETIREES } = require('./outils/essai_renvoi.js');
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const lis = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

console.log('-- 1. les pages sont celles que donne le script --');
const perimees = O.pagesDuSite().filter((f) => O.transforme(f, lis(f)) !== lis(f));
ok(perimees.length === 0, perimees.length ? 'pages perimees : ' + perimees.join(', ') + ' — lancer node outils/onglets_ia.js' : 'toutes les pages sont a jour');
ok(O.PAGES.map((p) => p.f).join() === 'swoge_ai.html' && !O.PAGES.some((p) => RETIREES.includes(p.f)) && O.AVEC_BARRE === false,
   'SWOGE AI reste seule, aucune page retiree dans la liste, donc pas de barre : ' + O.PAGES.map((p) => p.nom).join(', '));
/* Avec une seule page, aucune page du site ne porte la barre ni ses marqueurs. */
const avecBarre = O.pagesDuSite().filter((f) => { const h = lis(f); return h.includes(O.DEBUT) || h.includes(O.FIN) || /<nav class="ia-onglets"/.test(h); });
ok(avecBarre.length === 0, avecBarre.length ? 'pages qui portent encore une barre d onglets IA : ' + avecBarre.join(', ') : 'aucune page ne porte de barre d onglets IA (un seul onglet ne mene nulle part)');
/* Si deux pages revenaient, le script ecrirait de nouveau une barre identique, la page courante marquee. */
{ const b = O.bloc('swoge_ai.html'); ok(b.startsWith(O.DEBUT) && b.endsWith(O.FIN) && b.includes('href="swoge_ai.html" aria-current="page"'), 'le generateur sait encore ecrire la barre (page courante marquee)'); }
/* 01/10 : le style commun — chaque page qui porte les marqueurs a la copie exacte de outils/ia_design.css. */
const avecDesign = O.pagesDuSite().filter((f) => lis(f).includes(O.D_DEBUT));
ok(avecDesign.length > 0 && !avecDesign.some((f) => RETIREES.includes(f)) && avecDesign.every((f) => lis(f).includes(O.design())), 'le style commun, copie exacte de ia_design.css, sans aucune page retiree : ' + avecDesign.join(', '));
/* Le menu n a qu une entree « AI Trading », vers SWOGE AI ; aucune page retiree n y figure. */
const menus = O.pagesDuSite().filter((f) => { const m = (lis(f).match(/<nav class="(?:sw-nav|wl-nav)">[\s\S]*?<\/nav>/) || [''])[0]; return RETIREES.some((c) => m.includes('href="' + c + '"')); });
ok(menus.length === 0, menus.length ? 'menus qui listent encore une page retiree : ' + menus.join(', ') : 'aucun menu du site ne liste une page retiree (Polymarket AI comprise)');
const entree = (lis('swoge_ai.html').match(/<nav class="sw-nav">[\s\S]*?<\/nav>/) || [''])[0];
ok((entree.match(/href="swoge_ai\.html"/g) || []).length === 1 && /<a href="swoge_ai\.html"[^>]*aria-current="page"[^>]*><span class="ic">&#129302;<\/span>AI Trading<\/a>/.test(entree),
   'sur swoge_ai.html, le menu garde une seule entree « AI Trading », marquee courante');

let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
(async () => {
  if (!chromium) { console.log('playwright absent : partie navigateur ignoree'); return fin(); }
  const srv = http.createServer((q, r) => { const f = path.join(__dirname, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  console.log('\n-- 2. dans un navigateur --');
  for (const w of [1440, 360]) {
    const ctx = await nav.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    /* La colonie elle-meme est jugee par ai_colonie.test.js : ici, seul le document compte. */
    await p.route('**/*', (r) => r.request().url().startsWith(base) && r.request().resourceType() === 'document' ? r.continue() : r.abort());
    await p.goto(base + 'swoge_ai.html', { waitUntil: 'domcontentloaded' });
    const r = await p.evaluate(() => ({ barre: !!document.querySelector('.ia-onglets'),
      vers: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')) }));
    const RET = RETIREES;
    ok(!r.barre && !r.vers.some((h) => RET.some((c) => h.split(/[?#]/)[0] === c)), 'a ' + w + ' px, swoge_ai.html : pas de barre d onglets, aucun lien vers une page retiree');
    await ctx.close();
  }
  await nav.close(); srv.close();
  fin();
})().catch((e) => { console.error(e); process.exit(1); });
function fin() { console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe')); process.exit(rates ? 1 : 0); }
