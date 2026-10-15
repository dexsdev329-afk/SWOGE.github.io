'use strict';
/* ============================================================================
 * KLING_ESSAI.HTML — « WHOLE VIDEO (SPLIT INTO PARTS) » (14/10/2026)
 *
 * Le serveur est simule par page.route ; ce que la page DOIT tenir :
 *   1. Le proprietaire voit le mode : le texte demande pre-rempli, 720p, le
 *      corps (Swole Doge) en @image_1 et le visage officiel en @image_2, « Plan » ferme sans video, ni bouton
 *      de lancement ni lien de telechargement avant un plan / un resultat.
 *   2. Une video plus grosse que la borne du serveur est refusee AVANT envoi.
 *   3. « Plan » envoie la video BRUTE (video/mp4, octet pour octet) avec le
 *      jeton, puis suit l'etat ; le plan montre le nombre de morceaux, leurs
 *      longueurs, le prix au pire a la resolution choisie et le plafond ; une
 *      resolution au-dessus du plafond ferme le bouton.
 *   4. Les references : ajouter (PNG), jusqu'a 4 (le bouton se ferme), retirer.
 *   5. « Run all parts » renvoie le prix montre, les images (« swoge » puis
 *      les data-URL), le texte, la resolution — et aucune adresse.
 *   6. La grille : un etat par morceau ; un morceau rate se relance seul.
 *   7. La fin : la video lue AVEC la session (blob:), et le lien de
 *      telechargement apparait seulement alors.
 *   8. Une passe en cours reprend apres un rechargement ; 320 px sans debord.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon' };
const PROMPT = 'Replace the singer in @video_1 with the exact 3D character of @image_1 and @image_2: SWOGE, a huge bodybuilder Shiba Inu with thick fluffy cream-white fur on the chest, belly and arms and orange-tan fur on the head and back, the round friendly Doge face of @image_2 with white cheeks, small dark eyes and a smiling mouth that opens to lip-sync the words, furry dog paws with dark pads instead of hands, wearing plain black gym shorts, much bigger and more muscular than the original person, with nothing left of the original person (no hair, glasses, clothes or accessories). Keep the other person, the camera, the background and the original audio unchanged.';
let ID = 'e'.repeat(24);   /* let : la section 7b fait une SECONDE passe dans la meme page */

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'kling-entier-page-'));
  const F = { video: path.join(dossier, 'chanson.mp4'), gros: path.join(dossier, 'gros.mp4'), pattes: path.join(dossier, 'pattes.png') };
  const VIDEO = Buffer.from(Array.from({ length: 300000 }, (_, i) => (i * 31) & 255));
  fs.writeFileSync(F.video, VIDEO);
  fs.writeFileSync(F.gros, Buffer.alloc(3 * 1024 * 1024, 1));
  fs.writeFileSync(F.pattes, fs.readFileSync(path.join(SITE, 'img/site/icone-192.png')));

  /* ---- le faux serveur ---- */
  const journal = [];
  const S = { passe: null, vue: null };
  const durees = [9.4, 9.4, 9.4, 9.4, 9.4, 9.4, 9.4, 9.4, 9.4, 9.4];
  const morceaux = (statuts) => durees.map((d, i) => ({ i, debut: Math.round(i * 9.4 * 1000) / 1000, duree: d, statut: statuts ? statuts[i] : 'planned', message: statuts && statuts[i] === 'failed' ? 'Kling failed: content risk' : null,
    essais: 1, rejouable: !!(statuts && statuts[i] === 'failed') }));
  const etat = (statut, o) => Object.assign({ ok: true, id: ID, statut, message: null, source: { duree: 94, largeur: 720, hauteur: 1280, fps: 29.97, son: true }, fps: 30, morceaux: morceaux(),
    scenes: 0, prixPire: { '720p': 12.6, '1080p': 16.8 }, plafondUsd: 15, parallele: 2, resolution: null, video: null }, o || {});
  S.suite = [];
  const ENTIER = { modele: 'kling-o1', prixParSeconde: { '720p': 0.126, '1080p': 0.168 }, dureeMinS: 3, dureeMaxS: 10, cibleS: 9.5, dureeEntierMaxS: 180, octetsMax: 2 * 1024 * 1024,
                   imagesMax: 4, imageOctetsMax: 6 * 1024 * 1024, plafondUsd: 15, parallele: 2, gardeH: 48, passe: null };
  function route(q, url) {
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    const brut = q.postDataBuffer();
    let corps = null; try { corps = JSON.parse(q.postData() || 'null'); } catch (e) {}
    journal.push({ m: q.method(), chemin: url.pathname, auth, corps, brut, type: q.headers()['content-type'] });
    if (auth !== 'jOwner') return [401, { ok: false, raison: 'sign in with your wallet first' }];
    if (url.pathname === '/studio/kling' && q.method() === 'GET') {
      return [200, { ok: true, proprietaire: true, actif: true, modeles: { 'kling-2.6': { durees: [5, 10], prix: { '720p': { off: 0.042 } }, audioReglable: true } }, essais: [],
        edition: { modele: 'kling-o1', prixParSeconde: { '720p': 0.126, '1080p': 0.168 }, dureeMinS: 3, dureeMaxS: 10, octetsMax: 20 * 1024 * 1024, imageOctetsMax: 6 * 1024 * 1024, enCours: [] },
        wan: { actif: false, prixParSeconde: {}, enCours: [] }, entier: Object.assign({}, ENTIER, { passe: S.passe }) }];
    }
    if (url.pathname === '/studio/kling/entier' && q.method() === 'POST') { S.passe = ID; return [200, { ok: true, id: ID, statut: 'decoupe' }]; }
    if (url.pathname === '/studio/kling/entier/' + ID && q.method() === 'GET') { const o = S.suite.length > 1 ? S.suite.shift() : S.suite[0]; return [200, o]; }
    if (url.pathname === '/studio/kling/entier/' + ID + '/lance' && q.method() === 'POST') return [200, etat('en_cours', { resolution: '720p', morceaux: morceaux(durees.map((_, i) => (i < 2 ? 'processing' : 'waiting'))) })];
    if (url.pathname === '/studio/kling/entier/' + ID + '/reessaie/3' && q.method() === 'POST') return [200, etat('en_cours', { resolution: '720p', morceaux: morceaux(durees.map((_, i) => (i === 3 ? 'processing' : 'done'))) })];
    return [404, { ok: false, raison: 'unknown' }];
  }
  const ouvre = async ({ largeur } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1200, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('swogeSession', 'jOwner'); } catch (e) {} });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { journal.push({ erreurPage: String(e) }); });
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const q = r.request(), u = new URL(q.url());
      if (u.pathname === '/studio/kling/entier/' + ID + '/video') {
        const auth = String(q.headers().authorization || '');
        journal.push({ m: 'GET', chemin: u.pathname, auth: auth.replace(/^Bearer /, '') });
        return auth === 'Bearer jOwner' ? r.fulfill({ status: 200, contentType: 'video/mp4', body: VIDEO }) : r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
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

  console.log('-- 1. le mode, avant tout --');
  const p = await ouvre();
  ok(await p.isVisible('text=Whole video (split into parts)') && await p.isVisible('#tClip'), 'le mode est visible, en anglais');
  ok((await p.inputValue('#tPrompt')) === PROMPT && (await p.inputValue('#ePrompt')) === PROMPT, 'le texte demande, pre-rempli (video entiere ET clip)');
  ok((await p.inputValue('#tResolution')) === '720p', '720p par defaut');
  const refs0 = await p.$$eval('#tRefs .ref', (l) => l.map((x) => ({ src: x.querySelector('img').getAttribute('src'), t: x.textContent, l: x.querySelector('img').naturalWidth })));
  ok(refs0.length === 2 && refs0[0].src === '/img/site/swoge_swole_ref.jpg' && /@image_1 · SWOGE body \(default\)/.test(refs0[0].t) && refs0[0].l === 832
     && refs0[1].src === '/img/site/swoge_face_ref.jpg' && /@image_2 · SWOGE face \(default\)/.test(refs0[1].t) && refs0[1].l === 768, 'deux references : le corps en @image_1, le visage en @image_2 (chargees)');
  ok(/Doge face of @image_2/.test(await p.inputValue('#tPrompt')), 'le texte prend le visage de @image_2');
  ok(await p.isDisabled('#tPlan') && !(await p.isVisible('#tLancer')) && !(await p.isVisible('#tLien')) && !(await p.isVisible('#tVideo')), 'Plan ferme sans video ; ni lancement, ni video, ni lien de telechargement');
  ok(/Cap \$15\.000 per run, 2 parts at a time/.test(await p.textContent('#tPlanInfo')), 'le plafond et le parallele du serveur sont dits [' + await p.textContent('#tPlanInfo') + ']');

  console.log('\n-- 2. trop gros --');
  await p.setInputFiles('#tClip', F.gros);
  ok(/too large: 3\.0 MB \(2 MB at most\)/.test(await p.textContent('#tStatut')) && await p.isDisabled('#tPlan') && posts().length === 0, 'plus que la borne du serveur : refuse avant envoi');

  console.log('\n-- 3. le plan --');
  await p.setInputFiles('#tClip', F.video);
  ok(await p.isEnabled('#tPlan') && /chanson\.mp4/.test(await p.textContent('#tClipInfo')), 'une video : Plan s ouvre');
  S.suite = [etat('decoupe', { morceaux: [], prixPire: null }), etat('pret')];
  await p.click('#tPlan');
  await attend(p, () => /Plan ready/.test(document.getElementById('tStatut').textContent));
  const up = posts('/studio/kling/entier')[0] || {};
  ok(up.auth === 'jOwner' && up.type === 'video/mp4' && up.brut && up.brut.equals(VIDEO), 'la video part BRUTE (video/mp4), octet pour octet, avec le jeton');
  const info = await p.textContent('#tPlanInfo');
  ok(/^10 parts \(no scene cut found, even parts\): 9\.4 s(, 9\.4 s){9}\. Worst case \$12\.600 at 720p/.test(info) && /cap \$15\.000/.test(info), 'le plan : 10 parts de 9,4 s, au pire 12,600 $ en 720p, plafond [' + info + ']');
  ok(await p.isVisible('#tLancer') && await p.isEnabled('#tLancer') && /\$12\.600 worst case/.test(await p.textContent('#tLancer')), 'le bouton de confirmation dit le prix');
  ok((await p.$$('#tGrille .part')).length === 10, 'la grille : 10 parts planifiees');
  await p.selectOption('#tResolution', '1080p');
  ok(/\$16\.800 at 1080p/.test(await p.textContent('#tPlanInfo')) && /Over the cap/.test(await p.textContent('#tPlanInfo')) && await p.isDisabled('#tLancer'), '1080p : 16,800 $, au-dessus du plafond, bouton ferme');
  await p.selectOption('#tResolution', '720p');
  ok(await p.isEnabled('#tLancer') && posts('/studio/kling/entier/' + ID + '/lance').length === 0, 'retour a 720p : bouton rouvert, rien de lance');

  console.log('\n-- 4. les references --');
  const ajoute = async (f) => { const [c] = await Promise.all([p.waitForEvent('filechooser'), p.click('#tAjout')]); await c.setFiles(f); await p.waitForTimeout(200); };
  await ajoute(F.pattes);
  let refs = await p.$$eval('#tRefs .ref', (l) => l.map((x) => ({ src: x.querySelector('img').getAttribute('src'), t: x.textContent })));
  ok(refs.length === 3 && /^data:image\/png;base64,/.test(refs[2].src) && /@image_3 · pattes\.png/.test(refs[2].t), 'une image ajoutee : @image_3');
  await ajoute(F.pattes);
  ok((await p.$$('#tRefs .ref')).length === 4 && await p.isDisabled('#tAjout'), '4 images : le bouton se ferme');
  await p.click('#tRefs .ref:nth-child(4) button');
  ok((await p.$$('#tRefs .ref')).length === 3 && await p.isEnabled('#tAjout'), 'retirer : 3 images, le bouton se rouvre');

  console.log('\n-- 5. la confirmation --');
  S.suite = [etat('en_cours', { resolution: '720p', morceaux: morceaux(durees.map((_, i) => (i < 2 ? 'processing' : 'waiting'))) }),
             etat('incomplet', { resolution: '720p', message: 'some parts failed — retry them one by one', morceaux: morceaux(durees.map((_, i) => (i === 3 ? 'failed' : 'done'))) })];
  await p.click('#tLancer');
  await attend(p, () => document.querySelectorAll('#tGrille .part[data-statut="failed"]').length === 1, null, 20000);
  const l = posts('/studio/kling/entier/' + ID + '/lance')[0] || {};
  ok(l.auth === 'jOwner' && l.corps && l.corps.confirmeUsd === 12.6 && l.corps.resolution === '720p' && l.corps.prompt === PROMPT, 'lance : le prix montre (12,6), 720p, le texte');
  ok(l.corps && l.corps.images.length === 3 && l.corps.images[0] === 'swoge' && l.corps.images[1] === 'swoge-face' && /^data:image\/png;base64,/.test(l.corps.images[2]), 'les images : « swoge » (corps), « swoge-face » (visage), puis la data-URL PNG');
  ok(l.corps && !JSON.stringify(l.corps).match(/0x[0-9a-fA-F]{40}/), 'aucune adresse dans le corps');

  console.log('\n-- 6. la grille, une relance --');
  ok(/some parts failed/.test(await p.textContent('#tStatut')) && (await p.$$('#tGrille .part[data-statut="done"]')).length === 9, '9 faites, 1 ratee, la raison au statut');
  ok(/content risk/.test(await p.textContent('#tGrille .part[data-statut="failed"]')) && (await p.$$('#tGrille .part button')).length === 1, 'la part ratee dit pourquoi, et seule elle a un bouton');
  ok(!(await p.isVisible('#tLien')), 'toujours pas de lien de telechargement');
  S.suite = [etat('fini', { resolution: '720p', morceaux: morceaux(durees.map(() => 'done')), video: '/studio/kling/entier/' + ID + '/video', dureeFinale: 94.0 })];
  await p.click('text=Retry part 4');
  await attend(p, () => /^blob:/.test(document.getElementById('tVideo').src), null, 20000);
  ok(posts('/studio/kling/entier/' + ID + '/reessaie/3').length === 1 && posts('/studio/kling/entier/' + ID + '/lance').length === 1, 'la relance vise la seule part 4 ; rien n est relance d autre');

  console.log('\n-- 7. la fin --');
  ok(/Done: 10 parts glued, original sound, 94\.0 s/.test(await p.textContent('#tStatut')), 'statut : fini, son d origine, 94 s');
  ok(journal.some((x) => x.chemin === '/studio/kling/entier/' + ID + '/video' && x.auth === 'jOwner'), 'la video est lue avec la session');
  ok(/^blob:/.test(await p.getAttribute('#tVideo', 'src')) && await p.isVisible('#tLien') && /^blob:/.test(await p.getAttribute('#tLien', 'href')) && (await p.getAttribute('#tLien', 'download')) === 'swoge_whole.mp4',
     'montree en blob:, et le lien de telechargement apparait maintenant');
  ok(!journal.some((x) => x.erreurPage), 'aucune erreur JavaScript ' + JSON.stringify(journal.filter((x) => x.erreurPage)));

  /* 14/10/2026, vecu : apres la video de 94 s, une passe de 13 s finie dans la MEME page restait
     « Done » sans video — le resultat deja montre suffisait a ne jamais demander le nouveau. */
  console.log('\n-- 7b. une seconde passe dans la meme page --');
  {
    const premier = await p.getAttribute('#tVideo', 'src');
    ID = 'f'.repeat(24);
    await p.setInputFiles('#tClip', F.video);
    S.suite = [etat('pret')];
    await p.click('#tPlan');
    await attend(p, () => !document.getElementById('tLancer').hidden && !document.getElementById('tLancer').disabled);
    S.suite = [etat('fini', { resolution: '720p', morceaux: morceaux(durees.map(() => 'done')), video: '/studio/kling/entier/' + ID + '/video', dureeFinale: 13.1 })];
    await p.click('#tLancer');
    await attend(p, (av) => /^blob:/.test(document.getElementById('tVideo').src) && document.getElementById('tVideo').src !== av, premier, 20000);
    ok(journal.some((x) => x.chemin === '/studio/kling/entier/' + ID + '/video' && x.auth === 'jOwner'), 'la video de la SECONDE passe est demandee au serveur');
    const v = await p.getAttribute('#tVideo', 'src');
    ok(/^blob:/.test(v) && v !== premier && await p.isVisible('#tVideo') && (await p.getAttribute('#tLien', 'href')) === v, 'et montree : un nouveau blob, visible, et le lien suit');
  }
  await p.close();

  console.log('\n-- 8. rechargement, telephone --');
  {
    S.suite = [etat('en_cours', { resolution: '720p', morceaux: morceaux(durees.map((_, i) => (i < 5 ? 'done' : i < 7 ? 'processing' : 'waiting'))) })];
    const q = await ouvre({ largeur: 320 });
    await attend(q, () => /Editing: 5 of 10/.test(document.getElementById('tStatut').textContent));
    ok(/Editing: 5 of 10 parts done \(2 at a time\)/.test(await q.textContent('#tStatut')) && (await q.$$('#tGrille .part')).length === 10, 'une passe en cours reprend apres un rechargement');
    const d = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(d <= 0, 'rien ne deborde a 320 px [' + d + ']');
    await q.close();
  }

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
