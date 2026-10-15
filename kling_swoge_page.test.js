'use strict';
/* ============================================================================
 * KLING_ESSAI.HTML — LE PERSONNAGE SWOGE, LA CIBLE, LA PREMIERE IMAGE (15/10/2026)
 *
 * Le serveur est simule par page.route ; ce que la page DOIT tenir :
 *   1. Un autre portefeuille ne voit pas « SWOGE character » ; le proprietaire la
 *      voit : aucun element, le meme du site en vue de face (choisie), le visage du
 *      site, « Prepare SWOGE views — 2 pictures, about $0.056 ».
 *   2. Prepare : POST /studio/kling/swoge/prepare avec le jeton ; les vues en cours
 *      sont dites, le bouton se ferme ; pretes, elles se lisent AVEC la session
 *      (blob:), jamais par une adresse publique ; un clic les choisit ; « Upload »
 *      envoie une data-URL PNG pour sa vue ; « Regenerate » une seule vue.
 *   3. L'element : « Create the element », en creation, puis « Element 829 in
 *      service » ; la reference de l'edition le dit ; « Delete the element ».
 *   4. « Who to replace » (seule par defaut) reecrit la phrase de cible du texte,
 *      exactement comme le serveur (swoge_texte.js) ; un texte reecrit a la main
 *      n'est pas touche.
 *   5. « Prepare first frame » : ferme sans clip ; le clip et la cible partent ;
 *      l'image d'origine et 2 candidats lus avec la session ; un clic choisit ;
 *      « Regenerate » ; l'edition envoie l'id de l'image choisie. La video
 *      entiere : ferme sans plan pret.
 *   6. 320, 390 et 1280 px : aucun defilement en largeur ; aucune erreur.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon' };

/* le texte du serveur, s'il est a cote (worktree ou depot) : la page doit le rendre mot pour mot */
let ST = null;
for (const d of [process.env.SRV_DIR, path.join(SITE, '..', 'server'), '/home/user/swoge-pusher-server.github.io']) {
  try { if (d && fs.existsSync(path.join(d, 'swoge_texte.js'))) { ST = require(path.join(d, 'swoge_texte.js')); break; } } catch (e) { ST = null; }
}

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
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'kling-swoge-page-'));
  const F = { clip: path.join(dossier, 'clip.mp4'), vue: path.join(dossier, 'vue.png') };
  fs.writeFileSync(F.clip, clip(5.2));
  fs.writeFileSync(F.vue, fs.readFileSync(path.join(SITE, 'img/site/icone-192.png')));
  const PNG = fs.readFileSync(path.join(SITE, 'img/site/icone-192.png'));

  /* ---- le faux serveur ---- */
  const journal = [];
  const CIBLES = [{ id: 'gauche', nom: 'The person on the left' }, { id: 'centre', nom: 'The person in the center' }, { id: 'droite', nom: 'The person on the right' }, { id: 'seule', nom: 'The only person in the video' }];
  const base = () => ({ actif: true, element: null, enService: null, choix: { frontal: 'site', visage: 'site', pied: null, profil: null }, defauts: { frontal: '/img/site/swoge_meme_ref.jpg', visage: '/img/site/swoge_face_ref.jpg' },
    vues: [], slots: ['frontal', 'visage', 'pied', 'profil'], generes: ['pied', 'profil'], prixImageUsd: 0.028, imagesJour: 0, imagesJourMax: 8, jeton: '@element_1', cibles: CIBLES });
  const S = { swoge: base(), premiere: null };
  const vueP = (o) => Object.assign({ id: 'c'.repeat(24), cible: 'droite', depuis: 'clip', cotes: '720x1280', format: '9:16', choisi: null, image: '/studio/kling/premiere/' + 'c'.repeat(24) + '/image',
    enCours: false, essais: 1, essaisMax: 4, message: null, candidats: [], prixClicUsd: 0.056 }, o || {});
  const cand = (k) => ({ k, image: '/studio/kling/premiere/' + 'c'.repeat(24) + '/candidat/' + k, largeur: 720, hauteur: 1280 });
  function route(q, url) {
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    let corps = null; try { corps = JSON.parse(q.postData() || 'null'); } catch (e) {}
    journal.push({ m: q.method(), chemin: url.pathname, auth, corps });
    if (auth !== 'jOwner' && auth !== 'jAutre') return [401, { ok: false }];
    if (auth === 'jAutre') return url.pathname === '/studio/kling' && q.method() === 'GET' ? [200, { ok: true, proprietaire: false }] : [403, { ok: false, raison: 'owner only' }];
    const c = url.pathname;
    if (c === '/studio/kling' && q.method() === 'GET') {
      return [200, { ok: true, proprietaire: true, actif: true, modeles: { 'kling-2.6': { durees: [5, 10], prix: { '720p': { off: 0.042 } }, audioReglable: true } }, essais: [],
        edition: { modele: 'kling-o1', prixParSeconde: { '720p': 0.126, '1080p': 0.168 }, dureeMinS: 3, dureeMaxS: 10, octetsMax: 20 * 1024 * 1024, imageOctetsMax: 6 * 1024 * 1024, enCours: [] },
        wan: { actif: false }, swoge: S.swoge,
        entier: { modele: 'kling-o1', prixParSeconde: { '720p': 0.126, '1080p': 0.168 }, dureeMinS: 3, dureeMaxS: 10, cibleS: 9.5, dureeEntierMaxS: 180, octetsMax: 100 * 1024 * 1024,
          imagesMax: 4, imageOctetsMax: 6 * 1024 * 1024, plafondUsd: 20, parallele: 2, gardeH: 48, passe: null } }];
    }
    if (c === '/studio/kling/swoge' && q.method() === 'GET') return [200, Object.assign({ ok: true }, S.swoge)];
    if (c === '/studio/kling/swoge/prepare') {
      const vues = (corps && corps.vues) || ['pied', 'profil'];
      vues.forEach((v, i) => S.swoge.vues.push({ id: (v === 'pied' ? 'a' : 'b') + String(S.swoge.vues.length).padStart(11, '0'), slot: v, source: 'kling', statut: 'en_cours', image: null }));
      S.swoge.imagesJour += vues.length;
      return [200, { ok: true, etat: S.swoge }];
    }
    if (c === '/studio/kling/swoge/choisit') { S.swoge.choix[corps.slot] = corps.id; return [200, { ok: true, etat: S.swoge }]; }
    if (c === '/studio/kling/swoge/vue') { S.swoge.vues.push({ id: 'e00000000001', slot: corps.slot, source: 'upload', statut: 'pret', image: '/studio/kling/swoge/image/e00000000001' }); return [200, { ok: true, etat: S.swoge }]; }
    if (c === '/studio/kling/swoge/element') { S.swoge.element = { statut: 'creation', elementId: null }; return [200, { ok: true, etat: S.swoge }]; }
    if (c === '/studio/kling/swoge/supprime') { S.swoge.element = null; S.swoge.enService = null; return [200, { ok: true, etat: S.swoge }]; }
    if (c === '/studio/kling/premiere' && q.method() === 'POST') { S.premiere = vueP({ enCours: true }); return [200, { ok: true, premiere: S.premiere }]; }
    if (c === '/studio/kling/premiere/' + 'c'.repeat(24) && q.method() === 'GET') return [200, { ok: true, premiere: S.premiere }];
    if (c === '/studio/kling/premiere/' + 'c'.repeat(24) + '/choisit') { S.premiere.choisi = corps.k; return [200, { ok: true, premiere: S.premiere }]; }
    if (c === '/studio/kling/premiere/' + 'c'.repeat(24) + '/regenere') { S.premiere = vueP(Object.assign({}, S.premiere, { enCours: true, essais: 2 })); return [200, { ok: true, premiere: S.premiere }]; }
    if (c === '/studio/kling/edition') return [200, { ok: true, id: 'O1T', statut: 'submitted', estimationUsd: 0.756 }];
    if (c === '/studio/kling/O1T') return [200, { ok: true, id: 'O1T', statut: 'processing' }];
    return [404, { ok: false, raison: 'unknown' }];
  }
  const ouvre = async ({ session, largeur } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1280, height: 900 } });
    if (session) await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} }, session);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { journal.push({ erreurPage: String(e) }); });
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const q = r.request(), u = new URL(q.url());
      if (/^\/studio\/kling\/(swoge\/image\/[0-9a-f]{12}|premiere\/[0-9a-f]{24}\/(image|candidat\/\d))$/.test(u.pathname)) {
        const auth = String(q.headers().authorization || '');
        journal.push({ m: 'GET', chemin: u.pathname, auth: auth.replace(/^Bearer /, ''), image: true });
        return auth === 'Bearer jOwner' ? r.fulfill({ status: 200, contentType: 'image/png', body: PNG }) : r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
      }
      if (/^\/studio\/kling(\/|$)/.test(u.pathname)) { const [code, o] = route(q, u); return r.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(o) }); }
      return r.abort();
    });
    await p.goto('http://127.0.0.1:' + port + '/kling_essai.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    return p;
  };
  const attend = async (p, f, max) => { try { await p.waitForFunction(f, null, { timeout: max || 8000 }); return true; } catch (e) { return false; } };
  const debord = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const posts = (c) => journal.filter((x) => x.m === 'POST' && x.chemin === c);

  console.log('-- 1. qui voit « SWOGE character » --');
  {
    const p = await ouvre({ session: 'jAutre' });
    ok(await p.isHidden('#swoge'), 'un autre portefeuille : la section est cachee');
    await p.context().close();
  }
  const p = await ouvre({ session: 'jOwner' });
  ok(await p.isVisible('#swoge'), 'le proprietaire : visible');
  ok(/No element yet: SWOGE edits send the two pictures \(@image_1 full body, @image_2 face\)/.test(await p.textContent('#sElement')), 'aucun element : les deux images, dit');
  const blocs = await p.$$eval('#sVues .vue', (l) => l.map((d) => d.getAttribute('data-slot') + ':' + d.querySelector('b').textContent));
  ok(blocs.join('|') === 'frontal:Frontal picture (main)|visage:Face close-up|pied:Full body, front|profil:3/4 side view', 'quatre vues : frontal, visage, corps de face, trois quarts');
  const fr = await p.$eval('#sVues .vue[data-slot="frontal"] .cand', (b) => ({ on: b.getAttribute('aria-pressed'), src: b.querySelector('img').getAttribute('src') }));
  ok(fr.on === 'true' && fr.src === 'img/site/swoge_meme_ref.jpg', 'la vue de face : le meme du site, choisie');
  ok(await p.textContent('#sPrepare') === 'Prepare SWOGE views — 2 pictures, about $0.056' && await p.isEnabled('#sPrepare'), '« Prepare SWOGE views — 2 pictures, about $0.056 »');
  ok(/Swole Doge picture/.test(await p.textContent('#sPrepareInfo')) && /0 of 8 pictures made today/.test(await p.textContent('#sPrepareInfo')), 'le prix par image et le compte du jour');
  ok(await p.textContent('#eRefNom') === 'SWOGE (default: full body @image_1, face @image_2)' && /swoge_meme_ref\.jpg$/.test(await p.getAttribute('#eVign', 'src')), 'l edition : le meme en @image_1, le visage en @image_2');

  console.log('\n-- 2. les vues --');
  await p.click('#sPrepare');
  await attend(p, () => document.querySelectorAll('#sVues .cand[disabled]').length === 2);
  ok(posts('/studio/kling/swoge/prepare').length === 1 && posts('/studio/kling/swoge/prepare')[0].auth === 'jOwner' && JSON.stringify(posts('/studio/kling/swoge/prepare')[0].corps) === '{}', 'POST prepare avec le jeton, sans rien d autre');
  ok((await p.$$eval('#sVues .cand[disabled] span', (l) => l.map((s) => s.textContent))).join('|') === 'Being made…|Being made…' && await p.isDisabled('#sPrepare'), 'deux vues « Being made… », Prepare ferme');
  for (const v of S.swoge.vues) { v.statut = 'pret'; v.image = '/studio/kling/swoge/image/' + v.id; }
  ok(await attend(p, () => document.querySelectorAll('#sVues .vue[data-slot="pied"] img').length === 1 && /^blob:/.test(document.querySelector('#sVues .vue[data-slot="pied"] img').src), 9000),
     'pretes : la vue se relit seule et s affiche en blob:');
  ok(journal.filter((x) => x.image).every((x) => x.auth === 'jOwner') && journal.some((x) => x.image), 'les images des vues lues AVEC la session');
  await p.click('#sVues .vue[data-slot="pied"] .cand');
  ok(JSON.stringify(posts('/studio/kling/swoge/choisit').pop().corps) === JSON.stringify({ slot: 'pied', id: S.swoge.vues[0].id })
     && await attend(p, () => document.querySelector('#sVues .vue[data-slot="pied"] .cand').getAttribute('aria-pressed') === 'true'), 'un clic choisit la vue de face generee');
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#sVues .vue[data-slot="profil"] .actions button')]);
  await chooser.setFiles(F.vue);
  await attend(p, () => document.querySelectorAll('#sVues .vue[data-slot="profil"] .cand').length === 2);
  const up = posts('/studio/kling/swoge/vue').pop();
  ok(up && up.corps.slot === 'profil' && /^data:image\/png;base64,/.test(up.corps.image), '« Upload » : une data-URL PNG pour la vue de trois quarts');
  await p.click('#sVues .vue[data-slot="profil"] [data-regen="profil"]');
  ok(JSON.stringify(posts('/studio/kling/swoge/prepare').pop().corps) === JSON.stringify({ vues: ['profil'] }), '« Regenerate » : une seule vue');
  for (const v of S.swoge.vues) if (v.statut === 'en_cours') { v.statut = 'pret'; v.image = '/studio/kling/swoge/image/' + v.id; }

  console.log('\n-- 3. l element --');
  await p.click('#sCree');
  await attend(p, () => /Creating the element/.test(document.getElementById('sElement').textContent));
  ok(posts('/studio/kling/swoge/element').length === 1 && await p.isDisabled('#sCree'), 'Create : POST element, le bouton se ferme pendant la creation');
  S.swoge.element = { statut: 'pret', elementId: '829', deduction: '2' }; S.swoge.enService = '829';
  ok(await attend(p, () => /Element 829 in service: SWOGE edits send it as @element_1\. Kling deducted 2 units\./.test(document.getElementById('sElement').textContent), 9000), '« Element 829 in service … @element_1 », la deduction dite');
  ok(await p.textContent('#eRefNom') === 'SWOGE element 829 (@element_1) — sent instead of the two pictures' && await p.textContent('#sCree') === 'Re-create the element' && await p.isVisible('#sSupprime'),
     'l edition dit l element ; « Re-create the element », « Delete the element »');
  await p.click('#sSupprime');
  await attend(p, () => /No element yet/.test(document.getElementById('sElement').textContent));
  ok(posts('/studio/kling/swoge/supprime').length === 1 && await p.isHidden('#sSupprime') && /full body @image_1/.test(await p.textContent('#eRefNom')), 'Delete : POST supprime, retour aux deux images');

  console.log('\n-- 4. qui remplacer --');
  const defaut = await p.inputValue('#ePrompt');
  ok(await p.inputValue('#eCible') === 'seule' && /^Replace the only person in @video_1 with the exact SWOGE character of @image_1 \(full body\) and @image_2 \(face\)/.test(defaut) && (!ST || defaut === ST.texte('seule', false))
     && await p.inputValue('#tPrompt') === defaut, 'par defaut : « the only person », le texte du serveur mot pour mot' + (ST ? '' : ' (serveur absent : phrases seulement)'));
  for (const c of ['droite', 'gauche', 'centre', 'seule']) {
    await p.selectOption('#eCible', c);
    const t = await p.inputValue('#ePrompt');
    ok(ST ? t === ST.texte(c, false) : t.indexOf('Replace ') === 0, 'cible « ' + c + ' » : ' + t.slice(0, 70) + '…' + (ST ? ' = serveur' : ''));
  }
  await p.selectOption('#tCible', 'droite');
  ok(/^Replace ONLY the person on the RIGHT side of the frame in @video_1/.test(await p.inputValue('#tPrompt')) && /The other people stay exactly as they are\. Keep the camera/.test(await p.inputValue('#tPrompt')), 'video entiere : la meme reecriture');
  await p.fill('#ePrompt', 'Swap the drummer for @image_1 in @video_1.');
  await p.selectOption('#eCible', 'droite');
  ok(await p.inputValue('#ePrompt') === 'Swap the drummer for @image_1 in @video_1.' && /change who to replace by hand/.test(await p.textContent('#eCibleInfo')), 'un texte ecrit a la main : pas touche, dit');
  await p.fill('#ePrompt', ST ? ST.texte('droite', false) : defaut);

  console.log('\n-- 5. la premiere image --');
  ok(await p.isDisabled('#ePrep') && await p.textContent('#ePrep') === 'Prepare first frame — 2 pictures, about $0.056' && await p.isDisabled('#tPrep'), 'sans clip (ni plan) : « Prepare first frame » ferme, son prix dit');
  await p.setInputFiles('#eClip', F.clip);
  await attend(p, () => !document.getElementById('ePrep').disabled);
  await p.click('#ePrep');
  await attend(p, () => document.querySelectorAll('#eCands .cand').length >= 1);
  const pr = posts('/studio/kling/premiere').pop();
  ok(pr && pr.auth === 'jOwner' && /^data:video\/mp4;base64,/.test(pr.corps.video) && pr.corps.cible === 'droite' && Object.keys(pr.corps).length === 2, 'POST premiere : le clip (data-URL MP4) et la cible, rien d autre');
  S.premiere = vueP({ candidats: [cand(0), cand(1)] });
  ok(await attend(p, () => document.querySelectorAll('#eCands .cand img').length === 3 && [...document.querySelectorAll('#eCands .cand img')].every((i) => /^blob:/.test(i.src)), 9000),
     'l image d origine et 2 candidats, lus avec la session (blob:)');
  ok(/Pick the picture where SWOGE looks right/.test(await p.textContent('#ePrepInfo')) && await p.isVisible('#eRegen'), 'la consigne, « Regenerate »');
  await p.click('#eCands .cand:nth-child(3)');
  await attend(p, () => document.querySelector('#eCands .cand:nth-child(3)').getAttribute('aria-pressed') === 'true');
  ok(JSON.stringify(posts('/studio/kling/premiere/' + 'c'.repeat(24) + '/choisit').pop().corps) === JSON.stringify({ k: 1 }), 'un clic choisit le second candidat');
  await p.click('#eLancer');
  await attend(p, () => /Sent to Kling/.test(document.getElementById('eStatut').textContent));
  const ed = posts('/studio/kling/edition').pop();
  ok(ed && ed.corps.premiere === 'c'.repeat(24) && !ed.corps.image, 'l edition envoie l id de l image choisie (et pas d image)');
  await p.click('#eRegen');
  ok(posts('/studio/kling/premiere/' + 'c'.repeat(24) + '/regenere').length === 1, '« Regenerate » : POST regenere');
  await p.context().close();

  console.log('\n-- 6. les largeurs --');
  for (const largeur of [320, 390, 1280]) {
    const q = await ouvre({ session: 'jOwner', largeur });
    await attend(q, () => document.querySelectorAll('#sVues .vue').length === 4);
    ok(await q.isVisible('#swoge') && await debord(q) <= 0, largeur + ' px : « SWOGE character » sans defilement en largeur');
    const b = await q.$eval('#sPrepare', (x) => x.getBoundingClientRect().right <= window.innerWidth);
    ok(b && await q.isVisible('#eCible'), largeur + ' px : les boutons et « Who to replace » tiennent dans l ecran');
    await q.context().close();
  }
  ok(!journal.some((x) => x.erreurPage), 'aucune erreur dans la page' + journal.filter((x) => x.erreurPage).map((x) => ' [' + x.erreurPage + ']').join(''));

  await nav.close(); srv.close();
  fs.rmSync(dossier, { recursive: true, force: true });
  console.log('\nkling_swoge_page.test.js : ' + n + ' verifications' + (rates ? ', RATES : ' + rates + '/' + n : ', tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
