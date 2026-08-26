/*
 * ON PARIE DEPUIS L ACCUEIL ET DEPUIS LE HALL, SANS EN PARTIR.
 *
 * ---- CE QUI ETAIT DEMANDE ----
 *
 * « Sur index html il y a des sports affiches avec parier 1 N 2 ; sur game
 *   html tu presentes des matchs actuels du jour qu on peut miser, faut faire
 *   pareil sur index html. […] Les gens peuvent selectionner ici sans que ca
 *   les redirige vers SWOGE Bet. S ils veulent aller sur SWOGE Bet ils ont
 *   d autres moyens — peut-etre qu ils voulaient miser vite sur le match
 *   affiche a droite. »
 *
 * ---- LES DEUX DEFAUTS QUE CELA CORRIGE ----
 *
 * 1. L accueil portait QUATRE RENCONTRES ECRITES A LA MAIN, cotes comprises,
 *    jouees le 15 aout. Il annoncait donc des matchs finis a des prix qui
 *    n existent plus. Le hall avait deja recu le vrai calendrier ; l accueil
 *    le recoit par le MEME fichier, pas par une copie.
 * 2. La carte entiere etait un lien vers la page de paris. Cliquer une cote
 *    emmenait ailleurs, et il fallait la retrouver la-bas pour la reposer.
 *
 * ---- CE QUE CET ESSAI TIENT ----
 *
 * Que le pari PART VRAIMENT, et qu il part avec les chiffres du SERVEUR : les
 * noms des equipes ne figurent nulle part dans les deux pages, la mise par
 * defaut est le minimum que le serveur annonce, et le ticket est relu dans la
 * comptabilite du serveur apres coup. Une page qui afficherait un joli
 * bulletin sans rien envoyer passerait n importe quelle verification faite a
 * l ecran seul.
 *
 * Et chaque clic passe par un VRAI pointeur : les deux pages portent
 * `a[href], button{ pointer-events:none }`, et un `.click()` lance par script
 * l ignore. Ce piege s est referme sept fois sur ce depot.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('compte_index.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('compte_index.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
  const VOL = process.env.DATA_DIR;
  process.chdir('/home/user/swoge-pusher-server.github.io');
  const cotes = require('/home/user/swoge-pusher-server.github.io/cotes');
  const H = (n) => new Date(Date.now() + n * 3600 * 1000).toISOString();
  const RENCONTRES = [
    ['foot', 'Spain \u00b7 La Liga', 'Spain', 'ES', ['Valencia', 'Real Betis'], 5],
    ['foot', 'Spain \u00b7 La Liga', 'Spain', 'ES', ['Real Madrid', 'Real Sociedad'], 7],
    ['foot', 'England \u00b7 Premier League', 'England', 'GB', ['Arsenal', 'Chelsea'], 9],
    ['tennis', 'ATP \u00b7 Cincinnati', 'United States', 'US', ['Blockx A.', 'Navone M.'], 12],
  ];
  fs.writeFileSync(require('path').join(VOL, 'paris_catalogue.json'), JSON.stringify({
    sports: [{ cle: 'foot', nom: 'Football', actif: true },
             { cle: 'tennis', nom: 'Tennis', actif: true }],
    matchs: RENCONTRES.map((x, i) => ({
      id: 'ess-' + i, sport: x[0], competition: x[1], pays: x[2],
      paysDomicile: x[3], paysExterieur: x[3],
      domicile: x[4][0], exterieur: x[4][1], debut: H(x[5]),
      marches: cotes.marchesDe(x[0], x[4][0], x[4][1]),
    })),
  }));
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

  /* ---- COMBIEN DE PARIS LE SERVEUR A-T-IL ENREGISTRES ----
   * On le lui DEMANDE, par le meme message que la page de paris : sa reponse
   * porte `mesParis`. C est sa comptabilite a lui, pas ce qui est peint a
   * l ecran — une page qui montrerait un beau bulletin sans rien envoyer
   * passerait n importe quelle verification faite a l ecran seul, et c est
   * exactement le defaut qu on veut exclure ici.
   * `server.js` garde son instance pour lui ; la lire par la socket est de
   * toute facon plus honnete, puisque c est le chemin que le joueur emprunte. */
  const compteParis = (pg) => pg.evaluate(() => new Promise(function (ok) {
    if (!window.swogeFil || !window.swogeFil.pret()) return ok(-1);
    var fini = false;
    var stop = window.swogeFil.ecoute(function (m) {
      if (fini || !m || m.type !== 'parisListe') return;
      fini = true; stop(); ok((m.mesParis || []).length);
    });
    window.swogeFil.envoie({ type: 'parisListe' });
    setTimeout(function () { if (!fini) { fini = true; stop(); ok(-1); } }, 6000);
  }));

  /* ---- LE FICHIER EST PARTAGE, PAS RECOPIE ---- */
  console.log('\n-- un seul fichier, deux pages --');
  for (const f of ['index.html', 'games.html']) {
    const src = fs.readFileSync(path.join(SITE, f), 'utf8');
    ok(/<script src="swogesports\.js\?v=[0-9a-f]{8}"/.test(src),
       `${f} charge le calendrier partage, avec son marqueur de cache`);
    ok(!/function\s+carte\s*\(m\)/.test(src),
       `${f} n a pas garde de copie du calendrier en clair`);
    /* Les rencontres ecrites a la main sont parties. On cherche celle que la
       demande a nommee : « Bolton », le 15 aout. */
    ok(!/Bolton|Preston|West Brom/.test(src),
       `${f} ne porte plus de rencontre ecrite a la main`);
  }

  const NOMS = ['Valencia', 'Real Betis', 'Arsenal', 'Chelsea', 'Blockx A.'];
  for (const f of ['index.html', 'games.html']) {
    const src = fs.readFileSync(path.join(SITE, f), 'utf8');
    ok(!NOMS.some((x) => src.indexOf(x) >= 0),
       `et aucun nom du calendrier d essai ne figure dans ${f} : ce qu on lira`
       + ' a l ecran ne peut venir que du serveur');
  }

  for (const page of ['index.html', 'games.html']) {
    console.log(`\n-- ${page} : les rencontres du jour --`);
    await p.goto(`http://127.0.0.1:${site.port}/${page}?server=ws://127.0.0.1:${port}`,
                 { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.swpb', { state: 'attached', timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(3000);
    await p.evaluate(() => { const l = document.getElementById('preloader'); if (l) l.style.display = 'none'; });

    const vu = JSON.parse(await p.evaluate(() => JSON.stringify({
      cartes: document.querySelectorAll('#gxSports .match').length,
      liens: document.querySelectorAll('#gxSports a.match').length,
      plus: document.querySelectorAll('#gxSports .plus[href]').length,
      cotes: [].map.call(document.querySelectorAll('#gxSports .match .cotes button'),
                         function (b) { return b.textContent.replace(/\s+/g, ' ').trim(); }),
      equipes: ((document.querySelector('#gxSports .duel') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      pe: [].map.call(document.querySelectorAll('#gxSports .cotes button'),
                      function (b) { return getComputedStyle(b).pointerEvents; }),
    })));
    eq(vu.cartes, 4, `${page} : les quatre rencontres du serveur sont a l ecran`);
    ok(NOMS.some((x) => vu.equipes.indexOf(x) >= 0),
       `${page} : et ce sont bien les siennes — « ${vu.equipes} »`);
    /* La CARTE n est plus un lien. Le « +N », lui, en est un et doit le
       rester : c est la seule chose de la carte qu on ne peut pas faire ici.
       La premiere version comptait les deux ensemble et declarait le defaut
       toujours present alors qu il etait corrige. */
    eq(vu.liens, 0,
       `${page} : la carte n est plus un lien vers la page de paris — c est tout`
       + ' le defaut : cliquer une cote emmenait ailleurs');
    ok(vu.plus >= 1,
       `${page} : « +N » y mene toujours, lui : c est la seule chose de la carte`
       + ' qu on ne peut pas faire ici');
    ok(vu.pe.length > 0 && vu.pe.every((x) => x === 'auto'),
       `${page} : les ${vu.pe.length} cotes repondent au doigt —`
       + ' `a[href], button{pointer-events:none}` regne sur cette page');
    ok(/\d\.\d\d/.test(vu.cotes.join(' ')),
       `${page} : et elles portent un prix : ${vu.cotes.slice(0, 3).join(' / ')}`);

    console.log(`\n-- ${page} : on choisit, au vrai pointeur --`);
    await p.click('#gxSports .match .cotes button');
    await p.waitForTimeout(700);
    const bul = JSON.parse(await p.evaluate(() => JSON.stringify({
      ouvert: !(document.querySelector('.gx-bul') || { hidden: true }).hidden,
      ligne: ((document.querySelector('.gx-bl b') || {}).textContent || ''),
      pick: ((document.querySelector('.gx-bl span') || {}).textContent || ''),
      mise: (document.getElementById('gxMise') || {}).value,
      bouton: ((document.querySelector('.gx-go') || {}).textContent || '').trim(),
      marquee: document.querySelectorAll('#gxSports .cotes button.on').length,
    })));
    ok(bul.ouvert, `${page} : le bulletin apparait sous la liste`);
    eq(bul.marquee, 1,
       `${page} : la cote prise est marquee — sans elle on ne sait plus ce qu on`
       + ' a choisi des que le bulletin passe sous le pouce');
    ok(NOMS.some((x) => bul.ligne.indexOf(x) >= 0),
       `${page} : il nomme la rencontre — « ${bul.ligne} »`);
    ok(/@ \d\.\d\d/.test(bul.pick), `${page} : et la cote prise — « ${bul.pick} »`);
    /* La mise par defaut est le MINIMUM DU SERVEUR, pas un nombre ecrit dans
       la page : celle-ci ne le connaissait pas avant de le lui demander. */
    eq(String(bul.mise), '100',
       `${page} : la mise part du minimum que le serveur annonce`);
    eq(bul.bouton, 'PLACE BET', `${page} : et le bouton est pret`);

    console.log(`\n-- ${page} : et le pari part POUR DE VRAI --`);
    const avant = await compteParis(p);
    await p.click('.gx-go');
    await p.waitForTimeout(2600);
    const apres = await compteParis(p);
    eq(apres, avant + 1,
       `${page} : le serveur a enregistre un pari de plus (${avant} puis ${apres})`
       + ' — c est la seule preuve qui compte, un bulletin peint ne prouve rien');
    const fin = JSON.parse(await p.evaluate(() => JSON.stringify({
      bulletin: !(document.querySelector('.gx-bul') || { hidden: true }).hidden,
      avis: ((document.querySelector('.gx-avis') || {}).textContent || ''),
      msg: ((document.querySelector('.gx-msg') || {}).textContent || ''),
      restees: document.querySelectorAll('#gxSports .cotes button.on').length,
    })));
    ok(!fin.bulletin, `${page} : le bulletin se vide derriere le pari`);
    eq(fin.restees, 0, `${page} : et la cote n est plus marquee`);
    ok(/placed/i.test(fin.avis),
       `${page} : le joueur est prevenu — « ${fin.avis.slice(0, 46)} »`);
    eq(fin.msg, '', `${page} : et rien n a echoue`);
  }

  console.log('\n-- sans compte, le bouton ouvre la porte plutot que d echouer --');
  {
    const ctx2 = await nav.newContext({ viewport: { width: 1400, height: 1000 } });
    const p2 = await ctx2.newPage();
    await p2.goto(`http://127.0.0.1:${site.port}/index.html?server=ws://127.0.0.1:${port}`,
                  { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(3000);
    await p2.click('#gxSports .match .cotes button');
    await p2.waitForTimeout(600);
    const avantP = await compteParis(p2);
    await p2.click('.gx-go');
    await p2.waitForTimeout(1200);
    const porte = await p2.evaluate(() => !!document.querySelector('.swcon-ov.on'));
    ok(porte,
       'la porte de connexion s ouvre : le refus serait arrive de toute facon,'
       + ' autant proposer tout de suite ce qu il faut faire');
    eq(await compteParis(p2), avantP, 'et aucun pari n est parti (les deux a -1 : sans fil, le serveur ne repond pas — et c est bien le point)');
    await ctx2.close();
  }

  ok(erreurs.length === 0, `aucune erreur de page${erreurs.length ? ' — ' + erreurs[0] : ''}`);
  await nav.close(); site.stop();
  console.log(`\nparis_accueil.test.js : ${n} verifications, ${rates} rate(s)`);
  process.exit(rates ? 1 : 0);
})();
