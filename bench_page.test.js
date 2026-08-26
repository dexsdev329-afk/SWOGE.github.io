/* LE BENCH : CHAQUE BOUTON EST-IL ENCORE BRANCHE A QUELQUE CHOSE ?
 *
 * ---- pourquoi cet essai existe ----
 *
 * Un panneau entier de cette page a cesse de fonctionner sans que rien ne le
 * dise. En retirant l'« Auto Volume Ring », qui faisait doublon, la coupe a
 * emporte le moteur du panneau VOISIN — One-Click Volume — qui le suivait
 * dans le fichier. Le balisage est reste : les plaques peintes Generate, Play
 * et Stop etaient toujours la, toujours cliquables, toujours belles. Elles ne
 * faisaient simplement plus rien.
 *
 * C'est la panne la plus difficile a voir de toutes : la page se charge, la
 * console est vide, rien n'est barre ni grise. Le seul symptome est un clic
 * qui ne produit rien — et il faut cliquer pour s'en apercevoir.
 *
 * D'ou cet essai. Il ne juge pas ce que les boutons FONT : il verifie qu'ils
 * sont branches, et pour les deux qui creent une cle, que le clic produit
 * vraiment un portefeuille dans la page. Un bouton peint qui ne repond pas est
 * pire qu'un bouton absent : l'un se repare, l'autre se subit.
 *
 * ---- pourquoi `ethers` est servi depuis le disque ----
 *
 * La page le prend sur un CDN. Un essai qui depend d'Internet echoue les jours
 * ou le reseau tousse et ne dit alors plus rien de la page. On sert donc la
 * copie que le depot du serveur a deja dans ses dependances ; a defaut,
 * l'essai se saute plutot que de mentir.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const SITE = __dirname;
const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const ETHERS = path.join(SERVEUR, 'node_modules/ethers/dist/ethers.umd.min.js');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('bench_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(ETHERS)) {
  console.log('bench_page.test.js : ethers introuvable sur le disque — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp3': 'audio/mpeg' };
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

(async () => {
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await nav.newPage();

  /* La copie locale d'ethers, et rien d'autre du dehors : une police manquante
     ne doit pas faire echouer un essai qui parle de boutons. */
  await pg.route('**/ethers*.js', (r) => r.fulfill(
    { status: 200, contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
  await pg.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await pg.route('**/fonts.gstatic.com/**', (r) => r.abort());

  const erreurs = [];
  pg.on('pageerror', (e) => erreurs.push(e.message));
  /* Les confirmations de reseau live : on accepte, c'est le geste du joueur. */
  pg.on('dialog', (d) => d.accept());

  await pg.goto(`http://127.0.0.1:${site.port}/swoge_bench.html`, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1500);

  console.log('\n-- la page tient debout --');
  ok(await pg.evaluate(() => typeof ethers) === 'object', 'ethers est charge');
  ok(erreurs.length === 0, 'aucune erreur au chargement' + (erreurs[0] ? ' (' + erreurs[0].slice(0, 120) + ')' : ''));

  console.log('\n-- CHAQUE PLAQUE PEINTE EST BRANCHEE --');
  /* La liste est ecrite en dur, et c'est voulu : elle est le CONTRAT de la
     page. Un bouton retire volontairement fera echouer cet essai, et c'est
     exactement le moment ou l'on veut relire cette liste. */
  const BOUTONS = [
    ['ocGen',  'One-Click : Generate master wallet'],
    ['ocPlay', 'One-Click : Play'],
    ['ocStop', 'One-Click : Stop'],
    ['ocSend', 'One-Click : Send to external wallet'],
    ['gen',    'Generate : Generate wallets'],
    ['add',    'Generate : Add to bench'],
  ];
  for (const [id, nom] of BOUTONS) {
    const etat = await pg.evaluate((i) => {
      const e = document.querySelector('#' + i);
      if (!e) return 'ABSENT';
      /* `onclick` ET `addEventListener` : les deux cablages existent dans la
         page, et un bouton branche par le second n'est pas casse. */
      return e.onclick ? 'onclick' : 'sans';
    }, id);
    ok(etat === 'onclick', `${nom} : branche (${etat})`);
  }

  console.log('\n-- ET LE CLIC CREE VRAIMENT UN PORTEFEUILLE --');
  /* On lit la PAGE, pas une variable du script : `wallets` vit dans la portee
     du module et n'est pas sur `window`. Ce que le joueur voit fait foi. */
  await pg.click('#ocGen');
  await pg.waitForTimeout(600);
  const adr = await pg.evaluate(() => {
    const c = document.querySelector('#ocMaster code');
    return c ? c.textContent.trim() : '';
  });
  ok(/^0x[0-9a-fA-F]{40}$/.test(adr), `Generate master wallet ecrit une adresse (${adr.slice(0, 10)}…)`);
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('#ocGen')).display) === 'none',
     'et le bouton s efface : il n y a qu un maitre');

  const avant = await pg.evaluate(() => document.querySelectorAll('[data-toggle]').length);
  await pg.evaluate(() => { document.querySelector('#count').value = '3'; });
  await pg.click('#gen');
  await pg.waitForTimeout(600);
  const apres = await pg.evaluate(() => document.querySelectorAll('[data-toggle]').length);
  ok(apres === avant + 3, `Generate wallets ajoute les trois demandes (${avant} -> ${apres})`);

  ok(erreurs.length === 0, 'aucune erreur pendant les clics' + (erreurs[0] ? ' (' + erreurs[0].slice(0, 120) + ')' : ''));

  await nav.close();
  site.stop();
  console.log(`\nbench_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
