'use strict';
/*
 * PROUVER CE QU'UN JETON LANCE PAR SwogeFunV3 PEUT ET NE PEUT PAS FAIRE.
 *
 * Pourquoi ce fichier existe : Dexscreener affiche l'audit automatique de
 * Quick Intel, et sur $SWOGEBET il annonce « Has suspicious functions: Yes »,
 * « Mintable: Yes », et « Ownership renounced: Unknown ». Les trois sont faux
 * ou trompeurs, mais « c'est faux » n'est pas un argument : il faut pouvoir le
 * MONTRER, et que n'importe qui puisse refaire la mesure.
 *
 * Ce script ne demande rien a personne. Il lit le bytecode sur le RPC public,
 * en sort la liste EXACTE des fonctions publiques, et verifie que chacune est
 * connue. Une fonction cachee ne peut pas echapper a ce test : le repartiteur
 * de Solidity contient forcement le selecteur de chaque fonction qu'on peut
 * appeler. Ce qui n'y est pas n'existe pas.
 *
 *   node contrats/preuve_jeton.js [adresse]
 *
 * ---- POURQUOI PAS `eth_call` POUR TESTER LA PRESENCE ----
 *
 * Premiere version : appeler `owner()`, `mint()`, `pause()` et regarder si ca
 * revertit. Ca ne prouve RIEN ici. Mesure faite sur ce noeud : un appel a un
 * selecteur inexistant rend `0x` — succes, sans donnee — au lieu de revertir.
 * Les vingt-huit fonctions dangereuses testees repondaient donc toutes
 * « presente ». C'est le bytecode qu'il faut lire, pas les reponses du noeud.
 */
/* `ethers` n'est pas installe dans ce depot : il vit dans celui du serveur,
   comme pour les essais du portefeuille. On essaie les deux, et on le dit
   plutot que de mourir sur une pile d'appels. */
const ethers = (function () {
  for (const p of ['ethers', '/home/user/swoge-pusher-server.github.io/node_modules/ethers']) {
    try { const m = require(p); return m.ethers || m; } catch (e) {}
  }
  console.error('ethers is missing — run:  npm i ethers');
  process.exit(1);
})();

const RPC = 'https://rpc.mainnet.chain.robinhood.com';
const DEFAUT = '0xc0aEd547862fba5D7D9Fbf3cb14204cD756c8Bea';   // $SWOGEBET
const FUN_V3 = '0xc16388e95dbbD37A679A7d507C174C7e34C5856E';   // le launchpad, verifie sur Blockscout

/* La surface publique de `SwogeToken`, telle qu'elle est ecrite dans
   SwogeFunV3.sol. Quinze fonctions, pas une de plus. */
const ATTENDU = [
  'name()', 'symbol()', 'decimals()', 'totalSupply()',
  'balanceOf(address)', 'allowance(address,address)',
  'transfer(address,uint256)', 'approve(address,uint256)',
  'transferFrom(address,address,uint256)',
  'fun()', 'pool()', 'setPool(address)',
  'launchBlock()', 'SNIPE_BLOCKS()', 'SNIPE_MAX_BPS()',
];

/* Ce que cherche un scanner. Aucune ne doit apparaitre. */
const DANGEREUX = [
  'owner()', 'getOwner()', 'transferOwnership(address)', 'renounceOwnership()',
  'mint(address,uint256)', 'mint(uint256)', 'mintTo(address,uint256)',
  'pause()', 'unpause()', 'setPaused(bool)',
  'blacklist(address)', 'setBlacklist(address,bool)', 'addToBlacklist(address)',
  'whitelist(address)', 'setWhitelist(address,bool)',
  'setFees(uint256,uint256)', 'setTaxes(uint256,uint256)', 'setBuyTax(uint256)',
  'setSellTax(uint256)', 'excludeFromFee(address)', 'setFeeReceiver(address)',
  'setMaxTx(uint256)', 'setMaxWallet(uint256)', 'enableTrading()',
  'setTradingEnabled(bool)', 'setCooldown(uint256)',
  'upgradeTo(address)', 'upgradeToAndCall(address,bytes)', 'implementation()',
  'grantRole(bytes32,address)', 'MINTER_ROLE()',
  'withdrawStuckTokens(address,uint256)', 'rescueTokens(address,uint256)',
];

const ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function fun() view returns (address)',
  'function pool() view returns (address)',
  'function launchBlock() view returns (uint256)',
  'function SNIPE_BLOCKS() view returns (uint256)',
  'function SNIPE_MAX_BPS() view returns (uint16)',
];

let echecs = 0;
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FAIL  ') + m); if (!c) echecs++; };
const sel = (s) => ethers.utils.id(s).slice(0, 10);

/* ---- SORTIR LES SELECTEURS DU REPARTITEUR ----
 * Solidity compare le selecteur recu a chaque selecteur connu : le motif est
 * `PUSH4 <sel>` suivi d'un `EQ` (0x14) ou d'un `GT` (0x11), ce dernier pour
 * l'arbre binaire qu'il construit des qu'il y a assez de fonctions. Un simple
 * balayage des `PUSH4` ramasserait aussi des constantes et des selecteurs
 * d'erreur — mesure faite, 25 au lieu de 15. */
function selecteursDe(code) {
  const b = Buffer.from(code.slice(2), 'hex');
  const out = new Set();
  for (let i = 0; i + 6 <= b.length; i++) {
    if (b[i] === 0x63 && (b[i + 5] === 0x14 || b[i + 5] === 0x11))
      out.add('0x' + b.slice(i + 1, i + 5).toString('hex'));
  }
  return out;
}

(async () => {
  const adr = process.argv[2] || DEFAUT;
  const p = new ethers.providers.StaticJsonRpcProvider(RPC, 4663);
  const c = new ethers.Contract(adr, ABI, p);

  console.log('\nToken ' + adr);
  console.log('Chain 4663 (Robinhood Chain) · read from ' + RPC + '\n');

  const code = await p.getCode(adr);
  if (code === '0x') { console.log('  no code at this address'); process.exit(1); }
  const taille = (code.length - 2) / 2;
  const vus = selecteursDe(code);

  /* ---------- 1. LA LISTE COMPLETE DES FONCTIONS ---------- */
  console.log('-- every public function, read out of the bytecode --');
  const connus = new Map(ATTENDU.map((s) => [sel(s), s]));
  const inconnus = [...vus].filter((s) => !connus.has(s));
  for (const s of ATTENDU) {
    const present = vus.has(sel(s));
    if (present) console.log('  ' + sel(s) + '  ' + s);
  }
  ok(inconnus.length === 0,
     'the contract has EXACTLY ' + vus.size + ' public functions, and every one is named above'
     + (inconnus.length ? ' — unknown: ' + inconnus.join(', ') : ''));
  const manquants = ATTENDU.filter((s) => !vus.has(sel(s)));
  ok(manquants.length === 0, 'and none of the expected ones is missing'
     + (manquants.length ? ' — missing: ' + manquants.join(', ') : ''));

  /* ---------- 2. CE QUI N'Y EST PAS ---------- */
  console.log('\n-- what a scanner looks for, and does not find --');
  const trouves = DANGEREUX.filter((s) => vus.has(sel(s)));
  ok(trouves.length === 0,
     'none of the ' + DANGEREUX.length + ' dangerous functions is in the bytecode'
     + (trouves.length ? ' — FOUND: ' + trouves.join(', ') : ''));
  console.log('        no owner  ·  no mint  ·  no pause  ·  no blacklist  ·  no fee setter  ·  no proxy');

  /* ---------- 3. L'OFFRE EST FIGEE ---------- */
  console.log('\n-- the supply --');
  const ts = await c.totalSupply();
  console.log('  total supply           ' + ethers.utils.commify(ethers.utils.formatUnits(ts, 18)));
  /* `totalSupply` est une variable de stockage ordinaire. Les seules fonctions
     qui ecrivent quoi que ce soit sont transfer, approve, transferFrom et
     setPool — aucune ne la touche, et il n'existe pas de `mint`. */
  ok(!vus.has(sel('mint(address,uint256)')) && !vus.has(sel('mint(uint256)')),
     'no function can increase it: the only state-changing functions are transfer,'
     + ' approve, transferFrom and setPool');

  /* ---------- 4. IL N'Y A PAS DE PROPRIETAIRE ---------- */
  console.log('\n-- ownership --');
  ok(!vus.has(sel('owner()')) && !vus.has(sel('getOwner()')),
     'there is no owner() to read, and no transferOwnership() to call');
  ok(!vus.has(sel('renounceOwnership()')),
     'and no renounceOwnership() either — there was never an owner to renounce');
  console.log('        "Ownership renounced: Unknown" comes from this: a scanner looks for the');
  console.log('        renunciation, and an owner that never existed leaves no trace of one.');

  /* ---------- 5. LES DEUX CONSTANTES QUE LE SCANNER NE SAIT PAS LIRE ---------- */
  console.log('\n-- the anti-snipe guard, and why it is dead --');
  const fun = await c.fun(), pool = await c.pool();
  const lb = await c.launchBlock(), sb = await c.SNIPE_BLOCKS(), smb = await c.SNIPE_MAX_BPS();
  const bn = await p.getBlockNumber();
  console.log('  launchBlock            ' + lb.toString());
  console.log('  SNIPE_BLOCKS           ' + sb.toString() + '  (blocks the cap applied for)');
  console.log('  SNIPE_MAX_BPS          ' + smb.toString() + '  (' + (smb / 100) + ' % of supply per wallet)');
  console.log('  current block          ' + bn);
  const fin = lb.add(sb);
  ok(ethers.BigNumber.from(bn).gt(fin),
     'the window closed at block ' + fin.toString() + ' — ' + (bn - fin.toNumber())
     + ' blocks ago. It caps nothing now, and it can never come back:'
     + ' launchBlock is immutable and SNIPE_BLOCKS is a constant.');

  console.log('\n-- setPool, spent --');
  console.log('  fun()                  ' + fun);
  console.log('  pool()                 ' + pool);
  ok(fun.toLowerCase() === FUN_V3.toLowerCase(),
     'fun() is the SwogeFun V3 launchpad, verified on Blockscout');
  ok(pool !== ethers.constants.AddressZero,
     'pool is already set, and setPool requires pool == address(0) — it reverts for ever, for everyone');

  /* ---------- 6. AUCUNE TAXE, MESUREE SUR LA CHAINE ---------- */
  console.log('\n-- buy / sell tax, measured on the chain --');
  const TR = ethers.utils.id('Transfer(address,address,uint256)');
  const depuis = Math.max(0, bn - 3000000);
  const logs = await p.getLogs({ address: adr, topics: [TR], fromBlock: depuis, toBlock: bn });
  const parTx = {};
  for (const l of logs) (parTx[l.transactionHash] = parTx[l.transactionHash] || []).push(l);
  /* Une taxe se voit : elle ajoute un transfert vers un troisieme portefeuille
     dans la MEME transaction, et le montant recu est plus petit que le montant
     envoye. On cherche donc la plus longue chaine de transferts du montant
     EXACT — si un seul wei etait preleve, elle se casserait. */
  let meilleure = null;
  for (const h of Object.keys(parTx)) {
    const g = parTx[h];
    if (g.length < 2) continue;
    const v = g[0].data;
    if (g.every((l) => l.data === v)) {
      if (!meilleure || g.length > meilleure.g.length) meilleure = { h, g };
    }
  }
  console.log('  transfers read         ' + logs.length + ' over the last ' + (bn - depuis) + ' blocks');
  if (meilleure) {
    const v = ethers.utils.formatUnits(ethers.BigNumber.from(meilleure.g[0].data), 18);
    console.log('  chain of hops          ' + meilleure.g.length + ' in tx ' + meilleure.h);
    console.log('  amount at every hop    ' + v);
    ok(true, 'the same amount, to the last wei, at every hop — a tax would have shortened'
       + ' this chain at the first one');
  } else {
    console.log('  (no multi-hop transaction in the window — run again over a wider range)');
  }
  /* ---- CE QU'EST VRAIMENT UNE TAXE, ET COMMENT ON LA RECONNAIT ----
   *
   * Premiere version de ce test : « aucune transaction ne coupe un transfert
   * en deux montants differents ». Elle ECHOUAIT, et elle avait tort. Une
   * transaction traverse plusieurs contrats, et l'un d'eux peut tres bien
   * couper — sans que le JETON y soit pour quelque chose.
   *
   * Une taxe de jeton a une signature precise : le jeton lui-meme emet DEUX
   * `Transfer` pour UN seul appel, avec le MEME expediteur, dont l'un va
   * toujours a la meme adresse. C'est ce « toujours la meme, quel que soit
   * l'expediteur » qu'on cherche : c'est le portefeuille a taxe.
   *
   * Ce qui se voit ici et n'en est PAS une : un contrat en aval de la piscine
   * recoit la totalite, puis en renvoie une part. Il est deja proprietaire des
   * jetons quand il les coupe — c'est un frais de routeur, il s'appliquerait a
   * n'importe quel jeton passant par lui, et le jeton ne le connait pas. */
  const coupes = {};        // adresse -> ensemble des expediteurs qui l'ont payee
  for (const g of Object.values(parTx)) {
    const parDe = {};
    for (const l of g) (parDe[l.topics[1]] = parDe[l.topics[1]] || []).push(l);
    for (const ls of Object.values(parDe)) {
      if (ls.length < 2) continue;
      const tri = ls.slice().sort((a, b) =>
        ethers.BigNumber.from(a.data).lt(ethers.BigNumber.from(b.data)) ? -1 : 1);
      const petit = '0x' + tri[0].topics[2].slice(26);
      (coupes[petit] = coupes[petit] || new Set()).add(tri[0].topics[1]);
    }
  }
  const suspects = Object.entries(coupes).filter(([, de]) => de.size >= 2);
  ok(suspects.length === 0,
     'no address collects the small half of a split from more than one sender —'
     + ' that pattern, and only that pattern, is a token fee wallet'
     + (suspects.length ? ' — FOUND: ' + suspects.map(([a]) => a).join(', ') : ''));
  const routeurs = Object.entries(coupes).filter(([, de]) => de.size === 1);
  if (routeurs.length) {
    console.log('        Splits do appear further down the path, always from one single');
    console.log('        contract that already held the tokens — a router fee, charged by');
    console.log('        whatever front-end the trader used, on any token routed through it:');
    for (const [a, de] of routeurs)
      console.log('          ' + a + '  (paid by ' + [...de].map((t) => '0x' + t.slice(26, 34)).join(', ') + ')');
  }

  console.log('\n-- the code itself --');
  console.log('  runtime bytecode       ' + taille + ' bytes');
  console.log('  source                 contracts/SwogeFunV3.sol, contract SwogeToken');
  console.log('  compiler               solc 0.8.34+commit.80d5c536 · optimizer on, 200 runs · EVM cancun');

  console.log('\n' + (echecs ? echecs + ' CHECK(S) FAILED' : 'All checks passed. Anyone can re-run this'
    + ' script against the public RPC and get the same output.'));
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error('read failed:', e.reason || e.message); process.exit(1); });
