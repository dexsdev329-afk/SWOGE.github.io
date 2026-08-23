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
for (const f of ['sol', 'mur', 'objet', 'monstre', 'salle']) {
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
    if (a.l !== e.l || a.h !== e.h || a.cadres !== e.cadres) {
      differents.push(`${fam}:${e.cle} (${a.l}x${a.h}/${a.cadres} ecrit, ${e.l}x${e.h}/${e.cadres} reel)`);
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

console.log('\n-- ce qu un editeur peut poser --');
const animes = (vrai.objet || []).filter((e) => e.cadres > 1);
ok(animes.length > 0, `${animes.length} elements animes : ${animes.map((e) => e.cle).join(', ')}`);
for (const e of animes) {
  ok(e.l % e.cadres === 0,
     `${e.cle} : ${e.l} se divise par ${e.cadres} — sinon une tranche du voisin bave sur les bords`);
}

console.log(`\ncatalogue.test.js : ${n} verifications OK`);
