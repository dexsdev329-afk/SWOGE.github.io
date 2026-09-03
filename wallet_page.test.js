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

/* ---- COMBIEN DE JETONS LE PORTEFEUILLE CONNAIT-IL ? ----
 * Releve DANS LA PAGE, jamais recopie ici : les trois de la maison plus l ETH
 * d Ethereum sont ecrits a la main, et une ligne s ajoute pour chaque chaine
 * du pont. Le jour ou une huitieme chaine arrive, ce nombre suit tout seul —
 * un chiffre en dur ferait echouer un essai qui n a rien vu de faux. */
const SRC_PAGE = fs.readFileSync(path.join(SITE, 'swoge_wallet.html'), 'utf8');
const JETONS_ECRITS = ((/var JETONS = \[([\s\S]*?)\n\];/.exec(SRC_PAGE) || ['', ''])[1]
                       .match(/\{ cle:'/g) || []).length;
const IDS_PONT = [...((/var CHAINES_PONT = \[([\s\S]*?)\n\];/.exec(SRC_PAGE) || ['', ''])[1])
                   .matchAll(/\bid:(\d+)/g)].map((m) => Number(m[1]));
/* moins un : Ethereum est deja ecrit a la main, sous le nom `ethL1`. */
const JETONS_ATTENDUS = JETONS_ECRITS + IDS_PONT.length - 1;

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

  /* ---- AUCUNE LECTURE NE PART SUR LE VRAI RESEAU ----
   * Depuis que le portefeuille lit le solde des sept chaines du pont, chaque
   * page ouverte ici appelait sept RPC publics pour de vrai : neuf secondes
   * d attente par chaine muette, un banc qui depend d Internet, et des essais
   * qui echouent selon l heure. Le filet est pose sur CHAQUE page des sa
   * naissance ; un bloc qui joue vraiment une chaine pose sa propre route
   * apres, et Playwright donne la main a la derniere posee. */
  const CHAINES_HORS_BANC =
    /(base-rpc|mainnet\.base|arbitrum-one-rpc|arb1\.arbitrum|optimism-rpc|mainnet\.optimism|bsc-rpc|polygon-bor-rpc|avalanche-c-chain-rpc|solana-rpc)/;
  const _newPage = nav.newPage.bind(nav);
  nav.newPage = async (o) => {
    const p = await _newPage(o);
    await p.route(CHAINES_HORS_BANC, (r) => r.fulfill({
      status: 500, contentType: 'application/json',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1,
                             error: { code: -32000, message: 'banc: chaine non jouee' } }) }));
    return p;
  };

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
    /* ---- CETTE REGLE A CHANGE D ECRAN, PAS DE MOTIF ----
     * Elle comptait quatre lignes sur l ACCUEIL : les trois de la chaine plus
     * l ETH d Ethereum. L accueil annonce pourtant la Robinhood Chain et un
     * total qui ne compte qu elle : une ligne d ailleurs posee dessous
     * n entrait dans aucun des deux. Elle a donc demenage dans « Tokens »,
     * qui est fait pour tout ce qu on detient, ou qu on le detienne. Ce qui
     * se verifie est inchange : les deux ether coexistent, et rien ne permet
     * de les confondre. */
    const surAcc = await p.evaluate(() =>
      [...document.querySelectorAll('#acJetons .wl-jeton .nom b')].map((x) => x.textContent));
    ok(surAcc.length === 3 && surAcc.indexOf('SWOGE') >= 0 && surAcc.indexOf('SWOGEBET') >= 0
       && surAcc.indexOf('ETH (RH)') >= 0,
       'l accueil montre les trois jetons de la chaine, et eux seuls ('
       + surAcc.join(', ') + ')');
    await p.evaluate(() => {
      const b = document.querySelector('#pied button[data-va="ecJetons"]'); if (b) b.click(); });
    await p.waitForTimeout(300);
    const syms = await p.evaluate(() =>
      [...document.querySelectorAll('#jtListe .wl-jeton .nom b')].map((x) => x.textContent));
    ok(syms.length >= 4 && syms.indexOf('SWOGE') >= 0 && syms.indexOf('SWOGEBET') >= 0
       && syms.indexOf('ETH (RH)') >= 0 && syms.indexOf('ETH') >= 0,
       '« Tokens » les montre tous, l ETH d Ethereum compris ('
       + syms.join(', ') + ')');
    /* ---- LES DEUX ETHER SE DISTINGUENT ----
     * Depuis le pont, le portefeuille tient de l ether sur DEUX chaines. Deux
     * lignes qui s appellent toutes deux « ether » ne valent que si l on voit
     * laquelle est laquelle : le nom le dit, et la piece aussi — un joueur qui
     * lit vite ne lit pas le nom. */
    const ethers2 = await p.evaluate(() =>
      [...document.querySelectorAll('#jtListe .wl-jeton')]
        .map((r) => ({ sym: r.querySelector('.nom b').textContent,
                       nom: (r.querySelector('.nom small') || {}).textContent || '',
                       img: (r.querySelector('img') || {}).getAttribute
                            ? r.querySelector('img').getAttribute('src') : null }))
        .filter((x) => /ETH/.test(x.sym)));
    console.log('   les deux ether : ' + JSON.stringify(ethers2));
    ok(ethers2.length >= 2, 'il y a bien plusieurs lignes d ether (' + ethers2.length + ')');
    /* Et l une SOUS l autre : deux fois le meme actif se comparent d un coup
       d oeil quand ils se touchent, pas quand deux jetons les separent. */
    ok(syms[0] === 'ETH (RH)' && syms[1] === 'ETH',
       'et l ETH d Ethereum est juste sous l ETH (RH) (' + syms.slice(0, 4).join(', ') + ')');
    /* Sept chaines peuvent porter de l ether maintenant : ce qui compte n est
       pas LAQUELLE, c est que chacune le DISE. */
    ok(ethers2.every((x) => / on \S/.test(x.nom)),
       'et chacune DIT sur quelle chaine elle est ('
       + ethers2.map((x) => x.sym + ' = ' + x.nom).join(' | ') + ')');
    ok(new Set(ethers2.map((x) => x.img)).size === ethers2.length,
       'chacune avec SA piece — le nom seul ne se lit pas assez vite ('
       + ethers2.map((x) => String(x.img).split('/').pop()).join(', ') + ')');
    /* ---- « ETH » TOUT COURT NE DOIT PLUS SE LIRE COMME UN SOLDE ----
       Le joueur a deux soldes d'ether : celui-ci et celui de la chaine
       principale, dans son autre portefeuille. Les deux ecrits « ETH », il
       croit voir le meme a deux endroits. */
    /* ---- LA REGLE A CHANGE PARCE QUE LA SITUATION A CHANGE ----
     *
     * Elle disait : « aucune ligne ne doit s appeler ETH tout court ». Elle
     * valait quand une SEULE ligne d ether existait — l appeler « ETH » aurait
     * laissé croire qu il s agissait de l ether d Ethereum, qui n etait nulle
     * part. Depuis le pont, l ether d Ethereum est bel et bien la, et refuser
     * de l appeler par son nom serait l invention inverse.
     *
     * Ce qu il fallait protéger, ce n est pas le nom : c est qu on ne puisse
     * pas confondre les deux. La regle devient donc celle-la — une ligne
     * nommee « ETH » n existe QUE si sa chaine est ecrite sur la meme ligne,
     * et qu une autre ligne, distincte, porte l autre ether. */
    const rangsEth = await p.evaluate(() =>
      [...document.querySelectorAll('#acJetons .wl-jeton')]
        .map((r) => ({ sym: r.querySelector('.nom b').textContent,
                       nom: (r.querySelector('.nom small') || {}).textContent || '' }))
        .filter((x) => /^ETH/.test(x.sym)));
    ok(rangsEth.every((x) => /Ethereum|Robinhood/.test(x.nom)),
       'aucune ligne « ETH » ne se presente sans dire SA chaine — c est la'
       + ' confusion qu on cherche a eviter ('
       + rangsEth.map((x) => x.sym + ' : ' + x.nom).join(' | ') + ')');
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
    ok(new Set(logos.map((x) => x.src)).size === logos.length,
       'et autant de pieces DIFFERENTES que de lignes — aucune n emprunte celle d une autre ('
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
      /* La ligne de l ETH (RH), pas « la premiere image » : depuis le pont il
         y a deux lignes d ether, et la premiere n est pas forcement la sienne. */
      const rang = [...document.querySelectorAll('#acJetons .wl-jeton')]
        .find((r) => r.querySelector('.nom b').textContent === 'ETH (RH)');
      const im = rang.querySelector('img');
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.drawImage(im, 0, 0, 128, 128);
      const d = g.getImageData(0, 0, 128, 128).data;
      let vert = 0, violet = 0, vus = 0, mur = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [r, v, b, a] = [d[i], d[i+1], d[i+2], d[i+3]];
        if (a <= 128) continue;
        vus++;
        if (v > r + 40 && v > b + 40) vert++;
        if (b > v + 30 && r > v + 15) violet++;
        /* Le mur gris-vert sur lequel l enseigne est photographiee. */
        const L = (r + v + b) / 3, mn = Math.min(r, v, b), mx = Math.max(r, v, b);
        if (L > 50 && L < 130 && v >= r && v >= b && mx - mn < 32) mur++;
      }
      const coin = (x, y) => d[(y * 128 + x) * 4 + 3];
      return { src: im.getAttribute('src'), vus,
               coins: [coin(2, 2), coin(125, 2), coin(2, 125), coin(125, 125)],
               vert: +(100*vert/16384).toFixed(2), violet: +(100*violet/16384).toFixed(2),
               mur: +(100*mur/16384).toFixed(2) };
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

    /* ---- ET ELLE EST RONDE, PARCE QU ON A GARDE SA TRANSPARENCE ----
     *
     * L image livree porte deja son canal alpha : 76 % de sa surface est
     * transparente et l enseigne y est detouree, liston noir compris. Je l ai
     * convertie en RGB — ce qui jette l alpha et fait apparaitre les pixels
     * caches DESSOUS : un mur gris-vert. J ai alors redecoupe un cercle a la
     * main autour de ce faux mur, en coupant a ras du neon. Il n y avait rien
     * a decouper.
     *
     * Ces deux mesures disent exactement cela, et rien d autre ne les ferait
     * tomber : l alpha jete, les coins passent de 0 a 255 et le mur de
     * 0,15 % a 58 % de la piece. */
    ok(teintes.coins.every((a) => a < 10),
       'et ses quatre coins sont transparents (' + teintes.coins.join(', ')
       + ') : c est une piece ronde, pas une photo carree');
    ok(teintes.mur < 3,
       'aucun mur gris-vert autour d elle (' + teintes.mur + ' %) — 58 % si l on jette son alpha');
    /* ---- LA MAQUETTE MONTRAIT DES JETONS QUI N EXISTAIENT PAS ----
     *
     * SWOCHIP, SWOPOOL, SWOXP : aucun n a jamais eu d adresse sur aucune
     * chaine. Un portefeuille qui affiche un jeton inexistant apprend a son
     * proprietaire a ne plus le croire, et cette regle veille dessus.
     *
     * « Solana » figurait dans cette liste, pour la meme raison — la maquette
     * en montrait et il n y en avait pas. Il en existe un maintenant : une
     * vraie adresse, sur une vraie chaine, creee par le compte du joueur. Le
     * retirer de la liste n est donc pas un assouplissement, c est le fait
     * qui a change. Ce que la regle protege — ne rien montrer qui n existe
     * pas — est desormais mesure ailleurs : l ecran Solana est verifie de
     * bout en bout dans « l adresse solana ». */
    for (const faux of ['SWOCHIP', 'SWOPOOL', 'SWOXP']) {
      ok(t.indexOf(faux) < 0,
         'aucune trace de « ' + faux +' » — la maquette en montrait, il n existe pas');
    }
    /* Et la LISTE DES SOLDES ne parle pas de Solana : cette adresse vit dans
       « Account ». On interroge donc la liste elle-meme — la sonde de texte
       ci-dessus lit toute la page, ecrans caches compris, et y trouverait le
       titre « SOLANA » de l ecran Account sans rien prouver. */
    const listeTx = await p.evaluate(() =>
      (document.getElementById('acJetons') || {}).textContent || '');
    ok(listeTx.indexOf('Solana') < 0 && listeTx.indexOf('SOL') < 0,
       'et la liste des soldes ne parle pas de Solana : cette adresse vit dans Account');
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
    /* ---- CETTE REGLE A CHANGE DE CAMP, ET VOICI POURQUOI ----
     *
     * Elle disait : « la liste du Send propose les trois jetons, et JAMAIS
     * l ETH d une autre chaine — on ne peut pas l envoyer depuis ici ». Cette
     * phrase etait vraie tant que le portefeuille ne savait signer que sur la
     * Robinhood Chain. Elle a cesse de l etre le jour ou le pont s est ouvert
     * a sept chaines : un joueur a envoye son ETH (RH) vers Base, l a vu
     * partir, et ne l a plus retrouve NULLE PART — « quand je fais envoyer je
     * les vois pas non plus ». La liste vide n etait pas une protection,
     * c etait une impasse.
     *
     * Ce qu il faut garder de la regle d origine, c est son motif : ne jamais
     * proposer une transaction qui ne peut pas exister. Elle vaut donc
     * toujours — mais pour l ECHANGE, dont le routeur et les piscines sont
     * bien, eux, sur la seule Robinhood Chain. Elle est verifiee plus bas.
     */
    ok(lignes.length === JETONS_ATTENDUS,
       'la liste du Send propose TOUT ce que le portefeuille sait envoyer, les '
       + 'chaines du pont comprises (' + lignes.length + ')');
    ok(lignes.every((x) => x.logo && x.charge),
       'et chacun y montre SA piece, chargee : '
       + lignes.map((x) => x.sym + (x.charge ? '' : ' MANQUE')).join(', '));
    /* Trois lignes s appellent « ETH » — sur la Robinhood Chain, sur Base, sur
       Ethereum. C est la piece qui les separe a l oeil. Deux qui partageraient
       le meme dessin feraient signer un envoi sur la mauvaise chaine. */
    ok(new Set(lignes.map((x) => x.logo)).size === lignes.length,
       lignes.length + ' pieces differentes — aucune n emprunte celle d une autre');

    /* ---- L ECHANGE PROPOSE LES AUTRES CHAINES, ET LES SUIT ----
     *
     * Cette liste s arretait a la Robinhood Chain, et la raison ecrite ici
     * etait : « le routeur est ici, l echec arriverait apres la signature ».
     * Elle etait vraie avant le relayeur. Elle ne l est plus : payer depuis
     * Base est un chemin que cette page sait faire — il est mesure plus bas,
     * de bout en bout, jusqu a la note « arrived on ». Ce qui restait n etait
     * donc plus une protection mais l effet d une liste rangee par chaine, qui
     * obligeait a annoncer la chaine avant de choisir le jeton.
     *
     * Ce qu il faut verifier a la place, c est l INVARIANT : le jeton qui paie
     * et la chaine de depart ne se contredisent jamais. Tant qu il tient, une
     * ligne de Base construit la transaction du relayeur, pas un echange local
     * impossible. */
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('[data-va="ecAccueil"]').click());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('[data-va="ecSwap"]').click());
    await page.waitForTimeout(250);
    const swLignes = await page.evaluate(() =>
      [...document.querySelectorAll('#swDe option')].map((o) => o.value));
    ok(swLignes.indexOf('ch8453') >= 0 && swLignes.indexOf('ethL1') >= 0,
       'la liste de l echange porte les autres chaines : on choisit le jeton, pas la chaine '
       + '(' + swLignes.join(', ') + ')');
    ok(swLignes.indexOf('eth') >= 0 && swLignes.indexOf('swoge') >= 0,
       'sans rien perdre de ce qui vit ici');
    const suit = await page.evaluate(async () => {
      const s = document.getElementById('swDe');
      s.value = 'ch8453';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
      return { de: s.value, ch: (document.getElementById('swChaineNom') || {}).textContent };
    });
    console.log('   une ligne de Base : ' + JSON.stringify(suit));
    ok(suit.de === 'ch8453' && /Base/.test(suit.ch),
       'et la chaine de depart SUIT le jeton : sans ca, l ecran serait coherent avec le '
       + 'mauvais jeton, et le devis, lui, serait juste (' + suit.ch + ')');
    await page.evaluate(async () => {
      const s = document.getElementById('swDe');
      s.value = 'eth';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
    });
    await page.evaluate(() => document.querySelector('[data-va="ecAccueil"]').click());
    await page.waitForTimeout(150);
    await page.evaluate(() => document.querySelector('[data-va="ecEnvoyer"]').click());
    await page.waitForTimeout(200);
    /* On rouvre la liste : la mesure qui suit porte sur une liste OUVERTE, et
       une liste fermee la ferait passer sans rien voir. */
    await page.click('#enJetonB');
    await page.waitForTimeout(250);

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

    /* -- le `<select>` cache ne prend pas le focus au passage --
     * La verification porte sur les MIROIRS (`.wl-cache`), pas sur tous les
     * `<select>` de la page. L'ecran du banc en a un vrai, visible, qu'on
     * choisit a la souris ou au clavier : lui sortir la tabulation le rendrait
     * inatteignable sans souris. La regle n'a jamais ete « aucun select ne se
     * tabule » — c'etait « on ne tabule pas deux fois sur le meme choix ». */
    ok(await page.evaluate(() =>
         [...document.querySelectorAll('select.wl-cache')].every((s) => s.tabIndex === -1)),
       'le `<select>` garde la valeur mais sort de la tabulation : sinon on tabule deux fois'
       + ' sur le meme choix');

    /* Et le revers, qui compte autant : un `<select>` qu'on VOIT doit se
       tabuler. Un reglage atteignable seulement a la souris n'est pas un
       reglage pour tout le monde. */
    ok(await page.evaluate(() =>
         [...document.querySelectorAll('select:not(.wl-cache)')].every((s) => s.tabIndex >= 0)),
       'et celui qu on voit, lui, reste atteignable au clavier');

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
    await page.route('**/privy-swoge.js*', (r) => r.fulfill({
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
    await page.route('**/privy-swoge.js*', (r) => r.fulfill({
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
    /* ---- LE MENU DU SITE, ET PAS UNE COPIE QUI DERIVE ----
     * Cette liste etait recopiee ici a cinq entrees, et « SWOGE AI » manquait
     * — sur la page du portefeuille precisement. Ce n'est pas un oubli isole :
     * vingt et une pages avaient perdu « Wallet » de la meme facon. Un menu
     * partage recopie a la main dans chaque page derive toujours, et chaque
     * copie a l'air correcte tant qu'on ne les met pas cote a cote.
     * La liste attendue est donc ecrite UNE fois, comme le contrat du site,
     * et c'est elle qu'il faut relire le jour ou cet essai echoue. */
    ok(col.liens.join(',') === 'index.html,games.html,swogebet.html,swoge_wallet.html*,'
         + 'swoge_ai.html,whitepaper.html',
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

  /* ---- LA CONNEXION S OUVRE-T-ELLE VRAIMENT, SUR UN PORTABLE ? ----
   *
   * « Sur PC quand j ai clique sur connexion il ne m a pas propose le mail ;
   * sur telephone oui. » Le formulaire etait pourtant le meme aux deux
   * endroits — c est la MESURE qui l a montre : le cadre du telephone faisait
   * 844 pixels de haut quelle que soit la fenetre, et la feuille de connexion
   * s ouvre contre son bord INFERIEUR. Sur un portable de 650 pixels, le
   * cadre en depassait 249 : on cliquait, la feuille s ouvrait bel et bien —
   * sous le bord de l ecran. La barre d onglets etait hors champ avec elle,
   * des que la fenetre descendait sous 900 pixels.
   *
   * Ce qui se verifie ici n est donc pas « le champ existe » : il a toujours
   * existe. C est qu il est ATTEIGNABLE, avec tout ce qui l accompagne, sans
   * avoir a deviner qu il faut faire defiler la page. */
  console.log('\n-- se connecter depuis un portable --');
  for (const [w, h] of [[1440, 900], [1440, 760], [1366, 650], [1280, 600], [820, 700]]) {
    const page = await nav.newPage({ viewport: { width: w, height: h } });
    await page.addInitScript(() => { try { sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {} });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    /* Le meme geste que le joueur, a la souris : « Tap to sign in ». */
    const cible = await page.evaluate(() => {
      const r = document.getElementById('acNom').getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    await page.mouse.click(cible.x, cible.y);
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const dedans = (id) => { const r = document.getElementById(id).getBoundingClientRect();
        return r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.width > 0; };
      const doc = document.documentElement;
      return { vue: !document.getElementById('voile').hidden,
               hors: ['cnEmail', 'cnEnvoyer', 'cnExtension', 'cnFermer', 'pied'].filter((i) => !dedans(i)),
               telBas: Math.round(document.getElementById('tel').getBoundingClientRect().bottom),
               fenetre: window.innerHeight,
               defile: doc.scrollHeight > doc.clientHeight + 1 };
    });
    console.log(`   ${w}x${h} : ` + JSON.stringify(m));
    ok(m.vue, `${w}x${h} : le formulaire s ouvre`);
    ok(m.hors.length === 0,
       m.hors.length === 0
         ? `${w}x${h} : le courriel, « Send code », « Use a browser wallet », « Cancel »`
           + ' et la barre d onglets sont TOUS dans la fenetre'
         : `${w}x${h} : hors de l ecran — ${m.hors.join(', ')}`);
    ok(m.telBas <= m.fenetre,
       `${w}x${h} : le cadre s arrete a ${m.telBas}, dans une fenetre de ${m.fenetre}`);
    ok(!m.defile, `${w}x${h} : et il n y a rien a faire defiler pour y arriver`);
    await page.close();
  }

  /* ==================== LE PONT ====================
   *
   * ETH d Ethereum vers la Robinhood Chain, et retour. C est le seul ecran de
   * ce portefeuille qui fasse signer sur DEUX chaines, et se tromper de
   * chaine y envoie de l ETH au contrat du relayeur la ou il n existe pas.
   * C est donc la premiere chose mesuree ici, avant meme les montants.
   *
   * Le relayeur est joue par un faux service : ses reponses sont ecrites ici,
   * donc connues, donc verifiables. On ne mesure pas Relay — on mesure ce que
   * la page FAIT de ce que Relay repond.
   */
  console.log('\n-- le pont --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    /* L etat du faux monde, pilote depuis l essai. */
    const w = { chaine: '0x1237', soldeL1: 300000000000000000n, soldeRH: 40000000000000000n,
                bascules: [], envoyees: [], devisRefuse: false, statut: 'success',
                gaz: 20000000000000n, recu: null };

    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 200)));
    await page.addInitScript(([moi]) => {
      try { localStorage.setItem('swogeAuth', 'wallet');
            sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {}
      window.__w = { chaine: '0x1237', bascules: [], envoyees: [] };
      const HASH = '0x' + 'ab'.repeat(32);
      window.ethereum = {
        isMetaMask: true,
        request: async (a) => {
          const w = window.__w;
          if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
          if (a.method === 'eth_chainId') return w.chaine;
          if (a.method === 'net_version') return String(parseInt(w.chaine, 16));
          if (a.method === 'wallet_switchEthereumChain') {
            w.bascules.push(a.params[0].chainId); w.chaine = a.params[0].chainId; return null;
          }
          if (a.method === 'wallet_addEthereumChain') return null;
          /* Avant d'envoyer, ethers interroge le portefeuille : nonce, gaz,
             estimation. Un `null` a l'une de ces questions fait echouer
             l'envoi sur « bad result from backend » — ce qui ressemble a un
             defaut de la page alors que c'est le banc qui est muet. */
          if (a.method === 'eth_getTransactionCount') return '0x0';
          if (a.method === 'eth_gasPrice') return '0x3b9aca00';
          if (a.method === 'eth_maxPriorityFeePerGas') return '0x3b9aca00';
          if (a.method === 'eth_estimateGas') return '0x5208';
          if (a.method === 'eth_call') return '0x';
          if (a.method === 'eth_sendTransaction') {
            w.envoyees.push(Object.assign({ surLaChaine: w.chaine }, a.params[0]));
            return HASH;
          }
          if (a.method === 'eth_getTransactionByHash') {
            const t = w.envoyees[w.envoyees.length - 1] || {};
            return { hash: HASH, blockHash: '0x' + '11'.repeat(32), blockNumber: '0x10',
                     transactionIndex: '0x0', from: moi, to: t.to || moi,
                     value: t.value || '0x0', gas: '0x5208', gasPrice: '0x3b9aca00',
                     nonce: '0x0', input: t.data || '0x',
                     r: '0x' + '11'.repeat(32), s: '0x' + '22'.repeat(32), v: '0x1b',
                     type: '0x0' };
          }
          if (a.method === 'eth_getTransactionReceipt') {
            const t = w.envoyees[w.envoyees.length - 1] || {};
            return { transactionHash: HASH, transactionIndex: '0x0',
                     blockHash: '0x' + '11'.repeat(32), blockNumber: '0x10',
                     from: moi, to: t.to || moi, contractAddress: null,
                     cumulativeGasUsed: '0x5208', gasUsed: '0x5208',
                     effectiveGasPrice: '0x3b9aca00', logs: [],
                     logsBloom: '0x' + '00'.repeat(512), status: '0x1', type: '0x0' };
          }
          if (a.method === 'eth_blockNumber') return '0x10';
          if (a.method === 'eth_getBlockByNumber')
            return { number: '0x10', hash: '0x' + '11'.repeat(32), parentHash: '0x' + '22'.repeat(32),
                     timestamp: '0x66000000', transactions: [], baseFeePerGas: '0x1', gasLimit: '0x1c9c380',
                     gasUsed: '0x0', miner: moi, difficulty: '0x0', extraData: '0x', nonce: '0x0',
                     sha3Uncles: '0x' + '00'.repeat(32), logsBloom: '0x' + '00'.repeat(256),
                     transactionsRoot: '0x' + '00'.repeat(32), stateRoot: '0x' + '00'.repeat(32),
                     receiptsRoot: '0x' + '00'.repeat(32), uncles: [], size: '0x0' };
          if (a.method === 'eth_getBalance') return '0x' + (0n).toString(16);
          return null;
        },
        on: () => {}, removeListener: () => {},
      };
    }, [MOI]);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    /* La Robinhood Chain */
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const un = (m) => {
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') return enMot(134102000n);
        if (m.method === 'eth_getBalance') return enMot(w.soldeRH);
        if (m.method === 'eth_call') return enMot(0n);
        return null;
      };
      const rep = (m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) });
      const corps = Array.isArray(q) ? q.map(rep) : rep(q);
      await r.fulfill({ contentType: 'application/json', body: JSON.stringify(corps) });
    });
    /* Ethereum */
    /* Sept chaines d origine desormais : le banc les joue toutes, sinon un
       repli partirait sur le vrai reseau et l ecran resterait sur « … ». */
    await page.route(/(ethereum-rpc|eth\.drpc|base-rpc|mainnet\.base|arbitrum-one-rpc|arb1\.arbitrum|optimism-rpc|mainnet\.optimism|bsc-rpc|polygon-bor-rpc|avalanche-c-chain-rpc)/, async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const u = r.request().url();
      const idc = /base-rpc|mainnet\.base/.test(u) ? 8453
                : /arbitrum-one-rpc|arb1\.arbitrum/.test(u) ? 42161
                : /optimism-rpc|mainnet\.optimism/.test(u) ? 10
                : /bsc-rpc/.test(u) ? 56
                : /polygon-bor-rpc/.test(u) ? 137
                : /avalanche-c-chain-rpc/.test(u) ? 43114 : 1;
      const un = (m) => {
        if (m.method === 'eth_chainId') return '0x' + idc.toString(16);
        if (m.method === 'net_version') return String(idc);
        if (m.method === 'eth_blockNumber') return '0x18ac99b';
        if (m.method === 'eth_getBalance') return w.soldeL1 === null ? null : enMot(w.soldeL1);
        if (m.method === 'eth_gasPrice') return enMot(120000000n);
        /* Le recu, sur la chaine de depart : sans lui, un envoi parti de Base
           n aboutit jamais ici et la page ne saurait pas quoi en dire. */
        if (m.method === 'eth_getTransactionReceipt')
          return { transactionHash: m.params[0], transactionIndex: '0x0',
                   blockHash: '0x' + '11'.repeat(32), blockNumber: '0x18ac99b',
                   from: MOI, to: MOI, contractAddress: null,
                   cumulativeGasUsed: '0x5208', gasUsed: '0x5208',
                   effectiveGasPrice: '0x3b9aca00', logs: [],
                   logsBloom: '0x' + '00'.repeat(256), status: '0x1', type: '0x0' };
        return null;
      };
      const rep = (m) => { const v = un(m);
        return v === null ? { jsonrpc: '2.0', id: m.id, error: { code: -32000, message: 'nope' } }
                          : { jsonrpc: '2.0', id: m.id, result: v }; };
      const corps = Array.isArray(q) ? q.map(rep) : rep(q);
      await r.fulfill({ contentType: 'application/json', body: JSON.stringify(corps) });
    });
    /* Le relayeur */
    await page.route('**/api.relay.link/**', async (r) => {
      const u = r.request().url();
      if (u.indexOf('/intents/status') >= 0)
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: w.statut }) });
      if (w.devisRefuse)
        return r.fulfill({ status: 400, contentType: 'application/json',
                           body: JSON.stringify({ message: 'No route for that amount.' }) });
      const c = JSON.parse(r.request().postData() || '{}');
      w.dernierDevis = { de: c.originChainId, vers: c.destinationChainId };
      const dedans = BigInt(c.amount);
      /* Les frais sont presque FIXES : c est ce qui fait qu un petit montant
         perd un gros pourcentage, et c est exactement la regle qu on veut
         mesurer plus bas. */
      const fixe = 30000000000000n;
      const sortie = dedans > fixe ? dedans - fixe : 1n;
      w.recu = sortie;
      const pc = -(100 * Number(fixe) / Number(dedans));
      await r.fulfill({ contentType: 'application/json', body: JSON.stringify({
        requestId: '0xfeed', protocol: 'relay',
        steps: [{ id: 'deposit', kind: 'transaction', items: [{
          data: { to: '0x4cd00e387622c35bddb9b4c962c136462338bc31',
                  value: c.amount, data: '0x49290c1c', chainId: c.originChainId },
          check: { endpoint: '/intents/status?requestId=0xfeed', method: 'GET' } }] }],
        fees: { gas: { amount: String(w.gaz) }, relayer: { amount: String(fixe) } },
        details: { timeEstimate: c.originChainId === 1 ? 2 : 8,
                   totalImpact: { percent: pc.toFixed(2) },
                   currencyIn:  { amount: c.amount, amountFormatted: '0' },
                   currencyOut: { amount: String(sortie),
                                  minimumAmount: String(sortie * 98n / 100n),
                                  amountFormatted: '0' } } }) });
    });

    const ouvrePont = async () => {
      await page.evaluate(() => document.querySelector('[data-va="ecPont"]').click());
      await page.waitForTimeout(700);
    };
    const lit = () => page.evaluate(() => {
      const piece = (id) => {
        const b = document.getElementById(id); if (!b) return {};
        const im = b.querySelector('img');
        return { sym: b.querySelector('b').textContent,
                 chaine: b.querySelector('small').textContent,
                 logo: im && !im.hidden ? im.getAttribute('src') : null,
                 charge: im ? im.naturalWidth > 0 : false };
      };
      return {
      ecran: (document.querySelector('.wl-ecran.on') || {}).id,
      pDe: piece('poDeJ'), pVers: piece('poVersJ'),
      de: document.getElementById('poDeT').textContent + ' ' + piece('poDeJ').chaine,
      vers: document.getElementById('poVersT').textContent + ' ' + piece('poVersJ').chaine,
      solde: document.getElementById('poSolde').textContent,
      recu: document.getElementById('poRecu').textContent,
      mini: document.getElementById('poMini').textContent,
      frais: document.getElementById('poFrais').textContent,
      gaz: document.getElementById('poGaz').textContent,
      temps: document.getElementById('poTemps').textContent,
      note: document.getElementById('poNote').textContent,
      montant: document.getElementById('poMontant').value,
      }; });
    const etatFaux = () => page.evaluate(() => window.__w);
    const etatRelais = async () => w.dernierDevis;
    /* Choisir une chaine a l un des deux bouts, comme le ferait un doigt. */
    const choisitPont = async (bout, nom) => {
      await page.evaluate((b) => document.getElementById(b === 'de' ? 'poDeJ' : 'poVersJ').click(), bout);
      await page.waitForTimeout(500);
      await page.evaluate((x) => {
        const b = [...document.querySelectorAll('#poChL button')]
          .find((e) => e.querySelector('b').textContent === x);
        if (b) b.click();
      }, nom);
      await page.waitForTimeout(700);
    };

    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);

    /* ---- IL EXISTE, ET IL S OUVRE ---- */
    const geste = await page.evaluate(() =>
      [...document.querySelectorAll('.wl-actions button')].map((b) => b.textContent.trim()));
    /* Le compte est ecrit dans la page, pas ici : la rangee en a gagne un
       cinquieme le jour ou Burn est arrive, et un nombre en dur aurait fait
       echouer un essai qui n avait rien vu de faux. Ce qui compte, c est que
       le geste du pont y soit. */
    ok(geste.some((t) => /Bridge/.test(t)),
       'le geste du pont est sur l accueil, parmi les ' + geste.length + ' (' + geste.join(', ') + ')');
    await ouvrePont();
    let m = await lit();
    ok(m.ecran === 'ecPont', 'et il ouvre bien l ecran du pont');
    ok(/Ethereum/i.test(m.de) && /Robinhood/i.test(m.vers),
       'par defaut on DEPOSE : d Ethereum vers la Robinhood Chain (' + m.de + ' -> ' + m.vers + ')');
    /* ---- ET LES DEUX PIECES SONT LA ----
     * On deplace de l argent entre deux chaines : voir les deux pieces l une
     * au-dessus de l autre dit d un coup d oeil dans quel sens on va, et le
     * sens est justement la seule chose qu on puisse confondre ici. */
    console.log('   les deux pieces : ' + JSON.stringify([m.pDe, m.pVers]));
    ok(m.pDe.charge && m.pVers.charge,
       'les deux pieces se dessinent vraiment sur l ecran du pont');
    ok(m.pDe.logo !== m.pVers.logo,
       'et ce sont DEUX pieces differentes (' + String(m.pDe.logo).split('/').pop()
       + ' / ' + String(m.pVers.logo).split('/').pop() + ')');
    ok(m.pDe.sym === 'ETH' && m.pVers.sym === 'ETH (RH)',
       'chacune nommee : ' + m.pDe.sym + ' -> ' + m.pVers.sym);
    ok(/0\.3/.test(m.solde), 'et le solde lu est celui d ETHEREUM, pas celui de l accueil (' + m.solde + ')');

    /* ---- ON PART DE LA OU L ON VOIT SON ETH ----
     *
     * « Un bouton bridge la ou tu as ton ETH. » Le geste de l accueil existait
     * deja, mais il demande de savoir qu il existe. La ligne de l ETH
     * d Ethereum, elle, est exactement l endroit ou l on constate qu on en a —
     * et la seule chose qu on puisse en faire ici, c est le faire passer. Elle
     * mene donc au pont, et elle l ECRIT, au lieu de mener a une fiche qui
     * n apprendrait rien. */
    /* ---- ET C EST DANS « TOKENS », PAS SUR L ACCUEIL ----
     * L accueil annonce la Robinhood Chain et un total qui ne compte qu elle.
     * Une ligne d une autre chaine posee dessous n entrait dans aucun des
     * deux : elle se lisait comme un solde d ici qui manquerait au total.
     * « affiche pas eth base sur la page home mais dans token ». */
    await page.evaluate(() => {
      const b = document.querySelector('#pied button[data-va="ecJetons"]'); if (b) b.click(); });
    await page.waitForTimeout(500);
    const ligne = await page.evaluate(() => {
      const r = [...document.querySelectorAll('#jtListe .wl-jeton')]
        .find((x) => x.querySelector('.nom b').textContent === 'ETH');
      if (!r) return null;
      const toutes = [...document.querySelectorAll('#jtListe .wl-jeton')].map((x) => ({
        sym: x.querySelector('.nom b').textContent,
        nom: x.querySelector('.nom small').textContent,
        pont: x.dataset.pont || null }));
      return { pont: r.dataset.pont, toutes: toutes,
               dit: (r.querySelector('.versPont') || {}).textContent || '' };
    });
    console.log('   la ligne de l ETH : ' + JSON.stringify(ligne));
    ok(!!ligne && ligne.pont === '1', 'la ligne de l ETH d Ethereum mene au pont');
    ok(!!ligne && /BRIDGE/.test(ligne.dit),
       'et elle le dit sur la ligne meme (« ' + (ligne || {}).dit + ' »)');
    /* ---- CETTE REGLE COMPTAIT LES LIGNES ; ELLE COMPTE MAINTENANT LEUR SENS ----
     * Elle disait « elle seule », parce qu une seule ligne vivait ailleurs.
     * Sept y vivent depuis que le pont s est ouvert, et un joueur en a fait
     * les frais : son ETH parti sur Base n avait plus de ligne du tout. Ce
     * qu il fallait garder du test, c est son motif — une ligne mene au pont
     * SI ET SEULEMENT SI elle vit sur une autre chaine ; celles d ici gardent
     * leur fiche, ou il y a un marche et un contrat a montrer. */
    const maison = (ligne || { toutes: [] }).toutes.filter((x) => /Robinhood Chain|Swole Doge|Swogebet/.test(x.nom));
    const dehors = (ligne || { toutes: [] }).toutes.filter((x) => !/Robinhood Chain|Swole Doge|Swogebet/.test(x.nom));
    ok(maison.length >= 3 && maison.every((x) => !x.pont),
       'les jetons de la chaine gardent leur fiche (' + maison.map((x) => x.sym).join(', ') + ')');
    ok(dehors.length >= 1 && dehors.every((x) => x.pont && x.pont !== '1' || x.pont === '1'),
       'et chaque ligne d ailleurs mene au pont (' + dehors.length + ')');
    /* Et elle y mene SUR SA CHAINE : sans cela, un appui sur la ligne de Base
       ouvrirait le pont sur Ethereum, et le joueur rechoisirait a la main. */
    ok(dehors.every((x) => /^\d+$/.test(String(x.pont))),
       'chacune portant l identifiant de SA chaine ('
       + dehors.map((x) => x.nom.replace(/^.* on /, '') + ':' + x.pont).join(', ') + ')');
    /* Et le tap y va VRAIMENT, dans le bon sens : deposer, pas retirer. */
    await page.evaluate(() => {
      const r = [...document.querySelectorAll('#jtListe .wl-jeton')]
        .find((x) => x.querySelector('.nom b').textContent === 'ETH');
      r.click();
    });
    await page.waitForTimeout(900);
    const arrive = await page.evaluate(() => ({
      ecran: (document.querySelector('.wl-ecran.on') || {}).id,
      sens: (document.querySelector('#poDeJ small') || {}).textContent + ' -> '
          + ((document.querySelector('#poVersJ small') || {}).textContent || ''),
      de: (document.querySelector('#poDeJ small') || {}).textContent || '' }));
    console.log('   apres le tap : ' + JSON.stringify(arrive));
    ok(arrive.ecran === 'ecPont', 'un tap dessus ouvre le pont (' + arrive.ecran + ')');
    ok(/^Ethereum -> Robinhood Chain$/.test(arrive.sens || ''),
       'et deja dans le bon sens : d Ethereum vers la Robinhood Chain ('
       + arrive.sens + ')');

    /* ---- ON CHOISIT LA CHAINE D OU L ON VIENT ----
     *
     * Cinquante-quatre des soixante-deux chaines du relayeur sont des chaines
     * EVM : notre chemin de signature les couvre deja. Ce qui se mesure ici
     * n est donc pas qu une liste existe — c est que le choix aille VRAIMENT
     * jusqu au devis et jusqu a la chaine sur laquelle on signe. Se tromper la
     * envoie de l argent au contrat du relayeur sur une chaine ou il n est
     * pas. */
    await page.evaluate(() => document.getElementById('poDeJ').click());
    /* On OUVRE, puis on mesure. Lire `naturalWidth` dans le meme souffle que
       le clic reviendrait a demander si une image est chargee avant que le
       navigateur ait eu le temps de la demander — l essai echouerait sur son
       propre empressement, pas sur un defaut. */
    await page.waitForTimeout(900);
    const chaines = await page.evaluate(() => ({
      ouvert: !document.getElementById('poVoile').hidden,
      liste: [...document.querySelectorAll('#poChL button')].map((b) => ({
        nom: b.querySelector('b').textContent,
        sym: b.querySelector('small').textContent,
        logo: b.querySelector('img').getAttribute('src'),
        charge: b.querySelector('img').naturalWidth > 0 })) }));
    console.log('   chaines : ' + JSON.stringify(chaines.liste.map((x) => x.nom + '/' + x.sym)));
    ok(chaines.ouvert, 'le bloc de la chaine s ouvre sur une liste');
    ok(chaines.liste.length >= 7,
       'qui propose les grandes chaines EVM (' + chaines.liste.length + ')');
    ok(chaines.liste.every((x) => x.charge),
       'chacune avec sa vignette, chargee — pas un carre vide');
    ok(chaines.liste.some((x) => x.sym === 'BNB') && chaines.liste.some((x) => x.sym === 'ETH'),
       'et chacune dit SA monnaie : toutes ne sont pas en ether ('
       + [...new Set(chaines.liste.map((x) => x.sym))].join(', ') + ')');
    /* Aucune ne doit etre la Robinhood Chain : c est l autre bout, toujours. */
    /* ---- LA REGLE A CHANGE : LES DEUX BOUTS SE CHOISISSENT ----
     * Elle disait « la Robinhood Chain n y figure pas — elle est l autre bout ».
     * C etait vrai quand un bouton imposait le sens. Depuis qu on choisit les
     * deux extremites, l exclure empecherait d inverser le pont. */
    ok(chaines.liste.some((x) => /Robinhood/.test(x.nom)),
       'la Robinhood Chain y figure aussi : les deux bouts se choisissent');

    /* ---- ET LE CHOIX VA JUSQU AU BOUT ---- */
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#poChL button')]
        .find((x) => x.querySelector('b').textContent === 'Base');
      b.click();
    });
    await page.waitForTimeout(900);
    await page.fill('#poMontant', '0.03');
    await page.waitForTimeout(1400);
    let mb = await lit();
    console.log('   sur Base : ' + JSON.stringify({ de: mb.pDe, devis: await page.evaluate(() => null) }));
    ok(mb.pDe.chaine === 'Base', 'le devis se fait depuis Base (' + mb.pDe.chaine + ')');
    ok(/base\.webp/.test(mb.pDe.logo || ''),
       'avec la vignette de Base (' + String(mb.pDe.logo).split('/').pop() + ')');
    const demande = await etatRelais();
    ok(demande && demande.de === 8453 && demande.vers === 4663,
       'et le relayeur a bien ete interroge de 8453 vers 4663 (' + JSON.stringify(demande) + ')');

    /* La signature doit partir de Base, pas d Ethereum. */
    await page.evaluate(() => { window.__w.bascules = []; window.__w.envoyees = []; });
    await page.click('#poPartir');
    await page.waitForTimeout(9000);
    const fb = await etatFaux();
    console.log('   signe depuis Base : ' + JSON.stringify({ bascules: fb.bascules,
                 chaine: (fb.envoyees[0] || {}).surLaChaine }));
    ok(fb.bascules.length === 1 && fb.bascules[0] === '0x2105',
       'le portefeuille bascule sur Base (0x2105) avant de signer ('
       + JSON.stringify(fb.bascules) + ')');
    ok(fb.envoyees.length === 1 && fb.envoyees[0].surLaChaine === '0x2105',
       'et la transaction part de Base (' + (fb.envoyees[0] || {}).surLaChaine + ')');

    /* On revient a Ethereum pour la suite des mesures. */
    await choisitPont('de', 'Ethereum');
    await page.fill('#poMontant', '');
    await page.waitForTimeout(600);

    /* ---- LE DEVIS ---- */
    await page.fill('#poMontant', '0.1');
    await page.waitForTimeout(1200);
    m = await lit();
    console.log('   depot : ' + JSON.stringify({ recu: m.recu, mini: m.mini, frais: m.frais, temps: m.temps }));
    ok(/^0\.09997/.test(m.recu), 'le montant recu vient du devis, au wei pres (' + m.recu + ')');
    ok(m.mini !== '—' && m.mini !== m.recu,
       'le MINIMUM garanti est ecrit a part (' + m.mini + ') — c est lui qui est promis');
    ok(m.frais !== '—' && m.gaz !== '—', 'les frais du relayeur et du reseau sont separes ('
       + m.frais + ' / ' + m.gaz + ')');
    ok(/s$|min$/.test(m.temps), 'et le temps annonce est la (' + m.temps + ')');

    /* ---- ON CHANGE DE SENS, EN CHOISISSANT LES DEUX BOUTS ----
     * Il y avait deux boutons, « Deposit » et « Withdraw ». Mais dans les deux
     * cas c est le meme geste : porter des fonds d une chaine a une autre. Le
     * sens ne merite pas un reglage a lui — il se DEDUIT de ce qu on choisit,
     * et choisir la Robinhood Chain a gauche suffit a inverser le pont. */
    await choisitPont('de', 'Robinhood Chain');
    await page.waitForTimeout(1200);
    m = await lit();
    ok(/Robinhood/i.test(m.de) && /Ethereum/i.test(m.vers),
       'le sens s inverse vraiment (' + m.de + ' -> ' + m.vers + ')');
    ok(m.pDe.sym === 'ETH (RH)' && m.pVers.sym === 'ETH',
       'et les deux pieces ont echange leur place (' + m.pDe.sym + ' -> ' + m.pVers.sym + ')');
    ok(/0\.04/.test(m.solde), 'et le solde affiche devient celui de la Robinhood Chain (' + m.solde + ')');

    /* ---- LA CHAINE SUR LAQUELLE ON SIGNE ----
     * Le retrait part de la Robinhood Chain : le portefeuille y est deja, il
     * ne doit basculer NULLE PART. Une bascule inutile vers Ethereum ferait
     * signer la transaction du relayeur sur la mauvaise chaine. */
    await page.fill('#poMontant', '0.01');
    await page.waitForTimeout(1200);
    /* Ardoise propre : le passage par Base, plus haut, a laisse sa bascule et
       sa transaction. Sans cette remise a zero, on mesurerait les siennes. */
    await page.evaluate(() => { window.__w.bascules = []; window.__w.envoyees = []; });
    await page.click('#poPartir');
    await page.waitForTimeout(6000);
    let f = await etatFaux();
    m = await lit();
    console.log('   retrait : ' + JSON.stringify({ bascules: f.bascules, envoyees: f.envoyees.length,
                 chaine: (f.envoyees[0] || {}).surLaChaine, note: m.note.slice(0, 60) }));
    ok(f.envoyees.length === 1, 'le retrait envoie UNE transaction (' + f.envoyees.length
       + (f.envoyees.length ? '' : ') — la page a dit : « ' + m.note.slice(0, 80) + ' »') + ')');
    ok(f.envoyees.length === 1 && f.envoyees[0].surLaChaine === '0x1237',
       'et elle est signee SUR LA ROBINHOOD CHAIN (' + (f.envoyees[0] || {}).surLaChaine + ')');
    /* ---- LA REGLE A CHANGE PARCE QUE LE PONT A PLUSIEURS ORIGINES ----
     * Elle disait « aucune bascule — on y etait deja ». C etait vrai quand le
     * portefeuille etait toujours sur la Robinhood Chain. Maintenant qu on
     * peut venir de Base, revenir EST necessaire, et l interdire ferait
     * signer le retrait sur Base — la ou le contrat du relayeur n existe pas.
     * Ce qu il fallait proteger n est donc pas l absence de bascule : c est
     * qu aucune bascule ne mene AILLEURS que sur la Robinhood Chain. */
    ok(f.bascules.every((x) => x === '0x1237'),
       'et si le portefeuille bascule, c est vers la Robinhood Chain et nulle part'
       + ' ailleurs (' + JSON.stringify(f.bascules) + ')');
    ok(((f.envoyees[0] || {}).to || '').toLowerCase() === '0x4cd00e387622c35bddb9b4c962c136462338bc31',
       'elle va au contrat que le devis a donne, pas a une adresse ecrite en dur');
    ok(/arrived on Ethereum/i.test(m.note), 'et la page ne dit « arrive » qu apres le relayeur : « '
       + m.note.slice(0, 70) + ' »');

    /* ---- LE DEPOT, LUI, DOIT BASCULER ---- */
    await page.evaluate(() => { window.__w.bascules = []; window.__w.envoyees = []; });
    await choisitPont('de', 'Ethereum');
    await page.waitForTimeout(600);
    await page.fill('#poMontant', '0.05');
    await page.waitForTimeout(1200);
    await page.click('#poPartir');
    await page.waitForTimeout(9000);
    f = await etatFaux();
    m = await lit();
    console.log('   depot signe : ' + JSON.stringify({ bascules: f.bascules,
                 chaine: (f.envoyees[0] || {}).surLaChaine, note: m.note.slice(0, 70) }));
    ok(f.bascules.length === 1 && f.bascules[0] === '0x1',
       'le depot bascule le portefeuille sur Ethereum AVANT de signer ('
       + JSON.stringify(f.bascules) + ')');
    ok(f.envoyees.length === 1 && f.envoyees[0].surLaChaine === '0x1',
       'et la transaction part bien depuis Ethereum (' + (f.envoyees[0] || {}).surLaChaine
       + (f.envoyees.length ? '' : ') — la page a dit : « ' + m.note.slice(0, 80) + ' »') + ')');

    /* ---- ET IL LAISSE UNE TRACE DANS L HISTORIQUE ----
     *
     * Un pont n emet AUCUN evenement lisible sur la chaine d arrivee : ce qui
     * arrive est de l ether natif, et l ether natif n emet rien. Sans une
     * inscription faite par la page, un transfert de plusieurs centaines de
     * dollars ne laisserait donc aucune trace dans « Activity ». On verifie
     * les DEUX sens, parce qu ils partent de deux chaines differentes. */
    await page.evaluate(() => {
      const b = document.querySelector('#pied button[data-va="ecActivite"]');
      if (b) b.click();
    });
    await page.waitForTimeout(2500);
    const trace = await page.evaluate(() => {
      const l = [...document.querySelectorAll('#acvCorps .wl-jeton')].map((r) => ({
        titre: r.querySelector('.nom b').textContent.trim(),
        sous: r.querySelector('.nom small').textContent.trim(),
        val: r.querySelector('.val b').textContent.trim(),
        piece: (r.querySelector('img') || {}).getAttribute
               ? r.querySelector('img').getAttribute('src') : null }));
      let brut = null;
      /* La cle du journal porte l'adresse : on la retrouve plutot que de la
         recopier — un nom recopie cesse d'etre vrai au premier changement. */
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (/^swogeTx:/.test(k)) { brut = JSON.parse(localStorage.getItem(k) || '[]'); break; }
        }
      } catch (e) {}
      return { lignes: l.filter((x) => /Bridge/i.test(x.titre)),
               journal: (brut || []).filter((x) => x.k === 'pont')
                 .map((x) => ({ sur: x.sur, de: x.deNom, vers: x.versNom })) };
    });
    console.log('   traces du pont : ' + JSON.stringify(trace));
    ok(trace.lignes.length === 3,
       'les TROIS passages du pont sont dans l historique — Ethereum, Base et le'
       + ' retour (' + trace.lignes.length + ')');
    ok(trace.lignes.some((x) => /Bridged to Robinhood Chain/.test(x.titre))
       && trace.lignes.some((x) => /Bridged to Ethereum/.test(x.titre)),
       'chacun dit vers OU il est alle (' + trace.lignes.map((x) => x.titre).join(' | ') + ')');
    /* Chaque ligne nomme SA chaine de depart — sous la forme « From X » une
       fois posee, « Waiting for X » tant qu elle ne l est pas. Les deux
       disent la meme chose, et c est cela qu on verifie : celle qui va vers
       la Robinhood Chain part d Ethereum, et reciproquement. */
    const versRH = trace.lignes.find((x) => /Bridged to Robinhood/.test(x.titre)) || {};
    const versL1 = trace.lignes.find((x) => /Bridged to Ethereum/.test(x.titre)) || {};
    ok(/Ethereum/.test(versRH.sous || '') && /Robinhood/.test(versL1.sous || ''),
       'et chacune dit d ou elle part (' + [versRH.sous, versL1.sous]
         .map((x) => String(x).slice(0, 42)).join(' | ') + ')');
    /* La piece aussi : celle de la chaine de DEPART, pas une au hasard. */
    /* La vignette est celle de la CHAINE de depart, pas celle d un jeton :
       depuis qu on peut venir de sept chaines, la liste des jetons n en
       connait plus qu une. */
    /* Elle vient desormais de la LISTE DES JETONS, qui connait les sept
       chaines : la trace d un depart d Ethereum porte exactement la piece que
       « My tokens » montre pour ce meme solde. Deux ecrans qui montrent le
       meme avoir avec deux dessins differents, c est un doute de plus au
       moment ou l on cherche justement a se rassurer. */
    ok(/tok_eth_l1\.webp/.test(versRH.piece || '') && /tok_eth\.webp/.test(versL1.piece || ''),
       'avec la vignette de la chaine de depart ('
       + [versRH.piece, versL1.piece].map((x) => String(x).split('/').pop()).join(' | ') + ')');
    const depuisBase = trace.lignes.find((x) => /From Base|Waiting for Base/.test(x.sous));
    ok(!!depuisBase && /ch\/base/.test(depuisBase.piece || ''),
       'et celui parti de Base porte la sienne ('
       + String((depuisBase || {}).piece).split('/').pop() + ')');
    ok(/^−/.test(versRH.val || '') && /^−/.test(versL1.val || ''),
       'et le montant compte comme un depart (' + versRH.val + ' | ' + versL1.val + ')');
    /* ---- ET SUR QUELLE CHAINE LA TRANSACTION A ETE SIGNEE ----
     * Sans cela, le depot serait attendu sur la Robinhood Chain alors qu il
     * est mine sur Ethereum : il resterait « en attente » pour toujours, et le
     * bandeau d accueil annoncerait une transaction en vol deja arrivee. */
    ok(trace.journal.length === 3
       && trace.journal.some((x) => x.sur === 1) && trace.journal.some((x) => x.sur === 4663)
       && trace.journal.some((x) => x.sur === 8453),
       'et chaque trace retient SA chaine de depart, pour etre attendue au bon'
       + ' endroit (' + JSON.stringify(trace.journal.map((x) => x.sur)) + ')');
    await page.evaluate(() => {
      const b = document.querySelector('#pied button[data-va="ecAccueil"]');
      if (b) b.click();
    });
    await page.waitForTimeout(400);
    await ouvrePont();

    /* ---- UN RELAYEUR QUI N A PAS ENCORE PAYE NE DIT PAS « ARRIVE » ----
     * C est le defaut le plus couteux possible ici : annoncer l argent arrive
     * alors qu il ne l est pas. La transaction de depart peut etre minee sans
     * que l autre cote soit servi. */
    w.statut = 'pending';
    await page.evaluate(() => { window.__w.bascules = []; window.__w.envoyees = []; });
    await page.fill('#poMontant', '0.02');
    await page.waitForTimeout(1200);
    await page.click('#poPartir');
    await page.waitForTimeout(9000);
    m = await lit();
    console.log('   en attente : « ' + m.note.slice(0, 90) + ' »');
    ok(!/arrived/i.test(m.note),
       'tant que le relayeur n a pas paye, la page ne dit PAS que c est arrive');
    ok(/not lost|not yet|relayer/i.test(m.note),
       'elle dit ou en est la transaction : « ' + m.note.slice(0, 80) + ' »');
    w.statut = 'success';
    /* Le sondage du transfert precedent tourne encore et reecrit la note
       toutes les deux secondes et demie : il ecraserait les messages qu'on
       veut lire ensuite. On repart d'une page neuve. */
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    await ouvrePont();

    /* ---- UN DEVIS QUI ECHOUE N AFFICHE JAMAIS ZERO ---- */
    w.devisRefuse = true;
    await page.fill('#poMontant', '');
    await page.waitForTimeout(600);
    await page.fill('#poMontant', '0.07');
    await page.waitForTimeout(1500);
    m = await lit();
    console.log('   devis refuse : ' + JSON.stringify({ recu: m.recu, note: m.note.slice(0, 60) }));
    ok(m.recu !== '0' && !/^0(\.0+)?\s/.test(m.recu),
       'un devis refuse n ecrit jamais zero (« ' + m.recu + ' »)');
    ok(m.note.length > 10, 'et il DIT pourquoi : « ' + m.note.slice(0, 70) + ' »');
    w.devisRefuse = false;

    /* ---- UN PETIT MONTANT EST PREVENU ----
     * Les frais sont presque fixes : ils pesent donc enormement sur un petit
     * montant. Mesure sur le vrai pont : -0,32 % sur 0,005 ETH mais -15,58 %
     * sur 0,0001. Ne rien dire, c est laisser le joueur payer 15 % sans le
     * savoir. */
    await page.fill('#poMontant', '0.00005');
    await page.waitForTimeout(1500);
    m = await lit();
    const ouvert = await page.evaluate(() => !document.getElementById('poPlus').hidden);
    console.log('   petit montant : ' + JSON.stringify({ note: m.note.slice(0, 60), ouvert }));
    ok(/loses|%/.test(m.note), 'un montant trop petit est PREVENU : « ' + m.note.slice(0, 80) + ' »');
    ok(ouvert, 'et le detail s ouvre tout seul, pour qu on voie le chiffre qui le justifie');

    /* ---- MAX GARDE DE QUOI PAYER LE RESEAU ---- */
    await page.click('#poMax');
    await page.waitForTimeout(2500);
    m = await lit();
    console.log('   max : ' + JSON.stringify({ montant: m.montant, note: m.note.slice(0, 60) }));
    const ecrit = m.montant ? BigInt(Math.round(parseFloat(m.montant) * 1e6)) : 0n;
    ok(ecrit > 0n && ecrit < 300000n,
       'MAX ecrit moins que le solde entier : il garde le frais de reseau (' + m.montant + ')');
    ok(/Kept .* back for the network fee/.test(m.note),
       'et il le DIT : « ' + m.note.slice(0, 70) + ' »');

    /* ---- ET IL N EFFACE PAS L AVERTISSEMENT ----
     * Vu en vrai, sur une capture : solde 0,0008 ETH, MAX en propose 0,000787
     * pour en recevoir 0,000771 — DEUX POUR CENT perdus. Le devis avait bien
     * pose l avertissement, et la phrase sur le frais de reseau l a recouvert.
     * Des deux messages, c est l avertissement qui compte : il dit qu on perd
     * de l argent, l autre dit qu on nous en a garde. */
    w.soldeL1 = 2000000000000000n;              // 0,002 ETH : le frais fixe y pese 1,5 %
    await page.click('#poMax');
    await page.waitForTimeout(3500);
    m = await lit();
    console.log('   max sur petit solde : « ' + m.note.slice(0, 120) + ' »');
    ok(/loses [\d.]+ %/.test(m.note),
       'sur un petit solde, MAX laisse l avertissement en place');
    ok(/Kept .* back for the network fee/.test(m.note),
       'et ajoute le sien dessous, au lieu de le remplacer');

    /* ---- UN SOLDE NON LU NE REMPLIT RIEN ---- */
    w.soldeL1 = null;
    await choisitPont('de', 'Robinhood Chain');
    await page.waitForTimeout(400);
    await choisitPont('de', 'Ethereum');
    await page.waitForTimeout(4000);
    m = await lit();
    ok(/unknown/i.test(m.solde), 'un solde que la chaine n a pas rendu s ecrit « inconnu » ('
       + m.solde + ')');
    await page.fill('#poMontant', '');
    await page.click('#poMax');
    await page.waitForTimeout(4000);
    m = await lit();
    ok(!m.montant, 'et MAX ne remplit rien dessus (« ' + m.montant + ' »)');
    ok(/unknown, not zero/i.test(m.note), 'en disant que c est inconnu, pas nul : « '
       + m.note.slice(0, 70) + ' »');

    /* ==================== CE QUI EST PARTI PAR LE PONT SE RETROUVE ====================
     *
     * Le defaut, mot pour mot : « j ai swap eth rh en base sa a fonctionner
     * mais j arrive pas a reconvertir mes base en eth ou eth rh via bridge et
     * je vois pas mapparaitre mes base dans my token j aimerai les envoyer
     * sur une autre addresse mais quand je fais envoyer je les vois pas non
     * plus ».
     *
     * Trois portes fermees d un coup sur de l argent qui existait bel et bien
     * sur la chaine. Le pont savait l envoyer et rien ne savait le ramener :
     * c est le pire defaut qu un portefeuille puisse avoir, et il etait de
     * notre fait. Les trois portes sont mesurees ici, une par une.
     */
    console.log('\n   -- ce qui est parti sur Base se retrouve --');
    /* Le code de la page vit dans sa propre portee : `rafraichit()` n est pas
       joignable depuis ici, et l appeler ne faisait RIEN — en silence. On
       passe par le bouton, comme un joueur. */
    const relit = async () => {
      await page.evaluate(() => document.querySelector('[data-va="ecAccueil"]').click());
      await page.waitForTimeout(200);
      await page.click('#btRafraichir');
    };
    w.soldeL1 = 300000000000000000n;            // 0,3 ETH sur chaque chaine du banc
    await page.evaluate(() => document.querySelector('[data-va="ecAccueil"]').click());
    await page.waitForTimeout(300);
    await relit();
    await page.waitForTimeout(4000);

    /* ---- PORTE 1 : LA LIGNE EXISTE DANS « MY TOKENS » ---- */
    const listeJetons = () => page.evaluate(() =>
      [...document.querySelectorAll('#jtListe .wl-jeton')].map((b) => ({
        cle: b.dataset.jeton, pont: b.dataset.pont || null,
        sym: b.querySelector('.nom b').textContent,
        nom: b.querySelector('.nom small').textContent,
        val: b.querySelector('.val b').textContent })));
    let lj = await listeJetons();
    console.log('   my tokens : ' + JSON.stringify(lj.map((x) => x.sym + ' ' + x.val)));
    const base = lj.filter((x) => /Base/.test(x.nom))[0];
    ok(!!base, 'l ETH detenu sur Base a SA ligne dans My Tokens');
    ok(!!base && /0\.3/.test(base.val),
       'et elle porte le solde lu sur Base, pas celui d ici (' + (base || {}).val + ')');
    ok(!!base && base.pont === '8453',
       'un appui dessus ouvre le pont SUR BASE, pas sur la derniere chaine choisie ('
       + (base || {}).pont + ')');
    /* Deux lignes s appellent « ETH ». Ce qui les separe, c est le nom de la
       chaine — sans lui, un joueur enverrait de l un en croyant tenir l autre. */
    const ethiques = lj.filter((x) => x.sym === 'ETH');
    ok(ethiques.length >= 2 && new Set(ethiques.map((x) => x.nom)).size === ethiques.length,
       'chaque « ETH » dit SUR QUELLE CHAINE il se trouve ('
       + ethiques.map((x) => x.nom).join(' / ') + ')');

    /* ---- ET L ACCUEIL, LUI, RESTE CELUI D UNE SEULE CHAINE ----
     * « affiche pas eth base sur la page home mais dans token ». Il annonce
     * la Robinhood Chain et un total qui ne compte qu elle : une ligne d une
     * autre chaine posee dessous n entre dans aucun des deux, et se lit comme
     * un solde d ici qui manquerait au total. */
    await page.evaluate(() => {
      const b = document.querySelector('#pied button[data-va="ecAccueil"]'); if (b) b.click(); });
    await page.waitForTimeout(300);
    const surAccueil = await page.evaluate(() =>
      [...document.querySelectorAll('#acJetons .wl-jeton')].map((b) => ({
        sym: b.querySelector('.nom b').textContent,
        nom: b.querySelector('.nom small').textContent })));
    console.log('   accueil : ' + JSON.stringify(surAccueil.map((x) => x.nom)));
    ok(!surAccueil.some((x) => /on (Ethereum|Base|Arbitrum|Optimism|BNB|Polygon|Avalanche)/.test(x.nom)),
       'l accueil ne montre AUCUNE ligne d une autre chaine ('
       + surAccueil.map((x) => x.sym).join(', ') + ')');
    ok(surAccueil.length >= 3 && surAccueil.some((x) => /Robinhood Chain/.test(x.nom)),
       'mais bien celles d ici (' + surAccueil.length + ' lignes)');
    /* Et l ecran Tokens, lui, les a : sinon la ligne n aurait pas ete deplacee,
       elle aurait ete perdue — le defaut d origine, une seconde fois. */
    const surTokens = (await listeJetons()).map((x) => x.nom);
    ok(surTokens.some((x) => /on Base/.test(x)),
       'et « Tokens » les garde toutes (' + surTokens.length + ' lignes)');
    ok(surTokens.length > surAccueil.length,
       'la liste de Tokens est la plus longue des deux ('
       + surTokens.length + ' contre ' + surAccueil.length + ')');

    /* ---- ET UNE CHAINE VIDE NE TIENT PAS UNE LIGNE VIDE ----
     * L inverse du defaut, et il compte autant : sept chaines a zero
     * noieraient les trois jetons de la maison. Cachees, mais DITES. */
    w.soldeL1 = 0n;
    await relit();
    await page.waitForTimeout(4000);
    lj = await listeJetons();
    const note = await page.evaluate(() => document.getElementById('jtNote').textContent);
    console.log('   a zero partout : ' + JSON.stringify(lj.map((x) => x.sym)) + ' / ' + note.slice(0, 80));
    ok(!lj.some((x) => /on (Base|Arbitrum|Optimism|BNB|Polygon|Avalanche)/.test(x.nom)),
       'une chaine ou l on ne detient rien ne tient pas de ligne');
    ok(/read as zero/i.test(note),
       'mais la page le DIT — une ligne qui manque sans explication se lit comme une perte : « '
       + note.slice(0, 90) + ' »');

    /* ---- ET UNE LECTURE RATEE NE FAIT DISPARAITRE PERSONNE ----
     * C est la meme discipline que partout ailleurs : `null` veut dire « la
     * chaine n a pas repondu », jamais « zero ». Cacher la-dessus ferait
     * disparaitre l argent du joueur le temps d une panne de reseau. */
    w.soldeL1 = null;
    await relit();
    await page.waitForTimeout(6000);
    lj = await listeJetons();
    const muettes = lj.filter((x) => /on (Base|Arbitrum|Optimism)/.test(x.nom));
    console.log('   chaines muettes : ' + JSON.stringify(muettes.map((x) => x.nom + ' ' + x.val)));
    ok(muettes.length >= 1,
       'une chaine qui n a pas repondu garde sa ligne (' + muettes.length + ')');
    ok(muettes.every((x) => /unknown/i.test(x.val)),
       'et elle dit « inconnu », jamais « 0 » ('
       + muettes.map((x) => x.val).join(', ') + ')');

    /* ---- PORTE 2 : ON PEUT L ENVOYER AILLEURS ----
     * « j aimerai les envoyer sur une autre addresse mais quand je fais
     * envoyer je les vois pas non plus. » */
    w.soldeL1 = 300000000000000000n;
    await relit();
    await page.waitForTimeout(4000);
    await page.evaluate(() => document.querySelector('[data-va="ecEnvoyer"]').click());
    await page.waitForTimeout(400);
    const dansEnvoi = await page.evaluate(() =>
      [...document.querySelectorAll('#enJeton option')].map((o) => o.value));
    ok(dansEnvoi.indexOf('ch8453') >= 0,
       'l ETH de Base est proposé dans l ecran Send (' + dansEnvoi.join(', ') + ')');

    await page.evaluate(() => { window.__w.bascules = []; window.__w.envoyees = []; });
    await page.evaluate(() => {
      const s = document.getElementById('enJeton');
      s.value = 'ch8453'; s.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(1200);
    const ecranEnvoi = await page.evaluate(() => ({
      reseau: (document.getElementById('enReseau') || {}).textContent,
      solde: (document.getElementById('enSolde') || {}).textContent,
      frais: (document.getElementById('enFrais') || {}).textContent }));
    console.log('   envoi depuis Base : ' + JSON.stringify(ecranEnvoi));
    ok(/Base/.test(ecranEnvoi.reseau),
       'l ecran d envoi annonce BASE, pas « Robinhood Chain » ecrit en dur ('
       + ecranEnvoi.reseau + ')');
    ok(/0\.3/.test(ecranEnvoi.solde),
       'et le solde qu il montre est celui de Base (' + ecranEnvoi.solde + ')');

    await page.fill('#enDest', '0x000000000000000000000000000000000000dEaD');
    await page.fill('#enMontant', '0.01');
    await page.click('#enPartir');
    await page.waitForTimeout(600);
    /* La revue s ouvre : elle doit dire la meme chaine que l ecran d avant. */
    const revue = await page.evaluate(() => ({
      ouverte: !document.getElementById('voileRevue').hidden,
      reseau: (document.getElementById('rvReseau') || {}).textContent }));
    ok(revue.ouverte && /Base/.test(revue.reseau),
       'la revue avant signature annonce Base elle aussi (' + revue.reseau + ')');
    /* La revue peut etre coupee dans les reglages : on ne la force pas, on
       signe par le chemin que la page a ouvert. */
    if (revue.ouverte) await page.click('#rvOk');
    await page.waitForTimeout(3000);
    const fenv = await page.evaluate(() => ({
      bascules: window.__w.bascules, envoyees: window.__w.envoyees,
      note: document.getElementById('enNote').textContent,
      lien: (document.querySelector('#enNote a') || {}).href || '' }));
    console.log('   signature : ' + JSON.stringify({ bascules: fenv.bascules,
      envoyees: fenv.envoyees.length, note: fenv.note.slice(0, 60) }));
    /* ---- C EST LA MESURE QUI COMPTE LE PLUS ----
     * Signer un envoi d ETH de Base pendant que le portefeuille est reste sur
     * la Robinhood Chain enverrait la transaction SUR LA MAUVAISE CHAINE —
     * au mieux elle echoue, au pire elle depense un solde qu on ne voulait
     * pas toucher. 0x2105 = 8453. */
    ok(fenv.bascules.length === 1 && fenv.bascules[0] === '0x2105',
       'le portefeuille bascule SUR BASE avant de signer ('
       + JSON.stringify(fenv.bascules) + ')');
    ok(fenv.envoyees.length === 1 && fenv.envoyees[0].surLaChaine === '0x2105',
       'et la transaction part bien de la (' + JSON.stringify(
         fenv.envoyees.map((x) => x.surLaChaine)) + ')');
    ok(/basescan/i.test(fenv.lien),
       'le lien « View transaction » mene a l explorateur de Base, pas a celui d ici ('
       + (fenv.lien || 'aucun') + ')');

    /* ---- PORTE 3 : ET LE PONT SAIT REVENIR DE BASE ----
     * Elle est deja mesuree plus haut (« signe depuis Base »), mais elle ne
     * tenait qu a une chose que ce banc ne peut pas voir : le paquet Privy
     * doit DECLARER Base, sinon le portefeuille par courriel repond
     * « UnsupportedChainId » et l argent reste ou il est. C est
     * `privy_paquet.test.js` qui garde cette moitie-la. */

    ok(boum.length === 0, 'aucune exception pendant tout le pont'
       + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==================== L ADRESSE SOLANA ====================
   *
   * Privy ne peut pas tourner ici : il lui faut ses serveurs et une vraie
   * connexion. On joue donc SON ENVELOPPE — la surface exacte que la page
   * appelle — et l on mesure ce que la page en FAIT. Ce n est pas Privy qu on
   * verifie, c est nous.
   *
   * Ce qui compte le plus n est pas que l adresse s affiche : c est qu on ne
   * puisse pas la confondre avec l adresse EVM, et que la page ne promette
   * pas un envoi qu elle ne sait pas faire.
   */
  console.log('\n-- l adresse solana --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const SOL = 'So1anaAddre55Exemp1eXXXXXXXXXXXXXXXXXXXXXXX';
    const page = await nav.newPage({ viewport: { width: 390, height: 900 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 180)));
    await page.addInitScript(([moi, sol]) => {
      try { localStorage.setItem('swogeAuth', 'email');
            sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {}
      /* L enveloppe de Privy, jouee : meme surface, reponses connues. */
      let solanas = [];
      window.__sol = { creations: 0 };
      window.SwogePrivy = {
        init: () => {}, sendCode: async () => {}, verifyCode: async () => moi,
        logout: async () => {}, restore: async () => moi,
        getProvider: () => window.ethereum, getAddress: () => moi, isLoggedIn: () => true,
        comptes: () => [{ adresse: moi, index: 0 }],
        choisitCompte: async () => moi, ajouteCompte: async () => moi, indexCompte: () => 0,
        solana: () => solanas,
        creeSolana: async () => { window.__sol.creations++; solanas = [{ adresse: sol, index: 0 }]; return sol; },
      };
      window.ethereum = {
        isMetaMask: true,
        request: async (a) => {
          if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
          if (a.method === 'eth_chainId') return '0x1237';
          if (a.method === 'net_version') return '4663';
          return null;
        }, on: () => {}, removeListener: () => {},
      };
    }, [MOI, SOL]);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/privy-swoge.js*', (r) => r.fulfill({
      contentType: 'text/javascript', body: '/* joue par l essai */' }));
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    await page.route(/rpc\.mainnet\.chain\.robinhood\.com|ethereum-rpc|eth\.drpc/, (r) => r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x' + (0).toString(16).padStart(64, '0') }) }));
    let solLu = 0;
    await page.route('**/solana-rpc.publicnode.com/**', (r) => {
      solLu++;
      return r.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: 1234500000 } }) });
    });

    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    const versCompte = async () => {
      await page.evaluate(() => {
        const b = document.querySelector('#pied button[data-va="ecCompte"]');
        if (b) b.click();
      });
      await page.waitForTimeout(700);
    };
    const lit = () => page.evaluate(() => {
      const vu = (id) => { const e = document.getElementById(id);
        return e ? !e.hidden && e.getBoundingClientRect().height > 0 : false; };
      const tx = (id) => (document.getElementById(id) || {}).textContent || '';
      return { titre: vu('cpTitreSol'), carte: vu('cpSolCarte'),
               creer: vu('cpSolCreer'), copier: vu('cpSolCopie'),
               adr: tx('cpSolAdr'), solde: tx('cpSolSolde'),
               note: tx('cpSolNote'), evm: tx('cpAdr'),
               creations: 0 };
    });
    await versCompte();
    let m = await lit();
    console.log('   avant creation : ' + JSON.stringify({ creer: m.creer, carte: m.carte, note: m.note.slice(0, 60) }));
    ok(m.titre && m.creer && !m.carte,
       'sans adresse Solana, la page propose de la creer et ne montre pas de carte vide');
    ok(/same seed|Solana/i.test(m.note), 'et elle explique de quoi il s agit');

    /* ---- ON LA CREE ---- */
    await page.click('#cpSolCreer');
    await page.waitForTimeout(2000);
    m = await lit();
    const n = await page.evaluate(() => window.__sol.creations);
    console.log('   apres creation : ' + JSON.stringify({ adr: m.adr, solde: m.solde, creations: n }));
    ok(n === 1, 'un appui cree l adresse UNE fois (' + n + ')');
    ok(m.carte && !m.creer, 'la carte remplace le bouton');
    ok(m.adr !== '—' && m.adr.length > 4, 'et l adresse s affiche (' + m.adr + ')');

    /* ---- ELLE NE RESSEMBLE PAS A L ADRESSE EVM ----
     * C est la mesure qui compte le plus : deux adresses du meme compte, sur
     * deux courbes. Les confondre enverrait des fonds nulle part. */
    ok(!/^0x/i.test(m.adr) && m.adr !== m.evm,
       'elle ne commence pas par 0x et differe de l adresse EVM ('
       + m.adr + ' contre ' + m.evm + ')');

    /* ---- LE SOLDE EST LU, ET DANS LA BONNE UNITE ----
     * Un lamport vaut un milliardieme de SOL : se tromper d un facteur mille
     * afficherait un solde faux sans que rien ne le signale. */
    ok(solLu > 0, 'le solde est vraiment demande a la chaine Solana (' + solLu + ' lecture)');
    ok(/^1\.2345\s*SOL$/.test(m.solde.trim()),
       '1 234 500 000 lamports s ecrivent 1,2345 SOL (« ' + m.solde.trim() + ' »)');

    /* ---- ET LA PAGE NE PROMET PAS CE QU ELLE NE SAIT PAS FAIRE ---- */
    ok(/does not send or bridge/i.test(m.note),
       'elle dit qu elle ne sait pas encore envoyer depuis Solana : « '
       + m.note.slice(-90) + ' »');

    /* ---- L ADRESSE EST ECRITE EN ENTIER ----
     * Une adresse abregee ne designe AUCUN compte. Tant que le bouton copie
     * marche on ne s en apercoit pas ; le jour ou il ne marche pas, c est la
     * seule chose qui reste au joueur. Elle doit donc etre entiere et
     * selectionnable d un seul geste. */
    ok(m.adr.trim() === SOL,
       'l adresse affichee est l adresse ENTIERE, pas une version abregee ('
       + m.adr.trim() + ')');
    const choix = await page.evaluate(() => {
      const e = document.getElementById('cpSolAdr'); const g = getComputedStyle(e);
      return { sel: g.userSelect || g.webkitUserSelect, large: e.getBoundingClientRect().width };
    });
    ok(choix.sel === 'all',
       'et un seul appui la selectionne en entier (user-select: ' + choix.sel + ')');

    /* ---- LA COPIE, QUAND LE PRESSE-PAPIER EXISTE ---- */
    const capte = () => page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
    await page.evaluate(() => {
      window.__cp = { moderne: null, vieux: null, rendu: true };
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async (t) => { window.__cp.moderne = t; } } });
    });
    await page.click('#cpSolCopie');
    await page.waitForTimeout(300);
    let c = await page.evaluate(() => window.__cp);
    ok(c.moderne === SOL, 'le bouton copie l adresse ENTIERE (' + c.moderne + ')');
    ok(/copied/i.test(await capte()), 'et le dit');

    /* ---- LA COPIE QUAND LE PRESSE-PAPIER N EXISTE PAS ----
     * C est le cas de la webview de Telegram : `navigator.clipboard` est
     * ABSENT, donc l ancien code levait AVANT de rendre une promesse et le
     * `.catch()` ne voyait jamais rien — le bouton se taisait, et le joueur
     * n avait aucun moyen d obtenir son adresse. */
    await page.evaluate(() => {
      window.__cp = { moderne: null, vieux: null, rendu: true };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      document.execCommand = function () {
        const z = document.activeElement;
        window.__cp.vieux = z && z.tagName === 'TEXTAREA' ? z.value : null;
        return window.__cp.rendu;
      };
    });
    await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
    await page.click('#cpSolCopie');
    await page.waitForTimeout(300);
    c = await page.evaluate(() => window.__cp);
    ok(c.vieux === SOL,
       'sans navigator.clipboard, le repli copie quand meme l adresse entiere ('
       + c.vieux + ')');
    ok(/copied/i.test(await capte()), 'et le dit');
    ok((await page.evaluate(() => document.querySelectorAll('textarea').length)) === 0,
       'le champ pose pour la copie est retire ensuite');

    /* ---- ET SI LES DEUX ECHOUENT, ELLE NE MENT PAS ----
     * Dire « copie » sans l avoir fait ferait coller l adresse d avant :
     * dans le meilleur des cas rien, dans le pire les fonds d un autre. */
    await page.evaluate(() => {
      window.__cp.rendu = false;
      document.getElementById('toast').textContent = '';
    });
    await page.click('#cpSolCopie');
    await page.waitForTimeout(300);
    const dit = await capte();
    ok(/could not copy/i.test(dit) && !/^Solana address copied/.test(dit),
       'copie impossible : la page le DIT au lieu de pretendre le contraire (« '
       + dit + ' »)');
    ok(/tap the address|select/i.test(dit), 'et elle dit quoi faire a la place');

    /* Le presse-papier est rendu a la page pour la suite. */
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async () => {} } });
    });

    /* ---- ET ELLE A SA LIGNE DANS « TOKENS », MEME A ZERO ----
     *
     * « solana affiche le aussi meme si tu en as 0 pour le moment. »
     * C est une exception assumee a la regle qui cache les lignes vides :
     * celle-la sert a se debarrasser de jetons qu on n a pas demandes, alors
     * qu une adresse Solana, on l a creee expres. La cacher parce qu elle est
     * vide ferait douter de son existence le jour ou l on veut justement s en
     * servir pour RECEVOIR. */
    await page.evaluate(() => {
      const b = document.querySelector('#pied button[data-va="ecJetons"]'); if (b) b.click(); });
    await page.waitForTimeout(700);
    const ligneSol = await page.evaluate(() => {
      const b = document.querySelector('#jtListe [data-sol]');
      if (!b) return null;
      const im = b.querySelector('img');
      return { sym: b.querySelector('.nom b').textContent,
               nom: b.querySelector('.nom small').textContent,
               val: b.querySelector('.val b').textContent,
               logo: im ? im.getAttribute('src') : null,
               charge: im ? im.naturalWidth > 0 : false,
               surAccueil: !!document.querySelector('#acJetons [data-sol]') };
    });
    console.log('   la ligne SOL : ' + JSON.stringify(ligneSol));
    ok(!!ligneSol, 'l adresse Solana a sa ligne dans « Tokens »');
    ok(!!ligneSol && /^1\.2345$/.test(ligneSol.val),
       'avec le solde lu sur la chaine Solana (' + (ligneSol || {}).val + ')');
    ok(!!ligneSol && ligneSol.charge,
       'et sa piece a elle, chargee (' + String((ligneSol || {}).logo).split('/').pop() + ')');
    ok(!!ligneSol && !ligneSol.surAccueil,
       'mais pas sur l accueil : le SOL n est meme pas sur une chaine EVM');

    /* Elle mene au compte : c est la que vivent l adresse entiere et le
       bouton qui la copie. Elle n a pas de fiche a elle — ni marche, ni
       contrat a montrer ici. */
    await page.evaluate(() => document.querySelector('#jtListe [data-sol]').click());
    await page.waitForTimeout(500);
    const apresSol = await page.evaluate(() => (document.querySelector('.wl-ecran.on') || {}).id);
    ok(apresSol === 'ecCompte',
       'et un appui dessus mene au compte, ou vit l adresse (' + apresSol + ')');

    /* ---- UN SOLDE A ZERO NE LA FAIT PAS DISPARAITRE ---- */
    await page.route('**/solana-rpc.publicnode.com/**', (r) => r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: 0 } }) }));
    await page.evaluate(() => {
      const b = document.querySelector('#pied button[data-va="ecCompte"]'); if (b) b.click(); });
    await page.waitForTimeout(400);
    /* On force une relecture en changeant d adresse connue : le garde interne
       n en lance qu une par adresse, et c est voulu. */
    await page.evaluate(() => {
      const b = document.querySelector('#pied button[data-va="ecAccueil"]'); if (b) b.click(); });
    await page.waitForTimeout(300);
    await page.click('#btRafraichir');
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const b = document.querySelector('#pied button[data-va="ecJetons"]'); if (b) b.click(); });
    await page.waitForTimeout(500);
    const aZero = await page.evaluate(() => {
      const b = document.querySelector('#jtListe [data-sol]');
      return b ? b.querySelector('.val b').textContent : null;
    });
    ok(aZero !== null, 'la ligne SOL reste la meme quand le solde est nul ('
       + aZero + ')');

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ---- LE FOND D ECRAN ----
   * Il passe DERRIERE les cartes. Pose par-dessus il etait magnifique et il
   * voilait le texte : « TOTAL BALANCE » se lisait a travers une nappe bleue.
   * Un decor qui rend un solde moins lisible n est pas un decor. */
  /* ==================== UNE SEULE SORTIE, ET ELLE EST SOUS LE POUCE ====================
   *
   * Chaque ecran portait une sortie en haut — une croix ou une fleche vers
   * l accueil — alors que la barre d onglets du bas sort deja de n importe
   * lequel. Deux sorties pour un meme ecran, c est une de trop : celle du haut
   * demandait au pouce de traverser le telephone pour faire ce que celle du
   * bas fait sous lui, et elle prenait la place du titre. Elles sont retirees.
   *
   * Ce qui se mesure ici n est pas leur absence — ca, ce serait une regle qui
   * se contente d elle-meme. C est que rien n ENFERME : sur les dix ecrans, la
   * barre du bas doit etre a l ecran, et un appui dessus doit vraiment
   * changer d ecran. Une sortie retiree sans que l autre soit prouvee, c est
   * un joueur coince dans le pont avec son argent.
   */
  /* ==================== LE MONTANT SE VOIT PENDANT QU'ON LE TAPE ====================
   *
   * Trois defauts signales ensemble, tous du meme ressort — le champ ne
   * disait rien tant qu on n avait pas fini :
   *
   *   « faudrait que ça affiche en rouge dès qu'on dépasse le montant qu'on
   *     possède car parfois il y a beaucoup de 0, compliqué de choisir »
   *   « ça serait bien d'avoir une barre slide pour définir combien de pour
   *     cent on achète ou vend ou dépose, car on a que le bouton max »
   *   « parfois on écrit un chiffre, je suis obligé d'appuyer sur entrée
   *     pour qu'il reconnaisse que j'ai écrit un chiffre »
   *
   * Le troisieme est le plus grave et c est celui qui se mesure le mieux :
   * la frappe SEULE doit suffire. Aucune touche Entree, aucun changement de
   * champ, aucun clic ailleurs — juste des caracteres, et l ecran suit.
   */
  /* ==================== ACHETER DEPUIS UNE AUTRE CHAINE ====================
   *
   * « De base on achète du SWOGE avec de l'ETH RH, mais est-ce qu'on pourrait
   * en acheter direct avec de l'ETH, ou du Base, ou de l'Arbitrum… en mode ça
   * bridge en fond puis ça swap ? »
   *
   * Oui, et en UNE transaction : le relayeur accepte une monnaie de sortie
   * quelconque sur la chaine d arrivee. Ce qui se mesure ici n est pas qu il
   * sache le faire — c est son affaire — mais que la page lui demande la
   * BONNE chose et signe au BON endroit :
   *
   *   - la monnaie de sortie demandee est le contrat du jeton choisi, pas
   *     l ether ni un jeton voisin ;
   *   - la signature part de la chaine de DEPART, pas d ici ;
   *   - l ecran dit qu on achete et non qu on echange, et le cout affiche est
   *     nomme pour ce qu il est — le pont EN PLUS de l impact.
   */
  console.log('\n-- acheter depuis une autre chaine --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const HASH = '0x' + 'ab'.repeat(32);
    const mot = (v) => '0x' + v.toString(16).padStart(64, '0');
    const w = { devis: null };
    const page = await nav.newPage({ viewport: { width: 390, height: 900 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 180)));
    await page.addInitScript(([moi, hash]) => {
      try { localStorage.setItem('swogeAuth', 'email');
            sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {}
      window.__w = { chaine: '0x1237', bascules: [], envoyees: [] };
      window.SwogePrivy = { init: () => {}, sendCode: async () => {}, verifyCode: async () => moi,
        logout: async () => {}, restore: async () => moi, getProvider: () => window.ethereum,
        getAddress: () => moi, isLoggedIn: () => true, comptes: () => [{ adresse: moi, index: 0 }],
        choisitCompte: async () => moi, ajouteCompte: async () => moi, indexCompte: () => 0,
        solana: () => [{ adresse: 'So1anaAddre55Exemp1eXXXXXXXXXXXXXXXXXXXXXXX', index: 0 }],
        creeSolana: async () => 'So1anaAddre55Exemp1eXXXXXXXXXXXXXXXXXXXXXXX' };
      window.ethereum = { isMetaMask: true, request: async (a) => {
        const W = window.__w;
        if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
        if (a.method === 'eth_chainId') return W.chaine;
        if (a.method === 'net_version') return String(parseInt(W.chaine, 16));
        if (a.method === 'wallet_switchEthereumChain') {
          W.bascules.push(a.params[0].chainId); W.chaine = a.params[0].chainId; return null; }
        if (a.method === 'eth_sendTransaction') {
          W.envoyees.push(Object.assign({ sur: W.chaine }, a.params[0])); return hash; }
        if (a.method === 'eth_estimateGas') return '0x7ed0';
        if (a.method === 'eth_getTransactionCount') return '0x0';
        if (a.method === 'eth_gasPrice') return '0xf4240';
        if (a.method === 'eth_blockNumber') return '0x10';
        if (a.method === 'eth_getTransactionByHash') return { hash, blockHash: '0x' + '11'.repeat(32),
          blockNumber: '0x10', transactionIndex: '0x0', from: moi, to: moi, value: '0x0',
          gas: '0x5208', gasPrice: '0xf4240', nonce: '0x0', input: '0x',
          r: '0x' + '11'.repeat(32), s: '0x' + '22'.repeat(32), v: '0x1b', type: '0x0' };
        if (a.method === 'eth_getTransactionReceipt') return { transactionHash: hash,
          transactionIndex: '0x0', blockHash: '0x' + '11'.repeat(32), blockNumber: '0x10',
          from: moi, to: moi, contractAddress: null, cumulativeGasUsed: '0x5208', gasUsed: '0x5208',
          effectiveGasPrice: '0x3b9aca00', logs: [], logsBloom: '0x' + '00'.repeat(256),
          status: '0x1', type: '0x0' };
        if (a.method === 'eth_getBlockByNumber') return { number: '0x10', hash: '0x' + '11'.repeat(32),
          parentHash: '0x' + '22'.repeat(32), timestamp: '0x66000000', transactions: [],
          baseFeePerGas: '0x1', gasLimit: '0x1c9c380', gasUsed: '0x0', miner: moi, difficulty: '0x0',
          extraData: '0x', nonce: '0x0', sha3Uncles: '0x' + '00'.repeat(32),
          logsBloom: '0x' + '00'.repeat(256), transactionsRoot: '0x' + '00'.repeat(32),
          stateRoot: '0x' + '00'.repeat(32), receiptsRoot: '0x' + '00'.repeat(32),
          uncles: [], size: '0x0' };
        return null; }, on: () => {}, removeListener: () => {} };
    }, [MOI, HASH]);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/privy-swoge.js*', (r) => r.fulfill({
      contentType: 'text/javascript', body: '/* joue par l essai */' }));
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    await page.route(/publicnode|drpc|robinhood|arbitrum|optimism|base-rpc|mainnet\.base/, async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const rh = /robinhood/.test(r.request().url());
      const un = (m) => {
        if (m.method === 'eth_chainId') return rh ? '0x1237' : '0x2105';
        if (m.method === 'net_version') return rh ? '4663' : '8453';
        if (m.method === 'eth_blockNumber') return '0x10';
        if (m.method === 'eth_gasPrice') return mot(1000000n);
        if (m.method === 'eth_getBalance') return mot(2000000000000000000n);
        /* Sur la Robinhood Chain, rien ; ailleurs, cinq cents jetons — c est
           ce qui rend la ligne d un jeton distant visible. */
        if (m.method === 'eth_call') return rh ? mot(0n) : mot(500000000000000000000n);
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_getTransactionReceipt') return { transactionHash: m.params[0],
          transactionIndex: '0x0', blockHash: '0x' + '11'.repeat(32), blockNumber: '0x10',
          from: '0x' + '0'.repeat(40), to: '0x' + '0'.repeat(40), contractAddress: null,
          cumulativeGasUsed: '0x5208', gasUsed: '0x5208', effectiveGasPrice: '0x3b9aca00',
          logs: [], logsBloom: '0x' + '00'.repeat(256), status: '0x1', type: '0x0' };
        return null; };
      const rep = (m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) });
      await r.fulfill({ contentType: 'application/json',
        body: JSON.stringify(Array.isArray(q) ? q.map(rep) : rep(q)) });
    });
    await page.route('**/solana-rpc.publicnode.com/**', async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      if (q.method === 'getTokenAccountsByOwner')
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: 1,
          result: { value: [{ account: { data: { parsed: { info: {
            tokenAmount: { amount: '4200000000', decimals: 5 } } } } } }] } }) });
      return r.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: 0 } }) });
    });
    await page.route('**/api.relay.link/**', async (r) => {
      const u = r.request().url();
      if (u.indexOf('/intents/status') >= 0)
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success' }) });
      const c = JSON.parse(r.request().postData() || '{}');
      w.devis = { de: c.originChainId, vers: c.destinationChainId,
                  cur: c.destinationCurrency, curDe: c.originCurrency,
                  dest: c.recipient, montant: c.amount };
      const dedans = BigInt(c.amount);
      const sortie = dedans * 100000000n / 1000000n;
      await r.fulfill({ contentType: 'application/json', body: JSON.stringify({
        requestId: '0xfeed',
        /* Payer avec un JETON commence par une autorisation : Relay la rend
           comme une etape de plus. Le banc la joue pour que la page prouve
           qu elle signe les DEUX. */
        steps: (c.originCurrency && c.originCurrency !== '0x0000000000000000000000000000000000000000'
          ? [{ id: 'approve', kind: 'transaction', items: [{
              data: { to: c.originCurrency, value: '0', data: '0x095ea7b3',
                      chainId: c.originChainId } }] }]
          : []).concat([{ id: 'deposit', kind: 'transaction', items: [{
          data: { to: '0x4cd00e387622c35bddb9b4c962c136462338bc31', value: c.amount,
                  data: '0x49290c1c', chainId: c.originChainId },
          check: { endpoint: '/intents/status?requestId=0xfeed', method: 'GET' } }] }]),
        fees: { gas: { amount: '40000000000000' }, relayer: { amount: '30000000000000' } },
        details: { timeEstimate: 2, totalImpact: { percent: '-3.17' },
                   currencyIn: { amount: c.amount, amountFormatted: '0' },
                   currencyOut: { amount: String(sortie),
                                  minimumAmount: String(sortie * 98n / 100n),
                                  amountFormatted: '0',
                                  /* Ce que le relayeur dit du jeton livre : la seule
                                     source honnete pour un contrat colle que cette
                                     page ne connait pas. */
                                  currency: { chainId: c.destinationChainId,
                                              address: c.destinationCurrency,
                                              symbol: c.destinationChainId === 792703809 ? 'BONK' : 'DEGEN',
                                              decimals: 5 } } } }) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.evaluate(() => document.querySelector('#pied [data-va="ecSwap"]').click());
    await page.waitForTimeout(600);

    const lit = () => page.evaluate(() => ({
      chaine: (document.getElementById('swChaineNom') || {}).textContent,
      lab: (document.getElementById('swDeL') || {}).textContent,
      paye: (document.querySelector('.wl-pick[data-pour="swDe"] .tx b') || {}).textContent,
      fige: !!document.querySelector('.wl-pick[data-pour="swDe"].fige'),
      de: (document.getElementById('swDe') || {}).value,
      options: [...document.querySelectorAll('#swDe option')].map((o) => o.value),
      vers: (document.getElementById('swVers') || {}).value,
      solde: (document.getElementById('swSolde') || {}).textContent,
      recu: (document.getElementById('swRecu') || {}).textContent,
      route: (document.getElementById('swRoute') || {}).textContent,
      impactT: (document.getElementById('swImpactT') || {}).textContent,
      impact: (document.getElementById('swImpact') || {}).textContent,
      mini: (document.getElementById('swMini') || {}).textContent,
      temps: (document.getElementById('swTemps') || {}).textContent,
      tempsVu: !document.getElementById('swTempsR').hidden,
      bouton: (document.getElementById('swPartir') || {}).textContent,
      note: (document.getElementById('swNote') || {}).textContent }));

    /* ---- D ICI, RIEN NE CHANGE ----
     * L echange local est le chemin de tous les jours : le casser pour
     * gagner un raccourci serait un mauvais marche. */
    let m = await lit();
    console.log('   depuis ici : ' + JSON.stringify({ chaine: m.chaine, route: m.route, bouton: m.bouton }));
    ok(/Robinhood/.test(m.chaine), 'l echange s ouvre sur la Robinhood Chain, comme avant');
    ok(/Uniswap|then/.test(m.route),
       'et il cote toujours sur les piscines d ici (' + m.route + ')');
    ok(m.bouton === 'Swap' && !m.fige,
       'le bouton dit « Swap » et les deux jetons se choisissent');

    /* ---- ON CHOISIT UNE AUTRE CHAINE ---- */
    await page.click('#swChaineB');
    await page.waitForTimeout(400);
    const listeCh = await page.evaluate(() =>
      [...document.querySelectorAll('#poChL [data-ch]')].map((b) => b.dataset.ch));
    ok(listeCh.length >= 8,
       'la meme feuille que le pont sert a choisir la chaine (' + listeCh.length + ' chaines)');
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#poChL [data-ch]')].find((x) => /Base/.test(x.textContent));
      b.click();
    });
    await page.waitForTimeout(800);
    m = await lit();
    console.log('   depuis Base : ' + JSON.stringify({ lab: m.lab, paye: m.paye, options: m.options,
      route: m.route, bouton: m.bouton, impactT: m.impactT, solde: m.solde }));
    ok(m.bouton === 'Buy', 'l ecran devient un ACHAT, pas un echange (« ' + m.bouton + ' »)');
    ok(/Base/.test(m.lab), 'et il dit sur quelle chaine on paie (« ' + m.lab + ' »)');
    /* ---- ON NE PAIE JAMAIS UN JETON QUI N EXISTE PAS LA-BAS ----
     *
     * Le relayeur prend de l ether sur Base, pas du $SWOGE qui n y est pas.
     * La garantie tenait par une liste reduite a une seule ligne, et le champ
     * etait fige. Elle tient maintenant autrement : la liste les porte tous,
     * mais choisir en DEPLACE la chaine — donc rien n est jamais choisi puis
     * refuse apres coup, ce qui etait le piege a eviter.
     *
     * Le champ n est donc plus fige : c est justement par la qu on part
     * d ailleurs sans avoir a trouver le bouton du haut. */
    ok(m.paye === 'ETH' && m.de === 'ch8453',
       'choisir Base a repose la piece a payer sur celle de Base (' + m.de + ')');
    ok(!m.fige, 'et le champ reste ouvert : c est par la qu on choisit un jeton d ailleurs');
    const retour = await page.evaluate(async () => {
      const s = document.getElementById('swDe');
      s.value = 'swoge';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 600));
      return { de: s.value, ch: (document.getElementById('swChaineNom') || {}).textContent };
    });
    console.log('   on choisit $SWOGE depuis Base : ' + JSON.stringify(retour));
    ok(retour.de === 'swoge' && /Robinhood/.test(retour.ch),
       'et prendre $SWOGE pendant qu on partait de Base ramene le depart ICI, ou il existe : '
       + 'aucun choix n est accepte puis refuse plus tard (' + retour.ch + ')');
    /* On remet Base pour la suite, qui mesure l achat depuis la-bas. */
    await page.click('#swChaineB');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#poChL [data-ch]')].find((x) => /Base/.test(x.textContent));
      b.click(); });
    await page.waitForTimeout(800);
    m = await lit();
    ok(/2 ETH/.test(m.solde), 'et le solde montre est celui de Base (' + m.solde + ')');
    ok(m.tempsVu, 'une ligne annonce le delai d arrivee, qui n existe pas sur un echange local');

    /* ---- LE DEVIS DEMANDE LE BON JETON ----
     * C est LA mesure qui compte : si la monnaie de sortie demandee n est pas
     * le contrat du jeton choisi, le joueur signerait un achat d autre chose
     * en lisant un ecran parfaitement coherent. */
    await page.evaluate(() => { const sel = document.getElementById('swVers');
      sel.value = 'swoge'; sel.dispatchEvent(new Event('change')); });
    await page.waitForTimeout(400);
    await page.fill('#swMontant', '0.01');
    await page.waitForTimeout(1600);
    m = await lit();
    console.log('   devis : ' + JSON.stringify({ recu: m.recu, impact: m.impact, temps: m.temps })
      + ' / demande : ' + JSON.stringify(w.devis));
    ok(!!w.devis && w.devis.de === 8453 && w.devis.vers === 4663,
       'le relayeur est interroge DE Base VERS la Robinhood Chain ('
       + JSON.stringify(w.devis && { de: w.devis.de, vers: w.devis.vers }) + ')');
    ok(!!w.devis && /^0x8a166Fb41Cd659a0a43396272FF73973Ce29F817$/i.test(w.devis.cur),
       'et la monnaie de sortie demandee est le CONTRAT du $SWOGE, pas l ether ('
       + (w.devis || {}).cur + ')');
    ok(/SWOGE/.test(m.recu) && !/ETH/.test(m.recu),
       'ce qui s affiche est bien du $SWOGE (' + m.recu + ')');
    ok(/SWOGE/.test(m.mini), 'et le minimum garanti aussi (' + m.mini + ')');
    /* ---- LE COUT EST NOMME POUR CE QU IL EST ----
     * Il contient le pont EN PLUS de l impact de piscine. L appeler « price
     * impact » ferait juger la piscine sur un chiffre qui n est pas le sien. */
    ok(/Total cost/i.test(m.impactT),
       'le cout n est plus intitule « price impact » : il contient aussi le pont ('
       + m.impactT + ')');
    ok(/3\.17/.test(m.impact), 'et il vaut ce que le relayeur annonce (' + m.impact + ')');
    /* Le mot a change avec la fonction : le meme chemin sert maintenant a
       acheter SUR une autre chaine, ou « bridge » ne decrirait plus rien.
       Ce qui compte est inchange : la note doit dire que le chiffre contient
       les FRAIS DU RELAYEUR et pas seulement l impact de piscine. */
    ok(/(relayer|bridge)[^.]*fee/i.test(m.note),
       'la note l explique en toutes lettres : « ' + m.note.slice(0, 80) + ' »');

    /* ---- ET LA SIGNATURE PART DE LA-BAS ----
     * Signer ici enverrait de l ether au contrat du relayeur SUR LA
     * ROBINHOOD CHAIN, ou il n existe pas. 0x2105 = 8453. */
    await page.click('#swPartir');
    await page.waitForTimeout(4000);
    const f = await page.evaluate(() => ({ bascules: window.__w.bascules,
      envoyees: window.__w.envoyees.map((x) => x.sur),
      note: document.getElementById('swNote').textContent }));
    console.log('   achat : ' + JSON.stringify(f));
    ok(f.bascules.length === 1 && f.bascules[0] === '0x2105',
       'le portefeuille bascule SUR BASE avant de signer (' + JSON.stringify(f.bascules) + ')');
    ok(f.envoyees.length === 1 && f.envoyees[0] === '0x2105',
       'et la transaction part bien de la (' + JSON.stringify(f.envoyees) + ')');
    ok(/arrived on/i.test(f.note),
       'la page dit que c est arrive, une fois le relayeur confirme : « '
       + f.note.slice(0, 70) + ' »');

    /* ---- ET L ACHAT LAISSE UNE TRACE ----
     * Ce qui arrive ici est pose par le relayeur, sans transfert signe par
     * nous : sans cette inscription, l achat n apparaitrait NULLE PART. */
    await page.evaluate(() => document.querySelector('#pied [data-va="ecActivite"]').click());
    await page.waitForTimeout(2500);
    const act = await page.evaluate(() =>
      [...document.querySelectorAll('#acvCorps .wl-jeton')].map((b) => ({
        t: b.querySelector('.nom b').textContent,
        s: b.querySelector('.nom small').textContent })));
    console.log('   activity : ' + JSON.stringify(act.slice(0, 2)));
    const tr = act.filter((x) => /Bought/.test(x.t))[0];
    ok(!!tr, 'l achat est dans l historique');
    ok(!!tr && /SWOGE/.test(tr.t), 'en disant CE QU on a achete (' + (tr || {}).t + ')');
    ok(!!tr && /Base/.test(tr.s), 'et d ou on l a paye (' + (tr || {}).s + ')');

    /* ==================== ACHETER **VERS** UNE AUTRE CHAINE ====================
     *
     * « Est-ce que je peux acheter des memecoins BNB ou des memecoins
     * Solana ? » Oui — mesure prise sur le vrai relayeur avant de coder :
     * FLOKI sur BNB −2,63 %, DEGEN sur Base −0,41 %, BONK sur Solana +0,09 %.
     *
     * Mais acheter est facile partout ; SORTIR ne l est pas, et c est la
     * seule chose qui compte vraiment ici. Ce portefeuille signe sur les huit
     * chaines EVM et nulle part ailleurs. Ce qui se mesure donc :
     *   - la page DIT ce qu on pourra faire du jeton, avant l achat ;
     *   - elle demande au relayeur le bon contrat sur la bonne chaine, et
     *     fait payer sur l ADRESSE SOLANA quand l arrivee est Solana — y
     *     envoyer un « 0x… » deposerait chez personne ;
     *   - le jeton achete entre dans la liste et son solde se lit vraiment ;
     *   - et celui qui vit sur une chaine EVM se revend d un geste.
     */
    console.log('\n   -- acheter vers une autre chaine --');
    await page.evaluate(() => document.querySelector('#pied [data-va="ecSwap"]').click());
    await page.waitForTimeout(500);
    /* On repart d ici : c est le cas ordinaire, payer avec son ETH (RH). */
    await page.click('#swChaineB');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#poChL [data-ch]')].find((x) => /Robinhood/.test(x.textContent));
      b.click(); });
    await page.waitForTimeout(600);

    await page.click('#swVersChB');
    await page.waitForTimeout(400);
    const arrivees = await page.evaluate(() =>
      [...document.querySelectorAll('#poChL [data-ch]')].map((b) => b.dataset.ch));
    console.log('   arrivees : ' + JSON.stringify(arrivees));
    /* ---- SOLANA EST UNE ARRIVEE, PAS UN DEPART ----
     * On ne sait pas y signer : la proposer comme chaine de depart serait
     * une impasse, et l y trouver comme arrivee est exactement ce qu on veut. */
    ok(arrivees.indexOf('792703809') >= 0,
       'Solana est proposee A L ARRIVEE (' + arrivees.length + ' chaines)');
    ok(listeCh.indexOf('792703809') < 0,
       'et JAMAIS au depart : on ne sait pas y signer, ce serait une impasse');

    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#poChL [data-ch]')].find((x) => /Solana/.test(x.textContent));
      b.click(); });
    await page.waitForTimeout(700);
    const versSol = await page.evaluate(() => ({
      vers: (document.getElementById('swVersChNom') || {}).textContent,
      champ: !document.getElementById('swVersAdrChamp').hidden,
      picker: !document.getElementById('swVersChamp').hidden,
      sortie: (document.getElementById('swSortie') || {}).textContent,
      sortieVue: !document.getElementById('swSortie').hidden,
      grave: (document.getElementById('swSortie') || {}).className }));
    console.log('   vers Solana : ' + JSON.stringify({ vers: versSol.vers, champ: versSol.champ,
      picker: versSol.picker, sortie: versSol.sortie.slice(0, 70) }));
    ok(versSol.champ && !versSol.picker,
       'sur une autre chaine on COLLE un contrat : cette page ne tient aucune liste de jetons '
       + 'la-bas, et en inventer une afficherait des noms que personne n a verifies');
    /* ---- LA PHRASE LA PLUS IMPORTANTE DE CET ECRAN ---- */
    ok(versSol.sortieVue && /one way/i.test(versSol.sortie),
       'la page dit AVANT que la porte est a sens unique : « '
       + versSol.sortie.slice(0, 60) + ' »');
    ok(/cannot sign|cannot sell/i.test(versSol.sortie),
       'et pourquoi — elle ne sait pas signer la-bas');
    ok(/grave/.test(versSol.grave),
       'en rouge, pas en note discrete : c est un avertissement, pas un detail');

    await page.fill('#swVersAdr', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
    await page.fill('#swMontant', '0.02');
    await page.waitForTimeout(1800);
    const dSol = await page.evaluate(() => ({
      recu: (document.getElementById('swRecu') || {}).textContent }));
    console.log('   devis Solana : ' + JSON.stringify(dSol) + ' / demande : ' + JSON.stringify(w.devis));
    ok(w.devis.vers === 792703809 && w.devis.cur === 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
       'le relayeur est interroge vers Solana, avec le MINT colle ('
       + w.devis.cur + ')');
    /* ---- ET IL PAIE SUR LA BONNE ADRESSE ----
     * C est la mesure qui evite de perdre les fonds : un « 0x… » envoye sur
     * Solana ne designe aucun compte. */
    ok(/^So1ana/.test(String(w.devis.dest)),
       'et il paie sur l adresse SOLANA du compte, pas sur l adresse EVM ('
       + w.devis.dest + ')');
    ok(/BONK/.test(dSol.recu),
       'ce qui s affiche porte le nom que le relayeur donne au jeton ('
       + dSol.recu + ')');

    await page.click('#swPartir');
    await page.waitForTimeout(4500);
    const finSol = await page.evaluate(() => ({
      note: document.getElementById('swNote').textContent,
      stock: JSON.parse(localStorage.getItem('swogeJetonsDistants') || '[]') }));
    console.log('   apres achat : ' + JSON.stringify({ note: finSol.note.slice(0, 50),
      stock: finSol.stock.map((x) => x.sym + '@' + x.chaine) }));
    ok(/arrived on Solana/i.test(finSol.note), 'la page dit ou c est arrive');
    /* ---- ET IL ENTRE DANS LA LISTE ----
     * Un jeton achete ailleurs qui n apparait nulle part, c est le defaut
     * qu on vient de payer une fois avec l ETH parti sur Base. */
    ok(finSol.stock.length === 1 && finSol.stock[0].chaine === 792703809
       && finSol.stock[0].sym === 'BONK',
       'le jeton achete est retenu, avec SA chaine ('
       + JSON.stringify(finSol.stock.map((x) => x.sym + ' @ ' + x.chaine)) + ')');
    ok(finSol.stock[0].dec === 5,
       'et ses decimales telles que le relayeur les a dites — les deviner '
       + 'afficherait un solde faux (' + finSol.stock[0].dec + ')');

    /* ---- ON LE VOIT, ET SON SOLDE EST VRAIMENT LU ---- */
    await page.evaluate(() => document.querySelector('#pied [data-va="ecJetons"]').click());
    await page.waitForTimeout(3500);
    const avecBonk = await page.evaluate(() =>
      [...document.querySelectorAll('#jtListe .wl-jeton')].map((b) => ({
        sym: b.querySelector('.nom b').textContent,
        nom: b.querySelector('.nom small').textContent,
        val: b.querySelector('.val b').textContent,
        badge: (b.querySelector('.versPont') || {}).textContent || '',
        vendre: b.dataset.vendre || '' })));
    const bonk = avecBonk.filter((x) => x.sym === 'BONK')[0];
    console.log('   la ligne BONK : ' + JSON.stringify(bonk));
    ok(!!bonk, 'il a sa ligne dans « Tokens »');
    /* 4 200 000 000 unites a cinq decimales = 42 000 jetons. Se tromper de
       decimales afficherait un solde mille fois faux sans rien signaler. */
    ok(!!bonk && /42,?000/.test(bonk.val),
       'avec le solde REELLEMENT lu sur Solana, aux bonnes decimales ('
       + (bonk || {}).val + ')');
    ok(!!bonk && /one way/i.test(bonk.badge),
       'et la ligne repete que la sortie n existe pas (« ' + (bonk || {}).badge + ' »)');
    ok(!!bonk && !bonk.vendre,
       'elle ne propose donc AUCUN geste de vente — promettre un geste qui echouerait '
       + 'serait pire que de ne rien proposer');

    /* ==================== ET CE QU'ON DETIENT SUR UNE CHAINE EVM SE REVEND ====================
     * C est l autre moitie de la demande : d abord lire ce qu on detient
     * ailleurs pour que la sortie existe, ensuite seulement ouvrir l achat. */
    await page.evaluate(() => {
      const l = JSON.parse(localStorage.getItem('swogeJetonsDistants') || '[]');
      l.push({ adr: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', sym: 'DEGEN',
               nom: 'DEGEN on Base', dec: 18, chaine: 8453 });
      localStorage.setItem('swogeJetonsDistants', JSON.stringify(l));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.evaluate(() => document.querySelector('#pied [data-va="ecJetons"]').click());
    await page.waitForTimeout(3000);
    const avecDegen = await page.evaluate(() =>
      [...document.querySelectorAll('#jtListe .wl-jeton')].map((b) => ({
        sym: b.querySelector('.nom b').textContent,
        val: b.querySelector('.val b').textContent,
        badge: (b.querySelector('.versPont') || {}).textContent || '',
        vendre: b.dataset.vendre || '' })));
    const dg = avecDegen.filter((x) => x.sym === 'DEGEN')[0];
    console.log('   la ligne DEGEN : ' + JSON.stringify(dg));
    ok(!!dg, 'un jeton detenu sur Base a sa ligne');
    ok(!!dg && /500/.test(dg.val),
       'avec son solde lu SUR BASE, pas ici — ou son contrat n existe pas ('
       + (dg || {}).val + ')');
    ok(!!dg && /sell/i.test(dg.badge) && !!dg.vendre,
       'et la sortie est sur la ligne meme (« ' + (dg || {}).badge + ' »)');

    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#jtListe .wl-jeton')].find((x) => /DEGEN/.test(x.textContent));
      b.click(); });
    await page.waitForTimeout(1500);
    const pret = await page.evaluate(() => ({
      ecran: (document.querySelector('.wl-ecran.on') || {}).id,
      de: (document.getElementById('swDe') || {}).value,
      chaine: (document.getElementById('swChaineNom') || {}).textContent,
      vers: (document.getElementById('swVersChNom') || {}).textContent }));
    console.log('   apres le tap : ' + JSON.stringify(pret));
    ok(pret.ecran === 'ecSwap' && /Base/.test(pret.chaine) && /^d8453-/.test(pret.de),
       'un tap ouvre l echange DEJA pose sur la bonne chaine et le bon jeton — rechoisir a la '
       + 'main est justement le moment ou l on se trompe de ligne');
    /* Vendre, c est RENTRER : laisser une arrivee lointaine ferait revendre
       vers une chaine ou l on ne voulait pas aller. */
    ok(/Robinhood/.test(pret.vers),
       'et l arrivee repasse ici, quelle qu ait ete la derniere destination ('
       + pret.vers + ')');

    await page.evaluate(() => { window.__w.bascules = []; window.__w.envoyees = []; });
    await page.fill('#swMontant', '100');
    await page.waitForTimeout(1600);
    await page.click('#swPartir');
    await page.waitForTimeout(5000);
    const fv = await page.evaluate(() => ({ bascules: window.__w.bascules,
      envoyees: window.__w.envoyees.map((x) => ({ sur: x.sur, to: String(x.to || '').toLowerCase() })),
      note: document.getElementById('swNote').textContent }));
    console.log('   vente : ' + JSON.stringify(fv) + ' / devis : '
      + JSON.stringify({ de: w.devis.de, curDe: w.devis.curDe }));
    ok(String(w.devis.curDe).toLowerCase() === '0x4ed4e862860bed51a9570b96d89af5e1b0efefed',
       'le relayeur est paye AVEC le jeton, pas avec l ether (' + w.devis.curDe + ')');
    /* ---- DEUX SIGNATURES, ET LA PREMIERE EST L AUTORISATION ----
     * N en signer qu une laissait la vente echouer au deuxieme geste, sans
     * que rien ne l ait annonce. */
    ok(fv.envoyees.length === 2,
       'deux signatures partent : l autorisation, puis le transfert ('
       + fv.envoyees.length + ')');
    ok(fv.envoyees.length === 2
       && fv.envoyees[0].to === '0x4ed4e862860bed51a9570b96d89af5e1b0efefed',
       'la premiere va au CONTRAT du jeton — c est l autorisation ('
       + JSON.stringify(fv.envoyees.map((x) => x.to.slice(0, 10))) + ')');
    ok(fv.envoyees.every((x) => x.sur === '0x2105'),
       'et les deux sont signees sur Base (' + JSON.stringify(fv.envoyees.map((x) => x.sur)) + ')');
    ok(/arrived on/i.test(fv.note), 'la vente aboutit (« ' + fv.note.slice(0, 50) + ' »)');

    /* ---- LE CHOIX SE RETIENT ---- */
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2800);
    await page.evaluate(() => document.querySelector('#pied [data-va="ecSwap"]').click());
    await page.waitForTimeout(600);
    const apres = await page.evaluate(() => (document.getElementById('swChaineNom') || {}).textContent);
    ok(/Base/.test(apres),
       'la chaine choisie tient apres un rechargement — qui paie toujours depuis Base ne le '
       + 'rechoisit pas a chaque visite (' + apres + ')');

    /* ================= LE JETON CHOISI DIT SA CHAINE =================
     *
     * « Le wallet devrait etre plus intelligent : quand je suis dans swap,
     *   reconnaitre la chaine du jeton selectionne. »
     *
     * Il fallait d abord annoncer la chaine, ensuite choisir le jeton : la
     * liste ne montrait que ce qui vit sur la chaine deja selectionnee. Qui
     * detient du DEGEN sur Base ouvrait l echange, ne le voyait pas, et
     * n avait aucune raison de deviner qu un bouton en haut de l ecran le
     * ferait apparaitre.
     *
     * Ce qui se mesure ici, dans les deux sens :
     *   - la liste qui paie porte les jetons de TOUTES les chaines ;
     *   - en choisir un pose la chaine de depart tout seul ;
     *   - choisir une chaine repose le jeton, pour qu ils ne se contredisent
     *     jamais — un ecran coherent avec le mauvais jeton est le pire cas
     *     possible ici, puisque le devis, lui, serait juste ;
     *   - et Solana reste hors de cette liste : on ne sait pas y signer.
     */
    console.log('\n   -- le jeton choisi dit sa chaine --');
    /* On se repose ici avant de mesurer : le depart doit VENIR du jeton. */
    await page.click('#swChaineB');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#poChL [data-ch]')].find((x) => /Robinhood/.test(x.textContent));
      b.click(); });
    await page.waitForTimeout(700);

    await page.click('#swDeB');
    await page.waitForTimeout(300);
    const liste = await page.evaluate(() =>
      [...document.querySelectorAll('.wl-pick[data-pour="swDe"] .wl-pick-o')].map((o) => ({
        cle: o.dataset.cle,
        sym: o.querySelector('.tx b').textContent,
        ch: (o.querySelector('.wl-chp b') || {}).textContent || '' })));
    console.log('   ce qu on peut payer : ' + JSON.stringify(liste.map((x) => x.sym + (x.ch ? '@' + x.ch : ''))));
    ok(liste.some((x) => x.cle === 'd8453-0x4ed4e862860bed51a9570b96d89af5e1b0efefed'.toLowerCase()
                      || /^d8453-/.test(x.cle)),
       'le DEGEN detenu sur Base est DANS la liste qui paie, sans avoir eu a changer de chaine '
       + 'd abord (' + liste.length + ' lignes)');
    ok(liste.some((x) => x.cle === 'swoge') && liste.some((x) => x.cle === 'eth'),
       'et ce qui vit ici y est toujours');
    /* La pastille : le nom porte deja la chaine, mais un nom se coupe et
       c est le bout de droite qui saute. */
    const dg2 = liste.filter((x) => /^d8453-/.test(x.cle))[0];
    ok(!!dg2 && /Base/.test(dg2.ch),
       'chaque ligne d ailleurs porte sa chaine en clair (« ' + (dg2 || {}).ch + ' »)');
    ok(!liste.some((x) => /^d792703809-/.test(x.cle)),
       'et rien de Solana : cette page ne sait pas y signer, proposer d y payer serait '
       + 'promettre un geste qui echouerait apres coup');

    /* ---- ON CHOISIT LE JETON. LA CHAINE SUIT. ---- */
    await page.evaluate(() => {
      const o = [...document.querySelectorAll('.wl-pick[data-pour="swDe"] .wl-pick-o')]
        .find((x) => /^d8453-/.test(x.dataset.cle));
      o.click(); });
    await page.waitForTimeout(900);
    const suivi = await page.evaluate(() => ({
      de: (document.getElementById('swDe') || {}).value,
      chaine: (document.getElementById('swChaineNom') || {}).textContent,
      lab: (document.getElementById('swDeL') || {}).textContent,
      solde: (document.getElementById('swSolde') || {}).textContent }));
    console.log('   apres le choix : ' + JSON.stringify(suivi));
    ok(/^d8453-/.test(suivi.de) && /Base/.test(suivi.chaine),
       'choisir le jeton a POSE la chaine : le bouton « From » n est plus une question, '
       + 'c est ce que le jeton a dit (' + suivi.chaine + ')');
    ok(/Base/.test(suivi.lab),
       'et l etiquette du champ le repete la ou on tape le montant (« ' + suivi.lab + ' »)');
    ok(/500/.test(suivi.solde),
       'le solde affiche est celui du jeton SUR SA CHAINE (' + suivi.solde + ')');

    /* ---- ET DANS L AUTRE SENS ----
     * Le bouton reste, pour qui prefere partir de la chaine. Il doit alors
     * reposer le jeton : laisser le DEGEN de Base sous un depart Robinhood
     * ferait un ecran coherent avec le mauvais jeton. */
    await page.click('#swChaineB');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#poChL [data-ch]')].find((x) => /Robinhood/.test(x.textContent));
      b.click(); });
    await page.waitForTimeout(900);
    const recale = await page.evaluate(() => ({
      de: (document.getElementById('swDe') || {}).value,
      chaine: (document.getElementById('swChaineNom') || {}).textContent }));
    console.log('   apres avoir repose la chaine : ' + JSON.stringify(recale));
    ok(/Robinhood/.test(recale.chaine) && recale.de === 'eth',
       'choisir une chaine repose le jeton : les deux ne peuvent pas se contredire ('
       + recale.de + ' sur ' + recale.chaine + ')');

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  console.log('\n-- le montant, pendant qu on le tape --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const mot = (v) => '0x' + v.toString(16).padStart(64, '0');
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 180)));
    await page.addInitScript((moi) => {
      try { localStorage.setItem('swogeAuth', 'email');
            sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {}
      window.SwogePrivy = { init: () => {}, sendCode: async () => {}, verifyCode: async () => moi,
        logout: async () => {}, restore: async () => moi, getProvider: () => window.ethereum,
        getAddress: () => moi, isLoggedIn: () => true, comptes: () => [{ adresse: moi, index: 0 }],
        choisitCompte: async () => moi, ajouteCompte: async () => moi, indexCompte: () => 0,
        solana: () => [], creeSolana: async () => null };
      window.ethereum = { isMetaMask: true, request: async (a) => {
        if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
        if (a.method === 'eth_chainId') return '0x1237';
        if (a.method === 'net_version') return '4663';
        return null; }, on: () => {}, removeListener: () => {} };
    }, MOI);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/privy-swoge.js*', (r) => r.fulfill({
      contentType: 'text/javascript', body: '/* joue par l essai */' }));
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    await page.route('**/api.relay.link/**', (r) => r.fulfill({
      status: 400, contentType: 'application/json', body: '{"message":"pas de route"}' }));
    /* DEUX ETH tout rond sur chaque chaine : les pourcentages se lisent alors
       a l oeil nu, et un quart vaut exactement 0,5. */
    await page.route(/publicnode|drpc|robinhood|arbitrum|optimism|base|avalanche/, async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const rh = /robinhood/.test(r.request().url());
      const un = (m) => {
        if (m.method === 'eth_chainId') return rh ? '0x1237' : '0x1';
        if (m.method === 'net_version') return rh ? '4663' : '1';
        if (m.method === 'eth_blockNumber') return '0x10';
        if (m.method === 'eth_gasPrice') return mot(1000000n);
        if (m.method === 'eth_getBalance') return mot(2000000000000000000n);
        if (m.method === 'eth_call') return mot(1000000000000000000000n);
        if (m.method === 'eth_getLogs') return [];
        return null; };
      const rep = (m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) });
      await r.fulfill({ contentType: 'application/json',
        body: JSON.stringify(Array.isArray(q) ? q.map(rep) : rep(q)) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const lit = (champ) => page.evaluate((c) => {
      const e = document.getElementById(c);
      const w = document.querySelector('.wl-glis[data-pour="' + c + '"]');
      const g = w && w.querySelector('input[type=range]');
      const carte = e.closest('.wl-carte');
      return { val: e.value, rouge: e.classList.contains('trop'),
               pct: g ? Number(g.value) : null,
               txt: w ? w.querySelector('.pc').textContent : null,
               vu: !!w && w.getBoundingClientRect().height > 0,
               rangRouge: !!(carte && carte.querySelector('.wl-rang.trop')) };
    }, champ);

    await page.evaluate(() => document.querySelector('[data-va="ecEnvoyer"]').click());
    await page.waitForTimeout(500);

    /* ---- LA FRAPPE SEULE SUFFIT ----
     * `type()` envoie de vraies frappes, caractere par caractere, et RIEN
     * d autre : ni Entree, ni Tab, ni clic ailleurs. Si l ecran ne bouge
     * qu apres une validation, cette mesure le prend sur le fait. */
    await page.click('#enMontant');
    await page.type('#enMontant', '0.5', { delay: 60 });
    await page.waitForTimeout(400);
    let m = await lit('enMontant');
    console.log('   tape « 0.5 » sur 2 : ' + JSON.stringify(m));
    ok(m.pct === 25,
       'la frappe SEULE bouge le curseur — aucune touche Entree (' + m.pct + ' %)');
    ok(!m.rouge, 'et 0,5 sur 2 ne rougit pas');

    /* ---- LE ROUGE, DES QU ON DEPASSE ---- */
    await page.fill('#enMontant', '');
    await page.type('#enMontant', '3', { delay: 60 });
    await page.waitForTimeout(400);
    m = await lit('enMontant');
    console.log('   tape « 3 » sur 2 : ' + JSON.stringify(m));
    ok(m.rouge, 'un montant plus grand que le solde rougit le champ');
    ok(m.rangRouge,
       'et la ligne du solde avec lui — l oeil fait le rapprochement sans lire');
    const couleur = await page.evaluate(() => {
      const e = document.getElementById('enMontant');
      const c = getComputedStyle(e);
      return { texte: c.color, bord: c.borderColor };
    });
    /* Rouge pour de vrai, pas seulement une classe posee : une regle CSS
       oubliee laisserait la classe sans la moindre couleur. */
    const rouge = (v) => { const n = String(v).match(/\d+/g) || [];
      return n.length >= 3 && Number(n[0]) > 150 && Number(n[0]) > Number(n[1]) + 60; };
    ok(rouge(couleur.texte) && rouge(couleur.bord),
       'et c est vraiment rouge a l ecran (' + couleur.texte + ' / ' + couleur.bord + ')');
    await page.fill('#enMontant', '1');
    await page.waitForTimeout(300);
    m = await lit('enMontant');
    ok(!m.rouge && !m.rangRouge, 'redescendre sous le solde eteint le rouge');

    /* ---- LE CURSEUR REMPLIT LA CASE ---- */
    ok(m.vu, 'chaque champ de montant porte son curseur de pourcentage');
    const glisse = async (champ, part) => {
      await page.evaluate(([c, p]) => {
        const g = document.querySelector('.wl-glis[data-pour="' + c + '"] input');
        g.value = String(p); g.dispatchEvent(new Event('input', { bubbles: true }));
      }, [champ, part]);
      await page.waitForTimeout(600);
      return lit(champ);
    };
    m = await glisse('enMontant', 25);
    console.log('   curseur a 25 % : ' + JSON.stringify(m));
    ok(parseFloat(m.val) === 0.5,
       'le quart de 2 ETH ecrit 0,5 dans la case (' + m.val + ')');
    m = await glisse('enMontant', 50);
    ok(parseFloat(m.val) === 1, 'la moitie ecrit 1 (' + m.val + ')');
    m = await glisse('enMontant', 0);
    ok(m.val === '', 'et zero vide la case plutot que d y ecrire « 0 » (« ' + m.val + ' »)');

    /* ---- A FOND, IL GARDE DE QUOI PAYER LE RESEAU ----
     * C est la seule chose qu un curseur naif ferait de travers : poser le
     * solde ENTIER fabrique une transaction que le joueur ne peut plus payer.
     * Il passe donc par le meme calcul que MAX. */
    m = await glisse('enMontant', 100);
    console.log('   curseur a fond : ' + JSON.stringify(m));
    ok(parseFloat(m.val) > 1.9 && parseFloat(m.val) < 2,
       'pousse a fond, il ecrit MOINS que le solde entier : le gaz est garde ('
       + m.val + ' sur 2)');
    ok(m.pct === 100 && /MAX/.test(m.txt),
       'et la poignee reste au bout, en disant « MAX » plutot qu un 99 % qui '
       + 'ferait croire a un geste rate (' + m.txt + ')');
    ok(!m.rouge, 'ce que MAX ecrit n est jamais rouge');

    /* ---- ET LE MEME SUR L ECHANGE ---- */
    await page.evaluate(() => { document.querySelector('#pied [data-va="ecSwap"]').click(); });
    await page.waitForTimeout(600);
    await page.click('#swMontant');
    await page.type('#swMontant', '9', { delay: 60 });
    await page.waitForTimeout(500);
    m = await lit('swMontant');
    console.log('   echange, 9 sur 2 : ' + JSON.stringify(m));
    ok(m.rouge && m.rangRouge, 'l echange rougit pareil');
    m = await glisse('swMontant', 50);
    ok(parseFloat(m.val) === 1, 'et son curseur remplit pareil (' + m.val + ')');

    /* ---- UN SOLDE INCONNU N EN FABRIQUE PAS UN ----
     * Deviner un solde pour pouvoir dessiner une barre, ce serait ecrire un
     * montant que le joueur n a pas. Le curseur du pont est donc eteint tant
     * que la chaine de depart n a rien rendu. */
    await page.evaluate(() => { document.querySelector('#pied [data-va="ecAccueil"]').click(); });
    await page.waitForTimeout(300);
    const pont = await page.evaluate(() => {
      const w = document.querySelector('.wl-glis[data-pour="poMontant"]');
      return { existe: !!w, off: w ? w.dataset.off : null,
               bloque: w ? w.querySelector('input[type=range]').disabled : null };
    });
    console.log('   curseur du pont, avant lecture : ' + JSON.stringify(pont));
    ok(pont.existe, 'le pont a son curseur lui aussi');

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==================== BRULER ====================
   *
   * « Rajoute une petite fleche tout a gauche, et rajoute le burn dans le
   *   wallet. On a deja burn.html donc on sait comment faire. »
   *
   * Le geste existait sur sa page : un transfert vers une adresse dont
   * personne n'a la cle. Il vit maintenant la ou l'on tient ses jetons.
   *
   * Ce qui se mesure ici, et pourquoi :
   *   - la rangee porte CINQ gestes et glisse, parce que cinq libelles ne
   *     tiennent pas dans la largeur de quatre sur un cadre de 390 ;
   *   - les fleches ne s'affichent que s'il reste quelque chose de leur cote,
   *     et elles font vraiment defiler — sur un ordinateur sans ecran tactile
   *     c'est le SEUL moyen d'atteindre le cinquieme ;
   *   - la liste ne propose que ce que ce projet brule. L'ether n'y est pas :
   *     l'envoyer a l'adresse morte ne reduit l'offre de rien, ca ne fait que
   *     perdre de l'argent, et un geste inutile ET definitif est un piege ;
   *   - la confirmation n'est PAS sautable, meme quand le joueur a coupe la
   *     revue des envois : on envoie souvent, on ne brule pas dix fois par
   *     jour, et ca ne se rattrape jamais ;
   *   - et la transaction part vers `0x…dEaD`, sur la bonne chaine.
   */
  console.log('\n-- bruler depuis le portefeuille --');
  {
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const MORTE = '0x000000000000000000000000000000000000dead';
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 200)));
    await page.addInitScript(([moi]) => {
      try { localStorage.setItem('swogeAuth', 'wallet');
            /* La revue des envois est COUPEE : c'est le cas qui compte. */
            localStorage.setItem('swogeRevue', '0');
            sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {}
      window.__w = { chaine: '0x1237', bascules: [], envoyees: [] };
      const HASH = '0x' + 'cd'.repeat(32);
      window.ethereum = {
        isMetaMask: true,
        request: async (a) => {
          const w = window.__w;
          if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
          if (a.method === 'eth_chainId') return w.chaine;
          if (a.method === 'net_version') return String(parseInt(w.chaine, 16));
          if (a.method === 'wallet_switchEthereumChain') {
            w.bascules.push(a.params[0].chainId); w.chaine = a.params[0].chainId; return null;
          }
          if (a.method === 'wallet_addEthereumChain') return null;
          if (a.method === 'eth_getTransactionCount') return '0x0';
          if (a.method === 'eth_gasPrice') return '0x3b9aca00';
          if (a.method === 'eth_maxPriorityFeePerGas') return '0x3b9aca00';
          if (a.method === 'eth_estimateGas') return '0x5208';
          if (a.method === 'eth_call') return '0x';
          if (a.method === 'eth_sendTransaction') {
            w.envoyees.push(Object.assign({ surLaChaine: w.chaine }, a.params[0]));
            return HASH;
          }
          if (a.method === 'eth_getTransactionReceipt') {
            const t = w.envoyees[w.envoyees.length - 1] || {};
            return { transactionHash: HASH, transactionIndex: '0x0',
                     blockHash: '0x' + '11'.repeat(32), blockNumber: '0x10',
                     from: moi, to: t.to || moi, contractAddress: null,
                     cumulativeGasUsed: '0x5208', gasUsed: '0x5208',
                     effectiveGasPrice: '0x3b9aca00', logs: [],
                     logsBloom: '0x' + '00'.repeat(512), status: '0x1', type: '0x0' };
          }
          if (a.method === 'eth_blockNumber') return '0x10';
          if (a.method === 'eth_getBalance') return '0x0';
          return null;
        },
        on: () => {}, removeListener: () => {},
      };
    }, [MOI]);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    /* Un solde de $SWOGE a bruler : sans lui, le bouton refuserait pour
       « more than your balance » et l'essai mesurerait ce refus-la. */
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const un = (m) => {
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') return enMot(134102000n);
        if (m.method === 'eth_getBalance') return enMot(50000000000000000n);
        if (m.method === 'eth_call') return enMot(1000000000000000000000n);
        return null;
      };
      const rep = (m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) });
      const corps = Array.isArray(q) ? q.map(rep) : rep(q);
      await r.fulfill({ contentType: 'application/json', body: JSON.stringify(corps) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    /* ---- LA RANGEE ---- */
    const rang = await page.evaluate(() => {
      const r = document.getElementById('acActions');
      return { gestes: [...r.querySelectorAll('button[data-va]')].map((b) => b.dataset.va),
               deborde: r.scrollWidth > r.clientWidth + 1,
               gCache: document.getElementById('acFlecheG').hidden,
               dCache: document.getElementById('acFlecheD').hidden };
    });
    console.log('   ' + JSON.stringify(rang));
    /* La rangee est la liste des gestes que le portefeuille SAIT faire, et
       elle grandit. Ce qui est verifie ici n'est pas un compte fige mais un
       contrat : les six gestes attendus sont la, dans l'ordre, et le dernier
       arrive a la suite au lieu de s'inserer au milieu — le glissement des
       icones sous le doigt de quelqu'un qui vise le meme bouton chaque jour
       est un vrai defaut. */
    ok(JSON.stringify(rang.gestes) === JSON.stringify(
         ['ecEnvoyer', 'ecRecevoir', 'ecSwap', 'ecPont', 'ecBruler', 'ecBanc', 'ecSignaux']),
       'la rangee porte les sept gestes, dans l ordre — chaque nouveau vient A LA SUITE, jamais '
       + 'au milieu : quelqu un qui vise le meme bouton chaque jour ne doit pas le voir glisser ('
       + rang.gestes.join(', ') + ')');
    ok(rang.deborde, 'et elle deborde : sept libelles ne tiennent pas dans la largeur de quatre');
    ok(rang.gCache && !rang.dCache,
       'au repos, seule la fleche de DROITE se voit : il n y a rien a gauche, et une fleche qui '
       + 'ne fait rien apprend a ne plus la toucher');

    /* Elle doit VRAIMENT faire defiler : c est le seul moyen d atteindre le
       cinquieme geste sans ecran tactile ni molette horizontale. */
    const apres = await page.evaluate(async () => {
      document.getElementById('acFlecheD').click();
      await new Promise((r) => setTimeout(r, 700));
      const r = document.getElementById('acActions');
      return { x: r.scrollLeft, g: document.getElementById('acFlecheG').hidden };
    });
    console.log('   apres un appui a droite : ' + JSON.stringify(apres));
    ok(apres.x > 0, 'un appui sur la fleche fait defiler la rangee (' + apres.x + ' px)');
    ok(!apres.g, 'et celle de gauche apparait alors : il y a maintenant quelque chose derriere');

    /* ---- LA LISTE DE CE QU ON PEUT BRULER ---- */
    await page.evaluate(() => document.querySelector('[data-va="ecBruler"]').click());
    await page.waitForTimeout(700);
    const liste = await page.evaluate(() => ({
      ecran: (document.querySelector('.wl-ecran.on') || {}).id,
      cles: [...document.querySelectorAll('#brJeton option')].map((o) => o.value),
      adr: (document.getElementById('brAdr') || {}).textContent,
    }));
    console.log('   ' + JSON.stringify(liste));
    ok(liste.ecran === 'ecBruler', 'le geste ouvre son ecran');
    ok(liste.cles.join(',') === 'swoge,swogebet',
       'et il ne propose que ce que ce projet brule (' + liste.cles.join(', ') + ') : envoyer de '
       + 'l ether a l adresse morte ne reduit l offre de rien, ca ne fait que perdre de l argent');
    ok(String(liste.adr).toLowerCase() === MORTE,
       'l adresse est ECRITE en entier, pas a saisir : un champ pre-rempli inviterait a le '
       + 'modifier, et une adresse morte changee d un caractere devient celle de quelqu un');

    /* ---- LA CONFIRMATION N EST PAS SAUTABLE ----
     * `swogeRevue` est a « 0 » : un envoi partirait droit a la signature. */
    const revue = await page.evaluate(() => ({
      envoi: document.getElementById('enPartir').textContent,
      brule: document.getElementById('brPartir').textContent,
    }));
    console.log('   boutons : envoi « ' + revue.envoi + ' » · burn « ' + revue.brule + ' »');
    ok(/Send/.test(revue.envoi),
       'la revue des envois est bien coupee — le bouton d envoi dit « ' + revue.envoi + ' »');

    await page.fill('#brMontant', '250');
    await page.waitForTimeout(400);
    await page.click('#brPartir');
    await page.waitForTimeout(700);
    const feuille = await page.evaluate(() => ({
      ouverte: !document.getElementById('voileRevue').hidden,
      titre: (document.getElementById('rvTitre') || {}).textContent,
      quoi: (document.getElementById('rvQuoi') || {}).textContent,
      ok: (document.getElementById('rvOk') || {}).textContent,
      montant: (document.getElementById('rvMontant') || {}).textContent,
      dest: (document.getElementById('rvDest') || {}).textContent,
    }));
    console.log('   ' + JSON.stringify(feuille));
    ok(feuille.ouverte,
       'bruler ouvre la confirmation MEME quand la revue des envois est coupee : ca ne se '
       + 'rattrape pas, et on ne le fait pas dix fois par jour');
    ok(/burn/i.test(feuille.titre) && /You burn/.test(feuille.quoi),
       'et elle dit « bruler », pas « envoyer » : « ' + feuille.quoi + ' » devant une adresse '
       + 'morte laisserait croire qu on peut la rappeler');
    ok(/Burn forever/.test(feuille.ok), 'le bouton dit ce qu il fait : « ' + feuille.ok + ' »');
    ok(/250/.test(feuille.montant) && /SWOGE/.test(feuille.montant),
       'le montant et le jeton sont repetes (' + feuille.montant + ')');
    ok(String(feuille.dest).replace(/\s/g, '').toLowerCase() === MORTE,
       'avec l adresse morte, en entier');

    /* ---- ET LA TRANSACTION PART VERS L ADRESSE MORTE ---- */
    await page.evaluate(() => { window.__w.envoyees = []; window.__w.bascules = []; });
    await page.click('#rvOk');
    await page.waitForTimeout(4000);
    const env = await page.evaluate(() => window.__w.envoyees.map(
      (x) => ({ to: String(x.to || '').toLowerCase(), data: String(x.data || ''),
                sur: x.surLaChaine })));
    console.log('   signee : ' + JSON.stringify(env));
    ok(env.length === 1, 'une transaction part (' + env.length + ')');
    /* Elle va au CONTRAT du jeton — c est un `transfer` — et c est dans ses
       donnees que l adresse morte apparait. Verifier `to` suffirait pour un
       envoi d ether ; pour un jeton ce serait mesurer le mauvais champ. */
    ok(env.length === 1 && env[0].data.indexOf('a9059cbb') === 2,
       'c est un transfer(address,uint256) (' + env[0].data.slice(0, 10) + ')');
    ok(env.length === 1 && env[0].data.toLowerCase().indexOf(MORTE.slice(2)) > 0,
       'et son destinataire est l adresse morte, lue dans les donnees signees');
    ok(env.length === 1 && env[0].sur === '0x1237',
       'signee sur la Robinhood Chain (' + (env[0] || {}).sur + ')');

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  console.log('\n-- la sortie de chaque ecran --');
  {
    const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 180)));
    await page.addInitScript(() => {
      try { sessionStorage.setItem('swogeWalletIntroVue', '1'); } catch (e) {}
    });
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);

    const etat = await page.evaluate(() => {
      const out = [];
      const ecrans = [...document.querySelectorAll('.wl-ecran')].map((s) => s.id);
      for (const id of ecrans) {
        document.querySelectorAll('.wl-ecran').forEach((s) => s.classList.toggle('on', s.id === id));
        const t = document.querySelector('#' + id + ' .wl-tete');
        /* Une SORTIE, pas une action : un bouton de l en-tete qui change
           d ecran. Relire les soldes ou ouvrir les reglages n en est pas une. */
        const sorties = t ? [...t.querySelectorAll('button[data-va]')].map((b) => b.dataset.va) : [];
        const p = document.getElementById('pied');
        const q = p ? p.getBoundingClientRect() : null;
        out.push({ id, sorties,
                   pied: !!q && q.height > 0 && q.bottom <= innerHeight + 1 && !p.hidden,
                   onglets: p ? [...p.querySelectorAll('button[data-va]')].length : 0 });
      }
      return out;
    });
    console.log('   ' + etat.map((x) => x.id + (x.sorties.length ? ' SORTIE-HAUT' : '')
                                     + (x.pied ? '' : ' SANS-PIED')).join(', '));
    ok(etat.length >= 8, etat.length + ' ecrans releves');
    const avecHaut = etat.filter((x) => x.sorties.length);
    ok(avecHaut.length === 0,
       avecHaut.length === 0
         ? 'aucun ecran ne porte plus de sortie en haut — la barre du bas suffit'
         : 'il en reste : ' + avecHaut.map((x) => x.id).join(', '));
    const sansPied = etat.filter((x) => !x.pied);
    ok(sansPied.length === 0,
       sansPied.length === 0
         ? 'et les ' + etat.length + ' ecrans ont la barre du bas A L ECRAN'
         : 'ENFERME : ' + sansPied.map((x) => x.id).join(', ') + ' n a aucune sortie');
    ok(etat.every((x) => x.onglets >= 4),
       'avec ses onglets, sur chacun (' + etat[0].onglets + ')');

    /* Et elle MARCHE : un onglet doit vraiment ramener. Une barre presente
       mais inerte serait la meme prison, en moins visible. */
    await page.evaluate(() => {
      document.querySelectorAll('.wl-ecran').forEach((s) => s.classList.remove('on'));
      const b = document.querySelector('#pied button[data-va="ecSwap"]'); if (b) b.click();
    });
    await page.waitForTimeout(400);
    const depuisPont = await page.evaluate(() => {
      const b = document.querySelector('#pied button[data-va="ecAccueil"]');
      const avant = (document.querySelector('.wl-ecran.on') || {}).id;
      if (b) b.click();
      return { avant, apres: (document.querySelector('.wl-ecran.on') || {}).id };
    });
    ok(depuisPont.avant === 'ecSwap' && depuisPont.apres === 'ecAccueil',
       'et un appui sur « Home » ramene vraiment (' + depuisPont.avant + ' -> '
       + depuisPont.apres + ')');

    /* Le titre reprend la place laissee : un en-tete vide se remarquerait. */
    const titre = await page.evaluate(() => {
      document.querySelectorAll('.wl-ecran').forEach((s) => s.classList.toggle('on', s.id === 'ecSwap'));
      const h = document.querySelector('#ecSwap .wl-tete h1');
      const t = document.querySelector('#ecSwap .wl-tete');
      return h && t ? { x: Math.round(h.getBoundingClientRect().left - t.getBoundingClientRect().left),
                        txt: h.textContent } : null;
    });
    ok(!!titre && titre.x <= 20,
       'et le titre reprend la place du bouton retire, au bord de l en-tete ('
       + (titre || {}).txt + ' a ' + (titre || {}).x + ' px)');

    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

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

  /* ==========================================================================
   * LE PORTEFEUILLE VERROUILLE, ET LA RECONNEXION QU'ON NE DEVRAIT PAS REFAIRE
   *
   * « A chaque actualisation sur PC, il est oblige de se reconnecter. »
   *
   * Reproduit ici, et la cause n'etait pas la session : elle etait toujours la.
   * MetaMask verrouille rend `eth_accounts` = [] alors que le site reste
   * autorise. La page en concluait « pas connecte », affichait « Tap to sign
   * in », et personne n'ecoutait `accountsChanged` — donc deverrouiller ne
   * changeait rien non plus. Il fallait recliquer. A chaque fois.
   *
   * Trois choses sont verifiees, et les trois manquaient :
   *   1. verrouille se DIT verrouille, et pas « pas connecte » — le geste a
   *      faire n'est pas le meme ;
   *   2. la methode memorisee n'est pas effacee — sinon verrouiller son
   *      portefeuille une fois suffirait a perdre la session pour de bon ;
   *   3. deverrouiller rebranche TOUT SEUL, sans un clic.
   * ====================================================================== */
  {
    console.log('\n-- le portefeuille verrouille --');
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const page = await nav.newPage({ viewport: { width: 1280, height: 1000 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(e.message));
    await page.addInitScript(([moi]) => {
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      window.__ecoutes = {};
      window.__verrou = true;                 // l extension est fermee
      window.ethereum = {
        isMetaMask: true,
        request: async (a) => {
          /* Verrouille : la liste est VIDE, mais le site reste autorise. */
          if (a.method === 'eth_accounts') return window.__verrou ? [] : [moi];
          if (a.method === 'eth_requestAccounts') return [moi];
          if (a.method === 'eth_chainId') return '0x1237';
          if (a.method === 'net_version') return '4663';
          if (a.method === 'wallet_switchEthereumChain') return null;
          return null;
        },
        on: (ev, fn) => { (window.__ecoutes[ev] = window.__ecoutes[ev] || []).push(fn); },
        removeListener: () => {},
      };
      /* Ce que fait l'utilisateur : il ouvre son extension. */
      window.__deverrouille = () => {
        window.__verrou = false;
        (window.__ecoutes.accountsChanged || []).forEach((f) => f([moi]));
      };
    }, [MOI]);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
      const un = (m) => {
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') return enMot(134102000n);
        if (m.method === 'eth_getBalance') return enMot(5000000000000000n);
        if (m.method === 'eth_call') return enMot(1000000000000000000000n);
        return null;
      };
      const rep = (m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) });
      return r.fulfill({ contentType: 'application/json',
                         body: JSON.stringify(Array.isArray(q) ? q.map(rep) : rep(q)) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);

    const ferme = await page.evaluate(() => ({
      nom: document.getElementById('acNom').textContent.trim(),
      role: (document.getElementById('acRole') || {}).textContent.trim(),
      sous: document.getElementById('acSous').textContent.trim(),
      auth: localStorage.getItem('swogeAuth'),
      ecoute: !!(window.__ecoutes.accountsChanged || []).length,
    }));
    console.log('   ' + JSON.stringify(ferme));
    ok(/lock/i.test(ferme.nom),
       'un portefeuille verrouille se dit verrouille, pas « pas connecte » (« ' + ferme.nom + ' »)');
    ok(/unlock/i.test(ferme.role) || /unlock/i.test(ferme.sous),
       'et la page dit le geste a faire : ouvrir son extension, pas se reconnecter');
    ok(ferme.auth === 'wallet',
       'la methode memorisee N EST PAS effacee : verrouiller n est pas se deconnecter');
    ok(ferme.ecoute, 'la page ecoute `accountsChanged` — sans ca, deverrouiller ne servirait a rien');

    /* Il ouvre son extension. Rien d autre. */
    await page.evaluate(() => window.__deverrouille());
    await page.waitForTimeout(1800);
    const ouvert = await page.evaluate(() => ({
      nom: document.getElementById('acNom').textContent.trim(),
      etat: document.getElementById('cpEtat').textContent.trim(),
      adr: (document.getElementById('acAdr') || {}).textContent.trim(),
    }));
    console.log('   ' + JSON.stringify(ouvert));
    ok(!/lock|not connected/i.test(ouvert.nom) && ouvert.adr !== '—',
       'deverrouiller rebranche TOUT SEUL, sans un clic (« ' + ouvert.nom + ' »)');
    ok(ouvert.etat === 'Connected', 'et le compte se dit connecte (« ' + ouvert.etat + ' »)');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ---- ET UNE EXTENSION QUI S'INJECTE EN RETARD ----
   * `reprend()` lisait `window.ethereum` a un instant precis. Une extension
   * arrivee cent millisecondes plus tard n'existait pas encore, et la
   * reconnexion ne se faisait jamais — sans un mot. */
  {
    console.log('\n-- l extension arrive en retard --');
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const page = await nav.newPage({ viewport: { width: 1280, height: 1000 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(e.message));
    await page.addInitScript(([moi]) => {
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      setTimeout(() => {
        window.ethereum = {
          isMetaMask: true,
          request: async (a) => {
            if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
            if (a.method === 'eth_chainId') return '0x1237';
            if (a.method === 'net_version') return '4663';
            return null;
          },
          on: () => {}, removeListener: () => {},
        };
        window.dispatchEvent(new Event('ethereum#initialized'));
      }, 700);
    }, [MOI]);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
      const un = (m) => {
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') return enMot(134102000n);
        if (m.method === 'eth_getBalance') return enMot(5000000000000000n);
        if (m.method === 'eth_call') return enMot(1000000000000000000000n);
        return null;
      };
      const rep = (m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) });
      return r.fulfill({ contentType: 'application/json',
                         body: JSON.stringify(Array.isArray(q) ? q.map(rep) : rep(q)) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3200);
    const v = await page.evaluate(() => ({
      etat: document.getElementById('cpEtat').textContent.trim(),
      adr: (document.getElementById('acAdr') || {}).textContent.trim(),
    }));
    console.log('   ' + JSON.stringify(v));
    ok(v.etat === 'Connected' && v.adr !== '—',
       'la page attend l extension au lieu de conclure qu il n y en a pas (« ' + v.etat + ' »)');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==========================================================================
   * UNE TRANSACTION SUR UNE AUTRE CHAINE NE RESTE PLUS « EN ATTENTE »
   *
   * « J'ai fait ça, ça a réussi, et il y a encore marqué en attente dans
   *   l'historique. » — avec le lien vers une transaction Base, minee.
   *
   * `journalSuit` cherche le recu sur la chaine que l'entree DECLARE, et
   * retombe sur la Robinhood Chain quand elle n'en declare aucune. Sur onze
   * appels a `journalAjoute`, quatre ne la declaraient pas — dont les
   * AUTORISATIONS, qui precedent chaque achat depuis une autre chaine et sont
   * donc signees sur Base. On cherchait leur recu sur la Robinhood Chain, ou
   * il n'existe evidemment pas : l'entree restait « en attente » pour
   * toujours alors que la transaction avait abouti en quinze secondes.
   *
   * Ce qui est verifie ici, c'est la reparation de FOND : la chaine n'est
   * plus a declarer, elle est LUE sur le signataire. Une entree ecrite sans
   * chaine — le cas exact du bug — doit donc se resoudre quand meme, et la
   * chaine doit etre ECRITE dans le journal pour qu'un rechargement ne
   * reparte pas de zero.
   * ====================================================================== */
  {
    console.log('\n-- une transaction signee sur une autre chaine se resout --');
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const H = '0x' + 'ba5e'.repeat(16);
    const page = await nav.newPage({ viewport: { width: 1280, height: 1000 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(e.message));
    await page.addInitScript(([moi, h]) => {
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      /* Une entree DEJA en attente, sans chaine declaree : c'est exactement
         ce que le bug laissait sur l'appareil. */
      try {
        localStorage.setItem('swogeTx:' + moi.toLowerCase(), JSON.stringify([{
          h, k: 'autorisation', cle: 'eth', montant: '1000000000000000',
          etat: 'attente', t: Date.now() - 60000 }]));
      } catch (e) {}
      /* Le portefeuille est sur BASE, comme au moment de l'autorisation. */
      window.ethereum = {
        isMetaMask: true,
        request: async (a) => {
          if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
          if (a.method === 'eth_chainId') return '0x2105';       // 8453, Base
          if (a.method === 'net_version') return '8453';
          return null;
        },
        on: () => {}, removeListener: () => {},
      };
    }, [MOI, H]);
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.route('**/api.dexscreener.com/**', (r) => r.fulfill({
      contentType: 'application/json', body: '{"pairs":[]}' }));
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    /* ---- LA ROBINHOOD CHAIN NE CONNAIT PAS CETTE TRANSACTION ----
     * Et c'est le coeur du bug : elle repond « aucun recu », pour toujours. */
    let rhVu = 0;
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const un = (m) => {
        if (m.method === 'eth_getTransactionReceipt') { rhVu++; return null; }
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') return enMot(134102000n);
        if (m.method === 'eth_getBalance') return enMot(5000000000000000n);
        if (m.method === 'eth_call') return enMot(1000000000000000000000n);
        return null;
      };
      const rep = (m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) });
      return r.fulfill({ contentType: 'application/json',
                         body: JSON.stringify(Array.isArray(q) ? q.map(rep) : rep(q)) });
    });
    /* ---- ET LES AUTRES CHAINES REPONDENT « JE NE CONNAIS PAS » ----
     * Sans elles, `chercheLeRecuPartout` attendrait douze secondes par chaine
     * sur des noeuds injoignables, et l'essai mesurerait sa propre patience
     * plutot que la recherche. */
    await page.route(/publicnode\.com|drpc\.org|llamarpc|ankr/, (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const rep = (m) => ({ jsonrpc: '2.0', id: m.id, result: null });
      return r.fulfill({ contentType: 'application/json',
                         body: JSON.stringify(Array.isArray(q) ? q.map(rep) : rep(q)) });
    });
    /* Base, elle, l'a minee — c'est la verite de la chaine. Cette route est
       posee APRES celle qui couvre publicnode : Playwright donne la main a la
       DERNIERE posee, et `base-rpc.publicnode.com` tombe dans les deux. */
    let baseVu = 0;
    await page.route(/base-rpc|mainnet\.base/, (r) => {
      const q = JSON.parse(r.request().postData() || '{}');
      const un = (m) => {
        if (m.method === 'eth_getTransactionReceipt') {
          baseVu++;
          return { transactionHash: H, blockNumber: '0x1312d00', status: '0x1',
                   logs: [], gasUsed: '0x5208', cumulativeGasUsed: '0x5208',
                   blockHash: '0x' + '2'.repeat(64), transactionIndex: '0x0',
                   from: MOI, to: MOI, contractAddress: null, logsBloom: '0x' + '0'.repeat(512),
                   type: '0x2', effectiveGasPrice: '0x1' };
        }
        if (m.method === 'eth_chainId') return '0x2105';
        if (m.method === 'net_version') return '8453';
        if (m.method === 'eth_blockNumber') return '0x1312d00';
        if (m.method === 'eth_getBalance') return enMot(0n);
        if (m.method === 'eth_call') return enMot(0n);
        return null;
      };
      const rep = (m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) });
      return r.fulfill({ contentType: 'application/json',
                         body: JSON.stringify(Array.isArray(q) ? q.map(rep) : rep(q)) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const j = await page.evaluate((moi) => {
      try { return JSON.parse(localStorage.getItem('swogeTx:' + moi.toLowerCase()) || '[]'); }
      catch (e) { return []; }
    }, MOI);
    const e = j[0] || {};
    console.log('   ' + JSON.stringify({ etat: e.etat, sur: e.sur, base: baseVu }));
    ok(baseVu > 0,
       'le recu est demande a BASE, la chaine ou la transaction a ete signee ('
       + baseVu + ' demande(s))');
    ok(e.sur === 8453,
       'et la chaine est ECRITE dans le journal (' + e.sur + ') : un rechargement ne repart '
       + 'plus sans elle, ce qui ramenait le bug une visite plus tard');
    ok(e.etat === 'reussi',
       'l entree passe a « reussi » (« ' + e.etat + ' ») — elle restait « en attente » pour '
       + 'toujours alors que la transaction avait abouti');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  /* ==========================================================================
   * LES SIGNAUX : MONTRER SANS POUSSER
   *
   * « On voit les cryptos que la colonie a tradees mais on n'est pas oblige
   *   d'acheter — on voit les signaux et on peut acheter en direct
   *   facilement. »
   *
   * Les deux moities de cette phrase se contredisent si on les traite mal, et
   * c'est ce que cet essai tient :
   *
   *   — « pas oblige » : les parts d'achat ne se voient PAS tant qu'on n'a pas
   *     ouvert la ligne, et la page dit que la colonie joue du papier. Un
   *     bouton d'achat pose a cote d'un chiffre vert est une machine a sous.
   *
   *   — « facilement » : un geste suffit ensuite, et il amene sur l'ecran
   *     d'echange DEJA rempli — pas sur un second moteur d'achat qui finirait
   *     par ne plus coter comme le premier.
   * ====================================================================== */
  {
    console.log('\n-- les signaux de la colonie --');
    const MOI = '0x00000000000000000000000000000000000a11ce';
    const TOK = '0x1111111111111111111111111111111111111111';
    /* La position porte un logo ET son pool ; le signal passe n'a ni l'un ni
       l'autre. Les deux cas comptent : un jeton de sept minutes n'a souvent
       aucune image, et c'est le cas ou l'ecran doit rester honnete. */
    const POOL = '0xaaaabbbbccccddddeeeeffff0000111122223333';
    const VUE = { trades: 12, positions: [{ sym: 'PEPE2', adr: TOK, latent: 34.7,
                    mcAchat: 21000, mcMaintenant: 29500, veilleT: Date.now() - 20000,
                    score: 86, liens: [], pool: POOL,
                    logo: 'https://dd.dexscreener.com/ds-data/tokens/robinhood/pepe2.png' }],
                  signaux: [{ k: 'vente', sym: 'WOOF', r: -12.4, t: Date.now() - 600000,
                              adr: '0x2222222222222222222222222222222222222222' }] };
    const page = await nav.newPage({ viewport: { width: 430, height: 1000 } });
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 160)));
    await page.addInitScript((moi) => {
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      window.ethereum = { isMetaMask: true,
        request: async (a) => {
          if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
          if (a.method === 'eth_chainId') return '0x1237';
          if (a.method === 'net_version') return '4663';
          return null;
        }, on: () => {}, removeListener: () => {} };
    }, MOI);
    /* Un PNG de 1x1, transparent : le plus petit fichier qui charge vraiment. */
    const PIXEL = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9'
      + 'awAAAABJRU5ErkJggg==', 'base64');
    const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
      if (/ai\/colonie/.test(r.request().url()))
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(VUE) });
      /* ---- L'IMAGE DOIT REELLEMENT ARRIVER ----
       * Tout ce qui n'est pas notre serveur est coupe ici. Le logo l'etait
       * donc aussi — et la page fait exactement ce qu'elle doit faire d'une
       * image qui ne charge pas : elle la retire pour laisser voir les trois
       * lettres. L'essai mesurait alors son propre coupe-circuit, pas la
       * page. On sert un vrai pixel : le comportement de repli, lui, est
       * mesure juste apres, sur une adresse qu'on coupe expres. */
      if (/dd\.dexscreener\.com/.test(r.request().url()))
        return r.fulfill({ contentType: 'image/png', body: PIXEL });
      if (r.request().method() !== 'POST') return r.abort();
      let q = {}; try { q = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
      const un = (m) => {
        if (m.method === 'eth_chainId') return '0x1237';
        if (m.method === 'net_version') return '4663';
        if (m.method === 'eth_blockNumber') return '0x2f7ce78';
        if (m.method === 'eth_getLogs') return [];
        if (m.method === 'eth_gasPrice') return enMot(134102000n);
        if (m.method === 'eth_getBalance') return enMot(500000000000000000n);
        if (m.method === 'eth_call') {
          const d = (m.params && m.params[0] && m.params[0].data) || '';
          if (d.startsWith('0x313ce567')) return enMot(18n);
          if (d.startsWith('0x95d89b41') || d.startsWith('0x06fdde03')) {
            const t = 'PEPE2', h = Buffer.from(t).toString('hex');
            return '0x' + (32).toString(16).padStart(64, '0')
                 + t.length.toString(16).padStart(64, '0') + h.padEnd(64, '0');
          }
          if (d.startsWith('0x18160ddd')) return enMot(1000000000000000000000000n);
          if (d.startsWith('0x70a08231')) return enMot(1234000000000000000000n);
          return enMot(0n);
        }
        return null;
      };
      const f = (m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) });
      return r.fulfill({ contentType: 'application/json',
                         body: JSON.stringify(Array.isArray(q) ? q.map(f) : f(q)) });
    });
    await page.route('**/ethers*.umd.min.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));
    await page.goto('http://127.0.0.1:' + port + '/swoge_wallet.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    await page.evaluate(() => document.querySelector('[data-va="ecSignaux"]').click());
    await page.waitForTimeout(2200);

    const v = await page.evaluate(() => ({
      n: document.querySelectorAll('#sgListe .sg').length,
      sous: (document.querySelector('#sgListe .sg .sg-tx small') || {}).textContent || '',
      r: (document.querySelector('#sgListe .sg .sg-r') || {}).textContent || '',
      partsVues: document.querySelector('#sgListe .sg-parts').offsetParent !== null,
      papier: /paper/i.test(document.getElementById('ecSignaux').textContent),
      conseil: /not advice/i.test(document.getElementById('ecSignaux').textContent),
    }));
    console.log('   ' + JSON.stringify(v));
    ok(v.n === 2, 'les positions ouvertes ET les signaux passes sont listes (' + v.n + ')');
    ok(/21,000/.test(v.sous) && /29,500/.test(v.sous),
       'la capitalisation d ACHAT et celle du MOMENT sont montrees ensemble — c est leur '
       + 'ecart qui dit quelque chose (« ' + v.sous + ' »)');
    ok(/\+34\.7%/.test(v.r), 'avec le gain latent (« ' + v.r.replace(/\s+/g, ' ') + ' »)');
    ok(v.papier && v.conseil,
       'et la page DIT que la colonie joue du papier, et que ce n est pas un conseil');
    ok(v.partsVues === false,
       'les parts d achat ne se voient PAS avant d avoir ouvert la ligne : un bouton pose a '
       + 'cote d un chiffre vert se lit comme une machine a sous');

    /* ==================================================================
     * LE LOGO, ET OU IL MENE
     *
     * « Ce serait bien que dans les signaux du portefeuille tu affiches le
     *   logo de la crypto ; si on clique dessus ca ouvre une nouvelle page
     *   vers DexScreener et la crypto concernee. »
     *
     * Trois choses se mesurent ici, et la troisieme est celle qu'on aurait
     * ratee : le logo est bien l'image du jeton ; le lien mene a DexScreener
     * dans un nouvel onglet ; et le clic dessus n'OUVRE PAS la ligne au
     * passage — le meme geste ferait alors deux choses, dont une que
     * personne n'a demandee.
     * ================================================================== */
    const lg = await page.evaluate(() => {
      const l = document.querySelectorAll('#sgListe .sg-logo');
      const a = l[0], b = l[1];
      const img = a.querySelector('img');
      return {
        n: l.length,
        aEstLien: a.tagName, href: a.getAttribute('href') || '',
        cible: a.getAttribute('target') || '', rel: a.getAttribute('rel') || '',
        src: img ? img.getAttribute('src') : null,
        /* Le monogramme est TOUJOURS la, sous l'image : c'est lui qui reste
           quand le fichier a disparu. */
        mono: a.textContent.trim(),
        /* Le second signal n'a ni logo ni pool : il ne doit pas porter
           d'image, mais il garde un lien — la recherche par adresse existe
           toujours. */
        bImg: !!b.querySelector('img'), bHref: b.getAttribute('href') || '',
      };
    });
    console.log('   ' + JSON.stringify(lg));
    ok(lg.n === 2 && lg.aEstLien === 'A',
       'chaque signal porte une pastille, et elle est un lien');
    ok(/dexscreener\.com/.test(lg.href) && /aaaabbbb/.test(lg.href),
       'qui mene a DexScreener, sur la PAIRE du jeton concerne (« ' + lg.href + ' »)');
    ok(lg.cible === '_blank' && /noopener/.test(lg.rel),
       'dans un nouvel onglet, et sans donner la main sur le portefeuille a la page ouverte');
    ok(/dd\.dexscreener\.com/.test(lg.src || ''),
       'l image est celle que le serveur a LUE, pas une devinee depuis l adresse');

    /* ---- ET UNE IMAGE MORTE NE LAISSE PAS UN ROND VIDE ----
     * Une adresse peut etre valide et le fichier avoir disparu depuis. On
     * pose une adresse qui ne repondra pas : l'image doit se retirer d'elle
     * meme et laisser voir les trois lettres qui sont dessous. C'est le seul
     * cas ou l'ecran pourrait mentir en silence — un cadre vide se lit comme
     * une image qui charge encore. */
    const casse = await page.evaluate(() => {
      const a = document.querySelector('#sgListe .sg-logo');
      const img = a.querySelector('img');
      img.src = 'https://dd.dexscreener.com/ce-fichier-nexiste-plus.png';
      return new Promise((res) => setTimeout(() => res({
        img: !!a.querySelector('img'), mono: a.textContent.trim() }), 600));
    });
    console.log('   image morte : ' + JSON.stringify(casse));
    ok(casse.img === false && /^PEP/.test(casse.mono),
       'une image qui ne charge pas se retire, et les trois lettres reapparaissent');
    ok(/^PEP/.test(lg.mono),
       'et les trois lettres restent dessous : quand le fichier a disparu, il reste quelque '
       + 'chose plutot qu un rond vide');
    ok(lg.bImg === false && /dexscreener\.com\/search/.test(lg.bHref),
       'un jeton sans logo n en invente pas un, et son lien passe par la recherche — la page '
       + 'd une paire qu on ne connait pas dirait « token not found »');

    /* ---- ET LE CLIC SUR LE LOGO NE REPLIE RIEN ----
     * La ligne s'ouvre au toucher de son en-tete, et le logo est dedans. Sans
     * la sortie posee dans le gestionnaire, le meme clic ouvrirait DexScreener
     * ET replierait la ligne derriere : on revient sur un portefeuille qui a
     * bouge tout seul. */
    const avant = await page.evaluate(() =>
      document.querySelector('#sgListe .sg').classList.contains('ouvert'));
    await page.evaluate(() => {
      const a = document.querySelector('#sgListe .sg-logo');
      /* On empeche la navigation : ce qu'on mesure est l'etat de la ligne,
         pas la page de DexScreener. */
      a.addEventListener('click', (e) => e.preventDefault(), { once: true });
      a.click();
    });
    await page.waitForTimeout(200);
    const apresLogo = await page.evaluate(() =>
      document.querySelector('#sgListe .sg').classList.contains('ouvert'));
    ok(avant === apresLogo,
       'un clic sur le logo laisse la ligne dans l etat ou elle etait (' + apresLogo + ')');

    await page.evaluate(() => document.querySelector('#sgListe .sg-h').click());
    await page.waitForTimeout(300);
    ok(await page.evaluate(() =>
         document.querySelector('#sgListe .sg-parts').offsetParent !== null),
       'un geste les ouvre — « pas oblige » ne doit pas vouloir dire « difficile »');

    await page.evaluate(() => [...document.querySelectorAll('#sgListe .sg-parts button')]
      .find((b) => b.textContent === '30%').click());
    await page.waitForTimeout(2500);
    const ap = await page.evaluate(() => ({
      ecran: [...document.querySelectorAll('.wl-ecran')]
        .filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id)[0],
      de: document.getElementById('swDe').value,
      vers: document.getElementById('swVers').value,
      montant: document.getElementById('swMontant').value,
    }));
    console.log('   apres 30% : ' + JSON.stringify(ap));
    ok(ap.ecran === 'ecSwap',
       'l achat amene sur l ECHANGE, pas sur un second moteur : celui-la sait deja coter, '
       + 'montrer l impact et faire relire avant de signer');
    ok(ap.de === 'eth' && /1111111111/.test(ap.vers),
       'avec le jeton du signal en arrivee et l ether au depart');
    ok(parseFloat(ap.montant) > 0.14 && parseFloat(ap.montant) < 0.16,
       '30 % du solde sont deja poses (' + ap.montant + ' sur 0.5) — il reste le dernier '
       + 'geste, et il est au joueur');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.close();
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})();
