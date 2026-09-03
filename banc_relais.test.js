/* LE RELAIS ENTRE LE PORTEFEUILLE ET LE BANC
 *
 * ---- pourquoi cet essai existe ----
 *
 * Le portefeuille a gagne un sixieme geste : « Bench ». Il n'y a PAS un
 * deuxieme moteur dedans, et c'est deliberé — deux copies d'un code qui
 * deplace de l'argent, c'est l'une des deux qui derive en silence. Ce que le
 * portefeuille fait, c'est tout ce qui vient AVANT : choisir les options,
 * creer le wallet maitre, et le remplir en UNE signature depuis le compte
 * deja connecte.
 *
 * Donc tout tient a un relais : deux pages, meme origine, et le stockage
 * local entre les deux. Un relais est exactement le genre de chose qui casse
 * sans bruit. Le portefeuille ecrirait sous une forme, le banc en lirait une
 * autre, et l'ecran dirait « master wallet ready » des deux cotes en
 * designant deux cles differentes. Personne ne le verrait avant d'y avoir
 * envoye de l'argent.
 *
 * Trois choses sont donc verifiees ici, et ce sont trois pertes d'argent
 * possibles :
 *
 *   1. La cle creee dans le portefeuille est bien celle que le banc reprend.
 *      Sinon l'ETH part sur une adresse que le banc ne pourra jamais balayer.
 *
 *   2. Ecrire ce maitre n'efface pas les wallets de l'anneau deja sur
 *      l'appareil. Le filet est partage ; l'ecraser rendrait cent cles
 *      inaccessibles d'un seul clic.
 *
 *   3. Les options choisies avant arrivent vraiment, et ne sont appliquees
 *      qu'UNE fois. Un plan qui se rejoue defairait, a chaque rechargement,
 *      le reglage que l'utilisateur vient de changer dans le banc.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const SITE = __dirname;
const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const ETHERS = path.join(SERVEUR, 'node_modules/ethers/dist/ethers.umd.min.js');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('banc_relais.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(ETHERS)) {
  console.log('banc_relais.test.js : ethers introuvable sur le disque — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
            '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.json': 'application/json' };

process.on('unhandledRejection', (e) => {
  console.log('  RATE essai interrompu : ' + (e && e.message ? e.message : e));
  process.exit(1);
});

/* Un jeton de test qui n'est celui d'aucune page : s'il apparait dans le
   banc, il ne peut venir que du portefeuille. */
const JETON = '0x1111111111111111111111111111111111111111';

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;
  const base = 'http://127.0.0.1:' + port;

  const nav = await chromium.launch();
  /* Meme contexte pour les deux pages : sans ca elles n'ont pas le meme
     stockage local, et le relais qu'on teste n'existe pas. */
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const pg = await ctx.newPage();

  const boum = [];
  pg.on('pageerror', (e) => boum.push(e.message));
  pg.on('dialog', (d) => d.accept());
  /* Rien du dehors : ni CDN, ni RPC public. Un essai qui parle d'un relais
     local ne doit pas dependre d'Internet. */
  /* L'ORDRE COMPTE : Playwright donne la main a la DERNIERE route posee. Le
     filet « tout le dehors » va donc en premier, et la copie d'ethers apres —
     sinon la bibliotheque tombait dans le filet et la page repartait sans
     elle, `ethers is not defined`. */
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({
    status: 500, contentType: 'application/json',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'banc: hors ligne' } }) }));
  await pg.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await pg.route('**/ethers*.js', (r) => r.fulfill({
    contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
  await pg.route('**/ethers*.umd.min.js', (r) => r.fulfill({
    contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));

  /* ---- 1. DEUX WALLETS DE L'ANNEAU SONT DEJA SUR L'APPAREIL ----
     C'est la situation dangereuse : quelqu'un a deja fait tourner le banc.
     Creer un maitre depuis le portefeuille ne doit rien leur faire. */
  await pg.goto(base + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
  await pg.evaluate(() => {
    localStorage.setItem('wallet_bench_secours_v1', JSON.stringify({
      t: 1, n: 2, l: [
        { a: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', k: '0x' + '11'.repeat(32), h: true, m: false },
        { a: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', k: '0x' + '22'.repeat(32), h: true, m: false },
      ] }));
  });
  await pg.reload({ waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2200);

  console.log('\n-- le geste existe et mene quelque part --');
  const geste = await pg.evaluate(() => {
    const b = document.querySelector('#pied [data-va="ecBanc"], [data-va="ecBanc"]');
    return b ? (b.querySelector('.t') || {}).textContent : null;
  });
  ok(geste !== null, 'le portefeuille a un bouton vers le banc (' + geste + ')');

  await pg.evaluate(() => document.querySelector('[data-va="ecBanc"]').click());
  await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => getComputedStyle(document.getElementById('ecBanc')).display) !== 'none',
     'et il ouvre l ecran du banc');

  /* ---- UNE ETAPE A LA FOIS ----
   * DEMANDE : « on ne sait pas quoi faire tellement il y a de choses ». Ce qui
   * est verifie n'est pas qu'il y ait moins de reglages, c'est qu'il n'y en
   * ait qu'UN d'ouvert : c'est ca qui dit par ou commencer. */
  console.log('\n-- une seule etape est ouverte a la fois --');
  const pas = () => pg.evaluate(() => ['bcPas1', 'bcPas2', 'bcPas3', 'bcPas4']
    .filter((k) => (document.getElementById(k) || {}).open));
  const p0 = await pas();
  console.log('   ouvertes : ' + JSON.stringify(p0));
  ok(p0.length === 1 && p0[0] === 'bcPas1',
     'a l ouverture, seule l etape 1 est depliee (' + JSON.stringify(p0) + ') : il y a exactement '
     + 'une chose a faire, et elle est a l ecran');

  console.log('\n-- on choisit un mode, et le nombre de wallets suit tout seul --');
  /* DEMANDE : « le nombre de wallets cachés est auto selon l'option ». On le
     choisit donc comme un humain le ferait — en touchant la tuile — et on
     verifie que le champ se remplit sans que personne l'ait tape. */
  const auto = await pg.evaluate(() => {
    const out = {};
    for (const v of ['organique', 'volume', 'tx', 'holders']) {
      document.querySelector('input[name="bcmode"][value="' + v + '"]').click();
      out[v] = document.getElementById('bcN').value;
    }
    return out;
  });
  console.log('   ' + JSON.stringify(auto));
  ok(Object.values(auto).every((n) => parseInt(n, 10) >= 2 && parseInt(n, 10) <= 100),
     'chaque mode pose lui-meme un nombre de portefeuilles tenable (' + JSON.stringify(auto) + ')');
  ok(new Set(Object.values(auto)).size > 1,
     'et ce n est pas le meme pour tous : le chiffre DECOULE du mode, sinon le rendre automatique '
     + 'ne serait qu une facon de le cacher');
  const dits = await pg.evaluate(() => [...document.querySelectorAll('.wl-tuile-c .n')]
    .map((e) => e.textContent.trim()));
  ok(dits.length === 4 && dits.every((t) => /^\d+$/.test(t)),
     'et chaque tuile ECRIT son chiffre : ce nombre change ce que la machine fait et ce'
     + ' qu elle coute. On cesse de le demander, on ne le cache pas — mais le mot « wallets »'
     + ' repete quatre fois sous un titre qui le dit deja, lui, est parti');
  await pg.evaluate((jeton) => {
    document.querySelector('input[name="bcmode"][value="volume"]').click();
    document.getElementById('bcTok').value = jeton;
  }, JETON);
  /* Le nombre n'est plus tape : il DECOULE du mode. On lit donc ce que le mode
     a pose, et c'est lui qu'on suivra jusque dans le banc. */
  const N_VOLUME = await pg.evaluate(() => document.getElementById('bcN').value);
  const p1 = await pas();
  console.log('   apres le choix, ouvertes : ' + JSON.stringify(p1));
  ok(p1.length === 1 && p1[0] === 'bcPas2',
     'choisir replie l etape 1 et ouvre la suivante (' + JSON.stringify(p1) + ') : on ne cherche '
     + 'pas ou cliquer ensuite');
  ok(await pg.evaluate(() => document.getElementById('bcVu1').textContent.trim()) !== '',
     'et l etape repliee garde une ligne qui dit ce qui a ete choisi ('
     + (await pg.evaluate(() => document.getElementById('bcVu1').textContent.trim())) + ')');

  console.log('\n-- creer le maitre --');
  ok(await pg.evaluate(() => document.getElementById('bcCreer').hidden) === false,
     'le bouton « Create the master wallet » est propose');
  /* Le clic telecharge la cle ; sans ce guetteur, Playwright annule le
     telechargement et l'essai ne saurait pas s'il a eu lieu. */
  const attend = pg.waitForEvent('download', { timeout: 6000 }).catch(() => null);
  await pg.click('#bcCreer');
  const dl = await attend;
  await pg.waitForTimeout(900);
  ok(dl !== null, 'la cle part en fichier toute seule, sans qu on la demande'
     + (dl ? ' (' + dl.suggestedFilename() + ')' : ''));

  const adrEcran = await pg.evaluate(() => document.getElementById('bcAdr').textContent.trim());
  ok(/^0x[0-9a-fA-F]{40}$/.test(adrEcran), 'l adresse du maitre est affichee (' + adrEcran.slice(0, 10) + '…)');
  ok(await pg.evaluate(() => document.getElementById('bcCreer').hidden) === true,
     'et le bouton s efface : il n y a qu un maitre');
  const p2 = await pas();
  console.log('   apres la creation, ouvertes : ' + JSON.stringify(p2));
  ok(p2.length === 1 && p2[0] === 'bcPas3',
     'et l ecran passe tout seul a « send it ETH (RH) » (' + JSON.stringify(p2) + ')');

  console.log('\n-- le filet partage n a rien perdu --');
  const filet = await pg.evaluate(() => JSON.parse(localStorage.getItem('wallet_bench_secours_v1')));
  ok(filet && filet.l.length === 3, 'les deux wallets de l anneau sont toujours la, plus le maitre ('
     + (filet ? filet.l.length : 0) + ')');
  ok(filet && filet.l[0].m === true && filet.l[0].a === adrEcran,
     'le maitre est en tete et porte le drapeau — c est celui que le banc prendra');
  ok(filet && filet.l.filter((x) => x.m).length === 1, 'et il n y en a qu un seul');
  ok(filet && filet.l.slice(1).every((x) => /^0x(11|22)/.test(x.k)),
     'les cles de l anneau sont intactes');
  ok(filet && /^0x[0-9a-fA-F]{64}$/.test(filet.l[0].k), 'la cle du maitre est une vraie cle');

  const plan = await pg.evaluate(() => JSON.parse(localStorage.getItem('wallet_bench_plan_v1')));
  console.log('   plan : ' + JSON.stringify(plan));
  ok(plan && plan.mode === 'volume' && plan.n === parseInt(N_VOLUME, 10) && plan.tok === JETON,
     'le plan depose dit le mode, le nombre DEDUIT du mode (' + N_VOLUME + ') et le jeton');

  ok(boum.length === 0, 'aucune erreur dans le portefeuille'
     + (boum[0] ? ' (' + boum[0].slice(0, 120) + ')' : ''));

  /* ---- 2. LE BANC REPREND ---- */
  console.log('\n-- le banc reprend le maitre et les options --');
  const boum2 = [];
  const pb = await ctx.newPage();
  pb.on('pageerror', (e) => boum2.push(e.message));
  pb.on('dialog', (d) => d.accept());
  await pb.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({
    status: 500, contentType: 'application/json',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'banc: hors ligne' } }) }));
  await pb.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await pb.route('**/ethers*.js', (r) => r.fulfill({
    contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
  await pb.route('**/ethers*.umd.min.js', (r) => r.fulfill({
    contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
  await pb.goto(base + '/swoge_bench.html', { waitUntil: 'domcontentloaded' });
  await pb.waitForTimeout(2000);

  const vuBanc = await pb.evaluate(() => {
    const c = document.querySelector('#ocMaster code');
    return {
      adr: c ? c.textContent.trim() : '',
      mode: (document.getElementById('ocMode') || {}).value,
      n: (document.getElementById('ocN') || {}).value,
      ocTok: (document.getElementById('ocTok') || {}).value,
      tok: (document.getElementById('tok') || {}).value,
      quick: (document.getElementById('tokQuick') || {}).value,
      genCache: getComputedStyle(document.getElementById('ocGen')).display === 'none',
      plan: localStorage.getItem('wallet_bench_plan_v1'),
      dit: (document.getElementById('ocStatus') || {}).textContent || '',
    };
  });
  ok(vuBanc.adr.toLowerCase() === adrEcran.toLowerCase(),
     'le banc montre EXACTEMENT le maitre cree dans le portefeuille');
  ok(vuBanc.genCache, 'il ne propose plus d en generer un autre');
  ok(vuBanc.mode === 'volume', 'le mode choisi est arrive (' + vuBanc.mode + ')');
  ok(vuBanc.n === N_VOLUME,
     'le nombre pose par le mode arrive tel quel dans le moteur (' + vuBanc.n + ') : personne ne '
     + 'l a tape, et pourtant c est bien lui qui pilotera l anneau');
  ok(vuBanc.ocTok.toLowerCase() === JETON, 'le jeton est dans One-Click');
  ok(vuBanc.tok.toLowerCase() === JETON && vuBanc.quick.toLowerCase() === JETON,
     'et dans les deux autres champs que les moteurs lisent — pas seulement dans celui qu on voit');
  ok(/carried over/i.test(vuBanc.dit), 'la page DIT que ces reglages viennent du portefeuille');
  ok(/change anything here/i.test(vuBanc.dit),
     'et, ouverte seule, elle invite bien a les changer ici : c est le cas, ses champs sont la');
  ok(vuBanc.plan === null, 'le plan est consomme : il ne se rejouera pas');

  /* Le mode montre ses propres reglages : poser la valeur sans declencher
     l'evenement afficherait « volume » avec les cases de « tx ». */
  const panneaux = await pb.evaluate(() => ({
    tx: document.getElementById('ocOptTx').hidden,
    h: document.getElementById('ocOptHolders').hidden,
  }));
  ok(panneaux.tx === true && panneaux.h === true,
     'et les reglages des autres modes sont bien replies');

  console.log('\n-- et un rechargement ne defait plus rien --');
  await pb.evaluate(() => { document.getElementById('ocN').value = '42'; });
  await pb.reload({ waitUntil: 'domcontentloaded' });
  await pb.waitForTimeout(1800);
  const apres = await pb.evaluate(() => ({
    adr: (document.querySelector('#ocMaster code') || {}).textContent,
    n: document.getElementById('ocN').value,
    plan: localStorage.getItem('wallet_bench_plan_v1'),
  }));
  ok(apres.plan === null, 'le plan n est pas revenu');
  ok(apres.n !== '7', 'la page ne remet pas de force l ancien choix du portefeuille');
  ok((apres.adr || '').toLowerCase() === adrEcran.toLowerCase(),
     'mais le maitre, lui, survit au rechargement — c est lui qui tient l argent');

  ok(boum2.length === 0, 'aucune erreur dans le banc'
     + (boum2[0] ? ' (' + boum2[0].slice(0, 120) + ')' : ''));

  /* ---- 3. LE MOTEUR DANS L'ECRAN ----
   *
   * DEMANDE : « une seule page, plus de banc a part — oui ». Et avant elle,
   * la vraie plainte : « je ne vois pas de bouton play et stop ».
   *
   * Ce qui est verifie ici est exactement ce qui rendrait la reponse fausse :
   *
   *   — que PLAY et STOP soient VISIBLES sans quitter le portefeuille. Les
   *     avoir dans le DOM ne suffit pas : ils y etaient deja, dans un autre
   *     onglet, et c'est precisement le probleme signale.
   *
   *   — que le moteur ne se charge PAS tant qu'on ne l'a pas demande. Une
   *     page de trois mille cinq cents lignes montee a chaque ouverture du
   *     portefeuille se paie en donnees mobiles sur un telephone, pour des
   *     visites qui n'ouvriront jamais le banc.
   *
   *   — qu'il n'y ait toujours qu'UN moteur. Si le portefeuille avait gagne
   *     sa propre copie de PLAY, on aurait deux codes qui signent, et l'un
   *     des deux deriverait en silence.
   *
   *   — que le cadre prenne la hauteur de son contenu. Sinon on fait defiler
   *     dans un cadre qui defile lui-meme : sur telephone le doigt ne sait
   *     plus lequel il pousse, et on n'atteint plus STOP. */
  console.log('\n-- le moteur vit dans l ecran du portefeuille --');
  await pb.close();

  await pg.evaluate(() => document.querySelector('[data-va="ecBanc"]').click());
  await pg.waitForTimeout(300);

  const avant = await pg.evaluate(() => {
    const b = document.getElementById('bcCadreBoite'), c = document.getElementById('bcCadre');
    return { boite: !!b, hidden: b ? b.hidden : null, src: c ? c.getAttribute('src') : null };
  });
  ok(avant.boite, 'l ecran porte un emplacement pour le moteur');
  ok(avant.hidden === true && avant.src === null,
     'mais rien n est charge avant qu on le demande : un telephone ne paie pas trois mille cinq '
     + 'cents lignes pour une visite qui n ouvrira pas le banc');

  const JETON2 = '0x2222222222222222222222222222222222222222';
  await pg.evaluate((j) => {
    document.querySelector('input[name="bcmode"][value="tx"]').click();
    document.getElementById('bcTok').value = j;
    document.getElementById('bcPas4').open = true;
  }, JETON2);
  const N_TX = await pg.evaluate(() => document.getElementById('bcN').value);

  const ongletsAvant = ctx.pages().length;
  await pg.click('#bcOuvre');
  await pg.waitForTimeout(600);
  ok(ctx.pages().length === ongletsAvant, 'le bouton n ouvre plus d onglet : on reste dans le portefeuille');

  const apresClic = await pg.evaluate(() => {
    const c = document.getElementById('bcCadre');
    return { hidden: document.getElementById('bcCadreBoite').hidden, src: c.getAttribute('src') };
  });
  ok(apresClic.hidden === false, 'le cadre apparait');
  ok(/swoge_bench\.html\?dans=wallet/.test(apresClic.src || ''),
     'et il charge la page du banc en mode encastre (' + apresClic.src + ')');

  /* On attend que le banc soit vraiment monte : `frame.waitForSelector` sur
     un bouton du moteur, pas une temporisation en aveugle. */
  await pg.waitForTimeout(2600);
  const cadres = pg.frames().filter((f) => /dans=wallet/.test(f.url()));
  ok(cadres.length === 1, 'le portefeuille tient exactement un cadre de banc (' + cadres.length + ')');

  if (cadres.length === 1) {
    const fr = cadres[0];
    try { await fr.waitForSelector('#ocPlay', { state: 'visible', timeout: 8000 }); } catch (e) {}

    const dedans = await fr.evaluate(() => {
      const vu = (id) => {
        const e = document.getElementById(id);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0;
      };
      const cache = (sel) => {
        const e = document.querySelector(sel);
        return !e || getComputedStyle(e).display === 'none';
      };
      return {
        encastre: document.body.classList.contains('encastre'),
        play: vu('ocPlay'), stop: vu('ocStop'),
        oc: vu('oneClick'),
        rangs: !!document.getElementById('rows'),
        barre: cache('header.sw-haut'), cote: cache('aside.sw-lat'),
        pied: cache('.wrap > footer'),
        mode: (document.getElementById('ocMode') || {}).value,
        n: (document.getElementById('ocN') || {}).value,
        tok: (document.getElementById('tok') || {}).value,
        haut: Math.ceil(document.documentElement.scrollHeight),
      };
    });
    ok(dedans.encastre, 'le banc se sait dans un cadre');
    /* ---- ET IL NE DIT PAS DE CHANGER CE QU'IL A CACHE ----
     * Ouvert seul, il ecrit « change anything here » — c'est vrai. Dans le
     * cadre, ses champs sont caches, et la meme phrase enverrait chercher des
     * reglages qui ne sont plus a l'ecran. Un message faux coute plus cher
     * qu'un message absent. */
    const dit = await fr.evaluate(() => (document.getElementById('ocStatus') || {}).textContent || '');
    console.log('   il dit : ' + dit.trim().slice(0, 110));
    ok(!/change anything here/i.test(dit),
       'il n invite pas a changer ici des reglages qu il vient de cacher');
    ok(/set in your wallet/i.test(dit),
       'il dit d ou viennent ses reglages, en une ligne (« '
       + dit.trim().slice(0, 80) + ' »)');
    ok(dedans.play === true && dedans.stop === true,
       'PLAY et STOP sont VISIBLES sans quitter le portefeuille — c est toute la demande');
    /* ---- ET ILS SONT DESSINES COMME LE PORTEFEUILLE ----
     * DEMANDE : « on n a utilise 0 personnalisation d UI dans wallet SWOGE,
     * retire tes UI et fais les boutons dans le meme style que le wallet ».
     * Les deux plaques peintes en or sur bleu nuit sont l habillage du BANC.
     * Justes sur sa page ; posees dans le portefeuille, elles etaient les
     * seuls objets de tout l ecran a ne pas venir de son dessin. */
    const dessin = await fr.evaluate(() => {
      const p = document.getElementById('ocPlay'), s = document.getElementById('ocStop');
      const cp = getComputedStyle(p), img = p.querySelector('img');
      return {
        image: img ? getComputedStyle(img).display !== 'none' : false,
        apres: getComputedStyle(p, '::after').content,
        apresStop: getComputedStyle(s, '::after').content,
        rayon: cp.borderRadius, fond: cp.backgroundImage,
        police: cp.fontFamily, poids: cp.fontWeight,
      };
    });
    console.log('   PLAY : ' + JSON.stringify(dessin));
    ok(dessin.image === false,
       'la plaque peinte du banc n est plus dessinee dans le portefeuille');
    ok(/START/.test(dessin.apres) && /STOP/.test(dessin.apresStop),
       'les boutons portent leur nom en toutes lettres (' + dessin.apres + ' · '
       + dessin.apresStop + ')');
    ok(dessin.rayon === '14px' && /Archivo/.test(dessin.police) && dessin.poids === '800',
       'et ils reprennent les mesures de `.wl-b` : 14 px de rayon, Archivo 800 ('
       + dessin.rayon + ' · ' + dessin.police + ' ' + dessin.poids + ')');
    ok(/gradient/.test(dessin.fond),
       'avec le degrade de l accent, comme tous les boutons pleins du portefeuille');
    ok(dedans.oc === true, 'le panneau One-Click entier est la, pas seulement ses deux boutons');
    ok(dedans.rangs, 'et la liste des portefeuilles avec leurs soldes : sans elle, on ne voit pas ce que le moteur fait');
    ok(dedans.barre && dedans.cote && dedans.pied,
       'le banc a retire SA barre du haut, SA colonne et SON pied : le portefeuille porte deja les siens');
    /* ---- ET SON PROPRE FORMULAIRE ----
     * C'est la plainte, mot pour mot : « on ne sait pas quoi faire tellement il
     * y a de choses ». L'ecran posait DEUX fois la meme question — les quatre
     * etapes du portefeuille, puis les tuiles de mode, le nombre, le jeton, le
     * financement et le simulateur de ce panneau-ci, tous deja remplis par le
     * relais. Deux formulaires du meme reglage peuvent se contredire. */
    const doubles = await fr.evaluate(() => {
      const vu = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return false;
        const r = e.getBoundingClientRect();
        return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0;
      };
      return { modes: vu('.ocmodes'), n: vu('#ocN'), tok: vu('.quicktok'),
               fonds: vu('#ocFundRow'), sim: vu('.ocsim'), sortie: vu('#ocExt'),
               maitre: vu('#ocMaster') };
    });
    console.log('   doublons encore visibles : ' + JSON.stringify(doubles));
    ok(Object.values(doubles).every((x) => x === false),
       'aucun reglage n est pose deux fois : le mode, le nombre, le jeton, le financement, le '
       + 'simulateur et la sortie sont ceux du portefeuille, pas ceux du cadre');
    ok(dedans.mode === 'tx' && dedans.n === N_TX && (dedans.tok || '').toLowerCase() === JETON2,
       'et les reglages faits juste au-dessus sont arrives dans le moteur ('
       + dedans.mode + ' · ' + dedans.n + ' · ' + String(dedans.tok).slice(0, 8) + '…)');
    ok(N_TX !== N_VOLUME,
       'avec un autre nombre de portefeuilles que le mode precedent (' + N_TX + ' contre '
       + N_VOLUME + ') : changer de mode change vraiment l anneau, pas seulement son etiquette');

    const h = await pg.evaluate(() => {
      const c = document.getElementById('bcCadre');
      return parseInt(c.style.height, 10) || 0;
    });
    ok(h > 300, 'le cadre a pris la hauteur de son contenu (' + h + 'px) — on ne fait pas '
       + 'defiler dans un cadre qui defile');
    ok(Math.abs(h - dedans.haut) < 60,
       'et c est bien LA hauteur du banc, pas un chiffre choisi au hasard (' + dedans.haut + 'px)');
  }

  ok(await pg.evaluate(() => {
    const b = document.getElementById('bcOnglet');
    return !!b && b.offsetParent !== null;
  }), 'la porte de secours reste : un cadre peut etre bloque, et STOP ne doit jamais devenir inatteignable');

  /* ---- ET LE MOTEUR PORTE LA TENUE DU PORTEFEUILLE ----
   * La page du banc est claire, exprès et a la source. Posee dans un
   * portefeuille en tenue sombre, elle devenait une dalle blanche au milieu de
   * l'ecran — la chose la plus voyante de la page, et elle ne dit rien.
   * On ne verifie pas une couleur precise (elle changera) mais le FAIT : le
   * fond du panneau doit etre sombre quand le portefeuille l'est, et suivre
   * quand on bascule en cours de route. */
  console.log('\n-- la tenue passe la frontiere du cadre --');
  const clair = await pg.frames().find((f) => /dans=wallet/.test(f.url()))
    .evaluate(() => getComputedStyle(document.querySelector('#oneClick')).backgroundColor);
  /* On bascule par la CASE du reglage, pas en posant l'attribut a la main :
     le script de la page est encapsule, ses fonctions ne sont pas globales, et
     surtout c'est ce chemin-la qu'un utilisateur emprunte. Un essai qui
     contourne l'interface ne prouve pas que l'interface marche. */
  await pg.evaluate(() => {
    const c = document.getElementById('cpSombre');
    if (c && !c.checked) c.click();
  });
  await pg.waitForTimeout(600);
  ok(await pg.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'sombre',
     'la case du reglage fait bien passer le portefeuille en tenue sombre');
  const fr2 = pg.frames().find((f) => /dans=wallet/.test(f.url()));
  const nuit = await fr2.evaluate(() => ({
    classe: document.documentElement.classList.contains('nuit'),
    fond: getComputedStyle(document.querySelector('#oneClick')).backgroundColor,
  }));
  console.log('   clair : ' + clair + ' · sombre : ' + nuit.fond);
  ok(nuit.classe, 'basculer la tenue du portefeuille la pose aussi dans le cadre');
  ok(nuit.fond !== clair,
     'et le panneau du moteur change vraiment de fond (' + clair + ' → ' + nuit.fond + ')');
  const clarte = (c) => {
    const m = String(c).match(/(\d+), *(\d+), *(\d+)/);
    return m ? (+m[1] * 0.299 + +m[2] * 0.587 + +m[3] * 0.114) : null;
  };
  ok(clarte(nuit.fond) !== null && clarte(nuit.fond) < 80,
     'il devient SOMBRE, pas juste different (clarte ' + Math.round(clarte(nuit.fond)) + '/255) : '
     + 'une dalle blanche dans un portefeuille sombre est la premiere chose qu on voit');

  /* UN seul moteur : le portefeuille ne doit pas avoir gagne sa propre copie
     de PLAY dans son propre document. */
  ok(await pg.evaluate(() => !document.querySelector('#ocPlay')),
     'le portefeuille lui-meme n a PAS de copie de PLAY : il n y a toujours qu un seul code qui signe');

  ok(boum.length === 0, 'toujours aucune erreur dans le portefeuille'
     + (boum[0] ? ' (' + boum[0].slice(0, 120) + ')' : ''));

  await ctx.close();
  await nav.close();
  srv.close();
  console.log('\nbanc_relais.test.js — ' + n + ' verifications, ' + rates + ' echec(s)');
  process.exit(rates ? 1 : 0);
})();
