/* ============================================================================
 * LA COLONIE : LA PAGE NE CALCULE PLUS, ELLE REGARDE
 *
 * « Faut que ça soit live tout le temps, ça tourne 24/24 même quand on est pas
 * sur la page, tout le monde voit la même chose. »
 *
 * Avant, cette page etait le moteur : elle lisait la chaine, notait, ouvrait
 * ses positions, et gardait tout dans le stockage local du navigateur. Les
 * trois demandes tombaient donc toutes les trois — et rien ne se voyait :
 * l'ecran etait plein, les agents apprenaient, les positions vivaient. Ce qui
 * ne se voyait pas, c'est que la tresorerie affichee n'appartenait qu'a la
 * personne devant l'ecran, et qu'elle s'arretait avec l'onglet.
 *
 * Le moteur est parti sur le serveur. Cet essai mesure ce qui reste ici, et
 * il mesure surtout ce que la page ne doit PLUS faire :
 *
 *   - elle ne calcule rien : aucun chiffre affiche ne vient d'elle ;
 *   - elle ne garde rien : effacer le stockage local ne change rien ;
 *   - elle ne lit plus les services elle-meme : un seul echange, le serveur ;
 *   - et quand il ne repond pas, elle le DIT au lieu d'afficher $1,000, qui
 *     ressemble a une tresorerie intacte alors que c'est une ignorance.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
const PAGE = 'swoge_ai.html';
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}

/* Le navigateur et le port du serveur de fichiers : poses ici pour que les
   sections d'essai, ecrites en dehors de la boucle principale, puissent les
   atteindre. */
let nav = null, port = 0;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
            '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };

/* ---------------------------------------------------------------------------
 * LA VUE QUE LE SERVEUR SERT
 *
 * Meme forme que `vue()` dans `ai_colonie.js`. On la fige ici : ce qu'on met
 * a l'essai est ce que la PAGE en fait, pas ce que le serveur calcule — ca,
 * c'est `ai_colonie_serveur.test.js` qui le mesure, cote serveur.
 * ------------------------------------------------------------------------ */
/* De vraies adresses : c'est elles que la page doit afficher en ENTIER et
   rendre copiables — « qu'on voie le contrat, qu'on puisse le copier-coller ». */
const ADR_NOVA = '0x8f2a41c0d5b93e77a1c4e6b8d0f2a9c3e5471b62';
const ADR_MUET = '0x1d7c93b40e6a25f8c9b3d1470a6e82f5c40d9b31';

function vueFausse(o) {
  o = o || {};
  const now = Date.now();
  return {
    t: now, depuis: now - 86400000, maj: now - 30000, dernierTour: now - 30000,
    erreur: o.erreur || null, cadence: 150000,
    tresor: o.tresor === undefined ? 1187.5 : o.tresor, depart: 1000, mise: 50,
    trades: 9, gains: 6, meilleur: 1.42, meilleurSym: 'PEPO', ouvertures: 11,
    courbe: [1000, 1012, 995, 1040, 1102, 1187.5],
    flux: [
      { sym: 'PEPO', pool: '0xpool1', tag: 'buy', txt: '+$21.00  ·  +42.0%', cls: 'up',
        t: now - 60000, par: 'closer' },
      { sym: 'DUMP', pool: '0xpool2', tag: 'cut',
        txt: '-$8.50  ·  -17.0%  ·  cut: the pool went from $40000 to $9000',
        cls: 'dn', t: now - 300000, par: 'sentinelle' },
      /* Une ouverture : elle est deja listee dans « positions ouvertes », avec
         plus de detail. Le fil ne doit pas la repeter. */
      { sym: 'NOVA', pool: '0xpool3', tag: 'open', txt: 'OPENED · $35.00 · part', cls: 'n',
        t: now - 400000 },
    ],
    positions: [
      { sym: 'NOVA', adr: ADR_NOVA, pool: '0xpool3', minutes: 4, score: 71, ouverteDepuis: 300000,
        tenueMin: 20, latent: 6.4, gainLatent: 2.24, mise: 35, methode: 'part',
        regime: 'around the start', raisonMise: 'part method, « around the start » regime',
        origine: 'profils', mcAchat: 310000, prolonge: 1, prixVu: now - 30000, dexVu: true,
        /* Elle est sortie par paliers : 70 % vendus en route, 30 % courent
           encore, et le plus haut vu est ce que l'arret suiveur surveille. */
        reste: 0.3, encaisse: 12.4, paliers: 2, hautR: 62.5,
        liens: [{ type: 'twitter', url: 'https://x.com/nova' },
                { type: 'site', url: 'https://nova.example' }] },
      /* Une position dont le prix n'a pas ete relu : le serveur envoie `null`,
         et la page doit l'ECRIRE au lieu d'afficher 0 %. */
      { sym: 'MUET', adr: ADR_MUET, pool: '0xpool4', minutes: 9, score: 63, ouverteDepuis: 60000,
        tenueMin: 20, latent: null, gainLatent: null, mise: 30, methode: 'part',
        regime: 'around the start', origine: 'pools', mcAchat: 45000, prolonge: 0,
        prixVu: now - 40 * 60000, liens: [], dexVu: false },
    ],
    candidats: o.candidats || [
      { sym: 'NOVA', addr: '0xa1', pool: '0xpool3', minutes: 4, liq: 24000, mc: 310000, prix: 0.004,
        ch_m5: 9, score: 71, base: 68, adj: 3, refus: null, quiRefuse: null, origine: 'profils', appels: 4,
        acheteurs: 22, partDuPlusGros: 12, tradesVus: true,
        porteurs: 143, top: 3.2, chaineVue: true, montantsLus: true, personne: false,
        transferts: 812, goplusSait: false,
        /* Le Cobaye a demande au contrat, pour trois vrais detenteurs, ce
           qu'il ferait d'un envoi vers la piscine : trois fois oui. */
        epreuve: { teste: true, essais: 3, refus: 0, passe: true } },
      /* ---- LE PIEGE QUE PERSONNE D'AUTRE NE VOIT ----
       * GoPlus le dit propre, la chaine le dit bien reparti, les compteurs
       * disent qu'on achete. Seule la tentative de sortie le trahit. */
      { sym: 'MIEL', addr: '0xa7', pool: '0xpoolA', minutes: 7, liq: 31000, mc: 260000, prix: 0.006,
        ch_m5: 14, score: 74, base: 74, adj: 0, quiRefuse: 'cobaye', origine: 'pools', appels: 6,
        refus: 'the exit is blocked: 3/3 holders cannot send the token to the pool',
        acheteurs: 31, partDuPlusGros: 9, tradesVus: true,
        porteurs: 210, top: 4.1, chaineVue: true, montantsLus: true, personne: false,
        transferts: 940, goplusSait: true,
        epreuve: { teste: true, essais: 3, refus: 3, passe: false,
                   raison: 'the transfer returns false' } },
      { sym: 'PIEGE', addr: '0xa2', pool: '0xpool5', minutes: 6, liq: 9000, mc: 80000, prix: 0.001,
        ch_m5: 2, score: 0, base: 12, adj: 0, refus: 'honeypot', quiRefuse: 'warden', origine: 'pools', appels: 1,
        acheteurs: null, partDuPlusGros: null, tradesVus: false,
        porteurs: 4, top: 91, chaineVue: true, montantsLus: true, personne: false,
        transferts: 12, goplusSait: true },
      { sym: 'BALEINE', addr: '0xa3', pool: '0xpool6', minutes: 3, liq: 6000, mc: 40000, prix: 0.002,
        ch_m5: 1, score: 22, base: 22, adj: 0, refus: 'one holder holds 88% of the float', quiRefuse: 'whale', origine: 'pools', appels: 2,
        acheteurs: null, partDuPlusGros: null, tradesVus: false,
        porteurs: 3, top: 88, chaineVue: true, montantsLus: true, personne: false,
        transferts: 30, goplusSait: false },
      { sym: 'VIDE', addr: '0xa4', pool: '0xpool7', minutes: 2, liq: 4200, mc: 20000, prix: 0.0005,
        ch_m5: 0, score: 20, base: 20, adj: 0, refus: '31 addresses touched the token, none of them holds it', quiRefuse: 'whale', origine: 'boosts', appels: 2,
        acheteurs: null, partDuPlusGros: null, tradesVus: false,
        porteurs: 0, top: null, chaineVue: true, montantsLus: true, personne: true,
        transferts: 60, goplusSait: false },
      { sym: 'FAIBLE', addr: '0xa5', pool: '0xpool8', minutes: 8, liq: 5000, mc: 30000, prix: 0.003,
        ch_m5: -2, score: 41, base: 41, adj: 0, refus: 'score too low', quiRefuse: 'oracle', origine: 'pools', appels: 4,
        acheteurs: 5, partDuPlusGros: 30, tradesVus: true,
        porteurs: 22, top: 12, chaineVue: true, montantsLus: true, personne: false,
        transferts: 90, goplusSait: true },
      /* La chaine n'a pas repondu pour celui-ci : la page doit ecrire « non
         lue », pas un zero qui se lirait comme un fait. */
      { sym: 'INCONNU', addr: '0xa6', pool: '0xpool9', minutes: 5, liq: 7000, mc: 50000, prix: 0.001,
        ch_m5: 3, score: 38, base: 38, adj: 0, refus: 'score too low', quiRefuse: 'oracle', origine: 'pools', appels: 3,
        acheteurs: null, partDuPlusGros: null, tradesVus: false,
        porteurs: null, top: null, chaineVue: false, montantsLus: false, personne: false,
        transferts: null, goplusSait: false,
        /* Le noeud n'a pas repondu : « pas testable » n'est pas « propre ». */
        epreuve: { teste: false, raison: 'the node did not answer (rpc 429)' } },
    ],
    compteurs: { scout: 240, wardenBloque: 31, wardenOk: 209, whaleBloque: 44, whaleOk: 165,
                 whisper: 165, oracle: 165, closer: 11 },
    agents: {
      scout:   { obs: 9, lecons: [{ quoi: 'born <10 min ago', n: 9, moyenne: 4.1 }] },
      /* Le Warden porte le cas reel : sa meilleure case par le poids est une
         LECTURE RATEE (GoPlus s'est tu), pas un trait du jeton, et elle a bien
         rendu. Sur le serveur c'etait « code inconnu, 488 obs, +20,0 % » en
         tete de sa fiche, peint en vert. */
      warden:  { obs: 9, lecons: [{ quoi: 'code unknown', n: 9, moyenne: 7.4, nonLue: true },
                                  { quoi: 'no tax', n: 5, moyenne: -2.2 }] },
      whale:   { obs: 9, lecons: [{ quoi: 'top <5%', n: 7, moyenne: 8.3 }] },
      whisper: { obs: 9, lecons: [{ quoi: 'buyers ahead', n: 6, moyenne: 5.5 }] },
      oracle:  { obs: 9, lecons: [{ quoi: 'cap $50-500k', n: 8, moyenne: 3.9 }] },
      closer:  { obs: 14, lecons: [{ quoi: '20 min', n: 14, moyenne: 2.7 }] },
    },
    tenue: { min: 20, appris: true, moy: 2.7, n: 14 },
    /* ---- LA STRUCTURE ----
     * Sept agents de base plus un specialiste ne de la colonie : la page doit
     * dessiner HUIT maisons sans qu'aucun nombre ne soit ecrit dedans. */
    roster: o.roster || [
      { key: 'scout', nom: 'Scout', emoji: '🛰️', couleur: '#3d7bd6', role: 'source', ordre: 0,
        mission: 'Sweeps three feeds', traits: ['age', 'liq', 'origine'], cout: 0, vus: 0, bloques: 0 },
      { key: 'whale', nom: 'Whale-Watch', emoji: '🐋', couleur: '#e8552d', role: 'garde', ordre: 1,
        mission: 'Adds up transfers in the blocks', traits: ['top', 'det', 'brule'], cout: 1, vus: 240, bloques: 190 },
      { key: 'warden', nom: 'Warden', emoji: '🛡️', couleur: '#9b6cf0', role: 'garde', ordre: 2,
        mission: 'Checks the contract', traits: ['taxe', 'code', 'pouv'], cout: 1, vus: 50, bloques: 3 },
      { key: 'whisper', nom: 'Whisper', emoji: '📡', couleur: '#1fb7a8', role: 'garde', ordre: 3,
        mission: 'Reads trades one by one', traits: ['press', 'flux'], cout: 1, vus: 47, bloques: 6 },
      { key: 'whale-topage', nom: 'Whale · age', emoji: '🔎', couleur: '#e8552d', role: 'specialiste',
        ordre: 90, parent: 'whale', ne: now - 3600000,
        mission: 'Splits « top 15-30% » by age', traits: ['top×age'], cout: 1, vus: 0, bloques: 0 },
      { key: 'oracle', nom: 'Oracle', emoji: '🔮', couleur: '#f2b21e', role: 'note', ordre: 4,
        mission: 'Scores and decides', traits: ['mc', 'elan', 'vola'], cout: 2, vus: 41, bloques: 12 },
      /* ---- LE COBAYE ----
       * « Un bot dans le village avant le gros achat. » Il vient apres
       * l'Oracle : son epreuve coute des appels et ne sert que sur un jeton
       * qui a deja tout passe. */
      { key: 'cobaye', nom: 'Test Subject', emoji: '🐹', couleur: '#c9a227', role: 'epreuve', ordre: 5,
        mission: 'Simulates the sale on chain', traits: ['cobaye'], cout: 1, vus: 29, bloques: 4 },
      { key: 'banquier', nom: 'Banker', emoji: '🏦', couleur: '#5ad1a0', role: 'banque', ordre: 6,
        mission: 'Sizes the stake', traits: ['methode'], cout: 0, vus: 0, bloques: 0 },
      { key: 'closer', nom: 'Closer', emoji: '💰', couleur: '#e83e8c', role: 'execution', ordre: 7,
        mission: 'Opens and closes at the real price', traits: ['tenue'], cout: 0, vus: 0, bloques: 0 },
    ],
    ordreRevu: now - 600000,
    journalStructure: o.journal || [
      { t: now - 3600000, quoi: 'naissance',
        txt: 'Whale · age is born: « top 15-30% » was seen 20 times with a standard deviation of 42 points — that bucket predicts nothing',
        chiffres: [{ parent: 'whale', obs: 20, ecartType: 42 }] },
      { t: now - 600000, quoi: 'ordre',
        txt: 'New guard order: whale → warden → whisper (before: warden → whale → whisper)',
        chiffres: [{ agent: 'whale', refus: '79%', appels: 1, vus: 240 }] },
    ],
    banque: o.banque || {
      methode: 'part', appris: true, regime: 'around the start', serie: 2, pic: 1210.4,
      engage: 65, partMax: 0.08, expoMax: 0.30, plancher: 100, miseMin: 10, arret: o.arret || null,
      prochaine: o.arret ? null
        : { mise: 35.6, methode: 'part', regime: 'around the start', part: 3,
            raison: 'part method, « around the start » regime' },
      releve: [
        { methode: 'part', par: [{ regime: 'around the start', n: 12, moyenne: 4.8 }] },
        { methode: 'fixe', par: [{ regime: 'around the start', n: 9, moyenne: -2.1 }] },
      ],
    },
    surveillance: o.surveillance || [
      { addr: '0xaa', sym: 'PRESQUE', vu: 3, note: 48, meilleure: 52, dernier: now - 900000,
        verdict: 'score too low', liq: 12000 },
      { addr: '0xbb', sym: 'PATIENT', vu: 2, note: 40, meilleure: 44, dernier: now - 300000,
        verdict: 'score too low', liq: 7000 },
    ],
    connus: 148, bannis: 37,
    evites: [{ sym: 'DEJAVU', pourquoi: 'already judged 4 min ago, nothing has moved' }],
    services: [
      { cle: 'pools', nom: 'GeckoTerminal · new pools', quoi: 'age, liquidity, cap, buys and sells', cout: 0,
        essais: 36, reussites: 36, dernier: now, dernierEchec: null },
      { cle: 'profils', nom: 'DexScreener · recent profiles', quoi: 'new tokens whose profile someone filled in',
        cout: 0, essais: 12, reussites: 12, dernier: now, dernierEchec: null },
      { cle: 'boosts', nom: 'DexScreener · boosted tokens', quoi: 'tokens someone paid to promote',
        cout: 0, essais: 12, reussites: 12, dernier: now, dernierEchec: null },
      { cle: 'chaine', nom: 'Chain 4663 · official node', quoi: 'who holds what, by adding up transfers', cout: 1,
        essais: 120, reussites: 111, dernier: now, dernierEchec: '429' },
      { cle: 'goplus', nom: 'GoPlus · contract safety', quoi: 'honeypot, taxes, owner powers', cout: 1,
        essais: 120, reussites: 120, dernier: now, dernierEchec: null },
      { cle: 'trades', nom: 'GeckoTerminal · trades one by one', quoi: 'which wallets are buying, and for how much',
        cout: 1, essais: 24, reussites: 24, dernier: now, dernierEchec: null },
      { cle: 'dex', nom: 'DexScreener · second opinion', quoi: 'a second price, the other pools, the socials', cout: 1,
        essais: 60, reussites: 60, dernier: now, dernierEchec: null },
      { cle: 'ohlcv', nom: 'GeckoTerminal · candles', quoi: 'the volatility actually observed', cout: 1,
        essais: 20, reussites: 20, dernier: now, dernierEchec: null },
    ],
    horsService: {
      gmgn: 'GMGN — 403 Cloudflare, on ethereum too: that is anti-bot protection, not an absence '
          + 'of chain 4663.',
      blockscout: 'Blockscout robinhood — Cloudflare challenge on the API as on the pages.',
      honeypotis: 'honeypot.is — does not know chain 4663.',
    },
    seuil: o.seuil || 55, seuilDepart: 55, ageMax: 360,
    sociauxExiges: o.sociauxExiges === undefined ? ['site', 'twitter', 'telegram'] : o.sociauxExiges,
    derniers: [4.2, -3.1, 8.0, -1.2, 12.4],
    bandes: [{ nom: '0-5 min', vus: 3 }, { nom: '5-20 min', vus: 2 },
             { nom: '20-60 min', vus: 1 }, { nom: '1-6 h', vus: 0 }],
    suites: [{ sym: 'MONTE', rSortie: 42, echeance: now + 600000 }],
    ombres: { enAttente: 34, jugees: 218 },
    horizons: [5, 15, 30, 60, 120], horizonRef: 30, jalons: 914,
    traits: [
      { trait: 'liq', obs: 210, valeurs: 4, separation: 2.4, ecartValeurs: 51.2,
        meilleure: { quoi: 'pool >$100k', moyenne: 21.4, n: 38 },
        pire: { quoi: 'pool <$1k', moyenne: -29.8, n: 61 } },
      { trait: 'top', obs: 198, valeurs: 5, separation: 1.9, ecartValeurs: 44.0,
        meilleure: { quoi: 'top <5%', moyenne: 15.2, n: 44 },
        pire: { quoi: 'top >50%', moyenne: -28.8, n: 72 } },
      /* Celui-la ne separe rien : toutes ses valeurs rendent la meme chose. */
      { trait: 'vola', obs: 120, valeurs: 4, separation: 0.08, ecartValeurs: 1.4,
        meilleure: { quoi: 'calm', moyenne: 2.1, n: 30 },
        pire: { quoi: 'volatility >12%', moyenne: 0.7, n: 34 } },
    ],
    audit: o.audit === undefined ? [
      /* Un veto qui coute : un jeton ecarte sur trois est monte. */
      { cle: 'oracle · score too low', n: 96, moyenne: -4.2, montes: 31, effondres: 22, partMontes: 32 },
      /* Un veto qui protege. */
      { cle: 'whale · one holder holds 90% of the float', n: 140, moyenne: -38.5,
        montes: 7, effondres: 96, partMontes: 5 },
    ] : o.audit,
    conseiller: o.conseiller || { actif: false, modele: 'claude-haiku-4-5-20251001',
                                  poids: 8, parTour: 3, rendus: 0 },
    alertes: o.alertes === undefined ? [
      { gravite: 'haute', quoi: 'The chain nodes are refusing 34% of reads',
        pourquoi: '41 refusals over 120 calls. Every refusal turns a token we could have judged into « unknown ».',
        quoiFaire: 'A dedicated RPC for chain 4663 would lift the limit.' },
      { gravite: 'moyenne', quoi: 'The Advisor is off: no Anthropic key',
        pourquoi: 'The agents judge on rules and on what they measured.',
        quoiFaire: 'Set ANTHROPIC_API_KEY in the Railway variables. One key is enough.' },
    ] : o.alertes,
  };
}

/* ============================ LE BANC ============================ */
async function ouvre(nav, port, opts) {
  opts = opts || {};
  const ctx = opts.ctx || await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const boum = [];
  page.on('pageerror', (e) => boum.push(String(e).slice(0, 200)));
  const appels = { serveur: 0, autres: [] };

  /* Tout ce qui n'est pas notre serveur est NOTE puis coupe : si la page
     appelait encore GeckoTerminal ou la chaine, l'essai le verrait. */
  await page.route(/geckoterminal|gopluslabs|dexscreener|rpc\.mainnet|honeypot\.is|blockscout/, (r) => {
    appels.autres.push(r.request().url().slice(0, 60));
    return r.abort();
  });
  await page.route(/\/ai\/colonie/, (r) => {
    appels.serveur++;
    if (opts.horsLigne) return r.abort();
    if (opts.casse) return r.fulfill({ status: 502, contentType: 'text/plain', body: 'bad gateway' });
    return r.fulfill({ contentType: 'application/json',
                       body: JSON.stringify(opts.vue || vueFausse(opts.vueOpts)) });
  });

  await page.goto('http://127.0.0.1:' + port + '/' + PAGE + (opts.urlSuffixe || ''),
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  return { page, ctx, boum, appels };
}

const lit = (page) => page.evaluate(() => ({
  /* La tresorerie de la colonie, pas le solde $SWOGE de la barre
     partagee : les deux vivaient sous le meme identifiant, et la barre du
     site a ete posee sur cette page. */
  bal: (document.getElementById('aiBal') || {}).textContent,
  delta: (document.getElementById('delta') || {}).textContent,
  stamp: (document.getElementById('stamp') || {}).textContent,
  stampCls: (document.getElementById('stamp') || {}).className,
  pouls: (document.getElementById('poulsTx') || {}).textContent,
  tag: (document.getElementById('stagetag') || {}).textContent,
  pos: (document.getElementById('poscount') || {}).textContent,
  trades: (document.getElementById('s-trades') || {}).textContent,
  profit: (document.getElementById('s-profit') || {}).textContent,
  best: (document.getElementById('s-best') || {}).textContent,
  wr: (document.getElementById('wr') || {}).textContent,
  positions: [...document.querySelectorAll('#positions .pos')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()),
  positionsTxt: (document.getElementById('positions') || {}).textContent.replace(/\s+/g, ' ').trim(),
  appris: (document.getElementById('appris') || {}).textContent.replace(/\s+/g, ' ').trim(),
  apprisHtml: (document.getElementById('appris') || {}).innerHTML || '',
  flow: (document.getElementById('flow') || {}).textContent.replace(/\s+/g, ' ').trim(),
  agents: [...document.querySelectorAll('#agents .agent')].map((a) =>
    [...a.querySelectorAll('.sc')].map((x) => x.textContent.trim())),
  foot: (document.getElementById('foot') || {}).textContent.replace(/\s+/g, ' ').trim(),
  feed: [...document.querySelectorAll('#feed .tr')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()),
  liens: [...document.querySelectorAll('#positions .liens a')].map((a) => a.textContent.trim() + '→' + a.href),
  alertes: (document.getElementById('alertes') || {}).textContent.replace(/\s+/g, ' ').trim(),
  alerteN: (document.getElementById('alerteN') || {}).textContent,
  alerteCachee: !!(document.getElementById('carteAlertes') || {}).hidden,
  fermN: (document.getElementById('fermN') || {}).textContent,
  audit: (document.getElementById('audit') || {}).textContent.replace(/\s+/g, ' ').trim(),
  traits: (document.getElementById('traits') || {}).textContent.replace(/\s+/g, ' ').trim(),
  traitsN: (document.getElementById('traitsN') || {}).textContent,
  auditN: (document.getElementById('auditN') || {}).textContent,
  maisons: [...document.querySelectorAll('#agents .agent')].length,
  adresses: [...document.querySelectorAll('#positions .adr code')].map((c) => c.textContent.trim()),
  boutonsCopie: [...document.querySelectorAll('#positions .adr button')].length,
  banque: (document.getElementById('banque') || {}).textContent.replace(/\s+/g, ' ').trim(),
  banqMethode: (document.getElementById('banqMethode') || {}).textContent,
  surveillance: (document.getElementById('surveillance') || {}).textContent.replace(/\s+/g, ' ').trim(),
  survN: (document.getElementById('survN') || {}).textContent,
  flowcount: (document.getElementById('flowcount') || {}).textContent,
  structure: (document.getElementById('structure') || {}).textContent.replace(/\s+/g, ' ').trim(),
  services: (document.getElementById('services') || {}).textContent.replace(/\s+/g, ' ').trim(),
  soustitre: (document.getElementById('soustitre') || {}).textContent,
}));


/* ==========================================================================
 * 9. AUTANT DE MAISONS QU'IL Y A D'AGENTS
 *
 * « S'ils ont besoin de plus d'agents ils peuvent s'auto-développer, se
 *   multiplier, ou plus de maisons. »
 *
 * Il y avait six maisons a six coordonnees ecrites a la main. Un septieme
 * agent n'aurait eu nulle part ou habiter — et il ne serait pas apparu du
 * tout, sans que rien ne le signale : la page aurait continue a dessiner ses
 * six maisons pendant que le serveur en comptait huit.
 * ==========================================================================*/
async function maisons() {
  console.log('\n-- le village se construit depuis le roster --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const v = await lit(page);
    console.log('   maisons : ' + v.maisons + ' · sous-titre : « ' + v.soustitre + ' »');
    const N = vueFausse().roster.length;
    ok(v.maisons === N, N + ' agents au serveur → ' + N + ' maisons a l ecran (' + v.maisons + ')');
    ok(new RegExp('\\b' + N + ' agents').test(v.soustitre),
       'et le nombre est ecrit depuis le roster, jamais en dur : « ' + v.soustitre + ' »');

    /* Le specialiste ne de la colonie doit dire de qui il descend : sinon un
       nom nouveau apparait un jour sans que personne sache d ou il sort. */
    const noms = await page.evaluate(() =>
      [...document.querySelectorAll('#agents .nm')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
    console.log('   ' + JSON.stringify(noms));
    ok(noms.some((n) => /Whale · age/.test(n)), 'le specialiste ne de la colonie a sa maison');
    ok(noms.some((n) => /from whale/.test(n)), 'et il dit de qui il descend');

    /* Les maisons sont posees sur un anneau : aucune ne doit sortir du cadre,
       quel que soit le nombre d agents. */
    /* ---- LES BORNES SUIVENT LE MONDE, ELLES NE SONT PLUS RECOPIEES ----
     * Elles etaient ecrites en dur pour un monde de 1000 x 760. La hauteur
     * suit maintenant le nombre de rangees, et un essai qui garde les anciens
     * chiffres mesure un cadre qui n'existe plus. On demande donc a la page sa
     * taille, et on y ajoute l'encombrement REEL d'une maison : l'etiquette
     * monte a 70 au-dessus du point, l'ombre descend a 50 en dessous, et le
     * toit deborde de 52 de chaque cote. */
    const dehors = await page.evaluate(() =>
      AGENTS.filter((a) => a.house.x - 52 < 0 || a.house.x + 52 > W
                        || a.house.y - 70 < 0 || a.house.y + 50 > H)
            .map((a) => a.key + '@' + a.house.x + ',' + a.house.y));
    ok(dehors.length === 0,
       'aucune maison ne sort du cadre' + (dehors.length ? ' : ' + dehors.join(', ') : ''));

    /* Et l ordre du parcours suit celui du serveur, pas un ordre invente ici. */
    const parcours = await page.evaluate(() => AGENTS.map((a) => a.key));
    console.log('   parcours : ' + parcours.join(' → '));
    ok(parcours[0] === 'scout', 'le Scout ouvre le parcours');
    ok(parcours.indexOf('whale') < parcours.indexOf('warden'),
       'les gardes suivent l ordre QUE LE SERVEUR a mesure (whale avant warden), pas celui du code');
    ok(parcours[parcours.length - 1] === 'closer' && parcours[parcours.length - 2] === 'banquier',
       'et la fin est Banquier puis Closer : deux agents ouvrent une position, pas un');
    /* ---- LE COBAYE EST ENTRE L ORACLE ET LE BANQUIER ----
     * C est la que le serveur le joue : apres que tout le reste a dit oui, et
     * avant qu un centime soit engage. La table des rangs de la page ne
     * connaissait pas son role et le poussait en bout de file — donc APRES le
     * Closer, c est-a-dire apres l achat. L ecran aurait montre l inverse de
     * ce qui se passe, et « avant le gros achat » serait devenu « apres ». */
    ok(parcours.indexOf('cobaye') > parcours.indexOf('oracle')
       && parcours.indexOf('cobaye') < parcours.indexOf('banquier'),
       'et le Cobaye tente la sortie apres l Oracle et AVANT le Banquier : c est la que le '
       + 'serveur le joue (' + parcours.join(' → ') + ')');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  console.log('\n-- et il se refait quand la colonie change de forme --');
  {
    /* Un roster reduit : le village doit suivre, sans laisser un bot orphelin
       marcher vers une maison qui n existe plus. */
    const petit = vueFausse();
    petit.roster = petit.roster.filter((a) => a.role !== 'specialiste');
    const { page, boum } = await ouvre(nav, port, {});
    const av = (await lit(page)).maisons;
    await page.evaluate((v) => { majVillage(v.roster); VUE = v; peintAgents(); }, petit);
    await page.waitForTimeout(200);
    const ap = (await lit(page)).maisons;
    console.log('   ' + av + ' maisons → ' + ap);
    const N = vueFausse().roster.length;
    ok(av === N && ap === N - 1, 'un specialiste retire, et le village a une maison de moins ('
       + av + ' → ' + ap + ')');
    const bots = await page.evaluate(() => bots.length + '/' + AGENTS.length);
    ok(bots === (N - 1) + '/' + (N - 1),
       'les habitants suivent : ' + bots + ' — aucun bot ne reste sans maison');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
}

/* ==========================================================================
 * 10. LE CONTRAT, EN ENTIER ET COPIABLE
 *
 * « Aussi faudrait qu'on voie le contrat, qu'on puisse le copier-coller, de la
 *   crypto en trade en cours. »
 *
 * Tronquee, une adresse ne sert a rien : on ne peut ni la coller dans un
 * explorateur, ni la comparer a celle qu'on a sous les yeux ailleurs — et
 * c'est justement en la comparant qu'on evite d'acheter le faux jeton qui
 * porte le meme nom que le vrai.
 * ==========================================================================*/
async function contrat() {
  console.log('\n-- l adresse du contrat, sur les positions en cours --');
  const { page, boum } = await ouvre(nav, port, {});
  const v = await lit(page);
  console.log('   ' + JSON.stringify(v.adresses));
  ok(v.adresses.length === 2, 'chaque position en cours porte son adresse de contrat');
  ok(v.adresses[0] === ADR_NOVA,
     'et elle est ENTIERE, pas tronquee : ' + v.adresses[0]);
  ok(v.adresses[0].length === 42, 'quarante-deux caracteres, donc collable telle quelle');
  ok(v.boutonsCopie === 2, 'avec un bouton pour la copier');

  /* ---- LE PIEGE DEJA RENCONTRE DANS LE PORTEFEUILLE ----
   * Dans la vue web de Telegram, `navigator.clipboard` est absent et son appel
   * jette AVANT de rendre une promesse : un `.catch()` ne s execute jamais, et
   * le bouton ne fait rien sans rien dire. On le retire pour de bon. */
  await page.evaluate(() => {
    try { delete navigator.clipboard; } catch (e) {}
    Object.defineProperty(navigator, 'clipboard', { get() { throw new Error('absent'); },
                                                    configurable: true });
  });
  /* ---- ET IL FAUT OUVRIR LE PANNEAU POUR L'ATTEINDRE ----
   * Depuis que la colonne part entierement repliee, le contenu d'un panneau
   * ferme est `display:none` : Playwright ne peut pas cliquer dessus, et un
   * lecteur non plus. Ce n'est pas un defaut a contourner, c'est le
   * comportement voulu — on l'ouvre donc comme le ferait quelqu'un, par son
   * titre, ce qui verifie au passage que le geste marche. */
  await page.evaluate(() => {
    const c = document.querySelector('.card[data-pan="positions"]');
    if (c && c.classList.contains('plie')) c.querySelector('h2').click();
  });
  await page.waitForTimeout(120);
  /* ---- LE CLIC ET LA LECTURE DANS LE MEME SOUFFLE ----
   * `#positions` est repeint chaque seconde. Cliquer, attendre, puis relire
   * laissait un repaint passer entre les deux : le bouton avait bien repondu,
   * mais on interrogeait ensuite un bouton NEUF, qui n'avait rien vu. L'essai
   * echouait une fois sur trois selon la phase de l'horloge — et pour une
   * raison qui n'avait rien a voir avec ce qu'il mesure. Tout dans un seul
   * `evaluate` : le JavaScript est a un seul fil, aucun repaint ne s'y
   * glisse. */
  const [avant, apres] = await page.evaluate(() => {
    const b = document.querySelector('#positions .adr button');
    const a = b.textContent;
    b.click();
    return [a, b.textContent];
  });
  console.log('   sans presse-papier : « ' + avant + ' » → « ' + apres + ' »');
  ok(apres !== avant,
     'meme sans presse-papier, le bouton REPOND quelque chose (« ' + apres + ' »)');
  ok(boum.length === 0, 'et il ne jette pas' + (boum.length ? ' : ' + boum[0] : ''));

  /* Et quoi qu il arrive, l adresse reste selectionnable a la main. */
  const sel = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#positions .adr code')).webkitUserSelect
    || getComputedStyle(document.querySelector('#positions .adr code')).userSelect);
  ok(sel === 'all', 'et l adresse se selectionne d un seul geste (user-select: ' + sel + ')');

  /* La mise du Banquier voyage avec la position : c est CE chiffre qui a ete
     pose, pas une valeur plausible recalculee ici. */
  const pos = await page.evaluate(() =>
    [...document.querySelectorAll('#positions .posbloc')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('   ' + pos[0]);
  ok(/\$35\.00 staked/.test(pos[0]), 'la mise reellement engagee est affichee ($35.00)');
  ok(/part/.test(pos[0]), 'avec la methode qui l a decidee');
  ok(/spotted by profils/.test(pos[0]), 'et le flux qui a trouve le jeton');

  /* ---- CE QUI A DEJA ETE PRIS, ET CE QUI COURT ENCORE ----
   * La position ne sort plus d un bloc : elle vend par paliers et laisse le
   * reste courir. Sans ces chiffres, une position a +6 % qui a deja encaisse
   * 70 % de son gain se lit comme une petite affaire — et le latent affiche
   * porterait sur une mise qu on n a plus en jeu. */
  console.log('   ' + pos[0].slice(0, 200));
  ok(/70% sold/.test(pos[0]),
     'la part deja vendue en route est ecrite (70 %)');
  ok(/\+\$12\.40 banked/.test(pos[0]),
     'avec ce qu elle a rapporte, qui est deja dans la tresorerie');
  ok(/30% still running/.test(pos[0]),
     'et ce qui reste en jeu : c est cette part-la que le latent chiffre');
  ok(/peak seen \+62\.5%/.test(pos[0]),
     'le plus haut atteint est affiche : c est lui que l arret suiveur surveille, donc lui '
     + 'qui expliquera une fermeture qu on n aurait pas comprise');
  await page.context().close();
}

/* ==========================================================================
 * 11. LE BANQUIER, ET SES BORNES
 * ==========================================================================*/
async function banquierEcran() {
  console.log('\n-- le Banquier a l ecran --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const v = await lit(page);
    console.log('   ' + v.banqMethode + ' · ' + v.banque.slice(0, 110));
    ok(/part/.test(v.banqMethode) && /learned/.test(v.banqMethode),
       'sa methode est affichee, et le fait qu il l ait APPRISE (« ' + v.banqMethode + ' »)');
    ok(/around the start/.test(v.banque), 'le regime de caisse aussi');
    ok(/2 wins in a row/.test(v.banque), 'et la serie en cours');
    ok(/\$65\.00/.test(v.banque), 'ce qui est engage maintenant');
    ok(/\$35\.60/.test(v.banque), 'et ce qu il poserait sur le prochain jeton');

    /* ---- LES BORNES SONT AFFICHEES ----
     * Une page qui montre une methode d apprentissage sans montrer ses
     * garde-fous laisse croire qu il n y en a pas. */
    ok(/8% per token/.test(v.banque.replace(/\s/g, ' ')) || /8%/.test(v.banque),
       'les bornes qu il ne peut pas franchir sont ecrites : ' + (v.banque.match(/Bornes[^]{0,90}/) || [''])[0]);
      ok(/floor/.test(v.banque), 'y compris le plancher sous lequel il arrete d ouvrir');
    ok(/Presence required/.test(v.banque) && /telegram/.test(v.banque),
       'et la presence exigee d un projet est affichee : « '
       + (v.banque.match(/Presence exigee[^B]*/) || [''])[0].trim() + ' »');

    /* Le releve de chaque methode, AVEC le nombre d observations. */
    ok(/12 obs/.test(v.banque) && /9 obs/.test(v.banque),
       'et le releve de chaque methode porte son nombre d observations');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
  console.log('\n-- et quand il arrete d ouvrir, il le dit --');
  {
    const { page, boum } = await ouvre(nav, port,
      { vue: vueFausse({ arret: 'treasury below the $100 floor: we stop opening' }) });
    const v = await lit(page);
    console.log('   ' + (v.banque.match(/⛔[^]{0,70}/) || [''])[0]);
    ok(/floor/.test(v.banque),
       'l arret est affiche avec sa raison, pas comme une panne');
    ok(!/Next stake/.test(v.banque),
       'et aucune « prochaine mise » n est proposee : il n y en a pas');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
}

/* ==========================================================================
 * 12. LA SURVEILLANCE, LA STRUCTURE, LES SERVICES
 * ==========================================================================*/
async function panneaux() {
  console.log('\n-- la case surveillance --');
  const { page, boum } = await ouvre(nav, port, {});
  const v = await lit(page);
  console.log('   ' + v.survN + ' · ' + v.surveillance.slice(0, 90));
  ok(/PRESQUE/.test(v.surveillance) && /PATIENT/.test(v.surveillance),
     'les jetons gardes a l oeil sont listes');
  ok(/3 looks/.test(v.surveillance),
     'avec le nombre de fois ou ils ont ete examines — c est le chiffre qui montre qu on ne les rejuge pas en boucle');
  ok(/37 banned/.test(v.survN),
     'et les bannis sont comptes a part : ils ne reviendront jamais (' + v.survN + ')');

  console.log('\n-- ou elle a regarde, et ce qu elle n a pas encore juge --');
  console.log('   ' + v.flowcount);
  ok(/0-5 min ×3/.test(v.flowcount) && /20-60 min ×1/.test(v.flowcount),
     'la repartition par age est affichee : sans ce compte, « elle regarde partout » est une phrase');
  ok(!/1-6 h/.test(v.flowcount), 'et une bande ou elle n a rien vu n est pas listee comme si elle l avait vue');
  console.log('   ' + (v.surveillance.match(/\d+ sortie[^—]*/) || ['(rien)'])[0]);
  ok(/1 exit\(s\) awaiting/.test(v.surveillance) && /MONTE at \+42%/.test(v.surveillance),
     'les gains pris mais pas encore juges sont montres : une question ouverte s affiche, sinon la '
     + 'lecon a l air de sortir de nulle part quand elle arrive');
  ok(/what holding would have given/.test(v.surveillance), 'avec ce qu on attend pour trancher');

  console.log('\n-- ce que la colonie a change a elle-meme --');
  console.log('   ' + v.structure.slice(0, 150));
  ok(/naissance/.test(v.structure) && /ordre/.test(v.structure),
     'les deux gestes sont au journal : une naissance et un changement d ordre');
  ok(/standard deviation of 42 points/.test(v.structure),
     'la naissance porte la MESURE qui l a decidee, pas une formule');
  ok(/refus 79%/.test(v.structure),
     'et le changement d ordre porte les taux de refus mesures');

  console.log('\n-- ce qui est lu, et ce qui ne peut pas l etre --');
  ok(/GeckoTerminal · new pools/.test(v.services) && /trades one by one/.test(v.services),
     'les services sont listes avec ce que chacun apporte');
  ok(/111\/120/.test(v.services), 'avec leur releve reel (111/120 pour la chaine)');
  ok(/last failure: 429/.test(v.services),
     'et le dernier echec en clair quand il y en a un');
  ok(/GMGN/.test(v.services) && /Cloudflare/.test(v.services),
     'GMGN est NOMME avec la raison mesuree, plutot que passe sous silence');
  ok(/on ethereum too/.test(v.services),
     'et la raison distingue « protection anti-robot » de « ne connait pas la chaine 4663 »');
  ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
  await page.context().close();
}


/* ==========================================================================
 * 13. LA CAPITALISATION D'ACHAT, LE GRAPHIQUE, LES RESEAUX
 *
 * « Position ouverte, on doit voir le market cap d'achat. » « Affiche le lien
 *   DexScreener des positions ouvertes, le contrat, les réseaux s'il y en a. »
 * ==========================================================================*/
async function ficheDeLaPosition() {
  console.log('\n-- ce qu on voit d une position en cours --');
  const { page, boum } = await ouvre(nav, port, {});
  const v = await lit(page);
  const pos = await page.evaluate(() =>
    [...document.querySelectorAll('#positions .posbloc')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('   ' + pos[0]);
  /* ---- POURQUOI LA CAPITALISATION COMPTE ----
   * Un +40 % depuis une capitalisation de vingt mille et un +40 % depuis deux
   * millions ne sont pas le meme evenement, et ne se reproduisent pas de la
   * meme facon. Sans elle, le chiffre de gain ne se compare a rien. */
  ok(/bought at \$310k cap/.test(pos[0]),
     'la capitalisation AU MOMENT DE L ACHAT est affichee (310k)');
  ok(/bought at \$45k cap/.test(pos[1]), 'sur chaque position, pas seulement la premiere');
  ok(/extended 1×/.test(pos[0]), 'et le fait que le Promoteur l ait gardee une fois de plus');

  console.log('   ' + JSON.stringify(v.liens));
  /* ---- UN LIEN QU'ON SAIT MORT NE S'OFFRE PAS ----
   * On pointait toujours vers DexScreener, qui ne connait qu'un jeton sur
   * douze a deux minutes : le lien ouvrait une page vide et rien ne
   * prevenait. GeckoTerminal est la source d'ou vient le pool — sa page
   * existe forcement. */
  const chart = v.liens.filter((l) => /chart/.test(l));
  ok(chart.length === 2, 'chaque position porte un lien vers son graphique');
  ok(/geckoterminal\.com\/robinhood\/pools\/0xpool3/.test(chart[0]),
     'et il pointe vers la source d ou vient le pool, donc une page qui existe : '
     + chart[0].split('→')[1]);
  const ds = v.liens.filter((l) => /dexscreener/.test(l));
  ok(ds.length === 1 && /0xpool3/.test(ds[0]),
     'DexScreener n est ajoute que pour la position dont on SAIT qu il connait la paire');
  const muets = await page.evaluate(() =>
    [...document.querySelectorAll('#positions .lienpetit.muet')].map((x) => x.textContent.trim()));
  console.log('   ' + JSON.stringify(muets));
  ok(muets.indexOf('not on DexScreener yet') >= 0,
     'et pour l autre, on le DIT plutot que d offrir un lien mort — « token not found » au bout '
     + 'd un lien qu on a soi-meme propose est pire qu une absence de lien');
  ok(v.liens.some((l) => /twitter/.test(l) && /x\.com\/nova/.test(l)),
     'les reseaux sont la quand il y en a');
  /* Et quand il n'y en a pas, on l'ECRIT : un jeton sans aucune presence est
     une information, pas un defaut d'affichage. */
  const pas = await page.evaluate(() =>
    [...document.querySelectorAll('#positions .lienpetit.muet')].map((x) => x.textContent.trim()));
  console.log('   sans reseau : ' + JSON.stringify(pas));
  ok(pas.indexOf('no socials') >= 0,
     'et quand il n y en a pas, c est ecrit plutot que laisse vide');
  ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
  await page.context().close();
}

/* ==========================================================================
 * 14. LE FIL NE REPETE PLUS LES POSITIONS
 *
 * « Pourquoi il y a trades en direct et positions ? Retire trades en direct si
 *   c'est la même chose. »
 * ==========================================================================*/
async function filSansDoublon() {
  console.log('\n-- le fil ne redit pas ce qui est deja au-dessus --');
  const { page, boum } = await ouvre(nav, port, {});
  const v = await lit(page);
  console.log('   ' + JSON.stringify(v.feed));
  ok(v.feed.length === 2, 'seules les positions FERMEES y figurent (' + v.feed.length + ')');
  ok(!v.feed.some((f) => /OPENED/.test(f)),
     'l ouverture de $NOVA n y est plus : elle est deja listee juste au-dessus, avec plus de detail');
  ok(v.feed.some((f) => /GAIN/.test(f)) && v.feed.some((f) => /LOSS/.test(f)),
     'et les resultats, eux, ne sont visibles nulle part ailleurs');
  /* Une coupe de la Sentinelle doit se distinguer d'une fermeture au terme,
     sinon son travail est invisible — donc invérifiable. */
  ok(v.feed.some((f) => /by sentinelle/.test(f)),
     'une coupe precoce dit qui l a decidee : « ' + (v.feed.find((f) => /sentinelle/.test(f)) || '') + ' »');
  ok(/threshold 55/.test(v.fermN), 'et l en-tete porte le seuil d entree du moment (' + v.fermN + ')');
  ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
  await page.context().close();
}

/* ==========================================================================
 * 15. CE DONT LA COLONIE A BESOIN
 * ==========================================================================*/
async function panneauAlertes() {
  console.log('\n-- les alertes --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const v = await lit(page);
    console.log('   ' + v.alerteN + ' · ' + v.alertes.slice(0, 120));
    ok(!v.alerteCachee, 'la carte apparait quand il y a quelque chose a demander');
    ok(v.alerteN === '2', 'les deux alertes sont comptees');
    ok(/34% of reads/.test(v.alertes),
       'chacune porte le CHIFFRE qui la justifie : une demande sans son chiffre ne peut pas '
       + 'etre refusee intelligemment');
    ok(/dedicated RPC/.test(v.alertes) && /ANTHROPIC_API_KEY/.test(v.alertes),
       'et ce qu il faudrait faire, precisement');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
  {
    const { page } = await ouvre(nav, port, { vue: vueFausse({ alertes: [] }) });
    const v = await lit(page);
    ok(v.alerteCachee, 'et elle disparait quand la colonie n a besoin de rien');
    await page.context().close();
  }

  /* ---- LA COLONNE EST REPLIEE, ET « CE QU IL LUI FAUT » EST EN BAS ----
   *
   * « Met le tout en bas comme bloque et tous les blocs sont fermes de base,
   *   faut cliquer sur le petit bouton pour les ouvrir. »
   *
   * Deux choses a tenir, et elles se defont facilement l'une sans l'autre :
   * un panneau qu'on ajoute en oubliant qu'il part replie s'ouvre tout seul,
   * et un panneau replie SANS bouton visible est un panneau perdu — c'est le
   * risque exact de tout fermer par defaut. On verifie donc les deux, plus le
   * fait que le choix d'ouvrir survit au rechargement : sinon chaque visite
   * redemanderait le meme clic. */
  /* ---- LA BARRE DU HAUT EST CELLE DU SITE ----
   *
   * « Le menu de SWOGE AI et la barre en haut doivent etre pareils que Home ;
   *   il manque des choses dans la barre en haut. »
   *
   * Deux manques, et les deux etaient invisibles a la lecture :
   *
   *   1. Le bloc des quatre chiffres etait dans le balisage, `hidden`, et RIEN
   *      ne le remplissait. Sur les vingt-neuf pages qui portent cette barre,
   *      celle-ci etait la SEULE sans son remplisseur — la barre s'ouvrait
   *      donc avec un trou la ou les autres annoncent joueurs, volume,
   *      manches et gains.
   *
   *   2. « CONNECT WALLET » et « SIGN UP — EMAIL » etaient peints et branches
   *      sur rien : aucun gestionnaire ici, aucun dans les fichiers charges.
   *      Un bouton inerte a exactement l'air d'un bouton qui marche, et c'est
   *      la panne que ce depot documente comme la pire de toutes.
   *
   * On verifie donc ce que l'oeil ne peut pas verifier : que le remplisseur
   * existe ET aboutit, et que le clic PRODUIT quelque chose. */
  console.log('\n-- la barre du haut, comme sur les autres pages --');
  {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 160)));
    await page.route(/geckoterminal|gopluslabs|dexscreener|rpc\.mainnet|honeypot\.is|blockscout/,
                     (r) => r.abort());
    await page.route(/\/ai\/colonie/, (r) => r.fulfill({
      contentType: 'application/json', body: JSON.stringify(vueFausse()) }));
    /* Le serveur de la vitrine rend quatre nombres ; on les choisit pour que
       l'arrondi soit VERIFIABLE : 4 799 999 doit s'ecrire « 4.7M » et non
       « 4.8M » — annoncer plus que la verite sur un volume est le defaut que
       ce format existe pour eviter. */
    await page.route(/vitrine\.json/, (r) => r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ joueurs: 1284, volume: 4799999, manches: 98123, rendus: 3210000 }) }));
    await page.goto('http://127.0.0.1:' + port + '/' + PAGE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);

    const b = await page.evaluate(() => {
      const bloc = document.getElementById('gxChiffres');
      return {
        vu: bloc ? !bloc.hidden : null,
        titres: [...document.querySelectorAll('#gxChiffres small')].map((x) => x.textContent),
        valeurs: [...document.querySelectorAll('#gxChiffres b[data-n]')].map((x) => x.textContent),
        marque: !!document.querySelector('.sw-marque'),
        avatar: !!document.getElementById('gxProfil'),
        ancre: !!document.querySelector('.sb-ancre'),
      };
    });
    console.log('   ' + JSON.stringify(b));
    ok(b.vu === true, 'les quatre chiffres apparaissent : le bloc n est plus un trou dans la barre');
    ok(b.titres.join(',') === 'PLAYERS,CASINO VOLUME,ROUNDS PLAYED,WINNINGS PAID',
       'et ce sont les memes quatre que sur les autres pages (' + b.titres.join(' · ') + ')');
    ok(b.valeurs.join(',') === '1.2k,4.7M,98.1k,3.2M',
       'ils portent les nombres du serveur, arrondis vers le BAS ('
       + b.valeurs.join(' · ') + ') — « 4.8M » annoncerait de l argent qui n a pas ete joue');
    ok(b.marque && b.avatar && b.ancre,
       'la marque, l avatar et l ancre de la bulle sont la, comme ailleurs');

    /* ---- ET LE BOUTON REPOND ----
     * On ne juge pas ce qu'il ouvre : on verifie qu'il PRODUIT quelque chose.
     * Avant, le clic ne changeait rien du tout, nulle part. */
    const avant = await page.evaluate(() => ({
      dit: document.getElementById('stagetag').textContent,
      ouvert: document.querySelectorAll('.on').length,
    }));
    await page.click('#connectBtn');
    await page.waitForTimeout(500);
    const apres = await page.evaluate(() => ({
      dit: document.getElementById('stagetag').textContent,
      ouvert: document.querySelectorAll('.on').length,
    }));
    console.log('   clic : ' + avant.ouvert + ' -> ' + apres.ouvert + ' element(s) ouvert(s)');
    ok(apres.ouvert > avant.ouvert || apres.dit !== avant.dit,
       'CONNECT WALLET fait quelque chose — il etait peint et branche sur rien');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await ctx.close();
  }

  /* ---- ET LE MENU DE GAUCHE SE VOIT VRAIMENT ----
   *
   * Le balisage etait bon depuis le debut : six entrees, dans l'ordre de
   * l'accueil. Il ne se DESSINAIT pas. Une regle `@media (max-width:1360px)`
   * mettait `.sw-cote` a `display:none` — donc a 1280 px, une largeur
   * d'ordinateur portable tout a fait ordinaire, l'accueil montrait sa
   * colonne et cette page-ci n'en montrait aucune. On pouvait relire le HTML
   * dix fois sans rien voir : c'est la feuille de style qui l'effacait.
   *
   * L'accueil ne cache jamais le sien, il le couche en rangee. On verifie
   * donc la seule chose qui compte : a chaque largeur, les six entrees sont
   * VISIBLES et une d'elles emmene vraiment quelque part. Compter les balises
   * n'aurait rien vu — c'etait deja le cas quand le menu etait invisible. */
  console.log('\n-- le menu de gauche se voit a toutes les largeurs --');
  for (const large of [1920, 1280, 900, 390]) {
    const ctx = await nav.newContext({ viewport: { width: large, height: 900 } });
    const page = await ctx.newPage();
    await page.route(/geckoterminal|gopluslabs|dexscreener|rpc\.mainnet|honeypot\.is|blockscout/,
                     (r) => r.abort());
    await page.route(/\/ai\/colonie/, (r) => r.fulfill({
      contentType: 'application/json', body: JSON.stringify(vueFausse()) }));
    await page.route(/vitrine\.json/, (r) => r.fulfill({
      contentType: 'application/json', body: '{}' }));
    await page.goto('http://127.0.0.1:' + port + '/' + PAGE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1100);
    const v = await page.evaluate(() => {
      const a = [...document.querySelectorAll('.sw-nav a')];
      return {
        liens: a.map((x) => x.getAttribute('href')),
        vus: a.filter((x) => x.getBoundingClientRect().width > 0).length,
        deborde: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    ok(v.vus === 6,
       large + 'px : les six entrees se voient (' + v.vus + '/6)');
    ok(v.liens.join(',') === 'index.html,games.html,swogebet.html,swoge_wallet.html,'
         + 'swoge_ai.html,whitepaper.html',
       large + 'px : et ce sont celles de l accueil, dans le meme ordre');
    ok(!v.deborde, large + 'px : et rien ne deborde sur le cote');
    /* Visible ne suffit pas : un lien qu'on ne peut pas atteindre est un lien
       mort avec une belle apparence. */
    let arrive = 'rien';
    try {
      await page.click('.sw-nav a[href="swoge_wallet.html"]', { timeout: 5000 });
      await page.waitForTimeout(700);
      arrive = page.url().split('/').pop();
    } catch (e) { arrive = 'clic impossible'; }
    ok(arrive === 'swoge_wallet.html',
       large + 'px : et un clic emmene vraiment sur la page (' + arrive + ')');
    await ctx.close();
  }

  console.log('\n-- les trois onglets, et la colonne repliee --');
  {
    /* ---- CE QUE CETTE SECTION MESURE MAINTENANT ----
     * Elle mesurait « tout est replie ». Ce n'etait pas le but, c'etait le
     * moyen : le but est qu'on sache OU REGARDER. Treize titres identiques a
     * la file, tous fermes, ne le disent pas mieux que treize ouverts — ils
     * demandent seulement treize decisions au lieu d'une.
     *
     * Les panneaux sont donc ranges en trois groupes, par la question a
     * laquelle ils repondent, et un seul groupe est montre a la fois. Ce qui
     * est mesure ici : qu'un groupe ne soit jamais vide, que rien ne soit
     * PERDU en route, que le compteur d'un panneau replie reste lisible, et
     * que les deux choix — l'onglet et le pli — soient gardes. */
    const { page, boum } = await ouvre(nav, port, {});
    const p = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.card[data-pan]')];
      const h = c[0].querySelector('h2');
      const ap = getComputedStyle(h, '::after');
      const grp = [...document.querySelectorAll('.grp[data-grp]')];
      const visible = grp.filter((g) => !g.hidden);
      const dedans = visible.length ? [...visible[0].querySelectorAll('.card[data-pan]')] : [];
      return {
        pans: c.map((x) => x.dataset.pan),
        groupes: grp.map((g) => g.dataset.grp),
        montres: visible.map((g) => g.dataset.grp),
        onglets: [...document.querySelectorAll('.onglet[data-grp]')].map((b) => b.dataset.grp),
        choisi: (document.querySelector('.onglet[aria-selected="true"]') || {}).dataset,
        /* Par groupe : combien de panneaux y sont ouverts. Un onglet dont les
           quatre titres sont replies se lit comme un onglet vide. */
        ouvertsParGroupe: grp.map((g) => [...g.querySelectorAll('.card[data-pan]')]
          .filter((x) => !x.classList.contains('plie')).length),
        /* Le compteur reste lisible replie : c'est lui qui dit ce qu'il y a
           dedans, donc s'il vaut la peine d'etre ouvert. On ne compte que le
           groupe MONTRE — un panneau d'un autre onglet n'a pas de boite, et
           « invisible » y voudrait dire « pas a l'ecran », pas « muet ». */
        avecCompteur: dedans.filter((x) => x.querySelector('h2 .count')).length,
        compteursVus: dedans.filter((x) => {
          const n = x.querySelector('h2 .count');
          return n && n.offsetParent !== null;
        }).length,
        bouton: { w: ap.width, fond: ap.backgroundColor, contenu: ap.content },
        curseur: getComputedStyle(h).cursor,
      };
    });
    console.log('   ' + JSON.stringify({ groupes: p.groupes, montre: p.montres,
                                         ouvertsParGroupe: p.ouvertsParGroupe }));
    ok(p.onglets.length === p.groupes.length && p.groupes.length === 3,
       'trois onglets, trois groupes, et un bouton pour chacun');
    ok(p.montres.length === 1 && p.choisi && p.choisi.grp === p.montres[0],
       'un seul groupe est montre a la fois, et c est celui que l onglet marque comme choisi ('
       + p.montres.join(', ') + ')');
    /* ---- RIEN N'EST PERDU EN CHEMIN ----
     * C'est la seule chose qui rendrait le rangement pire que la file : un
     * panneau qui n'est dans aucun groupe n'est plus atteignable du tout. */
    const dansUnGroupe = await page.evaluate(() =>
      [...document.querySelectorAll('.card[data-pan]')].filter((x) => x.closest('.grp')).length);
    ok(dansUnGroupe === p.pans.length,
       'les ' + p.pans.length + ' panneaux sont tous dans un groupe : ranger n est pas retirer');
    /* ---- AU MOINS UN, ET NON EXACTEMENT UN ----
     * La regle exigeait UN seul panneau deplie par groupe. Sa raison, ecrite
     * ici, n a jamais porte que sur le zero : « un onglet dont tout est replie
     * se lit comme un onglet vide ». Le groupe « Live » en porte deux depuis
     * que le miroir existe — les positions, qui RACONTENT, et le miroir, qui
     * PROPOSE quelque chose au lecteur. Une carte qui demande un geste et qui
     * s ouvre repliee est une carte que personne ne voit ; deux cartes ouvertes
     * ne sont pas le defaut que ce rangement a corrige, qui etait treize titres
     * identiques a la file. */
    ok(p.ouvertsParGroupe.every((n) => n >= 1),
       'et chaque groupe s ouvre sur au moins un panneau deja deplie : un onglet dont tout est '
       + 'replie se lit comme un onglet vide (' + p.ouvertsParGroupe.join('/') + ')');
    ok(p.pans[p.pans.length - 1] === 'alertes',
       'et « ce dont la colonie a besoin » est le dernier bloc de la colonne');
    ok(p.avecCompteur >= 3 && p.compteursVus === p.avecCompteur,
       'chaque titre qui a un compteur le garde sous les yeux : replie ne veut pas dire muet ('
       + p.compteursVus + '/' + p.avecCompteur + ' dans l onglet montre)');
    /* Le chevron n'est pas qu'un caractere : il porte une pastille, donc il a
       une largeur et un fond. Sans ca il ne se lit pas comme un bouton. */
    ok(parseFloat(p.bouton.w) >= 14 && !/^rgba\(0, 0, 0, 0\)$/.test(p.bouton.fond),
       'le petit bouton se voit vraiment : une pastille, pas un caractere gris ('
       + p.bouton.w + ', ' + p.bouton.fond + ')');
    ok(p.curseur === 'pointer', 'et le titre entier se clique');

    /* ---- ON OUVRE UN PANNEAU REPLIE, ET IL RESTE OUVERT ----
     * On prend celui que la page a laisse ferme : cliquer sur celui qui est
     * deja ouvert le FERMERAIT, et l'essai mesurerait alors le contraire de ce
     * qu'il annonce. */
    const cible = await page.evaluate(() => {
      const g = [...document.querySelectorAll('.grp[data-grp]')].find((x) => !x.hidden);
      const c = [...g.querySelectorAll('.card[data-pan]')].find((x) => x.classList.contains('plie'));
      c.querySelector('h2').click();
      return c.dataset.pan;
    });
    await page.waitForTimeout(120);
    const ouvert = await page.evaluate((k) =>
      !document.querySelector('.card[data-pan="' + k + '"]').classList.contains('plie'), cible);
    ok(ouvert, 'un clic sur un titre replie ouvre le panneau (' + cible + ')');

    /* ---- ET LES DEUX CHOIX SURVIVENT A LA VISITE SUIVANTE ----
     * L'onglet aussi : quelqu'un qui vient pour l'audit des vetos ne veut pas
     * le rechercher chaque fois. */
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.onglet[data-grp]')].pop();
      b.click();
    });
    await page.waitForTimeout(80);
    const vise = await page.evaluate(() =>
      (document.querySelector('.onglet[aria-selected="true"]') || {}).dataset.grp);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    const apres = await page.evaluate((k) => ({
      pan: !document.querySelector('.card[data-pan="' + k + '"]').classList.contains('plie'),
      onglet: (document.querySelector('.onglet[aria-selected="true"]') || {}).dataset.grp,
    }), cible);
    console.log('   apres rechargement : ' + JSON.stringify(apres));
    ok(apres.pan, 'et il est toujours ouvert a la visite suivante : le choix est garde, pas devine');
    ok(apres.onglet === vise,
       'l onglet choisi aussi (' + apres.onglet + ') — sinon on rechoisit sa question a chaque visite');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
}


/* ==========================================================================
 * 16. CE QUE DEVIENNENT LES JETONS REFUSES
 *
 * C'est la seule partie de l'ecran qui juge les REGLES plutot que les jetons.
 * Les agents n'apprenaient que des jetons achetes — donc de ceux qui avaient
 * passe tous les vetos — et ne pouvaient donc pas savoir si ces vetos
 * protegeaient. Maintenant chaque jeton analyse est resuivi.
 * ==========================================================================*/
async function auditDesVetos() {
  console.log('\n-- l audit des refus --');
  const { page, boum } = await ouvre(nav, port, {});
  const v = await lit(page);
  console.log('   ' + v.auditN);
  ok(/218 followed/.test(v.auditN) && /34 running/.test(v.auditN),
     'le compte des jetons resuivis est affiche (' + v.auditN + ')');
  ok(/one holder holds 90%/.test(v.audit) && /score too low/.test(v.audit),
     'chaque raison de refus a sa ligne');
  ok(/140 token\(s\) followed/.test(v.audit) && /96 collapsed/.test(v.audit),
     'avec ce que les ecartes ont VRAIMENT fait : ' + (v.audit.match(/140[^·]*·[^·]*/) || [''])[0]);

  /* ---- LE CHIFFRE QUI COMPTE ----
   * Pas la moyenne : la part de ceux qui sont MONTES malgre le refus. Une
   * moyenne negative peut cacher un sur cinq qui a fait dix fois. */
  ok(/32% went up/.test(v.audit) && /5% went up/.test(v.audit),
     'la part des ecartes qui sont montes est en tete de chaque ligne');
  /* Et la phrase porte LA MESURE, pas un ordre de grandeur : elle disait
     « un sur quatre » sur des lignes qui en mesuraient deux sur trois — donc
     le contraire du chiffre juste au-dessus d'elle. */
  ok(/32% of what this rule set aside went up/.test(v.audit)
     && /costs more than it protects/.test(v.audit),
     'un veto dont les ecartes montent est SIGNALE comme un cout, avec sa part reelle');
  ok(!/5% of what this rule set aside went up/.test(v.audit),
     'et celui qui protege ne porte pas la phrase : 5 % de montees n est pas un cout');
  const cout = await page.evaluate(() =>
    [...document.querySelectorAll('#audit .pill')].map((p) => p.textContent.trim() + ':' + p.className));
  console.log('   ' + JSON.stringify(cout));
  ok(/retrait/.test(cout[0]) && /naissance/.test(cout[1]),
     'les deux se distinguent d un coup d oeil, sans avoir a lire les chiffres');
  ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
  await page.context().close();

  console.log('\n-- et quel trait separe vraiment --');
  console.log('   ' + v.traitsN);
  ok(/3 traits/.test(v.traitsN) && /914 readings/.test(v.traitsN),
     'le nombre de traits classes et de relevés est affiche (' + v.traitsN + ')');
  ok(/pool >\$100k \+21\.4%/.test(v.traits) && /pool <\$1k -29\.8%/.test(v.traits),
     'chaque trait montre sa meilleure et sa pire valeur, avec leurs effectifs');
  ok(v.traits.indexOf('liq') < v.traits.indexOf('vola'),
     'et le classement met en tete celui qui separe : liq avant vola');
  ok(/re-read at 5, 15, 30, 60, 120 minutes/.test(v.traits),
     'la page dit a quelles echeances chaque jeton est relu');
  ok(/separates nothing, and dilutes/.test(v.traits),
     'et explique pourquoi le bas de liste compte : un trait qui ne separe rien dilue les autres');

  const b = await ouvre(nav, port, { vue: vueFausse({ audit: [] }) });
  const w = await lit(b.page);
  /* La page est en anglais par defaut depuis qu'elle a rejoint le site : on
     cherche donc la phrase telle qu'elle est ECRITE dans le HTML, pas sa
     traduction. Le francais vit dans une table et se verifie ailleurs. */
  ok(/followed to its deadline/.test(w.audit),
     'et sans releve, la carte explique ce qu on attend plutot que de rester vide');
  await b.page.context().close();
}

(async () => {
  if (!chromium) { console.log('playwright absent — essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  port = srv.address().port;
  nav = await chromium.launch();

  /* ======================================================================
   * 1. LE SERVEUR NE REPOND PAS
   * ==================================================================== */
  console.log('\n-- le serveur ne repond pas --');
  {
    const { page, boum, appels } = await ouvre(nav, port, { horsLigne: true });
    const v = await lit(page);
    console.log('   ' + JSON.stringify({ bal: v.bal, pouls: v.pouls, stamp: v.stamp, pos: v.pos }));
    /* ---- LA FAUTE A NE PAS COMMETTRE ----
     * « $1,000 » se lit comme une tresorerie a son point de depart : une
     * colonie qui tourne et qui n'a rien gagne. Ce n'est pas ce qui se passe —
     * on ne sait simplement rien. Les deux se ressemblent a l'ecran et ne
     * veulent pas dire la meme chose. */
    ok(v.bal === '—', 'la tresorerie n est pas affichee : « ' + v.bal +' », pas « $1,000 »');
    ok(!v.delta, 'ni la variation, qui n aurait aucun sens sans point de depart lu');
    ok(v.trades === '—' && v.best === '—' && v.wr === 'win —',
       'ni les trades, ni le meilleur, ni le taux de reussite');
    /* La page ouvre en ANGLAIS : le pouls le dit donc en anglais. Il etait
       ecrit en francais en dur, a cote de panneaux anglais, exactement la ou
       l'oeil se pose quand quelque chose ne va pas. */
    ok(v.pouls === 'OFFLINE', 'le pouls le dit, dans la langue de la page (' + v.pouls + ')');
    ok(/mort/.test(v.stampCls), 'la pastille est en rouge et dit qu elle n a rien (« ' + v.stamp + ' »)');
    ok(/server/i.test(v.tag), 'et la page l ECRIT en toutes lettres : « ' + v.tag.slice(0, 90) + ' »');
    ok(/invented/i.test(v.tag), 'en disant qu elle n invente rien pour combler');
    ok(v.positions.length === 0 && /waiting for the server/i.test(v.positionsTxt),
       'aucune position n est affichee');
    ok(!/\$/.test(v.appris) && /Nothing yet/.test(v.appris), 'et aucune lecon n est tiree de rien');
    ok(appels.autres.length === 0,
       'la page n a appele AUCUN service de donnees elle-meme : le serveur les lit pour tout le monde');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 2. LE SERVEUR REPOND : LA PAGE MONTRE SES CHIFFRES, ET SEULEMENT EUX
   * ==================================================================== */
  console.log('\n-- ce que la page affiche vient du serveur --');
  {
    const { page, boum, appels } = await ouvre(nav, port, {});
    const v = await lit(page);
    console.log('   ' + JSON.stringify({ bal: v.bal, profit: v.profit, trades: v.trades, wr: v.wr, pos: v.pos }));
    ok(appels.serveur >= 1, 'la page a demande /ai/colonie (' + appels.serveur + ')');
    ok(appels.autres.length === 0,
       'et rien d autre : plus de GeckoTerminal, plus de GoPlus, plus de RPC depuis le navigateur');
    ok(/1,1[78]/.test(v.bal), 'la tresorerie affichee est celle du serveur ($1,187.50 → ' + v.bal + ')');
    ok(v.profit === '+$188' || v.profit === '+$187', 'le profit en decoule (' + v.profit + ')');
    ok(v.trades === '9' && v.wr === 'win 67%',
       '9 trades, 6 gagnants → win 67 % (' + v.trades + ', ' + v.wr + ')');
    ok(v.best === '1.42×', 'et le meilleur multiple (' + v.best + ')');
    ok(v.pos === '2' && v.positions.length === 2, 'les deux positions ouvertes sont affichees');
    ok(/NOVA/.test(v.positions[0]) && /\+6\.4%/.test(v.positions[0]),
       'avec leur valeur latente calculee par le serveur (' + v.positions[0] + ')');
    /* Le serveur a envoye `latent: null` : il n'a pas relu de prix. La page ne
       doit pas en faire un 0 %, qui se lirait comme « ca ne bouge pas ». */
    /* ---- « PRIX NON RELU » NE DISAIT PAS ASSEZ ----
     * Le mot etait juste, mais il ne disait pas DEPUIS QUAND — et sans ce
     * chiffre, un tour manque et un jeton sorti des flux depuis une heure se
     * ressemblent, alors qu'ils ne veulent pas dire la meme chose. */
    console.log('   ' + v.positions[1]);
    ok(/last price 40min ago/.test(v.positions[1]),
       'celle dont le prix est perime dit depuis QUAND (' + v.positions[1] + ')');
    ok(!/\+0\.0%/.test(v.positions[1]),
       'et surtout pas « +0,0 % », qui ferait passer un prix d entree pour une cotation');
    ok(v.feed.length === 2 && /PEPO/.test(v.feed[0]), 'le fil des trades vient du serveur aussi');
    ok(/LIVE/.test(v.pouls), 'le pouls est vert : le serveur a fini un tour recemment');
    ok(/server at \d\d:\d\d/.test(v.stamp), 'et la pastille porte l heure du SERVEUR (« ' + v.stamp + ' »)');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 3. LES SIX AGENTS, ET CE QU ILS ONT APPRIS
   * ==================================================================== */
  console.log('\n-- les lecons viennent du serveur, avec leur nombre d observations --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const v = await lit(page);
    /* ---- LE NOMBRE D'AGENTS N'EST PLUS UNE CONSTANTE ----
     * Cet essai en attendait six. Il en attendait six parce que la page en
     * dessinait six, et la page en dessinait six parce que quelqu'un les avait
     * ecrits. Maintenant c'est le serveur qui le dit, et ca change : un
     * specialiste nait, un autre est retire. On mesure donc l'ACCORD entre les
     * deux, pas un chiffre. */
    const attendus = vueFausse().roster.length;
    ok(v.agents.length === attendus,
       'la page dessine exactement autant d agents que le serveur en declare (' + v.agents.length + ')');
    const compteurs = v.agents.map((a) => a[0]).join(' | ');
    console.log('   ' + compteurs);
    ok(/240 tokens seen/.test(compteurs), 'le Scout porte le compte du SERVEUR (240 tokens vus)');
    /* Un garde dit ce qu'il bloque ET ce que ses donnees coutent : c'est de ces
       deux chiffres que sort son rang dans la file, donc ils doivent etre
       lisibles par la personne qui regarde. */
    ok(/190 blocked out of 240 seen \(79%\)/.test(compteurs),
       'chaque garde porte son taux de refus mesure (190/240 = 79 % pour le Whale)');
    ok(/1 call/.test(compteurs),
       'et ce que ses donnees coutent en appels — les deux chiffres qui decident de son rang');
    ok(/born 60min ago/.test(compteurs) && /never refuses/.test(compteurs),
       'un specialiste dit son age et qu il ne refuse jamais : il affine, il ne garde pas');
    ok(/stakes sized/.test(compteurs) && /method part \(learned\)/.test(compteurs),
       'le Banquier dit combien de mises il a posees, et avec quelle methode');
    ok(/hold 20 min \(learned\)/.test(compteurs),
       'et le Closer dit que sa tenue est APPRISE, pas celle par defaut');

    const lecons = v.agents.map((a) => a[1]);
    console.log('   ' + lecons.join(' | '));
    /* ---- CE QUI COMPTE ICI ----
     * Pas que tout le monde ait appris — le Banquier et un agent ne il y a une
     * heure n'ont rien pu apprendre encore, et le pretendre serait exactement
     * la faute que ce fichier traque. Ce qui compte : qui a appris le DIT avec
     * son nombre d'observations, et qui n'a rien appris le dit aussi. */
    const avecLecon = lecons.filter((l) => /\(\d+ obs\)/.test(l));
    const sansLecon = lecons.filter((l) => /learned nothing yet|no clear trend/.test(l));
    ok(avecLecon.length >= 5,
       avecLecon.length + ' agents publient leur meilleure lecon avec son nombre d observations');
    ok(avecLecon.length + sansLecon.length === lecons.length,
       'et les autres disent qu ils n ont rien appris — aucun n affiche une lecon sans compte');
    ok(sansLecon.length > 0,
       'un agent ne il y a une heure n a rien appris, et il l ecrit plutot que de faire semblant');
    ok(/confidence/.test(v.appris), 'et le detail publie la confiance qui va avec le nombre d observations');

    /* ---- UNE LECTURE RATEE N'EST PAS UNE LECON SUR LE JETON ----
     * Le releve du serveur montrait, en tete du Warden : « code inconnu,
     * 488 obs, +20,0 % », en vert, comme sa meilleure lecon. Ses trois traits
     * sortent du meme appel a GoPlus, silencieux 3 114 fois sur 3 237 : quand
     * il se tait, les trois disent « inconnu » ensemble, et la moyenne est
     * positive parce que c'est celle de TOUT ce que la colonie regarde.
     * Le serveur ne leur donne plus de points. L'ecran, lui, doit cesser de
     * les presenter comme un bon signe — sinon la correction est invisible la
     * ou elle se lit. */
    const wardenDit = lecons.find((l) => /code unknown|no tax/.test(l)) || '';
    console.log('   Warden : ' + wardenDit);
    ok(/no tax/.test(wardenDit),
       'la fiche du Warden met en titre sa lecon REELLE, pas sa lecture ratee — meme si celle-ci '
       + 'est mieux observee et mieux notee (« ' + wardenDit + ' »)');
    ok(/failed read/.test(v.appris),
       'et dans le detail, la case non lue est NOMMEE comme telle : « lecture ratee, pas le jeton »');
    ok(!/var\(--gain\)[^<]*code unknown/.test(v.apprisHtml || ''),
       'elle n est pas peinte en vert : la couleur se lit avant le mot');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 4. TOUT LE MONDE VOIT LA MEME CHOSE
   *
   * C'est la demande elle-meme, et c'est ce que le stockage local rendait
   * impossible. Deux navigateurs independants, deux stockages vierges,
   * un seul serveur.
   * ==================================================================== */
  console.log('\n-- deux visiteurs, un seul etat --');
  {
    const a = await ouvre(nav, port, {});
    const b = await ouvre(nav, port, {});
    const va = await lit(a.page), vb = await lit(b.page);
    console.log('   A : ' + va.bal + ' · ' + va.trades + ' trades   B : ' + vb.bal + ' · ' + vb.trades + ' trades');
    ok(va.bal === vb.bal && va.trades === vb.trades && va.wr === vb.wr,
       'meme tresorerie, memes trades, meme taux de reussite');
    ok(JSON.stringify(va.positions) === JSON.stringify(vb.positions),
       'memes positions ouvertes, au meme prix');
    ok(va.appris === vb.appris, 'et les memes lecons — une seule colonie, pas deux');

    /* ---- ET LE STOCKAGE LOCAL N EST PLUS UNE SOURCE ----
     * Avant, tout etait la-dedans : la tresorerie, les positions, les lecons.
     * Si quoi que ce soit d AFFICHE en venait encore, l effacer changerait
     * l ecran.
     *
     * Ce qui a le droit d y etre, ce sont les PREFERENCES de celui qui
     * regarde — sa langue, les panneaux qu il a replies. Elles ne sont l etat
     * de personne d autre, elles ne voyagent pas d un visiteur a l autre, et
     * les interdire obligerait a rechoisir sa langue a chaque visite. */
    const stock = await a.page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/colonie|swogeAi/i.test(k)) out[k] = (localStorage.getItem(k) || '').slice(0, 40);
      }
      return out;
    });
    console.log('   stockage local : ' + JSON.stringify(stock));
    /* L onglet ouvert et les panneaux replies sont des preferences de LECTURE,
       au meme titre que la langue : elles ne sont l etat de personne d autre. */
    const PREFS = ['swogeAiLangue', 'swogeAiPanneaux3', 'swogeAiOnglet'];
    const intrus = Object.keys(stock).filter((k) => PREFS.indexOf(k) < 0);
    ok(intrus.length === 0,
       intrus.length === 0
         ? 'rien d autre que les preferences de lecture n est ecrit ici : l etat de la colonie '
           + 'n est plus a la page'
         : 'il reste : ' + intrus.join(', '));
    /* Et l effacer ne change rien a ce qui est affiche : la page redemande
       tout au serveur. On ne clique plus « Live » — ce bouton n existe plus,
       il ne commandait que l animation — on attend le rafraichissement. */
    await a.page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await a.page.evaluate(() => { if (typeof demande === 'function') demande(true); });
    await a.page.waitForTimeout(700);
    const apres = await lit(a.page);
    ok(apres.bal === va.bal && apres.trades === va.trades,
       'et effacer le stockage local ne change rien a ce qui est affiche');
    ok(a.boum.length === 0 && b.boum.length === 0, 'aucune exception');
    await a.page.context().close(); await b.page.context().close();
  }

  await maisons();
  await contrat();
  await banquierEcran();
  await panneaux();
  await ficheDeLaPosition();
  await filSansDoublon();
  await panneauAlertes();
  await auditDesVetos();

  /* ======================================================================
   * 5. LES BOTS REJOUENT LA DECISION, ILS NE LA PRENNENT PAS
   *
   * L'animation est jolie et elle est publique : si un bot marchait jusqu'au
   * Closer pour un jeton que le serveur a refuse, l'ecran raconterait un achat
   * qui n'a pas eu lieu. Chaque refus appartient a un agent, et c'est LA que
   * le bot doit s'arreter.
   * ==================================================================== */
  console.log('\n-- le bot s arrete chez l agent a qui la raison appartient --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    /* ---- LE SERVEUR DIT QUI A REFUSE ----
     * La page relisait la PHRASE du refus pour deviner l'agent. Ca marchait, et
     * ca serait devenu faux au premier libelle qui change, sans que rien ne le
     * signale. Le serveur envoie desormais la cle. La lecture de la phrase ne
     * sert plus que de secours, pour une reponse qui ne la porterait pas.
     *
     * Et l'index n'est PLUS une position fixe : l'ordre des agents vient du
     * serveur et il bouge. On lit donc la cle a l'index rendu, jamais une
     * liste recopiee ici — c'est precisement cette liste recopiee qui rendait
     * l'ancien essai faux des que la colonie se reordonnait. */
    const m = await page.evaluate(() => {
      const cas = [
        { r: 'honeypot', q: 'warden', attendu: 'warden' },
        { r: 'sell tax 42%', q: 'warden', attendu: 'warden' },
        { r: 'one holder holds 88% of the float', q: 'whale', attendu: 'whale' },
        { r: 'a single wallet makes 92% of the volume', q: 'whisper', attendu: 'whisper' },
        { r: 'score too low', q: 'oracle', attendu: 'oracle' },
        /* Sans la cle — une reponse ancienne — la phrase doit encore suffire. */
        { r: 'honeypot', q: null, attendu: 'warden' },
        { r: '31 addresses touched the token, none of them holds it', q: null, attendu: 'whale' },
        { r: 'a single wallet makes 92% of the volume', q: null, attendu: 'whisper' },
        { r: 'score too low', q: null, attendu: 'oracle' },
        { r: null, q: null, attendu: null },
      ];
      return cas.map((c) => {
        const i = agentRefus({ refus: c.r, quiRefuse: c.q });
        return { r: c.r, cle: c.q, obtenu: i < 0 ? null : AGENTS[i].key, attendu: c.attendu };
      });
    });
    for (const x of m) {
      ok(x.obtenu === x.attendu,
         (x.cle ? '[cle] ' : '[phrase] ') + '« ' + (x.r === null ? 'aucun refus' : x.r) + ' » → '
         + (x.obtenu || 'le jeton va jusqu au Closer')
         + (x.obtenu === x.attendu ? '' : ' (attendu ' + x.attendu + ')'));
    }

    /* Et de bout en bout : le jeton refuse porte une pastille de rejet a la
       place de l'agent qui l'a refuse, pas ailleurs. */
    /* Le multiplicateur de vitesse est parti — il ne pressait que l animation,
       pas la colonie. Le banc attend donc le temps qu il faut. */
    let pos = null;
    for (let i = 0; i < 60 && pos === null; i++) {
      await page.waitForTimeout(500);
      pos = await page.evaluate(() => {
        for (const t of document.querySelectorAll('#flow .tok')) {
          if (!/PIEGE/.test(t.textContent)) continue;
          const d = [...t.querySelectorAll('.sd')];
          const i = d.findIndex((x) => x.classList.contains('rej'));
          if (i >= 0) return i;
        }
        return null;
      });
    }
    const iWarden = await page.evaluate(() => AGENTS.findIndex((a) => a.key === 'warden'));
    console.log('   $PIEGE : pastille de rejet a la position ' + pos
      + ' · le Warden est en ' + iWarden);
    ok(pos === iWarden,
       'le jeton piege est rejete CHEZ LE WARDEN, a la place que le serveur lui donne aujourd hui');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 4 ter. LE VILLAGE EST UNE CHAINE, ET SES HABITANTS SONT DES SHIBAS
   *
   * « Ça devrait pas être des robots mais des petits chiens, des shibas. Refais
   *   le graphique aussi, ça devrait être plus simple à comprendre pour les
   *   utilisateurs. »
   *
   * Neuf maisons en cercle autour du tresor, c'etait joli et ca ne disait
   * rien. Un jeton traverse les agents DANS UN ORDRE, et cet ordre est tout ce
   * qu'il y a a comprendre — sur un anneau il est invisible, rien ne dit par
   * ou commencer ni ou l'on va. Deplie de gauche a droite, avec le numero de
   * chaque etape et le tresor au bout, la page se lit comme une phrase.
   * ==================================================================== */
  console.log('\n-- le village se lit de gauche a droite --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const v = await page.evaluate(() => ({
      maisons: AGENTS.map((a) => ({ key: a.key, rang: a.rang, x: a.house.x, y: a.house.y })),
      tresor: TREASURY, entree: ENTREE, H: H, W: W,
    }));
    console.log('   ' + JSON.stringify(v.maisons.map((m) => m.rang + ':' + m.key)));
    ok(v.maisons.every((m, i) => m.rang === i + 1),
       'chaque maison porte son NUMERO d etape, dans l ordre du parcours');
    /* La premiere rangee va de gauche a droite. C'est le sens de lecture, et
       c'est le seul qui n'ait pas besoin d'etre explique. */
    const r1 = v.maisons.filter((m) => m.y === v.maisons[0].y);
    ok(r1.length > 1 && r1.every((m, i) => i === 0 || m.x > r1[i-1].x),
       'la premiere rangee va de gauche a droite (' + r1.map((m) => m.rang).join(' → ') + ')');
    /* Et la suivante repart en sens inverse : un serpentin, pour que la route
       ne traverse jamais le village en diagonale. */
    const ys = [...new Set(v.maisons.map((m) => m.y))];
    ok(ys.length > 1, 'et il y a plusieurs rangees (' + ys.length + ')');
    const r2 = v.maisons.filter((m) => m.y === ys[1]);
    ok(r2.length > 1 && r2.every((m, i) => i === 0 || m.x < r2[i-1].x),
       'la deuxieme repart en sens inverse : un serpentin, pas un retour a la ligne qui '
       + 'ferait traverser tout l ecran (' + r2.map((m) => m.rang).join(' → ') + ')');
    /* Le tresor est A LA FIN, pas au centre : c'est la seule position qui
       raconte quelque chose de vrai. */
    const dernier = v.maisons[v.maisons.length - 1];
    console.log('   tresor : ' + JSON.stringify(v.tresor) + ' · derniere maison : '
      + JSON.stringify({ x: dernier.x, y: dernier.y }));
    ok(v.tresor.y >= dernier.y,
       'le tresor est apres la derniere maison, pas au milieu du village');
    ok(v.entree.x < v.maisons[0].x,
       'et l entree est avant la premiere : on sait par quel bout commencer');
    /* Le monde suit le nombre de rangees : fige, il laissait un tiers d herbe
       vide sous un village de deux rangees. */
    ok(v.H < 900 && v.H > 300,
       'la hauteur du monde suit le village (' + v.H + ') au lieu d etre figee');

    /* ---- ET LES HABITANTS SONT DES CHIENS ----
     * On ne peut pas lire un canvas ; on lit ce qui le dessine. La couleur de
     * l agent n est plus la carrosserie, elle est le foulard — c est ce qu on
     * repere le plus vite sur un animal, et ca laisse les chiens se ressembler
     * entre eux, ce qu ils doivent faire pour se lire comme une meute. */
    const src = require('fs').readFileSync(require('path').join(SITE, PAGE), 'utf8');
    ok(/SHIBA_ROUX|SHIBA_CREME/.test(src), 'le pelage du shiba est nomme dans le code');
    ok(/queue/i.test(src) && /oreille/i.test(src),
       'avec la queue enroulee et les oreilles pointues : sans elles, un shiba de vingt '
       + 'pixels est un renard');
    ok(!/roundRect\(x-9,y-24,18,15,5\)/.test(src),
       'et la tete carree du robot a disparu');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 5 bis. LE VERDICT DE L EPREUVE DE SORTIE
   *
   * « Un bot dans le village avant le gros achat : il teste avec un centime
   *   un achat et une vente pour pas se faire honeypot. »
   *
   * Le serveur ne signe rien — il DEMANDE au contrat, par eth_call, ce qu'il
   * ferait si un vrai detenteur envoyait le jeton vers la piscine. Ce que la
   * page doit montrer, c'est le resultat AVEC SES CHIFFRES, et surtout les
   * trois etats distincts : passe, bloque, pas testable. Un « teste ✓ » nu se
   * lirait comme une garantie de pouvoir vendre — ce que cette epreuve n'est
   * pas, puisqu'elle simule le transfert et non l'echange entier.
   * ==================================================================== */
  console.log('\n-- l epreuve de sortie, a l ecran --');
  {
    const { page, boum } = await ouvre(nav, port, {});

    /* ---- ON CUMULE AU LIEU DE PHOTOGRAPHIER ----
     * Le panneau ne montre que ce qui est EN VOL : un jeton y entre, traverse,
     * puis sort. Une seule photo n en attrape donc qu une partie, et laquelle
     * depend de l instant — un essai qui se lit differemment a chaque passage
     * ne mesure plus la page, il mesure sa propre chance. On releve donc a
     * repetition et on garde ce qu on a vu. */
    const l = {};
    let miel = null, titre = null;
    for (let i = 0; i < 160; i++) {
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const out = { metas: {}, miel: null, titre: null };
        for (const t of document.querySelectorAll('#flow .tok')) {
          const m = t.querySelector('.meta');
          const s = t.querySelector('.sym');
          if (s && m) out.metas[s.textContent.replace('$', '')] = m.textContent.trim();
          if (/MIEL/.test(t.textContent)) {
            const d = [...t.querySelectorAll('.sd')];
            const k = d.findIndex((x) => x.classList.contains('rej'));
            if (k >= 0) out.miel = { i: k, txt: t.textContent.replace(/\s+/g, ' ').trim() };
          }
        }
        for (const x of document.querySelectorAll('#flow .meta .ok'))
          if (/exit/.test(x.textContent)) out.titre = x.getAttribute('title');
        return out;
      });
      Object.assign(l, r.metas);
      if (r.miel) miel = r.miel;
      if (r.titre) titre = r.titre;
      if (l.NOVA && l.INCONNU && miel && titre) break;
    }
    console.log('   ' + JSON.stringify(l));
    ok(/exit 3\/3/.test(l.NOVA || ''),
       'un jeton dont la sortie a ete testee porte ses CHIFFRES, pas une coche : « '
       + (l.NOVA || '') + ' »');
    ok(/exit not testable/.test(l.INCONNU || ''),
       'et quand le noeud n a pas repondu, c est ecrit — une epreuve qu on n a pas pu jouer '
       + 'n est pas une epreuve reussie : « ' + (l.INCONNU || '') + ' »');

    /* La limite de l'epreuve est portee par la page elle-meme, au survol : ce
       qui est simule, c'est le transfert, pas l'echange complet. */
    console.log('   au survol : ' + titre);
    ok(!!titre && /not the full swap/.test(titre),
       'et ce que l epreuve NE prouve pas est ecrit la ou on la lit');

    /* Et le piege s'arrete CHEZ LE COBAYE : c'est le seul agent qui pouvait le
       voir, puisque tous les autres l'avaient laisse passer. */
    const iCob = await page.evaluate(() => AGENTS.findIndex((a) => a.key === 'cobaye'));
    console.log('   $MIEL : ' + JSON.stringify(miel) + ' · le Cobaye est en ' + iCob);
    ok(miel && miel.i === iCob,
       'le jeton dont la sortie est bloquee est rejete CHEZ LE COBAYE, apres que tous les '
       + 'autres gardes l aient laisse passer');
    ok(miel && /the exit is blocked/.test(miel.txt),
       'et la raison exacte est affichee, avec ses chiffres : « ' + (miel && miel.txt) + ' »');
    const iOr = await page.evaluate(() => AGENTS.findIndex((a) => a.key === 'oracle'));
    ok(iCob > iOr,
       'le Cobaye est place apres l Oracle (' + iCob + ' contre ' + iOr + ') : son epreuve coute '
       + 'des appels et ne sert que sur un jeton qu on s apprete a acheter');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 6. CE QUI EST LU ET CE QUI NE L EST PAS
   * ==================================================================== */
  console.log('\n-- « non lu » ne s ecrit pas « zero » --');
  {
    const { page, boum } = await ouvre(nav, port, {});

    let vu = null;
    for (let i = 0; i < 40 && !vu; i++) {
      await page.waitForTimeout(400);
      vu = await page.evaluate(() => {
        const out = {};
        for (const t of document.querySelectorAll('#flow .tok')) {
          const s = (t.querySelector('.sym') || {}).textContent || '';
          out[s.replace('$', '')] = (t.querySelector('.meta') || {}).textContent.replace(/\s+/g, ' ').trim();
        }
        return Object.keys(out).length ? out : null;
      });
    }
    console.log('   ' + JSON.stringify(vu));
    const tous = Object.values(vu || {}).join(' | ');
    ok(/chain not read/.test(tous) || Object.keys(vu || {}).length < 6,
       'un jeton dont la chaine n a pas repondu porte « chaine non lue »');
    /* Le zero doit etre un nombre entier, pas la fin d un autre : « 210
       porteurs » contient « 0 porteurs », et l essai passait ou ratait selon
       les chiffres du banc plutot que selon ce que la page ecrit. */
    ok(!/(?:^|\D)0 holders/.test(tous) || /VIDE/.test(Object.keys(vu || {}).join()),
       'et « 0 porteurs » n est ecrit que quand c est ce que la chaine a dit');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 7. CE QUE LA PAGE PROMET, ET CE QU ELLE NE PEUT PLUS FAIRE
   * ==================================================================== */
  console.log('\n-- une session valable connecte VRAIMENT la page --');
  {
    /* ---- LE DEFAUT, FILME : « je me connecte et ca ne se connecte pas » ----
     * Le code e-mail etait accepte, le dialogue affichait « Signed in.
     * Reloading… », la page se rechargeait — et revenait sur « CONNECT
     * WALLET », solde a « — ». La session etait bonne : remise a la main, elle
     * ne changeait rien. Trois causes, toutes ici :
     *   1. `stakebubble.js` tenait cette page pour proprietaire de sa socket
     *      parce qu'elle porte un `#bal` ; il s'abstenait donc de se connecter,
     *      et le jeton restait range sans servir ;
     *   2. une fois connecte, il fabriquait un SECOND element `#bal` — deux
     *      elements pour un identifiant — si bien que la carte de la page
     *      restait a « — » pendant que sa pastille affichait le vrai chiffre ;
     *   3. `swogeConnecte()` n'existait pas sur cette page (il vit dans
     *      `swogecx.js`, qu'elle ne charge pas), donc les deux boutons de
     *      connexion ne se cachaient jamais.
     * On mesure les trois d'un coup, avec un faux serveur de jeu. */
    const WSS = require('ws').Server;
    const jeu = new WSS({ port: 0 });
    await new Promise((r) => jeu.on('listening', r));
    const recus = [];
    jeu.on('connection', (c) => {
      c.send(JSON.stringify({ type: 'hello', loginNonce: 'abc', chainId: 4663 }));
      c.on('message', (d) => {
        let m; try { m = JSON.parse(d); } catch (e) { return; }
        recus.push(m.type);
        if (m.type === 'resume')
          c.send(JSON.stringify({ type: 'auth', address: '0x' + '11'.repeat(20),
                                  balance: '4242', session: 'jeton', resumed: true }));
      });
    });
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => {
      try { localStorage.setItem('swogeSession', 'jeton-valable'); } catch (e) {}
    });
    const { page, boum } = await ouvre(nav, port, { ctx,
      urlSuffixe: '?server=ws://127.0.0.1:' + jeu.address().port });
    await page.waitForTimeout(3500);
    const v = await page.evaluate(() => ({
      boutons: ['connectBtn', 'emailBtn'].map((id) => {
        const b = document.getElementById(id); return b ? b.offsetParent !== null : null; }),
      bals: [...document.querySelectorAll('[id=bal]')].map((e) => (e.textContent || '').trim()),
      connecte: typeof window.swogeConnecte === 'function' ? window.swogeConnecte() : 'absent',
    }));
    ok(recus.indexOf('resume') >= 0,
       'la page REPREND sa session au chargement — sans ca, un jeton valable ne sert a rien');
    ok(v.bals.length === 1,
       'un seul element porte l identifiant `bal` (' + v.bals.length + ') : deux, et la carte de la page reste a « — »');
    ok(v.bals[0] === '4.2k', 'et il porte le solde rendu par le serveur (' + v.bals[0] + ')');
    ok(v.connecte === true, '`swogeConnecte()` existe et repond oui (' + v.connecte + ')');
    ok(v.boutons[0] === false && v.boutons[1] === false,
       'donc « CONNECT WALLET » et « SIGN UP — EMAIL » s effacent : les laisser a cote de son'
       + ' propre solde se lit comme une connexion ratee');
    ok(boum.length === 0, 'aucune erreur de page' + (boum.length ? ' — ' + boum[0] : ''));
    await page.close(); await ctx.close(); jeu.close();
  }

  console.log('\n-- la porte de connexion s ouvre DEVANT, pas sous le pied de page --');
  {
    /* ---- LE DEFAUT : ELLE S OUVRAIT SANS SES STYLES ----
     * « Connect wallet et sign up email ne fonctionnent pas en haut a droite. »
     * Ils fonctionnaient : la porte se construisait et recevait sa classe
     * `on`. Mais sa feuille de style n etait posee que par la fonction qui
     * FABRIQUE le bouton « Sign in » de la barre, laquelle sort tout de suite
     * quand la page a deja sa propre rangee de connexion — le cas ici. Sans
     * feuille, `.swcon-ov` n est plus ni fixe ni au-dessus, et `.on` ne veut
     * plus dire `display:flex` : mesure, un bloc de 1280x138 tout en bas du
     * document. Elle s ouvrait donc pour de vrai, hors de l ecran.
     * On mesure ce qui a manque : la position, la hauteur et le plan. */
    const { page, boum } = await ouvre(nav, port, {});
    await page.click('#emailBtn');
    await page.waitForTimeout(400);
    const d = await page.evaluate(() => {
      const o = document.querySelector('.swcon-ov');
      if (!o) return null;
      const cs = getComputedStyle(o), r = o.getBoundingClientRect();
      const m = o.querySelector('.mail'), e = o.querySelector('.em');
      return { display: cs.display, position: cs.position, z: cs.zIndex,
               haut: Math.round(r.height), large: Math.round(r.width),
               ecran: [innerWidth, innerHeight],
               champDeplie: m ? getComputedStyle(m).display !== 'none' : null,
               foyer: document.activeElement === e };
    });
    ok(d, 'la porte existe dans la page');
    ok(d.display === 'flex', 'elle s ouvre en `flex` — donc sa feuille de style est bien posee ('
       + d.display + ')');
    ok(d.position === 'fixed', 'et elle est FIXE : sans ca elle se range en bas du document ('
       + d.position + ')');
    ok(Number(d.z) > 1000000, 'au-dessus de tout ce que la page empile (z-index ' + d.z + ')');
    ok(d.haut >= d.ecran[1] - 2 && d.large >= d.ecran[0] - 2,
       'et elle couvre l ecran (' + d.large + 'x' + d.haut + ' pour ' + d.ecran.join('x') + ')');
    ok(d.champDeplie, 'le bouton « SIGN UP — EMAIL » deplie le champ e-mail, sans second clic');
    ok(d.foyer, 'et y pose le curseur : le bouton fait ce que son nom promet');
    ok(boum.length === 0, 'aucune erreur de page' + (boum.length ? ' — ' + boum[0] : ''));
    await page.close();
  }

  console.log('\n-- ce que la page promet en toutes lettres --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const v = await lit(page);
    /* ---- LES DEUX LANGUES DISENT LA MEME CHOSE ----
     * La page s'ouvre en anglais ; le francais est une table. Un aveu qui ne
     * survivrait qu'a une seule des deux serait pire qu'aucun aveu : on
     * verifie donc les MEMES quatre phrases dans les deux, en basculant la
     * langue comme le ferait le drapeau. */
    const promesses = [
      [/no transaction is signed/i, /paper/i, 'nothing is signed, and the treasury is paper'],
      [/runs on the server/i, /same state/i, 'it runs on the server and everyone sees the same state'],
      [/gas and slippage/i, /gas and slippage/i, 'a real buy would also pay gas and slippage'],
    ];
    for (const [a1, a2, quoi] of promesses)
      ok(a1.test(v.foot) && a2.test(v.foot), 'en anglais, elle dit que ' + quoi);
    ok(!/stops when you close the tab/i.test(v.foot) && !/kept on (?:the|this) device/i.test(v.foot),
       'et elle ne promet plus le contraire, qui etait vrai de l ancienne version');

    const fr = await page.evaluate(() => {
      poseLangue('fr');
      return (document.getElementById('foot') || {}).textContent || '';
    });
    const fPromesses = [
      [/aucune transaction n'est sign/i, 'rien n est signe'],
      [/tourne sur le serveur/i, 'ca tourne sur le serveur'],
      [/m[eê]me [eé]tat/i, 'tout le monde voit le meme etat'],
      [/gaz et le glissement/i, 'un vrai achat paierait le gaz et le glissement'],
    ];
    for (const [rx, quoi] of fPromesses)
      ok(rx.test(fr), 'et en francais aussi : ' + quoi);
    await page.evaluate(() => poseLangue('en'));

    /* ---- LE BOUTON QUI DEVAIT PARTIR ----
     * Il effacait le stockage local. Sur un etat PARTAGE, le meme geste
     * effacerait la colonie de tout le monde — depuis une page publique, sans
     * authentification, et sans retour possible. */
    const reset = await page.evaluate(() => !!document.getElementById('oublier'));
    ok(!reset, 'le bouton « Reset » n existe plus : sur un etat partage, il effacerait celui de tout le monde');

    /* ---- ET LES TROIS QUI ONT SUIVI ----
     * « Live », « Pause » et le multiplicateur de vitesse ne commandaient plus
     * rien depuis que le moteur est sur le serveur : le premier redemandait un
     * etat que la page redemande deja seule, le deuxieme arretait l animation
     * pendant que la colonie continuait de trader, le troisieme changeait la
     * vitesse des chiens. Un bouton qui a l air de commander une machine et
     * qui ne commande qu un dessin anime est pire que pas de bouton : on croit
     * avoir mis la colonie en pause. */
    const morts = await page.evaluate(() => ['refresh', 'pause', 'speed']
      .filter((id) => !!document.getElementById(id)));
    ok(morts.length === 0,
       morts.length === 0
         ? 'les trois commandes qui ne commandaient que l animation ont disparu'
         : 'il en reste : ' + morts.join(', '));
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 8. LE SERVEUR REPOND MAL, OU DIT QU IL A ECHOUE
   * ==================================================================== */
  console.log('\n-- le serveur repond mal --');
  {
    const { page, boum } = await ouvre(nav, port, { casse: true });
    const v = await lit(page);
    ok(v.bal === '—', 'un 502 ne devient pas une tresorerie (' + v.bal + ')');
    ok(/OFFLINE/.test(v.pouls), 'le pouls le dit (' + v.pouls + ')');
    ok(/502/.test(v.tag), 'et le code de l erreur est ecrit, pas masque (« ' + v.tag.slice(0, 70) + ' »)');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
  console.log('\n-- le serveur tourne mais sa lecture a echoue --');
  {
    /* Cas different, et il compte : le serveur repond parfaitement, avec un
       etat complet — mais SA derniere lecture de la chaine a echoue. Sans
       cela, l'ecran montrerait des chiffres immobiles avec un pouls vert. */
    const { page, boum } = await ouvre(nav, port,
      { vue: vueFausse({ erreur: 'no new token liquid enough' }) });
    const v = await lit(page);
    console.log('   ' + JSON.stringify({ stamp: v.stamp, tag: v.tag.slice(0, 70) }));
    ok(/read failed/.test(v.stamp), 'la pastille porte l echec du serveur');
    ok(/stale/.test(v.stampCls), 'et passe en perime');
    ok(/no new token liquid enough/.test(v.tag),
       'la raison du serveur est reprise mot pour mot, pas resumee en « erreur »');
    ok(/1,1[78]/.test(v.bal),
       'la tresorerie deja lue reste affichee : elle est vraie, elle est juste datee (' + v.bal + ')');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exitCode = rates ? 1 : 0;
})().catch((e) => { console.log('EXCEPTION : ' + (e && e.stack || e)); process.exitCode = 1; });
