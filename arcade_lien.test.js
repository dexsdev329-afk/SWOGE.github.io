'use strict';
/*
 * LA BORNE D ARCADE S OUVRE DIRECTEMENT.
 *
 * ---- CE QUI ETAIT DEMANDE ----
 *
 * « Si on a notre wallet connecte et on clique sur arcade, ca nous fait
 *   arriver directement dans le jeu SWOGE nexus mais dans le salon d arcade. »
 *
 * ---- CE QU IL FALLAIT POUR LE VERIFIER ----
 *
 * Le monde est dessine sur un CANEVAS. Entrer dans une salle ne changeait rien
 * d observable de l exterieur : ni balise, ni classe, ni adresse. La promesse
 * « on arrive dans le salon d arcade » etait donc inverifiable — on ne pouvait
 * que la croire. `nexus.js` ecrit maintenant la scene courante sur la racine
 * du document ; c est une ligne, et c est ce qui rend cet essai possible.
 *
 * ---- ET LE NOM DE LA SALLE N EST PAS UNE LISTE A PART ----
 *
 * Le lien passe par la table des salles du hall, celle que la boucle consulte
 * quand on marche dans une porte. Une salle ajoutee demain sera joignable par
 * son nom sans qu on revienne ici ; un nom inconnu ne fait RIEN, et l on
 * arrive sur la place — le bon repli, alors qu inventer une salle serait une
 * porte vers le vide. L essai verifie les deux.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

let n = 0, echecs = 0;
const ok = (c, m) => { if (c) { n++; console.log('  ok   ' + m); }
                       else { echecs++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} [${a} vs ${b}]`);

const SITE = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript',
                '.json': 'application/json', '.webp': 'image/webp',
                '.png': 'image/png', '.css': 'text/css', '.mp4': 'video/mp4' };
const servirLeSite = async () => {
  const s = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { port: s.address().port, stop: () => s.close() };
};
/* Une socket morte : le monde se dessine sans serveur, et l on n ira pas
   toucher la production depuis un essai. */
const MORT = encodeURIComponent('ws://127.0.0.1:1');

(async () => {
  const site = await servirLeSite();
  const nav = await chromium.launch();

  console.log('\n-- le monde, avec et sans nom de salle --');
  for (const [q, attendu, dit] of [
    ['', 'nexus', 'sans rien, on arrive sur la place'],
    ['salle=arcade&', 'arcade', 'avec « salle=arcade », on arrive DANS la salle d arcade'],
    ['salle=nimporte&', 'nexus', 'et un nom de salle inconnu ne fait rien : on arrive sur la place,'
      + ' plutot que dans une salle inventee'],
  ]) {
    const ctx = await nav.newContext({ viewport: { width: 1200, height: 800 } });
    const p = await ctx.newPage();
    const err = []; p.on('pageerror', (e) => err.push(e.message));
    await p.goto(`http://127.0.0.1:${site.port}/nexus.html?${q}server=${MORT}`,
                 { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2600);
    const scene = await p.evaluate(() => document.documentElement.getAttribute('data-scene'));
    eq(scene, attendu, dit);
    ok(err.length === 0, `  et aucune erreur de page${err.length ? ' — ' + err[0] : ''}`);
    await ctx.close();
  }

  console.log('\n-- la carte ARCADE des deux pages --');
  const CARTES = [
    ['games.html', 'le hall'],
    ['swogebet.html', 'la page de paris'],
  ];
  for (const [f, quoi] of CARTES) {
    const src = fs.readFileSync(path.join(SITE, f), 'utf8');
    const m = src.match(/<b>ARCADE<\/b>[\s\S]{0,300}?href="([^"]+)"/);
    ok(!!m, `${quoi} : la carte ARCADE porte un lien`);
    if (m) eq(m[1], 'nexus.html?salle=arcade',
              `${quoi} : et il mene a la SALLE, pas a la place`);
    ok(!/CONNECT WALLET FIRST/.test(src.match(/<b>ARCADE<\/b>[\s\S]{0,300}/)[0]),
       `${quoi} : le bouton ne dit plus « connectez-vous d abord » sans rien faire`);
  }

  console.log('\n-- au hall, la carte demande d abord qui vous etes --');
  {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 1000 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${site.port}/games.html`, { waitUntil: 'load' });
    await p.waitForTimeout(1600);
    const vif = await p.evaluate(() => {
      const a = document.getElementById('gxArcade');
      return a ? { pe: getComputedStyle(a).pointerEvents, href: a.getAttribute('href') } : null;
    });
    ok(!!vif && vif.pe === 'auto',
       'la carte repond au doigt — `a[href]{pointer-events:none}` regne sur cette page');
    /* Non connecte : le clic ouvre la connexion et NE CHANGE PAS de page. La
       decision est celle de `swogecx.js`, la meme que pour la marque. */
    const avant = p.url();
    await p.click('#gxArcade');
    await p.waitForTimeout(900);
    eq(p.url(), avant,
       'sans compte, le clic n emmene pas dans le monde : on y arriverait pour'
       + ' se voir demander de se connecter, une page plus loin');
    const porte = await p.evaluate(() =>
      !!document.querySelector('.swcon-ov.on')
      || !(document.getElementById('cxVoile') || { hidden: true }).hidden);
    ok(porte, 'il ouvre la porte de connexion a la place');
    await ctx.close();
  }

  console.log('\n-- et la banniere de SWOGE Bet ne s arrete pas en changeant de sport --');
  {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 1000 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${site.port}/swogebet.html`, { waitUntil: 'load' });
    await p.waitForTimeout(1800);
    const avant = await p.evaluate(() => {
      const f = document.getElementById('sbFilm');
      return f ? { src: f.getAttribute('src'), muet: f.muted, boucle: f.loop } : null;
    });
    ok(!!avant && avant.boucle && avant.muet,
       'elle tourne en boucle et sans son');
    /* On change d onglet comme un visiteur. Les onglets sont peints par le
       script ; s il n y en a pas (pas de serveur ici), on redessine la liste
       a la main, ce qui est exactement le geste que le changement declenche. */
    const onglets = await p.evaluate(() => document.querySelectorAll('#sbSports button').length);
    if (onglets > 1) {
      await p.click('#sbSports button:nth-of-type(2)');
    } else {
      await p.evaluate(() => { if (typeof window.sbRend === 'function') window.sbRend(); });
    }
    await p.waitForTimeout(600);
    const apres = await p.evaluate(() => {
      const f = document.getElementById('sbFilm');
      return f ? { src: f.getAttribute('src'), meme: true } : null;
    });
    ok(!!apres && apres.src === avant.src,
       `la meme banniere est toujours la apres le changement (${onglets} onglet(s)`
       + ' a l ecran) : elle ne suit plus le sport, elle vaut pour toutes les'
       + ' categories');
    /* Et l ancienne table d affiches par sport n est pas revenue. */
    const src = fs.readFileSync(path.join(SITE, 'swogebet.html'), 'utf8');
    ok(!/SB_IMG|sbPeintBanniere/.test(src),
       'et rien n echange plus d image selon l onglet');
    await ctx.close();
  }

  await nav.close(); site.stop();
  console.log(`\narcade_lien.test.js : ${n} verifications, ${echecs} echec(s)`);
  process.exit(echecs ? 1 : 0);
})();
