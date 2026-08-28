'use strict';
/*
 * L'AVATAR DU HAUT DE PAGE : LE VISAGE, ET SON CADRE.
 *
 * ---- ce qui etait demande ----
 *
 * « le bouton profil en haut des pages devrait afficher le logo du compte avec
 * sa banniere de niveau, et recale bien la banniere avec la photo, il y a un
 * decalage, trop petite la photo ».
 *
 * ---- les trois choses qui n'allaient pas ----
 *
 *  1. LE BOUTON DE LA PAGE N'ETAIT JAMAIS PEINT. Les six pages principales
 *     posent le leur (`#gxProfil`) et masquent celui de `stakebubble.js` —
 *     deux avatars, c'etait le doublon de trop. Mais la photo, le badge et le
 *     cadre vivaient sur celui qu'on ne voit pas.
 *  2. RIEN NE REPEIGNAIT A L'ARRIVEE DU PROFIL. `peintBouton` ne tournait qu'a
 *     l'authentification et a la montee de niveau — deux moments ou le profil
 *     n'est pas encore la. Le visage apparaissait a l'ouverture du tiroir, et
 *     seulement la.
 *  3. LE CADRE ETAIT MAL CALE. Mesure sur les dix cadres : leur trou fait
 *     67,7 % de la largeur, et son centre est 1,9 % PLUS HAUT que celui de
 *     l'image — la banniere du bas pousse l'anneau vers le haut. Un cadre
 *     centre posait donc son trou au-dessus de la photo, toujours du meme
 *     cote.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('avatar_page.test.js : playwright absent — essai saute'); process.exit(0); }

const SITE = __dirname;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json' };

(async () => {
  const s = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const port = s.address().port;
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  for (const page of ['index.html', 'games.html', 'nexus.html', 'swogebet.html']) {
    console.log(`\n-- ${page} --`);
    const p = await nav.newPage({ viewport: { width: 1200, height: 900 } });
    /* On enveloppe la socket pour pouvoir lui GLISSER un profil : c'est le
       message qui porte le visage, et il arrive normalement du serveur. */
    await p.addInitScript(() => {
      window.__s = [];
      const N = window.WebSocket;
      function C(u, pr) { const x = (pr === undefined) ? new N(u) : new N(u, pr); window.__s.push(x); return x; }
      C.prototype = N.prototype;
      ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k) => { C[k] = N[k]; });
      window.WebSocket = C;
    });
    await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p.goto(`http://127.0.0.1:${port}/${page}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2300);

    const avant = await p.evaluate(() => {
      const el = document.getElementById('gxProfil');
      return { la: !!el, image: el ? getComputedStyle(el).backgroundImage !== 'none' : false };
    });
    ok(avant.la, 'la page porte son bouton de compte');
    ok(!avant.image, 'et il ne montre rien tant qu on ne sait pas qui c est');

    await p.evaluate(() => {
      const m = { type: 'profile', profile: {
        address: '0x1111111111111111111111111111111111111111',
        name: 'Essai', visage: 'b3', niveau: 12, palier: 'ALPHA', palierNo: 5 } };
      (window.__s || []).forEach((x) => {
        try { x.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(m) })); } catch (e) {}
      });
    });
    await p.waitForTimeout(400);

    const v = await p.evaluate(() => {
      const el = document.getElementById('gxProfil');
      const cs = getComputedStyle(el), ap = getComputedStyle(el, '::after');
      const r = el.getBoundingClientRect();
      const px = (x) => parseFloat(x) || 0;
      return {
        image: cs.backgroundImage,
        couvre: cs.backgroundSize,
        cadre: ap.backgroundImage,
        rond: cs.borderRadius,
        /* ---- LA BOITE QUI COMPTE EST L'INTERIEURE ----
         * Un `::after` en pourcentage se mesure sur la boite de REMPLISSAGE,
         * pas sur celle de bordure — et ce bouton porte un liseré d'un pixel.
         * L'image de fond se pose sur la meme boite : c'est donc elle qui dit
         * le rapport entre la photo et son cadre. Comparer a la boite exterieure
         * rendait 129 % la ou le style en demande 136, et l'essai aurait fait
         * corriger un style juste. */
        cote: r.width - px(cs.borderLeftWidth) - px(cs.borderRightWidth),
        cadreL: px(ap.width), cadreH: px(ap.height),
        cadreX: px(ap.left), cadreY: px(ap.top),
      };
    });
    ok(/badge-3\.webp/.test(v.image), 'le visage du compte est pose dessus');
    ok(v.couvre === 'cover', `et il remplit le bouton (${v.couvre})`);
    ok(/cadre-5\.webp/.test(v.cadre), 'avec le cadre de son palier');
    ok(v.rond === '50%', `le bouton devient rond sous un cadre rond (${v.rond})`);

    /* ---- LA GEOMETRIE, QUI EST TOUT LE SUJET ---- */
    const ratio = v.cadreL / v.cote;
    ok(Math.abs(ratio - 1.36) < 0.02,
       `le cadre fait 136 % du bouton (${(ratio * 100).toFixed(0)} %) — a 148 % la photo`
       + ' paraissait petite');
    /* Le centre du cadre doit tomber PLUS BAS que celui du bouton : c'est ce
       qui remonte son trou sur la photo. */
    const centreCadre = v.cadreY + v.cadreH / 2;
    const centreBouton = v.cote / 2;
    const ecart = (centreCadre - centreBouton) / v.cote;
    ok(ecart > 0.015 && ecart < 0.045,
       `et son centre descend de ${(ecart * 100).toFixed(1)} % — le trou remonte sur la photo`);
    /* Horizontalement, en revanche, il reste centre : le trou l'est. */
    const centreX = v.cadreX + v.cadreL / 2;
    ok(Math.abs(centreX - centreBouton) < 0.6,
       `horizontalement il reste centre (${(centreX - centreBouton).toFixed(2)} px)`);
    await p.close();
  }

  await nav.close(); s.close();
  console.log(rates ? `\navatar_page.test.js : ${rates} echec(s) sur ${n}\n`
                    : `\navatar_page.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
