'use strict';
/* ============================================================================
 * LA CARTE « THE $SWOGE ECONOMY » ET LE WHITEPAPER SUIVENT LA CHAINE
 *
 * Signale par un joueur le 26 septembre 2026 : l'accueil annonçait 6 827 534
 * brules quand la chaine en comptait 13 389 118, et un coffre a ≈10 % quand il
 * etait a 1,52 %. Les chiffres etaient ecrits a la main. Ce qu'on tient :
 *   1. Les chiffres affiches sont ceux de `/economie.json` (lu sur le contrat),
 *      avec leur part de l'offre, et la carte dit que c'est une lecture directe.
 *   2. Serveur muet : les derniers chiffres connus RESTENT — jamais de zero —
 *      et la carte dit qu'ils ne sont pas frais.
 *   3. Le whitepaper suit la meme source, dans les deux langues.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4' };
/* Des chiffres volontairement DIFFERENTS de ceux ecrits dans la page : si la
   page les montre, c'est qu'elle les a lus. */
const ECO = { ok: true, frais: true, lu: Date.UTC(2026, 8, 26, 9, 5), offre: 1e9, brule: 14250000.9, brulePct: 1.4250009,
  coffre: 12000000.4, coffrePct: 1.2, stakingAprPct: 100, stakingPlafond: 200000000 };

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const ouvre = async (page, eco) => {
    const p = await nav.newPage({ viewport: { width: 1200, height: 900 } });
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const u = r.request().url();
      if (/\/economie\.json/.test(u)) return eco ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(eco) }) : r.abort();
      if (/vitrine\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return r.abort();
    });
    await p.goto('http://127.0.0.1:' + port + '/' + page, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(700);
    return p;
  };
  const carte = (p) => p.evaluate(() => {
    const v = (k) => (document.querySelector('[data-eco="' + k + '"]') || {}).textContent;
    const i = (k) => (document.querySelector('[data-eco-i="' + k + '"]') || {}).textContent;
    return { brule: v('brule'), coffre: v('coffre'), bruleI: i('brule'), coffreI: i('coffre'), aprI: i('apr'),
             source: (document.getElementById('ecoSource') || {}).textContent };
  });

  console.log('-- 1. l accueil montre ce que la chaine dit --');
  {
    const p = await ouvre('index.html', ECO);
    const c = await carte(p);
    eq(c.brule, '14,250,000', 'le brule vient de /economie.json (arrondi vers le bas)');
    eq(c.coffre, '12,000,000', 'le coffre aussi');
    ok(/^1\.42% /.test(c.bruleI) && /^1\.20% OF SUPPLY/.test(c.coffreI), 'avec leur part de l offre [' + c.bruleI + ' | ' + c.coffreI + ']');
    eq(c.aprI, 'CAP 200,000,000', 'le plafond du staking vient du serveur');
    ok(/Live on-chain/.test(c.source) && /09:05 UTC/.test(c.source), 'et la carte dit que c est une lecture directe [' + c.source + ']');
    await p.close();
  }

  console.log('\n-- 2. serveur muet : les derniers chiffres restent, jamais un zero --');
  {
    const p = await ouvre('index.html', null);
    const c = await carte(p);
    ok(c.brule && c.brule !== '0' && /\d{1,3}(,\d{3})+/.test(c.brule), 'le brule ecrit reste affiche [' + c.brule + ']');
    ok(/unavailable/.test(c.source), 'et la carte dit que la lecture n est pas disponible [' + c.source + ']');
    const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    ok(!/6,827,534|99,826,711<\/b>/.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'les anciens chiffres faux ne sont plus dans la carte');
    await p.close();
  }

  console.log('\n-- 3. le whitepaper suit la meme source, en deux langues --');
  {
    const p = await ouvre('whitepaper.html', ECO);
    const w = await p.evaluate(() => [].map.call(document.querySelectorAll('[data-eco]'), (e) => ({ k: e.getAttribute('data-eco'), fr: e.getAttribute('data-l') === 'fr', t: e.textContent })));
    ok(w.length >= 20, 'le whitepaper porte ses chiffres de chaine en champs vivants [' + w.length + ']');
    ok(w.filter((x) => x.k === 'brule' && !x.fr).every((x) => x.t === '14,250,000'), 'brule, en anglais');
    ok(w.filter((x) => x.k === 'brule' && x.fr).every((x) => x.t === '14 250 000'), 'brule, en francais (espaces)');
    ok(w.filter((x) => x.k === 'coffrePct' && x.fr).every((x) => x.t === '1,20'), 'la part du coffre, virgule decimale en francais');
    ok(w.filter((x) => x.k === 'reste').every((x) => x.t === '973'), 'les millions non documentes se recalculent (1 000 − 14,25 − 12)');
    await p.close();
  }

  await nav.close(); srv.close();
  console.log('\nRATES : ' + rates + '/' + n);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
