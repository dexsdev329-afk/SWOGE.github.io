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
  await p.evaluate((cm) => {
    const g = document.getElementById('nxMapGrille');
    const r = g.getBoundingClientRect();
    const dx = 90 * r.width / cm.W;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 31, clientX: x, clientY: y }));
    g.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 31, clientX: x + dx, clientY: y }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 31 }));
  }, { W: vueAvantMain.W });
  await p.waitForTimeout(400);
  const vueApresMain = await cadre();
  ok(Math.abs((vueApresMain.x0 - vueAvantMain.x0) - 90) <= 3,
     `la main deplace la carte de ${Math.round(vueApresMain.x0 - vueAvantMain.x0)} px pour 90 demandes`);
  ok(Math.round(vueApresMain.p * 100) === Math.round(vueAvantMain.p * 100),
     'et ne change pas le zoom en le faisant');
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
    const cel = (dt.carte.cases || []).find((q) => q.c === iso.cc && q.l === iso.ll);
    eq(cel && cel.a, 1, 'et la case porte son quart de tour');
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
