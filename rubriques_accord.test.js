'use strict';
/*
 * LA PAGE ET LE SERVEUR NOMMENT-ILS LES MEMES SALLES ?
 *
 * ---- CE QUI EST ARRIVE ----
 *
 * Le serveur annonce ses galeries par salle, avec une cle chacune : `cinema`,
 * `manga`, `series`. La page, elle, doit savoir SOUS QUELLE CLE la galerie du
 * lieu ou l'on se tient est annoncee — c'est ce qui lui permet de mettre la
 * rubrique de la salle en tete du catalogue.
 *
 * Elle declarait `films`. Le serveur n'a jamais annonce `films`.
 *
 * Rien ne l'a signale, et c'est le pire de l'affaire : le catalogue
 * fonctionnait. Les rangees s'affichaient, les affiches se chargeaient, les
 * versions se lancaient. Seule la mise en tete devenait INERTE — la regle
 * cherchait une rubrique qui n'existe pas, ne la trouvait jamais, et rendait
 * simplement l'ordre du serveur. Un defaut qui ne casse rien et ne dit rien.
 *
 * ---- POURQUOI AUCUN ESSAI NE POUVAIT LE VOIR ----
 *
 * Les essais des deux cotes sont bons, et c'est justement le probleme : celui
 * de la page relit la cle DANS LA PAGE, celui du serveur relit la table DANS
 * LE SERVEUR. Chacun est coherent avec sa moitie, et deux moities coherentes
 * peuvent parler de deux choses differentes. Le desaccord ne vit dans aucun
 * des deux depots — il vit ENTRE eux, et il fallait donc un essai qui regarde
 * les deux a la fois.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SITE = __dirname;
const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok   ' + m); };

if (!fs.existsSync(path.join(SERVEUR, 'config.js'))) {
  console.log('rubriques_accord.test.js : depot du serveur introuvable — essai saute');
  process.exit(0);
}

/* La table du serveur, demandee au serveur — pas recopiee. */
process.env.DATA_DIR = process.env.DATA_DIR || '/tmp';
process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
const cfg = require(path.join(SERVEUR, 'config'));
const CLES = (cfg.SALLES_ECRAN || []).map((s) => s.cle);

/* Les rubriques que les salles de la page declarent, relues dans la source.
   On ne nomme aucune salle ici : le jour ou la salle manga et la salle series
   seront branchees, elles seront exigees sans qu'on y pense. */
const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
const declarees = [...src.matchAll(/rubrique:\s*'([a-z0-9_]*)'/g)].map((m) => m[1]);

console.log('-- ce que chacun declare --');
ok(CLES.length >= 2, `le serveur annonce ${CLES.length} salles a ecran : ${CLES.join(', ')}`);
/* Un plancher, sinon « toutes les rubriques declarees existent » serait vrai
   d'une page qui n'en declare aucune — et l'essai feliciterait le vide le jour
   ou la relecture ci-dessus cesse de trouver quoi que ce soit. */
ok(declarees.length >= 1,
   `la page declare ${declarees.length} rubrique(s) de salle : ${declarees.join(', ')}`);

console.log('\n-- et ils parlent de la meme chose --');
for (const r of declarees) {
  ok(CLES.indexOf(r) >= 0,
     CLES.indexOf(r) >= 0
       ? `« ${r} » est bien une salle que le serveur annonce`
       : `« ${r} » n'existe PAS cote serveur — les cles connues sont : ${CLES.join(', ')}`);
}

console.log(`\nrubriques_accord.test.js : ${n} verifications OK`);
