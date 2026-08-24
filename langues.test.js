'use strict';
/*
 * LES TROIS LANGUES DE L'EDITEUR NE DOIVENT PAS SE DESYNCHRONISER.
 *
 * ---- CE QUE CET ESSAI EMPECHE ----
 *
 * Une table de traduction se perime d'une seule facon : on ajoute un bouton,
 * on ecrit son mot en anglais, et les deux autres langues gardent le trou. Le
 * repli sur l'anglais fait que RIEN NE CASSE — c'est voulu — donc rien ne le
 * dit non plus. Un mois plus tard la moitie du panneau espagnol est en
 * anglais et personne ne sait depuis quand.
 *
 * On verifie donc trois accords, et chacun couvre une facon differente de se
 * tromper :
 *   - les trois langues portent EXACTEMENT les memes cles ;
 *   - chaque `data-t` de la page a une cle dans la table ;
 *   - chaque `T('...')` du script en a une aussi.
 *
 * Les deux derniers attrapent le cas inverse, plus vicieux : un libelle qui
 * demande une cle qui n'existe pas. Le repli rend alors la CLE elle-meme —
 * « famIso » ecrit sur un bouton — et cela se voit, mais seulement si l'on
 * ouvre le panneau dans la bonne langue.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok   ' + m); };
const SITE = __dirname;

/* La table se lit DANS la source, jamais recopiee ici : une copie serait un
   quatrieme endroit a tenir d'accord, et le premier a se perimer. */
const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
const debut = src.indexOf('var MAP_TEXTES = {');
assert.ok(debut > 0, 'MAP_TEXTES se trouve dans nexus.js');
let profond = 0, fin = -1;
for (let i = src.indexOf('{', debut); i < src.length; i++) {
  if (src[i] === '{') profond++;
  else if (src[i] === '}') { profond--; if (!profond) { fin = i + 1; break; } }
}
assert.ok(fin > 0, 'la table se referme');
const TEXTES = new Function('return ' + src.slice(src.indexOf('{', debut), fin))();

console.log('-- les trois langues portent les memes cles --');
const LANGUES = Object.keys(TEXTES);
ok(LANGUES.length === 3, `trois langues : ${LANGUES.join(', ')}`);
ok(!!TEXTES.en, "l'anglais existe : c'est lui qui bouche les trous");
const ref = Object.keys(TEXTES.en).sort();
ok(ref.length > 40, `${ref.length} textes par langue`);
for (const l of LANGUES) {
  if (l === 'en') continue;
  const k = Object.keys(TEXTES[l]).sort();
  const manque = ref.filter((x) => k.indexOf(x) < 0);
  const trop = k.filter((x) => ref.indexOf(x) < 0);
  ok(manque.length === 0, `« ${l} » ne laisse aucun trou${manque.length ? ' — ' + manque.join(', ') : ''}`);
  ok(trop.length === 0, `et ne porte rien d'inutile${trop.length ? ' — ' + trop.join(', ') : ''}`);
}
/* Un texte VIDE passerait les deux controles ci-dessus en etant aussi casse
   qu'une cle absente : le bouton serait blanc. */
for (const l of LANGUES) {
  const vides = Object.keys(TEXTES[l]).filter((k) => !String(TEXTES[l][k]).trim());
  ok(vides.length === 0, `« ${l} » n'a aucun texte vide${vides.length ? ' — ' + vides.join(', ') : ''}`);
}

console.log('\n-- et tout ce qui demande un texte en a un --');
const html = fs.readFileSync(path.join(SITE, 'nexus.html'), 'utf8');
const demandes = new Set();
/* `data-txt` et non `data-t` : ce dernier sert deja, dans la meme page, a
   porter un code clavier pour le reglage des touches. Relire l'un pour
   l'autre ferait reclamer une traduction de « KeyW ». */
for (const m of html.matchAll(/data-txt="([A-Za-z0-9_]+)"/g)) demandes.add(m[1]);
for (const m of html.matchAll(/data-txtph="([A-Za-z0-9_]+)"/g)) demandes.add(m[1]);
for (const m of html.matchAll(/data-txtaide="([A-Za-z0-9_]+)"/g)) demandes.add(m[1]);
ok(demandes.size > 15, `${demandes.size} libelles marques dans la page`);
/* ---- ET CHAQUE BOUTON D'OUTIL EXPLIQUE CE QU'IL FAIT ----
 * Un libelle NOMME, il n'explique pas : « Fill », « Rect », « Start » ne se
 * devinent pas, et quelqu'un qui ouvre l'editeur pour la premiere fois n'a
 * personne a qui demander. On verifie donc que tout bouton d'outil porte une
 * aide — c'est la seule facon d'etre sur que le prochain outil ajoute en
 * portera une aussi. */
const outils = [...html.matchAll(/<button id="(nxMapOutil[A-Za-z]+)"[^>]*>/g)];
ok(outils.length >= 6, `${outils.length} boutons d'outil dans la page`);
const muets = outils.filter((m) => !/data-txtaide=/.test(m[0])).map((m) => m[1]);
ok(muets.length === 0,
   `chaque outil dit ce qu'il fait${muets.length ? ' — muets : ' + muets.join(', ') : ''}`);
/* ---- UNE CLE EST DEMANDEE DES QUE QUELQU'UN LA NOMME ----
 * La moitie des appels choisissent leur cle sans l'ecrire dans l'appel :
 * `T(mienne ? 'editer' : 'visiter')` passe encore, mais `T(CODES[m.code])` et
 * `T(MAP_MODES[mode].dit)` la lisent dans une table. Chercher la forme
 * `T('x')` faisait passer dix textes bien vivants pour morts — et un rapport
 * qui ment est pire que pas de rapport, parce qu'on finit par supprimer ce
 * qu'il declare inutile. On releve donc toute chaine citee, ou qu'elle soit :
 * une cle que PERSONNE ne nomme nulle part est morte pour de bon. */
for (const m of src.matchAll(/'([A-Za-z0-9_]+)'/g)) {
  if (m[1] in TEXTES.en) demandes.add(m[1]);
}
ok(demandes.size > 25, `${demandes.size} textes demandes en tout, page et script`);
const orphelins = [...demandes].filter((k) => !(k in TEXTES.en));
ok(orphelins.length === 0,
   `aucun texte demande qui n'existe pas${orphelins.length ? ' — ' + orphelins.join(', ') : ''}`);
/* L'inverse n'est PAS une erreur : une cle non encore utilisee peut attendre
   son bouton. On le dit sans faire tomber l'essai. */
const dorment = ref.filter((k) => !demandes.has(k));
console.log(`   (${dorment.length} texte(s) dans la table que personne ne demande`
            + `${dorment.length ? ' : ' + dorment.join(', ') : ''})`);

console.log(`\nlangues.test.js : ${n} verifications OK`);
