/* LE TELEPHONE — ce qu'on voit, et ce avec quoi on marche.
 *
 * Deux choses rapportees, deux causes sans rapport :
 *
 * 1. ON NE VOIT PAS ASSEZ LOIN. Le zoom n'etait borne qu'en HAUT et bloque a
 *    1 en bas : la fenetre d'un telephone fait six cent quarante pixels de
 *    haut, le calcul rendait 0,64, la borne le remontait a 1 — et l'ecran
 *    montrait six cent quarante unites de monde la ou un ordinateur en montre
 *    mille. Le plus petit ecran voyait le MOINS loin, exactement l'inverse de
 *    ce qu'il faut.
 * 2. QUATRE BOUTONS, C'EST QUATRE DIRECTIONS. Au clavier on en tient deux a
 *    la fois ; au pouce, une seule. Contourner un rocher demandait deux
 *    mouvements en escalier pendant qu'on se faisait tirer dessus.
 *
 * On ne lit aucune variable de la page — elles vivent dans une fermeture. On
 * mesure ce qui est PEINT et ou le personnage arrive.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('mobile_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('mobile_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/mob-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  const { Realm } = require(path.join(SERVEUR, 'realm'));
  /* ---- IL Y A PLUSIEURS MONDES OUVERTS ----
   * Cet espion gardait « la derniere simulation qui a battu ». Il n y en avait
   * qu une ; depuis la deuxieme porte du Nexus il y en a deux, et `monde0`
   * valait une fois sur deux celle ou notre joueur n est pas. On les collecte
   * toutes et l on designe la bonne par LE JOUEUR QU ELLE CONTIENT. */
  let monde0 = null; const ouverts = new Set(); const pas0 = Realm.prototype.pas;
  Realm.prototype.pas = function (dt) {
    if (!this.plan) ouverts.add(this);
    return pas0.call(this, dt);
  };
  const mondeDe = (a) => [...ouverts].find((r) => r.joueurs.has(String(a).toLowerCase()))
                      || [...ouverts][0] || null;
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  await new Promise((r) => setTimeout(r, 1400));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const erreurs = [];

  /* Un vrai telephone : ecran etroit, DOIGT. C'est `pointer: coarse` qui
     decide du zoom et du manche, pas la largeur — une tablette large au doigt
     a le meme besoin. */
  const ctx = await nav.newContext({ viewport: { width: 390, height: 780 },
                                     hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) {
      const s = (pr === undefined) ? new N(u) : new N(u, pr);
      s.__m = []; s.__out = [];
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      const env = s.send.bind(s);
      s.send = function (d) { try { s.__out.push(JSON.parse(d)); } catch (x) {} return env(d); };
      window.__s.push(s); return s;
    }
    C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
    window.WebSocket = C;
    /* ---- ON NOTE LE ZOOM, ET LUI SEUL ----
     * L'echelle passee au canevas est le seul endroit ou le zoom se lise. Mais
     * la page en pose PLUSIEURS par image : le monde fait `scale(DPR)` puis
     * `scale(zoom)` par-dessus, et le bandeau du lieu, les fleches de portail
     * lointain et les textes qui montent refont chacun un `scale(DPR)` APRES.
     * Garder la derniere revenait donc a lire le pixel-ratio — 2 — des qu'un
     * chiffre de degats montait a l'ecran. L'essai annoncait alors « au doigt
     * on voit 390 unites » et accusait le zoom d'un crime commis par un
     * dommage affiche.
     * Ce qui distingue le zoom n'est pas sa VALEUR, c'est d'ou il part : il
     * s'applique alors que la transformation courante vaut deja DPR, tandis
     * que les autres partent de l'identite. On regarde donc la transformation
     * AVANT de la modifier. */
    window.__zoom = [];
    const S = CanvasRenderingContext2D.prototype.scale;
    CanvasRenderingContext2D.prototype.scale = function (x, y) {
      if (this.canvas && this.canvas.isConnected && x === y && this.getTransform) {
        const t = this.getTransform();
        const dpr = window.devicePixelRatio || 1;
        if (Math.abs(t.a - dpr) < 1e-6 && Math.abs(t.b) < 1e-6) window.__zoom.push(x);
      }
      return S.apply(this, arguments);
    };
  });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));

  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  /* ---- ON ENTRE DANS LE MONDE POUR DE VRAI ----
   * La position du personnage au Nexus ne se lit nulle part : elle vit dans une
   * fermeture, et la camera se bloque au bord de la carte. Dans le monde de
   * combat, le SERVEUR la connait — c'est la seule mesure qui ne soit pas une
   * supposition sur ce que la page a bien voulu dessiner. */
  const w = ethers.Wallet.createRandom();
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, sg]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello'))
    .send(JSON.stringify({ type: 'login', message: m, signature: sg })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(900);
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForTimeout(1600);
  const addr = w.address.toLowerCase();
  monde0 = mondeDe(addr);
  ok(!!monde0 && monde0.joueurs.has(addr), 'on est dans le monde de combat');

  /* ================== 1. LE MANCHE A REMPLACE LA CROIX ================== */
  console.log('\n-- le manche --');
  const manche = await p.evaluate(() => {
    const e = document.getElementById('nxPad');
    if (!e) return { err: 'pas de nxPad' };
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    const socle = e.querySelector('.socle'), pom = e.querySelector('.pommeau');
    return { visible: cs.display !== 'none',
             boutons: e.querySelectorAll('button').length,
             socle: !!socle, pommeau: !!pom,
             zone: { w: Math.round(r.width), h: Math.round(r.height),
                     bas: Math.round(innerHeight - r.bottom) },
             socleR: socle ? Math.round(socle.getBoundingClientRect().width) : 0 };
  });
  ok(manche.visible, 'le manche est a l\'ecran sur telephone');
  ok(manche.boutons === 0, `et il ne reste aucun bouton de croix (${manche.boutons})`);
  ok(manche.socle && manche.pommeau, 'il a un socle et un pommeau');
  /* ---- LA ZONE DE PRISE EST TOUTE LA MOITIE GAUCHE ----
   * Elle mesurait deux cent quarante pixels sur cent soixante-six, dans le
   * coin. Sur un telephone qu'on tient d'une main, ce coin n'est pas ou tombe
   * le pouce : il fallait REGARDER pour le trouver, et pendant qu'on regarde
   * son pouce on ne regarde pas ce qui nous tire dessus. */
  ok(manche.zone.h > 780 * 0.8,
     `elle couvre la hauteur de l'ecran (${manche.zone.h} px)`);
  ok(manche.zone.w > manche.socleR,
     `et elle est plus large que le socle (${manche.zone.w} px pour un socle de ${manche.socleR})`);

  /* ---- ET LE MANCHE VIENT SOUS LE POUCE ----
   * C'est LA question, celle qui a fait tout ce remaniement : « on peut poser
   * le doigt ou on veut ». On la pose donc au navigateur — on appuie a un
   * endroit arbitraire de la zone et l'on regarde ou le socle a atterri. Un
   * essai qui se contenterait de lire la taille de la zone aurait dit oui a un
   * manche reste cloue dans son coin. */
  const flottant = await p.evaluate(async () => {
    const pave = document.getElementById('nxPad');
    const socle = pave.querySelector('.socle');
    const b = pave.getBoundingClientRect();
    const centreDe = (e) => { const r = e.getBoundingClientRect();
                              return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    const repos = centreDe(socle);
    /* Haut et a droite du coin de repos : deux ecarts, pour qu'un manche qui
       ne bougerait que dans un sens ne passe pas. */
    const cible = { x: b.left + b.width * 0.7, y: b.top + b.height * 0.35 };
    const ev = (t, x, y) => pave.dispatchEvent(new PointerEvent(t, { bubbles: true,
      pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
    const vu = () => Number(getComputedStyle(pave).opacity);
    /* Le fondu dure un dixieme de seconde : lu tout de suite, on lirait la
       valeur de depart et l'essai dirait que rien ne s'allume. */
    const auRepos = vu();
    ev('pointerdown', cible.x, cible.y);
    const pendant = centreDe(socle);
    await new Promise((r) => setTimeout(r, 260));
    const pendantVu = vu();
    ev('pointerup', cible.x, cible.y);
    await new Promise((r) => setTimeout(r, 260));
    return { repos, cible, pendant, apres: centreDe(socle),
             auRepos, pendantVu, apresVu: vu() };
  });
  const ecartPouce = Math.hypot(flottant.pendant.x - flottant.cible.x,
                                flottant.pendant.y - flottant.cible.y);
  const bougeDuRepos = Math.hypot(flottant.pendant.x - flottant.repos.x,
                                  flottant.pendant.y - flottant.repos.y);
  ok(bougeDuRepos > 60,
     `le manche quitte son coin pour venir au doigt (${Math.round(bougeDuRepos)} px)`);
  ok(ecartPouce < 4,
     `et il se centre PILE dessus (${Math.round(ecartPouce)} px d'ecart)`);
  /* ---- ET IL RETOURNE A SON POINT DE DEPART ----
   * Non pour se montrer — il ne se montre jamais — mais pour que la geometrie
   * soit definie avant la prochaine prise : c'est le centre du socle qui donne
   * la direction et sa largeur qui donne le rayon. Laisse ou le dernier doigt
   * l'a pose, il resterait juste ; mais un point de depart connu est ce qui
   * rend cette mesure-ci reproductible. */
  const retour = Math.hypot(flottant.apres.x - flottant.repos.x,
                            flottant.apres.y - flottant.repos.y);
  ok(retour < 4, `une fois lache, il revient a son point de depart (${Math.round(retour)} px)`);
  /* ---- INVISIBLE AU REPOS, VISIBLE SOUS LE POUCE ----
   * Les deux extremes ont ete essayes et les deux etaient faux. Un anneau
   * laisse dans le coin se lit comme une tache sur le decor, pas comme une
   * commande. Mais rien du tout ne marche pas non plus : le doigt cache le
   * CENTRE, pas le pourtour, et sans le pourtour on ne voit plus ni de combien
   * on pousse ni ou est le point de depart quand le pouce a derive.
   * C'est l'OPACITE CALCULEE qu'on lit, pas une regle de style : elle seule dit
   * ce que l'oeil recoit apres les transitions et les classes. Les trois
   * moments sont verifies separement — un manche visible en permanence, comme
   * un manche jamais visible, passerait une lecture unique. */
  ok(flottant.auRepos < 0.02,
     `au repos il est invisible (opacite ${flottant.auRepos})`);
  ok(flottant.pendantVu > 0.9,
     `il apparait sous le pouce (opacite ${flottant.pendantVu})`);
  ok(flottant.apresVu < 0.02,
     `et il repart quand on lache (opacite ${flottant.apresVu})`);


  /* ================== 2. IL FAIT MARCHER, DANS TOUTES LES DIRECTIONS ================== */
  console.log('\n-- huit directions, pas quatre --');
  const centre = await p.evaluate(() => {
    const r = document.querySelector('#nxPad .socle').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  });
  /* On pousse dans huit sens et l'on regarde ou le personnage arrive. Le
     Nexus suffit : c'est le meme code de deplacement, et il n'y a pas de
     monstres pour brouiller la mesure. */
  /* ---- ALTERNES, ET SANS REMISE EN PLACE ----
   * On repositionnait le joueur COTE SERVEUR entre chaque sens. Le client, lui,
   * ne saute pas : il recoit une correction et la rattrape en douceur. Au bout
   * de trois tours les deux ne parlaient plus du meme endroit, le serveur
   * refusait les pas comme une teleportation, et l'essai concluait que le
   * manche ne marche pas vers l'ouest.
   * On mesure donc le DEPLACEMENT depuis la ou l'on est, et l'on alterne les
   * sens opposes pour rester autour du point de depart. */
  const sens = [['est', 1, 0], ['ouest', -1, 0],
                ['sud-est', 0.71, 0.71], ['nord-ouest', -0.71, -0.71],
                ['sud', 0, 1], ['nord', 0, -1],
                ['sud-ouest', -0.71, 0.71], ['nord-est', 0.71, -0.71]];
  /* Un coin degage, cherche et non ecrit en dur : les rochers sont tires au
     sort a chaque demarrage, et un point choisi a la main se retrouverait un
     jour contre un mur — l'essai dirait alors « le manche ne marche pas vers
     l'est » alors qu'il y a un rocher a l'est. */
  const M = require(path.join(SERVEUR, 'monde'));
  const jm = monde0.joueurs.get(addr);
  let libre = null;
  for (let x = 1400; x < M.MONDE.w - 1400 && !libre; x += 173) {
    for (let y = 1400; y < M.MONDE.h - 1400 && !libre; y += 173) {
      let bon = true;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        for (let t = 0; t <= 260 && bon; t += 40) {
          if (M.bloque(monde0.obstacles, x + dx * t, y + dy * t, 60)) bon = false;
        }
      }
      if (bon) libre = { x, y };
    }
  }
  ok(!!libre, 'un endroit degage dans les huit sens');

  /* ---- ON MESURE CE QUE LA PAGE ANNONCE, PAS CE QUE LE SERVEUR RETIENT ----
   *
   * La question posee est « le manche fait-il marcher dans le sens ou l'on
   * pousse ? », et c'est la PAGE qui deplace le personnage — le serveur ne fait
   * que borner. Mesurer chez lui melangeait deux choses : le manche, et la
   * reconciliation qui ramene doucement la page vers la position bornee. Sur un
   * navigateur sans fenetre visible, la boucle de dessin est ralentie, la page
   * demande plus que la borne, se fait rattraper, et l'ecart s'accumule d'un
   * sens a l'autre — l'essai concluait alors que le manche cesse de repondre au
   * bout de cinq poussees.
   * `realmMove` porte la position que la page annonce, dix fois par seconde.
   * C'est le manche, sans rien d'autre. */
  jm.x = libre.x; jm.y = libre.y;
  await p.waitForTimeout(1500);
  /* ---- LA DERNIERE ANNONCE, ET DE QUEL FIL ----
   * `__s[0]` etait le PREMIER fil ouvert. Une reconnexion en ouvre un second
   * et le premier se fige : on lisait alors eternellement la meme position.
   * On prend le fil qui parle, et l'on compte ses annonces — c'est ce compte
   * qui dit « une nouvelle est partie », la ou un sommeil de deux cent
   * soixante millisecondes ne faisait que l'esperer. */
  const annonce = () => p.evaluate(() => {
    for (let i = window.__s.length - 1; i >= 0; i--) {
      const t = window.__s[i].__out.filter((x) => x.type === 'realmMove');
      if (t.length) return { x: t[t.length - 1].x, y: t[t.length - 1].y, n: t.length };
    }
    return null;
  });
  const attendUneAnnonce = async (depuis) => {
    try {
      await p.waitForFunction((k) => {
        for (let i = window.__s.length - 1; i >= 0; i--) {
          const c = window.__s[i].__out.filter((x) => x.type === 'realmMove').length;
          if (c) return c > k;
        }
        return false;
      }, depuis, { timeout: 5000 });
      return true;
    } catch (e) { return false; }
  };
  /* ---- ON RESTE DEBOUT PENDANT LA MESURE ----
   * Le monde de combat a des monstres, et ils tirent. Quand le personnage
   * tombe, le serveur envoie `realmMort` : la page revient au Nexus et cesse
   * d'annoncer sa position. Les sens qui restaient lisaient alors tous la MEME
   * derniere annonce et repondaient « d=0 » — un echec sur quatre, qui
   * accusait le manche d'un meurtre commis par un monstre.
   * La question posee ici est « le manche fait-il marcher dans les huit sens »,
   * pas « survit-on six secondes ». On tient donc le personnage debout, et l'on
   * verifie apres coup qu'aucune mort n'est venue brouiller la mesure. */
  const debout = setInterval(() => { try { jm.pv = jm.pvMax; } catch (e) {} }, 40);
  const rates8 = [];
  for (const [nom, ux, uy] of sens) {
    const depart = await annonce();
    if (!depart) { rates8.push(nom + ' (aucune position annoncee)'); continue; }
    await p.evaluate((q) => {
      const el = document.getElementById('nxPad');
      window.__ev = (t, x, y) => el.dispatchEvent(new PointerEvent(t, { bubbles: true,
        pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
      window.__ev('pointerdown', q.cx, q.cy);
      window.__ev('pointermove', q.cx + q.ux * q.r * 0.9, q.cy + q.uy * q.r * 0.9);
    }, { cx: centre.x, cy: centre.y, r: centre.r, ux, uy });
    /* ---- ON POUSSE JUSQU'A CE QU'IL AIT MARCHE, PAS PENDANT UN DELAI ----
     * Le deplacement se fait dans la boucle de DESSIN, et cette boucle depend
     * de la charge de la machine : sur un navigateur sans fenetre, quatre cent
     * cinquante millisecondes valaient tantot quatre-vingts unites de monde,
     * tantot onze — et l'essai declarait alors que le manche ne repond pas vers
     * le nord. On tient le pouce jusqu'a ce que le personnage ait franchi la
     * distance qu'on veut mesurer, ou qu'un delai large soit ecoule (auquel cas
     * la mesure d'apres dira honnetement qu'il n'a pas bouge). */
    const t0 = Date.now();
    let vue = depart;
    while (Date.now() - t0 < 6000) {
      await p.waitForTimeout(60);
      const a = await annonce();
      if (a) vue = a;
      if (Math.hypot(vue.x - depart.x, vue.y - depart.y) > 60) break;
    }
    await p.evaluate((q) => window.__ev('pointerup', q.x, q.y),
                     { x: centre.x + ux * centre.r * 0.9, y: centre.y + uy * centre.r * 0.9 });
    /* Et l'on attend une annonce DE PLUS, pas un delai : le dernier pas part
       avec la boucle suivante. */
    if (!(await attendUneAnnonce(vue.n))) { rates8.push(nom + ' (plus aucune annonce)'); continue; }
    const arrivee = await annonce();
    const dx = arrivee.x - depart.x, dy = arrivee.y - depart.y;
    const d = Math.hypot(dx, dy);
    /* Le PRODUIT SCALAIRE avec le sens demande : il vaut la distance parcourue
       si l'on est parti pile dans le bon sens, et il devient negatif si l'on
       est parti a l'oppose. Comparer les composantes une a une aurait laisse
       passer une diagonale a quarante-cinq degres de la demande. */
    const projete = dx * ux + dy * uy;
    if (!(d > 30 && projete > d * 0.9)) {
      rates8.push(`${nom} (${Math.round(dx)},${Math.round(dy)}, d=${Math.round(d)})`);
    }
  }
  ok(rates8.length === 0,
     `le personnage part dans les HUIT sens${rates8.length ? ' — rates : ' + rates8.join(' | ') : ''}`);

  /* ---- ET IL S'ARRETE QUAND ON LACHE ---- */
  await p.waitForTimeout(700);
  const arret = await annonce();
  await p.waitForTimeout(700);
  const encore = await annonce();
  ok(Math.hypot(encore.x - arret.x, encore.y - arret.y) < 12,
     `et il ne bouge plus une fois le pouce leve (${Math.round(Math.hypot(encore.x - arret.x, encore.y - arret.y))} u)`);
  /* ---- RIEN QU'ON TOUCHE NE SE POSE SUR LA MOITIE QUI FAIT MARCHER ----
   *
   * C'est la regle qui manquait, et son absence a coute un defaut signale par un
   * joueur : « si tu passes le doigt sur le pouvoir, ca coupe, il faut
   * rappuyer ». Le bouton de pouvoir avait ete pose « au milieu du bas » en
   * partant du centre de l'aire de jeu — et il se retrouvait de x = -10 a 116
   * sur une moitie gauche qui va de 0 a 121, donc ENTIEREMENT dedans. Un appui
   * qui tombe dessus n'atteint jamais le manche.
   * Les potions et la rangee du butin avaient le meme defaut. Il etait cache
   * tant que la zone du manche n'etait qu'un petit rectangle dans le coin :
   * c'est en l'etendant a tout l'ecran qu'on l'a cree, sans le voir.
   * On mesure donc le CHEVAUCHEMENT, pas la position de chacun. Une regle sur
   * une position se contourne au prochain deplacement ; celle-ci tient quel que
   * soit l'endroit choisi. */
  const surLaMarche = await p.evaluate(() => {
    /* On les allume de force : leur PLACE ne depend pas de l'etat du jeu, et
       c'est la place qu'on mesure. Attendre qu'un pouvoir existe et qu'un sac
       traine par terre ferait un essai qui ne verifie rien la plupart du
       temps — et qui dormirait le jour ou la regle casse. */
    for (const id of ['nxPow', 'nxPot', 'nxMaison', 'nxButinFlot']) {
      const e = document.getElementById(id); if (e) e.classList.add('on');
    }
    const pot = document.getElementById('nxPot');
    if (pot && !pot.children.length) pot.innerHTML = '<button data-pot="a"></button><button data-pot="b"></button>';
    const fl = document.getElementById('nxButinFlot');
    if (fl && !fl.children.length) fl.innerHTML = '<div class="fl"></div><div class="fl"></div>';
    const pad = document.getElementById('nxPad').getBoundingClientRect();
    const dedans = [];
    for (const id of ['nxPow', 'nxPot', 'nxMaison', 'nxButinFlot']) {
      const e = document.getElementById(id); if (!e) continue;
      const b = e.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (b.x < pad.x + pad.width && b.x + b.width > pad.x) {
        dedans.push(`${id} (${Math.round(b.x)}..${Math.round(b.x + b.width)})`);
      }
    }
    return { dedans, pad: `${Math.round(pad.x)}..${Math.round(pad.x + pad.width)}` };
  });
  ok(surLaMarche.dedans.length === 0,
     `aucun bouton ne se pose sur la moitie qui fait marcher (${surLaMarche.pad})` +
     (surLaMarche.dedans.length ? ' — dessus : ' + surLaMarche.dedans.join(', ') : ''));

  /* ================== 2 ter. LE POUCE TRAVERSE UN BOUTON ==================
   *
   * Un joueur l'a decrit ainsi : « si tu passes le doigt sur le pouvoir, ca
   * coupe et ca s'arrete, il faut rappuyer ». Les boutons ponctuels sont poses
   * en bas au milieu, au-dessus de la zone qui fait marcher, et le pouce qui
   * marche les traverse.
   * Le manche prend la capture du pointeur, ce qui devrait suffire. S'y fier
   * SEULE, c'est parier que rien ne viendra la reprendre — un bouton dessous,
   * un navigateur qui l'annule a sa facon, le doigt qui sort dans la moitie
   * droite. Et le pire n'est pas le personnage qui se fige : c'est le LACHER
   * qui n'arrive jamais et le personnage qui continue tout seul.
   *
   * ---- CE QUE CET ESSAI PROUVE, ET CE QU'IL NE PROUVE PAS ----
   * `dispatchEvent` livre a l'element qu'on nomme, sans test de superposition :
   * un essai ecrit comme ca serait vert quoi qu'il arrive. On passe donc par le
   * protocole du navigateur, qui envoie un vrai contact suivant le meme chemin
   * qu'un pouce. Et l'on debranche `setPointerCapture` par-dessus, pour ne
   * dependre d'aucune capture explicite.
   * Il faut dire la limite : cet essai ne DISCRIMINE pas. Verifie en remettant
   * l'ecoute sur la zone au lieu de la fenetre, il reste vert — parce que ce
   * navigateur-ci donne aux contacts tactiles une capture IMPLICITE, que rien
   * ici ne peut retirer, et que la zone recoit donc tout le geste de toute
   * facon. Le defaut signale ne se reproduit pas dans ce navigateur.
   * Ce qu'il garde est reel quand meme : un vrai doigt traverse un bouton, le
   * personnage marche, et le lacher est entendu. Il attraperait un bouton qui
   * se mettrait a avaler l'evenement, ou un `pointerleave` ajoute par
   * distraction. La cause du defaut signale, elle, est geometrique et se
   * verifie juste au-dessus. */
  console.log('\n-- le pouce traverse un bouton --');
  const cdp = await ctx.newCDPSession(p);
  const touche = (type, x, y) => cdp.send('Input.dispatchTouchEvent',
    { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const trajet = await p.evaluate(() => {
    const pave = document.getElementById('nxPad');
    const b = pave.getBoundingClientRect();
    /* Le MEME plan que les vrais boutons, relu sur l'un d'eux : ecrit en dur,
       il aurait cesse de les representer le jour ou ils changent d'etage. */
    const z = getComputedStyle(document.getElementById('nxMaison')).zIndex;
    const faux = document.createElement('div');
    faux.id = 'fauxBoutonEssai';
    faux.style.cssText = 'position:absolute;z-index:' + z + ';width:110px;height:52px;left:' +
      Math.round(b.x + b.width * 0.08) + 'px;top:' + Math.round(b.y + b.height - 170) + 'px;';
    document.getElementById('nxWrap').appendChild(faux);
    const f = faux.getBoundingClientRect();
    return { plan: z,
             x0: Math.round(b.x + b.width * 0.6), y0: Math.round(b.y + b.height * 0.42),
             fx: Math.round(f.x + f.width / 2), fy: Math.round(f.y + f.height / 2) };
  });
  console.log('   bouton temoin au plan ' + trajet.plan + ' ' + JSON.stringify(trajet));
  const tientLeManche = () => p.evaluate(() =>
    document.getElementById('nxPad').classList.contains('on'));
  /* La capture debranchee : les mouvements partent alors vers l'element qui se
     trouve sous le doigt — le bouton temoin, puis la moitie droite — et seul
     qui ecoute la FENETRE les entend encore. */
  await p.evaluate(() => {
    window.__vraieCapture = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function () {};
  });
  const avantTraversee = await annonce();
  await touche('touchStart', trajet.x0, trajet.y0);
  await p.waitForTimeout(90);
  let laches = [];
  for (let i = 1; i <= 10; i++) {
    await touche('touchMove', Math.round(trajet.x0 + (trajet.fx - trajet.x0) * i / 10),
                              Math.round(trajet.y0 + (trajet.fy - trajet.y0) * i / 10));
    await p.waitForTimeout(60);
    if (!(await tientLeManche())) laches.push(i);
  }
  const surLeBouton = await tientLeManche();
  await touche('touchEnd', trajet.fx, trajet.fy);
  await p.waitForTimeout(150);
  const relache = !(await tientLeManche());
  await attendUneAnnonce(avantTraversee.n);
  const apresTraversee = await annonce();
  await p.evaluate(() => {
    const e = document.getElementById('fauxBoutonEssai'); if (e) e.remove();
    if (window.__vraieCapture) Element.prototype.setPointerCapture = window.__vraieCapture;
  });

  ok(laches.length === 0,
     `le manche tient pendant toute la traversee${laches.length ? ' — laches aux etapes ' + laches.join(', ') : ''}`);
  ok(surLeBouton, 'et il tient encore une fois le doigt POSE sur le bouton');
  /* L'autre moitie du defaut, et la plus vicieuse : un lacher qui se perd
     laisse le personnage marcher tout seul jusqu'a ce qu'on rappuie. */
  ok(relache, 'et le lacher est entendu, meme par-dessus le bouton');
  const parcouru = Math.hypot(apresTraversee.x - avantTraversee.x,
                              apresTraversee.y - avantTraversee.y);
  ok(parcouru > 30, `le personnage a bel et bien marche pendant la traversee (${Math.round(parcouru)} u)`);

  /* ================== 2 bis. LA MOITIE DROITE TIRE ==================
   *
   * Le bouton rond de quatre-vingt-seize pixels dans le coin avait le meme
   * defaut que le manche fixe, en pire : on ne tire pas une fois, on tient le
   * tir pendant tout un combat, et le pouce devait rester pose sur une cible
   * qu'il ne voit pas. Rate d'un centimetre, on ne tire pas, et rien ne le dit.
   * On verifie donc DEUX choses qu'un simple coup d'oeil au style ne dirait
   * pas : que le bouton n'est plus la (sinon il resterait deux facons de tirer,
   * une de trop), et qu'un pouce pose n'importe ou dans cette moitie fait
   * partir de vrais tirs. */
  console.log('\n-- la moitie droite tire --');
  ok(await p.evaluate(() => !document.getElementById('nxTir')),
     'le bouton de tir a disparu, il n\'y a plus deux facons de tirer');
  const zoneTir = await p.evaluate(() => {
    const e = document.getElementById('nxVise');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { on: e.classList.contains('on'),
             x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
  });
  ok(!!zoneTir && zoneTir.on, 'la moitie droite est active dans le monde de combat');
  ok(!!zoneTir && zoneTir.h > 780 * 0.8,
     `et elle couvre la hauteur de l'ecran (${zoneTir && zoneTir.h} px)`);
  const compteTirs = () => p.evaluate(() => {
    for (let i = window.__s.length - 1; i >= 0; i--) {
      const t = window.__s[i].__out.filter((x) => x.type === 'realmTir');
      if (t.length) return t.length;
    }
    return 0;
  });
  const anglesTires = (depuis) => p.evaluate((k) => {
    for (let i = window.__s.length - 1; i >= 0; i--) {
      const t = window.__s[i].__out.filter((x) => x.type === 'realmTir');
      if (t.length) return t.slice(k).map((x) => x.a);
    }
    return [];
  }, depuis);

  /* Un appui SIMPLE, au hasard dans la moitie droite : il doit tirer. */
  const avantTir = await compteTirs();
  await p.evaluate((q) => {
    const el = document.getElementById('nxVise');
    window.__evt = (t, x, y) => el.dispatchEvent(new PointerEvent(t, { bubbles: true,
      pointerId: 13, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
    window.__evt('pointerdown', q.x, q.y);
  }, { x: zoneTir.x + zoneTir.w * 0.6, y: zoneTir.h * 0.7 });
  await p.waitForTimeout(700);
  const pendantTir = await compteTirs();
  await p.evaluate((q) => window.__evt('pointerup', q.x, q.y),
                   { x: zoneTir.x + zoneTir.w * 0.6, y: zoneTir.h * 0.7 });
  ok(pendantTir > avantTir,
     `un pouce pose n'importe ou dans la moitie droite tire (${pendantTir - avantTir} tirs)`);

  /* ---- ET GLISSER VISE ----
   * Sans ca, on ne peut tirer que sur l'ennemi le plus proche — donc jamais
   * sur le tireur du fond pendant qu'une chauve-souris vous colle. On glisse
   * vers le nord-est et l'on relit l'angle REELLEMENT envoye au serveur : ni
   * la direction du personnage (0 ou -PI/2) ni une cible automatique ne
   * donnent -PI/4, l'essai ne peut donc pas passer pour la mauvaise raison. */
  const CIBLE_A = -Math.PI / 4;
  await p.evaluate((q) => {
    const el = document.getElementById('nxVise');
    window.__evt = (t, x, y) => el.dispatchEvent(new PointerEvent(t, { bubbles: true,
      pointerId: 17, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
    window.__evt('pointerdown', q.x, q.y);
    window.__evt('pointermove', q.x + 90, q.y - 90);
  }, { x: zoneTir.x + zoneTir.w * 0.5, y: zoneTir.h * 0.6 });
  /* ---- ON COMPTE A PARTIR DU GLISSEMENT DEJA PRIS EN COMPTE ----
   * La pose du pouce tire DEJA, sur la cible automatique, et ce tir-la part
   * avant que le glissement n'ait ete lu. Compte dans l'echantillon, il faisait
   * tomber le taux a une chance sur deux quand la mesure ne recoltait que deux
   * tirs — l'essai accusait alors la visee a la main d'un tir qui ne la
   * concernait pas. On laisse passer une image, PUIS on ouvre le compte. */
  await p.waitForTimeout(180);
  const avantVisee = await compteTirs();
  await p.waitForTimeout(700);
  await p.evaluate((q) => window.__evt('pointerup', q.x + 90, q.y - 90),
                   { x: zoneTir.x + zoneTir.w * 0.5, y: zoneTir.h * 0.6 });
  const angles = await anglesTires(avantVisee);
  ok(angles.length > 0, `le glissement tire aussi (${angles.length} tirs)`);
  if (angles.length) {
    const bons = angles.filter((a) =>
      Math.abs(Math.atan2(Math.sin(a - CIBLE_A), Math.cos(a - CIBLE_A))) < 0.35).length;
    ok(bons > angles.length * 0.8,
       `et ${bons} sur ${angles.length} partent dans le sens du glissement ` +
       `(${angles.slice(0, 4).map((a) => a.toFixed(2)).join(', ')} pour ${CIBLE_A.toFixed(2)})`);
  }

  /* On lache la perfusion SEULEMENT ici : une mort pendant l'arret aurait fige
     l'annonce, et « il ne bouge plus » serait devenu vrai pour la mauvaise
     raison. Et l'on dit si une mort est quand meme passee — sans ce temoin, la
     mesure d'a cote mentirait sans que rien ne le signale. */
  clearInterval(debout);
  const estMort = await p.evaluate(() =>
    window.__s.some((x) => x.__m.some((m) => m.type === 'realmMort')));
  ok(!estMort, 'aucune mort n\'est venue brouiller la mesure du manche');

  /* ================== 3. ON VOIT PLUS LOIN ================== */
  console.log('\n-- ce qu on voit --');
  const zoomTel = await p.evaluate(() => {
    const z = window.__zoom.filter((x) => x > 0 && x < 8);
    return z.length ? z[z.length - 1] : null;
  });
  ok(zoomTel !== null, 'le zoom se mesure');
  ok(zoomTel < 1, `au doigt, il descend SOUS 1 (${zoomTel && zoomTel.toFixed(2)})`);
  ok(zoomTel >= 0.38, `mais pas sous 0,38, ou plus rien ne se distingue (${zoomTel && zoomTel.toFixed(2)})`);
  const combien = () => p.evaluate(() => {
    const z = window.__zoom.filter((x) => x > 0 && x < 8);
    const zz = z.length ? z[z.length - 1] : null;
    if (!zz) return null;
    return Math.round((document.querySelector('canvas').height /
                       (window.devicePixelRatio || 1)) / zz);
  });
  const vu = await combien();
  ok(vu > 1200, `on voit ${vu} unites de monde de haut (un ordinateur en voit ~900)`);

  /* ---- ET C EST UN REGLAGE ----
   * « Je veux voir plus loin » n a pas de bonne reponse universelle : plus
   * large montre les creatures plus tot, plus serre les garde lisibles. Ce qui
   * se verifie n est donc pas UN chiffre, c est que le curseur AGIT — et qu il
   * se souvient. Un reglage qu on refait a chaque visite n en est pas un. */
  console.log('\n-- le curseur de distance de vue --');
  const regle = async (v) => {
    await p.evaluate((val) => {
      const e = document.getElementById('nxVuePct');
      e.value = String(val);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      window.__zoom.length = 0;
    }, v);
    await p.waitForTimeout(400);
    return combien();
  };
  const large = await regle(1800);
  const serre = await regle(900);
  ok(large !== null && serre !== null, 'le curseur existe et le zoom se remesure');
  ok(large > serre + 200,
     `pousse a fond on voit BIEN plus loin (${large} contre ${serre})`);
  /* La borne mord sur un petit ecran : le chiffre affiche doit etre celui
     qu on VOIT, pas celui qu on a demande — sinon on croit que le reglage a
     cesse de repondre alors qu il est au bout de sa course. */
  await regle(1800);
  const affiche = await p.evaluate(() =>
    Number((document.getElementById('nxVueVal') || {}).textContent));
  const reel = await combien();
  ok(Math.abs(affiche - reel) <= 40,
     `et le chiffre affiche est celui qu on voit (${affiche} pour ${reel})`);

  /* ---- IL SURVIT A LA VISITE SUIVANTE ---- */
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const garde = await p.evaluate(() =>
    Number((document.getElementById('nxVuePct') || {}).value));
  ok(garde === 1800, `le choix est garde d une visite a l autre (${garde})`);
  await p.evaluate(() => { try { localStorage.removeItem('swogeNexusVue'); } catch (e) {} });

  /* ---- ET A LA SOURIS, RIEN NE CHANGE ----
   * Le zoom sous 1 est pour le DOIGT. L'appliquer partout aurait rendu le
   * pixel art flou sur un ecran ou personne ne s'en plaignait. */
  const ctx2 = await nav.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();
  await p2.addInitScript(function () {
    /* Meme espion qu'au doigt, meme raison : voir l'entete de l'autre. */
    window.__zoom = [];
    const S = CanvasRenderingContext2D.prototype.scale;
    CanvasRenderingContext2D.prototype.scale = function (x, y) {
      if (this.canvas && this.canvas.isConnected && x === y && this.getTransform) {
        const t = this.getTransform();
        const dpr = window.devicePixelRatio || 1;
        if (Math.abs(t.a - dpr) < 1e-6 && Math.abs(t.b) < 1e-6) window.__zoom.push(x);
      }
      return S.apply(this, arguments);
    };
  });
  await p2.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
                { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1800);
  const zoomSouris = await p2.evaluate(() => {
    const z = window.__zoom.filter((x) => x > 0 && x < 8);
    return z.length ? z[z.length - 1] : null;
  });
  ok(zoomSouris >= 1, `a la souris il reste a 1 au moins (${zoomSouris})`);
  const pad = await p2.evaluate(() => {
    const e = document.getElementById('nxPad');
    return e ? getComputedStyle(e).display : 'absent';
  });
  ok(pad === 'none', `et le manche ne s'affiche pas (${pad})`);

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nmobile_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
