'use strict';
/* ============================================================================
 * LE CERVEAU DE LA COLONIE (15/10/2026) — LA MAQUETTE v7, BRANCHEE SUR LE VRAI
 *
 * Le proprietaire a choisi la maquette « cerveau » : un cerveau vu de dessus,
 * chaque agent une aire, chaque jeton un influx, et un panneau des positions
 * ouvertes en DOLLARS. Elle est posee en tete de la colonie de `swoge_ai.html`.
 * Ce que cet essai tient, sur la vraie reponse de /ai/colonie
 * (`ai_colonie_reelle.json`, recalee sur l'heure de l'essai) servie par une
 * route moquee, a laquelle on ajoute des positions et un carnet du jour :
 *
 *   1. le cerveau est le PREMIER element de la colonie, pleine largeur, et son
 *      canvas est dessine ;
 *   2. le panneau montre les vraies positions : mise → valeur, ±$ et ±%, ce
 *      qui a deja ete encaisse compris ; une position sans prix le dit et ne
 *      compte pas dans le total ; sans position, il le dit ;
 *   3. chaque aire donne la part refusee = bloques / vus du roster, avec le
 *      nombre de vus — et sous AUDIT_ASSEZ vus, elle ne donne pas de part ;
 *   4. « Realized today » est la somme des gains du carnet depuis minuit UTC ;
 *      les chiffres cles sont ceux de la vue ; le debit du Scout attend deux
 *      lectures a un tour d'ecart ;
 *   5. aucun defilement de cote a 320, 390 et 1280 px ; aucune erreur ;
 *   6. mouvement reduit : une image fixe, les chiffres quand meme ; sans
 *      preference, la scene tourne, et s'arrete hors de l'ecran ;
 *   7. la densite de pixels est plafonnee a 2 ; le francais bascule tout.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
const SITE = __dirname, PAGE = 'swoge_ai.html';
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const REELLE = JSON.parse(fs.readFileSync(path.join(SITE, 'ai_colonie_reelle.json'), 'utf8'));

/* Trois positions comme le serveur les sert (`vue()` d'ai_colonie.js) : une en
   perte, une sortie a 70 % par paliers (encaisse 12,40 $, le reste vaut
   +2,24 $), une sans prix frais (latent null). */
const POSITIONS = [
  { sym: 'PONS', adr: '0x' + 'a1'.repeat(20), mise: 137.64, latent: -1.8, gainLatent: -2.53, encaisse: 0, reste: 1, ouverteDepuis: 600000, tenueMin: 120 },
  { sym: 'NOVA', adr: '0x' + 'a2'.repeat(20), mise: 35, latent: 21.3, gainLatent: 2.24, encaisse: 12.4, reste: 0.3, ouverteDepuis: 300000, tenueMin: 120 },
  { sym: 'MUET', adr: '0x' + 'a3'.repeat(20), mise: 50, latent: null, gainLatent: null, encaisse: 0, reste: 1, ouverteDepuis: 60000, tenueMin: 120 },
];
function vue(modif) {
  const j = JSON.parse(JSON.stringify(REELLE)), dt = Date.now() - j.t;
  j.t += dt; j.maj += dt; j.dernierTour += dt;
  j.positions = JSON.parse(JSON.stringify(POSITIONS));
  /* le carnet : deux fermetures aujourd'hui (UTC, horloge du serveur), une hier */
  const d = new Date(j.t), minuit = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const apres = Math.max(minuit + 1000, j.t - 3600000);
  j.carnet.lignes = [
    { sym: 'AUJ1', t0: apres - 60000, t: apres, mise: 100, r: 10, gain: 10 },
    { sym: 'AUJ2', t0: apres - 60000, t: apres + 500, mise: 100, r: -3, gain: -3 },
    { sym: 'HIER', t0: minuit - 7200000, t: minuit - 3600000, mise: 100, r: 50, gain: 50 },
  ];
  j.carnet.n = 3;
  if (modif) modif(j);
  return j;
}

(async () => {
  if (!chromium) { console.log('playwright absent — essai ignore'); return; }
  const srv = http.createServer((q, r) => { const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const BASE = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  const ouvre = async (o) => {
    o = o || {};
    const ctx = await nav.newContext({ viewport: { width: o.w || 1280, height: o.h || 900 }, deviceScaleFactor: o.dpr || 1, reducedMotion: o.rm ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage(), err = [];
    page.on('pageerror', (e) => err.push('pageerror ' + String(e).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) err.push('console ' + m.text().slice(0, 200)); });
    page.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) err.push('http ' + r.status() + ' ' + r.url().slice(BASE.length)); });
    await page.route((u) => !u.href.startsWith(BASE) && !/\/ai\/colonie/.test(u.href), (r) => r.abort());
    await page.route(/\/ai\/colonie/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(o.vue ? o.vue() : vue()) }));
    await page.goto(BASE + PAGE, { waitUntil: 'load' });
    await page.waitForTimeout(o.attente || 1500);
    return { ctx, page, err };
  };
  /* des pixels non transparents dans le canvas : il est DESSINE, pas seulement pose */
  const peint = (page) => page.evaluate(() => { const c = document.getElementById('cvCanvas'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data;
    let k = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) k++; return { k, w: c.width, h: c.height }; });

  console.log('-- 1. le cerveau est le premier element de la colonie, pleine largeur, et il est dessine --');
  {
    const { ctx, page, err } = await ouvre();
    const m = await page.evaluate(() => { const s = document.getElementById('tm-live'), c = document.getElementById('cerveau'), r = c.getBoundingClientRect();
      const grands = [...s.children].filter((e) => { const b = e.getBoundingClientRect(); return b.height > 200; });
      return { premier: s.firstElementChild === c, premierGrand: grands[0] === c, l: r.width, vw: document.documentElement.clientWidth, h: r.height, vh: innerHeight,
               avantSky: !!(c.compareDocumentPosition(document.getElementById('sky')) & Node.DOCUMENT_POSITION_FOLLOWING), n: Cerveau.neurones() }; });
    ok(m.premier && m.premierGrand, 'le cerveau est le premier element de #tm-live, et le premier grand');
    ok(Math.abs(m.l - m.vw) <= 1 && m.h >= 0.6 * m.vh, 'pleine largeur (' + m.l + ' / ' + m.vw + ' px) et au moins 60 % de la hauteur de l ecran (' + Math.round(m.h) + ' px)');
    ok(m.avantSky, 'il est AU-DESSUS de l ancien schema des agents (#sky), qui reste pour ce qu il porte');
    ok(m.n === 1300, 'les neurones de la maquette sur ordinateur (' + m.n + ')');
    const p = await peint(page);
    ok(p.k > 200, 'le canvas est dessine (' + p.k + ' points echantillonnes non transparents)');
    ok(err.length === 0, 'aucune erreur' + (err.length ? ' — ' + err.slice(0, 2).join(' | ') : ''));
    await ctx.close();
  }

  console.log('\n-- 2. les vraies positions, en dollars --');
  {
    const { ctx, page, err } = await ouvre();
    const m = await page.evaluate(() => ({
      lignes: [...document.querySelectorAll('#cvPListe .cv-ligne')].map((l) => ({ sym: l.dataset.sym, pnl: l.querySelector('.cv-pnl').textContent, det: l.querySelector('.cv-det').textContent, pct: l.querySelector('.cv-pct').textContent })),
      tot: document.getElementById('cvPTot').textContent, papier: document.getElementById('cvPosP').textContent, titre: document.getElementById('cvPosT').textContent }));
    const L = {}; m.lignes.forEach((l) => L[l.sym] = l);
    console.log('   ' + JSON.stringify(m.lignes));
    ok(m.lignes.length === 3, 'trois positions servies → trois lignes (' + m.lignes.length + ')');
    ok(L.PONS && L.PONS.pnl === '−$2.53' && L.PONS.pct === '−1.8%' && L.PONS.det === 'in $137.64 → now $135.11', 'PONS : mise $137.64, gainLatent −2.53 → −$2.53, −1.8 %, vaut $135.11');
    /* 12,40 encaisses + 2,24 sur les 30 % qui courent : +14,64 $ sur 35 $, soit +41,8 % */
    ok(L.NOVA && L.NOVA.pnl === '+$14.64' && L.NOVA.pct === '+41.8%' && /in \$35\.00 → now \$49\.64 · 70% sold/.test(L.NOVA.det), 'NOVA : ce qui a ete encaisse en route compte (+$14.64, +41.8 %, 70 % vendus) — « ' + (L.NOVA || {}).det + ' »');
    ok(L.MUET && L.MUET.pnl === '—' && L.MUET.pct === '—' && /no fresh price/.test(L.MUET.det), 'MUET : sans prix frais, un tiret et la raison — jamais +0.0 %');
    ok(m.tot === '+$12.11', 'le total est celui des positions cotees seulement (−2.53 + 14.64 = ' + m.tot + ')');
    ok(m.titre === 'Open positions' && m.papier === 'Paper', 'et le panneau dit qu elles sont de PAPIER');
    const orb = await page.evaluate(() => Cerveau.aires().find((a) => a.k === 'closer'));
    ok(orb && orb.x > 0, 'le Closer, autour duquel elles tournent, est place');
    ok(err.length === 0, 'aucune erreur' + (err.length ? ' — ' + err[0] : ''));
    await ctx.close();
  }
  {
    const { ctx, page, err } = await ouvre({ vue: () => vue((j) => { j.positions = []; }) });
    const m = await page.evaluate(() => ({ vide: (document.getElementById('cvVide') || {}).textContent || '', lignes: document.querySelectorAll('#cvPListe .cv-ligne').length, tot: document.getElementById('cvPTot').textContent }));
    ok(m.lignes === 0 && /No open position/.test(m.vide), 'sans position, le panneau le dit : « ' + m.vide + ' »');
    ok(m.tot === '$0.00', 'et son total est zero (' + m.tot + ')');
    ok(err.length === 0, 'aucune erreur' + (err.length ? ' — ' + err[0] : ''));
    await ctx.close();
  }

  console.log('\n-- 3. chaque aire : part refusee = bloques / vus du roster, avec ses vus --');
  {
    /* le Cobaye ramene sous AUDIT_ASSEZ (40) : il ne doit pas donner de part */
    const { ctx, page, err } = await ouvre({ vue: () => vue((j) => { const c = j.roster.find((a) => a.key === 'cobaye'); c.vus = 25; c.bloques = 20; }) });
    const A = await page.evaluate(() => Cerveau.aires());
    const R = {}; REELLE.roster.forEach((a) => R[a.key] = a);
    for (const k of ['scout', 'whale', 'oracle']) {
      const a = A.find((x) => x.k === k), r = R[k], p = (r.bloques / r.vus * 100).toFixed(1), v = r.vus.toLocaleString('en-US');
      ok(a && a.ligne === '−' + p + '% of ' + v + ' refused', k + ' : « ' + (a || {}).ligne + ' » = ' + r.bloques + ' / ' + r.vus);
    }
    for (const k of ['warden', 'whisper']) {
      const a = A.find((x) => x.k === k), r = R[k];
      ok(a && a.ligne === 'passes · ' + r.vus.toLocaleString('en-US') + ' seen', k + ' : ' + r.bloques + ' refus sur ' + r.vus + ' → « ' + (a || {}).ligne + ' »');
    }
    const cob = A.find((x) => x.k === 'cobaye');
    ok(cob && cob.ligne === 'too few to judge (25/40)', 'sous 40 vus, l aire ne donne pas de part : « ' + (cob || {}).ligne + ' »');
    ok(A.find((x) => x.k === 'scout').nom === 'Scout' && A.find((x) => x.k === 'whale').nom === 'Whale-Watch', 'les noms sont ceux du roster');
    ok((await page.evaluate(() => Cerveau.ordre()))[0] === 'scout', 'l influx part du Scout : l ordre est celui du serveur');
    ok(err.length === 0, 'aucune erreur' + (err.length ? ' — ' + err[0] : ''));
    await ctx.close();
  }

  console.log('\n-- 4. les chiffres cles, le realise du jour, la pensee --');
  {
    const { ctx, page, err } = await ouvre({ attente: 2600 });
    const m = await page.evaluate(() => ({ kv: cvKv.textContent, kr: cvKr.textContent, ka: cvKa.textContent, kt: cvKt.textContent,
      real: cvReal.textContent, realL: cvRealL.textContent, titre: cvTitre.textContent, pensee: cvPensee.textContent }));
    const rej = REELLE.roster.filter((a) => a.vus > 0).reduce((s, a) => s + a.bloques, 0);
    ok(m.kr === rej.toLocaleString('en-US'), 'Rejected = somme des bloques du roster (' + m.kr + ')');
    ok(m.ka === REELLE.ouvertures.toLocaleString('en-US'), 'Bought = ouvertures de la vue (' + m.ka + ')');
    ok(m.kt === '$' + Math.round(REELLE.tresor).toLocaleString('en-US'), 'Treasury = tresor de la vue (' + m.kt + ')');
    ok(m.kv === '—', 'une seule lecture : le debit du Scout ne s invente pas (« ' + m.kv + ' »)');
    ok(m.real === '+$7.00' && /2 closed/.test(m.realL), 'Realized today : 10 − 3 depuis minuit UTC, la fermeture d hier exclue (' + m.real + ', « ' + m.realL + ' »)');
    ok(m.titre === 'One brain. Thirteen agents.', 'le titre compte le roster (« ' + m.titre + ' »)');
    const syms = REELLE.candidats.map((c) => c.sym).concat((REELLE.signaux || []).map((s) => s.sym));
    ok(syms.some((s) => m.pensee.indexOf('$' + s) >= 0), 'la pensee rejoue un vrai jeton de la vue : « ' + m.pensee.slice(0, 90) + ' »');
    /* une deuxieme lecture, deux tours plus tard, 3 000 jetons de plus vus par le Scout */
    const kv = await page.evaluate(() => { const v = JSON.parse(JSON.stringify(VUE)); v.t += 300000; v.roster.find((a) => a.key === 'scout').vus += 3000; VUE = v; peintTout(); return { t: cvKv.textContent, title: cvKv.title }; });
    ok(kv.t === '600' && /3,000 tokens seen by the Scout over the last 5 min/.test(kv.title), 'deux lectures a cinq minutes : 3 000 vus → 600 / min, et la fenetre est dite (' + kv.t + ', « ' + kv.title + ' »)');
    ok(err.length === 0, 'aucune erreur' + (err.length ? ' — ' + err[0] : ''));
    await ctx.close();
  }

  console.log('\n-- 5. aucun defilement de cote, aucune erreur --');
  for (const [w, h] of [[320, 700], [390, 844], [1280, 900]]) {
    const { ctx, page, err } = await ouvre({ w, h });
    const m = await page.evaluate(() => ({ sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), cw: document.getElementById('cerveau').getBoundingClientRect().width,
      pos: document.getElementById('cvPos').getBoundingClientRect(), scene: document.getElementById('cvScene').getBoundingClientRect(), n: Cerveau.neurones() }));
    ok(m.sw <= w, w + ' px : la page ne deborde pas (' + m.sw + ')');
    if (w < 760) {
      ok(m.pos.top >= m.scene.bottom - 1 && m.pos.left >= 15 && m.pos.right <= w - 15, w + ' px : le panneau passe SOUS le cerveau, a 16 px des bords');
      ok(m.n === 700, w + ' px : moins de neurones sur telephone (' + m.n + ')');
    }
    ok(err.length === 0, w + ' px : aucune erreur' + (err.length ? ' — ' + err[0] : ''));
    await ctx.close();
  }

  console.log('\n-- 6. mouvement reduit, pause hors ecran --');
  {
    const v = await ouvre({ attente: 1500 });
    const a = await v.page.evaluate(async () => { const c = document.getElementById('cvCanvas'), x = c.toDataURL(); await new Promise((r) => setTimeout(r, 600)); return { tourne: Cerveau.tourne(), change: c.toDataURL() !== x }; });
    ok(a.tourne && a.change, 'sans preference, le cerveau tourne (il change en 0,6 s)');
    await v.page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await v.page.waitForTimeout(400);
    ok(!(await v.page.evaluate(() => Cerveau.tourne())), 'hors de l ecran, il s arrete');
    await v.page.evaluate(() => scrollTo(0, 0)); await v.page.waitForTimeout(400);
    ok(await v.page.evaluate(() => Cerveau.tourne()), 'et repart quand on y revient');
    await v.ctx.close();
    const { ctx, page, err } = await ouvre({ rm: true, attente: 1500 });
    const m = await page.evaluate(async () => { const c = document.getElementById('cvCanvas'), x = c.toDataURL(); await new Promise((r) => setTimeout(r, 900));
      return { tourne: Cerveau.tourne(), fixe: c.toDataURL() === x, kt: cvKt.textContent, pensee: cvPensee.textContent, lignes: document.querySelectorAll('#cvPListe .cv-ligne').length,
               anim: getComputedStyle(document.querySelector('.cv-sur i')).animationName }; });
    const p = await peint(page);
    ok(!m.tourne && m.fixe && p.k > 200, 'mouvement reduit : une image dessinee, qui ne bouge plus');
    ok(m.kt !== '—' && m.lignes === 3 && m.pensee.length > 5 && m.pensee !== '…', 'et les chiffres sont la : tresor, positions, la derniere pensee (« ' + m.pensee.slice(0, 60) + ' »)');
    ok(m.anim === 'none', 'le point « live » ne clignote pas');
    ok(err.length === 0, 'aucune erreur' + (err.length ? ' — ' + err[0] : ''));
    await ctx.close();
  }

  console.log('\n-- 7. densite plafonnee, francais --');
  {
    const { ctx, page, err } = await ouvre({ dpr: 3 });
    ok((await page.evaluate(() => Cerveau.dpr())) === 2, 'a une densite de 3, le canvas est dessine a 2');
    await page.click('#langue'); await page.waitForTimeout(400);
    const fr = await page.evaluate(() => ({ t: cvPosT.textContent, r: cvRealL.textContent, k: cvKrL.textContent, l: Cerveau.aires().find((a) => a.k === 'scout').ligne }));
    ok(fr.t === 'Positions ouvertes' && /^Réalisé aujourd'hui/.test(fr.r) && fr.k === 'Refusés' && / % de .* refusés$/.test(fr.l), 'le bouton de langue bascule aussi le cerveau (' + JSON.stringify(fr) + ')');
    ok(err.length === 0, 'aucune erreur' + (err.length ? ' — ' + err[0] : ''));
    await ctx.close();
  }

  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exitCode = rates ? 1 : 0;
})().catch((e) => { console.log('EXCEPTION : ' + (e && e.stack || e)); process.exitCode = 1; });
