'use strict';
/* ============================================================================
 * LE BANC COMMUN DES ESSAIS V5 : un fork anvil LOCAL de Robinhood Chain, un
 * serveur de fichiers du site, et un faux portefeuille relie a un compte anvil
 * DEVERROUILLE (18/10/2026).
 *
 * Rien ne quitte la machine en ecriture : anvil lit l'etat de la vraie chaine
 * (eth_getCode, eth_getStorageAt...) et garde chaque transaction pour lui. Les
 * transactions partent par eth_sendTransaction d'un compte IMPERSONNE (anvil
 * signe lui-meme) : aucune cle n'est lue, ecrite ni transmise par l'essai.
 *
 *   ANVIL        binaire anvil (defaut : `anvil` du PATH)
 *   V5_FORK_URL  noeud a forker (defaut : le RPC public de Robinhood Chain, en lecture)
 *
 * Utilise par v5_deploy_page.test.js et launchpad_v5.test.js.
 * ==========================================================================*/
const http = require('http'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');

const RPC_CHAINE = 'https://rpc.mainnet.chain.robinhood.com';
/* Le relais JSON-RPC du serveur (/rpc/rh, relais_rpc.js du serveur), quel que soit l hote. Une expression
   et non un motif : mesure du 18/10/2026, Playwright 1.56.1 laissait passer vers le reseau des POST que
   `https://**` aurait du intercepter (web-production-220a3.up.railway.app, example.com). */
const RELAIS_RE = /^https:\/\/[^/]+\/rpc\/rh(\?.*)?$/;
const T = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.ico': 'image/x-icon' };

function ethersUmd(serveur) {
  return [path.join(serveur, 'node_modules', 'ethers', 'dist', 'ethers.umd.min.js')]
    .concat((process.env.NODE_PATH || '').split(':').map((d) => path.join(d, 'ethers', 'dist', 'ethers.umd.min.js')))
    .find((f) => fs.existsSync(f));
}

async function rpcVers(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || [] }) });
  const j = await r.json();
  if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data });
  return j.result;
}

/** Lance anvil en fork local, chaine 4663. Tue par PID, jamais par nom. */
async function anvil() {
  const bin = process.env.ANVIL || 'anvil';
  const port = 20000 + Math.floor(Math.random() * 20000);
  const fork = process.env.V5_FORK_URL || RPC_CHAINE;
  const p = spawn(bin, ['--fork-url', fork, '--chain-id', '4663', '--port', String(port), '--silent',
    '--gas-limit', '32000000', '--code-size-limit', '24576'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  const url = 'http://127.0.0.1:' + port;
  const stop = () => { try { process.kill(p.pid, 'SIGTERM'); } catch (e) {} };
  process.on('exit', stop);
  for (let i = 0; i < 120; i++) {
    if (p.exitCode != null) throw new Error('anvil s est arrete : ' + err.slice(0, 300));
    try { const c = await rpcVers(url, 'eth_chainId'); if (c === '0x1237') return { url, pid: p.pid, stop, rpc: (m, a) => rpcVers(url, m, a) }; } catch (e) {}
    await new Promise((ok) => setTimeout(ok, 500));
  }
  stop();
  throw new Error('anvil ne repond pas sur ' + url);
}

/* Un compte NEUF, impersonne dans le fork : 20 octets au hasard (aucune cle n'existe pour lui), du gaz, et
   anvil signe ses eth_sendTransaction. Pas les comptes par defaut d'anvil : le 18/10/2026, les cinq premiers
   portent sur Robinhood Chain une delegation EIP-7702 (code 0xef0100…8a67b502…408a), un balayeur qui
   renvoie aussitot l'ETH recu — le tresor de l'essai ne gardait pas ses 0,0005 ETH. */
async function compteNeuf(fork, ethers, eth) {
  const u = ethers.utils, a = u.getAddress(u.hexlify(u.randomBytes(20)));
  await fork.rpc('anvil_impersonateAccount', [a]);
  await fork.rpc('anvil_setBalance', [a, u.parseEther(String(eth == null ? 100 : eth)).toHexString()]);
  const code = await fork.rpc('eth_getCode', [a, 'latest']);
  if (code && code !== '0x') throw new Error('compte neuf avec du code : ' + a);
  return a;
}

/** Serveur de fichiers du site ; `remplace` : { '/chemin': contenu | null (404) } pour un essai. */
async function serveur(site, remplace) {
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    if (remplace && Object.prototype.hasOwnProperty.call(remplace, u)) {
      const v = typeof remplace[u] === 'function' ? remplace[u]() : remplace[u];
      if (v == null) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(u)] || 'application/octet-stream' }); return r.end(v);
    }
    const f = path.join(site, u);
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  return { srv, base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() };
}

/* Le RPC public de la chaine est detourne vers le fork ; tout autre https rend 503 (aucun prix, aucun
   service tiers) ; ethers est servi depuis node_modules. */
/* `sansJournaux` : eth_getLogs rend [] — le launchpad balaie l'historique V2/V3/V4 par tranches de 9 M
   de blocs, qu'anvil irait chercher sur le vrai noeud ; la section V5 n'en lit aucun.
   `journauxDe` : sauf pour ces adresses (le noyau V5 et le PoolManager : quelques milliers de blocs
   depuis le deploiement de V5, lus par l'echange et le portefeuille V5). */
async function routes(ctx, fork, ethersFichier, opts) {
  const sansJournaux = !!(opts && opts.sansJournaux);
  const permis = ((opts && opts.journauxDe) || []).map((a) => String(a).toLowerCase());
  await ctx.route('https://**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/ethers*.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(ethersFichier) }));
  const versFork = async (r) => {
    let corps = r.request().postData() || '{}';
    if (sansJournaux) {
      const q = JSON.parse(corps), un = (x) => (x && x.method === 'eth_getLogs' && !(x.params && x.params[0] && permis.includes(String(x.params[0].address || '').toLowerCase()))
        ? { jsonrpc: '2.0', id: x.id, result: [] } : null);
      if (!Array.isArray(q) && un(q)) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(un(q)) });
    }
    const rep = await fetch(fork.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: corps });
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: await rep.text() });
  };
  await ctx.route(RPC_CHAINE + '**', versFork);
  /* 18/10/2026 : le lecteur du launchpad (lecteur_rh.js) repasse une lecture ratee par le relais du
     serveur (/rpc/rh). Il va au MEME fork : sinon une lecture pourrait tomber sur la vraie chaine. */
  await ctx.route(RELAIS_RE, versFork);
}

/* Le faux portefeuille : window.ethereum dont chaque requete passe par Node vers anvil. Il commence sur
   une autre chaine (0x1) pour que la page ait a demander la bascule vers 4663. Journal des methodes. */
async function portefeuille(ctx, fork, compte) {
  const journal = [];
  let chaine = '0x1';
  await ctx.exposeBinding('__portefeuille', async (_s, method, params) => {
    journal.push(method);
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return { r: [compte] };
    if (method === 'eth_chainId') return { r: chaine };
    if (method === 'net_version') return { r: String(parseInt(chaine, 16)) };
    if (method === 'wallet_switchEthereumChain') { chaine = params[0].chainId; return { r: null }; }
    if (method === 'wallet_addEthereumChain') return { r: null };
    if (method === 'eth_sendTransaction' && params && params[0] && String(params[0].from || compte).toLowerCase() !== compte.toLowerCase()) {
      return { e: { message: 'wrong from', code: 4100 } };
    }
    try { return { r: await fork.rpc(method, params) }; } catch (e) { return { e: { message: e.message, code: e.code || -32000, data: e.data } }; }
  });
  await ctx.addInitScript(() => {
    window.ethereum = {
      isMetaMask: true, _ev: {},
      on(n, f) { (this._ev[n] = this._ev[n] || []).push(f); }, removeListener() {},
      async request({ method, params }) {
        const r = await window.__portefeuille(method, params || []);
        if (r.e) throw Object.assign(new Error(r.e.message), { code: r.e.code, data: r.e.data });
        return r.r;
      },
    };
  });
  return journal;
}

/* Deploie V5 sur le fork, comme DeployV5.s.sol (memes sels, meme ordre), depuis un compte anvil
   deverrouille (eth_sendTransaction : anvil signe, aucune cle ici). Rend le contenu de adresses_v5.json
   tel que v5_deploy.html l'ecrit. Sert aux essais du launchpad, qui n'ont pas a rejouer la page. */
async function deploieV5(fork, ethers, site, proprietaire, tresor, fraisWei) {
  const ART = JSON.parse(fs.readFileSync(path.join(site, 'contrats/v5/build/v5_artefacts.json'), 'utf8'));
  const COT = JSON.parse(fs.readFileSync(path.join(site, 'contrats/v5/script/cotations_v5.json'), 'utf8'));
  const M = require(path.join(site, 'v5_mineur.js'));
  const u = ethers.utils, enc = u.defaultAbiCoder, PM = '0x8366a39CC670B4001A1121B8F6A443A643e40951';
  const P = new ethers.providers.JsonRpcProvider(fork.url, 4663), sg = P.getSigner(proprietaire);
  const txs = {}, blocs = {};
  const att = async (k, tx) => { const rc = await tx.wait(); if (rc.status !== 1) throw new Error(k + ' a echoue'); txs[k] = rc.transactionHash; blocs[k] = rc.blockNumber; return rc; };
  const rc = await att('deployer', await sg.sendTransaction({ data: ART.contrats.SwogeDeployerV5.bytecode, gasLimit: 400000 }));
  const dep = new ethers.Contract(rc.contractAddress, ART.contrats.SwogeDeployerV5.abi, sg);
  const mine = M.mine(rc.contractAddress, proprietaire, 0, 4000000);
  const s = (k) => u.keccak256(u.toUtf8Bytes('swoge.v5.' + k));
  const a = { hook: u.getAddress(mine.hook), core: await dep.addressOf(proprietaire, s('core')), holders: await dep.addressOf(proprietaire, s('holders')), alloc: await dep.addressOf(proprietaire, s('alloc')) };
  const C = ART.contrats;
  await att('hook', await dep.deploy(mine.salt, u.hexConcat([C.SwogeHookV5.bytecode, enc.encode(['address', 'address', 'address'], [PM, a.core, a.holders])]), { gasLimit: 3000000 }));
  await att('core', await dep.deploy(s('core'), u.hexConcat([C.SwogeLaunchpadV5.bytecode, enc.encode(
    ['address', 'address', 'address', 'address', 'address', 'uint256', 'address[]', 'int24[]'],
    [PM, a.hook, a.holders, a.alloc, tresor, fraisWei, COT.addresses, COT.startTicks])]), { gasLimit: 14000000 }));
  await att('holders', await dep.deploy(s('holders'), u.hexConcat([C.SwogeHoldersV5.bytecode, enc.encode(['address', 'address', 'address'], [PM, a.core, a.hook])]), { gasLimit: 3500000 }));
  await att('alloc', await dep.deploy(s('alloc'), u.hexConcat([C.SwogeAllocV5.bytecode, enc.encode(['address'], [a.core])]), { gasLimit: 1200000 }));
  return { version: 'v5', chainId: 4663, poolManager: PM, deployer: rc.contractAddress, hook: a.hook, core: a.core, holders: a.holders, alloc: a.alloc,
    hookSalt: mine.salt, owner: proprietaire, treasury: tresor, launchFeeWei: String(fraisWei), quotes: COT.addresses.length,
    cotations: { genere: COT.genere, bloc: COT.bloc }, artefacts: { genere: ART.genere, compilateur: ART.compilateur }, blocks: blocs, txs, verified: 'fork' };
}

module.exports = { anvil, compteNeuf, serveur, routes, portefeuille, ethersUmd, rpcVers, deploieV5, RPC_CHAINE, RELAIS_RE };
