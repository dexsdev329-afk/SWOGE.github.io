'use strict';
/*
 * L'EDITEUR DE CARTES, DU CLIC A LA SAUVEGARDE.
 *
 * ---- CE QUE LES AUTRES ESSAIS NE PROUVENT PAS ----
 *
 * Le serveur refuse les ecritures d'un tiers, et c'est verifie. Le catalogue
 * est a jour, et c'est verifie. Rien de tout cela ne dit que le bouton
 * « Enregistrer » envoie la bonne chose : une page qui construirait mal son
 * message serait refusee par un serveur parfaitement correct, et le joueur
 * verrait son travail disparaitre sans qu'aucun essai ne tombe.
 *
 * On fait donc le chemin ENTIER, par les memes gestes qu'un joueur : marcher
 * jusqu'a la machine, ouvrir, choisir un element, dessiner, nommer,
 * enregistrer — puis regarder ce que le SERVEUR a garde, par sa route
 * d'administration. Aucun raccourci par la console : ouvrir le panneau a la
 * main ne dirait rien du chemin qu'emprunte un joueur.
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

let n = 0, echecs = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { echecs++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ` [${a} vs ${b}]`);

const SITE = __dirname;
const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('  (serveur absent, essai ignore)');
  process.exit(0);
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
                '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
                '.css': 'text/css', '.mp3': 'audio/mpeg' };
/* ---- ON COMPTE CE QUI PART VRAIMENT SUR LE FIL ----
 * Cote page, une image « chargee » ne dit pas si elle a ete telechargee ou
 * relue du cache. Le seul endroit qui sait est celui qui sert : on compte
 * donc ici, par fichier et par octet. C'est ce qui permet de dire ce que
 * l'ouverture de l'editeur coute a un joueur au telephone. */
const servi = { fichiers: new Set(), octets: 0 };
const servirLeSite = async () => {
  const s = http.createServer((q, r) => {
    const nom = decodeURIComponent(q.url.split('?')[0]);
    const f = path.join(SITE, nom);
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      if (/^\/img\//.test(nom)) { servi.fichiers.add(nom); servi.octets += d.length; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { port: s.address().port, stop: () => s.close() };
};

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/carte-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify() {}, notifyPhoto() {}, sendDocument() {},
    chatEstPublic() { return true; }, enabled() { return true; } } };
  const port = await new Promise((r) => {
    const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); });
  });
  process.env.PORT = String(port);
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  await new Promise((r) => setTimeout(r, 1400));

  const site = await servirLeSite();
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) {
      const s = (pr === undefined) ? new N(u) : new N(u, pr);
      s.__m = [];
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      window.__s.push(s);
      return s;
    }
    C.prototype = N.prototype; C.OPEN = N.OPEN; C.CLOSED = N.CLOSED;
    window.WebSocket = C;
  });
  /* ---- ON REGARDE OU SONT LE JOUEUR ET LA MACHINE, A L'ECRAN ----
   * C'est la seule facon de marcher vers quelque chose sans rien deviner :
   * les deux sont DESSINES, donc les deux sont mesurables. Le joueur se
   * reconnait a sa signature de dessin — une source de 256 rendue en 150 —
   * et la machine a sa planche. Leur ecart a l'ecran EST leur ecart dans le
   * monde, la camera etant la meme pour les deux. Aucune position n'est
   * recopiee de la source, aucune duree n'est supposee.
   * Meme technique que l'essai de la riviere, qui se sert du pont comme
   * repere. */
  await p.addInitScript(function () {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionCarte) return; C.__espionCarte = true;
    window.__vu = { moi: null, boxe: null, dessines: {} };
    const di = C.drawImage;
    C.drawImage = function (im) {
      const a = arguments;
      const u = (im && (im.currentSrc || im.src)) || '';
      if (a.length >= 9 && a[3] === 256 && a[4] === 256 && a[7] === 150 && a[8] === 150) {
        window.__vu.moi = { x: a[5] + 75, y: a[6] + 130 };
      }
      if (/obj_boxe\.webp/.test(u) && a.length >= 9) {
        window.__vu.boxe = { x: a[5] + a[7] / 2, y: a[6] + a[8] };
      }
      /* Ce qui est REELLEMENT dessine, par nom de fichier. C'est la seule
         preuve qu'une planche a servi : elle peut etre chargee, connue du
         catalogue, et n'apparaitre nulle part. */
      if (u) {
        const nom = u.split('/').pop();
        window.__vu.dessines[nom] = (window.__vu.dessines[nom] || 0) + 1;
      }
      return di.apply(this, arguments);
    };
  });
  /* ---- ON DIT A LA PAGE OU EST LE SERVEUR ----
   * Sans `?server=`, elle retombe sur l'adresse de PRODUCTION : la socket
   * s'ouvre, ne recoit rien de notre serveur d'essai, et l'essai attend un
   * `hello` qui n'arrivera jamais. Le symptome est muet — une socket ouverte
   * et zero message — et il ne dit pas qu'on frappe a la mauvaise porte.
   * Pire : sans ce garde, un essai pourrait ecrire sur le vrai serveur. */
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=`
               + encodeURIComponent('ws://127.0.0.1:' + port),
               { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);

  console.log('-- on entre dans le jeu --');
  const w = ethers.Wallet.createRandom();
  /* On ATTEND le `hello` au lieu de dormir un temps fixe : la page ouvre sa
     socket quand elle est prete, pas quand l'essai a fini de compter. */
  const etat = await p.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      const s = (window.__s || []).find((q) => q.__m.some((m) => m.type === 'hello'));
      if (s) return { ok: true, nonce: s.__m.find((m) => m.type === 'hello').loginNonce };
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: false, sockets: (window.__s || []).length,
             types: [...new Set((window.__s || []).flatMap((q) => q.__m.map((m) => m.type)))] };
  });
  ok(etat.ok, 'la page ouvre sa socket et recoit le hello'
     + (etat.ok ? '' : ` — ${etat.sockets} socket(s), types recus : ${(etat.types || []).join(', ') || 'aucun'}`));
  if (!etat.ok) { await nav.close(); site.stop(); process.exit(1); }
  const nonce = etat.nonce;
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, sg]) => window.__s[0].send(JSON.stringify({ type: 'login', message: m, signature: sg })), [msg, sig]);
  await p.waitForTimeout(1500);
  ok(true, 'un compte est connecte : ' + w.address.slice(0, 10));

  console.log('\n-- on marche jusqu a la machine --');
  /* ---- ON MARCHE JUSQU'A CE QU'ON Y SOIT, PAS PENDANT UN TEMPS FIXE ----
   * Une duree ecrite en dur suppose que la page avance a la meme vitesse a
   * chaque fois. Elle ne le fait pas : au premier chargement elle telecharge
   * quinze megaoctets de decor, la boucle de jeu saute des trames, et le
   * personnage s'arrete a mi-chemin. L'essai echouait alors sur « la machine
   * n'ouvre pas », ce qui est faux — il n'y etait simplement pas arrive.
   * C'est la meme lecon que l'essai du telephone, au meme endroit. */
  /* ---- ET L'ON CHERCHE SON CHEMIN, ON NE LE SUPPOSE PAS ----
   *
   * Marcher vers l'ouest pendant une duree fixe supposait deux choses : que la
   * page avance a la meme vitesse a chaque fois — au premier chargement elle
   * telecharge quinze megaoctets de decor et saute des trames — et qu'on parte
   * dans le BON couloir. La riviere traverse le Nexus, et un pas de travers au
   * depart met une rive entre le personnage et la machine : on pousse alors
   * contre une berge, et l'essai conclut « la machine n'ouvre pas », ce qui est
   * faux.
   *
   * Un premier correctif alternait haut et bas d'un essai a l'autre : il
   * oscillait autour du point de depart au lieu de BALAYER, et retombait sur
   * les memes trois couloirs. On balaie donc dans un seul sens a la fois —
   * vers le haut, puis vers le bas — ce qui couvre une bande large de part et
   * d'autre.
   */
  /* Un pas dans une direction, puis on relit ou l'on en est. */
  const pas = async (touche, ms) => {
    await p.keyboard.down(touche);
    await p.waitForTimeout(ms);
    await p.keyboard.up(touche);
  };
  const panneauOuvert = () => p.evaluate(() => {
    const v = document.getElementById('nxMapVoile');
    return !!v && v.classList.contains('on');
  });
  const t0 = Date.now();
  let arrive = false;
  let vus = 0;
  while (Date.now() - t0 < 40000 && !arrive) {
    const vu = await p.evaluate(() => {
      const q = window.__vu || {};
      window.__vu = { moi: null, boxe: null, dessines: {} };
      return q;
    });
    if (!vu.moi) { await p.waitForTimeout(200); continue; }
    if (!vu.boxe) {
      /* Pas encore a l'ecran : elle est a l'ouest, on y va. */
      await pas('ArrowLeft', 500);
    } else {
      vus++;
      const dx = vu.boxe.x - vu.moi.x, dy = vu.boxe.y - vu.moi.y;
      /* L'axe le plus grand d'abord : deux pas en diagonale contournent le
         batiment d'a cote au lieu de s'y coincer. */
      if (Math.abs(dx) > Math.abs(dy)) await pas(dx < 0 ? 'ArrowLeft' : 'ArrowRight', 200);
      else await pas(dy < 0 ? 'ArrowUp' : 'ArrowDown', 200);
    }
    arrive = await panneauOuvert();
  }
  await p.waitForTimeout(1200);
  ok(arrive, `on a marche ${Math.round((Date.now() - t0) / 100) / 10} s jusqu a la machine,`
     + ` vue a l ecran pendant ${vus} pas`);
  const ouvert = await p.evaluate(() => {
    const v = document.getElementById('nxMapVoile');
    return { on: !!v && v.classList.contains('on'),
             vignettes: document.querySelectorAll('#nxMapPalette .nxmap-el').length,
             dit: (document.getElementById('nxMapDit') || {}).textContent };
  });
  ok(ouvert.on, 'la machine ouvre le panneau — sans passer par la console');
  ok(ouvert.vignettes > 80, `la palette porte ${ouvert.vignettes} elements, lus du catalogue`);
  ok(!/Not connected/.test(ouvert.dit || ''), 'et la galerie a pu etre demandee (connecte)');

  /* ---- ET CE QUE L'OUVERTURE A COUTE ----
   * La palette montre cent trente-quatre planches ; elles pesent trente
   * megaoctets. Les demander toutes pour en afficher une vingtaine a
   * l'ecran, en vignettes de quarante-six pixels, revenait a faire payer un
   * forfait pour ouvrir un panneau. Le plafond ci-dessous se compare au
   * catalogue REEL, jamais a un nombre ecrit ici : le jour ou trente planches
   * arrivent, il monte tout seul. */
  const cat = JSON.parse(fs.readFileSync(path.join(SITE, 'catalogue.json'), 'utf8'));
  const tout = Object.values(cat).flat();
  const poidsTotal = tout.reduce((t, e) => t + fs.statSync(path.join(SITE, e.fichier)).size, 0);
  ok(servi.fichiers.size < tout.length / 2,
     `l'ouverture a demande ${servi.fichiers.size} images sur ${tout.length} au catalogue`);
  ok(servi.octets < poidsTotal / 3,
     `soit ${(servi.octets / 1048576).toFixed(1)} Mo sur les `
     + `${(poidsTotal / 1048576).toFixed(1)} Mo que pese le catalogue entier`);

  /* ---- OU EST LA CARTE DANS LE CANEVAS ----
   *
   * Le canevas occupe toute la scene et la carte y est POSEE : sa taille et
   * sa position dependent du zoom. L'essai ne recalcule pas cette regle — la
   * recopier reviendrait a se tromper de la meme facon que la page, sans que
   * rien ne le dise. Il la MESURE sur le dessin : le fond de la fenetre vaut
   * #070b16 et rien d'autre ne le vaut, donc tout ce qui n'est pas cette
   * couleur est la carte.
   *
   * A faire sur une carte VIDE : une parcelle isometrique deborde vers le
   * haut, et le cadre mesure ne serait plus celui de la carte.
   */
  const cadre = async (cote) => {
    const n = cote || 48;
    const m = await p.evaluate(() => {
      const g = document.getElementById('nxMapGrille');
      const d = g.getContext('2d').getImageData(0, 0, g.width, g.height).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < g.height; y++) {
        for (let x = 0; x < g.width; x++) {
          const i = (y * g.width + x) * 4;
          if (d[i] === 7 && d[i + 1] === 11 && d[i + 2] === 22) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      const r = g.getBoundingClientRect();
      return { x0, y0, x1, y1, W: g.width, H: g.height,
               left: r.left, top: r.top, rw: r.width, rh: r.height };
    });
    /* La taille d'une case se DEDUIT du cadre mesure et du cote de la carte.
       Ecrite pour quarante-huit, elle donnait dix-sept pixels sur une carte de
       seize — et tous les clics tombaient a cote sans qu'aucune verification
       ne le dise, puisque chacune se contentait de comparer a elle-meme. */
    m.p = (m.x1 - m.x0 + 1) / n;
    /* Du pixel de canevas au point d'ecran : le canevas peut etre affiche a
       une taille differente de sa resolution. */
    m.ecran = (cx, cy) => ({ x: m.left + cx * m.rw / m.W, y: m.top + cy * m.rh / m.H });
    m.deCase = (c, l) => m.ecran(m.x0 + (c + 0.5) * m.p, m.y0 + (l + 0.5) * m.p);
    return m;
  };
  /* Un geste de pointeur sur la grille, en cases. */
  const geste = async (cam, pas) => {
    await p.evaluate(([pts]) => {
      const g = document.getElementById('nxMapGrille');
      for (const q of pts) {
        (q.t === 'up' ? window : g).dispatchEvent(new PointerEvent('pointer' + q.t,
          { bubbles: true, pointerId: q.id || 9, clientX: q.x, clientY: q.y }));
      }
    }, [pas.map((q) => Object.assign({}, q, cam.deCase(q.c, q.l)))]);
  };

  /* Creer une carte passe maintenant par un ecran : mode et taille s'y
     choisissent, et ne se reprennent plus ensuite. */
  const cree = async (mode, cote) => {
    await p.click('#nxMapNouvelle');
    await p.waitForTimeout(300);
    await p.evaluate(([m, t]) => {
      document.querySelector('#nxMapModes button[data-mode="' + m + '"]').click();
      const r = document.getElementById('nxMapTaille');
      r.value = String(t);
      r.dispatchEvent(new Event('input', { bubbles: true }));
    }, [mode, cote]);
    await p.click('#nxMapCree');
    await p.waitForTimeout(500);
  };

  console.log('\n-- trois drapeaux, et le panneau change de langue --');
  /* ---- CE QUE CET ESSAI TIENT ----
   * Que la table des textes soit complete, un autre essai le dit. Celui-ci
   * dit que la page S'EN SERT : un dictionnaire parfait branche sur rien
   * laisserait les boutons en anglais, et aucun controle de cles ne le
   * verrait. On lit donc les libelles a l'ecran, avant et apres. */
  const libelles = () => p.evaluate(() => ({
    nouvelle: document.getElementById('nxMapNouvelle').textContent,
    ferme: document.getElementById('nxMapFerme').textContent,
    titre: document.getElementById('nxMapTitre').textContent,
    drapeaux: document.querySelectorAll('#nxMapLangues button[data-lang]').length,
    choisi: (document.querySelector('#nxMapLangues button.vedette') || {}).dataset,
  }));
  const enAnglais = await libelles();
  eq(enAnglais.drapeaux, 3, 'trois drapeaux dans la barre');
  eq(enAnglais.nouvelle, 'New map', 'et l anglais par defaut');
  eq(enAnglais.choisi && enAnglais.choisi.lang, 'en', 'le drapeau anglais est celui qui est marque');
  await p.click('#nxMapLangues button[data-lang="fr"]');
  await p.waitForTimeout(400);
  const enFrancais = await libelles();
  eq(enFrancais.nouvelle, 'Nouvelle carte', 'le francais change le bouton');
  eq(enFrancais.ferme, 'Fermer', 'et celui d a cote');
  ok(/Éditeur/.test(enFrancais.titre), 'et le titre du panneau : ' + enFrancais.titre);
  await p.click('#nxMapLangues button[data-lang="es"]');
  await p.waitForTimeout(400);
  eq((await libelles()).nouvelle, 'Mapa nuevo', 'l espagnol aussi');
  /* ---- ET LE CHOIX SURVIT A LA FERMETURE ----
   * Une langue a rechoisir a chaque ouverture est une langue qu'on ne
   * choisit pas. */
  await p.click('#nxMapFerme');
  await p.waitForTimeout(600);
  const garde = await p.evaluate(() => {
    try { return localStorage.getItem('nxMapLangue'); } catch (e) { return null; }
  });
  eq(garde, 'es', 'le choix est garde dans le navigateur');
  /* On rouvre par le meme chemin qu'un joueur : on s'ecarte, on revient. */
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(1200); await p.keyboard.up('ArrowRight');
  let revenu = false;
  const tr = Date.now();
  while (Date.now() - tr < 25000 && !revenu) {
    const vu = await p.evaluate(() => {
      const q = window.__vu || {};
      window.__vu = { moi: null, boxe: null, dessines: {} };
      return q;
    });
    if (!vu.moi) { await p.waitForTimeout(200); continue; }
    if (!vu.boxe) { await pas('ArrowLeft', 400); }
    else {
      const dx = vu.boxe.x - vu.moi.x, dy = vu.boxe.y - vu.moi.y;
      if (Math.abs(dx) > Math.abs(dy)) await pas(dx < 0 ? 'ArrowLeft' : 'ArrowRight', 200);
      else await pas(dy < 0 ? 'ArrowUp' : 'ArrowDown', 200);
    }
    revenu = await panneauOuvert();
  }
  ok(revenu, 'on revient a la machine');
  eq((await libelles()).nouvelle, 'Mapa nuevo', 'et le panneau rouvre en espagnol');
  /* On repasse en anglais : le reste de l essai lit des libelles anglais. */
  await p.click('#nxMapLangues button[data-lang="en"]');
  await p.waitForTimeout(400);
  eq((await libelles()).nouvelle, 'New map', 'et l on peut revenir a l anglais');

  console.log('\n-- on cherche dans la palette --');
  await cree('plat', 48);
  const cherche = async (q) => {
    await p.evaluate((t) => {
      const c = document.getElementById('nxMapCherche');
      c.value = t;
      c.dispatchEvent(new Event('input', { bubbles: true }));
    }, q);
    await p.waitForTimeout(200);
    return p.evaluate(() => {
      const vus = [...document.querySelectorAll('#nxMapPalette .nxmap-el')]
        .filter((b) => b.offsetParent !== null);
      const titres = [...document.querySelectorAll('#nxMapPalette .nxmap-fam')]
        .filter((d) => d.offsetParent !== null).length;
      return { combien: vus.length, cles: vus.map((b) => b.dataset.cle), familles: titres };
    });
  };
  const palTout = await cherche('');
  const palFont = await cherche('font');
  ok(palFont.combien > 0 && palFont.combien < palTout.combien,
     `« font » ramene ${palFont.combien} elements sur ${palTout.combien} :`
     + ` ${palFont.cles.join(', ')}`);
  ok(palFont.cles.every((c) => c.indexOf('font') >= 0), 'et rien qui ne porte pas le mot');
  ok(palFont.familles < palTout.familles,
     `les familles videes disparaissent avec leur titre`
     + ` (${palFont.familles} sur ${palTout.familles})`);
  const palRien = await cherche('zzzzzz');
  eq(palRien.combien, 0, 'une recherche sans reponse ne montre rien');
  eq((await cherche('')).combien, palTout.combien, 'et effacer la recherche rend tout');

  console.log('\n-- des fleches, et aucune barre de defilement --');
  /* ---- CE QUI ETAIT DEMANDE ----
   * « met des fleches si il y a trop d item dans la category utility ou
   *   autre, pas de barre de scroll ».
   *
   * Deux choses a prouver, et la seconde est celle qu'on oublie : que la
   * barre est bien partie, ET que quelque chose la remplace. Masquer une
   * barre sans rien mettre a sa place est le defaut d'origine en pire — sur
   * telephone la barre n'existe deja pas, et rien ne disait alors qu'il
   * restait des elements sous le bord.
   */
  const fam = (f) => p.evaluate((f) => {
    const b = document.querySelector('.nxmap-fam[data-fam="' + f + '"]');
    if (!b) return null;
    const g = b.querySelector('.nxmap-cases'), fl = b.querySelector('.nxfl');
    const cs = getComputedStyle(g);
    return { elements: g.querySelectorAll('.nxmap-el').length,
             haut: Math.round(g.clientHeight), dedans: Math.round(g.scrollHeight),
             barre: cs.scrollbarWidth,
             fleches: !!fl && !fl.hidden,
             boutons: fl ? [...fl.querySelectorAll('button')].map((x) => x.disabled) : null };
  }, f);

  /* La famille la plus fournie du catalogue — celle qui deborde, quel que
     soit le nombre de planches livrees ce jour-la. On ne nomme pas « objet »
     ici : le jour ou une autre famille passe devant, l'essai suivrait. */
  const plusFournie = await p.evaluate(() => {
    let mieux = null, n = -1;
    document.querySelectorAll('.nxmap-fam').forEach((b) => {
      const c = b.querySelectorAll('.nxmap-el').length;
      if (c > n) { n = c; mieux = b.dataset.fam; }
    });
    return mieux;
  });
  const grosse = await fam(plusFournie);
  ok(grosse.dedans > grosse.haut + 1,
     `la famille « ${plusFournie} » deborde : ${grosse.elements} elements,`
     + ` ${grosse.dedans} px dans un cadre de ${grosse.haut}`);
  eq(grosse.barre, 'none',
     'et son cadre n a PAS de barre de defilement — c est ce qui etait demande');
  ok(grosse.fleches,
     'mais il a ses fleches : une barre masquee sans rien a la place serait le'
     + ' defaut d origine en pire');
  eq(JSON.stringify(grosse.boutons), '[true,false]',
     'en haut de liste, seule celle du bas repond — l autre ne promet rien');

  /* La fleche du bas descend VRAIMENT, et celle du haut se rallume. */
  await p.click(`.nxmap-fam[data-fam="${plusFournie}"] .nxfl button:nth-child(2)`);
  await p.waitForTimeout(450);
  const descendu = await p.evaluate((f) => {
    const g = document.querySelector('.nxmap-fam[data-fam="' + f + '"] .nxmap-cases');
    const fl = document.querySelector('.nxmap-fam[data-fam="' + f + '"] .nxfl');
    return { ou: Math.round(g.scrollTop),
             boutons: [...fl.querySelectorAll('button')].map((x) => x.disabled) };
  }, plusFournie);
  ok(descendu.ou > 1, `la fleche du bas descend pour de vrai (${descendu.ou} px)`);
  eq(descendu.boutons[0], false, 'et celle du haut se rallume une fois qu on est descendu');

  /* ---- CELLES QUI NE SERVENT A RIEN NE S AFFICHENT PAS ----
   * Deux fleches grises en permanence au-dessus d une famille de quatre
   * elements seraient deux boutons qui ne font rien : on apprendrait a ne
   * plus les regarder, donc a ne plus les voir le jour ou elles servent. */
  const courtes = await p.evaluate(() => {
    const l = [];
    document.querySelectorAll('.nxmap-fam').forEach((b) => {
      const g = b.querySelector('.nxmap-cases'), fl = b.querySelector('.nxfl');
      if (g.scrollHeight <= g.clientHeight + 1) {
        l.push({ fam: b.dataset.fam, fleches: !!fl && !fl.hidden });
      }
    });
    return l;
  });
  ok(courtes.every((x) => !x.fleches),
     courtes.length
       ? `les ${courtes.length} famille(s) qui tiennent n affichent pas de fleches`
       : 'toutes les familles debordent ici — rien a verifier de ce cote');

  /* ---- ET LA RECHERCHE LES ETEINT ----
   * Une famille filtree jusqu a trois vignettes n a plus rien sous le bord.
   * Sans rappel apres le filtre, ses fleches restaient allumees au-dessus
   * d une grille qui tient entierement. */
  await cherche('font');
  const filtree = await p.evaluate(() => {
    const l = [];
    document.querySelectorAll('.nxmap-fam').forEach((b) => {
      if (b.offsetParent === null) return;
      const g = b.querySelector('.nxmap-cases'), fl = b.querySelector('.nxfl');
      l.push({ tient: g.scrollHeight <= g.clientHeight + 1, fleches: !!fl && !fl.hidden });
    });
    return l;
  });
  ok(filtree.length > 0 && filtree.every((x) => x.tient !== x.fleches),
     'apres une recherche, les fleches suivent ce qui reste dans chaque famille');
  await cherche('');

  /* ---- LA COLONNE ENTIERE AUSSI ----
   * Six familles bornees tiennent encore plus haut qu un ecran de telephone.
   * Son poste est pose HORS de la zone qui defile, sinon il disparaitrait
   * des qu on descend — c est-a-dire au moment ou il sert. */
  const colonne = await p.evaluate(() => {
    const pal = document.getElementById('nxMapPalette');
    const fl = pal.nextElementSibling;
    return { barre: getComputedStyle(pal).scrollbarWidth,
             poste: !!fl && fl.classList.contains('nxfl'),
             dehors: !!fl && !pal.contains(fl),
             combien: document.querySelectorAll('#nxMapPalette + .nxfl').length };
  });
  eq(colonne.barre, 'none', 'la colonne non plus n a pas de barre');
  ok(colonne.poste && colonne.dehors,
     'et ses fleches sont posees a cote d elle, pas dedans : elles restent'
     + ' visibles pendant qu on descend');

  /* Le mode change reconstruit la palette. Le poste de la colonne, lui, vit
     DEHORS : le reposer aurait empile une paire de fleches de plus a chaque
     fois — invisible au premier changement, evident au cinquieme. */
  await p.click('#nxMapRetour'); await p.waitForTimeout(250);
  await cree('iso', 24);
  await p.waitForTimeout(500);
  eq(await p.evaluate(() => document.querySelectorAll('#nxMapPalette + .nxfl').length), 1,
     'et changer de mode n en empile pas une seconde paire sous la colonne');
  await p.click('#nxMapRetour'); await p.waitForTimeout(250);
  await cree('plat', 48);
  await p.waitForTimeout(400);

  console.log('\n-- on dessine --');
  let cam = await cadre();
  ok(cam.p > 4, `la carte est cadree dans le canevas : ${Math.round(cam.p * 100) / 100} px par case`);
  /* Un SOL, choisi dans la palette comme un joueur le ferait. On prend le
     premier de la famille : son nom vient du catalogue, pas d'ici. */
  const cle = await p.evaluate(() => {
    const b = document.querySelector('#nxMapPalette .nxmap-el[data-fam="sol"]');
    b.click();
    return b.dataset.cle;
  });
  ok(!!cle, 'un sol est choisi dans la palette : ' + cle);

  /* Trois cases, posees par de vrais evenements de pointeur sur la grille. */
  await geste(cam, [{ t: 'down', c: 2, l: 2 }, { t: 'move', c: 3, l: 2 },
                    { t: 'move', c: 4, l: 2 }, { t: 'up', c: 4, l: 2 }]);
  await p.waitForTimeout(300);
  ok(cam.rw > 100, `la grille est a l ecran (${Math.round(cam.rw)} px)`);

  console.log('\n-- on nomme et on enregistre --');
  await p.fill('#nxMapNom', 'Ma premiere carte');
  await p.click('#nxMapEnregistre');
  await p.waitForTimeout(1600);
  const apres = await p.evaluate(() => (document.getElementById('nxMapDit') || {}).textContent);
  ok(/^Saved\./.test(apres || ''),
     'la page annonce l enregistrement — et dit qu il manque le depart : ' + apres);

  /* ---- ET LE SERVEUR, LUI, A-T-IL GARDE QUELQUE CHOSE ? ----
   * C'est la seule question qui compte. Une page peut annoncer « enregistre »
   * sur la foi d'un message qu'elle a mal lu. */
  const base = 'http://127.0.0.1:' + port;
  const j = await (await fetch(base + '/admin/cartes', { headers: { 'x-admin-key': 'k' } })).json();
  ok(j.ok && j.cartes.length === 1, `le serveur garde ${j.cartes ? j.cartes.length : 0} carte`);
  if (j.cartes && j.cartes[0]) {
    eq(j.cartes[0].nom, 'Ma premiere carte', 'avec le nom tape au clavier');
    eq(String(j.cartes[0].addr).toLowerCase(), w.address.toLowerCase(), 'et l adresse du compte qui a dessine');
    ok(j.cartes[0].cases >= 3, `et les ${j.cartes[0].cases} cases tracees a la souris`);
    const une = await (await fetch(base + '/admin/cartes?id=' + j.cartes[0].id,
                                   { headers: { 'x-admin-key': 'k' } })).json();
    ok(une.carte.cases.every((q) => q.s === cle),
       'chaque case porte bien le sol choisi dans la palette : ' + cle);
    /* ---- ET L'IMAGE DE LA FICHE ----
     * Sa TAILLE compte autant que sa presence : elle voyage avec chaque carte
     * de la galerie, et le budget de la trame est deja mange par les cases. */
    ok(/^data:image\/(webp|png);base64,/.test(une.carte.vignette || ''),
       'la carte porte son image, dessinee par la page a l enregistrement');
    ok((une.carte.vignette || '').length < 24000,
       `elle pese ${Math.round((une.carte.vignette || '').length / 1024)} ko`);
  }

  console.log('\n-- rien ne se jette sans qu on le demande --');
  /* Une case de plus, posee APRES l'enregistrement : c'est elle qu'on risque
     de perdre, et c'est donc elle que cet essai protege. */
  await geste(cam, [{ t: 'down', c: 6, l: 6, id: 15 }, { t: 'up', c: 6, l: 6, id: 15 }]);
  await p.waitForTimeout(300);
  /* ---- CE QUE CET ESSAI TIENT ----
   * La case qu'on vient de poser n'est PAS enregistree. « Gallery »
   * remettait la carte a zero sans un mot : on cliquait pour aller voir celle
   * d'un voisin, et la sienne n'existait plus. */
  const etatQuestion = () => p.evaluate(() => ({
    question: document.getElementById('nxMapConfirme').classList.contains('on'),
    atelier: document.getElementById('nxMapAtelier').classList.contains('on'),
  }));
  await p.click('#nxMapRetour');
  await p.waitForTimeout(300);
  let q1 = await etatQuestion();
  ok(q1.question, 'la question s affiche au lieu de jeter');
  ok(q1.atelier, 'et la carte est toujours a l ecran pendant qu on repond');
  await p.click('#nxMapGarde');
  await p.waitForTimeout(300);
  let q2 = await etatQuestion();
  ok(!q2.question && q2.atelier, '« Keep editing » referme la question et garde la carte');
  await p.click('#nxMapRetour');
  await p.waitForTimeout(200);
  await p.click('#nxMapJette');
  await p.waitForTimeout(400);
  let q3 = await etatQuestion();
  ok(!q3.question && !q3.atelier, 'et « Discard » seul ramene a la galerie');

  console.log('\n-- le rectangle, l annulation et le pot --');
  await cree('plat', 48);
  cam = await cadre();
  /* ---- ON COMPTE LES CASES SUR LE DESSIN ----
   * La carte vit dans une variable que la page ne publie pas, et lui ajouter
   * une porte pour l'essai serait ajouter du code qui n'existe que pour
   * l'essai. On compte donc les cases PEINTES : le centre de chaque case,
   * compare au fond mesure sur la carte vide. C'est aussi ce qu'un joueur
   * voit, ce qui est la seule chose qui compte. */
  const compte = (k) => p.evaluate((cm) => {
    const g = document.getElementById('nxMapGrille');
    const C = g.getContext('2d');
    const n = 48;
    const d = C.getImageData(0, 0, g.width, g.height).data;
    let t = 0, ou = null;
    for (let c = 0; c < n; c++) {
      for (let l = 0; l < n; l++) {
        const x = Math.floor(cm.x0 + (c + .5) * cm.p), y = Math.floor(cm.y0 + (l + .5) * cm.p);
        if (x < 0 || y < 0 || x >= g.width || y >= g.height) continue;
        const i = (y * g.width + x) * 4;
        /* Le fond de la carte vaut #0a1020 et un croisement de traits monte a
           peine plus : on prend large, une tuile de sol etant une image,
           jamais du bleu nuit uni. */
        if (d[i] + d[i + 1] + d[i + 2] > 160) { t++; if (!ou) ou = c + ',' + l; }
      }
    }
    return { t, ou };
  }, k).then((r) => r);
  const combien = async () => (await compte({ p: cam.p, x0: cam.x0, y0: cam.y0 })).t;
  eq(await combien(), 0, 'une carte neuve ne porte aucune case');
  await p.evaluate(() => {
    document.querySelector('#nxMapPalette .nxmap-el[data-fam="sol"]').click();
    document.getElementById('nxMapOutilRect').click();
  });
  await geste(cam, [{ t: 'down', c: 10, l: 10 }, { t: 'move', c: 13, l: 13 },
                    { t: 'up', c: 13, l: 13 }]);
  await p.waitForTimeout(600);
  eq(await combien(), 16, 'un rectangle de quatre sur quatre pose seize cases');
  await p.click('#nxMapAnnule');
  await p.waitForTimeout(400);
  eq(await combien(), 0, 'et « Undo » les retire toutes d un coup, pas une par une');
  await p.click('#nxMapRefais');
  await p.waitForTimeout(400);
  eq(await combien(), 16, 'et « Redo » les remet');
  await p.evaluate(() => { document.getElementById('nxMapOutilPot').click(); });
  await geste(cam, [{ t: 'down', c: 0, l: 0, id: 11 }, { t: 'up', c: 0, l: 0, id: 11 }]);
  await p.waitForTimeout(1200);
  eq(await combien(), 48 * 48, 'le pot remplit le reste de la carte en un geste');
  await p.click('#nxMapAnnule');
  await p.waitForTimeout(500);
  eq(await combien(), 16, 'et le pot entier s annule en une fois, lui aussi');

  console.log('\n-- le zoom, le deplacement, et le clic qui les suit --');
  /* ---- POURQUOI LE CLIC EST LE VRAI SUJET ----
   * Zoomer est facile ; ce qui casse, c'est la conversion INVERSE. Une page
   * qui dessine avec la vue mais teste le clic sans elle pose la case a cote,
   * et l'ecart grandit avec le zoom — le genre de defaut qu'on ne voit qu'au
   * doigt, sur un telephone, et qu'aucune capture ne montre.
   * On mesure donc le cadre APRES chaque changement, on clique une case
   * NOMMEE, et l'on regarde laquelle a ete peinte. */
  await p.click('#nxMapRetour'); await p.waitForTimeout(200);
  await p.click('#nxMapJette'); await p.waitForTimeout(400);
  await cree('plat', 48);
  await p.click('#nxMapAjuste'); await p.waitForTimeout(300);
  const vue0 = await cadre();
  await p.click('#nxMapMoins'); await p.waitForTimeout(200);
  await p.click('#nxMapMoins'); await p.waitForTimeout(400);
  const vue1 = await cadre();
  ok(vue1.p < vue0.p, `« − » retrecit la carte : ${vue0.p.toFixed(2)} px par case, puis ${vue1.p.toFixed(2)}`);
  ok(vue1.x0 > 0 && vue1.x1 < vue1.W - 1 && vue1.y0 > 0 && vue1.y1 < vue1.H - 1,
     'et la carte tient entierement dans la fenetre, donc la mesure est exacte');
  cam = vue1;
  await p.evaluate(() => {
    document.querySelector('#nxMapPalette .nxmap-el[data-fam="sol"]').click();
    document.getElementById('nxMapOutilDessin').click();
  });
  await geste(cam, [{ t: 'down', c: 20, l: 20, id: 21 }, { t: 'up', c: 20, l: 20, id: 21 }]);
  await p.waitForTimeout(500);
  const apresZoom = await compte({ p: cam.p, x0: cam.x0, y0: cam.y0 });
  eq(apresZoom.t, 1, 'une seule case posee apres le zoom');
  eq(apresZoom.ou, '20,20', 'et c est EXACTEMENT celle que le clic visait');

  await p.click('#nxMapAjuste'); await p.waitForTimeout(400);
  const vue2 = await cadre();
  eq(Math.round(vue2.p * 100), Math.round(vue0.p * 100), '« Fit » recadre la carte comme a l ouverture');

  /* ---- ET LA MAIN DEPLACE ---- */
  await p.evaluate(() => { document.getElementById('nxMapOutilMain').click(); });
  const vueAvantMain = await cadre();
  /* ---- DE COMBIEN ON POUSSE SE MESURE, IL NE SE DECIDE PAS ----
   * `cadre` lit le RECTANGLE DESSINE : si la carte sort du canevas, le bord
   * du canevas devient le bord mesure, et la taille d'une case se met a
   * retrecir sans que le zoom ait bouge. Quatre-vingt-dix pixels tenaient
   * tant que la scene faisait toute la largeur ; le panneau de gauche lui en
   * a pris cent soixante-seize, et l'essai s'est mis a accuser le zoom d'un
   * defaut de sa propre mesure. On pousse donc de ce qui RESTE, moitie
   * moins, et l'on verifie qu'il en reste assez pour que le geste veuille
   * dire quelque chose. */
  const marge = vueAvantMain.W - (vueAvantMain.x1 - vueAvantMain.x0 + 1);
  const pousse = Math.min(90, Math.floor(marge / 2) - 4);
  ok(pousse >= 20, `il reste ${marge} px autour de la carte : on peut la pousser de ${pousse}`);
  await p.evaluate((cm) => {
    const g = document.getElementById('nxMapGrille');
    const r = g.getBoundingClientRect();
    const dx = cm.d * r.width / cm.W;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 31, clientX: x, clientY: y }));
    g.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 31, clientX: x + dx, clientY: y }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 31 }));
  }, { W: vueAvantMain.W, d: pousse });
  await p.waitForTimeout(400);
  const vueApresMain = await cadre();
  ok(Math.abs((vueApresMain.x0 - vueAvantMain.x0) - pousse) <= 3,
     `la main deplace la carte de ${Math.round(vueApresMain.x0 - vueAvantMain.x0)} px pour ${pousse} demandes`);
  ok(Math.round(vueApresMain.p * 100) === Math.round(vueAvantMain.p * 100),
     `et ne change pas le zoom en le faisant (${vueApresMain.p.toFixed(2)} px par case,`
     + ` ${vueAvantMain.p.toFixed(2)} avant)`);
  const rienPose = await compte({ p: vueApresMain.p, x0: vueApresMain.x0, y0: vueApresMain.y0 });
  eq(rienPose.t, 1, 'et la main ne pose aucune case en passant sur la grille');

  console.log('\n-- une carte 2,5D ne propose que des parcelles --');
  /* ---- LE MODE EST UN CHOIX DE CREATION ----
   * On verifie ce que la PALETTE propose, et non ce que la carte declare :
   * un mode garde dans un champ mais ignore par la palette laisserait poser
   * des tuiles plates sur une carte de parcelles, et la carte serait deux
   * langages dans la meme image. */
  await p.click('#nxMapRetour'); await p.waitForTimeout(250);
  const encoreSale = await p.evaluate(() =>
    document.getElementById('nxMapConfirme').classList.contains('on'));
  if (encoreSale) { await p.click('#nxMapJette'); await p.waitForTimeout(400); }
  await cree('iso', 16);
  const pal = await p.evaluate(() => {
    const fams = {};
    document.querySelectorAll('#nxMapPalette .nxmap-el').forEach((b) => {
      fams[b.dataset.fam] = (fams[b.dataset.fam] || 0) + 1;
    });
    return fams;
  });
  eq(Object.keys(pal).join(','), 'sol,iso',
     'la palette d une carte 2,5D montre les parcelles et de quoi poser un sol dessous');
  ok(pal.iso >= 20, `soit ${pal.iso} parcelles`);
  const camIso = await cadre(16);
  ok(camIso.p > 3 * cam.p,
     `et ses cases sont bien plus grandes : ${camIso.p.toFixed(1)} px pour seize cases de cote,`
     + ` contre ${cam.p.toFixed(1)} pour quarante-huit`);

  /* ---- ET UNE PARCELLE PREND LA PLACE QU ELLE OCCUPE ----
   * Le catalogue dit qu'une parcelle vaut quatre ou cinq cases. Verifier que
   * la page a bien LU ce nombre ne dirait rien : ce qui compte est ce qui est
   * DESSINE. Une parcelle enfermee dans sa case redeviendrait une tache, et
   * le champ `cases` serait toujours la, exact et sans effet. */
  const iso = await p.evaluate(() => {
    const b = document.querySelector('#nxMapPalette .nxmap-el[data-fam="iso"]');
    b.click();
    return { cle: b.dataset.cle, cc: 8, ll: 8 };
  });
  await geste(camIso, [{ t: 'down', c: iso.cc, l: iso.ll, id: 41 },
                       { t: 'up', c: iso.cc, l: iso.ll, id: 41 }]);
  await p.waitForTimeout(900);
  /* La largeur DESSINEE d'un element pose, mesuree sur la bande qui va de son
     pied vers le haut. Extraite en fonction parce qu'on la mesure trois fois :
     a la pose, apres l'avoir agrandi, et apres l'avoir tourne. */
  const largeurDessinee = (q, cam2) => p.evaluate(([q, cam2]) => {
    const g = document.getElementById('nxMapGrille');
    const C = g.getContext('2d');
    const pas = cam2.p;
    const pied = Math.round(cam2.y0 + (q.ll + 1) * pas);
    const y0 = Math.max(0, pied - Math.round(pas * 3));
    const h = pied - y0;
    const d = C.getImageData(0, y0, g.width, h).data;
    const somme = (x, y) => { const i = (y * g.width + x) * 4; return d[i] + d[i + 1] + d[i + 2]; };
    /* ---- LE SEUIL SE MESURE, IL NE SE DEVINE PAS ----
     * Pose en dur a soixante, il prenait un CROISEMENT de deux traits de
     * grille pour du dessin et declarait toute la largeur peinte. Et pris sur
     * huit pixels, il tombait a l'interieur d'une case, ou aucun croisement
     * n'existe — le seuil passait dessous et la grille comptait de nouveau.
     * On lit donc deux cases entieres, vides par construction. */
    let fond = 0;
    const gx = Math.round(cam2.x0) + 1, gl = Math.max(10, Math.ceil(pas * 2));
    for (let x = gx; x < gx + gl; x++) for (let y = 0; y < h; y++) fond = Math.max(fond, somme(x, y));
    const seuil = fond + 40;
    const cols = [];
    /* Sans les deux pixels de bordure de chaque cote : le cadre de la carte
       est un trait clair, et le compter donnait la largeur de la carte. */
    for (let x = Math.round(cam2.x0) + 2; x <= Math.round(cam2.x1) - 2; x++) {
      for (let y = 0; y < h; y++) { if (somme(x, y) > seuil) { cols.push(x); break; } }
    }
    return { min: cols[0], max: cols[cols.length - 1], combien: cols.length, fond, seuil };
  }, [q, cam2]);
  const large = await largeurDessinee(iso,
    { p: camIso.p, x0: camIso.x0, x1: camIso.x1, y0: camIso.y0 });
  const attendu = (JSON.parse(fs.readFileSync(path.join(SITE, 'catalogue.json'), 'utf8'))
                   .iso.find((e) => e.cle === iso.cle) || {}).cases;
  const dessine = large.max - large.min + 1;
  ok(attendu >= 2, `le catalogue donne ${attendu} cases a ${iso.cle}`);
  ok(dessine > camIso.p * (attendu - 1) && dessine <= camIso.p * (attendu + 1),
     `elle est dessinee sur ${dessine} px la ou une case en fait ${Math.round(camIso.p)}`
     + ` — soit ${attendu} cases (${large.combien} colonnes chaudes,`
     + ` fond mesure a ${large.fond}, seuil ${large.seuil})`);

  console.log('\n-- on tient une parcelle posee, on l agrandit, on la tourne --');
  /* ---- CE QU IL MANQUAIT ----
   * Le proprietaire l'a demande : « comment je selectionne une art posee pour
   * l agrandir ou bouger les angles ». La reponse etait « on ne peut pas ».
   * On mesure donc ce que ces boutons FONT au dessin, pas ce qu'ils mettent
   * dans la carte : un champ `n` a trois qui se dessine encore a quatre serait
   * exact et sans effet. */
  const camS = await cadre(16);
  await p.evaluate(() => { document.getElementById('nxMapOutilChoix').click(); });
  await geste(camS, [{ t: 'down', c: iso.cc, l: iso.ll, id: 61 },
                     { t: 'up', c: iso.cc, l: iso.ll, id: 61 }]);
  await p.waitForTimeout(500);
  const bloc = () => p.evaluate(() => {
    const e = document.getElementById('nxMapFiche');
    return { vue: !!e && e.classList.contains('on'),
             nom: (document.getElementById('nxMapFicheNom') || {}).textContent,
             taille: (document.getElementById('nxMapFicheTaille') || {}).textContent };
  });
  const fi = await bloc();
  ok(fi.vue, 'la fiche de l element apparait a droite quand on en tient un');
  eq(fi.nom, iso.cle, 'et elle nomme ce qu on tient');

  /* ---- ON L ATTRAPE PAR LE BATIMENT, PAS PAR SON ANCRE ----
   * Une parcelle est ancree sur une case et dessinee sur quatre : son ancre
   * est au milieu du bas de l image. Cliquer sur le batiment qu'on VOIT ne
   * tombait donc presque jamais dessus. Le proprietaire l'a signale deux
   * fois — pour la selection et pour la gomme, qui avaient la meme cause. */
  await p.evaluate(() => { document.getElementById('nxMapLache').click(); });
  await p.waitForTimeout(300);
  ok(!(await bloc()).vue, 'on lache');
  /* Deux cases PLUS HAUT que l'ancre, et une de cote : en plein dans le
     batiment, nulle part pres de la case ou l'on a clique pour le poser. */
  await geste(camS, [{ t: 'down', c: iso.cc - 1, l: iso.ll - 2, id: 64 },
                     { t: 'up', c: iso.cc - 1, l: iso.ll - 2, id: 64 }]);
  await p.waitForTimeout(400);
  const parLeHaut = await bloc();
  ok(parLeHaut.vue, 'un clic sur le batiment lui-meme le tient');
  eq(parLeHaut.nom, iso.cle, 'et c est bien celui-la');
  const repere = { p: camS.p, x0: camS.x0, x1: camS.x1, y0: camS.y0 };
  /* ---- ON LACHE AVANT DE MESURER ----
   * Le cadre de selection est dessine sur l'EMPRISE, en jaune franc, et il
   * passe donc le seuil comme le reste. Mesurer sans lacher revenait a
   * mesurer le CADRE : il suit l'agrandissement — d'ou des chiffres justes
   * pour « + » et « − » — mais il ne tourne pas, d'ou un quart de tour
   * invisible et une accusation portee contre le dessin, qui etait correct.
   * On lache donc en cliquant une case vide, comme on le ferait a la main. */
  const lache = async () => {
    await geste(camS, [{ t: 'down', c: 1, l: 14, id: 62 }, { t: 'up', c: 1, l: 14, id: 62 }]);
    await p.waitForTimeout(400);
  };
  const tiens = async () => {
    await geste(camS, [{ t: 'down', c: iso.cc, l: iso.ll, id: 63 },
                       { t: 'up', c: iso.cc, l: iso.ll, id: 63 }]);
    await p.waitForTimeout(400);
  };
  await lache();
  const avant = await largeurDessinee(iso, repere);
  await tiens();
  await p.click('#nxMapPlusGrand');
  await p.waitForTimeout(600);
  await lache();
  const apresPlus = await largeurDessinee(iso, repere);
  await tiens();
  const dPlus = (apresPlus.max - apresPlus.min) - (avant.max - avant.min);
  ok(Math.abs(dPlus - camS.p) <= camS.p * 0.35,
     `« + » l elargit d une case : ${Math.round(dPlus)} px pour une case de ${Math.round(camS.p)}`);
  await p.click('#nxMapPlusPetit');
  await p.waitForTimeout(600);
  await lache();
  const apresMoins = await largeurDessinee(iso, repere);
  await tiens();
  ok(Math.abs((apresMoins.max - apresMoins.min) - (avant.max - avant.min)) <= 3,
     '« − » la ramene exactement ou elle etait');

  /* ---- TOURNER : LA DONNEE ET LE DESSIN, SEPAREMENT ----
   * Les deux peuvent tomber independamment — un champ pose et jamais lu, ou
   * un dessin qui tourne sans que rien ne soit garde — et les confondre ferait
   * chercher la panne du mauvais cote. */
  await p.click('#nxMapTourne');
  await p.waitForTimeout(600);
  await p.fill('#nxMapNom', 'Ma carte tournee');
  await p.click('#nxMapEnregistre');
  await p.waitForTimeout(1600);
  const jt = await (await fetch(base + '/admin/cartes', { headers: { 'x-admin-key': 'k' } })).json();
  const tk = (jt.cartes || []).find((k) => k.nom === 'Ma carte tournee');
  ok(!!tk, 'le serveur a garde la carte tournee');
  if (tk) {
    const dt = await (await fetch(base + '/admin/cartes?id=' + tk.id,
                                  { headers: { 'x-admin-key': 'k' } })).json();
    /* L'objet vit dans sa propre liste depuis les couches : c'est la qu'on va
       chercher son angle. En DEGRES depuis que la glissiere existe — le
       bouton, lui, ne donne plus « un quart de tour de plus » mais « le
       prochain multiple de quatre-vingt-dix », pour qu'on puisse toujours
       retomber d equerre depuis un angle libre. */
    const cel = (dt.carte.objets || []).find((q) => q.c === iso.cc && q.l === iso.ll);
    eq(cel && cel.g, 90, 'et l objet porte son angle, en degres');
    eq(cel && cel.z, 0, 'sur la premiere couche, qui est celle ou l on posait');
  }
  await lache();
  const tournee = await largeurDessinee(iso, repere);
  ok((tournee.max - tournee.min) < (avant.max - avant.min) * 0.92,
     `et le dessin la retrecit en largeur : ${tournee.max - tournee.min} px`
     + ` contre ${avant.max - avant.min}`);
  /* On ATTEND la largeur d'avant : la grille se repeint a la prochaine image,
     et un demi-seconde suffit « presque » toujours. */
  const vise = avant.max - avant.min;
  await p.click('#nxMapAnnule');
  let rendue = null, finU = Date.now() + 6000;
  while (Date.now() < finU) {
    rendue = await largeurDessinee(iso, repere);
    if (Math.abs((rendue.max - rendue.min) - vise) <= 3) break;
    await p.waitForTimeout(250);
  }
  ok(Math.abs((rendue.max - rendue.min) - vise) <= 3,
     `et « Undo » defait le quart de tour comme le reste`
     + ` (${rendue.max - rendue.min} px, ${vise} attendus)`);
  /* ---- LES POIGNEES : LA CROIX ET LE COIN ----
   * Le proprietaire les a demandees : « une croix pour supprimer l element et
   * un bouton pour agrandir comme si on etirait un coin ». On mesure ce
   * qu'elles FONT au dessin, et l'on va chercher le coin la ou il est — au bas
   * a droite de l emprise, en pixels d ecran et non en cases. */
  /* Le coin de l emprise, en cases : l ancre plus la moitie de l emprise a
     droite, et le bas de l emprise. Converti en ecran par le meme chemin que
     les autres gestes. */
  /* Le dessin pose le bord droit en `(c + 0.5 + n/2)` de case ; `deCase`
     ajoute deja un demi, donc on lui donne `c + n/2`. Un demi de trop et l'on
     vise vingt-six pixels a cote de la poignee, qui en fait vingt. */
  const coinDe = (n) => ({ c: iso.cc + n / 2, l: iso.ll + 0.5 });
  const tailleAffichee = () => p.evaluate(() =>
    (document.getElementById('nxMapFicheTaille') || {}).textContent);
  await p.evaluate(() => { document.getElementById('nxMapOutilChoix').click(); });
  await tiens();
  const avantEtire = await tailleAffichee();
  /* ---- ON REMESURE AVANT DE VISER LES POIGNEES ----
   * La fiche et le bandeau des couches apparaissent dans la colonne de
   * droite quand on tient quelque chose. Tant qu'ils changent la largeur de
   * cette colonne, la scene change de taille et la camera avec — un cadre
   * mesure avant vaut alors quatre-vingt-seize pixels a cote. */
  const camP = await cadre(16);
  /* On tire le coin de trois cases vers le bas a droite. */
  const c0 = coinDe(4);
  await geste(camP, [{ t: 'down', c: c0.c, l: c0.l, id: 66 },
                     { t: 'move', c: c0.c + 3, l: c0.l + 3, id: 66 },
                     { t: 'up', c: c0.c + 3, l: c0.l + 3, id: 66 }]);
  await p.waitForTimeout(700);
  const apresEtire = await tailleAffichee();
  ok(apresEtire !== avantEtire,
     `tirer le coin agrandit : ${avantEtire} puis ${apresEtire}`);
  ok(parseInt(apresEtire, 10) > parseInt(avantEtire, 10), 'et dans le bon sens');
  await p.click('#nxMapAnnule');
  await p.waitForTimeout(600);
  eq(await tailleAffichee(), avantEtire, 'et « Undo » defait tout l etirement d un coup');

  /* La croix, au HAUT a droite de l emprise. */
  await tiens();
  const n0 = parseInt(await tailleAffichee(), 10);
  await geste(camP, [{ t: 'down', c: iso.cc + n0 / 2, l: iso.ll + 0.5 - n0, id: 67 },
                     { t: 'up', c: iso.cc + n0 / 2, l: iso.ll + 0.5 - n0, id: 67 }]);
  await p.waitForTimeout(700);
  const apresCroix = await largeurDessinee(iso, repere);
  ok(!(apresCroix.combien > 4),
     `la croix retire l element (${apresCroix.combien} colonnes restantes)`);
  await p.click('#nxMapAnnule');
  await p.waitForTimeout(700);
  ok((await largeurDessinee(iso, repere)).combien > 20, 'et « Undo » le remet');

  /* ---- ET ON LE DEPLACE EN LE TIRANT ----
   * « Quand on est sur choisir, si on clique au centre de l image on peut la
   * deplacer directement avec la souris. » Choisir et deplacer sont le meme
   * geste : on pose le doigt sur le batiment et on le glisse. On mesure ou
   * l element se retrouve, pas ce que la carte declare. */
  await tiens();
  const ouEst = () => p.evaluate((cm) => {
    /* La ligne du bas de l element : c'est son ancre. On la trouve en
       cherchant la colonne peinte la plus a droite dans chaque bande. */
    const g = document.getElementById('nxMapGrille');
    const d = g.getContext('2d').getImageData(0, 0, g.width, g.height).data;
    let sx = 0, sy = 0, n2 = 0;
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const i = (y * g.width + x) * 4;
        /* Le cadre de selection, jaune franc : c'est LUI qu'on suit, il est
           cale sur l emprise et donc sur l ancre. */
        if (d[i] > 230 && d[i+1] > 190 && d[i+1] < 230 && d[i+2] < 140) { sx += x; sy += y; n2++; }
      }
    }
    if (!n2) return null;
    return { c: (sx / n2 - cm.x0) / cm.p, l: (sy / n2 - cm.y0) / cm.p };
  }, { p: camS.p, x0: camS.x0, y0: camS.y0 });
  const avantD = await ouEst();
  ok(!!avantD, 'le cadre de selection se voit');
  await geste(camS, [{ t: 'down', c: iso.cc, l: iso.ll - 1, id: 68 },
                     { t: 'move', c: iso.cc + 3, l: iso.ll + 1, id: 68 },
                     { t: 'up', c: iso.cc + 3, l: iso.ll + 1, id: 68 }]);
  await p.waitForTimeout(800);
  const apresD = await ouEst();
  ok(!!apresD && apresD.c - avantD.c > 2,
     `tirer l element le deplace de ${(apresD ? apresD.c - avantD.c : 0).toFixed(1)} cases vers la droite`);
  ok(!!apresD && apresD.l - avantD.l > 1, 'et vers le bas');
  await p.click('#nxMapAnnule');
  await p.waitForTimeout(800);
  const rendueD = await ouEst();
  ok(!!rendueD && Math.abs(rendueD.c - avantD.c) < 0.6 && Math.abs(rendueD.l - avantD.l) < 0.6,
     'et « Undo » le remet ou il etait, en une fois');

  /* ---- ET LA GOMME EFFACE CE QU ON VOIT ----
   * Elle effacait la CASE : sur une parcelle de quatre, trois clics sur
   * quatre ne faisaient rien, et l'on frottait le batiment sans qu'il
   * disparaisse. On efface donc par le HAUT du dessin, la ou l'ancre n'est
   * pas. */
  await p.evaluate(() => { document.getElementById('nxMapOutilGomme').click(); });
  await geste(camS, [{ t: 'down', c: iso.cc + 1, l: iso.ll - 2, id: 65 },
                     { t: 'up', c: iso.cc + 1, l: iso.ll - 2, id: 65 }]);
  await p.waitForTimeout(700);
  const efface = await largeurDessinee(iso, repere);
  ok(!(efface.combien > 4),
     `un seul coup de gomme sur le batiment l efface (${efface.combien} colonnes restantes)`);
  await p.click('#nxMapAnnule');
  await p.waitForTimeout(700);
  const revenue = await largeurDessinee(iso, repere);
  ok(revenue.combien > 20, 'et « Undo » la remet');
  /* On repasse au pinceau pour la suite. */
  await p.evaluate(() => { document.getElementById('nxMapOutilDessin').click(); });

  /* ---- ET LE SERVEUR LE GARDE ---- */
  await p.fill('#nxMapNom', 'Ma carte en relief');
  await p.click('#nxMapEnregistre');
  await p.waitForTimeout(1600);
  const j2 = await (await fetch(base + '/admin/cartes', { headers: { 'x-admin-key': 'k' } })).json();
  const relief = (j2.cartes || []).find((k) => k.nom === 'Ma carte en relief');
  ok(!!relief, 'le serveur a garde la carte en relief');
  if (relief) {
    eq(relief.mode, 'iso', 'avec son mode');
    eq(relief.cote, 16, 'et la taille choisie a la creation');
  }

  console.log('\n-- le point de depart, pose et rendu par le serveur --');
  /* ---- CE QUI MANQUAIT POUR QU UNE CARTE SE MARCHE ----
   * Une carte sans depart n'est pas invalide : elle n'est pas encore jouable.
   * L'essai pose le point par le bouton, l'enregistre, et va le relire chez le
   * serveur — la seule preuve qui compte. */
  await p.click('#nxMapRetour'); await p.waitForTimeout(250);
  if (await p.evaluate(() => document.getElementById('nxMapConfirme').classList.contains('on'))) {
    await p.click('#nxMapJette'); await p.waitForTimeout(400);
  }
  await cree('plat', 16);
  const camD = await cadre(16);
  await p.evaluate(() => {
    document.querySelector('#nxMapPalette .nxmap-el[data-fam="sol"]').click();
    document.getElementById('nxMapOutilRect').click();
  });
  await geste(camD, [{ t: 'down', c: 2, l: 2, id: 51 }, { t: 'move', c: 9, l: 9, id: 51 },
                     { t: 'up', c: 9, l: 9, id: 51 }]);
  await p.waitForTimeout(500);
  await p.evaluate(() => { document.getElementById('nxMapOutilDepart').click(); });
  await geste(camD, [{ t: 'down', c: 5, l: 6, id: 52 }, { t: 'up', c: 5, l: 6, id: 52 }]);
  await p.waitForTimeout(400);
  await p.fill('#nxMapNom', 'Ma carte a marcher');
  await p.click('#nxMapEnregistre');
  await p.waitForTimeout(1600);
  const j3 = await (await fetch(base + '/admin/cartes', { headers: { 'x-admin-key': 'k' } })).json();
  const am = (j3.cartes || []).find((k) => k.nom === 'Ma carte a marcher');
  ok(!!am, 'le serveur a garde la carte');
  if (am) {
    const d = await (await fetch(base + '/admin/cartes?id=' + am.id,
                                 { headers: { 'x-admin-key': 'k' } })).json();
    ok(!!d.carte.depart, 'avec un point de depart');
    eq(d.carte.depart && (d.carte.depart.c + ',' + d.carte.depart.l), '5,6',
       'et c est EXACTEMENT la case ou l on a clique');
  }

  /* ---- ET « ANNULER » DEFAIT AUSSI LE DEPART ----
   * Il ne vit pas dans les cases : sans precaution, « Undo » rendait les cases
   * d'avant et laissait le depart la ou on venait de le mettre — un geste
   * defait a moitie, ce qui est pire que pas defait du tout. */
  /* ---- ON REMESURE LE CADRE AVANT DE VISER ----
   * Entre la creation et ici, la barre d'outils a gagne une ligne : le
   * message d'enregistrement est long, il passe a la ligne, et la scene perd
   * la hauteur correspondante. Le cadre mesure a la creation ne vaut donc
   * plus, et viser avec lui tombe une case a cote. Un cadre se mesure quand
   * on s'en sert. */
  const camD2 = await cadre(16);
  const ouEstLeDepart = () => p.evaluate((cm) => {
    const g = document.getElementById('nxMapGrille');
    const d = g.getContext('2d').getImageData(0, 0, g.width, g.height).data;
    /* Le disque du depart est le seul vert franc de la carte. */
    /* ---- ON PREND LE CENTRE DE GRAVITE DU VERT ----
       Le centre de la case porte la FLECHE, qui est sombre, et le disque n'est
       qu'a trente pour cent d'opacite. Le seul vert franc est le CERCLE qui
       borde le repere — mais un cercle deborde d'un pixel ou deux sur la case
       voisine, et chercher « la premiere case ou l'on voit du vert » rendait
       systematiquement celle du dessus. Le centre de gravite, lui, tombe au
       milieu du repere quoi qu'il deborde. */
    let sx = 0, sy = 0, n2 = 0;
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const i = (y * g.width + x) * 4;
        if (d[i + 1] > 220 && d[i] > 90 && d[i] < 170 && d[i + 2] > 110 && d[i + 2] < 200) {
          sx += x; sy += y; n2++;
        }
      }
    }
    if (!n2) return null;
    return Math.floor((sx / n2 - cm.x0) / cm.p) + ',' + Math.floor((sy / n2 - cm.y0) / cm.p);
  }, { p: camD2.p, x0: camD2.x0, y0: camD2.y0 });
  /* ---- ON ATTEND LE DESSIN, ON NE COMPTE PAS DESSUS ----
   * La grille se repeint a la prochaine image, pas au geste : un demi-seconde
   * suffit presque toujours, et « presque » veut dire un essai qui tombe une
   * fois sur cinq en accusant le code. */
  const attendLeDepart = async (vise) => {
    const fin = Date.now() + 6000;
    let ou = null;
    while (Date.now() < fin) {
      ou = await ouEstLeDepart();
      if (ou === vise) return ou;
      await p.waitForTimeout(250);
    }
    return ou;
  };
  await geste(camD2, [{ t: 'down', c: 8, l: 3, id: 53 }, { t: 'up', c: 8, l: 3, id: 53 }]);
  eq(await attendLeDepart('8,3'), '8,3', 'le depart deplace se voit sur le dessin');
  await p.click('#nxMapAnnule');
  eq(await attendLeDepart('5,6'), '5,6', 'et « Undo » le ramene ou il etait');

  console.log('\n-- les couches : deux elements au meme endroit --');
  /* ---- CE QUE LES COUCHES CHANGENT ----
   * « Si je pose un sol et je veux poser une maison par-dessus, le sol sera
   * en premier, la maison en 2 — et on peut mettre deux items sur la couche
   * 2. » Une case portait UN objet : le second remplacait le premier. On
   * verifie donc qu'ils COEXISTENT, et que celui de la couche haute est celui
   * qu'on attrape. */
  await p.click('#nxMapRetour'); await p.waitForTimeout(250);
  if (await p.evaluate(() => document.getElementById('nxMapConfirme').classList.contains('on'))) {
    await p.click('#nxMapJette'); await p.waitForTimeout(400);
  }
  await cree('plat', 16);
  const camC = await cadre(16);
  const couches = () => p.evaluate(() => ({
    barre: document.querySelectorAll('#nxMapCouchesBoutons button').length,
    active: [...document.querySelectorAll('#nxMapCouchesBoutons button')]
      .findIndex((b) => b.classList.contains('vedette')),
    fiche: [...document.querySelectorAll('#nxMapFicheCouches button')]
      .findIndex((b) => b.classList.contains('vedette')),
    nom: (document.getElementById('nxMapFicheNom') || {}).textContent,
  }));
  const c1 = await couches();
  eq(c1.barre, 8, 'huit couches proposees');
  eq(c1.active, 0, 'et la premiere est celle ou l on pose');
  /* Deux objets DIFFERENTS sur la MEME case, deux couches. */
  const cles = await p.evaluate(() => {
    const bs = [...document.querySelectorAll('#nxMapPalette .nxmap-el[data-fam="objet"]')];
    return [bs[0].dataset.cle, bs[1].dataset.cle];
  });
  await p.evaluate((k) => {
    document.querySelector('#nxMapPalette .nxmap-el[data-cle="' + k + '"]').click();
    document.getElementById('nxMapOutilDessin').click();
  }, cles[0]);
  await geste(camC, [{ t: 'down', c: 8, l: 8, id: 75 }, { t: 'up', c: 8, l: 8, id: 75 }]);
  await p.waitForTimeout(400);
  /* On passe sur la couche 3 et l'on pose le second AU MEME ENDROIT. */
  await p.evaluate((k) => {
    document.querySelectorAll('#nxMapCouchesBoutons button')[2].click();
    document.querySelector('#nxMapPalette .nxmap-el[data-cle="' + k + '"]').click();
    document.getElementById('nxMapOutilDessin').click();
  }, cles[1]);
  await geste(camC, [{ t: 'down', c: 8, l: 8, id: 76 }, { t: 'up', c: 8, l: 8, id: 76 }]);
  await p.waitForTimeout(400);
  eq((await couches()).active, 2, 'la couche choisie reste celle ou l on pose');
  await p.fill('#nxMapNom', 'Ma carte a couches');
  await p.click('#nxMapEnregistre');
  await p.waitForTimeout(1800);
  const jc = await (await fetch(base + '/admin/cartes', { headers: { 'x-admin-key': 'k' } })).json();
  const kc = (jc.cartes || []).find((k) => k.nom === 'Ma carte a couches');
  ok(!!kc, 'le serveur a garde la carte a couches');
  if (kc) {
    const dc = await (await fetch(base + '/admin/cartes?id=' + kc.id,
                                  { headers: { 'x-admin-key': 'k' } })).json();
    const ici = (dc.carte.objets || []).filter((q) => q.c === 8 && q.l === 8);
    eq(ici.length, 2, 'les DEUX objets tiennent sur la meme case');
    eq(ici.map((q) => q.z).sort().join(','), '0,2', 'chacun sur sa couche');
    ok(ici.map((q) => q.k).indexOf(cles[0]) >= 0 && ici.map((q) => q.k).indexOf(cles[1]) >= 0,
       `et ce sont bien les deux qu on a poses : ${cles.join(' et ')}`);
  }
  /* ---- ET C'EST CELUI DU DESSUS QU'ON ATTRAPE ---- */
  await p.evaluate(() => { document.getElementById('nxMapOutilChoix').click(); });
  const camC2 = await cadre(16);
  await geste(camC2, [{ t: 'down', c: 8, l: 8, id: 77 }, { t: 'up', c: 8, l: 8, id: 77 }]);
  await p.waitForTimeout(500);
  const pris = await couches();
  eq(pris.nom, cles[1], 'un clic prend celui de la couche la plus haute');
  eq(pris.fiche, 2, 'et la fiche montre sur quelle couche il est');
  /* On le renvoie sur la couche 6 : la fiche suit, et rien d'autre ne bouge. */
  await p.evaluate(() => { document.querySelectorAll('#nxMapFicheCouches button')[5].click(); });
  await p.waitForTimeout(500);
  eq((await couches()).fiche, 5, 'le changer de couche se voit tout de suite');

  console.log('\n-- ce qu on vient de poser est ce qu on tient --');
  /* ---- CE QUI ETAIT DEMANDE ----
   * « Si on vient de poser un item, faut qu il soit selectionne directement,
   * qu on le voie en haut a droite — on est encore sur l ancienne selection. »
   * La fiche montrait le PRECEDENT : on posait une maison, on regardait a
   * droite pour la regler, et l'on reglait le tonneau d avant.
   *
   * L'essai part de l'etat FAUTIF : on tient encore l'element de la section
   * precedente. Sans ce depart, poser le premier element d'une carte vide
   * aurait rempli la fiche par hasard, et la verification aurait passe meme
   * si personne n'avait rien change. */
  eq((await couches()).nom, cles[1],
     'avant de poser, la fiche montre encore le precedent — c est l etat fautif');
  const cle3 = await p.evaluate(() =>
    [...document.querySelectorAll('#nxMapPalette .nxmap-el[data-fam="objet"]')][2].dataset.cle);
  await p.evaluate((k) => {
    document.querySelector('#nxMapPalette .nxmap-el[data-cle="' + k + '"]').click();
    document.getElementById('nxMapOutilDessin').click();
  }, cle3);
  /* ---- OU L ON POSE N EST PAS INDIFFERENT ----
   * `largeurDessinee` prend son FOND sur les deux premieres cases de la
   * carte. Pose en 3, un element de quatre cases s etend jusqu a la case et
   * demie — il mordait donc sur la zone de reference, le fond montait, le
   * seuil avec lui, et seule la partie la plus claire du dessin comptait. Le
   * decaler d une case le sortait de cette zone, le seuil retombait, tout le
   * dessin comptait, et la mesure annoncait un deplacement VERS LA GAUCHE
   * pour un decalage vers la droite. Le defaut etait dans la regle, pas dans
   * le produit. On pose donc loin de la reference. */
  await geste(camC2, [{ t: 'down', c: 10, l: 12, id: 78 }, { t: 'up', c: 10, l: 12, id: 78 }]);
  await p.waitForTimeout(500);
  eq((await couches()).nom, cle3,
     'des qu on pose, la fiche montre CE QU ON VIENT DE POSER');
  /* ---- ET POSER FAIT PASSER A « CHOISIR » ----
   * Cet essai verifiait EXACTEMENT LE CONTRAIRE, et c'etait un mauvais choix :
   * tenir sans avoir l'outil ne servait qu'a moitie — la fiche montrait
   * l'element, mais les poignees ne se dessinaient pas et le tirer ne faisait
   * rien. Il fallait aller cliquer « Choisir » APRES CHAQUE POSE.
   * Le retour ne coute rien : cliquer un element de la palette remet le
   * pinceau, ce qu'on verifie juste apres. La boucle poser-regler-reprendre se
   * ferme donc sans un seul clic d'outil. */
  ok(await p.evaluate(() => document.getElementById('nxMapOutilChoix')
                              .classList.contains('vedette')),
     'et poser fait passer a « choisir » : on tient l element ET on en a l outil');
  const versLaPalette = await p.evaluate(() => {
    const b = document.querySelector('#nxMapListe .nxmap-el');
    if (b) b.click();
    return document.getElementById('nxMapOutilDessin').classList.contains('vedette');
  });
  ok(versLaPalette,
     'et reprendre un element dans la palette remet le pinceau : le retour ne'
     + ' coute pas un clic de plus');
  /* On remet ce qu'on tenait, que la suite mesure. */
  await p.evaluate((k) => {
    const b = [...document.querySelectorAll('#nxMapListe .nxmap-el')]
      .find((q) => q.dataset.cle === k);
    if (b) b.click();
  }, cle3);
  await p.waitForTimeout(300);

  console.log('\n-- les trois glissieres : l angle et les deux axes --');
  /* ---- CE QUI ETAIT DEMANDE ----
   * « Le tourner est nul, faudrait des slides pour changer les axes et etre
   * plus precis. » Le bouton ne donnait que quatre positions, et la case
   * etait la seule unite de placement — on ne pouvait ni poser une passerelle
   * de biais, ni coller un toit sur son mur.
   * On mesure ce que les glissieres FONT AU DESSIN : un champ ecrit et jamais
   * lu serait exact et sans effet. */
  const camG = await cadre(16);
  const bande = { p: camG.p, x0: camG.x0, x1: camG.x1, y0: camG.y0 };
  /* On l'agrandit : un objet d'une case fait quinze pixels a l'ecran, et un
     decalage d'une case s'y mesurerait a la louche. */
  for (let i = 0; i < 3; i++) { await p.click('#nxMapPlusGrand'); await p.waitForTimeout(200); }
  await p.waitForTimeout(500);
  /* Le bas du dessin, dans les colonnes de l'element : c'est ce qui bouge
     quand on le decale VERS LE BAS, et rien d'autre sur la carte ne se
     trouve dans ces colonnes-la. Le seuil se mesure comme ailleurs, sur deux
     cases entieres et vides — un chiffre en dur prendrait un croisement de
     grille pour du dessin. */
  const piedDessine = (cam2, xa, xb, ya, yb) => p.evaluate(([cam2, xa, xb, ya, yb]) => {
    const g = document.getElementById('nxMapGrille');
    const d = g.getContext('2d').getImageData(0, 0, g.width, g.height).data;
    const somme = (x, y) => { const i = (y * g.width + x) * 4; return d[i] + d[i + 1] + d[i + 2]; };
    let fond = 0;
    const gx = Math.round(cam2.x0) + 1, gl = Math.max(10, Math.ceil(cam2.p * 2));
    const gy = Math.round(cam2.y0) + 1;
    for (let x = gx; x < gx + gl; x++)
      for (let y = gy; y < gy + gl; y++) fond = Math.max(fond, somme(x, y));
    const seuil = fond + 40;
    let bas = -1;
    for (let x = Math.max(0, Math.round(xa)); x <= Math.min(g.width - 1, Math.round(xb)); x++)
      for (let y = Math.max(0, Math.round(ya)); y <= Math.min(g.height - 1, Math.round(yb)); y++)
        if (somme(x, y) > seuil && y > bas) bas = y;
    return { bas, fond, seuil };
  }, [cam2, xa, xb, ya, yb]);
  /* Les bornes du balayage : les colonnes de l'element, et une hauteur qui
     evite les DEUX bords de la carte — le cadre est un trait clair, et le
     compter aurait rendu le bas de la carte a chaque mesure. */
  const colA = () => bande.x0 + 8.2 * bande.p, colB = () => bande.x0 + 13.8 * bande.p;
  const ligA = () => bande.y0 + 8 * bande.p, ligB = () => bande.y0 + 15.4 * bande.p;
  const regle = async (id, v) => {
    await p.evaluate(([id, v]) => {
      const e = document.getElementById(id);
      e.value = String(v);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, v]);
    await p.waitForTimeout(450);
  };
  /* Ce que la fiche AFFICHE de l'element tenu : c'est aussi ce que voit celui
     qui s'en sert, et cela suffit a dire pourquoi une mesure a bouge. */
  const tenuEtat = () => p.evaluate(() => ({
    nom: (document.getElementById('nxMapFicheNom') || {}).textContent,
    taille: (document.getElementById('nxMapFicheTaille') || {}).textContent,
    x: (document.getElementById('nxMapRegX') || {}).value,
    y: (document.getElementById('nxMapRegY') || {}).value,
    g: (document.getElementById('nxMapRegG') || {}).value,
    /* La case et la taille se lisent dans le panneau de gauche, sur la ligne
       allumee : c'est ce que voit celui qui s'en sert, et non un interne. */
    ligne: ((document.querySelector('#nxMapPosesListe .nxmap-pose.pris') || {})
              .querySelector ? document.querySelector('#nxMapPosesListe .nxmap-pose.pris')
                                       .querySelector('i').textContent : ''),
  }));
  /* ---- AU PINCEAU AVANT DE MESURER ----
   * Depuis que poser fait passer a « choisir », les deux poignees sont
   * dessinees sur les coins du cadre : elles debordent de vingt pixels et se
   * mesuraient comme du dessin — deux cent vingt-neuf pixels de large pour un
   * element qui en fait cent quatre-vingt-sept, et un pied vingt-six pixels
   * trop bas. Trouve par la mesure elle-meme, qui s'est mise a rendre des
   * nombres ronds mais faux. */
  await p.evaluate(() => { document.getElementById('nxMapOutilDessin').click(); });
  await p.waitForTimeout(300);
  const etat0 = await tenuEtat();
  const droit = await largeurDessinee({ ll: 12 }, bande);
  ok(droit.max > droit.min,
     `l element pose se mesure : ${droit.max - droit.min + 1} px de large`
     + ` (${etat0.nom}, ${etat0.taille}, colonnes ${droit.min}..${droit.max},`
     + ` case de ${Math.round(bande.p)} px, x0=${Math.round(bande.x0)})`);
  const piedDroit = await piedDessine(bande, colA(), colB(), ligA(), ligB());
  ok(piedDroit.bas > 0, `son pied est a ${piedDroit.bas} px`);

  await regle('nxMapRegX', 100);
  const etatX = await tenuEtat();
  const pousseX = await largeurDessinee({ ll: 12 }, bande);
  ok(Math.abs((pousseX.min - droit.min) - bande.p) <= 4,
     `la glissiere X le pousse d une case exactement :`
     + ` ${Math.round(pousseX.min - droit.min)} px pour une case de ${Math.round(bande.p)}`
     + ` (colonnes ${droit.min}..${droit.max} puis ${pousseX.min}..${pousseX.max},`
     + ` glissiere a ${etatX.x}, taille ${etatX.taille})`);
  await regle('nxMapRegX', 0);
  const remisAZero = await largeurDessinee({ ll: 12 }, bande);
  ok(Math.abs(remisAZero.min - droit.min) <= 3, 'et zero le ramene exactement ou il etait');

  /* ---- ET L ON ATTRAPE CE QU ON VOIT, PAS LA CASE D ORIGINE ----
   * Le decalage deplace le DESSIN ; s il ne deplacait pas aussi la zone
   * sensible, l element se prendrait a cote de lui-meme — et plus il serait
   * decale, plus le clic tomberait dans le vide. On le prouve des DEUX
   * cotes : la meme case tient l element quand il est decale, et ne tient
   * plus rien quand il ne l est plus. Un seul des deux passerait tout seul.
   */
  await regle('nxMapRegX', 100);
  await p.evaluate(() => { document.getElementById('nxMapOutilChoix').click(); });
  const attrape = async (c, l, id) => {
    await geste(camG, [{ t: 'down', c: c, l: l, id: id }, { t: 'up', c: c, l: l, id: id }]);
    await p.waitForTimeout(500);
    return p.evaluate(() => ({
      vu: document.getElementById('nxMapFiche').classList.contains('on'),
      nom: (document.getElementById('nxMapFicheNom') || {}).textContent,
    }));
  };
  const loin = await attrape(13, 11, 79);
  ok(loin.vu && loin.nom === cle3,
     `decale, il s attrape a sa place NOUVELLE : ${loin.vu ? loin.nom : 'rien'}`);
  await regle('nxMapRegX', 0);
  const plusRien = await attrape(13, 11, 80);
  ok(!plusRien.vu,
     'et remis droit, la meme case ne tient plus rien — c est le DESSIN qu on'
     + ' attrape, pas la case ou l element fut pose');
  const repris = await attrape(10, 11, 81);
  ok(repris.vu && repris.nom === cle3, 'on le reprend par son milieu pour la suite');
  /* Retour au pinceau AVANT de mesurer : sous « choisir », le cadre jaune est
     dessine sur l emprise et se mesurerait comme du dessin. */
  await p.evaluate(() => { document.getElementById('nxMapOutilDessin').click(); });
  await p.waitForTimeout(400);

  await regle('nxMapRegY', 100);
  const piedBas = await piedDessine(bande, colA(), colB(), ligA(), ligB());
  ok(Math.abs((piedBas.bas - piedDroit.bas) - bande.p) <= 4,
     `la glissiere Y le descend d une case exactement :`
     + ` ${Math.round(piedBas.bas - piedDroit.bas)} px pour une case de ${Math.round(bande.p)}`);
  await regle('nxMapRegY', 0);

  /* ---- L ANGLE, ET LE BOUTON QUI REMET D EQUERRE ----
   * Le bouton ne fait PAS « plus quatre-vingt-dix » : depuis dix-sept degres,
   * il rendrait cent sept, et l'on ne pourrait plus jamais retomber droit
   * autrement qu'en visant le zero a la glissiere. */
  /* ---- L AIMANT CALE AUSSI L ANGLE ----
   * « Il manque la rotation basique pour bien placer les elements. » Viser
   * quarante-cinq ou quatre-vingt-dix sur une glissiere de trois cent
   * soixante crans demandait de la patience, et c'est sur ces angles-la qu'on
   * passe son temps quand on aligne. C'est le MEME aimant que pour la grille :
   * un second interrupteur, propre a l'angle, aurait fait deux choses a se
   * rappeler.
   * On verifie les DEUX etats. Un seul passerait tout seul : mis, dix-sept
   * doit devenir quinze ; ote, dix-sept doit rester dix-sept. */
  await regle('nxMapRegG', 17);
  eq(await p.evaluate(() => document.getElementById('nxMapRegGVal').textContent), '15°',
     'aimant mis, la glissiere d angle s accroche aux quinze degres');
  await p.click('#nxMapAimant'); await p.waitForTimeout(300);
  await regle('nxMapRegG', 17);
  eq(await p.evaluate(() => document.getElementById('nxMapRegGVal').textContent), '17°',
     'aimant ote, elle rend le degre pres');
  await p.click('#nxMapAimant'); await p.waitForTimeout(300);
  /* ---- ET LES HUIT BOUTONS POSENT L ANGLE EN UN CLIC ----
   * Une glissiere se vise, meme aimantee ; un bouton ne se vise pas. */
  const boutonsAngle = await p.evaluate(() =>
    [...document.querySelectorAll('#nxMapAngles button')].map((b) => b.dataset.deg));
  eq(boutonsAngle.join(','), '0,45,90,135,180,225,270,315',
     'les huit quarts et demi-quarts de tour sont la');
  await p.evaluate(() => {
    document.querySelector('#nxMapAngles button[data-deg="135"]').click();
  });
  await p.waitForTimeout(400);
  eq(await p.evaluate(() => document.getElementById('nxMapRegGVal').textContent), '135°',
     'un clic sur « 135° » y pose l element, sans viser');
  ok(await p.evaluate(() => document.querySelector('#nxMapAngles button[data-deg="135"]')
                              .classList.contains('vedette')),
     'et celui qui porte l angle courant s allume : huit boutons identiques ne'
     + ' diraient pas ou l on en est');
  await regle('nxMapRegG', 17);
  await p.click('#nxMapTourne'); await p.waitForTimeout(450);
  eq(await p.evaluate(() => document.getElementById('nxMapRegG').value), '90',
     'et le bouton ne rajoute pas quatre-vingt-dix a dix-sept : il remet d equerre');
  await p.click('#nxMapTourne'); await p.waitForTimeout(450);
  eq(await p.evaluate(() => document.getElementById('nxMapRegG').value), '180',
     'puis avance d un quart de tour a la fois');


  /* ---- LE MIROIR : LE SEUL AUTRE AXE QU UNE IMAGE PLATE POSSEDE ----
   * « Il manque un axe de rotation. » Une planche n a pas de troisieme
   * dimension : la tourner autour de sa verticale, c est la RETOURNER.
   * On le mesure au CENTRE DE MASSE : un miroir ne change ni la largeur ni la
   * hauteur, mesurer l une ou l autre ne dirait rien du tout. */
  await regle('nxMapRegG', 0);
  /* ---- ON COMPARE LE DESSIN A SON PROPRE REFLET ----
   * Le premier essai mesurait le CENTRE DE MASSE et le voyait bouger de treize
   * pixels : cela passait, mais treize pixels contre une tolerance de quatre,
   * ce n'est pas une preuve, c'est une coincidence a un cheveu du bruit — et
   * sur une planche plus symetrique il n'y aurait plus rien du tout a
   * mesurer.
   * On photographie donc la bande, et l'on pose la seule question qui ne
   * depende pas de la planche : le dessin retourne est-il le REFLET du dessin
   * droit ? Deux ecarts, et c'est leur rapport qui conclut — quelle que soit
   * la dissymetrie, pourvu qu'il y en ait une, ce qu'on verifie aussi. */
  const photo = (cam2, xa, xb, ya, yb) => p.evaluate(([cam2, xa, xb, ya, yb]) => {
    const g = document.getElementById('nxMapGrille');
    const d = g.getContext('2d').getImageData(0, 0, g.width, g.height).data;
    const x0 = Math.round(xa), x1 = Math.round(xb), y0 = Math.round(ya), y1 = Math.round(yb);
    const out = [];
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * g.width + x) * 4;
        out.push(d[i] + d[i + 1] + d[i + 2]);
      }
    return { px: out, w: x1 - x0, h: y1 - y0 };
  }, [cam2, xa, xb, ya, yb]);
  const ecart = (a, b) => {
    let t = 0;
    for (let i = 0; i < a.px.length; i++) t += Math.abs(a.px[i] - b.px[i]);
    return t / a.px.length;
  };
  const reflet = (a) => {
    const px = new Array(a.px.length);
    for (let y = 0; y < a.h; y++)
      for (let x = 0; x < a.w; x++) px[y * a.w + x] = a.px[y * a.w + (a.w - 1 - x)];
    return { px, w: a.w, h: a.h };
  };
  /* La boite est CENTREE sur la planche : un reflet ne se compare qu'autour de
     l axe qui le produit. */
  const bx = [bande.x0 + 8 * bande.p, bande.x0 + 13 * bande.p];
  const by = [bande.y0 + 10 * bande.p, bande.y0 + 13 * bande.p];
  const pDroite = await photo(bande, bx[0], bx[1], by[0], by[1]);
  const dissymetrie = ecart(pDroite, reflet(pDroite));
  ok(dissymetrie > 5,
     `la planche est dissymetrique, donc son miroir se verra : ${dissymetrie.toFixed(1)}`
     + ` d ecart avec son propre reflet`);
  await p.click('#nxMapMiroirX'); await p.waitForTimeout(500);
  const pMiroir = await photo(bande, bx[0], bx[1], by[0], by[1]);
  const versLeReflet = ecart(pMiroir, reflet(pDroite));
  const versLOriginal = ecart(pMiroir, pDroite);
  ok(versLeReflet < versLOriginal / 3,
     `le dessin retourne EST le reflet du dessin droit : ${versLeReflet.toFixed(1)} d ecart`
     + ` avec le reflet, ${versLOriginal.toFixed(1)} avec l original`);
  await p.click('#nxMapMiroirX'); await p.waitForTimeout(500);
  const pRevenue = await photo(bande, bx[0], bx[1], by[0], by[1]);
  ok(ecart(pRevenue, pDroite) < versLOriginal / 10,
     `et deux fois de suite la remet exactement comme elle etait :`
     + ` ${ecart(pRevenue, pDroite).toFixed(1)} d ecart`);
  ok(await p.evaluate(() => !document.getElementById('nxMapMiroirX')
                              .classList.contains('vedette')),
     'le bouton s eteint avec elle : on voit lequel est mis sans retourner l element');
  /* ---- ET LE SECOND AXE DESSINE, LUI AUSSI ----
   * Les deux sens passent par la meme ligne, mais par un BIT different : une
   * faute de frappe sur le second serait muette, l element resterait droit et
   * le serveur garderait quand meme le champ. */
  await p.click('#nxMapMiroirY'); await p.waitForTimeout(500);
  const pHautBas = await photo(bande, bx[0], bx[1], by[0], by[1]);
  ok(ecart(pHautBas, pDroite) > versLOriginal / 3,
     `le miroir haut-bas change le dessin lui aussi : ${ecart(pHautBas, pDroite).toFixed(1)}`
     + ` d ecart`);
  await p.click('#nxMapMiroirY'); await p.waitForTimeout(500);

  /* ---- LA TAILLE AU CENTIEME DE CASE ----
   * « On peut rajouter plus de precision sur les agrandissements ? » Elle
   * allait de case pleine en case pleine : d une case a deux, du simple au
   * double, et rien entre les deux. */
  const avantTaille = await tenuEtat();
  eq(avantTaille.taille, '4×4', 'on part de quatre cases pleines');
  const quatre = await largeurDessinee({ ll: 12 }, bande);
  const largeQuatre = quatre.max - quatre.min;
  /* Le cran est LOGARITHMIQUE : on ne le calcule pas ici, on le pose et l on
     lit ce que la fiche annonce — c est ce que voit celui qui s en sert. */
  await regle('nxMapRegT', 474);
  const fine = await tenuEtat();
  const nFine = Number(String(fine.taille).split('×')[0]);
  ok(String(fine.taille).indexOf('.') > 0 && nFine > 2 && nFine < 3,
     `la glissiere donne une taille entre deux cases pleines : ${fine.taille}`);
  const largeFine = await largeurDessinee({ ll: 12 }, bande);
  const rapport = (largeFine.max - largeFine.min) / largeQuatre;
  ok(Math.abs(rapport - nFine / 4) <= 0.06,
     `et le DESSIN suit au meme rapport : ${rapport.toFixed(3)} pour ${(nFine / 4).toFixed(3)}`);
  /* Et « + » ramene a la case pleine SUIVANTE : sans cela, on ne pourrait
     plus jamais revenir a un compte rond depuis une valeur fine. */
  await p.click('#nxMapPlusGrand'); await p.waitForTimeout(500);
  eq((await tenuEtat()).taille, '3×3',
     '« + » remonte a la case pleine suivante, et non a « la meme plus une »');
  await p.click('#nxMapPlusPetit'); await p.waitForTimeout(500);
  eq((await tenuEtat()).taille, '2×2', 'et « − » redescend a la precedente');
  await regle('nxMapRegT', 474);

  /* ---- ET TOUT CELA ARRIVE JUSQU AU SERVEUR ---- */
  await p.click('#nxMapMiroirY'); await p.waitForTimeout(400);
  await regle('nxMapRegG', 45);
  await regle('nxMapRegX', -30);
  /* Deux gestes de suite sur la MEME glissiere : l annulation devra ramener
     quarante, et non zero. Voir plus bas — partir de zero ne prouvait rien. */
  await regle('nxMapRegY', 40);
  await regle('nxMapRegY', 12);
  await p.fill('#nxMapNom', 'Ma carte reglee');
  await p.click('#nxMapEnregistre');
  await p.waitForTimeout(1800);
  const jr = await (await fetch(base + '/admin/cartes', { headers: { 'x-admin-key': 'k' } })).json();
  const kr = (jr.cartes || []).find((k) => k.nom === 'Ma carte reglee');
  ok(!!kr, 'le serveur a garde la carte reglee');
  if (kr) {
    const dr = await (await fetch(base + '/admin/cartes?id=' + kr.id,
                                  { headers: { 'x-admin-key': 'k' } })).json();
    const q = (dr.carte.objets || []).find((o) => o.c === 10 && o.l === 12);
    eq(q && q.g, 45, 'avec l angle, tel que l aimant l a pose');
    eq(q && q.dx, -30, 'et le decalage en X');
    eq(q && q.dy, 12, 'et celui en Y');
    eq(q && q.m, 2, 'et le miroir haut-bas');
    ok(q && q.n > 2 && q.n < 3 && q.n !== Math.round(q.n),
       `et l emprise fractionnaire, telle quelle : ${q && q.n}`);
  }
  /* ---- UNE ANNULATION PAR GESTE, ET QUI RAMENE CE QU IL Y AVAIT AVANT ----
   * Deux pieges ici, et le second a failli passer.
   * Le premier : une entree dans la pile par DEGRE aurait demande trente
   * clics pour defaire un geste — on empile donc au premier cran et l on
   * rouvre au lacher.
   * Le second : verifier qu on revient a ZERO ne prouve rien. Une copie de
   * pile qui PERD le champ rend zero elle aussi, et l essai passe pour la
   * mauvaise raison — verifie en retirant le champ de la copie : il passait
   * encore. On revient donc a une valeur PRECEDENTE NON NULLE, que seule une
   * copie complete peut rendre. */
  await p.click('#nxMapAnnule'); await p.waitForTimeout(700);
  eq(await p.evaluate(() => document.getElementById('nxMapRegY').value), '40',
     'et « Undo » ramene la valeur PRECEDENTE d un coup, pas zero et pas degre par degre');
  await p.click('#nxMapAnnule'); await p.waitForTimeout(700);
  const remonte = await tenuEtat();
  eq(remonte.y, '0', 'un second « Undo » remonte encore d un geste');
  eq(remonte.g, '45', "et l angle n est pas perdu en chemin : la copie de la pile porte TOUS les champs");
  eq(remonte.x, '-30', 'le decalage en X non plus');

  console.log('\n-- le panneau de gauche : ce qu on a deja pose --');
  /* ---- CE QUI ETAIT DEMANDE ----
   * « Sur la gauche faudrait un panneau voir ce qu on a deja pose et pouvoir
   * le selectionner via le panneau de gauche. »
   * SA RAISON D ETRE tient en une phrase : un element cache SOUS un autre ne
   * se retrouve pas au clic. On le prouve — celui de la couche basse, sur la
   * meme case, que la carte ne rend jamais. */
  const listeGauche = () => p.evaluate(() => ({
    vu: document.getElementById('nxMapPoses').classList.contains('on'),
    titres: [...document.querySelectorAll('#nxMapPosesListe h5')].map((h) => h.textContent),
    lignes: [...document.querySelectorAll('#nxMapPosesListe .nxmap-pose')].map((b) => ({
      i: b.dataset.i,
      nom: b.querySelector('span').textContent,
      ou: b.querySelector('i').textContent,
      image: !!(b.querySelector('img') || {}).src,
      pris: b.classList.contains('pris'),
    })),
  }));
  const gauche = await listeGauche();
  ok(gauche.vu, 'le panneau est la, a gauche de la scene');
  eq(gauche.lignes.length, 3, 'et il porte les trois elements poses');
  ok(gauche.lignes.every((l) => l.image), 'chacun avec sa vignette');
  eq(gauche.lignes.filter((l) => l.pris).length, 1, 'une seule ligne est allumee');
  eq(gauche.lignes.find((l) => l.pris).nom, cle3,
     'et c est celle de l element qu on tient');
  ok(gauche.titres.length >= 2,
     `ranges par couche : ${gauche.titres.join(' | ')}`);
  /* Les deux de la case 8,8 sont bien tous les deux la, alors que la carte
     n'en montre qu'un. */
  eq(gauche.lignes.filter((l) => l.ou.indexOf('8,8') === 0).length, 2,
     'les DEUX elements empiles sur la case 8,8 y figurent, alors que la carte'
     + " n'en montre qu'un");
  /* ---- ET L ON ATTRAPE CELUI DU DESSOUS ----
   * Au clic sur la carte, c'est celui du dessus qui vient — verifie plus
   * haut. Par le panneau, on prend celui qu'on veut. */
  const ligneBasse = gauche.lignes.find((l) => l.nom === cles[0]);
  ok(!!ligneBasse, `la ligne de l element cache existe : ${cles[0]}`);
  await p.evaluate((i) => {
    document.querySelector('#nxMapPosesListe .nxmap-pose[data-i="' + i + '"]').click();
  }, ligneBasse.i);
  await p.waitForTimeout(500);
  eq((await couches()).nom, cles[0],
     "un clic dans le panneau tient l element CACHE — ce que le clic sur la carte"
     + ' ne peut pas faire');
  ok(await p.evaluate(() => document.getElementById('nxMapOutilChoix')
                              .classList.contains('vedette')),
     'et l on passe a « choisir », pour que les poignees suivent le cadre');
  const apresClic = await listeGauche();
  eq(apresClic.lignes.filter((l) => l.pris).length, 1, 'une seule ligne reste allumee');
  eq(apresClic.lignes.find((l) => l.pris).nom, cles[0], 'et c est la bonne');

  console.log('\n-- le cadenas : ce qui est verrouille ne part plus sous la main --');
  /* ---- CE QUI ETAIT DEMANDE ----
   * « Rajouter un petit cadenas ouvert, et quand on clique dessus il se ferme,
   * ca evite de bouger des elements sans faire expres. »
   *
   * Le defaut qu il corrige est celui-ci : un fond couvre la carte entiere,
   * et des qu on travaille ce qui est POSE DESSUS, chaque clic un peu large
   * attrape le fond. Le choix et le deplacement etant le meme geste, il PART —
   * et l on ne s en apercoit qu apres.
   *
   * On tient encore `cles[0]`, en 8,8, pris par le panneau de gauche. Il y a
   * DEUX elements empiles sur cette case : c est exactement la situation ou le
   * verrou sert.
   */
  const cadenas = () => p.evaluate(() => {
    const b = document.getElementById('nxMapVerrou');
    return { dessin: b.textContent.trim(), ferme: b.classList.contains('vedette'),
             tailleEteinte: document.getElementById('nxMapRegT').disabled,
             effaceEteint: document.getElementById('nxMapEfface').disabled,
             coucheEteinte: document.getElementById('nxMapFicheCouches').children[0].disabled };
  });
  const cadOuvert = await cadenas();
  eq(cadOuvert.dessin, '🔓', 'le cadenas est OUVERT au depart, et son dessin le dit');
  ok(!cadOuvert.tailleEteinte && !cadOuvert.effaceEteint,
     'et tout repond encore');
  /* On note ou il est, pour pouvoir dire qu il n a pas bouge. On le suit par
     son NUMERO et non par la ligne allumee : le tirage qui va suivre choisit
     l element du DESSUS, et lire « la ligne allumee » rendrait celui-la. Le
     premier essai s y est fait prendre et a cru le verrou casse. */
  const parNo = async (i) => (await listeGauche()).lignes.find((l) => l.i === String(i));
  const ouIlEtait = (await parNo(ligneBasse.i)).ou;
  const voisin = (await listeGauche()).lignes.find((l) => l.i !== ligneBasse.i
                                                      && l.ou.indexOf('8,8') === 0);
  ok(!!voisin, `un second element est pose sur la meme case : ${voisin && voisin.nom}`);
  await p.click('#nxMapVerrou'); await p.waitForTimeout(500);
  const cadFerme = await cadenas();
  eq(cadFerme.dessin, '🔒', 'un clic le ferme, et le dessin change : il EST l etat');
  ok(cadFerme.ferme, 'le bouton s allume avec lui');
  /* ---- ET TOUT CE QUI MODIFIE S ETEINT ----
   * Les laisser vivants pour repondre « verrouille » a chaque geste apprend la
   * regle une fois puis agace mille fois. */
  ok(cadFerme.tailleEteinte && cadFerme.effaceEteint && cadFerme.coucheEteinte,
     'la taille, la suppression et les couches s eteignent : on VOIT la regle'
     + ' au lieu de se la faire dire a chaque geste');
  /* ---- LE CLIC SUR LA CARTE LE TRAVERSE ---- */
  await p.evaluate(() => { document.getElementById('nxMapOutilChoix').click(); });
  const parDessus = await attrape(8, 8, 95);
  ok(parDessus.vu && parDessus.nom !== cles[0],
     `le clic sur la case le traverse et prend celui du dessus : ${parDessus.nom}`);
  /* ---- ET IL NE PART PAS QUAND ON TIRE DESSUS ----
   * C est la demande, mot pour mot. On le reprend par le panneau — la seule
   * porte qui reste — puis on tire franchement. */
  await p.evaluate((i) => {
    document.querySelector('#nxMapPosesListe .nxmap-pose[data-i="' + i + '"]').click();
  }, ligneBasse.i);
  await p.waitForTimeout(400);
  await geste(camG, [{ t: 'down', c: 8, l: 8, id: 96 },
                     { t: 'move', c: 12, l: 8, id: 96 },
                     { t: 'up', c: 12, l: 8, id: 96 }]);
  await p.waitForTimeout(500);
  const apresTirage = await parNo(ligneBasse.i);
  eq(apresTirage.ou, ouIlEtait,
     'quatre cases de tirage ne le deplacent pas d un pouce');
  /* ---- ET LE GESTE A BIEN EU LIEU ----
   * Sans ce controle, « il n a pas bouge » passerait aussi bien si le tirage
   * n avait rien fait du tout — un mauvais numero de pointeur, un clic hors
   * de la grille — et l essai dirait « le verrou tient » en ne verifiant
   * rien. C est le VOISIN, non verrouille, qui prouve que la main a porte. */
  const voisinApres = await parNo(voisin.i);
  ok(voisinApres.ou !== voisin.ou,
     `c est le voisin non verrouille qui est parti : ${voisin.ou} devient`
     + ` ${voisinApres.ou} — donc le geste a bien porte sur la carte`);
  ok(apresTirage.nom.indexOf('🔒') === 0,
     `et le panneau montre son cadenas : « ${apresTirage.nom} » — sans ce signe,`
     + ' un element qui ne repond plus au clic passerait pour casse');
  /* ---- ON PEUT TOUJOURS L OUVRIR ----
   * C est la verification qui compte le plus : un verrou dont le bouton
   * s eteindrait avec les autres enfermerait l element pour toujours.
   * On le REPREND d abord par le panneau : le tirage qui precede a laisse la
   * main sur le voisin, celui qu il a effectivement deplace. Cliquer le
   * cadenas sans cela aurait verrouille le voisin — ce que le premier essai a
   * fait, en croyant que le cadenas refusait de s ouvrir. */
  await p.evaluate((i) => {
    document.querySelector('#nxMapPosesListe .nxmap-pose[data-i="' + i + '"]').click();
  }, ligneBasse.i);
  await p.waitForTimeout(400);
  await p.click('#nxMapVerrou'); await p.waitForTimeout(500);
  const rouvert = await cadenas();
  eq(rouvert.dessin, '🔓', 'le cadenas se rouvre : son propre bouton ne s eteint jamais');
  ok(!rouvert.tailleEteinte && !rouvert.effaceEteint, 'et tout repond de nouveau');
  await geste(camG, [{ t: 'down', c: 8, l: 8, id: 97 },
                     { t: 'move', c: 10, l: 8, id: 97 },
                     { t: 'up', c: 10, l: 8, id: 97 }]);
  await p.waitForTimeout(500);
  const bouge = await parNo(ligneBasse.i);
  ok(bouge.ou !== ouIlEtait,
     `et il se deplace de nouveau : ${ouIlEtait} devient ${bouge.ou}`);
  ok(bouge.nom.indexOf('🔒') < 0, 'et son cadenas a disparu du panneau');
  /* Et on le RAMENE ou il etait, ouvert : ce qui suit part de la case 8,8, et
     un essai qui laisse la carte autrement qu il l a trouvee fait tomber le
     suivant pour une raison qui n a rien a voir avec lui. */
  await geste(camG, [{ t: 'down', c: 10, l: 8, id: 98 },
                     { t: 'move', c: 8, l: 8, id: 98 },
                     { t: 'up', c: 8, l: 8, id: 98 }]);
  await p.waitForTimeout(500);
  eq((await parNo(ligneBasse.i)).ou, ouIlEtait, 'et il revient exactement d ou il vient');

  console.log('\n-- l aimant : sur la grille, ou la ou le doigt lache --');
  /* ---- CE QUI ETAIT DEMANDE ----
   * « On peut rajouter plus de precision sur les deplacements ? » On tirait un
   * element de CASE EN CASE : sur une carte de seize, le plus petit
   * deplacement possible valait un seizieme de la carte. Il n y avait aucun
   * moyen de le poser entre deux.
   *
   * LA POSITION EST UN NOMBRE A VIRGULE EN DEUX MORCEAUX : la case en est la
   * partie entiere, le decalage la partie fractionnaire. L aimant n est donc
   * qu un ARRONDI — les deux modes ecrivent la meme chose, l un jette la
   * virgule et l autre la garde. On verifie les DEUX : un seul des deux
   * passerait tout seul.
   */
  const camA = await cadre(16);
  const tire = async (deA, versA, id) => {
    await geste(camA, [{ t: 'down', c: deA, l: 8, id: id },
                       { t: 'move', c: versA, l: 8, id: id },
                       { t: 'up', c: versA, l: 8, id: id }]);
    await p.waitForTimeout(500);
    return tenuEtat();
  };
  /* On tient encore `cles[0]`, en 8,8, choisi par le panneau de gauche. */
  eq((await tenuEtat()).ligne, '8,8', "l element tenu est bien celui de la case 8,8");
  ok(await p.evaluate(() => document.getElementById('nxMapAimant')
                              .classList.contains('vedette')),
     "l aimant est mis au depart : la grille est ce qui permet de rabouter"
     + " des sols sans couture, et personne n a rien demande d autre");
  /* ---- AIMANT MIS : UN TIERS DE CASE NE DEPLACE RIEN ---- */
  const colle = await tire(8, 8.3, 91);
  eq(colle.ligne, '8,8', 'un tiers de case ne le sort pas de sa case');
  eq(colle.x, '0', 'et ne laisse aucun decalage : il se pose SUR la grille');
  /* ---- AIMANT OTE : IL SE POSE OU LE DOIGT LE LACHE ---- */
  await p.click('#nxMapAimant'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !document.getElementById('nxMapAimant')
                               .classList.contains('vedette')),
     'on ote l aimant, et le bouton s eteint');
  const libre = await tire(8, 8.3, 92);
  eq(libre.ligne, '8,8', 'la case ne change pas pour un tiers de case');
  ok(Math.abs(Number(libre.x) - 30) <= 4,
     `mais le decalage, lui, l enregistre : ${libre.x} centiemes pour trente demandes`);
  /* Et au-dela d une demi-case, c est la CASE qui change : sans quoi la meme
     position s ecrirait de deux facons, et celle qu on relit ne serait plus
     celle qu on a posee. */
  const pluLoin = await tire(8.3, 9.1, 93);
  eq(pluLoin.ligne, '9,8', 'au-dela d une demi-case, c est la case qui change');
  ok(Math.abs(Number(pluLoin.x)) <= 15,
     `et le decalage repart de pres de zero : ${pluLoin.x}`);
  /* ---- ET REMETTRE L AIMANT RAMENE SUR LA GRILLE ----
   * C est le chemin de retour : sans lui, un element pose finement ne
   * pourrait plus jamais etre raboute a ses voisins. */
  await p.click('#nxMapAimant'); await p.waitForTimeout(300);
  const recolle = await tire(9, 9.2, 94);
  eq(recolle.x, '0', 'l aimant remis ramene l element sur la grille au premier geste');

  console.log('\n-- et l on va MARCHER dedans --');
  /* ---- LE BOUT DU CHEMIN ----
   * Une carte se dessinait ; elle se marche. Trois pieces devaient tenir
   * ensemble et chacune pouvait tomber seule : le sol de CHAQUE case — un plan
   * n'en portait qu'un pour tout le donjon —, les planches nommees que le
   * serveur ne sait pas situer, et le point d'arrivee.
   *
   * On ne verifie donc pas « le message est arrive » : on regarde ce qui est
   * DESSINE. Une planche peut etre chargee, connue du catalogue, et
   * n'apparaitre nulle part. */
  await p.click('#nxMapRetour'); await p.waitForTimeout(250);
  if (await p.evaluate(() => document.getElementById('nxMapConfirme').classList.contains('on'))) {
    await p.click('#nxMapJette'); await p.waitForTimeout(400);
  }
  await cree('plat', 16);
  const camJ = await cadre(16);
  /* Un sol partout, un objet posé, un depart : le minimum d'une carte ou l'on
     peut se tenir. */
  const solJ = await p.evaluate(() => {
    const b = document.querySelector('#nxMapPalette .nxmap-el[data-fam="sol"]');
    b.click(); document.getElementById('nxMapOutilRect').click();
    return b.dataset.cle;
  });
  await geste(camJ, [{ t: 'down', c: 0, l: 0, id: 71 }, { t: 'move', c: 15, l: 15, id: 71 },
                     { t: 'up', c: 15, l: 15, id: 71 }]);
  await p.waitForTimeout(600);
  const objJ = await p.evaluate(() => {
    const b = document.querySelector('#nxMapPalette .nxmap-el[data-fam="objet"]');
    b.click(); document.getElementById('nxMapOutilDessin').click();
    return b.dataset.cle;
  });
  await geste(camJ, [{ t: 'down', c: 10, l: 5, id: 72 }, { t: 'up', c: 10, l: 5, id: 72 }]);
  await p.waitForTimeout(400);
  await p.evaluate(() => { document.getElementById('nxMapOutilDepart').click(); });
  await geste(camJ, [{ t: 'down', c: 4, l: 4, id: 73 }, { t: 'up', c: 4, l: 4, id: 73 }]);
  await p.waitForTimeout(400);
  await p.fill('#nxMapNom', 'Ma carte a visiter');
  await p.click('#nxMapEnregistre');
  await p.waitForTimeout(1800);
  ok(!!solJ && !!objJ, `la carte porte du « ${solJ} » et un « ${objJ} »`);

  /* On revient a la galerie et l'on appuie sur « Play », comme un joueur. */
  await p.click('#nxMapRetour');
  await p.waitForTimeout(1200);
  const boutons = await p.evaluate(() => [...document.querySelectorAll('.nxmap-fiche')]
    .map((f) => ({ nom: f.querySelector('b').textContent,
                   actions: [...f.querySelectorAll('button')].map((b) => b.textContent) })));
  const fiche = boutons.find((f) => f.nom === 'Ma carte a visiter');
  ok(!!fiche && fiche.actions.indexOf('Play') >= 0,
     'la fiche propose « Play » : ' + (fiche ? fiche.actions.join(', ') : 'fiche absente'));
  const sansDepart = boutons.find((f) => f.nom === 'Ma premiere carte');
  ok(!sansDepart || sansDepart.actions.indexOf('Play') < 0,
     'et pas sur une carte sans point de depart');

  await p.evaluate(() => {
    const f = [...document.querySelectorAll('.nxmap-fiche')]
      .find((q) => q.querySelector('b').textContent === 'Ma carte a visiter');
    [...f.querySelectorAll('button')].find((b) => b.textContent === 'Play').click();
  });
  await p.waitForTimeout(3500);
  const dedans = await p.evaluate(() => ({
    panneau: document.getElementById('nxMapVoile').classList.contains('on'),
    entree: (window.__s || []).flatMap((q) => q.__m)
      .filter((mm) => mm.type === 'realmEntre').slice(-1)[0] || null,
  }));
  ok(!dedans.panneau, 'le panneau se referme quand le monde s ouvre');
  ok(!!dedans.entree, 'le serveur repond par une entree de monde');
  if (dedans.entree) {
    ok(/^carte:/.test(String(dedans.entree.carte)),
       'et c est bien la carte qu on a demandee : ' + dedans.entree.carte);
    ok((dedans.entree.sols || []).indexOf(solJ) >= 0,
       `le plan porte la palette des sols : ${JSON.stringify(dedans.entree.sols)}`);
    ok((dedans.entree.tuiles || []).length === 256,
       `et les ${(dedans.entree.tuiles || []).length} tuiles de la carte`);
    const ob = (dedans.entree.obstacles || []).find((q) => q.bat === objJ);
    ok(!!ob, `l objet pose est devenu un bloc qui porte son nom (${objJ})`);
    ok(!!ob && ob.r > 0, `avec un rayon qui bloque : ${ob && ob.r}`);
    ok(dedans.entree.peuplement === undefined || !(dedans.entree.peuplement || []).length,
       'et aucune creature : une carte est un endroit ou l on marche');
  }
  /* ---- CE QUI EST DESSINE ---- */
  await p.waitForTimeout(1500);
  const peints = await p.evaluate(() => (window.__vu || {}).dessines || {});
  ok((peints['ground_' + solJ + '.webp'] || 0) > 10,
     `le sol de la carte est peint case par case`
     + ` (${peints['ground_' + solJ + '.webp'] || 0} fois)`);
  ok((peints['obj_' + objJ + '.webp'] || 0) > 0,
     `et la planche de l objet est dessinee dans le monde`
     + ` (${peints['obj_' + objJ + '.webp'] || 0} fois)`);

  ok(erreurs.length === 0, 'aucune erreur de page' + (erreurs.length ? ' — ' + erreurs[0] : ''));
  await nav.close(); site.stop();
  console.log(`\ncarte_page.test.js : ${n} verifications, ${echecs} echec(s)`);
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.log('  RATE essai interrompu : ' + (e && e.message)); process.exit(1); });
