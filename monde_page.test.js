/* LE MONDE DE COMBAT, VU DE LA PAGE — banc d'essai permanent.
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
 * 4. LES DEUX JAUGES SONT SOUS LE PERSONNAGE. Pas dans le coin de l'ecran :
 *    en combat on regarde son personnage, et on lisait sa vie APRES, en
 *    mourant. Sur telephone le panneau est souvent replie — c'etait alors le
 *    seul endroit ou elle s'affichait.
 * 5. AU DOIGT, LE SAC AU SOL SORT DU PANNEAU. Le panneau se lit A L'ARRET, et
 *    sur telephone on le replie justement pour se battre. Un sac qui n'existe
 *    qu'une minute, pendant qu'on se fait tirer dessus, n'a rien a y faire :
 *    il devient une rangee flottante au-dessus des commandes, qui ne montre
 *    que les places pleines et se prend d'un simple appui.
 * 6. AU DOIGT, LE RETOUR AU NEXUS EST A DROITE. Il a d'abord ete pose au-
 *    dessus de la fleche du haut : le pouce gauche tient les directions en
 *    continu, et un bouton qui SORT du monde a un demi-centimetre de
 *    « avancer » finit par etre touche pendant qu'on recule d'un golem.
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
if (!chromium) { console.log('monde_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('monde_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eqOk = (a, b, m) => ok(a === b, m + (a === b ? '' : ` (${JSON.stringify(a)} au lieu de ${JSON.stringify(b)})`));

/* Ce que la page a demande et qui n'existe pas. Un 404 ne casse rien de
   visible — l'image reste vide, le jeu continue — et c'est bien le probleme :
   « le projectile du joueur n'est jamais dessine » s'est lu pendant tout un
   apres-midi comme un defaut de fluidite. */
const manquants = [];
function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp3': 'audio/mpeg' };
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const f = path.join(racine, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { manquants.push(q.url.split('?')[0]); r.writeHead(404); r.end(); return; }
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
  /* ---- ON ATTRAPE LE MOTEUR ----
   * Pour donner une VRAIE arme au personnage. On lui en injectait une par un
   * faux message : la page la portait, le serveur ne le savait pas, et les
   * deux ne parlaient plus de la meme chose — la page dessinait les
   * projectiles d'une lame pendant que le serveur tirait au poing. Un essai
   * qui ment sur l'etat du serveur ne mesure plus le jeu. */
  const { Game } = require(path.join(SERVEUR, 'game'));
  let moteur = null; const _p0 = Game.prototype._p;
  Game.prototype._p = function (a) { moteur = this; return _p0.call(this, a); };
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const monde = require(path.join(SERVEUR, 'monde'));
  /* La piece qu'on met dans le sac du joueur vient du CATALOGUE, pas de notre
     imagination. On avait invente une « lame_ebrechee » : la page demandait
     alors `img/shop/lame_ebrechee.webp`, qui n'existe pas, et l'essai passait
     quand meme — un item sans dessin ne fait pas de bruit. */
  const boutique = require(path.join(SERVEUR, 'boutique'));
  const PIECE = boutique.ITEMS.concat(boutique.ITEMS_DROP)
    .find((o) => o.famille === 'lame' && o.rarete === 'commun');
  await new Promise((r) => setTimeout(r, 1200));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* ---- UN SEUL COMPTE, DEUX ECRANS ----
   * Le personnage coute quinze mille : le racheter pour la page tactile
   * demanderait un second robinet et donnerait deux joueurs la ou l'on veut
   * verifier LE MEME dans deux mains differentes. La clef est donc creee une
   * fois et signee deux fois. */
  const portefeuille = ethers.Wallet.createRandom();
  const erreurs = [];

  async function ouvre(viewport, tactile, touchesGardees) {
    const p = await nav.newPage(tactile
      ? { viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
      : { viewport });
    if (touchesGardees) {
      await p.addInitScript(`window.__touches = ${JSON.stringify(touchesGardees)};`);
    }
    await p.addInitScript(function () {
      window.__s = [];
      const N = window.WebSocket;
      function C(u, pr) { const s = (pr === undefined) ? new N(u) : new N(u, pr); s.__m = [];
        s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
        /* Ce qui SORT compte autant que ce qui entre : « la page a-t-elle
           demande a ramasser ? » ne se lit nulle part ailleurs. */
        s.__out = [];
        const env = s.send.bind(s);
        /* AVEC L'HEURE. « du clic au projectile peint : 857 ms » ne dit pas ou
           sont passees les 857 ms : la page n'a-t-elle pas demande, ou n'a-t-elle
           pas dessine ? Sans horodatage il faut relancer et deviner. */
        /* ---- ET ON PEUT RETENIR UN MESSAGE ----
           Le vrai serveur est au bout du fil. Pour essayer la fiole
           automatique il faut une pile de potions qu'on choisit — or chaque
           `potionBoit` qui PART lui fait renvoyer la vraie pile, qui ecrase la
           notre au milieu de l'essai. On enregistre donc la demande, ce qui
           est tout ce qu'on mesure, et on ne la transmet pas. */
        s.send = function (d) {
          let o = null;
          try { o = JSON.parse(d); o.__t = performance.now(); s.__out.push(o); } catch (x) {}
          if (o && window.__retient && o.type === window.__retient) return;
          return env(d);
        };
        /* ---- L'INJECTION SE RECOLLE APRES CHAQUE ETAT REEL ----
         * Le vrai serveur envoie son etat dix fois par seconde et il n'a pas
         * nos sacs. Reinjecter au rythme d'une minuterie fait une COURSE : la
         * moitie du temps c'est son etat qui arrive en dernier, la grille se
         * referme, et un geste lache a cet instant-la ne trouve plus rien.
         * On se raccroche donc a son message. `setTimeout` et pas un appel
         * direct : `dispatchEvent` est synchrone, et notre message serait
         * traite AVANT celui qui l'a declenche. */
        s.addEventListener('message', (e) => {
          const rien = (!window.__sacs || !window.__sacs.length)
                    && (!window.__zones || !window.__zones.length)
                    /* ---- ET LA VIE ----
                       Le vrai serveur nous renvoie a pleine vie dix fois par
                       seconde. Pour essayer quoi que ce soit qui REGARDE la
                       vie, il faut la rabaisser par le meme chemin — une
                       minuterie a part ferait la meme course que pour les
                       sacs, et l'essai passerait une fois sur deux. */
                    && !(window.__pv > 0);
          if (window.__rejoue || rien) return;
          let m; try { m = JSON.parse(e.data); } catch (x) { return; }
          if (m.type !== 'realmEtat') return;
          setTimeout(() => {
            window.__rejoue = true;
            const plus = { ...m };
            if (window.__sacs && window.__sacs.length) plus.sacs = window.__sacs;
            /* Les zones passent par le MEME chemin que les sacs, et pour la
               meme raison : le vrai serveur n'en a pas au moment ou l'on
               regarde, et une minuterie a part ferait la course avec lui. */
            if (window.__zones && window.__zones.length) plus.zones = window.__zones;
            if (window.__pv > 0 && plus.moi) plus.moi = { ...plus.moi, pv: window.__pv };
            s.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(plus) }));
            window.__rejoue = false;
          }, 0);
        });
        window.__s.push(s); return s; }
      C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
      window.WebSocket = C;
      /* Les touches d'un joueur qui a DEJA joue, telles que son navigateur les
         a gardees. C'est le cas qui casse en silence : une touche par defaut
         qui change se heurte a un reglage enregistre. */
      if (window.__touches) {
        try { localStorage.setItem('swogeNexusTouches', JSON.stringify(window.__touches)); } catch (e) {}
      }

      /* ---- LES DEUX MOUCHARDS ----
       * On veut les nombres REELLEMENT passes au canevas, pas ceux qu'on croit
       * avoir calcules. `drawImage` a neuf arguments pour ce qui se decoupe
       * dans un atlas ; `fillRect` pour ce qui se peint a plat — les jauges.
       * On ne retient des rectangles que les couleurs des barres, sinon on
       * enregistrerait toute l'interface a soixante images par seconde. */
      /* Nos sacs a nous, et le moyen de les reposer. Ils vivent dans
         l'amorcage — donc sur CHAQUE page. Les avoir definis dans l'evaluate
         de la premiere laissait la seconde sans eux : l'appel echouait, la
         promesse etait rejetee, et le navigateur restant ouvert node ne
         rendait jamais la main. Un essai qui ne finit pas ne dit rien. */
      window.__sacs = [];
      window.__zones = [];
      window.__pousse = function () {
        const s = window.__s[0];
        if (!s) return;
        s.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ type: 'realmEtat', monstres: [], tirs: [], tirsM: [],
                                 tombes: [], joueurs: [], sacs: window.__sacs,
                                 zones: window.__zones }),
        }));
      };
      window.__peint = [];
      /* L'heure du clic, prise PAR LA PAGE. La noter depuis node avant
         d'envoyer le clic ajoute un aller-retour au chrono ; en capture, elle
         est prise meme si quelque chose avale l'evenement — et savoir qu'il a
         ete avale vaut mieux que mesurer autre chose. */
      window.__clic = null;
      window.addEventListener('mousedown', function () {
        if (window.__clic === null) window.__clic = performance.now();
      }, true);
      /* ---- LES SONS ----
       * Un tir fait un bruit. Deux bruits pour un tir veut dire que quelque
       * chose tire deux fois — et si l'on n'en voit qu'un, l'autre part dans
       * une liste que personne ne dessine. C'est le seul endroit d'ou ce
       * defaut se voit du dehors : le projectile invisible ne laisse aucune
       * trace ailleurs. */
      window.__sons = 0;
      if (window.AudioContext) {
        const CBS = AudioContext.prototype.createBufferSource;
        AudioContext.prototype.createBufferSource = function () {
          window.__sons++;
          return CBS.apply(this, arguments);
        };
      }
      /* Le NUMERO D'IMAGE. Sans lui on ne peut pas dire « le cercle est peint
         AVANT les creatures » : on ne saurait pas ou finit une image et ou
         commence la suivante, et l'ordre lu serait celui de deux images
         differentes. */
      window.__image = 0;
      /* Et le TEMPS de chaque image. « ca saccade dans le monde alors que le
         Nexus est fluide » ne se corrige pas a l'oreille : il faut savoir de
         combien, et ou. */
      window.__dt = [];
      (function compte(t) {
        if (window.__tPrec !== undefined) window.__dt.push(t - window.__tPrec);
        window.__tPrec = t;
        if (window.__dt.length > 4000) window.__dt.splice(0, 2000);
        window.__image++;
        requestAnimationFrame(compte);
      })(performance.now());
      /* Les positions ou l'on peint un PROJECTILE, image par image. C'est la
         seule facon de savoir s'il avance entre deux etats du serveur ou s'il
         reste fige six images puis saute de trente-quatre unites. */
      window.__tirs = [];
      window.__premierTir = null;
      window.__heuresTirs = [];
      let vusTirs = [];
      (function boucleTirs() {
        window.__tirs.push(vusTirs);
        vusTirs = [];
        requestAnimationFrame(boucleTirs);
      })();
      const D = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (img) {
        const s0 = (img && (img.currentSrc || img.src)) || '';
        if (/\/tirs\//.test(s0) && arguments.length === 9) {
          /* Avec le NOM du dessin : « un projectile est fige » ne dit pas
             LEQUEL, et le notre et ceux des monstres ne se reparent pas au
             meme endroit. */
          vusTirs.push(s0.split('/').pop().split('?')[0].replace('.webp', '') +
                       '@' + (Math.round(this.getTransform().e * 100) / 100));
          if (window.__premierTir === null) window.__premierTir = performance.now();
          /* Toutes les heures, pas seulement la premiere : les monstres tirent
             aussi, et « le premier projectile peint » n'est pas forcement le
             notre. On garde de quoi prendre celui qui suit NOTRE demande. */
          window.__heuresTirs.push({ t: performance.now(), s: s0.split('/').pop().split('?')[0].replace('.webp', '') });
        }
        if (arguments.length === 9) {
          const src = (img && (img.currentSrc || img.src)) || '';
          const bouts = String(src).split('?')[0].split('/');
          window.__peint.push({ src: bouts[bouts.length - 1],
                                /* Le DOSSIER : « annonce.webp » et « lime.webp » ne se
                                   distinguent pas par leur nom, et on veut pouvoir dire
                                   « une creature » sans les enumerer toutes. */
                                dossier: bouts[bouts.length - 2] || '',
                                sx: arguments[1], sy: arguments[2], sw: arguments[3], sh: arguments[4],
                                dx: arguments[5], dy: arguments[6],
                                dw: arguments[7], dh: arguments[8], f: window.__image,
                                /* PEINT A L'ECRAN, ou seulement dessine ? La page se sert
                                   de canevas detaches pour teinter une creature gelee et
                                   pour MESURER une planche : ces dessins-la ne sont vus de
                                   personne. Les compter faisait dire a l'essai que le
                                   cercle d'annonce prenait ses quatre images d'un coup —
                                   c'etaient les quatre lectures de la mesure. */
                                ecran: !!(this.canvas && this.canvas.isConnected) });
          if (window.__peint.length > 4000) window.__peint.splice(0, 2000);
        }
        return D.apply(this, arguments);
      };
      window.__barres = [];
      /* `fillStyle` se RELIT en minuscules : le canevas normalise la couleur
         qu'on lui donne. Comparer au litteral ecrit dans nexus.js ne trouve
         donc jamais rien — sans erreur, sans avertissement, juste une liste
         vide qu'on prend pour « rien n'est peint ». */
      const COULEURS = ['#7cff9b', '#ffc53d', '#f2685e', '#5aa9ff'];
      const R = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
        if (COULEURS.indexOf(String(this.fillStyle).toLowerCase()) >= 0) {
          window.__barres.push({ x, y, w, h, c: this.fillStyle });
          if (window.__barres.length > 2000) window.__barres.splice(0, 1000);
        }
        return R.apply(this, arguments);
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
    await p.waitForTimeout(2000);
    return p;
  }

  /* ---- LES DEUX PAGES PARTAGENT UN COMPTE ----
   * Un joueur n'existe qu'UNE fois dans le monde, par adresse. Quand la page
   * tactile en sort, elle en sort aussi la page souris — et les essais qui
   * suivaient se plaignaient alors de choses qui marchent tres bien : « la
   * touche Q ne boit pas », « aucun projectile n'est peint ». Chaque bloc qui
   * a besoin du monde s'y remet donc lui-meme. */
  /* ---- ET ON PEUT ETRE MORT ----
   * Un personnage niveau 1 gare pendant trente secondes au milieu des limes
   * finit par mourir : c'est le jeu qui marche, pas l'essai qui deraille.
   * Mais un `realmJoin` envoye par-dessus le voile de mort ne fait rien du
   * tout, et le bloc suivant mesure alors un fantome — sans se plaindre.
   * C'est exactement ce qui est arrive : « du clic au projectile peint »
   * mesurait les fleches des monstres, parce que le personnage etait mort et
   * que le voile mangeait le clic. On appuie donc sur « Play again », comme
   * un joueur, et on RETOURNE si l'on est bien entre. */
  async function rejoins(page) {
    const entre = await page.evaluate(async () => {
      const s = window.__s[0];
      const avant = s.__m.filter((m) => m.type === 'realmEntre').length;
      const refAvant = s.__m.filter((m) => m.type === 'realmRefus').length;
      const v = document.getElementById('nxMortVoile');
      const mort = !!(v && v.classList.contains('on'));
      /* « Play again » ne fait PAS repartir : il ferme le voile et redemande
         la fiche. C'est le Nexus qui ramene dans le monde, et c'est normal —
         on choisit son personnage avant d'y retourner. L'essai fait donc les
         deux gestes, dans l'ordre, comme un joueur. */
      if (mort) {
        const b = v.querySelector('.nxmt-go');
        if (b) b.click();
        await new Promise((r) => setTimeout(r, 900));
      }
      s.send(JSON.stringify({ type: 'realmJoin' }));
      const t0 = Date.now();
      while (Date.now() - t0 < 4000) {
        if (s.__m.filter((m) => m.type === 'realmEntre').length > avant) return { ok: true, mort };
        await new Promise((r) => setTimeout(r, 60));
      }
      const r = s.__m.filter((m) => m.type === 'realmRefus').slice(refAvant).pop();
      return { ok: false, mort, refus: r ? r.raison : null };
    });
    await page.waitForTimeout(700);
    const voile = await page.evaluate(() => {
      const v = document.getElementById('nxMortVoile');
      return !!(v && v.classList.contains('on'));
    });
    return { ...entre, voile };
  }

  /* ---- ON ATTEND LA CHOSE, PAS UNE DUREE ----
   *
   * `waitForTimeout(450)` ne mesure pas le jeu : il mesure la machine hote.
   * Sur celle-ci le navigateur rend une page vide a 16,7 ms et le jeu a
   * 33,3 — soit deux fois moins d'images qu'au repos. Quatre cent cinquante
   * millisecondes suffisaient donc trois fois sur quatre, et la quatrieme le
   * bloc suivant attrapait `null.getBoundingClientRect()` : un PLANTAGE a la
   * place d'un verdict, et l'essai ne disait plus rien du tout.
   *
   * On attend donc la condition elle-meme, et l'on rend un booleen plutot que
   * de laisser partir l'exception : une condition qui ne vient jamais doit se
   * lire comme un essai RATE qui se nomme, pas comme une pile d'appels. */
  const attend = async (page, fn, arg, quoi, ms) => {
    try { await page.waitForFunction(fn, arg, { timeout: ms || 8000 }); return true; }
    catch (e) { console.log('   (jamais venu : ' + quoi + ')'); return false; }
  };

  /* ---- LA MORT EST LA PREMIERE CAUSE DE FAUX ECHEC ----
   *
   * Un personnage de niveau 1 gare trente secondes au milieu des limes meurt,
   * et mourir ne fait pas que poser un voile sur l'ecran :
   *   - le serveur VIDE le sac — la piece que le bloc precedent y avait mise
   *     n'y est plus, et `#nxSac .nxp-c[data-sac]` devient `null` ;
   *   - le voile MANGE les clics — un glissement lache sur la scene tombe
   *     dessus et rien ne part au serveur ;
   *   - la page REMET A ZERO les salles — le coffre qu'on venait de poser
   *     sous nos pieds cesse d'etre peint au milieu de la mesure.
   * Les trois se sont vus dans les quatre executions de reference, et les
   * trois se lisaient comme des defauts du jeu. On regarde donc le voile
   * avant chaque bloc qui suppose un joueur vivant. */
  const auVoile = (page) => page.evaluate(() => {
    const v = document.getElementById('nxMortVoile');
    return !!(v && v.classList.contains('on'));
  });
  /* Vivant, et dans le monde. Rend ce que `rejoins` a vu, ou null si l'on
     n'avait pas besoin d'y toucher. */
  const assureVivant = async (page) => (await auVoile(page)) ? rejoins(page) : null;

  const p = await ouvre({ width: 1280, height: 800 }, false);

  /* ---- UN PERSONNAGE, ACHETE POUR DE BON ----
     Sans personnage le serveur refuse l'entree — et il a raison : on n'entre
     pas dans le monde en spectateur. */
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

  /* On entre dans le monde par le MEME message que le portail. */
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForTimeout(1500);
  const entre = await p.evaluate(() => {
    const s = window.__s[0];
    const e = s.__m.filter((m) => m.type === 'realmEntre').pop();
    const r = s.__m.filter((m) => m.type === 'realmRefus').pop();
    return { entre: !!e, refus: r ? r.raison : null };
  });
  console.log('\n-- entree dans le monde --');
  console.log('   ' + JSON.stringify(entre));
  ok(entre.entre, 'on entre dans le monde de combat' + (entre.refus ? ' (refus: ' + entre.refus + ')' : ''));

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
    /* ---- L'INJECTION SE RECOLLE APRES CHAQUE ETAT REEL ----
     * Le vrai serveur envoie son etat dix fois par seconde et il n'a pas nos
     * sacs. Une reinjection au rythme d'une minuterie fait une COURSE : la
     * moitie du temps c'est son etat qui arrive en dernier, la grille se
     * referme, et un glissement lache a cet instant-la ne trouve plus rien
     * sous le pointeur. L'essai passait ou echouait selon les millisecondes.
     * On se raccroche donc a son message : chaque fois qu'il en arrive un, on
     * repose le notre juste apres. `setTimeout` et pas un appel direct —
     * `dispatchEvent` est synchrone, et notre message serait traite AVANT
     * celui qui l'a declenche. */
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
      place: c.dataset.butin === undefined ? null : Number(c.dataset.butin),
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
  /* ---- LA FICHE AU SURVOL, PAS UNE INFOBULLE ----
   * La case portait un `title` : l'infobulle du navigateur met une seconde a
   * venir, ne dit qu'un nom, et ne peut pas montrer des bonus. C'est pourtant
   * DEVANT UN SAC OUVERT que la question se pose — « est-ce que ca vaut mieux
   * que ce que je porte ? » — et il fallait ramasser pour savoir, donc faire
   * de la place, donc parfois jeter la bonne. */
  const surviens = async (place) => {
    const boite = await p.evaluate((k) => {
      const c = document.querySelector('#nxButinCases .nxp-c[data-butin="' + k + '"]');
      if (!c) return null;
      const q = c.getBoundingClientRect();
      return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
    }, place);
    if (!boite) return null;
    await p.mouse.move(boite.x - 40, boite.y - 40);
    await p.mouse.move(boite.x, boite.y);
    await p.waitForTimeout(200);
    return p.evaluate(() => {
      const f = document.getElementById('nxFiche');
      return { on: f.classList.contains('on'), texte: f.textContent,
               vu: f.getBoundingClientRect().width > 0 };
    });
  };
  const fiche0 = await surviens(0);
  console.log('   fiche au survol : ' + JSON.stringify(fiche0));
  ok(fiche0 && fiche0.on && fiche0.vu, 'survoler une place du sac au sol ouvre sa fiche');
  ok(fiche0 && /DEF/.test(fiche0.texte),
     'la premiere dit ce qu elle donne : ' + (fiche0 && fiche0.texte));
  const fiche1 = await surviens(1);
  ok(fiche1 && /Health|Potion/i.test(fiche1.texte),
     'la seconde aussi : ' + (fiche1 && fiche1.texte));
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
  /* DOUBLE-clic. Le clic simple faisait la meme chose et c'etait une erreur :
     la case est aussi une poignee de glissement, et un clic legerement de
     travers devenait un ramassage qu'on n'avait pas demande. */
  /* LE SAC QUE LA PAGE CROIT AVOIR SOUS LES PIEDS, et pas un numero recopie
     ici : un vrai sac peut etre tombe a cote entre-temps, et l'essai dirait
     alors « elle ne nomme pas le bon sac » d'une page qui nomme tres bien
     celui sur lequel elle se tient. */
  const sacVise = await p.evaluate(() => {
    const c = document.querySelector('#nxButinCases .nxp-c[data-butin="1"]');
    if (!c) return null;
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const t = document.getElementById('nxButinNom');
    return { nom: t ? t.textContent : '' };
  });
  ok(!!sacVise, 'la grille du sac au sol est bien ouverte pour le double-clic');
  await p.waitForTimeout(400);
  const demande = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').pop());
  const apres = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  console.log('\n-- toucher une place --');
  console.log('   demande envoyee : ' + JSON.stringify(demande));
  ok(apres === avant + 1, 'un double-clic envoie UNE demande, pas dix');
  ok(demande && demande.i > 0, `elle nomme un sac (${demande && demande.i})`);
  ok(demande && demande.place === 1, 'et la place touchee, pas la premiere');

  /* Une place VIDE ne demande rien : un clic dans le vide qui parlerait au
     serveur serait du bruit, et le refus qui reviendrait serait incomprehensible. */
  const avantVide = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  await p.evaluate(() => {
    /* Une place vide DOIT exister — le sac au sol n'en porte que deux
       pleines sur huit. Si elle manque, c'est la grille qui n'est pas la, et
       un `undefined.dispatchEvent` arreterait tout l'essai la ou une ligne
       RATE suffit a le dire. */
    const v = document.querySelectorAll('#nxButinCases .nxp-c.vide')[0];
    if (v) v.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    return !!v;
  });
  await p.waitForTimeout(250);
  const apresVide = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  ok(apresVide === avantVide, 'une place vide ne demande rien');

  /* ---- ET LE CLIC SIMPLE NE PREND PLUS RIEN ----
   * C'est la moitie du sens du double-clic : la case doit pouvoir etre
   * attrapee sans etre consommee. */
  const avantSimple = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  await p.evaluate(() => {
    const c = document.querySelector('#nxButinCases .nxp-c[data-butin="0"]');
    if (c) c.click();
  });
  await p.waitForTimeout(250);
  const apresSimple = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  ok(apresSimple === avantSimple, 'un clic simple ne ramasse rien : la case est aussi une poignee');

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

  /* ---- LES BLOCS ----
   *
   * Ils viennent du serveur une fois, a l'entree. La page ne peut pas les
   * redeviner — elle n'a pas le meme hasard — et un desaccord se verrait tout
   * de suite : on marcherait dans un rocher, ou l'on serait arrete par du
   * vide.
   *
   * Ce qu'on verifie ici est le point qui casse en silence : la page applique
   * la MEME regle que le serveur. Sinon le joueur avance dans la pierre puis
   * se fait ramener en arriere par a-coups — ce qui se lit comme un defaut de
   * reseau, pas comme un rocher. */
  /* ---- VIVANT, ET A LA PLACE OU IL EST MAINTENANT ----
   *
   * Tout ce bloc marche quatre secondes et regarde ou le personnage s'arrete.
   * Sur un mort, il ne se passe RIEN : le voile mange les fleches, aucun
   * `realmMove` ne part, et la page ne peint plus le monde. L'essai a rendu
   * exactement ca — « le personnage a bien marche (0 positions) », « les
   * rochers sont peints : 0 » — d'un jeu qui allait tres bien ; le seul
   * indice etait une ligne trente plus bas, « relance apres une mort », qui
   * arrivait trop tard pour servir a quelque chose.
   *
   * Et l'on relit SA POSITION : rentrer dans le monde le repose ailleurs, et
   * viser un rocher depuis la position d'il y a une minute revient a viser
   * au hasard — c'est ce qui faisait dire « aucune route degagee ». */
  const vifB = await rejoins(p);
  ok(vifB.ok, 'le personnage est vivant pour la marche dans les blocs' +
     (vifB.mort ? ' (relance apres une mort)' : ''));
  const blocs = await p.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
    return (e && e.obstacles) || [];
  });
  const ici = await p.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
    return e ? { x: e.moi.x, y: e.moi.y } : { x: 0, y: 0 };
  });
  console.log('\n-- les blocs --');
  console.log('   recus : ' + blocs.length + ', depuis ' + JSON.stringify(ici));
  ok(blocs.length > 100, `le serveur envoie sa carte de blocs (${blocs.length})`);
  ok(blocs.every((o) => o.r > 0 && o.t !== undefined),
     'chacun porte son rayon et son dessin');

  /* ---- ON CHOISIT UN BLOC QU'ON PEUT ATTEINDRE EN LIGNE DROITE ----
   * On visait le plus PROCHE, et on l'approchait par les fleches — donc dans
   * une des huit directions seulement. Un rocher a cinq cents unites en
   * diagonale se rate d'un cheveu : on passe a cote, l'essai annonce « 94
   * unites du bord » et se plaint d'une regle qui marche tres bien.
   * On cherche donc le premier bloc pose SUR une des huit routes, et on prend
   * celle-la. Ce qu'on veut prouver n'a jamais ete « le plus proche est
   * atteignable » mais « on ne traverse pas la pierre ». */
  const HUIT = [[1, 0, ['ArrowRight']], [-1, 0, ['ArrowLeft']],
                [0, 1, ['ArrowDown']], [0, -1, ['ArrowUp']],
                [0.7071, 0.7071, ['ArrowRight', 'ArrowDown']],
                [0.7071, -0.7071, ['ArrowRight', 'ArrowUp']],
                [-0.7071, 0.7071, ['ArrowLeft', 'ArrowDown']],
                [-0.7071, -0.7071, ['ArrowLeft', 'ArrowUp']]];
  /* On ne vise pas plus loin que ce qu'on peut parcourir avant le plafond de
     la marche : sept cents unites a un peu plus de deux cents par seconde. */
  const PORTEE = 700;
  let cible = null;
  for (const [dx0, dy0, tt] of HUIT) {
    for (const o of blocs) {
      const vx = o.x - ici.x, vy = o.y - ici.y;
      const le = vx * dx0 + vy * dy0;                    // le long de la route
      if (le < 80 || le > PORTEE) continue;
      const tr = Math.abs(vx * dy0 - vy * dx0);          // de travers
      /* Il faut le prendre de plein fouet, pas le froler : on garde une marge
         pour la largeur du personnage. */
      if (tr > o.r * 0.6) continue;
      if (!cible || le < cible.d) cible = { o, d: le, touches: tt };
    }
  }
  if (!cible) {
    /* Aucune route degagee : on retombe sur le plus proche, et l'essai dira
       lui-meme qu'il n'a pas trouve mieux. */
    const q = blocs.map((o) => ({ o, d: Math.hypot(o.x - ici.x, o.y - ici.y) }))
                   .sort((a2, b2) => a2.d - b2.d)[0];
    const tt = [];
    if (q.o.x > ici.x + 20) tt.push('ArrowRight'); else if (q.o.x < ici.x - 20) tt.push('ArrowLeft');
    if (q.o.y > ici.y + 20) tt.push('ArrowDown'); else if (q.o.y < ici.y - 20) tt.push('ArrowUp');
    cible = { o: q.o, d: q.d, touches: tt, faute: true };
  }
  console.log(`   vise : un bloc a ${Math.round(cible.d)} unites, par ${cible.touches.join('+')}` +
              (cible.faute ? ' (aucune route degagee — repli sur le plus proche)' : ''));

  await p.evaluate(() => { window.__s[0].__out.length = 0; });
  const touches = cible.touches;
  for (const t2 of touches) await p.keyboard.down(t2);
  /* ---- ON MARCHE JUSQU'AU CONTACT, PAS QUATRE SECONDES ----
   *
   * Quatre secondes de montre ne disent pas ou l'on en est : sur une machine
   * au repos elles amenaient au rocher, sous charge elles s'arretaient avant,
   * et l'essai concluait « il n'est arrive au contact de rien ». On regarde
   * donc la seule chose qui compte ici — la position ANNONCEE touche-t-elle
   * un bloc ? — et l'on relache des qu'elle le touche.
   *
   * S'ARRETER AU CONTACT n'est pas une commodite, c'est le sujet du bloc :
   * ce qui se verifie, c'est le trajet JUSQU'A la pierre. Une marche qui
   * continue derriere glisse le long du rocher, traverse mille unites de
   * terrain, entre dans une salle gardee et finit par relever des positions
   * que le serveur a lui-meme recalees — nexus.js et realm.js autorisent tous
   * les deux a bouger quand on est DEJA dedans (« etre dedans n'est pas une
   * prison »), et l'essai accusait alors la page d'une regle qu'elle applique
   * mot pour mot.
   *
   * Le rayon du corps n'est pas recopie ici : il vient de `realm.js`, et
   * nexus.js le reprend — c'est justement l'accord des deux qu'on mesure. */
  const RAYON_MOI = 22;
  const distanceAuPlusPres = (q) => {
    let m = Infinity;
    for (const o of blocs) {
      const d = Math.hypot(o.x - q.x, o.y - q.y) - o.r - RAYON_MOI;
      if (d < m) m = d;
    }
    return m;
  };
  const lisPositions = () => p.evaluate(() => window.__s[0].__out
    .filter((m) => m.type === 'realmMove').map((m) => ({ x: m.x, y: m.y })));
  let trajet = [];
  let mortEnChemin = false;
  {
    const t0 = Date.now();
    let immobile = 0, avant = null;
    while (Date.now() - t0 < 8000) {
      await p.waitForTimeout(120);
      if (await auVoile(p)) { mortEnChemin = true; break; }
      trajet = await lisPositions();
      if (!trajet.length) continue;
      const q = trajet[trajet.length - 1];
      /* AU CONTACT : c'est le but du trajet, on relache la touche. */
      if (trajet.length >= 5 && distanceAuPlusPres(q) < 5) break;
      /* OU BIEN PLUS RIEN NE BOUGE : arrete par un bord de carte, ou par un
         bloc que la marge de cinq unites ne suffit pas a declarer touche. */
      if (avant && Math.abs(avant.x - q.x) < 0.5 && Math.abs(avant.y - q.y) < 0.5) {
        if (++immobile >= 6 && trajet.length >= 8) break;
      } else { immobile = 0; }
      avant = q;
    }
  }
  for (const t2 of touches) await p.keyboard.up(t2);
  ok(!mortEnChemin, 'il est reste vivant pendant la marche' +
     (mortEnChemin ? ' — il est mort en chemin' : ''));
  trajet = await lisPositions();
  let dedans = 0, plusPres = Infinity;
  for (const q of trajet) {
    for (const o of blocs) {
      const d = Math.hypot(o.x - q.x, o.y - q.y) - o.r - RAYON_MOI;
      if (d < plusPres) plusPres = d;
      if (d < -2) dedans++;
    }
  }
  console.log(`   ${trajet.length} positions annoncees, au plus pres a ${plusPres.toFixed(1)} unites du bord`);
  /* Assez de positions pour que la suite ait un sens — pas plus. Leur NOMBRE
     depend du rythme d'envoi, donc de la charge de la machine : on en a
     compte trente-trois au repos et sept sous charge, sur le meme code. Ce
     qu'on veut savoir, c'est s'il a marche et ou il s'est arrete, et cinq
     points suffisent a le dire. */
  ok(trajet.length >= 5, `le personnage a bien marche (${trajet.length} positions)`);
  ok(plusPres < 90,
     `il est arrive AU CONTACT d un bloc (${plusPres.toFixed(1)} unites du bord)`);
  ok(dedans === 0,
     `et aucune position annoncee n est DANS la pierre (${dedans} sur ${trajet.length * blocs.length} mesures)`);

  /* ---- LES SALLES GARDEES ----
   * Une salle se voit de loin parce que son SOL change. C'est ce qui en fait
   * une destination : on sait ce qu'on approche avant d'y etre. Une salle
   * dont la dalle ne serait pas peinte ne serait qu'un carre de murs. */
  const salles = await p.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
    return (e && e.salles) || [];
  });
  console.log('\n-- les salles gardees --');
  console.log('   ' + JSON.stringify(salles.map((s) => ({ b: s.butin, porte: s.porte }))));
  ok(salles.length >= 3, `le serveur envoie ses salles (${salles.length})`);
  ok(salles.some((s) => s.butin === 'relique'),
     'au moins une garde une relique — le seul endroit ou on la merite');
  ok(salles.every((s) => s.cote > 0 && s.porte), 'chacune porte son cote et sa porte');

  /* Les murs sont dessines avec LEUR planche, pas celle des rochers. Un seul
     champ `t` porte les deux : au-dela de MUR_BASE on lit le mur. */
  const murs = await p.evaluate(() => window.__peint
    .filter((d) => d.src === 'mur_ruine.webp').map((d) => d.sx / d.sw));
  const roches = await p.evaluate(() => window.__peint
    .filter((d) => d.src === 'obstacles.webp').length);
  console.log(`   dessins : ${roches} rochers, ${murs.length} murs`);
  ok(roches > 0, 'les rochers sont peints');
  /* Les murs ne sont peints que si l'on est passe pres d'une salle. On ne
     l'exige donc pas ici — ce qu'on exige, c'est que la planche existe et que
     les colonnes lues soient les siennes. */
  ok(murs.every((c) => c >= 0 && c <= 3),
     'et si un mur est peint, sa colonne vient de mur_ruine (' + (murs.length ? [...new Set(murs)].join(',') : 'aucun encore') + ')');

  /* ---- LES MURS ARRIVENT DANS LA MEME LISTE QUE LES ROCHERS ----
   * C'est le point de conception : une seule sorte de bloc, donc une seule
   * collision, un seul arret de projectile, un seul tri de dessin. Seul `t`
   * dit quelle planche lire.
   *
   * On ne fait PAS marcher le personnage jusqu'a une salle : elles sont a
   * deux mille unites du point d'arrivee, le serveur borne les bonds, et un
   * essai qui met vingt secondes a s'approcher d'un endroit qu'il n'atteint
   * peut-etre pas ne prouve rien. Ce qu'on peut affirmer sans mentir tient en
   * deux points — les murs sont bien dans la liste, et la page charge leur
   * planche. Le dessin lui-meme passe par le MEME code que les rochers, qui
   * est verifie plus haut sur des pixels reels. */
  const parType = await p.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
    const c = {};
    for (const o of e.obstacles || []) c[o.t] = (c[o.t] || 0) + 1;
    return c;
  });
  console.log('   blocs par dessin : ' + JSON.stringify(parType));
  const typesMur = Object.keys(parType).map(Number).filter((t2) => t2 >= 4);
  ok(typesMur.length > 0,
     `les murs voyagent dans la meme liste que les rochers (types ${typesMur.join(',')})`);
  ok(Object.keys(parType).map(Number).some((t2) => t2 < 4),
     'et les rochers y sont toujours');
  ok(typesMur.every((t2) => t2 <= 7),
     'chaque mur designe une des quatre pieces de mur_ruine');

  const chargees = await p.evaluate(() => performance.getEntriesByType('resource')
    .map((r) => r.name.split('/').pop().split('?')[0]));
  ok(chargees.indexOf('mur_ruine.webp') >= 0, 'la page charge la planche des murs');
  ok(chargees.indexOf('ground_temple.webp') >= 0, 'et la dalle des salles');

  /* ---- ET ON NOTE OU IL EST ARRIVE ----
   * Les essais qui suivent posent des sacs SOUS SES PIEDS et lisent ses
   * jauges autour de lui. Ils utilisaient le point d'arrivee — juste tant
   * qu'on n'avait pas bouge. Depuis qu'on marche jusqu'au rocher, ce point
   * est a plusieurs centaines d'unites derriere : les sacs tombaient hors de
   * portee et les jauges se cherchaient au mauvais endroit. */
  if (trajet.length) { moi.x = trajet[trajet.length - 1].x; moi.y = trajet[trajet.length - 1].y; }

  /* Et ils sont dessines : un bloc qu'on ne voit pas est un mur invisible. */
  const peintBlocs = await p.evaluate(() => window.__peint
    .filter((d) => d.src === 'obstacles.webp' && d.ecran)
    .map((d) => ({ col: d.sx / d.sw, sw: d.sw,
                   cx: d.dx + d.dw / 2, bas: d.dy + d.dh, dh: d.dh })));
  ok(peintBlocs.length > 0, `les blocs sont peints (${peintBlocs.length} dessins)`);
  ok(peintBlocs.every((d) => d.sw === 128),
     'et lus dans une case de 128 — la planche fait 512 pour quatre');
  const colonnes = [...new Set(peintBlocs.map((d) => d.col))];
  ok(colonnes.every((c) => c >= 0 && c <= 3),
     'chaque dessin vient d une des quatre colonnes : ' + colonnes.join(','));

  /* ---- ILS SONT POSES DANS LE SOL, PAS DESSUS ----
   *
   * Les rochers avaient l'air de flotter : un croissant d'ombre restait
   * visible sous eux. La faute n'etait pas dans l'ombre — c'est le dessin
   * qu'on calait sur sa CASE, en supposant qu'il la remplit. Il ne la remplit
   * pas, et pas du meme montant selon la piece : le rocher moussu laisse
   * quinze pixels de vide sous lui, l'eclat de glace deux. Quatre pieces se
   * posaient donc a quatre hauteurs, dont une treize pixels en l'air.
   *
   * On mesure la planche DANS LA PAGE — le vide sous chaque piece — et on
   * verifie que le bas REEL de tous les rochers tombe au meme endroit sous
   * leur centre de collision. Regarder le bas de la CASE ne verrait rien :
   * c'est exactement ce qu'on calait avant. */
  {
    const vide = await p.evaluate(() => new Promise((res) => {
      const i = new Image();
      i.onload = () => {
        const cadre = i.naturalHeight, n = Math.round(i.naturalWidth / cadre);
        const cv = document.createElement('canvas');
        cv.width = cadre; cv.height = cadre;
        const c2 = cv.getContext('2d', { willReadFrequently: true });
        const out = [];
        for (let k = 0; k < n; k++) {
          c2.clearRect(0, 0, cadre, cadre);
          c2.drawImage(i, k * cadre, 0, cadre, cadre, 0, 0, cadre, cadre);
          const d = c2.getImageData(0, 0, cadre, cadre).data;
          let b = 0;
          for (let y = 0; y < cadre; y++) for (let x = 0; x < cadre; x++) {
            if (d[(y * cadre + x) * 4 + 3] >= 40) { b = y; break; }
          }
          out.push((b + 1) / cadre);
        }
        res(out);
      };
      i.onerror = () => res([]);
      i.src = 'img/nexus/tiles/obstacles.webp';
    }));
    console.log('   le dessin occupe, de haut en bas : ' +
                vide.map((v) => (v * 100).toFixed(1) + ' %').join(', '));
    ok(vide.length === 4, `les quatre pieces sont mesurees (${vide.length})`);
    ok(vide.some((v) => v < 0.97), 'et au moins une laisse du vide sous elle — sinon rien a corriger');

    /* Chaque dessin est rapproche du bloc qu'il represente : c'est le seul
       moyen d'exprimer « sous SON centre » plutot que « quelque part ». */
    const assises = [];
    for (const d of peintBlocs) {
      /* Par le centre ET par la hauteur : deux rochers peuvent partager une
         abscisse. Ne comparer que x rapprochait un dessin du bloc situe
         quarante rayons plus haut, et l'essai annoncait alors des ecarts
         absurdes — un faux defaut qui cache le vrai. */
      const basReel = d.bas - (1 - vide[d.col]) * d.dh;
      let mieux = null, ecart = Infinity;
      for (const o of blocs) {
        if (Math.abs(o.x - d.cx) > 1) continue;
        const e = Math.abs(o.y - basReel);
        if (e < ecart) { ecart = e; mieux = o; }
      }
      if (!mieux || ecart > mieux.r * 2) continue;
      assises.push({ col: d.col, a: (basReel - mieux.y) / mieux.r });
    }
    const vals = assises.map((x) => x.a);
    console.log('   assise mesuree : ' + (vals.length
      ? `${Math.min(...vals).toFixed(3)} a ${Math.max(...vals).toFixed(3)} rayon` : 'aucune'));
    ok(vals.length > 20, `${vals.length} rochers rapproches de leur bloc`);
    if (vals.length) {
      const mini = Math.min(...vals), maxi = Math.max(...vals);
      ok(maxi - mini < 0.02,
         `les quatre pieces se posent toutes a la meme hauteur (ecart ${(maxi - mini).toFixed(3)} rayon)`);
      /* L'ombre s'arrete a 0,40 rayon sous le centre. Si le dessin s'arrete
         AVANT, un croissant d'ombre reste dessous — et c'est ca, « ca
         flotte ». */
      ok(mini >= 0.40,
         `et aucune ne laisse d ombre depasser dessous (la plus haute a ${mini.toFixed(2)} rayon)`);
      ok(maxi <= 0.70, `sans s enfoncer non plus (la plus basse a ${maxi.toFixed(2)} rayon)`);
    }
  }

  /* ---- LES DEUX JAUGES, SOUS LE PERSONNAGE ----
   * Elles vivaient dans le coin du panneau. On ne regarde pas le coin de
   * l'ecran pendant un combat : on regarde son personnage, et on lisait donc
   * sa vie APRES, en mourant.
   * On lit les rectangles reellement peints, en coordonnees du MONDE — c'est
   * ce qui permet de dire « sous SES pieds » et pas « quelque part ». */
  /* VIVANT, sinon il n'y a pas de jauges a lire — et tout ce qui suit se
     plaint de choses qui marchent. Quatre secondes de marche au milieu des
     limes suffisent a tuer un niveau 1 : c'est le jeu, pas l'essai. */
  {
    const v = await rejoins(p);
    ok(v.ok, 'le personnage est vivant pour la suite' + (v.mort ? ' (relance apres une mort)' : ''));
    /* TOUJOURS relire ou il est, pas seulement apres une mort : rentrer dans
       le monde repose le personnage sur le bord, meme s'il y etait deja. Les
       sacs qu'on pose « sous ses pieds » tombaient sinon la ou il etait il y
       a quatre secondes, et ses jauges se cherchaient au meme endroit. */
    const ou = await p.evaluate(() => {
      const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
      return { x: e.moi.x, y: e.moi.y };
    });
    moi.x = ou.x; moi.y = ou.y;
  }
  await p.evaluate(async ([x, y]) => {
    window.__sacs = [];
    window.__barres.length = 0;
    for (let k = 0; k < 20; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
  }, [moi.x, moi.y]);
  await p.waitForTimeout(250);

  const jauges = await p.evaluate(([x, y]) => {
    const pres = window.__barres.filter((b) => Math.abs(b.x + b.w / 2 - x) < 60 && b.y > y && b.y < y + 40);
    const hp = pres.filter((b) => b.c !== '#5aa9ff').pop();
    const mp = pres.filter((b) => b.c === '#5aa9ff').pop();
    return { hp: hp || null, mp: mp || null, total: pres.length };
  }, [moi.x, moi.y]);
  console.log('\n-- les jauges sous le personnage --');
  console.log('   vie  : ' + JSON.stringify(jauges.hp));
  console.log('   mana : ' + JSON.stringify(jauges.mp));
  ok(!!jauges.hp, 'une jauge de VIE est peinte sous le personnage');
  ok(!!jauges.mp, 'et une jauge de MANA sous elle');
  if (jauges.hp && jauges.mp) {
    ok(jauges.mp.y > jauges.hp.y, 'le mana est EN DESSOUS de la vie');
    ok(jauges.mp.h < jauges.hp.h, 'et plus fin : il ne tue pas');
    ok(jauges.hp.y > moi.y, 'les deux sont sous les pieds, pas au-dessus de la tete');
  }

  /* ---- L'ECHANGE : ON GLISSE DANS LES DEUX SENS ----
   * Le sac au sol n'est pas seulement une source. Poser son epee commune et
   * prendre celle qu'on vient de trouver, sans passer par le coffre : c'est
   * pour ca que la case est une poignee et pas un bouton. */
  /* ---- UNE VRAIE PIECE DANS LE SAC, PAS UNE FICTION ----
   * On la posait par un faux message `equipable`. La page la voyait, le
   * serveur l'ignorait, et l'essai mesurait une page qui ne parle plus du
   * meme jeu — c'est exactement ce qui a fait passer la marque « OG » pour
   * absente alors qu'elle marchait : le faux message n'avait pas le champ.
   * On la pose donc dans le sac du serveur et on lui demande de le dire. */
  const sacDuJoueur = moteur._p(portefeuille.address);
  /* Les gestes de cet essai DEPOSENT vraiment : le serveur obeit, il ne fait
     pas semblant. Chaque bloc qui a besoin de la piece dans le sac la remet
     donc, au lieu de supposer qu'elle a survecu au bloc precedent. */
  const remetLaPiece = async () => {
    /* VIVANT D'ABORD. Le serveur vide le sac en mourant : le remplir par-
       dessus un cadavre revient a le remplir pour rien, et le message
       `equipable` qui suit rapporte alors un sac vide. C'est comme ca que
       « lacher une piece sur la scene la JETTE par terre » est tombe, puis
       que le bloc du double-clic s'est arrete sur un `null`. */
    await assureVivant(p);
    sacDuJoueur.sac = {}; sacDuJoueur.sac[PIECE.id] = 1;
    sacDuJoueur.sacCases = null;
    await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'equipable' })));
    /* On attend LA CASE, pas une duree : c'est elle que le bloc suivant va
       attraper a la souris, et une case pas encore peinte ne se distingue pas
       d'une case absente. */
    return attend(p, (id) => !!document.querySelector('#nxSac .nxp-c[data-sac="' + id + '"]'),
                  PIECE.id, 'la piece revenue dans le sac du joueur');
  };
  sacDuJoueur.sac = {}; sacDuJoueur.sac[PIECE.id] = 1;
  sacDuJoueur.sacCases = null;
  await p.evaluate(async ([x, y]) => {
    window.__s[0].send(JSON.stringify({ type: 'equipable' }));
    window.__sacs = [{ i: 80020, x: x, y: y, s: 'brun', r: 55, c: [{ po: 'mana' }] }];
    for (let k = 0; k < 30; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
  }, [moi.x, moi.y]);
  /* Les DEUX grilles, chacune attendue pour ce qu'elle est : celle du sac du
     joueur et celle du sac au sol. Une demi-seconde de sommeil les attendait
     toutes les deux a la fois et ne disait pas laquelle manquait. */
  await attend(p, (id) => !!document.querySelector('#nxSac .nxp-c[data-sac="' + id + '"]'),
               PIECE.id, 'la piece dans le sac du joueur');
  await attend(p, () => !!document.querySelector('#nxButinCases .nxp-c[data-butin]'),
               null, 'le sac au sol ouvert sous les pieds');

  const boites = await p.evaluate(() => {
    const s = document.querySelector('#nxSac .nxp-c[data-sac]');
    const b = document.querySelector('#nxButinCases .nxp-c[data-butin]');
    const r = (el) => { const q = el.getBoundingClientRect();
      return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; };
    return { sac: s ? r(s) : null, butin: b ? r(b) : null };
  });
  ok(!!boites.sac, 'la piece est bien dans le sac du joueur');
  ok(!!boites.butin, 'et le sac au sol est ouvert a cote');

  if (boites.sac && boites.butin) {
    const avantD = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmDepose').length);
    await p.mouse.move(boites.sac.x, boites.sac.y);
    await p.mouse.down();
    await p.mouse.move(boites.butin.x, boites.butin.y, { steps: 8 });
    await p.mouse.up();
    /* Le MESSAGE, pas le chrono : quatre cents millisecondes ne sont une
       attente suffisante que sur une machine au repos. */
    await attend(p, (n) => window.__s[0].__out.filter((m) => m.type === 'realmDepose').length > n,
                 avantD, 'la demande de depot dans le sac au sol', 3000);
    const depot = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmDepose').pop());
    const apresD = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmDepose').length);
    console.log('\n-- glisser du sac vers le sol --');
    console.log('   ' + JSON.stringify(depot));
    ok(apresD === avantD + 1, 'glisser une piece sur le sac au sol la DEPOSE');
    ok(depot && depot.item === PIECE.id, `et c est bien la piece qu on tenait (${depot && depot.item})`);

    /* Et dans l'autre sens : glisser depuis le sac au sol vers le sien. */
    const avantR = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
    const cible = await p.evaluate(() => {
      const q = document.getElementById('nxSac').getBoundingClientRect();
      return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
    });
    await p.mouse.move(boites.butin.x, boites.butin.y);
    await p.mouse.down();
    await p.mouse.move(cible.x, cible.y, { steps: 8 });
    await p.mouse.up();
    await attend(p, (n) => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length > n,
                 avantR, 'la demande de ramassage', 3000);
    const pris = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').pop());
    const apresR = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
    console.log('\n-- glisser du sol vers son sac --');
    console.log('   ' + JSON.stringify(pris));
    ok(apresR === avantR + 1, 'glisser depuis le sac au sol le RAMASSE');
    ok(pris && pris.i === 80020, 'en nommant le sac sur lequel on se tient');

    /* ---- ET ON PEUT JETER PAR TERRE, MEME SANS SAC DESSOUS ----
     * C'etait le seul geste du jeu qu'on ne pouvait pas faire. Le sol
     * n'existait comme cible que s'il y avait deja un sac dessous : sans sac,
     * plus rien a viser, et on ne pouvait donc jeter quelque chose que la ou
     * quelque chose etait deja tombe. Le serveur savait le faire depuis le
     * debut — il cree un sac s'il n'en trouve pas. Il manquait le geste. */
    /* On s'ECARTE, au lieu d'effacer les sacs de la page : les gestes qu'on
       vient de jouer en ont VRAIMENT depose un sous nos pieds — le serveur
       obeit, il ne fait pas semblant — et vider la liste locale ne l'aurait
       pas fait disparaitre du monde. Un joueur, lui, fait un pas de cote. */
    await p.evaluate(() => { window.__sacs = []; });
    await p.keyboard.down('ArrowUp');
    await p.waitForTimeout(700);
    await p.keyboard.up('ArrowUp');
    await p.waitForTimeout(400);
    const grille = await p.evaluate(() => {
      const b = document.getElementById('nxButin');
      return !!(b && b.offsetParent !== null);
    });
    ok(!grille, 'la grille du sac au sol est bien refermee : il n y a plus rien dessous');

    const revenue = await remetLaPiece();
    ok(revenue, 'la piece est de retour dans le sac pour le geste suivant');
    const avantS = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmDepose').length);
    /* ON REGARDE OU L'ON LACHE. Le point du milieu de la scene n'est « le
       sol » que si rien ne le recouvre — et le voile de mort, lui, recouvre
       tout. Un glissement lache dessus n'envoie rien, et l'essai le lisait
       comme « jeter par terre ne marche pas ». On mesure donc les deux bouts
       du geste au lieu de les supposer. */
    const source = await p.evaluate(() => {
      const c = document.querySelector('#nxSac .nxp-c[data-sac]');
      if (!c) return null;
      const q = c.getBoundingClientRect();
      const sol = document.elementFromPoint(360, 300);
      return { x: q.x + q.width / 2, y: q.y + q.height / 2,
               sol: sol ? (sol.id || sol.className || sol.tagName) : null };
    });
    ok(!!source, 'la case de la piece est bien la pour etre attrapee');
    ok(source && !/nxMortVoile|nxmt/.test(String(source.sol)),
       `et le point vise est bien le sol, pas un voile (${source && source.sol})`);
    if (source) {
      await p.mouse.move(source.x, source.y);
      await p.mouse.down();
      /* En plein milieu de la scene, loin du panneau : c'est le sol. */
      await p.mouse.move(360, 300, { steps: 10 });
      await p.mouse.up();
      /* On attend LE MESSAGE, pas quatre cents millisecondes : c'est lui qui
         dit que le geste a porte, et l'attendre au chrono revient a mesurer
         la charge de la machine. */
      await attend(p, (n) => window.__s[0].__out.filter((m) => m.type === 'realmDepose').length > n,
                   avantS, 'la demande de depot au sol', 3000);
    }
    const jete = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmDepose').pop());
    const apresS = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmDepose').length);
    console.log('\n-- jeter par terre, sans sac dessous --');
    console.log('   ' + JSON.stringify(jete));
    ok(apresS === avantS + 1, 'lacher une piece sur la scene la JETTE par terre');
    ok(jete && jete.item === PIECE.id, `et c est bien celle qu on tenait (${jete && jete.item})`);

    const dansLeSac = await remetLaPiece();
    /* Et une copie PORTEE : c'est la que le joueur regarde avant d'entrer dans
       la lave, ou ce qu'il porte disparait s'il meurt. On passe par le coffre
       et le message d'equipement, pas par une fiche fabriquee. */
    sacDuJoueur.objets = sacDuJoueur.objets || {};
    sacDuJoueur.objets[PIECE.id] = (sacDuJoueur.objets[PIECE.id] || 0) + 1;
    moteur.equipeArme(portefeuille.address, 'andy', PIECE.id);
    await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'personnage', skin: 'andy' })));
    /* La case de la piece PORTEE, attendue elle aussi : le bloc suivant lit
       sa marque, et une case pas encore peinte se lisait « marque absente »
       — ou pire, arretait l'essai sur `null.color`. */
    const surSoi = await attend(p, () => !!document.querySelector('#nxEquip .nxp-c[data-item]'),
                                null, 'la piece portee dans le rayon d equipement');

    /* ---- « OG » : LA PIECE NUMEROTEE SE RECONNAIT ----
     * Les pieces de la boutique existent en nombre fini et se paient en
     * $SWOGE ; celles qui tombent dans le monde ne coutent rien. Rien ne les
     * distinguait a l'oeil — memes saisons, memes raretes — et c'est pourtant
     * la seule chose qu'on veut savoir avant de risquer une piece dans la
     * lave, ou elle disparait si l'on meurt. */
    {
      await p.evaluate((id) => { window.__piece = id; }, PIECE.id);
      const og = await p.evaluate(() => {
        /* LA case de CETTE piece, pas la premiere qui vient : le ramassage
           automatique peut avoir depose un butin reel a cote pendant qu'on
           regardait, et ce butin-la n'est justement PAS numerote. */
        const c = document.querySelector('#nxSac .nxp-c[data-sac="' + window.__piece + '"]')
               || document.querySelector('#nxSac .nxp-c[data-sac]');
        const e = document.querySelector('#nxEquip .nxp-c[data-item]');
        const lis = (n) => { if (!n) return null;
          const b = n.querySelector('.nxp-og');
          if (!b) return { marque: false };
          const q = b.getBoundingClientRect(), qc = n.getBoundingClientRect();
          const s = getComputedStyle(b);
          return { marque: true, texte: b.textContent,
                   /* En HAUT a DROITE de son carre, comme demande. */
                   haut: q.y - qc.y < qc.height / 2,
                   droite: (q.x + q.width) - qc.x > qc.width / 2,
                   fond: s.backgroundColor, encre: s.color,
                   bord: s.borderTopWidth + ' ' + s.borderTopStyle,
                   ombre: s.textShadow,
                   vu: q.width > 0 && q.height > 0 };
        };
        return { sac: lis(c), equip: lis(e) };
      });
      console.log('\n-- la marque OG --');
      console.log('   ' + JSON.stringify(og));
      /* ---- LA CASE D'ABORD, SA COULEUR ENSUITE ----
       * `og.sac.encre` sur un sac vide arretait l'essai net — « Cannot read
       * properties of null » — la ou il fallait lire « la piece n'est pas
       * dans le sac ». Un plantage ne dit pas ce qui manque ; une ligne RATE,
       * si. On nomme donc la condition, puis on lit ce qu'elle garantit. */
      ok(dansLeSac && og.sac, 'la piece du catalogue a bien sa case dans le sac');
      ok(surSoi && og.equip, 'et la piece portee a la sienne');
      const encre = (og.sac && og.sac.encre) || '';
      /* La piece de cet essai vient du CATALOGUE, pas d'un butin : elle doit
         donc porter la marque. */
      ok(og.sac && og.sac.marque, 'une piece du catalogue porte sa marque dans le sac');
      ok(og.sac && og.sac.texte === 'OG', `et elle dit « OG » (${og.sac && og.sac.texte})`);
      ok(og.sac && og.sac.vu, 'elle est visible');
      ok(og.sac && og.sac.haut && og.sac.droite,
         'en haut a DROITE de son carre');
      /* Violette, et SANS pastille : le petit rectangle de couleur posait un
         bout de violet dans un coin, sans rapport avec le dessin qu'il
         recouvrait. Deux lettres detachees par un contour noir se lisent sur
         n'importe quel fond et laissent la case tranquille. */
      const bleu = Number((encre.match(/\d+/g) || [0, 0, 0])[2]);
      const rouge = Number((encre.match(/\d+/g) || [0, 0, 0])[0]);
      ok(bleu > 150 && bleu > rouge, `l encre est violette (${encre})`);
      ok(og.sac && /rgba\(0, 0, 0, 0\)|transparent/.test(og.sac.fond),
         `et rien derriere : pas de pastille (${og.sac && og.sac.fond})`);
      ok(og.sac && /(0px|none)/.test(og.sac.bord), `ni de cadre (${og.sac && og.sac.bord})`);
      ok(og.sac && og.sac.ombre && og.sac.ombre !== 'none',
         'un contour noir la detache de n importe quel fond');
      /* Et sur soi aussi : c'est la ou l'on regarde avant d'entrer dans la
         lave. */
      ok(og.equip && og.equip.marque, 'la piece PORTEE la montre aussi');
      ok(og.equip && og.equip.haut && og.equip.droite, 'au meme endroit de la case');
    }

      /* ---- ANDY EST OFFERT ----
     * Tout le monde en a un, sans avoir rien depose : il n'existe pas de
     * version du jeu ou l'on regarde sans pouvoir jouer. Le rayon des
     * personnages doit le DIRE — « 0 $SWOGE » se lit comme un prix qu'on n'a
     * pas su calculer, « FREE » se lit comme une promesse. */
    {
      const skins = await p.evaluate(async () => {
        const s = window.__s[0];
        s.send(JSON.stringify({ type: 'skins' }));
        await new Promise((f) => setTimeout(f, 400));
        const m = s.__m.filter((x) => x.type === 'skins').pop();
        return m ? { catalogue: m.catalogue, actif: m.actif } : null;
      });
      console.log('\n-- le personnage offert --');
      const andy = skins && skins.catalogue.find((x) => x.id === 'andy');
      console.log('   ' + JSON.stringify({ actif: skins && skins.actif, andy }));
      ok(andy, 'le catalogue porte Andy');
      ok(andy && andy.offert, 'et il est marque OFFERT');
      ok(andy && andy.prix === 0, 'a zero');
      ok(andy && andy.possede, 'et deja possede, sans rien avoir achete');
      ok(skins && skins.actif === 'andy', 'c est lui qu on porte');
      const autres = (skins.catalogue || []).filter((x) => !x.offert);
      ok(autres.length === 5 && autres.every((x) => x.prix > 0),
         `les cinq autres gardent leur prix (${autres.map((x) => x.prix).join(', ')})`);
    }

  /* ---- UNE FIOLE DE STAT SE VOIT DANS LE SAC ----
     * Elle ne se boit plus en la ramassant : elle prend une place, donc elle
     * doit se DESSINER a cette place. Une case vide au milieu du sac se lit
     * comme une place perdue, et le joueur croit avoir perdu la fiole. */
    {
      sacDuJoueur.sacFioles = { def: 1 };
      sacDuJoueur.sacCases = null;
      await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'equipable' })));
      /* La LIGNE de la fiole, attendue pour elle-meme. Au chrono, une reserve
         pas encore repeinte rendait « la fiole n'a pas sa ligne » — un defaut
         annonce la ou tout marche. */
      await attend(p, () => !!document.querySelector('#nxFioles [data-fio]'),
                   null, 'la ligne de la fiole dans la reserve');
      const fio = await p.evaluate(async () => {
        /* ---- ELLE N EST PLUS DANS LE SAC ----
         * Les fioles de stat ont leur propre reserve, a cote des huit cases
         * de butin. Elles en occupaient une chacune, et le nombre de STATS
         * differentes qu on pouvait porter etait donc borne par ce qui
         * restait de sac : avec quatre pieces d equipement, quatre sortes de
         * fioles et pas une de plus.
         * On la cherche la ou elle vit maintenant. */
        const c = document.querySelector('#nxFioles [data-fio]');
        if (!c) return { case: false };
        const u = c.querySelector('u.fiole');
        if (!u) return { case: true, dessin: false };
        const st = getComputedStyle(u);
        const q = u.getBoundingClientRect();
        /* L'IMAGE EXISTE-T-ELLE VRAIMENT ? Un fond qui pointe sur un fichier
           absent se calcule tres bien et ne montre rien : c'est exactement le
           genre de panne qu'un style ne trahit pas. */
        const url = (st.backgroundImage.match(/url\("?([^")]+)"?\)/) || [])[1] || '';
        const charge = url ? await new Promise((res) => {
          const im = new Image();
          im.onload = () => res({ ok: true, w: im.naturalWidth, h: im.naturalHeight });
          im.onerror = () => res({ ok: false });
          im.src = url;
        }) : { ok: false };
        return { case: true, dessin: true, stat: c.getAttribute('data-fio'),
                 compte: (c.querySelector('b') || {}).textContent || '',
                 url: url.split('/').pop(), charge,
                 taille: st.backgroundSize, pos: st.backgroundPosition,
                 vu: q.width > 2 && q.height > 2,
                 largeur: Math.round(q.width), hauteur: Math.round(q.height) };
      });
      console.log('\n-- la fiole dans sa reserve --');
      console.log('   ' + JSON.stringify(fio));
      ok(fio.case, 'la fiole a sa ligne dans la reserve');
      /* Et le SAC, lui, n en porte aucune : c est le fond du changement, et
         c est ce qui rend les huit cases entierement disponibles pour le
         butin. */
      const dansLeSac = await p.evaluate(() =>
        document.querySelectorAll('#nxSac .nxp-c[data-fiole]').length);
      eqOk(dansLeSac, 0, 'et elle ne prend AUCUNE des huit cases de butin');
      ok(fio.dessin, 'sa ligne porte un dessin de fiole');
      /* LE COMPTE se lit dessus. C est la seule question qu on pose a cette
         rangee — combien il m en reste avant de repartir — et une reponse
         qu il faut chercher est une reponse qu on ne lit pas. */
      eqOk(fio.compte, '1', 'avec son compte, lisible sur la fiole');
      ok(fio.vu, `qui a une taille a l ecran (${fio.largeur}x${fio.hauteur})`);
      ok(fio.charge && fio.charge.ok,
         `et dont l image EXISTE vraiment (${fio.url})`);
      ok(fio.charge && fio.charge.w === fio.charge.h * 8,
         `la planche fait huit fioles de large (${fio.charge && fio.charge.w}x${fio.charge && fio.charge.h})`);
      ok(/800%/.test(fio.taille),
         `et le fond en lit une seule (${fio.taille})`);
      /* La COLONNE : la defense n'est pas la premiere fiole de la planche. */
      ok(!/^0(px|%)? /.test(fio.pos),
         `la defense lit sa propre colonne, pas la premiere (${fio.pos})`);
      /* ---- ET QUAND ON LA RAMASSE, LA CASE SE REMPLIT ----
       * La reponse du serveur portait le sac complet, et la page ne le posait
       * pas : la fiole prenait une place qui restait vide a l'ecran, donc le
       * joueur la voyait disparaitre. C'est exactement ce qu'on nous a
       * rapporte — « l'image ne s'affiche pas ». */
      sacDuJoueur.sacFioles = {}; sacDuJoueur.sacCases = null;
      await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'equipable' })));
      /* La reserve VIDE, attendue elle aussi : « on part sans fiole » n'est un
         point de depart que si la page a fini de l'effacer. */
      await attend(p, () => document.querySelectorAll('#nxFioles [data-fio]').length === 0,
                   null, 'la reserve de fioles videe');
      const avantF = await p.evaluate(() =>
        document.querySelectorAll('#nxFioles [data-fio]').length);
      eqOk(avantF, 0, 'on part sans fiole en reserve');
      /* On rejoue la reponse du serveur telle qu'il l'envoie apres un
         ramassage — sac complet compris. */
      sacDuJoueur.sacFioles = { att: 1 }; sacDuJoueur.sacCases = null;
      const reponse = {
        type: 'realmRamasse', sac: 'brun', stat: 'att', auto: true,
        sacJoueur: moteur.sacPour(portefeuille.address),
        fioles: moteur.fiolesPour(portefeuille.address),
      };
      await p.evaluate((m) => window.__s[0].dispatchEvent(
        new MessageEvent('message', { data: JSON.stringify(m) })), reponse);
      await attend(p, () => document.querySelectorAll('#nxFioles [data-fio]').length === 1,
                   null, 'la ligne remplie apres le ramassage');
      const apresF = await p.evaluate(() => {
        const c = document.querySelector('#nxFioles [data-fio]');
        return { n: document.querySelectorAll('#nxFioles [data-fio]').length,
                 stat: c ? c.getAttribute('data-fio') : null,
                 dessin: !!(c && c.querySelector('u.fiole')) };
      });
      console.log('   apres ramassage : ' + JSON.stringify(apresF));
      eqOk(apresF.n, 1, 'ramasser une fiole remplit sa ligne, tout de suite');
      eqOk(apresF.stat, 'att', 'et c est bien celle qu on a prise');
      ok(apresF.dessin, 'avec son dessin — pas une case vide');

      sacDuJoueur.sacFioles = {};
      sacDuJoueur.sacCases = null;
      await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'equipable' })));
      await attend(p, () => document.querySelectorAll('#nxFioles [data-fio]').length === 0,
                   null, 'la reserve de fioles remise a vide');
    }

    /* ---- LE CLASSEMENT DU MONDE ----
     * Les personnages VIVANTS, a l'XP. On classe le PERSONNAGE et pas le
     * compte : « tu meurs, tu perds tout » n'est vrai que si le rang tombe
     * avec lui. Et la ligne montre ce qu'il porte — etre en haut doit faire
     * de vous une cible, ce qu'un nom seul ne dit pas.
     * Le personnage de cet essai vient de tuer des choses : il a de l'XP,
     * donc il EST au tableau. C'est ce qui rend l'essai honnete — on ne
     * verifie pas un tableau vide. */
    /* On lui donne de l'XP par le chemin qu'emprunte une vraie mise a mort :
       le tableau ne classe que ceux qui en ont, et un tableau vide ne prouve
       rien. Les monstres de cet essai sont trop loin pour mourir a temps. */
    moteur.gagneXpCombat(portefeuille.address, 'andy', 5000);
    /* L'arme est deja portee — la marque « OG » l'a mise juste avant. La
       ligne du classement doit la montrer : etre en haut fait de vous une
       cible, ce qu'un nom seul ne dit pas. */
    moteur._cmCache = null;
    await p.evaluate(() => document.getElementById('nxRang').click());
    /* Une ligne du tableau, attendue par `attend` : un `waitForFunction` nu
       jette a l'expiration, et la promesse rejetee arretait tout l'essai au
       lieu de nommer ce qui n'est pas venu. */
    const classe = await attend(p, () => {
      const c = document.getElementById('nxRangCorps');
      return c && c.querySelectorAll('.nxrg-l').length > 0;
    }, null, 'une ligne dans le tableau du classement', 8000);
    ok(classe, 'le tableau du classement s est rempli');
    const rang = await p.evaluate(() => {
      const v = document.getElementById('nxRangVoile');
      const l = [...document.querySelectorAll('#nxRangCorps .nxrg-l')];
      const un = l[0] || document.createElement('div');
      const txt = (q) => { const e = un.querySelector(q); return e ? e.textContent : ''; };
      return {
        ouvert: v.classList.contains('on'),
        vu: v.getBoundingClientRect().width > 0,
        n: l.length,
        moi: l.filter((x) => x.classList.contains('moi')).length,
        premier: {
          rang: txt('.nxrg-r'),
          nom: txt('.nxrg-n'),
          detail: txt('.nxrg-x'),
          tenue: un.querySelectorAll('.nxrg-t i').length,
        },
        sous: document.getElementById('nxRangSous').textContent,
        demandes: window.__s[0].__out.filter((m) => m.type === 'leaderboardMonde').length,
      };
    });
    console.log('\n-- le classement du monde --');
    console.log('   ' + JSON.stringify(rang));
    ok(rang.ouvert && rang.vu, 'le bouton du trophee ouvre le tableau');
    ok(rang.demandes >= 1, 'et il le DEMANDE au serveur, il ne l invente pas');
    ok(rang.n >= 1, `il y a au moins une ligne (${rang.n})`);
    ok(rang.moi >= 1, 'notre propre personnage y est, marque comme le notre');
    ok(rang.premier.rang === '1', 'la premiere ligne porte le rang 1');
    ok(rang.premier.nom.length > 0, `avec un nom (${rang.premier.nom})`);
    /* Le PERSONNAGE, pas le compte : la ligne nomme le skin et son niveau. */
    ok(/Lvl \d+/.test(rang.premier.detail) && /andy|pepe|brett|claude|landwolf|ogswoge/.test(rang.premier.detail),
       `et elle nomme le personnage, pas seulement le compte (${rang.premier.detail})`);
    ok(/XP/.test(rang.premier.detail), 'et son XP');
    /* Ce qu'il porte. Le personnage de cet essai a une arme equipee — elle
       doit se voir, sinon « etre en haut fait de vous une cible » n'est
       qu'une phrase. */
    ok(rang.premier.tenue >= 1,
       `sa tenue est montree (${rang.premier.tenue} piece(s))`);
    /* La dotation se lit : un classement sans enjeu n'en est pas un. */
    ok(/gold/i.test(rang.sous) && /20,000|20000/.test(rang.sous) && /month/i.test(rang.sous),
       `la dotation MENSUELLE est annoncee (${rang.sous.replace(/\s+/g, ' ').slice(0, 90)})`);

    /* Il se ferme, et il ARRETE de demander : un tableau ferme qu'on
       redemande toutes les cinq secondes, c'est une requete par joueur pour
       un ecran que personne ne regarde. */
    await p.evaluate(() => {
      const x = document.querySelector('#nxRangVoile .nxcf-x');
      if (x) x.click();
    });
    await p.waitForTimeout(200);
    const apresFerme = await p.evaluate(() => ({
      on: document.getElementById('nxRangVoile').classList.contains('on'),
      n: window.__s[0].__out.filter((m) => m.type === 'leaderboardMonde').length,
    }));
    ok(!apresFerme.on, 'la croix le ferme');
    await p.waitForTimeout(1200);
    const plusTard = await p.evaluate(() =>
      window.__s[0].__out.filter((m) => m.type === 'leaderboardMonde').length);
    ok(plusTard === apresFerme.n, 'et ferme, il ne demande plus rien');

    /* ---- DOUBLE-CLIC SUR UNE PIECE DU SAC : ON LA PORTE ----
     * Le meme geste que sur le sac au sol, et pour la meme raison : la case
     * est une POIGNEE, donc un clic simple ne peut pas agir — un clic
     * legerement de travers deviendrait un equipement qu'on n'a pas demande.
     * UN seul message : c'est le serveur qui porte la piece ET rend celle
     * qu'on avait, dans le sac. En deux messages, l'ancienne restait au
     * coffre — que le joueur ne voit pas depuis le monde. */
    /* ---- LE SAC N'A PAS SURVECU AUX BLOCS PRECEDENTS ----
     * Il ne s'agit pas d'etre prudent : entre ce bloc et celui qui a pose la
     * piece, on a glisse deux fois, jete une fois, et le joueur a pu MOURIR —
     * ce qui vide le sac cote serveur. Le `null` qui suivait arretait l'essai
     * sur `getBoundingClientRect`, a la deux-cent-unieme verification, sans
     * rien dire de ce qui manquait. Chaque bloc repose donc sa propre piece,
     * comme le dit le commentaire de `remetLaPiece`. */
    const pourLeClic = await remetLaPiece();
    ok(pourLeClic, 'la piece est dans le sac pour le double-clic');
    const avantE = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'equipeDuSac').length);
    const boite = await p.evaluate(() => {
      const c = document.querySelector('#nxSac .nxp-c[data-sac]');
      if (!c) return null;
      const q = c.getBoundingClientRect();
      return { x: q.x + q.width / 2, y: q.y + q.height / 2, id: Number(c.dataset.sac) };
    });
    ok(!!boite, 'et sa case a une place a l ecran');
    if (boite) {
      await p.mouse.move(boite.x, boite.y);
      await p.mouse.down(); await p.mouse.up();
      /* ---- ON ATTEND QUE LE CONTRAIRE NE SE PRODUISE PAS ----
       * « Rien n'est parti » ne s'attend pas a une condition : il n'y a rien a
       * guetter. On laisse donc passer le temps du double-clic du navigateur,
       * et c'est le seul sommeil que ce fichier garde volontiers — il mesure
       * un delai de L'INTERFACE, pas la charge de la machine. */
      await p.waitForTimeout(400);
      const apresClic = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'equipeDuSac').length);
      ok(apresClic === avantE, 'un clic simple n equipe rien : la case est une poignee');

      await p.mouse.dblclick(boite.x, boite.y);
      await attend(p, (n) => window.__s[0].__out.filter((m) => m.type === 'equipeDuSac').length > n,
                   avantE, 'la demande d equipement depuis le sac', 3000);
      const porte = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'equipeDuSac').pop());
      const apresE = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'equipeDuSac').length);
      console.log('\n-- double-clic dans le sac --');
      console.log('   ' + JSON.stringify(porte));
      ok(apresE === avantE + 1, 'un double-clic envoie UNE demande, pas dix');
      ok(porte && porte.item === boite.id, `et il nomme la piece touchee (${porte && porte.item})`);
      ok(porte && porte.skin, 'avec le personnage qui la porte');
    }
  }

  /* ---- AU DOIGT : LE RETOUR AU NEXUS EST A DROITE ----
   *
   * Il a d'abord ete pose au-dessus de la fleche du haut. C'etait une erreur :
   * le pouce gauche tient les quatre directions EN CONTINU pendant un combat,
   * et un bouton qui SORT du monde a un demi-centimetre de « avancer » finit
   * par etre touche pendant qu'on recule d'un golem. La main droite, elle, ne
   * fait que des gestes ponctuels — le tir, et rentrer chez soi.
   *
   * Le meme compte, un autre ecran : on verifie le meme joueur dans deux
   * mains differentes, pas deux joueurs. */
  const t = await ouvre({ width: 412, height: 880 }, true);
  await t.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  /* L'ENTREE, pas une seconde six : c'est le message du serveur qui dit qu'on
     est dans le monde, et tout ce bloc en depend — les boutons du monde
     n'existent pas avant lui. */
  await attend(t, () => window.__s[0].__m.some((m) => m.type === 'realmEntre'),
               null, 'l entree de la page tactile dans le monde');

  const boutons = await t.evaluate(() => {
    const r = (id) => { const e = document.getElementById(id); if (!e) return null;
      const q = e.getBoundingClientRect();
      return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width),
               h: Math.round(q.height), vu: q.width > 0 && q.height > 0 }; };
    return { maison: r('nxMaison'), vise: r('nxVise'), pad: r('nxPad'),
             pow: r('nxPow'),
             largeur: window.innerWidth, hauteur: window.innerHeight,
             dansLePad: !!document.querySelector('#nxPad [data-nexus]') };
  });
  console.log('\n-- les commandes tactiles --');
  console.log('   maison : ' + JSON.stringify(boutons.maison));
  console.log('   visee  : ' + JSON.stringify(boutons.vise));
  console.log('   pave   : ' + JSON.stringify(boutons.pad));

  ok(boutons.maison && boutons.maison.vu, 'le bouton maison est visible au doigt');
  ok(!boutons.dansLePad, 'et il n est PLUS dans le pave de deplacement');
  if (boutons.maison && boutons.vise && boutons.pad) {
    /* ---- LES DEUX MOITIES SE TOUCHENT ET NE SE CHEVAUCHENT PAS ----
     * Le manche prend la gauche de l'aire de jeu, la visee la droite. Un
     * recouvrement ferait tirer en marchant sur la bande commune ; un trou
     * ferait une bande morte ou le doigt ne fait rien, et rien ne le dirait. */
    ok(Math.abs(boutons.pad.x + boutons.pad.w - boutons.vise.x) <= 1,
       `le manche et la visee se partagent l'aire de jeu sans trou ni recouvrement ` +
       `(${boutons.pad.x + boutons.pad.w} contre ${boutons.vise.x})`);
    /* Et elles couvrent la HAUTEUR : on pose le pouce ou l'on veut, pas dans
       un rectangle qu'il faut viser. C'etait tout le probleme du manche fixe. */
    ok(boutons.pad.h > boutons.hauteur * 0.8 && boutons.vise.h > boutons.hauteur * 0.8,
       `et chacune couvre la hauteur de l'ecran (${boutons.pad.h} et ${boutons.vise.h} sur ${boutons.hauteur})`);
    /* ---- LE RETOUR AU NEXUS N'EST SOUS AUCUN DES DEUX POUCES ----
     * Il SORT du monde. Pose la ou le pouce gauche marche, on le touche en
     * reculant d'un golem ; pose la ou le pouce droit tire, on le touche en
     * tirant. Il est donc au milieu, entre les deux — la ou aucun des deux ne
     * traine et ou les deux arrivent. */
    ok(boutons.maison.x >= boutons.pad.x + boutons.pad.w,
       'le retour au Nexus est hors de la zone qui fait marcher');
    ok(boutons.maison.x < boutons.vise.x + boutons.vise.w * 0.35,
       `et il est pres du milieu, pas la ou le pouce droit se pose ` +
       `(${boutons.maison.x} pour une moitie droite de ${boutons.vise.x} a ${boutons.vise.x + boutons.vise.w})`);
    /* ---- ET IL TIENT DANS LE TIERS DU BAS ----
     * Le pouce atteint le bas de l'ecran, pas le haut. Un bouton en haut d'un
     * telephone demande de lacher l'appareil pour s'en servir. */
    ok(boutons.maison.y > boutons.hauteur * 0.66,
       `il est dans le tiers du bas (${boutons.maison.y} sur ${boutons.hauteur})`);
    if (boutons.pow && boutons.pow.vu) {
      ok(boutons.pow.y > boutons.hauteur * 0.66,
         `le bouton de pouvoir aussi (${boutons.pow.y} sur ${boutons.hauteur})`);
      /* Ils sont EMPILES, pas cote a cote : la moitie droite d'un telephone ne
         fait que cent vingt et un pixels panneau ouvert, et le bouton de
         pouvoir en fait cent vingt-six a lui seul. On verifie donc qu'ils ne se
         recouvrent pas — la question est celle-la, pas leur rangement. */
      const seRecouvrent =
        boutons.pow.x < boutons.maison.x + boutons.maison.w &&
        boutons.pow.x + boutons.pow.w > boutons.maison.x &&
        boutons.pow.y < boutons.maison.y + boutons.maison.h &&
        boutons.pow.y + boutons.pow.h > boutons.maison.y;
      ok(!seRecouvrent, 'et les deux ne se marchent pas dessus');
    }
    /* Il repose sur le bas de l'ecran, comme le pouvoir : deux boutons voisins
       cales sur la meme ligne se trouvent du coin de l'oeil, deux boutons a
       des hauteurs differentes se cherchent. */
    ok(boutons.maison.y + boutons.maison.h < boutons.hauteur,
       `et il tient entierement a l'ecran (${boutons.maison.y}+${boutons.maison.h} sur ${boutons.hauteur})`);
  }

  /* ================== LE TIR AUTOMATIQUE, SOUS LE POUCE ==================
   *
   * « Est-ce qu'on peut avoir un bouton auto-fire, pour ne pas avoir a ouvrir
   * l'inventaire et les reglages pour l'activer ? » Le reglage existait, au
   * bout de trois gestes — ouvrir le panneau, descendre, trouver la bascule —
   * et sur telephone le panneau est justement REPLIE pendant qu'on se bat.
   *
   * Ce qui se mesure ici n'est pas « un bouton existe ». C'est :
   *   - qu'il est ATTEIGNABLE : dans le tiers du bas, hors de la moitie qui
   *     fait marcher, et que le doigt pose dessus l'atteint VRAIMENT — les
   *     deux zones de jeu couvrent tout l'ecran, et un z-index mal choisi le
   *     rendrait visible et mort ;
   *   - qu'il COMMANDE le meme reglage que les deux autres surfaces. Trois
   *     etats tenus a la main finiraient par se contredire, et le joueur
   *     lirait « OFF » pendant que ca tire ;
   *   - qu'il reste a l'ecran quand le tir est ETEINT. C'est le piege exact :
   *     un bouton qui disparait avec le reglage qu'il commande ne peut plus le
   *     rallumer.
   */
  console.log('\n-- le tir automatique, sous le pouce --');
  {
    const boite = await t.evaluate(() => {
      const e = document.getElementById('nxAutoTac');
      if (!e) return null;
      const q = e.getBoundingClientRect();
      const pad = document.getElementById('nxPad').getBoundingClientRect();
      const sous = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
      const chevauche = (id) => { const o = document.getElementById(id);
        if (!o) return false; const r = o.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        return q.x < r.right && q.x + q.width > r.left
            && q.y < r.bottom && q.y + q.height > r.top; };
      return { vu: q.width > 0 && q.height > 0,
               x: Math.round(q.x), y: Math.round(q.y),
               w: Math.round(q.width), h: Math.round(q.height),
               finDuPave: Math.round(pad.x + pad.width), hauteur: window.innerHeight,
               recu: sous ? (sous.closest('#nxAutoTac') ? 'ok' : ('#' + (sous.id || sous.tagName))) : 'rien',
               surPow: chevauche('nxPow'), surMaison: chevauche('nxMaison'),
               surPot: chevauche('nxPot'), surButin: chevauche('nxButinFlot') };
    });
    console.log('   ' + JSON.stringify(boite));
    ok(boite && boite.vu, 'le bouton du tir automatique est a l ecran dans le monde');
    if (boite && boite.vu) {
      ok(boite.x >= boite.finDuPave,
         `il est hors de la zone qui fait marcher (${boite.x} contre ${boite.finDuPave})`);
      ok(boite.y > boite.hauteur * 0.5,
         `et dans la moitie basse, a portee du pouce (${boite.y} sur ${boite.hauteur})`);
      ok(boite.y + boite.h < boite.hauteur,
         `il tient entierement a l ecran (${boite.y}+${boite.h})`);
      /* Le seul essai qui attraperait un z-index mal choisi : on demande au
         navigateur QUI recoit le doigt a cet endroit precis. */
      ok(boite.recu === 'ok',
         `le doigt pose dessus l atteint, pas la zone de jeu (${boite.recu})`);
      ok(!boite.surPow && !boite.surMaison && !boite.surPot && !boite.surButin,
         'et il ne se marche pas dessus avec les autres boutons de la colonne');
    }

    /* ---- IL COMMANDE LE MEME REGLAGE QUE LES DEUX AUTRES ----
     * On lit les TROIS surfaces apres chaque appui : le bouton lui-meme, le
     * temoin sur la scene, et la bascule des reglages. Une seule qui ne suit
     * pas, et le joueur lit un etat qui n'est pas celui du jeu. */
    const etat = () => t.evaluate(() => ({
      bouton: document.getElementById('nxAutoTac').classList.contains('actif'),
      aria: document.getElementById('nxAutoTac').getAttribute('aria-pressed'),
      aLEcran: document.getElementById('nxAutoTac').classList.contains('on'),
      temoin: document.getElementById('nxAuto').classList.contains('on'),
      reglage: document.getElementById('nxAutoBtn').textContent.trim(),
      garde: (() => { try { return localStorage.getItem('swogeNexusAuto'); } catch (e) { return null; } })(),
    }));
    const av = await etat();
    await t.evaluate(() => document.getElementById('nxAutoTac').click());
    await t.waitForTimeout(250);
    const ap = await etat();
    console.log('   avant : ' + JSON.stringify(av));
    console.log('   apres : ' + JSON.stringify(ap));
    ok(ap.bouton !== av.bouton, 'un appui change le reglage');
    ok(ap.bouton === ap.temoin && ap.bouton === (ap.reglage === 'ON'),
       `les trois surfaces disent la MEME chose (bouton ${ap.bouton}, temoin ${ap.temoin},`
       + ` reglage ${ap.reglage})`);
    ok(ap.aria === (ap.bouton ? 'true' : 'false'),
       'et il le dit aussi a qui ne voit pas les couleurs');
    ok(ap.garde === (ap.bouton ? '1' : '0'),
       `le choix est garde pour la prochaine visite (${ap.garde})`);
    /* ---- LE PIEGE ----
     * `.on` decide s il est A L ECRAN, `.actif` s il est ALLUME. Les melanger
     * ferait disparaitre le bouton des qu on eteint le tir — au moment precis
     * ou il faut pouvoir le rallumer. */
    ok(ap.aLEcran, 'et il reste a l ecran quel que soit l etat du reglage');
    /* On le remet dans son etat d avant : les blocs suivants tirent. */
    await t.evaluate(() => document.getElementById('nxAutoTac').click());
    await t.waitForTimeout(200);
    const fin = await etat();
    ok(fin.bouton === av.bouton, 'un second appui le remet comme il etait');

    /* ---- ET IL N EXISTE PAS DANS LE NEXUS ----
     * Allume la ou l on ne tire pas, il proposerait de regler quelque chose
     * qui n y sert a rien. Meme regle que la zone de tir. */
    const auNexus = await p.evaluate(() => {
      const e = document.getElementById('nxAutoTac');
      return e ? e.getBoundingClientRect().width : -1;
    });
    ok(auNexus === 0,
       `a la souris il ne s affiche pas : le clavier et les reglages suffisent (${auNexus})`);
  }

  /* ---- LE SAC AU SOL, HORS DU PANNEAU ----
   * Le cas qui comptait : panneau REPLIE — la facon normale de jouer sur
   * telephone — et un sac sous les pieds. La grille du panneau est alors
   * inaccessible ; la rangee flottante, elle, doit etre la. */
  await t.evaluate(() => { document.getElementById('nxWrap').classList.add('replie'); });
  /* SA position a lui. Le compte est le meme, mais rejoindre une seconde fois
     fait reapparaitre ailleurs : poser le sac aux coordonnees de la premiere
     page le laissait a des milliers d'unites, hors du rayon de ramassage — et
     la rangee restait vide sans que rien ne soit casse. */
  const moiT = await t.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
    return e ? { x: e.moi.x, y: e.moi.y } : null;
  });
  ok(!!moiT, 'la page tactile est bien entree dans le monde');
  await t.evaluate(async ([x, y]) => {
    window.__sacs = [{ i: 80030, x: x, y: y, s: 'bleu', r: 55,
                       c: [{ st: 'att' }, { po: 'vie' }] }];
    for (let k = 0; k < 30; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
  }, [moiT ? moiT.x : 0, moiT ? moiT.y : 0]);
  /* LA RANGEE, pas quatre cents millisecondes : c'est elle qu'on mesure, et
     une rangee pas encore allumee ne se distingue pas d'une rangee absente. */
  await attend(t, () => document.getElementById('nxButinFlot').classList.contains('on'),
               null, 'la rangee flottante du sac au sol');

  const flot = await t.evaluate(() => {
    const el = document.getElementById('nxButinFlot');
    const q = el.getBoundingClientRect();
    const pan = document.getElementById('nxPanneau');
    const cases = [].map.call(el.querySelectorAll('[data-flot]'), (c) => ({
      place: Number(c.dataset.flot), titre: c.getAttribute('title'),
      vu: c.getBoundingClientRect().width > 0,
    }));
    return { visible: el.classList.contains('on'), y: Math.round(q.y),
             h: Math.round(q.height), cases,
             panneauLu: pan ? Math.round(pan.getBoundingClientRect().x) : null,
             hauteur: window.innerHeight };
  });
  console.log('\n-- le sac au sol, panneau replie --');
  console.log('   ' + JSON.stringify(flot));
  ok(flot.visible, 'panneau replie, le sac au sol reste atteignable');
  ok(flot.cases.length === 2, `elle ne montre que les places PLEINES (${flot.cases.length}, pas 8)`);
  if (flot.cases.length) {
    ok(flot.cases.every((c) => c.vu), 'et chacune est reellement visible');
    ok(/ATT/.test(flot.cases[0].titre), 'la premiere dit ce qu elle donne : ' + flot.cases[0].titre);
  }

  /* ---- LES ZONES DE JEU NE MANGENT PAS LES BOUTONS ----
   *
   * Le manche et la visee couvrent maintenant TOUT l'ecran a elles deux. Avant,
   * la rangee du butin etait protegee par un calcul de hauteur : la zone du
   * manche s'arretait sous elle. Cette protection-la n'existe plus, et la
   * remplacer par une autre mesure de hauteur aurait reconduit le meme piege.
   * Ce qui protege desormais, c'est l'ORDRE DE SUPERPOSITION — et un ordre ne
   * se verifie pas en lisant un chiffre de style, il se verifie en demandant au
   * navigateur QUI recoit le doigt a cet endroit precis. C'est le seul essai
   * qui aurait attrape un `z-index` mal choisi.
   * Panneau replie : le cas le plus dur, les deux zones sont au plus large. */
  const atteint = await t.evaluate(() => {
    const q = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return 'absent';
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return 'absent';
      const sous = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!sous) return 'rien';
      return sous.closest(sel) ? 'ok' : ('#' + (sous.id || sous.tagName));
    };
    return { butin: q('#nxButinFlot .fl'), potion: q('#nxPot button'),
             maison: q('#nxMaison'), pouvoir: q('#nxPow') };
  });
  console.log('   qui recoit le doigt : ' + JSON.stringify(atteint));
  for (const [quoi, r] of Object.entries(atteint)) {
    if (r === 'absent') continue;   // rien a l'ecran a ce moment-la : rien a garder
    ok(r === 'ok', `le doigt pose sur « ${quoi} » atteint ${quoi}, pas la zone de jeu (${r})`);
  }

  /* Un simple appui prend. C'est le seul endroit du jeu ou un clic simple
     prend quelque chose : cette case-la n'est pas une poignee. */
  const avantF = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  await t.evaluate(() => {
    const c = document.querySelector('#nxButinFlot [data-flot="1"]');
    if (c) c.click();
  });
  await t.waitForTimeout(400);
  const dem = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').pop());
  const apresF = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  console.log('   appui : ' + JSON.stringify(dem));
  ok(apresF === avantF + 1, 'un simple appui prend, et une seule fois');
  ok(dem && dem.i === 80030 && dem.place === 1, 'en nommant le sac et la place touchee');

  /* Elle disparait avec le sac : une rangee qui resterait laisserait croire
     qu'on peut encore prendre quelque chose reste vingt metres en arriere. */
  await t.evaluate(async () => {
    window.__sacs = [];
    for (let k = 0; k < 20; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
  });
  await t.waitForTimeout(300);
  const partie = await t.evaluate(() => document.getElementById('nxButinFlot').classList.contains('on'));
  ok(!partie, 's eloigner fait disparaitre la rangee');

  /* ---- ET LES DEUX FIOLES AU DOIGT ----
   * Meme raison que la rangee de butin : le panneau est replie pendant qu'on
   * se bat, et c'est justement la qu'on a besoin de boire. */
  await t.evaluate(() => {
    window.__s[0].dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
      type: 'potionBue', cle: 'vie', quoi: 'hp', soigne: 100, reste: 2,
      potions: [
        { cle: 'vie', nom: 'Health Potion', quoi: 'hp', soigne: 100, image: 'potion_rouge', max: 99, quantite: 2 },
        { cle: 'mana', nom: 'Magic Potion', quoi: 'mp', soigne: 100, image: 'potion_bleue', max: 99, quantite: 0 },
      ],
    }) }));
  });
  await t.waitForTimeout(300);
  const fioles = await t.evaluate(() => {
    const el = document.getElementById('nxPot');
    const q = el.getBoundingClientRect();
    const b0 = el.querySelector('[data-pot]');
    const r0 = b0 ? b0.getBoundingClientRect() : null;
    const sous = r0 ? document.elementFromPoint(r0.x + r0.width / 2, r0.y + r0.height / 2) : null;
    return {
      on: el.classList.contains('on'), y: Math.round(q.y), h: Math.round(q.height),
      hauteur: window.innerHeight,
      recu: sous ? (sous.closest('#nxPot [data-pot]') ? 'ok' : ('#' + (sous.id || sous.tagName))) : 'rien',
      boutons: [].map.call(el.querySelectorAll('[data-pot]'), (b) => ({
        cle: b.dataset.pot, mort: b.disabled, n: b.querySelector('b').textContent })),
    };
  });
  console.log('\n-- les fioles au doigt --');
  console.log('   ' + JSON.stringify(fioles));
  ok(fioles.on, 'panneau replie, les potions restent atteignables');
  ok(fioles.boutons.length === 2, 'les deux fioles sont la');
  ok(fioles.boutons[0].n === '2', 'avec leur compte : ' + fioles.boutons[0].n);
  ok(fioles.boutons[1].mort, 'et celle qu on n a pas est grisee');
  /* ---- ELLES RECOIVENT LE DOIGT ----
   * Elles etaient protegees par la hauteur : la zone du manche s'arretait sous
   * elles. Cette zone couvre maintenant tout l'ecran, et remplacer ce calcul de
   * hauteur par un autre calcul de hauteur aurait reconduit le meme piege. Ce
   * qui protege desormais est l'ORDRE DE SUPERPOSITION — et cela ne se lit pas
   * dans une feuille de style, cela se demande au navigateur. */
  ok(fioles.recu === 'ok',
     `le doigt pose sur une fiole atteint la fiole, pas la zone de marche (${fioles.recu})`);
  /* Et elles restent dans le tiers du bas : boire se fait en marchant, du meme
     pouce, sans lacher l'appareil. */
  ok(fioles.y > fioles.hauteur * 0.66,
     `elles restent a portee du pouce (${fioles.y} sur ${fioles.hauteur})`);

  const avantT = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
  await t.evaluate(() => {
    const b = document.querySelector('#nxPot [data-pot="vie"]');
    if (b) b.click();
  });
  await t.waitForTimeout(300);
  const apresT = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
  ok(apresT === avantT + 1, 'un appui boit');
  await t.evaluate(() => {
    const b = document.querySelector('#nxPot [data-pot="mana"]');
    if (b) b.click();
  });
  await t.waitForTimeout(250);
  const apresVideT = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
  ok(apresVideT === apresT, 'et la fiole grisee ne demande rien');

  /* ================== JETER PAR TERRE, AU DOIGT ==================
   *
   * « Sur telephone quand on drop un item il se met dans le sac ; je voulais
   * le lacher par terre et c'est impossible. » Le geste existait, l'essai qui
   * le garde existait — a LA SOURIS. Et a la souris il ne pouvait pas tomber :
   * le manche et la zone de tir y sont en `display:none`, donc le pointeur
   * touchait le canvas et la remontee trouvait le sol.
   *
   * Au doigt, ces deux zones couvrent l'aire de jeu en entier. Elles sont
   * transparentes — `opacity:0`, rien de peint — mais elles PRENNENT les
   * evenements, c'est tout leur role : `elementFromPoint` rendait l'une des
   * deux, jamais le canvas, la remontee ne trouvait rien, et le lacher sortait
   * sans un mot. La piece semblait revenir dans le sac : elle n'en etait
   * jamais sortie.
   *
   * On mesure donc les DEUX moities, parce que ce sont deux elements
   * differents et qu'en reconnaitre un seul aurait laisse la moitie de l'ecran
   * muette — la moitie droite pour un droitier, celle ou le pouce se pose
   * justement le plus. Et l'on ecrit CE QUE le doigt touche a cet endroit :
   * sans ce temoin, le jour ou une troisieme zone apparaitra, l'essai tombera
   * en disant « le depot ne part pas » sans dire sur quoi le doigt a atterri. */
  console.log('\n-- jeter par terre, au doigt --');
  await t.evaluate(() => { document.getElementById('nxWrap').classList.remove('replie'); });
  await t.waitForTimeout(350);
  /* Le voile de mort couvre tout l'ecran, y compris les deux zones : lache
     dessus, rien ne part, et l'essai lirait « le depot ne marche pas » d'un
     geste qui marche. */
  await assureVivant(t);
  await t.waitForTimeout(400);
  /* Pas de sac sous les pieds : c'est le cas qui compte. On jette par terre,
     le serveur cree le sac. */
  await t.evaluate(() => { window.__sacs = []; });

  const remetLaPieceT = async () => {
    await assureVivant(t);
    sacDuJoueur.sac = {}; sacDuJoueur.sac[PIECE.id] = 1;
    sacDuJoueur.sacCases = null;
    await t.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'equipable' })));
    return attend(t, (id) => !!document.querySelector('#nxSac .nxp-c[data-sac="' + id + '"]'),
                  PIECE.id, 'la piece dans le sac de la page tactile');
  };

  async function mesureLeGeste(part) { return t.evaluate((part) => {
    const c = document.querySelector('#nxSac .nxp-c[data-sac]');
    const pan = document.getElementById('nxPanneau');
    if (!c || !pan) return null;
    const q = c.getBoundingClientRect();
    /* Le milieu de l'AIRE DE JEU, pas de la fenetre : le panneau en mange
       cent soixante-dix, et viser le milieu de l'ecran serait viser le
       panneau. */
    const jeu = pan.getBoundingClientRect().x;
    const x = Math.round(jeu * part), y = Math.round(window.innerHeight * 0.5);
    const sous = document.elementFromPoint(x, y);
    return { sx: q.x + q.width / 2, sy: q.y + q.height / 2, x, y,
             /* ---- ET CE QUE LA CASE LAISSE FAIRE AU DOIGT ----
              * On le lit ICI, sur la case qu'on s'apprete a attraper, plutot
              * que dans un bloc a part : le relever ailleurs demandait de
              * remettre une piece dans le sac, donc de relancer un
              * personnage mort — ce qui lui rendait ses potions et faisait
              * tomber, quarante lignes plus bas, un essai qui ne parle pas
              * du tout de glissement. Une mesure ne doit rien deranger. */
             prise: getComputedStyle(c).touchAction,
             touche: sous ? ('#' + (sous.id || sous.className || sous.tagName)) : 'rien' };
  }, part); }

  for (const cote of [{ nom: 'la moitie GAUCHE (celle qui fait marcher)', part: 0.25 },
                      { nom: 'la moitie DROITE (celle qui tire)', part: 0.75 }]) {
    /* ---- ON REMET LA PIECE, ET L'ON MESURE DANS LA FOULEE ----
     * Le premier lacher DEPOSE vraiment : le serveur sort la piece du sac et
     * le redit a la page. On la remet, la case reapparait — puis un etat du
     * serveur arrivait entre l'attente et la mesure, la case disparaissait, et
     * la lecture rendait `null`. L'essai disait alors « on ne trouve pas la
     * case » d'un sac qui en avait une une milliseconde plus tot.
     * On refait donc les deux ensemble, jusqu'a trois fois : ce qu'on mesure
     * est le LACHER, pas la vitesse a laquelle deux messages se croisent. */
    let geste = null, dedans = false;
    for (let essai = 0; essai < 3 && !geste; essai++) {
      dedans = await remetLaPieceT();
      if (!dedans) continue;
      geste = await mesureLeGeste(cote.part);
    }
    ok(dedans, `la piece est dans le sac avant de viser ${cote.nom}`);
    if (!dedans) continue;
    ok(!!geste, `on trouve la case et l aire de jeu pour ${cote.nom}`);
    if (!geste) continue;
    console.log(`   ${cote.nom} : le doigt en (${geste.x},${geste.y}) touche ${geste.touche}`
                + ` — la case rend touch-action:${geste.prise}`);
    /* ---- UNE POIGNEE NE FAIT PAS DEFILER ----
     * Le second defaut du lacher au doigt, et le plus discret des deux : le
     * panneau defile (`overflow-y:auto`), donc un doigt qui part d'une case
     * vers la gauche est un geste de defilement POSSIBLE. Le navigateur le
     * donne au panneau et envoie un `pointercancel` a la page ; le glissement
     * s'arrete sans un mot, la piece a l'air de retourner dans le sac, et le
     * joueur voit le panneau bouger. C'est mot pour mot ce qu'on nous a
     * ecrit : « ca ne fonctionne pas et le panneau bouge ».
     * `preventDefault()` ne decide pas du defilement — `touch-action` seul le
     * decide, et il est lu quand le doigt SE POSE. La page le mettait sur le
     * corps au debut du glissement : une image trop tard, precisement pour le
     * geste qu'il devait proteger. La regle est donc statique sur la case, et
     * c'est le style CALCULE qu'on lit, pas la feuille de style. */
    ok(geste.prise === 'none',
       `la case ne se laisse pas voler par le defilement du panneau (${geste.prise})`);
    /* Le voile de mort se reconnait ici aussi : s'il est revenu entre-temps,
       ce n'est pas le sol qu'on vise et le depot ne peut pas partir. */
    ok(!/nxMortVoile|nxmt/.test(geste.touche),
       `et ce n est pas un voile de mort (${geste.touche})`);
    const avant = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmDepose').length);
    await t.mouse.move(geste.sx, geste.sy);
    await t.mouse.down();
    await t.mouse.move(geste.x, geste.y, { steps: 10 });
    await t.mouse.up();
    await attend(t, (n) => window.__s[0].__out.filter((m) => m.type === 'realmDepose').length > n,
                 avant, 'la demande de depot au doigt', 3000);
    const apres = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmDepose').length);
    const jete = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmDepose').pop());
    ok(apres === avant + 1,
       `lacher sur ${cote.nom} JETTE la piece par terre — sinon elle a l air de revenir dans le sac`);
    ok(jete && jete.item === PIECE.id, `et c est bien celle qu on tenait (${jete && jete.item})`);
  }
  await t.evaluate(() => { document.getElementById('nxWrap').classList.add('replie'); });
  await t.waitForTimeout(300);

  /* ================== LE PANNEAU NE GLISSE PAS DE COTE ==================
   *
   * Un joueur nous a envoye son ecran : le panneau pousse d'une vingtaine de
   * pixels vers la gauche et COINCE la. Il lisait « T - 106 » pour
   * « ATT - 106 » et « P 825 » pour « HP 825 ». Deux choses s'additionnaient :
   *
   *   - la grille des six attributs, en `1fr 1fr` avec un contenu en
   *     `nowrap`, ne pouvait pas retrecir : elle DEBORDAIT ;
   *   - `overflow-y:auto` rend l'autre axe `auto` lui aussi, donc ce
   *     debordement devenait un defilement horizontal — et un panneau pousse
   *     de cote y reste.
   *
   * ---- SON TELEPHONE AGRANDIT LE TEXTE ----
   * C'est le reglage d'accessibilite d'Android, que la vue web de Telegram
   * applique a toute la page. Nos essais tournaient a la taille de reference
   * et ne voyaient rien. On le REPRODUIT ici : `-webkit-text-size-adjust`
   * multiplie les tailles calculees exactement comme lui — mesure faite,
   * 10,5 px deviennent 12,6 px a 120 % et 15,75 px a 150 %.
   *
   * ---- ET SUR LA MEME PAGE ----
   * On REDIMENSIONNE la page tactile au lieu d'en ouvrir d'autres : un joueur
   * n'existe qu'une fois par adresse, et trois pages de plus sortaient
   * celle-ci du monde — les blocs suivants se plaignaient alors de choses qui
   * marchent (« la fiole automatique ne boit pas »). L'ecran mesure 360, le
   * cas le plus dur : le panneau n'y fait que 148. */
  console.log('\n-- le panneau ne glisse pas de cote --');
  await t.evaluate(() => { document.getElementById('nxWrap').classList.remove('replie'); });
  await t.setViewportSize({ width: 360, height: 780 });
  await t.waitForTimeout(400);
  for (const zoom of [100, 120, 150]) {
    await t.evaluate((z) => {
      let st = document.getElementById('__zoom');
      if (!st) { st = document.createElement('style'); st.id = '__zoom';
                 document.documentElement.appendChild(st); }
      st.textContent = 'html{-webkit-text-size-adjust:' + z + '%;}';
    }, zoom);
    await t.waitForTimeout(350);
    const mes = await t.evaluate(() => {
      const pan = document.getElementById('nxPanneau');
      const st = getComputedStyle(pan);
      /* On POUSSE le panneau, au lieu de lire un style : c'est le geste du
         joueur, et c'est lui qui l'a laisse coince. Un axe ferme revient a
         zero ; un axe ouvert garde la valeur. */
      pan.scrollLeft = 999;
      const pousse = pan.scrollLeft;
      pan.scrollLeft = 0;
      /* Et QUI deborde, pas seulement de combien : « le panneau deborde de
         30 px » ne dit pas quoi reparer. */
      const dedans = pan.getBoundingClientRect();
      const trop = [].filter.call(pan.querySelectorAll('*'), (e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > dedans.right + 1;
      }).map((e) => (e.id || e.className || e.tagName) + ' +'
                    + Math.round(e.getBoundingClientRect().right - dedans.right));
      const st1 = pan.querySelector('.nxp-st');
      return { largeur: Math.round(dedans.width), pousse, axe: st.overflowX,
               trop: trop.slice(0, 6),
               police: st1 ? getComputedStyle(st1).fontSize : null };
    });
    console.log(`   x${zoom} % : ` + JSON.stringify(mes));
    ok(mes.pousse === 0,
       `a x${zoom} % le panneau ne se pousse pas de cote (il est reste a ${mes.pousse})`);
    ok(mes.trop.length === 0,
       `a x${zoom} % rien ne sort du panneau${mes.trop.length ? ' : ' + mes.trop.join(', ') : ''}`);
    /* Le temoin de la reproduction : si le zoom n'agissait pas, les trois
       tours mesureraient la meme chose et ne prouveraient rien. */
    if (zoom === 150) {
      ok(mes.police && parseFloat(mes.police) > 12,
         `et le texte a VRAIMENT grossi (${mes.police}) — sinon l essai ne prouve rien`);
    }
  }
  await t.evaluate(() => {
    const st = document.getElementById('__zoom'); if (st) st.remove();
  });
  await t.setViewportSize({ width: 412, height: 880 });
  await t.waitForTimeout(400);

  console.log('\n-- et la boutique defile toujours --');
  /* Le selecteur des poignees ne mord pas sur la BOUTIQUE, qui porte un `data-item`
     sans etre une poignee : lui fermer le defilement rendrait son rayon
     impossible a parcourir, pour proteger un geste qui n'y existe pas. Son
     rayon n'est pas peint dans le monde, alors on pose le cas — c'est le
     selecteur qu'on met a l'essai, et il se juge sur une balise. */
  const rayon = await t.evaluate(() => {
    const faux = document.createElement('div');
    faux.setAttribute('data-msg', 'achete');
    faux.setAttribute('data-item', '1');
    document.body.appendChild(faux);
    const v = getComputedStyle(faux).touchAction;
    faux.remove();
    return v;
  });
  ok(rayon !== 'none', `une ligne de boutique defile toujours (${rayon})`);
  /* Le panneau retrouve l'etat ou les blocs suivants l'attendent. */
  await t.evaluate(() => { document.getElementById('nxWrap').classList.add('replie'); });
  await t.waitForTimeout(300);

  /* ================== LA FIOLE AUTOMATIQUE ==================
   *
   * Boire marchait deja en courant : trois commandes, aucune n'arrete le
   * personnage. Ce qui manquait, c'est de ne pas avoir a y penser — au pouce,
   * la main qui tient le manche n'est pas celle qui peut viser une fiole
   * pendant qu'on fuit.
   *
   * ---- CE QUE CET ESSAI SURVEILLE VRAIMENT ----
   *
   * Pas « est-ce que ca boit ». Une potion coute dix $SWOGE, et le defaut qui
   * couterait de l'argent est une demande PAR IMAGE : quatre-vingt-dix-neuf
   * fioles videes en deux secondes, a soixante images par seconde. On mesure
   * donc surtout ce qui NE part pas.
   */
  console.log('\n-- la fiole automatique --');
  const pot = (n) => ({
    type: 'potionBue', cle: 'vie', quoi: 'hp', soigne: 100, reste: n,
    potions: [
      { cle: 'vie', nom: 'Health Potion', quoi: 'hp', soigne: 100, image: 'potion_rouge', max: 99, quantite: n },
      { cle: 'mana', nom: 'Magic Potion', quoi: 'mp', soigne: 100, image: 'potion_bleue', max: 99, quantite: 0 },
    ],
  });
  const bues = () => t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
  /* ---- VIVANT D'ABORD ----
   * Tout ce bloc regarde la BARRE DE VIE, et la barre d'un mort ne bouge
   * plus : `window.__pv` ne se raccroche qu'a un `realmEtat` qui porte un
   * `moi`, et il n'y en a plus. La fiole ne buvait donc pas — non parce
   * qu'elle est cassee, mais parce qu'il n'y avait plus personne a soigner.
   * L'essai lisait « trente images sous la barre : 0 demande » d'un reglage
   * qui marche, et seulement les fois ou un lime avait eu le personnage. */
  /* ---- DANS LE MONDE, ET PAS SEULEMENT VIVANT ----
   * `assureVivant` ne regarde que le voile de mort. Or un joueur n'existe
   * qu'UNE fois par adresse : chaque `realmJoin` de la page souris SORT
   * celle-ci du monde, sans la tuer. `verifieFiole` refuse alors net
   * (`SCENE !== 'monde'`), et l'essai lisait « zero demande » d'un reglage qui
   * marche — c'est ce qui l'a fait tomber deux fois de suite.
   * On se remet donc dans le monde, comme le fait chaque bloc qui en a besoin,
   * et l'on DIT si l'on n'y est pas arrive : sans ce temoin, tout ce qui suit
   * mesurerait un fantome. */
  const vifF = await rejoins(t);
  await t.waitForTimeout(800);
  ok(vifF && vifF.ok, 'la page tactile est dans le monde avant de regarder la fiole'
     + (vifF && vifF.mort ? ' (relance apres une mort)' : ''));
  /* La pile de fioles est la NOTRE pendant tout ce bloc. */
  await t.evaluate(() => { window.__retient = 'potionBoit'; });
  const pousseFrames = (n) => t.evaluate(async (k) => {
    for (let i = 0; i < k; i++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
  }, n);

  /* Le reglage existe, et il est dans les MEMES commandes que l'auto-Nexus :
     deux options qui regardent la meme barre doivent se regler au meme
     endroit et de la meme facon. */
  const commandes = await t.evaluate(() => {
    const b = document.getElementById('nxFioleBtn');
    const s = document.getElementById('nxFiolePct');
    return b && s ? { etat: b.textContent.trim(), min: s.min, max: s.max, val: s.value,
                      grise: document.getElementById('nxFioleLigne').classList.contains('off') } : null;
  });
  console.log('   ' + JSON.stringify(commandes));
  ok(commandes, 'les reglages portent une bascule et un curseur pour la fiole automatique');
  ok(commandes && commandes.etat === 'OFF', 'eteinte par defaut : elle depense l argent du joueur, elle ne s allume pas toute seule');
  ok(commandes && commandes.grise, 'et le curseur est grise tant qu elle est eteinte — sinon on croit regler quelque chose d actif');

  /* On la met en marche a 50 %, et on remplit la pile. */
  await t.evaluate((m) => {
    window.__s[0].dispatchEvent(new MessageEvent('message', { data: JSON.stringify(m) }));
    const s = document.getElementById('nxFiolePct');
    s.value = '50'; s.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('nxFioleBtn').click();
  }, pot(9));
  await t.waitForTimeout(200);
  ok(await t.evaluate(() => document.getElementById('nxFioleBtn').textContent.trim()) === 'ON',
     'la bascule s allume');

  /* ---- AU-DESSUS DE LA BARRE, ELLE NE TOUCHE A RIEN ---- */
  const avantHaut = await bues();
  await pousseFrames(20);
  ok((await bues()) === avantHaut, 'a pleine vie elle ne boit pas — une gorgee pour rien serait dix $SWOGE jetes');

  /* ---- SOUS LA BARRE : UNE SEULE GORGEE, PAS UNE PAR IMAGE ---- */
  const pvMax = await t.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEtat' && m.moi).pop();
    return e ? e.moi.pvMax : 0;
  });
  ok(pvMax > 0, `la vie maximale est connue (${pvMax})`);
  const avantBas = await bues();
  await t.evaluate((v) => { window.__pv = v; }, Math.max(1, Math.round(pvMax * 0.30)));
  /* ---- ON ATTEND LA PREMIERE GORGEE, ON NE COMPTE PAS LES IMAGES ----
   * C'etait « trente images, donc une demande ». Troisieme fois que cette
   * page se fait prendre par la meme illusion : une image n'est pas un
   * soixantieme de seconde ici. La vie basse ne parvient a la page qu'avec un
   * message du serveur, et sous charge trente images passent avant lui —
   * mesure, la premiere gorgee est arrivee au bout de 4,6 secondes. L'essai
   * lisait « zero demande » d'un reglage qui marche.
   * On attend donc la CHOSE, bornee par l'horloge, puis on verifie qu'il n'en
   * est parti QU'UNE : c'est cela, la propriete — pas la vitesse du banc.
   *
   * ---- ET L'ATTENTE EST LARGE, PARCE QUE CE DELAI-LA EST CELUI DU BANC ----
   * La vie basse est INJECTEE par l'essai : elle ne parvient a la page qu'en se
   * raccrochant a un etat du vrai serveur. Le temoin ci-dessus l'a montre — la
   * page lisait encore 284 pv sur 350 au moment ou l'on venait d'en poser 105.
   * Releve sur trois executions : la premiere gorgee arrive entre quatre et
   * huit secondes apres l'injection, et les suivantes se suivent a la seconde
   * exacte, ce qui est la cadence attendue.
   * Douze secondes, donc. Ce n'est pas de la tolerance, c'est reconnaitre que
   * ce delai appartient au banc et non au jeu. Une gorgee par image en aurait
   * fait cent avant la premiere seconde : c'est cela qu'on attrape ici, et
   * aucune attente longue ne peut le cacher. */
  /* ---- LE TEMOIN, AVANT DE MESURER ----
   * « Zero demande » a trois causes possibles et l'essai ne les distinguait
   * pas : la fiole eteinte, une vie qui n'est jamais descendue, ou une pile
   * vide. Sans ce releve on relance quinze minutes pour deviner. */
  const av = await t.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEtat' && m.moi).pop();
    return { hp: (document.getElementById('nxHp') || {}).textContent,
             jauge: (document.getElementById('nxHpJauge') || {}).style
                    ? document.getElementById('nxHpJauge').style.width : null,
             bascule: (document.getElementById('nxFioleBtn') || {}).textContent,
             seuil: (document.getElementById('nxFiolePct') || {}).value,
             pvInjecte: window.__pv,
             duServeur: e ? { pv: e.moi.pv, pvMax: e.moi.pvMax } : null,
             fioles: [].map.call(document.querySelectorAll('#nxPot [data-pot]'),
               (b) => b.dataset.pot + '=' + b.querySelector('b').textContent) };
  });
  console.log('   avant la mesure : ' + JSON.stringify(av));

  const boucle = t.evaluate(async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 12000) {
      window.__pousse();
      await new Promise((f) => requestAnimationFrame(f));
      if (window.__s[0].__out.filter((m) => m.type === 'potionBoit').length) break;
    }
  });
  await boucle;
  const apresBas = await bues();
  console.log(`   premiere gorgee : ${apresBas - avantBas} demande(s)`);
  ok(apresBas === avantBas + 1,
     `sous la barre, il part UNE demande et une seule (${apresBas - avantBas}) —`
     + ' une par image aurait vide la pile');

  /* ---- LA CADENCE, MESUREE SUR L ECART REEL ----
   * La reponse revient en quelques millisecondes : sans cadence, la garde
   * « une gorgee en vol » ne freinerait rien du tout, et l on boirait vingt
   * fois par seconde.
   *
   * DEUX ESSAIS QUI ONT MESURE AUTRE CHOSE, avant celui-ci :
   *
   *   1. « repondre, pousser vingt images, exiger aucune seconde gorgee. »
   *      Trente images et cinq allers-retours vers la page prennent a eux
   *      seuls plus de neuf cents millisecondes : la seconde etait deja
   *      passee au moment de regarder. On mesurait la lenteur du banc.
   *   2. « quatre-vingt-dix images, donc une seconde et demie, donc une seule
   *      gorgee de plus. » Faux aussi : une image n'est pas un seizieme de
   *      seconde ici. Mesure — les quatre-vingt-dix images ont pris plus de
   *      trois secondes, et TROIS gorgees etaient le comportement JUSTE.
   *
   * On borne donc la boucle par l'HORLOGE de la page, et on juge sur les
   * ECARTS entre demandes, horodatees a l'envoi. C'est la seule chose que la
   * cadence promet, et la seule qui ne depende d'aucune latence. */
  await t.evaluate((m) => {
    window.__s[0].dispatchEvent(new MessageEvent('message', { data: JSON.stringify(m) }));
  }, pot(8));
  const cadence = await t.evaluate(async () => {
    const s = window.__s[0];
    const t0 = performance.now();
    /* On repond a chaque gorgee : sans reponse, la garde « une en vol » ferait
       tout le travail et la cadence ne serait jamais mise a l'epreuve. */
    let vues = s.__out.filter((m) => m.type === 'potionBoit').length;
    while (performance.now() - t0 < 2600) {
      window.__pousse();
      const n = s.__out.filter((m) => m.type === 'potionBoit').length;
      if (n > vues) {
        vues = n;
        s.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
          type: 'potionBue', cle: 'vie', quoi: 'hp', soigne: 100, reste: 8,
          potions: [
            { cle: 'vie', nom: 'Health Potion', quoi: 'hp', soigne: 100, image: 'potion_rouge', max: 99, quantite: 8 },
            { cle: 'mana', nom: 'Magic Potion', quoi: 'mp', soigne: 100, image: 'potion_bleue', max: 99, quantite: 0 },
          ],
        }) }));
      }
      await new Promise((f) => requestAnimationFrame(f));
    }
    const l = s.__out.filter((m) => m.type === 'potionBoit').map((m) => m.__t);
    const ecarts = [];
    for (let i = 1; i < l.length; i++) ecarts.push(Math.round(l[i] - l[i - 1]));
    return { duree: Math.round(performance.now() - t0), n: l.length, ecarts };
  });
  console.log(`   ${cadence.duree} ms sous la barre, ${cadence.n} gorgees, ecarts ${JSON.stringify(cadence.ecarts)}`);
  const pire = cadence.ecarts.length ? Math.min.apply(null, cadence.ecarts) : null;
  ok(cadence.ecarts.length > 0, 'elle boit tant que la vie reste basse — c est ce qu on lui demande');
  ok(pire !== null && pire >= 950,
     `et jamais deux gorgees a moins d une seconde (la plus rapprochee : ${pire} ms)`);
  /* Le vrai defaut qu'on cherche : une demande par image. En deux secondes et
     demie a soixante images par seconde, cela ferait cent cinquante gorgees. */
  ok(cadence.n <= Math.ceil(cadence.duree / 1000) + 2,
     `${cadence.n} gorgees en ${cadence.duree} ms — une par image en aurait fait plus de cent`);

  /* ---- LA PILE VIDE SE DIT, UNE FOIS ----
     Le filet vient de lacher. Un joueur qui ne l apprend pas continue de se
     battre en croyant etre couvert ; un message par image lui couvrirait
     l ecran au moment ou il a besoin de voir les monstres. */
  await t.evaluate((m) => {
    window.__s[0].dispatchEvent(new MessageEvent('message', { data: JSON.stringify(m) }));
  }, pot(0));
  await t.waitForTimeout(1200);
  const avantVideA = await bues();
  await pousseFrames(30);
  ok((await bues()) === avantVideA, 'la pile vide, elle ne demande plus rien');

  /* ---- ET ELLE SE SOUVIENT ----
     Un reglage qu il faut refaire a chaque visite n en est pas un. */
  const garde = await t.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('swogeNexusFiole') || 'null'); } catch (e) { return null; }
  });
  console.log('   garde : ' + JSON.stringify(garde));
  ok(garde && garde.actif === true && garde.seuil === 50,
     'le choix et le seuil sont gardes pour la prochaine visite');
  await t.evaluate(() => { window.__pv = 0; window.__retient = null; });

  /* Et a la SOURIS elle n'existe pas : le panneau y est toujours ouvert, et il
     faut les deux grilles cote a cote pour glisser de l'une a l'autre. */
  const surSouris = await p.evaluate(() => {
    const el = document.getElementById('nxButinFlot');
    return { existe: !!el, allumee: el ? el.classList.contains('on') : null };
  });
  ok(surSouris.existe && !surSouris.allumee,
     'a la souris la rangee flottante reste eteinte : le panneau suffit');

  /* ---- PANNEAU REPLIE, LES BOUTONS SUIVENT LE MILIEU ----
   * C'est comme ca qu'on joue sur telephone : le panneau replie, l'aire de jeu
   * prend toute la largeur, et son milieu se deplace de soixante-quatorze
   * pixels vers la droite. Les boutons ponctuels doivent suivre — restes ou ils
   * etaient, ils tomberaient dans la moitie qui fait marcher. */
  /* ---- ON S'ASSURE D'ETRE VIVANT AVANT DE MESURER ----
   * Les boutons du monde s'eteignent quand on meurt : la page revient au Nexus
   * et `#nxMaison` passe a `display:none`, donc a une boite de zero par zero.
   * L'essai lisait alors « centre 0 » et accusait la mise en page d'avoir pose
   * le bouton dans le coin — alors qu'un monstre venait de nous tuer. On
   * releve d'abord, et l'on dit si le bouton est bien la : sans ce temoin, la
   * mesure d'a cote mentirait de nouveau sans que rien ne le signale. */
  const vifR = await assureVivant(t);
  if (vifR) await t.waitForTimeout(600);
  await t.evaluate(() => { document.getElementById('nxWrap').classList.add('replie'); });
  await t.waitForTimeout(400);
  const replie = await t.evaluate(() => {
    const q = document.getElementById('nxMaison').getBoundingClientRect();
    const pad = document.getElementById('nxPad').getBoundingClientRect();
    return { vu: q.width > 0 && q.height > 0,
             centre: Math.round(q.x + q.width / 2),
             milieu: Math.round(window.innerWidth / 2),
             finDuPave: Math.round(pad.x + pad.width) };
  });
  ok(replie.vu, 'panneau replie, le retour au Nexus est bien a l\'ecran' +
     (vifR ? ' (apres une relance : on etait mort)' : ''));
  if (replie.vu) {
    ok(Math.abs(replie.centre - replie.milieu) <= 45,
       `il se recale au milieu (${replie.centre} pour un milieu a ${replie.milieu})`);
    ok(replie.centre >= replie.finDuPave,
       `et il reste hors de la zone qui fait marcher (${replie.centre} contre ${replie.finDuPave})`);
  }
  await t.evaluate(() => { document.getElementById('nxWrap').classList.remove('replie'); });
  await t.waitForTimeout(300);

  /* Et il fait ce qu'il annonce : on quitte le monde.
     VIVANT D'ABORD, comme ailleurs : le voile de mort couvre TOUT l'ecran,
     y compris le bouton maison. L'appui tombait dessus, aucun `realmLeave`
     ne partait, et l'essai disait « le toucher ne fait pas sortir du monde »
     d'un bouton qui marche — puis le bloc du coffre, quarante lignes plus
     bas, mesurait la croix a travers la carte de mort (« il touche :
     nxmt-carte »). */
  const vifT = await assureVivant(t);
  ok(!vifT || vifT.ok, 'la page tactile est vivante pour toucher la maison' +
     (vifT ? ' (relance apres une mort)' : ''));
  const avantSortie = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmLeave').length);
  await t.evaluate(() => document.getElementById('nxMaison').click());
  await attend(t, (n) => window.__s[0].__out.filter((m) => m.type === 'realmLeave').length > n,
               avantSortie, 'la demande de sortie du monde', 3000);
  const apresSortie = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmLeave').length);
  ok(apresSortie === avantSortie + 1, 'le toucher fait bien SORTIR du monde');
  /* Et une fois rentre, les deux boutons du monde disparaissent : un bouton
     de tir dans le Nexus n'a rien a viser. */
  const apresRentree = await t.evaluate(() => ({
    maison: document.getElementById('nxMaison').classList.contains('on'),
    vise: document.getElementById('nxVise').classList.contains('on'),
  }));
  ok(!apresRentree.maison && !apresRentree.vise,
     'de retour au Nexus, ni maison ni zone de tir ne restent allumees');

  /* ---- BOIRE EN COMBAT ----
   *
   * Les potions ne se buvaient qu'en TAPANT le panneau. En combat on ne quitte
   * pas son personnage des yeux pour viser un bouton de trente pixels dans un
   * coin — et sur telephone le panneau est replie pendant qu'on se bat. On
   * mourait avec des potions plein le sac.
   *
   * Trois surfaces menent au meme geste : la touche, le panneau, et les deux
   * fioles au doigt. Ce qu'on verifie, c'est qu'elles passent toutes par le
   * MEME chemin — trois copies de la meme demande finiraient par ne plus
   * verifier les memes choses, et celle qu'on oublie est toujours celle dont
   * on se sert en mourant. */
  {
    await p.bringToFront();
    await rejoins(p);
    /* On donne deux potions au joueur par le message que le serveur envoie
       deja. */
    await p.evaluate(() => {
      window.__s[0].dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
        type: 'potionBue', cle: 'vie', quoi: 'hp', soigne: 100, reste: 3,
        potions: [
          { cle: 'vie', nom: 'Health Potion', quoi: 'hp', soigne: 100, image: 'potion_rouge', max: 99, quantite: 3 },
          { cle: 'mana', nom: 'Magic Potion', quoi: 'mp', soigne: 100, image: 'potion_bleue', max: 99, quantite: 0 },
        ],
      }) }));
    });
    await p.waitForTimeout(300);

    /* La page doit avoir le FOCUS pour recevoir une touche. Depuis qu'il y en
       a trois, celle du clavier n'est plus forcement celle qu'on regarde — et
       l'essai echouait en disant « la touche Q ne boit pas », ce qui etait
       faux : personne ne lui avait envoye de Q. */
    await p.bringToFront();
    const avant = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
    await p.keyboard.press('KeyQ');
    await p.waitForTimeout(300);
    const bue = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').pop());
    const apres = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
    console.log('\n-- boire en combat --');
    console.log('   touche Q : ' + JSON.stringify(bue));
    ok(apres === avant + 1, 'la touche Q boit une potion de vie');
    ok(bue && bue.cle === 'vie', 'la bonne');

    /* Et une potion qu'on n'a PAS ne part pas au serveur : une demande qui
       sera refusee est une demande de trop au moment ou le reseau compte. */
    /* ---- ON REPOSE LA PILE JUSTE AVANT, ET L'ON VERIFIE QU'ELLE A PRIS ----
     * Le vrai serveur renvoie la VRAIE pile de fioles a chaque etat, et une
     * mort suivie d'une relance en redonne. La liste injectee plus haut — mana
     * a zero — avait donc pu etre remplacee entre-temps : la touche E partait
     * alors a bon droit, et l'essai accusait la page de demander une potion
     * qu'elle n'a pas. C'est ce qui l'a fait tomber une fois sur trois.
     * On repose la pile, on ATTEND que la fiole de mana soit grisee — c'est
     * l'etat qu'on veut mesurer — et l'on ne conclut que si elle l'est. */
    await p.evaluate(() => {
      window.__s[0].dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
        type: 'potionBue', cle: 'vie', quoi: 'hp', soigne: 100, reste: 3,
        potions: [
          { cle: 'vie', nom: 'Health Potion', quoi: 'hp', soigne: 100, image: 'potion_rouge', max: 99, quantite: 3 },
          { cle: 'mana', nom: 'Magic Potion', quoi: 'mp', soigne: 100, image: 'potion_bleue', max: 99, quantite: 0 },
        ],
      }) }));
    });
    const videPrete = await attend(p, () => {
      const b = document.querySelector('#nxPotions [data-pot="mana"], #nxPot [data-pot="mana"]');
      return !!(b && b.disabled);
    }, null, 'la fiole de mana grisee', 4000);
    ok(videPrete, 'la fiole qu on n a pas est bien grisee avant de mesurer');
    const avantVide = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
    await p.keyboard.press('KeyE');
    await p.waitForTimeout(300);
    const apresVide = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
    if (videPrete) ok(apresVide === avantVide, 'une potion qu on n a pas ne part pas au serveur');

    /* Le retour au Nexus a quitte E pour R — sinon les deux se marcheraient
       dessus, et boire ferait sortir du monde. */
    const avantSortie = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmLeave').length);
    await p.keyboard.press('KeyE');
    await p.waitForTimeout(300);
    const apresSortie = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmLeave').length);
    ok(apresSortie === avantSortie, 'et E ne fait PAS sortir du monde');
  }

  /* ---- ET LE JOUEUR QUI A DEJA SES TOUCHES ----
   *
   * `E` servait a rentrer au Nexus. Il sert maintenant a boire du mana. Un
   * joueur dont le navigateur a garde « nexus: KeyE » se retrouverait avec
   * deux actions sur la meme touche — et c'est la derniere ecrite qui
   * gagnerait, donc boire ferait sortir du monde.
   *
   * Le mecanisme qui l'evite existait deja, mais il repose sur l'ORDRE de la
   * table d'actions : les potions passent AVANT le retour au Nexus, donc
   * elles gardent leur touche et c'est le Nexus qui retombe sur son nouveau
   * defaut. C'est une dependance invisible — un jour quelqu'un rangera la
   * table par ordre alphabetique. */
  {
    const v = await ouvre({ width: 1280, height: 800 }, false, { nexus: 'KeyE', up: 'KeyW' });
    await v.bringToFront();
    await v.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
    await v.waitForTimeout(1600);
    await v.evaluate(() => {
      window.__s[0].dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
        type: 'potionBue', cle: 'mana', quoi: 'mp', soigne: 100, reste: 4,
        potions: [
          { cle: 'vie', nom: 'Health Potion', quoi: 'hp', soigne: 100, image: 'potion_rouge', max: 99, quantite: 4 },
          { cle: 'mana', nom: 'Magic Potion', quoi: 'mp', soigne: 100, image: 'potion_bleue', max: 99, quantite: 4 },
        ],
      }) }));
    });
    await v.waitForTimeout(300);

    const av = await v.evaluate(() => ({
      bu: window.__s[0].__out.filter((m) => m.type === 'potionBoit').length,
      sorti: window.__s[0].__out.filter((m) => m.type === 'realmLeave').length,
    }));
    await v.keyboard.press('KeyE');
    await v.waitForTimeout(350);
    const ap = await v.evaluate(() => ({
      bu: window.__s[0].__out.filter((m) => m.type === 'potionBoit').pop(),
      n: window.__s[0].__out.filter((m) => m.type === 'potionBoit').length,
      sorti: window.__s[0].__out.filter((m) => m.type === 'realmLeave').length,
    }));
    console.log('\n-- un joueur qui avait deja E pour le Nexus --');
    console.log('   apres E : ' + JSON.stringify(ap.bu) + ', sorties ' + ap.sorti);
    ok(ap.n === av.bu + 1, 'E boit bien du mana');
    ok(ap.bu && ap.bu.cle === 'mana', 'la bonne potion');
    ok(ap.sorti === av.sorti, 'et ne fait PAS sortir du monde');

    /* Le retour au Nexus n'est pas perdu pour autant : il retombe sur R. */
    await v.keyboard.press('KeyR');
    await v.waitForTimeout(350);
    const fin = await v.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmLeave').length);
    ok(fin === av.sorti + 1, 'et R le ramene chez lui — la touche n est pas perdue');
    await v.close();
  }

  /* ---- LES PROJECTILES AVANCENT ENTRE DEUX ETATS ----
   *
   * Ils etaient REMPLACES en bloc dix fois par seconde et dessines la ou ils
   * etaient au dernier message : un tir a 340 unites par seconde restait fige
   * six images puis sautait de trente-quatre. Ca se lit comme du lag alors que
   * rien ne rame — et c'est meme la premiere chose qu'on voit, parce qu'un
   * projectile est ce qui va le plus vite a l'ecran.
   *
   * On mesure ce qui est PEINT, image par image : si deux images de suite
   * montrent un projectile a la meme abscisse exacte, il ne bouge pas. */
  {
    await p.bringToFront();
    const vif = await rejoins(p);
    console.log('\n-- les projectiles --');
    console.log('   entree : ' + JSON.stringify(vif));
    /* SANS CE CONTROLE, TOUT LE RESTE MENT. Un personnage mort ne tire pas, le
       voile mange le clic, et les projectiles qu'on compte sont ceux des
       monstres. La mesure passait alors entre 3 ms et 857 ms selon qu'un
       archer avait tire ou non. */
    ok(vif.ok, 'le personnage est vivant et dans le monde' + (vif.mort ? ' (il a fallu relancer apres une mort)' : ''));
    ok(!vif.voile, 'et aucun voile ne couvre la scene');
    /* ---- ON LUI MET UNE VRAIE ARME DANS LA MAIN ----
     * Sans arme il tire au poing, qui n'a pas de planche et se dessine en
     * trait de secours : impossible de mesurer « du clic au projectile
     * PEINT ». On la lui donne DANS LE COFFRE du serveur et on l'equipe par
     * le message normal — pas par une fiche fabriquee. Une page qui porte une
     * arme que le serveur ignore, ce sont deux jeux differents, et la mesure
     * ne parle plus d'aucun des deux. */
    await p.evaluate(([piece, adr]) => 0, [PIECE, portefeuille.address]);
    const q = moteur._p(portefeuille.address);
    q.objets = q.objets || {};
    q.objets[PIECE.id] = (q.objets[PIECE.id] || 0) + 1;
    await p.evaluate((piece) => window.__s[0].send(JSON.stringify({
      type: 'equipeArme', skin: 'andy', item: piece.id })), PIECE);
    await p.waitForTimeout(700);
    const arme = await p.evaluate(() => {
      const fic = window.__s[0].__m.filter((x) => x.type === 'personnage' && x.etat).pop();
      return (fic && fic.etat.equipArme && fic.etat.equipArme.famille) || null;
    });
    ok(arme === PIECE.famille, `le personnage porte vraiment une ${PIECE.nom} (${arme})`);
    await p.evaluate(() => { window.__premierTir = null; window.__clic = null;
                             window.__heuresTirs.length = 0; window.__tirs.length = 0;
                             window.__s[0].__out.length = 0; window.__sons = 0;
                             /* Le temps des IMAGES pendant la rafale : la page ne
                                peut pas tirer entre deux images, donc la cadence
                                qu'elle atteint est bornee par elles. Sans ce
                                chiffre, la tolerance plus bas serait un
                                pourcentage tire au hasard. */
                             window.__dt.length = 0; });
    await p.mouse.move(500, 300);
    await p.mouse.down();
    await p.waitForTimeout(2500);
    await p.mouse.up();
    await p.waitForTimeout(200);

    const tir = await p.evaluate(() => {
      /* `coup` n'est PAS un projectile : c'est la marque laissee au point de
         contact, et elle reste evidemment au meme endroit d'une image a
         l'autre. La compter faisait dire a l'essai que la moitie des tirs
         etaient figes — un defaut annonce la ou tout marche. */
      const t = window.__tirs.map((v) => v.filter((x) => x.split('@')[0] !== 'coup'))
                             .filter((v) => v.length);
      /* FIGE veut dire fige : la meme position sur TROIS images de suite.
         Deux images suffisaient, et deux images se ressemblent par accident —
         deux tirs du meme geste, tires du meme point vers le meme point,
         repassent par les memes abscisses. Le defaut qu'on traque, lui,
         durait six images : un projectile remplace dix fois par seconde
         restait immobile tout un tick avant de sauter de trente-quatre
         unites. Trois images le voient, un hasard ne les tient pas. */
      let figees = 0, comparees = 0;
      const qui = {};
      for (let i = 2; i < t.length; i++) {
        if (!t[i - 2].length || !t[i - 1].length || !t[i].length) continue;
        comparees++;
        const memes = t[i - 2].filter((x) => t[i - 1].indexOf(x) >= 0 && t[i].indexOf(x) >= 0);
        if (memes.length) { figees++; memes.forEach((x) => { const k = x.split('@')[0]; qui[k] = (qui[k] || 0) + 1; }); }
      }
      const dem = (window.__s[0].__out || []).filter((o) => o.type === 'realmTir');
      /* NOTRE projectile, et pas celui d'un lime qui passait par la. On lit la
         famille de l'arme portee dans la fiche que le serveur a envoyee : le
         dessin d'un tir porte le nom de sa famille, c'est ce qui permet de le
         reconnaitre. Sans ce filtre la mesure disait « 12 ms » parce qu'une
         bave de lime avait ete peinte dans la meme image — alors que notre
         propre tir mettait deux cent soixante-dix millisecondes a apparaitre. */
      const fic = window.__s[0].__m.filter((x) => x.type === 'personnage' && x.etat).pop();
      const fam = (fic && fic.etat.equipArme && fic.etat.equipArme.famille) || null;
      const apres = (dem.length && fam)
        ? window.__heuresTirs.filter((h) => h.s === fam && h.t >= dem[0].__t - 4) : [];
      return { images: t.length, comparees, figees, qui,
               clic: window.__clic !== null,
               /* Combien de fois la page a DEMANDE a tirer pendant l'appui, et
                  au bout de combien de temps la premiere fois. */
               demandes: dem.length,
               demande1: dem.length && window.__clic !== null ? Math.round(dem[0].__t - window.__clic) : null,
               arme: fam, sons: window.__sons,
               /* La cadence REELLE, mesuree entre deux demandes. Elle dit d'un
                  coup d'oeil quelle arme on portait — et donc si la mesure
                  ci-dessous parle bien de ce qu'on croit. */
               cadence: dem.length > 2
                 ? Math.round(100000 / ((dem[dem.length - 1].__t - dem[0].__t) / (dem.length - 1))) / 100 : null,
               /* Ce que la machine a mis pour peindre une image PENDANT la
                  rafale, au 95e centile. La page tire depuis sa boucle de
                  dessin : une image de 117 ms repousse le tir suivant
                  d'autant, et aucune tolerance en pourcentage ne peut le
                  savoir a l'avance. */
               image95: (function () {
                 const d = window.__dt.slice().sort((x, y) => x - y);
                 return d.length ? +d[Math.floor(d.length * 0.95)].toFixed(1) : 0;
               })(),
               delai: apres.length && window.__clic !== null ? apres[0].t - window.__clic : null };
    });
    console.log('   ' + JSON.stringify(tir));
    ok(tir.clic, 'le clic est bien arrive dans la page');
    ok(tir.demandes > 0, `la page a demande a tirer ${tir.demandes} fois pendant l appui`);
    ok(tir.arme === PIECE.famille, `et la page l a bien enregistree (${tir.arme || 'aucune'})`);
    /* ---- ET IL TIRE A LA CADENCE QUE LE SERVEUR ACCORDE ----
     *
     * Pas a celle de l'arme seule : le serveur la multiplie par la DEXTERITE
     * et par la rafale. La page se limitait a l'arme et demandait donc moins
     * de tirs qu'elle n'avait le droit — un joueur a 78 de dexterite tirait au
     * rythme d'un debutant, et « Rapid fire » ne changeait rien du tout.
     *
     * On compare a ce que le serveur ANNONCE, pas a un chiffre recopie ici :
     * la regle n'a qu'un seul endroit ou elle s'ecrit, et cet essai verifie
     * que la page l'ecoute. */
    const cadSrv = await p.evaluate(() => {
      const e = window.__s[0].__m.filter((x) => x.type === 'realmEtat' && x.moi && x.moi.c).pop();
      return e ? e.moi.c : null;
    });
    ok(cadSrv > 0, `le serveur annonce une cadence (${cadSrv})`);
    ok(cadSrv > monde.ARMES.poing.cadence,
       'et elle porte deja la dexterite — elle depasse celle de l arme nue');
    /* ---- ON COMPARE DES INTERVALLES, ET LA MARGE EST CELLE DES IMAGES ----
     *
     * « Quinze pour cent » supposait que la page peut tirer quand elle veut.
     * Elle ne le peut pas : elle tire depuis sa boucle de dessin, donc jamais
     * plus finement qu'une image. Mesure faite sur une machine chargee, sans
     * rien changer au jeu : images a 33 ms de mediane mais 117 au 99e
     * centile, et la cadence tombee a 3,17 coups par seconde pour 4,03
     * accordes — l'essai accusait la page d'ignorer la dexterite alors
     * qu'elle l'appliquait, faute d'images pour le faire.
     *
     * On raisonne donc en MILLISECONDES ENTRE DEUX TIRS, et la marge vaut le
     * plus grand des deux : les quinze pour cent d'origine, ou une image
     * lente. Une page qui ignorerait vraiment la dexterite tirerait a la
     * cadence de l'arme nue — deux fois moins vite —, et aucune image lente
     * ne couvre un ecart pareil. */
    const attenduMs = cadSrv > 0 ? 1000 / cadSrv : 0;
    const mesureMs = tir.cadence ? 1000 / tir.cadence : 0;
    const margeMs = Math.max(attenduMs * 0.15, tir.image95 || 0);
    ok(tir.cadence !== null && Math.abs(mesureMs - attenduMs) <= margeMs,
       `la page tire a ${tir.cadence} coups par seconde, le serveur en accorde ${cadSrv} ` +
       `(${Math.round(mesureMs)} ms entre deux tirs contre ${Math.round(attenduMs)}, ` +
       `marge ${Math.round(margeMs)} ms pour des images a ${tir.image95} ms)`);
    ok(tir.images > 20, `des projectiles ont ete peints (${tir.images} images)`);
    ok(tir.comparees > 10, 'assez de paires pour conclure');
    ok(tir.figees === 0,
       `aucun projectile ne reste fige sur trois images (${tir.figees} sur ${tir.comparees})`);

    /* ---- ET LE PREMIER PART TOUT DE SUITE ----
     * Il attendait l'aller-retour : un tick de cent millisecondes plus le
     * reseau. Et les dessins se chargeaient a la demande, donc les premiers
     * tirs sortaient en rectangle de secours — mesure faite, 589 ms entre le
     * clic et le premier projectile vraiment dessine, sur une machine locale
     * ou le reseau ne coute rien. */
    /* La aussi, le plancher est une image : un projectile ne peut pas etre
       peint avant la prochaine. Cent vingt millisecondes tant que la machine
       les rend vite, deux images sinon — le defaut qu'on traque valait cinq
       cent quatre-vingt-neuf millisecondes, et aucune image lente ne couvre
       ca. */
    const plafondDelai = Math.max(120, (tir.image95 || 0) * 2);
    ok(tir.delai !== null && tir.delai < plafondDelai,
       `du clic au projectile peint : ${tir.delai === null ? 'JAMAIS' : Math.round(tir.delai) + ' ms'} ` +
       `(plafond ${Math.round(plafondDelai)} ms pour des images a ${tir.image95} ms)`);
  }

  /* ---- LA FLUIDITE : LE MONDE CONTRE LE NEXUS ----
   *
   * « Dans le Nexus c'est fluide quand on marche, mais dans le monde on a
   * l'impression que ca saccade. » On mesure donc les DEUX, sur la meme
   * machine et a la suite : la difference est la seule chose qui compte, et
   * elle seule survit au fait qu'un banc d'essai n'est pas un vrai ecran.
   *
   * Ce qu'on regarde n'est pas la moyenne — une moyenne de seize
   * millisecondes avec une image sur vingt a cinquante se sent comme un
   * hoquet, et se lit comme « tout va bien ». C'est la QUEUE : combien
   * d'images depassent 33 ms, c'est-a-dire combien de fois l'ecran saute. */
  {
    /* ---- ON MARCHE DANS UNE DIRECTION LIBRE ----
     * Deux cent quarante rochers sont poses sur la carte, et le personnage
     * s'arrete net contre le premier. Une mesure de fluidite faite le nez
     * contre une pierre compte zero pas et se lit comme « il ne recule
     * jamais » — la plus mauvaise facon de passer. On choisit donc une route
     * degagee, et on VERIFIE qu'il a marche. */
    const routeLibre = async () => {
      const ou = await p.evaluate(() => {
        const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
        return { x: e.moi.x, y: e.moi.y, w: e.monde.w, h: e.monde.h };
      });
      const HUIT = [[1, 0, ['ArrowRight']], [-1, 0, ['ArrowLeft']],
                    [0, 1, ['ArrowDown']], [0, -1, ['ArrowUp']]];
      let mieux = null, plusLoin = -1;
      for (const [dx0, dy0, tt] of HUIT) {
        /* Jusqu'ou peut-on aller tout droit ? Le bord de la carte compte
           autant qu'un rocher : arrive dessus, on n'avance plus. */
        let libre = dx0 > 0 ? ou.w - 80 - ou.x : dx0 < 0 ? ou.x - 80
                  : dy0 > 0 ? ou.h - 80 - ou.y : ou.y - 80;
        for (const o of blocs) {
          const vx = o.x - ou.x, vy = o.y - ou.y;
          const le = vx * dx0 + vy * dy0;
          if (le < 0) continue;
          const tr = Math.abs(vx * dy0 - vy * dx0);
          if (tr > o.r + 30) continue;
          libre = Math.min(libre, le - o.r - 30);
        }
        if (libre > plusLoin) { plusLoin = libre; mieux = tt; }
      }
      return { touches: mieux || ['ArrowRight'], libre: Math.round(plusLoin) };
    };

    const mesure = async (etiquette) => {
      await p.evaluate(() => { window.__dt.length = 0; });
      /* On MARCHE pendant la mesure : c'est ce que le joueur faisait. */
      const r = await routeLibre();
      for (const t of r.touches) await p.keyboard.down(t);
      /* ---- ON COMPTE DES IMAGES, PAS DES SECONDES ----
       * Deux secondes et demie de montre donnent quatre-vingt-dix images sur
       * une machine au repos et cinquante-huit sur une machine chargee — et
       * l'essai s'arretait alors sur « on n'a pas de quoi conclure », ce qui
       * etait vrai mais evitable. Ce qu'on veut, c'est un ECHANTILLON de
       * temps d'images ; on le remplit, avec un plafond de six secondes pour
       * qu'un jeu vraiment fige finisse quand meme et tombe sur l'assertion. */
      await p.evaluate(async () => {
        const t0 = performance.now();
        while (performance.now() - t0 < 6000 && window.__dt.length < 90) {
          await new Promise((f) => requestAnimationFrame(f));
        }
      });
      for (const t of r.touches) await p.keyboard.up(t);
      const d = await p.evaluate(() => window.__dt.slice());
      d.sort((a, b) => a - b);
      const q = (f) => d[Math.min(d.length - 1, Math.floor(d.length * f))] || 0;
      return { ou: etiquette, images: d.length, median: +q(0.5).toFixed(1),
               p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1),
               sautees: d.filter((x) => x > 33).length };
    };
    /* ---- CE QUE LA MACHINE SAIT FAIRE, MESURE ET PAS SUPPOSE ----
     *
     * Le seuil etait ecrit en dur : « la mediane tient sur n'importe quelle
     * machine, 16,7 ms ». Mesure faite ici, c'est faux — et le chiffre le
     * disait lui-meme : le MONDE ET LE NEXUS rendaient tous les deux 33,3 ms
     * de mediane, sur quatre executions de suite. Deux scenes qui n'ont rien
     * en commun ne tombent pas sur la meme valeur par hasard : c'est la
     * machine, pas le jeu. L'essai annoncait donc a chaque fois un defaut de
     * fluidite du monde de combat, et ce defaut n'existait pas.
     *
     * On demande donc a la MACHINE ce qu'elle sait rendre : une page vide,
     * dans le meme navigateur, au meme moment. Ici elle repond 16,7 ms — elle
     * sait faire du soixante — pendant que les deux scenes du jeu, elles,
     * tiennent 33,3. Le plafond se construit sur ces deux mesures :
     *   - une machine qui rend le Nexus a 60 images/s doit rendre le monde
     *     aussi : le plafond retombe sur l'exigence d'origine ;
     *   - une machine qui n'y arrive nulle part ne peut rien prouver de plus
     *     que « le monde ne coute pas plus cher que le Nexus ».
     * Dans les deux cas le chiffre compare est mesure sur place, aucun n'est
     * recopie ici. */
    const socle = await (async () => {
      const b = await nav.newPage({ viewport: { width: 400, height: 300 } });
      await b.goto('about:blank');
      await b.bringToFront();
      const v = await b.evaluate(() => new Promise((res) => {
        const d = []; let t0 = performance.now();
        (function tour(t) {
          d.push(t - t0); t0 = t;
          if (d.length < 90) requestAnimationFrame(tour); else res(d.slice(2));
        })(performance.now());
      }));
      await b.close();
      v.sort((a, c) => a - c);
      return +v[Math.floor(v.length / 2)].toFixed(1);
    })();
    /* D'abord le monde — on y est. Puis le Nexus, pour comparer. */
    await p.bringToFront();
    const monde = await mesure('monde');
    await p.keyboard.press('KeyR');
    await p.waitForTimeout(900);
    const nexus = await mesure('nexus');
    console.log('\n-- la fluidite --');
    console.log('   monde : ' + JSON.stringify(monde));
    console.log('   nexus : ' + JSON.stringify(nexus));
    const partMonde = monde.images ? monde.sautees / monde.images : 1;
    const partNexus = nexus.images ? nexus.sautees / nexus.images : 0;
    ok(monde.images > 60 && nexus.images > 60,
       `on a de quoi conclure (${monde.images} images dans le monde, ${nexus.images} au Nexus)`);
    /* ---- CE QU'ON MESURE, ET CE QU'ON NE PEUT PAS MESURER ICI ----
     *
     * On a longtemps ecrit ici que la MEDIANE tenait sur n'importe quelle
     * machine — 16,7 ms, une image tous les soixantiemes de seconde. C'est
     * faux, et la mesure du dessus le dit : sur cette machine-ci le monde ET
     * le Nexus rendent 33,3 ms de mediane pendant qu'une page vide en rend
     * 16,7. La mediane suit donc bien la machine, elle aussi ; ce qu'elle
     * garde de vrai, c'est qu'elle la suit DE LA MEME FACON pour les deux
     * scenes. C'est pour ca que le plafond se calcule plus bas a partir de
     * deux mesures prises sur place, et non d'un chiffre recopie.
     *
     * Le taux d'images sautees, lui, ne tient pas non plus. Mesure sur ce meme code :
     * 0,7 % a un moment creux, 21 % vingt minutes plus tard — et le NEXUS,
     * dont pas une ligne n'a change, passait de 0,7 % a 16,5 % dans le meme
     * souffle. Ce n'est pas le jeu qui saute, c'est la machine partagee sous
     * lui. Un seuil absolu sur ce chiffre n'aurait donc dit qu'une chose :
     * a quelle heure on a lance l'essai.
     *
     * On garde la comparaison au Nexus, qui reste vraie quelle que soit la
     * charge — les deux scenes subissent la meme —, mais avec la tolerance
     * que le bruit impose : c'est un rapport, pas un ecart. */
    console.log('   la machine rend une page VIDE a ' + socle + ' ms de mediane');
    /* Le plafond : l'exigence d'origine tant que la machine la rend possible,
       et sinon ce que le Nexus obtient sur cette machine-la. `Math.max` et
       pas `Math.min` : on ne descend jamais SOUS l'exigence d'origine parce
       que la machine est lente — on la remplace par une exigence qu'elle
       permet encore de verifier. */
    const plafond = Math.max(socle * 1.2 + 1, nexus.median + 3);
    ok(monde.median <= plafond,
       `le monde tient la cadence de la machine a la mediane (${monde.median} ms, ` +
       `plafond ${plafond.toFixed(1)} : page vide ${socle}, Nexus ${nexus.median})`);
    ok(monde.median <= nexus.median + 3,
       `et la meme mediane que le Nexus (${monde.median} contre ${nexus.median} ms)`);
    /* Le plancher a 0,05 ne tenait pas quand le Nexus tombe a ZERO image
       sautee : le monde a alors droit a 5 %, et une seule secousse de la
       machine hote le fait passer a 5,6. Ce qu'on veut dire, c'est « pas
       nettement plus », pas « moins de cinq pour cent ». */
    ok(partMonde <= Math.max(0.10, partNexus * 1.8 + 0.02),
       `il ne saute pas plus que le Nexus (${(partMonde * 100).toFixed(1)} % contre ${(partNexus * 100).toFixed(1)} %)`);
    await rejoins(p);

    /* ---- ET LE PERSONNAGE AVANCE DROIT ----
     * Le nombre d'images par seconde ne dit pas tout : un ecran a soixante
     * images ou le personnage RECULE d'un pas toutes les dix se sent comme
     * une saccade, et la moyenne ne bouge pas d'un cheveu. La cause n'est
     * alors pas le dessin, c'est le recalage — le serveur corrige la position
     * annoncee, et la correction se voit.
     * On lit sa jauge de vie : elle est peinte sous ses pieds, a chaque
     * image, en coordonnees du MONDE. C'est sa position exacte, telle qu'il
     * la voit. */
    await p.evaluate(() => { window.__barres.length = 0; });
    const route = await routeLibre();
    console.log('   route : ' + route.touches.join('+') + ', ' + route.libre + ' unites degagees');
    /* On lit l'axe de la marche : vers le haut, c'est `y` qui bouge et `x`
       ne dit rien du tout. */
    const axe = (route.touches[0] === 'ArrowUp' || route.touches[0] === 'ArrowDown') ? 'y' : 'x';
    /* ---- ON TIENT LA TOUCHE JUSQU'A AVOIR DE QUOI CONCLURE ----
     *
     * Deux secondes deux de MONTRE ne donnent pas un nombre de pas : elles
     * donnent le nombre d'images que la machine a rendues pendant ce temps.
     * Sur ce meme code, sans rien changer : 49 pas, 45, 41, puis 29. Ce que
     * l'essai demande, lui, ne bouge pas — « a-t-il recule en marchant tout
     * droit ? » — et vingt pas y repondent. On marche donc jusqu'a EN AVOIR,
     * pas jusqu'a une heure.
     *
     * Deux sorties de secours : le temps, pour un jeu fige, et l'immobilite,
     * pour un personnage arrete contre un rocher — continuer a tenir la
     * touche contre la pierre n'ajouterait plus un seul pas. */
    const tientLaTouche = async (touches, cible) => {
      for (const t of touches) await p.keyboard.down(t);
      const eu = await p.evaluate(async ([a, n]) => {
        const pas = () => {
          const b = window.__barres.filter((x) => x.c === '#7cff9b').map((x) => x[a]);
          let k = 0;
          for (let i = 1; i < b.length; i++) if (Math.abs(b[i] - b[i - 1]) >= 0.001) k++;
          return k;
        };
        const t0 = performance.now();
        let dernier = -1, fige = 0;
        while (performance.now() - t0 < 6000 && pas() < n) {
          await new Promise((f) => requestAnimationFrame(f));
          const c = pas();
          if (c === dernier) { if (++fige > 40) break; } else { fige = 0; dernier = c; }
        }
        return pas();
      }, [axe, cible]);
      for (const t of touches) await p.keyboard.up(t);
      return eu;
    };
    await tientLaTouche(route.touches, 40);
    const brut = await p.evaluate(() => window.__barres.filter((b) => b.c === '#7cff9b').map((b) => ({ x: b.x, y: b.y })));
    const marche = brut.map((b) => b[axe]);
    /* Le SENS depend de la route choisie : marcher vers la gauche fait
       decroitre x, et compter ca comme un recul dirait n'importe quoi. On
       ramene donc tout dans le sens de la marche. */
    const sens = (route.touches[0] === 'ArrowLeft' || route.touches[0] === 'ArrowUp') ? -1 : 1;
    let recule = 0, saut = 0, avance = 0;
    const pas = [];
    for (let i = 1; i < marche.length; i++) {
      const d = (marche[i] - marche[i - 1]) * sens;
      if (Math.abs(d) < 0.001) continue;
      pas.push(d);
      if (d < -0.5) recule++;
      else avance++;
    }
    const moy = pas.length ? pas.reduce((t, x) => t + x, 0) / pas.length : 0;
    for (const d of pas) if (d > moy * 3 + 2) saut++;
    console.log('   marche : ' + JSON.stringify({ images: marche.length, pas: pas.length,
                 moyen: +moy.toFixed(2), recule, saut }));
    /* Le NOMBRE de pas depend du nombre d'images rendues pendant la mesure,
       donc de la charge de la machine hote : on en a compte cent-trente au
       repos et quarante sous charge, sur le meme code. Ce qu'on veut savoir,
       c'est s'il a avance DROIT — et vingt pas suffisent a le dire. */
    ok(pas.length >= 20, `le personnage a marche (${pas.length} pas mesures)`);
    ok(recule === 0,
       `il n a JAMAIS recule en marchant tout droit (${recule} pas en arriere sur ${pas.length})`);
    ok(saut <= 1,
       `et il n a pas saute en avant non plus (${saut} bonds de plus du triple du pas moyen)`);

    /* ---- ET AVEC UN SERVEUR LOIN, AUSSI ----
     *
     * Tout ce qui precede se mesure sur un serveur local, ou l'aller-retour
     * coute dix millisecondes. Le notre est a Railway. La page recevait alors
     * une position vieille d'un quart de seconde et la comparait a celle
     * d'MAINTENANT : a deux cent vingt unites par seconde, cinquante-cinq
     * unites d'ecart, donc au-dela du seuil de quarante — le personnage etait
     * tire en arriere a CHAQUE message pendant qu'on marchait. C'est la
     * saccade qu'on nous a decrite, et elle est invisible en local.
     *
     * On la fabrique : on renvoie a la page une position qu'elle a REELLEMENT
     * annoncee un quart de seconde plus tot. C'est exactement ce qu'un
     * serveur lointain lui dirait, et il n'y a rien a inventer pour ca. */
    /* Vivant, sinon il n'y a pas de jauge a lire — et « zero pas » se lirait
       comme « il ne recule jamais ». */
    const vif2 = await rejoins(p);
    ok(vif2.ok, 'le personnage est vivant pour la mesure avec retard');
    const route2 = await routeLibre();
    const axe2 = (route2.touches[0] === 'ArrowUp' || route2.touches[0] === 'ArrowDown') ? 'y' : 'x';
    const sens2 = (route2.touches[0] === 'ArrowLeft' || route2.touches[0] === 'ArrowUp') ? -1 : 1;
    await p.evaluate(() => { window.__barres.length = 0; window.__s[0].__out.length = 0; });
    for (const t of route2.touches) await p.keyboard.down(t);
    /* ---- ON MARCHE JUSQU'A AVOIR DE QUOI CONCLURE, PAS DEUX SECONDES ----
     *
     * Vingt allers de cent millisecondes font deux secondes de MONTRE, et ce
     * qu'on compte ensuite n'est pas du temps : c'est le nombre d'images ou
     * la jauge a bouge. Mesure faite sur ce meme code, sans rien changer :
     * 72 pas, puis 70, puis 32, puis 19 — et le seuil de vingt-cinq tombait
     * a la quatrieme. On ne mesurait donc pas la marche du personnage, on
     * mesurait le nombre d'images que la machine avait bien voulu rendre.
     *
     * On arrete donc sur la DONNEE : des qu'on a quarante pas, on a de quoi
     * repondre a la seule question posee — a-t-il recule ? Le plafond de
     * huit secondes est la pour qu'un jeu vraiment fige finisse quand meme,
     * et tombe alors sur l'assertion au lieu de tourner sans fin. */
    const assez = await p.evaluate(async ([axe, sens]) => {
      const s = window.__s[0];
      const pas = () => {
        const b = window.__barres.filter((x) => x.c === '#7cff9b').map((x) => x[axe]);
        let n = 0;
        for (let i = 1; i < b.length; i++) if (Math.abs(b[i] - b[i - 1]) >= 0.001) n++;
        return n;
      };
      let k = 0;
      while (k < 80 && pas() < 40) {
        k++;
        await new Promise((f) => setTimeout(f, 100));
        const mouv = s.__out.filter((o) => o.type === 'realmMove');
        const etat = s.__m.filter((x) => x.type === 'realmEtat').pop();
        /* Celui d'il y a un quart de seconde : les envois partent toutes les
           120 ms, donc deux crans en arriere. */
        const vieux = mouv[mouv.length - 3];
        if (!etat || !vieux) continue;
        s.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
          ...etat, moi: { ...etat.moi, x: vieux.x, y: vieux.y } }) }));
      }
      return { tours: k, pas: pas(), sens };
    }, [axe2, sens2]);
    for (const t of route2.touches) await p.keyboard.up(t);
    const brut2 = await p.evaluate(() => window.__barres.filter((b) => b.c === '#7cff9b').map((b) => ({ x: b.x, y: b.y })));
    const loin = brut2.map((b) => b[axe2]);
    let reculeL = 0; const pasL = [];
    for (let i = 1; i < loin.length; i++) {
      const d = (loin[i] - loin[i - 1]) * sens2;
      if (Math.abs(d) < 0.001) continue;
      pasL.push(d);
      if (d < -0.5) reculeL++;
    }
    console.log('   avec 250 ms de retard : ' +
                JSON.stringify({ pas: pasL.length, recule: reculeL, tours: assez.tours }));
    /* Vingt pas suffisent a dire s'il a recule — c'est le meme chiffre et la
       meme raison que la marche sans retard, vingt lignes plus haut. */
    ok(pasL.length >= 20, `il a marche aussi dans ce cas (${pasL.length} pas)`);
    ok(reculeL === 0,
       `un serveur en retard ne le tire pas en arriere (${reculeL} pas sur ${pasL.length})`);
  }

  /* ---- RIEN NE VOLE DANS LE NEXUS QUAND ON RENTRE ----
   *
   * Deux boucles de tir existent : celle du Nexus et celle du monde. Elles se
   * partageaient la meme recharge et tiraient A TOUR DE ROLE dans le monde —
   * huit tirs chacune pour deux secondes et demie d'appui. Les huit du Nexus
   * ne se voyaient pas : ils partent dans une liste que seule la scene du
   * Nexus dessine. Ils faisaient leur bruit quand meme, et c'est ce qu'un
   * joueur nous a decrit — « on entend le son des tirs mais on ne voit pas
   * les tirs ».
   *
   * Ils ne disparaissaient pas non plus : ils restaient en l'air une demi-
   * seconde. En rentrant au Nexus juste apres avoir tire, on les retrouvait
   * donc TOUS, voletant devant la fontaine sans que personne n'ait tire ici.
   * C'est la seule trace qu'ils laissent, et c'est celle qu'on regarde. */
  {
    await p.bringToFront();
    await p.mouse.move(500, 300);
    await p.mouse.down();
    await p.waitForTimeout(1500);
    /* ---- ON RELACHE AVANT DE RENTRER ----
     * On rentrait en tirant encore, pour attraper les fantomes avant qu'ils
     * meurent. Mais le Nexus a SES propres tirs, dessines avec la meme
     * planche, et un tir parti juste avant le portail doit finir sa course —
     * c'est voulu et commente dans le code. L'essai comptait donc ces
     * tirs-la comme des fantomes, une fois sur trois selon le moment ou le
     * bouton se relachait.
     * On relache d'abord, on laisse tout mourir, et ce qui reste peint alors
     * ne peut venir que de la liste du MONDE — celle qui doit etre videe en
     * sortant. C'est la propriete qu'on voulait, et elle ne depend plus du
     * millieme de seconde ou l'on a lache la souris. */
    await p.mouse.up();
    await p.keyboard.press('KeyR');
    await p.waitForTimeout(900);
    const rentre = await p.evaluate(async () => {
      window.__peint.length = 0;
      for (let k = 0; k < 12; k++) await new Promise((f) => requestAnimationFrame(f));
      return { tirs: window.__peint.filter((d) => /^(lame|arc|dagues|hache|lance|marteau)\.webp$/.test(d.src) && d.ecran).length,
               scene: !!document.querySelector('#nxMondeHud, #nxSac') };
    });
    console.log('\n-- de retour au Nexus --');
    console.log('   ' + JSON.stringify(rentre));
    ok(rentre.tirs === 0,
       `aucun projectile fantome ne nous suit du monde (${rentre.tirs} peints alors qu on ne tire pas)`);
    await rejoins(p);
  }

  /* ---- LE CERCLE QUI PREVIENT ----
   *
   * L'attaque de zone est la seule du jeu qu'on n'esquive pas en se decalant :
   * elle marque le sol, attend, puis frappe tout ce qui s'y trouve encore. Le
   * cercle N'EST PAS une decoration — c'est l'attaque elle-meme, vue une
   * seconde plus tot. Trois choses peuvent se casser en silence :
   *
   *   1. il n'est pas peint du tout : l'attaque devient un coup venu de nulle
   *      part, et le joueur croit avoir affaire a un bug ;
   *   2. il est peint PLUS PETIT que la zone reelle : pire que rien, parce
   *      qu'un joueur qui se tient a un cheveu du bord se croit dehors, prend
   *      le coup, et a raison de trouver ca injuste ;
   *   3. il est peint PAR-DESSUS les creatures : il cache alors exactement ce
   *      qu'on doit regarder pour en sortir.
   */
  {
    await rejoins(p);
    const ici = await p.evaluate(() => {
      const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
      return { x: e.moi.x, y: e.moi.y };
    });
    /* La planche se mesure DANS LA PAGE, pas ici : ce qu'on veut verifier,
       c'est que la case lue est bien un quart de ce que le navigateur a
       charge — pas un quart de ce que ce fichier croit savoir. */
    const planche = await p.evaluate(() => new Promise((res) => {
      const i = new Image();
      i.onload = () => {
        /* ---- ET ON MESURE LE CERCLE, PAS LA CASE ----
         * Le dessin ne remplit pas son carre : la premiere image tient dans
         * 90 % de la case. Un essai qui ne regarderait que la largeur passee a
         * `drawImage` ne verrait donc RIEN si la page oubliait de compenser —
         * il compterait la case et pas le cercle, et laisserait passer
         * exactement le defaut qui tue.
         * On mesure la PLUS PETITE des quatre images : c'est elle qui decide
         * si le cercle peint couvre toujours la zone reelle. */
        const cw = i.naturalWidth / 4, ch = i.naturalHeight;
        const cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        const c2 = cv.getContext('2d', { willReadFrequently: true });
        let mini = 0;
        for (let k = 0; k < 4; k++) {
          c2.clearRect(0, 0, cw, ch);
          c2.drawImage(i, k * cw, 0, cw, ch, 0, 0, cw, ch);
          const d = c2.getImageData(0, 0, cw, ch).data;
          let loin = 0;
          for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
            if (d[(y * cw + x) * 4 + 3] < 40) continue;
            const r = Math.hypot(x + 0.5 - cw / 2, y + 0.5 - ch / 2);
            if (r > loin) loin = r;
          }
          if (loin > 0 && (!mini || loin < mini)) mini = loin;
        }
        res({ w: i.naturalWidth, h: i.naturalHeight, plein: mini / (Math.min(cw, ch) / 2) });
      };
      i.onerror = () => res({ w: 0, h: 0, plein: 0 });
      i.src = 'img/nexus/effets/annonce.webp';
    }));

    const RAYON = 200;
    await p.evaluate(async ([x, y, r]) => {
      window.__sacs = [];
      window.__peint.length = 0;
      window.__zones = [{ i: 90001, x, y, r, t: 1.30, d: 1.35 }];
      for (let k = 0; k < 25; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
    }, [ici.x, ici.y, RAYON]);
    await p.waitForTimeout(300);

    const tot = await p.evaluate(() => {
      const a = window.__peint.filter((o) => o.src === 'annonce.webp' && o.ecran);
      const d = a[a.length - 1] || null;
      return {
        n: a.length,
        colonnes: Array.from(new Set(a.map((o) => Math.round(o.sx / (o.sw || 1))))),
        sw: d && d.sw, sh: d && d.sh, dw: d && d.dw, dh: d && d.dh,
        cx: d && (d.dx + d.dw / 2), cy: d && (d.dy + d.dh / 2),
      };
    });
    console.log('\n-- le cercle qui previent --');
    console.log('   planche : ' + JSON.stringify(planche) +
                ' — la plus petite image occupe ' + (planche.plein * 100).toFixed(1) + ' % de sa case');
    console.log('   ' + JSON.stringify(tot));
    ok(tot.n > 0, `le cercle d annonce est peint (${tot.n} dessins)`);
    ok(planche.w > 0 && tot.sw === planche.w / 4,
       `et lu dans une case de ${tot.sw} — la planche fait ${planche.w} pour quatre images`);
    ok(tot.sh === planche.h, 'sur toute la hauteur');

    if (tot.dw) {
      /* LE POINT QUI COMPTE. Le dessin ne remplit pas sa case : pose a
         « deux fois le rayon » de large, le cercle peint serait plus PETIT
         que la zone qui va frapper. Se tromper vers le grand fait sortir un
         pas trop tot ; se tromper vers le petit tue. */
      const peint = (tot.dw / 2) * planche.plein;
      ok(peint >= RAYON - 0.5,
         `le CERCLE peint atteint ${peint.toFixed(1)} unites — la zone en fait ${RAYON}`);
      ok(peint <= RAYON * 1.35,
         `sans la depasser au point de faire fuir pour rien (${(peint / RAYON).toFixed(2)} fois)`);
      ok(Math.abs(tot.dw - tot.dh) < 2, 'et il est rond, pas ovale');
      ok(Math.abs(tot.cx - ici.x) < 3 && Math.abs(tot.cy - ici.y) < 3,
         `il est centre SUR le joueur (a ${Math.round(Math.abs(tot.cx - ici.x))} unites)`);
    }

    /* ---- IL SE REMPLIT ----
     * Le compte a rebours se lit sur l'image choisie. S'il prenait toujours
     * la meme, le cercle dirait « ca va frapper » sans jamais dire QUAND. */
    await p.evaluate(async ([x, y, r]) => {
      window.__peint.length = 0;
      window.__zones = [{ i: 90001, x, y, r, t: 0.05, d: 1.35 }];
      for (let k = 0; k < 25; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
    }, [ici.x, ici.y, RAYON]);
    await p.waitForTimeout(300);
    const tard = await p.evaluate(() => {
      const a = window.__peint.filter((o) => o.src === 'annonce.webp' && o.ecran);
      return Array.from(new Set(a.map((o) => Math.round(o.sx / (o.sw || 1)))));
    });
    console.log('   colonne au debut : ' + tot.colonnes.join(',') + ' — a la fin : ' + tard.join(','));
    ok(tot.colonnes.length && tard.length, 'les deux moments ont ete peints');
    ok(Math.max.apply(null, tard) > Math.max.apply(null, tot.colonnes),
       'le cercle est plus avance a la fin du compte a rebours qu au debut');
    ok(Math.max.apply(null, tard) <= 3, 'et il ne sort jamais de la planche (quatre images)');

    /* ---- IL EST AU SOL ----
     * Peint par-dessus les creatures, il cacherait ce qu'on doit regarder
     * pour en sortir. On compare les rangs DANS LA MEME IMAGE : comparer deux
     * images differentes ne dirait rien. */
    const couche = await p.evaluate(() => {
      const par = {};
      window.__peint.forEach((o, k) => {
        const f = par[o.f] || (par[o.f] = { cercle: -1, creature: -1 });
        if (!o.ecran) return;
        if (o.src === 'annonce.webp' && f.cercle < 0) f.cercle = k;
        if (o.dossier === 'monstres' && f.creature < 0) f.creature = k;
      });
      const deux = Object.keys(par).map((k) => par[k]).filter((f) => f.cercle >= 0 && f.creature >= 0);
      return { images: deux.length, dessous: deux.filter((f) => f.cercle < f.creature).length };
    });
    console.log('   images ou les deux sont peints : ' + JSON.stringify(couche));
    ok(couche.images > 0, `on a des images avec le cercle ET une creature (${couche.images})`);
    ok(couche.dessous === couche.images,
       `le cercle passe sous les creatures dans toutes (${couche.dessous} sur ${couche.images})`);

    /* ---- ET CE QUI RESTE QUAND IL FRAPPE ----
     * Une zone ne disparait que pour une raison : elle vient de frapper. La
     * page n'attend donc aucun message de plus — elle regarde celle qui
     * manque. Un evenement en moins est un evenement qui ne peut pas se
     * perdre. */
    await p.evaluate(async () => {
      window.__peint.length = 0;
      window.__zones = [];
      /* Une seule poussee suffit a faire disparaitre la zone ; les suivantes
         laissent l'onde vivre le temps qu'elle dure. */
      for (let k = 0; k < 30; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
    });
    await p.waitForTimeout(300);
    const onde = await p.evaluate(([x, y]) => {
      const a = window.__peint.filter((o) => o.src === 'onde.webp' && o.ecran);
      const d = a[a.length - 1] || null;
      return { n: a.length,
               colonnes: Array.from(new Set(a.map((o) => Math.round(o.sx / (o.sw || 1))))),
               ecart: d ? Math.round(Math.hypot(d.dx + d.dw / 2 - x, d.dy + d.dh / 2 - y)) : null,
               cercle: window.__peint.filter((o) => o.src === 'annonce.webp' && o.ecran).length };
    }, [ici.x, ici.y]);
    console.log('   onde : ' + JSON.stringify(onde));
    ok(onde.n > 0, `l onde de choc est peinte la ou le cercle a disparu (${onde.n} dessins)`);
    ok(onde.ecart !== null && onde.ecart < 5,
       `et au bon endroit (a ${onde.ecart} unites du centre)`);
    ok(onde.colonnes.length > 1,
       'elle s anime, elle ne reste pas sur une image : ' + onde.colonnes.join(','));
    ok(onde.cercle === 0, 'et le cercle, lui, a bien cesse d etre peint');

    /* ELLE FINIT. Une onde qui resterait affichee ferait croire a une attaque
       qui n'en finit pas — et s'accumulerait a chaque zone. */
    await p.waitForTimeout(900);
    const apres = await p.evaluate(async () => {
      window.__peint.length = 0;
      for (let k = 0; k < 20; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
      return window.__peint.filter((o) => o.src === 'onde.webp' && o.ecran).length;
    });
    ok(apres === 0, `une seconde plus tard, plus rien n est peint (${apres})`);
  }

  /* ---- LE COFFRE D'UNE SALLE GARDEE ----
   *
   * Il est la AVANT le combat, ferme, au milieu de la piece : c'est lui qui
   * fait d'une salle une destination. De la porte on voit qu'il y a quelque
   * chose a prendre ; de loin, qu'une salle a deja ete faite.
   *
   * Les salles sont a l'autre bout de la carte et le personnage ne peut pas
   * s'y teleporter — le serveur le ramene. On rejoue donc SON message
   * d'entree, celui qui porte les salles, avec la salle posee sur nos pieds.
   * Rien d'invente : ni le message, ni la salle — seulement sa position.
   */
  {
    console.log('\n-- le coffre des salles gardees --');
    /* ---- MOURIR EFFACE LA SALLE, ET C'EST INVISIBLE ----
     *
     * Ce bloc a rate une execution sur quatre en disant « il s'ouvre en
     * plusieurs images :  » — la liste vide. Le coffre FERME etait pourtant
     * peint vingt-six fois deux lignes plus haut. Entre les deux, le joueur
     * est mort : la page remet alors les salles a zero comme tout le reste du
     * monde, plus rien n'est peint, et la boucle a tourne quatre cents images
     * pour rien. Le verdict accusait le coffre.
     *
     * On regarde donc le voile de mort AVANT, et on le surveille PENDANT :
     * perdre le joueur n'est pas un resultat de mesure, c'est une mesure a
     * refaire. Ce qu'on ne refait jamais, c'est une assertion tombee. */
    await assureVivant(p);

    /* Poser la salle sous nos pieds. Rien d'invente : on rejoue le message
       d'entree du serveur, seule la position de la premiere salle change. */
    const pose = () => p.evaluate(() => {
      const s = window.__s[0];
      const e = s.__m.filter((m) => m.type === 'realmEntre').pop();
      if (!e || !e.salles || !e.salles.length) return null;
      const salles = e.salles.map((q, k) => (k === 0
        ? { ...q, x: Math.round(e.moi.x), y: Math.round(e.moi.y) } : q));
      s.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify({ ...e, salles }) }));
      return { x: Math.round(e.moi.x), y: Math.round(e.moi.y), i: salles[0].i,
               cote: salles[0].cote, butin: salles[0].butin };
    });

    /* UNE tentative complete : poser, voir ferme, faire tomber la salle, voir
       s'ouvrir. Elle rend `perdu` si la condition de depart s'est defaite en
       route, et ses mesures sinon. */
    const tente = async () => {
      const ou = await pose();
      if (!ou) return { ou: null, perdu: 'le serveur n a envoye aucune salle' };
      /* FERME tant qu'un gardien vit. */
      await p.evaluate(async () => {
        window.__peint.length = 0; window.__sacs = []; window.__zones = [];
        for (let k = 0; k < 20; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
      });
      const ferme = await p.evaluate(([x, y]) => {
        /* CE coffre-la, pas le dernier peint : quatre salles existent et deux
           peuvent tenir a l'ecran. Prendre le dernier dessin revenait a
           mesurer parfois le coffre de la salle d'a cote, a mille unites — et
           l'essai disait alors que le coffre n'est pas au milieu de sa piece.
           Le meme piege est deja commente vingt lignes plus bas. */
        const a = window.__peint.filter((q) => q.src === 'obj_coffre_garde.webp' && q.ecran
                                          && Math.abs(q.dx + q.dw / 2 - x) < 200);
        const d = a[a.length - 1] || null;
        return { n: a.length, col: d ? Math.round(d.sx / d.sw) : null,
                 cx: d ? d.dx + d.dw / 2 : null, bas: d ? d.dy + d.dh : null,
                 dh: d ? d.dh : null,
                 colonnes: Array.from(new Set(a.map((o) => Math.round(o.sx / (o.sw || 1))))) };
      }, [ou.x, ou.y]);
      if (!ferme.n) return { ou, perdu: 'le coffre ferme n a jamais ete peint' };

      /* OUVERT des que la salle tombe. Le serveur ne dit que ca — « videe » —
         et la page joue les trois images toute seule : lui demander chaque
         image serait dix messages pour une demi-seconde. */
      const menee = await p.evaluate(async ([i, cx]) => {
        window.__peint.length = 0;
        const s = window.__s[0];
        const env = () => s.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ type: 'realmEtat', monstres: [], tirs: [], tirsM: [],
                                 tombes: [], joueurs: [], sacs: [], zones: [],
                                 salles: [{ i, v: 1 }] }) }));
        /* On pousse jusqu'a ce que le coffre soit VRAIMENT peint dans plusieurs
           images, pas pendant un nombre fixe de tours : sous charge, soixante
           images ne suffisent pas toujours, et l'essai concluait alors « il ne
           s'ouvre pas » d'un coffre qui s'ouvrait tres bien. */
        for (let k = 0; k < 400; k++) {
          env();
          await new Promise((f) => requestAnimationFrame(f));
          /* LA MORT SE VOIT TOUT DE SUITE, et elle arrete la mesure : la page
             vide ses salles en mourant, donc plus rien ne sera jamais peint et
             les trois cent quatre-vingts tours restants ne feraient que
             retarder un faux verdict. */
          const v = document.getElementById('nxMortVoile');
          if (v && v.classList.contains('on')) return { mort: true };
          const a = window.__peint.filter((d) => d.src === 'obj_coffre_garde.webp' && d.ecran
                                            && Math.abs(d.dx + d.dw / 2 - cx) < 200);
          const cols = new Set(a.map((o) => Math.round(o.sx / (o.sw || 1))));
          if (cols.size > 1 && cols.has(2) && a.length > 20) return { mort: false, ouvert: true };
        }
        return { mort: false, ouvert: false };
      }, [ou.i, ou.x]);
      if (menee.mort) return { ou, perdu: 'le joueur est mort pendant l ouverture' };

      const ouvert = await p.evaluate((x) => {
        const a = window.__peint.filter((d) => d.src === 'obj_coffre_garde.webp' && d.ecran
                                          && Math.abs(d.dx + d.dw / 2 - x) < 200);
        return { n: a.length,
                 colonnes: Array.from(new Set(a.map((o) => Math.round(o.sx / (o.sw || 1))))),
                 fin: a.length ? Math.round(a[a.length - 1].sx / a[a.length - 1].sw) : null,
                 /* Le centre part avec : quatre salles existent, et deux
                    peuvent etre a l'ecran. Melanger les dessins de deux
                    coffres poses a mille unites l'un de l'autre ferait dire
                    a la mesure qu'un coffre « saute de mille unites ». */
                 bas: a.map((o) => ({ c: Math.round(o.sx / o.sw), b: o.dy + o.dh,
                                      h: o.dh, cx: o.dx + o.dw / 2 })) };
      }, ou.x);
      return { ou, ferme, ouvert };
    };

    /* Trois tentatives au plus. On ne recommence QUE sur une condition de
       depart perdue — jamais sur une assertion tombee : un essai qui rejoue
       jusqu'a obtenir le resultat qu'il attend ne verifie plus rien. */
    let r = await tente();
    for (let k = 0; k < 2 && r.perdu; k++) {
      console.log('   (on recommence : ' + r.perdu + ')');
      await rejoins(p);
      r = await tente();
    }
    ok(!!r.ou, 'la salle est posee sous nos pieds');
    ok(!r.perdu, 'la mesure s est faite sur un joueur vivant' + (r.perdu ? ' — ' + r.perdu : ''));

    if (r.ou && !r.perdu) {
      const ou = r.ou, ferme = r.ferme, ouvert = r.ouvert;
      console.log('   ' + JSON.stringify(ou));
      console.log('   ferme : ' + JSON.stringify(ferme));
      ok(ferme.n > 0, `le coffre est peint (${ferme.n} dessins)`);
      ok(ferme.colonnes.length === 1 && ferme.colonnes[0] === 0,
         'et FERME tant que la salle est gardee : ' + ferme.colonnes.join(','));
      ok(ferme.cx !== null && Math.abs(ferme.cx - ou.x) < 3,
         `au milieu de la piece (a ${ferme.cx === null ? '?' : Math.round(Math.abs(ferme.cx - ou.x))} unites)`);
      console.log('   ouvert : ' + JSON.stringify({ n: ouvert.n, colonnes: ouvert.colonnes, fin: ouvert.fin }));
      ok(ouvert.colonnes.length > 1,
         'il s ouvre en plusieurs images : ' + ouvert.colonnes.join(','));
      ok(ouvert.fin === 2, `et il RESTE ouvert (derniere image : ${ouvert.fin})`);

      /* ---- ET IL NE SAUTE PAS EN S'OUVRANT ----
       * Les trois images ne s'arretent pas a la meme ligne de leur case :
       * 115, 122, 124 sur 128. Calees sur la case, elles poseraient le coffre
       * a trois hauteurs — il sauterait de sept pixels au moment ou l'on
       * regarde justement ce qu'il fait. */
      const vide = await p.evaluate(() => new Promise((res) => {
        const i = new Image();
        i.onload = () => {
          const cadre = i.naturalHeight, n = Math.round(i.naturalWidth / cadre);
          const cv = document.createElement('canvas');
          cv.width = cadre; cv.height = cadre;
          const c2 = cv.getContext('2d', { willReadFrequently: true });
          const out = [];
          for (let k = 0; k < n; k++) {
            c2.clearRect(0, 0, cadre, cadre);
            c2.drawImage(i, k * cadre, 0, cadre, cadre, 0, 0, cadre, cadre);
            const d = c2.getImageData(0, 0, cadre, cadre).data;
            let b = 0;
            for (let y = 0; y < cadre; y++) for (let x = 0; x < cadre; x++) {
              if (d[(y * cadre + x) * 4 + 3] >= 40) { b = y; break; }
            }
            out.push((b + 1) / cadre);
          }
          res(out);
        };
        i.onerror = () => res([]);
        i.src = 'img/nexus/tiles/obj_coffre_garde.webp';
      }));
      console.log('   les trois images occupent : ' +
                  vide.map((v) => (v * 100).toFixed(1) + ' %').join(', '));
      ok(vide.length === 3, `la planche porte trois images (${vide.length})`);
      ok(Math.max(...vide) - Math.min(...vide) > 0.02,
         'et elles ne s arretent pas a la meme ligne — sinon rien a corriger');
      const pieds = ouvert.bas.filter((o) => Math.abs(o.cx - ou.x) < 3)
                              .map((o) => o.b - (1 - vide[o.c]) * o.h);
      ok(pieds.length > 0, `on a des dessins du coffre de CETTE salle (${pieds.length})`);
      if (pieds.length) {
        const eca = Math.max(...pieds) - Math.min(...pieds);
        console.log(`   le bas reel varie de ${eca.toFixed(2)} unites sur les trois images`);
        ok(eca < 1, `le coffre ne saute pas en s ouvrant (${eca.toFixed(2)} unites)`);
        ok(Math.abs(pieds[0] - ou.y) < 2,
           `et il repose sur le centre de la salle (a ${Math.abs(pieds[0] - ou.y).toFixed(1)} unites)`);
      }
    }
  }

  /* ================== LES COFFRES DE LA SALLE, AU DOIGT ==================
   *
   * « The chest is bug in phone, is the second I can't open. »
   *
   * La salle en aligne plusieurs contre le mur du bas — les objets, les
   * personnages, les fioles, les oeufs — et l'essai ne sait pas combien : il
   * les LIT sur ce que la page peint. Un compte ecrit ici serait faux le jour
   * ou la rangee en gagne un, et c'est deja arrive.
   *
   * On y va comme un joueur — on rentre au Nexus, on marche jusqu'a la porte,
   * on descend sur la rangee, on passe sur chacun, on ferme, on continue.
   * Chaque etape dit ce qu'elle voit : un essai qui ne montre que son verdict
   * ne sert a rien le jour ou il tombe. */
  {
    console.log('\n-- les coffres de la salle, au doigt --');
    /* On rentre au Nexus par le bouton maison, pas par une touche : c'est le
       geste du telephone. On attend LE NEXUS, pas une seconde et deux : le
       bouton s'eteint en sortant du monde, et c'est cette extinction qui dit
       qu'on y est. */
    await t.bringToFront();
    /* Vivant : un voile de mort pose sur l'ecran couvre le bouton maison
       comme il couvrira la croix du coffre, et tout ce bloc se met alors a
       mesurer la carte de mort au lieu de la salle. */
    await assureVivant(t);
    await t.evaluate(() => document.getElementById('nxMaison').click());
    await attend(t, () => !document.getElementById('nxMaison').classList.contains('on'),
                 null, 'le retour au Nexus');

    const marche = async (touche, ms) => {
      await t.keyboard.down(touche);
      await t.waitForTimeout(ms);
      await t.keyboard.up(touche);
      /* Le temps que la derniere image soit peinte : c'est elle qu'on lira
         pour savoir ou l'on est. Deux images suffisent, et deux images se
         demandent — elles ne se dorment pas. */
      await t.evaluate(async () => {
        for (let k = 0; k < 3; k++) await new Promise((f) => requestAnimationFrame(f));
      });
    };
    const vu = () => t.evaluate(() => {
      const v = document.getElementById('nxCoffreVoile');
      if (!v) return null;
      const q = v.getBoundingClientRect();
      const titre = v.querySelector('.nxcf-titre');
      return { on: v.classList.contains('on'),
               larg: Math.round(q.width), haut: Math.round(q.height),
               x: Math.round(q.x),
               titre: titre ? titre.textContent.trim() : '' };
    });

    /* ---- SAVOIR OU L'ON EST ----
     * « Le coffre ne s'ouvre pas » et « on n'est jamais entre dans la salle »
     * se ressemblent, et se soignent autrement. On regarde donc ce que la
     * page DESSINE : la salle a sa propre planche. */
    await t.evaluate(() => {
      const C = CanvasRenderingContext2D.prototype;
      if (C.__espionSalle) return;
      C.__espionSalle = true;
      const di = C.drawImage;
      window.__salleVue = 0;
      window.__porteC = null; window.__moiN = null;
      C.drawImage = function (im) {
        const u = (im && (im.currentSrc || im.src)) || '';
        if (u.indexOf('room_vault') >= 0) window.__salleVue++;
        /* La porte du coffre, dans le MEME repere que le personnage : on n'a
           alors ni le zoom ni la camera a refaire.
           NEUF arguments, pas cinq : la porte a recu `cadres: 4`, donc elle
           s'anime, donc `arguments[1..4]` sont le decoupage dans la PLANCHE
           SOURCE et pas la destination dans le monde. Cette lecture-la visait
           un point du fichier image. La meme faute avait casse
           coffre_page.test.js en entier — ici elle dormait, selon le chemin
           emprunte. */
        if (u.indexOf('obj_vault_door') >= 0 && arguments.length >= 5) {
          const d = arguments.length >= 9 ? 5 : 1;
          window.__porteC = { x: arguments[d] + arguments[d + 2] / 2,
                              y: arguments[d + 1] + arguments[d + 3] };
        }
        if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
            && arguments[7] === 150 && arguments[8] === 150) {
          window.__moiN = { x: Math.round(arguments[5] + 75), y: Math.round(arguments[6] + 130) };
        }
        return di.apply(this, arguments);
      };
    });
    /* ---- ON VISE LA PORTE, ON NE COMPTE PAS LES SECONDES ----
     *
     * Ce bloc marchait « deux secondes deux en bas, trois secondes deux a
     * droite ». Ca suppose une vitesse, un point de retour et une place de la
     * porte — trois choses que l'essai n'a pas a connaitre. La deuxieme porte
     * du Nexus a decale le portail de deux cent dix unites vers la gauche, et
     * les trois secondes deux se sont mises a tomber a cote : l'essai a
     * conclu « le coffre ne s'ouvre pas » alors que le coffre allait tres
     * bien.
     *
     * On regarde donc ou la porte est DESSINEE, on marche vers elle, et l'on
     * s'arrete quand on y est. Le meme geste que coffre_page.test.js, et pour
     * la meme raison. */
    await attend(t, () => !!window.__porteC || !!window.__moiN, null, 'la premiere image du Nexus', 5000);
    for (let k = 0; k < 40; k++) {
      const dedans = await t.evaluate(() => window.__salleVue || 0);
      if (dedans > 0) break;
      const v = await t.evaluate(() => ({ moi: window.__moiN, porte: window.__porteC }));
      if (!v.moi || !v.porte) { await marche('ArrowDown', 260); continue; }
      const ex = v.porte.x - v.moi.x, ey = v.porte.y - v.moi.y;
      if (Math.abs(ex) < 50 && Math.abs(ey) < 50) { await t.waitForTimeout(500); continue; }
      /* On corrige la HAUTEUR d'abord : la fontaine est au centre du chemin,
         et viser en diagonale reviendrait a marcher dedans. */
      if (Math.abs(ey) > 60) await marche(ey > 0 ? 'ArrowDown' : 'ArrowUp', 300);
      else await marche(ex > 0 ? 'ArrowRight' : 'ArrowLeft', 300);
    }
    const dansLaSalle = (await vu()) || {};
    dansLaSalle.salle = await t.evaluate(() => window.__salleVue || 0);
    console.log('   apres la porte : ' + JSON.stringify(dansLaSalle));
    ok(dansLaSalle.salle > 0,
       `on est bien ENTRE dans la salle du coffre (${dansLaSalle.salle} dessins de la planche)`);

    /* ---- OU EST LE JOUEUR, ET OU SONT LES COFFRES ----
     * Les deux se dessinent dans le MEME repere : les halos par `ellipse`,
     * le personnage par `drawImage`. On releve les deux au meme tour et on
     * les compare — pas besoin de connaitre le zoom ni la camera, et surtout
     * pas besoin de les recalculer, ce qui reviendrait a verifier le calcul
     * de la page avec le meme calcul.
     *
     * ---- ET ON GARDE LE NUMERO D'IMAGE ----
     * On prenait « les quatre derniers halos ». La salle en peint CINQ par
     * image — quatre coffres et le portail — et quatre derniers pris dans une
     * ronde de cinq laissent toujours le meme dehors : le coffre aux objets
     * disparaissait de la mesure a chaque execution, et l'essai annoncait
     * « la salle en montre bien TROIS » d'une salle qui en montre quatre. Un
     * echantillon qui coupe une image en deux ne mesure pas la salle, il
     * mesure l'endroit ou l'on a coupe. On releve donc UNE IMAGE ENTIERE. */
    await t.evaluate(() => {
      const C = CanvasRenderingContext2D.prototype;
      if (C.__espionOu) return;
      C.__espionOu = true;
      window.__halos = []; window.__moi = null;
      const el = C.ellipse, di2 = C.drawImage;
      C.ellipse = function (x, y, rx, ry) {
        if (ry < rx * 0.6 && rx > 40) {
          window.__halos.push({ x: Math.round(x), y: Math.round(y), r: Math.round(rx),
                                f: window.__image });
        }
        return el.apply(this, arguments);
      };
      /* Le personnage se reconnait a sa SIGNATURE de dessin, pas a son
         adresse : ses images sont des canvas prepares en memoire, qui n'ont
         pas de `src`. Une case de 256 posee dans un carre de 150, c'est lui et
         rien d'autre. Les chiffres viennent de `dessineAvatar`. */
      C.drawImage = function () {
        if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
            && arguments[7] === 150 && arguments[8] === 150) {
          window.__moi = { x: Math.round(arguments[5] + 75),
                           y: Math.round(arguments[6] + 130) };
        }
        return di2.apply(this, arguments);
      };
    });
    /* Ou l'on est, et ce que la salle peint autour, sur UNE image complete.
       On jette la premiere et la derniere image relevees : elles peuvent
       n'avoir ete captees qu'a moitie. */
    const ou = () => t.evaluate(async () => {
      window.__halos.length = 0;
      for (let k = 0; k < 4; k++) await new Promise((f) => requestAnimationFrame(f));
      const h = window.__halos.slice(); window.__halos.length = 0;
      const images = Array.from(new Set(h.map((x) => x.f)));
      const pleine = images.length > 2 ? images[images.length - 2] : images[0];
      return { moi: window.__moi, halos: h.filter((x) => x.f === pleine) };
    });
    /* On arrive au milieu ; les coffres sont en bas. On descend jusqu'au mur :
       la salle borne le pas, et les coffres sont sur cette ligne-la. */
    await marche('ArrowDown', 2600);
    const bas = await ou();
    /* LES COFFRES, ET PAS LE PORTAIL. Ils partagent la meme rangee — le mur du
       bas — et le portail vit ailleurs dans la piece. On prend donc la plus
       GROSSE rangee de halos, celle qui a le plus de monde a la meme hauteur :
       aucun chiffre recopie ici, c'est le dessin qui dit combien ils sont. */
    const rangees = {};
    bas.halos.forEach((h) => { (rangees[h.y] = rangees[h.y] || []).push(h); });
    const coffres = Object.keys(rangees)
      .map((k) => rangees[k])
      .sort((a, b) => b.length - a.length)[0] || [];
    coffres.sort((a, b) => a.x - b.x);
    console.log('   descendu a  : ' + JSON.stringify(bas.moi) +
                ' — halos peints ' + JSON.stringify(bas.halos.map((h) => h.x + '@' + h.y)) +
                ' — la rangee des coffres : ' + JSON.stringify(coffres.map((c) => c.x)));
    /* Le nombre de coffres n'est pas une valeur a verifier : c'est la salle
       qui le decide, et l'essai la lit. Ce qu'il faut, c'est qu'il y en ait
       PLUSIEURS — la panne rapportee etait « le second ne s'ouvre pas », et
       un seul coffre ne prouverait rien du tout. */
    ok(coffres.length >= 2,
       `la salle peint une rangee de plusieurs coffres (${coffres.length})`);

    /* ---- LA VITESSE, MESUREE ----
     * Marcher « deux cents millisecondes vers la gauche » ne veut rien dire
     * tant qu'on ignore ce que ces deux cents millisecondes parcourent : trop
     * court on n'arrive jamais au coffre, trop long on passe devant a chaque
     * fois. On fait donc UN pas et on regarde ce qu'il a donne. */
    const vitesse = await (async () => {
      const a = (await ou()).moi;
      await marche('ArrowLeft', 300);
      const b = (await ou()).moi;
      const d = (a && b) ? Math.abs(a.x - b.x) : 0;
      return d > 5 ? d / 0.3 : 300;
    })();
    console.log('   vitesse mesuree : ' + Math.round(vitesse) + ' unites par seconde');
    const msPour = (d) => Math.max(70, Math.min(600, Math.round(Math.abs(d) / vitesse * 1000)));

    /* ---- ON VA SUR CHAQUE COFFRE, DANS LES DEUX SENS ----
     *
     * On longeait le mur VERS LA GAUCHE, « parce qu'on entre par la droite ».
     * C'etait faux : on arrive au milieu de la rangee. Mesure faite, le
     * joueur se posait a x=808 et les coffres etaient a 600, 800, 987 et
     * 1154 — marcher a gauche ne pouvait donc en atteindre qu'UN, et l'essai
     * annoncait « on est passe sur les trois coffres (1) » a chaque
     * execution. Un essai qui suppose de quel cote se trouve sa cible ne
     * mesure pas le jeu, il mesure sa supposition.
     * On vise donc chaque coffre par sa position RELEVEE, et l'on marche du
     * cote ou il est. */
    const surLeCoffre = async (c) => {
      for (let k = 0; k < 40; k++) {
        const q = await ou();
        if (!q.moi) { await marche('ArrowDown', 150); continue; }
        const dx = c.x - q.moi.x, dy = c.y - q.moi.y;
        /* Le MEME test que la page : un disque, pas un carre. On vise le
           coeur du disque pour ne pas dependre du dernier demi-pas. */
        if (dx * dx + dy * dy < (c.r * 0.5) * (c.r * 0.5)) return q.moi;
        if (Math.abs(dy) > c.r * 0.4) await marche(dy > 0 ? 'ArrowDown' : 'ArrowUp', msPour(dy));
        else await marche(dx > 0 ? 'ArrowRight' : 'ArrowLeft', msPour(dx));
      }
      return null;
    };

    /* ---- ON FERME AVANT DE PARTIR, PAS APRES ETRE ARRIVE ----
     *
     * C'est le geste du joueur — on ferme quand on a fini — et sans lui la
     * mesure est fausse. La page n'ouvre un coffre que si RIEN n'est ouvert :
     * en descendant, on se pose sur la rangee, et le coffre sous nos pieds
     * s'ouvre tout seul. Marcher jusqu'au suivant avec cette fiche encore
     * ouverte n'ouvre donc rien du tout, et l'essai relevait le titre du
     * coffre PRECEDENT — deux coffres semblaient rendre la meme fiche. Ce
     * qu'on veut savoir, c'est ce que CHAQUE coffre ouvre quand on arrive
     * dessus les mains vides. */
    const fermeLaFiche = async () => {
      const e = await vu();
      if (!e || !e.on) return;
      await t.evaluate(() => {
        const x = document.querySelector('#nxCoffreVoile .nxcf-x');
        if (x) x.click();
      });
      await attend(t, () => !document.getElementById('nxCoffreVoile').classList.contains('on'),
                   null, 'la fiche refermee', 3000);
    };
    const ouverts = [];
    for (const c of coffres) {
      await fermeLaFiche();
      const arrive = await surLeCoffre(c);
      const e = arrive ? await vu() : null;
      ouverts.push({ x: c.x, arrive: !!arrive, titre: (e && e.on) ? e.titre : null });
      console.log('   coffre x=' + c.x + ' : ' + (!arrive ? 'JAMAIS ATTEINT'
                  : (e && e.on) ? '« ' + e.titre + ' »' : 'RIEN ne s ouvre'));
    }
    console.log('   bilan : ' + JSON.stringify(ouverts));
    ok(ouverts.filter((o) => o.arrive).length === coffres.length,
       `on est passe sur CHACUN des coffres peints (${ouverts.filter((o) => o.arrive).length} sur ${coffres.length})`);
    /* `ouverts.length &&` n'est pas une precaution : sur une liste vide,
       `every` rend VRAI et `Set([]).size === 0` aussi. Une salle ou plus rien
       ne serait peint aurait donc rendu deux lignes vertes — le pire des
       verdicts, celui qui passe parce qu'il n'a rien regarde. */
    ok(ouverts.length > 0 && ouverts.every((o) => o.titre),
       'et CHACUN s ouvre — pas seulement le premier');
    ok(ouverts.length > 0 && new Set(ouverts.map((o) => o.titre)).size === ouverts.length,
       `ils ouvrent autant de fiches DIFFERENTES (${ouverts.map((o) => o.titre).join(' | ')})`);
    ok(ouverts.some((o) => /potion/i.test(o.titre || '')),
       'et l un d eux est le coffre a fioles');

    /* ---- ET LA CROIX DOIT ETRE TOUCHABLE ----
     * C'est elle qui permet d'ouvrir le SUIVANT : un coffre qu'on ne peut pas
     * fermer est un coffre qui bloque tous les autres. Sur un ecran de 412 px,
     * la fiche est poussee a gauche par le panneau lateral — et la croix, qui
     * vit dans son coin haut-droit, part avec elle.
     *
     * Pour la mesurer il faut une fiche OUVERTE. On repartait « a droite
     * quatre cents, a gauche quatre cents » en esperant retomber sur un
     * coffre : trois executions sur quatre lisaient donc la croix d'une fiche
     * fermee, et « un doigt pose sur la croix la touche vraiment » nommait ce
     * qu'il y avait dessous — le panneau. On ressort du coffre et on y
     * revient, et l'on ATTEND qu'il soit ouvert : la page refuse de rouvrir
     * ce qu'on vient de fermer tant qu'on n'en est pas parti. */
    const dernier = coffres[coffres.length - 1] || { x: 0 };
    /* Le plus LOIN de celui qu'on vient de quitter : il faut vraiment etre
       sorti du disque du precedent pour que la page accepte d'en rouvrir un. */
    const aRouvrir = coffres.reduce(
      (m, c) => (Math.abs(c.x - dernier.x) > Math.abs(m.x - dernier.x) ? c : m), coffres[0]);
    await fermeLaFiche();
    if (aRouvrir) await surLeCoffre(aRouvrir);
    const rouvert = await attend(t, () => document.getElementById('nxCoffreVoile').classList.contains('on'),
                                 null, 'la fiche rouverte apres etre ressorti', 5000);
    const croix = await t.evaluate(() => {
      const v = document.getElementById('nxCoffreVoile');
      const x = v.querySelector('.nxcf-x');
      const c = v.querySelector('.nxcf-carte');
      if (!x || !c) return null;
      const q = x.getBoundingClientRect(), qc = c.getBoundingClientRect();
      const centre = { x: q.x + q.width / 2, y: q.y + q.height / 2 };
      const dessus = document.elementFromPoint(centre.x, centre.y);
      return { on: v.classList.contains('on'),
               ecran: window.innerWidth,
               carte: { x: Math.round(qc.x), l: Math.round(qc.width) },
               x: Math.round(q.x), y: Math.round(q.y),
               l: Math.round(q.width), h: Math.round(q.height),
               atteint: !!(dessus && (dessus === x || x.contains(dessus))),
               quoi: dessus ? (dessus.className || dessus.tagName) : null };
    });
    console.log('   la croix     : ' + JSON.stringify(croix));
    ok(rouvert && croix && croix.on, 'le coffre est bien rouvert');
    ok(croix && croix.x >= 0 && croix.x + croix.l <= croix.ecran,
       `la croix est DANS l ecran (${croix && croix.x}..${croix && croix.x + croix.l} sur ${croix && croix.ecran})`);
    ok(croix && croix.l >= 30 && croix.h >= 30,
       `et assez grande pour un pouce (${croix && croix.l}x${croix && croix.h})`);
    /* Le vrai test : le doigt tombe-t-il DESSUS ? Un bouton visible qu'un
       autre element recouvre se lit comme un bouton mort. */
    ok(croix && croix.atteint,
       `un doigt pose sur la croix la touche vraiment (il touche : ${croix && croix.quoi})`);
    /* Et la fiche doit occuper l'ecran, pas la moitie. */
    ok(croix && croix.carte.l > croix.ecran * 0.75,
       `la fiche occupe l ecran du telephone (${croix && croix.carte.l} sur ${croix && croix.ecran})`);
  }

  const uniq = Array.from(new Set(manquants));
  if (uniq.length) console.log('\n   fichiers demandes et introuvables : ' + uniq.join(', '));
  ok(uniq.length === 0, `aucun fichier demande n est introuvable (${uniq.length})`);

  ok(erreurs.length === 0, 'aucune erreur de page' + (erreurs.length ? ' : ' + erreurs[0] : ''));

  await nav.close(); site.stop();
  console.log('\nmonde_page.test.js : ' + n + ' verifications, ' + rates + ' ratees');
  process.exit(rates ? 1 : 0);
})();
