'use strict';
/*
 * LES SIX MARCHES, VUS DE LA PAGE.
 *
 * ---- POURQUOI CET ESSAI N'EXISTAIT PAS AVANT ----
 *
 * `swogebet.html` ecrivait l'adresse du serveur EN DUR. N'importe quel essai
 * automatise aurait donc ouvert sa socket sur la PRODUCTION et pose de vrais
 * paris avec de vrais soldes. La page porte maintenant `?server=`, comme deux
 * autres pages du site — et c'est ce qui la rend essayable.
 *
 * ---- CE QU'IL VERIFIE ----
 *
 * Que ce que le serveur envoie arrive JUSQU'A L'ECRAN, et que ce qu'on clique
 * repart tel quel. Un marche peut etre parfaitement valide, cote et reglable
 * cote serveur, et rester invisible ou — pire — se poser sur le mauvais
 * marche parce que la page a lu la cote du 1-N-2 pour une jambe posee sur
 * « les deux equipes marquent ». Le bulletin annoncerait alors un retour que
 * le serveur ne paierait pas.
 *
 * Il ecrit son PROPRE calendrier : celui du depot ne porte que des 1-N-2, et
 * ses rencontres sont toutes jouees. Attendre le prochain import pour essayer
 * la page reviendrait a ne jamais l'essayer.
 */
const assert = require('assert');
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
                '.wav': 'audio/wav' };

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
  /* ---- LE CALENDRIER D'ESSAI, ECRIT AVANT LE PREMIER `require` ----
   * `paris.js` resout son fichier au chargement : ecrire apres coup ferait
   * lire l'amorce du depot, dont toutes les rencontres sont jouees. */
  const VOLUME = fs.mkdtempSync('/tmp/paris-page-');
  process.env.DATA_DIR = VOLUME;
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.chdir(SERVEUR);
  const cotes = require(path.join(SERVEUR, 'cotes'));
  const DEMAIN = new Date(Date.now() + 26 * 3600 * 1000).toISOString();
  /* « Alpha » contre « Beta » : quatre et cinq lettres. Aucun tableau ne
     deborde avec ca, et un essai qui ne mesure que le cas facile ne mesure
     rien. Le vrai calendrier aligne « Borussia Monchengladbach » contre
     « Eintracht Frankfurt » et « Real Racing Club de Santander ». La seconde
     rencontre porte donc les noms les plus longs qu on rencontre vraiment,
     dans un tournoi au nom long lui aussi — c est ce couple-la qui casse une
     rangee, jamais le premier. */
  const LONG_A = 'Borussia Monchengladbach';
  const LONG_B = 'Real Racing Club de Santander';
  const cat = {
    sports: [{ cle: 'foot', nom: 'Football', actif: true }],
    matchs: [{
      id: 'essai-page-six', sport: 'foot', competition: 'Test League',
      pays: 'England', domicile: 'Alpha', exterieur: 'Beta', debut: DEMAIN,
      marches: cotes.marchesDe('foot', 'Alpha', 'Beta'),
    }, {
      id: 'essai-noms-longs', sport: 'foot',
      competition: 'Deutsche Fussball Bundesliga Zweite', pays: 'Germany',
      domicile: LONG_A, exterieur: LONG_B, debut: DEMAIN,
      marches: cotes.marchesDe('foot', LONG_A, LONG_B),
    }],
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
  const ethers = require(path.join(SERVEUR, 'node_modules', 'ethers'));
  await new Promise((r) => setTimeout(r, 1400));

  const site = await servirLeSite();
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  await p.addInitScript(function () {
    window.__s = [];
    const N = window.WebSocket;
    function C(u, pr) {
      const s = (pr === undefined) ? new N(u) : new N(u, pr);
      s.__m = []; s.__envoi = [];
      const env = s.send.bind(s);
      s.send = function (d) { try { s.__envoi.push(JSON.parse(d)); } catch (e) {} return env(d); };
      s.addEventListener('message', (e) => { try { s.__m.push(JSON.parse(e.data)); } catch (x) {} });
      window.__s.push(s);
      return s;
    }
    C.prototype = N.prototype; C.OPEN = N.OPEN; C.CLOSED = N.CLOSED;
    window.WebSocket = C;
  });
  await p.goto(`http://127.0.0.1:${site.port}/swogebet.html?server=`
               + encodeURIComponent('ws://127.0.0.1:' + port),
               { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);

  console.log('-- on se connecte --');
  const w = ethers.Wallet.createRandom();
  const etat = await p.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      const s = (window.__s || []).find((q) => q.__m.some((m) => m.type === 'hello'));
      if (s) return { ok: true, nonce: s.__m.find((m) => m.type === 'hello').loginNonce };
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: false };
  });
  ok(etat.ok, 'la page ouvre sa socket sur le serveur d essai — et non sur la production');
  if (!etat.ok) { await nav.close(); site.stop(); process.exit(1); }
  const msg = 'SWOGE Pusher login\nnonce: ' + etat.nonce;
  const sig = await w.signMessage(msg);
  await p.evaluate(([m, sg]) => window.__s[0].send(JSON.stringify({ type: 'login', message: m, signature: sg })), [msg, sig]);
  await p.waitForTimeout(1800);
  ok(true, 'un compte est connecte : ' + w.address.slice(0, 10));

  console.log('\n-- la rencontre arrive, avec ses six marches --');
  await p.waitForTimeout(1200);
  const vu = await p.evaluate(() => {
    const s = window.__s[0];
    const l = s.__m.filter((m) => m.type === 'parisListe').pop();
    return l ? { matchs: (l.matchs || []).length,
                 marches: Object.keys(((l.matchs || [])[0] || {}).marches || {}).sort() } : null;
  });
  ok(!!vu && vu.matchs === 2, `le serveur envoie les rencontres (${vu && vu.matchs})`);
  eq((vu && vu.marches || []).join(','), '1n2,btts,dc,hand,ou25,score',
     'avec ses six marches');

  const carte = () => p.evaluate(() => {
    const c = document.querySelector('.sb-m');
    if (!c) return null;
    return {
      cotes: [...c.querySelectorAll('.sb-cotes button')].map((b) => ({
        k: b.getAttribute('data-k'), c: b.getAttribute('data-c'),
        nom: (b.querySelector('span') || {}).textContent,
        cote: (b.querySelector('b') || {}).textContent,
        pris: b.classList.contains('pris'),
      })),
      plus: (c.querySelector('.sb-plusb') || {}).textContent || null,
      titres: [...c.querySelectorAll('.sb-mk > b')].map((b) => b.textContent),
    };
  });
  /* ---- IL FAUT DEPLIER LE TOURNOI D ABORD ----
   * Cet essai cherchait `.sb-m` des l arrivee des donnees, et echouait depuis
   * que les tournois sont REPLIES par defaut — une demande explicite : « Spain
   * La Liga laisse-la fermee, sinon c est super long l interface ». La page
   * avait raison, l essai etait perime, et il criait pour une raison qui n
   * existait plus : c est ainsi qu on apprend a ne plus lire un essai rouge.
   * On fait donc ce que fait un visiteur — on ouvre le tournoi. */
  await p.click('.sb-t-tete');
  await p.waitForTimeout(400);
  const replie = await carte();
  ok(!!replie, 'le tournoi s ouvre et la carte de la rencontre est a l ecran');
  eq(replie.cotes.length, 3, 'elle ne montre d abord que les trois cotes du resultat');
  eq(replie.cotes.map((x) => x.k).join(','), '1n2,1n2,1n2', 'toutes du marche de base');
  ok(/^\d+\.\d\d$/.test(replie.cotes[0].cote),
     `et la cote est LUE, pas « NaN » : ${replie.cotes[0].cote}`);
  eq(replie.plus, '+5 markets',
     'un bouton dit COMBIEN il en reste — « More » se devine, un nombre se clique');
  eq(replie.titres.length, 0, 'et rien n est deplie tant qu on n a pas clique');

  console.log('\n-- on deplie --');
  await p.click('.sb-plusb'); await p.waitForTimeout(400);
  const ouvert = await carte();
  eq(ouvert.titres.join(' | '),
     'Double chance | Both teams to score | Total goals | Handicap −1.5 | Correct score',
     'les cinq autres marches apparaissent, nommes en clair');
  const parMarche = {};
  for (const b of ouvert.cotes) parMarche[b.k] = (parMarche[b.k] || 0) + 1;
  eq(JSON.stringify(parMarche),
     JSON.stringify({ '1n2': 3, dc: 3, btts: 2, ou25: 2, hand: 2, score: 17 }),
     'chacun porte exactement ses reponses — dont les dix-sept scores exacts');
  const btts = ouvert.cotes.filter((x) => x.k === 'btts');
  eq(btts.map((x) => x.nom).join('/'), 'Yes/No',
     'et les cles du serveur sont traduites en mots : « oui/non » se lit « Yes/No »');
  ok(btts.every((x) => /^\d+\.\d\d$/.test(x.cote)),
     `les deux cotes sont lues dans LEUR marche : ${btts.map((x) => x.cote).join(' / ')}`);
  const ou = ouvert.cotes.filter((x) => x.k === 'ou25');
  eq(ou.map((x) => x.nom).join('/'), 'Over 2.5/Under 2.5',
     'la ligne est ECRITE dans le libelle : « plus » tout seul ne dit pas plus que quoi');

  console.log('\n-- on met « les deux marquent » au bulletin --');
  const coteBtts = Number(btts.find((x) => x.c === 'oui').cote);
  await p.click('.sb-cotes button[data-k="btts"][data-c="oui"]');
  await p.waitForTimeout(500);
  const bulletin = await p.evaluate(() => ({
    lignes: [...document.querySelectorAll('#sbJambes .sb-j b')].map((b) => b.textContent),
    panier: (window.SB && window.SB.panier) || null,
  }));
  eq(bulletin.lignes.length, 1, 'une ligne au bulletin');
  ok(/Both score/.test(bulletin.lignes[0]),
     `et elle NOMME le marche : « ${bulletin.lignes[0]} » — « Yes @ 1.76 » tout seul`
     + ' ne dit pas oui a quoi, et c est la derniere ligne qu on lit avant de miser');
  ok(bulletin.lignes[0].indexOf(coteBtts.toFixed(2)) >= 0,
     `et la cote du bulletin est celle du marche clique (${coteBtts.toFixed(2)}), pas celle du resultat`);

  console.log('\n-- et le pari part avec son marche --');
  await p.evaluate(() => { const e = document.getElementById('sbMise'); e.value = '100';
                           e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(300);
  await p.click('#sbGo'); await p.waitForTimeout(1500);
  const envoye = await p.evaluate(() =>
    (window.__s[0].__envoi || []).filter((m) => m.type === 'parie').pop());
  ok(!!envoye, 'la page envoie le pari');
  eq(envoye && envoye.selections[0].marche, 'btts',
     'et la selection porte SON marche : sans lui, le serveur le poserait sur le resultat');
  eq(envoye && envoye.selections[0].choix, 'oui', 'avec la cle du serveur, non le mot anglais');
  const pose = await p.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const m = window.__s[0].__m.filter((x) => x.type === 'pariPose').pop();
      if (m) return m;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  });
  ok(!!pose, 'et le serveur l accepte');
  eq(pose && pose.pari && pose.pari.jambes[0].marche, 'btts',
     'le pari enregistre porte le marche');
  ok(pose && Math.abs(pose.pari.cote - coteBtts) < 0.001,
     `a la cote affichee (${pose && pose.pari.cote} pour ${coteBtts})`);

  /* ================= LA MEME PAGE, SUR UN TELEPHONE, AVEC SES DONNEES =================
   * L angle mort de tous les autres essais. Ceux qui ouvrent `swogebet.html`
   * sans serveur voient une liste VIDE : ils ne mesurent donc jamais la page
   * telle qu elle existe vraiment, avec ses tournois, ses rencontres et leurs
   * cotes. Or c est precisement l etat signale — « ca casse deux secondes
   * apres », c est-a-dire au moment ou les donnees arrivent.
   *
   * Cet essai-ci a deja un serveur qui parle. On lui demande donc la seule
   * chose que personne ne verifiait : a 390 points de large, une fois la liste
   * remplie et un tournoi ouvert, la page tient-elle dans l ecran. Si un nom
   * d equipe, une cote ou une rangee de marches deborde, c est ici que ca se
   * voit — et nulle part ailleurs. */
  console.log('\n-- la meme page sur un telephone, liste remplie --');
  {
    const tel = await ctx.newPage();
    await tel.setViewportSize({ width: 390, height: 844 });
    await tel.goto(p.url(), { waitUntil: 'domcontentloaded' });
    await tel.waitForTimeout(2500);
    /* On ouvre le premier tournoi, comme un doigt le ferait. */
    /* On ouvre TOUS les tournois, pas seulement le premier : c est le pire cas,
       et c est celui qu un visiteur produit en trois gestes. */
    const tetes = await tel.$$('.sb-t-tete');
    for (const t of tetes) { try { await t.click({ timeout: 3000 }); } catch (e) {} }
    await tel.waitForTimeout(800);
    const m = await tel.evaluate(() => {
      const W = document.documentElement.clientWidth;
      /* ---- CE QUI COMPTE COMME « DEJA CONTENU » ----
       * Seuls `auto` et `scroll` : un conteneur qui defile a le droit d'etre
       * plus large que l'ecran, c'est sa raison d'etre.
       *
       * `hidden` NON, et surtout pas celui de `body`. Il ne clippe pas : sur
       * l'element racine il se propage a la fenetre, le document reste large,
       * et le telephone le degonfle quand meme. Le compter comme un abri
       * faisait ecarter TOUS les elements de la page — d'ou le premier
       * verdict, « la page deborde, 0 element fautif », qui ne nommait
       * personne. On s'arrete donc a `body`. */
      const dansScroll = (e) => {
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
          const c = getComputedStyle(a);
          if (c.overflowX === 'auto' || c.overflowX === 'scroll') return true;
        }
        return false;
      };
      const fautifs = [];
      document.querySelectorAll('body *').forEach((e) => {
        const c = getComputedStyle(e);
        if (c.display === 'none' || c.visibility === 'hidden') return;
        const r = e.getBoundingClientRect();
        if (r.width < 1) return;
        if (r.right > W + 1 && !dansScroll(e)) fautifs.push(e);
      });
      /* On ne garde que les FEUILLES du probleme. Un conteneur deborde parce
         que son contenu deborde : le nommer, lui, envoie chercher au mauvais
         etage. Ce qu'on veut, c'est l'element qui n'a aucun enfant fautif. */
      const feuilles = fautifs.filter((e) => !fautifs.some((f) => f !== e && e.contains(f)));
      const combien = fautifs.length;
      const decris = (e) => {
        const r = e.getBoundingClientRect();
        return { n: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')
                   + (typeof e.className === 'string' && e.className
                      ? '.' + e.className.trim().split(/\s+/).join('.') : ''),
                 d: Math.round(r.right), l: Math.round(r.width),
                 blanc: getComputedStyle(e).whiteSpace,
                 t: (e.textContent || '').trim().slice(0, 46) };
      };
      const pire = feuilles.length ? decris(feuilles[0]) : null;
      const causes = feuilles.slice(0, 4).map(decris);
      /* La chaine des parents, du fautif jusqu'a `body` : c'est elle qui dit
         QUEL etage a cesse de tenir dans l'ecran, et pourquoi. Nommer la
         feuille ne suffit pas — elle ne fait que remplir la boite qu'on lui
         donne. */
      const chaine = [];
      for (let a = feuilles[0]; a && a !== document.documentElement; a = a.parentElement) {
        const c = getComputedStyle(a);
        chaine.push(a.tagName.toLowerCase() + (a.id ? '#' + a.id : '')
          + (typeof a.className === 'string' && a.className
             ? '.' + a.className.trim().split(/\s+/).join('.') : '')
          + ' | ' + Math.round(a.getBoundingClientRect().width) + 'px'
          + ' | ' + c.display + ' | flex:' + c.flex
          + ' | min-w:' + c.minWidth + ' | align-self:' + c.alignSelf
          + ' | w:' + c.width);
      }
      return { doc: document.documentElement.scrollWidth, ecran: W,
               cartes: document.querySelectorAll('.sb-m').length,
               tournois: document.querySelectorAll('.sb-t').length,
               combien, pire, causes, chaine };
    });
    await tel.close();
    ok(m.tournois > 0, `la liste est remplie sur telephone (${m.tournois} tournoi(s), ${m.cartes} carte(s))`);
    ok(m.doc <= m.ecran,
       m.doc <= m.ecran
         ? `et la page tient dans l ecran (${m.doc}/${m.ecran})`
         : `la page DEBORDE : ${m.doc} pour ${m.ecran} — ${m.combien} element(s).\n`
           + `       A la racine du probleme :\n`
           + (m.causes || []).slice(0, 2).map((c) => `         ${c.n}  (${c.l}px)`).join('\n')
           + `\n       La chaine des parents :\n`
           + (m.chaine || []).map((l) => '         ' + l).join('\n'));
  }

  ok(erreurs.length === 0, 'aucune erreur de page' + (erreurs.length ? ' — ' + erreurs[0] : ''));
  console.log(`\nparis_page.test.js : ${n} verifications, ${echecs} echec(s)`);
  await nav.close(); site.stop();
  process.exit(echecs ? 1 : 0);
})();
