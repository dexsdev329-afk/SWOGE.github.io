'use strict';
/* ============================================================================
 * LES ALERTES EN DIRECT (16/10/2026) — la section « Live alerts » de
 * swoge_smart_money.html, qui lit /ai/smart/alertes (smart_public.js, serveur).
 *
 * Un faux serveur rend le flux en deux temps (depuis=0, puis depuis=<id> apres
 * 30 s d'horloge simulee) et ses variantes (eteint, injoignable, lien de canal
 * douteux). L'intention :
 *  - le FLUX : les alertes les plus recentes d'abord, chacune avec verdict,
 *    titre, adresse complete, liens DexScreener et explorateur, qui, risque,
 *    plan ; les plus anciennes repliees (details, jamais un bouton) ;
 *  - les RESULTATS +5 / +15 / +30 / +60 / +120 min se REMPLISSENT au
 *    rafraichissement, sur la MEME carte (aucune carte refaite : rien ne
 *    clignote) ; un palier rate dit « missed » ;
 *  - le BILAN par categorie : la part, la mediane et le meilleur au-dessus du
 *    seuil ; « not enough alerts yet (n of N) » en dessous ;
 *  - le lien « Join the Telegram channel » seulement pour un lien t.me sur ;
 *  - le bandeau « Not financial advice. Most alerts lose; a few big winners
 *    carry the result. » ;
 *  - texte du serveur en textContent (piege XSS), liens surs seulement, aucun
 *    texte francais, aucune erreur console ;
 *  - rien ne deborde a 320, 390 et 1280 px.
 * CAPTURES=<dossier> : enregistre la section a 1280 et 390 px.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const A = (s) => '0x' + s.repeat(40 / s.length).slice(0, 40);
const T0 = 1792152000;
const PIEGE = '<img src=x onerror=window.pirate=1>';
const PLAN_V = { entree: 'small fixed stake', stop: '30% trailing stop', objectif: 'sell 75% at 2x, keep 25% for a rare 10x' };
const PLAN_J = { entree: 'none yet, watch', stop: '30% trailing if you enter', objectif: 'sell 75% at 2x, keep 25% for a rare 10x' };
const PLAN_R = { entree: 'none', stop: '-', objectif: 'exit now' };
const fiche = (id, o) => Object.assign({
  v: 1, categorie: 'pons', verdict: 'jaune', titre: 'New launch', symbole: 'TOK' + id, jeton: A(('0' + id.toString(16)).slice(-2)), age_min: 1, courbe: null, cap_usd: null, cap_source: null,
  qui: [{ nom: 'Deployer', adresse: A('d' + (id % 10)), detail: null }], promo: 'no paid profile · no ads · no boosts', risque: 'Most launches fall 60-90% after their first peak.',
  plan: PLAN_J, etat: '1 min old · on the Pons curve',
}, o || {});
const vide = () => ({ 5: null, 15: null, 30: null, 60: null, 120: null });
const mesure = (id, paliers, o) => Object.assign({ id, ref: { prix: 0.00000123, source: 'curve', retard_s: 0 }, paliers: Object.assign(vide(), paliers || {}), meilleur_pct: null, pire_pct: null, releves: 1, fini: false }, o || {});
const alerte = (id, minAgo, f, m) => ({ id, t: T0 - minAgo * 60, categorie: f.categorie, verdict: f.verdict, fiche: f, texte: f.titre + '\nNot financial advice.', mesure: m });

/* dix alertes (8 visibles, 2 repliees), dont une verte de dev connu, une rouge, une piegee */
const F1 = fiche(1, { categorie: 'dev', verdict: 'vert', titre: 'Known dev launch (Known dev #1)', symbole: 'JUDGEBOT', jeton: '0xa922cdff00000000000000000000000000000001', age_min: 0.5,
  courbe: { eth: 0.0234, seuil_eth: 4.2, gradue: false }, etat: '30 s old · curve 0.023 / 4.20 ETH (1%)', qui: [{ nom: 'Known dev #1', adresse: null, detail: 'dev buy 0.028 ETH' }], plan: PLAN_V });
const P = (pct, min) => ({ pct, min, source: 'curve' });
const MESURES_VUE = {
  10: [{ 5: P(-8.1, 5.2) }, { meilleur_pct: 4.2, pire_pct: -8.1, releves: 2 }],
  9: [{ 5: P(22.4, 5) }, { meilleur_pct: 31, pire_pct: -2.5, releves: 3 }],
  8: [{ 5: P(3.2, 5.1), 15: P(-18.5, 15.4) }, { meilleur_pct: 9.8, pire_pct: -21, releves: 4 }],
  7: [{ 5: P(-4, 5), 15: P(-31.2, 15.2) }, { meilleur_pct: 2.1, pire_pct: -35.6, releves: 5 }],
  6: [{ 5: P(12, 5.3), 15: P(48.9, 15.1), 30: P(7.5, 30.4) }, { meilleur_pct: 64.3, pire_pct: -3, releves: 7 }],
  5: [{ 5: P(-15, 5), 15: P(-40.2, 15), 30: P(-62.7, 31) }, { meilleur_pct: 1.5, pire_pct: -66, releves: 8 }],
};
const LISTE = [];
for (let id = 1; id <= 10; id++) {
  let f = id === 1 ? F1 : fiche(id);
  if (id === 4) f = fiche(4, { categorie: 'pons', verdict: 'rouge', titre: 'EXIT: the dev is selling', risque: 'The dev or their wallets are selling: exit.', plan: PLAN_R });
  if (id === 6) f = fiche(6, { categorie: 'copie', titre: 'Sniper 1 buys on the curve', symbole: PIEGE, qui: [{ nom: 'Sniper 1', adresse: 'javascript:alert(1)', detail: 'bought for $120, 12 min after launch' }] });
  if (id === 9) f = fiche(9, { categorie: 'analyste', verdict: 'vert', titre: 'Analyst: entry setup met', symbole: 'AVERYLONGSYMBOL1', etat: '17 min old · market cap $20k (DexScreener, not verified)', cap_usd: 20000, cap_source: 'dex',
    qui: [{ nom: 'Sniper 1', adresse: '0x7632bd8e72767ed67a724c564c42ceea98e81180', detail: '2 min ago' }, { nom: 'Tracked wallet', adresse: '0x1ad70bc7ac98539dada8f97360d353687f6c29d6', detail: '4 min ago' }],
    plan: { entree: 'small fixed stake (~$100)', stop: '-30%', objectif: 'at 2x sell 70-80%, keep 20-30% with a wide trailing stop; nothing after 3-4 h: exit' } });
  const m = id === 1 ? mesure(1, { 5: { pct: 50, min: 5, source: 'curve' }, 15: { manque: true } }, { meilleur_pct: 100, pire_pct: -20, releves: 3 })
    : id === 2 ? mesure(2, { 5: { pct: -12.3, min: 5.4, source: 'dex' }, 15: { pct: 0, min: 15, source: 'dex' }, 30: { pct: 1234.5, min: 31, source: 'dex' }, 60: { pct: -99.9, min: 61, source: 'dex' }, 120: { pct: -100, min: 121, source: 'dex' } }, { fini: true, releves: 30, meilleur_pct: 1500, pire_pct: -100 })
      : id === 3 ? mesure(3, {}, { ref: null, releves: 0, fini: true })
        /* les cartes en vue portent les paliers que leur age permet (id = 7 min par rang) : une
           alerte de 42 min sans aucun resultat serait une page fausse, et la capture le montrerait */
        : MESURES_VUE[id] ? mesure(id, MESURES_VUE[id][0], MESURES_VUE[id][1]) : mesure(id, {});
  LISTE.push(alerte(id, (11 - id) * 7, f, m));
}
const BILAN = (avec) => ({
  tout: { libelle: 'All', n: 61, mesurees: 58, n30: 52, assez: true, seuil: 40, part_montee30: 38.5, mediane30: -4.2, meilleur_pct: 1500 },
  dev: { n: 14, mesurees: 13, n30: 12, assez: false, seuil: 40, part_montee30: null, mediane30: null, meilleur_pct: null },
  pons: { n: 44, mesurees: 42, n30: 40, assez: true, seuil: 40, part_montee30: 35, mediane30: -10, meilleur_pct: 420 },
  ignition: { n: 0, mesurees: 0, n30: 0, assez: false, seuil: 40 }, copie: { n: 2, mesurees: 2, n30: avec ? 2 : 1, assez: false, seuil: 40 },
  rebond: { n: 0, mesurees: 0, n30: 0, assez: false, seuil: 40 }, analyste: { n: 1, mesurees: 1, n30: 0, assez: false, seuil: 40 }, smart: { n: 0, n30: 0, assez: false, seuil: 40 },
  rouge: { n: 5, mesurees: 5, n30: 5, assez: false, seuil: 40 },
});
const LIVE0 = { actif: true, t: T0, dernier_id: 10, alertes: LISTE.slice().reverse(), vivantes: [], bilan: BILAN(false), paliers: [5, 15, 30, 60, 120], palier_bilan: 30, seuil: 40, tg: { lien: 'https://t.me/swoge_alerts' }, compteurs: { publiees: 10 } };
/* 30 s plus tard : une nouvelle alerte, et la mesure de la 1re avance (+30 rempli) */
const F11 = fiche(11, { categorie: 'ignition', titre: 'IGNITION launch on their factory', symbole: 'IGN' });
const LIVE1 = { actif: true, t: T0 + 30, dernier_id: 11, alertes: [alerte(11, 0, F11, mesure(11, {}))],
  vivantes: [mesure(1, { 5: { pct: 50, min: 5, source: 'curve' }, 15: { manque: true }, 30: { pct: 60, min: 30.2, source: 'curve' } }, { meilleur_pct: 100, pire_pct: -20, releves: 9 })],
  bilan: BILAN(true), paliers: [5, 15, 30, 60, 120], palier_bilan: 30, seuil: 40, tg: { lien: 'https://t.me/swoge_alerts' } };
const OFF = { actif: false, raison: 'public alerts off', alertes: [], vivantes: [], bilan: null };
const VUE = { actif: true, pret: true, mode: 'envoi', t: T0, maintenant: T0,
  regles: { acheteurs: 50, mise_min_eth: 0.01, tot_min: 60, smart_jetons: 3, projets_assez: 10, z_verdict: 2, groupe_min: 3, groupe_ecart_pct: 2, bloc_charge: 5, relais_pct: 99, relais_blocs: 6000, seuil_usd: 1e6,
    base_assez: 20, robots_min: 3, lanceur_auto: 8, actifs_min: 50, pic_candidat_usd: 100000, passe_min: 30, veille_min: 5, histo_liq_min_usd: 10000 },
  passe: { fin: T0 - 60, statut: 'ok', appels: 1, octets: 1, gt: 1, ds: 1, detail: {} }, veille: { fin: T0 - 29, statut: 'ok', detail: {} }, passe_ok: { fin: T0 - 60 }, veille_ok: { fin: T0 - 29 },
  compteurs: { retenus: 0, lus: 0, wallets: 0, smart: 0, inities: 0, creations24h: 0 }, wallets: [], createurs: [], jetons: [], nouveaux: [], groupes: [], liens: [], historique: {} };

(async () => {
  if (!chromium) { ok(false, 'playwright absent : poser NODE_PATH vers ~/.swoge-pw/node_modules'); return fin(); }
  const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };
  const demandes = [];
  const srv = http.createServer((q, r) => {
    const [u, qs] = q.url.split('?');
    const j = (x, st) => { r.writeHead(st || 200, { 'content-type': 'application/json' }); r.end(JSON.stringify(x)); };
    if (/\/ai\/smart$/.test(u)) return j(VUE);
    if (/\/ai\/smart\/alertes$/.test(u)) {
      const depuis = new URLSearchParams(qs || '').get('depuis');
      demandes.push(u + '?depuis=' + depuis);
      if (u.startsWith('/off/')) return j(OFF);
      if (u.startsWith('/panne/')) { r.writeHead(503); return r.end(); }
      if (u.startsWith('/douteux/')) return j(Object.assign({}, LIVE0, { tg: { lien: 'javascript:alert(1)' } }));
      return j(depuis === '0' ? LIVE0 : depuis === '10' ? LIVE1 : Object.assign({}, LIVE1, { alertes: [], vivantes: [] }));
    }
    if (/\/vitrine\.json$/.test(u)) return j({});
    const f = path.join(SITE, decodeURIComponent(u));
    if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  const erreurs = [];
  const ouvre = async (q, w, horloge) => {
    const ctx = await nav.newContext({ viewport: { width: w || 1280, height: 900 } });
    const p = await ctx.newPage();
    if (horloge) await p.clock.install({ time: T0 * 1000 });
    await p.route('**/*', (r) => (r.request().url().startsWith(base) ? r.continue() : r.fulfill({ status: 200, body: '', contentType: 'text/plain' })));
    p.on('pageerror', (e) => erreurs.push('pageerror ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket/.test(m.text()) && !(q === 'panne' && /status of 503/.test(m.text()))) erreurs.push(w + ' ' + q + ' : ' + m.text()); });
    await p.goto(base + 'swoge_smart_money.html?server=' + encodeURIComponent(base + q), { waitUntil: 'domcontentloaded' });
    return { p, ctx };
  };
  const lit = (p) => p.evaluate(() => {
    const carte = (li) => ({ id: Number(li.getAttribute('data-id')), cls: li.className, titre: (li.querySelector('.sm-al-titre b') || {}).textContent, sym: (li.querySelector('.sm-al-sym') || {}).textContent,
      meta: (li.querySelector('.sm-al-meta') || {}).textContent, adr: (li.querySelector('.sm-al-adr') || {}).textContent, faits: (li.querySelector('.sm-al-faits') || {}).textContent,
      res: [...li.querySelectorAll('.sm-res > div')].map((d) => ({ cls: d.className, t: d.querySelector('b').textContent, l: d.querySelector('small').textContent })), pied: (li.querySelector('.sm-res-pied') || {}).textContent,
      liens: [...li.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')) });
    return {
      statut: document.querySelector('#statut').textContent, live: document.querySelector('#liveStatut').textContent, avis: document.querySelector('.sm-avis').textContent,
      flux: [...document.querySelectorAll('#liveFlux > li')].map(carte), anciennes: [...document.querySelectorAll('#liveFlux2 > li')].map(carte),
      anciennesVu: !document.querySelector('#liveAnciennes').hidden, anciennesTxt: document.querySelector('#liveAnciennesTxt').textContent,
      bilan: [...document.querySelectorAll('#liveBilan .sm-cat')].map((t) => ({ cls: t.className, txt: [...t.children].map((c) => c.textContent) })), bilanNote: document.querySelector('#bilanNote').textContent,
      tg: [...document.querySelectorAll('#liveTg a')].map((a) => ({ href: a.getAttribute('href'), t: a.textContent, target: a.target })),
      liens: [...document.querySelectorAll('#live a[href]')].map((a) => a.getAttribute('href')),
      boutons: document.querySelectorAll('#live button, #live form, #live input').length, pirate: window.pirate, imgs: document.querySelectorAll('#live img').length,
      texte: document.querySelector('#live').innerText, eteint: document.querySelector('#live').classList.contains('eteint'),
    };
  });

  console.log('-- 1. le flux, ses resultats, le bilan --');
  let { p, ctx } = await ouvre('api', 1280, true);
  await p.waitForFunction(() => document.querySelectorAll('#liveFlux > li').length === 6);
  let r = await lit(p);
  ok(r.flux.map((c) => c.id).join() === '10,9,8,7,6,5' && r.anciennes.map((c) => c.id).join() === '4,3,2,1', 'les 6 plus recentes en vue, la plus recente d\'abord ; les 2 autres repliees');
  ok(r.anciennesVu && r.anciennesTxt === 'Older alerts (4)', 'les anciennes : « Older alerts (4) » (details, jamais un bouton)');
  ok(r.avis === '⚠️ Not financial advice. Most alerts lose; a few big winners carry the result.', 'le bandeau : « Not financial advice. Most alerts lose; a few big winners carry the result. »');
  ok(/Alerts go to the owner and to the live feed below\. Nothing is ever bought\./.test(r.statut), 'le statut dit que les alertes vont aussi au flux public');
  ok(/^10 alerts shown · updated /.test(r.live), 'statut de la section : ' + r.live);
  await p.evaluate(() => { document.querySelector('#liveAnciennes').open = true; });
  r = await lit(p);
  const c1 = r.anciennes.find((c) => c.id === 1), c2 = r.anciennes.find((c) => c.id === 2), c3 = r.anciennes.find((c) => c.id === 3), c4 = r.anciennes.find((c) => c.id === 4);
  ok(c1.titre === 'Known dev launch (Known dev #1)' && c1.sym === '$JUDGEBOT' && /sm-al vert/.test(c1.cls) && /^Known dev · 70 min ago$/.test(c1.meta), 'carte : titre, symbole, verdict vert, categorie et age (' + c1.meta + ')');
  ok(c1.adr === '0xa922cdff00000000000000000000000000000001', 'carte : l\'adresse COMPLETE du jeton');
  ok(c1.liens.includes('https://dexscreener.com/robinhood/0xa922cdff00000000000000000000000000000001') && c1.liens.includes('https://robinhoodchain.blockscout.com/address/0xa922cdff00000000000000000000000000000001'), 'carte : liens DexScreener et explorateur');
  ok(/Age and state: 30 s old · curve 0\.023 \/ 4\.20 ETH \(1%\)/.test(c1.faits) && /Who: Known dev #1 \(dev buy 0\.028 ETH\)/.test(c1.faits) && !/null|undefined|0x58ea/.test(c1.faits), 'carte : age et courbe ; qui (nom court, adresse, achat du dev)');
  ok(/Main risk: Most launches fall/.test(c1.faits) && /DexScreener promo: no paid profile/.test(c1.faits) && /Plan: entry small fixed stake; stop 30% trailing stop; target sell 75% at 2x/.test(c1.faits), 'carte : risque, promo, plan');
  ok(c1.res.map((x) => x.l).join() === '+5 min,+15 min,+30 min,+60 min,+120 min', 'les cinq paliers : +5, +15, +30, +60, +120 min');
  ok(c1.res[0].t === '+50.0%' && /up/.test(c1.res[0].cls) && c1.res[1].t === 'missed' && /manque/.test(c1.res[1].cls) && c1.res.slice(2).every((x) => x.t === '…'), 'id 1 : +5 = +50.0 % (vert), +15 = « missed », le reste en attente');
  ok(/^Price at alert \$0\.00000123 \(Pons curve, read on chain\) · best \+100% · worst −20\.0% over 3 readings$/.test(c1.pied), 'le prix a l\'alerte, sa source, le meilleur et le pire RELEVES : ' + c1.pied);
  ok(c2.res.map((x) => x.t).join() === '−12.3%,0.0%,+1.2k%,−99.9%,−100%' && /down/.test(c2.res[0].cls) && /nul/.test(c2.res[1].cls), 'id 2 : chaque palier rempli, signe et couleur (' + c2.res.map((x) => x.t).join(' ') + ')');
  ok(/No price could be read at the alert: not measured\./.test(c3.pied), 'sans prix a l\'alerte : « not measured », jamais un zero');
  ok(/sm-al rouge/.test(c4.cls) && c4.titre === 'EXIT: the dev is selling', 'une alerte rouge est marquee rouge');
  const tuile = (k) => r.bilan.find((t) => t.txt[0] === k) || { txt: [], cls: '' };
  ok(tuile('Known dev').txt[1] === '—' && tuile('Known dev').txt[2] === 'not enough alerts yet (12 of 40)' && /attente/.test(tuile('Known dev').cls), 'bilan sous le seuil : « not enough alerts yet (12 of 40) », aucun chiffre');
  ok(tuile('Pons launch').txt[1] === '35% rose' && tuile('Pons launch').txt[2] === 'at +30 min · median −10.0% · best +420%' && tuile('Pons launch').txt[3] === '44 sent · 40 measured', 'bilan au seuil : part, mediane, meilleur, et sur combien');
  ok(tuile('All alerts').txt[1] === '38.5% rose' && /here, rising means the warning was wrong/.test(tuile('Red flags').txt[3]), 'la tuile de tout, et celle des alertes rouges (lue a l\'envers)');
  ok(r.bilan.length === 9 && ['IGNITION', 'Wallet copy', 'Bounce', 'Analyst', 'Smart wallets'].every((k) => tuile(k).txt[1] === '—'), 'neuf tuiles ; chaque categorie sous le seuil reste muette');
  ok(/No figure under 40 measured alerts/.test(r.bilanNote), 'la note dit le seuil');
  ok(r.tg.length === 1 && r.tg[0].href === 'https://t.me/swoge_alerts' && /Join the Telegram channel/.test(r.tg[0].t) && r.tg[0].target === '_blank', 'le lien « Join the Telegram channel » (servi par le serveur)');
  ok(r.pirate === undefined && r.imgs === 0 && r.flux.find((c) => c.id === 6).sym.includes('<img'), 'symbole piege : affiche en texte, rien n\'execute');
  ok(!r.flux.find((c) => c.id === 6).liens.some((h) => /javascript/.test(h)), 'une adresse invalide ne devient jamais un lien');
  ok(r.liens.every((h) => /^https:\/\/dexscreener\.com\/robinhood\/0x[0-9a-f]{40}$/.test(h) || /^https:\/\/robinhoodchain\.blockscout\.com\/address\/0x[0-9a-f]{40}$/.test(h) || h === 'https://t.me/swoge_alerts'), 'liens de la section : DexScreener, explorateur, le canal ; rien d\'autre');
  ok(r.boutons === 0, 'aucun bouton, aucun formulaire');
  const FR = /\b(le|les|des|une|est|pour|avec|sans|jetons?|aucun|achat|vente|derni[eè]re?|alerte)\b|[éèêàùç]/i;
  const fr = r.texte.split('\n').filter((l) => FR.test(l));
  ok(fr.length === 0, 'aucun texte francais' + (fr.length ? ' : ' + fr.slice(0, 3).join(' | ') : ''));
  /* 30 s plus tard : le rafraichissement */
  await p.evaluate(() => { for (const li of document.querySelectorAll('#live li.sm-al')) li.__vu = 1; });
  await p.clock.fastForward(31000);
  await p.waitForFunction(() => document.querySelector('#liveFlux > li') && document.querySelector('#liveFlux > li').getAttribute('data-id') === '11');
  await p.waitForFunction(() => { const li = document.querySelector('li.sm-al[data-id="1"]'); return li && li.querySelectorAll('.sm-res > div')[2].textContent.includes('+60'); });
  r = await lit(p);
  const memes = await p.evaluate(() => [...document.querySelectorAll('#live li.sm-al')].filter((li) => li.__vu === 1).map((li) => li.getAttribute('data-id')).sort((a, b) => a - b).join());
  ok(demandes.includes('/api/ai/smart/alertes?depuis=0') && demandes.includes('/api/ai/smart/alertes?depuis=10'), 'le rafraichissement demande seulement ce qui suit la derniere alerte (depuis=10)');
  ok(r.flux[0].id === 11 && r.flux[0].titre === 'IGNITION launch on their factory' && r.flux.length === 6 && r.anciennes.length === 5, 'la nouvelle alerte arrive en tete ; la plus vieille des 6 passe dans les repliees');
  const n1 = r.anciennes.find((c) => c.id === 1);
  ok(n1.res[2].t === '+60.0%' && /up/.test(n1.res[2].cls) && /over 9 readings/.test(n1.pied), 'id 1 : +30 min se REMPLIT (+60.0 %), les releves avancent');
  ok(memes === '1,2,3,4,5,6,7,8,9,10', 'les dix cartes deja la sont les MEMES elements : rien n\'est refait, rien ne clignote');
  ok(/2 sent · 2 measured/.test(r.bilan.find((t) => t.txt[0] === 'Wallet copy').txt[3]), 'le bilan se met a jour en place');
  await ctx.close();

  console.log('\n-- 2. eteint, injoignable, lien douteux --');
  ({ p, ctx } = await ouvre('off'));
  await p.waitForFunction(() => /Public alerts are off/.test(document.querySelector('#liveStatut').textContent));
  r = await lit(p);
  ok(r.flux.length === 0 && r.tg.length === 0 && r.eteint, 'eteint : aucune carte, aucun lien de canal, le pouls est gris');
  ok(/Alerts go to the owner only/.test(r.statut), 'eteint : le statut dit « owner only »');
  await ctx.close();
  ({ p, ctx } = await ouvre('panne'));
  await p.waitForFunction(() => /could not be read/.test(document.querySelector('#liveStatut').textContent));
  ok(true, 'injoignable : la section le dit');
  await ctx.close();
  ({ p, ctx } = await ouvre('douteux'));
  await p.waitForFunction(() => document.querySelectorAll('#liveFlux > li').length === 6);
  r = await lit(p);
  ok(r.tg.length === 0, 'un lien de canal qui n\'est pas https://t.me/… : cache');
  await ctx.close();

  console.log('\n-- 3. largeurs : 320, 390, 1280 px --');
  const captures = process.env.CAPTURES || null;
  for (const w of [320, 390, 1280]) {
    ({ p, ctx } = await ouvre('api', w));
    await p.waitForFunction(() => document.querySelectorAll('#liveFlux > li').length === 6);
    const g = await p.evaluate(() => {
      const l = document.querySelector('#live').getBoundingClientRect();
      const dedans = [...document.querySelectorAll('#live *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > l.right + 1 || b.left < l.left - 1); }).map((e) => e.className || e.tagName).slice(0, 5);
      return { large: document.documentElement.scrollWidth, dedans, cases: [...document.querySelectorAll('#live .sm-res b')].filter((b) => b.scrollWidth > b.clientWidth + 1).length };
    });
    ok(g.large <= w, `${w} px : aucun defilement horizontal (${g.large} px)`);
    ok(g.dedans.length === 0, `${w} px : tout tient dans la carte` + (g.dedans.length ? ' : ' + g.dedans.join(', ') : ''));
    ok(g.cases === 0, `${w} px : chaque resultat se lit en entier dans sa case`);
    if (captures && (w === 1280 || w === 390)) {
      /* la barre du haut est collante : en capture d'element elle recouvrirait le haut de la section */
      await p.addStyleTag({ content: '.sw-haut{ position:static !important; }' });
      await p.evaluate(() => { document.querySelector('#live').scrollIntoView(); });
      await p.locator('#live').screenshot({ path: path.join(captures, 'live_alerts_' + w + '.png') });
    }
    await ctx.close();
  }

  console.log('\n-- 4. console --');
  ok(erreurs.length === 0, 'aucune erreur console ni erreur de page' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''));
  await nav.close(); srv.close();
  fin();
})().catch((e) => { console.error('  RATE ' + (e.stack || e)); process.exit(1); });
function fin() { console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe')); process.exit(rates ? 1 : 0); }
