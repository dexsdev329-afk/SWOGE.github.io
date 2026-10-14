'use strict';
/* ============================================================================
 * PLANCHES ISO — LA PAGE DES LOTS (planches_essai.html), SERVEUR SIMULE
 *
 * Le pilote du 14/10/2026 : le proprietaire lance les lots de clips xAI ecrits
 * dans demandes.json. Le serveur (/studio/planches) est simule par page.route ;
 * ce que la page DOIT tenir :
 *   1. Sans session : AUCUNE requete au serveur ; les lots publies sont listes
 *      depuis le fichier du site, chaque Run grise.
 *   2. Un portefeuille qui n'est pas proprietaire : la page demande (GET, jeton),
 *      dit « owner only », tous les Run restent grises, aucun POST.
 *   3. Proprietaire : budget (depense, reste, plafond) et pire cas de chaque lot
 *      tels que le serveur les donne ; Run grise pour un lot dont le pire cas
 *      depasse le reste, et pour une entree invalide.
 *   4. Run : confirmation, puis POST {lot} SEUL (aucune adresse) avec le jeton en
 *      Authorization ; le suivi montre le lot en cours puis fini, les clips, le
 *      verdict des controles et les fichiers ; un fichier se telecharge avec le
 *      jeton (blob), jamais par un lien nu.
 *   5. Un refus du serveur (402 au plafond) est montre, ECHAPPE.
 *   6. ARRET ou un lot en cours : tous les Run grises, la raison dite.
 *   7. ?server= vers un tiers ne recoit jamais le jeton.
 *   8. Rien ne deborde sur un telephone de 320 px.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const PROD = 'https://web-production-220a3.up.railway.app';
const PROPRIO = { jOwner: true, jAutre: false };
const SHA = 'a'.repeat(64);
const clip = (monstre, action, duree, modele) => ({ monstre, action, mode: 'bande', modele: modele || 'grok-imagine-video-1.5', duree, resolution: '720p', sha256: SHA });
/* le fichier du site (fixe : l'essai ne depend pas des lots publies du jour) */
const FICHIER = { format: 'swoge-demandes-planches/1', lots: {
  sonde: [clip('pirate', 'idle', 2)],
  pirate: [clip('pirate', 'walk', 3), clip('pirate', 'run', 3), clip('pirate', 'attack', 2), clip('pirate', 'jump', 2), clip('pirate', 'walk', 3, 'grok-imagine-video-1.5-lite')],
  gros: [clip('pirate', 'walk', 4), clip('pirate', 'run', 4)],
  casse: [{ monstre: 'pirate', action: 'dance', mode: 'bande', modele: 'grok-imagine-video-1.5', duree: 2, sha256: SHA }] } };
const detail = (l) => l.map((d) => ({ monstre: d.monstre, action: d.action, mode: d.mode, dir: null, modele: d.modele, duree: d.duree, resolution: '720p' }));
const ID = 'ab'.repeat(12);

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port, base = 'http://127.0.0.1:' + port + '/planches_essai.html';
  const nav = await chromium.launch();

  /* ---- le faux serveur ---- */
  const journal = [];
  let S;
  const remet = () => { S = { depense: 0, plafond: 7.5, arret: null, enCours: null, actif: true, lots: [], refus: null, tours: 0 }; };
  remet();
  function vue() {
    return { ok: true, proprietaire: true, actif: S.actif, plafondUsd: S.plafond, depenseUsd: S.depense, resteUsd: Math.max(0, S.plafond - S.depense), arret: S.arret, enCours: S.enCours,
      demandes: { ok: true, lots: [
        { nom: 'sonde', clips: 1, reserveUsd: 0.375, secondes: 2, invalide: null, detail: detail(FICHIER.lots.sonde) },
        { nom: 'pirate', clips: 5, reserveUsd: 1.975, secondes: 13, invalide: null, detail: detail(FICHIER.lots.pirate) },
        { nom: 'gros', clips: 2, reserveUsd: 9.95, secondes: 8, invalide: null, detail: detail(FICHIER.lots.gros) },
        { nom: 'casse', clips: 1, reserveUsd: null, secondes: 2, invalide: 'action', detail: [] }] },
      lots: S.lots };
  }
  /* le lot lance avance d'un cran a chaque lecture : envoye, puis fini avec sa planche */
  function avance() {
    for (const l of S.lots) {
      if (l.statut === 'fini') continue;
      S.tours++;
      if (S.tours >= 2) {
        l.statut = 'fini'; l.coutUsd = 0.3; S.enCours = null; S.depense = 0.3;
        l.clips[0] = Object.assign({}, l.clips[0], { statut: 'done', coutUsd: 0.3, secondes: 41.2, fichier: 'c'.repeat(48) + '.mp4' });
        l.planches = [{ monstre: 'pirate', verdict: 'a_revoir', echecs: ['halo:idle:se', 'pieds:idle:nw'], fiche: 'pirate.json', fichiers: ['pirate.json', 'pirate/idle.webp', 'pirate/idle_hd.webp'],
                        prises: ['idle 1.5'].concat(l.refaite ? ['walk 1.5'] : []) }];
      }
    }
  }
  function route(q, url) {
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    let corps = null; try { corps = JSON.parse(q.postData() || 'null'); } catch (e) {}
    journal.push({ m: q.method(), origine: url.origin, chemin: url.pathname, auth, corps });
    if (!(auth in PROPRIO)) return [401, { ok: false, raison: 'sign in with your wallet first' }];
    if (!PROPRIO[auth]) {
      if (q.method() === 'GET' && url.pathname === '/studio/planches') return [200, { ok: true, proprietaire: false }];
      return [403, { ok: false, raison: 'owner only (AI_OWNER on the server)' }];
    }
    if (url.pathname === '/studio/planches' && q.method() === 'GET') { avance(); return [200, vue()]; }
    const rf = /^\/studio\/planches\/refinition\/([0-9a-f]{24})$/.exec(url.pathname);
    if (rf && q.method() === 'POST') {
      const l = S.lots.find((x) => x.id === rf[1]);
      if (!l || l.statut !== 'fini' || S.enCours) return [409, { ok: false, raison: 'this batch is not finished yet' }];
      l.statut = 'finition'; l.refaite = true; S.enCours = l.id; S.tours = 1;
      return [200, { ok: true, id: l.id, statut: 'finition' }];
    }
    if (url.pathname === '/studio/planches' && q.method() === 'POST') {
      if (S.refus) { const r = S.refus; S.refus = null; return r; }
      S.enCours = ID;
      S.lots.unshift({ id: ID, t: Date.UTC(2026, 9, 14, 9, 30), lot: corps.lot, statut: 'lance', pireUsd: 0.375, coutUsd: 0,
        clips: [{ monstre: 'pirate', action: 'idle', mode: 'bande', dir: null, modele: 'grok-imagine-video-1.5', duree: 2, resolution: '720p', statut: 'sent', coutUsd: null, reserve: 0.375, secondes: null, fichier: null, erreur: null }], planches: [] });
      return [200, { ok: true, id: ID, lances: 1, total: 1, pireUsd: 0.375 }];
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
      if (u.pathname.endsWith('/img/nexus/monstres/iso/poses/demandes.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FICHIER) });
      if (u.origin === 'http://127.0.0.1:' + port) return r.continue();
      if (/^\/studio\/planches\/fichier\//.test(u.pathname)) {
        const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
        journal.push({ m: q.method(), origine: u.origin, chemin: u.pathname, auth });
        if (auth !== 'jOwner') return r.fulfill({ status: 401, body: '{}' });
        return r.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.from('RIFF\0\0\0\0WEBPVP8L') });
      }
      if (/^\/studio\/planches(\/|$)/.test(u.pathname)) {
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

  console.log('-- 1. sans session : aucune requete au serveur, lots lus dans le fichier, Run grises --');
  {
    journal.length = 0;
    const p = await ouvre({});
    eq(journal.length, 0, 'aucune requete hors du site');
    const r = await runs(p);
    eq(r.length, 4, 'les 4 lots du fichier listes');
    ok(r.every((x) => x.off && x.pq === 'sign in first'), 'chaque Run grise, « sign in first »');
    ok(/Sign in with your wallet/.test(await p.textContent('#acces')), 'la page dit de se connecter');
    ok(/1 clip · 2 s/.test(await p.textContent('[data-lot="sonde"] .tete')), 'clips et secondes lus dans le fichier');
    ok(await p.isHidden('#budget'), 'pas de budget sans le serveur');
    await p.close();
  }

  console.log('\n-- 2. pas proprietaire : la page demande, dit « owner only », aucun Run --');
  {
    journal.length = 0;
    const p = await ouvre({ session: 'jAutre' });
    ok(journal.some((x) => x.m === 'GET' && x.chemin === '/studio/planches' && x.auth === 'jAutre' && x.origine === PROD), 'GET /studio/planches avec le jeton, vers la production');
    ok(/owner only/.test(await p.textContent('#acces')), 'la page dit « owner only »');
    const r = await runs(p);
    ok(r.length === 4 && r.every((x) => x.off && x.pq === 'owner only'), 'tous les Run grises');
    /* meme un bouton degrise a la main ne part pas : la page refait le test (et le serveur dirait 403) */
    await p.evaluate(() => document.querySelectorAll('button.run').forEach((b) => { b.disabled = false; }));
    await p.click('button.run >> nth=0');
    await p.waitForTimeout(200);
    eq(posts().length, 0, 'aucun POST');
    await p.close();
  }

  console.log('\n-- 3. proprietaire : budget, pire cas du serveur, Run grises a raison --');
  remet();
  let p = await ouvre({ session: 'jOwner' });
  {
    eq(await p.textContent('#depense'), '$0.00', 'depense');
    eq(await p.textContent('#reste'), '$7.50', 'reste');
    eq(await p.textContent('#plafond'), '$7.50', 'plafond');
    ok(/worst case \$0\.38/.test(await p.textContent('[data-lot="sonde"] .tete')), 'pire cas de la sonde (0,375 $ du serveur)');
    ok(/worst case \$1\.98/.test(await p.textContent('[data-lot="pirate"] .tete')), 'pire cas du lot pirate');
    const r = await runs(p);
    const de = (nom) => r.find((x) => x.t === 'Run ' + nom);
    ok(!de('sonde').off && !de('pirate').off, 'sonde et pirate lancables');
    ok(de('gros').off && de('gros').pq === 'worst case above what is left', 'lot au-dessus du reste grise [' + de('gros').pq + ']');
    ok(de('casse').off && /invalid entry \(action\)/.test(de('casse').pq), 'entree invalide grisee [' + de('casse').pq + ']');
    ok((await p.$$eval('[data-lot="pirate"] ul.clips li', (l) => l.map((x) => x.textContent))).some((t) => t === 'pirate · walk · 4-view strip · grok-imagine-video-1.5-lite · 3 s · 720p'), 'le detail de chaque clip');
  }

  console.log('\n-- 4. Run : confirmation, POST {lot} seul avec le jeton, suivi jusqu a la fin, fichiers --');
  {
    journal.length = 0;
    await p.click('text=Run sonde');
    await p.waitForSelector('#listeLots [data-id="' + ID + '"]', { timeout: 5000 }).catch(() => {});
    ok(p.dialogues.some((m) => /Run batch "sonde"\? 1 clip\(s\), worst case \$0\.38/.test(m)), 'confirmation avec le pire cas [' + p.dialogues[0] + ']');
    eq(posts().length, 1, 'un seul POST');
    eq(JSON.stringify(posts()[0].corps), '{"lot":"sonde"}', 'le corps ne porte que le lot, aucune adresse');
    eq(posts()[0].auth, 'jOwner', 'le jeton en Authorization');
    ok(/started: 1\/1 clip/.test(await p.textContent('#statut')), 'le depart est dit');
    ok(/running/.test(await p.textContent('#listeLots [data-id="' + ID + '"] .tete')), 'le lot en cours');
    ok((await runs(p)).every((x) => x.off && x.pq === 'a batch is running'), 'pendant le lot, tous les Run grises');
    await p.waitForSelector('#listeLots >> text=finished', { timeout: 12000 }).catch(() => {});
    const t = await p.textContent('#listeLots');
    ok(/finished · \$0\.30 of \$0\.38 worst case/.test(t), 'fini, cout reel contre pire cas');
    ok(/idle · 4-view strip .* — done · \$0\.30 · 41\.2 s wait/.test(t), 'le clip, son cout et l attente');
    ok(/pirate: checks to review \(2 failed: halo:idle:se, pieds:idle:nw\)/.test(t), 'le verdict des controles et les echecs');
    const rels = await p.$$eval('#listeLots button.fichier', (b) => b.map((x) => x.getAttribute('data-rel')));
    eq(rels.join(','), 'c'.repeat(48) + '.mp4,pirate.json,pirate/idle.webp,pirate/idle_hd.webp', 'un bouton par fichier (clip, fiche, planches)');
    eq(await p.$$eval('#listeLots a[href*="/studio/"]', (a) => a.length), 0, 'aucun lien nu vers le serveur');
    journal.length = 0;
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#listeLots button[data-rel="pirate/idle.webp"]')]);
    ok(dl && dl.suggestedFilename() === 'planches_sonde_pirate_idle.webp', 'telechargement nomme [' + (dl && dl.suggestedFilename()) + ']');
    ok(journal.some((x) => x.chemin === '/studio/planches/fichier/' + ID + '/pirate/idle.webp' && x.auth === 'jOwner'), 'le fichier lu avec le jeton');
    eq(await p.textContent('#depense'), '$0.30', 'la depense suit le serveur');
    ok(/clips used: idle 1\.5/.test(await p.textContent('#listeLots')), 'les prises gardees par la finition sont dites');

    /* refaire la finition : un POST sans corps sur le lot, aucun Run, 0 $ annonce */
    journal.length = 0;
    await p.click('#listeLots [data-id="' + ID + '"] >> text=Redo finishing');
    await p.waitForFunction(() => /finishing again/.test(document.getElementById('statut').textContent), null, { timeout: 5000 }).catch(() => {});
    const rq = journal.filter((x) => x.m === 'POST');
    ok(rq.length === 1 && rq[0].chemin === '/studio/planches/refinition/' + ID && rq[0].auth === 'jOwner' && rq[0].corps == null,
       'Redo finishing : un POST sur /studio/planches/refinition/<lot>, avec le jeton, sans corps [' + rq.map((x) => x.chemin).join(',') + ']');
    await p.waitForFunction(() => /walk 1\.5/.test(document.getElementById('listeLots').textContent), null, { timeout: 12000 }).catch(() => {});
    ok(/clips used: idle 1\.5, walk 1\.5/.test(await p.textContent('#listeLots')) && /finished/.test(await p.textContent('#listeLots')), 'le lot refait revient fini, avec ses nouvelles prises');
    eq(await p.textContent('#depense'), '$0.30', 'refaire ne coute rien');
  }

  console.log('\n-- 5. un refus du serveur est montre, echappe --');
  {
    S.refus = [402, { ok: false, code: 402, raison: '<img src=x onerror="window.__xss=1"> this batch could cost up to 1.98 $' }];
    journal.length = 0;
    await p.click('text=Run pirate');
    await p.waitForFunction(() => /Not started/.test(document.getElementById('statut').textContent), null, { timeout: 5000 }).catch(() => {});
    const s = await p.textContent('#statut');
    ok(/^Not started: <img src=x/.test(s), 'la raison du serveur, en texte [' + s.slice(0, 60) + ']');
    eq(await p.evaluate(() => [window.__xss || 0, document.querySelectorAll('#statut img').length].join()), '0,0', 'rien d interprete');
    eq(posts().length, 1, 'un seul POST pour un clic');
    await p.close();
  }

  console.log('\n-- 6. ARRET, video eteinte : tous les Run grises, la raison dite --');
  {
    remet(); S.arret = '2026-10-14T09:00:00Z cost 0.5 $ > reserve 0.375 $';
    p = await ouvre({ session: 'jOwner' });
    ok((await runs(p)).every((x) => x.off && /stopped/.test(x.pq)), 'ARRET : Run grises');
    ok(/STOPPED: 2026-10-14T09:00:00Z cost 0\.5/.test(await p.textContent('#etatServeur')), 'ARRET dit');
    await p.close();
    remet(); S.actif = false;
    p = await ouvre({ session: 'jOwner' });
    ok((await runs(p)).every((x) => x.off && /XAI_API_KEY/.test(x.pq)), 'sans XAI_API_KEY : Run grises');
    await p.close();
  }

  console.log('\n-- 7. ?server= : ou part le jeton --');
  for (const cible of ['https://evil.example', 'http://127.0.0.1:9']) {
    remet(); journal.length = 0;
    const q = await ouvre({ session: 'jOwner', requete: '?server=' + encodeURIComponent(cible) });
    const avec = journal.filter((x) => x.auth);
    const vers = [...new Set(avec.map((x) => x.origine))];
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
    const h = await p.$eval('button.run', (b) => b.getBoundingClientRect().height);
    ok(h >= 44, 'Run assez grand pour un doigt [' + h + ']');
    await p.close();
  }

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
