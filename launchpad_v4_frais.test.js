'use strict';
/* ============================================================================
 * LES CREATEURS V4 RECOLTENT LEURS FRAIS SUR launchpad.html (30/09/2026)
 *
 * Avant : aucun ecran du site ne connaissait les launchpads V4 — un createur
 * n'avait aucun moyen de recolter sa part. Cet essai lit la VRAIE chaine
 * (les appels RPC sont relayes par Node, comme launchpad_v3.test.js) avec le
 * portefeuille de deploiement du serveur, createur reel des deux jetons de
 * test du 30/09. Ce qu'il tient :
 *   1. les deux jetons V4 apparaissent dans « Tokens you created » ;
 *   2. la part affichee est 50 % (le contrat : CREATOR_SHARE_BPS = 5000), pas
 *      les 70 % du V2 ;
 *   3. « Collect » vise le contrat V4 lu dans lance_v4.js — une seule source
 *      d'adresses —, et le bouton « Open » (trading de la page, qui ne sait
 *      pas echanger un V4) n'est pas propose ;
 *   4. aucune erreur de script ;
 *   5. la grille et les brulages se lisent : le noeud refuse depuis le 30/09 toute
 *      lecture de journaux de plus de 10 M blocs, et la page lisait tout depuis 0.
 * Rien n'est signe : il n'y a pas de portefeuille ici.
 * ==========================================================================*/
const http = require('http'), fs = require('fs'), path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const SITE = __dirname, RPC = 'https://rpc.mainnet.chain.robinhood.com';
const CREATEUR = '0x49eE9527b6dE4Ba880e3205E1b31e78E43544e93';
const JETONS = ['0xdC6d2f3224d3B592845921cDDc3b13811e3ea7C5', '0xABa8408eB41a1FfA092d3101C404937785a3B16D'];
const ETHERS = [path.join(__dirname, '..', 'swoge-pusher-server.github.io', 'node_modules', 'ethers', 'dist', 'ethers.umd.min.js')]
  .concat((process.env.NODE_PATH || '').split(':').map((d) => path.join(d, 'ethers', 'dist', 'ethers.umd.min.js'))).find((f) => fs.existsSync(f));
const T = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css' };

(async () => {
  if (!chromium || !ETHERS) { console.log('  RATE playwright ou ethers.umd.min.js absent — essai impossible'); process.exit(1); }
  const lv4 = fs.readFileSync(path.join(SITE, 'lance_v4.js'), 'utf8');
  const LP = { swoge: lv4.match(/swoge: \{ adresse: "(0x[0-9a-fA-F]{40})"/)[1], eth: lv4.match(/eth: +\{ adresse: "(0x[0-9a-fA-F]{40})"/)[1] };
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.route('https://**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/ethers*.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(ETHERS) }));
  await ctx.route(RPC + '**', async (r) => {
    try { const rep = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: r.request().postData() });
      r.fulfill({ status: rep.status, contentType: 'application/json', body: await rep.text() }); }
    catch (e) { r.fulfill({ status: 502, body: '{}' }); }
  });
  /* Un portefeuille qui annonce le createur, relaie les lectures au noeud, et NOTE puis REFUSE
     toute transaction (code 4001, comme un joueur qui clique « Rejeter ») : rien n est signe. */
  await ctx.addInitScript(({ moi, rpc }) => {
    window.__envois = [];
    let id = 0;
    window.ethereum = {
      isMetaMask: true, on() {}, removeListener() {},
      async request({ method, params }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [moi];
        if (method === 'eth_chainId') return '0x1237';
        if (method === 'net_version') return '4663';
        if (method === 'eth_sendTransaction') { window.__envois.push(params[0]); const e = new Error('User rejected the request.'); e.code = 4001; throw e; }
        const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: params || [] }) });
        const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; } return j.result;
      },
    };
  }, { moi: CREATEUR, rpc: RPC });
  const pg = await ctx.newPage();
  const erreurs = [];
  pg.on('pageerror', (e) => erreurs.push(String(e.message || e)));
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/launchpad.html', { waitUntil: 'load' });
  await pg.waitForTimeout(1500);

  /* 30/09 : le noeud refuse toute lecture de journaux de plus de 10 M blocs (chaine a 76,5 M) ;
     chaque balayage depuis le bloc 0 echouait en silence et la grille restait VIDE. */
  console.log('\n-- la grille de tous les jetons se remplit (lecture par tranches) --');
  await pg.click('.tab[data-tab="explore"]');
  await pg.waitForFunction(() => document.querySelectorAll('#list > *').length > 0, { timeout: 120000 }).catch(() => {});
  const nGrille = await pg.evaluate(() => document.querySelectorAll('#list > *').length);
  ok(nGrille >= 10, nGrille + ' jetons dans la grille (V2 et V3, lus sur la vraie chaine)');

  console.log('\n-- le createur reel se connecte, onglet Portfolio --');
  await pg.click('#walletBtn');
  await pg.click('#wpickList .wrow:has-text("Browser wallet")');
  await pg.waitForFunction(() => /0x49eE/i.test(document.querySelector('#walletBtn').textContent || ''), { timeout: 20000 }).catch(() => {});
  await pg.click('.tab[data-tab="mine"]');
  await pg.waitForFunction(() => /Tokens you created/.test(document.querySelector('#mineList').textContent || ''), { timeout: 120000 }).catch(() => {});
  const vue = await pg.evaluate((js) => {
    const h = document.querySelector('#mineList');
    const carte = (j) => { const b = h.querySelector('[data-collect="' + j + '"]'); return b ? b.closest('.card') : null; };
    return { texte: h.textContent, collect: js.map((j) => !!carte(j)), open: js.map((j) => !!(carte(j) && carte(j).querySelector('button[data-open]'))),
             cartes: js.map((j) => (carte(j) ? carte(j).textContent : '')) };
  }, JETONS);
  ok(/SWV4TEST/.test(vue.texte) && /SWV4WTEST/.test(vue.texte), 'les deux jetons V4 du createur apparaissent dans « Tokens you created » (SWV4TEST, SWV4WTEST)');
  ok(vue.collect.every(Boolean), 'chacun a son bouton « Collect »');
  ok(!vue.open.some(Boolean), 'pas de bouton « Open » sur un V4 : le trading de la page ne sait pas les echanger');
  ok(vue.cartes.every((t) => !/70%/.test(t)), 'aucune part de 70 % annoncee sur un jeton V4');
  ok(/You burned/.test(vue.texte) && !/Could not load burns/.test(vue.texte), 'la section des $SWOGE brules se charge (elle affichait « Could not load burns »)');

  console.log('\n-- « Collect » demande la transaction au bon contrat --');
  const selecteur = new (require(path.join(path.dirname(ETHERS), '..', 'lib', 'index.js')).utils.Interface)(['function collectFees(address)']).getSighash('collectFees');
  for (const [i, lp] of [[0, LP.swoge], [1, LP.eth]]) {
    await pg.evaluate(() => { window.__envois.length = 0; });
    await pg.click('[data-collect="' + JETONS[i] + '"]');
    await pg.waitForFunction(() => window.__envois.length > 0, { timeout: 30000 }).catch(() => {});
    const env = await pg.evaluate(() => window.__envois[0] || null);
    ok(!!env && env.to && env.to.toLowerCase() === lp.toLowerCase() && String(env.data).slice(0, 10) === selecteur
       && String(env.data).toLowerCase().includes(JETONS[i].slice(2).toLowerCase()),
       (i ? 'WETH' : '$SWOGE') + ' : collectFees(' + JETONS[i].slice(0, 10) + '…) demande au launchpad V4 ' + lp.slice(0, 10) + '…' + (env ? '' : ' [aucune demande]'));
    const note = await pg.textContent('[data-cnote="' + JETONS[i] + '"]');
    ok(/Failed|rejected/i.test(note || ''), 'refusee dans le portefeuille : la page le dit, rien n est parti [' + String(note).slice(0, 50) + ']');
  }
  const src = fs.readFileSync(path.join(SITE, 'contrats', 'SwogeFunV4.sol'), 'utf8') + fs.readFileSync(path.join(SITE, 'contrats', 'SwogeFunV4Weth.sol'), 'utf8');
  ok((src.match(/CREATOR_SHARE_BPS = 5000/g) || []).length === 2 && /50% creator/.test(fs.readFileSync(path.join(SITE, 'launchpad.html'), 'utf8')),
     'la page annonce 50 % au createur, ce que disent les deux contrats (CREATOR_SHARE_BPS = 5000)');

  ok(erreurs.length === 0, erreurs.length ? 'erreurs de script : ' + erreurs.slice(0, 2).join(' | ') : 'aucune erreur de script');
  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
