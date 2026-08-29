'use strict';
/*
 * LA NAVIGATION DE GAUCHE RESTE DANS SA COLONNE.
 *
 * ---- LE DEFAUT ----
 *
 * Six pages de jeu portaient, heritee d'un vieux gabarit sombre, une regle
 * `nav{display:flex}` SANS CLASSE. Elle atteignait donc aussi `.sw-nav`, la
 * navigation de la colonne de gauche : ses quatre liens, qui demandent
 * 437 px, etaient mis en RANGEE dans une colonne de 230. Rien ne les
 * rognait (`overflow:visible`), alors « Sports » et « Docs » sortaient de
 * 216 px et se peignaient PAR-DESSUS le jeu — sur DEAD OR DOGE, « BET
 * 10.0k $SWOGE » s'ecrivait exactement sur le mot « Sports ».
 *
 * ---- POURQUOI IL A TENU SI LONGTEMPS ----
 *
 * `getBoundingClientRect()` de `.sw-nav` rendait 230 px de large, la
 * largeur de sa BOITE : le debordement ne s'y voyait pas. Il fallait
 * mesurer chaque LIEN. Un essai qui interroge le conteneur passe avec le
 * defaut present — c'est ce qui est arrive en l'ecrivant.
 *
 * Et `nav.sb-ancre{...}`, juste sous la regle fautive, ne faisait qu'annuler
 * le degat sur UN nav : le defaut etait connu, et rustine au cas par cas
 * plutot qu'a la source.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('colonne_nav.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp',
            '.png':'image/png', '.jpg':'image/jpeg', '.mp4':'video/mp4', '.webm':'video/webm',
            '.mp3':'audio/mpeg', '.ogg':'audio/ogg' };

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;
  const nav = await chromium.launch();

  /* TOUTES les pages qui portent la colonne de gauche, pas seulement celles
     qu'on soupconne : le defaut venait d'une regle recopiee de page en page,
     et une liste choisie a la main aurait laisse passer la prochaine copie. */
  const pages = fs.readdirSync(SITE)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => /<nav class="sw-nav">/.test(fs.readFileSync(path.join(SITE, f), 'utf8')));

  ok(pages.length >= 8, `${pages.length} pages portent la colonne de gauche`);

  const fautives = [];
  /* Une seule page reutilisee pour les 23 : en ouvrir une par fichier
     coutait plus que la mesure elle-meme. Et tout ce qui sort de la machine
     est coupe — polices, CDN, serveur de jeu : la mise en page de la colonne
     n'en depend pas, et les attendre triplait la duree. */
  const p = await nav.newPage({ viewport: { width: 1600, height: 900 } });
  await p.route('**', (r) => (r.request().url().startsWith('http://127.0.0.1:' + port)
    ? r.continue() : r.abort()));
  for (const f of pages) {
    try {
      await p.goto('http://127.0.0.1:' + port + '/' + f, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(250);
      const m = await p.evaluate(() => {
        const nv = document.querySelector('.sw-nav');
        if (!nv) return null;
        const colonne = nv.closest('aside') || nv.parentElement;
        const cr = colonne.getBoundingClientRect();
        /* Chaque LIEN, pas la boite : c'est le lien qui deborde. */
        const l = [...nv.querySelectorAll('a')].map((a) => a.getBoundingClientRect());
        if (!l.length) return null;
        return {
          debord: Math.round(Math.max(...l.map((r) => r.right)) - cr.right),
          empiles: l.every((r, i) => i === 0 || r.top >= l[i - 1].bottom - 1),
        };
      });
      if (!m) continue;
      if (m.debord > 0 || !m.empiles) fautives.push(f + ' (debord ' + m.debord + ' px'
        + (m.empiles ? '' : ', liens en rangee') + ')');
    } catch (e) { fautives.push(f + ' (' + e.message.split('\n')[0].slice(0, 60) + ')'); }
  }
  await p.close();
  ok(fautives.length === 0,
     'aucun lien ne sort de la colonne, et ils restent empiles'
     + (fautives.length ? ' — fautives : ' + fautives.join(', ') : ''));

  /* Et la regle elle-meme ne doit plus pouvoir viser le chrome de la page :
     la mesure ci-dessus ne verrait pas une regle reintroduite dans une page
     nouvelle tant qu'elle n'existe pas encore. */
  const nues = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'))
    .filter((f) => /^\s*nav\s*\{\s*display:\s*flex/m.test(fs.readFileSync(path.join(SITE, f), 'utf8')));
  ok(nues.length === 0,
     'et aucune page ne porte plus de regle `nav{display:flex}` SANS CLASSE'
     + (nues.length ? ' — ' + nues.join(', ') : '')
     + ' : c est elle qui atteignait la colonne de gauche');

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
