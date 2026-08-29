/* LA VIGNETTE BONANZA S ANIME-T-ELLE AU SURVOL, ET SEULEMENT LA ?
 *
 * La demande tenait en une phrase : « la video se lance sans son que si on
 * passe la souris dessus ». Les trois mots qui comptent sont « sans son »,
 * « que » et « si » — et chacun peut se casser tout seul.
 *
 *   SANS SON. `muted` sur la balise ne suffit pas : c'est un attribut, il se
 *   retire d'un coup de console, et un mauvais copier-coller le perd. La
 *   piste audio a donc ete RETIREE du fichier a l'encodage. C'est ca qu'on
 *   verifie, pas l'attribut.
 *
 *   QUE SI. Une video sans `autoplay` mais avec un `src` va quand meme
 *   chercher son fichier — le defaut est deja documente en haut de cette
 *   page pour la banniere, ou trois megaoctets partaient pour un bloc que
 *   personne ne voyait. L'adresse attend donc dans `data-film`. On compte
 *   les octets reellement demandes, on ne devine pas.
 *
 *   SI. Et il faut quand meme qu'elle parte au survol, et qu'elle s'arrete
 *   en sortant : un film laisse en cours derriere une affiche invisible
 *   tourne pour personne.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('couverture_bonanza.test.js : playwright absent — essai saute'); process.exit(0); }

let ffmpeg = null;
try { ffmpeg = require('@ffmpeg-installer/ffmpeg').path; } catch (e) {}
if (!ffmpeg) {
  const s = process.env.SWOGE_MODULES;
  if (s && fs.existsSync(path.join(s, '@ffmpeg-installer/linux-x64/ffmpeg')))
    ffmpeg = path.join(s, '@ffmpeg-installer/linux-x64/ffmpeg');
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
            '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
            '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };

const FILMS = ['media/carte_bonanza.mp4', 'media/carte_bonanza.webm'];
/* Le navigateur d essai est un Chromium sans H.264 : il prend le WebM. On
   compte donc les deux, sinon l essai reprocherait a la page de ne pas
   telecharger un fichier qu elle a eu raison de ne pas prendre. */
const estLeFilm = (u) => /carte_bonanza\.(mp4|webm)/.test(u);

(async () => {
  // ---- 1. LES FICHIERS LIVRES N ONT PAS DE PISTE SON ----
  /* Les DEUX doivent etre muets. Un repli qui parle est pire qu'un repli
     absent : il ne se declenche que chez une minorite, donc personne ne
     l entend en essayant. */
  FILMS.forEach((rel) => {
    const f = path.join(SITE, rel);
    const nom = path.extname(rel).slice(1).toUpperCase();
    ok(fs.existsSync(f), 'le ' + nom + ' de la vignette est bien dans le depot');
    if (!ffmpeg || !fs.existsSync(f)) return;
    let sortie = '';
    try { execFileSync(ffmpeg, ['-nostdin', '-i', f], { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { sortie = String(e.stderr || ''); }
    const pistes = sortie.split('\n').filter((l) => /Stream #/.test(l));
    const audio = pistes.filter((l) => /: Audio:/.test(l));
    ok(pistes.length > 0 && audio.length === 0,
       nom + ' : AUCUNE piste audio — le silence ne depend pas d un attribut ('
       + pistes.length + ' piste(s), ' + audio.length + ' audio)');
    const ko = Math.round(fs.statSync(f).size / 1024);
    ok(ko < 900, nom + ' : leger pour une vignette, ' + ko + ' Ko');
  });
  if (!ffmpeg) console.log('  (ffmpeg absent — le controle des pistes audio est saute)');

  // ---- le serveur ----
  const demandes = [];
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    demandes.push(p);
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;

  const nav = await chromium.launch();
  const p = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(e.message));
  await p.goto('http://127.0.0.1:' + port + '/games.html', { waitUntil: 'networkidle' });

  const carte = await p.$('a[href="swoge_bonanza.html"].jc');
  ok(!!carte, 'la vignette Bonanza est bien sur la page');

  // ---- 2. RIEN N EST TELECHARGE AVANT LE SURVOL ----
  const avant = demandes.filter(estLeFilm).length;
  ok(avant === 0, 'le film n est PAS telecharge au chargement de la page (' + avant + ' demande)');

  const etat0 = await p.evaluate(() => {
    const v = document.querySelector('a[href="swoge_bonanza.html"].jc .couv');
    if (!v) return null;
    return { src: v.getAttribute('src'), data: v.getAttribute('data-film'),
             webm: v.getAttribute('data-webm'),
             autoplay: v.hasAttribute('autoplay'), muet: v.muted,
             boucle: v.hasAttribute('loop'), enLigne: v.hasAttribute('playsinline'),
             pause: v.paused, opacite: parseFloat(getComputedStyle(v).opacity) };
  });
  ok(!!etat0, 'elle porte bien un film');
  ok(etat0 && !etat0.autoplay, 'il n a pas d autoplay');
  ok(etat0 && !etat0.src && !!etat0.data, "l adresse attend dans `data-film`, pas dans `src`");
  ok(etat0 && !!etat0.webm, 'un repli WebM est prevu pour les Chromium sans H.264');
  ok(etat0 && etat0.muet && etat0.enLigne && etat0.boucle,
     'muted, playsinline et loop sont poses (ceinture et bretelles)');
  ok(etat0 && etat0.pause, 'et il est a l arret');
  ok(etat0 && etat0.opacite < 0.05, 'invisible au repos : c est l affiche qu on voit');

  // ---- 3. IL PART AU SURVOL ----
  await carte.hover();
  await p.waitForTimeout(700);
  const etat1 = await p.evaluate(() => {
    const v = document.querySelector('a[href="swoge_bonanza.html"].jc .couv');
    return { pause: v.paused, t: v.currentTime, opacite: parseFloat(getComputedStyle(v).opacity),
             src: !!v.getAttribute('src') };
  });
  ok(etat1.src, 'le survol pose enfin l adresse');
  const apres = demandes.filter(estLeFilm).length;
  ok(apres > 0, 'et le fichier part alors seulement (' + apres + ' demande)');
  ok(!etat1.pause, 'le film joue');
  ok(etat1.t > 0, 'il a bien avance (' + etat1.t.toFixed(2) + ' s)');
  ok(etat1.opacite > 0.9, 'et il est visible par-dessus l affiche');

  // ---- 4. IL S ARRETE EN SORTANT ----
  await p.mouse.move(5, 5);
  await p.waitForTimeout(450);
  const etat2 = await p.evaluate(() => {
    const v = document.querySelector('a[href="swoge_bonanza.html"].jc .couv');
    return { pause: v.paused, t: v.currentTime, opacite: parseFloat(getComputedStyle(v).opacity) };
  });
  ok(etat2.pause, 'en sortant il s arrete — il ne tourne pas derriere l affiche');
  ok(etat2.t === 0, 'et il repart de zero au prochain survol (' + etat2.t + ' s)');
  ok(etat2.opacite < 0.05, "l affiche fixe est revenue");

  // ---- 5. RIEN NE DEBORDE ----
  const debord = await p.evaluate(() => {
    const c = document.querySelector('a[href="swoge_bonanza.html"].jc');
    const v = c.querySelector('.couv');
    const rc = c.getBoundingClientRect(), rv = v.getBoundingClientRect();
    return { dedans: rv.width <= rc.width + 1 && rv.height <= rc.height + 1,
             page: document.documentElement.scrollWidth <= window.innerWidth + 1 };
  });
  ok(debord.dedans, 'le film reste dans sa vignette');
  ok(debord.page, 'et la page ne se met pas a defiler en largeur');

  ok(erreurs.length === 0, 'aucune erreur JS' + (erreurs.length ? ' : ' + erreurs[0] : ''));

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
