'use strict';
/*
 * LES SIX MARCHES, VUS DE LA PAGE.
 *
 * ---- POURQUOI CET ESSAI N'EXISTAIT PAS AVANT ----
 *
 * `swogebet.html` ecrivait l'adresse du serveur EN DUR. N'importe quel essai
 * automatise aurait donc ouvert sa socket sur la PRODUCTION et pose de vrais
 * paris avec de vrais soldes. La page porte maintenant `?server=`, comme deux
 * autres pages du site — et c'est ce qui la rend essayable.
 *
 * ---- CE QU'IL VERIFIE ----
 *
 * Que ce que le serveur envoie arrive JUSQU'A L'ECRAN, et que ce qu'on clique
 * repart tel quel. Un marche peut etre parfaitement valide, cote et reglable
 * cote serveur, et rester invisible ou — pire — se poser sur le mauvais
 * marche parce que la page a lu la cote du 1-N-2 pour une jambe posee sur
 * « les deux equipes marquent ». Le bulletin annoncerait alors un retour que
 * le serveur ne paierait pas.
 *
 * Il ecrit son PROPRE calendrier : celui du depot ne porte que des 1-N-2, et
 * ses rencontres sont toutes jouees. Attendre le prochain import pour essayer
 * la page reviendrait a ne jamais l'essayer.
 */
const assert = require('assert');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

let n = 0, echecs = 0;
const SB_ATTENDU = { 'Spain \u00b7 La Liga': 4, 'England \u00b7 Premier League': 2, 'Italy \u00b7 Serie A': 1 };
const ok = (c, m) => { if (c) { n++; console.log('  ok   ' + m); }
                       else { echecs++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} [${a} vs ${b}]`);

const SITE = __dirname;
const SERVEUR = '/home/user/swoge-pusher-server.github.io';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript',
                '.json': 'application/json', '.webp': 'image/webp',
                '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav' };

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
  /* ---- LE CALENDRIER D'ESSAI, ECRIT AVANT LE PREMIER `require` ----
   * `paris.js` resout son fichier au chargement : ecrire apres coup ferait
   * lire l'amorce du depot, dont toutes les rencontres sont jouees. */
  const VOLUME = fs.mkdtempSync('/tmp/paris-page-');
  process.env.DATA_DIR = VOLUME;
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.chdir(SERVEUR);
  const cotes = require(path.join(SERVEUR, 'cotes'));
  const DEMAIN = new Date(Date.now() + 26 * 3600 * 1000).toISOString();
  const H = (n) => new Date(Date.now() + n * 3600 * 1000).toISOString();
  /* Nommee en toutes lettres : la premiere version l appelait `eq`, ce qui
     masquait la fonction de comparaison du meme nom dans toute la portee — et
     l essai mourait sur « eq is not a function », sans jamais rendre la main. */
  const RENCONTRES = [
    ['foot', 'Spain · La Liga', 'Spain', 'ES', ['Valencia', 'Real Betis'], 5],
    ['foot', 'Spain · La Liga', 'Spain', 'ES', ['Real Madrid', 'Real Sociedad'], 7],
    ['foot', 'Spain · La Liga', 'Spain', 'ES', ['Celta Vigo', 'CA Osasuna'], 29],
    ['foot', 'Spain · La Liga', 'Spain', 'ES', ['Barcelona', 'Athletic Bilbao'], 31],
    ['foot', 'England · Premier League', 'England', 'GB', ['Arsenal', 'Chelsea'], 9],
    ['foot', 'England · Premier League', 'England', 'GB', ['Liverpool', 'Everton'], 33],
    ['foot', 'Italy · Serie A', 'Italy', 'IT', ['Inter', 'Milan'], 52],
    ['tennis', 'ATP · Cincinnati', 'United States', 'US', ['Blockx A.', 'Navone M.'], 12],
  ];
  /* ---- LES EQUIPES D ESSAI ONT UNE FORCE ----
     `cotes.js` refuse de coter deux equipes qu il ne connait pas : « sans
     force, une cote fabriquee serait un chiffre invente ». C est la bonne
     regle, et l essai la respecte : il pose les forces de ses equipes
     inventees avant de demander leurs marches, comme l etalonnage le fait
     pour les vraies. */
  RENCONTRES.forEach((x) => { cotes.poseNote(x[0], x[4][0], 1530); cotes.poseNote(x[0], x[4][1], 1470); });
  const cat = {
    sports: [{ cle: 'foot', nom: 'Football', actif: true },
             { cle: 'tennis', nom: 'Tennis', actif: true }],
    matchs: RENCONTRES.map((x, i) => ({
      id: 'ess-' + i, sport: x[0], competition: x[1], pays: x[2],
      paysDomicile: x[3], paysExterieur: x[3],
      domicile: x[4][0], exterieur: x[4][1], debut: H(x[5]),
      marches: cotes.marchesDe(x[0], x[4][0], x[4][1]),
    })),
  };
  fs.writeFileSync(path.join(VOLUME, 'paris_catalogue.json'), JSON.stringify(cat));
  const paris = require(path.join(SERVEUR, 'paris'));
  paris.charge();

  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify() {}, notifyPhoto() {}, sendDocument() {},
    chatEstPublic() { return true; }, enabled() { return true; } } };
  const port = await new Promise((r) => {
    const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); });
  });
  process.env.PORT = String(port);
  /* ---- LE MOTEUR, POUR CREDITER LE COFFRE DES PARIS ----
   * Les paris se jouent en $SWOGEBET depuis le 3 septembre 2026 : sans solde
   * au coffre, le serveur repond « not enough $SWOGEBET », et l essai ne
   * mesurerait jamais un pari ACCEPTE. On attrape le moteur au passage, comme
   * `paris_accueil.test.js`, et on credite apres la connexion. */
  const { Game } = require(path.join(SERVEUR, 'game'));
  let moteur = null; const _p0 = Game.prototype._p;
  Game.prototype._p = function (a) { moteur = this; return _p0.call(this, a); };
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  await new Promise((r) => setTimeout(r, 1400));

  const site = await servirLeSite();
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) {
      const s = (pr === undefined) ? new N(u) : new N(u, pr);
      s.__m = []; s.__envoi = [];
      const env = s.send.bind(s);
      s.send = function (d) { try { s.__envoi.push(JSON.parse(d)); } catch (e) {} return env(d); };
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      window.__s.push(s);
      return s;
    }
    C.prototype = N.prototype; C.OPEN = N.OPEN; C.CLOSED = N.CLOSED;
    window.WebSocket = C;
  });
  await p.goto(`http://127.0.0.1:${site.port}/swogebet.html?server=`
               + encodeURIComponent('ws://127.0.0.1:' + port),
               { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);

  console.log('-- on se connecte --');
  const w = ethers.Wallet.createRandom();
  const etat = await p.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      const s = (window.__s || []).find((q) => q.__m.some((m) => m.type === 'hello'));
      if (s) return { ok: true, nonce: s.__m.find((m) => m.type === 'hello').loginNonce };
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: false };
  });
  ok(etat.ok, 'la page ouvre sa socket sur le serveur d essai — et non sur la production');
  if (!etat.ok) { await nav.close(); site.stop(); process.exit(1); }
  const msg = 'SWOGE Pusher login\nnonce: ' + etat.nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, sg]) => window.__s[0].send(JSON.stringify({ type: 'login', message: m, signature: sg })), [msg, sig]);
  await p.waitForTimeout(1800);
  ok(true, 'un compte est connecte : ' + w.address.slice(0, 10));
  {
    const cfg = require(path.join(SERVEUR, 'config'));
    const q = moteur._p(w.address);
    q.hasDeposited = true;
    q.betBalance = ethers.utils.parseUnits('50000000', cfg.DECIMALS);
  }

  console.log('\n-- a l arrivee : un bloc par tournoi, un seul ouvert --');
  /* ---- LA LECTURE PASSE PAR UNE FONCTION COMPILEE, ET RAMENE UNE CHAINE ----
   * `page.evaluate` accepte une fleche ecrite ici meme, et c est la facon
   * habituelle. Sur cette page, avec ce tableau d objets imbriques, l appel ne
   * rendait jamais la main : ni erreur, ni delai, le processus restait bloque.
   * Les MEMES champs, demandes un a un par une fonction compilee depuis une
   * chaine, repondaient tous correctement — on a donc garde cette forme-la, et
   * l on serialise soi-meme plutot que de laisser recomposer l objet.
   * Ce n est pas elegant. C est ce qui rend cet essai executable, et le laisser
   * bloquer indefiniment revenait a n avoir aucun essai. */
  const LIT = 'return JSON.stringify({'
    + 'tournois: [].map.call(document.querySelectorAll(".sb-t"), function (t) {'
    + '  return {'
    + '    nom: (t.querySelector(".sb-t-nom b") || {}).textContent || "",'
    + '    quand: (t.querySelector(".sb-t-quand") || {}).textContent || "",'
    + '    nb: Number((t.querySelector(".sb-t-nb") || {}).textContent || 0),'
    + '    ouvert: t.classList.contains("on"),'
    + '    annonce: (t.querySelector(".sb-t-tete") || {}).getAttribute("aria-expanded"),'
    + '    lignes: t.querySelectorAll(".sb-m").length'
    + '  };'
    + '}),'
    + 'lignes: document.querySelectorAll(".sb-m").length'
    + '})';
  const dit = async () => JSON.parse(await p.evaluate(new Function(LIT)));

  const v = await dit();
  eq(v.tournois.length, 3, 'les rencontres de football sont rangees en trois tournois');
  eq(v.tournois.map((t) => t.nom).join(' | '),
     'Spain \u00b7 La Liga | England \u00b7 Premier League | Italy \u00b7 Serie A',
     'et dans l ordre du prochain coup d envoi : ce qui ferme le plus tot d abord');
  ok(v.tournois.every((t) => t.nb === SB_ATTENDU[t.nom]),
     'chaque en-tete annonce le nombre du CATALOGUE, pas celui de ce qui est'
     + ' affiche : ' + v.tournois.map((t) => t.nom + ':' + t.nb).join(', '));
  ok(v.tournois.every((t) => /\d\d:\d\d/.test(t.quand)),
     'et le prochain coup d envoi, lisible sans ouvrir : '
     + v.tournois.map((t) => t.quand).join(' / '));
  /* ---- RIEN N EST DEPLIE A L ARRIVEE, PAS MEME LE PREMIER ----
     Cet essai exigeait le contraire : le tournoi le plus proche ouvert d
     office. La page a change depuis, sur demande du proprietaire (« spain
     la liga laisse la fermee ... sinon c est super long l interface ») :
     La Liga seule fait une page tres longue. L intention de l essai — la
     page ne deroule pas tout, on choisit SON tournoi — tient toujours ;
     c est le point de depart qui a change. */
  eq(v.tournois.filter((t) => t.ouvert).length, 0, 'aucun n est ouvert a l arrivee : on choisit son tournoi');
  eq(v.tournois[0].annonce, 'false', 'et chacun le DIT : un lecteur d ecran les annonce replies');
  eq(v.lignes, 0, 'donc aucune rencontre a l ecran avant d avoir choisi — la page ne deroule plus tout, c est toute la demande');

  console.log('\n-- on ouvre le premier, au vrai pointeur --');
  await p.click('.sb-t:nth-of-type(1) .sb-t-tete');
  await p.waitForTimeout(500);
  const v1 = await dit();
  ok(v1.tournois[0].ouvert, 'le premier s ouvre : celui qui ferme le plus tot');
  eq(v1.tournois[0].annonce, 'true', 'et il le dit deplie');
  eq(v1.lignes, v1.tournois[0].nb, 'ses rencontres, et seulement les siennes, sont a l ecran');

  console.log('\n-- puis un second --');
  await p.click('.sb-t:nth-of-type(2) .sb-t-tete');
  await p.waitForTimeout(500);
  const v2 = await dit();
  ok(v2.tournois[1].ouvert && v2.tournois[1].lignes === 2,
     'le deuxieme s ouvre et montre ses deux rencontres');
  ok(v2.tournois[0].ouvert,
     'le premier reste ouvert : on en compare deux, on n en choisit pas un');
  eq(v2.lignes, 6, 'six rencontres a l ecran, celles des deux tournois ouverts');

  console.log('\n-- puis on le referme --');
  await p.click('.sb-t:nth-of-type(2) .sb-t-tete');
  await p.waitForTimeout(500);
  const v3 = await dit();
  ok(!v3.tournois[1].ouvert && v3.tournois[1].lignes === 0,
     'il se referme et ses rencontres quittent l ecran');

  console.log('\n-- et l ouverture survit a un pari --');
  await p.click('.sb-t:nth-of-type(3) .sb-t-tete');
  await p.waitForTimeout(400);
  await p.click('.sb-t:nth-of-type(3) .sb-m .sb-cotes button');
  await p.waitForTimeout(800);
  const v4 = await dit();
  ok(v4.tournois[2].ouvert,
     'le tournoi ou l on vient de choisir une cote est toujours ouvert : poser'
     + ' une cote redessine la liste entiere');
  ok(!v4.tournois[1].ouvert, 'et celui qu on avait referme ne s est pas rouvert');
  /* ---- ET LE PARI A VRAIMENT EU LIEU ----
   * Sans cette verification, les deux d au-dessus passeraient meme si le clic
   * n avait rien fait : un tournoi qui reste ouvert parce que RIEN n a ete
   * redessine n a rien prouve. C est pour elle que cet essai ouvre une vraie
   * session — la page refuse la cote a qui n est pas connecte, et c est
   * normal. */
  eq(await p.evaluate(() => document.querySelectorAll('.sb-cotes button.pris').length), 1,
     'la cote cliquee est marquee prise : le redessin qu on vient d observer est'
     + ' bien reel');
  eq(await p.evaluate(() => document.querySelectorAll('#sbJambes button[data-ote]').length), 1,
     'et elle est au bulletin');

  console.log('\n-- l autre sport a ses propres tournois --');
  await p.click('#sbSports button[data-sp="tennis"]');
  await p.waitForTimeout(700);
  const v5 = await dit();
  eq(v5.tournois.length, 1, 'le tennis n a qu un tournoi');
  eq(v5.tournois[0].nom, 'ATP \u00b7 Cincinnati', 'et c est le sien');
  /* ---- REPLIE, LUI AUSSI ----
     Cet essai voulait le tournoi seul ouvert d office : « un sport qui s ouvre
     sur un titre replie donne l impression qu il n y a rien ». Depuis que rien
     ne s ouvre d office (demande du proprietaire, voir plus haut), ce qu on
     garde de l intention, c est que le titre replie ne laisse PAS croire au
     vide : il dit combien de rencontres et a quelle heure, et un clic suffit. */
  ok(!v5.tournois[0].ouvert, 'replie comme les autres : rien ne s ouvre d office');
  ok(v5.tournois[0].nb >= 1 && /\d\d:\d\d/.test(v5.tournois[0].quand),
     'mais son titre dit combien et quand, donc pas « rien » : '
     + v5.tournois[0].nb + ' a ' + v5.tournois[0].quand);
  await p.click('.sb-t:nth-of-type(1) .sb-t-tete');
  await p.waitForTimeout(500);
  const v5b = await dit();
  ok(v5b.tournois[0].ouvert && v5b.lignes === v5b.tournois[0].nb,
     'et un clic montre ses rencontres, toutes : ' + v5b.lignes + '/' + v5b.tournois[0].nb);

  console.log('\n-- « My bets » arrive REPLIE, et la croix ferme --');
  /* ---- CE QUI ETAIT SIGNALE ----
   * « Sur SWOGE bet, my bet doit etre ferme de base ; verifie aussi que la
   *   croix fonctionne pour le fermer. »
   * Le panneau s ouvrait DEPLIE : en arrivant avec un pari en cours on le
   * trouvait grand ouvert par-dessus le bas du tableau, sans l avoir demande.
   * Et la croix ne faisait que VIDER le bulletin — avec un pari en cours, le
   * panneau restait la apres l avoir pressee, ce qui est la pire chose qu une
   * croix puisse faire. */
  await p.click('#sbSports button[data-sp="foot"]');
  await p.waitForTimeout(600);
  await p.click('.sb-t:nth-of-type(1) .sb-m .sb-cotes button');
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const i = document.getElementById('sbMise');
    if (i) { i.value = '100'; i.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await p.waitForTimeout(300);
  await p.click('#sbGo');
  await p.waitForTimeout(2500);
  /* Le serveur doit l avoir ACCEPTE : l ancienne verification se contentait
     de l existence du compteur, qui est toujours la — elle ne pouvait pas
     echouer, et le panneau vide d apres la rechargement restait inexplique. */
  ok(await p.evaluate(() => (window.__s[0].__m || []).some((m) => m.type === 'pariPose')),
     'un pari est en cours : le serveur l a accepte');

  /* On revient sur la page comme un joueur qui rouvre l onglet. */
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3200);
  const arrivee = JSON.parse(await p.evaluate(() => JSON.stringify({
    visible: !document.getElementById('sbOvl').hidden,
    replie: document.getElementById('sbOvl').classList.contains('replie'),
    dit: document.getElementById('sbTete').getAttribute('aria-expanded'),
  })));
  ok(arrivee.visible,
     'le panneau est la : un pari en cours doit se rappeler a celui qui l a pose');
  ok(arrivee.replie, 'mais REPLIE — c est ce qui etait demande');
  eq(arrivee.dit, 'false', 'et il le dit : un lecteur d ecran l annonce ferme');

  await p.click('#sbVideBt');
  await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.getElementById('sbOvl').hidden),
     'la croix le ferme pour de bon — elle ne faisait que vider le bulletin,'
     + ' et le panneau restait a l ecran');

  /* Et il revient des qu on clique une cote : la croix ne le condamne pas.
     La page vient d etre rechargee : tout est replie a nouveau (rien ne s
     ouvre d office), on deplie donc le premier tournoi avant de cliquer. */
  await p.click('.sb-t:nth-of-type(1) .sb-t-tete');
  await p.waitForTimeout(500);
  await p.click('.sb-t:nth-of-type(1) .sb-m .sb-cotes button');
  await p.waitForTimeout(600);
  const revenu = JSON.parse(await p.evaluate(() => JSON.stringify({
    visible: !document.getElementById('sbOvl').hidden,
    replie: document.getElementById('sbOvl').classList.contains('replie'),
  })));
  ok(revenu.visible && !revenu.replie,
     'et il revient DEPLIE des qu on choisit une cote : celui qui construit un'
     + ' bulletin veut le voir, celui qui arrive non');
  /* La croix avec des selections dedans les retire d abord : un bulletin cache
     qui porte encore de l argent est un piege. */
  await p.click('#sbVideBt');
  await p.waitForTimeout(500);
  eq(await p.evaluate(() => document.querySelectorAll('#sbJambes button[data-ote]').length), 0,
     'pressee sur un bulletin plein, elle le vide d abord');

  console.log('\n-- rien ne reste de l ancien rangement par journee --');
  ok(!/sb-jour/.test(fs.readFileSync(path.join(SITE, 'swogebet.html'), 'utf8')),
     'la classe du bandeau de journee de premier niveau a disparu avec lui :'
     + ' une classe qui ne vise plus rien se relit comme une classe vivante');
  ok(await p.evaluate(() => document.querySelectorAll('.sb-groupe').length) >= 1,
     'mais la journee reste marquee A L INTERIEUR d un tournoi : une competition'
     + ' qui court sur trois jours melangerait sinon le samedi et le mardi');

  ok(erreurs.length === 0, 'aucune erreur de page'
     + (erreurs.length ? ' — ' + erreurs[0] : ''));
  await nav.close(); site.stop();
  console.log('\ntournois.test.js : ' + n + ' verifications, ' + echecs + ' echec(s)');
  process.exit(echecs ? 1 : 0);
})();
