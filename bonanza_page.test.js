/* SWOGE BONANZA, DE BOUT EN BOUT.
 *
 * Le serveur calcule TOUT — grille, cascades, tours gratuits, gains — et la
 * page ne fait que rejouer ce qu'il envoie. C'est le seul partage qui tienne
 * pour un jeu d'argent : un joueur qui ouvre la console voit le resultat plus
 * tot, il ne le change pas.
 *
 * Cet essai le verifie EN JOUANT, contre le vrai serveur :
 *   1. la page se charge, la grille de 30 cases existe ;
 *   2. on se connecte, le bareme arrive du serveur ;
 *   3. on mise et on tourne — le solde bouge REELLEMENT du bon montant ;
 *   4. ce que la page affiche correspond a ce que le serveur a paye.
 *
 * Le point 3 est celui qui compte : un jeu qui affiche un gain sans crediter,
 * ou qui debite deux fois, ne se voit pas a l'oeil.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('bonanza_page.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('bonanza_page.test.js : depot du serveur introuvable — essai saute'); process.exit(0);
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
process.on('unhandledRejection', (e) => {
  console.log('  RATE essai interrompu : ' + (e && e.message ? e.message : e));
  process.exit(1);
});

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync('/tmp/fiole-');
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  const { Game } = require(path.join(SERVEUR, 'game'));
  let moteur = null; const _p0 = Game.prototype._p;
  Game.prototype._p = function (a) { moteur = this; return _p0.call(this, a); };
  const { Realm } = require(path.join(SERVEUR, 'realm'));
  let monde0 = null; const pas0 = Realm.prototype.pas;
  Realm.prototype.pas = function (dt) { if (!this.plan) monde0 = this; return pas0.call(this, dt); };
  require(path.join(SERVEUR, 'server'));
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  const M = require(path.join(SERVEUR, 'monde'));
  const P = require(path.join(SERVEUR, 'personnages'));
  await new Promise((r) => setTimeout(r, 1400));
  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const w = ethers.Wallet.createRandom();
  const erreurs = [];

  const p = await nav.newPage({ viewport: { width: 420, height: 860 },
                                hasTouch: true, isMobile: true });
  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) {
      const s = (pr === undefined) ? new N(u) : new N(u, pr);
      s.__m = []; s.__out = [];
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      const env = s.send.bind(s);
      s.send = function (d) { try { s.__out.push(JSON.parse(d)); } catch (x) {} return env(d); };
      window.__s.push(s); return s;
    }
    C.prototype = N.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach((k) => { C[k] = N[k]; });
    window.WebSocket = C;
  });
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));

  await p.goto(`http://127.0.0.1:${site.port}/swoge_bonanza.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'hello')), { timeout: 30000 });
  const nonce = await p.evaluate(() => window.__s.find((s) => s.__m.some((m) => m.type === 'hello')).__m.find((m) => m.type === 'hello').loginNonce);
  const msg = 'SWOGE Pusher login\nnonce: ' + nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, s]) => window.__s.find((x) => x.__m.some((y) => y.type === 'hello')).send(JSON.stringify({ type: 'login', message: m, signature: s })), [msg, sig]);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'auth')), { timeout: 15000 });

  /* On credite le portefeuille d'essai. Le cadeau de bienvenue fait cent
     jetons ; l'achat du bonus coute 73 fois la mise, soit 7 300 au minimum
     de table. Sans ce credit, le seul controle qui coute de l'argent — le
     solde bouge-t-il du bon montant — serait saute a chaque passage.
     La PAGE ne le saura qu'au prochain message portant un solde : le tour
     joue plus bas s'en charge, et le bouton d'achat s'allume ensuite.
     `moteur` n'existe qu'a partir d'ici : il est capture au premier appel de
     `_p`, qui a lieu pendant l'authentification. */
  {
    const j = moteur._p(w.address);
    j.balance = j.balance.add(ethers.utils.parseEther('50000'));
  }
  await p.waitForTimeout(1000);
  await p.evaluate(() => window.__s[0].send(JSON.stringify({ type: 'realmJoin' })));
  await p.waitForTimeout(1600);
  const addr = w.address.toLowerCase();

  /* ================== 1. LA PAGE EST LA ================== */
  console.log('\n-- la page --');
  const grille = await p.$$eval('#bzGrille .bz-c', (e) => e.length);
  ok(grille === 30, `la grille porte 30 cases (${grille})`);
  ok(await p.$('#bzSpin') !== null, 'le bouton SPIN existe');

  /* ================== 2. LE BAREME VIENT DU SERVEUR ================== */
  console.log('\n-- le bareme --');
  const bar = await p.evaluate(() => {
    const m = window.__s.flatMap((s) => s.__m).find((x) => x.type === 'auth' && x.bonanzaBareme);
    return m ? m.bonanzaBareme : null;
  });
  ok(!!bar, 'le serveur envoie le bareme a la connexion');
  if (bar) {
    ok(bar.colonnes === 6 && bar.rangees === 5, `grille 6x5 (${bar.colonnes}x${bar.rangees})`);
    ok(bar.minAmas === 8, 'huit symboles identiques pour payer');
    ok(bar.symboles.length === 9, `neuf symboles payants (${bar.symboles.length})`);
  }

  /* ================== 3. ON JOUE POUR DE VRAI ================== */
  console.log('\n-- on mise et on tourne --');
  const q = moteur._p(w.address);
  /* On joue PAR L'INTERFACE : `BZ` vit dans une IIFE, il n'est pas accessible
     depuis l'essai — et c'est tant mieux, un jeu d'argent n'a rien a exposer.
     On regle donc la mise au cran puis on lance, comme un joueur. */
  const soldeAff = await p.evaluate(() => {
    const e = document.getElementById('bal') || document.querySelector('[id*=bal]');
    return e ? e.textContent.trim() : '';
  });
  console.log('     (solde affiche : ' + JSON.stringify(soldeAff) + ')');

  /* ---- LA MISE SE REGLE AU CRAN ----
     Le tapis de six pastilles a additionner est parti : moins, plus, MAX.
     On verifie d abord que la mise est POSEE des la connexion — avec un cran,
     une mise a zero donnerait une barre ou rien ne repond et un SPIN qui
     refuse, ce qui se lit comme une panne plutot que comme un ecran d accueil. */
  const miseDepart = await p.evaluate(() => {
    const e = document.getElementById('bzMise');
    return e && !e.hidden ? e.textContent : '';
  });
  ok(/Bet/.test(miseDepart),
     'une mise est deja posee a la connexion : ' + JSON.stringify(miseDepart));

  const avantPlus = await p.evaluate(() => document.getElementById('bzMise').textContent);
  await p.click('#bzPlus');
  const apresPlus = await p.evaluate(() => document.getElementById('bzMise').textContent);
  ok(apresPlus !== avantPlus,
     'un cran de plus change la mise : ' + JSON.stringify(avantPlus) + ' -> ' + JSON.stringify(apresPlus));
  await p.click('#bzMoins');
  const apresMoins = await p.evaluate(() => document.getElementById('bzMise').textContent);
  ok(apresMoins === avantPlus,
     'et un cran de moins la ramene exactement ou elle etait : ' + JSON.stringify(apresMoins));

  /* MAX prend le plus gros cran que le SOLDE permette, pas le plafond de la
     table : un bouton qui poserait une mise impayable mene a un refus. */
  await p.click('#bzMax');
  const miseTexte = await p.evaluate(() => {
    const e = document.getElementById('bzMise');
    return e && !e.hidden ? e.textContent : '';
  });
  ok(/Bet/.test(miseTexte), 'MAX pose la plus grosse mise jouable : ' + JSON.stringify(miseTexte));

  /* Le socle de reglage du son est en `position:fixed` sur tout le site : ici
     il tombait pile sur les boutons de mise et les recouvrait. */
  const sonPlace = await p.evaluate(() => {
    const d = document.getElementById('sndDock');
    if (!d) return { absent: true };
    const dans = !!(document.getElementById('bzSon') && document.getElementById('bzSon').contains(d));
    const pos = getComputedStyle(d).position;
    const r = d.getBoundingClientRect();
    const chevauche = (el) => {
      const b = el.getBoundingClientRect();
      return !(r.right < b.left || r.left > b.right || r.bottom < b.top || r.top > b.bottom);
    };
    return { dans, pos,
             surSpin: chevauche(document.getElementById('bzSpin')),
             surMoins: chevauche(document.getElementById('bzMoins')),
             surPlus: chevauche(document.getElementById('bzPlus')) };
  });
  ok(!sonPlace.absent && sonPlace.dans && sonPlace.pos !== 'fixed',
     'le reglage du son est DANS la barre du jeu, plus en flottant (position: '
     + sonPlace.pos + ')');
  ok(!sonPlace.surSpin && !sonPlace.surMoins && !sonPlace.surPlus,
     'et il ne recouvre ni SPIN ni les boutons de mise — c est exactement ce'
     + ' qu il faisait quand il etait fixe en bas a gauche');

  /* Ce que la page AFFICHE avant de lancer : le serveur devra retenir
     exactement ca, et pas un chiffre a lui. */
  const miseEnvoyee = await p.evaluate(() => {
    const m = /Bet\s+([\d.]+)(k|M)?/.exec(document.getElementById('bzMise').textContent || '');
    if (!m) return null;
    return Math.round(parseFloat(m[1]) * (m[2] === 'M' ? 1e6 : m[2] === 'k' ? 1e3 : 1));
  });
  const soldeAvant = q.balance.toString();

  /* ---- LES ROULEAUX TOURNENT-ILS VRAIMENT ? ----
   * On observe la grille pendant le tour : on veut voir des cases porter la
   * classe `tourne`, et surtout voir les IMAGES CHANGER. Sans le second
   * controle, une animation qui aurait perdu son minuteur passerait au vert :
   * les cases seraient marquees « en rotation » et parfaitement immobiles. */
  const observe = p.evaluate(() => new Promise((res) => {
    const g = document.getElementById('bzGrille');
    let tourne = 0, poses = 0;
    const vues = new Set();
    const t = setInterval(() => {
      if (g.querySelector('.bz-c.tourne')) tourne++;
      if (g.querySelector('.bz-c.pose')) poses++;
      const im = g.children[0].firstChild;
      if (im && im.getAttribute('src')) vues.add(im.getAttribute('src'));
    }, 40);
    setTimeout(() => { clearInterval(t); res({ tourne, poses, symbolesVus: vues.size }); }, 2600);
  }));
  await p.click('#bzSpin');
  const rou = await observe;
  ok(rou.tourne > 0, `des colonnes tournent pendant le tour (${rou.tourne} releves)`);
  ok(rou.symbolesVus > 2,
     `la premiere case change vraiment de symbole pendant la rotation (${rou.symbolesVus} symboles vus)`);
  ok(rou.poses > 0, `les colonnes se posent en fin de rotation (${rou.poses} releves)`);
  await p.waitForFunction(() => window.__s.some((s) => s.__m.some((m) => m.type === 'bonanza')),
                          { timeout: 20000 }).catch(() => {});
  const rep = await p.evaluate(() => {
    const m = window.__s.flatMap((s) => s.__m).filter((x) => x.type === 'bonanza').pop();
    const err = window.__s.flatMap((s) => s.__m).filter((x) => x.type === 'error').pop();
    if (!m) return err ? { erreur: err.error } : null;
    return { mise: m.tour.mise, payout: m.tour.payout, net: m.tour.net, multi: m.tour.multi,
             scatters: m.tour.scatters, gratuits: m.tour.toursGratuits,
             etapes: m.tour.base.etapes.length,
             premiere: m.tour.base.etapes[0] ? m.tour.base.etapes[0].grille.length : -1 };
  });
  if (rep && rep.erreur) console.log('     (le serveur refuse : ' + rep.erreur + ')');
  ok(!!rep, 'le serveur repond au spin');
  if (rep) {
    ok(rep.mise === miseEnvoyee, `la mise retenue est bien celle affichee (${rep.mise})`);
    ok(rep.premiere === 30, `la grille envoyee fait 30 cases (${rep.premiere})`);
    ok(rep.etapes >= 1, `au moins une etape de cascade (${rep.etapes})`);
    ok(rep.net === rep.payout - rep.mise, 'le net est coherent avec le gain et la mise');

    /* LE CONTROLE QUI COMPTE : le solde du serveur a bouge EXACTEMENT du net. */
    const ethers2 = require(path.join(SERVEUR, 'node_modules', 'ethers'));
    const apres = moteur._p(w.address).balance;
    const attendu = ethers2.BigNumber.from(soldeAvant)
      .sub(ethers2.utils.parseEther(String(rep.mise)))
      .add(ethers2.utils.parseEther(String(rep.payout)));
    ok(apres.eq(attendu),
       `le solde a bouge du bon montant (mise ${rep.mise}, gain ${rep.payout}, net ${rep.net})`);
  }

  /* ================== 4. LA PAGE RACONTE LA MEME CHOSE ================== */
  console.log('\n-- la page affiche ce qui a ete paye --');
  /* On attend que la page ait FINI de raconter le tour : c'est seulement
     alors qu'elle ecrit le net paye et la ligne d'historique. Un gros tour
     gratuit — dix tours de trois etages — dure une bonne trentaine de
     secondes ; l'attente etait a soixante et un tour a 158x l'a depassee.
     L'essai accusait alors la page de ne rien afficher. */
  await p.waitForFunction(() => {
    const b = document.getElementById('bzSpin');
    return b && !b.disabled;
  }, { timeout: 180000 }).catch(() => {});
  const aff = await p.evaluate(() => {
    document.getElementById('bzHistBtn').click();
    return { gain: (document.getElementById('bzGain').textContent || '').trim(),
             hist: (document.getElementById('bzHist').textContent || '').trim() };
  });
  ok(aff.gain.length > 0, 'un resultat est affiche : ' + JSON.stringify(aff.gain));
  ok(/→/.test(aff.hist), 'le tour est entre dans l historique : ' + JSON.stringify(aff.hist.slice(0, 60)));
  if (rep && !rep.erreur) {
    const signe = rep.net > 0 ? '+' : '';
    ok(aff.gain.indexOf(signe) === 0 || rep.net === 0,
       'le signe affiche correspond au net du serveur (' + rep.net + ')');
  }

  /* ================== 5. L'ACHAT DU BONUS ==================
   * Le bouton le plus cher de la page. Deux choses doivent etre vraies, et
   * la seconde est celle qui coute de l'argent si elle ne l'est pas :
   *   - le prix affiche vient du SERVEUR, pas d'un chiffre recopie ;
   *   - le solde bouge exactement du cout, puis du gain. */
  console.log('\n-- l achat du bonus --');

  const achat = await p.evaluate(() => {
    const e = document.getElementById('bzAchat');
    const b = e ? e.querySelector('b') : null;
    return e ? { cache: e.hidden, prix: b ? b.textContent : null,
                 eteint: e.disabled, titre: e.title } : null;
  });
  ok(!!achat, 'le bouton d achat existe');
  if (achat) {
    ok(/×\s*your bet/.test(achat.titre || ''),
       'il annonce le prix en multiples de la mise : ' + JSON.stringify(achat.titre));
    /* Le prix vient du bareme envoye a la connexion, pas de la page. */
    const prixServeur = await p.evaluate(() => {
      const m = window.__s.flatMap((x) => x.__m).filter((x) => x.type === 'auth').pop();
      return m && m.bonanzaBareme ? m.bonanzaBareme.prixBonus : null;
    });
    ok(prixServeur > 0,
       'et ce prix arrive du SERVEUR (' + prixServeur + '× la mise) — la page ne le calcule pas');

    /* On achete pour de vrai, avec la plus petite mise possible. */
    const soldeAvantAchat = moteur._p(w.address).balance.toString();
    const miseAchat = await p.evaluate(() => {
      const m = /Bet\s+([\d.]+)(k|M)?/.exec(document.getElementById('bzMise').textContent || '');
      return m ? Math.round(parseFloat(m[1]) * (m[2] === 'M' ? 1e6 : m[2] === 'k' ? 1e3 : 1)) : null;
    });
    const assezRiche = await p.evaluate(() => !document.getElementById('bzAchat').disabled);
    if (assezRiche) {
      await p.click('#bzAchat');
      await p.waitForFunction(() => window.__s.some((s2) => s2.__m.some(
        (m) => m.type === 'bonanza' && m.tour && m.tour.achat)), { timeout: 30000 }).catch(() => {});
      const r2 = await p.evaluate(() => {
        const m = window.__s.flatMap((x) => x.__m).filter((x) => x.type === 'bonanza' && x.tour.achat).pop();
        return m ? { cout: m.tour.cout, payout: m.tour.payout, mise: m.tour.mise,
                     tours: m.tour.toursGratuits } : null;
      });
      ok(!!r2, 'le serveur repond a l achat');
      if (r2) {
        ok(r2.cout === r2.mise * prixServeur,
           'le cout retenu est bien le prix fois la mise (' + r2.cout + ' = '
           + r2.mise + ' × ' + prixServeur + ')');
        ok(r2.tours > 0, 'et l achat donne bien des tours gratuits (' + r2.tours + ')');
        const ethers3 = require(path.join(SERVEUR, 'node_modules', 'ethers'));
        const attendu2 = ethers3.BigNumber.from(soldeAvantAchat)
          .sub(ethers3.utils.parseEther(String(r2.cout)))
          .add(ethers3.utils.parseEther(String(r2.payout)));
        ok(moteur._p(w.address).balance.eq(attendu2),
           'et le solde a bouge du COUT puis du gain (cout ' + r2.cout
           + ', gain ' + r2.payout + ')');
      }
    } else {
      console.log('     (solde trop court pour acheter — achat non joue)');
    }
  }

  ok(erreurs.length === 0, 'aucune erreur JS' + (erreurs.length ? ' : ' + erreurs[0] : ''));
  console.log('\n' + n + ' verifications, ' + rates + ' echec(s)');
  await nav.close(); site.stop();
  process.exit(rates ? 1 : 0);
})();
