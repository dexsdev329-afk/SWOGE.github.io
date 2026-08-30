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
       && syms.indexOf('ETH') >= 0,
       'trois lignes seulement : ETH, SWOGE, SWOGEBET (' + syms.join(', ') + ')');
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
      sous: document.getElementById('acSous').textContent,
      lignes: [...document.querySelectorAll('#acJetons .wl-jeton')].map((e) => e.textContent.trim()),
    }));
    ok(!/Not connected/.test(branche.sous),
       'le faux portefeuille d extension se branche tout seul (« ' + branche.sous + ' »)');
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

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
