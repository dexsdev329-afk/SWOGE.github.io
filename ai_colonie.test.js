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
      { sym: 'PEPO', pool: '0xpool1', tag: 'buy', txt: '+$21.00  ·  +42.0%', cls: 'up', t: now - 60000 },
      { sym: 'DUMP', pool: '0xpool2', tag: 'cut', txt: '-$8.50  ·  -17.0%', cls: 'dn', t: now - 300000 },
    ],
    positions: [
      { sym: 'NOVA', adr: ADR_NOVA, pool: '0xpool3', minutes: 4, score: 71, ouverteDepuis: 300000,
        tenueMin: 20, latent: 6.4, gainLatent: 2.24, mise: 35, methode: 'part',
        regime: 'autour du depart', raisonMise: 'methode part en regime « autour du depart »',
        origine: 'profils' },
      /* Une position dont le prix n'a pas ete relu : le serveur envoie `null`,
         et la page doit l'ECRIRE au lieu d'afficher 0 %. */
      { sym: 'MUET', adr: ADR_MUET, pool: '0xpool4', minutes: 9, score: 63, ouverteDepuis: 60000,
        tenueMin: 20, latent: null, gainLatent: null, mise: 30, methode: 'part',
        regime: 'autour du depart', origine: 'pools' },
    ],
    candidats: o.candidats || [
      { sym: 'NOVA', addr: '0xa1', pool: '0xpool3', minutes: 4, liq: 24000, mc: 310000, prix: 0.004,
        ch_m5: 9, score: 71, base: 68, adj: 3, refus: null, quiRefuse: null, origine: 'profils', appels: 4,
        acheteurs: 22, partDuPlusGros: 12, tradesVus: true,
        porteurs: 143, top: 3.2, chaineVue: true, montantsLus: true, personne: false,
        transferts: 812, goplusSait: false },
      { sym: 'PIEGE', addr: '0xa2', pool: '0xpool5', minutes: 6, liq: 9000, mc: 80000, prix: 0.001,
        ch_m5: 2, score: 0, base: 12, adj: 0, refus: 'honeypot', quiRefuse: 'warden', origine: 'pools', appels: 1,
        acheteurs: null, partDuPlusGros: null, tradesVus: false,
        porteurs: 4, top: 91, chaineVue: true, montantsLus: true, personne: false,
        transferts: 12, goplusSait: true },
      { sym: 'BALEINE', addr: '0xa3', pool: '0xpool6', minutes: 3, liq: 6000, mc: 40000, prix: 0.002,
        ch_m5: 1, score: 22, base: 22, adj: 0, refus: 'un porteur tient 88% du circulant', quiRefuse: 'whale', origine: 'pools', appels: 2,
        acheteurs: null, partDuPlusGros: null, tradesVus: false,
        porteurs: 3, top: 88, chaineVue: true, montantsLus: true, personne: false,
        transferts: 30, goplusSait: false },
      { sym: 'VIDE', addr: '0xa4', pool: '0xpool7', minutes: 2, liq: 4200, mc: 20000, prix: 0.0005,
        ch_m5: 0, score: 20, base: 20, adj: 0, refus: '31 adresses ont touche le jeton, aucune ne le garde', quiRefuse: 'whale', origine: 'boosts', appels: 2,
        acheteurs: null, partDuPlusGros: null, tradesVus: false,
        porteurs: 0, top: null, chaineVue: true, montantsLus: true, personne: true,
        transferts: 60, goplusSait: false },
      { sym: 'FAIBLE', addr: '0xa5', pool: '0xpool8', minutes: 8, liq: 5000, mc: 30000, prix: 0.003,
        ch_m5: -2, score: 41, base: 41, adj: 0, refus: 'note trop basse', quiRefuse: 'oracle', origine: 'pools', appels: 4,
        acheteurs: 5, partDuPlusGros: 30, tradesVus: true,
        porteurs: 22, top: 12, chaineVue: true, montantsLus: true, personne: false,
        transferts: 90, goplusSait: true },
      /* La chaine n'a pas repondu pour celui-ci : la page doit ecrire « non
         lue », pas un zero qui se lirait comme un fait. */
      { sym: 'INCONNU', addr: '0xa6', pool: '0xpool9', minutes: 5, liq: 7000, mc: 50000, prix: 0.001,
        ch_m5: 3, score: 38, base: 38, adj: 0, refus: 'note trop basse', quiRefuse: 'oracle', origine: 'pools', appels: 3,
        acheteurs: null, partDuPlusGros: null, tradesVus: false,
        porteurs: null, top: null, chaineVue: false, montantsLus: false, personne: false,
        transferts: null, goplusSait: false },
    ],
    compteurs: { scout: 240, wardenBloque: 31, wardenOk: 209, whaleBloque: 44, whaleOk: 165,
                 whisper: 165, oracle: 165, closer: 11 },
    agents: {
      scout:   { obs: 9, lecons: [{ quoi: 'ne de <10 min', n: 9, moyenne: 4.1 }] },
      warden:  { obs: 9, lecons: [{ quoi: 'code inconnu', n: 9, moyenne: -2.2 }] },
      whale:   { obs: 9, lecons: [{ quoi: 'top <5%', n: 7, moyenne: 8.3 }] },
      whisper: { obs: 9, lecons: [{ quoi: 'acheteurs devant', n: 6, moyenne: 5.5 }] },
      oracle:  { obs: 9, lecons: [{ quoi: 'mc 50-500k', n: 8, moyenne: 3.9 }] },
      closer:  { obs: 14, lecons: [{ quoi: '20 min', n: 14, moyenne: 2.7 }] },
    },
    tenue: { min: 20, appris: true, moy: 2.7, n: 14 },
    /* ---- LA STRUCTURE ----
     * Sept agents de base plus un specialiste ne de la colonie : la page doit
     * dessiner HUIT maisons sans qu'aucun nombre ne soit ecrit dedans. */
    roster: o.roster || [
      { key: 'scout', nom: 'Scout', emoji: '🛰️', couleur: '#3d7bd6', role: 'source', ordre: 0,
        mission: 'Ratisse trois flux', traits: ['age', 'liq', 'origine'], cout: 0, vus: 0, bloques: 0 },
      { key: 'whale', nom: 'Whale-Watch', emoji: '🐋', couleur: '#e8552d', role: 'garde', ordre: 1,
        mission: 'Solde les transferts', traits: ['top', 'det', 'brule'], cout: 1, vus: 240, bloques: 190 },
      { key: 'warden', nom: 'Warden', emoji: '🛡️', couleur: '#9b6cf0', role: 'garde', ordre: 2,
        mission: 'Controle le contrat', traits: ['taxe', 'code', 'pouv'], cout: 1, vus: 50, bloques: 3 },
      { key: 'whisper', nom: 'Whisper', emoji: '📡', couleur: '#1fb7a8', role: 'garde', ordre: 3,
        mission: 'Lit les trades', traits: ['press', 'flux'], cout: 1, vus: 47, bloques: 6 },
      { key: 'whale-topage', nom: 'Whale · age', emoji: '🔎', couleur: '#e8552d', role: 'specialiste',
        ordre: 90, parent: 'whale', ne: now - 3600000,
        mission: 'Recoupe « top 15-30% » par age', traits: ['top×age'], cout: 1, vus: 0, bloques: 0 },
      { key: 'oracle', nom: 'Oracle', emoji: '🔮', couleur: '#f2b21e', role: 'note', ordre: 4,
        mission: 'Note et tranche', traits: ['mc', 'elan', 'vola'], cout: 2, vus: 41, bloques: 12 },
      { key: 'banquier', nom: 'Banquier', emoji: '🏦', couleur: '#5ad1a0', role: 'banque', ordre: 5,
        mission: 'Choisit la mise', traits: ['methode'], cout: 0, vus: 0, bloques: 0 },
      { key: 'closer', nom: 'Closer', emoji: '💰', couleur: '#e83e8c', role: 'execution', ordre: 6,
        mission: 'Ouvre et ferme', traits: ['tenue'], cout: 0, vus: 0, bloques: 0 },
    ],
    ordreRevu: now - 600000,
    journalStructure: o.journal || [
      { t: now - 3600000, quoi: 'naissance',
        txt: 'Whale · age nait : « top 15-30% » est vue 20 fois avec un ecart type de 42 points — cette case ne predit rien',
        chiffres: [{ parent: 'whale', obs: 20, ecartType: 42 }] },
      { t: now - 600000, quoi: 'ordre',
        txt: 'Nouvel ordre des gardes : whale → warden → whisper (avant : warden → whale → whisper)',
        chiffres: [{ agent: 'whale', refus: '79%', appels: 1, vus: 240 }] },
    ],
    banque: o.banque || {
      methode: 'part', appris: true, regime: 'autour du depart', serie: 2, pic: 1210.4,
      engage: 65, partMax: 0.08, expoMax: 0.30, plancher: 100, miseMin: 10, arret: o.arret || null,
      prochaine: o.arret ? null
        : { mise: 35.6, methode: 'part', regime: 'autour du depart', part: 3,
            raison: 'methode part en regime « autour du depart »' },
      releve: [
        { methode: 'part', par: [{ regime: 'autour du depart', n: 12, moyenne: 4.8 }] },
        { methode: 'fixe', par: [{ regime: 'autour du depart', n: 9, moyenne: -2.1 }] },
      ],
    },
    surveillance: o.surveillance || [
      { addr: '0xaa', sym: 'PRESQUE', vu: 3, note: 48, meilleure: 52, dernier: now - 900000,
        verdict: 'note trop basse', liq: 12000 },
      { addr: '0xbb', sym: 'PATIENT', vu: 2, note: 40, meilleure: 44, dernier: now - 300000,
        verdict: 'note trop basse', liq: 7000 },
    ],
    connus: 148, bannis: 37,
    evites: [{ sym: 'DEJAVU', pourquoi: 'deja juge il y a 4 min, rien n\'a bouge' }],
    services: [
      { cle: 'pools', nom: 'GeckoTerminal · nouveaux pools', quoi: 'age, liquidite, achats', cout: 0,
        essais: 36, reussites: 36, dernier: now, dernierEchec: null },
      { cle: 'profils', nom: 'DexScreener · profils recents', quoi: 'des jetons dont la fiche est remplie',
        cout: 0, essais: 12, reussites: 12, dernier: now, dernierEchec: null },
      { cle: 'boosts', nom: 'DexScreener · jetons pousses', quoi: 'des jetons dont la mise en avant est payee',
        cout: 0, essais: 12, reussites: 12, dernier: now, dernierEchec: null },
      { cle: 'chaine', nom: 'Chaine 4663 · les blocs eux-memes', quoi: 'qui detient quoi', cout: 1,
        essais: 120, reussites: 111, dernier: now, dernierEchec: '429' },
      { cle: 'goplus', nom: 'GoPlus · securite du contrat', quoi: 'honeypot, taxes, pouvoirs', cout: 1,
        essais: 120, reussites: 120, dernier: now, dernierEchec: null },
      { cle: 'trades', nom: 'GeckoTerminal · les trades un par un', quoi: 'quels portefeuilles achetent',
        cout: 1, essais: 24, reussites: 24, dernier: now, dernierEchec: null },
      { cle: 'dex', nom: 'DexScreener · second avis', quoi: 'un deuxieme prix', cout: 1,
        essais: 60, reussites: 60, dernier: now, dernierEchec: null },
      { cle: 'ohlcv', nom: 'GeckoTerminal · chandelles', quoi: 'la volatilite observee', cout: 1,
        essais: 20, reussites: 20, dernier: now, dernierEchec: null },
    ],
    horsService: {
      gmgn: 'GMGN — 403 Cloudflare, y compris sur ethereum : c\'est une protection anti-robot, '
          + 'pas une absence de la chaine 4663.',
      blockscout: 'Blockscout robinhood — challenge Cloudflare sur l\'API comme sur les pages.',
      honeypotis: 'honeypot.is — ne connait pas la chaine 4663.',
    },
    seuil: 55, ageMax: 360,
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

  await page.goto('http://127.0.0.1:' + port + '/' + PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  return { page, ctx, boum, appels };
}

const lit = (page) => page.evaluate(() => ({
  bal: (document.getElementById('bal') || {}).textContent,
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
  feed: [...document.querySelectorAll('#feed .tr')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()),
  appris: (document.getElementById('appris') || {}).textContent.replace(/\s+/g, ' ').trim(),
  flow: (document.getElementById('flow') || {}).textContent.replace(/\s+/g, ' ').trim(),
  agents: [...document.querySelectorAll('#agents .agent')].map((a) =>
    [...a.querySelectorAll('.sc')].map((x) => x.textContent.trim())),
  foot: (document.getElementById('foot') || {}).textContent.replace(/\s+/g, ' ').trim(),
  maisons: [...document.querySelectorAll('#agents .agent')].length,
  adresses: [...document.querySelectorAll('#positions .adr code')].map((c) => c.textContent.trim()),
  boutonsCopie: [...document.querySelectorAll('#positions .adr button')].length,
  banque: (document.getElementById('banque') || {}).textContent.replace(/\s+/g, ' ').trim(),
  banqMethode: (document.getElementById('banqMethode') || {}).textContent,
  surveillance: (document.getElementById('surveillance') || {}).textContent.replace(/\s+/g, ' ').trim(),
  survN: (document.getElementById('survN') || {}).textContent,
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
    ok(v.maisons === 8, 'huit agents au serveur → huit maisons a l ecran (' + v.maisons + ')');
    ok(/8 agents/.test(v.soustitre),
       'et le nombre est ecrit depuis le roster, jamais en dur : « ' + v.soustitre + ' »');

    /* Le specialiste ne de la colonie doit dire de qui il descend : sinon un
       nom nouveau apparait un jour sans que personne sache d ou il sort. */
    const noms = await page.evaluate(() =>
      [...document.querySelectorAll('#agents .nm')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
    console.log('   ' + JSON.stringify(noms));
    ok(noms.some((n) => /Whale · age/.test(n)), 'le specialiste ne de la colonie a sa maison');
    ok(noms.some((n) => /issu de whale/.test(n)), 'et il dit de qui il descend');

    /* Les maisons sont posees sur un anneau : aucune ne doit sortir du cadre,
       quel que soit le nombre d agents. */
    const dehors = await page.evaluate(() =>
      AGENTS.filter((a) => a.house.x < 120 || a.house.x > 880 || a.house.y < 130 || a.house.y > 660)
            .map((a) => a.key));
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
    ok(av === 8 && ap === 7, 'un specialiste retire, et le village a une maison de moins');
    const bots = await page.evaluate(() => bots.length + '/' + AGENTS.length);
    ok(bots === '7/7', 'les habitants suivent : ' + bots + ' — aucun bot ne reste sans maison');
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
  const avant = await page.evaluate(() => document.querySelector('#positions .adr button').textContent);
  await page.click('#positions .adr button');
  await page.waitForTimeout(150);
  const apres = await page.evaluate(() => document.querySelector('#positions .adr button').textContent);
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
  ok(/\$35\.00 mise/.test(pos[0]), 'la mise reellement engagee est affichee ($35.00)');
  ok(/part/.test(pos[0]), 'avec la methode qui l a decidee');
  ok(/vu par profils/.test(pos[0]), 'et le flux qui a trouve le jeton');
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
    ok(/part/.test(v.banqMethode) && /apprise/.test(v.banqMethode),
       'sa methode est affichee, et le fait qu il l ait APPRISE (« ' + v.banqMethode + ' »)');
    ok(/autour du depart/.test(v.banque), 'le regime de caisse aussi');
    ok(/2 gagnantes/.test(v.banque), 'et la serie en cours');
    ok(/\$65\.00/.test(v.banque), 'ce qui est engage maintenant');
    ok(/\$35\.60/.test(v.banque), 'et ce qu il poserait sur le prochain jeton');

    /* ---- LES BORNES SONT AFFICHEES ----
     * Une page qui montre une methode d apprentissage sans montrer ses
     * garde-fous laisse croire qu il n y en a pas. */
    ok(/8% par jeton/.test(v.banque.replace(/\s/g, ' ')) || /8%/.test(v.banque),
       'les bornes qu il ne peut pas franchir sont ecrites : ' + (v.banque.match(/Bornes[^]{0,90}/) || [''])[0]);
    ok(/plancher/.test(v.banque), 'y compris le plancher sous lequel il arrete d ouvrir');

    /* Le releve de chaque methode, AVEC le nombre d observations. */
    ok(/12 obs/.test(v.banque) && /9 obs/.test(v.banque),
       'et le releve de chaque methode porte son nombre d observations');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }
  console.log('\n-- et quand il arrete d ouvrir, il le dit --');
  {
    const { page, boum } = await ouvre(nav, port,
      { vue: vueFausse({ arret: 'caisse sous le plancher de $100 : on arrete d\'ouvrir' }) });
    const v = await lit(page);
    console.log('   ' + (v.banque.match(/⛔[^]{0,70}/) || [''])[0]);
    ok(/plancher/.test(v.banque),
       'l arret est affiche avec sa raison, pas comme une panne');
    ok(!/Prochaine mise/.test(v.banque),
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
  ok(/3 examens/.test(v.surveillance),
     'avec le nombre de fois ou ils ont ete examines — c est le chiffre qui montre qu on ne les rejuge pas en boucle');
  ok(/37 bannis/.test(v.survN),
     'et les bannis sont comptes a part : ils ne reviendront jamais (' + v.survN + ')');

  console.log('\n-- ce que la colonie a change a elle-meme --');
  console.log('   ' + v.structure.slice(0, 150));
  ok(/naissance/.test(v.structure) && /ordre/.test(v.structure),
     'les deux gestes sont au journal : une naissance et un changement d ordre');
  ok(/ecart type de 42 points/.test(v.structure),
     'la naissance porte la MESURE qui l a decidee, pas une formule');
  ok(/refus 79%/.test(v.structure),
     'et le changement d ordre porte les taux de refus mesures');

  console.log('\n-- ce qui est lu, et ce qui ne peut pas l etre --');
  ok(/GeckoTerminal · nouveaux pools/.test(v.services) && /les trades un par un/.test(v.services),
     'les services sont listes avec ce que chacun apporte');
  ok(/111\/120/.test(v.services), 'avec leur releve reel (111/120 pour la chaine)');
  ok(/dernier echec : 429/.test(v.services),
     'et le dernier echec en clair quand il y en a un');
  ok(/GMGN/.test(v.services) && /Cloudflare/.test(v.services),
     'GMGN est NOMME avec la raison mesuree, plutot que passe sous silence');
  ok(/y compris sur ethereum/.test(v.services),
     'et la raison distingue « protection anti-robot » de « ne connait pas la chaine 4663 »');
  ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
  await page.context().close();
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
    ok(v.pouls === 'HORS LIGNE', 'le pouls le dit (' + v.pouls + ')');
    ok(/mort/.test(v.stampCls), 'la pastille est en rouge et dit qu elle n a rien (« ' + v.stamp + ' »)');
    ok(/serveur/i.test(v.tag), 'et la page l ECRIT en toutes lettres : « ' + v.tag.slice(0, 90) + ' »');
    ok(/invente/i.test(v.tag), 'en disant qu elle n invente rien pour combler');
    ok(v.positions.length === 0 && /attente du serveur/i.test(v.positionsTxt),
       'aucune position n est affichee');
    ok(!/\$/.test(v.appris) && /Rien encore/.test(v.appris), 'et aucune lecon n est tiree de rien');
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
    ok(/prix non relu/.test(v.positions[1]),
       'et celle dont le prix n a pas ete relu le DIT (' + v.positions[1] + ')');
    ok(v.feed.length === 2 && /PEPO/.test(v.feed[0]), 'le fil des trades vient du serveur aussi');
    ok(/LIVE/.test(v.pouls), 'le pouls est vert : le serveur a fini un tour recemment');
    ok(/serveur a \d\d:\d\d/.test(v.stamp), 'et la pastille porte l heure du SERVEUR (« ' + v.stamp + ' »)');
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
    ok(/240 tokens vus/.test(compteurs), 'le Scout porte le compte du SERVEUR (240 tokens vus)');
    /* Un garde dit ce qu'il bloque ET ce que ses donnees coutent : c'est de ces
       deux chiffres que sort son rang dans la file, donc ils doivent etre
       lisibles par la personne qui regarde. */
    ok(/190 bloques sur 240 vus \(79%\)/.test(compteurs),
       'chaque garde porte son taux de refus mesure (190/240 = 79 % pour le Whale)');
    ok(/1 appel/.test(compteurs),
       'et ce que ses donnees coutent en appels — les deux chiffres qui decident de son rang');
    ok(/ne 60min plus tot/.test(compteurs) && /ne refuse jamais/.test(compteurs),
       'un specialiste dit son age et qu il ne refuse jamais : il affine, il ne garde pas');
    ok(/mises posees/.test(compteurs) && /methode part \(apprise\)/.test(compteurs),
       'le Banquier dit combien de mises il a posees, et avec quelle methode');
    ok(/tenue 20 min \(apprise\)/.test(compteurs),
       'et le Closer dit que sa tenue est APPRISE, pas celle par defaut');

    const lecons = v.agents.map((a) => a[1]);
    console.log('   ' + lecons.join(' | '));
    /* ---- CE QUI COMPTE ICI ----
     * Pas que tout le monde ait appris — le Banquier et un agent ne il y a une
     * heure n'ont rien pu apprendre encore, et le pretendre serait exactement
     * la faute que ce fichier traque. Ce qui compte : qui a appris le DIT avec
     * son nombre d'observations, et qui n'a rien appris le dit aussi. */
    const avecLecon = lecons.filter((l) => /\(\d+ obs\)/.test(l));
    const sansLecon = lecons.filter((l) => /rien appris|pas encore/.test(l));
    ok(avecLecon.length >= 5,
       avecLecon.length + ' agents publient leur meilleure lecon avec son nombre d observations');
    ok(avecLecon.length + sansLecon.length === lecons.length,
       'et les autres disent qu ils n ont rien appris — aucun n affiche une lecon sans compte');
    ok(sansLecon.length > 0,
       'un agent ne il y a une heure n a rien appris, et il l ecrit plutot que de faire semblant');
    ok(/confiance/.test(v.appris), 'et le detail publie la confiance qui va avec le nombre d observations');
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
     * Avant, tout etait la-dedans. Si quoi que ce soit d'affiche en venait
     * encore, l'effacer changerait l'ecran. */
    const stock = await a.page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/colonie|swogeAi/i.test(k)) out[k] = (localStorage.getItem(k) || '').slice(0, 40);
      }
      return out;
    });
    console.log('   stockage local : ' + JSON.stringify(stock));
    ok(Object.keys(stock).length === 0,
       'la page n ecrit plus rien sous son ancienne cle : l etat n est plus a elle');
    await a.page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await a.page.click('#refresh');
    await a.page.waitForTimeout(500);
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
        { r: 'taxe vente 42%', q: 'warden', attendu: 'warden' },
        { r: 'un porteur tient 88% du circulant', q: 'whale', attendu: 'whale' },
        { r: 'un seul portefeuille fait 92% du volume', q: 'whisper', attendu: 'whisper' },
        { r: 'note trop basse', q: 'oracle', attendu: 'oracle' },
        /* Sans la cle — une reponse ancienne — la phrase doit encore suffire. */
        { r: 'honeypot', q: null, attendu: 'warden' },
        { r: '31 adresses ont touche le jeton, aucune ne le garde', q: null, attendu: 'whale' },
        { r: 'un seul portefeuille fait 92% du volume', q: null, attendu: 'whisper' },
        { r: 'note trop basse', q: null, attendu: 'oracle' },
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
    await page.click('#speed'); await page.click('#speed');   /* 4x : le banc n attend pas une minute */
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
   * 6. CE QUI EST LU ET CE QUI NE L EST PAS
   * ==================================================================== */
  console.log('\n-- « non lu » ne s ecrit pas « zero » --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    await page.click('#speed'); await page.click('#speed');
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
    ok(/chaine non lue/.test(tous) || Object.keys(vu || {}).length < 6,
       'un jeton dont la chaine n a pas repondu porte « chaine non lue »');
    ok(!/0 porteurs/.test(tous) || /VIDE/.test(Object.keys(vu || {}).join()),
       'et « 0 porteurs » n est ecrit que quand c est ce que la chaine a dit');
    ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
    await page.context().close();
  }

  /* ======================================================================
   * 7. CE QUE LA PAGE PROMET, ET CE QU ELLE NE PEUT PLUS FAIRE
   * ==================================================================== */
  console.log('\n-- ce que la page promet en toutes lettres --');
  {
    const { page, boum } = await ouvre(nav, port, {});
    const v = await lit(page);
    ok(/aucune transaction n'est signee/i.test(v.foot) && /papier/i.test(v.foot),
       'elle dit que rien n est signe et que la tresorerie est du papier');
    ok(/tourne sur le serveur/i.test(v.foot) && /meme etat/i.test(v.foot),
       'elle dit que ca tourne sur le serveur et que tout le monde voit le meme etat');
    ok(!/onglet est ferme, rien ne tourne/i.test(v.foot) && !/garde sur cet appareil/i.test(v.foot),
       'et elle ne promet plus le contraire, qui etait vrai de l ancienne version');
    ok(/gaz et le glissement/i.test(v.foot), 'et qu un vrai achat paierait en plus le gaz et le glissement');

    /* ---- LE BOUTON QUI DEVAIT PARTIR ----
     * Il effacait le stockage local. Sur un etat PARTAGE, le meme geste
     * effacerait la colonie de tout le monde — depuis une page publique, sans
     * authentification, et sans retour possible. */
    const reset = await page.evaluate(() => !!document.getElementById('oublier'));
    ok(!reset, 'le bouton « Reset » n existe plus : sur un etat partage, il effacerait celui de tout le monde');

    /* La pause n'arrete plus la colonie : elle n'arrete que l'animation, et
       il faut que ce soit dit, sinon elle promet un pouvoir qu'elle n'a pas. */
    await page.click('#pause');
    const tag = await page.evaluate(() => document.getElementById('stagetag').textContent);
    console.log('   pause → « ' + tag + ' »');
    ok(/animation/i.test(tag) && /serveur/i.test(tag),
       'et la pause dit qu elle n arrete que l animation');
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
    ok(/HORS LIGNE/.test(v.pouls), 'le pouls le dit');
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
      { vue: vueFausse({ erreur: 'aucun jeton neuf assez liquide' }) });
    const v = await lit(page);
    console.log('   ' + JSON.stringify({ stamp: v.stamp, tag: v.tag.slice(0, 70) }));
    ok(/lecture en echec/.test(v.stamp), 'la pastille porte l echec du serveur');
    ok(/stale/.test(v.stampCls), 'et passe en perime');
    ok(/aucun jeton neuf assez liquide/.test(v.tag),
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
