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
let chromium = null, WSS = null;
/* Le faux serveur de jeu : `ws` vit dans le depot du serveur, comme `ethers`. */
try { WSS = require('/home/user/swoge-pusher-server.github.io/node_modules/ws').WebSocketServer; } catch (e) {}
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium || !WSS) { console.log('wallet_page.test.js : playwright ou ws absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
            '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg',
            /* Sans le bon type, le navigateur refuse de jouer le film et
               l'essai lirait « l'animation ne passe pas » d'un serveur mal
               regle. */
            '.mp4':'video/mp4', '.webm':'video/webm' };

/* ---- LE SERVEUR D'ESSAI SAIT REPONDRE A « Range » ----
 * Sans ca le navigateur ne peut pas se DEPLACER dans un film : `seekable`
 * reste vide, `currentTime = 3` est ignore SANS ERREUR, et l'on croit mesurer
 * la troisieme seconde alors qu'on regarde l'image zero. C'est arrive ici :
 * l'essai du fond annonçait « plus de damier » sur un film qui en etait
 * couvert, parce que ses premieres images, elles, etaient blanches. Le vrai
 * serveur du site repond a `Range` ; celui de l'essai doit lui ressembler. */
function servir(q, r, f, type) {
  const t = fs.statSync(f).size;
  const m = /^bytes=(\d*)-(\d*)$/.exec(q.headers.range || '');
  if (m) {
    const d = m[1] ? parseInt(m[1], 10) : 0;
    const fin = m[2] ? parseInt(m[2], 10) : t - 1;
    r.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes',
                       'content-range': 'bytes ' + d + '-' + fin + '/' + t,
                       'content-length': fin - d + 1 });
    return fs.createReadStream(f, { start: d, end: fin }).pipe(r);
  }
  r.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': t });
  fs.createReadStream(f).pipe(r);
}

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    servir(q, r, f, T[path.extname(f)] || 'application/octet-stream');
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

    /* ---- ET LA PIECE DE L ETH DIT DE QUELLE CHAINE IL S AGIT ----
     *
     * Ce jeton n est pas l ether de la chaine principale : c est celui de la
     * chaine Robinhood, et le joueur en a souvent des deux. Un losange
     * violet tout seul ne les distingue pas — c est le meme dessin des deux
     * cotes, et c est exactement la confusion que le nom « ETH (RH) » sert
     * deja a eviter. La piece porte donc les DEUX marques.
     *
     * On ne compare pas un fichier a une empreinte : recadrer l image la
     * changerait sans rien casser, et l essai crierait pour rien. On mesure
     * ce qui compte — le vert de Robinhood est-il la ? L ancienne piece en
     * avait 0,00 %, celle-ci 23 %. */
    const teintes = await p.evaluate(async () => {
      const im = document.querySelector('#acJetons .wl-jeton img');
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.drawImage(im, 0, 0, 128, 128);
      const d = g.getImageData(0, 0, 128, 128).data;
      let vert = 0, violet = 0, vus = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [r, v, b, a] = [d[i], d[i+1], d[i+2], d[i+3]];
        if (a <= 128) continue;
        vus++;
        if (v > r + 40 && v > b + 40) vert++;
        if (b > v + 30 && r > v + 15) violet++;
      }
      return { src: im.getAttribute('src'), vus,
               vert: +(100*vert/16384).toFixed(2), violet: +(100*violet/16384).toFixed(2) };
    });
    console.log('   piece ETH (RH) : ' + JSON.stringify(teintes));
    /* Sans ce garde, une piece qui ne se dessine pas rendrait zero partout et
       les deux mesures suivantes passeraient en ne mesurant rien. */
    ok(teintes.vus > 8000,
       'la piece de l ETH (RH) se dessine vraiment (' + teintes.vus + ' pixels opaques sur 16 384)');
    ok(teintes.vert > 8,
       'elle porte le vert de Robinhood (' + teintes.vert + ' %) — le losange violet seul ne disait pas la chaine');
    ok(teintes.violet > 3,
       'et le violet de l Ethereum (' + teintes.violet + ' %) — c est bien de l ether qu il s agit');
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
          /* ---- UNE PAIRE v2 QUI BOUGE VRAIMENT ----
           * `getAmountsOut`, avec un taux qui DEPEND du montant : mille jetons
           * par ether pour la sonde de 0,0001, sept cents pour un ether entier.
           * L'impact sort donc a 30 %, un chiffre stable qu'on peut affirmer.
           * Sans ca le faux noeud rendait zero, le devis n'existait pas, et la
           * regle « un impact fort ouvre le detail » n'etait mesuree par rien —
           * l'essai se contentait de dire qu'il ne pouvait rien conclure. */
          if (d.slice(0, 10) === '0xd06ca61f') {           // getAmountsOut
            const dedans = BigInt('0x' + d.slice(10, 74));
            const petit = dedans <= 1000000000000000n;     // 0,001 et moins
            const sortie = dedans * (petit ? 1000n : 700n);
            return '0x' + (32n).toString(16).padStart(64, '0')
                        + (2n).toString(16).padStart(64, '0')
                        + dedans.toString(16).padStart(64, '0')
                        + sortie.toString(16).padStart(64, '0');
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

    /* ---- LA MISE EN PAGE DE L'ACCUEIL ----
     *
     * Elle suit la maquette qu'on nous a envoyee, et ce qui s'y joue n'est pas
     * decoratif :
     *   - les trois gestes remontent SOUS le total. Ils etaient tout en bas,
     *     apres la liste des jetons : sur un telephone il fallait defiler pour
     *     envoyer. On lit son solde, et la chose suivante qu'on veut faire est
     *     d'en faire quelque chose.
     *   - l'adresse a enfin une carte. Elle vivait en petit sous le nom, ou
     *     personne ne la copie parce que rien ne dit qu'on peut.
     */
    const page1 = await page.evaluate(() => {
      const corps = document.querySelector('#ecAccueil .wl-corps');
      const rang = (sel) => { const e = corps.querySelector(sel);
        return e ? [].indexOf.call(corps.children, e.closest('#ecAccueil .wl-corps > *')) : -1; };
      const ad = document.getElementById('acAdrCarte');
      const ill = document.querySelector('.wl-illu');
      return { actions: rang('.wl-actions'), jetons: rang('#acJetons'),
               adresse: rang('#acAdrCarte'),
               carteVue: !!(ad && !ad.hidden),
               ecrite: (document.getElementById('acAdr').textContent || '').trim(),
               qr: !!document.querySelector('#acAdrCarte .qr[data-va="ecRecevoir"]'),
               /* L'illustration a CHARGE, pas seulement ete demandee. Une
                  image absente laisse un trou muet : `naturalWidth` a zero est
                  la seule facon de le savoir depuis la page. */
               dessin: ill ? ill.getAttribute('src') + (ill.naturalWidth > 0 ? '' : ' MANQUE') : 'absent',
               /* Et elle ne mange pas la place du nombre : le solde et le
                  dessin se partagent la carte, ils ne se superposent pas. */
               large: ill ? Math.round(ill.getBoundingClientRect().width) : 0,
               placeDuTotal: Math.round(document.getElementById('acTotal').getBoundingClientRect().width) };
    });
    console.log('   accueil : ' + JSON.stringify(page1));
    ok(page1.actions >= 0 && page1.jetons > page1.actions,
       `les trois gestes sont AU-DESSUS de la liste des jetons (${page1.actions} avant ${page1.jetons})`);
    ok(page1.adresse > page1.jetons, 'et la carte de l adresse ferme l ecran');
    ok(page1.carteVue, 'connecte, la carte de l adresse est la');
    ok(/^0x.{4}\u2026.{4}$/.test(page1.ecrite),
       `elle montre l adresse abregee (${page1.ecrite})`);
    ok(page1.qr, 'et un bouton ouvre le QR — c est l autre facon de la donner');
    ok(!/MANQUE|absent/.test(page1.dessin),
       'le dessin du portefeuille est la, et il a CHARGE (' + page1.dessin + ')');
    ok(page1.large > 60 && page1.placeDuTotal > 120,
       `il tient a droite du solde sans lui prendre sa place (dessin ${page1.large},`
       + ` total ${page1.placeDuTotal})`);

    /* ---- L'ACCUEIL TIENT SANS DEFILER ----
     *
     * « Tu peux rétrécir un peu le rectangle pour que ce soit fixe, la page
     * home du wallet. » Mesure sur 390 x 844 : l'accueil demandait 785 pixels
     * pour 643 de haut. Un ecran d'accueil qui bouge donne l'impression que la
     * page n'est pas finie.
     *
     * Ce qu'on garde ici est la HAUTEUR, pas une valeur de style : les marges
     * se resserrent avec le temps, et c'est le total qui compte. Trois jetons
     * — les trois de la maison — plus le coffre du casino, c'est ce que voit
     * un joueur qui n'a rien ajoute. */
    const tenue = await page.evaluate(() => {
      const c = document.querySelector('#ecAccueil .wl-corps');
      return { defile: c.scrollHeight - c.clientHeight,
               visible: c.clientHeight, contenu: c.scrollHeight,
               jetons: document.querySelectorAll('#acJetons .wl-jeton').length };
    });
    console.log('   hauteur : ' + JSON.stringify(tenue));
    ok(tenue.defile <= 0,
       `l accueil tient sans defiler avec ${tenue.jetons} jeton(s) : `
       + `${tenue.contenu} px de contenu pour ${tenue.visible} de haut`);

    /* ---- LA BARRE « EN VOL » DISPARAIT VRAIMENT ----
     * `peintEnCours` posait `hidden`, et `display:flex` le BATTAIT — la meme
     * regle de priorite qui avait rendu un ecran « cache » bloquant. La barre
     * restait donc a l ecran, avec son point qui pulse, a annoncer une
     * transaction en cours quand il n y en avait AUCUNE. Cinquante-huit
     * pixels perdus, et surtout une phrase fausse sur l ecran d accueil.
     * On ne lit pas l attribut : on demande au navigateur si ca se VOIT. */
    const envol = await page.evaluate(() => {
      const e = document.getElementById('acEnCours');
      return { attribut: e.hasAttribute('hidden'),
               vu: e.getBoundingClientRect().height > 0,
               affichage: getComputedStyle(e).display };
    });
    console.log('   en vol : ' + JSON.stringify(envol));
    ok(envol.attribut && !envol.vu,
       `rien en vol : la barre est posee « hidden » ET ne se voit pas`
       + ` (${envol.affichage})`);

    /* ---- ET ELLE REVIENT QUAND IL Y A VRAIMENT QUELQUE CHOSE ----
     * Sans cette moitie, « on ne la voit jamais » passerait pour une
     * reparation alors que ce serait le defaut inverse. */
    await page.evaluate((moi) => {
      const cle = 'swogeTx:' + moi.toLowerCase();
      localStorage.setItem(cle, JSON.stringify([{ h: '0x' + '1'.repeat(64), k: 'envoi',
        cle: 'eth', montant: '1000000000000000', etat: 'attente', t: Date.now() }]));
    }, MOI);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    const envol2 = await page.evaluate(() => {
      const e = document.getElementById('acEnCours');
      return { vu: e.getBoundingClientRect().height > 0,
               txt: (document.getElementById('acEnCoursT').textContent || '').trim() };
    });
    console.log('   en vol (une transaction) : ' + JSON.stringify(envol2));
    ok(envol2.vu && /in flight/.test(envol2.txt),
       `une transaction en vol la fait revenir (« ${envol2.txt} »)`);
    await page.evaluate((moi) => {
      localStorage.removeItem('swogeTx:' + moi.toLowerCase());
    }, MOI);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);

    /* ---- ET LE BOUTON COPIE L'ADRESSE ENTIERE ----
     * C'est le seul defaut qui coute de l'argent ici : la carte AFFICHE une
     * adresse abregee, et copier ce qu'elle affiche donnerait une adresse
     * tronquee — collee quelque part, les fonds partent nulle part. */
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
      .catch(() => {});
    await page.evaluate(() => { window.__copie = null;
      navigator.clipboard.writeText = (t) => { window.__copie = t; return Promise.resolve(); }; });
    await page.click('#acAdrCopie');
    await page.waitForTimeout(300);
    const copie = await page.evaluate(() => window.__copie);
    ok(copie && copie.length === 42 && copie.toLowerCase() === MOI.toLowerCase(),
       `le bouton copie l adresse ENTIERE, pas celle qui est affichee (${copie})`);

    const clic = async (id) => {
      await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
      await page.click('#' + id);
      await page.waitForTimeout(500);
      return page.evaluate(() => ({
        swap: document.getElementById('swMontant').value,
        envoi: document.getElementById('enMontant').value,
        toast: document.getElementById('toast').textContent }));
    };
    /* `vers` est facultatif : sans lui on garde la destination que la page
       s'est donnee. La preciser compte pour l'impact — la route par defaut
       (eth -> swoge -> swogebet) passe par le quoteur v3, que ce faux noeud
       ne sait pas jouer ; son second saut rendrait zero et l'impact du chemin
       ENTIER serait « — » alors meme que le premier saut bouge de 30 %. */
    const versSwap = (de, vers) => page.evaluate(([d, v]) => {
      document.querySelector('[data-va="ecSwap"]').click();
      document.getElementById('swMontant').value = '';
      const s = document.getElementById('swDe');
      s.value = d; s.dispatchEvent(new Event('change'));
      if (v) { const t = document.getElementById('swVers');
               t.value = v; t.dispatchEvent(new Event('change')); }
    }, [de, vers]);

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

    /* ---- LE DETAIL SE REPLIE, ET IL S OUVRE QUAND IL COMPTE ----
     *
     * Trois lignes de chiffres sous le montant recu poussaient le bouton
     * « Swap » hors de vue sur un telephone : il fallait defiler pour
     * echanger. La route reste — c est elle qu on lit d un coup d oeil — et
     * les deux autres passent derriere un « + ».
     *
     * Ce qui se mesure ici n est pas le pliage : c est que le pliage ne CACHE
     * jamais ce qu on doit voir. Un impact de prix est ennuyeux a 0,3 % et
     * c est une alerte a 12 % ; replier la seconde parce que la premiere
     * encombre, ce serait cacher exactement ce qu il fallait montrer. */
    const detail = () => page.evaluate(() => {
      const d = document.getElementById('swPlus'), b = document.getElementById('swPlusB');
      return { ouvert: !d.hidden, aria: b.getAttribute('aria-expanded'),
               signe: b.querySelector('i').textContent.trim(),
               route: document.getElementById('swRoute').getBoundingClientRect().height > 0,
               garde: (() => { try { return localStorage.getItem('swogeSwapDetail'); }
                               catch (e) { return null; } })() };
    });
    let d = await detail();
    console.log('   detail : ' + JSON.stringify(d));
    ok(!d.ouvert && d.aria === 'false', 'le detail est replie par defaut');
    ok(d.route, 'mais la route, elle, reste visible — c est ce qu on lit d un coup d oeil');
    ok(d.signe === '+', 'et le signe dit qu il y a quelque chose dessous');

    await page.click('#swPlusB');
    await page.waitForTimeout(250);
    d = await detail();
    ok(d.ouvert && d.aria === 'true' && d.signe === '\u2212',
       'le « + » l ouvre, et devient un « − »');
    ok(d.garde === '1', 'le choix est garde : qui les veut ouverts ne les rouvre pas a chaque fois');
    await page.click('#swPlusB');
    await page.waitForTimeout(250);
    d = await detail();
    ok(!d.ouvert && d.garde === '0', 'et se referme, garde aussi');

    /* ---- UN IMPACT FORT L OUVRE TOUT SEUL ----
     * On demande un montant assez gros pour bouger le prix. Le seuil est
     * celui ou la page previent deja — au-dela, le chiffre qui justifie
     * l avertissement ne doit pas etre replie. */
    await versSwap('eth', 'swoge');
    await page.fill('#swMontant', '1');
    await page.waitForTimeout(2200);
    const fort = await page.evaluate(() => ({
      impact: document.getElementById('swImpact').textContent.trim(),
      ouvert: !document.getElementById('swPlus').hidden,
      garde: (() => { try { return localStorage.getItem('swogeSwapDetail'); }
                      catch (e) { return null; } })() }));
    console.log('   impact fort : ' + JSON.stringify(fort));
    const pct = parseFloat(fort.impact);
    ok(isFinite(pct) && pct >= 3,
       `la paire du banc rend bien un impact fort (${fort.impact}) — sans lui,`
       + ' cette regle ne serait mesuree par rien');
    ok(fort.ouvert, `un impact de ${fort.impact} ouvre le detail tout seul`);
    /* Et il n ECRIT PAS ce choix : c est une ouverture pour CETTE cotation,
       pas un reglage que le joueur aurait demande. Sans cette ligne, un seul
       gros echange replierait le detail pour toujours — ou le laisserait
       ouvert pour toujours, ce qui est le meme defaut a l envers. */
    ok(fort.garde === '0',
       'sans enregistrer ce choix — c est cette cotation-la qui l a ouvert, pas le joueur');
    await page.fill('#swMontant', '');
    await page.waitForTimeout(400);

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

    /* -- un seul menu ouvert a la fois --
     * On appelle `.click()` au lieu de le POINTER : depuis que la liste porte
     * une barre de recherche, elle est plus haute que les cent soixante-trois
     * pixels qui separent les deux boutons et recouvre le second. Un pointeur
     * y toucherait une option de la PREMIERE liste — ce qu'un joueur ne peut
     * pas faire, puisqu'il voit la liste ouverte devant lui et ne vise pas un
     * bouton cache dessous. Ce qu'on veut mesurer ici est le gestionnaire :
     * ouvrir l'un ferme l'autre. */
    await page.click('#swDeB'); await page.waitForTimeout(150);
    await page.evaluate(() => document.getElementById('swVersB').click());
    await page.waitForTimeout(200);
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

    /* ---- ET LE MEME CHOIX, EN HAUT DE LA PAGE ----
     * Il vivait au fond de l ecran « Account », a trois gestes. Changer de
     * compte, quand on en a plusieurs, est un geste de tous les jours, pas un
     * reglage. Il lit la MEME liste et passe par la MEME bascule : deux
     * chemins vers un changement de compte finiraient par ne plus faire
     * exactement la meme chose, et celui qu on oublie est celui qui laisse le
     * signataire sur l ancienne adresse. */
    const haut = () => page.evaluate(() => {
      const b = document.getElementById('acChoix');
      return { vu: !b.hidden, nom: document.getElementById('acChoixNom').textContent.trim(),
               ouvert: !document.getElementById('acChoixL').hidden,
               lignes: [].map.call(document.querySelectorAll('#acChoixL [data-compte]'),
                 (x) => x.dataset.compte),
               ajout: !!document.querySelector('#acChoixL [data-va="ecCompte"]') };
    });
    let h = await haut();
    console.log('   en haut : ' + JSON.stringify(h));
    ok(h.vu, 'le choix du compte est en haut de la page, a cote de la marque');
    ok(h.nom === 'Account 1', `il porte le compte en service (« ${h.nom} »)`);
    await page.click('#acChoixB');
    await page.waitForTimeout(250);
    h = await haut();
    ok(h.ouvert, 'le chevron ouvre la liste');
    ok(h.lignes.join(',') === '0,1', `elle porte les deux comptes (${h.lignes.join(', ')})`);
    ok(h.ajout, 'et de quoi en ajouter un, qui mene a l ecran qui sait le faire');
    /* On bascule DEPUIS LE HAUT, et l on verifie par le solde — la seule
       preuve que le fournisseur et le signataire ont suivi, pas seulement
       l affichage. */
    await page.click('#acChoixL [data-compte="1"]');
    await page.waitForTimeout(1800);
    h = await haut();
    ok(!h.ouvert, 'choisir referme la liste');
    ok(h.nom === 'Account 2', `et le haut de page suit (« ${h.nom} »)`);
    const soldeHaut = await page.evaluate(() =>
      (document.querySelector('#acJetons .wl-jeton .val b') || {}).textContent || '');
    ok(soldeHaut === '0.002',
       `le solde a suivi la bascule faite depuis le haut (${soldeHaut})`);
    /* On revient au premier pour la suite du bloc, qui l attend. */
    await page.click('#acChoixL [data-compte="0"]').catch(async () => {
      await page.click('#acChoixB'); await page.waitForTimeout(200);
      await page.click('#acChoixL [data-compte="0"]');
    });
    await page.waitForTimeout(1800);
    await page.evaluate(() => document.querySelector('[data-va="ecCompte"]').click());
    await page.waitForTimeout(400);

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

  /* 7 quater. LE SOLDE DU CASINO
   *
   * Il y a DEUX soldes de $SWOGE : celui de la chaine et celui du coffre du
   * jeu. Le portefeuille n en montrait qu un — un joueur qui avait mis son
   * $SWOGE au coffre pouvait croire le reste perdu.
   *
   * Ce qui compte ici, et qui n est pas evident :
   *
   *   - « inconnu » n est pas « zero ». Tant que le serveur n a pas repondu,
   *     la ligne affiche un tiret. Un zero sur un solde se lit comme « tu n as
   *     plus rien ».
   *   - LE RETRAIT DEBITE AVANT LA TRANSACTION. Si l encaissement echoue, le
   *     joueur voit son chiffre tomber ET sa transaction rater : c est le
   *     moment exact ou il croit avoir perdu. Le bon est cumulatif, donc rien
   *     n est perdu — mais il faut le DIRE et laisser le bouton.
   */
  console.log('\n-- le solde du casino --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const VAULT = '0x00000000000000000000000000000000000fa111';
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    const jeu = new WSS({ port: 0 });
    await new Promise((r) => jeu.on('listening', r));
    let bon = 0;
    jeu.on('connection', (c) => {
      c.send(JSON.stringify({ type: 'hello', loginNonce: 'abc', vault: VAULT,
        token: '0x8a166Fb41Cd659a0a43396272FF73973Ce29F817', minWithdraw: 50, chainId: 4663 }));
      c.on('message', (d) => {
        let m; try { m = JSON.parse(d); } catch (e) { return; }
        if (m.type === 'login' || m.type === 'resume')
          c.send(JSON.stringify({ type: 'auth', address: MOI, balance: '50000', session: 'jeton' }));
        if (m.type === 'withdrawPending')
          c.send(JSON.stringify({ type: 'bonAttente', montant: String(bon) }));
        if (m.type === 'withdraw') {
          bon = Number(m.amount);
          c.send(JSON.stringify({ type: 'voucher', vault: VAULT, balance: String(50000 - bon),
            voucher: { cumulative: '1000000000000000000000', deadline: '99999999999', v: 27,
                       r: '0x' + '11'.repeat(32), s: '0x' + '22'.repeat(32) } }));
        }
      });
    });

    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(e.message));
    await page.addInitScript(([moi, ws]) => {
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      const O = window.WebSocket;
      /* On detourne la socket du jeu vers le faux serveur, sans toucher a la page. */
      window.WebSocket = function (u) { return new O(String(u).indexOf('railway') >= 0 ? ws : u); };
      window.ethereum = { isMetaMask: true, on: () => {}, removeListener: () => {},
        request: async (a) => {
          if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
          if (a.method === 'eth_chainId') return '0x1237';
          if (a.method === 'net_version') return '4663';
          if (a.method === 'personal_sign') return '0x' + 'ab'.repeat(65);
          return null; } };
    }, [MOI, 'ws://127.0.0.1:' + jeu.address().port]);
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
        if (m.method === 'eth_call') return enMot(1234000000000000000000n);
        return null; };
      const out = arr.map((m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) }));
      await r.fulfill({ contentType: 'application/json',
        body: JSON.stringify(seul ? out[0] : out) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);

    ok(await page.evaluate(() => document.getElementById('acCasinoVal').textContent) === '—',
       'avant d avoir lu le serveur, la ligne du casino dit « — » et non « 0 »'
       + ' — un zero sur un solde se lit comme « tu n as plus rien »');

    await page.click('#acCasino');
    await page.waitForTimeout(2400);
    const vu = await page.evaluate(() => ({
      solde: document.getElementById('caSolde').textContent,
      etat: document.getElementById('caEtat').textContent,
      min: document.getElementById('caRetMin').textContent,
      wallet: document.getElementById('caDepSolde').textContent,
      accueil: document.getElementById('acCasinoVal').textContent,
    }));
    ok(/50,000/.test(vu.solde), 'le solde du coffre s affiche (' + vu.solde + ')');
    ok(/50 \$SWOGE/.test(vu.min), 'le minimum de retrait vient du SERVEUR, pas de la page ('
       + vu.min + ')');
    ok(/1,234/.test(vu.wallet), 'et le solde de CHAINE est rappele en face, pour savoir quoi deposer');
    ok(/50,000/.test(vu.accueil), 'la ligne de l accueil suit aussi (' + vu.accueil + ')');

    /* Le retrait : la transaction va echouer, le coffre n est pas un vrai
       contrat. C est exactement le cas qu on veut voir. */
    await page.fill('#caRetMontant', '100');
    await page.click('#caRetirer');
    await page.waitForTimeout(2600);
    const apres = await page.evaluate(() => ({
      note: document.getElementById('caNote').textContent,
      bonVisible: !document.getElementById('caBonBloc').hidden,
      bon: document.getElementById('caBonMontant').textContent,
    }));
    ok(/nothing is lost/i.test(apres.note),
       'un encaissement rate DIT que rien n est perdu — c est le moment exact ou le joueur'
       + ' voit son solde tomber et sa transaction rater');
    ok(apres.bonVisible, 'et le bon reste reclamable');
    ok(/100/.test(apres.bon), 'avec le bon montant (' + apres.bon + ')');

    /* Un montant sous le minimum ne part pas. */
    await page.fill('#caRetMontant', '5');
    await page.click('#caRetirer');
    await page.waitForTimeout(500);
    ok(/Minimum withdrawal is 50/.test(
         await page.evaluate(() => document.getElementById('caNote').textContent)),
       'sous le minimum du serveur, la demande ne part pas');

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
    jeu.close();
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

  /* ---- LE QR DU RECEIVE ----
   *
   * L essai lit les PIXELS du canvas, pas une variable : c est ce que
   * l appareil photo verra. La matrice attendue vient de `segno`, la meme
   * reference que `wallet_qr.test.js` — ici on verifie qu elle arrive
   * INTACTE jusqu a l ecran, marge comprise.
   */
  console.log('\n-- le QR du Receive --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const REF = JSON.parse(fs.readFileSync(path.join(SITE, 'wallet_qr.prouve.json'), 'utf8'));
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
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
    await page.route('**/api.dexscreener.com/**', (r) => r.abort());
    await page.route('**/avatar/**', (r) => r.fulfill({ status: 404, body: '' }));
    await page.route('**/nom/**', (r) => r.abort());
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', (r) => r.abort());
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2400);
    await page.evaluate(() => document.querySelector('[data-va="ecRecevoir"]').click());
    await page.waitForTimeout(400);

    const lu = await page.evaluate(() => {
      const c = document.querySelector('#reQr canvas');
      if (!c) return { absent: true, secours: document.getElementById('reQr').textContent.trim() };
      const g = c.getContext('2d');
      const M = 4, T = 33, pas = c.width / (T + 2 * M);
      const noir = (px, py) => {
        const d = g.getImageData(Math.round(px), Math.round(py), 1, 1).data;
        return d[0] < 128 ? '1' : '0';
      };
      const lignes = [];
      for (let y = 0; y < T; y++) {
        let l = '';
        for (let x = 0; x < T; x++) l += noir((x + M) * pas + pas / 2, (y + M) * pas + pas / 2);
        lignes.push(l);
      }
      /* La marge claire : quatre modules tout autour. Sans elle beaucoup
         de lecteurs ne trouvent simplement pas le symbole. */
      let marge = true;
      for (let i = 0; i < c.width; i += 3) {
        if (noir(i, pas * 1.5) === '1' || noir(i, c.height - pas * 1.5) === '1') marge = false;
        if (noir(pas * 1.5, i) === '1' || noir(c.width - pas * 1.5, i) === '1') marge = false;
      }
      const r = c.getBoundingClientRect();
      return { lignes, marge, l: Math.round(r.width), h: Math.round(r.height),
               etiquette: c.getAttribute('aria-label') || '' };
    });

    ok(!lu.absent, 'le Receive dessine un vrai QR, pas seulement l adresse en clair'
       + (lu.absent ? ' — replis : « ' + lu.secours + ' »' : ''));
    if (!lu.absent) {
      let ecarts = 0;
      for (let y = 0; y < 33; y++) for (let x = 0; x < 33; x++)
        if (lu.lignes[y][x] !== REF.exemple.matrice[y][x]) ecarts++;
      ok(ecarts === 0,
         'et les pixels a l ecran rendent EXACTEMENT la matrice de reference ('
         + ecarts + ' module' + (ecarts > 1 ? 's' : '') + ' d ecart)');
      ok(lu.marge, 'la marge claire de quatre modules est bien la — sans elle, beaucoup de lecteurs ne voient pas le symbole');
      ok(lu.l > 100 && Math.abs(lu.l - lu.h) <= 2,
         'il est carre et assez grand pour etre photographie (' + lu.l + ' x ' + lu.h + ')');
      /* ---- LA MISE A L ECHELLE NE DOIT PAS AVALER DE MODULE ----
         Le canvas est plus grand que sa place a l ecran : c est le navigateur
         qui le reduit. Tant qu il reste plusieurs pixels par module, aucune
         ligne ne peut disparaitre a la reduction. (Verifie aussi a la main :
         une capture d ecran du telephone, passee au decodeur d OpenCV, rend
         l adresse exacte.) */
      const parModule = lu.l / 41;
      ok(parModule >= 4,
         'et chaque module garde ' + parModule.toFixed(1) + ' pixels a l ecran — sous 4, la'
         + ' reduction du navigateur pourrait en avaler un et le symbole deviendrait illisible');
      ok(lu.etiquette.toLowerCase().indexOf(MOI) >= 0,
         'et il porte son adresse en texte, pour qui ne peut pas le voir');
    }
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ---- CE QUI EST EN VOL SURVIT AU RECHARGEMENT ----
   *
   * Le vrai chemin : le bouton Send, le vrai signataire, la vraie
   * transaction. Puis on RECHARGE la page au milieu de l attente — c est
   * le moment exact ou tout se perdait.
   */
  console.log('\n-- une transaction en vol --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const VERS = '0x00000000000000000000000000000000000b0b0b';
    const HASH = '0x' + 'ab'.repeat(32);
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    let recu = null;                       /* la chaine n a encore rien mine */

    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(e.message));
    await page.addInitScript(([moi, vers, hash]) => {
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      window.ethereum = { isMetaMask: true, on: () => {}, removeListener: () => {},
        request: async (a) => {
          const M = { eth_accounts: [moi], eth_requestAccounts: [moi], eth_chainId: '0x1237',
                      net_version: '4663', wallet_switchEthereumChain: null,
                      eth_gasPrice: '0x7fe1f0', eth_estimateGas: '0x5208',
                      eth_getTransactionCount: '0x1', eth_blockNumber: '0x2f7ce78' };
          if (a.method === 'eth_sendTransaction') return hash;
          if (a.method === 'eth_getTransactionByHash') return {
            hash, from: moi, to: vers, value: '0x1', gas: '0x5208', gasPrice: '0x7fe1f0',
            nonce: '0x1', input: '0x', blockHash: null, blockNumber: null,
            transactionIndex: null, chainId: '0x1237',
            v: '0x0', r: '0x' + '0'.repeat(64), s: '0x' + '0'.repeat(64) };
          if (a.method in M) return M[a.method];
          return null; } };
    }, [MOI, VERS, HASH]);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    await page.route('**/avatar/**', (r) => r.fulfill({ status: 404, body: '' }));
    await page.route('**/nom/**', (r) => r.abort());
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const un = (m) => {
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') return enMot(134102000n);
        if (m.method === 'eth_getBalance') return enMot(5000000000000000n);
        if (m.method === 'eth_getTransactionReceipt') return recu;
        if (m.method === 'eth_call') return enMot(1234567890123456789012n);
        return null;
      };
      const rep = (m) => { const v = un(m);
        return v === null ? { jsonrpc: '2.0', id: m.id, error: { code: -32000, message: 'nope' } }
                          : { jsonrpc: '2.0', id: m.id, result: v }; };
      const c = JSON.parse(r.request().postData() || '{}');
      await r.fulfill({ contentType: 'application/json',
                        body: JSON.stringify(Array.isArray(c) ? c.map(rep) : rep(c)) });
    });

    const charge = async () => {
      await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2600);
    };
    await charge();
    await page.evaluate(() => document.querySelector('[data-va="ecEnvoyer"]').click());
    await page.waitForTimeout(300);
    await page.fill('#enDest', VERS);
    await page.fill('#enMontant', '0.001');
    await page.evaluate(() => document.getElementById('enPartir').click());
    await page.waitForTimeout(400);
    /* La revue est active par defaut : elle s intercale ici. Le bloc qui
       suit l essaie pour elle-meme ; ici on la traverse. */
    await page.evaluate(() => document.getElementById('rvOk').click());
    await page.waitForTimeout(2200);

    const bande = async () => page.evaluate(() => {
      const e = document.getElementById('acEnCours');
      return { vu: !e.hidden, t: document.getElementById('acEnCoursT').textContent,
               s: document.getElementById('acEnCoursS').textContent };
    });
    await page.evaluate(() => document.querySelector('#pied button').click());
    await page.waitForTimeout(200);
    const b1 = await bande();
    ok(b1.vu && /1 transaction/.test(b1.t),
       'l accueil annonce la transaction en vol (« ' + b1.t + ' »)');
    ok(/0\.001/.test(b1.s) && /0x0000/.test(b1.s),
       'et il dit LAQUELLE — montant et destinataire (« ' + b1.s + ' »)');

    /* ---- LE RECHARGEMENT ---- */
    await charge();
    const b2 = await bande();
    ok(b2.vu && /1 transaction/.test(b2.t),
       'apres un rechargement en pleine attente, elle est TOUJOURS la — c est ce qui se perdait');
    ok(/0\.001/.test(b2.s),
       'avec son montant, relu du telephone et non de la chaine (« ' + b2.s + ' »)');

    const j = await page.evaluate(() => JSON.parse(localStorage.getItem('swogeTx:0x00000000000000000000000000000000000a11ce') || '[]'));
    ok(j.length === 1 && j[0].etat === 'attente' && j[0].cle === 'eth',
       'le journal la garde « en attente » : une lecture qui n aboutit pas ne la declare pas echouee');

    /* ---- ET QUAND LA CHAINE FINIT PAR REPONDRE ---- */
    recu = { transactionHash: HASH, blockHash: '0x' + '11'.repeat(32), blockNumber: '0x2f7ce78',
             transactionIndex: '0x0', from: MOI, to: VERS, gasUsed: '0x5208',
             cumulativeGasUsed: '0x5208', contractAddress: null, logs: [],
             logsBloom: '0x' + '0'.repeat(512), status: '0x1', type: '0x0',
             effectiveGasPrice: '0x7fe1f0' };
    await charge();
    await page.waitForTimeout(2600);
    const b3 = await bande();
    ok(!b3.vu, 'et une fois la transaction minee, le bandeau disparait tout seul');
    const j2 = await page.evaluate(() => JSON.parse(localStorage.getItem('swogeTx:0x00000000000000000000000000000000000a11ce') || '[]'));
    ok(j2.length === 1 && j2[0].etat === 'reussi', 'le journal la marque reussie (' + (j2[0] || {}).etat + ')');

    /* ---- ET ELLE SE RELIT DANS ACTIVITY ----
       Un envoi d ETH (RH) n emet aucun evenement : sans le journal, il
       n apparaitrait NULLE PART. */
    await page.evaluate(() => document.querySelector('[data-va="ecActivite"]').click());
    await page.waitForTimeout(2500);
    const rangs = await page.evaluate(() => [...document.querySelectorAll('#acvCorps .wl-jeton')]
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    const envoi = rangs.filter((l) => /^Sent/.test(l));
    ok(envoi.length === 1 && /0\.001/.test(envoi[0]),
       'l envoi natif se retrouve dans Activity, ou la chaine seule ne le rendrait jamais ('
       + (envoi[0] || 'aucune ligne') + ')');
    ok(envoi.length === 1 && /from this device/i.test(envoi[0]),
       'et LA LIGNE ELLE-MEME dit d ou elle vient — sinon on la croirait lue sur la chaine,'
       + ' et on la chercherait en vain depuis un autre appareil');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ---- UN ECHANGE N EST PAS DEUX VIREMENTS ----
   *
   * Vu des evenements seuls, un echange se lisait « Sent 1 SWOGE to
   * 0x2Dc0… » puis « Received 5 SWOGEBET from 0x2Dc0… » : le joueur voyait
   * ses jetons partir chez un inconnu.
   */
  console.log('\n-- Activity lit un echange --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const POOL = '0x2dc0fb72d9284228046cc95910eeaabebfe48456';
    const SWOGE = '0x8a166fb41cd659a0a43396272ff73973ce29f817';
    const SWOGEBET = '0xc0aed547862fba5d7d9fbf3cb14204cd756c8bea';
    const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
    const ROUTER = '0xcaf681a66d020601342297493863e78c959e5cb2';
    const TR = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const DEP = '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c';
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    const H1 = '0x' + '11'.repeat(32), H2 = '0x' + '22'.repeat(32);
    const log = (adr, de, vers, v, h, bloc) => ({
      address: adr, topics: [TR, enMot(BigInt(de)), enMot(BigInt(vers))], data: enMot(v),
      blockNumber: '0x' + bloc.toString(16), transactionHash: h, transactionIndex: '0x0',
      blockHash: '0x' + '99'.repeat(32), logIndex: '0x0', removed: false });

    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
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
    await page.route('**/api.dexscreener.com/**', (r) => r.abort());
    await page.route('**/avatar/**', (r) => r.fulfill({ status: 404, body: '' }));
    await page.route('**/nom/**', (r) => r.abort());
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const un = (m) => {
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_gasPrice') return enMot(134102000n);
        if (m.method === 'eth_getBalance') return enMot(5000000000000000n);
        if (m.method === 'eth_call') return enMot(0n);
        if (m.method === 'eth_getLogs') {
          const f = m.params[0], a = String(f.address || '').toLowerCase();
          const sortant = f.topics[1] !== null && f.topics[1] !== undefined;
          /* H1 : SWOGE contre SWOGEBET, un seul aller-retour dans la meme
             transaction. H2 : achat paye en ETH (RH), ou seul le SWOGE
             entrant laisse un evenement. */
          if (a === SWOGE && sortant) return [log(SWOGE, MOI, POOL, 1000000000000000000n, H1, 49925000)];
          if (a === SWOGEBET && !sortant) return [log(SWOGEBET, POOL, MOI, 5000000000000000000n, H1, 49925000)];
          if (a === SWOGE && !sortant) return [log(SWOGE, POOL, MOI, 400000000000000000000n, H2, 49924000)];
          return [];
        }
        if (m.method === 'eth_getTransactionReceipt') {
          const h = m.params[0];
          if (h === H1) return { transactionHash: H1, blockHash: '0x' + '99'.repeat(32),
            blockNumber: '0x2f9d5c8', transactionIndex: '0x0', from: MOI, to: ROUTER,
            gasUsed: '0x5208', cumulativeGasUsed: '0x5208', contractAddress: null,
            logs: [], logsBloom: '0x' + '0'.repeat(512), status: '0x1', type: '0x0',
            effectiveGasPrice: '0x7fe1f0' };
          if (h === H2) return { transactionHash: H2, blockHash: '0x' + '99'.repeat(32),
            blockNumber: '0x2f9d1e0', transactionIndex: '0x0', from: MOI, to: ROUTER,
            gasUsed: '0x5208', cumulativeGasUsed: '0x5208', contractAddress: null,
            /* Le routeur emballe l ether : c est CE journal qui porte le
               montant paye, faute de transfert natif. */
            logs: [{ address: WETH, topics: [DEP, enMot(BigInt(ROUTER))],
                     data: enMot(50000000000000000n), blockNumber: '0x2f9d1e0',
                     transactionHash: H2, transactionIndex: '0x0',
                     blockHash: '0x' + '99'.repeat(32), logIndex: '0x0', removed: false }],
            logsBloom: '0x' + '0'.repeat(512), status: '0x1', type: '0x0',
            effectiveGasPrice: '0x7fe1f0' };
          return null;
        }
        return null;
      };
      const rep = (m) => { const v = un(m);
        return v === null ? { jsonrpc: '2.0', id: m.id, error: { code: -32000, message: 'nope' } }
                          : { jsonrpc: '2.0', id: m.id, result: v }; };
      await r.fulfill({ contentType: 'application/json',
                        body: JSON.stringify(Array.isArray(q) ? q.map(rep) : rep(q)) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2400);
    await page.evaluate(() => document.querySelector('[data-va="ecActivite"]').click());
    await page.waitForTimeout(3000);
    const lignes = await page.evaluate(() => [...document.querySelectorAll('#acvCorps .wl-jeton')]
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

    const ech = lignes.filter((l) => /^Swapped/.test(l));
    ok(ech.length === 2, 'les deux transactions sont lues comme des ECHANGES, pas comme quatre virements ('
       + ech.length + ')');
    ok(!lignes.some((l) => /^Sent/.test(l)),
       'et plus aucune ligne ne dit « Sent » vers la piscine — c est ce qui faisait croire au joueur que ses jetons partaient chez un inconnu');
    ok(ech.some((l) => /1 SWOGE/.test(l) && /SWOGEBET/.test(l) && /\+5/.test(l)),
       'le sens et les deux montants y sont : 1 SWOGE donne, 5 SWOGEBET recus ('
       + (ech[0] || '') + ')');
    ok(ech.some((l) => /0\.05 ETH \(RH\)/.test(l)),
       'et l achat paye en ETH (RH) retrouve son montant, lu sur l emballage du routeur ('
       + (ech[1] || '') + ')');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ---- SE SOUVENIR DU COURRIEL ---- */
  console.log('\n-- le courriel retenu --');
  {
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(e.message));
    await page.route('**/privy-swoge.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: `
      window.__code=null;
      window.SwogePrivy={ init(){}, sendCode:async(e)=>{ window.__code=e; },
        verifyCode:async()=>null, logout:async()=>{}, restore:async()=>null,
        getProvider:()=>null, getAddress:()=>null, isLoggedIn:()=>false };` }));
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/api.dexscreener.com/**', (r) => r.abort());
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', (r) => r.abort());
    const charge = async () => {
      await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1800);
    };
    await charge();
    const ouvre = async () => {
      await page.evaluate(() => document.getElementById('acMoi').click());
      await page.waitForTimeout(500);
    };
    await ouvre();
    ok(await page.evaluate(() => document.getElementById('cnRetenir') !== null),
       'la feuille de connexion propose de retenir le courriel');
    await page.fill('#cnEmail', 'joueur@exemple.fr');
    await page.evaluate(() => document.getElementById('cnEnvoyer').click());
    await page.waitForTimeout(900);
    ok(await page.evaluate(() => window.__code) === 'joueur@exemple.fr',
       'le code part bien a l adresse tapee');

    await charge();
    await ouvre();
    const pre = await page.evaluate(() => document.getElementById('cnEmail').value);
    ok(pre === 'joueur@exemple.fr',
       'et au rechargement il est deja rempli — plus besoin de le retaper sur un telephone ('
       + pre + ')');

    /* ---- ET LA CASE LE RETIRE AUSSI BIEN QU ELLE LE GARDE ---- */
    await page.evaluate(() => { document.getElementById('cnRetenir').checked = false; });
    await page.evaluate(() => document.getElementById('cnEnvoyer').click());
    await page.waitForTimeout(900);
    ok(await page.evaluate(() => localStorage.getItem('swogeEmail')) === null,
       'decochee, elle EFFACE ce qui etait garde — sinon la case ne voudrait rien dire');
    await charge();
    await ouvre();
    ok(await page.evaluate(() => document.getElementById('cnEmail').value) === '',
       'et le champ revient vide');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ---- « REVIEW » NE MONTRAIT RIEN ----
   *
   * Le bouton s appelait Review et envoyait la demande de signature
   * directement. L essai le prend par les deux bouts : avec la revue, RIEN
   * ne part avant la confirmation ; sans elle, un seul clic suffit — et le
   * bouton change de nom, parce qu il ferait sinon la meme promesse vide.
   */
  console.log('\n-- la revue avant signature --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const VERS = '0x1111111111111111111111111111111111111111';
    const HASH = '0x' + 'cd'.repeat(32);
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');

    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(e.message));
    await page.addInitScript(([moi, vers, hash]) => {
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      window.__envois = 0;
      window.ethereum = { isMetaMask: true, on: () => {}, removeListener: () => {},
        request: async (a) => {
          const M = { eth_accounts: [moi], eth_requestAccounts: [moi], eth_chainId: '0x1237',
                      net_version: '4663', wallet_switchEthereumChain: null,
                      eth_gasPrice: '0x7fe1f0', eth_estimateGas: '0x5208',
                      eth_getTransactionCount: '0x1', eth_blockNumber: '0x2f7ce78' };
          if (a.method === 'eth_sendTransaction') { window.__envois++; return hash; }
          if (a.method === 'eth_getTransactionByHash') return {
            hash, from: moi, to: vers, value: '0x1', gas: '0x5208', gasPrice: '0x7fe1f0',
            nonce: '0x1', input: '0x', blockHash: null, blockNumber: null,
            transactionIndex: null, chainId: '0x1237',
            v: '0x0', r: '0x' + '0'.repeat(64), s: '0x' + '0'.repeat(64) };
          if (a.method in M) return M[a.method];
          return null; } };
    }, [MOI, VERS, HASH]);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/api.dexscreener.com/**', (r) => r.abort());
    await page.route('**/avatar/**', (r) => r.fulfill({ status: 404, body: '' }));
    await page.route('**/nom/**', (r) => r.abort());
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const un = (m) => {
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') return enMot(134102000n);
        if (m.method === 'eth_getBalance') return enMot(5000000000000000n);
        if (m.method === 'eth_getTransactionReceipt') return null;
        if (m.method === 'eth_call') return enMot(1234567890123456789012n);
        return null;
      };
      const rep = (m) => { const v = un(m);
        return v === null ? { jsonrpc: '2.0', id: m.id, error: { code: -32000, message: 'nope' } }
                          : { jsonrpc: '2.0', id: m.id, result: v }; };
      await r.fulfill({ contentType: 'application/json',
                        body: JSON.stringify(Array.isArray(q) ? q.map(rep) : rep(q)) });
    });
    const charge = async () => {
      await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2600);
    };
    const remplit = async () => {
      await page.evaluate(() => document.querySelector('[data-va="ecEnvoyer"]').click());
      await page.waitForTimeout(300);
      await page.fill('#enDest', VERS);
      await page.fill('#enMontant', '0.001');
    };
    await charge();

    /* ---- PAR DEFAUT, ELLE EST LA ---- */
    ok(await page.evaluate(() => document.getElementById('enPartir').textContent.trim()) === 'Review',
       'sans rien regler, le bouton s appelle « Review »');
    await remplit();
    await page.evaluate(() => document.getElementById('enPartir').click());
    await page.waitForTimeout(700);
    const rv = await page.evaluate(() => {
      const v = document.getElementById('voileRevue');
      return { vu: !v.hidden, montant: document.getElementById('rvMontant').textContent,
               dest: document.getElementById('rvDest').textContent.replace(/\s+/g, ''),
               reste: document.getElementById('rvReste').textContent,
               envois: window.__envois };
    });
    ok(rv.vu, 'et il OUVRE une revue au lieu de signer — c est ce que le mot promettait');
    ok(rv.envois === 0,
       'rien n est parti au portefeuille : ' + rv.envois + ' demande(s) de signature');
    ok(/0\.001/.test(rv.montant) && /ETH \(RH\)/.test(rv.montant),
       'la revue montre le montant ET le jeton (« ' + rv.montant + ' ») — la feuille de'
       + ' signature du portefeuille, elle, ne montre ni l un ni l autre');
    ok(rv.dest.toLowerCase() === VERS.toLowerCase(),
       'et l adresse ENTIERE, pas abregee : c est au milieu qu une adresse echangee se cache');
    ok(/0\.004/.test(rv.reste), 'avec ce qu il restera apres (« ' + rv.reste + ' »)');

    /* ---- ET « GO BACK » NE SIGNE RIEN ---- */
    await page.evaluate(() => document.getElementById('rvNon').click());
    await page.waitForTimeout(300);
    const apres = await page.evaluate(() => ({
      vu: !document.getElementById('voileRevue').hidden, envois: window.__envois,
      montant: document.getElementById('enMontant').value }));
    ok(!apres.vu && apres.envois === 0, 'revenir en arriere ne signe rien');
    ok(apres.montant === '0.001', 'et ne vide pas ce qui etait tape — sinon on n ose plus reculer');

    /* ---- CONFIRMER SIGNE, UNE FOIS ---- */
    await page.evaluate(() => document.getElementById('enPartir').click());
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('rvOk').click());
    await page.waitForTimeout(1800);
    ok(await page.evaluate(() => window.__envois) === 1,
       'confirmer signe, et une seule fois');

    /* ---- LE REGLAGE ----
       On RECHARGE d abord : l envoi precedent attend toujours son recu — le
       faux noeud n en rend aucun — et le bouton reste desactive tant qu une
       transaction est en vol. C est voulu, pas un defaut a contourner :
       deux envois lances a la suite sans savoir si le premier est passe,
       c est le double envoi. */
    await charge();
    await page.evaluate(() => document.querySelector('[data-va="ecCompte"]').click());
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.getElementById('cpRevue').checked) === true,
       'le reglage du compte la montre active');
    await page.evaluate(() => { const c = document.getElementById('cpRevue');
      c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.getElementById('enPartir').textContent.trim()) === 'Send',
       'decochee, le bouton s appelle « Send » — il ferait sinon la meme promesse vide qu avant');

    await remplit();
    await page.evaluate(() => document.getElementById('enPartir').click());
    await page.waitForTimeout(1800);
    const direct = await page.evaluate(() => ({ envois: window.__envois,
      vu: !document.getElementById('voileRevue').hidden }));
    ok(!direct.vu && direct.envois === 1,
       'et un seul clic envoie, sans feuille : c est le chemin rapide, assume');

    /* ---- ET LE REGLAGE SURVIT AU RECHARGEMENT ---- */
    await charge();
    ok(await page.evaluate(() => document.getElementById('enPartir').textContent.trim()) === 'Send',
       'le choix tient apres un rechargement — sinon il faudrait le refaire chaque fois');
    await page.evaluate(() => { const c = document.getElementById('cpRevue');
      c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await charge();
    ok(await page.evaluate(() => document.getElementById('enPartir').textContent.trim()) === 'Review',
       'et se remet dans l autre sens');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ---- COLLER UN CONTRAT, ET VOIR LE JETON ----
   *
   * Il y a plus de mille quatre cents jetons avec une piscine sur cette
   * chaine, et ce portefeuille en connaissait trois.
   *
   * Le noeud est faux ici, et il le faut : un essai qui interroge la vraie
   * chaine mesure aussi son humeur du jour. Ce qu'on verifie est le
   * RAISONNEMENT de la page — lire le contrat, choisir la piscine, ne rien
   * inventer quand il n'y a rien.
   */
  console.log('\n-- coller un contrat dans l echange --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const TOK = '0x1111111111111111111111111111111111111111';
    const MUET = '0x2222222222222222222222222222222222222222';
    const P_PROFOND = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';   /* v3 1 %  : 12 ETH */
    const P_VIDE    = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';   /* v3 0,3 % : 9 wei */
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    const chaine = (t) => {
      const b = Buffer.from(t, 'utf8').toString('hex');
      return '0x' + (32).toString(16).padStart(64, '0') + t.length.toString(16).padStart(64, '0')
           + b.padEnd(64, '0');
    };
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(e.message));
    await page.addInitScript(([moi]) => {
      try { localStorage.setItem('swogeAuth', 'wallet');
            localStorage.removeItem('swogeJetons'); } catch (e) {}
      window.ethereum = { isMetaMask: true, on: () => {}, removeListener: () => {},
        request: async (a) => {
          if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
          if (a.method === 'eth_chainId') return '0x1237';
          if (a.method === 'net_version') return '4663';
          return null; } };
    }, [MOI]);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/avatar/**', (r) => r.fulfill({ status: 404, body: '' }));
    await page.route('**/nom/**', (r) => r.abort());
    /* ---- L ORDRE DES ROUTES COMPTE, ET IL EST A L ENVERS ----
       Playwright essaie la DERNIERE route posee en premier. La regle large
       doit donc etre posee AVANT la precise, sinon c'est elle qui repond a
       tout — l'essai a d'abord echoue comme ca, en concluant que le logo ne
       remontait pas alors que la page allait tres bien le chercher. */
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    /* Dexscreener rend une image pour ce jeton-la. Le $SWOGEBET, lui, n'en a
       aucune dans la vraie vie — c'est pour ca que le repli existe. */
    await page.route('**/api.dexscreener.com/latest/dex/tokens/**', (r) => r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ pairs: [{ baseToken: { address: TOK },
                                       info: { imageUrl: 'https://exemple.test/x.png' } }] }) }));
    await page.route('https://exemple.test/**', (r) => r.fulfill({ status: 404, body: '' }));
    /* ---- ON DECIDE, DEPUIS ICI, SI LE JOUEUR EN DETIENT ----
     * Le faux noeud rendait un solde a tout le monde. Il faut pouvoir dire
     * « zero » pour mesurer ce qui se passe quand on cherche un jeton sans
     * l'acheter, puis « quelque chose » pour mesurer l'autre moitie. */
    let tientRVH = false;
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const un = (m) => {
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') return enMot(134102000n);
        if (m.method === 'eth_getBalance') return enMot(5000000000000000n);
        if (m.method !== 'eth_call') return null;
        const d = (m.params[0].data || '').toLowerCase();
        const to = (m.params[0].to || '').toLowerCase();
        const sel = d.slice(0, 10);
        const arg = (n) => '0x' + d.slice(10 + n * 64 + 24, 10 + (n + 1) * 64);
        /* la fabrique v3 : deux paliers repondent, de profondeurs tres
           differentes — c'est le coeur du choix */
        if (sel === '0x1698ee82') {
          if (arg(0) !== TOK.toLowerCase() && arg(1) !== TOK.toLowerCase()) return enMot(0n);
          const fee = parseInt(d.slice(10 + 2 * 64), 16);
          if (fee === 10000) return enMot(BigInt(P_PROFOND));
          if (fee === 3000) return enMot(BigInt(P_VIDE));
          return enMot(0n);
        }
        if (sel === '0xe6a43905') return enMot(0n);                 /* aucune paire v2 */
        if (sel === '0x70a08231') {                                  /* balanceOf */
          const qui = arg(0);
          if (qui === P_PROFOND.toLowerCase()) return enMot(12245000000000000000n);
          if (qui === P_VIDE.toLowerCase()) return enMot(9n);
          /* Le solde du JOUEUR sur le jeton cherche : zero tant qu'il ne l'a pas
             achete. Les lectures de profondeur, elles, portent sur le WETH et
             passent par les deux lignes au-dessus. */
          if (to === TOK.toLowerCase()) return enMot(tientRVH ? 4200000000000000000n : 0n);
          return enMot(1234567890123456789012n);
        }
        if (to === MUET.toLowerCase()) return null;                  /* rien ne repond */
        if (to === TOK.toLowerCase()) {
          if (sel === '0x95d89b41') return chaine('RVH');
          if (sel === '0x06fdde03') return chaine('Ravenhood');
          if (sel === '0x313ce567') return enMot(18n);
        }
        return enMot(0n);
      };
      const rep = (m) => { const v = un(m);
        return v === null ? { jsonrpc: '2.0', id: m.id, error: { code: -32000, message: 'nope' } }
                          : { jsonrpc: '2.0', id: m.id, result: v }; };
      await r.fulfill({ contentType: 'application/json',
                        body: JSON.stringify(Array.isArray(q) ? q.map(rep) : rep(q)) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    await page.evaluate(() => document.querySelector('[data-va="ecSwap"]').click());
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('swVersB').click());
    await page.waitForTimeout(300);

    const CH = '.wl-pick[data-pour="swVers"] .wl-pick-q input';
    const lit = () => page.evaluate(() => {
      const r = document.querySelector('.wl-pick[data-pour="swVers"] .wl-pick-r');
      /* ---- CE QU'ON LIT EST CE QUI EST VU ----
       * `textContent` rend AUSSI le texte cache : la mise en garde rangee
       * derriere le « i » y figurait, et l'essai concluait qu'elle s'etalait
       * toujours dans la rangee. On retire donc ce qui est cache avant de
       * lire — sinon « range » et « affiche » se mesurent pareil. */
      const vis = r.cloneNode(true);
      [].slice.call(vis.querySelectorAll('[data-dit]')).forEach((x) => x.remove());
      return { vu: !r.hidden, grave: r.classList.contains('grave'),
               txt: (vis.textContent || '').replace(/\s+/g, ' ').trim(),
               ajout: !!r.querySelector('[data-choisit]'), img: !!r.querySelector('img'),
               /* Ce que le « i » cache : on le lit a part, parce que ce qui
                  compte est justement qu'il ne soit PAS dans la rangee. */
               info: !!r.querySelector('[data-info]'),
               cache: (() => { const d = r.querySelector('[data-dit]');
                 return d ? { ferme: d.hidden, txt: (d.textContent || '').replace(/\s+/g, ' ').trim() } : null; })() };
    });

    /* ---- LA LISTE SE FILTRE ---- */
    await page.fill(CH, 'swogeb');
    await page.waitForTimeout(300);
    const filtre = await page.evaluate(() => [].slice
      .call(document.querySelectorAll('.wl-pick[data-pour="swVers"] .wl-pick-o'))
      .filter((x) => !x.hidden).map((x) => x.dataset.cle));
    ok(filtre.length === 1 && filtre[0] === 'swogebet',
       'du texte filtre ce qu on a deja (' + filtre.join(', ') + ')');

    /* ---- UNE ADRESSE TRONQUEE LE DIT, ET NE PART PAS LIRE LA CHAINE ---- */
    await page.fill(CH, '0x111111111111');
    await page.waitForTimeout(400);
    const court = await lit();
    ok(/42 characters/.test(court.txt) && !court.ajout,
       'une adresse trop courte est signalee, pas envoyee a la chaine (« ' + court.txt + ' »)');

    /* ---- UNE ADRESSE QUI NE REPOND PAS N INVENTE RIEN ---- */
    await page.fill(CH, MUET);
    await page.waitForTimeout(2500);
    const muet = await lit();
    ok(muet.grave && /answers like a token/.test(muet.txt) && !muet.ajout,
       'une adresse qui ne repond pas ne devient pas un jeton (« ' + muet.txt.slice(0, 70) + ' »)');

    /* ---- ET LE VRAI JETON ---- */
    await page.fill(CH, TOK);
    await page.waitForTimeout(3000);
    const t = await lit();
    console.log('   ' + t.txt.slice(0, 150));
    ok(/RVH/.test(t.txt) && /Ravenhood/.test(t.txt),
       'le symbole et le nom sont LUS SUR LE CONTRAT, pas devines');
    ok(/12\.245/.test(t.txt),
       'la piscine la plus PROFONDE gagne : 12,245 et non les neuf wei du palier a 0,3 %'
       + ' — prendre la premiere qui repond donnerait un devis absurde');
    ok(/1 %/.test(t.txt), 'et son palier est dit');
    ok(t.img, 'l image du jeton vient de Dexscreener quand il y en a une');
    ok(t.ajout, 'la rangee elle-meme se touche — plus de bouton « ajouter » a viser');

    /* ---- CE QUI EST RANGE DERRIERE LE « i » ----
     * La rangee portait un paragraphe de mise en garde et l'adresse en entier.
     * Dans un panneau de deux cent quarante pixels, cela poussait la liste
     * au-dela de sa hauteur et faisait apparaitre une barre de defilement pour
     * du texte que personne ne relit a chaque recherche. Ce n'est pas SUPPRIME
     * — l'adresse est la seule chose qui distingue vingt jetons nommes « AU »,
     * et la mise en garde compte — c'est RANGE, et l'essai verifie les deux
     * moities : absent de la rangee, present derriere le bouton. */
    ok(t.info, 'un bouton « i » accompagne la rangee');
    ok(t.cache && t.cache.ferme, 'et ce qu il porte est ferme au depart');
    ok(t.txt.toLowerCase().indexOf(TOK.toLowerCase()) < 0,
       'l adresse en entier ne s etale plus dans la rangee');
    ok(!/does not vouch/.test(t.txt), 'ni la mise en garde');
    await page.evaluate(() => document.querySelector('[data-info]').click());
    await page.waitForTimeout(200);
    const ouvert = await lit();
    ok(ouvert.cache && !ouvert.cache.ferme, 'le « i » l ouvre');
    ok(ouvert.cache && /does not vouch/.test(ouvert.cache.txt),
       'et la page dit alors qu elle ne se porte garante de rien');
    ok(ouvert.cache && ouvert.cache.txt.toLowerCase().indexOf(TOK.toLowerCase()) >= 0,
       'avec l adresse EN ENTIER : sur cette chaine vingt jetons partagent le symbole'
       + ' « AU », c est la seule chose qui les distingue');
    /* Et il ne choisit pas le jeton au passage : un doigt sur le « i » doit
       ouvrir le texte, pas engager un echange. */
    ok(await page.evaluate(() => document.getElementById('swVers').value) !== 'x' + TOK.toLowerCase(),
       'et le toucher n a PAS choisi le jeton — le « i » informe, il n engage rien');
    await page.evaluate(() => document.querySelector('[data-info]').click());
    await page.waitForTimeout(150);

    /* ---- ON TOUCHE LA RANGEE : LE JETON EST CHOISI ---- */
    await page.evaluate(() => document.querySelector('[data-choisit]').click());
    await page.waitForTimeout(1200);
    const apres = await page.evaluate(() => ({
      vers: document.getElementById('swVers').value,
      titre: document.querySelector('#swVersB .tx b').textContent,
      note: (document.getElementById('swNote').textContent || '').replace(/\s+/g, ' '),
      garde: localStorage.getItem('swogeJetons'),
      dansEnvoi: [].slice.call(document.getElementById('enJeton').options).map((o) => o.value),
    }));
    ok(apres.titre === 'RVH', 'il est choisi tout de suite : on l a cherche pour s en servir');
    ok(/RVH is a token you pasted in yourself/.test(apres.note)
       && apres.note.toLowerCase().indexOf(TOK.toLowerCase()) >= 0,
       'le rappel reste SOUS LE BOUTON tant qu il est choisi — c est au moment de signer'
       + ' qu il compte, pas trois secondes apres l avoir choisi');
    ok(apres.dansEnvoi.indexOf(apres.vers) >= 0,
       'et il entre aussi dans la liste de l envoi : un jeton qu on detient doit pouvoir partir');

    /* ---- CHOISIR N EST PAS RANGER ----
     * « Je l'ai ajoute, je l'ai pas achete, au final il est quand meme dans mon
     * wallet. » C'etait vrai : toucher le bouton ecrivait le jeton sur
     * l'appareil pour toujours. Chercher un contrat pour VOIR son prix laissait
     * une ligne de plus a chaque essai.
     * Le solde de ce jeton est zero dans ce banc d'essai — le faux noeud rend
     * zero pour tout ce qu'il ne connait pas — donc rien ne doit etre ecrit. */
    let g = null; try { g = JSON.parse(apres.garde || 'null'); } catch (e) {}
    ok(!g || !g.length,
       'un jeton qu on ne detient pas n est PAS ecrit sur l appareil : le chercher'
       + ' pour voir son prix ne doit rien laisser derriere');

    /* ---- ET IL NE S AFFICHE PAS DANS LA LISTE DES SOLDES ----
     * « J'ai un token dans mon wallet, j'en ai pas, il est encore affiche car
     * je l'avais add et pas achete. » Une liste de soldes ou la plupart des
     * lignes sont a zero cesse d'etre une liste de soldes. Il reste dans les
     * listes de l'echange : c'est justement la qu'on va pour en acheter. */
    const zero = await page.evaluate(() => ({
      liste: [].map.call(document.querySelectorAll('#acJetons [data-jeton]'), (b) => b.dataset.cle
        || b.getAttribute('data-jeton')),
      note: (document.getElementById('jtNote').textContent || '').replace(/\s+/g, ' ').trim(),
      dansEchange: [].slice.call(document.getElementById('swVers').options).map((o) => o.value),
    }));
    console.log('   a zero : ' + JSON.stringify(zero.liste) + ' | ' + zero.note.slice(0, 90));
    ok(!zero.liste.some((c) => /^x0x/.test(String(c))),
       'un jeton ajoute dont le solde est ZERO ne figure pas dans la liste des soldes');
    ok(/not shown/.test(zero.note),
       'et la page DIT qu il est cache — disparaitre sans un mot se lit comme une perte');
    ok(zero.dansEchange.some((c) => /^x0x/.test(String(c))),
       'mais il reste dans la liste de l echange : c est la qu on va pour en acheter');

    /* ---- MAIS EN DETENIR, OUI ----
     * Le jour ou le solde n'est plus zero, le jeton a sa place dans la liste :
     * on l'a achete. On repond donc un solde, on relit, et l'on regarde ce qui
     * est ecrit. Sans cette moitie, l'essai ne prouverait que la moitie de la
     * regle — et « rien n'est jamais garde » serait un defaut, pas une
     * reparation. */
    tientRVH = true;
    await page.evaluate(() => document.getElementById('btRafraichir').click());
    await page.waitForTimeout(2000);
    const tenu = await page.evaluate(() => localStorage.getItem('swogeJetons'));
    let g2 = null; try { g2 = JSON.parse(tenu || 'null'); } catch (e) {}
    ok(g2 && g2.length === 1 && g2[0].sym === 'RVH'
       && g2[0].pool.ver === 'v3' && g2[0].pool.fee === 10000,
       'des qu on en detient, il est garde sur l appareil AVEC sa piscine — la'
       + ' retrouver a chaque ouverture couterait cinq lectures de chaine');
    /* Et il REPARAIT dans la liste : c'est l'autre moitie de la regle. Sans
       elle, « on cache les zeros » pourrait cacher aussi ce qu'on detient. */
    const tenuListe = await page.evaluate(() =>
      [].map.call(document.querySelectorAll('#acJetons [data-jeton]'),
        (b) => b.getAttribute('data-jeton')));
    ok(tenuListe.some((c) => /^x0x/.test(String(c))),
       'et il reparait dans la liste des soldes des qu on en detient');

    /* ---- ET IL SE RETIRE ---- */
    await page.evaluate(() => document.getElementById('swVersB').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const x = document.querySelector('.wl-pick[data-pour="swVers"] [data-oublie]');
      if (x) x.click();
    });
    await page.waitForTimeout(600);
    const fin = await page.evaluate(() => ({
      garde: localStorage.getItem('swogeJetons'),
      vers: document.getElementById('swVers').value,
    }));
    ok(fin.garde === '[]' && fin.vers === 'eth',
       'le retirer le retire pour de bon, et l echange retombe sur un jeton connu');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* 12. LA TENUE, ET LES DEUX COLONNES
   *
   * ---- POURQUOI LE CLAIR EST PAR DEFAUT ----
   * Le reste du site est clair et bleu depuis toujours. Ce portefeuille etait
   * le seul ecran sombre et violet de la maison : on quittait l'arcade et l'on
   * changeait de site. Ce qui se mesure ici n'est pas « une couleur plait » —
   * c'est que la tenue par defaut est bien la claire, que le choix se GARDE, et
   * qu'il est pose AVANT le premier dessin (sinon celui qui a choisi le sombre
   * prend un eclair blanc a chaque ouverture).
   *
   * ---- ET POURQUOI ON MESURE LES COULEURS CALCULEES ----
   * Une couleur definie seulement dans l'un des deux blocs laisse un texte
   * d'une tenue sur le fond de l'autre. C'est le defaut le plus facile a
   * produire et le plus difficile a voir, puisqu'on ne regarde jamais les deux
   * en meme temps. On demande donc au navigateur, dans les deux tenues, ce
   * qu'il applique vraiment.
   */
  console.log('\n-- la tenue, et les deux colonnes --');
  {
    const boum = [];
    const page = await nav.newPage({ viewport: { width: 1280, height: 1000 } });
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 160)));
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const lu = () => page.evaluate(() => {
      const r = getComputedStyle(document.documentElement);
      const cs = getComputedStyle(document.body);
      return { marque: document.documentElement.getAttribute('data-theme'),
               fond: cs.backgroundColor, texte: cs.color,
               carte: r.getPropertyValue('--carte').trim(),
               accent: r.getPropertyValue('--accent').trim(),
               meta: (document.querySelector('meta[name="theme-color"]') || {}).content,
               garde: localStorage.getItem('swogeWalletTenue') };
    });

    const clair = await lu();
    console.log('   clair : ' + JSON.stringify(clair));
    ok(clair.marque === null,
       'a la premiere ouverture, aucune marque de tenue : c est la claire, celle du site');
    ok(clair.carte === '#FFFFFF' && clair.accent === '#1B5FE0',
       'et ses couleurs sont celles d index.html, mot pour mot (' + clair.carte
       + ', ' + clair.accent + ')');
    /* Le texte doit etre SOMBRE sur un fond CLAIR. On ne juge pas la teinte, on
       juge le contraste : c est la seule chose qui rende une page lisible. */
    const lum = (c) => { const m = String(c).match(/\d+/g);
      return m ? (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 : null; };
    ok(lum(clair.fond) > 0.8 && lum(clair.texte) < 0.3,
       'texte sombre sur fond clair (' + clair.fond + ' / ' + clair.texte + ')');

    /* ---- LES DEUX COLONNES ----
     * Elles portent le menu du site. Ce qu'on verifie n'est pas qu'elles
     * existent : c est qu'elles menent aux memes pages que le menu des autres
     * ecrans, et que l entree du portefeuille s y reconnait. Un menu qui
     * differe d une page a l autre apprend a ne plus le lire. */
    const col = await page.evaluate(() => {
      const g = document.querySelector('.wl-cote.gauche'), d = document.querySelector('.wl-cote.droite');
      const vu = (e) => !!(e && e.getBoundingClientRect().width > 0);
      return { gauche: vu(g), droite: vu(d),
               liens: [].map.call(document.querySelectorAll('.wl-nav a'),
                 (a) => a.getAttribute('href') + (a.classList.contains('on') ? '*' : '')),
               reseaux: document.querySelectorAll('.wl-reseaux a').length,
               /* ---- LA COLONNE DE DROITE DIT OU DEPENSER ----
                * Elle a d'abord porte les prix, le reseau et un paragraphe sur
                * ce que fait ce portefeuille. Reponse du joueur : « ça on s'en
                * fout — mets des éléments pour aller sur SWOGE World, une
                * table de blackjack, des trucs où on peut dépenser ses sous,
                * pas des stats. » Les prix sont deja sur l'ecran d'a cote et
                * l'adresse du noeud est dans les reglages ; ce qui manque a
                * cote d'un solde, c'est ou le depenser.
                * On verifie les DESTINATIONS, pas la decoration : un lien qui
                * ne mene nulle part apprend a ne plus cliquer. */
               vers: [].map.call(document.querySelectorAll('.wl-cote.droite a'),
                 (a) => a.getAttribute('href')),
               films: document.querySelectorAll('.wl-cote.droite video[src],'
                 + ' .wl-cote.droite img[src]').length };
    });
    console.log('   colonnes : ' + JSON.stringify(col));
    ok(col.gauche && col.droite, 'sur ordinateur, les deux colonnes sont la');
    ok(col.liens.join(',') === 'index.html,games.html,swogebet.html,swoge_wallet.html*,whitepaper.html',
       'le menu de gauche est celui du site, dans le meme ordre, et « Wallet » y est'
       + ' marque page courante (' + col.liens.join(', ') + ')');
    ok(col.reseaux === 3, 'les trois liens du site sont sous le menu');
    ok(col.vers.indexOf('nexus.html') >= 0,
       'la colonne de droite mene a SWOGE World');
    ok(col.vers.some((h) => /swoge_blackjack\.html/.test(h)),
       'a une table de blackjack');
    ok(col.vers.indexOf('games.html') >= 0, 'et au reste des jeux');
    ok(col.films >= 3, 'chacune montre le lieu, film ou affiche (' + col.films + ')');
    /* Et ces pages EXISTENT. Une carte qui mene a un 404 est pire qu'une carte
       absente : elle promet un endroit ou depenser, et elle renvoie une erreur.
       Le serveur de l'essai sert le vrai dossier — on le lui demande. */
    for (const h of col.vers) {
      const chemin = h.split('?')[0];
      const r = await page.evaluate((u) => fetch(u, { method: 'GET' })
        .then((x) => x.status).catch(() => 0), 'http://127.0.0.1:' + port + '/' + chemin);
      ok(r === 200, 'et ' + chemin + ' existe vraiment (' + r + ')');
    }

    /* ---- ET ELLES DISPARAISSENT SUR TELEPHONE ----
     * L ecran EST le portefeuille : il n y a pas de place a cote, et une
     * colonne repliee dessous allongerait la page sans rien apporter. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const petit = await page.evaluate(() => {
      const g = document.querySelector('.wl-cote.gauche');
      const t = document.getElementById('tel').getBoundingClientRect();
      return { colonne: g.getBoundingClientRect().width,
               cadre: Math.round(t.width), hauteur: Math.round(t.height),
               deborde: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    console.log('   telephone : ' + JSON.stringify(petit));
    ok(petit.colonne === 0, 'sur telephone les colonnes disparaissent');
    ok(petit.cadre === 390,
       'et le cadre reprend toute la largeur (' + petit.cadre + ')');
    /* Le piege exact rencontre en chemin : enveloppe dans une rangee, le cadre
       prenait la hauteur de son CONTENU — 345 pixels au lieu de 844, le
       portefeuille dans un tiers d ecran. */
    ok(petit.hauteur > 700,
       'et toute la hauteur (' + petit.hauteur + ') — enveloppe dans une rangee, il'
       + ' prenait celle de son contenu');
    ok(!petit.deborde, 'la page ne deborde pas horizontalement');

    /* ---- LA TENUE SOMBRE SE CHOISIT, ET ELLE SE GARDE ---- */
    await page.evaluate(() => {
      document.querySelector('[data-va="ecCompte"]').click();
      const c = document.getElementById('cpSombre');
      c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const sombre = await lu();
    console.log('   sombre : ' + JSON.stringify(sombre));
    ok(sombre.marque === 'sombre' && sombre.garde === 'sombre',
       'la case allume la tenue sombre, et le choix est garde');
    ok(lum(sombre.fond) < 0.2 && lum(sombre.texte) > 0.8,
       'texte clair sur fond sombre (' + sombre.fond + ' / ' + sombre.texte + ')');
    ok(sombre.meta && sombre.meta !== clair.meta,
       'la barre du navigateur suit la tenue (' + clair.meta + ' -> ' + sombre.meta + ')');

    /* ---- ET ELLE EST POSEE AVANT LE PREMIER DESSIN ----
     * Trois lignes dans l en-tete, pas dans le script de la page : celui-ci
     * s execute apres le rendu, et qui a choisi le sombre verrait un eclair
     * blanc a chaque ouverture. On le mesure sur une page NEUVE, au tout
     * premier instant ou le document existe. */
    const p2 = await nav.newPage({ viewport: { width: 390, height: 844 } });
    await p2.addInitScript(() => { try { localStorage.setItem('swogeWalletTenue', 'sombre'); } catch (e) {} });
    await p2.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'commit' });
    const tot = await p2.evaluate(() => document.documentElement.getAttribute('data-theme'))
      .catch(() => null);
    ok(tot === 'sombre',
       'la tenue gardee est deja posee au premier instant du document (' + tot + ')');
    await p2.close();

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* 12 bis. LES SOLDES SE RELISENT TOUT SEULS
   *
   * « Il y a un bouton pour rafraichir les soldes, pourquoi ce n est pas
   * automatique ? » Ce n en etait pas une decision : rien n avait jamais ete
   * ecrit pour relire. Les soldes se lisaient a la connexion et apres une
   * transaction, un point. Un joueur qui recevait un envoi pendant qu il
   * regardait son ecran ne le voyait jamais arriver.
   *
   * Ce qui se mesure ici n est pas la minuterie — attendre trente secondes
   * dans un essai, c est mesurer une horloge. C est le CHEMIN qui compte, et
   * il est le meme : revenir sur la page relit, et le fait sans un mot.
   */
  console.log('\n-- les soldes se relisent tout seuls --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    let solde = 5000000000000000n;   /* 0,005 */
    let muet = false, lectures = 0;
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 160)));
    await page.addInitScript((moi) => {
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      try { sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {}
      window.ethereum = { isMetaMask: true, on: () => {}, removeListener: () => {},
        request: async (q) => {
          if (q.method === 'eth_accounts' || q.method === 'eth_requestAccounts') return [moi];
          if (q.method === 'eth_chainId') return '0x1237';
          return null; } };
    }, MOI);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/api.dexscreener.com/**', (r) => r.abort());
    await page.route('**/avatar/**', (r) => r.fulfill({ status: 404, body: '' }));
    await page.route('**/nom/**', (r) => r.abort());
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const seul = !Array.isArray(q); const arr = seul ? [q] : q;
      const un = (m) => {
        if (m.method === 'eth_getBalance') { lectures++; return muet ? null : enMot(solde); }
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
      await r.fulfill({ contentType: 'application/json',
        body: JSON.stringify(seul ? out[0] : out) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2800);

    const lu = () => page.evaluate(() =>
      (document.querySelector('#acJetons .wl-jeton .val b') || {}).textContent || '');
    ok((await lu()) === '0.005', `le solde de depart est lu (${await lu()})`);

    /* ---- REVENIR SUR LA PAGE RELIT ----
     * C est le moment ou le chiffre a le plus de chances d avoir bouge. On
     * change le solde a la source SANS toucher au bouton.
     * ON ATTEND LE REPOS D ABORD : une relecture est refusee dans les dix
     * secondes qui suivent la precedente — sinon un aller-retour entre deux
     * onglets declencherait une passe a chaque fois. La page vient de lire au
     * chargement ; sans cette attente on mesurerait le garde-fou et l on
     * conclurait que la relecture ne marche pas. */
    solde = 9000000000000000n;
    await page.waitForTimeout(10500);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(1600);
    const apres = await lu();
    ok(apres === '0.009',
       `revenir sur la page relit le solde, sans toucher au bouton (${apres})`);

    /* ---- ET UNE PASSE AUTOMATIQUE NE VIDE PAS UN SOLDE ----
     * C est la moitie qui compte. Une lecture ratee laisse « — », et c est
     * juste quand le joueur vient d appuyer : il a demande, on lui repond.
     * Toutes les trente secondes, c est l inverse — un creux de reseau
     * effacerait le solde a l ecran sans que personne n ait rien demande, et
     * le joueur verrait son portefeuille se vider en le regardant. */
    muet = true;
    await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
    /* Le repos de dix secondes empeche une seconde passe tout de suite : on
       attend qu il soit passe, sinon on mesurerait le garde-fou. */
    await page.waitForTimeout(10500);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(1600);
    const garde = await lu();
    const bruit = await page.evaluate(() => document.getElementById('toast').textContent.trim());
    console.log(`   apres une lecture ratee : « ${garde} », message « ${bruit} »`);
    ok(garde === '0.009',
       `une passe automatique qui echoue GARDE la derniere valeur lue (${garde})`);
    ok(!bruit, 'et elle se tait — un message toutes les trente secondes couvre l ecran');

    /* ---- LE BOUTON, LUI, PARLE ----
     * Le joueur a demande : il a droit a une reponse, et au tiret qui va avec.
     * Sans cette moitie, « on garde la derniere valeur » deviendrait un
     * mensonge poli qui cacherait une chaine muette. */
    await page.click('#btRafraichir');
    await page.waitForTimeout(1800);
    const apresBouton = await lu();
    const ditBouton = await page.evaluate(() => document.getElementById('toast').textContent.trim());
    console.log(`   apres le bouton : « ${apresBouton} », message « ${ditBouton} »`);
    ok(apresBouton === '—' && /unknown|not read|could not/i.test(ditBouton),
       `le bouton, lui, dit que la chaine n a pas repondu (« ${ditBouton} »)`);

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* 13. L ANIMATION D OUVERTURE, ET LE FOND D ECRAN
   *
   * ---- CE QU ON MESURE, ET POURQUOI ----
   *
   * Une animation devant un portefeuille est une taxe : on ouvre cette page
   * pour voir un solde, souvent en dix secondes entre deux choses, et on la
   * paierait a CHAQUE visite. Ce qui se verifie ici n est donc pas qu elle
   * est jolie — c est qu elle ne coute rien a qui n en veut pas :
   *
   *   - le portefeuille est PEINT derriere, pendant qu elle passe ;
   *   - elle ne repasse pas deux fois dans la meme session ;
   *   - un appui la passe ;
   *   - et qui demande moins de mouvement ne la voit pas — ni ne TELECHARGE
   *     le film. Cinq cent trente-six kilo-octets pour un decor qu on ne
   *     verra pas, c est de l argent que le joueur paie sans le savoir.
   */
  console.log('\n-- l animation d ouverture --');
  {
    const boum = [];
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 160)));
    const films = [];
    page.on('request', (r) => { if (/wallet_intro\.(mp4|webm)/.test(r.url())) films.push(r.url()); });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);

    const debut = await page.evaluate(() => {
      const i = document.getElementById('wlIntro');
      const t = document.getElementById('tel').getBoundingClientRect();
      return { vu: !i.hidden,
               couvre: (() => { const r = i.getBoundingClientRect();
                 return Math.round(r.width) >= window.innerWidth && Math.round(r.height) >= window.innerHeight; })(),
               passe: !!document.getElementById('wlIntroPasse'),
               /* Le portefeuille existe DEJA derriere : c est toute la regle. */
               derriere: Math.round(t.height) > 300,
               ecran: (document.querySelector('.wl-ecran.on') || {}).id };
    });
    console.log('   ' + JSON.stringify(debut));
    ok(debut.vu, 'a la premiere ouverture, l animation est la');
    ok(debut.couvre, 'et elle prend tout l ecran du telephone');
    ok(debut.passe, 'avec un bouton qui dit qu on peut la passer');
    ok(debut.derriere && debut.ecran === 'ecAccueil',
       'le portefeuille est deja peint DERRIERE — elle ne retarde rien');

    /* ---- ET LE FOND DERRIERE LUI EST VRAIMENT BLANC ----
     *
     * Le film n avait pas ete mal decoupe : il avait ete APLATI sur le damier
     * gris que les editeurs dessinent pour figurer la transparence. La grille
     * etait donc DANS les pixels — 243 contre 255 — et en plein ecran sur un
     * telephone elle se voyait tout de suite.
     *
     * On ne mesure pas un coin choisi d avance : le chien bouge, les effets
     * passent, et un point sur (20, 20) finirait par tomber sur autre chose.
     * On mesure le DEFAUT lui-meme, sur toute l image — la part de pixels
     * clairs, neutres, mais PAS blancs. Le damier en donnait un quart de
     * l image ; il en reste l ecran blanc du telephone que le chien tient,
     * qui, lui, doit rester.
     */
    const fond = await page.evaluate(async () => {
      /* On ouvre le film DANS UN ELEMENT A NOUS, au lieu de se servir de
         celui de l ecran d ouverture : celui-la se ferme au bout d une
         seconde s il n est pas pret, et sa fermeture RETIRE la source. On
         mesurerait alors un element vide en croyant regarder le film. */
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.src = 'media/wallet_intro.webm';
      document.body.appendChild(v);
      await new Promise((f) => { v.addEventListener('canplaythrough', f, { once: true });
                                 v.addEventListener('error', f, { once: true });
                                 setTimeout(f, 15000); });
      if (!v.videoWidth) { v.remove(); return { large: 0 }; }
      /* Trois secondes : le damier ne s installait qu au bout de deux, les
         premieres images etaient blanches MEME AVANT la correction. */
      await new Promise((f) => { v.addEventListener('seeked', f, { once: true });
                                 v.currentTime = 3.0; setTimeout(f, 8000); });
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let gris = 0, blanc = 0;
      const n = c.width * c.height;
      for (let i = 0; i < d.length; i += 4) {
        const mn = Math.min(d[i], d[i+1], d[i+2]), mx = Math.max(d[i], d[i+1], d[i+2]);
        if (mn >= 236 && mx <= 252 && mx - mn <= 8) gris++;
        if (mn >= 253) blanc++;
      }
      const t = +v.currentTime.toFixed(2);
      v.remove();
      return { large: c.width, haut: c.height, t: t,
               gris: +(100*gris/n).toFixed(2), blanc: +(100*blanc/n).toFixed(2) };
    });
    console.log('   fond du film : ' + JSON.stringify(fond));
    /* Sans ce garde, un film qui ne decode pas rendrait « 0 % de gris » et
       l essai declarerait le damier disparu sans avoir rien regarde. */
    ok(fond.large === 540 && fond.haut === 822,
       'le film se decode vraiment (' + fond.large + ' x ' + fond.haut + ')');
    ok(Math.abs(fond.t - 3.0) < 0.3,
       'et c est bien la troisieme seconde qu on regarde (t = ' + fond.t + ' s) — avant deux'
       + ' secondes le fond etait blanc meme sans la correction');
    /* Les deux seuils sont poses ENTRE les deux films, mesures sur le meme
       banc a la meme seconde : l ancien rendait 23,83 % de gris et 11,19 % de
       blanc franc, le nouveau 0,99 % et 35,65 %. Chacun des deux echoue donc
       sur l ancien fichier — c est ce qui fait qu ils mesurent quelque chose. */
    ok(fond.blanc > 25,
       'et il est bien pose sur du blanc : ' + fond.blanc + ' % de l image l est franchement'
       + ' (11,19 % avant)');
    ok(fond.gris < 8,
       'plus de damier derriere lui : ' + fond.gris + ' % de gris clair, contre 23,83 % avant');

    /* ---- UN APPUI LA PASSE ---- */
    await page.evaluate(() => document.getElementById('wlIntro').click());
    await page.waitForTimeout(700);
    ok(await page.evaluate(() => document.getElementById('wlIntro').hidden),
       'un appui la passe, sans attendre la fin du film');

    /* ---- ET ELLE NE REVIENT PAS DANS LA MEME SESSION ----
     * Un film qu on a deja vu et qu on ne peut pas eviter devient une porte
     * fermee. Revenir de l ecran d envoi ne doit pas le rejouer. */
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    ok(await page.evaluate(() => document.getElementById('wlIntro').hidden),
       'et elle ne repasse pas a la visite suivante de la meme session');
    ok(films.length > 0, `le film a bien ete demande une fois (${films.length})`);
    await page.close();
  }

  /* ---- QUI DEMANDE MOINS DE MOUVEMENT NE PAIE PAS LE FILM ----
   * La source est posee EN SCRIPT, jamais dans la balise : sans quoi le
   * fichier partirait meme quand on a decide de ne pas le montrer. */
  {
    const page = await nav.newPage({ viewport: { width: 390, height: 844 },
                                     reducedMotion: 'reduce' });
    const films = [];
    page.on('request', (r) => { if (/wallet_intro\.(mp4|webm)/.test(r.url())) films.push(r.url()); });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    const calme = await page.evaluate(() => ({
      cache: document.getElementById('wlIntro').hidden,
      ecran: (document.querySelector('.wl-ecran.on') || {}).id }));
    ok(calme.cache && calme.ecran === 'ecAccueil',
       'mouvement reduit : pas d animation, le portefeuille tout de suite');
    ok(films.length === 0,
       `et le film n est meme pas TELECHARGE (${films.length} requete) — 536 ko epargnes`);
    await page.close();
  }

  /* ---- SUR ORDINATEUR, ELLE S OUVRE DANS LE TELEPHONE ----
   *
   * Elle etait posee a la racine du corps, en `position:fixed` : sur un ecran
   * de 1440 pixels, elle en noircissait 1440 pour annoncer une application qui
   * en fait 390. Le portefeuille est ici un telephone POSE SUR UNE PAGE, avec
   * le menu du site a gauche et les jeux a droite ; l ouverture doit se jouer
   * dans l appareil, pas devant tout l ecran.
   *
   * Ce qui se mesure n est pas « elle est plus petite » — c est qu elle tient
   * DANS le cadre et que ce qui l entoure reste visible. */
  console.log('\n-- l animation, sur grand ecran --');
  {
    const page = await nav.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const pc = await page.evaluate(() => {
      const i = document.getElementById('wlIntro');
      const r = i.getBoundingClientRect();
      const t = document.getElementById('tel').getBoundingClientRect();
      const g = document.querySelector('.wl-cote.gauche').getBoundingClientRect();
      const d = document.querySelector('.wl-cote.droite').getBoundingClientRect();
      return { vu: !i.hidden, pos: getComputedStyle(i).position,
               dansLeCadre: r.left >= t.left - 2 && r.right <= t.right + 2
                         && r.top >= t.top - 2 && r.bottom <= t.bottom + 2,
               large: Math.round(r.width), largeCadre: Math.round(t.width),
               ecran: window.innerWidth,
               gauche: Math.round(g.width), droite: Math.round(d.width) };
    });
    console.log('   ' + JSON.stringify(pc));
    ok(pc.vu, 'sur grand ecran l animation passe quand meme');
    ok(pc.pos === 'absolute' && pc.dansLeCadre,
       'mais elle tient DANS le cadre du telephone, elle ne prend plus l ecran');
    ok(pc.large <= pc.largeCadre + 2 && pc.large < pc.ecran / 2,
       `elle fait ${pc.large} px de large, pas ${pc.ecran}`);
    ok(pc.gauche > 100 && pc.droite > 100,
       `et les deux colonnes restent visibles autour (${pc.gauche} et ${pc.droite} px)`);
    await page.close();
  }

  /* ---- LE FOND D ECRAN ----
   * Il passe DERRIERE les cartes. Pose par-dessus il etait magnifique et il
   * voilait le texte : « TOTAL BALANCE » se lisait a travers une nappe bleue.
   * Un decor qui rend un solde moins lisible n est pas un decor. */
  console.log('\n-- le fond d ecran --');
  {
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => { try { sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {} });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    const f = await page.evaluate(() => {
      const c = document.querySelector('.wl-cadre');
      if (!c) return { absent: true };
      const s = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      /* La question qui compte : au milieu d une carte, qui recoit le doigt ?
         Si c est le decor, toute la page est morte — c est le defaut qui a
         rendu un ecran de jeu entier inutilisable ailleurs dans ce depot. */
      const carte = document.querySelector('#ecAccueil .wl-carte').getBoundingClientRect();
      const sous = document.elementFromPoint(carte.x + carte.width / 2, carte.y + carte.height / 2);
      return { charge: c.naturalWidth > 0, doigt: s.pointerEvents,
               large: Math.round(r.width), haut: Math.round(r.height),
               recu: sous ? (sous.classList.contains('wl-cadre') ? 'le decor' : 'la carte') : 'rien' };
    });
    console.log('   ' + JSON.stringify(f));
    ok(!f.absent && f.charge, 'le fond d ecran est la, et il a CHARGE');
    ok(f.doigt === 'none', `il ne prend jamais le doigt (${f.doigt})`);
    ok(f.recu === 'la carte',
       `et il passe derriere : au milieu d une carte, c est la carte qui recoit le doigt (${f.recu})`);
    ok(f.large >= 380 && f.haut > 600, `il couvre le cadre (${f.large} x ${f.haut})`);
    await page.close();
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
