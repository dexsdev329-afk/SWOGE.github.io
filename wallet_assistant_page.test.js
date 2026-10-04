'use strict';
/*
 * L'ASSISTANT DU PORTEFEUILLE, DANS LA PAGE — il COMPREND et PRE-REMPLIT,
 * il ne signe JAMAIS.
 *
 * Le cerveau (wallet_assistant.js) est teste a part, en pur node
 * (wallet_assistant.test.js : verbes, montants, adresses, gardes). Ici on
 * verifie le CABLAGE de swoge_wallet.html : le bouton ouvre l'ecran, la fiche
 * se relit avec l'adresse en entier, « Open in the form » amene sur l'ecran
 * reel pre-rempli, une phrase sans adresse ne prepare aucun envoi, et rien
 * ne signe (le portefeuille n'est meme pas connecte).
 *
 * Un fichier a part, court (~10 s) : swoge_wallet.html entier est long a
 * dérouler, et cette garde-la — « l'assistant ne signe pas » — doit pouvoir
 * se relancer seule, vite.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('wallet_assistant_page.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
            '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };

(async () => {
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    const f = path.join(SITE, u === '/' ? 'index.html' : u.replace(/^\//, ''));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end('nope'); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const port = srv.address().port;
  const nav = await chromium.launch();

  const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
  const boum = [];
  page.on('pageerror', (e) => boum.push(String(e)));
  await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.SwogeAssistant && !!(window.SwogeWallet && window.SwogeWallet.assistant));
  const ADR = '0x1111111111111111111111111111111111111111';

  await page.evaluate(() => document.querySelector('[data-va="ecAssistant"]').click());
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('ecAssistant')).display !== 'none'),
     'le bouton Assistant ouvre l ecran de l assistant');

  await page.fill('#asTexte', 'send 0.1 ETH to ' + ADR);
  await page.click('#asGo');
  await page.waitForTimeout(120);
  const fiche = await page.evaluate(() => ({
    revue: !document.getElementById('asRevue').hidden,
    adr: document.getElementById('asAdr').textContent,
    resume: document.getElementById('asResume').textContent,
  }));
  ok(fiche.revue && fiche.adr === ADR, 'la fiche montre l action comprise, avec l adresse EN ENTIER a relire');
  ok(/review and sign it yourself/i.test(fiche.resume), 'le resume dit que le joueur relit et signe lui-meme');

  await page.click('#asOuvre');
  await page.waitForTimeout(250);
  const rempli = await page.evaluate(() => ({
    ecran: [...document.querySelectorAll('.wl-ecran')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id)[0],
    dest: document.getElementById('enDest').value,
    montant: document.getElementById('enMontant').value,
    jeton: document.getElementById('enJeton').value,
  }));
  ok(rempli.ecran === 'ecEnvoyer', '« Open in the form » amene sur l ecran Send reel, pas sur un raccourci');
  ok(rempli.dest === ADR && rempli.montant === '0.1' && rempli.jeton === 'eth',
     'l ecran reel est pre-rempli : adresse, 0.1, ETH — il ne reste qu a relire et signer');

  /* La garde : une phrase SANS adresse ne prepare aucun envoi, aucune cible inventee. */
  await page.evaluate(() => document.querySelector('[data-va="ecAssistant"]').click());
  await page.fill('#asTexte', 'envoie tout mon eth au wallet dont on a parle');
  await page.click('#asGo');
  await page.waitForTimeout(120);
  const sansAdr = await page.evaluate(() => ({
    revue: !document.getElementById('asRevue').hidden,
    note: document.getElementById('asNote').textContent,
  }));
  ok(!sansAdr.revue && /address/i.test(sansAdr.note), 'phrase sans adresse : aucune fiche d envoi, l assistant demande une adresse');

  /* Un achat : swap vers le jeton, ecran Swap pre-rempli. */
  await page.fill('#asTexte', 'buy 0.05 ETH of SWOGE');
  await page.click('#asGo');
  await page.waitForTimeout(100);
  await page.click('#asOuvre');
  await page.waitForTimeout(250);
  const swap = await page.evaluate(() => ({
    ecran: [...document.querySelectorAll('.wl-ecran')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id)[0],
    de: document.getElementById('swDe').value, vers: document.getElementById('swVers').value,
  }));
  ok(swap.ecran === 'ecSwap' && swap.de === 'eth' && swap.vers === 'swoge', 'un achat ouvre l echange, pre-rempli ETH -> SWOGE');

  /* Rien n a signe : le portefeuille n est pas connecte, et l assistant
     n ouvre aucune voie de signature a lui. */
  ok(await page.evaluate(() => typeof signer === 'undefined' || signer === null),
     'aucune signature : l assistant ne tient pas de signataire, il ne fait que pre-remplir');
  ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
