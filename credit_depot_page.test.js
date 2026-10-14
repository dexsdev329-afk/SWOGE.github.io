'use strict';
/* ============================================================================
 * PAYER LE CREDIT EN SOL OU EN USDT : LE DIALOGUE DE RECHARGE (credit_depot.js)
 *
 * Les deux dialogues de recharge — celui du Studio (#rc, ouvreRecharge) et
 * celui du chat (swolemind.html #rechargeBox, et donc swoge_agents.html qui
 * en est genere) — portent le choix « SOL / USDT » a cote de la signature
 * USDC. Derriere un faux serveur. Ce que la page DOIT tenir :
 *
 *   1. les provenances sont celles du serveur, avec leurs bornes (10 $ pour
 *      Ethereum) ; un montant hors bornes ne part pas ;
 *   2. un clic = UNE requete, qui ne porte que {origin, amountUsd} : aucune
 *      adresse, aucun identifiant fourni par la page ;
 *   3. l'adresse, le montant exact, le reseau, « send only », l'estimation
 *      contre « ce qui arrive », l'avertissement des plateformes d'echange ;
 *      le bouton Copy copie l'adresse ;
 *   4. le suivi jusqu'a « credited », puis le solde de la page se met a jour ;
 *      un remboursement est dit, sans credit ;
 *   5. une commande ouverte se remontre a la reouverture ; rien n'est garde
 *      dans le stockage local (ni adresse, ni commande) ;
 *   6. a 320 px, rien ne deborde ; aucun texte francais ; aucune erreur.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const HOTE = 'web-production-220a3.up.railway.app';
const ADDR = '0x' + '7a'.repeat(20);
const SESSION = 'v1.' + ADDR + '.' + (Math.floor(Date.now() / 1000) + 86400 * 20) + '.sig-test';
const DEPOT = 'DepoSoLAdresse1111111111111111111111111111';
const FR = /[àâçéèêëîïôûùüÿœ]|\b(les|des|une|est|pour|avec|vous|votre|aucun|rien|cette|dans|sans|envoyez|adresse)\b/i;
const ORIGINES = [{ id: 'sol', token: 'SOL', network: 'Solana', minUsd: 2, maxUsd: 50 }, { id: 'usdt_sol', token: 'USDT', network: 'Solana', minUsd: 2, maxUsd: 50 },
  { id: 'usdt_base', token: 'USDT', network: 'Base', minUsd: 2, maxUsd: 50 }, { id: 'usdt_eth', token: 'USDT', network: 'Ethereum', minUsd: 10, maxUsd: 50 }];

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

  /* ---- le faux serveur ---- */
  let S;
  const remet = () => { S = { credit: 4.2, posts: [], ailleurs: [], commandes: [], suite: ['waiting', 'processing', 'credited'], lus: 0, fin: 'credited' }; };
  const commande = (o) => Object.assign({ id: 'd' + 'a'.repeat(24), status: 'waiting', origin: 'sol', network: 'Solana', token: 'SOL', send: '0.0313', depositAddress: DEPOT,
    estimateUsd: 4.9, creditedUsd: 0, createdAt: new Date().toISOString(), sendBefore: new Date(Date.now() + 1800e3).toISOString(), message: null }, o || {});
  async function route(rt) {
    const q = rt.request(), u = new URL(q.url());
    const rep = (c, o) => rt.fulfill({ status: c, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.hostname !== HOTE) {
      if (u.hostname !== '127.0.0.1') S.ailleurs.push(u.hostname);
      return rt.fulfill({ status: 200, contentType: /\.js/.test(u.pathname) ? 'text/javascript' : 'text/plain', body: '' });
    }
    if (q.method() === 'OPTIONS') return rt.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    if (u.pathname === '/credit') return rep(200, { ok: true, balanceUsd: S.credit, history: [], limits: { minUsd: 0.1, maxUsd: 50, maxSoldeUsd: 100 }, networks: { base: true, solana: true } });
    if (u.pathname === '/credit/deposit' && q.method() === 'GET') return rep(200, { ok: true, available: true, origins: ORIGINES, orders: S.commandes });
    if (u.pathname === '/credit/deposit' && q.method() === 'POST') {
      S.posts.push({ corps: JSON.parse(q.postData() || '{}'), auth });
      const c = commande();
      S.commandes = [c];
      return rep(200, Object.assign({ ok: true, sendExactly: '0.0313 SOL' }, c));
    }
    const m = /^\/credit\/deposit\/(d[0-9a-f]{24})$/.exec(u.pathname);
    if (m) {
      const st = S.suite[Math.min(S.lus++, S.suite.length - 1)];
      const fini = st === 'credited';
      if (fini) S.credit = 9.1;
      if (fini || st === 'refunded') S.commandes = [];
      return rep(200, Object.assign({ ok: true, balanceUsd: S.credit }, commande({ id: m[1], status: st, creditedUsd: fini ? 4.9 : 0,
        message: st === 'refunded' ? 'Your deposit was sent back to the sending address (AMOUNT_TOO_LOW). Nothing was credited.' : null })));
    }
    return rep(404, { ok: false, raison: 'not in this test' });
  }
  async function ouvre(page, largeur) {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1280, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.slice(0, -1) });
    await ctx.routeWebSocket(/.*/, () => {});
    await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} window.SWOGE_DEPOT_MS = 150; }, SESSION);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erreurs.push(page + ' pageerror : ' + e.message));
    await p.route((u) => !u.href.startsWith(base), route);
    await p.goto(base + page, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(300);
    return p;
  }
  const ouvreDialogue = async (p, page) => {
    if (page === 'studio.html') await p.evaluate(() => document.getElementById('crTop').click());
    else await p.click('#recharger');
    await p.waitForTimeout(150);
  };
  const racine = (page) => (page === 'studio.html' ? '#rc [data-credit-depot]' : '#rechargeBox [data-credit-depot]');

  for (const page of ['studio.html', 'swolemind.html', 'swoge_agents.html']) {
    console.log('\n-- ' + page + ' --');
    remet();
    const p = await ouvre(page);
    await ouvreDialogue(p, page);
    const R = racine(page);
    ok(await p.isVisible(R + ' .cdp-ouvre'), 'le dialogue de recharge offre « ' + (await p.textContent(R + ' .cdp-ouvre').catch(() => '?')) + ' »');
    await p.click(R + ' .cdp-ouvre');
    await p.waitForSelector(R + ' [data-origin]');
    const choix = await p.$$eval(R + ' [data-origin]', (l) => l.map((b) => b.textContent));
    ok(choix.join('|') === 'SOL on Solana|USDT on Solana|USDT on Base|USDT on Ethereum', 'quatre choix, ceux du serveur : ' + choix.join(', '));
    await p.click(R + ' [data-origin="usdt_eth"]');
    ok((await p.inputValue(R + ' input')) === '10' && /\$10 to \$50/.test(await p.textContent(R + ' .cdp-m')), 'USDT Ethereum : le minimum passe a 10 $');
    await p.click(R + ' [data-origin="sol"]');
    await p.fill(R + ' input', '1');
    await p.click(R + ' .cdp-go'); await p.waitForTimeout(150);
    ok(S.posts.length === 0 && /between \$2 and \$50/.test(await p.textContent(R + ' .cdp-st')), '1 $ en SOL : refuse par la page, aucune requete');
    await p.fill(R + ' input', '5');
    await p.dblclick(R + ' .cdp-go');
    await p.waitForSelector(R + ' [data-cdp-adresse]');
    ok(S.posts.length === 1, 'un double clic : UNE requete');
    ok(JSON.stringify(S.posts[0].corps) === JSON.stringify({ origin: 'sol', amountUsd: 5 }) && S.posts[0].auth === SESSION, 'le corps ne porte que {origin, amountUsd}, avec le jeton de session');
    const carte = await p.textContent(R + ' .cdp-carte');
    ok((await p.textContent(R + ' [data-cdp-adresse]')) === DEPOT && /Send exactly 0\.0313 SOL on the Solana network/.test(carte), 'l adresse du serveur et « send exactly 0.0313 SOL on the Solana network »');
    ok(/Send only SOL on Solana\./.test(carte) && /less is refunded/.test(carte), '« send only SOL on Solana », et qu un envoi trop petit revient');
    ok(/about \$4\.90 credited/.test(carte) && /credited what actually arrives/.test(carte), 'l estimation (4,90 $) contre « ce qui arrive vraiment »');
    ok(/exchange may not come back/.test(carte), 'l avertissement des plateformes d echange');
    await p.click(R + ' .cdp-adr button');
    await p.waitForTimeout(100);
    ok((await p.evaluate(() => navigator.clipboard.readText())) === DEPOT, 'Copy copie l adresse');
    await p.waitForFunction((r) => /Done/.test(document.querySelector(r + ' .cdp-st').textContent), R, { timeout: 5000 }).catch(() => {});
    ok(/Done: \$4\.90 added\. Your credit: \$9\.10\./.test(await p.textContent(R + ' .cdp-st')), 'suivi jusqu a « credited » : « ' + (await p.textContent(R + ' .cdp-st')) + ' »');
    const solde = page === 'studio.html' ? await p.textContent('#balCr') : await p.textContent('#credit');
    ok(/\$9\.10/.test(solde), 'le solde de la page suit : ' + solde.trim());
    const lus = S.lus; await p.waitForTimeout(500);
    ok(S.lus === lus, 'credite : la page ne relit plus');
    const stock = await p.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
    ok(!stock.includes(DEPOT) && !stock.includes('d' + 'a'.repeat(24)), 'rien de la commande dans le stockage local');
    const visible = await p.evaluate((r) => document.querySelector(r).innerText, R);
    ok(!FR.test(visible), 'aucun texte francais visible dans la section');
    await p.context().close();

    /* une commande ouverte se remontre ; un remboursement est dit */
    remet();
    S.commandes = [commande()];
    S.suite = ['waiting', 'refunded'];
    const p2 = await ouvre(page, 320);
    await ouvreDialogue(p2, page);
    await p2.click(R + ' .cdp-ouvre');
    await p2.waitForSelector(R + ' [data-cdp-adresse]', { timeout: 3000 }).catch(() => {});
    ok((await p2.textContent(R + ' [data-cdp-adresse]').catch(() => '')) === DEPOT && S.posts.length === 0, 'reouvert : la commande ouverte se remontre, sans en creer une autre');
    await p2.waitForFunction((r) => /sent back/.test(document.querySelector(r + ' .cdp-st').textContent), R, { timeout: 5000 }).catch(() => {});
    ok(/sent back to the sending address/.test(await p2.textContent(R + ' .cdp-st')) && /err/.test(await p2.getAttribute(R + ' .cdp-st', 'class')) && S.credit === 4.2,
      'rembourse : le message du serveur, en erreur, aucun credit');
    const deb = await p2.evaluate((r) => { const e = document.querySelector(r); const b = e.closest('.sheet-b, .recharge') || e; return { boite: b.scrollWidth - b.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth }; }, R);
    ok(deb.boite <= 0 && deb.page <= 0, '320 px : rien ne deborde (' + JSON.stringify(deb) + ')');
    await p2.context().close();
  }
  ok(!erreurs.some((e) => /credit_depot|SwogeDepot|cdp/.test(e)), 'aucune erreur venue de credit_depot.js' + (erreurs.length ? ' (autres : ' + erreurs.slice(0, 2).join(' ; ') + ')' : ''));
  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : n + ' verifications OK'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('EXCEPTION', e); process.exit(1); });
