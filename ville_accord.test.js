'use strict';
/*
 * LA VILLE : LE SERVEUR LA NOMME, LA PAGE LA DESSINE — LES MEMES NOMS ?
 *
 * ---- POURQUOI CE FICHIER EXISTE A COTE DES DEUX AUTRES ----
 *
 * Le serveur ne dessine rien. Il NOMME : un sol (« ville »), une pierre
 * (« donjon »), et une planche par facade (« tour_maison »…). La page ne
 * connait aucun de ces noms a l'avance — elle en fabrique un chemin de
 * fichier et le demande au reseau.
 *
 * C'est exactement la faute que `rubriques_accord.test.js` decrit : l'essai du
 * serveur relit la table DANS le serveur, celui de la page relit sa regle DANS
 * la page, chacun est coherent avec sa moitie, et les deux peuvent parler de
 * deux choses differentes. Le desaccord ne vit dans aucun des deux depots — il
 * vit ENTRE eux.
 *
 * Et ici, il ne serait pas seulement muet, il serait GRAVE. Une planche de sol
 * absente n'est pas un carre vide : `drawImage` leve `InvalidStateError` sur
 * une image cassee, l'exception part a chaque image, et la boucle de dessin
 * s'arrete. Un nom sans fichier derriere fige tout le jeu.
 *
 * ---- CE QU'ON CONFRONTE ----
 *
 * 1. Chaque nom que le serveur envoie a un FICHIER dans ce depot — en passant
 *    par la regle de nommage de la page, relue dans la page.
 * 2. Chaque bande animee se DIVISE par son nombre d'images. Une largeur qui ne
 *    divise pas fait baver un eclat de l'image voisine sur chaque bord ; le
 *    hall a deja paye ca avec une planche de 639 pixels pour quatre images.
 * 3. La page sait lire les champs que le serveur ajoute. Un champ ignore
 *    laisserait la facade invisible et le pate infranchissable — le pire des
 *    resultats : ca arrete, et ca ne montre rien.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SITE = __dirname;
const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok   ' + m); };
const eq = (a, b, m) => { assert.strictEqual(a, b, m + ` [${a} vs ${b}]`); n++; console.log('  ok   ' + m); };

if (!fs.existsSync(path.join(SERVEUR, 'monde.js'))) {
  console.log('ville_accord.test.js : depot du serveur introuvable — essai saute');
  process.exit(0);
}

const { tailleWebp } = require('./taille_image.js');
const monde = require(path.join(SERVEUR, 'monde'));
const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');

/* ---- LA REGLE DE NOMMAGE DES SOLS, RELUE DANS LA PAGE ----
 * Recopier « ground_ + biome » ici aurait fait de cet essai une troisieme
 * moitie coherente avec elle-meme. On relit la table d'exceptions et le repli
 * dans le fichier qui les applique. */
function fichierSolSelonLaPage(biome) {
  const bloc = /var FICHIER_SOL = \{([\s\S]*?)\};/.exec(src);
  if (!bloc) return null;
  const paires = [...bloc[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)];
  const table = Object.fromEntries(paires.map((m) => [m[1], m[2]]));
  const repli = /function fichierSol\(b\) \{ return FICHIER_SOL\[b\] \|\| \('([^']+)' \+ b\); \}/.exec(src);
  if (!repli) return null;
  return table[biome] || (repli[1] + biome);
}

/* ---- ET CELLE DES PIERRES ----
 * La page ne connait que deux planches de mur, et elle les choisit sur le nom
 * que le serveur envoie. On relit la ligne plutot que de la recopier : le jour
 * ou une troisieme pierre arrive, cet essai suit sans qu'on y pense. */
function fichierMurSelonLaPage(nom) {
  const l = /var img = \(MONDE_C && MONDE_C\.mur === '(\w+)'\) \? IMG_MUR_CAVE : IMG_MUR_DJ;/.exec(src);
  if (!l) return null;
  return nom === l[1] ? 'mur_cave' : 'mur_donjon';
}

const plan = monde.planDeVille();
const facades = plan.obstacles.filter((o) => o.bat);

console.log('-- ce que le serveur envoie --');
ok(facades.length > 0, `${facades.length} facades dans le plan de la ville`);
ok(!!plan.anneaux[0] && !!plan.anneaux[0].biome,
   `un sol nomme « ${plan.anneaux[0] && plan.anneaux[0].biome} »`);
ok(!!plan.mur, `une pierre nommee « ${plan.mur} »`);

console.log('\n-- et chaque nom a un fichier dans ce depot --');
const solF = fichierSolSelonLaPage(plan.anneaux[0].biome);
ok(!!solF,
   solF ? `la page fera « ${solF}.webp » du sol « ${plan.anneaux[0].biome} »`
        : 'la regle de nommage des sols est introuvable dans nexus.js — cet essai ne verifie RIEN');
ok(fs.existsSync(path.join(SITE, 'img/nexus/tiles', solF + '.webp')),
   `img/nexus/tiles/${solF}.webp existe — sans lui, drawImage leve et le jeu se fige`);

const murF = fichierMurSelonLaPage(plan.mur);
ok(!!murF, murF ? `la page fera « ${murF}.webp » de la pierre « ${plan.mur} »`
                : 'le choix de la planche de mur est introuvable dans nexus.js');
ok(fs.existsSync(path.join(SITE, 'img/nexus/tiles', murF + '.webp')),
   `img/nexus/tiles/${murF}.webp existe`);

/* Le chemin d'une facade, relu lui aussi dans la page. */
const cheminBati = /i\.src = 'img\/nexus\/tiles\/obj_' \+ encodeURIComponent\(nom\) \+ '\.webp';/.test(src);
ok(cheminBati, 'la page fabrique le chemin d\'une facade en « obj_<nom>.webp »');

const planches = [...new Set(facades.map((o) => o.bat))].sort();
ok(planches.length > 0, `${planches.length} planches distinctes : ${planches.join(', ')}`);
for (const p of planches) {
  const f = path.join(SITE, 'img/nexus/tiles', 'obj_' + p + '.webp');
  ok(fs.existsSync(f), `img/nexus/tiles/obj_${p}.webp existe`);
}

console.log('\n-- les bandes animees se divisent vraiment --');
let animees = 0;
for (const p of planches) {
  const pose = facades.find((o) => o.bat === p);
  const t = tailleWebp(path.join(SITE, 'img/nexus/tiles', 'obj_' + p + '.webp'));
  ok(!!t, `obj_${p}.webp est bien une planche WebP mesurable`);
  const cadres = pose.cadres || 1;
  if (cadres > 1) animees++;
  /* Une largeur qui ne divise pas fait baver un sliver de l'image voisine sur
     chaque bord. Le hall l'a paye avec une planche de 639 pour quatre images. */
  eq(t.w % cadres, 0,
     `obj_${p}.webp fait ${t.w} px pour ${cadres} image(s) — la division tombe juste`);
  /* Et la HAUTEUR que la page en deduira reste raisonnable : la facade est
     posee sur `larg` unites de monde, la hauteur suit le rapport de la case.
     Au-dela de quatre tuiles de haut, un batiment couvre tout ce qui est
     derriere lui et l'on ne voit plus la rue du fond. */
  const H = pose.larg * t.h / (t.w / cadres);
  ok(H > 0 && H < monde.DONJON_TUILE * 6,
     `« ${p} » : ${pose.larg} de large donne ${Math.round(H)} de haut, `
     + `soit ${(H / monde.DONJON_TUILE).toFixed(1)} tuiles`);
}
ok(animees > 0,
   `${animees} planche(s) animee(s) — sans quoi la division ci-dessus serait vraie par 1`);

console.log('\n-- et la page sait lire ce que le serveur ajoute --');
/* Trois champs que ce travail cree. Un champ ignore par la page laisserait la
   facade invisible ET le pate infranchissable : ca arrete, et ca ne montre
   rien. C'est le pire des resultats, et il ne planterait nulle part. */
for (const champ of ['o.bat', 'o.larg', 'o.cadres']) {
  ok(src.indexOf(champ) >= 0,
     `nexus.js lit « ${champ} » — le champ que le serveur pose sur les blocs`);
}
ok(/if \(o\.bat\) return dessineFacade\(o\);/.test(src),
   'et un bloc qui NOMME sa planche passe par le dessin des facades');

/* ================== LES PORTES : UNE CLE, DEUX DEPOTS ==================
 *
 * Le serveur derive une porte du batiment et la NOMME : « cette facade ouvre
 * sur `tour` ». La page recoit ce nom et va chercher la piece dans sa propre
 * table de salles. Les deux moities sont coherentes chacune de son cote —
 * l'essai du serveur relit la table des facades DANS le serveur, celui de la
 * page relit sa table de salles DANS la page — et elles peuvent parfaitement
 * parler de deux choses differentes. Le desaccord ne vit dans aucun des deux
 * depots : il vit ENTRE eux.
 *
 * Et il serait MUET. La page ignore poliment une salle qu'elle ne connait pas
 * — c'est voulu, les deux depots ne se deploient pas a la meme seconde. Une
 * cle renommee d'un seul cote ne planterait donc nulle part : on pousserait la
 * porte de la tour, et il ne se passerait rien.
 */
console.log('\n-- la cle des portes est la meme des deux cotes --');
const portes = plan.portes || [];
ok(portes.length > 0, `${portes.length} portes derivees par le serveur`);
const clesServeur = [...new Set(portes.map((p) => p.salle))].sort();
ok(clesServeur.length > 0, `elles nomment : ${clesServeur.join(', ')}`);

/* La table des salles, RELUE dans la page. La recopier ici aurait fait de cet
   essai une troisieme moitie coherente avec elle-meme. */
function sallesDeLaPage() {
  const l = /var SALLES = \{([^}]*)\};/.exec(src);
  if (!l) return null;
  return [...l[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
}
const clesPage = sallesDeLaPage();
ok(!!clesPage,
   clesPage ? `nexus.js declare ${clesPage.length} salles : ${clesPage.join(', ')}`
            : 'la table des salles est introuvable dans nexus.js — cet essai ne verifie RIEN');
for (const c of clesServeur) {
  ok(clesPage.indexOf(c) >= 0,
     `la salle « ${c} » que le serveur nomme existe dans la page`);
}
/* LE TEMOIN. Sans lui, « toutes les cles sont connues » serait vrai aussi
   d'une relecture qui rendrait toutes les cles imaginables. */
ok(clesPage.indexOf('tour_maison') < 0 && clesPage.indexOf('salle_qui_nexiste_pas') < 0,
   'et la relecture ne rend pas n\'importe quel nom — elle rend une liste finie');
/* ET LA SORTIE. Une salle dans laquelle on entre sans que rien ne sache l'en
   faire sortir est une salle ou l'on reste. Le fichier a une table pour ca ;
   on la relit, elle aussi. */
const bloc = /var SORTIES = \{([\s\S]*?)\};/.exec(src);
ok(!!bloc, 'nexus.js declare une table de sorties');
const clesSortie = bloc ? [...bloc[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]) : [];
for (const c of clesPage) {
  ok(clesSortie.indexOf(c) >= 0, `la salle « ${c} » a une sortie`);
}

/* ================== LES PLANCHES DES ETAGES ==================
 *
 * Meme regle que pour les facades, et la meme sanction : un nom sans fichier
 * derriere ne laisse pas un carre vide. `drawImage` leve sur une image
 * cassee, l'exception part a chaque image, et la boucle de dessin s'arrete —
 * tout le jeu se fige. Les cinq planches sont chargees A LA DEMANDE, ce qui
 * veut dire qu'un nom faux ne se verrait qu'au moment ou quelqu'un monte a
 * l'etage : la panne la plus tardive et la plus chere possible.
 */
console.log('\n-- les planches des cinq etages --');
const tableEtages = /var ETAGES = \[([\s\S]*?)\n  \];/.exec(src);
ok(!!tableEtages,
   tableEtages ? 'la table des etages est relue dans nexus.js'
               : 'la table des etages est introuvable — cet essai ne verifie RIEN');
const etages = tableEtages
  ? [...tableEtages[1].matchAll(/cle:\s*'([^']+)'[\s\S]*?src:\s*'([^']+)'/g)]
      .map((m) => ({ cle: m[1], src: m[2] }))
  : [];
ok(etages.length >= 2, `${etages.length} etages declares : ${etages.map((e) => e.cle).join(', ')}`);
for (const e of etages) {
  const f = path.join(SITE, e.src);
  ok(fs.existsSync(f), `« ${e.cle} » nomme ${e.src}, et le fichier est la`);
  const t = fs.existsSync(f) ? tailleWebp(f) : null;
  ok(!!t, `${e.src} est une planche WebP mesurable`);
  /* La salle est posee sur un CARRE de 1600 : `drawImage(img, 0, 0, w, h)`
     avec w = h. Une planche qui ne serait pas carree ne leverait aucune
     erreur — elle serait seulement etiree, et personne ne saurait dire
     pourquoi la piece a l'air de travers. Le cinema et l'arcade tiennent la
     meme regle, et c'est a eux qu'on la compare plutot qu'a un nombre ecrit
     ici. */
  if (t) eq(t.w, t.h, `${e.src} est carree (${t.w}x${t.h}) — la salle l'etale sur un carre`);
}
const cine = tailleWebp(path.join(SITE, 'img/nexus/tiles/room_cinema.webp'));
ok(!!cine && etages.every((e) => {
     const t = tailleWebp(path.join(SITE, e.src));
     return t && t.w === cine.w && t.h === cine.h;
   }),
   `et toutes a la taille des salles deja cablees (${cine && cine.w}x${cine && cine.h})`);
/* Aucune musique n'est nommee pour ces etages, et c'est une regle, pas un
   oubli : une planche sonore nommee sans fichier derriere fait lever la page a
   chaque image. On verifie donc que la table n'en nomme aucune. */
ok(!/room_tour_[^']*\.mp3/.test(src) && !/tour[^']*\.mp3/.test(src),
   'aucun morceau n\'est nomme pour la tour — un fichier absent figerait la page');

console.log(`\nville_accord.test.js : ${n} verifications OK`);
