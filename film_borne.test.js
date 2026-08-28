'use strict';
/*
 * AUCUNE VIDEO NE PEUT ELARGIR LA PAGE.
 *
 * ---- ce qui etait signale ----
 *
 * « Toujours le meme probleme sur mobile avec la page swobet : en dessous le
 * titre et au dessus, la barre est deformee a cause de la video qui est trop
 * grande. » Sur la capture, l'en-tete et la rangee de navigation s'affichent a
 * 59 % de la largeur de l'ecran, tout ratatines, pendant que la banniere et
 * les cartes en dessous occupent bien toute la largeur. Deux echelles sur la
 * meme page.
 *
 * ---- ce qui se passait ----
 *
 * Ce n'est pas l'en-tete qui a retreci : c'est TOUTE LA PAGE qui a ete
 * degonflee. Quand un element deborde en largeur, iOS ne coupe pas et ne
 * replie pas — il reduit l'echelle de la page entiere pour faire tenir le
 * document. L'en-tete, lui, fait 100 % de la FENETRE et non du DOCUMENT :
 * degonfle du meme coup, il n'occupe plus que la moitie de l'ecran, tandis que
 * l'element large, lui, la remplit. La page portait deja ce constat ailleurs :
 * « le telephone dezoomait toute la page pour la faire tenir ».
 *
 * Ce qui debordait : la banniere video. `<video width="912" height="600">` —
 * ces attributs sont des indices de PRESENTATION, c'est-a-dire une largeur de
 * 912 px des que la regle d'auteur qui dit `width:100%` ne s'applique pas, ou
 * que le moteur rededuit la largeur depuis `aspect-ratio` quand `max-height`
 * mord. Mesure, la regle neutralisee : document a 772 px pour une fenetre de
 * 390 — l'en-tete occuperait 51 % de l'ecran.
 *
 * Chaque `<img>` du site etait deja bornee. Aucune des vingt et une pages qui
 * portent une `<video>` ne le faisait pour elle.
 *
 * ---- ce que cet essai tient ----
 *
 * Il ne verifie pas que la banniere fait la bonne taille : elle la faisait
 * deja, sur ce moteur-ci, et le defaut est arrive quand meme. Il NEUTRALISE la
 * regle de largeur de chaque video — il rejoue la panne — et verifie que la
 * page ne s'elargit pas pour autant. C'est le plancher qui compte, pas le
 * reglage : tant qu'il tient, aucun moteur ne peut degonfler la page a cause
 * d'une video, quelle que soit la raison pour laquelle il aurait mal lu la
 * regle.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('film_borne.test.js : playwright absent — essai saute'); process.exit(0); }

const SITE = __dirname;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.svg': 'image/svg+xml' };

const LARGE = 390;

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
  const ctx = await nav.newContext({ viewport: { width: LARGE, height: 800 },
                                     isMobile: true, hasTouch: true });
  await ctx.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
  await ctx.route('**/vitrine.json', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ joueurs: 21, volume: 46600000, manches: 12400, rendus: 43500000 }) }));

  const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'))
    .filter((f) => fs.readFileSync(path.join(SITE, f), 'utf8').includes('<video')).sort();
  console.log(`-- ${pages.length} pages portent une video, a ${LARGE} px de large --`);

  for (const f of pages) {
    const p = await ctx.newPage();
    let v = null;
    try {
      await p.goto(`http://127.0.0.1:${port}/${f}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await p.waitForTimeout(1800);
      v = await p.evaluate(() => {
        const vids = [...document.querySelectorAll('video')];
        const avant = { doc: document.documentElement.scrollWidth,
                        ecran: document.documentElement.clientWidth };
        /* On rejoue la panne : la regle d'auteur qui donne sa largeur a la
           video est mise hors jeu, et la video retombe sur les attributs
           `width`/`height` de sa balise — 912x600 pour la banniere des paris.
           C'est l'etat exact que produit un moteur qui n'applique pas cette
           regle, pour la raison qu'on voudra. */
        const st = document.createElement('style');
        st.textContent = 'video{width:912px!important;height:600px!important;'
                       + 'aspect-ratio:auto!important;max-height:none!important}';
        document.head.appendChild(st);
        void document.body.offsetWidth;
        const apres = { doc: document.documentElement.scrollWidth,
                        ecran: document.documentElement.clientWidth };
        const larges = vids.filter((e) => {
          const c = getComputedStyle(e);
          if (c.display === 'none') return false;
          return e.getBoundingClientRect().width > document.documentElement.clientWidth + 1;
        }).length;
        return { n: vids.length, avant, apres, larges };
      });
    } catch (e) { /* v reste nul */ }
    await p.close();
    if (!v) { ok(false, `${f} : la page n'a pas pu s'ouvrir`); continue; }
    ok(v.avant.doc <= v.avant.ecran,
       v.avant.doc <= v.avant.ecran
         ? `${f} : ${v.n} video(s), page a ${v.avant.doc} — rien ne deborde en temps normal`
         : `${f} : la page deborde deja sans rejouer la panne (${v.avant.doc}/${v.avant.ecran})`);
    ok(v.apres.doc <= v.apres.ecran,
       v.apres.doc <= v.apres.ecran
         ? `${f} : regle de largeur neutralisee, la page tient toujours (${v.apres.doc})`
         : `${f} : SANS sa regle de largeur, la video elargit la page a ${v.apres.doc}`
           + ` pour un ecran de ${v.apres.ecran} — le telephone degonflerait tout`);
    ok(v.larges === 0,
       v.larges === 0 ? `${f} : et aucune video ne depasse la fenetre`
                      : `${f} : ${v.larges} video(s) plus larges que la fenetre`);
  }

  await ctx.close(); await nav.close(); s.close();
  console.log(rates ? `\nfilm_borne.test.js : ${rates} echec(s) sur ${n}\n`
                    : `\nfilm_borne.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
