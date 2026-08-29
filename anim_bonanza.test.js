/* LES ANIMATIONS DE SWOGE BONANZA, MESUREES.
 *
 * « Il faut que ca fasse comme le vrai jeu » ne se verifie pas a l'oeil sur
 * une capture : une animation qui ne part jamais et une animation trop
 * discrete se ressemblent, arretees. Les deux defauts qu'on a eus ici sont
 * justement de ceux-la.
 *
 *   • Les eclats ne partaient PAS. Etat de depart et etat d'arrivee poses
 *     dans le meme tour de boucle : le navigateur ne retenait que le dernier
 *     et sautait la transition. Sur une capture, ca donne « il n'y a pas
 *     d'eclats » — indiscernable d'un bug de creation.
 *   • Les symboles etaient trop petits, et pas du meme facteur : le raisin
 *     n'occupait que 71 % de la largeur de son fichier contre 100 % au
 *     bonbon vert, donc a taille CSS egale il s'affichait un tiers plus
 *     petit. Un defaut de DECOUPAGE, invisible dans la feuille de style.
 *
 * On mesure donc : la taille rendue de chaque symbole, le fait que les
 * eclats existent ET bougent ET s'effacent, et que la musique du jeu soit
 * bien celle qui est servie.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('anim_bonanza.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
            '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
            '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

const SYMBOLES = ['banane', 'raisin', 'pasteque', 'prune', 'pomme',
                  'bonbon_bleu', 'bonbon_vert', 'bonbon_violet', 'coeur', 'sucette'];

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    if (p === '/swoge_bonanza.html') {
      /* Les fonctions d'animation vivent dans une IIFE. On ouvre une lucarne
         pour les appeler d'ici — rien de ceci n'est servi au joueur. */
      let h = fs.readFileSync(f, 'utf8');
      const i = h.lastIndexOf('})();');
      h = h.slice(0, i)
        + '\n  window.__bz={bzPoseGrille:bzPoseGrille,bzPeint:bzPeint,bzEtincelles:bzEtincelles,'
        + 'bzArrets:bzArrets,bzMonte:bzMonte,BGM:BGM};\n' + h.slice(i);
      r.writeHead(200, { 'content-type': 'text/html' });
      return r.end(h);
    }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;

  const nav = await chromium.launch();
  const p = await nav.newPage({ viewport: { width: 430, height: 932 } });
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(e.message));
  await p.route('**/*', (r) => (r.request().url().includes('localhost:' + port)
    ? r.continue() : r.fulfill({ status: 503, body: '' })));
  await p.goto('http://localhost:' + port + '/swoge_bonanza.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);

  /* ---------------- 1. LA MUSIQUE DU JEU ---------------- */
  console.log('\n-- la musique --');
  const bgm = await p.evaluate(() => window.__bz.BGM);
  ok(/^son\/bonanza\/musique\.(ogg|mp3)$/.test(bgm[0]),
     'la premiere piste est celle du jeu, servie depuis le depot : ' + bgm[0]);
  ok(bgm[0].endsWith('.ogg'),
     'et c est le .ogg quand le navigateur sait le lire — le MP3 rajoute un'
     + ' remplissage qui revient a chaque tour de boucle');
  for (const f of ['son/bonanza/musique.ogg', 'son/bonanza/musique.mp3']) {
    ok(fs.existsSync(path.join(SITE, f)) && fs.statSync(path.join(SITE, f)).size > 100000,
       'le fichier ' + f + ' est bien la (' + Math.round(fs.statSync(path.join(SITE, f)).size / 1024) + ' Ko)');
  }
  const rep = await p.evaluate(async (u) => (await fetch(u)).status, 'son/bonanza/musique.ogg');
  ok(rep === 200, 'et il se telecharge vraiment depuis la page (HTTP ' + rep + ')');

  /* ---------------- 2. LA TAILLE DES SYMBOLES ---------------- */
  console.log('\n-- la taille des symboles --');
  const tailles = await p.evaluate(async ([syms]) => {
    const g = document.getElementById('bzGrille');
    window.__bz.bzPoseGrille();
    const cell = g.children[0].getBoundingClientRect();
    const out = [];
    for (const s of syms) {
      const im = new Image();
      im.src = 'img/bonanza/' + s + '.webp';
      await im.decode().catch(() => {});
      /* La part du fichier reellement occupee par le dessin : c'est elle qui
         decide de la taille rendue, `object-fit:contain` mettant a l'echelle
         sur le plus grand cote. */
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let yy = 0; yy < c.height; yy++) {
        for (let xx = 0; xx < c.width; xx++) {
          if (d[(yy * c.width + xx) * 4 + 3] > 8) {
            if (xx < x0) x0 = xx; if (xx > x1) x1 = xx;
            if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
          }
        }
      }
      const part = Math.max(x1 - x0 + 1, y1 - y0 + 1) / Math.max(c.width, c.height);
      out.push({ s, part });
    }
    const boite = getComputedStyle(g.children[0].firstChild).width;
    return { out, boite: parseFloat(boite), cell: cell.width };
  }, [SYMBOLES]);

  /* boite CSS × part occupee du fichier = ce que le joueur voit, en pixels. */
  const rendus = tailles.out.map((o) => ({ s: o.s, pct: 100 * o.part * tailles.boite / tailles.cell }));
  const mini = Math.min(...rendus.map((r) => r.pct));
  const maxi = Math.max(...rendus.map((r) => r.pct));
  ok(mini >= 92,
     'le plus petit symbole remplit au moins 92 % de sa case — il en remplissait'
     + ' 61 % : ' + rendus.reduce((a, b) => (a.pct < b.pct ? a : b)).s
     + ' a ' + mini.toFixed(0) + ' %');
  ok(maxi >= 98,
     'et le plus grand DEBORDE ou touche le bord (' + maxi.toFixed(0) + ' %) :'
     + ' c est ce debordement qui distingue une grille de bonbons d une grille de vignettes');
  ok(maxi - mini < 6,
     'les dix symboles sont a moins de six points l un de l autre ('
     + mini.toFixed(0) + '–' + maxi.toFixed(0) + ' %) : aucun ne parait plus petit'
     + ' qu un autre par accident de decoupage');

  /* ---------------- 3. LES ECLATS PARTENT VRAIMENT ---------------- */
  console.log('\n-- les eclats --');
  const grille = ['banane', 'raisin', 'pasteque', 'banane', 'prune', 'pomme',
                  'banane', 'banane', 'prune', 'raisin', 'banane', 'pasteque',
                  'pomme', 'banane', 'raisin', 'banane', 'pasteque', 'prune',
                  'raisin', 'pasteque', 'pomme', 'prune', 'raisin', 'pomme',
                  'prune', 'pomme', 'banane', 'pasteque', 'pomme', 'raisin'];
  const eclats = await p.evaluate(async ([g]) => {
    window.__bz.bzPeint(g, new Set(['banane']));
    const couche = document.getElementById('bzParts');
    window.__bz.bzEtincelles(g, new Set(['banane']));
    const nb = couche.children.length;
    const lis = () => [...couche.children].map((e) => {
      const c = getComputedStyle(e);
      const m = /matrix\(([^)]*)\)/.exec(c.transform);
      const v = m ? m[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0];
      return { x: v[4], y: v[5], o: parseFloat(c.opacity), w: parseFloat(c.width) };
    });
    const t0 = lis();
    await new Promise((r) => setTimeout(r, 260));
    const t1 = lis();
    await new Promise((r) => setTimeout(r, 700));
    return { nb, t0, t1, reste: couche.children.length };
  }, [grille]);

  const gagnants = grille.filter((s) => s === 'banane').length;
  ok(eclats.nb === gagnants * 9,
     'neuf eclats par case qui saute, et pas un de plus : ' + eclats.nb
     + ' pour ' + gagnants + ' cases');
  ok(eclats.t0.every((e) => Math.abs(e.x) < 1 && Math.abs(e.y) < 1),
     'ils naissent TOUS a leur point de depart — si le navigateur avalait la'
     + ' transition, ils naitraient deja arrives et on ne verrait rien');
  const bouges = eclats.t1.filter((e, i) => Math.hypot(e.x - eclats.t0[i].x, e.y - eclats.t0[i].y) > 4).length;
  ok(bouges === eclats.nb,
     'et 260 ms plus tard ils ont TOUS bouge (' + bouges + '/' + eclats.nb + ')');
  ok(eclats.t1.every((e) => e.o < eclats.t0[0].o),
     'en s effacant : l opacite a baisse pour chacun');
  const large = eclats.t0[0].w;
  ok(large >= 12,
     'chaque eclat fait au moins douze pixels (' + large.toFixed(0) + ' px pour une'
     + ' case de ' + tailles.cell.toFixed(0) + ') : a neuf pixels fixes ils disparaissaient sur le decor');
  ok(eclats.reste === 0,
     'et la couche est vidée apres coup : rien ne s accumule d un tour a l autre');

  /* ---------------- 4. L'ATTENTE SUR LES SUCETTES ---------------- */
  console.log('\n-- l attente avant la derniere sucette --');
  const ordinaire = await p.evaluate(([g]) => window.__bz.bzArrets(g), [grille]);
  const troisSucettes = grille.slice();
  troisSucettes[0] = 'sucette'; troisSucettes[7] = 'sucette'; troisSucettes[14] = 'sucette';
  const tendu = await p.evaluate(([g]) => window.__bz.bzArrets(g), [troisSucettes]);
  ok(ordinaire.tendus.every((x) => !x),
     'un tour ordinaire ne ralentit aucune colonne : sans quoi l attente ne'
     + ' voudrait plus rien dire');
  ok(tendu.tendus.filter((x) => x).length >= 2,
     'trois sucettes deja tombees et les colonnes suivantes ralentissent ('
     + tendu.tendus.filter((x) => x).length + ' colonnes)');
  ok(tendu.arrets[5] > ordinaire.arrets[5] + 400,
     'le tour dure alors plus longtemps (' + tendu.arrets[5] + ' ms contre '
     + ordinaire.arrets[5] + ') — c est le moment que toute machine fait durer');

  /* ---------------- 5. LE COMPTEUR MONTE ---------------- */
  console.log('\n-- le gain monte au lieu d apparaitre --');
  const suite = await p.evaluate(() => new Promise((res) => {
    const vus = [];
    window.__bz.bzMonte(0, 1000, 300, (v) => vus.push(v));
    setTimeout(() => res(vus), 520);
  }));
  ok(suite.length > 6, 'le compteur passe par plusieurs valeurs (' + suite.length + ')');
  ok(suite.every((v, i) => i === 0 || v >= suite[i - 1]),
     'il ne redescend jamais en chemin');
  ok(Math.abs(suite[suite.length - 1] - 1000) < 0.001,
     'et il finit EXACTEMENT sur le chiffre du serveur (' + suite[suite.length - 1]
     + ') : un compteur qui s arrete a 999 ferait mentir la page');

  ok(erreurs.length === 0, 'aucune erreur JS' + (erreurs.length ? ' : ' + erreurs[0] : ''));
  console.log('\n' + n + ' verifications, ' + rates + ' echec(s)');
  await nav.close(); srv.close();
  process.exit(rates ? 1 : 0);
})();
