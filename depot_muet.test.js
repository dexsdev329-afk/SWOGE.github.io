/* LE DEPOT QUI NE DISAIT RIEN — banc d'essai permanent.
 *
 * ---- ce qui s'est passe ----
 *
 * Un joueur connecte PAR E-MAIL, dans le navigateur interne de Telegram, a
 * signale que « Deposit and play » ne faisait RIEN : ni erreur, ni
 * confirmation, rien du tout. Ce n'etait pas un message peint derriere la
 * barre du bas (ca, c'etait la fois d'avant) : c'etait le portefeuille qui ne
 * repondait NI oui NI non.
 *
 * `SwogePrivy.restore()` ouvre une iframe cachee chez Privy et attend qu'elle
 * reponde. Quand cette iframe ne peut pas fonctionner — les navigateurs
 * embarques des applications cloisonnent le stockage des tiers — la promesse
 * ne se resout jamais et ne se rejette jamais. Or `.catch()` ne rattrape pas
 * une promesse qui ne finit pas : tout le depot vivait derriere un `.then()`
 * qui n'arrivait jamais, et le bouton restait grise et muet pour toujours.
 *
 * ---- ce que ce fichier verrouille ----
 *
 * 1. ON PARLE TOUT DE SUITE. Un message apparait dans la seconde qui suit le
 *    clic, avant toute attente — sinon le premier signe de vie dependrait de
 *    la reponse du portefeuille, c'est-a-dire de la chose qui peut ne jamais
 *    venir.
 * 2. ON NE SE TAIT JAMAIS ENTRE-TEMPS. Le message d'attente reste affiche
 *    jusqu'au denouement. Un mot puis huit secondes de silence, c'est le meme
 *    symptome un peu plus tard.
 * 3. ON FINIT TOUJOURS PAR CONCLURE. Meme si le portefeuille ne repond jamais,
 *    le bouton redevient cliquable et le joueur recoit une explication ET une
 *    sortie.
 * 4. UN PORTEFEUILLE QUI REPOND N'EST PAS PENALISE. Le garde-fou ne doit pas
 *    couper un portefeuille lent mais vivant.
 *
 * Il faut playwright et le depot du serveur a cote. Sans eux, on le dit et on
 * sort en succes : mieux vaut un essai saute qu'un rouge qu'on apprend a
 * ignorer.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('depot_muet.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('depot_muet.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

/* Un serveur de fichiers minuscule pour la page : on veut la VRAIE page, avec
   ses vrais scripts, pas une reconstitution. */
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

/* Le portefeuille de fabrication. `delai` en millisecondes, ou `null` pour un
   portefeuille qui ne repond JAMAIS — le cas du signalement. */
function fauxPrivy(delai) {
  const reponse = delai === null
    ? 'return new Promise(function () {});'
    : `return new Promise(function (r) { setTimeout(function () {
         window.__adr = '0x2222222222222222222222222222222222222222'; r(window.__adr); }, ${delai}); });`;
  return `window.SwogePrivy = {
    init: function () {},
    restore: function () { window.__restore = (window.__restore||0)+1; ${reponse} },
    getProvider: function () { return { request: function (q) {
      if (q.method === 'eth_chainId') return Promise.resolve('0x1237');
      if (q.method === 'net_version') return Promise.resolve('4663');
      if (q.method === 'eth_accounts') return Promise.resolve([window.__adr]);
      return Promise.reject(new Error('pas de chaine dans cet essai'));
    }, on: function () {}, removeListener: function () {} }; },
    getAddress: function () { return window.__adr || null; },
    isLoggedIn: function () { return !!window.__adr; },
    logout: function () {}, sendCode: function () { return Promise.resolve(); },
    verifyCode: function () { return Promise.resolve(null); }
  };`;
}

/* ---- L'IFRAME FROIDE, PUIS CHAUDE ----
 *
 * C'est la panne exacte, reproduite. `restore()` monte l'iframe du
 * portefeuille embarque, attend six cents millisecondes EN AVEUGLE, puis lui
 * parle. Sur un telephone l'iframe n'a pas fini de charger : la demande part
 * dans un document vide et la reponse n'arrive jamais.
 *
 * Mais l'iframe RESTE — le module la garde. Le deuxieme appel ne la remonte
 * pas, elle a eu le temps de charger, et elle repond. Ce faux portefeuille ne
 * fait rien d'autre : il ne repond JAMAIS la premiere fois, et tout de suite
 * la seconde. */
function fauxPrivyFroid() {
  return `window.SwogePrivy = {
    init: function () {},
    restore: function () {
      window.__restore = (window.__restore||0)+1;
      if (window.__restore === 1) return new Promise(function () {});
      window.__adr = '0x2222222222222222222222222222222222222222';
      return Promise.resolve(window.__adr);
    },
    getProvider: function () { return { request: function (q) {
      if (q.method === 'eth_chainId') return Promise.resolve('0x1237');
      if (q.method === 'net_version') return Promise.resolve('4663');
      if (q.method === 'eth_accounts') return Promise.resolve([window.__adr]);
      return Promise.reject(new Error('pas de chaine dans cet essai'));
    }, on: function () {}, removeListener: function () {} }; },
    getAddress: function () { return window.__adr || null; },
    isLoggedIn: function () { return !!window.__adr; },
    logout: function () {}, sendCode: function () { return Promise.resolve(); },
    verifyCode: function () { return Promise.resolve(null); }
  };`;
}

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/dmuet-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  /* Sans coffre, le depot s'arrete avant meme de chercher le portefeuille :
     l'essai ne verrait jamais le defaut qu'il traque. */
  process.env.VAULT_ADDRESS = '0x1111111111111111111111111111111111111111';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  await new Promise((r) => setTimeout(r, 1200));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* Un joueur, jusqu'au panneau de depot ouvert et le montant saisi. */
  /* `opts.mode` : 'email' (defaut) ou 'wallet'. `opts.app` : faux pour un
     navigateur ORDINAIRE — Safari, Chrome — au lieu du navigateur interne de
     Telegram. Les deux comptent : ils choisissent laquelle des trois causes
     `signataire()` doit nommer. */
  async function jusquAuDepot(privy, opts) {
    const o = opts || {};
    const p = await nav.newPage({ viewport: { width: 420, height: 880 } });
    await p.route('**/privy-swoge.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: privy }));
    await p.addInitScript(function (o) {
      window.__s = [];
      const N = window.WebSocket;
      function C(u, pr) { const s = (pr === undefined) ? new N(u) : new N(u, pr); s.__m = [];
        s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
        window.__s.push(s); return s; }
      C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
      window.WebSocket = C;
      try { localStorage.setItem('swogeAuth', o.mode || 'email'); } catch (e) {}
      /* Un jeton Privy dans le stockage, comme chez un joueur qui S'EST
         connecte par e-mail et dont seule la verification echoue. */
      /* Le jeton de RAFRAICHISSEMENT : c'est lui, et lui seul, qui rend une
         session reprenable. Un jeton d'acces sans lui n'est qu'un reste. */
      if (o.jeton) { try { localStorage.setItem('privy:refresh_token', 'x'); } catch (e) {} }
      /* Un reste : l'acces expire survit, mais rien ne peut le renouveler. */
      if (o.reste) { try { localStorage.setItem('privy:token', 'x'); } catch (e) {} }
      /* Ce que le module pose a son INITIALISATION, connecte ou non. Il ne
         doit JAMAIS compter pour une session : c'est le faux positif qui a
         fait annoncer un blocage a quelqu'un qui n'avait pas de session. */
      if (o.config) { try { localStorage.setItem('privy-app-id', 'x');
                            localStorage.setItem('privy-ca-id', 'x'); } catch (e) {} }
      /* Le navigateur interne de Telegram, sur Android. Absent quand on veut
         eprouver un Safari ou un Chrome ordinaire. */
      if (o.app !== false) window.TelegramWebviewProxy = { postEvent: function () {} };
    }, o);
    await p.goto(`http://127.0.0.1:${site.port}/games.html?server=ws://127.0.0.1:${port}`,
                 { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
    const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
    const w = ethers.Wallet.createRandom();
    const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
    const sig = await w.signMessage(msg);
    await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
    await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
    await p.waitForTimeout(1200);
    await p.evaluate(() => { document.querySelector('#menu a[data-panel="dep"]').click(); });
    await p.waitForTimeout(600);
    await p.evaluate(() => { document.getElementById('swcDAmt').value = '100'; });
    return p;
  }

  /* ---- ON APPUIE DANS LA PAGE, PAS AVEC LA SOURIS ----
   *
   * `p.click()` verifie d'abord que le point vise n'est couvert par rien.
   * Le panneau du compte defile dans son propre `.pscroll`, et sur un ecran
   * de 880 pixels le bouton tombe sous le pli : Playwright annonce alors que
   * `.pscroll` intercepte le clic et abandonne au bout de trente secondes.
   * Ce n'est pas ce que cet essai mesure — il mesure ce que le bouton REPOND
   * quand le portefeuille se tait — et le faire dependre du pli le rendait
   * rouge sans qu'aucun defaut ne soit en cause.
   * On amene donc l'element a l'ecran, puis on appuie. Le gestionnaire est
   * appele par le meme chemin qu'un vrai doigt ; seule la verification de
   * recouvrement saute, et elle appartient a un autre essai. */
  const appuie = (p, id) => p.evaluate((q) => {
    const b = document.getElementById(q);
    if (!b) throw new Error('bouton absent : ' + q);
    b.scrollIntoView({ block: 'center' });
    b.click();
  }, id);

  const lis = (p) => p.evaluate(() => {
    const m = document.querySelector('.swc-msg');
    const b = document.getElementById('swcDGo');
    const visible = m && getComputedStyle(m).opacity !== '0';
    return { texte: visible ? m.textContent.trim() : '', mort: !!(b && b.disabled),
             sortie: !!(m && visible && m.querySelector('button, a')) };
  });

  // ============ 1. LE PORTEFEUILLE QUI NE REPOND JAMAIS ============
  {
    console.log('\n-- le portefeuille ne repond jamais (le cas signale) --');
    const p = await jusquAuDepot(fauxPrivy(null));
    const t0 = Date.now();
    await appuie(p, 'swcDGo');

    await p.waitForTimeout(900);
    const tot = await lis(p);
    ok(tot.texte.length > 0, 'un message apparait dans la seconde qui suit le clic : ' + JSON.stringify(tot.texte));

    /* ON NE SE TAIT PAS. On echantillonne pendant toute l'attente : un seul
       silence suffit a faire croire que le bouton est casse. */
    let muets = 0, echantillons = 0;
    while (Date.now() - t0 < 11000) {
      await p.waitForTimeout(700);
      const e = await lis(p);
      echantillons++;
      if (!e.texte) muets++;
    }
    ok(muets === 0, `aucun silence pendant l attente (${muets} sur ${echantillons} relevés muets)`);

    /* ON CONCLUT. */
    let fin = null;
    for (let i = 0; i < 40 && !fin; i++) {
      await p.waitForTimeout(500);
      const e = await lis(p);
      if (!e.mort) fin = e;
    }
    ok(!!fin, 'le bouton redevient cliquable meme si le portefeuille ne repond jamais');
    if (fin) {
      ok(fin.texte.length > 0, 'et le joueur recoit une explication : ' + JSON.stringify(fin.texte.slice(0, 120)));
      ok(fin.sortie, 'avec une SORTIE a toucher, pas seulement un constat');
      ok(/wallet/i.test(fin.texte), 'qui parle bien du portefeuille');
      /* La phrase n'est pas coupee au milieu du conseil. */
      ok(!/\bsw$|\bswol$|\bswolee$/.test(fin.texte.trim()),
         'et elle n est pas tronquee au milieu du conseil');
    }
    await p.close();
  }

  // ============ 2. UN PORTEFEUILLE LENT MAIS VIVANT PASSE ============
  {
    console.log('\n-- un portefeuille lent (2 s) mais vivant --');
    const p = await jusquAuDepot(fauxPrivy(2000));
    await appuie(p, 'swcDGo');
    let fin = null;
    for (let i = 0; i < 30 && !fin; i++) {
      await p.waitForTimeout(400);
      const e = await lis(p);
      if (!e.mort && e.texte) fin = e;
    }
    ok(!!fin, 'le depot aboutit a une conclusion');
    if (fin) {
      /* Il ne doit PAS avoir ete arrete par le garde-fou : celui-la parle du
         portefeuille qui ne repond pas. Ici il a repondu — la suite echoue
         pour une autre raison (pas de chaine dans cet essai), et c'est bien
         la preuve qu'on est alle plus loin. */
      ok(!/did not answer/i.test(fin.texte),
         'le garde-fou ne coupe pas un portefeuille qui repond : ' + JSON.stringify(fin.texte.slice(0, 100)));
    }
    const appels = await p.evaluate(() => window.__restore || 0);
    ok(appels >= 1, 'le portefeuille a bien ete sollicite (' + appels + ' fois)');
    await p.close();
  }

  // ============ 5. LE MESSAGE NOMME CE QU'ON ALLAIT FAIRE ============
  {
    console.log('\n-- chaque bouton nomme son propre geste --');
    /* ---- LA PANNE ----
     * Le refus disait « sign in again to deposit » quel que soit le bouton
     * appuye. Un joueur qui essayait de RETIRER lisait donc qu'il fallait se
     * reconnecter pour deposer. Il a envoye la capture, et il avait raison de
     * trouver ca louche : un message qui parle d'autre chose que de ce qu'on
     * vient de faire fait douter du reste de la phrase, y compris de la partie
     * qui etait vraie.
     *
     * ---- ET POURQUOI CET ESSAI EST DEVENU STATIQUE ----
     * Il appuyait sur ENVOYER, la troisieme porte qui demandait une signature.
     * Cette porte a ete retiree — le jeu depose sur l'adresse du compte, il n'y
     * a pas de destinataire a choisir. Le reproduire par le clic demanderait
     * maintenant un bon signe par le serveur, ce qui deplacerait le sujet.
     * On lit donc la SOURCE : chaque appel a `signataire` doit nommer son
     * geste. C'est exactement le defaut — un appel qui oublie son nom retombe
     * sur le mot par defaut — et ca se verifie sans navigateur. */
    const src = fs.readFileSync(path.join(SITE, 'swogecompte.js'), 'utf8');
    /* On ne capture QUE le premier argument : le second est une fonction de
       reprise, avec ses propres parentheses, et un motif glouton s'y perdait.
       Et on ne lit que les APPELS : la declaration et les deux mentions dans
       les commentaires ne sont pas des appels, et les compter faisait crier
       cet essai sur du texte. */
    const appels = [...src.matchAll(/(?:^|[^`\w])signataire\(\s*([^,)]*)[,)]/gm)]
      .map((m) => m[1].trim())
      .filter((a) => a !== 'quoi' && a !== '');
    ok(appels.length >= 2, `il y a bien des appels a verifier (${appels.length})`);
    const muets = appels.filter((a) => !/^'[a-z]+'$/.test(a));
    ok(muets.length === 0,
       muets.length ? `${muets.length} appel(s) sans geste nomme : ${muets.join(', ')}`
                    : `les ${appels.length} appels nomment leur geste (${appels.join(', ')})`);
  }

  // ============ 6. « PAS DE PORTEFEUILLE » N'EST PAS « PAS DE REPONSE » ============
  {
    console.log('\n-- aucun portefeuille dans ce navigateur --');
    /* ---- LA PANNE, ET C EST LA PLUS FREQUENTE SUR TELEPHONE ----
     * Un joueur connecte PAR PORTEFEUILLE qui rouvre le site dans Safari ou
     * Chrome n a pas de portefeuille du tout : il n y a pas d extension sur
     * telephone, `window.ethereum` n existe pas, et rien n a ete demande a
     * personne. Lui dire « votre portefeuille n a pas repondu » l envoie
     * chercher une panne qui n existe pas — et le bouton « reconnectez-vous »
     * ne peut RIEN y changer, il retombera sur « No wallet found in this
     * browser ». C est exactement ce qui a ete rapporte : « je me suis
     * deconnecte et reconnecte, pareil ».
     * On ne monte AUCUN `window.ethereum` : c est tout le sujet. */
    const p = await jusquAuDepot(fauxPrivy(null), { mode: 'wallet', app: false });
    await appuie(p, 'swcDGo');
    let fin = null;
    for (let i = 0; i < 45 && !fin; i++) {
      await p.waitForTimeout(400);
      const e = await lis(p);
      if (!e.mort && e.texte) fin = e;
    }
    ok(!!fin, 'le depot finit par conclure');
    if (fin) {
      ok(/no wallet in this browser/i.test(fin.texte),
         `il dit qu il n y en a pas : ${JSON.stringify(fin.texte.slice(0, 110))}`);
      ok(!/did not answer/i.test(fin.texte),
         'et il n accuse pas un portefeuille de ne pas avoir repondu');
      ok(fin.sortie, 'et il donne quand meme une sortie');
    }
    await p.close();
  }

  // ============ 7. UNE SESSION PERIMEE N'EST PAS UN SILENCE ============
  {
    console.log('\n-- la session e-mail a expire --');
    /* ---- POURQUOI CETTE SECTION EXISTE ----
     * Trois echecs tres differents finissaient dans la meme phrase : « votre
     * portefeuille n'a pas repondu ». Celui-ci n'a RIEN a voir avec un
     * silence — `restore()` repond tout de suite, et il repond NON : il n'y a
     * plus de session dans ce navigateur.
     * C'est le seul cas ou se reconnecter est le bon geste, et c'etait
     * justement celui ou on envoyait le joueur chercher une panne. La
     * distinction n'est pas cosmetique : elle change ce qu'il doit faire.
     * `restore()` rend `null` SANS ATTENDRE — c'est ce qui separe ce cas du
     * premier, ou la promesse ne se resout jamais. */
    const p = await jusquAuDepot(`window.SwogePrivy = {
      init: function () {},
      restore: function () { window.__restore = (window.__restore||0)+1;
                             return Promise.resolve(null); },
      getProvider: function () { return null; },
      getAddress: function () { return null; },
      isLoggedIn: function () { return false; },
      logout: function () {}, sendCode: function () { return Promise.resolve(); },
      verifyCode: function () { return Promise.resolve(null); }
    };`, { app: false });
    const t7 = Date.now();
    await appuie(p, 'swcDGo');
    let fin = null;
    for (let i = 0; i < 60 && !fin; i++) {
      await p.waitForTimeout(400);
      const e = await lis(p);
      if (!e.mort && e.texte) fin = e;
    }
    const mis = Date.now() - t7;
    ok(!!fin, 'le depot aboutit a une conclusion');
    if (fin) {
      ok(/W-SESSION/.test(fin.texte),
         `il dit que la session ne peut pas etre reprise : ${JSON.stringify(fin.texte.slice(0, 90))}`);
      ok(!/did not answer/i.test(fin.texte),
         'et il n accuse pas un portefeuille de s etre tu — il a repondu, et il a dit non');
      /* Le geste doit etre NOMME, ou qu'il soit dans la phrase : les messages
         disent maintenant « your deposit resumes on its own » plutot que
         « sign in again to deposit ». Ce qui compte n'a jamais ete la
         tournure, c'est que le joueur lise le geste QU'IL vient de faire. */
      ok(/deposit/i.test(fin.texte), 'en nommant le geste qu on voulait faire');
      ok(fin.sortie, 'avec une sortie a toucher');
    }
    /* ET SANS FAIRE ATTENDRE. Un refus immediat annonce en douze secondes est
       douze secondes volees : le delai n'est la que pour ce qui se TAIT. */
    ok(mis < 6000, `sans attendre le delai du silence (${(mis / 1000).toFixed(1)} s)`);
    await p.close();
  }

  // ============ 8. UN JETON PRESENT N'EST PAS UNE SESSION ABSENTE ============
  {
    console.log('\n-- le jeton est la, mais rien ne peut le verifier --');
    /* ---- LE CAS RAPPORTE ----
     * Le joueur lit « votre connexion e-mail n'est plus valide, reconnectez-
     * vous » et se reconnecte : rien ne change. C'est logique si le jeton est
     * TOUJOURS LA et que c'est sa VERIFICATION qui echoue — un bloqueur, un
     * VPN, l'API de Privy injoignable. Se reconnecter passe par la meme API :
     * on l'envoyait se cogner au meme mur.
     * On ne peut pas distinguer les deux depuis `restore()`, qui avale ses
     * erreurs et rend `null` dans les deux cas. On regarde donc si un jeton
     * traine dans `localStorage`, ce qui est vrai dans un cas et faux dans
     * l'autre. */
    const p = await jusquAuDepot(`window.SwogePrivy = {
      init: function () {},
      restore: function () { return Promise.resolve(null); },
      getProvider: function () { return null; },
      getAddress: function () { return null; },
      isLoggedIn: function () { return false; },
      logout: function () {}, sendCode: function () { return Promise.resolve(); },
      verifyCode: function () { return Promise.resolve(null); }
    };`, { app: false, jeton: true });
    await appuie(p, 'swcDGo');
    let fin = null;
    for (let i = 0; i < 60 && !fin; i++) {
      await p.waitForTimeout(400);
      const e = await lis(p);
      if (!e.mort && e.texte) fin = e;
    }
    ok(!!fin, 'le depot aboutit a une conclusion');
    if (fin) {
      /* ZERO REQUETE. Le faux module ne parle a personne : aucune requete ne
         part chez Privy, et c'est exactement ce que le compteur doit voir. Le
         message doit donc dire que la panne est CHEZ NOUS et non accuser le
         reseau du joueur — c'est la lecon des trois messages precedents, qui
         l'ont tous envoye chercher au mauvais endroit. */
      /* Une session REPRENABLE, et pourtant aucune requete. Ce cas-la n'a pas
         d'explication simple : le message doit le dire sans en inventer une —
         c'est exactement l'erreur que j'ai commise trois fois de suite. */
      /* Le message doit MENER AU BOUTON, pas constater une impasse. Un joueur
         qui lit « nous ne savons pas pourquoi » ne cherche pas la reparation
         qui se trouve juste dessous — c'est ce qui vient d'arriver. */
      ok(/needs unlocking/i.test(fin.texte) && /Tap Unlock below/i.test(fin.texte),
         `il mene au bouton : ${JSON.stringify(fin.texte.slice(0, 110))}`);
      ok(!/Reload the page/i.test(fin.texte),
         'et il ne conseille PLUS de recharger — c est ce qui casse la session');
      ok(/W-QUIET/.test(fin.texte), 'avec un code a nous citer');
      ok(!/content blocker|VPN/i.test(fin.texte),
         'et il n accuse toujours aucun bloqueur');
    }
    await p.close();
  }

  // ============ 9. UNE CLE DE CONFIGURATION N'EST PAS UNE SESSION ============
  {
    console.log('\n-- Privy a ete charge, mais on ne s est jamais connecte --');
    /* `privy-app-id` et `privy-ca-id` sont poses des que le module
       s'initialise, sur toute page qui l'a charge. Les compter pour une
       session faisait annoncer « quelque chose bloque votre connexion » a
       quelqu'un qui n'en avait tout simplement pas. Le bon conseil ici est
       « reconnectez-vous », et c'est le seul qui marche. */
    const p = await jusquAuDepot(`window.SwogePrivy = {
      init: function () {},
      restore: function () { return Promise.resolve(null); },
      getProvider: function () { return null; },
      getAddress: function () { return null; },
      isLoggedIn: function () { return false; },
      logout: function () {}, sendCode: function () { return Promise.resolve(); },
      verifyCode: function () { return Promise.resolve(null); }
    };`, { app: false, config: true, reste: true });
    await appuie(p, 'swcDGo');
    let fin = null;
    for (let i = 0; i < 60 && !fin; i++) {
      await p.waitForTimeout(400);
      const e = await lis(p);
      if (!e.mort && e.texte) fin = e;
    }
    ok(!!fin, 'le depot aboutit a une conclusion');
    if (fin) {
      ok(/W-SESSION/.test(fin.texte),
         `il conseille de se reconnecter : ${JSON.stringify(fin.texte.slice(0, 90))}`);
      ok(!/blocking|we do not know/i.test(fin.texte),
         'et il n accuse AUCUN blocage, et n avoue aucune ignorance : le cas est clair');
    }
    await p.close();
  }

  // ============ 10. LE MODULE N'A PAS PU DEMARRER ============
  {
    console.log('\n-- l initialisation du portefeuille jette --');
    /* ---- LE CAS LE PLUS SOURNOIS DES CINQ ----
     * `init` etait enveloppe dans un `try` vide, et le chargeur sortait des
     * que `window.SwogePrivy` existait — donc sans jamais rejouer
     * l'initialisation. Si elle jette une fois, le client reste indefini a
     * l'interieur du module pour toute la session : `restore()` rend `null`
     * SANS une requete ni une ligne de console, et se reconnecter n'y change
     * rien puisque le tiroir sort par le meme raccourci.
     * C'est chez NOUS, pas chez le joueur : lui faire couper un bloqueur de
     * contenu serait lui faire perdre son temps sur notre panne. */
    const p = await jusquAuDepot(`window.SwogePrivy = {
      init: function () { throw new Error('demarrage impossible'); },
      restore: function () { return Promise.resolve(null); },
      getProvider: function () { return null; },
      getAddress: function () { return null; },
      isLoggedIn: function () { return false; },
      logout: function () {}, sendCode: function () { return Promise.resolve(); },
      verifyCode: function () { return Promise.resolve(null); }
    };`, { app: false, jeton: true });
    await appuie(p, 'swcDGo');
    let fin = null;
    for (let i = 0; i < 60 && !fin; i++) {
      await p.waitForTimeout(400);
      const e = await lis(p);
      if (!e.mort && e.texte) fin = e;
    }
    ok(!!fin, 'le depot aboutit a une conclusion');
    if (fin) {
      ok(/W-BOOT/.test(fin.texte),
         `il dit que la panne est chez nous : ${JSON.stringify(fin.texte.slice(0, 100))}`);
      ok(!/content blocker|VPN/i.test(fin.texte),
         'et il n envoie PAS couper un bloqueur pour une panne qui n est pas la sienne');
    }
    await p.close();
  }

  // ============ 11. LE DEVERROUILLAGE SUR PLACE, ET IL REPREND L'ACTION ============
  {
    console.log('\n-- le portefeuille se deverrouille sans recharger --');
    /* ---- CE QUE CE CAS PROTEGE ----
     * Le SDK ne renouvelle une session que s'il tient DEUX jetons ; sinon il
     * journalise « missing tokens, skipping request » et renonce sans
     * contacter personne. La connexion par e-mail, elle, marche toujours —
     * mais le tiroir recharge la page juste apres, et le portefeuille vivant
     * part avec la memoire. Le joueur se reconnectait correctement a chaque
     * fois ; le rechargement jetait le resultat a chaque fois.
     *
     * Le deverrouillage refait le seul geste qui marche — code par e-mail —
     * SANS RECHARGER, puis REPREND l'action. Les deux moities comptent : sans
     * la reprise, le joueur deverrouille et doit tout resaisir, au moment ou
     * il a deja essaye cinq fois. */
    let repris = 0;
    const p = await jusquAuDepot(`window.__code = 0;
    window.SwogePrivy = {
      init: function () {},
      restore: function () { return Promise.resolve(null); },
      sendCode: function () { window.__code++; return Promise.resolve(); },
      verifyCode: function () {
        window.__adr = '0x3333333333333333333333333333333333333333';
        return Promise.resolve(window.__adr);
      },
      getProvider: function () { return { request: function (q) {
        if (q.method === 'eth_chainId') return Promise.resolve('0x1237');
        if (q.method === 'net_version') return Promise.resolve('4663');
        if (q.method === 'eth_accounts') return Promise.resolve([window.__adr]);
        return Promise.reject(new Error('pas de chaine dans cet essai'));
      }, on: function () {}, removeListener: function () {} }; },
      getAddress: function () { return window.__adr || null; },
      isLoggedIn: function () { return !!window.__adr; },
      logout: function () {}
    };`, { app: false, jeton: true });

    await appuie(p, 'swcDGo');
    let vu = null;
    for (let i = 0; i < 60 && !vu; i++) {
      await p.waitForTimeout(400);
      const e = await lis(p);
      if (!e.mort && e.texte) vu = e;
    }
    ok(!!vu && vu.sortie, 'le refus propose une sortie a toucher');
    const libelle = await p.evaluate(() => {
      const b = document.querySelector('.swc-msg button, .swc-msg a');
      return b ? b.textContent.trim() : '';
    });
    ok(/unlock/i.test(libelle), `et cette sortie DEVERROUILLE (${JSON.stringify(libelle)})`);

    /* On la touche : le formulaire doit apparaitre SANS que la page recharge. */
    const avant = await p.evaluate(() => performance.now());
    await p.evaluate(() => { document.querySelector('.swc-msg button').click(); });
    await p.waitForTimeout(500);
    const form = await p.evaluate(() => ({
      champs: document.querySelectorAll('.swc-msg input').length,
      bouton: (document.querySelector('.swc-msg button') || {}).textContent || '',
      horloge: performance.now(),
    }));
    ok(form.champs >= 1, `un formulaire s ouvre sur place (${form.champs} champ(s))`);
    ok(form.horloge > avant, 'et la page n a PAS recharge — c est tout le point');

    /* Le code, puis le deverrouillage : l'action doit REPARTIR toute seule. */
    await p.evaluate(() => {
      document.querySelector('.swc-msg input[type=email]').value = 'a@b.co';
      document.querySelector('.swc-msg button').click();
    });
    await p.waitForTimeout(700);
    const envoye = await p.evaluate(() => window.__code || 0);
    ok(envoye >= 1, `le code est demande (${envoye})`);
    await p.evaluate(() => {
      const i = document.querySelectorAll('.swc-msg input');
      i[1].value = '123456';
      document.querySelector('.swc-msg button').click();
    });
    let fin = null;
    for (let i = 0; i < 40 && !fin; i++) {
      await p.waitForTimeout(400);
      const e = await lis(p);
      if (!e.mort && e.texte && !/Unlock/i.test(e.texte)) fin = e;
    }
    ok(!!fin, 'l action reprend toute seule apres le deverrouillage');
    if (fin) {
      ok(!/did not respond|could not be verified|cannot be resumed/i.test(fin.texte),
         `et elle ne retombe pas sur le meme refus : ${JSON.stringify(fin.texte.slice(0, 80))}`);
    }
    await p.close();
  }

  // ============ 12. LA SORTIE ATTEND LE JOUEUR, ELLE NE S'EFFACE PAS ============
  {
    console.log('\n-- le bouton de deverrouillage survit a la minuterie --');
    /* ---- CE QUE CE CAS PROTEGE ----
     * « le bouton unlock my wallet fonctionne pas ». Il fonctionnait. Le
     * bandeau qui le portait s'effacait tout seul au bout de onze secondes —
     * assez pour lire la phrase, pas pour lire PUIS decider PUIS viser sur un
     * telephone. Et quand le doigt arrivait juste avant l'echeance, la
     * minuterie posee AVANT le geste effacait le formulaire qui venait de
     * s'ouvrir : le joueur voyait deux champs disparaitre sous ses yeux.
     * Les deux moities sont ici. On attend PLUS LONGTEMPS que la minuterie,
     * deux fois, et rien ne doit bouger : une reparation attend celui qui doit
     * la faire, aussi longtemps qu'il lui faut. */
    const p = await jusquAuDepot(`window.__code = 0;
    window.SwogePrivy = {
      init: function () {},
      restore: function () { return Promise.resolve(null); },
      sendCode: function () { window.__code++; return Promise.resolve(); },
      verifyCode: function () { return Promise.resolve(null); },
      getProvider: function () { return null; },
      getAddress: function () { return null; },
      isLoggedIn: function () { return false; },
      logout: function () {}
    };`, { app: false, jeton: true });

    await appuie(p, 'swcDGo');
    let vu = null;
    for (let i = 0; i < 60 && !vu; i++) {
      await p.waitForTimeout(400);
      const e = await lis(p);
      if (!e.mort && e.texte) vu = e;
    }
    ok(!!vu && vu.sortie, 'le refus propose bien une sortie a toucher');

    /* Onze secondes, plus une marge : la minuterie a eu tout le temps de
       partir. Le bouton doit encore etre la, et encore visible. */
    await p.waitForTimeout(13000);
    const tard = await p.evaluate(() => {
      const m = document.querySelector('.swc-msg');
      const b = m && m.querySelector('button, a');
      return { visible: !!(m && getComputedStyle(m).opacity !== '0'),
               libelle: b ? b.textContent.trim() : '',
               touchable: !!(m && getComputedStyle(m).pointerEvents !== 'none') };
    });
    ok(tard.visible, 'treize secondes plus tard le message est TOUJOURS la');
    ok(/unlock/i.test(tard.libelle),
       `et son bouton aussi (${JSON.stringify(tard.libelle)})`);
    ok(tard.touchable, 'et il se laisse encore toucher');

    /* On appuie maintenant, comme un joueur qui a pris son temps. */
    await p.evaluate(() => { document.querySelector('.swc-msg button').click(); });
    await p.waitForTimeout(500);
    const ouvert = await p.evaluate(() => document.querySelectorAll('.swc-msg input').length);
    ok(ouvert >= 1, `le formulaire s ouvre apres l attente (${ouvert} champ(s))`);

    /* Et il ne doit pas disparaitre a son tour : la minuterie du message
       precedent, si elle survivait, tomberait dans ces secondes-ci. */
    await p.waitForTimeout(13000);
    const reste = await p.evaluate(() => {
      const m = document.querySelector('.swc-msg');
      return { champs: m ? m.querySelectorAll('input').length : 0,
               visible: !!(m && getComputedStyle(m).opacity !== '0') };
    });
    ok(reste.champs >= 1 && reste.visible,
       `et il tient le temps qu on le remplisse (${reste.champs} champ(s), visible ${reste.visible})`);
    await p.close();
  }

  await nav.close(); site.stop();
  console.log(rates ? `\ndepot_muet.test.js : ${rates} essai(s) rate(s) sur ${n}\n`
                    : `\ndepot_muet.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
