'use strict';
/*
 * LE CATALOGUE NE DOIT JAMAIS SE PERIMER.
 *
 * `catalogue.json` liste tout ce que l'editeur de cartes peut poser. Il est
 * GENERE des fichiers — mais un fichier genere qu'on oublie de regenerer est
 * exactement une liste ecrite a la main, avec l'air d'etre sur. C'est le
 * defaut que ce depot a paye quatre fois : la planche est la, personne ne la
 * propose, et rien ne le dit.
 *
 * Cet essai regenere et compare. Il ne se contente pas de dire « c'est
 * perime » : il nomme ce qui manque et ce qui est en trop.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { construis } = require('./outils_catalogue.js');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok   ' + m); };
const SITE = __dirname;

const vrai = construis(SITE);
const F = path.join(SITE, 'catalogue.json');

console.log('-- ce que les dossiers contiennent --');
const total = Object.values(vrai).reduce((s, l) => s + l.length, 0);
ok(total > 80, `${total} elements trouves dans les dossiers`);
/* Sans ce plancher, « le catalogue est a jour » serait vrai d'un catalogue
   VIDE le jour ou la lecture des dossiers cesse de trouver quoi que ce soit. */
for (const f of ['sol', 'mur', 'objet', 'monstre', 'salle', 'iso']) {
  ok(vrai[f] && vrai[f].length > 0, `la famille « ${f} » n'est pas vide (${vrai[f] ? vrai[f].length : 0})`);
}

console.log('\n-- et le fichier dit la meme chose --');
ok(fs.existsSync(F), 'catalogue.json existe');
let ecrit = null;
try { ecrit = JSON.parse(fs.readFileSync(F, 'utf8')); } catch (e) { ecrit = null; }
ok(!!ecrit, 'catalogue.json se lit');

const manquants = [], enTrop = [], differents = [];
for (const [fam, liste] of Object.entries(vrai)) {
  const par = new Map((ecrit[fam] || []).map((e) => [e.cle, e]));
  for (const e of liste) {
    const a = par.get(e.cle);
    if (!a) { manquants.push(fam + ':' + e.cle); continue; }
    if (a.l !== e.l || a.h !== e.h || a.cadres !== e.cadres || a.cases !== e.cases) {
      differents.push(`${fam}:${e.cle} (${a.l}x${a.h}/${a.cadres}/${a.cases} ecrit,`
                      + ` ${e.l}x${e.h}/${e.cadres}/${e.cases} reel)`);
    }
    par.delete(e.cle);
  }
  for (const k of par.keys()) enTrop.push(fam + ':' + k);
}
ok(manquants.length === 0,
   `aucun element absent du catalogue${manquants.length ? ' — ' + manquants.slice(0, 8).join(', ') : ''}`);
ok(enTrop.length === 0,
   `aucune entree qui ne corresponde plus a un fichier${enTrop.length ? ' — ' + enTrop.slice(0, 8).join(', ') : ''}`);
/* La TAILLE et le nombre d'images comptent autant que le nom : une planche
   remplacee par une autre de rapport different se dessinerait etiree, et une
   bande passee de une a quatre images se dessinerait aplatie. */
ok(differents.length === 0,
   `taille et nombre d'images concordent${differents.length ? ' — ' + differents.slice(0, 5).join(' | ') : ''}`);

console.log('\n-- deux familles ne se volent pas une cle --');
/* ---- POURQUOI CET ESSAI EXISTE, ET SUR QUELLES FAMILLES ----
 *
 * Une case de carte a DEUX champs : `s` pour le sol, `o` pour ce qui se pose
 * dessus. Elle garde la CLE de l'element, jamais sa famille — c'est ce qui la
 * fait tenir dans une socket. Le champ `s` designe donc les sols sans
 * ambiguite possible, et un `ground_cave` peut porter le meme nom qu'un
 * `mur_cave` sans que rien ne s'y trompe : ils ne sont jamais cherches dans le
 * meme champ. C'est le cas aujourd'hui de « cave », « donjon », « ville » et
 * « sanctuaire », et ce n'est pas un defaut.
 *
 * Le champ `o`, lui, est PARTAGE par quatre familles, et le dessin les essaie
 * l'une apres l'autre. La, deux memes noms font que la premiere repond a la
 * place de l'autre : la carte affiche autre chose que ce qu'on y a pose, et
 * rien ne le dit. C'est ce groupe-la, et lui seul, que cet essai tient.
 *
 * Le prefixe des parcelles isometriques rend le cas impossible pour elles ;
 * les autres familles, dont les cles sont decoupees du nom de fichier, n'ont
 * que cet essai pour les en empecher.
 */
const POSABLES = ['mur', 'objet', 'monstre', 'salle', 'iso'];
const vues = new Map();
const doubles = [];
for (const fam of POSABLES) {
  for (const e of (vrai[fam] || [])) {
    if (vues.has(e.cle)) doubles.push(`${e.cle} (${vues.get(e.cle)} et ${fam})`);
    else vues.set(e.cle, fam);
  }
}
ok(doubles.length === 0,
   `les ${vues.size} elements du champ « o » portent des noms distincts`
   + `${doubles.length ? ' — ' + doubles.join(', ') : ''}`);

console.log('\n-- une parcelle isometrique occupe la place qu elle prend --');
/* Sans emprise, une parcelle de six cents pixels se dessinerait dans une case
   de quatorze : un batiment reduit a une tache. Et sans borne haute, une
   planche livree en pleine page couvrirait la moitie de la carte. */
let empriseUne = 0, empriseGrande = 0;
for (const e of (vrai.iso || [])) {
  ok(e.cases >= 1 && e.cases <= 8,
     `${e.cle} : ${e.l} px de large font ${e.cases} case(s)`);
  if (e.cases === 1) empriseUne++; else empriseGrande++;
}
console.log(`   (${empriseUne} plaque(s) d'une case, ${empriseGrande} parcelle(s) plus larges)`);
/* ---- ET LA REGLE ELLE-MEME, PLUTOT QUE L'INVENTAIRE DU JOUR ----
 * On verifiait ici que des plaques d'une case et des parcelles de plusieurs
 * COEXISTAIENT dans le catalogue. C'etait vrai tant que les plaques y
 * etaient — et le jour ou on les a retirees, cet essai est tombe en parlant
 * d'un plancher que personne n'avait touche. Un essai qui tombe pour une
 * raison qu'il ne nomme pas est pire qu'aucun essai : on le repare au hasard.
 * On interroge donc la fonction, avec les largeurs qui font la difference —
 * elles repondront la meme chose le jour ou plus aucune planche ne les
 * mesure. */
const { empriseIso } = require('./outils_catalogue.js');
ok(empriseIso(75) === 1,
   'une plaque de 75 px tient sur UNE case : un plancher a deux lui aurait fait'
   + ' couvrir quatre fois sa surface');
ok(empriseIso(600) === 5, 'une parcelle de 600 px en occupe cinq');
ok(empriseIso(128) === 1, 'et une tuile pleine, exactement une');
ok(empriseIso(1) === 1, 'rien ne descend sous une case, pas meme un pixel');

console.log('\n-- ce qu un editeur peut poser --');
const animes = (vrai.objet || []).filter((e) => e.cadres > 1);
ok(animes.length > 0, `${animes.length} elements animes : ${animes.map((e) => e.cle).join(', ')}`);
for (const e of animes) {
  ok(e.l % e.cadres === 0,
     `${e.cle} : ${e.l} se divise par ${e.cadres} — sinon une tranche du voisin bave sur les bords`);
}

console.log(`\ncatalogue.test.js : ${n} verifications OK`);
