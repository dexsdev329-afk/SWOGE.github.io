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
 *   - la carte et la liste parlent ANGLAIS, une ligne par mesure : jamais la
 *     cle brute (« OCTEMIT ») ni la phrase francaise (« code : sans emission »),
 *     jamais quatre fois la meme mesure du bytecode (LOBSTER, 26 septembre 2026) ;
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

/* Le scan de LOBSTER tel que le SERVEUR le rend (route /scan, carte_scan.avecLiens) :
   les 9 premieres cases du releve du 26 septembre 2026, sous leurs cles de memoire
   (quatre du bytecode, en francais, a +16,9 %), chacune avec sa phrase anglaise, et
   `lines` — ce que la page doit montrer. Le serveur a cote : l essai verifie que
   cette copie est bien sa sortie. */
const BRUTES = [['octEmit', 'code : sans emission', 2395, 16.9, 'bytecode: no mint', 'Contract bytecode'],
  ['octListe', 'code : sans liste noire', 2398, 16.9, 'bytecode: no blacklist', 'Contract bytecode'],
  ['octPause', 'code : sans pause', 2396, 16.9, 'bytecode: no pause', 'Contract bytecode'],
  ['octFrais', 'code : frais fixes', 2398, 16.9, 'bytecode: no fee setter', 'Contract bytecode'],
  ['social', '3+ reseaux', 1087, 16.5, '3+ socials', 'Social links'], ['pad', 'not from a launchpad', 52584, 5.5, 'not from a launchpad', 'Launchpad'],
  ['padDep', 'no launchpad record', 57003, 4.5, 'no launchpad record', 'Launcher history'], ['mc', 'mc <10k', 32821, -4.3, 'cap <$10k', 'Market cap'],
  ['origine', 'trouve par pools', 51335, 3.7, 'found via pools', 'How the colony found it']];
const LIGNES = [['Contract bytecode', 'bytecode: no mint, no blacklist, no pause, no fee setter', 2395, 16.9], ['Social links', '3+ socials', 1087, 16.5],
  ['Launchpad', 'not from a launchpad', 52584, 5.5], ['Launcher history', 'no launchpad record', 57003, 4.5], ['Market cap', 'cap <$10k', 32821, -4.3],
  ['How the colony found it', 'found via pools', 51335, 3.7]].map(([traitLabel, label, n, moyenne]) => ({ traitLabel, label, n, moyenne }));
const SCAN = {
  jeton: { adr: '0x254afb9fd36789bea39fb5656ba6fdb827be8dc5', sym: 'LOBSTER', nom: 'Lobster' },
  lanceur: { source: 'pons', lancements: 4 },
  faits: [{ quoi: 'the contract can mint more tokens', source: 'GoPlus' }],
  cases: BRUTES.map(([trait, c, n, moyenne, label, traitLabel]) => ({ trait, case: c, n, moyenne, label, traitLabel })),
  lines: LIGNES,
  mesureSur: { observations: 147292, tours: 14949, minObs: 6, echeance: 30 },
};
/* Un serveur plus ancien : les cases brutes, ni phrase ni `lines`. */
const SCAN_ANCIEN = Object.assign({}, SCAN, { cases: BRUTES.map(([trait, c, n, moyenne]) => ({ trait, case: c, n, moyenne })), lines: undefined });
/* Ce que la page ne doit JAMAIS ecrire : une cle brute, une phrase francaise. */
const CLES = BRUTES.map((b) => b[0]);
const FRANCAIS = /code : |reseaux|emission|liste noire|frais fixes|trouve par|sans pause/i;
/* Une cle brute : la ligne entiere est une cle (« OCTEMIT », « SOCIAL »), ou une cle qui
   n est pas un mot anglais apparait ou que ce soit (octEmit, padDep, origine). */
const ANGLAIS = ['social', 'pad', 'mc'];
const brute = (t) => CLES.some((k) => String(t).trim().toLowerCase() === k.toLowerCase() || (!ANGLAIS.includes(k) && new RegExp('\\b' + k + '\\b', 'i').test(t)));

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
    /* La licence GoPlus (relue le 26 septembre 2026) : un fait lu chez GoPlus
       porte « Powered by Go+ Security » — lien sur la page, en toutes lettres sur la carte. */
    const gp = await page.$$eval('#mesureFaits a', (l) => l.map((a) => ({ t: a.textContent, h: a.getAttribute('href'), rel: a.rel, cible: a.target })));
    ok(gp.length === 1 && gp[0].t === 'Powered by Go+ Security' && gp[0].h === 'https://gopluslabs.io' && /noopener/.test(gp[0].rel) && gp[0].cible === '_blank',
       'le fait lu chez GoPlus porte le lien « Powered by Go+ Security » (noopener, nouvel onglet) ' + JSON.stringify(gp));
    ok(/"Powered by Go\+ Security"/.test(carte), 'et la carte partagee le dit en toutes lettres');
    ok(!/(rug|scam|safe|danger)\b/i.test(carte.replace(/\*[^\n]*/g, '')),
       'aucun mot de verdict dans ce que la carte ecrit');
    /* Le presse-papier n existe pas partout : il doit y avoir une deuxieme
       voie, sinon le bouton ne fait rien chez la moitie des gens. */
    const part = src.slice(src.indexOf('async function cartePartage'), src.indexOf('async function cartePartage') + 1400);
    ok(/clipboard/.test(part) && /download/.test(part),
       'presse-papier quand il existe, telechargement sinon : jamais un bouton qui ne fait rien');
    await page.close();
  }

  console.log('\n-- la carte et la liste parlent anglais, une ligne par mesure --');
  {
    /* Le serveur a cote : la copie du scan dans cet essai est bien sa sortie. */
    const cs = path.join(SITE, '..', 'swoge-pusher-server.github.io', 'carte_scan.js');
    if (fs.existsSync(cs)) {
      const K = require(cs);
      const r = K.avecLiens({ jeton: SCAN.jeton, cases: SCAN_ANCIEN.cases }, { api: 'https://a', site: 'https://s' });
      eq(JSON.stringify([r.cases, r.lines]), JSON.stringify([SCAN.cases, SCAN.lines]), 'le scan de l essai = la sortie de carte_scan.avecLiens (cases et lines)');
    } else console.log('  (serveur absent a cote : la copie du scan n est pas recomparee)');
    /* Ce que la carte ECRIT : chaque fillText, enregistre. */
    const ecrit = async (page) => page.evaluate(() => {
      const t = [], f0 = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (s, ...a) { t.push(String(s)); return f0.call(this, s, ...a); };
      try { carteDessine(); } finally { CanvasRenderingContext2D.prototype.fillText = f0; }
      return t;
    });
    const page = await ouvre('/swoge_scan.html?t=0x254afb9fd36789bea39fb5656ba6fdb827be8dc5');
    const t = await ecrit(page);
    const cinq = LIGNES.slice(0, 5);
    ok(cinq.every((l) => t.includes(l.label) && t.includes(l.traitLabel.toUpperCase())),
       'la carte partagee : les 5 premieres lignes du serveur, en anglais (« ' + cinq[0].label + ' » sous « ' + cinq[0].traitLabel.toUpperCase() + ' »)');
    ok(!t.some(brute) && !t.some((x) => FRANCAIS.test(x)), 'aucune cle brute (OCTEMIT, SOCIAL…) ni phrase francaise (« code : sans emission »)'
       + (t.filter((x) => brute(x) || FRANCAIS.test(x)).length ? ' — ' + JSON.stringify(t.filter((x) => brute(x) || FRANCAIS.test(x))) : ''));
    ok(t.filter((x) => /^bytecode:/.test(x)).length === 1 && t.filter((x) => /^n=\d+$/.test(x)).length === 5,
       'le bytecode en UNE ligne, et cinq lignes, chacune avec son effectif (plus quatre fois +16,9 %)');
    const liste = await page.$$eval('#mesureCases .mc-l', (l) => l.map((e) => e.textContent));
    ok(liste.length === LIGNES.length && LIGNES.every((l, i) => liste[i].includes(l.label) && liste[i].includes(l.traitLabel)),
       'la liste de la page : les ' + LIGNES.length + ' lignes du serveur, dans son ordre');
    ok(!liste.some((x) => FRANCAIS.test(x) || /octEmit|octListe|padDep|origine/.test(x)), 'et aucune cle brute ni phrase francaise dans la liste');
    await page.close();

    /* Un serveur plus ancien (cases brutes seulement) : rien de brut, et on ne pretend pas « rien de mesure ». */
    const vieux = await ouvre('/swoge_scan.html?t=0x254afb9fd36789bea39fb5656ba6fdb827be8dc5', { scan: SCAN_ANCIEN });
    const tv = await ecrit(vieux);
    const lv = await vieux.$eval('#mesureCases', (e) => e.textContent);
    ok(!tv.some(brute) && !tv.some((x) => FRANCAIS.test(x)) && !FRANCAIS.test(lv) && !/octEmit/.test(lv) && /could not be shown/.test(lv) && !/not measured enough/i.test(lv),
       'sans lines ni phrases : ni la carte ni la liste n ecrivent la cle brute, et elles ne disent pas « rien de mesure »');
    await vieux.close();
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

  console.log('\n-- une copie d action tokenisee est dite, l officielle aussi (28/09) --');
  {
    const NV = '0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec';
    const copie = Object.assign({}, SCAN, { jeton: Object.assign({}, SCAN.jeton, { adr: '0xdecf74e4aa6ff30b1612e65665aaf650bedecba3', sym: 'NVDA', nom: 'NVDA' }),
      action: { statut: 'not_the_stock_token', symbole: 'NVDA', adresse: NV } });
    const page = await ouvre('/swoge_scan.html?t=0xdecf74e4aa6ff30b1612e65665aaf650bedecba3', { scan: copie });
    const al = await page.$eval('#actionAlerte', (e) => ({ vu: e.style.display !== 'none', t: e.textContent, lien: (e.querySelector('a') || {}).href || '', role: e.getAttribute('role') }));
    ok(al.vu && /This is NOT the Robinhood Stock Token NVDA\./.test(al.t) && al.t.includes(NV) && /\?t=0xd0601ce1/.test(al.lien) && al.role === 'alert',
       'une copie : le bandeau le dit, avec l adresse officielle en lien (qui la scanne)');
    await page.close();
    const piege = await ouvre('/swoge_scan.html?t=0xdecf74e4aa6ff30b1612e65665aaf650bedecba3',
      { scan: Object.assign({}, copie, { action: { statut: 'not_the_stock_token', symbole: 'NVDA<img src=x onerror=window.pirate=1>', adresse: NV } }) });
    ok(!(await piege.evaluate(() => window.pirate)) && (await piege.$('#actionAlerte img')) === null && /NOT the Robinhood Stock Token/.test(await piege.textContent('#actionAlerte')),
       'un symbole pieges reste du texte (lettres et chiffres seulement)');
    await piege.close();
    const off = await ouvre('/swoge_scan.html?t=' + NV, { scan: Object.assign({}, SCAN, { action: { statut: 'official', symbole: 'NVDA', adresse: NV } }) });
    ok(await off.$eval('#actionAlerte', (e) => e.style.display !== 'none' && e.classList.contains('ok') && /Official Robinhood Stock Token \(NVDA\)/.test(e.textContent)), 'l officielle : dite officielle');
    await off.close();
    const rien = await ouvre('/swoge_scan.html?t=0x254afb9fd36789bea39fb5656ba6fdb827be8dc5', { scan: Object.assign({}, SCAN, { action: { statut: 'none' } }) });
    ok(await rien.$eval('#actionAlerte', (e) => e.style.display === 'none'), 'un jeton sans rapport : aucun bandeau');
    await rien.close();
  }

  await nav.close();
  await new Promise((r) => srv.close(r));
  console.log(rates ? `\nscan_page.test.js : RATES : ${rates}/${n}` : `\nscan_page.test.js : ${n} verifications OK`);
  process.exit(rates ? 1 : 0);
})();
