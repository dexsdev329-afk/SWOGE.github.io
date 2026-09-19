/* ============================================================================
 * LES DEUX PAGES PERPETUELLES : ELLES MONTRENT, ELLES NE DECIDENT RIEN
 *
 * BTC et ETH sont deux colonies separees (`ai_perp.js`, un etat par symbole)
 * et deux pages, mais UN seul peintre : `perp.js`. C'est voulu — recopier
 * mille lignes deux fois garantit qu'un jour l'une aura une correction que
 * l'autre n'aura pas. Ce que cet essai mesure tient en quatre phrases :
 *
 *   - chaque page demande SON symbole, et rien d'autre ;
 *   - un chiffre n'est montre que si l'echantillon le porte — le taux de gain
 *     se tait sous vingt trades, un verdict d'audit sous `minObs` ;
 *   - le financement est visible A PART du mouvement du prix : c'est le cout
 *     qu'un perpetuel fait payer a qui tient, et le seul que le papier oublie
 *     quand on ne le montre pas ;
 *   - rien n'est signe : aucune cle, aucun ordre, et la page le DIT en haut.
 *
 * Quand le serveur ne repond pas, la page ne doit pas afficher une
 * tresorerie de depart intacte : « $1,000 » et « on ne sait rien » se
 * ressemblent a l'ecran et ne veulent pas dire la meme chose. C'est la faute
 * que `ai_colonie.test.js` a deja payee une fois sur l'autre page.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/* ---------------------------------------------------------------------------
 * LA VUE QUE LE SERVEUR SERT
 * Meme forme que `vue()` dans `ai_perp.js`. Figee ici : ce qu'on met a
 * l'essai est ce que la PAGE en fait — le calcul, c'est `ai_perp.test.js`.
 * ------------------------------------------------------------------------ */
function vueFausse(o) {
  o = o || {};
  const now = Date.now();
  return {
    sym: o.sym || 'BTCUSDT', tours: 412, maj: o.maj === undefined ? now - 40000 : o.maj,
    depuis: now - 3 * 86400000, erreur: null,
    tresor: 1063.2, depart: 1000, profit: 63.2,
    trades: o.trades === undefined ? 34 : o.trades,
    meilleur: { r: 2.41 },
    partGagnantes: o.partGagnantes === undefined ? 56 : o.partGagnantes,
    financement: { n: 34, total: -0.412, moyenne: -0.012 },
    positions: o.positions || [
      { sens: 1, prix0: 64210.5, stop: 63100.2, cible: 66020.9, mise: 106.3, score: 1.84, depuis: now - 95 * 60000 },
      { sens: -1, prix0: 64890.1, stop: 65720.4, cible: 63400.0, mise: 98.1, score: 1.12, depuis: now - 12 * 60000 },
    ],
    carnet: o.carnet || [
      { sens: 1, prix0: 63100, prix: 64400, r: 1.83, brut: 2.06, financement: -0.23, gain: 19.4,
        minutes: 310, pourquoi: 'target', t: now - 3600000 },
      { sens: -1, prix0: 65200, prix: 65900, r: -1.21, brut: -1.07, financement: -0.14, gain: -12.1,
        minutes: 88, pourquoi: 'stop', t: now - 7200000 },
    ],
    agents: [
      { key: 'tendance', nom: 'Trend', emoji: '📈', role: 'scout', quoi: 'reads the slope', traits: ['tend'] },
      { key: 'financement', nom: 'Funding', emoji: '💸', role: 'garde', quoi: 'what holding costs', traits: ['fin'] },
    ],
    audit: o.audit || [
      { cle: 'garde · funding too expensive', n: 140, moyenne: -0.21, gagnantes: 28, perdantes: 112, partGagnantes: 20 },
      { cle: 'regime · chop', n: 95, moyenne: 0.02, gagnantes: 47, perdantes: 48, partGagnantes: 49 },
      { cle: 'couloir · too far from the band', n: 12, moyenne: 0.4, gagnantes: 8, perdantes: 4, partGagnantes: 66 },
      { cle: 'pris', n: 120, moyenne: 0.3, gagnantes: 52, perdantes: 68, partGagnantes: 43 },
    ],
    reference: o.reference === undefined ? { n: 120, partGagnantes: 43 } : o.reference,
    verdicts: o.verdicts || [
      { cle: 'garde · funding too expensive', verdict: 'protects', n: 140, partGagnantes: 20, reference: 43 },
      { cle: 'regime · chop', verdict: 'costs', n: 95, partGagnantes: 49, reference: 43 },
      { cle: 'couloir · too far from the band', verdict: 'unknown', n: 12, manque: 48 },
      { cle: 'pris', verdict: 'same', n: 120, partGagnantes: 43, reference: 43 },
    ],
    /* L audit commun aux marches, comme `auditCommunVue()` le rend. */
    commun: o.commun || { symboles: ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','DOGEUSDT'],
      reference: { n: 300, partGagnantes: 45 }, divergePoints: 20, divergeMinObs: 6,
      audit: [
        { cle: 'Funding · too expensive', n: 340, moyenne: -0.2, gagnantes: 71, perdantes: 269,
          partGagnantes: 21, ecart: 4, marchesCompares: 3,
          marches: { BTCUSDT: { n: 140, gagnantes: 28, partGagnantes: 20 },
                     ETHUSDT: { n: 120, gagnantes: 26, partGagnantes: 22 },
                     DOGEUSDT: { n: 80, gagnantes: 17, partGagnantes: 21 } },
          verdict: { verdict: 'protects', n: 340, partGagnantes: 21, reference: 45, ecart: 4, marches: 3 } },
        { cle: 'Range · too far', n: 200, moyenne: 0.3, gagnantes: 90, perdantes: 110,
          partGagnantes: 45, ecart: 50, marchesCompares: 2,
          marches: { BTCUSDT: { n: 100, gagnantes: 20, partGagnantes: 20 },
                     DOGEUSDT: { n: 100, gagnantes: 70, partGagnantes: 70 } },
          verdict: { verdict: 'diverge', n: 200, partGagnantes: 45, ecart: 50, marches: 2 } },
        { cle: 'Session · dead hour', n: 7, moyenne: 0, gagnantes: 3, perdantes: 4,
          partGagnantes: 42, ecart: null, marchesCompares: 1,
          marches: { BTCUSDT: { n: 7, gagnantes: 3, partGagnantes: 42 } },
          verdict: { verdict: 'unknown', n: 7, manque: 5 } },
      ] },
    ombres: { enAttente: 37, jugees: 1284 },
    horizons: [15, 60, 240, 720, 1440], horizonRef: 240, minObs: 60,
    gagne: 1.5, perd: -1.5, seuil: 1.1,
    flux: [{ t: now - 120000, quoi: 'LONG at 64210.5', score: 1.84 },
           { t: now - 900000, quoi: 'CLOSED 1.83% · target' }],
    compteurs: { ouvertures: 61, fermetures: 34 },
    papier: true, source: 'Bitget public market data',
  };
}

async function ouvre(nav, port, page_, o) {
  o = o || {};
  const page = await nav.newPage();
  const vus = [];
  await page.route(/vitrine\.json/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route(/\/ai\/perp\//, (r) => {
    vus.push(r.request().url());
    if (o.horsLigne) return r.abort();
    const sym = r.request().url().split('/').pop();
    return r.fulfill({ status: 200, contentType: 'application/json',
                       body: JSON.stringify(vueFausse(Object.assign({ sym }, o.vue || {}))) });
  });
  await page.goto(`http://127.0.0.1:${port}/${page_}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(450);
  return { page, vus };
}
const txt = (page, sel) => page.$eval(sel, (e) => (e.textContent || '').trim()).catch(() => null);

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
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

  console.log('\n-- les deux pages existent et demandent chacune SON marche --');
  {
    const a = await ouvre(nav, port, 'swoge_perp_btc.html');
    const b = await ouvre(nav, port, 'swoge_perp_eth.html');
    ok(a.vus.length && a.vus.every((u) => /BTCUSDT$/.test(u)), 'la page BTC ne demande que BTCUSDT');
    ok(b.vus.length && b.vus.every((u) => /ETHUSDT$/.test(u)), 'la page ETH ne demande que ETHUSDT');
    /* Deux colonies separees : un seul echange chacune, pas la vue globale
       ni celle de l'autre marche. */
    ok(a.vus.length === 1 && b.vus.length === 1, 'un seul echange a l ouverture, de chaque cote');
    /* Les marches suivis sont ceux du moteur : une page par marche, et le
       basculeur les porte tous. Recopier la liste ici, c'est garantir qu'un
       jour il y aura un marche sans page, ou une page sans marche. */
    const MOTEUR = fs.readFileSync('/home/user/swoge-pusher-server.github.io/ai_perp.js', 'utf8')
      .match(/PERP_SYMBOLES \|\| '([^']+)'/)[1].split(',').map((x) => x.trim().replace(/USDT$/, ''));
    const onglets = await a.page.$$eval('.pp-bascule a', (e) => e.map((x) => x.textContent.trim()));
    ok(onglets.join(',') === MOTEUR.join(','),
       MOTEUR.length + ' marches suivis, ' + onglets.length + ' onglets : ' + onglets.join(', '));
    for (const m of MOTEUR) {
      ok(fs.existsSync(path.join(SITE, 'swoge_perp_' + m.toLowerCase() + '.html')),
         m + ' a sa page');
    }
    ok(/BTC/.test(await txt(a.page, '#ppSym')) && /ETH/.test(await txt(b.page, '#ppSym')),
       'chacune porte le nom de son marche en titre');
    const bascule = await b.page.$eval('.pp-bascule a.on', (e) => e.textContent.trim());
    ok(bascule === 'ETH', 'le basculeur marque la page ou l on est : ' + bascule);
    await a.page.close(); await b.page.close();
  }

  console.log('\n-- rien n est signe, et la page le dit EN HAUT --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html');
    const avis = await txt(page, '#ppAvis');
    ok(/nothing is signed/i.test(avis), 'l avertissement est ecrit en toutes lettres');
    ok(/no key|no order/i.test(avis), 'et nomme ce qui n existe pas ici : ' + avis.slice(0, 60) + '…');
    /* Il est AVANT les chiffres dans le document : ce qu'il dit change la
       lecture de tout ce qui suit. */
    const ordre = await page.evaluate(() => {
      const a = document.getElementById('ppAvis'), b = document.querySelector('.pp-bande');
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 'avant' : 'apres';
    });
    ok(ordre === 'avant', 'et il est place avant la bande de chiffres');
    ok(/Paper/i.test(await txt(page, '#ppPapier')), 'la puce dit « papier · prix reels »');
    /* ---- AUCUN SECRET DANS LA PAGE ----
     * Le moteur n'a ni cle ni chemin d'ordre (son propre essai le verifie).
     * La page non plus : elle ne fait que lire une vue publique. */
    const src = fs.readFileSync(path.join(SITE, 'perp.js'), 'utf8');
    ok(!/API_KEY|SECRET|passphrase|privateKey|signature/i.test(src), 'perp.js ne porte aucune cle ni signature');
    ok(!/\/order|placeOrder|\/trade\b/i.test(src), 'ni aucun chemin qui passerait un ordre');
    await page.close();
  }

  console.log('\n-- les chiffres qu on vient voir --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html');
    ok(await txt(page, '#ppProfit') === '+$63.20', 'le profit, signe');
    ok(await txt(page, "#ppTresor") === "$1,063.20", 'la tresorerie papier');
    ok(await txt(page, '#ppTrades') === '34', 'les trades fermes');
    ok(await txt(page, '#ppOuvertes') === '2', 'les positions ouvertes');
    ok(/2\.41%/.test(await txt(page, '#ppMeilleur')), 'le meilleur trade');
    /* ---- LE FINANCEMENT A SA PROPRE CASE ----
     * Toutes les huit heures, un cote paie l autre. C'est la ligne qu'on
     * regarde quand le mouvement du prix a l'air bon et que le net ne suit
     * pas : la cacher, c'est laisser croire au papier. */
    ok(/-0\.41%/.test(await txt(page, '#ppFin')), 'le financement paye, a part du prix');
    ok(/34 closed trades/.test(await txt(page, '#ppFinSur')), 'et sur combien de trades il porte');
    const classe = await page.$eval('#ppFin', (e) => e.className);
    ok(classe === 'pp-rouge', 'un financement negatif se voit comme un cout');
    await page.close();
  }

  console.log('\n-- un chiffre se tait quand l echantillon ne le porte pas --');
  {
    /* Quinze trades a 60 %, c'est neuf trades. Un ecart sur une poignee de
       trades est de la chance, pas un resultat : la case reste vide et dit
       combien il en manque. */
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html',
                                { vue: { trades: 12, partGagnantes: 66 } });
    ok(await txt(page, '#ppTaux') === '—', 'sous vingt trades, le taux de gain n est pas affiche');
    ok(/need 8 more/.test(await txt(page, '#ppTauxSur')), 'et la page dit combien il en manque');
    await page.close();
    const b = await ouvre(nav, port, 'swoge_perp_btc.html');
    ok(await txt(b.page, '#ppTaux') === '56%', 'a trente-quatre trades, il s affiche');
    ok(/on 34/.test(await txt(b.page, '#ppTauxSur')), 'avec son echantillon a cote');
    await b.page.close();
  }

  console.log('\n-- l audit : une regle sans assez d observations n a pas de verdict --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html');
    const lignes = await page.$$eval('#ppAudit tr', (tr) => tr.slice(1).map((r) => ({
      cle: r.cells[0].textContent.trim(), n: r.cells[1].textContent.trim(),
      part: r.cells[2].textContent.trim(), verdict: r.cells[3].textContent.trim(),
      cls: r.cells[3].firstElementChild.className,
    })));
    ok(lignes.length === 3, 'trois regles listees — « pris » est la reference, pas une regle : ' + lignes.length);
    ok(!lignes.some((l) => l.cle === 'pris'), 'et elle ne s affiche donc pas comme une ligne de refus');
    const prot = lignes.find((l) => /funding too expensive/.test(l.cle));
    ok(prot && /protects/.test(prot.verdict), 'un refus qui a moins bien marche que ce qu on prend : « protege »');
    const cout = lignes.find((l) => /chop/.test(l.cle));
    ok(cout && /costs/.test(cout.verdict) && cout.cls.includes('mauvais'),
       'un refus qui a MIEUX marche que ce qu on prend : « coute » — c est la ligne qu on vient chercher');
    const jeune = lignes.find((l) => /too far from the band/.test(l.cle));
    ok(jeune && /not yet/.test(jeune.verdict), 'douze observations : aucun verdict, « pas encore »');
    ok(jeune && /48 more/.test(jeune.verdict), 'et la page dit combien il en manque : ' + jeune.verdict);
    /* La reference est ECRITE : « 43 % de gagnantes sur 120 observations ».
       Sans elle, « 20 % de gagnantes » ne veut rien dire — on ne sait pas
       contre quoi. */
    const sous = await txt(page, '#ppAuditSous');
    ok(/43% winners over 120/.test(sous), 'la reference est nommee avec son echantillon');
    ok(/Below 60 observations/.test(sous), 'et le seuil en dessous duquel rien n est juge');
    await page.close();
  }

  console.log('\n-- rien de pris encore : la page ne compare pas contre du vide --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html',
                                { vue: { reference: null } });
    const sous = await txt(page, '#ppAuditSous');
    ok(/Nothing is comparable yet/i.test(sous), 'elle le dit au lieu de comparer contre rien : ' + sous.slice(0, 50) + '…');
    ok(!/%/.test(sous), 'et n avance aucun pourcentage de reference');
    await page.close();
  }

  console.log('\n-- les positions et le carnet --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html');
    const pos = await page.$$eval('#ppPos tr', (tr) => tr.slice(1).map((r) => r.cells[0].textContent.trim()));
    ok(pos.join(',') === 'LONG,SHORT', 'les deux sens sont lisibles d un coup d oeil : ' + pos.join(', '));
    const car = await page.$$eval('#ppCarnet tr', (tr) => tr.slice(1).map((r) => ({
      brut: r.cells[2].textContent.trim(), fin: r.cells[3].textContent.trim(),
      net: r.cells[4].textContent.trim(), cls: r.cells[4].className,
    })));
    ok(car.length === 2, 'deux trades fermes');
    ok(car[0].brut === '+2.06%' && car[0].fin === '-0.23%' && car[0].net === '+1.83%',
       'prix, financement et net sont TROIS colonnes : ' + car[0].brut + ' ' + car[0].fin + ' → ' + car[0].net);
    ok(car[0].cls.includes('pp-vert') && car[1].cls.includes('pp-rouge'), 'un gain et une perte ne se lisent pas pareil');
    await page.close();
  }

  console.log('\n-- le serveur ne repond pas --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html', { horsLigne: true });
    /* « $1,000 » se lirait comme une tresorerie a son point de depart : une
       colonie qui tourne et n a rien gagne. Ce n est pas ce qui se passe — on
       ne sait rien. Les deux se ressemblent a l ecran. */
    ok(await txt(page, '#ppProfit') === '—', 'le profit n est pas affiche : « — », pas « +$0 »');
    ok(await txt(page, '#ppTresor') === '—', 'ni la tresorerie');
    ok(/waiting for data/i.test(await txt(page, '#ppStamp')), 'et la puce dit qu on attend des donnees');
    await page.close();
  }

  console.log('\n-- un etat vieux se DIT --');
  {
    /* Une page figee depuis une heure se lit comme un marche calme. */
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html',
                                { vue: { maj: Date.now() - 75 * 60000 } });
    const st = await txt(page, '#ppStamp');
    ok(/stale/i.test(st), 'l etat perime est nomme : ' + st);
    ok((await page.$eval('#ppStamp', (e) => e.className)).includes('vieux'), 'et il se voit');
    await page.close();
  }

  console.log('\n-- les deux langues --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html');
    ok(/perpetual market/i.test(await txt(page, '#ppSous')), 'la page ouvre en anglais, comme le reste du site');
    await page.click('#ppLangue');
    await page.waitForTimeout(120);
    ok(/marche perpetuel/i.test(await txt(page, '#ppSous')), 'le drapeau bascule en francais');
    ok(/Rien n'est signe/i.test(await txt(page, '#ppAvis')), 'et l avertissement aussi');
    const sous = await txt(page, '#ppAuditSous');
    ok(/43 % de gagnantes/.test(sous), 'la phrase francaise a sa propre forme, espace comprise : ' + sous.slice(0, 40) + '…');
    /* Ce que le SERVEUR ecrit lui-meme reste tel quel : les raisons de refus
       arrivent avec leurs chiffres dedans, les retraduire ici les
       inventerait. */
    const cle = await page.$eval('#ppAudit tr:nth-child(2) td', (e) => e.textContent.trim());
    ok(/funding too expensive/.test(cle), 'les mots du serveur ne sont pas retraduits : ' + cle);
    await page.close();
  }

  console.log('\n-- les agents, et ce qu ils regardent --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html');
    const ags = await page.$$eval('.pp-ag b', (e) => e.map((x) => x.textContent.trim()));
    ok(ags.join(',') === 'Trend,Funding', 'les agents viennent du serveur, pas de la page : ' + ags.join(', '));
    ok(/not the token colony/i.test(await txt(page, '#ppAgentsSous')),
       'et la page dit que ce ne sont PAS ceux de la colonie de jetons');
    /* ---- LE ROLE EST UNE CLE, PAS UN MOT A MONTRER ----
     * Le serveur les nomme en francais parce que tout le code l'est :
     * affiches tels quels, `garde` et `specialiste` mettaient des mots
     * francais au milieu d'un panneau anglais. */
    const roles = await page.$$eval('.pp-ag .r', (e) => e.map((x) => x.textContent.trim()));
    ok(roles.join(',') === 'scout,guard', 'les roles sont traduits : ' + roles.join(', '));
    { const o = await txt(page, "#ppOmbres"); ok(/37 shadows waiting, 1284 judged/.test(o), "les ombres en attente et jugees : " + o); }
    { const h = await txt(page, '#ppHorizons'); ok(/15, 60, 240, 720, 1440/.test(h), 'les horizons de jugement sont ecrits : ' + h); }
    await page.close();
  }

  console.log('\n-- l audit commun aux marches, et ce qu il refuse d additionner --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html');
    const l = await page.$$eval('#ppCommun tr', (tr) => tr.slice(1).map((r) => ({
      cle: r.cells[0].textContent.trim(), n: r.cells[1].textContent.trim(),
      verdict: r.cells[3].textContent.trim(), cls: r.cells[3].firstElementChild.className,
      titre: r.cells[3].firstElementChild.getAttribute('title') || '',
      parts: [...r.cells[4].querySelectorAll('.pp-m')].map((m) => m.textContent.trim()),
    })));
    ok(l.length === 3, 'les regles communes sont listees : ' + l.length);
    const f = l.find((x) => /Funding/.test(x.cle));
    ok(f && f.n === '340', 'une regle est jugee sur la somme des marches (' + (f && f.n) + '), pas sur un seul');
    ok(f && /protects/.test(f.verdict), 'et son verdict porte sur cet echantillon-la');
    /* ---- CE QU ON N A PAS LE DROIT D ADDITIONNER ----
     * 20 % sur BTC, 70 % sur DOGE : le total ferait 45 %, un chiffre juste
     * sur rien. La ligne doit le DIRE au lieu de conclure. */
    const d = l.find((x) => /Range/.test(x.cle));
    ok(d && /disagree/i.test(d.verdict), 'marches en desaccord : aucun verdict commun (« ' + (d && d.verdict) + ' »)');
    ok(d && d.cls.includes('diverge'), 'et ce n est ni un bon ni un mauvais verdict : c est l absence de verdict');
    ok(d && /50pt/.test(d.verdict), 'l ecart constate est ecrit sur la ligne : ' + (d && d.verdict));
    ok(d && /right about nothing/i.test(d.titre), 'et la ligne dit pourquoi on n additionne pas');
    /* ---- LA REPARTITION PART AVEC LE TOTAL ----
     * Une regle vue 140 fois sur BTC et 7 fois sur DOGE ne doit pas se lire
     * « vue partout » : chaque marche porte son effectif. */
    ok(f && f.parts.length === 3, 'chaque ligne montre sa repartition par marche : ' + (f && f.parts.join(' | ')));
    ok(f && f.parts.every((x) => /\d+%/.test(x) && /\d+$/.test(x)),
       'avec, pour chacun, sa part ET son effectif');
    ok(f && f.parts.some((x) => /^BTC /.test(x)) && f.parts.some((x) => /^DOGE /.test(x)),
       'les marches sont nommes sans leur suffixe USDT');
    /* Sous le minimum, aucun verdict commun non plus. */
    const j = l.find((x) => /Session/.test(x.cle));
    ok(j && /not yet/.test(j.verdict) && /5 more/.test(j.verdict),
       'sous le minimum, aucun verdict commun : ' + (j && j.verdict));
    /* ---- LA BORNE EST POSEE SANS MESURE, ET LA PAGE LE DIT ----
     * Une borne qu'on ne peut pas relire contre des chiffres se deplace au
     * feeling. Celle-ci s'annonce comme non mesuree, et l'ecart est ecrit sur
     * chaque ligne pour qu'on puisse la juger. */
    const b = await txt(page, '#ppBorne');
    ok(/20 points/.test(b), 'la borne de divergence est ecrite : ' + b.slice(0, 40) + '…');
    ok(/no measurement behind it/i.test(b), 'et la page dit qu aucune mesure ne la soutient');
    const sous = await txt(page, '#ppCommunSous');
    ok(/5 markets/.test(sous), 'la carte dit sur combien de marches elle porte');
    ok(/45% winners over 300/.test(sous), 'et nomme la reference commune avec son echantillon');
    await page.close();
  }

  console.log('\n-- rien de pris sur aucun marche : pas de reference commune --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html', { vue: { commun: {
      symboles: ['BTCUSDT','ETHUSDT'], reference: null, divergePoints: 20, divergeMinObs: 6, audit: [] } } });
    const sous = await txt(page, '#ppCommunSous');
    ok(/Nothing is comparable yet/i.test(sous), 'la carte le dit au lieu de comparer contre rien');
    ok(/no rule has been observed/i.test(await txt(page, '#ppCommun')), 'et le tableau est vide, pas faux');
    await page.close();
  }

  console.log('\n-- le journal --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html');
    const l = await page.$$eval('.pp-flux li', (e) => e.map((x) => x.textContent.trim()));
    ok(l.length === 2 && /LONG at 64210.5/.test(l[0]), 'le fil montre ce qui vient de se passer');
    await page.close();
  }

  console.log('\n-- le menu de gauche mene aux deux colonies --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp_btc.html');
    const liens = await page.$$eval('.sw-nav a', (e) => e.map((x) => x.getAttribute('href')));
    ok(liens.includes('swoge_perp_btc.html') && liens.includes('swoge_perp_eth.html'),
       'les deux pages sont dans la navigation du site');
    ok(liens.includes('swoge_ai.html'), 'a cote de la colonie de jetons, dont elles sont la suite');
    ok(await page.$eval('.sw-nav a.on', (e) => e.getAttribute('href')) === 'swoge_perp_btc.html',
       'et la page courante est marquee');
    await page.close();
  }

  await nav.close();
  await new Promise((r) => srv.close(r));
  console.log(rates ? `\nRATES : ${rates}/${n}` : `\nperp_page.test.js : ${n} verifications OK`);
  process.exit(rates ? 1 : 0);
})();
