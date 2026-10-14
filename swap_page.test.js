'use strict';
/* ============================================================================
 * SWOGE_CINEMA.HTML — « PUT SWOGE IN ANY VIDEO » (SWOGE Swap, 14/10/2026)
 *
 * Le serveur est simule par page.route ; ce que la page DOIT tenir :
 *   1. La section est la, en anglais, avec ses trois etapes ; rien n'est demande
 *      au serveur avant qu'elle approche de l'ecran ; deconnecte, le bouton
 *      ouvre la connexion de stakebubble (window.swogeConnexion).
 *   2. Connecte : les bornes et le prix par seconde viennent du serveur ;
 *      « Upload » reste ferme sans video ET sans la case ; une video plus grosse
 *      que la borne est refusee AVANT envoi.
 *   3. L'envoi : la video BRUTE (video/mp4, octet pour octet), le jeton,
 *      `x-swap-rights: yes` — aucune adresse.
 *   4. Le plan : le prix du serveur, le personnage (vignette du site), les
 *      quatre cibles ; credit trop bas : pas de « Run », le manque dit et la
 *      recharge (montants des bornes du serveur, Base/Solana, SOL/USDT) ; le
 *      credit suffisant : « Run — $x » renvoie { personnage, cible, confirmeUsd }
 *      et RIEN d'autre (ni image, ni texte, ni adresse).
 *   5. La file (rang, annuler), une part ratee (relance gratuite), « Finish
 *      now » ; la fin : la video lue AVEC la session (blob:), « Download »
 *      seulement alors, le prix facture et le rendu dits.
 *   6. Une passe en cours reprend apres un rechargement ; 320 et 390 px sans
 *      defilement en largeur ; aucune erreur dans la page.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
const ID = 'a'.repeat(24);

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'swap-page-'));
  const F = { video: path.join(dossier, 'clip.mp4'), gros: path.join(dossier, 'gros.mp4') };
  const VIDEO = Buffer.from(Array.from({ length: 300000 }, (_, i) => (i * 37) & 255));
  fs.writeFileSync(F.video, VIDEO);
  fs.writeFileSync(F.gros, Buffer.alloc(3 * 1024 * 1024, 1));

  /* ---- le faux serveur ---- */
  const journal = [];
  const S = { passe: null, credit: 2, suite: [] };
  const CIBLES = [{ id: 'chante', nom: 'The person singing / talking' }, { id: 'gauche', nom: 'The person on the left' }, { id: 'droite', nom: 'The person on the right' }, { id: 'tous', nom: 'Everyone' }];
  const VUE = { ok: true, actif: true, dureeMinS: 3, dureeMaxS: 60, octetsMax: 2 * 1048576, resolution: '720p', prixParSecondeUsd: 0.252, partMaxS: 9.5, passesMax: 2, enFile: 0, occupees: 0,
    ouvertAujourdhui: true, relancesGratuites: 1, gardeH: 48, droitsTexte: 'I own this video or have the right to use it, and it shows no one who did not agree to it.',
    personnages: [{ id: 'swoge', nom: 'SWOGE', vignette: '/img/site/swoge_face_ref.jpg' }], cibles: CIBLES };
  const parts = (statuts, o) => statuts.map((s, i) => Object.assign({ i, debut: i * 7, duree: 7, statut: s, message: s === 'failed' ? 'Kling failed: content risk' : s === 'original' ? 'kept the original footage here — this part is refunded' : null,
    essais: 1, rejouable: s === 'failed', relanceGratuite: s === 'failed' }, o || {}));
  const etat = (statut, o) => Object.assign({ ok: true, id: ID, statut, message: null, source: { duree: 14, largeur: 720, hauteur: 1280, fps: 30, son: true }, fps: 30,
    morceaux: parts(['planned', 'planned']), scenes: 1, prixPire: null, resolution: null, prixUsd: 3.53, video: null, droits: true, file: null, paiement: null }, o || {});
  function route(q, url) {
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    let corps = null; try { corps = JSON.parse(q.postData() || 'null'); } catch (e) {}
    journal.push({ m: q.method(), chemin: url.pathname, auth, corps, brut: q.postDataBuffer(), type: q.headers()['content-type'], droits: q.headers()['x-swap-rights'] });
    if (url.pathname === '/studio/swap' && q.method() === 'GET') return [200, Object.assign({}, VUE, { connecte: auth === 'jJoueur', passe: auth === 'jJoueur' ? S.passe : null })];
    if (auth !== 'jJoueur') return [401, { ok: false, raison: 'sign in with your wallet first' }];
    if (url.pathname === '/credit' && q.method() === 'GET') return [200, { ok: true, balanceUsd: S.credit, limits: { minUsd: 0.1, maxUsd: 50 }, networks: { base: true, solana: true }, history: [] }];
    if (url.pathname === '/studio/swap' && q.method() === 'POST') { S.passe = ID; return [200, { ok: true, id: ID, statut: 'decoupe' }]; }
    if (url.pathname === '/studio/swap/' + ID && q.method() === 'GET') { const o = S.suite.length > 1 ? S.suite.shift() : S.suite[0]; return [200, o]; }
    if (url.pathname === '/studio/swap/' + ID + '/lance' && q.method() === 'POST') return [200, etat('file', { file: 2, morceaux: parts(['waiting', 'waiting']), paiement: { reserveUsd: 3.53 } })];
    if (url.pathname === '/studio/swap/' + ID + '/reessaie/1' && q.method() === 'POST') return [200, etat('en_cours', { morceaux: parts(['done', 'processing']) })];
    if (url.pathname === '/studio/swap/' + ID + '/termine' && q.method() === 'POST') return [200, etat('assemblage', { morceaux: parts(['done', 'original']) })];
    if (url.pathname === '/studio/swap/' + ID + '/abandonne' && q.method() === 'POST') return [200, etat('abandon', { message: 'cancelled — you were fully refunded' })];
    return [404, { ok: false, raison: 'unknown' }];
  }
  const ouvre = async ({ largeur, connecte, hash } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1280, height: 900 } });
    /* aucune socket : stakebubble parlerait au vrai serveur, qui refuserait le faux jeton (resumeFailed) et l'effacerait */
    await ctx.addInitScript(() => { window.WebSocket = function(){ return { addEventListener(){}, removeEventListener(){}, send(){}, close(){}, readyState: 0 }; }; });
    if (connecte !== false) await ctx.addInitScript(() => { try { localStorage.setItem('swogeSession', 'jJoueur'); } catch (e) {} });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { journal.push({ erreurPage: String(e) }); });
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const q = r.request(), u = new URL(q.url());
      if (u.pathname === '/studio/swap/' + ID + '/video') {
        const auth = String(q.headers().authorization || '');
        journal.push({ m: 'GET', chemin: u.pathname, auth: auth.replace(/^Bearer /, '') });
        return auth === 'Bearer jJoueur' ? r.fulfill({ status: 200, contentType: 'video/mp4', body: VIDEO }) : r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
      }
      if (/^\/studio\/swap(\/|$)/.test(u.pathname) || u.pathname === '/credit') { const [code, o] = route(q, u); return r.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(o) }); }
      return r.abort();
    });
    await p.goto('http://127.0.0.1:' + port + '/swoge_cinema.html' + (hash || ''), { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(500);
    return p;
  };
  const appels = (chemin, m) => journal.filter((x) => x.chemin === chemin && (!m || x.m === m));
  const attend = (p, f, arg, ms) => p.waitForFunction(f, arg, { timeout: ms || 15000 }).catch(() => {});
  const debord = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  console.log('-- 1. la section, deconnecte --');

  const p0 = await ouvre({ connecte: false });
  ok(await p0.textContent('#swTitre') === 'Put SWOGE in any video' && (await p0.$$('#swEtapes li')).length === 3 && /Upload/.test(await p0.textContent('#swEtapes')) && /Plan & price/.test(await p0.textContent('#swEtapes')) && /Run/.test(await p0.textContent('#swEtapes')),
     'le titre et les trois etapes (Upload, Plan & price, Run)');
  ok(appels('/studio/swap').length === 0 && appels('/credit').length === 0, 'rien n est demande au serveur tant que la section est loin de l ecran');
  ok(await p0.getAttribute('#versSwap', 'href') === '#swap', 'le heros mene a la section');
  await p0.$eval('#swap', (s) => s.scrollIntoView());
  await attend(p0, () => /per second/.test(document.getElementById('swParSec').parentNode.textContent) && document.getElementById('swParSec').textContent !== '—');
  const g0 = appels('/studio/swap', 'GET')[0] || {};
  ok(g0.auth === '' && await p0.textContent('#swParSec') === '$0.252' && /3 to 60 seconds, up to 2 MB/.test(await p0.textContent('#swBornes')), 'a l approche : GET /studio/swap sans jeton ; 0,252 $/s et les bornes du serveur');
  ok(await p0.textContent('#swEnvoie') === 'Sign in to start' && await p0.isEnabled('#swEnvoie'), 'deconnecte : « Sign in to start »');
  await p0.evaluate(() => { window.__connexion = 0; window.swogeConnexion = { ouvre: function(){ window.__connexion++; } }; });
  await p0.click('#swEnvoie');
  ok(await p0.evaluate(() => window.__connexion) === 1 && appels('/studio/swap', 'POST').length === 0, 'le clic ouvre la connexion de stakebubble, rien n est envoye');
  const texte = await p0.textContent('#swap');
  ok(!/[éèàçù]|\b(la|le|les|une|des|vidéo)\b/i.test(texte.replace(/SWOGE/g, '')) && /Only our own characters: no uploaded faces, no custom prompts\./.test(texte), 'tout le texte est en anglais ; la regle des personnages est dite');
  await p0.context().close();

  console.log('\n-- 2. connecte : la case, la taille --');
  const p = await ouvre({ hash: '#swap' });
  await attend(p, () => document.getElementById('swParSec').textContent !== '—');
  ok(appels('/studio/swap', 'GET').some((x) => x.auth === 'jJoueur') && appels('/credit', 'GET').length >= 1, 'avec #swap : la vue et le credit lus tout de suite, avec le jeton');
  ok(await p.textContent('#swEnvoie') === 'Upload and get the price' && await p.isDisabled('#swEnvoie'), 'sans video : Upload ferme');
  await p.setInputFiles('#swFichier', F.gros);
  ok(/3\.0 MB — 2 MB at most/.test(await p.textContent('#swStatut')) && await p.isDisabled('#swEnvoie'), 'plus que la borne du serveur : refuse avant envoi');
  await p.setInputFiles('#swFichier', F.video);
  ok(await p.isDisabled('#swEnvoie'), 'une video sans la case : toujours ferme');
  await p.check('#swDroits');
  ok(await p.isEnabled('#swEnvoie') && /no one who did not agree/.test(await p.textContent('#swDroitsTxt')), 'la case cochee (texte du serveur) : Upload s ouvre');

  console.log('\n-- 3. l envoi --');
  S.suite = [etat('decoupe', { morceaux: [] }), etat('pret')];
  await p.click('#swEnvoie');
  await attend(p, () => !document.getElementById('swPas2').hidden);
  const up = appels('/studio/swap', 'POST')[0] || {};
  ok(up.auth === 'jJoueur' && up.type === 'video/mp4' && up.droits === 'yes' && up.brut && up.brut.equals(VIDEO), 'la video part BRUTE (video/mp4, octet pour octet), avec le jeton et x-swap-rights: yes');

  console.log('\n-- 4. le plan, le prix, le credit --');
  ok(await p.textContent('#swPrix') === '$3.53' && /2 parts · 14\.0 s · 720p/.test(await p.textContent('#swPrixInfo')), 'le prix du serveur (3,53 $), 2 parts, 14 s, 720p');
  const perso = await p.$$eval('#swPersos button', (l) => l.map((b) => ({ t: b.textContent, src: (b.querySelector('img') || {}).getAttribute ? b.querySelector('img').getAttribute('src') : null, on: b.getAttribute('aria-pressed') })));
  ok(perso.length === 1 && perso[0].t === 'SWOGE' && perso[0].src === 'img/site/swoge_face_ref.jpg' && perso[0].on === 'true', 'SWOGE choisi, sa vignette du site');
  ok((await p.$$eval('#swCibles button', (l) => l.map((b) => b.textContent))).join('|') === CIBLES.map((c) => c.nom).join('|'), 'les quatre cibles du serveur');
  ok(!(await p.isVisible('#swLance')) && await p.isVisible('#swRecharge') && /You need \$1\.53 more/.test(await p.textContent('#swManque')) && /Your dollar credit: \$2\.00/.test(await p.textContent('#swCredit')),
     'credit de 2 $ : pas de Run ; il manque 1,53 $ ; « Top up your credit »');
  await p.click('#swRecharge');
  ok(await p.isVisible('#swRc') && (await p.$$eval('#swRcMontants button', (l) => l.map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')))).join() === '$2*,$5,$20'
     && await p.textContent('#swRcSign') === 'Sign a $2 top-up' && (await p.$$('#swRc [data-net]')).length === 2 && await p.isVisible('#swRc .cdp-ouvre'), 'la recharge : 2 $ (le manque arrondi), 5, 20 ; Base/Solana ; SOL/USDT');
  ok(await debord(p) <= 0, 'feuille de recharge : aucun debord');
  await p.click('#swRcClose');
  S.credit = 10;
  await p.evaluate(() => window.dispatchEvent(new CustomEvent('swoge:credit', { detail: { balanceUsd: 10 } })));
  await attend(p, () => !document.getElementById('swLance').hidden);
  ok(await p.isVisible('#swLance') && await p.textContent('#swLance') === 'Run — $3.53' && !(await p.isVisible('#swRecharge')), 'credit de 10 $ : « Run — $3.53 »');
  await p.click('#swCibles button[data-cible="tous"]');
  S.suite = [etat('file', { file: 2, morceaux: parts(['waiting', 'waiting']) })];
  await p.click('#swLance');
  await attend(p, () => /position 2/.test(document.getElementById('swStatut').textContent));
  const la = appels('/studio/swap/' + ID + '/lance', 'POST')[0] || {};
  ok(la.auth === 'jJoueur' && JSON.stringify(la.corps) === JSON.stringify({ personnage: 'swoge', cible: 'tous', confirmeUsd: 3.53 }), 'Run envoie { personnage, cible, confirmeUsd } et rien d autre ' + JSON.stringify(la.corps));

  console.log('\n-- 5. la file, une part ratee, la fin --');
  ok(/In the queue: position 2/.test(await p.textContent('#swStatut')) && await p.isVisible('#swAnnule') && await p.isHidden('#swPas2'), 'la file : le rang, « Cancel and refund »');
  S.suite = [etat('incomplet', { message: 'some parts failed — retry each one once for free, or finish now with the original footage there (those parts are refunded)', morceaux: parts(['done', 'failed']) })];
  await attend(p, () => document.querySelectorAll('#swGrille .swq-part.failed button').length === 1, null, 20000);
  ok(await p.textContent('#swGrille .swq-part.failed button') === 'Retry part 2 (free)' && await p.isVisible('#swFinir'), 'une part ratee : « Retry part 2 (free) » et « Finish now »');
  S.suite = [etat('en_cours', { morceaux: parts(['done', 'processing']) })];
  await p.click('#swGrille .swq-part.failed button');
  await p.waitForTimeout(300);
  ok(appels('/studio/swap/' + ID + '/reessaie/1', 'POST').length === 1, 'la relance gratuite part (POST reessaie/1)');
  S.suite = [etat('incomplet', { morceaux: parts(['done', 'failed'], { relanceGratuite: false, rejouable: false }) })];
  await attend(p, () => !document.getElementById('swFinir').hidden, null, 20000);
  ok(!(await p.$('#swGrille .swq-part.failed button')), 'la relance deja prise : plus de bouton de relance');
  S.suite = [etat('assemblage', { morceaux: parts(['done', 'original']) }), etat('fini', { morceaux: parts(['done', 'original']), video: '/studio/swap/' + ID + '/video',
    paiement: { reserveUsd: 3.53, factureUsd: 1.77, renduUsd: 1.76 }, dureeFinale: 14 })];
  ok(!(await p.isVisible('#swTelecharge')), 'pas de « Download » avant le resultat');
  await p.click('#swFinir');
  ok(appels('/studio/swap/' + ID + '/termine', 'POST').length === 1, '« Finish now » : POST termine');
  await attend(p, () => /^blob:/.test(document.getElementById('swVideo').src), null, 25000);
  const vid = appels('/studio/swap/' + ID + '/video');
  ok(/^blob:/.test(await p.getAttribute('#swVideo', 'src')) && vid.length >= 1 && vid.every((x) => x.auth === 'jJoueur'), 'la video lue AVEC la session (blob:)');
  ok(await p.isVisible('#swTelecharge') && /^blob:/.test(await p.getAttribute('#swTelecharge', 'href')) && await p.getAttribute('#swTelecharge', 'download') === 'swoge_swap.mp4', '« Download » apparait alors (blob, swoge_swap.mp4)');
  ok(/Charged \$1\.77 \(\$1\.76 refunded\)/.test(await p.textContent('#swStatut')) && /only your wallet/.test(await p.textContent('#swStatut')), 'facture et rendu dits ; « only your wallet can open it »');
  ok(await p.textContent('#swGrille .swq-part.original b') === 'Part 2 · original kept (refunded)', 'la part gardee d origine est dite rendue');
  const corpsEnvoyes = journal.filter((x) => x.m === 'POST' && x.corps).map((x) => JSON.stringify(x.corps)).join(' ');
  ok(!/0x[0-9a-f]{40}|"addr"|"images"|"prompt"/i.test(corpsEnvoyes), 'aucune adresse, image ni texte dans aucun corps envoye');
  await p.context().close();

  console.log('\n-- 6. la reprise, les petits ecrans --');
  S.passe = ID; S.suite = [etat('en_cours', { morceaux: parts(['done', 'processing']) })];
  for (const largeur of [320, 390]) {
    const q = await ouvre({ largeur, hash: '#swap' });
    await attend(q, () => document.querySelectorAll('#swGrille .swq-part').length === 2);
    ok(/1 of 2 parts done/.test(await q.textContent('#swStatut')) && await q.isHidden('#swPas1'), largeur + ' px : la passe en cours reprend au rechargement');
    ok(await debord(q) <= 0, largeur + ' px : aucun defilement en largeur (suivi)');
    await q.context().close();
  }
  S.passe = null; S.credit = 2; S.suite = [etat('pret')];
  for (const largeur of [320, 390]) {
    const q = await ouvre({ largeur, hash: '#swap' });
    S.passe = ID;
    await q.evaluate(() => window.dispatchEvent(new CustomEvent('swoge:credit')));
    await q.setInputFiles('#swFichier', F.video); await q.check('#swDroits'); await q.click('#swEnvoie');
    await attend(q, () => !document.getElementById('swPas2').hidden);
    ok(await debord(q) <= 0 && await q.isVisible('#swRecharge'), largeur + ' px : le plan et la recharge sans debord');
    const gouttiere = await q.$eval('#swap', (s) => s.getBoundingClientRect().left);
    ok(gouttiere >= 16 - 0.5, largeur + ' px : gouttiere de ' + gouttiere + ' px');
    S.passe = null;
    await q.context().close();
  }
  ok(!journal.some((x) => x.erreurPage), 'aucune erreur dans la page' + (journal.filter((x) => x.erreurPage).map((x) => ' [' + x.erreurPage + ']').join('')));

  await nav.close(); srv.close();
  fs.rmSync(dossier, { recursive: true, force: true });
  console.log('\nswap_page.test.js : ' + n + ' verifications' + (rates ? ', RATES : ' + rates + '/' + n : ', tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
