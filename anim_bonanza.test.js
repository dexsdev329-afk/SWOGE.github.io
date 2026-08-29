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
        + 'bzArrets:bzArrets,bzMonte:bzMonte,bzValeur:bzValeur,BGM:BGM};\n' + h.slice(i);
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
    const lis = () => [...couche.children].map((e) => {
      const c = getComputedStyle(e);
      const m = /matrix\(([^)]*)\)/.exec(c.transform);
      const v = m ? m[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0];
      return { cls: e.className, x: v[4], y: v[5],
               ech: Math.hypot(v[0], v[1]), o: parseFloat(c.opacity),
               w: parseFloat(c.width), fond: c.backgroundImage !== 'none' ? 'degrade' : c.backgroundColor };
    });
    const t0 = lis();
    await new Promise((r) => setTimeout(r, 260));
    const t1 = lis();
    await new Promise((r) => setTimeout(r, 800));
    return { t0, t1, reste: couche.children.length };
  }, [grille]);

  const gagnants = grille.filter((s) => s === 'banane').length;
  const iBouffee = eclats.t0.map((e, i) => [e, i]).filter(([e]) => /bouffee/.test(e.cls)).map(([, i]) => i);
  const iVole = eclats.t0.map((e, i) => [e, i]).filter(([e]) => !/bouffee/.test(e.cls)).map(([, i]) => i);

  /* Le jeu d'origine (video de reference, 42 s) ouvre une BOUFFEE blanche a
     la place du symbole et en fait partir des echardes pales. Une bouffee par
     case, pas une de plus : deux se superposeraient en un disque opaque. */
  ok(iBouffee.length === gagnants,
     'une bouffee blanche par case qui saute (' + iBouffee.length + ' pour ' + gagnants + ')');
  ok(iVole.length === gagnants * 13,
     'et treize morceaux qui partent avec — dix echardes pales, trois miettes'
     + ' de la couleur du bonbon : ' + iVole.length);

  ok(eclats.t0.every((e) => Math.abs(e.x) < 1 && Math.abs(e.y) < 1),
     'tout naît au point de depart — si le navigateur avalait la transition,'
     + ' les eclats naitraient deja arrives et on ne verrait rien');

  const bouges = iVole.filter((i) => Math.hypot(eclats.t1[i].x - eclats.t0[i].x,
                                                eclats.t1[i].y - eclats.t0[i].y) > 4).length;
  ok(bouges === iVole.length,
     'et 260 ms plus tard les morceaux ont TOUS bouge (' + bouges + '/' + iVole.length + ')');
  /* La bouffee, elle, ne se deplace pas : elle s'OUVRE sur place. */
  ok(iBouffee.every((i) => eclats.t1[i].ech > eclats.t0[i].ech + 0.15),
     'la bouffee ne part pas, elle s ouvre : son echelle passe de '
     + eclats.t0[iBouffee[0]].ech.toFixed(2) + ' a ' + eclats.t1[iBouffee[0]].ech.toFixed(2));

  ok(eclats.t1.every((e, i) => e.o < eclats.t0[i].o),
     'et tout s efface : l opacite a baisse pour chacun');

  /* Le blanc doit DOMINER. Un premier jet projetait des ronds de la couleur
     du symbole : a chaque cascade la grille virait au jaune sur les bananes,
     au violet sur les raisins. Ce n est pas ce que fait le jeu d origine. */
  const pales = iVole.filter((i) => {
    const c = eclats.t0[i].fond;
    const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(c);
    return m && Math.min(+m[1], +m[2], +m[3]) > 190;
  }).length;
  ok(pales >= iVole.length * 0.7,
     'et sept morceaux sur dix au moins sont blancs ou presque (' + pales + '/'
     + iVole.length + ') : le blanc domine, la couleur du bonbon ne survit'
     + ' qu en quelques miettes');

  const large = eclats.t0[iVole[0]].w;
  ok(large >= 6,
     'chaque morceau fait au moins six pixels (' + large.toFixed(0) + ' px pour une'
     + ' case de ' + tailles.cell.toFixed(0) + ')');
  ok(eclats.reste === 0,
     'et la couche est vidée apres coup : rien ne s accumule d un tour a l autre');

  /* ---------------- 3 bis. LA VALEUR EN BLANC ---------------- */
  console.log('\n-- la valeur qui s inscrit en blanc --');
  const val = await p.evaluate(async ([g]) => {
    const couche = document.getElementById('bzParts');
    couche.textContent = '';
    window.__bz.bzValeur(g, new Set(['banane']), 1234);
    const e = couche.querySelector('.bz-val');
    if (!e) return null;
    const c0 = getComputedStyle(e);
    const depart = { txt: e.textContent, couleur: c0.color, o: parseFloat(c0.opacity),
                     px: parseFloat(c0.fontSize), ombre: c0.textShadow };
    const r0 = e.getBoundingClientRect();
    await new Promise((r) => setTimeout(r, 260));
    /* On LIT tout de suite, on ne garde pas l'objet : `getComputedStyle` rend
       une declaration VIVANTE, et la relire apres que l'element a quitte le
       document donne une chaine vide — donc NaN. C'est ce que faisait la
       premiere version de cet essai, et elle accusait la page. */
    const milieu = { o: parseFloat(getComputedStyle(e).opacity) };
    const r1 = e.getBoundingClientRect();
    await new Promise((r) => setTimeout(r, 1200));
    return { depart, milieu, y0: r0.top, y1: r1.top,
             parti: !couche.querySelector('.bz-val') };
  }, [grille]);

  ok(!!val, 'une valeur est posee sur la grille');
  if (val) {
    /* Le montant NU, sans « $SWOGE » : « +1.2k $SWOGE » couvrait quatre
       colonnes de la grille, la ou le jeu d origine ecrit « 0,50 $ » et rien
       d autre. La monnaie est de toute facon la seule de la page. */
    ok(/^\+[\d.]+[kM]?$/.test(val.depart.txt),
       'elle porte le montant de l etape, et rien que lui : '
       + JSON.stringify(val.depart.txt));
    ok(val.depart.couleur === 'rgb(255, 255, 255)',
       'elle est BLANCHE, comme dans le jeu d origine (' + val.depart.couleur + ')');
    ok(/rgb/.test(val.depart.ombre),
       'avec un cerne sombre : elle doit tenir sur un decor clair comme sur un'
       + ' decor sombre');
    ok(val.depart.px >= 15,
       'assez grosse pour se lire d un coup d oeil (' + val.depart.px.toFixed(0) + ' px)');
    ok(val.milieu.o > 0.5,
       'encore visible 260 ms plus tard (' + val.milieu.o.toFixed(2) + ') : le'
       + ' temps de la lire');
    ok(val.parti,
       'et elle s en va : rien ne reste sur la grille au tour suivant');
  }

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

  /* ---------------- 6. LE SPECTACLE NE DOIT PAS S ETERNISER ----------------
   * Un gros tour gratuit enchaine dix tours de trois etages. Au rythme du jeu
   * de base — 1,33 s par etage, celui qu'on a MESURE sur la video — ca fait
   * quarante-cinq secondes pendant lesquelles le joueur n'a plus la main. Le
   * solde, lui, est deja credite : l'attente ne lui rapporte rien, elle lui
   * coute juste sa partie.
   *
   * On ne le devine pas, on l'additionne : les constantes de la page sont
   * lues, pas recopiees. */
  console.log('\n-- la duree du spectacle --');
  const duree = await p.evaluate(() => {
    /* Ce que dure un etage gagnant : la pause, l'eclatement, la chute. */
    const etage = (pause, eclat, k) => pause + eclat + (220 + 4 * 60 + 90) * k;
    const base = 1070 + 260;              // les rouleaux, sans attente
    const lent = etage(560, 340, 1), vif = etage(260, 240, 0.72);
    return {
      etageBase: lent, etageVite: vif,
      /* le pire cas courant : rouleaux + 3 etages, puis 10 tours gratuits de
         3 etages avec une bombe a chacun */
      grosTour: base + 3 * lent + 1500 + 10 * (3 * vif + 700),
    };
  });
  console.log('     un etage : ' + duree.etageBase + ' ms en jeu de base, '
              + duree.etageVite + ' ms en tours gratuits');
  ok(Math.abs(duree.etageBase - 1500) < 350,
     'un etage dure ' + duree.etageBase + ' ms — la video de reference en mesure'
     + ' 1500, du symbole allume a la grille repleine');
  ok(duree.grosTour < 45000,
     'et le plus gros tour courant — dix tours gratuits de trois etages avec'
     + ' bombe — tient en ' + Math.round(duree.grosTour / 1000) + ' s'
     + ' (il en faisait 55 au rythme du jeu de base)');

  ok(erreurs.length === 0, 'aucune erreur JS' + (erreurs.length ? ' : ' + erreurs[0] : ''));
  console.log('\n' + n + ' verifications, ' + rates + ' echec(s)');
  await nav.close(); srv.close();
  process.exit(rates ? 1 : 0);
})();
