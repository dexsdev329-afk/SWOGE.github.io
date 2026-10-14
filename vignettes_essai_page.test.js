'use strict';
/* ============================================================================
 * VIGNETTES DU STUDIO — LA PAGE DES LOTS (vignettes_essai.html), SERVEUR SIMULE
 *
 * Le proprietaire lance les lots de clips xAI ecrits dans
 * img/site/studio/vignettes.json (le VRAI fichier publie). Le serveur
 * (/studio/vignettes) est simule par page.route ; ce que la page DOIT tenir :
 *   1. Sans session : AUCUNE requete au serveur ; les lots du fichier listes,
 *      avec l'image d'entree de chaque carte, chaque Run grise.
 *   2. Pas proprietaire : GET avec le jeton, « owner only », aucun POST meme
 *      avec un bouton degrise a la main.
 *   3. Proprietaire : budget et pire cas du serveur, tarif dit ; Run grise
 *      au-dessus du reste et pour une entree invalide.
 *   4. Run : confirmation avec le pire cas, POST {lot} SEUL avec le jeton ;
 *      suivi jusqu'a la fin ; boucles .webm/.mp4 et brut telecharges avec le
 *      jeton (blob), nommes pour media/studio/ ; aucun lien nu.
 *   5. Un refus du serveur est montre ECHAPPE.
 *   6. ARRET ou video eteinte : Run grises, la raison dite.
 *   7. ?server= vers un tiers ne recoit jamais le jeton.
 *   8. 320 px : rien ne deborde, Run assez grand pour un doigt.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const PROD = 'https://web-production-220a3.up.railway.app';
const PROPRIO = { jOwner: true, jAutre: false };
const FICHIER = JSON.parse(fs.readFileSync(path.join(SITE, 'img/site/studio/vignettes.json'), 'utf8'));
const NOMS = Object.keys(FICHIER.lots);
const reserve = (d) => Math.round((0.02 * d + 0.01) * 1.25 * 1e4) / 1e4;
const pireDe = (nom) => Math.round(FICHIER.lots[nom].reduce((s, d) => s + reserve(d.duree), 0) * 1e4) / 1e4;
const ID = 'ab'.repeat(12);

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port, base = 'http://127.0.0.1:' + port + '/vignettes_essai.html';
  const nav = await chromium.launch();

  const journal = [];
  let S;
  const remet = () => { S = { depense: 0, plafond: 1.25, arret: null, enCours: null, actif: true, lots: [], refus: null, tours: 0 }; };
  remet();
  function vue() {
    const lots = NOMS.map((nom) => ({ nom, clips: FICHIER.lots[nom].length, reserveUsd: pireDe(nom), secondes: FICHIER.lots[nom].reduce((s, d) => s + d.duree, 0), invalide: null,
      detail: FICHIER.lots[nom].map((d) => ({ carte: d.carte, duree: d.duree, format: d.format, image: d.image })) }));
    lots.push({ nom: 'casse', clips: 1, reserveUsd: null, secondes: 3, invalide: 'unknown field prompt', detail: [] });
    lots.push({ nom: 'gros', clips: 16, reserveUsd: 1.8, secondes: 64, invalide: null, detail: [] });
    return { ok: true, proprietaire: true, actif: S.actif, plafondUsd: S.plafond, depenseUsd: S.depense, resteUsd: Math.max(0, S.plafond - S.depense), arret: S.arret, enCours: S.enCours,
      modele: 'grok-imagine-video-1.5-lite', resolution: '480p', prixSeconde: 0.02, imageUsd: 0.01, marge: 1.25, vignettes: { ok: true, lots }, lots: S.lots };
  }
  function avance() {
    for (const l of S.lots) {
      if (l.statut === 'fini') continue;
      if (++S.tours >= 2) {
        l.statut = 'fini'; l.coutUsd = 0.07; S.enCours = null; S.depense = 0.07;
        l.clips[0] = Object.assign({}, l.clips[0], { statut: 'done', coutUsd: 0.07, secondes: 38.5, fichier: 'c'.repeat(48) + '.mp4', fini: 'video-qualite.mp4', finiWebm: 'video-qualite.webm' });
      }
    }
  }
  function route(q, url) {
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    let corps = null; try { corps = JSON.parse(q.postData() || 'null'); } catch (e) {}
    journal.push({ m: q.method(), origine: url.origin, chemin: url.pathname, auth, corps });
    if (!(auth in PROPRIO)) return [401, { ok: false, raison: 'sign in with your wallet first' }];
    if (!PROPRIO[auth]) {
      if (q.method() === 'GET' && url.pathname === '/studio/vignettes') return [200, { ok: true, proprietaire: false }];
      return [403, { ok: false, raison: 'owner only (AI_OWNER on the server)' }];
    }
    if (url.pathname === '/studio/vignettes' && q.method() === 'GET') { avance(); return [200, vue()]; }
    if (url.pathname === '/studio/vignettes' && q.method() === 'POST') {
      if (S.refus) { const r = S.refus; S.refus = null; return r; }
      S.enCours = ID;
      S.lots.unshift({ id: ID, t: Date.UTC(2026, 9, 14, 9, 30), lot: corps.lot, statut: 'lance', pireUsd: pireDe('sonde'), coutUsd: 0,
        clips: [{ carte: 'video:qualite', duree: 3, format: '16:9', statut: 'sent', coutUsd: null, reserve: 0.0875, secondes: null, fichier: null, fini: null, finiWebm: null, erreur: null }] });
      return [200, { ok: true, id: ID, lances: 1, total: 1, pireUsd: pireDe('sonde') }];
    }
    return [404, { ok: false, raison: 'unknown' }];
  }
  const ouvre = async ({ session, largeur, requete } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1100, height: 900 }, acceptDownloads: true });
    if (session) await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} }, session);
    const p = await ctx.newPage();
    p.dialogues = [];
    p.on('dialog', (d) => { p.dialogues.push(d.message()); d.accept(); });
    await p.route('**/*', (r) => {
      const q = r.request(), u = new URL(q.url());
      if (u.origin === 'http://127.0.0.1:' + port) return r.continue();
      if (/^\/studio\/vignettes\/fichier\//.test(u.pathname)) {
        const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
        journal.push({ m: q.method(), origine: u.origin, chemin: u.pathname, auth });
        if (auth !== 'jOwner') return r.fulfill({ status: 401, body: '{}' });
        return r.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from('\0\0\0\x18ftypisom') });
      }
      if (/^\/studio\/vignettes(\/|$)/.test(u.pathname)) {
        const [code, o] = route(q, u);
        return r.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(o) });
      }
      journal.push({ m: q.method(), origine: u.origin, chemin: u.pathname, auth: String(q.headers().authorization || '') });
      return r.abort();
    });
    await p.goto(base + (requete || ''), { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#listeDemandes .lot', { timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(200);
    return p;
  };
  const runs = (p) => p.$$eval('button.run', (b) => b.map((x) => ({ t: x.textContent, off: x.disabled, pq: (x.nextElementSibling && x.nextElementSibling.className === 'pourquoi') ? x.nextElementSibling.textContent : null })));
  const posts = () => journal.filter((x) => x.m === 'POST');

  console.log('-- 1. sans session --');
  {
    journal.length = 0;
    const p = await ouvre({});
    eq(journal.length, 0, 'aucune requete hors du site');
    const r = await runs(p);
    ok(r.length === NOMS.length && r.every((x) => x.off && x.pq === 'sign in first'), 'les ' + NOMS.length + ' lots du fichier listes, chaque Run grise');
    const imgs = await p.$$eval('#listeDemandes .entrees img', (l) => l.map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 })));
    const total = NOMS.reduce((s, nom) => s + FICHIER.lots[nom].length, 0);
    await p.waitForFunction(() => [...document.querySelectorAll('#listeDemandes .entrees img')].every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
    const charges = await p.$$eval('#listeDemandes .entrees img', (l) => l.filter((i) => i.naturalWidth === 854).length);
    ok(imgs.length === total && charges === total, 'l image d entree de chaque carte se voit (' + charges + '/' + total + ', 854 px de large)');
    await p.close();
  }

  console.log('\n-- 2. pas proprietaire --');
  {
    journal.length = 0;
    const p = await ouvre({ session: 'jAutre' });
    ok(journal.some((x) => x.m === 'GET' && x.chemin === '/studio/vignettes' && x.auth === 'jAutre' && x.origine === PROD), 'GET /studio/vignettes avec le jeton, vers la production');
    ok(/owner only/.test(await p.textContent('#acces')), 'la page dit « owner only »');
    await p.evaluate(() => document.querySelectorAll('button.run').forEach((b) => { b.disabled = false; }));
    await p.click('button.run >> nth=0');
    await p.waitForTimeout(200);
    eq(posts().length, 0, 'aucun POST, meme un bouton degrise a la main');
    await p.close();
  }

  console.log('\n-- 3. proprietaire --');
  remet();
  let p = await ouvre({ session: 'jOwner' });
  {
    eq(await p.textContent('#plafond'), '$1.25', 'plafond 1,25 $');
    ok(/grok-imagine-video-1\.5-lite · 480p · \$0\.02\/s \+ \$0\.01 per picture/.test(await p.textContent('#tarif')), 'le tarif est dit');
    ok(/worst case \$0\.0875/.test(await p.textContent('[data-lot="sonde"] .tete')), 'pire cas de la sonde (' + pireDe('sonde') + ' $)');
    const r = await runs(p);
    const de = (nom) => r.find((x) => x.t === 'Run ' + nom);
    ok(NOMS.every((nom) => !de(nom).off), 'les lots publies sont lancables');
    ok(de('gros').off && de('gros').pq === 'worst case above what is left', 'lot au-dessus du reste grise');
    ok(de('casse').off && /invalid entry/.test(de('casse').pq), 'entree invalide grisee');
  }

  console.log('\n-- 4. Run, suivi, fichiers --');
  {
    journal.length = 0;
    await p.click('text=Run sonde');
    await p.waitForSelector('#listeLots [data-id="' + ID + '"]', { timeout: 5000 }).catch(() => {});
    ok(p.dialogues.some((m) => /Run batch "sonde"\? 1 clip\(s\), worst case \$0\.0875 on the xAI account \(\$1\.25 left\)/.test(m)), 'confirmation avec le pire cas [' + p.dialogues[0] + ']');
    eq(posts().length, 1, 'un seul POST');
    eq(JSON.stringify(posts()[0].corps), '{"lot":"sonde"}', 'le corps ne porte que le lot');
    eq(posts()[0].auth, 'jOwner', 'le jeton en Authorization');
    ok((await runs(p)).every((x) => x.off), 'pendant le lot, tous les Run grises');
    await p.waitForSelector('#listeLots >> text=finished', { timeout: 12000 }).catch(() => {});
    ok(/finished · \$0\.07 of \$0\.0875 worst case/.test(await p.textContent('#listeLots')), 'fini, cout reel contre pire cas');
    const rels = await p.$$eval('#listeLots button.fichier', (b) => b.map((x) => x.getAttribute('data-rel')));
    eq(rels.join(','), 'video-qualite.webm,video-qualite.mp4,' + 'c'.repeat(48) + '.mp4', 'boucle WebM, boucle MP4, brut');
    eq(await p.$$eval('#listeLots a[href*="/studio/"]', (a) => a.length), 0, 'aucun lien nu vers le serveur');
    journal.length = 0;
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#listeLots button[data-rel="video-qualite.mp4"]')]);
    ok(dl && dl.suggestedFilename() === 'video-qualite.mp4', 'telechargement nomme pour media/studio/ [' + (dl && dl.suggestedFilename()) + ']');
    ok(journal.some((x) => x.chemin === '/studio/vignettes/fichier/' + ID + '/video-qualite.mp4' && x.auth === 'jOwner'), 'le fichier lu avec le jeton');
    const [dr] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#listeLots button[data-rel="' + 'c'.repeat(48) + '.mp4"]')]);
    ok(dr && dr.suggestedFilename() === 'vignette_video-qualite_raw.mp4', 'le brut nomme a part [' + (dr && dr.suggestedFilename()) + ']');
    const noms = [];
    p.on('download', (d) => noms.push(d.suggestedFilename()));
    await p.click('#listeLots button[data-tout]');
    for (let i = 0; i < 30 && noms.length < 2; i++) await p.waitForTimeout(100);
    eq(noms.sort().join(','), 'video-qualite.mp4,video-qualite.webm', 'Download all : les deux boucles');
  }

  console.log('\n-- 5. refus echappe --');
  {
    S.refus = [402, { ok: false, code: 402, raison: '<img src=x onerror="window.__xss=1"> this batch could cost up to 1.8 $' }];
    journal.length = 0;
    await p.click('text=Run cartes');
    await p.waitForFunction(() => /Not started/.test(document.getElementById('statut').textContent), null, { timeout: 5000 }).catch(() => {});
    ok(/^Not started: <img src=x/.test(await p.textContent('#statut')), 'la raison du serveur, en texte');
    eq(await p.evaluate(() => [window.__xss || 0, document.querySelectorAll('#statut img').length].join()), '0,0', 'rien d interprete');
    await p.close();
  }

  console.log('\n-- 6. ARRET, video eteinte --');
  {
    remet(); S.arret = '2026-10-14T09:00:00Z cost 0.2 $ > reserve 0.0875 $';
    p = await ouvre({ session: 'jOwner' });
    ok((await runs(p)).every((x) => x.off && /stopped/.test(x.pq)) && /STOPPED: 2026-10-14T09:00:00Z/.test(await p.textContent('#etatServeur')), 'ARRET : Run grises, raison dite');
    await p.close();
    remet(); S.actif = false;
    p = await ouvre({ session: 'jOwner' });
    ok((await runs(p)).every((x) => x.off && /XAI_API_KEY/.test(x.pq)), 'sans XAI_API_KEY : Run grises');
    await p.close();
  }

  console.log('\n-- 7. ?server= --');
  for (const cible of ['https://evil.example', 'http://127.0.0.1:9']) {
    remet(); journal.length = 0;
    const q = await ouvre({ session: 'jOwner', requete: '?server=' + encodeURIComponent(cible) });
    const vers = [...new Set(journal.filter((x) => x.auth).map((x) => x.origine))];
    if (cible.startsWith('https://evil')) ok(vers.length === 1 && vers[0] === PROD, cible + ' ignore : jeton vers la production seulement [' + vers + ']');
    else ok(vers.length === 1 && vers[0] === 'http://127.0.0.1:9', 'serveur local accepte quand la page est locale [' + vers + ']');
    await q.close();
  }

  console.log('\n-- 8. 320 px --');
  {
    remet();
    p = await ouvre({ session: 'jOwner', largeur: 320 });
    await p.click('text=Run sonde');
    await p.waitForSelector('#listeLots >> text=finished', { timeout: 12000 }).catch(() => {});
    const deb = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(deb <= 0, 'rien ne deborde a 320 px, lot fini affiche [' + deb + ']');
    ok((await p.$eval('button.run', (b) => b.getBoundingClientRect().height)) >= 44, 'Run assez grand pour un doigt');
    await p.close();
  }

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
