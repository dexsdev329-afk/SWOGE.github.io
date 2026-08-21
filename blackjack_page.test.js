/* LA TABLE DE BLACKJACK DANS LE NEXUS.
 *
 * Le jeu existe deja tout entier cote serveur, sur la MEME socket et le MEME
 * solde. Ce panneau n est qu une porte de plus : il envoie les cinq messages
 * et peint l etat qu on lui renvoie. Il ne decide de rien — et c est ce que
 * cet essai verifie, en jouant une main entiere par les vrais boutons.
 *
 * Ce qui compte, dans l ordre :
 *
 * 1. ON Y ARRIVE EN MARCHANT. Un panneau qu on ouvre en trichant ne prouve
 *    pas que le lieu existe.
 * 2. LE SOLDE EST LE MEME QUE PARTOUT AILLEURS. C est tout l interet d avoir
 *    branche le Nexus sur le jeu existant plutot que d en ecrire un second.
 * 3. LES CARTES SE DESSINENT. Une main sans image est une main qu on ne peut
 *    pas jouer.
 * 4. LA CROIX TIENT. Meme repos que l etal, et pour la meme raison : sans lui
 *    la table se rouvre sous les doigts tant qu on est dessus.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('blackjack_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('blackjack_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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

  /* ================== 1. ON Y VA EN MARCHANT ================== */
  console.log('\n-- on marche jusqu a la table --');
  for (let k = 0; k < 30 && !(await ouvert()); k++) {
    const v = await p.evaluate(() => ({ moi: window.__moi, t: window.__table }));
    if (!v.moi || !v.t) { await marche('ArrowDown', 200); continue; }
    const ex = v.t.x - v.moi.x, ey = v.t.y - v.moi.y;
    if (Math.abs(ex) < 70 && Math.abs(ey) < 70) { await p.waitForTimeout(600); continue; }
    if (Math.abs(ex) > Math.abs(ey)) await marche(ex > 0 ? 'ArrowRight' : 'ArrowLeft', 320);
    else await marche(ey > 0 ? 'ArrowDown' : 'ArrowUp', 320);
  }
  ok(await ouvert(), 'marcher sur la table ouvre le panneau de blackjack');

  const vu = () => p.evaluate(() => {
    const c = document.querySelector('#nxBjVoile .nxbj-corps');
    return {
      cartes: c.querySelectorAll('.nxbj-c').length,
      images: c.querySelectorAll('.nxbj-c img').length,
      dos: c.querySelectorAll('.nxbj-c.dos').length,
      boutons: Array.from(c.querySelectorAll('[data-bj]')).map((b) => b.getAttribute('data-bj')),
      solde: (c.querySelector('.nxbj-solde b') || {}).textContent || null,
      res: (c.querySelector('.nxbj-res') || {}).textContent || null,
      refus: (c.querySelector('.nxcf-refus') || {}).textContent || null,
    };
  });

  let e = await vu();
  ok(e.boutons.indexOf('deal') >= 0, 'on peut miser et distribuer');
  /* LE SOLDE EST CELUI DU COMPTE, pas un chiffre a part. */
  eq(Number(e.solde), Math.floor(Number(moteur.balanceStr(w.address))),
     `le solde affiche est celui du compte (${e.solde})`);

  /* ================== 2. UNE MAIN, PAR LES VRAIS BOUTONS ================== */
  console.log('\n-- on joue une main --');
  const avant = Number(moteur.balanceStr(w.address));
  await p.click('#nxBjVoile [data-mise="10"]');
  await p.waitForTimeout(150);
  await p.click('#nxBjVoile [data-bj="deal"]');
  await p.waitForTimeout(700);
  e = await vu();
  ok(!e.refus, `la mise est acceptee (${e.refus || 'aucun refus'})`);
  ok(e.images >= 3, `les cartes sont DESSINEES (${e.images} images)`);
  /* Le croupier cache sa seconde carte, et elle se dessine quand meme : sans
     elle on croit la donne incomplete. */
  ok(e.dos >= 1 || e.boutons.length === 0,
     `la carte cachee du croupier est la (${e.dos} dos)`);
  const apresMise = Number(moteur.balanceStr(w.address));
  ok(apresMise < avant, `la mise a ete debitee (${avant} -> ${apresMise})`);

  /* On termine la main quoi qu il arrive : elle peut etre finie d office (un
     blackjack naturel), ou demander une decision. */
  for (let k = 0; k < 12; k++) {
    e = await vu();
    if (e.boutons.indexOf('stand') >= 0) { await p.click('#nxBjVoile [data-bj="stand"]'); }
    else if (e.boutons.indexOf('noins') >= 0) { await p.click('#nxBjVoile [data-bj="noins"]'); }
    else break;
    await p.waitForTimeout(600);
  }
  e = await vu();
  ok(e.boutons.indexOf('deal') >= 0, 'la main est finie : on peut en remiser une');
  ok(!!e.res, `le resultat est annonce (« ${e.res} »)`);
  /* Le solde affiche suit celui du compte, sans aller-retour de plus. */
  eq(Number(e.solde), Math.floor(Number(moteur.balanceStr(w.address))),
     `et le solde affiche suit (${e.solde})`);

  /* ================== 3. LA CROIX TIENT ================== */
  console.log('\n-- on ferme, et on reste dessus --');
  await p.evaluate(() => document.querySelector('#nxBjVoile .nxcf-x').click());
  await p.waitForTimeout(200);
  ok(!(await ouvert()), 'la croix ferme la table');
  await p.waitForTimeout(3000);
  ok(!(await ouvert()), 'trois secondes plus tard, toujours fermee');
  /* Le meme repos que l etal — c est le meme mecanisme, indexe par la cle du
     lieu, et non une deuxieme copie. */
  await p.waitForTimeout(8000);
  ok(!(await ouvert()), 'et passe les dix secondes : on n a pas quitte la table');

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nblackjack_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
