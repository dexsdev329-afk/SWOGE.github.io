/* L'ETAL DES POTIONS, VU DE LA PAGE.
 *
 * Le stock de la boutique vient des joueurs. Cet essai fait le tour complet
 * du geste — on met en vente, quelqu'un achete, l'argent tombe — parce que
 * c'est le seul moyen de verifier la chose qui compte : QUE LA PAGE MONTRE LE
 * MEME MARCHE QUE LE SERVEUR.
 *
 * Une page qui recalcule un stock finit par en afficher un qui n'existe plus,
 * et sur un ecran ou l'on vend contre des jetons reels, « il en restait trois »
 * n'est pas une faute d'affichage, c'est une promesse non tenue. Le serveur
 * renvoie donc l'etat ENTIER a chaque geste, et l'essai compare ce qui est
 * ecrit dans la page a ce que le moteur, lui, sait.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('marche_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('marche_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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

  /* ---- ON VA A L ETAL EN MARCHANT ----
   * Poser `on` sur le voile a la main afficherait la carte sans que la page se
   * croie ouverte : elle ne la repeindrait a aucun message, et l essai
   * mesurerait un ecran fige en croyant mesurer un marche. On vise l etal a
   * l endroit ou il est DESSINE — compter des secondes de marche supposerait
   * une vitesse et une taille de carte que l essai n a pas a connaitre. */
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
  const marche = async (touche, ms) => {
    await p.keyboard.down(touche);
    await p.waitForTimeout(ms);
    await p.keyboard.up(touche);
    await p.waitForTimeout(200);
  };
  const ouvertShop = () => p.evaluate(() => ({
    on: document.getElementById('nxShopVoile').classList.contains('on'),
    moi: window.__moi, etal: window.__etal,
  }));
  const ouvreShop = async () => {
    for (let k = 0; k < 30; k++) {
      const v = await ouvertShop();
      if (v.on) break;
      if (!v.moi || !v.etal) { await marche('ArrowLeft', 200); continue; }
      const ex = v.etal.x - v.moi.x, ey = v.etal.y - v.moi.y;
      /* L etal demande de RESTER dessus pres d une demi-seconde : on relache
         et on attend, sinon on le traverse sans jamais l ouvrir. */
      if (Math.abs(ex) < 80 && Math.abs(ey) < 80) { await p.waitForTimeout(700); continue; }
      if (Math.abs(ex) > Math.abs(ey)) await marche(ex > 0 ? 'ArrowRight' : 'ArrowLeft', 350);
      else await marche(ey > 0 ? 'ArrowDown' : 'ArrowUp', 350);
    }
    const v = await ouvertShop();
    if (!v.on) { console.log('   la boutique ne s est pas ouverte : ' + JSON.stringify(v)); return false; }
    /* L onglet des potions : la boutique ouvre sur les saisons, qui sont sa
       raison d etre principale. */
    await p.evaluate(() => {
      const b = document.querySelector('#nxShopVoile .nxsh-ong button[data-s="pot"]');
      if (b) b.click();
    });
    await p.waitForTimeout(600);
    return true;
  };

  /* On passe par le VRAI chemin : le bouton de la page. Appeler `peintShop`
     directement testerait la fonction, pas l'ecran. */
  const clique = async (sel) => {
    const ok = await p.evaluate((s) => {
      const b = document.querySelector(s);
      if (!b || b.disabled) return false;
      b.click(); return true;
    }, sel);
    await p.waitForTimeout(500);
    return ok;
  };
  const vu = () => p.evaluate(() => {
    const c = document.querySelector('#nxShopVoile .nxsh-corps');
    const lignes = Array.from(c.querySelectorAll('.nxsh-vente')).map((el) => ({
      nom: el.querySelector('.n').textContent.trim(),
      detail: el.querySelector('.o').textContent.replace(/\s+/g, ' ').trim(),
      gain: el.querySelector('.g') ? el.querySelector('.g').textContent.trim() : null,
      vend: !!el.querySelector('[data-vend]'),
      reprend: !!el.querySelector('[data-reprend]'),
      qte: el.querySelector('.nxsh-qte b') ? el.querySelector('.nxsh-qte b').textContent : null,
    }));
    return {
      bascule: c.querySelector('.nxsh-bascule')
        ? c.querySelector('.nxsh-bascule').textContent.trim() : null,
      enVente: !!c.querySelector('.nxsh-vente'),
      lignes,
      note: c.querySelector('.nxsh-note') ? c.querySelector('.nxsh-note').textContent.replace(/\s+/g, ' ').trim() : null,
      source: Array.from(c.querySelectorAll('.nxsh-src')).map((i) => i.textContent.trim()),
      fioles: Array.from(c.querySelectorAll('[data-fiole]')).map((b) => b.getAttribute('data-fiole')),
      msg: (document.querySelector('#nxShopVoile .nxsh-msg') || {}).textContent || '',
    };
  });

  /* ================== 1. LE COMPTOIR EXISTE, ET IL EST VIDE ================== */
  console.log('\n-- le comptoir --');
  q.potions = {};
  const dedans = await ouvreShop();
  ok(dedans, 'on a marche jusqu a l etal et la boutique s est ouverte');
  let e = await vu();
  ok(/sell my potions/i.test(e.bascule || ''),
     `un bouton propose de vendre ses potions (« ${e.bascule} »)`);
  ok(await clique('.nxsh-bascule'), 'et il bascule sur le comptoir');
  e = await vu();
  ok(/50%/.test(e.note || ''), `la part du vendeur est ecrite (« ${(e.note||'').slice(0, 60)}… »)`);
  ok(/paid when someone actually buys/i.test(e.note || ''),
     'et le fait qu on soit paye A LA VENTE, pas a la mise en vente');
  ok(!e.enVente, 'sans rien a vendre, aucune ligne : huit lignes a zero seraient huit lignes mortes');

  /* ================== 2. METTRE EN VENTE ================== */
  console.log('\n-- mettre en vente --');
  q.potions = { vie: 12 };
  q.fioles = { def: 2 };
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'potionMarche' })));
  await p.waitForTimeout(500);
  e = await vu();
  ok(e.lignes.length === 2, `les deux sortes qu on possede apparaissent (${e.lignes.length})`);
  const vie = e.lignes.find((l) => /health/i.test(l.nom));
  ok(vie && /You have 12/.test(vie.detail), `la potion de vie dit ce qu on en a (« ${vie && vie.detail} »)`);
  ok(vie && vie.gain === '+5 $SWOGE each'.replace(' $SWOGE each', '') + ' $SWOGE each'
        || (vie && /\+5/.test(vie.gain)), `et ce qu elle rapporte (${vie && vie.gain})`);
  const fio = e.lignes.find((l) => /DEF/i.test(l.nom));
  ok(fio && /\+2500/.test(fio.gain), `la fiole de stat en rapporte 2500 (${fio && fio.gain})`);

  await clique('[data-plus="vie"]');
  await clique('[data-plus="vie"]');
  e = await vu();
  const vie2 = e.lignes.find((l) => /health/i.test(l.nom));
  ok(vie2 && vie2.qte === '3', `le compteur monte (${vie2 && vie2.qte})`);
  await clique('[data-tout="vie"]');
  e = await vu();
  ok(e.lignes.find((l) => /health/i.test(l.nom)).qte === '12', '« All » prend tout ce qu on a');

  await clique('[data-vend="vie"]');
  e = await vu();
  /* Ce que la page affiche doit etre ce que le SERVEUR sait. C'est toute la
     raison d'etre de cet essai. */
  const cote = moteur.potionsMarche(w.address).lignes.find((l) => l.cle === 'vie');
  ok(cote.enVente === 12, `le serveur a bien douze potions en vente (${cote.enVente})`);
  ok(/12 listed/i.test(e.lignes.find((l) => /health/i.test(l.nom)).detail),
     'et la page le dit');
  ok(/listed/i.test(e.msg), `avec un message qui le confirme (« ${e.msg.trim()} »)`);
  ok(e.lignes.find((l) => /health/i.test(l.nom)).reprend,
     'un bouton permet de les reprendre : une potion bloquee serait une confiscation');

  /* ================== 3. QUELQU UN ACHETE ================== */
  console.log('\n-- quelqu un achete --');
  const avant = Number(moteur.balanceStr(w.address));
  moteur.achetePotion(autre, 'vie', 4);
  const gagne = Number(moteur.balanceStr(w.address)) - avant;
  ok(gagne === 20, `le vendeur touche 5 par potion, a la vente (${gagne} pour 4)`);
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'potionMarche' })));
  await p.waitForTimeout(500);
  e = await vu();
  ok(/8 listed/i.test(e.lignes.find((l) => /health/i.test(l.nom)).detail),
     'et la page voit qu il en reste huit');

  /* ================== 4. REPRENDRE ================== */
  console.log('\n-- reprendre --');
  await clique('[data-reprend="vie"]');
  e = await vu();
  const apres = moteur.potionsMarche(w.address).lignes.find((l) => l.cle === 'vie');
  ok(apres.enVente === 0, 'tout reprendre vide l annonce');
  ok(apres.jai === 8, `et rend les huit potions (${apres.jai})`);
  ok(/You have 8/.test(e.lignes.find((l) => /health/i.test(l.nom)).detail),
     'ce que la page montre aussi');

  /* ================== 5. LE RAYON D ACHAT DIT D OU VIENT LE STOCK ================== */
  console.log('\n-- au rayon --');
  await clique('.nxsh-bascule');
  e = await vu();
  /* ---- RUPTURE DE STOCK ----
   * La maison ne fabrique plus de potions. File vide, rayon vide — et le
   * bouton DIT pourquoi. Un bouton grise sans phrase se lit « casse » ; avec
   * le mot il se lit « a vous d en mettre », qui est l invitation qu on veut
   * faire. */
  ok(e.source.some((t) => /out of stock/i.test(t)),
     `sans vendeur, l ecran affiche la rupture (« ${e.source.join(' | ')} »)`);
  const grise = await p.evaluate(() => {
    const b = document.querySelector('#nxShopVoile .nxsh-corps [data-pot="vie"]');
    return { off: !!(b && b.disabled), vide: !!(b && b.classList.contains('vide')),
             mot: b ? (b.querySelector('.nxsh-rupture') || {}).textContent || null : null };
  });
  ok(grise.off, 'et le bouton d achat est grise : il n y a rien a vendre');
  ok(/out of stock/i.test(grise.mot || ''),
     `avec le mot a la place du prix (« ${grise.mot} »)`);
  /* Un autre joueur approvisionne : la meme ligne doit changer de phrase. */
  qa.potions = { vie: 6 };
  moteur.metPotionEnVente(autre, 'vie', 6);
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'potionMarche' })));
  await p.waitForTimeout(500);
  e = await vu();
  ok(e.source.some((t) => /6 in stock from players/i.test(t)),
     `et quand un joueur en vend, elle le dit aussi (« ${e.source.join(' | ')} »)`);
  /* ---- ET LE COMPTEUR DESCEND ----
   * On achete deux potions : l ecran doit montrer quatre, pas six. Une page
   * qui garde son ancien chiffre promet un stock qui n existe plus. */
  moteur.achetePotion(w.address, 'vie', 2);
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'potionMarche' })));
  await p.waitForTimeout(500);
  e = await vu();
  ok(e.source.some((t) => /4 in stock from players/i.test(t)),
     `et il DESCEND a mesure qu on achete (« ${e.source.join(' | ')} »)`);

  /* ---- LES FIOLES DE STAT N APPARAISSENT QUE SI QUELQU UN EN VEND ----
   * Elles n'ont pas de fond de la maison. Un rayon vide en permanence
   * apprendrait a ne plus le regarder. */
  ok(e.fioles.length === 0, 'aucune fiole au rayon : personne n en vend');
  qa.fioles = { att: 1 };
  moteur.metPotionEnVente(autre, 'st:att', 1);
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'potionMarche' })));
  await p.waitForTimeout(500);
  e = await vu();
  ok(e.fioles.indexOf('att') >= 0, `elle apparait des qu un joueur en met une (${e.fioles.join(',')})`);

  const avantF = Number(moteur.balanceStr(autre));
  const avantMoi = Number(moteur.balanceStr(w.address));
  ok(await clique('[data-fiole="att"]'), 'et on peut l acheter');
  await p.waitForTimeout(400);
  const paye = avantMoi - Number(moteur.balanceStr(w.address));
  const recu = Number(moteur.balanceStr(autre)) - avantF;
  ok(paye === 5000, `elle coute 5000 (${paye})`);
  ok(recu === 2500, `et le vendeur en touche 2500 (${recu})`);
  ok((moteur.fiolesPour(w.address).find((x) => x.cle === 'att') || {}).coffre === 1,
     'la fiole arrive dans le coffre de l acheteur');

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nmarche_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
