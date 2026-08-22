/* LE QUATRIEME COFFRE : CELUI DES OEUFS.
 *
 * Un oeuf tombe une fois sur mille deux cents et le SAC SE PERD EN MOURANT.
 * C'est la perte la plus chere du jeu, et jusqu'ici l'oeuf n'avait qu'un seul
 * abri : le rayon des animaux, a l'autre bout du hall. Il fallait le SAVOIR.
 *
 * Ce que cet essai refuse de laisser passer :
 *
 * 1. UN COFFRE QUI OUVRE LE MENU DU VOISIN. Un quatrieme coffre qui montrerait
 *    l'inventaire des objets serait pire que pas de coffre du tout : le joueur
 *    croirait avoir trouve son rangement, y chercherait son oeuf, et
 *    conclurait qu'il l'a perdu.
 *
 * 2. UNE MOITIE INVISIBLE. Avant, le coffre ne savait rien du sac. On voyait
 *    « rien au coffre » sans voir « et un dans ton dos, qui mourra avec toi ».
 *    Les deux comptes doivent se lire sur la MEME ligne.
 *
 * 3. UNE FLECHE QUI DEPLACE UNE LIGNE SANS RIEN ENVOYER. Mesure sur le DOM
 *    seul, un panneau qui bouge sa propre ligne passe l'essai et perd l'oeuf
 *    au rechargement. On mesure donc sur le SERVEUR.
 *
 * 4. UN COFFRE QUI NE PROTEGE DE RIEN. Toute la raison d'etre du geste est que
 *    le coffre survit a la mort et le sac non. On appelle le vrai chemin de
 *    mort du serveur et l'on regarde ce qui reste.
 *
 * 5. UN REFUS QUI NE SE VOIT PAS. « Your backpack is full » peint en flottant
 *    sur la carte est CACHE par le voile du coffre : le joueur retape le
 *    bouton et croit a une panne. Il doit se lire DANS le panneau.
 *
 * 6. UN COFFRE VIDE QUI NE DIT RIEN. Zero oeuf est l'etat de presque tout le
 *    monde : c'est la que le panneau doit expliquer d'ou vient un oeuf et ou
 *    on l'ouvre, sinon il n'aura jamais servi a personne.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('coffre_oeufs_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('coffre_oeufs_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/coffreoeufs-');
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
  /* Les especes, le nombre de cases du sac et le taux de chute viennent du
     MONDE. Ecrire « six especes », « huit cases » ou « 1,200 » ici ferait un
     essai qui continue de passer le jour ou la regle change — et qui ment
     donc exactement quand il servirait. */
  const M = require(path.join(SERVEUR, 'monde'));
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
      s.__m = []; s.__out = [];
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      /* On note aussi ce que la page ENVOIE : c'est a ca — et non a un titre
         qu'on aurait recopie — qu'on reconnait le coffre aux oeufs, puisque
         lui seul demande `familiers` en s'ouvrant. */
      const env = s.send.bind(s);
      s.send = function (d) { try { s.__out.push(JSON.parse(d)); } catch (x) {} return env(d); };
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
  const message = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(message);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [message, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);

  const q = moteur._p(w.address);
  q.skins = { andy: true }; q.skinActif = 'andy';
  /* Un personnage jamais JOUE n'a pas de fiche, et le chemin de mort ressort
     alors sans rien vider : l'essai croirait avoir prouve que le sac survit. */
  q.persos = { andy: { ef: null, ea: null, ar: null, ba: null, xc: 900 } };

  /* ================================================================
   *  LE HARNAIS : on y va a pied, comme un joueur.
   * ================================================================ */
  const marche = async (touche, ms) => {
    await p.keyboard.down(touche);
    await p.waitForTimeout(ms);
    await p.keyboard.up(touche);
    await p.waitForTimeout(250);
  };
  /* « Le coffre ne s'ouvre pas » et « on n'est jamais entre dans la salle » se
     ressemblent et se soignent autrement. On regarde donc ce que la page
     DESSINE : la salle a sa planche, la porte son image, le personnage sa
     signature. */
  const espionne = () => p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionOe) return;
    C.__espionOe = true;
    window.__salleVue = 0; window.__moi = null;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      if (u.indexOf('room_vault') >= 0) window.__salleVue++;
      /* La porte se repere a SON dessin, dans le meme repere que le
         personnage : on n'a alors ni le zoom ni la camera a refaire, et
         l'essai ne verifie pas le calcul de la page avec le meme calcul.
         MAIS on lit la DESTINATION, pas la source. La porte est devenue une
         planche de quatre images : elle se dessine alors en neuf arguments,
         dont les quatre premiers decoupent le FICHIER. Les prendre pour une
         position posait la porte a un point qui n'existe pas dans le monde,
         et l'on marchait vers lui jusqu'a epuisement des essais. */
      if (u.indexOf('obj_vault_door') >= 0) {
        const a = arguments, neuf = a.length >= 9;
        const dx = neuf ? a[5] : a[1], dy = neuf ? a[6] : a[2];
        const dw = neuf ? a[7] : a[3], dh = neuf ? a[8] : a[4];
        if (dw > 0 && dh > 0) window.__porte = { x: dx + dw / 2, y: dy + dh };
      }
      if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
          && arguments[7] === 150 && arguments[8] === 150) {
        window.__moi = { x: Math.round(arguments[5] + 75), y: Math.round(arguments[6] + 130) };
      }
      return di.apply(this, arguments);
    };
  });
  const veille = () => p.evaluate(() => {
    const v = document.getElementById('nxCoffreVoile');
    const t = v.querySelector('.nxcf-titre');
    return { on: v.classList.contains('on'), titre: t ? t.textContent.trim() : '',
             salle: window.__salleVue || 0, moi: window.__moi, porte: window.__porte };
  });
  /* Ce que le panneau MONTRE, en une seule photo. Le lire en plusieurs appels
     laisserait la page se repeindre entre deux et l'essai comparerait un
     titre d'avant a une ligne d'apres. */
  const panneau = () => p.evaluate(() => {
    const v = document.getElementById('nxCoffreVoile');
    const t = v.querySelector('.nxcf-titre');
    const nb = v.querySelector('.nxcf-nb');
    const vide = v.querySelector('.nxcf-vide');
    const refus = v.querySelector('.nxcf-refus');
    const carte = v.querySelector('.nxcf-carte');
    const rc = carte.getBoundingClientRect();
    const rr = refus ? refus.getBoundingClientRect() : null;
    return {
      on: v.classList.contains('on'),
      titre: t ? t.textContent.trim() : '',
      compte: nb && !nb.hidden ? nb.textContent.trim() : '',
      vide: vide ? vide.textContent.replace(/\s+/g, ' ').trim() : '',
      refus: refus ? refus.textContent.trim() : '',
      /* Un refus PRESENT mais hors de la carte serait le meme defaut sous un
         autre nom : on verifie qu'il se lit la ou l'oeil est. */
      refusDansLaCarte: !!(rr && rr.width > 0 && rr.height > 0 &&
                           rr.top >= rc.top - 1 && rr.bottom <= rc.bottom + 1),
      lignes: Array.prototype.map.call(v.querySelectorAll('.nxcf-i'), function (x) {
        const b = x.querySelector('[data-oeufrange]') || x.querySelector('[data-oeufsort]');
        return {
          nom: (x.querySelector('b') || { textContent: '' }).textContent.trim(),
          etat: (x.querySelector('em') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim(),
          espece: b ? (b.getAttribute('data-oeufrange') || b.getAttribute('data-oeufsort')) : null,
          range: !!x.querySelector('[data-oeufrange]'),
          sort: !!x.querySelector('[data-oeufsort]'),
        };
      }),
    };
  });
  const combienDeFamiliers = () => p.evaluate(() =>
    window.__s.reduce((k, s) => k + (s.__out || []).filter((m) => m.type === 'familiers').length, 0));
  const fermeALaMain = async () => {
    await p.evaluate(() => { const x = document.querySelector('#nxCoffreVoile .nxcf-x'); if (x) x.click(); });
    await p.waitForTimeout(250);
  };

  /* ---- ON ENTRE DANS LA SALLE ----
   * On VISE la porte au lieu de compter les secondes : « marcher trois
   * secondes a droite » suppose une vitesse, une taille de carte et un point
   * de depart — trois choses qui changeront sans prevenir l'essai. */
  const entre = async () => {
    await espionne();
    await p.waitForTimeout(400);
    for (let k = 0; k < 30; k++) {
      const e = await veille();
      if (e.salle) return true;
      if (!e.moi || !e.porte) { await marche('ArrowRight', 200); continue; }
      const ex = e.porte.x - e.moi.x, ey = e.porte.y - e.moi.y;
      if (Math.abs(ex) < 80 && Math.abs(ey) < 80) { await p.waitForTimeout(700); continue; }
      /* On corrige le plus grand ecart d'abord, par pas courts : la fontaine
         est au milieu du chemin et un long pas droit s'y arrete. */
      if (Math.abs(ex) > Math.abs(ey)) await marche(ex > 0 ? 'ArrowRight' : 'ArrowLeft', 350);
      else await marche(ey > 0 ? 'ArrowDown' : 'ArrowUp', 350);
    }
    return (await veille()).salle > 0;
  };

  /* ---- ON CHERCHE LE COFFRE AUX OEUFS SANS SAVOIR OU IL EST ----
   *
   * On longe la rangee du bas vers la DROITE en ouvrant ce qu'on croise, et
   * l'on s'arrete au premier coffre qui demande `familiers` en s'ouvrant.
   * Reconnaitre le bon coffre a son titre reviendrait a recopier dans l'essai
   * la phrase que l'essai verifie : il passerait alors meme si tous les
   * coffres ouvraient ce panneau-la.
   *
   * Les titres croises en chemin sont gardes : ils servent a prouver que le
   * coffre aux oeufs n'ouvre pas le menu d'un voisin. */
  const cherche = async () => {
    /* On pousse vers le bas plus longtemps qu il ne faut. La salle
       BORNE la position a son mur : depasser ne coute rien, alors que mesurer
       juste demanderait de connaitre la vitesse du personnage et la hauteur de
       la piece — deux chiffres que l'essai n'a pas a savoir et qui bougeront.
       C'est le mur qui arrete, pas le chronometre. */
    await marche('ArrowDown', 2600);
    const croises = [];
    let envAvant = await combienDeFamiliers();
    for (let k = 0; k < 25; k++) {
      const e = await veille();
      if (e.on) {
        const env = await combienDeFamiliers();
        const demandeLesOeufs = env > envAvant;
        envAvant = env;
        if (demandeLesOeufs) return { trouve: true, titre: e.titre, croises, pas: k };
        croises.push(e.titre);
        await fermeALaMain();
      }
      await marche('ArrowRight', 200);
    }
    return { trouve: false, titre: (await veille()).titre, croises, pas: 25 };
  };
  /* On repasse par le VRAI chemin — le message du serveur — plutot que par une
     fonction interne : c'est celui que le joueur emprunte quand ses oeufs
     changent, et c'est lui qui peut oublier une moitie de la reponse. */
  const rouvre = async () => {
    await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'familiers' })));
    await p.waitForTimeout(800);
  };
  /* La verite du serveur, demandee au serveur. L'essai ne recompte pas les
     oeufs de son cote : il compterait alors sa propre arithmetique. */
  const auServeur = (es) => {
    const l = moteur.oeufsDuJoueur(w.address).find((x) => x.espece === es);
    return l ? l : { espece: es, nom: null, sac: 0, coffre: 0 };
  };
  const ligneDe = (vu, es) => vu.lignes.find((x) => x.espece === es) || null;
  const tape = async (quoi, es) => {
    const sel = '#nxCoffreVoile [data-' + quoi + '="' + es + '"]';
    if (!(await p.$(sel))) return false;
    await p.click(sel);
    await p.waitForTimeout(600);
    return true;
  };

  /* ================== 1. LE COFFRE EXISTE, ET IL EST A LUI ==================
   * On y va A PIED et le sac est VIDE : c'est l'etat de presque tout le monde,
   * et c'est celui ou un panneau muet ne se remarque pas. */
  console.log('\n-- on marche jusqu au quatrieme coffre --');
  ok(await entre(), 'on est entre dans la salle des coffres');
  const cible = await cherche();
  ok(cible.trouve,
     `un coffre de la rangee demande les oeufs en s ouvrant (« ${cible.titre} », ${cible.pas} pas)`);
  ok(cible.croises.length >= 2,
     `on en a croise ${cible.croises.length} autres avant lui (${cible.croises.join(' | ')})`);
  /* LE DEFAUT LE PLUS CHER SERAIT UN QUATRIEME COFFRE QUI OUVRE LE MENU DU
     VOISIN : le joueur croirait avoir trouve son rangement, y chercherait son
     oeuf et conclurait qu'il l'a perdu. */
  ok(!!cible.titre && cible.croises.every((t) => t !== cible.titre),
     'et il ouvre SON panneau, pas celui d un voisin de la rangee');

  /* ================== 6. LE COFFRE VIDE DIT OU EN TROUVER ================== */
  console.log('\n-- le coffre vide --');
  const vide = await panneau();
  ok(vide.on && vide.lignes.length === 0, 'le panneau est ouvert et il n y a aucun oeuf');
  /* Le taux vient du MONDE : ecrire « 1,200 » ici laisserait passer un texte
     qui promet un chiffre que le jeu ne tire plus. */
  const surCombien = Math.round(1 / M.OEUF.chance).toLocaleString('en-US');
  ok(vide.vide.indexOf(surCombien) >= 0,
     `il dit a quel prix un oeuf tombe (un sur ${surCombien}) — « ${vide.vide} »`);
  /* Et le LIEU ou l'ouvrir, nomme comme la page le nomme ailleurs : si
     l'endroit est rebaptise un jour, ce texte doit suivre au lieu d'envoyer le
     joueur vers un comptoir qui n'existe plus. */
  const nomDuRayon = await p.evaluate(() => {
    const t = document.querySelector('#nxPetVoile .nxcf-titre');
    return t ? t.textContent.replace(/[^\x20-\x7E]/g, '').trim() : '';
  });
  ok(!!nomDuRayon && vide.vide.indexOf(nomDuRayon) >= 0,
     `et ou l ouvrir, du nom que la page donne au rayon (« ${nomDuRayon} »)`);

  /* ================== 2. LES DEUX MOITIES SE VOIENT ENSEMBLE ==================
   * C'est toute la raison d'etre du panneau : avant, le coffre ne savait rien
   * du sac, et l'on voyait « rien au coffre » sans voir « et un dans ton dos,
   * qui mourra avec toi ». */
  console.log('\n-- un au coffre, un dans le dos --');
  const es1 = M.OEUFS[0], es2 = M.OEUFS[1];
  /* DEUX au coffre et UN au dos, pas un de chaque : avec le meme chiffre des
     deux cotes, une ligne qui afficherait deux fois le coffre serait
     indiscernable d'une ligne juste. */
  moteur.prendOeuf(w.address, es1);
  moteur.prendOeuf(w.address, es1);
  moteur.prendOeuf(w.address, es1);
  moteur.rangeOeuf(w.address, es1);
  moteur.rangeOeuf(w.address, es1);
  await rouvre();
  const deux = await panneau();
  const srvDeux = auServeur(es1);
  const l1 = ligneDe(deux, es1);
  ok(!!l1, `l espece qu on possede a sa ligne (${srvDeux.nom})`);
  ok(!!l1 && l1.nom === srvDeux.nom,
     `la ligne porte le nom que le serveur donne (« ${l1 ? l1.nom : '-'} »)`);
  /* Les DEUX chiffres, sur la MEME ligne, et RIEN d'autre. Un panneau qui
     n'afficherait que le coffre laisserait croire qu'il ne reste rien a mettre
     a l'abri — c'est l'etat d'avant, et c'est celui qui a coute des oeufs. On
     compare les nombres LUS a ceux du serveur : un chiffre en trop serait un
     compte invente, un chiffre en moins une moitie muette. */
  const chiffres = (t) => (t.match(/\d+/g) || []).map(Number).sort((a, b) => a - b);
  const attendus = [srvDeux.coffre, srvDeux.sac].sort((a, b) => a - b);
  ok(!!l1 && chiffres(l1.etat).join(',') === attendus.join(','),
     `elle dit les deux cotes et rien de plus — ${srvDeux.coffre} au coffre, ` +
     `${srvDeux.sac} au dos (« ${l1 ? l1.etat : '-'} »)`);
  ok(!!l1 && l1.range && l1.sort,
     'et les deux gestes sont offerts : ranger celui du dos, ressortir celui du coffre');
  const totalServeur = moteur.oeufsDuJoueur(w.address).reduce((k, x) => k + x.sac + x.coffre, 0);
  ok(Number(deux.compte.split(' ')[0]) === totalServeur,
     `l en-tete compte les deux cotes ensemble (« ${deux.compte} », ${totalServeur} au serveur)`);

  /* ================== 3. LES DEUX GESTES, MESURES SUR LE SERVEUR ==================
   * Un panneau qui deplacerait sa propre ligne sans rien envoyer passerait un
   * essai lu dans le DOM, et perdrait l'oeuf au rechargement suivant. */
  console.log('\n-- la fleche haut range, la fleche bas ressort --');
  const avantRange = auServeur(es1);
  ok(await tape('oeufrange', es1), 'la fleche du haut est cliquable');
  const apresRange = auServeur(es1);
  ok(apresRange.sac === avantRange.sac - 1 && apresRange.coffre === avantRange.coffre + 1,
     `ranger deplace l oeuf AU SERVEUR (sac ${avantRange.sac}->${apresRange.sac}, ` +
     `coffre ${avantRange.coffre}->${apresRange.coffre})`);
  const vuRange = await panneau();
  const lRange = ligneDe(vuRange, es1);
  ok(!!lRange && !lRange.range && lRange.sort,
     'et le panneau suit : plus rien a ranger, tout est a l abri');

  ok(await tape('oeufsort', es1), 'la fleche du bas est cliquable');
  const apresSort = auServeur(es1);
  ok(apresSort.sac === apresRange.sac + 1 && apresSort.coffre === apresRange.coffre - 1,
     `ressortir le rend au sac AU SERVEUR (sac ${apresRange.sac}->${apresSort.sac}, ` +
     `coffre ${apresRange.coffre}->${apresSort.coffre})`);
  const vuSort = await panneau();
  const lSort = ligneDe(vuSort, es1);
  ok(!!lSort && new RegExp('(^|\\D)' + apresSort.sac + '\\D').test(lSort.etat + ' '),
     `et la ligne le redit (« ${lSort ? lSort.etat : '-'} »)`);

  /* ================== 4. LE COFFRE SURVIT A LA MORT, LE SAC NON ==================
   *
   * C'est POURQUOI ce coffre existe. On appelle le vrai chemin de mort du
   * serveur — celui qui vide `p.sacOeufs` — plutot que d'effacer le sac a la
   * main : effacer a la main prouverait que l'essai sait effacer, pas que le
   * jeu protege.
   *
   * Deux especes, une de chaque cote : avec une seule on ne saurait pas si
   * c'est le coffre qui a tenu ou la mort qui n'a rien fait. */
  console.log('\n-- on meurt avec un oeuf dans le dos --');
  moteur.rangeOeuf(w.address, es1);                 // celui-la va a l abri
  moteur.prendOeuf(w.address, es2);                 // celui-la reste dans le dos
  await rouvre();
  const avantMort = { abri: auServeur(es1), dos: auServeur(es2) };
  ok(avantMort.abri.coffre > 0 && avantMort.abri.sac === 0 &&
     avantMort.dos.sac > 0 && avantMort.dos.coffre === 0,
     `on part avec ${avantMort.abri.coffre} au coffre et ${avantMort.dos.sac} dans le dos`);
  moteur.meurt(w.address, 'andy');
  await rouvre();
  const apresMort = { abri: auServeur(es1), dos: auServeur(es2) };
  ok(apresMort.dos.sac === 0 && apresMort.dos.coffre === 0,
     `l oeuf porte est perdu avec le personnage (${avantMort.dos.sac} -> ${apresMort.dos.sac})`);
  ok(apresMort.abri.coffre === avantMort.abri.coffre,
     `celui du coffre est toujours la (${apresMort.abri.coffre})`);
  const vuMort = await panneau();
  ok(!ligneDe(vuMort, es2), 'le panneau ne montre plus l oeuf perdu');
  const lAbri = ligneDe(vuMort, es1);
  ok(!!lAbri && new RegExp('(^|\\D)' + apresMort.abri.coffre + '\\D').test(lAbri.etat),
     `et il montre toujours celui qu on avait mis a l abri (« ${lAbri ? lAbri.etat : '-'} »)`);

  /* ================== 5. LE REFUS SE LIT DANS LE PANNEAU ==================
   *
   * Le sac plein est le seul refus que ce coffre puisse rendre, et il tombe au
   * pire moment : on vient chercher son oeuf pour aller l'ouvrir. Un message
   * flottant peint sur la CARTE passe derriere le voile du coffre — le joueur
   * retape le bouton et croit a une panne. */
  console.log('\n-- le sac est plein --');
  /* Le nombre de cases vient du MONDE. Ecrire « huit » ici ferait un essai qui
     ne remplit plus rien le jour ou le sac s agrandit, et le refus ne
     tomberait jamais : l essai passerait sans avoir rien mesure. */
  const bricole = B.ITEMS_DROP[0];
  q.sac = {}; q.sac[bricole.id] = M.SAC.cases; q.sacCases = null;
  await rouvre();
  /* Le texte attendu est celui du SERVEUR, obtenu en le lui faisant dire : le
     refus est verifie AVANT tout deplacement, l appel ne bouge donc rien. */
  let motDuServeur = null;
  try { moteur.sortOeuf(w.address, es1); } catch (e) { motDuServeur = e.message; }
  ok(!!motDuServeur, `le serveur refuse bien de sortir un oeuf dans un sac plein (« ${motDuServeur} »)`);
  const avantRefus = auServeur(es1);
  ok(await tape('oeufsort', es1), 'on tape quand meme la fleche du bas');
  const vuRefus = await panneau();
  ok(vuRefus.refus === motDuServeur,
     `le panneau affiche le refus du serveur, mot pour mot (« ${vuRefus.refus} »)`);
  ok(vuRefus.refusDansLaCarte, 'et il est DANS la carte du coffre, la ou le voile ne le cache pas');
  const apresRefus = auServeur(es1);
  ok(apresRefus.coffre === avantRefus.coffre && apresRefus.sac === avantRefus.sac,
     `l oeuf n a pas bouge d un cote a l autre (${apresRefus.coffre} au coffre)`);

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  /* ================== 7. LE REFUS NE VOYAGE PAS D UN COFFRE A L AUTRE ======
   *
   * `coffreErreur` survivait a la fermeture, et les quatre branches du
   * panneau l affichent. Un « Your backpack is full » attrape en sortant un
   * oeuf se relisait donc dans le coffre aux OBJETS, ou il ne veut rien dire :
   * le joueur cherche ce qu il a fait de mal a un endroit ou il n a rien fait.
   * Ca ne tenait a rien tant qu un seul coffre etait ouvrable ; a quatre,
   * c est une phrase qui voyage. */
  console.log('\n-- le refus reste dans le coffre qui l a recu --');
  {
    /* On part du refus qu on vient de provoquer, il est encore a l ecran. */
    const avant = await p.evaluate(() =>
      (document.querySelector('#nxCoffreVoile .nxcf-refus') || {}).textContent || '');
    ok(avant.length > 0, `le refus est bien affiche dans le coffre aux oeufs (« ${avant.trim()} »)`);
    /* On ferme, puis on rouvre un AUTRE coffre — par le vrai chemin, celui
       qu emprunte le joueur qui marche d un coffre au suivant. */
    await fermeALaMain();
    /* On marche jusqu au coffre VOISIN, par le vrai chemin. Rouvrir le meme
       panneau par une fonction interne ne prouverait rien : c est le trajet
       d un coffre a l autre qui fait voyager la phrase. */
    let apres = null;
    for (let k = 0; k < 12 && !apres; k++) {
      await marche('ArrowLeft', 260);
      const e = await veille();
      if (!e.on) continue;
      const vu = await p.evaluate(() => ({
        refus: (document.querySelector('#nxCoffreVoile .nxcf-refus') || {}).textContent || '',
        titre: (document.querySelector('#nxCoffreVoile .nxcf-titre') || {}).textContent || '',
      }));
      /* N importe quel coffre AUTRE que celui des oeufs fait l affaire : le
         sujet est que la phrase ne suive pas, pas lequel des trois on croise. */
      if (!/egg/i.test(vu.titre)) apres = vu;
      else await fermeALaMain();
    }
    ok(!!apres, 'on a marche jusqu a un autre coffre'
       + (apres ? ` (« ${apres.titre.trim()} »)` : ''));
    ok(apres && apres.refus.length === 0,
       'et le refus des oeufs ne l a pas suivi'
       + (apres && apres.refus ? ` (« ${apres.refus.trim()} »)` : ''));
  }

  await nav.close();
  site.stop();
  console.log(`\ncoffre_oeufs_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
