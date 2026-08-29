'use strict';
/*
 * CE QUE LE JOUEUR LIT PENDANT UN BONUS.
 *
 * Cet essai ne lit pas le code : il JOUE un vrai bonus. Le faux serveur
 * fait tourner le moteur du depot (`dod.js`) sur une graine choisie pour
 * ouvrir les tours gratuits, puis on releve dix fois par seconde ce qui est
 * ECRIT a l'ecran. Les sept defauts ci-dessous ont ete trouves comme ca —
 * aucun ne se voyait a la lecture.
 *
 *  1. Le panneau annoncait le nombre de tours PEINT DANS L'IMAGE : « 10 FREE
 *     SPINS » la ou le moteur en donne 12, « 15 » la ou il en donne 18. Le
 *     vrai nombre arrivait deja dans `ddVoileGratuits` et n'etait pas
 *     utilise.
 *  2. Le gain d'un tour restait affiche pendant les tours suivants qui ne
 *     payaient RIEN. Sur la serie `deader` mesuree, onze tours sur dix-huit
 *     ne paient pas : « WIN +1 $SWOGE » tenait l'ecran trois secondes.
 *  3. « WIN +0 $SWOGE » s'affichait pour de bon.
 *  4. Aucun total courant : douze tours defilaient sans que le joueur sache
 *     ce qu'il avait gagne depuis le debut.
 *  5. Aucun rang : ni « 4 / 12 », rien.
 *  6. Le montant se calculait sur la mise AFFICHEE et non sur celle du tour
 *     envoye par le serveur.
 *  7. Les montants passaient par `ddFmt`, qui rend « 1.1k » pour 1 080.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
const SERVEUR = '/home/user/swoge-pusher-server.github.io';
let chromium = null, WSS = null, dod = null;
try { chromium = require('playwright').chromium; } catch (e) {}
try { WSS = require(SERVEUR + '/node_modules/ws').WebSocketServer; } catch (e) {}
try { dod = require(SERVEUR + '/dod.js'); } catch (e) {}
if (!chromium || !WSS || !dod) {
  console.log('dod_bonus.test.js : playwright, ws ou le moteur manquent — essai saute');
  process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp',
            '.png':'image/png', '.mp3':'audio/mpeg', '.ogg':'audio/ogg' };
const MISE = 100;

const BAREME = { rouleaux: dod.ROULEAUX, rangees: dod.RANGEES, bas: dod.BAS, hauts: dod.HAUTS,
  wild: dod.WILD, dead: dod.DEAD, deader: dod.DEADER, rouleauxWild: dod.ROULEAUX_WILD,
  bareme: dod.BAREME, taillesWild: dod.TAILLES_WILD, scattersPourTours: dod.SCATTERS_POUR_TOURS,
  tours: dod.TOURS, gainMax: dod.GAIN_MAX, crans: dod.CRANS, cransOrdre: dod.CRANS_ORDRE,
  min: 10, max: 100000 };

/* On CHERCHE les graines plutot que de les ecrire : un nonce fige serait faux
   le jour ou les poids du moteur bougent, et l'essai testerait un tour
   ordinaire en croyant tester un bonus. */
function graine(mode, avecTourSec) {
  for (let i = 1; i < 60000; i++) {
    const r = dod.joue({ serverSeed: 's', clientSeed: 'c:dod', nonce: i, mise: MISE });
    if (r.mode !== mode) continue;
    if (avecTourSec && !r.gratuits.tours.some((t) => !t.gain)) continue;
    return { nonce: i, tour: r };
  }
  return null;
}

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;
  const nav = await chromium.launch();

  for (const mode of ['dead', 'deader']) {
    const g = graine(mode, true);
    console.log('\n-- ' + mode.toUpperCase() + ' --');
    if (!g) { ok(false, 'une graine ouvrant ' + mode + ' avec au moins un tour a zero'); continue; }
    const attenduTours = dod.TOURS[mode];
    ok(g.tour.toursGratuits === attenduTours,
       `le moteur donne ${g.tour.toursGratuits} tours (${attenduTours} attendus)`);

    const faux = new WSS({ port: 0 });
    await new Promise((r) => faux.on('listening', r));
    faux.on('connection', (c) => {
      c.send(JSON.stringify({ type: 'hello', loginNonce: 'n', serverSeedHash: 'h' }));
      setTimeout(() => c.send(JSON.stringify({ type: 'auth', address: 'e', balance: 1e9,
        casinoMin: 10, casinoMax: 100000, dodBareme: BAREME })), 50);
      c.on('message', (d) => {
        let m; try { m = JSON.parse(d); } catch (e) { return; }
        if (m.type === 'dodSpin') c.send(JSON.stringify({ type: 'dod', tour: g.tour,
          balance: '1000000000', fairness: { serverSeedHash: 'h', nonce: 1 } }));
      });
    });

    const p = await nav.newPage({ viewport: { width: 1400, height: 1000 } });
    const boum = [];
    p.on('pageerror', (e) => boum.push(e.message));
    await p.goto('http://127.0.0.1:' + port + '/swoge_dod.html?server='
                 + encodeURIComponent('ws://127.0.0.1:' + faux.address().port),
                 { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2400);
    /* La mise de la PAGE reste a 10 alors que le tour est joue a 100 : c'est
       exactement la situation qui revelait le defaut n°6. */
    await p.click('#ddSpin');

    const vu = [];
    for (let i = 0; i < 400; i++) {
      vu.push(await p.evaluate(() => {
        const g2 = document.getElementById('ddGain');
        const b = document.getElementById('ddBandeau');
        /* L'element peut ne pas exister du tout — c'etait le cas avant le
           correctif. On le CONSTATE, on ne s'effondre pas dessus : un essai
           qui plante ne dit pas ce qui ne va pas. */
        const eu = b ? b.querySelector('u') : null;
        const u = (b && !b.hidden && eu) ? (eu.textContent || '') : '';
        return { gain: (g2.textContent || '').trim(), panneau: u.trim() };
      }));
      await p.waitForTimeout(60);
      if (i > 30 && !(await p.evaluate(() => document.getElementById('ddSpin').disabled))) break;
    }
    await p.close();
    faux.close();

    const textes = vu.map((v) => v.gain);
    const panneaux = vu.map((v) => v.panneau).filter(Boolean);

    ok(panneaux.some((t) => t === attenduTours + ' FREE SPINS'),
       `le panneau annonce ${attenduTours} tours, le VRAI nombre — l image en peint `
       + (mode === 'dead' ? '10' : '15') + (panneaux.length ? ' (lu : ' + panneaux[0] + ')' : ' (rien lu)'));

    ok(textes.some((t) => /FREE SPINS · 1 \/ /.test(t)) && textes.some((t) => new RegExp('· ' + attenduTours + ' / ' + attenduTours).test(t)),
       'le rang du tour est ecrit, du premier au dernier');

    /* Le total ne redescend jamais et finit sur le gain total du bonus. */
    const totaux = textes.map((t) => { const m = /\+([\d,]+) \$SWOGE/.exec(t); return m ? Number(m[1].replace(/,/g, '')) : null; })
                         .filter((x) => x !== null);
    ok(totaux.length > 0 && totaux.every((x, i) => i === 0 || x >= totaux[i - 1]),
       'le total courant ne redescend jamais (' + (totaux.length ? totaux[0] + ' → ' + totaux[totaux.length - 1] : 'aucun') + ')');

    const attenduTotal = Math.round(g.tour.gratuits.total * MISE);
    ok(totaux.includes(attenduTotal),
       `et il atteint le gain reel des tours gratuits : ${attenduTotal} $SWOGE`
       + ' — calcule sur la mise DU TOUR (100), pas sur celle affichee par la page (10)');

    ok(!textes.some((t) => /\+0 \$SWOGE/.test(t)),
       'aucun « +0 $SWOGE » n est annonce');

    ok(!textes.some((t) => /\d\.\dk|\d\.\d\dM/.test(t)),
       'aucun montant abrege : « 1.1k » vaut vingt $SWOGE de plus que 1 080');

    ok(boum.length === 0, 'aucune exception pendant le bonus' + (boum.length ? ' : ' + boum[0] : ''));
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
