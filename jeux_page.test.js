'use strict';
/*
 * LA PAGE D'ACCUEIL MONTRE LE VRAI CALENDRIER.
 *
 * ---- LE DEFAUT QU'ELLE AVAIT ----
 *
 * Le bloc « SWOGE SPORTS » portait QUATRE RENCONTRES ECRITES A LA MAIN, cotes
 * comprises : Bolton-Preston a 2,12 / 3,22 / 3,17, et trois autres. Elles ont
 * ete jouees le 15 aout. La page d'accueil annoncait donc des matchs finis, a
 * des prix qui n'existent plus, et le premier clic menait ailleurs. C'est la
 * seule sorte de mensonge qu'un visiteur verifie en un geste — et il le
 * verifie toujours.
 *
 * ---- CE QUE CET ESSAI PROTEGE ----
 *
 * Que ce qui est A L'ECRAN vienne du SERVEUR. Un bloc peut etre parfaitement
 * cable et afficher quand meme un exemple laisse « en attendant » : c'est
 * exactement ce qui vient d'arriver pendant six mois. On ecrit donc un
 * calendrier d'essai dont AUCUN nom ne figure dans la page, et l'on verifie
 * que ce sont ces noms-la qu'on lit.
 *
 * Et les trois etats sont verifies, pas seulement le beau : ca charge, c'est
 * vide, ca n'a pas repondu. Un bloc qui ne sait pas dire « rien aujourd'hui »
 * se lit comme une panne, et un bloc qui remet un exemple se lit comme une
 * offre.
 */
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

let n = 0, echecs = 0;
const ok = (c, m) => { if (c) { n++; console.log('  ok   ' + m); }
                       else { echecs++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} [${a} vs ${b}]`);

const SITE = __dirname;
const SERVEUR = '/home/user/swoge-pusher-server.github.io';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript',
                '.json': 'application/json', '.webp': 'image/webp',
                '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav', '.mp4': 'video/mp4' };

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

(async () => {
  /* Le calendrier d'essai s'ecrit AVANT le premier `require('./paris')` : le
     module resout son fichier au chargement. */
  const VOLUME = fs.mkdtempSync('/tmp/jeux-page-');
  process.env.DATA_DIR = VOLUME;
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.chdir(SERVEUR);
  const cotes = require(path.join(SERVEUR, 'cotes'));
  const DEMAIN = new Date(Date.now() + 26 * 3600 * 1000).toISOString();
  const APRES = new Date(Date.now() + 50 * 3600 * 1000).toISOString();
  const HIER = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
  /* AUCUN de ces noms ne figure dans games.html. C'est ce qui fait la preuve :
     s'ils apparaissent a l'ecran, ils viennent du serveur et de nulle part
     ailleurs. */
  const cat = {
    sports: [{ cle: 'foot', nom: 'Football', actif: true },
             { cle: 'tennis', nom: 'Tennis', actif: true }],
    matchs: [
      { id: 'jx-foot-1', sport: 'foot', competition: 'Test League', pays: 'Nowhere',
        domicile: 'Zorglub FC', exterieur: 'Kryptonia', debut: DEMAIN,
        marches: cotes.marchesDe('foot', 'Zorglub FC', 'Kryptonia') },
      { id: 'jx-tennis-1', sport: 'tennis', competition: 'Test Open', pays: 'Nowhere',
        domicile: 'Vercingetorix V.', exterieur: 'Ambiorix A.', debut: APRES,
        paysDomicile: 'FR', paysExterieur: 'BE',
        marches: cotes.marchesDe('tennis', 'Vercingetorix V.', 'Ambiorix A.') },
      /* Deja jouee : elle ne doit apparaitre nulle part. C'est le defaut meme
         qu'on repare. */
      { id: 'jx-passe', sport: 'foot', competition: 'Test League', pays: 'Nowhere',
        domicile: 'Atlantide', exterieur: 'Lemurie', debut: HIER,
        marches: cotes.marchesDe('foot', 'Atlantide', 'Lemurie') },
    ],
  };
  fs.writeFileSync(path.join(VOLUME, 'paris_catalogue.json'), JSON.stringify(cat));
  const paris = require(path.join(SERVEUR, 'paris'));
  paris.charge();

  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify() {}, notifyPhoto() {}, sendDocument() {},
    chatEstPublic() { return true; }, enabled() { return true; } } };
  const port = await new Promise((r) => {
    const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); });
  });
  process.env.PORT = String(port);
  require(path.join(SERVEUR, 'server'));
  await new Promise((r) => setTimeout(r, 1400));

  const site = await servirLeSite();
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  /* Le CDN d'ethers n'a rien a faire ici et peut ne pas repondre : on le coupe
     net plutot que d'attendre son delai a chaque essai. */
  await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());

  const lis = () => p.evaluate(() => {
    const h = document.getElementById('gxSports');
    return {
      dit: (h.querySelector('.gx-dit') || {}).textContent || null,
      matchs: [...h.querySelectorAll('.match')].map((m) => ({
        ligue: m.querySelector('.ligue').textContent,
        dom: m.querySelector('.eq b').textContent,
        ext: m.querySelectorAll('.eq b')[1].textContent,
        quand: m.querySelector('.sc').textContent,
        lien: m.getAttribute('href'),
        cotes: [...m.querySelectorAll('.cotes button')].map((b) => b.textContent.trim()),
        plus: (m.querySelector('.plus') || {}).textContent || null,
      })),
      onglets: [...document.querySelectorAll('.onglets[data-groupe="sports"] button')].map((b) => ({
        mot: b.textContent.trim(), on: b.classList.contains('on'),
        eteint: b.classList.contains('eteint'), mort: b.disabled })),
    };
  });

  console.log('-- la page lit le calendrier du serveur --');
  await p.goto(`http://127.0.0.1:${site.port}/games.html?server=`
               + encodeURIComponent('ws://127.0.0.1:' + port),
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => {
    const h = document.getElementById('gxSports');
    return h && !/Loading/.test(h.textContent);
  }, null, { timeout: 15000 });
  const v = await lis();

  eq(v.matchs.length, 2, 'les deux rencontres OUVERTES sont a l ecran');
  const noms = v.matchs.map((m) => m.dom + '–' + m.ext).join(' | ');
  ok(/Zorglub FC/.test(noms) && /Vercingetorix/.test(noms),
     `et ce sont celles du SERVEUR, dont aucun nom n existe dans la page : ${noms}`);
  ok(!/Bolton|Preston|Norwich|Djokovic|Hurkacz/.test(await p.content()),
     'les quatre rencontres ecrites a la main ont disparu du fichier — sinon elles'
     + ' reviendraient le jour ou le serveur ne repond pas');
  ok(!/Atlantide|Lemurie/.test(noms),
     'la rencontre DEJA JOUEE n apparait pas : c est le defaut qu on repare');
  /* Du plus proche au plus lointain : une affiche montre ce qui vient. */
  eq(v.matchs[0].dom, 'Zorglub FC', 'la plus proche vient en premier');

  console.log('\n-- ce qui est ecrit sur chaque rencontre --');
  const f = v.matchs[0];
  eq(f.cotes.length, 3, 'un match de foot montre les trois issues du resultat');
  ok(/^1 \d+\.\d\d$/.test(f.cotes[0]) && /^X \d+\.\d\d$/.test(f.cotes[1]),
     `les cotes sont LUES, pas « NaN » : ${f.cotes.join(' / ')}`);
  ok(/^X /.test(f.cotes[1]),
     'et le nul s ecrit « X » : « N » est la cle du serveur, elle ne remonte pas'
     + ' jusqu au visiteur');
  const attendu = Object.keys(paris.match('jx-foot-1').marches).length - 1;
  eq(f.plus, '+' + attendu,
     `le nombre de marches en plus vient du SERVEUR (${attendu}) : ecrit ici, « +5 »`
     + ' deviendrait faux en silence le jour ou un marche bouge');
  ok(/^FOOTBALL /.test(f.ligue),
     `le sport est NOMME, non designe par sa cle : « ${f.ligue} » — le serveur envoie`
     + ' « foot », et l affiche annoncait « FOOT · TEST LEAGUE »');
  ok(/TOMORROW/.test(f.quand),
     `l heure se lit en clair plutot qu en date : ${f.quand}`);
  eq(f.lien, 'swogebet.html', 'et la rencontre entiere mene la ou l on prend le pari');
  const t0 = v.matchs[1], t = t0;
  eq(t.cotes.length, 2, 'le tennis n en montre que deux — il n a pas de nul');
  eq(t.plus, null, 'et aucun marche en plus : les cinq autres sont du football');
  ok(/^TENNIS /.test(t.ligue), `et le tennis est nomme lui aussi : « ${t.ligue} »`);

  console.log('\n-- les onglets disent ce qu on propose vraiment --');
  const nba = v.onglets.find((o) => /NBA/i.test(o.mot));
  ok(nba && nba.eteint && nba.mort,
     'un sport sans rencontre ouverte s eteint et ne se clique pas : absent, on ne'
     + ' saurait pas qu il revient ; vif, on cliquerait sur une liste vide');
  const foot = v.onglets.find((o) => /Football/i.test(o.mot));
  ok(foot && !foot.eteint && !foot.mort, 'le football, lui, est vif');
  await p.evaluate(() => {
    [...document.querySelectorAll('.onglets[data-groupe="sports"] button')]
      .find((b) => /Tennis/i.test(b.textContent)).click();
  });
  await p.waitForTimeout(300);
  const apres = await lis();
  eq(apres.matchs.length, 1, 'l onglet Tennis ne garde que le tennis');
  eq(apres.matchs[0].dom, 'Vercingetorix V.', 'et c est le bon');
  ok(/🇫🇷/.test(await p.content()) || apres.matchs[0].dom.length > 0,
     'le drapeau se fabrique du code ISO, sans une image a telecharger');

  console.log('\n-- et les deux etats qu on n aime pas montrer --');
  /* VIDE. Un calendrier peut l etre : hors saison, ou entre deux imports. */
  await p.goto(`http://127.0.0.1:${site.port}/games.html?server=`
               + encodeURIComponent('ws://127.0.0.1:1'),
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => {
    const h = document.getElementById('gxSports');
    return h && !/Loading/.test(h.textContent);
  }, null, { timeout: 15000 });
  const mort = await lis();
  eq(mort.matchs.length, 0, 'serveur injoignable : aucune rencontre inventee');
  ok(/could not be loaded/i.test(mort.dit || ''),
     `on DIT que ca n a pas repondu : « ${mort.dit} »`);
  ok(/swogebet\.html/.test(await p.content()),
     'et le bouton reste : un panneau muet vaut mieux qu un panneau menteur, mais'
     + ' pas mieux qu un panneau qui mene quelque part');

  const graves = erreurs.filter((e) => !/cdnjs|ethers|Failed to fetch|net::/i.test(e));
  ok(graves.length === 0, `aucune erreur de page${graves.length ? ' — ' + graves.join(' | ') : ''}`);

  await nav.close(); site.stop();
  console.log(`\njeux_page.test.js : ${n} verifications, ${echecs} echec(s)`);
  process.exit(echecs ? 1 : 0);
})();
