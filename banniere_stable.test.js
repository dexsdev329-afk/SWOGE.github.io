'use strict';
/*
 * LA BANNIERE NE CHANGE PAS DE FORMAT PENDANT QU'ON DEFILE.
 *
 * ---- ce qui etait signale ----
 *
 * « sur telephone la swobet a encore le souci avec la video du haut qui change
 * de format ».
 *
 * ---- pourquoi elle changeait ----
 *
 * Son plafond etait `max-height:min(40vh, 340px)`, pose a cote d'un
 * `aspect-ratio`. Sur iPhone, `vh` se mesure sur la fenetre BARRE D'ADRESSE
 * RETRACTEE : elle vaut une chose a l'arrivee et une autre des qu'on defile.
 * Tant que le plafond ne mord pas, rien ne bouge ; des que la fenetre descend
 * sous ~562 pixels de haut — le navigateur de Telegram, un petit telephone, le
 * paysage — il mord, et la banniere maigrit et se recadre a chaque
 * defilement. Mesure avant correction : 225 px de haut a 844 de fenetre, 224 a
 * 560, et ca continuait.
 *
 * ---- ce que cet essai tient ----
 *
 * Il ne lit pas la feuille de style : il MESURE la boite a quatre hauteurs
 * d'ecran, pour la meme largeur. Une banniere dont la taille depend de la
 * hauteur de la fenetre est une banniere qui bougera le jour ou cette hauteur
 * bouge — et sur telephone, elle bouge a chaque geste.
 *
 * Le plafond en hauteur reste en PAYSAGE, ou il sert vraiment : a 844 de large
 * le rapport donnerait 555 px de haut sur un ecran qui en fait 390.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('banniere_stable.test.js : playwright absent — essai saute'); process.exit(0); }

const SITE = __dirname;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json' };

/* Les hauteurs qu'un meme telephone montre au cours d'une visite : plein
   ecran, puis la barre du navigateur, puis celle de Telegram par-dessus. */
const HAUTEURS = [844, 740, 640, 560, 500];

const CIBLES = [
  { page: 'swogebet.html', sel: '#sbFilm', nom: 'la banniere des paris' },
  { page: 'games.html', sel: '.haut-films', nom: 'la banniere des jeux' },
];

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

  for (const c of CIBLES) {
    console.log(`\n-- ${c.nom} (${c.page}) --`);
    const vues = [];
    for (const h of HAUTEURS) {
      const p = await nav.newPage({ viewport: { width: 390, height: h },
                                    isMobile: true, hasTouch: true });
      await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
      await p.goto(`http://127.0.0.1:${port}/${c.page}`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1400);
      vues.push(await p.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { l: Math.round(r.width), h: Math.round(r.height) };
      }, c.sel));
      await p.close();
    }
    ok(vues.every(Boolean), 'elle existe a toutes les hauteurs');
    if (!vues.every(Boolean)) continue;
    const ref = vues[0];
    const bougent = vues.filter((v) => v.h !== ref.h);
    ok(bougent.length === 0,
       bougent.length
         ? `elle CHANGE de taille selon la hauteur de la fenetre : `
           + vues.map((v, i) => `${HAUTEURS[i]}→${v.h}px`).join(', ')
         : `${ref.l}x${ref.h} px, identique aux ${HAUTEURS.length} hauteurs d ecran`);
    const rapports = vues.map((v) => +(v.l / v.h).toFixed(3));
    ok(new Set(rapports).size === 1,
       `et son format ne bouge pas non plus (${[...new Set(rapports)].join(' / ')})`);
  }

  /* ---- ET LE PLAFOND RESTE EN PAYSAGE ----
   * Sans lui, la banniere mangerait l'ecran couche. Le retirer partout aurait
   * repare un defaut en en posant un autre. */
  console.log('\n-- couche, le plafond sert --');
  {
    const p = await nav.newPage({ viewport: { width: 844, height: 390 },
                                  isMobile: true, hasTouch: true });
    await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p.goto(`http://127.0.0.1:${port}/swogebet.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);
    const v = await p.evaluate(() => {
      const el = document.querySelector('#sbFilm');
      const r = el.getBoundingClientRect();
      return { h: Math.round(r.height), fen: window.innerHeight,
               sansPlafond: Math.round(r.width / (912 / 600)) };
    });
    ok(v.h < v.sansPlafond,
       `elle est bornee (${v.h} px au lieu de ${v.sansPlafond})`);
    ok(v.h < v.fen * 0.55,
       `et ne mange pas l ecran couche (${v.h} px pour ${v.fen} de haut)`);
    await p.close();
  }

  await nav.close(); s.close();
  console.log(rates ? `\nbanniere_stable.test.js : ${rates} echec(s) sur ${n}\n`
                    : `\nbanniere_stable.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
