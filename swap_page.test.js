'use strict';
/* ============================================================================
 * SWOGE SWAP, LA PAGE PUBLIQUE — studio.html#swap (15/10/2026 soir ; avant : swoge_cinema.html)
 *
 * L'intention de cet essai n'a pas change : la page publique de SWOGE Swap MONTRE et ENVOIE, le
 * serveur decide (prix, credit, droits, porte des images) ; rien n'est demande trop tot ; la video
 * part brute avec la case ; seul ce qu'il faut repart au lancement ; le resultat se lit avec la
 * session ; pas de defilement en largeur. Ce qui a change : la section vit dans le Studio, au
 * design du haut de la page, et suit le chemin valide par le proprietaire — une IMAGE d'abord
 * (apercu OpenAI du serveur), puis l'animation. Le serveur est simule par page.route.
 *
 *   1. Cinema : le cadre SWOGE Swap est parti (ni champ, ni recharge, ni scripts de paiement) ;
 *      un lien propre mene a studio.html#swap.
 *   2. Studio, deconnecte : la section, ses trois etapes, en anglais ; rien n'est demande au
 *      serveur avant qu'elle approche de l'ecran ; le bouton ouvre la connexion de la page.
 *   3. Connecte : les bornes du serveur ; une video trop grosse refusee AVANT envoi ; sans la case
 *      rien ne part ; avec : la video BRUTE (octet pour octet), ?mode=anime, x-swap-rights, le
 *      jeton, aucune adresse.
 *   4. Le plan : « Create preview » ferme tant que la cible manque ; le prix du serveur sur le
 *      bouton ; credit trop bas : « Top up » et la recharge de la page.
 *   5. L'apercu : POST { personnage, cible } et rien d'autre ; « Redrawing… » puis l'image lue
 *      AVEC la session (blob:) ; Regenerate (prix affiche) ; deux apercus : la bande pour choisir.
 *   6. Le personnage du joueur : l'image part BRUTE a /studio/swap/image, « Checking… », puis
 *      « Accepted » ou le refus du serveur tel quel ; l'apercu n'envoie que le sha256 ; « Describe… ».
 *   7. « Use this picture » puis « Animate — $x » : POST { apercu, resolution, confirmeUsd } ;
 *      1080p change le prix ; la fin : la video en blob, « Download ».
 *   8. Reprise apres rechargement (apercu pret, video finie) ; 320, 390 et 1280 px sans
 *      defilement en largeur ; aucune erreur dans la page.
 * SHOTS=<dossier> : captures de la section a 1280 et 390 px.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.css': 'text/css' };
const ID = 'a'.repeat(24), SHA = 'b'.repeat(64);
const SHOTS = process.env.SHOTS || null;

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'swap-page-'));
  const F = { video: path.join(dossier, 'clip.mp4'), gros: path.join(dossier, 'gros.mp4'), perso: path.join(dossier, 'perso.png'), reel: path.join(dossier, 'reel.png') };
  const VIDEO = Buffer.from(Array.from({ length: 300000 }, (_, i) => (i * 37) & 255));
  fs.writeFileSync(F.video, VIDEO);
  fs.writeFileSync(F.gros, Buffer.alloc(3 * 1024 * 1024, 1));
  const PERSO = fs.readFileSync(path.join(SITE, 'img/site/icone-180.png'));
  fs.writeFileSync(F.perso, PERSO);
  const REEL = Buffer.concat([PERSO, Buffer.from('reel')]);
  fs.writeFileSync(F.reel, REEL);
  /* l'apercu « rendu par OpenAI » : l'image ChatGPT du proprietaire (SWOGE dans l'epicerie) */
  const APERCU = fs.readFileSync(path.join(SITE, 'img/site/swoge_epicerie_still.jpg'));
  const FILM = (() => { try { return fs.readFileSync(path.join(SITE, 'media/doge_sport.mp4')); } catch (e) { return VIDEO; } })();

  /* ---- le faux serveur ---- */
  const journal = [];
  const CIBLES = [{ id: 'gauche', nom: 'The person on the left' }, { id: 'centre', nom: 'The person in the center' }, { id: 'droite', nom: 'The person on the right' }, { id: 'seule', nom: 'The only person in the video' }];
  const VUE = { ok: true, actif: true, dureeMinS: 3, dureeMaxS: 60, octetsMax: 2 * 1048576, resolution: '720p', resolutions: ['720p', '1080p'], prixParSecondeUsd: 0.252,
    imagesMax: 2, imageOctetsMax: 6 * 1048576, imageTypes: ['image/jpeg', 'image/png', 'image/webp'], verificationImages: true, clipMaxS: 10, gardeH: 48,
    droitsTexte: 'I own this video or have the right to use it, and it shows no one who did not agree to it.', cibles: CIBLES, cibleRequise: true,
    personnages: [{ id: 'swoge', nom: 'SWOGE', vignette: '/img/site/swoge_meme_ref.jpg' }], apercu: { actif: true, prixUsd: 1.13, max: 6, quiMax: 80 } };
  const S = { passe: null, credit: 10, etat: null, apercus: [], images: [], prochain: null };
  const etat = (statut, o) => Object.assign({ ok: true, id: ID, statut, message: null, source: { duree: 8, largeur: 720, hauteur: 1280, fps: 30, son: true }, fps: 30,
    morceaux: [{ i: 0, debut: 0, duree: 8, statut: statut === 'pret' ? 'planned' : statut === 'fini' ? 'done' : 'processing', message: null, essais: 0, rejouable: false, relanceGratuite: false }],
    anime: { clip: true, sequentiel: true }, prixUsd: 2.02, prixUsdParResolution: { '720p': 2.02, '1080p': 2.69 }, video: null, droits: true, file: null, paiement: null, choix: null }, o || {});
  const vueApercu = () => ({ cle: 'swap_' + ID, cotes: '720x1280', max: 6, enCours: S.apercus.some((c) => c.statut === 'making'), candidats: S.apercus });
  function route(q, url) {
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    let corps = null; try { corps = JSON.parse(q.postData() || 'null'); } catch (e) {}
    journal.push({ m: q.method(), chemin: url.pathname, recherche: url.search, auth, corps, brut: q.postDataBuffer(), type: q.headers()['content-type'], droits: q.headers()['x-swap-rights'] });
    if (url.pathname === '/studio/swap' && q.method() === 'GET') return [200, Object.assign({}, VUE, { connecte: auth === 'jJoueur', passe: auth === 'jJoueur' ? S.passe : null, passeAnime: auth === 'jJoueur' ? S.passe : null })];
    if (auth !== 'jJoueur') return [401, { ok: false, raison: 'sign in with your wallet first' }];
    if (url.pathname === '/credit' && q.method() === 'GET') return [200, { ok: true, balanceUsd: S.credit, limits: { minUsd: 0.1, maxUsd: 50 }, networks: { base: true, solana: true }, history: [] }];
    if (url.pathname === '/studio/swap' && q.method() === 'POST') { S.passe = ID; S.etat = etat('decoupe'); S.prochain = etat('pret'); return [200, { ok: true, id: ID, statut: 'decoupe' }]; }
    if (url.pathname === '/studio/swap/image' && q.method() === 'POST') { const b = q.postDataBuffer(); return b && b.equals(PERSO) ? [200, { ok: true, id: SHA, accepte: true }] : [422, { ok: false, raison: 'This looks like a photo of a real person. SWOGE Swap only puts characters in videos — mascots, NFTs, pets, drawings, 3D or game characters — never a real person\'s face.' }]; }
    if (url.pathname === '/studio/swap/' + ID && q.method() === 'GET') { const o = S.etat; if (S.prochain) { S.etat = S.prochain; S.prochain = null; } return [200, o]; }
    if (url.pathname === '/studio/swap/' + ID + '/apercu' && q.method() === 'POST') {
      if (S.credit < 1.13) return [402, { ok: false, raison: 'your dollar credit is too low: $1.13 needed' }];
      S.apercus.forEach((c) => { if (c.statut === 'making') c.statut = 'ready'; });
      S.apercus.push({ k: S.apercus.length, statut: 'making', cible: corps.cible, decrit: corps.qui || null, personnage: corps.image ? 'libre' : 'swoge', prixUsd: 1.13, factureUsd: null, message: null });
      return [200, { ok: true, apercu: vueApercu() }];
    }
    if (url.pathname === '/studio/swap/' + ID + '/apercu' && q.method() === 'GET') {
      const v = vueApercu();
      S.apercus.forEach((c) => { if (c.statut === 'making') { c.statut = 'ready'; c.factureUsd = 0.47; } });
      return [200, { ok: true, apercu: v }];
    }
    if (url.pathname === '/studio/swap/' + ID + '/lance' && q.method() === 'POST') { S.etat = etat('en_cours', { choix: { apercu: corps.apercu, cible: 'gauche', personnage: 'swoge' }, resolution: corps.resolution, paiement: { reserveUsd: corps.confirmeUsd } }); return [200, S.etat]; }
    if (url.pathname === '/studio/swap/' + ID + '/abandonne' && q.method() === 'POST') return [200, etat('abandon', { message: 'cancelled — you were fully refunded' })];
    return [404, { ok: false, raison: 'unknown' }];
  }
  const ouvre = async ({ largeur, connecte, page, hash } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1280, height: 900 } });
    await ctx.addInitScript(() => { window.WebSocket = function(){ return { addEventListener(){}, removeEventListener(){}, send(){}, close(){}, readyState: 0 }; }; });
    if (connecte !== false) await ctx.addInitScript(() => { try { localStorage.setItem('swogeSession', 'jJoueur'); } catch (e) {} });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { journal.push({ erreurPage: String(e) }); });
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const q = r.request(), u = new URL(q.url());
      const auth = String(q.headers().authorization || '');
      if (/^\/studio\/swap\/[0-9a-f]{24}\/apercu\/\d+$/.test(u.pathname) && q.method() === 'GET') {
        journal.push({ m: 'GET', chemin: u.pathname, auth: auth.replace(/^Bearer /, '') });
        return auth === 'Bearer jJoueur' ? r.fulfill({ status: 200, contentType: 'image/jpeg', body: APERCU }) : r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
      }
      if (u.pathname === '/studio/swap/' + ID + '/video') {
        journal.push({ m: 'GET', chemin: u.pathname, auth: auth.replace(/^Bearer /, '') });
        return auth === 'Bearer jJoueur' ? r.fulfill({ status: 200, contentType: 'video/mp4', body: FILM }) : r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
      }
      if (/^\/studio\/swap(\/|$)/.test(u.pathname) || u.pathname === '/credit') {
        const [code, o] = route(q, u);
        if (u.pathname === '/studio/swap/image') return new Promise((s) => setTimeout(s, 600)).then(() => r.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(o) }));
        return r.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(o) });
      }
      return r.abort();
    });
    await p.goto('http://127.0.0.1:' + port + '/' + (page || 'studio.html') + (hash || ''), { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    return p;
  };
  const appels = (chemin, m) => journal.filter((x) => x.chemin === chemin && (!m || x.m === m));
  const attend = (p, f, arg, ms) => p.waitForFunction(f, arg, { timeout: ms || 15000 }).catch(() => {});
  const debord = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const texteGo = (p) => p.evaluate(() => [].filter.call(document.querySelectorAll('#sxGo span'), (x) => !x.hidden && x.textContent).map((x) => x.textContent).join(' '));
  /* la capture : la fenetre agrandie a la hauteur de la section (les elements fixes du site restent en bas) */
  const capture = async (p, nom) => {
    if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true });
    const vp = p.viewportSize(); const hs = await p.$eval('#swap', (s) => Math.ceil(s.getBoundingClientRect().height));
    await p.setViewportSize({ width: vp.width, height: Math.max(vp.height, hs + 120) });
    await p.$eval('#swap', (s) => s.scrollIntoView({ block: 'center' })); await p.waitForTimeout(400);
    await (await p.$('#swap')).screenshot({ path: path.join(SHOTS, nom) });
    await p.setViewportSize(vp);
  };

  console.log('-- 1. Cinema : le cadre est parti, un lien propre --');
  {
    const c = await ouvre({ page: 'swoge_cinema.html', connecte: false });
    const html = fs.readFileSync(path.join(SITE, 'swoge_cinema.html'), 'utf8');
    ok(!(await c.$('#swap')) && !(await c.$('#swFichier')) && !/studio\/swap|x402_paie\.js|credit_depot\.js|swq-/.test(html), 'plus de section Swap, de champ, de recharge ni de script de paiement sur Cinema');
    const liens = await c.$$eval('a[href="studio.html#swap"]', (l) => l.map((a) => a.textContent.trim()));
    ok(liens.length >= 2 && liens.every((t) => /SWOGE/.test(t) && !/[éèàç]/.test(t)), 'un lien du heros et une carte menent a studio.html#swap ' + JSON.stringify(liens));
    ok(appels('/studio/swap').length === 0, 'Cinema ne parle plus au serveur de Swap');
    ok(await debord(c) <= 0, 'Cinema : pas de defilement en largeur');
    await c.context().close();
  }

  console.log('\n-- 2. Studio, deconnecte --');
  const p0 = await ouvre({ connecte: false });
  ok(await p0.$eval('#sxTitre', (e) => e.textContent) === 'Put SWOGE in any video.' && (await p0.$$('#swap .sx-step')).length === 3 && await p0.$eval('#swap .eyebrow', (e) => e.textContent.trim()) === 'SWOGE Swap',
     'la section : pastille « SWOGE Swap », titre, trois etapes');
  ok(await p0.$eval('.versswap a', (a) => a.getAttribute('href')) === '#swap', 'le lien du heros du Studio mene a la section');
  ok(appels('/studio/swap').length === 0, 'rien n est demande au serveur de Swap tant que la section est loin de l ecran');
  await p0.$eval('#swap', (s) => s.scrollIntoView());
  await attend(p0, () => /3 to 60 s/.test(document.getElementById('sxBornes').textContent));
  const g0 = appels('/studio/swap', 'GET')[0] || {};
  ok(g0.auth === '' && /3 to 60 s · up to 2 MB/.test(await p0.textContent('#sxBornes')), 'a l approche : GET /studio/swap sans jeton ; les bornes du serveur');
  ok(await texteGo(p0) === 'Sign in to start' && await p0.isEnabled('#sxGo'), 'deconnecte : « Sign in to start »');
  await p0.evaluate(() => { window.__con = 0; window.swogeStudio.ouvreConnexion = function(){ window.__con++; }; });
  await p0.click('#sxGo');
  ok(await p0.evaluate(() => window.__con) === 1 && appels('/studio/swap', 'POST').length === 0, 'le clic ouvre la connexion de la page, rien n est envoye');
  const txt = await p0.textContent('#swap');
  ok(!/[éèàçù]|\b(la|le|les|une|des|vidéo)\b/i.test(txt) && /never a real person's face/.test(txt) && /Made with SWOGE AI/.test(txt), 'tout en anglais ; la regle des personnages et la marque dites');
  await p0.context().close();

  console.log('\n-- 3. connecte : la video, la case --');
  const p = await ouvre({ hash: '#swap' });
  await attend(p, () => /3 to 60 s/.test(document.getElementById('sxBornes').textContent));
  ok(appels('/studio/swap', 'GET').some((x) => x.auth === 'jJoueur') && appels('/credit', 'GET').length >= 1, 'avec #swap : la vue et le credit lus tout de suite, avec le jeton');
  ok(await p.isDisabled('#sxGo') && /Choose a video and tick the box/.test(await p.textContent('#sxGoNote')), 'sans video : « Create preview » ferme, la phrase le dit');
  await p.setInputFiles('#sxFichier', F.gros);
  await attend(p, () => !document.getElementById('sxErr').hidden);
  ok(/3\.0 MB — 2 MB at most/.test(await p.textContent('#sxErr')) && appels('/studio/swap', 'POST').length === 0, 'une video de 3 Mo : refusee dans la page, rien envoye');
  await p.setInputFiles('#sxFichier', F.video);
  await p.waitForTimeout(300);
  ok(appels('/studio/swap', 'POST').length === 0 && /Tick the box/.test(await p.textContent('#sxGoNote')), 'video choisie sans la case : rien ne part');
  await p.check('#sxDroits');
  await attend(p, () => !document.getElementById('sxEtape2').classList.contains('off'));
  const post = appels('/studio/swap', 'POST')[0] || {};
  ok(post.recherche === '?mode=anime' && post.type === 'video/mp4' && post.droits === 'yes' && post.auth === 'jJoueur' && post.brut && post.brut.equals(VIDEO), 'la video BRUTE (octet pour octet), ?mode=anime, x-swap-rights: yes, le jeton');
  ok(!journal.some((x) => x.corps && /0x[0-9a-f]{40}/i.test(JSON.stringify(x.corps))), 'aucune adresse dans aucun corps');

  console.log('\n-- 4. le plan, la cible, le credit --');
  ok(await p.isDisabled('#sxDroits') && /720×1280/.test(await p.textContent('#sxFichierInfo')) && await p.$eval('#sxEtape1', (e) => e.classList.contains('fait')), 'etape 1 faite : la case figee, les cotes du serveur');
  const cibles = await p.$$eval('#sxCibles button', (l) => l.map((b) => b.textContent));
  ok(JSON.stringify(cibles) === JSON.stringify(['Left', 'Center', 'Right', 'Only person', 'Describe…']) && await p.$$eval('#sxCibles [aria-pressed="true"]', (l) => l.length) === 0, 'qui remplacer : les quatre positions du serveur et « Describe… », aucune pre-choisie');
  ok(await p.isDisabled('#sxGo') && /Pick who to replace/.test(await p.textContent('#sxGoNote')) && /Create preview · up to \$1\.13/.test(await texteGo(p)), '« Create preview · up to $1.13 » ferme tant que la cible manque');
  S.credit = 0.5;
  await p.evaluate(() => window.dispatchEvent(new CustomEvent('swoge:studio-credit', { detail: { credit: 0.5 } })));
  await p.click('#sxCibles [data-cible="gauche"]');
  ok(await texteGo(p) === 'Top up to continue' && !(await p.isHidden('#sxCr')) && /\$0\.50 — this needs \$1\.13/.test(await p.textContent('#sxCrTxt')), 'credit de 0,50 $ : « Top up to continue », le manque dit');
  await p.evaluate(() => { window.__rc = 0; window.swogeStudio.ouvreRecharge = function(){ window.__rc++; }; });
  await p.click('#sxGo');
  ok(await p.evaluate(() => window.__rc) === 1 && appels('/studio/swap/' + ID + '/apercu', 'POST').length === 0, 'le clic ouvre la recharge de la page ; aucun apercu demande');
  S.credit = 10;
  await p.evaluate(() => window.dispatchEvent(new CustomEvent('swoge:studio-credit', { detail: { credit: 10 } })));
  ok(await p.isEnabled('#sxGo') && /Create preview · up to \$1\.13/.test(await texteGo(p)) && /you pay what the picture really costs/.test(await p.textContent('#sxGoNote')), 'credit de 10 $ : « Create preview · up to $1.13 » ouvert, la facture expliquee');
  if (SHOTS) await capture(p, 'studio_swap_1280_plan.png');

  console.log('\n-- 5. l apercu --');
  await p.click('#sxGo');
  await attend(p, () => /Redrawing the first frame/.test(document.getElementById('sxScene').textContent), null, 4000);
  const ap = appels('/studio/swap/' + ID + '/apercu', 'POST')[0] || {};
  ok(JSON.stringify(ap.corps) === JSON.stringify({ cible: 'gauche', personnage: 'swoge' }) && ap.auth === 'jJoueur', 'POST …/apercu { cible: gauche, personnage: swoge } et rien d autre');
  await attend(p, () => { const i = document.querySelector('#sxScene img'); return i && /^blob:/.test(i.src) && i.complete && i.naturalWidth > 0; });
  ok(await p.$eval('#sxScene img', (i) => /^blob:/.test(i.src) && i.naturalWidth > 0) && appels('/studio/swap/' + ID + '/apercu/0', 'GET').every((x) => x.auth === 'jJoueur'), 'l apercu pret : l image lue AVEC la session (blob:)');
  const acts = await p.$$eval('#sxActs button', (l) => l.map((b) => [].map.call(b.querySelectorAll('span'), (x) => x.textContent).join(' ')));
  ok(acts.length === 2 && acts[0] === 'Use this picture' && /^Regenerate · up to \$1\.13$/.test(acts[1]) && /This picture cost \$0\.47/.test(await p.textContent('#sxFoot')), 'Regenerate (prix affiche) et « Use this picture » ; le cout facture dit');
  if (SHOTS) await capture(p, 'studio_swap_1280_apercu.png');
  await p.click('#sxActs [data-acte="regenere"]');
  await attend(p, () => document.querySelectorAll('#sxCands button').length === 2 && document.querySelectorAll('#sxCands img').length === 2);
  ok(appels('/studio/swap/' + ID + '/apercu', 'POST').length === 2 && await p.$$eval('#sxCands button', (l) => l.length) === 2, 'Regenerate : un second apercu ; la bande montre les deux');
  await p.click('#sxCands [data-k="0"]');
  ok(await p.$eval('#sxCands [data-k="0"]', (b) => b.getAttribute('aria-pressed')) === 'true' && /Preview 1/.test(await p.textContent('#sxScene')), 'la bande : l apercu 1 se choisit pour le regarder');

  console.log('\n-- 6. le personnage du joueur, Describe --');
  await p.setInputFiles('#sxMienFichier', F.reel);
  await attend(p, () => /Checking/.test(document.getElementById('sxMienEtat').textContent), null, 2000);
  ok(/Checking the picture/.test(await p.textContent('#sxMienEtat')), '« Checking the picture… » pendant l examen');
  await attend(p, () => document.getElementById('sxMienEtat').className === 'non');
  const im1 = appels('/studio/swap/image', 'POST')[0] || {};
  ok(im1.brut && im1.brut.equals(REEL) && im1.type === 'image/png' && /photo of a real person/.test(await p.textContent('#sxMienEtat')) && await p.$eval('#sxSwoge', (b) => b.getAttribute('aria-pressed')) === 'true',
     'l image part BRUTE a la porte ; refusee : la phrase du serveur, SWOGE reste choisi');
  await p.setInputFiles('#sxMienFichier', F.perso);
  await attend(p, () => document.getElementById('sxMienEtat').className === 'ok');
  ok(await p.textContent('#sxMienEtat') === 'Accepted' && await p.$eval('#sxMien', (b) => b.getAttribute('aria-pressed')) === 'true' && await p.$eval('#sxMienVue', (i) => /^blob:/.test(i.src)), 'acceptee : « Accepted », la vignette, le personnage choisi');
  await p.click('#sxCibles [data-cible="decrit"]');
  await p.fill('#sxQui', 'ab');
  ok(!(await p.isHidden('#sxQui')) && await p.isDisabled('#sxGo') && /Describe the person/.test(await p.textContent('#sxGoNote')), '« Describe… » : le champ ; deux signes ne suffisent pas');
  await p.fill('#sxQui', 'the man in the red cap');
  await p.click('#sxGo');
  await attend(p, () => document.querySelectorAll('#sxCands button').length === 3);
  const ap3 = appels('/studio/swap/' + ID + '/apercu', 'POST')[2] || {};
  ok(JSON.stringify(ap3.corps) === JSON.stringify({ cible: 'decrit', qui: 'the man in the red cap', image: SHA }), 'l apercu du joueur : { cible: decrit, qui, image: sha256 } — jamais l image ni une URL');
  if (SHOTS) await capture(p, 'studio_swap_1280_perso.png');

  console.log('\n-- 7. Use this picture, Animate --');
  await attend(p, () => !!document.querySelector('#sxActs [data-acte="utilise"]'));
  await p.click('#sxActs [data-acte="utilise"]');
  ok(await texteGo(p) === 'Animate — $2.02', 'le bouton devient « Animate — $2.02 » [' + await texteGo(p) + ']');
  ok(!(await p.isHidden('#sxRes')) && /Chosen/.test(await p.textContent('#sxScene')), 'la qualite apparait ; l apercu est marque « Chosen »');
  await p.click('#sxRes [data-res="1080p"]');
  ok(/\$2\.69/.test(await texteGo(p)), '1080p : le prix du serveur change ($2.69)');
  if (SHOTS) await capture(p, 'studio_swap_1280_anime.png');
  /* 16/10 : la marque est un CHOIX (cochee par defaut) ; ici le joueur la retire */
  ok(await p.isChecked('#sxMarque'), 'la case « Made with SWOGE AI » est cochee par defaut');
  await p.uncheck('#sxMarque');
  await p.click('#sxGo');
  await attend(p, () => /Animating/.test(document.getElementById('sxScene').textContent));
  const la = appels('/studio/swap/' + ID + '/lance', 'POST')[0] || {};
  ok(JSON.stringify(la.corps) === JSON.stringify({ apercu: 2, resolution: '1080p', confirmeUsd: 2.69, marque: false }), 'POST …/lance { apercu, resolution, confirmeUsd, marque:false (decochee) } et rien d autre ' + JSON.stringify(la.corps));
  ok(/Animating with Kling/.test(await p.textContent('#sxScene')) && await p.isDisabled('#sxGo'), 'en cours : « Animating with Kling… » sur l apercu choisi');
  S.etat = etat('fini', { video: '/studio/swap/' + ID + '/video', dureeFinale: 8, choix: { apercu: 2 }, paiement: { reserveUsd: 2.69, factureUsd: 2.69, renduUsd: 0 } });
  await attend(p, () => { const v = document.querySelector('#sxScene video'); return v && /^blob:/.test(v.src); }, null, 20000);
  ok(await p.$eval('#sxScene video', (v) => /^blob:/.test(v.src)) && await p.$eval('#sxActs a', (a) => a.getAttribute('download') === 'swoge_swap.mp4' && /^blob:/.test(a.href)) && appels('/studio/swap/' + ID + '/video').every((x) => x.auth === 'jJoueur'),
     'fini : la video lue avec la session (blob:), « Download »');
  ok(/Charged \$2\.69/.test(await p.textContent('#sxFoot')) && await texteGo(p) === 'Make another', 'le montant facture dit ; « Make another »');
  if (SHOTS) await capture(p, 'studio_swap_1280_fini.png');
  ok(await debord(p) <= 0, '1280 px : pas de defilement en largeur');
  await p.context().close();

  console.log('\n-- 8. reprise, largeurs --');
  {
    S.etat = etat('pret'); S.prochain = null; S.apercus = [{ k: 0, statut: 'ready', cible: 'droite', decrit: null, personnage: 'swoge', prixUsd: 1.13, factureUsd: 0.47, message: null }];
    const r = await ouvre({ hash: '#swap' });
    await attend(r, () => { const i = document.querySelector('#sxScene img'); return i && /^blob:/.test(i.src); });
    ok(await r.$eval('#sxScene img', (i) => /^blob:/.test(i.src)) && await r.$eval('#sxCibles [data-cible="droite"]', (b) => b.getAttribute('aria-pressed')) === 'true' && !!(await r.$('#sxActs [data-acte="utilise"]')),
       'rechargee, plan pret : l apercu revient, la cible aussi, « Use this picture » propose');
    await r.context().close();
    S.etat = etat('fini', { video: '/studio/swap/' + ID + '/video', choix: { apercu: 0 }, paiement: { reserveUsd: 2.02, factureUsd: 2.02, renduUsd: 0 } });
    const r2 = await ouvre({ hash: '#swap' });
    await attend(r2, () => { const v = document.querySelector('#sxScene video'); return v && /^blob:/.test(v.src); });
    ok(await r2.$eval('#sxScene video', (v) => /^blob:/.test(v.src)), 'rechargee, video finie : la video revient');
    await r2.context().close();
  }
  for (const L of [320, 390, 1280]) {
    S.etat = etat('pret'); S.prochain = null;
    S.apercus = [{ k: 0, statut: 'ready', cible: 'gauche', personnage: 'swoge', prixUsd: 1.13, factureUsd: 0.47 }, { k: 1, statut: 'ready', cible: 'gauche', personnage: 'swoge', prixUsd: 1.13, factureUsd: 0.47 }];
    const q = await ouvre({ largeur: L, hash: '#swap' });
    await attend(q, () => { const i = document.querySelector('#sxScene img'); return i && /^blob:/.test(i.src) && i.naturalWidth > 0; });
    const d1 = await debord(q);
    await q.click('#sxCibles [data-cible="decrit"]');
    const d2 = await debord(q);
    const box = await q.$eval('#swap', (s) => { const r = s.getBoundingClientRect(); return { g: r.left, d: r.right, l: window.innerWidth }; });
    ok(d1 <= 0 && d2 <= 0 && box.g >= 0 && box.d <= box.l, L + ' px : pas de defilement en largeur (apercu, « Describe… ») ; la section tient dans l ecran');
    if (SHOTS && L === 390) { await q.click('#sxCibles [data-cible="gauche"]'); await capture(q, 'studio_swap_390_apercu.png'); }
    await q.context().close();
  }
  if (SHOTS) {
    S.etat = null; S.passe = null; S.apercus = [];
    const v = await ouvre({ largeur: 390, hash: '#swap' });
    await attend(v, () => /3 to 60 s/.test(document.getElementById('sxBornes').textContent));
    await capture(v, 'studio_swap_390_vide.png');
    await v.context().close();
    const w = await ouvre({ largeur: 1280, hash: '#swap' });
    await attend(w, () => /3 to 60 s/.test(document.getElementById('sxBornes').textContent));
    await capture(w, 'studio_swap_1280_vide.png');
    await w.context().close();
  }
  const erreurs = journal.filter((x) => x.erreurPage);
  ok(erreurs.length === 0, 'aucune erreur dans la page ' + JSON.stringify(erreurs.slice(0, 3)));
  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
