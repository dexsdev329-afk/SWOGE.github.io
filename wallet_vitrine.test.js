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
        liens: document.querySelectorAll('#vtLiens path').length,
        auTel: !!(ici && ici.closest('#tel')),
        /* (le carre de la ligne « QR code » est un pictogramme, pas une valeur) */
        valeurs: [...document.querySelectorAll('.vt-carte .vt-r b:not(.vt-qr), #vtRecAdr')].map((b) => b.textContent.trim()),
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
    console.log('   ' + JSON.stringify({ noms: m.noms, liens: m.liens, valeurs: m.valeurs, table: m.table }));
    ok(m.titre === 'YOUR WALLET. YOUR WORLD.',
       'le titre dit « YOUR WALLET. YOUR WORLD. » (' + m.titre + ')');
    ok(m.noms.join(',') === 'SEND,RECEIVE,ACTIVITY,SWAP,BRIDGE,CASINO GAME VAULT',
       'les six cartes sont la, dans l ordre (' + m.noms.join(', ') + ')');
    ok(m.cible.join(',') === 'ecEnvoyer,ecRecevoir,ecActivite,ecSwap,ecPont,ecCasino',
       'et chacune mene a son ecran du telephone');
    ok(m.surLeTel === 0, 'aucune carte ne couvre le telephone (' + m.surLeTel + ')');
    ok(m.liens === 6, 'six liens relient les cartes au telephone (' + m.liens + ')');
    ok(m.auTel, 'un clic au centre du telephone arrive au telephone — les liens ne prennent pas le pointeur');
    ok(m.valeurs.length >= 12 && m.valeurs.every((v) => v === '--'),
       'deconnecte et sans chaine, chaque chiffre des cartes s ecrit « -- » — rien d invente');
    ok(m.table.length >= 3 && m.table.every((l) => l.every((v) => v === '--')),
       'la table des jetons aussi : solde, valeur et prix a « -- » (' + m.table.length + ' lignes)');
    ok(m.voile, 'et « CONNECT WALLET TO VIEW ASSETS » est pose dessus');
    ok(m.cles.every((v) => v === '--'), 'adresse et methode a « -- »');
    ok(m.vitrine === 'block' && m.defile, 'les sections passent sous le telephone, la page se lit en descendant');
    ok(m.api === 'adresse,chaine,coffre,jetons,methode,verrouille',
       'la vitrine ne voit qu une copie figee de l etat — ni signataire, ni cle (' + m.api + ')');
    ok(m.largeur, 'rien ne deborde horizontalement');

    /* ---- UNE CARTE OUVRE SON ECRAN ---- */
    await page.click('.wl-cote.droite .vt-carte[data-vt-va="ecSwap"] .vt-ct');
    await page.waitForTimeout(300);
    ok((await ecran(page)) === 'ecSwap', 'la carte SWAP ouvre l ecran d echange du telephone');
    await page.click('.vt-cartes .vt-carte[data-vt-va="ecPont"], .wl-cote.droite .vt-carte[data-vt-va="ecPont"] .vt-ct');
    await page.waitForTimeout(300);
    ok((await ecran(page)) === 'ecPont', 'la carte BRIDGE ouvre le pont');
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

  /* ==================== 2. LE TELEPHONE SUIT LA LECTURE ==================== */
  console.log('\n-- la visite au defilement --');
  {
    const { page, boum } = await ouvre(1440, 900, false);
    const va = async (sel) => {
      await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
      await page.waitForTimeout(500);
    };
    await va('#vtJetons');
    const a = await page.evaluate(() => {
      const t = document.getElementById('tel').getBoundingClientRect();
      return { top: Math.round(t.top), bas: Math.round(t.bottom), h: innerHeight,
               rail: (document.querySelector('.vt-rail a.on') || {}).textContent };
    });
    ok((await ecran(page)) === 'ecJetons', 'la section des jetons montre l ecran « Tokens »');
    ok(a.rail && /Tokens/.test(a.rail), 'et le rail le dit (' + a.rail + ')');
    ok(a.top === 68 && a.bas <= a.h, 'le telephone reste entier dans la fenetre pendant la lecture (' + a.top + '–' + a.bas + ')');
    await va('#vtSwap');
    ok((await ecran(page)) === 'ecSwap', 'puis l echange');
    await va('#vtPont');
    ok((await ecran(page)) === 'ecPont', 'puis le pont');
    await va('#vtCasino');
    ok((await ecran(page)) === 'ecPont',
       'le coffre du casino n est PAS ouvert par un defilement — son ecran ouvre une liaison avec le serveur');

    /* ---- UNE FEUILLE OUVERTE ARRETE TOUT ---- */
    await page.evaluate(() => window.SwogeWallet.ouvreConnexion());
    await va('#vtCles');
    ok((await ecran(page)) === 'ecPont', 'feuille de connexion ouverte : le defilement ne change pas l ecran');
    await page.click('#cnFermer');

    /* ---- LE PREMIER GESTE DANS LE TELEPHONE ARRETE LA VISITE ---- */
    await page.evaluate(() => document.getElementById('tel')
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await va('#vtJetons');
    await va('#vtCles');
    const note = await page.evaluate(() => document.getElementById('vtRailNote').textContent);
    ok((await ecran(page)) === 'ecPont',
       'apres un geste dans le telephone, le defilement ne change plus jamais son ecran');
    ok(/no longer/.test(note), 'et le rail le dit (« ' + note + ' »)');
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
    ok(m.cartesDessous, 'les trois cartes de gauche passent en rangee sous lui');
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
      menu: getComputedStyle(document.querySelector('.wl-nav')).display,
      haut: document.documentElement.scrollHeight <= innerHeight + 1
    }));
    ok(m.vitrine === 'none' && m.cartes === 'none' && m.menu === 'none',
       'ni vitrine, ni cartes, ni menu du bandeau (' + [m.vitrine, m.cartes, m.menu].join('/') + ')');
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
      caches: ['#vitrine', '.vt-cartes', '.wl-cote.droite', '.wl-nav', '.vt-hdroite']
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
        recoit: document.getElementById('vtRecAdr').textContent,
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
    ok(m.bandeau === MOI.slice(0, 6) + '…' + MOI.slice(-4) && m.recoit === m.bandeau,
       'le bandeau et la carte RECEIVE la montrent en court (' + m.bandeau + ')');
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

  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
