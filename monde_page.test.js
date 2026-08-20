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
        s.send = function (d) { try { const o = JSON.parse(d); o.__t = performance.now(); s.__out.push(o); } catch (x) {} return env(d); };
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
                    && (!window.__zones || !window.__zones.length);
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
      /* Le NUMERO D'IMAGE. Sans lui on ne peut pas dire « le cercle est peint
         AVANT les creatures » : on ne saurait pas ou finit une image et ou
         commence la suivante, et l'ordre lu serait celui de deux images
         differentes. */
      window.__image = 0;
      (function compte() { window.__image++; requestAnimationFrame(compte); })();
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
  /* DOUBLE-clic. Le clic simple faisait la meme chose et c'etait une erreur :
     la case est aussi une poignee de glissement, et un clic legerement de
     travers devenait un ramassage qu'on n'avait pas demande. */
  await p.evaluate(() => {
    const c = document.querySelector('#nxButinCases .nxp-c[data-butin="1"]');
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await p.waitForTimeout(400);
  const demande = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').pop());
  const apres = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  console.log('\n-- toucher une place --');
  console.log('   demande envoyee : ' + JSON.stringify(demande));
  ok(apres === avant + 1, 'un double-clic envoie UNE demande, pas dix');
  ok(demande && demande.i === 80009, 'elle nomme le sac');
  ok(demande && demande.place === 1, 'et la place touchee, pas la premiere');

  /* Une place VIDE ne demande rien : un clic dans le vide qui parlerait au
     serveur serait du bruit, et le refus qui reviendrait serait incomprehensible. */
  const avantVide = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  await p.evaluate(() => {
    document.querySelectorAll('#nxButinCases .nxp-c.vide')[0]
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await p.waitForTimeout(250);
  const apresVide = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  ok(apresVide === avantVide, 'une place vide ne demande rien');

  /* ---- ET LE CLIC SIMPLE NE PREND PLUS RIEN ----
   * C'est la moitie du sens du double-clic : la case doit pouvoir etre
   * attrapee sans etre consommee. */
  const avantSimple = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  await p.evaluate(() => { document.querySelector('#nxButinCases .nxp-c[data-butin="0"]').click(); });
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
  const blocs = await p.evaluate(() => {
    const e = window.__s[0].__m.filter((m) => m.type === 'realmEntre').pop();
    return e.obstacles || [];
  });
  console.log('\n-- les blocs --');
  console.log('   recus : ' + blocs.length);
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
  /* Quatre secondes de marche a un peu plus de deux cents unites par seconde :
     on ne vise pas plus loin que ce qu'on peut parcourir. */
  const PORTEE = 700;
  let cible = null;
  for (const [dx0, dy0, tt] of HUIT) {
    for (const o of blocs) {
      const vx = o.x - moi.x, vy = o.y - moi.y;
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
    const q = blocs.map((o) => ({ o, d: Math.hypot(o.x - moi.x, o.y - moi.y) }))
                   .sort((a2, b2) => a2.d - b2.d)[0];
    const tt = [];
    if (q.o.x > moi.x + 20) tt.push('ArrowRight'); else if (q.o.x < moi.x - 20) tt.push('ArrowLeft');
    if (q.o.y > moi.y + 20) tt.push('ArrowDown'); else if (q.o.y < moi.y - 20) tt.push('ArrowUp');
    cible = { o: q.o, d: q.d, touches: tt, faute: true };
  }
  console.log(`   vise : un bloc a ${Math.round(cible.d)} unites, par ${cible.touches.join('+')}` +
              (cible.faute ? ' (aucune route degagee — repli sur le plus proche)' : ''));

  await p.evaluate(() => { window.__s[0].__out.length = 0; });
  const touches = cible.touches;
  for (const t2 of touches) await p.keyboard.down(t2);
  await p.waitForTimeout(4000);
  for (const t2 of touches) await p.keyboard.up(t2);
  await p.waitForTimeout(300);

  const trajet = await p.evaluate(() => window.__s[0].__out
    .filter((m) => m.type === 'realmMove').map((m) => ({ x: m.x, y: m.y })));
  const RAYON_MOI = 22;
  let dedans = 0, plusPres = Infinity;
  for (const q of trajet) {
    for (const o of blocs) {
      const d = Math.hypot(o.x - q.x, o.y - q.y) - o.r - RAYON_MOI;
      if (d < plusPres) plusPres = d;
      if (d < -2) dedans++;
    }
  }
  console.log(`   ${trajet.length} positions annoncees, au plus pres a ${plusPres.toFixed(1)} unites du bord`);
  ok(trajet.length > 10, `le personnage a bien marche (${trajet.length} positions)`);
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
    return e.salles || [];
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
   * qu'on n'avait pas bouge. Depuis qu'on marche quatre secondes vers un
   * rocher, ce point est a deux cents unites derriere : les sacs tombaient
   * hors de portee et les jauges se cherchaient au mauvais endroit. */
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
  await p.evaluate(async ([x, y, piece]) => {
    /* Une piece dans le sac du joueur. D'ou elle vient ne regarde pas cet
       essai : le serveur en repond, et butin.test.js le verifie. */
    window.__s[0].dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
      type: 'equipable', fruits: [], armes: [], armures: [], bagues: [],
      sac: [{ id: 4242, cle: piece.cle, nom: piece.nom, rarete: piece.rarete,
              couleur: '#8DA0C4', saison: piece.saison, place: 0 }],
    }) }));
    window.__sacs = [{ i: 80020, x: x, y: y, s: 'brun', r: 55, c: [{ po: 'mana' }] }];
    for (let k = 0; k < 30; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
  }, [moi.x, moi.y, PIECE]);
  await p.waitForTimeout(300);

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
    await p.waitForTimeout(400);
    const depot = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmDepose').pop());
    const apresD = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmDepose').length);
    console.log('\n-- glisser du sac vers le sol --');
    console.log('   ' + JSON.stringify(depot));
    ok(apresD === avantD + 1, 'glisser une piece sur le sac au sol la DEPOSE');
    ok(depot && depot.item === 4242, 'et c est bien la piece qu on tenait');

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
    await p.waitForTimeout(400);
    const pris = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').pop());
    const apresR = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
    console.log('\n-- glisser du sol vers son sac --');
    console.log('   ' + JSON.stringify(pris));
    ok(apresR === avantR + 1, 'glisser depuis le sac au sol le RAMASSE');
    ok(pris && pris.i === 80020, 'en nommant le sac sur lequel on se tient');
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
  await t.waitForTimeout(1600);

  const boutons = await t.evaluate(() => {
    const r = (id) => { const e = document.getElementById(id); if (!e) return null;
      const q = e.getBoundingClientRect();
      return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width),
               h: Math.round(q.height), vu: q.width > 0 && q.height > 0 }; };
    return { maison: r('nxMaison'), tir: r('nxTir'), pad: r('nxPad'),
             largeur: window.innerWidth,
             dansLePad: !!document.querySelector('#nxPad [data-nexus]') };
  });
  console.log('\n-- les commandes tactiles --');
  console.log('   maison : ' + JSON.stringify(boutons.maison));
  console.log('   tir    : ' + JSON.stringify(boutons.tir));
  console.log('   pave   : ' + JSON.stringify(boutons.pad));

  ok(boutons.maison && boutons.maison.vu, 'le bouton maison est visible au doigt');
  ok(!boutons.dansLePad, 'et il n est PLUS dans le pave de deplacement');
  if (boutons.maison && boutons.tir && boutons.pad) {
    /* Son CENTRE, pas son bord gauche : un bouton de 54 px pose a 196 sur un
       ecran de 412 a son bord a gauche du milieu et son centre a droite. */
    const centre = boutons.maison.x + boutons.maison.w / 2;
    ok(centre > boutons.largeur / 2,
       `son centre est dans la moitie DROITE (${centre} sur ${boutons.largeur})`);
    /* Il est cale au bord de la ZONE DE JEU, comme le tir : le panneau occupe
       la droite de l'ecran, et un bouton pose au bord de l'ecran tomberait
       derriere lui — on le verrait, le doigt atterrirait sur le panneau, et
       rien ne se passerait sans que rien ne le dise. */
    ok(Math.abs(boutons.maison.x + boutons.maison.w - (boutons.tir.x + boutons.tir.w)) < 2,
       'et il est aligne a droite sur le bouton de tir');
    ok(boutons.maison.x > boutons.pad.x + boutons.pad.w,
       'a distance du pave, pas a un demi-centimetre de « avancer »');
    ok(boutons.maison.y + boutons.maison.h <= boutons.tir.y,
       `et AU-DESSUS du tir (${boutons.maison.y}+${boutons.maison.h} contre ${boutons.tir.y})`);
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
  }, [moiT.x, moiT.y]);
  await t.waitForTimeout(400);

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
             hauteur: window.innerHeight,
             tir: Math.round(document.getElementById('nxTir').getBoundingClientRect().y) };
  });
  console.log('\n-- le sac au sol, panneau replie --');
  console.log('   ' + JSON.stringify(flot));
  ok(flot.visible, 'panneau replie, le sac au sol reste atteignable');
  ok(flot.cases.length === 2, `elle ne montre que les places PLEINES (${flot.cases.length}, pas 8)`);
  if (flot.cases.length) {
    ok(flot.cases.every((c) => c.vu), 'et chacune est reellement visible');
    ok(/ATT/.test(flot.cases[0].titre), 'la premiere dit ce qu elle donne : ' + flot.cases[0].titre);
    ok(flot.y + flot.h <= flot.tir + 6,
       `elle est AU-DESSUS des commandes (${flot.y}+${flot.h} contre ${flot.tir})`);
  }

  /* Un simple appui prend. C'est le seul endroit du jeu ou un clic simple
     prend quelque chose : cette case-la n'est pas une poignee. */
  const avantF = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmRamasse').length);
  await t.evaluate(() => { document.querySelector('#nxButinFlot [data-flot="1"]').click(); });
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
    const pad = document.getElementById('nxPad').getBoundingClientRect();
    return {
      on: el.classList.contains('on'), y: Math.round(q.y), h: Math.round(q.height),
      padY: Math.round(pad.y),
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
  ok(fioles.y + fioles.h <= fioles.padY + 6,
     `elles sont AU-DESSUS du pave (${fioles.y}+${fioles.h} contre ${fioles.padY})`);

  const avantT = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
  await t.evaluate(() => { document.querySelector('#nxPot [data-pot="vie"]').click(); });
  await t.waitForTimeout(300);
  const apresT = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
  ok(apresT === avantT + 1, 'un appui boit');
  await t.evaluate(() => { document.querySelector('#nxPot [data-pot="mana"]').click(); });
  await t.waitForTimeout(250);
  const apresVideT = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
  ok(apresVideT === apresT, 'et la fiole grisee ne demande rien');

  /* Et a la SOURIS elle n'existe pas : le panneau y est toujours ouvert, et il
     faut les deux grilles cote a cote pour glisser de l'une a l'autre. */
  const surSouris = await p.evaluate(() => {
    const el = document.getElementById('nxButinFlot');
    return { existe: !!el, allumee: el ? el.classList.contains('on') : null };
  });
  ok(surSouris.existe && !surSouris.allumee,
     'a la souris la rangee flottante reste eteinte : le panneau suffit');

  /* Panneau replie, les deux boutons glissent au bord de l'ecran : c'est
     justement comme ca qu'on joue sur telephone. */
  await t.evaluate(() => { document.getElementById('nxWrap').classList.add('replie'); });
  await t.waitForTimeout(400);
  const replie = await t.evaluate(() => {
    const q = document.getElementById('nxMaison').getBoundingClientRect();
    return { bord: Math.round(window.innerWidth - (q.x + q.width)) };
  });
  ok(replie.bord <= 20, `panneau replie, la maison passe a ${replie.bord} px du bord`);
  await t.evaluate(() => { document.getElementById('nxWrap').classList.remove('replie'); });
  await t.waitForTimeout(300);

  /* Et il fait ce qu'il annonce : on quitte le monde. */
  const avantSortie = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmLeave').length);
  await t.evaluate(() => document.getElementById('nxMaison').click());
  await t.waitForTimeout(500);
  const apresSortie = await t.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'realmLeave').length);
  ok(apresSortie === avantSortie + 1, 'le toucher fait bien SORTIR du monde');
  /* Et une fois rentre, les deux boutons du monde disparaissent : un bouton
     de tir dans le Nexus n'a rien a viser. */
  const apresRentree = await t.evaluate(() => ({
    maison: document.getElementById('nxMaison').classList.contains('on'),
    tir: document.getElementById('nxTir').classList.contains('on'),
  }));
  ok(!apresRentree.maison && !apresRentree.tir,
     'de retour au Nexus, ni maison ni tir ne restent allumes');

  /* ---- BOIRE EN COMBAT ----
   *
   * Les potions ne se buvaient qu'en TAPANT le panneau. En combat on ne quitte
   * pas son personnage des yeux pour viser un bouton de trente pixels dans un
   * coin — et sur telephone le panneau est replie pendant qu'on se bat. On
   * mourait avec des potions plein le sac.
   *
   * Trois surfaces mènent au meme geste : la touche, le panneau, et les deux
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
    const avantVide = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
    await p.keyboard.press('KeyE');
    await p.waitForTimeout(300);
    const apresVide = await p.evaluate(() => window.__s[0].__out.filter((m) => m.type === 'potionBoit').length);
    ok(apresVide === avantVide, 'une potion qu on n a pas ne part pas au serveur');

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
    /* ---- ON LUI MET UNE ARME DANS LA MAIN ----
     * Le personnage de cet essai n'en porte aucune : il tire donc au poing,
     * qui n'a pas de planche et se dessine en trait de secours. Impossible
     * alors de mesurer « du clic au projectile PEINT » — la mesure attrapait
     * la bave d'un lime qui passait par la, et annoncait 12 ms quand notre
     * propre tir en mettait deux cent soixante-dix.
     * On rejoue donc la derniere fiche recue du serveur, avec une arme du
     * CATALOGUE en plus. Rien d'invente : ni la fiche, ni l'arme. */
    const arme = await p.evaluate((piece) => {
      const s = window.__s[0];
      const fic = s.__m.filter((x) => x.type === 'personnage' && x.etat).pop();
      if (!fic) return null;
      const etat = { ...fic.etat, equipArme: { id: 4243, cle: piece.cle, nom: piece.nom,
                                               famille: piece.famille, rarete: piece.rarete } };
      s.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify({ ...fic, etat }) }));
      return piece.famille;
    }, PIECE);
    ok(arme === PIECE.famille, `le personnage porte une ${PIECE.nom} (${arme})`);
    await p.waitForTimeout(400);
    await p.evaluate(() => { window.__premierTir = null; window.__clic = null;
                             window.__heuresTirs.length = 0; window.__tirs.length = 0;
                             window.__s[0].__out.length = 0; });
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
               arme: fam,
               /* La cadence REELLE, mesuree entre deux demandes. Elle dit d'un
                  coup d'oeil quelle arme on portait — et donc si la mesure
                  ci-dessous parle bien de ce qu'on croit. */
               cadence: dem.length > 2
                 ? Math.round(100000 / ((dem[dem.length - 1].__t - dem[0].__t) / (dem.length - 1))) / 100 : null,
               delai: apres.length && window.__clic !== null ? apres[0].t - window.__clic : null };
    });
    console.log('   ' + JSON.stringify(tir));
    ok(tir.clic, 'le clic est bien arrive dans la page');
    ok(tir.demandes > 0, `la page a demande a tirer ${tir.demandes} fois pendant l appui`);
    ok(tir.arme === PIECE.famille, `et la page l a bien enregistree (${tir.arme || 'aucune'})`);
    /* ---- ET IL TIRE A LA CADENCE DE SON ARME ----
     * Deux boucles faisaient descendre la MEME recharge a chaque image : dans
     * le monde, toute arme tirait au DOUBLE de sa cadence. Le serveur, lui,
     * appliquait la vraie — il refusait une demande sur deux en silence, et un
     * tir sur deux etait un fantome qui s'effacait sans rien toucher. */
    const CAD = monde.ARMES[PIECE.famille].cadence;
    ok(tir.cadence !== null && Math.abs(tir.cadence - CAD) < CAD * 0.15,
       `elle tire a ${tir.cadence} coups par seconde — son arme en promet ${CAD}`);
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
    ok(tir.delai !== null && tir.delai < 120,
       `du clic au projectile peint : ${tir.delai === null ? 'JAMAIS' : Math.round(tir.delai) + ' ms'}`);
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
    const ou = await p.evaluate(() => {
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
    console.log('\n-- le coffre des salles gardees --');
    console.log('   ' + JSON.stringify(ou));
    ok(!!ou, 'la salle est posee sous nos pieds');

    if (ou) {
      /* FERME tant qu'un gardien vit. */
      await p.evaluate(async () => {
        window.__peint.length = 0; window.__sacs = []; window.__zones = [];
        for (let k = 0; k < 20; k++) { window.__pousse(); await new Promise((f) => requestAnimationFrame(f)); }
      });
      await p.waitForTimeout(200);
      const ferme = await p.evaluate(([x, y]) => {
        const a = window.__peint.filter((d) => d.src === 'obj_coffre_garde.webp' && d.ecran);
        const d = a[a.length - 1] || null;
        return { n: a.length, col: d ? Math.round(d.sx / d.sw) : null,
                 cx: d ? d.dx + d.dw / 2 : null, bas: d ? d.dy + d.dh : null,
                 dh: d ? d.dh : null,
                 colonnes: Array.from(new Set(a.map((o) => Math.round(o.sx / (o.sw || 1))))) };
      }, [ou.x, ou.y]);
      console.log('   ferme : ' + JSON.stringify(ferme));
      ok(ferme.n > 0, `le coffre est peint (${ferme.n} dessins)`);
      ok(ferme.colonnes.length === 1 && ferme.colonnes[0] === 0,
         'et FERME tant que la salle est gardee : ' + ferme.colonnes.join(','));
      ok(ferme.cx !== null && Math.abs(ferme.cx - ou.x) < 3,
         `au milieu de la piece (a ${ferme.cx === null ? '?' : Math.round(Math.abs(ferme.cx - ou.x))} unites)`);

      /* OUVERT des que la salle tombe. Le serveur ne dit que ca — « videe » —
         et la page joue les trois images toute seule : lui demander chaque
         image serait dix messages pour une demi-seconde. */
      await p.evaluate(async (i) => {
        window.__peint.length = 0;
        const s = window.__s[0];
        const env = () => s.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ type: 'realmEtat', monstres: [], tirs: [], tirsM: [],
                                 tombes: [], joueurs: [], sacs: [], zones: [],
                                 salles: [{ i, v: 1 }] }) }));
        for (let k = 0; k < 60; k++) { env(); await new Promise((f) => requestAnimationFrame(f)); }
      }, ou.i);
      await p.waitForTimeout(200);
      const ouvert = await p.evaluate(() => {
        const a = window.__peint.filter((d) => d.src === 'obj_coffre_garde.webp' && d.ecran);
        return { n: a.length,
                 colonnes: Array.from(new Set(a.map((o) => Math.round(o.sx / (o.sw || 1))))),
                 fin: a.length ? Math.round(a[a.length - 1].sx / a[a.length - 1].sw) : null,
                 bas: a.map((o) => ({ c: Math.round(o.sx / o.sw), b: o.dy + o.dh, h: o.dh })) };
      });
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
      const pieds = ouvert.bas.map((o) => o.b - (1 - vide[o.c]) * o.h);
      const eca = Math.max(...pieds) - Math.min(...pieds);
      console.log(`   le bas reel varie de ${eca.toFixed(2)} unites sur les trois images`);
      ok(eca < 1, `le coffre ne saute pas en s ouvrant (${eca.toFixed(2)} unites)`);
      ok(Math.abs(pieds[0] - ou.y) < 2,
         `et il repose sur le centre de la salle (a ${Math.abs(pieds[0] - ou.y).toFixed(1)} unites)`);
    }
  }

  const uniq = Array.from(new Set(manquants));
  if (uniq.length) console.log('\n   fichiers demandes et introuvables : ' + uniq.join(', '));
  ok(uniq.length === 0, `aucun fichier demande n est introuvable (${uniq.length})`);

  ok(erreurs.length === 0, 'aucune erreur de page' + (erreurs.length ? ' : ' + erreurs[0] : ''));

  await nav.close(); site.stop();
  console.log('\nmonde_page.test.js : ' + n + ' verifications, ' + rates + ' ratees');
  process.exit(rates ? 1 : 0);
})();
