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
 *
 * 14/10/2026 — PAGE v2 (maquette futuriste validee par le proprietaire). Le
 * village, la tablette a panneaux replies et le terminal sont remplaces par une
 * scene des agents et six onglets. Chaque essai ci-dessous garde son
 * INTENTION et la mesure sur les nouveaux blocs ; ce qui a disparu avec
 * l'ancienne page (les shibas du village, la molette au-dessus du village, la
 * barre de navigation du bas) n'est plus mesure parce qu'il n'existe plus.
 * Les compteurs de la vue fausse ont la forme que le serveur sert depuis
 * (`scoutVu`/`scoutOk`...), et la vue porte un carnet et la ligne de reference
 * de l'audit (« achete ou retenu »), comme le serveur.
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
        /* La capitalisation du MOMENT va avec le latent : +6,4 % sur 310k font
           330k. Et ce que la source annonce pour ce meme prix, quand elle dit
           autre chose — mesure le 9 septembre : 21 % d ecart sur $PHUB. */
        mcMaintenant: 329840, mcSource: 396000,
        /* Elle est sortie par paliers : 70 % vendus en route, 30 % courent
           encore, et le plus haut vu est ce que l'arret suiveur surveille. */
        reste: 0.3, encaisse: 12.4, paliers: 2, hautR: 62.5,
        tenuParMain: { jusqua: now + 25 * 60000, par: 'owner' },
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
        epreuve: { teste: true, essais: 3, refus: 0, passe: true,
                   /* et le quoteur du miroir a chiffre l'aller-retour : 98,2 % reviennent */
                   retour: { pct: 98.2, min: 60, ver: 'v4', pool: '0xpool1' } } },
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
    /* La forme que le serveur sert : `<agent>Vu` / `<agent>Ok` par porte. */
    compteurs: { scoutVu: 240, scoutOk: 240, whaleVu: 240, whaleOk: 50, wardenVu: 50, wardenOk: 47,
                 whisperVu: 47, whisperOk: 41, oracleVu: 41, oracleOk: 29, cobayeVu: 29, cobayeOk: 25,
                 closer: 11, banquier: 11 },
    /* Le carnet des trades FERMES : une fermeture au terme, une coupe de la Sentinelle. */
    carnet: { n: 2, tout: { n: 2, moyenne: 12.5, partGagnantes: 50, gagnantMoyen: 42, perdantMoyen: -17, gain: 12.5 },
      parSortie: [{ par: 'closer', n: 1, moyenne: 42, partGagnantes: 100, gagnantMoyen: 42, perdantMoyen: null, gain: 21 },
                  { par: 'sentinelle', n: 1, moyenne: -17, partGagnantes: 0, gagnantMoyen: null, perdantMoyen: -17, gain: -8.5 }],
      parTenue: [{ de: 10, a: 20, n: 2, moyenne: 12.5, partGagnantes: 50, gagnantMoyen: 42, perdantMoyen: -17, gain: 12.5 }],
      lignes: [
        { sym: 'PEPO', adr: '0x' + 'e1'.repeat(20), t0: now - 1260000, t: now - 60000, tenue: 20, mise: 50, r: 42, gain: 21, par: 'closer', raison: null, score: 77 },
        { sym: 'DUMP', adr: '0x' + 'e2'.repeat(20), t0: now - 900000, t: now - 300000, tenue: 10, mise: 50, r: -17, gain: -8.5, par: 'sentinelle',
          raison: 'cut: the pool went from $40000 to $9000', score: 61 } ] },
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
    ponts: { liste: ['USDG', 'NVDA'], vus: [{ adr: '0x' + 'd0'.repeat(20), sym: 'NVDA', ok: true, liq: 1184565, ver: 'v3', raison: null, t: now }] },
    /* Ce que le miroir a fait des achats envoyes (27/09) : absent par defaut. */
    suiviMiroir: o.suiviMiroir || null,
    /* Le carnet net de l aller-retour (30/09) : absent par defaut. */
    carnetNet: o.carnetNet || null,
    /* Ce que le miroir a vraiment touche, a cote de ce que le papier a compte. */
    reel: o.reel || { n: 9, moyenne: -6.4, ecart: 12.8, nEcart: 7, glissement: -1.6, lignes: [
      { sym: 'JACOB', adr: '0x1', r: -4.2, papier: 39.9, glissement: -1.8, pont: false, t: now },
      { sym: 'DFC', adr: '0x2', r: 51.1, papier: 58.0, glissement: -0.6, pont: false, t: now },
    ] },
    /* Les jeux de regles qui rejouent les memes ombres sans en trader aucune. */
    /* Le banc apparie et net (02/10/2026) : absent d un serveur d avant. */
    bancMesure: o.bancMesure,
    bancs: o.bancs || [
      /* Le lot ET la separation : ce sont deux populations, et seule celle des
         achetes decide d'un changement de sortie. Le classement est ici
         VOLONTAIREMENT inverse entre les deux colonnes — « paliers hauts » mene
         le lot, « en vigueur » mene les achetes — pour verifier que la carte
         designe bien sur la bonne. */
      { cle: 'en vigueur', quoi: 'the rules actually trading today', n: 240, moyenne: -4.2, partGagnantes: 31, meilleur: 88,
        retenus: { n: 118, moyenne: 9.3, partGagnantes: 44 }, ecartes: { n: 122, moyenne: -17.2, partGagnantes: 18 } },
      { cle: 'paliers hauts', quoi: 'rungs at +50% and +150%, trailing stop 100 pts, cut at -20%', n: 240, moyenne: 12.6, partGagnantes: 26, meilleur: 410,
        retenus: { n: 118, moyenne: 2.1, partGagnantes: 21 }, ecartes: { n: 122, moyenne: 22.8, partGagnantes: 30 } },
      { cle: 'laisser courir', quoi: 'no rungs at all, trailing stop 100 pts, cut at -15%', n: 240, moyenne: 8.1, partGagnantes: 22, meilleur: 512,
        retenus: { n: 118, moyenne: -3.5, partGagnantes: 19 }, ecartes: { n: 122, moyenne: 19.4, partGagnantes: 25 } },
      { cle: 'scalp + moon bag', quoi: 'today rungs and trailing stop, but 20% of the position is never sold and rides to the end', n: 240, moyenne: 3.4, partGagnantes: 34, meilleur: 190,
        retenus: { n: 118, moyenne: 6.7, partGagnantes: 39 }, ecartes: { n: 122, moyenne: 0.2, partGagnantes: 29 } },
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
      /* La reference : ce qu'on ACHETE. Une regle se juge contre elle. */
      { cle: 'achete ou retenu', n: 278, moyenne: 6.1, montes: 56, effondres: 40, partMontes: 20 },
      /* Trop peu pour juger : la ligne le dit, sans verdict. */
      { cle: 'oracle · too volatile', n: 12, moyenne: 60, montes: 6, effondres: 1, partMontes: 50 },
      /* Un veto qui coute : un jeton ecarte sur trois est monte. */
      { cle: 'oracle · score too low', n: 96, moyenne: -4.2, montes: 31, effondres: 22, partMontes: 32 },
      /* Un veto qui protege. */
      { cle: 'whale · one holder holds 90% of the float', n: 140, moyenne: -38.5,
        montes: 7, effondres: 96, partMontes: 5 },
    ] : o.audit,
    conseiller: o.conseiller || { actif: false,
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
  await page.waitForTimeout(opts.attente || 900);
  /* Le chiffre du tresor defile a sa premiere apparition (1,5 s, decoration) :
     on lit le chiffre qu'il affiche une fois pose, pas un chiffre en route. */
  await page.waitForFunction(() => { const b = document.getElementById('aiBal'); return !b || !b._compte; }, null, { timeout: 4000 }).catch(() => {});
  return { page, ctx, boum, appels };
}

/* 14/10/2026 (page v2) : six onglets — Overview, Paper trades, Mirror results,
   Learning, Market, Sources. Un bloc d'un onglet cache n'a pas de boite : un
   geste ou une mesure dessus commence donc, comme pour le joueur, par ouvrir
   son onglet. Ce que chaque essai verifie ne change pas. */
const onglet = async (page, t) => {
  await page.evaluate((x) => document.querySelector('#tabs button[data-tab="' + x + '"]').click(), t);
  await page.waitForTimeout(250);
};
const txt = (page, sel) => page.evaluate((s) => ((document.querySelector(s) || {}).textContent || '').replace(/\s+/g, ' ').trim(), sel);

const lit = (page) => page.evaluate(() => {
  const t = (id) => ((document.getElementById(id) || {}).textContent || '').replace(/\s+/g, ' ').trim();
  return {
    bal: t('aiBal'), delta: t('delta'), stamp: t('stamp'),
    stampCls: (document.getElementById('stamp') || {}).className, pouls: t('poulsTx'), tag: t('stagetag'),
    pos: t('poscount'), kpis: t('kpis'), truth: t('truth'),
    positions: [...document.querySelectorAll('#positions .pos')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()),
    positionsTxt: t('positions'),
    blocs: [...document.querySelectorAll('#positions .posbloc')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
    liens: [...document.querySelectorAll('#positions .liens a')].map((a) => a.textContent.trim() + '→' + a.href),
    adresses: [...document.querySelectorAll('#positions .adr code')].map((c) => c.textContent.trim()),
    boutonsCopie: [...document.querySelectorAll('#positions .adr button')].length,
    agents: [...document.querySelectorAll('#agents tr[data-agent]')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    appris: t('appris'), apprisHtml: (document.getElementById('appris') || {}).innerHTML || '',
    alertes: t('alertes'), alerteN: t('alerteN'), alerteCachee: !!(document.getElementById('cAl') || {}).hidden,
    fermN: t('fermN'), closed: [...document.querySelectorAll('#closed tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    audit: t('audit'), auditN: t('auditN'), traits: t('traits'), traitsN: t('traitsN'), traitsF: t('traitsF'),
    banque: t('banque'), banqMethode: t('banqMethode'),
    surveillance: t('surveillance') + ' ' + t('survAttente'), survN: t('survN'), bandes: t('bandes'),
    structure: t('structure'), services: t('services') + ' ' + t('hors'), foot: t('foot'), lede: t('lede'),
  };
});

/* ==========================================================================
 * 9. LA COLONIE SE DESSINE DEPUIS LE ROSTER
 *
 * « S'ils ont besoin de plus d'agents ils peuvent s'auto-développer, se
 *   multiplier. » Le nombre d'agents, leur ordre et leurs liens viennent du
 * serveur : un agent ne a son noeud, un specialiste dit de qui il descend, et
 * l'ordre du parcours est celui que le SERVEUR a mesure — pas une liste
 * recopiee ici. (Le village de shibas est parti avec la page v2, validee par le
 * proprietaire le 14/10 : la scene des agents le remplace, et ce qui se
 * verifiait sur le village se verifie sur elle.)
 * ==========================================================================*/
async function maisons() {
  console.log('\n-- la colonie se dessine depuis le roster --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const v = await lit(page);
    const N = vueFausse().roster.length;
    const sc = await page.evaluate(() => ({ pipe: Scene.pipe(), sat: Scene.satellites() }));
    console.log('   parcours : ' + sc.pipe.join(' → ') + ' · satellites : ' + sc.sat.join(', '));
    ok(v.agents.length === N, N + ' agents au serveur → ' + N + ' lignes dans « Agents » (' + v.agents.length + ')');
    ok(sc.pipe.length + sc.sat.length === N, 'et autant de noeuds dans la scene (' + (sc.pipe.length + sc.sat.length) + ')');
    ok(new RegExp('\\b' + N + ' AI agents').test(v.lede), 'le nombre est ecrit depuis le roster, jamais en dur : « ' + v.lede.slice(0, 40) + ' »');
    ok(v.agents.some((a) => /Whale · age/.test(a) && /from Whale-Watch/.test(a)), 'le specialiste ne de la colonie a sa ligne, et il dit de qui il descend');
    ok(sc.sat.indexOf('whale-topage>whale') >= 0, 'et dans la scene il est relie a son parent');
    ok(sc.pipe[0] === 'scout', 'le Scout ouvre le parcours');
    ok(sc.pipe.indexOf('whale') < sc.pipe.indexOf('warden'),
       'les gardes suivent l ordre QUE LE SERVEUR a mesure (whale avant warden), pas celui du code');
    ok(sc.pipe[sc.pipe.length - 1] === 'closer' && sc.pipe[sc.pipe.length - 2] === 'banquier',
       'et la fin est Banquier puis Closer : deux agents ouvrent une position, pas un');
    ok(sc.pipe.indexOf('cobaye') > sc.pipe.indexOf('oracle') && sc.pipe.indexOf('cobaye') < sc.pipe.indexOf('banquier'),
       'le Cobaye tente la sortie apres l Oracle et AVANT le Banquier : c est la que le serveur le joue');
    /* Aucun noeud ne sort du cadre, sur ordinateur comme en serpentin. */
    const pos = await page.evaluate(() => Scene.positions());
    const dehors = Object.keys(pos).filter((k) => k !== 'in' && k !== 'out' && (pos[k][0] < 0 || pos[k][0] > 1 || pos[k][1] < 0 || pos[k][1] > 1));
    ok(dehors.length === 0, 'aucun noeud ne sort du cadre' + (dehors.length ? ' : ' + dehors.join(', ') : ''));
    ok(pos.hub[0] > Math.max(...sc.pipe.map((k) => pos[k][0])), 'le tresor est apres le dernier agent, pas au milieu');
    ok(pos.in[0] < pos[sc.pipe[0]][0], 'et l entree est avant le premier : on sait par quel bout commencer');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));

    console.log('\n-- et elle se refait quand la colonie change de forme --');
    const petit = vueFausse();
    petit.roster = petit.roster.filter((a) => a.role !== 'specialiste');
    await page.evaluate((v) => { VUE = v; peintTout(); }, petit);
    await page.waitForTimeout(200);
    const ap = await page.evaluate(() => ({ lignes: document.querySelectorAll('#agents tr[data-agent]').length, n: Scene.pipe().length + Scene.satellites().length }));
    ok(ap.lignes === N - 1 && ap.n === N - 1, 'un specialiste retire : une ligne et un noeud de moins (' + ap.lignes + ' / ' + ap.n + ')');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
  console.log('\n-- sur telephone, le parcours se lit en serpentin --');
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    const { page } = await ouvre(nav, port, { ctx });
    const v = await page.evaluate(() => ({ pipe: Scene.pipe(), pos: Scene.positions() }));
    const r1 = v.pipe.slice(0, 4).map((k) => v.pos[k][0]), r2 = v.pipe.slice(4, 8).map((k) => v.pos[k][0]);
    ok(r1.every((x, i) => i === 0 || x > r1[i - 1]), 'la premiere rangee va de gauche a droite');
    ok(r2.length > 1 && r2.every((x, i) => i === 0 || x < r2[i - 1]), 'la deuxieme repart en sens inverse : un serpentin, pas un retour a la ligne');
    ok(v.pos.hub[1] > Math.max(...v.pipe.map((k) => v.pos[k][1])), 'et le tresor est en bas, apres le dernier agent');
    await ctx.close();
  }
}

/* ==========================================================================
 * 10. LE CONTRAT, EN ENTIER ET COPIABLE
 * « Faudrait qu'on voie le contrat, qu'on puisse le copier-coller. »
 * ==========================================================================*/
async function contrat() {
  console.log('\n-- l adresse du contrat, sur les positions en cours --');
  const { page, boum } = await ouvre(nav, port, {});
  const v = await lit(page);
  console.log('   ' + JSON.stringify(v.adresses));
  ok(v.adresses.length === 2, 'chaque position en cours porte son adresse de contrat');
  ok(v.adresses[0] === ADR_NOVA, 'et elle est ENTIERE, pas tronquee : ' + v.adresses[0]);
  ok(v.adresses[0].length === 42, 'quarante-deux caracteres, donc collable telle quelle');
  ok(v.boutonsCopie === 2, 'avec un bouton pour la copier');
  /* Dans la vue web de Telegram, `navigator.clipboard` est absent et son appel
     jette AVANT de rendre une promesse. On le retire pour de bon. */
  await page.evaluate(() => {
    try { delete navigator.clipboard; } catch (e) {}
    Object.defineProperty(navigator, 'clipboard', { get() { throw new Error('absent'); }, configurable: true });
  });
  /* Le clic et la lecture dans le meme souffle : aucun repaint ne s'y glisse. */
  const [avant, apres] = await page.evaluate(() => {
    const b = document.querySelector('#positions .adr button');
    const a = b.textContent; b.click(); return [a, b.textContent];
  });
  console.log('   sans presse-papier : « ' + avant + ' » → « ' + apres + ' »');
  ok(apres !== avant, 'meme sans presse-papier, le bouton REPOND quelque chose (« ' + apres + ' »)');
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => document.querySelector('#positions .adr button').textContent) === apres,
     'et la reponse reste sous le doigt : le repaint de chaque seconde ne l efface pas aussitot');
  ok(boum.length === 0, 'et il ne jette pas' + (boum.length ? ' : ' + boum[0] : ''));
  const sel = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('#positions .adr code')); return c.webkitUserSelect || c.userSelect; });
  ok(sel === 'all', 'et l adresse se selectionne d un seul geste (user-select: ' + sel + ')');
  const pos = v.blocs;
  console.log('   ' + pos[0].slice(0, 220));
  ok(/\$35\.00 staked/.test(pos[0]), 'la mise reellement engagee est affichee ($35.00)');
  ok(/part/.test(pos[0]), 'avec la methode qui l a decidee');
  ok(/spotted by profils/.test(pos[0]), 'et le flux qui a trouve le jeton');
  ok(/70% sold/.test(pos[0]), 'la part deja vendue en route est ecrite (70 %)');
  ok(/\+\$12\.40 banked/.test(pos[0]), 'avec ce qu elle a rapporte, qui est deja dans la tresorerie');
  ok(/30% still running/.test(pos[0]), 'et ce qui reste en jeu : c est cette part-la que le latent chiffre');
  ok(/peak seen \+62\.5%/.test(pos[0]), 'le plus haut atteint est affiche : c est lui que l arret suiveur surveille');
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
    ok(/part/.test(v.banqMethode) && /learned/.test(v.banqMethode), 'sa methode est affichee, et le fait qu il l ait APPRISE (« ' + v.banqMethode + ' »)');
    ok(/around the start/.test(v.banque), 'le regime de caisse aussi');
    ok(/2 wins in a row/.test(v.banque), 'et la serie en cours');
    ok(/\$65\.00/.test(v.banque), 'ce qui est engage maintenant');
    ok(/\$35\.60/.test(v.banque), 'et ce qu il poserait sur le prochain jeton');
    ok(/8% per token/.test(v.banque), 'les bornes qu il ne peut pas franchir sont ecrites');
    ok(/floor/.test(v.banque), 'y compris le plancher sous lequel il arrete d ouvrir');
    ok(/Presence required/.test(v.banque) && /telegram/.test(v.banque), 'et la presence exigee d un projet est affichee');
    ok(/12 obs/.test(v.banque) && /9 obs/.test(v.banque), 'et le releve de chaque methode porte son nombre d observations');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
  console.log('\n-- et quand il arrete d ouvrir, il le dit --');
  {
    const { page, boum } = await ouvre(nav, port, { vue: vueFausse({ arret: 'treasury below the $100 floor: we stop opening' }) });
    const v = await lit(page);
    ok(/below the \$100 floor/.test(v.banque), 'l arret est affiche avec sa raison, pas comme une panne');
    ok(!/Next stake/.test(v.banque), 'et aucune « prochaine mise » n est proposee : il n y en a pas');
    ok(/stopped opening/.test(await txt(page, '#eqStats')), 'et la case « Open now » le dit au lieu d une mise');
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
  ok(/PRESQUE/.test(v.surveillance) && /PATIENT/.test(v.surveillance), 'les jetons gardes a l oeil sont listes');
  ok(/3 looks/.test(v.surveillance), 'avec le nombre de fois ou ils ont ete examines — c est le chiffre qui montre qu on ne les rejuge pas en boucle');
  ok(/37 banned/.test(v.survN), 'et les bannis sont comptes a part : ils ne reviendront jamais (' + v.survN + ')');

  console.log('\n-- les canaux Telegram surveilles (26 septembre 2026) --');
  {
    const TG = { canaux: [{ canal: 'Exceptionalmemes', lectures: 12, erreurs: 0, messages: 20, horsChaine: 3, proposes: 1 }],
      trouvailles: [
        { addr: '0x39dbed3a2bd333467115de45665cc57f813c4571', canal: 'Exceptionalmemes', post: 'Exceptionalmemes/4460', statut: 'proposé', sym: 'PONS<img src=x onerror=alert(1)>', verdict: 'too old (9000 min): watched only, never bought', note: 12 },
        { addr: '0x2222222222222222222222222222222222222222', canal: 'Exceptionalmemes', post: 'javascript:alert(1)//1', statut: 'hors robinhood' }],
      rejetsEnCours: 1, rejetHeures: 6 };
    const o = await ouvre(nav, port, { vue: Object.assign(vueFausse(), { telegram: TG }) });
    const t = await o.page.evaluate(() => ({ n: document.getElementById('tgN').textContent, txt: document.getElementById('telegram').textContent.replace(/\s+/g, ' '),
      img: document.querySelectorAll('#telegram img').length, liens: [...document.querySelectorAll('#telegram a')].map((a) => a.href) }));
    ok(/1 watched · 1 proposed/.test(t.n), 'le compte : canaux surveilles, jetons proposes (' + t.n + ')');
    ok(/@Exceptionalmemes · 20 posts read · 3 off-chain ignored/.test(t.txt), 'par canal : messages lus, hors chaine ignores');
    ok(/judged by the colony/.test(t.txt) && /too old/.test(t.txt) && /not on Robinhood Chain/.test(t.txt), 'chaque trouvaille dit son statut et le verdict de la colonie');
    ok(t.img === 0, 'un symbole piege ne devient pas du HTML');
    ok(t.liens.includes('https://t.me/Exceptionalmemes/4460') && !t.liens.some((h) => /^javascript/i.test(h)) && t.liens.includes('https://dexscreener.com/robinhood/0x39dbed3a2bd333467115de45665cc57f813c4571'),
       'le lien du message et le graphique Robinhood ; un lien de message piege n est pas rendu');
    await o.ctx.close();
    const sc = await ouvre(nav, port, { vue: Object.assign(vueFausse(), { telegram: Object.assign({}, TG, {
      scores: [{ channel: 'XandersOGCALLS', calls: 14, freshMeasured: 12, medianChangePct: 18.5, upSharePct: 58 }, { channel: 'ChinaGamble', calls: 3, freshMeasured: 2, medianChangePct: null }],
      decouverte: { auto: [{ canal: 'NewCallsRH', robinhood: 3 }] } }) }) });
    await sc.page.evaluate(() => { const b = document.getElementById('tgMore'); if (b) b.click(); });
    const ts = (await sc.page.textContent('#telegram')).replace(/\s+/g, ' ');
    ok(/@XandersOGCALLS · 12 fresh calls · median \+18.5 % since the call · 58 % up/.test(ts), 'un canal note : effectif, mediane depuis l appel, part en hausse');
    ok(/@ChinaGamble · 2 fresh call\(s\): not enough to judge \(10 needed\)/.test(ts), 'sous dix appels frais : pas de score, et la raison');
    ok(/@NewCallsRH · added by discovery \(3 Robinhood Chain tokens/.test(ts), 'un canal ajoute par la decouverte dit pourquoi il est entre');
    await sc.ctx.close();
    const vide = await ouvre(nav, port, { vue: Object.assign(vueFausse(), { telegram: { canaux: [{ canal: 'Exceptionalmemes', messages: 20, horsChaine: 1 }], trouvailles: [] } }) });
    ok(/No Robinhood Chain contract in the latest posts/.test(await vide.page.textContent('#telegram')), 'rien trouve : la page dit pourquoi (Solana, autres chaines, tickers ignores)');
    await vide.ctx.close();
  }

  console.log('\n-- ou elle a regarde, et ce qu elle n a pas encore juge --');
  console.log('   ' + v.bandes);
  ok(/0-5 min ×3/.test(v.bandes) && /20-60 min ×1/.test(v.bandes), 'la repartition par age est affichee : sans ce compte, « elle regarde partout » est une phrase');
  ok(!/1-6 h/.test(v.bandes), 'et une bande ou elle n a rien vu n est pas listee comme si elle l avait vue');
  ok(/1 exit\(s\) awaiting/.test(v.surveillance) && /MONTE at \+42%/.test(v.surveillance), 'les gains pris mais pas encore juges sont montres');
  ok(/what holding would have given/.test(v.surveillance), 'avec ce qu on attend pour trancher');

  console.log('\n-- ce que la colonie a change a elle-meme --');
  console.log('   ' + v.structure.slice(0, 150));
  ok(/birth/.test(v.structure) && /order/.test(v.structure), 'les deux gestes sont au journal, nommes : une naissance et un changement d ordre');
  ok(/standard deviation of 42 points/.test(v.structure), 'la naissance porte la MESURE qui l a decidee, pas une formule');
  ok(/refus 79%/.test(v.structure), 'et le changement d ordre porte les taux de refus mesures');

  console.log('\n-- ce qui est lu, et ce qui ne peut pas l etre --');
  ok(/GeckoTerminal · new pools/.test(v.services) && /trades one by one/.test(v.services), 'les services sont listes avec ce que chacun apporte');
  ok(/111\/120/.test(v.services), 'avec leur releve reel (111/120 pour la chaine)');
  ok(/last failure: 429/.test(v.services), 'et le dernier echec en clair quand il y en a un');
  ok(/Bridges the mirror can cross:\s*USDG · not measured yet\s*NVDA ✓ \$1\.2M of ETH liquidity \(Uniswap v3\)/.test(v.services),
     'et les ponts du miroir, avec ce qui est mesure et ce qui ne l est pas encore');
  ok(/GMGN/.test(v.services) && /Cloudflare/.test(v.services), 'GMGN est NOMME avec la raison mesuree, plutot que passe sous silence');
  ok(/on ethereum too/.test(v.services), 'et la raison distingue « protection anti-robot » de « ne connait pas la chaine 4663 »');

  /* La licence de l'API GoPlus (relue le 26 septembre 2026) : la page dit
     « Powered by Go+ Security » avec un lien, a cote du service et sous le pied,
     dans les deux langues. */
  console.log('\n-- « Powered by Go+ Security », la ou la page montre ce que GoPlus a lu --');
  const gpl = await page.evaluate(() => {
    const l = (a) => (a ? { t: a.textContent, h: a.getAttribute('href'), rel: a.rel, c: a.target } : null);
    return { ligne: [...document.querySelectorAll('#services .srv')].filter((e) => /GoPlus/.test(e.textContent)).map((e) => l(e.querySelector('a'))),
             pied: l(document.querySelector('#goplusAttrib a')), piedTxt: (document.getElementById('goplusAttrib') || {}).textContent || '' };
  });
  const bon = (a) => !!a && a.t === 'Powered by Go+ Security' && a.h === 'https://gopluslabs.io' && /noopener/.test(a.rel) && a.c === '_blank';
  ok(gpl.ligne.length === 1 && bon(gpl.ligne[0]), 'le service GoPlus porte le lien « Powered by Go+ Security » (noopener, nouvel onglet)');
  ok(bon(gpl.pied) && /^Contract safety checks/.test(gpl.piedTxt), 'et la page le dit sous son pied : « ' + gpl.piedTxt + ' »');
  await page.evaluate(() => poseLangue('fr'));
  const fr = await page.evaluate(() => ({ t: document.getElementById('goplusAttrib').textContent, a: document.querySelector('#goplusAttrib a').getAttribute('href') }));
  ok(/^Contrôles de sécurité des contrats/.test(fr.t) && /Powered by Go\+ Security$/.test(fr.t) && fr.a === 'https://gopluslabs.io',
     'en francais aussi, la clause restant la leur : « ' + fr.t + ' »');
  await page.evaluate(() => poseLangue('en'));
  {
    /* Les phrases vivent dans PHRASES, en deux langues, jamais en dur dans le peintre. */
    const src = fs.readFileSync(path.join(SITE, PAGE), 'utf8');
    const d0 = src.indexOf('const PHRASES = {'), d1 = src.indexOf('\n};', d0);
    const compte = (t) => t.split('Powered by Go+ Security').length - 1;
    ok(compte(src) >= 4 && compte(src) === compte(src.slice(d0, d1)), 'la mention n existe que dans la table ph() (' + compte(src) + ' fois, toutes dedans)');
  }
  ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
  await page.context().close();
}

/* ==========================================================================
 * 13. LA CAPITALISATION D'ACHAT, LE GRAPHIQUE, LES RESEAUX
 * ==========================================================================*/
async function ficheDeLaPosition() {
  console.log('\n-- ce qu on voit d une position en cours --');
  const { page, boum } = await ouvre(nav, port, {});
  const v = await lit(page);
  const pos = v.blocs;
  ok(/bought at \$310k cap/.test(pos[0]), 'la capitalisation AU MOMENT DE L ACHAT est affichee (310k)');
  ok(/bought at \$45k cap/.test(pos[1]), 'sur chaque position, pas seulement la premiere');
  ok(/\$330k cap now/.test(pos[0]), 'la capitalisation du MOMENT est affichee, et elle vaut le latent');
  ok(/the source says \$396k/.test(pos[0]), 'et quand la source annonce autre chose pour ce meme prix, son chiffre est rendu a cote, pas a la place');
  ok(!/cap now/.test(pos[1]) && !/the source says/.test(pos[1]), 'une position sans lecture du moment n en invente pas une');
  ok(/extended 1×/.test(pos[0]), 'et le fait que le Promoteur l ait gardee une fois de plus');
  const chart = v.liens.filter((l) => /chart/.test(l));
  ok(chart.length === 2, 'chaque position porte un lien vers son graphique');
  ok(/geckoterminal\.com\/robinhood\/pools\/0xpool3/.test(chart[0]), 'et il pointe vers la source d ou vient le pool, donc une page qui existe');
  const ds = v.liens.filter((l) => /dexscreener/.test(l));
  ok(ds.length === 1 && /0xpool3/.test(ds[0]), 'DexScreener n est ajoute que pour la position dont on SAIT qu il connait la paire');
  const muets = await page.evaluate(() => [...document.querySelectorAll('#positions .lienpetit.muet')].map((x) => x.textContent.trim()));
  ok(muets.indexOf('not on DexScreener yet') >= 0, 'et pour l autre, on le DIT plutot que d offrir un lien mort');
  ok(v.liens.some((l) => /twitter/.test(l) && /x\.com\/nova/.test(l)), 'les reseaux sont la quand il y en a');
  ok(muets.indexOf('no socials') >= 0, 'et quand il n y en a pas, c est ecrit plutot que laisse vide');
  ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
  await page.context().close();
}

/* ==========================================================================
 * 14. LES TRADES FERMES, ET QUI LES A FERMES
 * « Pourquoi il y a trades en direct et positions ? » Les ouvertures sont deja
 * dans les positions en cours ; le carnet des trades ne montre que ce qui est
 * FINI, et dit qui a ferme — sinon le travail de la Sentinelle est invisible.
 * ==========================================================================*/
async function filSansDoublon() {
  console.log('\n-- le carnet ne redit pas ce qui est deja au-dessus --');
  const { page, boum } = await ouvre(nav, port, {});
  await onglet(page, 'tr');
  const v = await lit(page);
  console.log('   ' + JSON.stringify(v.closed));
  ok(v.closed.length === vueFausse().carnet.lignes.length, 'seules les positions FERMEES y figurent (' + v.closed.length + ')');
  ok(!v.closed.some((f) => /NOVA/.test(f)), 'la position ouverte $NOVA n y est pas : elle est deja listee, avec plus de detail');
  ok(v.closed.some((f) => /Sentinel/.test(f)), 'une coupe precoce dit qui l a decidee : « ' + (v.closed.find((f) => /Sentinel/.test(f)) || '') + ' »');
  ok(v.closed.some((f) => /Closer · duration reached/.test(f)), 'et une fermeture au terme le dit aussi');
  ok(/entry threshold 55/.test(v.fermN), 'et l en-tete porte le seuil d entree du moment (' + v.fermN + ')');
  const groupe = await txt(page, '#byHold');
  ok(/under 20: shown, not judged/.test(groupe), 'un groupe de tenue sous 20 trades est montre, pas juge');
  ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
  await page.context().close();
}

/* ==========================================================================
 * 15. CE DONT LA COLONIE A BESOIN, LA BARRE, LE MENU, LES ONGLETS
 * ==========================================================================*/
async function panneauAlertes() {
  console.log('\n-- les alertes --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const v = await lit(page);
    console.log('   ' + v.alerteN + ' · ' + v.alertes.slice(0, 120));
    ok(!v.alerteCachee, 'la carte apparait quand il y a quelque chose a demander');
    ok(v.alerteN === '2', 'les deux alertes sont comptees');
    ok(/34% of reads/.test(v.alertes), 'chacune porte le CHIFFRE qui la justifie');
    ok(/dedicated RPC/.test(v.alertes) && /ANTHROPIC_API_KEY/.test(v.alertes), 'et ce qu il faudrait faire, precisement');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
  {
    const { page } = await ouvre(nav, port, { vue: vueFausse({ alertes: [] }) });
    ok((await lit(page)).alerteCachee, 'et elle disparait quand la colonie n a besoin de rien');
    await page.context().close();
  }
  {
    /* 28/09 : « haute » valait 0 et `rang[g]||9` la rangeait derniere ; une alerte
       basse (un creux ordinaire) allumait la pastille de l'onglet comme une vraie demande. */
    const basse = { gravite: 'basse', quoi: 'Nothing bought for 228 turns (9.5 h)', pourquoi: 'At the pace of the last 7 days (18 buys, 2.6 a day), a silence this long happens 36% of the time: it is ordinary.', quoiFaire: 'Nothing.' };
    const haute = { gravite: 'haute', quoi: 'The chain nodes are refusing 34% of reads', pourquoi: 'x', quoiFaire: 'y' };
    const { page } = await ouvre(nav, port, { vue: vueFausse({ alertes: [basse, haute] }) });
    const ordre = await page.$$eval('#alertes .alerte', (l) => l.map((x) => x.dataset.gravite));
    ok(ordre.join() === 'haute,basse', 'la haute d abord, meme listee apres [' + ordre.join() + ']');
    ok(await page.$eval('#tabs button[data-tab="ov"]', (b) => b.classList.contains('demande')), 'une haute allume la pastille de l onglet qui la porte');
    await page.context().close();
    const p2 = (await ouvre(nav, port, { vue: vueFausse({ alertes: [basse] }) })).page;
    ok(!(await p2.$eval('#tabs button[data-tab="ov"]', (b) => b.classList.contains('demande'))) && /ordinary/.test(await p2.textContent('#alertes')),
       'une basse seule se lit dans la carte, sans allumer la pastille');
    await p2.context().close();
  }

  /* ---- LA BARRE DU HAUT EST CELLE DU SITE ----
   * Les quatre chiffres du site (rempli ET arrondi vers le bas — ils vivent au
   * pied de la page v2, avec les reseaux), la marque, l'avatar, l'ancre de la
   * bulle ; et « Connect wallet » PRODUIT quelque chose. */
  console.log('\n-- la barre du haut, comme sur les autres pages --');
  {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const boum = [];
    page.on('pageerror', (e) => boum.push(String(e).slice(0, 160)));
    await page.route(/geckoterminal|gopluslabs|dexscreener|rpc\.mainnet|honeypot\.is|blockscout/, (r) => r.abort());
    await page.route(/\/ai\/colonie/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(vueFausse()) }));
    await page.route(/vitrine\.json/, (r) => r.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ joueurs: 1284, volume: 4799999, manches: 98123, rendus: 3210000 }) }));
    await page.goto('http://127.0.0.1:' + port + '/' + PAGE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const b = await page.evaluate(() => {
      const bloc = document.getElementById('gxChiffres');
      return { vu: bloc ? !bloc.hidden : null,
        titres: [...document.querySelectorAll('#gxChiffres small')].map((x) => x.textContent),
        valeurs: [...document.querySelectorAll('#gxChiffres b[data-n]')].map((x) => x.textContent),
        marque: !!document.querySelector('.sw-marque'), avatar: !!document.getElementById('gxProfil'), ancre: !!document.querySelector('.sb-ancre') };
    });
    console.log('   ' + JSON.stringify(b));
    ok(b.vu === true, 'les quatre chiffres apparaissent : le bloc n est pas un trou');
    ok(b.titres.join(',') === 'PLAYERS,CASINO VOLUME,ROUNDS PLAYED,WINNINGS PAID', 'et ce sont les memes quatre que sur les autres pages');
    ok(b.valeurs.join(',') === '1.2k,4.7M,98.1k,3.2M', 'ils portent les nombres du serveur, arrondis vers le BAS (' + b.valeurs.join(' · ') + ')');
    ok(b.marque && b.avatar && b.ancre, 'la marque, l avatar et l ancre de la bulle sont la, comme ailleurs');
    /* Sans session, les boutons de connexion SE VOIENT : la socket de la bulle
       s'ouvre pour tout visiteur, ce qui ne veut pas dire qu'il est entre. */
    ok(await page.isVisible('#connectBtn') && await page.isVisible('#emailBtn'), 'sans session, « Connect wallet » et « Sign up — email » sont a l ecran');
    const avant = await page.evaluate(() => ({ dit: document.getElementById('stagetag').textContent, ouvert: document.querySelectorAll('.on').length }));
    await page.click('#connectBtn');
    await page.waitForTimeout(500);
    const apres = await page.evaluate(() => ({ dit: document.getElementById('stagetag').textContent, ouvert: document.querySelectorAll('.on').length }));
    ok(apres.ouvert > avant.ouvert || apres.dit !== avant.dit, 'CONNECT WALLET fait quelque chose — il etait peint et branche sur rien');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await ctx.close();
  }

  /* ---- LE MENU DU SITE SE VOIT A TOUTES LES LARGEURS ----
   * Le menu de l'accueil fait foi. Sous 1400 px il passe sur sa propre rangee,
   * qui defile de cote : il change de forme, il ne disparait pas. */
  console.log('\n-- le menu du site se voit a toutes les largeurs --');
  const ATTENDU = [...fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').matchAll(/<a href="([^"]+)"[^>]*><span class="ic">/g)].map((m) => m[1]);
  ok(ATTENDU.length >= 6, `le menu de l accueil porte ${ATTENDU.length} entrees`);
  for (const large of [1920, 1280, 900, 390]) {
    const ctx = await nav.newContext({ viewport: { width: large, height: 900 } });
    const page = await ctx.newPage();
    await page.route(/geckoterminal|gopluslabs|dexscreener|rpc\.mainnet|honeypot\.is|blockscout/, (r) => r.abort());
    await page.route(/\/ai\/colonie/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(vueFausse()) }));
    await page.route(/vitrine\.json/, (r) => r.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.goto('http://127.0.0.1:' + port + '/' + PAGE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1100);
    const v = await page.evaluate(() => { const a = [...document.querySelectorAll('.sw-nav a')];
      return { liens: a.map((x) => x.getAttribute('href')), vus: a.filter((x) => x.getBoundingClientRect().width > 0).length,
               deborde: document.documentElement.scrollWidth > window.innerWidth + 1 }; });
    ok(v.vus === ATTENDU.length, large + 'px : les ' + ATTENDU.length + ' entrees se voient (' + v.vus + '/' + ATTENDU.length + ')');
    ok(v.liens.join(',') === ATTENDU.join(','), large + 'px : et ce sont celles de l accueil, dans le meme ordre');
    ok(!v.deborde, large + 'px : et rien ne deborde sur le cote');
    let arrive = 'rien';
    try { await page.click('.sw-nav a[href="swoge_wallet.html"]', { timeout: 5000 }); await page.waitForTimeout(700); arrive = page.url().split('/').pop(); }
    catch (e) { arrive = 'clic impossible'; }
    ok(arrive === 'swoge_wallet.html', large + 'px : et un clic emmene vraiment sur la page (' + arrive + ')');
    await ctx.close();
  }

  /* ---- UN ONGLET A LA FOIS, ET LE CHOIX EST GARDE ----
   * Le but : qu'on sache OU REGARDER. Un seul onglet montre, rien de PERDU
   * (tous les blocs sont dans un onglet), et l'onglet choisi survit a la
   * visite suivante — c'est une preference de lecture, rien d'autre. */
  console.log('\n-- les six onglets --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const p = await page.evaluate(() => ({
      onglets: [...document.querySelectorAll('#tabs button[data-tab]')].map((b) => b.dataset.tab),
      sections: [...document.querySelectorAll('section[data-p]')].map((s) => s.dataset.p),
      montres: [...document.querySelectorAll('section[data-p]')].filter((s) => !s.hidden).map((s) => s.dataset.p),
      choisi: (document.querySelector('#tabs button[aria-selected="true"]') || {}).dataset,
      perdus: [...document.querySelectorAll('.card[data-pan]')].filter((c) => !c.closest('section[data-p]')).map((c) => c.dataset.pan),
      peints: ['closed', 'audit', 'tmLignes', 'services'].map((id) => (document.getElementById(id) || {}).textContent.length > 20),
    }));
    ok(p.onglets.join() === p.sections.join() && p.onglets.length === 6, 'six onglets, six sections, un bouton pour chacune');
    ok(p.montres.length === 1 && p.choisi && p.choisi.tab === p.montres[0], 'une seule section est montree, celle que l onglet marque (' + p.montres.join() + ')');
    ok(p.perdus.length === 0, 'aucun panneau n est hors d un onglet : rien n est perdu en chemin' + (p.perdus.length ? ' [' + p.perdus.join() + ']' : ''));
    ok(p.peints.every(Boolean), 'les onglets caches sont peints quand meme : un onglet qu on ouvre est deja a jour');
    await onglet(page, 'le');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    ok(await page.evaluate(() => (document.querySelector('#tabs button[aria-selected="true"]') || {}).dataset.tab) === 'le',
       'l onglet choisi est garde a la visite suivante — sinon on rechoisit sa question a chaque fois');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
    for (const [h, t] of [['#market', 'ma'], ['#tm-market', 'ma'], ['#tm-proof', 'so']]) {
      const b = await ouvre(nav, port, { urlSuffixe: h });
      const m = await b.page.evaluate(() => [...document.querySelectorAll('section[data-p]')].filter((s) => !s.hidden).map((s) => s.dataset.p).join());
      ok(m === t, 'une adresse en ' + h + ' ouvre son onglet (' + m + ') — les liens de l ancienne page menent encore quelque part');
      await b.page.context().close();
    }
  }
}

/* ======================================================================
 * SOUMETTRE UN CONTRAT A LA COLONIE DEPUIS LE SCANNER (28 septembre 2026)
 * Une adresse dans la recherche montre le bouton ; le message part par la
 * session (le serveur compte par ws.addr, la page ne montre que) ; la reponse
 * et la liste des soumissions s'affichent, echappees.
 * ====================================================================== */
async function soumissionScanner() {
  console.log('\n-- soumettre un contrat a la colonie depuis le scanner --');
  const WSS = require('ws').Server;
  const httpJeu = require('http').createServer((q, r) => { r.writeHead(404); r.end(); });
  await new Promise((r) => httpJeu.listen(0, r));
  const jeu = new WSS({ server: httpJeu });
  const recus = [];
  const ADR = '0x' + 'c3'.repeat(20);
  jeu.on('connection', (c) => {
    c.send(JSON.stringify({ type: 'hello', loginNonce: 'a', chainId: 4663 }));
    c.on('message', (d) => {
      let m; try { m = JSON.parse(d); } catch (e) { return; }
      if (m.type === 'resume') c.send(JSON.stringify({ type: 'auth', address: '0x' + '11'.repeat(20), balance: '0', session: 'j' }));
      if (m.type === 'colonieSoumissions') { recus.push('liste'); c.send(JSON.stringify({ type: 'colonieSoumissions', liste: [] })); }
      if (m.type === 'colonieSoumets') {
        recus.push('soumets:' + m.adr);
        if (m.adr === ADR) {
          c.send(JSON.stringify({ type: 'colonieSoumis', ok: true, place: 2, soumission: { address: ADR, status: 'queued', text: 'queued: the colony reads it at its next round' } }));
          c.send(JSON.stringify({ type: 'colonieSoumissions', liste: [{ address: ADR, symbol: null, status: 'queued', text: 'queued: <b>the colony</b> reads it at its next round' }] }));
        } else c.send(JSON.stringify({ type: 'colonieSoumis', ok: false, raison: '5 submissions a day per wallet - come back tomorrow' }));
      }
    });
  });
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('swogeSession', 'j'); } catch (e) {} });
  const { page, boum } = await ouvre(nav, port, { ctx, urlSuffixe: '?server=ws://127.0.0.1:' + httpJeu.address().port });
  await page.waitForTimeout(3500);
  await onglet(page, 'ma');
  ok(recus.indexOf('liste') >= 0, 'a la connexion, la page demande ses soumissions (une fois la session ouverte)');
  ok(await page.isHidden('#tmSoumets'), 'sans adresse dans la recherche : pas de bouton');
  await page.fill('#tmCherche', 'miel'); await page.waitForTimeout(150);
  ok(await page.isHidden('#tmSoumets'), 'un symbole n est pas une adresse : pas de bouton');
  await page.fill('#tmCherche', ADR); await page.waitForTimeout(150);
  ok(await page.isVisible('#tmSoumets') && /Submit to the colony/.test(await page.textContent('#tmSoumets')), 'une adresse de contrat : le bouton « Submit to the colony »');
  await page.click('#tmSoumets'); await page.waitForTimeout(600);
  const box = await page.textContent('#tmSoumis');
  ok(recus.indexOf('soumets:' + ADR) >= 0, 'le clic envoie colonieSoumets avec l adresse tapee (le serveur, lui, compte par la session)');
  ok(/Submitted\. The colony reads it at its next round \(#2 in the queue\)/.test(box) && /no shortcut, no forced buy/.test(box), 'la reponse : sa place dans la file, et « sans passe-droit »');
  ok(/Your submissions/.test(box) && /queued: <b>the colony<\/b>/.test(box) && (await page.$('#tmSoumis b b')) === null, 'la liste de ses soumissions s affiche, le texte du serveur ECHAPPE');
  await page.fill('#tmCherche', '0x' + 'd4'.repeat(20)); await page.waitForTimeout(150);
  await page.click('#tmSoumets'); await page.waitForTimeout(600);
  ok(/5 submissions a day per wallet/.test(await page.textContent('#tmSoumis')), 'un refus du serveur est montre tel quel');
  ok(boum.length === 0, 'aucune erreur de page' + (boum.length ? ' — ' + boum[0] : ''));
  await page.close(); await ctx.close(); jeu.close(); httpJeu.close();
  /* Sans session : le bouton le dit, rien ne part. (Le faux serveur de jeu est
     ferme : la bulle n'a pas de fil pret.) */
  const b2 = await ouvre(nav, port, { urlSuffixe: '?server=ws://127.0.0.1:9' });
  await onglet(b2.page, 'ma');
  await b2.page.fill('#tmCherche', ADR); await b2.page.waitForTimeout(150);
  await b2.page.click('#tmSoumets'); await b2.page.waitForTimeout(300);
  ok(/Connect your wallet to submit a token to the colony/.test(await b2.page.textContent('#tmSoumis')), 'sans session : « connect your wallet », rien n est envoye');
  await b2.page.context().close();
}

/* ==========================================================================
 * 16. CE QUE DEVIENNENT LES JETONS REFUSES, ET QUEL TRAIT SEPARE
 * Le verdict d'une regle se rapporte a ce qu'on ACHETE (« achete ou retenu »),
 * et sous 40 jetons une part est du bruit : la ligne le dit et ne conclut pas.
 * ==========================================================================*/
async function auditDesVetos() {
  console.log('\n-- l audit des refus --');
  const { page, boum } = await ouvre(nav, port, {});
  const v = await lit(page);
  console.log('   ' + v.auditN);
  ok(/218 followed/.test(v.auditN) && /34 running/.test(v.auditN), 'le compte des jetons resuivis est affiche (' + v.auditN + ')');
  ok(/one holder holds 90%/.test(v.audit) && /score too low/.test(v.audit), 'chaque raison de refus a sa ligne');
  ok(/140 token\(s\) followed/.test(v.audit) && /96 collapsed/.test(v.audit), 'avec ce que les ecartes ont VRAIMENT fait');
  ok(/32%/.test(v.audit) && /5%/.test(v.audit), 'la part des ecartes qui sont montes est sur chaque ligne');
  ok(/32% of what this rule set aside went up: it costs more than it protects/.test(v.audit),
     'un veto dont les ecartes montent plus que ce qu on achete est SIGNALE comme un cout, avec sa part reelle');
  ok(!/5% of what this rule set aside went up/.test(v.audit) && /5% went up against 20% for what was bought: this rule protects/.test(v.audit),
     'et celui qui protege porte la phrase inverse, rapportee a ce qu on achete');
  const verdicts = await page.$$eval('#audit tr[data-verdict]', (l) => l.map((r) => r.dataset.verdict));
  ok(verdicts.indexOf('cher') >= 0 && verdicts.indexOf('protege') >= 0 && verdicts[0] === 'vRef',
     'les deux se distinguent d un coup d oeil, et la reference ouvre le tableau (' + verdicts.join(', ') + ')');
  ok(/Too few 12\/40/.test(v.audit) && verdicts.indexOf('peu') >= 0, 'une regle a 12 jetons ne recoit aucun verdict : « trop peu », avec son compte');
  ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
  console.log('\n-- et quel trait separe vraiment --');
  ok(/3 traits/.test(v.traitsN) && /914 readings/.test(v.traitsN), 'le nombre de traits classes et de releves est affiche (' + v.traitsN + ')');
  ok(/\+21\.4%/.test(v.traits) && /pool >\$100k/.test(v.traits) && /−29\.8%/.test(v.traits) && /pool <\$1k/.test(v.traits), 'chaque trait montre sa meilleure et sa pire valeur');
  ok(/n=38/.test(v.traits) && /n=61/.test(v.traits), 'avec leurs effectifs');
  ok(v.traits.indexOf('Liquidity') < v.traits.indexOf('Volatility'), 'et le classement met en tete celui qui separe : liq avant vola');
  ok(/re-read at 5, 15, 30, 60, 120 minutes/.test(v.traitsF), 'la page dit a quelles echeances chaque jeton est relu');
  ok(/separates nothing, and dilutes/.test(v.traitsF), 'et explique pourquoi le bas de liste compte');
  await page.context().close();
  const b = await ouvre(nav, port, { vue: vueFausse({ audit: [] }) });
  ok(/followed to its deadline/.test((await lit(b.page)).audit), 'et sans releve, la carte explique ce qu on attend plutot que de rester vide');
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
    /* « $1,000 » se lirait comme une tresorerie a son point de depart. On ne
       sait simplement rien. */
    ok(v.bal === '—', 'la tresorerie n est pas affichee : « ' + v.bal + ' », pas « $1,000 »');
    ok(!v.delta, 'ni la variation, qui n aurait aucun sens sans point de depart lu');
    ok(!v.kpis && !v.truth, 'ni les chiffres cles, ni le trio d honnetete');
    ok(v.pouls === 'OFFLINE', 'le pouls le dit, dans la langue de la page (' + v.pouls + ')');
    ok(/mort/.test(v.stampCls), 'la pastille est en rouge et dit qu elle n a rien (« ' + v.stamp + ' »)');
    ok(/server/i.test(v.tag), 'et la page l ECRIT en toutes lettres : « ' + v.tag.slice(0, 90) + ' »');
    ok(/invented/i.test(v.tag), 'en disant qu elle n invente rien pour combler');
    ok(v.positions.length === 0 && /waiting for the server/i.test(v.positionsTxt), 'aucune position n est affichee');
    ok(!/\$/.test(v.appris) && /Waiting/.test(v.appris), 'et aucune lecon n est tiree de rien');
    ok(/did not answer/.test(await txt(page, '#tmLignes')), 'le scanner aussi le dit, au lieu d un tableau vide');
    ok(appels.autres.length === 0, 'la page n a appele AUCUN service de donnees elle-meme');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 2. LE SERVEUR REPOND : LA PAGE MONTRE SES CHIFFRES, ET SEULEMENT EUX
   * ==================================================================== */
  console.log('\n-- ce que la page affiche vient du serveur --');
  {
    const { page, boum, appels } = await ouvre(nav, port, { attente: 2200 });
    const v = await lit(page);
    console.log('   ' + JSON.stringify({ bal: v.bal, pos: v.pos, pouls: v.pouls, stamp: v.stamp }));
    ok(appels.serveur === 1, 'la page a demande /ai/colonie, une fois (' + appels.serveur + ')');
    ok(appels.autres.length === 0, 'et rien d autre : plus de GeckoTerminal, plus de GoPlus, plus de RPC depuis le navigateur');
    ok(v.bal === '$1,187.50', 'la tresorerie affichee est celle du serveur (' + v.bal + ')');
    ok(/^\+\$187\.50 \(\+18\.8%\)/.test(v.delta), 'le profit en decoule (' + v.delta.slice(0, 30) + ')');
    ok(/Paper win rate\s*—\s*needs 20 closed trades \(9 so far\)/.test(v.kpis), 'sous 20 trades, pas de taux de gain : la case dit combien il en faut');
    ok(/Net after costs\s*—\s*not served by the server/.test(v.kpis), 'un chiffre que la vue ne porte pas s ecrit « non servi », jamais 0');
    ok(/1\.42×/.test(await txt(page, '#eqStats')), 'et le meilleur multiple (1.42×)');
    ok(v.pos === '2 open' && v.positions.length === 2, 'les deux positions ouvertes sont affichees');
    ok(/NOVA/.test(v.positions[0]) && /\+6\.4%/.test(v.positions[0]), 'avec leur valeur latente calculee par le serveur (' + v.positions[0] + ')');
    ok(/held by hand until \d\d:\d\d/.test(v.positionsTxt), 'une position tenue a la main le dit, avec l heure');
    ok(/last price 40min ago/.test(v.positions[1]), 'celle dont le prix est perime dit depuis QUAND (' + v.positions[1] + ')');
    ok(!/\+0\.0%/.test(v.positions[1]), 'et surtout pas « +0,0 % », qui ferait passer un prix d entree pour une cotation');
    ok(/^LIVE · last turn/.test(v.pouls), 'le pouls est vert : le serveur a fini un tour recemment (' + v.pouls + ')');
    ok(/server at \d\d:\d\d UTC/.test(v.stamp), 'et la pastille porte l heure du SERVEUR (« ' + v.stamp + ' »)');
    ok(/PAPER|Paper trading at real prices/.test(await txt(page, '.note')) && /signs no transaction/.test(await txt(page, '.note')), 'l avertissement papier est ecrit en toutes lettres sous le tresor');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 3. LES AGENTS, ET CE QU ILS ONT APPRIS
   * ==================================================================== */
  console.log('\n-- les lecons viennent du serveur, avec leur nombre d observations --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const v = await lit(page);
    const compteurs = v.agents.join(' | ');
    ok(/240 tokens seen/.test(compteurs), 'le Scout porte le compte du SERVEUR (240 tokens vus)');
    ok(/190 blocked out of 240 seen \(79%\)/.test(compteurs), 'chaque garde porte son taux de refus mesure (190/240 = 79 % pour le Whale)');
    ok(/1 call/.test(compteurs), 'et ce que ses donnees coutent en appels — les deux chiffres qui decident de son rang');
    ok(/born 60min ago/.test(compteurs) && /never refuses/.test(compteurs), 'un specialiste dit son age et qu il ne refuse jamais : il affine, il ne garde pas');
    ok(/stakes sized/.test(compteurs) && /method part \(learned\)/.test(compteurs), 'le Banquier dit combien de mises il a posees, et avec quelle methode');
    ok(/hold 20 min \(learned\)/.test(compteurs), 'et le Closer dit que sa tenue est APPRISE, pas celle par defaut');
    /* Qui a appris le DIT avec son nombre d'observations et sa confiance ; qui
       n'a rien appris le dit aussi. */
    const lignes = await page.$$eval('#appris tr[data-agent]', (l) => l.map((r) => r.dataset.agent + ':' + r.textContent.replace(/\s+/g, ' ')));
    const avec = new Set(lignes.filter((l) => /obs · confidence \d+%/.test(l)).map((l) => l.split(':')[0]));
    const sans = new Set(lignes.filter((l) => /has learned nothing yet|no clear trend/.test(l)).map((l) => l.split(':')[0]));
    ok(avec.size >= 5, avec.size + ' agents publient leurs lecons avec leur nombre d observations et la confiance qui va avec');
    ok(avec.size + sans.size === vueFausse().roster.length, 'et les autres disent qu ils n ont rien appris — aucun n affiche une lecon sans compte');
    ok(sans.has('whale-topage'), 'un agent ne il y a une heure n a rien appris, et il l ecrit plutot que de faire semblant');
    /* Une lecture ratee (GoPlus muet) n'est pas une lecon sur le jeton : jamais
       en titre quand une lecon reelle existe, jamais en vert, et nommee. */
    const warden = lignes.filter((l) => /^warden:/.test(l));
    ok(warden.length && /no tax/.test(warden[0]), 'la premiere lecon du Warden est sa lecon REELLE, pas sa lecture ratee (« ' + (warden[0] || '').slice(0, 80) + ' »)');
    ok(/failed read, not the token/.test(v.appris), 'et la case non lue est NOMMEE comme telle');
    const vert = await page.evaluate(() => [...document.querySelectorAll('#appris tr')].filter((r) => /code unknown/.test(r.textContent)).map((r) => r.querySelector('td.n:last-child').className));
    ok(vert.length === 1 && !/up/.test(vert[0]), 'elle n est pas peinte en vert : la couleur se lit avant le mot (' + vert.join() + ')');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 4. TOUT LE MONDE VOIT LA MEME CHOSE
   * ==================================================================== */
  console.log('\n-- deux visiteurs, un seul etat --');
  {
    const a = await ouvre(nav, port, { attente: 2200 });
    const b = await ouvre(nav, port, { attente: 2200 });
    const va = await lit(a.page), vb = await lit(b.page);
    ok(va.bal === vb.bal && va.kpis === vb.kpis, 'meme tresorerie, memes chiffres cles');
    ok(JSON.stringify(va.positions) === JSON.stringify(vb.positions), 'memes positions ouvertes, au meme prix');
    ok(va.appris === vb.appris, 'et les memes lecons — une seule colonie, pas deux');
    const stock = await a.page.evaluate(() => { const out = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/colonie|swogeAi/i.test(k)) out[k] = (localStorage.getItem(k) || '').slice(0, 40); }
      return out; });
    console.log('   stockage local : ' + JSON.stringify(stock));
    /* Ce qui a le droit d'y etre : les PREFERENCES de lecture (langue, onglet). */
    const PREFS = ['swogeAiLangue', 'swogeAiOnglet'];
    const intrus = Object.keys(stock).filter((k) => PREFS.indexOf(k) < 0);
    ok(intrus.length === 0, intrus.length === 0 ? 'rien d autre que les preferences de lecture n est ecrit ici' : 'il reste : ' + intrus.join(', '));
    await a.page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await a.page.evaluate(() => demande(true));
    await a.page.waitForTimeout(700);
    const apres = await lit(a.page);
    ok(apres.bal === va.bal && apres.kpis === va.kpis, 'et effacer le stockage local ne change rien a ce qui est affiche');
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
  await soumissionScanner();

  /* ======================================================================
   * 5. LA SCENE REJOUE LA DECISION, ELLE NE LA PREND PAS
   * Si un jeton refuse marchait jusqu'au tresor, l'ecran raconterait un achat
   * qui n'a pas eu lieu. Chaque refus appartient a un agent : c'est LA qu'il
   * s'arrete. Le serveur dit qui (`quiRefuse`) ; la phrase n'est qu'un secours.
   * ==================================================================== */
  console.log('\n-- le jeton s arrete chez l agent a qui la raison appartient --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const m = await page.evaluate(() => {
      const cas = [
        { r: 'honeypot', q: 'warden', attendu: 'warden' }, { r: 'sell tax 42%', q: 'warden', attendu: 'warden' },
        { r: 'one holder holds 88% of the float', q: 'whale', attendu: 'whale' },
        { r: 'a single wallet makes 92% of the volume', q: 'whisper', attendu: 'whisper' },
        { r: 'score too low', q: 'oracle', attendu: 'oracle' },
        { r: 'honeypot', q: null, attendu: 'warden' },
        { r: '31 addresses touched the token, none of them holds it', q: null, attendu: 'whale' },
        { r: 'a single wallet makes 92% of the volume', q: null, attendu: 'whisper' },
        { r: 'score too low', q: null, attendu: 'oracle' },
        { r: null, q: null, attendu: null },
      ];
      return cas.map((c) => ({ r: c.r, cle: c.q, obtenu: agentRefus({ refus: c.r, quiRefuse: c.q }), attendu: c.attendu }));
    });
    for (const x of m)
      ok(x.obtenu === x.attendu, (x.cle ? '[cle] ' : '[phrase] ') + '« ' + (x.r === null ? 'aucun refus' : x.r) + ' » → ' + (x.obtenu || 'le jeton va jusqu au tresor') + (x.obtenu === x.attendu ? '' : ' (attendu ' + x.attendu + ')'));
    const arrets = await page.evaluate(() => VUE.candidats.map((c) => c.sym + ':' + Scene.arret(c)));
    console.log('   ' + arrets.join(' '));
    ok(arrets.indexOf('PIEGE:warden') >= 0, 'dans la scene, le jeton piege s arrete CHEZ LE WARDEN');
    ok(arrets.indexOf('MIEL:cobaye') >= 0, 'et celui dont la sortie est bloquee chez le Cobaye, apres que tous les autres l aient laisse passer');
    ok(arrets.indexOf('NOVA:hub') >= 0, 'seul celui qui a tout passe va jusqu au tresor');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * CE QUE LE MIROIR A VRAIMENT TOUCHE
   * « Le papier apprend sur des prix. Le miroir connait ce qu un achat a coute
   * gaz compris. » L'ecart des deux doit se LIRE — et pas sous REEL_ASSEZ.
   * ==================================================================== */
  console.log('\n-- le cout reel, mesure sur un portefeuille, a cote du papier --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    await onglet(page, 'mi');
    const r = await page.evaluate(() => ({ compte: document.getElementById('reelN').textContent,
      txt: document.querySelector('.card[data-pan="reel"]').textContent.replace(/\s+/g, ' '), rv: document.getElementById('rv').textContent.replace(/\s+/g, ' ') }));
    console.log('   ' + r.txt.slice(0, 230));
    ok(/9 real closes/.test(r.compte), 'la carte compte les fermetures reelles : ' + r.compte);
    ok(/The paper counts 12\.8 points more than the wallet gets/.test(r.txt), 'elle dit l ecart entre ce que le papier compte et ce que le portefeuille touche');
    ok(/That gap is the real cost of a round trip on this chain/.test(r.txt), 'et ce que cet ecart EST : le cout reel d un aller-retour');
    ok(/fill −1\.6% off the quote/.test(r.txt) || /fill -1\.6% off the quote/.test(r.txt), 'avec le glissement moyen entre le devis et le prix obtenu');
    ok(/\$JACOB/.test(r.rv) && /\+39\.9%/.test(r.rv) && /−4\.2%/.test(r.rv), 'et chaque fermeture porte les deux chiffres cote a cote : portefeuille et papier');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
  console.log('\n-- trop peu de fermetures reelles : la carte ne moyenne pas une seule --');
  {
    const { page } = await ouvre(nav, port, { vueOpts: { reel: { n: 2, moyenne: -3, ecart: 40, nEcart: 2, glissement: null,
      lignes: [{ sym: 'A', adr: '0x1', r: -3, papier: 37, glissement: null, pont: false, t: Date.now() }] } } });
    await onglet(page, 'mi');
    const plat = await txt(page, 'section[data-p="mi"]');
    ok(/Too few real closes to read the gap yet/.test(plat), 'sous cinq fermetures appariees, l ecart n est pas annonce');
    ok(!/points more than the wallet gets/.test(plat) && !/40 pts/.test(await txt(page, '#truth')), 'ni dans la carte, ni dans le trio du heros');
    ok(/\$A/.test(plat), 'mais les fermetures, elles, sont bien la : ce sont des faits');
    await page.context().close();
  }

  /* 30/09 : « ameliore SWOGE AI » — le carnet brut se lisait en gain ; net de l aller-retour, il perd. */
  console.log('\n-- la colonie gagne-t-elle une fois les frais payes ? --');
  {
    const NET = { n: 239, brut: 0.4, cout: 4.8, net: -4.4, t: -2.46, moitie1: -6.4, moitie2: -2.5, sansDevis: { n: 61, brut: 6.9 },
      cases: { min: 50, jugees: 51, positives: 2, barre: 3.1, prouvees: 0, meilleures: [{ cle: '<img src=x onerror=window.pirate=3>', n: 75, net: 2.7, t: 0.63 }] } };
    let { page } = await ouvre(nav, port, { vueOpts: { carnetNet: NET } });
    await onglet(page, 'le');
    let plat = await txt(page, '.card[data-pan="net"]');
    ok(/Over 239 paper positions with a round-trip quote: \+0\.4% before costs, 4\.8% round trip, −4\.4% after costs, per position\./.test(plat), 'brut, cout, net, sur combien de positions');
    ok(/It loses after costs, and it is not luck: t -2\.46, both halves of the period negative/.test(plat), 't ≤ −2 et les deux moities negatives : elle perd, et on le dit');
    ok(/51 kinds of tokens judged \(50\+ positions each\): 2 in profit after costs, 0 above the 3\.1 bar/.test(plat) && /Best kind: \+2\.7% after costs over 75 positions \(t 0\.63\)/.test(plat),
       'les sortes de jetons jugees, la barre, la meilleure — sans son nom interne');
    ok(/61 positions had no round-trip quote \(\+6\.9% before costs\): their cost is unknown, not zero/.test(plat), 'les positions sans devis restent a part');
    ok(await page.evaluate(() => !document.querySelector('.card[data-pan="net"] img') && window.pirate === undefined), 'rien du serveur n est lu comme du HTML');
    ok(/−4\.4%/.test(await txt(page, '#truth')), 'et le trio du heros donne le net, au-dessus du seuil');
    await page.context().close();
    ({ page } = await ouvre(nav, port, { vueOpts: { carnetNet: Object.assign({}, NET, { n: 30, t: -3, cases: { jugees: 0 } }) } }));
    await onglet(page, 'le');
    plat = await txt(page, '.card[data-pan="net"]');
    ok(/Too few positions to conclude \(30\/50\)/.test(plat) && !/not luck/.test(plat), 'sous 50 positions : les chiffres, et aucune conclusion');
    const tr = await txt(page, '#truth');
    ok(/After costs\s*—\s*needs 50 positions with a quote \(30 so far\)/.test(tr), 'et le heros ne conclut pas non plus : « ' + tr.slice(0, 70) + ' »');
    await page.context().close();
  }

  console.log('\n-- les jeux de regles, cote a cote, et aucun ne trade --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    await onglet(page, 'le');
    const b = await page.evaluate(() => ({ compte: document.getElementById('bancsN').textContent,
      txt: document.querySelector('.card[data-pan="bancs"]').textContent.replace(/\s+/g, ' '),
      gagne: [...document.querySelectorAll('#bancs tr[data-gagne]')].map((r) => r.dataset.cle) }));
    console.log('   ' + b.txt.slice(0, 240));
    ok(/240 tokens replayed/.test(b.compte), 'la carte compte les rejeux : ' + b.compte);
    ok(/118 of them bought/.test(b.compte), 'et dit combien, dans le lot, on aurait reellement achetes');
    ok(/Current rules/.test(b.txt) && /trading today/.test(b.txt), 'celui qui trade aujourd hui est NOMME comme tel (en anglais : « Current rules »)');
    ok(/\+9\.3%/.test(b.txt) && /\+2\.1%/.test(b.txt) && /−3\.5%/.test(b.txt) && /\+6\.7%/.test(b.txt), 'chaque jeu porte en tete ce qu il aurait rendu SUR CE QU ON ACHETE');
    ok(!/−4\.2%/.test(b.txt) && !/\+12\.6%/.test(b.txt), 'et jamais la moyenne du lot en tete');
    ok(/scalp \+ moon bag/.test(b.txt) && /20% of the position is never sold/.test(b.txt), 'et le moon bag est decrit pour ce qu il est');
    ok(/on the 118 we would have bought: 44% ended up/.test(b.txt), 'le detail dit sur quoi porte le chiffre');
    ok(/122 set aside: −17\.2%/.test(b.txt), 'les ecartes restent affiches, mais a part');
    ok(b.gagne.join() === 'en vigueur', 'le meilleur est marque — et c est le gagnant SUR LES ACHETES, pas celui du lot (' + b.gagne.join() + ')');
    ok(/The figure that decides is the one on what we would have BOUGHT/.test(b.txt), 'la carte dit laquelle des deux colonnes decide');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
  console.log('\n-- le banc apparie : ecart, t, moities, net — et rien sous le seuil --');
  {
    const sans = await ouvre(nav, port, {});
    ok(!(await sans.page.$('#bancsApparie')), 'sans mesure appariee servie : aucun bloc, aucun zero');
    await sans.page.context().close();
    const BM = { depuis: Date.parse('2026-10-02T08:00:00Z'), n: 31, cout: 4.7, min: 50, barre: 2.13, jeux: [
      { cle: 'en vigueur', n: 31, brut: -4.1, net: { n: 31, net: -8.8, t: -2.1 }, ecart: null, meilleur: false },
      { cle: 'laisser courir', n: 31, brut: 9.2, net: { n: 31, net: 4.5, t: 0.6 }, ecart: { n: 31, net: 13.3, t: 1.4, moitie1: 22.1, moitie2: 4.9 }, meilleur: true } ] };
    const { page, boum } = await ouvre(nav, port, { vueOpts: { bancMesure: BM } });
    const t = await page.evaluate(() => (document.getElementById('bancsApparie') || {}).textContent || '');
    console.log('   ' + t.replace(/\s+/g, ' ').slice(0, 260));
    ok(/Paired test since Oct 2: 31 tokens we would have bought/.test(t) && /4\.7% round trip/.test(t), 'le bloc dit depuis quand, sur combien de jetons, et de quel aller-retour il est net');
    ok(/Let it run: \+13\.3 pts vs trading today \(t 1\.4, halves 22\.1 \/ 4\.9\) · net \+4\.5%/.test(t), 'l ecart apparie, son t, ses deux moities et le net sont ecrits tels que le serveur les sert');
    ok(!/better, proven/.test(t) && /Nothing is decided below 50 tokens \(31 so far\)/.test(t), 'sous 50 jetons, aucun jeu n est designe — meme si le serveur le marque — et la page dit pourquoi');
    ok(/few checkpoints/.test(t), 'et elle rappelle la limite du rejeu');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
  console.log('\n-- trop peu de rejeux : la carte le dit au lieu de classer --');
  {
    const { page } = await ouvre(nav, port, { vueOpts: { bancs: [
      { cle: 'en vigueur', quoi: 'x', n: 12, moyenne: -2, partGagnantes: 30, meilleur: 10 },
      { cle: 'paliers hauts', quoi: 'y', n: 12, moyenne: 40, partGagnantes: 25, meilleur: 90 }] } });
    const plat = await txt(page, '.card[data-pan="bancs"]');
    ok(/a difference on a handful of tokens is luck, not a result/.test(plat), 'sous cent rejeux, la carte refuse de designer un gagnant');
    ok(!(await page.$('#bancs tr[data-gagne]')), 'et aucun n est marque gagnant');
    await page.context().close();
  }
  console.log('\n-- le lot est gros, les achetes non : c est le second qui commande --');
  {
    const { page } = await ouvre(nav, port, { vueOpts: { bancs: [
      { cle: 'en vigueur', quoi: 'x', n: 800, moyenne: -9.7, partGagnantes: 20, meilleur: 114, retenus: { n: 9, moyenne: 4, partGagnantes: 44 }, ecartes: { n: 791, moyenne: -9.9, partGagnantes: 19 } },
      { cle: 'laisser courir', quoi: 'y', n: 800, moyenne: -2.9, partGagnantes: 17, meilleur: 790, retenus: { n: 9, moyenne: 31, partGagnantes: 33 }, ecartes: { n: 791, moyenne: -3.3, partGagnantes: 17 } }] } });
    const plat = await txt(page, '.card[data-pan="bancs"]');
    ok(/9 of them bought/.test(await txt(page, '#bancsN')), 'la carte compte les achetes a part du lot');
    ok(/on what we would have bought to separate them yet \(9\/100\)/.test(plat), 'et sous cent ACHETES elle refuse de classer, meme avec huit cents rejeux au total');
    ok(!(await page.$('#bancs tr[data-gagne]')), 'aucun gagnant marque : le lot ne rachete pas le manque d achetes');
    ok(/\+31\.0%/.test(plat) && !/−2\.9%/.test(plat.replace(/set aside[^·]*/g, '')), 'la tete reste le chiffre des achetes, meme quand il ne decide pas encore');
    await page.context().close();
  }

  /* ======================================================================
   * L'EPREUVE DE SORTIE, ET « NON LU » NE S'ECRIT PAS « ZERO »
   * Trois etats distincts : passe (avec ses chiffres), bloque, pas testable.
   * ==================================================================== */
  console.log('\n-- l epreuve de sortie, a l ecran --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    await onglet(page, 'ma');
    const l = await page.evaluate(() => { const o = {};
      for (const r of document.querySelectorAll('#tmLignes tr[data-adr]')) { const s = r.querySelector('.sym').textContent.replace('$', ''); const e = r.querySelector('.sortie');
        o[s] = { sortie: e.textContent.trim(), titre: (e.querySelector('[title]') || {}).title || '', porteurs: r.children[4].textContent.trim(), ligne: r.textContent.replace(/\s+/g, ' ') }; }
      return o; });
    console.log('   ' + JSON.stringify({ NOVA: l.NOVA && l.NOVA.sortie, INCONNU: l.INCONNU && l.INCONNU.sortie, MIEL: l.MIEL && l.MIEL.sortie }));
    ok(/exit 3\/3 · round trip 98\.2%/.test(l.NOVA.sortie), 'une sortie testee porte ses CHIFFRES, et l aller-retour chiffre par le quoteur : « ' + l.NOVA.sortie + ' »');
    ok(/exit not testable/.test(l.INCONNU.sortie), 'quand le noeud n a pas repondu, c est ecrit — une epreuve pas jouee n est pas reussie');
    ok(/not the full swap/.test(l.NOVA.titre), 'ce que l epreuve NE prouve pas est ecrit la ou on la lit');
    ok(/full round trip: selling straight back would return 98\.2% of the stake on Uniswap v4 \(60% needed\)/.test(l.NOVA.titre), 'et l aller-retour, lui, EST l echange entier : le survol le dit, avec le seuil');
    ok(/exit blocked 3\/3/.test(l.MIEL.sortie) && /Rejected · Test Subject/.test(l.MIEL.ligne) && /the exit is blocked/.test(l.MIEL.ligne),
       'le jeton dont la sortie est bloquee est rejete PAR LE COBAYE, avec la raison exacte');
    ok(/chain not read/.test(l.INCONNU.porteurs), 'un jeton dont la chaine n a pas repondu porte « chaine non lue »');
    ok(!Object.keys(l).some((k) => k !== 'VIDE' && /^0$/.test(l[k].porteurs)), 'et « 0 porteurs » n est ecrit que quand c est ce que la chaine a dit');
    /* Le scanner : les candidats du tour et les surveilles, filtres et recherche. */
    const lignes = async () => page.evaluate(() => [...document.querySelectorAll('#tmLignes tr[data-adr]')].map((r) => r.querySelector('.sym').textContent));
    ok((await lignes()).length === 9, 'le scanner porte les 7 candidats du tour et les 2 surveilles');
    ok((await page.$$eval('#tmFiltres [data-f]', (l) => l.map((b) => b.dataset.f))).join() === 'tout,achat,veille,refus', 'quatre filtres de decision');
    const filtre = async (f) => { await page.click('#tmFiltres [data-f="' + f + '"]'); await page.waitForTimeout(150); return lignes(); };
    const refus = await filtre('refus'), veille = await filtre('veille');
    ok(refus.length === 6 && refus.indexOf('$NOVA') < 0, 'Reject : les 6 refuses, pas NOVA (' + refus.join(' ') + ')');
    ok(veille.sort().join() === '$PATIENT,$PRESQUE', 'Watch : la liste de surveillance');
    await filtre('tout');
    await page.fill('#tmCherche', 'miel'); await page.waitForTimeout(150);
    ok((await lignes()).join() === '$MIEL', 'la recherche trouve par symbole');
    await page.fill('#tmCherche', ''); await page.waitForTimeout(150);
    await page.click('#tmLignes tr[data-adr="0xa7"]'); await page.waitForTimeout(250);
    const an = await page.evaluate(() => document.getElementById('tmAnalyse').innerText.replace(/\s+/g, ' '));
    ok(/Vetoed by Test Subject: the exit is blocked/.test(an), 'l analyse de MIEL dit QUI l a refuse et pourquoi, mot pour mot');
    ok(/74\/100/.test(an) && /≥ 55/.test(an), 'la note est celle de la vue, avec le seuil de la vue');
    ok(/Exit test: the transfer returns false/.test(an), 'et le resultat de l epreuve de sortie');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 7. CE QUE LA PAGE PROMET, ET LA SESSION QUI LA CONNECTE VRAIMENT
   * ==================================================================== */
  console.log('\n-- une session valable connecte VRAIMENT la page --');
  {
    const WSS = require('ws').Server;
    const jeu = new WSS({ port: 0 });
    await new Promise((r) => jeu.on('listening', r));
    const recus = [];
    jeu.on('connection', (c) => {
      c.send(JSON.stringify({ type: 'hello', loginNonce: 'abc', chainId: 4663 }));
      c.on('message', (d) => { let m; try { m = JSON.parse(d); } catch (e) { return; }
        recus.push(m.type);
        if (m.type === 'resume') c.send(JSON.stringify({ type: 'auth', address: '0x' + '11'.repeat(20), balance: '4242', session: 'jeton', resumed: true })); });
    });
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('swogeSession', 'jeton-valable'); } catch (e) {} });
    const { page, boum } = await ouvre(nav, port, { ctx, urlSuffixe: '?server=ws://127.0.0.1:' + jeu.address().port });
    await page.waitForTimeout(3500);
    const v = await page.evaluate(() => ({
      boutons: ['connectBtn', 'emailBtn'].map((id) => { const b = document.getElementById(id); return b ? b.offsetParent !== null : null; }),
      bals: [...document.querySelectorAll('[id=bal]')].map((e) => (e.textContent || '').trim()),
      connecte: typeof window.swogeConnecte === 'function' ? window.swogeConnecte() : 'absent' }));
    ok(recus.indexOf('resume') >= 0, 'la page REPREND sa session au chargement');
    ok(v.bals.length === 1, 'un seul element porte l identifiant `bal` (' + v.bals.length + ')');
    ok(v.bals[0] === '4.2k', 'et il porte le solde rendu par le serveur (' + v.bals[0] + ')');
    ok(v.connecte === true, '`swogeConnecte()` existe et repond oui');
    ok(v.boutons[0] === false && v.boutons[1] === false, 'donc « Connect wallet » et « Sign up — email » s effacent');
    ok(boum.length === 0, 'aucune erreur de page' + (boum.length ? ' — ' + boum[0] : ''));
    await page.close(); await ctx.close(); jeu.close();
  }

  /* ---- LE MIROIR : ARGENT REEL ----
   * Ce qui se mesure ici est ce que `swogemiroir.js` remplit dans les boites de
   * la page : la barre personnelle en tete de « Your mirror », le plancher en
   * dollars, Clear log / Reset stats, la carte des positions avec Sell now et
   * Buy now, et la main du proprietaire sur les positions de papier. Chaque
   * geste part au serveur, qui n'agit que sur ws.addr. */
  console.log('\n-- le miroir vaut quelque chose, et c est ecrit dans sa carte --');
  {
    const WSS = require('ws').Server;
    const httpJeu = require('http').createServer((q, r) => {
      if (q.url.split('?')[0] === '/relay/prix') { r.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); return r.end(JSON.stringify({ dollarsEnvoi: '2455.73' })); }
      r.writeHead(404); r.end();
    });
    await new Promise((r) => httpJeu.listen(0, r));
    const jeu = new WSS({ server: httpJeu });
    const recus = [];
    let actifFaux = false, venduFaux = false, remisFaux = false;
    jeu.on('connection', (c) => {
      c.send(JSON.stringify({ type: 'hello', loginNonce: 'a', chainId: 4663 }));
      c.on('message', (d) => {
        let m; try { m = JSON.parse(d); } catch (e) { return; }
        if (m.type === 'resume') c.send(JSON.stringify({ type: 'auth', address: '0x' + '11'.repeat(20), balance: '0', session: 'j' }));
        if (m.type === 'miroirEffaceJournal') recus.push(m.type);
        if (m.type === 'miroirPlay') actifFaux = true;
        if (m.type === 'miroirRemetStats') { recus.push(m.type); remisFaux = true; c.send(JSON.stringify({ type: 'miroirRemetStats', effaces: 12 })); }
        if (m.type === 'colonieTiens') { recus.push('colonieTiens:' + m.adr + ':' + m.minutes); c.send(JSON.stringify({ type: 'colonieAction', geste: 'colonieTiens', ok: true, adr: m.adr, sym: 'NOVA', minutes: m.minutes })); }
        if (m.type === 'colonieFerme') { recus.push('colonieFerme:' + m.adr); c.send(JSON.stringify({ type: 'colonieAction', geste: 'colonieFerme', ok: true, adr: m.adr, sym: 'NOVA', prix: 0.0042 })); }
        if (m.type === 'miroirVends') { recus.push('miroirVends:' + m.adr); venduFaux = true; c.send(JSON.stringify({ type: 'miroirVends', adr: m.adr, sym: 'T', sortie: '0.0041' })); }
        if (m.type === 'miroirOuvre') { recus.push('miroirOuvre:' + m.adr); c.send(JSON.stringify({ type: 'miroirOuvre', adr: m.adr, sym: 'NEW' })); }
        if (['miroirEtat', 'miroirEffaceJournal', 'miroirPlay', 'miroirVends', 'miroirOuvre', 'miroirRemetStats'].indexOf(m.type) >= 0)
          c.send(JSON.stringify({ type: 'miroirEtat', pret: true, execute: false, existe: true, actif: actifFaux, proprietaire: true,
            adresse: '0x' + 'ab'.repeat(20), solde: '0.05', min: '0.002', max: '0.5', part: 0.1,
            ordreMax: '0.05', gaz: '0.0015', places: 25, ordreMin: '0.006', ordreMinUsd: 15, coursEth: 2500,
            ouvertes: venduFaux ? [] : [{ adr: ADR_NOVA, sym: 'T', entree: '0.004', t: Date.now(), simule: true, via: 'NVDA', cout: '0.004', valeur: '0.0052', gain: '0.0012', gainPct: 30, valeurT: Date.now() }],
            transit: venduFaux ? [] : [{ sym: 'NVDA', adr: '0x' + 'd0'.repeat(20), montant: '0.02', t: Date.now() }],
            bilan: remisFaux ? { trades: 0, gagnantes: 0, profitEth: '0.000000', meilleur: 0, ouvertes: 1, simule: false }
                            : { trades: 12, gagnantes: 7, profitEth: '0.0031', meilleur: 2.4, ouvertes: 1, simule: true },
            journal: m.type === 'miroirEffaceJournal' ? [{ t: Date.now(), txt: 'Log cleared (3 lines). Positions, trades and the balance are untouched.' }]
              : [{ t: Date.now(), txt: 'Bought T' }, { t: Date.now(), txt: 'Sold T' }, { t: Date.now(), txt: 'Play' }] }));
      });
    });
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('swogeSession', 'j'); } catch (e) {} });
    const { page, boum } = await ouvre(nav, port, { ctx, urlSuffixe: '?server=ws://127.0.0.1:' + httpJeu.address().port });
    await page.waitForTimeout(4000);
    const bar = await page.evaluate(() => {
      const b = document.getElementById('bandeauMiroir');
      if (!b) return null;
      const t = (id) => (document.getElementById(id) || {}).textContent || '';
      return { visible: !b.hidden, dans: !!document.getElementById('cMi').contains(b), avant: !!(b.compareDocumentPosition(document.getElementById('gxMiroir')) & Node.DOCUMENT_POSITION_FOLLOWING),
               solde: t('mir-solde'), profit: t('mir-profit'), wr: t('mir-wr'), trades: t('mir-trades'), best: t('mir-best'), open: t('mir-open'),
               etiquettes: [...b.querySelectorAll('i')].map((x) => x.textContent), motPapier: document.querySelector('[data-t="tresorPapier"]').textContent };
    });
    console.log('   barre : ' + JSON.stringify(bar));
    ok(!!bar && bar.visible && bar.dans && bar.avant, 'la barre personnelle est la, en tete de « Your mirror », avant les gestes');
    ok(/^\$122\.79/.test(bar.solde) && /0\.05 ETH/.test(bar.solde), '0,05 ETH a 2 455,73 $ font $122.79, avec l ETH dessous (« ' + bar.solde + ' »)');
    ok(/mirror/i.test(bar.etiquettes[0]) && /balance/i.test(bar.etiquettes[0]) && /paper/i.test(bar.motPapier) && bar.etiquettes.length === 6,
       'six cases, la premiere dit « Mirror balance » — un mot different de « Paper treasury » : une caisse de papier et de l argent reel ne se ressemblent pas');
    ok(bar.profit.indexOf('+$7.61') === 0 && /0\.0031 ETH/.test(bar.profit), '0,0031 ETH font +$7.61, avec l ETH en dessous');
    ok(bar.wr === '58%' && bar.trades === '12' && bar.best === '2.40×' && bar.open === '1', 'taux 58 % · 12 trades · meilleur 2.40× · 1 ouvert');
    await page.setViewportSize({ width: 390, height: 800 });
    await page.evaluate(() => { const b = document.getElementById('mir-profit'); if (b) b.className = 'dn'; });
    await page.waitForTimeout(300);
    const tel = await page.evaluate(() => [...document.querySelectorAll('#bandeauMiroir .b-item')].map((it) => { const b = it.querySelector('b'), i = it.querySelector('i');
      return { deborde: (b.scrollWidth > it.clientWidth + 1) || (i.scrollWidth > it.clientWidth + 1), lignes: Math.round((b.querySelector('.v') || b).getBoundingClientRect().height / parseFloat(getComputedStyle(b).fontSize) * 10) / 10 }; }));
    ok(tel.length === 6 && tel.every((x) => !x.deborde), 'a 390 px, aucune case de la barre du miroir ne deborde');
    ok(tel.every((x) => x.lignes < 1.6), 'et chaque chiffre tient sur une ligne (le profit ne se coupe pas apres le signe)');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'et la page ne deborde pas sur le cote');
    await page.setViewportSize({ width: 1280, height: 900 });
    const reglages = await page.evaluate(() => (document.querySelector('#gxMiroir') || {}).textContent || '');
    ok(/at least \$15 \(0\.006 ETH\)/.test(reglages), 'la carte annonce le plancher en dollars, avec sa valeur en ETH a cote');
    ok(/A small wallet plays the \$15 floor/.test(reglages) && /holds fewer positions at once/.test(reglages) && /A large wallet never meets this floor/.test(reglages), 'et elle dit a qui ca s applique, et ce que ca coute');
    const boutons = await page.evaluate(() => [...document.querySelectorAll('#gxMiroir .mir-row .mir-b')].map((b) => b.textContent.trim()));
    ok(boutons.indexOf('Clear log') >= 0 && boutons.indexOf('Show my private key') >= 0, 'un bouton « Clear log » a cote de la cle : ' + JSON.stringify(boutons));
    page.once('dialog', (d) => d.accept());
    await page.evaluate(() => document.querySelector('#gxMiroir .mir-b[data-m="efface"]').click());
    await page.waitForTimeout(800);
    ok(recus.indexOf('miroirEffaceJournal') >= 0, 'le clic, confirme, envoie miroirEffaceJournal au serveur');
    const journal = await page.evaluate(() => [...document.querySelectorAll('#gxMiroir .mir-j')].map((j) => j.textContent));
    ok(journal.length === 1 && /Log cleared/.test(journal[0]), 'et le journal ne montre plus que la ligne qui le dit');
    console.log('\n-- les positions du miroir ont leur carte, avec Sell now et Buy now --');
    const carte = await page.evaluate(() => {
      const c = document.querySelector('.card[data-pan="miroirPositions"]');
      const b = c && c.querySelector('[data-m="vends"]'), achete = c && c.querySelector('[data-m="ouvre"]');
      return { existe: !!c, apres: !!(c && document.getElementById('cMi').compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING), dansOv: !!(c && c.closest('section[data-p="ov"]')),
               titre: c ? c.querySelector('h2').textContent : null, compte: (document.getElementById('mirPosN') || {}).textContent,
               vends: b ? { texte: b.textContent.trim(), adr: b.getAttribute('data-adr') } : null, acheteDesactive: achete ? achete.disabled : null,
               note: c ? (c.querySelector('.mir-note') || {}).textContent : null, ligne: c && c.querySelector('.mir-pos') ? c.querySelector('.mir-pos').textContent : null,
               transit: [...document.querySelectorAll('#gxMiroir .mir-note')].map((x) => x.textContent).find((x) => /In transit/.test(x)) || null };
    });
    ok(carte.existe && carte.apres && carte.dansOv, 'la carte est dans la vue d ensemble, juste apres celle du miroir');
    ok(/mirror/i.test(carte.titre || '') && carte.compte === '1', 'elle dit « mirror » dans son titre et compte la position ouverte (' + carte.compte + ')');
    ok(/via NVDA/.test(carte.ligne || ''), 'une position prise par un pont le dit sur sa ligne');
    ok(/In transit: 0\.02 NVDA/.test(carte.transit || '') && /every turn/.test(carte.transit || ''), 'et ce qui est reste entre deux jambes est dit, avec le montant');
    ok(!!carte.vends && carte.vends.texte === 'Sell now' && carte.vends.adr === ADR_NOVA, 'chaque position porte un bouton « Sell now » qui connait son jeton');
    ok(/\+30\.0%/.test(carte.ligne || '') && /\+0\.0012 ETH/.test(carte.ligne || ''), 'la ligne porte le benefice en direct, en pourcentage et en ETH');
    ok(/\$330k cap \(bought at \$310k\)/.test(carte.ligne || ''), 'et la capitalisation du moment, prise chez la colonie, la meme que sur la carte du papier');
    ok(carte.acheteDesactive === true && /Press Play/.test(carte.note || ''), 'miroir arrete : « Buy now » est eteint, et la note dit d appuyer sur Play d abord');
    page.once('dialog', (d) => d.accept());
    await page.evaluate(() => document.querySelector('.card[data-pan="miroirPositions"] [data-m="vends"]').click());
    await page.waitForTimeout(800);
    ok(recus.indexOf('miroirVends:' + ADR_NOVA) >= 0, 'le clic, confirme, envoie miroirVends avec l adresse du jeton');
    const apresVente = await page.evaluate(() => ({ compte: (document.getElementById('mirPosN') || {}).textContent,
      boutons: document.querySelectorAll('.card[data-pan="miroirPositions"] [data-m="vends"]').length, dit: [...document.querySelectorAll('.mir-dit')].map((x) => x.textContent) }));
    ok(apresVente.compte === '0' && apresVente.boutons === 0, 'la position vendue disparait de la carte, le compte passe a 0');
    ok(apresVente.dit.some((x) => /Sold \$T for 0\.0041 ETH/.test(x)), 'et la reponse du serveur se lit sous la carte');
    await page.evaluate(() => document.querySelector('#gxMiroir [data-m="play"]').click());
    await page.waitForTimeout(800);
    const enMarche = await page.evaluate(() => ({ actif: !document.querySelector('.card[data-pan="miroirPositions"] [data-m="ouvre"]').disabled, champ: !!document.getElementById('mirAdr') }));
    ok(enMarche.actif && enMarche.champ, 'apres Play, « Buy now » et le champ d adresse s allument');
    await page.evaluate(() => { document.getElementById('mirAdr').value = 'pas une adresse'; document.querySelector('.card[data-pan="miroirPositions"] [data-m="ouvre"]').click(); });
    await page.waitForTimeout(300);
    ok((await page.evaluate(() => [...document.querySelectorAll('.mir-dit')].map((x) => x.textContent))).some((x) => /contract address/.test(x)) && !recus.some((x) => /miroirOuvre/.test(x)),
       'une adresse mal formee est refusee sur place, sans rien envoyer');
    page.once('dialog', (d) => d.accept());
    await page.evaluate(() => { document.getElementById('mirAdr').value = '0x' + 'bb'.repeat(20); document.querySelector('.card[data-pan="miroirPositions"] [data-m="ouvre"]').click(); });
    await page.waitForTimeout(800);
    ok(recus.indexOf('miroirOuvre:0x' + 'bb'.repeat(20)) >= 0, 'une bonne adresse, confirmee, envoie miroirOuvre au serveur');
    ok((await page.evaluate(() => [...document.querySelectorAll('.mir-dit')].map((x) => x.textContent))).some((x) => /Bought \$NEW/.test(x)), 'et la reponse se lit');
    console.log('\n-- la barre du miroir se remet a zero sur un bouton --');
    ok((await page.evaluate(() => [...document.querySelectorAll('#gxMiroir .mir-row .mir-b')].map((b) => b.textContent.trim()))).indexOf('Reset stats') >= 0, 'un bouton « Reset stats » a cote de « Clear log »');
    page.once('dialog', (d) => d.accept());
    await page.evaluate(() => document.querySelector('#gxMiroir .mir-b[data-m="remet"]').click());
    await page.waitForTimeout(800);
    ok(recus.indexOf('miroirRemetStats') >= 0, 'le clic, confirme, envoie miroirRemetStats au serveur');
    const barre0 = await page.evaluate(() => { const t = (id) => (document.getElementById(id) || {}).textContent || ''; return { trades: t('mir-trades'), wr: t('mir-wr'), best: t('mir-best'), open: t('mir-open'), dit: [...document.querySelectorAll('.mir-dit')].map((x) => x.textContent) }; });
    ok(barre0.trades === '0' && barre0.wr === '\u2014' && barre0.best === '\u2014' && barre0.open === '1', 'la barre repart de zero — et la position ouverte y est toujours');
    ok(barre0.dit.some((x) => /12 trade/.test(x)), 'et la reponse dit combien de trades ont ete effaces');
    console.log('\n-- la main du proprietaire sur les positions de papier --');
    const gestes = await page.evaluate(() => ({ proprietaire: window.__swogeProprietaire === true,
      tiens: [...document.querySelectorAll('#positions [data-tiens]')].map((b) => b.textContent.trim() + '/' + b.getAttribute('data-min')),
      ferme: [...document.querySelectorAll('#positions [data-ferme-papier]')].map((b) => b.getAttribute('data-ferme-papier')) }));
    ok(gestes.proprietaire && gestes.tiens.length === 4 && gestes.tiens[0] === 'Hold 30 min/30' && gestes.tiens[1] === 'Hold 2 h/120', 'chaque position porte « Hold 30 min » et « Hold 2 h » quand le serveur a donne la main');
    ok(gestes.ferme.length === 2 && gestes.ferme[0] === ADR_NOVA, 'et « Close now », qui connait son jeton');
    await page.evaluate(() => document.querySelector('#positions [data-tiens][data-min="30"]').click());
    await page.waitForTimeout(800);
    ok(recus.indexOf('colonieTiens:' + ADR_NOVA + ':30') >= 0, 'le clic envoie colonieTiens avec le jeton et la duree');
    ok((await page.evaluate(() => [...document.querySelectorAll('.mir-dit')].map((x) => x.textContent))).some((x) => /Held \$NOVA for 30 min/.test(x)), 'et la reponse se lit');
    page.once('dialog', (d) => d.accept());
    await page.evaluate(() => document.querySelector('#positions [data-ferme-papier]').click());
    await page.waitForTimeout(800);
    ok(recus.indexOf('colonieFerme:' + ADR_NOVA) >= 0, 'fermer, confirme, envoie colonieFerme');
    ok((await page.evaluate(() => [...document.querySelectorAll('.mir-dit')].map((x) => x.textContent))).some((x) => /Closed \$NOVA on the paper book/.test(x) && /every mirror/.test(x)), 'et la reponse dit que les miroirs suivent');
    ok(boum.length === 0, 'aucune erreur de page' + (boum.length ? ' — ' + boum[0] : ''));
    await page.close(); await ctx.close(); jeu.close(); httpJeu.close();
  }

  console.log('\n-- la porte de connexion s ouvre DEVANT, pas sous le pied de page --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    await page.click('#emailBtn');
    await page.waitForTimeout(400);
    const d = await page.evaluate(() => {
      const o = document.querySelector('.swcon-ov');
      if (!o) return null;
      const cs = getComputedStyle(o), r = o.getBoundingClientRect(), m = o.querySelector('.mail'), e = o.querySelector('.em');
      return { display: cs.display, position: cs.position, z: cs.zIndex, haut: Math.round(r.height), large: Math.round(r.width), ecran: [innerWidth, innerHeight],
               champDeplie: m ? getComputedStyle(m).display !== 'none' : null, foyer: document.activeElement === e };
    });
    ok(d, 'la porte existe dans la page');
    ok(d && d.display === 'flex', 'elle s ouvre en `flex` — donc sa feuille de style est bien posee');
    ok(d && d.position === 'fixed', 'et elle est FIXE : sans ca elle se range en bas du document');
    ok(d && Number(d.z) > 1000000, 'au-dessus de tout ce que la page empile (z-index ' + (d && d.z) + ')');
    ok(d && d.haut >= d.ecran[1] - 2 && d.large >= d.ecran[0] - 2, 'et elle couvre l ecran');
    ok(d && d.champDeplie, 'le bouton « Sign up — email » deplie le champ e-mail, sans second clic');
    ok(d && d.foyer, 'et y pose le curseur : le bouton fait ce que son nom promet');
    ok(boum.length === 0, 'aucune erreur de page' + (boum.length ? ' — ' + boum[0] : ''));
    await page.close();
  }

  console.log('\n-- ce que la page promet en toutes lettres --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const v = await lit(page);
    const promesses = [[/no transaction is signed/i, /paper/i, 'nothing is signed, and the treasury is paper'],
      [/runs on the server/i, /same state/i, 'it runs on the server and everyone sees the same state'],
      [/gas and slippage/i, /gas and slippage/i, 'a real buy would also pay gas and slippage']];
    for (const [a1, a2, quoi] of promesses) ok(a1.test(v.foot) && a2.test(v.foot), 'en anglais, elle dit que ' + quoi);
    ok(!/stops when you close the tab/i.test(v.foot) && !/kept on (?:the|this) device/i.test(v.foot), 'et elle ne promet plus le contraire, qui etait vrai de l ancienne version');
    const fr = await page.evaluate(() => { poseLangue('fr'); return (document.getElementById('foot') || {}).textContent || ''; });
    for (const [rx, quoi] of [[/aucune transaction n'est sign/i, 'rien n est signe'], [/tourne sur le serveur/i, 'ca tourne sur le serveur'],
      [/m[eê]me [eé]tat/i, 'tout le monde voit le meme etat'], [/gaz et le glissement/i, 'un vrai achat paierait le gaz et le glissement']])
      ok(rx.test(fr), 'et en francais aussi : ' + quoi);
    await page.evaluate(() => poseLangue('en'));
    ok(!(await page.evaluate(() => !!document.getElementById('oublier'))), 'le bouton « Reset » n existe plus : sur un etat partage, il effacerait celui de tout le monde');
    const morts = await page.evaluate(() => ['refresh', 'pause', 'speed'].filter((id) => !!document.getElementById(id)));
    ok(morts.length === 0, 'les trois commandes qui ne commandaient que l animation ont disparu');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* RAPPORT DU 27 SEPTEMBRE 2026 : LE MIROIR QUI NE SUIT PAS, ET L AUDIT SUR 7 JOURS */
  console.log('\n-- le miroir : N achats envoyes en 24 h, M suivis, et pourquoi --');
  {
    const SM = { envois: 12, suivis: 1, jour: { envois: 5, suivis: 1, sansDevis: 4, sansDevisSuivis: 0, raisons: { echecAchat: 4, suivi: 1 }, echecs: { aucunePlace: 4 } } };
    let { page, boum } = await ouvre(nav, port, { vueOpts: { suiviMiroir: SM } });
    let t = await page.evaluate(() => document.getElementById('reel').textContent.replace(/\s+/g, ' '));
    ok(/5 buys sent to the mirror in 24 h, 1 followed/.test(t), 'la carte du reel dit « 5 envoyes, 1 suivi »');
    ok(/why not, per wallet: buy failed ×4 · no venue found ×4/.test(t), 'avec les raisons comptees par le serveur, par portefeuille');
    ok(/4 of the 5 had no round-trip quote from the colony/.test(t), 'et combien n avaient pas de devis de la colonie');
    ok(/The paper counts 12\.8 points more/.test(t), 'le reste de la carte est intact');
    ok(/5 sent · 1 followed/.test(await txt(page, '#mirSuivi')), 'et la carte « Your mirror » le dit aussi, sous les gestes');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
    ({ page, boum } = await ouvre(nav, port, { vueOpts: { suiviMiroir: SM, reel: { n: 0, lignes: [] } } }));
    t = await page.evaluate(() => document.getElementById('reel').textContent.replace(/\s+/g, ' '));
    ok(/5 buys sent to the mirror in 24 h, 1 followed/.test(t) && /Nothing yet/.test(t), 'sans fermeture reelle, la ligne est la, et le texte d attente aussi');
    await page.evaluate(() => demande(false)); await page.waitForTimeout(600);
    ok(await page.evaluate(() => document.querySelectorAll('#reel [data-suivi]').length) === 1, 'et elle n est jamais ecrite deux fois, d un rafraichissement a l autre');
    await page.context().close();
    ({ page } = await ouvre(nav, port, {}));
    ok(!/buys sent to the mirror/.test(await txt(page, '#reel')), 'sans envoi mesure, la carte n invente pas de ligne');
    await page.context().close();
  }
  console.log('\n-- l audit : 7 derniers jours a cote du cumul, et les jetons sans lecture --');
  {
    const AUD = [
      { cle: 'scout · pool below the buy floor', n: 27603, moyenne: 0, montes: 828, effondres: 2484, partMontes: 3, n7: 1890, montes7: 57, partMontes7: 3, sansLecture: 17581, sansLecture7: 4100 },
      { cle: 'oracle · too volatile', n: 12, moyenne: 60, montes: 4, effondres: 1, partMontes: 33, n7: 12, montes7: 4, partMontes7: 33, sansLecture: 0 },
      { cle: 'achete ou retenu', n: 278, moyenne: 19.9, montes: 73, effondres: 56, partMontes: 26, n7: 15, montes7: 9, partMontes7: 60 },
    ];
    const { page, boum } = await ouvre(nav, port, { vueOpts: { audit: AUD } });
    const t = await txt(page, '.card[data-pan="audit"]');
    ok(/last 7 days: 1890 followed, 3% went up/.test(t), 'une ligne a 1 890 cas sur 7 jours dit son pourcentage');
    ok(/last 7 days: 12 followed — under 40, too few to read; decisions keep the cumulative/.test(t), 'une ligne a 12 cas ne le dit pas, et dit pourquoi');
    ok(/last 7 days: 15 followed — under 40/.test(t) && !/60% went up/.test(t), 'la reference a 15 cas sur 7 jours non plus : ses 60 % ne sont pas affiches');
    ok(/17581 left before their 30-min reading, not counted in the share above/.test(t), 'et les jetons partis sans lecture a 30 min sont dits, par ligne');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* 8. LE SERVEUR REPOND MAL, OU DIT QU IL A ECHOUE */
  console.log('\n-- le serveur repond mal --');
  {
    const { page, boum } = await ouvre(nav, port, { casse: true });
    const v = await lit(page);
    ok(v.bal === '—', 'un 502 ne devient pas une tresorerie (' + v.bal + ')');
    ok(/OFFLINE/.test(v.pouls), 'le pouls le dit (' + v.pouls + ')');
    ok(/502/.test(v.tag), 'et le code de l erreur est ecrit, pas masque (« ' + v.tag.slice(0, 70) + ' »)');
    ok(!v.kpis, 'aucun des chiffres cles n est invente');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
  console.log('\n-- le serveur tourne mais sa lecture a echoue --');
  {
    const { page, boum } = await ouvre(nav, port, { vue: vueFausse({ erreur: 'no new token liquid enough' }) });
    const v = await lit(page);
    console.log('   ' + JSON.stringify({ stamp: v.stamp, tag: v.tag.slice(0, 70) }));
    ok(/read failed/.test(v.stamp), 'la pastille porte l echec du serveur');
    ok(/stale/.test(v.stampCls), 'et passe en perime');
    ok(/no new token liquid enough/.test(v.tag), 'la raison du serveur est reprise mot pour mot, pas resumee en « erreur »');
    ok(v.bal === '$1,187.50', 'la tresorerie deja lue reste affichee : elle est vraie, elle est juste datee (' + v.bal + ')');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
  console.log('\n-- un dernier tour trop vieux : « Live » ne se montre plus --');
  {
    const vieille = vueFausse(); vieille.dernierTour = vieille.t - 20 * 60000; vieille.maj = vieille.dernierTour;
    const { page } = await ouvre(nav, port, { vue: vieille });
    const v = await lit(page);
    ok(/^STALE · last turn 20 min ago/.test(v.pouls), 'vingt minutes sans tour, sur l horloge du SERVEUR : le pouls dit « STALE » (' + v.pouls + ')');
    await page.context().close();
  }

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exitCode = rates ? 1 : 0;
})().catch((e) => { console.log('EXCEPTION : ' + (e && e.stack || e)); process.exit(1); });
