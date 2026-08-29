/* LE BUS AUDIO COUPE-T-IL ENCORE SES PROPRES SONS ?
 *
 * Le defaut repare ici ne se voyait dans aucune capture d'ecran et dans
 * aucune mesure de fichier : les huit bruitages etaient les bons, aux
 * bonnes durees, et le jeu sonnait quand meme mal. La cause tenait en une
 * ligne — un SEUL element `Audio` par son, rembobine a chaque depart :
 *
 *     a.currentTime = 0; a.play();
 *
 * Un element audio ne joue qu'une chose a la fois. Rembobiner pendant
 * qu'il sonne ne superpose pas, ca TRANCHE. Les six colonnes se posent a
 * 155 ms d'ecart sur un bruitage de 390 ms ; la cascade des tours gratuits
 * relance un gain de 520 ms toutes les 350 ms. Dans les deux cas le son
 * precedent mourait en cours de route, et c'est tout « ca va trop vite,
 * les sons se coupent entre eux ».
 *
 * Ces essais tiennent la reparation : plusieurs voix par son, une montee
 * de gamme qui s'entend vraiment, et un interrupteur qui coupe pour de
 * bon. Le piege le plus vicieux est le dernier : `playbackRate` sans
 * `preservesPitch = false` etire le temps SANS transposer, donc toute la
 * montee serait muette — et ne raterait aucun essai qui ne la mesure pas.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('bus_bonanza.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
            '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
            '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    if (p === '/swoge_bonanza.html') {
      let h = fs.readFileSync(f, 'utf8');
      const i = h.lastIndexOf('})();');
      h = h.slice(0, i)
        + '\n  window.__son={son:son,SONS:SONS,SON_MIX:SON_MIX,SON_ECART:SON_ECART,'
        + 'SON_GAMME:SON_GAMME,sonTon:sonTon,SFX:SFX,bzArrets:bzArrets,'
        + 'BZ_PAUSE:BZ_PAUSE,BZ_PAUSE_VITE:BZ_PAUSE_VITE};\n'
        + h.slice(i);
      r.writeHead(200, { 'content-type': 'text/html' });
      return r.end(h);
    }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise(res => srv.listen(0, res));
  const port = srv.address().port;

  const nav = await chromium.launch();
  const page = await nav.newPage();
  page.on('pageerror', e => { rates++; console.log('  RATE erreur de page : ' + e.message); });
  await page.goto('http://127.0.0.1:' + port + '/swoge_bonanza.html');
  await page.waitForFunction('window.__son && window.__son.SONS');

  /* On remplace `play` par un mouchard sur CHAQUE voix : on saura quelle
     voix a servi, a quel taux, et a quel volume. Rien d'autre ne bouge. */
  await page.evaluate(() => {
    window.__joues = [];
    const S = window.__son.SONS;
    Object.keys(S).forEach(k => S[k].forEach((a, i) => {
      a.play = function () {
        window.__joues.push({ nom: k, voix: i, taux: this.playbackRate, vol: this.volume });
        return Promise.resolve();
      };
    }));
    window.__vide = () => { window.__joues = []; };
  });

  const CRENEAUX = ['rien','debut','pose','gain','cascade','scatter','gratuits','bombe','gros'];

  // ---- 1. il y a bien plusieurs voix par son ----
  const voix = await page.evaluate(() => {
    const S = window.__son.SONS, o = {};
    Object.keys(S).forEach(k => o[k] = S[k].length);
    return o;
  });
  CRENEAUX.forEach(k => ok(voix[k] >= 2, k + ' a ' + voix[k] + ' voix (il en faut au moins 2)'));

  // ---- 2. la transposition n'est pas muette ----
  const garde = await page.evaluate(() => {
    const S = window.__son.SONS, mauvais = [];
    Object.keys(S).forEach(k => S[k].forEach((a, i) => {
      if (a.preservesPitch !== false) mauvais.push(k + '#' + i);
    }));
    return mauvais;
  });
  ok(garde.length === 0,
     'preservesPitch coupe partout — sans ca `playbackRate` etire le temps et ne transpose RIEN' +
     (garde.length ? ' (fautifs : ' + garde.slice(0, 4).join(', ') + ')' : ''));

  // ---- 3. LE DEFAUT D'ORIGINE : deux departs rapproches ne se coupent plus ----
  /* On les espace comme le jeu les espace VRAIMENT — 155 ms entre deux
     colonnes. Tirer les six dans la meme milliseconde ne mesurerait pas le
     bus, ca mesurerait le garde-fou anti-mitraille (essai 7). */
  const suite = await page.evaluate(async () => {
    window.__vide();
    const plan = window.__son.bzArrets(new Array(30).fill('banane')).arrets;
    for (let c = 0; c < 6; c++) {
      window.__son.son('pose', { ton: c });
      if (c < 5) await new Promise(r => setTimeout(r, plan[c + 1] - plan[c]));
    }
    return window.__joues.slice();
  });
  ok(suite.length === 6, 'les six poses partent toutes (' + suite.length + '/6)');
  const distinctes = new Set(suite.map(x => x.voix)).size;
  ok(distinctes >= 4,
     'elles se repartissent sur ' + distinctes + ' voix : deux poses voisines ne se tranchent plus');
  /* deux departs consecutifs ne doivent JAMAIS tomber sur la meme voix */
  let collision = 0;
  for (let i = 1; i < suite.length; i++) if (suite[i].voix === suite[i-1].voix) collision++;
  ok(collision === 0, 'aucune pose ne repart sur la voix que la precedente occupe encore');

  // ---- 4. la montee s'entend ----
  const taux = suite.map(x => +x.taux.toFixed(4));
  let monte = true;
  for (let i = 1; i < taux.length; i++) if (taux[i] <= taux[i-1]) monte = false;
  ok(monte, 'les six poses montent : ' + taux.join(' → '));
  const gamme = await page.evaluate(() => window.__son.SON_GAMME);
  ok(Math.abs(taux[0] - 1) < 1e-6, 'la premiere colonne sonne a sa hauteur d origine');
  ok(taux.length === 6 && Math.abs(taux[5] - Math.pow(2, gamme[5] / 12)) < 1e-6,
     'la sixieme est une octave au-dessus (x' + (taux[5] || 0).toFixed(3) + ')');
  /* pentatonique et non chromatique : aucun demi-ton entre deux crans */
  let frotte = 0;
  for (let i = 1; i < gamme.length; i++) if (gamme[i] - gamme[i-1] === 1) frotte++;
  ok(frotte === 0, 'la gamme est pentatonique — aucun intervalle d un demi-ton, rien ne frotte');

  // ---- 5. l escalier de la cascade ----
  /* Au rythme REEL des tours gratuits, qui est le plus serre du jeu : si un
     etage passait a la trappe, ce serait la. */
  const casc = await page.evaluate(async () => {
    window.__vide();
    for (let k = 0; k < 5; k++) {
      window.__son.son(k === 0 ? 'gain' : 'cascade', { ton: k });
      if (k < 4) await new Promise(r => setTimeout(r, window.__son.BZ_PAUSE_VITE));
    }
    return window.__joues.map(x => ({ nom: x.nom, taux: +x.taux.toFixed(4) }));
  });
  ok(casc.length === 5, 'les cinq etages de cascade partent (' + casc.length + '/5)');
  ok(casc.length === 5 && casc[0].nom === 'gain' && casc[4].nom === 'cascade',
     'le premier etage paie, les suivants cascadent');
  let escalier = true;
  for (let i = 2; i < casc.length; i++) if (casc[i].taux <= casc[i-1].taux) escalier = false;
  ok(escalier, 'chaque etage part plus haut que le precedent : ' + casc.map(x => x.taux).join(' → '));

  // ---- 6. au-dela du dernier cran on ne monte plus ----
  const plafond = await page.evaluate(() => {
    const t = window.__son.sonTon;
    return [t(5), t(9), t(40)];
  });
  ok(plafond[0] === plafond[1] && plafond[1] === plafond[2],
     'une cascade de quarante etages ne finit pas en sifflet : la montee plafonne au dernier cran');

  // ---- 7. l ecart minimum jette le depart de trop, il ne tranche pas ----
  const flot = await page.evaluate(() => {
    window.__vide();
    for (let i = 0; i < 8; i++) window.__son.son('pose');
    return window.__joues.length;
  });
  ok(flot < 8, 'huit poses dans la meme milliseconde : ' + flot + ' partent, le reste est abandonne');
  ok(flot >= 1, 'mais la premiere part toujours');

  // ---- 8. L INTERRUPTEUR COUPE VRAIMENT ----
  /* Il existait deja dans le menu, et `son()` ne le lisait pas : on
     coupait le son et le jeu continuait de claquer. */
  const muet = await page.evaluate(() => {
    const v = window.__son.SFX.volume();
    window.__son.SFX.setVolume(0);
    window.__vide();
    ['debut', 'gain', 'scatter', 'gros'].forEach(k => window.__son.son(k));
    const n = window.__joues.length;
    window.__son.SFX.setVolume(v || 0.85);
    return n;
  });
  ok(muet === 0, 'a zero, plus un seul bruitage ne part (' + muet + ' parti(s))');

  // ---- 9. le niveau general multiplie le melange ----
  const niveaux = await page.evaluate(async () => {
    const attends = () => new Promise(r => setTimeout(r, window.__son.SON_ECART.gain + 20));
    window.__son.SFX.setVolume(0.5);
    window.__vide();
    window.__son.son('gain');
    const bas = window.__joues[0] && window.__joues[0].vol;
    await attends();                       // sinon le second depart tombe sous l'ecart minimum
    window.__son.SFX.setVolume(1);
    window.__vide();
    window.__son.son('gain');
    const haut = window.__joues[0] && window.__joues[0].vol;
    return { bas, haut, mix: window.__son.SON_MIX.gain };
  });
  ok(niveaux.bas && niveaux.haut && Math.abs(niveaux.bas - niveaux.haut / 2) < 1e-6,
     'le curseur multiplie le melange (' + niveaux.bas + ' a mi-course, ' + niveaux.haut + ' a fond)');

  // ---- 10. le melange n est pas plat ----
  const mix = await page.evaluate(() => window.__son.SON_MIX);
  ok(mix.pose < mix.gain && mix.gain < mix.gratuits,
     'la pose passe sous le gain, qui passe sous les tours gratuits (' +
     mix.pose + ' < ' + mix.gain + ' < ' + mix.gratuits + ')');

  // ---- 11. le rythme des colonnes laisse la place au son ----
  const plan = await page.evaluate(() => {
    const g = new Array(30).fill('banane');
    return window.__son.bzArrets(g).arrets;
  });
  const pas = plan[1] - plan[0];
  ok(pas >= 150,
     'les colonnes se posent a ' + pas + ' ms d ecart — assez pour qu un bruitage de 390 ms se detache');

  // ---- 12. AUCUN CRENEAU N EST PLUS SERRE QUE SON GARDE-FOU ----
  /* C'est l'essai qui empeche le defaut de revenir par la bande : si un jour
     on raccourcit une pause sous l'ecart minimum, le son cesserait de partir
     — silencieusement. */
  const rythmes = await page.evaluate(() => {
    const S = window.__son;
    const plan = S.bzArrets(new Array(30).fill('banane')).arrets;
    return {
      pose: plan[1] - plan[0], poseMin: S.SON_ECART.pose,
      casc: S.BZ_PAUSE_VITE,   cascMin: S.SON_ECART.cascade,
      base: S.BZ_PAUSE,        gainMin: S.SON_ECART.gain
    };
  });
  ok(rythmes.pose > rythmes.poseMin,
     'les colonnes (' + rythmes.pose + ' ms) passent au-dessus de leur ecart minimum (' + rythmes.poseMin + ' ms)');
  ok(rythmes.casc > rythmes.cascMin,
     'la cascade rapide (' + rythmes.casc + ' ms) passe au-dessus du sien (' + rythmes.cascMin + ' ms)');
  ok(rythmes.base > rythmes.gainMin,
     'la cascade normale (' + rythmes.base + ' ms) aussi (' + rythmes.gainMin + ' ms)');

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
