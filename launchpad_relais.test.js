'use strict';
/* ============================================================================
 * LE LAUNCHPAD QUAND LE NAVIGATEUR REFUSE LE NOEUD OFFICIEL (18/10/2026)
 *
 * Le defaut : « The launchpads could not be read from the Robinhood Chain
 * node. Press Reload. », et SWAI absent d'Explore. Le 18/10, un Chromium sans
 * tete voyait CHAQUE eth_getLogs du noeud officiel refuse (« Access-Control-
 * Allow-Origin header contains multiple values '*,*' ») alors que les memes
 * lectures, faites depuis le serveur, reussissaient toutes.
 *
 *   A. lecteur_rh.js seul, dans Node, contre un faux noeud qui coupe ses
 *      connexions : la meme requete repasse par le relais, la page y reste
 *      COLLE_MS ; une erreur du noeud (revert) n'est PAS une panne ; 6
 *      eth_getLogs en vol au plus ; retour au noeud une fois le delai passe.
 *   B. launchpad.html, Explore : chaque POST vers rpc.mainnet.chain.robinhood.com
 *      est AVORTE (route.abort('failed') : l'equivalent, pour la page, d'une
 *      reponse que le navigateur jette). Le relais est le VRAI module du serveur
 *      (relais_rpc.js), sur un port local, devant un fork anvil LOCAL du
 *      reseau principal. Explore liste les lanceurs ET les jetons V5 (SWAI).
 *   C. la fiche de SWAI : le devis d'achat passe par le relais et vaut celui
 *      du V4Quoter lu directement sur le fork.
 * Aucune transaction n'est signee ni envoyee sur une chaine reelle.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let ethers = null; try { ethers = require('ethers').ethers; } catch (e) {}
const banc = require('./outils/banc_v5.js');
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const SITE = __dirname, SERVEUR = path.join(__dirname, '..', 'swoge-pusher-server.github.io');
const SWAI = '0x83aB87625404B63f27d8289b9E50fFd3ED2F5d22';
const ecoute = (srv) => new Promise((s) => srv.listen(0, '127.0.0.1', () => s('http://127.0.0.1:' + srv.address().port)));

/* Un relais local : relais_rpc.js du serveur, ses en-tetes, ses bornes ; compte ce qu'il sert. */
async function relaisLocal(amont) {
  const R = require(path.join(SERVEUR, 'relais_rpc.js')).cree({ amont });
  const vu = { methodes: [], envol: 0, envolMax: 0 };
  const srv = http.createServer((q, r) => {
    if (q.url.split('?')[0] !== '/rpc/rh') { r.writeHead(404, { 'access-control-allow-origin': '*' }); return r.end(); }
    if (q.method !== 'POST') return R.sert(q, r, '127.0.0.1');
    let b = []; q.on('data', (c) => b.push(c));
    q.on('end', async () => {
      let corps = {}; try { corps = JSON.parse(Buffer.concat(b).toString()); } catch (e) {}
      const ms = (Array.isArray(corps) ? corps : [corps]).map((x) => x && x.method);
      vu.methodes.push(...ms);
      const logs = ms.includes('eth_getLogs');
      if (logs) { vu.envol++; vu.envolMax = Math.max(vu.envolMax, vu.envol); }
      const rep = await R.traite(Buffer.concat(b).toString(), '127.0.0.1');
      if (logs) vu.envol--;
      r.writeHead(rep.status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
      r.end(JSON.stringify(rep.corps));
    });
  });
  const base = await ecoute(srv);
  return { base, url: base + '/rpc/rh', vu, R, close: () => srv.close() };
}

(async () => {
  const ETHERS = banc.ethersUmd(SERVEUR);
  if (!chromium || !ethers || !ETHERS) { console.log('  RATE playwright ou ethers absent — essai impossible'); process.exit(1); }
  const u = ethers.utils;
  const LR = require('./lecteur_rh.js');
  let nav = null, fork = null;
  try {
    console.log('-- A. lecteur_rh.js seul : le relais quand le transport tombe --');
    {
      /* Le faux noeud : coupe la connexion tant que `coupe`, rend un revert pour eth_call 0xdead, compte ses eth_getLogs en vol. */
      const etat = { coupe: true, vus: 0, envol: 0, envolMax: 0 };
      const noeud = http.createServer((q, r) => {
        let b = ''; q.on('data', (c) => { b += c; });
        q.on('end', () => {
          etat.vus++;
          if (etat.coupe) return r.destroy();
          const j = JSON.parse(b);
          const rend = (x) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify(Object.assign({ jsonrpc: '2.0', id: j.id }, x))); };
          if (j.method === 'eth_chainId') return rend({ result: '0x1237' });
          if (j.method === 'eth_blockNumber') return rend({ result: '0x100' });
          if (j.method === 'eth_call') return rend({ error: { code: 3, message: 'execution reverted', data: '0x' } });
          if (j.method === 'eth_getLogs') { etat.envol++; etat.envolMax = Math.max(etat.envolMax, etat.envol); return setTimeout(() => { etat.envol--; rend({ result: [] }); }, 60); }
          rend({ result: '0x0' });
        });
      });
      const NOEUD = await ecoute(noeud);
      const sain = http.createServer((q, r) => {   // un second « noeud » sain, devant lequel on met le vrai relais
        let b = ''; q.on('data', (c) => { b += c; });
        q.on('end', () => { const j = JSON.parse(b); r.writeHead(200, { 'content-type': 'application/json' });
          r.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, result: j.method === 'eth_chainId' ? '0x1237' : j.method === 'eth_getLogs' ? [] : j.method === 'eth_blockNumber' ? '0x100' : '0x2a' })); });
      });
      const rl = await relaisLocal(await ecoute(sain));
      let t = 1e12;
      const L = LR.cree({ ethers, url: NOEUD, relais: rl.url, chainId: 4663, maintenant: () => t });
      const b = await L.getBlockNumber();
      ok(b === 0x100 && L.sources.relay >= 1 && L.sources.bascules === 1, 'le noeud coupe la connexion : getBlockNumber servi par le relais (' + b + ')');
      ok(L.surRelais(), 'et la page reste sur le relais');
      etat.coupe = false; const avant = etat.vus;
      await L.send('eth_getBalance', ['0x' + '11'.repeat(20), 'latest']);
      ok(etat.vus === avant, 'pendant COLLE_MS (' + LR.COLLE_MS / 60000 + ' min) : le noeud n est plus essaye');
      t += LR.COLLE_MS + 1;
      await L.send('eth_getBalance', ['0x' + '11'.repeat(20), 'latest']);
      ok(etat.vus === avant + 1 && !L.surRelais(), 'le delai passe : retour au noeud officiel');
      const rv = rl.vu.methodes.length;
      let err = null; try { await L.send('eth_call', [{ to: '0x' + '11'.repeat(20), data: '0xdead' }, 'latest']); } catch (e) { err = e; }
      ok(err && !LR.panne(err) && rl.vu.methodes.length === rv, 'un revert du noeud n est pas une panne : il remonte, le relais n est pas appele');
      await Promise.all(Array.from({ length: 20 }, (_, i) => L.send('eth_getLogs', [{ fromBlock: '0x' + i.toString(16), toBlock: '0x' + i.toString(16) }])));
      ok(etat.envolMax <= LR.ENVOL_MAX && etat.envolMax >= 2, '20 eth_getLogs lances d un coup : au plus ' + LR.ENVOL_MAX + ' en vol au noeud (vu ' + etat.envolMax + ')');
      ok(LR.panne(new TypeError('Failed to fetch')) && LR.panne({ code: 'SERVER_ERROR', reason: 'bad response', status: 429 })
        && LR.panne({ code: 'SERVER_ERROR', reason: 'missing response' }) && LR.panne({ code: 'TIMEOUT' })
        && !LR.panne({ code: 'SERVER_ERROR', reason: 'processing response error', body: '{}', error: { code: -32005 } }), 'panne : TypeError, 429, missing response, delai — pas une erreur JSON-RPC du noeud');
      noeud.close(); sain.close(); rl.close();
    }

    console.log('\n-- B. Explore, noeud officiel refuse par le navigateur, relais local devant un fork --');
    fork = await banc.anvil();
    const P = new ethers.providers.JsonRpcProvider(fork.url, 4663);
    const bloc = await P.getBlockNumber();
    ok(true, 'fork anvil local au bloc ' + bloc + ' (PID ' + fork.pid + ')');
    const rl = await relaisLocal(fork.url);
    nav = await chromium.launch();
    const srv = await banc.serveur(SITE);
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 1000 } });
    await ctx.route('https://**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await ctx.route('**/ethers*.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(ETHERS) }));
    let avortes = 0;
    await ctx.route(banc.RPC_CHAINE + '**', (r) => { avortes++; return r.abort('failed'); });
    const MOI = await banc.compteNeuf(fork, ethers, 1);
    await banc.portefeuille(ctx, fork, MOI);
    const pg = await ctx.newPage(), erreurs = [];
    pg.on('pageerror', (e) => erreurs.push(String(e.message || e)));
    const t0 = Date.now();
    await pg.goto(srv.base + '/launchpad.html?server=' + encodeURIComponent(rl.base), { waitUntil: 'load' });
    await pg.click('.tab[data-tab="explore"]');
    await pg.waitForFunction(() => /launched/.test(document.querySelector('#listInfo').textContent) || /could not/.test(document.querySelector('#list').textContent), null, { timeout: 240000 }).catch(() => {});
    const info = await pg.textContent('#listInfo'), liste = await pg.textContent('#list');
    const cartes = await pg.$$eval('#list .tcard', (cs) => cs.map((c) => ({ a: c.getAttribute('data-addr').toLowerCase(), v5: c.hasAttribute('data-v5') })));
    ok(!/could not be read/.test(liste), 'pas de « The launchpads could not be read »');
    ok(/^\d+ launched$/.test(info.trim()), 'chaque lanceur lu : « ' + info.trim() + ' » (en ' + Math.round((Date.now() - t0) / 1000) + ' s)');
    ok(cartes.some((c) => c.a === SWAI.toLowerCase() && c.v5), 'SWAI (V5) est dans Explore');
    ok(cartes.some((c) => !c.v5), 'et les jetons des lanceurs V2/V3/V4 aussi (' + cartes.filter((c) => !c.v5).length + ' cartes)');
    ok(avortes > 0, 'le noeud officiel a bien ete essaye et refuse (' + avortes + ' POST avortes)');
    const nLogs = rl.vu.methodes.filter((m) => m === 'eth_getLogs').length;
    ok(nLogs > 6 && rl.vu.envolMax <= 6, nLogs + ' eth_getLogs servis par le relais, au plus ' + rl.vu.envolMax + ' en vol (borne : 6)');
    ok(await pg.getAttribute('html', 'data-rpc-source') === 'relay', 'data-rpc-source = relay (attribut de debogage seulement)');
    ok(!/relay|node/i.test(await pg.innerText('#tab-explore')), 'aucun mot « relay » / « node » montre au joueur dans Explore');
    console.log('       mesure : un chargement d Explore = ' + rl.vu.methodes.length + ' appels au relais (' + nLogs + ' eth_getLogs) ; refus du relais : '
      + JSON.stringify((({ refus_debit, refus_plage, refus_methode }) => ({ refus_debit, refus_plage, refus_methode }))(rl.R.etat())));
    ok(rl.R.etat().refus_debit === 0 && rl.R.etat().refus_plage === 0, 'aucun appel refuse par le debit ni par la plage');

    console.log('\n-- C. la fiche de SWAI : le devis passe par le relais --');
    const M = require('./echange_v5.js'); M.ethers = ethers; const X = M.SwogeV5Echange;
    /* le module lit contrats/v5/adresses_v5.json par fetch : dans Node, le fichier du depot */
    const J = JSON.parse(fs.readFileSync(path.join(SITE, 'contrats/v5/adresses_v5.json'), 'utf8'));
    global.fetch = ((f) => async (url, o) => (String(url).endsWith('adresses_v5.json') ? { ok: true, json: async () => J } : f(url, o)))(global.fetch);
    X.initialise({ lecteur: P });
    await pg.goto(srv.base + '/launchpad.html?server=' + encodeURIComponent(rl.base) + '&token=' + SWAI, { waitUntil: 'load' });
    await pg.waitForFunction(() => /SWAI/.test(document.querySelector('#tvSym').textContent), null, { timeout: 60000 }).catch(() => {});
    ok(/\$SWAI/.test(await pg.textContent('#tvSym')), 'la fiche s ouvre : ' + (await pg.textContent('#tvSym')));
    const avant = rl.vu.methodes.filter((m) => m === 'eth_call').length;
    await pg.fill('#buyEth', '0.001');
    await pg.waitForFunction(() => document.querySelector('#buyOut').getAttribute('data-v'), null, { timeout: 60000 }).catch(() => {});
    const montre = +(await pg.getAttribute('#buyOut', 'data-v'));
    const q = await X.devis(await X.info(SWAI), true, u.parseEther('0.001'));
    ok(montre > 0 && Math.abs(montre / +u.formatEther(q) - 1) < 1e-9, 'le devis montre (' + montre + ') = V4Quoter lu sur le fork (' + u.formatEther(q) + ')');
    ok(rl.vu.methodes.filter((m) => m === 'eth_call').length > avant, 'et il est passe par le relais (eth_call)');
    ok(!rl.vu.methodes.includes('eth_sendRawTransaction'), 'aucun eth_sendRawTransaction n a jamais atteint le relais');
    ok(erreurs.length === 0, 'aucune erreur de page' + (erreurs.length ? ' : ' + erreurs.slice(0, 2).join(' | ') : ''));
    await ctx.close(); srv.close(); rl.close();
  } catch (e) {
    ok(false, 'EXCEPTION ' + (e && e.stack || e));
  } finally {
    try { if (nav) await nav.close(); } catch (e) {}
    if (fork) fork.stop();
  }
  if (rates) { console.log('RATES : ' + rates + '/' + n); process.exit(1); }
  console.log('launchpad_relais.test.js : ' + n + ' verifications OK');
  process.exit(0);
})();
