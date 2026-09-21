'use strict';
/* ============================================================================
 * SWOGE STUDIO — LA PAGE MONTRE LE CATALOGUE, ET NE PROMET RIEN QU ELLE NE FAIT
 *
 * Rien ne genere : le studio est en preparation. Ce que la page DOIT tenir :
 *
 *   1. Elle se peint depuis le CATALOGUE du serveur — ajouter un modele
 *      cote serveur le fait apparaitre ici sans toucher la page.
 *   2. Chaque modele montre son prix en $SWOGE, et la video coute plus cher.
 *   3. Choisir un genre ouvre l atelier ; l upload n apparait que pour la
 *      video (image->video), pas ailleurs.
 *   4. Tant que le studio est en preparation, le bouton le DIT et ne feint
 *      pas de generer. Aucune cle ne vit dans la page.
 *   5. Le flux de paiement et les limites sont montres : credite seulement
 *      apres confirmation, un hash sert une fois, aucune cle cote client.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.mp4':'video/mp4' };

const CAT = { ouvert:false, jeton:'0x8a166fb41cd659a0a43396272ff73973ce29f817', confirmations:12, modeles:[
  { id:'image-openai', genre:'image', nom:'Image', fournisseur:'OpenAI', prixSwoge:5000, entree:'prompt',
    resolutions:['1024x1024','1536x1024'], actif:false, enAttente:'provider key not set (OPENAI_API_KEY)' },
  { id:'video-grok', genre:'video', nom:'Video', fournisseur:'xAI Grok Imagine', prixSwoge:25000,
    entree:'image_ou_prompt', durees:[6,10], resolutions:['720p','1080p'], actif:false, enAttente:'provider key not set (GROK_API_KEY)' },
  { id:'texte-claude', genre:'texte', nom:'Text', fournisseur:'Anthropic Claude', prixUsd:0.01, prixSwoge:500, prixIndicatif:true, entree:'prompt',
    actif:false, enAttente:'provider key not set (ANTHROPIC_API_KEY)' },
  { id:'reponse-perplexity', genre:'reponse', nom:'Answer', fournisseur:'Perplexity', prixUsd:0.02, prixSwoge:1000, prixIndicatif:true, entree:'question',
    actif:false, enAttente:'provider key not set (PERPLEXITY_API_KEY)' },
], moyens:[ {id:'swoge',nom:'$SWOGE',genre:'erc20'}, {id:'eth',nom:'ETH',genre:'native'} ] };

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
  let CLES = 0;
  const ouvre = async (cat) => {
    const page = await nav.newPage({ viewport: { width: 1200, height: 1100 } });
    await page.route(/vitrine\.json/, (r) => r.fulfill({ status:200, contentType:'application/json', body:'{}' }));
    await page.route(/\/studio\/catalogue/, (r) => { CLES++; r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(cat||CAT) }); });
    await page.goto('http://127.0.0.1:'+port+'/swoge_studio.html', { waitUntil:'domcontentloaded' });
    await page.waitForSelector('.genre');
    return page;
  };

  console.log('-- 1. la page dit franchement qu elle est en preparation --');
  {
    const html = fs.readFileSync(path.join(SITE,'swoge_studio.html'),'utf8');
    ok(/in preparation/i.test(html), 'la page porte « in preparation »');
    ok(/<title>[^<]*SWOGE Studio[^<]*<\/title>/i.test(html), 'le titre est celui du studio');
    /* Aucune cle de fournisseur ecrite dans la page. */
    ok(!/sk-[a-z0-9]{20}|OPENAI_API_KEY\s*=|xai-[a-z0-9]/i.test(html), 'aucune cle de fournisseur dans la page');
    const page = await ouvre();
    ok(/preparation/i.test(await page.textContent('.enprep')), 'et la banniere le dit avant tout');
    await page.close();
  }

  console.log('\n-- 2. la page se peint depuis le catalogue --');
  {
    const page = await ouvre();
    const genres = await page.$$eval('.genre', (e) => e.map((x) => x.textContent));
    eq(genres.length, 4, 'les modeles du catalogue sont peints (image, video, text, answer)');
    ok(genres.some((g) => /Image/.test(g) && /5,000/.test(g)), 'l image, avec son prix en $SWOGE');
    ok(genres.some((g) => /Video/.test(g) && /25,000/.test(g)), 'la video, plus chere');
    /* Un modele ajoute au catalogue apparait sans toucher la page. */
    const plus = JSON.parse(JSON.stringify(CAT));
    plus.modeles.push({ id:'audio-x', genre:'image', nom:'Audio', fournisseur:'Later', prixSwoge:3000, actif:false, enAttente:'soon' });
    const p2 = await ouvre(plus);
    eq((await p2.$$('.genre')).length, 5, 'un modele ajoute cote serveur apparait, page inchangee');
    await page.close(); await p2.close();
  }

  console.log('\n-- 3. choisir un genre ouvre l atelier ; l upload est cible --');
  {
    const page = await ouvre();
    eq(await page.isHidden('#atelier'), true, 'l atelier est cache au depart');
    await page.click('.genre[data-id="image-openai"]');
    eq(await page.isHidden('#atelier'), false, 'choisir l image ouvre l atelier');
    eq(await page.isHidden('#depose'), true, 'pas d upload pour l image : elle part d un prompt');
    ok((await page.textContent('#prix')).includes('5,000'), 'le prix affiche est celui de l image');
    await page.click('.genre[data-id="video-grok"]');
    eq(await page.isHidden('#depose'), false, 'l upload apparait pour la video (image->video)');
    ok((await page.textContent('#reglages')).match(/Duration/i), 'la duree est proposee pour la video');
    ok((await page.textContent('#prix')).includes('25,000'), 'et le prix passe a celui de la video');
    await page.close();
  }

  console.log('\n-- 4. rien ne genere, et le bouton le dit --');
  {
    const page = await ouvre();
    await page.click('.genre[data-id="image-openai"]');
    eq(await page.getAttribute('#generer','disabled') !== null || /preparation/i.test(await page.textContent('#generer')), true,
       'le bouton Generer est bloque ou dit « in preparation »');
    /* Meme si on force le clic, aucune requete de generation ne part : il
       n existe aucune route de generation, et le clic ne fait qu expliquer. */
    let gen = 0;
    await page.route(/\/studio\/(generer|paiement|generate)/, (r) => { gen++; r.fulfill({ status:200, body:'{}' }); });
    await page.click('#generer', { force:true });
    await page.waitForTimeout(120);
    eq(gen, 0, 'forcer le clic n envoie AUCUNE requete de generation');
    /* Un bouton desactive n emet pas de clic : c est justement la garde. Le
       signal « en preparation » est donc porte par le bouton lui-meme et par
       la banniere, pas par l apercu qu on ne peut pas encore declencher. */
    ok(await page.getAttribute('#generer','disabled') !== null, 'le bouton reste desactive : il ne PEUT pas generer');
    ok(/preparation/i.test(await page.textContent('#generer')), 'et il porte « in preparation » en toutes lettres');
    await page.close();
  }

  console.log('\n-- 4bis. Answer (facon Perplexity) et le choix de la monnaie --');
  {
    const page = await ouvre();
    const genres = await page.$$eval('.genre', (e) => e.map((x) => x.textContent));
    ok(genres.some((g) => /Answer/.test(g)), 'la carte Answer (recherche + reponse sourcee) est la');
    /* Le choix de la monnaie : $SWOGE ou ETH. */
    await page.click('.genre[data-id="image-openai"]');
    const moyens = await page.$$eval('#moyen option', (o) => o.map((x) => x.textContent));
    ok(moyens.some((m) => /SWOGE/.test(m)) && moyens.some((m) => /ETH/.test(m)), 'on peut payer en $SWOGE ou en ETH');
    /* Passer a l ETH change l affichage du prix vers l ancre USD. */
    const avant = await page.textContent('#prix');
    await page.selectOption('#moyen', 'eth');
    const apres = await page.textContent('#prix');
    ok(avant !== apres && /ETH/i.test(apres), 'choisir ETH met a jour le prix affiche [' + apres.trim() + ']');
    await page.close();
  }

  console.log('\n-- 5. le flux de paiement et les garanties sont montres --');
  {
    const page = await ouvre();
    const t = await page.textContent('body');
    ok(/only after the (chain|payment) (is )?confirm/i.test(t) || /credited only after/i.test(t),
       'credite seulement apres confirmation on-chain');
    ok(/single-use|used once|double-spend/i.test(t), 'un hash sert une fois : pas de double depense');
    ok(/No API key ever reaches your browser/i.test(t), 'aucune cle ne touche le navigateur');
    ok(/base units/i.test(t), 'le montant se compare en unites de base');
    ok(/\$SWOGE or ETH/i.test(t), 'on peut payer en $SWOGE ou en ETH');
    ok(/Native ETH and a token payment are never confused/i.test(t), 'natif et jeton ne sont jamais confondus');
    ok(/follows the live \$SWOGE rate|locked in a quote/i.test(t),
       'le prix suit le cours du $SWOGE et se verrouille au paiement');
    await page.close();
  }

  await nav.close();
  await new Promise((s) => srv.close(s));
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
