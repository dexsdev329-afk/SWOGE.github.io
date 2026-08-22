'use strict';
/*
 * LA TAILLE D'UNE PLANCHE, LUE DANS LE FICHIER.
 *
 * ---- POURQUOI CE FICHIER EXISTE ----
 *
 * Plusieurs essais mesurent une planche pour en verifier le RAPPORT : une
 * image etiree ne leve aucune erreur, elle a seulement l'air moins bien, et
 * seul un chiffre lu dans le fichier peut le dire. Chacun s'etait donc ecrit
 * son petit lecteur de WebP — trois copies de la meme dizaine de lignes.
 *
 * Deux des trois se trompaient. Le WebP dit sa taille a trois endroits selon
 * la facon dont il a ete encode :
 *
 *   VP8  — avec perte, sans transparence : la taille est dans le flux VP8.
 *   VP8L — sans perte : quatorze bits de large, quatorze de haut, empaquetes.
 *   VP8X — forme etendue, celle qu'on obtient des qu'il y a une couche alpha
 *          separee : l'entete porte la taille de la TOILE.
 *
 * Dans le cas VP8X, la charge utile commence par un octet de drapeaux et
 * trois octets reserves ; la largeur ne vient qu'apres. Deux copies lisaient
 * les drapeaux a la place de la largeur. Elles n'ont jamais rien signale
 * parce qu'aucune planche du depot n'etait encore au format etendu — le jour
 * ou l'une l'a ete, la mesure a annonce 17 sur 163585 et un ecart de rapport
 * de 1 443 297 %.
 *
 * C'est la panne la plus couteuse qui soit : une regle qui a l'air tenue et
 * qui ne tient rien. Un lecteur, un seul, et les trois essais tombent
 * ensemble le jour ou il se trompe.
 */
const fs = require('fs');

/** La taille en pixels d'une planche WebP, ou null si le fichier n'en est
 *  pas une. On ne devine pas d'apres l'extension : on lit les blocs. */
function tailleWebp(fichier) {
  const d = fs.readFileSync(fichier);
  if (d.length < 16 || d.slice(0, 4).toString('latin1') !== 'RIFF'
      || d.slice(8, 12).toString('latin1') !== 'WEBP') return null;
  /* On lit le bloc qui suit l'entete RIFF, et non le premier « VP8 » trouve
     n'importe ou dans le fichier : ces trois lettres apparaissent aussi dans
     les donnees compressees, et une recherche libre peut tomber dessus. */
  const t = d.slice(12, 16).toString('latin1');
  if (t === 'VP8X') {
    /* charge utile : 1 octet de drapeaux, 3 reserves, puis largeur-1 et
       hauteur-1 sur trois octets chacune. */
    return { w: d.readUIntLE(24, 3) + 1, h: d.readUIntLE(27, 3) + 1 };
  }
  if (t === 'VP8L') {
    const v = d.readUInt32LE(21);
    return { w: (v & 0x3FFF) + 1, h: ((v >> 14) & 0x3FFF) + 1 };
  }
  if (t === 'VP8 ') {
    return { w: d.readUInt16LE(26) & 0x3FFF, h: d.readUInt16LE(28) & 0x3FFF };
  }
  return null;
}

module.exports = { tailleWebp };
