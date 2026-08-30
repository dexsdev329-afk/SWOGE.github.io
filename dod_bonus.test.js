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
  croissance: dod.CROISSANCE, plafondRouleau: dod.PLAFOND_ROULEAU,
  deuxScattersWild: dod.DEUX_SCATTERS_WILD, surclasseTours: dod.SURCLASSE_TOURS,
  min: 10, max: 100000 };

/* On CHERCHE les graines plutot que de les ecrire : un nonce fige serait faux
   le jour ou les poids du moteur bougent, et l'essai testerait un tour
   ordinaire en croyant tester un bonus. */
function graine(mode, avecTourSec, surclasse) {
  for (let i = 1; i < 200000; i++) {
    const r = dod.joue({ serverSeed: 's', clientSeed: 'c:dod', nonce: i, mise: MISE });
    if (r.mode !== mode) continue;
    if (avecTourSec && !r.gratuits.tours.some((t) => !t.gain)) continue;
    /* `surclasse` : true exige une serie qui passe en Deader en cours de
       route, false en exige une qui n'y passe pas. Sans ce filtre l'essai
       tirait au hasard l'une ou l'autre et son attente sur le nombre de
       tours tombait juste une fois sur deux. */
    if (surclasse === true && !r.gratuits.surclasse) continue;
    if (surclasse === false && r.gratuits.surclasse) continue;
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
    /* Pas de surclassement ici : ce bloc verifie le decompte NOMINAL, et une
       serie qui gagne deux tours en cours de route le ferait echouer sans
       qu'aucun defaut d'affichage existe. Le surclassement a son propre
       bloc, plus bas. */
    const g = graine(mode, true, false);
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
    let tropGrand = false, taille = '';
    for (let i = 0; i < 400; i++) {
      /* La classe qui rend le panneau vertical voyageait par `classList.add`
         et se faisait effacer deux lignes plus bas par une affectation de
         `className`. Rien ne levait : le panneau debordait simplement de
         l'ecran. On mesure donc ce qu'il OCCUPE. */
      const m = await p.evaluate(() => {
        const b = document.getElementById('ddBandeau');
        const z = document.querySelector('.dd-zone');
        if (!b || b.hidden || !z) return null;
        /* Seulement quand il est VU : la premiere image du cycle d'entree le
           trouve encore transparent et pas encore mis en page, et une largeur
           nulle a cet instant-la ne veut rien dire. */
        if (parseFloat(getComputedStyle(b).opacity) < 0.5) return null;
        const r = b.getBoundingClientRect(), zr = z.getBoundingClientRect();
        return { h: Math.round(r.height), w: Math.round(r.width), zh: Math.round(zr.height) };
      });
      if (m && m.h > 0) {
        if (!taille) taille = m.w + 'x' + m.h + ' dans un plateau de ' + m.zh;
        if (m.h > m.zh * 1.05 || m.w <= 0) tropGrand = true;
      }
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

    /* Le nombre et les mots viennent de deux elements : on NORMALISE plutot
       que de comparer une chaine exacte, sinon l'essai casse a la premiere
       retouche de mise en page sans qu'aucun defaut soit apparu. */
    const lu = panneaux.map((t) => t.replace(/\s+/g, ' ').replace(/(\d)([A-Z])/, '$1 $2').trim());
    ok(lu.some((t) => t === attenduTours + ' FREE SPINS'),
       `la banderole du panneau annonce ${attenduTours} tours, le nombre du SERVEUR`
       + ' — les premiers panneaux le portaient peint dans l image, 10 et 15,'
       + ' la ou le moteur en donne 12 et 18'
       + (lu.length ? ' (lu : ' + lu[0] + ')' : ' (rien lu)'));

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
    ok(!tropGrand,
       'et le panneau tient dans le plateau : ' + (taille || 'non mesure')
       + ' — vertical (491x1450), cale sur la LARGEUR comme la banniere des'
       + ' gains il ferait deux mille pixels de haut');
  }

  /* ============ CE QUE LES TROIS MECANIQUES DOIVENT SE VOIR ============
   *
   * Un multiplicateur qui double a chaque tour ne vaut rien s il est
   * invisible : le joueur constate un gros gain a la fin sans savoir d ou il
   * vient, et la meilleure idee du mode gratuit ne lui parvient jamais.
   * On joue donc une serie SURCLASSEE — elle porte les trois a la fois — et
   * on regarde ce que la page montre, image par image.
   */
  {
    console.log('\n-- ce que le joueur VOIT du multiplicateur et du surclassement --');
    const g = graine('dead', false, true);
    if (!g) { ok(false, 'une graine ouvrant Dead Spins et surclassee en Deader'); }
    else {
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
      await p.click('#ddSpin');

      const vues = [];
      let annonce = null, hors = null;
      for (let i = 0; i < 420; i++) {
        const e = await p.evaluate(() => {
          const m = document.getElementById('ddMultis');
          const a = document.querySelector('.dd-annonce');
          const z = document.querySelector('.dd-zone').getBoundingClientRect();
          const f = document.querySelector('.dd-fond').getBoundingClientRect();
          const out = { chips: null, dehors: null, annonce: null, rang: '' };
          const s = document.querySelector('#ddSerie .c');
          out.rang = s ? s.textContent : '';
          if (m && !m.hidden) {
            out.chips = [...m.children].map((x) => x.textContent);
            const r = m.getBoundingClientRect();
            /* Le bandeau doit tenir DANS le fond du plateau : pose trop bas
               il flottait sur la bande blanche sous le cadre. */
            if (r.bottom > f.bottom + 1 || r.top < f.top) out.dehors = {
              bas: +(100 * (r.bottom - z.top) / z.height).toFixed(1),
              fond: +(100 * (f.bottom - z.top) / z.height).toFixed(1) };
          }
          if (a && parseFloat(getComputedStyle(a).opacity) > 0.6) {
            const r = a.getBoundingClientRect();
            out.annonce = { texte: a.textContent, l: Math.round(r.width), h: Math.round(r.height),
              dedans: r.top >= z.top && r.bottom <= z.bottom };
          }
          return out;
        });
        if (e.chips) vues.push(e.chips.slice());
        if (e.dehors && !hors) hors = e.dehors;
        if (e.annonce && !annonce) annonce = e.annonce;
        await p.waitForTimeout(60);
      }

      /* 1. Les pastilles apparaissent, et elles GRANDISSENT. */
      const nombres = vues.map((v) => v.map((t) => Number((t || '').replace('×', '')) || 0));
      ok(nombres.some((v) => v.some((x) => x > 0)),
         'les multiplicateurs tenus s affichent sous leurs rouleaux pendant la serie');
      let monte = null;
      for (let k = 1; k < nombres.length && !monte; k++)
        for (let r = 0; r < nombres[k].length; r++)
          if (nombres[k - 1][r] > 0 && nombres[k][r] > nombres[k - 1][r])
            monte = '×' + nombres[k - 1][r] + ' → ×' + nombres[k][r];
      ok(!!monte, 'et le joueur les VOIT grandir' + (monte ? ' (' + monte + ')' : ''));
      const plafond = Math.max(dod.PLAFOND_ROULEAU[dod.DEAD], dod.PLAFOND_ROULEAU[dod.DEADER]);
      ok(!nombres.some((v) => v.some((x) => x > plafond)),
         'aucune pastille n annonce plus que le plafond du rouleau (×' + plafond + ')');
      ok(!hors, 'le bandeau des multiplicateurs tient dans le plateau'
         + (hors ? ' — il descend a ' + hors.bas + ' % quand le fond finit a ' + hors.fond + ' %' : ''));

      /* 2. Le surclassement s annonce. */
      ok(!!annonce, 'le surclassement en Deader Spins est ANNONCE sur le plateau'
         + (annonce ? ' : « ' + annonce.texte + ' »' : ' — rien ne s affiche'));
      if (annonce) {
        ok(annonce.dedans && annonce.l > 100 && annonce.h > 20,
           'et il est lisible, dans le plateau (' + annonce.l + '×' + annonce.h + ')');
        ok(/DEADER/.test(annonce.texte) && annonce.texte.indexOf('+' + dod.SURCLASSE_TOURS) >= 0,
           'il dit ce qui change ET ce qu il rapporte : Deader, et +' + dod.SURCLASSE_TOURS + ' tours');
      }

      /* 3. Le decompte suit les tours gagnes, et ne les annonce pas d avance. */
      ok(g.tour.toursGratuits === dod.TOURS[dod.DEAD] + dod.SURCLASSE_TOURS,
         'la serie surclassee dure bien ' + g.tour.toursGratuits + ' tours');
      ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
      await p.close();
      faux.close();
    }
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
