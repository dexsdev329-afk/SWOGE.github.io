'use strict';
/* ============================================================================
 * LE CHOIX DU COFFRE, PAGE PAR PAGE — de bout en bout, par de vrais clics.
 *
 * coffre.test.js prouve le module (coffre.js) dans un harnais nu. Ce banc-ci
 * prouve ce qui compte pour le joueur : sur CHAQUE jeu de casino, le message
 * d'ouverture de mise qui part vraiment de la page porte le bon `jeton`.
 *
 * Le serveur fait foi (il revalide tout, sur ws.addr, et fige le jeton a
 * l'ouverture) : on ne teste donc ici que la promesse de l'interface, avec
 * un faux serveur WebSocket pose AVANT tout script de la page.
 *
 *   S1  balance 500, betBalance 0   : rien a choisir — le selecteur est monte
 *       mais cache, et le geste part avec jeton 'swoge'.
 *   S2  balance 0, betBalance 500   : le selecteur se voit ; on clique
 *       $SWOGEBET ; le geste n'est PAS bloque par la page (un joueur a zero
 *       $SWOGE mais 500 $SWOGEBET doit pouvoir miser) et part avec 'swogebet'.
 *   S3  balance 500, betBalance 500, sans choix : par defaut, 'swoge'.
 *
 * Seuls les messages d'OUVERTURE portent le jeton (spin, volcanoSpin, ...,
 * minesStart) : les suites (bj_hit, hiloStep, crashCashOut...) relisent le
 * jeton fige par le serveur, et n'en portent pas.
 *
 * Le Boulier est exclu volontairement (cagnotte partagee en $SWOGE).
 *
 * La table de blackjack de SWOGE World (nexus.html, peinte par nexus.js) est
 * le dixieme cas. On s'y rend EN MARCHANT, comme blackjack_page.test.js : un
 * panneau ouvert en trichant ne prouverait pas que le joueur y arrive. Elle a
 * un scenario de plus :
 *   S4  auth porte une main OUVERTE ailleurs (swoge_blackjack.html), en
 *       $SWOGEBET : la table l'affiche et la laisse finir — Hit et Stand
 *       presents, aucun bj_bet (le serveur repondrait « hand in progress »),
 *       et Hit part SANS jeton (le serveur relit celui fige a la mise).
 *       Pendant la main, la pastille pressee est celle de la main (st.jeton),
 *       pas le choix local. La main finie, la rangee de Deal nomme le coffre
 *       de la PROCHAINE mise (le choix local), meme quand la banniere parle
 *       en $SWOGEBET — le solde et le selecteur, eux, sont sous le pli.
 *
 * Usage : node casino_coffre_pages.test.js [page.html ...]   (sans argument : les 10)
 * ==========================================================================*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const SITE = __dirname;
const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const NOM = 'casino_coffre_pages.test.js';
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
            '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
            '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.webm': 'video/webm', '.mp4': 'video/mp4' };

const ADR = '0x00000000000000000000000000000000000000a1';

/* ---------------------------------------------------------------------------
 * LA TABLE DES PAGES. Un geste = une suite de clics qui finit par envoyer UN
 * message d'ouverture. Les selecteurs sont ceux des pages (lus le 08/10/2026).
 *   type    : le message d'ouverture attendu
 *   etapes  : selecteurs a cliquer, dans l'ordre
 *   champs  : champs supplementaires que le message doit porter (ex. game)
 *   solde   : le solde « plein » du scenario quand 500 ne paie pas le geste
 *             (achat du bonus Bonanza : 100 x la mise minimale = 1 000)
 *   statique: { motif } quand le geste est impossible a declencher en E2E —
 *             on verifie alors dans le source que l'envoi porte `jeton`.
 * ------------------------------------------------------------------------- */
const JETON25 = (rail) => rail + ' button[data-v="25"]';
const PAGES = {
  'swoge_smash.html': [
    { type: 'spin', etapes: ['#smashBtn'] },
  ],
  'swoge_spin.html': [
    { type: 'volcanoSpin', etapes: ['#spin-btn'] },
    /* 33 x la mise (10) = 330 : payable avec 500 */
    { type: 'volcanoBuyBonus', etapes: ['#buy-bonus'] },
  ],
  'plinko.html': [
    /* un jeton de 25 (le minimum de table est 10), puis lacher */
    { type: 'plinkoDrop', etapes: [JETON25('#plRail'), '#plDrop'] },
  ],
  'swoge_chenil.html': [
    /* la mise d'entree (le plus petit cran) est posee a l'auth */
    { type: 'chenilSpin', etapes: ['#chSpin'] },
  ],
  'swoge_dod.html': [
    { type: 'dodSpin', etapes: ['#ddSpin'] },
    /* le cran le moins cher (wild, 1,71 x la mise) */
    { type: 'dodAchat', etapes: ['#ddAchats .dd-a[data-cran="wild"]'], champs: { cran: 'wild' } },
  ],
  'swoge_bonanza.html': [
    { type: 'bonanzaSpin', etapes: ['#bzSpin'] },
    { type: 'bonanzaAchat', etapes: ['#bzAchat'], solde: 5000 },
  ],
  'swoge_blackjack.html': [
    { type: 'bj_bet', etapes: ['#dealBtn'] },
  ],
  'crash.html': [
    /* la manche est en phase 'attente' (posee par le faux serveur) */
    { type: 'crashBet', etapes: [JETON25('#crRail'), '#crBet'] },
  ],
  /* La table de SWOGE World. `avant` l'ouvre en marchant ; `libelle` est la
     ligne de solde, qui doit nommer le coffre ACTIF ; `vue` reprend le
     telephone de blackjack_page.test.js, ou la marche jusqu'a la table est
     mesuree. */
  'nexus.html': [
    { nom: 'bj_bet (table du monde)', type: 'bj_bet', etapes: ['#nxBjVoile [data-bj="deal"]'],
      vue: { viewport: { width: 412, height: 780 }, isMobile: true, hasTouch: true },
      avant: ouvreTableMonde, libelle: '#nxBjVoile .nxbj-solde', repriseMain: true,
      /* le libelle « Stake from » doit se lire sur la carte sombre */
      lisible: true,
      /* le coffre de la prochaine mise, nomme dans la rangee de Deal */
      de: '#nxBjVoile .nxbj-de' },
  ],
  'swoge_casino.html': [
    { nom: 'casinoDeal holdem', type: 'casinoDeal', champs: { game: 'holdem' },
      etapes: ['#caPick [data-g="holdem"]', JETON25('#caRail'), '#caSpots [data-spot="ante"]', '#caActs [data-act="deal"]'] },
    { nom: 'casinoDeal three', type: 'casinoDeal', champs: { game: 'three' },
      etapes: ['#caPick [data-g="three"]', JETON25('#caRail'), '#caSpots [data-spot="ante"]', '#caActs [data-act="deal"]'] },
    /* Hi-Lo et Mines n'ont pas de case : le jeton s'ajoute directement a la mise */
    { type: 'hiloStart', etapes: ['#caPick [data-g="hilo"]', JETON25('#caRail'), '#caActs [data-act="deal"]'] },
    { type: 'minesStart', etapes: ['#caPick [data-g="mines"]', JETON25('#caRail'), '#caActs [data-act="deal"]'] },
  ],
};

const SCENARIOS = [
  { id: 'S1', b: 500, bb: 0, choisit: false, jeton: 'swoge', selecteur: 'cache' },
  { id: 'S2', b: 0, bb: 500, choisit: true, jeton: 'swogebet', selecteur: 'visible' },
  { id: 'S3', b: 500, bb: 500, choisit: false, jeton: 'swoge', selecteur: 'visible' },
];

/* ---------------------------------------------------------------------------
 * CE QUE LE SERVEUR ENVOIE A L'AUTH, au-dela du solde. On le prend au moteur
 * du serveur quand le depot est la (bornes, baremes, tables de gain : la page
 * en a besoin pour afficher le jeu — sans `chenilBareme`, le Chenil croit le
 * serveur trop ancien et refuse de jouer). Sinon, un repli minimal.
 * ------------------------------------------------------------------------- */
function extrasDuServeur() {
  try {
    if (!fs.existsSync(path.join(SERVEUR, 'game.js'))) throw new Error('depot du serveur absent');
    if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'coffre-pages-'));
    const { Game } = require(path.join(SERVEUR, 'game'));
    const cfg = require(path.join(SERVEUR, 'config'));
    const g = new Game();
    return {
      source: 'moteur du serveur',
      x: {
        casinoPay: require(path.join(SERVEUR, 'casino')).PAY,
        casinoMin: cfg.CASINO_MIN_BET, casinoMax: cfg.CASINO_MAX_BET,
        bjMin: cfg.BJ_MIN_BET, bjMax: cfg.BJ_MAX_BET, bjSideMax: cfg.BJ_SIDE_MAX_BET,
        bjPay: { pp: cfg.BJ_PP_PAY, tp: cfg.BJ_213_PAY, ins: cfg.BJ_INS_PAY },
        hiloEdgeBps: cfg.HILO_EDGE_BPS, minesEdgeBps: cfg.MINES_EDGE_BPS,
        minesDefaut: cfg.MINES_DEFAUT, minesChoix: cfg.MINES_CHOIX, minesBareme: g.minesBareme(),
        bonanzaBareme: g.bonanzaBareme(), dodBareme: g.dodBareme(), chenilBareme: g.chenilBareme(),
        plinkoBaremes: g.plinkoBaremes(), plinkoRangees: cfg.PLINKO_RANGEES,
        plinkoRisque: cfg.PLINKO_RISQUE, plinkoEdgeBps: cfg.PLINKO_EDGE_BPS,
        crash: g.crashEtat(Date.now(), ADR),
        bj: null, casino: null, hilo: null, mines: null, volcano: { meter: 0 },
      },
    };
  } catch (e) {
    return { source: 'repli (' + e.message + ')', x: { casinoMin: 10, casinoMax: 10000, bjMin: 1, bjMax: 100000,
      crash: { phase: 'attente', min: 10, max: 10000 }, bj: null, casino: null, hilo: null, mines: null } };
  }
}

/* La manche du Crash doit etre OUVERTE aux mises : on force la phase
   'attente', avec un long compte a rebours, sur la base de l'etat du moteur. */
function crashOuvert(c) {
  return Object.assign({}, c || {}, { phase: 'attente', manche: 1, multi: 1, reste: 120000, joueurs: [], moi: null, point: null });
}

/* ---------------------------------------------------------------------------
 * LE FAUX SERVEUR, pose dans la page avant tout script. stakebubble.min.js
 * enveloppe ensuite window.WebSocket (« var Native = window.WebSocket ») :
 * notre classe devient Native, et l'enveloppe rend l'objet que `new` lui
 * donne — c'est donc bien notre instance qui arrive a la page. On repond a
 * TOUTES les sockets ouvertes.
 * ------------------------------------------------------------------------- */
function fauxServeur(cfg) {
  try { localStorage.removeItem('swogeCoffre'); localStorage.setItem('swogeSession', 's1'); } catch (e) {}
  window.__sent = []; window.__socks = []; window.__auths = 0;
  class FauxWS extends EventTarget {
    constructor(url, protos) {
      super();
      this.url = String(url); this.protocol = ''; this.extensions = ''; this.binaryType = 'blob';
      this.readyState = 0; this.bufferedAmount = 0;
      this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
      this.__i = window.__socks.push(this) - 1;
      setTimeout(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        this._emet('open', new Event('open'));
        this._recoit({ type: 'hello', loginNonce: 'n1' });
      }, 5);
    }
    _emet(t, ev) {
      this.dispatchEvent(ev);
      const h = this['on' + t];
      if (typeof h === 'function') { try { h.call(this, ev); } catch (e) { setTimeout(() => { throw e; }); } }
    }
    _recoit(o) {
      if (this.readyState !== 1) return;
      this._emet('message', new MessageEvent('message', { data: JSON.stringify(o) }));
    }
    send(d) {
      if (this.readyState === 0) throw new DOMException('Still in CONNECTING state.', 'InvalidStateError');
      if (this.readyState !== 1) return;
      let m; try { m = JSON.parse(d); } catch (e) { m = { brut: String(d) }; }
      window.__sent.push({ s: this.__i, m });
      const r = (o) => setTimeout(() => this._recoit(o), 5);
      if (m.type === 'resume' || m.type === 'login') {
        window.__auths++;
        r(Object.assign({}, cfg.extras, cfg.auth || {}, {
          type: 'auth', address: cfg.adr, balance: String(cfg.b), betBalance: String(cfg.bb),
          session: 's1', fairness: { serverSeedHash: '00', nonce: 0 },
        }));
      } else if (m.type === 'betBalance') r({ type: 'betBalance', betBalance: String(cfg.bb) });
      else if (m.type === 'balance') r({ type: 'balance', balance: String(cfg.b) });
      else if (m.type === 'crashState' && cfg.extras.crash) r(Object.assign({}, cfg.extras.crash, { type: 'crash' }));
    }
    close() {
      if (this.readyState >= 2) return;
      this.readyState = 3;
      setTimeout(() => this._emet('close', new CloseEvent('close', { code: 1000, wasClean: true })), 0);
    }
  }
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k, i) => {
    Object.defineProperty(FauxWS, k, { value: i });
    Object.defineProperty(FauxWS.prototype, k, { value: i });
  });
  window.WebSocket = FauxWS;
}

/* Un vrai clic d'abord (Playwright attend que l'element soit visible, stable
   et actif). S'il ne vient pas — element anime, recouvert —, on force ; en
   dernier recours, element.click(). Un bouton DESACTIVE ne recoit le clic
   par aucun des trois chemins : un geste bloque par la page reste bloque. */
async function clique(page, sel) {
  try { await page.click(sel, { timeout: 1500 }); return 'clic'; } catch (e) {}
  try { await page.click(sel, { timeout: 800, force: true }); return 'force'; } catch (e) {}
  const r = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return 'absent'; e.click(); return 'js'; }, sel);
  return r;
}

/* ---------------------------------------------------------------------------
 * ALLER A LA TABLE DE SWOGE WORLD, en marchant — la voie de
 * blackjack_page.test.js : on espionne drawImage pour lire OU est la table
 * (obj_bj_table) et OU est le joueur (le sprite 256 -> 150), puis on marche
 * vers elle aux fleches jusqu'a ce que le voile s'ouvre.
 * ------------------------------------------------------------------------- */
async function ouvreTableMonde(p) {
  await p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionT) return;
    C.__espionT = true;
    window.__moi = null; window.__table = null;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      if (u.indexOf('obj_bj_table') >= 0 && arguments.length >= 5) {
        window.__table = { x: arguments[1] + arguments[3] / 2, y: arguments[2] + arguments[4] };
      }
      if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
          && arguments[7] === 150 && arguments[8] === 150) {
        window.__moi = { x: Math.round(arguments[5] + 75), y: Math.round(arguments[6] + 130) };
      }
      return di.apply(this, arguments);
    };
  });
  const marche = async (t, ms) => {
    await p.keyboard.down(t); await p.waitForTimeout(ms);
    await p.keyboard.up(t); await p.waitForTimeout(180);
  };
  const ouvert = () => p.evaluate(() => {
    const v = document.getElementById('nxBjVoile');
    return !!v && v.classList.contains('on');
  });
  for (let k = 0; k < 40 && !(await ouvert()); k++) {
    const v = await p.evaluate(() => ({ moi: window.__moi, t: window.__table }));
    if (!v.moi || !v.t) { await marche('ArrowDown', 200); continue; }
    const ex = v.t.x - v.moi.x, ey = v.t.y - v.moi.y;
    if (Math.abs(ex) < 70 && Math.abs(ey) < 70) { await p.waitForTimeout(600); continue; }
    if (Math.abs(ex) > Math.abs(ey)) await marche(ex > 0 ? 'ArrowRight' : 'ArrowLeft', 320);
    else await marche(ey > 0 ? 'ArrowDown' : 'ArrowUp', 320);
  }
  /* le voile a une transition d'opacite : on laisse le panneau se poser */
  await p.waitForTimeout(300);
  return ouvert();
}

/* Une main ouverte AILLEURS, telle que `auth` la renvoie (game.js _bjPublic) :
   donnee en $SWOGEBET, le joueur doit encore jouer. */
const MAIN_OUVERTE = {
  bet: 10, doubled: false, stage: 'player',
  player: { cards: [5, 20], value: 14 }, dealer: { cards: [9], value: 10, hidden: true },
  canDouble: true, result: null, payout: 0,
  annexes: { pp: { mise: 0, rang: null, gain: 0 }, tp: { mise: 0, rang: null, gain: 0 }, ins: { mise: 0, rang: null, gain: 0 } },
  insuranceMax: 0, jeton: 'swogebet', balance: '500', betBalance: '490',
  fairness: { serverSeedHash: '00', nonce: 1 },
};

const etatSelecteur = (page) => page.evaluate(() => {
  const b = document.querySelector('.coffre-choix');
  return b ? getComputedStyle(b).display : 'absent';
});

/* Contraste du libelle « Stake from » sur le fond qu'il a REELLEMENT : les
   fonds des ancetres sont composes de haut en bas (blanc du canevas
   d'abord), puis la couleur du texte, avec son opacite et celle des
   ancetres, est posee dessus. Rapport WCAG des luminances relatives. */
const contrasteLibelle = (page) => page.evaluate(() => {
  const lab = document.querySelector('.coffre-choix .cf-lab');
  if (!lab) return null;
  const rgba = (s) => { const n = (s.match(/[\d.]+/g) || []).map(Number); return [n[0] || 0, n[1] || 0, n[2] || 0, n.length > 3 ? n[3] : 1]; };
  const sur = (h, b, a) => [0, 1, 2].map((i) => h[i] * a + b[i] * (1 - a));
  const chaine = [];
  for (let e = lab; e && e.nodeType === 1; e = e.parentElement) chaine.unshift(e);
  let fond = [255, 255, 255], op = 1;
  for (const e of chaine) {
    const cs = getComputedStyle(e);
    op *= parseFloat(cs.opacity);
    if (e === lab) break;
    const c = rgba(cs.backgroundColor);
    if (c[3] > 0) fond = sur(c, fond, c[3]);
  }
  const t = rgba(getComputedStyle(lab).color);
  const texte = sur(t, fond, t[3] * op);
  const lum = (c) => { const l = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const a = lum(texte), b = lum(fond);
  const f = (c) => 'rgb(' + c.map(Math.round).join(',') + ')';
  return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), texte: f(texte), fond: f(fond) };
});

const dernierToast = (page) => page.evaluate(() => {
  const t = document.querySelector('#toast, #g-toast');
  return t ? (t.textContent || '').trim().slice(0, 90) : '';
});

/* Le motif statique : l'objet envoye pour ce type contient-il `jeton` ? */
function verifStatique(page, g) {
  const src = fs.readFileSync(path.join(SITE, page), 'utf8');
  const re = new RegExp('send\\(\\{\\s*type\\s*:\\s*["\']' + g.type + '["\'][^}]*\\}', 'g');
  const envois = src.match(re) || [];
  ok(envois.length > 0, page + ' ' + (g.nom || g.type) + ' [statique] l envoi existe dans le source (' + envois.length + ')');
  ok(envois.length > 0 && envois.every((s) => /\bjeton\s*:/.test(s)),
     page + ' ' + (g.nom || g.type) + ' [statique] chaque envoi porte jeton' + (g.statique.pourquoi ? ' — ' + g.statique.pourquoi : ''));
}

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); console.log('\n' + NOM + ' : ' + n + ' verifications, ' + rates + ' RATE(S)'); return; }

  const demandees = process.argv.slice(2).map((a) => path.basename(a));
  for (const d of demandees) if (!PAGES[d]) { console.log('page inconnue : ' + d + ' (connues : ' + Object.keys(PAGES).join(', ') + ')'); process.exit(2); }
  const pages = demandees.length ? demandees : Object.keys(PAGES);

  const ext = extrasDuServeur();
  ext.x.crash = crashOuvert(ext.x.crash);
  console.log('charge d auth : ' + ext.source);

  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });

  /* Ouvre la page dans un contexte NEUF (localStorage vide : aucun choix de
     coffre memorise d'un scenario a l'autre), avec le faux serveur. */
  async function ouvre(page, b, bb, vue, auth) {
    const ctx = await nav.newContext(vue || { viewport: { width: 1200, height: 900 } });
    const p = await ctx.newPage();
    p.__erreurs = [];
    p.on('pageerror', (e) => p.__erreurs.push(String(e && e.message || e).slice(0, 140)));
    /* Seule l'origine locale passe : Privy, ethers, polices, videos distantes
       sont coupes (sinon la page attend des secondes pour rien). Les erreurs
       de reseau qui en decoulent sont ignorees. */
    await p.route('**/*', (r) => {
      let h = ''; try { h = new URL(r.request().url()).hostname; } catch (e) {}
      if (h === '127.0.0.1') return r.continue();
      return r.abort();
    });
    await p.addInitScript(fauxServeur, { adr: ADR, b, bb, extras: ext.x, auth: auth || null });
    await p.goto('http://127.0.0.1:' + port + '/' + page, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await p.waitForFunction(() => window.__auths > 0, null, { timeout: 15000 }); } catch (e) {}
    await p.waitForTimeout(900);
    return { ctx, p };
  }

  /* S4 : une main ouverte ailleurs arrive avec `auth`. La table l'affiche et
     la laisse finir, sans jamais remiser ; la suite (Hit) part sans jeton. */
  async function repriseMain(page, g, lib) {
    const tag = lib + ' S4 (auth porte une main $SWOGEBET en cours)';
    let ctx = null, p = null;
    try {
      ({ ctx, p } = await ouvre(page, 500, 500, g.vue, { bj: MAIN_OUVERTE }));
      const auth = await p.evaluate(() => window.__auths);
      ok(auth > 0, tag + ' : la page reprend la session (resume -> auth)');
      if (!auth) return;
      const pret = g.avant ? await g.avant(p) : true;
      ok(pret, tag + ' : la table s ouvre (on y va en marchant)');
      if (!pret) return;
      const e = await p.evaluate(() => {
        const c = document.querySelector('#nxBjVoile .nxbj-corps');
        const s = document.querySelector('#nxBjVoile .nxbj-solde');
        const b = document.querySelector('.coffre-choix');
        return {
          boutons: Array.from(c.querySelectorAll('[data-bj]')).map((x) => x.getAttribute('data-bj')),
          cartes: c.querySelectorAll('.nxbj-c').length,
          solde: s ? s.textContent.replace(/\s+/g, ' ').trim() : null,
          selGele: b ? getComputedStyle(b).pointerEvents === 'none' : null,
          selInerte: b ? b.hasAttribute('inert') : null,
          presse: presseVu(),
        };
        /* la pastille qui SE LIT pressee : couleur de fond de l'etat presse
           de coffre.js (#cdbf9f), quel que soit l'attribut aria-pressed */
        function presseVu() {
          return Array.from(document.querySelectorAll('.coffre-choix .cf-btn'))
            .filter((x) => getComputedStyle(x).backgroundColor === 'rgb(205, 191, 159)')
            .map((x) => x.getAttribute('data-coffre')).join(',');
        }
      });
      ok(e.boutons.indexOf('hit') >= 0 && e.boutons.indexOf('stand') >= 0,
         tag + ' : la main reprise s affiche, Hit et Stand presents [' + e.boutons.join(',') + ']');
      ok(e.boutons.indexOf('deal') < 0, tag + ' : pas de Deal pendant la main reprise');
      ok(e.cartes >= 3, tag + ' : ses cartes sont peintes (' + e.cartes + ', dos compris)');
      eq(e.solde, 'Balance 490 $SWOGEBET', tag + ' : le solde est celui du coffre FIGE de la main');
      eq(e.selGele, true, tag + ' : le selecteur de coffre est gele pendant la main');
      eq(e.selInerte, true, tag + ' : et inerte au clavier aussi (Tab + Entree ne change pas le choix en pleine main)');
      eq(e.presse, 'swogebet', tag + ' : la seule pastille pressee est celle de la main (st.jeton), pas le choix local');
      const bets = await p.evaluate(() => window.__sent.filter((x) => x.m && x.m.type === 'bj_bet').length);
      eq(bets, 0, tag + ' : aucun bj_bet envoye');
      const avant = await p.evaluate(() => window.__sent.length);
      const mode = await clique(p, '#nxBjVoile [data-bj="hit"]');
      let msg = null;
      try {
        await p.waitForFunction((k) => window.__sent.slice(k).some((x) => x.m && x.m.type === 'bj_hit'), avant, { timeout: 2500 });
        msg = await p.evaluate((k) => window.__sent.slice(k).find((x) => x.m && x.m.type === 'bj_hit').m, avant);
      } catch (x) {}
      ok(!!msg, tag + ' : Hit envoie bj_hit [clic : ' + mode + ']');
      if (msg) ok(!('jeton' in msg), tag + ' : bj_hit ne porte PAS de jeton ' + JSON.stringify(msg));
      const bets2 = await p.evaluate(() => window.__sent.filter((x) => x.m && x.m.type === 'bj_bet').length);
      eq(bets2, 0, tag + ' : toujours aucun bj_bet apres Hit');
      /* La main se finit, gagnee, en $SWOGEBET. Le choix local n'a jamais
         bouge ($SWOGE, contexte neuf) : c'est lui que Deal misera, et c'est
         ce que la rangee de Deal doit dire, a cote d'une banniere en
         $SWOGEBET. Le solde et le selecteur peuvent etre sous le pli. */
      const sock = await p.evaluate((k) => window.__sent.slice(k).find((x) => x.m && x.m.type === 'bj_hit').s, avant).catch(() => null);
      if (sock != null) {
        await p.evaluate(([i, m]) => window.__socks[i]._recoit(m), [sock, Object.assign({}, MAIN_OUVERTE, {
          stage: 'done', player: { cards: [5, 20, 6], value: 21 }, dealer: { cards: [9, 18, 22], value: 19, hidden: false },
          canDouble: false, result: 'win', payout: 20, betBalance: '510' })].map((x, j) => j ? { type: 'bj', state: x } : x));
        try { await p.waitForSelector('#nxBjVoile [data-bj="deal"]', { timeout: 2500 }); } catch (x) {}
        const f = await p.evaluate(() => {
          const v = document.getElementById('nxBjVoile');
          const de = v.querySelector('.nxbj-de');
          const deal = v.querySelector('[data-bj="deal"]');
          const r = v.querySelector('.nxbj-res');
          /* le centre du libelle tombe dans la hauteur du bouton : meme
             rangee, aucune ligne ajoutee — la ou est Deal, le coffre est dit */
          const dans = (a, b) => { if (!a || !b) return false; const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
            const c = (p.top + p.bottom) / 2; return c >= q.top && c <= q.bottom; };
          return {
            res: r ? r.textContent.replace(/\s+/g, ' ').trim() : null,
            de: de ? de.textContent.replace(/\s+/g, ' ').trim() : null,
            voisin: !!(de && deal && de.parentElement === deal.parentElement),
            memeRangee: dans(de, deal),
            presse: Array.from(document.querySelectorAll('.coffre-choix .cf-btn'))
              .filter((x) => getComputedStyle(x).backgroundColor === 'rgb(205, 191, 159)')
              .map((x) => x.getAttribute('data-coffre')).join(','),
          };
        });
        eq(f.res, '+20 $SWOGEBET', tag + ' : main finie, le gain se compte dans le coffre de la main');
        eq(f.de, 'from $SWOGE', tag + ' : la rangee de Deal nomme le coffre de la PROCHAINE mise (choix local)');
        ok(f.voisin, tag + ' : ce libelle est a cote du bouton Deal');
        ok(f.memeRangee, tag + ' : le libelle tient dans la hauteur du bouton Deal (meme rangee, aucune ligne de plus)');
        eq(f.presse, 'swoge', tag + ' : la main finie, la pastille pressee redevient le choix local');
        const avant2 = await p.evaluate(() => window.__sent.length);
        await clique(p, '#nxBjVoile [data-bj="deal"]');
        let m2 = null;
        try {
          await p.waitForFunction((k) => window.__sent.slice(k).some((x) => x.m && x.m.type === 'bj_bet'), avant2, { timeout: 2500 });
          m2 = await p.evaluate((k) => window.__sent.slice(k).find((x) => x.m && x.m.type === 'bj_bet').m, avant2);
        } catch (x) {}
        eq(m2 && m2.jeton, 'swoge', tag + ' : Deal mise bien le coffre que sa rangee nomme');
      } else ok(false, tag + ' : bj_hit introuvable, la fin de main n est pas jouee');
      ok(p.__erreurs.length === 0, tag + ' : aucune erreur de page [' + p.__erreurs.slice(0, 3).join(' | ') + ']');
    } catch (e) {
      ok(false, tag + ' : essai interrompu — ' + String(e && e.message || e).split('\n')[0]);
    } finally {
      if (ctx) await ctx.close().catch(() => {});
    }
  }

  for (const page of pages) {
    console.log('\n-- ' + page + ' --');
    for (const g of PAGES[page]) {
      const lib = page + ' ' + (g.nom || g.type);
      if (g.statique) { verifStatique(page, g); continue; }
      for (const sc of SCENARIOS) {
        const plein = g.solde || 500;
        const b = sc.b ? plein : 0, bb = sc.bb ? plein : 0;
        const tag = lib + ' ' + sc.id + ' (balance ' + b + ', betBalance ' + bb + ')';
        let ctx = null, p = null;
        try {
          ({ ctx, p } = await ouvre(page, b, bb, g.vue));
          const auth = await p.evaluate(() => window.__auths);
          ok(auth > 0, tag + ' : la page reprend la session (resume -> auth)');
          if (!auth) continue;
          if (g.avant) {
            const pret = await g.avant(p);
            ok(pret, tag + ' : la table s ouvre (on y va en marchant)');
            if (!pret) continue;
          }

          /* le selecteur de coffre */
          const d0 = await etatSelecteur(p);
          if (sc.selecteur === 'cache') ok(d0 === 'none', tag + ' : selecteur monte et cache [' + d0 + ']');
          if (sc.selecteur === 'visible') ok(d0 !== 'none' && d0 !== 'absent', tag + ' : selecteur visible [' + d0 + ']');
          /* Un selecteur visible dont le mot qui l'explique ne se lit pas ne
             sert a rien : coffre.js ne colore pas « Stake from », sur la
             table du monde il heritait du noir (1,23:1 sur la carte). Seuil
             WCAG AA du petit texte, 4,5:1. */
          if (g.lisible && sc.selecteur === 'visible') {
            const r = await contrasteLibelle(p);
            ok(r && r.ratio >= 4.5, tag + ' : le libelle « Stake from » se lit sur son fond ['
               + (r ? r.ratio.toFixed(2) + ':1, ' + r.texte + ' sur ' + r.fond : 'absent') + ']');
          }
          if (sc.choisit) {
            const c = d0 === 'absent' ? 'absent' : await clique(p, '.coffre-choix [data-coffre="swogebet"]');
            const pr = await p.evaluate(() => { const e = document.querySelector('.coffre-choix [data-coffre="swogebet"]'); return e ? e.getAttribute('aria-pressed') : null; });
            ok(pr === 'true', tag + ' : clic $SWOGEBET pris [' + c + ', aria-pressed ' + pr + ']');
          }
          /* la ligne de solde nomme le coffre ACTIF, avec SON solde */
          if (g.libelle) {
            const ligne = await p.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, g.libelle);
            const sym = sc.jeton === 'swogebet' ? '$SWOGEBET' : '$SWOGE';
            eq(ligne, 'Balance ' + plein + ' ' + sym, tag + ' : la ligne de solde dit le coffre actif');
          }
          /* la rangee de Deal nomme le coffre que Deal va miser — mais SEULEMENT
             s'il y a un choix a faire : sans $SWOGEBET (S1), la table reste
             exactement celle d'avant, sans libelle de plus. */
          if (g.de) {
            const de = await p.evaluate((s) => {
              const e = document.querySelector(s);
              return e ? { t: e.textContent.replace(/\s+/g, ' ').trim(),
                           voisin: !!e.parentElement.querySelector('[data-bj="deal"]') } : null;
            }, g.de);
            if (sc.bb > 0) {
              eq(de && de.t, 'from ' + (sc.jeton === 'swogebet' ? '$SWOGEBET' : '$SWOGE'), tag + ' : la rangee de Deal nomme le coffre mise');
              ok(!!de && de.voisin, tag + ' : ce libelle est dans la rangee meme du bouton Deal');
            } else {
              eq(de, null, tag + ' : sans $SWOGEBET, aucun libelle a cote de Deal (la table d avant)');
            }
          }

          /* le geste */
          const avant = await p.evaluate(() => window.__sent.length);
          const modes = [];
          for (const sel of g.etapes) { modes.push(await clique(p, sel)); await p.waitForTimeout(150); }
          let msg = null;
          try {
            await p.waitForFunction(([t, k]) => window.__sent.slice(k).some((x) => x.m && x.m.type === t), [g.type, avant], { timeout: 2500 });
            msg = await p.evaluate(([t, k]) => window.__sent.slice(k).find((x) => x.m && x.m.type === t).m, [g.type, avant]);
          } catch (e) {}
          const toast = msg ? '' : await dernierToast(p);
          ok(!!msg, tag + ' : le message ' + g.type + ' part [clics : ' + modes.join(',') + ']'
                    + (msg ? '' : (toast ? ' — la page dit « ' + toast + ' »' : ' — rien envoye')));
          if (msg) {
            eq(msg.jeton, sc.jeton, tag + ' : ' + g.type + ' porte jeton ' + sc.jeton);
            for (const k of Object.keys(g.champs || {})) eq(msg[k], g.champs[k], tag + ' : ' + g.type + '.' + k);
          }
          if (p.__erreurs.length && !msg) console.log('       (erreurs de page : ' + p.__erreurs.slice(0, 3).join(' | ') + ')');
          /* nexus.js fait 17 000 lignes et ne se charge que dans le monde :
             une exception de page la-bas ne se verrait nulle part ailleurs */
          if (g.avant) ok(p.__erreurs.length === 0, tag + ' : aucune erreur de page [' + p.__erreurs.slice(0, 3).join(' | ') + ']');
        } catch (e) {
          ok(false, tag + ' : essai interrompu — ' + String(e && e.message || e).split('\n')[0]);
        } finally {
          if (ctx) await ctx.close().catch(() => {});
        }
      }
      if (g.repriseMain) await repriseMain(page, g, lib);
    }
  }

  await nav.close();
  await new Promise((s) => srv.close(s));
  console.log('\n' + NOM + ' : ' + n + ' verifications, ' + rates + ' RATE(S)');
  process.exit(rates ? 1 : 0);
})().catch((e) => {
  console.log('  RATE essai interrompu : ' + (e && e.stack || e));
  console.log('\n' + NOM + ' : ' + n + ' verifications, ' + (rates + 1) + ' RATE(S)');
  process.exit(1);
});
