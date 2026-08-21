/* L ENCLOS DE PETWORLD — on y entre par le portail, et par lui seul.
 *
 * La premiere version etait UNE image : grange, cour et barriere dans le meme
 * dessin. Elle etait belle et l on ne pouvait pas y entrer — une image occupe
 * l espace AU-DESSUS de son point d ancrage, et quiconque se serait tenu dans
 * la cour aurait ete recouvert par elle.
 *
 * L enclos est maintenant un LIEU : un rectangle de terre battue, une
 * barriere posee piece par piece, un portail au sud. Ce fichier verifie les
 * trois choses qui font qu un enclos est un enclos et pas un decor.
 *
 * 1. LE SOL CHANGE. La terre battue se dessine sous les pieds : c est elle
 *    qui dit ou la cour commence, avant meme qu on voie la barriere.
 * 2. LA BARRIERE ARRETE. Une cloture qu on traverse n est pas une cloture,
 *    c est un dessin de cloture — et le portail ne sert alors a rien.
 * 3. LE PORTAIL LAISSE PASSER. Une cour hermetique serait pire qu une cour
 *    ouverte : on verrait l interieur sans jamais pouvoir y aller.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('petworld_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('petworld_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
              '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/petw-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  require(path.join(SERVEUR, 'server'));
  await new Promise((r) => setTimeout(r, 1200));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const erreurs = [];
  const p = await nav.newPage({ viewport: { width: 900, height: 800 } });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);

  /* ---- L ESPION ----
   * On regarde ce que la page DESSINE. « Le sol de la ferme est charge » et
   * « le sol de la ferme est a l ecran » sont deux choses differentes, et
   * c est la seconde qui interesse le joueur. */
  await p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionF) return;
    C.__espionF = true;
    window.__vus = {}; window.__moi = null; window.__solF = null; window.__porteF = null;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      const m = u.match(/(ground_ferme|obj_cloture_[a-z]+|ferme_decor|obj_grange)\.webp/);
      if (m) window.__vus[m[1]] = (window.__vus[m[1]] || 0) + 1;
      /* L etendue de la terre battue : c est la DEFINITION visible de la cour,
         et elle vient de la page, pas d un chiffre recopie ici. */
      if (m && m[1] === 'ground_ferme' && arguments.length >= 5) {
        const x0 = arguments[1], y0 = arguments[2];
        const x1 = x0 + arguments[3], y1 = y0 + arguments[4];
        const b3 = window.__solF;
        window.__solF = b3
          ? { x0: Math.min(b3.x0, x0), y0: Math.min(b3.y0, y0),
              x1: Math.max(b3.x1, x1), y1: Math.max(b3.y1, y1) }
          : { x0: x0, y0: y0, x1: x1, y1: y1 };
      }
      if (m && m[1] === 'obj_cloture_porte' && arguments.length >= 5) {
        window.__porteF = { x: arguments[1] + arguments[3] / 2, y: arguments[2] + arguments[4] };
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
    await p.keyboard.up(t); await p.waitForTimeout(140);
  };
  const vus = () => p.evaluate(() => { const v = window.__vus; window.__vus = {}; return v; });
  const moi = () => p.evaluate(() => window.__moi);

  /* ================== 1. ON DESCEND VERS LA FERME ================== */
  console.log('\n-- on descend vers la ferme --');
  await marche('ArrowRight', 2400);
  await marche('ArrowDown', 3400);
  await p.waitForTimeout(500);
  await vus();
  await p.waitForTimeout(400);
  let v = await vus();
  ok((v.obj_grange || 0) > 0, `la grange est dessinee (${v.obj_grange || 0})`);
  ok((v.obj_cloture_h || 0) + (v.obj_cloture_v || 0) > 4,
     `la barriere aussi (${(v.obj_cloture_h || 0)} lisses + ${(v.obj_cloture_v || 0)} montants)`);
  ok((v.obj_cloture_porte || 0) > 0, 'et le portail au sud');
  ok((v.ferme_decor || 0) >= 3, `les meubles de la cour y sont (${v.ferme_decor || 0})`);
  ok((v.ground_ferme || 0) > 0, `la terre battue se dessine (${v.ground_ferme || 0} tuiles)`);

  /* ================== 2. LA BARRIERE ARRETE ================== */
  console.log('\n-- on pousse contre la barriere --');
  /* « Dans l enclos » se lit SUR L ECRAN : la terre battue n est dessinee que
     la, et le personnage et les tuiles sont traces dans le meme repere. On ne
     recopie donc aucune coordonnee de la page dans l essai — une copie finit
     toujours par mentir le jour ou l enclos bouge. */
  const dedans = () => p.evaluate(() => {
    const b2 = window.__solF, m = window.__moi;
    if (!b2 || !m) return null;
    return m.x > b2.x0 && m.x < b2.x1 && m.y > b2.y0 && m.y < b2.y1;
  });
  /* On se place a GAUCHE de la cour, a mi-hauteur, et l on pousse vers elle.
     Sans collision, on la traverserait de part en part en six secondes. */
  const cible = await p.evaluate(() => window.__solF);
  ok(!!cible, `la cour se mesure a l ecran (${cible ? Math.round(cible.x1 - cible.x0) + 'x' + Math.round(cible.y1 - cible.y0) : 'absente'})`);
  for (let k = 0; k < 18; k++) {
    const m = await moi();
    if (!m || !cible) break;
    if (m.y < cible.y0 + 60) { await marche('ArrowDown', 260); continue; }
    if (m.y > cible.y1 - 60) { await marche('ArrowUp', 260); continue; }
    if (m.x > cible.x0 - 40) break;
    await marche('ArrowRight', 260);
  }
  await marche('ArrowRight', 2600);
  const traverse = await dedans();
  ok(traverse === false,
     `pousser contre le flanc ne fait pas entrer (dedans = ${traverse})`);

  /* ================== 3. LE PORTAIL LAISSE PASSER ================== */
  console.log('\n-- on entre par le portail --');
  /* On VISE le portail la ou il est dessine, on ne compte pas les secondes :
     compter supposerait une vitesse et une position de depart, deux choses
     qui changeront. */
  /* ---- TROIS TEMPS, ET DANS CET ORDRE ----
   * Un arbre de decisions relu a chaque pas OSCILLE : « descends si tu es
   * trop haut, monte si tu es aligne » se contredit des qu'on est aligne et
   * trop haut, et le personnage fait la navette devant le portail jusqu'a
   * epuisement du compteur. On se presente donc en trois temps separes —
   * descendre SOUS le portail, se mettre en face, puis monter — chacun
   * jusqu'a ce qu'il soit fait. */
  const porte = () => p.evaluate(() => window.__porteF);
  for (let k = 0; k < 14; k++) {
    const m = await moi(); const g = await porte();
    if (m && g && m.y > g.y + 100) break;
    await marche('ArrowDown', 260);
  }
  for (let k = 0; k < 14; k++) {
    const m = await moi(); const g = await porte();
    if (m && g && Math.abs(m.x - g.x) <= 25) break;
    if (!m || !g) break;
    await marche(m.x < g.x ? 'ArrowRight' : 'ArrowLeft', 200);
  }
  for (let k = 0; k < 14 && !(await dedans()); k++) await marche('ArrowUp', 220);
  const entre = await dedans();
  ok(entre === true, `le portail, lui, laisse passer (dedans = ${entre})`);

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\npetworld_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
