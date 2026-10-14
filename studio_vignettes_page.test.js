'use strict';
/* ============================================================================
 * SWOGE STUDIO (studio.html) — LES VIGNETTES ANIMEES DES CARTES DE MODELES
 *
 * Demande du proprietaire (14/10/2026) : « anime les images en video ». Une
 * carte presente dans la table VIDEOS recoit une <video> posee sur son image.
 * Ce que la page DOIT tenir (faux reseau, vraies videos fabriquees par ffmpeg) :
 *   1. carte de la table : <video muted loop playsinline preload="none">, poster
 *      = l'image de la carte, meme object-fit et object-position que l'image ;
 *      WebM d'abord, MP4 ensuite ; l'image reste dessous ;
 *   2. elle ne joue QUE visible : rien n'est telecharge pour une carte hors de
 *      l'ecran ; a l'ecran elle joue ; sortie de l'ecran elle s'arrete ;
 *   3. une carte « Coming soon » garde son gris (la video aussi) ;
 *   4. un fichier absent (404 sur les deux sources), ou illisible (MP4 seul
 *      dans un Chromium sans H.264) : la video s'en va, l'image reste ;
 *   5. prefers-reduced-motion : aucune video, aucun telechargement, l'image ;
 *   6. une carte hors de la table : l'image seule ;
 *   7. la VRAIE page : chaque carte de sa table a ses deux fichiers dans
 *      media/studio/ (une entree sans fichier serait une video qui ne vient
 *      jamais) ; table vide = aucune video, aucune requete ;
 *   8. 320 px : pas de defilement horizontal avec les videos.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { execFileSync } = require('child_process');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + (a === b ? '' : ' au lieu de ' + JSON.stringify(b)) + ']');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.webmanifest': 'application/json', '.svg': 'image/svg+xml' };
const HOTE = 'web-production-220a3.up.railway.app';
/* le catalogue fige du 12/10 (le meme que studio_media_page.test.js sans le depot du serveur) */
const CAT = { ouvert: true, videoOuverte: true, note: null, videoNote: null, marge: 1.5,
  image: { fournisseurs: [{ id: 'grok', nom: 'Grok Imagine', actif: true, modeles: [{ id: 'rapide', nom: 'Speed', parImageSwoge: 710, parImageUsd: 0.03 }, { id: 'qualite', nom: 'Quality (2.0)', parImageSwoge: 1419, parImageUsd: 0.06 }] },
    { id: 'openai', nom: 'ChatGPT Image', actif: true, modeles: [{ id: 'rapide', nom: 'Speed', parImageSwoge: 7333, parImageUsd: 0.3102, estime: true }, { id: 'qualite', nom: 'Quality', parImageSwoge: 7333, parImageUsd: 0.3102, estime: true }] }],
    formats: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'], nombres: [1, 2, 4] },
  video: { modeles: [{ id: 'rapide', nom: 'Speed', parSecondeSwoge: 1774, typiqueSwoge: 10639 }, { id: 'qualite', nom: 'Quality (1.5)', parSecondeSwoge: 2837, typiqueSwoge: 17022 }],
    formats: ['auto', '16:9', '9:16', '1:1'], durees: [6, 10], resolutions: ['480p', '720p'] } };
/* la table de l'essai : deux cartes completes (dont une « Coming soon »), une sans fichier,
   une avec le MP4 seul */
const TABLE = { 'grok:rapide': 't1', 'kling-i': 't1', upscale: 't1', 'openai:qualite': 't1' };
const SRC = fs.readFileSync(path.join(SITE, 'studio.html'), 'utf8');
const RE_TABLE = /var VIDEOS = (\{[^;]*\});/;

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const mt = RE_TABLE.exec(SRC);
  ok(!!mt, 'la page porte sa table VIDEOS');
  /* ---- 7. la vraie table : chaque entree a ses deux fichiers ---- */
  let vraie = {};
  try { vraie = JSON.parse(mt[1]); } catch (e) { ok(false, 'la table VIDEOS se lit en JSON (' + e.message + ')'); }
  for (const id of Object.keys(vraie)) {
    const f = 'media/studio/' + id.replace(/:/g, '-');
    ok(fs.existsSync(path.join(SITE, f + '.webm')) && fs.existsSync(path.join(SITE, f + '.mp4')), id + ' : ' + f + '.webm et .mp4 publies');
  }

  /* ---- les vraies videos de l'essai (ffmpeg) ---- */
  const media = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-vignettes-'));
  const fab = (args, sortie) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=426x240:rate=24', '-t', '2', '-an'].concat(args, [path.join(media, sortie)]));
  fab(['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-pix_fmt', 'yuv420p'], 'grok-rapide.webm');
  fab(['-c:v', 'libx264', '-pix_fmt', 'yuv420p'], 'grok-rapide.mp4');
  fs.copyFileSync(path.join(media, 'grok-rapide.webm'), path.join(media, 'kling-i.webm'));
  fs.copyFileSync(path.join(media, 'grok-rapide.mp4'), path.join(media, 'kling-i.mp4'));
  fs.copyFileSync(path.join(media, 'grok-rapide.mp4'), path.join(media, 'openai-qualite.mp4'));   /* MP4 seul */

  const demandes = [];
  const page0 = SRC.replace(RE_TABLE, 'var VIDEOS = ' + JSON.stringify(TABLE) + ';');
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    if (u.startsWith('/media/studio/')) demandes.push(u);
    const f = u.startsWith('/media/studio/') ? path.join(media, path.basename(u)) : path.join(SITE, u);
    if (u === '/studio.html' || u === '/studio_essai.html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(u === '/studio.html' ? SRC : page0); }
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  async function ouvre(opts, fichier) {
    const ctx = await nav.newContext(opts);
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.hostname === '127.0.0.1') return r.continue();
      if (u.hostname === HOTE) {
        if (u.pathname === '/studio/media/catalogue') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(CAT) });
        return r.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":false}' });
      }
      return r.abort();
    });
    await page.goto(base + (fichier || 'studio_essai.html'));
    await page.waitForSelector('.mcard[data-id="grok:rapide"]', { timeout: 15000 });
    return { ctx, page, erreurs };
  }
  const thumb = (page, id) => page.evaluate((id) => {
    const t = document.querySelector('.mcard[data-id="' + id + '"] .thumb');
    if (!t) return null;
    const img = t.querySelector('img'), v = t.querySelector('video');
    const ci = getComputedStyle(img), cv = v ? getComputedStyle(v) : null;
    return { img: img.getAttribute('src'), imgPos: ci.objectPosition, imgFit: ci.objectFit, imgVisible: ci.display !== 'none' && ci.visibility !== 'hidden',
      video: !!v, poster: v && v.getAttribute('poster'), muted: v && v.muted, loop: v && v.loop, inline: v && v.playsInline, preload: v && v.getAttribute('preload'),
      sources: v ? [...v.querySelectorAll('source')].map((s) => s.getAttribute('src')) : [], pos: cv && cv.objectPosition, fit: cv && cv.objectFit,
      joue: !!(v && v.classList.contains('joue')), paused: v ? v.paused : null, filtre: cv && cv.filter, opacite: cv && cv.opacity,
      vu: (() => { const b = t.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; })() };
  }, id);
  const attends = async (f, ms) => { const t0 = Date.now(); for (;;) { const x = await f(); if (x || Date.now() - t0 > (ms || 8000)) return x; await new Promise((r) => setTimeout(r, 100)); } };

  console.log('-- 1, 2, 3, 6. bureau, mouvement permis --');
  {
    const { ctx, page, erreurs } = await ouvre({ viewport: { width: 1440, height: 900 } });
    const g = await thumb(page, 'grok:rapide');
    ok(g.video && g.poster === g.img && g.img === 'img/site/accueil/ia.webp', 'grok:rapide : une video, poster = l image de la carte (' + g.poster + ')');
    ok(g.muted && g.loop && g.inline && g.preload === 'none', 'muette, en boucle, inline, preload none');
    ok(g.sources.length === 2 && /grok-rapide\.webm\?v=t1$/.test(g.sources[0]) && /grok-rapide\.mp4\?v=t1$/.test(g.sources[1]), 'WebM d abord, MP4 ensuite, versionnes (' + g.sources.join(', ') + ')');
    ok(g.fit === 'cover' && g.pos === g.imgPos && g.imgVisible, 'meme cadrage que l image (cover, ' + g.pos + '), l image reste dessous');
    const k = await thumb(page, 'kling-i');
    ok(k.video && k.pos === k.imgPos && k.pos === '50% 23%', 'une carte a point propre (kling-i) : la video prend la meme object-position (' + k.pos + ')');
    const sans = await thumb(page, 'openai:rapide');
    ok(sans && !sans.video, 'une carte hors de la table : l image seule');
    /* le fondu d'entree dure 0,45 s : on lit l'opacite une fois qu'il est fini. La carte est AMENEE a
       l'ecran, comme les autres plus bas : depuis l'affiche du credit (14/10, 81 px sous le prix) elle
       n'en depasse plus que 15 px a 1440 x 900 ; l'intention est « a l'ecran, elle joue », pas un pli fixe. */
    await page.evaluate(() => document.querySelector('.mcard[data-id="grok:rapide"]').scrollIntoView({ block: 'center' }));
    const jg = await attends(async () => { const x = await thumb(page, 'grok:rapide'); return x.joue && !x.paused && Number(x.opacite) === 1 ? x : null; });
    ok(!!jg, 'a l ecran, elle joue et se montre (opacite 1 apres le fondu)');
    await page.evaluate(() => document.querySelector('.mcard[data-id="kling-i"]').scrollIntoView({ block: 'center' }));
    const jk = await attends(async () => { const x = await thumb(page, 'kling-i'); return x.joue && !x.paused && Math.abs(Number(x.opacite) - 0.55) < 0.01 ? x : null; });
    ok(!!jk && /grayscale\(1\)/.test(jk.filtre), 'Coming soon : la video joue en gris, comme l image (' + (jk && jk.filtre) + ', ' + (jk && jk.opacite) + ')');
    /* 4. absent (404 sur les deux) ; MP4 seul dans un Chromium sans H.264 */
    for (const id of ['upscale', 'openai:qualite']) {
      await page.evaluate((id) => document.querySelector('.mcard[data-id="' + id + '"]').scrollIntoView({ block: 'center' }), id);
      const parti = await attends(async () => { const x = await thumb(page, id); return !x.video ? x : null; });
      ok(!!parti && parti.imgVisible, id + (id === 'upscale' ? ' (aucun fichier)' : ' (MP4 seul, illisible ici)') + ' : la video s en va, l image reste');
    }
    ok(demandes.some((u) => /upscale\.mp4$/.test(u)) && demandes.some((u) => /openai-qualite\.webm$/.test(u)), 'les deux sources ont ete essayees avant de rendre la main a l image');
    /* 2. sortie de l'ecran : elle s'arrete */
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const arret = await attends(async () => { const x = await thumb(page, 'grok:rapide'); return !x.vu && x.paused ? x : null; });
    ok(!!arret, 'hors de l ecran : en pause');
    eq(erreurs.length, 0, 'aucune erreur de page' + (erreurs.length ? ' : ' + erreurs[0] : ''));
    await ctx.close();
  }

  console.log('\n-- 2. telephone : rien ne se telecharge hors de l ecran --');
  {
    demandes.length = 0;
    const { ctx, page } = await ouvre({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
    await new Promise((r) => setTimeout(r, 1500));
    const etats = {};
    for (const id of Object.keys(TABLE)) etats[id] = await thumb(page, id);
    const horsEcran = Object.keys(TABLE).filter((id) => etats[id] && !etats[id].vu);
    ok(horsEcran.length >= 1, 'des cartes de la table sont hors de l ecran (' + horsEcran.join(', ') + ')');
    ok(horsEcran.every((id) => !demandes.some((u) => u.includes('/' + id.replace(/:/g, '-') + '.'))), 'aucun fichier demande pour elles (' + demandes.join(', ') + ')');
    await page.evaluate(() => document.querySelector('.mcard[data-id="grok:rapide"]').scrollIntoView({ block: 'center' }));
    const vue = await attends(async () => { const x = await thumb(page, 'grok:rapide'); return x.joue && !x.paused ? x : null; });
    const aLecran = [];
    for (const id of Object.keys(TABLE)) { const x = await thumb(page, id); if (x && x.vu) aLecran.push(id.replace(/:/g, '-')); }
    ok(!!vue && demandes.some((u) => /grok-rapide\.webm$/.test(u)) && demandes.every((u) => aLecran.includes(path.basename(u).replace(/\.(webm|mp4)$/, ''))),
       'amenee a l ecran : elle joue, et seules les cartes a l ecran (' + aLecran.join(', ') + ') ont demande leur fichier (' + demandes.join(', ') + ')');
    const larg = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    ok(larg, '390 px : pas de defilement horizontal');
    await ctx.close();
    const c320 = await ouvre({ viewport: { width: 320, height: 640 }, isMobile: true });
    ok(await c320.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 px : pas de defilement horizontal');
    await c320.ctx.close();
  }

  console.log('\n-- 5. prefers-reduced-motion --');
  {
    demandes.length = 0;
    const { ctx, page } = await ouvre({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await new Promise((r) => setTimeout(r, 1200));
    const nb = await page.evaluate(() => document.querySelectorAll('.thumb video').length);
    const g = await thumb(page, 'grok:rapide');
    ok(nb === 0 && g.imgVisible && demandes.length === 0, 'aucune video, aucun telechargement, l image fixe (' + nb + ' video, ' + demandes.length + ' requete)');
    await ctx.close();
  }
  {
    /* la preference qui arrive pendant la visite */
    const { ctx, page } = await ouvre({ viewport: { width: 1440, height: 900 } });
    await attends(async () => (await thumb(page, 'grok:rapide')).joue);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const parti = await attends(async () => { const x = await thumb(page, 'grok:rapide'); return !x.video ? x : null; });
    ok(!!parti && parti.imgVisible, 'reduced-motion pendant la visite : les videos s en vont, l image reste');
    await ctx.close();
  }

  console.log('\n-- 7. la vraie page --');
  {
    demandes.length = 0;
    const { ctx, page } = await ouvre({ viewport: { width: 1440, height: 900 } }, 'studio.html');
    await new Promise((r) => setTimeout(r, 1000));
    const nb = await page.evaluate(() => document.querySelectorAll('.thumb video').length);
    const attendu = Object.keys(vraie).length ? null : 0;
    ok(attendu === null || (nb === 0 && demandes.length === 0), 'table vide : aucune video, aucune requete media (' + nb + ', ' + demandes.length + ')');
    await ctx.close();
  }

  await nav.close(); srv.close();
  fs.rmSync(media, { recursive: true, force: true });
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
