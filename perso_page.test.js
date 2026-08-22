/* LA FICHE DE PERSONNAGE, VUE DEPUIS L ECRAN.
 *
 * Le serveur sait tenir un personnage — niveau, stats, quatre emplacements
 * (perso.test.js). Personne ne verifiait l autre moitie : ce que la PAGE en
 * dessine. Aucun essai du depot client ne touchait `swk-slot`, `swk-eqi` ni
 * EQUIP_SLOTS, et deux defauts y vivaient tranquillement.
 *
 * 1. UN PERSONNAGE NU MONTRE SES HUIT STATS ET SON NIVEAU. C est le temoin :
 *    sans lui, les deux essais suivants ne prouveraient rien.
 * 2. UN PERSONNAGE HABILLE MONTRE SA PIECE **ET GARDE** son niveau et ses
 *    stats. C est l essai qui aurait attrape le crash : la fonction qui rend
 *    la pastille d une case portait le nom d une variable du meme cadre, et
 *    peindre une case remplie levait « pastille is not a function » — la fiche
 *    entiere restait alors bloquee sur « Loading character… ». D ou le
 *    controle explicite des erreurs de page.
 * 3. UN REFUS DU SERVEUR LAISSE LA FICHE INTACTE. Le refus arrive avec
 *    `etat: null` ; le ranger effacait niveau, stats et cases. Le joueur
 *    lisait « you do not own this item » et voyait son personnage devenir
 *    vierge — il en concluait qu il venait de perdre son equipement.
 *
 * Rien de ce qui est verifie ici n est ecrit dans le fichier : le niveau, les
 * noms des stats, les chiffres, le libelle des pastilles et jusqu au texte du
 * refus sont demandes au moteur.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('perso_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('perso_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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

/* Les modules du serveur se lisent APRES avoir pose les variables
   d environnement : `config.js` les gele a son premier `require`, et un
   catalogue charge trop tot emmenerait avec lui un serveur qui ecoute sur le
   port du depot au lieu de celui de l essai. */
let skins, boutique, personnages, cfgS;
let TEMOIN, HEROS, ARME_PORTEE, ARME_VENDUE, ARMURE, VOLUME;
function chargeLeCatalogue() {
  skins = require(path.join(SERVEUR, 'skins'));
  boutique = require(path.join(SERVEUR, 'boutique'));
  personnages = require(path.join(SERVEUR, 'personnages'));
  cfgS = require(path.join(SERVEUR, 'config'));

  /* Le temoin est celui qu on OFFRE : il est possede sans achat, donc sa fiche
     existe des la premiere ouverture et rien de ce qui suit ne l a touche. */
  TEMOIN = [...skins.OFFERT][0];
  HEROS = skins.SKINS.map((s) => s.id).filter((id) => id !== TEMOIN)[0];

  /* Les pieces sont prises dans le catalogue et non nommees a la main — une
     saison retouchee demain ne doit pas faire tomber un essai qui ne parle pas
     d elle. On garde celles qui ont une image dans le depot : la case affiche
     l objet, et un `onerror` retirerait l `img` d une piece sans planche, ce
     qui rendrait la verification muette au lieu de fausse. */
  const dessinee = (o) => fs.existsSync(path.join(SITE, 'img', 'shop', o.cle + '.webp'));
  const armes = boutique.itemsDeSaison(2).filter((o) => !o.drop && dessinee(o));
  const armures = boutique.itemsDeSaison(3).filter((o) => !o.drop && dessinee(o));
  ARME_PORTEE = armes[0]; ARME_VENDUE = armes[1]; ARMURE = armures[0];

  /* De quoi franchir la porte du rachat (c est par le rachat que la piece du
     troisieme essai quitte l inventaire) et monter de plusieurs niveaux. */
  VOLUME = Math.max(2 * (Number(cfgS.RACHAT_VOLUME_MIN) || 0), personnages.volumePour(5));
}

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/persopage-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  chargeLeCatalogue();
  const { Game } = require(path.join(SERVEUR, 'game'));
  let moteur = null; const _p0 = Game.prototype._p;
  Game.prototype._p = function (a) { moteur = this; return _p0.call(this, a); };
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const cfg = require(path.join(SERVEUR, 'config'));
  const WEI = (x) => ethers.utils.parseUnits(String(x), cfg.DECIMALS);
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
  });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));

  /* ---- DEUX PAGES, UNE SEULE CONNEXION ----
   * Le tiroir des personnages vit dans stakebubble.js et ne s accroche que sur
   * une page qui a une barre — le hall, pas le Nexus. La connexion par
   * signature, elle, se fait sur la socket du Nexus. On se connecte donc la ou
   * on sait le faire, on garde le JETON DE SESSION, et on le repose dans le
   * meme stockage local avant d aller au hall : stakebubble reprend la session
   * tout seul, comme un joueur qui change de page. */
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);
  const jeton = await p.evaluate(() => {
    const s = window.__s.find((x) => x.__m.some((y) => y.type === 'auth'));
    return s.__m.find((y) => y.type === 'auth').session || null;
  });
  ok(!!jeton, 'la connexion rend un jeton de session');

  /* ---- L ETAT, POSE PAR LES VRAIES FONCTIONS DU MOTEUR ----
   * Deux personnages possedes, deux volumes joues sous chacun (donc deux
   * niveaux differents), et trois pieces au coffre. Rien n est bricole a la
   * main la ou une methode existe. */
  const q = moteur._p(w.address);
  q.hasDeposited = true;
  q.balance = WEI(50000000);
  moteur.acheteSkin(w.address, TEMOIN);              // offert — devient actif
  moteur._markWager(q, WEI(VOLUME), 'plinko');       // ce volume-la est au temoin
  moteur.acheteSkin(w.address, HEROS);               // paye — devient actif a son tour
  moteur._markWager(q, WEI(2 * VOLUME), 'plinko');
  ok(moteur.possedeSkin(q, TEMOIN) && moteur.possedeSkin(q, HEROS),
     'les deux personnages sont au joueur');
  q.objets = q.objets || {};
  [ARME_PORTEE, ARME_VENDUE, ARMURE].forEach(function (o) { q.objets[o.id] = 1; });

  await p.evaluate((t) => { localStorage.setItem('swogeSession', t); }, jeton);
  await p.goto(`http://127.0.0.1:${site.port}/games.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.swpb', { state: 'attached', timeout: 20000 });
  await p.waitForTimeout(1500);

  /* ---- ON OUVRE LE TIROIR COMME UN JOUEUR ---- */
  await p.evaluate(() => { document.querySelector('.swpb').click(); });
  await p.waitForSelector('.swpov.on', { timeout: 10000 });
  await p.evaluate(() => { document.querySelector('.swpov [data-k="sk"]').click(); });
  await p.waitForSelector('.swpov .swk-c', { timeout: 10000 });
  await p.waitForTimeout(600);
  ok(true, 'le tiroir s ouvre sur le rayon des personnages');

  const ouvreFiche = async (id) => {
    await p.evaluate((k) => { document.querySelector('.swpov .swk-c[data-id="' + k + '"]').click(); }, id);
    await p.waitForSelector('.swk-v.on', { timeout: 10000 });
    await p.waitForTimeout(900);   // la fiche arrive par un aller-retour serveur
  };
  const fermeFiche = async () => {
    await p.evaluate(() => { document.querySelector('.swk-v.on .swv-x').click(); });
    await p.waitForTimeout(300);
  };
  /* Ce que la fiche MONTRE, lu une bonne fois — niveau, stats, cases. */
  const fiche = () => p.evaluate(() => {
    const v = document.querySelector('.swk-v.on');
    if (!v) return null;
    const num = (t) => Number(String(t == null ? '' : t).replace(/[^0-9.-]/g, ''));
    const lv = v.querySelector('.swk-lvl');
    return {
      niveau: lv ? lv.querySelector('b').textContent : null,
      xp: lv ? lv.querySelector('.swk-lvlt span').textContent : null,
      charge: !!v.querySelector('.swk-stload'),
      stats: [].map.call(v.querySelectorAll('.swk-sg .swk-s'), (d) => {
        const b = d.querySelector('b'), em = b.querySelector('em');
        return { nom: d.querySelector('i').textContent,
                 base: num(b.childNodes[0].textContent),
                 bonus: em ? num(em.textContent) : 0 };
      }),
      cases: [].map.call(v.querySelectorAll('.swk-slot'), (s) => {
        const im = s.querySelector('img'), bd = s.querySelector('b');
        return { genre: s.dataset.genre,
                 montree: s.style.display !== 'none',
                 vide: s.classList.contains('vide'),
                 pastille: bd ? bd.textContent : null,
                 image: im ? im.getAttribute('src') : null,
                 titre: s.title || '' };
      }),
      choix: [].map.call(v.querySelectorAll('.swk-eql .swk-eqi'), (b) => b.querySelector('b').textContent),
    };
  });
  const laCase = (f, genre) => f.cases.filter((c) => c.genre === genre)[0];
  const toasts = () => p.evaluate(() => [].map.call(document.querySelectorAll('.swtoast'),
                                                    (t) => t.className + ' | ' + t.textContent));

  /* ================== 1. LE TEMOIN : NU, MAIS COMPLET ================== */
  console.log('\n-- un personnage sans rien sur le dos --');
  {
    const attendu = moteur.personnageEtat(w.address, TEMOIN);
    await ouvreFiche(TEMOIN);
    const f = await fiche();
    ok(!!f, 'la fiche du temoin s ouvre');
    eq(f.charge, false, 'elle ne reste pas sur « Loading character… »');
    eq(f.niveau, 'Level ' + attendu.niveau, 'elle porte le niveau que le moteur donne');
    eq(f.stats.length, personnages.STATS.length, 'les huit stats sont la');
    eq(f.stats.map((s) => s.nom).join(','),
       personnages.STATS.map((k) => k.toUpperCase()).join(','),
       'et ce sont bien celles du moteur, dans son ordre');
    /* Le chiffre lu a l ecran est base + bonus : c est ce que le moteur
       appelle `stats`, decoupe en deux pour montrer ce qu apporte une piece. */
    const faux = f.stats.filter((s, i) => s.base + s.bonus !== attendu.stats[personnages.STATS[i]]);
    eq(faux.length, 0, 'chaque chiffre affiche est celui du moteur');
    eq(f.stats.filter((s) => s.bonus).length, 0, 'aucun bonus vert : il ne porte rien');
    eq(f.cases.length, 4, 'les quatre emplacements sont dessines');
    eq(f.cases.filter((c) => c.montree && c.vide).length, 4, 'et les quatre sont vides');
    await fermeFiche();
  }

  /* ================== 2. HABILLE, ET TOUJOURS LISIBLE ================== */
  console.log('\n-- une piece dans sa case, et le reste qui tient --');
  {
    await ouvreFiche(HEROS);
    let f = await fiche();
    eq(f.charge, false, 'la fiche du heros arrive');
    const avant = moteur.personnageEtat(w.address, HEROS);
    eq(f.niveau, 'Level ' + avant.niveau, 'avec son propre niveau, distinct du temoin');

    /* On equipe COMME UN JOUEUR : on touche la case, on choisit dans la
       liste. Poser l objet cote serveur montrerait une fiche que personne n a
       jamais fait peindre. */
    await p.evaluate(() => { document.querySelector('.swk-v.on .swk-slot[data-genre="arme"]').click(); });
    await p.waitForTimeout(800);
    f = await fiche();
    ok(f.choix.indexOf(ARME_PORTEE.nom) >= 0 && f.choix.indexOf(ARME_VENDUE.nom) >= 0,
       'le choix des armes propose les deux qu on possede');
    await p.evaluate((nom) => {
      [].slice.call(document.querySelectorAll('.swk-v.on .swk-eql .swk-eqi'))
        .filter((b) => b.querySelector('b').textContent === nom)[0].click();
    }, ARME_PORTEE.nom);
    await p.waitForTimeout(1000);

    const etat = moteur.personnageEtat(w.address, HEROS);
    eq(etat.equipArme.item, ARME_PORTEE.id, 'le moteur a bien pris l arme');
    f = await fiche();
    const ca = laCase(f, 'arme');
    eq(ca.vide, false, 'la case d arme n est plus vide');
    ok((ca.image || '').indexOf(encodeURIComponent(ARME_PORTEE.cle)) >= 0,
       'elle montre la planche de la piece');
    ok(ca.titre.indexOf(ARME_PORTEE.nom) >= 0, 'et son titre la nomme');
    /* Une arme ne donne plus de stat : sa pastille montre ses degats, et le
       chiffre vient du moteur. */
    eq(ca.pastille, '⚔' + etat.equipArme.degats[1], 'sa pastille donne les degats du moteur');

    /* ---- CE QUI CASSAIT ---- */
    eq(f.charge, false, 'la fiche ne retombe pas sur « Loading character… »');
    eq(f.niveau, 'Level ' + etat.niveau, 'le niveau est TOUJOURS la');
    eq(f.stats.length, personnages.STATS.length, 'les huit stats sont TOUJOURS la');
    eq(erreurs.length, 0, 'aucune erreur de page' + (erreurs.length ? ' : ' + erreurs[0] : ''));

    /* Une armure, elle, donne des stats : c est l autre moitie de la pastille,
       et c est ce qui fait apparaitre le bonus vert. */
    await p.evaluate(() => { document.querySelector('.swk-v.on .swk-slot[data-genre="armure"]').click(); });
    await p.waitForTimeout(700);
    await p.evaluate((nom) => {
      [].slice.call(document.querySelectorAll('.swk-v.on .swk-eql .swk-eqi'))
        .filter((b) => b.querySelector('b').textContent === nom)[0].click();
    }, ARMURE.nom);
    await p.waitForTimeout(1000);

    const etat2 = moteur.personnageEtat(w.address, HEROS);
    const bonus = etat2.equipArmure.bonus;
    const plusGros = personnages.STATS.reduce((m, k) => Math.max(m, bonus[k] || 0), 0);
    f = await fiche();
    const cr = laCase(f, 'armure');
    eq(cr.vide, false, 'la case d armure porte la piece');
    eq(cr.pastille, '+' + plusGros.toLocaleString('en-US'),
       'sa pastille donne le plus gros bonus du moteur');
    const verts = f.stats.filter((s, i) => s.bonus === (bonus[personnages.STATS[i]] || 0));
    eq(verts.length, personnages.STATS.length, 'chaque bonus vert est celui de la piece');
    const faux2 = f.stats.filter((s, i) => s.base + s.bonus !== etat2.stats[personnages.STATS[i]]);
    eq(faux2.length, 0, 'et le total affiche suit toujours le moteur');
    eq(f.cases.filter((c) => c.montree && !c.vide).length, 2, 'deux cases remplies, deux vides');
    eq(erreurs.length, 0, 'toujours aucune erreur de page');
  }

  /* ================== 3. UN REFUS NE VIDE PAS LA FICHE ================== */
  console.log('\n-- le serveur dit non, et la fiche ne bouge pas --');
  {
    /* La deuxieme arme part POUR DE VRAI, par le rachat de la boutique — le
       geste qu un joueur fait dans un autre onglet pendant que sa fiche est
       ouverte. La liste des choix, elle, date d avant : le clic partira donc
       sur une piece que le compte ne possede plus, et le serveur refusera. */
    moteur.boutiqueRachat(w.address, ARME_VENDUE.id, 1);
    eq((moteur._p(w.address).objets || {})[ARME_VENDUE.id] || 0, 0,
       'la piece a bien quitte l inventaire');

    const avant = await fiche();
    await p.evaluate(() => { document.querySelector('.swk-v.on .swk-slot[data-genre="arme"]').click(); });
    await p.waitForTimeout(700);
    let f = await fiche();
    ok(f.choix.indexOf(ARME_VENDUE.nom) >= 0, 'la liste ouverte propose encore la piece vendue');
    await p.evaluate((nom) => {
      [].slice.call(document.querySelectorAll('.swk-v.on .swk-eql .swk-eqi'))
        .filter((b) => b.querySelector('b').textContent === nom)[0].click();
    }, ARME_VENDUE.nom);
    await p.waitForTimeout(1200);

    /* Le texte du refus n est pas ecrit ici : on le demande au moteur, qui
       leve la meme exception que la route a levee pour la page. */
    let refus = null;
    try { moteur.equipeArme(w.address, HEROS, ARME_VENDUE.id); }
    catch (e) { refus = e.message; }
    ok(!!refus, 'le moteur refuse bien cette piece (' + refus + ')');
    const vus = await toasts();
    ok(vus.some((t) => t.indexOf('bad') >= 0 && t.indexOf(refus) >= 0),
       'le refus est affiche au joueur');

    f = await fiche();
    eq(f.charge, false, 'la fiche ne repasse pas en « Loading character… »');
    eq(f.niveau, avant.niveau, 'le niveau est intact');
    eq(f.stats.length, personnages.STATS.length, 'les huit stats sont intactes');
    eq(f.stats.map((s) => s.base + '+' + s.bonus).join(','),
       avant.stats.map((s) => s.base + '+' + s.bonus).join(','), 'et leurs chiffres n ont pas bouge');
    eq(f.cases.filter((c) => c.montree).length, 4, 'les quatre cases sont toujours la');
    eq(laCase(f, 'arme').vide, false, 'la case d arme porte toujours ce qu on portait');
    eq(laCase(f, 'arme').pastille, laCase(avant, 'arme').pastille, 'avec la meme pastille');
    eq(laCase(f, 'armure').vide, false, 'et l armure est toujours en place');
    eq(moteur.personnageEtat(w.address, HEROS).equipArme.item, ARME_PORTEE.id,
       'cote moteur non plus, rien n a change');
    eq(erreurs.length, 0, 'aucune erreur de page' + (erreurs.length ? ' : ' + erreurs[0] : ''));
  }

  await nav.close(); site.stop();
  console.log(`\nperso_page.test.js : ${n} verifications, ${rates} rate(s)`);
  process.exit(rates ? 1 : 0);
})();
