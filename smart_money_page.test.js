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
 *  - texte echappe (piege XSS dans un symbole) ; rien qui deborde a 320, 390, 768
 *    et 1440 px ; aucune erreur console ; aucun texte francais visible ;
 *  - eteint, en demarrage, injoignable ou PERIME, la page le dit ;
 *  - outils/onglets_ia.js ne la reecrit pas (menu commun, AI Trading sans « on »).
 * Revue du 13/10 : chaque ligne deplie sa PREUVE (bloc, tx, marques) ; une source
 * Not verified est un lien ; une valeur inconnue n'est jamais un zero ; ?server=
 * n'accepte que le serveur officiel ; sans Playwright, l'essai ECHOUE.
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
  maintenant: T,
  regles: { acheteurs: 50, mise_min_eth: 0.01, tot_min: 60, smart_jetons: 3, projets_assez: 10, z_verdict: 2, groupe_min: 3, groupe_ecart_pct: 2, bloc_charge: 5, relais_pct: 99, relais_blocs: 6000, seuil_usd: 1e6,
    base_assez: 20, robots_min: 3, lanceur_auto: 8, actifs_min: 50, pic_candidat_usd: 100000, passe_min: 30, veille_min: 5 },
  passe: { id: 9, genre: 'passe', debut: T - 900, fin: T - 60, statut: 'ok', appels: 600, octets: 41234567, gt: 13, ds: 9, jetons: 2, detail: { retenus: 1, pics: 2, lus: 2, statut: 'ok' } },
  veille: { id: 10, genre: 'veille', debut: T - 30, fin: T - 29, statut: 'ok', appels: 7, octets: 120000, gt: 0, ds: 0, jetons: 0, detail: { de: 87100001, a: 87102900, creations: 21, achats: 2, alertes: 1, saute: 0 } },
  passe_ok: { fin: T - 60, statut: 'ok' }, veille_ok: { fin: T - 29, statut: 'ok' },
  compteurs: { retenus: 42, lus: 3, wallets: 143, smart: 2, inities: 31, creations24h: 3 },
  wallets: [
    { adresse: A('51'), projets: 3, connus: 3, jugeables: 3, gagnants: 3, gain_total_wei: '1500000000000000000', delai_moyen_min: 8.25, attendu: 1.23, z: 2.41, smart: true, initie: false, verdict: 'pas_assez' },
    { adresse: A('52'), projets: 12, connus: 12, jugeables: 12, gagnants: 10, gain_total_wei: '820000000000000000', delai_moyen_min: 4.5, attendu: 6, z: 2.31, smart: true, initie: false, verdict: 'mieux_que_la_base' },
    { adresse: A('61'), projets: 3, connus: 3, jugeables: 3, gagnants: 3, gain_total_wei: '600000000000000000', delai_moyen_min: 0.33, attendu: 1.5, z: 1.7, smart: false, initie: true, verdict: 'initie' },
    { adresse: A('53'), projets: 12, connus: 12, jugeables: 12, gagnants: 10, gain_total_wei: '-3492885487536608', delai_moyen_min: 20, attendu: 10.8, z: -0.77, smart: false, initie: false, verdict: 'comme_la_base' },
    /* issues inconnues : 0 gagnant sur 0 connu, 2 jetons « tot » — jamais « 0 / 2 » (revue P10) */
    { adresse: A('ab'), projets: 2, connus: 0, jugeables: 0, gagnants: 0, gain_total_wei: '0', delai_moyen_min: 3, attendu: 0, z: null, smart: false, initie: false, verdict: 'pas_assez' },
  ],
  createurs: [
    { adresse: '0x84b8affbd7728217f97c8eb47fe4bda07d97b8c1', role: 'migration', lancements: 3, reussites: 3, reussites_connues: 3, retraits: 0, lp_brulees: 0, drapeaux: 0, rampes: 0, migrations: 12, jetons: [A('a1')] },
    { adresse: '0xa63126c2041b1d4eb28f025ab8457815aeb74d3e', role: 'lanceur', lancements: 3, reussites: 3, reussites_connues: 3, retraits: 0, lp_brulees: 0, drapeaux: 0, rampes: 38, migrations: 0, jetons: [A('a2')] },
    { adresse: '0xb760edab21dd2855327d2a72be90f86b523fba7d', role: 'deployeur', lancements: 1, reussites: 1, reussites_connues: 1, retraits: 0, lp_brulees: 1, drapeaux: 1, rampes: 0, migrations: 0, jetons: [A('a3')],
      drapeaux_liste: [{ type: 'sortie_de_dead', jeton: '0x5b81efe5e0ba2b31c0ed843b908a2c45fe6e14c5', symbole: 'astro', decimales: 9, valeur: '973323411065236870', bloc: 67639726, tx: '0x3ba299f1f88caeaebe1c634fc8736b981d4ea57544bd2544f6e75180f482e69e' }] },
    /* un role NON verifie (revue P1), et des comptes pas encore faits (revue P5 : NOVAAI, pic non lu, rampes nulles) */
    { adresse: '0x2d74000000000000000000000000000000000001', role: 'inconnu', lancements: 2, reussites: 1, reussites_connues: 1, retraits: 0, lp_brulees: 0, drapeaux: 0, rampes: null, migrations: null, jetons: [A('a7')] },
  ],
  jetons: [
    { adresse: '0x737054bd706cba68eaf4661411fede5f6c2952e5', symbole: 'BRODIE', statut: 'lu', mode: 'tout',
      lancement: { bloc: 49296036, t: 1788373613, tx: '0x8c73e19acad1d6f9852bc619128ea4ffb3bb023ec52c7b44079124ea59e2591c', piscine: H('b6'), version: 4 },
      createur: { adresse: '0x84b8affbd7728217f97c8eb47fe4bda07d97b8c1', role: 'migration', verifie: true, bloc: 49296036, tx: '0x8c73e19acad1d6f9852bc619128ea4ffb3bb023ec52c7b44079124ea59e2591c', via: '0x9310bc8bf95fa35608a9f08f76b55b4fdddc1ef0' },
      ancien: '0x45f82ac5d507e988f7406935da8eefe495a360e0', details: { ancien: { jeton: '0x45f82ac5d507e988f7406935da8eefe495a360e0', createur: '0xebc1188f54b8591eb3322b273391a2f4a714dbd4', role: 'lanceur', bloc: 9141382 } },
      pic: { usd: 3329804, jour: '2026-08-29', source: 'geckoterminal daily close × totalSupply read on chain', piscine: H('b6') }, cap: { usd: 405431, source: 'geckoterminal fdv (uniswap-v4-robinhood)', piscine: H('b6') },
      base: { n: 37, gagnants: 12 }, recette: { achatPuisBrule: false, robots1reMinute: 1, profilSous3h: null, signature: '' }, drapeaux: [], liquidite: { version: 4, retirePct: 0 } },
    { adresse: '0x5b81efe5e0ba2b31c0ed843b908a2c45fe6e14c5', symbole: PIEGE, statut: 'lu', mode: 'acheteur',
      lancement: { bloc: 57852996, t: 1789664512, tx: '0x4e0b5b484517685b7d33dc7167572e7ba0d3f1b753280c5667c2a4b5c1449778', piscine: '0x3416b8d8aa6ae642ffdc2f65165ff479d4bd3007', version: 2 },
      createur: { adresse: '0xb760edab21dd2855327d2a72be90f86b523fba7d', role: 'deployeur', verifie: true, bloc: 57852996, tx: '0x4e0b5b484517685b7d33dc7167572e7ba0d3f1b753280c5667c2a4b5c1449778', via: null },
      pic: { usd: 13604577, jour: '2026-09-20', source: 'geckoterminal daily close × totalSupply read on chain', piscine: '0x3416b8d8aa6ae642ffdc2f65165ff479d4bd3007' }, cap: null, base: { n: 41, gagnants: 30 },
      recette: { achatPuisBrule: true, robots1reMinute: 4, profilSous3h: true, signature: 'creator-buy-then-burn+bots-first-minute+paid-profile-3h' },
      drapeaux: [{ type: 'sortie_de_dead', valeur: '973323411065236870', decimales: 9, bloc: 67639726, tx: '0x3ba299f1f88caeaebe1c634fc8736b981d4ea57544bd2544f6e75180f482e69e', n: 1 }],
      liquidite: { version: 2, brulePct: 99.99, retirePct: 93.4, plusGrosRetrait: { bloc: 71821393, tx: '0x87d0e1ea956354ae2154ea75deb1b3ff0d0ff9fa15c7898bdb6a80026bb26735' } } },
    { adresse: 'pas-une-adresse', symbole: 'BAD', statut: 'erreur', erreur: 'no ETH pool found on chain', createur: { adresse: 'javascript:alert(1)', role: 'inconnu', verifie: false }, pic: null, cap: { usd: 2.1e6, source: 'geckoterminal fdv' } },
    /* un createur NON verifie avec une adresse valide (revue P6, mutant A), et 7 premiers seulement (revue C5) */
    { adresse: A('a7'), symbole: 'NOVAAI', statut: 'lu', mode: 'acheteur', lancement: { bloc: 40138722, t: T - 9e6, tx: H('d7'), piscine: H('b7'), version: 4 },
      createur: { adresse: '0x2d74000000000000000000000000000000000001', role: 'inconnu', verifie: false, bloc: 40138722, tx: H('d7') }, details: { nPremiers: 7 },
      pic: null, cap: { usd: 434477642, source: 'geckoterminal fdv (pons-v2-dex)', piscine: H('b7') }, base: { n: 5, gagnants: 3 }, recette: null, drapeaux: [], liquidite: null },
  ],
  nouveaux: [
    { pool: H('c4'), jeton: A('a4'), version: 4, bloc: 87100100, t: T - 600, tx: H('d1'), createur: '0xb760edab21dd2855327d2a72be90f86b523fba7d', role: 'deployeur', verifie: 1 },
    /* un lancement v2 = deux paires du meme jeton : UNE ligne (revue P8) */
    { pool: A('c6'), jeton: A('a6'), version: 2, bloc: 87100300, t: T - 500, tx: H('d2'), createur: A('0f'), role: 'inconnu', verifie: 0 },
    { pool: A('c8'), jeton: A('a6'), version: 2, bloc: 87100300, t: T - 500, tx: H('d2'), createur: A('0f'), role: 'inconnu', verifie: 0 },
    { pool: A('c9'), jeton: A('a9'), version: 2, bloc: 87100400, t: T - 400, tx: H('d3'), createur: A('8c'), role: 'lanceur', verifie: 1, auto: 38 },
  ],
  groupes: [{ jeton: '0xdb97b2aefd6816485a757ae49280d598a5c9c848', bloc: 49880350, tx: H('e1'), n: 4, acheteursBloc: 4, charge: false, wallets: [A('71'), A('72'), A('73'), A('74')] },
    { jeton: '0x359645eabf181101ddb9b90787b9e8480c923e55', bloc: 49405448, tx: H('e2'), n: 16, acheteursBloc: 21, charge: true, wallets: [A('75'), A('76'), A('77'), A('78'), A('79'), A('7a'), A('7b'), A('7c'), A('7d')] }],
  liens: [{ a: '0x359645eabf181101ddb9b90787b9e8480c923e55', b: '0xfde368debe9e80f80785064a65719cec1f809dec', type: 'memes_premiers', detail: '6', symA: 'HM', symB: 'PEPONS' },
    { a: '0x737054bd706cba68eaf4661411fede5f6c2952e5', b: '0xdb97b2aefd6816485a757ae49280d598a5c9c848', type: 'meme_operateur_migration', detail: '0x84b8affbd7728217f97c8eb47fe4bda07d97b8c1', symA: 'BRODIE', symB: 'NILF' }],
  alertes: [{ id: 1, t: T - 100, genre: 'smart', jeton: A('a4'), envoye: 1 }],
  journal: [],
};
/* Des listes longues pour la largeur : 40 wallets, 60 jetons aux noms longs. */
const LONG = JSON.parse(JSON.stringify(VUE));
for (let i = 0; i < 36; i++) LONG.wallets.push(Object.assign({}, VUE.wallets[3], { adresse: A((10 + i).toString(16).padStart(2, '0')) }));
for (let i = 0; i < 57; i++) LONG.jetons.push(Object.assign({}, VUE.jetons[0], { symbole: 'AVERYLONGTOKENSYMBOLWITHOUTSPACES' + i }));
const OFF = { actif: false, pret: false, mode: 'off' };
const DEMARRE = { actif: true, pret: false, mode: 'envoi' };
/* PERIME (revue P4) : la derniere veille reussie a 3 jours, la passe aussi */
const PERIME = Object.assign(JSON.parse(JSON.stringify(VUE)), { veille_ok: { fin: T - 3 * 86400 }, passe_ok: { fin: T - 3 * 86400 }, t: T - 3 * 86400 });
/* une passe en ECHEC, veille fraiche : la pastille ne dit plus « Reading live » */
const ECHEC = Object.assign(JSON.parse(JSON.stringify(VUE)), { passe: Object.assign({}, VUE.passe, { statut: 'erreur', detail: { erreur: 'erreur du noeud sur eth_getLogs : log query timed out' } }) });
/* la preuve d'un wallet (/ai/smart/wallet?a=) : participations, bloc, tx, marques */
const PREUVE_W = { adresse: A('61'), participations: [
  { jeton: '0x2a13008cc2f5a853f6fb21cbd90841806c64b247', symbole: 'TROLL', rang: 12, bloc: 74578365, minutes: 1.4, tot: true, tx: H('f1'), entre_wei: '180180000000000000', sorti_wei: '246068603591218608', gain_wei: '65888603591218608', issue: 'gagnant', frais_lus: true, contrat: false,
    marques: [{ type: 'groupe', preuve: { bloc: 74578365, tx: H('f1'), n: 5, acheteursBloc: 9 } }, { type: 'coentree', preuve: { membres: [A('61'), A('62'), A('63')], blocs: [{ jeton: A('a1'), bloc: 49405103, tx: H('f2') }, { jeton: A('a2'), bloc: 66204136, tx: H('f3') }] } }] },
  { jeton: '0xfde368debe9e80f80785064a65719cec1f809dec', symbole: 'PEPONS', rang: 2, bloc: 66202545, minutes: 2.7, tot: true, tx: H('f4'), entre_wei: '299348000000000000', sorti_wei: '0', gain_wei: null, issue: 'inconnu', frais_lus: false, contrat: true,
    marques: [{ type: 'relais', preuve: { bloc: 66204318, tx: H('f5'), apresBlocs: 1773, nonceAchat: 10 } }] }] };

(async () => {
  console.log('-- 0. le menu commun : onglets_ia.js ne reecrit pas la page --');
  {
    const O = require('./outils/onglets_ia');
    const h = fs.readFileSync(path.join(SITE, 'swoge_smart_money.html'), 'utf8');
    ok(O.transforme('swoge_smart_money.html', h) === h, 'la page est stable sous outils/onglets_ia.js (AI Trading sans « on »)');
    ok(/<a href="swoge_ai\.html"><span class="ic">&#129302;<\/span>AI Trading<\/a>/.test(h), 'l\'entree AI Trading du menu commun est la');
    ok(!/<form|<button[^>]*>\s*(buy|swap|trade)/i.test(h), 'aucun formulaire, aucun bouton d\'achat dans le source');
  }
  /* revue P11 : sans Playwright, l'essai ne passe PAS en silence */
  if (!chromium) { ok(false, 'playwright absent : NODE_PATH ? (verifie.sh le pose ; lance a la main, poser NODE_PATH vers ~/.swoge-pw/node_modules)'); return fin(); }
  const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.json': 'application/json' };
  const srv = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    const vue = { '/api/ai/smart': VUE, '/long/ai/smart': LONG, '/off/ai/smart': OFF, '/demarre/ai/smart': DEMARRE, '/perime/ai/smart': PERIME, '/echec/ai/smart': ECHEC, '/api/ai/smart/wallet': PREUVE_W }[u];
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
      wallets: lignes('#wallets'), createurs: lignes('#createurs'), jetons: lignes('#jetons'), nouveaux: lignes('#nouveaux'), groupes: lignes('#groupes'), liensT: lignes('#liens'),
      passe: [...document.querySelectorAll('#passe .ds-kpi')].map((k) => k.textContent),
      liens: [...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')),
      boutons: [...document.querySelectorAll('main button, main form, main input')].length,
      achats: [...document.querySelectorAll('main a, main button')].filter((e) => /\b(buy|trade|swap|ape in)\b/i.test(e.textContent)).map((e) => e.textContent),
      pirate: window.pirate, imgs: document.querySelectorAll('main img').length,
      texte: document.body.innerText, notes: t('#walletsNote') + ' ' + t('#createursNote') };
  });

  console.log('\n-- 1. la vue complete --');
  let { p, ctx } = await ouvre('api');
  await p.waitForFunction(() => document.querySelectorAll('#wallets tr').length >= 5);
  let r = await lit(p);
  ok(/Alerts go to the owner only\. Nothing is ever bought\./.test(r.statut), 'statut : alertes au proprietaire, rien n\'est achete');
  ok(r.pastille === 'Reading live', 'pastille : en direct (veille et passe fraiches)');
  ok(r.kpis[0].includes('3') && /of 42 found/.test(r.kpis[0]), 'KPI : 3 jetons lus sur 42 trouves (le compte est dit)');
  ok(/Smart \(owner’s rule\)2/.test(r.kpis[2]), 'KPI : 2 smart, « owner’s rule »');
  const w0 = r.wallets[0], w1 = r.wallets[1], w2 = r.wallets[2], w3 = r.wallets[3], w4 = r.wallets[4];
  ok(/^Smart/.test(w0[1]) && /^3 of 3 knownVerified$/.test(w0[2]) && /No verdict under 10 known outcomes \(3 so far\)/.test(w0[5]), 'smart sous le seuil : « No verdict under 10 known outcomes (3 so far) » (revue C3)');
  ok(w0[3] === '1.2' && w0[4] === '+2.4', 'le taux de base attendu (1.2) et le z (+2.4) sont a cote');
  ok(/Beats the base rate/.test(w1[5]), '12 issues connues, z >= 2 : « Beats the base rate »');
  ok(/^Insider pattern/.test(w2[1]) && /Insider pattern — never smart/.test(w2[5]), 'initie : « insider pattern », jamais smart, meme gagnant sur 3 jetons (revue INI-08)');
  ok(/No better than the base rate/.test(w3[5]) && /^−0\.0035Verified$/.test(w3[6]), '10 sur 12 a 90 % de base : « No better than the base rate », perte en ETH signee');
  ok(/^\+1\.500Verified$/.test(w0[6]), 'gain en ETH, « Verified » (lu sur la chaine)');
  ok(/^0 of 0 knownVerified2 early; the rest: outcome unknown$/.test(w4[2]) && !/0 \/ 2/.test(w4[2]), 'issues inconnues : « 0 of 0 known », jamais « 0 / 2 » (revue P10)');
  ok(/base rate/.test(r.notes) && /without the wallet itself and without marked wallets/.test(r.notes) && /fees read in its receipts/.test(r.notes), 'la note explique la regle, le taux de base sans le wallet ni les marques, les frais');
  const c0 = r.createurs[0];
  ok(/Ran a migration \(not the original creator\)Verified/.test(c0[1]) && !/Deployed/.test(c0[1]), '0x84b8… : operateur de migration (Verified), jamais « createur »');
  ok(/12 migrations sent/.test(c0[6]), 'et ses 12 migrations envoyees sont comptees');
  ok(/3 \/ 3Not verified/.test(r.createurs[1][3]) && /38 on a known launchpad/.test(r.createurs[1][6]), '0xa631… : 3 au-dessus de 1 M$ (Not verified), 38 lancements comptes sur la rampe');
  ok(/1Verified/.test(r.createurs[2][5]), 'astro : LP brulee, « Verified »');
  ok(/973\.3M astro moved out of 0x…dead.*block 67,639,726Verified/.test(r.createurs[2][7]), 'createurs, Flags : la NATURE du drapeau, son bloc, sa tx, « Verified » (revue P9)');
  const ci = r.createurs[3];
  ok(/First transaction read \(not verified as deployer\)Not verified$/.test(ci[1]), 'un role NON verifie porte « Not verified » (revue P1 : il portait « Verified »)');
  ok(/^not counted yet$/.test(ci[6]) && !/read/.test(ci[6]), 'rampes et migrations pas encore comptees : « not counted yet », jamais 0 ni une repetition (revue P5)');
  const j0 = r.jetons[0], j1 = r.jetons[1], j2 = r.jetons[2], j3 = r.jetons[3]; /* colonnes : jeton, pic/actuel, lancement, lance par, gagnants, drapeaux */
  ok(/^\$3\.33MNot verifiedbest daily close, 2026-08-29geckoterminal daily close × totalSupply read on chainnow \$405kNot verifiedgeckoterminal fdv \(uniswap-v4-robinhood\)$/.test(j0[1]), 'pic BRODIE 3,33 M$ et valeur actuelle, chacun « Not verified », avec leur source ECRITE en clair (revue P3)');
  ok(/^block 49,296,036Verified/.test(j0[2]), 'lancement : bloc et « Verified »');
  ok(/Ran a migration/.test(j0[3]) && /old token 0x45f8…60e0 created by 0xebc1…dbd4/.test(j0[3]), 'BRODIE : migration, et le createur de l\'ancien jeton');
  ok(/^12 of 37Verified/.test(j0[4]), 'gagnants de la 1re heure : 12 sur 37 (le compte est dit)');
  ok(j1[0].includes(PIEGE) && r.pirate === undefined && r.imgs === 0, 'symbole piege : affiche en texte, rien n\'est execute');
  ok(/973\.3M .* moved out of 0x…dead/.test(j1[5]) && /block 67,639,726Verified/.test(j1[5]), 'astro : 973,3 M sortis de 0x…dead, bloc et « Verified »');
  ok(/93% of the liquidity added was removed/.test(j1[5]), 'liquidite retiree a 93 % : drapeau');
  ok(/paid DexScreener profile within 3 hNot verifiedDexScreener/.test(j1[5]), 'profil paye : « Not verified », avec le lien DexScreener');
  ok(/3\+ buyers in the first minuteVerifiedread as botsNot verified/.test(j1[5]), 'recette : « 3+ buyers in the first minute » lu, « bots » deduit (revue INI-13)');
  ok(/not readable/.test(j2[0]) && /no ETH pool found on chain \(it trades against another asset\)/.test(j2[0]), 'un jeton illisible dit POURQUOI (revue P9)');
  ok(/Not verified/.test(j3[3]) && /^0x2d74/.test(j3[3]), 'un createur non verifie dans le tableau des jetons : « Not verified » (revue P6, mutant A)');
  ok(/only 7 first buyers of 50 read/.test(j3[4]) && /under 20: no base rate/.test(j3[4]), 'NOVAAI : 7 premiers seulement, et pas de taux de base sous 20 (revues C5, C6)');
  const gt = await p.evaluate(() => [...document.querySelectorAll('#jetons a.sm-source')].map((a) => a.getAttribute('href')));
  ok(gt.some((h) => /^https:\/\/www\.geckoterminal\.com\/robinhood\/pools\/0x[0-9a-f]{64}$/.test(h)) && gt.some((h) => /^https:\/\/www\.geckoterminal\.com\/robinhood\/pools\/0x[0-9a-f]{40}$/.test(h)), 'chaque valeur Not verified a un lien vers sa source GeckoTerminal (piscine v4 ou v2) (revue P3)');
  const nonSource = await p.evaluate(() => [...document.querySelectorAll('#jetons tr')].filter((tr) => tr.querySelector('td a.sm-nom')).map((tr) => tr.children[1]).filter((td) => td.querySelector('.sm-src.nv') && /\$/.test(td.textContent) && !td.querySelector('a.sm-source')).length);
  ok(nonSource === 0, 'aucune valeur en dollars « Not verified » sans lien de source');
  ok(/50\+ wallets in the last 24 hours/.test(r.texte) && /\$100k\+ now/.test(r.texte) && /peaked over \$1M and then died is not listed/.test(r.texte), 'la note dit la VRAIE regle de decouverte (revue P7)');
  ok(r.nouveaux.length === 3 && /Verified/.test(r.nouveaux[0][2]) && /Not verified/.test(r.nouveaux[1][3]), 'nouveaux jetons : une ligne par JETON (4 piscines, 3 jetons), naissance « Verified », createur non verifie « Not verified » (revue P8)');
  ok(/Uniswap v2Uniswap v2 ?2 pools/.test(r.nouveaux[1][1].replace(/\s+/g, ' ').replace(/ /g, '')) || /2 pools/.test(r.nouveaux[1][1]), 'un lancement v2 : ses 2 piscines dans la meme ligne');
  ok(/automated launcher \(38 in 24 h\)/.test(r.nouveaux[2][3]), 'un lanceur automatique est dit tel (revue INI-07)');
  ok(r.groupes.length === 2 && /^16 wallets, 9 among its first 50$/.test(r.groupes[1][2]) && /same-block pattern/.test(r.groupes[1][1]), 'groupe : sa taille REELLE (16, dont 9 parmi les 50) et « same-block pattern » dans un bloc charge (revues INI-09, INI-03)');
  ok(r.liensT.length === 2 && /Shared first buyers/.test(r.liensT[0][0]) && /6 of their first 50 buyers/.test(r.liensT[0][2]) && /Same migration operator/.test(r.liensT[1][0]) && /^HM · PEPONS$/.test(r.liensT[0][1]), 'les liens entre jetons sont MONTRES (revue INI-10)');
  ok(/complete/.test(r.passe[0]) && /ended 2026-/.test(r.passe[0]) && /41\.2 MB read/.test(r.passe[1]) && /21 pools born · 1 alert · ended 2026-/.test(r.passe[3]), 'etat de la derniere passe et de la veille, avec leur HEURE DE FIN (revue P4)');
  /* la PREUVE d'un wallet, depliee a la demande (revue P2, INI-08) */
  await p.evaluate(() => { const d = document.querySelectorAll('#wallets details.sm-preuve')[2]; d.open = true; });
  await p.waitForFunction(() => /TROLL/.test(document.querySelectorAll('#wallets details.sm-preuve')[2].textContent));
  const pw = await p.evaluate(() => { const d = document.querySelectorAll('#wallets details.sm-preuve')[2]; return { t: d.textContent, liens: [...d.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')) }; });
  ok(/TROLL — buyer #12/.test(pw.t) && pw.liens.includes('https://robinhoodchain.blockscout.com/tx/' + H('f1')), 'preuve : le jeton, le rang, le BLOC et le lien de la tx');
  ok(/same-block pattern/.test(pw.t) && /5 wallets within ±2% in this block \(9 buyers in the block\)/.test(pw.t), 'la marque dit son TYPE (pas seulement « Insider ») et sa preuve');
  ok(/same blocks on several tokens/.test(pw.t) && pw.liens.includes('https://robinhoodchain.blockscout.com/tx/' + H('f2')), 'co-entree : ses blocs, en liens');
  ok(/relay/.test(pw.t) && /its buy was its transaction #10/.test(pw.t) && /looks the same/.test(pw.t), 'relais : le nonce de l\'achat, et « un envoi a son propre wallet ressemble » (revue INI-11)');
  ok(/outcome unknown/.test(pw.t) && /fees not read/.test(pw.t) && /a contract, not a wallet/.test(pw.t), 'issue inconnue, frais non lus (Not verified), drapeau « contrat » (revue INI-14)');
  ok(/“insider” is a reading of this pattern, not a fact about the wallet’s owner/.test(pw.t), '« insider » : une lecture du motif, jamais une qualite du detenteur');
  r = await lit(p);
  const sur = r.liens.every((h) => /^https:\/\/dexscreener\.com\/robinhood\/0x[0-9a-f]{40}$/.test(h) || /^https:\/\/robinhoodchain\.blockscout\.com\/(address\/0x[0-9a-f]{40}|tx\/0x[0-9a-f]{64})$/.test(h) || /^https:\/\/www\.geckoterminal\.com\/robinhood\/pools\/0x([0-9a-f]{40}|[0-9a-f]{64})$/.test(h) || h === 'swoge_ai.html');
  ok(sur && r.liens.length > 20, 'liens : DexScreener, Blockscout et GeckoTerminal seulement (' + r.liens.length + '), adresses et hashes valides');
  ok(!r.liens.some((h) => /javascript:|pas-une-adresse/.test(h)), 'une adresse invalide ne devient jamais un lien');
  ok(r.boutons === 0, 'aucun bouton, aucun formulaire dans la page');
  ok(r.achats.length === 0, 'aucun lien ni bouton qui invite a acheter, echanger ou trader' + (r.achats.length ? ' : ' + r.achats.join(' | ') : ''));
  const FR = /\b(le|les|des|une|est|pour|avec|sans|jetons?|portefeuilles?|aucun|lecture|seule|achat|vente|gagnant|perdant|createur|derni[eè]re?)\b|[éèêàùç]/i;
  const fr = r.texte.split('\n').filter((l) => FR.test(l));
  ok(fr.length === 0, 'aucun texte francais visible' + (fr.length ? ' : ' + fr.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  console.log('\n-- 2. eteint, en demarrage, injoignable, perime, en echec, serveur douteux --');
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
  ok(['wallets', 'createurs', 'jetons', 'nouveaux', 'groupes'].every((k) => r[k].length === 1 && /Unreachable — retrying every minute/.test(r[k][0][0])), 'injoignable : CHAQUE tableau le dit (revue P9 : ils restaient vides)');
  await ctx.close();
  ({ p, ctx } = await ouvre('perime'));
  await p.waitForFunction(() => document.querySelectorAll('#wallets tr').length >= 5);
  r = await lit(p);
  ok(r.pastille === 'Stale' && /The numbers below are old/.test(r.statut), 'donnees vieilles de 3 jours : pastille « Stale », plus jamais « Reading live » (revue P4)');
  await ctx.close();
  ({ p, ctx } = await ouvre('echec'));
  await p.waitForFunction(() => document.querySelectorAll('#wallets tr').length >= 5);
  r = await lit(p);
  ok(r.pastille === 'Last pass failed' && /The last pass did not finish/.test(r.statut) && /log query timed out/.test(r.passe[0]), 'passe en echec : la pastille le dit, et la cause est montree (revue P9)');
  await ctx.close();
  {
    const ctx2 = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    const p2 = await ctx2.newPage();
    let versEvil = 0;
    await p2.route('**/*', (q) => { const u = q.request().url(); if (new URL(u).hostname === 'evil.example' && /\/ai\/smart/.test(new URL(u).pathname)) versEvil++; return u.startsWith(base) ? q.continue() : q.fulfill({ status: 200, body: '', contentType: 'text/plain' }); });
    await p2.goto(base + 'swoge_smart_money.html?server=' + encodeURIComponent('https://evil.example'), { waitUntil: 'domcontentloaded' });
    await p2.waitForFunction(() => !document.querySelector('#bandeau').hidden, null, { timeout: 5000 }).catch(() => {});
    const b2 = await p2.evaluate(() => document.querySelector('#bandeau').textContent);
    ok(/server address in this link was ignored/.test(b2) && versEvil === 0, '?server= vers un hote inconnu : /ai/smart n\'est JAMAIS lu chez lui, et la page le DIT (revue N11 ; le bandeau des chiffres du gabarit, commun a 48 pages, n\'est pas de cette revue)');
    await ctx2.close();
  }

  console.log('\n-- 3. largeurs : 320, 390, 768, 1440 px --');
  for (const w of [320, 390, 768, 1440]) for (const src of ['api', 'long']) {
    ({ p, ctx } = await ouvre(src, w));
    await p.waitForFunction(() => document.querySelectorAll('#jetons tr').length >= 3);
    const g = await p.evaluate(() => {
      const m = document.querySelector('main').getBoundingClientRect(), l = document.querySelector('.sw-lat');
      const lat = l && getComputedStyle(l).display !== 'none' ? l.getBoundingClientRect().left : 1e9;
      /* un tableau qui defile dans sa carte cache des colonnes : a 768 et 1440, le tableau des jetons ne doit pas defiler (drapeaux visibles) */
      const defilent = [...document.querySelectorAll('main .ds-table')].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.querySelector('tbody').id);
      const v = [...document.querySelectorAll('#wallets tr')][0];
      const verdictVu = v ? [...v.querySelectorAll('.sm-etroit, td.col-verdict')].some((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right <= v.closest('.ds-table').getBoundingClientRect().right + 1) : false;
      return { large: document.documentElement.scrollWidth, main: m.right, lat, defilent, verdictVu, cartes: Math.max(...[...document.querySelectorAll('main .ds-carte')].map((e) => e.getBoundingClientRect().right)) };
    });
    ok(g.large <= w + 1, `${w} px (${src}) : rien ne deborde (${g.large} px)`);
    if (w >= 768) ok(!g.defilent.includes('jetons'), `${w} px (${src}) : le tableau des jetons tient dans sa carte, colonne des drapeaux visible` + (g.defilent.length ? ' (defilent : ' + g.defilent.join(', ') + ')' : ''));
    if (w === 1440) ok(g.defilent.length === 0, `1440 px (${src}) : chaque tableau tient dans sa carte, toutes ses colonnes visibles` + (g.defilent.length ? ' : ' + g.defilent.join(', ') : ''));
    if (w === 1440) ok(g.main <= g.lat + 1 && g.cartes <= g.lat + 1, `1440 px (${src}) : <main> s'arrete avant la colonne de droite`);
    if (w <= 390) ok(g.verdictVu, `${w} px (${src}) : le verdict se voit sans defiler (revue P10)`);
    await ctx.close();
  }

  console.log('\n-- 4. console --');
  ok(erreurs.length === 0, 'aucune erreur console ni erreur de page' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''));
  await nav.close(); srv.close();
  fin();
})().catch((e) => { console.error('  RATE ' + (e.stack || e)); process.exit(1); });
function fin() { console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe')); process.exit(rates ? 1 : 0); }
