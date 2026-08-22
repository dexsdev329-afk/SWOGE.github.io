/* LE COFFRE : LE COMPTE, LA LARGEUR, ET LES FLECHES A LA PLACE DE LA BARRE.
 *
 * Quatre promesses, et chacune se casse d'une facon differente :
 *
 * 1. LE COMPTE EST EN HAUT ET IL Y RESTE. Un compte pose dans le corps qui
 *    defile disparait au premier coup de molette — c'est-a-dire au moment
 *    precis ou l'on descend voir ce qu'on possede. Il doit donc vivre dans
 *    l'en-tete FIXE, et l'essai le verifie APRES avoir defile.
 *
 * 2. IL COMPTE DES OBJETS, PAS DES LIGNES. Trois anneaux identiques tiennent
 *    sur une seule ligne. Compter les lignes afficherait « 1 item » a
 *    quelqu'un qui en a paye trois.
 *
 * 3. AUCUNE BARRE, NI VERTICALE NI HORIZONTALE — mais le defilement reste
 *    VIVANT. La facon evidente de faire disparaitre une barre est de couper
 *    `overflow`, et elle fait disparaitre avec elle la moitie du coffre. On
 *    verifie donc les deux ensemble : pas de gouttiere, et `scrollHeight`
 *    toujours plus grand que la fenetre.
 *
 * 4. LES FLECHES NE SE MONTRENT QUE S'IL Y A DE QUOI DESCENDRE, et elles se
 *    grisent en butee. Deux fleches allumees en permanence sur un coffre de
 *    trois pieces, c'est le joueur qui apprend a ne plus les regarder.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('coffre_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('coffre_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp3': 'audio/mpeg' };
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/coffrepage-');
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
  const B = require(path.join(SERVEUR, 'boutique'));
  await new Promise((r) => setTimeout(r, 1400));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const w = ethers.Wallet.createRandom();
  const erreurs = [];

  const p = await nav.newPage({ viewport: { width: 1280, height: 900 } });
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
  });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));

  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const message = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(message);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [message, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);

  const q = moteur._p(w.address);
  q.skins = { andy: true }; q.skinActif = 'andy';

  /* ---- ON OUVRE LE COFFRE COMME UN JOUEUR ----
   * On marche jusqu'a lui. Poser `on` sur le voile a la main afficherait la
   * carte sans que la page se croie ouverte : elle ne la repeindrait jamais,
   * et l'essai mesurerait une carte vide en croyant mesurer un coffre plein.
   * Chemin repris de monde_page.test.js : on revient sur le portail, il faut
   * DESCENDRE avant d'aller a droite. */
  const marche = async (touche, ms) => {
    await p.keyboard.down(touche);
    await p.waitForTimeout(ms);
    await p.keyboard.up(touche);
    await p.waitForTimeout(250);
  };
  /* ---- SAVOIR OU L'ON EST ----
   * « Le coffre ne s'ouvre pas » et « on n'est jamais entre dans la salle »
   * se ressemblent et se soignent autrement. On regarde donc ce que la page
   * DESSINE : la salle a sa propre planche, et le personnage sa signature. */
  const espionne = () => p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionCf) return;
    C.__espionCf = true;
    window.__salleVue = 0; window.__moi = null; window.__halos = [];
    const di = C.drawImage, el = C.ellipse;
    C.ellipse = function (x, y, rx, ry) {
      if (ry < rx * 0.6 && rx > 40) window.__halos.push({ x: Math.round(x), r: Math.round(rx) });
      return el.apply(this, arguments);
    };
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      if (u.indexOf('room_vault') >= 0) window.__salleVue++;
      /* La porte se repere a SON dessin, dans le meme repere que le
         personnage : on n a alors ni le zoom ni la camera a refaire, et
         l essai ne verifie pas le calcul de la page avec le meme calcul. */
      /* ---- NEUF ARGUMENTS, PAS CINQ ----
       * La porte du coffre a recu `cadres: 4` : elle s anime, donc la page la
       * dessine en NEUF arguments — (image, sx, sy, sw, sh, dx, dy, dw, dh).
       * `arguments[1..4]` sont alors le decoupage dans la PLANCHE SOURCE, pas
       * la destination dans le monde. L essai visait donc un point du fichier
       * image, n entrait jamais dans la salle, et les huit verifications qui
       * suivent tombaient en cascade sans qu une seule regle du jeu soit
       * fausse.
       * On lit la destination, la ou elle est, selon la forme de l appel. */
      if (u.indexOf('obj_vault_door') >= 0 && arguments.length >= 5) {
        var d = arguments.length >= 9 ? 5 : 1;
        window.__porte = { x: arguments[d] + arguments[d + 2] / 2,
                           y: arguments[d + 1] + arguments[d + 3] };
      }
      if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
          && arguments[7] === 150 && arguments[8] === 150) {
        window.__moi = { x: Math.round(arguments[5] + 75), y: Math.round(arguments[6] + 130) };
      }
      return di.apply(this, arguments);
    };
  });
  const veille = () => p.evaluate(() => {
    const v = document.getElementById('nxCoffreVoile');
    const t = v.querySelector('.nxcf-titre');
    return { on: v.classList.contains('on'), titre: t ? t.textContent.trim() : '',
             salle: window.__salleVue || 0, moi: window.__moi, porte: window.__porte };
  });
  /* ---- LE CHEMIN, MESURE SUR LA CARTE ----
   * On demarre trois cents unites SOUS le centre. La porte du coffre est a
   * six cent vingt unites a DROITE du centre — et la fontaine, au centre, a
   * un bassin de cent huit : on va donc a droite EN BAS d'abord, puis on
   * remonte. Passer par le centre reviendrait a marcher dans la fontaine et
   * l'essai conclurait « la porte ne s ouvre pas ».
   * La porte demande de RESTER dessus presque une demi-seconde : on relache
   * les touches et on attend, sinon on la traverse sans jamais l ouvrir. */
  /* ---- ON VISE LA PORTE, ON NE COMPTE PAS LES SECONDES ----
   * Marcher « trois secondes a droite » suppose une vitesse, une taille de
   * carte et un point de depart : trois choses que l essai n a pas a
   * connaitre et qui changeront. On regarde ou la porte est DESSINEE, on
   * marche vers elle, et on s arrete quand on est dessus.
   * Puis on relache tout : la porte demande de RESTER pres d une demi-seconde,
   * on la traverserait sans jamais l ouvrir. */
  const ouvre = async () => {
    await espionne();
    await p.waitForTimeout(400);
    for (let k = 0; k < 30; k++) {
      const e = await veille();
      if (e.salle) break;
      if (!e.moi || !e.porte) { await marche('ArrowRight', 200); continue; }
      const ex = e.porte.x - e.moi.x, ey = e.porte.y - e.moi.y;
      if (Math.abs(ex) < 80 && Math.abs(ey) < 80) { await p.waitForTimeout(700); continue; }
      /* On corrige le plus grand ecart d abord, par pas courts : la fontaine
         est au milieu du chemin et un long pas droit dessus s y arrete. */
      if (Math.abs(ex) > Math.abs(ey)) await marche(ex > 0 ? 'ArrowRight' : 'ArrowLeft', 350);
      else await marche(ey > 0 ? 'ArrowDown' : 'ArrowUp', 350);
    }
    const entre = await veille();
    console.log('   apres la porte : salle=' + entre.salle);
    if (!entre.salle) { console.log('   ' + JSON.stringify(entre)); return false; }
    /* On arrive au milieu de la piece ; les coffres sont sur la ligne du bas,
       et celui des pieces est juste sous le point d arrivee. */
    await marche('ArrowDown', 2600);
    for (let k = 0; k < 20; k++) {
      const e = await veille();
      if (e.on && /vault/i.test(e.titre)) { console.log('   coffre ouvert en ' + k + ' pas'); return true; }
      if (e.on) {
        await p.evaluate(() => { const x = document.querySelector('#nxCoffreVoile .nxcf-x'); if (x) x.click(); });
        await p.waitForTimeout(200);
      }
      await marche('ArrowLeft', 200);
    }
    console.log('   pas trouve : ' + JSON.stringify(await veille()));
    return false;
  };
  /* On repasse par le VRAI chemin — le message du serveur — plutot que par
     une fonction interne : c'est celui que le joueur emprunte quand son
     coffre change. */
  const rouvre = async () => {
    await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'equipable' })));
    await p.waitForTimeout(700);
  };
  /* Le compte attendu vient du SERVEUR, pas de ce que l'essai a pose : c'est
     `equipablesPour` qui decide ce qui rentre dans un coffre, et lui seul. */
  const attenduDuServeur = () => {
    const e = moteur.equipablesPour(w.address);
    let n = 0;
    for (const c of ['fruits', 'armes', 'armures', 'bagues']) {
      for (const o of (e[c] || [])) n += Math.max(1, Number(o.quantite) || 1);
    }
    return n;
  };

  const mesure = () => p.evaluate(() => {
    const v = document.getElementById('nxCoffreVoile');
    const carte = v.querySelector('.nxcf-carte');
    const corps = v.querySelector('.nxcf-corps');
    const nb = v.querySelector('.nxcf-nb');
    const fl = v.querySelector('.nxcf-fleches');
    const flb = fl ? Array.from(fl.querySelectorAll('.nxcf-fl')) : [];
    const rc = carte.getBoundingClientRect(), rn = nb ? nb.getBoundingClientRect() : null;
    return {
      largeur: carte.getBoundingClientRect().width,
      compte: nb && !nb.hidden ? nb.textContent : null,
      compteVisible: !!(rn && rn.width > 0 && rn.top >= rc.top - 1 && rn.bottom <= rc.bottom + 1),
      carteDeborde: carte.scrollWidth - carte.clientWidth,
      corpsDeborde: corps.scrollWidth - corps.clientWidth,
      gouttiere: corps.offsetWidth - corps.clientWidth,
      trop: corps.scrollHeight - corps.clientHeight,
      y: corps.scrollTop,
      fleches: !!(fl && !fl.hidden),
      hautGrise: flb[0] ? flb[0].disabled : null,
      basGrise: flb[1] ? flb[1].disabled : null,
      lignes: v.querySelectorAll('.nxcf-i').length,
    };
  });
  /* On ne tape pas sur une fleche grisee : le joueur non plus. Cliquer
     quand meme ferait echouer l essai sur SON propre acharnement plutot que
     sur un defaut du coffre. */
  const tape = async (sens) => {
    const sel = '.nxcf-fl[data-fl="' + sens + '"]';
    if (await p.$eval(sel, (b) => b.disabled)) return false;
    await p.click(sel);
    await p.waitForTimeout(350);
    return true;
  };

  /* ================== 1. UN COFFRE PRESQUE VIDE ================== */
  console.log('\n-- deux pieces --');
  q.objets = {};
  for (const o of B.ITEMS.slice(0, 2)) q.objets[o.id] = 1;
  const trouve = await ouvre();
  const ouvert = await veille();
  ok(trouve && ouvert.on, `on a marche jusqu au coffre et il s est ouvert (« ${ouvert.titre} »)`);
  await rouvre();
  const petit = await mesure();
  const nPetit = attenduDuServeur();
  ok(petit.compte === nPetit + (nPetit > 1 ? ' items' : ' item'),
     `le compte dit ce qu on a (« ${petit.compte} », attendu ${nPetit})`);
  ok(petit.largeur > 1000,
     `la carte fait plus du double des 560 px d avant (${Math.round(petit.largeur)} px)`);
  /* AUCUNE BARRE HORIZONTALE : c'est la demande, et c'est aussi le symptome
     d'une grille qui deborde de sa carte. */
  ok(petit.carteDeborde <= 1, `la carte ne deborde pas en largeur (${petit.carteDeborde})`);
  ok(petit.corpsDeborde <= 1, `la liste non plus (${petit.corpsDeborde})`);
  ok(!petit.fleches, 'et les fleches ne se montrent pas : il n y a rien sous le bord');

  /* ================== 2. UN COFFRE PLEIN ================== */
  console.log('\n-- de quoi deborder --');
  q.objets = {};
  /* Des EXEMPLAIRES, pas seulement des lignes : deux du meme objet tiennent
     sur une seule ligne, et le compte doit quand meme dire deux. */
  for (const o of B.ITEMS.concat(B.ITEMS_DROP).slice(0, 40)) q.objets[o.id] = 1;
  const doublon = B.ITEMS.concat(B.ITEMS_DROP).slice(0, 40)[0];
  q.objets[doublon.id] = 3;
  await rouvre();
  const plein = await mesure();
  const attendus = attenduDuServeur();
  ok(plein.lignes >= 20, `le coffre est rempli (${plein.lignes} lignes)`);
  ok(attendus > plein.lignes,
     `il y a plus d objets que de lignes, grace au triplet (${attendus} objets, ${plein.lignes} lignes)`);
  ok(plein.compte === attendus + ' items',
     `le compte suit les objets, pas les lignes (« ${plein.compte} », attendu ${attendus})`);
  ok(plein.trop > 0, `il y a de quoi descendre (${plein.trop} px sous le bord)`);
  /* PAS DE BARRE, MAIS DU DEFILEMENT. Une gouttiere non nulle, c'est la barre
     native qui est revenue. */
  ok(plein.gouttiere <= 1, `aucune barre de defilement visible (gouttiere ${plein.gouttiere} px)`);
  ok(plein.corpsDeborde <= 1, `et toujours rien qui deborde en largeur (${plein.corpsDeborde})`);
  ok(plein.fleches, 'les fleches apparaissent');
  ok(plein.hautGrise === true, 'la fleche du haut est grisee : on est deja en haut');
  ok(plein.basGrise === false, 'celle du bas est vive');

  /* ================== 3. LES FLECHES DESCENDENT VRAIMENT ================== */
  console.log('\n-- on descend --');
  await tape('1');
  const bas1 = await mesure();
  ok(bas1.y > plein.y, `un appui descend la liste (${plein.y} -> ${Math.round(bas1.y)} px)`);
  ok(bas1.hautGrise === false, 'et la fleche du haut s allume');
  /* LE COMPTE EST TOUJOURS LA. C'est tout l'interet d'avoir sorti l'en-tete
     du corps qui defile : la reponse a « combien j en ai » ne part pas en
     haut de l ecran des qu on cherche une piece. */
  ok(bas1.compte === plein.compte && bas1.compteVisible,
     `le compte reste en haut apres avoir defile (« ${bas1.compte} »)`);

  for (let i = 0; i < 12; i++) { if (!await tape('1')) break; }
  const fond = await mesure();
  ok(fond.y >= fond.trop - 2, `on atteint le fond (${Math.round(fond.y)}/${fond.trop})`);
  ok(fond.basGrise === true, 'et la fleche du bas se grise en butee');

  await tape('-1');
  const remonte = await mesure();
  ok(remonte.y < fond.y, `la fleche du haut remonte (${Math.round(fond.y)} -> ${Math.round(remonte.y)} px)`);

  /* ================== 4. LA MOLETTE MARCHE ENCORE ==================
   * Masquer la barre ne doit pas avoir coute le geste le plus courant. */
  console.log('\n-- la molette --');
  await p.evaluate(() => { document.querySelector('.nxcf-corps').scrollTop = 0; });
  await p.mouse.move(640, 450);
  await p.mouse.wheel(0, 600);
  await p.waitForTimeout(300);
  const molette = await mesure();
  ok(molette.y > 0, `la molette defile toujours (${Math.round(molette.y)} px)`);

  /* ================== 5. LE TELEPHONE ==================
   * La carte prend l ecran, et les fleches restent atteignables au pouce. */
  console.log('\n-- au telephone --');
  await p.setViewportSize({ width: 412, height: 780 });
  await p.waitForTimeout(600);
  await rouvre();
  const tel = await mesure();
  ok(tel.largeur <= 412, `la carte tient dans l ecran (${Math.round(tel.largeur)} px)`);
  ok(tel.corpsDeborde <= 1, `et rien ne deborde en largeur (${tel.corpsDeborde})`);
  ok(tel.fleches, 'les fleches sont la');
  const taille = await p.evaluate(() => {
    const b = document.querySelector('.nxcf-fl');
    const r = b.getBoundingClientRect();
    return { l: r.width, h: r.height, dansEcran: r.right <= innerWidth + 1 && r.left >= -1 };
  });
  ok(taille.h >= 40 && taille.l >= 30,
     `assez grandes pour un pouce (${Math.round(taille.l)}x${Math.round(taille.h)})`);
  ok(taille.dansEcran, 'et entierement dans l ecran');
  await tape('1');
  const telBas = await mesure();
  ok(telBas.y > 0, `un appui descend aussi au telephone (${Math.round(telBas.y)} px)`);

  /* ================== 6. LA FICHE PASSE DEVANT LE COFFRE ==================
   *
   * Elle vivait dans #nxWrap, qui est en `position:fixed` — donc sa propre
   * couche. Son z-index maximal ne valait que la-dedans, et la carte du
   * coffre, simplement plus bas dans la page, passait devant : on survolait
   * une piece et l'on ne voyait rien.
   *
   * Comparer des z-index refarait le calcul du navigateur avec le meme
   * calcul. On REGARDE donc : on photographie le rectangle de la fiche, une
   * fois avec elle, une fois sans. Si le coffre la recouvre, les deux photos
   * sont identiques — c'est exactement ce que « elle est derriere » veut
   * dire. Le decoupage reste STRICTEMENT dans la carte du coffre, sinon le
   * decor anime derriere ferait differer les deux photos toutes seules. */
  console.log('\n-- la fiche par-dessus le coffre --');
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.waitForTimeout(600);
  await rouvre();
  await p.waitForTimeout(300);
  /* ---- UNE PIECE QU ON PEUT VRAIMENT SURVOLER ----
   * La premiere du coffre ne fait pas l affaire : l essai a fait defiler le
   * corps plus haut, et elle est alors AU-DESSUS de l ecran. On survolerait
   * un point hors de la page, la fiche ne s ouvrirait pas, et l essai
   * accuserait la fiche d etre cassee. */
  const surLaPiece = await p.evaluate(() => {
    /* Le corps du coffre defile : l essai l a fait descendre plus haut, et
       une piece peut alors se trouver SOUS l en-tete de la carte. Son
       rectangle la dit pourtant a l ecran — c est le clipping qui la cache.
       On ne se fie donc pas au rectangle : on demande a la page qui est au
       PREMIER PLAN a cet endroit, ce qui est exactement ce que le pointeur
       verra. */
    document.querySelector('#nxCoffreVoile .nxcf-corps').scrollTop = 0;
    const el = Array.prototype.find.call(
      document.querySelectorAll('#nxCoffreVoile .nxcf-i'), (x) => {
        const r = x.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return false;
        const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
        if (cx < 2 || cy < 2 || cx > innerWidth - 2 || cy > innerHeight - 2) return false;
        const dessus = document.elementFromPoint(cx, cy);
        return !!(dessus && (dessus === x || x.contains(dessus)));
      });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  ok(!!surLaPiece, 'il y a une piece a survoler dans le coffre');
  if (surLaPiece) {
    await p.mouse.move(surLaPiece.x, surLaPiece.y);
    await p.waitForTimeout(350);
    const cadre = await p.evaluate(() => {
      const f = document.getElementById('nxFiche');
      const c = document.querySelector('#nxCoffreVoile .nxcf-carte');
      if (!f || !f.classList.contains('on')) return null;
      const a2 = f.getBoundingClientRect(), b2 = c.getBoundingClientRect();
      /* L intersection, rognee de deux pixels : on ne veut ni le bord de la
         fiche ni un pixel de decor. */
      const x = Math.max(a2.left, b2.left) + 2, y = Math.max(a2.top, b2.top) + 2;
      const x2 = Math.min(a2.right, b2.right) - 2, y2 = Math.min(a2.bottom, b2.bottom) - 2;
      return { x: Math.round(x), y: Math.round(y),
               width: Math.round(x2 - x), height: Math.round(y2 - y),
               racine: f.parentElement === document.body };
    });
    ok(!!cadre, 'le survol ouvre la fiche');
    if (cadre) {
      ok(cadre.width > 8 && cadre.height > 8,
         `et elle chevauche bien la carte du coffre (${cadre.width}x${cadre.height})`);
      /* La cause, pas seulement le symptome : une infobulle appartient a la
         racine. Ailleurs, elle heritera un jour d une couche et repassera
         derriere sans que personne ne sache pourquoi. */
      ok(cadre.racine, 'la fiche est posee a la racine de la page, hors de toute couche');
      const avec = await p.screenshot({ clip: cadre });
      await p.mouse.move(4, 4);                 // on la referme en sortant
      await p.waitForTimeout(300);
      const sans = await p.screenshot({ clip: cadre });
      ok(!avec.equals(sans),
         `le meme rectangle change quand la fiche s affiche (${avec.length} vs ${sans.length} octets)`);
    }
  }

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\ncoffre_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
