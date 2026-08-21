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
  /* Toutes les simulations, pas la derniere qui a tourne : il y en a deux
     (le monde vert et la carte rouge) et un donjon en cree une troisieme. On
     retrouvera la bonne par le JOUEUR qu elle contient. */
  const { Realm } = require(path.join(SERVEUR, 'realm'));
  const mondes = [];
  const _rj = Realm.prototype.rejoint;
  Realm.prototype.rejoint = function () {
    if (mondes.indexOf(this) < 0) mondes.push(this);
    return _rj.apply(this, arguments);
  };
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
  /* Cliquer une fiche SELECTIONNE : on nourrit aussi ceux qu on laisse a
     l enclos, et un panneau qui obligerait a sortir un animal pour lui donner
     a manger aurait fait sortir six fois de suite quelqu un qui voulait juste
     nourrir tout le monde. Sortir a donc son propre bouton. */
  await p.evaluate(() => {
    document.querySelector('#nxPetCorps .nxpw-f[data-espece="legendaire"]').click();
  });
  await p.waitForTimeout(300);
  const regarde = await p.evaluate(() => {
    const e = document.querySelector('#nxPetCorps .nxpw-f[data-espece="legendaire"]');
    return { vu: !!(e && e.classList.contains('vu')),
             fiche: (document.getElementById('nxPetFiche') || {}).textContent || '' };
  });
  ok(regarde.vu, 'un clic marque celui qu on REGARDE');
  ok(/Prism/.test(regarde.fiche), 'et sa fiche s ouvre en dessous');
  eq((await envois('familierSort')).length, 0,
     'sans rien sortir — regarder n est pas equiper');
  await p.evaluate(() => document.querySelector('#nxPetFiche [data-sort]').click());
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

  /* ================== 3bis. ON LE NOURRIT ================== */
  console.log('\n-- et on le nourrit --');
  /* Une commune et une legendaire dans le sac, plus de l or. La legendaire
     est la : le panneau ne doit PAS la proposer — au moment ou une legendaire
     nourrit mieux qu elle ne se porte, le meilleur usage d une legendaire
     devient de la detruire. */
  const boutique = require(path.join(SERVEUR, 'boutique'));
  let idCommun = null, idLegendaire = null;
  for (let id = 1000; id < 6000 && !(idCommun && idLegendaire); id++) {
    const o = boutique.item(id);
    if (!o) continue;
    if (o.rarete === 'commun' && !idCommun) idCommun = o.id;
    if (o.rarete === 'legendaire' && !idLegendaire) idLegendaire = o.id;
  }
  q.sac = {}; q.sac[idCommun] = 2; q.sac[idLegendaire] = 1;
  q.sacCases = null; q.fame = 5000;
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'equipable' })));
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'familiers' })));
  await p.waitForTimeout(700);
  const plats = await p.evaluate(() => Array.from(document.querySelectorAll('#nxPetFiche [data-plat]'))
    .map((e) => Number(e.getAttribute('data-plat'))));
  ok(plats.indexOf(idCommun) >= 0, `la commune est proposee au repas (${plats.join(',')})`);
  ok(plats.indexOf(idLegendaire) < 0, 'la legendaire ne l est PAS');
  const prixVu = await p.evaluate(() => (document.querySelector('#nxPetFiche .nxpw-rt') || {}).textContent || '');
  ok(/40 gold/.test(prixVu), `le prix se lit AVANT de cliquer (${prixVu.trim()})`);

  const xpAvant = moteur.familiersDe(w.address).filter((f) => f.espece === 'legendaire')[0].xp;
  const orAvant = moteur.orDe(w.address);
  await p.evaluate((id) => document.querySelector('#nxPetFiche [data-plat="' + id + '"]').click(), idCommun);
  await p.waitForTimeout(800);
  const apresRepas = moteur.familiersDe(w.address).filter((f) => f.espece === 'legendaire')[0];
  eq(apresRepas.xp - xpAvant, 10, 'un clic sur une commune donne dix points');
  eq(orAvant - moteur.orDe(w.address), 40, 'et coute quarante d or');
  eq((moteur._p(w.address).sac || {})[idCommun], 1, 'la piece a quitte le sac, une seule');
  const barre = await p.evaluate(() => {
    const i = document.querySelector('#nxPetFiche .nxpw-xp i');
    return { large: i ? i.style.width : null,
             texte: (document.querySelector('#nxPetFiche .nxpw-xpt') || {}).textContent || '' };
  });
  ok(/10 \/ 80 XP/.test(barre.texte), `la barre montre l avance DANS le palier (${barre.texte})`);
  ok(barre.large && parseFloat(barre.large) > 0, `et elle se remplit (${barre.large})`);

  /* Le refus se VOIT : sans or, la page ne doit pas laisser croire que ca a
     marche. On vide la bourse et l on reessaie. */
  q.fame = 0;
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'familiers' })));
  await p.waitForTimeout(500);
  const xp2 = moteur.familiersDe(w.address).filter((f) => f.espece === 'legendaire')[0].xp;
  await p.evaluate((id) => {
    const e = document.querySelector('#nxPetFiche [data-plat="' + id + '"]');
    if (e) e.click();
  }, idCommun);
  await p.waitForTimeout(700);
  eq(moteur.familiersDe(w.address).filter((f) => f.espece === 'legendaire')[0].xp, xp2,
     'sans or, le repas ne passe pas');
  eq((moteur._p(w.address).sac || {})[idCommun], 1, 'et la piece n est pas detruite');
  /* Le refus doit se lire DANS le panneau : `flotte` peint sur le canvas, et
     sous un panneau plein ecran le joueur clique, rien ne se passe, et rien ne
     dit pourquoi. */
  const dit = await p.evaluate(() => (document.querySelector('#nxPetFiche .nxpw-non') || {}).textContent || '');
  ok(/Need 40 gold/.test(dit), `la page dit pourquoi, dans le panneau (${dit.trim()})`);
  q.fame = 5000;

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

  /* ================== 7. ET IL AIDE ==================
   * Le legendaire soigne toutes les cinq secondes, sans qu on appuie sur
   * rien. Une aide invisible n est pas une aide : si rien n arrive a la page,
   * le joueur ne saura jamais si son compagnon sert a quelque chose, ni
   * lequel choisir — et les six deviennent six dessins. */
  console.log('\n-- et il soigne --');
  /* On le blesse dans la SIMULATION, la ou la vie existe. Fabriquer une
     valeur dans la page testerait un chiffre qu elle s est donne toute
     seule. Le monde se retrouve par le joueur qu il CONTIENT : « le dernier
     monde qui a tourne » se trompe des qu il y en a deux. */
  const jm = mondes.map((R) => R.joueurs.get(w.address.toLowerCase()))
                   .filter(Boolean)[0];
  ok(!!jm, 'la simulation nous a bien');
  jm.pv = Math.max(1, Math.round(jm.pvMax * 0.4));
  /* ---- ON GUETTE UNE REMONTEE, PAS UN ETAT FINAL ----
   * Comparer la vie avant et apres six secondes serait faux : les monstres
   * tapent pendant ce temps-la, et un joueur soigne PUIS mordu finit plus bas
   * qu il n a commence. Seule une AUGMENTATION entre deux mesures ne peut
   * venir que du soin — rien d autre dans ce jeu ne rend de la vie en combat.
   * On garde aussi la vie a flot : mesurer un soin sur un mort n a pas de
   * sens, et l essai porte sur le soin. */
  /* ---- ET PAS LA REGENERATION ----
   * Premiere version : « n importe quelle remontee ». Elle passait au vert
   * sur un +1 — la regeneration naturelle, qui remonte aussi la vie. On
   * compare donc la plus grosse remontee au GAIN que le serveur annonce :
   * seul le soin fait un bond de cette taille-la. */
  /* On fait le VIDE autour : l essai porte sur le soin, pas sur le combat.
     Une morsure dans la meme fenetre de cent millisecondes retranche du bond
     qu on mesure, et l essai passait ou echouait selon ce qui rodait. Le
     monde se repeuple « jamais sous le nez de quelqu un », donc le vide
     tient. */
  const monde0 = mondes.filter((R) => R.joueurs.get(w.address.toLowerCase()))[0];
  let remonte = 0, dernier = jm.pv;
  for (let k = 0; k < 75; k++) {
    monde0.monstres.length = 0; monde0.tirsM.length = 0; monde0.zones.length = 0;
    await p.waitForTimeout(100);
    if (jm.pv <= 0) break;
    if (jm.pv > dernier) remonte = Math.max(remonte, jm.pv - dernier);
    dernier = jm.pv;
    if (jm.pv < jm.pvMax * 0.2) { jm.pv = Math.round(jm.pvMax * 0.4); dernier = jm.pv; }
    /* On ne sort PAS a la premiere remontee : la premiere est presque
       toujours le +1 de la regeneration, et s arreter la reviendrait a
       mesurer la regeneration en croyant mesurer le soin. On laisse passer
       deux recharges entieres et l on garde le plus gros bond. */
  }
  const vu = await p.evaluate(() => window.__s[0].__m.filter((x) => x.type === 'realmFam'));
  ok(vu.length > 0, `la page apprend le geste (${vu.length})`);
  eq(vu[0] && vu[0].quoi, 'soigne', 'par un message qui dit ce que c est');
  ok(vu[0] && vu[0].gain > 0, `avec le nombre de points rendus (${vu[0] && vu[0].gain})`);
  /* La moitie du gain, pas le gain exact : un monstre peut mordre dans la
     meme fenetre de cent millisecondes, et la mesure porte alors sur le soin
     MOINS sa morsure. La moitie reste hors de portee de la regeneration, qui
     rend un point a la fois — c est la confusion qu on cherche a exclure. */
  ok(remonte >= (vu[0] ? vu[0].gain : 1e9) / 2,
     `et la vie fait un bond, pas le +1 de la regeneration (+${remonte} pour ${vu[0] && vu[0].gain} annonces)`);

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nfamilier_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
