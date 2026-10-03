'use strict';
/*
 * LA VITRINE AUTOUR DU TELEPHONE NE DOIT RIEN INVENTER, ET RIEN CASSER.
 *
 * Demande du proprietaire, le 1er octobre : « Le téléphone doit rester
 * l'élément CENTRAL… NE CHANGE PAS la logique fonctionnelle existante… NE
 * REMPLACE AUCUNE LOGIQUE PAR DES MOCKS… N'invente pas de soldes, de
 * transactions, de prix. »
 *
 * Ce qui se verifie donc ici :
 *   - les six cartes sont la, A COTE du telephone, sans jamais le couvrir —
 *     un clic sur le telephone doit toujours arriver au telephone ;
 *   - deconnecte, chaque chiffre de la vitrine s'ecrit « -- » : aucun solde,
 *     aucun prix, aucune valeur qui n'ait ete lu ;
 *   - connecte, les chiffres sont CEUX DU TELEPHONE (la meme lecture) ;
 *   - chaque carte ouvre son ecran dans le telephone, par le meme `va` ;
 *   - le telephone suit la lecture au-dessus de 1340 pixels, et S'ARRETE au
 *     premier geste dans le telephone — changer l'ecran sous le doigt de
 *     quelqu'un qui tape un montant serait le pire defaut possible ici ;
 *   - sur telephone et dans le cadre d'une autre page, rien de tout cela
 *     n'existe : l'ecran EST le portefeuille.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
const ETHERS = '/home/user/swoge-pusher-server.github.io/node_modules/ethers/dist/ethers.umd.min.js';
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('wallet_vitrine.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
            '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.json': 'application/json' };
const MOI = '0x00000000000000000000000000000000000a11ce';
const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');

const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  /* Une page qui ouvre le portefeuille dans un cadre, comme le rond en bas
     de chaque page du site. */
  if (u === '/_cadre.html') {
    r.writeHead(200, { 'content-type': 'text/html' });
    return r.end('<!doctype html><iframe id="f" src="swoge_wallet.html" style="width:1400px;height:900px;border:0"></iframe>');
  }
  const f = path.join(SITE, u);
  if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d);
  });
});

(async () => {
  await new Promise((ok2) => srv.listen(0, '127.0.0.1', ok2));
  const port = srv.address().port;
  const BASE = 'http://127.0.0.1:' + port;
  const nav = await chromium.launch();

  /* `connecte` : un portefeuille de navigateur factice, et une chaine qui
     repond 0,005 ETH (RH) et zero pour le reste. Sinon, la chaine se tait. */
  const ouvre = async (w, h, connecte) => {
    const page = await nav.newPage({ viewport: { width: w, height: h } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 160)));
    await page.addInitScript((o) => {
      try { sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {}
      if (!o.connecte) return;
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      window.ethereum = { isMetaMask: true, on: () => {}, removeListener: () => {},
        request: async (q) => {
          if (q.method === 'eth_accounts' || q.method === 'eth_requestAccounts') return [o.moi];
          if (q.method === 'eth_chainId') return '0x1237';
          return null; } };
    }, { connecte: !!connecte, moi: MOI });
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route((u) => !u.href.startsWith(BASE) && !/ethers|rpc\.mainnet\.chain\.robinhood/.test(u.href),
                     (r) => r.abort());
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (r) => {
      if (!connecte) return r.abort();
      const q = JSON.parse(r.request().postData() || '{}');
      const seul = !Array.isArray(q), arr = seul ? [q] : q;
      const un = (m) => {
        if (m.method === 'eth_getBalance') return enMot(5000000000000000n);
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') return enMot(134102000n);
        if (m.method === 'eth_call') return enMot(0n);
        return null; };
      const out = arr.map((m) => { const v = un(m);
        return v === null ? { jsonrpc: '2.0', id: m.id, error: { code: -32000, message: 'nope' } }
                          : { jsonrpc: '2.0', id: m.id, result: v }; });
      await r.fulfill({ contentType: 'application/json', body: JSON.stringify(seul ? out[0] : out) });
    });
    await page.goto(BASE + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(connecte ? 2800 : 1800);
    return { page, boum };
  };
  const ecran = (page) => page.evaluate(() =>
    (document.querySelector('.wl-ecran.on') || {}).id || null);

  /* ==================== 1. LE GRAND ECRAN, DECONNECTE ==================== */
  console.log('-- 1440 x 900, deconnecte --');
  {
    const { page, boum } = await ouvre(1440, 900, false);
    const m = await page.evaluate(() => {
      const tel = document.getElementById('tel').getBoundingClientRect();
      const cartes = [...document.querySelectorAll('.vt-carte[data-vt-va]')];
      const chevauche = (r) => r.right > tel.left + 1 && r.left < tel.right - 1 && r.bottom > tel.top && r.top < tel.bottom;
      const cx = tel.left + tel.width / 2, cy = tel.top + tel.height / 2;
      const ici = document.elementFromPoint(cx, cy);
      return {
        titre: document.querySelector('.vt-hero h1').innerText.replace(/\s+/g, ' ').trim(),
        noms: cartes.map((c) => c.querySelector('.vt-ct b').textContent.trim()),
        cible: cartes.map((c) => c.getAttribute('data-vt-va')),
        surLeTel: cartes.filter((c) => chevauche(c.getBoundingClientRect())).length,
        lienVu: getComputedStyle(document.getElementById('vtLiens')).display,
        bord: (() => { const r = (e) => { const x = e.getBoundingClientRect(); return { top: Math.round(x.top), bas: Math.round(x.bottom) }; };
          const g = document.querySelector('.wl-cote.gauche'), d = document.querySelector('.wl-cote.droite');
          const der = (c) => { const k = [...c.querySelectorAll('.vt-carte')].pop(); return k.getBoundingClientRect().bottom; };
          return { t: r(document.getElementById('tel')), g: { top: Math.round(g.querySelector('.vt-sur').getBoundingClientRect().top), bas: Math.round(der(g)) },
                   d: { top: Math.round(d.querySelector('.vt-carte').getBoundingClientRect().top), bas: Math.round(der(d)) } }; })(),
        tronque: [...document.querySelectorAll('.vt-reseau .vt-grille b')].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent),
        auTel: !!(ici && ici.closest('#tel')),
        /* 03/10 : les valeurs des cartes autour du telephone (marche, chaine, coffre, jetons) */
        valeurs: [...document.querySelectorAll('.vt-carte .vt-r b, .vt-carte .vt-grille b, #vtMPrix, .vt-jl .v')].map((b) => b.textContent.trim()),
        menu: [...document.querySelectorAll('.wl-menu .wl-nav a')].map((a) => a.lastChild.textContent.trim()),
        menuG: (() => { const r = document.querySelector('.wl-menu').getBoundingClientRect(); return r.right <= tel.left && r.width > 150; })(),
        tuiles: [...document.querySelectorAll('.vt-tuiles [data-vt-va], .vt-tuiles a')].map((b) => b.getAttribute('data-vt-va') || b.getAttribute('href')),
        table: [...document.querySelectorAll('#vtLignes .vt-tl')].map((l) =>
          [...l.children].slice(1).map((c) => c.textContent.trim())),
        voile: !document.getElementById('vtVoileJetons').hidden,
        cles: [...document.querySelectorAll('#vtAdr, #vtMethode')].map((b) => b.textContent.trim()),
        vitrine: getComputedStyle(document.getElementById('vitrine')).display,
        defile: document.documentElement.scrollHeight > innerHeight,
        api: Object.isFrozen(window.SwogeWallet) && Object.keys(window.SwogeWallet.etat()).sort().join(','),
        largeur: document.documentElement.scrollWidth <= innerWidth + 1
      };
    });
    console.log('   ' + JSON.stringify({ noms: m.noms, bord: m.bord, valeurs: m.valeurs, table: m.table }));
    ok(m.titre === 'YOUR WALLET. YOUR WORLD.',
       'le titre dit « YOUR WALLET. YOUR WORLD. » (' + m.titre + ')');
    /* 03/10 : « le menu, tu nous l as change de place [...] des blocs avec des trous ». */
    ok(m.menuG && m.menu.join(',') === 'Home,Casino,Sports,Wallet,AI Trading,Agents,Launchpad,Docs',
       'le menu du site est revenu dans sa colonne, a gauche du telephone (' + m.menu.join(', ') + ')');
    ok(m.noms.join(',') === '$SWOGE MARKET,ROBINHOOD CHAIN,TOKENS,CASINO GAME VAULT',
       'les cartes autour du telephone disent quelque chose a tout visiteur (' + m.noms.join(', ') + ')');
    ok(m.cible.join(',') === 'ecSwap,ecAccueil,ecJetons,ecCasino', 'et chacune mene a un ecran du telephone');
    ok(m.tuiles.join(',') === 'ecEnvoyer,ecRecevoir,ecSwap,ecPont,ecSwap,ecActivite,launchpad.html,swoge_agents.html',
       'les huit actions rapides ouvrent un ecran du telephone ou une page du site');
    ok(m.surLeTel === 0, 'aucune carte ne couvre le telephone (' + m.surLeTel + ')');
    /* 03/10 (soir) : « on dirait que tu as jete des blocs au hasard ». Les courbes en pointilles
       sont retirees ; ce qui dit ce qui va ensemble, c'est l'alignement : les trois colonnes
       partent du haut du telephone et finissent a son bas. */
    ok(m.lienVu === 'none', 'plus de courbes decoratives vers le telephone (' + m.lienVu + ')');
    ok(Math.abs(m.bord.g.top - m.bord.t.top) <= 2 && Math.abs(m.bord.d.top - m.bord.t.top) <= 2,
       'les deux colonnes partent du HAUT du telephone (' + [m.bord.g.top, m.bord.t.top, m.bord.d.top].join(' / ') + ')');
    ok(Math.abs(m.bord.g.bas - m.bord.t.bas) <= 2 && Math.abs(m.bord.d.bas - m.bord.t.bas) <= 2,
       'et finissent a son BAS (' + [m.bord.g.bas, m.bord.t.bas, m.bord.d.bas].join(' / ') + ')');
    ok(m.tronque.length === 0, 'aucun chiffre de la carte de la chaine n est coupe (' + m.tronque.join(', ') + ')');
    ok(m.auTel, 'un clic au centre du telephone arrive au telephone — les liens ne prennent pas le pointeur');
    ok(m.valeurs.length >= 10 && !m.valeurs.includes('--') && m.valeurs.every((v) => /^(unavailable|Unavailable|…|Loading…|measuring…|4663|Connect to see|Price loading…)$/.test(v)),
       'deconnecte et sans reseau : aucun « -- » (plus de trous), et aucun chiffre invente — seulement « unavailable » ou ce qu il faut faire');
    ok(m.table.length >= 3 && m.table.every((l) => l.every((v) => v === '--')),
       'la table des jetons aussi : solde, valeur et prix a « -- » (' + m.table.length + ' lignes)');
    ok(m.voile, 'et « CONNECT WALLET TO VIEW ASSETS » est pose dessus');
    ok(m.cles.every((v) => v === '--'), 'adresse et methode a « -- »');
    ok(m.vitrine === 'block' && m.defile, 'les sections passent sous le telephone, la page se lit en descendant');
    ok(m.api === 'adresse,chaine,coffre,jetons,methode,verrouille',
       'la vitrine ne voit qu une copie figee de l etat — ni signataire, ni cle (' + m.api + ')');
    ok(m.largeur, 'rien ne deborde horizontalement');

    /* ---- UNE CARTE OUVRE SON ECRAN ---- */
    await page.click('.vt-tuiles button[data-vt-va="ecSwap"]');
    await page.waitForTimeout(300);
    ok((await ecran(page)) === 'ecSwap', 'l action SWAP ouvre l ecran d echange du telephone');
    await page.click('.vt-tuiles button[data-vt-va="ecPont"]');
    await page.waitForTimeout(300);
    ok((await ecran(page)) === 'ecPont', 'l action BRIDGE ouvre le pont');
    await page.click('#vtOuvrir');
    await page.waitForTimeout(300);
    ok((await ecran(page)) === 'ecAccueil', '« OPEN WALLET » ramene le telephone a l accueil');

    /* ---- « CONNECT WALLET » OUVRE LA VRAIE FEUILLE ---- */
    await page.click('#vtConnecte');
    await page.waitForTimeout(400);
    const f = await page.evaluate(() => {
      const r = document.getElementById('cnEmail').getBoundingClientRect();
      return { vue: !document.getElementById('voile').hidden, dedans: r.top >= 0 && r.bottom <= innerHeight };
    });
    ok(f.vue && f.dedans, 'le bouton du bandeau ouvre la feuille de connexion du telephone, dans la fenetre');
    await page.click('#cnFermer');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==================== 2. LES SECTIONS EN PLEINE LARGEUR (03/10) ====================
   * Le telephone suivait la lecture et gardait sa colonne sur toute la hauteur : les sections
   * n avaient plus que ~480 pixels (« des blocs avec des trous »). Il reste en haut ; l intention
   * qui demeure de l ancienne visite : le defilement ne change JAMAIS l ecran du telephone. */
  console.log('\n-- les sections sous le telephone --');
  {
    const { page, boum } = await ouvre(1440, 900, false);
    for (const sel of ['#vtJetons', '#vtSwap', '#vtPont', '#vtCles']) {
      await page.evaluate((s2) => document.querySelector(s2).scrollIntoView({ block: 'center' }), sel);
      await page.waitForTimeout(350);
    }
    const a = await page.evaluate(() => {
      const t = document.getElementById('tel').getBoundingClientRect(), v = document.getElementById('vitrine').getBoundingClientRect();
      const m = document.querySelector('.wl-menu').getBoundingClientRect();
      return { pos: getComputedStyle(document.getElementById('tel')).position, vitrineL: Math.round(v.width), dessous: v.top >= t.bottom - 1,
               rail: getComputedStyle(document.getElementById('vtRail')).display, menuColle: Math.round(m.top) };
    });
    ok((await ecran(page)) === 'ecAccueil', 'en lisant les sections, le telephone garde son ecran — le defilement ne le change jamais');
    ok(a.pos !== 'sticky' && a.dessous && a.vitrineL >= 1000, 'les sections passent SOUS le telephone, sur toute la largeur a droite du menu (' + a.vitrineL + ' px)');
    ok(a.rail === 'none', 'le rail de la visite n a plus de raison d etre : il est range');
    ok(a.menuColle === 68, 'le menu reste colle sous le bandeau pendant la lecture (' + a.menuColle + ')');
    await page.click('.vt-tuiles button[data-vt-va="ecPont"]');
    await page.waitForTimeout(300);
    ok((await ecran(page)) === 'ecPont', 'une action rapide ouvre toujours son ecran, meme en bas de page');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==================== 3. UN PORTABLE PLUS ETROIT ==================== */
  console.log('\n-- 1100 x 800 --');
  {
    const { page, boum } = await ouvre(1100, 800, false);
    await page.evaluate(() => document.getElementById('vtJetons').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const t = document.getElementById('tel').getBoundingClientRect();
      const g = document.querySelector('.vt-cartes').getBoundingClientRect();
      return { pos: getComputedStyle(document.getElementById('tel')).position,
               cartesDessous: g.top >= t.bottom - 1 || g.bottom <= t.top,
               largeur: document.documentElement.scrollWidth <= innerWidth + 1 };
    });
    ok(m.pos !== 'sticky', 'sous 1340 pixels le telephone ne colle pas — il n y a pas la place a cote des sections');
    ok((await ecran(page)) === 'ecAccueil', 'et le defilement ne change donc pas son ecran (on ne le voit plus)');
    ok(m.cartesDessous, 'le titre et les cartes de gauche passent sous lui (pas la place de trois colonnes a cote du menu)');
    ok(m.largeur, 'rien ne deborde horizontalement');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==================== 4. SUR TELEPHONE, L ECRAN EST LE PORTEFEUILLE ==================== */
  console.log('\n-- 390 x 844 --');
  {
    const { page, boum } = await ouvre(390, 844, false);
    const m = await page.evaluate(() => ({
      vitrine: getComputedStyle(document.getElementById('vitrine')).display,
      cartes: getComputedStyle(document.querySelector('.vt-cartes')).display,
      menu: getComputedStyle(document.querySelector('.wl-menu')).display,
      haut: document.documentElement.scrollHeight <= innerHeight + 1
    }));
    ok(m.vitrine === 'none' && m.cartes === 'none' && m.menu === 'none',
       'ni vitrine, ni cartes, ni colonne du menu (' + [m.vitrine, m.cartes, m.menu].join('/') + ')');
    ok(m.haut, 'et la page ne defile pas : le portefeuille tient l ecran');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==================== 5. DANS LE CADRE D UNE AUTRE PAGE ==================== */
  console.log('\n-- dans un cadre --');
  {
    const page = await nav.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route((u) => !u.href.startsWith(BASE) && !/ethers/.test(u.href), (r) => r.abort());
    await page.goto(BASE + '/_cadre.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const f = page.frames().find((x) => /swoge_wallet/.test(x.url()));
    const m = await f.evaluate(() => ({
      cadre: document.documentElement.classList.contains('wl-encadre'),
      caches: ['#vitrine', '.vt-cartes', '.wl-cote.droite', '.wl-menu', '.vt-hdroite']
        .filter((s) => getComputedStyle(document.querySelector(s)).display !== 'none')
    }));
    ok(m.cadre && m.caches.length === 0,
       'dans le voile d une autre page, le portefeuille seul' + (m.caches.length ? ' — visibles : ' + m.caches.join(', ') : ''));
    await page.close();
  }

  /* ==================== 6. CONNECTE : LES CHIFFRES DU TELEPHONE ==================== */
  console.log('\n-- connecte --');
  {
    const { page, boum } = await ouvre(1440, 900, true);
    const m = await page.evaluate(() => {
      const l = [...document.querySelectorAll('#vtLignes .vt-tl')].map((x) =>
        [...x.children].map((c) => c.textContent.trim()));
      return {
        bandeau: document.getElementById('vtConnecte').textContent,
        adr: document.getElementById('vtAdr').textContent,
        methode: document.getElementById('vtMethode').textContent,
        jl: ([...document.querySelectorAll('.vt-jl .l')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).find((x) => /^ETH \(RH\)/.test(x)) || ''),
        jlConnect: document.getElementById('vtJlConnect').hidden,
        eth: (l.find((x) => /^ETH \(RH\)/.test(x[0])) || [])[1],
        surLeTel: (document.querySelector('#acJetons .wl-jeton .val b') || {}).textContent,
        voile: document.getElementById('vtVoileJetons').hidden,
        sortir: !document.getElementById('vtSortir').hidden,
        explorer: document.getElementById('vtExplorer').getAttribute('href'),
        vide: document.getElementById('vtFilVide').hidden
      };
    });
    console.log('   ' + JSON.stringify(m));
    ok(m.adr === MOI, 'l adresse est celle de la session (' + m.adr + ')');
    ok(m.bandeau === MOI.slice(0, 6) + '…' + MOI.slice(-4), 'le bandeau la montre en court (' + m.bandeau + ')');
    ok(/0\.005/.test(m.jl) && m.jlConnect, 'la carte des jetons montre le solde lu par le telephone, et l invitation a se connecter s efface (' + m.jl + ')');
    ok(m.methode === 'Browser wallet', 'la methode de connexion est dite (' + m.methode + ')');
    ok(m.eth === '0.005' && m.eth === m.surLeTel,
       'le solde ETH (RH) de la table est celui que le telephone a lu (' + m.eth + ' / ' + m.surLeTel + ')');
    ok(m.voile && m.sortir && m.vide, 'le voile tombe, « Disconnect » apparait, l etat vide de l activite s efface');
    ok(m.explorer === 'https://robinhoodchain.blockscout.com/address/' + MOI,
       'l explorateur ouvre CETTE adresse');
    await page.click('#vtSortir');
    await page.waitForTimeout(500);
    const apres = await page.evaluate(() => ({
      adr: document.getElementById('vtAdr').textContent,
      tel: document.getElementById('cpEtat').textContent }));
    ok(apres.adr === '--' && apres.tel === 'Not connected',
       '« Disconnect » est celui du telephone : la vitrine et le compte se vident ensemble');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==================== 7. SANS LA BIBLIOTHEQUE DE CHAINE ====================
   * Le CDN d ethers peut tomber, ou etre bloque par une extension. Le
   * telephone le dit ; la vitrine, elle, restait morte — le crochet etait
   * pose APRES l arret du script. */
  console.log('\n-- sans la bibliotheque de chaine --');
  {
    const page = await nav.newPage({ viewport: { width: 1440, height: 900 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 160)));
    await page.addInitScript(() => { try { sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {} });
    await page.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
    await page.goto(BASE + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.click('.vt-tuiles button[data-vt-va="ecPont"]');
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({
      api: !!window.SwogeWallet,
      valeurs: [...document.querySelectorAll('.vt-carte .vt-r b, .vt-carte .vt-grille b, #vtMPrix, .vt-jl .v, #vtLignes .vt-tl > span:not(.vt-tok)')]
        .map((b) => b.textContent.trim()) }));
    ok(m.api && (await ecran(page)) === 'ecPont', 'la vitrine reste vivante : l action BRIDGE ouvre le pont');
    ok(m.valeurs.length > 0 && m.valeurs.every((v) => /^(--|unavailable|Unavailable|…|Loading…|measuring…|4663|Connect to see|Price loading…)$/.test(v)),
       'et rien ne s y ecrit d invente : « -- », « unavailable » ou ce qu il faut faire');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==================== 8. LE MARCHE ET LA CHAINE, EN DIRECT (03/10) ====================
   * Les valeurs relevees le 03/10 (DexScreener, paire $SWOGE / WETH ; noeud public) : la carte
   * les ecrit telles quelles, et le temps de bloc se MESURE entre deux lectures. */
  console.log('\n-- le marche et la chaine, en direct --');
  {
    const page = await nav.newPage({ viewport: { width: 1536, height: 1024 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 160)));
    await page.addInitScript(() => { try { sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {} });
    await page.route((u) => !u.href.startsWith(BASE) && !/dexscreener|rpc\.mainnet\.chain\.robinhood/.test(u.href), (r) => r.abort());
    let demandesDex = 0;
    await page.route('**/api.dexscreener.com/**', (r) => { demandesDex++; r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ pairs: [{ priceUsd: '0.00002127', priceChange: { h24: -16.43 }, liquidity: { usd: 12236.9 }, volume: { h24: 766.52 }, marketCap: 20993, txns: { h24: { buys: 1, sells: 4 } } }] }) }); });
    let bloc = 0x1c26000, t = 1759460000;
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      if (q.method === 'eth_getBlockByNumber') { bloc += 20; t += 5; }
      const res = q.method === 'eth_gasPrice' ? '0x1c260e0' : q.method === 'eth_getBlockByNumber' ? { number: '0x' + bloc.toString(16), timestamp: '0x' + t.toString(16) } : null;
      r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(res === null ? { jsonrpc: '2.0', id: q.id, error: { code: -32000, message: 'nope' } } : { jsonrpc: '2.0', id: q.id, result: res }) });
    });
    await page.goto(BASE + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5500);
    const v = await page.evaluate(() => Object.fromEntries(['vtMPrix', 'vtMVar', 'vtMLiq', 'vtMVol', 'vtMTx', 'vtMCap', 'vtRBloc', 'vtRGaz', 'vtRTemps', 'vtRDirect']
      .map((i) => [i, document.getElementById(i).textContent.trim()])));
    const jeton = await page.evaluate(() => [...document.querySelectorAll('.vt-jl .l')].map((l) => l.innerText.replace(/\s+/g, ' ').trim()).find((x) => /^SWOGE Swole/.test(x)) || '');
    ok(v.vtMPrix === '$0.00002127' && v.vtMVar === '-16.43% 24h' && v.vtMLiq === '$12.2K' && v.vtMVol === '$767' && v.vtMTx === '5' && v.vtMCap === '$21.0K',
       'la carte du marche ecrit ce que DexScreener rend (' + [v.vtMPrix, v.vtMVar, v.vtMLiq, v.vtMVol, v.vtMTx, v.vtMCap].join(' · ') + ')');
    ok(/^#29,5\d\d,\d{3}$/.test(v.vtRBloc) && v.vtRGaz === '0.03 gwei' && v.vtRTemps === '0.25 s' && v.vtRDirect === 'LIVE',
       'la carte de la chaine : bloc, gaz, et un temps de bloc MESURE entre deux lectures (' + [v.vtRBloc, v.vtRGaz, v.vtRTemps].join(' · ') + ')');
    ok(/\$0\.00002127/.test(jeton), 'le $SWOGE a son prix de marche dans la carte des jetons, avant que le telephone ait le sien (' + jeton + ')');
    ok(demandesDex === 1, 'une seule lecture du marche au chargement (' + demandesDex + ') — puis toutes les 30 s');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
