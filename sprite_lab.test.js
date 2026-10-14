'use strict';
/*
 * SPRITE LAB — ON BOUGE LE MONSTRE, ET IL FAIT CE QU'IL DOIT.
 *
 * La page lit la planche publiee du mannequin (img/nexus/monstres/iso/,
 * format de sortie de la chaine du serveur, outils/planches/chaine.js) et la
 * fait bouger. Ce que cet essai verrouille :
 *   1. elle charge la planche (index.json -> fiche -> planches) sans une erreur
 *      de console, et sans appeler aucun serveur quand il n'y a pas de session ;
 *      le mannequin porte le badge « format test », jamais « checks pass » ;
 *   2. a l'arret : idle, et l'image avance avec le TEMPS ;
 *   3. droite + bas : walk, direction SE... et la LIGNE DESSINEE de la planche
 *      est celle de la direction annoncee (on espionne drawImage) ; le monstre
 *      avance LE LONG de l'axe iso qu'il regarde (angle du deplacement = angle
 *      de la direction, 26,6 deg pour SE) : il ne marche pas en crabe ;
 *   4. on lache : idle ; Shift : run ; Space : attack, joue UNE fois, sur place ;
 *   5. apres un reglage (menu, curseur), WASD bouge encore le monstre ;
 *   6. la case HD charge la planche HD (16 images) et la dessine ;
 *   7. au telephone (390 x 844, 320 x 568), VRAI toucher (CDP) : la manette et
 *      ATTACK sont visibles au chargement sans defiler ; la manette fait courir
 *      en NW au bout de sa course, la ligne dessinee suit ; ATTACK attaque ;
 *   8. ?server= vers une autre origine ne recoit JAMAIS le jeton de session ;
 *   9. 320, 390 et 1440 px : aucun defilement horizontal.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('sprite_lab.test.js : playwright absent — essai saute'); process.exit(0); }

const SITE = __dirname;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon' };
const ANGLES = { se: 26.565, sw: 153.435, nw: 206.565, ne: 333.435 };

function servir() {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      const f = path.join(SITE, u === '/' ? 'index.html' : u);
      if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

/* l'espion : la LIGNE et la colonne de la planche que la page dessine vraiment */
const ESPION = () => {
  const d0 = CanvasRenderingContext2D.prototype.drawImage;
  window.__dessins = [];
  CanvasRenderingContext2D.prototype.drawImage = function (img, sx, sy, sw) {
    if (arguments.length >= 9 && img && img.naturalWidth) window.__dessins.push({ src: String(img.src).split('/').pop().split('?')[0], sx, sy, sw });
    if (window.__dessins.length > 4000) window.__dessins.splice(0, 2000);
    return d0.apply(this, arguments);
  };
};

(async () => {
  const srv = await servir();
  const base = 'http://127.0.0.1:' + srv.address().port + '/sprite_lab.html';
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const dort = (ms) => new Promise((r) => setTimeout(r, ms));

  async function ouvre(opts, url) {
    const ctx = await nav.newContext(opts);
    const p = await ctx.newPage();
    const erreurs = [], dehors = [];
    p.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    p.on('pageerror', (e) => erreurs.push(String(e)));
    p.on('request', (q) => { if (!q.url().startsWith('http://127.0.0.1')) dehors.push(q.url()); });
    await p.addInitScript(ESPION);
    await p.goto(url || base);
    await p.waitForFunction(() => window.spriteLab && window.spriteLab.etat().pret, null, { timeout: 15000 });
    return { ctx, p, erreurs, dehors };
  }
  const etat = (p) => p.evaluate(() => window.spriteLab.etat());
  const dessin = (p) => p.evaluate(() => { const d = window.__dessins[window.__dessins.length - 1]; return { src: d.src, ligne: Math.round(d.sy / d.sw), col: Math.round(d.sx / d.sw) }; });
  const angle = (a, e) => ((Math.atan2(e.y - a.y, e.x - a.x) * 180 / Math.PI) + 360) % 360;
  const ecartAngle = (x, y) => { const d = Math.abs(x - y) % 360; return Math.min(d, 360 - d); };

  console.log('-- 1. au bureau (1440 px, clavier) --');
  const { ctx, p, erreurs, dehors } = await ouvre({ viewport: { width: 1440, height: 900 } });
  const e0 = await etat(p);
  ok(e0.pret && e0.nom === 'Test mannequin' && e0.dirs.join() === 'se,sw,nw,ne', 'la planche publiee est chargee (mannequin, directions SE SW NW NE)');
  const badge = await p.evaluate(() => document.getElementById('verdict').textContent);
  ok(e0.essai && badge === 'format test', 'le mannequin porte le badge « format test » et non « checks pass » [' + badge + ']');
  ok(e0.action === 'idle', 'a l arret : idle');
  const c0 = (await etat(p)).cadre; await dort(700); const c1 = (await etat(p)).cadre;
  ok(c1 !== c0, 'idle avance avec le temps (' + c0 + ' -> ' + c1 + ')');
  await p.click('#scene', { position: { x: 30, y: 30 } });

  /* l'angle se mesure une fois TOUTES les touches enfoncees (entre deux touches, la premiere
     seule donne une autre direction pendant une image ou deux) */
  async function marche(touches, ms) {
    for (const t of touches) await p.keyboard.down(t);
    await dort(150);
    const a = await etat(p);
    await dort((ms || 450) - 150);
    const e = await etat(p), d = await dessin(p);
    for (const t of touches) await p.keyboard.up(t);
    return { a, e, d };
  }
  for (const [touches, dir] of [[['KeyD', 'KeyS'], 'se'], [['KeyA', 'KeyW'], 'nw'], [['ArrowLeft', 'ArrowDown'], 'sw'], [['KeyD', 'KeyW'], 'ne']]) {
    const { a, e, d } = await marche(touches);
    const ang = angle(a, e);
    ok(e.action === 'walk' && e.dir === dir && /^walk(_hd)?\.webp$/.test(d.src) && d.ligne === e.dirs.indexOf(dir),
       touches.join('+') + ' : walk ' + e.dir.toUpperCase() + ', ligne DESSINEE ' + d.ligne + ' de ' + d.src + ' (attendue ' + e.dirs.indexOf(dir) + ')');
    ok(ecartAngle(ang, ANGLES[dir]) < 2, touches.join('+') + ' : il avance le long de son axe iso (' + ang.toFixed(1) + ' deg pour ' + ANGLES[dir] + ')');
    await dort(150);
  }
  const { a: a5, e: e5 } = await marche(['KeyD']);
  ok(e5.dir === 'ne' && ecartAngle(angle(a5, e5), ANGLES.ne) < 2, 'droite PURE : garde NE (signe vertical precedent) et avance le long de NE (' + angle(a5, e5).toFixed(1) + ' deg)');
  await dort(150);
  ok((await etat(p)).action === 'idle', 'on lache : idle');
  const { e: e6, d: d6 } = await marche(['ShiftLeft', 'KeyS', 'KeyA']);
  ok(e6.action === 'run' && e6.dir === 'sw' && /^run(_hd)?\.webp$/.test(d6.src) && d6.ligne === 1, 'Shift : run (SW), ligne dessinee ' + d6.ligne + ' de ' + d6.src);
  await dort(150);
  const avant = await etat(p);
  await p.keyboard.press('Space');
  await p.keyboard.down('KeyD');
  await dort(200);
  const pendant = await etat(p);
  ok(pendant.action === 'attack' && Math.abs(pendant.x - avant.x) < 0.5, 'Space : attack, et le monstre ne bouge pas pendant le geste');
  await p.keyboard.up('KeyD');
  await p.waitForFunction(() => window.spriteLab.etat().action !== 'attack', null, { timeout: 5000 }).catch(() => {});
  await dort(100);
  ok((await etat(p)).action === 'idle', 'l attaque se joue une fois, puis idle');
  await p.keyboard.press('KeyK');
  await dort(80);
  ok((await etat(p)).action === 'jump', 'K : jump');
  await dort(1500);

  /* 5. le focus sur un reglage ne prend plus le clavier */
  for (const [sel, nom] of [['#monstre', 'menu Monster'], ['#vitesse', 'curseur Move']]) {
    await p.focus(sel);
    const a = await etat(p); await p.keyboard.down('KeyD'); await dort(300); const e = await etat(p); await p.keyboard.up('KeyD');
    ok(e.x > a.x, 'focus sur le ' + nom + ' : D tenu 300 ms bouge encore le monstre (dx = ' + Math.round(e.x - a.x) + ')');
    await dort(150);
  }

  /* 6. la HD */
  const hd0 = await p.evaluate(() => document.getElementById('hd').checked);
  await p.waitForFunction(() => { const e = window.spriteLab.etat(); return e.hd && e.n === 16; }, null, { timeout: 15000 }).catch(() => {});
  const eh = await etat(p), dh = await dessin(p);
  ok(hd0 && eh.hd && eh.n === 16 && /_hd\.webp$/.test(dh.src) && dh.ligne === eh.dirs.indexOf(eh.dir), 'case HD : la planche HD est dessinee (' + dh.src + ', 16 images, ligne ' + dh.ligne + ')');
  await p.click('#hd');
  await dort(150);
  const dj = await dessin(p);
  ok(!/_hd/.test(dj.src) && (await etat(p)).n === 8, 'HD decochee : la planche du jeu (' + dj.src + ', 8 images)');

  const dom = await p.evaluate(() => ({ hud: document.getElementById('hud').textContent, ds: document.getElementById('scene').dataset.dir, sw: document.documentElement.scrollWidth, iw: innerWidth }));
  ok(/·/.test(dom.hud) && !!dom.ds, 'le HUD dit l action, la direction et l image (' + dom.hud + ')');
  ok(dom.sw <= dom.iw, '1440 px : aucun defilement horizontal');
  ok(erreurs.length === 0, 'aucune erreur de console' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''));
  ok(dehors.length === 0, 'sans session, aucun appel hors du site' + (dehors.length ? ' : ' + dehors.slice(0, 2).join(' ') : ''));
  await ctx.close();

  console.log('\n-- 2. au telephone, vrai toucher (CDP) --');
  for (const [w, h] of [[390, 844], [320, 568]]) {
    const tag = w + 'x' + h;
    const t = await ouvre({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const geo = await t.p.evaluate(() => {
      const m = document.getElementById('manche').getBoundingClientRect(), a = document.getElementById('b-attaque').getBoundingClientRect();
      return { pad: getComputedStyle(document.getElementById('pad')).display, mancheBas: Math.round(m.bottom), attaqueBas: Math.round(a.bottom), ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth };
    });
    /* au telephone, innerWidth s'elargit au contenu : on compare a la largeur de l'ecran */
    geo.iw = w;
    ok(geo.pad === 'flex' && geo.mancheBas <= geo.ih && geo.attaqueBas <= geo.ih, tag + ' : manette et ATTACK visibles AU CHARGEMENT, sans defiler (bas ' + Math.max(geo.mancheBas, geo.attaqueBas) + ' / fenetre ' + geo.ih + ')');
    ok(geo.sw <= geo.iw, tag + ' : aucun defilement horizontal [' + geo.sw + ' / ' + geo.iw + ']');
    ok((await t.p.evaluate(() => document.getElementById('hd').checked)) === false, tag + ' : la HD (64 Mo par action) n est pas chargee d office sur un ecran tactile');
    const cdp = await t.ctx.newCDPSession(t.p);
    const b = await t.p.locator('#manche').boundingBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const atq = await t.p.locator('#b-attaque').boundingBox();
    const touche = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q) => ({ x: q[0], y: q[1], id: q[2] || 1, radiusX: 4, radiusY: 4, force: 1 })) });
    const s0 = await etat(t.p);
    await touche('touchStart', [[cx, cy]]);
    for (let k = 1; k <= 6; k++) { await touche('touchMove', [[cx - b.width * 0.08 * k, cy - b.height * 0.08 * k]]); await dort(20); }
    await dort(350);
    const s1 = await etat(t.p), ds1 = await dessin(t.p);
    ok(s1.dir === 'nw' && s1.action === 'run' && s1.x < s0.x && s1.y < s0.y && ds1.ligne === s1.dirs.indexOf('nw') && ecartAngle(angle(s0, s1), ANGLES.nw) < 2,
       tag + ' manette au bout vers le haut-gauche : run NW, ligne dessinee ' + ds1.ligne + ', le long de l axe (' + angle(s0, s1).toFixed(1) + ' deg)');
    await touche('touchMove', [[cx + b.width * 0.18, cy + b.height * 0.18]]); await dort(300);
    const s2 = await etat(t.p);
    ok(s2.dir === 'se' && s2.action === 'walk', tag + ' a mi-course vers le bas-droite : walk, SE');
    /* deuxieme doigt sur ATTACK pendant que le premier tient la manette */
    await touche('touchStart', [[cx + b.width * 0.18, cy + b.height * 0.18, 1], [atq.x + atq.width / 2, atq.y + atq.height / 2, 2]]);
    await dort(80);
    ok((await etat(t.p)).action === 'attack', tag + ' deux doigts (manette tenue + ATTACK) : attack');
    await touche('touchEnd', []);
    await dort(1600);
    ok((await etat(t.p)).action === 'idle', tag + ' doigts leves : idle');
    ok(t.erreurs.length === 0, tag + ' : aucune erreur de console' + (t.erreurs.length ? ' : ' + t.erreurs.slice(0, 3).join(' | ') : ''));
    await t.ctx.close();
  }

  console.log('\n-- 3. 320 x 640 --');
  const q = await ouvre({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
  const m320 = await q.p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: 320, h: document.querySelector('#toile').getBoundingClientRect().height }));
  ok(m320.sw <= m320.iw && m320.h >= 250, '320 px : aucun defilement horizontal, la scene garde ' + Math.round(m320.h) + ' px de haut');
  ok(q.erreurs.length === 0, 'aucune erreur de console a 320 px');
  await q.ctx.close();

  console.log('\n-- 4. ?server= : ou part le jeton de session --');
  const vus = [];
  const autre = http.createServer((qq, r) => { vus.push({ m: qq.method, url: qq.url, auth: qq.headers.authorization || null });
    r.writeHead(200, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'content-type': 'application/json' }); r.end('{"ok":true,"proprietaire":false}'); });
  await new Promise((r) => autre.listen(0, '127.0.0.2', r));
  for (const cible of ['http://127.0.0.2:' + autre.address().port, 'https://ailleurs.example']) {
    const c2 = await nav.newContext();
    const p2 = await c2.newPage();
    const partis = [];
    /* aucune requete ne sort vraiment : le jeton factice ne part pas vers la production non plus */
    await p2.route('**/*', (rt) => { const u = rt.request().url(); if (u.startsWith('http://127.0.0.1') || u.startsWith('http://127.0.0.2')) return rt.continue(); partis.push({ url: u, auth: rt.request().headers().authorization || null }); return rt.abort(); });
    await p2.addInitScript(() => { try { localStorage.setItem('swogeSession', 'JETON-SESSION-ESSAI'); } catch (e) {} });
    await p2.goto(base + '?server=' + encodeURIComponent(cible));
    await p2.waitForFunction(() => window.spriteLab && window.spriteLab.etat().pret, null, { timeout: 15000 });
    await dort(600);
    const ser = await p2.evaluate(() => window.spriteLab.etat().serveur);
    const fuite = vus.concat(partis).find((v) => v.auth && v.auth.includes('JETON-SESSION-ESSAI') && !(v.url || '').startsWith('https://web-production-220a3.up.railway.app'));
    ok(!fuite && ser === 'https://web-production-220a3.up.railway.app', '?server=' + cible + ' : ignore (serveur retenu ' + ser + '), aucun en-tete authorization ne part ailleurs' + (fuite ? ' — parti : ' + JSON.stringify(fuite) : ''));
    await c2.close();
  }
  autre.close();

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
