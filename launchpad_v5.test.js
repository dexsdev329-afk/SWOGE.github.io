'use strict';
/* ============================================================================
 * LA SECTION V5 DE launchpad.html (18/10/2026)
 *
 *   A. Sans contrats/v5/adresses_v5.json (le depot aujourd'hui) : « V5 coming
 *      soon », rien d'autre n'est lu, et le formulaire V4 est celui d'avant
 *      (memes quatre choix de pool, meme bouton). Un fichier invalide ou qui
 *      ne correspond pas a la chaine laisse aussi la section eteinte.
 *   B. Avec un adresses_v5.json qui designe un deploiement sur fork anvil
 *      LOCAL : chaque borne de la page est celle du contrat (meme refus, meme
 *      message, verifie contre le noyau par callStatic), puis deux lancements
 *      de bout en bout, signes par un compte neuf impersonne dans anvil :
 *        - en ETH, avec achat initial, taxe, anti-snipe et LADDER3 ;
 *        - en CRWD (action Robinhood, uiMultiplier = 4), achat initial SAISI
 *          EN ACTIONS : le contrat preleve actions / 4 jetons bruts.
 *      Apres chaque lancement : lien vers la fiche, DexScreener, currentFees.
 * Aucune transaction n'est signee ni envoyee sur une chaine reelle.
 * ==========================================================================*/
const fs = require('fs'), path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let ethers = null; try { ethers = require('ethers').ethers; } catch (e) {}
const banc = require('./outils/banc_v5.js');
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const SITE = __dirname, SERVEUR = path.join(__dirname, '..', 'swoge-pusher-server.github.io');
const COT = JSON.parse(fs.readFileSync(path.join(SITE, 'contrats/v5/script/cotations_v5.json'), 'utf8'));
const ART = JSON.parse(fs.readFileSync(path.join(SITE, 'contrats/v5/build/v5_artefacts.json'), 'utf8'));
const ADR = '/contrats/v5/adresses_v5.json';

(async () => {
  const ETHERS = banc.ethersUmd(SERVEUR);
  if (!chromium || !ethers || !ETHERS) { console.log('  RATE playwright ou ethers absent — essai impossible'); process.exit(1); }
  const u = ethers.utils;
  let nav = null, fork = null;
  const ouvre = async (remplace, avecFork, compte) => {
    const srv = await banc.serveur(SITE, remplace);
    const ctx = await nav.newContext({ viewport: { width: 1200, height: 900 } });
    const lus = [];
    ctx.on('request', (q) => lus.push(q.url()));
    let journal = [];
    if (avecFork) { await banc.routes(ctx, fork, ETHERS, { sansJournaux: true }); journal = await banc.portefeuille(ctx, fork, compte); }
    else {
      await ctx.route('https://**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
      await ctx.route('**/ethers*.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(ETHERS) }));
    }
    const pg = await ctx.newPage(), erreurs = [];
    pg.on('pageerror', (e) => erreurs.push(String(e.message || e)));
    await pg.goto(srv.base + '/launchpad.html', { waitUntil: 'load' });
    return { pg, ctx, srv, lus, erreurs, journal };
  };
  try {
    nav = await chromium.launch();

    console.log('-- A. sans adresses_v5.json : la section est eteinte --');
    ok(!fs.existsSync(path.join(SITE, 'contrats/v5/adresses_v5.json')), 'le depot ne porte pas encore de contrats/v5/adresses_v5.json');
    {
      const A = await ouvre(null, false);
      await A.pg.waitForFunction(() => /coming soon/i.test((document.querySelector('#v5Panel') || {}).textContent || ''), null, { timeout: 10000 }).catch(() => {});
      const t = await A.pg.textContent('#v5Panel');
      ok(/V5 coming soon/.test(t), 'la section V5 dit « V5 coming soon »');
      ok(!(await A.pg.$('#v5Lancer')) && !(await A.pg.$('#v5QListe')), 'aucun formulaire V5, aucun bouton V5');
      ok(A.lus.some((x) => x.endsWith(ADR)) && !A.lus.some((x) => /cotations_v5\.json/.test(x)), 'elle ne lit que adresses_v5.json (404), pas la liste des cotations');
      const pools = await A.pg.$$eval('.lp-pool', (bs) => bs.map((b) => b.dataset.pool).join(','));
      ok(pools === 'eth,agent,swoge,solana', 'le formulaire V4 est intact : ' + pools);
      ok(/Launch on Uniswap/.test(await A.pg.textContent('#createBtn')), 'le bouton V4 est le meme');
      const ordre = await A.pg.evaluate(() => { const c = document.querySelector('#tab-create'); const k = [...c.children].map((e) => e.id || e.className); return k.join('|'); });
      ok(/panel\|v5Panel$/.test(ordre), 'la section V5 vient APRES le panneau V4 (' + ordre + ')');
      ok(A.erreurs.length === 0, 'aucune erreur JS' + (A.erreurs.length ? ' : ' + A.erreurs.join(' | ') : ''));
      await A.ctx.close(); A.srv.close();
    }
    for (const [nom, contenu] of [['invalide (pas du JSON)', 'not json'], ['sans adresses', JSON.stringify({ version: 'v5', chainId: 4663 })],
      ['mauvaise chaine', JSON.stringify({ version: 'v5', chainId: 1, core: '0x' + '1'.repeat(40), hook: '0x' + '2'.repeat(40), holders: '0x' + '3'.repeat(40), alloc: '0x' + '4'.repeat(40) })]]) {
      const A = await ouvre({ [ADR]: contenu }, false);
      await A.pg.waitForFunction(() => /coming soon/i.test((document.querySelector('#v5Panel') || {}).textContent || ''), null, { timeout: 10000 }).catch(() => {});
      ok(/coming soon/.test(await A.pg.textContent('#v5Panel')) && !(await A.pg.$('#v5Lancer')), 'fichier ' + nom + ' : la section reste eteinte');
      await A.ctx.close(); A.srv.close();
    }

    console.log('\n-- B. fork anvil local, V5 deploye --');
    fork = await banc.anvil();
    const PROPRIO = await banc.compteNeuf(fork, ethers), TRESOR = await banc.compteNeuf(fork, ethers, 0), MOI = await banc.compteNeuf(fork, ethers);
    const J = await banc.deploieV5(fork, ethers, SITE, PROPRIO, TRESOR, '500000000000000');
    ok(true, 'V5 deploye sur le fork (PID anvil ' + fork.pid + ') : noyau ' + J.core);
    const P = new ethers.providers.JsonRpcProvider(fork.url, 4663);
    const coreN = new ethers.Contract(J.core, ART.contrats.SwogeLaunchpadV5.abi, P);

    /* Un fichier dont le hook ne correspond pas au noyau de la chaine : refuse. */
    {
      const A = await ouvre({ [ADR]: JSON.stringify(Object.assign({}, J, { hook: J.holders })) }, true, MOI);
      await A.pg.waitForFunction(() => /coming soon/i.test((document.querySelector('#v5Panel') || {}).textContent || ''), null, { timeout: 20000 }).catch(() => {});
      ok(/does not match/.test(await A.pg.textContent('#v5Panel')) && !(await A.pg.$('#v5Lancer')), 'un hook qui ne correspond pas a getConfig() : section eteinte, avec la raison');
      await A.ctx.close(); A.srv.close();
    }

    const B = await ouvre({ [ADR]: JSON.stringify(J) }, true, MOI);
    const pg = B.pg;
    await pg.waitForSelector('#v5Lancer', { timeout: 30000 }).catch(() => {});
    ok(!!(await pg.$('#v5Lancer')), 'adresses valides et relues sur la chaine : le formulaire V5 s affiche');
    ok(/Launch on Uniswap/.test(await pg.textContent('#createBtn')) && (await pg.$$('.lp-pool')).length === 4, 'et le formulaire V4 est toujours la, inchange');
    ok(new u.Interface(await pg.evaluate(() => window.SwogeV5.ABI_CORE)).getSighash('createToken')
      === new u.Interface(ART.contrats.SwogeLaunchpadV5.abi).getSighash('createToken'), 'le selecteur de createToken de la page = celui de l artefact compile');

    console.log('\n-- la liste des monnaies --');
    const lignes = await pg.$$eval('#v5QListe .v5-q', (l) => l.map((b) => b.querySelector('b').textContent + '|' + b.querySelector('span').textContent));
    ok(lignes.length === 198, '198 monnaies proposees');
    ok(lignes[0].startsWith('ETH|') && lignes[1].startsWith('USDG|') && lignes[2].startsWith('SWOGE|'), 'ETH, USDG, $SWOGE en tete');
    ok(lignes.slice(3).every((l) => /stock token/.test(l)) && /Salesforce/.test(lignes.find((l) => l.startsWith('CRM|')) || ''), 'puis les 195 actions, avec leur nom (CRM = Salesforce)');
    const logos = await pg.$$eval('#v5QListe .v5-q img', (l) => l.map((i) => i.getAttribute('src')));
    ok(logos.filter((s) => s.startsWith('https://cdn.robinhood.com/ncw_assets/logos/0x')).length === 195, 'les 195 logos du registre Robinhood');
    await pg.fill('#v5QRech', 'SpaceX');
    let vus = await pg.$$eval('#v5QListe .v5-q b', (l) => l.map((b) => b.textContent));
    ok(vus.length >= 1 && vus.includes('SPCX'), 'recherche « spacex » : ' + vus.join(', '));
    await pg.fill('#v5QRech', 'nvda');
    vus = await pg.$$eval('#v5QListe .v5-q b', (l) => l.map((b) => b.textContent));
    ok(vus.length === 1 && vus[0] === 'NVDA', 'recherche « nvda » : NVDA seule');
    await pg.fill('#v5QRech', '');

    console.log('\n-- chaque borne de la page = celle du contrat (callStatic sur le fork) --');
    const fee = await coreN.launchFeeWei();
    const base = {
      name: 'Borne', symbol: 'BRN', salt: u.hexlify(u.randomBytes(32)), meta: { description: '', logo: '', website: '', twitter: '', telegram: '' },
      quote: 0, shape: 0, startShift: 0, creatorTaxBps: 0, split: { creator: 10000, stakers: 0, lp: 0, buyback: 0 }, snipe: { startBps: 0, secs: 0 },
      limits: { maxBuyPerSwapBps: 0, maxBuyPerBlockBps: 0, secs: 0 }, alloc: { creatorVestBps: 0, cliff: 0, duration: 0, airdropBps: 0, merkleRoot: ethers.constants.HashZero, claimSecs: 0 },
      feeRecipient: MOI, initialBuy: '0', minTokensOut: '0',
    };
    const D = 86400, mauvais = [
      ['nom de 33 octets', { name: 'x'.repeat(33) }], ['symbole de 11 octets', { symbol: 'ABCDEFGHIJK' }], ['description de 257 octets', { meta: Object.assign({}, base.meta, { description: 'd'.repeat(257) }) }],
      ['monnaie 198', { quote: 198 }], ['forme 2', { shape: 2 }], ['decalage de 100', { startShift: 100 }], ['decalage de 23 200', { startShift: 23200 }],
      ['taxe de 501', { creatorTaxBps: 501 }], ['repartition a 9 999', { split: { creator: 9999, stakers: 0, lp: 0, buyback: 0 } }],
      ['surtaxe de 9 001', { snipe: { startBps: 9001, secs: 10 } }], ['fenetre de 121 s', { snipe: { startBps: 100, secs: 121 } }],
      ['plafond par echange de 49', { limits: { maxBuyPerSwapBps: 49, maxBuyPerBlockBps: 0, secs: 60 } }], ['plafond par seconde de 10 001', { limits: { maxBuyPerSwapBps: 0, maxBuyPerBlockBps: 10001, secs: 60 } }],
      ['limites pendant 3 601 s', { limits: { maxBuyPerSwapBps: 100, maxBuyPerBlockBps: 0, secs: 3601 } }],
      ['vesting de 501', { alloc: Object.assign({}, base.alloc, { creatorVestBps: 501, cliff: 30 * D, duration: 90 * D }) }],
      ['cliff de 29 jours', { alloc: Object.assign({}, base.alloc, { creatorVestBps: 100, cliff: 29 * D, duration: 90 * D }) }],
      ['duree de 731 jours', { alloc: Object.assign({}, base.alloc, { creatorVestBps: 100, cliff: 30 * D, duration: 731 * D }) }],
      ['airdrop sans racine', { alloc: Object.assign({}, base.alloc, { airdropBps: 100, claimSecs: 7 * D }) }],
      ['reclamation de 6 jours', { alloc: Object.assign({}, base.alloc, { airdropBps: 100, merkleRoot: '0x' + '1'.repeat(64), claimSecs: 6 * D }) }],
      ['destinataire nul', { feeRecipient: ethers.constants.AddressZero }], ['achat sans minTokensOut', { initialBuy: '1000', minTokensOut: '0' }],
    ];
    const cfgPage = await pg.evaluate(() => { const c = window.SwogeV5._etat.cfg; return { MAX_START_SHIFT_TICKS: c.MAX_START_SHIFT_TICKS, MAX_CREATOR_TAX_BPS: c.MAX_CREATOR_TAX_BPS,
      MAX_SNIPE_START_BPS: c.MAX_SNIPE_START_BPS, MAX_SNIPE_SECONDS: c.MAX_SNIPE_SECONDS, MAX_LIMIT_SECONDS: c.MAX_LIMIT_SECONDS, MAX_VEST_BPS: c.MAX_VEST_BPS, MAX_AIRDROP_BPS: c.MAX_AIRDROP_BPS }; });
    const tupl = (p) => [p.name, p.symbol, p.salt, [p.meta.description, p.meta.logo, p.meta.website, p.meta.twitter, p.meta.telegram], p.quote, p.shape, p.startShift, p.creatorTaxBps,
      [p.split.creator, p.split.stakers, p.split.lp, p.split.buyback], [p.snipe.startBps, p.snipe.secs], [p.limits.maxBuyPerSwapBps, p.limits.maxBuyPerBlockBps, p.limits.secs],
      [p.alloc.creatorVestBps, p.alloc.cliff, p.alloc.duration, p.alloc.airdropBps, p.alloc.merkleRoot, p.alloc.claimSecs], p.feeRecipient, p.initialBuy, p.minTokensOut];
    const ifc = new u.Interface(ART.contrats.SwogeLaunchpadV5.abi);
    let accords = 0;
    for (const [nom, d] of mauvais) {
      const p = Object.assign({}, base, d);
      const page = await pg.evaluate(({ p, c }) => window.SwogeV5.calc.verifie(p, c, 198), { p, c: cfgPage });
      let chaine = null;
      try { await coreN.callStatic.createToken(tupl(p), { value: fee.add(p.quote === 0 ? p.initialBuy : 0), from: MOI }); }
      catch (e) {
        if (e.errorArgs && e.errorArgs.length) chaine = String(e.errorArgs[0]);
        else { const dt = (e.error && e.error.data) || e.data; try { const q = ifc.parseError((dt && dt.data) || dt); chaine = q.name === 'Bound' ? q.args[0] : q.name; } catch (x) { chaine = String(e.reason || e.message).slice(0, 80); } }
      }
      if (page && page === chaine) accords++; else ok(false, nom + ' : page « ' + page + ' » ≠ contrat « ' + chaine + ' »');
    }
    ok(accords === mauvais.length, accords + ' / ' + mauvais.length + ' refus identiques, mot pour mot, a ceux du contrat');
    ok((await pg.evaluate(({ p, c }) => window.SwogeV5.calc.verifie(p, c, 198), { p: base, c: cfgPage })) === null, 'et les parametres par defaut passent');

    console.log('\n-- le prix d ouverture : le curseur montre la FDV --');
    await pg.click('#v5QListe .v5-q[data-i="0"]');
    await pg.waitForFunction(() => /Opening FDV/.test(document.querySelector('#v5Fdv').textContent), null, { timeout: 10000 }).catch(() => {});
    let fdv = await pg.textContent('#v5Fdv');
    ok(/Opening FDV: (1\.00|0\.99)\d* ETH/.test(fdv), 'ETH, decalage 0 : ≈ 1 ETH de FDV — ' + fdv.slice(0, 40));
    ok(/≈ \$[\d,]+/.test(fdv), 'et en dollars');
    await pg.$eval('#v5Shift', (e) => { e.value = '23000'; e.dispatchEvent(new Event('input')); });
    fdv = await pg.textContent('#v5Fdv');
    ok(/Opening FDV: (9\.9|10\.0)\d* ETH/.test(fdv) && /×9\.97/.test(fdv), 'decalage +23 000 : ≈ 10 ETH (×9,97) — ' + fdv.slice(0, 40));
    await pg.$eval('#v5Shift', (e) => { e.value = '0'; e.dispatchEvent(new Event('input')); });

    console.log('\n-- connexion --');
    await pg.click('#walletBtn');
    await pg.click('#wpickList .wrow:has-text("Browser wallet")');
    await pg.waitForFunction((m) => (document.querySelector('#walletBtn').textContent || '').toLowerCase().startsWith(m.slice(0, 6).toLowerCase()), MOI, { timeout: 15000 }).catch(() => {});
    ok((await pg.textContent('#walletBtn')).toLowerCase().startsWith(MOI.slice(0, 6).toLowerCase()), 'portefeuille connecte (compte neuf impersonne ' + MOI + ')');
    await pg.waitForFunction(() => /Launch on V5/.test(document.querySelector('#v5Lancer').textContent), null, { timeout: 10000 }).catch(() => {});

    const lancement = async (remplir) => {
      await remplir();
      await pg.click('#v5Lancer');
      await pg.waitForFunction(() => { const k = document.querySelector('#v5Kit'); const nt = document.querySelector('#v5Note'); return (k && !k.hidden) || /Failed/.test(nt.textContent); }, null, { timeout: 120000 }).catch(() => {});
      return { kit: await pg.$eval('#v5Kit', (k) => (k.hidden ? '' : k.innerText)), note: await pg.textContent('#v5Note'),
        jeton: await pg.$eval('#v5Kit code', (c) => c.textContent).catch(() => null) };
    };

    console.log('\n-- lancement 1 : ETH, achat initial 0,03 ETH, taxe 2 %, anti-snipe 20 % / 60 s, LADDER3 --');
    const soldeEth0 = await P.getBalance(MOI), tresor0 = await P.getBalance(TRESOR);
    const r1 = await lancement(async () => {
      await pg.fill('#v5Name', 'Fork Ether Dog'); await pg.fill('#v5Sym', 'fed');
      await pg.fill('#v5Logo', 'https://swoleeswoge.dog/img/site/icone-512.png');
      await pg.$eval('#v5Tax', (e) => { e.value = '200'; e.dispatchEvent(new Event('input')); });
      await pg.fill('#v5SpC', '70'); await pg.fill('#v5SpS', '10'); await pg.fill('#v5SpL', '10'); await pg.fill('#v5SpB', '10');
      await pg.fill('#v5SnB', '20'); await pg.fill('#v5SnS', '60');
      await pg.selectOption('#v5Shape', '1');
      await pg.fill('#v5Achat', '0.03');
    });
    ok(!!r1.kit, 'lance : ' + (r1.kit ? r1.kit.split('\n')[0] : r1.note));
    const t1 = r1.jeton;
    if (t1) {
      const info = await coreN.getTokenInfo(t1);
      ok(info.exists && info.quote === ethers.constants.AddressZero && info.shape === 1 && info.creator === MOI, 'getTokenInfo : cree par moi, cote en ETH, LADDER3');
      ok(info.split.creator === 7000 && info.split.stakers === 1000 && info.split.lp === 1000 && info.split.buyback === 1000, 'repartition 70/10/10/10');
      const tok = new ethers.Contract(t1, ['function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)'], P);
      const recu = +u.formatEther(await tok.balanceOf(MOI));
      ok(await tok.symbol() === 'FED', 'symbole en majuscules : FED');
      const attendu = await pg.evaluate(({ tick }) => window.SwogeV5.calc.sortie(3e16, tick, 1, 0, 300) / 1e18, { tick: COT.startTicks[0] });
      ok(Math.abs(recu - attendu) / attendu < 0.001, 'jetons recus ' + recu.toFixed(0) + ' = estimation de la page ' + attendu.toFixed(0) + ' a 0,1 % pres');
      const recuT = (await P.getBalance(TRESOR)).sub(tresor0);
      ok(recuT.eq('500000000000000'), 'le tresor a recu exactement 0,0005 ETH de frais de lancement (' + u.formatEther(recuT) + ')');
      const paye = +u.formatEther(soldeEth0.sub(await P.getBalance(MOI)));
      ok(paye > 0.0305 && paye < 0.032, 'le createur a paye 0,03 + 0,0005 ETH + le gaz (' + paye.toFixed(5) + ')');
      ok(/buy 2[23]\.\d\d %/.test(r1.kit) && /sell 3\.00 %/.test(r1.kit), 'currentFees affiche : achat 1 + 2 + ≤ 20 % (surtaxe decroissante), vente 3 % — ' + (r1.kit.match(/buy [\d.]+ %/) || [''])[0]);
      ok(/anti-snipe ends/.test(r1.kit), 'et la fin de la fenetre anti-snipe');
      const lien = await pg.getAttribute('#v5LienJeton', 'href'), dex = await pg.getAttribute('#v5LienDex', 'href');
      ok(lien === 'launchpad.html?token=' + t1, 'lien vers la fiche du jeton');
      ok(dex === 'https://dexscreener.com/robinhood/' + t1.toLowerCase(), 'lien DexScreener');
      const f = await coreN.currentFees(t1);
      ok(f.sellBps === 300 && f.buyBps > 300 && f.buyBps <= 2300, 'currentFees sur la chaine : vente 300, achat ' + f.buyBps + ' (100 + 200 + surtaxe ≤ 2 000)');
    }

    console.log('\n-- lancement 2 : CRWD (action, uiMultiplier 4), achat initial saisi en actions --');
    const iC = COT.symbols.indexOf('CRWD'), CRWD = COT.addresses[iC];
    const erc = new ethers.Contract(CRWD, ['function balanceOf(address) view returns (uint256)', 'function uiMultiplier() view returns (uint256)'], P);
    ok((await erc.uiMultiplier()).toString() === '4000000000000000000', 'CRWD : uiMultiplier = 4 sur le fork');
    /* Le solde du createur est pose dans le fork (emplacement ERC-7201 « openzeppelin.storage.ERC20 », _balances) :
       10 jetons bruts = 40 actions. totalSupply n'est pas ajuste : sans effet sur cet essai. */
    const BASE = '0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00';
    await fork.rpc('anvil_setStorageAt', [CRWD, u.keccak256(u.defaultAbiCoder.encode(['address', 'bytes32'], [MOI, BASE])), u.hexZeroPad(u.parseEther('10').toHexString(), 32)]);
    ok((await erc.balanceOf(MOI)).eq(u.parseEther('10')), 'le createur detient 10 jetons CRWD bruts sur le fork');
    await pg.fill('#v5QRech', 'crowd');
    await pg.click('#v5QListe .v5-q[data-i="' + iC + '"]');
    await pg.waitForFunction(() => /uiMultiplier read now: <b>4<\/b>/.test(document.querySelector('#v5QChoisie').innerHTML), null, { timeout: 10000 }).catch(() => {});
    ok(/uiMultiplier read now: 4 /.test(await pg.textContent('#v5QChoisie')), 'le multiplicateur est relu en direct : 4');
    ok(/frozen forever/.test(await pg.textContent('#v5QAlerte')) && /terms/.test(await pg.textContent('#v5QAlerte')), 'l avertissement action (gel possible, conditions Robinhood) est en tete');
    ok(/in shares of CRWD/.test(await pg.textContent('#v5AchatLab')), 'l achat initial se saisit en actions de CRWD');
    await pg.waitForFunction(() => /Your balance: 40\.0/.test(document.querySelector('#v5AchatNote').textContent), null, { timeout: 10000 }).catch(() => {});
    ok(/Your balance: 40\.0+ shares/.test(await pg.textContent('#v5AchatNote')), 'le solde est affiche en actions : 40 (10 bruts × 4)');
    fdv = await pg.textContent('#v5Fdv');
    ok(/CRWD tokens/.test(fdv) && /shares\)/.test(fdv), 'la FDV d ouverture est dite en jetons CRWD et en actions');
    const bloc0 = await P.getBlockNumber();
    const r2 = await lancement(async () => {
      await pg.fill('#v5Name', 'Crowd Fork'); await pg.fill('#v5Sym', 'CRF');
      await pg.$eval('#v5Tax', (e) => { e.value = '0'; e.dispatchEvent(new Event('input')); });
      await pg.fill('#v5SpC', '100'); await pg.fill('#v5SpS', '0'); await pg.fill('#v5SpL', '0'); await pg.fill('#v5SpB', '0');
      await pg.fill('#v5SnB', '0'); await pg.fill('#v5SnS', '0');
      await pg.selectOption('#v5Shape', '0');
      await pg.$eval('#v5Shift', (e) => { e.value = '-4000'; e.dispatchEvent(new Event('input')); });
      await pg.fill('#v5Achat', '0.2');
    });
    ok(!!r2.kit, 'lance : ' + (r2.kit ? r2.kit.split('\n')[0] : r2.note));
    if (r2.jeton) {
      const info = await coreN.getTokenInfo(r2.jeton);
      ok(info.exists && info.quote.toLowerCase() === CRWD.toLowerCase(), 'getTokenInfo : cote en CRWD');
      ok((await erc.balanceOf(MOI)).eq(u.parseEther('9.95')), '0,2 action saisie = 0,05 jeton brut preleve (10 → 9,95)');
      const logs = await P.getLogs({ address: J.core, fromBlock: bloc0 + 1, toBlock: 'latest', topics: [ifc.getEventTopic('LaunchedV5')] });
      const ev = ifc.parseLog(logs[logs.length - 1]);
      ok(ev.args.initialBuy.eq(u.parseEther('0.05')) && ev.args.startTick === COT.startTicks[iC] - 4000, 'LaunchedV5 : initialBuy 0,05 brut, depart = reference − 4 000 ticks');
      ok(/Initial buy: 0\.20* shares of CRWD/.test(r2.kit), 'le kit dit l achat en actions : 0,2 action de CRWD');
      ok(/sell 1\.00 %/.test(r2.kit) && /buy 1\.00 %/.test(r2.kit), 'currentFees : 1 % / 1 % (sans taxe ni anti-snipe)');
      const appr = B.journal.filter((m) => m === 'eth_sendTransaction').length;
      ok(appr === 3, 'trois transactions signees en tout : lancement ETH, approbation CRWD (montant exact), lancement CRWD');
    }
    ok(B.erreurs.length === 0, 'aucune erreur JS' + (B.erreurs.length ? ' : ' + B.erreurs.slice(0, 3).join(' | ') : ''));
    await B.ctx.close(); B.srv.close();
  } catch (e) {
    ok(false, 'exception : ' + (e && e.stack || e));
  } finally {
    if (nav) await nav.close();
    if (fork) fork.stop();
  }
  console.log(`\nlaunchpad_v5.test.js : ${rates ? rates + ' RATE(S) sur ' + n : n + ' verifications OK'}`);
  process.exit(rates ? 1 : 0);
})();
