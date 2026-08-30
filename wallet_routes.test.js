'use strict';
/*
 * UN ECHANGE ARME NE SE RELIT PAS : IL S'EXECUTE.
 *
 * ---- CE QUE CET ESSAI GARDE ----
 *
 * Les cinq routes du portefeuille ont ete EXECUTEES sur un fork de la
 * chaine 4663, contre le vrai routeur, les vraies paires et les vraies
 * piscines — pas seulement devisees. Ce qui a tourne la-bas n'est pas une
 * copie du code de la page : c'est `morceauxDe` extrait de
 * swoge_wallet.html et execute tel quel.
 *
 * `wallet_routes.prouve.json` est le journal de cette execution : pour
 * chaque route, les entrees exactes, les octets exacts de la transaction,
 * le gaz consomme et le montant recu. Cet essai-ci redonne ces memes
 * entrees a la page et exige les MEMES OCTETS. Il ne refait pas la preuve
 * — il empeche la page de s'en eloigner sans que personne ne le voie.
 *
 * Il ne demande ni reseau, ni fork, ni navigateur : seulement `ethers`.
 *
 * ---- CE QU'IL VERIFIE EN PLUS ----
 *
 * Que le minimum recu n'est jamais zero. Un `amountOutMinimum` a zero
 * signe « donne-moi n'importe quoi » : c'est la porte du sandwich, et
 * c'est la seule protection que le joueur ait entre sa signature et le
 * bloc. Le champ existe, il doit etre rempli.
 */
const fs = require('fs');
const path = require('path');

const RACINE = __dirname;
const PAGE = path.join(RACINE, 'swoge_wallet.html');
const PROUVE = path.join(RACINE, 'wallet_routes.prouve.json');

const { bac, trouveEthers } = require('./wallet_extrait.js');
const ethers = trouveEthers();
if (!ethers) { console.log('wallet_routes.test.js : ethers absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const src = fs.readFileSync(PAGE, 'utf8');
const B = bac(PAGE, ethers);
const morceauxDe = (de, vers, e, m) => B.morceauxDe(de, vers, e, m);

/* ==================== 1. LES OCTETS N ONT PAS BOUGE ==================== */
console.log('-- ce qui a reellement tourne sur le fork --');
const prouve = JSON.parse(fs.readFileSync(PROUVE, 'utf8'));
console.log('   journal du bloc ' + prouve.bloc + ', ' + prouve.routes.length + ' routes\n');

for (const r of prouve.routes) {
  B.pourQui(r.moi);
  const rendu = morceauxDe(r.de, r.vers, ethers.BigNumber.from(r.entree),
                                          ethers.BigNumber.from(r.mini));
  const nom = r.de + ' → ' + r.vers;
  if (!rendu) { ok(false, nom + ' : la page ne rend plus aucune transaction'); continue; }
  ok(rendu.length === r.morceaux.length,
     nom + ' : ' + r.morceaux.length + ' morceau(x), comme a l execution');
  let pareil = rendu.length === r.morceaux.length;
  for (let i = 0; i < r.morceaux.length && pareil; i++) pareil = rendu[i] === r.morceaux[i];
  ok(pareil, nom + ' : octet pour octet la transaction qui a rendu '
     + (+ethers.utils.formatEther(r.recu)).toLocaleString('fr-FR', { maximumFractionDigits: 4 })
     + ' pour ' + r.gaz + ' de gaz');
}

/* ==================== 2. LE MINIMUM N EST JAMAIS ZERO ==================== */
console.log('\n-- la protection contre le sandwich --');
ok(B.TOLERANCE > 0,
   'la tolerance de la page est ' + B.TOLERANCE + ' %, pas zero — a zero, `amountOutMinimum`'
   + ' vaudrait « accepte n importe quoi » et le champ ne protegerait de rien');

const mille = ethers.utils.parseEther('1000');
const mini = B.moinsTolerance(mille);
ok(mini.gt(0) && mini.lt(mille),
   'le minimum tombe strictement entre zero et le devis : ' + ethers.utils.formatEther(mini)
   + ' pour 1000');

/* Le minimum doit se retrouver DANS les octets — et sur le DERNIER
   morceau, celui qui decide de ce que le joueur touche. Le poser sur le
   premier saut ferait echouer l echange sur un mouvement interne. */
const marque = ethers.BigNumber.from('777777777777777777777');
const enHex = marque.toHexString().slice(2).padStart(64, '0');
for (const [de, vers] of [['eth', 'swoge'], ['eth', 'swogebet'], ['swoge', 'swogebet'],
                          ['swogebet', 'swoge'], ['swoge', 'eth']]) {
  B.pourQui('0x00000000000000000000000000000000000a11ce');
  const m = morceauxDe(de, vers, mille, marque);
  const dernier = m[m.length - 1];
  ok(dernier.indexOf(enHex) >= 0,
     de + ' → ' + vers + ' : le minimum est bien pose sur le dernier morceau');
  if (m.length > 1) {
    ok(m[0].indexOf(enHex) < 0,
       '   et PAS sur le premier saut, dont le produit ne quitte pas le routeur');
  }
}

/* ==================== 3. AUCUNE ROUTE INVENTEE ==================== */
console.log('\n-- les paires qui n existent pas --');
B.pourQui('0x00000000000000000000000000000000000a11ce');
ok(morceauxDe('swogebet', 'eth', mille, mini) === null,
   '$SWOGEBET → ETH ne rend rien : verifie sur la chaine, ce jeton n a de piscine avec l ETH'
   + ' a aucun palier de frais, ni en v2 ni en v3');
ok(morceauxDe('eth', 'eth', mille, mini) === null, 'ETH → ETH ne rend rien non plus');

/* ==================== 4. LE BOUTON N EST PLUS INERTE ==================== */
console.log('\n-- l echange est bien arme --');
ok(src.indexOf('not switched on yet') < 0,
   'le message de mise en veille a disparu : le bouton fait quelque chose');
ok(/routeur\.multicall\(echeance, morceaux/.test(src),
   'et il envoie un vrai `multicall`, avec l echeance et les morceaux prouves');
ok(/bloc\.timestamp \+ 900/.test(src),
   'l echeance se prend sur le bloc COURANT : a 0,101 s le bloc, une valeur gardee de'
   + ' quelques minutes est deja perimee et le routeur repond « Transaction too old »');
ok(/await assureChaine\(\)/.test(src) && (src.match(/await assureChaine\(\)/g) || []).length >= 2,
   'la chaine est verifiee avant CHAQUE signature — envoi comme echange :'
   + ' signer ailleurs enverrait l ETH a une adresse sans contrat');
ok(/assureAutorisation/.test(src) && /c\.approve\(ROUTER02, entree\)/.test(src),
   'les routes qui partent d un jeton demandent une autorisation du MONTANT EXACT,'
   + ' pas une autorisation illimitee qui survivrait a l echange');
ok(/simuleRoute\(de, vers, entree\), 12000, 'quote'\)/.test(src),
   'un devis frais est repris a l instant de l envoi : celui de l ecran peut avoir'
   + ' des minutes, et le prix bouge a chaque bloc');

/* ==================== 5. LE MAX GARDE DE QUOI PAYER ==================== */
console.log('\n-- ce que « MAX » garde en arriere --');
ok(B.GAZ_ECHANGE >= 290140,
   'la reserve de gaz de l echange (' + B.GAZ_ECHANGE + ') couvre la route la plus longue,'
   + ' mesuree a 290 140 unites sur le fork');
ok(B.GAZ_ENVOI >= 21000,
   'celle de l envoi (' + B.GAZ_ENVOI + ') couvre les 21 000 d un virement d ETH');
ok(/if\(!j\.natif\) return \{ montant:s \};/.test(src),
   'sur un jeton, MAX prend TOUT le solde : rien ne retient un jeton');
ok(/return \{ erreur:'Could not read the gas price/.test(src),
   'et si le prix du gaz ne se lit pas, MAX ne remplit rien et le DIT — deviner une'
   + ' reserve ici, c est vider un solde');
ok(/Your balance has not been read yet/.test(src),
   'un solde non lu fait dire « inconnu », jamais « zero »');

console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
process.exit(rates ? 1 : 0);
