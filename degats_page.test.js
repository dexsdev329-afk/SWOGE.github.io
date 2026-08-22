/* LES CHIFFRES DE DEGATS.
 *
 * Le serveur envoie `perte` a CHAQUE coup depuis toujours : le notre
 * (`realmTouche`), celui du familier (`realmFam`, quoi `mord`) et celui qu'on
 * encaisse (`realmCoup`). La page les jetait tous les trois. Le seul retour
 * chiffre du combat etait la barre de vie de la creature — une PROPORTION,
 * jamais un nombre — et un commentaire de nexus.js affirmait le contraire.
 *
 * ---- ce qui compte, dans l'ordre ----
 *
 * 1. LE NOMBRE EST CELUI DU SERVEUR. Pas un chiffre proche, pas une formule
 *    rejouee dans la page : `perte`, tel quel. Une seconde table de degats
 *    finirait par afficher un coup que le serveur n'a pas applique — le pire
 *    des mensonges, parce qu'il est precis.
 * 2. TROIS FAMILLES, TROIS COULEURS. Au milieu d'une melee il faut savoir
 *    d'ou vient un nombre SANS le lire.
 * 3. CE QU'ON ENCAISSE SE VOIT AUSSI. C'est le seul moyen de repondre a
 *    « pourquoi je meurs si vite » : la barre baissait sans jamais dire si
 *    c'etait un coup de douze ou trois coups de quatre.
 *
 * Comme partout ici : on ne lit aucune variable de la page — elles vivent dans
 * une fermeture. On enregistre ce qui est PEINT.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('degats_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('degats_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/degats-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.DEV_FAUCET = '1';
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
  const ouverts = new Set();
  const pas0 = Realm.prototype.pas;
  Realm.prototype.pas = function (dt) { if (!this.plan) ouverts.add(this); return pas0.call(this, dt); };
  const mondeDe = (a2) => [...ouverts].find((r) => r.joueurs.has(String(a2).toLowerCase())) || null;

  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const M = require(path.join(SERVEUR, 'monde'));
  const B = require(path.join(SERVEUR, 'boutique'));
  /* ---- UNE LAME DU CATALOGUE, ET LA PLUS FORTE ----
   * Le poing porte a 150 : un essai qui tire hors de portee dirait « aucun
   * chiffre n'est peint » alors que rien n'est arrive.
   * MYTHIQUE, et pas commune, pour une seconde raison : une commune frappe
   * dans les memes eaux que la morsure d'un compagnon de haut niveau. Deux
   * sources qui rendent le MEME nombre sortent dans deux couleurs, et l'essai
   * ne peut plus dire de qui vient lequel. On les ecarte en choisissant une
   * arme dont les degats ne peuvent pas se confondre. */
  const ARME = B.itemsDeSaison(2).filter((o) => o.rarete === 'mythique')[0]
            || B.itemsDeSaison(2)[0];
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

    /* ---- ON ESPIONNE LE TEXTE PEINT ----
     * `fillText` et lui seul : c'est la seule facon de savoir qu'un NOMBRE est
     * arrive a l'ecran. Le contour (`strokeText`) est pose juste avant avec le
     * meme texte — le compter aussi ferait voir chaque chiffre deux fois. */
    window.__ecrits = [];
    const F = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t) {
      window.__ecrits.push({ t: String(t), couleur: String(this.fillStyle),
                             police: String(this.font) });
      if (window.__ecrits.length > 8000) window.__ecrits.splice(0, 4000);
      return F.apply(this, arguments);
    };
  });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));

  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([a, b]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: a, signature: b })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);

  await p.evaluate(async () => {
    const s = window.__s[0];
    for (let i = 0; i < 16; i++) { s.send(JSON.stringify({ type: 'devCredit' })); await new Promise((r) => setTimeout(r, 60)); }
    await new Promise((r) => setTimeout(r, 400));
    s.send(JSON.stringify({ type: 'skinBuy', id: 'andy' }));
  });
  await p.waitForTimeout(1500);
  const addr = w.address.toLowerCase();
  const q = moteur._p(addr);
  q.objets = q.objets || {};
  q.objets[ARME.id] = (q.objets[ARME.id] || 0) + 1;
  moteur.equipeArme(addr, 'andy', ARME.id);
  /* ---- UN FAMILIER QUI AGIT DANS LA MINUTE ----
   * Sa recharge vaut SOIXANTE secondes au niveau un, et trois au niveau cent
   * (`rechargeFamilier`). On le monte donc au maximum par le vrai chemin — son
   * XP — plutot que d'attendre une minute par verification. Ce que le
   * compagnon FAIT reste decide par le serveur. */
  q.sacOeufs = { normal: 1 }; q.sacCases = null;
  moteur.ouvreOeuf(addr, 'normal');
  q.familiers.normal.xp = 3 * 99 * 100;             // le palier du niveau 100
  q.familierActif = 'normal';

  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForTimeout(1600);
  const monde0 = mondeDe(addr);
  ok(!!monde0, 'on est entre dans le monde de combat');
  const j = monde0.joueurs.get(addr);
  ok(!!j, 'et le serveur nous y tient un corps');
  ok(!!j.fam, `le familier est du voyage (${j.fam})`);

  const nombres = () => p.evaluate(() =>
    (window.__ecrits || []).filter((e) => /^[0-9]+$/.test(e.t))
      .map((e) => ({ t: e.t, couleur: e.couleur })));
  /* ---- ON NE LIT QUE LA FENETRE EN COURS ----
   * Le personnage vit dans le monde depuis son entree : il a deja frappe et
   * ete frappe avant la premiere section. Relire TOUS les messages recus
   * melangerait ces coups-la aux notres, et l'essai chercherait a l'ecran un
   * nombre peint deux fenetres plus tot — puis effac. */
  const marque = () => p.evaluate(() => (window.__s[0].__m || []).length);
  /* `fam` vaut `true` pour la morsure du compagnon, `false` pour nos coups, et
     `null` quand la distinction n'a pas de sens (les coups recus). Le serveur
     marque `familier` sur le MEME evenement que nos tirs : c'est ce champ, et
     lui seul, qui separe les deux. */
  const depuis = (k, type, fam) => p.evaluate(([i, t, f]) =>
    (window.__s[0].__m || []).slice(i)
      .filter((m2) => m2.type === t && m2.perte > 0
                      && (f === null || !!m2.familier === f))
      .map((m2) => m2.perte), [k, type, fam === undefined ? null : fam]);
  const vide = async () => { await p.evaluate(() => { window.__ecrits.length = 0; }); return marque(); };

  /* ---- ON DEGAGE LES ALENTOURS ----
   * L'anneau de terre est peuple. Un chiffre peint par une creature de passage
   * ferait dire a l'essai « le familier a mordu » alors qu'on regardait un
   * coup encaisse. On pose ensuite EXACTEMENT la creature qu'on veut. */
  const loin = () => {
    monde0.monstres = monde0.monstres.filter((m2) => {
      const dx = m2.x - j.x, dy = m2.y - j.y;
      return dx * dx + dy * dy > 1400 * 1400;
    });
  };
  /* Une cible qui encaisse : on veut des coups, pas une mort au premier tir. */
  const poseCible = (d, pv) => {
    const dx = M.CENTRE.x - j.x, dy = M.CENTRE.y - j.y;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const ux = horizontal ? Math.sign(dx) : 0;
    const uy = horizontal ? 0 : Math.sign(dy);
    const t = M.MONSTRES.lime;
    const m2 = { id: monde0._nouvelId(), espece: 'lime', biome: 'terre',
                 x: j.x + ux * d, y: j.y + uy * d, ancreX: j.x + ux * d, ancreY: j.y + uy * d,
                 pv: pv, pvMax: Math.max(pv, t.pv), dir: 'down', cible: null,
                 recharge: 0, rechargeT: 0, stase: 0, feu: 0, feuReste: 0, feuTaux: 0, feuPar: null,
                 errX: 0, errY: 0, errChrono: 0 };
    monde0.monstres.push(m2);
    return { m: m2, angle: Math.atan2(uy, ux), x: m2.x, y: m2.y };
  };
  /* ---- ON LE REMET OU ON L'A MIS ----
   * Un lime court a quatre-vingt-douze unites par seconde : pose a deux cents,
   * il nous touche en deux secondes et melange ses coups aux notres. Le
   * re-epingler entre deux tirs est la seule facon d'avoir une fenetre ou UNE
   * SEULE source fait des degats — et c'est de la couleur de cette source-la
   * que parle la verification. */
  const epingle = (c) => { c.m.x = c.x; c.m.y = c.y; c.m.cible = null; };

  /* ================== 1. CE QU'ON INFLIGE ================== */
  console.log('\n-- le nombre qu on inflige --');
  loin();
  /* ---- UNE SEULE SOURCE A LA FOIS ----
   * Le compagnon mord pour a peu pres autant qu'une lame commune : si les deux
   * frappent dans la meme fenetre, un nombre identique sort dans deux couleurs
   * et l'essai ne peut plus dire de qui il vient. On le fait taire ici, et on
   * ne fera QUE lui a la troisieme section. */
  const especeFam = j.fam;
  j.fam = null;
  const k1 = await vide();
  const cible = poseCible(200, 100000);
  for (let tour = 0; tour < 12; tour++) {
    epingle(cible);
    await p.evaluate((a) => {
      window.__s[0].send(JSON.stringify({ type: 'realmTir', a: a }));
    }, cible.angle);
    await p.waitForTimeout(140);
  }
  epingle(cible);
  await p.waitForTimeout(400);

  /* La verite vient du SERVEUR : on relit ce qu'il a annonce, et on cherche ce
     chiffre-la a l'ecran. Ecrire une valeur attendue ici rejouerait la formule
     de degats dans l'essai — exactement ce que la page ne doit pas faire. */
  const touches = await depuis(k1, 'realmTouche', false);
  ok(touches.length > 0, `le serveur a annonce ${touches.length} coup(s) portes`);
  const peints = await nombres();
  ok(peints.length > 0, `des nombres sont peints a l ecran (${peints.length})`);
  const attendu = String(touches[0]);
  ok(peints.some((e) => e.t === attendu),
     `le nombre peint est CELUI du serveur (${attendu} parmi ${peints.slice(0, 6).map((e) => e.t).join(',')})`);
  /* ---- ET AUCUN QUI NE VIENNE PAS DE LUI ----
   * La fenetre est propre : le compagnon se tait et la cible est epinglee hors
   * de portee. Tout nombre peint ici doit donc etre un coup annonce. Une page
   * qui rejouerait la formule de degats de son cote poserait justement ici un
   * chiffre voisin — et c'est le mensonge le plus difficile a voir, parce
   * qu'il a l'air juste. */
  const permis = new Set(touches.map(String));
  /* Un nombre peint DE LA COULEUR DE NOS COUPS et que le serveur n'a pas
     annonce serait une formule rejouee dans la page. On ne regarde que cette
     couleur-la : ce qui sort en rouge appartient a la creature qui nous mord,
     et sera verifie a la section suivante. */
  const teinteNotre = peints.filter((e) => permis.has(e.t))[0].couleur;
  const inconnus = peints.filter((e) => e.couleur === teinteNotre && !permis.has(e.t));
  ok(inconnus.length === 0,
     `aucun nombre de NOTRE couleur que le serveur n a pas annonce (${inconnus.slice(0, 4).map((e) => e.t).join(',') || 'aucun'})`);
  /* ---- LA COULEUR SE LIT SUR UN NOMBRE QUI N'APPARTIENT QU'A NOUS ----
   * Le monde est peuple et vivant : une creature de passage peut nous mordre
   * pendant qu'on tire, et exiger une fenetre parfaitement propre ferait un
   * essai qui tombe au hasard. On prend donc un nombre que SEULE cette
   * source-la a produit, et l'on regarde de quelle couleur il est sorti. */
  const COUL_INFLIGE = peints.filter((e) => permis.has(e.t))[0].couleur;
  ok(/^#|rgb/.test(COUL_INFLIGE), `nos coups ont leur couleur (${COUL_INFLIGE})`);

  /* ================== 2. CE QU'ON ENCAISSE ================== */
  console.log('\n-- le nombre qu on encaisse --');
  loin();
  const k2 = await vide();
  /* Collee au joueur, et le compagnon toujours muet : le lime frappe au
     contact, et c'est le chemin le plus court vers un `realmCoup` sans
     dependre de son humeur. */
  poseCible(30, 100000);
  await p.waitForTimeout(2500);
  const coups = await depuis(k2, 'realmCoup', null);
  ok(coups.length > 0, `le serveur a annonce ${coups.length} coup(s) recus`);
  const peints2 = await nombres();
  /* Ce qui n'appartient qu'aux coups RECUS : on ecarte les valeurs que nos
     propres tirs ont pu produire, sinon on lirait la mauvaise couleur. */
  const seulsRecus = coups.map(String).filter((v) => touches.map(String).indexOf(v) < 0);
  ok(seulsRecus.length > 0, 'au moins un montant n appartient qu aux coups recus');
  const subis = peints2.filter((e) => seulsRecus.indexOf(e.t) >= 0);
  ok(subis.length > 0, `ce qu on encaisse est peint aussi (${subis.slice(0, 4).map((e) => e.t).join(',')})`);
  const COUL_SUBI = subis[0].couleur;
  ok(COUL_SUBI !== COUL_INFLIGE,
     `dans une AUTRE couleur que ce qu on inflige (${COUL_SUBI} contre ${COUL_INFLIGE})`);
  /* Il est le plus GROS des trois : c'est le seul qui demande une decision
     tout de suite. La taille se lit dans la police posee au moment du dessin. */
  const tailleDe = async (coul) => p.evaluate((c) => {
    const e = (window.__ecrits || []).filter((x) => x.couleur === c && /^[0-9]+$/.test(x.t)).pop();
    return e ? Number((e.police.match(/(\d+)px/) || [])[1]) : 0;
  }, coul);
  const tSubi = await tailleDe(COUL_SUBI), tInflige = await tailleDe(COUL_INFLIGE);
  ok(tSubi > tInflige, `et plus gros que ce qu on inflige (${tSubi}px contre ${tInflige}px)`);

  /* ================== 3. CE QUE LE FAMILIER INFLIGE ================== */
  console.log('\n-- le nombre du familier --');
  loin();
  /* Le compagnon revient, et c'est LUI SEUL qui frappe : on ne tire pas, et la
     cible reste epinglee hors de tout contact. On remet sa recharge a zero :
     au niveau cent elle vaut trois secondes, et l'essai n'a pas a attendre le
     hasard du premier tour. */
  /* ---- ET HORS DU RAYON DE SON TROISIEME CRAN ----
   * La cible etait a cent vingt. Depuis le cran de SOUTIEN (niveau 60), un
   * compagnon de niveau cent pose d'abord son aide sur son maitre des qu'une
   * creature se tient dans son rayon de zone (200) — et cette aide consomme
   * la recharge. Sur les trois secondes que dure cette section, il ne restait
   * donc plus un seul tour pour mordre : l'essai disait « le familier a mordu
   * 0 fois » alors que rien n'etait casse.
   * On epingle donc la proie ENTRE les deux distances : dans sa portee a lui
   * (260), hors du rayon qui declenche le soutien (200). La fenetre ne
   * contient plus qu'une seule chose — sa morsure — qui est le sujet. */
  j.fam = especeFam;
  j.famR = 0;
  const k3 = await vide();
  /* Les deux bornes viennent du MONDE, pas d'un nombre choisi ici : le jour
     ou la portee du compagnon ou le rayon de ses zones changent, la proie se
     replace toute seule au lieu de sortir d'une des deux sans rien dire. */
  const proie = poseCible(
    Math.round((M.FAMILIERS.zoneRayon + M.FAMILIERS.portee) / 2), 100000);
  for (let tour = 0; tour < 15; tour++) { epingle(proie); await p.waitForTimeout(200); }
  /* La morsure arrive par le MEME evenement que nos tirs, marque `familier` :
     c'est tout le sens du champ, et c'est ce que l'essai doit eprouver. */
  const morsures = await depuis(k3, 'realmTouche', true);
  ok(morsures.length > 0, `le familier a mordu ${morsures.length} fois`);
  const peints3 = await nombres();
  /* Meme precaution : un montant que seule la morsure a produit. */
  const seulesMorsures = morsures.map(String)
    .filter((v) => touches.map(String).indexOf(v) < 0 && coups.map(String).indexOf(v) < 0);
  ok(seulesMorsures.length > 0,
     `au moins un montant n appartient qu a la morsure (${seulesMorsures.join(',') || 'aucun'})`);
  const dufam = peints3.filter((e) => seulesMorsures.indexOf(e.t) >= 0);
  ok(dufam.length > 0, `sa morsure porte un nombre (${dufam.slice(0, 4).map((e) => e.t).join(',')})`);
  const COUL_FAM = dufam[0].couleur;
  ok(COUL_FAM !== COUL_INFLIGE && COUL_FAM !== COUL_SUBI,
     `dans sa PROPRE couleur (${COUL_FAM}, contre ${COUL_INFLIGE} et ${COUL_SUBI})`);

  ok(erreurs.length === 0, 'aucune erreur de page' + (erreurs.length ? ' : ' + erreurs[0] : ''));

  await nav.close(); site.stop();
  console.log(`\ndegats_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
