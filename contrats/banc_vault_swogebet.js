'use strict';
/*
 * LE BANC D'ESSAI DE SwogeBetVault — SUR UNE MACHINE VIRTUELLE, PAS SUR PAPIER
 *
 * ---- CE QU'IL PROUVE ----
 *
 * Le contrat compile, se deploie, et fait ce que le serveur attend de lui :
 *
 *   1. un depot credite ce qui est ARRIVE, et l'evenement `Deposit` a la
 *      forme que `chain.js` lit (player, amount, playerTotal, timestamp) ;
 *   2. un bon EIP-712 signe par le serveur — domaine « SwogeBetVault », type
 *      Withdraw(player, cumulative, deadline) — est accepte, et paie l'ecart
 *      entre le cumul et ce qui a deja ete verse ;
 *   3. le meme bon presente deux fois ne paie rien la seconde fois ;
 *   4. un bon signe pour le coffre $SWOGE (domaine « SwogePusherVault ») est
 *      REFUSE ici, et un bon signe par une autre cle aussi ;
 *   5. un bon perime est refuse, un ecart sous le minimum aussi ;
 *   6. la pause des depots et des retraits tient, et seul le proprietaire
 *      touche a la bankroll.
 *
 * ---- CE QU'IL NE PROUVE PAS ----
 *
 * Il tourne contre un ERC-20 factice, pas contre le vrai $SWOGEBET et son
 * `onMove` vers le launchpad. Le vrai jeton n'a pas de taxe et rend `true` :
 * c'est le cas nominal. Un essai sur fork (voir banc_fork.js) reste le
 * dernier mot avant de mettre de l'argent.
 *
 * ---- COMMENT LE LANCER ----
 *
 *   npm i solc@0.8.26 @ethereumjs/vm@8 @ethereumjs/common@4 @ethereumjs/util@9 @ethereumjs/block@5 ethers@5
 *   node contrats/banc_vault_swogebet.js
 *
 * Sans ces paquets il se saute, comme les bancs Playwright sans navigateur.
 */
const fs = require('fs');
const path = require('path');

let solc = null, VM = null, Common = null, Hardfork = null, util = null, Block = null, ethers = null;
try {
  solc = require('solc');
  ({ VM } = require('@ethereumjs/vm'));
  ({ Common, Hardfork } = require('@ethereumjs/common'));
  util = require('@ethereumjs/util');
  ({ Block } = require('@ethereumjs/block'));
  ({ ethers } = require('ethers'));
} catch (e) {
  console.log('banc_vault_swogebet.js : solc ou @ethereumjs absent — banc saute (' + e.message.slice(0, 60) + ')');
  process.exit(0);
}

let n = 0, rates = 0;
const ok = (v, m) => { n++; if (v) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

/* ---- LE JETON FACTICE ----
 * Un ERC-20 minimal, avec un `mint` libre : c'est un banc. */
const MOCK = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract MockBet {
  string public name = "Mock SWOGEBET"; string public symbol = "MBET"; uint8 public decimals = 18;
  uint256 public totalSupply;
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;
  function mint(address to, uint256 v) external { balanceOf[to] += v; totalSupply += v; }
  function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; return true; }
  function transfer(address to, uint256 v) external returns (bool) { return _t(msg.sender, to, v); }
  function transferFrom(address f, address to, uint256 v) external returns (bool) {
    uint256 a = allowance[f][msg.sender]; require(a >= v, "allowance");
    if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
    return _t(f, to, v);
  }
  function _t(address f, address to, uint256 v) internal returns (bool) {
    require(balanceOf[f] >= v, "balance"); balanceOf[f] -= v; balanceOf[to] += v; return true;
  }
}`;

function compile() {
  const src = fs.readFileSync(path.join(__dirname, 'SwogeBetVault.sol'), 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'SwogeBetVault.sol': { content: src }, 'MockBet.sol': { content: MOCK } },
    settings: { optimizer: { enabled: true, runs: 200 },
                outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const erreurs = (out.errors || []).filter((e) => e.severity === 'error');
  if (erreurs.length) throw new Error(erreurs.map((e) => e.formattedMessage).join('\n'));
  return {
    vault: out.contracts['SwogeBetVault.sol'].SwogeBetVault,
    mock: out.contracts['MockBet.sol'].MockBet,
  };
}

const CHAIN_ID = 4663;
const WEI = (v) => ethers.utils.parseUnits(String(v), 18);

(async () => {
  console.log('\n-- compilation --');
  const c = compile();
  ok(c.vault.evm.bytecode.object.length > 0, 'SwogeBetVault compile (' + c.vault.evm.bytecode.object.length / 2 + ' octets)');

  const common = Common.custom({ chainId: CHAIN_ID }, { hardfork: Hardfork.Cancun });
  const vm = await VM.create({ common });
  const iVault = new ethers.utils.Interface(c.vault.abi);
  const iMock = new ethers.utils.Interface(c.mock.abi);

  const proprio = ethers.Wallet.createRandom();
  const serveur = ethers.Wallet.createRandom();      // la cle SIGNER_PRIVATE_KEY du serveur
  const autre = ethers.Wallet.createRandom();
  const joueur = ethers.Wallet.createRandom();
  const adr = (w) => util.Address.fromString(w.address);
  for (const w of [proprio, serveur, autre, joueur]) {
    await vm.stateManager.putAccount(adr(w), new util.Account(0n, 10n ** 20n));
  }

  let horloge = 1_800_000_000n;
  const bloc = () => Block.fromBlockData({ header: { number: 1n, timestamp: horloge, gasLimit: 30_000_000n } }, { common });
  async function appel(de, a, data, opts) {
    const r = await vm.evm.runCall(Object.assign({
      caller: adr(de), to: a ? util.Address.fromString(a) : undefined,
      data: util.hexToBytes(data), gasLimit: 10_000_000n, block: bloc(),
    }, opts || {}));
    const echec = !!r.execResult.exceptionError;
    let raison = null;
    if (echec) {
      const ret = util.bytesToHex(r.execResult.returnValue);
      try { raison = ethers.utils.defaultAbiCoder.decode(['string'], '0x' + ret.slice(10))[0]; }
      catch (e) { raison = r.execResult.exceptionError.error; }
    }
    return { ok: !echec, raison, ret: util.bytesToHex(r.execResult.returnValue),
             logs: r.execResult.logs || [], cree: r.createdAddress ? r.createdAddress.toString() : null };
  }
  const lit = (a, iface, fn, args) => appel(joueur, a, iface.encodeFunctionData(fn, args || []))
    .then((r) => iface.decodeFunctionResult(fn, r.ret));

  console.log('\n-- deploiement --');
  const dMock = await appel(proprio, null, '0x' + c.mock.evm.bytecode.object);
  ok(dMock.ok && dMock.cree, 'le jeton factice est deploye ' + dMock.cree);
  const MOCKA = dMock.cree;
  const args = ethers.utils.defaultAbiCoder.encode(['address', 'address', 'uint256'],
    [MOCKA, serveur.address, WEI(50)]).slice(2);
  const dVault = await appel(proprio, null, '0x' + c.vault.evm.bytecode.object + args);
  ok(dVault.ok && dVault.cree, 'le coffre est deploye ' + dVault.cree);
  const VAULT = dVault.cree;
  ok((await lit(VAULT, iVault, 'signer'))[0].toLowerCase() === serveur.address.toLowerCase(), 'le signataire est celui du constructeur');
  ok((await lit(VAULT, iVault, 'owner'))[0].toLowerCase() === proprio.address.toLowerCase(), 'et le proprietaire, le deployeur');
  ok((await lit(VAULT, iVault, 'minWithdraw'))[0].eq(WEI(50)), 'minimum de retrait : 50');

  console.log('\n-- le depot --');
  await appel(proprio, MOCKA, iMock.encodeFunctionData('mint', [joueur.address, WEI(1000)]));
  /* Trois cents : de quoi payer les deux bons qui suivent (60 puis 100) sans
     vider le coffre — un coffre vide echouerait sur le transfert, pas sur la
     regle qu on veut eprouver. */
  const sansAppro = await appel(joueur, VAULT, iVault.encodeFunctionData('deposit', [WEI(100)]));
  ok(!sansAppro.ok, 'sans approve, le depot est refuse (' + sansAppro.raison + ')');
  await appel(joueur, MOCKA, iMock.encodeFunctionData('approve', [VAULT, ethers.constants.MaxUint256]));
  const dep = await appel(joueur, VAULT, iVault.encodeFunctionData('deposit', [WEI(300)]));
  ok(dep.ok, 'avec approve, il passe');
  const ev = dep.logs.map((l) => {
    try { return iVault.parseLog({ topics: l[1].map(util.bytesToHex), data: util.bytesToHex(l[2]) }); } catch (e) { return null; }
  }).find((x) => x && x.name === 'Deposit');
  ok(!!ev && ev.args.player.toLowerCase() === joueur.address.toLowerCase() && ev.args.amount.eq(WEI(300))
     && ev.args.playerTotal.eq(WEI(300)) && ev.args.timestamp.eq(horloge),
     'l evenement Deposit porte (player, amount, playerTotal, timestamp) — la forme que chain.js lit');
  ok((await lit(VAULT, iVault, 'totalPot'))[0].eq(WEI(300)), 'le pot vaut ce qui est entre');
  const zero = await appel(joueur, VAULT, iVault.encodeFunctionData('deposit', [0]));
  ok(!zero.ok, 'un depot de zero est refuse');

  console.log('\n-- le bon de retrait --');
  const domaine = { name: 'SwogeBetVault', version: '1', chainId: CHAIN_ID, verifyingContract: VAULT };
  const types = { Withdraw: [{ name: 'player', type: 'address' }, { name: 'cumulative', type: 'uint256' },
                             { name: 'deadline', type: 'uint256' }] };
  const bon = async (cle, cumul, echeance, dom) => {
    const sig = await cle._signTypedData(dom || domaine, types, { player: joueur.address, cumulative: cumul.toString(), deadline: echeance });
    const { v, r, s } = ethers.utils.splitSignature(sig);
    return iVault.encodeFunctionData('withdraw', [cumul, echeance, v, r, s]);
  };
  const echeance = Number(horloge) + 3600;
  const soldeAvant = (await lit(MOCKA, iMock, 'balanceOf', [joueur.address]))[0];
  const w1 = await appel(joueur, VAULT, await bon(serveur, WEI(60), echeance));
  ok(w1.ok, 'un bon de cumul 60 signe par le serveur est paye');
  const soldeApres = (await lit(MOCKA, iMock, 'balanceOf', [joueur.address]))[0];
  ok(soldeApres.sub(soldeAvant).eq(WEI(60)), 'le joueur recoit 60 (' + ethers.utils.formatUnits(soldeApres.sub(soldeAvant), 18) + ')');
  ok((await lit(VAULT, iVault, 'withdrawn', [joueur.address]))[0].eq(WEI(60)), 'et le coffre retient qu il a verse 60');
  const w1bis = await appel(joueur, VAULT, await bon(serveur, WEI(60), echeance));
  ok(!w1bis.ok && /nothing due/.test(w1bis.raison), 'le MEME bon presente une seconde fois ne paie rien (' + w1bis.raison + ')');
  const w2 = await appel(joueur, VAULT, await bon(serveur, WEI(160), echeance));
  const solde2 = (await lit(MOCKA, iMock, 'balanceOf', [joueur.address]))[0];
  ok(w2.ok && solde2.sub(soldeApres).eq(WEI(100)), 'un cumul de 160 paie l ECART : 100, pas 160');
  const petit = await appel(joueur, VAULT, await bon(serveur, WEI(180), echeance));
  ok(!petit.ok && /below minimum/.test(petit.raison), 'un ecart de 20 sous le minimum de 50 est refuse (' + petit.raison + ')');

  console.log('\n-- ce qu il refuse --');
  const autreCle = await appel(joueur, VAULT, await bon(autre, WEI(200), echeance));
  ok(!autreCle.ok && /bad signature/.test(autreCle.raison), 'un bon signe par une autre cle est refuse');
  const domSwoge = Object.assign({}, domaine, { name: 'SwogePusherVault' });
  const mauvaisCoffre = await appel(joueur, VAULT, await bon(serveur, WEI(200), echeance, domSwoge));
  ok(!mauvaisCoffre.ok && /bad signature/.test(mauvaisCoffre.raison),
     'un bon signe pour le coffre $SWOGE (domaine SwogePusherVault) ne vaut rien ici');
  const perime = await appel(joueur, VAULT, await bon(serveur, WEI(200), Number(horloge) - 1));
  ok(!perime.ok && /expired/.test(perime.raison), 'un bon perime est refuse (' + perime.raison + ')');
  const pasLui = ethers.Wallet.createRandom();
  await vm.stateManager.putAccount(adr(pasLui), new util.Account(0n, 10n ** 20n));
  const vole = await appel(pasLui, VAULT, await bon(serveur, WEI(200), echeance));
  ok(!vole.ok, 'un bon signe pour le joueur ne se presente pas depuis une autre adresse');

  console.log('\n-- le proprietaire --');
  const pause = await appel(joueur, VAULT, iVault.encodeFunctionData('setWithdrawalsPaused', [true]));
  ok(!pause.ok && /not owner/.test(pause.raison), 'un joueur ne met pas les retraits en pause');
  ok((await appel(proprio, VAULT, iVault.encodeFunctionData('setWithdrawalsPaused', [true]))).ok, 'le proprietaire, si');
  const enPause = await appel(joueur, VAULT, await bon(serveur, WEI(200), echeance));
  ok(!enPause.ok && /paused/.test(enPause.raison), 'et plus rien ne sort pendant la pause');
  await appel(proprio, VAULT, iVault.encodeFunctionData('setWithdrawalsPaused', [false]));
  await appel(proprio, VAULT, iVault.encodeFunctionData('setDepositsPaused', [true]));
  const depPause = await appel(joueur, VAULT, iVault.encodeFunctionData('deposit', [WEI(1)]));
  ok(!depPause.ok && /paused/.test(depPause.raison), 'ni n entre pendant la pause des depots');
  await appel(proprio, VAULT, iVault.encodeFunctionData('setDepositsPaused', [false]));
  await appel(proprio, MOCKA, iMock.encodeFunctionData('mint', [proprio.address, WEI(500)]));
  await appel(proprio, MOCKA, iMock.encodeFunctionData('approve', [VAULT, ethers.constants.MaxUint256]));
  ok((await appel(proprio, VAULT, iVault.encodeFunctionData('ownerDeposit', [WEI(500)]))).ok, 'la bankroll s approvisionne');
  ok((await lit(VAULT, iVault, 'totalPot'))[0].eq(WEI(640)), 'le pot : 300 deposes - 160 verses + 500 de bankroll = 640');
  const volOwner = await appel(joueur, VAULT, iVault.encodeFunctionData('ownerWithdraw', [joueur.address, WEI(1)]));
  ok(!volOwner.ok, 'un joueur ne retire pas la bankroll');
  ok((await appel(proprio, VAULT, iVault.encodeFunctionData('setSigner', [autre.address]))).ok, 'le signataire se change');
  const ancien = await appel(joueur, VAULT, await bon(serveur, WEI(200), echeance));
  ok(!ancien.ok, 'et l ancienne cle ne signe plus rien');
  const nouveau = await appel(joueur, VAULT, await bon(autre, WEI(260), echeance));
  ok(nouveau.ok, 'la nouvelle, si');

  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'banc_vault_swogebet.js : tout passe (' + n + ' verifications)'));
  process.exitCode = rates ? 1 : 0;
})().catch((e) => { console.log('EXCEPTION : ' + (e && e.stack || e)); process.exitCode = 1; });
