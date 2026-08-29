'use strict';
/* LE BOUTON QUI CACHE LE PANNEAU DOIT RESTER ATTEIGNABLE.
 *
 * ---- CE QU'UN JOUEUR A RAPPORTE ----
 *
 * « J'ai pas pu cacher l'inventaire a cause des potions ; j'ai quitte le jeu
 * et je suis reapparu mort. »
 *
 * Il disait vrai, et il donnait meme la cause. Sur telephone, la mise en page
 * tactile empile les commandes dans une colonne collee au bord du panneau :
 * le tir (`#nxPow`) a +6px du bas, la maison a +70, LES POTIONS a +134, le
 * butin a +198. Le bouton de repli, lui, est pose a `top:68%` — c'est-a-dire
 * au milieu de cette colonne — avec un `z-index` de 23 quand les potions
 * portent 24 et le butin 25. Des qu'on a des potions, elles se posent DESSUS.
 *
 * Le doigt touche donc la fiole, jamais le bouton. Le panneau ne se replie
 * plus, et sur telephone il mange un tiers de l'ecran : on ne voit plus
 * arriver ce qui nous tue. Or la mort est DEFINITIVE dans ce jeu — elle
 * detruit l'equipement, vide le sac, efface les potions bues. Un bouton
 * inatteignable coute un personnage entier.
 *
 * ---- CE QUE CET ESSAI VERIFIE ----
 *
 * Il ne compare pas des rectangles : il demande au navigateur QUI recevrait le
 * doigt au centre du bouton, avec les commandes tactiles affichees. C'est la
 * seule question qui compte, et aucun calcul de coordonnees ne la remplace.
 *
 * Il n'a besoin d'AUCUN serveur : c'est une question de mise en page.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('repli_atteignable.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const SITE = __dirname;
const T = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
            '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css', '.mp4': 'video/mp4' };

(async () => {
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* Trois telephones courants. Le defaut depend de la hauteur de l'ecran et de
     la largeur du panneau, donc d'un appareil a l'autre — le verifier sur un
     seul reviendrait a le corriger pour un seul. */
  /* Les hauteurs COURTES sont les seules qui prouvaient quelque chose : a
     844px le bouton depassait des potions et l'essai passait au vert sur un
     defaut bien reel. La hauteur utile d'un telephone tombe sous 660px des que
     l'en-tete du site et la barre du navigateur ont pris leur part — c'est le
     cas ORDINAIRE, pas le cas limite. */
  const APPAREILS = [
    { nom: 'iPhone 13/14      390x844', w: 390, h: 844 },
    { nom: 'Galaxy S          360x740', w: 360, h: 740 },
    { nom: 'utile 660 (en-tete)392x660', w: 392, h: 660 },
    { nom: 'utile 620          392x620', w: 392, h: 620 },
    { nom: 'utile 580 (petit)  360x580', w: 360, h: 580 },
  ];

  for (const a of APPAREILS) {
    const ctx = await nav.newContext({ viewport: { width: a.w, height: a.h }, hasTouch: true, isMobile: true });
    await ctx.route('https://**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    const pg = await ctx.newPage();
    await pg.goto(`http://127.0.0.1:${port}/nexus.html`, { waitUntil: 'load' });
    await pg.waitForTimeout(1200);

    /* On AFFICHE les commandes tactiles comme elles le sont en jeu. Sans
       potions elles sont a zero pixel : l'essai passerait au vert sur un ecran
       qui ne montre pas ce dont on parle. */
    const sonde = await pg.evaluate(() => {
      const pot = document.getElementById('nxPot');
      if (pot) {
        pot.classList.add('on');
        if (!pot.children.length) {
          pot.innerHTML = '<button type="button"><b>94</b></button>' +
                          '<button type="button"><b>96</b></button>';
        }
      }
      const bf = document.getElementById('nxButinFlot');
      if (bf) { bf.hidden = false; if (!bf.children.length) bf.innerHTML = '<button type="button">x</button>'; }
      const b = document.getElementById('nxBascule');
      if (!b) return { err: 'bouton de repli absent' };
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) return { err: 'bouton de repli non rendu' };
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dessus = document.elementFromPoint(cx, cy);
      const nomDe = (e) => e ? (e.id || (typeof e.className === 'string' ? e.className : '') || e.tagName) : '(rien)';
      // qui, dans la chaine des parents, est l'element responsable ?
      let par = dessus, chaine = [];
      for (let i = 0; par && i < 4; i++) { chaine.push(nomDe(par)); par = par.parentElement; }
      return {
        recu: nomDe(dessus),
        chaine: chaine.join(' < '),
        estLeBouton: !!(dessus && (dessus === b || b.contains(dessus))),
        zBouton: getComputedStyle(b).zIndex,
        zRecu: dessus ? getComputedStyle(dessus).zIndex : '-',
      };
    });

    console.log('\n-- ' + a.nom + ' --');
    if (sonde.err) { ok(false, sonde.err); await ctx.close(); continue; }
    ok(sonde.estLeBouton,
       'le doigt au centre du bouton atteint LE BOUTON  (recu : ' + sonde.chaine +
       ' | z ' + sonde.zRecu + ' contre ' + sonde.zBouton + ')');

    /* La preuve par le geste : un seul appui doit replier le panneau. */
    const avant = await pg.evaluate(() => document.getElementById('nxWrap').classList.contains('replie'));
    const r = await pg.evaluate(() => {
      const b = document.getElementById('nxBascule').getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    await pg.mouse.click(r.x, r.y);
    await pg.waitForTimeout(400);
    const apres = await pg.evaluate(() => document.getElementById('nxWrap').classList.contains('replie'));
    ok(avant !== apres, 'UN SEUL appui replie bien le panneau');

    await ctx.close();
  }

  console.log('\n' + n + ' verifications, ' + rates + ' echec(s)');
  await nav.close(); srv.close();
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
