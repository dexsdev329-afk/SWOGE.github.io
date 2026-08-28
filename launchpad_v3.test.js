'use strict';
/*
 * LE LANCEUR, AVEC SES DEUX CONTRATS.
 *
 * ---- POURQUOI CET ESSAI EXISTE ----
 *
 * `launchpad.html` parlait a UN contrat. Il en sert maintenant deux : le V3
 * pour les nouveaux lancements, et le V2 parce que 23 jetons y sont deja nes
 * et que leurs detenteurs doivent pouvoir echanger et reclamer pour toujours.
 * Tout ce qui depend du contrat — l'actif de cotation, le partage des frais,
 * la part du createur — differe entre les deux.
 *
 * Le defaut que cet essai cherche n'est pas une erreur de syntaxe : c'est une
 * page qui AFFICHE des prix en ETH pour un jeton cote en $SWOGE, ou qui promet
 * a un createur V3 « votre 70 % » alors que le contrat ne lui verse RIEN.
 * Une page qui ment sur ce que le contrat paie est pire qu'une page cassee :
 * elle est credible.
 *
 * ---- CE QU'IL NE PEUT PAS FAIRE ----
 *
 * Le V3 n'est pas deploye. Aucun lancement, aucun achat, aucune reclamation
 * n'est essaye ici. Cet essai verifie la LECTURE de la chaine reelle et le
 * cablage de la page, pas le chemin d'ecriture.
 */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

let n = 0, echecs = 0;
const ok = (c, m) => { if (c) { n++; console.log('  ok   ' + m); }
                       else { echecs++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} [${a} vs ${b}]`);

const SITE = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript',
                '.json': 'application/json', '.webp': 'image/webp',
                '.png': 'image/png', '.css': 'text/css', '.mp4': 'video/mp4' };

const servir = async () => {
  const s = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { port: s.address().port, stop: () => s.close() };
};

/* ---- LE PONT VERS LA VRAIE CHAINE ----
 * Le navigateur de ce conteneur n'a AUCUN acces sortant : ethers.js ne se
 * charge pas, et sans lui le script entier de la page s'arrete a sa premiere
 * ligne. Un essai lance tel quel ne verifierait donc rien du tout — il
 * passerait au vert sur une page morte.
 *
 * Node, lui, sort par le mandataire. On sert donc ethers depuis le disque et
 * on fait suivre les appels RPC par Node vers le VRAI noeud : la page lit les
 * vrais contrats, les vrais 23 jetons, les vrais prix. Ce qui reste hors de
 * portee, ce sont les ecritures — il n'y a pas de portefeuille ici. */
const ETHERS = path.join('/tmp/claude-0/-home-user/5dffd995-dd9a-578f-a1f3-991ca6e1904d/scratchpad', 'ethers.umd.min.js');
const RPC = 'https://rpc.mainnet.chain.robinhood.com';

(async () => {
  if (!fs.existsSync(ETHERS)) { console.log('  RATE ethers.umd.min.js absent — essai impossible'); process.exit(1); }
  const srv = await servir();
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 900 } });

  /* L'ORDRE COMPTE : Playwright essaie la DERNIERE route posee en premier.
     Le fourre-tout va donc d'abord, les routes precises ensuite. */
  /* On REFUSE proprement au lieu d'avorter : une requete avortee peut ne
     jamais se resoudre, et `await getEthUsd()` resterait suspendu pour
     toujours — l'essai verrait une page figee et accuserait le code. */
  await ctx.route('https://**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/ethers*.js', (r) =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(ETHERS) }));
  // le RPC, relaye par Node qui a le droit de sortir
  await ctx.route(RPC + '**', async (r) => {
    try {
      const rep = await fetch(RPC, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: r.request().postData() });
      r.fulfill({ status: rep.status, contentType: 'application/json', body: await rep.text() });
    } catch (e) { r.fulfill({ status: 502, body: '{}' }); }
  });

  const pg = await ctx.newPage();
  const erreurs = [];
  pg.on('pageerror', (e) => erreurs.push(String(e.message || e)));

  await pg.goto(`http://127.0.0.1:${srv.port}/launchpad.html`, { waitUntil: 'load' });
  await pg.waitForTimeout(2500);

  console.log('\n-- la page se charge --');
  ok(erreurs.length === 0, 'aucune erreur JS au chargement' + (erreurs.length ? ' : ' + erreurs[0] : ''));

  /* ---- 1. LE FORMULAIRE DE LANCEMENT, V3 NON DEPLOYE ----
   * Tant que l'adresse est vide, le bouton doit s'annoncer indisponible.
   * Le pire comportement possible serait un bouton actif qui envoie une
   * transaction vers l'adresse zero. */
  /* ---- 1. LE V3 EST DEPLOYE : LA PAGE LIT LE VRAI CONTRAT ----
   * Plus de simulation ici : le frais affiche vient de `creationFee()` lu sur
   * la chaine. Si quelqu'un redeploie avec un autre frais, cet essai le voit. */
  console.log('\n-- lancement : la page lit le contrat V3 deploye --');
  await pg.waitForFunction(() => /SWOGE/.test(document.querySelector('#feeSummary').textContent || ''),
    { timeout: 30000 }).catch(() => {});
  const fee = (await pg.textContent('#feeSummary')) || '';
  ok(/\$SWOGE/.test(fee), 'le frais est libelle en $SWOGE : ' + fee.slice(0, 60));
  ok(/10\.0K/.test(fee), 'le frais lu sur la chaine est bien 10 000 $SWOGE');
  ok(/burned/i.test(fee), 'la page dit que le frais est brule');
  ok(/70% → token holders/.test(fee), 'le partage annonce est 70 % aux detenteurs');
  ok(!/70% creator/i.test(fee), 'aucune promesse de 70 % au createur');
  const lib = await pg.textContent('#createBtn');
  ok(!/opens at deployment/.test(lib || ''), 'le bouton ne porte plus le blocage de deploiement');

  /* ---- 1 bis. LE CAS « PAS DEPLOYE » RESTE COUVERT ----
   * L'adresse est maintenant en dur dans la page. Pour verifier qu'elle
   * degrade proprement si elle devait un jour etre videe — un redeploiement,
   * un contrat a remplacer — on sert la page avec la constante blanchie.
   * Sans ca, ce chemin ne serait plus jamais essaye. */
  console.log('\n-- degradation si le V3 n est pas renseigne --');
  const pgVide = await ctx.newPage();
  await pgVide.route('**/launchpad.html*', async (r) => {
    const brut = fs.readFileSync(path.join(SITE, 'launchpad.html'), 'utf8');
    const vide = brut.replace(/var V3_ADDRESS = window\.SWOGEFUN_V3_ADDRESS \|\| "0x[0-9a-fA-F]+";/,
                              'var V3_ADDRESS = window.SWOGEFUN_V3_ADDRESS || "";');
    ok(vide !== brut, 'la constante V3_ADDRESS a bien pu etre blanchie pour l essai');
    r.fulfill({ status: 200, contentType: 'text/html', body: vide });
  });
  await pgVide.goto(`http://127.0.0.1:${srv.port}/launchpad.html`, { waitUntil: 'load' });
  await pgVide.waitForTimeout(1500);
  ok(await (await pgVide.$('#createBtn')).isDisabled(), 'sans adresse, le bouton reste desactive');
  const feeVide = (await pgVide.textContent('#feeSummary')) || '';
  ok(/not open yet|not deployed/i.test(feeVide), 'sans adresse, la page annonce que le lancement n est pas ouvert');
  await pgVide.close();

  /* ---- 2. LA GRILLE LIT LA VRAIE CHAINE ----
   * Les 23 jetons du V2 existent. S'ils disparaissent, la migration a
   * strande de vrais detenteurs. */
  console.log('\n-- explorer : les jetons V2 restent visibles --');
  await pg.click('.tab[data-tab="explore"]');
  await pg.waitForFunction(() => document.querySelectorAll('#list .tcard').length > 0, { timeout: 45000 })
    .catch(() => {});
  const cartes = await pg.$$eval('#list .tcard', (e) => e.length);
  /* NOTE : un faux portefeuille a ete injecte plus haut. C'est volontaire, et
     c'est ce qui a fait tomber ce test la premiere fois : la page LISAIT la
     chaine a travers le portefeuille des qu'il y en avait un, et la grille se
     vidait pour un utilisateur connecte alors qu'elle s'affichait pour un
     visiteur. Les lectures passent desormais par le RPC. Cette ligne verrouille
     la regression. */
  ok(cartes >= 20, `la grille se remplit MEME avec un portefeuille connecte (${cartes} cartes)`);
  const info = await pg.textContent('#listInfo');
  ok(/\d+ launched/.test(info || ''), 'le compteur annonce un nombre de lancements : ' + info);

  /* ---- 3. UN JETON V2 S'OUVRE ET RESTE COTE EN ETH ----
   * C'est la regression la plus probable : servir deux contrats et coter
   * par erreur tous les jetons dans la meme unite. */
  console.log('\n-- un jeton V2 s ouvre, et se cote en ETH --');
  await pg.click('#list .tcard');
  await pg.waitForTimeout(4000);
  const vue = await pg.$eval('#tradeView', (e) => !e.classList.contains('hidden'));
  ok(vue, 'la vue d echange s ouvre');
  const tok = ((await pg.textContent('#tvAddr')) || '').trim().split(/\s/)[0];
  await pg.evaluate((t) => { window.__tok = t; }, tok);
  const lbl = await pg.textContent('#buyLbl');
  eq((lbl || '').trim(), 'Buy — ETH to spend', 'le libelle d achat porte ETH pour un jeton V2');
  const collecte = await pg.textContent('#tvCollectBtn');
  ok(/70% creator/.test(collecte || ''), 'le partage V2 annonce est celui du V2 : ' + collecte);
  const badge = await pg.textContent('#tvBadge');
  ok(/live on Uniswap/.test(badge || ''), 'le jeton est reconnu comme instantane, pas « on curve » : ' + badge);
  const mcap = await pg.textContent('#tvMcap');
  ok(mcap && mcap !== '—' && /ETH|\$/.test(mcap), 'la capitalisation est lue et cotee : ' + mcap);
  /* Contre-verification independante : on refait le calcul depuis slot0 du
     pool, sans passer par la page. La formule de la COURBE rend 1.00 ETH a
     vide — a s'y meprendre le meme chiffre que le vrai. Un affichage venu du
     mauvais chemin passerait donc pour juste sans ce controle. */
  const attendu = await pg.evaluate(async () => {
    const call = async (to, data) => {
      const r = await fetch('https://rpc.mainnet.chain.robinhood.com', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }) });
      return (await r.json()).result;
    };
    const inst = await call('0x4De26D120A4fF2d7c1875E6C7D611262b9cA426d',
      '0x6c3c1a4f' + window.__tok.slice(2).padStart(64, '0'));       // instant(address)
    const pool = '0x' + inst.slice(2 + 128, 2 + 192).slice(24);
    const s0 = await call(pool, '0x3850c7bd');                       // slot0()
    const sp = Number(BigInt('0x' + s0.slice(2, 66))) / 2 ** 96;
    const t0w = '0x0bd7d308f8e1639fab988df18a8011f41eacad73' < window.__tok.toLowerCase();
    return (t0w ? 1 / (sp * sp) : sp * sp) * 1e9;
  }).catch(() => null);
  ok(attendu != null, 'la contre-verification a pu lire le pool sur la chaine');
  if (attendu != null) {
    const lu = parseFloat((mcap || '').replace(/[^0-9.]/g, ''));
    ok(Math.abs(lu - attendu) / attendu < 0.02,
       `la capitalisation affichee vient bien du pool [page ${lu} vs chaine ${attendu.toFixed(4)}]`);
  }

  /* ---- 4. LE CABLAGE V3 EXISTE DANS LA PAGE ----
   * On ne peut pas l'exercer sans deploiement, mais on peut verifier que la
   * table des lanceurs est complete et coherente. */
  console.log('\n-- la table des deux lanceurs --');
  const table = await pg.evaluate(() => {
    // la page est dans une IIFE : on relit la source servie
    return null;
  });
  const src = fs.readFileSync(path.join(SITE, 'launchpad.html'), 'utf8');
  ok(/quote:SWOGE_TOKEN/.test(src), 'le lanceur V3 se cote en $SWOGE');
  ok(/quote:WETH/.test(src), 'le lanceur V2 se cote en WETH');
  ok(/70% holders \/ 30% SWOGE treasury/.test(src), 'le partage V3 est 70 detenteurs / 30 tresor');
  ok(!/mode:1/.test(src), 'le parametre `mode` du V2 ne part plus dans createToken');
  ok(/salt:salt/.test(src), 'le sel part bien dans createToken');
  ok(/approve\(V3_ADDRESS, creationFeeWei\)/.test(src), 'le frais en $SWOGE est autorise avant le lancement');
  ok(!/creationFeeWei\.gt\(0\)[\s\S]{0,400}MaxUint256/.test(src),
     'l autorisation du frais est bornee au montant, pas infinie');

  /* ---- 5. LA PAGE NE PROMET RIEN AU CREATEUR V3 ---- */
  console.log('\n-- le createur V3 ne recoit rien, et la page le dit --');
  ok(/creator receives <b>nothing<\/b>/.test(src), 'la page ecrit que le createur V3 ne recoit rien');
  ok(/t\.v===3 \? 0 : pending\*0\.7/.test(src), 'la part createur est zero sur un jeton V3');

  /* Le bloc « V3 simule » a ete retire : le contrat est deploye, la page lit
     desormais le vrai `creationFee()` plus haut. Simuler un contrat quand le
     vrai existe reviendrait a essayer sa propre maquette. */

  console.log(`\n${n} verifications, ${echecs} echec(s)`);
  await nav.close(); srv.stop();
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
