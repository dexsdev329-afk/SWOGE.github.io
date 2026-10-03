'use strict';
/* ============================================================================
 * LE CHOIX DU POOL SUR launchpad.html (03/10/2026)
 *
 * « Je vois pas le bouton sur le launchpad pour choisir de lancer avec un pool
 * WETH ou $SWOGE. » Les deux launchpads V4 n'etaient joignables que par
 * l'agent. Cet essai tient ce que la page promet maintenant :
 *   1. trois choix visibles (pool $SWOGE, pool ETH, l'ancien V3), un seul actif ;
 *   2. la fiche securite affiche ce que GoPlus a LU sur le jeton de test du
 *      pool choisi — et dit « taxes not readable » quand GoPlus rend des cases
 *      vides (le pool $SWOGE, lu le 30/09), au lieu d'inventer un 0 % ;
 *   3. une copie est refusee avec la phrase du serveur, et rien n'est signe ;
 *   4. l'offre transmise au portefeuille vise le bon pool, le bon symbole, et le
 *      portefeuille que le joueur a choisi sur la page ;
 *   5. le kit du createur donne l'adresse et ses liens.
 * L'offre est preparee par le VRAI module du serveur (lancement_v4.js) :
 * memes refus que l'agent. Le portefeuille est remplace par un faux qui ne
 * signe rien. Aucun acces reseau.
 * ==========================================================================*/
const http = require('http'), fs = require('fs'), path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const SITE = __dirname, SERVEUR = path.join(__dirname, '..', 'swoge-pusher-server.github.io');
const MOI = '0x49eE9527b6dE4Ba880e3205E1b31e78E43544e93';
const JETON = '0x1111111111111111111111111111111111111111', POOL = '0x2222222222222222222222222222222222222222';
const ETHERS = [path.join(SERVEUR, 'node_modules', 'ethers', 'dist', 'ethers.umd.min.js')]
  .concat((process.env.NODE_PATH || '').split(':').map((d) => path.join(d, 'ethers', 'dist', 'ethers.umd.min.js'))).find((f) => fs.existsSync(f));
const T = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css' };
const ZERO = '0x0000000000000000000000000000000000000000';
/* Les champs que deploiement_v4.js garde de GoPlus ; le pool $SWOGE tel que lu le 30/09 : taxes vides. */
const gp = (taxe) => ({ is_honeypot: '0', is_mintable: '0', hidden_owner: '0', can_take_back_ownership: '0', external_call: '0', is_proxy: '0',
  transfer_pausable: '0', is_blacklisted: '0', buy_tax: taxe, sell_tax: taxe, owner_address: ZERO });

(async () => {
  if (!chromium || !ETHERS) { console.log('  RATE playwright ou ethers.umd.min.js absent — essai impossible'); process.exit(1); }
  const lv4 = fs.readFileSync(path.join(SITE, 'lance_v4.js'), 'utf8');
  const LP = {
    swoge: { adresse: lv4.match(/swoge: \{ adresse: "(0x[0-9a-fA-F]{40})", feeWei: "(\d+)"/)[1], fraisWei: lv4.match(/swoge: \{ adresse: "0x[0-9a-fA-F]{40}", feeWei: "(\d+)"/)[1] },
    eth: { adresse: lv4.match(/eth: +\{ adresse: "(0x[0-9a-fA-F]{40})"/)[1], fraisWei: lv4.match(/eth: +\{ adresse: "0x[0-9a-fA-F]{40}", feeWei: "(\d+)"/)[1] },
  };
  /* Le module du serveur, tel que server.js le cable ; la liste des actions tokenisees est remplacee
     par une seule entree (NVDA), comme une copie du 28/09. */
  const offres = require(path.join(SERVEUR, 'lancement_v4.js')).cree({
    launchpads: () => LP,
    identite: async (a, s) => (s === 'NVDA' ? { imposteur: true, symbole: 'NVDA' } : null),
  });
  const recues = [];

  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.route('https://**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/ethers*.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(ETHERS) }));
  const jsonOk = (o) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  await ctx.route('**/launchpad/v4', (r) => r.fulfill(jsonOk({ goplus: gp(''), goplusReadAt: '2026-10-03T08:00:00.000Z', testToken: '0xdC6d2f3224d3B592845921cDDc3b13811e3ea7C5' })));
  await ctx.route('**/launchpad/v4weth', (r) => r.fulfill(jsonOk({ goplus: Object.assign(gp('0'), { is_mintable: '1' }), goplusReadAt: '2026-10-03T08:00:00.000Z', testToken: '0xABa8408eB41a1FfA092d3101C404937785a3B16D' })));
  await ctx.route('**/launchpad/v4/offre', async (r) => {
    const q = JSON.parse(r.request().postData() || '{}');
    recues.push(q);
    const o = await offres.propose(q);
    r.fulfill(Object.assign(jsonOk(o), { status: o.ok ? 200 : 400 }));
  });
  await ctx.addInitScript((moi) => {
    window.ethereum = {
      isMetaMask: true, on() {}, removeListener() {},
      async request({ method }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [moi];
        if (method === 'eth_chainId') return '0x1237';
        if (method === 'net_version') return '4663';
        throw Object.assign(new Error('not in this test'), { code: -32000 });
      },
    };
  }, MOI);
  const pg = await ctx.newPage();
  const erreurs = [];
  pg.on('pageerror', (e) => erreurs.push(String(e.message || e)));
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/launchpad.html', { waitUntil: 'load' });
  await pg.waitForTimeout(800);

  console.log('\n-- les trois choix de pool --');
  const choix = await pg.$$eval('.lp-pool', (bs) => bs.map((b) => ({ p: b.dataset.pool, on: b.getAttribute('aria-checked'), vu: b.offsetParent !== null, t: b.innerText })));
  ok(choix.length === 3 && choix.every((c) => c.vu), 'trois boutons visibles : ' + choix.map((c) => c.p).join(', '));
  ok(choix.filter((c) => c.on === 'true').length === 1 && choix[0].p === 'swoge' && choix[0].on === 'true', 'un seul actif, le pool $SWOGE par defaut');
  ok(/WETH/.test(choix[1].t) && /\$SWOGE/.test(choix[0].t), 'les libelles disent $SWOGE et ETH (WETH)');

  console.log('\n-- la fiche securite du pool $SWOGE (GoPlus : cases de taxe vides) --');
  await pg.waitForFunction(() => /alerts|alert\(s\)/.test((document.querySelector('#lpGoplus') || {}).textContent || ''), { timeout: 5000 }).catch(() => {});
  let fiche = await pg.textContent('#lpFiche');
  ok(/locked forever/i.test(fiche) && /No owner, no mint, no tax/.test(fiche), 'la fiche dit liquidite enfermee, ni proprietaire, ni frappe, ni taxe');
  ok(/0 alerts on 8 risk checks/.test(fiche), 'GoPlus lu : 0 alerte sur 8 cases');
  ok(/taxes not readable/.test(fiche) && !/0% buy/.test(fiche), 'taxes vides : « taxes not readable », pas un 0 % invente');
  ok(/owner none/.test(fiche), 'proprietaire : aucun (adresse zero)');
  ok(await pg.isHidden('#cLogoChamp'), 'pas de champ logo pour un V4 (le contrat ne garde aucun logo)');
  let fee = await pg.textContent('#feeSummary');
  ok(/10,000 \$SWOGE/.test(fee) && /burned/.test(fee), 'frais : 10 000 $SWOGE, brules');

  console.log('\n-- le pool ETH --');
  await pg.click('.lp-pool[data-pool="eth"]');
  await pg.waitForFunction(() => /alert/.test((document.querySelector('#lpGoplus') || {}).textContent || '') && /ETH-pool/.test(document.querySelector('#lpGoplus').textContent), { timeout: 5000 }).catch(() => {});
  fiche = await pg.textContent('#lpFiche');
  ok(await pg.getAttribute('.lp-pool[data-pool="eth"]', 'aria-checked') === 'true' && await pg.getAttribute('.lp-pool[data-pool="swoge"]', 'aria-checked') === 'false', 'le choix bascule');
  ok(/ETH pool/.test(fiche) && /in WETH/.test(fiche), 'la fiche parle du pool ETH (part du createur en WETH)');
  ok(/1 alert\(s\): Mintable/.test(fiche), 'une case levee par GoPlus est montree, pas cachee');
  ok(/0% buy \/ 0% sell tax/.test(fiche), 'taxes lues a 0 : affichees');
  fee = await pg.textContent('#feeSummary');
  ok(/0\.0001 ETH/.test(fee), 'frais : 0,0001 ETH');
  ok(/ETH pool/.test(await pg.textContent('#createBtn')), 'le bouton nomme le pool choisi');

  console.log('\n-- l ancien V3 reste choisissable --');
  await pg.click('.lp-pool[data-pool="v3"]');
  await pg.waitForTimeout(200);
  ok(/external call: yes/.test(await pg.textContent('#lpFiche')), 'la fiche V3 dit ce que les scanners lui reprochent');
  ok(await pg.isVisible('#cLogoChamp'), 'le champ logo revient pour le V3');
  ok(!/pool\)/.test(await pg.textContent('#createBtn')), 'le bouton reprend son libelle V3');

  console.log('\n-- connexion, puis une copie refusee --');
  await pg.click('.lp-pool[data-pool="swoge"]');
  await pg.click('#walletBtn');
  await pg.click('#wpickList .wrow:has-text("Browser wallet")');
  await pg.waitForFunction(() => /0x49eE/i.test(document.querySelector('#walletBtn').textContent || ''), { timeout: 10000 }).catch(() => {});
  ok(!(await pg.isDisabled('#createBtn')), 'connecte : le bouton V4 est actif');
  /* Le faux lancement : note l'offre et le portefeuille recus, refuse ce que la page refuserait. */
  await pg.evaluate(({ jeton, pool }) => {
    window.__lances = [];
    window.SwogeLance.lance = function (o, opts) {
      window.__lances.push({ o, memePortefeuille: opts.fournisseur === window.ethereum });
      const e = window.SwogeLance.verifie(o);
      if (e) return Promise.reject(new Error(e));
      if (window.__refuse) return Promise.reject(Object.assign(new Error('User rejected the request.'), { code: 4001 }));
      opts.statut('confirm the launch in your wallet…');
      return Promise.resolve({ token: jeton, pool, tx: '0x' + '3'.repeat(64) });
    };
  }, { jeton: JETON, pool: POOL });
  await pg.fill('#cName', 'NVIDIA'); await pg.fill('#cSym', 'NVDA');
  await pg.click('#createBtn');
  /* On attend la reponse du serveur, pas l'etat d'attente : « Checking the name against copies… »
     contient deja le mot « copies » (l'essai lisait parfois la note avant le refus). */
  await pg.waitForFunction(() => /refuses copies/.test(document.querySelector('#createNote').textContent || ''), { timeout: 5000 }).catch(() => {});
  const refus = await pg.textContent('#createNote');
  ok(/copies the official Robinhood stock token NVDA/.test(refus), 'la phrase du serveur est montree : ' + refus.slice(0, 70));
  ok((await pg.evaluate(() => window.__lances.length)) === 0, 'rien n est envoye au portefeuille');
  await pg.fill('#cName', 'Swoge Inu'); await pg.fill('#cSym', 'SWINU');
  await pg.click('#createBtn');
  await pg.waitForFunction(() => /reserved/.test(document.querySelector('#createNote').textContent || ''), { timeout: 5000 }).catch(() => {});
  ok(/reserved for official SWOGE/.test(await pg.textContent('#createNote')), 'un nom en « SWOGE » est refuse');

  console.log('\n-- un vrai lancement : l offre, puis le kit --');
  await pg.fill('#cName', 'Paw Patrol'); await pg.fill('#cSym', '$paws');
  await pg.fill('#cTw', '@pawscoin').catch(() => {});
  await pg.click('#createBtn');
  await pg.waitForFunction(() => !document.querySelector('#lpKit').hidden, { timeout: 5000 }).catch(() => {});
  const l = await pg.evaluate(() => window.__lances[0] || null);
  const q = recues[recues.length - 1];
  ok(q && q.pool === 'swoge' && q.symbol === 'PAWS' && q.name === 'Paw Patrol', 'le serveur recoit pool, nom et symbole nettoye : ' + JSON.stringify(q && { pool: q.pool, symbol: q.symbol }));
  ok(l && l.o.pool === 'swoge' && l.o.launchpad === LP.swoge.adresse && l.o.symbol === 'PAWS', 'l offre vise le launchpad $SWOGE de lance_v4.js');
  ok(l && l.memePortefeuille, 'le portefeuille choisi sur la page est celui qui signe');
  const kit = await pg.evaluate(() => ({ t: document.querySelector('#lpKit').innerText, liens: [...document.querySelectorAll('#lpKit a')].map((a) => a.href),
    copie: (document.querySelector('#lpKit [data-copy]') || {}).dataset }));
  ok(kit.copie && kit.copie.copy === JETON, 'le bouton de copie porte l adresse du jeton');
  ok(kit.liens.some((h) => h.includes('/token/' + JETON)) && kit.liens.some((h) => h.includes('dexscreener.com/robinhood/' + POOL)) && kit.liens.some((h) => h.includes('gopluslabs.io/token-security/4663/' + JETON)),
     'liens : explorateur, DexScreener (le pool), GoPlus');
  const x = kit.liens.find((h) => h.startsWith('https://x.com/intent/tweet')) || '';
  ok(/PAWS/.test(decodeURIComponent(x)) && decodeURIComponent(x).includes(JETON), 'le partage sur X porte le symbole et l adresse');
  ok(/50% of the trading fees \(\$SWOGE\)/.test(kit.t), 'le kit dit la part du createur, dans la bonne monnaie');

  console.log('\n-- le joueur refuse dans son portefeuille --');
  await pg.evaluate(() => { window.__refuse = true; });
  await pg.click('.lp-pool[data-pool="eth"]');
  await pg.click('#createBtn');
  await pg.waitForFunction(() => /cancelled/.test(document.querySelector('#createNote').textContent || ''), { timeout: 5000 }).catch(() => {});
  ok(/You cancelled in your wallet - nothing was launched/.test(await pg.textContent('#createNote')), 'refus du portefeuille : la page le dit');
  ok((await pg.evaluate(() => window.__lances[1] && window.__lances[1].o.launchpad)) === LP.eth.adresse, 'cette fois l offre visait le launchpad ETH');
  ok(!(await pg.isDisabled('#createBtn')), 'le bouton redevient utilisable');

  console.log('\n-- un lien du bot Telegram (/launch, 03/10) --');
  /* Le bot repond par launchpad.html?pool=&name=&symbol=&tg=. La page remplit, ne lance rien seule,
     et apres la signature dit au serveur quelle transaction annoncer (il la relit sur la chaine). */
  const annonces = [];
  await ctx.route('**/launchpad/v4/lance', (r) => { annonces.push(JSON.parse(r.request().postData() || '{}'));
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' }); });
  const pt = await ctx.newPage();
  pt.on('pageerror', (e) => erreurs.push(String(e.message || e)));
  await pt.goto('http://127.0.0.1:' + srv.address().port + '/launchpad.html?pool=eth&name=Moon%20Dog&symbol=MDOG&tg=0123456789abcdef', { waitUntil: 'load' });
  await pt.waitForTimeout(600);
  ok(await pt.getAttribute('.lp-pool[data-pool="eth"]', 'aria-checked') === 'true' && await pt.inputValue('#cName') === 'Moon Dog' && await pt.inputValue('#cSym') === 'MDOG',
     'le lien choisit le pool ETH et remplit nom et symbole');
  ok(/Prepared from Telegram/.test(await pt.textContent('#createNote')) && (await pt.evaluate(() => (window.__lances || []).length)) === 0, 'la page dit d ou vient la demande ; rien n est parti tout seul');
  const piege = await ctx.newPage();
  await piege.goto('http://127.0.0.1:' + srv.address().port + '/launchpad.html?pool=evil&symbol=%3Cimg%20src%3Dx%3E&tg=nope', { waitUntil: 'load' });
  await piege.waitForTimeout(400);
  ok(await piege.getAttribute('.lp-pool[data-pool="swoge"]', 'aria-checked') === 'true' && await piege.inputValue('#cSym') === 'IMGSRCX' && !/Telegram/.test(await piege.textContent('#createNote')),
     'un lien trafique : pool inconnu → $SWOGE, symbole nettoye, identifiant invalide ignore');
  await piege.close();
  await pt.click('#walletBtn');
  await pt.click('#wpickList .wrow:has-text("Browser wallet")');
  await pt.waitForFunction(() => /0x49eE/i.test(document.querySelector('#walletBtn').textContent || ''), { timeout: 10000 }).catch(() => {});
  await pt.evaluate(({ jeton, pool }) => { window.SwogeLance.lance = function (o, opts) { opts.statut('…'); return Promise.resolve({ token: jeton, pool, tx: '0x' + '4'.repeat(64) }); }; }, { jeton: JETON, pool: POOL });
  await pt.click('#createBtn');
  await pt.waitForFunction(() => !document.querySelector('#lpKit').hidden, { timeout: 5000 }).catch(() => {});
  await pt.waitForTimeout(300);
  ok(annonces.length === 1 && annonces[0].tg === '0123456789abcdef' && annonces[0].tx === '0x' + '4'.repeat(64) && Object.keys(annonces[0]).length === 2,
     'lance : la page envoie l identifiant Telegram et la transaction, rien d autre ' + JSON.stringify(annonces[0] || {}));
  await pt.close();

  ok(erreurs.length === 0, erreurs.length ? 'erreurs de script : ' + erreurs.slice(0, 2).join(' | ') : 'aucune erreur de script');
  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
