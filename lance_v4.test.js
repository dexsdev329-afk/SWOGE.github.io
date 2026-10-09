'use strict';
/* ============================================================================
 * LANCE_V4 — la carte de lancement d'un agent : le PORTEFEUILLE DU JOUEUR signe, la page
 * refuse toute offre qui ne vise pas l'un des deux launchpads relus, avec son frais exact.
 *   1. offres truquees refusees avant toute signature ;
 *   2. pool $SWOGE : solde verifie, autorisation du frais EXACT au launchpad, puis lancement ;
 *   3. pool ETH : le frais part en valeur, sans autorisation ;
 *   4. sel deja pris : un autre sel, UNE fois ; annulation dans le portefeuille dite en clair ;
 *   5. ce que dit l'offre est du texte ; les deux pages chargent le script et montrent la carte.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

/* Les launchpads redeployes le 30/09 ; ceux du 29/09 (owner() constant, « hidden owner » chez GoPlus) sont refuses. */
const SW = '0xF090C095ae6F1c75F382Ce1Feb07626460996549', ETHLP = '0xe3fB4f9790504D2F95D022d73993eb916f407759';
const ANCIEN_SW = '0x6532C42aF1241cbbC14F00D2B7D531Aa61469392', ANCIEN_ETH = '0xEfD0fd35c3d308713226E9366A96701B9F040c9e';
const JETON = '0x' + '1'.repeat(40), POOL = '0x' + '2'.repeat(40);
const offre = (o) => Object.assign({ id: 'a1', chainId: 4663, pool: 'swoge', launchpad: SW, name: 'Moon Dog', symbol: 'MDOG', salt: '0x' + 'ab'.repeat(32),
  website: 'https://moondog.xyz/', twitter: 'https://x.com/moondog', telegram: '', logo: '', feeWei: '10000000000000000000000', feeToken: 'SWOGE', fee: 10000,
  feeGoesTo: 'burned', swoge: '0x8a166Fb41Cd659a0a43396272FF73973Ce29F817', expire: Date.now() + 15 * 60e3 }, o || {});

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => { const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    if (q.url === '/vide.html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<!doctype html><html><head></head><body><div id="z"></div><script src="lance_v4.js"></script></body></html>'); }
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'application/javascript' : 'text/html' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const nav = await chromium.launch(), ctx = await nav.newContext(), page = await ctx.newPage();
  await page.route((u) => !u.href.startsWith('http://127.0.0.1:'), (r) => r.abort());
  await page.goto('http://127.0.0.1:' + srv.address().port + '/vide.html');
  await page.waitForFunction(() => !!window.SwogeLance);

  /* Un faux portefeuille, dans la page : il note chaque geste. */
  await page.evaluate(({ JETON, POOL }) => {
    window.faux = function (o) {
      o = o || {};
      const j = { gestes: [], simules: 0 };
      j.chaine = () => Promise.resolve({
        compte: '0x' + '9'.repeat(40),
        reseau: () => Promise.resolve(o.reseau || 4663),
        soldeEth: () => Promise.resolve(o.eth || '1000000000000000000'),
        /* le prix du gaz lu sur la chaine les 08 et 09/10 : ~0,021 gwei */
        prixGaz: () => (o.prix === 'casse' ? Promise.reject(new Error('rpc indisponible')) : Promise.resolve(o.prix || '21500000')),
        soldeSwoge: () => Promise.resolve(o.swoge || '50000000000000000000000'),
        autorisation: () => Promise.resolve(o.autorise || '0'),
        autorise: (s, m) => { j.gestes.push(['autorise', s, m]); return Promise.resolve({ status: 1 }); },
        simule: (a, pay, p, v) => { j.simules++; j.gestes.push(['simule', p.salt]); return o.selPris && j.simules === 1 ? Promise.reject(new Error('pool deja amorce')) : Promise.resolve(JETON); },
        envoie: (a, pay, p, v) => { j.gestes.push(['envoie', a, pay, p.salt, v, p.name, p.symbol]); return o.refuse ? Promise.reject({ code: 4001, message: 'User rejected the request.' }) : Promise.resolve({ hash: '0x' + 'c'.repeat(64) }); },
        attend: () => Promise.resolve({ status: 1, logs: [{}] }),
        lancementDe: () => ({ token: JETON, pool: POOL }),
      });
      return j;
    };
  }, { JETON, POOL });

  console.log('-- 1. les offres truquees sont refusees avant toute signature --');
  const refus = async (o, re, m) => { const r = await page.evaluate((o) => window.SwogeLance.verifie(o), o); ok(r && re.test(r), m + ' — « ' + r + ' »'); };
  await refus(offre({ launchpad: '0x' + '3'.repeat(40) }), /unknown contract/, 'un autre contrat que les deux launchpads relus');
  await refus(offre({ launchpad: ANCIEN_SW }), /unknown contract/, 'l ancien launchpad $SWOGE du 29/09 (jetons notes « hidden owner »)');
  await refus(offre({ pool: 'eth', launchpad: ANCIEN_ETH, feeWei: '100000000000000' }), /unknown contract/, 'l ancien launchpad WETH du 29/09');
  await refus(offre({ feeWei: '1' }), /unexpected fee/, 'un autre frais que 10 000 $SWOGE');
  await refus(offre({ pool: 'eth', launchpad: ETHLP, feeWei: '200000000000000' }), /unexpected fee/, 'un autre frais que 0,0001 ETH');
  await refus(offre({ pool: 'eth', feeWei: '100000000000000' }), /unknown contract/, 'le frais ETH envoye au launchpad $SWOGE');
  await refus(offre({ chainId: 1 }), /not for Robinhood Chain/, 'une autre chaine');
  await refus(offre({ expire: Date.now() - 1000 }), /expired/, 'une offre perimee');
  await refus(offre({ swoge: '0x' + '4'.repeat(40) }), /unknown \$SWOGE contract/, 'un faux $SWOGE a autoriser');
  const bad = await page.evaluate((o) => { const c = window.SwogeLance.carte(o); return { bouton: !!c.querySelector('button'), t: c.textContent }; }, offre({ launchpad: '0x' + '3'.repeat(40) }));
  ok(!bad.bouton && /refused/.test(bad.t), 'la carte d une offre truquee n a AUCUN bouton');

  console.log('\n-- 2. pool $SWOGE : solde, autorisation exacte, lancement --');
  let r = await page.evaluate((o) => { const f = window.faux({}); return window.SwogeLance.lance(o, { chaine: f.chaine }).then((x) => ({ x, g: f.gestes })); }, offre());
  const au = r.g.find((x) => x[0] === 'autorise'), en = r.g.find((x) => x[0] === 'envoie');
  ok(au && au[1] === SW && au[2] === '10000000000000000000000', 'l autorisation porte sur le launchpad $SWOGE et 10 000 $SWOGE exactement');
  ok(en && en[1] === SW && en[2] === false && en[4] === null && en[5] === 'Moon Dog' && en[6] === 'MDOG', 'createToken part sans valeur, avec le nom et le symbole de l offre');
  ok(r.g.findIndex((x) => x[0] === 'autorise') < r.g.findIndex((x) => x[0] === 'simule'), 'l autorisation avant la simulation, la simulation avant la signature');
  ok(r.x.token === JETON && r.x.pool === POOL && r.x.tx === '0x' + 'c'.repeat(64), 'le resultat : le jeton, son pool, la transaction');
  r = await page.evaluate((o) => { const f = window.faux({ autorise: '10000000000000000000000' }); return window.SwogeLance.lance(o, { chaine: f.chaine }).then(() => f.gestes); }, offre());
  ok(!r.some((x) => x[0] === 'autorise'), 'deja autorise : aucune seconde autorisation');
  const peu = await page.evaluate((o) => { const f = window.faux({ swoge: '5000000000000000000000' }); return window.SwogeLance.lance(o, { chaine: f.chaine }).then(() => 'lance !', (e) => e.message + '|' + f.gestes.length); }, offre());
  ok(/You need 10,000 \$SWOGE/.test(peu) && /you have 5,000/.test(peu) && /\|0$/.test(peu), 'pas assez de $SWOGE : on le dit, rien n est signe');
  const autre = await page.evaluate((o) => { const f = window.faux({ reseau: 1 }); return window.SwogeLance.lance(o, { chaine: f.chaine }).then(() => 'lance !', (e) => e.message + '|' + f.gestes.length); }, offre());
  ok(/Switch your wallet to Robinhood Chain/.test(autre) && /\|0$/.test(autre), 'portefeuille sur une autre chaine : rien n est signe');

  console.log('\n-- 3. pool ETH : le frais en valeur, sans autorisation --');
  r = await page.evaluate((o) => { const f = window.faux({}); return window.SwogeLance.lance(o, { chaine: f.chaine }).then(() => f.gestes); }, offre({ pool: 'eth', launchpad: ETHLP, feeWei: '100000000000000', feeToken: 'ETH', fee: 0.0001, swoge: null }));
  const e2 = r.find((x) => x[0] === 'envoie');
  ok(e2 && e2[1] === ETHLP && e2[2] === true && e2[4] === '100000000000000' && !r.some((x) => x[0] === 'autorise'), 'createToken payable, 0,0001 ETH exactement, aucune autorisation $SWOGE');
  /* ---- LE GAZ COMPTE (09/10/2026) ----
     Un lancement consomme ~5,85 M de gaz : au prix lu (0,0215 gwei), avec la marge x2 d'un
     portefeuille, 0,00026 ETH de gaz en plus du frais, 0,00036 ETH en tout. L'ancien controle
     acceptait 0,0001 ETH et un wei : le portefeuille refusait ensuite, sans explication. */
  const ETHO = offre({ pool: 'eth', launchpad: ETHLP, feeWei: '100000000000000', swoge: null });
  const essaie = (o, f) => page.evaluate(([o, f]) => { const x = window.faux(f); return window.SwogeLance.lance(o, { chaine: x.chaine }).then(() => 'lance !|' + x.gestes.length, (e) => e.message + '|' + x.gestes.length); }, [o, f]);
  const sec = await essaie(ETHO, { eth: '100000000000000' });
  ok(/about 0\.00036 ETH/.test(sec) && /0\.0001 ETH fee plus about 0\.00026 ETH of gas/.test(sec) && /you have 0\.00010 ETH/.test(sec) && /\|0$/.test(sec),
     'juste le frais, rien pour le gaz : le besoin chiffre (frais + gaz) est dit AVANT de signer, rien n est signe — ' + sec.split('|')[0]);
  const juste = await essaie(ETHO, { eth: '350000000000000' });
  ok(/about 0\.00036 ETH/.test(juste) && /\|0$/.test(juste), '0,00035 ETH : encore court, refuse sans rien signer');
  const assez = await essaie(ETHO, { eth: '400000000000000' });
  ok(/^lance !/.test(assez), '0,0004 ETH : le frais et le gaz passent, on lance');
  const casse = await essaie(ETHO, { eth: '400000000000000', prix: 'casse' });
  ok(/about 0\.00070 ETH/.test(casse) && /\|0$/.test(casse), 'prix du gaz illisible : on compte 0,05 gwei (plus que tout ce qui a ete lu), jamais zero');
  const swSansEth = await essaie(offre(), { eth: '0' });
  ok(/for gas/.test(swSansEth) && /\$SWOGE fee is paid in \$SWOGE, the gas in ETH/.test(swSansEth) && /\|0$/.test(swSansEth),
     'pool $SWOGE sans ETH : refuse AVANT l approbation (elle partait, puis le lancement echouait faute de gaz) — ' + swSansEth.split('|')[0]);
  const swAssez = await essaie(offre(), { eth: '300000000000000' });
  ok(/^lance !/.test(swAssez), 'pool $SWOGE avec 0,0003 ETH : le gaz de l approbation et du lancement passe, on lance');

  console.log('\n-- 4. sel pris, annulation --');
  r = await page.evaluate((o) => { const f = window.faux({ selPris: true }); return window.SwogeLance.lance(o, { chaine: f.chaine }).then(() => f.gestes); }, offre());
  const sims = r.filter((x) => x[0] === 'simule'), env = r.find((x) => x[0] === 'envoie');
  ok(sims.length === 2 && sims[0][1] !== sims[1][1] && env[3] === sims[1][1] && /^0x[0-9a-f]{64}$/.test(env[3]), 'le premier sel echoue a la simulation : un autre sel, et c est lui qui est signe');
  const t = await page.evaluate((o) => new Promise((res) => {
    const f = window.faux({ refuse: true }); const c = window.SwogeLance.carte(o, { chaine: f.chaine }); document.getElementById('z').appendChild(c);
    c.querySelector('button').click(); setTimeout(() => res({ s: c.querySelector('.lv4-s').textContent, d: c.querySelector('button').disabled }), 300);
  }), offre());
  ok(/You cancelled in your wallet - nothing was launched/.test(t.s) && t.d === false, 'annule dans le portefeuille : dit en clair, et le bouton revient');

  console.log('\n-- 5. la carte, les pages --');
  const c = await page.evaluate((o) => new Promise((res) => {
    document.getElementById('z').textContent = '';
    const f = window.faux({}); const c = window.SwogeLance.carte(o, { chaine: f.chaine }); document.getElementById('z').appendChild(c);
    c.querySelector('button').click(); setTimeout(() => res({ t: c.textContent, img: !!c.querySelector('img'), liens: [...c.querySelectorAll('a')].map((a) => a.href), b: c.querySelector('button').textContent }), 300);
  }), offre({ name: '<img src=x onerror=window.pirate=1>' }));
  ok(!c.img && !(await page.evaluate(() => window.pirate)) && /<img src=x/.test(c.t), 'le nom de l offre est du texte, jamais du HTML');
  ok(/10,000 \$SWOGE, burned/.test(c.t) && /50% of the trading fees/.test(c.t) && /never holds your keys/.test(c.t), 'la carte dit le frais, la part du createur, et que la cle reste au joueur');
  ok(c.b === 'Launched' && c.liens.includes('https://robinhoodchain.blockscout.com/token/' + JETON) && c.liens.includes('https://dexscreener.com/robinhood/' + POOL.toLowerCase()), 'lance : les liens vers le jeton et sa paire');
  for (const p of ['swogeagentic.html', 'swolemind.html']) {
    const h = fs.readFileSync(path.join(SITE, p), 'utf8');
    ok(/<script src="lance_v4\.js\?v=[0-9a-f]{8}"><\/script>/.test(h) && /if \(data\.lancement && window\.SwogeLance\) d\.appendChild\(window\.SwogeLance\.carte\(data\.lancement\)\);/.test(h) && /propose_token_launch/.test(h),
       p + ' charge le script et montre la carte que l agent a preparee');
  }

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
