'use strict';
/* ============================================================================
 * KLING_ESSAI.HTML — « EDIT A CLIP » (Kling O1, proprietaire seulement, 14/10/2026)
 *
 * Le serveur est simule par page.route ; ce que la page DOIT tenir :
 *   1. Un autre portefeuille ne voit pas la section ; le proprietaire la voit,
 *      avec le texte demande pre-rempli, 720p, son d'origine coche, le corps
 *      (Swole Doge) et le visage officiel en references par defaut, le bouton ferme tant qu'il n'y a pas de
 *      clip, et aucun lien de telechargement avant un resultat.
 *   2. Un clip hors 3-10 s ou qui n'est pas un MP4 est refuse AVANT toute
 *      requete (duree lue dans la boite mvhd).
 *   3. Un clip de 5,2 s : prix d'apres la grille du serveur, seconde entamee
 *      comptee (6 s × 0,126 $ = 0,756 $ ; 1080p 1,008 $).
 *   4. L'envoi : le clip en data-URL MP4, PAS d'image (le serveur prend
 *      SWOGE), son « original », le jeton en Authorization et aucune adresse.
 *   5. Le suivi, puis la video rendue et un lien de telechargement ; un echec
 *      montre la raison ; une image choisie part en data-URL PNG ; le son
 *      decoche part en « off ».
 *   6. Wan 2.2 (fal) sur le meme clip : prix a 16 images par seconde facturee
 *      (5,2 s → 84 images → 0,42 $ en 720p), envoi a /studio/kling/wan sans
 *      texte ni image, puis le resultat lu AVEC la session (blob:), jamais par
 *      une adresse publique ; sans FAL_KEY, le bouton reste ferme.
 *   7. Rien ne deborde sur un telephone de 320 px.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon' };
/* le texte demande par le proprietaire le 14/10/2026 : le corps de @image_1, le visage EXACT de @image_2 */
const PROMPT = 'Replace the singer in @video_1 with the character of @image_1 (body: huge muscular shirtless Swole Doge, cream-beige fur everywhere, furry dog paws with black pads instead of hands), with exactly the face of @image_2: the classic Doge meme face, pale cream-beige fur (not orange, not red), white cheeks and muzzle, small dark eyes glancing sideways, raised eyebrows, mouth closed in a slight smirk that only opens to lip-sync the words, the head proportionally small on a thick neck. Keep the other person, the camera, the background and the original audio unchanged.';

/* MP4 synthetique : ftyp, mdat, moov/mvhd v0 */
const u32 = (x) => { const b = Buffer.alloc(4); b.writeUInt32BE(x); return b; };
const boite = (type, contenu) => Buffer.concat([u32(8 + contenu.length), Buffer.from(type, 'latin1'), contenu]);
const mvhd0 = (s) => { const c = Buffer.alloc(100); c.writeUInt32BE(1000, 12); c.writeUInt32BE(Math.round(s * 1000), 16); return boite('mvhd', c); };
const clip = (s) => Buffer.concat([boite('ftyp', Buffer.from('isom\0\0\x02\0isomiso2avc1mp41', 'latin1')), boite('mdat', Buffer.alloc(2048, 7)), boite('moov', mvhd0(s))]);

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'kling-edition-page-'));
  const F = { bon: path.join(dossier, 'bon.mp4'), long: path.join(dossier, 'long.mp4'), court: path.join(dossier, 'court.mp4'), faux: path.join(dossier, 'faux.mp4'), ref: path.join(dossier, 'ref.png') };
  const VIDEO = clip(5);
  fs.writeFileSync(F.bon, clip(5.2)); fs.writeFileSync(F.long, clip(12)); fs.writeFileSync(F.court, clip(2));
  fs.writeFileSync(F.faux, fs.readFileSync(path.join(SITE, 'img/site/icone-192.png')));
  fs.writeFileSync(F.ref, fs.readFileSync(path.join(SITE, 'img/site/icone-192.png')));

  /* ---- le faux serveur ---- */
  const journal = [];
  const S = { suite: [], refus: null, wSuite: [], wanActif: true };
  const WAN = () => ({ modele: 'fal-ai/wan/v2.2-14b/animate/replace', actif: S.wanActif, prixParSeconde: { '480p': 0.04, '580p': 0.06, '720p': 0.08 }, fps: 16, imagesParSecondeFacturee: 16, dureeMinS: 3, dureeMaxS: 10, octetsMax: 20 * 1024 * 1024, enCours: [] });
  const EDITION = { modele: 'kling-o1', prixParSeconde: { '720p': 0.126, '1080p': 0.168 }, dureeMinS: 3, dureeMaxS: 10, octetsMax: 20 * 1024 * 1024, imageOctetsMax: 6 * 1024 * 1024, enCours: [] };
  function route(q, url) {
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    let corps = null; try { corps = JSON.parse(q.postData() || 'null'); } catch (e) {}
    journal.push({ m: q.method(), chemin: url.pathname, auth, corps });
    if (auth !== 'jOwner' && auth !== 'jAutre') return [401, { ok: false, raison: 'sign in with your wallet first' }];
    if (auth === 'jAutre') return url.pathname === '/studio/kling' && q.method() === 'GET' ? [200, { ok: true, proprietaire: false }] : [403, { ok: false, raison: 'owner only' }];
    if (url.pathname === '/studio/kling' && q.method() === 'GET') {
      return [200, { ok: true, proprietaire: true, actif: true, modeles: { 'kling-2.6': { durees: [5, 10], prix: { '720p': { off: 0.042 } }, audioReglable: true } }, essais: [], edition: EDITION, wan: WAN() }];
    }
    if (url.pathname === '/studio/kling/edition' && q.method() === 'POST') {
      if (S.refus) { const r = S.refus; S.refus = null; return r; }
      return [200, { ok: true, id: 'O1T', statut: 'submitted', modele: 'kling-o1', estimationUsd: 0.756, reference: corps.image ? 'upload' : 'swoge' }];
    }
    if (url.pathname === '/studio/kling/wan' && q.method() === 'POST') return [200, { ok: true, id: 'a'.repeat(24), statut: 'queued', moteur: 'wan', images: 84, estimationUsd: 0.42 }];
    if (url.pathname === '/studio/kling/wan/' + 'a'.repeat(24) && q.method() === 'GET') {
      const o = S.wSuite.length > 1 ? S.wSuite.shift() : S.wSuite[0];
      return [200, Object.assign({ ok: true, id: 'a'.repeat(24), moteur: 'wan' }, o)];
    }
    if (url.pathname === '/studio/kling/O1T' && q.method() === 'GET') {
      const o = S.suite.length > 1 ? S.suite.shift() : S.suite[0];
      return [200, Object.assign({ ok: true, id: 'O1T', edition: true }, o)];
    }
    return [404, { ok: false, raison: 'unknown' }];
  }
  const ouvre = async ({ session, largeur } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1200, height: 900 } });
    if (session) await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} }, session);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { journal.push({ erreurPage: String(e) }); });
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const q = r.request(), u = new URL(q.url());
      if (/^\/studio\/kling\/wan\/[0-9a-f]{24}\/video$/.test(u.pathname)) {
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
  const lit = async (p, f) => {
    await p.evaluate(() => { document.getElementById('eClipInfo').textContent = ''; document.getElementById('eStatut').textContent = ''; });
    await p.setInputFiles('#eClip', f);
    await p.waitForFunction(() => document.getElementById('eClipInfo').textContent || document.getElementById('eStatut').textContent, null, { timeout: 5000 }).catch(() => {});
    return { info: await p.textContent('#eClipInfo'), erreur: await p.textContent('#eStatut') };
  };
  const posts = () => journal.filter((x) => x.m === 'POST');

  console.log('-- 1. qui voit la section --');
  {
    const p = await ouvre({ session: 'jAutre' });
    ok(await p.isHidden('#edition'), 'un autre portefeuille : section cachee');
    await p.close();
  }
  const p = await ouvre({ session: 'jOwner' });
  ok(await p.isVisible('#edition'), 'le proprietaire : section visible');
  ok(await p.isVisible('text=Edit a clip (replace a person)'), 'son titre, en anglais');
  eq(await p.inputValue('#ePrompt'), PROMPT, 'le texte demande, pre-rempli');
  eq(await p.inputValue('#eResolution'), '720p', '720p par defaut');
  ok(await p.isChecked('#eSon'), 'son d origine coche');
  ok(await p.evaluate(() => /\/img\/site\/swoge_swole_ref\.jpg$/.test(document.getElementById('eVign').src) && document.getElementById('eVign').naturalWidth === 832
     && /\/img\/site\/swoge_face_ref\.jpg$/.test(document.getElementById('eVign2').src) && document.getElementById('eVign2').naturalWidth === 768 && !document.getElementById('eVign2').hidden),
     'les vignettes par defaut : le corps (Swole Doge, 832 px) et le visage (768 px), chargees');
  ok(/@image_2/.test(await p.inputValue('#ePrompt')) && /face of @image_2/.test(await p.inputValue('#ePrompt')), 'le texte prend le visage de @image_2');
  ok(!(await p.isVisible('#eLien')) && !(await p.isVisible('#wLien')) && !(await p.isVisible('#tLien')), 'aucun « Download the result » avant un resultat (l attribut hidden l emporte)');
  ok(await p.isDisabled('#eLancer'), 'bouton ferme sans clip');

  console.log('\n-- 2. les refus avant toute requete --');
  const l1 = await lit(p, F.long);
  ok(/12\.00 s/.test(l1.erreur) && await p.isDisabled('#eLancer'), '12 s : refuse [' + l1.erreur + ']');
  const l2 = await lit(p, F.court);
  ok(/2\.00 s/.test(l2.erreur), '2 s : refuse');
  const l3 = await lit(p, F.faux);
  ok(/not an MP4/.test(l3.erreur), 'une PNG renommee .mp4 : refusee');
  eq(posts().length, 0, 'aucun envoi');

  console.log('\n-- 3. un clip de 5,2 s et son prix --');
  const l4 = await lit(p, F.bon);
  ok(/5\.20 s/.test(l4.info) && !l4.erreur, 'lu : 5,20 s [' + l4.info + ']');
  ok(/\$0\.756/.test(await p.textContent('#ePrix')) && await p.isEnabled('#eLancer'), '720p : ~$0.756 (6 s entamees), bouton ouvert');
  await p.selectOption('#eResolution', '1080p');
  ok(/\$1\.008/.test(await p.textContent('#ePrix')), '1080p : ~$1.008');
  await p.selectOption('#eResolution', '720p');

  console.log('\n-- 4. l envoi et le suivi --');
  S.suite = [{ statut: 'processing' }, { statut: 'succeeded', url: 'https://cdn.kling.example/o1.mp4', duree: 5 }];
  await p.click('#eLancer');
  await p.waitForFunction(() => /Done/.test(document.getElementById('eStatut').textContent), null, { timeout: 15000 }).catch(() => {});
  const c = posts()[0] || {};
  ok(c.chemin === '/studio/kling/edition' && c.auth === 'jOwner', 'POST /studio/kling/edition avec le jeton');
  ok(c.corps && c.corps.video === 'data:video/mp4;base64,' + fs.readFileSync(F.bon).toString('base64'), 'le clip, octet pour octet, en data-URL MP4');
  ok(c.corps && !('image' in c.corps) && c.corps.audio === 'original' && c.corps.resolution === '720p' && c.corps.prompt === PROMPT, 'sans image (SWOGE cote serveur), son original, 720p, le texte');
  ok(c.corps && !JSON.stringify(c.corps).match(/0x[0-9a-fA-F]{40}/), 'aucune adresse dans le corps');
  ok(/Done/.test(await p.textContent('#eStatut')), 'statut : Done');
  eq(await p.getAttribute('#eVideo', 'src'), 'https://cdn.kling.example/o1.mp4', 'la video rendue');
  ok(await p.isVisible('#eLien') && (await p.getAttribute('#eLien', 'href')) === 'https://cdn.kling.example/o1.mp4', 'et le lien de telechargement');

  console.log('\n-- 4b. Wan 2.2 (fal) sur le meme clip --');
  ok(/\$0\.420/.test(await p.textContent('#wPrix')) && await p.isEnabled('#wLancer'), '720p : ~$0.420 (84 images ÷ 16 × 0,08 $), bouton ouvert');
  await p.selectOption('#wResolution', '480p');
  ok(/\$0\.210/.test(await p.textContent('#wPrix')), '480p : ~$0.210');
  await p.selectOption('#wResolution', '720p');
  S.wSuite = [{ statut: 'processing' }, { statut: 'succeeded', son: true, video: '/studio/kling/wan/' + 'a'.repeat(24) + '/video' }];
  await p.click('#wLancer');
  await p.waitForFunction(() => /^blob:/.test(document.getElementById('wVideo').src), null, { timeout: 15000 }).catch(() => {});
  const w = posts().find((x) => x.chemin === '/studio/kling/wan') || {};
  ok(w.auth === 'jOwner' && w.corps && w.corps.video === c.corps.video && w.corps.resolution === '720p' && w.corps.audio === 'original' && !('image' in w.corps) && !('prompt' in w.corps),
     'POST /studio/kling/wan : le meme clip, 720p, son original, ni image ni texte');
  ok(/original sound put back/.test(await p.textContent('#wStatut')), 'statut : son d origine remis');
  ok(journal.some((x) => /\/video$/.test(x.chemin) && x.auth === 'jOwner'), 'le resultat est lu avec la session');
  ok(/^blob:/.test(await p.getAttribute('#wVideo', 'src')) && /^blob:/.test(await p.getAttribute('#wLien', 'href')) && await p.isVisible('#wLien'), 'montre en blob:, et telechargeable');
  eq(await p.getAttribute('#eVideo', 'src'), 'https://cdn.kling.example/o1.mp4', 'le resultat Kling reste a cote pour comparer');

  console.log('\n-- 5. une image choisie, le son coupe, un echec --');
  const [choix] = await Promise.all([p.waitForEvent('filechooser'), p.click('#eImage')]);
  await choix.setFiles(F.ref);
  await p.waitForFunction(() => /^data:image\/png/.test(document.getElementById('eVign').src), null, { timeout: 5000 }).catch(() => {});
  ok(await p.isVisible('#eSansImage') && /icone-192|ref\.png/.test(await p.textContent('#eRefNom')) && !(await p.isVisible('#eVign2')), 'l image choisie remplace les deux vignettes');
  await p.uncheck('#eSon');
  S.refus = [502, { ok: false, raison: 'Kling refused: content risk' }];
  await p.click('#eLancer');
  await p.waitForFunction(() => /Not sent/.test(document.getElementById('eStatut').textContent), null, { timeout: 5000 }).catch(() => {});
  const c2 = posts().filter((x) => x.chemin === '/studio/kling/edition')[1] || {};
  ok(c2.corps && /^data:image\/png;base64,/.test(c2.corps.image) && c2.corps.audio === 'off', 'l image part en data-URL PNG, son « off »');
  ok(/content risk/.test(await p.textContent('#eStatut')) && await p.isEnabled('#eLancer'), 'l echec montre la raison, le bouton se rouvre');
  await p.click('#eSansImage');
  ok(/swoge_swole_ref\.jpg$/.test(await p.getAttribute('#eVign', 'src')) && await p.isVisible('#eVign2'), '« Back to SWOGE » remet les deux references (corps et visage)');
  ok(!journal.some((x) => x.erreurPage), 'aucune erreur JavaScript ' + JSON.stringify(journal.filter((x) => x.erreurPage)));
  await p.close();

  console.log('\n-- 6. sans FAL_KEY --');
  {
    S.wanActif = false;
    const q = await ouvre({ session: 'jOwner' });
    await lit(q, F.bon);
    ok(await q.isDisabled('#wLancer') && /FAL_KEY/.test(await q.textContent('#wPrix')) && await q.isEnabled('#eLancer'), 'Wan ferme (FAL_KEY), Kling ouvert');
    await q.close();
    S.wanActif = true;
  }

  console.log('\n-- 7. telephone de 320 px --');
  {
    const q = await ouvre({ session: 'jOwner', largeur: 320 });
    const d = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(d <= 0 && await q.isVisible('#edition'), 'rien ne deborde a 320 px [' + d + ']');
    await q.close();
  }

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
