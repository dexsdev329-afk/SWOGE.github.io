'use strict';
/*
 * L'ECRAN D'INFORMATION NE DOIT RIEN INVENTER.
 *
 * Les boutons PAYTABLE et HISTORY repondaient « Paytable coming ». Ils
 * ouvrent maintenant une feuille dont TOUT vient du bareme du serveur : les
 * gains par symbole, les rouleaux du Wild, ses tailles et multiplicateurs,
 * combien de scatters declenchent, combien de tours ils donnent, le
 * plafond, les bornes de mise, les prix d'achat.
 *
 * L'essai le verifie de la seule facon qui prouve quelque chose : il envoie
 * un bareme AUX VALEURS INVENTEES, differentes de celles du moteur, et
 * exige de les relire a l'ecran. Une page qui aurait recopie les vraies
 * regles afficherait les siennes et se ferait prendre.
 *
 * ---- LE DEFAUT QUE CET ESSAI A TROUVE EN S'ECRIVANT ----
 *
 * `.dd-info{display:flex}` BAT l'attribut `hidden`, dont la valeur par
 * defaut n'est qu'un `display:none` de la feuille du navigateur. La feuille
 * restait invisible mais COUVRAIT TOUT L'ECRAN et avalait chaque clic :
 * plus un seul bouton du jeu ne repondait. L'essai n'arrivait pas a cliquer
 * sur PAYTABLE, et c'est comme ca qu'on l'a vu.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
const SERVEUR = '/home/user/swoge-pusher-server.github.io';
let chromium = null, WSS = null;
try { chromium = require('playwright').chromium; } catch (e) {}
try { WSS = require(SERVEUR + '/node_modules/ws').WebSocketServer; } catch (e) {}
if (!chromium || !WSS) { console.log('dod_info.test.js : playwright ou ws manquent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp',
            '.png':'image/png', '.mp3':'audio/mpeg', '.ogg':'audio/ogg' };

/* Un bareme INVENTE, sans rapport avec le moteur : c'est ce qui distingue
   « la page lit le serveur » de « la page connait les regles par coeur ». */
const FAUX = {
  rouleaux: 7, rangees: 4,
  bas: ['j'], hauts: ['crane'],
  wild: 'wild', dead: 'dead', deader: 'deader',
  rouleauxWild: [2, 3],                       /* rouleaux 3 et 4 pour le joueur */
  bareme: { j: { 3: 0.11, 4: 0.22, 5: 0.33 }, crane: { 3: 4.4, 4: 5.5, 5: 6.6 } },
  taillesWild: [{ taille: 2, multi: 7 }, { taille: 1, multi: 9 }],
  scattersPourTours: 4,
  tours: { dead: 21, deader: 33 },
  gainMax: 12345,
  crans: { wild: { prix: 2.7, quoi: 'a made-up tier' }, dead: { prix: 44 } },
  cransOrdre: ['wild', 'dead'],
  min: 70, max: 88000,
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
      if (bareme) a.dodBareme = bareme;
      setTimeout(() => c.send(JSON.stringify(a)), 50);
    });
    const p = await nav.newPage({ viewport: { width: 1400, height: 1000 } });
    const boum = [];
    p.on('pageerror', (e) => boum.push(e.message));
    await p.goto('http://127.0.0.1:' + port + '/swoge_dod.html?server='
                 + encodeURIComponent('ws://127.0.0.1:' + faux.address().port),
                 { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2300);
    return { p, faux, boum };
  };

  /* 1. LA FEUILLE FERMEE NE DOIT RIEN AVALER */
  console.log('-- la feuille fermee --');
  {
    const { p, faux } = await ouvre(FAUX);
    const dessus = await p.evaluate(() => {
      const b = document.getElementById('ddPaytable').getBoundingClientRect();
      const e = document.elementFromPoint(Math.round(b.left + b.width / 2),
                                          Math.round(b.top + b.height / 2));
      return e ? (e.closest('#ddInfo') ? 'ddInfo' : (e.id || e.className || e.tagName)) : null;
    });
    ok(dessus !== 'ddInfo',
       'elle ne couvre pas la page : le doigt pose sur PAYTABLE touche « ' + dessus
       + ' » — `display:flex` bat `hidden`, et sans une regle explicite la'
       + ' feuille invisible avale TOUS les clics du jeu');
    await p.click('#ddPaytable');
    await p.waitForTimeout(350);
    ok(!(await p.evaluate(() => document.getElementById('ddInfo').hidden)),
       'et le bouton l ouvre pour de bon');
    await p.close(); faux.close();
  }

  /* 2. TOUT VIENT DU SERVEUR */
  console.log('\n-- tout vient du bareme, rien de la page --');
  {
    const { p, faux, boum } = await ouvre(FAUX);
    await p.click('#ddPaytable');
    await p.waitForTimeout(400);
    const t = await p.evaluate(() => document.getElementById('ddInfoC').textContent.replace(/\s+/g, ' '));

    const attendus = [
      ['6.60', 'le gain d un symbole (6.60x pour 5 cranes)'],
      ['0.11', 'et celui du symbole bas (0.11x pour 3 j)'],
      ['reels 3 and 4', 'les rouleaux du Wild, comptes a partir de UN pour le joueur'],
      ['×9', 'le multiplicateur du Wild d une case'],
      ['4 Dead scatters', 'combien de scatters declenchent'],
      ['21 free spins', 'combien de tours ils donnent'],
      ['33 free spins', 'et ceux du grand mode'],
      ['12,345', 'le plafond de gain'],
      ['70 $SWOGE', 'la mise minimum'],
      ['88,000', 'la mise maximum'],
      ['2.7×', 'le prix d un cran d achat'],
      ['91.23', 'le retour au joueur'],
      ['1 in 199', 'la frequence du bonus'],
      ['7 × 4', 'et jusqu au format des rouleaux'],
    ];
    for (const [q, quoi] of attendus) ok(t.indexOf(q) >= 0, quoi + ' — « ' + q + ' »');

    /* Et AUCUNE valeur du vrai moteur ne doit apparaitre : si la page en
       gardait une copie, elle s afficherait a cote de celles du serveur. */
    const interdits = [['25,000', 'le plafond du vrai moteur'],
                       ['12 free spins', 'le vrai nombre de tours'],
                       ['reels 2, 3 and 4', 'les vrais rouleaux du Wild']];
    for (const [q, quoi] of interdits)
      ok(t.indexOf(q) < 0, 'et ' + quoi + ' n apparait pas : la page n en garde aucune copie');

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await p.close(); faux.close();
  }

  /* 3. SANS BAREME, ELLE LE DIT */
  console.log('\n-- sans bareme --');
  {
    const { p, faux } = await ouvre(null);
    await p.click('#ddPaytable');
    await p.waitForTimeout(400);
    const t = await p.evaluate(() => document.getElementById('ddInfoC').textContent);
    ok(/server has not answered/i.test(t),
       'elle dit que le serveur n a pas repondu, au lieu d inventer des regles de repli');
    ok(!/\d+\s*free spins/i.test(t) && !/×\s*bet/i.test(t),
       'et n affiche aucune regle : une regle fausse lue avant de miser est'
       + ' pire qu une regle absente');
    await p.close(); faux.close();
  }

  /* 4. ELLE SE FERME */
  console.log('\n-- la fermeture --');
  {
    const { p, faux } = await ouvre(FAUX);
    await p.click('#ddPaytable'); await p.waitForTimeout(300);
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    ok(await p.evaluate(() => document.getElementById('ddInfo').hidden), 'Echap la ferme');
    await p.click('#ddPaytable'); await p.waitForTimeout(300);
    await p.click('#ddInfoX'); await p.waitForTimeout(250);
    ok(await p.evaluate(() => document.getElementById('ddInfo').hidden), 'la croix aussi');
    await p.click('#ddHistory'); await p.waitForTimeout(300);
    const th = await p.evaluate(() => ({
      titre: document.getElementById('ddInfoT').textContent,
      corps: document.getElementById('ddInfoC').textContent }));
    ok(th.titre === 'HISTORY' && /No rounds yet/i.test(th.corps),
       'et HISTORY ouvre la meme feuille, qui dit franchement qu il n y a rien encore');
    await p.close(); faux.close();
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
