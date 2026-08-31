'use strict';
/*
 * LE PAQUET PRIVY EST VENDU TEL QUEL, ET RIEN NE LE GARDAIT.
 *
 * ---- POURQUOI CET ESSAI EXISTE ----
 *
 * `privy-swoge.js` fait sept cents kilo-octets, il n'a ni source ni script de
 * construction dans ce depot, et c'est lui qui tient les cles des joueurs
 * connectes par courriel. On y a touche deux fois : pour ajouter Ethereum aux
 * chaines declarees, puis pour exposer l'adresse Solana. Une troisieme fois
 * arrivera.
 *
 * Une faute dedans ne se voit pas au chargement de la page : elle se voit a la
 * connexion d'un joueur, c'est-a-dire trop tard, et sur son argent. Cet essai
 * fait donc ce que la page fait — charger le fichier pour de vrai dans un
 * navigateur — et verifie ce qu'on peut verifier sans les serveurs de Privy.
 *
 * ---- CE QU'IL NE PEUT PAS FAIRE ----
 *
 * Il ne se connecte pas. Une vraie connexion demande les serveurs de Privy et
 * un courriel. Il ne prouve donc PAS qu'un joueur peut entrer — il prouve que
 * le fichier n'est pas casse, que la surface que la page appelle existe, et
 * que ce qu'on y a ajoute y est encore. C'est une garde, pas une preuve.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}
if (!chromium) { console.log('privy_paquet.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const SITE = __dirname;
const FICHIER = path.join(SITE, 'privy-swoge.js');

(async () => {
  const src = fs.readFileSync(FICHIER, 'utf8');

  console.log('\n-- ce que le fichier contient --');
  ok(src.length > 400000, `le paquet fait ${Math.round(src.length/1024)} ko`);
  /* Les deux chaines declarees. L'ORDRE compte : le fournisseur prend la
     PREMIERE comme chaine active au demarrage — Ethereum en tete ferait
     ouvrir le portefeuille sur la mauvaise. */
  const ch = /supportedChains:\[([^\]]*)\]/.exec(src);
  ok(!!ch, 'il declare ses chaines');
  ok(!!ch && /^SE\b/.test(ch[1].trim()),
     'et la Robinhood Chain est la PREMIERE — c est celle du demarrage ('
     + (ch ? ch[1] : '?') + ')');
  ok(!!ch && ch[1].split(',').length >= 2,
     'avec Ethereum en second, pour que le depot du pont puisse se signer');

  /* La capacite Solana. Elle etait la depuis toujours ; ce qui manquait, c'est
     qu'on l'appelle. Un paquet re-livre sans elle casserait l'ecran Solana au
     moment ou un joueur appuie, pas avant. */
  console.log('\n-- la capacite solana --');
  for (const m of ['createSolana', 'getSolanaProvider', 'solana-wallet:rpc']) {
    ok(src.indexOf(m) >= 0, `le paquet sait faire « ${m} »`);
  }

  console.log('\n-- et il se charge vraiment dans un navigateur --');
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(SITE) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': 'text/javascript' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const p = await nav.newPage();
  const boum = [];
  p.on('pageerror', (e) => boum.push(String(e).slice(0, 200)));
  await p.setContent('<!doctype html><html><body></body></html>');
  await p.addScriptTag({ url: 'http://127.0.0.1:' + port + '/privy-swoge.js' });
  await p.waitForTimeout(500);

  const m = await p.evaluate(() => {
    const S = window.SwogePrivy;
    if (!S) return { present: false };
    let init = 'ok';
    /* Un identifiant de la bonne FORME, jamais un vrai : cet essai ne parle a
       personne. Ce qu'on mesure est que la construction du client ne jette
       pas — c'est elle qui lit `supportedChains`. */
    try { S.init('cme0000000000000000000000'); } catch (e) { init = String(e).slice(0, 140); }
    let sol = null, err = null;
    try { sol = S.solana(); } catch (e) { err = String(e).slice(0, 140); }
    return { present: true, cles: Object.keys(S).sort(),
             fonctions: Object.keys(S).every((k) => typeof S[k] === 'function'),
             init, sol, err, connecte: S.isLoggedIn(), adresse: S.getAddress() };
  });
  console.log('   surface : ' + JSON.stringify(m.cles));

  ok(m.present, 'le paquet pose bien `window.SwogePrivy`');
  /* La liste que la PAGE appelle. Elle est ecrite ici parce qu'elle est un
     contrat : le jour ou le paquet en perd une, la page casse a l'usage. */
  const requis = ['init', 'sendCode', 'verifyCode', 'logout', 'restore', 'getProvider',
                  'getAddress', 'isLoggedIn', 'comptes', 'choisitCompte', 'ajouteCompte',
                  'indexCompte', 'solana', 'creeSolana'];
  const manquants = requis.filter((k) => (m.cles || []).indexOf(k) < 0);
  ok(manquants.length === 0,
     manquants.length === 0
       ? `les ${requis.length} fonctions que la page appelle sont la`
       : 'il en manque : ' + manquants.join(', '));
  ok(m.fonctions, 'et toutes sont des fonctions');
  ok(m.init === 'ok', 'la construction du client passe : ' + m.init);
  /* Deconnecte, `solana()` doit rendre une liste VIDE et non lever : l ecran
     Account l appelle a chaque peinture, y compris avant toute connexion. */
  ok(Array.isArray(m.sol) && m.sol.length === 0 && !m.err,
     'et `solana()` rend une liste vide hors connexion, sans lever ('
     + JSON.stringify(m.sol) + (m.err ? ' / ' + m.err : '') + ')');
  ok(boum.length === 0, 'aucune exception au chargement'
     + (boum.length ? ' : ' + boum[0] : ''));

  await nav.close(); srv.close();
  console.log(`\nprivy_paquet.test.js : ${n} verifications, ${rates} echec(s)`);
  if (rates) process.exit(1);
})().catch((e) => { console.error('interrompu : ' + (e && e.stack)); process.exit(1); });
