'use strict';
/*
 * LA PORTE DE CONNEXION S OUVRE, ET SES BOUTONS REPONDENT.
 *
 * ---- CE QUI ETAIT SIGNALE ----
 *
 * « Quand je clique sur connect wallet, que ce soit sur index html ou betting
 *   html ou game html, ca me met Connect wallet / Sign email et j arrive pas a
 *   cliquer. »
 *
 * ---- CE QUI SE PASSAIT ----
 *
 * Trois pages du site portent `a[href], button{ pointer-events:none }` : elles
 * sont des MAQUETTES, et leurs boutons gardent leur dessin sans repondre au
 * doigt. La regle vise les elements par leur TYPE — elle frappe donc aussi
 * tout ce qu un script ajoute apres coup.
 *
 * `stakebubble.js` pose la porte de connexion et le tiroir du compte APRES le
 * chargement. Ses boutons tombaient sous la regle. La porte s ouvrait bel et
 * bien, et l on ne pouvait rien y presser — c est le pire etat possible, parce
 * que tout a l air normal.
 *
 * ---- POURQUOI AUCUN ESSAI NE L AVAIT VU ----
 *
 * Un `.click()` lance depuis JavaScript IGNORE `pointer-events`. Tous les
 * essais qui passaient par `page.evaluate(() => el.click())` validaient donc
 * des boutons que personne ne pouvait presser. C est la septieme fois que ce
 * piege se referme sur ce depot. Ici, CHAQUE clic passe par un vrai pointeur.
 *
 * ---- ET LA GARDE EST DU BON COTE ----
 *
 * Elle est ecrite dans `stakebubble.js`, le fichier qui CREE ces elements, et
 * non dans chaque page : une page qui adopterait la regle demain serait
 * couverte sans rien savoir. L essai le verifie aussi — sinon la prochaine
 * page la reprendrait a la main, et la suivante l oublierait.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

let n = 0, echecs = 0;
const ok = (c, m) => { if (c) { n++; console.log('  ok   ' + m); }
                       else { echecs++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} [${a} vs ${b}]`);

const SITE = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript',
                '.json': 'application/json', '.webp': 'image/webp',
                '.png': 'image/png', '.css': 'text/css', '.mp4': 'video/mp4' };
const servirLeSite = async () => {
  const s = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { port: s.address().port, stop: () => s.close() };
};

/* Chaque page a son propre bouton d entree : l accueil et le hall portent la
   paire `.cx-wallet` / `.cx-mail`, la page de paris ses deux identifiants. On
   les nomme ici plutot que d en deviner un seul : deviner reviendrait a ne
   verifier que la page qu on a sous les yeux. */
const PAGES = [
  { f: 'index.html', porte: '.cx-wallet' },
  { f: 'games.html', porte: '.cx-wallet' },
];
/* ---- LA PAGE DE PARIS A SA PROPRE PORTE ----
 * Son « CONNECT WALLET » n ouvre pas celle de `stakebubble.js` : elle porte
 * ses propres panneaux, et `#connectBtn` ouvre `#box-email`. C est un autre
 * chemin, verifie plus bas — le confondre avec l autre aurait fait echouer
 * l essai sur un comportement correct, ce qui est arrive a sa premiere
 * version. */
const PARIS = { f: 'swogebet.html', porte: '#connectBtn', boite: 'box-email' };

(async () => {
  const site = await servirLeSite();
  const nav = await chromium.launch();

  console.log('\n-- la garde est dans le fichier qui dessine, pas dans les pages --');
  const source = fs.readFileSync(path.join(SITE, 'stakebubble.js'), 'utf8');
  ok(/\.swcon-ov button[^{]*\{pointer-events:auto/.test(source.replace(/'\s*\+\s*'/g, '')),
     'stakebubble.js rend cliquable ce qu il dessine : la page suivante qui'
     + ' adoptera la regle des maquettes sera couverte sans rien savoir');
  ok(/\.swb-scene:not\(\.on\) \*/.test(source.replace(/'\s*\+\s*'/g, '')),
     'et les calques encore fermes gardent leur garde — `pointer-events:none`'
     + ' sur un parent n empeche pas un enfant qui dit `auto` de recevoir le clic');

  for (const { f, porte } of PAGES) {
    console.log(`\n-- ${f} --`);
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    const err = []; p.on('pageerror', (e) => err.push(e.message));
    await p.goto(`http://127.0.0.1:${site.port}/${f}`, { waitUntil: 'load' });
    await p.waitForTimeout(1600);
    await p.evaluate(() => { const l = document.getElementById('preloader'); if (l) l.style.display = 'none'; });

    /* Le VRAI clic sur le bouton de la page. */
    await p.click(porte, { timeout: 8000 });
    await p.waitForTimeout(600);
    const ouverte = await p.evaluate(() => {
      const d = document.querySelector('.swcon-ov');
      return d ? { on: d.classList.contains('on'),
                   w: getComputedStyle(d.querySelector('.w')).pointerEvents,
                   e: getComputedStyle(d.querySelector('.e')).pointerEvents,
                   x: getComputedStyle(d.querySelector('.x')).pointerEvents } : null;
    });
    ok(!!ouverte && ouverte.on, `${f} : « ${porte} » ouvre la porte qui SIGNE`);
    if (!ouverte) { await ctx.close(); continue; }
    eq(ouverte.w, 'auto', `${f} : « Connect wallet » repond au doigt`);
    eq(ouverte.e, 'auto', `${f} : « Continue with email » aussi`);
    eq(ouverte.x, 'auto', `${f} : et « Cancel », sans quoi la porte ne se refermerait plus`);

    /* On PRESSE vraiment le bouton du courriel : s il etait mort, Playwright
       attendrait qu il devienne cliquable et finirait par renoncer. */
    let presse = true;
    try { await p.click('.swcon-ov .e[data-a="e"]', { timeout: 5000 }); }
    catch (e) { presse = false; }
    ok(presse, `${f} : le bouton du courriel se presse pour de vrai`);
    await p.waitForTimeout(300);
    const champ = await p.evaluate(() => {
      const m = document.querySelector('.swcon-ov .mail');
      return m ? getComputedStyle(m).display !== 'none' : false;
    });
    ok(champ, `${f} : et le champ de courriel apparait — le clic a bien porte`);

    /* Puis on referme, comme un visiteur qui se ravise. */
    let ferme = true;
    try { await p.click('.swcon-ov .x', { timeout: 5000 }); }
    catch (e) { ferme = false; }
    await p.waitForTimeout(300);
    const partie = await p.evaluate(() => {
      const d = document.querySelector('.swcon-ov');
      return !d || !d.classList.contains('on');
    });
    ok(ferme && partie, `${f} : « Cancel » referme la porte`);
    ok(err.length === 0, `${f} : aucune erreur de page${err.length ? ' — ' + err[0] : ''}`);
    await ctx.close();
  }

  /* ================== LA PREUVE PAR LE DEFAUT REMIS ==================
   * On remet la regle des maquettes sur les elements de la porte. Si l essai
   * ci-dessus passait aussi dans ces conditions, il ne protegerait de rien. */
  console.log('\n-- et sans la garde --');
  {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${site.port}/index.html`, { waitUntil: 'load' });
    await p.waitForTimeout(1600);
    await p.addStyleTag({ content: '.swcon-ov button{ pointer-events:none !important }' });
    await p.click('.cx-wallet', { timeout: 8000 });
    await p.waitForTimeout(500);
    const on = await p.evaluate(() =>
      !!document.querySelector('.swcon-ov.on'));
    ok(on, 'la porte s ouvre toujours — c est bien ce qui rendait le defaut invisible');
    let mort = false;
    try { await p.click('.swcon-ov .e[data-a="e"]', { timeout: 2500 }); }
    catch (e) { mort = true; }
    ok(mort, 'mais son bouton ne se presse plus : l essai ci-dessus le verrait');
    const parScript = await p.evaluate(() => {
      document.querySelector('.swcon-ov .e[data-a="e"]').click();
      const m = document.querySelector('.swcon-ov .mail');
      return m ? getComputedStyle(m).display !== 'none' : false;
    });
    ok(parScript,
       'alors qu un `.click()` lance par script PASSE quand meme — voila pourquoi'
       + ' six essais precedents n avaient rien vu');
    await ctx.close();
  }

  console.log(`\n-- ${PARIS.f} : sa porte a elle --`);
  {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    const err = []; p.on('pageerror', (e) => err.push(e.message));
    await p.goto(`http://127.0.0.1:${site.port}/${PARIS.f}`, { waitUntil: 'load' });
    await p.waitForTimeout(1600);
    await p.click(PARIS.porte, { timeout: 8000 });
    await p.waitForTimeout(600);
    const vu = await p.evaluate((id) => {
      const b = document.getElementById(id);
      if (!b || !b.classList.contains('show')) return null;
      const l = [...b.querySelectorAll('button, input, a.abtn')].map((e) => ({
        t: (e.textContent || e.placeholder || e.type || '').trim().slice(0, 22),
        pe: getComputedStyle(e).pointerEvents }));
      return { voile: !!document.querySelector('#ovl.show'), elements: l };
    }, PARIS.boite);
    ok(!!vu && vu.voile, `${PARIS.f} : « CONNECT WALLET » ouvre son panneau a elle`);
    if (vu) {
      const morts = vu.elements.filter((e) => e.pe === 'none');
      ok(morts.length === 0,
         morts.length
           ? `${PARIS.f} : ${morts.length} element(s) muet(s) : ${morts.map((m) => m.t).join(', ')}`
           : `${PARIS.f} : ses ${vu.elements.length} boutons et champs repondent tous au doigt`);
      /* Et l on en presse un pour de vrai. */
      let presse = true;
      try { await p.click(`#${PARIS.boite} [data-close]`, { timeout: 5000 }); }
      catch (e) { presse = false; }
      await p.waitForTimeout(300);
      const partie = await p.evaluate(() => !document.querySelector('#ovl.show'));
      ok(presse && partie, `${PARIS.f} : « Close » referme le panneau`);
    }
    ok(err.length === 0, `${PARIS.f} : aucune erreur de page${err.length ? ' — ' + err[0] : ''}`);
    await ctx.close();
  }

  await nav.close(); site.stop();
  console.log(`\nporte_clic.test.js : ${n} verifications, ${echecs} echec(s)`);
  process.exit(echecs ? 1 : 0);
})();
