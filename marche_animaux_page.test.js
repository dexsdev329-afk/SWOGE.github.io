/* VENDRE UN OEUF ET UN FAMILIER, DEPUIS LA BOUTIQUE DU HALL.
 *
 * Le serveur sait le faire (marche_animaux.test.js, 42 verifications). Ce
 * fichier verifie l autre moitie, celle qui decide si le joueur peut s en
 * servir : le joueur a cherche « vendre mon oeuf » dans la boutique du Nexus
 * et ne l a pas trouve. Un serveur qui sait faire ce qu aucun ecran ne
 * propose ne fait rien.
 *
 * 1. LE RAYON EXISTE, et il montre les deux listes ensemble — l enclos et le
 *    coffre a oeufs. « Tu as cet animal, donc cet oeuf-la ne peut plus
 *    eclore » est UNE phrase ; deux onglets obligeraient a l aller-retour.
 * 2. LE PRIX SE FIXE, et la vente part avec.
 * 3. CE QUI PART N EST PLUS LA. Le sequestre se lit a l ecran, pas seulement
 *    dans la memoire du serveur.
 * 4. ET UN OEUF QU ON PEUT ENCORE OUVRIR SE REPREND, sans passer par un prix.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('marche_animaux_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('marche_animaux_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
  q.hasDeposited = true;
  const ethers2 = ethers;
  const WEI = (x) => ethers2.utils.parseUnits(String(x), require(path.join(SERVEUR, 'config')).DECIMALS);
  q.balance = WEI(100000);

  /* Un DEUXIEME joueur, cote serveur : il faut quelqu'un en face pour qu'une
     vente existe. Se racheter a soi-meme est justement le cas que le marche
     refuse, donc l'essai ne pourrait rien prouver avec un seul compte. */
  const autre = ethers.Wallet.createRandom().address.toLowerCase();
  const qa = moteur._p(autre);
  qa.hasDeposited = true; qa.balance = WEI(100000);


  /* Un familier nourri et deux oeufs au coffre, par les chemins du jeu : le
     tenebre est eclos (donc son oeuf ne peut plus s ouvrir), le feu non. */
  q.sacOeufs = { tenebre: 1, feu: 1, glace: 1 };
  moteur.ouvreOeuf(w.address, 'tenebre');
  q.familiers.tenebre.xp = 3 * 30 * 31;              // niveau 31
  moteur.rangeOeuf(w.address, 'feu');
  moteur.rangeOeuf(w.address, 'glace');
  q.sacOeufs.tenebre = 1;                            // un doublon, qu on rangera
  moteur.rangeOeuf(w.address, 'tenebre');

  /* ---- ON VA A L ETAL EN MARCHANT ----
   * Poser `on` sur le voile a la main afficherait la carte sans que la page se
   * croie ouverte : elle ne la repeindrait a aucun message, et l essai
   * mesurerait un ecran fige. On vise l etal la ou il est DESSINE. */
  await p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionEtal) return;
    C.__espionEtal = true;
    window.__moi = null; window.__etal = null;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      if (u.indexOf('obj_market_stall') >= 0 && arguments.length >= 5) {
        window.__etal = { x: arguments[1] + arguments[3] / 2, y: arguments[2] + arguments[4] };
      }
      if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
          && arguments[7] === 150 && arguments[8] === 150) {
        window.__moi = { x: Math.round(arguments[5] + 75), y: Math.round(arguments[6] + 130) };
      }
      return di.apply(this, arguments);
    };
  });
  const pas = async (t, ms) => {
    await p.keyboard.down(t); await p.waitForTimeout(ms);
    await p.keyboard.up(t); await p.waitForTimeout(140);
  };
  const ouvert = () => p.evaluate(() =>
    document.getElementById('nxShopVoile').classList.contains('on'));
  const moi = () => p.evaluate(() => window.__moi);
  const etal = () => p.evaluate(() => window.__etal);
  await p.waitForTimeout(400);
  /* Deux temps SEPARES, jamais un arbre de decisions relu a chaque pas : il
     oscille des qu on est aligne sur un axe et pas sur l autre. */
  for (let k = 0; k < 20 && !(await ouvert()); k++) {
    const m = await moi(); const e = await etal();
    if (!m || !e || Math.abs(m.y - e.y) <= 40) break;
    await pas(m.y > e.y ? 'ArrowUp' : 'ArrowDown', 200);
  }
  for (let k = 0; k < 24 && !(await ouvert()); k++) {
    const m = await moi(); const e = await etal();
    if (!m || !e) break;
    await pas(m.x > e.x ? 'ArrowLeft' : 'ArrowRight', 200);
  }
  ok(await ouvert(), 'la boutique du hall s ouvre en marchant jusqu a l etal');

  /* ================== 1. LE RAYON DES ANIMAUX ================== */
  console.log('\n-- le rayon des animaux --');
  const onglet = await p.evaluate(() => {
    const b = document.querySelector('#nxShopVoile .nxsh-ong button[data-s="pet"]');
    if (!b) return null;
    b.click();
    return b.textContent;
  });
  ok(!!onglet, `l onglet existe (${onglet})`);
  await p.waitForTimeout(900);
  const rayon = await p.evaluate(() => {
    const c = document.querySelector('#nxShopVoile .nxsh-corps');
    return {
      fams: Array.from(c.querySelectorAll('[data-vendfam]')).map((e) => e.getAttribute('data-vendfam')),
      oeufs: Array.from(c.querySelectorAll('[data-oeufc]')).map((e) => ({
        espece: e.getAttribute('data-oeufc'),
        reprend: !!e.querySelector('[data-sortir]'),
        texte: e.textContent })),
      titres: Array.from(c.querySelectorAll('.nxsh-titre')).map((e) => e.textContent),
    };
  });
  ok(rayon.fams.indexOf('tenebre') >= 0, `l enclos montre le familier (${rayon.fams.join(',')})`);
  ok(rayon.oeufs.length === 3, `le coffre montre les trois oeufs (${rayon.oeufs.length})`);
  eq(rayon.titres.length, 2, 'les deux listes sont dans le MEME rayon');
  /* ---- LA PHRASE QUI COMPTE ----
   * « Tu as cet animal, donc cet oeuf-la ne peut plus eclore. » Le serveur la
   * dit (`eclos`) ; la page doit la MONTRER, sinon le joueur traverse la
   * carte pour ouvrir un oeuf qui sera refuse. */
  const tenebre = rayon.oeufs.filter((o) => o.espece === 'tenebre')[0];
  const feu = rayon.oeufs.filter((o) => o.espece === 'feu')[0];
  ok(/cannot hatch again/.test(tenebre.texte),
     'l oeuf dont l animal est deja eclos le DIT');
  ok(tenebre.reprend === false,
     'et il ne propose pas de le reprendre — il n y a rien a en faire au sac');
  ok(/never hatched/.test(feu.texte), 'celui qu on peut encore ouvrir le dit aussi');
  ok(feu.reprend === true, 'et lui se reprend');

  /* ================== 2. ON REPREND UN OEUF ================== */
  console.log('\n-- on en reprend un --');
  const avantSac = moteur.sacRempli(w.address);
  await p.evaluate(() => {
    document.querySelector('#nxShopVoile [data-oeufc="feu"] [data-sortir]').click();
  });
  await p.waitForTimeout(800);
  eq(moteur.sacRempli(w.address), avantSac + 1, 'il revient dans le sac');
  eq(moteur.oeufsDuCoffre(w.address).length, 2, 'et quitte le coffre');

  /* ================== 3. ON EN VEND UN ================== */
  console.log('\n-- on vend l oeuf qu on ne peut plus ouvrir --');
  await p.evaluate(() => {
    const l = document.querySelector('#nxShopVoile [data-oeufc="tenebre"]');
    const b = Array.from(l.querySelectorAll('button')).filter((x) => /Sell/.test(x.textContent))[0];
    b.click();
  });
  await p.waitForTimeout(300);
  const form = await p.evaluate(() => {
    const z = document.querySelector('#nxShopVoile .nxsh-prix');
    return { ouvert: z && !z.hidden, quoi: z ? z.querySelector('.nxsh-quoi').textContent : '' };
  });
  ok(form.ouvert, 'le champ de prix s ouvre');
  ok(/5%/.test(form.quoi), `et il annonce la part de la maison (${form.quoi.trim().slice(0, 70)})`);
  /* ---- UN PRIX VIDE NE VEND RIEN ----
   * Sans ce garde-fou, un clic sur « Put up for sale » enverrait un prix a
   * zero et le serveur le refuserait — le joueur croirait a une panne. */
  const avantAnn = (moteur.marche || []).length;
  await p.evaluate(() => document.querySelector('#nxShopVoile .nxsh-prix .go').click());
  await p.waitForTimeout(500);
  eq((moteur.marche || []).length, avantAnn, 'sans prix, rien n est mis en vente');

  await p.evaluate(() => {
    document.querySelector('#nxShopVoile .nxsh-prix input').value = '7500';
    document.querySelector('#nxShopVoile .nxsh-prix .go').click();
  });
  await p.waitForTimeout(900);
  const ann = (moteur.marche || []).filter((a) => a.oeuf === 'tenebre')[0];
  ok(!!ann, 'l annonce existe cote serveur');
  eq(ann && ann.prix, 7500, 'au prix qu on a tape — il est LIBRE');
  eq(moteur.oeufsDuCoffre(w.address).filter((o) => o.espece === 'tenebre').length, 0,
     'et l oeuf a QUITTE le coffre : le sequestre se voit');

  /* ================== 4. ET LE FAMILIER ================== */
  console.log('\n-- et le familier, avec sa progression --');
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const l = document.querySelector('#nxShopVoile [data-vendfam="tenebre"]');
    Array.from(l.querySelectorAll('button')).filter((x) => /Sell/.test(x.textContent))[0].click();
  });
  await p.waitForTimeout(300);
  const dit = await p.evaluate(() =>
    document.querySelector('#nxShopVoile .nxsh-prix .nxsh-quoi').textContent);
  ok(/for good/.test(dit),
     `la page DIT que la vente est definitive (${dit.trim().slice(0, 80)})`);
  const xpAvant = moteur.familiersDe(w.address)[0].xp;
  await p.evaluate(() => {
    document.querySelector('#nxShopVoile .nxsh-prix input').value = '90000';
    document.querySelector('#nxShopVoile .nxsh-prix .go').click();
  });
  await p.waitForTimeout(900);
  const annF = (moteur.marche || []).filter((a) => a.fam)[0];
  ok(!!annF, 'l annonce du familier existe');
  eq(annF && annF.fam.xp, xpAvant, 'avec son XP — c est CELUI qu on a nourri');
  eq(moteur.familiersDe(w.address).length, 0, 'et il a quitte l enclos');

  /* ---- ET L ECRAN LE MONTRE ----
   * Le serveur peut avoir raison et l ecran garder l ancien etat : c est
   * exactement ce qui fait croire a une panne. */
  await p.waitForTimeout(500);
  const apres = await p.evaluate(() => ({
    fams: document.querySelectorAll('#nxShopVoile [data-vendfam]').length,
    oeufs: document.querySelectorAll('#nxShopVoile [data-oeufc]').length,
  }));
  eq(apres.fams, 0, 'l enclos est vide a l ecran aussi');
  eq(apres.oeufs, 1, 'et il ne reste qu un oeuf au coffre');

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nmarche_animaux_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
