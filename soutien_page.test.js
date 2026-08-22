/* LE TROISIEME CRAN DU FAMILIER — LE SOUTIEN, A L ECRAN.
 *
 * Le serveur l applique et le mesure de son cote. Ce fichier verifie l autre
 * moitie, celle qui decide si le joueur le VOIT — et s il comprend pourquoi
 * il ne revient pas tout de suite.
 *
 * Le soutien ne vise RIEN, et c est ce qui le rend fragile a l affichage. Les
 * deux premiers crans FRAPPENT — une cible au premier niveau, une zone au
 * vingt-cinquieme — et se voient donc la ou ils frappent : un monstre qui
 * gele, un anneau au sol. Celui-ci se pose sur le MAITRE, ne prend la vie de
 * personne et ne fait bondir aucun chien. Sans dessin, il n existe pas.
 *
 * Quatre choses, et chacune casse sans bruit :
 *
 * 1. LES SIX PLANCHES ARRIVENT AU CANVAS. Six especes, six pouvoirs neufs :
 *    une planche qui ne se charge pas et l espece correspondante n a plus
 *    rien a montrer de son plus haut geste — celui qui a coute des centaines
 *    de repas.
 * 2. CHACUNE SUIT LE JOUEUR. Un soutien tient quatre a cinq secondes et l on
 *    marche pendant ce temps-la. Posee au sol comme une zone, l aide serait
 *    restee derriere nous a l instant precis ou elle sert.
 * 3. LA FICHE ANNONCE LE DELAI. C est le chiffre qui tient l equilibre du
 *    cran : il court a part de la recharge du compagnon. Sans lui, le joueur
 *    voit le chien remordre trois secondes plus tard sans que le soutien
 *    reparte, et croit son compagnon casse.
 * 4. ET LES TROIS CRANS SE LISENT D UN COUP, les fermes avec leur niveau.
 *    Personne ne nourrit mille fois pour un pouvoir dont il ignore
 *    l existence.
 *
 * Comme partout ici : on ne lit aucune variable de la page — elles vivent
 * dans une fermeture. On enregistre ce qui est PEINT, et tout ce qu on
 * compare vient du MOTEUR, jamais d un chiffre recopie dans cet essai.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('soutien_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('soutien_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/soutien-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);

  /* ---- LA LISTE DES SIX VIENT DU MONDE ----
   * Ni les especes, ni les cles de leurs soutiens ne sont ecrites ici : elles
   * sont recopiees le jour ou l on en ajoute une septieme, et l essai
   * continuerait alors de dire « les six sont la » en en oubliant une. */
  const M = require(path.join(SERVEUR, 'monde'));
  if (!M.POUVOIRS_SOUTIEN || !M.POUVOIRS_SOUTIEN.size) {
    console.log('soutien_page.test.js : le serveur n a pas encore le cran de soutien — essai saute');
    process.exit(0);
  }
  const ESPECES = Object.keys(M.POUVOIRS_PAR_ESPECE);
  const soutienDe = (esp) => (M.pouvoirsDe(esp, M.FAMILIERS.niveauMax)
    .filter((x) => x.soutien)[0] || {}).cle;
  const CLES = ESPECES.map(soutienDe);

  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);

  const { Game } = require(path.join(SERVEUR, 'game'));
  let moteur = null; const _p0 = Game.prototype._p;
  Game.prototype._p = function (a) { moteur = this; return _p0.call(this, a); };
  /* On retient TOUTES les simulations qui tournent, et l on retrouvera la
     bonne par le JOUEUR qu elle contient : « la derniere qui a tourne » se
     trompe des qu il y en a deux, et il y en a toujours au moins deux. */
  const { Realm } = require(path.join(SERVEUR, 'realm'));
  const ouverts = new Set();
  const pas0 = Realm.prototype.pas;
  Realm.prototype.pas = function (dt) { if (!this.plan) ouverts.add(this); return pas0.call(this, dt); };
  const mondeDe = (a) => [...ouverts].find((r) => r.joueurs.has(String(a).toLowerCase())) || null;

  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  await new Promise((r) => setTimeout(r, 1400));

  /* ================== 1. LES SIX PLANCHES ================== */
  console.log('\n-- les six planches du troisieme cran --');
  for (const cle of CLES) {
    ok(fs.existsSync(path.join(SITE, 'img/nexus/effets/fam_' + cle + '.webp')),
       `fam_${cle}.webp est sur le disque`);
  }

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
      s.__m = [];
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      window.__s.push(s); return s;
    }
    C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
    window.WebSocket = C;

    /* ---- ET LE TEXTE PEINT ----
     * `fillText` et lui seul : le contour (`strokeText`) est pose juste avant
     * avec le meme texte, et le compter aussi ferait voir chaque phrase deux
     * fois. C est par la que passe tout ce que la page ANNONCE au milieu de
     * l ecran, la ou le joueur regarde. */
    window.__ecrits = [];
    const F = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t) {
      window.__ecrits.push(String(t));
      if (window.__ecrits.length > 6000) window.__ecrits.splice(0, 3000);
      return F.apply(this, arguments);
    };
  });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([a, b]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: a, signature: b })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);

  /* Les planches se chargent DANS LE NAVIGATEUR qui les affichera : un fichier
     present sur le disque mais illisible (mauvais format, coupe a la moitie)
     passerait la verification precedente sans jamais rien dessiner. */
  const planches = await p.evaluate(async (liste) => {
    const out = {};
    for (const cle of liste) {
      const im = new Image();
      im.src = 'img/nexus/effets/fam_' + cle + '.webp';
      await new Promise((r) => { im.onload = r; im.onerror = r; });
      out[cle] = im.naturalWidth
        ? { l: im.naturalWidth, h: im.naturalHeight, cases: im.naturalWidth / im.naturalHeight }
        : null;
    }
    return out;
  }, CLES);
  for (const cle of CLES) {
    const m = planches[cle];
    ok(!!m, `${cle} se charge dans le navigateur`);
    /* Six cases carrees : la page decoupe la largeur en six et prend toute la
       hauteur. Une planche de cinq cases sortirait un dessin decale d un
       sixieme a chaque image, sans erreur nulle part. */
    if (m) eq(m.cases, 6, `${cle} : six cases de ${m.h}x${m.h}`);
  }

  /* ---- L ESPION ----
   * On note OU chaque planche de soutien est peinte, et OU le joueur est peint
   * dans la meme image. Les deux positions sont lues au canvas, dans le meme
   * repere : c est la seule facon de repondre a « est-ce que ca le suit ? »
   * sans recopier une coordonnee de la page dans l essai. */
  await p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionSout) return;
    C.__espionSout = true;
    window.__fx = {}; window.__moi = null;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      /* Le joueur : la seule planche dessinee en 150x150 depuis des cases de
         256. On la lit AVANT les effets, qui se peignent par-dessus toute la
         pile dans la meme image — donc `__moi` est bien celui de cette
         image-la et pas de la precedente. */
      if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
          && arguments[7] === 150 && arguments[8] === 150) {
        window.__moi = { x: Math.round(arguments[5] + 75), y: Math.round(arguments[6] + 130) };
      }
      const fx = u.match(/fam_([a-z]+)\.webp/);
      if (fx && arguments.length >= 9) {
        const l = window.__fx[fx[1]] || (window.__fx[fx[1]] = []);
        l.push({ x: Math.round(arguments[5] + arguments[7] / 2),
                 y: Math.round(arguments[6] + arguments[8] / 2),
                 moi: window.__moi ? window.__moi.x : null });
        if (l.length > 400) l.shift();
      }
      return di.apply(this, arguments);
    };
  });

  /* ---- SIX FAMILIERS, ECLOS PAR LE CHEMIN DU JEU ----
   * `ouvreOeuf` est ce qui les cree partout ailleurs. Fabriquer six fiches a
   * la main ici testerait une forme que le jeu ne produit jamais. */
  const addr = w.address;
  const q = moteur._p(addr);
  q.skins = { andy: true }; q.skinActif = 'andy';
  q.sacOeufs = {}; q.sacCases = null;
  for (const esp of ESPECES) { q.sacOeufs[esp] = 1; moteur.ouvreOeuf(addr, esp); }
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'familiers' })));
  await p.waitForTimeout(700);
  const auServeur = (esp) => moteur.familiersDe(addr).filter((f) => f.espece === esp)[0];
  eq(moteur.familiersDe(addr).length, ESPECES.length,
     'les six especes sont ecloses');

  /* ---- LA FICHE S OUVRE SANS TRAVERSER LE HALL ----
   * L emplacement du compagnon, dans le panneau, ouvre l enclos d un clic.
   * Marcher jusqu a la grange se verifie ailleurs (petworld_page.test.js) et
   * n a rien a voir avec ce que cet essai mesure. */
  const ouvre = () => p.evaluate(() => {
    const e = document.getElementById('nxFam');
    if (e) e.click();
  });
  const lignes = async (esp) => {
    await p.evaluate((e) => {
      const c = document.querySelector('#nxPetCorps .nxpw-f[data-espece="' + e + '"]');
      if (c) c.click();
    }, esp);
    await p.waitForTimeout(180);
    return p.evaluate(() => Array.from(document.querySelectorAll('#nxPetFiche .nxpw-p'))
      .map((e) => ({ txt: e.textContent, ouvert: e.classList.contains('on') })));
  };
  await ouvre();
  await p.waitForTimeout(600);

  /* ================== 2. TROIS CRANS, DONT LES FERMES ================== */
  console.log('\n-- trois crans dans la fiche, des le premier niveau --');
  for (const esp of ESPECES) {
    const f = auServeur(esp);
    const vu = await lignes(esp);
    /* Le NOMBRE de crans vient du serveur. L ecrire ici — « trois » — aurait
       laisse l essai au vert le jour ou la page en oublierait un, puisqu il
       aurait compare trois a trois sans jamais regarder la liste recue. */
    eq(vu.length, f.pouvoirs.length,
       `${esp} : autant de lignes que le serveur annonce de crans`);
    const fermes = f.pouvoirs.filter((x) => !x.ouvert);
    ok(fermes.length > 0, `${esp} : au premier niveau, il reste des crans a ouvrir (${fermes.length})`);
    /* Chaque ferme dit LE NIVEAU qui l ouvre, et ce niveau vient du serveur.
       C est tout ce qui donne envie de nourrir mille fois : un pouvoir qu on
       ne voit pas ne se merite pas. */
    const manquants = fermes.filter((x) => !vu.some(
      (L) => !L.ouvert && L.txt.indexOf('Lv ' + x.niveau) >= 0));
    eq(manquants.length, 0,
       `${esp} : chaque cran ferme montre son niveau (${fermes.map((x) => 'Lv ' + x.niveau).join(', ')})`);
  }

  /* ================== 3. LE DELAI DU SOUTIEN SE LIT ================== */
  console.log('\n-- et le troisieme cran annonce SON delai --');
  /* On les monte au bout par le seul chemin qui existe : leur XP. Le niveau
     n est pas ecrit ici — on le redemande au serveur apres coup, et c est lui
     qui dit si le cran est ouvert. */
  for (const esp of ESPECES) q.familiers[esp].xp = 1e9;
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'familiers' })));
  await p.waitForTimeout(700);
  for (const esp of ESPECES) {
    const f = auServeur(esp);
    const s = f.pouvoirs.filter((x) => x.soutien)[0];
    ok(!!s && s.ouvert, `${esp} : son soutien est ouvert au niveau ${f.niveau}`);
    if (!s || !s.ouvert) continue;
    /* ---- L ESSAI N A DE SENS QUE SI LES DEUX CHIFFRES DIFFERENT ----
     * Le delai du soutien et la recharge du compagnon sont deux temps
     * separes. S ils tombaient sur le meme nombre, une phrase qui n annonce
     * que la recharge passerait cette section sans rien prouver — on le
     * verifie donc AVANT de chercher le delai a l ecran. */
    const delai = Math.round(s.effet.delai);
    const recharge = Math.round(s.effet.recharge);
    ok(delai > 0 && delai !== recharge,
       `${esp} : le serveur annonce un delai propre (${delai}s, recharge ${recharge}s)`);
    const vu = await lignes(esp);
    const L = vu.filter((x) => x.txt.indexOf(s.nom) >= 0)[0];
    ok(!!L && L.ouvert, `${esp} : la ligne « ${s.nom} » est ouverte dans la fiche`);
    if (!L) continue;
    /* Le nombre entier, suivi de son « s » : chercher « 18 » nu serait tombe
       juste sur un « 180 » ou sur une part en pourcentage, et l essai aurait
       dit oui a une phrase qui ne parle pas du delai. */
    ok(new RegExp('(^|[^0-9.])' + delai + 's').test(L.txt),
       `${esp} : et elle dit tous les combien il revient — ${L.txt.trim()}`);
  }
  await p.evaluate(() => {
    const x = document.querySelector('#nxPetVoile .nxcf-x');
    if (x) x.click();
  });
  await p.waitForTimeout(300);

  /* ================== 4. IL SE PEINT, ET IL SUIT ================== */
  console.log('\n-- les six se peignent sur le maitre, et le suivent --');
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForTimeout(1800);
  const monde0 = mondeDe(addr);
  ok(!!monde0, 'on est entre dans le monde de combat');
  const j = monde0.joueurs.get(addr.toLowerCase());
  ok(!!j, 'et la simulation nous y tient un corps');

  /* ---- CE QUI DECIDE QU UN SOUTIEN PART ----
   * Le compagnon ne pose son aide que s il y a quelque chose a combattre dans
   * son rayon : sinon il grillerait son delai en traversant une clairiere
   * vide. On lui pose donc UNE creature, et une seule — figee, pour qu elle
   * ne morde pas, ne tire pas et ne bouge pas. Un monde peuple aurait mele
   * des paralysies a la marche qu on mesure, et l essai serait tombe au
   * hasard de ce qui rodait. Le rayon vient du monde, pas d ici. */
  const DISTANCE = Math.round(M.FAMILIERS.zoneRayon * 0.4);
  let gardien = null;
  const poseGardien = () => {
    gardien = { id: monde0._nouvelId(), espece: 'lime', biome: 'terre',
                x: j.x + DISTANCE, y: j.y, ancreX: j.x + DISTANCE, ancreY: j.y,
                pv: 1e6, pvMax: 1e6, dir: 'down', cible: null,
                recharge: 0, rechargeT: 0, stase: 9e9, feu: 0, feuReste: 0,
                feuTaux: 0, feuPar: null, errX: 0, errY: 0, errChrono: 0 };
    monde0.monstres.push(gardien);
  };
  /* ---- ON REMET LE COMPAGNON A ZERO AVANT CHAQUE MESURE ----
   * Les six REFUSENT de repartir tant que leur effet tient : c est ce refus
   * qui les empeche d etre permanents. Un essai qui ne remettrait pas ces
   * etats a zero mesurerait le premier soutien et six refus. */
  const remetAZero = () => {
    monde0.monstres.length = 0; monde0.tirsM.length = 0; monde0.zones.length = 0;
    j.rafale = 0; j.ardeur = 0; j.racines = 0; j.bouclier = 0;
    for (const c of Object.keys(M.EFFETS)) { j[c] = 0; j.immun[c] = 0; }
    j.brulReste = 0;
    /* La vie entamee et le mana vide : les racines refusent d accelerer une
       regeneration qui n a rien a rendre, et l emprise refuse de verser dans
       une reserve pleine. Les deux refus sont voulus cote serveur. */
    j.pv = Math.max(1, Math.round(j.pvMax * 0.5));
    j.mp = 0;
    j.famR = 0; j.famSoutienR = 0;
    poseGardien();
  };

  const TOUCHES = ['ArrowLeft', 'ArrowRight'];
  for (let i = 0; i < ESPECES.length; i++) {
    const esp = ESPECES[i], cle = CLES[i];
    /* On change de compagnon par le message du jeu : c est le serveur qui
       inscrit l espece et qui la fait suivre dans la simulation. */
    await p.evaluate((e) => window.__s[0].send(JSON.stringify({ type: 'familierSort', espece: e })), esp);
    await p.waitForTimeout(500);
    eq(j.fam, esp, `${esp} : la simulation sort le bon compagnon`);

    let trace = [];
    for (let essai = 0; essai < 3 && trace.length < 3; essai++) {
      /* On ALTERNE le sens d une espece a l autre. Marcher six fois du meme
         cote finit contre le bord de la carte, et la sixieme mesure porterait
         alors sur un personnage immobile — un essai qui tombe a la sixieme
         espece et jamais aux cinq premieres, pour une raison qui n a rien a
         voir avec ce qu il verifie. */
      const touche = TOUCHES[(i + essai) % TOUCHES.length];
      await p.evaluate(() => { window.__fx = {}; window.__ecrits.length = 0; });
      remetAZero();
      /* Le monde se repeuple tout seul et la creature figee reste seule
         cible : on tient le menage PENDANT la marche, sinon un arrivant
         mordrait au milieu de la mesure et la marche s arreterait sur une
         paralysie — on aurait alors mesure l immobilite. */
      const menage = setInterval(() => {
        monde0.monstres = monde0.monstres.filter((m) => m === gardien);
        monde0.tirsM.length = 0; monde0.zones.length = 0;
        gardien.x = j.x + DISTANCE; gardien.y = j.y;
        for (const c of Object.keys(M.EFFETS)) { j[c] = 0; }
      }, 50);
      await p.keyboard.down(touche);
      await p.waitForTimeout(1500);
      await p.keyboard.up(touche);
      clearInterval(menage);
      await p.waitForTimeout(150);
      trace = await p.evaluate((c) => window.__fx[c] || [], cle);
    }

    /* La planche arrive VRAIMENT au canvas. « Le serveur a pose le soutien »
       et « le joueur l a vu » sont deux affirmations differentes, et seule la
       seconde interesse quelqu un qui a nourri son chien mille fois. */
    ok(trace.length >= 3,
       `${esp} : la planche du soutien « ${cle} » est peinte (${trace.length} images)`);
    if (trace.length < 3) continue;

    const marche = Math.abs(trace[trace.length - 1].moi - trace[0].moi);
    /* Sans deplacement, la question « est-ce que ca suit ? » n a pas de
       reponse : une planche clouee au sol et une planche collee au joueur
       sont au meme endroit tant qu on ne bouge pas. On verifie donc d abord
       qu on a marche pendant que l effet tenait. */
    ok(marche > 40, `${esp} : on a marche pendant qu il tenait (${marche} unites)`);
    if (!(marche > 40)) continue;
    /* Et l ecart entre l effet et le joueur ne bouge pas. On le compare a la
       distance PARCOURUE, pas a un nombre choisi ici : c est exactement de
       cette distance-la qu une planche posee au sol se serait eloignee, et
       un seuil fixe aurait dit oui a une marche trop courte. */
    const ecarts = trace.map((s) => s.x - s.moi);
    const derive = Math.max(...ecarts) - Math.min(...ecarts);
    ok(derive < marche / 4,
       `${esp} : il reste sur le maitre qui marche (${derive} de derive pour ${marche} parcourus)`);
    /* Et il est peint SUR lui, pas a cote : un soutien pose a la distance
       d une zone aurait promis une aide aux gens autour, alors qu il ne
       touche que celui qui l a. On mesure l ecart contre le rayon que le
       serveur envoie — le seul nombre qui dise « large » dans ce message. */
    ok(Math.abs(ecarts[0]) < M.FAMILIERS.zoneRayon / 4,
       `${esp} : et centre sur lui (${Math.abs(ecarts[0])} d ecart)`);

    /* ---- ET CE QU IL DONNE SE DIT ----
     * Un seul des six rend quelque chose tout de suite, et c est le message
     * du serveur qui le designe : celui qui porte un `gain` et une reserve.
     * On ne nomme donc pas le pouvoir ici — le jour ou un deuxieme se met a
     * verser, cette verification le suit toute seule au lieu de l ignorer.
     * Le dessin ne suffit pas pour celui-la : la barre bleue remonte de toute
     * facon a l instantane suivant, et sans un mot le joueur voit sa reserve
     * bouger sans savoir d ou ca vient — exactement le defaut qu on avait
     * repare pour le mana VOLE. */
    const dit = await p.evaluate((c) => (window.__s[0].__m || [])
      .filter((m) => m.type === 'realmFam' && m.quoi === c).pop() || null, cle);
    ok(!!dit, `${esp} : le serveur a bien annonce « ${cle} »`);
    if (dit && dit.gain > 0 && dit.mp !== undefined) {
      const attendu = '+' + dit.gain + ' MP';
      const ecrits = await p.evaluate(() => window.__ecrits.slice());
      ok(ecrits.indexOf(attendu) >= 0,
         `${esp} : et la page annonce le chiffre du SERVEUR (${attendu})`);
    }
  }

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nsoutien_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
