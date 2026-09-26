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
const T = { '.html':'text/html','.htm':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
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
  const MED = { ouvert: true, videoOuverte: true,
    image: { fournisseurs: [
      { id: 'grok', nom: 'Grok Imagine', actif: true, modeles: [{ id: 'rapide', nom: 'Speed', parImageSwoge: 1071 }, { id: 'qualite', nom: 'Quality (2.0)', parImageSwoge: 2142 }] },
      { id: 'openai', nom: 'ChatGPT Image', actif: true, modeles: [{ id: 'rapide', nom: 'Speed', parImageSwoge: 11075, estime: true }, { id: 'qualite', nom: 'Quality', parImageSwoge: 11075, estime: true }] }],
      modeles: [{ id: 'rapide', nom: 'Speed', parImageSwoge: 1071 }, { id: 'qualite', nom: 'Quality (2.0)', parImageSwoge: 2142 }], formats: ['auto', '1:1', '16:9', '9:16'], nombres: [1, 2, 4] },
    video: { modeles: [{ id: 'rapide', nom: 'Speed', parSecondeSwoge: 2678, typiqueSwoge: 16065 }, { id: 'qualite', nom: 'Quality (1.5)', parSecondeSwoge: 4284, typiqueSwoge: 25704 }], formats: ['auto', '16:9', '9:16', '1:1'], durees: [6, 10], resolutions: ['480p', '720p'] } };
  const envois = [];
  let polls = 0;
  const ouvre = async (page, cat, session) => {
    const ctx = await nav.newContext({ viewport: { width: 1200, height: 900 } });
    if (session) await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} }, session);
    const p = await ctx.newPage();
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const u = r.request().url();
      if (/\/studio\/media\/catalogue/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MED) });
      if (/\/studio\/media\/(image|video)$/.test(u)) {
        envois.push({ u, auth: r.request().headers().authorization, corps: JSON.parse(r.request().postData() || '{}') });
        if (/image$/.test(u)) {
          const oa = envois[envois.length - 1].corps.fournisseur === 'openai';
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true,
            urls: oa ? ['/studio/media/fichier/' + 'b'.repeat(48) + '.jpg'] : ['https://imgen.x.ai/a.png', 'https://imgen.x.ai/b.png'],
            factureSwoge: oa ? '9012' : '4284.18', solde: '195715' }) });
        }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'v1', status: 'pending' }) });
      }
      if (/\/studio\/media\/video\/v1/.test(u)) {
        polls++;
        const fini = polls >= 2;
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fini
          ? { ok: true, status: 'done', url: 'https://vidgen.x.ai/v1.mp4', duree: 6, resolution: '480p', factureSwoge: '16065', solde: '179650' }
          : { ok: true, status: 'pending', progress: 50 }) });
      }
      if (/\/studio\/chat\/solde/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"solde":"200000.0"}' });
      if (/\/studio\/chat$/.test(u)) { envois.push({ u, corps: JSON.parse(r.request().postData() || '{}') });
        return r.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: fin\ndata: ' + JSON.stringify({ ok: true, texte: 'ok', sources: [], factureSwoge: '1', usage: {}, solde: '1' }) + '\n\n' }); }
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
    const p = await ouvre('swolemind.html');
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
    const p = await ouvre('swolemind.html');
    ok(lectures >= 1, 'le catalogue est lu sur le serveur');
    eq(await p.textContent('#modeleNom'), 'Opus 5.5', 'le modele par defaut vient du catalogue');
    const plus = JSON.parse(JSON.stringify(CAT));
    plus.modeles.push({ id: 'autre', nom: 'Other 1', note: 'later', effort: false, recherche: false, typiqueSwoge: 100, maxSwoge: 900 });
    const p2 = await ouvre('swolemind.html', plus);
    await p2.click('#modeleBtn');
    eq((await p2.$$('#modeles .modele')).length, 3, 'un modele ajoute cote serveur apparait, page inchangee');
    await p.close(); await p2.close();
  }

  console.log('\n-- 3. rien de promis qui ne marche pas, aucune cle --');
  {
    const html = fs.readFileSync(path.join(SITE, 'swolemind.html'), 'utf8');
    const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!/id="generer"|In preparation|class="genre"/.test(sansCommentaires), 'plus de bouton « Generate » d image ou de video qui ne genere rien');
    ok(!/sk-ant-|sk-[a-z0-9]{20}|xai-[a-z0-9]|ANTHROPIC_API_KEY\s*=|OPENAI_API_KEY\s*=/i.test(html), 'aucune cle de fournisseur dans la page');
  }

  console.log('\n-- 5. facon Grok : Chat, Image, Video dans le meme composeur --');
  {
    envois.length = 0; polls = 0;
    const p = await ouvre('swolemind.html', null, 'jeton-test');
    const vis = (sel) => p.isVisible(sel);
    ok(await vis('.mode[data-mode="chat"]') && await vis('.mode[data-mode="image"]') && await vis('.mode[data-mode="video"]'), 'les trois modes sont dans le composeur');
    /* Depuis le 26 septembre 2026, « + » sert aussi en Chat : il joint une photo ou un PDF a la question. */
    ok(await vis('#modeleBtn') && !(await vis('#reglages')) && /photo or a PDF/.test(await p.getAttribute('#joindre', 'title')), 'en Chat : le choix du modele, pas de reglages d image, et « + » joint a la question');
    await p.click('.mode[data-mode="image"]');
    ok(!(await vis('#modeleBtn')) && !(await vis('#web')), 'en Image : le choix du modele de chat et « Search » disparaissent');
    ok(await vis('#vitesse') && await vis('#nombre') && await vis('#format') && await vis('#joindre'), 'et Speed | Quality, le nombre, le format et « + » apparaissent');
    ok(/Describe the image/.test(await p.getAttribute('#question', 'placeholder')), 'le composeur dit quoi decrire');
    await p.click('#vitesse button[data-v="rapide"]');
    await p.click('#nombre'); await p.click('#nombre');                   /* 1 -> 2 -> 4 */
    await p.click('#format'); await p.click('#format');                   /* auto -> 1:1 -> 16:9 */
    await p.fill('#question', 'a buff doge');
    await p.click('#envoyer');
    await p.waitForSelector('.grille img');
    const e = envois.find((x) => /image$/.test(x.u));
    ok(e && e.corps.modele === 'rapide' && e.corps.n === 4 && e.corps.format === '16:9' && e.corps.prompt === 'a buff doge', 'la demande porte le modele, le nombre et le format choisis');
    eq(e.auth, 'Bearer jeton-test', 'avec le jeton de session');
    ok(!/0x[0-9a-f]{40}|"addr"/i.test(JSON.stringify(e.corps)), 'et JAMAIS une adresse');
    eq((await p.$$('.grille img')).length, 2, 'les images arrivent en grille dans le fil');
    ok(/4,284 \$SWOGE/.test(await p.textContent('.msg.ia .meta')), 'avec ce qu elles ont coute');
    ok(/195,715/.test(await p.textContent('#solde')), 'et le solde suit');
    ok(e.corps.fournisseur === 'grok', 'par defaut, le modele d image est Grok Imagine');

    /* Le choix du modele d image : Grok Imagine ou ChatGPT Image. */
    ok(await vis('#fournisseur'), 'en Image : le choix Grok Imagine | ChatGPT Image est la');
    await p.click('#fournisseur button[data-f="openai"]');
    ok(/ChatGPT Image/.test(await p.textContent('#prixq')) && /estimate/.test(await p.textContent('#prixq')), 'le prix suit le modele choisi, dit estime quand il l est');
    await p.fill('#question', 'a doge astronaut');
    await p.click('#envoyer');
    await p.waitForFunction(() => document.querySelectorAll('.msg.ia .grille img').length >= 3);
    const eo = envois.filter((x) => /image$/.test(x.u)).pop();
    eq(eo.corps.fournisseur, 'openai', 'la demande part vers ChatGPT Image');
    const src = await p.$$eval('.msg.ia .grille img', (l) => l[l.length - 1].getAttribute('src'));
    ok(/^https:\/\/web-production-220a3\.up\.railway\.app\/studio\/media\/fichier\/b{48}\.jpg$/.test(src), 'une image rangee sur notre serveur s affiche depuis lui [' + src.slice(0, 60) + '…]');
    const metaO = await p.$$eval('.msg.ia .meta', (l) => l[l.length - 1].textContent);
    ok(/^ChatGPT Image · Speed/.test(metaO), 'le cout dit quel modele l a faite, avec le reglage retenu plus haut (Speed) [' + metaO + ']');
    await p.click('#fournisseur button[data-f="grok"]');

    await p.click('.mode[data-mode="video"]');
    ok(await vis('#duree') && await vis('#resolution') && !(await vis('#nombre')), 'en Video : duree et resolution, pas de nombre');
    await p.click('#duree'); await p.click('#resolution');                /* 6 -> 10 s, 480p -> 720p */
    /* Une photo jointe a animer. */
    await p.setInputFiles('#fichier', { name: 'p.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgo=', 'base64') });
    await p.waitForSelector('#jointe:not([hidden])');
    ok(!(await p.isDisabled('#envoyer')), 'une photo jointe suffit pour lancer une video (sans texte)');
    await p.click('#envoyer');
    await p.waitForSelector('.msg.ia video', { timeout: 15000 });
    const v = envois.find((x) => /video$/.test(x.u));
    ok(v && v.corps.duree === 10 && v.corps.resolution === '720p' && /^data:image\/png;base64,/.test(v.corps.image), 'la video part avec la duree, la resolution et la photo');
    ok(polls >= 2 && await p.getAttribute('.msg.ia video', 'src') === 'https://vidgen.x.ai/v1.mp4', 'la page suit la video sur le serveur jusqu a ce qu elle arrive, puis la joue');
    ok(await vis('.telecharger'), 'avec un lien pour la telecharger');

    await p.click('.mode[data-mode="chat"]');
    await p.fill('#question', 'hello'); await p.click('#envoyer');
    await p.waitForTimeout(400);
    const c = envois.filter((x) => /chat$/.test(x.u)).pop();
    ok(c && c.corps.messages.length === 1 && c.corps.messages[0].content === 'hello', 'le chat n envoie pas au modele les images et videos du fil, seulement le texte');
    const sauve = await p.evaluate(() => localStorage.getItem('swogeChats') || '');
    ok(!/data:image/.test(sauve), 'la photo jointe n est jamais gardee dans le navigateur');
    await p.close();
  }

  console.log('\n-- 6. une video en cours survit au rechargement --');
  {
    envois.length = 0; polls = -1000;                 /* la video reste « en cours » tant qu on ne la libere pas */
    const p = await ouvre('swolemind.html', null, 'jeton-test');
    await p.click('.mode[data-mode="video"]');
    await p.fill('#question', 'the doge flexes');
    await p.click('#envoyer');
    await p.waitForSelector('.progres');
    const garde = await p.evaluate(() => JSON.parse(localStorage.getItem('swogeChats') || '[]')[0].messages);
    ok(garde.some((m) => m.enCours === 'v1'), 'la video lancee est ecrite dans le fil avec son identifiant');
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.progres');
    ok(/the doge flexes/.test(await p.textContent('.msg.moi')), 'rechargee : la demande est toujours la');
    polls = 1;                                        /* la video arrive */
    await p.waitForSelector('.msg.ia video', { timeout: 15000 });
    eq(await p.getAttribute('.msg.ia video', 'src'), 'https://vidgen.x.ai/v1.mp4', 'et la video reprend son suivi, puis arrive dans le fil');
    const apres = await p.evaluate(() => JSON.parse(localStorage.getItem('swogeChats') || '[]')[0].messages);
    ok(!apres.some((m) => m.enCours) && apres.some((m) => m.url === 'https://vidgen.x.ai/v1.mp4'), 'le fil garde la video finie, plus d attente');
    await p.close();
  }

  console.log('\n-- 7. un modele sans cle le dit, sans rien envoyer --');
  {
    const sauveMED = JSON.stringify(MED);
    MED.image.fournisseurs[1].actif = false;
    envois.length = 0;
    const p = await ouvre('swolemind.html', null, 'jeton-test');
    await p.click('.mode[data-mode="image"]');
    await p.click('#fournisseur button[data-f="openai"]');
    ok(/not switched on yet/.test(await p.textContent('#prixq')), 'ChatGPT Image sans cle : la page le dit');
    await p.fill('#question', 'x'); await p.click('#envoyer'); await p.waitForTimeout(200);
    eq(envois.length, 0, 'et rien ne part');
    await p.click('#fournisseur button[data-f="grok"]');
    await p.close();
    Object.assign(MED, JSON.parse(sauveMED));
  }

  console.log('\n-- 4. les anciennes adresses renvoient sur SwoleMind --');
  {
    /* Renomme le 26 septembre 2026 : « SWOGE Studio » devient SwoleMind, sur
       swolemind.html. Les adresses deja partagees ne cassent pas. */
    for (const ancienne of ['swoge_chat.html', 'swoge_studio.html', 'swolemind.htm']) {
      const p = await nav.newPage();
      await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => r.abort());
      await p.goto('http://127.0.0.1:' + port + '/' + ancienne + '?server=http://exemple.test#x', { waitUntil: 'domcontentloaded' });
      await p.waitForURL(/swolemind\.html/, { timeout: 5000 }).catch(() => {});
      ok(/\/swolemind\.html\?server=http:\/\/exemple\.test#x$/.test(p.url()), ancienne + ' renvoie sur SwoleMind, ?server= et ancre gardes [' + p.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, '') + ']');
      ok(/name="robots" content="noindex"/.test(fs.readFileSync(path.join(SITE, ancienne), 'utf8')), 'et ' + ancienne + ' reste hors des moteurs : une seule page porte l application');
      await p.close();
    }
    const plan = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
    ok(/swolemind\.html/.test(plan) && !/swoge_chat\.html|swoge_studio\.html/.test(plan), 'le sitemap porte swolemind.html, plus les anciennes');
    const html = fs.readFileSync(path.join(SITE, 'swolemind.html'), 'utf8');
    ok(/<title>SwoleMind/.test(html) && /class="on" aria-current="page"><span class="ic">&#129504;<\/span>SwoleMind</.test(html), 'le titre et le menu disent SwoleMind');
    const pages = fs.readdirSync(SITE).filter((f) => /\.html$/.test(f) && !['swoge_studio.html', 'swoge_chat.html'].includes(f));
    const vieux = pages.filter((f) => /href="swoge_studio\.html"/.test(fs.readFileSync(path.join(SITE, f), 'utf8')));
    ok(vieux.length === 0, 'aucun menu du site ne pointe encore vers l ancienne adresse' + (vieux.length ? ' : ' + vieux.join(', ') : ''));
  }

  await nav.close();
  await new Promise((s) => srv.close(s));
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
