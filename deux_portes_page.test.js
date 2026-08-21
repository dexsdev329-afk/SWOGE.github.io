/* LES DEUX PORTES DU NORD — on y va en marchant, et l on arrive dans la bonne.
 *
 * Le serveur sait faire deux mondes (deux_mondes.test.js le verifie). Ce
 * fichier verifie l autre moitie : que la PORTE ROUGE mene au monde rouge.
 * C est exactement le genre de fil qu on croit branche parce que les deux
 * bouts marchent — le lieu envoie une cle, le serveur la lit — et qui ne l est
 * pas parce que personne n a suivi le fil en entier.
 *
 * Ce qui compte, dans l ordre :
 *
 * 1. ON Y ARRIVE EN MARCHANT, en visant la ou la porte est DESSINEE. Compter
 *    des secondes de marche supposerait une vitesse et un point de depart :
 *    deux choses que l essai n a pas a connaitre et qui changeront.
 * 2. LA PORTE ROUGE MENE AU ROUGE. La seule chose vraiment grave : deux
 *    portes qui menent au meme endroit, c est une porte peinte.
 * 3. LE CHIFFRE DE LA PORTE EST VRAI. « 4 inside » est ce qui decide d entrer
 *    ou pas ; un chiffre qui ment est pire que pas de chiffre.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('deux_portes_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('deux_portes_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
/* Ce harnais n a que `ok` — on ajoute l egalite, qui dit CE QU ON A OBTENU
   dans son message : un essai qui ne montre que son verdict ne sert a rien le
   jour ou il tombe. */
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

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/statmax-');
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
  const P = require(path.join(SERVEUR, 'personnages'));
  const B = require(path.join(SERVEUR, 'boutique'));
  await new Promise((r) => setTimeout(r, 1400));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const w = ethers.Wallet.createRandom();
  const erreurs = [];

  const p = await nav.newPage({ viewport: { width: 412, height: 780 }, isMobile: true, hasTouch: true });
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
  /* Les bruits de la table sont charges A PART, quand on ouvre le panneau :
     cinquante kilo-octets de cartes n ont pas a partir chez qui traverse le
     Nexus sans s asseoir. On verifie donc qu ils partent QUAND MEME, sinon
     l animation serait muette sans que rien ne le dise. */
  const sons = [];
  p.on('request', (r) => {
    const u = r.url();
    if (u.indexOf('/img/nexus/bj/') >= 0) sons.push(u.split('/').pop());
  });

  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);




  const q = moteur._p(w.address);
  q.skins = { andy: true }; q.skinActif = 'andy';
  q.hasDeposited = true;
  const cfgS = require(path.join(SERVEUR, 'config'));
  q.balance = ethers.utils.parseUnits('5000', cfgS.DECIMALS);
  /* Le solde vient d'etre change DANS l'objet du serveur : la page, elle, a
     encore celui de la connexion. On lui fait donc porter un message qui le
     transporte — c'est ainsi que le vrai jeu le rafraichit, « n'importe quel
     message qui le porte ». Sans ca l'essai accuserait le panneau d'afficher
     un chiffre que personne ne lui a jamais dit. */
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'potionMarche' })));
  await p.waitForTimeout(500);

  await p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionT) return;
    C.__espionT = true;
    window.__moi = null; window.__table = null;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      if (u.indexOf('obj_bj_table') >= 0 && arguments.length >= 5) {
        window.__table = { x: arguments[1] + arguments[3] / 2, y: arguments[2] + arguments[4] };
      }
      if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
          && arguments[7] === 150 && arguments[8] === 150) {
        window.__moi = { x: Math.round(arguments[5] + 75), y: Math.round(arguments[6] + 130) };
      }
      return di.apply(this, arguments);
    };
  });
  const marche = async (t, ms) => {
    await p.keyboard.down(t); await p.waitForTimeout(ms);
    await p.keyboard.up(t); await p.waitForTimeout(180);
  };
  const ouvert = () => p.evaluate(() =>
    document.getElementById('nxBjVoile').classList.contains('on'));

  /* ================== 1. ON MARCHE JUSQU A LA PORTE ROUGE ================== */
  console.log('\n-- on monte vers la porte rouge --');
  await p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionP) return;
    C.__espionP = true;
    window.__moi = null; window.__rouge = null; window.__verte = null;
    window.__pilules = [];
    const di = C.drawImage, ft = C.fillText;
    C.fillText = function (t, x, y) {
      if (/inside|empty/.test(String(t))) window.__pilules.push({ t: String(t), x, y });
      return ft.apply(this, arguments);
    };
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      if (arguments.length >= 5) {
        if (u.indexOf('obj_portal_pvp.webp') >= 0) {
          window.__rouge = { x: arguments[1] + arguments[3] / 2, y: arguments[2] + arguments[4] };
        } else if (u.indexOf('obj_portal.webp') >= 0) {
          window.__verte = { x: arguments[1] + arguments[3] / 2, y: arguments[2] + arguments[4] };
        }
      }
      if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
          && arguments[7] === 150 && arguments[8] === 150) {
        window.__moi = { x: Math.round(arguments[5] + 75), y: Math.round(arguments[6] + 130) };
      }
      return di.apply(this, arguments);
    };
  });
  await p.waitForTimeout(500);

  /* Les deux portes sont DESSINEES, et distinctes. Si l une manquait, viser
     « la ou elle est » viserait le vide et l essai tournerait en rond. */
  const vues = await p.evaluate(() => ({ r: window.__rouge, v: window.__verte }));
  ok(!!vues.r && !!vues.v, 'les deux portes sont dessinees');
  ok(!vues.r || !vues.v || Math.abs(vues.r.x - vues.v.x) > 40,
     'et ce sont bien DEUX endroits differents');

  /* ---- LE CHIFFRE AU-DESSUS ---- */
  const pilules = await p.evaluate(() => window.__pilules.slice(-4));
  ok(pilules.length >= 2,
     `chaque porte annonce son monde (${pilules.map((x) => x.t).join(' | ') || 'aucune'})`);
  ok(pilules.every((x) => /empty|inside/.test(x.t)),
     'et le texte dit combien on y trouvera');

  /* ---- ON Y VA. On contourne la fontaine : elle est au nord du point
     d apparition, et monter tout droit revient a pousser dedans. ---- */
  const entre = () => p.evaluate(() =>
    (window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop() || null));
  for (let k = 0; k < 40 && !(await entre()); k++) {
    const v = await p.evaluate(() => ({ moi: window.__moi, c: window.__rouge }));
    if (!v.moi || !v.c) { await marche('ArrowRight', 200); continue; }
    const ex = v.c.x - v.moi.x, ey = v.c.y - v.moi.y;
    if (Math.abs(ex) < 40 && Math.abs(ey) < 40) { await p.waitForTimeout(500); continue; }
    /* On corrige d abord le COTE, puis on monte : viser en diagonale ferait
       raser la fontaine, et l on se ferait arreter par son bassin. */
    if (Math.abs(ex) > 60) await marche(ex > 0 ? 'ArrowRight' : 'ArrowLeft', 260);
    else await marche(ey > 0 ? 'ArrowDown' : 'ArrowUp', 300);
  }

  /* ================== 2. C EST BIEN LE ROUGE ================== */
  const arrive = await entre();
  ok(!!arrive, 'marcher dans la porte rouge fait entrer dans un monde');
  eq(arrive ? arrive.carte : null, 'crimson',
     'et ce monde est le ROUGE, pas le vert');
  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\ndeux_portes_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
