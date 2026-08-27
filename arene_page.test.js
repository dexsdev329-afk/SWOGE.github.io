/* L'ARENE, VUE DE LA PAGE — du portail du Nexus au champion.
 *
 * ---- LA PANNE QUE CET ESSAI CHERCHE ----
 *
 * L'arene est arrivee sans aucun essai de page. Elle en a paye le prix tout
 * de suite : l'accueil du realm a recu un champ `effets` nommant ses planches
 * de zone, alors que `effets` designait DEJA la table des etats — paralysie,
 * ralentissement, brulure. Deux cles du meme nom dans un meme objet
 * litteral : JavaScript garde la derniere, sans un mot.
 *
 * Le degat allait plus loin que l'arene. Partout ailleurs le champ valait
 * `undefined`, donc la table des etats disparaissait de l'accueil POUR TOUT
 * LE MONDE et les anneaux de decompte sous le personnage cessaient d'etre
 * dessines — en silence, personne ne voit une absence. Et dans l'arene, ou il
 * vaut une chaine, la page lisait `'arene'.paralyse.duree` : la boucle de
 * dessin mourait a chaque image.
 *
 * `donjon_page.test.js` est reste VERT pendant tout ce temps. Il entre dans la
 * Fonderie, qui tombait dans le cas silencieux. C'est pour ca que cet
 * essai-ci existe : chaque donjon qui a des planches a lui a besoin qu'on
 * entre DEDANS.
 *
 * ---- CE QU'ON MESURE ----
 *
 *   1. ON ENTRE, et le serveur nomme ce qu'il faut dessiner.
 *   2. LA TABLE DES ETATS SURVIT au voyage. C'est la garde anti-collision :
 *      elle ne coute rien et elle aurait attrape la panne.
 *   3. LES PLANCHES DE L'ARENE SONT CELLES QUI SE PEIGNENT, pas celles du
 *      donjon — sinon on remet la braise du Sanctuaire sous un boss de foudre.
 *   4. LE CHAMPION A SON DESSIN ET SA FOUDRE.
 *   5. AUCUNE ERREUR DE PAGE. C'est le seul point qui aurait suffi.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('arene_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('arene_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
  let monde0 = null;
  const ouverts = new Set(), donjons = new Set();
  /* ---- MONDE OUVERT OU DONJON : C'EST UNE QUESTION DE MOMENT ----
   * C'etait « avec plan / sans plan ». Ca ne l'est plus : la ville de SWOGE
   * +18 est un monde ouvert qui a un plan a lui. Avec l'ancien critere, elle
   * disparaissait des mondes ouverts ET s'ajoutait aux donjons — et comme
   * `donjon0` retenait « le dernier qui a battu », il designait une fois sur
   * deux la ville au lieu du donjon ou notre joueur se trouve. On collecte
   * donc ce qui tourne DEJA a la fin du demarrage (les mondes ouverts : un
   * donjon n'existe qu'a partir de la porte franchie), et l'on designe la
   * bonne simulation par SON OCCUPANT — ce qui est de toute facon plus juste
   * que « la derniere ». */
  let demarrageFini = false;
  const pas0 = Realm.prototype.pas;
  Realm.prototype.pas = function (dt) {
    if (!demarrageFini) ouverts.add(this);
    else if (!ouverts.has(this)) donjons.add(this);
    return pas0.call(this, dt);
  };
  const dansLaListe = (l, a2) => [...l].find((r) => r.joueurs.has(String(a2).toLowerCase())) || null;
  const mondeDe = (a2) => dansLaListe(ouverts, a2) || [...ouverts][0] || null;
  const donjonDe = (a2) => dansLaListe(donjons, a2) || null;

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
  demarrageFini = true;
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
                              /* La case SOURCE : c'est le seul moyen de savoir
                                 QUELLE image d'une planche a ete posee, et donc
                                 de voir une animation jouee a l'envers ou en
                                 rond. */
                              sx: n === 9 ? arguments[1] : 0,
                              sw: n === 9 ? arguments[3] : 0,
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

  console.log('\n-- 1. ON ENTRE DANS L ARENE --');
  /* Le message ne porte AUCUNE cle de donjon : le serveur ne doit pas croire
     une page qui nommerait celui dans lequel elle veut entrer. */
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'arenePorte' })));
  await p.waitForTimeout(3000);

  const accueil = await p.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
    return e || null;
  });
  ok(!!accueil, 'la porte s ouvre et l accueil du realm arrive');
  ok(accueil && accueil.donjon === 'arena',
     `on est dans l arene (${accueil && accueil.donjon})`);
  ok(!!(accueil && accueil.sortie), 'et la porte de retour existe des le premier pas');

  console.log('\n-- 2. LA TABLE DES ETATS SURVIT AU VOYAGE --');
  /* ---- LA GARDE ANTI-COLLISION ----
   * C'est cette verification-la, et elle seule, qui aurait nomme la panne au
   * lieu de laisser une page mourir. On ne se contente pas de « le champ
   * existe » : une CHAINE existe aussi, et c'est exactement ce qui est arrive.
   * On lit ce qu'on va vraiment lire — `effets.paralyse.duree` — parce qu'un
   * essai qui ne fait pas le geste du jeu ne protege pas le jeu. */
  const eff = accueil && accueil.effets;
  ok(!!eff && typeof eff === 'object',
     `« effets » est bien la table des etats, pas un nom de planche (${typeof eff})`);
  for (const etat of ['paralyse', 'ralenti', 'brulure']) {
    ok(!!(eff && eff[etat] && typeof eff[etat].duree === 'number'),
       `  ${etat}.duree se lit (${eff && eff[etat] ? eff[etat].duree : 'absent'})`);
  }
  ok(accueil && accueil.planchesFx === 'arene',
     `et les planches d effets sont nommees a part (${accueil && accueil.planchesFx})`);

  console.log('\n-- 3. LE CHAMPION EST LA, AU CENTRE DE SA SALLE --');
  const dj = donjonDe(portefeuille.address);
  ok(!!dj, 'la simulation de l arene tourne');
  const champion = dj && dj.monstres.find((m) => M.RETOUR_DE[m.espece]);
  ok(!!champion, 'le champion est ne dans la salle du fond');
  /* Une arene est un DUEL : rien d autre ne doit y attendre. */
  ok(!!dj && dj.monstres.length === 1,
     `et il y est SEUL — c est un duel (${dj ? dj.monstres.length : 0} creature(s))`);
  if (dj && champion) {
    const fond = dj.plan && dj.plan.peuplement
      ? dj.plan.peuplement.find((m) => m.boss) : null;
    ok(!!fond, 'le plan le pose explicitement comme boss');
    /* On se pose devant lui : il est a deux mille unites du sas et la portee
       de l etat s arrete a 1400. Sans ce saut on ne verrait jamais ce qu on
       vient verifier. On ne triche pas sur le RESULTAT — c est le vrai
       serveur qui le fait tirer. */
    const j = dj.joueurs.get(portefeuille.address.toLowerCase());
    if (j) { j.x = champion.x - 380; j.y = champion.y; j.pv = 100000; j.pvMax = 100000; }
  }

  console.log('\n-- 4. CE QUI SE PEINT EST BIEN LE SIEN --');
  await p.evaluate(() => { window.__peint.length = 0; });
  await p.waitForTimeout(9000);
  const vus = await p.evaluate(() => {
    const s = new Set();
    window.__peint.forEach((q) => s.add(q.dossier + '/' + q.src));
    return [...s].sort();
  });
  const vu = (f) => vus.indexOf(f) >= 0;
  ok(vu('tiles/ground_arena.webp'), 'le sol de l arene');
  ok(vu('monstres/orage.webp'), 'le champion, avec sa propre planche');
  ok(vu('tirs/foudre.webp'),
     'et sa foudre a lui, pas le plasma des drones de la Fonderie');
  ok(vu('effets/annonce_arene.webp'),
     'le cercle au sol est celui de l arene, pas la braise du Sanctuaire');
  console.log('   peint : ' + vus.join(' | '));

  console.log('\n-- 5. ET RIEN N A CASSE --');
  /* Le point qui aurait suffi. Une erreur dans la boucle de dessin ne se voit
     pas dans la console d un joueur : l image se fige, et il croit que le jeu
     rame. */
  ok(erreurs.length === 0,
     erreurs.length ? `${erreurs.length} erreur(s) de page : ${erreurs.join(' || ')}`
                    : 'aucune erreur de page pendant tout le combat');
  const perdus = [...new Set(manquants)].filter((f) => f !== '/favicon.ico');
  ok(perdus.length === 0,
     perdus.length ? `fichier(s) introuvable(s) : ${perdus.join(', ')}` : 'aucun 404');

  await nav.close(); site.stop();
  console.log(`\narene_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
