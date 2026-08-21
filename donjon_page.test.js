/* LE DONJON, VU DE LA PAGE — de la mort d'Optimus au retour dans le monde.
 *
 * Le serveur decide de tout. Ce qui reste a la page, ce sont exactement les
 * choses qui se cassent en silence :
 *
 * 1. LA PORTE SE VOIT. Elle s'ouvre a cent quatre-vingt-dix unites derriere une
 *    creature qu'on regardait mourir, au milieu des eclats et des chiffres de
 *    degats. Si elle n'est pas dessinee, on la manque, on s'en va, et le donjon
 *    qu'on vient de meriter se referme sans qu'on ait su qu'il existait.
 * 2. ET ON SAIT PAR OU. Une porte qui s'ouvre a l'autre bout de la carte n'est
 *    meme pas dans l'etat qu'on recoit — la portee s'arrete a 1400 unites. La
 *    fleche au bord de l'ecran est la seule chose qui separe « un portail
 *    existe quelque part » de « c'est par la, il reste deux minutes ».
 * 3. LE BOUTON N'APPARAIT QUE DESSUS. C'est tout ce qui fait qu'entrer est un
 *    CHOIX. Une porte qui aspirerait en marchant dessus enverrait dans le
 *    donjon le plus dur du jeu quelqu'un qui traversait pour ramasser un sac.
 * 4. LE DONJON A L'AIR D'UN INTERIEUR. Autre sol, autres murs, et du NOIR
 *    autour. Un sol de pierre etale jusqu'a l'horizon donnerait l'impression
 *    d'un deuxieme monde ouvert, et les murs n'enfermeraient plus rien.
 * 5. ON PEUT TOUJOURS RESSORTIR, ET ON RESSORT LA OU L'ON EST ENTRE.
 * 6. AUCUNE IMAGE NE MANQUE. Un 404 ne casse rien de visible — le mur reste
 *    vide, le jeu continue — et c'est bien le probleme.
 *
 * Comme partout ici : on ne lit aucune variable de la page — elles vivent dans
 * une fermeture. On enregistre ce qui est PEINT et ce qui est ENVOYE.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('donjon_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('donjon_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const manquants = [];
/* Ce que la page a DEMANDE. Un dessin peut ne pas etre peint pour dix raisons
   (hors champ, pas encore decode, une image de plus dans une planche) ; ce qu'il
   ne peut pas faire, c'est etre demande sans qu'on l'ait choisi. C'est donc le
   signal le plus sur pour « la page sait quel sol poser ici ». */
const servis = [];
function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp3': 'audio/mpeg' };
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const f = path.join(racine, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { manquants.push(q.url.split('?')[0]); r.writeHead(404); r.end(); return; }
        servis.push(q.url.split('?')[0]);
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/donjon-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.DEV_FAUCET = '1';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);

  /* ---- ON ATTRAPE LA SIMULATION DU MONDE OUVERT ----
   * Pour y poser un Optimus. L'alternative — attendre qu'il naisse dans la lave
   * et l'y trouver — ferait un essai qui dure des heures et qui echoue au
   * hasard. On ne triche pas sur le RESULTAT : c'est le vrai serveur qui
   * l'abat, sur un vrai tir, avec ses vrais evenements.
   * On ne prend que le monde ouvert : `plan` est ce qui distingue un donjon, et
   * attraper une simulation de donjon nous ferait poser Optimus dedans. */
  /* ---- ET LE MOTEUR, POUR DONNER UNE VRAIE ARME ----
   * Un personnage qui vient d'etre achete se bat au POING : cent cinquante
   * unites de portee. Optimus voit a neuf cents et frappe au contact pour cent
   * quatre-vingt-dix ; le poser assez pres pour qu'un poing l'atteigne, c'est le
   * poser assez pres pour qu'il tue le personnage avant que le premier
   * projectile n'arrive. La premiere version de cet essai le faisait, et disait
   * « la porte n'est pas dessinee » — elle l'etait tres bien, on etait mort.
   * On lui donne donc une lame du CATALOGUE (portee 320) et on l'equipe par la
   * vraie route : la page et le serveur parlent alors de la meme arme. */
  const { Game } = require(path.join(SERVEUR, 'game'));
  let moteur = null; const _p0 = Game.prototype._p;
  Game.prototype._p = function (a) { moteur = this; return _p0.call(this, a); };
  const { Realm } = require(path.join(SERVEUR, 'realm'));
  let monde0 = null, donjon0 = null;
  const pas0 = Realm.prototype.pas;
  Realm.prototype.pas = function (dt) {
    /* `plan` est ce qui distingue un donjon d'un monde. On garde les deux : le
       monde ouvert pour y poser Optimus, le donjon pour savoir ou se trouve le
       personnage quand il y marche. */
    if (this.plan) donjon0 = this; else monde0 = this;
    return pas0.call(this, dt);
  };

  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const M = require(path.join(SERVEUR, 'monde'));
  const boutique = require(path.join(SERVEUR, 'boutique'));
  /* La piece vient du CATALOGUE, pas de notre imagination : un objet invente
     ferait demander a la page une image qui n'existe pas, et l'essai passerait
     quand meme — un item sans dessin ne fait pas de bruit. */
  const ARME = boutique.ITEMS.concat(boutique.ITEMS_DROP)
    .find((o) => o.famille === 'lame' && o.rarete === 'commun');
  await new Promise((r) => setTimeout(r, 1500));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const portefeuille = ethers.Wallet.createRandom();
  const erreurs = [];

  const p = await nav.newPage({ viewport: { width: 1280, height: 800 } });
  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) {
      const s = (pr === undefined) ? new N(u) : new N(u, pr);
      s.__m = [];
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      s.__out = [];
      const env = s.send.bind(s);
      s.send = function (d) { try { s.__out.push(JSON.parse(d)); } catch (x) {} return env(d); };
      window.__s.push(s); return s;
    }
    C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
    window.WebSocket = C;

    window.__image = 0;
    (function compte() { window.__image++; requestAnimationFrame(compte); })();
    window.__peint = [];
    /* ---- LES DEUX FORMES DE drawImage ----
     * NEUF arguments pour ce qui se decoupe dans une planche — une creature, un
     * sac, une porte. CINQ pour ce qui se pose en entier : les tuiles de sol.
     * N'espionner que la premiere forme faisait dire a l'essai que le sol du
     * donjon n'etait jamais peint ; il l'etait, on ne le regardait pas. */
    const D = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img) {
      const n = arguments.length;
      if (n === 9 || n === 5) {
        const src = (img && (img.currentSrc || img.src)) || '';
        const bouts = String(src).split('?')[0].split('/');
        window.__peint.push({ src: bouts[bouts.length - 1],
                              dossier: bouts[bouts.length - 2] || '',
                              dx: arguments[n === 9 ? 5 : 1], dy: arguments[n === 9 ? 6 : 2],
                              dw: arguments[n === 9 ? 7 : 3], dh: arguments[n === 9 ? 8 : 4],
                              f: window.__image,
                              ecran: !!(this.canvas && this.canvas.isConnected) });
        if (window.__peint.length > 40000) window.__peint.splice(0, 20000);
      }
      return D.apply(this, arguments);
    };
  });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));

  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await portefeuille.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);

  /* Un personnage, achete pour de bon : sans lui le serveur refuse l'entree, et
     il a raison — on n'entre pas dans le monde en spectateur. */
  await p.evaluate(async () => {
    const s = window.__s[0];
    for (let i = 0; i < 16; i++) { s.send(JSON.stringify({ type: 'devCredit' })); await new Promise((r) => setTimeout(r, 60)); }
    await new Promise((r) => setTimeout(r, 400));
    s.send(JSON.stringify({ type: 'skinBuy', id: 'andy' }));
  });
  await p.waitForTimeout(1500);
  /* L'arme dans le sac, puis equipee par la route du jeu. */
  ok(!!moteur, 'le moteur du serveur est attrape');
  ok(!!ARME, 'et une lame commune existe au catalogue');
  const q = moteur._p(portefeuille.address);
  q.objets = q.objets || {};
  q.objets[ARME.id] = (q.objets[ARME.id] || 0) + 1;
  moteur.equipeArme(portefeuille.address, 'andy', ARME.id);

  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForTimeout(1500);

  const entre = await p.evaluate(() => {
    const s = window.__s[0];
    return { entre: !!s.__m.filter((m) => m.type === 'realmEntre').pop(),
             refus: (s.__m.filter((m) => m.type === 'realmRefus').pop() || {}).raison || null };
  });
  console.log('\n-- on entre dans le monde --');
  ok(entre.entre, 'on entre dans le monde de combat' + (entre.refus ? ' (refus: ' + entre.refus + ')' : ''));
  ok(!!monde0, 'et la simulation du monde ouvert est attrapee');

  const addr = portefeuille.address.toLowerCase();

  /* ================== 1. OPTIMUS MEURT, LA PORTE S'OUVRE ==================
   *
   * On le pose a trois cents unites a l'EST du joueur, avec un seul point de
   * vie, et on TIRE dessus. C'est le seul chemin qui passe par tout ce qu'on
   * veut mesurer : le vrai `_pasTirs`, le vrai `_abat`, le vrai evenement, la
   * vraie annonce. L'abattre a la main aurait saute l'annonce, et l'essai
   * aurait dit « la page n'est pas prevenue » alors que c'est nous qui n'avions
   * rien envoye. */
  console.log('\n-- Optimus meurt --');
  /* ---- OU LE POSER, ET A QUELLE DISTANCE ----
   * Le joueur arrive quelque part sur l'anneau exterieur — n'importe ou sur le
   * bord de la carte. Poser Optimus « trois cents unites a l'est » le met donc
   * hors du monde une fois sur quatre, et il devient injoignable sans que rien
   * ne le dise. On le pose VERS LE CENTRE, dans la direction cardinale qui s'en
   * approche le plus : c'est toujours dedans, et c'est une direction qu'une
   * fleche du clavier sait suivre.
   * Cent dix unites, et pas trois cents : le poing porte a cent cinquante. Le
   * personnage n'a pas d'arme — il vient d'etre achete — et un essai qui tire
   * hors de portee dit « la porte ne s'ouvre pas » alors que le projectile
   * n'est jamais arrive. */
  const pose = await new Promise((res) => {
    const j = monde0.joueurs.get(addr);
    if (!j) return res({ err: 'pas de joueur cote serveur' });
    const dx = M.CENTRE.x - j.x, dy = M.CENTRE.y - j.y;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const ux = horizontal ? Math.sign(dx) : 0;
    const uy = horizontal ? 0 : Math.sign(dy);
    /* Deux cent quatre-vingts : dans la portee de la lame (320), et assez loin
       pour qu'il ne touche jamais — il court a 92 unites par seconde, il lui
       faudrait trois secondes, et il tombe au premier projectile. */
    const D = 280;
    const t = M.MONSTRES.optimus;
    const m = { id: monde0._nouvelId(), espece: 'optimus', biome: 'lave',
                x: j.x + ux * D, y: j.y + uy * D,
                ancreX: j.x + ux * D, ancreY: j.y + uy * D,
                pv: 1, pvMax: t.pv, dir: 'down', cible: null,
                recharge: 0, rechargeT: 0, stase: 0, errX: 0, errY: 0, errChrono: 0 };
    monde0.monstres.push(m);
    res({ joueur: { x: j.x, y: j.y }, cible: { x: m.x, y: m.y },
          ux, uy, angle: Math.atan2(uy, ux),
          touche: ux > 0 ? 'ArrowRight' : ux < 0 ? 'ArrowLeft'
                : uy > 0 ? 'ArrowDown' : 'ArrowUp' });
  });
  ok(!pose.err, `Optimus est pose a deux cent quatre-vingts unites vers le centre (${pose.touche})` +
     (pose.err ? ' — ' + pose.err : ''));

  /* On vise dans sa direction et on tire — puis ON S'ARRETE DES QUE LA PORTE
     EST LA. Tirer un nombre fixe de fois laissait le personnage sous le feu
     trois secondes de trop apres la mort d'Optimus, et un essai qui meurt ne
     dit pas « je suis mort » : il dit « la porte n'est pas dessinee ». */
  for (let tour = 0; tour < 40 && !monde0.portails.length; tour++) {
    await p.evaluate((c) => {
      window.__s[0].send(JSON.stringify({ type: 'realmTir', a: c.angle,
                          x: Math.round(c.joueur.x), y: Math.round(c.joueur.y) }));
    }, pose);
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(400);

  /* ---- VIVANT ? ----
   * Le dire ICI, et pas au bout de dix verifications de dessin. Un personnage
   * mort continue de recevoir des messages et de faire tourner une page :
   * l'essai mesure alors tres serieusement un ecran de mort, et se plaint que
   * rien n'y soit peint. */
  const vivant = await p.evaluate(() => {
    const v = document.getElementById('nxMortVoile');
    return { mort: !!(v && v.classList.contains('on')),
             msg: window.__s[0].__m.filter((m) => m.type === 'realmMort').length };
  });
  ok(!vivant.mort && !vivant.msg, 'le personnage a survecu au combat');

  const porte = monde0.portails.length ? { ...monde0.portails[0] } : null;
  ok(!!porte, 'une porte s\'est ouverte cote serveur');
  ok(porte && porte.donjon === 'forge', 'et elle ouvre la Forge');
  /* Derriere elle, dans le sens de sa chute : au-dela de la creature sur l'axe
     par lequel on l'a approchee. */
  const auDela = porte && (pose.ux !== 0
    ? (pose.ux > 0 ? porte.x > pose.cible.x : porte.x < pose.cible.x)
    : (pose.uy > 0 ? porte.y > pose.cible.y : porte.y < pose.cible.y));
  ok(auDela, 'derriere la creature, dans le sens de sa chute');

  const annonce = await p.evaluate(() => {
    const s = window.__s[0];
    const a = s.__m.filter((m) => m.type === 'realmPortail').pop();
    const e = s.__m.filter((m) => m.type === 'realmEtat').pop();
    return { annonce: a || null, portails: (e && e.portails) || [] };
  });
  ok(!!annonce.annonce, 'la page a ete PREVENUE que la porte s\'ouvrait');
  ok(annonce.annonce && annonce.annonce.donjon === 'forge', 'et de quel donjon il s\'agit');
  ok(annonce.portails.length === 1, 'et la porte voyage avec l\'etat');
  ok(annonce.portails[0] && annonce.portails[0].rt === 0,
     'marquee comme une porte d\'ALLER, pas de retour');

  /* ================== 2. ELLE SE DESSINE ================== */
  console.log('\n-- elle se dessine --');
  await p.evaluate(() => { window.__peint.length = 0; window.__image0 = window.__image; });
  await p.waitForTimeout(900);
  const dessin = await p.evaluate(() => {
    const v = window.__peint.filter((o) => o.src === 'obj_portail.webp' && o.ecran);
    return { fois: v.length, images: new Set(v.map((o) => o.f)).size,
             rendues: window.__image - window.__image0,
             taille: v.length ? Math.round(v[0].dw) : 0 };
  });
  ok(dessin.fois > 0, `la porte est peinte a l'ecran (${dessin.fois} fois)`);
  /* ---- A CHAQUE IMAGE, PAS « PLUS DE CINQ » ----
   * Le seuil en dur mesurait la machine, pas le jeu : un passage ou le
   * navigateur ne rend que quatre images en neuf cents millisecondes faisait
   * echouer un dessin parfaitement correct. Ce qu'on veut savoir est
   * relatif — la porte est-elle peinte a CHAQUE image, ou seulement de temps
   * en temps ? — et cette question a la meme reponse sur une machine chargee. */
  ok(dessin.rendues > 0 && dessin.images >= dessin.rendues - 2,
     `a chaque image (${dessin.images} sur ${dessin.rendues} rendues)`);
  ok(dessin.taille >= 64, `et assez grande pour se voir (${dessin.taille} px)`);

  /* ================== 3. LA FLECHE VERS UNE PORTE LOINTAINE ==================
   *
   * C'est ce qui rend le donjon trouvable. Une porte s'ouvre a l'autre bout de
   * la carte : elle n'est PAS dans l'etat qu'on recoit (la portee s'arrete a
   * 1400 unites), donc la page ne peut la connaitre que par l'annonce. Sans
   * fleche, « un portail s'est ouvert » est une nouvelle sans suite — trois
   * minutes ne suffisent pas a fouiller sept mille sept cents unites de cote.
   */
  console.log('\n-- la fleche vers la porte --');
  await p.evaluate(() => { window.__trace = []; });
  /* On espionne le TRACE, pas une image : la fleche est dessinee au trait, et
     `drawImage` ne la verra jamais. */
  await p.evaluate(() => {
    const S = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function () {
      if (String(this.fillStyle).toLowerCase() === '#c07bff') {
        const t = this.getTransform();
        window.__trace.push({ x: Math.round(t.e), y: Math.round(t.f) });
      }
      return S.apply(this, arguments);
    };
  });
  /* Rien tant qu'aucune porte lointaine n'est annoncee : une fleche qui
     pointerait en permanence ne pointerait plus rien. */
  await p.waitForTimeout(600);
  const avantFleche = await p.evaluate(() => window.__trace.length);
  ok(avantFleche === 0, 'sans annonce, aucune fleche');

  /* Le serveur annonce une porte a l'autre bout de la carte. On passe par le
     VRAI message, dans le vrai format. */
  /* ---- ICI, ET PAS APRES LE DONJON ----
   * La boussole n'a rien a voir avec l'interieur du donjon : elle se mesure
   * aussi bien avant. Placee apres la traversee, elle dependait d'un
   * personnage encore vivant au bout de trois minutes de combat — et un
   * passage sur trois se coupait sur « lire .x sur rien », ce qui ne dit rien
   * de la fleche. Un essai qui depend d'un voisin lointain se met a mentir. */
  const jm = monde0.joueurs.get(addr);
  ok(!!jm, 'le personnage est vivant dans le monde');
  const posJ = jm ? { x: jm.x, y: jm.y } : { x: porte.x, y: porte.y };
  const cibleLoin = { x: Math.min(M.MONDE.w - 100, posJ.x + 3000),
                      y: Math.min(M.MONDE.h - 100, posJ.y + 2000) };
  await p.evaluate((q) => {
    window.__s[0].dispatchEvent(new MessageEvent('message', {
      data: JSON.stringify({ type: 'realmPortailOuvert', id: 987654,
                             donjon: 'forge', x: q.x, y: q.y,
                             nom: 'Quelqu\'un', duree: 180, mien: false }),
    }));
  }, cibleLoin);
  await p.waitForTimeout(800);
  const fleche = await p.evaluate(() => ({
    n: window.__trace.length,
    dernier: window.__trace[window.__trace.length - 1] || null,
    ligne: (document.getElementById('nxIndice') || {}).textContent || '',
  }));
  ok(fleche.n > 5, `la fleche est tracee (${fleche.n} fois)`);
  ok(/forge/i.test(fleche.ligne), `et la ligne dit ou (« ${fleche.ligne.slice(0, 70)} »)`);
  /* ELLE POINTE DU BON COTE. La porte est au sud-est : la fleche doit etre
     posee dans ce quart de l'ecran, pas au hasard sur le cadre. */
  const vue = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    return { w: c.clientWidth, h: c.clientHeight };
  });
  ok(fleche.dernier && fleche.dernier.x > vue.w * 0.4 && fleche.dernier.y > vue.h * 0.4,
     `et elle pointe vers le sud-est, comme la porte (${fleche.dernier ? fleche.dernier.x + ',' + fleche.dernier.y : '?'})`);

  /* ---- ET ELLE S'EFFACE QUAND LA PORTE EST DANS LE CADRE ----
   * Une fleche qui continuerait de pointer un objet visible se lit comme un
   * defaut d'affichage. */
  await p.evaluate(() => { window.__trace.length = 0; });
  await p.evaluate((q) => {
    window.__s[0].dispatchEvent(new MessageEvent('message', {
      data: JSON.stringify({ type: 'realmPortailOuvert', id: 987655,
                             donjon: 'forge', x: q.x, y: q.y,
                             nom: null, duree: 180, mien: false }),
    }));
  }, { x: Math.round(posJ.x), y: Math.round(posJ.y) });
  await p.waitForTimeout(700);
  const surPlace = await p.evaluate(() => window.__trace.length);
  /* La premiere, elle, est toujours loin : on ne compte donc que l'absence
     d'une DEUXIEME fleche, en regardant qu'il n'y en a pas deux par image. */
  const parImage = await p.evaluate(() => {
    const n = {};
    window.__trace.forEach((t) => { const k = t.x + ',' + t.y; n[k] = (n[k] || 0) + 1; });
    return Object.keys(n).length;
  });
  ok(parImage <= 1,
     `une porte sous nos pieds n'ajoute pas de fleche (${parImage} position(s) tracee(s))`);


  /* ================== 4. LE BOUTON N'APPARAIT QUE DESSUS ================== */
  console.log('\n-- le bouton --');
  const loin = await p.evaluate(() => {
    const e = document.getElementById('nxPorte');
    return !!(e && e.hidden);
  });
  ok(loin, 'a distance, aucun bouton : entrer n\'est pas propose');

  /* On y va A PIED, par la touche : c'est le seul moyen de deplacer le
     personnage de la PAGE. Envoyer un `realmMove` a la socket deplacerait le
     joueur du serveur sans bouger celui du navigateur, et le bouton — qui se
     decide sur la position locale — ne s'afficherait jamais. Un essai qui
     mesure alors « le bouton n'apparait pas » mesure sa propre triche. */
  await p.evaluate(() => { const c = document.querySelector('canvas'); if (c) c.focus(); });
  /* Par PETITS PAS, en s'arretant des que le bouton parait. Marcher pendant une
     duree calculee revient a parier sur la vitesse du personnage : trop court on
     n'y arrive pas, trop long on passe DEVANT — et un rayon de soixante-douze
     unites se traverse en un tiers de seconde. La premiere version de cet essai
     depassait, le bouton s'affichait puis se cachait, et le seul indice etait
     que son texte etait resté juste. */
  /* ---- ON Y VA EN SE CORRIGEANT, PAS EN LIGNE DROITE ----
   * Une marche en ligne droite pendant N pas suppose qu'il n'y a rien entre les
   * deux. Il y a des rochers, des murs de salle gardee, et le personnage GLISSE
   * le long : il arrive donc a cote, et l'essai conclut que le bouton ne
   * s'affiche pas. On relit la position a chaque pas — celle du SERVEUR, la
   * seule qui fasse foi — et l'on appuie sur la fleche de l'axe qui reste le
   * plus a couvrir. C'est exactement ce que fait un joueur devant un rocher.
   * `ou` rend la cible : elle change entre le monde et le donjon. */
  const versLaPorte = async (ou, tours) => {
    let dernier = null, detour = 0, sens = 1;
    for (let i = 0; i < tours; i++) {
      const vu = await p.evaluate(() => {
        const e = document.getElementById('nxPorte');
        return !!(e && !e.hidden);
      });
      if (vu) return i;
      const j = ou.realm.joueurs.get(addr);
      if (!j) return 0;
      const cible = ou.cible();
      if (!cible) return 0;
      const dx = cible.x - j.x, dy = cible.y - j.y;
      /* ---- ET QUAND CA NE BOUGE PLUS ----
       * Un rocher, ou le mur d'une salle gardee. Pousser UN pas sur l'autre axe
       * ne suffit pas : au pas suivant l'axe dominant redevient le meme, on
       * revient se coller, et l'on fait du sur-place pendant quatre-vingt-dix
       * tours. On s'engage donc sur le cote pour cinq pas d'affilee — c'est un
       * contournement, pas une hesitation — et l'on change de cote si ca
       * recommence. C'est ce que fait un joueur devant un obstacle. */
      const bloque = dernier !== null &&
                     Math.abs(dernier.x - j.x) < 2 && Math.abs(dernier.y - j.y) < 2;
      dernier = { x: j.x, y: j.y };
      if (bloque && detour <= 0) { detour = 5; sens = -sens; }
      const horizontal = detour > 0 ? Math.abs(dx) <= Math.abs(dy)
                                    : Math.abs(dx) > Math.abs(dy);
      let t;
      if (detour > 0) {
        detour--;
        t = horizontal ? (sens > 0 ? 'ArrowRight' : 'ArrowLeft')
                       : (sens > 0 ? 'ArrowDown' : 'ArrowUp');
      } else {
        t = horizontal ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft')
                       : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
      }
      await p.keyboard.down(t);
      await p.waitForTimeout(140);
      await p.keyboard.up(t);
      await p.waitForTimeout(90);
    }
    return 0;
  };
  const pas = await versLaPorte({ realm: monde0, cible: () => porte }, 140);
  ok(pas > 0, `on marche jusqu'a la porte (${pas} pas)`);

  const dessus = await p.evaluate(() => {
    const e = document.getElementById('nxPorte');
    const b = document.getElementById('nxPorteBtn');
    const nom = document.getElementById('nxPorteNom');
    return { visible: !!(e && !e.hidden), texte: b ? b.textContent : '',
             nom: nom ? nom.textContent : '',
             vert: !!(b && b.className.indexOf('retour') >= 0) };
  });
  ok(dessus.visible, 'dessus, le bouton apparait');
  ok(dessus.texte === 'ENTER', `et il dit ENTER (« ${dessus.texte} »)`);
  ok(!dessus.vert, 'ce n\'est pas le bouton de sortie');
  ok(/forge/i.test(dessus.nom), `et il nomme le donjon (« ${dessus.nom} »)`);

  /* ================== 5. ON ENTRE ================== */
  console.log('\n-- on entre --');
  /* Le clic ne PEND pas : si le bouton n'est pas la, on veut lire « le bouton
     n'est pas apparu » et la suite, pas trente secondes d'attente muette suivies
     d'un essai coupe au milieu. */
  await p.click('#nxPorteBtn', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(2000);
  const dedans = await p.evaluate(() => {
    const s = window.__s[0];
    const demande = s.__out.filter((m) => m.type === 'realmPorte').length;
    const e = s.__m.filter((m) => m.type === 'realmEntre').pop();
    const refus = s.__m.filter((m) => m.type === 'realmPorteRefus').pop();
    return { demande, donjon: e && e.donjon, tuiles: e && e.tuiles ? e.tuiles.length : 0,
             blocs: e && e.obstacles ? e.obstacles.length : 0,
             sortie: (e && e.sortie) || null,
             refus: refus ? refus.raison : null,
             moi: e && e.moi ? { x: e.moi.x, y: e.moi.y } : null };
  });
  ok(dedans.demande === 1, 'la page a demande a entrer, une seule fois');
  ok(dedans.donjon === 'forge', `et le serveur a repondu par la Forge (${dedans.donjon})` +
     (dedans.refus ? ' — refus: ' + dedans.refus : ''));
  ok(dedans.tuiles > 300, `le sol arrive tuile par tuile (${dedans.tuiles})`);
  ok(dedans.blocs > 100, `et les murs avec (${dedans.blocs})`);
  ok(!!dedans.sortie, 'la porte de retour est annoncee');

  /* LE DONJON A L'AIR D'UN DONJON.
     On vide le tampon APRES la transition, jamais avant : les deux secondes
     qu'elle prend sont autant d'images du monde ouvert, et les compter faisait
     dire a l'essai qu'il y avait des rochers dans le donjon. */
  await p.evaluate(() => { window.__peint.length = 0; });
  await p.waitForTimeout(900);
  const decor = await p.evaluate(() => {
    const v = window.__peint.filter((o) => o.ecran);
    const compte = (s) => v.filter((o) => o.src === s).length;
    return { sol: compte('ground_donjon.webp'), mur: compte('mur_donjon.webp'),
             solDehors: compte('ground_dirt.webp') + compte('ground_lava.webp') +
                        compte('ground_snow.webp') + compte('ground_marais.webp') +
                        compte('ground_cendres.webp'),
             murDehors: compte('mur_ruine.webp'), rocher: compte('obstacles.webp') };
  });
  ok(servis.some((u) => /ground_donjon\.webp$/.test(u)),
     'la page a demande le sol du donjon');
  ok(decor.sol > 0, `le sol du donjon est peint (${decor.sol} tuiles)`);
  ok(decor.mur > 0, `et ses murs (${decor.mur} blocs)`);
  ok(decor.solDehors === 0, `aucune tuile du monde ouvert ne traine dedans (${decor.solDehors})`);
  ok(decor.murDehors === 0, 'ni un seul mur de ruine');
  ok(decor.rocher === 0, 'ni un rocher');

  /* ================== 6. ON PEUT TOUJOURS RESSORTIR ================== */
  console.log('\n-- on ressort --');
  /* La sortie est a l'est de l'arrivee : on y va a pied, par petits pas, comme
     tout a l'heure et pour la meme raison. */
  ok(!!donjon0, 'la simulation du donjon tourne');
  const pas2 = await versLaPorte({
    realm: donjon0 || { joueurs: new Map() },
    cible: () => dedans.sortie }, 90);
  ok(pas2 > 0, `on marche jusqu'a la porte du sas (${pas2} pas)`);
  const surSortie = await p.evaluate(() => {
    const e = document.getElementById('nxPorte');
    const b = document.getElementById('nxPorteBtn');
    return { visible: !!(e && !e.hidden), texte: b ? b.textContent : '',
             vert: !!(b && b.className.indexOf('retour') >= 0) };
  });
  ok(surSortie.visible, 'la porte du sas se voit');
  ok(surSortie.texte === 'EXIT', `et elle dit EXIT (« ${surSortie.texte} »)`);
  ok(surSortie.vert, 'et elle n\'a pas la couleur d\'une entree');

  await p.click('#nxPorteBtn', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(2000);
  const dehors = await p.evaluate(() => {
    const s = window.__s[0];
    const e = s.__m.filter((m) => m.type === 'realmEntre').pop();
    return { sorti: s.__out.filter((m) => m.type === 'realmSort').length,
             donjon: e && e.donjon, tuiles: e && e.tuiles,
             moi: e && e.moi ? { x: e.moi.x, y: e.moi.y } : null };
  });
  ok(dehors.sorti === 1, 'la page a demande a sortir');
  ok(!dehors.donjon, 'et l\'on est rendu au monde ouvert');
  ok(!dehors.tuiles, 'sans plus aucune tuile de donjon');
  ok(dehors.moi && Math.abs(dehors.moi.x - porte.x) < 4 &&
     Math.abs(dehors.moi.y - porte.y) < 4,
     `on ressort LA OU la porte s'est ouverte (${dehors.moi ? dehors.moi.x + ',' + dehors.moi.y : '?'} contre ${Math.round(porte.x)},${Math.round(porte.y)})`);

  /* Et le decor du monde est revenu. */
  await p.evaluate(() => { window.__peint.length = 0; });
  await p.waitForTimeout(900);
  const revenu = await p.evaluate(() => {
    const v = window.__peint.filter((o) => o.ecran);
    const compte = (s) => v.filter((o) => o.src === s).length;
    return { donjon: compte('ground_donjon.webp') + compte('mur_donjon.webp'),
             monde: compte('ground_dirt.webp') + compte('ground_lava.webp') +
                    compte('ground_snow.webp') + compte('ground_marais.webp') +
                    compte('ground_cendres.webp') };
  });
  ok(revenu.monde > 0, `le sol du monde est revenu (${revenu.monde} tuiles)`);
  ok(revenu.donjon === 0, 'et plus rien du donjon');

  /* On est ressorti SUR la porte d'aller : le bouton doit donc reproposer
     d'entrer, pas rester sur « EXIT ». C'est le cas qui casse le plus
     discretement — le meme bouton, le mauvais mot. */
  const repropose = await p.evaluate(() => {
    const b = document.getElementById('nxPorteBtn');
    const e = document.getElementById('nxPorte');
    return { visible: !!(e && !e.hidden), texte: b ? b.textContent : '' };
  });
  ok(!repropose.visible || repropose.texte === 'ENTER',
     `de retour sur la porte d'aller, le bouton dit ENTER (« ${repropose.texte} »)`);

  /* ================== 7. LE CERCLE DU DONJON EST UN AUTRE CERCLE ==================
   *
   * Le cercle qui previent est la seule chose qu'on regarde pendant la seconde
   * et demie ou l'on decide de partir. Le Foundry Brute en pose un, et il ne
   * doit pas ressembler a celui de la lave — sinon le donjon n'est qu'une carte
   * de plus avec les memes signaux.
   * On verifie que la page a DEMANDE les deux planches en entrant : provoquer le
   * coup demanderait de traverser trois salles pleines et de survivre, ce qui
   * mesurerait la difficulte du donjon plutot que le cablage de son dessin. */
  console.log('\n-- le cercle du donjon --');
  ok(servis.some((u) => /annonce_donjon\.webp$/.test(u)),
     'la page a demande le cercle d\'annonce du donjon');
  ok(servis.some((u) => /onde_donjon\.webp$/.test(u)),
     'et l\'onde qui suit le coup');
  /* ET LES DEUX PLANCHES ONT LA MEME DECOUPE QUE CELLES DU MONDE. Un nombre
     d'images different ferait lire la troisieme la ou il y en a quatre : le
     cercle se remplirait par a-coups, ou sauterait la derniere image — celle
     qui dit « ca frappe maintenant ». */
  const geo = (f) => {
    const b = fs.readFileSync(path.join(SITE, f));
    /* Un WebP porte sa taille dans son entete VP8/VP8L. Plutot que d'ajouter une
       dependance pour deux nombres, on lit la paire que le format expose — et si
       la lecture echoue on le DIT, au lieu de laisser passer. */
    const i = b.indexOf('VP8', 0, 'ascii');
    if (i < 0) return null;
    const t = b.toString('ascii', i, i + 4);
    if (t === 'VP8 ') return { w: b.readUInt16LE(i + 14) & 0x3fff,
                               h: b.readUInt16LE(i + 16) & 0x3fff };
    if (t === 'VP8L') {
      const n = b.readUInt32LE(i + 9);
      return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
    }
    if (t === 'VP8X') return { w: b.readUIntLE(i + 12, 3) + 1,
                               h: b.readUIntLE(i + 15, 3) + 1 };
    return null;
  };
  for (const [a, b] of [['img/nexus/effets/annonce.webp', 'img/nexus/effets/annonce_donjon.webp'],
                        ['img/nexus/effets/onde.webp', 'img/nexus/effets/onde_donjon.webp']]) {
    const ga = geo(a), gb = geo(b);
    ok(ga && gb, `${b.split('/').pop()} se lit`);
    if (ga && gb) {
      ok(ga.w / ga.h === gb.w / gb.h,
         `${b.split('/').pop()} a la meme decoupe que ${a.split('/').pop()} ` +
         `(${gb.w}x${gb.h} contre ${ga.w}x${ga.h})`);
    }
  }

  /* ================== 8. RIEN NE MANQUE ================== */
  console.log('\n-- les images --');
  const perdus = manquants.filter((u) => /\.webp$/.test(u));
  ok(perdus.length === 0, 'aucune image demandee n\'est absente' +
     (perdus.length ? ' — ' + perdus.slice(0, 6).join(', ') : ''));
  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\ndonjon_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
