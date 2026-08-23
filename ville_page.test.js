/* LA VILLE DE SWOGE +18, VUE DE LA PAGE.
 *
 * ---- CE QUI ETAIT CASSE ----
 *
 * La porte +18 menait a une simulation a part posee sur la geographie du MONDE
 * OUVERT : on y entrait « dans un monde avec du combat », memes monstres,
 * memes rochers. Le serveur lui donne maintenant un plan — des rues, des pates
 * de maisons, personne dedans. Reste a savoir si la PAGE le montre.
 *
 * ---- CE QU'ON MESURE, ET POURQUOI CHACUN ----
 *
 * 1. LE SOL DE LA VILLE EST DEMANDE ET PEINT. Une planche de sol qui manque ne
 *    laisse pas un carre vide : `drawImage` leve sur une image cassee, et la
 *    boucle de dessin s'arrete. C'est la panne la plus chere possible.
 * 2. LA VILLE A UN BORD. Comme un donjon : la roche remplit ce qui n'est pas
 *    une rue. Sans elle, les pates de maisons flotteraient sur un sol infini
 *    et rien n'enfermerait rien.
 * 3. LES FACADES SONT POSEES AUX COORDONNEES DE LEURS BLOCS. C'est le point
 *    qui compte : une facade decalee d'une tuile, et l'on bute sur du vide
 *    devant elle en traversant son dessin trois pas plus loin. On ne regarde
 *    donc pas « une image a ete peinte » — on compare le rectangle peint a
 *    celui qu'on calcule depuis le bloc du serveur et la planche mesuree.
 * 4. LA HAUTEUR SUIT LA PLANCHE. Le serveur n'envoie que la largeur ; une
 *    image etiree ne leve aucune erreur, elle a seulement l'air moins bien.
 * 5. CE QUI BOUGE BOUGE. Les planches animees doivent changer de case.
 * 6. ON N'EST PAS DANS UN DONJON. Pas de bouton EXIT, pas de « you are deep
 *    in the… » : la ville est un monde ouvert, on la quitte comme la plaine.
 * 7. PERSONNE. Aucune creature peinte — c'est la plainte d'origine.
 *
 * Comme partout ici : on ne lit aucune variable de la page — elles vivent dans
 * une fermeture. On enregistre ce qui est PEINT et ce qui est DEMANDE.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('ville_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('ville_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const manquants = [], servis = [];
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/villepage-');
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
  /* Les simulations qui BATTENT DEJA a la fin du demarrage sont les mondes
     ouverts : un donjon n'existe qu'a partir de la porte franchie. On designe
     ensuite la bonne par SON OCCUPANT — plusieurs mondes tournent, et « le
     dernier qui a battu » en designerait un au hasard. */
  const { Realm } = require(path.join(SERVEUR, 'realm'));
  const ouverts = new Set();
  let demarrageFini = false;
  const pas0 = Realm.prototype.pas;
  Realm.prototype.pas = function (dt) {
    if (!demarrageFini) ouverts.add(this);
    return pas0.call(this, dt);
  };

  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const { tailleWebp } = require(path.join(SITE, 'taille_image.js'));
  await new Promise((r) => setTimeout(r, 1500));
  demarrageFini = true;
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
      window.__s.push(s); return s;
    }
    C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
    window.WebSocket = C;
    window.__image = 0;
    (function compte() { window.__image++; requestAnimationFrame(compte); })();
    window.__peint = [];
    /* NEUF arguments pour ce qui se decoupe dans une planche, CINQ pour ce qui
       se pose en entier — les tuiles de sol. N'en espionner qu'une faisait dire
       que le sol n'etait jamais peint ; il l'etait, on ne le regardait pas. */
    const D = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img) {
      const nb = arguments.length;
      if (nb === 9 || nb === 5) {
        const src = (img && (img.currentSrc || img.src)) || '';
        const bouts = String(src).split('?')[0].split('/');
        window.__peint.push({ src: bouts[bouts.length - 1],
                              sx: nb === 9 ? arguments[1] : 0,
                              dx: arguments[nb === 9 ? 5 : 1], dy: arguments[nb === 9 ? 6 : 2],
                              dw: arguments[nb === 9 ? 7 : 3], dh: arguments[nb === 9 ? 8 : 4],
                              f: window.__image });
        if (window.__peint.length > 60000) window.__peint.splice(0, 30000);
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

  /* ---- ON ENTRE PAR LA PORTE +18, EN LA NOMMANT ----
   * C'est ce que la borne du hall envoie. La nommer ici n'est pas tricher :
   * l'essai du hall verifie de son cote que la borne porte bien cette cle. */
  console.log('\n-- on entre dans SWOGE +18 --');
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin', monde: 'plus18' })));
  await p.waitForTimeout(1800);

  const entre = await p.evaluate(() => {
    const m = window.__s[0].__m.filter((x) => x.type === 'realmEntre').pop();
    if (!m) return null;
    return { carte: m.carte, donjon: m.donjon, sortie: m.sortie || null,
             tuiles: (m.tuiles || []).length, sol: (m.anneaux || [])[0],
             monstres: 0, moi: m.moi,
             blocs: (m.obstacles || []).length,
             facades: (m.obstacles || []).filter((o) => o.bat) };
  });
  ok(!!entre, 'la page recoit son message d\'entree');
  ok(entre && entre.carte === 'plus18', `et il annonce la carte « ${entre && entre.carte} »`);
  ok(entre && entre.tuiles > 0, `la ville envoie sa forme (${entre && entre.tuiles} tuiles de rue)`);
  ok(entre && entre.donjon === null,
     `elle ne se dit PAS donjon (donjon = ${JSON.stringify(entre && entre.donjon)})`);
  ok(entre && !entre.sortie, 'et n\'annonce aucune porte de retour');
  ok(entre && entre.facades.length > 0, `${entre && entre.facades.length} facades arrivent avec les blocs`);

  const addr = portefeuille.address.toLowerCase();
  const ville0 = [...ouverts].find((r) => r.joueurs.has(addr)) || null;
  ok(!!ville0, 'la simulation de la ville est attrapee');
  ok(!!(ville0 && ville0.plan), 'et elle tourne bien SUR UN PLAN');

  /* ================== 1. LE SOL, ET LE BORD ================== */
  console.log('\n-- le sol de la ville, et son bord --');
  const solNom = entre.sol && entre.sol.biome;
  ok(servis.some((u) => u.indexOf('ground_' + solNom + '.webp') >= 0),
     `la page a demande img/nexus/tiles/ground_${solNom}.webp`);
  /* LE TEMOIN A L'ENVERS : les sols du monde ouvert ne doivent PAS partir. Un
     essai qui verifie seulement « le bon sol est demande » passerait aussi sur
     une page qui demande les sept. */
  ok(!servis.some((u) => u.indexOf('ground_lava.webp') >= 0),
     'et pas ceux des anneaux du monde ouvert — on ne telecharge que ce qu\'on pose');

  const compte = await p.evaluate(() => {
    const c = {};
    for (const d of window.__peint) c[d.src] = (c[d.src] || 0) + 1;
    return c;
  });
  ok((compte['ground_' + solNom + '.webp'] || 0) > 20,
     `le pave de la ville est peint (${compte['ground_' + solNom + '.webp'] || 0} tuiles)`);
  ok((compte['mur_donjon.webp'] || 0) > 0,
     `et la roche remplit ce qui n'est pas une rue (${compte['mur_donjon.webp'] || 0} poses)`);

  /* ================== 2. LES FACADES, AU BON ENDROIT ================== */
  console.log('\n-- chaque facade est posee sur SON bloc --');
  /* On se place devant chaque facade a tour de role : la page ne dessine que
     ce qui est a portee, et un essai qui reste a l'arrivee ne verrait qu'une
     partie de la ville. */
  const tailles = {};
  const bilans = [];
  for (const f of entre.facades) {
    if (!tailles[f.bat]) {
      tailles[f.bat] = tailleWebp(path.join(SITE, 'img/nexus/tiles', 'obj_' + f.bat + '.webp'));
    }
    const t = tailles[f.bat];
    if (!t) { bilans.push({ bat: f.bat, err: 'planche illisible' }); continue; }
    const cw = t.w / Math.max(1, f.cadres || 1);
    const L = f.larg, H = L * t.h / cw;
    /* Le rectangle qu'on ATTEND : centre sur le bloc, pose sur ses pieds. */
    const attendu = { dx: f.x - L / 2, dy: f.y + f.r - H, dw: L, dh: H };
    /* On pose le joueur dans la rue, un pas au sud du bloc. */
    await p.evaluate(() => { window.__peint.length = 0; });
    const j = ville0.joueurs.get(addr);
    if (j) { j.x = f.x; j.y = f.y + 190; }
    await p.waitForTimeout(700);
    const releve = await p.evaluate((c) => {
      var vus = [], derriere = 0;
      for (var i = 0; i < window.__peint.length; i++) {
        var d = window.__peint[i];
        if (d.src === c.cible) vus.push({ dx: d.dx, dy: d.dy, dw: d.dw, dh: d.dh, sx: d.sx, i: i, f: d.f });
      }
      /* ---- ET DANS QUEL ORDRE ----
       * Les blocs de pierre du MEME rang que la facade sont a la meme hauteur
       * exacte : si l'un d'eux est peint APRES elle, il lui passe devant et lui
       * coupe le bas. On compte donc, image par image, les pierres de ce
       * rang-la posees apres la facade. Zero, ou le batiment est enfonce dans
       * un mur — et rien ne planterait pour le dire. */
      for (var k = 0; k < vus.length; k++) {
        var v = vus[k];
        for (var j2 = v.i + 1; j2 < window.__peint.length; j2++) {
          var w = window.__peint[j2];
          if (w.f !== v.f) break;
          if (w.src !== 'mur_donjon.webp') continue;
          if (Math.abs(w.dy - (v.dy + v.dh - 128)) > 1) continue;
          if (w.dx + w.dw < v.dx || w.dx > v.dx + v.dw) continue;
          derriere++;
        }
      }
      return { vus: vus, derriere: derriere };
    }, { cible: 'obj_' + f.bat + '.webp' });
    const vus = releve.vus;
    const colle = vus.find((v) => Math.abs(v.dx - attendu.dx) < 1.5
                               && Math.abs(v.dy - attendu.dy) < 1.5
                               && Math.abs(v.dw - attendu.dw) < 1.5
                               && Math.abs(v.dh - attendu.dh) < 1.5);
    bilans.push({ bat: f.bat, x: f.x, y: f.y, poses: vus.length, colle: !!colle,
                  couverte: releve.derriere,
                  cases: new Set(vus.map((v) => v.sx)).size,
                  attendu, vu: vus[0] || null });
  }
  const peintes = bilans.filter((b) => b.poses > 0);
  const posees = bilans.filter((b) => b.colle);
  ok(peintes.length === bilans.length,
     `les ${bilans.length} facades sont dessinees`
     + (peintes.length === bilans.length ? ''
        : ' — muettes : ' + bilans.filter((b) => !b.poses).map((b) => b.bat + '@' + b.x + ',' + b.y).join(' / ')));
  ok(posees.length === bilans.length,
     `et chacune AU RECTANGLE de son bloc (${posees.length} sur ${bilans.length})`
     + (posees.length === bilans.length ? ''
        : ' — decalees : ' + JSON.stringify(bilans.filter((b) => !b.colle).slice(0, 2))));

  const couvertes = bilans.filter((b) => b.couverte > 0);
  ok(couvertes.length === 0,
     'aucune n\'est recouverte par les pierres de son propre rang'
     + (couvertes.length ? ' — ' + couvertes.map((b) => b.bat + ' (' + b.couverte + ' blocs devant)').join(' / ') : ''));

  /* La hauteur suit la planche, et non un nombre envoye par le serveur. Le
     contraste : deux planches de rapports differents doivent donner deux
     rapports differents a l'ecran. Sans lui, « la hauteur est bonne » serait
     vrai d'une page qui dessine tout au carre. */
  const rapports = {};
  for (const b of posees) rapports[b.bat] = (b.attendu.dh / b.attendu.dw).toFixed(3);
  ok(Object.keys(rapports).length >= 2,
     `${Object.keys(rapports).length} planches distinctes posees : `
     + Object.keys(rapports).map((k) => k + ' ' + rapports[k]).join(', '));
  ok(new Set(Object.values(rapports)).size >= 2,
     'et elles ne sont pas toutes au meme rapport — la hauteur vient bien du fichier');

  /* ================== 3. CE QUI BOUGE BOUGE ================== */
  console.log('\n-- les planches animees tournent --');
  const animee = entre.facades.find((f) => f.cadres > 1);
  ok(!!animee, 'au moins une facade s\'annonce animee');
  if (animee) {
    await p.evaluate(() => { window.__peint.length = 0; });
    const j2 = ville0.joueurs.get(addr);
    if (j2) { j2.x = animee.x; j2.y = animee.y + 190; }
    await p.waitForTimeout(1600);
    const cases = await p.evaluate((cible) => {
      const s = new Set();
      for (const d of window.__peint) if (d.src === cible) s.add(d.sx);
      return [...s];
    }, 'obj_' + animee.bat + '.webp');
    ok(cases.length > 1,
       `« ${animee.bat} » a joue ${cases.length} images de sa bande (cases ${cases.join(', ')})`);
  }

  /* ================== 4. ON N'EST PAS DANS UN DONJON ================== */
  console.log('\n-- une ville, pas un donjon --');
  const ecran = await p.evaluate(() => {
    const e = document.getElementById('nxPorte');
    const i = document.getElementById('nxIndice') || document.querySelector('.nx-indice');
    return { porte: !!(e && !e.hidden && e.offsetParent !== null),
             indice: i ? i.textContent : '' };
  });
  ok(!ecran.porte, 'aucun bouton de porte a l\'ecran — il n\'y a rien a quitter par une porte');
  ok(ecran.indice.indexOf('deep in') < 0,
     `la ligne d'accueil ne parle pas d'un dedans (« ${ecran.indice.slice(0, 90)} »)`);
  ok(/\+18/.test(ecran.indice),
     `et elle nomme la carte ou l'on est (« ${ecran.indice.slice(0, 90)} »)`);

  /* ================== 5. PERSONNE ================== */
  console.log('\n-- et personne dedans --');
  const etat = await p.evaluate(() => {
    const m = window.__s[0].__m.filter((x) => x.type === 'realmEtat').pop();
    return { monstres: (m && m.monstres || []).length, tours: window.__s[0].__m.filter((x) => x.type === 'realmEtat').length };
  });
  ok(etat.tours > 5, `${etat.tours} instantanes recus — la simulation tourne vraiment`);
  ok(etat.monstres === 0, `et aucun n'annonce la moindre creature (${etat.monstres})`);
  ok(ville0 && ville0.monstres.length === 0,
     `la simulation elle-meme n'en porte aucune (${ville0 ? ville0.monstres.length : '?'})`);

  console.log('\n-- les images --');
  const perdus = [...new Set(manquants)];
  ok(perdus.length === 0, `aucun fichier demande n'est introuvable${perdus.length ? ' : ' + perdus.join(', ') : ''}`);
  ok(erreurs.length === 0, `aucune erreur de page${erreurs.length ? ' : ' + erreurs[0] : ''}`);

  await nav.close(); site.stop();
  console.log(`\nville_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
