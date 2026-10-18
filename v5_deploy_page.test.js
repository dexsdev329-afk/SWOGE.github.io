'use strict';
/* ============================================================================
 * LA PAGE DE DEPLOIEMENT V5, DE BOUT EN BOUT, SUR UN FORK LOCAL (18/10/2026)
 *
 * Ce que v5_deploy.html promet au proprietaire, tenu ici :
 *   1. les octets qu'elle deploie viennent des sources du depot (empreinte
 *      keccak256 de chaque fichier de contrats/v5/src = celle des artefacts) ;
 *   2. son mineur trouve le MEME sel que HookMiner (MineHookSalt.s.sol) ;
 *   3. une liste de plus de 24 h est signalee, avec la commande, et bloque le
 *      noyau tant qu'on ne force pas ;
 *   4. les cinq transactions partent une par une, signees par le portefeuille
 *      (ici un compte neuf impersonne dans anvil : aucune cle), et chaque contrat est
 *      relu : code = code compile, `immutable` attendus, 7 500 / 500 / 198 ;
 *   5. le JSON a copier designe bien ce qui est sur la chaine ;
 *   6. la reprise : recharger la page ne renvoie rien et retrouve tout ;
 *   7. localStorage ne garde que des donnees publiques.
 * Fork anvil LOCAL de Robinhood Chain (outils/banc_v5.js). Rien n'est signe
 * ni envoye sur une chaine reelle.
 * ==========================================================================*/
const fs = require('fs'), path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let ethers = null; try { ethers = require('ethers').ethers; } catch (e) {}
const banc = require('./outils/banc_v5.js');
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const SITE = __dirname, SERVEUR = path.join(__dirname, '..', 'swoge-pusher-server.github.io');
const ART = JSON.parse(fs.readFileSync(path.join(SITE, 'contrats/v5/build/v5_artefacts.json'), 'utf8'));
const COT = JSON.parse(fs.readFileSync(path.join(SITE, 'contrats/v5/script/cotations_v5.json'), 'utf8'));
const M = require('./v5_mineur.js');
const PM = '0x8366a39CC670B4001A1121B8F6A443A643e40951';

(async () => {
  const ETHERS = banc.ethersUmd(SERVEUR);
  if (!chromium || !ethers || !ETHERS) { console.log('  RATE playwright ou ethers absent — essai impossible'); process.exit(1); }
  const u = ethers.utils;

  console.log('-- 1. les artefacts viennent des sources du depot --');
  const srcs = fs.readdirSync(path.join(SITE, 'contrats/v5/src')).filter((f) => f.endsWith('.sol'));
  for (const f of srcs) {
    const p = 'contrats/v5/src/' + f, k = u.keccak256(fs.readFileSync(path.join(SITE, p)));
    ok(ART.sources[p] === k, ART.sources[p] === k ? `${f} : empreinte identique`
      : `${f} : artefact PERIME (${ART.sources[p]} ≠ ${k}) — forge build puis node contrats/v5/script/artefacts_v5.js <racine>/out`);
  }
  ok(Object.keys(ART.sources).length === srcs.length, `${srcs.length} sources, toutes couvertes par les artefacts`);
  ok(ART.compilateur.startsWith('0.8.26') && ART.reglages.viaIR && ART.reglages.optimizer.runs === 200 && ART.reglages.evmVersion === 'cancun',
    'solc 0.8.26, cancun, 200 runs, via-IR : les reglages du README');
  const tailles = { SwogeDeployerV5: 1011, SwogeHookV5: 9019, SwogeLaunchpadV5: 23168, SwogeHoldersV5: 10786, SwogeAllocV5: 3327 };
  ok(Object.entries(tailles).every(([c, t]) => ART.contrats[c].runtimeOctets === t), 'tailles du code deploye = le tableau du README');
  const champs = ['abi', 'bytecode', 'runtime', 'runtimeOctets', 'immuables', 'metadata'];
  ok(Object.keys(ART).join() === 'genere,compilateur,reglages,sources,contrats'
    && Object.values(ART.contrats).every((c) => Object.keys(c).join() === champs.join()), 'artefacts : code, ABI et metadonnees du compilateur, rien d autre');

  console.log('\n-- 2. le mineur du navigateur = HookMiner --');
  for (const L of [0, 1, 55, 135, 136, 200]) { const b = u.randomBytes(L); if (M.hexa(M.keccak(b)) !== u.keccak256(b)) { ok(false, 'keccak ' + L + ' octets'); } }
  ok(true, 'keccak256 du mineur = ethers sur 0, 1, 55, 135, 136 et 200 octets');
  ok([0, 1, 256, 65537].every((i) => M.sel(i) === u.keccak256(u.defaultAbiCoder.encode(['string', 'uint256'], ['swoge.v5.hook', i]))),
    'sel_i = keccak256(abi.encode("swoge.v5.hook", i))');
  /* Releve par `forge script MineHookSalt.s.sol --sig "run(address,address)"` le 18/10/2026, deployeur
     0x5FbDB231…0aa3 et proprietaire 0xf39Fd6e5…2266 : sel 0xe1fadfd1…c4b2, hook 0x7a270855…2aCC. */
  const r = M.mine('0x5FbDB2315678afecb367f032d93F642f64180aa3', '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 0, 4000000);
  ok(r && r.salt === '0xe1fadfd18defdfeba3cfd9a8f4b76376e09d29504ce263d63b2983cfeb58c4b2' && r.hook === '0x7a2708550864dd17663e05873cb8cc0f5aca2acc',
    'meme sel et meme hook que forge pour le meme couple (essai #' + (r && r.i) + ')');

  console.log('\n-- fork anvil local --');
  const fork = await banc.anvil();
  let nav = null, srv = null;
  try {
    const MOI = await banc.compteNeuf(fork, ethers), TRESOR = await banc.compteNeuf(fork, ethers, 0);
    ok(true, 'anvil sur ' + fork.url + ' (PID ' + fork.pid + '), proprietaire = compte neuf impersonne ' + MOI);
    /* L'age de la liste depend de l'heure : on sert la vraie liste avec deux dates, l'une vieille de 30 h,
       l'autre d'une heure. Tout le reste de la liste est le fichier du depot. */
    let ageH = 30;
    const cot = () => JSON.stringify(Object.assign({}, COT, { genere: new Date(Date.now() - ageH * 3600e3).toISOString() }));
    srv = await banc.serveur(SITE, { '/contrats/v5/script/cotations_v5.json': cot });
    nav = await chromium.launch();
    const ctx = await nav.newContext({ viewport: { width: 1100, height: 900 } });
    await banc.routes(ctx, fork, ETHERS);
    const journal = await banc.portefeuille(ctx, fork, MOI);
    const pg = await ctx.newPage();
    const erreurs = [];
    pg.on('pageerror', (e) => erreurs.push(String(e.message || e)));
    pg.on('dialog', (d) => d.accept());
    await pg.goto(srv.base + '/v5_deploy.html', { waitUntil: 'load' });

    console.log('\n-- 3. la page, avant tout --');
    const tete = fs.readFileSync(path.join(SITE, 'v5_deploy.html'), 'utf8');
    ok(/name="robots" content="noindex, nofollow"/.test(tete), 'noindex');
    ok(fs.readFileSync(path.join(SITE, 'robots.txt'), 'utf8').includes('Disallow: /v5_deploy.html'), 'robots.txt en interdit la visite');
    ok(!fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8').includes('v5_deploy'), 'absente du sitemap');
    ok(fs.readdirSync(SITE).filter((f) => f.endsWith('.html') && f !== 'v5_deploy.html')
      .every((f) => !fs.readFileSync(path.join(SITE, f), 'utf8').includes('v5_deploy')), 'aucune page du site n y mene');
    const rouge = await pg.textContent('#avisRouge');
    ok(/Unaudited contracts\. No admin can fix or pause them after deployment\./.test(rouge) && await pg.isVisible('#avisRouge'), 'l avis rouge est la, visible');
    ok(await pg.$eval('#avisRouge', (e) => getComputedStyle(e).position === 'sticky'), 'et il reste en haut de l ecran');
    await pg.waitForFunction(() => /198 quote currencies/.test(document.querySelector('#cotInfo').textContent), null, { timeout: 15000 }).catch(() => {});
    const info = await pg.textContent('#cotInfo');
    ok(/198 quote currencies/.test(info) && /ETH, USDG, SWOGE and 195 Robinhood stock tokens/.test(info), 'taille de la liste : 198 (ETH, USDG, SWOGE, 195 actions)');
    ok(info.includes(String(COT.bloc.toLocaleString('en-US'))), 'et son bloc de generation');
    const vieille = await pg.textContent('#cotAge');
    ok(/30 h old/.test(vieille) && vieille.includes('node contrats/v5/script/genere_cotations.js'), 'liste de 30 h : signalee, avec la commande exacte');
    ok(/23,168 B/.test(await pg.textContent('#artInfo')), 'artefacts charges (noyau 23 168 octets)');

    console.log('\n-- 4. connexion : bascule vers 4663 --');
    await pg.click('[data-w]');
    await pg.waitForFunction(() => /Connected/.test(document.querySelector('#walletEtat').textContent), null, { timeout: 15000 }).catch(() => {});
    ok(/Connected/.test(await pg.textContent('#walletEtat')), 'connecte');
    ok(journal.includes('wallet_switchEthereumChain'), 'la page a demande la chaine 4663 (le portefeuille etait sur 0x1)');
    await pg.waitForFunction(() => /estimated/.test(document.querySelector('#etape-deployer').textContent), null, { timeout: 20000 }).catch(() => {});
    const e1 = await pg.textContent('#etape-deployer');
    ok(/estimated [\d,]+ gas/.test(e1) && /ETH/.test(e1), 'etape 1 : gaz estime et cout en ETH avant de signer — ' + (e1.match(/estimated [\d,]+ gas[^$]*\$?[\d.]*/) || [''])[0]);
    ok(/\$[\d.]+/.test(e1), 'et en dollars (prix de la liste, aucun service tiers dans l essai)');
    ok(/measured on a local fork: 10,974,976 gas/.test(await pg.textContent('#etape-core')), 'le noyau, pas encore estimable, montre la mesure du README');

    console.log('\n-- 5. les cinq transactions --');
    const attendsVert = async (k, ms) => {
      await pg.waitForFunction((k) => /verified/.test((document.querySelector('#etape-' + k) || {}).textContent || ''), k, { timeout: ms }).catch(() => {});
      return /verified/.test(await pg.textContent('#etape-' + k));
    };
    const envois = () => journal.filter((m) => m === 'eth_sendTransaction').length;
    await pg.click('[data-envoie="deployer"]');
    ok(await attendsVert('deployer', 60000), 'etape 1 : deployeur CREATE3 deploye et relu');
    await pg.waitForFunction(() => /salt <code>0x/.test(document.querySelector('#etape-hook').innerHTML), null, { timeout: 60000 }).catch(() => {});
    const hookTxt = await pg.textContent('#etape-hook');
    ok(/salt 0x[0-9a-f]{64}/.test(hookTxt) && /2acc/i.test(hookTxt), 'sel du hook mine dans le navigateur, adresse en …2ACC');
    const prog1 = JSON.parse(await pg.evaluate((k) => localStorage.getItem(k), 'swoge_v5_deploy:4663:' + MOI.toLowerCase()));
    const attendu = M.mine(prog1.deployer, MOI, 0, 4000000);
    ok(attendu && attendu.salt === prog1.hookSalt, 'le sel de la page = le premier sel de HookMiner pour ce deployeur et ce proprietaire');
    await pg.waitForFunction(() => /estimated [\d,]+ gas/.test(document.querySelector('#etape-hook').textContent), null, { timeout: 30000 }).catch(() => {});
    ok(/estimated [\d,]+ gas/.test(await pg.textContent('#etape-hook')), 'etape 2 : estimee en direct une fois le deployeur la');

    await pg.click('[data-envoie="hook"]');
    ok(await attendsVert('hook', 60000), 'etape 2 : hook deploye et relu');
    ok(/the quote list is not usable|set the treasury/.test(await pg.textContent('#etape-core')), 'le noyau reste bloque (tresor absent, liste de 30 h)');

    /* La liste « fraiche » : on recharge la page, la progression revient d'elle-meme. */
    ageH = 1;
    await pg.reload({ waitUntil: 'load' });
    await pg.click('[data-w]');
    ok(await attendsVert('hook', 30000), 'reprise apres rechargement : deployeur et hook retrouves et relus');
    ok(!(await pg.$('#cotVieille')), 'liste d une heure : plus d avertissement');
    await pg.fill('#inTresor', TRESOR);
    await pg.waitForFunction(() => /Accepts ETH/.test(document.querySelector('#tresorEtat').textContent), null, { timeout: 15000 }).catch(() => {});
    ok(/Accepts ETH/.test(await pg.textContent('#tresorEtat')), 'le tresor accepte l ETH (transfert de 1 wei simule, rien d envoye)');
    ok(/re-read the quote tokens/.test(await pg.textContent('#etape-core')), 'le noyau attend la relecture des 197 jetons');
    await pg.click('#btnRelis');
    await pg.waitForFunction(() => /All 197 quote tokens re-read/.test(document.querySelector('#relisEtat').textContent), null, { timeout: 300000 }).catch(() => {});
    ok(/All 197 quote tokens re-read/.test(await pg.textContent('#relisEtat')), '197 jetons relus sur le fork : code, symbol(), decimals()');
    await pg.waitForFunction(() => /estimated [\d,]+ gas/.test(document.querySelector('#etape-core').textContent), null, { timeout: 120000 }).catch(() => {});
    const eCore = await pg.textContent('#etape-core');
    const gazCore = +((eCore.match(/estimated ([\d,]+) gas/) || [, '0'])[1].replace(/,/g, ''));
    ok(gazCore > 10e6 && gazCore < 12e6, 'le noyau est estime en direct : ' + gazCore.toLocaleString('en-US') + ' gaz');
    const avant = envois();
    await pg.click('[data-envoie="core"]');
    ok(await attendsVert('core', 120000), 'etape 3 : noyau deploye et relu');
    await pg.click('[data-envoie="holders"]');
    ok(await attendsVert('holders', 60000), 'etape 4 : Holders deploye et relu');
    await pg.click('[data-envoie="alloc"]');
    ok(await attendsVert('alloc', 60000), 'etape 5 : Alloc deploye et relu');
    ok(envois() - avant === 3, 'trois transactions de plus, une par clic');
    const coreTxt = await pg.textContent('#etape-core');
    for (const l of ['CREATOR_SHARE_BPS = 7500', 'MAX_CREATOR_TAX_BPS = 500', 'quote count = 198', 'every quote and start tick = cotations_v5.json', 'on-chain code = compiled SwogeLaunchpadV5'])
      ok(coreTxt.includes(l), 'relu sur la chaine : ' + l);
    ok(/address flags = 0x2ACC/.test(await pg.textContent('#etape-hook')), 'relu sur la chaine : drapeaux du hook 0x2ACC');
    const rateesPage = await pg.$$eval('ul.verifs li.bad', (l) => l.map((x) => x.textContent));
    ok(rateesPage.length === 0, 'aucune verification rouge sur la page' + (rateesPage.length ? ' : ' + rateesPage.join(' | ') : ''));

    console.log('\n-- 6. le fichier a copier --');
    ok(await pg.isVisible('#carteFin'), 'la carte de fin s affiche');
    const J = JSON.parse(await pg.textContent('#jsonFin'));
    const P = new ethers.providers.StaticJsonRpcProvider(fork.url, 4663);
    const abi = (c) => ART.contrats[c].abi;
    const core = new ethers.Contract(J.core, abi('SwogeLaunchpadV5'), P), hook = new ethers.Contract(J.hook, abi('SwogeHookV5'), P);
    const holders = new ethers.Contract(J.holders, abi('SwogeHoldersV5'), P), alloc = new ethers.Contract(J.alloc, abi('SwogeAllocV5'), P);
    const dep = new ethers.Contract(J.deployer, abi('SwogeDeployerV5'), P);
    ok(J.version === 'v5' && J.chainId === 4663 && J.poolManager === PM && J.quotes === 198, 'version, chaine, PoolManager, 198 monnaies');
    ok(J.owner === MOI && J.treasury === TRESOR && J.launchFeeWei === '500000000000000', 'proprietaire, tresor, frais de 0,0005 ETH');
    const kc = (s) => u.keccak256(u.toUtf8Bytes(s));
    ok(await dep.addressOf(MOI, kc('swoge.v5.core')) === J.core && await dep.addressOf(MOI, kc('swoge.v5.holders')) === J.holders
      && await dep.addressOf(MOI, kc('swoge.v5.alloc')) === J.alloc && await dep.addressOf(MOI, J.hookSalt) === J.hook, 'chaque adresse = deployeur.addressOf(proprietaire, sel)');
    ok(await hook.core() === J.core && await hook.holders() === J.holders && await core.hook() === J.hook && await core.holders() === J.holders
      && await core.alloc() === J.alloc && await core.treasury() === TRESOR && await holders.core() === J.core && await holders.hook() === J.hook
      && await alloc.core() === J.core, 'le cablage de DeployV5.s.sol, relu depuis Node');
    ok((BigInt(J.hook) & 0x3FFFn) === 0x2ACCn, 'hook & ALL_HOOK_MASK = 0x2ACC');
    const qs = await core.quotes(), ts = await core.startTicks();
    ok(qs.length === 198 && qs.every((q, i) => q.toLowerCase() === COT.addresses[i].toLowerCase() && ts[i] === COT.startTicks[i]), 'quotes() et startTicks() = cotations_v5.json');
    ok(Object.keys(J.txs).length === 5 && Object.keys(J.blocks).length === 5, 'cinq empreintes de transaction et cinq blocs');
    for (const [k, h] of Object.entries(J.txs)) {
      const rc = await P.getTransactionReceipt(h);
      ok(rc && rc.status === 1 && rc.from === MOI, `${k} : recu vert, signe par le proprietaire (${rc.gasUsed.toNumber().toLocaleString('en-US')} gaz)`);
    }

    console.log('\n-- 7. reprise et localStorage --');
    const avantReprise = envois();
    await pg.reload({ waitUntil: 'load' });
    await pg.click('[data-w]');
    ok(await attendsVert('alloc', 60000) && await pg.isVisible('#carteFin'), 'apres rechargement : les cinq etapes sont retrouvees et relues');
    ok(envois() === avantReprise, 'et rien n est renvoye');
    const stock = await pg.evaluate(() => Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]));
    const cles = new Set(); stock.forEach(([, v]) => { try { Object.keys(JSON.parse(v)).forEach((x) => cles.add(x)); } catch (e) {} });
    const permis = ['v', 'owner', 'tx', 'blocs', 'addrs', 'deployer', 'hookSalt', 'hookI', 'hookPour', 'treasury', 'launchFeeWei', 'listeRelue', 'deployerReutilise'];
    ok([...cles].every((c) => permis.includes(c)), 'localStorage : seulement ' + [...cles].join(', '));
    ok(!stock.some(([, v]) => /privateKey|mnemonic|seed/i.test(v)), 'aucune cle, aucune phrase');
    ok(erreurs.length === 0, 'aucune erreur JS' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''));
  } catch (e) {
    ok(false, 'exception : ' + (e && e.stack || e));
  } finally {
    if (nav) await nav.close();
    if (srv) srv.close();
    fork.stop();
  }
  console.log(`\nv5_deploy_page.test.js : ${rates ? rates + ' RATE(S) sur ' + n : n + ' verifications OK'}`);
  process.exit(rates ? 1 : 0);
})();
