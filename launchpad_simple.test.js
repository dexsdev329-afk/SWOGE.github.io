'use strict';
/* ============================================================================
 * LE LAUNCHPAD SIMPLIFIE (18/10/2026)
 *
 * « Il y a trop d'options, les gens ne s'y retrouvent pas — refais
 * l'interface. » (le proprietaire). Cet essai tient ce que la page promet :
 *   A. trois onglets (Launch, Explore, Portfolio) ; l'onglet Launch montre
 *      quatre champs et un facultatif — nom, symbole, logo, paire (ETH), achat
 *      initial — et rien d'autre : « Advanced settings » et les lanceurs
 *      d'avant sont replies ;
 *   B. un lancement V5 complet par ce formulaire, valeurs par defaut, sur un
 *      fork anvil LOCAL de Robinhood Chain (compte neuf impersonne, anvil
 *      signe : aucune cle) — le noyau V5 REEL du depot, relu dans le fork ;
 *   C. Explore liste SWAI (le premier jeton V5, sur la vraie chaine) marque
 *      V5, a cote du jeton que B vient de lancer ; « V5 only » et la
 *      recherche ;
 *   D. la fiche : ligne Safety lue, le reste replie sous « More details » ;
 *   E. a 390 px : une seule colonne, aucune barre de defilement horizontale,
 *      des cibles de 44 px au moins ;
 *   F. le logo et les liens d'un jeton V5 (updateMeta) : seul le destinataire
 *      des frais voit « Edit logo & links », la page simule puis signe, et
 *      Explore comme la fiche montrent le DERNIER Meta ; un autre compte ne
 *      voit pas le bouton et son appel direct revert (NotRecipient). SWAI :
 *      le formulaire propose img/tokens/swai.png. $SWOGEBET : logo local.
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
const SWAI = '0x83aB87625404B63f27d8289b9E50fFd3ED2F5d22';

(async () => {
  const ETHERS = banc.ethersUmd(SERVEUR);
  if (!chromium || !ethers || !ETHERS) { console.log('  RATE playwright ou ethers absent — essai impossible'); process.exit(1); }
  let nav = null, fork = null, srv = null;
  try {
    fork = await banc.anvil();
    const MOI = await banc.compteNeuf(fork, ethers);
    const P = new ethers.providers.JsonRpcProvider(fork.url, 4663);
    const coreN = new ethers.Contract(J.core, ART.contrats.SwogeLaunchpadV5.abi, P);
    ok(true, 'fork anvil local (PID ' + fork.pid + '), noyau V5 du depot ' + J.core);
    srv = await banc.serveur(SITE, null);
    nav = await chromium.launch();
    /* les journaux du noyau V5 et du PoolManager sont lus dans le fork ; ceux des lanceurs d avant
       (balayage de toute l histoire) rendent [] : cet essai ne porte que sur V5 */
    const ouvre = async (vue, compte, chemin) => {
      const ctx = await nav.newContext(vue);
      await banc.routes(ctx, fork, ETHERS, { sansJournaux: true, journauxDe: [J.core, J.poolManager] });
      /* Sourcify, rejoue : SWAI y est « exact_match » (sourcify.dev/server/v2/contract/4663/<SWAI>, lu le
         18/10/2026) ; tout autre contrat, 404. Motif en expression reguliere : le motif 'https://**' du
         banc ne retient pas ces requetes avec cette version de Playwright (mesure du 18/10/2026). */
      await ctx.route(/sourcify\.dev\/server\/v2\/contract\/4663\//, (r) => {
        const a = r.request().url().split('/').pop().toLowerCase();
        return a === SWAI.toLowerCase()
          ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ match: 'exact_match', runtimeMatch: 'exact_match', chainId: '4663', address: SWAI }) })
          : r.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
      });
      if (compte) await banc.portefeuille(ctx, fork, compte);
      /* les logos du site, demandes a leur adresse publique, sont servis depuis le depot */
      await ctx.route(/swoleeswoge\.dog\/img\/tokens\//, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(SITE, 'img/tokens', r.request().url().split('/').pop())) }));
      const pg = await ctx.newPage(), erreurs = [];
      pg.on('pageerror', (e) => erreurs.push(String(e.message || e)));
      await pg.goto(srv.base + (chemin || '/launchpad.html'), { waitUntil: 'load' });
      return { ctx, pg, erreurs };
    };

    console.log('-- A. l onglet Launch : 4 champs + 1 facultatif, le reste replie --');
    const A = await ouvre({ viewport: { width: 1440, height: 900 } }, MOI);
    const pg = A.pg;
    await pg.waitForSelector('#v5Lancer', { timeout: 60000 }).catch(() => {});
    const onglets = await pg.$$eval('.lp-head .tab', (t) => t.filter((b) => b.offsetParent !== null).map((b) => b.textContent.trim()));
    ok(onglets.join('|') === '🚀 Launch|🔎 Explore|👤 Portfolio', 'trois onglets visibles : ' + onglets.join(' · '));
    const visibles = await pg.$$eval('#tab-create input, #tab-create select, #tab-create textarea', (l) => l.filter((e) => e.checkVisibility() && e.type !== 'hidden').map((e) => e.id));
    ok(visibles.join(',') === 'v5Name,v5Sym,v5Logo,v5Achat', 'champs visibles : ' + visibles.join(', ') + ' (nom, symbole, logo, achat initial)');
    ok(await pg.isVisible('#v5PlusPaires') && /ETH/.test(await pg.textContent('#v5PaireNow')) && await pg.isHidden('#v5QListe'),
      'la paire : ETH par defaut, les 197 autres derriere « More pairs »');
    ok(!(await pg.$eval('#v5Avance', (d) => d.open)) && /Advanced settings/.test(await pg.textContent('#v5Avance > summary')), '« Advanced settings » replie');
    const caches = ['v5Desc', 'v5Web', 'v5Tw', 'v5Tg', 'v5Tax', 'v5SpC', 'v5SnB', 'v5LiS', 'v5Shape', 'v5Shift', 'v5VeP', 'v5AiP', 'v5AiR', 'v5Dest'];
    const vusAv = []; for (const id of caches) if (await pg.isVisible('#' + id)) vusAv.push(id);
    ok(vusAv.length === 0, 'taxe, anti-snipe, limites, repartition, forme, prix, vesting, airdrop, liens, destinataire : caches' + (vusAv.length ? ' — visibles : ' + vusAv : ''));
    ok(!(await pg.$eval('#lpLegacy', (d) => d.open)) && await pg.isHidden('#createBtn') && /Other launch modes \(legacy\)/.test(await pg.textContent('#lpLegacy > summary')),
      'les lanceurs d avant (V4, $SWOGE, Solana) : un lien replie en bas');
    const res0 = await pg.textContent('#v5Resume');
    ok(/Launch fee/.test(res0) && /0\.0005 ETH/.test(res0) && /Network gas/.test(res0), 'le cout est resume au-dessus du bouton : ' + res0.replace(/\s+/g, ' ').slice(0, 90));
    await pg.click('#v5Avance > summary');
    const defauts = await pg.evaluate(() => ['v5Tax', 'v5SpC', 'v5SpS', 'v5SpL', 'v5SpB', 'v5SnB', 'v5SnS', 'v5LiS', 'v5LiB', 'v5LiT', 'v5Shape', 'v5Shift', 'v5VeP', 'v5AiP'].map((i) => document.getElementById(i).value).join(','));
    ok(defauts === '0,100,0,0,0,0,0,0,0,0,0,0,0,0', 'ouvert : les valeurs par defaut d avant (taxe 0, 100 % createur, tout le reste eteint) — ' + defauts);
    const expl = await pg.$$eval('#v5Avance .v5-ex', (l) => l.length);
    ok(expl >= 10, expl + ' reglages avances, chacun avec sa phrase d explication');
    await pg.click('#v5Avance > summary');

    console.log('\n-- B. un lancement V5 complet, valeurs par defaut, sur le fork --');
    await pg.click('#walletBtn');
    await pg.click('#wpickList .wrow:has-text("Browser wallet")');
    await pg.waitForFunction((m) => (document.querySelector('#walletBtn').textContent || '').toLowerCase().startsWith(m.slice(0, 6).toLowerCase()), MOI, { timeout: 20000 }).catch(() => {});
    await pg.fill('#v5Name', 'Simple Fork Dog'); await pg.fill('#v5Sym', 'sfdog');
    await pg.waitForFunction(() => /≈ [\d.e-]+ ETH/.test(document.querySelector('#v5Resume').textContent), null, { timeout: 30000 }).catch(() => {});
    const res1 = await pg.textContent('#v5Resume');
    ok(/Network gas\s*≈ [\d.e-]+ ETH/.test(res1), 'connecte, formulaire valide : le gaz est estime sur la chaine — ' + (res1.match(/≈ [\d.e-]+ ETH/) || [''])[0]);
    ok(/🚀 Launch \$SFDOG/.test(await pg.textContent('#v5Lancer')), 'un seul grand bouton : « ' + (await pg.textContent('#v5Lancer')) + ' »');
    const bloc0 = await P.getBlockNumber();
    await pg.click('#v5Lancer');
    await pg.waitForFunction(() => { const k = document.querySelector('#v5Kit'); return (k && !k.hidden) || /Failed/.test(document.querySelector('#v5Note').textContent); }, null, { timeout: 120000 }).catch(() => {});
    const kit = await pg.$eval('#v5Kit', (k) => (k.hidden ? '' : k.innerText));
    const jeton = await pg.$eval('#v5Kit code', (c) => c.textContent).catch(() => null);
    ok(!!kit && !!jeton, 'lance : ' + (kit ? kit.split('\n')[0] : await pg.textContent('#v5Note')));
    if (jeton) {
      const info = await coreN.getTokenInfo(jeton);
      ok(info.exists && info.creator === MOI && info.quote === ethers.constants.AddressZero && info.shape === 0, 'getTokenInfo : cree par le compte du fork, cote en ETH, forme SINGLE');
      ok(info.split.creator === 10000 && info.feeRecipient === MOI, 'repartition 100 % createur, frais au portefeuille connecte');
      const f = await coreN.currentFees(jeton);
      ok(f.buyBps === 100 && f.sellBps === 100, 'currentFees : 1 % / 1 % (ni taxe ni anti-snipe par defaut)');
      const logs = await P.getLogs({ address: J.core, fromBlock: bloc0 + 1, toBlock: 'latest', topics: [coreN.interface.getEventTopic('LaunchedV5')] });
      ok(logs.length === 1 && coreN.interface.parseLog(logs[0]).args.initialBuy.isZero(), 'un seul LaunchedV5, sans achat initial');
    }

    console.log('\n-- C. Explore : SWAI et le nouveau jeton, marques V5 --');
    await pg.click('.tab[data-tab="explore"]');
    await pg.waitForFunction(() => document.querySelectorAll('#list .tcard[data-v5]').length >= 2, null, { timeout: 90000 }).catch(() => {});
    const cartes = await pg.$$eval('#list .tcard', (cs) => cs.map((c) => ({ a: c.getAttribute('data-addr').toLowerCase(), v5: c.hasAttribute('data-v5'), t: c.querySelector('.tsy').textContent, b: +c.getAttribute('data-bloc') })));
    const s = cartes.find((c) => c.a === SWAI.toLowerCase());
    ok(s && s.v5 && /\$SWAI/.test(s.t) && /V5/.test(s.t), 'SWAI est dans Explore, marque V5 : ' + (s ? s.t : 'absent'));
    ok(jeton && cartes[0] && cartes[0].a === jeton.toLowerCase(), 'le jeton tout juste lance passe en tete (« New ») : ' + (cartes[0] ? cartes[0].t : '—'));
    ok(cartes.every((c, i) => i === 0 || c.b <= cartes[i - 1].b), 'du plus recent au plus ancien (data-bloc)');
    await pg.waitForFunction((a) => /MC/.test((document.querySelector('#list .tcard[data-addr="' + a + '"] .tmc') || {}).textContent || ''), SWAI, { timeout: 60000 }).catch(() => {});
    ok(/MC/.test(await pg.textContent('#list .tcard[data-addr="' + SWAI + '"] .tmc')), 'la capitalisation de SWAI est lue (pool v4) : ' + (await pg.textContent('#list .tcard[data-addr="' + SWAI + '"] .tmc')));
    await pg.click('#sortSeg [data-sort="v5"]');
    const seuls = await pg.$$eval('#list .tcard', (cs) => cs.map((c) => c.hasAttribute('data-v5')));
    ok(seuls.length >= 2 && seuls.every(Boolean), '« V5 only » : ' + seuls.length + ' cartes, toutes V5');
    await pg.click('#sortSeg [data-sort="new"]');
    await pg.fill('#search', 'swai');
    const trouves = await pg.$$eval('#list .tcard', (cs) => cs.map((c) => c.getAttribute('data-addr')));
    ok(trouves.length === 1 && trouves[0].toLowerCase() === SWAI.toLowerCase(), 'recherche « swai » : SWAI seul');
    await pg.click('#sortSeg [data-sort="vol"]');
    ok((await pg.$$('#list .tcard')).length === 1, '« Trending » trie la meme grille (la recherche reste appliquee)');
    await pg.fill('#search', '');

    console.log('\n-- D. la fiche de SWAI --');
    await pg.click('#list .tcard[data-addr="' + SWAI + '"]');
    await pg.waitForFunction(() => { const t = document.querySelector('#tvSafety').textContent; return /No owner/.test(t) && /Tax/.test(t) && !/reading/.test(t); }, null, { timeout: 60000 }).catch(() => {});
    const sur = await pg.textContent('#tvSafety');
    ok(/No owner/.test(sur) && /LP locked forever/.test(sur) && /Tax \d+\.\d\d%/.test(sur) && /Source verified/.test(sur), 'ligne Safety : ' + sur.replace(/\s+/g, ' ').trim());
    ok(await pg.isVisible('#tvTradePanel') && await pg.isVisible('#chart') && await pg.isVisible('#tvShare a'), 'echange, graphique et partage visibles');
    ok(!(await pg.$eval('#tvPlus', (d) => d.open)) && await pg.isHidden('#tvHistPanel') && await pg.isHidden('#supply') && await pg.isHidden('#agents'),
      'echanges/detenteurs, agents, offre : sous « More details », replie');
    await pg.click('#tvPlus > summary');
    ok(await pg.isVisible('#tvHistPanel') && await pg.isVisible('#bf'), 'ouvert, les panneaux sont la');
    ok(/sourcify\.dev\/#\/lookup\/0x83aB/i.test(await pg.getAttribute('#tvSafety a', 'href')), 'la source verifiee renvoie a Sourcify');
    if (jeton) {
      await pg.click('#tvBack');
      await pg.click('#list .tcard[data-addr="' + jeton + '"]');
      await pg.waitForFunction(() => /Source (not verified|: not read)/.test(document.querySelector('#tvSafety').textContent), null, { timeout: 60000 }).catch(() => {});
      ok(/Source not verified/.test(await pg.textContent('#tvSafety')), 'le jeton tout juste lance (inconnu de Sourcify) : « Source not verified », pas un faux vert');
    }
    await pg.click('#tvBack');
    ok(await pg.isVisible('#tab-explore'), '« ← Back » ramene a Explore');
    ok(A.erreurs.length === 0, 'aucune erreur JS' + (A.erreurs.length ? ' : ' + A.erreurs.slice(0, 3).join(' | ') : ''));
    await A.ctx.close();

    console.log('\n-- F. logo et liens (updateMeta), sur le fork --');
    const LOGO = 'https://swoleeswoge.dog/img/tokens/swai.png';
    if (jeton) {
      const F = await ouvre({ viewport: { width: 1440, height: 900 } }, MOI, '/launchpad.html?token=' + jeton);
      await F.pg.click('#walletBtn'); await F.pg.click('#wpickList .wrow:has-text("Browser wallet")');
      await F.pg.waitForSelector('#tmOuvre', { timeout: 60000 }).catch(() => {});
      ok(await F.pg.isVisible('#tmOuvre'), 'le destinataire des frais (le createur) voit « Edit logo & links »');
      await F.pg.click('#tmOuvre');
      await F.pg.waitForSelector('#tmLogo', { timeout: 30000 }).catch(() => {});
      await F.pg.fill('#tmLogo', 'https://x.example/' + 'a'.repeat(240));
      await F.pg.click('#tmEnvoie');
      ok(/meta field <= 256 bytes/.test(await F.pg.textContent('#tmNote')), 'un lien de 258 octets est refuse avec le message du contrat : ' + (await F.pg.textContent('#tmNote')));
      await F.pg.fill('#tmLogo', LOGO); await F.pg.fill('#tmWeb', 'https://swoleeswoge.dog'); await F.pg.fill('#tmTw', 'https://x.com/SwoleDogeSwoge');
      await F.pg.click('#tmEnvoie');
      await F.pg.waitForFunction(() => /Saved on-chain|Failed/.test(document.querySelector('#tmNote').textContent), null, { timeout: 60000 }).catch(() => {});
      ok(/Saved on-chain/.test(await F.pg.textContent('#tmNote')), 'enregistre : ' + (await F.pg.textContent('#tmNote')));
      const m = await coreN.queryFilter(coreN.filters.MetadataUpdated(jeton), bloc0);
      const der = m[m.length - 1];
      ok(m.length === 2 && der.args.logo === LOGO && der.args.website === 'https://swoleeswoge.dog' && der.args.description === '', 'sur la chaine : deux MetadataUpdated (lancement, modification), le dernier porte le logo et les liens, description gardee');
      ok((await F.pg.getAttribute('#tvLogo img', 'src')) === LOGO, 'la fiche montre le nouveau logo aussitot');
      await F.ctx.close();
      /* une page neuve : Explore et la fiche relisent les evenements (le dernier Meta gagne) */
      const G = await ouvre({ viewport: { width: 1440, height: 900 } }, null);
      await G.pg.click('.tab[data-tab="explore"]');
      await G.pg.waitForSelector('#list .tcard[data-addr="' + jeton + '"]', { timeout: 90000 }).catch(() => {});
      ok((await G.pg.getAttribute('#list .tcard[data-addr="' + jeton + '"] img.thumb', 'src').catch(() => null)) === LOGO, 'page neuve : la carte d Explore montre le logo du dernier Meta');
      await G.pg.click('#list .tcard[data-addr="' + jeton + '"]');
      await G.pg.waitForFunction(() => document.querySelector('#tvLogo img'), null, { timeout: 60000 }).catch(() => {});
      ok((await G.pg.getAttribute('#tvLogo img', 'src').catch(() => null)) === LOGO && !!(await G.pg.$('#tvSocials a[href="https://swoleeswoge.dog"]')) && !!(await G.pg.$('#tvSocials a[href="https://x.com/SwoleDogeSwoge"]')), 'page neuve : la fiche montre logo et liens du dernier Meta');
      ok(G.erreurs.length === 0, 'aucune erreur JS' + (G.erreurs.length ? ' : ' + G.erreurs.join(' | ') : ''));
      await G.ctx.close();
      /* un autre compte : pas de bouton, et l appel direct est refuse par le noyau */
      const AUTRE = await banc.compteNeuf(fork, ethers);
      const H = await ouvre({ viewport: { width: 1440, height: 900 } }, AUTRE, '/launchpad.html?token=' + jeton);
      await H.pg.click('#walletBtn'); await H.pg.click('#wpickList .wrow:has-text("Browser wallet")');
      await H.pg.waitForFunction(() => /SFDOG/.test(document.querySelector('#tvSym').textContent), null, { timeout: 60000 }).catch(() => {});
      await H.pg.waitForTimeout(3000);
      ok(!(await H.pg.$('#tmOuvre')), 'un autre compte connecte ne voit pas « Edit logo & links »');
      await H.ctx.close();
      let refus = null;
      try { await coreN.callStatic.updateMeta(jeton, ['', 'https://evil.example/x.png', '', '', ''], { from: AUTRE }); } catch (e) {
        const dt = (e.error && e.error.data) || e.data; try { refus = coreN.interface.parseError((dt && dt.data) || dt).name; } catch (x) { refus = String(e.reason || e.message).slice(0, 60); } }
      ok(refus === 'NotRecipient', 'appel direct d un autre compte : le noyau refuse (' + refus + ')');
    }
    {
      /* SWAI : son destinataire (le proprietaire, adresse publique de adresses_v5.json) est IMPERSONNE dans le fork
         local — anvil signe, aucune cle. Le formulaire propose le logo heberge par le site. */
      const ti = await coreN.getTokenInfo(SWAI);
      await fork.rpc('anvil_impersonateAccount', [ti.feeRecipient]);
      await fork.rpc('anvil_setBalance', [ti.feeRecipient, ethers.utils.parseEther('1').toHexString()]);
      const K = await ouvre({ viewport: { width: 1440, height: 900 } }, ti.feeRecipient, '/launchpad.html?token=' + SWAI);
      await K.pg.click('#walletBtn'); await K.pg.click('#wpickList .wrow:has-text("Browser wallet")');
      await K.pg.waitForSelector('#tmOuvre', { timeout: 60000 }).catch(() => {});
      await K.pg.click('#tmOuvre').catch(() => {});
      await K.pg.waitForSelector('#tmLogo', { timeout: 30000 }).catch(() => {});
      ok((await K.pg.inputValue('#tmLogo').catch(() => '')) === LOGO, 'SWAI (lance avec une page ibb.co, pas une image) : le formulaire propose ' + LOGO);
      await K.pg.click('#tmEnvoie').catch(() => {});
      await K.pg.waitForFunction(() => /Saved on-chain|Failed/.test(document.querySelector('#tmNote').textContent), null, { timeout: 60000 }).catch(() => {});
      ok(/Saved on-chain/.test(await K.pg.textContent('#tmNote').catch(() => '')) && (await K.pg.getAttribute('#tvLogo img', 'src').catch(() => null)) === LOGO,
        'SWAI, sur le fork : le proprietaire enregistre, la fiche montre le logo');
      await K.ctx.close();
      const B2 = await ouvre({ viewport: { width: 1440, height: 900 } }, null, '/launchpad.html?token=0xc0aEd547862fba5D7D9Fbf3cb14204cD756c8Bea');
      await B2.pg.waitForFunction(() => document.querySelector('#tvLogo img'), null, { timeout: 60000 }).catch(() => {});
      ok((await B2.pg.getAttribute('#tvLogo img', 'src').catch(() => null)) === 'img/tokens/swogebet.png', '$SWOGEBET : la fiche montre le logo local (img/tokens/swogebet.png), pas le data: flou du V3');
      await B2.ctx.close();
    }

    console.log('\n-- E. 390 px : une colonne, pas de defilement horizontal, cibles de 44 px --');
    const tel = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
    const deborde = (p) => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth,
      large: [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.sw-onglets,.sw-nav,.mnav,[hidden],details:not([open]) > :not(summary)'); })
        .slice(0, 3).map((e) => e.tagName + '#' + e.id + '.' + String(e.className).slice(0, 30)) }));
    const T = await ouvre(tel, null);
    await T.pg.waitForSelector('#v5Lancer', { timeout: 60000 }).catch(() => {});
    let d = await deborde(T.pg);
    ok(d.sw <= 390, 'Launch : largeur ' + d.sw + ' / 390' + (d.large.length ? ' — ' + d.large.join(', ') : ''));
    const cols = await T.pg.evaluate(() => { const a = document.getElementById('v5Name').getBoundingClientRect(), b = document.getElementById('v5Sym').getBoundingClientRect(); return b.top >= a.bottom; });
    ok(cols, 'Launch : nom et symbole l un sous l autre (une colonne)');
    const petites = await T.pg.evaluate(() => ['#v5Lancer', '#v5PlusPaires', '#v5AchatMax', '.lp-head .tab[data-tab="create"]', '.lp-head .tab[data-tab="explore"]', '.lp-head .tab[data-tab="mine"]', '#v5Name', '#v5Achat', '#v5Avance > summary', '#lpLegacy > summary']
      .map((q) => { const e = document.querySelector(q), r = e.getBoundingClientRect(); return [q, Math.round(r.height)]; }).filter((x) => x[1] < 44));
    ok(petites.length === 0, 'cibles de 44 px au moins (bouton, paires, Max, onglets, champs, plis)' + (petites.length ? ' — trop petites : ' + JSON.stringify(petites) : ''));
    await T.pg.click('.tab[data-tab="explore"]');
    await T.pg.waitForFunction(() => document.querySelectorAll('#list .tcard').length >= 1, null, { timeout: 90000 }).catch(() => {});
    d = await deborde(T.pg);
    ok(d.sw <= 390, 'Explore : largeur ' + d.sw + ' / 390' + (d.large.length ? ' — ' + d.large.join(', ') : ''));
    const filtres = await T.pg.$$eval('#sortSeg button', (l) => l.map((b) => Math.round(b.getBoundingClientRect().height)));
    ok(filtres.every((h) => h >= 44), 'Explore : filtres de ' + filtres.join('/') + ' px');
    await T.pg.click('#list .tcard[data-addr="' + SWAI + '"]');
    await T.pg.waitForFunction(() => /SWAI/.test(document.querySelector('#tvSym').textContent), null, { timeout: 60000 }).catch(() => {});
    await T.pg.waitForTimeout(1500);
    d = await deborde(T.pg);
    ok(d.sw <= 390, 'fiche SWAI : largeur ' + d.sw + ' / 390' + (d.large.length ? ' — ' + d.large.join(', ') : ''));
    ok(await T.pg.isVisible('#mbar [data-sheet="buy"]'), 'fiche : la barre Buy / Sell du telephone est la');
    ok(T.erreurs.length === 0, 'aucune erreur JS a 390 px' + (T.erreurs.length ? ' : ' + T.erreurs.slice(0, 3).join(' | ') : ''));
    await T.ctx.close();
  } catch (e) {
    ok(false, 'exception : ' + (e && e.stack || e));
  } finally {
    if (nav) await nav.close();
    if (srv) srv.close();
    if (fork) fork.stop();
  }
  console.log(`\nlaunchpad_simple.test.js : ${rates ? rates + ' RATE(S) sur ' + n : n + ' verifications OK'}`);
  process.exit(rates ? 1 : 0);
})();
