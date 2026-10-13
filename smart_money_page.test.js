'use strict';
/* ============================================================================
 * SMART MONEY (13/10/2026) — la page swoge_smart_money.html
 *
 * La page MONTRE /ai/smart (smart_money.js, serveur) : un faux serveur rend la
 * vue, ses variantes (eteint, demarrage, panne), et les fichiers du site. Tout
 * ce qui n'est pas local est coupe. L'intention :
 *  - chaque chiffre dit d'ou il vient : « Verified » (lu sur la chaine, avec son
 *    bloc ou sa tx) ou « Not verified » (prix d'une source exterieure) ;
 *  - le taux de base et le z a cote de la regle du proprietaire, et « no verdict
 *    under 10 projects » ; un initie n'est jamais « smart » ;
 *  - un operateur de migration n'est jamais presente comme createur ;
 *  - aucun bouton d'achat, aucun formulaire ; liens vers dexscreener.com/robinhood
 *    et robinhoodchain.blockscout.com seulement, pour une adresse valide ;
 *  - texte echappe (piege XSS dans un symbole) ; rien qui deborde a 320, 390 et
 *    1440 px ; aucune erreur console ; aucun texte francais visible ;
 *  - eteint, en demarrage ou injoignable, la page le dit ;
 *  - outils/onglets_ia.js ne la reecrit pas (menu commun, AI Trading sans « on »).
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const PIEGE = '<img src=x onerror=window.pirate=1>';
const A = (s) => '0x' + s.repeat(40 / s.length).slice(0, 40);
const H = (s) => '0x' + s.repeat(64 / s.length).slice(0, 64);
const T = 1791860000;
/* Une vue telle que smart_money.js la rend (construitVue), remplie a la main. */
const VUE = {
  actif: true, pret: true, mode: 'envoi', t: T,
  regles: { acheteurs: 50, mise_min_eth: 0.01, tot_min: 60, smart_jetons: 3, projets_assez: 10, z_verdict: 2, groupe_min: 3, groupe_ecart_pct: 2, relais_pct: 99, relais_blocs: 6000, seuil_usd: 1e6 },
  passe: { id: 9, genre: 'passe', debut: T - 900, fin: T - 60, statut: 'budget', appels: 600, octets: 41234567, gt: 13, ds: 9, jetons: 2, detail: { retenus: 1, pics: 2, lus: 2, statut: 'budget' } },
  veille: { id: 10, genre: 'veille', debut: T - 30, fin: T - 29, statut: 'ok', appels: 7, octets: 120000, gt: 0, ds: 0, jetons: 0, detail: { de: 87100001, a: 87102900, creations: 21, achats: 2, alertes: 1, saute: 0 } },
  compteurs: { retenus: 42, lus: 3, wallets: 143, smart: 2, inities: 31, creations24h: 3 },
  wallets: [
    { adresse: A('51'), projets: 3, connus: 3, gagnants: 3, gain_total_wei: '1500000000000000000', delai_moyen_min: 8.25, attendu: 1.23, z: 2.41, smart: true, initie: false, verdict: 'pas_assez' },
    { adresse: A('52'), projets: 12, connus: 12, gagnants: 10, gain_total_wei: '820000000000000000', delai_moyen_min: 4.5, attendu: 6, z: 2.31, smart: true, initie: false, verdict: 'mieux_que_la_base' },
    { adresse: A('61'), projets: 3, connus: 3, gagnants: 3, gain_total_wei: '600000000000000000', delai_moyen_min: 0.33, attendu: 1.5, z: 1.7, smart: false, initie: true, verdict: 'initie' },
    { adresse: A('53'), projets: 12, connus: 12, gagnants: 10, gain_total_wei: '-3492885487536608', delai_moyen_min: 20, attendu: 10.8, z: -0.77, smart: false, initie: false, verdict: 'comme_la_base' },
  ],
  createurs: [
    { adresse: '0x84b8affbd7728217f97c8eb47fe4bda07d97b8c1', role: 'migration', lancements: 3, reussites: 3, retraits: 0, lp_brulees: 0, drapeaux: 0, rampes: 0, migrations: 12, jetons: [A('a1')] },
    { adresse: '0xa63126c2041b1d4eb28f025ab8457815aeb74d3e', role: 'lanceur', lancements: 3, reussites: 3, retraits: 0, lp_brulees: 0, drapeaux: 0, rampes: 38, migrations: 0, jetons: [A('a2')] },
    { adresse: '0xb760edab21dd2855327d2a72be90f86b523fba7d', role: 'deployeur', lancements: 1, reussites: 1, retraits: 0, lp_brulees: 1, drapeaux: 1, rampes: 0, migrations: 0, jetons: [A('a3')] },
  ],
  jetons: [
    { adresse: '0x737054bd706cba68eaf4661411fede5f6c2952e5', symbole: 'BRODIE', statut: 'lu', mode: 'tout',
      lancement: { bloc: 49296036, t: 1788373613, tx: '0x8c73e19acad1d6f9852bc619128ea4ffb3bb023ec52c7b44079124ea59e2591c', piscine: H('b6'), version: 4 },
      createur: { adresse: '0x84b8affbd7728217f97c8eb47fe4bda07d97b8c1', role: 'migration', verifie: true, bloc: 49296036, tx: '0x8c73e19acad1d6f9852bc619128ea4ffb3bb023ec52c7b44079124ea59e2591c', via: '0x9310bc8bf95fa35608a9f08f76b55b4fdddc1ef0' },
      ancien: '0x45f82ac5d507e988f7406935da8eefe495a360e0', details: { ancien: { jeton: '0x45f82ac5d507e988f7406935da8eefe495a360e0', createur: '0xebc1188f54b8591eb3322b273391a2f4a714dbd4', role: 'lanceur', bloc: 9141382 } },
      pic: { usd: 3329804, jour: '2026-08-29', source: 'geckoterminal daily close × totalSupply read on chain' }, cap: { usd: 405431, source: 'geckoterminal fdv' },
      base: { n: 37, gagnants: 12 }, recette: { achatPuisBrule: false, robots1reMinute: 1, profilSous3h: null, signature: '' }, drapeaux: [], liquidite: { version: 4, retirePct: 0 } },
    { adresse: '0x5b81efe5e0ba2b31c0ed843b908a2c45fe6e14c5', symbole: PIEGE, statut: 'lu', mode: 'acheteur',
      lancement: { bloc: 57852996, t: 1789664512, tx: '0x4e0b5b484517685b7d33dc7167572e7ba0d3f1b753280c5667c2a4b5c1449778', piscine: '0x3416b8d8aa6ae642ffdc2f65165ff479d4bd3007', version: 2 },
      createur: { adresse: '0xb760edab21dd2855327d2a72be90f86b523fba7d', role: 'deployeur', verifie: true, bloc: 57852996, tx: '0x4e0b5b484517685b7d33dc7167572e7ba0d3f1b753280c5667c2a4b5c1449778', via: null },
      pic: { usd: 13604577, jour: '2026-09-20', source: 'geckoterminal daily close × totalSupply read on chain' }, cap: null, base: { n: 41, gagnants: 30 },
      recette: { achatPuisBrule: true, robots1reMinute: 4, profilSous3h: true, signature: 'creator-buy-then-burn+bots-first-minute+paid-profile-3h' },
      drapeaux: [{ type: 'sortie_de_dead', valeur: '973323411065236870', decimales: 9, bloc: 67639726, tx: '0x3ba299f1f88caeaebe1c634fc8736b981d4ea57544bd2544f6e75180f482e69e', n: 1 }],
      liquidite: { version: 2, brulePct: 99.99, retirePct: 93.4, plusGrosRetrait: { bloc: 71821393, tx: '0x87d0e1ea956354ae2154ea75deb1b3ff0d0ff9fa15c7898bdb6a80026bb26735' } } },
    { adresse: 'pas-une-adresse', symbole: 'BAD', statut: 'erreur', erreur: 'no ETH pool found on chain', createur: { adresse: 'javascript:alert(1)', role: 'inconnu', verifie: false }, pic: null, cap: { usd: 2.1e6, source: 'geckoterminal fdv' } },
  ],
  nouveaux: [
    { pool: H('c4'), jeton: A('a4'), version: 4, bloc: 87100100, t: T - 600, tx: H('d1'), createur: '0xb760edab21dd2855327d2a72be90f86b523fba7d', role: 'deployeur', verifie: 1 },
    { pool: A('c6'), jeton: A('a6'), version: 2, bloc: 87100300, t: T - 500, tx: H('d2'), createur: A('0f'), role: 'inconnu', verifie: 0 },
  ],
  groupes: [{ jeton: '0xdb97b2aefd6816485a757ae49280d598a5c9c848', bloc: 49880350, tx: H('e1'), wallets: [A('71'), A('72'), A('73'), A('74')] }],
  alertes: [{ id: 1, t: T - 100, genre: 'smart', jeton: A('a4'), envoye: 1 }],
  journal: [],
};
/* Des listes longues pour la largeur : 40 wallets, 60 jetons aux noms longs. */
const LONG = JSON.parse(JSON.stringify(VUE));
for (let i = 0; i < 36; i++) LONG.wallets.push(Object.assign({}, VUE.wallets[3], { adresse: A((10 + i).toString(16).padStart(2, '0')) }));
for (let i = 0; i < 57; i++) LONG.jetons.push(Object.assign({}, VUE.jetons[0], { symbole: 'AVERYLONGTOKENSYMBOLWITHOUTSPACES' + i }));
const OFF = { actif: false, pret: false, mode: 'off' };
const DEMARRE = { actif: true, pret: false, mode: 'envoi' };

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return fin(); }
  console.log('-- 0. le menu commun : onglets_ia.js ne reecrit pas la page --');
  {
    const O = require('./outils/onglets_ia');
    const h = fs.readFileSync(path.join(SITE, 'swoge_smart_money.html'), 'utf8');
    ok(O.transforme('swoge_smart_money.html', h) === h, 'la page est stable sous outils/onglets_ia.js (AI Trading sans « on »)');
    ok(/<a href="swoge_ai\.html"><span class="ic">&#129302;<\/span>AI Trading<\/a>/.test(h), 'l\'entree AI Trading du menu commun est la');
    ok(!/<form|<button[^>]*>\s*(buy|swap|trade)/i.test(h), 'aucun formulaire, aucun bouton d\'achat dans le source');
  }
  const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.json': 'application/json' };
  const srv = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    const vue = { '/api/ai/smart': VUE, '/long/ai/smart': LONG, '/off/ai/smart': OFF, '/demarre/ai/smart': DEMARRE }[u];
    if (vue) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify(vue)); }
    if (u === '/panne/ai/smart') { r.writeHead(503); return r.end(); }
    if (/\/vitrine\.json$/.test(u)) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{}'); }
    const f = path.join(SITE, decodeURIComponent(u));
    if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  const erreurs = [];
  const ouvre = async (q, w) => {
    const ctx = await nav.newContext({ viewport: { width: w || 1280, height: 900 } });
    const p = await ctx.newPage();
    /* hors du faux serveur : une reponse vide (polices, video), pour que la console ne parle que de la page */
    await p.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.fulfill({ status: 200, body: '', contentType: 'text/plain' })));
    p.on('pageerror', (e) => erreurs.push('pageerror ' + e.message));
    /* les connexions WebSocket de stakebubble.js (gabarit, pas cette page) et le 503 VOULU du cas « panne » ne comptent pas */
    p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket/.test(m.text()) && !(q === 'panne' && /status of 503/.test(m.text()))) erreurs.push(w + ' ' + q + ' : ' + m.text()); });
    await p.goto(base + 'swoge_smart_money.html?server=' + encodeURIComponent(base + q), { waitUntil: 'domcontentloaded' });
    return { p, ctx };
  };
  const lit = (p) => p.evaluate(() => {
    const t = (s) => (document.querySelector(s) ? document.querySelector(s).textContent : '');
    const lignes = (s) => [...document.querySelectorAll(s + ' tr')].map((tr) => [...tr.children].map((td) => td.textContent));
    return { statut: t('#statut'), pastille: t('#pastilleTxt'), kpis: [...document.querySelectorAll('#kpis .ds-kpi')].map((k) => k.textContent),
      wallets: lignes('#wallets'), createurs: lignes('#createurs'), jetons: lignes('#jetons'), nouveaux: lignes('#nouveaux'), groupes: lignes('#groupes'),
      passe: [...document.querySelectorAll('#passe .ds-kpi')].map((k) => k.textContent),
      liens: [...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')),
      boutons: [...document.querySelectorAll('main button, main form, main input')].length,
      achats: [...document.querySelectorAll('main a, main button')].filter((e) => /\b(buy|trade|swap|ape in)\b/i.test(e.textContent)).map((e) => e.textContent),
      pirate: window.pirate, imgs: document.querySelectorAll('main img').length,
      texte: document.body.innerText, notes: t('#walletsNote') + ' ' + t('#createursNote') };
  });

  console.log('\n-- 1. la vue complete --');
  let { p, ctx } = await ouvre('api');
  await p.waitForFunction(() => document.querySelectorAll('#wallets tr').length >= 4);
  let r = await lit(p);
  ok(/Alerts go to the owner only\. Nothing is ever bought\./.test(r.statut), 'statut : alertes au proprietaire, rien n\'est achete');
  ok(r.pastille === 'Reading live', 'pastille : en direct');
  ok(r.kpis[0].includes('3') && /of 42 found/.test(r.kpis[0]), 'KPI : 3 jetons lus sur 42 trouves (le compte est dit)');
  ok(/Smart \(owner’s rule\)2/.test(r.kpis[2]), 'KPI : 2 smart, « owner’s rule »');
  const w0 = r.wallets[0], w1 = r.wallets[1], w2 = r.wallets[2], w3 = r.wallets[3];
  ok(w0[1] === 'Smart' && /^3 \/ 3Verified$/.test(w0[2]) && /No verdict under 10 projects \(3 so far\)/.test(w0[5]), 'smart sous 10 projets : « No verdict under 10 projects (3 so far) »');
  ok(w0[3] === '1.2' && w0[4] === '+2.4', 'le taux de base attendu (1.2) et le z (+2.4) sont a cote');
  ok(/Beats the base rate/.test(w1[5]), '12 projets, z >= 2 : « Beats the base rate »');
  ok(w2[1] === 'Insider' && /Insider mark — never smart/.test(w2[5]), 'initie : jamais smart, meme gagnant sur 3 jetons');
  ok(/No better than the base rate/.test(w3[5]) && /^−0\.0035Verified$/.test(w3[6]), '10 sur 12 a 90 % de base : « No better than the base rate », perte en ETH signee');
  ok(/^\+1\.500Verified$/.test(w0[6]), 'gain en ETH, « Verified » (lu sur la chaine)');
  ok(/base rate/.test(r.notes) && /No verdict under 10 projects/i.test(r.notes + w0[5]), 'la note explique la regle, le taux de base et le z');
  const c0 = r.createurs[0];
  ok(/Ran a migration \(not the original creator\)/.test(c0[1]) && !/Deployed/.test(c0[1]), '0x84b8… : operateur de migration, jamais « createur »');
  ok(/12 migrations sent/.test(c0[6]), 'et ses 12 migrations envoyees sont comptees');
  ok(/3 \/ 3Not verified/.test(r.createurs[1][3]) && /38 on a known launchpad/.test(r.createurs[1][6]), '0xa631… : 3 au-dessus de 1 M$ (Not verified), 38 lancements comptes sur la rampe');
  ok(/1Verified/.test(r.createurs[2][5]), 'astro : LP brulee, « Verified »');
  const j0 = r.jetons[0], j1 = r.jetons[1], j2 = r.jetons[2]; /* colonnes : jeton, pic/actuel, lancement, lance par, gagnants, drapeaux */
  ok(/^\$3\.33MNot verifiedbest daily close, 2026-08-29now \$405kNot verified$/.test(j0[1]), 'pic BRODIE 3,33 M$ et capitalisation actuelle, chacun « Not verified », meilleure cloture journaliere et son jour');
  ok(/^block 49,296,036Verified/.test(j0[2]), 'lancement : bloc et « Verified »');
  ok(/Ran a migration/.test(j0[3]) && /old token 0x45f8…60e0 created by 0xebc1…dbd4/.test(j0[3]), 'BRODIE : migration, et le createur de l\'ancien jeton');
  ok(/^12 of 37Verified/.test(j0[4]), 'gagnants de la 1re heure : 12 sur 37 (le compte est dit)');
  ok(j1[0].includes(PIEGE) && r.pirate === undefined && r.imgs === 0, 'symbole piege : affiche en texte, rien n\'est execute');
  ok(/973\.3M .* moved out of 0x…dead/.test(j1[5]) && /block 67,639,726Verified/.test(j1[5]), 'astro : 973,3 M sortis de 0x…dead, bloc et « Verified »');
  ok(/93% of the liquidity added was removed/.test(j1[5]), 'liquidite retiree a 93 % : drapeau');
  ok(/paid DexScreener profile within 3 hNot verified/.test(j1[5]), 'profil paye : « Not verified » (DexScreener)');
  ok(/not readable/.test(j2[0]), 'un jeton illisible le dit');
  ok(r.nouveaux.length === 2 && /Verified/.test(r.nouveaux[0][2]) && /Not verified/.test(r.nouveaux[1][3]), 'nouveaux jetons : naissance « Verified », createur non verifie dit « Not verified »');
  ok(r.groupes.length === 1 && r.groupes[0][2] === '4', 'groupe d\'inities : 4 wallets, avec son bloc');
  ok(/stopped at its budget/.test(r.passe[0]) && /41\.2 MB read/.test(r.passe[1]) && /21 pools born · 1 alert/.test(r.passe[3]), 'etat de la derniere passe et de la veille');
  const sur = r.liens.every((h) => /^https:\/\/dexscreener\.com\/robinhood\/0x[0-9a-f]{40}$/.test(h) || /^https:\/\/robinhoodchain\.blockscout\.com\/(address\/0x[0-9a-f]{40}|tx\/0x[0-9a-f]{64})$/.test(h) || h === 'swoge_ai.html');
  ok(sur && r.liens.length > 20, 'liens : DexScreener et Blockscout seulement (' + r.liens.length + '), adresses et hashes valides');
  ok(!r.liens.some((h) => /javascript:|pas-une-adresse/.test(h)), 'une adresse invalide ne devient jamais un lien');
  ok(r.boutons === 0, 'aucun bouton, aucun formulaire dans la page');
  ok(r.achats.length === 0, 'aucun lien ni bouton qui invite a acheter, echanger ou trader' + (r.achats.length ? ' : ' + r.achats.join(' | ') : ''));
  const FR = /\b(le|les|des|une|est|pour|avec|sans|jetons?|portefeuilles?|aucun|lecture|seule|achat|vente|gagnant|perdant|createur|derni[eè]re?)\b|[éèêàùç]/i;
  const fr = r.texte.split('\n').filter((l) => FR.test(l));
  ok(fr.length === 0, 'aucun texte francais visible' + (fr.length ? ' : ' + fr.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  console.log('\n-- 2. eteint, en demarrage, injoignable --');
  ({ p, ctx } = await ouvre('off'));
  await p.waitForFunction(() => /off on the server/.test(document.querySelector('#statut').textContent));
  r = await lit(p);
  ok(r.pastille === 'Off on the server' && /nothing is read and no alert is sent/.test(r.statut), 'eteint : la page le dit');
  ok(r.wallets.length === 1 && r.wallets[0][0] === 'Off on the server.', 'eteint : aucune ligne inventee');
  await ctx.close();
  ({ p, ctx } = await ouvre('demarre'));
  await p.waitForFunction(() => /opening its database/.test(document.querySelector('#statut').textContent));
  ok(true, 'en demarrage : « opening its database »');
  await ctx.close();
  ({ p, ctx } = await ouvre('panne'));
  await p.waitForFunction(() => document.querySelector('#pastilleTxt').textContent === 'Unreachable');
  r = await lit(p);
  ok(/could not be read right now/.test(r.statut), 'injoignable : la page le dit');
  await ctx.close();

  console.log('\n-- 3. largeurs : 320, 390, 1440 px --');
  for (const w of [320, 390, 1440]) for (const src of ['api', 'long']) {
    ({ p, ctx } = await ouvre(src, w));
    await p.waitForFunction(() => document.querySelectorAll('#jetons tr').length >= 3);
    const g = await p.evaluate(() => {
      const m = document.querySelector('main').getBoundingClientRect(), l = document.querySelector('.sw-lat');
      const lat = l && getComputedStyle(l).display !== 'none' ? l.getBoundingClientRect().left : 1e9;
      /* un tableau qui defile dans sa carte cache des colonnes : a 1440, aucun ne doit defiler */
      const defilent = [...document.querySelectorAll('main .ds-table')].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.querySelector('tbody').id);
      return { large: document.documentElement.scrollWidth, main: m.right, lat, defilent, cartes: Math.max(...[...document.querySelectorAll('main .ds-carte')].map((e) => e.getBoundingClientRect().right)) };
    });
    ok(g.large <= w + 1, `${w} px (${src}) : rien ne deborde (${g.large} px)`);
    if (w === 1440) ok(g.defilent.length === 0, `1440 px (${src}) : chaque tableau tient dans sa carte, toutes ses colonnes visibles` + (g.defilent.length ? ' : ' + g.defilent.join(', ') : ''));
    if (w === 1440) ok(g.main <= g.lat + 1 && g.cartes <= g.lat + 1, `1440 px (${src}) : <main> s'arrete avant la colonne de droite`);
    await ctx.close();
  }

  console.log('\n-- 4. console --');
  ok(erreurs.length === 0, 'aucune erreur console ni erreur de page' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''));
  await nav.close(); srv.close();
  fin();
})().catch((e) => { console.error('  RATE ' + (e.stack || e)); process.exit(1); });
function fin() { console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe')); process.exit(rates ? 1 : 0); }
