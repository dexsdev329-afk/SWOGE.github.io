/* LE RAYON DES PERSONNAGES, DANS LE NEXUS — LA MEME VITRINE QUE LE HALL.
 *
 * Le tiroir du hall (skins_page.test.js) lit deja `monnaie`, `edition` et
 * `reste`. Le rayon du Nexus, non : il ecrivait « $SWOGE » en dur et grisait
 * son bouton avec le solde en JETONS. Deux vitrines pour le meme catalogue,
 * et une seule qui disait la verite.
 *
 * Ce que ca coute, en clair :
 *
 * 1. L UNITE VIENT DE `monnaie`, JAMAIS DU MONTANT. « 20,000 » se lit
 *    exactement pareil en or et en jetons. Un joueur qui lit « $SWOGE » sur
 *    un prix en or va deposer de l argent reel pour un achat qui n en demande
 *    pas. Un temoin en jetons est verifie dans le MEME ecran : sans lui, un
 *    essai qui cherche « GOLD » passerait aussi si tout affichait GOLD.
 * 2. CE QU IL RESTE SE LIT SANS SOUSTRACTION, et une edition sans limite n a
 *    aucune pastille a montrer.
 * 3. UNE EDITION EPUISEE NE PROPOSE PLUS D ACHETER — mais celui qui la
 *    possede deja peut TOUJOURS la porter. Le controle passe apres « wear ».
 * 4. ON AFFICHE L OR QU ON A SOUS UN PRIX EN OR, ON NE GRISE PAS LE BOUTON
 *    AVEC. Un joueur riche en or et pauvre en jetons doit pouvoir cliquer sur
 *    ce qu il peut s offrir ; le serveur reste seul a dire non.
 * 5. ET L ACHAT EN OR NE TOUCHE PAS AU SOLDE EN JETONS.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('nexus_skins_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('nexus_skins_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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

/* Deux editions POSEES PAR L ESSAI, jamais une du catalogue du jour : ce qui
   est verifie ici est le mecanisme, et une edition retiree demain ferait
   tomber un essai qui ne parle pas d elle. `skins` ne connait ni port ni
   configuration — le charger maintenant ne fige rien. */
const skins = require(path.join(SERVEUR, 'skins'));
const ACHETABLE = 'brett', PRIX_OR = 20000, COMBIEN = 2;
const EPUISEE = 'landwolf', PRIX_EPUISEE = 5000;
skins.EDITIONS[ACHETABLE] = { exemplaires: COMBIEN, prix: PRIX_OR, monnaie: 'or' };
skins.EDITIONS[EPUISEE] = { exemplaires: 1, prix: PRIX_EPUISEE, monnaie: 'or' };
/* Un temoin en JETONS, dans le meme ecran. */
const TEMOIN = 'pepe';
/* Et l or du compte : LARGEMENT de quoi payer l edition, pendant que le solde
   en jetons ne suffit meme pas au moins cher du bareme. C est exactement la
   situation ou l ancien rayon grisait un bouton que le joueur pouvait payer. */
const OR = PRIX_OR + 3000;
const JETONS = 100;

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/nxskins-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  /* `config.js` du serveur GELE l environnement a son premier `require` : tout
     module du serveur charge avant cette ligne ferait partir le serveur sur le
     port du depot, et l essai expirerait sans rien dire d utile. */
  process.env.PORT = String(port);
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
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });
  await p.waitForTimeout(1200);

  const q = moteur._p(w.address);
  q.hasDeposited = true;
  q.balance = WEI(JETONS);
  q.fame = OR;
  q.skins = { andy: true }; q.skinActif = 'andy';
  /* L autre edition est deja partie — son unique exemplaire. */
  moteur.skinsEmis = moteur.skinsEmis || {};
  moteur.skinsEmis[EPUISEE] = 1;

  /* ---- ON VA A L ETAL EN MARCHANT ----
   * Poser `on` sur le voile a la main afficherait la carte sans que la page se
   * croie ouverte : elle ne la repeindrait a aucun message, et l essai
   * mesurerait un ecran fige. On vise l etal la ou il est DESSINE. */
  await p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionEtal) return;
    C.__espionEtal = true;
    window.__moi = null; window.__etal = null;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const a = arguments;
      const u = (im && (im.currentSrc || im.src)) || '';
      if (u.indexOf('obj_market_stall') >= 0) {
        /* LES ARGUMENTS DE DESTINATION, pas ceux de la source. L etal est un
           decor anime : il se dessine en neuf arguments, dont les quatre
           premiers decoupent la PLANCHE. Les lire comme une position donne un
           point qui n existe nulle part sur la carte, et l on marche alors
           vers l etal par accident — il se trouve a l ouest, et une boucle qui
           part toujours a gauche finit par tomber dessus. C est cette panne-la
           qui se lit comme une intermittence.
           On vise le CENTRE DU LIEU, pas le pied du dessin : la page mesure la
           distance depuis `y - haut * 0.15`, soit cinquante pixels plus haut
           que le bas de l image sur un etal de trois cent cinquante. */
        const neuf = a.length >= 9;
        const dx = neuf ? a[5] : a[1], dy = neuf ? a[6] : a[2];
        const dw = neuf ? a[7] : a[3], dh = neuf ? a[8] : a[4];
        if (dw) window.__etal = { x: dx + dw / 2, y: dy + dh * 0.85 };
      }
      if (a.length >= 9 && a[3] === 256 && a[4] === 256 && a[7] === 150 && a[8] === 150) {
        window.__moi = { x: Math.round(a[5] + 75), y: Math.round(a[6] + 130) };
      }
      return di.apply(this, a);
    };
  });
  const marche = async (touche, ms) => {
    await p.keyboard.down(touche);
    await p.waitForTimeout(ms);
    await p.keyboard.up(touche);
    await p.waitForTimeout(200);
  };
  const etatShop = () => p.evaluate(() => ({
    on: document.getElementById('nxShopVoile').classList.contains('on'),
    moi: window.__moi, etal: window.__etal,
  }));
  const ouvreLeRayon = async () => {
    for (let k = 0; k < 70; k++) {
      const v = await etatShop();
      if (v.on) break;
      if (!v.moi || !v.etal) { await marche('ArrowLeft', 200); continue; }
      const ex = v.etal.x - v.moi.x, ey = v.etal.y - v.moi.y;
      const loin = Math.max(Math.abs(ex), Math.abs(ey));
      /* L etal demande de RESTER DESSUS pres d une demi-seconde : on relache
         et on attend, sinon on le traverse sans jamais l ouvrir. Le seuil est
         serre — a soixante-dix pixels du pied de l etal on est encore hors du
         lieu, on attend pour rien, et l essai declare une panne la ou il n y a
         qu une marche inachevee. */
      if (loin < 26) { await p.waitForTimeout(500); continue; }
      /* Le pas se raccourcit avec la distance : un pas de 350 ms depasse la
         cible de plusieurs dizaines de pixels et l on repart dans l autre
         sens indefiniment. */
      const pas = loin > 200 ? 300 : loin > 90 ? 140 : 70;
      if (Math.abs(ex) > Math.abs(ey)) await marche(ex > 0 ? 'ArrowRight' : 'ArrowLeft', pas);
      else await marche(ey > 0 ? 'ArrowDown' : 'ArrowUp', pas);
    }
    const v = await etatShop();
    if (!v.on) { console.log('   la boutique ne s est pas ouverte : ' + JSON.stringify(v)); return false; }
    return await ongletPersonnages();
  };
  /* L onglet des personnages REDEMANDE le catalogue au serveur (`skins`) :
     c est ce qui rend les relectures d apres-achat honnetes. */
  const ongletPersonnages = async () => {
    const trouve = await p.evaluate(() => {
      const b = document.querySelector('#nxShopVoile .nxsh-ong button[data-s="skin"]');
      if (!b) return false;
      b.click(); return true;
    });
    await p.waitForTimeout(900);
    return trouve;
  };

  /* La ligne d UN personnage, telle qu elle est A L ECRAN. */
  const ligne = (id) => p.evaluate((k) => {
    const b = document.querySelector('#nxShopVoile .nxsh-cof[data-skin="' + k + '"]');
    if (!b) return null;
    return { quoi: b.getAttribute('data-a'),
             grise: !!b.disabled,
             prix: b.querySelector('.p').textContent.trim(),
             pastille: b.querySelector('.nxsh-ed') ? b.querySelector('.nxsh-ed').textContent.trim() : null,
             avoir: b.querySelector('.nxsh-avoir') ? b.querySelector('.nxsh-avoir').textContent.trim() : null };
  }, id);
  const nbrs = (x) => Math.round(x).toLocaleString('en-US');

  const entre = await ouvreLeRayon();
  ok(entre, 'on a marche jusqu a l etal et le rayon des personnages est ouvert');

  /* ================== 1. VINGT MILLE QUOI ================== */
  console.log('\n-- l unite vient du serveur, pas du montant --');
  {
    const c = await ligne(ACHETABLE);
    ok(!!c, 'la ligne de l edition est a l ecran');
    ok(/GOLD/.test(c.prix), `son prix parle d or (${c.prix})`);
    ok(!/SWOGE/.test(c.prix), 'et surtout pas de $SWOGE');
    /* Le montant vient du SERVEUR, jamais d un nombre recopie ici : c est
       celui qui sera debite. */
    ok(c.prix.indexOf(nbrs(skins.prixDe(ACHETABLE))) >= 0,
       `avec le montant tel qu il sera debite (${nbrs(skins.prixDe(ACHETABLE))})`);
    const t = await ligne(TEMOIN);
    ok(/SWOGE/.test(t.prix), `le skin du bareme reste en jetons (${t.prix})`);
    ok(!/GOLD/.test(t.prix), 'le libelle « GOLD » ne s est pas repandu partout');
    ok(t.prix.indexOf(nbrs(skins.prixDe(TEMOIN))) >= 0,
       `et son prix est celui du bareme (${nbrs(skins.prixDe(TEMOIN))})`);
  }

  /* ================== 2. CE QU IL RESTE ================== */
  console.log('\n-- ce qu il reste, sans soustraction --');
  {
    const c = await ligne(ACHETABLE);
    eq(c.pastille, skins.editionDe(ACHETABLE) + ' left',
       'la pastille donne le reste, pas le vendu');
    const t = await ligne(TEMOIN);
    eq(t.pastille, null, 'un skin sans edition n a aucune pastille a montrer');
    eq(skins.editionDe(TEMOIN), 0, 'et le serveur confirme qu il n a pas d edition');
  }

  /* ================== 3. L OR QU ON A, SOUS UN PRIX EN OR ================== */
  console.log('\n-- on affiche l or, on ne grise pas avec --');
  {
    const c = await ligne(ACHETABLE);
    /* Le chiffre vient du COMPTE, pas d une constante de l essai. */
    ok(c.avoir && c.avoir.indexOf(nbrs(Math.floor(moteur._p(w.address).fame))) >= 0,
       `la ligne rappelle l or du compte (${c.avoir})`);
    eq(c.grise, false,
       'et le bouton reste cliquable — le solde en jetons ne suffit pourtant pas');
    /* SANS CE CONTROLE, LE PRECEDENT NE PROUVE RIEN : il faut que le solde en
       jetons soit VRAIMENT trop court, sinon « pas grise » va de soi. */
    ok(JETONS < skins.prixDe(ACHETABLE),
       `le compte n a que ${nbrs(JETONS)} jetons pour un prix de ${nbrs(skins.prixDe(ACHETABLE))}`);
    const t = await ligne(TEMOIN);
    eq(t.avoir, null, 'aucun rappel d or sous un prix en jetons — il n y sert a rien');
    eq(t.grise, true, 'et celui-la, paye en jetons, est bien grise faute de solde');
  }

  /* ================== 4. UNE EDITION DEJA PARTIE ================== */
  console.log('\n-- celle dont il ne reste rien --');
  {
    const c = await ligne(EPUISEE);
    eq(c.pastille, 'GONE', 'sa pastille le dit');
    ok(/SOLD OUT/.test(c.prix), `et le prix laisse place a la mention (${c.prix})`);
    eq(c.quoi, 'fini', 'la ligne ne propose plus d acheter');
    eq(c.grise, true, 'et elle ne se clique pas');
  }

  /* ================== 5. ON PAIE, ET C EST L OR QUI PART ================== */
  console.log('\n-- on paie, en or --');
  {
    const soldeAvant = moteur.balanceStr(w.address);
    const orAvant = moteur._p(w.address).fame;
    await p.evaluate((k) => {
      document.querySelector('#nxShopVoile .nxsh-cof[data-skin="' + k + '"]').click();
    }, ACHETABLE);
    await p.waitForTimeout(1300);
    eq(moteur.possedeSkin(moteur._p(w.address), ACHETABLE), true, 'le skin est au joueur');
    eq(moteur._p(w.address).fame, orAvant - skins.prixDe(ACHETABLE),
       'l or a paye, exactement le prix affiche');
    eq(moteur.balanceStr(w.address), soldeAvant, 'le solde en jetons n a pas bouge');
    eq((moteur.skinsEmis || {})[ACHETABLE] | 0, 1, 'un exemplaire est parti');
    await ongletPersonnages();
    const c = await ligne(ACHETABLE);
    eq(c.pastille, (skins.editionDe(ACHETABLE) - 1) + ' left',
       'et l ecran le montre tout de suite');
  }

  /* ================== 6. EPUISEE NE VEUT PAS DIRE PERDUE ================== */
  console.log('\n-- le dernier exemplaire part, le proprietaire garde le sien --');
  {
    /* Le dernier exemplaire part chez quelqu un d autre, et le joueur porte
       autre chose : c est exactement la situation ou un « SOLD OUT » pose a
       la place de son bouton lui ferait croire qu il a perdu son skin. */
    moteur.skinsEmis[ACHETABLE] = skins.editionDe(ACHETABLE);
    moteur.choisitSkin(w.address, 'andy');
    await ongletPersonnages();
    const c = await ligne(ACHETABLE);
    eq(c.pastille, 'GONE', 'la pastille dit bien qu il n en reste plus');
    eq(c.quoi, 'porter', 'mais son proprietaire garde le geste de le porter');
    eq(c.grise, false, 'et sa ligne se clique');
    ok(/wear/i.test(c.prix), `elle le lui remet (${c.prix})`);
    /* Et celui qu on PORTE se distingue enfin des cinq autres : le bouton
       posait une SECONDE balise `class`, que le navigateur ignore. */
    const porte = await p.evaluate(() => {
      const b = document.querySelector('#nxShopVoile .nxsh-cof.on');
      return b ? b.getAttribute('data-skin') : null;
    });
    eq(porte, 'andy', 'le personnage porte est marque dans le rayon');
  }

  ok(erreurs.length === 0, 'aucune erreur de page' +
     (erreurs.length ? ' — ' + erreurs.slice(0, 3).join(' | ') : ''));

  await nav.close();
  site.stop();
  console.log(`\nnexus_skins_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
