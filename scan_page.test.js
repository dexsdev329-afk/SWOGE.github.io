'use strict';
/* ============================================================================
 * SWOGE SCAN : LA PAGE QUI REPOND A LA QUESTION QU ON TAPE VRAIMENT
 *
 * Personne ne cherche un casino. Tout le monde, avant d acheter, cherche la
 * meme chose : « is this token a scam ». La page s appelait « Holder Scan »
 * et vivait a `holder_scan.html` — elle repondait bien, mais a une question
 * que personne ne pose dans cette forme-la.
 *
 * Ce qui est mesure ici :
 *   - la page DIT ce qu elle fait, dans son titre et son adresse ;
 *   - un lien porte le jeton (`?t=0x…`), sinon partager un scan revient a
 *     dire « va sur cette page et recolle l adresse » — personne ne le fait ;
 *   - l ancienne adresse marche toujours, ET emporte le parametre ;
 *   - la carte partageable existe, au format que X attend, et chaque chiffre
 *     y part AVEC son effectif ;
 *   - et nulle part la page ne rend un verdict.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
            '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

const SCAN = {
  jeton: { adr: '0x254afb9fd36789bea39fb5656ba6fdb827be8dc5', sym: 'LOBSTER', nom: 'Lobster' },
  lanceur: { source: 'pons', lancements: 4 },
  faits: [{ quoi: 'the contract can mint more tokens', source: 'GoPlus' }],
  cases: [{ trait: 'padDep', case: 'launcher: 4+ launches', n: 642, moyenne: -43.7 },
          { trait: 'liq', case: 'liq 5-25k', n: 3120, moyenne: -6.2 },
          { trait: 'social', case: '2 links', n: 880, moyenne: 4.1 }],
  mesureSur: { observations: 42368, tours: 11354, minObs: 8, echeance: 30 },
};

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const ouvre = async (u, o) => {
    const page = await nav.newPage({ viewport: { width: 1100, height: 1000 } });
    await page.route(/vitrine\.json/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route(/\/scan\//, (r) => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify((o && o.scan) || SCAN) }));
    await page.route(/blockscout/, (r) => r.abort());
    await page.goto('http://127.0.0.1:' + port + u, { waitUntil: 'load' });
    await page.waitForTimeout(o && o.ms ? o.ms : 1200);
    return page;
  };

  console.log('-- la page dit ce qu elle fait --');
  {
    const page = await ouvre('/swoge_scan.html');
    const t = await page.title();
    ok(/scam/i.test(t), 'le titre porte la question qu on tape : « ' + t + ' »');
    ok(/SWOGE Scan/i.test(t), 'et le nom du produit');
    const h1 = (await page.$eval('h1', (e) => e.textContent)).trim();
    ok(/scam/i.test(h1), 'le titre a l ecran aussi : « ' + h1 + ' »');
    const sub = await page.$eval('.sub', (e) => e.textContent);
    /* Ce qu elle promet doit etre ce qu elle tient : des mesures, pas un
       verdict. Promettre un verdict serait plus vendeur et faux — et le
       premier jeton qui dement la page la tue. */
    ok(/never tell you to buy/i.test(sub), 'et elle annonce qu elle ne dit jamais d acheter');
    ok(/measured/i.test(sub), 'et qu elle rend des mesures');
    const src = fs.readFileSync(path.join(SITE, 'swoge_scan.html'), 'utf8');
    ok(/<meta name="description" content="[^"]*measured/i.test(src), 'la description pour les moteurs le dit aussi');
    ok(/og:url" content="https:\/\/swoleeswoge\.dog\/swoge_scan\.html/.test(src), 'et l adresse partagee est la nouvelle');
    await page.close();
  }

  console.log('\n-- un lien porte le jeton --');
  {
    const page = await ouvre('/swoge_scan.html?t=0x254afb9fd36789bea39fb5656ba6fdb827be8dc5');
    eq(await page.$eval('#addr', (e) => e.value.toLowerCase()), '0x254afb9fd36789bea39fb5656ba6fdb827be8dc5',
       'l adresse du lien est dans la barre');
    ok(await page.$eval('#secMesure', (e) => e.style.display) === 'block',
       'et le scan est deja lance : rien a cliquer');
    /* Et l adresse s ECRIT dans la barre du navigateur quand on scanne : ce
       qu on regarde a toujours un lien a copier. */
    ok(/t=0x254afb9f/.test(await page.evaluate(() => location.search)),
       'l adresse du navigateur porte le jeton : ' + await page.evaluate(() => location.search));
    await page.close();
  }

  console.log('\n-- l ancienne adresse marche toujours --');
  {
    const page = await nav.newPage();
    await page.route(/vitrine\.json/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route(/\/scan\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCAN) }));
    await page.route(/blockscout/, (r) => r.abort());
    await page.goto('http://127.0.0.1:' + port + '/holder_scan.html?t=0xabc', { waitUntil: 'load' });
    await page.waitForTimeout(900);
    ok(/swoge_scan\.html/.test(page.url()), 'un lien partage il y a un mois arrive au bon endroit : ' + page.url().split('/').pop());
    /* Le parametre suit : quelqu un qui a partage un jeton precis doit
       retrouver CE jeton, pas la page vide. */
    ok(/t=0xabc/.test(page.url()), 'et il emporte le jeton demande');
    const vieux = fs.readFileSync(path.join(SITE, 'holder_scan.html'), 'utf8');
    ok(/rel="canonical" href="https:\/\/swoleeswoge\.dog\/swoge_scan\.html"/.test(vieux),
       'la vieille page dit aux moteurs laquelle des deux compte');
    ok(/noindex/.test(vieux), 'et se retire de l index : deux pages qui se font concurrence, aucune ne gagne');
    await page.close();
  }

  console.log('\n-- la carte qui voyage --');
  {
    const page = await ouvre('/swoge_scan.html?t=0x254afb9fd36789bea39fb5656ba6fdb827be8dc5');
    const d = await page.evaluate(() => {
      const c = carteDessine();
      return c ? { w: c.width, h: c.height } : null;
    });
    ok(!!d, 'la carte se dessine');
    /* 1200x630 : le format que X, Telegram et Discord attendent. Un autre
       rapport est recadre par eux, et c est toujours le chiffre qui saute. */
    ok(d && Math.abs(d.w / d.h - 1200 / 630) < 0.01,
       'au format que X attend (' + d.w + '×' + d.h + ', rapport ' + (d.w / d.h).toFixed(3) + ')');
    ok(d && d.w >= 2000, 'et en double resolution, pour rester nette : ' + d.w + ' px');
    /* Ce qui compte : l effectif part AVEC le chiffre. Une carte qui
       montrerait « -43,7 % » sans son `n` serait plus jolie et malhonnete. */
    const src = fs.readFileSync(path.join(SITE, 'swoge_scan.html'), 'utf8');
    const carte = src.slice(src.indexOf('function carteDessine'), src.indexOf('async function cartePartage'));
    ok(/"n=" \+ x\.n/.test(carte), 'chaque chiffre de la carte part avec son effectif');
    ok(/never a buy signal/.test(carte), 'et la carte porte « never a buy signal »');
    ok(/swoleeswoge\.dog\/swoge_scan/.test(carte), 'et l adresse ou la refaire');
    ok(!/(rug|scam|safe|danger)\b/i.test(carte.replace(/\*[^\n]*/g, '')),
       'aucun mot de verdict dans ce que la carte ecrit');
    /* Le presse-papier n existe pas partout : il doit y avoir une deuxieme
       voie, sinon le bouton ne fait rien chez la moitie des gens. */
    const part = src.slice(src.indexOf('async function cartePartage'), src.indexOf('async function cartePartage') + 1400);
    ok(/clipboard/.test(part) && /download/.test(part),
       'presse-papier quand il existe, telechargement sinon : jamais un bouton qui ne fait rien');
    await page.close();
  }

  console.log('\n-- et quand la colonie ne sait rien, elle le DIT --');
  {
    const page = await ouvre('/swoge_scan.html?t=0x254afb9fd36789bea39fb5656ba6fdb827be8dc5',
      { scan: { jeton: { adr: '0x25', sym: 'X' }, faits: [], cases: [], mesureSur: { observations: 0, minObs: 8 } } });
    const txt = await page.$eval('#mesureCases', (e) => e.textContent);
    ok(/not measured enough/i.test(txt) || /nothing shown/i.test(txt),
       'une section vide qui ressemblerait a « rien a signaler » serait pire que pas de section : ' + txt.slice(0, 70) + '…');
    await page.close();
  }

  await nav.close();
  await new Promise((r) => srv.close(r));
  console.log(rates ? `\nscan_page.test.js : RATES : ${rates}/${n}` : `\nscan_page.test.js : ${n} verifications OK`);
  process.exit(rates ? 1 : 0);
})();
