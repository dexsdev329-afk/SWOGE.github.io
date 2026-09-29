'use strict';
/*
 * COMPILE SwogeFunV4.sol EN UN ARTEFACT POUR LE SERVEUR (29/09/2026)
 *
 * Railway n'a pas de compilateur : le serveur deploie le BYTECODE fige ici,
 * compile avec exactement les reglages de production (solc 0.8.34, optimiseur,
 * 200 runs). L'artefact porte aussi l'entree « standard JSON » complete : c'est
 * ce qu'il faut a Blockscout pour verifier la source, et ce qui permet a
 * n'importe qui de recompiler et de comparer.
 *
 *   S=<dossier avec solc> node contrats/compile_v4.js <sortie.json>          le V4, paire $SWOGE
 *   S=<dossier avec solc> node contrats/compile_v4.js <sortie.json> weth     le jumeau, paire WETH
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const solc = require(path.join(process.env.S, 'node_modules', 'solc'));

const WETH = process.argv[3] === 'weth';
const FICHIER = WETH ? 'SwogeFunV4Weth.sol' : 'SwogeFunV4.sol', CONTRAT = WETH ? 'SwogeFunV4Weth' : 'SwogeFunV4';
const source = fs.readFileSync(path.join(__dirname, FICHIER), 'utf8');
const entree = {
  language: 'Solidity',
  sources: { [FICHIER]: { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } },
};
const out = JSON.parse(solc.compile(JSON.stringify(entree)));
const erreurs = (out.errors || []).filter((e) => e.severity === 'error' || e.severity === 'warning');
if (erreurs.length) { console.error(erreurs.map((e) => e.formattedMessage).join('\n')); process.exit(1); }
const c = out.contracts[FICHIER];
const artefact = {
  contrat: CONTRAT, fichier: FICHIER, compilateur: solc.version(), reglages: entree.settings,
  sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  launchpad: { abi: c[CONTRAT].abi, bytecode: '0x' + c[CONTRAT].evm.bytecode.object },
  jeton: { abi: c.SwogeTokenV4.abi, deployedBytecode: '0x' + c.SwogeTokenV4.evm.deployedBytecode.object },
  /* Les parametres decides pour le V3, repris tels quels (SwogeFunV3-LISEZ-MOI.md,
     « A poser au deploiement ») : sommes EIP-55 verifiees, tresor = portefeuille. */
  /* Le jumeau WETH (29/09) : plus de $SWOGE dans le contrat ; le frais est en ETH, 0,0001 ETH
     (parite : 10 000 $SWOGE = 0,000098 ETH dans la paire v2 ce jour-la), paye au tresor. */
  constructeur: WETH ? {
    positionManager: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
    weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',                          /* WETH9 relu le 29/09 : symbol WETH, deposit() */
    treasury: '0x6229DDF7c8Ed3A194819aF2e68f5de2Dc31e7F30',
    creationFeeWei: '100000000000000',
    fraisEnEth: true,
  } : {
    positionManager: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
    swoge: '0x8a166Fb41Cd659a0a43396272FF73973Ce29F817',
    treasury: '0x6229DDF7c8Ed3A194819aF2e68f5de2Dc31e7F30',
    creationFeeWei: '10000000000000000000000',
  },
  standardJsonInput: entree,
};
const sortie = process.argv[2];
if (!sortie) { console.error('usage : node compile_v4.js <sortie.json>'); process.exit(1); }
fs.writeFileSync(sortie, JSON.stringify(artefact, null, 1) + '\n');
console.log('artefact ecrit :', sortie, '—', artefact.compilateur, '— source', artefact.sourceSha256.slice(0, 16));
