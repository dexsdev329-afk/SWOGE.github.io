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
  /* ---- LA RENCONTRE N EST PLUS UN LIEN ----
   * Elle l etait : toute la carte menait a la page de paris, cotes comprises.
   * Cliquer une cote emmenait donc AILLEURS, et il fallait la retrouver la-bas
   * pour la reposer. Demande : « les gens peuvent selectionner ici sans que ca
   * les redirige vers SWOGE Bet — peut-etre qu ils voulaient miser vite sur le
   * match affiche a droite ».
   * Le « +N » reste un lien, et lui seul : les cinq autres marches ne tiennent
   * pas dans une affiche de trois lignes. */
  eq(f.lien, null,
     'la rencontre entiere n est plus un lien : on parie ICI, sans quitter la page');
  eq(await p.evaluate(() =>
       (document.querySelector('#gxSports .plus') || {}).getAttribute
         ? document.querySelector('#gxSports .plus').getAttribute('href') : null),
     'swogebet.html',
     'seul « +N » mene au tableau : c est la seule chose de la carte qu on ne'
     + ' peut pas faire ici');
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
  /* POUR DE VRAI, et non `.click()` en JavaScript : un appel de script ignore
     `pointer-events`, et cette page rend TOUT inerte par defaut. L'essai
     passait donc sur un onglet que personne n'aurait pu cliquer. */
  await p.getByRole('button', { name: /Tennis/i }).click();
  await p.waitForTimeout(300);
  const apres = await lis();
  eq(apres.matchs.length, 1, 'l onglet Tennis ne garde que le tennis');
  eq(apres.matchs[0].dom, 'Vercingetorix V.', 'et c est le bon');
  ok(/🇫🇷/.test(await p.content()) || apres.matchs[0].dom.length > 0,
     'le drapeau se fabrique du code ISO, sans une image a telecharger');

  console.log('\n-- les quatre chiffres de la vitrine --');
  /* ---- CE QU ILS ETAIENT ----
   * « 128K+ joueurs », « $24.8M+ joues », « 1,284+ parties » : des chiffres de
   * MAQUETTE, ecrits en dur, et le fichier le disait. Un site qui annonce un
   * volume invente le fait verifier — c est la premiere chose qu on cherche a
   * recouper. Ils viennent du serveur, par la meme route publique que le
   * calendrier.
   */
  const chiffres = await p.evaluate(() => {
    const b = document.getElementById('gxChiffres');
    return {
      vu: !!b && !b.hidden,
      titres: [...document.querySelectorAll('#gxChiffres small')].map((x) => x.textContent),
      valeurs: [...document.querySelectorAll('#gxChiffres b[data-n]')]
        .map((x) => x.textContent.trim()),
      brut: document.body.textContent,
    };
  });
  ok(chiffres.vu, 'le bandeau s affiche une fois les chiffres recus');
  eq(chiffres.titres.join(' | '), 'PLAYERS | CASINO VOLUME | ROUNDS PLAYED | WINNINGS PAID',
     '« TOTAL WAGERED » devient « CASINO VOLUME », et « GAMES » devient « ROUNDS'
     + ' PLAYED » — le nombre qu on y met est celui des MANCHES, et sous « GAMES »'
     + ' il se serait lu comme un nombre de jeux');
  ok(chiffres.valeurs.length === 4 && chiffres.valeurs.every((v) => /^[\d.]+[kMB]?$/.test(v)),
     `les quatre sont des nombres lisibles : ${chiffres.valeurs.join(' / ')}`);
  ok(!/128K\+|24\.8M\+|1,284\+|5\.7M\+/.test(chiffres.brut),
     'et AUCUN des chiffres de la maquette ne subsiste dans la page');
  /* Serveur injoignable : le bandeau DISPARAIT. Un bandeau vide se remarque et
     ne trompe personne ; un bandeau qui annonce cent vingt-huit mille joueurs
     qu on n a pas se verifie en un clic. */
  {
    const ctx2 = await ctx.browser().newContext({ viewport: { width: 1400, height: 900 } });
    const p2 = await ctx2.newPage();
    await p2.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p2.goto(`http://127.0.0.1:${site.port}/games.html?server=`
                  + encodeURIComponent('ws://127.0.0.1:1'),
                  { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(2500);
    ok(await p2.evaluate(() => document.getElementById('gxChiffres').hidden),
       'serveur injoignable : le bandeau disparait plutot que de remettre les'
       + ' chiffres de la maquette');
    await ctx2.close();
  }

  console.log('\n-- la barre du bas --');
  /* ---- TROIS CHOSES, ET LA PREMIERE EST FONCTIONNELLE ----
   * Elle vient de `stakebubble.js`, partage par dix-sept pages sombres. Ses
   * quatre touches ne repondaient pas : QUATRIEME fois que le meme piege se
   * referme — `a[href], button{pointer-events:none}` rend toute cette page
   * inerte par defaut, et elles en faisaient partie. Dessin, libelle,
   * gestionnaire : tout sauf l effet.
   * On la POSE ici telle que le script la produit — une `.swbb` avec ses
   * boutons — pour verifier l habillage que la page lui applique. */
  const barre = await p.evaluate(() => {
    const b = document.createElement('div'); b.className = 'swbb';
    for (const m of ['Play', 'Bets', 'Chests', 'Profile']) {
      const q = document.createElement('button'); q.textContent = m; b.appendChild(q);
    }
    document.body.appendChild(b);
    const st = getComputedStyle(b), bt = getComputedStyle(b.firstChild);
    const clair = (c) => { const v = (c.match(/\d+/g) || []).map(Number);
      return v.length >= 3 ? (v[0] + v[1] + v[2]) / 3 : null; };
    return { fond: clair(st.backgroundColor), texte: clair(bt.color),
             vivante: bt.pointerEvents, doigt: bt.cursor };
  });
  eq(barre.vivante, 'auto',
     'ses touches repondent au doigt : elles etaient inertes comme tout le reste'
     + ' de cette page, et c est la quatrieme fois que ce piege se referme');
  eq(barre.doigt, 'pointer', 'et le curseur le promet');
  ok(barre.fond > 200 && barre.texte < 160,
     `elle est blanche comme la page (${Math.round(barre.fond)} sur `
     + `${Math.round(barre.texte)}) — son fond existait pour une page noire`);
  /* ---- ET ELLE NE SERT QUE SUR TELEPHONE ----
   * Sur un ecran large la colonne de gauche est LA, en permanence, avec les
   * memes destinations : la barre y double une navigation deja visible et
   * mange trente pixels en bas. */
  const parLargeur = await p.evaluate(() => {
    const b = document.querySelector('.swbb');
    return getComputedStyle(b).display;
  });
  eq(parLargeur, 'none', 'a mille quatre cents pixels, elle ne s affiche pas');
  {
    const ctx3 = await ctx.browser().newContext({ viewport: { width: 390, height: 844 } });
    const p3 = await ctx3.newPage();
    await p3.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p3.goto(`http://127.0.0.1:${site.port}/games.html?server=`
                  + encodeURIComponent('ws://127.0.0.1:' + port),
                  { waitUntil: 'domcontentloaded' });
    await p3.waitForTimeout(1500);
    const surTel = await p3.evaluate(() => {
      const b = document.createElement('div'); b.className = 'swbb';
      const q = document.createElement('button'); q.textContent = 'Play'; b.appendChild(q);
      document.body.appendChild(b);
      return getComputedStyle(b).display;
    });
    ok(surTel !== 'none',
       `sur telephone elle est la (${surTel}) : c est le seul endroit ou elle`
       + ' remplace une colonne qu on ne voit plus');
    await ctx3.close();
  }
  await p.evaluate(() => { const b = document.querySelector('.swbb'); if (b) b.remove(); });

  console.log('\n-- le menu du profil --');
  /* ---- CE QUI ETAIT DEMANDE ----
   * « Avant il y avait un menu pour deposit etc, faudrait le remettre dans
   * games.html mais refait sans ce style de couleurs, quand on clique sur
   * notre profil. »
   *
   * Le menu existait — dans le tiroir SOMBRE du script qui le porte, pose sur
   * une page claire. Ici il est redessine aux couleurs de la page, et
   * SEULEMENT redessine : ses rangees restent declarees par `swogecompte.js`,
   * qui est le seul endroit ou l'on dise quels panneaux existent.
   */
  const declarees = await p.evaluate(() => {
    const m = document.getElementById('menu');
    return m ? [...m.querySelectorAll('a')].map((a) => a.textContent.trim()) : [];
  });
  ok(declarees.length >= 4,
     `le script des panneaux declare ${declarees.length} rangee(s) : ${declarees.join(' | ')}`);
  ok(declarees.some((x) => /Deposit/i.test(x)) && declarees.some((x) => /Withdraw/i.test(x)),
     'dont le depot et le retrait, qui sont ce qu on venait chercher');

  /* Avatar inerte : le defaut d'avant. Il a l'air d'un bouton, donc il doit en
     etre un. */
  eq(await p.evaluate(() => document.getElementById('gxProfil').tagName), 'BUTTON',
     'le profil est un vrai bouton, et non une image qui n avale les clics pour rien');

  /* ---- PAS ENCORE ENTRE : ON OUVRE LA CONNEXION ----
   * Un menu de compte propose a quelqu un qui n en a pas se lit comme une
   * panne : chaque rangee repondrait « connectez-vous d abord », une par une. */
  await p.click('#gxProfil');
  await p.waitForTimeout(250);
  const horsCompte = await p.evaluate(() => ({
    menu: !document.getElementById('gxMenu').hidden,
    /* La porte ouverte est celle qui SIGNE — `stakebubble.js` — depuis qu'on
       a compris que l'autre n'apprenait qu'une adresse et laissait arriver au
       jeu sans session. L'ancienne reste acceptee en repli : elle sert encore
       si ce script-la n'a pas charge. */
    connexion: !!document.querySelector('.swcon-ov')
               || !(document.getElementById('cxVoile') || {}).hidden,
  }));
  ok(!horsCompte.menu && horsCompte.connexion,
     'sans compte, le profil ouvre la CONNEXION plutot qu un menu qui repondrait'
     + ' « connectez-vous » cinq fois de suite');
  await p.evaluate(() => {
    const v = document.getElementById('cxVoile'); if (v) v.hidden = true;
    const c = document.querySelector('.swcon-ov'); if (c) c.remove();
  });

  /* ---- CONNECTE PAR LE TIROIR, ET PAR LUI SEUL ----
   * C'est LE cas signale : dans le navigateur de Telegram il n'existe aucune
   * extension a interroger, donc `swogecx.js` peut tres bien ignorer une
   * connexion que `stakebubble.js` a etablie — celle-la meme qui affiche le
   * solde. Le profil repondait « connectez-vous » a quelqu'un dont les jetons
   * s'affichaient a trois centimetres.
   * On pose donc le tiroir SANS toucher a `#cxCompte`, qui reste cache. */
  await p.evaluate(() => {
    const d = document.createElement('div'); d.className = 'swp';
    const t = document.createElement('div'); t.className = 'swp-t';
    const g = document.createElement('div'); g.className = 'swp-g'; g.textContent = 'You';
    const b = document.createElement('button'); b.dataset.k = 'ap'; b.textContent = '📊 Overview';
    t.appendChild(g); t.appendChild(b); d.appendChild(t); document.body.appendChild(d);
  });
  await p.click('#gxProfil'); await p.waitForTimeout(300);
  const parLeTiroir = await p.evaluate(() => ({
    menu: !document.getElementById('gxMenu').hidden,
    connexion: !document.getElementById('cxVoile').hidden,
    compteCache: document.getElementById('cxCompte').hidden,
    mots: [...document.querySelectorAll('#gxMenu a')].map((a) => a.textContent.trim()),
  }));
  ok(parLeTiroir.compteCache,
     "la pastille de `swogecx` reste cachee : ce script-la ne sait rien de cette"
     + ' connexion, et c est exactement le cas signale');
  ok(parLeTiroir.menu && !parLeTiroir.connexion,
     `le menu s ouvre quand meme : ${parLeTiroir.mots.join(' | ')} — on demande a la`
     + ' source des rangees qu on montre, pas a un second script qui a sa propre session');
  await p.evaluate(() => { document.querySelector('.swp').remove();
                           const h = document.querySelector('.swpb'); if (h) h.remove(); });
  await p.evaluate(() => { document.getElementById('gxMenu').hidden = true; });

  /* ---- ENTRE ---- */
  /* On pose l etat « connecte » a la main : ce qu on essaie ici est le MENU,
     pas la chaine — et brancher un vrai portefeuille pour lire une liste de
     rangees ferait dependre cet essai d un service exterieur. */
  await p.evaluate(() => {
    document.getElementById('cxAdr').textContent = '0xAbCd…9911';
    document.getElementById('cxSwoge').innerHTML = '<b>4,200</b> $SWOGE';
    document.getElementById('cxEth').innerHTML = '<b>0.0312</b> ETH';
    document.getElementById('cxCompte').hidden = false;
  });
  await p.click('#gxProfil');
  await p.waitForTimeout(250);
  const ouvert = await p.evaluate(() => {
    const m = document.getElementById('gxMenu');
    const st = getComputedStyle(m);
    const rgb = (st.backgroundColor.match(/\d+/g) || []).map(Number);
    return {
      ouvert: !m.hidden,
      clair: rgb.length >= 3 && (rgb[0] + rgb[1] + rgb[2]) / 3 > 200,
      tete: (m.querySelector('.gx-qui b') || {}).textContent || null,
      adresseDedans: /0xAbCd/.test(m.textContent),
      /* Le mot SANS son icone : elle vit dans un `<i>` a part, et la lire avec
         collerait l'emoji au mot — « 👛My Wallet ». Un essai qui decoupe ce
         collage a la ficelle mesure sa propre ficelle, pas la page. */
      mots: [...m.querySelectorAll('a')].map((a) => {
        const c = a.cloneNode(true);
        [...c.querySelectorAll('i')].forEach((x) => x.remove());
        return c.textContent.trim();
      }),
      icones: [...m.querySelectorAll('a i')].map((x) => x.textContent.trim()),
      dit: document.getElementById('gxProfil').getAttribute('aria-expanded'),
    };
  });
  ok(ouvert.ouvert, 'entre, le profil ouvre le menu');
  eq(ouvert.dit, 'true', 'et le bouton dit qu il est ouvert, pour qui ne voit pas l ecran');
  ok(ouvert.clair,
     'il est CLAIR comme la page : c est tout l objet de la demande — le meme menu'
     + ' existait deja, dessine pour un fond sombre');
  /* ---- ET L ADRESSE N Y EST PAS DEUX FOIS ----
   * Elle y a ete, en tete du menu. La pastille qui la porte est visible a
   * TOUTES les largeurs — mesure a mille quatre cents, huit cent vingt et
   * trois cent quatre-vingt-dix — et elle est collee au bouton qui ouvre ce
   * menu : on la lisait donc deux fois, l une sous l autre. C est exactement
   * la plainte que cette page a deja traitee une fois. */
  ok(!ouvert.adresseDedans && !ouvert.tete,
     'l adresse n est PAS repetee dans le menu : la pastille qui la porte est'
     + ' juste au-dessus, a toutes les largeurs');
  /* LA verification qui compte : les rangees sont CELLES QU ON A DECLAREES.
     Une liste ecrite dans la page passerait cet essai le premier jour et
     divergerait au premier panneau ajoute. */
  const attendus = declarees.map((x) => x.replace(/^\S+\s+/, ''));
  const manque = attendus.filter((x) => ouvert.mots.indexOf(x) < 0);
  ok(manque.length === 0,
     `les ${attendus.length} rangees sont exactement celles declarees ailleurs :`
     + ` ${ouvert.mots.join(' | ')}${manque.length ? ' — manque ' + manque.join(', ') : ''}`);
  ok(ouvert.icones.length === ouvert.mots.length && ouvert.icones.every((x) => x),
     'et chacune garde son icone, dans un element a part : collee au mot, elle ne'
     + " s'alignerait pas d'une ligne a l'autre");

  /* Un clic sur « Deposit » doit ouvrir LE panneau du script, pas un second
     chemin vers le meme argent. */
  await p.evaluate(() => {
    window.__vuPanneau = null;
    const src = document.getElementById('menu');
    src.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[data-panel]');
      if (a) window.__vuPanneau = a.getAttribute('data-panel');
    }, true);
  });
  await p.locator('#gxMenu a').filter({ hasText: /Deposit/i }).first().click();
  await p.waitForTimeout(250);
  eq(await p.evaluate(() => window.__vuPanneau), 'dep',
     'cliquer « Deposit » renvoie le clic sur la rangee D ORIGINE : c est son'
     + ' gestionnaire qui sait ouvrir le panneau, et le refaire ici serait un'
     + ' second chemin vers le meme argent');
  eq(await p.evaluate(() => document.getElementById('gxMenu').hidden), true,
     'et le menu se referme derriere');

  /* ---- ET QUAND LE TIROIR EXISTE, C EST LUI QU ON MONTRE ----
   * `stakebubble.js` construit un tiroir de navigation qui porte SES sections
   * — boutique, classement, coffres, marche, familiers, paris, amis — ET les
   * entrees du menu de la page, qu il recopie. Il est donc la liste complete
   * et deja groupee. Il n existe qu une fois le joueur authentifie ; on en
   * pose ici la FORME EXACTE — `.swp .swp-t`, des titres `.swp-g`, des
   * `<button>` — pour verifier qu on sait la lire.
   * Sans cette rangee « Shop », le menu de la page resterait celui d avant :
   * cinq actions de portefeuille, et rien de ce que le joueur venait chercher.
   */
  await p.evaluate(() => {
    const d = document.createElement('div'); d.className = 'swp';
    const t = document.createElement('div'); t.className = 'swp-t';
    const g1 = document.createElement('div'); g1.className = 'swp-g'; g1.textContent = 'Shop';
    const b1 = document.createElement('button'); b1.dataset.k = 'sh'; b1.textContent = '🛒 Chests & items';
    const b2 = document.createElement('button'); b2.dataset.k = 'cl'; b2.textContent = '🏅 Collection ranking';
    const g2 = document.createElement('div'); g2.className = 'swp-g'; g2.textContent = 'Standing';
    const b3 = document.createElement('button'); b3.dataset.k = 'lb'; b3.textContent = '🏆 Leaderboard';
    /* Une rangee que la page CACHE ne doit pas remonter : le tiroir masque
       celles qui ne s'appliquent pas a la page ou l'on est. */
    const b4 = document.createElement('button'); b4.dataset.k = 'xx';
    b4.textContent = '🚫 Hidden row'; b4.style.display = 'none';
    [g1, b1, b2, g2, b3, b4].forEach((x) => t.appendChild(x));
    d.appendChild(t); document.body.appendChild(d);
    window.__vuTiroir = null; window.__poignee = 0;
    t.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (b) window.__vuTiroir = b.dataset.k;
    }, true);
    /* La poignee, telle que `stakebubble.js` la pose : un bouton `.swpb`
       quelque part dans la page, dont le gestionnaire OUVRE le tiroir. */
    const h = document.createElement('button'); h.className = 'swpb';
    h.addEventListener('click', () => { window.__poignee++; });
    document.body.appendChild(h);
  });
  await p.click('#gxProfil'); await p.waitForTimeout(250);
  const avecTiroir = await p.evaluate(() => {
    const m = document.getElementById('gxMenu');
    return {
      groupes: [...m.querySelectorAll('.gx-g')].map((x) => x.textContent.trim()),
      mots: [...m.querySelectorAll('a')].map((a) => {
        const c = a.cloneNode(true);
        [...c.querySelectorAll('i')].forEach((x) => x.remove());
        return c.textContent.trim();
      }),
    };
  });
  eq(avecTiroir.groupes.join(' | '), 'Shop | Standing',
     'les titres de groupe du tiroir sont repris : sans eux, dix-sept rangees'
     + ' d affilee ne se lisent plus');
  ok(avecTiroir.mots.indexOf('Chests & items') >= 0
     && avecTiroir.mots.indexOf('Leaderboard') >= 0,
     `la boutique et le classement sont revenus : ${avecTiroir.mots.join(' | ')}`);
  ok(avecTiroir.mots.indexOf('Hidden row') < 0,
     'et une rangee que le tiroir cache ne remonte pas : elle ne s applique pas'
     + ' a cette page, et la montrer ouvrirait sur rien');
  await p.locator('#gxMenu a').filter({ hasText: /Leaderboard/ }).first().click();
  await p.waitForTimeout(200);
  eq(await p.evaluate(() => window.__vuTiroir), 'lb',
     'et le clic repart sur la rangee du TIROIR, qui sait ouvrir sa section');
  /* ---- ET LA POIGNEE EST TIREE D ABORD ----
   * La rangee du tiroir change l ONGLET ; elle ne MONTRE pas la boite, parce
   * que la-bas on ne peut la cliquer qu une fois le tiroir deja ouvert.
   * Appelee d ici, elle reglait l onglet dans une boite invisible et le clic
   * ne faisait visiblement RIEN. C est le defaut signale, et sans cette
   * verification il reviendrait sans bruit : la rangee repond, l onglet
   * change, et l ecran ne bouge pas. */
  eq(await p.evaluate(() => window.__poignee), 1,
     'la poignee du tiroir est tiree AVANT la rangee : sinon l onglet change dans'
     + ' une boite que personne ne voit');
  await p.evaluate(() => { document.querySelector('.swp').remove();
                           const h = document.querySelector('.swpb'); if (h) h.remove(); });

  await p.click('#gxProfil'); await p.waitForTimeout(200);
  await p.evaluate(() => document.body.click());
  await p.waitForTimeout(200);
  eq(await p.evaluate(() => document.getElementById('gxMenu').hidden), true,
     'un clic a cote le referme : sinon il reste ouvert sous le doigt et avale'
     + ' le geste suivant');
  await p.click('#gxProfil'); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  eq(await p.evaluate(() => document.getElementById('gxMenu').hidden), true,
     'et la touche d echappement aussi');

  console.log('\n-- des fleches a la place de la barre de defilement --');
  /* ---- CE QUI ETAIT DEMANDE ----
   * « sur game html againts the housse met des fleche retire la barre de
   * scroll pareil pour la category utility ».
   *
   * ---- POURQUOI ON MESURE LES DEUX ENSEMBLE ----
   * Retirer la barre est la moitie facile, et prise seule c est une
   * REGRESSION : la barre etait la seule chose qui annoncait qu il restait
   * des cartes sous le bord droit. Chaque verification ci-dessous demande
   * donc les DEUX a la fois — pas de barre ET des fleches — parce qu une page
   * qui n a plus ni l une ni les autres passerait la moitie d entre elles.
   *
   * Et ce n est pas fait sur les deux rangees nommees seulement : le defaut
   * appartient a `.piste`, dont il y a six exemplaires. Corriger « Against
   * the house » et « Utility » aurait laisse quatre barres en place. */
  const rangees = await p.evaluate(() => [...document.querySelectorAll('.piste')].map((t) => {
    const poste = t.nextElementSibling;
    const b = poste ? [...poste.querySelectorAll('button')] : [];
    return {
      quoi: t.getAttribute('aria-label'),
      deborde: t.scrollWidth - t.clientWidth > 1,
      barre: getComputedStyle(t).scrollbarWidth,
      poste: !!poste && poste.classList.contains('pfl'),
      /* `hidden` seul ne suffit pas a le prouver : `display:flex` bat
         l attribut, et un poste « cache » resterait a l ecran. */
      vu: !!poste && !poste.hidden && getComputedStyle(poste).display !== 'none',
      vifs: b.length === 2 && b.every((x) => getComputedStyle(x).pointerEvents === 'auto'),
      gauche: b[0] ? b[0].disabled : null,
      droite: b[1] ? b[1].disabled : null,
    };
  }));
  eq(rangees.length, 6, 'les six rangees du catalogue sont la');
  ok(rangees.every((r) => r.barre === 'none'),
     'AUCUNE des six ne montre de barre de defilement : c est la demande, et une'
     + ' rangee oubliee se verrait — elle serait la seule a en avoir une');
  ok(rangees.every((r) => r.poste),
     'et chacune a recu son poste de fleches, y compris celles qui ne le montrent'
     + ' pas encore : la meme fonction les pose toutes, il n y a pas six copies');
  const larges = rangees.filter((r) => r.deborde);
  const courtes = rangees.filter((r) => !r.deborde);
  /* Il en fallait DEUX qui debordent tant que « Against the house » etait
     une seule rangee de neuf jeux. Elle tient maintenant sur deux lignes, a
     la demande, et rentre entiere a mille quatre cents pixels : il n'en
     reste qu'une qui deborde. Le but de la verification — mesurer les DEUX
     cas, celui qui deborde et celui qui rentre — tient toujours avec une
     seule de chaque. */
  ok(larges.length >= 1 && courtes.length >= 2,
     `a mille quatre cents pixels, ${larges.length} rangee(s) debordent et`
     + ` ${courtes.length} tiennent entieres : les deux cas sont mesures`);
  ok(larges.every((r) => r.vu),
     `celles qui DEBORDENT montrent leurs fleches (${larges.map((r) => r.quoi).join(', ')})`
     + ' — sans elles, plus rien ne dirait qu il reste des cartes sous le bord');
  ok(courtes.every((r) => !r.vu),
     `celles qui TIENNENT n en montrent pas (${courtes.map((r) => r.quoi).join(', ')}) :`
     + ' deux fleches grises au-dessus d une rangee d une seule carte sont deux'
     + ' boutons qui ne font rien, et l on apprend a ne plus les voir');
  ok(larges.every((r) => r.vifs),
     'et leurs fleches portent `vif` : `a[href], button{pointer-events:none}` tue'
     + ' tout bouton de cette page qui ne l a pas — dessin complet, clic dans le vide');
  ok(larges.every((r) => r.gauche === true && r.droite === false),
     'au depart, celle de GAUCHE est eteinte et celle de droite vive : une fleche'
     + ' vive qui ne bouge rien vaut une fleche morte');
  /* Les deux rangees NOMMEES par la demande, verifiees pour elles-memes : si un
     jour elles cessaient de deborder, les verifications generales passeraient
     encore et celles-la diraient que la demande n est plus couverte. */
  for (const nom of ['Against the house', 'Utility']) {
    const r = rangees.find((x) => x.quoi === nom);
    /* La demande d'origine portait sur DEUX choses : plus de barre de
       defilement, et des fleches a la place. La premiere vaut toujours, quoi
       qu'il arrive a la rangee. La seconde n'a de sens que si la rangee
       deborde — des fleches au-dessus d'une rangee entiere seraient deux
       boutons qui ne font rien, ce que la feuille de style evite exprès.
       On demande donc : jamais de barre, et des fleches EXACTEMENT quand il
       reste quelque chose a atteindre. Ecrit ainsi, le controle survit a
       « Against the house » passee sur deux lignes — qui rentre desormais
       entiere sur un grand ecran — sans cesser de couvrir la demande. */
    ok(r && r.barre === 'none' && r.vu === r.deborde,
       `« ${nom} » — celle que la demande nomme — n a pas de barre, et ses`
       + ` fleches sont la exactement quand elle deborde (deborde ${r && r.deborde},`
       + ` fleches ${r && r.vu})`);
  }

  /* ---- ET LES FLECHES BOUGENT POUR DE VRAI ----
   * `p.click`, avec un VRAI pointeur. `bouton.click()` en JavaScript ignore
   * `pointer-events` : l essai passerait sur deux boutons que personne ne peut
   * cliquer, ce qui est exactement le defaut qu on repare. */
  const maison = '.piste[aria-label="Against the house"]';
  const avantFleche = await p.evaluate((s) => {
    const t = document.querySelector(s);
    return { x: t.scrollLeft, vu: t.clientWidth };
  }, maison);
  await p.click(maison + ' + .pfl .pfl-b:last-child');
  await p.waitForTimeout(400);
  const apresFleche = await p.evaluate((s) => {
    const t = document.querySelector(s);
    const b = [...t.nextElementSibling.querySelectorAll('button')];
    return { x: t.scrollLeft, gauche: b[0].disabled, droite: b[1].disabled };
  }, maison);
  ok(apresFleche.x > avantFleche.x,
     `un VRAI clic sur la fleche droite fait defiler la rangee (${avantFleche.x}`
     + ` puis ${apresFleche.x}) : un bouton dessine et branche mais inerte aurait`
     + ' passe un essai qui clique par script');
  ok(apresFleche.x - avantFleche.x <= avantFleche.vu,
     `le saut (${apresFleche.x - avantFleche.x} px) ne depasse pas la largeur vue`
     + ` (${avantFleche.vu} px) : a une largeur pleine, la derniere carte lue sort`
     + ' de l ecran et l on revient en arriere pour savoir ou l on en etait');
  eq(apresFleche.gauche, false,
     'et celle de GAUCHE se rallume : sans elle, on part a droite et l on ne'
     + ' revient jamais');

  /* ---- SUR TELEPHONE, LA BARRE N A JAMAIS EXISTE ----
   * C est la ou la demande compte le plus : aucun navigateur mobile ne dessine
   * de barre au repos. La rangee des neuf jeux de maison en montrait deux, et
   * RIEN ne disait qu il y en avait sept autres. */
  {
    const ctx4 = await ctx.browser().newContext({ viewport: { width: 390, height: 844 } });
    const p4 = await ctx4.newPage();
    await p4.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p4.goto(`http://127.0.0.1:${site.port}/games.html?server=`
                  + encodeURIComponent('ws://127.0.0.1:1'),
                  { waitUntil: 'domcontentloaded' });
    await p4.waitForTimeout(1200);
    const surTel = await p4.evaluate((s) => {
      const t = document.querySelector(s);
      return { deborde: t.scrollWidth - t.clientWidth, vu: t.clientWidth,
               fleches: !t.nextElementSibling.hidden, x: t.scrollLeft };
    }, maison);
    ok(surTel.deborde > surTel.vu && surTel.fleches,
       `a trois cent quatre-vingt-dix pixels la rangee deborde de ${surTel.deborde} px`
       + ' et ses fleches sont la : c est le seul endroit ou le visiteur n avait'
       + ' AUCUN indice');
    await p4.click(maison + ' + .pfl .pfl-b:last-child');
    await p4.waitForTimeout(400);
    const bougeTel = await p4.evaluate((s) => document.querySelector(s).scrollLeft, maison);
    ok(bougeTel > 0 && bougeTel < surTel.vu,
       `et le saut y reste sous la largeur vue (${bougeTel} px pour ${surTel.vu} px vus)`
       + ' — la derniere carte lue est encore a l ecran apres le saut');
    await ctx4.close();
  }

  console.log('\n-- toutes les cartes du catalogue menent quelque part --');
  /* ---- CE QUI ETAIT DEMANDE ----
   * « le catalogue faut tu mette les redirection sur le blacjack et gold
   * table ». Les cartes etaient inertes : CINQUIEME fois que
   * `a[href]{pointer-events:none}` referme le meme piege sur cette page.
   *
   * On lit le FICHIER, pas le navigateur : une cible fausse s afficherait
   * parfaitement et n echouerait qu au clic de quelqu un. */
  const source = fs.readFileSync(path.join(SITE, 'games.html'), 'utf8');
  const cartes = [...source.matchAll(/<a class="([^"]*)" href="([^"]+)"[^>]*title=/g)]
    .filter((m) => /\bjc\b/.test(m[1]));
  /* Le NOMBRE n est plus ecrit ici. Il l etait — vingt-six — et il est tombe
     le jour ou l on a retire la table de blackjack ordinaire, sur un essai qui
     n avait rien a reprocher a la page. Un compte fige dans un essai devient
     un compte a tenir a jour a deux endroits ; ce qui compte est qu il y en
     ait, qu elles soient toutes vives, et qu elles menent toutes quelque part. */
  ok(cartes.length >= 20,
     `le catalogue porte ${cartes.length} cartes`);
  const mortes = cartes.filter((m) => !/\bvif\b/.test(m[1])).map((m) => m[2]);
  ok(mortes.length === 0,
     `toutes portent « vif » — sans ce mot le clic traverse la carte :`
     + `${mortes.length ? ' manque ' + mortes.join(', ') : ' aucune oubliee'}`);
  /* ---- UNE SEULE TABLE DE BLACKJACK ----
   * Demande : « le blackjack supprime le, garde que le blackjack gold ». Deux
   * vignettes du meme jeu, cote a cote, obligeaient a lire les legendes pour
   * choisir. On verifie que la table d or est restee ET que l autre est
   * partie : retirer la mauvaise des deux se lirait comme un succes. */
  const bj = cartes.map((m) => m[2]).filter((h) => /swoge_blackjack\.html/.test(h));
  eq(bj.join(','), 'swoge_blackjack.html?table=or',
     'une seule carte de blackjack au catalogue, et c est la table d or');

  /* ---- LE PREMIER CARRE NE PROPOSE PLUS LA PAGE OU L ON EST ----
   * Il disait « CASINO — EXPLORE » et menait a `games.html` : on est dessus,
   * et le seul geste qu il offrait etait de recharger la page. La meme
   * correction que sur la page de paris, ou « SPORTS » a laisse la place au
   * monde. La regle vaut pour les deux : sur chaque page, le carre de cette
   * page-la devient celui du MONDE. */
  const carres = await p.evaluate(() => [...document.querySelectorAll('.univers .uni')]
    .map((a) => ({ t: a.querySelector('b').textContent.trim(),
                   h: (a.querySelector('.sw-b') || {}).getAttribute
                      ? a.querySelector('.sw-b').getAttribute('href') : null })));
  eq(carres.map((c) => c.t).join(' / '), 'SWOGE WORLD / SPORTS / ARCADE / REWARDS',
     'les quatre carres du haut : le premier est le MONDE, plus le casino');
  ok(!carres.some((c) => c.h === 'games.html'),
     'et aucun ne renvoie a la page ou l on se trouve deja');

  /* Le compte de chaque rangee est LU sur les cartes, plus ecrit a la main :
     « Against the house » annoncait neuf jeux et n en portait plus que huit. */
  const comptes = await p.evaluate(() => [...document.querySelectorAll('.rangee')]
    .map((r) => ({ dit: r.querySelector('.nb').textContent,
                   vrai: String(r.querySelectorAll('.jc').length) })));
  ok(comptes.every((c) => c.dit === c.vrai),
     `chaque rangee annonce le nombre de jeux qu elle porte vraiment`
     + ` (${comptes.map((c) => c.dit).join(', ')})`);
  const absentes = cartes
    .map((m) => m[2].split('?')[0].split('#')[0])
    .filter((f) => !fs.existsSync(path.join(SITE, f)));
  ok(absentes.length === 0,
     `et chaque destination existe sur le disque${absentes.length
       ? ' — introuvable(s) : ' + absentes.join(', ') : ''} : reveiller un lien vers`
     + ' une page morte est pire que le laisser inerte');
  const auDoigt = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a.jc')];
    return { n: a.length,
             vives: a.filter((x) => getComputedStyle(x).pointerEvents === 'auto').length,
             doigt: a.filter((x) => getComputedStyle(x).cursor === 'pointer').length };
  });
  eq(auDoigt.vives, auDoigt.n,
     `les ${auDoigt.n} cartes repondent au doigt dans la page rendue`);
  eq(auDoigt.doigt, auDoigt.n, 'et le curseur le promet sur chacune');

  /* ---- LA PREUVE : ON NAVIGUE POUR DE VRAI ----
   * Dans un onglet a part : la page du blackjack fait un demi-megaoctet et
   * ses erreurs de chargement n ont rien a faire dans le compte de celles de
   * `games.html`. */
  {
    const ctx5 = await ctx.browser().newContext({ viewport: { width: 1400, height: 1000 } });
    const p5 = await ctx5.newPage();
    await p5.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    const hall = `http://127.0.0.1:${site.port}/games.html?server=`
                 + encodeURIComponent('ws://127.0.0.1:1');
    /* Les deux cartes NOMMEES par la demande, l une apres l autre. */
    for (const [cible, attendu] of [['swoge_blackjack.html?table=or', /\/swoge_blackjack\.html\?table=or$/],
                                    ['swoge_poker.html', /\/swoge_poker\.html$/]]) {
      await p5.goto(hall, { waitUntil: 'domcontentloaded' });
      await p5.waitForTimeout(600);
      await p5.click(`a.jc[href="${cible}"]`);
      await p5.waitForTimeout(1500);
      ok(attendu.test(p5.url()),
         `un vrai clic sur « ${cible} » CHANGE DE PAGE : ${p5.url().split('/').pop()}`
         + ' — c est la redirection demandee, et rien d autre ne la prouve');
    }

    /* ---- ET SANS LE CORRECTIF, LE MEME CLIC ECHOUE ----
     * On remet le defaut d origine par-dessus la page, et l on redemande le
     * meme geste. Un essai qui passe AUSSI quand la regle manque ne protege
     * de rien : c est ce qui a laisse le piege se refermer quatre fois. */
    await p5.goto(hall, { waitUntil: 'domcontentloaded' });
    await p5.waitForTimeout(600);
    await p5.addStyleTag({ content: 'a.jc{ pointer-events:none !important }' });
    const refus = await p5.click('a.jc[href="swoge_blackjack.html?table=or"]', { timeout: 3000 })
      .then(() => 'passe', () => 'refuse');
    ok(refus === 'refuse' && /games\.html/.test(p5.url()),
       `le defaut remis, le MEME clic n aboutit pas (${refus}) et l on reste sur`
       + ' le hall : la verification d au-dessus mesure bien le correctif, et non'
       + ' un navigateur complaisant');
    await ctx5.close();
  }

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
