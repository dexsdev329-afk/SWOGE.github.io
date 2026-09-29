'use strict';
/* ============================================================================
 * L'AGENT STORE — la page ne note rien : elle MONTRE ce que le serveur a mesure
 *   1. les agents de SWOGE : prix, usage mesure et son effectif, permissions,
 *      facons de payer ; les filtres par capacite ; « Use in a mission »
 *      seulement pour ce que l'agent des missions sait faire ;
 *   2. les services x402 d'autres vendeurs : la recherche, le verdict des
 *      sondes tel quel, un lien seulement s'il est https ;
 *   3. tout ce qui vient du serveur est du texte ; rien ne deborde a 360 px ;
 *   4. SwoleMind ouvre la mission preremplie (?mission=), sans rien envoyer.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
const STORE = { ok: true, window: { from: '2026-08-31', to: '2026-09-29' }, note: 'Usage counts only outside agents.',
  catalogue: { catalogue: 8169, probed: 1700, judged: 12, neverAnsweredPct: 8.3 },
  agents: [
    { id: 'swoge:scan_token', name: 'scan_token', owner: { name: 'SWOGE' }, summary: 'Use this before buying an EVM token.', description: 'Long description.', capabilities: ['Crypto'],
      price: { usd: 0.02 }, input: [{ name: 'address', required: true, about: 'The token contract.' }], permissions: ['read-only: never buys, sells or signs'],
      payment: ['x402 per call, no account: USDC on Base or Solana'], endpoints: { rest: 'https://api/agentic/call/scan_token', mcp: 'https://api/mcp' },
      usage: { paidCalls: 12, paidUsd: 0.24, priceQuotes: 300, attemptsWithoutResult: 2, verdict: 'completed 12 of 14 paid attempts (85.7%)' } },
    { id: 'swoge:generate_image', name: 'generate_image', owner: { name: 'SWOGE' }, summary: 'Create <img src=x onerror=window.pirate=1> an image.', capabilities: ['Image'],
      price: { variable: true, maxUsd: 0.2, note: 'real cost' }, input: [], permissions: ['read-only: never buys, sells or signs', 'creates images'], payment: [], endpoints: { rest: 'https://api/agentic/call/generate_image' },
      usage: { paidCalls: 0, priceQuotes: 5, attemptsWithoutResult: 0, verdict: 'not enough paid calls yet (0/10)' } },
    { id: 'swoge:web_search', name: 'web_search', owner: { name: 'SWOGE' }, summary: 'Search the web.', capabilities: ['Research'], price: { usd: 0.01 }, input: [], permissions: [], payment: [],
      endpoints: { rest: 'https://api/agentic/call/web_search' }, usage: { paidCalls: 1, priceQuotes: 9, attemptsWithoutResult: 0, verdict: 'not enough paid calls yet (1/10)' } }] };
/* Les paiements verifiables (29/09) : ce que rend preuves_x402.js — dont un lien qui n'est pas https. */
STORE.payments = { total: { payments: 3, usd: 0.018, inSwoge: 1, payers: 2, since: '2026-09-27T10:00:00.000Z' }, recent: [
  { at: '2026-09-28T09:00:00.000Z', tool: 'token_verdict', network: 'Robinhood Chain', asset: 'SWOGE', amount: 397.41, usd: null, payer: '0x21c3\u20263633', tx: '0xcc', txUrl: 'javascript:alert(1)' },
  { at: '2026-09-27T12:00:00.000Z', tool: 'can_i_sell <img src=x onerror=window.pirate2=1>', network: 'Solana', asset: 'USDC', amount: 0.008, usd: 0.008, payer: 'Fq9x2W\u2026vW3x', tx: '5hSigAbCdEfGhIjKlMn', txUrl: 'https://solscan.io/tx/5hSigAbCdEfGhIjKlMn' },
  { at: '2026-09-27T10:00:00.000Z', tool: 'scan_token', network: 'Base', asset: 'USDC', amount: 0.01, usd: 0.01, payer: '0x21c3\u20263633', tx: '0xaa', txUrl: 'https://basescan.org/tx/0xaa' }] };
const SERVICES = { ok: true, query: 'weather', note: 'x', summary: {}, services: [
  { url: 'https://weather.example/v1/now', description: 'Current <b>weather</b>.', method: 'GET', priceUsd: 0.001, networks: ['eip155:8453'], probes: { n: 4, answeredPct: 100, medianMs: 180 }, paidCalls: { n: 0 }, verdict: 'answered every probe' },
  { url: 'javascript:alert(1)', description: 'Bad.', method: 'POST', priceUsd: null, networks: [], probes: { n: 0 }, paidCalls: { n: 0 }, verdict: 'not enough probes yet (0/3)' }] };

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => { const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port, nav = await chromium.launch();
  const vu = { recherches: [] };
  const ouvre = async (largeur, url) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1100, height: 900 } });
    const page = await ctx.newPage();
    await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const u = r.request().url();
      if (/\/agentic\/store$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STORE) });
      if (/\/studio\/agent\/catalogue$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ouvert: true, defaut: 'sonnet-5', outils: [{ nom: 'scan_token' }, { nom: 'web_search' }], modeles: [{ id: 'sonnet-5', nom: 'Sonnet 5', typiqueSwoge: 1, maxSwoge: 2 }] }) });
      if (/\/agentic\/services\?/.test(u)) { vu.recherches.push(new URL(u).searchParams.get('q')); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SERVICES) }); }
      if (/\/studio\/chat\/catalogue$/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ouvert: true, defaut: 'sonnet-5', efforts: [], fournisseurs: [], modeles: [{ id: 'sonnet-5', nom: 'Sonnet 5', fournisseur: 'anthropic', actif: true, typiqueSwoge: 1, maxSwoge: 2 }] }) });
      return r.abort();
    });
    await page.goto('http://127.0.0.1:' + port + (url || '/agent_store.html'), { waitUntil: 'domcontentloaded' });
    return { page, ctx };
  };

  console.log('-- 1. les agents de SWOGE --');
  {
    const { page, ctx } = await ouvre();
    await page.waitForFunction(() => document.querySelectorAll('#grilleSwoge .agent').length === 3);
    const t = await page.textContent('#grilleSwoge');
    ok(/scan_token/.test(t) && /\$0\.02/.test(t) && /real cost, up to \$0\.2/.test(t), 'chaque agent, son prix (fixe ou au cout reel avec son maximum)');
    ok(/12 paid calls by outside agents in 30 days \(\$0\.24\)/.test(t) && /completed 12 of 14 paid attempts \(85\.7%\)/.test(t) && /not enough paid calls yet \(0\/10\)/.test(t),
       'l usage mesure, avec son effectif ; sous 10 tentatives, aucun taux');
    ok((await page.$('#grilleSwoge img')) === null && !(await page.evaluate(() => window.pirate)), 'ce que dit le serveur est du texte, jamais du HTML');
    const f = await page.$$eval('#filtres .puce', (l) => l.map((x) => x.textContent));
    ok(f.join() === 'All,Crypto,Image,Research', 'les filtres : les capacites presentes');
    await page.click('#filtres .puce:has-text("Research")');
    ok((await page.$$('#grilleSwoge .agent')).length === 1 && /web_search/.test(await page.textContent('#grilleSwoge')), 'un filtre ne garde que ses agents');
    await page.click('#filtres .puce:has-text("All")');
    const liens = await page.$$eval('#grilleSwoge .agent', (l) => l.map((a) => { const b = a.querySelector('a.btn'); return b ? b.getAttribute('href') : null; }));
    ok(liens[0] === 'swolemind.html?mission=' + encodeURIComponent('Run a due diligence on this token before I buy it: ') && liens[1] === null && liens[2] !== null,
       '« Use in a mission » seulement pour ce que l agent des missions sait faire, l objectif prerempli');
    await page.click('#grilleSwoge .agent:first-child summary');
    const d = await page.textContent('#grilleSwoge .agent:first-child details');
    ok(/Agent ID/.test(d) && /swoge:scan_token/.test(d) && /Owner/.test(d) && /address \(required\)/.test(d) && /read-only: never buys, sells or signs/.test(d) && /USDC on Base or Solana/.test(d),
       'le detail : identifiant, proprietaire, entree, permissions, facons de payer');
    ok(/Usage window: 2026-08-31 to 2026-09-29/.test(await page.textContent('#noteSwoge')), 'la fenetre de mesure est dite');
    /* Les paiements verifiables (29/09) : chaque ligne renvoie a sa transaction, un lien seulement s'il est https. */
    ok(!(await page.$eval('#preuves', (x) => x.hidden)) && /3 payments settled on-chain by outside agents since 2026-09-27: \$0\.018 in USDC or USDG from 2 distinct payers, plus 1 paid in \$SWOGE/.test(await page.textContent('#preuvesResume'))
       && /API key are billed from a balance, not on-chain/.test(await page.textContent('#preuvesResume')), 'le resume des paiements : combien, depuis quand, en dollars et en $SWOGE, et ce qui n y est pas');
    const px = await page.$$eval('#preuvesLignes tr', (l) => l.map((tr) => { const a = tr.querySelector('a'); return [tr.textContent, a ? a.getAttribute('href') : null]; }));
    ok(px.length === 3 && px[2][1] === 'https://basescan.org/tx/0xaa' && px[1][1] === 'https://solscan.io/tx/5hSigAbCdEfGhIjKlMn' && px[0][1] === null && /397\.41 SWOGE/.test(px[0][0]) && /\$0\.01 USDC/.test(px[2][0]),
       'chaque paiement, son montant dans sa monnaie, le lien de sa transaction ; une adresse javascript: n est jamais un lien');
    ok((await page.$('#preuvesLignes img')) === null && !(await page.evaluate(() => window.pirate2)) && /5hSigAbC\u2026JKlMn|5hSigAbC…KlMn/.test(px[1][0]), 'le nom d outil est du texte ; une longue transaction est abregee');
    ok(!/rating|stars|reputation score/i.test(await page.textContent('body')), 'aucune note inventee');
    await ctx.close();
  }

  console.log('\n-- 1b. les paiements a 360 px --');
  {
    const { page, ctx } = await ouvre(360);
    await page.waitForFunction(() => !document.getElementById('preuves').hidden);
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 360 px, le tableau des paiements defile dans son cadre, la page ne deborde pas [' + larg + ']');
    await ctx.close();
  }

  console.log('\n-- 2. les services x402 d autres vendeurs --');
  {
    const { page, ctx } = await ouvre(360);
    await page.waitForFunction(() => /8,169 services/.test(document.getElementById('resumeCatalogue').textContent));
    await page.click('#ongletX402');
    await page.waitForFunction(() => document.querySelectorAll('#grilleX402 .agent').length === 2);
    ok(vu.recherches[0] === '' && /probed 1,700/.test(await page.textContent('#resumeCatalogue')) && /8\.3% of the judged ones never answered/.test(await page.textContent('#resumeCatalogue')),
       'l onglet ouvre le catalogue mesure, et son resume chiffre');
    await page.click('#besoins .puce:has-text("weather")');
    await page.waitForFunction(() => /for “weather”/.test(document.getElementById('statutX402').textContent));
    ok(vu.recherches.includes('weather'), 'une pastille lance la recherche');
    const t = await page.textContent('#grilleX402');
    ok(/weather\.example/.test(t) && /answered every probe/.test(t) && /median 180 ms/.test(t) && /no paid call through SWOGE yet/.test(t) && /not enough probes yet \(0\/3\)/.test(t),
       'le verdict des sondes tel quel, la latence mediane, les paiements reels');
    ok((await page.$('#grilleX402 b:has-text("weather")')) === null || !/<b>/.test(await page.innerHTML('#grilleX402 .resume')), 'la description d un vendeur est du texte');
    const hrefs = await page.$$eval('#grilleX402 a', (l) => l.map((a) => a.getAttribute('href')));
    ok(hrefs.includes('swolemind.html?mission=' + encodeURIComponent('Use the paid x402 service https://weather.example/v1/now to: ')) && !hrefs.some((h) => /^javascript:/i.test(h)),
       'un service https : la mission preremplie et le lien ; une adresse javascript: n est jamais un lien');
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 360 px, rien ne deborde [' + larg + ']');
    await ctx.close();
  }

  console.log('\n-- 3. SwoleMind ouvre la mission preremplie --');
  {
    const { page, ctx } = await ouvre(1100, '/swolemind.html?mission=' + encodeURIComponent('Run a due diligence on this token before I buy it: '));
    await page.waitForFunction(() => document.getElementById('question').value.length > 0);
    ok(await page.getAttribute('.mode[data-mode="mission"]', 'aria-pressed') === 'true' && (await page.inputValue('#question')) === 'Run a due diligence on this token before I buy it: ',
       'le mode Mission, l objectif prerempli');
    ok((await page.$$('.msg')).length === 0, 'rien n est envoye tant que le joueur n envoie pas');
    await ctx.close();
  }

  const html = fs.readFileSync(path.join(SITE, 'agent_store.html'), 'utf8');
  ok(/<meta name="robots" content="noindex">/.test(html) && fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).filter((f) => fs.readFileSync(path.join(SITE, f), 'utf8').includes('href="swoge_esim.html"><span class="ic">'))
    .every((f) => fs.readFileSync(path.join(SITE, f), 'utf8').includes('<a href="agent_store.html"><span class="ic">&#129513;</span>Agent Store</a>')), 'chaque menu qui mene a l eSIM mene aussi a l Agent Store');

  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
