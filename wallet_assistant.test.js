'use strict';
/* L'assistant du portefeuille : il COMPREND, il ne signe jamais. Cet essai
 * couvre le parseur pur (wallet_assistant.js) — verbes, montants, jetons,
 * adresses, deux langues — et surtout ses GARDES de securite : une adresse ne
 * vient que de la phrase, deux adresses font refuser, pas d'adresse fait
 * refuser, et rien ne porte de drapeau « executer ».
 *
 * Intention (a tenir si l'essai contredit un changement voulu) : l'assistant
 * ne doit JAMAIS produire un envoi vers une adresse que le joueur n'a pas
 * ecrite lui-meme, ni deviner entre plusieurs, ni executer quoi que ce soit.
 */
const A = require('./wallet_assistant');

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

/* La liste reelle des jetons de la page, reduite a ce que le parseur lit. */
const JETONS = [
  { cle: 'eth', sym: 'ETH', nom: 'Ether on Robinhood Chain', natif: true, chaine: null },
  { cle: 'ethL1', sym: 'ETH', nom: 'Ether on Ethereum', natif: true, chaine: 1 },
  { cle: 'swoge', sym: 'SWOGE', nom: 'Swole Doge', chaine: null },
  { cle: 'swogebet', sym: 'SWOGEBET', nom: 'Swogebet', chaine: null },
  { cle: 'sol', sym: 'SOL', nom: 'Solana', natif: true, solNatif: true, chaine: 792703809 }
];
const CHAINES = [
  { id: 1, nom: 'Ethereum', alias: ['eth', 'l1', 'mainnet'] },
  { id: 8453, nom: 'Base', alias: ['base'] },
  { id: 360, nom: 'Robinhood Chain', alias: ['robinhood', 'rh'] }
];
const EVM = '0x1111111111111111111111111111111111111111';
const EVM2 = '0x2222222222222222222222222222222222222222';
const SVM = '7G9LhhhNvhVLxCTdEqZCf7mj8iXweLgQnmJjghskWMZG';

console.log('-- 1. envois (le coeur sensible) --');
let r = A.comprend('envoie 0.1 ETH a ' + EVM, JETONS, CHAINES);
ok(r.action === 'send' && r.jetonCle === 'eth' && r.dest === EVM && r.destType === 'evm'
   && r.montant.type === 'token' && r.montant.valeur === 0.1, 'envoie 0.1 ETH a 0x… : envoi lu, montant en jetons, adresse exacte');
ok(!('executer' in r) && !('execute' in r) && !('signer' in r), 'aucun drapeau d execution dans le resultat');
ok(/review and sign it yourself/i.test(r.resume), 'le resume dit que le joueur relit et signe lui-meme');

r = A.comprend('send 0,25 swoge to ' + EVM, JETONS, CHAINES);
ok(r.action === 'send' && r.jetonCle === 'swoge' && r.montant.valeur === 0.25, 'anglais + virgule decimale : 0,25 SWOGE lu');

r = A.comprend('envoie 5 dollars de swoge a ' + EVM, JETONS, CHAINES);
ok(r.action === 'send' && r.montant.type === 'usd' && r.montant.valeur === 5, 'un montant en dollars est marque usd, pas jetons');

console.log('\n-- 2. GARDES de securite sur l adresse --');
r = A.comprend('envoie 0.1 eth', JETONS, CHAINES);
ok(r.action === 'inconnu' && /destination address/i.test(r.pourquoi), 'pas d adresse : REFUS, aucune adresse par defaut');

r = A.comprend('envoie 0.1 eth a ' + EVM + ' ou a ' + EVM2, JETONS, CHAINES);
ok(r.action === 'inconnu' && /more than one address/i.test(r.pourquoi), 'deux adresses : REFUS de deviner laquelle');

/* Le cas le plus important : une adresse citee dans un message RECU ne doit
   pas devenir une cible. Le parseur ne lit QUE la phrase qu'on lui passe ;
   la page ne lui passe jamais le contenu d un message recu. On verifie qu il
   n invente pas d adresse quand la phrase n en contient pas. */
r = A.comprend('envoie tout mon eth au wallet dont on a parle', JETONS, CHAINES);
ok(r.action === 'inconnu' && !r.dest, 'envoyer « au wallet dont on a parle » (aucune adresse ecrite) : REFUS, pas de cible inventee');

r = A.comprend('envoie max swoge a ' + EVM, JETONS, CHAINES);
ok(r.action === 'send' && r.montant.type === 'max' && r.dest === EVM, '« max » est lu comme tout le solde, l adresse reste exacte');

console.log('\n-- 3. adresse Solana --');
r = A.comprend('envoie 2 sol a ' + SVM, JETONS, CHAINES);
ok(r.action === 'send' && r.jetonCle === 'sol' && r.dest === SVM && r.destType === 'svm', 'un mint/adresse Solana est reconnu, destType svm');

console.log('\n-- 4. achat → swap vers le jeton --');
r = A.comprend('achete pour 50$ de swoge', JETONS, CHAINES);
ok(r.action === 'swap' && r.versCle === 'swoge' && r.deCle === 'eth' && r.depuisAchat === true
   && r.montant.type === 'usd' && r.montant.valeur === 50, 'acheter $50 de SWOGE → swap ETH→SWOGE, 50 $, marque depuisAchat');
r = A.comprend('buy more swogebet', JETONS, CHAINES);
ok(r.action === 'swap' && r.versCle === 'swogebet', 'buy more swogebet → swap vers SWOGEBET (le symbole long n est pas lu « swoge »)');

console.log('\n-- 5. swap explicite --');
r = A.comprend('swap 0.1 eth for swoge', JETONS, CHAINES);
ok(r.action === 'swap' && r.deCle === 'eth' && r.versCle === 'swoge' && r.montant.valeur === 0.1, 'swap 0.1 ETH for SWOGE : sens correct (paye ETH, recoit SWOGE)');
r = A.comprend('echange swoge contre eth', JETONS, CHAINES);
ok(r.action === 'swap' && r.deCle === 'swoge' && r.versCle === 'eth', 'echange SWOGE contre ETH : le separateur « contre » donne le sens');

console.log('\n-- 6. pont --');
r = A.comprend('bridge 0.2 eth from base to robinhood', JETONS, CHAINES);
ok(r.action === 'bridge' && r.deChaine === 8453 && r.versChaine === 360 && r.montant.valeur === 0.2, 'bridge de Base vers Robinhood : chaines lues');
r = A.comprend('fais un pont de 0,2 eth vers ethereum', JETONS, CHAINES);
ok(r.action === 'bridge' && r.versChaine === 1, 'pont … vers Ethereum : chaine de destination lue (fr)');

console.log('\n-- 7. verbe avant tout, et bridge/swap avant send --');
ok(A.comprend('', JETONS, CHAINES).action === 'inconnu', 'phrase vide : inconnu, pas de plantage');
r = A.comprend('bridge my eth to base', JETONS, CHAINES);
ok(r.action === 'bridge', '« bridge … to base » est un pont, pas un envoi, meme avec « to »');

console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
process.exit(rates ? 1 : 0);
