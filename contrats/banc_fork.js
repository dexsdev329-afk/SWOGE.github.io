'use strict';
/*
 * LE BANC D'ESSAI SUR FORK — SwogeFunV3
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
const DEAD     = '0x000000000000000000000000000000000000dEaD';
const FRAIS    = ethers.utils.parseEther('10000');                // frais de lancement, tranche avant deploiement
const SLOT_SOLDES = 0;                                            // `_balances` du $SWOGE, trouve par recoupement

let n = 0, echecs = 0, gazLancement = 0n;
const ok = (c, m) => { if (c) { n++; console.log('  ok   ' + m); }
                       else { echecs++; console.log('  RATE ' + m); } };

/* ---------- compilation ---------- */
function compiler() {
  const solc = require(path.join(process.env.S, 'node_modules', 'solc'));
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, 'SwogeFunV3.sol'), 'utf8');
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity', sources: { 'SwogeFunV3.sol': { content: src } },
    settings: { optimizer: { enabled: true, runs: 200 },
                outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } }
  })));
  const err = (out.errors || []).filter((e) => e.severity === 'error');
  if (err.length) { console.log('compilation impossible :', err[0].formattedMessage); process.exit(1); }
  const c = out.contracts['SwogeFunV3.sol'];
  return { abi: c.SwogeFunV3.abi, bin: c.SwogeFunV3.evm.bytecode.object, tokAbi: c.SwogeToken.abi };
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
  console.log('\n=== BANC D\'ESSAI SUR FORK — SwogeFunV3 ===\n');
  const { abi, bin, tokAbi } = compiler();
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
    ['address', 'address', 'address', 'uint256'], [PM, SWOGE, TRESOR, FRAIS]).slice(2);
  const dep = await appel(vm, { de: MOI, a: null, data: '0x' + bin + args });
  const FUN = dep.createdAddress ? '0x' + dep.createdAddress.toString().slice(2) : null;
  ok(!dep.execResult.exceptionError && FUN, 'le launchpad se deploie' + (dep.execResult.exceptionError ? ' — ' + motif(dep) : ''));
  if (!FUN) { console.log('\narret : rien a essayer sans contrat.'); process.exit(1); }
  console.log('     launchpad =', FUN);

  /* ---- 2. AUTORISATION + LANCEMENT ---- */
  console.log('\n-- 2. le lancement, chemin complet --');
  const ap = await appel(vm, { de: MOI, a: SWOGE, data: ierc.encodeFunctionData('approve', [FUN, FRAIS]) });
  ok(!ap.execResult.exceptionError, 'l autorisation du frais passe');

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
  const cr = await appel(vm, { de: MOI, a: FUN, data: dataCreate });
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
  avancer(5n);   // la fenetre anti-snipe dure 2 blocs : on la laisse se refermer

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

  const brule = BigInt(await lire(SWOGE, ierc.encodeFunctionData('balanceOf', [DEAD])));
  const resteMoi = BigInt(await lire(SWOGE, ierc.encodeFunctionData('balanceOf', [MOI])));
  ok(resteMoi === dot - FRAIS.toBigInt(), 'le frais de 10 000 $SWOGE a bien ete preleve');
  ok(brule > 0n, 'le frais est parti vers DEAD (brule), pas dans une poche');

  /* ---- 4. shares() AU LANCEMENT : la valeur qui a motive la retenue ---- */
  console.log('\n-- 4. la base de repartition au lancement --');
  const sh = BigInt(await lire(FUN, iface.encodeFunctionData('shares', [JETON])));
  ok(sh === 0n, 'shares() vaut exactement zero au lancement — ce que l audit annoncait');

  /* ---- 5. UNE RECOLTE A VIDE NE DOIT RIEN DETOURNER ---- */
  console.log('\n-- 5. recolte a vide : la retenue, pas le tresor --');
  const tresorAvant = BigInt(await lire(SWOGE, ierc.encodeFunctionData('balanceOf', [TRESOR])));
  const col = await appel(vm, { de: MOI, a: FUN, data: iface.encodeFunctionData('collectFees', [JETON]) });
  ok(!col.execResult.exceptionError, 'collectFees s execute sur un pool neuf' + (motif(col) ? ' — ' + motif(col) : ''));
  const tresorApres = BigInt(await lire(SWOGE, ierc.encodeFunctionData('balanceOf', [TRESOR])));
  ok(tresorApres === tresorAvant, 'aucun $SWOGE n a file au tresor sur une recolte vide');

  /* ================================================================
     6. LE CHEMIN DES FRAIS, EN ENTIER

     C'est le coeur de l'economie du contrat, et rien ne l'avait jamais
     exercee. On achete VRAIMENT par le routeur Uniswap, ce qui cree de vrais
     frais dans le pool ; puis on recolte, et on regarde ou l'argent va.

     Les deux branches de `_distributeToHolders` sont essayees separement,
     parce que c'est exactement la ou mon premier correctif etait FAUX : un
     achat sous le plancher doit METTRE EN RETENUE, jamais verser au tresor.
     ================================================================ */
  async function acheter(montant) {
    const a = await appel(vm, { de: MOI, a: SWOGE, data: ierc.encodeFunctionData('approve', [ROUTER, montant]) });
    if (a.execResult.exceptionError) return { err: 'approve : ' + motif(a) };
    const r = await appel(vm, { de: MOI, a: ROUTER, data: routeur.encodeFunctionData('exactInputSingle', [{
      tokenIn: SWOGE, tokenOut: JETON, fee: 10000, recipient: MOI,
      amountIn: montant, amountOutMinimum: 0, sqrtPriceLimitX96: 0 }]) });
    return r.execResult.exceptionError ? { err: motif(r) } : { ok: true };
  }
  const lireU = async (nom, args) => BigInt(await lire(FUN, iface.encodeFunctionData(nom, args)));

  console.log('\n-- 6. un achat SOUS le plancher : la part doit etre mise en retenue --');
  const petit = ethers.utils.parseEther('20000').toBigInt();
  const a1 = await acheter(petit);
  ok(a1.ok, 'l achat par le routeur Uniswap passe' + (a1.err ? ' — ' + a1.err : ''));
  if (a1.ok) {
    const recu = BigInt(await lire(JETON, ierc.encodeFunctionData('balanceOf', [MOI])));
    ok(recu > 0n, 'l acheteur recoit des jetons (' + ethers.utils.formatEther(recu.toString()).slice(0, 12) + ')');
    const sh1 = await lireU('shares', [JETON]);
    const plancher = total / 100n;                       // MIN_FLOTTANT_BPS = 100 => 1 %
    ok(sh1 > 0n && sh1 < plancher, 'le flottant est reel mais sous le plancher de 1 %');

    const tAv = BigInt(await lire(SWOGE, ierc.encodeFunctionData('balanceOf', [TRESOR])));
    const c1 = await appel(vm, { de: MOI, a: FUN, data: iface.encodeFunctionData('collectFees', [JETON]) });
    ok(!c1.execResult.exceptionError, 'la recolte passe' + (motif(c1) ? ' — ' + motif(c1) : ''));
    const tAp = BigInt(await lire(SWOGE, ierc.encodeFunctionData('balanceOf', [TRESOR])));
    const carry1 = await lireU('carry', [JETON]);
    const mps1 = await lireU('magPerShare', [JETON]);
    ok(tAp > tAv, 'le tresor touche sa part de 30 % (' + ethers.utils.formatEther((tAp - tAv).toString()).slice(0, 10) + ' $SWOGE)');
    ok(carry1 > 0n, 'LA RETENUE EST ALIMENTEE — la part des detenteurs n est pas detournee');
    ok(mps1 === 0n, 'rien n est encore reparti (personne au-dessus du plancher)');

    /* La verification qui aurait pris mon premier correctif en flagrant delit :
       la part des detenteurs ne doit PAS avoir grossi le tresor. */
    const partTresor = tAp - tAv;
    const ratio = Number(partTresor * 10000n / (partTresor + carry1)) / 100;
    ok(Math.abs(ratio - 30) < 1.5, `le tresor a bien pris ~30 %, pas davantage (${ratio.toFixed(1)} %)`);

    console.log('\n-- 7. un achat qui FRANCHIT le plancher : la retenue se deverse --');
    const gros = ethers.utils.parseEther('300000').toBigInt();
    const a2 = await acheter(gros);
    ok(a2.ok, 'un achat de 300 000 $SWOGE passe hors fenetre anti-snipe' + (a2.err ? ' — ' + a2.err : ''));
    if (a2.ok) {
      const sh2 = await lireU('shares', [JETON]);
      ok(sh2 >= plancher, 'le flottant depasse maintenant le plancher');
      const c2 = await appel(vm, { de: MOI, a: FUN, data: iface.encodeFunctionData('collectFees', [JETON]) });
      ok(!c2.execResult.exceptionError, 'la seconde recolte passe' + (motif(c2) ? ' — ' + motif(c2) : ''));
      const carry2 = await lireU('carry', [JETON]);
      const mps2 = await lireU('magPerShare', [JETON]);
      const res2 = await lireU('reserve', [JETON]);
      ok(mps2 > 0n, 'la repartition a enfin lieu (magPerShare > 0)');
      ok(carry2 === 0n, 'LA RETENUE EST VIDEE — rien n est reste bloque');
      ok(res2 >= carry1, 'la caisse contient au moins ce qui avait ete mis de cote');

      console.log('\n-- 8. un detenteur reclame ce qui lui revient --');
      const du = BigInt(await lire(FUN, iface.encodeFunctionData('pendingRewards', [JETON, MOI])));
      ok(du > 0n, 'le detenteur a une creance (' + ethers.utils.formatEther(du.toString()).slice(0, 10) + ' $SWOGE)');
      const avant = BigInt(await lire(SWOGE, ierc.encodeFunctionData('balanceOf', [MOI])));
      const rc = await appel(vm, { de: MOI, a: FUN, data: iface.encodeFunctionData('claimRewards', [JETON]) });
      ok(!rc.execResult.exceptionError, 'claimRewards passe' + (motif(rc) ? ' — ' + motif(rc) : ''));
      const apresR = BigInt(await lire(SWOGE, ierc.encodeFunctionData('balanceOf', [MOI])));
      ok(apresR - avant === du, 'le detenteur recoit EXACTEMENT sa creance');
      const du2 = BigInt(await lire(FUN, iface.encodeFunctionData('pendingRewards', [JETON, MOI])));
      ok(du2 === 0n, 'la creance retombe a zero — pas de double reclamation');

      console.log('\n-- 9. un transfert ne casse pas la comptabilite (onMove) --');
      const AUTRE = '0x00000000000000000000000000000000000B0B00';
      const solJ = BigInt(await lire(JETON, ierc.encodeFunctionData('balanceOf', [MOI])));
      const tr = await appel(vm, { de: MOI, a: JETON, data: ierc.encodeFunctionData('transfer', [AUTRE, solJ / 2n]) });
      ok(!tr.execResult.exceptionError, 'le transfert passe — `onMove` ne fait pas echouer un transfert');
      const dMoi = BigInt(await lire(FUN, iface.encodeFunctionData('pendingRewards', [JETON, MOI])));
      const dAutre = BigInt(await lire(FUN, iface.encodeFunctionData('pendingRewards', [JETON, AUTRE])));
      ok(dMoi === 0n && dAutre === 0n,
         'un transfert ne CREE pas de creance — le nouveau venu ne touche pas le passe');
    }
  }

  /* ================================================================
     10. LA GARDE ANTI-SNIPE MORD, ET ELLE SE RELACHE
     Une garde qu'on n'essaie pas est une garde qu'on suppose. On verifie les
     deux moities : elle refuse pendant la fenetre, elle laisse passer apres.
     ================================================================ */
  console.log('\n-- 10. l anti-snipe : il refuse pendant 2 blocs, puis se relache --');
  const recharger = async () => sm.putStorage(adr(SWOGE), cle, setLengthLeft(bigIntToBytes(dot), 32));
  await recharger();
  const lancer = async (salt) => {
    await appel(vm, { de: MOI, a: SWOGE, data: ierc.encodeFunctionData('approve', [FUN, FRAIS]) });
    const r = await appel(vm, { de: MOI, a: FUN, data: iface.encodeFunctionData('createToken', [{
      name: 'Deux', symbol: 'DEUX', salt, telegram: '', twitter: '', website: '', logo: '' }]) });
    return r.execResult.exceptionError
      ? { err: motif(r) }
      : { jeton: ethers.utils.getAddress('0x' + bytesToHex(r.execResult.returnValue).slice(-40)) };
  };
  const sel2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  const l2 = await lancer(sel2);
  ok(!!l2.jeton, 'un second jeton se lance' + (l2.err ? ' — ' + l2.err : ''));
  if (l2.jeton) {
    const gros2 = ethers.utils.parseEther('600000').toBigInt();
    const achatFenetre = async (jeton, montant) => {
      await appel(vm, { de: MOI, a: SWOGE, data: ierc.encodeFunctionData('approve', [ROUTER, montant]) });
      const r = await appel(vm, { de: MOI, a: ROUTER, data: routeur.encodeFunctionData('exactInputSingle', [{
        tokenIn: SWOGE, tokenOut: jeton, fee: 10000, recipient: MOI,
        amountIn: montant, amountOutMinimum: 0, sqrtPriceLimitX96: 0 }]) });
      return !r.execResult.exceptionError;
    };
    ok(!(await achatFenetre(l2.jeton, gros2)),
       'DANS la fenetre, un portefeuille ne peut pas depasser 5 % de l offre');
    avancer(5n);
    ok(await achatFenetre(l2.jeton, gros2),
       'APRES la fenetre, le meme achat passe — la garde est temporaire, pas un piege');
  }

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
