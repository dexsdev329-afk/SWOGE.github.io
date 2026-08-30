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
  /* Une route vers un jeton AJOUTE par le joueur : il faut le remettre dans
     la liste du bac a sable, sinon `morceauxDe` ne le reconnait pas et rend
     `null` — l'essai passerait en ne mesurant rien. */
  B.videPerso();
  if (r.perso) B.ajoutePerso(r.perso);
  const rendu = morceauxDe(r.de, r.vers, ethers.BigNumber.from(r.entree),
                                          ethers.BigNumber.from(r.mini));
  const nom = r.de + ' → ' + r.vers;
  if (!rendu) { ok(false, nom + ' : la page ne rend plus aucune transaction'); continue; }
  ok(rendu.length === r.morceaux.length,
     nom + ' : ' + r.morceaux.length + ' morceau(x), comme a l execution');
  let pareil = rendu.length === r.morceaux.length;
  for (let i = 0; i < r.morceaux.length && pareil; i++) pareil = rendu[i] === r.morceaux[i];
  ok(pareil, nom + ' : octet pour octet la transaction qui a rendu '
     + (+ethers.utils.formatEther(r.recu)).toLocaleString('fr-FR', { maximumFractionDigits: 6 })
     + (r.gaz ? ' pour ' + r.gaz + ' de gaz' : '')
     + (r.methode ? ' (' + r.methode + ')' : ''));
  /* Une route prouvee par simulation porte en plus la preuve NEGATIVE : un
     minimum place au-dessus du devis doit faire echouer l echange, sinon le
     champ ne protege de rien. */
  if (r.refuseAuDessus !== undefined)
    ok(r.refuseAuDessus === true,
       nom + ' : et un minimum place 1 % au-dessus du devis la fait ECHOUER —'
       + ' preuve que le champ est lu');
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
                          ['swogebet', 'swoge'], ['swoge', 'eth'], ['swogebet', 'eth']]) {
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

/* ==================== 3. LES SIX PAIRES SE FONT ====================
 *
 * ---- CE QUE CET ESSAI AFFIRMAIT, ET QUI ETAIT FAUX ----
 *
 * Il exigeait ici que `$SWOGEBET → ETH` ne rende RIEN, et le justifiait
 * ainsi : « verifie sur la chaine, ce jeton n a de piscine avec l ETH a
 * aucun palier de frais, ni en v2 ni en v3 ». La mesure etait juste. La
 * CONCLUSION ne l'etait pas : pas de paire directe ne veut pas dire pas de
 * route. Le portefeuille empruntait deja le detour par le $SWOGE dans
 * l'autre sens — ETH vers $SWOGEBET, deux sauts, une transaction — et
 * refusait le retour en expliquant au joueur une limite qui n'existait pas.
 *
 * Un portefeuille qui laisse entrer et pas sortir est un piege, meme
 * involontaire. Le proprietaire l'a vu en faisant l'echange dans un autre
 * portefeuille, capture a l'appui.
 *
 * L'essai garde donc l'inverse : les six paires rendent une transaction, et
 * seule la meme des deux cotes n'en rend pas. */
console.log('\n-- les six paires --');
B.pourQui('0x00000000000000000000000000000000000a11ce');
const PAIRES = [['eth', 'swoge'], ['eth', 'swogebet'], ['swoge', 'eth'],
                ['swoge', 'swogebet'], ['swogebet', 'swoge'], ['swogebet', 'eth']];
let toutes = 0;
for (const [de, vers] of PAIRES) if (morceauxDe(de, vers, mille, mini)) toutes++;
ok(toutes === PAIRES.length,
   'les six paires rendent une transaction (' + toutes + '/' + PAIRES.length + ') —'
   + ' aucun jeton n entre sans pouvoir ressortir');
ok((morceauxDe('swogebet', 'eth', mille, mini) || []).length === 3,
   '$SWOGEBET → ETH passe par trois morceaux : v3 vers le $SWOGE, v2 vers le WETH, puis on deballe');

/* ==================== 3 bis. LES JETONS AJOUTES PAR LE JOUEUR ====================
 *
 * Il y a plus de mille quatre cents jetons avec une piscine sur cette chaine.
 * Coller un contrat et pouvoir l'echanger, c'est la difference entre un
 * portefeuille et une vitrine.
 *
 * La branche v3 est PROUVEE plus haut, dans les deux sens, par simulation sur
 * la chaine reelle. La branche v2, elle, n'a aucun jeton recent ou la mesurer
 * — releve : plus aucune paire v2/WETH creee depuis des mois n'a de fonds.
 * Alors on la prouve autrement, et c'est meme plus fort qu'une simulation de
 * plus : on donne au chemin « jeton ajoute en v2 » l'adresse du $SWOGE, et on
 * exige les MEMES OCTETS que la route $SWOGE, qui a deja tourne sur un fork.
 * Si les deux coincident, la branche v2 produit exactement une transaction
 * dont on sait qu'elle s'execute. */
console.log('\n-- un jeton ajoute, route en v2 --');
B.videPerso();
const SWOGE_ADR = (/var SWOGE\s*=\s*'([^']+)'/.exec(src) || [])[1];
ok(!!SWOGE_ADR, 'l adresse du $SWOGE se lit dans la page');
const faux = B.ajoutePerso({ cle: 'xswoge', sym: 'SWOGE', nom: 'Swole Doge', adr: SWOGE_ADR,
                             dec: 18, perso: true, pool: { ver: 'v2', fee: null } });
B.pourQui('0x00000000000000000000000000000000000a11ce');
const refA = prouve.routes.filter((r) => r.de === 'eth' && r.vers === 'swoge')[0];
const refV = prouve.routes.filter((r) => r.de === 'swoge' && r.vers === 'eth')[0];
if (refA) {
  const a = morceauxDe('eth', faux, ethers.BigNumber.from(refA.entree), ethers.BigNumber.from(refA.mini));
  ok(a && a.length === refA.morceaux.length && a.every((x, k) => x === refA.morceaux[k]),
     'acheter un jeton ajoute en v2 rend EXACTEMENT les octets de la route ETH → $SWOGE,'
     + ' executee sur le fork');
}
if (refV) {
  const v = morceauxDe(faux, 'eth', ethers.BigNumber.from(refV.entree), ethers.BigNumber.from(refV.mini));
  ok(v && v.length === refV.morceaux.length && v.every((x, k) => x === refV.morceaux[k]),
     'et le revendre rend ceux de $SWOGE → ETH — deballage compris');
}
B.videPerso();
B.pourQui('0x00000000000000000000000000000000000a11ce');

/* Sans piscine, pas de route : mieux vaut ne rien rendre qu'une transaction
   qui echouera au moment de la signature. */
const sansPiscine = B.ajoutePerso({ cle: 'xrien', sym: 'RIEN', nom: 'sans piscine',
  adr: '0x00000000000000000000000000000000deadbeef', dec: 18, perso: true, pool: null });
ok(morceauxDe('eth', sansPiscine, mille, mini) === null,
   'un jeton ajoute SANS piscine ne rend aucune transaction');
ok(morceauxDe(sansPiscine, 'eth', mille, mini) === null, 'ni dans l autre sens');
/* Et jamais entre deux jetons ajoutes : le portefeuille ne route que par
   l ETH (RH), et pretendre le contraire enverrait une transaction perdue. */
const autre = B.ajoutePerso({ cle: 'xautre', sym: 'AUTRE', nom: 'autre',
  adr: '0x00000000000000000000000000000000cafebabe', dec: 18, perso: true,
  pool: { ver: 'v3', fee: 3000 } });
ok(morceauxDe(sansPiscine, autre, mille, mini) === null
   && morceauxDe(autre, 'swoge', mille, mini) === null,
   'et aucune route entre un jeton ajoute et autre chose que l ETH (RH)');
B.videPerso();
B.pourQui('0x00000000000000000000000000000000000a11ce');
for (const c of ['eth', 'swoge', 'swogebet'])
  ok(morceauxDe(c, c, mille, mini) === null, c + ' → ' + c + ' ne rend rien');

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
/* La plus longue n'est plus celle de deux sauts : `$SWOGEBET → ETH` en fait
   trois et consomme 308 556 unites, mesure sur la chaine reelle. Le chiffre
   ecrit ici etait 290 140 — celui de la route d'avant. */
ok(B.GAZ_ECHANGE >= 308556,
   'la reserve de gaz de l echange (' + B.GAZ_ECHANGE + ') couvre la route la plus longue,'
   + ' mesuree a 308 556 unites pour les trois morceaux de $SWOGEBET → ETH');
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
