'use strict';
/* ============================================================================
 * UNE PAGE RETIREE RENVOIE, ET PLUS PERSONNE NE LA MONTRE (14/10/2026)
 *
 * Demande du proprietaire : « retire la page swoge ai perp, swoge ai eth et swoge ai
 * solana, ca ne sert a rien, ont de mauvais resultats, meme swoge ai predict pour BNB.
 * SWOGE AI colonie ETH Robinhood on le garde. »
 *
 * Les adresses ont ete partagees (Telegram, X) : une page retiree ne doit pas tomber en
 * 404, elle renvoie vers la colonie Robinhood. Ce que l'essai tient, pour chaque page :
 *   1. elle n'est plus qu'un renvoi : `noindex`, canonique vers swoge_ai.html, meta refresh
 *      (sans JavaScript) et location.replace qui GARDE `?server=` et l'ancre, un lien texte
 *      en anglais, aucun script ni feuille charge ;
 *   2. elle sort du sitemap, de la barre des onglets IA, et AUCUNE page du site n'y mene ;
 *   3. dans un vrai navigateur, avec ou sans JavaScript, on arrive sur swoge_ai.html, la
 *      requete et l'ancre intactes (avec JavaScript).
 * Utilise par perp_page.test.js, predict_page.test.js et colonies_page.test.js, qui
 * gardaient ces pages tant qu'elles existaient.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = path.join(__dirname, '..');
const DOMAINE = 'https://swoleeswoge.dog';
const CIBLE = 'swoge_ai.html';
/* Toutes les pages retirees : un renvoi n'est pas un lien qu'un menu propose. */
const RETIREES = ['swoge_perp.html', 'swoge_predict.html', 'swoge_sol_ai.html', 'swoge_eth_ai.html', 'swoge_colonies.html'];

async function verifieRenvoi(pages, titre) {
  let n = 0, rates = 0;
  const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
  const lis = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
  const echappe = (f) => f.replace(/\./g, '\\.');

  console.log('-- 1. ' + titre + ' : un renvoi, rien d autre --');
  for (const f of pages) {
    const s = lis(f);
    ok(/<html lang="en">/.test(s), f + ' : page en anglais');
    ok(/<meta name="robots" content="noindex[^"]*">/.test(s), f + ' : hors des moteurs (noindex)');
    ok(s.includes('<link rel="canonical" href="' + DOMAINE + '/' + CIBLE + '">'), f + ' : canonique vers ' + CIBLE);
    ok(s.includes('<meta http-equiv="refresh" content="0; url=' + CIBLE + '">'), f + ' : meta refresh vers ' + CIBLE + ' (sans JavaScript)');
    ok(s.includes('location.replace("' + CIBLE + '" + location.search + location.hash)'), f + ' : location.replace garde ?query et #ancre');
    const liens = [...s.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)];
    ok(liens.length === 1 && liens[0][1] === CIBLE && /^[\x20-\x7E]+$/.test(liens[0][2]) && /SWOGE AI/.test(liens[0][2]),
       f + ' : un seul lien texte, vers ' + CIBLE + ' (« ' + (liens[0] ? liens[0][2] : '') + ' »)');
    const corps = (s.match(/<body[^>]*>([\s\S]*?)<\/body>/) || ['', ''])[1].replace(/<[^>]+>/g, '');
    ok(/retired|moved/i.test(corps) && !/\b(la|le|les|vers|est)\b/.test(corps), f + ' : le texte montre est en anglais');
    ok(!/<script[^>]+src=|<link[^>]+stylesheet|<video|<iframe/.test(s), f + ' : aucun script, style ou film charge');
    ok(s.length < 2500, f + ' : ' + s.length + ' signes, un renvoi et pas une page');
  }

  console.log('\n-- 2. plus aucun chemin n y mene --');
  const sitemap = lis('sitemap.xml');
  for (const f of pages) ok(!sitemap.includes('/' + f + '<'), f + ' : absente du sitemap');
  const O = require('./onglets_ia.js');
  ok(pages.every((f) => !O.PAGES.some((p) => p.f === f)), 'aucune n est dans la barre des onglets IA (' + O.PAGES.map((p) => p.f).join(', ') + ')');
  const autres = fs.readdirSync(SITE).filter((x) => x.endsWith('.html') && !RETIREES.includes(x));
  for (const f of pages) {
    const re = new RegExp('href=["\']' + echappe(f) + '(?:[?#][^"\']*)?["\']');
    const qui = autres.filter((x) => re.test(lis(x)));
    ok(qui.length === 0, f + ' : aucune page du site n y renvoie' + (qui.length ? ' [' + qui.join(', ') + ']' : ' (' + autres.length + ' pages relues)'));
  }
  const js = fs.readdirSync(SITE).filter((x) => x.endsWith('.js') && !x.endsWith('.test.js'));
  for (const f of pages) {
    const qui = js.filter((x) => lis(x).includes(f));
    ok(qui.length === 0, f + ' : aucun script du site ne la nomme' + (qui.length ? ' [' + qui.join(', ') + ']' : ''));
  }

  let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
  if (!chromium) { console.log('playwright absent : partie navigateur ignoree'); return fin(); }
  console.log('\n-- 3. dans un navigateur --');
  const srv = http.createServer((q, r) => { const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  /* La page d'arrivee n'est pas jugee ici (ai_colonie.test.js le fait) : on coupe tout ce
     qui n'est pas le document, pour ne mesurer que le renvoi. */
  const arrive = async (ctx, url) => {
    const p = await ctx.newPage();
    await p.route('**/*', (r) => r.request().url().startsWith(base) && r.request().resourceType() === 'document' ? r.continue() : r.abort());
    await p.goto(url, { waitUntil: 'commit' }).catch(() => {});
    await p.waitForURL((u) => u.pathname.endsWith('/' + CIBLE), { timeout: 8000 }).catch(() => {});
    const u = new URL(p.url()); await p.close(); return u;
  };
  for (const f of pages) {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    const u = await arrive(ctx, base + f + '?server=' + encodeURIComponent('https://essai.example') + '#positions');
    ok(u.pathname === '/' + CIBLE && u.searchParams.get('server') === 'https://essai.example' && u.hash === '#positions',
       f + ' : renvoie vers ' + CIBLE + ', ?server= et #ancre gardes (' + u.pathname + u.search + u.hash + ')');
    await ctx.close();
    const sansJs = await nav.newContext({ javaScriptEnabled: false });
    const v = await arrive(sansJs, base + f);
    ok(v.pathname === '/' + CIBLE, f + ' : sans JavaScript aussi, par le meta refresh (' + v.pathname + ')');
    await sansJs.close();
  }
  await nav.close(); srv.close();
  return fin();

  function fin() {
    console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
    return rates;
  }
}

module.exports = { verifieRenvoi, RETIREES, CIBLE };
