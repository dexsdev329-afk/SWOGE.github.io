/* RAMASSER UNE POTION DE STAT, VU DE LA PAGE.
 *
 * Le serveur sait le faire — `fioles.test.js` le prouve, et une sonde par la
 * socket le refait a chaque coup. Ce qui reste a la page est exactement ce qui
 * se casse en silence :
 *
 * 1. LA FIOLE SE VOIT DANS LE SAC AU SOL. Une case vide sur un sac bleu et
 *    l'on croit que le sac est vide — on passe a cote de la seule chose rare
 *    du jeu.
 * 2. MARCHER DESSUS LA PREND. C'est le geste par defaut depuis le ramassage
 *    automatique ; s'il saute les fioles, elles pourrissent au sol.
 * 3. ELLE ARRIVE DANS NOTRE SAC, ET LA CASE SE REMPLIT. Prise mais invisible,
 *    c'est le meme symptome qu'un ramassage rate — on reclique, et rien.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('fiole_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('fiole_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/fiole-');
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
  const { Realm } = require(path.join(SERVEUR, 'realm'));
  let monde0 = null; const pas0 = Realm.prototype.pas;
  Realm.prototype.pas = function (dt) { if (!this.plan) monde0 = this; return pas0.call(this, dt); };
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const M = require(path.join(SERVEUR, 'monde'));
  const P = require(path.join(SERVEUR, 'personnages'));
  await new Promise((r) => setTimeout(r, 1400));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const w = ethers.Wallet.createRandom();
  const erreurs = [];

  const p = await nav.newPage({ viewport: { width: 1280, height: 800 } });
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
  await p.waitForTimeout(1000);
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForTimeout(1600);
  const addr = w.address.toLowerCase();
  ok(!!monde0 && monde0.joueurs.has(addr), 'on est dans le monde de combat');

  /* ================== 1. LE SAC BLEU MONTRE SA FIOLE ================== */
  //
  // Le sac du joueur est REMPLI d'abord. Sans ca, le ramassage automatique vide
  // le sac au sol dans le dixieme de seconde qui suit, et la grille qu'on
  // voulait regarder n'a jamais existe : l'essai mesurait alors « la fiole ne
  // s'affiche pas » alors qu'elle etait deja dans notre sac.
  console.log('\n-- le sac au sol --');
  const B = require(path.join(SERVEUR, 'boutique'));
  const piece = B.ITEMS_DROP.find((o) => o.rarete === 'commun');
  const q = moteur._p(w.address);
  /* `libre` places libres, FIOLES COMPRISES. Compter en pieces communes seules
     mentait des que le joueur en avait ramasse une : le sac paraissait a moitie
     vide et il etait plein, et l'essai mesurait alors un refus qu'il croyait
     avoir evite. `sacRempli` est la seule verite — on lui demande. */
  const remplit = (libre) => {
    q.sac = {}; q.sacCases = null;
    const fioles = moteur.sacRempli(w.address);
    const n = Math.max(0, 8 - libre - fioles);
    if (n > 0) q.sac[piece.id] = n;
    q.sacCases = null;
  };
  remplit(0);
  const j = monde0.joueurs.get(addr);
  const sac = { id: monde0._nouvelId(), x: j.x, y: j.y, sac: 'bleu',
                reste: M.SAC.duree, contenu: [{ stat: 'att' }] };
  monde0.sacs.push(sac);
  await p.waitForTimeout(900);
  const grille = await p.evaluate(() => {
    const e = document.getElementById('nxButin');
    const c = document.getElementById('nxButinCases');
    const n = document.getElementById('nxButinNom');
    return { visible: !!(e && !e.hidden), nom: n ? n.textContent : '',
             fioles: c ? c.querySelectorAll('u.fiole').length : -1,
             pleines: c ? c.querySelectorAll('.nxp-c:not(.vide)').length : -1 };
  });
  ok(grille.visible, 'le sac au sol s\'ouvre dans le panneau');
  ok(grille.pleines >= 1, `et il n'est pas vide (${grille.pleines} place(s) pleine(s))`);
  ok(grille.fioles >= 1, `la fiole s'y VOIT (${grille.fioles} dessin(s))`);

  /* ---- ET SAC PLEIN, ELLE RESTE AU SOL ----
   * C'est le cas qui compte : huit places prises par de l'equipement commun, et
   * la chose la plus rare du jeu qui ne rentre plus. */
  await p.waitForTimeout(900);
  ok(monde0.sacs.some((s) => s.id === sac.id),
     'sac plein : la fiole reste par terre');
  const dit = await p.evaluate(() => {
    const s = window.__s[0];
    const r = s.__m.filter((m) => m.type === 'realmRamasse' && m.refus);
    return { n: r.length, auto: r.filter((m) => m.auto).length,
             fiole: r.filter((m) => m.stat).length };
  });
  ok(dit.n > 0, `et le joueur l'APPREND (${dit.n} refus annonce(s))`);
  ok(dit.fiole > 0, 'et l\'annonce dit que c\'est une FIOLE qu\'on laisse');
  /* ---- UNE FOIS, PAS DIX PAR SECONDE ----
   * `ramassageAuto` tourne a chaque image du serveur. Un refus par tour ferait
   * clignoter le message sans fin — c'est exactement pour ca qu'il avait ete
   * retire au depart, et le remettre sans cette borne aurait refait le meme
   * defaut dans l'autre sens. */
  ok(dit.n <= 2, `et une seule fois, pas a chaque image (${dit.n})`);

  /* ================== 2. MARCHER DESSUS LA PREND ================== */
  console.log('\n-- le ramassage --');
  remplit(8);
  await p.waitForTimeout(1400);
  const apres = {
    fioles: moteur.fiolesPour(w.address).filter((f) => f.sac > 0),
    auSol: monde0.sacs.filter((s) => s.id === sac.id).length,
  };
  ok(apres.fioles.length === 1,
     `marcher dessus la prend (${JSON.stringify(apres.fioles.map((f) => f.cle))})`);
  ok(apres.auSol === 0, 'et le sac au sol a disparu, vide');

  /* ================== 3. ET ELLE REMPLIT SA CASE ================== */
  console.log('\n-- notre sac --');
  const mien = await p.evaluate(() => {
    const c = document.getElementById('nxSac');
    return { fioles: c ? c.querySelectorAll('u.fiole').length : -1,
             pleines: c ? c.querySelectorAll('.nxp-c:not(.vide)').length : -1,
             html: c ? c.innerHTML.slice(0, 200) : '' };
  });
  ok(mien.pleines >= 1, `une case de NOTRE sac s'est remplie (${mien.pleines})`);
  ok(mien.fioles >= 1, `et c'est bien une fiole qu'on y voit (${mien.fioles})`);

  /* ================== 4. LE CLIC, AUSSI ==================
   * Le ramassage automatique est le geste par defaut, mais la grille reste
   * cliquable : un joueur qui a le sac plein en vide une place et vient
   * chercher CETTE fiole-la. */
  console.log('\n-- a la main --');
  const sac2 = { id: monde0._nouvelId(), x: j.x, y: j.y, sac: 'bleu',
                 reste: M.SAC.duree, contenu: [{ stat: 'def' }, { stat: 'spd' }] };
  /* Sac plein pour que le ramassage automatique refuse : on veut mesurer le
     CLIC, pas la marche. Sept pieces plus la fiole deja prise font huit — la
     fiole compte une place, c'est tout l'interet du systeme. */
  remplit(0);
  monde0.sacs.push(sac2);
  await p.waitForTimeout(1200);
  const plein = await p.evaluate(() => {
    const c = document.getElementById('nxButinCases');
    return c ? c.querySelectorAll('.nxp-c:not(.vide)').length : -1;
  });
  ok(plein >= 2, `sac plein : les deux fioles restent au sol (${plein})`);
  /* On libere DEUX places — une pour la fiole deja prise, une pour la
     nouvelle — puis on double-clique sur la premiere. */
  remplit(2);
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'sac' })));
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const el = document.querySelector('#nxButinCases .nxp-c:not(.vide)');
    if (el) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await p.waitForTimeout(900);
  const apresClic = moteur.fiolesPour(w.address).filter((f) => f.sac > 0);
  ok(apresClic.length >= 2,
     `le double-clic prend la fiole (${JSON.stringify(apresClic.map((f) => f.cle + 'x' + f.sac))})`);

  /* ================== 5. UNE SEULE PLACE : C'EST LA FIOLE QU'ON PREND ==================
   *
   * Le geste automatique avancait de la place 0 vers la place 7, dans l'ordre
   * ou le sac les avait rangees — donc au hasard. Une place libre, un sac
   * contenant des pieces communes ET une fiole, et l'on emportait la piece
   * commune parce qu'elle etait en tete. La chose la plus rare du jeu restait
   * par terre et finissait sa minute.
   */
  console.log('\n-- ce qu\'on prend quand on ne peut en prendre qu\'un --');
  const avantF = moteur.fiolesPour(w.address).filter((f) => f.sac > 0)
    .reduce((t, f) => t + f.sac, 0);
  remplit(1);                                  // exactement UNE place libre
  const sac3 = { id: monde0._nouvelId(), x: j.x, y: j.y, sac: 'brun',
                 reste: M.SAC.duree,
                 contenu: [moteur.tireButin('commun', Math.random),
                           moteur.tireButin('commun', Math.random),
                           { stat: 'wis' },
                           moteur.tireButin('commun', Math.random)].filter(Boolean) };
  ok(sac3.contenu.length >= 3, 'un sac ou la fiole n\'est PAS en premiere place');
  ok(!sac3.contenu[0].stat, 'la premiere place est une piece commune');
  monde0.sacs.push(sac3);
  await p.waitForTimeout(1400);
  const apresF = moteur.fiolesPour(w.address).filter((f) => f.cle === 'wis' && f.sac > 0);
  ok(apresF.length === 1, 'c\'est la FIOLE qu\'on a emportee, pas le commun');
  const resteAuSol = monde0.sacs.find((s) => s.id === sac3.id);
  ok(resteAuSol && resteAuSol.contenu.every((o) => !o.stat),
     `et les communs sont restes par terre (${resteAuSol ? resteAuSol.contenu.length : 0})`);

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nfiole_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
