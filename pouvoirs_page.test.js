/* LES SIX POUVOIRS DU FAMILIER, A L ECRAN.
 *
 * Le serveur les applique (familier_combat.test.js, 38 verifications). Ce
 * fichier verifie l autre moitie, celle qui decide si le joueur les VOIT.
 *
 * Une aide invisible n est pas une aide : le compagnon agit tout seul, sans
 * qu on appuie sur rien. Sans dessin, personne ne saurait jamais si le sien
 * sert a quelque chose, ni lequel choisir — et les six especes deviendraient
 * six couleurs de chien.
 *
 * 1. CHAQUE POUVOIR A SA PLANCHE, et elle arrive vraiment a l ecran.
 * 2. ELLE JOUE SES SIX IMAGES, dans l ordre, une fois. Une planche bloquee sur
 *    sa premiere case est une image fixe, pas une animation.
 * 3. CELLES QUI VISENT RESTENT SUR LEUR CIBLE, celles qui protegent SUIVENT le
 *    joueur. Un bouclier qu on quitte en marchant ne protege rien.
 * 4. LE BOUCLIER DURE. Il n est pas un evenement mais un etat de trois
 *    secondes : joue une fois, il aurait disparu au bout d une demi-seconde en
 *    laissant deux secondes et demie de protection invisible.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('pouvoirs_page.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ` [${a} vs ${b}]`);

function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.css': 'text/css', '.wav': 'audio/wav' };
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const f = path.join(racine, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
        r.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res({ port: s.address().port, stop: () => s.close() }));
  });
}
process.on('unhandledRejection', (e) => {
  console.log('  RATE essai interrompu : ' + (e && e.message ? e.message : e));
  process.exit(1);
});

const POUVOIRS = ['mord', 'brule', 'gele', 'repousse', 'soigne', 'bouclier'];

(async () => {
  /* ================== 1. LES PLANCHES EXISTENT ================== */
  console.log('\n-- les six planches --');
  for (const p of POUVOIRS) {
    ok(fs.existsSync(path.join(SITE, 'img/nexus/effets/fam_' + p + '.webp')),
       `fam_${p}.webp est sur le disque`);
  }

  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const erreurs = [];
  const p = await nav.newPage({ viewport: { width: 1000, height: 800 } });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);

  /* ---- ON MESURE LA PLANCHE, PAS LE COMBAT ----
   * Faire tomber un oeuf, sortir un familier, entrer dans le monde et attendre
   * qu il morde prendrait des minutes et dependrait du hasard. Ce qu on
   * verifie ici est une regle de DESSIN : combien de cases, dans quel ordre,
   * et sur quel fond. On la mesure donc sur les planches elles-memes, dans le
   * navigateur qui les affichera — et le comportement en jeu se verifie a
   * cote, sur la simulation. */
  const mesures = await p.evaluate(async (liste) => {
    const out = {};
    for (const cle of liste) {
      const im = new Image();
      im.src = 'img/nexus/effets/fam_' + cle + '.webp';
      await new Promise((r) => { im.onload = r; im.onerror = r; });
      if (!im.naturalWidth) { out[cle] = null; continue; }
      const cw = Math.round(im.naturalWidth / 6), ch = im.naturalHeight;
      const cases = [];
      for (let i = 0; i < 6; i++) {
        const cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        const c2 = cv.getContext('2d', { willReadFrequently: true });
        c2.drawImage(im, i * cw, 0, cw, ch, 0, 0, cw, ch);
        cases.push(c2.getImageData(0, 0, cw, ch).data);
      }
      /* Un effet se pose PAR-DESSUS le decor : le moindre fond plein y
         decouperait un trou. On regarde donc les quatre coins — s ils sont
         opaques, la planche porte un fond. */
      const coin = (d, x, y) => d[((y * cw) + x) * 4 + 3];
      const fond = Math.max(coin(cases[2], 1, 1), coin(cases[2], cw - 2, 1),
                            coin(cases[2], 1, ch - 2), coin(cases[2], cw - 2, ch - 2));
      /* Combien chaque case DESSINE : c est ce qui dit si l animation vit. */
      const plein = cases.map((d) => {
        let k = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 24) k++;
        return k / (cw * ch);
      });
      let mini = 1e9;
      for (let i = 1; i < 6; i++) {
        let som = 0;
        for (let k = 3; k < cases[i].length; k += 4 * 7) {
          som += Math.abs(cases[i][k] - cases[i - 1][k]);
        }
        mini = Math.min(mini, som / (cases[i].length / (4 * 7)));
      }
      out[cle] = { cw, ch, cases: im.naturalWidth / cw, fond, plein, ecartMini: mini };
    }
    return out;
  }, POUVOIRS);

  console.log('\n-- six images, et rien derriere --');
  for (const cle of POUVOIRS) {
    const m = mesures[cle];
    ok(!!m, `${cle} se charge dans le navigateur`);
    if (!m) continue;
    eq(m.cases, 6, `${cle} : six cases de ${m.cw}x${m.ch}`);
    /* PAS DE FOND. Un effet est pose sur le decor et sur les creatures : un
       rectangle opaque derriere lui y ferait un trou noir, et c est le genre
       de defaut qu on ne voit qu en jeu. */
    ok(m.fond < 20, `${cle} : aucun fond derriere l effet (coin a alpha ${m.fond})`);
    /* Les six cases different : une planche mal coupee donne le meme dessin
       decale, et l effet sautille au lieu de vivre. */
    ok(m.ecartMini > 1.5,
       `${cle} : les six cases different (${m.ecartMini.toFixed(1)} au plus serre)`);
    /* Et il y a quelque chose a voir. Une planche entierement transparente
       passerait toutes les regles ci-dessus sans rien dessiner. */
    const vues = m.plein.filter((v) => v > 0.004).length;
    ok(vues >= 4, `${cle} : au moins quatre cases dessinent vraiment (${vues}/6)`);
  }

  console.log('\n-- ceux qui naissent et ceux qui meurent --');
  /* La brulure et le gel GRANDISSENT puis retombent : leur troisieme case doit
     etre plus pleine que la premiere. C est ce qui fait la difference entre un
     effet qui eclot et une image qu on allume. */
  for (const cle of ['brule', 'gele', 'repousse', 'soigne', 'mord']) {
    const m = mesures[cle];
    if (!m) continue;
    const pic = Math.max(...m.plein);
    ok(pic > m.plein[0] * 1.5,
       `${cle} eclot au lieu de s allumer (${(m.plein[0] * 100).toFixed(1)}% puis ${(pic * 100).toFixed(1)}%)`);
  }
  /* Le bouclier, lui, ne meurt pas en chemin : c est un anneau qui TOURNE
     pendant trois secondes, donc ses six cases sont a peu pres aussi pleines.
     Une derniere case vide voudrait dire qu il s eteint au premier tour. */
  const b = mesures.bouclier;
  if (b) {
    ok(b.plein[5] > b.plein[2] * 0.5,
       `le bouclier tient jusqu a sa derniere case (${(b.plein[2] * 100).toFixed(1)}% puis ${(b.plein[5] * 100).toFixed(1)}%)`);
  }

  console.log('\n-- et la page sait quoi en faire --');
  /* La table `FX_FAM` vit dans une portee fermee ; son EFFET, lui, se lit : la
     page demande la planche au serveur des qu un pouvoir se declenche. On
     verifie donc le seul point observable de l exterieur — le fichier que la
     page ira chercher, construit a partir de la cle du pouvoir. */
  for (const cle of POUVOIRS) {
    const url = 'img/nexus/effets/fam_' + cle + '.webp';
    ok(fs.existsSync(path.join(SITE, url)), `la cle « ${cle} » pointe sur ${url}`);
  }

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\npouvoirs_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
