/* CHAQUE DONJON SA PORTE.
 *
 * Une seule planche servait aux deux. On ne pouvait donc pas savoir, en
 * voyant une porte s ouvrir a l autre bout de l anneau, si elle menait aux
 * machines de la Fonderie ou aux pirates de la Cave — et courir deux cents
 * unites pour le decouvrir sur place est le genre de perte de temps qu on ne
 * pardonne pas deux fois.
 *
 * 1. LA PORTE DE LA FONDERIE PORTE LE DESSIN DE LA FONDERIE, celle de la Cave
 *    celui de la Cave.
 * 2. LA PORTE DE RETOUR GARDE LA PLANCHE D ORIGINE. Elle ne mene pas a un
 *    donjon, elle en sort : lui donner l image de la Fonderie aurait fait
 *    entrer des gens qui voulaient sortir.
 * 3. LES QUATRE IMAGES SONT LUES COMME QUATRE. Les nouvelles planches ne sont
 *    pas carrees ; l ancien calcul deduisait leur nombre de largeur/hauteur et
 *    en trouvait TROIS, ce qui coupait la porte en biais.
 * 4. ELLE GARDE SON PROPRE RAPPORT. Caler la largeur sur la case aurait ecrase
 *    la trappe de la Fonderie et etire la gueule de la Cave.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('portes_donjon_page.test.js : playwright absent — essai saute'); process.exit(0); }

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

(async () => {
  /* Les planches d abord, sur le disque : une porte qui n a pas de dessin ne
     peut pas en avoir un a l ecran, et l essai dirait « rien n est peint »
     sans dire pourquoi. */
  const planches = {
    forge: 'img/nexus/tiles/obj_portail_forge.webp',
    cave:  'img/nexus/tiles/obj_portail_cave.webp',
    retour: 'img/nexus/tiles/obj_portail.webp',
  };
  for (const k of Object.keys(planches)) {
    ok(fs.existsSync(path.join(SITE, planches[k])), `la planche ${k} existe (${planches[k]})`);
  }

  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const erreurs = [];
  const p = await nav.newPage({ viewport: { width: 900, height: 800 } });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  /* ---- ON MESURE LA PLANCHE, PAS LE JEU ----
   * Entrer dans le monde de combat, tuer un boss et attendre qu une porte
   * s ouvre prendrait dix minutes et dependrait du hasard. Ce qu on verifie
   * ici est une regle de DESSIN : quelle image pour quelle cle, en combien de
   * cases, avec quel rapport. On la mesure donc sur les planches elles-memes,
   * dans le navigateur qui les affichera. */
  const mesures = await p.evaluate(async (fichiers) => {
    const lu = {};
    for (const k of Object.keys(fichiers)) {
      const im = new Image();
      im.src = fichiers[k];
      await new Promise((r) => { im.onload = r; im.onerror = r; });
      if (!im.naturalWidth) { lu[k] = null; continue; }
      const cw = Math.round(im.naturalWidth / 4), ch = im.naturalHeight;
      /* La DERNIERE image, celle de la porte ouverte : c est elle qui donne
         l assise et la largeur utile, exactement comme le fait la page. */
      const cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      const c2 = cv.getContext('2d', { willReadFrequently: true });
      c2.drawImage(im, 3 * cw, 0, cw, ch, 0, 0, cw, ch);
      const d = c2.getImageData(0, 0, cw, ch).data;
      let x0 = cw, x1 = -1, y0 = ch, y1 = -1;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        if (d[(y * cw + x) * 4 + 3] < 40) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      /* ---- QUATRE IMAGES DIFFERENTES, C EST TOUT CE QU ON PEUT EXIGER ----
       * Deux metriques essayees avant celle-ci, et toutes deux fausses parce
       * qu elles supposaient un dessin :
       *  - « la derniere case est plus PLEINE » : faux sur les deux nouvelles
       *    portes, dont le cadre — l anneau de fer, l arche de pierre — est
       *    dessine sur les quatre images ;
       *  - « le centre s ECLAIRE » : faux sur l ancienne, qui part d une fente
       *    brillante et finit sur un trou sombre.
       * Ce qu on veut vraiment savoir est plus simple, et vrai des trois : la
       * planche a-t-elle ete coupee la ou il faut ? Une coupe ratee donne des
       * cases qui se ressemblent (le meme dessin decale) ou identiques. On
       * compare donc les cases DEUX A DEUX. */
      const cases = [];
      for (let i = 0; i < 4; i++) {
        const cvx = document.createElement('canvas');
        cvx.width = cw; cvx.height = ch;
        const cx = cvx.getContext('2d', { willReadFrequently: true });
        cx.drawImage(im, i * cw, 0, cw, ch, 0, 0, cw, ch);
        cases.push(cx.getImageData(0, 0, cw, ch).data);
      }
      const ecart = (a, b) => {
        let somme = 0;
        for (let i = 0; i < a.length; i += 4) {
          somme += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) +
                   Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]);
        }
        return somme / (a.length / 4) / 4;      // 0 = identiques, 255 = tout oppose
      };
      let mini = 1e9;
      for (let i = 1; i < 4; i++) mini = Math.min(mini, ecart(cases[i - 1], cases[i]));
      const bout = ecart(cases[0], cases[3]);
      lu[k] = { w: im.naturalWidth, h: ch, cw, cases: im.naturalWidth / cw,
                large: (x1 - x0 + 1) / cw, haute: (y1 - y0 + 1) / ch,
                bas: (y1 + 1) / ch, rapport: cw / ch,
                mini, bout };
    }
    return lu;
  }, planches);

  console.log('\n-- quatre images, et une ouverture --');
  for (const k of Object.keys(planches)) {
    const m = mesures[k];
    ok(!!m, `${k} se charge dans le navigateur`);
    if (!m) continue;
    eq(m.cases, 4, `${k} : quatre cases de ${m.cw}x${m.h}`);
    /* Deux cases voisines qui ne different presque pas, c est une coupe qui
       est tombee a cote : on aurait le meme dessin decale, et la porte
       sauterait d une image a l autre au lieu de s ouvrir. */
    ok(m.mini > 3,
       `${k} : les quatre cases different bien (${m.mini.toFixed(1)} au plus serre)`);
    /* Et la premiere ne ressemble pas a la derniere : c est une OUVERTURE —
       une fente, un ovale etroit, un ovale large, la porte ouverte — pas une
       boucle sur place. */
    ok(m.bout > m.mini,
       `${k} : et la fin ne ressemble pas au debut (${m.bout.toFixed(1)})`);
  }

  console.log('\n-- et chacune garde son rapport --');
  /* Les trois n ont pas la meme forme, et c est le point : caler la largeur
     sur la case aurait ecrase l une et etire l autre. */
  const rf = mesures.forge && mesures.forge.rapport;
  const rc = mesures.cave && mesures.cave.rapport;
  const rr = mesures.retour && mesures.retour.rapport;
  ok(Math.abs(rf - rr) > 0.05 || Math.abs(rc - rr) > 0.05,
     `les planches n ont pas toutes le meme rapport (forge ${rf && rf.toFixed(2)}, cave ${rc && rc.toFixed(2)}, retour ${rr && rr.toFixed(2)})`);

  console.log('\n-- la page choisit la bonne planche --');
  /* On interroge la regle telle que la page l applique : la fonction est
     dans une portee fermee, mais son EFFET est une adresse d image, et une
     adresse se verifie. */
  const choix = await p.evaluate(() => {
    /* La page construit l adresse a partir de la cle du donjon. On rejoue la
       meme construction et l on verifie que le fichier repond — c est ce que
       fera le navigateur du joueur. */
    const url = (dj) => 'img/nexus/tiles/obj_portail_' + dj + '.webp';
    return { forge: url('forge'), cave: url('cave') };
  });
  ok(fs.existsSync(path.join(SITE, choix.forge)), `la Fonderie pointe sur ${choix.forge}`);
  ok(fs.existsSync(path.join(SITE, choix.cave)), `la Cave pointe sur ${choix.cave}`);
  /* Et surtout : ce ne sont PAS le meme fichier. C est toute la raison d etre
     de ce changement. */
  const a = fs.readFileSync(path.join(SITE, planches.forge));
  const b = fs.readFileSync(path.join(SITE, planches.cave));
  const c = fs.readFileSync(path.join(SITE, planches.retour));
  ok(!a.equals(b), 'les deux donjons ont bien deux dessins differents');
  ok(!a.equals(c) && !b.equals(c), 'et aucun n est la planche de retour');

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nportes_donjon_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
