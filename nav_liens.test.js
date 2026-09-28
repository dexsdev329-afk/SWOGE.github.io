'use strict';
/* LES LIENS MUETS (28/09/2026) : sur l'accueil et le Casino, `a[href]{pointer-events:none}`
   eteint tout lien sans `.vif`. Six entrees du menu y etaient mortes — signale par le
   proprietaire (« des pages ne sont pas cliquables via certaines pages »). Ici, un VRAI
   navigateur : aucun lien visible de ces pages n'est muet, et chaque entree du menu recoit
   le clic a son centre (rien par-dessus), sur ordinateur et sur telephone. */
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => { const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port, nav = await chromium.launch();
  const PAGES = fs.readdirSync(SITE).filter((f) => f.endsWith('.html') && /a\[href\], button\{ *pointer-events:none/.test(fs.readFileSync(path.join(SITE, f), 'utf8')));
  ok(PAGES.includes('index.html') && PAGES.includes('games.html'), 'les pages qui eteignent leurs liens par defaut : ' + PAGES.join(', '));
  for (const f of PAGES) for (const w of [1280, 390]) {
    const ctx = await nav.newContext({ viewport: { width: w, height: 900 } }), p = await ctx.newPage();
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => r.abort());
    await p.goto('http://127.0.0.1:' + port + '/' + f, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(500);
    const muets = await p.$$eval('a[href]', (as) => as.filter((a) => { const b = a.getBoundingClientRect(); return b.width && b.height && a.getAttribute('href') !== '#' && getComputedStyle(a).pointerEvents === 'none'; })
      .map((a) => a.getAttribute('href')));
    ok(muets.length === 0, f + ' a ' + w + ' px : aucun lien visible muet' + (muets.length ? ' [' + muets.join(', ') + ']' : ''));
    const menu = await p.$$eval('.sw-nav a[href]', (as) => as.map((a) => { a.scrollIntoView({ block: 'center', inline: 'center' }); const b = a.getBoundingClientRect(), e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { h: a.getAttribute('href'), ok: !!e && (e === a || a.contains(e)) }; }));
    const morts = menu.filter((x) => !x.ok).map((x) => x.h);
    ok(menu.length >= 12 && !morts.length, f + ' a ' + w + ' px : les ' + menu.length + ' entrees du menu recoivent le clic' + (morts.length ? ' [mortes : ' + morts.join(', ') + ']' : ''));
    await ctx.close();
  }
  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
