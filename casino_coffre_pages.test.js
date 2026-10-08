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
 * Usage : node casino_coffre_pages.test.js [page.html ...]   (sans argument : les 9)
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
        r(Object.assign({}, cfg.extras, {
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

const etatSelecteur = (page) => page.evaluate(() => {
  const b = document.querySelector('.coffre-choix');
  return b ? getComputedStyle(b).display : 'absent';
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
  async function ouvre(page, b, bb) {
    const ctx = await nav.newContext({ viewport: { width: 1200, height: 900 } });
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
    await p.addInitScript(fauxServeur, { adr: ADR, b, bb, extras: ext.x });
    await p.goto('http://127.0.0.1:' + port + '/' + page, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await p.waitForFunction(() => window.__auths > 0, null, { timeout: 15000 }); } catch (e) {}
    await p.waitForTimeout(900);
    return { ctx, p };
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
          ({ ctx, p } = await ouvre(page, b, bb));
          const auth = await p.evaluate(() => window.__auths);
          ok(auth > 0, tag + ' : la page reprend la session (resume -> auth)');
          if (!auth) continue;

          /* le selecteur de coffre */
          const d0 = await etatSelecteur(p);
          if (sc.selecteur === 'cache') ok(d0 === 'none', tag + ' : selecteur monte et cache [' + d0 + ']');
          if (sc.selecteur === 'visible') ok(d0 !== 'none' && d0 !== 'absent', tag + ' : selecteur visible [' + d0 + ']');
          if (sc.choisit) {
            const c = d0 === 'absent' ? 'absent' : await clique(p, '.coffre-choix [data-coffre="swogebet"]');
            const pr = await p.evaluate(() => { const e = document.querySelector('.coffre-choix [data-coffre="swogebet"]'); return e ? e.getAttribute('aria-pressed') : null; });
            ok(pr === 'true', tag + ' : clic $SWOGEBET pris [' + c + ', aria-pressed ' + pr + ']');
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
        } catch (e) {
          ok(false, tag + ' : essai interrompu — ' + String(e && e.message || e).split('\n')[0]);
        } finally {
          if (ctx) await ctx.close().catch(() => {});
        }
      }
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
