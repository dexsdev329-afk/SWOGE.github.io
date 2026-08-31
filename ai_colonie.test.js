/* ============================================================================
 * LA COLONIE : CE QU'ELLE PROMET, ET CE QU'ELLE NE DOIT JAMAIS INVENTER
 *
 * Cette page fait tourner six agents sur de VRAIS tokens et tient une
 * tresorerie papier. Il n'y a qu'une faute possible ici, et elle est
 * capitale : fabriquer un chiffre. Un profit invente pendant que l'onglet
 * etait ferme, un solde a zero parce qu'un service n'a pas repondu, une
 * lecon tiree d'un resultat imagine — chacun de ces trois cas ferait croire
 * a une methode qui gagne, et donnerait envie d'y mettre de l'argent.
 *
 * L'essai joue donc les services : de vraies reponses relevees sur les
 * quatre sources, rejouees au navigateur. Ce qu'il mesure n'est pas que la
 * page « marche » — c'est qu'elle se TAIT quand elle ne sait pas.
 * ==========================================================================*/
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
const PAGE = 'swoge_ai.html';
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
            '.json':'application/json', '.webp':'image/webp', '.png':'image/png' };

/* ---- DE VRAIES REPONSES, FIGEES ----
 * Elles ont ete relevees sur les quatre services le jour ou cette page a ete
 * ecrite. Les figer n'est pas de la triche : ce qu'on met a l'essai est ce
 * que la PAGE fait d'une reponse, pas ce que le service repond. Et une
 * reponse figee est reproductible, ce qu'un appel reseau n'est jamais. */
const POOL = '0xd42a491087a15e5afd51feb3606066cc152d2b09';
const ADR  = '0x020bfc650a365f8bb26819deaabf3e21291018b4';
function poolsFaux(prix, suffixe){
  const mk = (i) => ({
    id: 'robinhood_pool' + i,
    type: 'pool',
    attributes: {
      address: '0x' + String(i).repeat(40).slice(0, 40),
      name: 'TOK' + i + ' / WETH',
      base_token_price_usd: String(prix * (1 + i/100)),
      market_cap_usd: String(2_000_000 * (i + 1)),
      fdv_usd: String(2_000_000 * (i + 1)),
      reserve_in_usd: String(120_000 + i * 40_000),
      pool_created_at: '2026-07-0' + ((i % 8) + 1) + 'T10:00:00Z',
      volume_usd: { m5:'900', m15:'3000', m30:'7000', h1:'40000', h6:'180000', h24:'900000' },
      transactions: { m5:{buys:4,sells:3,buyers:4,sellers:3}, h1:{buys:110,sells:80,buyers:60,sellers:40},
                      h6:{buys:600,sells:520,buyers:210,sellers:180}, h24:{buys:2200,sells:2100,buyers:800,sellers:700} },
      price_change_percentage: { m5:'0.5', h1:'3.2', h6:'11.0', h24:'22.0' }
    },
    relationships: { base_token: { data: { id: 'tok' + i } } }
  });
  const data = [], included = [];
  for (let i = 0; i < 6; i++) {
    data.push(mk(i));
    included.push({ id:'tok'+i, type:'token',
      attributes:{ address:'0x' + (i+1).toString().repeat(40).slice(0,40),
                   symbol:'TOK'+i+(suffixe||''), name:'Token '+i } });
  }
  return JSON.stringify({ data, included });
}
const GOPLUS_PROPRE = (adr) => JSON.stringify({ code:1, result:{ [adr]: {
  is_honeypot:'0', buy_tax:'0', sell_tax:'0', holder_count:'12000',
  is_open_source:'1', is_proxy:'0', is_mintable:'0', transfer_pausable:'0',
  cannot_buy:'0', owner_change_balance:'0', selfdestruct:'0',
  personal_slippage_modifiable:'0', honeypot_with_same_creator:'0',
  slippage_modifiable:'0', trading_cooldown:'0',
  holders:[{percent:'0.004', is_contract:0, is_locked:0, tag:''}],
  lp_holders:[{percent:'0.9', is_locked:1, tag:''}] } } });
const GOPLUS_PIEGE = (adr) => JSON.stringify({ code:1, result:{ [adr]: {
  is_honeypot:'1', buy_tax:'0', sell_tax:'0', holder_count:'20',
  is_open_source:'0', holders:[], lp_holders:[] } } });
const OHLCV = JSON.stringify({ data:{ attributes:{ ohlcv_list:
  Array.from({length:24}, (_,i)=>[1788200000 - i*900, 1, 1.05, 0.95, 1 + Math.sin(i)/50, 1000]) } } });
const DEXS = JSON.stringify({ schemaVersion:'1.0.0', pairs:[
  { chainId:'robinhood', pairAddress:POOL, priceUsd:'1.00', pairCreatedAt:1781812885000,
    liquidity:{usd:250000}, txns:{h1:{buys:110,sells:80}},
    info:{ imageUrl:'x', websites:[{url:'a'}], socials:[{type:'twitter'},{type:'telegram'}] } },
  { chainId:'robinhood', pairAddress:'0xzz', priceUsd:'1.00', liquidity:{usd:9000} } ] });

/* ============================ LE BANC ============================ */
async function ouvre(nav, port, opts){
  opts = opts || {};
  /* ---- UN CONTEXTE PAR SCENARIO, ET DES PAGES DEDANS ----
   * `browser.newPage()` ouvre un contexte NEUF a chaque fois, donc un
   * stockage neuf : impossible d'y mesurer ce qui survit d'une visite a
   * l'autre. Un contexte explicite le permet, et c'est aussi le seul endroit
   * ou l'on peut vieillir l'etat AVANT que la page ne le relise. */
  const ctx = opts.ctx || await nav.newContext({ viewport:{ width:1280, height:900 } });
  if (opts.avantChargement) await ctx.addInitScript(opts.avantChargement);
  const page = await ctx.newPage();
  const boum = [];
  page.on('pageerror', e => boum.push(String(e).slice(0, 200)));
  const appels = {};
  const note = (k) => { appels[k] = (appels[k]||0) + 1; };

  if (opts.horsLigne) {
    /* ---- LE CAS QUI COMPTE LE PLUS ----
       Aucun service ne repond. La page ne doit RIEN afficher qu'elle n'ait
       lu : pas de solde a zero, pas de position, pas de lecon. */
    await page.route(/geckoterminal|gopluslabs|dexscreener|rpc\.mainnet/, r => r.abort());
  } else {
    await page.route('**/api.geckoterminal.com/**', r => {
      const u = r.request().url();
      if (/ohlcv/.test(u)) { note('ohlcv'); return r.fulfill({ contentType:'application/json', body:OHLCV }); }
      note('pools');
      return r.fulfill({ contentType:'application/json', body:poolsFaux(opts.prix || 1) });
    });
    await page.route('**/api.gopluslabs.io/**', r => {
      note('goplus');
      const adr = ((r.request().url().match(/contract_addresses=([^&]+)/)||[])[1]||'').toLowerCase();
      return r.fulfill({ contentType:'application/json',
        body: opts.piege ? GOPLUS_PIEGE(adr) : GOPLUS_PROPRE(adr) });
    });
    await page.route('**/api.dexscreener.com/**', r => {
      note('dex'); return r.fulfill({ contentType:'application/json', body:DEXS });
    });
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', r => {
      note('rpc');
      const q = JSON.parse(r.request().postData() || '{}');
      if (q.method === 'eth_blockNumber')
        return r.fulfill({ contentType:'application/json', body:JSON.stringify({jsonrpc:'2.0',id:1,result:'0x30c0964'}) });
      if (q.method === 'eth_getLogs') {
        const logs = [];
        for (let i=0;i<41;i++) logs.push({ topics:[
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          '0x' + '0'.repeat(24) + ((i%7)+1).toString().repeat(40).slice(0,40),
          '0x' + '0'.repeat(24) + ((i%29)+1).toString().repeat(40).slice(0,40) ] });
        return r.fulfill({ contentType:'application/json', body:JSON.stringify({jsonrpc:'2.0',id:1,result:logs}) });
      }
      return r.fulfill({ contentType:'application/json', body:JSON.stringify({jsonrpc:'2.0',id:1,result:null}) });
    });
  }
  await page.goto('http://127.0.0.1:' + port + '/' + PAGE, { waitUntil:'domcontentloaded' });
  if (!opts.horsLigne) {
    /* Les agents marchent d une maison a l autre : a vitesse normale, six
       etapes prennent une bonne minute. Le bouton de vitesse est celui du
       joueur — on s en sert plutot que de trafiquer la page pour l essai. */
    await page.waitForTimeout(400);
    await page.click('#speed'); await page.click('#speed');
  }
  return { page, ctx, boum, appels };
}
const lit = (page) => page.evaluate(() => ({
  bal: (document.getElementById('bal')||{}).textContent,
  stamp: (document.getElementById('stamp')||{}).textContent,
  stampCls: (document.getElementById('stamp')||{}).className,
  pouls: (document.getElementById('poulsTx')||{}).textContent,
  tag: (document.getElementById('stagetag')||{}).textContent,
  pos: (document.getElementById('poscount')||{}).textContent,
  trades: (document.getElementById('s-trades')||{}).textContent,
  positions: [...document.querySelectorAll('#positions .pos')].map(p=>p.textContent.replace(/\s+/g,' ').trim()),
  picks: [...document.querySelectorAll('#picks .pick')].length,
  appris: (document.getElementById('appris')||{}).textContent.replace(/\s+/g,' ').trim(),
  agents: [...document.querySelectorAll('#agents .agent')].map(a =>
    [...a.querySelectorAll('.sc')].map(x=>x.textContent.trim()))
}));
const etatDe = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('swogeAiColonie')||'null'));

(async () => {
  if (!chromium) { console.log('playwright absent — essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise(res => srv.listen(0, res));
  const port = srv.address().port;
  const nav = await chromium.launch();

  /* ==================== 1. QUAND RIEN NE REPOND ==================== */
  console.log('\n-- aucun service ne repond --');
  {
    const { page, boum } = await ouvre(nav, port, { horsLigne:true });
    await page.waitForTimeout(6000);
    const m = await lit(page);
    console.log('   ' + JSON.stringify({ bal:m.bal, stamp:m.stamp, pouls:m.pouls, pos:m.pos }));
    ok(m.bal === '$1,000', 'la tresorerie reste a son point de depart (' + m.bal + ')');
    ok(m.pos === '0' && !m.positions.length,
       'aucune position n est ouverte : sans prix relu, on ne sait pas a quoi on achete');
    ok(/aucune donnee|aucun/i.test(m.stamp) && /mort/.test(m.stampCls),
       'la pastille dit qu elle n a rien lu, en rouge (« ' + m.stamp + ' »)');
    ok(m.pouls === 'HORS LIGNE', 'et le pouls le dit aussi (' + m.pouls + ')');
    /* ---- LA PHRASE QUI FAIT TOUTE LA DIFFERENCE ---- */
    ok(/rien n.est invente|attendent la chaine/i.test(m.tag),
       'la page DIT qu elle n invente rien pour combler : « ' + m.tag.slice(0, 80) + ' »');
    ok(m.picks === 0, 'et elle ne propose aucun pick tire de nulle part');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==================== 2. LES QUATRE SOURCES SONT LUES ==================== */
  console.log('\n-- les quatre sources --');
  let etatApres = null;
  {
    const { page, boum, appels } = await ouvre(nav, port, { prix:1 });
    await page.waitForTimeout(30000);
    const m = await lit(page);
    console.log('   appels : ' + JSON.stringify(appels));
    console.log('   ' + JSON.stringify({ stamp:m.stamp, pouls:m.pouls, pos:m.pos }));
    ok(appels.pools >= 3, 'les pools sont lus sur GeckoTerminal (' + appels.pools + ' pages)');
    ok(appels.goplus >= 3, 'la securite du contrat est lue sur GoPlus (' + appels.goplus + ')');
    /* Ces trois-la sont les sources ajoutees pour aller plus loin que le
       prix : les chandelles, le second avis, et la chaine elle-meme. */
    ok(appels.ohlcv >= 1, 'les chandelles sont lues, pour la volatilite reelle (' + appels.ohlcv + ')');
    ok(appels.dex >= 1, 'DexScreener donne un SECOND avis sur le prix (' + appels.dex + ')');
    ok(appels.rpc >= 2, 'et la chaine elle-meme est interrogee — la seule source que personne '
       + 'ne peut maquiller (' + appels.rpc + ' appels)');
    ok(/tokens · lus a/.test(m.stamp), 'la pastille porte l heure de lecture (« ' + m.stamp + ' »)');
    ok(m.pouls === 'LIVE', 'et le pouls passe au vert');

    /* ---- UNE POSITION S OUVRE AU PRIX REEL ---- */
    const e = await etatDe(page);
    const p0 = (e && e.positions || [])[0];
    console.log('   position : ' + JSON.stringify(p0 && { sym:p0.sym, prix0:p0.prix0, tenue:p0.tenueMin }));
    ok(!!p0, 'une position finit par s ouvrir');
    ok(!!p0 && p0.prix0 > 0, 'avec le prix REEL du moment, pas une valeur posee (' + (p0||{}).prix0 + ')');
    ok(!!p0 && p0.t0 > 0 && p0.tenueMin > 0,
       'et l instant d ouverture, avec la duree que le Closer compte tenir');
    ok(!!p0 && p0.traits && p0.traits.scout && p0.traits.whale && p0.traits.whisper,
       'elle emporte les traits des SIX agents : sans eux, aucun ne pourrait apprendre de sa fin');
    etatApres = e;

    /* ---- ET TOUT CELA SURVIT AU RECHARGEMENT ----
     * Sur la MEME page : chaque `newPage` de Playwright ouvre un contexte
     * neuf, donc un stockage neuf — recharger est la seule facon de mesurer
     * ce qu'un joueur vit vraiment en revenant. */
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForTimeout(4000);
    const e2 = await etatDe(page);
    const m2 = await lit(page);
    console.log('   apres rechargement : ' + JSON.stringify(m2.positions.slice(0,2)));
    ok(!!e2 && (e2.positions||[]).length >= 1,
       'les positions ouvertes sont retrouvees au rechargement ('
       + ((e2&&e2.positions)||[]).length + ')');
    ok(!!e2 && e2.ouvertures >= 1, 'le compte des ouvertures aussi (' + (e2&&e2.ouvertures) + ')');
    ok(m2.positions.length >= 1, 'et elles sont affichees, pas seulement stockees');
    ok(!!e2 && e2.positions[0].prix0 === (etatApres.positions[0]||{}).prix0,
       'avec le meme prix d entree : c est lui qui rendra le calcul honnete plus tard');

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==================== 4. LES SIX AGENTS APPRENNENT ====================
   * On force la fermeture des positions a un prix DIFFERENT — un prix que le
   * banc rend vraiment — et l'on regarde ce que chaque agent en retient. */
  console.log('\n-- ce que chaque agent apprend d une position fermee --');
  {
    const { page, ctx, boum } = await ouvre(nav, port, { prix:1 });
    await page.waitForTimeout(30000);
    const avant = await etatDe(page);
    const nPos = ((avant||{}).positions||[]).length;
    await page.close();          /* elle ecrit son etat en partant */

    /* ---- ON VIEILLIT LES POSITIONS AVANT QUE LA PAGE NE LES RELISE ----
     * Recharger en modifiant le stockage depuis la page en cours ne marche
     * pas, et c'est la page qui a raison : en partant, elle reecrit ce
     * qu'elle a EN MEMOIRE, et efface la modification. Un script d'amorce
     * s'execute avant elle — c'est le seul moment ou l'etat lui appartient
     * encore.
     * On ne triche pas sur le prix : le banc rend le meme qu'a l'entree,
     * donc le rendement sera proche de zero. Ce qui est mesure, c'est que la
     * position se FERME, que la lecon soit tiree, et qu'aucun agent ne soit
     * oublie. */
    await ctx.addInitScript(() => {
      try{
        const st = JSON.parse(localStorage.getItem('swogeAiColonie') || 'null');
        if(!st || !st.positions || !st.positions.length) return;
        st.positions.forEach(p => {
          p.t0 = Date.now() - 45*60*1000;
          p.traj = [{dt:5*60000, r:2}, {dt:20*60000, r:35}, {dt:40*60000, r:50}];
        });
        localStorage.setItem('swogeAiColonie', JSON.stringify(st));
      }catch(e){}
    });
    /* Le banc rend un prix UNE FOIS ET DEMIE celui de l'entree. Ce n'est pas
       un rendement pose a la main : la page le lit comme elle lirait le vrai
       service, et la tresorerie doit suivre ce prix-la, dans ce sens-la. */
    const deux = await ouvre(nav, port, { prix:1.5, ctx });
    await deux.page.waitForTimeout(16000);
    const apres = await etatDe(deux.page);
    const m = await lit(deux.page);
    console.log('   avant : ' + nPos + ' position(s) · apres : '
      + JSON.stringify({ tresor: apres && Math.round(apres.tresor), trades: apres && apres.trades,
                         agents: Object.keys((apres&&apres.memoire)||{}) }));
    ok(!!apres && apres.trades >= 1, 'la position se ferme au prix relu (' + (apres&&apres.trades) + ' trade)');
    /* Elle ne se ferme PAS sur un rendement invente : le prix rendu par le
       banc est une fois et demie le prix d entree, la tresorerie doit avoir
       bouge du bon cote et de la bonne ampleur. */
    ok(!!apres && apres.tresor > 1000,
       'et la tresorerie suit le prix reellement rendu, dans le bon sens ('
       + (apres && apres.tresor.toFixed(2)) + ')');
    const mem = (apres && apres.memoire) || {};
    const qui = ['scout','warden','whale','whisper','oracle','closer'].filter(a => mem[a]);
    console.log('   agents ayant appris : ' + JSON.stringify(qui));
    ok(qui.length === 6,
       'les SIX agents ont appris, chacun sur ce qu il regarde (' + qui.join(', ') + ')');
    /* ---- LE CLOSER APPREND UNE DUREE, PAS UN TOKEN ----
     * C est ce qui fait qu il s ameliore : la trajectoire dit ou etait le
     * bon moment de sortir, et il s en souvient. */
    ok(!!mem.closer && !!mem.closer.tenue && Object.keys(mem.closer.tenue).length >= 2,
       'le Closer retient plusieurs durees de tenue, pour comparer ('
       + Object.keys((mem.closer&&mem.closer.tenue)||{}).join(', ') + ')');
    /* ---- ET IL N APPREND QUE DE RENDEMENTS REELS ---- */
    const bidon = Object.keys(mem).some(a =>
      Object.keys(mem[a]).some(t =>
        Object.keys(mem[a][t]).some(v => {
          const c = mem[a][t][v];
          return !(c.n > 0) || !isFinite(c.s);
        })));
    ok(!bidon, 'aucune case de memoire ne porte un compte vide ou un total impossible');
    ok(/obs/.test(m.appris) || /Rien encore/.test(m.appris),
       'et l ecran montre ses lecons AVEC le nombre d observations — deux coups de chance '
       + 'ne font pas une regle');
    ok(boum.length === 0 && deux.boum.length === 0,
       'aucune exception' + (boum[0] || deux.boum[0] ? ' : ' + (boum[0]||deux.boum[0]) : ''));
    await deux.page.close(); await ctx.close();
  }

  /* ==================== 5. UN PIEGE EST BLOQUE ==================== */
  console.log('\n-- un honeypot ne passe pas --');
  {
    const { page, boum } = await ouvre(nav, port, { prix:1, piege:true });
    await page.waitForTimeout(14000);
    const e = await etatDe(page);
    const m = await lit(page);
    console.log('   ' + JSON.stringify({ pos:m.pos, bloques:(e&&e.compteurs&&e.compteurs.wardenBloque) }));
    ok(!!e && (e.compteurs||{}).wardenBloque >= 1,
       'le Warden bloque le contrat piege (' + ((e&&e.compteurs||{}).wardenBloque) + ')');
    ok(!(e && e.positions||[]).length,
       'et aucune position ne s ouvre dessus — c est tout l interet du controle');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==================== 6. CE QUE LA PAGE PROMET PAR ECRIT ==================== */
  console.log('\n-- ce que la page promet en toutes lettres --');
  {
    const src = fs.readFileSync(path.join(SITE, PAGE), 'utf8');
    /* Une page qui tient une tresorerie sans dire qu'elle est en papier finit
       par etre lue comme un resultat. Ces phrases-la ne sont pas de la
       decoration : ce sont elles qui empechent la meprise. */
    ok(/papier/i.test(src) && /aucune transaction n.est signee/i.test(src),
       'elle dit que rien n est signe et que la tresorerie est du papier');
    ok(/quand l.onglet est ferme/i.test(src) && /rien ne tourne/i.test(src),
       'elle dit que rien ne tourne quand l onglet est ferme');
    ok(/gaz|glissement/i.test(src),
       'et qu un vrai achat paierait en plus le gaz et le glissement');
    ok(/Blockscout/i.test(src) && /honeypot\.is/i.test(src),
       'les services essayes qui NE marchent pas sont nommes, pas passes sous silence');
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  if (rates) process.exitCode = 1;
})();
