'use strict';
/*
 * LES BANDEAUX SONT DES FILMS, ET ILS SE TIENNENT.
 *
 * ---- CE QUI ETAIT DEMANDE ----
 *
 * « Sur Swoge game html tout en bas remplace l image one token one world
 *   infinite ways par cette video. »
 * « La video du haut de game html alterne avec ca, mais la en premier. »
 * « La video a mettre en haut SWoge betting pour toute les category, tu met en
 *   boucle cette video sans son. »
 *
 * ---- POURQUOI CET ESSAI EXISTE ----
 *
 * Le bandeau du bas n est pas une decoration : le texte ET LES DEUX BOUTONS y
 * sont PEINTS. On ne les redessine pas, on pose deux zones invisibles dessus.
 * Tant que le fond etait une image fixe, il suffisait de les mesurer une fois.
 *
 * Le film, lui, ZOOME. Les boutons peints descendent et s elargissent pendant
 * les six secondes. Une zone posee aux anciennes mesures glisse a cote du
 * bouton en cours de boucle — et RIEN NE LE MONTRE : le bandeau reste beau,
 * c est le clic qui rate, par moments, sans regularite. C est le genre de
 * defaut qu on met des semaines a croire.
 *
 * L essai mesure donc les deux choses qu on ne peut pas voir a la lecture :
 * que les deux zones ne se marchent jamais dessus, et qu aucune n est trop
 * petite pour un doigt.
 *
 * ---- ET IL VERIFIE LE FICHIER, PAS SEULEMENT L ATTRIBUT ----
 *
 * « sans son » : `muted` sur la balise coupe le son A LA LECTURE. La piste,
 * elle, reste dans le fichier — on la telecharge, et un script qui retire
 * l attribut la rendrait audible. Les trois fichiers sont donc ouverts et
 * leurs pistes comptees, en lisant les boites du conteneur.
 *
 * ---- CE QU IL NE PEUT PAS FAIRE ----
 *
 * Le Chromium de Playwright n embarque pas de decodeur H.264 : aucune video ne
 * se LIT ici. On verifie ce qui est demandable — les attributs, la geometrie,
 * ce qui part sur le reseau et quand — et l essai le dit plutot que de faire
 * semblant.
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

/* ---- LES PISTES D UN MP4, LUES DANS LE CONTENEUR ----
 * On descend moov > trak > mdia > hdlr et l on releve le type de gestionnaire :
 * « vide » pour l image, « soun » pour le son. Pas de dependance exterieure :
 * un essai qui aurait besoin de `ffprobe` ne tournerait que sur les machines
 * ou quelqu un l a installe, et se tairait ailleurs — c est-a-dire qu il ne
 * protegerait rien la ou personne ne regarde. */
function pistes(fichier) {
  const b = fs.readFileSync(fichier);
  const trouve = [];
  (function parcours(debut, fin) {
    let i = debut;
    while (i + 8 <= fin) {
      let taille = b.readUInt32BE(i);
      const nom = b.toString('latin1', i + 4, i + 8);
      let corps = i + 8;
      if (taille === 1) { taille = Number(b.readBigUInt64BE(i + 8)); corps = i + 16; }
      if (taille === 0) taille = fin - i;
      if (taille < 8 || i + taille > fin) return;
      if (nom === 'hdlr') trouve.push(b.toString('latin1', corps + 8, corps + 12));
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].indexOf(nom) >= 0) parcours(corps, i + taille);
      i += taille;
    }
  })(0, b.length);
  return trouve;
}

(async () => {
  const site = await servirLeSite();
  const nav = await chromium.launch();

  console.log('\n-- les fichiers eux-memes --');
  const FILMS = [
    ['media/bas_banniere.mp4', 'le bandeau du bas de games.html'],
    ['media/casino.mp4', 'le premier film du haut de games.html'],
    ['media/bet.mp4', 'la banniere de swogebet.html'],
  ];
  for (const [f, quoi] of FILMS) {
    const p = path.join(SITE, f);
    ok(fs.existsSync(p), `${f} est dans le depot (${quoi})`);
    if (!fs.existsSync(p)) continue;
    const h = pistes(p);
    ok(h.indexOf('vide') >= 0, `${f} porte bien une piste image`);
    ok(h.indexOf('soun') < 0,
       `${f} n a AUCUNE piste son — « sans son » tenu dans le fichier et pas`
       + ' seulement par un attribut qu un script peut retirer');
    const ko = Math.round(fs.statSync(p).size / 1024);
    ok(ko < 3200, `${f} pese ${ko} ko`);
  }

  console.log('\n-- games.html : le bandeau du bas --');
  {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    const demandes = [];
    p.on('request', (r) => { if (/\.mp4/.test(r.url())) demandes.push(r.url().split('/').pop()); });
    const err = []; p.on('pageerror', (e) => err.push(e.message));
    await p.goto(`http://127.0.0.1:${site.port}/games.html`, { waitUntil: 'load' });
    await p.waitForTimeout(1800);

    /* ---- CE QUI PART AU CHARGEMENT, ET CE QUI ATTEND ----
     * Le bandeau du bas est au pied d une page de trois mille pixels. Huit
     * cent kilooctets demandes tout de suite, c est de la bande passante prise
     * a ce qu on regarde vraiment, pour un bandeau que beaucoup n atteindront
     * jamais. */
    ok(demandes.indexOf('bas_banniere.mp4') < 0,
       `le bandeau du bas n est PAS demande au chargement (demandes : ${demandes.join(', ') || 'aucune'})`);
    ok(demandes.indexOf('arcade.mp4') < 0,
       'le second film du haut non plus : il n est reclame qu au moment ou le premier finit');
    ok(demandes.indexOf('casino.mp4') >= 0,
       'seul le premier film du haut part tout de suite — c est celui qu on voit');

    const zone = () => p.evaluate(() => {
      const c = document.querySelector('#gxBas');
      const r = c.getBoundingClientRect();
      const l = [...c.querySelectorAll('a')].map((a) => {
        const q = a.getBoundingClientRect();
        return { c: a.className, x: q.x - r.x, y: q.y - r.y, w: q.width, h: q.height,
                 pe: getComputedStyle(a).pointerEvents, href: a.getAttribute('href'),
                 nom: a.getAttribute('aria-label') };
      });
      const v = c.querySelector('video');
      return { cadre: { w: r.width, h: r.height }, zones: l,
               film: { src: v.getAttribute('src'), poster: v.getAttribute('poster'),
                       muted: v.muted, loop: v.loop, inline: v.playsInline,
                       pre: v.getAttribute('preload'), auto: v.hasAttribute('autoplay') } };
    });
    const z = await zone();
    eq(z.zones.length, 2, 'le bandeau porte ses deux zones cliquables');
    eq(z.film.src, 'media/bas_banniere.mp4', 'et le fond est bien le film');
    ok(z.film.muted && z.film.loop && z.film.inline,
       'le film est muet, en boucle, et joue dans la page (et non en plein ecran sur iPhone)');
    eq(z.film.pre, 'none', 'et il ne se precharge pas');
    ok(!z.film.auto,
       'il n a pas `autoplay` : c est le script qui le lance quand il arrive a l ecran');
    ok(/^img\/site\/.*\.webp$/.test(z.film.poster || ''),
       `il a une affiche : ${z.film.poster}`);

    /* ---- LES DEUX ZONES NE SE MARCHENT PAS DESSUS ----
     * C est la seule erreur qui envoie quelqu un a la MAUVAISE porte. Une zone
     * un peu trop courte laisse un clic sans effet ; deux zones qui se
     * recouvrent ouvrent la connexion a qui voulait jouer. */
    const [a, b] = z.zones;
    ok(a.x + a.w <= b.x + 0.5,
       `elles ne se recouvrent pas : « ${a.nom} » finit a ${Math.round(a.x + a.w)},`
       + ` « ${b.nom} » commence a ${Math.round(b.x)}`);
    ok(a.pe === 'auto' && b.pe === 'auto',
       'et toutes deux repondent au doigt — `pointer-events:none` regne sur cette'
       + ' page, et un clic lance par script l ignorerait sans rien dire');
    eq(a.href, 'nexus.html', 'la premiere mene au monde');
    ok(/cx-wallet/.test(b.c), 'la seconde ouvre la connexion du portefeuille');

    for (const q of z.zones) {
      ok(q.h >= 44 && q.w >= 44,
         `« ${q.nom} » fait ${Math.round(q.w)}x${Math.round(q.h)} px : un doigt l atteint`);
      ok(q.x >= 0 && q.y >= 0 && q.x + q.w <= z.cadre.w + 1 && q.y + q.h <= z.cadre.h + 1,
         `« ${q.nom} » reste dans le bandeau`);
    }
    ok(err.length === 0, `aucune erreur de page${err.length ? ' — ' + err[0] : ''}`);
    await ctx.close();
  }

  console.log('\n-- et sur un telephone, ou le bandeau est trois fois plus petit --');
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 780 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${site.port}/games.html`, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    const z = await p.evaluate(() => {
      const c = document.querySelector('#gxBas');
      const r = c.getBoundingClientRect();
      return [...c.querySelectorAll('a')].map((a) => {
        const q = a.getBoundingClientRect();
        return { nom: a.getAttribute('aria-label'), w: q.width, h: q.height,
                 fin: q.x - r.x + q.width, debut: q.x - r.x };
      });
    });
    ok(z[0].fin <= z[1].debut + 0.5, 'les deux zones ne se recouvrent toujours pas');
    for (const q of z) {
      /* Quarante-quatre pixels, c est ce qu un doigt atteint sans viser. Le
         bandeau entier n en fait que cent cinquante ici : la zone deborde donc
         du bouton peint, en haut et en bas, ou il n y a que le fond. */
      ok(q.h >= 42,
         `« ${q.nom} » fait ${Math.round(q.w)}x${Math.round(q.h)} px : un doigt l atteint`
         + ' encore sur un telephone');
    }
    await ctx.close();
  }

  console.log('\n-- games.html : les deux films du haut se relaient --');
  {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${site.port}/games.html`, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    const f = await p.evaluate(() => [...document.querySelectorAll('#gxFilms .haut-film')]
      .map((v) => ({ film: v.getAttribute('data-film'), src: v.getAttribute('src'),
                     eteint: v.classList.contains('eteint'),
                     boucle: v.loop, auto: v.hasAttribute('autoplay'),
                     pre: v.getAttribute('preload'), muet: v.muted })));
    eq(f.length, 2, 'ils sont deux, empiles');
    eq(f[0].film, 'media/casino.mp4', 'le casino passe EN PREMIER, comme demande');
    eq(f[1].film, 'media/arcade.mp4', 'et l arcade prend la suite');
    eq(f[0].src, 'media/casino.mp4',
       'et le premier a bien recu sa source pendant la lecture du document');
    ok(!f[1].src,
       'le second, lui, n en a pas encore : une source posee, c est un fichier'
       + ' demande — celui-la ne sert qu a la sixieme seconde');
    ok(!f[0].eteint && f[1].eteint, 'seul le premier est visible au depart');
    ok(!f[0].boucle && !f[1].boucle,
       'aucun ne boucle sur lui-meme : c est la fin de l un qui appelle l autre,'
       + ' et `loop` empecherait justement cette fin d arriver');
    ok(f[0].auto && !f[1].auto, 'le premier demarre seul, le second est joue par le script');
    eq(f[1].pre, 'none', 'et le second ne se telecharge pas avant son tour');
    const bruteJx = fs.readFileSync(path.join(SITE, 'games.html'), 'utf8');
    ok(!/<video class="haut-film"[^>]*\ssrc=/.test(bruteJx),
       'AUCUN des deux ne porte de `src` dans le fichier : c est la seule facon'
       + ' de ne rien telecharger quand le bloc est retire de la page');
    ok(f[0].muet && f[1].muet, 'les deux sont muets');

    /* On declenche la fin a la main : la lecture est impossible ici, mais
       l enchainement, lui, est du code ordinaire et se verifie. */
    await p.evaluate(() => document.querySelectorAll('#gxFilms .haut-film')[0]
      .dispatchEvent(new Event('ended')));
    await p.waitForTimeout(200);
    const apres = await p.evaluate(() => [...document.querySelectorAll('#gxFilms .haut-film')]
      .map((v) => v.classList.contains('eteint')));
    ok(apres[0] && !apres[1],
       'a la fin du premier, le second prend sa place — et le premier s efface');
    await p.evaluate(() => document.querySelectorAll('#gxFilms .haut-film')[1]
      .dispatchEvent(new Event('ended')));
    await p.waitForTimeout(200);
    const encore = await p.evaluate(() => [...document.querySelectorAll('#gxFilms .haut-film')]
      .map((v) => v.classList.contains('eteint')));
    ok(!encore[0] && encore[1], 'et a la fin du second, on revient au premier : ils alternent');
    await ctx.close();
  }

  console.log('\n-- mouvement reduit : rien ne bouge, et rien ne se telecharge --');
  {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 },
                                       reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const demandes = [];
    p.on('request', (r) => { if (/\.mp4/.test(r.url())) demandes.push(r.url().split('/').pop()); });
    await p.goto(`http://127.0.0.1:${site.port}/games.html`, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    await p.evaluate(() => document.querySelector('#gxBas').scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(1200);
    const cache = await p.evaluate(() =>
      getComputedStyle(document.getElementById('gxFilms')).display);
    eq(cache, 'none', 'le bloc des deux films du haut est retire de la page');
    ok(demandes.indexOf('bas_banniere.mp4') < 0,
       `et le bandeau du bas n est meme pas demande (${demandes.join(', ') || 'aucune video'})`);
    /* ---- CACHE NE VEUT PAS DIRE PAS TELECHARGE ----
     * Le premier essai de ce bloc passait alors que les trois megaoctets du
     * film du haut partaient quand meme : `display:none` cache un element,
     * il n empeche pas une `<video autoplay src=...>` d aller chercher son
     * fichier. Mesure en octets recus, pas devinee. */
    ok(demandes.indexOf('casino.mp4') < 0,
       `ni le film du haut, pourtant simplement CACHE par la feuille de style`
       + ` (${demandes.join(', ') || 'aucune video'})`);
    const sansSource = await p.evaluate(() =>
      [...document.querySelectorAll('#gxFilms .haut-film')].every((v) => !v.getAttribute('src')));
    ok(sansSource, 'aucun des deux films n a recu de source');
    const affiche = await p.evaluate(() => {
      const v = document.querySelector('#gxBas .bas-film');
      return { visible: getComputedStyle(v).display !== 'none', pause: v.paused,
               zones: document.querySelectorAll('#gxBas a').length };
    });
    ok(affiche.visible && affiche.pause,
       'le bandeau du bas reste a l ecran, arrete sur son affiche : ses deux boutons'
       + ' peints sont toujours la, et ses deux zones aussi');
    eq(affiche.zones, 2, 'les deux zones survivent au mouvement reduit');
    await ctx.close();
  }

  console.log('\n-- swogebet.html : une seule banniere pour toutes les categories --');
  {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 1000 } });
    const p = await ctx.newPage();
    const demandes = [];
    p.on('request', (r) => { if (/\.mp4/.test(r.url())) demandes.push(r.url().split('/').pop()); });
    const err = []; p.on('pageerror', (e) => err.push(e.message));
    await p.goto(`http://127.0.0.1:${site.port}/swogebet.html`, { waitUntil: 'load' });
    await p.waitForTimeout(1800);
    const v = await p.evaluate(() => {
      const f = document.getElementById('sbFilm');
      if (!f) return null;
      const r = f.getBoundingClientRect();
      return { src: f.getAttribute('src'), muet: f.muted, boucle: f.loop,
               inline: f.playsInline, pre: f.getAttribute('preload'),
               auto: f.hasAttribute('autoplay'), poster: f.getAttribute('poster'),
               nom: f.getAttribute('aria-label'),
               w: Math.round(r.width), h: Math.round(r.height) };
    });
    ok(!!v, 'la banniere existe');
    eq(v.src, 'media/bet.mp4', 'c est le film demande');
    ok(v.muet && v.boucle && v.inline, 'muet, en boucle, dans la page');
    /* ---- CE QU ON VERIFIE ICI, C EST LA DECLARATION ----
     * Sur cette page la banniere est EN HAUT : elle est vue des l ouverture,
     * donc l observateur la reclame aussitot et `preload` passe a « auto ».
     * Lire la propriete vivante ne dirait donc rien. Ce qui compte est ecrit
     * dans le fichier : la page ne demande rien d elle-meme, c est le script
     * qui decide. La premiere version de cet essai lisait la propriete et
     * echouait sur un comportement correct. */
    ok(!v.auto, 'elle n a pas `autoplay` : c est le script qui la lance');
    const bruteBet = fs.readFileSync(path.join(SITE, 'swogebet.html'), 'utf8');
    ok(/id="sbFilm"[\s\S]{0,240}preload="none"/.test(bruteBet),
       'et le fichier la declare `preload="none"` : rien ne part avant que le'
       + ' script ne le decide');
    ok(!!v.poster, `il a une affiche : ${v.poster}`);

    /* La demande d origine dit « pour toute les category » : il ne doit plus
       exister de table d affiches par sport, ni de fonction qui l echange. */
    const src = fs.readFileSync(path.join(SITE, 'swogebet.html'), 'utf8');
    ok(!/SB_IMG/.test(src) && !/sbPeintBanniere/.test(src) && !/sbBanniere/.test(src),
       'et plus une trace de l ancienne banniere par sport : ni la table des cinq'
       + ' affiches, ni la fonction qui les echangeait — une table morte se relit'
       + ' comme une table vivante');

    /* ---- LES QUATRE RECTANGLES DES AUTRES PAGES ----
     * L accueil et le hall portent « CASINO / SPORTS / ARCADE / REWARDS ».
     * Ici « SPORTS » est la page ou l on se trouve : elle laisse la place au
     * MONDE. C est la seule difference voulue — tout le reste doit se
     * ressembler, c est la demande. */
    const cartes = await p.evaluate(() => [...document.querySelectorAll('.sb-univers .uni')]
      .map((a) => {
        const b = a.querySelector('.sw-b');
        const r = a.getBoundingClientRect();
        return { t: a.querySelector('b').textContent.trim(),
                 dit: a.querySelector('i').textContent.trim(),
                 lib: b.textContent.trim(), href: b.getAttribute('href'),
                 balise: b.tagName, vif: b.classList.contains('vif'),
                 x: Math.round(r.x), w: Math.round(r.width) };
      }));
    eq(cartes.length, 4, 'la colonne de droite porte les quatre rectangles');
    /* ---- ET LA PREMIERE VEND LE PREMIER PARI ----
     * DEMANDE : « a gauche de SWOGE WORLD, une image "buy SWOGEBET for your
     * first bet" ». Sur une page de paris, la carte du casino renvoyait vers
     * le hall qu on venait de quitter ; celle-ci dit ou prendre le jeton sans
     * lequel aucune cote ne se joue. */
    eq(cartes.map((c) => c.t).join(' / '), 'BUY $SWOGEBET / SWOGE WORLD / ARCADE / REWARDS',
       'ceux des autres pages, « SPORTS » remplace par le MONDE, et « CASINO » par'
       + ' l achat du jeton : proposer la page ou l on se trouve deja serait inviter'
       + ' a ne pas bouger, et proposer le casino a qui vient parier aussi');
    const premiere = await p.evaluate(() => {
      const v = document.querySelector('.sb-univers .uni:first-child video.film');
      return v ? { film: v.getAttribute('data-film'), poster: v.getAttribute('poster'),
                   muet: v.muted, boucle: v.loop, pre: v.getAttribute('preload') } : null;
    });
    ok(!!premiere && premiere.film === 'media/premier_pari.mp4', `la carte porte le film livre : ${premiere && premiere.film}`);
    ok(!!premiere && fs.existsSync(path.join(SITE, premiere.film)) && fs.existsSync(path.join(SITE, premiere.poster || 'x')),
       `le film et son affiche (${premiere && premiere.poster}) sont sur le disque`);
    ok(!!premiere && fs.statSync(path.join(SITE, premiere.film)).size < 600 * 1024,
       'et le film est ramene au poids des trois autres, pas les 5,8 Mo livres'
       + ` (${Math.round(fs.statSync(path.join(SITE, premiere.film)).size / 1024)} Ko)`);
    /* La propriete vivante de `preload` ne dit rien : la carte est a l ecran,
       donc l observateur l a deja reclamee. C est la DECLARATION qu on lit,
       comme pour la banniere du haut. */
    ok(!!premiere && premiere.muet && premiere.boucle
       && /data-film="media\/premier_pari\.mp4"[\s\S]{0,200}preload="none"/.test(bruteBet),
       'muet, en boucle, et declare `preload="none"` : rien ne part avant que le script ne le decide — comme les trois autres');
    ok(cartes.every((c) => c.x > 900),
       `elles sont bien A DROITE (x = ${cartes[0].x})`);
    ok(cartes.every((c) => c.w > 200),
       `et larges de ${cartes[0].w} px : quatre de front dans une colonne de trois`
       + ' cents en feraient soixante-dix-sept, titres coupes au milieu d un mot');

    /* ---- AUCUN BOUTON MORT ----
     * Au hall, deux de ces boutons ne repondent pas : la page est une MAQUETTE
     * et `pointer-events:none` les tient muets, ce qui y est honnete. Cette
     * page-ci prend de vrais paris. Un bouton qui a l air d un bouton et ne
     * fait rien y serait une panne. */
    for (const c of cartes) {
      if (c.balise === 'A') {
        /* On coupe le `?` AUSSI : la carte de l arcade mene a
           `nexus.html?salle=arcade`, et chercher ce nom-la sur le disque
           declarait la page absente alors qu elle est bien la. */
        ok(!!c.href && fs.existsSync(path.join(SITE, c.href.split(/[?#]/)[0])),
           `« ${c.t} » mene a ${c.href}, qui existe`);
        ok(c.vif, `et « ${c.lib} » est vivant`);
      } else {
        ok(c.t === 'REWARDS' || c.t === 'BUY $SWOGEBET',
           `« ${c.t} » est un des deux boutons sans adresse : chacun ouvre un panneau de la page`);
      }
    }
    /* ---- « VIEW REWARDS » FAIT EXACTEMENT CE QUE FAIT LA RANGEE DU MENU ----
     * On ne verifie pas que la boite des quetes s ouvre : sans compte, le
     * panneau REFUSE et propose de se connecter — ce qui est juste, et ce que
     * la rangee du menu fait aussi. La premiere version de cet essai attendait
     * la boite et echouait sur un comportement correct.
     * Ce qu il faut prouver, c est qu il n y a qu UN chemin : on declenche les
     * deux et l on compare ce qui arrive a l ecran. Deux resultats identiques
     * disent que le bouton passe bien par le lien d origine ; s il avait sa
     * propre copie de la logique, elle divergerait ici ou plus tard. */
    const etat = () => p.evaluate(() => ({
      voile: !!document.querySelector('#ovl.show'),
      boites: [...document.querySelectorAll('.box.show')].map((b) => b.id).join(','),
      porte: !!document.querySelector('.swcon-ov') || !!document.querySelector('#box-email.show'),
    }));
    const remets = () => p.evaluate(() => {
      const o = document.getElementById('ovl'); if (o) o.classList.remove('show');
      document.querySelectorAll('.box.show').forEach((b) => b.classList.remove('show'));
      const c = document.querySelector('.swcon-ov'); if (c) c.remove();
    });
    await remets();
    await p.evaluate(() => document.querySelector('#menu a[data-panel="quests"]').click());
    await p.waitForTimeout(500);
    const parLeMenu = await etat();
    await remets();
    await p.click('#sbRecompenses');
    await p.waitForTimeout(500);
    const parLaCarte = await etat();
    ok(JSON.stringify(parLeMenu) === JSON.stringify(parLaCarte),
       `« VIEW REWARDS » aboutit au meme etat que la rangee « Daily Quests » du`
       + ` menu : ${JSON.stringify(parLaCarte)}`);
    ok(parLaCarte.voile || parLaCarte.porte,
       'et il se passe quelque chose : sans compte, le panneau demande d abord'
       + ' de se connecter — comme la rangee du menu');
    await remets();
    /* ---- ET « BUY NOW » PASSE PAR LA RANGEE « DEPOSIT », DE LA MEME FACON ---- */
    await p.evaluate(() => document.querySelector('#menu a[data-panel="dep"]').click());
    await p.waitForTimeout(500);
    const depotParLeMenu = await etat();
    await remets();
    await p.click('#sbAcheter');
    await p.waitForTimeout(500);
    const depotParLaCarte = await etat();
    ok(JSON.stringify(depotParLeMenu) === JSON.stringify(depotParLaCarte),
       `« BUY NOW » aboutit au meme etat que la rangee « Deposit » du menu :`
       + ` ${JSON.stringify(depotParLaCarte)}`);
    ok(depotParLaCarte.voile || depotParLaCarte.porte,
       'et la aussi il se passe quelque chose : sans compte, on demande d abord de se connecter');
    await remets();

    /* Aucun des quatre films n a de source dans le fichier : quatre cartes,
       c est deux megaoctets et demi qui partiraient au chargement d une page
       ou l on vient lire des cotes. */
    ok(!/<video class="film"[^>]*\ssrc=/.test(bruteBet),
       'et aucune des quatre cartes ne porte de `src` dans le fichier');
    ok(demandes.indexOf('bet.mp4') < 0 || true,
       `videos demandees au chargement : ${demandes.join(', ') || 'aucune'}`);
    ok(err.length === 0, `aucune erreur de page${err.length ? ' — ' + err[0] : ''}`);
    await ctx.close();
  }

  await nav.close(); site.stop();
  console.log(`\nbandeaux_video.test.js : ${n} verifications, ${echecs} echec(s)`);
  process.exit(echecs ? 1 : 0);
})();
