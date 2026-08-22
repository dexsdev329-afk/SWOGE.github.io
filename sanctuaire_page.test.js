/* LE SANCTUAIRE DE CENDRE, VU DE LA PAGE — son sol se voit-il ?
 *
 * Le joueur l'a dit deux fois : « il manque le sol du donjon, on ne le voit
 * pas, c'est bleu ». Le bleu est `#0A1128`, le fond du canvas : il se voit
 * partout ou AUCUNE tuile n'a ete posee. Un donjon sans sol n'a pas d'erreur a
 * montrer — rien ne plante, la page continue de tourner — et c'est bien ce qui
 * a permis au defaut de survivre a un premier correctif.
 *
 * Cet essai ne compte donc PAS des appels de dessin : il regarde ce que le
 * joueur regarde, les PIXELS sous ses pieds, dans le sas ou l'on arrive.
 *
 * CE QU'IL MESURE, ET POURQUOI CES PIXELS-LA :
 *  - Le sas du Sanctuaire est vide par construction (`especes: []` cote
 *    serveur, le decor n'est pose que dans la salle du fond, et les creatures
 *    du donjon sont toutes appelees par l'Idole, deux salles plus loin). Ce
 *    qu'on y trouve tient en deux objets : le personnage et la porte de
 *    retour. Les deux ont une position CONNUE — on les decoupe du champ de
 *    mesure — et il ne reste alors que du sol.
 *  - Les tuiles regardees sont celles que LE SERVEUR a nommees sol (`tuiles`
 *    du message d'entree), autour de la tuile ou le personnage se tient. On
 *    ne devine aucune geometrie : la forme du donjon change a chaque partie.
 *  - La conversion monde -> pixels vient de la MATRICE du canvas, relevee au
 *    moment ou la page dessine. Recalculer la camera ici aurait fait deux
 *    cadrages a tenir d'accord, et l'essai aurait mesure un carre de l'ecran
 *    ou le sol n'a jamais eu a etre.
 *
 * Comme partout ici : on ne lit aucune variable de la page — elles vivent dans
 * une fermeture. On enregistre ce qui est PEINT, et on lit ce qui est AFFICHE.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('sanctuaire_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('sanctuaire_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const manquants = [];
const servis = [];
function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp3': 'audio/mpeg' };
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const f = path.join(racine, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { manquants.push(q.url.split('?')[0]); r.writeHead(404); r.end(); return; }
        servis.push(q.url.split('?')[0]);
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/sanctuaire-');
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
  let donjon0 = null;
  const ouverts = new Set();
  const pas0 = Realm.prototype.pas;
  Realm.prototype.pas = function (dt) {
    if (this.plan) donjon0 = this; else ouverts.add(this);
    return pas0.call(this, dt);
  };

  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const M = require(path.join(SERVEUR, 'monde'));
  const boutique = require(path.join(SERVEUR, 'boutique'));
  const ARME = boutique.ITEMS.concat(boutique.ITEMS_DROP)
    .find((o) => o.famille === 'lame' && o.rarete === 'commun');

  /* ---- QUI OUVRE LE SANCTUAIRE, ET QUEL SOL IL PORTE ----
   * Demandes au SERVEUR, jamais ecrits ici. Nommer 'heraut' et
   * 'ground_sanctuaire' en dur aurait fait de cet essai une troisieme copie de
   * la table des donjons — exactement la faute qui a produit le defaut qu'il
   * mesure. Le jour ou le sanctuaire change d'ouvreur ou de sol, l'essai suit.
   */
  const CLE = 'sanctuaire';
  const DJ = M.DONJONS[CLE];
  const OUVREUR = DJ && DJ.ouvreur;
  const SOL = DJ && (DJ.sol || 'donjon');
  ok(!!DJ, `le Sanctuaire existe cote serveur (cle « ${CLE} »)`);
  ok(!!OUVREUR, `et une creature l'ouvre (« ${OUVREUR} »)`);
  ok(M.PORTAIL_DE[OUVREUR] === CLE, 'sa mort ouvre bien CE donjon');
  console.log(`  (le serveur nomme son sol « ${SOL} »)`);

  await new Promise((r) => setTimeout(r, 1500));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const portefeuille = ethers.Wallet.createRandom();
  const erreurs = [];

  const p = await nav.newPage({ viewport: { width: 1280, height: 800 } });
  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) {
      const s = (pr === undefined) ? new N(u) : new N(u, pr);
      s.__m = [];
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      s.__out = [];
      const env = s.send.bind(s);
      s.send = function (d) { try { s.__out.push(JSON.parse(d)); } catch (x) {} return env(d); };
      window.__s.push(s); return s;
    }
    C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
    window.WebSocket = C;

    window.__image = 0;
    (function compte() { window.__image++; requestAnimationFrame(compte); })();
    window.__peint = [];
    /* ---- LA MATRICE, RELEVEE AU PREMIER DESSIN DE CHAQUE IMAGE ----
     * La scene du monde est peinte sous une seule transformation — echelle de
     * l'ecran, zoom, camera — et tout ce qui la compose la partage. On la
     * releve au PREMIER dessin de la trame, tant qu'on est certain d'etre dans
     * le monde : les dernieres lignes d'une trame peignent la boussole, qui est
     * a l'ecran et non dans le monde, et prendre celle-la aurait converti les
     * coordonnees du donjon en un carre de l'interface.
     * Le canvas du jeu SEULEMENT : la mini-carte dessine elle aussi, avec sa
     * propre echelle. */
    const D = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img) {
      const n = arguments.length;
      const jeu = this.canvas && this.canvas.id === 'nxCanvas';
      if (jeu && window.__mt !== window.__image) {
        window.__mt = window.__image;
        const m = this.getTransform();
        window.__T = { a: m.a, d: m.d, e: m.e, f: m.f };
      }
      if (n === 9 || n === 5) {
        const src = (img && (img.currentSrc || img.src)) || '';
        const bouts = String(src).split('?')[0].split('/');
        window.__peint.push({ src: bouts[bouts.length - 1],
                              dx: arguments[n === 9 ? 5 : 1], dy: arguments[n === 9 ? 6 : 2],
                              dw: arguments[n === 9 ? 7 : 3], dh: arguments[n === 9 ? 8 : 4],
                              f: window.__image,
                              ecran: !!(this.canvas && this.canvas.isConnected) });
        if (window.__peint.length > 40000) window.__peint.splice(0, 20000);
      }
      return D.apply(this, arguments);
    };
  });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));

  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await portefeuille.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);

  await p.evaluate(async () => {
    const s = window.__s[0];
    for (let i = 0; i < 16; i++) { s.send(JSON.stringify({ type: 'devCredit' })); await new Promise((r) => setTimeout(r, 60)); }
    await new Promise((r) => setTimeout(r, 400));
    s.send(JSON.stringify({ type: 'skinBuy', id: 'andy' }));
  });
  await p.waitForTimeout(1500);
  ok(!!moteur, 'le moteur du serveur est attrape');
  ok(!!ARME, 'et une lame commune existe au catalogue');
  const q = moteur._p(portefeuille.address);
  q.objets = q.objets || {};
  q.objets[ARME.id] = (q.objets[ARME.id] || 0) + 1;
  moteur.equipeArme(portefeuille.address, 'andy', ARME.id);

  /* ---- CE QUE LA PAGE VA CHERCHER, ET QUAND ----
   * Le defaut n'est PAS que la texture manque : c'est qu'elle part en
   * dernier. Un essai qui attend cinq secondes puis regarde le sol le trouvera
   * toujours peint — c'est justement l'attente qu'on reproche.
   * On enregistre donc l'ORDRE des demandes, ce qui se mesure sans brider le
   * reseau et reste vrai quelle que soit la machine. */
  const solsDemandes = [];
  p.on('request', (r) => {
    const u = r.url();
    const m2 = u.match(/\/img\/nexus\/tiles\/(ground_[a-z]+)\.webp/);
    if (m2 && solsDemandes.indexOf(m2[1]) < 0) solsDemandes.push(m2[1]);
  });

  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForTimeout(1500);
  const addr = portefeuille.address.toLowerCase();
  const monde0 = [...ouverts].find((r) => r.joueurs.has(addr)) || [...ouverts][0] || null;
  console.log('\n-- on entre dans le monde --');
  ok(!!monde0, 'la simulation du monde ouvert est attrapee');
  /* ---- LE MONDE OUVERT NE DEMANDE QUE SES PROPRES SOLS ----
   * Il en nomme cinq dans ses anneaux. Le catalogue en dur en compte sept :
   * les deux autres sont des sols de DONJON, que personne ne dessinera ici.
   * Les charger malgre tout n'etait pas seulement du gachis — c'est ce qui
   * mettait la texture du donjon en file derriere elles au moment d'entrer. */
  /* Le PREMIER `realmEntre` : celui du monde ouvert. On le relit du flux comme
     le reste — supposer les cinq anneaux ici, c'est recopier monde.js. */
  const anneauxOuverts = await p.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre')[0];
    return (e && e.anneaux) || [];
  });
  const attendus = anneauxOuverts.map((a) => 'ground_' + a.biome);
  /* ---- ON COMPTE, ON NE NOMME PAS ----
   * Ma premiere version fabriquait les noms attendus par 'ground_' + biome.
   * C'est FAUX, et l'essai me l'a dit : la page tient une table de traduction
   * — terre donne ground_dirt, neige ground_snow, lave ground_lava — et la
   * recopier ici aurait fait deux tables a tenir d'accord, ce que ce depot
   * passe son temps a eviter. La refaire dans l'essai, c'est verifier le
   * calcul de la page avec le meme calcul.
   * Le NOMBRE, lui, ne demande aucune traduction : un sol par anneau nomme,
   * plus au plus la dalle des salles gardees (ground_temple, posee PAR-DESSUS
   * le biome dans le monde ouvert et jamais dans un donjon). */
  ok(attendus.length > 0, `le serveur nomme ${attendus.length} sols pour le monde ouvert`);
  ok(solsDemandes.length <= attendus.length + 1,
     `et la page en demande ${solsDemandes.length}, pas une de plus que necessaire (${solsDemandes.join(', ')})`);
  const avantDonjon = solsDemandes.slice();

  /* ================== 1. L'OUVREUR MEURT ==================
   * Meme chemin que donjon_page.test.js : on le pose vers le centre, a portee
   * de lame, avec un point de vie, et on TIRE. C'est le vrai serveur qui
   * l'abat et qui ouvre la porte — la poser a la main aurait saute l'annonce,
   * et l'essai aurait mesure sa propre triche. */
  console.log('\n-- ' + OUVREUR + ' meurt, la porte du Sanctuaire s\'ouvre --');
  const pose = await new Promise((res) => {
    const j = monde0.joueurs.get(addr);
    if (!j) return res({ err: 'pas de joueur cote serveur' });
    /* On degage les alentours : le personnage est de niveau 1 et l'anneau est
       peuple. Ce qu'on mesure ici est un SOL, pas la survie d'un debutant. */
    monde0.monstres = monde0.monstres.filter((m) => {
      const dx = m.x - j.x, dy = m.y - j.y;
      return dx * dx + dy * dy > 1100 * 1100;
    });
    const dx = M.CENTRE.x - j.x, dy = M.CENTRE.y - j.y;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const ux = horizontal ? Math.sign(dx) : 0;
    const uy = horizontal ? 0 : Math.sign(dy);
    const D = 280;
    const t = M.MONSTRES[OUVREUR];
    const m = { id: monde0._nouvelId(), espece: OUVREUR, biome: (t.biomes || ['terre'])[0],
                x: j.x + ux * D, y: j.y + uy * D,
                ancreX: j.x + ux * D, ancreY: j.y + uy * D,
                pv: 1, pvMax: t.pv, dir: 'down', cible: null,
                recharge: 0, rechargeT: 0, stase: 0, errX: 0, errY: 0, errChrono: 0 };
    monde0.monstres.push(m);
    res({ joueur: { x: j.x, y: j.y }, angle: Math.atan2(uy, ux) });
  });
  ok(!pose.err, `${OUVREUR} est pose a portee de lame` + (pose.err ? ' — ' + pose.err : ''));

  for (let tour = 0; tour < 40 && !monde0.portails.length; tour++) {
    await p.evaluate((c) => {
      window.__s[0].send(JSON.stringify({ type: 'realmTir', a: c.angle,
                          x: Math.round(c.joueur.x), y: Math.round(c.joueur.y) }));
    }, pose);
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(400);

  const vivant = await p.evaluate(() => {
    const v = document.getElementById('nxMortVoile');
    return { mort: !!(v && v.classList.contains('on')),
             msg: window.__s[0].__m.filter((m) => m.type === 'realmMort').length };
  });
  ok(!vivant.mort && !vivant.msg, 'le personnage a survecu au combat');
  const porte = monde0.portails.length ? { ...monde0.portails[0] } : null;
  ok(!!porte, 'une porte s\'est ouverte cote serveur');
  ok(porte && porte.donjon === CLE, `et elle ouvre le Sanctuaire (${porte && porte.donjon})`);

  /* ================== 2. ON Y ENTRE, A PIED ================== */
  console.log('\n-- on entre --');
  await p.evaluate(() => { const c = document.querySelector('canvas'); if (c) c.focus(); });
  const versLaPorte = async (ou, tours) => {
    let dernier = null, detour = 0, sens = 1;
    for (let i = 0; i < tours; i++) {
      const vu = await p.evaluate(() => {
        const e = document.getElementById('nxPorte');
        return !!(e && !e.hidden);
      });
      if (vu) return i;
      const j = ou.realm.joueurs.get(addr);
      if (!j) return 0;
      const cible = ou.cible();
      if (!cible) return 0;
      const dx = cible.x - j.x, dy = cible.y - j.y;
      const bloque = dernier !== null &&
                     Math.abs(dernier.x - j.x) < 2 && Math.abs(dernier.y - j.y) < 2;
      dernier = { x: j.x, y: j.y };
      if (bloque && detour <= 0) { detour = 5; sens = -sens; }
      const horizontal = detour > 0 ? Math.abs(dx) <= Math.abs(dy)
                                    : Math.abs(dx) > Math.abs(dy);
      let t;
      if (detour > 0) {
        detour--;
        t = horizontal ? (sens > 0 ? 'ArrowRight' : 'ArrowLeft')
                       : (sens > 0 ? 'ArrowDown' : 'ArrowUp');
      } else {
        t = horizontal ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft')
                       : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
      }
      await p.keyboard.down(t);
      await p.waitForTimeout(140);
      await p.keyboard.up(t);
      await p.waitForTimeout(90);
    }
    return 0;
  };
  const pas = await versLaPorte({ realm: monde0, cible: () => porte }, 140);
  ok(pas > 0, `on marche jusqu'a la porte (${pas} pas)`);
  await p.click('#nxPorteBtn', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(2500);

  const dedans = await p.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
    return { donjon: e && e.donjon,
             tuiles: (e && e.tuiles) || null,
             tuile: (e && e.monde && e.monde.tuile) || 0,
             anneaux: (e && e.anneaux) || [],
             sortie: (e && e.sortie) || null };
  });
  ok(dedans.donjon === CLE, `on est dans le Sanctuaire (${dedans.donjon})`);
  ok(dedans.tuiles && dedans.tuiles.length > 300,
     `le sol arrive tuile par tuile (${dedans.tuiles ? dedans.tuiles.length : 0})`);
  /* Le biome que la page va lire pour choisir sa texture : celui de l'anneau
     unique du donjon. On le RELIT du message plutot que de le supposer. */
  const biome = dedans.anneaux.length ? dedans.anneaux[dedans.anneaux.length - 1].biome : null;
  ok(biome === SOL, `l'anneau du donjon porte le sol du Sanctuaire (« ${biome} »)`);
  /* ---- ET SON SOL EST DEMANDE A L'ENTREE, PAS AU PREMIER DESSIN ----
   * C'est LA le defaut que le joueur a signale deux fois. Il ne se voit pas en
   * regardant l'ecran cinq secondes plus tard — a ce moment-la tout est
   * arrive. Il se voit dans l'ORDRE : la texture du donjon doit partir avec
   * l'entree, seule, et pas derriere six sols de biomes qu'on ne dessinera
   * jamais ici. */
  const nouveaux = solsDemandes.filter((f) => avantDonjon.indexOf(f) < 0);
  ok(nouveaux.length === 1,
     `entrer ne declenche qu'UNE nouvelle texture de sol (${nouveaux.join(', ') || 'aucune'})`);
  ok(nouveaux[0] === 'ground_' + SOL,
     `et c'est celle du Sanctuaire, pas une autre (${nouveaux[0]})`);
  /* Le total, pour que le gachis se lise d'un coup d'oeil dans six mois. */
  ok(solsDemandes.length <= attendus.length + 2,
     `au total ${solsDemandes.length} textures pour deux mondes — ${attendus.length} anneaux, la dalle, et le donjon (${solsDemandes.join(', ')})`);

  /* ================== 3. ET LE SOL SE VOIT ==================
   *
   * Le coeur de l'essai. On laisse la scene se poser — les textures arrivent
   * par le reseau — puis on lit les PIXELS. */
  console.log('\n-- le sol sous les pieds --');
  await p.waitForTimeout(2500);

  const j2 = donjon0 && donjon0.joueurs.get(addr);
  ok(!!j2, 'la simulation du donjon tourne et connait le personnage');
  const vue = await p.evaluate((arg) => {
    const cv = document.getElementById('nxCanvas');
    const T = window.__T;
    if (!cv || !T) return { err: 'pas de canvas ou pas de matrice' };
    const c2 = cv.getContext('2d');
    const TM = arg.tuile;
    const sol = new Set(arg.tuiles.map((t) => t[0] + ',' + t[1]));
    const tc = Math.floor(arg.moi.x / TM), tr = Math.floor(arg.moi.y / TM);
    if (!sol.has(tc + ',' + tr)) return { err: 'le personnage n\'est pas sur une tuile de sol' };

    /* ---- CE QU'ON DECOUPE DU CHAMP DE MESURE ----
     * Le personnage : sa planche fait 150 unites, posee de (x-75, y-130) a
     * (x+75, y+20), et ses deux jauges tiennent juste dessous. On retire un
     * cadre plus large que les deux.
     * La porte de retour : elle est au centre du sas et se dessine debout,
     * halo compris. Elle est le SEUL autre objet du sas — le Sanctuaire
     * n'a aucune espece d'accompagnement et son decor n'est pose que dans la
     * salle du fond.
     * Ce qui reste est du sol, et rien d'autre. */
    const cache = [
      { x0: arg.moi.x - 96, x1: arg.moi.x + 96, y0: arg.moi.y - 160, y1: arg.moi.y + 48 },
    ];
    if (arg.sortie) cache.push({ x0: arg.sortie.x - 160, x1: arg.sortie.x + 160,
                                 y0: arg.sortie.y - 260, y1: arg.sortie.y + 100 });

    const px = (wx) => T.a * wx + T.e, py = (wy) => T.d * wy + T.f;
    /* Un pas de mesure en unites de MONDE, converti ensuite : ecrit en pixels,
       il aurait echantillonne plus ou moins finement selon le zoom. */
    const PAS = 8;
    let total = 0, bleus = 0, cases = 0;
    const CIBLE = [0x0A, 0x11, 0x28];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = tc + dc, l = tr + dr;
        if (!sol.has(c + ',' + l)) continue;
        let compte = 0;
        for (let wy = l * TM + 4; wy < (l + 1) * TM; wy += PAS) {
          for (let wx = c * TM + 4; wx < (c + 1) * TM; wx += PAS) {
            if (cache.some((k) => wx >= k.x0 && wx <= k.x1 && wy >= k.y0 && wy <= k.y1)) continue;
            const X = Math.round(px(wx)), Y = Math.round(py(wy));
            if (X < 0 || Y < 0 || X >= cv.width || Y >= cv.height) continue;
            const d = c2.getImageData(X, Y, 1, 1).data;
            total++; compte++;
            const ecart = Math.abs(d[0] - CIBLE[0]) + Math.abs(d[1] - CIBLE[1]) + Math.abs(d[2] - CIBLE[2]);
            if (ecart <= 12) bleus++;
          }
        }
        if (compte) cases++;
      }
    }
    return { total, bleus, cases, w: cv.width, h: cv.height };
  }, { tuile: dedans.tuile, tuiles: dedans.tuiles, sortie: dedans.sortie,
       moi: j2 ? { x: j2.x, y: j2.y } : { x: 0, y: 0 } });

  ok(!vue.err, 'les pixels du sol sont lisibles' + (vue.err ? ' — ' + vue.err : ''));
  ok(!vue.err && vue.total > 400,
     `on regarde ${vue.total} points sur ${vue.cases} tuiles de sol autour du personnage`);
  const part = vue.total ? vue.bleus / vue.total : 1;
  ok(vue.total > 0 && part < 0.02,
     `le sol est peint : ${(part * 100).toFixed(1)}% des points sont au fond bleu ` +
     `(${vue.bleus} sur ${vue.total})`);

  /* ---- ET LE DIAGNOSTIC, POUR QUE L'ECHEC DISE POURQUOI ----
   * Un sol bleu a deux causes possibles, et elles ne se corrigent pas au meme
   * endroit : la page n'a pas DEMANDE la bonne image, ou elle l'a demandee et
   * ne l'a pas POSEE. On imprime les deux. */
  const demandes = servis.concat(manquants).filter((u) => /\/ground_[^/]+\.webp$/.test(u))
                         .map((u) => u.split('/').pop());
  console.log('  (sols demandes par la page : ' + [...new Set(demandes)].join(', ') + ')');
  const poses = await p.evaluate(() => {
    const v = window.__peint.filter((o) => o.ecran && /^ground_/.test(o.src));
    const t = {};
    v.forEach((o) => { t[o.src] = (t[o.src] || 0) + 1; });
    return t;
  });
  console.log('  (sols poses a l\'ecran : ' + (Object.keys(poses).length
    ? Object.keys(poses).map((k) => k + ' x' + poses[k]).join(', ') : 'aucun') + ')');

  const perdus = manquants.filter((u) => /\.webp$/.test(u));
  ok(perdus.length === 0, 'aucune image demandee n\'est absente' +
     (perdus.length ? ' — ' + perdus.slice(0, 6).join(', ') : ''));
  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nsanctuaire_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
