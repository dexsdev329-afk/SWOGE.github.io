'use strict';
/*
 * PEUT-ON ENCORE FERMER UN PANNEAU ?
 *
 * ---- LE DEFAUT, TEL QU'UN JOUEUR L'A DECRIT ----
 *
 * « But the top menu — like when you open the bank or check your pet —
 *   covers the 'X' used to close the menu. »
 *
 * Le voile de chaque panneau etait bien repousse sous la barre du site : une
 * regle le fait deja, avec `--nx-haut` et `--nx-bas`, et elle avait ete
 * ecrite pour un defaut identique dans l'editeur de maps.
 *
 * La CARTE, dedans, ne l'etait pas. Elle etait plafonnee en `vh` — sur
 * l'ecran ENTIER, 96vh pour le familier, 84vh pour le coffre — alors que son
 * conteneur ne fait que l'aire libre. Un enfant plus grand que son
 * conteneur, centre par `align-items:center`, deborde des DEUX cotes a parts
 * egales : le haut de la carte passe au-dessus du voile, et `.nxcf-x` est en
 * `position:absolute; top:12px`. Le bouton qui ferme part le premier.
 *
 * ---- POURQUOI PERSONNE NE L'AVAIT VU ----
 *
 * Sur un grand ecran l'aire libre est presque l'ecran entier : le
 * debordement fait quelques pixels et le X reste attrapable. Il faut un
 * ecran COURT pour que ca morde — celui du navigateur interne de Telegram,
 * qui ajoute son propre en-tete par-dessus la page. C'est de la que vient la
 * capture du joueur, et c'est la geometrie que cet essai reproduit.
 *
 * ---- CE QU'ON MESURE ----
 *
 * Pas la position du bouton : CE QUE LE DOIGT TOUCHE. `elementFromPoint` au
 * centre du X rend l'element reellement au-dessus a cet endroit. Un essai qui
 * verifierait seulement que le bouton est "dans l'ecran" aurait passe au vert
 * pendant que la barre le recouvrait.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('menu_ferme.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
            '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
            '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.mp4':'video/mp4' };

/* Les panneaux que le joueur cite, plus ceux qui partagent la meme carte. */
const PANNEAUX = [
  ['nxPetVoile',    'le familier'],
  ['nxCoffreVoile', 'la banque'],
  ['nxRangVoile',   'le classement'],
  ['nxTourVoile',   'la tour'],
  ['nxBjVoile',     'le blackjack']
];

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
  /* Un telephone DANS Telegram : l'en-tete de Telegram mange le haut, il
     reste une fenetre courte. C'est la seule geometrie ou le defaut mord. */
  const p = await nav.newPage({ viewport: { width: 390, height: 560 } });
  await p.goto('http://127.0.0.1:' + port + '/nexus.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);

  /* On pose l'aire libre comme le fait `ajusteMonde()` : la hauteur reelle
     des deux barres. Si le jeu n'a pas pu demarrer ici, la mesure reste la
     bonne — c'est de la geometrie, pas de l'etat de partie. */
  const geo = await p.evaluate(() => {
    const haut = document.querySelector('.sw-haut');
    const hh = haut ? Math.round(haut.getBoundingClientRect().height) : 0;
    const R = document.documentElement.style;
    if (hh) R.setProperty('--nx-haut', hh + 'px');
    if (!getComputedStyle(document.documentElement).getPropertyValue('--nx-bas').trim())
      R.setProperty('--nx-bas', '56px');
    return { hautPx: hh,
             barre: !!haut,
             zHaut: haut ? +getComputedStyle(haut).zIndex : null };
  });
  ok(geo.barre, 'la barre du site est bien sur la page');
  ok(geo.hautPx > 0, 'elle a une hauteur reelle (' + geo.hautPx + ' px)');

  for (const [id, nom] of PANNEAUX) {
    const r = await p.evaluate((id) => {
      const v = document.getElementById(id);
      if (!v) return { absent: true };
      v.classList.add('on');
      v.style.opacity = '1'; v.style.pointerEvents = 'auto'; v.style.display = 'flex';
      const x = v.querySelector('.nxcf-x, .nxarc-x, .nxrp-x, button[aria-label="Close"]');
      if (!x) return { sansX: true };
      /* ---- ON REMPLIT LA CARTE, ET C'EST TOUT L'ESSAI ----
       * Sans contenu, une carte plafonnee a 96vh reste courte : elle
       * n'atteint jamais son plafond, donc elle ne deborde pas, donc l'essai
       * passait AU VERT AVEC LE DEFAUT. Verifie en remisant la correction.
       * En vrai, un joueur ouvre son coffre avec trente objets et sa liste de
       * familiers avec quatre bestioles — la carte est haute. On la remplit
       * donc jusqu'a ce qu'elle pousse sur son plafond, ce qui est la seule
       * situation ou la question du X se pose. */
      const carteRef = x.closest('.nxcf-carte, .nxarc-carte, .nxrp-carte, .nxmt-carte');
      let bourre = null;
      if (carteRef) {
        bourre = document.createElement('div');
        bourre.style.height = '1400px';
        bourre.setAttribute('data-essai', 'remplissage');
        carteRef.appendChild(bourre);
      }
      const rx = x.getBoundingClientRect();
      const rv = v.getBoundingClientRect();
      const carte = x.closest('.nxcf-carte, .nxarc-carte, .nxrp-carte, .nxmt-carte');
      const rc = carte ? carte.getBoundingClientRect() : null;
      const cx = Math.round(rx.left + rx.width / 2), cy = Math.round(rx.top + rx.height / 2);
      /* CE QUE LE DOIGT TOUCHE, pas ce que la mise en page pretend. */
      const dessus = document.elementFromPoint(cx, cy);
      const atteint = !!dessus && (dessus === x || x.contains(dessus) || dessus.closest('.nxcf-x,.nxarc-x,.nxrp-x') === x);
      if (bourre) bourre.remove();
      v.classList.remove('on'); v.style.opacity = ''; v.style.pointerEvents = ''; v.style.display = '';
      return { xTop: Math.round(rx.top), voileTop: Math.round(rv.top),
               carteTop: rc ? Math.round(rc.top) : null,
               carteH: rc ? Math.round(rc.height) : null,
               voileH: Math.round(rv.height),
               atteint, dessus: dessus ? (dessus.className || dessus.tagName) : 'rien', cy };
    }, id);

    if (r.absent) { ok(false, nom + ' : panneau introuvable'); continue; }
    if (r.sansX)  { ok(false, nom + ' : aucun bouton de fermeture trouve'); continue; }

    ok(r.carteH <= r.voileH + 1,
       nom + ' : la carte pleine tient dans son voile (' + r.carteH + ' px pour ' + r.voileH + ' px)');
    ok(r.carteTop >= r.voileTop - 1,
       nom + ' : et elle ne deborde pas au-dessus (carte ' + r.carteTop
       + ' px, voile ' + r.voileTop + ' px)');
    ok(r.xTop >= geo.hautPx - 1,
       nom + ' : le X est sous la barre du site (X a ' + r.xTop + ' px, barre ' + geo.hautPx + ' px)');
    ok(r.atteint,
       nom + " : et c'est bien le X qu'on touche a cet endroit"
       + (r.atteint ? '' : ' — on touche « ' + String(r.dessus).slice(0, 40) + ' »'));
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
