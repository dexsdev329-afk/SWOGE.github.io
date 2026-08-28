'use strict';
/*
 * LA FLECHE QUI CHANGE DE JEU.
 *
 * ---- ce qui etait demande ----
 *
 * « une fois qu'on est sur le blackjack, ce serait bien qu'au centre sur la
 * gauche il y ait une petite fleche qui nous fasse changer de jeu, a chaque
 * fois un different, ca defile — comme ca les gens peuvent changer de jeu plus
 * rapidement ».
 *
 * ---- ce que cet essai verrouille ----
 *
 *  1. LA LISTE N'EXISTE QU'UNE FOIS. Elle est ecrite dans `stakebubble.js` et
 *     dessinee dans `games.html`. Deux listes qui disent la meme chose
 *     divergent au premier ajout — ce depot l'a paye quatre fois. On compare
 *     donc les adresses, une a une, dans l'ordre.
 *  2. ELLE APPARAIT SUR UN JEU, ET NULLE PART AILLEURS. Sur le hall, elle
 *     serait un raccourci vers ce qu'on est deja en train de regarder.
 *  3. ELLE MENE QUELQUE PART. Chaque adresse de la liste existe sur le disque.
 *  4. ELLE FAIT LE TOUR. Depuis le premier jeu on arrive au dernier : sans le
 *     bouclage, la fleche s'eteint au bout de la rangee sans le dire.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}

const SITE = __dirname;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} [${JSON.stringify(a)} vs ${JSON.stringify(b)}]`);

/* ---- 1. LES DEUX LISTES ---- */
console.log('\n-- une seule liste, deux endroits qui la lisent --');
const js = fs.readFileSync(path.join(SITE, 'stakebubble.js'), 'utf8');
const html = fs.readFileSync(path.join(SITE, 'games.html'), 'utf8');

const bloc = /var MAISON = \[([\s\S]*?)\n  \];/.exec(js);
ok(!!bloc, 'la liste se lit dans stakebubble.js');
const duJs = bloc ? [...bloc[1].matchAll(/u: '([^']+)'/g)].map((m) => m[1]) : [];

const deb = html.indexOf('aria-label="Against the house"');
const bornes = [html.indexOf('<div class="piste"', deb + 10), html.indexOf('</section>', deb)]
  .filter((x) => x > 0);
const rangee = html.slice(deb, Math.min(...bornes));
const duHtml = [...rangee.matchAll(/<a class="jc[^>]*href="([^"]+)"/g)].map((m) => m[1]);

ok(duHtml.length > 0, `la rangee de games.html porte ${duHtml.length} jeu(x)`);
eq(duJs.join(' | '), duHtml.join(' | '),
   'et la liste du script dit EXACTEMENT la meme chose, dans le meme ordre');

/* ---- 3. CHAQUE ADRESSE MENE QUELQUE PART ---- */
console.log('\n-- chaque jeu existe --');
for (const u of duJs) {
  const f = u.split('?')[0];
  ok(fs.existsSync(path.join(SITE, f)), `${f} est sur le disque`);
}

if (!chromium) {
  console.log('\n(playwright absent : le reste de l essai est saute)');
  console.log(`\njeux_fleche.test.js : ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
}

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json' };

(async () => {
  const s = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const port = s.address().port;
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const va = async (url, larg) => {
    const p = await nav.newPage({ viewport: { width: larg, height: 800 },
                                  isMobile: larg < 700, hasTouch: larg < 700 });
    await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2200);
    return p;
  };
  const lis = (p) => p.evaluate(() => {
    const b = document.getElementById('swjx');
    if (!b) return { la: false };
    const r = b.getBoundingClientRect();
    const s = getComputedStyle(b);
    return { la: true, vu: s.display !== 'none',
             texte: b.textContent.replace(/\s+/g, ' ').trim(),
             titre: b.title,
             gauche: Math.round(r.left),
             milieu: Math.round(r.top + r.height / 2 - window.innerHeight / 2),
             touchable: s.pointerEvents !== 'none' };
  });

  console.log('\n-- sur le blackjack, telephone --');
  {
    const p = await va('swoge_blackjack.html?table=or', 390);
    const v = await lis(p);
    ok(v.la && v.vu, 'la fleche est la');
    ok(v.gauche <= 2, `collee au bord gauche (${v.gauche} px)`);
    ok(Math.abs(v.milieu) <= 24, `et a mi-hauteur (${v.milieu} px du centre)`);
    ok(v.touchable, 'et elle se laisse toucher');
    /* Le blackjack est le PREMIER de la rangee : la fleche doit boucler sur le
       dernier, sinon elle s'eteint au bout sans le dire. */
    ok(/Smash/i.test(v.texte), `elle boucle sur le dernier jeu (${JSON.stringify(v.texte)})`);
    await p.click('#swjx');
    await p.waitForTimeout(1500);
    ok(/swoge_smash\.html/.test(p.url()), `et elle y mene vraiment (${p.url().split('/').pop()})`);
    await p.close();
  }

  console.log('\n-- au milieu de la rangee --');
  {
    const p = await va('swoge_casino.html?game=mines', 390);
    const v = await lis(p);
    ok(v.la && v.vu, 'elle est la aussi');
    ok(/Three Card/i.test(v.texte),
       `et elle nomme le jeu PRECEDENT, pas un autre (${JSON.stringify(v.texte)})`);
    await p.close();
  }

  console.log('\n-- la ou elle n a rien a faire --');
  {
    const p = await va('games.html', 390);
    const v = await lis(p);
    ok(!v.la, 'pas de fleche dans le hall : on y choisit deja');
    await p.close();
    const g = await va('swoge_blackjack.html?table=or', 1400);
    const w = await lis(g);
    ok(!w.la || !w.vu, 'ni sur grand ecran, ou le hall est a un onglet');
    await g.close();
  }

  await nav.close(); s.close();
  console.log(rates ? `\njeux_fleche.test.js : ${rates} echec(s) sur ${n}\n`
                    : `\njeux_fleche.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
