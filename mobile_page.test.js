/* LE TELEPHONE — ce qu'on voit, et ce avec quoi on marche.
 *
 * Deux choses rapportees, deux causes sans rapport :
 *
 * 1. ON NE VOIT PAS ASSEZ LOIN. Le zoom n'etait borne qu'en HAUT et bloque a
 *    1 en bas : la fenetre d'un telephone fait six cent quarante pixels de
 *    haut, le calcul rendait 0,64, la borne le remontait a 1 — et l'ecran
 *    montrait six cent quarante unites de monde la ou un ordinateur en montre
 *    mille. Le plus petit ecran voyait le MOINS loin, exactement l'inverse de
 *    ce qu'il faut.
 * 2. QUATRE BOUTONS, C'EST QUATRE DIRECTIONS. Au clavier on en tient deux a
 *    la fois ; au pouce, une seule. Contourner un rocher demandait deux
 *    mouvements en escalier pendant qu'on se faisait tirer dessus.
 *
 * On ne lit aucune variable de la page — elles vivent dans une fermeture. On
 * mesure ce qui est PEINT et ou le personnage arrive.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('mobile_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('mobile_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/mob-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  const { Realm } = require(path.join(SERVEUR, 'realm'));
  /* ---- IL Y A PLUSIEURS MONDES OUVERTS ----
   * Cet espion gardait « la derniere simulation qui a battu ». Il n y en avait
   * qu une ; depuis la deuxieme porte du Nexus il y en a deux, et `monde0`
   * valait une fois sur deux celle ou notre joueur n est pas. On les collecte
   * toutes et l on designe la bonne par LE JOUEUR QU ELLE CONTIENT. */
  let monde0 = null; const ouverts = new Set(); const pas0 = Realm.prototype.pas;
  Realm.prototype.pas = function (dt) {
    if (!this.plan) ouverts.add(this);
    return pas0.call(this, dt);
  };
  const mondeDe = (a) => [...ouverts].find((r) => r.joueurs.has(String(a).toLowerCase()))
                      || [...ouverts][0] || null;
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  await new Promise((r) => setTimeout(r, 1400));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const erreurs = [];

  /* Un vrai telephone : ecran etroit, DOIGT. C'est `pointer: coarse` qui
     decide du zoom et du manche, pas la largeur — une tablette large au doigt
     a le meme besoin. */
  const ctx = await nav.newContext({ viewport: { width: 390, height: 780 },
                                     hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
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
    /* On note l'echelle passee au canevas : c'est LE zoom, et il ne se lit
       nulle part ailleurs. */
    window.__zoom = [];
    const S = CanvasRenderingContext2D.prototype.scale;
    CanvasRenderingContext2D.prototype.scale = function (x, y) {
      if (this.canvas && this.canvas.isConnected && x === y) window.__zoom.push(x);
      return S.apply(this, arguments);
    };
  });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));

  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  /* ---- ON ENTRE DANS LE MONDE POUR DE VRAI ----
   * La position du personnage au Nexus ne se lit nulle part : elle vit dans une
   * fermeture, et la camera se bloque au bord de la carte. Dans le monde de
   * combat, le SERVEUR la connait — c'est la seule mesure qui ne soit pas une
   * supposition sur ce que la page a bien voulu dessiner. */
  const w = ethers.Wallet.createRandom();
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, sg]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello'))
    .send(JSON.stringify({ type: 'login', message: m, signature: sg })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(900);
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForTimeout(1600);
  const addr = w.address.toLowerCase();
  monde0 = mondeDe(addr);
  ok(!!monde0 && monde0.joueurs.has(addr), 'on est dans le monde de combat');

  /* ================== 1. LE MANCHE A REMPLACE LA CROIX ================== */
  console.log('\n-- le manche --');
  const manche = await p.evaluate(() => {
    const e = document.getElementById('nxPad');
    if (!e) return { err: 'pas de nxPad' };
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    const socle = e.querySelector('.socle'), pom = e.querySelector('.pommeau');
    return { visible: cs.display !== 'none',
             boutons: e.querySelectorAll('button').length,
             socle: !!socle, pommeau: !!pom,
             zone: { w: Math.round(r.width), h: Math.round(r.height),
                     bas: Math.round(innerHeight - r.bottom) },
             socleR: socle ? Math.round(socle.getBoundingClientRect().width) : 0 };
  });
  ok(manche.visible, 'le manche est a l\'ecran sur telephone');
  ok(manche.boutons === 0, `et il ne reste aucun bouton de croix (${manche.boutons})`);
  ok(manche.socle && manche.pommeau, 'il a un socle et un pommeau');
  /* LA ZONE EST PLUS GRANDE QUE LE DESSIN. Sur un telephone on ne regarde pas
     son pouce ; un manche qu'il faut viser est un manche qu'on rate. */
  ok(manche.zone.w > manche.socleR * 1.2,
     `la zone de prise deborde le socle (${manche.zone.w} px pour un socle de ${manche.socleR})`);
  /* ET ELLE S'ARRETE SOUS LA RANGEE DU SAC AU SOL (bottom: 172px) : une zone
     qui monterait plus haut avalerait les appuis sur le butin. */
  ok(manche.zone.h <= 170,
     `et elle s'arrete sous la rangee du butin (${manche.zone.h} px de haut)`);

  /* ================== 2. IL FAIT MARCHER, DANS TOUTES LES DIRECTIONS ================== */
  console.log('\n-- huit directions, pas quatre --');
  const centre = await p.evaluate(() => {
    const r = document.querySelector('#nxPad .socle').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  });
  /* On pousse dans huit sens et l'on regarde ou le personnage arrive. Le
     Nexus suffit : c'est le meme code de deplacement, et il n'y a pas de
     monstres pour brouiller la mesure. */
  /* ---- ALTERNES, ET SANS REMISE EN PLACE ----
   * On repositionnait le joueur COTE SERVEUR entre chaque sens. Le client, lui,
   * ne saute pas : il recoit une correction et la rattrape en douceur. Au bout
   * de trois tours les deux ne parlaient plus du meme endroit, le serveur
   * refusait les pas comme une teleportation, et l'essai concluait que le
   * manche ne marche pas vers l'ouest.
   * On mesure donc le DEPLACEMENT depuis la ou l'on est, et l'on alterne les
   * sens opposes pour rester autour du point de depart. */
  const sens = [['est', 1, 0], ['ouest', -1, 0],
                ['sud-est', 0.71, 0.71], ['nord-ouest', -0.71, -0.71],
                ['sud', 0, 1], ['nord', 0, -1],
                ['sud-ouest', -0.71, 0.71], ['nord-est', 0.71, -0.71]];
  /* Un coin degage, cherche et non ecrit en dur : les rochers sont tires au
     sort a chaque demarrage, et un point choisi a la main se retrouverait un
     jour contre un mur — l'essai dirait alors « le manche ne marche pas vers
     l'est » alors qu'il y a un rocher a l'est. */
  const M = require(path.join(SERVEUR, 'monde'));
  const jm = monde0.joueurs.get(addr);
  let libre = null;
  for (let x = 1400; x < M.MONDE.w - 1400 && !libre; x += 173) {
    for (let y = 1400; y < M.MONDE.h - 1400 && !libre; y += 173) {
      let bon = true;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        for (let t = 0; t <= 260 && bon; t += 40) {
          if (M.bloque(monde0.obstacles, x + dx * t, y + dy * t, 60)) bon = false;
        }
      }
      if (bon) libre = { x, y };
    }
  }
  ok(!!libre, 'un endroit degage dans les huit sens');

  /* ---- ON MESURE CE QUE LA PAGE ANNONCE, PAS CE QUE LE SERVEUR RETIENT ----
   *
   * La question posee est « le manche fait-il marcher dans le sens ou l'on
   * pousse ? », et c'est la PAGE qui deplace le personnage — le serveur ne fait
   * que borner. Mesurer chez lui melangeait deux choses : le manche, et la
   * reconciliation qui ramene doucement la page vers la position bornee. Sur un
   * navigateur sans fenetre visible, la boucle de dessin est ralentie, la page
   * demande plus que la borne, se fait rattraper, et l'ecart s'accumule d'un
   * sens a l'autre — l'essai concluait alors que le manche cesse de repondre au
   * bout de cinq poussees.
   * `realmMove` porte la position que la page annonce, dix fois par seconde.
   * C'est le manche, sans rien d'autre. */
  jm.x = libre.x; jm.y = libre.y;
  await p.waitForTimeout(1500);
  const annonce = () => p.evaluate(() => {
    const m = window.__s[0].__out.filter((x) => x.type === 'realmMove').pop();
    return m ? { x: m.x, y: m.y } : null;
  });
  const rates8 = [];
  for (const [nom, ux, uy] of sens) {
    const depart = await annonce();
    if (!depart) { rates8.push(nom + ' (aucune position annoncee)'); continue; }
    await p.evaluate(async (q) => {
      const el = document.getElementById('nxPad');
      const ev = (t, x, y) => el.dispatchEvent(new PointerEvent(t, { bubbles: true,
        pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
      ev('pointerdown', q.cx, q.cy);
      ev('pointermove', q.cx + q.ux * q.r * 0.9, q.cy + q.uy * q.r * 0.9);
      /* Le deplacement se fait dans la boucle de DESSIN, pas dans
         l'evenement : on laisse le personnage marcher. */
      await new Promise((r) => setTimeout(r, 450));
      ev('pointerup', q.cx + q.ux * q.r * 0.9, q.cy + q.uy * q.r * 0.9);
    }, { cx: centre.x, cy: centre.y, r: centre.r, ux, uy });
    await p.waitForTimeout(260);          // la page annonce son dernier pas
    const arrivee = await annonce();
    const dx = arrivee.x - depart.x, dy = arrivee.y - depart.y;
    const d = Math.hypot(dx, dy);
    /* Le PRODUIT SCALAIRE avec le sens demande : il vaut la distance parcourue
       si l'on est parti pile dans le bon sens, et il devient negatif si l'on
       est parti a l'oppose. Comparer les composantes une a une aurait laisse
       passer une diagonale a quarante-cinq degres de la demande. */
    const projete = dx * ux + dy * uy;
    if (!(d > 30 && projete > d * 0.9)) {
      rates8.push(`${nom} (${Math.round(dx)},${Math.round(dy)}, d=${Math.round(d)})`);
    }
  }
  ok(rates8.length === 0,
     `le personnage part dans les HUIT sens${rates8.length ? ' — rates : ' + rates8.join(' | ') : ''}`);

  /* ---- ET IL S'ARRETE QUAND ON LACHE ---- */
  await p.waitForTimeout(700);
  const arret = await annonce();
  await p.waitForTimeout(700);
  const encore = await annonce();
  ok(Math.hypot(encore.x - arret.x, encore.y - arret.y) < 12,
     `et il ne bouge plus une fois le pouce leve (${Math.round(Math.hypot(encore.x - arret.x, encore.y - arret.y))} u)`);

  /* ================== 3. ON VOIT PLUS LOIN ================== */
  console.log('\n-- ce qu on voit --');
  const zoomTel = await p.evaluate(() => {
    const z = window.__zoom.filter((x) => x > 0 && x < 8);
    return z.length ? z[z.length - 1] : null;
  });
  ok(zoomTel !== null, 'le zoom se mesure');
  ok(zoomTel < 1, `au doigt, il descend SOUS 1 (${zoomTel && zoomTel.toFixed(2)})`);
  ok(zoomTel >= 0.38, `mais pas sous 0,38, ou plus rien ne se distingue (${zoomTel && zoomTel.toFixed(2)})`);
  const combien = () => p.evaluate(() => {
    const z = window.__zoom.filter((x) => x > 0 && x < 8);
    const zz = z.length ? z[z.length - 1] : null;
    if (!zz) return null;
    return Math.round((document.querySelector('canvas').height /
                       (window.devicePixelRatio || 1)) / zz);
  });
  const vu = await combien();
  ok(vu > 1200, `on voit ${vu} unites de monde de haut (un ordinateur en voit ~900)`);

  /* ---- ET C EST UN REGLAGE ----
   * « Je veux voir plus loin » n a pas de bonne reponse universelle : plus
   * large montre les creatures plus tot, plus serre les garde lisibles. Ce qui
   * se verifie n est donc pas UN chiffre, c est que le curseur AGIT — et qu il
   * se souvient. Un reglage qu on refait a chaque visite n en est pas un. */
  console.log('\n-- le curseur de distance de vue --');
  const regle = async (v) => {
    await p.evaluate((val) => {
      const e = document.getElementById('nxVuePct');
      e.value = String(val);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      window.__zoom.length = 0;
    }, v);
    await p.waitForTimeout(400);
    return combien();
  };
  const large = await regle(1800);
  const serre = await regle(900);
  ok(large !== null && serre !== null, 'le curseur existe et le zoom se remesure');
  ok(large > serre + 200,
     `pousse a fond on voit BIEN plus loin (${large} contre ${serre})`);
  /* La borne mord sur un petit ecran : le chiffre affiche doit etre celui
     qu on VOIT, pas celui qu on a demande — sinon on croit que le reglage a
     cesse de repondre alors qu il est au bout de sa course. */
  await regle(1800);
  const affiche = await p.evaluate(() =>
    Number((document.getElementById('nxVueVal') || {}).textContent));
  const reel = await combien();
  ok(Math.abs(affiche - reel) <= 40,
     `et le chiffre affiche est celui qu on voit (${affiche} pour ${reel})`);

  /* ---- IL SURVIT A LA VISITE SUIVANTE ---- */
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const garde = await p.evaluate(() =>
    Number((document.getElementById('nxVuePct') || {}).value));
  ok(garde === 1800, `le choix est garde d une visite a l autre (${garde})`);
  await p.evaluate(() => { try { localStorage.removeItem('swogeNexusVue'); } catch (e) {} });

  /* ---- ET A LA SOURIS, RIEN NE CHANGE ----
   * Le zoom sous 1 est pour le DOIGT. L'appliquer partout aurait rendu le
   * pixel art flou sur un ecran ou personne ne s'en plaignait. */
  const ctx2 = await nav.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();
  await p2.addInitScript(function () {
    window.__zoom = [];
    const S = CanvasRenderingContext2D.prototype.scale;
    CanvasRenderingContext2D.prototype.scale = function (x, y) {
      if (this.canvas && this.canvas.isConnected && x === y) window.__zoom.push(x);
      return S.apply(this, arguments);
    };
  });
  await p2.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
                { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1800);
  const zoomSouris = await p2.evaluate(() => {
    const z = window.__zoom.filter((x) => x > 0 && x < 8);
    return z.length ? z[z.length - 1] : null;
  });
  ok(zoomSouris >= 1, `a la souris il reste a 1 au moins (${zoomSouris})`);
  const pad = await p2.evaluate(() => {
    const e = document.getElementById('nxPad');
    return e ? getComputedStyle(e).display : 'absent';
  });
  ok(pad === 'none', `et le manche ne s'affiche pas (${pad})`);

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nmobile_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
