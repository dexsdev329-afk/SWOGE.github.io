'use strict';
/*
 * LE BULLETIN, LE TABLEAU, ET LE MENU DU COMPTE — SUR LA PAGE CLAIRE.
 *
 * ---- CE QUI ETAIT DEMANDE ----
 *
 * « le panneaux sur swobetting "2 bets running / 30k staked · returns 44k /
 *   Bet slip / My bets (2) / Single @ 1.60 running ..." faut mettre ca en
 *   blanc aussi », et « le menu du profil, le mettre sur swoge betting html
 *   quand on clique sur profil ».
 *
 * ---- POURQUOI CET ESSAI EXISTE ----
 *
 * Repeindre une page sombre en clair ne se verifie pas a la lecture. Une
 * regle comme `color:#EAF2FF` reste parfaitement valide sur un fond devenu
 * blanc : le texte ne disparait pas du code, il disparait de l'ECRAN. Et un
 * `opacity:.45` qui calmait un texte clair sur du noir l'EFFACE sur du blanc,
 * parce qu'il le rapproche du fond au lieu de l'en eloigner. Ces deux defauts
 * ne se voient qu'en mesurant — ou en regardant, ce qui ne se rejoue pas.
 *
 * Il mesure donc CHAQUE couple fond/texte du bulletin et du tableau, fond
 * effectif compris : les transparences empilees et les opacites heritees sont
 * recomposees comme le navigateur les compose. Seuil 3:1, celui d'un gros
 * texte — en dessous, ce n'est plus une nuance, c'est une panne.
 *
 * ---- ET IL CLIQUE POUR DE VRAI ----
 *
 * Le bouton du profil est verifie au VRAI pointeur Playwright. Un
 * `el.click()` lance depuis un script ignore `pointer-events` : il validerait
 * un bouton que personne ne peut presser. Le piege s'est referme cinq fois
 * sur ce site. Les deux dernieres sections remettent chaque defaut en place
 * pour prouver que les verifications ci-dessus le VERRAIENT — une mesure qui
 * passe aussi quand le defaut est la ne protege de rien.
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
                '.png': 'image/png', '.css': 'text/css', '.mp4': 'video/mp4',
                '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

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

/* ---- LE TABLEAU ET LE BULLETIN, DANS LEUR FORME EXACTE ----
 * La page ne peint rien sans serveur : sans ce faux, la mesure regarderait
 * deux boites vides et passerait pour cette raison-la. La forme est celle que
 * produisent `sbPeintListe`, `sbPeintBulletin` et `sbPeintMien` — la decrire
 * ici est ce qui rend l'essai capable de voir un changement de forme plutot
 * que de le suivre.
 * Les QUATRE etats de ticket y sont : en cours, gagne, perdu, rembourse.
 * C'est le perdu qui portait `opacity:.72` et tombait sous le seuil, et il ne
 * se serait jamais montre a un essai qui n'aurait pose qu'un pari en cours. */
const poseLeFaux = () => {
  const pr = document.getElementById('preloader'); if (pr) pr.style.display = 'none';
  const cote = (nom, v, pris) =>
    `<button type="button"${pris ? ' class="pris"' : ''}><span>${nom}</span><b>${v}</b></button>`;

  document.getElementById('sbSports').innerHTML =
      '<button type="button" class="on">Football<i>12</i></button>'
    + '<button type="button">Tennis<i>4</i></button>'
    + '<button type="button" disabled>Cricket<i class="bientot">soon</i></button>';

  document.getElementById('sbListe').innerHTML =
      '<div class="sb-jour"><b>Tomorrow</b><span>Tue 26 Aug</span><i>6</i></div>'
    + '<div class="sb-groupe"><b>Premier League</b><span>England</span></div>'
    + '<div class="sb-m">'
    +   '<div class="sb-eq"><span><i class="dr">&#127988;</i>Arsenal</span>'
    +   '<span><i class="dr">&#127988;</i>Chelsea</span></div>'
    +   '<div class="sb-h">20:00</div>'
    +   '<div class="sb-cotes n3">' + cote('Arsenal', '1.60', true)
    +     cote('Draw', '3.80') + cote('Chelsea', '5.20') + '</div>'
    +   '<div class="sb-plus"><button type="button" class="sb-plusb">+5 markets</button></div>'
    +   '<div class="sb-plein">42,000 of exposure left</div>'
    + '</div>'
    + '<div class="sb-m">'
    +   '<div class="sb-eq"><span><i class="dr">&#127988;</i>Liverpool</span>'
    +   '<span><i class="dr">&#127988;</i>Manchester City</span></div>'
    +   '<div class="sb-h">22:30</div>'
    +   '<div class="sb-cotes n3">' + cote('Liverpool', '2.10')
    +     cote('Draw', '3.40') + cote('Man City', '3.10') + '</div>'
    +   '<div class="sb-plus"><button type="button" class="sb-plusb on">Hide markets</button></div>'
    +   '<div class="sb-mk"><b>Both teams to score</b><div class="sb-cotes n2">'
    +     cote('Yes', '1.76') + cote('No', '2.02') + '</div></div>'
    +   '<div class="sb-mk"><b>Correct score</b><div class="sb-cotes grille">'
    +     cote('1-0', '7.50') + cote('2-0', '11.0') + cote('2-1', '9.00')
    +     + cote('0-0', '9.50') + cote('1-1', '6.20') + '</div></div>'
    + '</div>';

  document.getElementById('sbBt').innerHTML = '2 bets running <i>combo</i>';
  document.getElementById('sbBc').innerHTML = '30k staked &middot; returns <b>44k</b>';
  document.getElementById('sbNbMien').textContent = '2';
  document.getElementById('sbJambes').innerHTML =
      '<div class="sb-j"><span>&#127988; Arsenal &ndash; &#127988; Chelsea</span>'
    + '<b>Arsenal @ 1.60</b><button type="button" aria-label="remove">&times;</button></div>'
    + '<div class="sb-j"><span>&#127988; Liverpool &ndash; &#127988; Man City</span>'
    + '<b>Both score &middot; Yes @ 1.76</b><button type="button" aria-label="remove">&times;</button></div>';
  document.getElementById('sbRetour').textContent = '2,816';
  document.getElementById('sbNote').textContent =
    'One wrong and the whole bet is lost. Odds are locked in when you place it.';
  document.getElementById('sbRapide').innerHTML =
      '<button type="button">1k</button><button type="button">5k</button>'
    + '<button type="button">25k</button><button type="button">Max</button>';

  const ticket = (cls, titre, etat, ligne, mise, retour, ref) =>
      `<div class="sb-p ${cls}"><div class="sb-ph"><b>${titre}</b>`
    + `<span class="sb-pe">${etat}</span></div>`
    + (ref ? `<div class="sb-pid">ref ${ref}</div>` : '')
    + `<div class="sb-pj">${ligne} <span>20:00</span></div>`
    + `<div class="sb-pf"><span>${mise} $SWOGE</span><b>${retour}</b></div></div>`;
  document.getElementById('sbMien').innerHTML =
      ticket('attente', 'Single @ 1.60', 'running',
             'Arsenal &ndash; Chelsea &middot; <b>Arsenal</b> @ 1.60', '30,000', '48,000', '8f21c0a4')
    + ticket('gagne', 'Double @ 4.20', 'won',
             'Liverpool &ndash; Man City &middot; <b>Draw</b> @ 3.40', '5,000', '21,000')
    + ticket('perdu', 'Single @ 2.05', 'lost',
             'Spurs &ndash; Everton &middot; <b>Spurs</b> @ 2.05', '1,000', '0')
    + ticket('rendu', 'Single @ 1.90', 'void',
             'Roma &ndash; Lazio &middot; <b>Roma</b> @ 1.90', '2,000', '2,000');

  const o = document.getElementById('sbOvl');
  o.hidden = false; o.classList.remove('replie');
  /* ---- LES DEUX VUES SONT MONTREES ENSEMBLE ----
   * `#sbVueMine` est `hidden` dans le fichier : le panneau n'en montre qu'une
   * a la fois. Un element cache n'a pas de rectangle, donc la mesure le SAUTE
   * — et les quatre tickets, c'est-a-dire tout ce que l'utilisateur a colle,
   * echappaient a l'essai en le faisant passer. Ce n'est pas une capture : les
   * montrer ensemble ne trompe personne, ca donne juste a mesurer. */
  document.getElementById('sbVueMine').hidden = false;
  document.body.classList.add('sb-dock');
  document.getElementById('sbVide').hidden = true;
  return !!document.querySelector('#sbOvl .sb-p') && !!document.querySelector('.sb-m');
};

/* ---- LA MESURE, TELLE QUE LE NAVIGATEUR COMPOSE ----
 * Le fond d'un texte n'est presque jamais celui de son element : c'est la
 * pile de ses ancetres, recomposee, chacun avec son alpha ET l'opacite qu'il
 * herite. C'est precisement ce que la page sombre exploitait — des blancs a
 * trois pour cent empiles sur du noir. Lire `backgroundColor` seul renverrait
 * `rgba(0,0,0,0)` et l'essai declarerait tout parfait.
 * L'opacite d'un element s'applique aussi a SON TEXTE : c'est par la que
 * `opacity:.45` faisait tomber un gris a 2,9:1 sans qu'aucune couleur ne
 * paraisse fautive. */
const mesure = (racines) => {
  const lit = (c) => {
    const m = String(c).match(/-?[\d.]+/g);
    if (!m) return [0, 0, 0, 0];
    return [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1];
  };
  const pose = (dessous, c, a) =>
    [0, 1, 2].map((i) => dessous[i] + (c[i] - dessous[i]) * a);
  const lum = (c) => {
    const v = c.map((x) => { const s = x / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const rapport = (a, b) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const pile = (el) => { const p = []; let e = el;
    while (e && e.nodeType === 1) { p.push(e); e = e.parentElement; } return p; };

  /* L'accent de la page est SOMBRE — un bleu profond — et c'est voulu : c'est
     le fond du bouton qui engage l'argent et de l'onglet actif. Le distinguer
     ici est ce qui permet a la verification « plus aucun fond sombre » de
     parler des restes du theme noir plutot que de l'accent. */
  const acc = lit('rgb(' + getComputedStyle(document.documentElement)
    .getPropertyValue('--gold').trim().replace('#', '')
    .match(/../g).map((h) => parseInt(h, 16)).join(',') + ')');
  const estAccent = (c) => [0, 1, 2].every((i) => Math.abs(c[i] - acc[i]) <= 6);

  const sorties = [];
  for (const sel of racines) {
    const racine = document.querySelector(sel);
    if (!racine) { sorties.push({ sel, absent: true }); continue; }
    for (const el of [racine, ...racine.querySelectorAll('*')]) {
      /* Un texte, et le sien : `textContent` remonterait celui des enfants et
         mesurerait la couleur du parent contre un mot qu'il ne peint pas. */
      const propre = [...el.childNodes]
        .filter((x) => x.nodeType === 3 && x.textContent.trim()).length > 0;
      if (!propre) continue;
      if (!el.getClientRects().length) continue;
      const cs0 = getComputedStyle(el);
      if (cs0.visibility === 'hidden') continue;
      /* ---- LES COMMANDES INACTIVES SONT HORS MESURE ----
         Un onglet de sport pas encore ouvert est PALE, et c'est la seule chose
         qui le distingue d'un onglet qu'on peut prendre. Le porter a plein
         contraste reviendrait a le proposer. La regle du contraste minimal
         exempte explicitement les composants inactifs ; l'exempter ici est
         donc le meme choix, ecrit. */
      if (el.closest('[disabled],:disabled')) continue;

      const p = pile(el);
      let fond = [255, 255, 255], cum = 1;
      for (let i = p.length - 1; i >= 0; i--) {
        const cs = getComputedStyle(p[i]);
        const op = Number(cs.opacity); cum *= isFinite(op) ? op : 1;
        const c = lit(cs.backgroundColor);
        const a = c[3] * cum;
        if (a > 0) fond = pose(fond, c, a);
      }
      const c = lit(cs0.color);
      const texte = pose(fond, c, Math.min(1, c[3] * cum));
      sorties.push({
        sel,
        quoi: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
              ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
        mot: [...el.childNodes].filter((x) => x.nodeType === 3)
             .map((x) => x.textContent).join(' ').trim().slice(0, 30),
        fond: fond.map(Math.round), texte: texte.map(Math.round),
        accent: estAccent(fond),
        clarte: lum(fond), rapport: Math.round(rapport(texte, fond) * 100) / 100,
      });
    }
    /* `.sb-mienListe:empty::after` porte la phrase qu'on lit quand on n'a
       encore rien parie. C'est un pseudo-element : il n'a pas de noeud, donc
       la boucle ci-dessus ne le voit pas — et c'est exactement le genre de
       texte qu'un repeint oublie. */
    const vide = racine.querySelector('.sb-mienListe') ||
                 (racine.classList.contains('sb-mienListe') ? racine : null);
    if (vide) {
      const cs = getComputedStyle(vide, '::after');
      /* Liste non vide : la regle ne s'applique pas, et `getComputedStyle`
         renvoie quand meme des couleurs heritees. Les mesurer ferait passer un
         texte qui n'existe pas pour une verification. */
      if (/^["']/.test(String(cs.content))) {
      let fond = [255, 255, 255], cum = 1;
      const p = pile(vide);
      for (let i = p.length - 1; i >= 0; i--) {
        const q = getComputedStyle(p[i]);
        const op = Number(q.opacity); cum *= isFinite(op) ? op : 1;
        const c = lit(q.backgroundColor); const a = c[3] * cum;
        if (a > 0) fond = pose(fond, c, a);
      }
      const c = lit(cs.color);
      const texte = pose(fond, c, Math.min(1, c[3] * cum * Number(cs.opacity || 1)));
      sorties.push({ sel, quoi: '.sb-mienListe::after', mot: '(liste vide)',
                     fond: fond.map(Math.round), texte: texte.map(Math.round),
                     accent: estAccent(fond),
                     clarte: lum(fond), rapport: Math.round(rapport(texte, fond) * 100) / 100 });
      }
    }
  }
  return sorties;
};

(async () => {
  const site = await servirLeSite();
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const url = `http://127.0.0.1:${site.port}/swogebet.html`;

  /* ================== 1. LE BULLETIN ET LE TABLEAU SONT CLAIRS ================== */
  console.log('\n-- le bulletin et le tableau, mesures --');
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const err = []; p.on('pageerror', (e) => err.push(String(e).slice(0, 160)));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  ok(await p.evaluate(poseLeFaux),
     'le tableau et le bulletin sont peints — sinon la mesure regarderait deux boites vides');

  const vus = await p.evaluate(mesure, ['#sbOvl', '.sb-wrap']);
  ok(!vus.some((x) => x.absent), 'les deux racines existent dans la page');
  ok(vus.length > 40, `il y a de quoi mesurer : ${vus.length} textes`);

  /* ---- AUCUN FOND SOMBRE N'EST RESTE EN PLACE ----
     L'accent de la page est lui-meme sombre, et c'est voulu : c'est le fond du
     bouton qui engage l'argent. Ce qu'on traque, ce sont les fonds du theme
     noir — `#101a2c`, `rgba(0,0,0,.28)` — qui restent parfaitement valides
     une fois la page blanche et n'ont plus rien pour les trahir. */
  const noirs = (l) => l.filter((x) => x.clarte < 0.5 && !x.accent);
  const sombres = noirs(vus);
  ok(sombres.length === 0,
     'aucun element du bulletin ni du tableau n a garde un fond sombre'
     + (sombres.length ? ' — ' + sombres.slice(0, 3)
        .map((x) => `${x.quoi} fond rgb(${x.fond})`).join(' / ') : ''));

  /* ---- AUCUN TEXTE NE PASSE SOUS 3:1 ----
     Un `#EAF2FF` pose sur `#FFFFFF` donne 1,05:1 : il est LA, il est valide,
     et il est invisible. C'est la faute que ce seuil attrape. */
  const faibles = vus.filter((x) => x.rapport < 3);
  ok(faibles.length === 0,
     'aucun couple fond/texte sous 3:1'
     + (faibles.length ? ' — ' + faibles.slice(0, 6)
        .map((x) => `${x.quoi} « ${x.mot} » ${x.rapport}:1`).join(' / ') : ''));
  const pire = vus.reduce((a, b) => (a && a.rapport <= b.rapport ? a : b), null);
  console.log(`       (le plus juste : ${pire.quoi} « ${pire.mot} » a ${pire.rapport}:1)`);
  /* Les quatre etats de ticket sont-ils VRAIMENT passes sous la mesure ? Ils y
     echappaient en silence tant que `#sbVueMine` restait cache, et l'essai
     passait pour cette raison-la — c'est-a-dire pour rien. */
  const etats = vus.filter((x) => /\bsb-pe\b/.test(x.quoi)).map((x) => x.mot).sort();
  eq(etats.join(','), 'lost,running,void,won',
     'les quatre etats de ticket de « My bets » sont passes sous la mesure');

  /* La phrase qu'on lit quand on n'a encore rien parie vit dans un
     `::after`. Elle n'a pas de noeud : elle ne se mesure qu'en vidant la
     liste, et c'est exactement le genre de texte qu'un repeint oublie. */
  const listeVide = await p.evaluate(() => { document.getElementById('sbMien').innerHTML = ''; },)
    .then(() => p.evaluate(mesure, ['#sbOvl']));
  const phrase = listeVide.find((x) => x.quoi === '.sb-mienListe::after');
  ok(!!phrase && phrase.rapport >= 3,
     `« No bets yet… », la phrase de la liste vide, se lit encore : ${phrase ? phrase.rapport : 'introuvable'}:1`);
  await p.evaluate(poseLeFaux);

  /* ---- LES ETATS GARDENT LEUR SENS ----
     Repeindre en clair ne doit pas avoir aplati les quatre etats de ticket en
     quatre gris. Gagne DOIT tirer au vert, perdu au rouge : un joueur lit son
     ticket a la couleur avant de lire le mot. */
  const teinte = await p.evaluate(() => {
    const l = (s) => { const e = document.querySelector(s);
      const m = String(getComputedStyle(e).backgroundColor).match(/-?[\d.]+/g).map(Number);
      return { r: m[0], v: m[1], b: m[2] }; };
    return { gagne: l('.sb-p.gagne'), perdu: l('.sb-p.perdu'),
             pastilleG: l('.sb-p.gagne .sb-pe'), pastilleP: l('.sb-p.perdu .sb-pe') };
  });
  ok(teinte.gagne.v > teinte.gagne.r && teinte.gagne.v > teinte.gagne.b,
     `un pari gagne tire toujours au VERT [rgb(${Object.values(teinte.gagne)})]`);
  ok(teinte.perdu.r > teinte.perdu.v && teinte.perdu.r > teinte.perdu.b,
     `un pari perdu tire toujours au ROUGE [rgb(${Object.values(teinte.perdu)})]`);
  ok(teinte.pastilleG.v > teinte.pastilleG.r && teinte.pastilleP.r > teinte.pastilleP.v,
     'et leurs deux pastilles avec eux');

  /* ---- LE BOUTON QUI ENGAGE L'ARGENT PORTE L'ACCENT DE LA PAGE ---- */
  const go = await p.evaluate(() => {
    const a = getComputedStyle(document.getElementById('sbGo'));
    const b = getComputedStyle(document.querySelector('.sw-b-plein'));
    return { fond: a.backgroundColor, texte: a.color, image: a.backgroundImage,
             ref: b.backgroundColor };
  });
  eq(go.fond, go.ref,
     '« Place bet » porte le MEME bleu que le bouton principal de l en-tete —'
     + ' deux bleus voisins sur un meme ecran se lisent comme un defaut d impression');
  eq(go.texte, 'rgb(255, 255, 255)', 'et son texte est blanc');
  eq(go.image, 'none',
     'le degrade clair est parti : fait pour eclairer du noir, il posait un texte'
     + ' presque noir sur un bleu pale');

  /* ================== 2. LE MENU DU PROFIL ================== */
  console.log('\n-- le profil, au vrai pointeur --');
  eq(await p.evaluate(() => {
    const b = document.getElementById('gxProfil'); return b ? b.tagName : 'ABSENT';
  }), 'BUTTON', 'le profil est un vrai bouton, non un rond inerte');
  ok(await p.evaluate(() => document.getElementById('gxMenu').hidden),
     'et son menu est ferme au chargement');

  /* Le VRAI clic. Sur un `<div>`, ou sous `pointer-events:none`, il echoue. */
  await p.click('#gxProfil');
  await p.waitForTimeout(350);
  const ouvert = await p.evaluate(() => ({
    montre: !document.getElementById('gxMenu').hidden,
    dit: document.getElementById('gxProfil').getAttribute('aria-expanded'),
    rangees: [...document.querySelectorAll('#gxMenu a')].map((a) => a.textContent.trim()),
  }));
  ok(ouvert.montre, 'un vrai clic sur le profil ouvre le menu');
  eq(ouvert.dit, 'true', 'et il le DIT — un lecteur d ecran l annonce ouvert');

  /* ---- LES RANGEES SONT CELLES DU `#menu` DE LA PAGE ----
     Elles ne sont pas ecrites dans le menu du profil : `#menu` est la seule
     declaration de ce qui existe. Les recopier en ferait une seconde, et le
     jour ou un panneau s'ajoute il ne serait que d'un cote. */
  const attendues = await p.evaluate(() =>
    [...document.querySelectorAll('#menu > a')].map((a) => a.textContent.trim().replace(/\s+/g, '')));
  eq(ouvert.rangees.map((x) => x.replace(/\s+/g, '')).join('|'), attendues.join('|'),
     'ses rangees sont LUES dans le `#menu` de la page, pas recopiees');
  ok(attendues.length >= 8, `il y en a ${attendues.length}, et aucune n a ete « choisie »`);

  /* ---- ET UNE RANGEE APPELLE SON LIEN D'ORIGINE ----
     C'est son gestionnaire qui sait ouvrir le panneau. Le refaire dans le menu
     serait un second chemin vers le meme argent. */
  await p.evaluate(() => {
    window.__vu = null;
    document.querySelector('#menu a[data-panel="wallet"]')
      .addEventListener('click', () => { window.__vu = 'wallet'; });
  });
  const rang = await p.evaluate(() =>
    [...document.querySelectorAll('#gxMenu a')].findIndex((a) => /Wallet/.test(a.textContent)) + 1);
  ok(rang > 0, 'la rangee « My Wallet » est dans le menu');
  await p.click(`#gxMenu a:nth-of-type(${rang})`);
  await p.waitForTimeout(300);
  eq(await p.evaluate(() => window.__vu), 'wallet',
     'un vrai clic dessus appelle SON lien d origine — et non un second chemin');
  ok(await p.evaluate(() => document.getElementById('gxMenu').hidden),
     'et le menu se referme derriere le clic');
  /* Le gestionnaire d origine, sans compte, ouvre la connexion : c est ce
     qu il faisait deja depuis le hamburger. On referme sa fenetre, sinon elle
     couvre l en-tete et le clic suivant tombe dessus. */
  ok(await p.evaluate(() => {
    const o = document.getElementById('ovl'); const eu = !!o && o.classList.contains('show');
    if (o) o.classList.remove('show');
    const v = document.getElementById('cxVoile'); if (v) v.hidden = true;
    return eu;
  }), 'et sans compte ce lien mene a la connexion, comme depuis le hamburger');
  await p.waitForTimeout(200);

  /* ================== 3. UN SEUL MENU DE COMPTE A L ECRAN ================== */
  console.log('\n-- un seul menu de compte --');
  const deux = await p.evaluate(() => {
    const vu = (e) => !!e && !!e.getClientRects().length
                   && getComputedStyle(e).visibility !== 'hidden';
    const $ = (s) => document.querySelector(s);
    return {
      profil: vu($('#gxProfil')), hamburger: vu($('#menuBtn')),
      menuPage: vu($('#menu')), menuPageExiste: !!$('#menu'),
      rangeesPage: document.querySelectorAll('#menu > a').length,
      son: !!$('#soundItem'), dock: vu($('#sndDock')),
    };
  });
  ok(deux.profil, 'le profil se voit dans l en-tete');
  ok(!deux.hamburger,
     'le hamburger ne se voit PLUS : il ouvrait la meme liste que le profil, et'
     + ' deux boutons cote a cote vers le meme contenu, c est « c est marque en double »');
  ok(deux.menuPageExiste && deux.rangeesPage >= 8,
     `mais son \`#menu\` reste dans la page, avec ses ${deux.rangeesPage} rangees :`
     + ' c est la DECLARATION que le menu du profil lit');
  ok(!deux.menuPage, 'et il ne se dessine pas — sinon on lirait la liste deux fois');
  ok(deux.dock,
     'rien ne se perd : le son et la musique gardent leurs deux pastilles fixes');

  /* Ouvrir le menu du profil ne doit pas faire reparaitre l'autre. */
  await p.click('#gxProfil'); await p.waitForTimeout(300);
  const pendant = await p.evaluate(() => {
    const vu = (e) => !!e && !!e.getClientRects().length;
    return { gx: vu(document.getElementById('gxMenu')),
             page: vu(document.getElementById('menu')) };
  });
  ok(pendant.gx && !pendant.page,
     'menu ouvert, il n y en a toujours qu UN de visible');
  await p.mouse.click(700, 880); await p.waitForTimeout(250);
  ok(await p.evaluate(() => document.getElementById('gxMenu').hidden),
     'un clic a cote le referme — un menu qui reste ouvert avale le geste suivant');

  ok(err.length === 0, 'aucune erreur de page' + (err.length ? ' — ' + err[0] : ''));
  await ctx.close();

  /* ================== 4. LA PREUVE PAR LES DEFAUTS REMIS ==================
   * Une mesure qui passe aussi quand le defaut est present ne protege de rien.
   * On remet les deux exacts qu'on vient de corriger. */
  console.log('\n-- et avec les defauts remis --');
  {
    const c = await nav.newContext({ viewport: { width: 1400, height: 950 } });
    const q = await c.newPage();
    await q.goto(url, { waitUntil: 'domcontentloaded' });
    await q.waitForTimeout(2500);
    /* ---- LE THEME NOIR REMIS, TEL QU'IL ETAIT ----
     * Pas seulement `.sb-bul` : le panneau sombre tenait sur QUATRE regles
     * empilees — la coque noire, un corps transparent qui la laissait voir, un
     * en-tete a quatre pour cent de blanc, des tickets a trois et demi. Ne
     * remettre que la coque ne prouverait rien : les fonds pleins poses depuis
     * la couvrent, et l'essai passerait pour une bonne raison qui n'est pas
     * celle qu'on croit verifier. */
    await q.addStyleTag({ content:
        '.sb-bul{ background:#101a2c !important }'
      + '.sb-corps{ background:transparent !important }'
      + '.sb-tete{ background:rgba(255,255,255,.04) !important }'
      + '.sb-p{ background:rgba(255,255,255,.035) !important }' });
    await q.evaluate(poseLeFaux);
    const r = await q.evaluate(mesure, ['#sbOvl']);
    ok(noirs(r).length > 0,
       `le theme noir remis est VU : ${noirs(r).length} fonds sombres reparaissent`);
    ok(r.some((x) => x.rapport < 3),
       'et les textes de la page claire y deviennent illisibles — la mesure'
       + ' verrait donc le defaut revenir');
    await c.close();
  }
  {
    /* ---- ET L'OPACITE SEULE, SANS AUCUNE COULEUR FAUTIVE ----
     * `.sb-p.perdu{ opacity:.72 }` fanait un ticket perdu. Aucune couleur du
     * fichier n'a l'air en cause : c'est la faute la plus dure a voir en
     * relisant, et celle que seule une mesure attrape. */
    const c = await nav.newContext({ viewport: { width: 1400, height: 950 } });
    const q = await c.newPage();
    await q.goto(url, { waitUntil: 'domcontentloaded' });
    await q.waitForTimeout(2500);
    await q.addStyleTag({ content: '.sb-p.perdu{ opacity:.72 !important }' });
    await q.evaluate(poseLeFaux);
    const r = await q.evaluate(mesure, ['#sbOvl']);
    const fanes = r.filter((x) => x.rapport < 3);
    ok(fanes.length > 0,
       'le ticket perdu refane sous le seuil'
       + ` — « ${(fanes[0] || {}).mot} » a ${(fanes[0] || {}).rapport}:1`);
    await c.close();
  }
  {
    const c = await nav.newContext({ viewport: { width: 1400, height: 950 } });
    const q = await c.newPage();
    await q.goto(url, { waitUntil: 'domcontentloaded' });
    await q.waitForTimeout(2500);
    await q.evaluate(() => { const pr = document.getElementById('preloader');
                             if (pr) pr.style.display = 'none'; });
    /* `pointer-events:none` : le bouton garde son dessin, son libelle et son
       gestionnaire — tout sauf l'effet. Un `el.click()` de script passerait. */
    await q.addStyleTag({ content: '#gxProfil{ pointer-events:none !important }' });
    let mort = false;
    try { await q.click('#gxProfil', { timeout: 2500 }); } catch (e) { mort = true; }
    ok(mort, 'le bouton rendu muet fait ECHOUER le vrai clic : le clic ci-dessus'
           + ' verifie un BOUTON, pas un gestionnaire');
    ok(await q.evaluate(() => document.getElementById('gxMenu').hidden),
       'et le menu est reste ferme — le clic est bien passe a cote');
    await c.close();
  }

  await nav.close(); site.stop();
  console.log(`\nbulletin_blanc.test.js : ${n} verifications, ${echecs} echec(s)`);
  process.exit(echecs ? 1 : 0);
})();
