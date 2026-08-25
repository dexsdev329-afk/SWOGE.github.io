/* LE TIROIR DU COMPTE EST BLANC, ET TOUT S Y LIT.
 *
 * ---- CE QUI ETAIT DEMANDE ----
 *
 * L utilisateur a colle la liste du tiroir — « Go to / Home / Account / My
 * Wallet / Staking / Deposit / Withdraw / Daily Quests / Shop / Chests &
 * items / … / Sign out » — et ecrit : « ca faut passer en blanc ».
 *
 * ---- POURQUOI UN ESSAI, ET PAS SEULEMENT UNE CAPTURE ----
 *
 * Le tiroir est peint par `stakebubble.js`, qui le pose sur VINGT pages. Sa
 * feuille de style tenait six cent vingt-six couleurs, toutes choisies pour un
 * fond noir. Les retourner une par une a la main aurait laisse des oublis, et
 * un oubli ici ne se voit pas : c est un texte clair sur du blanc, donc du
 * VIDE. On ne remarque pas une ligne absente — on remarque une ligne fausse.
 *
 * Cet essai ne relit donc pas les couleurs que j ai ecrites, ce qui ne
 * prouverait rien. Il OUVRE le tiroir avec une vraie session et MESURE, pour
 * chaque texte visible, le contraste entre sa couleur et le fond effectivement
 * peint derriere lui. Un mot invisible tombe, quelle que soit la regle qui l a
 * rendu invisible.
 *
 * Le seuil est 4,5 pour le texte ordinaire et 3 pour ce qui est gros ou gras —
 * ce sont les seuils habituels, pas des nombres choisis pour que ca passe.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('tiroir_blanc.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('tiroir_blanc.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
  await p.waitForTimeout(900);
  ok(true, 'le tiroir s ouvre');

  /* ---- LE FOND DU TIROIR EST CLAIR ---- */
  const teinte = await p.evaluate(() => {
    const d = document.querySelector('.swp'), c = getComputedStyle(d);
    const g = c.backgroundImage + ' ' + c.backgroundColor;
    const m = g.match(/rgba?\(([^)]*)\)/g) || [];
    const clair = m.map((x) => {
      const [r, v, b] = x.match(/[\d.]+/g).map(Number);
      return (0.2126 * r + 0.7152 * v + 0.0722 * b) / 255;
    }).filter((x) => x > 0);
    return { max: Math.max.apply(null, clair.concat([0])), texte: c.color };
  });
  ok(teinte.max > 0.85,
     `le tiroir est peint clair (clarte ${Math.round(teinte.max * 100)} %) — c est ce`
     + ' qui etait demande, et c est la premiere chose que le reste suppose');

  /* ---- ET CHAQUE MOT S Y LIT ----
   * La mesure est faite dans le navigateur : on remonte les parents jusqu au
   * premier fond OPAQUE, comme le fait l oeil, parce qu un element sans fond
   * declare n est pas transparent a la lecture — il montre celui du dessous. */
  const mesure = () => p.evaluate(() => {
    function lum(r, v, b) {
      const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(v) + 0.0722 * f(b);
    }
    function lis(s) { const m = s.match(/[\d.]+/g); return m ? m.map(Number) : null; }
    function fond(e) {
      /* ---- UN DEGRADE N EST PAS UNE IMAGE ----
       * La premiere version s arretait des que `backgroundImage` valait autre
       * chose que `none` et rangeait le texte parmi les cas non mesurables.
       * Or le tiroir lui-meme est peint par un DEGRADE : tout etait donc mis
       * de cote, et l essai annoncait « tout se lit » apres n avoir rien
       * mesure. Une verification qui ne mesure rien passe toujours.
       * On garde la mise a l ecart pour les VRAIES images — une photo, dont on
       * ne sait pas dire la couleur — et l on lit les arrets d un degrade,
       * en retenant le PIRE pour le texte pose dessus. */
      for (let n = e; n && n !== document.documentElement; n = n.parentElement) {
        const c = getComputedStyle(n);
        const bi = c.backgroundImage || 'none';
        if (bi.indexOf('url(') >= 0) return { image: true };
        if (bi !== 'none') {
          const arrets = (bi.match(/rgba?\([^)]*\)/g) || [])
            .map(lis).filter((v) => v && (v.length < 4 || v[3] >= 0.9));
          if (arrets.length) return { arrets: arrets.map((v) => v.slice(0, 3)) };
        }
        const v = lis(c.backgroundColor);
        if (v && (v.length < 4 || v[3] >= 0.92)) return { rgb: v.slice(0, 3) };
      }
      return { rgb: [255, 255, 255] };
    }
    const sortie = [], images = [];
    const dedans = document.querySelector('.swpov');
    document.querySelectorAll('.swpov *').forEach((e) => {
      if (!e.childNodes.length) return;
      /* Le texte PROPRE a l element : le texte des enfants a sa propre
         couleur et sera mesure sur son propre element. */
      let t = '';
      e.childNodes.forEach((n) => { if (n.nodeType === 3) t += n.textContent; });
      t = t.trim();
      if (!t) return;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const c = getComputedStyle(e);
      if (c.visibility === 'hidden' || c.display === 'none') return;
      if (Number(c.opacity) < 0.35) return;          /* volontairement eteint */
      const f = fond(e);
      if (f.image) { images.push(t.slice(0, 30)); return; }
      const av = lis(c.color); if (!av) return;
      if (av.length > 3 && av[3] < 0.5) return;
      const L1 = lum(av[0], av[1], av[2]);
      const derriere = f.arrets || [f.rgb];
      let rap = Infinity;
      derriere.forEach((d) => {
        const L2 = lum(d[0], d[1], d[2]);
        const x = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        if (x < rap) rap = x;                       /* le pire arret du degrade */
      });
      rap = Math.round(rap * 10) / 10;
      const gros = parseFloat(c.fontSize) >= 18.66
                   || (parseFloat(c.fontSize) >= 14 && Number(c.fontWeight) >= 700);
      sortie.push({ t: t.slice(0, 34), rap: rap,
                    seuil: gros ? 3 : 4.5, taille: c.fontSize });
    });
    return { textes: sortie, images: images.length };
  });

  const sections = [['', 'le sommaire'], ['sh', 'la boutique'],
                    ['sk', 'les personnages'], ['lb', 'le classement']];
  let toutVu = 0;
  for (const [k, nom] of sections) {
    if (k) {
      const y = await p.evaluate((k) => {
        const b = document.querySelector('.swpov [data-k="' + k + '"]');
        if (!b) return false; b.click(); return true;
      }, k);
      if (!y) { ok(false, `${nom} : la rangee du sommaire est introuvable`); continue; }
      await p.waitForTimeout(1500);
    }
    const m = await mesure();
    toutVu += m.textes.length;
    const rates = m.textes.filter((x) => x.rap < x.seuil);
    ok(m.textes.length > 5, `${nom} : ${m.textes.length} textes mesures`
       + (m.images ? ` (${m.images} poses sur une image, mis de cote)` : ''));
    ok(rates.length === 0,
       rates.length
         ? `${nom} : ${rates.length} texte(s) illisible(s) — `
           + rates.slice(0, 6).map((x) => `« ${x.t} » ${x.rap}:1 au lieu de ${x.seuil}`).join(' ; ')
         : `${nom} : tout se lit — le plus faible passe quand meme le seuil`);
    if (k) {
      await p.evaluate(() => { const b = document.querySelector('.swpb'); if (b) b.click(); });
      await p.waitForTimeout(250);
      await p.evaluate(() => { const b = document.querySelector('.swpb'); if (b) b.click(); });
      await p.waitForTimeout(500);
    }
  }
  ok(toutVu > 60, `${toutVu} textes du tiroir mesures en tout`);

  /* ---- LA COULEUR DU SERVEUR EST GARDEE, PAS REMPLACEE ----
   * Les teintes de rarete viennent du catalogue. On les assombrit pour
   * qu elles se lisent sur blanc ; il faut donc verifier que la TEINTE reste —
   * un legendaire assombri jusqu au noir aurait « passe » l essai precedent
   * tout en effacant l information qu il porte. */
  const teintes = await p.evaluate(() => {
    const b = document.querySelector('.swpov [data-k="sh"]'); if (b) b.click();
    return null;
  });
  await p.waitForTimeout(1500);
  const rarete = await p.evaluate(() => {
    const l = [];
    document.querySelectorAll('.swb-cof .o b[style*="color"]').forEach((e) => {
      const m = getComputedStyle(e).color.match(/[\d.]+/g).map(Number);
      /* Le NOM de la rarete est le mot qui suit le pourcentage, dans le meme
         couple insecable. C est lui qui permet de retrouver l original. */
      const nom = (e.parentElement.textContent || '').replace(/^[^%]*%\s*/, '').trim();
      l.push({ nom: nom, r: m[0], v: m[1], b: m[2] });
    });
    return l;
  });
  ok(rarete.length >= 4, `${rarete.length} teintes de rarete lues a l ecran`);
  /* ---- ON COMPARE A CE QUE LE SERVEUR A ENVOYE ----
   * La premiere version refusait toute teinte grise a l ecran. Elle tombait
   * sur « Common », qui est gris DANS LE CATALOGUE : l essai reprochait a la
   * page une couleur qu elle n avait pas choisie. On compare donc chaque
   * teinte affichee a son original, et l on verifie deux choses : qu elle a
   * bien ete assombrie, et que sa TEINTE n a pas bouge. */
  const source = {};
  boutique.RARETES.forEach((r) => { source[r.nom] = r.couleur; });
  function hue(r, v, b) {
    const mx = Math.max(r, v, b), mn = Math.min(r, v, b), d = mx - mn;
    if (d < 8) return -1;                                    /* un gris n a pas de teinte */
    let h;
    if (mx === r) h = ((v - b) / d) % 6; else if (mx === v) h = (b - r) / d + 2; else h = (r - v) / d + 4;
    h *= 60; return h < 0 ? h + 360 : h;
  }
  const compares = rarete.map((x) => {
    const o = source[x.nom]; if (!o) return null;
    const h = o.replace('#', '');
    const or = parseInt(h.slice(0, 2), 16), ov = parseInt(h.slice(2, 4), 16), ob = parseInt(h.slice(4, 6), 16);
    const ha = hue(or, ov, ob), hb = hue(x.r, x.v, x.b);
    const ecart = (ha < 0 || hb < 0) ? (ha === hb ? 0 : 999)
                                     : Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb));
    return { nom: x.nom, ecart: Math.round(ecart),
             plusSombre: (x.r + x.v + x.b) <= (or + ov + ob) + 3 };
  }).filter(Boolean);
  ok(compares.length >= 3, `${compares.length} teintes comparees a celles du catalogue`);
  const derives = compares.filter((x) => x.ecart > 12);
  ok(derives.length === 0,
     derives.length
       ? `${derives.length} rarete(s) ont CHANGE de teinte : `
         + derives.map((x) => `${x.nom} (${x.ecart} degres)`).join(', ')
       : 'et elles ont garde leur teinte : un legendaire reste dore, un mythique rouge');
  ok(compares.every((x) => x.plusSombre),
     'chacune a bien ete assombrie et non eclaircie — sur du blanc, eclaircir'
     + ' ferait exactement l inverse de ce qu on cherche');

  ok(erreurs.length === 0, `aucune erreur de page${erreurs.length ? ' — ' + erreurs[0] : ''}`);
  await nav.close(); site.stop();
  console.log(`\ntiroir_blanc.test.js : ${n} verifications, ${rates} rate(s)`);
  process.exit(rates ? 1 : 0);
})();
