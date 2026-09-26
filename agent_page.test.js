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

  await nav.close(); srv.close();
  console.log('\nRATES : ' + rates + '/' + n);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
