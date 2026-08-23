/* SWOGE TOWER : LA PORTE, LES CINQ ETAGES, ET LE CHEMIN DU RETOUR.
 *
 * ---- CE QUI ETAIT CASSE ----
 *
 * La ville avait quatorze pates de maisons et quatre facades, dont une TOUR.
 * On en faisait le tour. On n'entrait pas. Une facade etait un obstacle avec
 * un joli dessin dessus — exactement ce qu'un batiment ne doit pas etre.
 *
 * ---- CE QU'ON MESURE, ET POURQUOI CHACUN ----
 *
 * 1. LA PORTE VIENT DU PLAN, ET ELLE OUVRE. Le serveur la derive du bloc qui
 *    porte la facade ; on se pose dessus et l'on doit se retrouver DEDANS. Si
 *    la page ignorait la porte, rien ne planterait : on pousserait le batiment
 *    et il ne se passerait rien. C'est la panne la plus muette du lot.
 * 2. LE PREMIER ETAGE EST PEINT, ET ETALE SUR LE CARRE DE LA SALLE. Une
 *    planche posee a la mauvaise taille ne leve aucune erreur — elle a
 *    seulement l'air de travers.
 * 3. LE RECTANGLE PRATICABLE EST CELUI DE LA TABLE. On marche jusqu'aux quatre
 *    bords et l'on regarde OU le personnage s'arrete. Aucun chiffre n'est
 *    ecrit ici : la table est relue dans nexus.js. Un rectangle qui ne serait
 *    pas applique laisserait sortir de la piece, et l'on marcherait dans le
 *    noir autour du dessin.
 * 4. L'ASCENSEUR EST UNE TABLE. Le panneau doit porter un bouton par etage
 *    DECLARE, plus la rue. Cinq boutons ecrits a la main auraient ete cinq
 *    occasions d'en oublier un — et l'oublie aurait ete le cinquieme, le toit.
 * 5. L'ASCENSEUR EMMENE VRAIMENT, ET L'ESCALIER DESCEND D'UN CRAN. On regarde
 *    la planche PEINTE, pas une variable : c'est ce que le joueur voit.
 * 6. DEPUIS L'ETAGE 1, L'ESCALIER REND LA RUE — devant la porte qu'on a
 *    poussee, et pas au point d'arrivee de la ville ni dans le Nexus.
 * 7. ON N'A PAS QUITTE LA SIMULATION. Entrer dans un batiment n'est pas
 *    changer de monde : le serveur doit toujours nous compter dans la ville.
 *
 * Comme partout ici : on ne lit aucune variable de la page — elles vivent dans
 * une fermeture. On enregistre ce qui est PEINT, et on relit les tables dans
 * le fichier qui les applique.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('tour_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('tour_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const pres = (a, b, e, m) => ok(Math.abs(a - b) <= e, m + ` [${Math.round(a)} vs ${Math.round(b)} ± ${e}]`);

/* ---- LES TABLES DE LA PAGE, RELUES DANS LA PAGE ----
 *
 * Recopier ici les cinq etages et leurs quatre bords aurait fait de cet essai
 * une deuxieme verite : il aurait valide le rectangle d'hier, et le jour ou
 * une planche est redessinee il aurait exige l'ancien. On relit donc la table
 * DANS le fichier qui l'applique. Si la table disparait, on le DIT et l'on
 * echoue — un essai qui ne trouve pas ce qu'il mesure ne doit pas repondre
 * « tout va bien » dans le vide.
 */
const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
function tableDesEtages() {
  const bloc = /var ETAGES = \[([\s\S]*?)\n  \];/.exec(src);
  if (!bloc) return null;
  const l = [...bloc[1].matchAll(
    /cle:\s*'([^']+)',\s*nom:\s*'([^']+)',\s*src:\s*'([^']+)',\s*x0:\s*([\d.]+),\s*x1:\s*([\d.]+),\s*y0:\s*([\d.]+),\s*y1:\s*([\d.]+)/g)]
    .map((m) => ({ cle: m[1], nom: m[2], src: m[3],
                   x0: +m[4], x1: +m[5], y0: +m[6], y1: +m[7] }));
  return l.length ? l : null;
}
function coteDeLaTour() {
  const m = /var TOUR_COTE = (\d+);/.exec(src);
  return m ? Number(m[1]) : null;
}
const ETAGES = tableDesEtages();
const COTE = coteDeLaTour();

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
  console.log('-- ce que la page declare --');
  ok(!!ETAGES,
     ETAGES ? `${ETAGES.length} etages relus dans nexus.js : ${ETAGES.map((e) => e.cle).join(', ')}`
            : 'la table des etages est introuvable dans nexus.js — cet essai ne mesure RIEN');
  if (!ETAGES || !COTE) {
    console.log('\ntour_page.test.js — impossible de relire les tables, on echoue plutot que de repondre a vide');
    process.exit(1);
  }
  ok(COTE > 0, `la salle est etalee sur ${COTE} unites de cote`);
  /* Un plancher : sans lui, toutes les boucles qui suivent ne feraient aucun
     tour et « tous les etages sont bons » voudrait dire « je n'en ai vu
     aucun ». */
  ok(ETAGES.length >= 5, `au moins cinq etages declares (${ETAGES.length})`);
  ok(ETAGES.every((e) => e.x1 > e.x0 && e.y1 > e.y0 && e.x1 <= 1 && e.y1 <= 1),
     'et chaque rectangle praticable est un rectangle, dans la planche');

  process.env.DATA_DIR = fs.mkdtempSync('/tmp/tourpage-');
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
     ouverts. On designe ensuite la bonne par SON OCCUPANT — plusieurs mondes
     tournent, et « le dernier qui a battu » en designerait un au hasard. */
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
    const D = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img) {
      const nb = arguments.length;
      if (nb === 9 || nb === 5) {
        const s = (img && (img.currentSrc || img.src)) || '';
        const bouts = String(s).split('?')[0].split('/');
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

  console.log('\n-- on entre dans SWOGE +18 --');
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin', monde: 'plus18' })));
  await p.waitForTimeout(1800);
  const entre = await p.evaluate(() => {
    const m = window.__s[0].__m.filter((x) => x.type === 'realmEntre').pop();
    return m ? { portes: m.portes || null, carte: m.carte } : null;
  });
  ok(!!entre && entre.carte === 'plus18', 'la page est bien dans la ville');
  ok(!!(entre && entre.portes && entre.portes.length),
     `le plan lui a envoye ${(entre && entre.portes || []).length} porte(s) de batiment`);
  const porte = entre && entre.portes && entre.portes.find((q) => q.salle === 'tour');
  ok(!!porte, `dont une qui ouvre sur « tour » (${porte && porte.x},${porte && porte.y}, r ${porte && porte.r})`);
  if (!porte) { console.log('\ntour_page.test.js — pas de porte, rien a mesurer'); process.exit(1); }

  const addr = portefeuille.address.toLowerCase();
  const ville = [...ouverts].find((r) => r.joueurs.has(addr)) || null;
  ok(!!ville, 'la simulation de la ville est attrapee');

  /* On se pose SUR la porte. Le serveur fait autorite sur la position dans le
     monde, et la page se recale dessus : c'est exactement le chemin qu'un
     joueur prend en marchant, en moins de secondes. */
  const poseSurLaPorte = async () => {
    const j = ville.joueurs.get(addr);
    j.x = porte.x; j.y = porte.y;
    await p.waitForTimeout(1400);
  };

  /* Ce qui a ete peint depuis le dernier effacement, par fichier. */
  const compte = async () => p.evaluate(() => {
    const c = {};
    for (const d of window.__peint) c[d.src] = (c[d.src] || 0) + 1;
    return c;
  });
  const vide = async () => p.evaluate(() => { window.__peint.length = 0; });
  /* La derniere pose d'une planche donnee : son rectangle a l'ecran. */
  const derniere = async (f) => p.evaluate((cible) => {
    for (let i = window.__peint.length - 1; i >= 0; i--) {
      if (window.__peint[i].src === cible) return window.__peint[i];
    }
    return null;
  }, f);
  const nomPlanche = (e) => e.src.split('/').pop();
  const indice = async () => p.evaluate(() => {
    const i = document.getElementById('nxIndice');
    return i ? i.textContent : '';
  });

  /* ================== 1. LA PORTE OUVRE ================== */
  console.log('\n-- on pousse la porte de la tour --');
  await poseSurLaPorte();
  await vide();
  await p.waitForTimeout(600);
  let c = await compte();
  const p1 = nomPlanche(ETAGES[0]);
  ok((c[p1] || 0) > 0, `le premier etage est peint (${p1}, ${c[p1] || 0} poses)`);
  /* LE CONTRASTE : dedans, la ville ne se peint plus. Sans lui, « l'etage est
     peint » serait vrai d'une page qui poserait la planche par-dessus la rue
     sans jamais y faire entrer. */
  ok((c['ground_ville.webp'] || 0) === 0,
     `et le pave de la rue a cesse de l'etre (${c['ground_ville.webp'] || 0})`);
  const pose = await derniere(p1);
  ok(!!pose && pose.dx === 0 && pose.dy === 0 && pose.dw === COTE && pose.dh === COTE,
     `la planche est etalee sur le carre de la salle (${pose && pose.dw}x${pose && pose.dh} en ${pose && pose.dx},${pose && pose.dy})`);
  const bouton = await p.evaluate(() => {
    const e = document.getElementById('nxPorte');
    return !!(e && !e.hidden && e.offsetParent !== null);
  });
  ok(!bouton, 'le bouton de porte de donjon s\'est tu — on n\'est plus dans la rue');
  ok(ville.joueurs.has(addr),
     'et le serveur nous compte TOUJOURS dans la ville : entrer n\'est pas changer de monde');

  /* ================== 2. LE RECTANGLE PRATICABLE ================== */
  console.log('\n-- on marche jusqu aux quatre bords --');
  /* Le personnage est le seul dessin qui se pose a SA position : on lit donc
     ou il est en regardant ou il est peint. La planche du skin est posee en
     neuf arguments, centree en x et calee par les pieds — on ne compare donc
     pas des coordonnees mais des DEPLACEMENTS, ce qui suffit a prouver le
     butoir : le personnage doit cesser d'avancer, et cesser au bon endroit. */
  /* Le nom de fichier d'une pose de personnage : `<anim>_<direction>.webp`,
     et le cadre est pose centre en x, cale par les pieds a vingt unites pres.
     On relit la formule dans le fichier plutot que de la deviner — un decalage
     de vingt unites suffirait a faire croire que le butoir est mal place. */
  const CALE = Number((/var disp = 150;[\s\S]*?y - disp \+ (\d+)/.exec(src) || [])[1]);
  ok(Number.isFinite(CALE),
     Number.isFinite(CALE) ? `la pose du personnage est calee de ${CALE} unites, relu dans nexus.js`
                           : 'la pose du personnage est introuvable — la mesure des bords ne vaudrait RIEN');
  const ouEstLeJoueur = async () => p.evaluate((cale) => {
    for (let i = window.__peint.length - 1; i >= 0; i--) {
      const d = window.__peint[i];
      if (/^(idle|run|jump)_(up|down|left|right)\.webp$/.test(d.src)) {
        return { x: d.dx + d.dw / 2, y: d.dy + d.dh - cale };
      }
    }
    return null;
  }, CALE);
  const pousse = async (touche, ms) => {
    await p.keyboard.down(touche);
    await p.waitForTimeout(ms);
    await p.keyboard.up(touche);
    await p.waitForTimeout(150);
  };
  /* ---- MARCHER JUSQU'A NE PLUS AVANCER ----
   * On ne compte pas les secondes : la VITESSE vient du serveur et change avec
   * le personnage, donc une duree ecrite ici aurait mesure la vitesse du
   * jour ou on l'a ecrite. On pousse, et l'on s'arrete quand la position ne
   * bouge plus — c'est la definition meme d'un butoir. Le plafond de tours
   * existe pour que l'essai FINISSE plutot que de tourner sans fin si rien
   * n'arrete jamais. */
  const colle = async (touche) => {
    await p.keyboard.down(touche);
    let avant = null, ou = null;
    for (let k = 0; k < 24; k++) {
      await p.waitForTimeout(400);
      ou = await ouEstLeJoueur();
      if (avant && ou && Math.abs(ou.x - avant.x) < 2 && Math.abs(ou.y - avant.y) < 2) break;
      avant = ou;
    }
    await p.keyboard.up(touche);
    await p.waitForTimeout(150);
    return ou;
  };
  const e1 = ETAGES[0];
  /* Deux secondes de marche font plus de cinq cents unites : de quoi traverser
     la piece dans les deux sens et rester colle au bord. */
  let ou = await ouEstLeJoueur();
  ok(!!ou, 'le personnage est peint dans la salle');
  ou = await colle('ArrowLeft');
  pres(ou.x, COTE * e1.x0, 6, `le bord gauche du premier etage arrete a x0 = ${e1.x0}`);
  ou = await colle('ArrowRight');
  pres(ou.x, COTE * e1.x1, 6, `le bord droit arrete a x1 = ${e1.x1}`);
  ou = await colle('ArrowUp');
  pres(ou.y, COTE * e1.y0, 8, `le haut arrete a y0 = ${e1.y0}`);
  ou = await colle('ArrowDown');
  pres(ou.y, COTE * e1.y1, 8, `le bas arrete a y1 = ${e1.y1}`);
  /* LE TEMOIN : le rectangle n'est pas la planche entiere. Sans lui, « ca
     s'arrete au bord » serait vrai d'une page qui ne bornerait rien du tout,
     puisque la planche fait justement mille six cents. */
  ok(e1.x0 > 0 && e1.x1 < 1 && e1.y0 > 0 && e1.y1 < 1,
     'et ce rectangle est bien plus petit que la planche — on ne marche pas dans les murs');

  /* ================== 3. L'ASCENSEUR EST UNE TABLE ================== */
  console.log('\n-- l ascenseur, et ses arrets --');
  /* On longe le mur de gauche puis on remonte : l'ascenseur est sur ce mur, et
     c'est le chemin qu'un joueur prend sans y penser. Aucune coordonnee n'est
     ecrite ici — on marche, et l'on regarde ce que le bandeau annonce. */
  const longeLeMur = async (dabord, ensuite, mot) => {
    for (const t of dabord) await colle(t);
    for (let k = 0; k < 30; k++) {
      if ((await indice()).indexOf(mot) >= 0) return true;
      await pousse(ensuite, 250);
    }
    return (await indice()).indexOf(mot) >= 0;
  };
  /* L'ascenseur est EN HAUT A GAUCHE : on se colle au mur du fond, puis on
     file vers la gauche. L'escalier est en bas a gauche, mais on l'aborde par
     le BAS — longer le mur de gauche depuis le fond ferait passer devant
     l'ascenseur, dont le panneau s'ouvrirait en chemin. Deux itineraires, et
     chacun evite l'autre point : c'est aussi ce qui prouve que les deux
     points sont distincts et qu'aucun ne masque l'autre. */
  const vaAlAscenseur = () => longeLeMur(['ArrowUp'], 'ArrowLeft', 'ELEVATOR');
  const vaALEscalier = () => longeLeMur(['ArrowDown', 'ArrowLeft'], 'ArrowUp', 'STAIRS');
  ok(await vaAlAscenseur(), `en longeant le mur de gauche on tombe sur l'ascenseur (« ${(await indice()).slice(0, 60)} »)`);
  const arrets = await p.evaluate(() => {
    const v = document.getElementById('nxTourVoile');
    if (!v || !v.classList.contains('on')) return null;
    return Array.prototype.map.call(v.querySelectorAll('[data-etage]'),
      (b) => ({ i: Number(b.getAttribute('data-etage')), nom: b.textContent.trim() }));
  });
  ok(!!arrets, 'le panneau de l\'ascenseur s\'est ouvert');
  ok(!!arrets && arrets.length === ETAGES.length + 1,
     `il porte un bouton par etage DECLARE, plus la rue (${arrets && arrets.length} pour ${ETAGES.length} etages)`);
  const manque = ETAGES.filter((e) => !(arrets || []).some((a) => a.nom === e.nom));
  ok(manque.length === 0,
     'et chaque etage de la table a son bouton'
     + (manque.length ? ` — absents : ${manque.map((e) => e.cle).join(', ')}` : ''));
  ok((arrets || []).some((a) => a.i === -1),
     'plus l\'arret « rue », qui est un arret comme les autres');

  /* ================== 4. IL EMMENE VRAIMENT ================== */
  console.log('\n-- et il emmene la ou il dit --');
  const dernier = ETAGES.length - 1;
  await vide();
  await p.evaluate((i) => {
    document.querySelector('#nxTourVoile [data-etage="' + i + '"]').click();
  }, dernier);
  await p.waitForTimeout(900);
  c = await compte();
  const pToit = nomPlanche(ETAGES[dernier]);
  ok((c[pToit] || 0) > 0, `le dernier etage est peint (${pToit}, ${c[pToit] || 0} poses)`);
  ok((c[p1] || 0) === 0,
     `et le premier a cesse de l'etre (${c[p1] || 0}) — on a change d'etage, pas superpose deux planches`);
  const nomCarte = await p.evaluate(() => {
    const m = document.getElementById('nxMini');
    return m ? m.getContext('2d') && 'ok' : null;
  });
  ok(nomCarte === 'ok', 'la mini-carte tient toujours debout dans la salle');
  /* Et le rectangle a suivi l'etage : c'est la table qui le porte, pas la
     salle. Le toit n'a pas la meme largeur que le premier — sans ce controle,
     changer d'etage aurait garde le rectangle du rez-de-chaussee, et l'on
     marcherait dans le vide du toit sans que rien ne plante. */
  const eD = ETAGES[dernier];
  ou = await colle('ArrowRight');
  pres(ou.x, COTE * eD.x1, 6, `le bord droit du dernier etage est le sien (x1 = ${eD.x1})`);
  ok(eD.x1 !== e1.x1,
     `et il differe de celui du premier (${eD.x1} contre ${e1.x1}) — le rectangle vient bien de la table`);

  /* ================== 5. L'ESCALIER DESCEND D'UN CRAN ================== */
  console.log('\n-- l escalier descend d un cran --');
  await vide();
  ok(await vaALEscalier(), `on tombe sur l'escalier en longeant le mur (« ${(await indice()).slice(0, 60)} »)`);
  await p.waitForTimeout(600);
  c = await compte();
  const pAvant = nomPlanche(ETAGES[dernier - 1]);
  ok((c[pAvant] || 0) > 0,
     `on est a l'etage juste en dessous (${pAvant}, ${c[pAvant] || 0} poses)`);
  /* LE CONTRASTE : d'UN cran, pas de tous. Sans lui, « on descend » serait
     vrai d'un escalier qui ramenerait toujours au rez-de-chaussee. */
  await vide();
  await p.waitForTimeout(400);
  c = await compte();
  ok((c[p1] || 0) === 0,
     `et pas au rez-de-chaussee d'un coup (${c[p1] || 0} pose de ${p1})`);

  /* ================== 6. ET DU BAS, ON SORT DANS LA RUE ================== */
  console.log('\n-- depuis le premier etage, l escalier rend la rue --');
  /* On redescend jusqu'en bas par le meme escalier : c'est le chemin, et le
     faire vraiment prouve du meme coup que chaque cran fonctionne. */
  for (let k = dernier - 1; k > 0; k--) {
    await vaALEscalier();
    await p.waitForTimeout(400);
  }
  await vide();
  await p.waitForTimeout(500);
  c = await compte();
  ok((c[p1] || 0) > 0, `on est revenu au premier etage (${c[p1] || 0} poses)`);
  await vaALEscalier();
  await p.waitForTimeout(700);
  await vide();
  await p.waitForTimeout(600);
  c = await compte();
  ok((c['ground_ville.webp'] || 0) > 0,
     `la rue est de nouveau peinte (${c['ground_ville.webp'] || 0} tuiles)`);
  ok((c[p1] || 0) === 0, `et la tour ne l'est plus (${c[p1] || 0})`);
  /* ---- ET ON RESSORT DEVANT LA PORTE ----
   * Pas au point d'arrivee de la ville, pas dans le Nexus. On le mesure sur le
   * serveur : c'est LUI qui recoit notre position, et c'est donc lui qui dit
   * ou nous sommes vraiment. */
  await p.waitForTimeout(900);
  const j = ville.joueurs.get(addr);
  ok(!!j, 'le serveur nous compte toujours dans la ville — on n\'est pas rentre au Nexus');
  const d = j ? Math.hypot(j.x - porte.x, j.y - porte.y) : Infinity;
  ok(d < porte.r * 4,
     `on ressort a ${Math.round(d)} unites de la porte qu'on avait poussee (rayon ${porte.r})`);
  ok(d > porte.r,
     'et HORS de son rayon — sinon on rentrerait a l\'image suivante');

  console.log('\n-- les images et les erreurs --');
  const perdus = [...new Set(manquants)];
  ok(perdus.length === 0, `aucun fichier demande n'est introuvable${perdus.length ? ' : ' + perdus.join(', ') : ''}`);
  ok(erreurs.length === 0, `aucune erreur de page${erreurs.length ? ' : ' + erreurs[0] : ''}`);

  await nav.close(); site.stop();
  console.log(`\ntour_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
