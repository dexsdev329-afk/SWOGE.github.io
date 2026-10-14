'use strict';
/*
 * SOUS 1360 PX, LE MENU COMMUN DEVIENT UNE RANGEE — IL NE DISPARAIT PAS.
 *
 * ---- LE DEFAUT (releve du 13/10, revue du Studio) ----
 *
 * Trente-sept des quarante-trois pages qui portent le lien studio.html
 * cachaient TOUTE leur colonne de menu sous 1360 px de large
 * (`@media (max-width:1360px){ .sw-cote, .sw-lat{ display:none } }`), sans
 * burger ni rangee de remplacement : a 1024x768 et a 1280x800 — deux
 * ecrans de portable ordinaires — le menu etait dans le balisage, dans le
 * bon ordre, et ne se dessinait pas. Studio visible et cliquable sur 5 pages
 * sur 43 a 1024, 6 a 1280, 43 a 1366 (revue2_fidelite/s8_menu_pages.js).
 * Sur trois pages (swoge_cinema, swoge_polymarket, swoge_polymarket_ai) un
 * burger ouvrait la colonne : il fallait savoir qu il etait la.
 * (swoge_polymarket_ai est retiree le 14/10/2026 : un renvoi sans colonne.)
 *
 * ---- CE QUE L ESSAI TIENT ----
 *
 * Sur TOUTES les pages qui portent la colonne `.sw-cote` (relevees dans le
 * dossier, pas une liste ecrite a la main), de 320 a 1360 px :
 *   - les neuf entrees du menu commun, dans l ordre, Studio compris ;
 *   - chacune recoit le clic a son centre, sans rien ouvrir d abord : la
 *     rangee defile sur elle-meme (celle de index.html sous 980 px) ;
 *   - la PAGE ne defile pas en largeur (la rangee defile, pas le document).
 * Et au-dessus (1440 px), la colonne reste une colonne : liens empiles.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('menu_rangee.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
            '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
const MENU = 'index.html,games.html,swogebet.html,swoge_wallet.html,swoge_ai.html,swoge_agents.html,studio.html,launchpad.html,whitepaper.html';
const LARGEURS = [[320, 640], [390, 844], [768, 1000], [1024, 768], [1280, 800], [1360, 768]];

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(SITE, p);
    /* Les films ne sont pas servis : la mise en page n en depend pas, et les
       attendre ralentissait l essai sans rien mesurer de plus. */
    if (!f.startsWith(SITE) || /\.(mp4|webm|mp3|ogg)$/.test(f) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();

  const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'))
    .filter((f) => /<aside class="sw-cote">/.test(fs.readFileSync(path.join(SITE, f), 'utf8'))).sort();
  ok(pages.length >= 30 && pages.includes('swoge_agents.html') && pages.includes('launchpad.html'),
     pages.length + ' pages portent la colonne du menu commun');

  const mesure = () => {
    const nv = document.querySelector('.sw-cote .sw-nav');
    if (!nv) return { absent: true };
    const liens = [...nv.querySelectorAll('a[href]')];
    const entrees = liens.map((a) => {
      /* Le lien est amene dans la vue PAR LA RANGEE qui defile (et la page si
         besoin), comme le ferait un doigt ; puis on regarde ce qui recoit le
         clic a son centre. Rien n est ouvert avant. */
      a.scrollIntoView({ block: 'center', inline: 'center' });
      const b = a.getBoundingClientRect();
      const s = getComputedStyle(a);
      if (!b.width || !b.height || s.visibility === 'hidden') return { h: a.getAttribute('href'), ok: false, pourquoi: 'invisible' };
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) return { h: a.getAttribute('href'), ok: false, pourquoi: 'hors ecran' };
      const e = document.elementFromPoint(x, y);
      return { h: a.getAttribute('href'), ok: !!e && (e === a || a.contains(e)), pourquoi: e ? 'couvert par ' + e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] : 'rien' };
    });
    scrollTo(0, 0);
    const r = liens.map((a) => a.getBoundingClientRect());
    return {
      entrees,
      empiles: r.every((q, i) => i === 0 || q.top >= r[i - 1].bottom - 1),
      /* La part du MENU dans le defilement en largeur, mesuree au meme instant : la largeur du
         document avec la rangee, puis sans elle. Une barre du haut qui depasse deja (voir plus bas)
         ne doit ni cacher ni etre imputee a la rangee. */
      largeur: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      sortants: [...document.querySelectorAll('.sw-cote *')].filter((e) => {
        const q = e.getBoundingClientRect(); if (!q.width || !q.height) return false;
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(a).overflowX)) return false;
        return q.right > innerWidth + 0.5 || q.left < -0.5;
      }).length,
      sansMenu: (() => { const c = document.querySelector('.sw-cote'); const d = c.style.display; c.style.display = 'none';
        const l = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth); c.style.display = d; return l; })(),
    };
  };

  for (const [w, h] of LARGEURS) {
    const fautives = [], debords = [], avant = [];
    const ctx = await nav.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.route((u) => !u.href.startsWith(base), (r) => r.abort());
    for (const f of pages) {
      try {
        /* Apres `load` et 500 ms : pendant les ~100 premieres ms, l avatar de la barre depasse de 6 px
           sur la plupart des pages (swogebet compris, que ce changement ne touche pas) avant que la barre
           ne se range — l etat qu on mesure est celui qui reste. */
        await p.goto(base + f, { waitUntil: 'load' });
        await p.waitForTimeout(500);
        const m = await p.evaluate(mesure);
        if (m.absent) { fautives.push(f + ' (pas de .sw-nav)'); continue; }
        /* Les neuf entrees communes, dans l ordre ; une page peut en ajouter une a elle (launchpad :
           « Burn », swoge_cinema, swoge_polymarket : la page elle-meme), qui doit recevoir le clic
           aussi. agent_store.html marque son entree d un `?mode=store` : c est la meme adresse. */
        const communes = new Set(MENU.split(','));
        const liste = m.entrees.map((x) => x.h.replace(/\?mode=store$/, '')).filter((h) => communes.has(h)).join(',');
        const morts = m.entrees.filter((x) => !x.ok);
        if (liste !== MENU) fautives.push(f + ' (menu : ' + liste + ')');
        else if (morts.length) fautives.push(f + ' (' + morts.map((x) => x.h + ' ' + x.pourquoi).join(', ') + ')');
        if (m.largeur > Math.max(w, m.sansMenu) || m.sortants) debords.push(f + ' (' + m.largeur + ' px avec la rangee, ' + m.sansMenu + ' sans' + (m.sortants ? ', ' + m.sortants + ' elements du menu hors de l ecran' : '') + ')');
        else if (m.largeur > w) avant.push(f + ' (' + m.largeur + ' px)');
      } catch (e) { fautives.push(f + ' (' + e.message.split('\n')[0].slice(0, 70) + ')'); }
    }
    await ctx.close();
    ok(fautives.length === 0, w + 'x' + h + ' : sur les ' + pages.length + ' pages, les neuf entrees du menu (Studio compris) recoivent le clic sans rien ouvrir'
       + (fautives.length ? ' — ' + fautives.length + ' fautives : ' + fautives.join(' | ') : ''));
    ok(debords.length === 0, w + 'x' + h + ' : la rangee ne fait defiler aucune page en largeur'
       + (debords.length ? ' — ' + debords.join(', ') : ''));
    /* Releve du 14/10, sur le main d avant ce changement aussi : de 620 a ~790 px, la barre du haut
       ne se replie pas et les pastilles de stakebubble.js y poussent l avatar de 1 a 6 px hors de
       l ecran (swoge_smash en permanence, d autres pendant ~100 ms au chargement). C est la barre,
       pas le menu : dit ici sans le compter, pour ne pas le perdre de vue. */
    if (avant.length) console.log('  note ' + w + 'x' + h + ' : la barre du haut depasse deja, menu cache compris — ' + avant.join(', '));
  }

  /* Au-dessus de 1360 px, la colonne reste une colonne : la rangee ne vaut que la ou la colonne
     n a pas la place. */
  {
    const nonColonne = [];
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.route((u) => !u.href.startsWith(base), (r) => r.abort());
    for (const f of pages) {
      try {
        await p.goto(base + f, { waitUntil: 'domcontentloaded' });
        await p.waitForTimeout(250);
        const m = await p.evaluate(mesure);
        if (m.absent || !m.empiles || m.entrees.some((x) => !x.ok)) nonColonne.push(f);
      } catch (e) { nonColonne.push(f + ' (' + e.message.split('\n')[0].slice(0, 70) + ')'); }
    }
    await ctx.close();
    ok(nonColonne.length === 0, '1440x900 : la colonne reste une colonne, liens empiles et cliquables'
       + (nonColonne.length ? ' — ' + nonColonne.join(', ') : ''));
  }

  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
