/* connexion_clic.test.js — le formulaire « Sign in » de stakebubble : chaque
 * bouton recoit SON clic.
 *
 * 14/10/2026 : « connexion wallet fonctionne pas ». Une regle du tiroir des
 * duels, `.x::after` (zone sensible de 44 px pour une croix de 24 px), etait
 * ecrite pour TOUT `.x`. Le « Cancel » du formulaire porte la classe `x` et
 * n'est pas positionne : son pseudo-element se placait au centre du voile fixe,
 * donc au centre de l'ecran — exactement sur « Connect wallet ». Le clic fermait
 * le formulaire. Mesure : elementFromPoint au centre de « Connect wallet »
 * rendait `button.x` (420x860 et 1366x768, kling_essai.html en ligne).
 *
 * L'essai ouvre le formulaire sur plusieurs pages et plusieurs tailles, et
 * exige que le point central de chaque bouton soit le bouton lui-meme.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();

  /* kling_essai.html charge stakebubble au clic ; les autres le chargent d'emblee */
  const PAGES = [['kling_essai.html', true], ['index.html', false], ['studio.html', false]];
  const TAILLES = [{ width: 420, height: 860 }, { width: 1366, height: 768 }];
  for (const [page, auClic] of PAGES) {
    for (const vp of TAILLES) {
      const ctx = await nav.newContext({ viewport: vp });
      const p = await ctx.newPage();
      /* rien ne sort de la machine : le formulaire n'a besoin d'aucun serveur pour s'ouvrir */
      await p.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
      await p.goto(base + page, { waitUntil: 'domcontentloaded' });
      if (auClic) await p.click('#seConnecter');
      await p.waitForFunction(() => window.swogeConnexion && typeof window.swogeConnexion.ouvre === 'function', null, { timeout: 15000 });
      await p.evaluate(() => { if (!document.querySelector('.swcon-ov.on')) window.swogeConnexion.ouvre(); });
      await p.waitForSelector('.swcon-ov.on .swcon-b .w', { state: 'visible' });
      const res = await p.evaluate(() => [...document.querySelectorAll('.swcon-ov.on .swcon-b > button')].map((b) => {
        const q = b.getBoundingClientRect();
        const el = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
        return { nom: b.textContent.trim(), a: b.getAttribute('data-a'), touche: el === b || b.contains(el), recu: el ? el.tagName + '.' + el.className : null };
      }));
      const lieu = page + ' ' + vp.width + 'x' + vp.height;
      ok(res.length === 3, lieu + ' : trois boutons (wallet, email, cancel) [' + res.length + ']');
      for (const r of res) ok(r.touche, lieu + ' : le centre de « ' + r.nom + ' » est ce bouton' + (r.touche ? '' : ' (recu par ' + r.recu + ')'));
      /* et le clic fait ce qu'il dit : « Connect wallet » sans portefeuille garde le formulaire ouvert avec un message */
      /* un clic intercepte par un autre element n'aboutit jamais : c'est un RATE, pas une panne de l'essai */
      await p.click('.swcon-ov.on .swcon-b .w', { timeout: 5000 }).catch(() => {});
      const apres = await p.evaluate(() => ({ ouvert: !!document.querySelector('.swcon-ov.on'), msg: (document.querySelector('.swcon-b .m') || {}).textContent || '' }));
      ok(apres.ouvert && /wallet/i.test(apres.msg), lieu + ' : « Connect wallet » repond (formulaire ouvert, « ' + apres.msg.slice(0, 60) + ' »)');
      await ctx.close();
    }
  }
  await nav.close(); srv.close();
  console.log('\nconnexion_clic.test.js : ' + n + ' verifications, ' + rates + ' RATE');
  console.log('RATES : ' + rates + '/' + n);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
