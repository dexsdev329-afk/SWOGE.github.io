'use strict';
/*
 * SPRITE LAB — ON BOUGE LE MONSTRE, ET IL FAIT CE QU'IL DOIT.
 *
 * La page lit la planche publiee du mannequin (img/nexus/monstres/iso/,
 * format de sortie de la chaine du serveur, outils/planches/chaine.js) et la
 * fait bouger. Ce que cet essai verrouille :
 *   1. elle charge la planche (index.json -> fiche -> 5 planches) sans une
 *      erreur de console, et sans appeler aucun serveur quand il n'y a pas de
 *      session ;
 *   2. a l'arret : idle, et l'image avance avec le TEMPS ;
 *   3. droite + bas : walk, direction SE, le monstre va a droite et en bas ;
 *      gauche + haut : NW ; gauche + bas : SW ; droite + haut : NE ; droite
 *      PURE garde le signe vertical precedent (NE apres NE) ;
 *   4. on lache : idle ; Shift : run ; Space : attack, joue UNE fois, le
 *      monstre ne bouge pas pendant le geste, puis revient ;
 *   5. la manette tactile (390 px, toucher) : vers le haut-gauche = NW, au
 *      bout de sa course = run ; le bouton ATTACK attaque ;
 *   6. 320, 390 et 1440 px : aucun defilement horizontal.
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

(async () => {
  const srv = await servir();
  const base = 'http://127.0.0.1:' + srv.address().port + '/sprite_lab.html';
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const dort = (ms) => new Promise((r) => setTimeout(r, ms));

  async function ouvre(opts) {
    const p = await nav.newPage(opts);
    const erreurs = [], dehors = [];
    p.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    p.on('pageerror', (e) => erreurs.push(String(e)));
    p.on('request', (q) => { if (!q.url().startsWith('http://127.0.0.1')) dehors.push(q.url()); });
    await p.goto(base);
    await p.waitForFunction(() => window.spriteLab && window.spriteLab.etat().pret, null, { timeout: 15000 });
    return { p, erreurs, dehors };
  }
  const etat = (p) => p.evaluate(() => window.spriteLab.etat());

  console.log('-- 1. au bureau (1440 px, clavier) --');
  const { p, erreurs, dehors } = await ouvre({ viewport: { width: 1440, height: 900 } });
  const e0 = await etat(p);
  ok(e0.pret && e0.nom === 'Test mannequin' && e0.dirs.join() === 'se,sw,nw,ne', 'la planche publiee est chargee (mannequin, directions SE SW NW NE)');
  ok(e0.action === 'idle', 'a l arret : idle');
  const c0 = (await etat(p)).cadre; await dort(700); const c1 = (await etat(p)).cadre;
  ok(c1 !== c0, 'idle avance avec le temps (' + c0 + ' -> ' + c1 + ')');
  await p.click('#scene');

  async function marche(touches, ms) {
    for (const t of touches) await p.keyboard.down(t);
    await dort(ms || 450);
    const e = await etat(p);
    for (const t of touches) await p.keyboard.up(t);
    return e;
  }
  let a = await etat(p);
  let e = await marche(['KeyD', 'KeyS']);
  ok(e.action === 'walk' && e.dir === 'se' && e.x > a.x && e.y > a.y, 'droite + bas : walk, SE, vers la droite et le bas');
  a = await etat(p); e = await marche(['KeyA', 'KeyW']);
  ok(e.action === 'walk' && e.dir === 'nw' && e.x < a.x && e.y < a.y, 'gauche + haut (WASD = ZQSD par position) : NW');
  e = await marche(['ArrowLeft', 'ArrowDown']);
  ok(e.dir === 'sw', 'fleches gauche + bas : SW');
  e = await marche(['KeyD', 'KeyW']);
  ok(e.dir === 'ne', 'droite + haut : NE');
  a = await etat(p); e = await marche(['KeyD']);
  ok(e.dir === 'ne' && e.x > a.x && Math.abs(e.y - a.y) < 1, 'droite PURE : le monstre va a droite et garde NE (signe vertical precedent)');
  await dort(150);
  ok((await etat(p)).action === 'idle', 'on lache : idle');
  e = await marche(['ShiftLeft', 'KeyS', 'KeyA']);
  ok(e.action === 'run' && e.dir === 'sw', 'Shift : run (SW)');
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
  const dom = await p.evaluate(() => ({ hud: document.getElementById('hud').textContent, ds: document.getElementById('scene').dataset.dir, sw: document.documentElement.scrollWidth, iw: innerWidth }));
  ok(/·/.test(dom.hud) && !!dom.ds, 'le HUD dit l action, la direction et l image (' + dom.hud + ')');
  ok(dom.sw <= dom.iw, '1440 px : aucun defilement horizontal');
  ok(erreurs.length === 0, 'aucune erreur de console' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''));
  ok(dehors.length === 0, 'sans session, aucun appel hors du site' + (dehors.length ? ' : ' + dehors.slice(0, 2).join(' ') : ''));
  await p.close();

  console.log('\n-- 2. au telephone (390 px, toucher) --');
  const t = await ouvre({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const vis = await t.p.evaluate(() => getComputedStyle(document.getElementById('pad')).display);
  ok(vis === 'flex', 'la manette est la sur un ecran tactile');
  const b = await t.p.locator('#manche').boundingBox();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const s0 = await etat(t.p);
  /* un doigt pose au centre, glisse vers le haut-gauche jusqu'au bord : pointer events */
  await t.p.dispatchEvent('#manche', 'pointerdown', { pointerId: 7, clientX: cx, clientY: cy, isPrimary: true, pointerType: 'touch', bubbles: true });
  await t.p.dispatchEvent('#manche', 'pointermove', { pointerId: 7, clientX: cx - b.width * 0.48, clientY: cy - b.height * 0.48, isPrimary: true, pointerType: 'touch', bubbles: true });
  await dort(400);
  const s1 = await etat(t.p);
  ok(s1.dir === 'nw' && s1.action === 'run' && s1.x < s0.x && s1.y < s0.y, 'manche au bout vers le haut-gauche : run, NW');
  await t.p.dispatchEvent('#manche', 'pointermove', { pointerId: 7, clientX: cx + b.width * 0.2, clientY: cy + b.height * 0.2, isPrimary: true, pointerType: 'touch', bubbles: true });
  await dort(250);
  const s2 = await etat(t.p);
  ok(s2.dir === 'se' && s2.action === 'walk', 'a mi-course vers le bas-droite : walk, SE');
  await t.p.dispatchEvent('#manche', 'pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true });
  await dort(150);
  ok((await etat(t.p)).action === 'idle', 'doigt leve : idle');
  await t.p.dispatchEvent('#b-attaque', 'pointerdown', { pointerId: 8, pointerType: 'touch', bubbles: true });
  await dort(60);
  ok((await etat(t.p)).action === 'attack', 'bouton ATTACK : attack');
  const m390 = await t.p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  ok(m390.sw <= m390.iw, '390 px : aucun defilement horizontal [' + m390.sw + ' / ' + m390.iw + ']');
  ok(t.erreurs.length === 0, 'aucune erreur de console au telephone' + (t.erreurs.length ? ' : ' + t.erreurs.slice(0, 3).join(' | ') : ''));
  await t.p.close();

  console.log('\n-- 3. 320 px --');
  const q = await ouvre({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
  const m320 = await q.p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, h: document.querySelector('#toile').getBoundingClientRect().height }));
  ok(m320.sw <= m320.iw && m320.h >= 250, '320 px : aucun defilement horizontal, la scene garde ' + Math.round(m320.h) + ' px de haut');
  ok(q.erreurs.length === 0, 'aucune erreur de console a 320 px');
  await q.p.close();

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
