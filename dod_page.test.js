'use strict';
/*
 * LA PAGE DE DEAD SWOGE TIENT-ELLE SON PLATEAU ?
 *
 * Trois pieges, et j'ai remis les pieds dans deux d'entre eux en l'ecrivant
 * — les memes qu'a Bonanza, dans le meme ordre.
 *
 * 1. LES SYMBOLES SE CHEVAUCHAIENT. L'image est a `104 %` de sa case pour
 *    deborder un peu ; a `108 %` elle faisait 117 px pour un pas vertical de
 *    113,9, donc trois pixels de recouvrement entre deux rangees. Trois
 *    pixels ne se voient pas sur une capture et se voient en jouant.
 *
 * 2. LE PLATEAU N'EXISTAIT PAS SANS SERVEUR. `ddBareme()` sortait des le
 *    premier `if` tant que le bareme n'etait pas arrive : un visiteur non
 *    connecte voyait quinze cases vides et aucun bouton. Tout ce qu'il faut
 *    pour PEINDRE etait pourtant deja la.
 *
 * 3. LE CADRE PEUT MANGER UN SYMBOLE. Celui de Bonanza le fait — 23 % de la
 *    case du bas derriere un coffre. Celui-ci a ete dessine avec les coins
 *    libres, et cet essai est ce qui garantit qu'il le reste.
 *
 * Et un quatrieme qui n'est pas un piege mais une regle : LES PRIX D'ACHAT
 * NE SONT PAS DANS CETTE PAGE. Ils viennent du serveur, parce qu'un prix
 * recopie se dement le jour ou le moteur est remesure.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
let WSS = null;
try { WSS = require('/home/user/swoge-pusher-server.github.io/node_modules/ws').WebSocketServer; } catch (e) {}

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('dod_page.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
            '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg',
            '.mp3':'audio/mpeg', '.ogg':'audio/ogg' };

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

  for (const [nom, w, h] of [['PC', 1400, 1000], ['telephone', 390, 844]]) {
    const p = await nav.newPage({ viewport: { width: w, height: h } });
    const erreurs = [];
    p.on('pageerror', (e) => erreurs.push(e.message));
    await p.goto('http://127.0.0.1:' + port + '/swoge_dod.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2200);

    console.log('\n-- ' + nom + ' --');

    /* 2. LE PLATEAU SANS SERVEUR */
    const vu = await p.evaluate(() => ({
      cases: document.querySelectorAll('#ddGrille .dd-c').length,
      peintes: [...document.querySelectorAll('#ddGrille img')].filter((i) => i.getAttribute('src')).length,
      achats: document.querySelectorAll('#ddAchats .dd-a').length,
      mise: (document.getElementById('ddMise') || {}).textContent || '',
      spin: !!document.getElementById('ddSpin'),
    }));
    ok(vu.cases === 15, 'quinze cases, cinq rouleaux de trois (' + vu.cases + ')');
    ok(vu.peintes === 15, 'toutes peintes SANS serveur : la page ne demande pas de se connecter pour exister');
    ok(vu.achats === 4, 'les quatre crans d achat sont poses (' + vu.achats + ')');
    ok(/\d/.test(vu.mise), 'une mise de depart est proposee : ' + vu.mise.trim());

    /* 1. LE CHEVAUCHEMENT */
    const g = await p.evaluate(() => {
      const cs = document.getElementById('ddGrille').children;
      const c0 = cs[0].getBoundingClientRect();
      const im = cs[0].firstChild.getBoundingClientRect();
      return { vu: Math.min(im.width, im.height),
               pasH: cs[1].getBoundingClientRect().left - c0.left,
               pasV: cs[5].getBoundingClientRect().top - c0.top };
    });
    ok(g.vu <= g.pasV + 0.6,
       'les rangees ne se chevauchent pas : symbole ' + g.vu.toFixed(1)
       + ' px pour un pas de ' + g.pasV.toFixed(1));
    ok(g.vu <= g.pasH + 0.6,
       'les colonnes non plus (' + g.pasH.toFixed(1) + ' px)');

    /* 3. LE CADRE NE MANGE AUCUN SYMBOLE */
    const couv = await p.evaluate(async () => {
      const zone = document.querySelector('.dd-zone').getBoundingClientRect();
      const cs = document.getElementById('ddGrille').children;
      const im0 = cs[0].firstChild.getBoundingClientRect();
      const vu = Math.min(im0.width, im0.height);
      const img = new Image(); img.src = 'img/dod/cadre.webp';
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      let pire = 0, ou = -1;
      for (let i = 0; i < cs.length; i++) {
        const r = cs[i].getBoundingClientRect();
        const mx = (r.left + r.right) / 2, my = (r.top + r.bottom) / 2;
        const x0 = (mx - vu / 2 - zone.left) / zone.width, x1 = (mx + vu / 2 - zone.left) / zone.width;
        const y0 = (my - vu / 2 - zone.top) / zone.height, y1 = (my + vu / 2 - zone.top) / zone.height;
        let t = 0, c = 0;
        for (let yy = Math.max(0, Math.floor(y0 * cv.height)); yy < Math.min(cv.height, Math.ceil(y1 * cv.height)); yy += 2)
          for (let xx = Math.max(0, Math.floor(x0 * cv.width)); xx < Math.min(cv.width, Math.ceil(x1 * cv.width)); xx += 2) {
            t++; if (d[(yy * cv.width + xx) * 4 + 3] > 60) c++;
          }
        if (t && c / t > pire) { pire = c / t; ou = i; }
      }
      return { pire, ou };
    });
    ok(couv.pire < 0.05,
       'aucun symbole n est mange par le cadre (le pire est la case ' + couv.ou
       + ' a ' + (100 * couv.pire).toFixed(1) + ' %) — celui de Bonanza en cache 23 %');

    ok(erreurs.length === 0, 'aucune erreur JS' + (erreurs.length ? ' : ' + erreurs[0] : ''));
    await p.close();
  }

  /* 4. LES PRIX NE SONT PAS DANS LA PAGE */
  const src = fs.readFileSync(path.join(SITE, 'swoge_dod.html'), 'utf8');
  const jeu = src.slice(src.indexOf('DD_ACHAT_IMG'), src.indexOf('function ddBareme'));
  const durs = (jeu.match(/\b(1\.5|7|12\.5|36|99|108|499)\s*[x×]/gi) || []);
  console.log('');
  ok(durs.length === 0,
     "aucun prix d achat n est ecrit en dur dans la page — ils viennent du serveur"
     + (durs.length ? ' (trouve : ' + durs.join(', ') + ')' : ''));
  ok(/b\.crans\[c\]\s*&&\s*b\.crans\[c\]\.prix/.test(src),
     'et ils sont bien lus dans le bareme envoye a la connexion');

  /* 5. LES QUATRE VIGNETTES D'ACHAT
   *
   * Elles sont decoupees d'une seule planche puis calees sur un gabarit
   * commun. C'est ce gabarit commun qui fait que les quatre tuiles ont la
   * meme hauteur et que le prix tombe au meme endroit sur chacune. Une
   * planche regeneree plus tard, redecoupee sans recaler, desaligne la
   * rangee sans lever la moindre erreur — d'ou cette mesure. */
  const nomsCran = ['wild', 'scatter', 'dead', 'deader'];
  const tailles = [];
  let manque = [];
  for (const c of nomsCran) {
    const f = path.join(SITE, 'img', 'dod', 'achat_' + c + '.webp');
    if (!fs.existsSync(f)) { manque.push(c); continue; }
    const d = fs.readFileSync(f);
    /* En-tete WEBP/VP8L ou VP8X : on lit la taille sans decodeur. */
    let w = 0, h = 0;
    const tag = d.slice(12, 16).toString('latin1');
    if (tag === 'VP8X') { w = 1 + d.readUIntLE(24, 3); h = 1 + d.readUIntLE(27, 3); }
    else if (tag === 'VP8L') {
      const b0 = d.readUInt32LE(21);
      w = 1 + (b0 & 0x3FFF); h = 1 + ((b0 >> 14) & 0x3FFF);
    } else if (tag === 'VP8 ') { w = d.readUInt16LE(26) & 0x3FFF; h = d.readUInt16LE(28) & 0x3FFF; }
    tailles.push({ c, w, h });
  }
  ok(manque.length === 0,
     'les quatre vignettes d achat sont sur le disque'
     + (manque.length ? ' (manque : ' + manque.join(', ') + ')' : ''));
  if (tailles.length === 4) {
    const memes = tailles.every(t => t.w === tailles[0].w && t.h === tailles[0].h);
    ok(memes,
       'et elles ont toutes le meme gabarit — sinon la rangee se desaligne ('
       + tailles.map(t => t.c + ' ' + t.w + 'x' + t.h).join(', ') + ')');
  }

  /* Et aucune ne porte de prix : c'etait le defaut de la planche d'origine,
   * ou « 1.5x BET » et « 499x BET » etaient peints dans l'image et
   * contredisaient les prix mesures sur ce moteur. */
  ok(!/achat_(1\.5|7|99|499|\d+x)/i.test(src),
     'et aucune n est nommee par un prix — elles portent le nom du cran');

  /* 6. UN SERVEUR QUI NE CONNAIT PAS CE JEU
   *
   * Le routeur du serveur est une chaine de `if` sur le type du message :
   * un `dodSpin` qu'une version anterieure ne connait pas ne tombe pas en
   * erreur, il tombe dans le VIDE. Le joueur cliquerait SPIN et il ne se
   * passerait RIEN — ni rouleau, ni message, ni refus. C'est exactement
   * l'etat du serveur en production tant qu'il n'est pas redeploye.
   *
   * Le seul signal qui distingue les deux, c'est le bareme envoye a la
   * connexion. On monte donc un faux serveur qui salue SANS bareme, et l'on
   * verifie que le bouton se ferme au lieu de mentir. */
  if (WSS) {
    console.log('');
    const faux = new WSS({ port: 0 });
    await new Promise((r) => faux.on('listening', r));
    const pw = faux.address().port;
    /* Le bareme voyage dans `auth`, pas dans `hello` : `hello` ne porte que
     * le nonce de connexion. Un faux serveur qui s'arrete a `hello` laisse
     * la page a l'ecran d'accueil et fait passer l'essai pour de mauvaises
     * raisons — c'est ce qui est arrive en l'ecrivant. */
    const salue = (c, bareme) => {
      c.on('message', () => {});
      c.send(JSON.stringify({ type: 'hello', loginNonce: 'n', serverSeedHash: 'h' }));
      const a2 = { type: 'auth', address: 'ess', balance: 100000,
                   casinoMin: 10, casinoMax: 100000 };
      if (bareme) a2.dodBareme = bareme;
      setTimeout(() => c.send(JSON.stringify(a2)), 60);
    };
    faux.on('connection', (c) => salue(c, null));
    const p = await nav.newPage({ viewport: { width: 1400, height: 1000 } });
    await p.goto('http://127.0.0.1:' + port + '/swoge_dod.html?server='
                 + encodeURIComponent('ws://127.0.0.1:' + pw), { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    ok(await p.$eval('#ddSpin', (b2) => b2.disabled),
       'un serveur qui ne connait pas le jeu ferme le bouton SPIN au lieu'
       + ' d envoyer un message qui tombera dans le vide');
    await p.close();

    /* Et le controle positif : le MEME faux serveur, mais qui salue AVEC un
     * bareme, doit rouvrir le bouton. Sans lui, cet essai passerait aussi
     * bien avec un bouton ferme pour toujours. */
    faux.removeAllListeners('connection');
    /* Le bareme d'essai a la MEME FORME que celui de `game.js:dodBareme()`.
     * Un bareme d'essai partiel testerait un serveur qui n'existe pas — et
     * c'est ce qui est arrive : reduit a ses seuls prix, il faisait lever
     * `ddSyms` et masquait le vrai defaut. */
    faux.on('connection', (c) => salue(c,
      { rouleaux: 5, rangees: 3,
        bas: ['j', 'q', 'k', 'a'], hauts: ['lanterne', 'pelle', 'crane'],
        wild: 'wild', dead: 'dead', deader: 'deader',
        crans: { wild: { prix: 1.6 }, scatter: { prix: 12.5 },
                 dead: { prix: 36 }, deader: { prix: 108 } },
        cransOrdre: ['wild', 'scatter', 'dead', 'deader'],
        min: 10, max: 100000 }));
    const p2 = await nav.newPage({ viewport: { width: 1400, height: 1000 } });
    const boum = [];
    p2.on('pageerror', (e) => boum.push(e.message));
    await p2.goto('http://127.0.0.1:' + port + '/swoge_dod.html?server='
                  + encodeURIComponent('ws://127.0.0.1:' + pw), { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(2500);
    ok(!(await p2.$eval('#ddSpin', (b2) => b2.disabled)),
       'et un serveur a jour le rouvre — sans quoi cet essai passerait avec'
       + ' un bouton ferme pour toujours');
    ok(boum.length === 0,
       'et le tour de connexion complet ne leve aucune exception'
       + (boum.length ? ' : ' + boum[0] : ''));
    const prix = await p2.$$eval('.dd-a b', (l) => l.map((x) => x.textContent));
    ok(prix.every((t) => /\d/.test(t)) && prix.length === 4,
       'et les quatre prix arrivent du serveur : ' + prix.join(' | '));
    /* La ligne « provably fair ». Elle etait tombee du <main>, et
     * `showFair` levait alors une exception a chaque `hello` et a chaque
     * `auth`, ce qui avortait tout le reste du traitement. */
    /* Le prix est EXACT, non abrege : `ddFmt(1080)` rendait « 1.1k », soit
     * vingt $SWOGE de plus que ce qui sera debite. Sur le bouton qui
     * declenche le paiement, arrondir n'est pas une commodite d'affichage. */
    ok(prix.some((t) => /1,080/.test(t)),
       'le prix d achat est ECRIT EN ENTIER : « 1.1k » annoncait vingt $SWOGE'
       + ' de plus que le debit reel');
    /* Et a la mise maximale il atteint huit chiffres : s'il deborde de sa
     * pastille, il se lit tronque — pire qu'arrondi. */
    await p2.click('#ddMax');
    await p2.waitForTimeout(300);
    const gros = await p2.$$eval('.dd-a b', (l) => l.map((x) => ({
      t: x.textContent, tronque: x.scrollWidth > x.clientWidth + 1 })));
    ok(gros.every((g) => !g.tronque),
       'et a la mise maximale il tient encore dans sa pastille : '
       + gros.map((g) => g.t).join(' | '));

    ok(/Provably fair/.test(await p2.$eval('#fair', (x) => x.textContent)),
       'la ligne « provably fair » est ecrite : sans son element, showFair'
       + ' levait et emportait tout le traitement de auth avec lui');
    await p2.close();
    faux.close();
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
