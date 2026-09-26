'use strict';
/* ============================================================================
 * SWOGE AI CHAT — LA PAGE TRANSPORTE, ELLE NE DECIDE RIEN
 *
 * Le prix, le debit et le remboursement sont calcules par le serveur
 * (`studio_chat.js`, essaye par `studio_chat.test.js` dans l'autre depot).
 * Ce que la page DOIT tenir :
 *
 *   1. Elle se peint depuis le CATALOGUE du serveur : les modeles, leur prix
 *      typique et maximal en $SWOGE — un modele ajoute cote serveur apparait.
 *   2. Sans session, elle ne pose aucune question au serveur et dit pourquoi.
 *   3. Avec session, elle envoie le jeton en `Authorization` et JAMAIS une
 *      adresse : c'est le serveur qui sait qui est debite.
 *   4. Le texte d'un modele est ECHAPPE : il ne peut pas injecter de HTML.
 *   5. Chaque reponse dit ce qu'elle a coute ; les sources sont des liens.
 *   6. Un refus (402, 429...) le dit, et la question non servie ne reste pas
 *      dans l'historique renvoye au tour suivant.
 *   7. Rien ne deborde sur un telephone de 360 px.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.mp4':'video/mp4' };

/* Le catalogue tel que le serveur le rend (forme de `studio_chat.catalogue`,
   cours 0,00002801 $, marge 1,5). */
const CAT = { ouvert:true, note:null, monnaie:'$SWOGE', coursUsd:0.00002801, marge:1.5, defaut:'opus-5-5',
  efforts:['low','medium','high'], modeles:[
    { id:'opus-5-5', nom:'Opus 5.5', note:'Most capable for everyday work', fournisseur:'Anthropic', effort:true, recherche:true, typiqueSwoge:1179, maxSwoge:16700 },
    { id:'fable-5-1', nom:'Fable 5.1', note:'Deepest reasoning', fournisseur:'Anthropic', effort:true, recherche:true, typiqueSwoge:2946, maxSwoge:41000 },
    { id:'sonnet-5', nom:'Sonnet 5', note:'Fast and capable', fournisseur:'Anthropic', effort:true, recherche:true, typiqueSwoge:590, maxSwoge:7000 },
    { id:'haiku-4-5', nom:'Haiku 4.5', note:'Fastest for quick answers', fournisseur:'Anthropic', effort:false, recherche:true, typiqueSwoge:295, maxSwoge:3400 },
  ] };
const sse = (evs) => evs.map(([t, d]) => 'event: ' + t + '\ndata: ' + JSON.stringify(d) + '\n\n').join('');

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();

  /* `rep(corps)` rend le flux SSE d'une question ; `envois` garde ce que la
     page a POSTe. Tout ce qui sort de la machine est coupe : l'essai ne
     depend ni du reseau ni du vrai serveur. */
  const ouvre = async ({ session, cat, rep, largeur, reprise } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1200, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:' + port });
    if (session) await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} }, session);
    const page = await ctx.newPage();
    const envois = [], soldes = [];
    await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), async (r) => {
      const u = r.request().url();
      if (/\/studio\/chat\/catalogue/.test(u)) return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(cat || CAT) });
      if (/\/studio\/chat\/solde/.test(u)) {
        soldes.push(r.request().headers().authorization || null);
        return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ok:true, adresse:'0xabc', solde:'200000.0' }) });
      }
      if (/\/studio\/chat$/.test(u) && r.request().method() === 'POST') {
        envois.push({ auth: r.request().headers().authorization || null, corps: JSON.parse(r.request().postData() || '{}') });
        const corps = (rep || (() => ''))(envois[envois.length - 1].corps);
        if (corps === null) return;                /* la reponse n arrive jamais : la page sera rechargee avant */
        return r.fulfill({ status:200, contentType:'text/event-stream', body: corps });
      }
      if (/\/studio\/reprise\//.test(u) && reprise) {
        const x = reprise(decodeURIComponent(u.split('/studio/reprise/')[1]));
        return r.fulfill({ status: x.http || 200, contentType:'application/json', body: JSON.stringify(x) });
      }
      if (/vitrine\.json/.test(u)) return r.fulfill({ status:200, contentType:'application/json', body:'{}' });
      return r.abort();
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_studio.html', { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => /\$SWOGE per question/.test(document.getElementById('prixq').textContent));
    return { page, ctx, envois, soldes };
  };
  const pose = async (page, q) => { await page.fill('#question', q); await page.click('#envoyer'); };

  console.log('-- 1. la page, sans rien executer --');
  {
    /* Depuis le 26 septembre 2026, Studio EST le chat : on y arrive sur le composeur. */
    const html = fs.readFileSync(path.join(SITE, 'swoge_studio.html'), 'utf8');
    ok(/<title>[^<]*SWOGE Studio[^<]*chat[^<]*<\/title>/i.test(html), 'le titre est celui du Studio, qui est le chat');
    ok(!/sk-ant-|ANTHROPIC_API_KEY\s*=|x-api-key/i.test(html), 'aucune cle de fournisseur dans la page');
    ok(!/api\.anthropic\.com/.test(html), 'la page ne parle jamais au fournisseur directement');
    ok(/stakebubble\.min\.js\?v=/.test(html), 'la connexion par portefeuille est chargee');
    ok(!/Open SWOGE AI Chat|class="vers-chat"/.test(html), 'aucun bouton « Open chat » a cliquer : on est deja dans le chat');
  }

  console.log('\n-- 2. la page se peint depuis le catalogue --');
  {
    const { page, ctx } = await ouvre();
    eq(await page.textContent('#modeleNom'), 'Opus 5.5', 'le modele par defaut est celui du catalogue');
    ok(/1,179 \$SWOGE per question \(max 16,700\)/.test(await page.textContent('#prixq')), 'le prix typique ET le plafond sont montres');
    await page.click('#modeleBtn');
    eq((await page.$$('#modeles .modele')).length, 4, 'la feuille liste les quatre modeles');
    ok(!(await page.$eval('#efforts', (e) => e.hidden)), 'Opus propose l effort');
    await page.click('#modeles .modele[data-modele="haiku-4-5"]');
    ok(await page.$eval('#efforts', (e) => e.hidden), 'Haiku ne propose pas d effort (le serveur le refuserait)');
    eq(await page.textContent('#modeleNom'), 'Haiku 4.5', 'le choix est pris');
    eq(await page.evaluate(() => localStorage.getItem('swogeChatModele')), '"haiku-4-5"', 'et retenu pour la prochaine visite');
    await ctx.close();
    const plus = JSON.parse(JSON.stringify(CAT));
    plus.modeles.push({ id:'autre', nom:'Other 1', note:'later', effort:false, recherche:false, typiqueSwoge:100, maxSwoge:900 });
    const b = await ouvre({ cat: plus });
    await b.page.click('#modeleBtn');
    eq((await b.page.$$('#modeles .modele')).length, 5, 'un modele ajoute cote serveur apparait, page inchangee');
    await b.ctx.close();
  }

  console.log('\n-- 3. sans session, aucune question ne part --');
  {
    const { page, ctx, envois } = await ouvre();
    ok(/sign in/i.test(await page.textContent('#solde')), 'le solde demande la connexion');
    await pose(page, 'hello');
    await page.waitForTimeout(200);
    eq(envois.length, 0, 'rien n est POSTe sans jeton');
    ok(/sign in/i.test(await page.textContent('#etat')), 'et la page dit pourquoi');
    await ctx.close();
  }

  console.log('\n-- 4. avec session : le jeton part, jamais une adresse --');
  {
    const rep = () => sse([
      ['etape', { quoi:'recherche' }],
      ['texte', { t:'**Bold** answer with ' }],
      ['texte', { t:'<img src=x onerror="window.PIEGE=1"> and `code`' }],
      ['fin', { ok:true, texte:'**Bold** answer with <img src=x onerror="window.PIEGE=1"> and `code`',
        sources:[{ url:'https://example.com/a', titre:'Example A' }, { url:'https://news.example.org/b', titre:'' }],
        stop:'end_turn', modele:'opus-5-5', factureSwoge:'1432.5', factureUsd:0.0401,
        usage:{ entree:1200, sortie:700, recherches:1 }, solde:'198567.5' }],
    ]);
    const { page, ctx, envois, soldes } = await ouvre({ session:'jeton-de-test', rep });
    await page.waitForFunction(() => /200,000/.test(document.getElementById('solde').textContent));
    eq(soldes[0], 'Bearer jeton-de-test', 'le solde est demande avec le jeton de session');
    await page.click('#web');
    await pose(page, 'What is new today?');
    await page.waitForSelector('.msg.ia .meta');
    eq(envois.length, 1, 'une question, un envoi');
    ok(await page.$eval('#accueil', (a) => a.offsetHeight === 0), 'l accueil s efface des la premiere question');
    const e = envois[0];
    eq(e.auth, 'Bearer jeton-de-test', 'le jeton part en Authorization');
    ok(!/0x[0-9a-f]{40}|"addr"|adresse/i.test(JSON.stringify(e.corps)), 'le corps ne porte AUCUNE adresse');
    eq(e.corps.modele, 'opus-5-5', 'le modele choisi part');
    eq(e.corps.recherche, true, 'la recherche web part quand elle est allumee');
    eq(e.corps.effort, 'medium', 'l effort par defaut part pour Opus');
    eq(JSON.stringify(e.corps.messages), JSON.stringify([{ role:'user', content:'What is new today?' }]), 'l historique ne porte que les roles et les textes');
    const ia = await page.$('.msg.ia');
    ok(!!(await ia.$('.corps b')), 'le Markdown est rendu (gras)');
    eq(await ia.$('.corps img'), null, 'le HTML venu du modele n est PAS injecte');
    eq(await page.evaluate(() => window.PIEGE), undefined, 'et aucun script n a tourne');
    eq((await ia.$$('.sources a')).length, 2, 'les sources sont des liens');
    ok(/example\.com\/a/.test(await ia.$eval('.sources a', (a) => a.href)), 'vers la bonne adresse');
    ok(/Opus 5\.5 · 1,433 \$SWOGE · 1 web search/.test(await ia.$eval('.meta', (m) => m.textContent)), 'la reponse dit ce qu elle a coute');
    ok(/198,568/.test(await page.textContent('#solde')), 'le solde suit la facture');
    const sauve = await page.evaluate(() => JSON.parse(localStorage.getItem('swogeChats') || '[]'));
    eq(sauve.length && sauve[0].messages.length, 2, 'la conversation est gardee dans ce navigateur');
    await ctx.close();
  }

  console.log('\n-- 5. un refus le dit, et la question non servie ne repart pas --');
  {
    let tour = 0;
    const rep = () => (++tour === 1
      ? sse([['erreur', { ok:false, code:402, raison:'balance too low', requisSwoge:16700 }]])
      : sse([['texte', { t:'fine' }], ['fin', { ok:true, texte:'fine', sources:[], factureSwoge:'300', usage:{ recherches:0 }, solde:'199700' }]]));
    const { page, ctx, envois } = await ouvre({ session:'j', rep });
    await pose(page, 'first question');
    await page.waitForSelector('.msg.ia.err');
    ok(/balance too low.*top up.*16,700/i.test(await page.textContent('.msg.ia.err')), 'le 402 dit combien il faut');
    ok(!(await page.$eval('#envoyer', (b) => b.disabled && document.getElementById('question').value !== '')), 'la page est rendue a la main');
    await pose(page, 'second question');
    await page.waitForSelector('.msg.ia .meta');
    eq(JSON.stringify(envois[1].corps.messages), JSON.stringify([{ role:'user', content:'second question' }]),
       'la question refusee n est pas renvoyee au tour suivant');
    await ctx.close();
  }

  console.log('\n-- 6. Entree envoie, Maj+Entree passe a la ligne --');
  {
    const rep = () => sse([['fin', { ok:true, texte:'ok', sources:[], factureSwoge:'1', usage:{}, solde:'1' }]]);
    const { page, ctx, envois } = await ouvre({ session:'j', rep });
    await page.click('#question');
    await page.keyboard.type('line one');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('line two');
    eq(envois.length, 0, 'Maj+Entree n envoie pas');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.msg.ia .meta');
    eq(envois.length && envois[0].corps.messages[0].content, 'line one\nline two', 'Entree envoie les deux lignes');
    await ctx.close();
  }

  console.log('\n-- 7. rien ne deborde sur un telephone --');
  for (const w of [360, 320]) {
    const rep = () => sse([['fin', { ok:true, texte:'A long answer ' + 'x'.repeat(300) + '\n```\n' + 'y'.repeat(200) + '\n```',
      sources:[{ url:'https://example.com/' + 'z'.repeat(120), titre:'' }], factureSwoge:'1', usage:{}, solde:'1' }]]);
    const { page, ctx } = await ouvre({ session:'j', rep, largeur: w });
    await pose(page, 'q'.repeat(400));
    await page.waitForSelector('.msg.ia .meta');
    const d = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(d <= w, 'a ' + w + ' px, le document tient dans l ecran [' + d + ']');
    await page.click('#modeleBtn');
    const f = await page.$eval('#feuille', (e) => { const r = e.getBoundingClientRect(); return Math.round(r.right); });
    ok(f <= w, 'et la feuille des modeles aussi [' + f + ']');
    await ctx.close();
  }

  console.log('\n-- 9. une page rechargee ne perd rien --');
  {
    /* Signale le 26 septembre 2026 : « si l utilisateur actualise, il perd
       toutes ses donnees du chat ». Le fil rouvert, la question ecrite avant de
       partir, et la reponse en cours retrouvee sur le serveur par son rid. */
    let tours = 0, ridVu = null;
    const reprise = (rid) => { ridVu = rid; tours++;
      return tours < 2 ? { ok: true, status: 'pending', texte: 'Partial answer so' }
        : { ok: true, status: 'done', texte: 'Partial answer so far, now complete.', sources: [], factureSwoge: '321', modele: 'opus-5-5', usage: {}, solde: '199679' }; };
    const { page, ctx, envois } = await ouvre({ session: 'j', rep: () => null, reprise });
    await pose(page, 'question interrupted by a reload');
    await page.waitForTimeout(300);
    const garde = await page.evaluate(() => JSON.parse(localStorage.getItem('swogeChats') || '[]'));
    ok(garde.length === 1 && garde[0].messages[0].content === 'question interrupted by a reload' && garde[0].messages[0].rid === envois[0].corps.rid,
       'la question est ecrite AVANT la reponse, avec l identifiant envoye au serveur');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.msg.ia .meta', { timeout: 10000 });
    eq(await page.textContent('.msg.moi'), 'question interrupted by a reload', 'apres rechargement, le fil courant est rouvert');
    eq(ridVu, envois[0].corps.rid, 'la page redemande la reponse sous son identifiant');
    ok(/now complete/.test(await page.textContent('.msg.ia .corps')) && /321 \$SWOGE/.test(await page.textContent('.msg.ia .meta')), 'la reponse finie cote serveur est retrouvee, avec son cout');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.msg.ia .meta');
    const t0 = tours;
    await page.waitForTimeout(500);
    eq((await page.$$('.msg')).length, 2, 'rechargee encore : la question et la reponse, rien de perdu, rien en double');
    eq(tours, t0, 'et une reponse deja retrouvee n est plus redemandee');
    await ctx.close();

    const b = await ouvre({ session: 'j', rep: () => null, reprise: () => ({ http: 404, ok: false, status: 'unknown' }) });
    await pose(b.page, 'lost one');
    await b.page.waitForTimeout(300);
    await b.page.reload({ waitUntil: 'domcontentloaded' });
    await b.page.waitForSelector('.msg.ia.err');
    ok(/could not be recovered/.test(await b.page.textContent('.msg.ia.err')), 'si le serveur ne l a plus : la page le DIT, sans boucler');
    ok(!(await b.page.isDisabled('#question')) && (await b.page.evaluate(() => JSON.parse(localStorage.getItem('swogeChats'))[0].messages[0].interrompu)) === true, 'la question reste dans le fil, marquee, et le chat reste utilisable');
    await b.ctx.close();
  }

  console.log('\n-- 10. Claude, ChatGPT et Grok dans le meme choix de modele --');
  {
    const CAT3 = JSON.parse(JSON.stringify(CAT));
    CAT3.modeles.forEach((m) => { m.nomFournisseur = 'Claude'; m.actif = true; });
    CAT3.modeles.push(
      { id:'gpt-6-sol', nom:'GPT-6 Sol', note:'Strong all-rounder', fournisseur:'openai', nomFournisseur:'ChatGPT', actif:false, effort:true, recherche:false, typiqueSwoge:590, maxSwoge:9361 },
      { id:'grok-4-3', nom:'Grok 4.3', note:'Fast and cheap from xAI', fournisseur:'xai', nomFournisseur:'Grok', actif:true, effort:false, recherche:false, typiqueSwoge:208, maxSwoge:4579 });
    const rep = () => sse([['fin', { ok:true, texte:'yo', sources:[], factureSwoge:'3', usage:{}, solde:'1' }]]);
    const { page, ctx, envois } = await ouvre({ session:'j', cat: CAT3, rep });
    await page.click('#modeleBtn');
    eq((await page.$$eval('#modeles .groupe', (l) => l.map((x) => x.textContent))).join(','), 'Claude,ChatGPT,Grok', 'la feuille groupe les modeles : Claude, ChatGPT, Grok');
    ok(await page.isDisabled('#modeles .modele[data-modele="gpt-6-sol"]') && /Not switched on/.test(await page.textContent('#modeles .modele[data-modele="gpt-6-sol"]')), 'un modele sans cle est grise et le dit');
    await page.click('#modeles .modele[data-modele="grok-4-3"]');
    await page.click('#fermerFeuille');
    eq(await page.textContent('#modeleNom'), 'Grok 4.3', 'Grok 4.3 est choisi');
    ok(!(await page.isVisible('#web')), 'et « Search » disparait : la recherche web est une fonction des modeles Claude');
    await pose(page, 'hello grok');
    await page.waitForSelector('.msg.ia .meta');
    eq(envois[0].corps.modele, 'grok-4-3', 'la question part vers Grok 4.3');
    ok(/Grok 4\.3 · 3 \$SWOGE/.test(await page.textContent('.msg.ia .meta')), 'et le cout dit quel modele a repondu');
    await ctx.close();
  }

  console.log('\n-- 8. un bloc de code se copie d un geste, exactement --');
  {
    /* Signale le 26 septembre 2026 : un Snake en HTML demande au chat, et rien
       pour copier le code ; sur telephone, le bloc defilait de cote. */
    const CODE = '<!DOCTYPE html>\n<html>\n<head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>\n<body><canvas id="jeu"></canvas><script>let snake = [{x: 10, y: 10}];</script></body>\n</html>';
    const TEXTE = 'Here is the game:\n\n```html\n' + CODE + '\n```\n\nEnjoy!';
    const rep = () => sse([['texte', { t: TEXTE }], ['fin', { ok: true, texte: TEXTE, sources: [], factureSwoge: '12', usage: {}, solde: '1' }]]);
    const { page, ctx } = await ouvre({ session: 'j', rep, largeur: 360 });
    await pose(page, 'code a snake game in html');
    await page.waitForSelector('.msg.ia .meta');
    eq(await page.textContent('.code-tete span'), 'html', 'le bloc dit sa langue');
    eq(await page.$('.msg.ia .corps img, .msg.ia .corps canvas'), null, 'le HTML du code est affiche, jamais execute');
    await page.click('.code .copier');
    eq(await page.evaluate(() => navigator.clipboard.readText()), CODE, '« Copy » met le code EXACT dans le presse-papiers, balises comprises');
    ok(/Copied/.test(await page.textContent('.code .copier')), 'et le bouton le confirme');
    const b = await page.$eval('.code .copier', (x) => { const c = getComputedStyle(x); return c.borderTopStyle + '|' + c.outlineStyle; });
    ok(/^none\|none$/.test(b), 'un bouton discret : ni cadre ni contour [' + b + ']');
    const pre = await page.$eval('.code pre', (x) => ({ ws: getComputedStyle(x).whiteSpace, deborde: x.scrollWidth - x.clientWidth }));
    ok(pre.ws === 'pre-wrap' && pre.deborde <= 1, 'a 360 px, les longues lignes passent a la ligne : rien ne defile de cote [' + pre.deborde + ']');
    await page.click('.actions .copier');
    eq(await page.evaluate(() => navigator.clipboard.readText()), TEXTE, 'et « Copy » sous la reponse copie la reponse entiere');
    await ctx.close();
  }

  await nav.close(); srv.close();
  console.log('\nRATES : ' + rates + '/' + n);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
