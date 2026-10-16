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
 *  11. 320, 360, 390, 1024, 1181, 1440 : pas de defilement horizontal ; les
 *      bulles du site restent au-dessus de la barre du bas ; chaque lien du menu
 *      recoit le clic ; le bouton du menu reste la, connecte ; aucune image d'un
 *      x4 n'est cachee ; le bas de page et le resultat passent au-dessus des
 *      bulles ; le texte gris se lit (AA).
 *  12. Aucune erreur console, aucun texte francais visible, aucune cle, et
 *      aucune adresse envoyee — ni celle de la session, ni une adresse prise
 *      ailleurs (URL, stockage local).
 *  13. Le jeton ne part que vers le serveur : `?server=` d'un autre hote est
 *      ignore, et une recharge ne fait signer que le montant choisi.
 *  14. Le prix suit le serveur : catalogue relu chaque minute, et avant un
 *      envoi s'il est vieux ; un prix change entre-temps n'est pas envoye.
 *  15. Le menu de la page est le menu commun (nav_liens.test.js, MENU).
 *  16. Ce qui n'est plus au serveur est dit, et garde dans l'historique ; une
 *      video suivie appartient au compte qui l'a payee.
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
const SESSION_AUTRE = 'v1.' + AUTRE + '.' + (Math.floor(Date.now() / 1000) + 86400 * 20) + '.sig-test';
const PIEGE = 'autre-hote.example';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
/* Le catalogue a un autre cours : ce que le serveur sert quand le $SWOGE bouge (il relit le cours
   toutes les 60 s, studio_chat.js, COURS_TTL_MS). */
const catAu = (c) => (Med ? JSON.parse(JSON.stringify(Med.catalogue(c, { grok: true, openai: true }))) : null);
/* Le menu commun, tel que nav_liens.test.js l'exige des autres pages. */
/* Le bouton du menu, par ce qu il fait (il ouvre le tiroir), pas par son identifiant. */
const MENU_BTN = 'button[aria-controls="drawer"]';
const MENU = (/const MENU = '([^']+)'/.exec(fs.readFileSync(path.join(SITE, 'nav_liens.test.js'), 'utf8')) || [])[1] || null;
/* Contraste WCAG de deux couleurs « rgb(r, g, b) » ou « #rrggbb ». */
function lum(c) {
  const v = /^#/.test(c) ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const l = v.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
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
      pollHtml: 0, poll401: false, imageHtml: 0, repriseAuto: null, video404: false, scene402: false, topupMontant: null, piege: [], catLectures: 0, solde: null, topupSigne: null, topups: [], histCredit: null, suiteSeule: false, videoRep: null, videoPayeur: null });
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
    /* Le refus du serveur quand le solde ne couvre pas la reserve (studio_media.js, reserve : liste x duree x 3). */
    if (S.scene402) return [402, { ok: false, code: 402, raison: 'balance too low for this generation', requisSwoge: '85106.4' }];
    const sc = Prod.scene(prod, corps.texte, corps.duree, { camera: corps.camera });
    if (sc.erreur) return [400, { ok: false, raison: sc.erreur }];
    const video = 'v' + S.envois.length + 'x', idScene = 's' + S.envois.length;
    PS.noteScene(ADDR, prod.id, { id: idScene, texte: sc.texte, video, statut: 'pending', duree: corps.duree, t: Date.now() });
    /* `suiteSeule` : xAI a refuse la derniere image avec les references, le serveur a relance depuis la derniere image seule (studio_media.js, lanceVideo). */
    return [200, { ok: true, genre: 'video', id: video, status: 'pending', scene: idScene, production: prod.id, suiteSeule: !!S.suiteSeule }];
  }
  async function route(r) {
    const q = r.request(), u = new URL(q.url());
    const json = (code, o) => r.fulfill({ status: code, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.hostname === HOTE) {
      const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
      const e = { m: q.method(), chemin: u.pathname, auth: q.headers().authorization || null, brut: q.postData() || '', corps: (() => { try { return JSON.parse(q.postData() || '{}'); } catch (x) { return {}; } })() };
      /* Les fichiers sont publics par leur nom (server.js, routes studioFichiers.PREFIXE et IMAGE_PREFIXE) : ni jeton, ni geste. */
      if (/^\/studio\/media\/fichier\//.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG });
      if (/^\/studio\/production\/image\//.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      S.lectures.push(e);
      if (u.pathname === '/studio/media/catalogue') { S.catLectures++; return json(200, S.cat); }
      /* Le catalogue de l onglet Voice (studio_son.js, 16/10) : public lui aussi. Absent ici (404, comme un
         serveur d avant) : Voice reste « Soon » — studio_son_page.test.js essaie l onglet allume. */
      if (u.pathname === '/studio/son/catalogue') return json(404, { ok: false, raison: 'unknown route' });
      S.envois.push(e);
      if (auth !== SESSION) return json(401, { ok: false, raison: 'sign in with your wallet first' });
      if (u.pathname === '/studio/chat/solde') return json(200, { ok: true, adresse: ADDR, solde: S.solde || '182400.52' });
      if (u.pathname === '/credit') return json(200, { ok: true, balanceUsd: S.credit, history: S.histCredit || [{ at: '2026-10-12T10:00:00.000Z', kind: 'top-up', usd: 5, what: null }], limits: { minUsd: 0.1, maxUsd: 50, maxSoldeUsd: 100 }, networks: { base: true, solana: true } });
      /* La recharge x402 : le 402 annonce `topupMontant` unites d'USDC (le vrai serveur : le montant + ses frais de reglement, x402.js). */
      if (u.pathname === '/credit/topup') {
        S.topups.push({ sig: q.headers()['payment-signature'] || null });
        /* `topupSigne` : l issue d une requete SIGNEE (attente, regle non lu, reseau coupe) — celles du vrai serveur. */
        if (q.headers()['payment-signature'] && S.topupSigne) { const x = S.topupSigne(q, e); if (x) return x(r); }
        if (q.headers()['payment-signature']) return json(200, { ok: true, creditedUsd: e.corps.usd, balanceUsd: S.credit + e.corps.usd });
        const req = { x402Version: 2, resource: { url: 'https://' + HOTE + '/credit/topup' }, accepts: [{ scheme: 'exact', network: 'eip155:8453', asset: USDC_BASE, payTo: '0x' + '1'.repeat(40),
          amount: String(S.topupMontant != null ? S.topupMontant : Math.round(e.corps.usd * 1e6) + 1000), maxTimeoutSeconds: 120, extra: { name: 'USD Coin', version: '2' } }] };
        return r.fulfill({ status: 402, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'payment-required, payment-response',
          'payment-required': Buffer.from(JSON.stringify(req)).toString('base64') }, body: JSON.stringify({ ok: false }) });
      }
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
      /* Au credit (14/10, server.js : enCredit a la reponse, studio_media.etatVideo au suivi) : des dollars, jamais sous les noms $SWOGE. */
      if (u.pathname === '/studio/media/video') {
        if (S.videoRep) return json(S.videoRep.status, S.videoRep.body);
        S.videoPayeur = e.corps.payeur === 'credit' ? 'credit' : 'swoge';
        const v = { ok: true, genre: 'video', id: 'v1', status: 'pending', duree: e.corps.duree, resolution: e.corps.resolution, modele: e.corps.modele };
        return json(200, S.videoPayeur === 'credit' ? Object.assign(v, { payeur: 'credit', creditUsd: 2.85 }) : v);
      }
      if (u.pathname === '/studio/media/video/v1') {
        if (S.video404) return json(404, { ok: false, code: 404, raison: 'unknown video' });
        if (S.pollHtml > 0) { S.pollHtml--; return pageProxy(); }
        if (S.poll401) return json(401, { ok: false, raison: 'sign in with your wallet first' });
        S.polls++;
        if (S.pollsBloques || S.polls < 2) return json(200, { ok: true, genre: 'video', id: 'v1', status: 'pending', progress: 40 });
        if (S.videoPayeur === 'credit') { S.credit = 3.75; return json(200, { ok: true, genre: 'video', id: 'v1', status: 'done', progress: 100, url: 'https://vidgen.x.ai/v1.mp4', duree: 6, resolution: '480p', payeur: 'credit', factureUsd: 0.45, creditUsd: 3.75 }); }
        return json(200, { ok: true, genre: 'video', id: 'v1', status: 'done', progress: 100, url: 'https://vidgen.x.ai/v1.mp4', duree: 6, resolution: '480p', factureSwoge: '10639', solde: '171761.5' });
      }
      if (u.pathname.startsWith('/studio/reprise/')) {
        const v = S.reprise[decodeURIComponent(u.pathname.slice('/studio/reprise/'.length))] || S.repriseAuto;
        return v ? json(200, v) : json(404, { ok: false, status: 'unknown', raison: 'this answer is no longer on the server' });
      }
      if (/^\/studio\/production/.test(u.pathname)) { const [c, o] = routeProd(q, u, auth); return json(c, o); }
      return json(404, { ok: false, raison: 'unknown route' });
    }
    /* Un hote nomme dans `?server=` : il ne doit rien recevoir (ou rien qui porte le jeton). */
    if (u.hostname === PIEGE || u.hostname.endsWith('.' + PIEGE)) { S.piege.push({ m: q.method(), chemin: u.pathname, auth: q.headers().authorization || null }); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(S.cat) }); }
    /* Le CORS d'imgen.x.ai n'est pas verifie (releve du 12/10) : refuse, la lecture en script echoue
       (Playwright ajoute de lui-meme l'en-tete CORS a un fulfill : on coupe donc la lecture « fetch »). */
    if (u.hostname === 'imgen.x.ai' && !S.corsImgen && q.resourceType() === 'fetch') return r.abort('accessdenied');
    /* Un lien expire (xAI ne publie pas la duree de ses liens ; nos fichiers ChatGPT vivent 7 jours) : 404. */
    if (/^\/expire/.test(u.pathname)) return r.fulfill({ status: 404, contentType: 'text/plain', body: 'gone' });
    if (u.hostname === 'imgen.x.ai') return r.fulfill({ status: 200, contentType: 'image/png', headers: S.corsImgen ? { 'access-control-allow-origin': '*' } : {}, body: PNG });
    if (u.hostname === 'vidgen.x.ai') return r.fulfill({ status: 200, contentType: 'video/mp4', body: '' });
    return r.abort();
  }
  async function ouvre(o = {}) {
    const ctx = await nav.newContext({ viewport: { width: o.largeur || 1440, height: o.hauteur || 900 }, isMobile: !!o.mobile, hasTouch: !!o.mobile, acceptDownloads: true });
    /* La socket de stakebubble ne sort pas : aucun vrai serveur ne doit lire ni effacer le jeton d'essai.
       `o.socket` : elle repond comme le serveur (hello, puis auth a la reprise de session) — c'est
       ce qui fait poser par stakebubble ses regles « connecte » (dont #menuBtn{display:none}). */
    const sockets = [];
    await ctx.routeWebSocket(/.*/, (ws) => {
      sockets.push(ws.url());
      if (!o.socket) return;
      ws.send(JSON.stringify({ type: 'hello', loginNonce: 'abc' }));
      ws.onMessage((m) => { let x; try { x = JSON.parse(m); } catch (e) { return; }
        if (x.type === 'resume') ws.send(JSON.stringify({ type: 'auth', address: ADDR, balance: '182400.52', betBalance: '0', session: SESSION, sessionTtl: 86400 * 20 })); });
    });
    if (o.session) await ctx.addInitScript((j) => { try { if (!sessionStorage.getItem('pose')) { localStorage.setItem('swogeSession', j); sessionStorage.setItem('pose', '1'); } } catch (e) {} }, SESSION);
    if (o.init) await ctx.addInitScript(o.init[0], o.init[1]);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erreurs.push('pageerror : ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|WebSocket/.test(m.text())) erreurs.push('console : ' + m.text()); });
    p.on('dialog', (d) => d.accept());
    p.sockets = sockets;
    await p.route((u) => !u.href.startsWith(base), route);
    if (o.horloge) await p.clock.install();
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
    ok(S.lectures.length >= 1 && S.lectures.every((e) => /^\/studio\/(media|son)\/catalogue$/.test(e.chemin) && !e.auth), 'seuls les catalogues publics (images/videos, Voice) sont demandes, sans jeton');
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
    /* Grok : le serveur facture le cout RENDU par xAI x marge, jamais la liste (studio_media.js, regle),
       et aucune image Grok n est mesuree contre sa liste (revue du 14/10 : « $0.06 » ferme pour
       Quality, servie au palier Medium que xAI liste 50 % au-dessus). Le prix est celui du
       catalogue, dit estime : « ~ ». */
    eq(await prixBouton(p), '~' + dollars(g1.parImageUsd), 'Grok Speed ×1 : le prix du catalogue, dit estime');
    if (Med) eq(await prixBouton(p), '~' + usd('grok', 'rapide', 1, false), 'et c est le prix de liste du serveur (coutsImage × marge)');
    ok(/billed on what xAI reports/.test(await p.textContent('#priceNote')) && /not yet checked against a real bill/.test(await p.textContent('#priceNote')),
      'la note dit d ou vient le chiffre, et qu aucune facture ne l a encore verifie (catalogue sans mesure)');
    await p.click('.mcard[data-id="grok:qualite"]');
    ok(/default quality for this model is listed higher/.test(await p.textContent('#priceNote')) && /^~/.test(await prixBouton(p)) && /^~/.test(await p.textContent('.mcard[data-id="grok:qualite"] .amt')),
      'Grok Quality (2.0) : « ~ » sur le bouton et la carte, et la note dit que le palier servi par defaut est liste plus haut');
    await p.click('.mcard[data-id="grok:rapide"]');
    await p.click('#segN [data-n="4"]');
    eq(await prixBouton(p), '~' + dollars(g1.parImageUsd * 4), '×4');
    if (Med) eq(await prixBouton(p), '~' + usd('grok', 'rapide', 4, false), '×4 : celui du serveur');
    await p.click('#segN [data-n="1"]');
    /* La marge : le catalogue la donne (marge), la page la dit (« plus our margin of 50% »). */
    const pct = Math.round((cat.marge - 1) * 100) + '%';
    ok((await p.textContent('.hero .sub')).includes('plus our margin of ' + pct) && (await p.textContent('.trust')).includes('plus our margin of ' + pct),
      'la marge du catalogue (' + cat.marge + ') est dite, en haut et dans « The price, before you click » : ' + pct);
    ok(!/real cost/i.test(await p.innerText('body')), 'plus de « real cost » nulle part : ce n est pas le prix coutant');
    await p.fill('#prompt', 'SWOGE lifting a golden barbell on a rooftop');
    /* Une image envoyee chez Grok : la grille xAI ne chiffre pas l image d entree, la facture est le cout rendu x marge : une ESTIMATION. */
    eq(await prixBouton(p), '~' + dollars(g1.parImageUsd * 2), 'le prompt nomme SWOGE : sa reference compte comme une image de plus, et le prix est dit estime (« ~ »)');
    if (Med) eq(await prixBouton(p), '~' + usd('grok', 'rapide', 1, true), 'exactement le prix de liste du serveur avec la reference jointe d office');
    ok(/estimated from xAI's list price; billed on what xAI reports/.test(await p.textContent('#priceNote')) && !/already in the price/.test(await p.textContent('#refNote')),
      'la note dit d ou vient l estimation, et ne dit plus « already in the price »');
    ok(await p.isVisible('#refNote') && /SWOGE reference added/.test(await p.textContent('#refNote')), 'la phrase le dit');
    ok(await p.$eval('#refBtn', (b) => b.classList.contains('auto')), 'la case le montre');
    await p.fill('#prompt', 'swogeland at night');
    eq(await prixBouton(p), '~' + dollars(g1.parImageUsd), '« swogeland » ne nomme pas SWOGE (meme \\b que le serveur)');
    await p.fill('#prompt', 'SWOGE at the gym');
    await p.setInputFiles('#fichier', { name: 'p.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForSelector('#refBtn.has');
    eq(await prixBouton(p), '~' + dollars(g1.parImageUsd * 2), 'une image jointe ET SWOGE nomme : UNE seule reference comptee');
    if (Med) eq(await prixBouton(p), '~' + usd('grok', 'rapide', 1, true), 'comme le serveur, qui ne joint pas la sienne en plus');
    await p.click('#refBtn');
    await p.click('[data-pay="swoge"]');
    eq(await prixBouton(p), '~' + nombre(g1.parImageSwoge * 2) + ' $SWOGE', 'paye en $SWOGE : le prix $SWOGE du catalogue');
    await p.fill('#prompt', 'a golden barbell');
    eq(await prixBouton(p), '~' + nombre(g1.parImageSwoge) + ' $SWOGE', 'sans image envoyee : le prix de liste, une image de moins, toujours estime');
    await p.fill('#prompt', 'SWOGE lifting a golden barbell on a rooftop');
    await p.click('[data-pay="credit"]');
    /* ChatGPT Image Speed (medium) : le chiffre du catalogue vient d UNE image mesuree en « high »
       (studio_media.js, OPENAI_MESURE_SORTIE) ; rien n est mesure en medium : aucun chiffre (revue du 14/10). */
    await p.click('.mcard[data-id="openai:rapide"]');
    {
      const carte = await p.textContent('.mcard[data-id="openai:rapide"] .pr');
      ok(!/\$|\d/.test(carte) && /not measured yet/.test(carte), 'ChatGPT Image Speed : la carte ne porte aucun chiffre [' + carte + ']');
      eq(await prixBouton(p), 'priced on use', 'et le bouton le dit, sans chiffre');
      ok(/no medium-quality image has been measured yet/.test(await p.textContent('#priceNote')), 'la note dit pourquoi');
    }
    await p.click('.mcard[data-id="openai:qualite"]');
    ok(/from 1 measured image \(high quality\)/.test(await p.textContent('.mcard[data-id="openai:qualite"] .pr')) && /an estimate from 1 measured image/.test(await p.textContent('#priceNote')),
      'ChatGPT Image Quality : la carte et la note disent sur combien d images porte l estimation');
    const o1 = cat.image.fournisseurs[1].modeles[1];
    eq(await prixBouton(p), '~' + dollars(o1.parImageUsd) + ' + ref', 'ChatGPT Image + SWOGE : l estimation du catalogue, et la reference dite sans chiffre invente');
    ok(/estimate/.test(await p.textContent('#priceNote')), 'dite estimation');
    await p.fill('#prompt', 'a golden barbell');
    eq(await prixBouton(p), '~' + dollars(o1.parImageUsd), 'ChatGPT Image seul');
    /* x2, x4 : le prix d UNE image fois le nombre (un mutant qui oubliait « x n » sortait vert, revue du 13/10). */
    await p.click('#segN [data-n="4"]');
    eq(await prixBouton(p), '~' + dollars(o1.parImageUsd * 4), 'ChatGPT Image x4 : quatre fois l estimation du catalogue');
    await p.click('[data-pay="swoge"]');
    eq(await prixBouton(p), '~' + nombre(o1.parImageSwoge * 4) + ' $SWOGE', 'et en $SWOGE');
    await p.click('[data-pay="credit"]');
    /* Le serveur, lui, compte en plus le texte du prompt (OPENAI_RESERVE_TEXTE), que le catalogue ne
       publie pas : la page le DIT, et l ecart est le meme pour 1 et pour 4 images (une fois par demande). */
    ok(/plus the input tokens of your prompt \(not priced in advance\)/.test(await p.textContent('#priceNote')), 'la note dit que le texte du prompt n est pas compte dans l estimation');
    if (Med) {
      const ecart = (nb) => listeServeurUsd(cat, 'openai', 'qualite', nb, false) - o1.parImageUsd * nb;
      ok(Math.abs(ecart(1) - ecart(4)) < 1e-3 && ecart(1) > 0 && ecart(1) < o1.parImageUsd / 10,
        'l ecart avec la liste du serveur est le texte du prompt seul : ' + ecart(1).toFixed(4) + ' $ a x1, ' + ecart(4).toFixed(4) + ' $ a x4 (une fois par demande, moins d un dixieme d image)');
    }
    await p.click('#segN [data-n="1"]');
    await p.click('.tab[data-tab="video"]');
    const v = cat.video;
    /* Au credit (le payeur par defaut quand il y a du credit) : le prix en dollars du catalogue (14/10). */
    eq(await prixBouton(p), dollars(v.modeles[0].typiqueUsd), 'video Speed 6 s, au credit : typiqueUsd du catalogue');
    if (Med) ok(Math.abs(v.modeles[0].typiqueUsd - Med.VIDEO[0].usdSeconde * 6 * cat.marge) < 1e-4, 'et c est la liste du serveur × marge, sans passer par le cours');
    ok(/paid from your dollar credit/.test(await p.textContent('#priceNote')) && !/paid in \$SWOGE for now/.test(await p.textContent('#priceNote')), 'la note dit « paid from your dollar credit », plus « Video is paid in $SWOGE for now »');
    await p.click('#segL [data-l="10"]');
    eq(await prixBouton(p), dollars(Math.round(v.modeles[0].parSecondeUsd * 10 * 1e4) / 1e4), 'au credit, 10 s : parSecondeUsd × 10');
    await p.click('#segL [data-l="6"]');
    await p.click('[data-pay="swoge"]');
    eq(await prixBouton(p), nombre(v.modeles[0].typiqueSwoge) + ' $SWOGE', 'video Speed 6 s : typiqueSwoge du catalogue');
    /* Quality (1.5) se choisit dans la grille : son prix aussi vient du catalogue (un mutant qui gardait le prix Speed sortait vert). */
    await p.click('.mcard[data-id="video:qualite"]');
    eq(await prixBouton(p), nombre(v.modeles[1].typiqueSwoge) + ' $SWOGE', 'video Quality (1.5) 6 s : son typiqueSwoge');
    await p.click('#segL [data-l="10"]');
    eq(await prixBouton(p), nombre(v.modeles[1].parSecondeSwoge * 10) + ' $SWOGE', 'Quality 10 s : parSecondeSwoge x 10');
    await p.click('#segL [data-l="6"]');
    await p.click('.mcard[data-id="video:rapide"]');
    /* Intention d'avant (le credit grise en video) : la page n'offre QUE ce que le serveur accepte. Il
       publie video.credit depuis le 14/10 : le credit s'offre ; sans ce champ, grise (essai plus bas). */
    ok(!(await p.isDisabled('[data-pay="credit"]')), 'video : le credit s offre (catalogue video.credit)');
    await p.click('#segL [data-l="10"]');
    eq(await prixBouton(p), nombre(v.modeles[0].parSecondeSwoge * 10) + ' $SWOGE', '10 s : parSecondeSwoge × 10');
    await p.click('#segR [data-r="720p"]');
    eq(await prixBouton(p), 'from ' + nombre(v.modeles[0].parSecondeSwoge * 10) + ' $SWOGE', '720p : « from » (le catalogue ne chiffre pas l ecart)');
    /* xAI PUBLIE l ecart 480p / 720p (docs.x.ai, releve du 13/10) : la page ne dit plus le contraire (revue du 14/10). */
    {
      const note = await p.textContent('#priceNote');
      ok(/720p is billed at xAI's higher 720p rate, not shown here yet/.test(note) && !/doesn't publish/.test(note), '720p : la note dit que xAI facture plus, sans pretendre que l ecart n est pas publie');
    }
    const visible = await p.innerText('body');
    ok(!/\$0\.84|\$0\.63|\$3\.00|\$0\.32|\$0\.042|\$0\.02 \/|Planned/.test(visible), 'aucun prix « planned » de la maquette');
    await ferme(p);

    /* Un prix change au serveur : le bouton suit, page inchangee. Un modele ajoute apparait. */
    remet();
    S.cat.image.fournisseurs[0].modeles[0].parImageUsd = 0.05; S.cat.image.fournisseurs[0].modeles[0].parImageSwoge = 1182;
    S.cat.image.fournisseurs[0].modeles.push({ id: 'turbo', nom: 'Turbo', parImageSwoge: 473, parImageUsd: 0.02 });
    S.cat.video.modeles[0].typiqueSwoge = 9999;
    const p2 = await ouvre({ session: true });
    eq(await prixBouton(p2), '~$0.05', 'le serveur change le prix : le bouton suit');
    ok(/\$0\.05/.test(await p2.textContent('.mcard[data-id="grok:rapide"]')), 'et la carte aussi');
    ok(await p2.isVisible('.mcard[data-id="grok:turbo"]'), 'un modele ajoute au catalogue apparait');
    await p2.click('.mcard[data-id="grok:turbo"]');
    eq(await prixBouton(p2), '~$0.02', 'et se choisit, a son prix');
    await p2.click('.tab[data-tab="video"]');
    await p2.click('[data-pay="swoge"]');
    eq(await prixBouton(p2), '9,999 $SWOGE', 'le prix video suit le catalogue');
    await p2.click('[data-pay="credit"]');
    await ferme(p2);

    /* Ce que le serveur coupe se lit sur la page, avec SA phrase. */
    remet();
    S.cat.image.fournisseurs[1].actif = false;
    const p3 = await ouvre({ session: true });
    ok(await p3.$eval('.mcard[data-id="openai:rapide"]', (c) => c.classList.contains('paused') && c.getAttribute('aria-disabled') === 'true'), 'un fournisseur coupe : sa carte dit Paused et ne se choisit pas');
    await p3.click('.mcard[data-id="openai:rapide"]');
    eq(await prixBouton(p3), '~' + dollars(S.cat.image.fournisseurs[0].modeles[0].parImageUsd), 'le choix reste sur le modele ouvert');
    await ferme(p3);
    /* Le cours $SWOGE manque : le catalogue dit ouvert:false (studio_media.js, catalogue). Le serveur
       refuse alors le paiement en $SWOGE, mais une image au CREDIT est facturee au cours 1 (payeurDe)
       et passe : la page ne ferme que le $SWOGE. */
    remet();
    S.cat.ouvert = false; S.cat.note = 'The $SWOGE price is unavailable right now — generation is paused so nobody is overcharged.';
    S.cat.image.fournisseurs.forEach((f) => f.modeles.forEach((m) => { m.parImageSwoge = null; }));
    const p4 = await ouvre({ session: true });
    await p4.fill('#prompt', 'a doge');
    ok(!(await p4.isDisabled('#gen')) && (await prixBouton(p4)) === '~' + dollars(S.cat.image.fournisseurs[0].modeles[0].parImageUsd) && await p4.$('.mcard.live[data-id="grok:rapide"]'),
      'cours indisponible, paye au credit : le bouton reste ouvert, a son prix en dollars, et la carte se choisit');
    await p4.click('[data-pay="swoge"]');
    ok(await p4.isDisabled('#gen') && (await libBouton(p4)) === 'Paused' && (await p4.textContent('#priceNote')) === S.cat.note && await p4.$('.mcard.paused[data-id="grok:rapide"]'),
      'paye en $SWOGE : bouton Paused, la phrase du serveur telle quelle');
    await p4.click('[data-pay="credit"]');
    await p4.click('#gen'); await p4.waitForSelector('#result.done', { timeout: 8000 });
    eq(posts(/\/studio\/media\/image$/).length, 1, 'et au credit, la demande part (le serveur tranche)');
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
      /* aria-disabled (annonce « pas en service ») : l onglet s ouvre quand meme pour le dire. */
      await p.click('.tab[data-tab="' + t + '"]', { force: true });
      ok(await p.isDisabled('#gen') && (await libBouton(p)) === 'Coming soon', t + ' : le bouton dit Coming soon, desactive');
      ok(await p.isDisabled('#prompt'), t + ' : rien a ecrire');
      await p.click('#gen', { force: true }).catch(() => {});
      ok(/Coming soon/.test(await p.textContent('#resStage')), t + ' : la carte resultat le dit');
      ok(await p.$$eval('.mcard.live', (l) => l.length) === 0, t + ' : aucune carte a choisir');
    }
    await p.waitForTimeout(200);
    eq(posts().length, 0, 'aucune requete d argent depuis Voice ou Avatar');
    await p.click('.tab[data-tab="voice"]', { force: true });
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
    /* « Download » telecharge vraiment : `download` ne vaut rien vers une autre origine (le navigateur
       ouvrait un onglet, revue du 13/10). L hote dit oui au CORS : la page lit le fichier et le donne. */
    await p.waitForSelector('.rbar a[data-dl]', { timeout: 5000 }).catch(() => {});
    ok(await p.$eval('.rbar a', (a) => a.href === 'https://imgen.x.ai/i0.png' && a.hasAttribute('data-dl') && /Download/.test(a.textContent)), 'le CORS de l hote confirme : « Download », vers le vrai fichier');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('.rbar a[data-dl]')]);
    ok(dl && /^swoge-studio-[a-z0-9]+\.png$/.test(dl.suggestedFilename()), 'et un appui TELECHARGE le fichier (' + (dl ? dl.suggestedFilename() : 'aucun telechargement') + '), sans ouvrir d onglet');
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
    /* 15/10 (soir) : la section SWOGE Swap (#swap) lit aussi sa vue (GET /studio/swap) quand elle approche — une lecture */
    ok(S.envois.every((e) => e.m === 'GET' && /^\/(studio\/chat\/solde|credit|studio\/production|studio\/swap)$/.test(e.chemin)), 'seulement les lectures du solde, du credit, des productions et de la vue SWOGE Swap');
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
    {
      const t = await p.textContent('#resStage b');
      ok(t === 'Not generated' && (await p.textContent('#resStage')).split(/not charged/i).length === 2, 'le titre ne repete pas la phrase du serveur (« ' + t + ' »), « not charged » une seule fois');
    }
    S.imageRep = { status: 402, body: { ok: false, code: 402, raison: 'your dollar credit is too low for this ($0.18 is reserved while it runs, you pay only what is used)', requisUsd: 0.18, creditUsd: 0.05, payeur: 'credit' } };
    await p.click('#gen'); await p.waitForFunction(() => /too low/.test(document.getElementById('resStage').textContent));
    ok((await p.textContent('#resStage')).includes('your dollar credit is too low for this ($0.18 is reserved'), '402 : la phrase du serveur');
    eq(await p.textContent('#resStage b'), 'Not enough credit', 'sous un titre qui ne la repete pas');
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
    await p.click('[data-pay="swoge"]');
    await p.click('#gen');
    await p.waitForFunction(() => /Rendering · 40%/.test(document.getElementById('resStage').textContent), null, { timeout: 8000 });
    ok(true, 'la progression reelle du serveur : « Rendering · 40% », apres une page d erreur du proxy qui n a rien interrompu');
    ok(/come back within the hour/.test(await p.textContent('#resStage')), 'et la page dit de revenir dans l heure (le serveur oublie une video une heure apres sa fin)');
    ok(await p.isDisabled('#gen'), 'pendant le rendu, le bouton est verrouille');
    await p.waitForSelector('#result.done video', { timeout: 15000 });
    const e = posts(/\/studio\/media\/video$/)[0];
    ok(e && e.corps.duree === 10 && e.corps.resolution === '480p' && e.corps.modele === 'rapide' && e.corps.payeur === 'swoge', 'la demande porte la duree, la resolution, le modele et le payeur choisi ($SWOGE)');
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

  console.log('\n-- 8 bis. le credit en dollars : l affiche, sa recharge, et la video au credit (14/10) --');
  {
    /* Deconnecte : l affiche dit comment avoir un credit, et rien n est lu. */
    remet();
    const p0 = await ouvre();
    ok(await p0.isVisible('#crCard') && /Sign in with your wallet to see your dollar credit and top it up with USDC/.test(await p0.textContent('#crTxt')) && !(await p0.isVisible('#crVal')),
       'deconnecte : l affiche du credit est la, une ligne dit de se connecter, aucun solde invente');
    eq((await p0.textContent('#crTopL')).trim(), 'Sign in', 'son bouton dit « Sign in »');
    await p0.click('#crTop'); await p0.waitForTimeout(200);
    ok(S.envois.length === 0 && await p0.isHidden('#rc'), 'le clic ne lit rien et n ouvre pas la recharge (il faut une session)');
    await ferme(p0);
    /* Connecte : le solde de la session, et la recharge EXISTANTE de la page (#rc, x402_paie.js). */
    remet();
    const portefeuille = () => { window.__signe = []; window.ethereum = { request: async (a) => {
      if (a.method === 'eth_requestAccounts') return ['0x' + '11'.repeat(20)];
      if (a.method === 'wallet_switchEthereumChain') return null;
      if (a.method === 'eth_signTypedData_v4') { window.__signe.push(JSON.parse(a.params[1]).message); return '0x' + '22'.repeat(65); }
      return null; } }; };
    const p = await ouvre({ session: true, init: [portefeuille, null], attente: 800 });
    ok(await p.isVisible('#crCard') && await p.isVisible('#crVal'), 'connecte : l affiche est visible avec le solde');
    eq(await p.textContent('#crVal'), '$4.20', 'le credit de la session, lu sur /credit');
    eq((await p.textContent('#crTopL')).trim(), 'Top up', 'et un bouton « Top up »');
    await p.click('#crTop');
    ok(await p.isVisible('#rc') && /Top up your dollar credit/.test(await p.textContent('#rcTitre')) && /images and videos/.test(await p.textContent('#rc')),
       '« Top up » ouvre la recharge de la page (la meme que l en-tete), qui dit qu elle paie images et videos');
    await p.click('#rcSign');
    await p.waitForFunction(() => /Done:/.test(document.getElementById('rcStatut').textContent), null, { timeout: 8000 });
    ok((await p.evaluate(() => window.__signe.length)) === 1 && S.topups.filter((t) => t.sig).length === 1, 'la recharge USDC existante : une signature, une requete signee a /credit/topup');
    await p.click('#rcClose');
    /* La video au credit : prix en dollars, payeur 'credit', facture et credit en dollars. */
    await p.click('.tab[data-tab="video"]');
    await p.fill('#prompt', 'a doge sprinting on a beach');
    eq(await prixBouton(p), dollars(S.cat.video.modeles[0].typiqueUsd), 'video au credit : le prix du bouton en dollars');
    ok(!/for now/.test(await p.textContent('#priceNote')), 'plus de « Video is paid in $SWOGE for now »');
    await p.click('#gen');
    await p.waitForSelector('#result.done video', { timeout: 15000 });
    const e = posts(/\/studio\/media\/video$/)[0];
    ok(e && e.corps.payeur === 'credit' && !('addr' in e.corps), 'la demande porte payeur « credit » (et aucune adresse)');
    ok(/\$0\.45/.test(await p.textContent('#resFoot')) && !/SWOGE/.test(await p.textContent('#resFoot')), 'le resultat dit ce qu elle a coute, en dollars');
    eq(await p.textContent('#crVal'), '$3.75', 'et l affiche suit le credit rendu par le serveur');
    ok(await p.evaluate((a) => { const l = JSON.parse(localStorage.getItem('swogeStudioHisto:' + a) || '[]'); return l[0] && l[0].genre === 'video' && l[0].payeur === 'credit' && l[0].usd === 0.45; }, ADDR),
       'l historique la range au credit, 0,45 $');
    await ferme(p);
    /* Credit insuffisant pour une video : la phrase du serveur, et la signature de ce qui manque. */
    remet(); S.credit = 0.2;
    S.videoRep = { status: 402, body: { ok: false, code: 402, payeur: 'credit', raison: 'your dollar credit is too low for this ($1.35 is reserved while it runs, you pay only what is used)', requisUsd: 1.35, creditUsd: 0.2 } };
    const q = await ouvre({ session: true, suite: '#video' });
    await q.click('[data-pay="credit"]');
    await q.fill('#prompt', 'x'); await q.click('#gen');
    await q.waitForFunction(() => /too low/.test(document.getElementById('resStage').textContent), null, { timeout: 8000 });
    eq(await q.textContent('#resStage b'), 'Not enough credit', 'video, 402 au credit : « Not enough credit »');
    ok((await q.textContent('#resStage')).includes('your dollar credit is too low for this ($1.35 is reserved'), 'la phrase du serveur, telle quelle');
    ok(/Sign \$1\.15 and generate/.test(await q.textContent('#resStage')) && /Pay with \$SWOGE instead/.test(await q.textContent('#resStage')), 'la signature de ce qui manque (1,35 − 0,20), ou le $SWOGE');
    eq(posts(/\/credit\/topup/).length, 0, 'aucune recharge sans le clic du joueur');
    await ferme(q);
    /* Un serveur qui ne publie pas video.credit : la page ne l offre pas (il le refuserait). */
    remet(); delete S.cat.video.credit;
    const r = await ouvre({ session: true, suite: '#video' });
    ok(await r.isDisabled('[data-pay="credit"]') && /Video is paid in \$SWOGE for now/.test(await r.textContent('#priceNote')) && / \$SWOGE$/.test(await prixBouton(r)),
       'sans video.credit au catalogue : credit grise, prix et note en $SWOGE');
    await r.fill('#prompt', 'x'); await r.click('#gen');
    await r.waitForSelector('#result.done video', { timeout: 15000 });
    eq(posts(/\/studio\/media\/video$/)[0].corps.payeur, 'swoge', 'et la demande part en $SWOGE');
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
    {
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('.rbar a[data-dl]')]);
      ok(dl && /\.png$/.test(dl.suggestedFilename()), 'un fichier range chez nous (CORS ouvert) : « Download » le telecharge');
    }
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
    ok(await p.$eval('.rbar a', (a) => /Open/.test(a.textContent) && !a.hasAttribute('data-dl') && !a.hasAttribute('download') && a.target === '_blank'),
      'et son bouton dit « Open » (il ouvre un onglet, c est ce qu il fait), pas « Download »');
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
    /* Revue du 14/10 (sonde s8) : une scene facturee n entrait ni dans l historique ni dans « Last 7 days ». */
    await p.waitForFunction(() => /28,370 \$SWOGE/.test(document.getElementById('hist').textContent), null, { timeout: 5000 }).catch(() => {});
    ok(/28,370 \$SWOGE/.test(await p.textContent('#hist')) && /Series · Gym Wars · scene 1/.test(await p.textContent('#hist')) && !(await p.$eval('#hsum', (e) => e.hidden)) && /28,370/.test(await p.textContent('#weekSw')),
      'la scene facturee 28 370 $SWOGE entre dans l historique et dans « Last 7 days »');
    {
      await p.evaluate(() => { location.hash = 'image'; });
      await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
      ok((await p.getAttribute('.tab[data-tab="image"]', 'aria-selected')) === 'true', 'rechargee sur l onglet Image');
      const n = await p.evaluate(() => [...document.querySelectorAll('#hist li')].filter((l) => /Gym Wars · scene 1/.test(l.textContent)).length);
      eq(n, 1, 'rechargee sur l onglet Image : elle y est, une seule fois');
      await p.click('.tab[data-tab="video"]');
      await p.waitForSelector('#scenes a.scene video', { timeout: 9000 });
    }
    /* Une scene ratee (le serveur a tout rendu, et le dit) et une scene « unknown » (le serveur l a
       perdue : un redemarrage garde la reserve, une scene finie et facturee peut aussi y tomber). */
    {
      const prodId = PS.liste(ADDR)[0].id;
      PS.noteScene(ADDR, prodId, { id: 'sx1', texte: 'The rival arrives', statut: 'failed', duree: 6, raison: 'the video could not be generated — you were not charged' });
      PS.noteScene(ADDR, prodId, { id: 'sx2', texte: 'The final lift', statut: 'unknown', duree: 6, raison: 'the server restarted before this scene finished' });
      await p.click('.tab[data-tab="image"]'); await p.click('.tab[data-tab="video"]');
      await p.waitForFunction(() => document.querySelectorAll('#scenes .scene.fail').length === 2, null, { timeout: 8000 });
      const cartes = await p.$$eval('#scenes .scene.fail .w', (l) => l.map((x) => x.textContent));
      eq(cartes[0], 'the video could not be generated — you were not charged', 'une scene ratee : la phrase du serveur, telle quelle (« not charged » une fois)');
      ok(/lost track of this scene/.test(cartes[1]) && !/not charged/i.test(cartes[1]) && /If it was charged, your \$SWOGE balance shows it/.test(cartes[1]),
        'une scene « unknown » : aucun remboursement invente [' + cartes[1] + ']');
      eq(await p.textContent('#contL'), 'Continue from scene 1 — starts on its last frame', 'la suite nomme la derniere scene FINIE (la 1), pas la derniere du tableau (la 3)');
      ok(/held while it runs/.test(await p.textContent('#filmNote')), 'la note de la scene dit qu un montant plus grand est tenu pendant le tournage');
      S.scene402 = true;
      await p.fill('#sceneTxt', 'SWOGE lifts again'); await p.click('#film');
      await p.waitForFunction(() => /balance too low/.test(document.getElementById('pErr').textContent), null, { timeout: 8000 });
      eq(await p.textContent('#pErr'), 'balance too low for this generation — about 85,106 $SWOGE is held while it films.', 'un refus 402 dit ce que le serveur tient (requisSwoge)');
      S.scene402 = false;
      /* Revue du 14/10 : xAI refuse la derniere image avec les references, le serveur relance depuis la
         derniere image SEULE (ni images ni voix des personnages, meme prix) et rend `suiteSeule` ; la
         page n en disait rien. */
      S.suiteSeule = true;
      await p.fill('#sceneTxt', 'SWOGE lifts once more'); await p.click('#film');
      await p.waitForFunction(() => /last frame only/.test(document.getElementById('pErr').textContent), null, { timeout: 8000 }).catch(() => {});
      ok(/faces and voices may change/.test(await p.textContent('#pErr')), 'suiteSeule : la page dit que visages et voix peuvent changer [' + (await p.textContent('#pErr')) + ']');
      await p.click('.tab[data-tab="image"]'); await p.click('.tab[data-tab="video"]');
      await p.waitForFunction(() => /last frame only/.test(document.getElementById('scenes').textContent), null, { timeout: 8000 }).catch(() => {});
      ok(/from the last frame only — faces and voices may differ/.test(await p.textContent('#scenes')), 'et le tableau le garde sur la scene, relu');
      S.suiteSeule = false;
    }
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

  console.log('\n-- 11. 320, 360, 390, 1024, 1181, 1440 : rien ne deborde, rien n est cache --');
  {
    remet();
    for (const session of [false, true]) for (const w of [320, 360, 390, 1024, 1181, 1440]) for (const t of ['image', 'video']) {
      if (!session && (w === 1024 || w === 1181)) continue;
      if (session && w > 900) { S.credit = 1234.56; S.solde = '18200000'; }   /* les montants les plus larges du releve du 13/10 */
      const p = await ouvre({ session, largeur: w, hauteur: w > 900 ? 900 : 760, mobile: w < 900, suite: '#' + t, attente: 500 });
      const m = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, w: window.innerWidth }));
      ok(m.doc <= m.w, (session ? 'connecte' : 'sans session') + ', ' + t + ', ' + w + ' px : document ' + m.doc);
      if (w === 390 && session && t === 'image') {
        /* Les bulles du site (stakebubble) au-dessus de la barre du bas, pas dessus. */
        const b = await p.evaluate(() => { const c = document.getElementById('composer').getBoundingClientRect(); const l = [...document.querySelectorAll('.swdb,.swwb')].filter((e) => e.getBoundingClientRect().height > 0); return { n: l.length, ok: l.every((e) => e.getBoundingClientRect().bottom <= c.top + 1) }; });
        ok(b.ok, 'a 390 : les ' + b.n + ' bulle(s) du site se posent au-dessus de la barre du bas');
      }
      if ((w === 390 || w === 1440) && session && t === 'image') {
        /* L en-tete reste en haut quand on descend : le menu et les soldes restent a portee (avant le
           13/10, `overflow-x:hidden` sur body empechait l en-tete collant de coller). */
        await p.evaluate(() => window.scrollTo(0, 1200)); await p.waitForTimeout(150);
        const e = await p.evaluate(() => ({ y: Math.round(window.scrollY), top: Math.round(document.querySelector('.top').getBoundingClientRect().top) }));
        ok(e.y > 600 && e.top === 0, 'a ' + w + ', descendu de ' + e.y + ' px : l en-tete reste en haut (' + e.top + ' px)');
        await p.evaluate(() => window.scrollTo(0, 0));
      }
      if ((w === 320 || w === 390) && session && t === 'image') {
        /* Le bas de page : sa derniere ligne finit au-dessus des bulles et de la barre du bas (revue du 13/10 : coupee a 320 et 390). */
        await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(250);
        const f = await p.evaluate(() => { const l = [...document.querySelectorAll('footer span')].pop().getBoundingClientRect(); let haut = document.getElementById('composer').getBoundingClientRect().top;
          [...document.querySelectorAll('.swdb,.swwb')].forEach((e) => { const r = e.getBoundingClientRect(); if (r.height > 0) haut = Math.min(haut, r.top); }); return { bas: Math.round(l.bottom), haut: Math.round(haut) }; });
        ok(f.bas <= f.haut, 'a ' + w + ', en bas de page : la derniere ligne du pied finit a ' + f.bas + ' px, au-dessus des bulles et de la barre (' + f.haut + ' px)');
      }
      if (w === 320 && session && t === 'image') {
        /* L etat connecte de stakebubble : la photo de profil et sa pastille posees dans la barre. */
        const m2 = await p.evaluate(() => { const nv = document.querySelector('nav.sb-ancre'); const b = document.createElement('button'); b.className = 'swpb'; b.style.cssText = 'width:30px;height:30px'; nv.insertBefore(b, nv.firstChild);
          const s = document.createElement('span'); s.className = 'swbal'; s.textContent = '● 182.4k $SWOGE'; nv.appendChild(s);
          return { doc: document.documentElement.scrollWidth, w: window.innerWidth, h: document.querySelector('.top').getBoundingClientRect().height }; });
        ok(m2.doc <= m2.w && m2.h <= 72, 'a 320, photo de profil posee : la barre tient sur une ligne (' + Math.round(m2.h) + ' px)');
        /* Le solde garde son unite : « $SWOGE » reste a cote de « 182.4k » (seul « Credit » se cache sous 360 px). */
        const u = await p.$$eval('#balBox .bk small', (l) => l.map((x) => getComputedStyle(x).display));
        ok(u[0] === 'none' && u[1] !== 'none', 'a 320 : « $SWOGE » reste sous son montant, seul « Credit » se cache [' + u.join(', ') + ']');
        /* La feuille de recharge (par le tiroir, sur telephone) : le titre ne passe pas sous la croix. */
        await p.click(MENU_BTN); await p.click('#drTop'); await p.waitForSelector('#rc:not([hidden])');
        const x = await p.evaluate(() => { const h = document.getElementById('rcTitre'), r = document.createRange(); r.selectNodeContents(h);
          const droite = Math.max(...[...r.getClientRects()].map((c) => c.right)); return { droite: Math.round(droite), croix: Math.round(document.getElementById('rcClose').getBoundingClientRect().left) }; });
        ok(x.droite <= x.croix, 'a 320 : « Top up your dollar credit » finit a ' + x.droite + ' px, avant la croix (' + x.croix + ' px)');
      }
      if (session && t === 'image' && w >= 1024) {
        /* Connecte, photo et grands soldes poses : chaque lien visible du menu recoit le clic a son centre ; sous 1181 px, le bouton du menu est la. */
        await p.evaluate(() => { const nv = document.querySelector('nav.sb-ancre'); const b = document.createElement('button'); b.className = 'swpb'; b.style.cssText = 'width:34px;height:34px'; nv.insertBefore(b, nv.firstChild); });
        await p.waitForTimeout(100);
        const r = await p.evaluate(() => { const l = [...document.querySelectorAll('div.nav a')].filter((a) => a.getBoundingClientRect().width > 0);
          return { n: l.length, morts: l.filter((a) => { const b = a.getBoundingClientRect(), e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !(e === a || a.contains(e)); }).map((a) => a.getAttribute('href')),
            menu: getComputedStyle(document.querySelector('button[aria-controls="drawer"]')).display !== 'none' }; });
        ok(r.morts.length === 0 && (r.n === 9 || (r.n === 0 && r.menu)), 'connecte a ' + w + ' px : ' + (r.n ? r.n + ' liens du menu, chacun recoit le clic' : 'menu replie, son bouton est la') + (r.morts.length ? ' [recouverts : ' + r.morts.join(', ') + ']' : ''));
      }
      await ferme(p);
      S.credit = 4.2; S.solde = null;
    }

    /* Le bouton du menu, connecte : stakebubble pose #menuBtn{display:none} des que la socket
       reconnait la session. Le notre ne s appelle plus menuBtn (revue du 13/10 : il disparaissait de
       320 a 1180 px, et sur telephone la recharge avec lui). Socket qui repond hello puis auth. */
    for (const w of [390, 1024]) {
      remet();
      const p = await ouvre({ session: true, socket: true, largeur: w, hauteur: 800, mobile: w < 900, attente: 2500 });
      const r = await p.evaluate(() => ({ regle: [...document.querySelectorAll('style')].some((x) => /#menuBtn\{display:none/.test(x.textContent)),
        vu: getComputedStyle(document.querySelector('button[aria-controls="drawer"]')).display !== 'none' && document.querySelector('button[aria-controls="drawer"]').getBoundingClientRect().width > 0 }));
      ok(r.regle && r.vu, 'a ' + w + ' px, socket authentifiee (stakebubble a pose ses regles : ' + r.regle + ') : le bouton du menu reste visible');
      await p.click(MENU_BTN);
      const n = await p.$$eval('#drawer a', (l) => l.filter((a) => { const b = a.getBoundingClientRect(); if (!b.width) return false; const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return e === a || a.contains(e); }).length);
      eq(n, 9, 'et il ouvre le tiroir, ses 9 liens recoivent le clic');
      if (w === 390) ok(await p.isVisible('#drTop'), 'avec la recharge du credit, qui n a que lui sur telephone');
      await ferme(p);
    }

    /* x2 et x4 : chaque image se voit (80 % au moins) et se choisit d un appui en son centre (revue du
       13/10 : la barre du resultat couvrait la seconde rangee d un x4 et le centre d un x2). */
    for (const w of [390, 1440]) for (const nb of [2, 4]) {
      remet();
      const p = await ouvre({ session: true, largeur: w, hauteur: w > 900 ? 900 : 760, mobile: w < 900 });
      await p.click('#segN [data-n="' + nb + '"]'); await p.fill('#prompt', 'a tiny astronaut on a candy moon'); await p.click('#gen');
      await p.waitForSelector('#result.done .rgrid button', { timeout: 8000 });
      await p.evaluate(() => document.getElementById('result').scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);
      const vues = await p.evaluate(() => [...document.querySelectorAll('.rgrid button')].map((b) => { const r = b.getBoundingClientRect(); let vu = 0;
        for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) { const e = document.elementFromPoint(r.left + r.width * i / 6, r.top + r.height * j / 6); if (e && (e === b || b.contains(e))) vu++; }
        return Math.round(vu / 25 * 100); }));
      ok(vues.length === nb && vues.every((x) => x >= 80), 'x' + nb + ' a ' + w + ' px : chaque image visible a [' + vues.join(', ') + '] %');
      let choix = true;
      for (let i = 0; i < nb; i++) {
        const b = await p.$$eval('.rgrid button', (l, k) => { const r = l[k].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);
        await p.mouse.click(b.x, b.y);
        choix = choix && (await p.$$eval('.rgrid button', (l, k) => l[k].getAttribute('aria-pressed') === 'true', i));
      }
      ok(choix, 'x' + nb + ' a ' + w + ' px : un appui au centre de chaque image la choisit');
      if (nb === 4 && w === 1440) {
        await p.waitForTimeout(200);
        eq(await p.$$eval('#gal .tile img', (l) => l.length), 4, 'My work garde les quatre images payees, pas seulement la premiere');
      }
      await ferme(p);
    }

    /* De 721 a 960 px, une colonne sans barre du bas : le resultat entier passe au-dessus des bulles
       du site (revue du 13/10 : « Use as reference » finissait sous la bulle VS a 768x1000). */
    for (const [w, hh, nb] of [[768, 1000, 1], [900, 800, 1], [1440, 900, 4]]) {
      remet();
      const p = await ouvre({ session: true, largeur: w, hauteur: hh });
      if (nb > 1) await p.click('#segN [data-n="' + nb + '"]');
      await p.fill('#prompt', 'a doge'); await p.click('#gen'); await p.waitForSelector('#result.done [data-comme-ref]', { timeout: 8000 });
      await p.waitForTimeout(400);
      const r = await p.evaluate(() => { const b = document.querySelector('[data-comme-ref]').getBoundingClientRect(); const pts = [[b.left + 4, b.top + b.height / 2], [b.left + b.width / 2, b.top + b.height / 2], [b.right - 4, b.top + b.height / 2]];
        return { bulles: [...document.querySelectorAll('.swdb,.swwb')].filter((e) => e.getBoundingClientRect().height > 0).length,
          libres: pts.every(([x, y]) => { const e = document.elementFromPoint(x, y); return e && !!e.closest('[data-comme-ref]'); }) }; });
      ok(r.libres, w + 'x' + hh + (nb > 1 ? ', x' + nb : '') + ' : « Use as reference » recoit le clic sur toute sa largeur (' + r.bulles + ' bulle(s) du site a l ecran)');
      await ferme(p);
    }

    /* Le texte gris se lit : --dim2 (etiquettes, libelles de solde, prix secondaires) et le texte
       indicatif du prompt passent AA (4,5:1) sur le fond le plus fonce de la page (#EEF3FB). */
    {
      remet();
      const p = await ouvre({ session: true });
      const c = await p.evaluate(() => ({ dim2: getComputedStyle(document.querySelector('.label')).color, ph: getComputedStyle(document.getElementById('prompt'), '::placeholder').color }));
      ok(contraste(c.dim2, '#EEF3FB') >= 4.5 && contraste(c.ph, '#FFFFFF') >= 4.5, 'contraste : etiquettes ' + contraste(c.dim2, '#EEF3FB').toFixed(2) + ':1 sur #EEF3FB, texte indicatif ' + contraste(c.ph, '#FFFFFF').toFixed(2) + ':1 sur blanc');
      await ferme(p);
    }

    /* Telephone, Series & Ads sans production enregistree : la barre du bas CREE (gratuit), elle ne
       vend pas une video sans rapport (revue du 13/10 : « Generate · 10,639 $SWOGE » sous le formulaire). */
    if (PS) {
      remet();
      const p = await ouvre({ session: true, largeur: 390, hauteur: 760, mobile: true, suite: '#video' });
      await p.waitForFunction(() => !document.getElementById('pSel').disabled, null, { timeout: 8000 });
      await p.selectOption('#pSel', 'new:serie');
      await p.fill('#prompt', 'a chrome motorbike');
      await p.evaluate(() => document.getElementById('prod').scrollIntoView({ block: 'center' }));
      await p.waitForFunction(() => document.documentElement.classList.contains('serie-vue'), null, { timeout: 5000 }).catch(() => {});
      const b = await p.evaluate(() => ({ vue: document.documentElement.classList.contains('serie-vue'), btn: document.getElementById('fbBtn').textContent, inert: document.getElementById('composer').inert }));
      ok(b.vue && b.btn === 'Create series · free' && b.inert, 'la barre du bas dit « ' + b.btn + ' », sans prix, et le composeur video est inerte');
      const avant = posts().length;
      await p.click('#filmBar');
      await p.waitForFunction(() => /scene/.test(document.getElementById('boardT').textContent) && !/first/.test(document.getElementById('boardT').textContent), null, { timeout: 8000 }).catch(() => {});
      const l = posts().slice(avant);
      ok(l.length === 1 && /^\/studio\/production$/.test(l[0].chemin), 'et un appui cree la serie, gratuitement : ' + l.map((x) => x.chemin).join(', '));
      await ferme(p);
    }
  }

  console.log('\n-- 12. console, langue, cles et adresses --');
  {
    remet();
    const p = await ouvre({ session: true, suite: '?addr=' + AUTRE + '&adresse=' + AUTRE, init: [(a) => { try { localStorage.setItem('swogeAdresse', a); localStorage.setItem('walletAddress', a); } catch (e) {} }, AUTRE] });
    for (const t of ['image', 'video', 'voice', 'avatar']) {
      await p.click('.tab[data-tab="' + t + '"]', { force: true }); await p.waitForTimeout(150);
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
    /* Les promesses que le serveur ne tient pas (revue du 13/10), ni dans le texte ni dans les phrases
       du script (commentaires retires) : un redemarrage pendant une generation en $SWOGE garde la
       reserve (« never charged », « nothing if it fails ») ; le prix comprend une marge (« real cost ») ;
       rien ne mesure la moderation des fournisseurs ; une photo jointe peut montrer n importe qui ;
       l historique n est que celui de l appareil ; l image envoyee a Grok n est pas chiffree d avance. */
    const montre = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const promesses = montre.match(/never charged|nothing if it fails|real cost|always shows the current|nothing else charged|moderation refuses|no tool here puts|already in the price|keeps? (their|his) face|same faces|same characters scene after scene|doesn't publish the difference/gi) || [];
    ok(promesses.length === 0, 'aucune promesse que le serveur ne tient pas' + (promesses.length ? ' [' + [...new Set(promesses)].join(', ') + ']' : ''));
    /* Les quatre affiches du haut viennent toutes de generations : etiquetees toutes, ou aucune (avant :
       deux sur quatre, et s2_ep2, du meme commit que saga_ep6, passait pour faite a la main). */
    const affiches = (montre.match(/<figure class="art[^"]*"[^>]*>[\s\S]*?<\/figure>/g) || []).map((f) => /<em>/.test(f));
    ok(affiches.length === 4 && (affiches.every(Boolean) || !affiches.some(Boolean)), 'les quatre affiches sont traitees pareil [' + affiches.map((x) => (x ? 'etiquetee' : 'nue')).join(', ') + ']');
  }

  console.log('\n-- 13. le jeton ne part que vers le serveur ; une recharge ne signe que le montant choisi --');
  {
    remet();
    /* Un portefeuille de test : il note ce qu on lui fait signer. */
    const portefeuille = () => { window.__signe = []; window.ethereum = { request: async (a) => {
      if (a.method === 'eth_requestAccounts') return ['0x' + '11'.repeat(20)];
      if (a.method === 'wallet_switchEthereumChain') return null;
      if (a.method === 'eth_signTypedData_v4') { window.__signe.push(JSON.parse(a.params[1]).message); return '0x' + '22'.repeat(65); }
      return null; } }; };
    /* Revue du 14/10 : avec le seul `autre-hote.example`, une borne affaiblie (regex sans ^…$, test sur
       le parametre brut) passait verte alors que le jeton fuyait. Les formes qui CONTIENNENT les mots
       de la borne : aucune ne recoit rien. */
    for (const forme of ['https://localhost.' + PIEGE, 'https://127.0.0.1.' + PIEGE, 'https://' + PIEGE + '/?localhost', 'https://' + PIEGE + '#127.0.0.1']) {
      remet();
      const x = await ouvre({ session: true, suite: '?server=' + encodeURIComponent(forme), attente: 1200 });
      await x.fill('#prompt', 'a doge'); await x.click('#gen'); await x.waitForSelector('#result.done', { timeout: 8000 }).catch(() => {});
      ok(S.piege.length === 0 && S.envois.length > 2 && S.envois.every((e) => e.auth === 'Bearer ' + SESSION),
        '?server=' + forme + ' : cet hote ne recoit rien (' + S.piege.length + ' requete), le jeton ne va qu au serveur (' + S.envois.length + ' requetes)');
      await ferme(x);
    }
    remet();
    const p = await ouvre({ session: true, suite: '?server=' + encodeURIComponent('https://' + PIEGE), init: [portefeuille, null], attente: 1500 });
    await p.fill('#prompt', 'a doge'); await p.click('#gen'); await p.waitForSelector('#result.done', { timeout: 8000 }).catch(() => {});
    ok(S.piege.length === 0 && S.envois.length > 2 && S.envois.every((e) => e.auth === 'Bearer ' + SESSION),
      '?server=https://' + PIEGE + ' : cet hote ne recoit rien (' + S.piege.length + ' requete), le jeton ne va qu au serveur (' + S.envois.length + ' requetes)');
    ok(p.sockets.length > 0 && p.sockets.every((u) => !u.includes(PIEGE)), 'la socket de stakebubble non plus : ' + [...new Set(p.sockets)].join(', '));
    /* Le 402 annonce 5 000 USDC pour une recharge de 5 $ : rien n est signe. */
    S.topupMontant = 5000 * 1e6;
    await p.click('#topUp'); await p.click('#rcSign');
    await p.waitForFunction(() => /Not topped up|Done:/.test(document.getElementById('rcStatut').textContent), null, { timeout: 8000 }).catch(() => {});
    ok((await p.evaluate(() => window.__signe.length)) === 0 && /does not match the \$5\.00 you chose/.test(await p.textContent('#rcStatut')),
      'une demande de 5000 USDC pour 5 $ : rien n est signe, et la page dit pourquoi');
    eq(S.envois.filter((e) => e.chemin === '/credit/topup' && e.m === 'POST').length, 1, 'et rien ne part signe (seule la demande de prix)');
    /* Le montant + les frais de reglement du serveur (5,001 USDC sur Base) : signe, une fois. */
    S.topupMontant = null;
    await p.click('#rcSign');
    await p.waitForFunction(() => /Done:/.test(document.getElementById('rcStatut').textContent), null, { timeout: 8000 });
    const sig = await p.evaluate(() => window.__signe);
    ok(sig.length === 1 && sig[0].value === '5001000', 'le montant choisi plus les frais du serveur (5,001 USDC) : signe une fois [' + (sig[0] && sig[0].value) + ']');
    /* Un clic = UNE recharge (l intention 5, pour le bouton qui fait signer de l USDC — revue du 14/10 :
       sans `b.disabled`, un double clic signait et reglait deux recharges, essai vert). */
    {
      const t0 = S.topups.length;
      await p.dblclick('#rcSign');
      await p.evaluate(() => { const b = document.getElementById('rcSign'); b.click(); b.click(); });
      await p.waitForFunction(() => /Done:/.test(document.getElementById('rcStatut').textContent) && !document.getElementById('rcSign').disabled, null, { timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(400);
      const l = S.topups.slice(t0);
      ok((await p.evaluate(() => window.__signe.length)) === 2 && l.filter((x) => x.sig).length === 1 && l.length === 2,
        'double clic et deux clics en script sur « Sign a $5 top-up » : UNE signature de plus, une demande et UN envoi signe [' + l.map((x) => (x.sig ? 'signe' : 'demande')).join(', ') + ']');
    }
    await ferme(p);

    /* ---- APRES LA SIGNATURE, JAMAIS « NOT CHARGED » SANS LE SAVOIR ----
       Revue du 14/10 (sonde s1, 5 cas sur 5) : toute issue autre qu un 200 apres la signature disait
       « Not topped up, not charged ». Les trois issues reelles du serveur : */
    const PENDANTE = (tx) => (r) => r.fulfill({ status: 402, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'payment-required, payment-response',
        'payment-response': Buffer.from(JSON.stringify({ success: false, errorReason: 'settlement_pending', transaction: tx, network: 'eip155:8453' })).toString('base64') },
      body: JSON.stringify({ ok: false, error: 'payment pending - retry the same request with the same PAYMENT-SIGNATURE' }) });
    const suitStatut = () => { window.__st = []; new MutationObserver(() => { const t = document.getElementById('rcStatut').textContent; if (t && window.__st[window.__st.length - 1] !== t) window.__st.push(t); })
      .observe(document.getElementById('rcStatut'), { childList: true, characterData: true, subtree: true }); window.SWOGE_PAIE_DELAIS = [150]; };
    const recharge5 = async (attendu) => {
      const q = await ouvre({ session: true, init: [portefeuille, null] });
      await q.evaluate(suitStatut);
      await q.click('#topUp'); await q.click('#rcSign');
      await q.waitForFunction((re) => new RegExp(re).test(document.getElementById('rcStatut').textContent), attendu.source, { timeout: 15000 }).catch(() => {});
      return q;
    };
    /* (1) Reglement en attente : x402.js rend 402 + PAYMENT-RESPONSE, SANS PAYMENT-REQUIRED ; il ne
       credite qu au 200 et ne reconcilie que la MEME signature representee. */
    {
      remet(); let tour = 0;
      S.topupSigne = () => (++tour === 1 ? PENDANTE('0x' + 'ab'.repeat(32)) : null);
      const q = await recharge5(/Done:|charged|Payment sent - /);
      const sigs = S.topups.filter((x) => x.sig).map((x) => x.sig);
      const st = await q.evaluate(() => window.__st);
      ok((await q.evaluate(() => window.__signe.length)) === 1 && sigs.length === 2 && sigs[0] === sigs[1],
        'reglement en attente : la MEME PAYMENT-SIGNATURE est representee (' + sigs.length + ' envois signes, 1 signature du portefeuille)');
      ok(st.some((t) => /waiting for the chain - don't sign again/.test(t)) && /^Done: \$5\.00 added/.test(await q.textContent('#rcStatut')) && !st.some((t) => /not charged/i.test(t)),
        'la page dit « waiting for the chain - don\'t sign again », puis « Done » ; jamais « not charged » [' + st.join(' | ') + ']');
      await ferme(q);
    }
    /* (2) Regle mais non credite (502 de credits.js) : la phrase du serveur, sans « not charged » devant. */
    {
      remet();
      const raison = 'the payment settled but its credit could not be read - contact support with transaction 0x' + 'cd'.repeat(32);
      S.topupSigne = () => (r) => r.fulfill({ status: 502, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, raison }) });
      const q = await recharge5(/settled|charged/);
      const t = await q.textContent('#rcStatut');
      ok(t.includes(raison) && !/not charged/i.test(t), 'regle, credit illisible : « ' + t.slice(0, 90) + '… », sans « not charged »');
      await ferme(q);
    }
    /* (3) Reseau coupe apres l envoi signe : le serveur a pu regler. La page relit /credit avant de
       conclure — credite : « Done » ; rien : elle ne conclut pas, et ne fait pas signer une seconde fois. */
    {
      remet();
      S.topupSigne = () => { S.histCredit = [{ at: new Date().toISOString(), kind: 'top-up', usd: 5, what: null, tx: '0x' + 'ef'.repeat(32) }, { at: '2026-10-12T10:00:00.000Z', kind: 'top-up', usd: 5, what: null }]; S.credit = 9.2; return (r) => r.abort('connectionreset'); };
      const q = await recharge5(/Done:|charged|Payment sent - /);
      ok(/^Done: \$5\.00 added/.test(await q.textContent('#rcStatut')), 'reseau coupe, mais /credit montre la recharge : « ' + (await q.textContent('#rcStatut')) + ' »');
      await ferme(q);
      remet();
      S.topupSigne = () => (r) => r.abort('connectionreset');
      const q2 = await recharge5(/Payment sent - |charged|Done:/);
      const t = await q2.textContent('#rcStatut');
      ok(/^Payment sent/.test(t) && /don't sign again/.test(t) && !/not charged/i.test(t) && await q2.isDisabled('#rcSign'),
        'reseau coupe, /credit muet : « ' + t + ' », et le bouton reste coupe (signer encore paierait deux fois)');
      eq(S.envois.filter((e) => e.chemin === '/credit').length >= 2, true, 'la page a relu /credit avant de conclure');
      await ferme(q2);
    }
    /* (4) La meme regle sur « Sign $X and generate » (un 402 au credit). */
    {
      remet();
      S.imageRep = { status: 402, body: { ok: false, code: 402, raison: 'your dollar credit is too low for this ($0.18 is reserved while it runs, you pay only what is used)', requisUsd: 0.18, creditUsd: 0.05, payeur: 'credit' } };
      S.topupSigne = () => (r) => r.fulfill({ status: 502, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, raison: 'the payment settled but its credit could not be read - contact support with transaction 0x12' }) });
      const q = await ouvre({ session: true, init: [portefeuille, null] });
      await q.fill('#prompt', 'a doge'); await q.click('#gen');
      await q.waitForSelector('[data-r-signe]'); await q.click('[data-r-signe]');
      await q.waitForFunction(() => /settled/.test(document.getElementById('resStage').textContent), null, { timeout: 10000 }).catch(() => {});
      const t = await q.textContent('#resStage .rstat').catch(() => '');
      ok(/the payment settled/.test(t) && !/not charged/i.test(t), '« Sign $0.13 and generate », regle non lu : « ' + t.slice(0, 80) + '… », sans « not charged »');
      eq(posts(/\/studio\/media\/image$/).length, 1, 'et la generation ne repart pas sans credit confirme');
      await ferme(q);
    }
    /* Avant la signature (le portefeuille refuse) : la, et la seulement, « not charged ». */
    {
      remet();
      const refuse = () => { window.ethereum = { request: async (a) => { if (a.method === 'eth_requestAccounts') return ['0x' + '11'.repeat(20)]; if (a.method === 'eth_signTypedData_v4') { const e = new Error('User rejected the request.'); e.code = 4001; throw e; } return null; } }; };
      const q = await ouvre({ session: true, init: [refuse, null] });
      await q.click('#topUp'); await q.click('#rcSign');
      await q.waitForFunction(() => /charged/.test(document.getElementById('rcStatut').textContent), null, { timeout: 8000 }).catch(() => {});
      const t = await q.textContent('#rcStatut');
      ok(/^Not topped up, not charged: User rejected/.test(t) && !(await q.isDisabled('#rcSign')), 'signature refusee : « ' + t + ' », et le bouton revient');
      await ferme(q);
    }
  }

  console.log('\n-- 14. le prix suit le serveur : relu chaque minute, et juste avant un envoi --');
  if (!Med) console.log('  (depot du serveur absent : partie sautee)');
  else {
    remet();
    const cours0 = COURS, cours1 = 0.03 / 1073, cours2 = cours1 / 2;
    const p = await ouvre({ session: true, horloge: true });
    await p.click('[data-pay="swoge"]');
    eq(await prixBouton(p), '~' + nombre(catAu(cours0).image.fournisseurs[0].modeles[0].parImageSwoge) + ' $SWOGE', 'au chargement : le prix $SWOGE du cours du moment');
    /* Le cours du soir du 12/10 (1 073 $SWOGE l image Speed contre 710 le matin). */
    S.cat = catAu(cours1);
    await p.clock.fastForward(61000); await p.waitForTimeout(400);
    eq(await prixBouton(p), '~' + nombre(S.cat.image.fournisseurs[0].modeles[0].parImageSwoge) + ' $SWOGE', 'le cours change, une minute passe : le bouton suit, page inchangee');
    /* Le cours change encore, et l horloge saute sans que la minute ait sonne (onglet en veille) : le clic relit d abord. */
    S.cat = catAu(cours2);
    const t = await p.evaluate(() => Date.now());
    await p.clock.setSystemTime(t + 61000);
    const lu = S.catLectures;
    await p.fill('#prompt', 'a doge'); await p.click('#gen');
    await p.waitForFunction(() => /price just changed/.test(document.getElementById('toast').textContent), null, { timeout: 5000 }).catch(() => {});
    ok(S.catLectures > lu && posts(/\/studio\/media\/image$/).length === 0, 'catalogue de plus de 60 s au clic, prix change : le catalogue est relu et RIEN ne part');
    eq(await prixBouton(p), '~' + nombre(S.cat.image.fournisseurs[0].modeles[0].parImageSwoge) + ' $SWOGE', 'le bouton montre le nouveau prix');
    await p.click('#gen'); await p.waitForSelector('#result.done', { timeout: 8000 });
    eq(posts(/\/studio\/media\/image$/).length, 1, 'le second clic, au prix affiche, part');
    ok(/reads them again every minute and just before each generation/.test(await p.textContent('footer')), 'le pied de page dit ce que la page fait, sans « always »');
    await ferme(p);
  }

  console.log('\n-- 15. le menu de la page est le menu commun --');
  {
    remet();
    ok(!!MENU, 'le menu commun se lit dans nav_liens.test.js');
    const p = await ouvre({ session: true });
    const barre = await p.$$eval('div.nav a', (l) => l.map((a) => a.getAttribute('href')).join(','));
    const tiroir = await p.$$eval('#drawer a', (l) => l.map((a) => a.getAttribute('href')).join(','));
    eq(barre, MENU, 'la barre du haut porte le menu commun, dans l ordre');
    eq(tiroir, MENU, 'le tiroir aussi');
    ok(await p.$eval('div.nav a[aria-current="page"]', (a) => a.getAttribute('href') === 'studio.html') && await p.$eval('#drawer a[aria-current="page"]', (a) => a.getAttribute('href') === 'studio.html'), 'Studio y est la page courante');
    await ferme(p);
  }

  console.log('\n-- 16. ce qui n est plus au serveur est dit ; une video appartient au compte qui l a payee --');
  {
    /* La session change de compte pendant le suivi : on ne demande RIEN avec l autre jeton, et la
       video reste notee ; revenu sur le bon compte, elle arrive. */
    remet(); S.pollsBloques = true;
    const p = await ouvre({ session: true, suite: '#video' });
    await p.fill('#prompt', 'a doge in the rain'); await p.click('#gen');
    await p.waitForFunction(() => /Rendering/.test(document.getElementById('resStage').textContent), null, { timeout: 8000 });
    await p.evaluate((j) => localStorage.setItem('swogeSession', j), SESSION_AUTRE);
    await p.waitForTimeout(4500);
    const note = await p.evaluate(() => JSON.parse(localStorage.getItem('swogeStudioEnCours') || 'null'));
    ok(!S.envois.some((e) => /\/studio\/media\/video\/v1$/.test(e.chemin) && e.auth === 'Bearer ' + SESSION_AUTRE) && note && note.id === 'v1' && note.adresse === ADDR,
      'autre compte : aucune demande de la video avec son jeton, et la note reste (adresse ' + (note && note.adresse) + ')');
    S.pollsBloques = false;
    await p.evaluate((j) => localStorage.setItem('swogeSession', j), SESSION);
    await p.waitForSelector('#result.done video', { timeout: 15000 }).catch(() => {});
    ok(/^https:\/\/vidgen\.x\.ai\/v1\.mp4/.test((await p.getAttribute('#resStage video', 'src').catch(() => '')) || ''), 'revenu sur le compte qui a paye : la video arrive');
    await ferme(p);

    /* Le serveur ne connait plus la video (une heure apres sa fin, ou un redemarrage) : la page le
       dit, l historique le garde, et rien n affirme qu elle n a pas ete facturee. */
    remet(); S.video404 = true;
    const q = await ouvre({ session: true, suite: '#video' });
    await q.fill('#prompt', 'a doge on a bike'); await q.click('#gen');
    await q.waitForFunction(() => /no longer on the server/.test(document.getElementById('resStage').textContent), null, { timeout: 8000 });
    const txt = await q.textContent('#resStage');
    ok(/If it was charged, your balance shows it/.test(txt) && !/not charged/i.test(txt), 'video oubliee du serveur : dit, sans pretendre a un remboursement');
    ok(/a doge on a bike/.test(await q.textContent('#hist')) && /Not on the server any more/.test(await q.textContent('#hist')), 'et l historique en garde la ligne');
    ok(!(await q.evaluate(() => localStorage.getItem('swogeStudioEnCours'))), 'la note de reprise est levee');
    await ferme(q);

    /* Une video notee il y a deux heures (le joueur revient tard) : avant, la page l effacait sans un mot
       passe 65 min, alors qu elle avait pu etre finie et facturee. Elle DEMANDE au serveur ; il ne l a
       plus : la page le dit, et l historique le garde. */
    remet();
    const vieille = await ouvre({ session: true, suite: '#video', init: [(o) => { try { if (!sessionStorage.getItem('enc')) { o.t = Date.now() - 2 * 3600 * 1000; localStorage.setItem('swogeStudioEnCours', JSON.stringify(o)); sessionStorage.setItem('enc', '1'); } } catch (e) {} },
      { rid: 'vieille123', id: 'vold', genre: 'video', prompt: 'a doge from two hours ago', nom: 'Grok Imagine Video · Speed · 6 s', adresse: ADDR }] });
    await vieille.waitForFunction(() => /no longer on the server/.test(document.getElementById('resStage').textContent), null, { timeout: 8000 }).catch(() => {});
    ok(S.envois.some((e) => e.chemin === '/studio/media/video/vold') && /no longer on the server/.test(await vieille.textContent('#resStage'))
      && /a doge from two hours ago/.test(await vieille.textContent('#hist')) && /Not on the server any more/.test(await vieille.textContent('#hist')),
      'une note de deux heures : la page demande au serveur, dit ce qu il repond, et l historique en garde la ligne');
    await ferme(vieille);

    /* Un refus du CREDIT retrouve par la reprise (sans la demande d origine) : titre et boutons du credit. */
    remet();
    S.reprise.credit402 = { ok: false, status: 'failed', code: 402, payeur: 'credit', requisUsd: 0.18, creditUsd: 0.05, raison: 'your dollar credit is too low for this ($0.18 is reserved while it runs, you pay only what is used)' };
    const r = await ouvre({ session: true, init: [(o) => { try { if (!sessionStorage.getItem('enc')) { localStorage.setItem('swogeStudioEnCours', JSON.stringify(o)); sessionStorage.setItem('enc', '1'); } } catch (e) {} },
      { rid: 'credit402', genre: 'image', prompt: 'a reprised doge', nom: 'Grok Imagine · Speed · ×1', n: 1, payeur: 'credit', t: Date.now(), adresse: ADDR }] });
    await r.waitForSelector('#result.err', { timeout: 8000 });
    const e = await r.evaluate(() => ({ titre: document.querySelector('#resStage b').textContent, btns: [...document.querySelectorAll('#resStage .rbtn')].map((b) => b.textContent) }));
    ok(e.titre === 'Not enough credit' && e.btns.includes('Top up') && !e.btns.some((x) => /Get \$SWOGE|Pay with dollar credit/.test(x)),
      'reprise d un refus du credit : « ' + e.titre + ' », boutons [' + e.btns.join(', ') + ']');
    await r.click('[data-r-recharge]');
    ok(await r.isVisible('#rc'), '« Top up » ouvre la recharge');
    await ferme(r);
  }

  console.log('\n-- 17. ce qui se voit dit vrai : « Soon » au telephone, l image choisie, un lien expire --');
  {
    /* Un pixel de l ECRAN (pas une classe) : la capture d un point, lue dans un canevas. */
    const pixel = async (p, x, y) => {
      const b = await p.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
      return p.evaluate((u) => new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.drawImage(i, 0, 0); ok([...g.getImageData(0, 0, 1, 1).data].slice(0, 3)); }; i.src = u; }), 'data:image/png;base64,' + b.toString('base64'));
    };
    const bleu = (c) => Math.abs(c[0] - 0x1B) < 30 && Math.abs(c[1] - 0x5F) < 30 && Math.abs(c[2] - 0xE0) < 30;
    for (const w of [390, 1440]) {
      remet();
      const p = await ouvre({ session: true, largeur: w, hauteur: w > 900 ? 900 : 760, mobile: w < 900 });
      /* Revue du 14/10 : sous 720 px, « Soon » etait cache, les quatre onglets se lisaient comme quatre outils en service. */
      const t = await p.$$eval('.tab[data-tab="voice"], .tab[data-tab="avatar"]', (l) => l.map((b) => { const s = b.querySelector('.soon'), r = s.getBoundingClientRect();
        return { txt: b.innerText.replace(/\s+/g, ' '), vu: getComputedStyle(s).display !== 'none' && r.width > 0 && r.height > 0, dis: b.getAttribute('aria-disabled') }; }));
      ok(t.every((x) => /Soon/i.test(x.txt) && x.vu && x.dis === 'true'), 'a ' + w + ' px : Voice et Avatar portent « Soon », visible, et aria-disabled [' + t.map((x) => x.txt).join(' / ') + ']');
      /* Revue du 14/10 : l anneau du choix, en box-shadow du bouton, etait couvert par l image : aucun pixel ne changeait. */
      await p.click('#segN [data-n="4"]'); await p.fill('#prompt', 'four doges'); await p.click('#gen');
      await p.waitForSelector('#result.done .rgrid button', { timeout: 8000 });
      await p.evaluate(() => document.getElementById('result').scrollIntoView({ block: 'center' })); await p.waitForTimeout(250);
      const bord = (k) => p.$$eval('.rgrid button', (l, i) => { const r = l[i].getBoundingClientRect(); return { x: r.left + 1.5, y: r.top + r.height / 2 }; }, k);
      const b0 = await bord(0), b2 = await bord(2);
      const avant = [await pixel(p, b0.x, b0.y), await pixel(p, b2.x, b2.y)];
      const c2 = await p.$$eval('.rgrid button', (l) => { const r = l[2].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await p.mouse.click(c2.x, c2.y); await p.waitForTimeout(200);
      const apres = [await pixel(p, b0.x, b0.y), await pixel(p, b2.x, b2.y)];
      const tick = await p.$$eval('.rgrid button', (l) => l.map((b) => { const t = b.querySelector('.tick'); return !!t && getComputedStyle(t).display !== 'none'; }));
      ok(bleu(avant[0]) && !bleu(avant[1]) && !bleu(apres[0]) && bleu(apres[1]) && tick[2] && !tick[0],
        'a ' + w + ' px, x4 : l anneau bleu se voit a l ecran sur l image choisie, et suit l appui (bord de l image 1 : ' + avant[0] + ' -> ' + apres[0] + ' ; image 3 : ' + avant[1] + ' -> ' + apres[1] + '), avec sa coche');
      await ferme(p);
    }
    /* Revue du 14/10 (sonde s13) : un lien expire montrait l icone d image cassee et le prompt brut sous
       les pastilles 1/2, et la tuile restait un lien mort. */
    for (const w of [390, 1440]) {
      remet();
      const vieux = Date.now() - 4 * 86400000;
      const histo = [{ genre: 'image', prompt: 'SWOGE flexing on a golden barbell in a neon gym at midnight', nom: 'Grok Imagine · Speed · ×2', urls: ['https://imgen.x.ai/expire1.png', 'https://imgen.x.ai/expire2.png'], statut: 'done', payeur: 'credit', usd: 0.06, t: vieux }];
      const p = await ouvre({ session: true, largeur: w, hauteur: w > 900 ? 900 : 760, mobile: w < 900, attente: 1200,
        init: [(o) => { try { localStorage.setItem(o.k, JSON.stringify(o.l)); } catch (e) {} }, { k: 'swogeStudioHisto:' + ADDR, l: histo }] });
      await p.waitForFunction(() => document.querySelectorAll('#gal .perime').length === 2, null, { timeout: 5000 }).catch(() => {});
      const r = await p.evaluate(() => ({ perimes: [...document.querySelectorAll('#gal .tile')].map((a) => ({ lien: a.getAttribute('href'), txt: a.innerText.replace(/\s+/g, ' '), mort: a.classList.contains('mort') })),
        cassees: [...document.querySelectorAll('#gal img, #hist img')].filter((i) => i.complete && i.naturalWidth === 0).length,
        histo: !!document.querySelector('#hist .hth.perime-h') }));
      /* (les scenes de Series & Ads deja filmees par l essai 10 y entrent aussi : le faux hote video rend un corps vide) */
      ok(r.perimes.length >= 2 && r.perimes.every((x) => x.mort && !x.lien && /^Link expired/.test(x.txt) && !/golden barbell/.test(x.txt)) && r.cassees === 0 && r.histo,
        'a ' + w + ' px, lien expire : « Link expired » avec sa date, plus de lien mort ni d image cassee, le prompt ne deborde plus [' + r.perimes.map((x) => x.txt).join(' / ') + ']');
      await ferme(p);
    }
  }

  ok(erreurs.length === 0, 'aucune erreur dans la console' + (erreurs.length ? ' : ' + [...new Set(erreurs)].slice(0, 5).join(' | ') : ''));
  await nav.close();
  await new Promise((s) => srv.close(s));
  if (dossier) fs.rmSync(dossier, { recursive: true, force: true });
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); if (erreurs.length) console.error('erreurs de la page : ' + erreurs.join(' | ')); process.exit(1); });
