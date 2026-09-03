/*
 * CHAQUE RANGEE DU TIROIR OUVRE QUELQUE CHOSE, SUR LES TROIS PAGES.
 *
 * ---- CE QUI ETAIT DEMANDE ----
 *
 * « Verifie que ca ouvre les bons panneaux sur game html, index html et swoge
 *   html », suivi de la liste entiere du tiroir : Home, My Wallet, Staking,
 *   Deposit, Withdraw, Daily Quests, Chests & items, Collection ranking,
 *   Player market, Character skins, Pets & eggs, Overview, History, Open bets,
 *   Settled bets, Friends, Invite, Leaderboard, Sign out.
 *
 * ---- CE QUE CET ESSAI TIENT ----
 *
 * Deux choses, et la premiere compte plus que la seconde.
 *
 * 1. AUCUNE RANGEE NE FAIT RIEN. C est le defaut qu on ne voit pas : un menu
 *    de vingt lignes dont trois sont mortes a l air parfaitement sain, et
 *    celui qui tombe dessus croit que le site est casse, pas que cette
 *    ligne-la l est. On clique donc les vingt, une par une, et l on compare
 *    l ecran AVANT et APRES.
 *
 * 2. CELLES QUI NOMMENT UN PANNEAU OUVRENT CE PANNEAU-LA. « Deposit » qui
 *    ouvrirait le retrait serait pire que « Deposit » qui n ouvre rien.
 *
 * ---- ET LES CLICS SONT DE VRAIS CLICS ----
 *
 * Deux des trois pages portent `a[href], button{ pointer-events:none }` : un
 * `.click()` lance par script IGNORE cette regle et validerait des rangees que
 * personne ne peut presser. Ce piege s est referme sept fois sur ce depot.
 *
 * Le tiroir n existe qu une fois le joueur authentifie : d ou le serveur
 * d essai, la signature, et le jeton repose dans le stockage local — comme un
 * joueur qui change de page.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('panneaux_tiroir.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('panneaux_tiroir.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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

  /* ---- CE QUE L ON APPELLE « L ECRAN » ----
   * La boite de page ouverte, la vue du tiroir, et le titre de la section :
   * les trois endroits ou une rangee peut aboutir. Deux etats identiques
   * veulent dire que rien n a bouge. */
  const ecran = () => p.evaluate(() => ({
    boite: [...document.querySelectorAll('.box.show')].map((b) => b.id).join(','),
    voile: !!document.querySelector('#ovl.show'),
    detail: !!document.querySelector('.swp.detail'),
    titre: ((document.querySelector('.swp-back') || {}).textContent || '').trim().slice(0, 40),
    liste: ((document.querySelector('.swp-l') || {}).textContent || '').trim().slice(0, 60),
    /* Le libelle du menu fait partie de l ecran : « Sound: on » qui devient
       « Sound: off » EST l effet de la rangee, et rien d autre ne bouge. */
    menu: [...document.querySelectorAll('#gxMenu a')].map((a) => a.textContent.trim()).join('|'),
    adresse: location.pathname,
  }));

  /* Ce que chaque rangee DOIT ouvrir, quand son nom le promet. Les autres
     n ont pas de panneau nomme : on exige seulement qu elles fassent quelque
     chose. */
  /* ---- ON REGARDE LA BOITE, PAS LE TITRE ----
   * La premiere version acceptait le TITRE comme preuve : « My Wallet » dans
   * la barre suffisait. Elle a donc declare les trois pages saines pendant que
   * l accueil montrait le profil sous CHAQUE titre — le defaut exact que
   * l utilisateur a filme ensuite. Un titre est ce que la page AFFIRME ; la
   * boite ouverte est ce qu elle FAIT. */
  const PROMESSES = {
    'My Wallet': 'box-wallet',
    'Staking': 'box-stake',
    'Deposit': 'box-dep',
    'Withdraw': 'box-wd',
    'Daily Quests': 'box-quests',
  };

  const PAGES = ['games.html', 'index.html', 'swogebet.html'];
  for (const page of PAGES) {
    console.log(`\n-- ${page} --`);
    await p.goto(`http://127.0.0.1:${site.port}/${page}?server=ws://127.0.0.1:${port}`,
                 { waitUntil: 'domcontentloaded' });
    /* Le tiroir n existe que si la page porte une barre ou l accrocher. */
    const poignee = await p.waitForSelector('.swpb', { state: 'attached', timeout: 20000 })
      .then(() => true, () => false);
    ok(poignee, `${page} : le tiroir s accroche a la page`);
    if (!poignee) continue;
    await p.waitForTimeout(1600);
    await p.evaluate(() => { const l = document.getElementById('preloader'); if (l) l.style.display = 'none'; });

    /* ---- ON PASSE PAR LA OU PASSE LE JOUEUR ----
     * La poignee du tiroir est CACHEE sur ces pages — le bouton de profil de
     * l en-tete la remplace, et c est lui qu on clique. Forcer la poignee
     * visible pour l essai reviendrait a verifier un chemin que personne ne
     * prend. Le menu du profil montre les memes rangees que le tiroir : c est
     * `swogeprofil.js` qui les y recopie, depuis le tiroir lui-meme. */
    await p.click('#gxProfil');
    await p.waitForTimeout(700);
    const rangees = await p.evaluate(() => [...document.querySelectorAll('#gxMenu a')]
      .map((a, i) => ({ i: i, t: (a.textContent || '').trim() })));
    ok(rangees.length >= 10, `${page} : le menu du profil porte ${rangees.length} rangees`);
    /* La rangee « Wallet » n y est PLUS, et c est voulu : « faudrait le
       retirer de toutes les pages, on est cense l ouvrir depuis le petit
       bouton rond en bas ». Le rond `.swwb` est le seul chemin. */
    ok(!rangees.some((r) => /Wallet/i.test(r.t)) && rangees.some((r) => /Leaderboard/i.test(r.t)),
       `${page} : le classement y est, et aucune rangee « Wallet » — le portefeuille s ouvre par le rond en bas`);

    const muettes = [], trahies = [];
    for (const r of rangees) {
      /* ---- ON REPART D UNE PAGE NEUVE A CHAQUE RANGEE ----
       * La premiere version remettait l ecran d aplomb en retirant les classes
       * `.on` et `.show` a la main. C etait plus rapide, et c etait faux : le
       * tiroir garde SA propre idee d etre ouvert ou ferme, et le fermer dans
       * son dos laissait le bouton de profil convaincu qu il etait deja
       * ouvert. Dix-sept rangees etaient alors declarees mortes sur l accueil,
       * alors qu aucune ne l etait — l essai s etait casse lui-meme au premier
       * clic. Recharger coute deux secondes par rangee et ne ment pas. */
      await p.goto(`http://127.0.0.1:${site.port}/${page}?server=ws://127.0.0.1:${port}`,
                   { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.swpb', { state: 'attached', timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(1500);
      await p.evaluate(() => { const l = document.getElementById('preloader'); if (l) l.style.display = 'none'; });
      const avant = await ecran();
      await p.click('#gxProfil');
      await p.waitForTimeout(350);
      /* ---- ON CLIQUE LA RANGEE PAR SON TEXTE, PAS PAR SON RANG ----
       * Le menu est REPEINT a chaque ouverture, et sa liste peut gagner ou
       * perdre une rangee entre deux — une rangee que la page cache, un
       * chargement qui arrive. La premiere version de cet essai visait le
       * n-ieme lien : elle a rapporte que « My Wallet » ouvrait le staking, et
       * « Staking » le depot, sur toute la longueur du menu. Ce n etait pas la
       * page qui se trompait de panneau, c etait l essai qui se trompait de
       * rangee — un decalage d un cran. Un essai qui accuse a tort coute plus
       * cher qu un essai absent : on va chercher la ligne par ce qu elle DIT,
       * comme le ferait celui qui la lit. */
      /* ---- ET PAR TOUT CE QU ELLE DIT, PAS PAR UN MORCEAU ----
       * La version d avant retirait l emoji (`replace(/^\S+/, '')`) et
       * cherchait le reste comme SOUS-CHAINE. Les rangees ne mettent pas
       * d espace apres leur emoji : « 👛My Wallet » perdait donc « 👛My » en
       * entier et ne cherchait plus que « Wallet ». Le jour ou une seconde
       * rangee a porte ce mot — « 🪙SWOGE Wallet », le portefeuille de chaine
       * ajoute au menu de toutes les pages — `.first()` a pris l autre, et
       * l essai a rapporte que « My Wallet » changeait de page. C etait vrai :
       * ce n etait pas la rangee qu il croyait cliquer.
       * On retrouve donc la rangee par son texte ENTIER, celui-la meme qu on a
       * releve, et l on dit franchement quand elle a disparu entre-temps. */
      let clique = true;
      try {
        const rang = await p.evaluate((txt) => [...document.querySelectorAll('#gxMenu a')]
          .findIndex((a) => (a.textContent || '').trim() === txt), r.t);
        if (rang < 0) throw new Error('rangee introuvable : ' + r.t);
        const cible = p.locator('#gxMenu a').nth(rang);
        await cible.scrollIntoViewIfNeeded({ timeout: 3000 });
        await cible.click({ timeout: 4000 });
      } catch (e) { clique = false; }
      await p.waitForTimeout(750);
      const apres = await ecran();
      const bouge = JSON.stringify(avant) !== JSON.stringify(apres);
      if (!clique) { muettes.push(r.t + ' (clic refuse)'); continue; }
      /* « Home », « Other games » et « SWOGE Wallet » MENENT ailleurs : c est
         leur travail, et l on revient. Le portefeuille de chaine est une PAGE,
         pas un panneau — « My Wallet » montre le solde du compte sur place,
         celui-ci ouvre l ecran ou l on envoie, echange et recoit. Tout le
         reste doit ouvrir quelque chose SUR PLACE. */
      if (apres.adresse !== avant.adresse) {
        if (!/home|other games|accueil|swoge wallet/i.test(r.t)) {
          muettes.push(`${r.t} (a change de page : ${apres.adresse})`);
        }
        continue;
      }
      if (!bouge) { muettes.push(r.t); continue; }
      const attendu = Object.keys(PROMESSES).find((nom) => r.t.indexOf(nom) >= 0);
      if (attendu) {
        const boites = String(apres.boite || '').split(',').filter(Boolean);
        if (boites.indexOf(PROMESSES[attendu]) < 0) {
          trahies.push(`${r.t} -> ${boites.join(',') || 'aucune boite'}`
                       + ` (attendu ${PROMESSES[attendu]})`);
        }
      }
    }
    /* ---- ET LES RANGEES DU TIROIR LUI-MEME REPONDENT AU DOIGT ----
     * Tout ce qui precede passe par le menu de l en-tete, qui clique la rangee
     * PAR SCRIPT — et un clic de script ignore `pointer-events`. Une fois le
     * tiroir ouvert, le joueur clique ses rangees pour de vrai : elles etaient
     * mortes sur l accueil, parce que la garde de ce fichier vivait dans la
     * feuille de la porte de connexion, posee seulement quand cette porte se
     * construit. Quelqu un de deja connecte ne la voyait jamais se construire.
     * On mesure donc la rangee elle-meme, et l on en presse une pour de vrai. */
    const auDoigt = await p.evaluate(() => {
      const b = document.querySelector('.swp .swp-t button');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const dessus = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { pe: getComputedStyle(b).pointerEvents,
               /* DANS le bouton, et non a cote : un `<span>` interieur recoit
                  le clic et le laisse remonter, ce qui est le cas normal. Ce
                  qu on refuse, c est que la LISTE derriere l attrape. */
               dedans: !!(dessus && b.contains(dessus)),
               dessus: dessus ? (dessus.tagName + '.' + (dessus.className || '')) : null };
    });
    ok(!!auDoigt && auDoigt.pe === 'auto',
       `${page} : les rangees du tiroir repondent au doigt (${auDoigt && auDoigt.pe})`);
    ok(!!auDoigt && auDoigt.dedans,
       `${page} : et le clic tombe DANS la rangee, pas sur la liste derriere`
       + ` elle (${auDoigt && auDoigt.dessus})`);
    let presse = true;
    try { await p.click('.swp .swp-t button', { timeout: 4000 }); }
    catch (e) { presse = false; }
    await p.waitForTimeout(500);
    ok(presse, `${page} : et une rangee du tiroir se presse pour de vrai`);

    ok(muettes.length === 0,
       muettes.length
         ? `${page} : ${muettes.length} rangee(s) sans effet — ${muettes.join(' ; ')}`
         : `${page} : les ${rangees.length} rangees font toutes quelque chose`);
    ok(trahies.length === 0,
       trahies.length
         ? `${page} : ${trahies.length} rangee(s) ouvrent autre chose que ce qu elles nomment — ${trahies.join(' ; ')}`
         : `${page} : celles qui nomment un panneau ouvrent CE panneau`);
  }

  ok(erreurs.length === 0, `aucune erreur de page${erreurs.length ? ' — ' + erreurs.slice(0, 2).join(' / ') : ''}`);
  await nav.close(); site.stop();
  console.log(`\npanneaux_tiroir.test.js : ${n} verifications, ${rates} rate(s)`);
  process.exit(rates ? 1 : 0);
})();
