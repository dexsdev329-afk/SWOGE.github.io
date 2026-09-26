'use strict';
/* ============================================================================
 * SWOLEMIND — SERIES ET PUBS : LA PAGE MONTRE ET ENVOIE, LE SERVEUR GARDE
 *
 * Demande du proprietaire, 26 septembre 2026 : « une mini-serie, que la voix
 * et les personnages soient les memes a chaque scene », en mode serie ou pub.
 * Derriere un faux reseau tourne le VRAI module du serveur
 * (studio_production.js : validation, references, persistance). Ce que la page
 * DOIT tenir :
 *   1. Le bouton « Series & Ads » vit dans le mode Video.
 *   2. Sans session : elle le dit et ne demande rien au serveur.
 *   3. Avec session : le jeton en Authorization, JAMAIS une adresse ; une
 *      photo part REDUITE (JPEG) ; SWOGE est propose d'office, avec une voix.
 *   4. Une scene : texte et duree envoyes, « Filming… », puis la video (https
 *      seulement) — la page repasse d'elle-meme.
 *   5. Le refus du serveur est montre tel quel ; le texte venu du serveur est
 *      ECHAPPE ; une video en javascript: n'est jamais jouee.
 *   6. Modifier garde les scenes ; supprimer demande confirmation.
 *   7. Rien ne deborde sur un telephone de 320 px.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let P = null;
for (const d of ['swoge-pusher-server.github.io', 'srv']) { try { P = require(path.join(SITE, '..', d, 'studio_production.js')); break; } catch (e) {} }
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html':'text/html','.htm':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.mp4':'video/mp4' };
const CAT = { ouvert: true, note: null, monnaie: '$SWOGE', defaut: 'opus-5-5', efforts: ['low', 'medium', 'high'], modeles: [
  { id: 'opus-5-5', nom: 'Opus 5.5', note: 'Most capable', effort: true, recherche: true, typiqueSwoge: 1179, maxSwoge: 17116 }] };
const MED = { ouvert: true, videoOuverte: true,
  image: { fournisseurs: [{ id: 'grok', nom: 'Grok Imagine', actif: true, modeles: [{ id: 'rapide', nom: 'Speed', parImageSwoge: 1071 }, { id: 'qualite', nom: 'Quality (2.0)', parImageSwoge: 2142 }] }],
    modeles: [{ id: 'rapide', nom: 'Speed', parImageSwoge: 1071 }, { id: 'qualite', nom: 'Quality (2.0)', parImageSwoge: 2142 }], formats: ['auto'], nombres: [1] },
  video: { modeles: [{ id: 'rapide', nom: 'Speed', parSecondeSwoge: 2678, typiqueSwoge: 16065 }, { id: 'qualite', nom: 'Quality (1.5)', parSecondeSwoge: 4284, typiqueSwoge: 25704 }], formats: ['auto'], durees: [6, 10], resolutions: ['480p'] } };
const VOIX = [{ id: 'eve', nom: 'Eve', ton: 'energetic' }, { id: 'ara', nom: 'Ara', ton: 'warm' }, { id: 'rex', nom: 'Rex', ton: 'confident' }];
const ADRESSES = { jA: '0x' + 'a1'.repeat(20), jB: '0x' + 'b2'.repeat(20) };

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  if (!P) { console.log('studio_production.js absent (depot du serveur) : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-page-'));
  const S = P.cree({ dossier });
  const journal = [];
  const pret = new Set();       /* les videos que le faux xAI a « finies » */
  let injecte = null;           /* une production piegee, ajoutee a la liste rendue */

  /* Le faux serveur : les memes regles que la route de server.js, sur le vrai module. */
  function route(q, url, auth) {
    const addr = ADRESSES[auth];
    const corps = JSON.parse(q.postData() || '{}');
    journal.push({ m: q.method(), chemin: url.pathname, auth, corps });
    if (!addr) return [401, { ok: false, raison: 'sign in with your wallet first' }];
    const m = /^\/studio\/production\/([0-9a-f]{16})(\/scene)?$/.exec(url.pathname);
    if (url.pathname === '/studio/production' && q.method() === 'GET') {
      const ps = S.liste(addr).map((p) => { for (const sc of p.scenes) if (sc.statut === 'pending' && pret.has(sc.video)) S.noteScene(addr, p.id, { id: sc.id, statut: 'done', url: 'https://vidgen.x.ai/' + sc.video + '.mp4', factureSwoge: '38556' }); return S.une(addr, p.id); });
      return [200, { ok: true, productions: injecte ? ps.concat(injecte) : ps, voix: VOIX, modes: P.MODES, personnagesMax: 3, productionsMax: 30, scenesMax: 60, durees: [6, 10],
        swoge: 'http://127.0.0.1:' + port + '/img/site/swoge_reference.jpg' }];
    }
    if (q.method() === 'DELETE' && m) { const r = S.supprime(addr, m[1]); return [r.ok ? 200 : r.code, r]; }
    if (url.pathname === '/studio/production' || (m && !m[2])) {
      const v = P.valide(corps.production, { image: S.outilImage(addr, (x) => /^data:image\/(png|jpeg|webp);base64,/.test(x)), voixOk: (x) => VOIX.some((y) => y.id === x) });
      if (v.erreur) { S.menage(addr); return [400, { ok: false, raison: v.erreur }]; }
      const r = S.pose(addr, v, m ? m[1] : null);
      return [r.ok ? 200 : r.code, r.ok ? { ok: true, production: r.production } : r];
    }
    const prod = S.une(addr, m[1]);
    if (!prod) return [404, { ok: false, raison: 'unknown production' }];
    const sc = P.scene(prod, corps.texte, corps.duree);
    if (sc.erreur) return [400, { ok: false, raison: sc.erreur }];
    const video = 'v' + journal.length;
    S.noteScene(addr, prod.id, { id: 's' + journal.length, texte: sc.texte, video, statut: 'pending', duree: corps.duree });
    return [200, { ok: true, id: video, status: 'pending' }];
  }

  const ouvre = async ({ session, largeur } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1200, height: 900 } });
    if (session) await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} }, session);
    const p = await ctx.newPage();
    p.on('dialog', (d) => d.accept());
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const q = r.request(), u = new URL(q.url());
      if (/\/studio\/production(\/|$)/.test(u.pathname) && !/\/image\//.test(u.pathname)) {
        const [code, o] = route(q, u, String(q.headers().authorization || '').replace(/^Bearer /, ''));
        return r.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(o) });
      }
      if (/\/studio\/production\/image\//.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(SITE, 'img/site/icone-192.png')) });
      if (/\/studio\/media\/catalogue/.test(u.href)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MED) });
      if (/\/studio\/chat\/catalogue/.test(u.href)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAT) });
      if (/\/studio\/chat\/solde/.test(u.href)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"solde":"200000.0"}' });
      if (/vidgen\.x\.ai/.test(u.href)) return r.fulfill({ status: 200, contentType: 'video/mp4', body: '' });
      return r.abort();
    });
    await p.goto('http://127.0.0.1:' + port + '/swolemind.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    return p;
  };
  const video = async (p) => { await p.click('.mode[data-mode="video"]'); };

  console.log('-- 1. le bouton vit dans le mode Video --');
  {
    const p = await ouvre({ session: 'jA' });
    await p.click('.mode[data-mode="chat"]');
    ok(!(await p.isVisible('#prodBtn')), 'cache en mode Chat');
    await video(p);
    ok(await p.isVisible('#prodBtn'), 'visible en mode Video');
    await p.close();
  }

  console.log('\n-- 2. sans session : rien ne part --');
  {
    journal.length = 0;
    const p = await ouvre({});
    await video(p); await p.click('#prodBtn');
    ok(/Sign in with your wallet/.test(await p.innerText('#prodCorps')), 'la fenetre dit de se connecter');
    eq(journal.length, 0, 'aucune requete au serveur');
    await p.close();
  }

  console.log('\n-- 3. une serie : SWOGE d office, une photo reduite, jamais une adresse --');
  let p = await ouvre({ session: 'jA' });
  {
    journal.length = 0;
    await video(p); await p.click('#prodBtn');
    await p.waitForSelector('#prod >> text=+ New series');
    ok(journal.some((x) => x.m === 'GET' && x.auth === 'jA'), 'la liste est lue avec le jeton de session');
    await p.click('#prod >> text=+ New series');
    const cartes = await p.$$('.prod-edit-perso');
    eq(cartes.length, 1, 'un personnage d office');
    eq(await p.inputValue('.prod-edit-perso input[type=text]'), 'SWOGE', 'SWOGE');
    eq(await p.inputValue('.prod-edit-perso select'), 'rex', 'avec une voix');
    await p.fill('.prod-feuille > #prodCorps > input[type=text]', 'Gym Wars');
    await p.click('#prod >> text=+ Add a character');
    const c2 = (await p.$$('.prod-edit-perso'))[1];
    await (await c2.$('input[type=text]')).fill('Luna');
    const [choix] = await Promise.all([p.waitForEvent('filechooser'), (await c2.$('text=Upload photo')).click()]);
    await choix.setFiles(path.join(SITE, 'img/site/icone-192.png'));
    await p.waitForFunction(() => { const im = document.querySelectorAll('.prod-edit-perso')[1].querySelector('img.vign'); return im && /^data:image\/jpeg/.test(im.src); });
    /* la photo choisie redessine le formulaire : ce qui etait tape reste (le brouillon) */
    eq(await p.inputValue('.prod-edit-perso >> nth=1 >> input[type=text]'), 'Luna', 'le nom tape reste apres le choix de la photo');
    await p.selectOption('.prod-edit-perso >> nth=1 >> select', 'eve');
    await p.click('.prod-sauve');
    await p.waitForSelector('#prod >> text=Scene 1');
    const post = journal.filter((x) => x.m === 'POST' && x.chemin === '/studio/production').pop();
    ok(post && post.auth === 'jA', 'la production part avec le jeton');
    ok(!/0x[0-9a-f]{40}/i.test(JSON.stringify(post.corps)), 'et sans aucune adresse dans le corps');
    ok(/^data:image\/jpeg;base64,/.test(post.corps.production.personnages[1].image), 'la photo part en JPEG, reduite dans la page (PNG choisi)');
    eq(post.corps.production.personnages[0].image, 'swoge', 'SWOGE designe par son image officielle');
    const t = await p.innerText('#prodCorps');
    ok(/SWOGE/.test(t) && /Luna/.test(t) && /Eve/.test(t) && /Rex/.test(t), 'la production montre ses personnages et leurs voix');
    eq(S.liste(ADRESSES.jA).length, 1, 'le serveur l a gardee sous l adresse de la session');
  }

  console.log('\n-- 4. une scene --');
  {
    journal.length = 0;
    await p.fill('.prod-texte', 'SWOGE lifts. Luna says "Not bad."');
    await p.selectOption('.prod-feuille select >> nth=-1', '6');
    await p.click('.prod-filme');
    await p.waitForSelector('#prod >> text=Filming');
    const sc = journal.find((x) => /\/scene$/.test(x.chemin));
    ok(sc && sc.corps.texte === 'SWOGE lifts. Luna says "Not bad."' && sc.corps.duree === 6 && sc.auth === 'jA', 'le texte et la duree partent, avec le jeton');
    const v = S.liste(ADRESSES.jA)[0].scenes[0].video;
    pret.add(v);
    await p.waitForSelector('.prod-scene video', { timeout: 8000 });
    eq(await p.getAttribute('.prod-scene video', 'src'), 'https://vidgen.x.ai/' + v + '.mp4', 'la page repasse seule et montre la video finie');
    ok(/38,556 \$SWOGE/.test(await p.innerText('.prod-scene')), 'avec ce qu elle a coute');
  }

  console.log('\n-- 5. refus, echappement, liens --');
  {
    await p.click('.prod-modifie');
    await p.selectOption('.prod-edit-perso select >> nth=1', '');
    await p.evaluate(() => {});   /* voix retiree : valide */
    await p.fill('.prod-edit-perso >> nth=1 >> input[type=text]', 'SWOGE');
    await p.click('.prod-sauve');
    await p.waitForFunction(() => document.getElementById('prodErreur').textContent.length > 0);
    ok(/same name/.test(await p.textContent('#prodErreur')), 'le refus du serveur est montre tel quel');
    await p.click('.prod-annule');
    injecte = { id: 'f'.repeat(16), mode: 'serie', titre: '<img src=x onerror="window.pirate=1">', format: '16:9',
      personnages: [{ nom: '<b id="gras">X</b>', image: 'javascript:alert(1)', voix: 'eve', description: '' }],
      scenes: [{ id: 's', texte: '<script>window.pirate=2</script>', statut: 'done', url: 'javascript:alert(1)' }] };
    await p.click('.prod-retour');
    await p.waitForSelector('.prod-item >> nth=1');
    ok(/<img src=x/.test(await p.innerText('#prodCorps')), 'un titre en HTML est montre comme du texte');
    await p.click('.prod-item >> nth=1');
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => ({ pirate: window.pirate || 0, gras: !!document.getElementById('gras'),
      videos: document.querySelectorAll('.prod-scene video').length, imgJs: Array.prototype.some.call(document.querySelectorAll('#prodCorps img'), (i) => /^javascript:/.test(i.getAttribute('src') || '')) }));
    ok(r.pirate === 0 && !r.gras, 'rien du serveur n est interprete comme du HTML');
    ok(r.videos === 0 && !r.imgJs, 'une video ou une image en javascript: n est jamais chargee');
    injecte = null;
    await p.click('.prod-retour');
  }

  console.log('\n-- 6. modifier garde les scenes, supprimer demande --');
  {
    await p.waitForSelector('.prod-item');
    await p.click('.prod-item');
    await p.click('.prod-modifie');
    await p.fill('.prod-feuille > #prodCorps > input[type=text]', 'Gym Wars II');
    journal.length = 0;
    await p.click('.prod-sauve');
    await p.waitForSelector('#prod >> text=Scene 2');
    const e = journal.find((x) => x.m === 'POST');
    ok(/^\/studio\/production\/[0-9a-f]{16}$/.test(e.chemin) && /^\/studio\/production\/image\//.test(e.corps.production.personnages[1].image), 'la photo deja rangee repart par son adresse, pas en octets');
    ok(S.liste(ADRESSES.jA)[0].titre === 'Gym Wars II' && S.liste(ADRESSES.jA)[0].scenes.length === 1, 'renommee, sa scene gardee');
    await p.click('.prod-supprime');
    await p.waitForSelector('#prod >> text=No production yet.');
    eq(S.liste(ADRESSES.jA).length, 0, 'supprimee (apres confirmation)');
    await p.close();
  }

  console.log('\n-- 7. une pub, sur 320 px --');
  {
    p = await ouvre({ session: 'jB', largeur: 320 });
    await video(p); await p.click('#prodBtn');
    await p.click('#prod >> text=+ New ad');
    const deb = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(deb <= 0, 'le formulaire tient dans 320 px [' + deb + ']');
    await p.fill('#prodCorps > input[type=text] >> nth=0', 'Shaker launch');
    await p.fill('#prodCorps > input[type=text] >> nth=1', 'Swole Shaker');
    const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('#prod >> text=Upload photo >> nth=0')]);
    await ch.setFiles(path.join(SITE, 'img/site/icone-192.png'));
    await p.waitForFunction(() => /^data:image\/jpeg/.test(document.querySelector('#prodCorps img.vign').src));
    await p.click('.prod-sauve');
    await p.waitForSelector('.prod-filme');
    const pub = S.liste(ADRESSES.jB)[0];
    ok(pub && pub.mode === 'pub' && pub.format === '9:16' && pub.produit.presentateur === 'swoge', 'la pub : verticale, presentee par SWOGE d office');
    eq(S.liste(ADRESSES.jA).length, 0, 'et rien chez l autre portefeuille');
    const deb2 = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(deb2 <= 0, 'la vue de la pub tient dans 320 px [' + deb2 + ']');
    await p.close();
  }

  await nav.close(); srv.close();
  fs.rmSync(dossier, { recursive: true, force: true });
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
