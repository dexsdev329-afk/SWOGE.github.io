'use strict';
/* ============================================================================
 * ACHETER ET VENDRE UN JETON SWOGE V5 DEPUIS SA FICHE (18/10/2026)
 *
 * Le defaut : « Failed · execution reverted: unknown » en achetant SWAI, le
 * premier jeton V5, sur launchpad.html. La boite envoyait l'ordre au routeur
 * Uniswap v3 ; un jeton V5 vit dans un pool Uniswap v4 a hook.
 *
 * Contre un fork anvil LOCAL du reseau principal au bloc courant — le VRAI
 * noyau V5, le VRAI pool de SWAI — avec un compte NEUF impersonne (pas les
 * comptes par defaut d'anvil : delegation EIP-7702 vers un balayeur d'ETH sur
 * cette chaine, voir outils/banc_v5.js) :
 *   A. le module seul : constantes du routeur, encodage, erreurs du hook et
 *      du noyau toutes connues, revert reel decode ;
 *   B. la fiche de SWAI : achat de 0,001 ETH (solde > 0, ≥ minimum, = devis
 *      affiche), vente de la moitie (ETH recu, ≥ minimum), frais et route ;
 *   C. le portefeuille : SWAI dans les avoirs du compte, et SWAI dans « crees »
 *      pour le proprietaire 0xb67A…F346, avec ses frais de createur ;
 *   D. un lancement V5 cote en action (CRWD) sur le fork, achete en CRWD
 *      (Permit2) puis revendu.
 * Aucune transaction n'est signee ni envoyee sur une chaine reelle.
 * ==========================================================================*/
const fs = require('fs'), path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let ethers = null; try { ethers = require('ethers').ethers; } catch (e) {}
const banc = require('./outils/banc_v5.js');
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const SITE = __dirname, SERVEUR = path.join(__dirname, '..', 'swoge-pusher-server.github.io');
const J = JSON.parse(fs.readFileSync(path.join(SITE, 'contrats/v5/adresses_v5.json'), 'utf8'));
const ART = JSON.parse(fs.readFileSync(path.join(SITE, 'contrats/v5/build/v5_artefacts.json'), 'utf8'));
const COT = JSON.parse(fs.readFileSync(path.join(SITE, 'contrats/v5/script/cotations_v5.json'), 'utf8'));
const SWAI = '0x83aB87625404B63f27d8289b9E50fFd3ED2F5d22';
const PROPRIO = '0xb67A60ed9B69A85183f47ef4Ff144615F04Ef346';

(async () => {
  const ETHERS = banc.ethersUmd(SERVEUR);
  if (!chromium || !ethers || !ETHERS) { console.log('  RATE playwright ou ethers absent — essai impossible'); process.exit(1); }
  const u = ethers.utils;
  const M = require('./echange_v5.js'); M.ethers = ethers; const X = M.SwogeV5Echange;

  console.log('-- A. le module, sans chaine --');
  ok(X.V4_SWAP === '0x10' && X.ACTES === '0x060c0f', 'V4_SWAP = 0x10 ; SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL = 06 0c 0f');
  {
    const connus = new Set(new u.Interface(X.ERREURS).fragments.map((f) => u.id(f.format('sighash')).slice(0, 10)));
    const manque = [];
    for (const nom of ['SwogeHookV5', 'SwogeLaunchpadV5']) for (const f of new u.Interface(ART.contrats[nom].abi).fragments.filter((x) => x.type === 'error'))
      if (!connus.has(u.id(f.format('sighash')).slice(0, 10))) manque.push(nom + '.' + f.name);
    ok(manque.length === 0, 'chaque erreur du hook et du noyau (artefacts) est decodee par la page' + (manque.length ? ' — manque ' + manque.join(', ') : ''));
    const I5 = { cle: [ethers.constants.AddressZero, SWAI, 0, 200, J.hook], quoteIs0: true, quote: ethers.constants.AddressZero, token: SWAI, natif: true, dec: 18 };
    const A = u.defaultAbiCoder, [actes, params] = A.decode(['bytes', 'bytes[]'], X.corps(I5, true, 1000, 900));
    const sw = A.decode(['((address,address,uint24,int24,address),bool,uint128,uint128,uint256,bytes)'], params[0])[0];
    ok(actes === '0x060c0f' && sw[1] === true && sw[2].eq(1000) && sw[3].eq(900) && sw[0][4] === J.hook && sw[0][3] === 200,
      'achat : zeroForOne (ETH = currency0), entree 1000, minimum 900, cle du hook V5, tickSpacing 200');
    const st = A.decode(['address', 'uint256'], params[1]), tk = A.decode(['address', 'uint256'], params[2]);
    ok(st[0] === ethers.constants.AddressZero && st[1].eq(1000) && tk[0] === SWAI && tk[1].eq(900), 'SETTLE_ALL(ETH, 1000) puis TAKE_ALL(SWAI, 900)');
    const o = X.ordre(I5, true, 1000, 900, 123), ov = X.ordre(I5, false, 1000, 900, 123);
    ok(o.to === X.ADR.ROUTEUR && o.value.eq(1000) && ov.value.eq(0), 'achat en ETH : msg.value = entree ; vente : aucune valeur');
    // un revert du hook tel que le routeur le rend : ExecutionFailed(0, WrappedError(hook, beforeSwap, MaxBuyPerSwap(..), ..))
    const ie = new u.Interface(X.ERREURS), interne = ie.encodeErrorResult('MaxBuyPerSwap', [u.parseEther('2000000'), u.parseEther('1000000')]);
    const enrobe = ie.encodeErrorResult('ExecutionFailed', [0, ie.encodeErrorResult('WrappedError', [J.hook, '0x575e24b4', interne, '0x'])]);
    const t = X.decode(enrobe);
    ok(/launch limit per trade/.test(t) && /2,000,000/.test(t) && /1,000,000/.test(t), 'un MaxBuyPerSwap enrobe par le PoolManager et le routeur se lit : « ' + t.slice(0, 70) + '… »');
    ok(/Cancelled in the wallet/.test(X.raison({ code: 4001, message: 'User rejected the request.' })), 'un refus dans le portefeuille se dit comme tel');
  }

  let nav = null, fork = null;
  try {
    fork = await banc.anvil();
    const P = new ethers.providers.JsonRpcProvider(fork.url, 4663);
    const bloc = await P.getBlockNumber();
    console.log('\n-- fork anvil local du reseau principal, bloc ' + bloc + ' (PID ' + fork.pid + ') --');
    for (const [nom, a] of Object.entries(X.ADR)) ok((await P.getCode(a)).length > 1000, nom + ' ' + a + ' : du code sur la chaine');
    for (const nom of ['ROUTEUR', 'QUOTEUR', 'ETAT']) {
      const pm = await new ethers.Contract(X.ADR[nom], ['function poolManager() view returns (address)'], P).poolManager();
      ok(pm === J.poolManager, nom + '.poolManager() = le PoolManager de V5');
    }
    const core = new ethers.Contract(J.core, ART.contrats.SwogeLaunchpadV5.abi, P);
    const ti = await core.getTokenInfo(SWAI);
    ok(ti.exists && ti.quote === ethers.constants.AddressZero && ti.creator === PROPRIO, 'SWAI : jeton V5, cote en ETH, cree par ' + PROPRIO);
    /* le module lit contrats/v5/adresses_v5.json par fetch : dans Node, le fichier du depot */
    global.fetch = ((f) => async (url, o) => (String(url).endsWith('adresses_v5.json') ? { ok: true, json: async () => J } : f(url, o)))(global.fetch);
    X.initialise({ lecteur: P });

    /* un revert reel : minimum = devis + 1 % */
    {
      const I = await X.info(SWAI), amt = u.parseEther('0.001'), q = await X.devis(I, true, amt);
      const MOI0 = await banc.compteNeuf(fork, ethers, 1), dl = (await P.getBlock('latest')).timestamp + 600;
      const tx = X.ordre(I, true, amt, q.mul(101).div(100), dl);
      const brut = await P.call({ from: MOI0, to: tx.to, data: tx.data, value: tx.value }).catch(() => null);
      ok(brut && brut.startsWith('0x8b063d73'), 'ethers 5 REND les octets du revert sans lever (V4TooLittleReceived = 0x8b063d73) : la page doit les lire elle-meme');
      let msg = null; try { await X.simule({ from: MOI0, to: tx.to, data: tx.data, value: tx.value }, I, true, true); } catch (e) { msg = e.message; }
      ok(msg && /The price moved/.test(msg), 'la simulation de la page leve et decode ce revert reel : « ' + String(msg).slice(0, 80) + ' »');
    }

    nav = await chromium.launch();
    const ouvre = async (compte, chemin) => {
      const srv = await banc.serveur(SITE);
      const ctx = await nav.newContext({ viewport: { width: 1280, height: 1000 } });
      await banc.routes(ctx, fork, ETHERS, { sansJournaux: true, journauxDe: [J.core, J.poolManager] });
      const journal = await banc.portefeuille(ctx, fork, compte);
      const pg = await ctx.newPage(), erreurs = [];
      pg.on('pageerror', (e) => erreurs.push(String(e.message || e)));
      await pg.goto(srv.base + chemin, { waitUntil: 'load' });
      return { pg, ctx, srv, erreurs, journal };
    };
    const connecte = async (pg, compte) => {
      await pg.click('#walletBtn');
      await pg.click('#wpickList .wrow:has-text("Browser wallet")');
      await pg.waitForFunction((m) => (document.querySelector('#walletBtn').textContent || '').toLowerCase().startsWith(m.slice(0, 6).toLowerCase()), compte, { timeout: 20000 }).catch(() => {});
      return (await pg.textContent('#walletBtn')).toLowerCase().startsWith(compte.slice(0, 6).toLowerCase());
    };
    const attendNote = (pg, re) => pg.waitForFunction((s) => new RegExp(s).test(document.querySelector('#tradeNote').textContent), re, { timeout: 180000 }).catch(() => {});
    const erc = (a) => new ethers.Contract(a, ['function balanceOf(address) view returns (uint256)'], P);

    console.log('\n-- B. la fiche de SWAI : acheter 0,001 ETH, revendre la moitie --');
    const MOI = await banc.compteNeuf(fork, ethers, 5);
    const B = await ouvre(MOI, '/launchpad.html?token=' + SWAI);
    const pg = B.pg;
    await pg.waitForFunction(() => /SWOGE V5 hook/.test(document.querySelector('#bbRoute').textContent), null, { timeout: 60000 }).catch(() => {});
    ok((await pg.textContent('#bbRoute')) === 'Uniswap v4 · SWOGE V5 hook', 'route : « ' + (await pg.textContent('#bbRoute')) + ' »');
    await pg.waitForFunction(() => /SWAI/.test(document.querySelector('#tvSym').textContent), null, { timeout: 30000 }).catch(() => {});
    ok(/\$SWAI/.test(await pg.textContent('#tvSym')) && /SWOGE AI/.test(await pg.textContent('#tvName')), 'la fiche s ouvre : ' + (await pg.textContent('#tvName')) + ' ' + (await pg.textContent('#tvSym')));
    ok(/Uniswap v4/.test(await pg.textContent('#tvBadge')), 'badge : ' + (await pg.textContent('#tvBadge')));
    await pg.waitForFunction(() => /buy\s*1\.00%/.test(document.querySelector('#bbFee').textContent), null, { timeout: 30000 }).catch(() => {});
    const f0 = await core.currentFees(SWAI);
    ok(new RegExp('buy\\s*' + (f0.buyBps / 100).toFixed(2) + '%.*sell\\s*' + (f0.sellBps / 100).toFixed(2) + '%').test(await pg.textContent('#bbFee')),
      'Details : frais du hook = currentFees (achat ' + f0.buyBps + ' pb, vente ' + f0.sellBps + ' pb) — ' + (await pg.textContent('#bbFee')).slice(0, 60));
    ok(await connecte(pg, MOI), 'portefeuille connecte : compte neuf impersonne ' + MOI);
    await pg.fill('#buyEth', '0.001');
    await pg.waitForFunction(() => document.querySelector('#buyOut').getAttribute('data-v'), null, { timeout: 30000 }).catch(() => {});
    const I = await X.info(SWAI), qAchat = await X.devis(I, true, u.parseEther('0.001'));
    const montre = +(await pg.getAttribute('#buyOut', 'data-v'));
    ok(Math.abs(montre / +u.formatEther(qAchat) - 1) < 1e-9, 'le devis montre (' + montre + ') = V4Quoter (' + u.formatEther(qAchat) + ')');
    ok(/V4Quoter/.test(await pg.textContent('#buyQuote')), 'source du devis : ' + (await pg.textContent('#buyQuote')).slice(0, 70));
    await pg.click('#buyBtn');
    await attendNote(pg, 'Bought|Failed');
    const noteA = await pg.textContent('#tradeNote');
    ok(/Bought/.test(noteA), 'achat : ' + noteA.slice(0, 120));
    const solde = await erc(SWAI).balanceOf(MOI);
    const recuA = ethers.BigNumber.from((await pg.getAttribute('#tradeNote', 'data-recu')) || '0'), miniA = ethers.BigNumber.from((await pg.getAttribute('#tradeNote', 'data-mini')) || '0');
    const devisA = ethers.BigNumber.from((await pg.getAttribute('#tradeNote', 'data-devis')) || '0');
    ok(solde.gt(0) && solde.gte(miniA) && solde.eq(recuA), 'solde SWAI ' + u.formatEther(solde) + ' > 0, ≥ minimum ' + u.formatEther(miniA) + ', = recu affiche');
    ok(devisA.gt(0) && Math.abs(+u.formatEther(solde) / +u.formatEther(devisA) - 1) < 0.005, 'devis ≈ execute : ' + u.formatEther(devisA) + ' devis, ' + u.formatEther(solde) + ' recus');
    ok(B.journal.filter((m) => m === 'eth_sendTransaction').length === 1, 'achat en ETH natif : UNE signature, aucune autorisation');

    await pg.click('#tvTradePanel [data-dir="sell"]');
    const moitie = solde.div(2);
    await pg.fill('#sellTok', u.formatEther(moitie));
    await pg.waitForFunction(() => document.querySelector('#sellOut').getAttribute('data-v'), null, { timeout: 30000 }).catch(() => {});
    const qVente = await X.devis(I, false, moitie);
    ok(Math.abs(+(await pg.getAttribute('#sellOut', 'data-v')) / +u.formatEther(qVente) - 1) < 1e-9, 'devis de vente montre = V4Quoter : ' + u.formatEther(qVente) + ' ETH');
    const eth0 = await P.getBalance(MOI);
    await pg.click('#sellBtn');
    await attendNote(pg, 'Sold|Failed');
    const noteV = await pg.textContent('#tradeNote');
    ok(/Sold/.test(noteV), 'vente : ' + noteV.slice(0, 120));
    const recuV = ethers.BigNumber.from((await pg.getAttribute('#tradeNote', 'data-recu')) || '0'), miniV = ethers.BigNumber.from((await pg.getAttribute('#tradeNote', 'data-mini')) || '0');
    const eth1 = await P.getBalance(MOI);
    ok(recuV.gt(0) && recuV.gte(miniV), 'ETH recu ' + u.formatEther(recuV) + ' > 0 et ≥ minimum ' + u.formatEther(miniV));
    ok(Math.abs(+u.formatEther(recuV) / +u.formatEther(qVente) - 1) < 0.005, 'devis ≈ execute a la vente : ' + u.formatEther(qVente) + ' devis, ' + u.formatEther(recuV) + ' recus');
    ok(eth1.gt(eth0), 'le solde ETH du compte monte apres la vente (gaz paye)');
    ok((await erc(SWAI).balanceOf(MOI)).eq(solde.sub(moitie)), 'il reste exactement l autre moitie');
    const envois = B.journal.filter((m) => m === 'eth_sendTransaction').length;
    ok(envois === 4, 'vente : approve(Permit2), Permit2.approve(routeur), l echange — ' + envois + ' signatures en tout');
    await pg.waitForFunction(() => document.querySelectorAll('#tvTrades tr.moi').length >= 2, null, { timeout: 30000 }).catch(() => {});
    const lignesMoi = await pg.$$eval('#tvTrades tr.moi', (l) => l.map((r) => r.querySelector('.side').textContent).join(','));
    ok(/BUY/.test(lignesMoi) && /SELL/.test(lignesMoi), 'les deux echanges sont lus dans les Swap du PoolManager, au nom du compte (liste : ' + lignesMoi + ')');

    console.log('\n-- C. le portefeuille --');
    await pg.click('.tab[data-tab="mine"]');
    await pg.waitForFunction(() => /Your holdings/.test(document.querySelector('#mineList').textContent), null, { timeout: 120000 }).catch(() => {});
    const avoirs = await pg.$eval('#mineList', (e) => e.innerText);
    ok(/SWOGE AI/.test(avoirs) && /\$SWAI/.test(avoirs) && /V5/.test(avoirs), 'SWAI apparait dans les avoirs du compte, avec le badge V5');
    ok(B.erreurs.length === 0, 'aucune erreur JS sur la fiche et le portefeuille' + (B.erreurs.length ? ' : ' + B.erreurs.join(' | ') : ''));
    await B.ctx.close(); B.srv.close();

    const C = await ouvre(PROPRIO, '/launchpad.html');
    ok(await connecte(C.pg, PROPRIO), 'le portefeuille du proprietaire (lecture seule) : ' + PROPRIO);
    await C.pg.click('.tab[data-tab="mine"]');
    await C.pg.waitForFunction(() => document.querySelector('[data-v5card]'), null, { timeout: 120000 }).catch(() => {});
    const carte = await C.pg.$eval('[data-v5card]', (e) => e.getAttribute('data-v5card') + '|' + e.innerText).catch(() => '');
    ok(carte.toLowerCase().startsWith(SWAI.toLowerCase()) && /SWOGE AI/.test(carte) && /V5/.test(carte), 'SWAI apparait dans « Tokens you created », badge V5');
    const fc = await X.fraisCreateur(I);
    ok(fc.attente.gt(0), 'apres les deux echanges du fork, le seau createur du hook n est pas vide : ' + u.formatEther(fc.attente) + ' ETH pour le createur');
    ok(/Waiting in the hook/.test(carte) && /Distribute/.test(carte), 'la carte montre les frais en attente et le bouton Distribute');
    ok(C.journal.filter((m) => m === 'eth_sendTransaction').length === 0, 'rien n est envoye depuis le portefeuille du proprietaire');
    ok(C.erreurs.length === 0, 'aucune erreur JS' + (C.erreurs.length ? ' : ' + C.erreurs.join(' | ') : ''));
    await C.ctx.close(); C.srv.close();

    console.log('\n-- D. un jeton V5 cote en action (CRWD), lance sur le fork --');
    const iC = COT.symbols.indexOf('CRWD'), CRWD = COT.addresses[iC];
    ok((await core.quotes())[iC] === u.getAddress(CRWD), 'le noyau deploye cote CRWD a l indice ' + iC);
    const BASE = '0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00';   // ERC-7201 openzeppelin.storage.ERC20 (launchpad_v5.test.js)
    const LANCEUR = await banc.compteNeuf(fork, ethers, 1), ACHETEUR = await banc.compteNeuf(fork, ethers, 1);
    await fork.rpc('anvil_setStorageAt', [CRWD, u.keccak256(u.defaultAbiCoder.encode(['address', 'bytes32'], [ACHETEUR, BASE])), u.hexZeroPad(u.parseEther('10').toHexString(), 32)]);
    ok((await erc(CRWD).balanceOf(ACHETEUR)).eq(u.parseEther('10')), 'l acheteur detient 10 jetons CRWD bruts sur le fork');
    const cw = core.connect(P.getSigner(LANCEUR)), fee = await core.launchFeeWei();
    const tup = ['Crowd Fork', 'CRF', u.hexlify(u.randomBytes(32)), ['', '', '', '', ''], iC, 0, 0, 0, [10000, 0, 0, 0], [0, 0], [0, 0, 0],
      [0, 0, 0, 0, ethers.constants.HashZero, 0], LANCEUR, 0, 0];
    const rc = await (await cw.createToken(tup, { value: fee, gasLimit: 3000000 })).wait();
    const ev = rc.logs.map((l) => { try { return core.interface.parseLog(l); } catch (e) { return null; } }).find((x) => x && x.name === 'LaunchedV5');
    ok(rc.status === 1 && !!ev, 'lance sur le VRAI noyau du fork : ' + (ev && ev.args.token));
    const T2 = ev.args.token;
    const D = await ouvre(ACHETEUR, '/launchpad.html?token=' + T2);
    await D.pg.waitForFunction(() => /SWOGE V5 hook/.test(document.querySelector('#bbRoute').textContent), null, { timeout: 60000 }).catch(() => {});
    ok(/SWOGE V5 hook/.test(await D.pg.textContent('#bbRoute')), 'la fiche du jeton cote en CRWD est en route v4');
    ok(await connecte(D.pg, ACHETEUR), 'acheteur connecte');
    await D.pg.waitForFunction(() => /CRWD/.test(document.querySelector('#bbBalQ').textContent), null, { timeout: 20000 }).catch(() => {});
    ok(/10 CRWD/.test(await D.pg.textContent('#bbBalQ')), 'solde de cotation : ' + (await D.pg.textContent('#bbBalQ')));
    await D.pg.fill('#buyEth', '1');
    await D.pg.waitForFunction(() => document.querySelector('#buyOut').getAttribute('data-v'), null, { timeout: 30000 }).catch(() => {});
    await D.pg.click('#buyBtn');
    await attendNote(D.pg, 'Bought|Failed');
    const noteC = await D.pg.textContent('#tradeNote');
    ok(/Bought/.test(noteC), 'achat en CRWD : ' + noteC.slice(0, 120));
    const s2 = await erc(T2).balanceOf(ACHETEUR), mini2 = ethers.BigNumber.from((await D.pg.getAttribute('#tradeNote', 'data-mini')) || '0');
    ok(s2.gt(0) && s2.gte(mini2) && (await erc(CRWD).balanceOf(ACHETEUR)).eq(u.parseEther('9')), 'jetons recus ' + u.formatEther(s2) + ' ≥ minimum ; 1 CRWD preleve (10 → 9)');
    ok(D.journal.filter((m) => m === 'eth_sendTransaction').length === 3, 'achat ERC-20 : approve(Permit2), Permit2.approve(routeur), l echange');
    await D.pg.click('#tvTradePanel [data-dir="sell"]');
    await D.pg.fill('#sellTok', u.formatEther(s2.div(2)));
    await D.pg.waitForFunction(() => document.querySelector('#sellOut').getAttribute('data-v'), null, { timeout: 30000 }).catch(() => {});
    await D.pg.click('#sellBtn');
    await attendNote(D.pg, 'Sold|Failed');
    const noteD = await D.pg.textContent('#tradeNote');
    ok(/Sold/.test(noteD), 'vente contre CRWD : ' + noteD.slice(0, 120));
    const c2 = await erc(CRWD).balanceOf(ACHETEUR);
    ok(c2.gt(u.parseEther('9')), 'CRWD recu a la vente : ' + u.formatEther(c2.sub(u.parseEther('9'))));
    ok(D.erreurs.length === 0, 'aucune erreur JS' + (D.erreurs.length ? ' : ' + D.erreurs.join(' | ') : ''));
    await D.ctx.close(); D.srv.close();
  } catch (e) {
    ok(false, 'exception : ' + (e && e.stack || e));
  } finally {
    if (nav) await nav.close().catch(() => {});
    if (fork) fork.stop();
  }
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'echange_v5.test.js : ' + n + ' verifications OK'));
  process.exit(rates ? 1 : 0);
})();
