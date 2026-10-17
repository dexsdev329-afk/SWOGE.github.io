'use strict';
/* ============================================================================
 * DEPOSER AUX PARIS EN SOL, USDC, USDT OU ETH : LE PANNEAU DE swogebet.html (17/10/2026)
 *
 * Le dialogue « Deposit » de SwogeBet porte, sous le depot du portefeuille
 * (approve + vault.deposit, inchange), le panneau credit_depot.js en mode
 * « bet » sur /bet/deposit. Derriere un faux serveur (HTTP et WebSocket).
 * Ce que la page DOIT tenir :
 *
 *   1. le chemin du portefeuille reste (#depAmt, #depGo, le lien DexScreener) ;
 *   2. les provenances sont celles du serveur (SOL, USDC, USDT, ETH), avec leurs bornes (5 $..50 $, 10 $ depuis Ethereum) ;
 *      le frais affiche est CELUI DU SERVEUR (« 5% deposit fee »), et
 *      « Credited in $SWOGEBET - exactly what arrives after the swap » ;
 *   3. un clic = UNE requete sur /bet/deposit, qui ne porte que
 *      {origin, amountUsd}, avec le jeton de session ; hors bornes : rien ;
 *   4. l'adresse, le montant exact, le reseau, « send only », l'estimation
 *      APRES le frais contre « ce qui arrive », l'avertissement des
 *      plateformes d'echange ; Copy copie l'adresse ;
 *   5. le suivi jusqu'a « credited », puis le solde de paris du haut suit ;
 *      un remboursement est dit, sans credit ;
 *   6. rien dans le stockage local ; aucun texte francais ; 320 px sans
 *      debordement ; aucune erreur ; /credit/deposit n'est jamais appele.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4' };
const HOTE = 'web-production-220a3.up.railway.app';
const ADDR = '0x' + '7a'.repeat(20);
const SESSION = 'v1.' + ADDR + '.' + (Math.floor(Date.now() / 1000) + 86400 * 20) + '.sig-test';
const DEPOT = 'DepoSoLAdresse1111111111111111111111111111';
const FR = /[àâçéèêëîïôûùüÿœ]|\b(les|des|une|est|pour|avec|vous|votre|aucun|rien|cette|dans|sans|envoyez|adresse)\b/i;
const ORIGINES = ['sol:SOL:Solana', 'usdc_sol:USDC:Solana', 'usdt_sol:USDT:Solana', 'usdc_base:USDC:Base', 'usdt_base:USDT:Base', 'eth_base:ETH:Base',
  'eth:ETH:Ethereum', 'usdc_eth:USDC:Ethereum', 'usdt_eth:USDT:Ethereum']
  .map((x) => { const [id, token, network] = x.split(':'); return { id, token, network, minUsd: network === 'Ethereum' ? 10 : 5, maxUsd: 50 }; });

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  const erreurs = [];

  let S;
  const remet = () => { S = { bet: '12', posts: [], credit: 0, commandes: [], suite: ['waiting', 'processing', 'credited'], lus: 0 }; };
  const commande = (o) => Object.assign({ id: 'b' + 'a'.repeat(24), status: 'waiting', origin: 'sol', network: 'Solana', token: 'SOL', send: '0.1', depositAddress: DEPOT,
    amountUsd: 10, feeBps: 500, feePercent: 5, estimateSwogebet: '390000', estimateCreditedSwogebet: '370500', creditedSwogebet: '0', feeSwogebet: '0',
    createdAt: new Date().toISOString(), sendBefore: new Date(Date.now() + 1800e3).toISOString(), message: null }, o || {});
  async function route(rt) {
    const q = rt.request(), u = new URL(q.url());
    const rep = (c, o) => rt.fulfill({ status: c, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.hostname !== HOTE) return rt.fulfill({ status: 200, contentType: /\.js/.test(u.pathname) ? 'text/javascript' : 'text/plain', body: '' });
    if (q.method() === 'OPTIONS') return rt.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    if (/^\/credit\/deposit/.test(u.pathname)) { S.credit++; return rep(404, { ok: false }); }
    if (u.pathname === '/bet/deposit' && q.method() === 'GET') return rep(200, { ok: true, available: true, origins: ORIGINES, orders: S.commandes, feeBps: 500, feePercent: 5 });
    if (u.pathname === '/bet/deposit' && q.method() === 'POST') {
      S.posts.push({ corps: JSON.parse(q.postData() || '{}'), auth });
      const c = commande();
      S.commandes = [c];
      return rep(200, Object.assign({ ok: true, sendExactly: '0.1 SOL' }, c));
    }
    const m = /^\/bet\/deposit\/(b[0-9a-f]{24})$/.exec(u.pathname);
    if (m) {
      const st = S.suite[Math.min(S.lus++, S.suite.length - 1)];
      const fini = st === 'credited';
      if (fini) S.bet = '361012.0';
      if (fini || st === 'refunded') S.commandes = [];
      return rep(200, Object.assign({ ok: true, betBalance: S.bet }, commande({ id: m[1], status: st, creditedSwogebet: fini ? '361000' : '0', feeSwogebet: fini ? '19000' : '0',
        message: st === 'refunded' ? 'Your deposit was sent back to the sending address (AMOUNT_TOO_LOW). Nothing was credited.' : null })));
    }
    return rep(404, { ok: false, raison: 'not in this test' });
  }
  async function ouvre(largeur) {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1280, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.slice(0, -1) });
    /* Le faux jeu : hello, puis la reprise par la session rend « auth ». Aucun betDeposit n'est
       envoye ici : le solde du haut ne peut suivre que par le panneau. */
    await ctx.routeWebSocket(/.*/, (ws) => {
      ws.send(JSON.stringify({ type: 'hello', loginNonce: 'n1', betVault: '0x' + 'be'.repeat(20) }));
      ws.onMessage((m) => {
        let o; try { o = JSON.parse(String(m)); } catch (e) { return; }
        if (o.type === 'resume') ws.send(JSON.stringify({ type: 'auth', address: ADDR, balance: '0', betBalance: S.bet }));
      });
    });
    await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} window.SWOGE_DEPOT_MS = 150; }, SESSION);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erreurs.push('pageerror : ' + e.message));
    await p.route((u) => !u.href.startsWith(base), route);
    await p.goto(base + 'swogebet.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(600);
    await p.evaluate(() => document.getElementById('acDeposit').click());
    await p.waitForTimeout(200);
    return p;
  }
  const R = '#box-dep [data-credit-depot="bet"]';

  console.log('-- swogebet.html : le depot en SOL / USDT / ETH --');
  remet();
  const p = await ouvre();
  ok(await p.isVisible('#box-dep'), 'le dialogue Deposit s ouvre (session reprise par le faux jeu)');
  ok(await p.isVisible('#depAmt') && await p.isVisible('#depGo') && /DexScreener/.test(await p.textContent('#depOu')), 'le depot du portefeuille reste : montant, Deposit, le lien DexScreener');
  ok(/Deposit with SOL, USDC, USDT or ETH/.test(await p.textContent(R + ' .cdp-ouvre')), 'le panneau offre « ' + (await p.textContent(R + ' .cdp-ouvre')) + ' »');
  await p.click(R + ' .cdp-ouvre');
  await p.waitForSelector(R + ' [data-origin]');
  const choix = await p.$$eval(R + ' [data-origin]', (l) => l.map((b) => b.textContent));
  ok(choix.join('|') === ORIGINES.map((o) => o.token + ' on ' + o.network).join('|'), 'neuf choix, ceux du serveur : ' + choix.join(', '));
  const regles = await p.textContent(R + ' .cdp-regles');
  ok(/5% deposit fee/.test(regles) && /Credited in \$SWOGEBET - exactly what arrives after the swap/.test(regles), 'les regles dites : « 5% deposit fee », « Credited in $SWOGEBET - exactly what arrives after the swap »');
  ok(/\$5 to \$50/.test(await p.textContent(R + ' .cdp-m')) && (await p.inputValue(R + ' input')) === '10', 'les bornes du serveur : $5 to $50');
  await p.click(R + ' [data-origin="usdt_eth"]');
  ok((await p.inputValue(R + ' input')) === '10' && /\$10 to \$50/.test(await p.textContent(R + ' .cdp-m')), 'USDT Ethereum : le minimum du serveur passe a 10 $');
  await p.fill(R + ' input', '9');
  await p.click(R + ' .cdp-go'); await p.waitForTimeout(150);
  ok(S.posts.length === 0 && /between \$10 and \$50 for USDT on Ethereum/.test(await p.textContent(R + ' .cdp-st')), '9 $ en USDT Ethereum : refuse par la page, aucune requete');
  await p.click(R + ' [data-origin="sol"]');
  await p.fill(R + ' input', '4');
  await p.click(R + ' .cdp-go'); await p.waitForTimeout(150);
  ok(S.posts.length === 0 && /between \$5 and \$50/.test(await p.textContent(R + ' .cdp-st')), '4 $ : refuse par la page, aucune requete');
  await p.fill(R + ' input', '60');
  await p.click(R + ' .cdp-go'); await p.waitForTimeout(150);
  ok(S.posts.length === 0, '60 $ : refuse par la page, aucune requete');
  await p.fill(R + ' input', '10');
  await p.dblclick(R + ' .cdp-go');
  await p.waitForSelector(R + ' [data-cdp-adresse]');
  ok(S.posts.length === 1, 'un double clic : UNE requete');
  ok(JSON.stringify(S.posts[0].corps) === JSON.stringify({ origin: 'sol', amountUsd: 10 }) && S.posts[0].auth === SESSION, 'le corps ne porte que {origin, amountUsd}, avec le jeton de session');
  const carte = await p.textContent(R + ' .cdp-carte');
  ok((await p.textContent(R + ' [data-cdp-adresse]')) === DEPOT && /Send exactly 0\.1 SOL on the Solana network/.test(carte), 'l adresse du serveur et « send exactly 0.1 SOL on the Solana network »');
  ok(/Send only SOL on Solana\./.test(carte) && /less is refunded/.test(carte), '« send only SOL on Solana », et qu un envoi trop petit revient');
  ok(/about 370,500 \$SWOGEBET after the 5% deposit fee/.test(carte) && /exactly what arrives after the swap/.test(carte) && !/\$\d/.test(carte.replace(/\$SWOGEBET/g, '')),
     'l estimation APRES le frais (370,500 $SWOGEBET), contre ce qui arrive ; aucun montant en dollars promis');
  ok(/exchange may not come back/.test(carte), 'l avertissement des plateformes d echange');
  await p.click(R + ' .cdp-adr button');
  await p.waitForTimeout(100);
  ok((await p.evaluate(() => navigator.clipboard.readText())) === DEPOT, 'Copy copie l adresse');
  await p.waitForFunction((r) => /Done/.test(document.querySelector(r + ' .cdp-st').textContent), R, { timeout: 5000 }).catch(() => {});
  const fin = await p.textContent(R + ' .cdp-st');
  ok(/Done: 361,000 \$SWOGEBET added \(5% fee: 19,000\)\. Bet balance: 361,012 \$SWOGEBET\./.test(fin), 'suivi jusqu a « credited » : « ' + fin + ' »');
  ok(/361\.0k/.test(await p.textContent('#bal')), 'le solde de paris du haut suit : ' + (await p.textContent('#bal')).trim());
  const lus = S.lus; await p.waitForTimeout(500);
  ok(S.lus === lus, 'credite : la page ne relit plus');
  const stock = await p.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
  ok(!stock.includes(DEPOT) && !stock.includes('b' + 'a'.repeat(24)), 'rien de la commande dans le stockage local');
  ok(!FR.test(await p.evaluate((r) => document.querySelector(r).innerText, R)), 'aucun texte francais visible dans le panneau');
  ok(S.credit === 0, '/credit/deposit n est jamais appele : c est /bet/deposit');
  await p.context().close();

  remet();
  S.commandes = [commande()];
  S.suite = ['waiting', 'refunded'];
  const p2 = await ouvre(320);
  await p2.click(R + ' .cdp-ouvre');
  await p2.waitForSelector(R + ' [data-cdp-adresse]', { timeout: 3000 }).catch(() => {});
  ok((await p2.textContent(R + ' [data-cdp-adresse]').catch(() => '')) === DEPOT && S.posts.length === 0, 'reouvert : la commande ouverte se remontre, sans en creer une autre');
  await p2.waitForFunction((r) => /sent back/.test(document.querySelector(r + ' .cdp-st').textContent), R, { timeout: 5000 }).catch(() => {});
  ok(/sent back to the sending address/.test(await p2.textContent(R + ' .cdp-st')) && /err/.test(await p2.getAttribute(R + ' .cdp-st', 'class')) && S.bet === '12',
     'rembourse : le message du serveur, en erreur, aucun credit');
  const deb = await p2.evaluate((r) => { const e = document.querySelector(r); const b = e.closest('.pscroll') || e; return { boite: b.scrollWidth - b.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth }; }, R);
  ok(deb.boite <= 0 && deb.page <= 0, '320 px : rien ne deborde (' + JSON.stringify(deb) + ')');
  if (process.env.CAPTURE) await p2.screenshot({ path: process.env.CAPTURE, fullPage: false });
  await p2.context().close();

  ok(!erreurs.some((e) => /credit_depot|SwogeDepot|cdp|betdeposit/.test(e)), 'aucune erreur venue de credit_depot.js' + (erreurs.length ? ' (autres : ' + erreurs.slice(0, 2).join(' ; ') + ')' : ''));
  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : n + ' verifications OK'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('EXCEPTION', e); process.exit(1); });
