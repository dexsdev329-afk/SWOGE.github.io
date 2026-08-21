/* LE PLAFOND DES STATS, VU DE LA PAGE.
 *
 * Deux choses, et elles se cassent differemment :
 *
 * 1. COMBIEN IL MANQUE. Le chiffre vient du SERVEUR. La page pourrait le
 *    refaire — elle a `base` et la table des potions — et c'est exactement ce
 *    qu'il ne faut pas : la meme formule des deux cotes du reseau finit par ne
 *    plus dire la meme chose, et le joueur lit « il te manque 3 » sur une stat
 *    pleine sans savoir lequel des deux chiffres ment.
 * 2. LE JAUNE QUAND C'EST PLEIN. Et il doit se decider sur la part
 *    PERMANENTE — niveau plus potions — jamais sur le total affiche. Celui-la
 *    contient l'equipement, qui se prete et se perd a la mort : une stat qui
 *    passerait pour pleine parce qu'on porte une bague redeviendrait creuse en
 *    changeant de bague, sans que rien ne l'explique.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('stats_max.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('stats_max.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
  const base = P.BASE.andy;

  const lignes = () => p.evaluate(() => {
    const out = {};
    document.querySelectorAll('#nxStats .nxp-st').forEach((el) => {
      const nom = (el.textContent.split(' - ')[0] || '').trim();
      const b = el.querySelector('b'), i = el.querySelector('i');
      out[nom] = { valeur: b ? b.textContent : null,
                   manque: i ? i.textContent : null,
                   max: el.classList.contains('max'),
                   couleur: b ? getComputedStyle(b).color : null };
    });
    return out;
  });
  const rafraichit = async () => {
    await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'personnage', skin: 'andy' })));
    await p.waitForTimeout(600);
  };

  /* ================== 1. AU DEPART, IL MANQUE BEAUCOUP ================== */
  console.log('\n-- un personnage neuf --');
  await rafraichit();
  const debut = await lignes();
  ok(Object.keys(debut).length >= 6, `les six stats sont affichees (${Object.keys(debut).length})`);
  ok(debut.ATT && debut.ATT.manque, `l ATT dit ce qu il manque (« ${debut.ATT && debut.ATT.manque} »)`);
  /* LE CHIFFRE EST CELUI DU SERVEUR, PAS UN CALCUL DE LA PAGE. */
  const etat = moteur.personnageEtat(w.address, 'andy');
  const attendu = etat.plafond.att.max - etat.plafond.att.atteint;
  ok(debut.ATT && debut.ATT.manque === '+' + attendu,
     `et c est le chiffre du serveur (+${attendu})`);
  ok(!debut.ATT.max, 'et rien n est jaune : rien n est plein');

  /* ================== 2. L EQUIPEMENT NE FAIT PAS « PLEIN » ==================
   *
   * Le total affiche monte, le manque NE BOUGE PAS : l equipement se prete et
   * se perd a la mort. Une stat qui passerait pour pleine parce qu on porte
   * une bague redeviendrait creuse en changeant de bague. */
  console.log('\n-- une bague ne remplit rien --');
  const bague = B.ITEMS.concat(B.ITEMS_DROP)
    .find((o) => P.bonusesDeObjet(o) && P.bonusesDeObjet(o).att > 0);
  ok(!!bague, `une piece qui donne de l ATT existe (${bague && bague.nom})`);
  q.objets = q.objets || {}; q.objets[bague.id] = 1;
  const slot = { grenat: 'equipeBague', saphir: 'equipeBague', emeraude: 'equipeBague',
                 topaze: 'equipeBague', amethyste: 'equipeBague', onyx: 'equipeBague' }[bague.famille]
    || (bague.saison === 3 ? 'equipeArmure' : bague.saison === 2 ? 'equipeArme' : 'equipeFruit');
  moteur[slot](w.address, 'andy', bague.id);
  await rafraichit();
  const avecBague = await lignes();
  ok(Number(avecBague.ATT.valeur) > Number(debut.ATT.valeur),
     `le total monte (${debut.ATT.valeur} -> ${avecBague.ATT.valeur})`);
  ok(avecBague.ATT.manque === debut.ATT.manque,
     `mais le manque ne bouge pas (${avecBague.ATT.manque})`);
  ok(!avecBague.ATT.max, 'et ca ne devient pas jaune');

  /* ================== 3. PLEIN : LE CHIFFRE PASSE AU JAUNE ================== */
  console.log('\n-- au plafond --');
  /* Niveau vingt et toutes les potions : c est tout ce qu on peut atteindre
     pour toujours. On le pose cote serveur, comme le ferait le jeu. */
  const c = moteur._persoDe(q, 'andy');
  c.xc = P.xpPour(P.NIVEAU_MAX) + 10;
  c.sup = {};
  for (const s of P.STATS) c.sup[s] = P.supMaxDe(s, base[s]);
  await rafraichit();
  const plein = await lignes();
  const jaune = 'rgb(255, 197, 61)';
  let pleines = 0, jaunes = 0;
  for (const k of ['ATT', 'DEF', 'SPD', 'DEX', 'VIT', 'WIS']) {
    if (plein[k] && plein[k].max) pleines++;
    if (plein[k] && plein[k].couleur === jaune) jaunes++;
  }
  ok(pleines === 6, `les six stats sont marquees pleines (${pleines})`);
  ok(jaunes === 6, `et les six chiffres sont JAUNES (${jaunes})`);
  ok(!plein.ATT.manque, 'et plus aucun manque affiche : le jaune le dit deja');

  /* ---- ET LE VERT DE L EQUIPEMENT NE GAGNE PAS SUR LE JAUNE ----
   * La bague est toujours portee : sans la regle CSS, `.up b` (vert) et
   * `.max b` (jaune) se disputent la ligne, et c est le dernier ecrit qui
   * gagne — donc le hasard de l ordre du fichier. */
  ok(plein.ATT.couleur === jaune,
     `meme avec une piece equipee, le plein l emporte (${plein.ATT.couleur})`);

  /* ================== 4. UN CRAN EN DESSOUS ================== */
  console.log('\n-- une potion de moins --');
  c.sup.att = Math.max(0, P.supMaxDe('att', base.att) - 1);
  await rafraichit();
  const presque = await lignes();
  ok(!presque.ATT.max, 'une potion de moins, et l ATT n est plus jaune');
  ok(presque.ATT.manque === '+' + P.supPas('att'),
     `et il manque exactement une potion (${presque.ATT.manque})`);
  ok(presque.DEF.max, 'pendant que la DEF, elle, reste pleine');

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nstats_max.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
