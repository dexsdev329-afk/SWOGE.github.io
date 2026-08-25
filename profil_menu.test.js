'use strict';
/*
 * LE MENU DU COMPTE, SUR LES DEUX PAGES, DEPUIS UN SEUL FICHIER.
 *
 * ---- CE QUI ETAIT DEMANDE ----
 *
 * « Go to 🏠 Home / Account 👛 My Wallet … 🚪 Sign out — ca c est bien mais
 *   faut avoir acces de index html. »
 *
 * Le menu n existait que dans le hall. L accueil portait un avatar INERTE :
 * un rond avec une silhouette, au bout de la barre, qui ne repondait pas.
 *
 * ---- POURQUOI CET ESSAI ----
 *
 * Le remede evident — recopier les cent soixante lignes du hall dans
 * l accueil — aurait fait DEUX menus a tenir d accord, et le jour ou une
 * rangee change elle ne changerait que d un cote. Le comportement est donc
 * parti dans `swogeprofil.js`, partage. Cet essai verifie les deux choses que
 * ce choix peut casser :
 *
 *   1. que les deux pages chargent BIEN le meme fichier, et qu aucune n a
 *      garde sa copie ;
 *   2. que le menu marche VRAIMENT sur l accueil — pas seulement qu il est
 *      cable.
 *
 * ---- ET IL CLIQUE POUR DE VRAI ----
 *
 * Les deux pages portent `a[href], button{ pointer-events:none }` : elles sont
 * des maquettes, et leurs boutons gardent leur dessin sans repondre au doigt.
 * Un `.click()` lance depuis un script IGNORE cette regle. Un essai qui
 * cliquerait ainsi validerait donc un menu que personne ne peut ouvrir — le
 * piege s est deja referme cinq fois sur ce site. Ici, chaque clic passe par
 * Playwright, c est-a-dire par un vrai pointeur.
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

/* Le tiroir de `stakebubble.js`, dans sa FORME EXACTE : une boite `.swp`, une
   liste `.swp-t`, des titres de groupe `.swp-g`, des rangees `<button>`, et
   une poignee `.swpb` qui l ouvre. C est cette forme que le menu lit ; la
   decrire ici est ce qui rend l essai capable de voir un changement de forme
   plutot que de le suivre. */
const poseLeTiroir = () => {
  const d = document.createElement('div'); d.className = 'swp';
  const t = document.createElement('div'); t.className = 'swp-t';
  const g1 = document.createElement('div'); g1.className = 'swp-g'; g1.textContent = 'You';
  const b1 = document.createElement('button'); b1.dataset.k = 'ap'; b1.textContent = '👛 My Wallet';
  const b2 = document.createElement('button'); b2.dataset.k = 'sh'; b2.textContent = '🛒 Shop';
  const g2 = document.createElement('div'); g2.className = 'swp-g'; g2.textContent = 'Standing';
  const b3 = document.createElement('button'); b3.dataset.k = 'lb'; b3.textContent = '🏆 Leaderboard';
  /* Une rangee que la page CACHE ne doit pas ressortir ici : elle est cachee
     pour une raison, et la remontrer serait la rouvrir sans le dire. */
  const b4 = document.createElement('button'); b4.dataset.k = 'x'; b4.textContent = '🚫 Hidden';
  b4.style.display = 'none';
  window.__vuTiroir = null; window.__poignee = 0;
  [b1, b2, b3, b4].forEach((b) => b.addEventListener('click', () => {
    window.__vuTiroir = b.dataset.k;
  }));
  [g1, b1, b2, g2, b3, b4].forEach((e) => t.appendChild(e));
  d.appendChild(t); document.body.appendChild(d);
  const h = document.createElement('button'); h.className = 'swpb';
  h.addEventListener('click', () => { window.__poignee++; });
  document.body.appendChild(h);
};

(async () => {
  const site = await servirLeSite();
  const nav = await chromium.launch();

  console.log('\n-- un seul fichier, deux pages --');
  /* Le defaut qu on evite se voit dans le FICHIER, pas a l ecran : une page
     qui aurait garde sa copie marcherait parfaitement — jusqu au premier
     changement, qui ne la toucherait pas. */
  const src = { index: fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'),
                games: fs.readFileSync(path.join(SITE, 'games.html'), 'utf8') };
  for (const k of ['index', 'games']) {
    ok(/<script src="swogeprofil\.js\?v=[0-9a-f]{8}"/.test(src[k]),
       `${k}.html charge le fichier partage, avec son marqueur de cache`);
    ok(!/function\s+duTiroir\s*\(/.test(src[k]),
       `${k}.html n a pas garde de copie du menu en clair`);
  }
  const version = JSON.parse(fs.readFileSync(path.join(SITE, 'version.json'), 'utf8'));
  ok(!!version['swogeprofil.js'],
     'et le fichier est SUIVI par le mecanisme des marqueurs : sans cela, un'
     + ' navigateur garderait l ancien menu apres la prochaine correction');

  for (const page of ['index.html', 'games.html']) {
    console.log(`\n-- ${page} : sans compte --`);
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    const err = []; p.on('pageerror', (e) => err.push(e.message));
    await p.goto(`http://127.0.0.1:${site.port}/${page}`, { waitUntil: 'load' });
    await p.waitForTimeout(900);

    eq(await p.evaluate(() => {
      const b = document.getElementById('gxProfil'); return b ? b.tagName : 'ABSENT';
    }), 'BUTTON', `${page} : le profil est un vrai bouton, non un rond inerte`);

    /* Le VRAI clic. Sur un `<div>`, ou sous `pointer-events:none`, il echoue. */
    await p.click('#gxProfil');
    await p.waitForTimeout(350);
    const dehors = await p.evaluate(() => ({
      menu: !document.getElementById('gxMenu').hidden,
      porte: !!document.querySelector('.swcon-ov')
             || !((document.getElementById('cxVoile') || {}).hidden !== false),
    }));
    ok(!dehors.menu && dehors.porte,
       `${page} : sans compte, le profil ouvre la CONNEXION — un menu de compte`
       + ' propose a qui n en a pas repondrait « connectez-vous » a chaque rangee');
    await p.evaluate(() => {
      const v = document.getElementById('cxVoile'); if (v) v.hidden = true;
      const c = document.querySelector('.swcon-ov'); if (c) c.remove();
    });

    console.log(`\n-- ${page} : entre, par le tiroir seul --`);
    /* `#cxCompte` reste CACHE : c est le cas signale — dans le navigateur de
       Telegram il n existe aucune extension a interroger, donc `swogecx.js`
       peut ignorer une connexion que `stakebubble.js` a etablie. Le menu doit
       demander a la source des rangees qu il s apprete a montrer. */
    await p.evaluate(poseLeTiroir);
    await p.click('#gxProfil');
    await p.waitForTimeout(350);
    const vu = await p.evaluate(() => ({
      ouvert: !document.getElementById('gxMenu').hidden,
      dit: document.getElementById('gxProfil').getAttribute('aria-expanded'),
      rangees: [...document.querySelectorAll('#gxMenu a')].map((a) => a.textContent.trim()),
      groupes: [...document.querySelectorAll('#gxMenu .gx-g')].map((g) => g.textContent.trim()),
    }));
    ok(vu.ouvert, `${page} : entre, le profil ouvre le menu`);
    eq(vu.dit, 'true', `${page} : et il le DIT — un lecteur d ecran l annonce ouvert`);
    eq(vu.rangees.join(' | '), '👛My Wallet | 🛒Shop | 🏆Leaderboard',
       `${page} : les rangees sont celles du tiroir, dans son ordre`);
    eq(vu.groupes.join(' | '), 'You | Standing',
       `${page} : avec ses titres de groupe — sans eux, la liste ne se lit plus`);
    ok(!vu.rangees.some((x) => /Hidden/.test(x)),
       `${page} : et la rangee que la page CACHE ne ressort pas ici`);

    /* ---- LE CLIC D UNE RANGEE : LA POIGNEE D ABORD ----
     * Le gestionnaire d une rangee change l ONGLET du tiroir ; il ne MONTRE
     * pas la boite, parce que la-bas on ne peut cliquer une rangee qu une fois
     * le tiroir deja ouvert. Appelee sans la poignee, elle reglait l onglet
     * dans une boite invisible et le clic ne faisait VISIBLEMENT rien. */
    await p.click('#gxMenu a:nth-of-type(1)');
    await p.waitForTimeout(250);
    eq(await p.evaluate(() => window.__vuTiroir), 'ap',
       `${page} : cliquer une rangee appelle SA rangee d origine — et non un`
       + ' second chemin vers le meme panneau');
    eq(await p.evaluate(() => window.__poignee), 1,
       `${page} : la poignee est tiree AVANT, sinon l onglet change dans une`
       + ' boite que personne ne voit');
    ok(await p.evaluate(() => document.getElementById('gxMenu').hidden),
       `${page} : et le menu se referme derriere le clic`);

    /* Un menu qui reste ouvert sous le doigt avale le geste suivant. */
    await p.click('#gxProfil'); await p.waitForTimeout(200);
    await p.mouse.click(700, 700); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.getElementById('gxMenu').hidden),
       `${page} : un clic a cote le referme`);

    ok(err.length === 0, `${page} : aucune erreur de page${err.length ? ' — ' + err.join(' / ') : ''}`);
    await ctx.close();
  }

  /* ================== LA PREUVE PAR LE DEFAUT REMIS ==================
   * `#gxMenu a{ pointer-events:auto }` a l air d un detail de style. Sans lui,
   * le menu s ouvre, ses rangees s affichent, et AUCUNE ne repond : la panne
   * la plus trompeuse possible, parce qu elle a l air d un menu qui marche.
   * On remet le defaut pour verifier que l essai ci-dessus le verrait — une
   * verification qui passe aussi quand la regle manque ne protege de rien. */
  console.log('\n-- et sans la regle qui rend les rangees cliquables --');
  {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${site.port}/index.html`, { waitUntil: 'load' });
    await p.waitForTimeout(900);
    await p.addStyleTag({ content: '#gxMenu a{ pointer-events:none !important }' });
    await p.evaluate(poseLeTiroir);
    await p.click('#gxProfil'); await p.waitForTimeout(300);
    let mort = false;
    try { await p.click('#gxMenu a:nth-of-type(1)', { timeout: 2500 }); }
    catch (e) { mort = true; }
    ok(mort, 'le defaut remis fait ECHOUER le clic : l essai ci-dessus le verrait');
    eq(await p.evaluate(() => window.__vuTiroir), null,
       'et rien n a ete appele — le clic est bien passe a cote, pas juste lent');
    await ctx.close();
  }

  await nav.close(); site.stop();
  console.log(`\nprofil_menu.test.js : ${n} verifications, ${echecs} echec(s)`);
  process.exit(echecs ? 1 : 0);
})();
