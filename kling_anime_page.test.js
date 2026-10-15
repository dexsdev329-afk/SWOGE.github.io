'use strict';
/* ============================================================================
 * KLING_ESSAI.HTML — « ANIMATE MY STILL » (15/10/2026)
 *
 * Le serveur est simule par page.route ; ce que la page DOIT tenir :
 *   1. Un selecteur de mode clair : « Edit the person (current) » (l'edition
 *      d'avant, visible par defaut, intacte) / « Animate my still (new) ».
 *   2. Le mode : l'image fixe avec son apercu (ses cotes dites), un clip ou une
 *      video entiere, le texte du SERVEUR montre, rien d'envoye avant « Plan » ;
 *      une image trop petite et un clip seul de 12 s sont refuses dans la page.
 *   3. « Plan » envoie la video BRUTE a ?mode=anime-clip (un clip) ou
 *      ?mode=anime (la video entiere) ; le prix au pire du serveur est dit AVANT
 *      de payer, et Run le porte ; sans image fixe, Run reste ferme.
 *   4. Run renvoie { still (data-URL de l'image choisie), resolution,
 *      confirmeUsd (le prix montre), note? } — aucune adresse.
 *   5. Video entiere : la page dit que les parts vont l'une apres l'autre, que
 *      la part n attend la part n-1, et estime le reste d'apres les temps reels.
 *   6. La fin : la video lue AVEC la session (blob:), Download seulement alors.
 *   7. 320, 390 et 1280 px : rien ne deborde, chaque controle est visible et
 *      dans l'ecran ; une passe en cours reprend apres un rechargement.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { execFileSync } = require('child_process');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let ffmpegOk = true; try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch (e) { ffmpegOk = false; }
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon' };
const ID = 'a'.repeat(24);
const TEXTE = 'Start exactly from @image_1: the first frame of the video is @image_1. Keep every character exactly as it looks in @image_1. Follow the motion, gestures, timing and camera movement of @video_1 exactly. Keep the background of @image_1.';

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
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'kling-anime-page-'));
  const F = { clip: path.join(dossier, 'clip.mp4'), long: path.join(dossier, 'long.mp4'), still: path.join(dossier, 'still.png'), petite: path.join(dossier, 'petite.png') };
  const mp4 = (f, d) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-t', String(d), '-i', 'testsrc2=size=360x640:rate=10', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '40', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', f]);
  mp4(F.clip, 6); mp4(F.long, 12);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=720x1280', '-frames:v', '1', F.still]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=200x200', '-frames:v', '1', F.petite]);
  const CLIP = fs.readFileSync(F.clip), STILL = fs.readFileSync(F.still);

  /* ---- le faux serveur ---- */
  const journal = [];
  const S = { suite: [], passeAnime: null };
  const parts = (statuts, o) => statuts.map((st, i) => Object.assign({ i, debut: i * 6.667, duree: 6.667, statut: st, message: st === 'failed' ? 'Kling failed: content risk' : null, essais: 1,
    rejouable: st === 'failed', bloque: false, secondes: st === 'done' ? 240 : null }, (o && o[i]) || {}));
  const etat = (statut, o) => Object.assign({ ok: true, id: ID, statut, message: null, source: { duree: 6, largeur: 720, hauteur: 1280, fps: 30, son: true }, fps: 30,
    morceaux: parts(['planned']), prixPire: { '720p': 0.756, '1080p': 1.008 }, plafondUsd: 20, parallele: 1, resolution: null, video: null,
    anime: { clip: true, sequentiel: true, still: null } }, o || {});
  const ENTIER = { modele: 'kling-o1', prixParSeconde: { '720p': 0.126, '1080p': 0.168 }, dureeMinS: 3, dureeMaxS: 10, cibleS: 9.5, dureeEntierMaxS: 180, octetsMax: 100 * 1024 * 1024,
    imagesMax: 4, imageOctetsMax: 6 * 1024 * 1024, plafondUsd: 20, parallele: 2, gardeH: 48, passe: null, passeAnime: null,
    anime: { stillOctetsMax: 6 * 1024 * 1024, clipMaxS: 10, audio: 'off', noteMax: 400, swoge: 'images', texte: TEXTE } };
  function route(q, url) {
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    let corps = null; try { corps = JSON.parse(q.postData() || 'null'); } catch (e) {}
    journal.push({ m: q.method(), chemin: url.pathname, recherche: url.search, auth, corps, brut: q.postDataBuffer(), type: q.headers()['content-type'] });
    if (auth !== 'jOwner') return [401, { ok: false, raison: 'sign in with your wallet first' }];
    if (url.pathname === '/studio/kling' && q.method() === 'GET') {
      return [200, { ok: true, proprietaire: true, actif: true, modeles: { 'kling-2.6': { durees: [5, 10], prix: { '720p': { off: 0.042 } }, audioReglable: true } }, essais: [],
        edition: { modele: 'kling-o1', prixParSeconde: { '720p': 0.126, '1080p': 0.168 }, dureeMinS: 3, dureeMaxS: 10, octetsMax: 20 * 1024 * 1024, imageOctetsMax: 6 * 1024 * 1024, enCours: [] },
        wan: { actif: false, prixParSeconde: {}, enCours: [] }, entier: Object.assign({}, ENTIER, { passeAnime: S.passeAnime }) }];
    }
    if (url.pathname === '/studio/kling/entier' && q.method() === 'POST') { S.passeAnime = ID; return [200, { ok: true, id: ID, statut: 'decoupe' }]; }
    if (url.pathname === '/studio/kling/entier/' + ID && q.method() === 'GET') { const o = S.suite.length > 1 ? S.suite.shift() : S.suite[0]; return [200, o]; }
    if (url.pathname === '/studio/kling/entier/' + ID + '/lance' && q.method() === 'POST') return [200, S.apresLance];
    if (url.pathname === '/studio/kling/entier/' + ID + '/reessaie/1' && q.method() === 'POST') return [200, S.apresRelance];
    return [404, { ok: false, raison: 'unknown' }];
  }
  const ouvre = async ({ largeur, mode } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1280, height: 900 } });
    await ctx.addInitScript((m) => { try { localStorage.setItem('swogeSession', 'jOwner'); if (m) localStorage.setItem('klingMode', m); } catch (e) {} }, mode || null);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { journal.push({ erreurPage: String(e) }); });
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const q = r.request(), u = new URL(q.url());
      if (u.pathname === '/studio/kling/entier/' + ID + '/video') {
        const auth = String(q.headers().authorization || '');
        journal.push({ m: 'GET', chemin: u.pathname, auth: auth.replace(/^Bearer /, '') });
        return auth === 'Bearer jOwner' ? r.fulfill({ status: 200, contentType: 'video/mp4', body: CLIP }) : r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
      }
      if (/^\/studio\/kling(\/|$)/.test(u.pathname)) { const [code, o] = route(q, u); return r.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(o) }); }
      return r.abort();
    });
    await p.goto('http://127.0.0.1:' + port + '/kling_essai.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    return p;
  };
  const posts = (chemin) => journal.filter((x) => x.m === 'POST' && (!chemin || x.chemin === chemin));
  const attend = (p, f, arg, ms) => p.waitForFunction(f, arg, { timeout: ms || 15000 }).catch(() => {});
  /* chaque controle visible : dans l'ecran en largeur, d'une hauteur tactile */
  const dansLEcran = (p, ids) => p.evaluate((ids) => ids.map((id) => {
    const e = document.getElementById(id); if (!e) return id + ' absent';
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.left >= -0.5 && r.right <= document.documentElement.clientWidth + 0.5 ? null : id + ' ' + Math.round(r.left) + '..' + Math.round(r.right);
  }).filter(Boolean), ids);

  console.log('-- 1. le selecteur de mode --');
  const p = await ouvre();
  ok(await p.isVisible('#modeEditer') && await p.isVisible('#modeAnimer') && (await p.textContent('#modeEditer')) === 'Edit the person (current)' && (await p.textContent('#modeAnimer')) === 'Animate my still (new)',
     'deux modes, en anglais : Edit the person (current) / Animate my still (new)');
  ok((await p.getAttribute('#modeEditer', 'aria-pressed')) === 'true' && await p.isVisible('#eClip') && await p.isVisible('#tClip') && !(await p.isVisible('#aStill')),
     'par defaut : l edition d avant, intacte ; rien du nouveau mode');
  await p.click('#modeAnimer');
  ok((await p.getAttribute('#modeAnimer', 'aria-pressed')) === 'true' && await p.isVisible('#aStill') && !(await p.isVisible('#eClip')) && !(await p.isVisible('#tClip')),
     'Animate my still : son bloc seul');
  ok(/Animate my still/.test(await p.textContent('#blocAnimer h2')) && /Nobody is replaced/.test(await p.textContent('#aAide')), 'le titre et ce que fait le mode');
  ok((await p.textContent('#aTexte')) === TEXTE, 'le texte envoye a Kling est celui du serveur');
  ok(await p.isDisabled('#aPlan') && !(await p.isVisible('#aLancer')) && !(await p.isVisible('#aLien')) && !(await p.isVisible('#aVideo')) && posts().length === 0,
     'avant tout : Plan ferme, ni Run, ni video, ni Download ; rien envoye');

  console.log('\n-- 2. l image fixe et le clip --');
  await p.setInputFiles('#aStill', F.petite);
  await attend(p, () => /300 px/.test(document.getElementById('aStatut').textContent));
  ok(/300 px at least/.test(await p.textContent('#aStatut')) && !(await p.isVisible('#aStillVue')), 'une image de 200 px : refusee dans la page (borne Kling)');
  await p.setInputFiles('#aStill', F.still);
  await attend(p, () => !document.getElementById('aStillVue').hidden);
  ok(await p.isVisible('#aStillVue') && /^data:image\/png;base64,/.test(await p.getAttribute('#aStillVue', 'src')) && /720×1280/.test(await p.textContent('#aStillInfo')),
     'l image fixe : apercu, cotes dites [' + await p.textContent('#aStillInfo') + ']');
  await p.setInputFiles('#aClip', F.long);
  await attend(p, () => /12\.\d\d s long/.test(document.getElementById('aStatut').textContent));
  ok(/one clip is 3 to 10 s/.test(await p.textContent('#aStatut')) && await p.isDisabled('#aPlan') && posts().length === 0, 'un clip seul de 12 s : refuse dans la page, rien envoye');
  await p.setInputFiles('#aClip', F.clip);
  await attend(p, () => /6\.\d\d s/.test(document.getElementById('aClipInfo').textContent));
  ok(await p.isEnabled('#aPlan') && /About \$0\.756/.test(await p.textContent('#aPrix')), 'un clip de 6 s : Plan s ouvre, prix estime 0,756 $ avant tout envoi [' + await p.textContent('#aPrix') + ']');
  await p.fill('#aNote', 'He waves at the end.');
  ok((await p.textContent('#aTexte')) === TEXTE + ' He waves at the end.', 'la direction s ajoute au texte montre');

  console.log('\n-- 3. le plan, le prix avant de payer --');
  S.suite = [etat('decoupe', { morceaux: [], prixPire: null }), etat('pret')];
  await p.click('#aPlan');
  await attend(p, () => /Plan ready/.test(document.getElementById('aStatut').textContent));
  const up = posts('/studio/kling/entier')[0] || {};
  ok(up.auth === 'jOwner' && up.recherche === '?mode=anime-clip' && up.type === 'video/mp4' && up.brut && up.brut.equals(CLIP), 'Plan : le clip BRUT a ?mode=anime-clip, avec le jeton');
  const info = await p.textContent('#aPlanInfo');
  ok(/^1 part: 6\.7 s\. Worst case \$0\.756 at 720p/.test(info), 'le plan dit le prix au pire du serveur [' + info + ']');
  ok(await p.isVisible('#aLancer') && await p.isEnabled('#aLancer') && /Run — \$0\.756 worst case/.test(await p.textContent('#aLancer')), 'Run porte le prix');
  await p.selectOption('#aResolution', '1080p');
  ok(/\$1\.008 at 1080p/.test(await p.textContent('#aPlanInfo')) && /\$1\.008 worst case/.test(await p.textContent('#aLancer')), '1080p : 1,008 $');
  await p.selectOption('#aResolution', '720p');
  ok(posts('/studio/kling/entier/' + ID + '/lance').length === 0, 'rien de lance avant Run');

  console.log('\n-- 4. Run --');
  S.apresLance = etat('en_cours', { resolution: '720p', morceaux: parts(['processing']) });
  S.suite = [etat('en_cours', { resolution: '720p', morceaux: parts(['processing']) }), etat('assemblage', { morceaux: parts(['done']) }),
             etat('fini', { resolution: '720p', morceaux: parts(['done']), video: '/studio/kling/entier/' + ID + '/video', dureeFinale: 6 })];
  await p.click('#aLancer');
  await attend(p, () => posts && true);
  await p.waitForTimeout(300);
  const l = posts('/studio/kling/entier/' + ID + '/lance')[0] || {};
  ok(l.corps && JSON.stringify(Object.keys(l.corps).sort()) === JSON.stringify(['confirmeUsd', 'note', 'resolution', 'still']) && l.corps.confirmeUsd === 0.756 && l.corps.resolution === '720p'
     && l.corps.still === 'data:image/png;base64,' + STILL.toString('base64') && l.corps.note === 'He waves at the end.', 'Run : { still (l image choisie), resolution, confirmeUsd, note } — rien d autre');
  ok(!/0x[0-9a-fA-F]{40}/.test(JSON.stringify(l.corps)), 'aucune adresse dans le corps');

  console.log('\n-- 5. la fin --');
  await attend(p, () => !document.getElementById('aLien').hidden, null, 30000);
  ok(/^blob:/.test(await p.getAttribute('#aVideo', 'src')) && await p.isVisible('#aLien') && /^blob:/.test(await p.getAttribute('#aLien', 'href')) && (await p.getAttribute('#aLien', 'download')) === 'swoge_animated.mp4',
     'la video lue avec la session (blob:), Download apparait');
  ok(journal.some((x) => x.chemin === '/studio/kling/entier/' + ID + '/video' && x.auth === 'jOwner'), 'le resultat demande avec le jeton');
  ok(/Done: 6\.0 s, original sound/.test(await p.textContent('#aStatut')), 'la fin le dit : longueur, son d origine');
  await p.close();

  console.log('\n-- 6. la video entiere : l une apres l autre --');
  {
    S.passeAnime = null; journal.length = 0;
    const q = await ouvre({ mode: 'anime' });
    ok(await q.isVisible('#aStill') && (await q.getAttribute('#modeAnimer', 'aria-pressed')) === 'true', 'le mode choisi est garde (ce navigateur)');
    await q.selectOption('#aQuoi', 'entier');
    ok(/one after another \(never two at once\)/.test(await q.textContent('#aQuoiInfo')) && /LAST frame of the part before/.test(await q.textContent('#aQuoiInfo')), 'la page dit que les parts s enchainent, une a la fois');
    await q.setInputFiles('#aClip', F.long);
    await attend(q, () => /12\.\d\d s/.test(document.getElementById('aClipInfo').textContent));
    ok(await q.isEnabled('#aPlan'), 'video entiere : 12 s accepte');
    const trois = { anime: { clip: false, sequentiel: true, still: null }, source: { duree: 20, largeur: 720, hauteur: 1280, fps: 30, son: true }, prixPire: { '720p': 2.646, '1080p': 3.528 } };
    S.suite = [etat('pret', Object.assign({ morceaux: parts(['planned', 'planned', 'planned']) }, trois))];
    await q.click('#aPlan');
    await attend(q, () => /Plan ready/.test(document.getElementById('aStatut').textContent));
    ok((posts('/studio/kling/entier')[0] || {}).recherche === '?mode=anime', 'Plan : ?mode=anime');
    const i2 = await q.textContent('#aPlanInfo');
    ok(/^3 parts, one after another: /.test(i2) && /Time: 3 times one part's wait at Kling, in a row/.test(i2), 'le plan : 3 parts a la suite, le temps dit [' + i2 + ']');
    ok(await q.isDisabled('#aLancer') && /Choose your still first/.test(await q.textContent('#aLancer')), 'sans image fixe : Run ferme');
    await q.setInputFiles('#aStill', F.still);
    await attend(q, () => !document.getElementById('aStillVue').hidden);
    ok(await q.isEnabled('#aLancer') && /Run — \$2\.646 worst case/.test(await q.textContent('#aLancer')), 'avec l image fixe : Run, 2,646 $');
    const enCours = etat('en_cours', Object.assign({ resolution: '720p', morceaux: parts(['done', 'processing', 'waiting']) }, trois));
    S.apresLance = enCours; S.suite = [enCours];
    await q.click('#aLancer');
    await attend(q, () => /Animating: 1 of 3/.test(document.getElementById('aStatut').textContent));
    ok(/Animating: 1 of 3 parts done, one at a time\. Parts so far took 4 min each: about 8 min left\./.test(await q.textContent('#aStatut')), 'en cours : une a la fois, le reste estime sur les temps reels [' + await q.textContent('#aStatut') + ']');
    const g = await q.$$eval('#aGrille .part b', (l) => l.map((x) => x.textContent));
    ok(g.length === 3 && /Part 3 · waits for part 2/.test(g[2]) && /Part 2 · at Kling/.test(g[1]), 'la grille : la part 3 attend la part 2 ' + JSON.stringify(g));
    /* une part ratee bloque la suivante ; Retry */
    const rate = etat('incomplet', Object.assign({ resolution: '720p', message: 'part 2 failed — retry it; the parts after it wait for it (each one starts from the last frame of the part before)',
      morceaux: parts(['done', 'failed', 'waiting'], { 2: { bloque: true } }) }, trois));
    S.suite = [rate];
    await q.evaluate(() => { /* relit tout de suite */ });
    await attend(q, () => /part 2 failed/.test(document.getElementById('aStatut').textContent), null, 12000);
    ok(/part 2 failed — retry it/.test(await q.textContent('#aStatut')) && await q.isVisible('text=Retry part 2'), 'une part ratee : la page le dit, Retry part 2');
    S.apresRelance = enCours; S.suite = [enCours];
    await q.click('text=Retry part 2');
    await q.waitForTimeout(300);
    ok(posts('/studio/kling/entier/' + ID + '/reessaie/1').length === 1, 'Retry : la relance de la part 2');
    await q.close();
  }

  console.log('\n-- 7. telephone et grand ecran --');
  for (const L of [320, 390, 1280]) {
    S.passeAnime = null;
    const q = await ouvre({ largeur: L });
    await q.click('#modeAnimer');
    await q.setInputFiles('#aStill', F.still);
    await attend(q, () => !document.getElementById('aStillVue').hidden);
    await q.setInputFiles('#aClip', F.clip);
    await attend(q, () => /6\.\d\d s/.test(document.getElementById('aClipInfo').textContent));
    S.suite = [etat('pret')];
    await q.click('#aPlan');
    await attend(q, () => /Plan ready/.test(document.getElementById('aStatut').textContent));
    const d = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const hors = await dansLEcran(q, ['modeEditer', 'modeAnimer', 'aStill', 'aStillVue', 'aQuoi', 'aClip', 'aNote', 'aResolution', 'aPlan', 'aLancer']);
    const hauts = await q.evaluate(() => ['modeEditer', 'modeAnimer', 'aPlan', 'aLancer'].map((id) => document.getElementById(id).getBoundingClientRect().height));
    ok(d <= 0 && !hors.length && hauts.every((h) => h >= 44), L + ' px : rien ne deborde, chaque controle dans l ecran, boutons de 44 px [' + d + ' ' + hors.join(',') + ' ' + hauts.join(',') + ']');
    if (L === 320) {
      /* le centre de chaque bouton de mode recoit son clic (rien ne le couvre) */
      /* elementFromPoint ne voit que la fenetre : chaque bouton est d'abord amene a l'ecran */
      const recoit = await q.evaluate(() => ['modeEditer', 'modeAnimer', 'aLancer'].every((id) => { document.getElementById(id).scrollIntoView({ block: 'center' }); const r = document.getElementById(id).getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && (e.id === id || document.getElementById(id).contains(e)); }));
      ok(recoit, '320 px : le centre de chaque bouton recoit son clic');
    }
    await q.close();
  }
  {
    /* une passe « anime » en cours reprend apres un rechargement */
    S.passeAnime = ID;
    S.suite = [etat('en_cours', { resolution: '720p', morceaux: parts(['processing']) })];
    const q = await ouvre({ largeur: 390, mode: 'anime' });
    await attend(q, () => /Kling is animating your still/.test(document.getElementById('aStatut').textContent));
    ok(/Kling is animating your still/.test(await q.textContent('#aStatut')) && !/Editing/.test(await q.textContent('#tStatut')), 'une passe anime reprend apres un rechargement, dans son mode (pas dans la video entiere)');
    await q.close();
  }
  ok(!journal.some((x) => x.erreurPage), 'aucune erreur de page ' + JSON.stringify(journal.filter((x) => x.erreurPage)));

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
