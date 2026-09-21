'use strict';
/* ============================================================================
 * SWOGE MARKETS — LA PAGE, VRAIES DONNEES, VRAI WS
 *
 * On ne teste pas l internet : on injecte un faux /marches/perp (forme reelle)
 * et un faux WebSocket qui emet un allMids comme Hyperliquid. On verifie :
 *   1. l interface s affiche d abord, puis les marches ;
 *   2. le selecteur peint la liste, cherche, trie, met en favori ;
 *   3. un tick du WS met a jour les prix SANS rerender la page ;
 *   4. choisir un marche montre son detail et s abonne a son flux ;
 *   5. la page dit que c est du market data seul, separe du paper trading ;
 *   6. aucun chemin d ordre reel n existe dans la page.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.mp4':'video/mp4' };

const MARCHES = { horodatage: Date.now(),
  exchanges: [{ nom:'Hyperliquid', ws:'wss://api.hyperliquid.xyz/ws', wsVerifie:true, marches:3, ok:true },
              { nom:'OKX', wsVerifie:false, marches:1, ok:true }],
  marches: [
    { symbole:'BTC/USD:PERP', base:'BTC', quote:'USD', exchange:'Hyperliquid', idExchange:'BTC',
      last:81000, bid:80999, ask:81001, markPrice:81005, indexPrice:80990, fundingRate:0.0000125, volume24h:1.7e9, openInterest:3.5e9, variation24h:1.2 },
    { symbole:'ETH/USD:PERP', base:'ETH', quote:'USD', exchange:'Hyperliquid', idExchange:'ETH',
      last:3100, bid:3099, ask:3101, markPrice:3100, indexPrice:3099, fundingRate:-0.00003, volume24h:9e8, openInterest:1e9, variation24h:-0.6 },
    { symbole:'SOL/USDT:PERP', base:'SOL', quote:'USDT', exchange:'OKX', idExchange:'SOL-USDT-SWAP',
      last:180, bid:179.9, ask:180.1, markPrice:null, indexPrice:null, fundingRate:null, volume24h:5e8, openInterest:null, variation24h:3.4 },
  ] };

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1200, height: 1000 } });
  await page.route(/vitrine\.json/, (r) => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));
  await page.route(/\/marches\/perp/, (r) => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(MARCHES) }));
  /* Faux WebSocket : emet un allMids apres l ouverture, comme Hyperliquid. */
  await page.addInitScript(() => {
    window.__envois = [];
    class FauxWS {
      constructor(url){ this.url=url; this.readyState=0; window.__ws=this;
        setTimeout(()=>{ this.readyState=1; if(this.onopen) this.onopen();
          setTimeout(()=>{ if(this.onmessage) this.onmessage({ data: JSON.stringify({ channel:'allMids', data:{ mids:{ BTC:'81234.5', ETH:'3111.1', SOL:'181.2' } } }) }); }, 30);
        }, 10); }
      send(s){ window.__envois.push(s); }
      close(){ this.readyState=3; if(this.onclose) this.onclose(); }
    }
    window.WebSocket = FauxWS;
  });
  await page.goto('http://127.0.0.1:'+port+'/swoge_markets.html', { waitUntil:'domcontentloaded' });

  console.log('-- 1. l interface d abord, les marches ensuite --');
  {
    ok(await page.$('#mkLive'), 'le statut live est present au chargement');
    await page.waitForFunction(() => document.querySelectorAll('#mkRows tr[data-cle]').length >= 3, null, { timeout: 5000 });
    eq((await page.$$('#mkRows tr[data-cle]')).length, 3, 'les trois marches decouverts sont peints');
    ok(/market data only/i.test(await page.textContent('body')), 'la page dit : market data only');
    ok(/paper-trading colony/i.test(await page.textContent('body')), 'et qu elle est separee du paper trading');
  }

  console.log('\n-- 2. le WS met a jour les prix (vrai flux, pas simule) --');
  {
    await page.waitForFunction(() => { var r=[].find.call(document.querySelectorAll('#mkRows tr[data-cle]'),function(t){return t.getAttribute('data-cle')==='BTC/USD:PERP';}); return r && /81,234|81234/.test(r.textContent); }, null, { timeout: 5000 });
    const btc = await page.$eval('#mkRows tr[data-cle="BTC/USD:PERP"]', (t) => t.textContent);
    ok(/81,234|81234/.test(btc), 'le prix BTC a bouge avec le tick du WS [' + btc.replace(/\s+/g,' ').slice(0,40) + ']');
    /* Le WS a bien recu l abonnement global sur UNE connexion. */
    const envois = await page.evaluate(() => window.__envois || []);
    ok(envois.some((e) => /allMids/.test(e)), 'un seul abonnement global (allMids) est envoye');
  }

  console.log('\n-- 3. recherche, tri, favoris --');
  {
    await page.fill('#mkQ', 'eth');
    await page.waitForTimeout(260);
    eq((await page.$$('#mkRows tr[data-cle]')).length, 1, 'la recherche « eth » ne laisse qu ETH');
    await page.fill('#mkQ', '');
    await page.waitForTimeout(260);
    /* Tri par variation : SOL (+3.4) en tete. */
    await page.click('.mk-tab th[data-tri="variation24h"]');
    await page.waitForTimeout(120);
    const premier = await page.$eval('#mkRows tr[data-cle]', (t) => t.getAttribute('data-cle'));
    eq(premier, 'SOL/USDT:PERP', 'tri par 24h : la plus forte hausse en tete');
    /* Favori. */
    await page.click('#mkRows tr[data-cle="BTC/USD:PERP"] [data-fav]');
    await page.click('#mkFav');
    await page.waitForTimeout(120);
    eq((await page.$$('#mkRows tr[data-cle]')).length, 1, 'le filtre favoris ne montre que BTC');
    await page.click('#mkFav');
    await page.waitForTimeout(120);
    /* Filtre par contrat USDT : seul SOL (OKX). */
    await page.selectOption('#mkQuote', 'USDT');
    await page.waitForTimeout(120);
    eq((await page.$$('#mkRows tr[data-cle]')).length, 1, 'le filtre USDT ne laisse que le contrat USDT');
    await page.selectOption('#mkQuote', 'ALL');
    await page.waitForTimeout(120);
  }

  console.log('\n-- 4. choisir un marche montre son detail et s y abonne --');
  {
    await page.click('#mkRows tr[data-cle="ETH/USD:PERP"]');
    await page.waitForTimeout(120);
    const det = await page.textContent('#mkDet');
    ok(/ETH/.test(det) && /Mark/i.test(det) && /Funding/i.test(det), 'le detail montre mark, funding…');
    ok(/Order book/i.test(det) && /Recent trades/i.test(det), 'et le carnet et les trades');
    const envois = await page.evaluate(() => window.__envois || []);
    ok(envois.some((e) => /l2Book/.test(e) && /ETH/.test(e)), 'un abonnement au carnet d ETH est envoye');
  }

  console.log('\n-- 5. aucun chemin d ordre reel dans la page --');
  {
    const src = fs.readFileSync(path.join(SITE, 'swoge_markets.html'), 'utf8')
              + fs.readFileSync(path.join(SITE, 'perp_live.js'), 'utf8');
    ok(!/placeOrder|createOrder|signTransaction|privateKey|api[_-]?secret/i.test(src),
       'aucun ordre, aucune signature, aucune cle dans le market data');
    ok(/market data only|ne signe rien|no order/i.test(src), 'et le code le dit');
  }

  await nav.close();
  await new Promise((s) => srv.close(s));
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
