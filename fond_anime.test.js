'use strict';
/*
 * LE FOND D'ECRAN ANIME : PRESENT, LEGER, ET JAMAIS UN COUT POUR QUI N'EN VEUT PAS.
 *
 * « Un fond d'écran pas trop rempli pour chaque page, animé en vidéo » (01/10).
 * Ce qui se verifie :
 *   - chaque page qui le demande l'a, et le film JOUE (pas seulement « charge ») ;
 *   - il est derriere tout (`z-index:-1`) et ne prend jamais le pointeur ;
 *   - il est visible meme quand <html> porte sa propre couleur : sans
 *     `isolation:isolate` sur le <body>, le fond du <body> le recouvrait
 *     (swogebet, predict, agents — mesure le 01/10) ;
 *   - les fichiers tiennent dans leur budget ;
 *   - ni film pour qui demande moins de mouvement, ni sous 700 pixels.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('fond_anime.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
            '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json' };

/* La liste est relue dans les pages, pas recopiee ici. */
const PAGES = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'))
  .map((f) => { const m = /fond_anime\.js\?v=[0-9a-f]+" data-fond="([a-z_]+)"/.exec(fs.readFileSync(path.join(SITE, f), 'utf8'));
                return m ? { f, nom: m[1] } : null; })
  .filter(Boolean);

const srv = http.createServer((q, r) => {
  const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d);
  });
});

(async () => {
  console.log('-- les fichiers --');
  const attendues = ['games.html', 'swogebet.html', 'swoge_ai.html', 'swoge_perp.html', 'swoge_predict.html',
                     'swoge_polymarket_ai.html', 'swoge_agents.html', 'whitepaper.html', 'swoge_wallet.html'];
  ok(attendues.every((a) => PAGES.some((p) => p.f === a)),
     'les neuf pages du menu ont leur fond (' + PAGES.map((p) => p.f + ':' + p.nom).join(', ') + ')');
  for (const p of PAGES) {
    const t = (f) => { try { return fs.statSync(path.join(SITE, f)).size; } catch (e) { return -1; } };
    const mp4 = t('media/fond_' + p.nom + '.mp4'), webm = t('media/fond_' + p.nom + '.webm'), af = t('img/site/fonds/' + p.nom + '.webp');
    /* 03/10 : « un fond plus rempli » pour le portefeuille (maquette du proprietaire : une ville
       claire, des plantes). Un decor PLEIN ne tient pas dans le budget d'un fond qui s'efface :
       mesure a l'encodage (960 x 540, 16 s en aller-retour, CRF 34 / VP9 CRF 50) 296 Ko en mp4,
       228 Ko en webm, affiche 49 Ko. Il ne se charge qu'au-dessus de 700 pixels, apres la page. */
    const plein = p.nom === 'wallet';
    ok(mp4 > 0 && mp4 <= (plein ? 320000 : 130000) && webm > 0 && webm <= (plein ? 240000 : 60000) && af > 0 && af <= (plein ? 52000 : 12000),
       p.nom + ' : film ' + mp4 + ' o (mp4) / ' + webm + ' o (webm), affiche ' + af + ' o — dans le budget');
  }

  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  const ouvre = async (f, w, h, opts) => {
    const ctx = await nav.newContext(Object.assign({ viewport: { width: w, height: h } }, opts || {}));
    const page = await ctx.newPage();
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 160)));
    await page.addInitScript(() => { try { sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {} });
    await page.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
    await page.goto(BASE + '/' + f, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(1800);
    return { ctx, page, boum };
  };
  const lit = (page) => page.evaluate(() => {
    const d = document.querySelector('.sw-fond-anime');
    if (!d) return null;
    const v = d.querySelector('video'), cs = getComputedStyle(d);
    return { z: cs.zIndex, pos: cs.position, ptr: cs.pointerEvents, iso: getComputedStyle(document.body).isolation,
             affiche: /img\/site\/fonds\//.test(cs.backgroundImage), film: !!v,
             joue: !!(v && !v.paused && v.currentTime > 0), src: v ? v.currentSrc.split('/').pop() : '' };
  });

  console.log('\n-- sur grand ecran, il joue --');
  for (const p of PAGES) {
    const { ctx, page } = await ouvre(p.f, 1440, 900);
    const m = await lit(page);
    ok(m && m.z === '-1' && m.pos === 'fixed' && m.ptr === 'none' && m.iso === 'isolate' && m.affiche,
       p.f + ' : derriere tout, sourd au pointeur, visible malgre le fond de la page');
    ok(m && m.joue && m.src.indexOf('fond_' + p.nom) === 0, p.f + ' : le film joue (' + (m && m.src) + ')');
    await ctx.close();
  }

  console.log('\n-- et il ne coute rien a qui n en veut pas --');
  {
    const { ctx, page } = await ouvre('games.html', 1440, 900, { reducedMotion: 'reduce' });
    const m = await lit(page);
    ok(m && m.affiche && !m.film, 'moins de mouvement demande : l affiche seule, aucun film');
    await ctx.close();
  }
  {
    const { ctx, page } = await ouvre('swogebet.html', 390, 844);
    const m = await lit(page);
    ok(m && m.affiche && !m.film, 'sous 700 pixels : l affiche seule — le centre du film est vide en portrait');
    await ctx.close();
  }
  {
    const { ctx, page } = await ouvre('swoge_wallet.html', 1440, 900);
    const films = await page.evaluate(() => [...document.querySelectorAll('.vt-film video')].map((v) => v.getAttribute('src')));
    ok(films.length === 2 && films.every((s) => s === null),
       'les deux films de SWOGE dans le portefeuille ne se chargent qu une fois a l ecran');
    await page.evaluate(() => document.querySelector('.vt-film video').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(1500);
    const un = await page.evaluate(() => { const v = document.querySelector('.vt-film video');
      return { src: (v.currentSrc || '').split('/').pop(), joue: !v.paused && v.currentTime > 0 }; });
    ok(un.joue && /^wallet_casino\./.test(un.src), 'et celui du coffre joue quand on y arrive (' + un.src + ')');
    await ctx.close();
  }

  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
