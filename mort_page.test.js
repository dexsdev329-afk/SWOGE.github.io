/* L ECRAN DE FIN NOMME CE QU ON VIENT DE PERDRE.
 *
 * `game.meurt()` rend quatre listes NOMMEES pour le bilan — `sacDetail`,
 * `fiolesPerdues`, `oeufsPerdus`, `supPerdu` — et server.js les transmet
 * telles quelles. La page n en lisait AUCUNE : elle affichait `perdus` et un
 * COMPTE de pieces, et rien d autre. Un personnage qui mourait avec trois
 * fioles d attaque, deux de defense, un oeuf legendaire et quatre potions
 * bues recevait un ecran qui lui disait : « You were carrying nothing.
 * Nothing was lost. »
 *
 * L oeuf tombe une fois sur mille deux cents, le legendaire une fois sur
 * trente mille morts : c est la chose la plus rare du jeu, et le seul moment
 * ou le joueur apprend qu il l a perdue etait un ecran qui lui disait qu il
 * n avait rien. Les potions BUES sont souvent la perte la plus lourde d une
 * sortie, et la seule qu aucun coffre n aurait pu eviter.
 *
 * Les essais du serveur affirment deja dans leurs propres libelles que
 * « l ecran de fin le nomme, au lieu de le taire » (oeufs.test.js) et que
 * « le bilan de mort nomme les potions perdues » (butin.test.js). Personne
 * n avait jamais regarde l ecran.
 *
 * 1. CE QUE LE SERVEUR ENVOIE VRAIMENT arrive bien sur le fil.
 * 2. L ECRAN NOMME CHAQUE NATURE : pieces portees, sac, fioles, oeufs,
 *    potions bues. Une ligne par nature, parce qu on ne perd pas la meme
 *    chose.
 * 3. LES NOMS PORTENT LEUR COULEUR DE RARETE — celle du serveur, verifiee
 *    contre `boutique.rarete()`, et sur DEUX raretes differentes : une seule
 *    couleur juste par hasard ne prouverait rien.
 * 4. ET LES MAINS VIDES, IL LE DIT TOUJOURS. Sans ce controle, un ecran qui
 *    n afficherait jamais « Nothing was lost » passerait le point 2.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('mort_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('mort_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ` [${a} vs ${b}]`);

function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
              '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
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

/* « rgb(255, 197, 61) » depuis « #FFC53D » : le navigateur rend la couleur
   calculee, le serveur la donne en hexadecimal. On CONVERTIT au lieu d ecrire
   les deux formes — une constante recopiee ici serait exactement la seconde
   table de raretes qu on cherche a ne pas avoir. */
function enRgb(hex) {
  const h = String(hex || '').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return 'rgb(' + parseInt(v.slice(0, 2), 16) + ', ' + parseInt(v.slice(2, 4), 16) +
         ', ' + parseInt(v.slice(4, 6), 16) + ')';
}

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/mortpage-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  /* `config.js` du serveur GELE l environnement a son premier `require` : un
     module du serveur charge avant cette ligne ferait partir le serveur sur le
     port du depot, et l essai expirerait sans rien dire d utile. Tout ce qui
     vient du serveur se charge donc APRES. */
  process.env.PORT = String(port);
  const { Game } = require(path.join(SERVEUR, 'game'));
  let moteur = null; const _p0 = Game.prototype._p;
  Game.prototype._p = function (a) { moteur = this; return _p0.call(this, a); };
  /* ---- LE MONDE OU L ON VA MOURIR ----
   * On attrape l instance de `Realm` au moment ou NOTRE joueur y entre :
   * server.js n en expose aucune, et il y en a plusieurs (deux cartes, les
   * donjons). Celle qui compte est celle qui vient de nous accepter. */
  const { Realm } = require(path.join(SERVEUR, 'realm'));
  let arene = null; const _rj = Realm.prototype.rejoint;
  Realm.prototype.rejoint = function (a) { arene = this; return _rj.apply(this, arguments); };
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const boutique = require(path.join(SERVEUR, 'boutique'));
  const personnages = require(path.join(SERVEUR, 'personnages'));
  const monde = require(path.join(SERVEUR, 'monde'));

  /* ---- CE QU ON EMPORTE ----
   * Deux pieces de raretes DIFFERENTES : une seule couleur juste ne dirait pas
   * si la page lit la rarete ou si elle peint tout de la meme teinte. Elles
   * viennent du CATALOGUE, jamais d une invention — un objet fabrique ici
   * demanderait un dessin qui n existe pas, et l essai passerait quand meme. */
  const TOUS = boutique.ITEMS.concat(boutique.ITEMS_DROP);
  const PIECE_A = TOUS.find((o) => o.rarete === 'commun');
  const PIECE_B = TOUS.find((o) => o.rarete === 'legendaire' &&
                                   boutique.rarete(o.rarete).couleur !== boutique.rarete('commun').couleur);
  const ARME = TOUS.find((o) => o.famille === 'lame');
  /* L espece d oeuf la plus rare, demandee au monde : c est elle dont le
     silence coutait le plus cher. */
  const OEUF = monde.OEUF.especes.slice().sort((a, b) => a.poids - b.poids)[0].cle;
  /* Les fioles du SAC — celles du coffre survivent, et c est toute la
     difference entre les deux endroits. */
  const FIOLES = { att: 3, def: 2 };
  /* Et la stat qu on BOIT : celle dont le plafond du personnage laisse le plus
     de place, demandee a personnages.js. Choisir « vit » au hasard donnerait un
     essai qui tombe le jour ou son plafond descend a zero. */
  const BASE = personnages.BASE.andy;
  const CHOIX = personnages.STATS
    .filter((s) => !(s in FIOLES))
    .map((s) => ({ s, max: personnages.supMaxDe(s, BASE[s]) }))
    .sort((a, b) => b.max - a.max)[0];
  const STAT_BUE = CHOIX.s, BUES = Math.min(4, CHOIX.max);

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
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);

  const adr = w.address;
  const q = moteur._p(adr);
  q.skins = { andy: true }; q.skinActif = 'andy';

  /* ================== ON CHARGE LE PERSONNAGE ==================
   * Par les VRAIES fonctions du moteur, pas en ecrivant dans l etat : un sac
   * pose a la main peut porter une combinaison que le jeu ne produit jamais,
   * et l ecran l afficherait alors sans que personne ne le voie jamais. */
  console.log('\n-- un personnage charge, pose par le moteur --');
  q.objets = q.objets || {};
  [PIECE_A, PIECE_B, ARME].forEach((o) => { q.objets[o.id] = (q.objets[o.id] || 0) + 1; });
  moteur.sortDuCoffre(adr, PIECE_A.id);
  moteur.sortDuCoffre(adr, PIECE_B.id);
  moteur.equipeArme(adr, 'andy', ARME.id);
  Object.keys(FIOLES).forEach((s) => {
    for (let i = 0; i < FIOLES[s]; i++) moteur.prendFiole(adr, s);
  });
  moteur.prendOeuf(adr, OEUF);
  /* Les potions BUES suivent le chemin complet : trouvee, rangee au coffre,
     bue. C est le seul chemin par lequel un joueur les obtient, et c est celui
     qui remplit `sup` — le champ que le bilan de fin doit nommer. */
  for (let i = 0; i < BUES; i++) moteur.prendFiole(adr, STAT_BUE);
  for (let i = 0; i < BUES; i++) moteur.rangeFiole(adr, STAT_BUE);
  for (let i = 0; i < BUES; i++) moteur.boitFiole(adr, 'andy', STAT_BUE);

  ok(BUES > 0, `on a bu ${BUES} potion(s) de ${STAT_BUE.toUpperCase()}`);
  eq(moteur._p(adr).persos.andy.sup[STAT_BUE], BUES, 'et le moteur les compte sur la fiche');
  eq(Object.keys(moteur._p(adr).sacOeufs || {})[0], OEUF, `l oeuf « ${OEUF} » est au sac`);
  eq((moteur._p(adr).sacFioles || {}).att, FIOLES.att, 'les fioles d attaque aussi');
  eq(moteur._p(adr).persos.andy.ea, ARME.id, `et l arme « ${ARME.nom} » est portee`);
  ok(boutique.rarete(PIECE_A.rarete).couleur !== boutique.rarete(PIECE_B.rarete).couleur,
     `les deux pieces du sac n ont pas la meme couleur de rarete ` +
     `(${PIECE_A.rarete} / ${PIECE_B.rarete})`);

  /* ================== ON MEURT ==================
   * Par le vrai chemin : la page entre dans le monde, le monde la tue, le
   * serveur envoie `realmMort`. Aucun message fabrique — un faux `realmMort`
   * verifierait la mise en page et rien de ce qui la precede.
   *
   * La BRULURE plutot qu un monstre : elle ignore la defense, ronge a huit
   * points par seconde et n a besoin de personne. Courir sur un squelette
   * marche aussi, mais demande de le trouver — et un essai qui depend d une
   * rencontre finit par echouer un jour ou la carte a peuple autrement. */
  const meurs = async () => {
    const avant = await p.evaluate(() => window.__s[0].__m.filter((m) => m.type === 'realmMort').length);
    await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin', monde: 'ouvert' })));
    await p.waitForTimeout(900);
    for (let k = 0; k < 120; k++) {
      const j = arene && arene.joueurs.get(String(adr).toLowerCase());
      if (j) {
        j.pv = 1;
        j.brulure = monde.EFFETS.brulure.duree;
        /* Bruler n est pas se reposer : la regeneration remonterait la vie
           entre deux versements et l on ne mourrait jamais. */
        j.repos = 0;
      }
      const combien = await p.evaluate(() => window.__s[0].__m.filter((m) => m.type === 'realmMort').length);
      if (combien > avant) break;
      await p.waitForTimeout(70);
    }
    await p.waitForTimeout(600);
    return p.evaluate(() => window.__s[0].__m.filter((m) => m.type === 'realmMort').pop() || null);
  };

  console.log('\n-- ce qui part vraiment sur le fil --');
  const bilan = await meurs();
  ok(!!bilan, 'le serveur a annonce la mort');
  ok(!!(bilan && bilan.sacDetail && bilan.sacDetail.length),
     `le bilan porte le detail du sac (${bilan && (bilan.sacDetail || []).length} ligne(s))`);
  eq(bilan && (bilan.oeufsPerdus || {})[OEUF], 1, 'et l oeuf, nommement');
  eq(bilan && (bilan.fiolesPerdues || {}).att, FIOLES.att, 'et les fioles du sac');
  eq(bilan && (bilan.supPerdu || {})[STAT_BUE], BUES, 'et les potions bues');
  ok(!!(bilan && bilan.perdus && bilan.perdus.length), 'et la piece portee, detruite');

  /* ================== L ECRAN ================== */
  const ecran = () => p.evaluate(() => {
    const v = document.getElementById('nxMortVoile');
    const d = v.querySelector('.nxmt-perdu');
    return {
      ouvert: v.classList.contains('on'),
      texte: d.textContent.replace(/\s+/g, ' ').trim(),
      lots: Array.from(d.querySelectorAll('.nxmt-lot')).map((l) => ({
        quoi: l.querySelector('i').textContent.trim().toLowerCase(),
        texte: l.querySelector('span').textContent.replace(/\s+/g, ' ').trim(),
        noms: Array.from(l.querySelectorAll('em')).map((e) => ({
          nom: e.textContent.trim(), couleur: e.style.color })),
        images: Array.from(l.querySelectorAll('img')).map((i) => i.getAttribute('src')),
      })),
    };
  });
  const e = await ecran();
  const lot = (k) => e.lots.filter((l) => l.quoi === k)[0] || null;

  console.log('\n-- l ecran nomme ce qu on a perdu --');
  ok(e.ouvert, 'le voile de fin est a l ecran');
  ok(!/Nothing was lost/i.test(e.texte),
     'il ne dit plus « You were carrying nothing. Nothing was lost. »');

  {
    /* L OEUF D ABORD : c est la chose la plus rare du jeu, et le seul moment
       ou le joueur apprend qu il l a perdue est cet ecran. */
    const l = lot('eggs');
    ok(!!l, 'une ligne parle des oeufs');
    ok(l && l.images.some((s) => s.indexOf(OEUF) >= 0),
       `avec le dessin de SON espece (${l && l.images.join(' ')})`);
    ok(l && l.noms.length === 1 && l.noms[0].nom.length > 3,
       `et un nom lisible, pas une cle (« ${l && l.noms[0] && l.noms[0].nom} »)`);
    eq(e.lots.indexOf(l), 0, 'et elle vient en premier — rien ne doit la noyer');
  }
  {
    const l = lot('destroyed');
    ok(!!l, 'une ligne parle de l equipement detruit');
    ok(l && l.texte.indexOf(ARME.nom) >= 0,
       `et elle NOMME l arme qu on portait (« ${l && l.texte} »)`);
    const c = l && l.noms.filter((x) => x.nom === ARME.nom)[0];
    eq(c && c.couleur, enRgb(boutique.rarete(ARME.rarete).couleur),
       `a la couleur de sa rarete (${ARME.rarete})`);
  }
  {
    const l = lot('backpack');
    ok(!!l, 'une ligne parle du sac');
    [PIECE_A, PIECE_B].forEach((o) => {
      const c = l && l.noms.filter((x) => x.nom === o.nom)[0];
      ok(!!c, `le sac nomme « ${o.nom} »`);
      /* LA COULEUR VIENT DU SERVEUR, comparee a ce que la boutique dit de
         cette rarete-la. Sur deux raretes differentes : une page qui peindrait
         tout en or passerait le premier point et raterait celui-ci. */
      eq(c && c.couleur, enRgb(boutique.rarete(o.rarete).couleur),
         `a la couleur de « ${o.rarete} »`);
    });
    ok(l && !/^\d+ items?$/.test(l.texte),
       `et ce n est plus un simple compte (« ${l && l.texte} »)`);
  }
  {
    const l = lot('vials');
    ok(!!l, 'une ligne parle des fioles du sac');
    Object.keys(FIOLES).forEach((s) => {
      ok(l && l.texte.toLowerCase().indexOf(s) >= 0,
         `elle nomme la stat « ${s.toUpperCase()} »`);
      ok(l && l.texte.indexOf(String(FIOLES[s])) >= 0,
         `et combien il y en avait (${FIOLES[s]})`);
    });
  }
  {
    /* Souvent la perte la plus lourde de la sortie, et la seule qu aucun
       coffre n aurait pu eviter. */
    const l = lot('potions drunk');
    ok(!!l, 'une ligne parle des potions bues');
    ok(l && l.texte.toLowerCase().indexOf(STAT_BUE) >= 0,
       `elle nomme la stat bue (« ${l && l.texte} »)`);
    ok(BUES < 2 || (l && l.texte.indexOf(String(BUES)) >= 0),
       `et combien on en avait bu (${BUES})`);
  }

  /* ================== ET LES MAINS VIDES ==================
   * SANS CE CONTROLE, TOUT LE RESTE PASSERAIT sur un ecran qui ne saurait
   * plus dire « rien ». La mort qu on vient de subir a tout emporte : on y
   * retourne aussitot, sans rien ramasser. */
  console.log('\n-- et quand on n avait vraiment rien --');
  await p.evaluate(() => {
    const b = document.querySelector('#nxMortVoile .nxmt-go');
    if (b) b.click();
  });
  await p.waitForTimeout(900);
  eq(moteur.sacRempli(adr), 0, 'le sac est vide, cote serveur');
  const bilan2 = await meurs();
  ok(!!bilan2, 'on remeurt');
  eq(Object.keys((bilan2 && bilan2.oeufsPerdus) || {}).length, 0, 'sans oeuf cette fois');
  eq(((bilan2 && bilan2.sacDetail) || []).length, 0, 'et le sac ne portait rien');
  const e2 = await ecran();
  eq(e2.lots.length, 0, 'l ecran n a aucune ligne de perte a montrer');
  ok(/Nothing was lost/i.test(e2.texte),
     `et il le dit toujours (« ${e2.texte} »)`);

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nmort_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
