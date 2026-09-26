'use strict';
/* ============================================================================
 * SWOGE STUDIO — LA PAGE MONTRE LE CATALOGUE, ET NE PROMET RIEN QU ELLE NE FAIT
 *
 * Depuis le 26 septembre 2026, Studio EST l'application de chat (demande du
 * proprietaire : « on doit arriver directement sur le chat, comme Claude et
 * ChatGPT, et on ajoutera les fonctions au fur et a mesure »). L'ancien
 * atelier d'images et de videos n'a jamais rien genere — il affichait « in
 * preparation » derriere un bouton « Generate ». Ce que la page DOIT tenir :
 *
 *   1. On arrive SUR le composeur : pas de vitrine, pas de bouton « Open
 *      chat » a cliquer, la zone de saisie est visible et prend le focus.
 *   2. Elle se peint depuis le CATALOGUE du serveur (`/studio/chat/catalogue`)
 *      — ajouter un modele cote serveur le fait apparaitre sans toucher la page.
 *   3. Elle ne promet rien qu'elle ne fait : aucun bouton d'image ou de video
 *      qui ne genere rien. Aucune cle de fournisseur dans la page.
 *   4. L'ancienne adresse `swoge_chat.html` renvoie ici, `?server=` compris,
 *      et reste hors des moteurs.
 *   (Le chat lui-meme — jeton, echappement, refus, 320 px — est essaye par
 *    `chat_page.test.js`, sur cette meme page.)
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.mp4':'video/mp4' };

const CAT = { ouvert: true, note: null, monnaie: '$SWOGE', defaut: 'opus-5-5', efforts: ['low', 'medium', 'high'], modeles: [
  { id: 'opus-5-5', nom: 'Opus 5.5', note: 'Most capable', effort: true, recherche: true, typiqueSwoge: 1179, maxSwoge: 17116 },
  { id: 'haiku-4-5', nom: 'Haiku 4.5', note: 'Fastest', effort: false, recherche: true, typiqueSwoge: 295, maxSwoge: 4413 },
] };

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
  let lectures = 0;
  const ouvre = async (page, cat) => {
    const p = await nav.newPage({ viewport: { width: 1200, height: 900 } });
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const u = r.request().url();
      if (/\/studio\/chat\/catalogue/.test(u)) { lectures++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cat || CAT) }); }
      if (/vitrine\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return r.abort();
    });
    await p.goto('http://127.0.0.1:' + port + '/' + page, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(500);
    return p;
  };

  console.log('-- 1. on arrive SUR le chat --');
  {
    const p = await ouvre('swoge_studio.html');
    ok(await p.isVisible('#question'), 'la zone de saisie est visible des l arrivee');
    eq(await p.evaluate(() => document.activeElement && document.activeElement.id), 'question', 'et elle a le focus : on peut taper tout de suite');
    ok(await p.isVisible('#accueil'), 'l accueil « What can I help with? » est la');
    const t = await p.innerText('body');   /* le texte VISIBLE, pas celui des scripts */
    ok(!/Open (SWOGE AI )?Chat/i.test(t), 'aucun bouton « Open chat » : on est deja dedans');
    await p.close();
  }

  console.log('\n-- 2. la page se peint depuis le catalogue --');
  {
    lectures = 0;
    const p = await ouvre('swoge_studio.html');
    ok(lectures >= 1, 'le catalogue est lu sur le serveur');
    eq(await p.textContent('#modeleNom'), 'Opus 5.5', 'le modele par defaut vient du catalogue');
    const plus = JSON.parse(JSON.stringify(CAT));
    plus.modeles.push({ id: 'autre', nom: 'Other 1', note: 'later', effort: false, recherche: false, typiqueSwoge: 100, maxSwoge: 900 });
    const p2 = await ouvre('swoge_studio.html', plus);
    await p2.click('#modeleBtn');
    eq((await p2.$$('#modeles .modele')).length, 3, 'un modele ajoute cote serveur apparait, page inchangee');
    await p.close(); await p2.close();
  }

  console.log('\n-- 3. rien de promis qui ne marche pas, aucune cle --');
  {
    const html = fs.readFileSync(path.join(SITE, 'swoge_studio.html'), 'utf8');
    const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!/id="generer"|In preparation|class="genre"/.test(sansCommentaires), 'plus de bouton « Generate » d image ou de video qui ne genere rien');
    ok(!/sk-ant-|sk-[a-z0-9]{20}|xai-[a-z0-9]|ANTHROPIC_API_KEY\s*=|OPENAI_API_KEY\s*=/i.test(html), 'aucune cle de fournisseur dans la page');
  }

  console.log('\n-- 4. l ancienne adresse renvoie ici --');
  {
    const p = await nav.newPage();
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => r.abort());
    await p.goto('http://127.0.0.1:' + port + '/swoge_chat.html?server=http://exemple.test#x', { waitUntil: 'domcontentloaded' });
    await p.waitForURL(/swoge_studio\.html/, { timeout: 5000 }).catch(() => {});
    ok(/\/swoge_studio\.html\?server=http:\/\/exemple\.test#x$/.test(p.url()), 'swoge_chat.html renvoie sur le Studio, ?server= et ancre gardes [' + p.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, '') + ']');
    const ancien = fs.readFileSync(path.join(SITE, 'swoge_chat.html'), 'utf8');
    ok(/name="robots" content="noindex"/.test(ancien), 'et l ancienne adresse reste hors des moteurs : une seule page porte le chat');
    ok(!/swoge_chat\.html/.test(fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8')), 'le sitemap ne la liste plus');
    await p.close();
  }

  await nav.close();
  await new Promise((s) => srv.close(s));
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
