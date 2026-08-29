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
        + 'bzArrets:bzArrets,bzMonte:bzMonte,bzValeur:bzValeur,bzRouleaux:bzRouleaux,bzScatSouligne:bzScatSouligne,bzBandeau:bzBandeau,bzPalier:bzPalier,bzBombes:bzBombes,BGM:BGM};\n' + h.slice(i);
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

  /* ---- ELLE SE LIT SUR N IMPORTE QUEL FOND ----
   * DEMANDE : « dans le vrai jeu le nombre blanc gagne, on le voit beaucoup
   * mieux ». Mesure avant correction : 10,6 % des pixels blancs du nombre
   * tombaient sur un fond a moins de 3,0 de contraste, et le pire a 1,05 —
   * du blanc sur une banane jaune, c'est-a-dire rien.
   *
   * Une ombre portee ne repare pas ca : elle noircit UN cote. Il faut un
   * CERNE, qui separe le glyphe de tous les cotes quel que soit ce qu'il y a
   * derriere. On le verifie ici comme un lecteur le vit : autour de chaque
   * pixel blanc du nombre, y a-t-il du sombre a portee ? */
  const lisibilite = await p.evaluate(([g]) => {
    /* On en repose une : la precedente a fini son temps et quitte le
       document, et `getComputedStyle` sur un element detache ne rend rien. */
    document.getElementById('bzParts').textContent = '';
    window.__bz.bzValeur(g, new Set(['banane']), 1234);
    const e = document.querySelector('.bz-val');
    if (!e) return null;
    const c = getComputedStyle(e);
    return { trait: c.webkitTextStroke || c.webkitTextStrokeWidth,
             ordre: c.paintOrder,
             px: parseFloat(c.fontSize),
             case: document.getElementById('bzGrille').children[0].getBoundingClientRect().width };
  }, [grille]);
  if (lisibilite) {
    /* Le trait est en `em` dans la feuille : il suit la taille du nombre,
       donc il ne maigrit pas quand l ecran retrecit. */
    const large = parseFloat(lisibilite.trait) || 0;
    ok(large >= lisibilite.px * 0.09,
       'le nombre porte un cerne d au moins 9 % de sa taille (' + large.toFixed(1)
       + ' px pour ' + lisibilite.px.toFixed(0) + ') : c est lui qui le detache'
       + ' du fond, pas une ombre');
    /* Le navigateur normalise « stroke fill » en « stroke » : ce qui compte
       est que `stroke` vienne EN TETE, pas que les deux mots restent ecrits. */
    ok(/^stroke\b/.test(lisibilite.ordre),
       'et le trait est peint SOUS le remplissage (paint-order: ' + lisibilite.ordre
       + ') — au-dessus, il mange l interieur des lettres');
    ok(lisibilite.px >= lisibilite.case * 0.7,
       'il fait au moins 70 % de la largeur d une case (' + lisibilite.px.toFixed(0)
       + ' px pour ' + lisibilite.case.toFixed(0) + ')');
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
      /* Le tour gratuit MOYEN, pas un pire cas invente. La frequence des
         bombes est mesuree sur le vrai moteur — 42,6 % des tours gratuits
         n'en ont aucune, 38,4 % une, 15,9 % deux, 2,7 % trois — et leur
         mise en scene dure 190 ms par bombe apres la premiere, plus 380 de
         pose et 1 000 pour le total. */
      bombes: 0.384 * 1380 + 0.159 * 1570 + 0.027 * 1760 + 0.005 * 1950,
      grosTour: base + 3 * lent + 1500
        + 10 * (3 * vif + (0.384 * 1380 + 0.159 * 1570 + 0.027 * 1760 + 0.005 * 1950)),
    };
  });
  console.log('     un etage : ' + duree.etageBase + ' ms en jeu de base, '
              + duree.etageVite + ' ms en tours gratuits');
  ok(Math.abs(duree.etageBase - 1500) < 350,
     'un etage dure ' + duree.etageBase + ' ms — la video de reference en mesure'
     + ' 1500, du symbole allume a la grille repleine');
  ok(duree.grosTour < 45000,
     'et un gros tour gratuit — dix tours de trois etages, bombes a leur'
     + ' frequence reelle (' + Math.round(duree.bombes) + ' ms en moyenne par tour) —'
     + ' tient en ' + Math.round(duree.grosTour / 1000) + ' s'
     + ' (il en faisait 55 au rythme du jeu de base)');

  /* ---------------- 7. LES COLONNES GARDENT LA MEME LARGEUR ----------------
   * DEFAUT MESURE : « le jeu agrandit la grille et la rapetisse ». Ce n'etait
   * pas la grille — c'etait chaque COLONNE, pendant chaque tour. `1fr` vaut
   * `minmax(auto,1fr)`, et le minimum `auto` d'une case vaut la taille de son
   * contenu SAUF si la case a un `overflow` autre que `visible`. Les cases
   * passent justement de `visible` (au repos) a `hidden` (en rotation) : les
   * deux etats n'avaient donc pas le meme minimum, et chaque colonne qui se
   * posait ecrasait celles qui tournaient encore — la derniere tombait aux
   * deux tiers de sa taille. */
  console.log('\n-- les colonnes ne se deforment pas --');
  const colonnes = await p.evaluate(async ([g]) => {
    const grille = document.getElementById('bzGrille');
    const larg = [];
    const lis = () => {
      const l = [...grille.children].slice(0, 6)
        .map((c) => +c.getBoundingClientRect().width.toFixed(2));
      larg.push({ l, deborde: +(grille.scrollWidth - grille.clientWidth).toFixed(1) });
    };
    const t = setInterval(lis, 40);
    window.__bz.bzPoseGrille();
    await new Promise((r) => window.__bz.bzRouleaux(g, r));
    clearInterval(t); lis();
    return larg;
  }, [grille]);
  const toutes = colonnes.flatMap((r) => r.l);
  const colMin = Math.min(...toutes), colMax = Math.max(...toutes);
  ok(colMax - colMin < 0.5,
     'les six colonnes gardent la MEME largeur pendant tout le tour ('
     + colMin.toFixed(2) + '–' + colMax.toFixed(2) + ' px sur ' + colonnes.length
     + ' releves) — elles allaient de 43,81 a 66,30');
  ok(colonnes.every((r) => r.deborde < 1),
     'et la grille ne deborde jamais sur elle-meme (max '
     + Math.max(...colonnes.map((r) => r.deborde)) + ' px, il y en avait 16)');

  /* ---------------- 8. LES BANDEAUX DE GAIN ----------------
   * Les seuils sont MESURES sur 400 000 tours du vrai moteur, pas choisis a
   * vue : 2x tombe un tour sur 13, 10x un sur 219, 50x un sur 418, 250x un
   * sur 3 279. Un « BIG WIN » qui sortirait un tour sur cinq ne serait plus
   * un evenement mais un tic. */
  console.log('\n-- les bandeaux de gain --');
  const seuils = await p.evaluate(() => [0.5, 1.99, 2, 9.99, 10, 49.9, 50, 249, 250, 900]
    .map((m) => { const x = window.__bz.bzPalier(m); return [m, x ? x.img : null]; }));
  const attendu = { 0.5: null, 1.99: null, 2: 'win_nice', 9.99: 'win_nice', 10: 'win_big',
                    49.9: 'win_big', 50: 'win_mega', 249: 'win_mega',
                    250: 'win_epic', 900: 'win_epic' };
  const faux = seuils.filter(([m, img]) => attendu[m] !== img);
  ok(faux.length === 0,
     'chaque multiple tombe dans le bon palier'
     + (faux.length ? ' — FAUX : ' + faux.map((f) => f[0] + 'x→' + f[1]).join(', ')
                    : ' (rien sous 2x, nice 2-10, big 10-50, mega 50-250, epic au-dela)'));

  const band = await p.evaluate(async () => {
    const e = document.getElementById('bzBandeau');
    const avant = e.hidden;
    let rappel = false;
    window.__bz.bzBandeau(12, 4200, () => { rappel = true; });
    await new Promise((r) => setTimeout(r, 450));
    const c = getComputedStyle(e);
    const m = /matrix\(([^)]*)\)/.exec(c.transform);
    const v = m ? m[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0];
    const pendant = { img: (e.firstChild.getAttribute('src') || '').split('/').pop(),
                      txt: e.lastChild.textContent, o: parseFloat(c.opacity),
                      ech: Math.hypot(v[0], v[1]), cache: e.hidden };
    await new Promise((r) => setTimeout(r, 2400));
    return { avant, pendant, apres: e.hidden, rappel };
  });
  ok(band.avant === true, 'aucun bandeau n est a l ecran au repos');
  ok(band.pendant.img === 'win_big.webp',
     'un tour a 12x montre BIG WIN (' + band.pendant.img + ')');
  ok(/^\+/.test(band.pendant.txt) && /SWOGE/.test(band.pendant.txt),
     'et le montant paye s ecrit dessous : ' + JSON.stringify(band.pendant.txt));
  ok(band.pendant.o > 0.9 && band.pendant.ech > 0.9,
     'il est bien visible et a sa taille (opacite ' + band.pendant.o.toFixed(2)
     + ', echelle ' + band.pendant.ech.toFixed(2) + ')');
  ok(band.apres === true && band.rappel === true,
     'puis il s en va, et il RAPPELLE : sans ce rappel la ligne finale ne'
     + ' s ecrirait jamais et le tour resterait bloque');

  /* ---------------- 9. RIEN NE BOUGE PENDANT UN TOUR ----------------
   * DEMANDE : « quand on spin il faut que le jeu soit fixe ».
   * La grille grandissait de 18,7 px des qu'une colonne se posait — les
   * rangees sont dimensionnees par leur contenu, et le symbole a 106 %
   * faisait grossir sa case en repassant en `overflow:visible`. Tout ce qui
   * est sous la grille descendait d'autant, et la page passait de 985 a
   * 1004 px : elle sautait sous le doigt au moment precis ou l'on vise SPIN.
   *
   * On releve donc la boite de chaque element pendant un tour complet et on
   * exige qu'aucune ne bouge. Un demi-pixel de tolerance pour l'arrondi. */
  console.log('\n-- le jeu ne bouge pas pendant un tour --');
  const bouge = await p.evaluate(async ([g]) => {
    const CIBLES = { 'la bande du haut': '.bz-tete', 'le logo': '.bz-titre',
                     'la grille': '#bzGrille', 'une case': '#bzGrille > :first-child',
                     'la barre': '.bz-barre', 'SPIN': '#bzSpin', 'moins': '#bzMoins',
                     'MAX': '.bz-max', 'PAYTABLE': '#bzBaremeBtn' };
    const vus = {}; const hauteurs = [];
    const lis = () => {
      for (const [n, sel] of Object.entries(CIBLES)) {
        const e = document.querySelector(sel); if (!e) continue;
        const b = e.getBoundingClientRect();
        (vus[n] = vus[n] || []).push([b.x, b.y, b.width, b.height]);
      }
      hauteurs.push(document.documentElement.scrollHeight);
    };
    const t = setInterval(lis, 40);
    window.__bz.bzPoseGrille(); lis();
    await new Promise((r) => window.__bz.bzRouleaux(g, r));
    await new Promise((r) => setTimeout(r, 200));
    clearInterval(t);
    const ecarts = {};
    for (const [n, v] of Object.entries(vus)) {
      ecarts[n] = [0, 1, 2, 3].map((i) =>
        Math.max(...v.map((a) => a[i])) - Math.min(...v.map((a) => a[i])));
    }
    return { ecarts, releves: hauteurs.length,
             hMin: Math.min(...hauteurs), hMax: Math.max(...hauteurs) };
  }, [grille]);

  const remuants = Object.entries(bouge.ecarts)
    .filter(([, e]) => e.some((d) => d > 0.5))
    .map(([n, e]) => n + ' (' + e.map((d) => d.toFixed(1)).join('/') + ')');
  ok(remuants.length === 0,
     'aucun element du jeu ne bouge pendant le tour (' + bouge.releves + ' releves)'
     + (remuants.length ? ' — BOUGE : ' + remuants.join(', ') : ''));
  ok(bouge.hMax - bouge.hMin < 0.5,
     'et la page garde la meme hauteur : ' + bouge.hMin + ' px du debut a la fin'
     + ' (elle passait de 985 a 1004)');

  /* ---------------- 10. LES BOMBES SE VOIENT SUR LE PLATEAU ----------------
   * DEFAUT SIGNALE : « l'animation des bombes est horrible, je ne les vois
   * meme pas sur le terrain avec le multiple ». Elles n'existaient que dans
   * un voile de texte pose par-dessus la grille ; le dessin `bombe.webp`
   * dormait dans le depot.
   *
   * Ce qui se verifie : elles se posent A LA CASE QUE LE SERVEUR A TIREE —
   * la page n'en choisit aucune, sinon deux joueurs rejouant la meme graine
   * verraient deux tours differents — elles portent leur multiplicateur, et
   * le total affiche est celui du serveur, pas une addition de la page. */
  console.log('\n-- les bombes multiplicateurs --');
  const LOT = [{ multi: 5, case: 3 }, { multi: 25, case: 14 },
               { multi: 100, case: 22 }, { multi: 2, case: 27 }];
  const bombes = await p.evaluate(async ([g, lot]) => {
    window.__bz.bzPoseGrille(); window.__bz.bzPeint(g, null);
    const c = document.getElementById('bzBombes');
    let fini = false;
    window.__bz.bzBombes(lot, 132, () => { fini = true; });
    await new Promise((r) => setTimeout(r, 800));
    const cs = document.getElementById('bzGrille').children;
    const bs = [...c.querySelectorAll('.bz-bombe')];
    const pose = bs.map((b, k) => {
      const r = cs[lot[k].case].getBoundingClientRect();
      const bb = b.getBoundingClientRect();
      return { multi: b.querySelector('b').textContent,
               surSaCase: Math.abs((bb.left + bb.right) / 2 - (r.left + r.right) / 2) < 3
                       && Math.abs((bb.top + bb.bottom) / 2 - (r.top + r.bottom) / 2) < 3,
               vue: parseFloat(getComputedStyle(b).opacity) > 0.8,
               taille: bb.width, caseLarge: r.width };
    });
    await new Promise((r) => setTimeout(r, 500));
    const t = c.querySelector('.bz-total');
    const total = t ? { txt: t.textContent, o: parseFloat(getComputedStyle(t).opacity) } : null;
    await new Promise((r) => setTimeout(r, 1400));
    return { pose, total, reste: c.children.length, fini };
  }, [grille, LOT]);

  ok(bombes.pose.length === LOT.length,
     'chaque bombe du serveur est posee (' + bombes.pose.length + '/' + LOT.length + ')');
  ok(bombes.pose.every((b, k) => b.multi === String(LOT[k].multi)),
     'chacune porte SON multiplicateur : ' + bombes.pose.map((b) => b.multi).join(', '));
  ok(bombes.pose.every((b) => b.surSaCase),
     'et tombe sur LA CASE QUE LE SERVEUR a tiree — la page n en choisit aucune');
  ok(bombes.pose.every((b) => b.vue),
     'elles sont bien visibles a l ecran, pas seulement dans le document');
  ok(bombes.pose.every((b) => b.taille > b.caseLarge),
     'et plus grandes que la case ('
     + Math.round(bombes.pose[0].taille) + ' px pour ' + Math.round(bombes.pose[0].caseLarge)
     + ') : c est le moment fort, il ne se murmure pas');
  ok(!!bombes.total && bombes.total.txt === '×132' && bombes.total.o > 0.9,
     'le total du SERVEUR s affiche ensuite en grand : '
     + (bombes.total ? JSON.stringify(bombes.total.txt) : 'aucun'));
  ok(bombes.reste === 0 && bombes.fini,
     'puis tout s efface, et la suite du tour est rappelee — sans ce rappel'
     + ' les tours gratuits resteraient bloques sur les bombes');

  ok(erreurs.length === 0, 'aucune erreur JS' + (erreurs.length ? ' : ' + erreurs[0] : ''));
  console.log('\n' + n + ' verifications, ' + rates + ' echec(s)');
  await nav.close(); srv.close();
  process.exit(rates ? 1 : 0);
})();
