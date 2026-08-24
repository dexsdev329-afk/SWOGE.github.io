'use strict';
/*
 * L'EDITEUR DE CARTES, DU CLIC A LA SAUVEGARDE.
 *
 * ---- CE QUE LES AUTRES ESSAIS NE PROUVENT PAS ----
 *
 * Le serveur refuse les ecritures d'un tiers, et c'est verifie. Le catalogue
 * est a jour, et c'est verifie. Rien de tout cela ne dit que le bouton
 * « Enregistrer » envoie la bonne chose : une page qui construirait mal son
 * message serait refusee par un serveur parfaitement correct, et le joueur
 * verrait son travail disparaitre sans qu'aucun essai ne tombe.
 *
 * On fait donc le chemin ENTIER, par les memes gestes qu'un joueur : marcher
 * jusqu'a la machine, ouvrir, choisir un element, dessiner, nommer,
 * enregistrer — puis regarder ce que le SERVEUR a garde, par sa route
 * d'administration. Aucun raccourci par la console : ouvrir le panneau a la
 * main ne dirait rien du chemin qu'emprunte un joueur.
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

let n = 0, echecs = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { echecs++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ` [${a} vs ${b}]`);

const SITE = __dirname;
const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('  (serveur absent, essai ignore)');
  process.exit(0);
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
                '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
                '.css': 'text/css', '.mp3': 'audio/mpeg' };
const servirLeSite = async () => {
  const s = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { port: s.address().port, stop: () => s.close() };
};

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/carte-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify() {}, notifyPhoto() {}, sendDocument() {},
    chatEstPublic() { return true; }, enabled() { return true; } } };
  const port = await new Promise((r) => {
    const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); });
  });
  process.env.PORT = String(port);
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  await new Promise((r) => setTimeout(r, 1400));

  const site = await servirLeSite();
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) {
      const s = (pr === undefined) ? new N(u) : new N(u, pr);
      s.__m = [];
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      window.__s.push(s);
      return s;
    }
    C.prototype = N.prototype; C.OPEN = N.OPEN; C.CLOSED = N.CLOSED;
    window.WebSocket = C;
  });
  /* ---- ON DIT A LA PAGE OU EST LE SERVEUR ----
   * Sans `?server=`, elle retombe sur l'adresse de PRODUCTION : la socket
   * s'ouvre, ne recoit rien de notre serveur d'essai, et l'essai attend un
   * `hello` qui n'arrivera jamais. Le symptome est muet — une socket ouverte
   * et zero message — et il ne dit pas qu'on frappe a la mauvaise porte.
   * Pire : sans ce garde, un essai pourrait ecrire sur le vrai serveur. */
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=`
               + encodeURIComponent('ws://127.0.0.1:' + port),
               { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);

  console.log('-- on entre dans le jeu --');
  const w = ethers.Wallet.createRandom();
  /* On ATTEND le `hello` au lieu de dormir un temps fixe : la page ouvre sa
     socket quand elle est prete, pas quand l'essai a fini de compter. */
  const etat = await p.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      const s = (window.__s || []).find((q) => q.__m.some((m) => m.type === 'hello'));
      if (s) return { ok: true, nonce: s.__m.find((m) => m.type === 'hello').loginNonce };
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: false, sockets: (window.__s || []).length,
             types: [...new Set((window.__s || []).flatMap((q) => q.__m.map((m) => m.type)))] };
  });
  ok(etat.ok, 'la page ouvre sa socket et recoit le hello'
     + (etat.ok ? '' : ` — ${etat.sockets} socket(s), types recus : ${(etat.types || []).join(', ') || 'aucun'}`));
  if (!etat.ok) { await nav.close(); site.stop(); process.exit(1); }
  const nonce = etat.nonce;
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, sg]) => window.__s[0].send(JSON.stringify({ type: 'login', message: m, signature: sg })), [msg, sig]);
  await p.waitForTimeout(1500);
  ok(true, 'un compte est connecte : ' + w.address.slice(0, 10));

  console.log('\n-- on marche jusqu a la machine --');
  await p.keyboard.down('ArrowUp'); await p.waitForTimeout(900); await p.keyboard.up('ArrowUp');
  await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(3600); await p.keyboard.up('ArrowLeft');
  await p.waitForTimeout(2200);
  const ouvert = await p.evaluate(() => {
    const v = document.getElementById('nxMapVoile');
    return { on: !!v && v.classList.contains('on'),
             vignettes: document.querySelectorAll('#nxMapPalette .nxmap-el').length,
             dit: (document.getElementById('nxMapDit') || {}).textContent };
  });
  ok(ouvert.on, 'la machine ouvre le panneau — sans passer par la console');
  ok(ouvert.vignettes > 80, `la palette porte ${ouvert.vignettes} elements, lus du catalogue`);
  ok(!/Not connected/.test(ouvert.dit || ''), 'et la galerie a pu etre demandee (connecte)');

  console.log('\n-- on dessine --');
  await p.click('#nxMapNouvelle');
  await p.waitForTimeout(400);
  /* Un SOL, choisi dans la palette comme un joueur le ferait. On prend le
     premier de la famille : son nom vient du catalogue, pas d'ici. */
  const cle = await p.evaluate(() => {
    const b = document.querySelector('#nxMapPalette .nxmap-el[data-fam="sol"]');
    b.click();
    return b.dataset.cle;
  });
  ok(!!cle, 'un sol est choisi dans la palette : ' + cle);

  /* Trois cases, posees par de vrais evenements de pointeur sur la grille. */
  const pose = await p.evaluate(() => {
    const g = document.getElementById('nxMapGrille');
    const r = g.getBoundingClientRect();
    const p1 = (x, y) => g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true,
      pointerId: 3, clientX: r.left + x, clientY: r.top + y }));
    const p2 = (x, y) => g.dispatchEvent(new PointerEvent('pointermove', { bubbles: true,
      pointerId: 3, clientX: r.left + x, clientY: r.top + y }));
    const pas = r.width / 48;
    p1(pas * 2.5, pas * 2.5);
    p2(pas * 3.5, pas * 2.5);
    p2(pas * 4.5, pas * 2.5);
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3 }));
    return { largeur: Math.round(r.width) };
  });
  ok(pose.largeur > 100, `la grille est a l ecran (${pose.largeur} px)`);

  console.log('\n-- on nomme et on enregistre --');
  await p.fill('#nxMapNom', 'Ma premiere carte');
  await p.click('#nxMapEnregistre');
  await p.waitForTimeout(1600);
  const apres = await p.evaluate(() => (document.getElementById('nxMapDit') || {}).textContent);
  eq(apres, 'Saved.', 'la page annonce l enregistrement');

  /* ---- ET LE SERVEUR, LUI, A-T-IL GARDE QUELQUE CHOSE ? ----
   * C'est la seule question qui compte. Une page peut annoncer « enregistre »
   * sur la foi d'un message qu'elle a mal lu. */
  const base = 'http://127.0.0.1:' + port;
  const j = await (await fetch(base + '/admin/cartes', { headers: { 'x-admin-key': 'k' } })).json();
  ok(j.ok && j.cartes.length === 1, `le serveur garde ${j.cartes ? j.cartes.length : 0} carte`);
  if (j.cartes && j.cartes[0]) {
    eq(j.cartes[0].nom, 'Ma premiere carte', 'avec le nom tape au clavier');
    eq(String(j.cartes[0].addr).toLowerCase(), w.address.toLowerCase(), 'et l adresse du compte qui a dessine');
    ok(j.cartes[0].cases >= 3, `et les ${j.cartes[0].cases} cases tracees a la souris`);
    const une = await (await fetch(base + '/admin/cartes?id=' + j.cartes[0].id,
                                   { headers: { 'x-admin-key': 'k' } })).json();
    ok(une.carte.cases.every((q) => q.s === cle),
       'chaque case porte bien le sol choisi dans la palette : ' + cle);
  }

  console.log('\n-- et une parcelle isometrique prend la place qu elle occupe --');
  /* ---- POURQUOI ON MESURE LE DESSIN, ET NON LE MODELE ----
   * Le catalogue dit qu'une parcelle vaut cinq cases. Verifier que la page a
   * bien lu ce nombre ne dirait rien : ce qui compte est ce qui est DESSINE.
   * Une parcelle enfermee dans sa case redeviendrait une tache de quatorze
   * pixels, et le champ `cases` serait toujours la, exact et sans effet.
   * On compte donc les colonnes peintes sur la grille, sur une carte vide ou
   * seul le fond est de couleur connue. */
  const iso = await p.evaluate(() => {
    const b = document.querySelector('#nxMapPalette .nxmap-el[data-fam="iso"]');
    if (!b) return null;
    b.click();
    const g = document.getElementById('nxMapGrille');
    const r = g.getBoundingClientRect();
    const pas = r.width / 48;
    /* Loin des bords : une parcelle posee en (1,1) sortirait de la grille et
       la mesure compterait ce qui reste, pas ce qui est dessine. */
    const cc = 24, ll = 24;
    g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7,
      clientX: r.left + (cc + .5) * pas, clientY: r.top + (ll + .5) * pas }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 }));
    return { cle: b.dataset.cle, cc, ll };
  });
  await p.waitForTimeout(1200);
  const large = await p.evaluate((q) => {
    const g = document.getElementById('nxMapGrille');
    const C = g.getContext('2d');
    const n = 48, pas = g.width / n;
    /* La bande de la parcelle, du haut de son dessin jusqu'a son pied. */
    const y0 = Math.max(0, Math.round((q.ll + 1) * pas) - Math.round(pas * 8));
    const h = Math.round((q.ll + 1) * pas) - y0;
    const d = C.getImageData(0, y0, g.width, h).data;
    const somme = (x, y) => {
      const i = (y * g.width + x) * 4;
      return d[i] + d[i + 1] + d[i + 2];
    };
    /* ---- LE SEUIL SE MESURE, IL NE SE DEVINE PAS ----
     * Ecrit en dur, il etait faux : le fond vaut #0a1020, mais un CROISEMENT
     * de deux traits de grille monte a 61 de bleu, et un seuil pose a 60
     * declarait alors toute la largeur « dessinee ». On prend donc pour
     * reference les colonnes de GAUCHE de la bande — vides par construction,
     * la parcelle etant posee au milieu — et l'on ne compte que ce qui les
     * depasse franchement. Le jour ou la grille change d'opacite, la mesure
     * suit toute seule.
     */
    let fond = 0;
    for (let x = 0; x < 6; x++) for (let y = 0; y < h; y++) fond = Math.max(fond, somme(x, y));
    const seuil = fond + 40;
    const cols = [];
    for (let x = 0; x < g.width; x++) {
      for (let y = 0; y < h; y++) { if (somme(x, y) > seuil) { cols.push(x); break; } }
    }
    return { min: cols[0], max: cols[cols.length - 1], combien: cols.length,
             fond, seuil, pas: Math.round(pas) };
  }, iso);
  const attendu = (JSON.parse(fs.readFileSync(path.join(SITE, 'catalogue.json'), 'utf8'))
                   .iso.find((e) => e.cle === iso.cle) || {}).cases;
  const dessine = large.max - large.min + 1;
  ok(attendu >= 2, `le catalogue donne ${attendu} cases a ${iso.cle}`);
  ok(dessine > large.pas * (attendu - 1) && dessine <= large.pas * (attendu + 1),
     `elle est dessinee sur ${dessine} px la ou une case en fait ${large.pas}`
     + ` — soit ${attendu} cases (fond mesure a ${large.fond}, seuil ${large.seuil})`);


  ok(erreurs.length === 0, 'aucune erreur de page' + (erreurs.length ? ' — ' + erreurs[0] : ''));
  await nav.close(); site.stop();
  console.log(`\ncarte_page.test.js : ${n} verifications, ${echecs} echec(s)`);
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.log('  RATE essai interrompu : ' + (e && e.message)); process.exit(1); });
