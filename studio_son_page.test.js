'use strict';
/* ============================================================================
 * SWOGE STUDIO (studio.html) — L'ONGLET VOICE : VOIX OFF ET MUSIQUE
 *
 * Derriere un faux reseau qui sert le CATALOGUE REEL (studio_son.js du serveur,
 * le meme calcul que /studio/son/catalogue). Ce que la page DOIT tenir :
 *
 *   1. Serveur eteint (pas de cle : `actif` faux, ou route absente) : l'onglet
 *      Voice garde « Soon » et aria-disabled, la page dit « coming soon », aucune
 *      carte a choisir, rien ne part.
 *   2. Serveur allume : l'onglet perd « Soon » ; Voice montre la section #vox a la
 *      place du composeur ; les cartes Voice-over et Music sont en service, a leur
 *      prix du catalogue ; Lipsync reste « Coming soon » ; le clonage « Not offered ».
 *   3. Sans session : « Sign in to generate », aucun POST.
 *   4. Le prix est sur le bouton AVANT le clic, egal a celui que le serveur
 *      calcule (studio_son.prixClient) ; un clic = UNE requete
 *      { texte, voix, modele, langue?, confirmeUsd } ou { prompt, secondes,
 *      instrumental, confirmeUsd } — jamais une adresse.
 *   5. Le MP3 est lu AVEC la session (blob:), joue et telechargeable ; l'echantillon
 *      d'une voix se joue depuis son preview_url.
 *   6. Le refus du serveur est montre tel quel (et la suggestion d'ElevenLabs se
 *      reprend d'un appui) ; un prix change (409) est dit, rien n'est debite.
 *   7. Credit trop bas : le bouton se ferme et propose la recharge.
 *   8. 320, 390, 1280 px : pas de defilement horizontal, les deux outils ;
 *      aucun texte francais visible ; aucune erreur console.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
function serveur(f) {
  const l = [process.env.SWOGE_SERVEUR, path.join(SITE, '..', 'swoge-pusher-server.github.io'), path.join(SITE, '..', 'server'), path.join(SITE, '..', 'srv'), '/home/user/swoge-pusher-server.github.io'].filter(Boolean);
  for (const d of l) { try { return require(path.join(d, f)); } catch (e) {} }
  return null;
}
const Son = serveur('studio_son.js'), Med = serveur('studio_media.js');
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + (a === b ? '' : ' au lieu de ' + JSON.stringify(b)) + ']');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.webmanifest': 'application/json' };
const HOTE = 'web-production-220a3.up.railway.app';
const ADDR = '0x' + '7a'.repeat(20);
const SESSION = 'v1.' + ADDR + '.' + (Math.floor(Date.now() / 1000) + 86400 * 20) + '.sig-test';
const FR = /[àâçéèêëîïôûùüÿœ]|\b(les|des|une|est|pour|avec|vous|votre|aucun|aucune|rien|cette|dans|sans|leur|sont|mais|donc|ici|voici|chargement|erreur|connexion|prix|voix|musique)\b/i;
/* Un vrai petit MP3 muet (une trame MPEG-1 Layer III, 128 kb/s, 44,1 kHz, repetee) : le lecteur le lit. */
const TRAME = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)]);
const MP3 = Buffer.concat(Array.from({ length: 40 }, () => TRAME));
const VOIX = [
  { voice_id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', category: 'premade', preview_url: 'https://storage.example/george.mp3', labels: { gender: 'male', age: 'middle_aged', accent: 'british' } },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', category: 'premade', preview_url: 'https://storage.example/sarah.mp3', labels: { gender: 'female', age: 'young', accent: 'american' } },
  { voice_id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', category: 'premade', preview_url: 'https://storage.example/liam.mp3', labels: { gender: 'male', age: 'young', accent: 'american' } },
  { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', category: 'premade', preview_url: 'https://storage.example/charlotte.mp3', labels: { gender: 'female', accent: 'swedish' } },
  { voice_id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', category: 'premade', preview_url: 'https://storage.example/lily.mp3', labels: { gender: 'female', accent: 'british' } },
  { voice_id: 'CLONEDxxxxxxxxxxxxxx', name: 'Clone', category: 'cloned', preview_url: null, labels: {} },
];

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  if (!Son) { console.log('studio_son.js du serveur introuvable (SWOGE_SERVEUR) : essai ignore'); return; }
  /* Le catalogue que la route sert, calcule par le module du serveur (cle posee, voix simulees). */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'son-page-'));
  const fauxEleven = async () => new Response(JSON.stringify({ voices: VOIX, has_more: false, total_count: VOIX.length }), { status: 200 });
  const M = Son.cree({ dossier: tmp, cle: () => 'x', fetch: fauxEleven, paie: { reserve: () => null, regle: () => null } });
  const CAT_ON = await M.catalogue();
  const CAT_OFF = await Son.cree({ dossier: tmp, cle: () => '', paie: {} }).catalogue();
  const prixVoix = (texte, modele) => Son.prixClient(texte.length / 1000 * Son.MODELES_VOIX.find((m) => m.id === modele).parMilleUsd, CAT_ON.marge);

  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    const f = path.join(SITE, u);
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  const erreurs = [];

  const S = {};
  function remet(o) { Object.assign(S, { son: CAT_ON, envois: [], credit: 4.2, rep: null, fichiers: [], echantillons: [], lectures: [], mes: [] }, o || {}); }
  remet();
  async function route(r) {
    const q = r.request(), u = new URL(q.url());
    const json = (code, o) => r.fulfill({ status: code, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.hostname === 'storage.example') { S.echantillons.push(u.pathname); return r.fulfill({ status: 200, contentType: 'audio/mpeg', headers: { 'access-control-allow-origin': '*' }, body: MP3 }); }
    if (u.hostname !== HOTE) return r.abort();
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    const e = { m: q.method(), chemin: u.pathname, auth: q.headers().authorization || null, brut: q.postData() || '', corps: (() => { try { return JSON.parse(q.postData() || '{}'); } catch (x) { return {}; } })() };
    S.lectures.push(e);
    if (u.pathname === '/studio/media/catalogue') return json(200, Med ? Med.catalogue(0.0000423, { grok: true, openai: true }) : { ouvert: false, image: { fournisseurs: [] }, video: { modeles: [] } });
    if (u.pathname === '/studio/son/catalogue') return S.son ? json(200, S.son) : json(404, { ok: false, raison: 'unknown route' });
    S.envois.push(e);
    if (auth !== SESSION) return json(401, { ok: false, raison: 'sign in with your wallet first' });
    if (u.pathname === '/studio/chat/solde') return json(200, { ok: true, solde: '182400.52' });
    if (u.pathname === '/credit') return json(200, { ok: true, balanceUsd: S.credit, history: [], limits: { minUsd: 0.1, maxUsd: 50, maxSoldeUsd: 100 }, networks: { base: true, solana: true } });
    if (u.pathname === '/studio/son/mes') return json(200, { ok: true, fichiers: S.mes });
    if (u.pathname.startsWith('/studio/son/fichier/')) { S.fichiers.push(e); return r.fulfill({ status: 200, contentType: 'audio/mpeg', headers: { 'access-control-allow-origin': '*' }, body: MP3 }); }
    if (u.pathname === '/studio/son/voix' || u.pathname === '/studio/son/musique') {
      if (S.rep) { const x = S.rep; S.rep = null; return json(x.status, x.body); }
      const mus = u.pathname === '/studio/son/musique';
      const id = (mus ? 'b' : 'a').repeat(48);
      S.credit = Math.round((S.credit - e.corps.confirmeUsd) * 1e4) / 1e4;
      return json(200, { ok: true, payeur: 'credit', factureUsd: e.corps.confirmeUsd, creditUsd: S.credit, id, genre: mus ? 'music' : 'voice', t: Date.now(), expire: Date.now() + 48 * 3600e3,
        prixUsd: e.corps.confirmeUsd, voix: mus ? null : 'George', modele: mus ? 'music_v2_5' : e.corps.modele, secondes: mus ? e.corps.secondes : null,
        caracteres: mus ? null : (e.corps.texte || '').length, titre: mus ? e.corps.prompt : e.corps.texte, url: '/studio/son/fichier/' + id });
    }
    return json(404, { ok: false, raison: 'unknown route' });
  }
  async function ouvre(o = {}) {
    const ctx = await nav.newContext({ viewport: { width: o.largeur || 1280, height: o.hauteur || 900 }, isMobile: !!o.mobile, hasTouch: !!o.mobile, acceptDownloads: true });
    await ctx.routeWebSocket(/.*/, () => {});
    if (o.session) await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} }, SESSION);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erreurs.push('pageerror : ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|WebSocket/.test(m.text())) erreurs.push('console : ' + m.text()); });
    await p.route((u) => !u.href.startsWith(base), route);
    await p.goto(base + 'studio.html' + (o.suite || ''), { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(o.attente || 500);
    return p;
  }
  const ferme = (p) => p.context().close();
  const posts = (re) => S.envois.filter((e) => e.m === 'POST' && (!re || re.test(e.chemin)));
  const bouton = (p) => p.evaluate(() => ({ l: document.getElementById('vxGoL').textContent, p: document.getElementById('vxGoP').textContent, dis: document.getElementById('vxGo').disabled }));

  console.log('-- 1. serveur eteint : Soon, coming soon, rien ne part --');
  for (const [nom, cat] of [['route absente', null], ['sans cle (actif false)', CAT_OFF]]) {
    remet({ son: cat });
    const p = await ouvre({ session: true });
    const t = await p.$eval('#t-voice', (b) => ({ txt: b.innerText.replace(/\s+/g, ' '), dis: b.getAttribute('aria-disabled') }));
    ok(/soon/i.test(t.txt) && t.dis === 'true', nom + ' : l onglet Voice garde « Soon » et aria-disabled [' + t.txt + ']');
    await p.click('#t-voice', { force: true }); await p.waitForTimeout(150);
    ok(await p.isHidden('#vox') && await p.isVisible('#composer') && (await p.textContent('#genL')) === 'Coming soon', nom + ' : le composeur reste, son bouton dit Coming soon, la section Voice est cachee');
    ok(await p.$$eval('.mcard.live', (l) => l.length) === 0 && /Coming soon/.test(await p.innerText('#grid')), nom + ' : aucune carte en service, « Coming soon »');
    eq(posts().length, 0, nom + ' : aucun POST');
    await ferme(p);
  }

  console.log('\n-- 2. serveur allume : l onglet, la section, les cartes --');
  {
    remet();
    const p = await ouvre({ session: true });
    const t = await p.$eval('#t-voice', (b) => ({ txt: b.innerText.replace(/\s+/g, ' ').trim(), dis: b.getAttribute('aria-disabled'), soon: !!b.querySelector('.soon') }));
    ok(t.txt === 'Voice' && t.dis === null && !t.soon, 'l onglet Voice n est plus « Soon » [' + t.txt + ']');
    ok(await p.$eval('#t-avatar', (b) => /soon/i.test(b.innerText) && b.getAttribute('aria-disabled') === 'true'), 'Avatar reste « Soon »');
    ok(await p.isHidden('#vox'), 'sur l onglet Image, la section Voice ne se montre pas');
    await p.click('#t-voice'); await p.waitForTimeout(200);
    ok(await p.isVisible('#vox') && await p.isHidden('#composer'), 'Voice : la section prend la place du composeur');
    const cartes = await p.$$eval('#grid .mcard', (l) => l.map((c) => ({ id: c.getAttribute('data-id'), cls: c.className, txt: c.innerText.replace(/\s+/g, ' ') })));
    const vo = cartes.find((c) => c.id === 'vo'), mu = cartes.find((c) => c.id === 'mus');
    ok(vo && /\blive\b/.test(vo.cls) && /\$0\.06/.test(vo.txt) && /1,000 characters/.test(vo.txt) && /Quality \$0\.12/.test(vo.txt), 'carte Voice-over : en service, des 0,06 $ / 1 000 caracteres (Quality 0,12 $) — le catalogue [' + (vo && vo.txt) + ']');
    ok(mu && /\blive\b/.test(mu.cls) && /\$0\.225/.test(mu.txt) && /minute/.test(mu.txt), 'carte Music : en service, 0,225 $ / minute');
    ok(/Not offered/.test(await p.innerText('#grid')) && /Voice cloning/.test(await p.innerText('#grid')), 'la carte « Voice cloning — Not offered » reste');
    await p.click('#t-avatar', { force: true }); await p.waitForTimeout(100);
    ok(/Lipsync/.test(await p.innerText('#grid')) && await p.$eval('.mcard[data-id="lips"]', (c) => c.classList.contains('soon')), 'Lipsync reste « Coming soon »');
    await p.click('#t-voice'); await p.waitForTimeout(100);
    await p.click('.mcard[data-id="mus"]'); await p.waitForTimeout(100);
    ok(await p.isVisible('#vxMus') && await p.isHidden('#vxVo') && (await p.getAttribute('#vxOutils [data-outil="mus"]', 'aria-pressed')) === 'true', 'la carte Music choisit l outil Music');
    const regles = await p.innerText('#vox .sx-rules');
    ok(/Built-in ElevenLabs voices only/.test(regles) && /No voice cloning/.test(regles) && /No imitation of a real artist/.test(regles) && /48 h/.test(regles), 'les regles affichees : voix de la bibliotheque, pas de clonage, pas d imitation, 48 h');
    const vx = await p.$$eval('#vxVoix .vx-v b', (l) => l.map((b) => b.textContent));
    ok(vx.join() === 'Charlotte,George,Liam,Lily,Sarah', 'les voix du catalogue, la clonee absente [' + vx.join() + ']');
    await ferme(p);
  }

  console.log('\n-- 3. sans session --');
  {
    remet();
    const p = await ouvre({ suite: '#voice' });
    await p.fill('#vxTexte', 'Hello world');
    const b = await bouton(p);
    ok(b.l === 'Sign in to generate' && !b.dis, 'le bouton dit « Sign in to generate »');
    await p.click('#vxGo'); await p.waitForTimeout(200);
    eq(posts().length, 0, 'aucun POST');
    ok(S.lectures.every((e) => !e.auth) && S.lectures.some((e) => e.chemin === '/studio/son/catalogue'), 'le catalogue Voice est lu, public, sans jeton');
    await ferme(p);
  }

  console.log('\n-- 4 & 5. voix off : le prix avant le clic, une requete, le MP3 lu avec la session --');
  {
    remet();
    const p = await ouvre({ session: true, suite: '#voice' });
    let b = await bouton(p);
    ok(b.dis && /Write your script/.test(await p.textContent('#vxGoNote')), 'texte vide : bouton ferme, la page dit d ecrire');
    const texte = 'Welcome to SWOGE World. Lift heavy, stay swole — and see you at the tables.';
    await p.fill('#vxTexte', texte);
    b = await bouton(p);
    const attendu = prixVoix(texte, 'qualite');
    ok(!b.dis && b.l === 'Generate voice-over' && b.p === '$' + attendu.toFixed(4).replace(/0+$/, '').replace(/\.(\d)$/, '.$10'), 'le prix sur le bouton = celui du serveur (' + attendu + ' $) [' + b.p + ']');
    ok((await p.textContent('#vxCompte')) === texte.length + ' / 2,500 characters', 'le compte des caracteres et la borne du serveur');
    await p.click('#vxModeles [data-modele="rapide"]');
    b = await bouton(p);
    const rapide = prixVoix(texte, 'rapide');
    ok(b.p === '$' + String(rapide).replace(/^0/, '0'), 'Fast : le prix suit (' + rapide + ' $) [' + b.p + ']');
    ok(await p.isHidden('#vxLangueL'), 'Fast : pas de langue (non documentee pour ce modele)');
    await p.click('#vxModeles [data-modele="qualite"]');
    ok(await p.isVisible('#vxLangueL'), 'Quality : le choix de langue');
    await p.selectOption('#vxLangue', 'fr');
    await p.click('#vxVoix .vx-v[data-voix="EXAVITQu4vr4xnSDxMaL"]');
    /* l echantillon */
    await p.click('#vxVoix .vx-ecoute[data-voix="JBFqnCBsd6RMkjVDRZzb"]'); await p.waitForTimeout(300);
    ok(S.echantillons.includes('/george.mp3') && (await p.getAttribute('#vxVoix .vx-ecoute[data-voix="JBFqnCBsd6RMkjVDRZzb"]', 'aria-pressed')) === 'true'
       && (await p.getAttribute('#vxVoix .vx-v[data-voix="EXAVITQu4vr4xnSDxMaL"]', 'aria-checked')) === 'true', 'l echantillon de George joue (preview_url), sans changer la voix choisie (Sarah)');
    await p.click('#vxVoix .vx-ecoute[data-voix="JBFqnCBsd6RMkjVDRZzb"]');
    await p.dblclick('#vxGo');
    await p.waitForSelector('#vxScene.fini audio', { timeout: 8000 }).catch(() => {});
    const l = posts(/\/studio\/son\/voix$/);
    ok(l.length === 1, 'un double clic = UNE requete (' + l.length + ')');
    ok(l[0] && JSON.stringify(l[0].corps) === JSON.stringify({ texte, voix: 'EXAVITQu4vr4xnSDxMaL', modele: 'qualite', confirmeUsd: attendu, langue: 'fr' }) && l[0].auth === 'Bearer ' + SESSION,
      'le corps : texte, voix, modele, confirmeUsd = le prix montre, langue ; avec le jeton ' + (l[0] && l[0].brut));
    ok(!/0x7a|addr|adresse|address/i.test(l[0] ? l[0].brut : ''), 'aucune adresse dans la requete');
    ok(await p.$eval('#vxScene audio', (a) => /^blob:/.test(a.src)) && S.fichiers.length === 1 && S.fichiers[0].auth === 'Bearer ' + SESSION, 'le MP3 lu AVEC la session, joue depuis un blob:');
    const dl = await p.$eval('#vxScene a.gen', (a) => ({ href: a.getAttribute('href'), d: a.getAttribute('download') }));
    ok(/^blob:/.test(dl.href) && /^swoge-voice-aaaaaaaa\.mp3$/.test(dl.d), 'Download : le fichier lui-meme (blob:), nomme .mp3 [' + dl.d + ']');
    const [tele] = await Promise.all([p.waitForEvent('download', { timeout: 4000 }).catch(() => null), p.click('#vxScene a.gen')]);
    ok(tele && /\.mp3$/.test(tele.suggestedFilename()), 'le clic sur Download telecharge un .mp3');
    ok(/Welcome to SWOGE World/.test(await p.textContent('#vxScene')) && /Sarah|George/.test(await p.textContent('#vxScene')), 'le resultat dit ce qui a ete lu');
    ok((await p.innerText('#vxListe')).includes('Welcome to SWOGE'), 'le resultat rejoint « Your last 48 hours »');
    await ferme(p);
  }

  console.log('\n-- 4 bis. musique --');
  {
    remet({ mes: [{ id: 'c'.repeat(48), genre: 'music', t: Date.now() - 3600e3, expire: Date.now() + 47 * 3600e3, prixUsd: 0.1125, secondes: 30, titre: 'Old track', url: '/studio/son/fichier/' + 'c'.repeat(48) }] });
    const p = await ouvre({ session: true, suite: '#voice' });
    await p.click('#vxOutils [data-outil="mus"]');
    ok(await p.isVisible('#vxListe') && /Old track/.test(await p.innerText('#vxListe')), 'les resultats encore gardes (48 h) de la session sont listes');
    await p.click('#vxIdees button:first-child');
    await p.click('#vxDurees [data-duree="60"]');
    const b = await bouton(p);
    ok(b.p === '$' + CAT_ON.musique.prixUsd[60] && !b.dis, '60 s : le prix du catalogue sur le bouton [' + b.p + ']');
    await p.click('#vxGo');
    await p.waitForSelector('#vxScene.fini audio', { timeout: 8000 }).catch(() => {});
    const l = posts(/\/studio\/son\/musique$/);
    ok(l.length === 1 && JSON.stringify(l[0].corps) === JSON.stringify({ prompt: 'Upbeat synthwave for a gym montage, punchy drums, 120 bpm', secondes: 60, instrumental: true, confirmeUsd: CAT_ON.musique.prixUsd[60] }), 'le corps : prompt, secondes, instrumental, confirmeUsd ' + (l[0] && l[0].brut));
    ok(await p.$eval('#vxScene audio', (a) => /^blob:/.test(a.src)) && /Music/.test(await p.textContent('#vxScene .vx-pill')), 'la piste se joue');
    await p.click('#vxListe li:last-child button'); await p.waitForTimeout(300);
    ok(/Old track/.test(await p.textContent('#vxScene')) && S.fichiers.some((f) => f.chemin.endsWith('c'.repeat(48))), 'un ancien resultat se rouvre (relu avec la session)');
    await ferme(p);
  }

  console.log('\n-- 6. les refus du serveur, tels quels --');
  {
    remet();
    const p = await ouvre({ session: true, suite: '#voice' });
    await p.click('#vxOutils [data-outil="mus"]');
    await p.fill('#vxPrompt', 'that famous robot song');
    S.rep = { status: 422, body: { ok: false, code: 422, refus: true, raison: 'ElevenLabs refused this prompt (it may name an artist, a song or copyrighted lyrics). You were not charged.', suggestion: 'Retro electronic funk with <b>vocoder</b>' } };
    await p.click('#vxGo'); await p.waitForSelector('#vxErr:not([hidden])');
    const e = await p.innerText('#vxErr');
    ok(/refused this prompt/.test(e) && /not charged/.test(e) && /Retro electronic funk with <b>vocoder<\/b>/.test(e) && await p.$$eval('#vxErr b', (l) => l.length) === 0, 'le refus et la suggestion, en texte (rien d interprete)');
    await p.click('#vxErr .lnk');
    eq(await p.inputValue('#vxPrompt'), 'Retro electronic funk with <b>vocoder</b>', '« Use it » reprend la suggestion');
    S.rep = { status: 400, body: { ok: false, code: 400, raison: 'Describe the genre, mood, tempo and instruments instead of naming an artist or a song ("Daft Punk"). Nothing was charged.' } };
    await p.fill('#vxPrompt', 'in the style of Daft Punk'); await p.click('#vxGo'); await p.waitForTimeout(300);
    ok(/instead of naming an artist/.test(await p.innerText('#vxErr')), 'le refus d artiste du serveur, tel quel');
    S.rep = { status: 409, body: { ok: false, code: 409, raison: 'the price is now $0.1500', prixUsd: 0.15 } };
    await p.fill('#vxPrompt', 'calm piano'); await p.click('#vxGo'); await p.waitForTimeout(300);
    ok(/price changed to \$0\.15/.test(await p.innerText('#vxErr')) && /nothing was charged/.test(await p.innerText('#vxErr')), 'un prix change (409) : dit, rien debite');
    ok(!(await p.$('#vxScene.fini')), 'aucun faux resultat apres un refus');
    await ferme(p);
  }

  console.log('\n-- 7. credit trop bas --');
  {
    remet({ credit: 0.01 });
    const p = await ouvre({ session: true, suite: '#voice' });
    await p.click('#vxOutils [data-outil="mus"]'); await p.fill('#vxPrompt', 'calm piano'); await p.click('#vxDurees [data-duree="120"]');
    await p.waitForTimeout(400);
    const b = await bouton(p);
    ok(b.dis && await p.isVisible('#vxCr') && /needs \$0\.45/.test(await p.textContent('#vxCrTxt')), 'le bouton se ferme, la recharge est proposee (« needs $0.45 »)');
    eq(posts().length, 0, 'aucun POST');
    await ferme(p);
  }

  console.log('\n-- 8. 320, 390, 1280 px : pas de defilement horizontal ; langue ; console --');
  for (const w of [320, 390, 1280]) {
    remet();
    const p = await ouvre({ session: true, largeur: w, hauteur: w > 900 ? 900 : 760, mobile: w < 900, suite: '#voice' });
    for (const outil of ['vo', 'mus']) {
      await p.click('#vxOutils [data-outil="' + outil + '"]');
      if (outil === 'vo') await p.fill('#vxTexte', 'A short line for the narrator.'); else await p.fill('#vxPrompt', 'Lo-fi hip hop beat, warm vinyl crackle, relaxed');
      await p.click('#vxGo'); await p.waitForSelector('#vxScene.fini audio', { timeout: 8000 }).catch(() => {});
      const d = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        dehors: [...document.querySelectorAll('#vox *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > document.documentElement.clientWidth + 1 || r.left < -1); }).map((e) => e.id || e.className).slice(0, 4) }));
      ok(d.sw <= d.cw && d.dehors.length === 0, w + ' px, ' + (outil === 'vo' ? 'Voice-over' : 'Music') + ' : pas de defilement horizontal (' + d.sw + ' <= ' + d.cw + ')' + (d.dehors.length ? ' ' + d.dehors.join(',') : ''));
      const txt = await p.innerText('#vox');
      const m = txt.match(FR);
      ok(!m, w + ' px, ' + outil + ' : aucun texte francais visible' + (m ? ' [« ' + m[0] + ' »]' : ''));
    }
    await ferme(p);
  }
  ok(erreurs.length === 0, 'aucune erreur de page ni de console' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
