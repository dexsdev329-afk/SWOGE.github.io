/* UNE EDITION LIMITEE, VUE DEPUIS L ECRAN — ET PAYEE EN OR.
 *
 * Le serveur sait tenir une edition et debiter la bonne monnaie
 * (skins_edition.test.js, 40 verifications). Ce fichier verifie l autre
 * moitie : ce que le joueur LIT avant d appuyer. C est la moitie ou une
 * erreur coute le plus cher, parce qu elle se voit sur un bouton d achat.
 *
 * 1. L UNITE EST CELLE DU SERVEUR. « 20 000 » se lit exactement pareil en or
 *    et en jetons. Un bouton qui affiche $SWOGE sur un prix en or fait
 *    deposer de l argent reel pour un achat qui n en demande pas.
 * 2. CE QU IL RESTE SE LIT SANS SOUSTRACTION, sur la carte comme sur la
 *    fiche.
 * 3. UNE EDITION EPUISEE NE PROPOSE PLUS D ACHETER — mais celui qui la
 *    possede deja peut TOUJOURS la porter. Un « SOLD OUT » a la place de son
 *    bouton lui ferait croire qu il l a perdue.
 * 4. ET L ACHAT EN OR NE TOUCHE PAS AU SOLDE EN JETONS. Verifie cote
 *    serveur, apres un vrai clic.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('skins_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('skins_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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

/* Deux editions POSEES PAR L ESSAI, jamais une du catalogue du jour : ce qui
   est verifie ici est le mecanisme, et une edition retiree demain ferait
   tomber un essai qui ne parle pas d elle. Elles sont posees AVANT de charger
   le serveur, pour qu il parte avec. */
const skins = require(path.join(SERVEUR, 'skins'));
const ACHETABLE = 'brett', PRIX_OR = 20000, COMBIEN = 2;
const EPUISEE = 'landwolf', PRIX_EPUISEE = 5000;
skins.EDITIONS[ACHETABLE] = { exemplaires: COMBIEN, prix: PRIX_OR, monnaie: 'or' };
skins.EDITIONS[EPUISEE] = { exemplaires: 1, prix: PRIX_EPUISEE, monnaie: 'or' };
/* Un temoin en JETONS, dans le meme ecran : si le libelle « GOLD » s ecrivait
   partout, cet essai-la seul le montrerait. */
const TEMOIN = 'pepe';

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/skinpage-');
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
   *
   * Le tiroir des personnages vit dans stakebubble.js, et son bouton ne
   * s'accroche que sur les pages qui ont une barre ou une bulle — le hall des
   * jeux, pas le Nexus. Mais la connexion par signature, elle, se fait sur la
   * socket du Nexus, qui est celle que l'essai sait piloter.
   *
   * On se connecte donc la ou on sait le faire, on garde le JETON DE SESSION
   * que le serveur rend avec l'authentification, et on le repose dans le
   * meme stockage local avant d'aller au hall : stakebubble reprend la
   * session tout seul, exactement comme un joueur qui change de page. */
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

  const q = moteur._p(w.address);
  q.hasDeposited = true;
  q.balance = WEI(500000);
  /* Riche en jetons, JUSTE assez riche en or : c est ce qui rend la
     verification du debit lisible. Un compte riche des deux cotes laisserait
     passer un debit pris dans la mauvaise poche sans qu on le voie. */
  q.fame = PRIX_OR + 3000;
  /* L autre edition est deja partie — son unique exemplaire. */
  moteur.skinsEmis = moteur.skinsEmis || {};
  moteur.skinsEmis[EPUISEE] = 1;

  /* On pose le jeton PUIS on va au hall. L'ordre compte : stakebubble tranche
     une seule fois, au chargement, s'il doit ouvrir sa propre socket. */
  await p.evaluate((t) => { localStorage.setItem('swogeSession', t); }, jeton);
  await p.goto(`http://127.0.0.1:${site.port}/games.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  /* `attached`, pas `visible` : sur le hall le bouton vit dans la barre du
     haut, qui peut etre repliee selon la largeur. L'essai clique par le DOM —
     ce qui compte est qu'il soit MONTE, pas qu'il tombe dans le viewport. */
  await p.waitForSelector('.swpb', { state: 'attached', timeout: 20000 });
  await p.waitForTimeout(1500);

  /* ---- ON OUVRE LE TIROIR COMME UN JOUEUR ----
     La pastille, puis l entree du sommaire. Poser `on` a la main sur le
     panneau montrerait des cartes que la page n a jamais peintes. */
  const ouvre = async () => {
    await p.evaluate(() => { document.querySelector('.swpb').click(); });
    await p.waitForSelector('.swpov.on', { timeout: 10000 });
    await p.evaluate(() => { document.querySelector('.swpov [data-k="sk"]').click(); });
    await p.waitForSelector('.swpov .swk-c', { timeout: 10000 });
    await p.waitForTimeout(500);
  };
  /* Rouvrir l onglet REDEMANDE l etat au serveur (profVa envoie `skins`) :
     c est ce qui rend les relectures d apres-achat honnetes. */
  const rouvre = async () => {
    await p.evaluate(() => { document.querySelector('.swpov [data-k="sk"]').click(); });
    await p.waitForTimeout(700);
  };
  const carte = (id) => p.evaluate((k) => {
    const d = document.querySelector('.swpov .swk-c[data-id="' + k + '"]');
    if (!d) return null;
    const b = d.querySelector('.bas');
    return { badge: (d.querySelector('.swk-ed') || {}).textContent || null,
             bouton: b ? b.textContent.trim() : null,
             estBouton: !!(b && b.querySelector('button')) };
  }, id);

  await ouvre();
  ok(true, 'le tiroir s ouvre sur le rayon des personnages');

  /* ================== 1. L UNITE VIENT DU SERVEUR ================== */
  console.log('\n-- vingt mille QUOI --');
  {
    const c = await carte(ACHETABLE);
    ok(!!c, 'la carte de l edition est a l ecran');
    ok(/GOLD/.test(c.bouton), `son bouton parle d or (${c.bouton})`);
    ok(!/SWOGE/.test(c.bouton), 'et surtout pas de $SWOGE');
    ok(c.bouton.indexOf('20,000') >= 0, 'avec le montant, tel qu il sera debite');
    const t = await carte(TEMOIN);
    ok(/SWOGE/.test(t.bouton), `le skin du bareme reste en jetons (${t.bouton})`);
    ok(!/GOLD/.test(t.bouton), 'le libelle « GOLD » ne s est pas repandu partout');
  }

  /* ================== 2. CE QU IL RESTE ================== */
  console.log('\n-- ce qu il reste, sans soustraction --');
  {
    const c = await carte(ACHETABLE);
    eq(c.badge, COMBIEN + ' left', 'la pastille donne le reste, pas le vendu');
    const t = await carte(TEMOIN);
    eq(t.badge, null, 'un skin sans edition n a aucune pastille a montrer');
    /* La fiche en grand donne le TOTAL avec : « 2 left » seul ne dit pas si
       l edition etait de deux ou de deux mille. */
    const fiche = await p.evaluate((k) => {
      document.querySelector('.swpov .swk-c[data-id="' + k + '"]').click();
      return null;
    }, ACHETABLE);
    await p.waitForTimeout(400);
    const gros = await p.evaluate(() => {
      const v = document.querySelector('.swk-v.on');
      return v ? { edl: (v.querySelector('.swk-edl') || {}).textContent || null,
                   avoir: (v.querySelector('.swk-avoir') || {}).textContent || null } : null;
    });
    ok(!!gros, 'la fiche en grand s ouvre');
    ok(/2 of 2 left/.test(gros.edl || ''), `elle donne le reste ET le total (${gros.edl})`);
    ok(/23,000 gold/.test(gros.avoir || ''),
       `et l or qu on a, sous un prix en or (${gros.avoir})`);
    await p.evaluate(() => { document.querySelector('.swk-v.on .swv-x').click(); });
    await p.waitForTimeout(300);
  }

  /* ================== 3. UNE EDITION DEJA PARTIE ================== */
  console.log('\n-- celle dont il ne reste rien --');
  {
    const c = await carte(EPUISEE);
    eq(c.badge, 'GONE', 'sa pastille le dit');
    eq(c.estBouton, false, 'et il n y a plus de bouton d achat');
    ok(/SOLD OUT/.test(c.bouton), `juste la mention (${c.bouton})`);
  }

  /* ================== 4. ON ACHETE, EN OR ================== */
  console.log('\n-- on paie, et c est l or qui part --');
  {
    const soldeAvant = moteur.balanceStr(w.address);
    await p.evaluate((k) => {
      document.querySelector('.swpov .swk-c[data-id="' + k + '"] .bas button').click();
    }, ACHETABLE);
    await p.waitForTimeout(1200);
    eq(moteur.possedeSkin(moteur._p(w.address), ACHETABLE), true, 'le skin est au joueur');
    eq(moteur._p(w.address).fame, 3000, `l or a paye — il en reste 3000`);
    eq(moteur.balanceStr(w.address), soldeAvant, 'le solde en jetons n a pas bouge');
    eq((moteur.skinsEmis || {})[ACHETABLE] | 0, 1, 'un exemplaire est parti');
    await rouvre();
    const c = await carte(ACHETABLE);
    eq(c.badge, '1 left', 'et l ecran le montre tout de suite');
  }

  /* ================== 5. EPUISEE, MAIS TOUJOURS PORTABLE ================== */
  console.log('\n-- epuisee ne veut pas dire perdue --');
  {
    /* Le dernier exemplaire part chez quelqu un d autre, et le joueur porte
       autre chose : c est exactement la situation ou un « SOLD OUT » pose a
       la place de son bouton lui ferait croire qu il a perdu son skin. */
    moteur.skinsEmis[ACHETABLE] = COMBIEN;
    moteur.choisitSkin(w.address, 'andy');
    await rouvre();
    const c = await carte(ACHETABLE);
    eq(c.badge, 'GONE', 'la pastille dit bien qu il n en reste plus');
    eq(c.estBouton, true, 'mais son proprietaire garde un bouton');
    ok(/Wear/.test(c.bouton), `et ce bouton le lui remet (${c.bouton})`);
  }

  ok(erreurs.length === 0, 'aucune erreur de page' + (erreurs.length ? ' : ' + erreurs[0] : ''));

  await nav.close(); site.stop();
  console.log(`\nskins_page.test.js : ${n} verifications, ${rates} rate(s)`);
  process.exit(rates ? 1 : 0);
})();
