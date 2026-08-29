'use strict';
/* BRULER DEUX JETONS, ET NE PAS MENTIR SUR CE QUE CA FAIT AU $SWOGE.
 *
 * La demande : « faut pouvoir choisir burn swoge ou burn swogebet, et sur la
 * barre de progression faut prendre en compte que si on burn du swogebet bah
 * ca burn du swoge aussi ».
 *
 * La premiere moitie est une fonctionnalite. La seconde est une CROYANCE, et
 * elle est fausse : verifie sur la chaine, le transfert de $SWOGEBET appelle
 * `onMove` sur le launchpad, qui ne touche que la comptabilite des
 * recompenses. Aucun $SWOGE n'est detruit. (`pendingRewards` de l'adresse
 * morte rend zero, donc il n'y a pas non plus de $SWOGE bloque par la.)
 *
 * Ecrire l'equivalence dans le total du $SWOGE aurait donne un chiffre que la
 * chaine dement — le genre de nombre invente que ce site s'interdit. La page
 * affiche donc les deux verites separement : ce qui est brule, et ce que ca
 * vaut, avec la phrase qui dit que l'offre de $SWOGE ne bouge pas.
 *
 * Ces essais tiennent surtout CETTE phrase.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('burn_deux_jetons.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const SWOGE = '0x8a166fb41cd659a0a43396272ff73973ce29f817';
const BET   = '0xc0aed547862fba5d7d9fbf3cb14204cd756c8bea';
const SQRT  = '193725437554980814758787293837';   // le vrai, lu sur le pool

/* Un `ethers` minimal, pose AVANT la page : le CDN n'est pas joignable ici, et
   de toute facon on veut des chiffres connus pour pouvoir les verifier. */
const STUB = `
window.__vus = [];
(function(){
  var SWOGE='${SWOGE}', BET='${BET}';
  var SUP={}; SUP[SWOGE]='1000000000'; SUP[BET]='1000000000';
  var DEAD={}; DEAD[SWOGE]='5000000';   DEAD[BET]='253548.2496';
  function BN(s){ return { _s:String(s),
    mul:function(k){ return BN(String(Number(this._s)*k)); },
    div:function(k){ return BN(String(Number(this._s)/k)); },
    isZero:function(){ return Number(this._s)===0; },
    gt:function(o){ return Number(this._s)>Number(o._s); },
    toString:function(){ return this._s; } }; }
  window.ethers = {
    BigNumber:{ from:BN },
    utils:{ formatUnits:function(x){ return String(x&&x._s!==undefined?x._s:x); },
            getAddress:function(a){ return a; } },
    providers:{ JsonRpcProvider:function(){ return {}; },
                /* La page utilise StaticJsonRpcProvider, pas JsonRpcProvider :
                   un simulateur qui n'a que le second fait echouer chaque
                   lecture, silencieusement, dans le try/catch de la page. */
                StaticJsonRpcProvider:function(){ return {}; },
                Web3Provider:function(){ return { getSigner:function(){ return {}; } }; } },
    Contract:function(addr, abi){
      var a=String(addr).toLowerCase();
      window.__vus.push(a);
      return {
        decimals:async function(){ return 18; },
        symbol:async function(){ return a===SWOGE?'SWOGE':'SWOGEBET'; },
        totalSupply:async function(){ return BN(SUP[a]||'0'); },
        balanceOf:async function(who){
          if(String(who).toLowerCase().indexOf('dead')>=0) return BN(DEAD[a]||'0');
          return BN('1000');
        },
        slot0:async function(){ return { sqrtPriceX96:{ toString:function(){ return '${SQRT}'; } } }; },
        token0:async function(){ return SWOGE; },
        transfer:async function(){ return { hash:'0x0', wait:async function(){} }; }
      };
    }
  };
})();
`;

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg' };
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;

  const nav = await chromium.launch();
  const p = await nav.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(e.message));
  await p.addInitScript(STUB);
  await p.goto('http://127.0.0.1:' + port + '/burn.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);

  // ---- 1. le choix existe ----
  const choix = await p.$$eval('#tokPick button', (bs) => bs.map((b) => ({ t: b.dataset.t, txt: b.textContent, on: b.classList.contains('on') })));
  ok(choix.length === 2, 'deux jetons sont proposes (' + choix.length + ')');
  ok(choix.some((c) => c.t === 'swoge') && choix.some((c) => c.t === 'swogebet'),
     'ce sont bien $SWOGE et $SWOGEBET : ' + choix.map((c) => c.txt).join(' / '));
  ok(choix[0].on, 'le $SWOGE est choisi au depart');

  // ---- 2. la barre au depart : celle du $SWOGE ----
  const a = await p.evaluate(() => ({
    tot: document.getElementById('totalBurned').textContent,
    pct: document.getElementById('burnPct').textContent,
    barre: document.getElementById('burnBar').style.width,
    lien: document.getElementById('burnLien').hidden
  }));
  ok(/SWOGE/.test(a.tot) && !/SWOGEBET/.test(a.tot), 'le total est en SWOGE : ' + a.tot);
  ok(/0\.5000% of \$SWOGE supply/.test(a.pct), 'le pourcentage porte le nom du jeton : ' + a.pct);
  ok(a.barre === '0.5%', 'la barre vaut 5 M sur 1 Md = 0,5 % (' + a.barre + ')');
  ok(a.lien === true, "aucune phrase sur le lien avec le \\$SWOGE : la question ne se pose pas ici");

  // ---- 3. on bascule ----
  await p.click('#tokPick button[data-t="swogebet"]');
  await p.waitForTimeout(900);
  const b = await p.evaluate(() => ({
    tot: document.getElementById('totalBurned').textContent,
    pct: document.getElementById('burnPct').textContent,
    barre: document.getElementById('burnBar').style.width,
    titre: document.getElementById('burnTitre').textContent,
    entete: document.getElementById('titreJeton').textContent,
    onglet: document.title,
    hint: document.getElementById('burnHint').textContent,
    lien: document.getElementById('burnLien').textContent,
    cache: document.getElementById('burnLien').hidden,
    vus: window.__vus
  }));
  ok(/SWOGEBET/.test(b.tot), 'le total passe au SWOGEBET : ' + b.tot);
  ok(/of \$SWOGEBET supply/.test(b.pct), "et le pourcentage se mesure sur SON offre : " + b.pct);
  ok(b.barre !== '0.5%', 'la barre a bouge — elle ne montre plus celle du SWOGE (' + b.barre + ')');
  ok(/Burn your \$SWOGEBET/.test(b.titre), 'le titre du formulaire suit : ' + b.titre);
  /* L'en-tete est le seul endroit ou l'oeil se pose avant de cliquer. */
  ok(b.entete === '$SWOGEBET', "l'en-tete de la page suit aussi : « Burn " + b.entete + " »");
  ok(/Burn \$SWOGEBET/.test(b.onglet), "et l'onglet du navigateur : " + b.onglet);
  ok(/SWOGEBET/.test(b.hint), "l'avertissement aussi");
  ok(b.vus.indexOf(BET) >= 0, "le contrat interroge est bien celui du \\$SWOGEBET");

  // ---- 4. LA PHRASE QUI COMPTE ----
  ok(b.cache === false, 'la ligne sur le lien avec le $SWOGE est visible');
  ok(/does\s+not\s+burn\s+\$SWOGE/i.test(b.lien.replace(/\s+/g, ' ')),
     'elle dit NOIR SUR BLANC que ca ne brule pas de $SWOGE : "' + b.lien.trim() + '"');
  ok(/supply is unchanged/i.test(b.lien), "et que l'offre de \\$SWOGE ne bouge pas");
  /* 253 548,25 x 0,167258 = 42 407 -> "42.4K" */
  ok(/42\.4K \$SWOGE/.test(b.lien),
     "l'equivalence est calculee au prix du pool, pas inventee (42.4K)");
  ok(!/of \$SWOGE supply/.test(b.pct),
     "et elle n'est PAS versee dans le pourcentage du \\$SWOGE : c'est la le mensonge qu'on evite");

  // ---- 5. retour au SWOGE ----
  await p.click('#tokPick button[data-t="swoge"]');
  await p.waitForTimeout(900);
  const c = await p.evaluate(() => ({
    pct: document.getElementById('burnPct').textContent,
    lien: document.getElementById('burnLien').hidden
  }));
  ok(/of \$SWOGE supply/.test(c.pct), 'le retour au $SWOGE remet sa barre : ' + c.pct);
  ok(c.lien === true, 'et la phrase disparait avec lui');

  ok(erreurs.length === 0, 'aucune erreur JS' + (erreurs.length ? ' : ' + erreurs[0] : ''));

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
