/* LE CADRE MANGE-T-IL LE JEU, ET LES FRUITS SE RENTRENT-ILS DEDANS ?
 *
 * Le dessin du cadre est pose PAR-DESSUS la grille (z-index 2 contre 1).
 * Son coffre en bas a gauche et son shiba en bas a droite mordent sur la
 * fenetre : la case du bas a gauche etait cachee a 36 % sans que personne
 * s'en apercoive, parce qu'un fruit a moitie derriere un coffre ressemble
 * encore a un decor charge.
 *
 * DEUX PIEGES, tombes dans les DEUX en une seule seance :
 *
 *   1. Elargir la grille sans la rallonger. La case reste carree grace a
 *      `aspect-ratio`, mais le PAS des rangees suit la hauteur de la
 *      grille. Une grille de 58 % de large pour 40 % de haut donne des
 *      symboles de 92 px avec un pas de 68 : les fruits se rentrent dedans
 *      de 24 px, et la grille prend un air de diagonale.
 *
 *   2. Ne mesurer que la couverture. Tasser les rangees rapproche la
 *      grille du haut, donc FAIT BAISSER la couverture — l'optimisation
 *      recompense exactement l'erreur 1. Il faut mesurer les deux ensemble,
 *      et c'est ce que fait cet essai.
 *
 * Les seuils ne sont pas ronds par hasard : ils sont poses un cran au-dessus
 * de ce que la geometrie retenue mesure, pour attraper une derive sans
 * hurler au premier pixel.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('cadre_bonanza.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
            '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
            '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const SYM = ['banane', 'raisin', 'pasteque', 'prune', 'pomme',
             'bonbon_bleu', 'bonbon_vert', 'bonbon_violet', 'coeur', 'sucette'];

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    if (p === '/swoge_bonanza.html') {
      let h = fs.readFileSync(f, 'utf8');
      const i = h.lastIndexOf('})();');
      h = h.slice(0, i) + '\n  window.__bz={bzPoseGrille:bzPoseGrille,bzPeint:bzPeint};\n' + h.slice(i);
      r.writeHead(200, { 'content-type': 'text/html' });
      return r.end(h);
    }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;
  const nav = await chromium.launch();

  for (const [nom, w, h, seuil] of [['PC', 1440, 900, 0.28], ['telephone', 390, 844, 0.30]]) {
    const p = await nav.newPage({ viewport: { width: w, height: h } });
    await p.goto('http://127.0.0.1:' + port + '/swoge_bonanza.html');
    await p.waitForFunction('window.__bz');
    const g = Array.from({ length: 30 }, (_, i) => SYM[(i * 7 + i % 3) % SYM.length]);
    await p.evaluate((g) => { window.__bz.bzPoseGrille(); window.__bz.bzPeint(g, null); }, g);
    await p.waitForTimeout(250);

    const m = await p.evaluate(async () => {
      const zone = document.querySelector('.bz-zone').getBoundingClientRect();
      const cs = document.getElementById('bzGrille').children;
      const c0 = cs[0].getBoundingClientRect();
      const pasV = cs[6].getBoundingClientRect().top - c0.top;
      const pasH = cs[1].getBoundingClientRect().left - c0.left;
      const b = cs[0].firstChild.getBoundingClientRect();
      const vu = Math.min(b.width, b.height);

      const im = new Image(); im.src = 'img/bonanza/cadre.webp';
      await im.decode();
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;

      let pire = 0, pireCase = -1;
      for (let i = 0; i < 30; i++) {
        const r = cs[i].getBoundingClientRect();
        const mx = (r.left + r.right) / 2, my = (r.top + r.bottom) / 2;
        const x0 = (mx - vu / 2 - zone.left) / zone.width, x1 = (mx + vu / 2 - zone.left) / zone.width;
        const y0 = (my - vu / 2 - zone.top) / zone.height, y1 = (my + vu / 2 - zone.top) / zone.height;
        let t = 0, c = 0;
        for (let yy = Math.max(0, Math.floor(y0 * cv.height)); yy < Math.min(cv.height, Math.ceil(y1 * cv.height)); yy += 2)
          for (let xx = Math.max(0, Math.floor(x0 * cv.width)); xx < Math.min(cv.width, Math.ceil(x1 * cv.width)); xx += 2) {
            t++; if (d[(yy * cv.width + xx) * 4 + 3] > 60) c++;
          }
        if (t && c / t > pire) { pire = c / t; pireCase = i; }
      }
      return { vu, pasV, pasH, pire, pireCase };
    });

    console.log('\n-- ' + nom + ' --');
    /* 1. LES FRUITS NE SE RENTRENT PAS DEDANS */
    ok(m.vu <= m.pasV + 0.6,
       'les rangees ne se chevauchent pas : symbole ' + m.vu.toFixed(1)
       + ' px pour un pas de ' + m.pasV.toFixed(1) + ' px');
    ok(m.vu <= m.pasH + 0.6,
       'les colonnes non plus : symbole ' + m.vu.toFixed(1)
       + ' px pour un pas de ' + m.pasH.toFixed(1) + ' px');
    /* la grille reste bien carree : un pas vertical tres different du pas
       horizontal veut dire que la hauteur ne suit plus la largeur */
    ok(Math.abs(m.pasV - m.pasH) < 4,
       'le pas vertical suit le pas horizontal ('
       + m.pasV.toFixed(1) + ' contre ' + m.pasH.toFixed(1) + ')');
    /* 2. LE CADRE NE MANGE PAS UN SYMBOLE */
    ok(m.pire < seuil,
       'aucun symbole n est cache par le cadre a plus de ' + Math.round(100 * seuil) + '% '
       + '(le pire est la case ' + m.pireCase + ' a ' + (100 * m.pire).toFixed(0) + '%)');
    await p.close();
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
