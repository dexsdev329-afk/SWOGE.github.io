'use strict';
/* ============================================================================
 * POLYMARKET EDGE CHECK — la page dit ce que l'historique public PROUVE, et rien de plus
 *   1. les deux pieges mesures le 29/09 : l'ordre par defaut (plus gros gains d'abord)
 *      jamais utilise, et les pertes non encaissees (restees en positions ouvertes)
 *      reintegrees sur la meme periode — sinon BreakTheBank passait de 42 % a 87,5 % ;
 *   2. aucun verdict sous 100 positions resolues ; un teneur de marche n'est pas juge
 *      au score ; un vrai edge est reconnu ;
 *   3. pseudo → portefeuille, classement → verification, marches de 15 min ;
 *   4. tout ce qui vient de Polymarket est du texte ; rien ne deborde a 360 px.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const MAINTENANT = Math.floor(Date.now() / 1000);
const W = { piege: '0x' + '1'.repeat(40), edge: '0x' + '2'.repeat(40), peu: '0x' + '3'.repeat(40), mm: '0x' + '4'.repeat(40), tronque: '0x' + '5'.repeat(40) };
const jourIso = (s) => new Date(s * 1000).toISOString().slice(0, 10);
/* Une position close : gagnee (curPrice 1) ou perdue (0), achetee a p. */
const close = (i, gagne, p, t, extra) => Object.assign({ asset: 'a' + i, conditionId: 'c' + i, outcomeIndex: 0, avgPrice: p, totalBought: 100, realizedPnl: gagne ? 100 * (1 - p) : -100 * p,
  curPrice: gagne ? 1 : 0, title: 'Market ' + i, timestamp: t, endDate: jourIso(t) }, extra || {});
const ouverte = (i, p, fin) => ({ asset: 'o' + i, conditionId: 'oc' + i, outcomeIndex: 1, avgPrice: p, size: 100, initialValue: 100 * p, cashPnl: -100 * p, curPrice: 0, redeemable: true,
  title: 'Open ' + i, endDate: fin });
const DONNEES = {
  /* 120 gains clos a 0,50 + 120 pertes jamais encaissees : sans elles, 100 % ; avec, 50 % et aucun edge. */
  [W.piege]: { closes: Array.from({ length: 120 }, (_, i) => close(i, true, 0.5, MAINTENANT - i * 600)), ouvertes: Array.from({ length: 120 }, (_, i) => ouverte(i, 0.5, jourIso(MAINTENANT - i * 600))) },
  /* 150 gagnes sur 200 a 0,50 : z = 50 / √50 ≈ 7,1. */
  [W.edge]: { closes: Array.from({ length: 200 }, (_, i) => close(i, i < 150, 0.5, MAINTENANT - i * 600, i === 3 ? { title: 'Bitcoin Up or Down <img src=x onerror=window.pirate=1>' } : null)), ouvertes: [] },
  [W.peu]: { closes: Array.from({ length: 27 }, (_, i) => close(i, i < 18, 0.5, MAINTENANT - i * 600)), ouvertes: [] },
  /* Les deux issues de chaque marche : de la tenue de marche. */
  [W.mm]: { closes: Array.from({ length: 240 }, (_, i) => close(i, i % 2 === 0, 0.5, MAINTENANT - i * 60, { conditionId: 'm' + Math.floor(i / 2), outcomeIndex: i % 2, title: 'Bitcoin Up or Down - 15m' })), ouvertes: [] },
  /* Echantillon tronque a 200 : 100 pertes dans la periode comptent, 100 plus anciennes non. */
  [W.tronque]: { closes: Array.from({ length: 260 }, (_, i) => close(i, true, 0.5, MAINTENANT - i * 60)),
    ouvertes: Array.from({ length: 100 }, (_, i) => ouverte(i, 0.5, new Date((MAINTENANT + 3600) * 1000).toISOString()))
      .concat(Array.from({ length: 100 }, (_, i) => ouverte(1000 + i, 0.5, '2025-01-01'))) },
};
const vu = { closes: [], ouvertes: [] };

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => { const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port, nav = await chromium.launch();
  const rend = (r, o) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  async function ouvre(larg, url) {
    const ctx = await nav.newContext({ viewport: { width: larg || 1100, height: 900 } }), page = await ctx.newPage();
    await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), (r) => {
      const u = new URL(r.request().url()), q = u.searchParams, w = q.get('user');
      if (u.pathname === '/closed-positions') { vu.closes.push(u.search); const d = DONNEES[w] || { closes: [] }; const off = Number(q.get('offset')), lim = Number(q.get('limit'));
        /* L'ordre par defaut du vrai service : plus gros gain d'abord — la page ne doit jamais en dependre. */
        const l = q.get('sortBy') === 'TIMESTAMP' ? d.closes.slice().sort((a, b) => b.timestamp - a.timestamp) : d.closes.slice().sort((a, b) => b.realizedPnl - a.realizedPnl);
        return rend(r, l.slice(off, off + lim)); }
      if (u.pathname === '/positions') { vu.ouvertes.push(u.search); const d = DONNEES[w] || { ouvertes: [] }; const off = Number(q.get('offset')), lim = Number(q.get('limit'));
        return rend(r, d.ouvertes.slice().sort((a, b) => Date.parse(b.endDate) - Date.parse(a.endDate)).slice(off, off + lim)); }
      if (u.pathname === '/traded') return rend(r, { user: w, traded: 999 });
      if (u.pathname === '/v1/leaderboard') return rend(r, [{ rank: '1', proxyWallet: W.edge, userName: 'Top<b>One</b>', pnl: 12345, vol: 99999 }, { rank: '2', proxyWallet: 'pas-une-adresse', userName: 'x', pnl: 1, vol: 1 }]);
      if (u.pathname === '/public-search') return rend(r, { profiles: [{ name: 'EdgeBotty', proxyWallet: W.piege }, { name: 'EdgeBot', proxyWallet: W.edge }] });
      if (u.pathname === '/events') { const s = q.get('slug') || ''; const m = s.match(/^(btc|eth|sol|xrp)-updown-15m-(\d+)$/);
        if (!m) return rend(r, []); vu.slug = s;
        return rend(r, [{ title: m[1] + ' window', markets: [{ outcomePrices: JSON.stringify(['0.265', '0.735']), endDate: new Date((Number(m[2]) + 900) * 1000).toISOString() }] }]); }
      return r.fulfill({ status: 404, body: '' });
    });
    await page.goto('http://127.0.0.1:' + port + (url || '/swoge_polymarket.html'), { waitUntil: 'domcontentloaded' });
    return { page, ctx };
  }
  async function verifie(page, qui, taille) {
    if (taille) await page.selectOption('#taille', String(taille));
    await page.fill('#qui', qui); await page.click('#verifier');
    await page.waitForFunction(() => !document.getElementById('resultat').hidden || /No |did not/.test(document.getElementById('statut').textContent));
    return { verdict: await page.textContent('#verdict'), tuiles: await page.textContent('#tuiles'), note: await page.textContent('#noteEchantillon') };
  }

  console.log('-- 1. les deux pieges du 29/09 --');
  {
    const { page, ctx } = await ouvre();
    const r = await verifie(page, W.piege);
    ok(vu.closes.length > 0 && vu.closes.every((s) => /sortBy=TIMESTAMP&sortDirection=DESC/.test(s)), 'les positions closes sont lues par date, jamais dans l ordre par defaut (plus gros gains d abord)');
    ok(vu.ouvertes.length > 0 && vu.ouvertes.every((s) => /sortBy=RESOLVING&sortDirection=DESC/.test(s) && /sizeThreshold=0/.test(s)), 'les positions ouvertes sont lues aussi : les parts perdantes y restent');
    ok(/Win rate50%/.test(r.tuiles) && /120 won \/ 120 lost/.test(r.tuiles) && /No evidence of an edge/.test(r.verdict),
       'BreakTheBank en petit : 120 gains clos + 120 pertes jamais encaissees = 50 % et aucun edge (sans elles : 100 %)');
    ok(/plus 120 resolved positions never redeemed/.test(r.note) && /would inflate the win rate/.test(r.note), 'la note dit ce qui a ete ajoute, et pourquoi');
    await ctx.close();
  }

  console.log('\n-- 2. les verdicts --');
  {
    const { page, ctx } = await ouvre();
    let r = await verifie(page, W.edge);
    ok(/Consistent evidence of an edge in this sample \(skill score 7\.1\)/.test(r.verdict) && /picked because they won/.test(r.verdict), '150 gagnes sur 200 a 50 ¢ : un edge, score 7,1 — avec le rappel du biais de selection');
    ok((await page.$('#resultat img')) === null && !(await page.evaluate(() => window.pirate)), 'un titre de marche est du texte, jamais du HTML');
    r = await verifie(page, W.peu);
    ok(/Not enough resolved positions to judge \(27\/100\)/.test(r.verdict), 'la capture virale : 18 sur 27 — aucun verdict sous 100 positions resolues');
    r = await verifie(page, W.mm);
    ok(/Mostly market making: holds both sides in 100% of markets/.test(r.verdict) && /skill score does not apply/.test(r.verdict), 'un teneur de marche n est pas juge au score : il est dit comme tel');
    r = await verifie(page, W.tronque, 200);
    ok(/the 200 most recent closed positions/.test(r.note) && /plus 100 resolved positions never redeemed/.test(r.note),
       'echantillon tronque : seules les pertes non encaissees de la meme periode comptent (100 sur 200)');
    const sorte = await page.$$eval('#parSorte tr', (l) => l.map((x) => x.textContent));
    ok(sorte.length >= 1, 'le detail par sorte de marche');
    const u = await page.evaluate(() => { const w = window.PolyEdge.wilson(18, 27); return [w.bas, w.haut, window.PolyEdge.wilson(0, 0)]; });
    ok(u[0] > 0.47 && u[0] < 0.5 && u[1] > 0.8 && u[1] < 0.83 && u[2] === null, 'Wilson : 18 sur 27 → environ 48 %–81 %, et rien sur 0 [' + u[0].toFixed(3) + ', ' + u[1].toFixed(3) + ']');
    await ctx.close();
  }

  console.log('\n-- 3. pseudo, classement, marches --');
  {
    const { page, ctx } = await ouvre(1100, '/swoge_polymarket.html?trader=EdgeBot');
    await page.waitForFunction(() => !document.getElementById('resultat').hidden);
    ok(/EdgeBot \(0x2222…2222\)/.test(await page.textContent('#profil')) && (await page.getAttribute('#profil a', 'href')) === 'https://polymarket.com/profile/' + W.edge,
       '?trader=EdgeBot : le pseudo EXACT est choisi (pas le premier resultat), et le lien va vers polymarket.com');
    ok(/EdgeBotty/.test(await page.textContent('#autres')), 'les autres profils trouves sont proposes');
    await page.waitForFunction(() => document.querySelectorAll('#classement tr').length === 1);
    ok((await page.$('#classement b')) === null && /Top<b>One<\/b>/.test(await page.textContent('#classement')), 'le classement : un pseudo est du texte ; une ligne sans adresse valide est ecartee');
    await page.fill('#qui', '');
    await page.click('#classement button');
    await page.waitForFunction((w) => document.getElementById('qui').value === w && !document.getElementById('resultat').hidden, W.edge);
    ok(/skill score 7\.1/.test(await page.textContent('#verdict')), '« Check » dans le classement lance la verification de ce trader');
    await page.waitForFunction(() => document.querySelectorAll('#marches .marche').length === 4);
    const m = await page.textContent('#marches');
    const debut = Math.floor(Date.now() / 1000 / 900) * 900;
    ok(/Up 26\.5¢/.test(m) && /Down 73\.5¢/.test(m) && /Closes in \d+ min/.test(m) && new RegExp('-updown-15m-' + debut + '$').test(vu.slug),
       'les marches de 15 min : la fenetre en cours (debut ' + debut + '), Up/Down en cents, le temps restant');
    await ctx.close();
  }

  console.log('\n-- 4. a 360 px --');
  {
    const { page, ctx } = await ouvre(360);
    await verifie(page, W.edge);
    await page.waitForFunction(() => document.querySelectorAll('#classement tr').length === 1);
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 360 px, rien ne deborde [' + larg + ']');
    await ctx.close();
  }

  await nav.close(); srv.close();
  console.log('\nVERIFICATIONS : ' + n + (rates ? ' — ' + rates + ' RATE(S)' : ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
