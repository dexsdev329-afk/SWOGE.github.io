"use strict";
/* ============================================================================
 * SWOGE PREDICT — LA PAGE : PAPIER, VRAIES DONNEES, HONNETE
 *
 * On injecte un faux WS Hyperliquid (allMids) et un faux candleSnapshot :
 * vraies formes, valeurs deterministes. On verifie :
 *   1. l interface s affiche, statut Live des le premier tick ;
 *   2. une prediction sort avec ses RAISONS et un niveau de confiance ;
 *   3. le paper bot joue un round et met a jour la bankroll (papier) ;
 *   4. la martingale/risque sont cables ; rien ne mise plus que la bankroll ;
 *   5. le cadre est honnete : « not a predictive edge », pas de « guaranteed »,
 *      protocole live NOT CONNECTED, aucun ordre/cle dans la page.
 * ==========================================================================*/
var fs=require('fs'), path=require('path'), http=require('http');
var SITE=__dirname; var chromium=null; try{chromium=require('playwright').chromium;}catch(e){}
var n=0,rates=0;
function ok(c,m){n++;if(c)console.log('  ok   '+m);else{rates++;console.log('  RATE '+m);}}
function eq(a,b,m){ok(a===b,m+' ['+JSON.stringify(a)+']');}
var T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.mp4':'video/mp4'};

(async()=>{
  if(!chromium){ console.log('playwright absent : essai ignore'); return; }
  var srv=http.createServer(function(q,r){ var f=path.join(SITE,decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f,function(e,d){ if(e){r.writeHead(404);return r.end();} r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'}); r.end(d); }); });
  await new Promise(function(s){srv.listen(0,'127.0.0.1',s);});
  var port=srv.address().port;
  var nav=await chromium.launch();
  var page=await nav.newPage({viewport:{width:1200,height:1200}});
  await page.route(/vitrine\.json/,function(r){r.fulfill({status:200,contentType:'application/json',body:'{}'});});
  /* Faux candleSnapshot : 60 bougies en tendance douce (deterministe). */
  await page.route(/api\.hyperliquid\.xyz\/info/, function(r){
    var a=[]; var px=80000; for(var i=0;i<80;i++){ px+=((i%3)-1)*5+3; a.push({t:i,T:i,o:px-2,c:px,h:px+3,l:px-4,v:100+i,n:5}); }
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(a)});
  });
  /* Faux relevé partagé du serveur : la page le LIT, elle ne le calcule pas. */
  var predictEtat = {
    coin:'BNB', paper:true, roundSec:300, martingale:false, miseInitiale:10, sessions:1,
    depuis: Date.now()-3600000, maj: Date.now(), enPause:false,
    round: { n:42, sens:'UP', prob:54.4, confiance:'MEDIUM', mise:10, ouvre:790, tFerme: Date.now()+120000 },
    banque: { depart:1000, solde:1030, pl:30, roi:3, winRate:55, lossRate:45, trades:20, wins:11, losses:9, serie:2, haut:1040, bas:990, drawdownMax:4.8 },
    dernier: [
      { n:42, t:Date.now(), sens:'UP', prob:54, mise:10, ouvre:790, ferme:791, gagne:true, pl:10, solde:1030 },
      { n:41, t:Date.now()-300000, sens:'DOWN', prob:52, mise:10, ouvre:792, ferme:791, gagne:false, pl:-10, solde:1020 }
    ],
    courbe: [1000,1010,1000,1010,1020,1030], note:'Paper only, shared, server-side.'
  };
  await page.route(/\/predict\/etat/, function(r){ r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(predictEtat)}); });
  /* Étage 1 PancakeSwap : les vrais rounds + côtes, la porte EV (papier). */
  var pancakeEtat = {
    marche:'BNB', paper:true, roundSec:300, fee:0.03, mise:0.01, gaz:0.0006, marge:0.05, enPause:false, maj:Date.now(),
    round:{ epoch:517724, bull:0.1, bear:0.5, total:0.6, coteBull:5.4, coteBear:1.16,
            decision:{ side:'BULL', cote:5.4, ev:1.9, prob:55, mise:0.02, wouldBet:true, raison:'EV +190% at 5.40x' } },
    banque:{ depart:1, solde:1.05, pl:0.05, roi:5, unite:'BNB', wins:3, losses:2, skips:7, mises:5, winRate:60 },
    martingale:{ on:true, facteur:2, paliers:6, palier:1, palierMax:3, busts:1, miseCourante:0.02 },
    dernier:[], note:'Paper only.'
  };
  await page.route(/\/predict\/pancake/, function(r){ r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(pancakeEtat)}); });
  /* Étage 2 (vrais BNB) : on STUB la pile partagée (stakebubble/ethers/swogebuy)
     par un faux `window.swogeFil` qu'on pilote — swogepancake.js ne dépend que
     de lui. Le faux joue le serveur : auth, un état propriétaire avec wallet,
     et les réponses Play/Stop. Aucune vraie socket, aucun vrai BNB. */
  var pkReelEtat = {
    type:'pancakeReelEtat', proprietaire:true, aWallet:true, execute:false,
    adresse:'0x1234567890abcdef1234567890abcdef12345678', actif:false, solde:0.5,
    marche:'BNB', chaine:'BSC', contrat:'0x18B2', configure:true, minBet:0.001, maxBnb:5,
    banque:{ solde:0.5, pl:0.03, unite:'BNB', wins:3, losses:2, skips:7, mises:5, winRate:60 },
    martingale:{ on:true, facteur:2, paliers:6, palier:1, palierMax:3, busts:1, miseCourante:0.02 },
    enAttente:[], fermees:[], journal:[], note:'dry run'
  };
  var stub = 'window.__pkSent=[];window.__pkSubs=[];var E='+JSON.stringify(pkReelEtat)+';'
    + 'function D(m){window.__pkSubs.forEach(function(f){try{f(m);}catch(e){}});}'
    + 'window.swogeFil={pret:function(){return true;},ecoute:function(f){window.__pkSubs.push(f);},'
    + 'envoie:function(o){window.__pkSent.push(o);'
    + 'if(o.type==="pancakeReelEtat")D(E);'
    + 'else if(o.type==="pancakeReelPlay"){E=Object.assign({},E,{actif:true});D({type:"pancakeReelPlay",execute:false});D(E);}'
    + 'else if(o.type==="pancakeReelStop"){E=Object.assign({},E,{actif:false});D({type:"pancakeReelStop",execute:false});D(E);}'
    + 'else if(o.type==="pancakeReelCle")D({type:"pancakeReelCle",neuf:false,adresse:E.adresse,cle:"0x"+Array(65).join("a")});}};'
    + 'window.addEventListener("load",function(){D({type:"auth"});});';
  await page.route(/stakebubble\.min\.js/, function(r){ r.fulfill({status:200,contentType:'application/javascript',body:stub}); });
  await page.route(/swogebuy\.js/, function(r){ r.fulfill({status:200,contentType:'application/javascript',body:'/* stub */'}); });
  await page.route(/ethers.*\.umd\.min\.js/, function(r){ r.fulfill({status:200,contentType:'application/javascript',body:'/* stub */'}); });
  page.on('dialog', function(d){ d.accept(); });
  /* Faux WS allMids. */
  await page.addInitScript(function(){
    window.__sub=[];
    class FWS{ constructor(u){this.url=u;this.readyState=0;var self=this;
      setTimeout(function(){ self.readyState=1; if(self.onopen)self.onopen();
        var k=0; self._it=setInterval(function(){ k++; if(self.onmessage) self.onmessage({data:JSON.stringify({channel:'allMids',data:{mids:{BNB:String(790+(k%5)),CAKE:'2.53',BTC:String(81000+k*3),ETH:'3100',SOL:'180'}}})}); },40);
      },10); }
      send(s){ window.__sub.push(s); } close(){ this.readyState=3; clearInterval(this._it); if(this.onclose)this.onclose(); } }
    window.WebSocket=FWS;
  });
  await page.goto('http://127.0.0.1:'+port+'/swoge_predict.html',{waitUntil:'domcontentloaded'});

  console.log('-- 1. interface, statut live, prix reel --');
  {
    ok(await page.$('#prLive'),'le statut live existe');
    await page.waitForFunction(function(){return /Live/.test(document.getElementById('prLiveTxt').textContent);},null,{timeout:5000});
    ok(/Live/.test(await page.textContent('#prLiveTxt')),'le premier tick passe le statut a Live');
    await page.waitForFunction(function(){return /\d/.test(document.getElementById('prPrix').textContent);},null,{timeout:5000});
    ok(/\$79[0-4]/.test(await page.textContent('#prPrix')),'le prix live BNB (le marche PancakeSwap) s affiche ['+(await page.textContent('#prPrix'))+']');
    /* Un seul abonnement global (allMids). */
    var sub=await page.evaluate(function(){return window.__sub||[];});
    ok(sub.some(function(x){return /allMids/.test(x);}),'un seul abonnement WS global (allMids)');
    /* PancakeSwap Prediction, c est le marche BNB (et CAKE), pas BTC/ETH/SOL. */
    var marches=await page.$$eval('#prMarche option',function(o){return o.map(function(x){return x.textContent;});});
    ok(marches.join(',')==='BNB,CAKE','le marche est celui de PancakeSwap : BNB et CAKE ['+marches.join(',')+']');
    ok((await page.$eval('#prMarche',function(s){return s.value;}))==='BNB','et il ouvre sur BNB par defaut');
  }

  console.log('-- 2. une prediction avec ses raisons --');
  {
    await page.waitForFunction(function(){return document.querySelectorAll('#prRaisons div').length>=3;},null,{timeout:6000});
    var sens=await page.textContent('#prSens');
    ok(/(UP|DOWN)/.test(sens),'une prediction sort ['+sens.trim()+']');
    ok(/%/.test(sens),'avec une probabilite');
    ok((await page.$$('#prRaisons div')).length>=3,'et ses raisons (WHY)');
    ok(/confidence/i.test(await page.textContent('#prConf')),'et un niveau de confiance');
    /* Multi-horizons. */
    ok((await page.$$('#prTf span')).length>=3,'les timeframes 1m/5m/15m/1h sont montres');
    /* La proba ne pretend jamais une certitude. */
    var up=parseFloat((await page.textContent('#prUpP'))); 
    ok(up<=68 && up>=32,'la probabilite reste bridee loin de 0/100 ['+up+']');
  }

  console.log('-- 3. le releve PARTAGE (serveur) : win/raté, P/L de la banque, comme SWOGE AI --');
  {
    /* « faut tu fasse colle si ça jouais vraiment noter le win raté les perte
       gain de la banque comme Swoge ai » : le releve ne tourne PAS dans le
       navigateur — il vient du serveur (/predict/etat) et la page le montre,
       exactement comme /ai/colonie. Aucun bouton Start/Stop. */
    ok(!(await page.$('#prGo')) && !(await page.$('#prStop')),'aucun bouton Start ni Stop');
    await page.waitForFunction(function(){ return /\$1,030/.test(document.getElementById('prBank').textContent||''); },null,{timeout:8000});
    var bank=await page.textContent('#prBank');
    ok(/Bankroll/.test(bank) && /\$1,030/.test(bank),'la banque PARTAGEE vient du serveur [$1,030]');
    ok(/Wins/.test(bank) && /Losses/.test(bank),'les win et les raté sont comptés');
    ok(/Win rate/.test(bank),'et le taux de réussite est là');
    ok(/like SWOGE AI/i.test(await page.textContent('body')),'la page dit que le relevé est partagé, comme SWOGE AI');
    var hist=await page.textContent('#prHisto');
    ok(/WIN/.test(hist) && /LOSS/.test(hist),'l historique montre les rounds gagnés ET ratés du serveur');
    ok(/Round #42/.test(await page.textContent('#prLigne')),'le round serveur en cours est montré [#42]');
  }

  console.log('-- 4. martingale et garde bankroll (logique, via le moteur) --');
  {
    var g=await page.evaluate(function(){
      var E=window.SwogePredict; var m=new E.MartingaleEngine({initial:10,mult:2,maxBet:100});
      m.resultat(false); m.resultat(false);
      return { apres2pertes:m.prochaine(1000), plafonneParBankroll:m.prochaine(15) };
    });
    eq(g.apres2pertes,40,'apres deux pertes, la mise a double deux fois');
    eq(g.plafonneParBankroll,15,'et ne depasse jamais la bankroll disponible');
  }

  console.log('-- 5. honnete : pas de certitude, pas d ordre reel --');
  {
    var body=await page.textContent('body');
    ok(/not a predictive edge|close to random|heuristic/i.test(body),'la page dit que ce n est pas un avantage');
    ok(/NOT CONNECTED|PROTOCOL/i.test(body),'le protocole live est NOT CONNECTED, pas invente');
    ok(/paper/i.test(body) && /no real money|nothing signs|no order/i.test(body),'papier, aucun ordre');
    var src=fs.readFileSync(path.join(SITE,'swoge_predict.html'),'utf8')+fs.readFileSync(path.join(SITE,'predict_moteur.js'),'utf8');
    ok(!/guaranteed|sure win|privateKey|sendTransaction|signTransaction/i.test(src),'aucun « garanti », aucune signature, aucune cle');
  }

  console.log('-- 6. étage 1 PancakeSwap : vrais rounds, côtes, porte EV (papier) --');
  {
    await page.waitForFunction(function(){ return /517724/.test(document.getElementById('pkLigne').textContent||''); },null,{timeout:8000});
    var ligne=await page.textContent('#pkLigne');
    ok(/Round #517724/.test(ligne),'le vrai round PancakeSwap est montré [#517724]');
    ok(/5\.40x/.test(ligne) && /1\.16x/.test(ligne),'les deux côtes BULL/BEAR sont là');
    ok(/WOULD BET BULL/i.test(ligne),'et la décision EV : on miserait BULL sur la grosse côte');
    ok(/0\.02 BNB/.test(ligne),'la mise du moment (martingale) est montrée dans la décision');
    var bank=await page.textContent('#pkBank');
    ok(/Skipped/i.test(bank) && /7/.test(bank),'le compteur de SAUTS (côtes pourries) est montré');
    ok(/BNB/.test(bank),'la caisse est en BNB');
    /* La martingale en toutes lettres, busts compris : la vérité au joueur. */
    var mart=await page.textContent('#pkMart');
    ok(/Martingale ×2/.test(mart),'la martingale est affichée (facteur)');
    ok(/step 1\/6/.test(mart),'avec le palier courant sur le plafond');
    ok(/busted 1×/.test(mart),'et les busts comptés — elle ne se rattrape pas toujours');
    ok(/not always recover/i.test(mart),'et le fait qu elle ne récupère pas toujours est dit');
  }

  console.log('-- 7. étage 2 : le vrai portefeuille PancakeSwap (owner, gated) --');
  {
    /* Le faux swogeFil émet auth au load → swogepancake demande l état, rend
       la carte propriétaire avec wallet. */
    await page.waitForFunction(function(){ return /PancakeSwap wallet/.test((document.getElementById('pkReel')||{}).textContent||''); }, null, { timeout: 8000 });
    var card = await page.textContent('#pkReel');
    ok(/Play it for real/.test(card), 'la carte étage 2 est là (owner)');
    ok(/0x1234.*5678|0x1234…5678/.test(card), 'elle montre l adresse du wallet dédié');
    ok(/Martingale ×2/.test(card) && /busted 1×/.test(card), 'la martingale et les busts sont montrés');
    ok(/dry run/i.test(card), 'et le mode dry run est dit (EXECUTE off)');
    ok(await page.$('[data-pk="play"]'), 'un bouton PLAY est présent');
    /* Play → envoie pancakeReelPlay, puis la carte passe en PLAYING (Stop). */
    await page.click('[data-pk="play"]');
    await page.waitForFunction(function(){ return (window.__pkSent||[]).some(function(o){return o.type==='pancakeReelPlay';}); }, null, { timeout: 4000 });
    ok(true, 'Play envoie pancakeReelPlay au serveur');
    await page.waitForFunction(function(){ return !!document.querySelector('[data-pk="stop"]'); }, null, { timeout: 4000 });
    ok(await page.$('[data-pk="stop"]'), 'et la carte passe en PLAYING (bouton STOP)');
    /* La clé n est jamais écrite dans la page tant qu on ne la demande pas. */
    ok(!/0xaaaaaaaa/.test(await page.textContent('#pkReel')), 'aucune clé privée affichée sans geste explicite');
    /* Non-propriétaire : le serveur le dirait, la page ne montrerait pas les boutons.
       On vérifie que la source ne stocke aucune clé et exige un geste. */
    var src = fs.readFileSync(path.join(SITE,'swogepancake.js'),'utf8');
    ok(!/localStorage\s*\.\s*setItem|sessionStorage\s*\.\s*setItem|sendTransaction|signTransaction|new\s+ethers\.Wallet/i.test(src), 'swogepancake.js ne stocke aucune clé, ne signe rien (le serveur signe)');
    ok(/pancakeReelPlay/.test(src) && /pancakeReelStop/.test(src) && /pancakeReelCree/.test(src), 'et il parle bien les gestes de l étage 2');
  }

  await nav.close(); await new Promise(function(s){srv.close(s);});
  console.log('\nVERIFICATIONS : '+n+(rates?'  —  RATES : '+rates+'/'+n:'  —  tout passe'));
  process.exit(rates?1:0);
})().catch(function(e){ console.error('ESSAI CASSE :',e); process.exit(1); });
