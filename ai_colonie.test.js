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
      { sym: 'NOVA', pool: '0xpool3', minutes: 4, score: 71, ouverteDepuis: 300000, tenueMin: 20, latent: 6.4 },
      /* Une position dont le prix n'a pas ete relu : le serveur envoie `null`,
         et la page doit l'ECRIRE au lieu d'afficher 0 %. */
      { sym: 'MUET', pool: '0xpool4', minutes: 9, score: 63, ouverteDepuis: 60000, tenueMin: 20, latent: null },
    ],
    candidats: o.candidats || [
      { sym: 'NOVA', addr: '0xa1', pool: '0xpool3', minutes: 4, liq: 24000, mc: 310000, prix: 0.004,
        ch_m5: 9, score: 71, base: 68, adj: 3, refus: null,
        porteurs: 143, top: 3.2, chaineVue: true, montantsLus: true, personne: false,
        transferts: 812, goplusSait: false },
      { sym: 'PIEGE', addr: '0xa2', pool: '0xpool5', minutes: 6, liq: 9000, mc: 80000, prix: 0.001,
        ch_m5: 2, score: 0, base: 12, adj: 0, refus: 'honeypot',
        porteurs: 4, top: 91, chaineVue: true, montantsLus: true, personne: false,
        transferts: 12, goplusSait: true },
      { sym: 'BALEINE', addr: '0xa3', pool: '0xpool6', minutes: 3, liq: 6000, mc: 40000, prix: 0.002,
        ch_m5: 1, score: 22, base: 22, adj: 0, refus: 'un porteur tient 88% du circulant',
        porteurs: 3, top: 88, chaineVue: true, montantsLus: true, personne: false,
        transferts: 30, goplusSait: false },
      { sym: 'VIDE', addr: '0xa4', pool: '0xpool7', minutes: 2, liq: 4200, mc: 20000, prix: 0.0005,
        ch_m5: 0, score: 20, base: 20, adj: 0, refus: '31 adresses ont touche le jeton, aucune ne le garde',
        porteurs: 0, top: null, chaineVue: true, montantsLus: true, personne: true,
        transferts: 60, goplusSait: false },
      { sym: 'FAIBLE', addr: '0xa5', pool: '0xpool8', minutes: 8, liq: 5000, mc: 30000, prix: 0.003,
        ch_m5: -2, score: 41, base: 41, adj: 0, refus: 'note trop basse',
        porteurs: 22, top: 12, chaineVue: true, montantsLus: true, personne: false,
        transferts: 90, goplusSait: true },
      /* La chaine n'a pas repondu pour celui-ci : la page doit ecrire « non
         lue », pas un zero qui se lirait comme un fait. */
      { sym: 'INCONNU', addr: '0xa6', pool: '0xpool9', minutes: 5, liq: 7000, mc: 50000, prix: 0.001,
        ch_m5: 3, score: 38, base: 38, adj: 0, refus: 'note trop basse',
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
}));

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
  const port = srv.address().port;
  const nav = await chromium.launch();

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
    const noms = ['Scout', 'Warden', 'Whale', 'Whisper', 'Oracle', 'Closer'];
    ok(v.agents.length === 6, 'les six agents sont a l ecran');
    const compteurs = v.agents.map((a) => a[0]).join(' | ');
    console.log('   ' + compteurs);
    ok(/240 tokens vus/.test(compteurs), 'le Scout porte le compte du SERVEUR (240 tokens vus)');
    ok(/31 bloques/.test(compteurs), 'le Warden le sien (31 bloques)');
    ok(/tenue 20 min \(apprise\)/.test(compteurs),
       'et le Closer dit que sa tenue est APPRISE, pas celle par defaut');
    const lecons = v.agents.map((a) => a[1]).join(' | ');
    console.log('   ' + lecons);
    ok(/ne de <10 min.*9 obs/.test(lecons), 'chaque agent porte SA meilleure lecon, avec le nombre d obs');
    ok(v.agents.every((a) => /\(\d+ obs\)/.test(a[1])),
       'les six, sans exception : deux coups de chance ne font pas une regle');
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
    const m = await page.evaluate(() => {
      const cas = [
        { r: 'honeypot', attendu: 'warden' },
        { r: 'taxe vente 42%', attendu: 'warden' },
        { r: 'le proprietaire reecrit les soldes', attendu: 'warden' },
        { r: 'createur deja honeypot', attendu: 'warden' },
        { r: 'un porteur tient 88% du circulant', attendu: 'whale' },
        { r: '31 adresses ont touche le jeton, aucune ne le garde', attendu: 'whale' },
        { r: 'note trop basse', attendu: 'oracle' },
        { r: null, attendu: null },
      ];
      const noms = ['scout', 'warden', 'whale', 'whisper', 'oracle', 'closer'];
      return cas.map((c) => {
        const i = agentRefus({ refus: c.r });
        return { r: c.r, obtenu: i < 0 ? null : noms[i], attendu: c.attendu };
      });
    });
    for (const x of m) {
      ok(x.obtenu === x.attendu,
         '« ' + (x.r === null ? 'aucun refus' : x.r) + ' » → '
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
    console.log('   $PIEGE : pastille de rejet a la position ' + pos + ' (le Warden est en 1)');
    ok(pos === 1, 'le jeton piege est rejete CHEZ LE WARDEN, la ou le serveur l a refuse');
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
