'use strict';
/* ============================================================================
 * LES MODELES GRATUITS DANS SWOLEMIND ET DANS LE STUDIO (18/10/2026)
 *
 * Demande du proprietaire : « laisser le modele free » dans le choix du modele
 * d'image, et un modele gratuit dans le chat. La page montre ; le serveur
 * decide (quota, garde, ni reserve ni facture : studio_gratuit.test.js). Ce que
 * la page DOIT tenir (swolemind.html : la page des agents, generee depuis elle,
 * est en Mission seule ; le choix d'image du Studio a son propre essai), derriere un faux reseau qui sert les VRAIS catalogues
 * (studio_chat.catalogue, studio_media.catalogue du depot du serveur) :
 *
 *   1. Le choix d'image propose « Free » ; choisi, le prix dit « Free », le
 *      plafond du jour et que des tiers peuvent lire la demande ; le compte
 *      d'images se cache et la demande part avec n = 1.
 *   2. Le chat : les gratuits sont dans la feuille sous « Free », a « Free »
 *      au lieu d'un prix ; choisi, la ligne de prix le dit, avec l'avertissement.
 *   3. Apres la reponse, la ligne du message dit « Free · n left today », pas
 *      « 0 $SWOGE ».
 *   4. La page n'appelle JAMAIS un fournisseur gratuit elle-meme (OVH,
 *      Pollinations) : tout passe par notre serveur.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const SRV = process.env.SERVEUR_DIR || path.join(SITE, '..', 'swoge-pusher-server.github.io');
let Chat = null, Med = null;
try { process.env.STUDIO_DEX = '0'; Chat = require(path.join(SRV, 'studio_chat')); Med = require(path.join(SRV, 'studio_media')); } catch (e) { /* depot absent */ }

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  if (!Chat || !Med) { console.log('depot du serveur absent : essai ignore'); return; }
  const COURS = 0.00002801;
  const catChat = JSON.parse(JSON.stringify(Chat.catalogue(COURS, { anthropic: true, openai: true, xai: true, gratuit: true })));
  const catMed = JSON.parse(JSON.stringify(Med.catalogue(COURS, { grok: true, openai: true, gratuit: true })));
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const port = srv.address().port;
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
  const hotes = new Set(), envois = [];
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  /* Aucune socket vers le vrai serveur : elle refuserait le faux jeton (resumeFailed) et la bulle
     de mise (stakebubble.js) effacerait la session au milieu de l essai. */
  await ctx.addInitScript(() => { window.WebSocket = function(){ return { send(){}, close(){}, addEventListener(){}, readyState: 0 }; }; window.WebSocket.OPEN = 1; });
  await ctx.addInitScript(() => { try { localStorage.setItem('swogeSession', 'jeton-de-test'); localStorage.setItem('swogeStudioMode', JSON.stringify('chat')); } catch (e) {} });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), async (r) => {
    const u = new URL(r.request().url());
    hotes.add(u.host);
    const json = (code, o) => r.fulfill({ status: code, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.pathname === '/studio/chat/catalogue') return json(200, catChat);
    if (u.pathname === '/studio/media/catalogue') return json(200, catMed);
    if (u.pathname === '/studio/media/image' && r.request().method() === 'POST') {
      const b = JSON.parse(r.request().postData() || '{}'); envois.push({ chemin: u.pathname, b });
      return json(200, { ok: true, genre: 'image', fournisseur: 'gratuit', modele: b.modele, urls: ['/studio/media/fichier/' + 'a'.repeat(48) + '.jpg'], gratuit: true, factureSwoge: '0', factureUsd: 0, gratuitRestant: 9 });
    }
    if (u.pathname === '/studio/chat' && r.request().method() === 'POST') {
      const b = JSON.parse(r.request().postData() || '{}'); envois.push({ chemin: u.pathname, b });
      const fin = { ok: true, gratuit: true, texte: 'A memecoin is a joke coin.', sources: [], jetons: [], modele: b.modele, servi: 'gpt-oss-120b', factureSwoge: '0', factureUsd: 0, gratuitRestant: 29, usage: { entree: 10, sortie: 6, recherches: 0 } };
      return r.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'access-control-allow-origin': '*' },
        body: 'event: texte\ndata: ' + JSON.stringify({ t: 'A memecoin is a joke coin.' }) + '\n\nevent: fin\ndata: ' + JSON.stringify(fin) + '\n\n' });
    }
    if (/\/solde$/.test(u.pathname)) return json(200, { ok: true, adresse: '0x1111111111111111111111111111111111111111', solde: '1000' });
      if (u.host === '127.0.0.1:' + port) return r.continue();
    return json(404, { ok: false, raison: 'unknown route' });
  });
  await page.goto('http://127.0.0.1:' + port + '/swolemind.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /Grok Imagine|ChatGPT Image|Free/.test((document.getElementById('prixq') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});

  console.log('-- 1. le chat : les gratuits dans la feuille');
  await page.click('#modeleBtn');
  const feuille = await page.evaluate(() => Array.from(document.querySelectorAll('#modeles > *')).map((x) => x.className + '|' + x.textContent.replace(/\s+/g, ' ').trim()));
  const iGroupe = feuille.findIndex((x) => /^groupe\|Free$/.test(x));
  ok(iGroupe >= 0, 'un groupe « Free » dans la feuille');
  const gratuits = feuille.slice(iGroupe + 1).filter((x) => /^modele/.test(x));
  ok(gratuits.length === 3 && gratuits.every((x) => /Freedaily limit$/.test(x)), 'trois gratuits, chacun « Free / daily limit » au lieu d un prix [' + gratuits.join(' ; ') + ']');
  await page.click('#modeles button[data-modele="free-gpt-oss-120b"]');
  if (await page.isVisible('#feuille')) await page.click('#fermerFeuille');
  const prixC = await page.textContent('#prixq');
  ok(/^GPT-OSS 120B · Free · up to 30 answers a day/.test(prixC) && /don't paste keys or personal info/.test(prixC), 'la ligne du prix : Free, 30 par jour, l avertissement [' + prixC + ']');
  await page.fill('#question', 'What is a memecoin?');
  await page.click('#envoyer');
  await page.waitForFunction(() => /29 left today/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  const ec = envois.filter((e) => e.chemin === '/studio/chat').pop();
  ok(ec && ec.b.modele === 'free-gpt-oss-120b', 'la question part au serveur avec le modele gratuit');
  ok(/Free · 29 left today/.test(await page.evaluate(() => document.body.innerText)), 'la ligne de la reponse dit « Free · 29 left today »');

  console.log('-- 2. le choix d image propose Free');
  await page.click('.mode[data-mode="image"]');
  ok(await page.locator('#fournisseur button[data-f="gratuit"]').count() === 1, 'un bouton « Free » dans le choix du modele d image');
  await page.click('#fournisseur button[data-f="gratuit"]');
  await page.click('#vitesse [data-v="rapide"]');
  const prixI = await page.textContent('#prixq');
  ok(/^Free · Fast \(~5 s, watermarked\) · Free · 1 image per request, up to 10 a day/.test(prixI), 'le prix dit Free, le modele, une image, le plafond du catalogue [' + prixI + ']');
  ok(/third party that may log prompts/.test(prixI) && /no photo editing/.test(prixI), 'il dit qu un tiers peut lire la demande, et pas de retouche');
  ok(await page.isHidden('#nombre'), 'le compte d images se cache');
  ok((await page.textContent('#vitesse [data-v="qualite"]')).trim() === 'SDXL (~1 min)', 'la seconde vitesse s appelle SDXL (~1 min)');
  await page.fill('#question', 'a muscular shiba inu astronaut');
  await page.click('#envoyer');
  await page.waitForFunction(() => /left today/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  const ei = envois.filter((e) => e.chemin === '/studio/media/image').pop();
  ok(ei && ei.b.fournisseur === 'gratuit' && ei.b.n === 1 && ei.b.modele === 'rapide', 'la demande part au serveur : gratuit, n = 1, Fast');
  ok(/Free · 9 left today/.test(await page.evaluate(() => document.body.innerText)), 'la ligne de l image dit « Free · 9 left today »');
  ok(!/Free[^\n]*0 \$SWOGE/.test(await page.evaluate(() => document.body.innerText)), 'aucun « 0 $SWOGE » a cote du gratuit');

  console.log('-- 3. le Studio : les cartes Free du catalogue');
  await page.goto('http://127.0.0.1:' + port + '/studio.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid .mcard[data-id="gratuit:rapide"]', { timeout: 15000 }).catch(() => {});
  const cartes = await page.evaluate(() => Array.from(document.querySelectorAll('#grid .mcard[data-id^="gratuit:"]')).map((c) => c.getAttribute('data-id') + '|' + c.textContent.replace(/\s+/g, ' ')));
  ok(cartes.length === 2, 'deux cartes Free, venues du catalogue [' + cartes.map((x) => x.split('|')[0]).join(', ') + ']');
  ok(cartes.every((x) => /Free/.test(x) && !/\$SWOGE \/ image/.test(x)), 'chacune dit « Free », aucune « $SWOGE / image »');
  await page.click('#grid .mcard[data-id="gratuit:rapide"]');
  await page.fill('#prompt', 'a muscular shiba inu astronaut');
  const genP = (await page.textContent('#genP')).trim(), note = (await page.textContent('#priceNote')).replace(/\s+/g, ' ');
  ok(genP === 'Free', 'le bouton dit Generate · Free [' + genP + ']');
  ok(/1 image per request, up to 10 a day/.test(note) && /third party that may log prompts/.test(note), 'la note : une image, le plafond du serveur, le tiers [' + note.slice(0, 160) + ']');
  ok(/\u00d71/.test(await page.textContent('#segN')) && !/\u00d74/.test(await page.textContent('#segN')), 'le nombre se reduit a ×1');
  await page.click('#gen');
  await page.waitForFunction(() => /left today/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  const es = envois.filter((e) => e.chemin === '/studio/media/image').pop();
  ok(es && es.b.fournisseur === 'gratuit' && es.b.n === 1 && es.b.modele === 'rapide', 'la demande part : gratuit, n = 1, Fast');
  ok(/Free \u00b7 9 left today/.test(await page.evaluate(() => document.body.innerText)), 'le resultat dit « Free · 9 left today »');

  console.log('-- 4. jamais un fournisseur gratuit en direct');
  ok(![...hotes].some((h) => /ovh|pollinations|kepler/i.test(h)), 'aucun appel de la page a OVH ou Pollinations [' + [...hotes].join(', ') + ']');
  ok(!erreurs.length, 'aucune erreur de script [' + erreurs.slice(0, 2).join(' | ') + ']');

  await nav.close(); srv.close();
  console.log(rates ? 'RATES : ' + rates + '/' + n : n + ' verifications OK');
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('EXCEPTION', e); process.exit(1); });
