/* On extrait du HTML les fonctions qui viennent d'etre ecrites et on les
   exerce avec un `fetchBorne` simule : ca teste le code QUI PART en ligne,
   sans avoir besoin ni de la chaine ni du CDN. */
const fs=require('fs');
const h=fs.readFileSync(require('path').join(__dirname,'launchpad.html'),'utf8');
function bloc(debut, fin){
  const i=h.indexOf(debut); if(i<0) throw new Error('introuvable : '+debut);
  const j=h.indexOf(fin, i);  if(j<0) throw new Error('fin introuvable : '+fin);
  return h.slice(i, j);
}
const src = bloc('var DEX_CHAIN=', 'async function loadMarketCaps');
let n=0, ko=0;
const ok=(c,m)=>{ n++; if(c) console.log('  ok   '+m); else { ko++; console.log('  RATE '+m); } };

const REP = { pairs:[{ pairAddress:'0xC12943975DEF537DACE9D62D4762A8250501924E',
                       priceUsd:'0.000004433', fdv:4432, liquidity:{usd:1909.63} }] };
let appels=0, lastUrl='';
const ctx = {
  fetchBorne: async (u)=>{ appels++; lastUrl=u; return { json: async()=>REP }; },
  fmtUsd: (v)=> '$'+(v>=1000 ? (v/1000).toFixed(1)+'K' : v.toFixed(2)),
  fmtQty: (v)=> v>=1e6 ? (v/1e6).toFixed(2)+'M' : String(v),
  venue: ()=>({sym:'SWOGE'}), exploreSu:null, exploreEu:null,
  console
};
const vm=require('vm'); vm.createContext(ctx);
vm.runInContext(src+'\n'+bloc('function usdRate(v)','async function loadMarketCaps'), ctx);

(async()=>{
  const POOL='0xc12943975def537daCe9D62D4762a8250501924E';
  await ctx.dexCharge([POOL]);
  ok(appels===1, 'un seul appel reseau pour le lot ('+appels+')');
  ok(/\/pairs\/robinhood\//.test(lastUrl), 'la chaine interrogee est robinhood');
  const d=ctx.dexLu(POOL);
  ok(!!d, 'le pool est en cache apres l appel');
  ok(d && d.fdv===4432, 'la capitalisation lue est celle de DexScreener ('+(d&&d.fdv)+')');
  ok(d && Math.abs(d.usd-0.000004433)<1e-12, 'le prix en dollars aussi');
  ok(d && d.liq===1909.63, 'et la liquidite est recuperee au passage');

  /* LA CASSE DE L ADRESSE : DexScreener renvoie le pool en majuscules, la page
     le tient en minuscules. Sans normalisation, le cache ne se relit jamais et
     on refait un appel reseau par rafraichissement. */
  ok(ctx.dexLu(POOL.toUpperCase())!=null, "l adresse est normalisee : la casse ne casse pas le cache");

  appels=0; await ctx.dexCharge([POOL]);
  ok(appels===0, 'un second passage ne rappelle pas le reseau (cache '+appels+')');

  const r={ pool:POOL, v:3, mcQuote:167257602, mode:1 };
  ok(ctx.mcUsd(r)===4432, 'la carte prend le chiffre de DexScreener, pas le sien');
  ok(/\$4\.4K/.test(ctx.mcText(r)), 'et l affiche en dollars : '+ctx.mcText(r).replace(/<[^>]+>/g,''));

  /* LE POOL INCONNU : DexScreener ne connait pas encore un jeton neuf. */
  const NEUF='0x1111111111111111111111111111111111111111';
  await ctx.dexCharge([NEUF]);
  ok(ctx.dexLu(NEUF)!=null && ctx.dexLu(NEUF).fdv===null,
     'un pool inconnu est marque, pas redemande en boucle');
  const r2={ pool:NEUF, v:3, mcQuote:167257602, mode:1 };
  ok(ctx.mcUsd(r2)===null, 'aucun dollar invente pour lui');
  ok(/pas de taux/.test(ctx.mcText(r2)),
     "et l unite est NOMMEE plutot que sous-entendue : "+ctx.mcText(r2).replace(/<[^>]+>/g,''));

  /* LE REPLI EN DEUX SAUTS reste vivant si le taux, lui, est connu. */
  ctx.exploreSu=0.0000265132;
  ok(Math.abs(ctx.mcUsd(r2)-4433)<5,
     'sans DexScreener mais avec le taux, le calcul en deux sauts retombe sur $'+Math.round(ctx.mcUsd(r2)));

  console.log('\n'+(ko?('RATES : '+ko+'/'+n):('tout passe : '+n+' verifications')));
  process.exit(ko?1:0);
})();
