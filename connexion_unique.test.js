'use strict';
/*
 * « CONNECT WALLET » NE DOIT ETRE ECRIT QU UNE FOIS PAR ECRAN.
 *
 * ---- CE QUI S EST PASSE ----
 *
 * Une capture, prise d un telephone : l accueil ouvrait sur « CONNECT WALLET /
 * SIGN UP — EMAIL » dans la barre du haut puis, trois centimetres plus bas,
 * « CONNECT WALLET / SIGN UP WITH EMAIL » dans la colonne. Les memes mots, les
 * memes gestionnaires, deux fois a l ecran en meme temps.
 *
 * La barre du haut est COLLANTE : ce n etait donc pas un accident de defilement
 * — les deux paires se voyaient ensemble quelle que soit la position dans la
 * page, sur telephone comme sur ecran large.
 *
 * ---- POURQUOI CET ESSAI PLUTOT QU UN COUP D OEIL ----
 *
 * Ces boutons se posent a cinq endroits differents dans les deux pages, et
 * chacun avait une bonne raison le jour ou il a ete ajoute. C est exactement
 * le genre de doublon qui revient : quelqu un ajoutera une carte d appel dans
 * six mois, et personne ne comptera. La page portait deja ce constat pour
 * l ADRESSE une fois connecte ; il valait tout autant pour les BOUTONS avant
 * de l etre, c est-a-dire exactement quand ils comptent.
 *
 * ---- CE QU IL COMPTE, ET CE QU IL NE COMPTE PAS ----
 *
 * Il compte les elements VISIBLES qui portent un LIBELLE de connexion. Une
 * zone cliquable transparente posee sur un bouton PEINT dans une image n en
 * est pas un : elle n ecrit rien, elle rend cliquable ce qui est deja dessine.
 * La retirer laisserait un bouton peint qui ne fait rien — pire qu un doublon.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

let n = 0, echecs = 0;
const ok = (c, m) => { if (c) { n++; console.log('  ok   ' + m); }
                       else { echecs++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} [${a} vs ${b}]`);

const SITE = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript',
                '.json': 'application/json', '.webp': 'image/webp',
                '.png': 'image/png', '.css': 'text/css', '.mp4': 'video/mp4' };

(async () => {
  const s = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* Les deux tailles qui comptent : le telephone d ou vient la capture, et
     l ecran large ou la colonne se range a gauche au lieu de dessous. Le
     defaut se voyait aux DEUX, mais on ne l avait remarque qu au premier. */
  const ECRANS = [{ nom: 'telephone', w: 390, h: 844 },
                  { nom: 'ecran large', w: 1400, h: 900 }];

  for (const page of ['index.html', 'games.html']) {
    console.log(`\n-- ${page} --`);
    for (const e of ECRANS) {
      const ctx = await nav.newContext({ viewport: { width: e.w, height: e.h } });
      const p = await ctx.newPage();
      await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
      await p.goto(`http://127.0.0.1:${s.address().port}/${page}`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1500);
      const vus = await p.evaluate(() => {
        const dedans = [...document.querySelectorAll('.cx-wallet, .cx-mail')];
        return dedans.map((b) => {
          const r = b.getBoundingClientRect();
          const st = getComputedStyle(b);
          return {
            mot: (b.textContent || '').trim(),
            /* Visible veut dire : dessine, et d une taille non nulle. Un
               bouton `hidden` ou `display:none` ne trompe personne. */
            vu: st.display !== 'none' && st.visibility !== 'hidden'
                && r.width > 0 && r.height > 0,
          };
        });
      });
      /* ---- ON COMPTE PAR METHODE, PAS PAR BOUTON ----
       * « CONNECT WALLET » et « SIGN UP — EMAIL » cote a cote ne sont PAS un
       * doublon : ce sont les deux facons d entrer, offertes une fois chacune.
       * Le premier jet de cet essai les comptait comme deux appels et
       * declarait la page fautive alors qu elle etait juste — une regle qui
       * se trompe sur le cas normal ne protege de rien, elle se fait
       * desactiver.
       * Ce qui doit etre unique, c est chaque PORTE : une entree par
       * portefeuille, une par courriel. */
      const parlants = vus.filter((x) => x.vu && /connect|sign\s*up|wallet|email/i.test(x.mot));
      const parPorte = {
        portefeuille: parlants.filter((x) => /wallet/i.test(x.mot)),
        courriel: parlants.filter((x) => /email|sign\s*up/i.test(x.mot)),
      };
      for (const porte of Object.keys(parPorte)) {
        const l = parPorte[porte];
        eq(l.length, 1,
           `${e.nom} : l entree par ${porte} est ecrite UNE fois — `
           + (l.length ? l.map((x) => `« ${x.mot} »`).join(' + ') : 'aucune'));
      }
      /* Zero est l autre facon de se tromper : un essai qui n exige qu un
         maximum passerait sur une page sans aucune porte d entree. */
      ok(parlants.length >= 2,
         `${e.nom} : et les deux portes sont la — la page reste ouvrable`);
      const muets = vus.filter((x) => x.vu && !x.mot.trim()).length;
      if (muets) {
        console.log(`   (${muets} zone(s) cliquable(s) sans libelle : des boutons PEINTS`
                    + ' dans une image, rendus cliquables — ils n ecrivent rien)');
      }
      await ctx.close();
    }
  }

  await nav.close(); s.close();
  console.log(`\nconnexion_unique.test.js : ${n} verifications, ${echecs} echec(s)`);
  process.exit(echecs ? 1 : 0);
})();
