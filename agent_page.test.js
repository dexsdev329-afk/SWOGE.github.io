'use strict';
/* ============================================================================
 * SWOGEAGENTIC — LA PAGE MONTRE CE QUE L'AGENT FAIT, ELLE NE DECIDE RIEN
 *
 * Le serveur (`studio_agent.js`, `/studio/agent`) authentifie, reserve le
 * pire cas, facture le reel. Ce que la page DOIT tenir :
 *   1. elle se peint depuis le catalogue : outils, modeles, prix par tache ;
 *   2. sans session, rien ne part ; avec, le jeton et JAMAIS une adresse ;
 *   3. chaque geste de l'agent se voit (outil, puis reussi ou rate), la
 *      reponse est echappee, la carte d'un jeton et les sources suivent, le
 *      cout dit combien d'etapes la tache a prises ;
 *   4. un refus le dit et la tache non servie ne reste pas dans le fil ;
 *   5. rechargee, rien ne se perd : le fil est garde, une tache en cours est
 *      retrouvee par son rid ;
 *   6. rien ne deborde a 360 px ; SwoleMind reste une page a part.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4' };
const CAT = { ouvert:true, note:null, monnaie:'$SWOGE', coursUsd:0.00002801, defaut:'sonnet-5', etapesMax:6,
  outils:[{ nom:'scan_token', description:'Read a token' }, { nom:'colony_activity', description:'The colony' }, { nom:'swoge_economy', description:'Economy' }, { nom:'web_search', description:'Web' }],
  modeles:[{ id:'opus-5-5', nom:'Opus 5.5', typiqueSwoge:5000, maxSwoge:90000 }, { id:'sonnet-5', nom:'Sonnet 5', typiqueSwoge:2500, maxSwoge:45000 }, { id:'haiku-4-5', nom:'Haiku 4.5', typiqueSwoge:1200, maxSwoge:20000 }] };
const DEV = { cles: [], appels: [], recus: [{ id: 'r1e2c3u4', outil: 'scan_token', swoge: '357.01535', t: Date.UTC(2026, 8, 26, 13, 5) }] };
const sse = (evs) => evs.map(([t, d]) => 'event: ' + t + '\ndata: ' + JSON.stringify(d) + '\n\n').join('');
const PEPE = { adresse:'0x6982508145454ce325ddbe47a25d4ec3d2311933', trouve:true, sym:'PEPE', nom:'Pepe', chaine:'ethereum', prixUsd:0.0000044, liqUsd:25000000, mcUsd:1.8e9,
  vol24Usd:1e6, var24h:3.2, url:'https://dexscreener.com/ethereum/0xp', securite:'read', alertes:['Pausable'], taxeAchat:0, taxeVente:0, porteurs:593837, premierPorteur:8.8, dixPremiers:35.2, colonie:null };

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const ouvre = async ({ session, rep, largeur, reprise } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1200, height: 900 } });
    if (session) await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} }, session);
    const page = await ctx.newPage();
    const envois = [];
    await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), async (r) => {
      const u = r.request().url();
      if (/\/studio\/agent\/catalogue/.test(u)) return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(CAT) });
      if (/\/studio\/chat\/solde/.test(u)) return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, adresse:'0xabc', solde:'200000.0' }) });
      if (/\/studio\/agent$/.test(u) && r.request().method() === 'POST') {
        envois.push({ auth: r.request().headers().authorization || null, corps: JSON.parse(r.request().postData() || '{}') });
        const c = (rep || (() => ''))(envois[envois.length - 1].corps);
        if (c === null) return;
        if (typeof c === 'object') return r.fulfill({ status: c.http, contentType:'application/json', body: JSON.stringify(c) });
        return r.fulfill({ status:200, contentType:'text/event-stream', body: c });
      }
      if (/\/studio\/reprise\//.test(u) && reprise) { const x = reprise(decodeURIComponent(u.split('/studio/reprise/')[1])); return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(x) }); }
      /* Les cles d'API : un faux serveur qui se souvient, comme agentic_cles.js. */
      if (/\/agentic\/cles/.test(u)) {
        const q = r.request(), m = q.method();
        DEV.appels.push({ m, u, auth: q.headers().authorization || null, corps: q.postData() || '' });
        if (m === 'POST') { const c = JSON.parse(q.postData()); const k = 'swg_' + 'k'.repeat(43);
          DEV.cles.push({ id: 'abc123def456', nom: c.nom || 'agent', debut: 'swg_kkkk', cree: Date.now(), plafondSwoge: c.plafondSwoge, depenseAujourdhui: 0, revoquee: false });
          return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, cle: k }) }); }
        if (m === 'DELETE') { DEV.cles.forEach((c) => { c.revoquee = true; }); return r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' }); }
        return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, cles: DEV.cles }) });
      }
      if (/\/agentic\/recus/.test(u)) return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, recus: DEV.recus }) });
      if (/vitrine\.json/.test(u)) return r.fulfill({ status:200, contentType:'application/json', body:'{}' });
      return r.abort();
    });
    await page.goto('http://127.0.0.1:' + port + '/swogeagentic.html', { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => /\$SWOGE per task/.test(document.getElementById('prixq').textContent));
    return { page, ctx, envois };
  };
  const pose = async (page, q) => { await page.fill('#question', q); await page.click('#envoyer'); };

  console.log('-- 1. la page, sans rien executer --');
  {
    const html = fs.readFileSync(path.join(SITE, 'swogeagentic.html'), 'utf8');
    ok(/<title>SwogeAgentic[^<]*<\/title>/.test(html) && /rel="canonical" href="https:\/\/swoleeswoge\.dog\/swogeagentic\.html"/.test(html), 'son titre et son adresse canonique');
    ok(!/sk-ant-|ANTHROPIC_API_KEY\s*=|api\.anthropic\.com/.test(html), 'aucune cle, et la page ne parle jamais au fournisseur');
    ok(/<a href="swogeagentic\.html" class="on" aria-current="page">/.test(html) && /<a href="swolemind\.html">/.test(html), 'dans le menu, a cote de SwoleMind');
    const sm = fs.readFileSync(path.join(SITE, 'swolemind.html'), 'utf8');
    ok(/<title>SwoleMind/.test(sm) && !/\/studio\/agent/.test(sm), 'SwoleMind reste une page a part, inchangee dans ce qu elle fait');
  }

  console.log('\n-- 2. le catalogue, et sans session rien ne part --');
  {
    const { page, ctx, envois } = await ouvre();
    eq(await page.$$eval('#outils .ag-outil', (l) => l.map((x) => x.textContent.replace(/^\S+ /, '')).join(',')), 'scan_token,colony_activity,swoge_economy,web_search', 'les outils de l agent, depuis le catalogue');
    eq(await page.inputValue('#modele'), 'sonnet-5', 'le modele par defaut du serveur');
    ok(/Sonnet 5 · ~2,500 \$SWOGE per task \(max 45,000\) · up to 6 steps/.test(await page.textContent('#prixq')), 'le prix d une tache, son maximum, le nombre d etapes');
    ok(/Read-only/.test(await page.textContent('.ag-lit')), 'la page dit que l agent ne fait que lire');
    await pose(page, 'hello');
    ok(/Sign in/.test(await page.textContent('#etat')) && envois.length === 0, 'sans session : la page le dit, rien ne part');
    await ctx.close();
  }

  console.log('\n-- 3. une tache : chaque geste se voit --');
  {
    const rep = () => sse([['etape', { quoi:'reflexion' }],
      ['outil', { id:'t1', nom:'scan_token', entree:{ address: PEPE.adresse } }], ['resultat', { id:'t1', nom:'scan_token', ok:true, resume:'Token…' }],
      ['outil', { id:'t2', nom:'web_search', entree:{ query:'pepe <img src=x onerror=window.pirate=1>' } }], ['resultat', { id:'t2', nom:'web_search', ok:false, resume:'the tool failed: 500' }],
      ['texte', { t:'**PEPE** <script>window.pirate=2</script> has $25M liquidity [1].' }],
      ['fin', { ok:true, texte:'**PEPE** <script>window.pirate=2</script> has $25M liquidity [1].', sources:[{ url:PEPE.url, titre:'DexScreener · $PEPE' }], jetons:[PEPE], factureSwoge:'812', etapes:3, usage:{}, solde:'199188' }]]);
    const { page, ctx, envois } = await ouvre({ session:'jeton-x', rep, largeur:360 });
    await page.click('.suggestion >> nth=0');
    ok(/Check this token/.test(await page.inputValue('#question')), 'une suggestion prepare la tache');
    await page.selectOption('#modele', 'haiku-4-5');
    await pose(page, 'check ' + PEPE.adresse);
    await page.waitForSelector('.msg.ia .meta');
    const e = envois[0];
    ok(e.auth === 'Bearer jeton-x' && !('adresse' in e.corps) && !('addr' in e.corps), 'le jeton en Authorization, jamais une adresse');
    ok(e.corps.modele === 'haiku-4-5' && /^[a-z0-9]{8,}$/.test(e.corps.rid) && e.corps.messages.length === 1, 'le modele choisi, un rid, la tache');
    eq(await page.$$eval('.etapes li', (l) => l.map((x) => x.getAttribute('data-etat') + ':' + x.querySelector('b').textContent.replace(/^\S+ /, '')).join(',')), 'ok:scan_token,err:web_search', 'chaque outil appele, reussi ou rate');
    ok(/Reading token 0x698250…1933/.test(await page.textContent('.etapes li >> nth=0')) && /the tool failed: 500/.test(await page.textContent('.etapes li >> nth=1')), 'dit en clair, avec la raison d un echec');
    ok(!(await page.evaluate(() => window.pirate)) && (await page.$('.etapes img, .corps script')) === null, 'ni la requete d un outil ni la reponse ne peuvent injecter de HTML');
    ok(/\$PEPE/.test(await page.textContent('.msg.ia .jeton')) && (await page.$$('.msg.ia .source')).length === 1, 'la carte du jeton et les sources suivent');
    eq(await page.textContent('.msg.ia .meta'), 'Haiku 4.5 · 812 $SWOGE · 3 steps', 'le cout dit le modele et le nombre d etapes');
    ok(/199,188/.test(await page.textContent('#solde')), 'et le solde est mis a jour');
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 360 px, rien ne deborde [' + larg + ']');
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForSelector('.msg.ia .meta');
    ok((await page.$$('.etapes li')).length === 2 && (await page.$$('.msg.ia .jeton')).length === 1, 'rechargee : la tache, ses etapes et sa carte sont toujours la');
    await pose(page, 'and the colony?');
    await page.waitForFunction(() => document.querySelectorAll('.msg.ia .meta').length === 2);
    ok(envois[1].corps.messages.length === 3 && envois[1].corps.messages[1].role === 'assistant', 'la tache suivante relit le fil');
    await page.click('#nouveau');
    ok((await page.$$('.msg')).length === 0 && await page.isVisible('#accueil'), '« New task » repart de zero');
    await ctx.close();
  }

  console.log('\n-- 4. un refus --');
  {
    /* Comme le vrai serveur : le flux s'ouvre, puis le refus arrive en evenement « erreur ». */
    const { page, ctx } = await ouvre({ session:'j', rep: () => sse([['erreur', { ok:false, code:402, raison:'balance too low for this model', requisSwoge:'45000' }]]) });
    await pose(page, 'big task');
    await page.waitForSelector('.msg.ia.err');
    ok(/balance too low/.test(await page.textContent('.msg.ia.err')) && /45,000 \$SWOGE reserved/.test(await page.textContent('.msg.ia.err')), 'un 402 dit combien est reserve, et que seul l usage est paye');
    eq(await page.evaluate(() => JSON.parse(localStorage.getItem('swogeAgentFil')).length), 0, 'la tache non servie ne reste pas dans le fil');
    await ctx.close();
  }

  console.log('\n-- 5. rechargee pendant une tache --');
  {
    let tours = 0;
    const reprise = () => (++tours < 2 ? { ok:true, status:'pending', texte:'Working' }
      : { ok:true, status:'done', texte:'Recovered answer.', sources:[], jetons:[PEPE], factureSwoge:'600', etapes:2, modele:'sonnet-5' });
    const { page, ctx, envois } = await ouvre({ session:'j', rep: () => null, reprise });
    await pose(page, 'long task');
    await page.waitForTimeout(300);
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForSelector('.msg.ia .meta', { timeout: 10000 });
    ok(/Recovered answer/.test(await page.textContent('.msg.ia .corps')) && /Sonnet 5 · 600 \$SWOGE · 2 steps/.test(await page.textContent('.msg.ia .meta')) && envois.length === 1,
       'la reponse finie sur le serveur est retrouvee par son rid, avec son cout, sans relancer la tache');
    await ctx.close();
  }

  console.log('\n-- 6. pour les autres agents : cles d API, MCP, recus --');
  {
    /* Demande du proprietaire, le 26 septembre 2026 : « SwogeAgentic comme HYRE,
       utilisable par les autres agents ». La cle se cree par la session, se
       montre UNE fois, n'est jamais ecrite dans le navigateur. */
    const sans = await ouvre({});
    await sans.page.click('#dev summary');
    ok(await sans.page.isVisible('#devSession') && await sans.page.isHidden('#devForm'), 'sans session : la page dit de se connecter, pas de formulaire');
    ok(/claude mcp add --transport http swogeagentic https:\/\/web-production-220a3\.up\.railway\.app\/mcp/.test(await sans.page.textContent('#devClaude')),
       'la commande Claude Code, a la syntaxe de sa documentation');
    await sans.ctx.close();

    const { page, ctx } = await ouvre({ session:'jeton-dev', largeur:360 });
    await page.click('#dev summary');
    await page.waitForFunction(() => !document.getElementById('devForm').hidden);
    await page.click('#devCree');
    ok(/daily cap/.test(await page.textContent('#etat')) && !DEV.appels.some((a) => a.m === 'POST'), 'sans plafond par jour : la page le demande, rien ne part');
    await page.fill('#devNom', 'my-bot'); await page.fill('#devPlafond', '5000');
    await page.click('#devCree');
    await page.waitForSelector('#devNeuve:not([hidden]) code');
    const post = DEV.appels.find((a) => a.m === 'POST');
    ok(post.auth === 'Bearer jeton-dev' && JSON.parse(post.corps).plafondSwoge === 5000 && JSON.parse(post.corps).nom === 'my-bot', 'la cle se cree avec le jeton de SESSION, le nom et le plafond');
    const cle = 'swg_' + 'k'.repeat(43);
    ok((await page.textContent('#devNeuve code')) === cle && /will not be shown again/.test(await page.textContent('#devNeuve')), 'la cle est montree une fois, et la page le dit');
    ok((await page.textContent('#devJson')).includes('"Authorization": "Bearer ' + cle + '"') && (await page.textContent('#devJson')).includes('"url": "https://web-production-220a3.up.railway.app/mcp"'),
       'les extraits de configuration portent la cle et l adresse MCP');
    ok(!(await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)))).includes(cle), 'la cle n est JAMAIS ecrite dans le navigateur');
    await page.waitForSelector('#devCles .dev-cle');
    ok(/my-bot/.test(await page.textContent('#devCles')) && /0 \/ 5,000 \$SWOGE today/.test(await page.textContent('#devCles')), 'la liste : nom, depense du jour sur le plafond');
    ok(/scan_token · 357\.01535 \$SWOGE · receipt r1e2c3u4/.test(await page.textContent('#devRecus')), 'les derniers appels, avec leur recu');
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 360 px, la section ne deborde pas [' + larg + ']');
    await page.click('#devCles .dev-cle button');
    await page.waitForFunction(() => !document.querySelector('#devCles .dev-cle'));
    ok(DEV.appels.some((a) => a.m === 'DELETE' && /\/agentic\/cles\/abc123def456$/.test(a.u) && a.auth === 'Bearer jeton-dev'), '« Revoke » revoque par la session, et la cle quitte la liste');
    await page.reload({ waitUntil:'domcontentloaded' });
    ok(await page.isHidden('#devNeuve'), 'rechargee : la cle ne se remontre plus');
    await ctx.close();
  }

  console.log('\n-- 7. la documentation de l API et llms.txt --');
  {
    /* Etape 4 (26 septembre 2026) : que les developpeurs et leurs agents
       trouvent l'API. La doc lit le catalogue en direct : aucun prix recopie. */
    const CATA = { ok: true, coursUsd: 0.00002801, outils: [
      { name: 'scan_token', description: 'Read live data on a token. More.', inputSchema: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] }, prix: { usd: 0.01, swoge: '357.01535' } },
      { name: 'ask_agent', description: 'Give a whole task to <b>SwogeAgentic</b>. Billed.', inputSchema: { type: 'object', properties: { task: {}, model: {} }, required: ['task'] }, prix: { variable: true, maxUsd: 1.278, maxSwoge: '45626.5' } }] };
    const ctx = await nav.newContext({ viewport: { width: 360, height: 800 } });
    const page = await ctx.newPage();
    await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => (/\/agentic\/tools/.test(r.request().url())
      ? r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(CATA) }) : r.abort()));
    await page.goto('http://127.0.0.1:' + port + '/swogeagentic_api.html', { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#outilsDoc tr').length === 2 && !/Loading/.test(document.getElementById('outilsDoc').textContent));
    const lignes = await page.$$eval('#outilsDoc tr', (l) => l.map((tr) => Array.from(tr.children).map((td) => td.textContent).join(' | ')));
    eq(lignes[0], 'scan_token | Read live data on a token. | address | $0.01 (357.02 $SWOGE)', 'la doc lit le catalogue : outil, phrase, arguments, prix en $ et $SWOGE');
    eq(lignes[1], 'ask_agent | Give a whole task to <b>SwogeAgentic</b>. | task, model? | real cost, up to $1.278 (45,627 $SWOGE)', 'un outil au reel dit son maximum ; le texte du catalogue reste du texte');
    ok((await page.$('#outilsDoc b')) === null, 'rien du catalogue ne devient du HTML');
    ok(/claude mcp add --transport http swogeagentic https:\/\/web-production-220a3\.up\.railway\.app\/mcp/.test(await page.textContent('#exMcp'))
       && /"quote":true/.test(await page.textContent('#exRest')), 'les exemples MCP et curl portent la vraie adresse, et le devis gratuit');
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 360 px, la doc ne deborde pas [' + larg + ']');
    const html = fs.readFileSync(path.join(SITE, 'swogeagentic_api.html'), 'utf8');
    ok(/rel="canonical" href="https:\/\/swoleeswoge\.dog\/swogeagentic_api\.html"/.test(html) && /<title>SwogeAgentic API/.test(html) && !/sk-ant-|swg_[A-Za-z0-9_-]{40}/.test(html), 'son adresse canonique, son titre, aucune cle dans la page');
    await ctx.close();

    const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
    const h2 = llms.split('\n').filter((l) => /^## /.test(l));
    ok(/^# SwogeAgentic\n\n> /.test(llms) && !/^#{3,} /m.test(llms), 'llms.txt : un H1, puis le resume en citation, aucun titre plus profond (format llmstxt.org)');
    ok(h2.join(',') === '## Docs,## Optional', 'des listes de liens sous des H2, « Optional » en dernier');
    ok(llms.includes('(https://swoleeswoge.dog/swogeagentic_api.html)') && llms.includes('/agentic/tools)'), 'il mene a la doc et au catalogue en direct');
  }

  await nav.close(); srv.close();
  console.log('\nRATES : ' + rates + '/' + n);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
