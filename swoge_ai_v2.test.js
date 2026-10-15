'use strict';
/* ============================================================================
 * SWOGE AI, PAGE v2 (14/10/2026) — LA MAQUETTE FUTURISTE, BRANCHEE SUR LE VRAI
 *
 * Le proprietaire a valide la maquette v2 ; la page est reecrite dessus. Ce que
 * cet essai tient, sur une VRAIE reponse de /ai/colonie (lue en GET le 14/10 a
 * 01:34 UTC, `ai_colonie_reelle.json`, allegee : carnet a 120 lignes sans
 * traits, 40 signaux, 30 trouvailles Telegram), servie par une route moquee :
 *
 *   1. a 320, 390 et 1440 px, aucun des six onglets ne fait defiler la page de
 *      cote ; aucune erreur de page, aucune erreur console, aucun 404 local ;
 *   2. en anglais, aucun texte francais visible — les libelles que le serveur
 *      ecrit encore en francais (« en vigueur », « ne de <10 min »...) sont
 *      traduits ; en francais, la page bascule entiere et revient ;
 *   3. les seuils : rien n'est conclu sous NET_ASSEZ, REEL_ASSEZ, BANCS_ASSEZ,
 *      40 jetons d'audit, 20 trades — la case dit ce qu'il faut ;
 *   4. mouvement reduit : la scene ne tourne pas, le bandeau ne defile pas,
 *      les cartes sont la d'emblee ;
 *   5. le miroir est intact : ses boites existent et `swogemiroir.js` les remplit ;
 *   6. une seule colonie : plus de selecteur ni de lien vers Polymarket AI (retiree le 14/10) ;
 *   7. « Live » se lit sur t − dernierTour (l'horloge du SERVEUR) ; la page
 *      redemande /ai/colonie toutes les 20 s et repeint.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http');
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
const SITE = __dirname, PAGE = 'swoge_ai.html';
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const REELLE = JSON.parse(fs.readFileSync(path.join(SITE, 'ai_colonie_reelle.json'), 'utf8'));
/* La vue reelle, recalee sur l'heure de l'essai : son tour a l'age qu'il avait. */
function vue(modif) {
  const j = JSON.parse(JSON.stringify(REELLE)), dt = Date.now() - j.t;
  j.t += dt; j.maj += dt; j.dernierTour += dt;
  if (modif) modif(j);
  return j;
}
const ONGLETS = ['ov', 'tr', 'mi', 'le', 'ma', 'so'];
/* Des mots qui ne s'ecrivent qu'en francais, et ses lettres accentuees. Les
   symboles de jetons ($XYZ) et les adresses sont retires avant : ce sont des
   noms propres, pas du texte de la page. */
const FRANCAIS = /[éèêàùçôîœ]|\b(?:les|des|une|est|pas|sur|avec|dans|pour|jetons?|achet[ée]s?|retenu|vigueur|paliers|laisser|courir|trouv[ée]|acheteurs|vendeurs|devant|foule|plancher|piscine|capitalisation|d[ée]j[aà]|surveill[ée]s?|ferm[ée]s?|aucune?|propos[ée]|apprise?|seuil|mise|tenue)\b/i;

(async () => {
  if (!chromium) { console.log('playwright absent — essai ignore'); return; }
  const srv = http.createServer((q, r) => { const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port, BASE = 'http://127.0.0.1:' + port + '/';
  const nav = await chromium.launch();
  const ouvre = async (o) => {
    o = o || {};
    const ctx = await nav.newContext({ viewport: { width: o.w || 1440, height: o.h || 900 }, reducedMotion: o.rm ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage(), err = [], appels = { n: 0 };
    page.on('pageerror', (e) => err.push('pageerror ' + String(e).slice(0, 200)));
    /* Les ressources externes sont coupees (polices, CDN, vitrine) : leur echec
       n'est pas une faute de la page. Un 404 LOCAL, lui, en est une. */
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) err.push('console ' + m.text().slice(0, 200)); });
    page.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) err.push('http ' + r.status() + ' ' + r.url().slice(BASE.length)); });
    await page.route((u) => !u.href.startsWith(BASE) && !/\/ai\/colonie/.test(u.href), (r) => r.abort());
    await page.route(/\/ai\/colonie/, (r) => { appels.n++; r.fulfill({ contentType: 'application/json', body: JSON.stringify(o.vue ? o.vue(appels.n) : vue()) }); });
    await page.goto(BASE + PAGE, { waitUntil: 'load' });
    await page.waitForTimeout(o.attente || 1500);
    /* Le chiffre du tresor defile 1,5 s a sa premiere apparition : on lit celui qu'il pose. */
    await page.waitForFunction(() => { const b = document.getElementById('aiBal'); return !b || !b._compte; }, null, { timeout: 5000 }).catch(() => {});
    return { ctx, page, err, appels };
  };
  const visible = (page) => page.evaluate(() => document.body.innerText.replace(/\$\S+/g, ' ').replace(/0x[0-9a-fA-F]{6,}/g, ' '));

  console.log('-- 1. trois largeurs, six onglets, aucun defilement de cote, aucune erreur --');
  for (const w of [320, 390, 1440]) {
    const { ctx, page, err } = await ouvre({ w, h: w > 800 ? 900 : 844 });
    const larges = [];
    for (const t of ONGLETS) {
      await page.click('#tabs button[data-tab="' + t + '"]');
      await page.waitForTimeout(250);
      const sw = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
      if (sw > w + 1) larges.push(t + ':' + sw);
    }
    ok(larges.length === 0, w + ' px : aucun onglet ne deborde sur le cote' + (larges.length ? ' [' + larges.join(', ') + ']' : ''));
    ok(err.length === 0, w + ' px : aucune erreur de page, de console ni de 404 local' + (err.length ? ' — ' + err.slice(0, 3).join(' | ') : ''));
    ok(await page.evaluate(() => /^\$3,632\.45$/.test(document.getElementById('aiBal').textContent) || document.getElementById('aiBal')._compte),
       w + ' px : la tresorerie est celle de la vue reelle');
    await ctx.close();
  }

  console.log('\n-- 1 bis. une seule colonie (14/10 au soir : Polymarket AI retiree) --');
  {
    const src = fs.readFileSync(path.join(SITE, PAGE), 'utf8');
    ok(!/class="ia-onglets"/.test(src) && !/href="swoge_polymarket_ai\.html"/.test(src), 'ni selecteur de colonies, ni barre d onglets IA, ni lien vers Polymarket AI : il ne reste que Robinhood');
  }

  console.log('\n-- 2. en anglais, aucun texte francais visible ; en francais, tout bascule --');
  {
    const { ctx, page, err } = await ouvre({ attente: 2500 });
    const fautes = [];
    for (const t of ONGLETS) {
      await page.click('#tabs button[data-tab="' + t + '"]'); await page.waitForTimeout(200);
      await page.evaluate(() => { const b = document.getElementById('auditMore'); if (b && !b.hidden && /all/i.test(b.textContent)) b.click();
        const g = document.getElementById('tgMore'); if (g && /Show/.test(g.textContent)) g.click(); });
      const tx = await visible(page);
      for (const l of tx.split('\n')) { const m = l.match(FRANCAIS); if (m) fautes.push(t + ' « ' + m[0] + ' » dans « ' + l.trim().slice(0, 90) + ' »'); }
    }
    ok(fautes.length === 0, 'aucun texte francais visible dans les six onglets' + (fautes.length ? ' :\n       ' + fautes.slice(0, 12).join('\n       ') : ''));
    /* Les libelles que le serveur ecrit en francais sont bien traduits, pas caches. */
    await page.click('#tabs button[data-tab="le"]'); await page.waitForTimeout(200);
    const le = await page.textContent('section[data-p="le"]');
    ok(/Current rules/.test(le) && /born <10 min ago/.test(le) && /What we buy \(reference\)/.test(le), 'les libelles du serveur sont traduits : « Current rules », « born <10 min ago », la reference de l audit');
    await page.click('#langue'); await page.waitForTimeout(400);
    const fr = await page.evaluate(() => ({ lang: document.documentElement.lang, t: document.body.innerText }));
    ok(fr.lang === 'fr' && /Trésorerie papier/i.test(fr.t) && /en vigueur/.test(fr.t) && /Ce que deviennent les refusés/.test(fr.t), 'le bouton bascule toute la page en francais, libelles du serveur compris');
    ok(!/undefined|NaN/.test(fr.t), 'et aucune phrase manquante ne s ecrit « undefined » ou « NaN »');
    await page.click('#langue'); await page.waitForTimeout(400);
    ok(!FRANCAIS.test((await visible(page)).split('\n').find((l) => FRANCAIS.test(l)) || ''), 'et revient en anglais, entierement');
    ok(err.length === 0, 'aucune erreur' + (err.length ? ' — ' + err[0] : ''));
    await ctx.close();
  }

  console.log('\n-- 3. rien n est conclu sous les seuils --');
  {
    /* La vue reelle, au-dessus des seuils : les chiffres sont la. */
    const a = await ouvre();
    const t0 = (await a.page.textContent('#truth')).replace(/\s+/g, ' ');
    ok(/After costs\s*−2\.2%/.test(t0) && /Real mirror\s*−6\.8%/.test(t0) && /Paper overstates\s*7\.3 pts/.test(t0), 'au-dessus des seuils, le trio du heros donne ses trois chiffres avec leur n : « ' + t0.slice(0, 120) + ' »');
    await a.ctx.close();
    /* La meme, ramenee sous chaque seuil. */
    const b = await ouvre({ vue: () => vue((j) => {
      j.carnetNet.n = 30; j.reel.bilan.tout.n = 3; j.reel.nEcart = 2; j.trades = 12; j.gains = 9;
      j.bancs.forEach((x) => { if (x.retenus) x.retenus.n = 40; });
      j.audit.forEach((x) => { if (x.cle !== 'achete ou retenu') { x.n = 25; } });
    }) });
    const s = await b.page.evaluate(() => ({ truth: document.getElementById('truth').textContent.replace(/\s+/g, ' '), kpis: document.getElementById('kpis').textContent.replace(/\s+/g, ' ') }));
    ok(/After costs\s*—\s*needs 50 positions with a quote \(30 so far\)/.test(s.truth), 'apres frais, sous 50 positions : un tiret, et ce qu il faut');
    ok(/Real mirror\s*—\s*needs 5 real closes \(3 so far\)/.test(s.truth), 'miroir reel, sous REEL_ASSEZ fermetures : un tiret');
    ok(/Paper overstates\s*—\s*needs 5 paired closes \(2 so far\)/.test(s.truth), 'ecart papier/portefeuille, sous REEL_ASSEZ appariees : un tiret');
    ok(/Paper win rate\s*—\s*needs 20 closed trades \(12 so far\)/.test(s.kpis), 'taux de gain, sous 20 trades : un tiret');
    ok(/too few to judge/i.test(s.kpis) && !/no clear result/i.test(s.kpis), 'le verdict net dit « trop peu pour juger », pas un verdict');
    await b.page.click('#tabs button[data-tab="le"]'); await b.page.waitForTimeout(200);
    const l = await b.page.evaluate(() => ({ gagne: document.querySelectorAll('#bancs tr[data-gagne]').length, bancs: document.getElementById('bancsF').textContent,
      verdicts: [...document.querySelectorAll('#audit tr[data-verdict]')].map((r) => r.dataset.verdict), audit: document.getElementById('audit').textContent }));
    ok(l.gagne === 0 && /\(40\/100\) — a difference on a handful of tokens is luck, not a result/.test(l.bancs), 'jeux de regles, sous 100 achetes : aucun gagnant marque, et la carte dit pourquoi');
    ok(l.verdicts.filter((v) => v !== 'vRef').every((v) => v === 'peu') && !/costs more than it protects/.test(l.audit), 'audit, sous 40 jetons par regle : aucune regle jugee, aucune phrase de cout');
    ok(b.err.length === 0, 'aucune erreur' + (b.err.length ? ' — ' + b.err[0] : ''));
    await b.ctx.close();
  }

  console.log('\n-- 4. mouvement reduit : rien ne tourne, rien ne manque --');
  {
    const v = await ouvre({ attente: 1500 });
    /* la scene s'arrete hors de l'ecran (voulu) ; depuis que les positions du
       cerveau v8 sont une grille SOUS lui, #sky commence sous la ligne de
       flottaison a 1440 x 900 : on l'amene a l'ecran avant de la regarder */
    await v.page.evaluate(() => document.getElementById('sky').scrollIntoView({ block: 'center' })); await v.page.waitForTimeout(300);
    const vivant = await v.page.evaluate(async () => { const c = document.getElementById('sky'), a = c.toDataURL(); await new Promise((r) => setTimeout(r, 700)); return { tourne: Scene.tourne(), change: c.toDataURL() !== a }; });
    ok(vivant.tourne && vivant.change, 'sans preference, la scene tourne (temoin : elle change en 0,7 s)');
    await v.ctx.close();
    const { ctx, page, err } = await ouvre({ rm: true, attente: 1500 });
    const m = await page.evaluate(async () => {
      const c = document.getElementById('sky'), a = c.toDataURL();
      await new Promise((r) => setTimeout(r, 900));
      const cartes = [...document.querySelectorAll('main .card')].filter((x) => !x.closest('[hidden]'));
      return { tourne: Scene.tourne(), fixe: c.toDataURL() === a, vide: a.length < 3000,
               bande: getComputedStyle(document.querySelector('.tape .run')).animationName,
               sol: getComputedStyle(document.querySelector('.colhero .floor i')).animationName,
               opaques: cartes.every((x) => getComputedStyle(x).opacity === '1'), bal: document.getElementById('aiBal').textContent };
    });
    ok(!m.tourne && m.fixe && !m.vide, 'mouvement reduit : la scene est dessinee une fois, et ne bouge plus');
    ok(m.bande === 'none' && m.sol === 'none', 'le bandeau et le sol ne defilent pas (' + m.bande + ', ' + m.sol + ')');
    ok(m.opaques && m.bal === '$3,632.45', 'et rien ne disparait : les cartes sont la d emblee, le chiffre ne defile pas');
    ok(err.length === 0, 'aucune erreur' + (err.length ? ' — ' + err[0] : ''));
    await ctx.close();
  }

  console.log('\n-- 5. le miroir est intact --');
  {
    const { ctx, page, err } = await ouvre({ attente: 2500 });
    const m = await page.evaluate(() => ({
      boites: ['gxMiroir', 'gxMiroirPositions', 'mirPosN', 'tmMiroirBilan'].filter((id) => !!document.getElementById(id)),
      charge: window.__swogeMiroir === true, rempli: (document.getElementById('gxMiroir').textContent || '').length > 40,
      dans: !!document.getElementById('cMi').contains(document.getElementById('gxMiroir')),
      positions: typeof window.peintPositions === 'function', cap: typeof window.__swogeCap === 'function',
      cle: !!document.querySelector('#gxMiroir textarea') }));
    ok(m.boites.length === 4, 'les quatre boites que remplit swogemiroir.js existent (' + m.boites.join(', ') + ')');
    ok(m.charge && m.rempli && m.dans, 'le script du miroir est charge et a rempli « Your mirror »');
    ok(m.positions && m.cap, 'la page lui expose ce qu il lit : peintPositions et la capitalisation de la colonie');
    ok(!m.cle, 'et aucune cle privee n est a l ecran sans geste');
    const stock = await page.evaluate(() => Object.keys(localStorage).filter((k) => /cle|key|priv/i.test(k) || /0x[0-9a-f]{64}/i.test(localStorage.getItem(k) || '')));
    ok(stock.length === 0, 'et rien qui ressemble a une cle dans le stockage local');
    ok(err.length === 0, 'aucune erreur' + (err.length ? ' — ' + err[0] : ''));
    await ctx.close();
  }

  console.log('\n-- 6. « Live » sur l horloge du serveur, et la page se rafraichit seule --');
  {
    /* Le serveur a deux heures de retard sur la montre du visiteur : son dernier
       tour a 30 s sur SON horloge. La page dit « Live », pas « Stale ». */
    const decale = () => vue((j) => { j.t -= 7200000; j.dernierTour = j.t - 30000; j.maj = j.dernierTour; });
    let o = await ouvre({ vue: decale });
    ok(/^LIVE · last turn 3\d s ago/.test(await o.page.textContent('#poulsTx')), 'un serveur dont la montre retarde : « Live » se lit sur t − dernierTour (' + await o.page.textContent('#poulsTx') + ')');
    await o.ctx.close();
    o = await ouvre({ vue: () => vue((j) => { j.dernierTour = j.t - 20 * 60000; j.maj = j.dernierTour; }) });
    ok(/^STALE/.test(await o.page.textContent('#poulsTx')), 'vingt minutes sans tour : « Stale »');
    await o.ctx.close();
    const { ctx, page, err, appels } = await ouvre({ vue: (k) => vue((j) => { if (k > 1) j.tresor = 3700.5; }) });
    const avant = await page.textContent('#aiBal');
    await page.waitForTimeout(21500);
    const apres = await page.textContent('#aiBal');
    ok(appels.n >= 2 && avant === '$3,632.45' && apres === '$3,700.50', 'au bout de 20 s la page redemande /ai/colonie et repeint (' + appels.n + ' lectures : ' + avant + ' → ' + apres + ')');
    ok(err.length === 0, 'aucune erreur' + (err.length ? ' — ' + err[0] : ''));
    await ctx.close();
  }

  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exitCode = rates ? 1 : 0;
})().catch((e) => { console.log('EXCEPTION : ' + (e && e.stack || e)); process.exitCode = 1; });
