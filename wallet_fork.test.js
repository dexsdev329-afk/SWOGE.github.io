'use strict';
/*
 * LES CINQ ROUTES DU PORTEFEUILLE, EXECUTEES SUR UN FORK DE LA VRAIE CHAINE
 *
 * Un devis n'est pas une preuve : `getAmountsOut` lit des reserves, il
 * n'echange rien. Ce qui reste a demontrer, c'est que la TRANSACTION que
 * la page va faire signer au joueur s'execute — le bon routeur, le bon
 * encodage, la bonne autorisation, et un `amountOutMinimum` qui n'est pas
 * zero. Ici on execute le vrai bytecode contre le vrai etat.
 */
const path = require('path');
const { bac: bacDeLaPage, trouveEthers } = require('./wallet_extrait.js');

/* ---- CE BANC DEMANDE UNE MACHINE EVM ----
 * `@ethereumjs/vm` n'est pas dans ce depot : il sert a essayer, pas a
 * servir la page. Quand il manque, on le DIT et on se saute, plutot que
 * de faire croire a une preuve qui n'a pas tourne. */
const OU = [process.env.EVM_MODULES,
            path.join(__dirname, 'node_modules')].filter(Boolean);
function prends(nom){
  for(const d of OU){ try{ return require(path.join(d, nom)); }catch(e){} }
  try{ return require(nom); }catch(e){ return null; }
}
const ethers = trouveEthers();
const sha3 = prends('js-sha3');
const M_VM  = prends('@ethereumjs/vm');
const M_SM  = prends('@ethereumjs/statemanager');
const M_CO  = prends('@ethereumjs/common');
const M_UT  = prends('@ethereumjs/util');
if(!ethers || !sha3 || !M_VM || !M_SM || !M_CO || !M_UT){
  console.log('wallet_fork.test.js : pas de machine EVM ici (@ethereumjs absent) — essai saute.');
  console.log('  Pour le relancer : npm i @ethereumjs/vm @ethereumjs/statemanager @ethereumjs/common'
            + ' @ethereumjs/util js-sha3, puis EVM_MODULES=<chemin>/node_modules node wallet_fork.test.js');
  console.log('  Le journal de la derniere execution reelle est dans wallet_routes.prouve.json,');
  console.log('  et wallet_routes.test.js verifie que la page n en a pas devie.');
  process.exit(0);
}
const { keccak256 } = sha3;
const { createVM } = M_VM;
const { RPCStateManager } = M_SM;
const { Common, Mainnet, Hardfork } = M_CO;
const { createAddressFromString, hexToBytes, bytesToHex, setLengthLeft, bigIntToBytes } = M_UT;
const UTIL = (function(){
  for(const d of OU){
    try{ return require(path.join(d, '@ethereumjs/util/dist/cjs/provider.js')); }catch(e){}
  }
  throw new Error('provider.js de @ethereumjs/util introuvable');
})();

/* ---- LE NOEUD LIMITE, ET LE FORK RELIT CINQ FOIS LA MEME CHOSE ----
 * Chaque route repart d'un fork neuf, donc chaque route redemande au
 * noeud le meme code et les memes cases de stockage. Au bout de deux
 * routes il repond 429 et l'essai s'arrete au milieu — un echec qui n'a
 * rien a voir avec l'echange qu'on cherche a prouver.
 * L'etat lu est celui d'UN bloc fige : il ne peut pas changer entre deux
 * lectures. On le retient donc, et on repasse la main au noeud avec une
 * attente croissante quand il refuse. */
const CACHE = new Map();
const brut = UTIL.fetchFromProvider;
const dodo = (ms)=>new Promise(r=>setTimeout(r,ms));
let appelsNoeud=0, servisDuCache=0;
Object.defineProperty(UTIL, 'fetchFromProvider', { configurable:true, value: async function(url, params){
  const cle = params.method+'|'+JSON.stringify(params.params);
  if(CACHE.has(cle)){ servisDuCache++; return CACHE.get(cle); }
  let dernier=null;
  for(let essai=0; essai<7; essai++){
    try{
      const r = await brut(url, params);
      appelsNoeud++;
      CACHE.set(cle, r);
      return r;
    }catch(e){
      dernier=e;
      if(!/429|Too Many Requests|ECONNRESET|socket hang up/i.test(String(e.message||''))) throw e;
      await dodo(400 * Math.pow(2, essai));
    }
  }
  throw dernier;
}});

const RPC='https://rpc.mainnet.chain.robinhood.com';
const WETH='0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
const SWOGE='0x8a166Fb41Cd659a0a43396272FF73973Ce29F817';
const SWOGEBET='0xc0aEd547862fba5D7D9Fbf3cb14204cD756c8Bea';
const R02='0xcaf681a66d020601342297493863e78c959e5cb2';
const V2R='0x89e5db8b5aa49aa85ac63f691524311aeb649eba';
const QUOTER='0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7';
const FRAIS=10000;
const ADDRESS_THIS='0x0000000000000000000000000000000000000002';
const MOI='0x00000000000000000000000000000000000A11CE';

/* ---- LE BANC EXECUTE LE CODE DE LA PAGE, PAS UNE COPIE ----
 *
 * Prouver qu'une transaction ECRITE ICI fonctionne ne dit rien de celle
 * que la page enverra : deux encodeurs ecrits l'un apres l'autre
 * divergent au premier changement. On sort donc `morceauxDe` de
 * swoge_wallet.html et c'est LUI qu'on execute sur le fork. Si la page
 * change de forme, ce banc le voit. */
const PAGE = path.join(__dirname, 'swoge_wallet.html');
const bac = bacDeLaPage(PAGE, ethers);
/* Chaque appel est CONSIGNE avec ses entrees et les octets produits : ce
   journal devient l'attendu d'un essai leger, sans fork ni reseau, qui
   verra la page deriver de ce qui a reellement tourne ici. */
const JOURNAL = [];
const morceauxDePage = (de,vers,entree,mini)=>{
  bac.pourQui(MOI.toLowerCase());
  const m = bac.morceauxDe(de,vers,entree,mini);
  JOURNAL.push({ de, vers,
    entree: ethers.BigNumber.from(entree).toString(),
    mini:   ethers.BigNumber.from(mini).toString(),
    moi:    MOI.toLowerCase(),
    morceaux: m });
  return m;
};
const moinsTolPage = (bn)=>bac.moinsTolerance(bn);

let n=0, echecs=0;
const ok=(c,m)=>{ if(c){n++;console.log('  ok   '+m);} else {echecs++;console.log('  RATE '+m);} };
const adr=(a)=>createAddressFromString(a.toLowerCase());

const IR02=new ethers.utils.Interface([
  'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[])',
  'function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to) payable returns (uint256)',
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)',
  'function unwrapWETH9(uint256 amountMinimum, address recipient) payable'
]);
const IERC=new ethers.utils.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)'
]);
const IV2=new ethers.utils.Interface(['function getAmountsOut(uint256,address[]) view returns (uint256[])']);
const IQ =new ethers.utils.Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)']);

async function appel(vm,{de,a,data,valeur}){
  return vm.evm.runCall({ caller:adr(de), to:a?adr(a):undefined, data:hexToBytes(data||'0x'),
    value:valeur||0n, gasLimit:30000000n, isStatic:false, origin:adr(de) });
}
function motif(r){
  const ex=r.execResult; if(!ex.exceptionError) return null;
  let m=ex.exceptionError.error||String(ex.exceptionError);
  const rv=ex.returnValue;
  if(rv&&rv.length){
    const h=bytesToHex(rv);
    if(h.startsWith('0x08c379a0')){ try{ m+=' : '+ethers.utils.defaultAbiCoder.decode(['string'],'0x'+h.slice(10))[0]; }catch(e){} }
    else m+=' : '+h.slice(0,42);
  } else m+=' : aucune donnee';
  return m;
}
function caseSolde(qui, slot){
  return hexToBytes('0x'+keccak256(Buffer.from(
    qui.slice(2).toLowerCase().padStart(64,'0')+slot.toString(16).padStart(64,'0'),'hex')));
}

(async()=>{
  const prov=new ethers.providers.StaticJsonRpcProvider(RPC,4663);
  /* Trente blocs en arriere, et pas la tete : le RPC est un groupe de
     noeuds, et tous n'ont pas encore le dernier bloc. Fixer la tete fait
     repondre `null` a `eth_getProof` des qu'on tombe sur un noeud en
     retard — un echec qui ressemble a un defaut du script. */
  const bloc=(await prov.getBlockNumber())-30;
  console.log('\n=== LES CINQ ROUTES SUR FORK — bloc '+bloc+' ===\n');
  const common=new Common({chain:Mainnet, hardfork:Hardfork.Cancun});

  /* Chaque route part d'un fork NEUF : sinon la premiere deplace le prix
     et les suivantes mesurent un marche que la page ne verra jamais. */
  async function neuf(){
    const sm=new RPCStateManager({provider:RPC, blockTag:BigInt(bloc)});
    const vm=await createVM({common, stateManager:sm});
    await sm.modifyAccountFields(adr(MOI),{balance:ethers.utils.parseEther('10').toBigInt()});
    return {vm,sm};
  }
  const lire=(vm,a,data)=>appel(vm,{de:MOI,a,data}).then(r=>
    r.execResult.exceptionError?null:bytesToHex(r.execResult.returnValue));

  /* ---- trouver la case de stockage des soldes de chaque jeton ---- */
  async function trouveSlot(jeton){
    for(let s=0;s<12;s++){
      const {vm,sm}=await neuf();
      await sm.putStorage(adr(jeton), caseSolde(MOI,s), setLengthLeft(bigIntToBytes(123456789n),32));
      const b=await lire(vm,jeton,IERC.encodeFunctionData('balanceOf',[MOI]));
      if(b && BigInt(b)===123456789n) return s;
    }
    return null;
  }
  const slotSwoge=await trouveSlot(SWOGE);
  const slotBet  =await trouveSlot(SWOGEBET);
  console.log('case des soldes : $SWOGE slot '+slotSwoge+',  $SWOGEBET slot '+slotBet+'\n');
  if(slotSwoge===null||slotBet===null){ console.log('sans case de solde, on ne peut pas financer le compte d essai'); process.exit(1); }

  /* La tolerance et son calcul viennent de la page aussi : si quelqu'un
     y remet zero un jour, l'essai 6 ci-dessous le fera echouer. */
  const TOL=bac.TOLERANCE;
  const moins=moinsTolPage;
  console.log('tolerance lue dans la page : '+TOL+' %,  reserve de gaz : '+bac.GAZ_ECHANGE+' unites\n');

  async function route(nom, prepare, valeur, morceaux, jetonRecu, attendu){
    const {vm,sm}=await neuf();
    await prepare(vm,sm);
    const avant = jetonRecu
      ? BigInt(await lire(vm,jetonRecu,IERC.encodeFunctionData('balanceOf',[MOI])))
      : (await sm.getAccount(adr(MOI))).balance;
    const data=IR02.encodeFunctionData('multicall',[ethers.constants.MaxUint256, morceaux]);
    const r=await appel(vm,{de:MOI,a:R02,data,valeur:valeur});
    if(r.execResult.exceptionError){ ok(false, nom+' — '+motif(r)); return; }
    const apres = jetonRecu
      ? BigInt(await lire(vm,jetonRecu,IERC.encodeFunctionData('balanceOf',[MOI])))
      : (await sm.getAccount(adr(MOI))).balance;
    const recu=apres-avant;
    ok(recu>0n, nom+' — recu '+(+ethers.utils.formatEther(recu.toString()))
       .toLocaleString('fr-FR',{maximumFractionDigits:10})
       + '   [gaz ' + r.execResult.executionGasUsed.toString() + ']');
    const j = JOURNAL[JOURNAL.length-1];
    if(j){ j.execute = true; j.gaz = Number(r.execResult.executionGasUsed);
           j.recu = recu.toString(); }
    if(attendu!==undefined){
      const ecart=Math.abs(Number(recu-attendu)/Number(attendu))*100;
      ok(ecart<0.01, '   le devis annonce le meme montant (ecart '+ecart.toFixed(4)+' %)');
    }
  }

  const UN=ethers.utils.parseEther('0.01');            // 0,01 ETH
  const MILLE=ethers.utils.parseEther('1000');         // 1 000 jetons

  /* devis lus a chaud pour poser un minimum NON NUL */
  const v2=new ethers.Contract(V2R,['function getAmountsOut(uint256,address[]) view returns (uint256[])'],prov);
  const q =new ethers.Contract(QUOTER,['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)'],prov);

  const ethVersSwoge=(await v2.getAmountsOut(UN,[WETH,SWOGE]))[1];
  const betDe       =(await q.callStatic.quoteExactInputSingle({tokenIn:SWOGE,tokenOut:SWOGEBET,amountIn:ethVersSwoge,fee:FRAIS,sqrtPriceLimitX96:0})).amountOut;
  const betDeMille  =(await q.callStatic.quoteExactInputSingle({tokenIn:SWOGE,tokenOut:SWOGEBET,amountIn:MILLE,fee:FRAIS,sqrtPriceLimitX96:0})).amountOut;
  const swogeDeMille=(await q.callStatic.quoteExactInputSingle({tokenIn:SWOGEBET,tokenOut:SWOGE,amountIn:MILLE,fee:FRAIS,sqrtPriceLimitX96:0})).amountOut;
  const ethDeMille  =(await v2.getAmountsOut(MILLE,[SWOGE,WETH]))[1];

  const finance=(jeton,slot,combien)=>async(vm,sm)=>{
    await sm.putStorage(adr(jeton), caseSolde(MOI,slot), setLengthLeft(bigIntToBytes(combien.toBigInt()),32));
    const a=await appel(vm,{de:MOI,a:jeton,data:IERC.encodeFunctionData('approve',[R02,combien])});
    if(a.execResult.exceptionError) throw new Error('approve refuse : '+motif(a));
  };
  const rien=async()=>{};

  console.log('-- 1. ETH -> $SWOGE (v2, un saut) --');
  await route('ETH -> SWOGE', rien, UN.toBigInt(),
    morceauxDePage('eth','swoge', UN, moins(ethVersSwoge)),
    SWOGE, ethVersSwoge.toBigInt());

  console.log('\n-- 2. ETH -> $SWOGEBET (v2 puis v3, une seule transaction) --');
  await route('ETH -> SWOGEBET', rien, UN.toBigInt(),
    morceauxDePage('eth','swogebet', UN, moins(betDe)),
    SWOGEBET, betDe.toBigInt());

  console.log('\n-- 3. $SWOGE -> $SWOGEBET (v3) --');
  await route('SWOGE -> SWOGEBET', finance(SWOGE,slotSwoge,MILLE), 0n,
    morceauxDePage('swoge','swogebet', MILLE, moins(betDeMille)),
    SWOGEBET, betDeMille.toBigInt());

  console.log('\n-- 4. $SWOGEBET -> $SWOGE (v3) --');
  await route('SWOGEBET -> SWOGE', finance(SWOGEBET,slotBet,MILLE), 0n,
    morceauxDePage('swogebet','swoge', MILLE, moins(swogeDeMille)),
    SWOGE, swogeDeMille.toBigInt());

  console.log('\n-- 5. $SWOGE -> ETH (v2 puis deballage du WETH) --');
  await route('SWOGE -> ETH', finance(SWOGE,slotSwoge,MILLE), 0n,
    morceauxDePage('swoge','eth', MILLE, moins(ethDeMille)),
    null, ethDeMille.toBigInt());

  console.log('\n-- 5b. la page refuse les paires qui n existent pas --');
  ok(morceauxDePage('swogebet','eth', MILLE, 1) === null,
     '$SWOGEBET -> ETH ne rend aucune transaction : il n y a pas de route, et la page le sait');

  console.log('\n-- 6. le minimum protege vraiment --');
  {
    /* Un minimum place AU-DESSUS du devis doit faire echouer l'echange.
       S'il ne le fait pas, c'est que le champ n'est pas lu — et la page
       enverrait des fonds sans aucune protection. */
    const {vm,sm}=await neuf();
    const trop=ethVersSwoge.mul(101).div(100);
    const data=IR02.encodeFunctionData('multicall',[ethers.constants.MaxUint256,
      morceauxDePage('eth','swoge', UN, trop)]);
    const r=await appel(vm,{de:MOI,a:R02,data,valeur:UN.toBigInt()});
    ok(!!r.execResult.exceptionError, 'un minimum trop haut fait ECHOUER l echange (le champ est bien lu)');
    ok(TOL > 0, 'et la tolerance de la page n est pas zero ('+TOL+' %) — a zero, ce champ ne protegerait de rien');
    const m0 = moins(ethers.utils.parseEther('1000'));
    ok(m0.gt(0) && m0.lt(ethers.utils.parseEther('1000')),
       'le minimum calcule par la page est bien EN DESSOUS du devis, et non nul ('
       + ethers.utils.formatEther(m0) + ' pour 1000)');
  }

  console.log('\n-- 7. sans autorisation, la route jeton echoue --');
  {
    const {vm,sm}=await neuf();
    await sm.putStorage(adr(SWOGE), caseSolde(MOI,slotSwoge), setLengthLeft(bigIntToBytes(MILLE.toBigInt()),32));
    const data=IR02.encodeFunctionData('multicall',[ethers.constants.MaxUint256,
      [IR02.encodeFunctionData('exactInputSingle',[{tokenIn:SWOGE,tokenOut:SWOGEBET,fee:FRAIS,
        recipient:MOI, amountIn:MILLE, amountOutMinimum:0, sqrtPriceLimitX96:0}])]]);
    const r=await appel(vm,{de:MOI,a:R02,data});
    ok(!!r.execResult.exceptionError, 'sans approve, la route jeton refuse — l etape d autorisation est obligatoire');
  }

  const fs=require('fs');
  const sortie = { bloc, tolerance: TOL, routes: JOURNAL.filter(j=>j.execute) };
  fs.writeFileSync(path.join(__dirname,'wallet_routes.prouve.json'),
                   JSON.stringify(sortie, null, 1) + '\n');
  console.log('\njournal ecrit : '+sortie.routes.length+' routes reellement executees');

  console.log('\nlectures au noeud : '+appelsNoeud+',  servies du cache : '+servisDuCache);
  console.log(n+' verifications, '+echecs+' echec(s)');
  process.exit(echecs?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
