'use strict';
/*
 * LE CATALOGUE DES ELEMENTS, DERIVE DES FICHIERS.
 *
 * ---- POURQUOI IL EST GENERE, ET NON ECRIT ----
 *
 * L'editeur de cartes doit proposer tout ce que le jeu sait dessiner : cent
 * quatorze elements aujourd'hui, et un de plus a chaque planche livree. Une
 * liste ecrite a la main aurait diverge des le premier ajout — c'est arrive
 * quatre fois dans ce depot avec des listes bien plus courtes, et la panne est
 * toujours la meme : le fichier est la, personne ne le propose, et rien ne le
 * dit.
 *
 * On lit donc le DOSSIER. Le nom du fichier porte la famille et la cle :
 *   ground_<cle>.webp      -> sol
 *   mur_<cle>.webp         -> mur
 *   obj_<cle>.webp         -> objet
 *   room_<cle>.webp        -> salle
 *   monstres/<cle>.webp    -> monstre
 *
 * ---- ET LES IMAGES D'ANIMATION VIENNENT DE LA SOURCE ----
 *
 * Le nombre d'images d'une bande ne se lit PAS dans le fichier : une planche
 * de 640 sur 256 peut etre une image unique large ou quatre carrees, et la
 * deviner d'une largeur ronde serait un pari. La page le declare deja, par
 * `cadres:`, la ou elle pose l'element. On relit donc ces declarations plutot
 * que d'en tenir une seconde liste — s'il n'y en a pas, l'element vaut une
 * image, ce qui est le cas de la plupart.
 */
const fs = require('fs');
const path = require('path');
const { tailleWebp } = require('./taille_image.js');

/* La tuile du jeu, en unites de monde. C'est la meme que celle du Nexus, et
   c'est ce qui donne un sens a la largeur en pixels d'une parcelle. */
const TUILE = 128;

const FAMILLES = [
  { famille: 'sol',     dossier: 'img/nexus/tiles',    prefixe: 'ground_' },
  { famille: 'mur',     dossier: 'img/nexus/tiles',    prefixe: 'mur_' },
  { famille: 'objet',   dossier: 'img/nexus/tiles',    prefixe: 'obj_' },
  { famille: 'salle',   dossier: 'img/nexus/tiles',    prefixe: 'room_' },
  { famille: 'monstre', dossier: 'img/nexus/monstres', prefixe: '' },
  /* ---- LES PARCELLES ISOMETRIQUES ----
   * Elles ne portent PAS de prefixe a retirer : le fichier s'appelle deja
   * `iso_vault.webp` et la cle vaut `iso_vault`. C'est voulu. Une carte ne
   * garde que la CLE d'un element, jamais sa famille — `elementDe` essaie les
   * familles l'une apres l'autre — donc deux familles qui contiendraient
   * chacune un `arcade` se voleraient le dessin, et c'est la premiere de la
   * liste qui gagnerait, en silence. Le prefixe dans la cle rend la collision
   * impossible par construction plutot que par vigilance ; un essai verifie
   * l'unicite pour les familles qui, elles, decoupent leur prefixe. */
  { famille: 'iso',     dossier: 'img/nexus/iso',      prefixe: '' },
];

/** Les `cadres:` declares dans la page, par nom de planche. */
function cadresDeclares(racine) {
  const src = fs.readFileSync(path.join(racine, 'nexus.js'), 'utf8');
  const out = {};
  /* On cherche un nom de planche puis, dans les deux cents caracteres qui
     suivent, un `cadres:`. Deux cents parce qu'une entree de LIEUX tient en
     trois lignes ; au-dela on attraperait le `cadres` du voisin. */
  for (const m of src.matchAll(/([a-z0-9_]+)\.webp'[\s\S]{0,200}?cadres: (\d+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  /* ---- ET CELLES QUE DECLARE LE SERVEUR ----
   * Les facades de la ville portent leur nombre d'images dans `VILLE.FACADES`,
   * cote SERVEUR, pas dans la page : c'est lui qui compose la ville, la page
   * ne fait que dessiner ce qu'il nomme. Le manege et le mur de son en ont
   * quatre ; sans cette relecture, le catalogue les donnerait pour une image
   * unique et l'editeur dessinerait la bande entiere aplatie dans une case.
   * Meme convention que l'essai d'accord entre les deux depots : une variable
   * d'environnement, un chemin par defaut, et l'on se tait si l'autre depot
   * n'est pas la — auquel cas c'est l'essai qui le dira. */
  const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
  const fMonde = path.join(SERVEUR, 'monde.js');
  if (fs.existsSync(fMonde)) {
    const sm = fs.readFileSync(fMonde, 'utf8');
    for (const m of sm.matchAll(/planche: '([a-z0-9_]+)'[^}]*cadres: (\d+)/g)) {
      out['obj_' + m[1]] = Number(m[2]);
    }
  }
  return out;
}

function construis(racine) {
  const cadres = cadresDeclares(racine);
  const out = {};
  for (const F of FAMILLES) {
    const d = path.join(racine, F.dossier);
    if (!fs.existsSync(d)) continue;
    out[F.famille] = fs.readdirSync(d)
      .filter((f) => f.endsWith('.webp') && (!F.prefixe || f.startsWith(F.prefixe)))
      .filter((f) => F.prefixe || !/^(ground_|mur_|obj_|room_)/.test(f))
      .sort()
      .map((f) => {
        const cle = f.slice(F.prefixe.length, -5);
        const t = tailleWebp(path.join(d, f));
        const n = cadres[f.slice(0, -5)] || 1;
        const e = { cle, fichier: F.dossier + '/' + f, l: t.w, h: t.h, cadres: n };
        /* ---- L'EMPRISE, EN CASES, DEDUITE DE LA PLANCHE ----
         * Une parcelle isometrique n'est pas un objet pose dans une case :
         * c'est un morceau de terrain, dessine a l'echelle du jeu. Sa largeur
         * en pixels EST donc sa largeur en unites de monde, et une tuile en
         * vaut cent vingt-huit. Six cents pixels font cinq cases, et le calcul
         * le dit — le jour ou une planche arrive plus large, elle prend la
         * place qu'elle occupe vraiment sans qu'on la mesure a la main.
         * Deux au minimum : une parcelle dans une seule case serait une
         * vignette, pas un batiment. */
        if (F.famille === 'iso') e.cases = Math.max(2, Math.round(t.w / TUILE));
        return e;
      });
  }
  return out;
}

/* ---- ET DE QUOI LE REGENERER SANS SE SOUVENIR DE RIEN ----
 * `node outils_catalogue.js` reecrit le fichier. L'essai dit quand il est
 * perime ; encore faut-il que la reparation tienne en une ligne, sinon elle
 * se fait a la main et se fait mal. Meme mise en forme qu'avant, pour que le
 * diff ne montre que ce qui a vraiment change. */
if (require.main === module) {
  const racine = process.argv[2] || __dirname;
  const f = path.join(racine, 'catalogue.json');
  fs.writeFileSync(f, JSON.stringify(construis(racine), null, 1) + '\n');
  const c = construis(racine);
  const t = Object.values(c).reduce((s, l) => s + l.length, 0);
  console.log(`${f} : ${t} elements, ${Object.keys(c).length} familles`);
}

module.exports = { construis, FAMILLES };
