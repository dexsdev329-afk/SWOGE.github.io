'use strict';
/*
 * LA FEUILLE DU CHENIL DECRIVAIT L'AUTRE JEU.
 *
 * Elle avait ete recopiee de DEAD SWOGE et jamais relue. Ce qu'elle
 * affichait, mesure en la rendant :
 *
 *   - « Every position counts, so the same three reels can hold several
 *     winning paths at once » — la description exacte des 243 chemins de
 *     l'autre table. Ce jeu-ci paie sur VINGT LIGNES fixes, et un symbole
 *     hors ligne ne paie rien.
 *   - les noms des symboles venaient de DEAD SWOGE (`lanterne`, `pelle`,
 *     `crane`), donc AUCUN ne correspondait : la feuille montrait les cles
 *     brutes du moteur, « dix », « noeud », « collier ».
 *   - le Wild, le Bonus et les tours gratuits n'apparaissaient NULLE PART :
 *     les champs cherches (`taillesWild`, `scattersPourTours`, `crans`)
 *     n'existent pas dans ce bareme-ci, donc les trois sections
 *     disparaissaient en silence. Le joueur ne pouvait pas savoir que les
 *     multiplicateurs s'additionnent, ni que trois Bonus PAIENT.
 *
 * L'essai procede comme celui de DEAD SWOGE : un bareme AUX VALEURS
 * INVENTEES, et l'exigence de le relire a l'ecran. Une page qui garderait
 * une copie des regles afficherait les siennes et se ferait prendre.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
const SERVEUR = '/home/user/swoge-pusher-server.github.io';
let chromium = null, WSS = null;
try { chromium = require('playwright').chromium; } catch (e) {}
try { WSS = require(SERVEUR + '/node_modules/ws').WebSocketServer; } catch (e) {}
if (!chromium || !WSS) { console.log('chenil_info.test.js : playwright ou ws manquent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp',
            '.png':'image/png', '.mp3':'audio/mpeg', '.ogg':'audio/ogg' };

/* Rien ici ne ressemble au moteur : quatre lignes au lieu de vingt, des
   rouleaux differents, d'autres multiplicateurs, un autre tirage. */
const FAUX = {
  rouleaux: 5, rangees: 3,
  bas: ['dix'], hauts: ['collier'],
  wild: 'wild', bonus: 'bonus',
  rouleauxWild: [0, 4],                       /* rouleaux 1 et 5 pour le joueur */
  rouleauxBonus: [1, 3],                      /* rouleaux 2 et 4 */
  lignes: [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0]],
  bareme: { dix: { 3: 0.13, 4: 0.26, 5: 0.39 }, collier: { 3: 7.7, 4: 8.8, 5: 9.9 } },
  multisWild: [{ multi: 6, poids: 1 }, { multi: 4, poids: 3 }],
  bonusPourTours: 4, bonusPaie: 13,
  casesTirage: 5, tirageTours: [{ n: 2, poids: 1 }, { n: 4, poids: 1 }],
  gainMax: 12345, min: 70, max: 88000,
  rtp: 91.23, rtpIc: 0.45, rtpN: 4000000, bonusUnSur: 199,
};

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

  const ouvre = async (bareme) => {
    const faux = new WSS({ port: 0 });
    await new Promise((r) => faux.on('listening', r));
    faux.on('connection', (c) => {
      c.on('message', () => {});
      c.send(JSON.stringify({ type: 'hello', loginNonce: 'n', serverSeedHash: 'h' }));
      const a = { type: 'auth', address: 'e', balance: 1e9, casinoMin: 10, casinoMax: 100000 };
      if (bareme) a.chenilBareme = bareme;
      setTimeout(() => c.send(JSON.stringify(a)), 50);
    });
    const p = await nav.newPage({ viewport: { width: 1400, height: 1000 } });
    const boum = [];
    p.on('pageerror', (e) => boum.push(e.message));
    await p.goto('http://127.0.0.1:' + port + '/swoge_chenil.html?server='
                 + encodeURIComponent('ws://127.0.0.1:' + faux.address().port),
                 { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2300);
    return { p, faux, boum };
  };

  /* 1. CE QUI ETAIT FAUX N'Y EST PLUS */
  console.log('-- la feuille ne decrit plus l autre jeu --');
  {
    const { p, faux, boum } = await ouvre(FAUX);
    await p.click('#chPaytable');
    await p.waitForTimeout(400);
    const t = await p.evaluate(() => document.getElementById('chInfoC').textContent.replace(/\s+/g, ' '));

    /* Les phrases exactes de DEAD SWOGE, celles qui trompaient. */
    const interdits = [
      ['several winning paths at once', 'la description des 243 chemins — ce jeu paie sur des LIGNES'],
      ['MULTIPLIED together', 'le « les multiplicateurs se multiplient » : ici ils S ADDITIONNENT,'
        + ' et x2 avec x3 font 5 et non 6'],
      ['takes the whole reel', 'le Wild qui prend toute la colonne — ici il prend UNE case'],
      ['Dead scatter', 'les scatters de l autre table'],
      ['Deader', 'et son grand mode'],
      ['BUY A BONUS', 'les paliers d achat, que ce jeu n a pas'],
      ['Doge Skull', 'et les symboles de l autre jeu'],
    ];
    for (const [q, quoi] of interdits)
      ok(t.indexOf(q) < 0, 'plus de ' + quoi);

    /* Les cles brutes du moteur ne doivent pas passer pour des noms. */
    ok(t.indexOf('dix') < 0 && t.indexOf('collier') < 0,
       'et plus de cles francaises du moteur affichees comme des noms de symbole');

    /* 2. ET TOUT CE QUI Y EST VIENT DU SERVEUR */
    const attendus = [
      ['4 fixed lines', 'le nombre de lignes, compte sur le trace envoye'],
      ['THE 4 LINES', 'et elles sont dessinees, une grille par ligne'],
      ['9.90', 'le gain du symbole riche (9.90x pour 5)'],
      ['0.13', 'et celui du symbole bas (0.13x pour 3)'],
      ['reels 1 and 5', 'les rouleaux du Wild, comptes a partir de UN pour le joueur'],
      ['one cell', 'le Wild prend une case'],
      ['×6', 'ses multiplicateurs'],
      ['25 %', 'et leurs chances, calculees sur les poids du serveur'],
      ['ADDED', 'la regle qui change tout : ils s additionnent'],
      ['reels 2 and 4', 'les rouleaux du Bonus'],
      ['4 Bonus', 'combien de Bonus ouvrent le tour'],
      ['13× bet', 'ce que les Bonus PAIENT en plus — invisible avant'],
      ['10 to 20', 'les bornes du tirage des tours, calculees'],
      ['15.0 on average', 'et sa moyenne'],
      ['cannot be retriggered', 'que le tour ne se redeclenche pas'],
      ['12,345', 'le plafond de gain'],
      ['70 $SWOGE', 'la mise minimum'],
      ['88,000', 'la mise maximum'],
      ['91.23', 'le retour au joueur'],
      ['1 in 199', 'la frequence du bonus'],
    ];
    for (const [q, quoi] of attendus) ok(t.indexOf(q) >= 0, quoi + ' — « ' + q + ' »');

    /* Aucune valeur du VRAI moteur ne doit apparaitre. */
    const vraies = [['96.35', 'le retour reel'], ['20 fixed lines', 'les vingt vraies lignes'],
                    ['1 in 255', 'la vraie frequence'], ['5,000×', 'le vrai plafond']];
    for (const [q, quoi] of vraies)
      ok(t.indexOf(q) < 0, 'et ' + quoi + ' n apparait pas : la page n en garde aucune copie');

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await p.close(); faux.close();
  }

  /* 3. LES LIGNES DESSINEES SONT LES BONNES */
  console.log('\n-- les lignes dessinees --');
  {
    const { p, faux } = await ouvre(FAUX);
    await p.click('#chPaytable');
    await p.waitForTimeout(400);
    const grilles = await p.evaluate(() => [...document.querySelectorAll('#chInfoC .lg')].map((e) => {
      const on = [...e.querySelectorAll('u')].map((u) => u.classList.contains('on') ? 1 : 0);
      return { n: e.querySelector('b').textContent, on };
    }));
    ok(grilles.length === FAUX.lignes.length,
       'une grille par ligne (' + grilles.length + ')');
    /* Les cases allumees doivent etre EXACTEMENT celles du trace : une
       grille jolie mais fausse serait pire qu'aucune grille. */
    let justes = 0;
    grilles.forEach((g, i) => {
      const l = FAUX.lignes[i];
      let bon = true;
      for (let y = 0; y < FAUX.rangees; y++)
        for (let r = 0; r < FAUX.rouleaux; r++)
          if (g.on[y * FAUX.rouleaux + r] !== (l[r] === y ? 1 : 0)) bon = false;
      if (bon) justes++;
    });
    ok(justes === FAUX.lignes.length,
       'et chacune allume EXACTEMENT les cases du trace envoye par le serveur ('
       + justes + '/' + FAUX.lignes.length + ')');
    /* Une seule case allumee par rouleau : une ligne passe par une rangee. */
    const uneParRouleau = grilles.every((g) => {
      for (let r = 0; r < FAUX.rouleaux; r++) {
        let c = 0;
        for (let y = 0; y < FAUX.rangees; y++) c += g.on[y * FAUX.rouleaux + r];
        if (c !== 1) return false;
      }
      return true;
    });
    ok(uneParRouleau, 'une seule case par rouleau — une ligne visite une rangee, pas deux');
    await p.close(); faux.close();
  }

  /* 4. SANS BAREME, ELLE SE TAIT */
  console.log('\n-- sans bareme --');
  {
    const { p, faux } = await ouvre(null);
    await p.click('#chPaytable');
    await p.waitForTimeout(400);
    const t = await p.evaluate(() => document.getElementById('chInfoC').textContent.replace(/\s+/g, ' '));
    ok(/has not answered yet/.test(t),
       'elle DIT que le serveur n a pas repondu plutot que d inventer des regles de repli');
    ok(t.indexOf('fixed lines') < 0 && t.indexOf('Bonus, anywhere') < 0,
       'et n affiche aucune regle : une regle fausse lue avant de miser est pire qu une regle absente');
    await p.close(); faux.close();
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
