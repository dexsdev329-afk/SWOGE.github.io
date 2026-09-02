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

  console.log('\n-- on choisit les options AVANT --');
  await pg.evaluate((jeton) => {
    document.getElementById('bcMode').value = 'volume';
    document.getElementById('bcN').value = '7';
    document.getElementById('bcTok').value = jeton;
  }, JETON);

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
  ok(await pg.evaluate(() => document.getElementById('bcCarteFonds').hidden) === false,
     'la carte « envoyer au maitre » apparait seulement une fois le maitre cree');

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
  ok(plan && plan.mode === 'volume' && plan.n === 7 && plan.tok === JETON,
     'le plan depose dit le mode, le nombre et le jeton');

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
  ok(vuBanc.n === '7', 'le nombre de wallets aussi (' + vuBanc.n + ')');
  ok(vuBanc.ocTok.toLowerCase() === JETON, 'le jeton est dans One-Click');
  ok(vuBanc.tok.toLowerCase() === JETON && vuBanc.quick.toLowerCase() === JETON,
     'et dans les deux autres champs que les moteurs lisent — pas seulement dans celui qu on voit');
  ok(/carried over/i.test(vuBanc.dit), 'la page DIT que ces reglages viennent du portefeuille');
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

  await ctx.close();
  await nav.close();
  srv.close();
  console.log('\nbanc_relais.test.js — ' + n + ' verifications, ' + rates + ' echec(s)');
  process.exit(rates ? 1 : 0);
})();
