'use strict';
/* ============================================================================
 * SWOLEMIND — L'ESSAI DE RESTYLAGE : LE PROPRIETAIRE SEUL, UNE VIDEO A LA FOIS
 *
 * Demande du proprietaire, 26 septembre 2026 : « rajoute une route pour faire
 * seul, on essaie » — un clip court (anime) refait en prise de vue reelle, ou
 * l'inverse, par l'edition video de Grok Imagine, pour MESURER la qualite, le
 * cout reel et l'attente avant de construire le reste. Le serveur est simule
 * par page.route ; ce que la page DOIT tenir :
 *   1. Sans session : aucune requete, le bouton reste cache.
 *   2. Le serveur dit « pas proprietaire » : le bouton reste cache.
 *   3. Proprietaire : le bouton vit dans le mode Video, pas dans le Chat ; une
 *      session arrivee apres le chargement le fait apparaitre.
 *   4. La page lit la duree dans la boite mvhd (v0, v1, boite `free`, taille
 *      64 bits) et refuse AVANT toute requete un clip de plus de 8,7 s, de
 *      plus de 25 Mo, ou qui n'est pas un MP4 ; un MP4 fragmente (`mvex`) se
 *      lit par `mehd` seul, jamais par sa `mvhd` qui ne couvre que `moov`.
 *   5. Un clip de 5 s part en JSON avec le jeton en Authorization, sans
 *      aucune adresse, sens « reel » par defaut ; « Custom » envoie le texte.
 *   6. La progression, puis l'original (blob:) et le resultat (https) cote a
 *      cote, le cout « $0.123 for 5.0 s ($0.0246/s) » et l'attente.
 *   7. Un echec montre la raison du serveur ; le texte venu du serveur est
 *      ECHAPPE ; un resultat en javascript: n'est jamais charge.
 *   8. Rien ne deborde sur un telephone de 320 px, et les deux videos s'y
 *      empilent.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html':'text/html','.htm':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.mp4':'video/mp4' };
const CAT = { ouvert: true, note: null, monnaie: '$SWOGE', defaut: 'modele-a', efforts: ['low', 'medium', 'high'], modeles: [
  { id: 'modele-a', nom: 'Model A', note: 'Most capable', effort: true, recherche: true, typiqueSwoge: 1179, maxSwoge: 17116 }] };
const MED = { ouvert: true, videoOuverte: true,
  image: { fournisseurs: [{ id: 'grok', nom: 'Grok Imagine', actif: true, modeles: [{ id: 'rapide', nom: 'Speed', parImageSwoge: 1071 }, { id: 'qualite', nom: 'Quality (2.0)', parImageSwoge: 2142 }] }],
    modeles: [{ id: 'rapide', nom: 'Speed', parImageSwoge: 1071 }, { id: 'qualite', nom: 'Quality (2.0)', parImageSwoge: 2142 }], formats: ['auto'], nombres: [1] },
  video: { modeles: [{ id: 'rapide', nom: 'Speed', parSecondeSwoge: 2678, typiqueSwoge: 16065 }, { id: 'qualite', nom: 'Quality (1.5)', parSecondeSwoge: 4284, typiqueSwoge: 25704 }], formats: ['auto'], durees: [6, 10], resolutions: ['480p'] } };
/* Les jetons de session du faux serveur : qui est le proprietaire (AI_OWNER). */
const PROPRIO = { jOwner: true, jAutre: false };

/* ---- des MP4 synthetiques : la meme disposition de boites qu'un vrai ---- */
function boite(type, ...parts) { const c = Buffer.concat(parts); const h = Buffer.alloc(8); h.writeUInt32BE(8 + c.length, 0); h.write(type, 4, 'latin1'); return Buffer.concat([h, c]); }
function grande(type, contenu) { const h = Buffer.alloc(16); h.writeUInt32BE(1, 0); h.write(type, 4, 'latin1'); h.writeBigUInt64BE(BigInt(16 + contenu.length), 8); return Buffer.concat([h, contenu]); }
function mvhd(version, echelle, duree) {
  const c = Buffer.alloc(version === 1 ? 112 : 100);
  c.writeUInt8(version, 0);
  if (version === 1) { c.writeUInt32BE(echelle, 20); c.writeBigUInt64BE(BigInt(duree), 24); }
  else { c.writeUInt32BE(echelle, 12); c.writeUInt32BE(duree, 16); }
  return boite('mvhd', c);
}
/* ffmpeg -movflags frag_keyframe (mesure du 26/09/2026) : un clip de 12 s porte
   mvhd = 1 s (les echantillons de moov seulement) et mvex ; mehd facultative. */
function fragmente(mehdMs) {
  const ftyp = boite('ftyp', Buffer.from('isom\0\0\x02\0isomiso2avc1mp41', 'latin1'));
  const mehd = mehdMs == null ? Buffer.alloc(0) : (() => { const c = Buffer.alloc(8); c.writeUInt32BE(mehdMs, 4); return boite('mehd', c); })();
  const moov = boite('moov', mvhd(0, 1000, 1000), boite('trak', Buffer.alloc(8)), boite('mvex', mehd, boite('trex', Buffer.alloc(24))));
  return Buffer.concat([ftyp, moov, boite('moof', Buffer.alloc(16)), boite('mdat', Buffer.alloc(4096, 7))]);
}
function mp4(secondes, { version = 0, echelle = 1000, libre = false, grandMdat = false, octets = 4096 } = {}) {
  const ftyp = boite('ftyp', Buffer.from('isom\0\0\x02\0isomiso2avc1mp41', 'latin1'));
  const donnees = Buffer.alloc(octets, 7);
  const mdat = grandMdat ? grande('mdat', donnees) : boite('mdat', donnees);
  const moov = boite('moov', mvhd(version, echelle, Math.round(secondes * echelle)), boite('trak', Buffer.alloc(8)));
  return Buffer.concat([ftyp, libre ? boite('free', Buffer.alloc(32)) : Buffer.alloc(0), mdat, moov]);
}

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
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'essai-page-'));
  const F = {
    court: path.join(dossier, 'court.mp4'), long: path.join(dossier, 'long.mp4'), v1: path.join(dossier, 'v1.mp4'),
    borne: path.join(dossier, 'borne.mp4'), faux: path.join(dossier, 'faux.mp4'), gros: path.join(dossier, 'gros.mp4'),
    frag12: path.join(dossier, 'frag12.mp4'), fragSans: path.join(dossier, 'fragsans.mp4')
  };
  fs.writeFileSync(F.court, mp4(5, { libre: true }));
  fs.writeFileSync(F.long, mp4(12));
  /* v1 : echelle 1e9, 5 s = 5e9 unites, au-dela de 32 bits ; mdat en taille 64 bits. */
  fs.writeFileSync(F.v1, mp4(5, { version: 1, echelle: 1e9, grandMdat: true, libre: true }));
  fs.writeFileSync(F.borne, mp4(8.7));
  fs.writeFileSync(F.faux, fs.readFileSync(path.join(SITE, 'img/site/icone-192.png')));
  fs.writeFileSync(F.gros, mp4(5, { octets: 26 * 1024 * 1024 }));
  fs.writeFileSync(F.frag12, fragmente(12000));
  fs.writeFileSync(F.fragSans, fragmente(null));

  /* ---- le faux serveur ---- */
  const journal = [];                 /* chaque requete vers /studio/essai-montage */
  const S = { reste: 5, essais: [], suite: [], refusPost: null, injecte: null, n: 0 };
  function vue() {
    return { ok: true, proprietaire: true, reste: S.reste, parJour: 5, dureeMaxS: 8.7, octetsMax: 25 * 1024 * 1024,
      sens: ['reel', 'anime', 'libre'], essais: (S.injecte ? [S.injecte] : []).concat(S.essais), actif: true };
  }
  function route(q, url) {
    const auth = String(q.headers().authorization || '').replace(/^Bearer /, '');
    let corps = null; try { corps = JSON.parse(q.postData() || 'null'); } catch (e) {}
    journal.push({ m: q.method(), chemin: url.pathname, auth, corps, entetes: q.headers() });
    if (!(auth in PROPRIO)) return [401, { ok: false, raison: 'sign in with your wallet first' }];
    if (!PROPRIO[auth]) {
      if (q.method() === 'GET' && url.pathname === '/studio/essai-montage') return [200, { ok: true, proprietaire: false }];
      return [403, { ok: false, raison: 'owner only (AI_OWNER on the server)' }];
    }
    if (url.pathname === '/studio/essai-montage' && q.method() === 'GET') return [200, vue()];
    if (url.pathname === '/studio/essai-montage' && q.method() === 'POST') {
      if (S.refusPost) { const r = S.refusPost; S.refusPost = null; return r; }
      S.n++; S.reste--;
      S.courant = { id: 'e' + S.n + 'f'.repeat(15), sens: corps.sens, dureeS: 5 };
      S.essais.unshift(Object.assign({ statut: 'pending' }, S.courant));
      return [200, { ok: true, id: S.courant.id, status: 'pending', dureeS: 5 }];
    }
    const m = /^\/studio\/essai-montage\/([^/]+)$/.exec(url.pathname);
    if (m && q.method() === 'GET') {
      if (!S.courant || m[1] !== S.courant.id) return [404, { ok: false, raison: 'unknown test' }];
      const o = S.suite.length > 1 ? S.suite.shift() : S.suite[0];
      if (o.statut !== 'pending') S.essais[0] = Object.assign({}, S.courant, o);
      return [200, Object.assign({ ok: true, id: S.courant.id, sens: S.courant.sens, dureeS: 5 }, o)];
    }
    return [404, { ok: false, raison: 'unknown route' }];
  }

  const ouvre = async ({ session, largeur } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1200, height: 900 } });
    if (session) await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} }, session);
    const p = await ctx.newPage();
    p.on('dialog', (d) => d.accept());
    await p.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const q = r.request(), u = new URL(q.url());
      if (/^\/studio\/essai-montage(\/|$)/.test(u.pathname)) {
        const [code, o] = route(q, u);
        return r.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(o) });
      }
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
  const mode = async (p, m) => { await p.click('.mode[data-mode="' + m + '"]'); };
  const posts = () => journal.filter((x) => x.m === 'POST');
  const erreur = (p) => p.textContent('#essaiErreur');
  /* Choisit un fichier et attend la lecture de la page : la duree lue, ou le refus. */
  const lit = async (p, f) => {
    await p.evaluate(() => { document.getElementById('essaiInfo').textContent = ''; document.getElementById('essaiErreur').textContent = ''; });
    await p.setInputFiles('#essaiFichier', f);
    await p.waitForFunction(() => document.getElementById('essaiInfo').textContent || document.getElementById('essaiErreur').textContent, null, { timeout: 5000 }).catch(() => {});
    return { info: await p.textContent('#essaiInfo'), erreur: await erreur(p) };
  };

  console.log('-- 1. sans session : aucune requete, le bouton reste cache --');
  {
    journal.length = 0;
    const p = await ouvre({});
    await mode(p, 'video');
    await p.waitForTimeout(2300);   /* au moins un tour de la veille du jeton (2 s) */
    ok(!(await p.isVisible('#essaiBtn')), 'cache en mode Video');
    eq(journal.length, 0, 'aucune requete vers /studio/essai-montage');
    console.log('\n-- 3b. la session arrive apres le chargement : le serveur est consulte, le bouton apparait --');
    await p.evaluate(() => localStorage.setItem('swogeSession', 'jOwner'));
    await p.waitForSelector('#essaiBtn', { state: 'visible', timeout: 5000 }).catch(() => {});
    ok(await p.isVisible('#essaiBtn'), 'visible une fois connecte en proprietaire');
    ok(journal.length > 0 && journal.every((x) => x.m === 'GET' && x.auth === 'jOwner'), 'la verification part avec le jeton, en GET');
    await p.close();
  }

  console.log('\n-- 2. le serveur dit « pas proprietaire » : le bouton reste cache --');
  {
    journal.length = 0;
    const p = await ouvre({ session: 'jAutre' });
    await mode(p, 'video');
    await p.waitForTimeout(300);
    ok(journal.some((x) => x.m === 'GET' && x.chemin === '/studio/essai-montage' && x.auth === 'jAutre'), 'la page a demande au serveur, avec le jeton');
    ok(!(await p.isVisible('#essaiBtn')), 'cache en mode Video pour un autre portefeuille');
    ok(await p.isHidden('#essai'), 'la feuille reste fermee');
    await p.close();
  }

  console.log('\n-- 3. proprietaire : le bouton vit dans le mode Video --');
  let p = await ouvre({ session: 'jOwner' });
  {
    await mode(p, 'chat');
    ok(!(await p.isVisible('#essaiBtn')), 'cache en mode Chat');
    await mode(p, 'video');
    ok(await p.isVisible('#essaiBtn'), 'visible en mode Video');
    const ordre = await p.evaluate(() => { const b = document.getElementById('prodBtn'); return b.nextElementSibling && b.nextElementSibling.id; });
    eq(ordre, 'essaiBtn', 'juste apres « Series & Ads »');
    await p.click('#essaiBtn');
    await p.waitForSelector('#essai >> text=Tests left today');
    const t = await p.innerText('#essai');
    ok(/Owner-only test: one short clip \(8\.7 s max\) restyled by Grok Imagine video editing\. Use a clip you have the rights to\./.test(t), 'la feuille dit ce qu elle est');
    ok(/Tests left today: 5 of 5/.test(t), 'les essais restants du jour');
    eq(await p.getAttribute('#essai', 'role'), 'dialog', 'role dialog');
    eq(await p.getAttribute('#essai', 'aria-label'), 'Restyle test', 'aria-label');
  }

  console.log('\n-- 4. la page lit la duree et refuse avant toute requete --');
  {
    journal.length = 0;
    const e = (await lit(p, F.long)).erreur;
    ok(/12\.0 s/.test(e) && /8\.7 s/.test(e), 'un clip de 12 s est refuse, la duree trouvee et le maximum dits [' + e + ']');
    await p.click('.essai-lance');
    ok(/Choose an MP4 clip first/.test(await erreur(p)), 'Run test sans clip accepte : refuse dans la page');
    const f = await lit(p, F.faux);
    ok(/not an MP4/.test(f.erreur) && !f.info, 'un PNG nomme .mp4 est refuse : pas un MP4 [' + f.erreur + ']');
    const g = await lit(p, F.gros);
    ok(/too large/.test(g.erreur) && /25 MB/.test(g.erreur) && !g.info, 'un clip de 26 Mo est refuse : trop lourd, 25 Mo au plus [' + g.erreur + ']');
    const fr = await lit(p, F.frag12);
    ok(/12\.0 s/.test(fr.erreur) && /8\.7 s/.test(fr.erreur) && !fr.info, 'un MP4 fragmente de 12 s dont mvhd dit 1 s : refuse, 12 s lus dans mehd [' + (fr.erreur || fr.info) + ']');
    const fs0 = await lit(p, F.fragSans);
    ok(/not an MP4/.test(fs0.erreur) && /length could not be read/.test(fs0.erreur) && !fs0.info, 'un MP4 fragmente sans mehd : refuse, sa longueur ne se lit pas [' + (fs0.erreur || fs0.info) + ']');
    await p.click('.essai-lance');
    eq(posts().length, 0, 'aucun envoi pour ces cinq clips');
    const v1 = await lit(p, F.v1);
    ok(/ 5\.0 s /.test(v1.info) && !v1.erreur, 'mvhd v1 (duree sur 64 bits), boite free et mdat en taille 64 bits : 5,0 s lus [' + (v1.info || v1.erreur) + ']');
    const b = await lit(p, F.borne);
    ok(/ 8\.7 s /.test(b.info) && !b.erreur, '8,7 s tout juste : accepte (meme borne que le serveur) [' + (b.info || b.erreur) + ']');
    eq(posts().length, 0, 'choisir un clip n envoie rien');
  }

  console.log('\n-- 5 et 6. un clip de 5 s : envoye, suivi, puis cote a cote --');
  {
    journal.length = 0;
    S.suite = [{ statut: 'pending', progress: 40 },
      { statut: 'done', progress: 100, url: 'https://vidgen.x.ai/r1.mp4', coutUsd: 0.123, usdParSeconde: 0.0246, secondes: 42 }];
    const c = await lit(p, F.court);
    ok(/ 5\.0 s /.test(c.info) && !c.erreur, 'mvhd v0 avec une boite free : 5,0 s lus [' + (c.info || c.erreur) + ']');
    eq(await p.inputValue('#essaiSens'), 'reel', 'sens « Anime → live action » par defaut');
    ok(await p.isHidden('#essaiPrompt'), 'pas de texte libre hors Custom');
    await p.click('.essai-lance');
    await p.waitForFunction(() => /Restyling/.test(document.getElementById('essaiSuivi').textContent));
    const post = posts()[0];
    ok(post && post.auth === 'jOwner' && post.chemin === '/studio/essai-montage', 'POST avec le jeton en Authorization');
    ok(post && /application\/json/.test(post.entetes['content-type'] || ''), 'en JSON');
    eq(post && Object.keys(post.corps).sort().join(','), 'sens,video', 'le corps : la video et le sens, rien d autre');
    eq(post && post.corps.sens, 'reel', 'sens reel');
    ok(post && /^data:video\/mp4;base64,/.test(post.corps.video), 'la video en data URL video/mp4');
    ok(post && Buffer.from(post.corps.video.split(',')[1], 'base64').equals(fs.readFileSync(F.court)), 'les octets exacts du fichier choisi');
    ok(post && !/0x[0-9a-f]{40}/i.test(JSON.stringify(Object.assign({}, post.corps, { video: '' })) + JSON.stringify(post.entetes)), 'aucune adresse, ni dans le corps ni dans les en-tetes');
    ok(await p.isDisabled('.essai-lance'), 'Run test bloque tant que l essai tourne');
    await p.waitForFunction(() => /40%/.test(document.getElementById('essaiSuivi').textContent), null, { timeout: 8000 });
    ok(true, 'la progression du serveur est montree (40%)');
    await p.waitForSelector('#essaiSuivi .essai-resultat video', { timeout: 9000 });
    const v = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#essaiSuivi video'), (x) => ({ src: x.getAttribute('src'), controls: x.controls })));
    eq(v.length, 2, 'deux videos');
    ok(/^blob:/.test(v[0].src) && v[0].controls, 'l original : le fichier choisi, en blob:');
    ok(v[1].src === 'https://vidgen.x.ai/r1.mp4' && v[1].controls, 'le resultat : le lien https du serveur');
    const duo = await p.evaluate(() => { const f = document.querySelectorAll('.essai-duo figure'); const a = f[0].getBoundingClientRect(), b = f[1].getBoundingClientRect(); return { memeLigne: Math.abs(a.top - b.top) < 2 && b.left > a.left }; });
    ok(duo.memeLigne, 'cote a cote sur un ecran large');
    const s = await p.innerText('#essaiSuivi');
    ok(s.includes('$0.123 for 5.0 s ($0.0246/s)'), 'le cout, sa duree et le cout par seconde [' + s.replace(/\n/g, ' | ') + ']');
    ok(/42 s/.test(s), 'l attente');
    await p.waitForFunction(() => /Tests left today: 4 of 5/.test(document.getElementById('essaiReste').textContent), null, { timeout: 4000 });
    ok(true, 'les essais restants relus apres l essai');
    const l = await p.innerText('#essaiListe');
    ok(/Anime → live action/.test(l) && /5\.0 s/.test(l) && /\$0\.0246\/s/.test(l) && /done/.test(l), 'la liste des essais : sens, duree, cout par seconde, statut [' + l.replace(/\n/g, ' | ') + ']');
    ok(!(await p.isDisabled('.essai-lance')), 'Run test de nouveau disponible');
  }

  console.log('\n-- 7. Custom, echec, echappement, javascript: --');
  {
    journal.length = 0;
    await p.selectOption('#essaiSens', 'libre');
    ok(await p.isVisible('#essaiPrompt'), 'Custom montre le texte libre');
    eq(await p.getAttribute('#essaiPrompt', 'maxlength'), '1000', '1000 caracteres au plus');
    await p.click('.essai-lance');
    ok(/Write your instruction first/.test(await erreur(p)), 'Custom sans texte : refuse dans la page');
    eq(posts().length, 0, 'et rien n est parti');
    await p.fill('#essaiPrompt', 'Make it a 1970s kung fu film, same shots.');
    S.suite = [{ statut: 'failed', erreur: '<img src=x onerror="window.pirate=1">xAI refused: content policy' }];
    await p.click('.essai-lance');
    await p.waitForSelector('#essaiSuivi .essai-raison', { timeout: 9000 });
    const post = posts()[0];
    ok(post && post.corps.sens === 'libre' && post.corps.prompt === 'Make it a 1970s kung fu film, same shots.', 'Custom envoie son texte, sens libre');
    const r = await p.textContent('#essaiSuivi .essai-raison');
    ok(r.includes('<img src=x onerror="window.pirate=1">xAI refused: content policy'), 'la raison du serveur est montree telle quelle, en texte');
    ok(!(await p.evaluate(() => window.pirate)) && (await p.$('#essaiSuivi img')) === null, 'et jamais interpretee comme du HTML');

    journal.length = 0;
    await p.selectOption('#essaiSens', 'anime');
    ok(await p.isHidden('#essaiPrompt'), 'hors Custom, le texte libre se cache');
    S.suite = [{ statut: 'done', url: 'javascript:alert(1)', coutUsd: 0.2, usdParSeconde: 0.04, secondes: 30 }];
    S.injecte = { id: 'x', sens: '<b id="gras">x</b>', dureeS: 3, statut: 'done', usdParSeconde: 0.05, url: 'javascript:alert(2)' };
    await p.click('.essai-lance');
    await p.waitForSelector('#essaiSuivi .essai-cout', { timeout: 9000 });
    eq(posts()[0] && posts()[0].corps.sens, 'anime', 'Live action → anime : sens anime');
    ok(posts()[0] && !('prompt' in posts()[0].corps), 'un sens prefait n envoie pas de texte libre');
    await p.waitForFunction(() => /<b id="gras">/.test(document.getElementById('essaiListe').textContent), null, { timeout: 4000 });
    const x = await p.evaluate(() => ({
      videoJs: Array.prototype.some.call(document.querySelectorAll('#essai video'), (v) => /^javascript:/i.test(v.getAttribute('src') || '')),
      lienJs: Array.prototype.some.call(document.querySelectorAll('#essai a'), (a) => /^javascript:/i.test(a.getAttribute('href') || '')),
      resultat: document.querySelectorAll('#essaiSuivi .essai-resultat video').length,
      gras: !!document.getElementById('gras') }));
    ok(!x.videoJs && !x.lienJs && x.resultat === 0, 'un resultat en javascript: n est ni joue ni lie');
    ok(!x.gras, 'un sens en HTML venu du serveur reste du texte');
    ok(/No playable https link/.test(await p.innerText('#essaiSuivi')), 'la page le dit');
    S.injecte = null;

    journal.length = 0;
    S.refusPost = [429, { ok: false, raison: 'One test at a time: wait for the current one to finish.' }];
    await p.click('.essai-lance');
    await p.waitForFunction(() => /One test at a time/.test(document.getElementById('essaiErreur').textContent));
    ok(true, 'un refus du serveur (429) est montre tel quel');
    await p.click('#fermerEssai');
    ok(await p.isHidden('#essai'), 'la feuille se ferme');
    await p.close();
  }

  console.log('\n-- 8. sur 320 px --');
  {
    p = await ouvre({ session: 'jOwner', largeur: 320 });
    await mode(p, 'video');
    const deb0 = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(await p.isVisible('#essaiBtn') && deb0 <= 0, 'le bouton en mode Video tient dans 320 px [' + deb0 + ']');
    await p.click('#essaiBtn');
    await p.waitForSelector('#essai >> text=Tests left today');
    S.suite = [{ statut: 'done', url: 'https://vidgen.x.ai/r9.mp4', coutUsd: 0.1, usdParSeconde: 0.02, secondes: 12 }];
    ok(/ 5\.0 s /.test((await lit(p, F.court)).info), 'le clip lu sur un telephone');
    await p.selectOption('#essaiSens', 'libre');
    await p.fill('#essaiPrompt', 'x'.repeat(1000));
    const deb1 = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(deb1 <= 0, 'le formulaire tient dans 320 px [' + deb1 + ']');
    await p.click('.essai-lance');
    await p.waitForSelector('#essaiSuivi .essai-resultat video', { timeout: 9000 });
    const deb2 = await p.evaluate(() => {
      const f = document.querySelectorAll('.essai-duo figure'), fe = document.querySelector('#essai .feuille');
      return { deb: document.documentElement.scrollWidth - window.innerWidth, feuille: fe.scrollWidth - fe.clientWidth,
        empile: f[1].getBoundingClientRect().top >= f[0].getBoundingClientRect().bottom - 1 };
    });
    ok(deb2.deb <= 0 && deb2.feuille <= 0, 'le resultat tient dans 320 px [' + JSON.stringify(deb2) + ']');
    ok(deb2.empile, 'l original et le resultat s empilent');
    await p.close();
  }

  await nav.close(); srv.close();
  fs.rmSync(dossier, { recursive: true, force: true });
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
