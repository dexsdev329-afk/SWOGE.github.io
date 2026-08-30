'use strict';
/*
 * UNISWAP v4, CONTRE LA VRAIE CHAINE.
 *
 * ---- POURQUOI CET ESSAI EXISTE ----
 *
 * Un joueur a colle le contrat du COPPERCAT dans la recherche du portefeuille
 * et a lu : « No Uniswap pool against ETH (RH), in v2 or v3, at any fee
 * tier. » La phrase etait VRAIE et elle etait trompeuse. Le jeton s'echange
 * tres bien — plus d'un million de dollars de volume sur la journee — mais en
 * v4, contre l'ETH NATIF, avec un hook. Le portefeuille ne connaissait que
 * les fabriques v2 et v3 : il ne pouvait rien voir.
 *
 * ---- CE QUI SE MESURE ICI, ET RIEN D'AUTRE ----
 *
 * Pas « la page affiche-t-elle un chiffre ». Une piscine v4 se decrit par
 * CINQ champs — les deux jetons, les frais, le pas de tick, le hook — et la
 * moindre erreur d'encodage donne soit un refus, soit pire : un echange dans
 * une autre piscine que celle qu'on a devisee. On verifie donc :
 *
 *   1. que l'identifiant de la piscine se RECALCULE, au bit pres, depuis la
 *      clef que la page a lue — c'est la seule preuve que les cinq champs
 *      sont dans le bon ordre et du bon type ;
 *   2. que le devis choisit la piscine qui PAIE le plus. Sept piscines
 *      vivantes pour ce seul jeton, dont six prennent entre 66 % et 95 % :
 *      ce ne sont pas des piscines peu profondes, ce sont des pieges, et
 *      aucune lecture de profondeur ne les distingue ;
 *   3. que la transaction que la page CONSTRUIT passe sur la chaine avec le
 *      montant devise en minimum, et ECHOUE a un pour cent de plus. C'est la
 *      seule epreuve qui ne peut pas se tromper : elle lie le chiffre affiche
 *      a ce que le routeur delivre.
 *
 * Rien n'est signe ni diffuse : tout passe par `eth_call`, avec des surcharges
 * d'etat pour donner au faux joueur de quoi payer et de quoi vendre.
 *
 * C'est le code DE LA PAGE qui tourne, pas une copie : `wallet_extrait.js`
 * sort ses fonctions du fichier et les execute telles quelles.
 */
const path = require('path');
const X = require('./wallet_extrait.js');
const ethers = X.trouveEthers();
if (!ethers) { console.log('wallet_v4.test.js : ethers absent — essai saute'); process.exit(0); }

const PAGE = path.join(__dirname, 'swoge_wallet.html');
const RPC = 'https://rpc.mainnet.chain.robinhood.com';
const COPPERCAT = ethers.utils.getAddress('0x1abeea171ec0e04eded2286515d16eaa999a0872');
/* L'identifiant que Dexscreener publie pour la piscine ou passe le volume.
   C'est une source EXTERIEURE : si notre encodage derivait, il cesserait de
   coincider avec elle, et c'est exactement ce qu'on veut savoir. */
const ID_CONNU = '0xd5bb4224a14e690b58d66312ed7daf6242ea722103c52ef0040361a825931252';

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

(async () => {
  const p = new ethers.providers.StaticJsonRpcProvider(RPC, 4663);
  try { await p.getBlockNumber(); }
  catch (e) { console.log('wallet_v4.test.js : la chaine ne repond pas — essai saute'); process.exit(0); }
  const v = X.v4(PAGE, ethers, p);

  console.log('\n-- les adresses viennent de la page, pas de l essai --');
  ok(v.ROUTEUR4.toLowerCase() === '0x8876789976decbfcbbbe364623c63652db8c0904',
     'le routeur universel est celui qu Uniswap declare pour cette chaine (' + v.ROUTEUR4 + ')');
  /* Et il pointe sur LE bon PoolManager : deux contrats sans rapport
     s'appelleraient tous les deux « routeur » sans jamais se parler. */
  const pm = await p.call({ to: v.ROUTEUR4, data: ethers.utils.id('poolManager()').slice(0, 10) });
  ok(('0x' + pm.slice(26)).toLowerCase() === v.PM4.toLowerCase(),
     'et son `poolManager()` rend bien celui que la page interroge');

  console.log('\n-- trouver les piscines d un jeton qu on ne connaissait pas --');
  const cles = await v.piscinesV4(COPPERCAT);
  console.log('   ' + cles.length + ' piscine(s) vivante(s) :');
  cles.forEach((k) => console.log('      ' + v.idV4(k).slice(0, 18) + '…  frais '
    + (k[2] / 10000) + ' %  pas ' + k[3] + '  hook ' + (k[4] === ethers.constants.AddressZero ? 'aucun' : k[4])));
  ok(cles.length > 0, 'le jeton que la page declarait introuvable a bien des piscines');
  const ids = cles.map((k) => v.idV4(k));
  ok(ids.indexOf(ID_CONNU) >= 0,
     'dont celle ou passe le volume — son identifiant se RECALCULE depuis nos cinq champs');
  /* L'ETH natif est l'adresse ZERO en v4, pas le WETH. C'est precisement ce
     qu'on ne cherchait pas, et donc pourquoi on ne trouvait rien. */
  const vraie = cles[ids.indexOf(ID_CONNU)];
  ok(vraie && vraie[0] === ethers.constants.AddressZero,
     'et elle se cote contre l ETH NATIF (adresse zero), pas contre le WETH');

  console.log('\n-- sept piscines, six pieges : le devis tranche --');
  const ENTREE = ethers.utils.parseEther('0.01');
  const chacune = [];
  for (const k of cles) {
    const g = await v.devisV4([k], COPPERCAT, true, ENTREE);
    chacune.push({ k, id: v.idV4(k), out: g ? g.out : null });
  }
  chacune.forEach((x) => console.log('      frais ' + String(x.k[2] / 10000).padStart(6) + ' % -> '
    + (x.out ? ethers.utils.formatUnits(x.out, 18) : 'aucun devis')));
  const g = await v.devisV4(cles, COPPERCAT, true, ENTREE);
  ok(!!g, 'le devis rend quelque chose pour 0,01 ' + 'ETH (RH)');
  ok(g && v.idV4(g.k) === ID_CONNU,
     'et il choisit la piscine sans frais, celle du volume — pas une des autres');
  const pires = chacune.filter((x) => x.out && v.idV4(x.k) !== ID_CONNU)
                       .sort((a, b) => (b.out.gt(a.out) ? 1 : -1));
  if (pires.length && g) {
    const perte = 100 - Number(pires[0].out.mul(10000).div(g.out)) / 100;
    console.log('   la meilleure des autres rend ' + perte.toFixed(1) + ' % de moins');
    ok(perte > 10, 'se tromper de piscine couterait ' + perte.toFixed(1)
       + ' % — c est pour ca qu on les devise TOUTES a chaque fois');
  }

  /* ================== L EPREUVE QUI COMPTE ==================
   * On construit la transaction avec `corpsV4` — la fonction de la page — et
   * on la joue contre le vrai routeur. Le minimum EXACT doit passer ; un pour
   * cent de plus doit echouer. Un encodage approximatif ne peut pas satisfaire
   * les deux a la fois. */
  const MOI = ethers.utils.getAddress('0x000000000000000000000000000000000000a11c');
  const iUR = new ethers.utils.Interface(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']);
  const echeance = (await p.getBlock('latest')).timestamp + 900;
  /* ---- UN REFUS DU NOEUD N'EST PAS UN REFUS DU ROUTEUR ----
   * Une surcharge d'etat mal formee fait repondre « invalid argument », et
   * `catch` seul le lit comme « la transaction a echoue ». C'est arrive :
   * `0x0de0b6b3a7640000` — un ether, avec son zero de tete — est refuse par le
   * noeud (« cannot unmarshal hex number with leading zero digits »), et
   * l'essai accusait l'encodage de l'echange. Un achat de dix ethers passait,
   * une vente d'un ether non : la difference etait dans le zero, pas dans le
   * code mesure. On les distingue donc, et un refus de forme ARRETE l'essai
   * au lieu de se deguiser en verdict. */
  const essaie = async (corps, valeur, over) => {
    const data = iUR.encodeFunctionData('execute', ['0x10', [corps], echeance]);
    try {
      await p.send('eth_call', [{ from: MOI, to: v.ROUTEUR4, data, value: valeur }, 'latest', over]);
      return true;
    } catch (e) {
      const c = (e && e.error && e.error.code) || (e && e.code);
      const m = String((e && e.error && e.error.message) || (e && e.message) || '');
      if (c === -32602 || /invalid argument|unmarshal/.test(m))
        throw new Error('le noeud a refuse la FORME de l appel, pas l echange : ' + m.slice(0, 120));
      return false;
    }
  };
  /* Un EMPLACEMENT de stockage se surcharge sur trente-deux octets ; un SOLDE
     se surcharge comme une quantite, sans rembourrage. Les confondre fait
     silencieusement ignorer la surcharge de solde : l'appel echoue alors
     « faute de fonds », et l'essai le lit comme « l'encodage est faux ». */
  const M = (x) => ethers.utils.hexZeroPad(ethers.BigNumber.from(x).toHexString(), 32);
  const Q = (x) => '0x' + ethers.BigNumber.from(x).toBigInt().toString(16);

  console.log('\n-- acheter : ETH (RH) -> COPPERCAT --');
  const richesse = { [MOI]: { balance: Q(ethers.utils.parseEther('10')) } };
  /* ---- ON REDEVISE JUSTE AVANT ----
   * Ce jeton s'echange en continu et un bloc dure un dixieme de seconde : le
   * devis pris quinze lignes plus haut a deja plusieurs dizaines de blocs.
   * L'epreuve « le minimum exact passe » mesurerait alors la derive du prix,
   * pas l'encodage — et elle echouait pour cette raison-la. On fait ce que la
   * page fait elle-meme avant de signer : on redevise a l'instant. */
  const gA = await v.devisV4(cles, COPPERCAT, true, ENTREE);
  console.log('   devis : ' + ethers.utils.formatUnits(gA.out, 18) + ' COPPERCAT pour 0,01');
  ok(await essaie(v.corpsV4(gA.k, gA.zvu, ENTREE, gA.out), ENTREE.toHexString(), richesse),
     'la transaction que la page construit PASSE avec le devis exact en minimum');
  const gB = await v.devisV4(cles, COPPERCAT, true, ENTREE);
  ok(!(await essaie(v.corpsV4(gB.k, gB.zvu, ENTREE, gB.out.mul(101).div(100)), ENTREE.toHexString(), richesse)),
     'et elle ECHOUE a un pour cent de plus — le minimum est bien celui qu on lit');

  console.log('\n-- vendre : COPPERCAT -> ETH (RH) --');
  /* Vendre demande DEUX autorisations : le jeton vers Permit2, puis Permit2
     vers le routeur. On les pose par surcharge d etat, aux emplacements
     retrouves sur la chaine, et l on verifie qu en leur absence le refus est
     net — sinon l essai ne prouverait pas qu elles servent. */
  const A = ethers.utils.defaultAbiCoder, K = ethers.utils.keccak256;
  const m1 = (k, s) => K(A.encode(['address', 'uint256'], [k, s]));
  const m2 = (a, b, s) => K(A.encode(['address', 'uint256'], [b, ethers.BigNumber.from(m1(a, s))]));
  const m3 = (a, b, c, s) => K(A.encode(['address', 'uint256'], [c, ethers.BigNumber.from(m2(a, b, s))]));
  const VEND = ethers.utils.parseUnits('1000000', 18);
  const motP2 = ethers.BigNumber.from('0xffffffffffff').shl(160).add(ethers.utils.parseUnits('1', 30));
  const avecJetons = { [COPPERCAT]: { stateDiff: { [m1(MOI, 0)]: M(VEND.mul(2)) } } };
  const arme = {
    [MOI]: { balance: Q(ethers.utils.parseEther('1')) },
    [COPPERCAT]: { stateDiff: { [m1(MOI, 0)]: M(VEND.mul(2)),
                                [m2(MOI, v.PERMIT2, 1)]: M(ethers.constants.MaxUint256) } },
    [v.PERMIT2]: { stateDiff: { [m3(MOI, COPPERCAT, v.ROUTEUR4, 1)]: M(motP2) } },
  };
  const gv = await v.devisV4(cles, COPPERCAT, false, VEND);
  ok(!!gv, 'le devis de vente repond aussi');
  console.log('   devis : ' + ethers.utils.formatEther(gv.out) + ' ETH (RH) pour 1 000 000');
  ok(await essaie(v.corpsV4(gv.k, gv.zvu, VEND, gv.out), '0x0', arme),
     'la vente PASSE avec le devis exact en minimum');
  const gw = await v.devisV4(cles, COPPERCAT, false, VEND);
  ok(!(await essaie(v.corpsV4(gw.k, gw.zvu, VEND, gw.out.mul(101).div(100)), '0x0', arme)),
     'et ECHOUE a un pour cent de plus');
  /* Le minimum est mis a zero : ce qu'on mesure ici est l'AUTORISATION, et
     un minimum serre ferait echouer l'appel pour l'autre raison — on lirait
     « Permit2 sert » d'un refus qui vient du prix. */
  ok(!(await essaie(v.corpsV4(gv.k, gv.zvu, VEND, ethers.constants.Zero), '0x0',
       Object.assign({ [MOI]: arme[MOI] }, avecJetons))),
     'et sans les autorisations Permit2 elle est refusee — les deux servent vraiment');
  ok(await essaie(v.corpsV4(gv.k, gv.zvu, VEND, ethers.constants.Zero), '0x0', arme),
     'alors qu avec elles, le meme appel passe');

  console.log('\nwallet_v4.test.js : ' + n + ' verifications, ' + rates + ' ratees');
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.log('  RATE essai interrompu : ' + (e && e.message)); process.exit(1); });
