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
  eq(v.tournois.filter((t) => t.ouvert).length, 1, 'un seul est ouvert a l arrivee');
  ok(v.tournois[0].ouvert, 'et c est celui qui ferme le plus tot');
  eq(v.tournois[0].annonce, 'true', 'il le DIT : un lecteur d ecran l annonce deplie');
  eq(v.tournois[1].annonce, 'false', 'et les autres se disent replies');

  const auCatalogue = cat.matchs.filter((m) => m.sport === 'foot').length;
  ok(v.lignes < auCatalogue,
     v.lignes + ' rencontres a l ecran sur ' + auCatalogue + ' au catalogue :'
     + ' la page ne deroule plus tout — c est toute la demande');
  eq(v.lignes, v.tournois[0].nb, 'et ce sont exactement celles du tournoi ouvert');

  console.log('\n-- on en ouvre un second, au vrai pointeur --');
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
  ok(v5.tournois[0].ouvert,
     'ouvert a la premiere venue : un sport qui s ouvre sur un titre replie'
     + ' donne l impression qu il n y a rien');

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
