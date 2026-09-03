/* « MY WALLET » OUVRE LE PANNEAU, IL NE CHANGE PAS DE PAGE.
 *
 * ---- CE QUI ETAIT SIGNALE ----
 *
 * « Quand je suis sur index html, que je clique sur mon profil, que j appuie
 *   sur My Wallet, ca m ouvre une redirection vers le Coin Pusher alors que ca
 *   devrait m ouvrir le panneau My Wallet. »
 *
 * ---- CE QUI SE PASSAIT, ET POURQUOI CE N ETAIT PAS UN BOGUE ----
 *
 * `stakebubble.js` constate qu une page ne porte AUCUN panneau de compte et
 * envoie alors ses cinq rangees vers la page qui en a — le Coin Pusher, ouvert
 * sur le bon panneau. Il ne les refait pas lui-meme, et il a raison : un
 * formulaire de depot ecrit dans ce fichier serait une seconde version du
 * chemin de l argent, a tenir a jour en face de quinze autres.
 *
 * Le remede n etait donc pas de detourner la rangee mais de DONNER ses
 * panneaux a l accueil : `swogecompte.js`, la version partagee que le hall
 * charge deja, qui ne s installe que sur une page qui n a rien.
 *
 * ---- CE QUE CET ESSAI TIENT ----
 *
 * Que le clic n emmene NULLE PART. C est la seule formulation qui resiste :
 * verifier qu un panneau precis s ouvre laisserait passer un jour ou il
 * s ouvrirait sur une autre page. On regarde donc l adresse de la page avant
 * et apres — et l on verifie que le tiroir, lui, a bien montre quelque chose.
 *
 * Il lui faut une VRAIE session : le tiroir n existe qu une fois le joueur
 * authentifie. D ou le serveur d essai, la signature, et le jeton repose dans
 * le meme stockage local — comme un joueur qui change de page.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('compte_index.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('compte_index.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ` [${a} vs ${b}]`);

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

/* Les modules du serveur se lisent APRES avoir pose les variables
   d environnement : `config.js` les gele a son premier `require`, et un
   catalogue charge trop tot emmenerait avec lui un serveur qui ecoute sur le
   port du depot au lieu de celui de l essai. */
let skins, boutique, personnages, cfgS;
let TEMOIN, HEROS, ARME_PORTEE, ARME_VENDUE, ARMURE, VOLUME;
function chargeLeCatalogue() {
  skins = require(path.join(SERVEUR, 'skins'));
  boutique = require(path.join(SERVEUR, 'boutique'));
  personnages = require(path.join(SERVEUR, 'personnages'));
  cfgS = require(path.join(SERVEUR, 'config'));

  /* Le temoin est celui qu on OFFRE : il est possede sans achat, donc sa fiche
     existe des la premiere ouverture et rien de ce qui suit ne l a touche. */
  TEMOIN = [...skins.OFFERT][0];
  HEROS = skins.SKINS.map((s) => s.id).filter((id) => id !== TEMOIN)[0];

  /* Les pieces sont prises dans le catalogue et non nommees a la main — une
     saison retouchee demain ne doit pas faire tomber un essai qui ne parle pas
     d elle. On garde celles qui ont une image dans le depot : la case affiche
     l objet, et un `onerror` retirerait l `img` d une piece sans planche, ce
     qui rendrait la verification muette au lieu de fausse. */
  const dessinee = (o) => fs.existsSync(path.join(SITE, 'img', 'shop', o.cle + '.webp'));
  const armes = boutique.itemsDeSaison(2).filter((o) => !o.drop && dessinee(o));
  const armures = boutique.itemsDeSaison(3).filter((o) => !o.drop && dessinee(o));
  ARME_PORTEE = armes[0]; ARME_VENDUE = armes[1]; ARMURE = armures[0];

  /* De quoi franchir la porte du rachat (c est par le rachat que la piece du
     troisieme essai quitte l inventaire) et monter de plusieurs niveaux. */
  VOLUME = Math.max(2 * (Number(cfgS.RACHAT_VOLUME_MIN) || 0), personnages.volumePour(5));
}

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/persopage-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  chargeLeCatalogue();
  const { Game } = require(path.join(SERVEUR, 'game'));
  let moteur = null; const _p0 = Game.prototype._p;
  Game.prototype._p = function (a) { moteur = this; return _p0.call(this, a); };
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const cfg = require(path.join(SERVEUR, 'config'));
  const WEI = (x) => ethers.utils.parseUnits(String(x), cfg.DECIMALS);
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

  /* ---- DEUX PAGES, UNE SEULE CONNEXION ----
   * Le tiroir des personnages vit dans stakebubble.js et ne s accroche que sur
   * une page qui a une barre — le hall, pas le Nexus. La connexion par
   * signature, elle, se fait sur la socket du Nexus. On se connecte donc la ou
   * on sait le faire, on garde le JETON DE SESSION, et on le repose dans le
   * meme stockage local avant d aller au hall : stakebubble reprend la session
   * tout seul, comme un joueur qui change de page. */
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);
  const jeton = await p.evaluate(() => {
    const s = window.__s.find((x) => x.__m.some((y) => y.type === 'auth'));
    return s.__m.find((y) => y.type === 'auth').session || null;
  });
  ok(!!jeton, 'la connexion rend un jeton de session');

  /* ---- L ETAT, POSE PAR LES VRAIES FONCTIONS DU MOTEUR ----
   * Deux personnages possedes, deux volumes joues sous chacun (donc deux
   * niveaux differents), et trois pieces au coffre. Rien n est bricole a la
   * main la ou une methode existe. */
  const q = moteur._p(w.address);
  q.hasDeposited = true;
  q.balance = WEI(50000000);
  moteur.acheteSkin(w.address, TEMOIN);              // offert — devient actif
  moteur._markWager(q, WEI(VOLUME), 'plinko');       // ce volume-la est au temoin
  moteur.acheteSkin(w.address, HEROS);               // paye — devient actif a son tour
  moteur._markWager(q, WEI(2 * VOLUME), 'plinko');
  ok(moteur.possedeSkin(q, TEMOIN) && moteur.possedeSkin(q, HEROS),
     'les deux personnages sont au joueur');
  q.objets = q.objets || {};
  [ARME_PORTEE, ARME_VENDUE, ARMURE].forEach(function (o) { q.objets[o.id] = 1; });

  await p.evaluate((t) => { localStorage.setItem('swogeSession', t); }, jeton);
  await p.goto(`http://127.0.0.1:${site.port}/games.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.swpb', { state: 'attached', timeout: 20000 });
  await p.waitForTimeout(1500);

  /* ---- ON VA SUR L ACCUEIL ---- */
  await p.goto(`http://127.0.0.1:${site.port}/index.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.swpb', { state: 'attached', timeout: 20000 });
  await p.waitForTimeout(1800);
  ok(true, 'le tiroir se monte sur l accueil');

  /* Les panneaux du compte sont LA. On le lit sur la page, pas dans le
     fichier : un script charge mais qui s efface aurait laisse la page
     identique, et c est precisement le cas qu on repare. */
  const panneaux = await p.evaluate(() => ({
    dep: !!document.getElementById('box-dep'),
    wd: !!document.getElementById('box-wd'),
    wallet: !!document.getElementById('box-wallet'),
    stake: !!document.getElementById('box-stake'),
    quests: !!document.getElementById('box-quests'),
    menu: !!document.getElementById('menu'),
  }));
  ok(panneaux.dep && panneaux.wd && panneaux.wallet && panneaux.stake && panneaux.quests,
     'l accueil porte maintenant les cinq panneaux du compte');
  ok(panneaux.menu,
     'et leur declaration : c est elle que le menu du profil reflete, plutot que'
     + ' d ecrire sa propre liste');

  /* ---- LE PROFIL, PUIS « DEPOSIT », AU VRAI POINTEUR ----
     C etait « My Wallet » ; cette rangee a quitte le menu du profil — le
     portefeuille s ouvre par le rond en bas de page — et le defaut qu on
     mesure ici (partir vers le Coin Pusher au lieu d ouvrir sur place) vaut
     pour toutes les rangees de compte. */
  await p.click('#gxProfil');
  await p.waitForTimeout(700);
  const rangees = await p.evaluate(() =>
    [...document.querySelectorAll('#gxMenu a')].map((a) => a.textContent.trim()));
  ok(rangees.length > 3, `le menu du profil montre ${rangees.length} rangees`);
  ok(!rangees.some((t) => /wallet/i.test(t)),
     'et aucune rangee « Wallet » : le portefeuille a son rond en bas de page');
  const iw = rangees.findIndex((t) => /deposit/i.test(t));
  ok(iw >= 0, `dont « ${rangees[iw] || '—'} »`);

  const avant = p.url();
  await p.click(`#gxMenu a:nth-of-type(${iw + 1})`);
  await p.waitForTimeout(1600);
  const apres = p.url();
  eq(apres.split('?')[0], avant.split('?')[0],
     'le clic ne CHANGE PAS DE PAGE — c est tout le defaut signale : il partait'
     + ' vers le Coin Pusher');
  ok(!/pusher/i.test(apres), `et l adresse ne mentionne pas le pusher : ${apres.split('/').pop()}`);

  const vu = await p.evaluate(() => {
    const t = document.querySelector('.swpov.on');
    const l = document.querySelector('.swp-l');
    return { tiroir: !!t,
             titre: (document.querySelector('.swp-l .swp-h b, .swp-r b, .swp-l b') || {}).textContent || null,
             rempli: !!(l && l.textContent && l.textContent.trim().length > 20) };
  });
  ok(vu.tiroir, 'le tiroir s ouvre a la place');
  ok(vu.rempli,
     'et il montre quelque chose : un tiroir ouvert sur du vide serait le meme'
     + ' defaut sous un autre visage');

  ok(erreurs.length === 0, `aucune erreur de page${erreurs.length ? ' — ' + erreurs[0] : ''}`);
  await nav.close(); site.stop();
  console.log(`\ncompte_index.test.js : ${n} verifications, ${rates} rate(s)`);
  process.exit(rates ? 1 : 0);
})();
