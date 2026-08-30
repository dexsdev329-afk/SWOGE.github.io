'use strict';
/*
 * LE QR DU RECEIVE DOIT ETRE VRAI.
 *
 * Un QR faux ne se plaint pas : il ne se lit pas, ou — bien pire — il se
 * lit et rend autre chose. Rien a l'ecran ne distingue les deux d'un bon.
 * Le seul essai qui vaille compare donc la matrice produite par LA PAGE,
 * module par module, a celle d'une bibliotheque de reference.
 *
 * Les empreintes de `wallet_qr.prouve.json` viennent de `segno` 1.6.6, qui
 * cite ISO/IEC 18004:2015, sur 200 adresses. Les memes 200 ont ete rendues
 * en image et RELUES par le decodeur d'OpenCV, qui a rendu l'adresse
 * exacte a chaque fois — c'est ecrit dans le fichier.
 *
 * Deux points ou les references divergent, et ou c'est la norme qui a ete
 * suivie : le remplissage (7.4.10, aucun bit ajoute si le flux est deja
 * sur une frontiere d'octet — `segno` en ajoute huit), et le choix du
 * masque (7.8, evalue SANS le format). Le premier est neutralise dans le
 * fichier de reference ; le second, non : les 200 matrices comparees ici
 * portent bien le masque que la norme designe.
 */
const fs = require('fs');
const crypto = require('crypto');
const { qr } = require('./wallet_extrait.js');

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const Q = qr(__dirname + '/swoge_wallet.html');
const REF = JSON.parse(fs.readFileSync(__dirname + '/wallet_qr.prouve.json', 'utf8'));

console.log('\n-- un vrai QR, pas un carre de pixels --');

ok(Q.TAILLE === 33, 'le symbole fait 33 modules de cote — version 4 (33)');
ok(Q.CAPACITE >= 42, 'et il a la place d une adresse : ' + Q.CAPACITE + ' octets pour 42');

/* ---- LA COMPARAISON QUI COMPTE ---- */
const attendu = REF.exemple.matrice;
const obtenu = Q.lignes(REF.exemple.adresse);
ok(obtenu && obtenu.length === 33 && obtenu.every((r) => r.length === 33),
   'la matrice est bien 33 x 33');
let ecarts = 0;
for (let y = 0; y < 33; y++) for (let x = 0; x < 33; x++)
  if (obtenu[y][x] !== attendu[y][x]) ecarts++;
ok(ecarts === 0, 'et elle est IDENTIQUE a celle de la reference, module par module ('
   + ecarts + ' ecart' + (ecarts > 1 ? 's' : '') + ')');

let bons = 0, mauvaises = [];
for (const e of REF.empreintes) {
  const h = crypto.createHash('sha256').update(Q.lignes(e.adresse).join('|')).digest('hex');
  if (h === e.sha256) bons++; else mauvaises.push(e.adresse);
}
ok(bons === REF.empreintes.length,
   'sur ' + REF.empreintes.length + ' adresses tirees au hasard, ' + bons
   + ' matrices identiques a la reference'
   + (mauvaises.length ? ' — ecart sur ' + mauvaises[0] : ''));

/* ---- LES MOTIFS FIXES ----
   Sans eux, aucun lecteur ne TROUVE le symbole : il ne le lit pas mal, il
   ne le voit pas. */
const m = Q.matrice(REF.exemple.adresse);
const oeilJuste = (oy, ox) => {
  for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
    const d = Math.max(Math.abs(dy - 3), Math.abs(dx - 3));
    if (m[oy + dy][ox + dx] !== (d === 2 ? 0 : 1)) return false;
  }
  return true;
};
ok(oeilJuste(0, 0) && oeilJuste(0, 26) && oeilJuste(26, 0), 'les trois yeux sont a leur place et bien formes');
let sep = true;
for (let i = 0; i < 8; i++) { if (m[7][i] || m[i][7]) sep = false; }
ok(sep, 'et le separateur clair autour du premier, sans quoi l oeil se confond avec les donnees');
let sync = true;
for (let i = 8; i < 25; i++) { if (m[6][i] !== (i % 2 === 0 ? 1 : 0) || m[i][6] !== (i % 2 === 0 ? 1 : 0)) sync = false; }
ok(sync, 'les deux lignes de synchronisation alternent sur toute leur longueur');
let ali = true;
for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
  if (m[26 + dy][26 + dx] !== (Math.max(Math.abs(dy), Math.abs(dx)) === 1 ? 0 : 1)) ali = false;
ok(ali, 'le motif d alignement est en bas a droite — c est lui qui redresse un symbole photographie de biais');
ok(m[25][8] === 1, 'et le module toujours sombre est pose : l oublier decalait tout le flux d un bit');

/* ---- CE QUI NE DOIT PAS PASSER ----
   Mieux vaut rien qu un symbole tronque : un QR trop court se lit, et rend
   une adresse amputee. */
ok(Q.matrice('x'.repeat(Q.CAPACITE)) !== null, 'un contenu de ' + Q.CAPACITE + ' octets passe');
ok(Q.matrice('x'.repeat(Q.CAPACITE + 1)) === null,
   'un octet de plus est REFUSE plutot que tronque — un QR tronque se lit et rend une adresse amputee');

/* ---- DEUX ADRESSES, DEUX SYMBOLES ---- */
const a = Q.lignes('0x00000000000000000000000000000000000a11ce').join('');
const b = Q.lignes('0x00000000000000000000000000000000000b0b0b').join('');
ok(a !== b, 'deux adresses donnent deux symboles differents');

/* ---- LA CASSE ----
   Une adresse en majuscules est la MEME adresse, mais pas le meme texte :
   le symbole doit porter ce qui est affiche, sans le retoucher. */
const bas = Q.lignes('0x8a166fb41cd659a0a43396272ff73973ce29f817').join('');
const haut = Q.lignes('0x8A166FB41CD659A0A43396272FF73973CE29F817').join('');
ok(bas !== haut, 'la casse est encodee telle quelle — le symbole ne reecrit pas l adresse qu on lui donne');

console.log(rates ? '\n' + rates + ' verification(s) en echec sur ' + n : '\ntout passe : ' + n + ' verifications');
process.exit(rates ? 1 : 0);
