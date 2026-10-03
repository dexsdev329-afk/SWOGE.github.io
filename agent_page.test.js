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
/* /agentic/x402 tel que le serveur le rend (releve du 28/09) ; un nom pieges pour l injection. */
let X402 = { actif: true, outils: [{ name: 'scan_token', usd: 0.021001, usdBase: 0.02 }, { name: 'chat_completion', usd: 0.02, usdBase: 0.006642 },
  { name: 'token_verdict', usd: 0.02, usdBase: 0.01 }, { name: 'robinhood_rpc', usd: 0.02, usdBase: 0.005 }, { name: '<img src=x onerror=window.pirate=3>', usd: 0.02, usdBase: 0.02 }] };
/* Les embauches du joueur (28/09), dont un hote pieges pour l injection. */
const EMB = { vus: [], poste: [], refuse: null, rep: { ok: true, actif: true, budget: { jourUsd: 1, maxJoueurUsd: 1, depenseUsd: 0.012, maxAppelUsd: 0.1 }, liste: [
  { t: Date.UTC(2026, 8, 28, 14, 5), hote: 'api.delx.ai', usd: 0.001, factureUsd: 0.0011, etat: 'paye', tx: '5kgNQ9abcdef', reseau: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' },
  { t: Date.UTC(2026, 8, 28, 14, 1), hote: '<img src=x onerror=window.pirate=4>', usd: 0.01, factureUsd: 0, etat: 'perte', tx: '0xperdu', reseau: 'eip155:8453' }] } };
/* Les eSIM (28/09) : la route /studio/agent/achats, un faux serveur qui se souvient. */
const ACT = { uri: 'LPA:1$smdp.example.net$ACT-0101', code: 'ACT-0101', smdp: 'smdp.example.net', iccid4: '4242' };
const ACH = { poste: [], vus: [], liste: [] };
const DEV = { cles: [], appels: [], recus: [{ id: 'r1e2c3u4', outil: 'scan_token', swoge: '357.01535', t: Date.UTC(2026, 8, 26, 13, 5) }] };
/* Le credit en dollars (29/09) : un faux /credit qui se souvient ; null = route absente (les anciens scenarios). */
const CRED = { solde: null, topups: [] };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
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
  const ouvre = async ({ session, rep, largeur, reprise, portefeuille, cat, local } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1200, height: 900 } });
    if (local) await ctx.addInitScript((o) => { try { Object.keys(o).forEach((k) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, JSON.stringify(o[k])); }); } catch (e) {} }, local);
    if (session) await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} }, session);
    const page = await ctx.newPage();
    const signes = [];
    if (portefeuille) {
      await page.exposeFunction('__portefeuille', async (methode, params) => {
        if (methode === 'eth_requestAccounts') return ['0x' + '5'.repeat(40)];
        if (methode === 'wallet_switchEthereumChain') return null;
        if (methode === 'eth_signTypedData_v4') { signes.push(JSON.parse(params[1])); return '0x' + 'ab'.repeat(65); }
        throw new Error('unsupported ' + methode);
      });
      await page.addInitScript(() => { window.ethereum = { request: ({ method, params }) => window.__portefeuille(method, params || []) }; });
    }
    const envois = [], stops = [];
    await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), async (r) => {
      const u = r.request().url();
      if (/\/studio\/chat\/stop$/.test(u)) { stops.push({ auth: r.request().headers().authorization || null, corps: JSON.parse(r.request().postData() || '{}') });
        return r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true,"arretes":1}' }); }
      if (/\/studio\/agent\/catalogue/.test(u)) return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(cat || CAT) });
      if (/\/credit(\/topup)?$/.test(u) && CRED.solde !== null) {
        const H = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'payment-required, payment-response' };
        const q = r.request();
        if (/\/credit$/.test(u)) return r.fulfill({ status:200, headers: H, contentType:'application/json', body: JSON.stringify({ ok: true, balanceUsd: CRED.solde,
          history: CRED.topups.filter((t) => t.sig).map((t) => ({ at: '2026-09-29T10:00:00.000Z', kind: 'top-up', usd: t.corps.usd, what: null })) }) });
        const corps = JSON.parse(q.postData() || '{}'), sig = q.headers()['payment-signature'] || null;
        CRED.topups.push({ corps, sig, auth: q.headers().authorization || null });
        if (!sig) return r.fulfill({ status: 402, headers: Object.assign({ 'payment-required': b64({ x402Version: 2, resource: { url: 'https://srv/credit/topup' },
          accepts: [{ scheme: 'exact', network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', payTo: '0x' + '1'.repeat(40), amount: String(Math.round(corps.usd * 1e6) + 1000), maxTimeoutSeconds: 120, extra: { name: 'USD Coin', version: '2' } }] }) }, H),
          contentType:'application/json', body: '{}' });
        CRED.solde = Math.round((CRED.solde + corps.usd) * 1e6) / 1e6;
        return r.fulfill({ status: 200, headers: Object.assign({ 'payment-response': b64({ success: true, transaction: '0x' + 'cd'.repeat(32) }) }, H), contentType:'application/json',
          body: JSON.stringify({ ok: true, creditedUsd: corps.usd, balanceUsd: CRED.solde, alreadyCredited: false }) });
      }
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
        /* La permission de payer d'une cle (passerelle, 28/09) : le faux serveur la garde. */
        /* Le payeur d'une cle (29/09) : credit en dollars ou $SWOGE, le faux serveur le garde. */
        if (m === 'POST' && /\/payeur$/.test(u)) { const p = JSON.parse(q.postData());
          DEV.cles.forEach((c) => { c.payeur = p.payeur; c.plafondUsd = p.plafondUsd || null; if (p.plafondSwoge) c.plafondSwoge = p.plafondSwoge; });
          return r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' }); }
        if (m === 'POST' && /\/paiements$/.test(u)) { const p = JSON.parse(q.postData());
          DEV.cles.forEach((c) => { c.paiements = p.actif ? { actif: true, maxAppelUsd: p.maxAppelUsd, hotes: p.hotes } : { actif: false }; });
          return r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' }); }
        if (m === 'POST') { const c = JSON.parse(q.postData()); const k = 'swg_' + 'k'.repeat(43);
          DEV.cles.push({ id: 'abc123def456', nom: c.nom || 'agent', debut: 'swg_kkkk', cree: Date.now(), plafondSwoge: c.plafondSwoge, depenseAujourdhui: 0, revoquee: false,
            payeur: c.payeur === 'credit' ? 'credit' : 'swoge', plafondUsd: c.plafondUsd || null });
          return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, cle: k }) }); }
        if (m === 'DELETE') { DEV.cles.forEach((c) => { c.revoquee = true; }); return r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' }); }
        return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, cles: DEV.cles }) });
      }
      if (/\/agentic\/recus/.test(u)) return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, recus: DEV.recus }) });
      if (/\/agentic\/audit/.test(u)) return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, chaine: { ok: true, lignes: 3 },
        lignes: [{ t: Date.UTC(2026, 8, 28, 22, 0), hote: 'x402factory.ai', statut: 'paye', usd: 0.001 }, { t: Date.UTC(2026, 8, 28, 22, 1), hote: '<img src=x onerror=window.pirate=9>', statut: 'refuse', raison: 'not allowed' }] }) });
      if (/vitrine\.json/.test(u)) return r.fulfill({ status:200, contentType:'application/json', body:'{}' });
      if (/\/studio\/agent\/achats/.test(u)) {
        const q = r.request(); ACH.vus.push(q.headers().authorization || null);
        let out = { ok: true, actif: true, liste: ACH.liste };
        if (q.method() === 'POST') {
          const b = JSON.parse(q.postData() || '{}'); ACH.poste.push(b);
          if (b.action === 'confirme') { const a = { id: 'a1', t: Date.UTC(2026, 8, 28, 18, 0), nom: 'Japan 1GB 7Days', factureUsd: 1.470148, etat: 'livre', tx: 'solTxA', reseau: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', activation: ACT };
            ACH.liste = [a, { id: 'a0', t: Date.UTC(2026, 8, 28, 17, 0), nom: 'France 1GB 7Days', factureUsd: 1.470148, etat: 'paye', tx: 'solTx0', reseau: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', activation: null }];
            out = { ok: true, livree: true, achat: a, actif: true, liste: ACH.liste }; }
          if (b.action === 'livre') { ACH.liste[1] = Object.assign({}, ACH.liste[1], { etat: 'livre', activation: ACT }); out = { ok: true, achat: ACH.liste[1], actif: true, liste: ACH.liste }; }
        }
        return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(out) });
      }
      if (/\/studio\/agent\/embauches/.test(u)) { EMB.vus.push(r.request().headers().authorization || null);
        /* POST : le plafond choisi ; la fixture fait comme le serveur (borne, ou refuse si EMB.refuse). */
        if (r.request().method() === 'POST') { const q = JSON.parse(r.request().postData() || '{}'); EMB.poste.push({ q, auth: r.request().headers().authorization || null });
          if (EMB.refuse) return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok: false, raison: EMB.refuse }) });
          EMB.rep.budget.jourUsd = q.plafondUsd; }
        /* EMB.lentMs : la relecture traine (serveur charge) — c'est l'intervalle ou la page montrait le choix refuse. */
        if (EMB.lentMs) { const corps = JSON.stringify(EMB.rep); return new Promise((ok2) => setTimeout(ok2, EMB.lentMs)).then(() => r.fulfill({ status:200, contentType:'application/json', body: corps })); }
        return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(EMB.rep) }); }
      if (/\/agentic\/x402$/.test(u)) return X402 ? r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(X402) }) : r.abort();
      return r.abort();
    });
    await page.goto('http://127.0.0.1:' + port + '/swogeagentic.html', { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => /per task/.test(document.getElementById('prixq').textContent));
    return { page, ctx, envois, stops, signes };
  };
  const pose = async (page, q) => { await page.fill('#question', q); await page.click('#envoyer'); };

  console.log('-- 1. la page, sans rien executer --');
  {
    const html = fs.readFileSync(path.join(SITE, 'swogeagentic.html'), 'utf8');
    ok(/<title>SwogeAgentic[^<]*<\/title>/.test(html) && /rel="canonical" href="https:\/\/swoleeswoge\.dog\/swogeagentic\.html"/.test(html), 'son titre et son adresse canonique');
    ok(!/sk-ant-|ANTHROPIC_API_KEY\s*=|api\.anthropic\.com/.test(html), 'aucune cle, et la page ne parle jamais au fournisseur');
    /* 30/09 : SwoleMind et SwogeAgentic partagent une entree de menu, « Agents », qui ouvre
       swoge_agents.html (deux onglets, generee depuis les deux pages) ; l agent y est un onglet. */
    ok(/<a href="swoge_agents\.html" class="on" aria-current="page">/.test(html) && !/<a href="swolemind\.html"/.test(html), 'dans le menu, sous l entree commune Agents');
    const sm = fs.readFileSync(path.join(SITE, 'swolemind.html'), 'utf8');
    /* 29/09 : le proprietaire a voulu les missions dans SwoleMind (etape 1 « Agent OS ») : seul le mode
       Mission y parle a l'agent ; son chat reste le chat (/studio/chat), et la page reste a part. */
    const iMission = sm.indexOf('function envoyerMission('), fMission = sm.indexOf('function offreEsim(');
    const horsMission = sm.slice(0, iMission) + sm.slice(fMission);
    ok(/<title>SwoleMind/.test(sm) && /\/studio\/chat"/.test(sm) && iMission > 0 && /\/studio\/agent"/.test(sm.slice(iMission, fMission)) && !/"\/studio\/agent"/.test(horsMission.replace('"/studio/agent/catalogue"', '').replace('"/studio/agent/achats"', '')),
       'SwoleMind reste une page a part : son chat passe par /studio/chat, seul le mode Mission appelle l agent');
  }

  console.log('\n-- 2. le catalogue, et sans session rien ne part --');
  {
    const { page, ctx, envois } = await ouvre();
    eq(await page.$$eval('#outils .ag-outil', (l) => l.map((x) => x.textContent.replace(/^\S+ /, '')).join(',')), 'scan_token,colony_activity,swoge_economy,web_search', 'les outils de l agent, depuis le catalogue');
    eq(await page.inputValue('#modele'), 'sonnet-5', 'le modele par defaut du serveur');
    ok(/Sonnet 5 · ~2,500 \$SWOGE per task \(max 45,000\) · up to 6 steps/.test(await page.textContent('#prixq')), 'le prix d une tache, son maximum, le nombre d etapes');
    ok(/Read-only/.test(await page.textContent('.ag-lit')), 'la page dit que l agent ne fait que lire');
    /* x402 (28/09) : les posts menent ici ; la page dit comment un agent paie a l appel, prix lus en direct. */
    /* 03/10 : la section x402 est repliee sous le cadre (« trop d'information » sur la page). Les prix
       sont toujours lus en direct ; un clic sur sa ligne la montre. */
    await page.waitForSelector('#x4Outils .x4-o', { state: 'attached' });
    ok(!(await page.isVisible('#x402')), 'repliee par defaut : la page commence par la tache');
    await page.click('.x4-plie summary');
    ok(await page.isVisible('#x4Outils .x4-o'), 'un clic sur « For AI agents: pay per call with x402 » la montre');
    const x4 = await page.$$eval('#x4Outils .x4-o', (l) => l.map((d) => d.querySelector('b').textContent + '=' + d.querySelector('.x4-p').textContent));
    eq(x4.slice(0, 4).join(' | '), 'token_verdict=$0.01 | scan_token=$0.02 | robinhood_rpc=$0.005 | chat_completion=from $0.0066', 'les outils x402, dans l ordre voulu, au prix de Base lu en direct');
    ok(x4[4] === '<img src=x onerror=window.pirate=3>=$0.02' && (await page.$('#x4Outils img')) === null && !(await page.evaluate(() => window.pirate)), 'un nom venu du serveur reste du texte');
    const x4t = await page.textContent('#x402');
    ok(/no account and no API key/.test(x4t) && /USDC on Base or Solana/.test(x4t) && /PayAI/.test(x4t) && !/partner/i.test(x4t), 'la section dit x402, sans compte, Base et Solana, le catalogue PayAI — et aucun partenariat');
    ok(await page.$eval('#x4Decouverte', (a) => a.href) === 'https://web-production-220a3.up.railway.app/.well-known/x402' && (await page.$('#x402 a[href="x402_essai.html"]')) !== null, 'le fichier de decouverte et la page pour payer un appel');
    await pose(page, 'hello');
    ok(/Sign in/.test(await page.textContent('#etat')) && envois.length === 0, 'sans session : la page le dit, rien ne part');
    await ctx.close();
  }

  console.log('\n-- 2b. LE CADRE ET LES TACHES PASSEES (demande du proprietaire, 03/10/2026) --');
  {
    /* « Je la trouve compliquee a utiliser, beaucoup d'information, je ne vois pas l'historique des
       discussions ; le chat pas infini, dans un rectangle, on scroll dedans. » */
    const long = Array.from({ length: 25 }, (_, k) => [{ role: 'user', content: 'task step ' + k }, { role: 'assistant', content: 'result ' + k + ' ' + 'data '.repeat(50), meta: 'Sonnet 5' }]).flat();
    /* Un joueur d'avant le 03/10 : un seul fil, aucune tache. Il devient la premiere tache. */
    const { page, ctx } = await ouvre({ local: { swogeAgentFil: long } });
    await page.waitForFunction(() => document.querySelectorAll('#fil .msg').length === 50);
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => { const d = document.getElementById('defile');
      return { page: document.documentElement.scrollHeight, vue: innerHeight, interne: d.scrollHeight > d.clientHeight + 200, enBas: d.scrollHeight - d.scrollTop - d.clientHeight < 4 }; });
    ok(m.page <= m.vue + 200, '50 messages : la page ne s allonge pas (' + m.page + ' px pour ' + m.vue + ')');
    ok(m.interne && m.enBas, 'le fil defile DANS le cadre, ouvert sur le dernier message');
    ok(await page.isVisible('#histo') && !(await page.isVisible('#histoBtn')), 'ecran large : les taches sont a gauche, sans rien ouvrir');
    const g = await page.evaluate(() => ({ h: document.getElementById('histo').getBoundingClientRect(), f: document.getElementById('fil').getBoundingClientRect() }));
    ok(g.h.right <= g.f.left, 'a GAUCHE du fil');
    ok(/task step 0/.test(await page.textContent('#histo .ligne.actif')), 'l ancien fil unique devient une tache, marquee ouverte');
    ok(!(await page.isVisible('#dev')) || (await page.$eval('#dev', (d) => !d.open)), 'l API et x402 sont replies sous le cadre');
    await page.click('#histo .neuf');
    ok((await page.$$('#fil .msg')).length === 0 && await page.isVisible('#accueil'), '« New task » : une page vierge…');
    ok((await page.$$('#histo .ouvre')).length === 1, '… et l ancienne tache reste dans la liste');
    await page.click('#histo .ouvre');
    await page.waitForFunction(() => document.querySelectorAll('#fil .msg').length === 30, null, { timeout: 5000 }).catch(() => {});
    ok(/task step 24/.test(await page.textContent('#fil')) && (await page.$$('#fil .msg')).length === 30, 'un clic la rouvre (ses 30 derniers messages, comme le fil d avant)');
    const t = await page.evaluate(() => JSON.parse(localStorage.getItem('swogeAgentTaches')));
    ok(Array.isArray(t) && t.length === 1 && t[0].fil.length === 30 && /task step/.test(t[0].titre), 'gardee sur l appareil (30 derniers messages), titre = la premiere demande');
    await page.click('#histo .efface');
    ok((await page.$$('#histo .ouvre')).length === 0 && (await page.$$('#fil .msg')).length === 0, '« ✕ » efface la tache, et le fil ouvert se vide');
    await ctx.close();
    const tel = await ouvre({ largeur: 390, local: { swogeAgentTaches: [{ id: 'a', titre: 'Check PEPE', maj: Date.now(), fil: [{ role: 'user', content: 'Check PEPE' }, { role: 'assistant', content: 'PEPE ok' }] }], swogeAgentCourante: 'zz' } });
    ok(!(await tel.page.isVisible('#histo')) && await tel.page.isVisible('#histoBtn'), '390 px : les taches derriere « History »');
    await tel.page.click('#histoBtn');
    await tel.page.click('#histo .ouvre');
    await tel.page.waitForFunction(() => /PEPE ok/.test(document.getElementById('fil').textContent));
    ok(!(await tel.page.isVisible('#histo')), 'une tache ouverte : la liste se referme');
    const larg = await tel.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 390 px, rien ne deborde [' + larg + ']');
    await tel.ctx.close();
  }

  console.log('\n-- 2c. l embauche allumee (28/09) : la page ne dit plus « read-only », elle dit ce que l agent peut payer --');
  {
    CAT.embauche = { actif: true, maxAppelUsd: 0.1, jourUsd: 1, marge: 1.1 };
    const { page, ctx } = await ouvre();
    const lit = await page.textContent('#agLit');
    ok(!/Read-only/.test(lit) && /hire an outside AI service \(x402\) from your balance: at most \$0\.1 a call and \$1 a day, price \+ 10%/.test(lit), 'la phrase dit le plafond par appel, par jour, et la marge : « ' + lit.trim() + ' »');
    ok(await page.$eval('#embBox', (e) => e.hidden), 'sans session : l encadre des embauches reste cache');
    await ctx.close();
    const s = await ouvre({ session: 'jeton-emb' });
    await s.page.waitForFunction(() => !document.getElementById('embBox').hidden);
    const sum = await s.page.textContent('#embSum');
    const lignes = await s.page.$$eval('#embListe .dev-cle', (l) => l.map((x) => x.textContent));
    const lien = await s.page.$eval('#embListe a', (a) => a.href);
    ok(EMB.vus.includes('Bearer jeton-emb') && /\$0\.012 of \$1/.test(sum), 'avec session : le budget du jour, lu avec le jeton (« ' + sum.trim() + ' »)');
    ok(/api\.delx\.ai\$0\.001 → charged \$0\.0011/.test(lignes[0]) && /not charged \(the service failed after payment\)/.test(lignes[1]), 'chaque embauche : paye → facture, ou « not charged » quand le service a echoue');
    ok(lien === 'https://solscan.io/tx/5kgNQ9abcdef' && !(await s.page.evaluate(() => window.pirate)) && (await s.page.$('#embListe img')) === null, 'le lien de la transaction (Solscan pour Solana) ; un nom d hote pieges reste du texte');

    /* Le plafond du jour que le joueur choisit : la page propose, le serveur tranche. */
    const opts = await s.page.$$eval('#embPlaf option', (l) => l.map((o) => [o.value, o.textContent, o.selected]));
    ok(opts.map((o) => o[0]).join(',') === '0,0.1,0.25,0.5,1' && /Off/.test(opts[0][1]) && /\$1\.00 a day \(maximum\)/.test(opts[4][1]) && opts[4][2],
       'les choix vont de « Off » au plafond serveur (1 $), jamais au-dessus ; le plafond en cours est choisi : ' + opts.map((o) => o[0]).join(','));
    await s.page.click('#embSum');
    await s.page.selectOption('#embPlaf', '0');
    await s.page.waitForFunction(() => /switched off/.test(document.getElementById('embSum').textContent));
    ok(EMB.poste.length === 1 && EMB.poste[0].q.plafondUsd === 0 && EMB.poste[0].auth === 'Bearer jeton-emb' && /Saved/.test(await s.page.textContent('#embPlafMsg')),
       'choisir « Off » : POST { plafondUsd: 0 } avec le jeton de session, le resume dit « switched off »');
    EMB.refuse = 'the daily budget cannot be above 1 $';
    EMB.lentMs = 1000;   /* 29/09 : l'essai tombait sous charge ; avec une relecture lente, il tombait a chaque fois */
    await s.page.selectOption('#embPlaf', '0.5');
    await s.page.waitForFunction(() => /cannot be above/.test(document.getElementById('embPlafMsg').textContent));
    ok(await s.page.$eval('#embPlaf', (e) => e.value === '0' && !e.disabled), 'un refus du serveur : sa raison est dite, et la page revient a ce que le serveur a retenu (Off)');
    EMB.refuse = null; EMB.lentMs = 0; EMB.rep.budget.jourUsd = 1;
    delete CAT.embauche; await s.ctx.close();
  }

  console.log('\n-- 2b. le serveur muet : la section le dit, sans inventer de prix --');
  {
    const garde = X402; X402 = null;
    const { page, ctx } = await ouvre();
    await page.waitForFunction(() => /unavailable/.test(document.getElementById('x4Outils').textContent));
    ok((await page.$$('#x4Outils .x4-o')).length === 0, 'aucun prix affiche quand le serveur ne repond pas');
    X402 = garde; await ctx.close();
  }

  console.log('\n-- 3e. l eSIM (28/09) : l agent propose, seul le joueur achete --');
  {
    CAT.achats = { actif: true, maxAchatUsd: 15, jourUsd: 30, marge: 1.05 };
    const offre = { id: 'o1', plan: 'japan-1gb-7days-x', nom: 'Japan 1GB 7Days <img src=x onerror=window.pirate=5>', destination: 'Japan', go: 1, jours: 7, usd: 1.400141, factureUsd: 1.470148,
      expire: Date.now() + 15 * 60e3, conditions: 'https://vamoschips.com/legal/terms', remboursements: 'https://vamoschips.com/legal/refunds', compatibles: 'https://vamoschips.com/compatibility' };
    const rep = () => sse([['outil', { id: 's1', nom: 'find_esim_plans', entree: { country: 'Japan' } }], ['resultat', { id: 's1', nom: 'find_esim_plans', ok: true, resume: '' }],
      ['outil', { id: 's2', nom: 'propose_esim_purchase', entree: { plan: 'japan-1gb-7days-x' } }], ['resultat', { id: 's2', nom: 'propose_esim_purchase', ok: true, resume: '', achat: offre }],
      ['texte', { t: 'The offer is on your screen.' }], ['fin', { ok: true, texte: 'The offer is on your screen.', sources: [], jetons: [], factureSwoge: '900', etapes: 3, usage: {}, solde: '199100' }]]);
    const { page, ctx } = await ouvre({ session: 'jeton-ach', rep, largeur: 360 });
    ok(/nothing is bought until you press Buy/.test(await page.textContent('#agLit')), 'la phrase d en-tete dit que rien ne s achete sans le joueur');
    await pose(page, 'I need data in Japan for a week');
    await page.waitForSelector('.msg.ia .meta');
    const carte = await page.textContent('.achat');
    ok(/Japan 1GB 7Days <img/.test(carte) && !(await page.evaluate(() => window.pirate)) && (await page.$('.achat img')) === null, 'la carte de l offre ; un nom pieges reste du texte');
    ok(/1 GB · 7 days · Japan · data only, no phone number/.test(carte) && /Price: \$1\.470148 ≈ 52,487 \$SWOGE/.test(carte), 'la carte dit ce qu on achete et son prix (en $SWOGE au cours du catalogue)');
    const liens = await page.$$eval('.achat a', (l) => l.map((a) => a.href + '|' + a.rel + '|' + a.target));
    ok(liens.length === 3 && liens.every((x) => /noopener\|_blank$/.test(x)) && liens.some((x) => /legal\/terms/.test(x)) && liens.some((x) => /legal\/refunds/.test(x)) && liens.some((x) => /compatibility/.test(x)),
       'les conditions, les remboursements et la compatibilite du vendeur, en liens');
    ok(ACH.poste.length === 0, 'afficher l offre n achete rien');
    await page.click('.achat .ach-btn');
    await page.waitForFunction(() => /Done/.test(document.querySelector('.achat [role=status]').textContent));
    ok(ACH.poste.length === 1 && ACH.poste[0].action === 'confirme' && ACH.poste[0].id === 'o1' && ACH.vus.includes('Bearer jeton-ach'), 'Buy : POST { confirme, o1 } avec le jeton de SESSION');
    const act = await page.$$eval('.achat .ach-act code', (l) => l.map((x) => x.textContent));
    ok(act.join('|') === 'smdp.example.net|ACT-0101|LPA:1$smdp.example.net$ACT-0101' && await page.$eval('.achat .ach-btn', (b) => b.disabled && b.textContent === 'Bought'),
       'achete : l adresse SM-DP+, le code d activation et le code complet, a copier ; le bouton ne rachete pas');
    ok(await page.$eval('.achat canvas.ach-qr', (c) => c.width === (33 + 8) * 6 && c.getAttribute('role') === 'img'), 'et le QR du code complet (le generateur prouve du portefeuille), a scanner depuis un autre ecran');
    await page.waitForFunction(() => !document.getElementById('achBox').hidden);
    ok(/Your eSIMs · 2/.test(await page.textContent('#achSum')) && /ready/.test(await page.textContent('#achListe')) && /paid, being prepared/.test(await page.textContent('#achListe')),
       'l encadre « Your eSIMs » : la prete et celle en preparation');
    await page.click('#achSum');
    await page.click('#achListe button:has-text("Get my eSIM")');
    await page.waitForFunction(() => document.querySelectorAll('#achListe details').length === 2);
    ok(ACH.poste[1].action === 'livre' && ACH.poste[1].id === 'a0', '« Get my eSIM » redemande le code au serveur');
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 360 px, la carte et l encadre ne debordent pas [' + larg + ']');
    delete CAT.achats; await ctx.close();
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
    /* La licence de l'API GoPlus (relue le 26 septembre 2026) : la carte ou GoPlus a repondu dit « Powered by Go+ Security », avec un lien. */
    const gp = await page.$$eval('.msg.ia .jeton a[href="https://gopluslabs.io"]', (l) => l.map((a) => ({ t: a.textContent, rel: a.rel, c: a.target, b: !!a.querySelector('img[src="img/site/goplus_powered_by.png"]') })));
    ok(gp.length === 1 && gp[0].t === 'Powered by Go+ Security' && /noopener/.test(gp[0].rel) && gp[0].c === '_blank' && gp[0].b,
       'la carte porte « Powered by Go+ Security », lien vers gopluslabs.io (noopener, nouvel onglet) ' + JSON.stringify(gp));
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

  console.log('\n-- 3b. les marches voisins (28/09 au soir) : dits en clair, echappes --');
  {
    const BD = '0x' + 'ab'.repeat(20);
    const rep = () => sse([['outil', { id:'m1', nom:'stock_token_check', entree:{ symbol:'<img src=x onerror=window.pirate=3>' } }], ['resultat', { id:'m1', nom:'stock_token_check', ok:true, resume:'' }],
      ['outil', { id:'m2', nom:'base_launches', entree:{} }], ['resultat', { id:'m2', nom:'base_launches', ok:true, resume:'' }],
      ['outil', { id:'m3', nom:'base_deployer', entree:{ address: BD } }], ['resultat', { id:'m3', nom:'base_deployer', ok:true, resume:'' }],
      ['fin', { ok:true, texte:'done', sources:[], jetons:[], factureSwoge:'10', etapes:2, usage:{}, solde:'1' }]]);
    const { page, ctx } = await ouvre({ session:'j', rep });
    ok(/Real stock token or a copy/.test(await page.textContent('#suggestions')), 'une suggestion pour l action officielle ou la copie');
    await pose(page, 'is this NVDA real?');
    await page.waitForSelector('.msg.ia .meta');
    const t = await page.$$eval('.etapes li', (l) => l.map((x) => x.textContent));
    ok(/is the official Robinhood Stock Token/.test(t[0]) && /newest Base launches/.test(t[1]) && /Base launch record of 0xababab\u2026abab/.test(t[2]),
       'chaque outil dit ce qu il fait : ' + JSON.stringify(t).slice(0, 200));
    ok(!(await page.evaluate(() => window.pirate)) && (await page.$('.etapes img')) === null, 'le symbole demande ne peut pas injecter de HTML');
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
    ok(await page.$eval('#devPayeur', (x) => x.value) === 'credit' && await page.$eval('#devPlafond', (x) => x.placeholder) === 'Daily cap in USD', 'une cle neuve paie par defaut sur le credit en dollars, plafond en dollars');
    await page.selectOption('#devPayeur', 'swoge');
    ok(await page.$eval('#devPlafond', (x) => x.placeholder) === 'Daily cap in $SWOGE', 'en $SWOGE : le plafond se dit en $SWOGE');
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
    ok(await page.getAttribute('#devCles a.dev-passeport', 'href') === 'agent_passport.html?id=abc123def456', 'chaque cle mene a son passeport (29/09)');
    /* La passerelle (28/09 au soir) : les paiements d'une cle, eteints par defaut, allumes par la session. */
    ok(/Payments OFF: this key can only read/.test(await page.textContent('#devCles')), 'une cle neuve : paiements eteints, la page le dit');
    await page.click('.dev-paie:not(.dev-payeur) button');
    await page.fill('#paieMax_abc123def456', '0.05'); await page.fill('#paieHotes_abc123def456', 'x402factory.ai, api.example.com');
    await page.click('.dev-paie-f button');
    await page.waitForFunction(() => /Payments ON/.test(document.getElementById('devCles').textContent));
    const pp = DEV.appels.find((a) => /\/paiements$/.test(a.u));
    ok(pp && pp.auth === 'Bearer jeton-dev' && /\/agentic\/cles\/abc123def456\/paiements$/.test(pp.u) && JSON.stringify(JSON.parse(pp.corps)) === JSON.stringify({ actif: true, maxAppelUsd: 0.05, hotes: ['x402factory.ai', 'api.example.com'] }),
       'allumer les paiements : par la SESSION, le plafond par appel et les sites autorises');
    ok(/up to \$0\.05 per call, only x402factory\.ai, api\.example\.com/.test(await page.textContent('#devCles')), 'la cle dit ce qu elle a le droit de payer');
    await page.waitForSelector('#devAudit:not([hidden])');
    ok(/audit chain intact, 3 lines/.test(await page.textContent('#devAudit')) && (await page.$('#devAudit img')) === null && !(await page.evaluate(() => window.pirate)),
       'les paiements faits par les cles, avec l etat de la chaine d audit, en texte');
    ok((await page.textContent('#devCurl')).includes('/agentic/pay') && (await page.textContent('#devCurl')).includes('Idempotency-Key'), 'l exemple montre comment payer un service, avec son Idempotency-Key');
    /* Sortir le $SWOGE du chemin des agents (29/09) : la cle passe au credit en dollars. */
    await page.click('.dev-payeur button');
    await page.fill('#payeurCap_abc123def456', '2');
    await page.click('.dev-payeur-f button');
    await page.waitForFunction(() => /\$0\.00 \/ \$2\.00 today, from your dollar credit/.test(document.getElementById('devCles').textContent));
    const py = DEV.appels.find((a) => /\/payeur$/.test(a.u));
    ok(py && py.auth === 'Bearer jeton-dev' && /\/agentic\/cles\/abc123def456\/payeur$/.test(py.u) && JSON.stringify(JSON.parse(py.corps)) === JSON.stringify({ payeur: 'credit', plafondUsd: 2 }),
       'la cle passe au credit en dollars : par la SESSION, avec un plafond du jour en dollars');
    ok(/Pay from \$SWOGE instead/.test(await page.textContent('#devCles')), 'et peut revenir au $SWOGE');
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
    ok(await page.$eval('#x402Doc', (e) => e.hidden && getComputedStyle(e).display === 'none'), 'x402 eteint cote serveur : la doc n en parle pas (pas de promesse d un paiement eteint)');
    ok(/claude mcp add --transport http swogeagentic https:\/\/web-production-220a3\.up\.railway\.app\/mcp/.test(await page.textContent('#exMcp'))
       && /"quote":true/.test(await page.textContent('#exRest')), 'les exemples MCP et curl portent la vraie adresse, et le devis gratuit');
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 360 px, la doc ne deborde pas [' + larg + ']');
    const gd = await page.$eval('#goplusDoc a', (a) => ({ t: a.textContent, h: a.getAttribute('href'), rel: a.rel, c: a.target }));
    ok(gd.t === 'Powered by Go+ Security' && gd.h === 'https://gopluslabs.io' && /noopener/.test(gd.rel) && gd.c === '_blank'
       && /resultat\.attribution/.test(await page.textContent('#goplusDoc')), 'la doc dit d ou vient la securite de scan_token : « Powered by Go+ Security », lien, et le champ attribution');
    /* Les refus du Warden de new_launches sont des phrases GoPlus : la doc le dit, champ attribution compris (26 septembre 2026). */
    ok(/new_launches[^.]*honeypot/.test(await page.textContent('#goplusDoc')), 'et les verdicts de securite de new_launches aussi : meme mention, meme champ');
    const html = fs.readFileSync(path.join(SITE, 'swogeagentic_api.html'), 'utf8');
    ok(/rel="canonical" href="https:\/\/swoleeswoge\.dog\/swogeagentic_api\.html"/.test(html) && /<title>SwogeAgentic API/.test(html) && !/sk-ant-|swg_[A-Za-z0-9_-]{40}/.test(html), 'son adresse canonique, son titre, aucune cle dans la page');
    await ctx.close();

    /* x402 allume (etape 5) : la section apparait, remplie depuis le catalogue, en texte. */
    const ctx2 = await nav.newContext({ viewport: { width: 360, height: 800 } });
    const p2 = await ctx2.newPage();
    const X = Object.assign({}, CATA, { x402: { actif: true, network: 'eip155:4663', asset: '0x8a166Fb41Cd659a0a43396272FF73973Ce29F817', payTo: '0x<b>1111111111111111111111111111111111111111', minimumUsd: 0.02,
      assets: [{ symbol: 'USDG', asset: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', assetTransferMethod: 'eip3009' }, { symbol: '<i>SWOGE', asset: '0x8a166Fb41Cd659a0a43396272FF73973Ce29F817', assetTransferMethod: 'permit2' }] } });
    await p2.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => (/\/agentic\/tools/.test(r.request().url())
      ? r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(X) }) : r.abort()));
    await p2.goto('http://127.0.0.1:' + port + '/swogeagentic_api.html', { waitUntil:'domcontentloaded' });
    await p2.waitForFunction(() => !document.getElementById('x402Doc').hidden);
    ok(await p2.$eval('#x402Doc', (e) => getComputedStyle(e).display !== 'none'), 'x402 allume : la section apparait');
    eq(await p2.textContent('#x402Reseau') + ' ' + await p2.textContent('#x402Min'), 'eip155:4663 0.02', 'le reseau et le minimum viennent du catalogue');
    ok((await p2.textContent('#x402PayTo')).includes('<b>') && (await p2.$('#x402PayTo b')) === null, 'la tresorerie s ecrit en texte, jamais en HTML');
    const jetons = await p2.$$eval('#x402Jetons > div', (l) => l.map((d) => d.textContent));
    ok(jetons.length === 2 && /^USDG 0x5fc5.*eip3009$/.test(jetons[0]) && /permit2$/.test(jetons[1]) && (await p2.$('#x402Jetons i')) === null,
       'les deux jetons acceptes, USDG d abord, lus dans le catalogue et ecrits en texte [' + jetons.join(' | ') + ']');
    ok(/\/agentic\/x402$/.test(await p2.textContent('#x402Etat')), 'elle mene a l etat en direct');
    const larg2 = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg2 <= 1, 'a 360 px, la section x402 ne deborde pas [' + larg2 + ']');
    await ctx2.close();

    const llms = fs.readFileSync(path.join(SITE, 'llms.txt'), 'utf8');
    const h2 = llms.split('\n').filter((l) => /^## /.test(l));
    ok(/^# SwogeAgentic\n\n> /.test(llms) && !/^#{3,} /m.test(llms), 'llms.txt : un H1, puis le resume en citation, aucun titre plus profond (format llmstxt.org)');
    ok(h2.join(',') === '## Docs,## Optional', 'des listes de liens sous des H2, « Optional » en dernier');
    ok(llms.includes('(https://swoleeswoge.dog/swogeagentic_api.html)') && llms.includes('/agentic/tools)'), 'il mene a la doc et au catalogue en direct');
    /* Decisions du proprietaire, 26 septembre 2026 : telegram_calls n'est pas vendu (conditions de Telegram) ;
       scan_token porte la mention GoPlus. La copie se regenere avec outils/llms_site.js (depot du serveur). */
    ok(!/telegram_calls/.test(llms), 'llms.txt ne liste plus telegram_calls (pas vendu sans TG_APPELS_VENTE=1)');
    ok(/^- `scan_token\(address\)`.*Powered by Go\+ Security, https:\/\/gopluslabs\.io/m.test(llms), 'et sa ligne scan_token dit « Powered by Go+ Security » avec le lien');
  }

  console.log('\n-- 8. arreter une tache (demande du proprietaire, 26 septembre 2026) --');
  {
    const { page, ctx, envois, stops } = await ouvre({ session: 'j.stopA', rep: () => null });
    await pose(page, 'une tache mal posee');
    await page.waitForFunction(() => document.getElementById('envoyer').classList.contains('stop'));
    ok(await page.$eval('#envoyer', (b) => !b.disabled && b.getAttribute('aria-label') === 'Stop'), 'pendant la tache, le bouton devient STOP, actif');
    await page.click('#envoyer');
    await page.waitForFunction(() => document.querySelector('.msg.arrete .arret'));
    ok(stops.length === 1 && stops[0].auth === 'Bearer j.stopA' && stops[0].corps.rid === envois[0].corps.rid, 'Stop demande au serveur d arreter CETTE tache (son rid), par la session');
    ok(/nothing was charged/.test(await page.textContent('.msg.arrete .arret')), 'arretee avant tout : la page dit que rien n a ete facture');
    ok(await page.$eval('#envoyer', (b) => b.getAttribute('aria-label') === 'Run' && !b.classList.contains('stop')), 'le bouton redevient « lancer »');
    const fil = await page.evaluate(() => JSON.parse(localStorage.getItem('swogeAgentFil') || '[]'));
    ok(fil.length && fil[fil.length - 1].interrompu === true, 'la tache arretee reste dans le fil, marquee interrompue');
    await pose(page, 'la bonne tache');
    await page.waitForFunction(() => document.querySelectorAll('.msg.moi').length === 2);
    ok(envois.length === 2 && envois[1].corps.messages.every((m) => m.content !== 'une tache mal posee'), 'une NOUVELLE tache part tout de suite, sans l arretee dans l historique');
    await ctx.close();
  }

  console.log('\n-- 9. payer sans $SWOGE : le credit en dollars, et une signature par tache (29/09) --');
  {
    CRED.solde = 0; CRED.topups = [];
    const CATU = Object.assign({}, CAT, { modeles: CAT.modeles.map((m) => Object.assign({}, m, { typiqueUsd: 0.0126, maxUsd: 0.35 })) });
    let tour = 0;
    const rep = () => (++tour === 1 ? sse([['erreur', { ok: false, code: 402, payeur: 'credit', requisUsd: 0.35, creditUsd: 0.01, raison: 'your credit is too low for this model' }]])
      : sse([['texte', { t: 'Done.' }], ['fin', { ok: true, texte: 'Done.', payeur: 'credit', factureUsd: 0.0126, creditUsd: 0.3474, etapes: 1, modele: 'sonnet-5' }]]));
    const { page, ctx, envois, signes } = await ouvre({ session: 'j.credit', rep, portefeuille: true, cat: CATU });
    await page.waitForFunction(() => /\$0\.00/.test(document.getElementById('credit').textContent));
    eq(await page.$eval('#payeur', (s) => s.value), 'swoge', 'credit vide et $SWOGE en jeu : la page propose le $SWOGE par defaut');
    await page.selectOption('#payeur', 'credit');
    ok(/~\$0\.0126 per task \(max \$0\.35\)/.test(await page.textContent('#prixq')), 'au credit, le prix d une tache se lit en dollars');
    eq(await page.evaluate(() => localStorage.getItem('swogeAgentPayeur')), '"credit"', 'le choix du joueur est garde');
    await page.click('#recharger');
    await page.click('#rcMontants [data-usd="20"]');
    ok(/Sign a \$20\.00 top-up/.test(await page.textContent('#rcSigner')), 'le bouton dit le montant choisi');
    await page.click('#rcSigner');
    await page.waitForFunction(() => /Done: \$20\.00 added/.test(document.getElementById('rcStatut').textContent));
    ok(CRED.topups.length === 2 && !CRED.topups[0].sig && CRED.topups[1].sig && CRED.topups.every((t) => t.auth === 'Bearer j.credit' && t.corps.usd === 20 && Object.keys(t.corps).join() === 'usd'),
       'recharge : le 402, puis la MEME requete signee, par la session, le montant seul (jamais une adresse)');
    ok(signes.length === 1 && signes[0].primaryType === 'TransferWithAuthorization' && signes[0].domain.chainId === 8453 && signes[0].message.value === '20001000',
       'une signature USDC sur Base, du montant du 402');
    ok(/\$20\.00/.test(await page.textContent('#credit')), 'le credit affiche est celui que le serveur rend');
    CRED.solde = 0.01; CRED.topups = [];
    await pose(page, 'check this token');
    await page.waitForFunction(() => document.querySelector('.rc-action'));
    ok(/Sign \$0\.34 with your wallet and run/.test(await page.textContent('.rc-action')) && /\$0\.35 is reserved/.test(await page.textContent('.msg.err')),
       'credit trop court : UNE signature du montant qui manque (0,35 $ reserves, 0,01 $ en credit)');
    await page.click('.rc-action');
    /* La meta de la REPONSE (le prix sous le composeur dit deja 0,0126 $ : ne pas l attendre lui). */
    await page.waitForFunction(() => Array.prototype.some.call(document.querySelectorAll('.msg .meta'), (m) => /\$0\.0126/.test(m.textContent)));
    ok(CRED.topups.length === 2 && CRED.topups[1].corps.usd === 0.34 && signes.length === 2, 'la signature recharge exactement ce qui manque');
    ok(envois.length === 2 && envois.every((e) => e.corps.payeur === 'credit' && e.auth === 'Bearer j.credit' && !('addr' in e.corps) && !('adresse' in e.corps))
       && envois[1].corps.messages[envois[1].corps.messages.length - 1].content === 'check this token', 'puis la MEME tache repart, payee au credit, sans adresse');
    ok(/\$0\.3474/.test(await page.textContent('#credit')) && (await page.$$('.msg.moi')).length === 1, 'le credit se met a jour, et la question n apparait qu une fois');
    await ctx.close();
    CRED.solde = null;
  }

  console.log('\n-- 10. signer directement avec son portefeuille (29/09) --');
  {
    CRED.solde = 0; CRED.topups = [];
    const CATU = Object.assign({}, CAT, { modeles: CAT.modeles.map((m) => Object.assign({}, m, { typiqueUsd: 0.0126, maxUsd: 0.35 })) });
    let tour = 0;
    const rep = () => (++tour === 1 ? sse([['erreur', { ok: false, code: 402, payeur: 'credit', requisUsd: 0.35, creditUsd: 0, raison: 'too low' }]])
      : sse([['texte', { t: 'Done.' }], ['fin', { ok: true, texte: 'Done.', payeur: 'credit', factureUsd: 0.0126, creditUsd: 0.3374, etapes: 1, modele: 'sonnet-5' }]]));
    const { page, ctx, envois, signes } = await ouvre({ session: 'j.signe', rep, portefeuille: true, cat: CATU });
    await page.selectOption('#payeur', 'signe');
    ok(/your wallet signs USDC on Base/.test(await page.textContent('#prixq')), 'la ligne des prix dit que le portefeuille signera');
    await pose(page, 'check this token');
    await page.waitForFunction(() => Array.prototype.some.call(document.querySelectorAll('.msg .meta'), (m) => /\$0\.0126/.test(m.textContent)));
    ok(signes.length === 1 && CRED.topups.length === 2 && CRED.topups[1].corps.usd === 0.35 && envois.length === 2 && envois.every((e) => e.corps.payeur === 'credit'),
       'une tache : le portefeuille s ouvre tout seul pour ce qu il faut, puis la tache part, payee');
    await ctx.close();
    CRED.solde = null;
  }

  await nav.close(); srv.close();
  console.log('\nRATES : ' + rates + '/' + n);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
