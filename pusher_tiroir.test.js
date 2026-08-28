'use strict';
/*
 * SUR LE COIN PUSHER, LE TIROIR DU PROFIL PASSE DEVANT LE JEU.
 *
 * ---- ce qui etait signale ----
 *
 * « Sur le coin pusher le menu passe derriere le jeu il y a un soucis »,
 * capture a l'appui : le tiroir s'ouvre, et a partir de 112 px une bordure
 * sombre le traverse. La ligne « Staking » disparait entierement dessous, et
 * tout le reste du tiroir passe sous l'ombre interieure d'un cadre.
 *
 * ---- ce qui le recouvrait ----
 *
 * `#tablette` : le biseau de la borne d'arcade, un element decoratif en
 * `position:fixed`, `pointer-events:none`, `z-index:9000`, pose sur toute la
 * surface de jeu. Le tiroir, lui, etait a 70.
 *
 * ---- pourquoi relever le tiroir n'aurait servi a rien ----
 *
 * Le tiroir vit DANS l'en-tete, et l'en-tete est `position:fixed` avec un
 * z-index : c'est donc son propre contexte d'empilement. Un enfant n'en sort
 * pas, quel que soit son chiffre — un `z-index:99999` sur le tiroir l'aurait
 * seulement place au-dessus des autres enfants de l'en-tete, toujours sous le
 * biseau. C'est la BARRE qu'il fallait relever ; le tiroir suit.
 *
 * ---- ce que cet essai tient ----
 *
 * Il ne lit pas les z-index : deux chiffres peuvent se comparer dans le bon
 * sens et donner le mauvais rendu, c'est exactement ce qui s'est passe ici. Il
 * REGARDE L'IMAGE — il ouvre le tiroir, prend une capture, et lit la couleur
 * des pixels a l'endroit ou la bordure du biseau traversait. Blanc : le tiroir
 * est devant. Sombre : il est derriere.
 *
 * Et il verifie l'inverse dans la foulee : la meme bordure, PLUS BAS que le
 * tiroir, doit rester sombre. Sans ce second point, supprimer le biseau
 * ferait passer l'essai au vert en cassant le decor.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('pusher_tiroir.test.js : playwright absent — essai saute'); process.exit(0); }

const SITE = __dirname;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.svg': 'image/svg+xml' };

const PAGE = 'swoge_pusher_live.html';
const LARGE = 390, HAUTE = 844;

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
  const p = await nav.newPage({ viewport: { width: LARGE, height: HAUTE },
                                isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
  await p.goto(`http://127.0.0.1:${port}/${PAGE}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);

  /* Le tiroir est dessine par `swogeprofil.js` a partir de l'ancien `#menu`.
     On l'ouvre par le bouton, comme un doigt — et s'il reste vide (pas de
     session), on y pose de quoi occuper la hauteur : ce qui est teste ici est
     l'empilement, pas le contenu. */
  const boite = await p.evaluate(() => {
    const m = document.getElementById('gxMenu');
    const b = document.getElementById('gxProfil');
    if (!m || !b) return null;
    b.click();
    if (m.hidden) m.hidden = false;
    if (!m.children.length) {
      for (let i = 0; i < 13; i++) {
        const a = document.createElement('a');
        a.href = '#'; a.textContent = 'Ligne ' + (i + 1);
        m.appendChild(a);
      }
    }
    return null;
  });
  await p.waitForTimeout(400);

  const geo = await p.evaluate(() => {
    const R = (s) => { const e = document.querySelector(s); if (!e) return null;
      const c = getComputedStyle(e); if (c.display === 'none' || e.hidden) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, r: r.right, b: r.bottom, z: c.zIndex }; };
    return { menu: R('#gxMenu'), tab: R('#tablette') };
  });
  ok(!!geo.menu, 'le tiroir est ouvert');
  ok(!!geo.tab, 'le biseau de la borne est bien la');
  if (!geo.menu || !geo.tab) { await nav.close(); s.close(); process.exit(1); }

  const chevauche = geo.menu.b > geo.tab.y + 8 && geo.menu.y < geo.tab.b;
  ok(chevauche,
     chevauche ? `ils se recouvrent : le biseau commence a ${Math.round(geo.tab.y)},`
                 + ` le tiroir descend jusqu'a ${Math.round(geo.menu.b)}`
               : 'ils ne se recouvrent plus — l essai ne teste plus rien, a revoir');

  const png = await p.screenshot();
  await p.close();

  /* On fait decoder l'image par le navigateur lui-meme : pas de bibliotheque a
     ajouter pour lire quatre pixels. */
  const lecteur = await nav.newPage();
  /* La bordure du biseau fait 7 px : on lit sa ligne mediane. Et on ne lit pas
     trois pixels mais une TRAVERSEE de quarante et un points, dont on prend la
     mediane — un pixel isole peut tomber sur une lettre du tiroir, ce qui
     ferait crier l'essai pour une raison qui n'a rien a voir. */
  const ligne = Math.round(geo.tab.y + 3);
  const bas = Math.round(Math.min(geo.tab.b - 4, HAUTE - 3));
  const traverse = (y) => {
    const t = [];
    for (let i = 0; i <= 40; i++) {
      t.push({ x: Math.round(geo.menu.x + 6 + (geo.menu.r - geo.menu.x - 12) * (i / 40)), y });
    }
    return t;
  };
  const points = traverse(ligne).concat(traverse(bas));

  const lus = await lecteur.evaluate(async ({ data, pts }) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = 'data:image/png;base64,' + data; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return pts.map((pt) => {
      const d = ctx.getImageData(pt.x, pt.y, 1, 1).data;
      return (d[0] + d[1] + d[2]) / 3;
    });
  }, { data: png.toString('base64'), pts: points });
  await lecteur.close();

  const mediane = (t) => { const u = t.slice().sort((a, b) => a - b); return u[u.length >> 1]; };
  const devant = mediane(lus.slice(0, 41));
  const temoin = mediane(lus.slice(41));

  ok(devant > 200,
     devant > 200
       ? `a y=${ligne}, la ou la bordure traversait : le tiroir est devant`
         + ` (clarte mediane ${Math.round(devant)} sur 41 points)`
       : `a y=${ligne} : le tiroir est DERRIERE le cadre du jeu`
         + ` (clarte mediane ${Math.round(devant)} sur 41 points)`);
  ok(temoin < 150,
     temoin < 150
       ? `et a y=${bas}, sous le tiroir, le cadre est toujours dessine (clarte ${Math.round(temoin)})`
       : `le cadre du jeu a disparu : clarte ${Math.round(temoin)} la ou il devrait etre sombre`);

  await nav.close(); s.close();
  console.log(rates ? `\npusher_tiroir.test.js : ${rates} echec(s) sur ${n}\n`
                    : `\npusher_tiroir.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
