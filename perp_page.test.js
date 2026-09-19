/* ============================================================================
 * LES DEUX PAGES PERPETUELLES : ELLES MONTRENT, ELLES NE DECIDENT RIEN
 *
 * Les marches sont des colonies separees (`ai_perp.js`, un etat par symbole)
 * mais UNE seule page : cinq entrees de menu pour cinq ecrans identiques a un
 * symbole pres annoncaient cinq destinations la ou il n'y a qu'un tableau de
 * bord. Ce que cet essai mesure tient en quatre phrases :
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
    tours: 412, maj: o.maj === undefined ? now - 40000 : o.maj,
    depuis: now - 3 * 86400000, erreur: null,
    marches: o.marches || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'],
    tresor: 1063.2, depart: 1000, profit: 63.2,
    trades: o.trades === undefined ? 34 : o.trades,
    meilleur: 2.41,
    partGagnantes: o.partGagnantes === undefined ? 56 : o.partGagnantes,
    financement: { n: 34, total: -0.412, moyenne: -0.012 },
    positions: o.positions || [
      { sym: 'DOGEUSDT', nom: 'DOGE', sens: 1, prix0: 0.2134, prix: 0.2201, prixVu: now - 40000,
        stop: 0.2011, cible: 0.2290, mise: 106.3, levier: 1,
        brut: 3.14, financement: -0.11, net: 3.03, gain: 3.22,
        score: 1.84, depuis: now - 95 * 60000 },
    ],
    carnet: o.carnet || [
      { sym: 'BTCUSDT', sens: 1, prix0: 63100, prix: 64400, r: 1.83, brut: 2.06, financement: -0.23,
        gain: 19.4, minutes: 310, pourquoi: 'target', t: now - 3600000 },
      { sym: 'SOLUSDT', sens: -1, prix0: 152.2, prix: 154.1, r: -1.21, brut: -1.07, financement: -0.14,
        gain: -12.1, minutes: 88, pourquoi: 'stop', t: now - 7200000 },
    ],
    /* Ce que chaque marche a rendu : la repartition que les cinq colonies
       separees donnaient gratuitement. */
    soupape: o.soupape === undefined ? { soupape: { n: 4, moyenne: -0.82, partGagnantes: 25 },
      colonie: { n: 30, moyenne: 0.41, partGagnantes: 57 }, tours: 12, comparable: false,
      disette: 3, prises: 4 } : o.soupape,
    parMarche: o.parMarche || [
      { sym: 'BTCUSDT', nom: 'BTC', n: 18, gagnantes: 11, partGagnantes: 61, gain: 40.2,
        financement: -0.21, appris: { n: 220, moyenne: 0.42 }, obs: 220 },
      { sym: 'DOGEUSDT', nom: 'DOGE', n: 9, gagnantes: 3, partGagnantes: 33, gain: -12.5,
        financement: -0.18, appris: { n: 140, moyenne: -0.31 }, obs: 140 },
      { sym: 'SOLUSDT', nom: 'SOL', n: 7, gagnantes: 4, partGagnantes: 57, gain: 35.5,
        financement: -0.02, appris: null, obs: 5 },
      { sym: 'XRPUSDT', nom: 'XRP', n: 0, gagnantes: 0, partGagnantes: null, gain: 0,
        financement: 0, appris: null, obs: 0 },
      { sym: 'ETHUSDT', nom: 'ETH', n: 0, gagnantes: 0, partGagnantes: null, gain: 0,
        financement: 0, appris: null, obs: 0 },
    ],
    agents: [
      { key: 'tendance', nom: 'Trend', emoji: '📈', role: 'scout', quoi: 'reads the slope', traits: ['tend'] },
      { key: 'banquier', nom: 'Banker', emoji: '🏦', role: 'garde', quoi: 'how much goes in', traits: ['marche'] },
    ],
    audit: o.audit || [
      { cle: 'Funding · too expensive', n: 140, moyenne: -0.21, gagnantes: 28, perdantes: 112, partGagnantes: 20 },
      { cle: 'Regime · chop', n: 95, moyenne: 0.02, gagnantes: 47, perdantes: 48, partGagnantes: 49 },
      { cle: 'Range · too far from the band', n: 12, moyenne: 0.4, gagnantes: 8, perdantes: 4, partGagnantes: 66 },
      { cle: 'pris', n: 120, moyenne: 0.3, gagnantes: 52, perdantes: 68, partGagnantes: 43 },
    ],
    reference: o.reference === undefined ? { n: 120, partGagnantes: 43 } : o.reference,
    verdicts: o.verdicts || [
      { cle: 'Funding · too expensive', verdict: 'protects', n: 140, partGagnantes: 20, reference: 43 },
      { cle: 'Regime · chop', verdict: 'costs', n: 95, partGagnantes: 49, reference: 43 },
      { cle: 'Range · too far from the band', verdict: 'unknown', n: 12, manque: 48 },
      { cle: 'pris', verdict: 'same', n: 120, partGagnantes: 43, reference: 43 },
    ],
    ombres: { enAttente: 37, jugees: 1284 },
    horizons: [15, 60, 240, 720, 1440], horizonRef: 240, minObs: 60, profilMinObs: 8,
    journal: o.journal === undefined ? { actif: true, jours: 12, octets: 5452595, garde: 180 } : o.journal,
    gagne: 1.5, perd: -1.5, seuil: 1.1,
    flux: [{ t: now - 120000, quoi: 'LONG DOGE at 0.2134', score: 1.84 },
           { t: now - 900000, quoi: 'CLOSED BTC 1.83% · target' }],
    compteurs: { ouvertures: 61, fermetures: 34 },
    papier: true, source: 'Bitget public market data',
  };
}

async function ouvre(nav, port, page_, o) {
  o = o || {};
  const page = await nav.newPage();
  const vus = [];
  await page.route(/vitrine\.json/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route(/\/ai\/perp/, (r) => {
    vus.push(r.request().url());
    if (o.horsLigne) return r.abort();
    return r.fulfill({ status: 200, contentType: 'application/json',
                       body: JSON.stringify(vueFausse(o.vue || {})) });
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

  console.log('\n-- une colonie, tous les marches --');
  {
    /* ---- POURQUOI UNE SEULE ----
     * Il y a eu une page par marche, puis une page pour cinq colonies. Il n y
     * a plus qu une colonie : cinq memoires nourries chacune d un cinquieme
     * des observations n apprennent rien, et cinq tresoreries de mille
     * dollars prennent cinq petites positions la ou une seule en prend une
     * vraie. */
    const MOTEUR = fs.readFileSync('/home/user/swoge-pusher-server.github.io/ai_perp.js', 'utf8');
    const SYMS = MOTEUR.match(/PERP_SYMBOLES \|\| '([^']+)'/)[1].split(',').map((x) => x.trim().replace(/USDT$/, ''));
    ok(!fs.readdirSync(SITE).some((f) => /^swoge_perp_.+\.html$/.test(f)),
       'il n y a plus une page par marche');
    const { page, vus } = await ouvre(nav, port, 'swoge_perp.html');
    ok(vus.length === 1 && /\/ai\/perp$/.test(vus[0]),
       'un seul echange, et pas par marche : ' + vus[0].replace(/^.*\/ai/, '/ai'));
    /* Le titre nomme les marches lus : avec une colonie sur cinq marches, un
       titre qui en nomme un seul ferait croire qu elle ne voit que lui. */
    const titre = await txt(page, '#ppSym');
    ok(SYMS.every((m) => titre.includes(m)), 'le titre nomme les marches lus : ' + titre);
    ok(!(await page.$('.pp-bascule')), 'et il n y a plus rien a basculer');
    ok(/One colony/i.test(await txt(page, '#ppUne')), 'la puce dit qu il n y en a qu une');
    /* Une position ne dit plus rien sans son marche : « LONG a 0,21 », c est
       quel instrument ? */
    const pos = await page.$$eval('#ppPos tr', (tr) => tr.slice(1).map((r) => r.cells[0].textContent.trim()));
    ok(pos[0] === 'DOGE', 'chaque position porte son marche, en premiere colonne : ' + pos.join(', '));
    const car = await page.$$eval('#ppCarnet tr', (tr) => tr.slice(1).map((r) => r.cells[0].textContent.trim()));
    ok(car.join(',') === 'BTC,SOL', 'chaque trade ferme aussi : ' + car.join(', '));
    ok(/DOGE/.test(await page.$eval('.pp-flux li', (e) => e.textContent)),
       'et le journal nomme le marche de ce qui vient de se passer');
    await page.close();
  }

  console.log('\n-- ce que chaque marche a rendu --');
  {
    /* Le decoupage en cinq colonies donnait cette repartition gratuitement :
       c est la seule chose qu il faisait mieux, et elle ne doit pas se perdre. */
    const { page } = await ouvre(nav, port, 'swoge_perp.html');
    const l = await page.$$eval('#ppMarches tr', (tr) => tr.slice(1).map((r) => ({
      nom: r.cells[0].textContent.trim(), n: r.cells[1].textContent.trim(),
      part: r.cells[2].textContent.trim(), gain: r.cells[3].textContent.trim(),
      cls: r.cells[3].className, appris: r.cells[5].textContent.trim(),
    })));
    ok(l.length === 5, 'les cinq marches sont listes : ' + l.map((x) => x.nom).join(', '));
    const btc = l.find((x) => x.nom === 'BTC');
    ok(btc && btc.n === '18' && btc.part === '61%', 'chacun avec ses trades fermes et sa part de gagnantes');
    ok(btc && btc.gain === '+$40.20' && btc.cls.includes('pp-vert'), 'et ce qu il a rapporte : ' + (btc && btc.gain));
    const doge = l.find((x) => x.nom === 'DOGE');
    ok(doge && doge.cls.includes('pp-rouge'), 'un marche qui perd ne se lit pas comme un marche qui gagne');
    /* ---- « APPRIS » N EST PAS « FERME » ----
     * L un porte sur les trades reellement clotures, l autre sur toutes les
     * ombres jugees — bien plus nombreuses. Les confondre ferait lire 220
     * observations comme 18 trades. */
    ok(btc && /220/.test(btc.appris) && /0\.42/.test(btc.appris),
       'ce que la colonie a appris du marche porte son propre effectif : ' + (btc && btc.appris));
    ok(/Learned. is the colony's memory/i.test(await txt(page, '#ppAppris')),
       'et la page dit que ce n est pas la meme chose que les trades fermes');
    /* Sous le minimum, la case ne dit rien — et elle dit combien il manque. */
    const sol = l.find((x) => x.nom === 'SOL');
    ok(sol && /not yet/.test(sol.appris) && /5\/8/.test(sol.appris),
       'sous huit observations, rien d appris : ' + (sol && sol.appris));
    /* ---- AUCUN TRADE N EST PAS ZERO ----
     * « 0 % de gagnantes » se lit comme un marche qui perd tout ; ici on n a
     * rien vu du tout. */
    const xrp = l.find((x) => x.nom === 'XRP');
    ok(xrp && xrp.n === '—' && xrp.part === '—' && xrp.gain === '—',
       'un marche sans trade affiche des tirets, pas des zeros : ' + JSON.stringify(xrp && xrp.part));
    ok(!!xrp, 'mais il est LISTE : une ligne absente se lirait comme un marche qu on ne suit pas');
    /* ---- CE QUE LE JOURNAL BRUT PORTE ----
     * Un compteur ne se desadditionne pas : la page dit combien de jours de
     * lignes brutes existent, parce que c est ce qui decide si la question
     * « comment gagne-t-on sur la duree » a seulement de quoi etre posee. */
    const jl = await txt(page, '#ppJournal');
    ok(/12 day/.test(jl) && /5\.2 MB/.test(jl), 'la page dit ce que le journal brut porte : ' + jl.slice(0, 60) + '…');
    ok(/cannot be un-summed/i.test(jl), 'et pourquoi il existe a cote des compteurs');
    /* ---- LA SOUPAPE DOIT SE VOIR, ET SE JUGER ----
     * Sans elle la colonie ne prend rien ; sans rien de pris, l audit ne peut
     * jamais conclure. Une soupape invisible est une soupape qu on oublie. */
    const sd = await txt(page, '#ppSoupapeDit');
    ok(/12 turns/.test(sd), 'la page dit au bout de combien de tours elle s ouvre : ' + sd.slice(0, 50) + '…');
    ok(/reference every rule is judged against/i.test(sd), 'et POURQUOI elle existe');
    ok(/4 taken that way/.test(sd) && /3 turn/.test(sd), 'combien de prises, et la disette en cours');
    const sl = await page.$$eval('#ppSoupape tr', (tr) => tr.slice(1).map((r) => r.cells[1].textContent.trim()));
    ok(sl.join(',') === '4,30', 'les deux groupes sont cote a cote avec leur effectif : ' + sl.join(' / '));
    ok(/Not comparable yet/i.test(await txt(page, '#ppSoupape')),
       'et rien n est conclu tant que les deux n ont pas assez de trades');
    await page.close();
  }

  console.log('\n-- rien n est signe, et la page le dit EN HAUT --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp.html');
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
    const { page } = await ouvre(nav, port, 'swoge_perp.html');
    ok(await txt(page, '#ppProfit') === '+$63.20', 'le profit, signe');
    ok(await txt(page, "#ppTresor") === "$1,063.20", 'la tresorerie papier');
    ok(await txt(page, '#ppTrades') === '34', 'les trades fermes');
    ok(await txt(page, '#ppOuvertes') === '1', 'les positions ouvertes — une seule, pour toute la colonie');
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
    const { page } = await ouvre(nav, port, 'swoge_perp.html',
                                { vue: { trades: 12, partGagnantes: 66 } });
    ok(await txt(page, '#ppTaux') === '—', 'sous vingt trades, le taux de gain n est pas affiche');
    ok(/need 8 more/.test(await txt(page, '#ppTauxSur')), 'et la page dit combien il en manque');
    await page.close();
    const b = await ouvre(nav, port, 'swoge_perp.html');
    ok(await txt(b.page, '#ppTaux') === '56%', 'a trente-quatre trades, il s affiche');
    ok(/on 34/.test(await txt(b.page, '#ppTauxSur')), 'avec son echantillon a cote');
    await b.page.close();
  }

  console.log('\n-- l audit : une regle sans assez d observations n a pas de verdict --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp.html');
    const lignes = await page.$$eval('#ppAudit tr', (tr) => tr.slice(1).map((r) => ({
      cle: r.cells[0].textContent.trim(), n: r.cells[1].textContent.trim(),
      part: r.cells[2].textContent.trim(), verdict: r.cells[3].textContent.trim(),
      cls: r.cells[3].firstElementChild.className,
    })));
    ok(lignes.length === 3, 'trois regles listees — « pris » est la reference, pas une regle : ' + lignes.length);
    ok(!lignes.some((l) => l.cle === 'pris'), 'et elle ne s affiche donc pas comme une ligne de refus');
    const prot = lignes.find((l) => /Funding/.test(l.cle));
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
    const { page } = await ouvre(nav, port, 'swoge_perp.html',
                                { vue: { reference: null } });
    const sous = await txt(page, '#ppAuditSous');
    ok(/Nothing is comparable yet/i.test(sous), 'elle le dit au lieu de comparer contre rien : ' + sous.slice(0, 50) + '…');
    ok(!/%/.test(sous), 'et n avance aucun pourcentage de reference');
    await page.close();
  }

  console.log('\n-- les positions et le carnet --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp.html');
    const pos = await page.$$eval('#ppPos tr', (tr) => tr.slice(1).map((r) => r.cells[1].textContent.trim()));
    ok(pos.join(',') === 'LONG', 'le sens reste lisible d un coup d oeil, a cote du marche : ' + pos.join(', '));
    /* ---- LE PRIX MAINTENANT, ET CE QUE LA POSITION VAUT ----
     * Le tableau ne montrait que l entree, le stop et la cible : trois
     * chiffres figes a l ouverture. C est pourtant la seule chose qu on vient
     * voir sur une position ouverte. */
    const live = await page.$$eval('#ppPos tr', (tr) => tr.slice(1).map((r) => ({
      now: r.cells[3].textContent.trim(), pnl: r.cells[4].textContent.trim(), cls: r.cells[4].className })));
    ok(/0\.2201/.test(live[0].now), 'le prix actuel est affiche a cote de l entree : ' + live[0].now);
    ok(/\+\$3\.22/.test(live[0].pnl), 'et ce que la position vaut en dollars : ' + live[0].pnl);
    ok(/\+3\.03%/.test(live[0].pnl), 'avec son pourcentage, financement deja paye compris');
    ok(live[0].cls.includes('pp-vert'), 'un gain latent ne se lit pas comme une perte');
    const car = await page.$$eval('#ppCarnet tr', (tr) => tr.slice(1).map((r) => ({
      brut: r.cells[3].textContent.trim(), fin: r.cells[4].textContent.trim(),
      net: r.cells[5].textContent.trim(), cls: r.cells[5].className,
    })));
    ok(car.length === 2, 'deux trades fermes');
    ok(car[0].brut === '+2.06%' && car[0].fin === '-0.23%' && car[0].net === '+1.83%',
       'prix, financement et net sont TROIS colonnes : ' + car[0].brut + ' ' + car[0].fin + ' → ' + car[0].net);
    ok(car[0].cls.includes('pp-vert') && car[1].cls.includes('pp-rouge'), 'un gain et une perte ne se lisent pas pareil');
    await page.close();
  }

  console.log('\n-- le serveur ne repond pas --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp.html', { horsLigne: true });
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
    const { page } = await ouvre(nav, port, 'swoge_perp.html',
                                { vue: { maj: Date.now() - 75 * 60000 } });
    const st = await txt(page, '#ppStamp');
    ok(/stale/i.test(st), 'l etat perime est nomme : ' + st);
    ok((await page.$eval('#ppStamp', (e) => e.className)).includes('vieux'), 'et il se voit');
    await page.close();
  }

  console.log('\n-- les deux langues --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp.html');
    ok(/perpetual market/i.test(await txt(page, '#ppSous')), 'la page ouvre en anglais, comme le reste du site');
    await page.click('#ppLangue');
    await page.waitForTimeout(120);
    ok(/marches perpetuels/i.test(await txt(page, '#ppSous')), 'le drapeau bascule en francais');
    ok(/Rien n'est signe/i.test(await txt(page, '#ppAvis')), 'et l avertissement aussi');
    const sous = await txt(page, '#ppAuditSous');
    ok(/43 % de gagnantes/.test(sous), 'la phrase francaise a sa propre forme, espace comprise : ' + sous.slice(0, 40) + '…');
    /* Ce que le SERVEUR ecrit lui-meme reste tel quel : les raisons de refus
       arrivent avec leurs chiffres dedans, les retraduire ici les
       inventerait. */
    const cle = await page.$eval('#ppAudit tr:nth-child(2) td', (e) => e.textContent.trim());
    ok(/too expensive/.test(cle), 'les mots du serveur ne sont pas retraduits : ' + cle);
    await page.close();
  }

  console.log('\n-- les agents, et ce qu ils regardent --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp.html');
    const ags = await page.$$eval('.pp-ag b', (e) => e.map((x) => x.textContent.trim()));
    ok(ags.join(',') === 'Trend,Banker', 'les agents viennent du serveur, pas de la page : ' + ags.join(', '));
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

  console.log('\n-- le journal --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp.html');
    const l = await page.$$eval('.pp-flux li', (e) => e.map((x) => x.textContent.trim()));
    ok(l.length === 2 && /LONG DOGE at 0.2134/.test(l[0]), 'le fil montre ce qui vient de se passer, marche compris');
    await page.close();
  }

  console.log('\n-- le menu de gauche : UNE entree, pas cinq --');
  {
    const { page } = await ouvre(nav, port, 'swoge_perp.html');
    const liens = await page.$$eval('.sw-nav a', (e) => e.map((x) => x.getAttribute('href')));
    const perp = liens.filter((h) => /swoge_perp/.test(h));
    ok(perp.length === 1 && perp[0] === 'swoge_perp.html',
       'une seule entree pour tous les marches : ' + perp.join(', '));
    ok(liens.includes('swoge_ai.html'), 'a cote de la colonie de jetons, dont elle est la suite');
    ok(await page.$eval('.sw-nav a.on', (e) => e.getAttribute('href')) === 'swoge_perp.html',
       'et la page courante est marquee');
    /* Le menu du site fait foi partout : une entree qui n existe que sur
       certaines pages envoie les autres dans le vide. */
    const ailleurs = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    ok((ailleurs.match(/swoge_perp/g) || []).length === 1,
       'et l accueil ne porte qu elle aussi');
    await page.close();
  }

  await nav.close();
  await new Promise((r) => srv.close(r));
  console.log(rates ? `\nRATES : ${rates}/${n}` : `\nperp_page.test.js : ${n} verifications OK`);
  process.exit(rates ? 1 : 0);
})();
