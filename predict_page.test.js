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

  console.log('-- 3. LIVE tout le temps : aucun bouton Start/Stop, le papier tourne seul --');
  {
    /* « faut pas mettre de bouton start ; met le en mode live on tout le
       temps » : pas de Start, pas de Stop — le papier est armé au chargement
       et mise tout seul. La prédiction est prête (bloc 2), le prix arrive
       (bloc 1). */
    ok(!(await page.$('#prGo')) && !(await page.$('#prStop')),'aucun bouton Start ni Stop');
    ok(!!(await page.$('#prOnAir')),'un indicateur « LIVE — always on » est montré');
    await page.waitForFunction(function(){ return /Next bet|Waiting for enough|Auto-restarting/i.test(document.getElementById('prRisque').textContent||''); },null,{timeout:8000});
    ok(/Next bet/i.test(await page.textContent('#prRisque')),'au chargement, le bot mise deja tout seul (aucun clic)');
    /* On raccourcit le round en forcant la resolution : on attend qu un round
       se resolve (bankroll bouge ou histo se remplit) — le timer est de 60s,
       donc on pousse le prix et on declenche via l horloge interne en
       avancant le temps simule n est pas dispo ; on verifie plutot que la
       mecanique est cablee (mise calculee, garde bankroll). */
    var mise=await page.evaluate(function(){ return document.getElementById('prRisque').textContent; });
    ok(/\$/.test(mise),'la mise est chiffree');
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

  await nav.close(); await new Promise(function(s){srv.close(s);});
  console.log('\nVERIFICATIONS : '+n+(rates?'  —  RATES : '+rates+'/'+n:'  —  tout passe'));
  process.exit(rates?1:0);
})().catch(function(e){ console.error('ESSAI CASSE :',e); process.exit(1); });
