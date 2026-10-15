'use strict';
/* ============================================================================
 * KLING_ANIMER.HTML — LE MODE SIMPLE D'« ANIMATE MY STILL » (15/10/2026)
 *
 * Le proprietaire : « anime cette image, prends le son de la video, mets-le
 * par-dessus, meme duree » — sans les options de kling_essai.html. Le serveur
 * est simule par page.route ; ce que la page DOIT tenir :
 *   1. La porte : sans session, le bouton de connexion ; une autre adresse que
 *      le proprietaire ne voit pas l'outil.
 *   2. Deux entrees seulement : l'image (celle du proprietaire chargee par
 *      defaut, apercu, « Change picture ») et la video (sa duree dite).
 *   3. Le plan part tout seul des que les deux sont la : la video BRUTE a
 *      ?mode=anime-clip jusqu'a 10 s, ?mode=anime au-dela ; une video de 2 s
 *      est refusee dans la page, rien n'est envoye.
 *   4. UN bouton qui porte le prix au pire du serveur ; le cliquer envoie
 *      { still, resolution: 720p, confirmeUsd: ce prix } — rien d'autre.
 *   5. Une ligne de progres (« Part 1 of 2… », « Putting the sound back… »),
 *      puis la video lue avec la session (blob:) et « Download ».
 *   6. Une erreur : une phrase claire, et dessous le message EXACT de Kling ou
 *      du serveur ; « Try again » relance la part ratee.
 *   7. 320, 390 et 1280 px : aucun defilement horizontal ; aucune erreur JS.
 *   9. (15/10 soir) L'etape FACULTATIVE « Make the picture from the video (ChatGPT) » : fermee
 *      avant le plan ; POST …/<id>/apercu { cible } (ou { cible: decrit, qui }) et rien d'autre ;
 *      l'image lue avec la session (blob:), « Regenerate », « Use this picture » la met a la
 *      place de l'image par defaut, et « Make the video » envoie CETTE image en `still`.
 * CAPTURES=<dossier> : garde la vue du resultat a 1280 et 390 px.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { execFileSync } = require('child_process');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let ffmpegOk = true; try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch (e) { ffmpegOk = false; }
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon' };
const ID = 'b'.repeat(24);
const CAPTURES = process.env.CAPTURES || null;

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  if (!ffmpegOk) { console.log('ffmpeg absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'kling-animer-page-'));
  const F = { clip: path.join(dossier, 'clip.mp4'), long: path.join(dossier, 'long.mp4'), court: path.join(dossier, 'court.mp4'), still: path.join(dossier, 'autre.png') };
  const mp4 = (f, d) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-t', String(d), '-i', 'testsrc2=size=360x640:rate=10', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '40', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', f]);
  mp4(F.clip, 6); mp4(F.long, 12); mp4(F.court, 2);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=720x1280', '-frames:v', '1', F.still]);
  /* le resultat simule : l'image du proprietaire en VP9 dans un MP4 — le Chromium des essais ne lit
     pas le H.264, et la page doit pouvoir LIRE ce qu'elle recoit (et la capture le montrer) */
  F.resultat = path.join(dossier, 'resultat.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-t', '3', '-i', path.join(SITE, 'img/site/swoge_epicerie_still.jpg'), '-vf', 'scale=360:640,format=yuv420p', '-r', '10',
    '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '300k', '-movflags', '+faststart', F.resultat]);
  const RESULTAT = fs.readFileSync(F.resultat);
  const CLIP = fs.readFileSync(F.clip), LONG = fs.readFileSync(F.long), AUTRE = fs.readFileSync(F.still);
  const DEFAUT = fs.readFileSync(path.join(SITE, 'img/site/swoge_epicerie_still.jpg'));

  /* ---- le faux serveur ---- */
  const journal = [], erreursPage = [];
  const S = { suite: [], passeAnime: null, refusPlan: null, ap: [] };
  const IMG_AP = fs.readFileSync(path.join(SITE, 'img/site/swoge_meme_ref.jpg'));
  const parts = (statuts, o) => statuts.map((st, i) => Object.assign({ i, debut: i * 6, duree: 6, statut: st, message: st === 'failed' ? 'Kling failed: content risk' : null, essais: 1,
    rejouable: st === 'failed', bloque: false, secondes: st === 'done' ? 240 : null }, (o && o[i]) || {}));
  const etat = (statut, o) => Object.assign({ ok: true, id: ID, statut, message: null, source: { duree: 6, largeur: 720, hauteur: 1280, fps: 30, son: true }, fps: 30,
    morceaux: parts(['planned']), prixPire: { '720p': 0.756, '1080p': 1.008 }, plafondUsd: 20, parallele: 1, resolution: null, video: null,
    anime: { clip: true, sequentiel: true, still: null } }, o || {});
  const deux = { anime: { clip: false, sequentiel: true, still: null }, source: { duree: 12, largeur: 720, hauteur: 1280, fps: 30, son: true }, prixPire: { '720p': 1.512, '1080p': 2.016 } };
  const ENTIER = { modele: 'kling-o1', prixParSeconde: { '720p': 0.126, '1080p': 0.168 }, dureeMinS: 3, dureeMaxS: 10, cibleS: 9.5, dureeEntierMaxS: 180, octetsMax: 100 * 1024 * 1024,
    imagesMax: 4, imageOctetsMax: 6 * 1024 * 1024, plafondUsd: 20, parallele: 2, gardeH: 48, passe: null,
    anime: { stillOctetsMax: 6 * 1024 * 1024, clipMaxS: 10, audio: 'off', noteMax: 400, swoge: 'images', texte: 'Start exactly from @image_1.' } };
  function route(q, url) {
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    let corps = null; try { corps = JSON.parse(q.postData() || 'null'); } catch (e) {}
    journal.push({ m: q.method(), chemin: url.pathname, recherche: url.search, auth, corps, brut: q.postDataBuffer(), type: q.headers()['content-type'] });
    if (auth === 'jAutre' && url.pathname === '/studio/kling') return [200, { ok: true, proprietaire: false, actif: true }];
    if (auth !== 'jOwner') return [401, { ok: false, raison: 'sign in with your wallet first' }];
    if (url.pathname === '/studio/kling' && q.method() === 'GET') {
      return [200, { ok: true, proprietaire: true, actif: true, modeles: {}, essais: [], entier: Object.assign({}, ENTIER, { passeAnime: S.passeAnime }), apercu: { actif: true, modele: 'gpt-image-2', prixPireUsd: 0.562, parJour: 30 } }];
    }
    if (url.pathname === '/studio/kling/entier' && q.method() === 'POST') {
      if (S.refusPlan) return [429, { ok: false, raison: S.refusPlan }];
      S.passeAnime = ID; return [200, { ok: true, id: ID, statut: 'decoupe' }];
    }
    if (url.pathname === '/studio/kling/entier/' + ID && q.method() === 'GET') { const o = S.suite.length > 1 ? S.suite.shift() : S.suite[0]; return [200, o]; }
    if (url.pathname === '/studio/kling/entier/' + ID + '/lance' && q.method() === 'POST') return [200, S.apresLance];
    /* l'image faite depuis la video (swap_apercu.js) */
    if (url.pathname === '/studio/kling/entier/' + ID + '/apercu' && q.method() === 'POST') { S.ap.push({ k: S.ap.length, statut: 'making', cible: corps.cible, modele: 'gpt-image-2', coutUsd: null }); return [200, { ok: true, apercu: { candidats: S.ap } }]; }
    if (url.pathname === '/studio/kling/entier/' + ID + '/apercu' && q.method() === 'GET') { S.ap.forEach((c) => { if (c.statut === 'making') { c.statut = 'ready'; c.coutUsd = 0.2325; } }); return [200, { ok: true, apercu: S.ap.length ? { candidats: S.ap } : null }]; }
    if (/^\/studio\/kling\/entier\/b{24}\/reessaie\/\d$/.test(url.pathname) && q.method() === 'POST') return [200, S.apresRelance];
    if (url.pathname === '/studio/kling/entier/' + ID + '/abandonne' && q.method() === 'POST') return [200, { ok: true, id: ID, statut: 'supprime' }];
    return [404, { ok: false, raison: 'unknown' }];
  }
  const ouvre = async ({ largeur, jeton } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1280, height: 900 } });
    await ctx.addInitScript((j) => {
      try { if (j) localStorage.setItem('swogeSession', j); } catch (e) {}
      /* chaque texte de la ligne de progres, dans l'ordre : on lit le chemin parcouru, pas un instant */
      window.__progres = [];
      document.addEventListener('DOMContentLoaded', () => {
        const p = document.getElementById('progres'); if (!p) return;
        new MutationObserver(() => { const t = p.textContent; if (t && window.__progres[window.__progres.length - 1] !== t) window.__progres.push(t); }).observe(p, { childList: true, characterData: true, subtree: true });
      });
    }, jeton === undefined ? 'jOwner' : jeton);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { erreursPage.push(String(e)); });
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const q = r.request(), u = new URL(q.url());
      if (u.pathname === '/studio/kling/entier/' + ID + '/video') {
        const auth = String(q.headers().authorization || '');
        journal.push({ m: 'GET', chemin: u.pathname, auth: auth.replace(/^Bearer /, '') });
        return auth === 'Bearer jOwner' ? r.fulfill({ status: 200, contentType: 'video/mp4', body: RESULTAT }) : r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
      }
      if (/^\/studio\/kling\/entier\/b{24}\/apercu\/\d+$/.test(u.pathname)) {
        const auth = String(q.headers().authorization || '');
        journal.push({ m: 'GET', chemin: u.pathname, auth: auth.replace(/^Bearer /, '') });
        return auth === 'Bearer jOwner' ? r.fulfill({ status: 200, contentType: 'image/jpeg', body: IMG_AP }) : r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
      }
      if (/^\/studio\/kling(\/|$)/.test(u.pathname)) { const [code, o] = route(q, u); return r.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(o) }); }
      return r.abort();
    });
    await p.goto('http://127.0.0.1:' + port + '/kling_animer.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(300);
    return p;
  };
  const posts = (chemin) => journal.filter((x) => x.m === 'POST' && (!chemin || x.chemin === chemin));
  const attend = (p, f, arg, ms) => p.waitForFunction(f, arg, { timeout: ms || 15000 }).catch(() => {});
  const texte = (p, id) => p.textContent('#' + id);
  const imageChargee = (p) => attend(p, () => !document.getElementById('image').hidden && /default/.test(document.getElementById('imageInfo').textContent));
  const dansLEcran = (p, ids) => p.evaluate((ids) => ids.map((id) => {
    const e = document.getElementById(id); if (!e) return id + ' absent';
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.left >= -0.5 && r.right <= document.documentElement.clientWidth + 0.5 ? null : id + ' ' + Math.round(r.left) + '..' + Math.round(r.right);
  }).filter(Boolean), ids);

  console.log('-- 1. la porte --');
  {
    const q = await ouvre({ jeton: null });
    ok(await q.isVisible('#seConnecter') && /Sign in with your wallet/.test(await texte(q, 'acces')) && !(await q.isVisible('#outil')), 'sans session : le bouton de connexion, pas d outil');
    await q.close();
    const r = await ouvre({ jeton: 'jAutre' });
    await attend(r, () => /owner only/.test(document.getElementById('acces').textContent));
    ok(/This page is for the owner only/.test(await texte(r, 'acces')) && !(await r.isVisible('#outil')), 'une autre adresse : « owner only », pas d outil');
    await r.close();
  }

  console.log('\n-- 2. les deux entrees ; l image par defaut --');
  const p = await ouvre();
  await imageChargee(p);
  ok(await p.isVisible('#outil') && !(await p.isVisible('#porte')), 'le proprietaire : l outil, la porte s efface');
  ok(await p.isVisible('#image') && (await p.getAttribute('#image', 'src')) === 'data:image/jpeg;base64,' + DEFAUT.toString('base64') && /SWOGE in the shop \(default\) · 956×1645/.test(await texte(p, 'imageInfo')),
     'l image du proprietaire chargee par defaut, apercu et cotes [' + await texte(p, 'imageInfo') + ']');
  ok((await texte(p, 'imageChange')) === 'Change picture' && (await texte(p, 'videoChoix')) === 'Choose a video', '« Change picture » et « Choose a video »');
  /* l'intention : deux entrees a remplir, pas d'options partout. Depuis le 15/10 (soir), l'etape
     facultative ChatGPT ajoute seulement un champ « Describe… », cache tant qu'on ne le choisit pas. */
  const entrees = await p.$$eval('#outil input, #outil select, #outil textarea', (l) => l.filter((x) => x.offsetParent !== null || x.type === 'file').map((x) => x.id));
  ok(JSON.stringify(entrees) === JSON.stringify(['imageFichier', 'videoFichier']), 'deux entrees seulement (le champ « Describe… » cache) : ' + JSON.stringify(entrees));
  ok(await p.isDisabled('#faire') && /Choose a video first/.test(await texte(p, 'faireInfo')) && !(await p.isVisible('#resultat')) && posts().length === 0, 'sans video : le bouton ferme, rien envoye');
  ok(await p.isVisible('a[href="kling_essai.html"]'), 'un lien vers tous les outils Kling');

  console.log('\n-- 3. une video de 2 s, puis un clip de 6 s : le plan part seul --');
  await p.setInputFiles('#videoFichier', F.court);
  await attend(p, () => !document.getElementById('erreur').hidden);
  ok(/too short/.test(await texte(p, 'erreurPhrase')) && /3 s at least/.test(await texte(p, 'erreurDetail')) && posts().length === 0, 'une video de 2 s : refusee dans la page, rien envoye');
  S.suite = [etat('decoupe', { morceaux: [], prixPire: null }), etat('pret')];
  await p.setInputFiles('#videoFichier', F.clip);
  await attend(p, () => /\$0\.756 max/.test(document.getElementById('faire').textContent));
  ok(/clip\.mp4 · 6\.0 s/.test(await texte(p, 'videoInfo')), 'la duree de la video dite [' + await texte(p, 'videoInfo') + ']');
  const up = posts('/studio/kling/entier')[0] || {};
  ok(up.auth === 'jOwner' && up.recherche === '?mode=anime-clip' && up.type === 'video/mp4' && up.brut && up.brut.equals(CLIP), '6 s : le clip BRUT part seul a ?mode=anime-clip, avec le jeton');
  ok(await p.isEnabled('#faire') && (await texte(p, 'faire')) === 'Make the video — $0.756 max' && /One clip · 720p/.test(await texte(p, 'faireInfo')),
     'le bouton porte le prix au pire du serveur [' + await texte(p, 'faire') + ' / ' + await texte(p, 'faireInfo') + ']');
  ok(posts('/studio/kling/entier/' + ID + '/lance').length === 0 && !(await p.isVisible('#erreur')), 'rien de lance avant le clic ; l erreur d avant s est effacee');

  console.log('\n-- 4. le clic : la confirmation du prix, avec l image --');
  S.apresLance = etat('en_cours', { resolution: '720p', morceaux: parts(['processing']) });
  S.suite = [etat('en_cours', { resolution: '720p', morceaux: parts(['processing']) }), etat('assemblage', { morceaux: parts(['done']) }),
             etat('fini', { resolution: '720p', morceaux: parts(['done']), video: '/studio/kling/entier/' + ID + '/video', dureeFinale: 6 })];
  await p.click('#faire');
  await attend(p, () => /Kling is animating your picture/.test(document.getElementById('progres').textContent));
  const l = posts('/studio/kling/entier/' + ID + '/lance')[0] || {};
  ok(l.corps && JSON.stringify(Object.keys(l.corps).sort()) === JSON.stringify(['confirmeUsd', 'resolution', 'still']) && l.corps.confirmeUsd === 0.756 && l.corps.resolution === '720p',
     'le clic : { still, resolution: 720p, confirmeUsd: 0.756 } — le prix montre, rien d autre ' + JSON.stringify(l.corps && Object.keys(l.corps)));
  ok(l.corps && l.corps.still === 'data:image/jpeg;base64,' + DEFAUT.toString('base64'), 'l image envoyee est celle montree (par defaut)');
  ok(!/0x[0-9a-fA-F]{40}/.test(JSON.stringify(l.corps || {})), 'aucune adresse dans le corps');
  ok(await p.isDisabled('#faire') && await p.isDisabled('#videoFichier') && await p.isDisabled('#imageFichier'), 'pendant le travail : le bouton et les deux entrees fermes');

  console.log('\n-- 5. le progres, puis le resultat --');
  await attend(p, () => !document.getElementById('resultat').hidden, null, 30000);
  const chemin = await p.evaluate(() => window.__progres);
  const ia = chemin.findIndex((t) => /Kling is animating your picture/.test(t)), ib = chemin.findIndex((t) => t === 'Putting the sound back…'), ic = chemin.findIndex((t) => /^Done: 6\.0 s, with the video's sound\./.test(t));
  ok(ia >= 0 && ib > ia && ic > ib, 'la ligne : animating → Putting the sound back… → Done ' + JSON.stringify(chemin));
  await attend(p, () => document.getElementById('video').readyState >= 2);
  const lue = await p.evaluate(() => { const v = document.getElementById('video'); return { pret: v.readyState, duree: v.duration, src: v.src }; });
  ok(/^blob:/.test(lue.src) && await p.isVisible('#video') && lue.pret >= 2 && lue.duree > 2.9 && lue.duree < 3.5, 'la video lue avec la session (blob:), et lisible ' + JSON.stringify({ pret: lue.pret, duree: lue.duree }));
  ok(await p.isVisible('#telecharge') && (await texte(p, 'telecharge')) === 'Download' && /^blob:/.test(await p.getAttribute('#telecharge', 'href')) && (await p.getAttribute('#telecharge', 'download')) === 'swoge_animated.mp4',
     'Download : le meme blob, swoge_animated.mp4');
  ok(journal.some((x) => x.chemin === '/studio/kling/entier/' + ID + '/video' && x.auth === 'jOwner'), 'le resultat demande avec le jeton');
  ok(!(await p.isVisible('#faire')), 'la video faite : le bouton s efface');
  /* une autre image apres coup : la meme video repart au plan (gratuit), le bouton revient */
  S.suite = [etat('pret')];
  await p.setInputFiles('#imageFichier', F.still);
  await attend(p, () => /\$0\.756 max/.test(document.getElementById('faire').textContent) && !document.getElementById('faire').hidden);
  ok(posts('/studio/kling/entier').length === 2 && /autre\.png · 720×1280/.test(await texte(p, 'imageInfo')) && await p.isEnabled('#faire'), 'Change picture apres coup : nouveau plan de la meme video, le bouton revient');
  S.apresLance = etat('en_cours', { resolution: '720p', morceaux: parts(['processing']) }); S.suite = [S.apresLance];
  await p.click('#faire');
  await p.waitForTimeout(300);
  const l2 = posts('/studio/kling/entier/' + ID + '/lance')[1] || {};
  ok(l2.corps && l2.corps.still === 'data:image/png;base64,' + AUTRE.toString('base64'), 'la nouvelle image part avec le clic');
  await p.close();

  console.log('\n-- 6. plus de 10 s : la video entiere, « Part 1 of 2… » --');
  {
    S.passeAnime = null; journal.length = 0;
    const q = await ouvre();
    await imageChargee(q);
    S.suite = [etat('pret', Object.assign({ morceaux: parts(['planned', 'planned']) }, deux))];
    await q.setInputFiles('#videoFichier', F.long);
    await attend(q, () => /\$1\.512 max/.test(document.getElementById('faire').textContent));
    const up2 = posts('/studio/kling/entier')[0] || {};
    ok(up2.recherche === '?mode=anime' && up2.brut && up2.brut.equals(LONG), '12 s : ?mode=anime, la video BRUTE');
    ok(/long\.mp4 · 12\.0 s/.test(await texte(q, 'videoInfo')) && /2 parts, one after another/.test(await texte(q, 'faireInfo')), 'la duree, et 2 parts dites');
    S.apresLance = etat('en_cours', Object.assign({ resolution: '720p', morceaux: parts(['processing', 'waiting']) }, deux));
    S.suite = [S.apresLance, etat('en_cours', Object.assign({ resolution: '720p', morceaux: parts(['done', 'processing']) }, deux))];
    await q.click('#faire');
    await attend(q, () => document.getElementById('progres').textContent === 'Part 2 of 2…', null, 15000);
    const l3 = posts('/studio/kling/entier/' + ID + '/lance')[0] || {};
    ok(l3.corps && l3.corps.confirmeUsd === 1.512, 'confirmeUsd : 1.512, le prix du bouton');
    const ch = await q.evaluate(() => window.__progres);
    ok(ch.indexOf('Part 1 of 2…') >= 0 && ch.indexOf('Part 2 of 2…') > ch.indexOf('Part 1 of 2…'), 'la ligne : Part 1 of 2… puis Part 2 of 2… ' + JSON.stringify(ch));
    ok(/Parts so far took 4 min each: about 4 min left/.test(await texte(q, 'progresDetail')), 'le reste estime sur les temps reels [' + await texte(q, 'progresDetail') + ']');

    console.log('\n-- 7. les erreurs : une phrase, le message exact dessous --');
    S.suite = [etat('incomplet', Object.assign({ resolution: '720p', message: 'part 2 failed — retry it', morceaux: parts(['done', 'failed']) }, deux))];
    await attend(q, () => !document.getElementById('erreur').hidden, null, 12000);
    ok((await texte(q, 'erreurPhrase')) === 'Kling could not make part 2 of 2.' && (await texte(q, 'erreurDetail')) === 'Kling failed: content risk',
       'Kling rate : « Kling could not make part 2 of 2. », dessous le message exact [' + await texte(q, 'erreurDetail') + ']');
    ok(await q.isVisible('#reessaie') && await q.isVisible('#annule') && !(await q.isVisible('#progres.travail')), 'Try again et Cancel, plus de ligne de travail');
    S.apresRelance = etat('en_cours', Object.assign({ resolution: '720p', morceaux: parts(['done', 'processing']) }, deux)); S.suite = [S.apresRelance];
    await q.click('#reessaie');
    await attend(q, () => document.getElementById('erreur').hidden);
    ok(posts('/studio/kling/entier/' + ID + '/reessaie/1').length === 1 && !(await q.isVisible('#erreur')), 'Try again : la part 2 relancee, l erreur s efface');
    await q.close();
  }
  {
    /* le plan refuse par le serveur (en reponse, puis dans l etat) */
    S.passeAnime = null; journal.length = 0;
    const q = await ouvre();
    await imageChargee(q);
    S.refusPlan = 'a whole-video edit is already running — wait for it (or retry its failed parts)';
    await q.setInputFiles('#videoFichier', F.clip);
    await attend(q, () => !document.getElementById('erreur').hidden);
    ok((await texte(q, 'erreurPhrase')) === 'The server refused this video.' && (await texte(q, 'erreurDetail')) === S.refusPlan && await q.isDisabled('#faire'), 'refus du serveur : la phrase, la raison exacte, le bouton ferme');
    S.refusPlan = null;
    S.suite = [etat('erreur', { message: 'the video is 360×640 px — too narrow for Kling (700 to 2160 px per side)', morceaux: [], prixPire: null })];
    await q.setInputFiles('#videoFichier', F.clip);
    await attend(q, () => /too narrow/.test(document.getElementById('erreurDetail').textContent));
    ok((await texte(q, 'erreurPhrase')) === 'The server could not use this video.' && /360×640 px — too narrow/.test(await texte(q, 'erreurDetail')) && await q.isDisabled('#faire'), 'le plan rate : la phrase, le message exact du serveur');
    await q.close();
  }
  {
    /* une video en cours reprend apres un rechargement */
    S.passeAnime = ID; S.suite = [etat('assemblage', { morceaux: parts(['done']) })];
    const q = await ouvre({ largeur: 390 });
    await attend(q, () => document.getElementById('progres').textContent === 'Putting the sound back…');
    ok((await texte(q, 'progres')) === 'Putting the sound back…', 'une video en cours reprend apres un rechargement');
    await q.close();
  }

  console.log('\n-- 8. telephone et grand ecran --');
  for (const L of [320, 390, 1280]) {
    S.passeAnime = null;
    const q = await ouvre({ largeur: L });
    await imageChargee(q);
    S.suite = [etat('pret')];
    await q.setInputFiles('#videoFichier', F.clip);
    await attend(q, () => /\$0\.756 max/.test(document.getElementById('faire').textContent));
    const d1 = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const hors = await dansLEcran(q, ['toutLien', 'image', 'imageChange', 'videoChoix', 'faire']);
    const hauts = await q.evaluate(() => ['imageChange', 'videoChoix', 'faire'].map((id) => document.getElementById(id).getBoundingClientRect().height));
    S.apresLance = etat('fini', { resolution: '720p', morceaux: parts(['done']), video: '/studio/kling/entier/' + ID + '/video', dureeFinale: 6 }); S.suite = [S.apresLance];
    await q.click('#faire');
    await attend(q, () => !document.getElementById('resultat').hidden);
    const d2 = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const hors2 = await dansLEcran(q, ['video', 'telecharge']);
    ok(d1 <= 0 && d2 <= 0 && !hors.length && !hors2.length && hauts.every((h) => h >= 44), L + ' px : aucun defilement horizontal, chaque controle dans l ecran, 44 px au moins [' + d1 + ' ' + d2 + ' ' + hors.concat(hors2).join(',') + ' ' + hauts.map(Math.round).join(',') + ']');
    if (CAPTURES && (L === 1280 || L === 390)) {
      await attend(q, () => document.getElementById('video').readyState >= 2);
      await q.evaluate(() => { const v = document.getElementById('video'); try { v.pause(); v.currentTime = 1; } catch (e) {} window.scrollTo(0, 0); });
      await q.waitForTimeout(400);
      await q.screenshot({ path: path.join(CAPTURES, 'capture_' + L + '.png'), fullPage: true });
    }
    await q.close();
  }
  console.log('\n-- 9. l image faite depuis la video (ChatGPT) --');
  {
    S.passeAnime = null; S.ap = [];
    const q = await ouvre({ largeur: 390 });
    await imageChargee(q);
    ok(await q.isDisabled('#apFaire') && /Choose a video first/.test(await texte(q, 'apInfo')) && await q.$eval('#apCibles [data-cible="seule"]', (b) => b.getAttribute('aria-pressed')) === 'true',
       'avant le plan : « Make the picture » ferme ; « Only person » par defaut');
    S.suite = [etat('pret')];
    await q.setInputFiles('#videoFichier', F.clip);
    await attend(q, () => !document.getElementById('apFaire').disabled);
    await q.click('#apCibles [data-cible="decrit"]');
    await q.fill('#apQui', 'the drummer');
    await q.click('#apFaire');
    await attend(q, () => !document.getElementById('apVue').hidden && /^blob:/.test(document.getElementById('apVue').src));
    const pa = posts('/studio/kling/entier/' + ID + '/apercu');
    ok(pa.length === 1 && JSON.stringify(pa[0].corps) === JSON.stringify({ cible: 'decrit', qui: 'the drummer' }) && pa[0].auth === 'jOwner', 'POST …/apercu { cible: decrit, qui } et rien d autre, avec le jeton');
    ok(await q.$eval('#apVue', (i) => /^blob:/.test(i.src)) && journal.some((x) => /\/apercu\/0$/.test(x.chemin) && x.auth === 'jOwner') && /OpenAI cost \$0\.233/.test(await texte(q, 'apInfo')) && await q.isVisible('#apRefait') && await q.isVisible('#apUtilise'),
       'l image lue avec la session (blob:), son cout OpenAI dit, « Regenerate » et « Use this picture »');
    await q.click('#apRefait');
    await attend(q, () => posts !== null && document.getElementById('apInfo').textContent.indexOf('Picture 2') === 0);
    ok(posts('/studio/kling/entier/' + ID + '/apercu').length === 2, 'Regenerate : une seconde image demandee');
    await q.click('#apUtilise');
    await attend(q, () => /chatgpt_frame/.test(document.getElementById('imageInfo').textContent));
    const attendu = 'data:image/jpeg;base64,' + IMG_AP.toString('base64');
    ok((await q.getAttribute('#image', 'src')) === attendu && /chatgpt_frame_2\.jpg · 1170×1280/.test(await texte(q, 'imageInfo')), '« Use this picture » : l image remplace celle par defaut (etape 1) [' + await texte(q, 'imageInfo') + ']');
    S.apresLance = etat('en_cours', { morceaux: parts(['processing']) }); S.suite = [S.apresLance];
    await attend(q, () => /\$0\.756 max/.test(document.getElementById('faire').textContent));
    await q.click('#faire');
    await attend(q, () => document.getElementById('faire').textContent !== 'Make the video — $0.756 max');
    const la = posts('/studio/kling/entier/' + ID + '/lance').pop();
    ok(la && la.corps.still === attendu && la.corps.confirmeUsd === 0.756, '« Make the video » envoie CETTE image en still');
    const d = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(d <= 0 && !(await dansLEcran(q, ['apFaire', 'apCibles', 'apVue'])).length, '390 px : l etape tient dans l ecran');
    await q.close();
  }
  {
    /* le lien du mode simple, en tete de kling_essai.html */
    const q = await nav.newPage({ viewport: { width: 390, height: 900 } });
    q.on('pageerror', (e) => { erreursPage.push('kling_essai: ' + String(e)); });
    await q.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => r.abort());
    await q.goto('http://127.0.0.1:' + port + '/kling_essai.html', { waitUntil: 'domcontentloaded' });
    const lien = await q.evaluate(() => { const a = document.getElementById('modeSimple'); const h = document.querySelector('h1'); return a && { t: a.textContent, href: a.getAttribute('href'), avant: !!(a.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING), haut: a.getBoundingClientRect().top }; });
    ok(lien && lien.t === "Simple mode: animate a picture with a video's sound →" && lien.href === 'kling_animer.html' && lien.avant && lien.haut < 100, 'kling_essai.html : le lien du mode simple, tout en haut ' + JSON.stringify(lien));
    await q.close();
  }
  ok(!erreursPage.length, 'aucune erreur de page ' + JSON.stringify(erreursPage));

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
