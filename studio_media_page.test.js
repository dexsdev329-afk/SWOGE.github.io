'use strict';
/* ============================================================================
 * SWOGE STUDIO (studio.html) — LA PAGE MONTRE LE CATALOGUE, ENVOIE UN GESTE,
 * ET NE DECIDE DE RIEN
 *
 * La maquette blanche validee le 12/10/2026 (« tres propre fait ca »), devenue
 * la vraie page, branchee sur les routes du serveur. Derriere un faux reseau :
 * le CATALOGUE REEL (studio_media.catalogue, le meme calcul que la route) et,
 * pour les series, le VRAI module studio_production.js. Ce que la page DOIT
 * tenir :
 *
 *   1. Sans session : elle se montre, le bouton dit quoi faire (Sign in), et
 *      seul le catalogue est demande — rien n'est debite, rien n'est lu.
 *   2. Chaque prix vient du catalogue : un prix change au serveur change le
 *      bouton, un modele ajoute apparait ; le prix du bouton est celui que le
 *      serveur facture en liste, reference SWOGE comprise (et comptee une seule
 *      fois quand une image est jointe).
 *   3. Kling 3.0 : aucun prix, et il ne se choisit pas.
 *   4. Voice et Avatar : « Coming soon », rien ne part.
 *   5. Un clic = UNE requete (double clic, clic pendant le vol).
 *   6. Aucun debit sans clic.
 *   7. Le refus du serveur est montre tel quel, en texte.
 *   8. Une video est suivie sur le serveur jusqu'au resultat, et survit au
 *      rechargement ; une image se reprend par son rid.
 *   9. « Use as reference » prend le vrai fichier ; rien de l'image n'est garde
 *      dans le navigateur.
 *  10. Series & Ads : creer, filmer, le refus du serveur tel quel.
 *  11. 320, 360, 390, 1440 : pas de defilement horizontal ; les bulles du site
 *      restent au-dessus de la barre du bas.
 *  12. Aucune erreur console, aucun texte francais visible, aucune cle, et
 *      aucune adresse envoyee — ni celle de la session, ni une adresse prise
 *      ailleurs (URL, stockage local).
 *
 * STUDIO_HTML=<fichier> remplace la page servie : c'est ainsi qu'on lance les
 * mutants (prix ecrit en dur, double requete, Kling selectionnable).
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const SITE = __dirname;
const PAGE = process.env.STUDIO_HTML ? path.resolve(process.env.STUDIO_HTML) : path.join(SITE, 'studio.html');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
/* Le depot du serveur, a cote du site (comme production_page.test.js). */
function serveur(f) {
  const l = [process.env.SWOGE_SERVEUR, path.join(SITE, '..', 'swoge-pusher-server.github.io'), path.join(SITE, '..', 'srv'), '/home/user/swoge-pusher-server.github.io'].filter(Boolean);
  for (const d of l) { try { return require(path.join(d, f)); } catch (e) {} }
  return null;
}
const Med = serveur('studio_media.js'), Prod = serveur('studio_production.js');
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + (a === b ? '' : ' au lieu de ' + JSON.stringify(b)) + ']');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webmanifest': 'application/json' };

/* Le catalogue : celui que la route sert (studio_media.js:136-163), au cours du releve du 12/10.
   Sans le depot du serveur, le releve fige du meme jour. */
const COURS = 0.0000423;
const FIGE = { ouvert: true, videoOuverte: true, note: null, videoNote: null, marge: 1.5,
  image: { fournisseurs: [{ id: 'grok', nom: 'Grok Imagine', actif: true, modeles: [{ id: 'rapide', nom: 'Speed', parImageSwoge: 710, parImageUsd: 0.03 }, { id: 'qualite', nom: 'Quality (2.0)', parImageSwoge: 1419, parImageUsd: 0.06 }] },
    { id: 'openai', nom: 'ChatGPT Image', actif: true, modeles: [{ id: 'rapide', nom: 'Speed', parImageSwoge: 7333, parImageUsd: 0.3102, estime: true }, { id: 'qualite', nom: 'Quality', parImageSwoge: 7333, parImageUsd: 0.3102, estime: true }] }],
    formats: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'], nombres: [1, 2, 4] },
  video: { modeles: [{ id: 'rapide', nom: 'Speed', parSecondeSwoge: 1774, typiqueSwoge: 10639 }, { id: 'qualite', nom: 'Quality (1.5)', parSecondeSwoge: 2837, typiqueSwoge: 17022 }],
    formats: ['auto', '16:9', '9:16', '1:1'], durees: [6, 10], resolutions: ['480p', '720p'] } };
const catReel = () => JSON.parse(JSON.stringify(Med ? Med.catalogue(COURS, { grok: true, openai: true }) : FIGE));
/* Le prix de LISTE que le serveur facture (sans cout rendu par le fournisseur) : coutsImage × marge. */
function listeServeurUsd(cat, fid, mid, nb, avecImage) {
  if (!Med) return null;
  const m = Med.IMAGE.find((x) => x.fournisseur === fid && x.id === mid);
  return Med.coutsImage(fid, m, nb, avecImage, false).listeUsd * cat.marge;
}
const dollars = (x) => '$' + (Math.round(x * 100 + 1e-9) / 100).toFixed(2);
const nombre = (x) => Math.round(x).toLocaleString('en-US');

const ADDR = '0x' + '7a'.repeat(20);
const AUTRE = '0x' + 'de'.repeat(20);
const SESSION = 'v1.' + ADDR + '.' + (Math.floor(Date.now() / 1000) + 86400 * 20) + '.sig-test';
const HOTE = 'web-production-220a3.up.railway.app';
const PNG = fs.readFileSync(path.join(SITE, 'img/site/icone-192.png'));
/* Les erreurs de la page, visibles meme quand l essai casse en route (sinon la cause d un essai qui
   clignote se perd avec lui). */
const erreurs = [];
const FR = /[àâçéèêëîïôûùüÿœ]|\b(les|des|une|est|pour|avec|vous|votre|aucun|aucune|rien|cette|dans|sans|leur|sont|mais|donc|ici|voici|chargement|erreur|connexion|prix|image envoyee)\b/i;

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  if (!fs.existsSync(PAGE)) { console.log('studio.html absent'); process.exit(1); }
  console.log(Med ? '(catalogue : studio_media.catalogue du serveur, cours ' + COURS + ')' : '(depot du serveur absent : catalogue fige du 12/10)');
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    const f = u === '/studio.html' ? PAGE : path.join(SITE, u);
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port, base = 'http://127.0.0.1:' + port + '/';
  const nav = await chromium.launch();

  /* ---- le faux serveur ---- */
  const S = {};
  const dossier = Prod ? fs.mkdtempSync(path.join(os.tmpdir(), 'studio-page-')) : null;
  const PS = Prod ? Prod.cree({ dossier }) : null;
  const VOIX = [{ id: 'eve', nom: 'Eve', ton: 'energetic' }, { id: 'ara', nom: 'Ara', ton: 'warm' }, { id: 'rex', nom: 'Rex', ton: 'confident' }, { id: 'sal', nom: 'Sal', ton: 'balanced' }, { id: 'leo', nom: 'Leo', ton: 'authoritative' }];
  const pret = new Set();
  function remet() {
    Object.assign(S, { cat: catReel(), credit: 4.2, envois: [], lectures: [], imageDelai: 0, imageRep: null, polls: 0, pollsBloques: false, reprise: {}, corsImgen: true,
      pollHtml: 0, poll401: false, imageHtml: 0, repriseAuto: null });
  }
  remet();
  function routeProd(q, u, auth) {
    const corps = JSON.parse(q.postData() || '{}');
    if (auth !== SESSION) return [401, { ok: false, raison: 'sign in with your wallet first' }];
    if (!PS) return [200, { ok: true, productions: [], voix: VOIX, modes: ['serie', 'pub'], personnagesMax: 3, productionsMax: 30, scenesMax: 60, durees: [6, 10], swoge: 'https://swoleeswoge.dog/img/site/swoge_reference.jpg' }];
    const m = /^\/studio\/production\/([0-9a-f]{16})(\/scene|\/imagine)?$/.exec(u.pathname);
    if (u.pathname === '/studio/production' && q.method() === 'GET') {
      const ps = PS.liste(ADDR).map((p) => { for (const sc of p.scenes) if (sc.statut === 'pending' && pret.has(sc.video)) PS.noteScene(ADDR, p.id, { id: sc.id, statut: 'done', url: 'https://vidgen.x.ai/' + sc.video + '.mp4', factureSwoge: '28370' }); return PS.une(ADDR, p.id); });
      return [200, { ok: true, productions: ps, voix: VOIX, modes: Prod.MODES, personnagesMax: 3, productionsMax: 30, scenesMax: 60, durees: [6, 10], swoge: 'https://swoleeswoge.dog/img/site/swoge_reference.jpg' }];
    }
    if (q.method() === 'DELETE' && m) { const r = PS.supprime(ADDR, m[1]); return [r.ok ? 200 : r.code, r]; }
    if (u.pathname === '/studio/production' || (m && !m[2])) {
      const v = Prod.valide(corps.production, { image: PS.outilImage(ADDR, (x) => /^data:image\/(png|jpeg|webp);base64,/.test(x)), voixOk: (x) => VOIX.some((y) => y.id === x) });
      if (v.erreur) { PS.menage(ADDR); return [400, { ok: false, raison: v.erreur }]; }
      const r = PS.pose(ADDR, v, m ? m[1] : null);
      return [r.ok ? 200 : r.code, r.ok ? { ok: true, production: r.production } : r];
    }
    const prod = m && PS.une(ADDR, m[1]);
    if (!prod) return [404, { ok: false, raison: 'unknown production' }];
    if (m[2] === '/imagine') return [200, { ok: true, texte: 'SWOGE and King Swoge shake hands. Camera orbits them.', restant: 39 }];
    const sc = Prod.scene(prod, corps.texte, corps.duree, { camera: corps.camera });
    if (sc.erreur) return [400, { ok: false, raison: sc.erreur }];
    const video = 'v' + S.envois.length + 'x';
    PS.noteScene(ADDR, prod.id, { id: 's' + S.envois.length, texte: sc.texte, video, statut: 'pending', duree: corps.duree });
    return [200, { ok: true, genre: 'video', id: video, status: 'pending' }];
  }
  async function route(r) {
    const q = r.request(), u = new URL(q.url());
    const json = (code, o) => r.fulfill({ status: code, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.hostname === HOTE) {
      const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
      const e = { m: q.method(), chemin: u.pathname, auth: q.headers().authorization || null, brut: q.postData() || '', corps: (() => { try { return JSON.parse(q.postData() || '{}'); } catch (x) { return {}; } })() };
      /* Les fichiers sont publics par leur nom (server.js:6340-6358) : ni jeton, ni geste. */
      if (/^\/studio\/media\/fichier\//.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG });
      if (/^\/studio\/production\/image\//.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      S.lectures.push(e);
      if (u.pathname === '/studio/media/catalogue') return json(200, S.cat);
      S.envois.push(e);
      if (auth !== SESSION) return json(401, { ok: false, raison: 'sign in with your wallet first' });
      if (u.pathname === '/studio/chat/solde') return json(200, { ok: true, adresse: ADDR, solde: '182400.52' });
      if (u.pathname === '/credit') return json(200, { ok: true, balanceUsd: S.credit, history: [{ at: '2026-10-12T10:00:00.000Z', kind: 'top-up', usd: 5, what: null }], limits: { minUsd: 0.1, maxUsd: 50, maxSoldeUsd: 100 }, networks: { base: true, solana: true } });
      /* La page d'erreur HTML du proxy (un deploiement Railway) : illisible, elle ne dit rien de la generation. */
      const pageProxy = () => r.fulfill({ status: 502, contentType: 'text/html', body: '<html><body><h1>502 Bad Gateway</h1></body></html>' });
      if (u.pathname === '/studio/media/image') {
        if (S.imageHtml > 0) { S.imageHtml--; return pageProxy(); }
        if (S.imageDelai) await new Promise((s) => setTimeout(s, S.imageDelai));
        if (S.imageRep) return json(S.imageRep.status, S.imageRep.body);
        const c = e.corps, oa = c.fournisseur === 'openai', sw = !c.image && /\bswoge\b/i.test(c.prompt || '');
        const urls = oa ? ['/studio/media/fichier/' + 'b'.repeat(48) + '.png'] : Array.from({ length: c.n || 1 }, (x, i) => 'https://imgen.x.ai/i' + i + '.png');
        const base = { ok: true, genre: 'image', fournisseur: oa ? 'openai' : 'grok', modele: c.modele, urls, retouche: !!c.image, reference: c.image ? 'jointe' : sw ? 'swoge' : null, compris: sw ? 'SWOGE <b>lifting</b>' : null };
        if (c.payeur === 'credit') S.credit = 4.14;   /* le credit du faux serveur suit, comme le vrai */
        return json(200, c.payeur === 'credit' ? Object.assign(base, { payeur: 'credit', factureUsd: 0.06, creditUsd: 4.14 }) : Object.assign(base, { factureSwoge: '1419.5', solde: '180981.0', factureUsd: 0.06 }));
      }
      if (u.pathname === '/studio/media/video') return json(200, { ok: true, genre: 'video', id: 'v1', status: 'pending', duree: e.corps.duree, resolution: e.corps.resolution, modele: e.corps.modele });
      if (u.pathname === '/studio/media/video/v1') {
        if (S.pollHtml > 0) { S.pollHtml--; return pageProxy(); }
        if (S.poll401) return json(401, { ok: false, raison: 'sign in with your wallet first' });
        S.polls++;
        if (S.pollsBloques || S.polls < 2) return json(200, { ok: true, genre: 'video', id: 'v1', status: 'pending', progress: 40 });
        return json(200, { ok: true, genre: 'video', id: 'v1', status: 'done', progress: 100, url: 'https://vidgen.x.ai/v1.mp4', duree: 6, resolution: '480p', factureSwoge: '10639', solde: '171761.5' });
      }
      if (u.pathname.startsWith('/studio/reprise/')) {
        const v = S.reprise[decodeURIComponent(u.pathname.slice('/studio/reprise/'.length))] || S.repriseAuto;
        return v ? json(200, v) : json(404, { ok: false, status: 'unknown', raison: 'this answer is no longer on the server' });
      }
      if (/^\/studio\/production/.test(u.pathname)) { const [c, o] = routeProd(q, u, auth); return json(c, o); }
      return json(404, { ok: false, raison: 'unknown route' });
    }
    /* Le CORS d'imgen.x.ai n'est pas verifie (releve du 12/10) : refuse, la lecture en script echoue
       (Playwright ajoute de lui-meme l'en-tete CORS a un fulfill : on coupe donc la lecture « fetch »). */
    if (u.hostname === 'imgen.x.ai' && !S.corsImgen && q.resourceType() === 'fetch') return r.abort('accessdenied');
    if (u.hostname === 'imgen.x.ai') return r.fulfill({ status: 200, contentType: 'image/png', headers: S.corsImgen ? { 'access-control-allow-origin': '*' } : {}, body: PNG });
    if (u.hostname === 'vidgen.x.ai') return r.fulfill({ status: 200, contentType: 'video/mp4', body: '' });
    return r.abort();
  }
  async function ouvre(o = {}) {
    const ctx = await nav.newContext({ viewport: { width: o.largeur || 1440, height: o.hauteur || 900 }, isMobile: !!o.mobile, hasTouch: !!o.mobile });
    /* La socket de stakebubble ne sort pas : aucun vrai serveur ne doit lire ni effacer le jeton d'essai. */
    await ctx.routeWebSocket(/.*/, () => {});
    if (o.session) await ctx.addInitScript((j) => { try { if (!sessionStorage.getItem('pose')) { localStorage.setItem('swogeSession', j); sessionStorage.setItem('pose', '1'); } } catch (e) {} }, SESSION);
    if (o.init) await ctx.addInitScript(o.init[0], o.init[1]);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erreurs.push('pageerror : ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|WebSocket/.test(m.text())) erreurs.push('console : ' + m.text()); });
    p.on('dialog', (d) => d.accept());
    await p.route((u) => !u.href.startsWith(base), route);
    await p.goto(base + 'studio.html' + (o.suite || ''), { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !/Loading/.test(document.getElementById('genL').textContent), null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(o.attente || 250);
    return p;
  }
  const prixBouton = (p) => p.textContent('#genP');
  const libBouton = (p) => p.evaluate(() => document.getElementById('genL').textContent);
  const posts = (re) => S.envois.filter((e) => e.m === 'POST' && (!re || re.test(e.chemin)));
  const ferme = async (p) => { await p.context().close(); };

  console.log('-- 1. sans session : la page se montre, rien n est lu ni debite --');
  {
    remet();
    const p = await ouvre();
    eq(await libBouton(p), 'Sign in to generate', 'le bouton dit quoi faire');
    ok(!(await p.isDisabled('#gen')), 'et il agit : il ouvre la connexion');
    await p.fill('#prompt', 'a buff doge');
    await p.click('#gen'); await p.waitForTimeout(300);
    eq(S.envois.length, 0, 'aucune requete au serveur hors catalogue, meme apres le clic');
    ok(S.lectures.length >= 1 && S.lectures.every((e) => e.chemin === '/studio/media/catalogue' && !e.auth), 'seul le catalogue public est demande, sans jeton');
    ok(/Sign in/.test(await p.textContent('#resStage')), 'la carte resultat dit de se connecter');
    ok(/\$0\.03/.test(await p.textContent('#priceNote')), 'et le prix se lit quand meme, avant tout clic');
    await ferme(p);
  }

  console.log('\n-- 2. les prix viennent du catalogue, comme le serveur les facture --');
  {
    remet();
    const p = await ouvre({ session: true });
    const cat = S.cat;
    const usd = (fid, mid, nb, ref) => { const l = listeServeurUsd(cat, fid, mid, nb, ref); return l == null ? null : dollars(l); };
    const g1 = cat.image.fournisseurs[0].modeles[0];
    eq(await prixBouton(p), dollars(g1.parImageUsd), 'Grok Speed ×1 : le prix du catalogue');
    if (Med) eq(await prixBouton(p), usd('grok', 'rapide', 1, false), 'et c est le prix de liste du serveur (coutsImage × marge)');
    await p.click('#segN [data-n="4"]');
    eq(await prixBouton(p), dollars(g1.parImageUsd * 4), '×4');
    if (Med) eq(await prixBouton(p), usd('grok', 'rapide', 4, false), '×4 : celui du serveur');
    await p.click('#segN [data-n="1"]');
    await p.fill('#prompt', 'SWOGE lifting a golden barbell on a rooftop');
    eq(await prixBouton(p), dollars(g1.parImageUsd * 2), 'le prompt nomme SWOGE : sa reference compte comme une image de plus');
    if (Med) eq(await prixBouton(p), usd('grok', 'rapide', 1, true), 'exactement ce que le serveur facture avec la reference jointe d office');
    ok(await p.isVisible('#refNote') && /SWOGE reference added/.test(await p.textContent('#refNote')), 'la phrase le dit');
    ok(await p.$eval('#refBtn', (b) => b.classList.contains('auto')), 'la case le montre');
    await p.fill('#prompt', 'swogeland at night');
    eq(await prixBouton(p), dollars(g1.parImageUsd), '« swogeland » ne nomme pas SWOGE (meme \\b que le serveur)');
    await p.fill('#prompt', 'SWOGE at the gym');
    await p.setInputFiles('#fichier', { name: 'p.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForSelector('#refBtn.has');
    eq(await prixBouton(p), dollars(g1.parImageUsd * 2), 'une image jointe ET SWOGE nomme : UNE seule reference comptee');
    if (Med) eq(await prixBouton(p), usd('grok', 'rapide', 1, true), 'comme le serveur, qui ne joint pas la sienne en plus');
    await p.click('#refBtn');
    await p.click('[data-pay="swoge"]');
    eq(await prixBouton(p), nombre(g1.parImageSwoge * 2) + ' $SWOGE', 'paye en $SWOGE : le prix $SWOGE du catalogue');
    await p.click('[data-pay="credit"]');
    await p.click('.mcard[data-id="openai:rapide"]');
    const o1 = cat.image.fournisseurs[1].modeles[0];
    eq(await prixBouton(p), '~' + dollars(o1.parImageUsd) + ' + ref', 'ChatGPT Image + SWOGE : l estimation du catalogue, et la reference dite sans chiffre invente');
    ok(/estimate/.test(await p.textContent('#priceNote')), 'dite estimation');
    await p.fill('#prompt', 'a golden barbell');
    eq(await prixBouton(p), '~' + dollars(o1.parImageUsd), 'ChatGPT Image seul');
    await p.click('.tab[data-tab="video"]');
    const v = cat.video;
    eq(await prixBouton(p), nombre(v.modeles[0].typiqueSwoge) + ' $SWOGE', 'video Speed 6 s : typiqueSwoge du catalogue');
    ok(await p.isDisabled('[data-pay="credit"]'), 'video : le credit est grise (server.js:6581)');
    await p.click('#segL [data-l="10"]');
    eq(await prixBouton(p), nombre(v.modeles[0].parSecondeSwoge * 10) + ' $SWOGE', '10 s : parSecondeSwoge × 10');
    await p.click('#segR [data-r="720p"]');
    eq(await prixBouton(p), 'from ' + nombre(v.modeles[0].parSecondeSwoge * 10) + ' $SWOGE', '720p : « from », l ecart n est pas publie');
    const visible = await p.innerText('body');
    ok(!/\$0\.84|\$0\.63|\$3\.00|\$0\.32|\$0\.042|\$0\.02 \/|Planned/.test(visible), 'aucun prix « planned » de la maquette');
    await ferme(p);

    /* Un prix change au serveur : le bouton suit, page inchangee. Un modele ajoute apparait. */
    remet();
    S.cat.image.fournisseurs[0].modeles[0].parImageUsd = 0.05; S.cat.image.fournisseurs[0].modeles[0].parImageSwoge = 1182;
    S.cat.image.fournisseurs[0].modeles.push({ id: 'turbo', nom: 'Turbo', parImageSwoge: 473, parImageUsd: 0.02 });
    S.cat.video.modeles[0].typiqueSwoge = 9999;
    const p2 = await ouvre({ session: true });
    eq(await prixBouton(p2), '$0.05', 'le serveur change le prix : le bouton suit');
    ok(/\$0\.05/.test(await p2.textContent('.mcard[data-id="grok:rapide"]')), 'et la carte aussi');
    ok(await p2.isVisible('.mcard[data-id="grok:turbo"]'), 'un modele ajoute au catalogue apparait');
    await p2.click('.mcard[data-id="grok:turbo"]');
    eq(await prixBouton(p2), '$0.02', 'et se choisit, a son prix');
    await p2.click('.tab[data-tab="video"]');
    eq(await prixBouton(p2), '9,999 $SWOGE', 'le prix video suit le catalogue');
    await ferme(p2);

    /* Ce que le serveur coupe se lit sur la page, avec SA phrase. */
    remet();
    S.cat.image.fournisseurs[1].actif = false;
    const p3 = await ouvre({ session: true });
    ok(await p3.$eval('.mcard[data-id="openai:rapide"]', (c) => c.classList.contains('paused') && c.getAttribute('aria-disabled') === 'true'), 'un fournisseur coupe : sa carte dit Paused et ne se choisit pas');
    await p3.click('.mcard[data-id="openai:rapide"]');
    eq(await prixBouton(p3), dollars(S.cat.image.fournisseurs[0].modeles[0].parImageUsd), 'le choix reste sur le modele ouvert');
    await ferme(p3);
    remet();
    S.cat.ouvert = false; S.cat.note = 'The $SWOGE price is unavailable right now — generation is paused so nobody is overcharged.';
    const p4 = await ouvre({ session: true });
    ok(await p4.isDisabled('#gen') && (await libBouton(p4)) === 'Paused' && (await p4.textContent('#priceNote')) === S.cat.note, 'le catalogue ferme : bouton Paused, la phrase du serveur telle quelle');
    await ferme(p4);
  }

  console.log('\n-- 3. Kling 3.0 : aucun prix, et il ne se choisit pas --');
  {
    remet();
    const p = await ouvre({ session: true, suite: '#video' });
    const k = await p.$eval('.mcard[data-id="kling3"]', (c) => ({ txt: c.innerText, cls: c.className, dis: c.getAttribute('aria-disabled'), tab: c.getAttribute('tabindex') }));
    ok(!/\$|\d/.test(k.txt.replace(/Kling 3\.0/, '')), 'la carte Kling 3.0 ne porte aucun chiffre [' + k.txt.replace(/\s+/g, ' ') + ']');
    ok(/Coming soon/i.test(k.txt) && /Price at launch/i.test(k.txt), '« Coming soon », « Price at launch »');
    ok(/\bsoon\b/.test(k.cls) && !/\blive\b/.test(k.cls) && k.dis === 'true' && k.tab === null, 'non selectionnable : ni live, ni focus, aria-disabled');
    const avant = await prixBouton(p);
    await p.click('.mcard[data-id="kling3"]'); await p.waitForTimeout(150);
    ok(!(await p.$('.mcard[data-id="kling3"].on')) && await p.$('.mcard.on[data-id="video:rapide"]'), 'un clic ne le choisit pas');
    eq(await prixBouton(p), avant, 'le bouton ne change pas');
    ok(!/kling/i.test(await p.evaluate(() => localStorage.getItem('swogeStudioChoix') || '')), 'et le choix retenu ne le nomme pas');
    await p.fill('#prompt', 'a motorbike'); await p.click('#gen'); await p.waitForSelector('#result.done', { timeout: 15000 }).catch(() => {});
    const e = posts(/\/studio\/media\/video$/).pop();
    ok(e && e.corps.modele === 'rapide', 'ce qui part est le modele du catalogue');
    await ferme(p);
  }

  console.log('\n-- 4. Voice et Avatar : Coming soon, rien ne part --');
  {
    remet();
    const p = await ouvre({ session: true });
    for (const t of ['voice', 'avatar']) {
      await p.click('.tab[data-tab="' + t + '"]');
      ok(await p.isDisabled('#gen') && (await libBouton(p)) === 'Coming soon', t + ' : le bouton dit Coming soon, desactive');
      ok(await p.isDisabled('#prompt'), t + ' : rien a ecrire');
      await p.click('#gen', { force: true }).catch(() => {});
      ok(/Coming soon/.test(await p.textContent('#resStage')), t + ' : la carte resultat le dit');
      ok(await p.$$eval('.mcard.live', (l) => l.length) === 0, t + ' : aucune carte a choisir');
    }
    await p.waitForTimeout(200);
    eq(posts().length, 0, 'aucune requete d argent depuis Voice ou Avatar');
    await p.click('.tab[data-tab="voice"]');
    await p.click('.mcard.serie [data-vers-serie]');
    ok(await p.isVisible('#prod') && (await p.getAttribute('.tab[data-tab="video"]', 'aria-selected')) === 'true', 'les voix des personnages menent vers Series & Ads, ou elles vivent');
    await ferme(p);
  }

  console.log('\n-- 5. un clic = une seule requete --');
  {
    remet(); S.imageDelai = 700;
    const p = await ouvre({ session: true });
    await p.fill('#prompt', 'SWOGE lifting a golden barbell');
    await p.dblclick('#gen');
    await p.click('#gen', { force: true, timeout: 1000 }).catch(() => {});
    await p.evaluate(() => { const g = document.getElementById('gen'); g.click(); g.click(); });
    await p.waitForSelector('#result.done', { timeout: 8000 });
    await p.waitForTimeout(300);
    eq(posts(/\/studio\/media\/image$/).length, 1, 'double clic, clic force, deux clics en script : UNE requete');
    const e = posts(/\/studio\/media\/image$/)[0];
    ok(/^[A-Za-z0-9_-]{6,40}$/.test(e.corps.rid), 'avec un rid que le serveur accepte (reprises.js:24) [' + e.corps.rid + ']');
    ok(e.corps.fournisseur === 'grok' && e.corps.modele === 'rapide' && e.corps.n === 1 && e.corps.format === 'auto' && e.corps.payeur === 'credit', 'le modele, le nombre, le format et le payeur choisis');
    ok(!('contexte' in e.corps), 'pas de contexte : le prix affiche reste celui facture');
    eq(e.auth, 'Bearer ' + SESSION, 'le jeton de session en Authorization');
    const img = await p.getAttribute('#resStage > img', 'src');
    eq(img, 'https://imgen.x.ai/i0.png', 'l image arrive a cote du composeur');
    ok(/\$0\.06/.test(await p.textContent('#resStage')) && /official SWOGE reference/.test(await p.textContent('#resStage')), 'avec ce qu elle a coute et la reference utilisee');
    ok(await p.$eval('.rbar a[download]', (a) => a.href) === 'https://imgen.x.ai/i0.png', 'Download ouvre le vrai fichier');
    ok(/\$4\.14/.test(await p.textContent('#balCr')), 'le credit suit la reponse');
    ok(/SWOGE lifting a golden barbell/.test(await p.textContent('#hist')) && /\$0\.06/.test(await p.textContent('#hist')), 'l historique garde la ligne, avec son prix');
    ok(await p.$$eval('#gal .tile img', (l) => l.some((i) => i.src === 'https://imgen.x.ai/i0.png')), 'et My work la montre');
    await ferme(p);
  }

  console.log('\n-- 6. aucun debit sans clic --');
  {
    remet();
    const p = await ouvre({ session: true });
    await p.fill('#prompt', 'SWOGE in a tuxedo');
    await p.click('#segN [data-n="2"]'); await p.click('.mcard[data-id="grok:qualite"]'); await p.click('[data-pay="swoge"]');
    await p.click('#magic'); await p.click('.tab[data-tab="video"]'); await p.click('#segL [data-l="10"]');
    await p.click('.tab[data-tab="image"]'); await p.click('#topUp'); await p.click('#rcClose');
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
    eq(posts().length, 0, 'charger, taper, choisir, ouvrir la recharge, recharger : aucun POST');
    ok(S.envois.every((e) => e.m === 'GET' && /^\/(studio\/chat\/solde|credit|studio\/production)$/.test(e.chemin)), 'seulement les lectures du solde, du credit et des productions');
    await ferme(p);
  }

  console.log('\n-- 7. le refus du serveur, tel quel --');
  {
    remet();
    const raison = 'the image provider failed — you were not charged <img src=x onerror=alert(1)>';
    S.imageRep = { status: 502, body: { ok: false, code: 502, raison, detail: 'x' } };
    const p = await ouvre({ session: true });
    await p.fill('#prompt', 'a doge'); await p.click('#gen');
    await p.waitForSelector('#result.err');
    ok((await p.textContent('#resStage')).includes(raison), 'la raison du serveur, mot pour mot');
    eq(await p.$$eval('#resStage img', (l) => l.length), 0, 'en texte : la balise n est pas interpretee');
    ok(/not charged/.test(await p.textContent('#resStage')) && /Failed · not charged/.test(await p.textContent('#hist')), 'l echec est dit non facture, et l historique le garde a 0');
    S.imageRep = { status: 402, body: { ok: false, code: 402, raison: 'your dollar credit is too low for this ($0.18 is reserved while it runs, you pay only what is used)', requisUsd: 0.18, creditUsd: 0.05, payeur: 'credit' } };
    await p.click('#gen'); await p.waitForFunction(() => /too low/.test(document.getElementById('resStage').textContent));
    ok((await p.textContent('#resStage')).includes('your dollar credit is too low for this ($0.18 is reserved'), '402 : la phrase du serveur');
    ok(/Sign \$0\.13 and generate/.test(await p.textContent('#resStage')), 'et la signature de ce qui manque (0,18 − 0,05)');
    S.imageRep = { status: 429, body: { ok: false, code: 429, raison: 'one generation at a time' } };
    await p.click('#gen'); await p.waitForFunction(() => /one generation at a time/.test(document.getElementById('resStage').textContent));
    ok(true, '429 : « one generation at a time », tel quel');
    eq(posts(/\/credit\/topup/).length, 0, 'aucune recharge sans le clic du joueur');
    /* Une image que le serveur n'a pas pu ranger revient en data-URL (studio_media.js:299) : payee, donc montree ; jamais gardee. */
    S.imageRep = { status: 200, body: { ok: true, genre: 'image', urls: ['data:image/png;base64,' + PNG.toString('base64')], payeur: 'credit', factureUsd: 0.03, creditUsd: 4.11 } };
    await p.click('#gen'); await p.waitForSelector('#result.done #resStage > img');
    ok(/^data:image\/png;base64,/.test(await p.getAttribute('#resStage > img', 'src')), 'une image rendue en data-URL s affiche (elle est payee)');
    ok(!/data:image/.test(await p.evaluate(() => Object.keys(localStorage).map((k) => localStorage.getItem(k)).join(''))), 'et rien d elle n est garde dans le navigateur');
    await ferme(p);
  }

  console.log('\n-- 8. la video : suivie sur le serveur jusqu au resultat, et apres un rechargement --');
  {
    remet(); S.pollHtml = 1;
    const p = await ouvre({ session: true, suite: '#video' });
    await p.fill('#prompt', 'a chrome motorbike in a neon city');
    await p.click('#segL [data-l="10"]');
    await p.click('#gen');
    await p.waitForFunction(() => /Rendering · 40%/.test(document.getElementById('resStage').textContent), null, { timeout: 8000 });
    ok(true, 'la progression reelle du serveur : « Rendering · 40% », apres une page d erreur du proxy qui n a rien interrompu');
    ok(await p.isDisabled('#gen'), 'pendant le rendu, le bouton est verrouille');
    await p.waitForSelector('#result.done video', { timeout: 15000 });
    const e = posts(/\/studio\/media\/video$/)[0];
    ok(e && e.corps.duree === 10 && e.corps.resolution === '480p' && e.corps.modele === 'rapide' && !('payeur' in e.corps), 'la demande porte la duree, la resolution et le modele ; pas de payeur (toujours $SWOGE)');
    ok(S.polls >= 2 && /^https:\/\/vidgen\.x\.ai\/v1\.mp4/.test(await p.getAttribute('#resStage video', 'src')), 'sondee jusqu a la video, puis jouee');
    ok(/10,639 \$SWOGE/.test(await p.textContent('#resFoot')), 'avec ce qu elle a coute');
    ok(/171\.7k/.test(await p.textContent('#balSw')), 'le solde $SWOGE suit');
    await ferme(p);

    remet(); S.pollsBloques = true;
    const q = await ouvre({ session: true, suite: '#video' });
    await q.fill('#prompt', 'the doge flexes'); await q.click('#gen');
    await q.waitForFunction(() => /Rendering/.test(document.getElementById('resStage').textContent));
    await q.waitForFunction(() => { try { return !!JSON.parse(localStorage.getItem('swogeStudioEnCours') || 'null').id; } catch (e) { return false; } }, null, { timeout: 5000 }).catch(() => {});
    const garde = await q.evaluate(() => JSON.parse(localStorage.getItem('swogeStudioEnCours') || 'null'));
    ok(garde && garde.id === 'v1' && garde.genre === 'video', 'la video lancee est notee avec son identifiant');
    await q.reload({ waitUntil: 'domcontentloaded' });
    await q.waitForFunction(() => /Rendering/.test(document.getElementById('resStage').textContent), null, { timeout: 8000 });
    ok(true, 'rechargee : le rendu reprend');
    S.pollsBloques = false;
    await q.waitForSelector('#result.done video', { timeout: 15000 });
    ok(!(await q.evaluate(() => localStorage.getItem('swogeStudioEnCours'))), 'puis la video arrive, plus rien en attente');
    eq(posts(/\/studio\/media\/video$/).length, 1, 'sans relancer de video (une seule demande)');
    await ferme(q);

    /* La session expire pendant le rendu : la page le dit et garde la video pour la reconnexion. */
    remet(); S.poll401 = true;
    const x = await ouvre({ session: true, suite: '#video' });
    await x.fill('#prompt', 'a doge in the rain'); await x.click('#gen');
    await x.waitForFunction(() => /Sign in again/.test(document.getElementById('resStage').textContent), null, { timeout: 8000 });
    ok(!!(await x.evaluate(() => localStorage.getItem('swogeStudioEnCours'))), 'session expiree pendant le rendu : « Sign in again », et la video reste notee pour la reprise');
    await ferme(x);

    /* Une reponse illisible a la demande d'image : on demande au serveur ce qu'il a fait sous ce rid
       plutot que d'annoncer un echec (elle a pu etre faite, et facturee). */
    remet(); S.imageHtml = 1;
    S.repriseAuto = { ok: true, status: 'done', genre: 'image', urls: ['https://imgen.x.ai/z.png'], payeur: 'credit', factureUsd: 0.03, creditUsd: 4.17 };
    const y = await ouvre({ session: true });
    await y.fill('#prompt', 'a doge on a boat'); await y.click('#gen');
    await y.waitForSelector('#result.done #resStage > img', { timeout: 8000 });
    ok(S.envois.some((e) => /^\/studio\/reprise\//.test(e.chemin)) && (await y.getAttribute('#resStage > img', 'src')) === 'https://imgen.x.ai/z.png', 'page d erreur du proxy a la demande : la page reprend par le rid et montre l image faite, au lieu d un faux « echec »');
    eq(posts(/\/studio\/media\/image$/).length, 1, 'sans la redemander');
    await ferme(y);

    /* Une image partie avant un rechargement : reprise par son rid (/studio/reprise). */
    remet();
    S.reprise.abcdef123 = { ok: true, status: 'done', genre: 'image', urls: ['https://imgen.x.ai/r.png'], payeur: 'credit', factureUsd: 0.03, creditUsd: 4.17 };
    const r = await ouvre({ session: true, init: [(o) => { try { if (!sessionStorage.getItem('enc')) { localStorage.setItem('swogeStudioEnCours', JSON.stringify(o)); sessionStorage.setItem('enc', '1'); } } catch (e) {} }, { rid: 'abcdef123', genre: 'image', prompt: 'a reprised doge', nom: 'Grok Imagine · Speed · ×1', n: 1, payeur: 'credit', t: Date.now() }] });
    await r.waitForSelector('#result.done img', { timeout: 8000 });
    eq(await r.getAttribute('#resStage > img', 'src'), 'https://imgen.x.ai/r.png', 'une image partie avant le rechargement est reprise par son rid');
    eq(posts(/\/studio\/media\/image$/).length, 0, 'sans la redemander');
    await ferme(r);
  }

  console.log('\n-- 9. « Use as reference » prend le vrai fichier ; rien n est garde --');
  {
    remet();
    const p = await ouvre({ session: true });
    await p.click('.mcard[data-id="openai:qualite"]');
    await p.fill('#prompt', 'a golden barbell'); await p.click('#gen');
    await p.waitForSelector('#result.done img');
    eq(await p.getAttribute('#resStage > img', 'src'), 'https://' + HOTE + '/studio/media/fichier/' + 'b'.repeat(48) + '.png', 'un fichier range chez nous s affiche depuis le serveur');
    await p.click('[data-comme-ref]');
    await p.waitForSelector('#refBtn.has', { timeout: 5000 });
    ok(/^data:image\/jpeg;base64,/.test(await p.getAttribute('#refBtn img', 'src')), 'il devient la reference, lu octet par octet');
    eq(await prixBouton(p), '~' + dollars(S.cat.image.fournisseurs[1].modeles[1].parImageUsd) + ' + ref', 'et le prix le dit');
    await p.click('#gen'); await p.waitForFunction(() => document.querySelectorAll('#result.done').length === 1 && !document.getElementById('gen').disabled);
    const e = posts(/\/studio\/media\/image$/).pop();
    ok(/^data:image\/jpeg;base64,/.test(e.corps.image || ''), 'la demande suivante l emporte, en data-URL (studio_media.js:123)');
    const stock = await p.evaluate(() => Object.keys(localStorage).map((k) => localStorage.getItem(k)).join('\n'));
    ok(!/data:image/.test(stock), 'aucune image n est gardee dans le navigateur');
    S.corsImgen = false;
    await p.click('.mcard[data-id="grok:rapide"]'); await p.click('#refBtn');
    await p.fill('#prompt', 'a doge'); await p.click('#gen');
    await p.waitForFunction(() => { const i = document.querySelector('#result.done #resStage > img'); return i && /imgen\.x\.ai/.test(i.src); });
    await p.click('[data-comme-ref]'); await p.waitForTimeout(800);
    ok(!(await p.$('#refBtn.has')) && /can't be reused directly/.test(await p.textContent('#toast')), 'chez xAI sans CORS : la page le dit, et ne pretend rien');
    await ferme(p);
  }

  console.log('\n-- 10. Series & Ads, sur /studio/production --');
  if (!PS) console.log('  (studio_production.js absent : partie sautee)');
  else {
    remet();
    const p = await ouvre({ session: true, suite: '#video' });
    await p.waitForFunction(() => !document.getElementById('pSel').disabled && document.querySelector('#pPersos .char'), null, { timeout: 8000 });
    ok(/New series/.test(await p.$eval('#pSel', (s) => s.options[s.selectedIndex].text)), 'sans production : une nouvelle serie, SWOGE d office');
    ok(await p.isDisabled('#film') && /Create it first/.test(await p.textContent('#film')), 'rien a filmer avant de creer : le bouton le dit');
    await p.fill('#pTitre', 'Gym Wars');
    await p.click('#pSave');
    await p.waitForFunction(() => /Gym Wars · 0 scenes/.test(document.getElementById('boardT').textContent), null, { timeout: 8000 });
    const cree = posts(/^\/studio\/production$/).pop();
    ok(cree && cree.corps.production.personnages[0].image === 'swoge' && cree.corps.production.personnages[0].voix === 'rex' && cree.corps.production.titre === 'Gym Wars', 'creer : SWOGE avec une voix, le titre');
    const q = S.cat.video.modeles.find((m) => m.id === 'qualite');
    eq(await p.textContent('#filmP'), nombre(q.parSecondeSwoge * 10) + ' $SWOGE', 'une scene de 10 s : le modele Quality (1.5) du catalogue');
    await p.click('#segS [data-s="6"]');
    eq(await p.textContent('#filmP'), nombre(q.typiqueSwoge) + ' $SWOGE', '6 s : typiqueSwoge');
    await p.click('#segS [data-s="10"]');
    await p.fill('#sceneTxt', 'SWOGE walks into the gym and says "Let\'s go!"');
    await p.click('#cams [data-cam="orbit"]');
    await p.click('#film');
    await p.waitForSelector('#scenes .scene.wait', { timeout: 8000 });
    /* Le suivi de la scene en cours repasse toutes les 4 s : il ne refait pas le formulaire ou l on tape. */
    await p.fill('#pPersos .char input', 'SWOGE the Great');
    await p.waitForTimeout(4600);
    eq(await p.inputValue('#pPersos .char input'), 'SWOGE the Great', 'pendant le suivi d une scene, ce qu on tape dans le formulaire reste');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.matches('#pPersos .char input')), 'et le curseur aussi');
    const sc = posts(/\/scene$/).pop();
    ok(sc && sc.corps.duree === 10 && sc.corps.camera === 'orbit' && /Let's go/.test(sc.corps.texte), 'filmer : le texte, la duree, la camera');
    eq(posts(/\/scene$/).length, 1, 'une scene = une requete');
    pret.add(PS.liste(ADDR)[0].scenes[0].video);
    await p.waitForSelector('#scenes a.scene video', { timeout: 9000 });
    ok(/^https:\/\/vidgen\.x\.ai\//.test(await p.getAttribute('#scenes a.scene video', 'src')), 'la scene finie arrive sur le tableau (https seulement)');
    ok(await p.isVisible('#contBox'), 'et la suite de la scene finie est proposee');
    await p.click('#imagine'); await p.waitForFunction(() => /shake hands/.test(document.getElementById('sceneTxt').value));
    ok(/39 left today/.test(await p.textContent('#imagine')), 'Imagine : gratuit, et il dit combien il en reste');
    await p.click('#segP [data-p="pub"]', { force: true }).catch(() => {});
    ok(await p.isDisabled('#segP [data-p="pub"]'), 'une production enregistree garde son type');
    await p.selectOption('#pSel', 'new:pub');
    await p.fill('#aNom', 'Swole Shaker'); await p.click('#pSave');
    await p.waitForFunction(() => /photo of the product/.test(document.getElementById('pErr').textContent), null, { timeout: 8000 });
    eq(await p.textContent('#pErr'), 'an ad needs a photo of the product', 'le refus du serveur, tel quel');
    const pub = posts(/^\/studio\/production$/).pop();
    ok(pub.corps.production.produit.presentateur === 'swoge', 'la pub envoie SWOGE comme presentateur (le serveur n en a pas par defaut)');
    ok(S.envois.every((x) => x.auth === 'Bearer ' + SESSION), 'chaque geste porte le jeton de session');
    await ferme(p);
  }

  console.log('\n-- 11. 320, 360, 390, 1440 : rien ne deborde --');
  {
    remet();
    for (const session of [false, true]) for (const w of [320, 360, 390, 1440]) for (const t of ['image', 'video']) {
      const p = await ouvre({ session, largeur: w, hauteur: w > 900 ? 900 : 760, mobile: w < 900, suite: '#' + t, attente: 500 });
      const m = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, w: window.innerWidth }));
      ok(m.doc <= m.w, (session ? 'connecte' : 'sans session') + ', ' + t + ', ' + w + ' px : document ' + m.doc);
      if (w === 390 && session && t === 'image') {
        /* Les bulles du site (stakebubble) au-dessus de la barre du bas, pas dessus. */
        const b = await p.evaluate(() => { const c = document.getElementById('composer').getBoundingClientRect(); const l = [...document.querySelectorAll('.swdb,.swwb')].filter((e) => e.getBoundingClientRect().height > 0); return { n: l.length, ok: l.every((e) => e.getBoundingClientRect().bottom <= c.top + 1) }; });
        ok(b.ok, 'a 390 : les ' + b.n + ' bulle(s) du site se posent au-dessus de la barre du bas');
      }
      if (w === 320 && session && t === 'image') {
        /* L etat connecte de stakebubble : la photo de profil et sa pastille posees dans la barre. */
        const m2 = await p.evaluate(() => { const nv = document.querySelector('nav.sb-ancre'); const b = document.createElement('button'); b.className = 'swpb'; b.style.cssText = 'width:30px;height:30px'; nv.insertBefore(b, nv.firstChild);
          const s = document.createElement('span'); s.className = 'swbal'; s.textContent = '● 182.4k $SWOGE'; nv.appendChild(s);
          return { doc: document.documentElement.scrollWidth, w: window.innerWidth, h: document.querySelector('.top').getBoundingClientRect().height }; });
        ok(m2.doc <= m2.w && m2.h <= 72, 'a 320, photo de profil posee : la barre tient sur une ligne (' + Math.round(m2.h) + ' px)');
      }
      await ferme(p);
    }
  }

  console.log('\n-- 12. console, langue, cles et adresses --');
  {
    remet();
    const p = await ouvre({ session: true, suite: '?addr=' + AUTRE + '&adresse=' + AUTRE, init: [(a) => { try { localStorage.setItem('swogeAdresse', a); localStorage.setItem('walletAddress', a); } catch (e) {} }, AUTRE] });
    for (const t of ['image', 'video', 'voice', 'avatar']) {
      await p.click('.tab[data-tab="' + t + '"]'); await p.waitForTimeout(150);
      const txt = await p.innerText('body');
      const m = txt.match(FR);
      ok(!m, 'onglet ' + t + ' : aucun texte francais visible' + (m ? ' [« ' + m[0] + ' »]' : ''));
    }
    await p.click('.tab[data-tab="image"]'); await p.fill('#prompt', 'SWOGE at the beach'); await p.click('#gen'); await p.waitForSelector('#result.done');
    await p.click('.tab[data-tab="video"]'); await p.fill('#prompt', 'waves'); await p.click('#gen'); await p.waitForSelector('#result.done video', { timeout: 15000 });
    const fuite = S.envois.filter((e) => new RegExp(ADDR + '|' + AUTRE, 'i').test(e.brut + e.chemin) || /"(addr|adresse|address)"/.test(e.brut));
    ok(S.envois.length > 3 && fuite.length === 0, 'aucune adresse dans ' + S.envois.length + ' requetes — ni celle de la session, ni celle de l URL ou du stockage local');
    ok(S.envois.every((e) => e.auth === 'Bearer ' + SESSION), 'chaque requete au serveur porte le jeton, et rien d autre ne dit qui paie');
    await ferme(p);
    const html = fs.readFileSync(PAGE, 'utf8');
    ok(!/sk-ant-|sk-[a-z0-9]{20}|xai-[a-z0-9]{10}|AIza[0-9A-Za-z_-]{20}|PRIVATE KEY|MIROIR_CLE|_API_KEY\s*=/i.test(html), 'aucune cle dans la page');
    ok(!/0x[0-9a-fA-F]{40}/.test(html), 'aucune adresse ecrite dans la page');
    /* Les prix du catalogue ne sont ecrits nulle part dans le code (commentaires retires). */
    const code = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1');
    const durs = [...new Set([].concat(...catReel().image.fournisseurs.map((f) => f.modeles.map((m) => [m.parImageUsd, m.parImageSwoge])), ...catReel().video.modeles.map((m) => [m.parSecondeSwoge, m.typiqueSwoge])).flat().concat([0.03, 0.06, 0.3102, 0.31, 710, 1419, 7335, 1774, 2838, 10641, 17026, 28376, 0.72, 1.2, 0.84, 0.63, 0.042, 0.32]))];
    const trouves = durs.filter((x) => new RegExp('(^|[^0-9.])' + String(x).replace('.', '\\.') + '(?![0-9])').test(code));
    ok(trouves.length === 0, 'aucun prix du catalogue ecrit en dur dans le code' + (trouves.length ? ' [' + trouves.join(', ') + ']' : ''));
    ok(!/AI-generated label|Labelled AI-generated|every result carries/i.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'aucune promesse d etiquette « AI-generated » sur chaque resultat');
  }

  ok(erreurs.length === 0, 'aucune erreur dans la console' + (erreurs.length ? ' : ' + [...new Set(erreurs)].slice(0, 5).join(' | ') : ''));
  await nav.close();
  await new Promise((s) => srv.close(s));
  if (dossier) fs.rmSync(dossier, { recursive: true, force: true });
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); if (erreurs.length) console.error('erreurs de la page : ' + erreurs.join(' | ')); process.exit(1); });
