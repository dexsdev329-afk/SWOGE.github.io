'use strict';
/*
 * VERIFIER UN DEPLOIEMENT DE SwogeFunV3, AVANT DE S'EN SERVIR.
 *
 * Pourquoi ce fichier existe : un premier deploiement a recu la MEME adresse
 * dans `_positionManager` et `_swoge`. Le contrat compilait, se deployait, et
 * repondait a toutes les lectures — il avait l'air parfaitement sain. Mais son
 * jeton de paiement etait le gestionnaire de positions NFT, donc `createToken`
 * revertait a tous les coups, pour toujours, sans aucun setter pour reparer.
 *
 * Rien dans Remix ne signale ca. Une adresse mal collee est un contrat mort
 * qui se comporte comme un contrat vivant jusqu'au premier lancement.
 *
 *   node contrats/verifier_deploiement.js 0xTonAdresse
 */
const { ethers } = require('ethers');

const RPC = 'https://rpc.mainnet.chain.robinhood.com';
const ATTENDU = {
  positionManager: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
  swoge:           '0x8a166Fb41Cd659a0a43396272FF73973Ce29F817',
  swogeTreasury:   '0x6229DDF7c8Ed3A194819aF2e68f5de2Dc31e7F30',
  creationFee:     '10000000000000000000000',              // 10 000 $SWOGE
};
const TAILLE_OPTIMISEE = 13475;   // octets, optimiseur actif, 200 runs

const ABI = [
  'function positionManager() view returns (address)',
  'function swoge() view returns (address)',
  'function swogeTreasury() view returns (address)',
  'function creationFee() view returns (uint256)',
  'function tokenCount() view returns (uint256)',
  'function HOLDER_SHARE_BPS() view returns (uint16)',
  'function TREASURY_SHARE_BPS() view returns (uint16)',
  'function TOTAL_SUPPLY() view returns (uint256)',
  'function createToken((string,string,bytes32,string,string,string,string)) returns (address)',
];

let echecs = 0;
const ok  = (c, m) => { console.log((c ? '  ok    ' : '  RATE  ') + m); if (!c) echecs++; };

(async () => {
  const adr = process.argv[2];
  if (!adr) { console.log('usage : node verifier_deploiement.js 0xAdresse'); process.exit(1); }
  let A; try { A = ethers.utils.getAddress(adr); }
  catch (e) { console.log('  RATE  adresse invalide'); process.exit(1); }

  const p = new ethers.providers.StaticJsonRpcProvider(RPC, 4663);
  console.log('\n=== VERIFICATION DE ' + A + ' ===\n');

  const code = await p.getCode(A);
  ok(code !== '0x', 'du code existe a cette adresse');
  if (code === '0x') { console.log('\nRien de deployé ici.'); process.exit(1); }
  const taille = (code.length - 2) / 2;

  const c = new ethers.Contract(A, ABI, p);
  const lu = {};
  for (const n of ['positionManager', 'swoge', 'swogeTreasury', 'creationFee']) {
    try { lu[n] = (await c[n]()).toString(); } catch (e) { lu[n] = null; }
  }

  console.log('-- les quatre valeurs immuables --');
  for (const n of ['positionManager', 'swoge', 'swogeTreasury']) {
    const bon = lu[n] && lu[n].toLowerCase() === ATTENDU[n].toLowerCase();
    ok(bon, n.padEnd(16) + (lu[n] || 'illisible') + (bon ? '' : '   <- ATTENDU ' + ATTENDU[n]));
  }
  ok(lu.creationFee === ATTENDU.creationFee,
     'creationFee     ' + (lu.creationFee || 'illisible')
     + (lu.creationFee ? '  (' + ethers.utils.formatEther(lu.creationFee) + ' SWOGE)' : ''));

  /* LE PIEGE QUI A COUTE UN DEPLOIEMENT : deux champs, la meme adresse. */
  console.log('\n-- le piege des deux champs identiques --');
  ok(lu.positionManager && lu.swoge && lu.positionManager.toLowerCase() !== lu.swoge.toLowerCase(),
     'positionManager et swoge sont DIFFERENTS');

  console.log('\n-- le jeton de paiement est-il vraiment un ERC20 ? --');
  let sym = null;
  try {
    sym = await (new ethers.Contract(lu.swoge, ['function symbol() view returns (string)'], p)).symbol();
  } catch (e) {}
  ok(sym === 'SWOGE', 'symbole du jeton de paiement : ' + (sym || 'illisible'));

  console.log('\n-- l optimiseur etait-il actif ? --');
  ok(Math.abs(taille - TAILLE_OPTIMISEE) < 400,
     'taille du bytecode : ' + taille + ' octets (attendu ~' + TAILLE_OPTIMISEE + ')'
     + (taille > TAILLE_OPTIMISEE + 400 ? '   <- OPTIMISEUR DESACTIVE' : ''));

  /* LA PREUVE : un lancement passerait-il ? On le simule sans rien depenser.
     Un revert « swoge » ou « allowance » est NORMAL ici (le compte simule ne
     detient pas de $SWOGE) ; ce qu'on cherche, c'est l'echec qui trahit un
     mauvais cablage. */
  console.log('\n-- un lancement passerait-il ? (simulation) --');
  let motif = '';
  try {
    await c.callStatic.createToken(['Essai', 'ESS', ethers.utils.hexZeroPad('0x01', 32), '', '', '', ''],
      { from: ATTENDU.swogeTreasury });
    motif = '(passe)';
  } catch (e) { motif = String(e.reason || (e.error && e.error.message) || e.code || e.message).slice(0, 90); }
  const cablageCasse = /ERC721|nonexistent token|operator query/i.test(motif);
  ok(!cablageCasse, 'pas d erreur de cablage : ' + motif
     + (cablageCasse ? '   <- LE JETON DE PAIEMENT N EST PAS UN ERC20' : ''));

  console.log('\n-- etat --');
  try { console.log('  tokenCount : ' + (await c.tokenCount()).toString()); } catch (e) {}

  console.log('\n' + (echecs === 0
    ? 'AUCUN ECART. Ce deploiement peut etre branche dans launchpad.html.'
    : echecs + ' ECART(S). NE PAS BRANCHER CE CONTRAT — il faut redeployer.'));
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error('erreur :', e.message || e); process.exit(1); });
