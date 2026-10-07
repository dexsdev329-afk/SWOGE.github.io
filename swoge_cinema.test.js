/* LE SWOGE AI CINEMA (07/10/2026).
 *
 * ---- POURQUOI CET ESSAI EXISTE ----
 *
 * La page montre NOS vidéos, générées par notre propre pipeline et hébergées
 * chez nous (media/cinema/*.mp4). C'est une vitrine publique, pas la salle du
 * Nexus : aucune URL externe, aucun iframe, rien du FLIX pirate retiré le
 * 27/09. Cet essai tient trois promesses :
 *
 *   1. CE QUE LA PAGE ANNONCE EXISTE. Chaque épisode du catalogue a son .mp4 et
 *      son affiche .webp sur le disque, et la page ne charge QUE ça — pas une
 *      seule source http(s) externe, pas un seul iframe. Une page qui promet un
 *      épisode qui répond 404 ment au visiteur ; un lecteur pointé ailleurs
 *      rouvre la porte que le propriétaire a fermée.
 *   2. LE CATALOGUE DE LA PAGE FAIT FOI. On lit les slugs dans la source de la
 *      page (le tableau CATALOGUE), on ne les recopie pas ici : le jour où on
 *      ajoute un épisode, l'essai le suit sans qu'on y pense, et vérifie que son
 *      fichier est bien là.
 *   3. LE GESTE MARCHE. Cliquer une vignette change la source du lecteur ; le
 *      vote A/B s'affiche quand l'épisode en a un ; le lien profond ?v=slug
 *      ouvre le bon épisode ; les boutons de partage portent l'adresse propre
 *      de la page (sans le paramètre ?server interne).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('swoge_cinema.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
              '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
              '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const f = path.join(racine, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
        r.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res({ port: s.address().port, stop: () => s.close() }));
  });
}
process.on('unhandledRejection', (e) => {
  console.log('  RATE essai interrompu : ' + (e && e.message ? e.message : e));
  process.exit(1);
});

/* Les slugs viennent de la SOURCE de la page — le tableau CATALOGUE — pas d'ici.
   On relit la liste telle que la page la déclare, dans l'ordre. */
function cataloguePage() {
  const src = fs.readFileSync(path.join(SITE, 'swoge_cinema.html'), 'utf8');
  const slugs = [];
  const re = /slug:"([a-z0-9_]+)"/g; let m;
  while ((m = re.exec(src))) slugs.push(m[1]);
  return slugs;
}

(async () => {
  const PAGE = fs.readFileSync(path.join(SITE, 'swoge_cinema.html'), 'utf8');

  /* 1. Promesse tenue, côté disque : chaque slug du catalogue a ses deux fichiers. */
  const slugs = cataloguePage();
  ok(slugs.length >= 14, 'le catalogue déclare ' + slugs.length + ' épisodes (≥ 14 attendus)');
  let manquants = 0;
  slugs.forEach((s) => {
    if (!fs.existsSync(path.join(SITE, 'media/cinema/' + s + '.mp4'))) { manquants++; console.log('    manque media/cinema/' + s + '.mp4'); }
    if (!fs.existsSync(path.join(SITE, 'img/site/cinema/' + s + '.webp'))) { manquants++; console.log('    manque img/site/cinema/' + s + '.webp'); }
  });
  ok(manquants === 0, 'chaque épisode a son .mp4 ET son affiche .webp sur le disque');

  /* 2. Aucune source externe, aucun iframe : la page ne sert que NOS fichiers. */
  ok(!/<iframe/i.test(PAGE), 'aucun <iframe> dans la page');
  ok(!/(src|href)\s*=\s*["']https?:\/\/[^"']*\.(mp4|m3u8|webm)/i.test(PAGE), 'aucune vidéo chargée depuis une URL externe');
  const srcsVideo = (PAGE.match(/media\/cinema\/[a-z0-9_]+\.mp4/gi) || []);
  // ces chaînes-ci sont construites en JS, donc la vérif réelle se fait au runtime ci-dessous.

  const srv = await servirLeSite(SITE);
  const base = 'http://127.0.0.1:' + srv.port + '/swoge_cinema.html';
  const nav = await chromium.launch();
  const page = await nav.newPage();

  // on surveille les 404 sur nos dossiers média pendant toute la session
  const quatreCentQuatre = [];
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() === 404 && /\/(media\/cinema|img\/site\/cinema)\//.test(u)) quatreCentQuatre.push(u.split('/').slice(-1)[0]);
  });

  await page.goto(base, { waitUntil: 'networkidle' });

  const titre = await page.title();
  ok(/SWOGE AI Cinema/.test(titre), 'le titre annonce le SWOGE AI Cinema');

  // le lecteur existe et pointe un épisode hébergé chez nous
  const srcLecteur = await page.$eval('#lecteur', (v) => v.getAttribute('src') || '');
  ok(/^media\/cinema\/[a-z0-9_]+\.mp4$/.test(srcLecteur), 'le lecteur joue un fichier local (' + srcLecteur + ')');

  // les rangées et les vignettes
  const nbRangees = await page.$$eval('.cine-rangee', (e) => e.length);
  const nbVign = await page.$$eval('.cine-vignette', (e) => e.length);
  ok(nbRangees === 3, '3 séries affichées (ISLAND, SAGA, SAGA S2) — vu ' + nbRangees);
  ok(nbVign === slugs.length, 'une vignette par épisode (' + nbVign + '/' + slugs.length + ')');

  // cliquer une vignette (island_ep2) change la source ET montre son vote A/B
  await page.click('.cine-vignette[data-slug="island_ep2"]');
  await page.waitForTimeout(150);
  const src2 = await page.$eval('#lecteur', (v) => v.getAttribute('src') || '');
  ok(src2 === 'media/cinema/island_ep2.mp4', 'cliquer EP2 charge sa vidéo');
  const vote = await page.$eval('#epVote', (e) => ({ caché: e.hidden, txt: e.textContent }));
  ok(!vote.caché && /Save Lani/.test(vote.txt) && /Save Luna/.test(vote.txt), 'le vote A/B d\'EP2 s\'affiche (Lani / Luna)');

  // partage : l'adresse propre de la page, sans ?server, avec le slug
  const hrefX = await page.$eval('#pX', (a) => a.getAttribute('href') || '');
  ok(/twitter\.com\/intent\/tweet/.test(hrefX) && /island_ep2/.test(decodeURIComponent(hrefX)) && !/[?&]server=/.test(decodeURIComponent(hrefX)),
     'le bouton X partage l\'adresse propre de l\'épisode courant');
  const hrefTG = await page.$eval('#pTG', (a) => a.getAttribute('href') || '');
  ok(/t\.me\/share\/url/.test(hrefTG) && /island_ep2/.test(decodeURIComponent(hrefTG)), 'le bouton Telegram partage le même épisode');

  // lien profond ?v=slug : on rouvre la page sur saga_ep1
  await page.goto('http://127.0.0.1:' + srv.port + '/swoge_cinema.html?v=saga_ep1', { waitUntil: 'networkidle' });
  const srcDeep = await page.$eval('#lecteur', (v) => v.getAttribute('src') || '');
  ok(srcDeep === 'media/cinema/saga_ep1.mp4', 'le lien profond ?v=saga_ep1 ouvre le bon épisode');

  // ?server interne conservé pour les autres appels mais JAMAIS mis dans le lien de partage
  await page.goto('http://127.0.0.1:' + srv.port + '/swoge_cinema.html?server=http://x.example&v=island_ep1', { waitUntil: 'networkidle' });
  const hrefX2 = await page.$eval('#pX', (a) => decodeURIComponent(a.getAttribute('href') || ''));
  ok(!/x\.example/.test(hrefX2), 'le lien de partage ne fuite pas le paramètre ?server interne');

  await nav.close();
  srv.stop();

  ok(quatreCentQuatre.length === 0, 'aucun 404 sur media/cinema ou img/site/cinema' + (quatreCentQuatre.length ? ' (' + quatreCentQuatre.join(', ') + ')' : ''));

  console.log('\nswoge_cinema.test.js : ' + n + ' vérifications, ' + rates + ' RATE');
  if (rates) { console.log('RATES : ' + rates + '/' + n); process.exit(1); }
  process.exit(0);
})();
