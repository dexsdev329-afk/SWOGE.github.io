'use strict';
/*
 * LE PORTEFEUILLE NE DOIT JAMAIS FAIRE PASSER « INCONNU » POUR « ZERO ».
 *
 * C'est la promesse centrale de cette page, et la seule dont l'echec
 * coute vraiment : un joueur qui lit « 0 » ou « aucune transaction » croit
 * son argent parti. « — » avec une phrase qui l'explique ne ment pas.
 *
 * L'essai coupe donc le reseau de la page — le RPC, puis la bibliotheque
 * de chaine — et exige qu'elle le DISE a chaque fois.
 *
 * Il verifie aussi ce qui ne doit pas y etre : la maquette d'origine
 * montrait cinq jetons, dont trois qui n'existent sur aucune chaine.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
const ETHERS = '/home/user/swoge-pusher-server.github.io/node_modules/ethers/dist/ethers.umd.min.js';
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('wallet_page.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
            '.webp':'image/webp', '.png':'image/png' };

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

  const ouvre = async (opts) => {
    opts = opts || {};
    const p = await nav.newPage({ viewport: opts.tel ? { width: 390, height: 844 }
                                                     : { width: 1280, height: 1000 } });
    const boum = [];
    p.on('pageerror', (e) => boum.push(e.message));
    /* La bibliotheque de chaine vient d'un CDN que ce bac a sable ne joint
       pas : on la sert du disque, sauf quand l'essai veut justement son
       absence. */
    if (!opts.sansEthers) {
      await p.route('**/ethers*.umd.min.js', (r) => r.fulfill({
        contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    } else {
      await p.route('**/ethers*.umd.min.js', (r) => r.abort());
    }
    await p.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(opts.attente || 2200);
    return { p, boum };
  };

  /* 1. LA FORME */
  console.log('-- le telephone --');
  {
    const { p, boum } = await ouvre();
    const m = await p.evaluate(() => {
      const t = document.getElementById('tel').getBoundingClientRect();
      const vus = [...document.querySelectorAll('.wl-ecran')]
        .filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id);
      /* Le voile de connexion est cache : s'il avalait les clics, aucun
         bouton du portefeuille ne repondrait — le meme piege que
         `display:flex` contre `hidden` sur DEAD SWOGE. */
      const b = document.querySelector('#pied button:nth-child(3)').getBoundingClientRect();
      const sur = document.elementFromPoint(Math.round(b.left + b.width / 2),
                                            Math.round(b.top + b.height / 2));
      return { l: Math.round(t.width), h: Math.round(t.height), vus,
               touche: sur ? (sur.closest('#voile') ? 'voile' : 'bouton') : null,
               deborde: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    ok(m.l === 390, 'le cadre fait 390 px de large sur ordinateur (' + m.l + ')');
    ok(m.vus.length === 1, 'un seul ecran est visible a la fois (' + m.vus.join(', ') + ')');
    ok(m.touche === 'bouton',
       'le voile de connexion cache n avale pas les clics — sinon aucun bouton ne repondrait');
    ok(!m.deborde, 'la page ne deborde pas horizontalement');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    /* et sur telephone, le cadre remplit l ecran */
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(300);
    const t2 = await p.evaluate(() => Math.round(document.getElementById('tel').getBoundingClientRect().width));
    ok(t2 >= 380, 'et il remplit la largeur sur telephone (' + t2 + ')');
    await p.close();
  }

  /* 2. L ECOSYSTEME N A QUE DEUX JETONS */
  console.log('\n-- ce qui est montre --');
  {
    const { p } = await ouvre();
    /* Le texte VU, pas `body.textContent` : celui-ci inclut la source des
       <script>, et le commentaire qui explique justement pourquoi ces
       jetons sont absents faisait echouer l'essai. Un essai qui se declenche
       sur sa propre justification ne mesure rien. */
    const t = await p.evaluate(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      let out = '', c;
      while ((c = w.nextNode())) out += c.nodeValue + ' ';
      return out;
    });
    const syms = await p.evaluate(() =>
      [...document.querySelectorAll('#acJetons .wl-jeton .nom b')].map((x) => x.textContent));
    ok(syms.length === 3 && syms.indexOf('SWOGE') >= 0 && syms.indexOf('SWOGEBET') >= 0
       && syms.indexOf('ETH (RH)') >= 0,
       'trois lignes seulement : ETH (RH), SWOGE, SWOGEBET (' + syms.join(', ') + ')');
    /* ---- « ETH » TOUT COURT NE DOIT PLUS SE LIRE COMME UN SOLDE ----
       Le joueur a deux soldes d'ether : celui-ci et celui de la chaine
       principale, dans son autre portefeuille. Les deux ecrits « ETH », il
       croit voir le meme a deux endroits. */
    ok(!syms.some((x) => x === 'ETH'),
       'et aucune ne s appelle « ETH » tout court — c est la confusion qu on cherche a eviter');
    const logos = await p.evaluate(() =>
      [...document.querySelectorAll('#acJetons .wl-jeton')].map((r) => {
        const im = r.querySelector('img');
        return { sym: r.querySelector('.nom b').textContent,
                 src: im ? im.getAttribute('src') : null,
                 charge: im ? (im.naturalWidth > 0) : false };
      }));
    ok(logos.every((x) => x.src && x.charge),
       'les trois jetons ont une piece qui CHARGE vraiment : '
       + logos.map((x) => x.sym + ' ' + (x.charge ? 'ok' : 'MANQUE ' + x.src)).join(', '));
    /* L'ETH empruntait le logo du $SWOGE sur sa fiche : le mauvais jeton sur
       la page d'un vrai solde. */
    const parSym = {}; logos.forEach((x) => (parSym[x.sym] = x.src));
    ok(new Set(logos.map((x) => x.src)).size === 3,
       'et trois pieces DIFFERENTES — aucune n emprunte celle d une autre ('
       + Object.keys(parSym).map((k) => k + '=' + String(parSym[k]).split('/').pop()).join(', ') + ')');
    for (const faux of ['SWOCHIP', 'SWOPOOL', 'SWOXP', 'Solana']) {
      ok(t.indexOf(faux) < 0,
         'aucune trace de « ' + faux +' » — la maquette en montrait, il n existe pas');
    }
    await p.close();
  }

  /* 3. SANS RESEAU, ELLE LE DIT */
  console.log('\n-- quand la chaine ne repond pas --');
  {
    const { p } = await ouvre();
    /* On coupe le RPC APRES le chargement : c'est le cas reel d'un reseau
       qui tombe en cours de route. */
    await p.route('**/rpc.mainnet.chain.robinhood.com/**', (r) => r.abort());
    await p.evaluate(() => {
      document.querySelector('[data-va="ecSwap"]').click();
      document.getElementById('swDe').value = 'eth';
      document.getElementById('swVers').value = 'swogebet';
      document.getElementById('swMontant').value = '0.01';
      document.getElementById('swMontant').dispatchEvent(new Event('input'));
    });
    await p.waitForTimeout(11000);
    const note = await p.evaluate(() => document.getElementById('swNote').textContent);
    const recu = await p.evaluate(() => document.getElementById('swRecu').textContent);
    ok(recu !== '0' && recu !== '0 SWOGEBET',
       'le devis n affiche jamais zero quand la lecture echoue (« ' + recu + ' »)');
    ok(/did not answer|Could not read/i.test(note),
       'et il DIT que la chaine n a pas repondu : « ' + note.slice(0, 70) + ' »');
    ok(/not a price of zero|network problem/i.test(note),
       'en precisant que ce n est pas un prix de zero — un tiret muet se lit comme « rien »');
    await p.close();
  }

  /* 4. SANS LA BIBLIOTHEQUE, ELLE LE DIT AUSSI */
  console.log('\n-- quand la bibliotheque de chaine ne charge pas --');
  {
    const { p, boum } = await ouvre({ sansEthers: true, attente: 2500 });
    const m = await p.evaluate(() => ({
      sous: document.getElementById('acSous').textContent,
      note: document.getElementById('jtNote').textContent,
      total: document.getElementById('acTotal').textContent,
      spinFerme: document.getElementById('btRafraichir').disabled,
    }));
    ok(/could not load/i.test(m.sous), 'l accueil annonce que la bibliotheque manque : « ' + m.sous + ' »');
    ok(/NOT zero|are unknown/i.test(m.note),
       'et il precise que les soldes sont INCONNUS, pas nuls');
    ok(m.total === '—', 'le total reste un tiret, jamais un chiffre invente');
    ok(m.spinFerme === true, 'et les boutons qui liraient la chaine sont fermes');
    ok(boum.length === 0,
       'sans lever une exception a chaque clic' + (boum.length ? ' : ' + boum[0] : ''));
    await p.close();
  }

  /* 5. AUCUN CHIFFRE N EST ECRIT DANS LA PAGE */
  console.log('\n-- rien n est ecrit en dur --');
  {
    const src = fs.readFileSync(path.join(SITE, 'swoge_wallet.html'), 'utf8');
    const corps = src.slice(src.indexOf('<body'));
    /* Les chiffres de la maquette : solde, prix, capitalisation, detenteurs. */
    const inventes = ['15,230', '1.24', '2.88M', '5,436', '12,500', '0.0000288'];
    const trouves = inventes.filter((x) => corps.indexOf(x) >= 0);
    ok(trouves.length === 0,
       'aucun chiffre de la maquette ne subsiste' + (trouves.length ? ' — trouve : ' + trouves.join(', ') : ''));
    ok(/FENETRE = 26000000/.test(src),
       'la fenetre d historique fait 26 millions de blocs : a 0,101 s le bloc, cela fait'
       + ' trente jours — « 100 000 blocs » n en aurait couvert que deux heures et le joueur'
       + ' aurait lu « aucune transaction »');
    ok(/function borne\(/.test(src),
       'toute lecture de chaine est bornee dans le temps : un RPC lent ne rejette pas,'
       + ' il attend, et le tiret resterait sans explication');
  }

  /* 6. LE BOUTON « MAX » */
  console.log('\n-- le bouton MAX --');
  {
    /* ---- ON NE TRICHE PAS AVEC L'INTERIEUR DE LA PAGE ----
     *
     * Son script est une fermeture en mode strict : ni `soldes` ni
     * `calculeMax` n'existent sur `window`, et les poser depuis l'essai
     * ne ferait que creer des jumeaux que la page ignore — l'essai
     * passerait en ne mesurant rien.
     *
     * On lui donne donc une CHAINE, pas des variables : un faux
     * portefeuille d'extension et un faux noeud. La page se connecte,
     * lit ses soldes et remplit son MAX par son vrai chemin. */
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    let etat = { eth: 5000000000000000n, swoge: 1234567890123456789012n,
                 swogebet: 0n, gaz: 134102000n, muet: null };

    const page = await nav.newPage({ viewport: { width: 1280, height: 1000 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(e.message));
    await page.addInitScript(([moi]) => {
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      window.ethereum = {
        isMetaMask: true,
        request: async (a) => {
          if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
          if (a.method === 'eth_chainId') return '0x1237';
          if (a.method === 'net_version') return '4663';
          if (a.method === 'wallet_switchEthereumChain') return null;
          return null;
        },
        on: () => {}, removeListener: () => {},
      };
    }, [MOI]);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    /* Le prix en dollars vient de dexscreener : hors sujet ici, et une
       attente de sept secondes a chaque rafraichissement. */
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const un = (m) => {
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') {
          if (etat.muet === 'gaz') return null;      // le noeud ne repond rien d utile
          return enMot(etat.gaz);
        }
        if (m.method === 'eth_getBalance')
          return etat.eth === null ? null : enMot(etat.eth);
        if (m.method === 'eth_call') {
          const d = (m.params[0].data || '').toLowerCase();
          const a = (m.params[0].to || '').toLowerCase();
          if (d.slice(0, 10) === '0x70a08231') {           // balanceOf
            const v = a.indexOf('8a166fb4') > 0 ? etat.swoge : etat.swogebet;
            return v === null ? null : enMot(v);
          }
          return enMot(0n);
        }
        return null;
      };
      const rep = (m) => { const v = un(m);
        return v === null ? { jsonrpc: '2.0', id: m.id, error: { code: -32000, message: 'nope' } }
                          : { jsonrpc: '2.0', id: m.id, result: v }; };
      const corps = Array.isArray(q) ? q.map(rep) : rep(q);
      await r.fulfill({ contentType: 'application/json', body: JSON.stringify(corps) });
    });

    const recharge = async () => {
      await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                      { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2600);
    };
    await recharge();
    const branche = await page.evaluate(() => ({
      /* L'adresse a quitte cette ligne pour l'en-tete : c'est donc le NOM
         affiche en haut qui dit si la connexion a pris. */
      nom: document.getElementById('acNom').textContent,
      sous: document.getElementById('acSous').textContent,
      lignes: [...document.querySelectorAll('#acJetons .wl-jeton')].map((e) => e.textContent.trim()),
    }));
    ok(branche.nom !== 'Not connected' && branche.nom.length > 0,
       'le faux portefeuille d extension se branche tout seul, et l en-tete porte le joueur'
       + ' (« ' + branche.nom + ' »)');
    ok(branche.sous.indexOf('0x') < 0,
       'et l adresse ne s ecrit plus DEUX fois : elle est en haut, sous le nom, pas aussi'
       + ' sous le total (« ' + branche.sous + ' »)');
    ok(branche.lignes.some((l) => l.indexOf('1,234.57') >= 0),
       'et la page lit ses soldes par son vrai chemin : ' + (branche.lignes[1] || '(rien)'));

    const clic = async (id) => {
      await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
      await page.click('#' + id);
      await page.waitForTimeout(500);
      return page.evaluate(() => ({
        swap: document.getElementById('swMontant').value,
        envoi: document.getElementById('enMontant').value,
        toast: document.getElementById('toast').textContent }));
    };
    const versSwap = (de) => page.evaluate((d) => {
      document.querySelector('[data-va="ecSwap"]').click();
      document.getElementById('swMontant').value = '';
      const s = document.getElementById('swDe');
      s.value = d; s.dispatchEvent(new Event('change'));
    }, de);

    const RESERVE = 134102000n * 450000n;

    /* -- un jeton : tout le solde, au wei pres -- */
    await versSwap('swoge');
    let r = await clic('swMax');
    ok(r.swap === '1234.567890123456789012',
       'sur un jeton, MAX ecrit le solde ENTIER au wei pres (« ' + r.swap + ' »)');

    /* -- l ETH garde de quoi payer la transaction -- */
    await versSwap('eth');
    r = await clic('swMax');
    ok(r.swap !== '0.005',
       'sur l ETH, MAX n ecrit PAS le solde entier — sinon la transaction ne peut plus se payer');
    /* Le montant se relit en wei, pas en flottant : `parseFloat` perd les
       derniers chiffres et la difference mesuree ne vaudrait plus rien. */
    const enWei = (t) => { const m = String(t).split('.');
      return BigInt(m[0]) * (10n ** 18n) + BigInt(((m[1] || '') + '0'.repeat(18)).slice(0, 18)); };
    const ecrit = enWei(r.swap);
    ok(5000000000000000n - ecrit === RESERVE,
       'il garde exactement le prix du gaz fois les 450 000 unites mesurees sur fork ('
       + (Number(RESERVE) / 1e18).toFixed(9) + ' ETH)');
    ok(/Kept .* back for the network fee/.test(r.toast),
       'et il le DIT, au lieu de laisser croire a un arrondi : « ' + r.toast + ' »');

    /* -- ce que MAX ecrit se redevise tout seul -- */
    const mini = await page.evaluate(() => document.getElementById('swMini').textContent);
    ok(mini !== '', 'la ligne du minimum recu existe et suit le montant');

    /* -- un solde plus petit que le frais -- */
    etat.eth = 1000n; await recharge(); await versSwap('eth');
    r = await clic('swMax');
    ok(r.swap === '', 'quand le solde ne couvre meme pas le frais, MAX ne remplit rien');
    ok(/smaller than the network fee/i.test(r.toast), 'et il explique pourquoi : « ' + r.toast + ' »');

    /* -- un solde JAMAIS LU n est pas un solde nul -- */
    etat.eth = null; etat.swoge = null; etat.swogebet = null;
    await recharge(); await versSwap('eth');
    r = await clic('swMax');
    ok(r.swap === '', 'un solde que la chaine n a pas rendu ne remplit rien');
    ok(/unknown, not zero/i.test(r.toast),
       'et la page dit « inconnu », jamais « zero » : « ' + r.toast + ' »');

    /* -- le prix du gaz illisible : on ne devine pas une reserve -- */
    etat.eth = 5000000000000000n; etat.swoge = 777000000000000000000n; etat.swogebet = 0n;
    etat.muet = 'gaz';
    await recharge(); await versSwap('eth');
    r = await clic('swMax');
    ok(r.swap === '',
       'si le prix du gaz ne se lit pas, MAX ne remplit rien : deviner une reserve, c est vider un solde');
    ok(/gas price/i.test(r.toast), 'et il dit ce qui a manque : « ' + r.toast + ' »');
    etat.muet = null;

    /* -- le meme bouton sur l ecran d envoi -- */
    await recharge();
    await page.evaluate(() => {
      const b = document.querySelector('[data-va="ecEnvoyer"]');
      if (b) b.click();
      document.getElementById('enMontant').value = '';
      const s = document.getElementById('enJeton');
      s.value = 'swoge'; s.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(300);
    r = await clic('enMax');
    ok(r.envoi === '777.0', 'l ecran d envoi a le meme bouton, et il marche aussi (« ' + r.envoi + ' »)');

    /* -- le bouton tient DANS la case, et c est bien lui qu on touche -- */
    const geo = await page.evaluate(() => {
      const b = document.getElementById('enMax').getBoundingClientRect();
      const c = document.getElementById('enMontant').getBoundingClientRect();
      const sur = document.elementFromPoint(Math.round(b.left + b.width / 2),
                                            Math.round(b.top + b.height / 2));
      return { dedans: b.left >= c.left - 1 && b.right <= c.right + 1
                     && b.top >= c.top - 1 && b.bottom <= c.bottom + 1,
               touche: sur ? sur.id : null };
    });
    ok(geo.dedans, 'MAX tient dans la case du montant, sans deborder');
    ok(geo.touche === 'enMax',
       'et un doigt pose dessus touche le bouton, pas la case (' + geo.touche + ')');

    ok(boum.length === 0, 'aucune exception pendant tout ca' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* 7. LE CHOIX D UN JETON MONTRE SA PIECE — SANS TOUCHER AU CHEMIN DE L ARGENT
   *
   * Un `<select>` natif ne sait pas afficher d image : on choisissait en
   * texte ce qu on venait de reconnaitre a l oeil sur l accueil. Le miroir
   * pose par-dessus montre les pieces, mais TOUT le code de l envoi et de
   * l echange lit encore le `<select>` cache. Ce qui doit tenir :
   *
   *   - `.value` rend toujours la CLE ('eth', 'swoge', 'swogebet'). Deux
   *     endroits signent des transactions a partir d elle.
   *   - une ecriture NUE de `.value` — sans evenement — repeint quand meme.
   *     Sinon le bouton annonce un jeton et la signature en emploie un autre.
   *   - `change` part encore, et depuis l element lui-meme.
   *   - la liste ne sort pas du cadre du telephone, qui coupe.
   */
  console.log('\n-- choisir un jeton, et voir sa piece --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    const etat = { eth: 4938654000000000n, swoge: 1234567890123456789012n,
                   swogebet: 98765000000000000000n, gaz: 134102000n };
    const page = await nav.newPage({ viewport: { width: 1280, height: 1000 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(e.message));
    await page.addInitScript(([moi]) => {
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      window.ethereum = { isMetaMask: true, on: () => {}, removeListener: () => {},
        request: async (a) => {
          if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
          if (a.method === 'eth_chainId') return '0x1237';
          if (a.method === 'net_version') return '4663';
          return null; } };
    }, [MOI]);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const un = (m) => {
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') return enMot(etat.gaz);
        if (m.method === 'eth_getBalance') return enMot(etat.eth);
        if (m.method === 'eth_call') {
          const d = (m.params[0].data || '').toLowerCase();
          const a = (m.params[0].to || '').toLowerCase();
          if (d.slice(0, 10) === '0x70a08231')
            return enMot(a.indexOf('8a166fb4') > 0 ? etat.swoge : etat.swogebet);
          return enMot(0n);
        }
        return null;
      };
      const rep = (m) => { const v = un(m);
        return v === null ? { jsonrpc: '2.0', id: m.id, error: { code: -32000, message: 'nope' } }
                          : { jsonrpc: '2.0', id: m.id, result: v }; };
      await r.fulfill({ contentType: 'application/json',
        body: JSON.stringify(Array.isArray(q) ? q.map(rep) : rep(q)) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);

    const bouton = (id) => page.evaluate((i) =>
      document.querySelector('.wl-pick[data-pour="' + i + '"] .wl-pick-b .tx b').textContent, id);

    /* -- les pieces sont bien dans la liste, pas seulement sur l accueil -- */
    await page.evaluate(() => document.querySelector('[data-va="ecEnvoyer"]').click());
    await page.waitForTimeout(250);
    await page.click('#enJetonB');
    await page.waitForTimeout(250);
    const lignes = await page.evaluate(() =>
      [...document.querySelectorAll('.wl-pick[data-pour="enJeton"] .wl-pick-o')].map((o) => {
        const im = o.querySelector('img');
        return { sym: o.querySelector('.tx b').textContent,
                 logo: im ? im.getAttribute('src') : null,
                 charge: im ? im.naturalWidth > 0 : false };
      }));
    ok(lignes.length === 3, 'la liste du Send propose les trois jetons (' + lignes.length + ')');
    ok(lignes.every((x) => x.logo && x.charge),
       'et chacun y montre SA piece, chargee : '
       + lignes.map((x) => x.sym + (x.charge ? '' : ' MANQUE')).join(', '));
    ok(new Set(lignes.map((x) => x.logo)).size === 3,
       'trois pieces differentes — aucune n emprunte celle d une autre');

    /* -- le cadre du telephone coupe : la liste doit tenir dedans -- */
    const cadre = await page.evaluate(() => {
      const l = document.querySelector('.wl-pick[data-pour="enJeton"] .wl-pick-l');
      const t = document.getElementById('tel');
      const rl = l.getBoundingClientRect(), rt = t.getBoundingClientRect();
      return { dedans: rl.top >= rt.top - 1 && rl.bottom <= rt.bottom + 1
                     && rl.left >= rt.left - 1 && rl.right <= rt.right + 1,
               bas: Math.round(rl.bottom), cadre: Math.round(rt.bottom) };
    });
    ok(cadre.dedans,
       'la liste ouverte tient dans le cadre du telephone — `#tel` est en overflow:hidden,'
       + ' ce qui en sort n est pas seulement invisible, il est INCHOISISSABLE'
       + (cadre.dedans ? '' : ' (bas ' + cadre.bas + ' pour un cadre a ' + cadre.cadre + ')'));

    /* -- choisir a la souris ecrit la CLE, pas le symbole -- */
    await page.click('.wl-pick[data-pour="enJeton"] .wl-pick-o[data-cle="swoge"]');
    await page.waitForTimeout(300);
    const apres = await page.evaluate(() => ({
      val: document.getElementById('enJeton').value,
      solde: document.getElementById('enSolde').textContent }));
    ok(apres.val === 'swoge',
       '`.value` rend la CLE du jeton, jamais son symbole — deux transactions se'
       + ' signent a partir d elle (' + apres.val + ')');
    ok(await bouton('enJeton') === 'SWOGE', 'et le bouton suit le choix');
    ok(/SWOGE/.test(apres.solde) && !/ETH/.test(apres.solde),
       'le `change` est bien parti : la ligne Balance a suivi (' + apres.solde + ')');

    /* -- UNE ECRITURE NUE DE .value REPEINT -- */
    await page.evaluate(() => document.querySelector('[data-va="ecSwap"]').click());
    await page.waitForTimeout(300);
    const nu = await page.evaluate(() => {
      /* Ni evenement, ni passage par le miroir : exactement ce que fait la
         page elle-meme a trois endroits, et ce que font les essais. */
      document.getElementById('swVers').value = 'swoge';
      return { val: document.getElementById('swVers').value,
               bouton: document.querySelector('.wl-pick[data-pour="swVers"] .wl-pick-b .tx b').textContent };
    });
    ok(nu.val === 'swoge' && nu.bouton === 'SWOGE',
       'une ecriture NUE de `.value` repeint le miroir (' + nu.bouton + ') — sans ca le joueur'
       + ' lirait un jeton et en signerait un autre');

    /* -- au clavier, comme un vrai select -- */
    await page.focus('#swDeB');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const ouvert = await page.evaluate(() =>
      !document.querySelector('.wl-pick[data-pour="swDe"] .wl-pick-l').hidden);
    ok(ouvert, 'Entree ouvre la liste au clavier');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.getElementById('swDe').value) !== 'eth',
       'Fleche bas puis Entree change le jeton');
    ok(await page.evaluate(() =>
         document.activeElement && document.activeElement.id === 'swDeB'),
       'et le focus revient sur le bouton — sinon la tabulation repart du haut de la page');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    ok(await page.evaluate(() =>
         document.querySelector('.wl-pick[data-pour="swDe"] .wl-pick-l').hidden),
       'Echap referme sans rien changer');

    /* -- un seul menu ouvert a la fois -- */
    await page.click('#swDeB'); await page.waitForTimeout(150);
    await page.click('#swVersB'); await page.waitForTimeout(200);
    ok(await page.evaluate(() =>
         document.querySelectorAll('.wl-pick.ouvert').length === 1),
       'un seul menu ouvert a la fois — deux superposes, on clique dans celui qu on ne regarde pas');

    /* -- le `<select>` cache ne prend pas le focus au passage -- */
    ok(await page.evaluate(() =>
         [...document.querySelectorAll('select')].every((s) => s.tabIndex === -1)),
       'le `<select>` garde la valeur mais sort de la tabulation : sinon on tabule deux fois'
       + ' sur le meme choix');

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* 7 bis. LA CLE NE S OFFRE QU A QUI ELLE APPARTIENT
   *
   * Un portefeuille d extension garde sa propre cle : cette page ne la
   * detient pas et ne peut pas la montrer. Proposer le bouton dans ce
   * cas-la promettrait quelque chose d impossible — et sur un ecran qui
   * parle de cles privees, une promesse creuse est le pire endroit ou en
   * faire une.
   */
  console.log('\n-- la cle privee, et a qui on la propose --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    for (const cas of [{ nom: 'extension', auth: 'wallet', attendu: false },
                       { nom: 'pas connecte', auth: null, attendu: false }]) {
      const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
      await page.addInitScript(([moi, a]) => {
        if (a) { try { localStorage.setItem('swogeAuth', a); } catch (e) {} }
        window.ethereum = { isMetaMask: true, on: () => {}, removeListener: () => {},
          request: async (q) => {
            if (q.method === 'eth_accounts' || q.method === 'eth_requestAccounts') return [moi];
            if (q.method === 'eth_chainId') return '0x1237';
            if (q.method === 'net_version') return '4663';
            return null; } };
      }, [MOI, cas.auth]);
      await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
        contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
      await page.route('**/api.dexscreener.com/**', (r) => r.abort());
      await page.route('**/avatar/**', (r) => r.fulfill({ status: 404, body: '' }));
      await page.route('**/nom/**', (r) => r.abort());
      await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (r) => {
        const q = JSON.parse(r.request().postData() || '{}');
        const seul = !Array.isArray(q); const arr = seul ? [q] : q;
        const un = (m) => {
          if (m.method === 'eth_getBalance') return enMot(5000000000000000n);
          if (m.method === 'eth_chainId') return '0x1237';
          if (m.method === 'net_version') return '4663';
          if (m.method === 'eth_blockNumber') return '0x2f7ce78';
          if (m.method === 'eth_getLogs') return [];
          if (m.method === 'eth_gasPrice') return enMot(134102000n);
          if (m.method === 'eth_call') return enMot(0n);
          return null; };
        const out = arr.map((m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) }));
        await r.fulfill({ contentType: 'application/json',
          body: JSON.stringify(seul ? out[0] : out) });
      });
      await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                      { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2400);
      await page.evaluate(() => {
        const b = document.querySelector('[data-va="ecCompte"]'); if (b) b.click(); });
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => ({
        methode: document.getElementById('cpMethode').textContent,
        offerte: !document.getElementById('cpBlocCle').hidden,
      }));
      ok(m.offerte === cas.attendu,
         cas.nom + ' (« ' + m.methode + ' ») : la cle '
         + (cas.attendu ? 'est proposee' : 'n est PAS proposee — cette page ne la detient pas'));
      await page.close();
    }
    /* Et le chemin y mene vraiment : la page qui montre la cle existe. */
    ok(fs.existsSync(path.join(SITE, 'wallet-export.html')),
       'la page qui montre la cle existe bien sur le disque — un bouton qui ouvre'
       + ' une page absente serait pire que pas de bouton');
    const src = fs.readFileSync(path.join(SITE, 'swoge_wallet.html'), 'utf8');
    ok(/window\.open\('wallet-export\.html'/.test(src),
       'et on l OUVRE plutot que de l incorporer : elle charge son propre paquet Privy,'
       + ' et deux paquets sur la meme page se marchent dessus');
  }

  /* 7 ter. PLUSIEURS COMPTES — ET LE SIGNATAIRE QUI DOIT SUIVRE
   *
   * Les comptes supplementaires sont derives du premier, a la maniere d un
   * Phantom : meme graine, index suivant.
   *
   * LE DANGER de cet ecran tient en une ligne : `provider.getSigner()` ne
   * prend AUCUNE adresse — il est lie au compte par defaut de SON
   * fournisseur. Changer l adresse affichee sans refaire le fournisseur
   * laisserait donc la signature sur l ancien compte : le joueur regarderait
   * un solde et signerait depuis un autre. On le verifie par le SOLDE, qui
   * est lu a la chaine pour l adresse active — s il suit, c est que toute la
   * chaine a suivi.
   *
   * Privy est entierement remplace ici : on essaie l ecran, pas leur reseau.
   */
  console.log('\n-- plusieurs comptes --');
  {
    const A0 = '0x00000000000000000000000000000000000a0000';
    const A1 = '0x00000000000000000000000000000000000a1111';
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    /* Deux soldes DIFFERENTS : c est ce qui rend la bascule verifiable. */
    const SOLDES = { [A0]: 7000000000000000n, [A1]: 2000000000000000n };

    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(e.message));
    await page.route('**/privy-swoge.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: `
      var comptes=[{adresse:'${A0}',index:0},{adresse:'${A1}',index:1}];
      var actif=0, refuse=false;
      function prov(i){ return { on(){}, removeListener(){}, request: async a=>{
        if(a.method==='eth_accounts'||a.method==='eth_requestAccounts') return [comptes[i].adresse];
        if(a.method==='eth_chainId') return '0x1237';
        if(a.method==='net_version') return '4663';
        return null; } }; }
      window.__refuseAjout=function(){ refuse=true; };
      window.SwogePrivy={
        init(){}, sendCode:async()=>{}, verifyCode:async()=>comptes[0].adresse,
        logout:async()=>{}, restore:async()=>comptes[actif].adresse,
        getProvider:()=>prov(actif), getAddress:()=>comptes[actif].adresse,
        isLoggedIn:()=>true,
        comptes:()=>comptes.slice(),
        indexCompte:()=>comptes[actif].index,
        choisitCompte:async n=>{ actif=comptes.findIndex(c=>c.index===n); return comptes[actif].adresse; },
        ajouteCompte:async()=>{ if(refuse){ var e=new Error('additional wallets are not enabled for this app');
          e.type='invalid_request_arguments'; throw e; }
          comptes.push({adresse:'0x00000000000000000000000000000000000a2222',index:2}); return 2; },
      };` }));
    await page.addInitScript(() => { try { localStorage.setItem('swogeAuth', 'email'); } catch (e) {} });
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/api.dexscreener.com/**', (r) => r.abort());
    await page.route('**/avatar/**', (r) => r.fulfill({ status: 404, body: '' }));
    await page.route('**/nom/**', (r) => r.abort());
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const seul = !Array.isArray(q); const arr = seul ? [q] : q;
      const un = (m) => {
        if (m.method === 'eth_getBalance') {
          const a = String(m.params[0] || '').toLowerCase();
          return enMot(SOLDES[a] !== undefined ? SOLDES[a] : 0n);
        }
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') return enMot(134102000n);
        if (m.method === 'eth_call') return enMot(0n);
        return null; };
      const out = arr.map((m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) }));
      await r.fulfill({ contentType: 'application/json',
        body: JSON.stringify(seul ? out[0] : out) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2800);
    await page.evaluate(() => document.querySelector('[data-va="ecCompte"]').click());
    await page.waitForTimeout(400);

    const etat = () => page.evaluate(() => ({
      n: document.querySelectorAll('#cpListe .wl-cpt').length,
      actif: (document.querySelector('#cpListe .wl-cpt.on') || {}).textContent || '',
      adr: document.getElementById('cpAdr').textContent,
      solde: (document.querySelector('#acJetons .wl-jeton .val b') || {}).textContent || '',
    }));

    let e = await etat();
    ok(e.n === 2, 'les deux comptes sont listes (' + e.n + ')');
    ok(e.actif.indexOf('0x0000…0000') >= 0, 'et le premier est marque en service');

    await page.click('#cpListe .wl-cpt[data-compte="1"]');
    await page.waitForTimeout(1800);
    e = await etat();
    ok(e.actif.indexOf('0x0000…1111') >= 0, 'apres la bascule, c est le second qui est en service');
    ok(e.adr === '0x0000…1111', 'et l ecran Compte porte la nouvelle adresse (' + e.adr + ')');

    /* LA verification qui compte : le solde vient de la chaine, pour
       l adresse active. S il a change, c est que le fournisseur, le
       signataire et l adresse ont TOUS suivi — pas seulement l affichage. */
    await page.evaluate(() => document.querySelector('[data-va="ecAccueil"]').click());
    await page.waitForTimeout(900);
    e = await etat();
    ok(e.solde === '0.002',
       'et le solde est celui du NOUVEAU compte, relu a la chaine (' + e.solde + ' au lieu de 0.007)'
       + ' — c est la preuve que le fournisseur a ete refait : `getSigner()` ne prend aucune adresse,'
       + ' il suit son fournisseur, donc un fournisseur non refait aurait signe depuis l ancien compte');

    /* Un refus de creation doit se DIRE, avec ce que Privy a repondu. */
    await page.evaluate(() => { window.__refuseAjout();
      document.querySelector('[data-va="ecCompte"]').click(); });
    await page.waitForTimeout(300);
    await page.click('#cpAjoute');
    await page.waitForTimeout(1400);
    const note = await page.evaluate(() =>
      document.getElementById('cpNoteComptes').textContent);
    ok(/invalid_request_arguments/.test(note) && /not enabled for this app/.test(note),
       'un refus rapporte le type ET le message de Privy, pas un « failed » generique :'
       + ' « ' + note.slice(0, 90) + ' »');
    ok(/untouched/.test(note),
       'et il dit que le compte existant n a pas bouge — c est la premiere inquietude');

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* 8. SUR UN TELEPHONE : PAS DE ZOOM, ET LES ONGLETS SONT LA
   *
   * Deux defauts qui ne se voient pas sur un ecran d ordinateur :
   *
   *   - Safari sur iOS agrandit la page des qu on touche un champ dont la
   *     police fait moins de SEIZE pixels, et ne redezoome pas en sortant.
   *     Le cadre etant en `overflow:hidden`, on reste coince dans une page
   *     trop grande dont les bords sont coupes.
   *
   *   - `.wl-ecran` reclamait `height:100%` du cadre. Il ne restait rien
   *     pour la barre d onglets, et `overflow:hidden` la coupait purement et
   *     simplement : sur un telephone de 667 px de haut elle tombait
   *     quatre-vingt-dix pixels sous le bord. Home, Tokens, Swap, Activity
   *     et Account devenaient inatteignables — et sur un grand telephone il
   *     y avait juste assez de mou pour que rien ne paraisse.
   *
   * On mesure donc sur QUATRE tailles, dont deux courtes : le defaut ne se
   * revelait que la.
   */
  console.log('\n-- sur un telephone --');
  {
    const TAILLES = [
      { nom: 'iPhone SE', w: 375, h: 667 },
      { nom: 'iPhone 12', w: 390, h: 844 },
      { nom: 'Pixel 5',   w: 393, h: 851 },
      { nom: '320 px',    w: 320, h: 568 },
    ];
    for (const d of TAILLES) {
      const ctx = await nav.newContext({ viewport: { width: d.w, height: d.h },
                                         isMobile: true, hasTouch: true });
      const pg = await ctx.newPage();
      await pg.route('**/ethers*.umd.min.js', (r) => r.fulfill({
        contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
      await pg.route('**/rpc.mainnet.chain.robinhood.com/**', (r) => r.abort());
      await pg.route('**/api.dexscreener.com/**', (r) => r.abort());
      await pg.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
      await pg.waitForTimeout(1600);
      const m = await pg.evaluate(() => {
        const pied = document.getElementById('pied').getBoundingClientRect();
        const petits = [...document.querySelectorAll('input, select, textarea')]
          .map((e) => ({ id: e.id || e.tagName, px: parseFloat(getComputedStyle(e).fontSize) }))
          .filter((x) => x.px < 16);
        return {
          ongletsDedans: pied.bottom <= innerHeight + 1 && pied.top >= 0,
          ongletsBas: Math.round(pied.bottom), vueH: innerHeight,
          horiz: document.documentElement.scrollWidth > innerWidth + 1,
          petits,
        };
      });
      ok(m.petits.length === 0,
         d.nom + ' : aucun champ sous 16 px — c est ce seuil qui declenche le zoom d iOS'
         + (m.petits.length ? ' (' + m.petits.map((x) => x.id + ' ' + x.px + 'px').join(', ') + ')' : ''));
      ok(m.ongletsDedans,
         d.nom + ' : la barre d onglets tient dans l ecran'
         + (m.ongletsDedans ? '' : ' — elle finit a ' + m.ongletsBas + ' pour une vue de ' + m.vueH
                                 + ', donc coupee et inatteignable'));
      ok(!m.horiz, d.nom + ' : rien ne deborde sur le cote');
      await ctx.close();
    }
    /* La balise viewport ne doit pas interdire au joueur d agrandir la page
       lui-meme : c est une facon de supprimer le zoom qui coute
       l accessibilite a ceux qui en ont besoin. */
    const src = fs.readFileSync(path.join(SITE, 'swoge_wallet.html'), 'utf8');
    const vp = (/<meta name="viewport"[^>]*>/.exec(src) || [''])[0];
    ok(!/maximum-scale|user-scalable\s*=\s*no/.test(vp),
       'et le zoom VOLONTAIRE reste possible : la balise viewport ne le bride pas (' + vp + ')');
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
