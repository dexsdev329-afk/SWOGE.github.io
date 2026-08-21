/* LE FAMILIER QUI TE SUIT — deuxieme etape du plan des animaux.
 *
 * L oeuf eclot (oeufs.test.js, oeuf_page.test.js). Un familier existe donc
 * quelque part dans un compte. Ce fichier verifie la seule chose qui le fait
 * EXISTER pour le joueur : qu on le voit, qu il se deplace, et qu on choisit
 * lequel.
 *
 * C est un fil a six brins, et chacun casse sans bruit :
 *
 * 1. IL EST DANS L ENCLOS tant qu on ne l a pas sorti. Un familier eclos qui
 *    n est nulle part aurait fait de Petworld une liste dans un panneau, et
 *    de la cour qu on a batie un decor qu on traverse.
 * 2. LA GRANGE OUVRE. Elle disait « opening soon » : un lieu ou l on marche
 *    et ou rien ne se passe se lit comme un lieu casse.
 * 3. LE CHOIX PART AU SERVEUR, et c est LUI qui tranche. Cocher la fiche sur
 *    place aurait montre un compagnon sorti que le serveur a refuse.
 * 4. IL SUIT. Une image posee derriere le joueur n est pas un compagnon —
 *    elle doit BOUGER quand on marche, et sa position doit lui appartenir.
 * 5. SORTI, IL QUITTE L ENCLOS. Sinon on en aurait deux, et le joueur ne
 *    saurait plus lequel est le sien.
 * 6. IL PASSE LES PORTES. Un compagnon qui disparait en entrant dans le monde
 *    de combat n est un compagnon que dans le hall.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('familier_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('familier_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ` [${a} vs ${b}]`);

function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
              '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const f = path.join(racine, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
        r.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res({ port: s.address().port, stop: () => s.close() }));
  });
}
process.on('unhandledRejection', (e) => {
  console.log('  RATE essai interrompu : ' + (e && e.message ? e.message : e));
  process.exit(1);
});

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/fampage-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  const { Game } = require(path.join(SERVEUR, 'game'));
  let moteur = null; const _p0 = Game.prototype._p;
  Game.prototype._p = function (a) { moteur = this; return _p0.call(this, a); };
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  await new Promise((r) => setTimeout(r, 1400));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const w = ethers.Wallet.createRandom();
  const erreurs = [];
  const p = await nav.newPage({ viewport: { width: 1100, height: 860 } });
  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) {
      const s = (pr === undefined) ? new N(u) : new N(u, pr);
      s.__m = []; s.__e = [];
      const sd = s.send.bind(s);
      s.send = function (d) { try { s.__e.push(JSON.parse(d)); } catch (x) {} return sd(d); };
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      window.__s.push(s); return s;
    }
    C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
    window.WebSocket = C;
  });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);

  /* ---- L ESPION ----
   * On regarde ce que la page DESSINE, jamais ce qu elle a en memoire. « La
   * liste des familiers est arrivee » et « le chien est a l ecran » sont deux
   * affirmations differentes, et seule la seconde interesse le joueur.
   * On garde la DERNIERE position de chaque espece : c est elle qui dit s il
   * a bouge entre deux images. */
  await p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionFam) return;
    C.__espionFam = true;
    window.__pets = {}; window.__moi = null;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      const m = u.match(/pet_shiba(?:_([a-z]+))?\.webp/);
      if (m && arguments.length >= 9) {
        const cle = m[1] || 'normal';
        const l = window.__pets[cle] || (window.__pets[cle] = { n: 0, vus: [] });
        l.n++;
        l.x = Math.round(arguments[5] + arguments[7] / 2);
        l.y = Math.round(arguments[6] + arguments[8]);
        /* Combien on en voit DANS UNE MEME IMAGE : deux chiens de la meme
           espece a l ecran, c est l enclos qui n a pas lache le sien. */
        l.vus.push({ x: l.x, y: l.y, t: performance.now() });
        if (l.vus.length > 60) l.vus.shift();
      }
      /* Le joueur : la seule planche dessinee en 150x150 depuis des cases de
         256. On ne recopie pas ses coordonnees du jeu — on lit ou il est
         PEINT, dans le meme repere que le chien. */
      if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
          && arguments[7] === 150 && arguments[8] === 150) {
        window.__moi = { x: Math.round(arguments[5] + 75), y: Math.round(arguments[6] + 130) };
      }
      return di.apply(this, arguments);
    };
  });
  const marche = async (t, ms) => {
    await p.keyboard.down(t); await p.waitForTimeout(ms);
    await p.keyboard.up(t); await p.waitForTimeout(140);
  };
  const raz = () => p.evaluate(() => { window.__pets = {}; });
  const pets = () => p.evaluate(() => window.__pets);
  const moi = () => p.evaluate(() => window.__moi);
  const envois = (t) => p.evaluate((tt) => window.__s[0].__e.filter((m) => m.type === tt), t);

  /* On lui fait eclore deux familiers par le chemin normal du serveur : c est
     `ouvreOeuf` qui les cree partout ailleurs, et fabriquer la fiche a la
     main ici testerait une forme que le jeu ne produit jamais. */
  const q = moteur._p(w.address);
  q.skins = { andy: true }; q.skinActif = 'andy';
  q.sacOeufs = { legendaire: 1, feu: 1 }; q.sacCases = null;
  moteur.ouvreOeuf(w.address, 'legendaire');
  moteur.ouvreOeuf(w.address, 'feu');
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'familiers' })));
  await p.waitForTimeout(600);
  const liste = await p.evaluate(() => (window.__s[0].__m.filter((m) => m.type === 'familiers').pop() || {}).familiers);
  eq(liste && liste.length, 2, 'la page recoit les deux familiers eclos');
  ok(liste && liste.every((f) => !f.actif), 'aucun n est sorti au depart');

  /* ================== 1. ILS SONT DANS L ENCLOS ================== */
  console.log('\n-- l enclos n est pas vide --');
  /* On descend jusqu a voir la cour : les animaux ne sont dessines que
     lorsqu elle est a l ecran, comme tout le reste du hall. */
  await marche('ArrowRight', 2400);
  await marche('ArrowDown', 3400);
  await p.waitForTimeout(400);
  await raz();
  await p.waitForTimeout(500);
  let v = await pets();
  ok((v.legendaire && v.legendaire.n) > 0, `le legendaire broute dans la cour (${(v.legendaire || {}).n || 0} images)`);
  ok((v.feu && v.feu.n) > 0, `celui de feu aussi (${(v.feu || {}).n || 0})`);
  /* Ils ne se superposent pas : deux animaux au meme endroit, c est un seul
     animal a l ecran, et l un des deux n existe pas pour le joueur. */
  const ecart = (v.legendaire && v.feu)
    ? Math.hypot(v.legendaire.x - v.feu.x, v.legendaire.y - v.feu.y) : 0;
  ok(ecart > 40, `et chacun a sa place (${Math.round(ecart)} d ecart)`);
  /* Ils BOUGENT : un enclos ou rien ne remue est une nature morte. */
  const bouge = await p.evaluate(() => {
    const l = window.__pets.legendaire;
    if (!l || l.vus.length < 4) return 0;
    const a = l.vus[0], b = l.vus[l.vus.length - 1];
    return Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  });
  ok(bouge > 0, `ils se promenent (${bouge} parcourus)`);

  /* ================== 2. LA GRANGE OUVRE ================== */
  console.log('\n-- on entre a Petworld --');
  const ouvert = () => p.evaluate(() => {
    const el = document.getElementById('nxPetVoile');
    return !!(el && el.classList.contains('on'));
  });
  ok((await ouvert()) === false, 'le panneau est ferme tant qu on n y est pas alle');
  /* On VISE la grange la ou elle est peinte. Compter les secondes supposerait
     une vitesse et une position de depart, deux choses qui changeront. */
  const grange = () => p.evaluate(() => window.__grange || null);
  await p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionG) return;
    C.__espionG = true;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      if (/obj_grange\.webp/.test(u) && arguments.length >= 5) {
        window.__grange = { x: Math.round(arguments[1] + arguments[3] / 2),
                            y: Math.round(arguments[2] + arguments[4]) };
      }
      return di.apply(this, arguments);
    };
  });
  await p.waitForTimeout(300);
  /* Deux temps SEPARES, jamais un arbre de decisions relu a chaque pas : « va
     a droite si tu es a gauche, monte si tu es aligne » se contredit des
     qu on est aligne et trop bas, et le personnage fait la navette. */
  for (let k = 0; k < 18 && !(await ouvert()); k++) {
    const m = await moi(); const g = await grange();
    if (!m || !g || Math.abs(m.x - g.x) <= 40) break;
    await marche(m.x < g.x ? 'ArrowRight' : 'ArrowLeft', 220);
  }
  for (let k = 0; k < 18 && !(await ouvert()); k++) {
    const m = await moi(); const g = await grange();
    if (!m || !g) break;
    await marche(m.y > g.y ? 'ArrowUp' : 'ArrowDown', 200);
  }
  ok((await ouvert()) === true, 'marcher jusqu a la grange ouvre l enclos');
  const fiches = await p.evaluate(() => Array.from(document.querySelectorAll('#nxPetCorps .nxpw-f'))
    .map((e) => ({ espece: e.getAttribute('data-espece'),
                   actif: e.classList.contains('actif'),
                   fond: (e.querySelector('.nxpw-vig') || {}).style
                         ? e.querySelector('.nxpw-vig').style.backgroundImage : '',
                   texte: e.textContent })));
  eq(fiches.length, 2, 'les deux familiers y ont leur fiche');
  ok(fiches.every((f) => /pet_shiba/.test(f.fond)),
     'chacune montre SON dessin, pas un carre vide');
  ok(fiches.some((f) => /Prism/.test(f.texte)) && fiches.some((f) => /Ember/.test(f.texte)),
     'avec le nom que le serveur leur donne');
  ok(fiches.some((f) => /Heals you/.test(f.texte)),
     'et le pouvoir, lu depuis le serveur et non recopie ici');

  /* ================== 3. LE CHOIX PART AU SERVEUR ================== */
  console.log('\n-- on en sort un --');
  await p.evaluate(() => {
    document.querySelector('#nxPetCorps .nxpw-f[data-espece="legendaire"]').click();
  });
  await p.waitForTimeout(700);
  const dep = await envois('familierSort');
  eq(dep.length, 1, 'un clic envoie familierSort');
  eq(dep[0] && dep[0].espece, 'legendaire', 'avec l espece cliquee');
  eq(moteur.familierActifDe(w.address), 'legendaire',
     'et c est le SERVEUR qui l inscrit — la page ne fait que demander');
  const coche = await p.evaluate(() => {
    const e = document.querySelector('#nxPetCorps .nxpw-f[data-espece="legendaire"]');
    return !!(e && e.classList.contains('actif'));
  });
  ok(coche, 'la fiche se coche depuis la reponse, pas depuis le clic');

  /* On referme pour rendre la main au personnage. */
  await p.evaluate(() => document.querySelector('#nxPetVoile .nxcf-x').click());
  await p.waitForTimeout(300);
  /* On s ecarte de la grange, sinon on la remet aussitot en marchant. */
  await marche('ArrowDown', 1200);
  await p.waitForTimeout(400);

  /* ================== 4. IL SUIT ================== */
  console.log('\n-- il suit --');
  await raz();
  await p.waitForTimeout(400);
  let m0 = await moi(); let v0 = await pets();
  const pres0 = (v0.legendaire && m0) ? Math.hypot(v0.legendaire.x - m0.x, v0.legendaire.y - m0.y) : 1e9;
  ok(pres0 < 200, `il se tient pres du joueur (${Math.round(pres0)})`);
  /* On marche LOIN, puis on regarde : un dessin colle au personnage aurait
     la meme distance avant et apres, un compagnon qui court la rattrape. */
  await marche('ArrowLeft', 2200);
  await p.waitForTimeout(500);
  const m1 = await moi(); const v1 = await pets();
  const pres1 = (v1.legendaire && m1) ? Math.hypot(v1.legendaire.x - m1.x, v1.legendaire.y - m1.y) : 1e9;
  ok(pres1 < 200, `il rattrape apres une course (${Math.round(pres1)})`);
  const parcouru = (v0.legendaire && v1.legendaire)
    ? Math.round(Math.hypot(v1.legendaire.x - v0.legendaire.x, v1.legendaire.y - v0.legendaire.y)) : 0;
  ok(parcouru > 60, `il a vraiment traverse la carte derriere nous (${parcouru})`);
  /* Et il n est PAS sur le joueur : un compagnon superpose est un costume. */
  ok(pres1 > 8, `sans lui monter dessus (${Math.round(pres1)})`);
  /* ---- DEUX SEUILS, ET ON LE VOIT ----
   * Avec un SEUL seuil, le familier repart des qu il l a franchi d un pixel :
   * il se cale a la distance exacte de la laisse et ne la quitte jamais.
   * Deux mesures suffisent a le dementir — apres deux courses differentes il
   * s arrete a deux distances differentes, parce qu il court jusqu a etre
   * revenu et non jusqu a etre a la laisse. */
  await marche('ArrowUp', 900);
  await p.waitForTimeout(700);
  const v2 = await pets(); const m2b = await moi();
  const arret = (v2.legendaire && m2b)
    ? Math.hypot(v2.legendaire.x - m2b.x, v2.legendaire.y - m2b.y) : 1e9;
  ok(Math.abs(arret - pres1) > 2,
     `il ne se cale pas toujours au meme ecart (${Math.round(arret)} puis ${Math.round(pres1)})`);
  ok(arret < 70, `et il reste dans un pas du joueur (${Math.round(arret)})`);

  /* ================== 5. IL A QUITTE L ENCLOS ================== */
  console.log('\n-- l enclos n a plus que l autre --');
  /* On revient voir la cour : celui qui est sorti ne doit plus y brouter, ou
     le joueur en verrait deux et ne saurait plus lequel est le sien. */
  await marche('ArrowRight', 2200);
  await p.waitForTimeout(400);
  await raz();
  await p.waitForTimeout(500);
  v = await pets();
  ok((v.feu && v.feu.n) > 0, 'celui qu on n a pas sorti est toujours dans la cour');
  /* Le legendaire est encore a l ecran — mais UNE seule fois par image, celle
     du compagnon. Deux exemplaires signifieraient que l enclos garde le sien
     en plus de celui qui nous suit. */
  const doubles = await p.evaluate(() => {
    const l = window.__pets.legendaire;
    if (!l || l.vus.length < 6) return -1;
    /* Les images d une meme trame se suivent a moins d une milliseconde. */
    let maxi = 1, k = 1;
    for (let i = 1; i < l.vus.length; i++) {
      if (l.vus[i].t - l.vus[i - 1].t < 2) { k++; if (k > maxi) maxi = k; } else k = 1;
    }
    return maxi;
  });
  eq(doubles, 1, 'et le sorti n est dessine qu une fois par image');

  /* ================== 6. IL PASSE LES PORTES ================== */
  console.log('\n-- et il passe la porte --');
  /* On entre dans le monde de combat par le chemin du serveur : le portail
     demande une marche de plus, et ce n est pas ce qu on verifie ici. */
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin', monde: 'ouvert' })));
  await p.waitForTimeout(1600);
  await raz();
  await p.waitForTimeout(600);
  const dedans = await pets();
  ok((dedans.legendaire && dedans.legendaire.n) > 0,
     `le compagnon a franchi la porte (${(dedans.legendaire || {}).n || 0} images)`);
  ok(!dedans.feu, 'et celui reste a l enclos n a pas suivi dans le monde');
  const m2 = await moi();
  const pres2 = (dedans.legendaire && m2)
    ? Math.hypot(dedans.legendaire.x - m2.x, dedans.legendaire.y - m2.y) : 1e9;
  ok(pres2 < 260, `il se replace derriere son maitre, pas a l autre bout (${Math.round(pres2)})`);

  /* Le serveur le porte aussi dans ce que voient les AUTRES : sans ce champ,
     chacun ne verrait que son propre chien. */
  const fiche = moteur.familierActifDe(w.address);
  eq(fiche, 'legendaire', 'le serveur sait toujours lequel est sorti');

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nfamilier_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
