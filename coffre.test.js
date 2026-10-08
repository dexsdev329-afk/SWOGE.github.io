'use strict';
/* ============================================================================
 * LE CHOIX DU COFFRE (coffre.js) — ce que l'interface promet, et rien de plus.
 *
 * coffre.js ne touche AUCUN argent : le serveur revalide chaque geste et debite
 * le bon coffre sur ws.addr (c'est casino_deux_coffres.test.js, cote serveur,
 * qui prouve l'isolation). Ici on verifie seulement la promesse de l'interface :
 *
 *   - sans $SWOGEBET, il n'y a rien a choisir : le selecteur reste cache et
 *     `jeton()` rend 'swoge' — donc une page qui se cable a ce fichier mise en
 *     $SWOGE comme avant, par defaut ;
 *   - des qu'un solde $SWOGEBET arrive (auth, betBalance, resultat de manche),
 *     le selecteur apparait et montre ce solde ;
 *   - choisir $SWOGEBET fait rendre 'swogebet' a `jeton()` et previent la page ;
 *   - si le bet vault se vide pendant qu'il etait choisi, on RETOMBE sur $SWOGE —
 *     jamais miser un coffre a sec ;
 *   - le choix se retient (localStorage) ; demander 'swogebet' sans solde ne
 *     prend pas.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');

const HARNESS = '<!doctype html><meta charset="utf-8"><title>coffre</title>'
  + '<div id="anc">bet row</div><script src="/coffre.js"></script>';

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); console.log('\ncoffre.test.js : ' + n + ' verifications, ' + rates + ' RATE(S)'); return; }
  const srv = http.createServer((q, r) => {
    if (q.url.split('?')[0] === '/h') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(HARNESS); }
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();

  async function page0() {
    const page = await nav.newPage();
    await page.goto('http://127.0.0.1:' + port + '/h', { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    return page;
  }

  console.log('-- 1. sans $SWOGEBET, rien a choisir, defaut $SWOGE --');
  {
    const page = await page0();
    eq(await page.evaluate(() => SwogeCoffre.jeton()), 'swoge', 'jeton() par defaut');
    eq(await page.evaluate(() => SwogeCoffre.actif()), false, 'pas de bet vault');
    await page.evaluate(() => SwogeCoffre.vu({ type: 'auth', balance: '100', betBalance: '0' }));
    eq(await page.evaluate(() => SwogeCoffre.actif()), false, 'betBalance 0 : toujours inactif');
    // le selecteur, une fois pose, reste cache tant qu'il n'y a rien a miser
    await page.evaluate(() => SwogeCoffre.monte(document.getElementById('anc'), function (j) { window.__ch = j; }));
    eq(await page.evaluate(() => { var b = document.querySelector('.coffre-choix'); return b ? b.style.display : 'absent'; }), 'none', 'selecteur cache sans bet vault');
    await page.close();
  }

  console.log('-- 2. un solde $SWOGEBET arrive : le selecteur apparait --');
  {
    const page = await page0();
    await page.evaluate(() => SwogeCoffre.monte(document.getElementById('anc'), function (j) { window.__ch = j; }));
    await page.evaluate(() => SwogeCoffre.vu({ type: 'auth', balance: '100', betBalance: '250' }));
    eq(await page.evaluate(() => SwogeCoffre.actif()), true, 'bet vault actif');
    eq(await page.evaluate(() => SwogeCoffre.soldeBet()), 250, 'solde $SWOGEBET lu');
    eq(await page.evaluate(() => getComputedStyle(document.querySelector('.coffre-choix')).display !== 'none'), true, 'selecteur visible (style calcule)');
    eq(await page.evaluate(() => document.querySelector('.coffre-choix .cf-b').textContent), '250.00', 'le solde $SWOGEBET est montre');
    eq(await page.evaluate(() => SwogeCoffre.jeton()), 'swoge', 'par defaut on reste en $SWOGE meme quand le choix existe');
    await page.close();
  }

  console.log('-- 3. choisir $SWOGEBET : jeton() change et la page est prevenue --');
  {
    const page = await page0();
    await page.evaluate(() => { window.__ch = null; SwogeCoffre.monte(document.getElementById('anc'), function (j) { window.__ch = j; }); SwogeCoffre.vu({ betBalance: '250' }); });
    await page.click('.coffre-choix [data-coffre="swogebet"]');
    eq(await page.evaluate(() => SwogeCoffre.jeton()), 'swogebet', 'jeton() = swogebet apres clic');
    eq(await page.evaluate(() => window.__ch), 'swogebet', 'la page a ete prevenue du changement');
    eq(await page.evaluate(() => document.querySelector('[data-coffre="swogebet"]').getAttribute('aria-pressed')), 'true', 'le bouton $SWOGEBET est marque');
    eq(await page.evaluate(() => document.querySelector('[data-coffre="swoge"]').getAttribute('aria-pressed')), 'false', 'le bouton $SWOGE ne l est plus');
    // retour a $SWOGE
    await page.click('.coffre-choix [data-coffre="swoge"]');
    eq(await page.evaluate(() => SwogeCoffre.jeton()), 'swoge', 'reclic $SWOGE : retour');
    await page.close();
  }

  console.log('-- 4. le bet vault se vide pendant qu il etait choisi : on retombe sur $SWOGE --');
  {
    const page = await page0();
    await page.evaluate(() => { SwogeCoffre.monte(document.getElementById('anc'), function () {}); SwogeCoffre.vu({ betBalance: '250' }); SwogeCoffre.set('swogebet'); });
    eq(await page.evaluate(() => SwogeCoffre.jeton()), 'swogebet', 'swogebet choisi');
    await page.evaluate(() => SwogeCoffre.vu({ betBalance: '0' }));
    eq(await page.evaluate(() => SwogeCoffre.jeton()), 'swoge', 'coffre vide -> on mise en $SWOGE, jamais a sec');
    eq(await page.evaluate(() => getComputedStyle(document.querySelector('.coffre-choix')).display), 'none', 'et le selecteur se recache');
    await page.close();
  }

  console.log('-- 5. choisir un coffre a sec ne prend pas ; le choix se retient --');
  {
    const page = await page0();
    await page.evaluate(() => SwogeCoffre.set('swogebet'));            // sans solde
    eq(await page.evaluate(() => SwogeCoffre.jeton()), 'swoge', 'set(swogebet) sans solde : refuse');
    // avec solde, le choix persiste a travers un rechargement
    await page.evaluate(() => { SwogeCoffre.vu({ betBalance: '500' }); SwogeCoffre.set('swogebet'); });
    eq(await page.evaluate(() => { try { return localStorage.getItem('swogeCoffre'); } catch (e) { return null; } }), 'swogebet', 'le choix est ecrit en memoire');
    /* meme page, meme origine : au rechargement le choix memorise est repris,
       une fois le solde $SWOGEBET connu (sinon on ne pretend pas pouvoir miser). */
    await page.reload({ waitUntil: 'load' });
    eq(await page.evaluate(() => SwogeCoffre.jeton()), 'swoge', 'avant de connaitre le solde, rien a miser -> $SWOGE');
    await page.evaluate(() => SwogeCoffre.vu({ betBalance: '500' }));
    eq(await page.evaluate(() => SwogeCoffre.jeton()), 'swogebet', 'au rechargement, le choix memorise est repris');
    await page.close();
  }

  console.log('-- 6. un message qui ne parle pas du joueur ne touche jamais son coffre --');
  {
    const page = await page0();
    await page.evaluate(() => { SwogeCoffre.monte(document.getElementById('anc'), function () {}); SwogeCoffre.vu({ type: 'auth', betBalance: '500' }); SwogeCoffre.set('swogebet'); });
    // la copie publique d'un encaissement Crash d'un AUTRE joueur (sans `moi`)
    await page.evaluate(() => SwogeCoffre.vu({ type: 'crashRetrait', addr: '0xautre', mise: 50, multi: 2, payout: 100, betBalance: '0' }));
    eq(await page.evaluate(() => SwogeCoffre.soldeBet()), 500, 'crashRetrait public (sans moi) : ignore');
    eq(await page.evaluate(() => SwogeCoffre.jeton()), 'swogebet', 'et le choix du joueur ne bouge pas');
    // un type diffuse inconnu de la liste blanche
    await page.evaluate(() => SwogeCoffre.vu({ type: 'crashJoueur', addr: '0xautre', betBalance: '1' }));
    eq(await page.evaluate(() => SwogeCoffre.soldeBet()), 500, 'type hors liste blanche : ignore');
    // SA copie a lui (moi:true) est prise
    await page.evaluate(() => SwogeCoffre.vu({ type: 'crashRetrait', moi: true, betBalance: '600' }));
    eq(await page.evaluate(() => SwogeCoffre.soldeBet()), 600, 'crashRetrait avec moi : pris');
    // un resultat de jeu adresse au joueur est pris ; un etat sans type aussi
    await page.evaluate(() => SwogeCoffre.vu({ type: 'plinko', betBalance: '650' }));
    eq(await page.evaluate(() => SwogeCoffre.soldeBet()), 650, 'resultat de jeu (plinko) : pris');
    await page.evaluate(() => SwogeCoffre.vu({ stage: 'done', betBalance: '700' }));
    eq(await page.evaluate(() => SwogeCoffre.soldeBet()), 700, 'etat sans type passe par la page (blackjack) : pris');
    await page.close();
  }

  await nav.close();
  await new Promise((s) => srv.close(s));
  console.log('\ncoffre.test.js : ' + n + ' verifications, ' + rates + ' RATE(S)');
  process.exit(rates ? 1 : 0);
})();
