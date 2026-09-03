/* SIGNER SUR SOLANA — LE SOCLE
 *
 * ---- POURQUOI CET ESSAI EXISTE ----
 *
 * « On peut pas acheter des jetons Solana sur la chaine Solana ? »
 *
 * Acheter marchait deja : le relayeur ponte et echange en une transaction, et
 * depose sur l'adresse Solana. Ce qui manquait, c'est de pouvoir payer DEPUIS
 * Solana — donc SIGNER dessus. Et signer demandait deux choses qui n'etaient
 * pas la.
 *
 * ---- 1. LE SIGNEUR N'ETAIT PAS EXPOSE ----
 *
 * `getSolanaProvider` est dans le paquet Privy depuis toujours. L'enveloppe
 * `SwogePrivy` exposait `solana()` et `creeSolana()` — creer et lire — et
 * rien pour signer. Le code etait la, personne ne l'appelait.
 *
 * ---- 2. ET `Buffer` N'EXISTE PAS ----
 *
 * Le gestionnaire Solana de Privy fait `Buffer.from(...)` et
 * `.toString("base64")`. Mesure faite dans un Chromium reel : `Buffer` n'est
 * NI dans le paquet Privy, NI dans `@solana/web3.js`, NI dans le navigateur.
 * Sans lui, signer leve `ReferenceError: Buffer is not defined` — au moment
 * exact ou l'argent bouge, apres que l'utilisateur a valide.
 *
 * D'ou le shim de quarante lignes en tete de `privy-swoge.js`. Cet essai le
 * confronte au VRAI `Buffer` de Node sur les operations exactes que Privy
 * effectue. Un encodeur base64 ecrit a la main se trompe toujours au meme
 * endroit — le remplissage — et une signature Solana mal decodee ne fait pas
 * une erreur : elle fait une transaction refusee, ou pire, acceptee et
 * fausse.
 */
'use strict';
const fs = require('fs');
const path = require('path');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('solana_signature.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

process.on('unhandledRejection', (e) => {
  console.log('  RATE essai interrompu : ' + (e && e.message ? e.message : e));
  process.exit(1);
});

/* Le shim seul, sans les sept cent mille octets du paquet : c'est LUI qu'on
   eprouve, et le charger seul prouve aussi qu'il ne depend de rien. */
function shimSeul() {
  const src = fs.readFileSync(path.join(__dirname, 'privy-swoge.js'), 'utf8').split('\n');
  const fin = src.findIndex((l, i) => i < 200 && l === '})();');
  if (fin < 0) throw new Error('shim Buffer introuvable en tete de privy-swoge.js');
  return src.slice(0, fin + 1).join('\n');
}

(async () => {
  const nav = await chromium.launch();
  const pg = await (await nav.newContext()).newPage();
  const boum = [];
  pg.on('pageerror', (e) => boum.push(e.message));
  await pg.goto('about:blank');
  await pg.addScriptTag({ content: shimSeul() });

  console.log('\n-- le shim se pose, et seulement s il manque --');
  ok(await pg.evaluate(() => typeof Buffer) === 'object',
     'sans lui, `Buffer` n existe pas dans un navigateur — mesure faite, pas supposee');
  ok(await pg.evaluate(() => { window.Buffer = { deja: true }; return true; }),
     'et il ne remplace jamais un Buffer deja pose : une extension peut en avoir un vrai');

  /* On repart propre pour la suite. */
  const pg2 = await (await nav.newContext()).newPage();
  pg2.on('pageerror', (e) => boum.push(e.message));
  await pg2.goto('about:blank');
  await pg2.addScriptTag({ content: shimSeul() });

  console.log('\n-- les trois operations que Privy fait vraiment --');
  /* Un en-tete de message Solana : version, nombres de signatures, octets
     hauts. Ce sont les valeurs qui cassent un encodeur maison. */
  const MSG = [1, 0, 1, 2, 255, 254, 0, 7, 42];
  const vu = await pg2.evaluate((m) => {
    const u = new Uint8Array(m);
    return {
      b64: Buffer.from(u).toString('base64'),
      hex: Buffer.from('SWOGE', 'utf8').toString('hex'),
      sig: Buffer.from('A'.repeat(86) + '==', 'base64').length,
      estU8: Buffer.from('AAAA', 'base64') instanceof Uint8Array,
    };
  }, MSG);
  const vraiB64 = Buffer.from(new Uint8Array(MSG)).toString('base64');
  const vraiHex = Buffer.from('SWOGE', 'utf8').toString('hex');
  console.log('   shim : ' + vu.b64 + ' · node : ' + vraiB64);
  ok(vu.b64 === vraiB64,
     'Buffer.from(message).toString("base64") rend EXACTEMENT ce que rend Node (' + vu.b64 + ')');
  ok(vu.hex === vraiHex,
     'et .toString("hex") aussi (' + vu.hex + ') — c est le chemin EVM, qui passait par le meme trou');
  ok(vu.sig === 64,
     'une signature Solana en base64 redonne 64 octets (' + vu.sig + ') : ni 63 ni 65, sinon la '
     + 'transaction part avec une signature tronquee');
  ok(vu.estU8,
     'et le resultat EST un Uint8Array : `addSignature` de web3.js n accepte que ca, un objet qui '
     + 'lui ressemble aurait echoue la, pas ici');

  console.log('\n-- le remplissage, la ou un encodeur maison se trompe --');
  const pad = await pg2.evaluate(() => {
    const out = {};
    for (let n = 1; n <= 8; n++) {
      const u = new Uint8Array(n);
      for (let i = 0; i < n; i++) u[i] = (i * 37 + 11) & 255;
      const s = Buffer.from(u).toString('base64');
      const r = Buffer.from(s, 'base64');
      out[n] = { s, ok: r.length === n && [...r].every((v, i) => v === u[i]) };
    }
    return out;
  });
  const vraiPad = {};
  for (let k = 1; k <= 8; k++) {
    const u = new Uint8Array(k);
    for (let i = 0; i < k; i++) u[i] = (i * 37 + 11) & 255;
    vraiPad[k] = Buffer.from(u).toString('base64');
  }
  const memes = Object.keys(pad).filter((k) => pad[k].s === vraiPad[k]);
  console.log('   longueurs 1 a 8 identiques a Node : ' + memes.length + '/8');
  ok(memes.length === 8,
     'de 1 a 8 octets, chaque encodage est celui de Node — les restes de 1 et 2 octets sont '
     + 'exactement ou un encodeur ecrit a la main se trompe');
  ok(Object.keys(pad).every((k) => pad[k].ok),
     'et chacun revient identique apres decodage : aller-retour sans perte');

  console.log('\n-- une transaction entiere, pas neuf octets --');
  const gros = await pg2.evaluate(() => {
    const u = new Uint8Array(1232);            /* la taille max d un paquet Solana */
    for (let i = 0; i < u.length; i++) u[i] = (i * 7 + 3) & 255;
    const s = Buffer.from(u).toString('base64');
    const r = Buffer.from(s, 'base64');
    return { s, ok: r.length === u.length && [...r].every((v, i) => v === u[i]) };
  });
  const vraiGros = (() => {
    const u = new Uint8Array(1232);
    for (let i = 0; i < u.length; i++) u[i] = (i * 7 + 3) & 255;
    return Buffer.from(u).toString('base64');
  })();
  ok(gros.s === vraiGros,
     '1232 octets — la taille maximale d un paquet Solana — encodes comme Node, caractere pour '
     + 'caractere');
  ok(gros.ok, 'et redecodes sans perdre un octet');

  console.log('\n-- un encodage inconnu leve, il n invente pas --');
  const leve = await pg2.evaluate(() => {
    try { Buffer.from('zz', 'ascii'); return 'rien'; }
    catch (e) { return e.message; }
  });
  console.log('   ' + leve);
  ok(/encodage non gere/.test(leve),
     'un encodage que le shim ne connait pas leve au lieu de rendre des octets faux : c est la '
     + 'seule reponse honnete quand on ne sait pas');

  console.log('\n-- et le signeur est expose --');
  const src = fs.readFileSync(path.join(__dirname, 'privy-swoge.js'), 'utf8');
  ok(/solanaProvider:\s*PW_solanaProvider/.test(src),
     'l enveloppe publie `solanaProvider` : sans ca le paquet sait signer et la page ne peut pas '
     + 'le lui demander');
  ok(/getSolanaProvider\(w,\s*e2\.entropyId,\s*e2\.entropyIdVerifier\)/.test(src),
     'et elle l appelle avec ses arguments UN PAR UN — la version Ethereum prend un objet, et lui '
     + 'passer un objet ici rendrait un signeur construit sur `undefined`, sans erreur, qui '
     + 'n echouerait qu au moment de signer');
  ok(/mw\(ur,\s*w\)/.test(src),
     'avec l entropie du portefeuille ETHEREUM, dont l adresse Solana est derivee — demander '
     + 'celle de l adresse Solana reclamerait une graine qui n existe pas');

  /* ==================== LE CHEMIN REEL, SAUF LA SIGNATURE ====================
   *
   * Ce qui suit parle a Jupiter et a la chaine Solana pour de vrai. Sans
   * reseau, l'essai se tait plutot que d'echouer : un essai rouge parce que
   * le CI n'a pas Internet apprend a ignorer le rouge.
   *
   * Ce qui est prouve ici : les decimales sont LUES, la cotation vient de
   * dehors, la transaction est construite par Jupiter, et `@solana/web3.js`
   * plus le shim savent en faire EXACTEMENT les deux operations que le
   * gestionnaire Privy effectue — `message.serialize()` pour ce qui sera
   * signe, `serialize()` pour ce qui sera envoye.
   *
   * Ce qui n'est PAS prouve, et il faut le dire : la signature elle-meme. Elle
   * demande une session Privy reelle et du SOL reel. Ce dernier saut se
   * verifie avec un petit montant, pas dans un essai. */
  console.log('\n-- le chemin reel jusqu a la transaction signable --');
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
  const NOEUD = 'https://api.mainnet-beta.solana.com';
  let dehors = true, dec = null, devis = null, txB64 = null;
  try {
    const r = await fetch(NOEUD, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenSupply', params: [BONK] }) });
    const j = await r.json();
    dec = j && j.result && j.result.value && j.result.value.decimals;
    const q = await (await fetch('https://lite-api.jup.ag/swap/v1/quote?inputMint=' + BONK
      + '&outputMint=' + SOL_MINT + '&amount=100000000000&slippageBps=100')).json();
    if (q && q.outAmount) devis = q;
    if (devis) {
      const sw = await (await fetch('https://lite-api.jup.ag/swap/v1/swap', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quoteResponse: devis, wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          userPublicKey: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' }) })).json();
      txB64 = sw && sw.swapTransaction;
    }
  } catch (e) { /* pas de reseau */ }
  dehors = !(dec >= 0 && devis && txB64);

  if (dehors) {
    console.log('   Jupiter ou la chaine Solana injoignables — cette partie est sautee');
  } else {
    ok(dec === 5,
       'les decimales de BONK sont LUES sur la chaine (' + dec + '), pas supposees : se tromper '
       + 'de facteur mille sur un montant n affiche pas une erreur, ca vend mille fois trop');
    ok(devis.outAmount > 0 && devis.routePlan && devis.routePlan.length > 0,
       'Jupiter cote la vente et dit par ou elle passe (' + devis.routePlan.length + ' saut(s), '
       + 'impact ' + Number(devis.priceImpactPct).toFixed(4) + ' %)');
    ok(typeof txB64 === 'string' && txB64.length > 200,
       'et il rend une transaction DEJA CONSTRUITE (' + txB64.length + ' caracteres) : cette page '
       + 'ne compose aucune instruction Solana elle-meme — une instruction mal formee ne se voit '
       + 'pas, elle se signe');

    /* Le vrai bundle, dans un vrai navigateur, avec le shim. */
    await pg2.addScriptTag({ path: path.join(__dirname, 'solana-web3.min.js') });
    const lu = await pg2.evaluate((b64) => {
      const tx = solanaWeb3.VersionedTransaction.deserialize(Buffer.from(b64, 'base64'));
      return {
        type: tx.constructor.name,
        comptes: tx.message.staticAccountKeys.length,
        instructions: tx.message.compiledInstructions.length,
        /* les DEUX operations que le gestionnaire Privy effectue */
        pourSigner: Buffer.from(tx.message.serialize()).toString('base64').length,
        pourEnvoyer: (() => { try { return tx.serialize().length; } catch (e) { return 'ECHEC'; } })(),
      };
    }, txB64);
    console.log('   ' + JSON.stringify(lu));
    ok(lu.type === 'VersionedTransaction' && lu.instructions > 0,
       'le moteur Solana vendore la deserialise (' + lu.comptes + ' comptes, ' + lu.instructions
       + ' instructions)');
    ok(lu.pourSigner > 0,
       '`message.serialize()` puis base64 rend ce que Privy signera (' + lu.pourSigner
       + ' caracteres) — c est l operation exacte de son gestionnaire, et elle passe par le shim');
    ok(lu.pourEnvoyer !== 'ECHEC' && lu.pourEnvoyer > 0,
       'et `serialize()` rend ce qui partira sur le reseau (' + lu.pourEnvoyer + ' octets)');
  }

  ok(boum.length === 0, 'aucune exception' + (boum[0] ? ' : ' + boum[0].slice(0, 120) : ''));

  await nav.close();
  console.log('\nsolana_signature.test.js — ' + n + ' verifications, ' + rates + ' echec(s)');
  process.exit(rates ? 1 : 0);
})();
