'use strict';
/*
 * LE BANC D'ESSAI SUR FORK — SwogeFunV4Weth (copie de banc_fork_v4.js, 29/09/2026)
 *
 * Le jumeau WETH du V4 : memes preuves, avec un pool apparie au WETH. Le frais
 * de lancement se paie en ETH, montant EXACT, et part au tresor ; l'acheteur
 * paie en WETH, la recolte partage le WETH 50/50 entre createur et tresor.
 *
 * (En-tete du V4 :)
 *
 * Ce que le V4 doit prouver EN PLUS du V3 : le jeton lance est un ERC-20 NU —
 * aucun opcode d'appel dans son bytecode deploye, `owner()` rend zero, aucune
 * fonction au-dela de l'ERC-20 — et les frais vont ou le contrat le dit :
 * 50 % du $SWOGE au createur, 50 % au tresor, la part en jeton brulee. Et on
 * revend reellement par le routeur : un jeton qui s'achete et ne se revend pas
 * est un piege, quoi qu'affiche un scanner.
 *
 * (En-tete du V3, toujours vrai :)
 *
 * ---- LE TROU QUE CE FICHIER BOUCHE ----
 *
 * Le contrat a ete relu deux fois par des agents adverses, ses bornes
 * arithmetiques ont ete demontrees, son modele de repartition a ete simule.
 * Rien de tout cela n'a EXECUTE une seule instruction EVM. Toute la partie
 * Uniswap — creation du pool, amorcage du prix, mint mono-face, reception du
 * NFT, `collect` — n'avait jamais tourne. C'est precisement la partie qu'on
 * ne peut pas raisonner de tete : elle depend d'un gestionnaire de positions
 * qui est un FORK, sur une chaine dont on ne controle rien.
 *
 * Ici, on fait tourner le vrai bytecode contre le VRAI etat de la chaine :
 * le vrai gestionnaire de positions, le vrai $SWOGE, la vraie usine Uniswap.
 * Un fork lu par RPC, pas une reconstitution. Si un lancement passe ici, il
 * passe en production ; s'il echoue ici, il aurait echoue POUR TOUJOURS.
 *
 * ---- CE QUE CE BANC NE PROUVE PAS ----
 *
 * Il tourne a un bloc donne, avec un seul chemin nominal. Il ne remplace ni
 * un audit humain, ni un essai sur reseau de test avec plusieurs comptes et
 * du temps qui passe. Un contrat sans proprietaire merite les deux.
 */
const path = require('path');
const { keccak256 } = require('js-sha3');
const { ethers } = require('ethers');
const { createVM } = require('@ethereumjs/vm');
const { RPCStateManager } = require('@ethereumjs/statemanager');
const { Common, Mainnet, Hardfork } = require('@ethereumjs/common');
const { createAddressFromString, hexToBytes, bytesToHex, setLengthLeft, bigIntToBytes } = require('@ethereumjs/util');

const RPC = 'https://rpc.mainnet.chain.robinhood.com';

/* ---------- UN RELAIS LOCAL DEVANT LE NOEUD ----------
   Le gestionnaire d'etat interroge le noeud des milliers de fois, et le noeud
   finit par refuser. Quand `eth_getProof` rend une erreur, le gestionnaire
   dereference une reponse absente et le banc s'arrete au milieu — un echec
   qui n'a rien a voir avec le contrat, mais qui en a tout l'air.
   On met donc un relais devant : il reessaie, et il MEMORISE. L'etat est lu
   a un bloc fige, donc une reponse ne change jamais : le cache est sain, et
   il rend les essais suivants quasi instantanes. */
function relais() {
  const http = require('http');
  relais.reprises = relais.reprises || 0; relais.abandons = relais.abandons || 0; relais.replis = relais.replis || 0;
  const cache = new Map();
  const srv = http.createServer((q, r) => {
    let corps = '';
    q.on('data', (c) => { corps += c; });
    q.on('end', async () => {
      const clef = corps;
      if (cache.has(clef)) {
        r.writeHead(200, { 'content-type': 'application/json' });
        return r.end(cache.get(clef));
      }
      let dernier = null, corpsCourant = corps, replie = false;
      for (let essai = 0; essai < 10; essai++) {
        try {
          const rep = await fetch(RPC, { method: 'POST',
            headers: { 'content-type': 'application/json' }, body: corpsCourant });
          const txt = await rep.text();
          const j = JSON.parse(txt);
          const un = Array.isArray(j) ? j[0] : j;
          if (rep.ok && un && !un.error) {
            cache.set(clef, txt);
            if (essai > 0) relais.reprises++;
            r.writeHead(200, { 'content-type': 'application/json' });
            return r.end(txt);
          }
          dernier = txt;
          /* ---- LE NOEUD N'EST PAS UNE ARCHIVE ----
             La chaine avance vite et le noeud elague l'etat ancien. Un banc
             qui dure quelques minutes voit donc son bloc d'ancrage DISPARAITRE
             en cours de route : « missing trie node ». On rejoue alors la
             meme question sur le bloc courant. C'est acceptable ici parce que
             tout ce qu'on lit encore sur la chaine est de l'infrastructure
             figee — le $SWOGE, le gestionnaire de positions, l'usine — tandis
             que nos propres contrats vivent dans le VM. Chaque reponse etant
             mise en cache, elle reste ensuite constante pour tout l'essai.
             On le COMPTE, et le banc le dira. */
          if (!replie && /missing trie node|not available|header not found/i.test(un && un.error && un.error.message || '')) {
            try {
              const q = JSON.parse(corpsCourant);
              if (Array.isArray(q.params) && q.params.length) {
                const der = q.params.length - 1;
                if (typeof q.params[der] === 'string' && /^0x[0-9a-f]+$/i.test(q.params[der])) {
                  q.params[der] = 'latest'; corpsCourant = JSON.stringify(q);
                  replie = true; relais.replis++; continue;
                }
              }
            } catch (e) {}
          }
        } catch (e) {
          dernier = JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: String(e.message || e) } });
        }
        await new Promise((x) => setTimeout(x, Math.min(2000, 120 * 2 ** essai)));
      }
      /* On n'invente PAS de reponse : une reponse fabriquee ferait passer le
         banc au vert sur un etat qui n'est pas celui de la chaine. On compte
         l'abandon, et le banc le signalera au lieu de mentir. */
      relais.abandons++;
      try { console.log('     ! le noeud abandonne sur ' + (JSON.parse(clef).method || '?')
        + '\n       requete : ' + clef.slice(0, 200)
        + '\n       reponse : ' + String(dernier).slice(0, 300)); } catch (e) {}
      r.writeHead(200, { 'content-type': 'application/json' });
      r.end(dernier || '{}');
    });
  });
  return new Promise((res) => srv.listen(0, '127.0.0.1', () => res({
    url: 'http://127.0.0.1:' + srv.address().port, stop: () => srv.close(),
  })));
}

/* ---- les vraies adresses de la chaine 4663 ---- */
const PM       = '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3';   // NonfungiblePositionManager (un fork)
const SWOGE    = '0x8a166Fb41Cd659a0a43396272FF73973Ce29F817';
const TRESOR   = '0x6229DDF7c8Ed3A194819aF2e68f5de2Dc31e7F30';
const ROUTER   = '0xcaf681a66d020601342297493863e78c959e5cb2';
const WETH     = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';   // WETH9 (symbol WETH, deposit()) relu le 29/09
const DEAD     = '0x000000000000000000000000000000000000dEaD';
const FRAIS    = ethers.utils.parseEther('0.0001');               // frais de lancement EN ETH (parite 10 000 $SWOGE, 29/09)
const SLOT_SOLDES = 0;                                            // `_balances` du $SWOGE, trouve par recoupement

let n = 0, echecs = 0, gazLancement = 0n;
const ok = (c, m) => { if (c) { n++; console.log('  ok   ' + m); }
                       else { echecs++; console.log('  RATE ' + m); } };

/* ---------- compilation ---------- */
function compiler() {
  const solc = require(path.join(process.env.S, 'node_modules', 'solc'));
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, 'SwogeFunV4Weth.sol'), 'utf8');
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity', sources: { 'SwogeFunV4Weth.sol': { content: src } },
    settings: { optimizer: { enabled: true, runs: 200 },
                outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } }
  })));
  const err = (out.errors || []).filter((e) => e.severity === 'error');
  if (err.length) { console.log('compilation impossible :', err[0].formattedMessage); process.exit(1); }
  if ((out.errors || []).some((e) => e.severity === 'warning')) console.log('avertissement :', out.errors.filter((e) => e.severity === 'warning')[0].formattedMessage);
  const c = out.contracts['SwogeFunV4Weth.sol'];
  return { abi: c.SwogeFunV4Weth.abi, bin: c.SwogeFunV4Weth.evm.bytecode.object, tokAbi: c.SwogeTokenV4.abi, tokBin: c.SwogeTokenV4.evm.bytecode.object };
}

/* ---------- helpers EVM ---------- */
const adr = (a) => createAddressFromString(a.toLowerCase());

/* ---- LE TEMPS QUI PASSE ----
   Un fork ne fabrique pas de blocs tout seul : sans ca, `block.number` reste
   fige et la fenetre anti-snipe du jeton (5 % par portefeuille pendant 2
   blocs) ne se referme JAMAIS. Le pool tombe alors sur « TF » des qu'un
   acheteur depasse 5 %, et on croit avoir trouve un defaut du contrat alors
   qu'on regarde une garde qui fonctionne. On avance donc le compteur. */
let hauteur = 0n;
const avancer = (k = 1n) => { hauteur += k; };
function blocFactice() {
  return { header: {
    number: hauteur, cliqueSigner: () => adr('0x0000000000000000000000000000000000000000'),
    timestamp: 1800000000n + hauteur * 2n, coinbase: adr('0x0000000000000000000000000000000000000000'),
    difficulty: 0n, prevRandao: new Uint8Array(32), gasLimit: 30000000n, baseFeePerGas: 0n,
    getBlobGasPrice: () => 0n,
  } };
}
/* ---- UN APPEL RATE NE DOIT RIEN LAISSER DERRIERE LUI ----
   Sur une vraie chaine, une transaction qui echoue ne modifie rien. Ici, les
   ecritures d'etat faites hors journal (on garnit des soldes a la main) et
   l'appel direct a l'EVM peuvent laisser passer des morceaux d'un appel
   revert. On l'a vu en direct : apres un lancement rate, le verrou de
   non-reentrance restait pose et le lancement SUIVANT echouait sur
   « reentrant » — un faux defaut, tres convaincant. On encadre donc chaque
   appel de premier niveau d'un point de reprise explicite. */
async function appel(vm, { de, a, data, valeur }) {
  await vm.stateManager.checkpoint();
  const r = await vm.evm.runCall({
    caller: adr(de), to: a ? adr(a) : undefined, data: hexToBytes(data || '0x'),
    value: valeur || 0n, gasLimit: 30000000n, isStatic: false,
    origin: adr(de), block: blocFactice(),
  });
  if (r.execResult.exceptionError) await vm.stateManager.revert();
  else await vm.stateManager.commit();
  return r;
}
function motif(r) {
  const ex = r.execResult;
  if (!ex.exceptionError) return null;
  let raison = ex.exceptionError.error || String(ex.exceptionError);
  const rv = ex.returnValue;
  if (rv && rv.length) {
    const hex = bytesToHex(rv);
    if (hex.startsWith('0x08c379a0')) {
      try { raison += ' : ' + ethers.utils.defaultAbiCoder.decode(['string'], '0x' + hex.slice(10))[0]; } catch (e) {}
    } else if (hex.startsWith('0x4e487b71')) {
      raison += ' : Panic(' + BigInt('0x' + hex.slice(10)).toString() + ')';
    } else {
      raison += ' : donnees ' + hex.slice(0, 80);
    }
  } else { raison += ' : AUCUNE donnee de retour'; }
  return raison;
}

(async () => {
  console.log('\n=== BANC D\'ESSAI SUR FORK — SwogeFunV4Weth ===\n');
  const { abi, bin, tokAbi, tokBin } = compiler();
  const iface = new ethers.utils.Interface(abi);

  /* ---- le fork ---- */
  const prov = new ethers.providers.StaticJsonRpcProvider(RPC, 4663);
  const bloc = await prov.getBlockNumber();
  console.log('fork au bloc', bloc, '\n');
  hauteur = BigInt(bloc);

  /* CANCUN, et pas moins. Solidity 0.8.30+ vise Cancun par defaut et emet
     MCOPY et le stockage transitoire. Sous Shanghai, le $SWOGE deploye tombe
     sur « invalid opcode » apres avoir brule tout le gaz — un echec qui
     ressemble a un defaut du contrat alors qu'il n'est qu'un banc mal regle.
     C'est le premier piege de ce genre d'essai : croire le fork. */
  const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
  const relaisLocal = await relais();
  const sm = new RPCStateManager({ provider: relaisLocal.url, blockTag: BigInt(bloc) });
  const vm = await createVM({ common, stateManager: sm });

  /* ---- un compte d'essai, finance en ETH et en $SWOGE ----
     On n'emprunte pas le solde de quelqu'un : on ECRIT directement dans la
     case de stockage des soldes du $SWOGE. C'est ce qu'un fork permet, et
     c'est plus propre que de se faire passer pour un detenteur reel dont on
     casserait les invariants (la paire, par exemple). */
  const MOI = '0x00000000000000000000000000000000000A11CE';
  await sm.modifyAccountFields(adr(MOI), { balance: ethers.utils.parseEther('100').toBigInt() });
  const cle = hexToBytes('0x' + keccak256(Buffer.from(
    MOI.slice(2).toLowerCase().padStart(64, '0') + SLOT_SOLDES.toString(16).padStart(64, '0'), 'hex')));
  const dot = ethers.utils.parseEther('3000000').toBigInt();
  await sm.putStorage(adr(SWOGE), cle, setLengthLeft(bigIntToBytes(dot), 32));

  const routeur = new ethers.utils.Interface([
    'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)',
  ]);
  const ierc = new ethers.utils.Interface([
    'function balanceOf(address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
    'function transfer(address,uint256) returns (bool)',
    'function totalSupply() view returns (uint256)',
    'function ownerOf(uint256) view returns (address)',
  ]);
  const lire = async (a, data) => {
    const r = await appel(vm, { de: MOI, a, data });
    if (r.execResult.exceptionError) return null;
    return bytesToHex(r.execResult.returnValue);
  };

  console.log('-- le compte d essai --');
  const solde0 = await lire(SWOGE, ierc.encodeFunctionData('balanceOf', [MOI]));
  ok(solde0 && BigInt(solde0) === dot, 'le compte detient 3 000 000 $SWOGE dans le fork');

  /* ---- 1. DEPLOIEMENT ---- */
  console.log('\n-- 1. deploiement --');
  const args = ethers.utils.defaultAbiCoder.encode(
    ['address', 'address', 'address', 'uint256'], [PM, WETH, TRESOR, FRAIS]).slice(2);
  const dep = await appel(vm, { de: MOI, a: null, data: '0x' + bin + args });
  const FUN = dep.createdAddress ? '0x' + dep.createdAddress.toString().slice(2) : null;
  ok(!dep.execResult.exceptionError && FUN, 'le launchpad se deploie' + (dep.execResult.exceptionError ? ' — ' + motif(dep) : ''));
  if (!FUN) { console.log('\narret : rien a essayer sans contrat.'); process.exit(1); }
  console.log('     launchpad =', FUN);
  console.log('     gaz du deploiement =', String(dep.execResult.executionGasUsed || ''));

  /* ---- 2. AUTORISATION + LANCEMENT ---- */
  console.log('\n-- 2. le lancement, chemin complet --');
  const ethTresor0 = await sm.getAccount(adr(TRESOR)).then((a) => (a ? a.balance : 0n));
  const selX = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  const creer = (salt, nom) => iface.encodeFunctionData('createToken', [{ name: nom, symbol: nom.toUpperCase().slice(0, 6), salt, telegram: '', twitter: '', website: '', logo: '' }]);
  const moins = await appel(vm, { de: MOI, a: FUN, data: creer(selX, 'Moins'), valeur: FRAIS.toBigInt() - 1n });
  ok(!!moins.execResult.exceptionError && /creation fee/.test(motif(moins)), 'un wei de MOINS que le frais : refuse (« creation fee »)');
  const plus = await appel(vm, { de: MOI, a: FUN, data: creer(selX, 'Plus'), valeur: FRAIS.toBigInt() + 1n });
  ok(!!plus.execResult.exceptionError && /creation fee/.test(motif(plus)), 'un wei de PLUS : refuse aussi — aucune monnaie a rendre, donc aucun envoi vers l appelant');

  const sel = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  const dataCreate = iface.encodeFunctionData('createToken', [{
    name: 'Banc Test', symbol: 'BANC', salt: sel,
    telegram: '', twitter: '', website: '', logo: '',
  }]);
  /* On ecoute chaque APPEL SORTANT et chaque revert : quand un lancement
     echoue, ce qui compte est de savoir A QUI le contrat parlait au moment
     de tomber. Sans ca, « revert » ne designe rien. */
  const pile = [];
  const espion = (msg) => {
    pile.push({ a: msg.to ? msg.to.toString() : '(creation)', sel: msg.data && msg.data.length >= 4
      ? bytesToHex(msg.data.slice(0, 4)) : '0x', prof: msg.depth });
  };
  let curseur = 0;
  const espion2 = (res) => {
    const c = pile[curseur++]; if (!c) return;
    c.res = res && res.execResult && res.execResult.exceptionError
      ? ('ECHEC ' + (res.execResult.exceptionError.error || res.execResult.exceptionError))
      : 'ok';
  };
  vm.evm.events && vm.evm.events.on('beforeMessage', espion);
  vm.evm.events && vm.evm.events.on('afterMessage', espion2);
  const cr = await appel(vm, { de: MOI, a: FUN, data: dataCreate, valeur: FRAIS.toBigInt() });
  vm.evm.events && vm.evm.events.removeListener('beforeMessage', espion);
  vm.evm.events && vm.evm.events.removeListener('afterMessage', espion2);
  const raison = motif(cr);
  ok(!cr.execResult.exceptionError, 'createToken s execute' + (raison ? ' — ' + raison : ''));
  if (cr.execResult.exceptionError) {
    console.log('\n*** LE LANCEMENT ECHOUE SUR LA VRAIE CHAINE ***');
    console.log('    ', raison);
    console.log('\n     derniers appels sortants (le dernier est celui qui tombe) :');
    pile.slice(-12).forEach((c) => console.log('       prof ' + c.prof + '  ' + c.a + '  ' + c.sel
      + '   -> ' + (c.res || '(pas de resultat)')));
    console.log(`\n${n} verifications, ${echecs} echec(s)`);
    process.exit(1);
  }
  const JETON = ethers.utils.getAddress('0x' + bytesToHex(cr.execResult.returnValue).slice(-40));
  console.log('     jeton =', JETON);
  /* Le COUT REEL d'un lancement. C'est ce chiffre, et non le frais, qui dit
     ce qu'un robot doit payer pour inonder le launchpad. */
  gazLancement = cr.execResult.executionGasUsed || 0n;
  console.log('     gaz du lancement =', gazLancement.toString());
  avancer(2n);   // le V4 n'a plus de fenetre anti-snipe : on avance quand meme, comme une vraie chaine

  /* ---- 3. CE QUE LE LANCEMENT A REELLEMENT PRODUIT ---- */
  console.log('\n-- 3. l etat apres lancement --');
  const inst = iface.decodeFunctionResult('instant', await lire(FUN, iface.encodeFunctionData('instant', [JETON])));
  ok(inst.exists === true, 'le jeton est enregistre');
  ok(inst.pool !== ethers.constants.AddressZero, 'un pool Uniswap existe : ' + inst.pool);
  ok(inst.lpTokenId.gt(0), 'un NFT de liquidite a ete emis (#' + inst.lpTokenId.toString() + ')');

  const proprio = await lire(PM, ierc.encodeFunctionData('ownerOf', [inst.lpTokenId]));
  const propAdr = proprio ? ethers.utils.getAddress('0x' + proprio.slice(-40)) : null;
  ok(propAdr && propAdr.toLowerCase() === FUN.toLowerCase(),
     'le NFT appartient au launchpad — la liquidite est bloquee : ' + propAdr);

  const enPool = BigInt(await lire(JETON, ierc.encodeFunctionData('balanceOf', [inst.pool])));
  const total  = BigInt(await lire(JETON, ierc.encodeFunctionData('totalSupply', [])));
  ok(total === ethers.utils.parseEther('1000000000').toBigInt(), 'offre de 1 milliard');
  const part = Number(enPool * 10000n / total) / 100;
  ok(part > 99, `l offre entiere est dans le pool (${part.toFixed(2)} %) — aucun sac pour le createur`);
  const auCreateur = BigInt(await lire(JETON, ierc.encodeFunctionData('balanceOf', [MOI])));
  ok(auCreateur === 0n, 'le createur ne recoit AUCUN jeton');
  const resteLance = BigInt(await lire(JETON, ierc.encodeFunctionData('balanceOf', [FUN])));
  ok(resteLance === 0n, 'le launchpad ne garde aucun jeton apres le lancement (le reste d arrondi du mint est brule)');

  const ethTresor1 = await sm.getAccount(adr(TRESOR)).then((a) => (a ? a.balance : 0n));
  const ethFun = await sm.getAccount(adr(FUN)).then((a) => (a ? a.balance : 0n));
  ok(ethTresor1 - ethTresor0 === FRAIS.toBigInt(), 'le tresor a recu EXACTEMENT le frais : 0,0001 ETH');
  ok(ethFun === 0n, 'le launchpad ne garde aucun ETH');
  const resteMoi = BigInt(await lire(SWOGE, ierc.encodeFunctionData('balanceOf', [MOI])));
  ok(resteMoi === dot, 'aucun $SWOGE n est touche : ce contrat ne connait plus le $SWOGE');

  /* ---- 4. LE JETON EST NU ----
     Ce qu'un scanner lit : le bytecode deploye et les fonctions exposees. On
     lit le code REELLEMENT deploye par le launchpad dans le fork, et on le
     desassemble en sautant les donnees des PUSH : un octet 0xF1 dans une
     constante n'est pas un CALL. */
  console.log('\n-- 4. le jeton lance est un ERC-20 nu --');
  const code = await sm.getCode(adr(JETON));
  /* Les METADONNEES de solc (CBOR, hash de la source) terminent le bytecode ; leur longueur est
     ecrite dans les deux derniers octets. Elles ne s'executent jamais (le code s'arrete avant, sur
     INVALID) mais contiennent des octets quelconques : le 29/09, un 0xf5 au rang 1515 du jumeau WETH,
     DANS les 53 octets de metadonnees, faisait croire a un CREATE2. On ne lit que le code executable. */
  const finCode = code.length - 2 - ((code[code.length - 2] << 8) | code[code.length - 1]);
  const ops = {};
  for (let k = 0; k < finCode; k++) {
    const op = code[k];
    if (op >= 0x60 && op <= 0x7f) { k += op - 0x5f; continue; }
    if ([0xf0, 0xf1, 0xf2, 0xf4, 0xf5, 0xfa, 0xff].includes(op)) ops[op.toString(16)] = (ops[op.toString(16)] || 0) + 1;
  }
  ok(code.length > 0 && finCode > 0 && finCode < code.length && Object.keys(ops).length === 0,
     'aucun CALL, DELEGATECALL, STATICCALL, CREATE ni SELFDESTRUCT dans le jeton deploye (' + code.length + ' octets)');
  const itok = new ethers.utils.Interface(tokAbi);
  const fonctions = Object.values(itok.functions).map((f) => f.name).sort();
  ok(fonctions.join(',') === 'allowance,approve,balanceOf,decimals,name,owner,symbol,totalSupply,transfer,transferFrom',
     'ses seules fonctions : l ERC-20 et owner() — ni setPool, ni fun, ni mint [' + fonctions.join(',') + ']');
  const own = await lire(JETON, itok.encodeFunctionData('owner', []));
  ok(own && BigInt(own) === 0n, 'owner() rend l adresse zero — « renounced » lisible par un scanner');

  /* ---- 5. UNE RECOLTE A VIDE NE DEPLACE RIEN ---- */
  console.log('\n-- 5. recolte a vide --');
  const tresorAvant = BigInt(await lire(WETH, ierc.encodeFunctionData('balanceOf', [TRESOR])));
  const col = await appel(vm, { de: MOI, a: FUN, data: iface.encodeFunctionData('collectFees', [JETON]) });
  ok(!col.execResult.exceptionError, 'collectFees s execute sur un pool neuf' + (motif(col) ? ' — ' + motif(col) : ''));
  ok(BigInt(await lire(WETH, ierc.encodeFunctionData('balanceOf', [TRESOR]))) === tresorAvant, 'rien ne bouge sur une recolte vide');

  /* ================================================================
     6. LE CHEMIN DES FRAIS, EN ENTIER, AVEC UN ACHETEUR QUI N'EST PAS
        LE CREATEUR — sinon on ne distinguerait pas la part du createur de
        ce que l'acheteur recoit.
     ================================================================ */
  const ACHETEUR = '0x00000000000000000000000000000000000B0B00';
  const garnir = async (qui, montant) => {
    const k = hexToBytes('0x' + keccak256(Buffer.from(
      qui.slice(2).toLowerCase().padStart(64, '0') + SLOT_SOLDES.toString(16).padStart(64, '0'), 'hex')));
    await sm.putStorage(adr(SWOGE), k, setLengthLeft(bigIntToBytes(montant), 32));
    await sm.modifyAccountFields(adr(qui), { balance: ethers.utils.parseEther('10').toBigInt() });
  };
  const soldeS = async (qui) => BigInt(await lire(SWOGE, ierc.encodeFunctionData('balanceOf', [qui])));
  const soldeW = async (qui) => BigInt(await lire(WETH, ierc.encodeFunctionData('balanceOf', [qui])));
  /* L'acheteur paie en WETH : il en obtient comme tout le monde, par deposit() sur le vrai WETH9. */
  const envelopper = async (qui, montant) => {
    await sm.modifyAccountFields(adr(qui), { balance: ethers.utils.parseEther('10').toBigInt() });
    return appel(vm, { de: qui, a: WETH, data: '0xd0e30db0', valeur: montant });
  };
  const soldeJ = async (qui) => BigInt(await lire(JETON, ierc.encodeFunctionData('balanceOf', [qui])));
  async function echanger(de, entree, sortie, montant) {
    const a = await appel(vm, { de, a: entree, data: ierc.encodeFunctionData('approve', [ROUTER, montant]) });
    if (a.execResult.exceptionError) return { err: 'approve : ' + motif(a) };
    const r = await appel(vm, { de, a: ROUTER, data: routeur.encodeFunctionData('exactInputSingle', [{
      tokenIn: entree, tokenOut: sortie, fee: 10000, recipient: de,
      amountIn: montant, amountOutMinimum: 0, sqrtPriceLimitX96: 0 }]) });
    return r.execResult.exceptionError ? { err: motif(r) } : { ok: true };
  }

  console.log('\n-- 6. un acheteur achete, on recolte : 50 % createur, 50 % tresor, le jeton brule --');
  const dep2 = await envelopper(ACHETEUR, ethers.utils.parseEther('2').toBigInt());
  ok(!dep2.execResult.exceptionError && (await soldeW(ACHETEUR)) === ethers.utils.parseEther('2').toBigInt(), 'l acheteur enveloppe 2 ETH en WETH sur le vrai WETH9');
  const achat = await echanger(ACHETEUR, WETH, JETON, ethers.utils.parseEther('0.3').toBigInt());
  ok(achat.ok, 'l achat de 0,3 WETH par le routeur Uniswap passe — aucune fenetre anti-snipe a attendre' + (achat.err ? ' — ' + achat.err : ''));
  const recu = await soldeJ(ACHETEUR);
  ok(recu > 0n, 'l acheteur recoit des jetons (' + ethers.utils.formatEther(recu.toString()).slice(0, 14) + ')');
  /* Une vente, pour que des frais existent AUSSI dans le jeton (ceux qu'on brule). */
  const vente = await echanger(ACHETEUR, JETON, WETH, recu / 4n);
  ok(vente.ok, 'LA REVENTE PASSE — le jeton se revend par le meme routeur' + (vente.err ? ' — ' + vente.err : ''));

  const cAv = await soldeW(MOI), tAv = await soldeW(TRESOR), dAv = await soldeJ(DEAD);
  const c1 = await appel(vm, { de: ACHETEUR, a: FUN, data: iface.encodeFunctionData('collectFees', [JETON]) });
  ok(!c1.execResult.exceptionError, 'la recolte passe, declenchee par N IMPORTE QUI (ici l acheteur)' + (motif(c1) ? ' — ' + motif(c1) : ''));
  const pourCreateur = (await soldeW(MOI)) - cAv, pourTresor = (await soldeW(TRESOR)) - tAv, brulesJ = (await soldeJ(DEAD)) - dAv;
  ok(pourCreateur > 0n && pourTresor > 0n, 'le createur (' + ethers.utils.formatEther(pourCreateur.toString()).slice(0, 10)
     + ' WETH) et le tresor (' + ethers.utils.formatEther(pourTresor.toString()).slice(0, 10) + ' WETH) sont payes');
  const ecart = pourCreateur > pourTresor ? pourCreateur - pourTresor : pourTresor - pourCreateur;
  ok(ecart <= 1n, 'le partage est exactement 50 / 50 (a 1 wei d arrondi pres)');
  ok(brulesJ > 0n, 'la part des frais percue en jeton est BRULEE (' + ethers.utils.formatEther(brulesJ.toString()).slice(0, 12) + ' jetons vers DEAD)');
  ok((await soldeJ(FUN)) === 0n && (await soldeW(FUN)) === 0n && (await soldeS(FUN)) === 0n, 'le launchpad ne garde RIEN apres une recolte — ni jeton, ni WETH, ni $SWOGE');

  console.log('\n-- 7. un transfert entre portefeuilles : le montant exact, rien d autre --');
  const AUTRE = '0x00000000000000000000000000000000000C0C00';
  const avJ = await soldeJ(ACHETEUR), montantT = avJ / 3n;
  const tr = await appel(vm, { de: ACHETEUR, a: JETON, data: ierc.encodeFunctionData('transfer', [AUTRE, montantT]) });
  ok(!tr.execResult.exceptionError, 'le transfert passe');
  ok((await soldeJ(AUTRE)) === montantT && (await soldeJ(ACHETEUR)) === avJ - montantT, 'aucune taxe : le destinataire recoit exactement ce qui part');

  const proprio2 = await lire(PM, ierc.encodeFunctionData('ownerOf', [inst.lpTokenId]));
  ok(proprio2 && ethers.utils.getAddress('0x' + proprio2.slice(-40)).toLowerCase() === FUN.toLowerCase(),
     'apres achats, ventes et recolte : le NFT de liquidite est TOUJOURS au launchpad');

  const recharger = async () => sm.putStorage(adr(SWOGE), cle, setLengthLeft(bigIntToBytes(dot), 32));
  await recharger();
  const lancer = async (salt) => {
    const r = await appel(vm, { de: MOI, a: FUN, valeur: FRAIS.toBigInt(), data: iface.encodeFunctionData('createToken', [{
      name: 'Deux', symbol: 'DEUX', salt, telegram: '', twitter: '', website: '', logo: '' }]) });
    return r.execResult.exceptionError
      ? { err: motif(r) }
      : { jeton: ethers.utils.getAddress('0x' + bytesToHex(r.execResult.returnValue).slice(-40)) };
  };
  const sel2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  const l2 = await lancer(sel2);
  ok(!!l2.jeton, 'un second jeton se lance' + (l2.err ? ' — ' + l2.err : ''));

  /* ================================================================
     11. UN LANCEMENT BLOQUE SE RELANCE (le correctif du brique)
     Avec un CREATE ordinaire, une tentative ratee empoisonnait l'adresse
     suivante POUR TOUJOURS. Avec CREATE2, l'adresse depend du sel : on
     verifie qu'un sel deja consomme echoue proprement, et qu'un autre sel
     passe. C'est toute la difference entre un launchpad mort et un
     lancement a refaire.
     ================================================================ */
  console.log('\n-- 11. le sel rend le lancement rejouable --');
  await recharger();
  const rejeu = await lancer(sel2);                       // MEME sel, MEME appelant
  ok(!!rejeu.err, 'relancer avec le MEME sel echoue proprement : ' + (rejeu.err || '(a reussi !)'));
  await recharger();
  const autre = await lancer(ethers.utils.hexlify(ethers.utils.randomBytes(32)));
  ok(!!autre.jeton, 'relancer avec un AUTRE sel passe — le launchpad n est jamais brique'
     + (autre.err ? ' — ' + autre.err : ''));

  /* ================================================================
     12. L'AUTRE SENS DU POOL : LE JETON EN token0
     Le WETH est a 0x0Bd7... : ~95 % des jetons ont une adresse plus haute,
     le WETH est alors token0 et la plage est niee (c'est ce que les sections
     precedentes ont couvert). Le cas inverse — jeton token0, amorce a la
     borne BASSE — arrive ~1 fois sur 22 en production et doit marcher aussi.
     On cherche donc un sel dont l'adresse CREATE2 est sous le WETH, et on
     lance, achete et revend dans ce sens-la.
     ================================================================ */
  console.log('\n-- 12. l autre sens : jeton token0 (adresse sous le WETH) --');
  const initCode = '0x' + tokBin + ethers.utils.defaultAbiCoder.encode(['string', 'string', 'uint256'], ['Bas', 'BAS', ethers.utils.parseEther('1000000000')]).slice(2);
  const hInit = ethers.utils.keccak256(initCode);
  let selBas = null, predit = null;
  for (let k = 0; k < 5000 && !selBas; k++) {
    const sl = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    const a = ethers.utils.getCreate2Address(FUN, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [MOI, sl])), hInit);
    if (a.toLowerCase() < WETH.toLowerCase()) { selBas = sl; predit = a; }
  }
  ok(!!selBas, 'un sel donnant une adresse sous le WETH est trouve : ' + predit);
  await recharger();
  const rb = await appel(vm, { de: MOI, a: FUN, valeur: FRAIS.toBigInt(), data: iface.encodeFunctionData('createToken', [{
    name: 'Bas', symbol: 'BAS', salt: selBas, telegram: '', twitter: '', website: '', logo: '' }]) });
  const JB = rb.execResult.exceptionError ? null : ethers.utils.getAddress('0x' + bytesToHex(rb.execResult.returnValue).slice(-40));
  ok(JB && JB === predit, 'le lancement passe, a l adresse predite (jeton token0)' + (motif(rb) ? ' — ' + motif(rb) : ''));
  if (JB) {
    const ib = iface.decodeFunctionResult('instant', await lire(FUN, iface.encodeFunctionData('instant', [JB])));
    const enPoolB = BigInt(await lire(JB, ierc.encodeFunctionData('balanceOf', [ib.pool])));
    ok(enPoolB * 10000n / ethers.utils.parseEther('1000000000').toBigInt() > 9900n, 'l offre entiere est dans le pool, dans ce sens aussi');
    await envelopper(ACHETEUR, ethers.utils.parseEther('1').toBigInt());
    const avB = BigInt(await lire(JB, ierc.encodeFunctionData('balanceOf', [ACHETEUR])));
    const achB = await echanger(ACHETEUR, WETH, JB, ethers.utils.parseEther('0.3').toBigInt());
    const recuB = BigInt(await lire(JB, ierc.encodeFunctionData('balanceOf', [ACHETEUR]))) - avB;
    ok(achB.ok && recuB > 0n, 'l achat de 0,3 WETH passe (' + ethers.utils.formatEther(recuB.toString()).slice(0, 12) + ' jetons)' + (achB.err ? ' — ' + achB.err : ''));
    /* Meme prix de depart dans les deux sens : 0,3 WETH doit acheter la meme part (a 1 % pres). */
    ok(recu > 0n && recuB > 0n && Math.abs(Number(recuB) / Number(recu) - 1) < 0.01,
       'meme prix de depart que dans l autre sens : ' + ethers.utils.formatEther(recuB.toString()).slice(0, 12) + ' contre ' + ethers.utils.formatEther(recu.toString()).slice(0, 12));
    const venB = await echanger(ACHETEUR, JB, WETH, recuB / 4n);
    ok(venB.ok, 'la revente passe dans ce sens aussi' + (venB.err ? ' — ' + venB.err : ''));
    const cB = await soldeW(MOI), tB = await soldeW(TRESOR);
    const colB = await appel(vm, { de: ACHETEUR, a: FUN, data: iface.encodeFunctionData('collectFees', [JB]) });
    const pc = (await soldeW(MOI)) - cB, pt = (await soldeW(TRESOR)) - tB;
    ok(!colB.execResult.exceptionError && pc > 0n && (pc > pt ? pc - pt : pt - pc) <= 1n, 'la recolte partage le WETH 50/50 dans ce sens aussi');
  }

  if (relais.abandons > 0) {
    echecs++;
    console.log('\n  RATE le noeud a abandonne ' + relais.abandons + ' requete(s) — les resultats ci-dessus'
      + ' portent sur un etat INCOMPLET et ne doivent pas etre crus.');
  } else if (relais.replis > 0) {
    console.log('\n     NOTE : le bloc d ancrage a ete elague par le noeud en cours d essai ; '
      + relais.replis + ' lecture(s) ont bascule sur le bloc courant.'
      + '\n     Les contrats concernes sont de l infrastructure figee, mais l essai n est'
      + '\n     donc PAS reproductible a l identique — c est la limite d un noeud sans archive.');
  } else if (relais.reprises > 0) {
    console.log('\n     (' + relais.reprises + ' requete(s) ont demande une reprise ; aucune perdue)');
  }
  console.log(`\n${n} verifications, ${echecs} echec(s)`);
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error('\nERREUR DU BANC :', e && (e.stack || e.message || e)); process.exit(1); });
