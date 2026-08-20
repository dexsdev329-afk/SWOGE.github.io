/* LES SACS DE BUTIN, VUS DE LA PAGE — banc d'essai permanent.
 *
 * Le serveur decide de tout : ce qui tombe, ou, combien de temps, et qui peut
 * le prendre. Trois choses restent a la page, et ce sont les trois qui se
 * cassent en silence :
 *
 * 1. LE SAC EST DESSINE, ET DE LA BONNE COULEUR. Le serveur envoie un NOM
 *    (« bleu »), la planche a six colonnes. Une traduction fausse donnerait un
 *    sac brun sur une potion de stat : le joueur passerait a cote de la seule
 *    chose rare du jeu en croyant voir du consommable.
 * 2. ON RAMASSE EN MARCHANT DESSUS. Sans touche a apprendre — donc sans rien
 *    a l'ecran qui rappelle qu'elle existe.
 * 3. UN REFUS NE SE REPETE PAS. Rester sur un sac qu'on ne peut pas prendre
 *    enverrait dix demandes par seconde et ferait clignoter le message sans
 *    fin.
 *
 * Comme partout ici : on ne lit aucune variable — elles vivent dans une
 * fermeture. On enregistre ce qui est PEINT et ce qui est ENVOYE.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('butin_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('butin_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/mtaille-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  /* Le robinet de developpement, celui que le serveur refuse d'ouvrir des
     qu'un coffre ou un signataire existe. On ne fabrique donc pas un solde a
     la main dans l'etat : on prend le chemin que le serveur autorise. */
  process.env.DEV_FAUCET = '1';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const monde = require(path.join(SERVEUR, 'monde'));
  await new Promise((r) => setTimeout(r, 1200));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await nav.newPage({ viewport: { width: 1280, height: 800 } });

  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) { const s = (pr === undefined) ? new N(u) : new N(u, pr); s.__m = [];
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      /* Ce qui SORT compte autant que ce qui entre : « la page a-t-elle
         demande a ramasser ? » ne se lit nulle part ailleurs. */
      s.__out = [];
      const env = s.send.bind(s);
      s.send = function (d) { try { s.__out.push(JSON.parse(d)); } catch (x) {} return env(d); };
      window.__s.push(s); return s; }
    C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
    window.WebSocket = C;

    /* ---- LE MOUCHARD ----
     * On veut les nombres REELLEMENT passes au canevas, pas ceux qu'on croit
     * avoir calcules. On enregistre donc la forme a neuf arguments — la seule
     * qui decoupe dans un atlas — avec le nom du fichier source. */
    window.__peint = [];
    const D = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img) {
      if (arguments.length === 9) {
        const src = (img && (img.currentSrc || img.src)) || '';
        window.__peint.push({ src: String(src).split('/').pop().split('?')[0],
                              sx: arguments[1], sy: arguments[2], sw: arguments[3], sh: arguments[4],
                              dw: arguments[7], dh: arguments[8] });
        if (window.__peint.length > 4000) window.__peint.splice(0, 2000);
      }
      return D.apply(this, arguments);
    };
  });

  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));

  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const w = ethers.Wallet.createRandom();
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(2000);

  /* ---- UN PERSONNAGE, ACHETE POUR DE BON ----
     Sans personnage le serveur refuse l'entree — et il a raison : on n'entre
     pas dans le monde en spectateur. On passe donc par le vrai achat, avec
     du vrai solde, plutot que d'ecrire un skin dans l'etat par la fenetre. */
  await p.evaluate(async () => {
    const s = window.__s[0];
    for (let i = 0; i < 16; i++) { s.send(JSON.stringify({ type: 'devCredit' })); await new Promise((r) => setTimeout(r, 60)); }
    await new Promise((r) => setTimeout(r, 400));
    s.send(JSON.stringify({ type: 'skinBuy', id: 'andy' }));
  });
  await p.waitForTimeout(1500);
  const perso = await p.evaluate(() => {
    const m = window.__s[0].__m.filter((x) => x.type === 'skins').pop();
    return { actif: m && m.actif, err: m && m.error };
  });
  console.log('\n-- le personnage --');
  console.log('   ' + JSON.stringify(perso));
  ok(perso.actif === 'andy', 'le personnage est achete et porte' + (perso.err ? ' (erreur: ' + perso.err + ')' : ''));

  /* On entre dans le monde par le MEME message que le portail : c'est le
     serveur qui accepte ou refuse, exactement comme en jeu. */
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForTimeout(1500);
  const entre = await p.evaluate(() => {
    const s = window.__s[0];
    const e = s.__m.filter((m) => m.type === 'realmEntre').pop();
    const r = s.__m.filter((m) => m.type === 'realmRefus').pop();
    return { entre: !!e, refus: r ? r.raison : null,
             especes: e ? Object.keys(e.especes || {}).length : 0 };
  });
  console.log('\n-- entree dans le monde --');
  console.log('   ' + JSON.stringify(entre));
  ok(entre.entre, 'on entre dans le monde de combat' + (entre.refus ? ' (refus: ' + entre.refus + ')' : ''));
  ok(entre.especes >= 11, `le serveur envoie les ${entre.especes} especes, rayon compris`);


  /* ---- ON POSE DEUX SACS, ET ON REGARDE ----
   * Meme methode que pour les creatures : on injecte l'etat du monde que le
   * serveur envoie dix fois par seconde. Le vrai serveur continue d'envoyer le
   * sien — on n'ajoute qu'a cote. */
  const moi = await p.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
    return { x: e.moi.x, y: e.moi.y, rayon: e.sac && e.sac.rayon, duree: e.sac && e.sac.duree };
  });
  console.log('\n-- la regle des sacs, recue a l entree --');
  console.log('   ' + JSON.stringify(moi));
  ok(moi.rayon > 0, `le serveur annonce le rayon de ramassage (${moi.rayon})`);
  ok(moi.duree === 60, `et la duree d un sac (${moi.duree} s)`);

  /* Les deux sacs sont poses LOIN : on veut d'abord les voir sans les
     ramasser, sinon le serveur les reprend avant qu'on ait compte un dessin. */
  await p.evaluate(async ([x, y, r]) => {
    const s = window.__s[0];
    window.__sacs = [
      { i: 80001, x: x + r * 4, y: y - r * 4, s: 'bleu', st: 'att', r: 55 },
      { i: 80002, x: x - r * 4, y: y - r * 4, s: 'brun', po: 'vie', r: 55 },
      { i: 80003, x: x + r * 4, y: y + r * 4, s: 'blanc', r: 55 },
    ];
    window.__pousse = () => s.dispatchEvent(new MessageEvent('message', {
      data: JSON.stringify({ type: 'realmEtat', monstres: [], tirs: [], tirsM: [],
                             tombes: [], joueurs: [], sacs: window.__sacs }),
    }));
    /* Le VRAI serveur envoie son etat dix fois par seconde, et il n'a pas nos
       sacs : sans reinjection continue, il efface l'injection entre le moment
       ou l'on pose le sac et celui ou l'on mesure. On tient donc le rythme
       au-dessus du sien. */
    window.__tenir = setInterval(window.__pousse, 50);
    for (let k = 0; k < 40; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
  }, [moi.x, moi.y, moi.rayon]);
  await p.waitForTimeout(200);

  const sacsPeints = await p.evaluate(() => {
    const out = {};
    for (const d of window.__peint) {
      if (d.src !== 'sacs.webp') continue;
      out[d.sx / d.sw] = { sw: d.sw, dw: Math.round(d.dw) };
    }
    return out;
  });
  console.log('\n-- les colonnes de sacs.webp reellement lues --');
  console.log('   ' + JSON.stringify(sacsPeints));

  /* L'ordre de la planche : brun, bleu, violet, or, rouge, blanc. */
  ok(sacsPeints['0'], 'le sac BRUN lit la colonne 0');
  ok(sacsPeints['1'], 'le sac BLEU lit la colonne 1');
  ok(sacsPeints['5'], 'le sac BLANC lit la colonne 5');
  ok(!sacsPeints['2'] && !sacsPeints['3'] && !sacsPeints['4'],
     'et aucune colonne qu on n a pas demandee');
  const cadres = Object.keys(sacsPeints).map((k) => sacsPeints[k].sw);
  ok(new Set(cadres).size === 1 && cadres[0] === 96,
     `la case lue vaut ${cadres[0]} px — la planche fait 576 de large pour six sacs`);

  /* ---- ON MARCHE DESSUS : LA GRILLE S'OUVRE ----
   * Le butin n'est pas absorbe en passant. Huit places apparaissent SOUS
   * celles du joueur, avec ce que le sac contient — on voit, on choisit, on
   * laisse le reste. */
  const ferme = await p.evaluate(() => {
    const el = document.getElementById('nxButin');
    return { existe: !!el, cache: el ? el.hidden : null };
  });
  ok(ferme.existe, 'la grille du sac au sol existe dans la page');
  ok(ferme.cache === true, 'et elle reste fermee tant qu on n est sur aucun sac');

  await p.evaluate(async ([x, y]) => {
    window.__sacs = [{ i: 80009, x: x, y: y, s: 'or', r: 55,
                       c: [{ st: 'def' }, { po: 'vie' }] }];
    for (let k = 0; k < 30; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
  }, [moi.x, moi.y]);
  await p.waitForTimeout(300);

  const ouverte = await p.evaluate(() => {
    const el = document.getElementById('nxButin');
    const cases = [].map.call(document.querySelectorAll('#nxButinCases .nxp-c'), (c) => ({
      vide: c.classList.contains('vide'),
      titre: c.getAttribute('title') || '',
      place: c.dataset.place === undefined ? null : Number(c.dataset.place),
      fond: (c.querySelector('u.fiole') || {}).style ? c.querySelector('u.fiole').style.backgroundPosition : '',
      img: (c.querySelector('img') || {}).getAttribute ? c.querySelector('img').getAttribute('src') : '',
    }));
    return { cache: el.hidden, nom: document.getElementById('nxButinNom').textContent, cases };
  });
  console.log('\n-- la grille du sac ouvert --');
  console.log('   nom : ' + ouverte.nom);
  ouverte.cases.slice(0, 3).forEach((c, i) => console.log('   case ' + i + ' : ' + JSON.stringify(c)));
  ok(ouverte.cache === false, 'marcher sur un sac ouvre la grille, sans aucune touche');
  ok(ouverte.cases.length === 8, `elle a huit places (${ouverte.cases.length})`);
  ok(!ouverte.cases[0].vide && !ouverte.cases[1].vide, 'les deux objets du sac y sont');
  ok(ouverte.cases.slice(2).every((c) => c.vide), 'et les six autres places sont vides');
  ok(/DEF/.test(ouverte.cases[0].titre), 'la premiere dit ce qu elle donne : ' + ouverte.cases[0].titre);
  ok(/Health/.test(ouverte.cases[1].titre), 'la seconde aussi : ' + ouverte.cases[1].titre);
  ok(ouverte.nom === 'Legendary drop', 'et l en-tete nomme la couleur du sac');

  /* ---- LA BONNE FIOLE ----
   * Huit fioles sur une bande, et l'ordre des stats vient du serveur. Une
   * colonne fausse donnerait une potion de defense sous l'image d'une potion
   * de vitesse — un mensonge silencieux. */
  const ordre = await p.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
    return e.stats;
  });
  const attendu = (ordre.indexOf('def') / (ordre.length - 1)) * 100;
  ok(Math.abs(parseFloat(ouverte.cases[0].fond) - attendu) < 0.01,
     `la fiole de defense lit la colonne ${ordre.indexOf('def')} sur ${ordre.length} ` +
     `(fond a ${ouverte.cases[0].fond}, attendu ${attendu.toFixed(3)} %)`);

  /* ---- ON PREND UNE PLACE, PAS LE SAC ----
   * Le clic nomme le sac ET la place. Le serveur verifie qu'on est bien
   * dessus : sans ca, nommer un identifiant suffirait a vider un sac a
   * l'autre bout de la carte. */
  const avant = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  await p.evaluate(() => {
    document.querySelector('#nxButinCases .nxp-c[data-place="1"]').click();
  });
  await p.waitForTimeout(400);
  const demande = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').pop());
  const apres = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  console.log('\n-- toucher une place --');
  console.log('   demande envoyee : ' + JSON.stringify(demande));
  ok(apres === avant + 1, 'toucher une place envoie UNE demande, pas dix');
  ok(demande && demande.i === 80009, 'elle nomme le sac');
  ok(demande && demande.place === 1, 'et la place touchee, pas la premiere');

  /* Une place VIDE ne demande rien : un clic dans le vide qui parlerait au
     serveur serait du bruit, et le refus qui reviendrait serait incomprehensible. */
  const avantVide = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  await p.evaluate(() => { document.querySelectorAll('#nxButinCases .nxp-c.vide')[0].click(); });
  await p.waitForTimeout(250);
  const apresVide = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  ok(apresVide === avantVide, 'une place vide ne demande rien');

  /* ---- ET LA GRILLE SE REFERME QUAND ON S'EN VA ----
   * Une grille qui resterait ouverte laisserait croire qu'on peut encore
   * prendre quelque chose qui est reste vingt metres en arriere. */
  await p.evaluate(async () => {
    window.__sacs = [];
    for (let k = 0; k < 20; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
  });
  await p.waitForTimeout(250);
  const refermee = await p.evaluate(() => document.getElementById('nxButin').hidden);
  ok(refermee === true, 's eloigner referme la grille');

  ok(erreurs.length === 0, 'aucune erreur de page' + (erreurs.length ? ' : ' + erreurs[0] : ''));

  await nav.close(); site.stop();
  console.log('\nbutin_page.test.js : ' + n + ' verifications, ' + rates + ' ratees');
  process.exit(rates ? 1 : 0);
})();
