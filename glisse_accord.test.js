/* LA MEME GLISSADE DES DEUX COTES DU RESEAU.
 *
 * ---- ce qui etait faux ----
 *
 * Les deux `glisse` — celui du serveur (`realm.js`, `_glisse`) et celui de la
 * page (`nexus.js`) — laissaient passer N'IMPORTE quel pas des que le point de
 * DEPART etait deja bloque. L'intention etait bonne : refuser le pas donnerait
 * un joueur coince pour toujours dans un rocher, et une regle qui se repare
 * toute seule vaut mieux qu'un piege ferme. Mais la porte de sortie servait
 * aussi de couloir : une fois dedans on circulait LIBREMENT dans la pierre,
 * mesure a trente-quatre unites sous la surface d'un rocher. La promesse « on
 * ne traverse pas la pierre » ne valait plus que pour l'approche.
 *
 * La regle, maintenant, des deux cotes :
 *   - depart libre : rien ne change, la glissade sur les deux axes reste ;
 *   - depart bloque + destination libre : on accepte, on est sorti ;
 *   - depart bloque + destination bloquee : on n'accepte QUE si l'on s'est
 *     strictement ecarte du centre de l'obstacle ou l'on se tenait.
 * S'eloigner tout droit augmente toujours la distance au centre : il existe
 * donc toujours une direction de sortie, et le piege ne se referme jamais.
 *
 * ---- pourquoi cet essai plutot que deux relectures ----
 *
 * La page PREDIT, le serveur FAIT AUTORITE. Deux textes qui se ressemblent ne
 * font pas la meme chose : il suffit d'un `>` contre un `>=`, ou d'une racine
 * carree d'un seul cote, pour que les deux repondent differemment a un pas sur
 * mille. Le joueur, lui, est alors ramene en arriere plusieurs fois par
 * seconde et lit ca comme une panne de reseau. On ne relit donc pas les deux
 * textes : on les FAIT TOURNER sur les MEMES entrees et on compare les
 * reponses.
 *
 * La page n'expose rien — `glisse` vit dans une fermeture. On DECOUPE donc son
 * texte dans `nexus.js` et on l'evalue tel quel : c'est le code du jeu qui
 * repond, pas une copie ecrite ici, et une copie ecrite ici serait justement
 * la troisieme version qu'on cherche a eviter.
 *
 * Aucun chiffre n'est ecrit ici : le rayon du joueur se relit dans les deux
 * sources, la carte se demande au moteur.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

if (!fs.existsSync(path.join(SERVEUR, 'realm.js'))) {
  console.log('glisse_accord.test.js : depot du serveur introuvable — essai saute');
  process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
/* Une etape qui n'a pas eu lieu doit le DIRE et arreter l'essai. Sans ca, les
   verifications suivantes repondraient vrai dans le vide — un decoupage rate
   rendrait une fonction qui ne bloque jamais, et « les deux sont d'accord »
   serait une phrase sur du sable. */
const exige = (c, m) => { ok(!!c, m); if (!c) { console.log(`\nglisse_accord.test.js — ${n} verifications, ${rates} echec(s)`); process.exit(1); } };

// ================== LA REGLE DE LA PAGE, DECOUPEE DANS LA PAGE
const SRC_PAGE = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
const DEBUT = SRC_PAGE.indexOf('  var RAYON_MOI =');
const APRES = SRC_PAGE.indexOf('  function glisse(deX, deY, x, y) {', DEBUT);
const FIN_G = APRES < 0 ? -1 : SRC_PAGE.indexOf('\n  }\n', APRES);
exige(DEBUT >= 0 && APRES > DEBUT && FIN_G > APRES,
      'on retrouve `RAYON_MOI`, `blocEn` et `glisse` dans nexus.js');
const MORCEAU = SRC_PAGE.slice(DEBUT, FIN_G + 4);
exige(/function blocEn\(/.test(MORCEAU) && /function glisse\(/.test(MORCEAU),
      `le morceau decoupe porte bien les deux fonctions (${MORCEAU.length} caracteres)`);

let PAGE = null;
try {
  PAGE = new Function('OBSTACLES_C',
    MORCEAU + '\nreturn { glisse: glisse, blocEn: blocEn, RAYON_MOI: RAYON_MOI };');
} catch (e) {
  exige(false, 'le morceau de page s evalue — ' + e.message);
}

// ================== LA REGLE DU SERVEUR, TELLE QUE LE JEU L'APPELLE
const { Realm } = require(path.join(SERVEUR, 'realm.js'));
const M = require(path.join(SERVEUR, 'monde.js'));
const SRC_SERVEUR = fs.readFileSync(path.join(SERVEUR, 'realm.js'), 'utf8');
/* Le rayon du joueur n'est pas exporte : on le relit dans la source plutot que
   de le recopier ici. Un nombre recopie serait un troisieme endroit ou il
   pourrait changer sans que personne ne s'en apercoive. */
const mR = /const RAYON_JOUEUR = (\d+)/.exec(SRC_SERVEUR);
exige(!!mR, 'on relit RAYON_JOUEUR dans realm.js');
const RAYON_SERVEUR = Number(mR[1]);

function alea(graine) {
  let s = graine >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* La carte vient du MOTEUR, pas d'une liste ecrite ici — et elle passe par
   JSON, comme sur le reseau : c'est exactement ce que la page recoit. */
const CARTE = JSON.parse(JSON.stringify(M.obstacles(alea(4242))));
exige(CARTE.length === M.OBSTACLE.nombre,
      `la carte d essai est celle du jeu (${CARTE.length} blocs)`);

const page = PAGE(CARTE);
ok(page.RAYON_MOI === RAYON_SERVEUR,
   `le joueur a le meme rayon des deux cotes (page ${page.RAYON_MOI}, serveur ${RAYON_SERVEUR})`);
const R = RAYON_SERVEUR;

const monde = new Realm({ alea: alea(7) });
monde.obstacles = CARTE;

/* ================== 1. LES MEMES ENTREES, LES MEMES REPONSES ==================
 *
 * On ne tire pas des points au hasard dans le vide : on viserait le cas
 * ennuyeux — loin de tout, ou les deux repondent « oui » sans rien calculer.
 * On construit donc les departs AUTOUR des rochers de la carte : dedans au
 * fond, dedans pres du bord, juste dehors, et un peu plus loin.
 */
const CLASSES = {
  'libre : rien ne gene': 0,
  'glissade sur x': 0,
  'glissade sur y': 0,
  'refus des deux axes': 0,
  'dedans, la sortie est libre': 0,
  'dedans, on s ecarte du centre': 0,
  'dedans, on ne s ecarte pas : refuse': 0,
};
const desaccords = [];
let cas = 0;
const nul = (a, b) => a.x === b.x && a.y === b.y;

function classe(deX, deY, x, y, res) {
  const dedans = M.bloque(CARTE, deX, deY, R);
  if (dedans) {
    if (!M.bloque(CARTE, x, y, R)) return 'dedans, la sortie est libre';
    return nul(res, { x: deX, y: deY })
      ? 'dedans, on ne s ecarte pas : refuse' : 'dedans, on s ecarte du centre';
  }
  if (!M.bloque(CARTE, x, y, R)) return 'libre : rien ne gene';
  if (res.x === x && res.y === deY) return 'glissade sur x';
  if (res.x === deX && res.y === y) return 'glissade sur y';
  return 'refus des deux axes';
}

const rnd = alea(99);
const r0 = M.OBSTACLE.rayon;
for (const o of CARTE) {
  /* Huit directions, quatre profondeurs : du centre du rocher jusqu'a deux
     rayons dehors. La couronne « juste au bord » est celle qui compte — c'est
     la que les deux regles ont le plus d'occasions de diverger. */
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (const prof of [0, 0.45, 0.9, 1.35, 1.9]) {
      const deX = o.x + Math.cos(a) * (r0 + R) * prof;
      const deY = o.y + Math.sin(a) * (r0 + R) * prof;
      for (let d = 0; d < 8; d++) {
        const b = (d / 8) * Math.PI * 2;
        for (const pas of [3, 17, 44, 90]) {
          const x = deX + Math.cos(b) * pas, y = deY + Math.sin(b) * pas;
          const s = monde._glisse(deX, deY, x, y, R);
          const p = page.glisse(deX, deY, x, y);
          cas++;
          CLASSES[classe(deX, deY, x, y, s)]++;
          if (s.x !== p.x || s.y !== p.y) {
            desaccords.push({ deX, deY, x, y, serveur: s, page: p });
          }
        }
      }
    }
  }
  /* Et des pas tires au sort, pour ne pas ne verifier que la geometrie qu'on
     a choisie soi-meme. */
  for (let k = 0; k < 40; k++) {
    const deX = o.x + (rnd() - 0.5) * 260, deY = o.y + (rnd() - 0.5) * 260;
    const x = deX + (rnd() - 0.5) * 180, y = deY + (rnd() - 0.5) * 180;
    const s = monde._glisse(deX, deY, x, y, R);
    const p = page.glisse(deX, deY, x, y);
    cas++;
    CLASSES[classe(deX, deY, x, y, s)]++;
    if (s.x !== p.x || s.y !== p.y) desaccords.push({ deX, deY, x, y, serveur: s, page: p });
  }
}

console.log('\n-- les deux regles, sur les memes entrees --');
ok(cas > 10000, `on a compare ${cas} pas`);
ok(desaccords.length === 0,
   'la page et le serveur repondent la MEME chose a chaque pas' +
   (desaccords.length ? ' — ' + JSON.stringify(desaccords[0]) : ''));

/* Un accord parfait ne vaut rien si les cas interessants n'ont jamais ete
   joues : deux fonctions qui disent toujours oui sont d'accord elles aussi. On
   exige donc que CHAQUE branche ait ete empruntee, et on dit combien de fois. */
console.log('\n-- chaque branche a bien ete jouee --');
for (const k of Object.keys(CLASSES)) {
  ok(CLASSES[k] > 0, `« ${k} » : ${CLASSES[k]} cas`);
}

/* ================== 2. CE QUE LA REGLE PROMET ==================
 *
 * L'accord ne dit pas que la regle est bonne — deux erreurs identiques
 * s'accordent parfaitement. On verifie donc separement ce qu'elle promet, et
 * on le verifie sur les DEUX.
 */
console.log('\n-- on ne circule plus dans la pierre --');
const gros = CARTE[0];
/* Un point au FOND du rocher, a la profondeur ou le defaut avait ete mesure :
   trente-quatre unites sous la surface de blocage. La profondeur se CALCULE —
   rayon du bloc plus rayon du joueur, moins la distance au centre — plutot que
   de se recopier : le jour ou les rochers changent de taille, elle suit. */
const dedansX = gros.x + r0 * 0.7, dedansY = gros.y;
const PROFOND = (gros.r + R) - Math.hypot(dedansX - gros.x, dedansY - gros.y);
ok(!!M.bloque(CARTE, dedansX, dedansY, R),
   `le point d essai est bien dans la pierre, a ${Math.round(PROFOND)} unites sous la surface`);

/* ---- S'ENFONCER ----
 * Le pas qui va VERS le centre. C'etait le plus visible des pas qu'on
 * acceptait : on entrait un peu plus a chaque image, sans jamais rencontrer
 * quoi que ce soit. */
let ex = dedansX, ey = dedansY, enfonces = 0, ecarts = 0;
for (let k = 0; k < 60; k++) {
  const dx = gros.x - ex, dy = gros.y - ey;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const cx = ex + (dx / d) * 12, cy = ey + (dy / d) * 12;
  const s = monde._glisse(ex, ey, cx, cy, R);
  const p = page.glisse(ex, ey, cx, cy);
  if (s.x !== p.x || s.y !== p.y) { ecarts++; break; }
  if (s.x !== ex || s.y !== ey) enfonces++;
  ex = s.x; ey = s.y;
}
ok(ecarts === 0 && enfonces === 0,
   `soixante pas vers le centre du rocher sont tous refuses, des deux cotes (${enfonces} accepte(s))`);
ok(Math.hypot(ex - dedansX, ey - dedansY) < 0.001,
   `on n a pas avance d un pouce (${Math.hypot(ex - dedansX, ey - dedansY).toFixed(3)} unite)`);

/* ---- LA TRAVERSEE ----
 * Le pas qui ressort de l'autre cote sans jamais s'ecarter du centre : meme
 * profondeur, cote oppose. C'est celui qui faisait de la pierre un couloir.
 * Sa distance au centre est EXACTEMENT la meme — un carre ne distingue pas un
 * nombre de son oppose — donc il n'est pas « strictement ecarte », donc il est
 * refuse, et des deux cotes de la meme facon. */
const tvX = 2 * gros.x - dedansX, tvY = dedansY;
ok(!!M.bloque(CARTE, tvX, tvY, R), 'le point vise est dans la meme pierre');
const trS = monde._glisse(dedansX, dedansY, tvX, tvY, R);
const trP = page.glisse(dedansX, dedansY, tvX, tvY);
ok(trS.x === dedansX && trS.y === dedansY,
   `le serveur refuse la traversee (${Math.round(Math.hypot(tvX - dedansX, tvY - dedansY))} unites de pierre)`);
ok(trP.x === trS.x && trP.y === trS.y, 'et la page la refuse au meme endroit');

/* ---- ET AUCUNE PROMENADE, QUELLE QU'ELLE SOIT ----
 * On ne devine pas quel chemin un tricheur essaierait : on en essaie mille au
 * hasard depuis le fond du rocher, et on verifie l'invariant qui les couvre
 * tous — tant qu'on est dans la pierre, la distance au centre ne DIMINUE
 * jamais. Une promenade, c'est exactement ca : y revenir. */
let mx = dedansX, my = dedansY, recules = 0, bouges = 0, dernier = Math.hypot(mx - gros.x, my - gros.y);
const marche = alea(1234);
for (let k = 0; k < 1000; k++) {
  const dedans = M.bloque(CARTE, mx, my, R);
  if (!dedans) break;
  const a = marche() * Math.PI * 2;
  const cx = mx + Math.cos(a) * 14, cy = my + Math.sin(a) * 14;
  const s = monde._glisse(mx, my, cx, cy, R);
  const p = page.glisse(mx, my, cx, cy);
  if (s.x !== p.x || s.y !== p.y) { recules++; break; }
  if (s.x !== mx || s.y !== my) bouges++;
  mx = s.x; my = s.y;
  const d = Math.hypot(mx - gros.x, my - gros.y);
  if (d < dernier - 0.000001) recules++;
  dernier = d;
}
ok(bouges > 0 && recules === 0,
   `mille pas au hasard depuis le fond : ${bouges} acceptes, aucun ne rapproche du centre`);

console.log('\n-- mais on peut toujours en sortir --');
/* Depuis CHAQUE point interieur qu'on sait construire, le pas droit vers
   l'exterieur doit passer. C'est la moitie qu'il ne faut pas casser : sans
   elle, un joueur pose dans un rocher n'aurait plus aucun coup a jouer. */
let sorties = 0, coinces = 0;
for (const o of CARTE.slice(0, 40)) {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const px = o.x + Math.cos(a) * r0 * 0.3, py = o.y + Math.sin(a) * r0 * 0.3;
    if (!M.bloque(CARTE, px, py, R)) continue;
    const dedans = M.bloque(CARTE, px, py, R);
    const vx = px - dedans.x, vy = py - dedans.y;
    const d = Math.sqrt(vx * vx + vy * vy);
    /* Pile au centre, aucune direction ne se deduit : on pousse vers la
       droite, ce qui s'ecarte tout autant. */
    const ux = d > 0.001 ? vx / d : 1, uy = d > 0.001 ? vy / d : 0;
    const s = monde._glisse(px, py, px + ux * 30, py + uy * 30, R);
    const p = page.glisse(px, py, px + ux * 30, py + uy * 30);
    if (s.x !== p.x || s.y !== p.y) { coinces++; continue; }
    if (s.x === px && s.y === py) coinces++; else sorties++;
  }
}
ok(sorties > 0 && coinces === 0,
   `le pas droit vers l exterieur passe toujours (${sorties} points interieurs, ${coinces} coince(s))`);

/* Et il en sort VRAIMENT : en repetant ce pas, on finit dehors. Un pas accepte
   qui ne menerait nulle part serait une prison plus polie, pas une sortie. */
let sx = dedansX, sy = dedansY, pas = 0;
for (; pas < 40; pas++) {
  const dedans = M.bloque(monde.obstacles, sx, sy, R);
  if (!dedans) break;
  const vx = sx - dedans.x, vy = sy - dedans.y;
  const d = Math.sqrt(vx * vx + vy * vy);
  const ux = d > 0.001 ? vx / d : 1, uy = d > 0.001 ? vy / d : 0;
  const s = monde._glisse(sx, sy, sx + ux * 30, sy + uy * 30, R);
  const p = page.glisse(sx, sy, sx + ux * 30, sy + uy * 30);
  if (s.x !== p.x || s.y !== p.y) break;
  if (s.x === sx && s.y === sy) break;
  sx = s.x; sy = s.y;
}
ok(!M.bloque(CARTE, sx, sy, R),
   `en s eloignant tout droit, on est dehors en ${pas} pas`);

console.log('\n-- et on n y rentre toujours pas --');
/* La moitie qui n'a pas change : depuis le dehors, aucun pas n'entre. */
let entrees = 0, essais = 0;
for (const o of CARTE.slice(0, 60)) {
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const px = o.x + Math.cos(a) * (r0 + R + 2), py = o.y + Math.sin(a) * (r0 + R + 2);
    if (M.bloque(CARTE, px, py, R)) continue;
    const s = monde._glisse(px, py, o.x, o.y, R);
    const p = page.glisse(px, py, o.x, o.y);
    essais++;
    if (s.x !== p.x || s.y !== p.y) entrees++;
    else if (M.bloque(CARTE, s.x, s.y, R)) entrees++;
  }
}
ok(essais > 0 && entrees === 0,
   `${essais} pas vises droit dans un rocher, aucun n y entre`);

console.log(`\nglisse_accord.test.js — ${n} verifications, ${rates} echec(s)`);
process.exit(rates ? 1 : 0);
