/* LA SALLE DE CINEMA DU NEXUS.
 *
 * ---- POURQUOI CET ESSAI EXISTE ----
 *
 * Il n'y en avait aucun. La salle a ete construite, l'ecran a ete branche sur
 * le panneau d'administration, et personne n'a jamais verifie qu'on pouvait
 * en RESSORTIR. La croix du panneau etait morte depuis le premier jour : on
 * marchait devant l'ecran, le panneau s'ouvrait, on cliquait sur la croix et
 * il revenait a l'image suivante. Le proprietaire l'a signale ; aucun chiffre
 * ne l'avait dit.
 *
 * La cause n'etait pas la croix. `fermeArcade` retenait le point sous les
 * pieds du joueur — pour ne pas rouvrir aussitot le panneau de la machine sur
 * laquelle on se tient encore — mais elle le faisait a la condition
 * `SCENE === 'arcade'`, en nommant SALLE_ARC. Dans le cinema elle tombait
 * donc dans l'autre branche, qui marque un lieu du HALL : sans objet quand on
 * est deja dans une salle. Le point n'etait pas retenu, l'image suivante
 * voyait un point ouvrable, et le panneau se rouvrait.
 *
 * C'est la troisieme fois que ce depot se fait avoir par la meme chose : une
 * regle qui vaut pour TOUTES les salles, ecrite en nommant une salle. D'ou la
 * forme de cet essai — il ne demande pas « est-ce que le cinema marche »,
 * il demande « est-ce que la croix ferme, ET reste fermee ».
 *
 * ---- CE QU'IL VERIFIE ----
 *
 * 1. ON ENTRE. La planche de la salle se dessine.
 * 2. ON EST SUR LE POINT, ET C'EST LA PAGE QUI LE DIT. Elle affiche le nom du
 *    point sous nos pieds ; tant qu'elle ne le nomme pas, rien de ce qui suit
 *    ne veut dire quoi que ce soit.
 * 3. SANS SEANCE, RIEN NE S'OUVRE. Un ecran qui ouvre un panneau vide serait
 *    pire que pas d'ecran du tout.
 * 4. LA SEANCE ARRIVE PAR LE RESEAU et l'ecran s'allume : c'est le serveur
 *    qui dit ce qui passe, jamais la page.
 * 5. LA CROIX FERME — ET LE PANNEAU RESTE FERME plusieurs images durant,
 *    SANS QU'ON BOUGE ET SANS QU'ON QUITTE LE POINT. C'est la verification
 *    qui manquait.
 * 6. ON PEUT LE ROUVRIR en repassant dessus : une croix qui condamne l'ecran
 *    jusqu'a la sortie serait l'autre facon de se tromper.
 *
 * ---- LA SOCKET EST FAUSSE, ET C'EST VOULU ----
 *
 * La seance vient du serveur. Faire tourner le vrai serveur pour cet essai
 * l'aurait rendu dependant de son etat du moment. On remplace donc le
 * constructeur WebSocket AVANT que la page ne charge — la page en fait
 * autant, elle enveloppe le notre — et l'on pousse le message tel quel. Le
 * chemin traverse est le VRAI : meme `traite`, meme `poseLaSeance`.
 *
 * ---- DEUX SYSTEMES DE COORDONNEES, ET LE PIEGE QU'ILS TENDENT ----
 *
 * Mesure faite, et c'est ce qui faisait mentir la premiere version de cet
 * essai : le hall et la salle ne comptent pas dans les memes unites. Dehors,
 * la porte du cinema est a x=448 sur une carte de deux mille cinq cents ;
 * dedans, la piece fait mille six cents de cote et l'allee ne va que de 680 a
 * 904. La marche vers la porte visait donc x=448 et CONTINUAIT a pousser vers
 * l'ouest une fois entre — quarante fois — jusqu'a plaquer le personnage
 * contre le bord de l'allee, a x=680. Le point de l'ecran est a x=792 pour un
 * rayon de 84 : on s'arretait 112 unites a cote, soit 28 de trop. La page
 * avait raison de ne rien ouvrir, et l'essai concluait que l'ecran etait
 * casse.
 *
 * Deux consequences dans la forme de ce fichier :
 *   - chaque etape du hall s'ARRETE des qu'on est entre, au lieu de continuer
 *     a viser un repere qui n'existe plus ;
 *   - dans la salle on ne marche plus « vers une abscisse » mais VERS UN
 *     POINT, en relisant la position dessinee entre chaque appui, et en
 *     mesurant au passage ce qu'un appui fait avancer — une duree fixe
 *     depasse le point et repart dans l'autre sens sans jamais s'arreter.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('cinema_page.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
              '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const f = path.join(racine, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
        r.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res({ port: s.address().port, stop: () => s.close() }));
  });
}
process.on('unhandledRejection', (e) => {
  console.log('  RATE essai interrompu : ' + (e && e.message ? e.message : e));
  process.exit(1);
});

/* Le nom de la planche de la salle vient de la SOURCE : le jour ou elle est
   redessinee sous un autre nom, cet essai doit le suivre sans qu'on y pense. */
function plancheDeLaSalle() {
  const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
  const m = src.match(/room_cinema[\w.]*\.webp/);
  return m ? m[0] : 'room_cinema.webp';
}

/* ---- OU EST LA PORTE, D'APRES LA SOURCE ----
 * On ne recopie aucune coordonnee. Le lieu porte les siennes, et le point ou
 * l'on entre n'est pas son ancrage mais `y - haut * 0.15` — c'est la page qui
 * le dit, pas nous. Le jour ou le batiment demenage, l'essai le suit. */
function porteDuCinema() {
  const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
  const bloc = src.slice(src.indexOf('var LIEUX = ['), src.indexOf('LIEUX.forEach(function (l) { l.img'));
  const e = bloc.slice(bloc.indexOf("{ cle: 'cinema'"));
  const nb = (c) => {
    const m = e.match(new RegExp(c + ':\\s*([^,}]+)'));
    return m ? Function('CENTRE', 'return ' + m[1])(CENTRE) : null;
  };
  return { x: nb('x'), y: nb('y') - nb('haut') * 0.15, rayon: nb('rayon') };
}
/* ---- LE POINT DE L'ECRAN, D'APRES LA SOURCE ----
 * Dans la salle, les reperes du hall ne valent plus rien : la piece a ses
 * propres seize cents unites. On relit donc le point tel que la salle le
 * declare, plutot que de marcher au juge une deuxieme fois.
 * Son NOM en fait partie, et il sert de temoin : c'est ce que la page ecrit
 * a l'ecran quand on se tient dessus, donc le seul chiffre qui dise « le jeu
 * ET MOI sommes d'accord sur ou je suis ». Le recopier ici aurait fait passer
 * l'essai le jour ou la salle renomme son point. */
function ecranDeLaSalle() {
  const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
  const b = src.slice(src.indexOf('var SALLE_CINE'));
  const bl = b.slice(b.indexOf('bornes: ['), b.indexOf(']', b.indexOf('bornes: [')));
  const f = (c) => Number(bl.match(new RegExp(c + ':\\s*1600 \\* ([\\d.]+)'))[1]) * 1600;
  return { x: f('x'), y: f('y'), r: Number(bl.match(/r:\s*(\d+)/)[1]),
           nom: bl.match(/nom:\s*'([^']*)'/)[1] };
}

/* Le centre du monde, lui aussi relu : deux lignes de la source suffisent, et
   les recopier serait la premiere chose fausse le jour ou la carte grandit. */
const CENTRE = (() => {
  const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
  const t = Number(src.match(/var TUILE = (\d+)/)[1]);
  const c = Number(src.match(/cols: (\d+)/)[1]), r = Number(src.match(/rows: (\d+)/)[1]);
  return { x: (c * t) / 2, y: (r * t) / 2 - 32 };
})();

const FAUSSE_SOCKET = `(() => {
  /* ---- ON N'IMITE PAS LE SERVEUR, ON S'AJOUTE A LUI ----
   *
   * Premiere version : une fausse socket complete. Elle ne repondait ni
   * l'authentification ni l'entree dans le Nexus, donc la page ne posait
   * jamais le personnage sur la carte — quatorze pas vers le nord ne
   * bougeaient rien et l'essai concluait que la salle n'existait pas. Une
   * fausse socket doit imiter TOUT le dialogue, sinon elle ne mesure que son
   * propre silence.
   *
   * On garde donc la vraie socket, avec son vrai dialogue, et l'on se
   * contente de pouvoir GLISSER un message dedans. Le chemin traverse reste
   * le vrai : meme ecouteur, meme \`traite\`, meme \`poseLaSeance\`.
   *
   * Le serveur est INJOIGNABLE depuis cet essai : mesure faite, la socket
   * reste en etat 0 (CONNECTING) tant que la page vit. Ca n'empeche rien —
   * \`dispatchEvent\` n'attend pas qu'une socket soit ouverte pour appeler
   * ses ecouteurs, et c'est verifie plus bas par le nom que la page affiche
   * une fois la seance posee. */
  const Vrai = window.WebSocket;
  function Ajout(url, protos) {
    const s = (protos === undefined) ? new Vrai(url) : new Vrai(url, protos);
    window.__socks = window.__socks || [];
    window.__socks.push(s);
    return s;
  }
  Ajout.CONNECTING = Vrai.CONNECTING; Ajout.OPEN = Vrai.OPEN;
  Ajout.CLOSING = Vrai.CLOSING; Ajout.CLOSED = Vrai.CLOSED;
  Ajout.prototype = Vrai.prototype;
  window.WebSocket = Ajout;
  /* Le message part vers TOUTES les sockets ouvertes : la page en cree une,
     d'autres scripts du site peuvent en creer d'autres, et deviner laquelle
     est la bonne rendrait l'essai dependant de l'ordre de chargement. */
  window.__pousse = (o) => (window.__socks || []).forEach((s) => {
    const ev = new MessageEvent('message', { data: JSON.stringify(o) });
    if (typeof s.onmessage === 'function') s.onmessage(ev);
    s.dispatchEvent(ev);
  });
})()`;

/* ---- CE QUE L'ESPION RELEVE, ET POURQUOI CHAQUE SIGNATURE ----
 *
 * `__salle`  : la planche de la piece. C'est le seul dessin qui dise « on est
 *              dedans » sans rien demander a une variable privee.
 * `__moi`    : le personnage. `dessineAvatar` decoupe un cadre de 256 et le
 *              pose en 150 sur 150, ancre a `x - 75, y - 130` — on remonte
 *              donc aux pieds. Signature verifiee dans la salle autant que
 *              dans le hall : sans ca, la position serait restee figee a la
 *              porte et la marche vers le point aurait cru etre arrivee.
 *              Hors ligne, personne d'autre n'est dessine ainsi.
 * `__affiche`: l'affiche de la seance, reconnue a la chaine de recherche que
 *              nous seuls avons posee dans son adresse. La compter par
 *              « ce qui vient d'ailleurs » ne marchait pas : une adresse
 *              injoignable ne se charge jamais, et zero aurait voulu dire
 *              deux choses. */
const ESPION = (planche, marqueur) => `(() => {
  const C = CanvasRenderingContext2D.prototype;
  if (C.__espionCine) return;
  C.__espionCine = true;
  window.__salle = 0; window.__moi = null; window.__affiche = 0;
  const di = C.drawImage;
  C.drawImage = function (im) {
    const u = (im && (im.currentSrc || im.src)) || '';
    if (u.indexOf(${JSON.stringify(planche.replace('.webp', ''))}) >= 0) window.__salle++;
    if (u.indexOf(${JSON.stringify(marqueur)}) >= 0) window.__affiche++;
    if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
        && arguments[7] === 150 && arguments[8] === 150) {
      window.__moi = { x: Math.round(arguments[5] + 75), y: Math.round(arguments[6] + 130) };
    }
    return di.apply(this, arguments);
  };
})()`;

/* Le marqueur de l'affiche : une chaine de recherche qui n'appartient qu'a
   cet essai. Le serveur d'essai coupe l'adresse au point d'interrogation,
   donc l'image existe vraiment et se charge — une affiche qui ne charge pas
   ne se dessine pas, et l'on n'aurait mesure que ca. */
const MARQUEUR_AFFICHE = 'affiche=cet-essai';

(async () => {
  const planche = plancheDeLaSalle();
  const site = await servirLeSite(SITE);
  const SEANCE = { titre: 'SWOGE NIGHT',
                   affiche: `http://127.0.0.1:${site.port}/img/nexus/tiles/nexus_magie.webp?${MARQUEUR_AFFICHE}`,
                   /* Injoignables EXPRES : rien ne doit partir sur le reseau
                      tant qu'on n'a pas clique une version. Si l'une d'elles
                      se chargeait, la promesse du panneau serait fausse. */
                   vf: 'https://exemple.invalid/vf',
                   vo: 'https://exemple.invalid/vo' };
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  await p.addInitScript(FAUSSE_SOCKET);
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);
  await p.evaluate(ESPION(planche, MARQUEUR_AFFICHE));

  const marche = async (t, ms) => {
    await p.keyboard.down(t); await p.waitForTimeout(ms);
    await p.keyboard.up(t); await p.waitForTimeout(180);
  };
  const vue = () => p.evaluate(() => {
    const v = document.getElementById('nxArcVoile');
    const c = document.getElementById('nxArcChoix');
    const i = document.getElementById('nxIndice');
    return { ouvert: !!(v && v.classList.contains('on')),
             salle: window.__salle || 0, moi: window.__moi,
             affiche: window.__affiche || 0,
             indice: i ? i.textContent : '',
             boutons: c ? [...c.querySelectorAll('button')].map((b) => b.textContent) : [] };
  });
  const fin = async (code) => {
    await p.close(); await nav.close(); site.stop();
    console.log(`\ncinema_page.test.js — ${n} verifications, ${rates + code} echec(s)`);
    process.exit(rates + code ? 1 : 0);
  };
  /* ---- ON N'ENCHAINE PAS SUR UNE ETAPE MANQUEE ----
   * C'est la facon dont un essai ment le plus facilement : la marche echoue,
   * et « rien ne s'ouvre » puis « la croix ferme » repondent vrai dans le
   * vide. Des qu'un pas manque, on s'arrete et on dit ou l'on en etait. */
  const arrete = async (m) => { console.log('  RATE ' + m); await fin(1); };

  console.log('-- on entre dans la salle --');
  /* ---- ON MARCHE VERS UN POINT, PAS PENDANT UN TEMPS ----
   *
   * Premiere version : quatorze pressions vers le nord puis dix-huit vers
   * l'ouest. Mesure faite, c'etait deux fois trop : le personnage butait sur
   * le bord haut du monde et longeait le plafond de la carte, cinq cents
   * unites AU-DESSUS du cinema. L'essai concluait que la salle n'existait
   * pas — un chiffre qui pouvait vouloir dire deux choses.
   *
   * On lit donc la position DESSINEE a chaque pas et l'on s'arrete quand on
   * est arrive. Le trajet reste en trois temps, et chacun evite quelque
   * chose de precis :
   *   1. vers l'ouest, pour s'ecarter du bassin de la fontaine, qui est un
   *      obstacle plein et bloque la montee ;
   *   2. vers le nord, a l'est de l'etal — l'etal porte une ADRESSE, donc y
   *      entrer quitte la page et tout ce qui suit ne mesurerait que du vide ;
   *   3. vers l'ouest, jusqu'a la porte.
   */
  const P = porteDuCinema();
  const E = ecranDeLaSalle();
  const ou = async () => (await vue()).moi;
  const vers = async (axe, but, sens) => {
    const touche = axe === 'x' ? (sens < 0 ? 'ArrowLeft' : 'ArrowRight')
                               : (sens < 0 ? 'ArrowUp' : 'ArrowDown');
    for (let k = 0; k < 40; k++) {
      const v0 = await vue();
      /* ---- ON S'ARRETE DES QU'ON EST ENTRE ----
       * Sans cette ligne, la marche continuait de viser une abscisse du hall
       * alors que `__moi` rendait deja des unites de la salle : quarante
       * appuis de plus vers l'ouest, et le personnage finissait plaque
       * contre le bord de l'allee, hors de portee du point de l'ecran. */
      if (v0.salle > 0) return true;
      if (!v0.moi) return false;
      if ((v0.moi[axe] - but) * sens >= -30) return true;
      await marche(touche, 250);
    }
    return false;
  };
  /* ---- ON ATTEND LA PREMIERE IMAGE, ON NE LA SUPPOSE PAS ----
   * L'espion commence par remettre la position a rien, et seule l'image
   * SUIVANTE la remplit. Mesurer dans cet intervalle — quelques
   * millisecondes — declarait le personnage absent une fois sur deux, et
   * l'essai s'arretait avant d'avoir rien mesure du tout. */
  const attendLeJoueur = async () => {
    for (let k = 0; k < 40; k++) {
      const m = await ou();
      if (m) return m;
      await p.waitForTimeout(200);
    }
    return null;
  };
  const depart = await attendLeJoueur();
  ok(!!depart, `le personnage est sur la carte (${depart ? Math.round(depart.x) + ',' + Math.round(depart.y) : 'absent'})`);
  if (!depart) await arrete('le personnage n est jamais apparu : rien ne peut etre mesure');
  await vers('x', P.x + 400, -1);
  await vers('y', P.y, -1);
  await vers('x', P.x, -1);
  /* Le sejour : on entre apres un court arret sur place, pas en passant. */
  await p.waitForTimeout(900);
  let v = await vue();
  ok(v.salle > 0, `la planche de la salle se dessine (${v.salle} fois)`);
  if (!v.salle) {
    const m = await ou();
    await arrete(`on n a pas atteint la salle (arrete a ${m ? Math.round(m.x) + ',' + Math.round(m.y) : '?'}, porte a ${Math.round(P.x)},${Math.round(P.y)})`);
  }

  console.log('-- on se place sous l ecran --');
  /* ---- ALLER A UN POINT DANS LA SALLE ----
   *
   * Une marche par axe ne suffit plus ici : on arrive au milieu de l'allee,
   * a quatre cents unites au sud du point, et le moindre ecart lateral pris
   * en entrant met le point hors de portee — il ne fait que quatre-vingt-
   * quatre unites de rayon.
   *
   * La duree de l'appui est CALCULEE sur ce qu'un appui a fait au pas
   * precedent, jamais fixee : une duree en dur avancait de soixante-six
   * unites, soit plus que la marge visee, et le personnage passait le point,
   * repartait en sens inverse, le repassait — sans jamais s'arreter dessus.
   * Un mur qui bloque ne fausse rien : l'appui n'ayant rien fait avancer, la
   * mesure precedente est conservee. */
  const versPoint = async (but, marge) => {
    let vitesse = 0;                 // unites parcourues par milliseconde d'appui
    for (let k = 0; k < 60; k++) {
      const v0 = await vue();
      /* ---- LE PANNEAU OUVERT EST UNE ARRIVEE, PAS UN ECHEC ----
       * Il s'ouvre des le RAYON du point (84 unites), alors qu'on visait sa
       * moitie ; et en s'ouvrant il fige le hall, donc plus aucun appui ne
       * fait avancer. Sans cette sortie, la boucle poussait soixante fois
       * contre un personnage immobile puis declarait qu'on n'etait jamais
       * revenu — alors que la page venait de dire le contraire. */
      if (v0.ouvert) return true;
      const a = v0.moi;
      if (!a) return false;
      const dx = but.x - a.x, dy = but.y - a.y;
      if (Math.sqrt(dx * dx + dy * dy) <= marge) return true;
      const axe = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      const reste = axe === 'x' ? dx : dy;
      const ms = vitesse ? Math.min(260, Math.max(60, Math.abs(reste) / vitesse)) : 250;
      await marche(axe === 'x' ? (reste < 0 ? 'ArrowLeft' : 'ArrowRight')
                               : (reste < 0 ? 'ArrowUp' : 'ArrowDown'), ms);
      const b = await ou();
      if (!b) return false;
      const fait = Math.abs(b[axe] - a[axe]);
      if (fait > 4) vitesse = fait / ms;
    }
    return false;
  };
  /* La moitie du rayon, et non le rayon : s'arreter au bord laisserait une
     image de decalage suffire a nous en faire sortir toute seule. */
  const MARGE = E.r / 2;
  await versPoint(E, MARGE);
  v = await vue();
  /* ---- C'EST LA PAGE QUI DIT OU L'ON EST, PAS NOUS ----
   * Notre propre geometrie pourrait etre d'accord avec elle-meme et fausse.
   * Le seul temoin qui vaille est celui que la page ecrit a l'ecran : elle
   * n'affiche le NOM du point que lorsqu'elle nous compte dessus. Sans ce
   * garde-fou, « rien ne s'ouvre » aurait ete vrai a cent unites de la. */
  ok(v.indice.indexOf(E.nom) >= 0,
     `le jeu nous compte sous l ecran (${JSON.stringify(v.indice)})`);
  if (v.indice.indexOf(E.nom) < 0) {
    await arrete(`on n est pas sur le point (arrete a ${v.moi ? Math.round(v.moi.x) + ',' + Math.round(v.moi.y) : '?'}, point a ${Math.round(E.x)},${Math.round(E.y)} rayon ${E.r})`);
  }

  console.log('-- sans seance, l ecran n ouvre rien --');
  ok(!v.ouvert, "aucun panneau ne s'ouvre tant que rien ne passe");

  console.log('-- la seance arrive par le reseau --');
  /* ---- ON DESCEND AVANT DE POUSSER LA SEANCE ----
   * En restant sur le point, le panneau se serait ouvert tout seul a l'image
   * qui suit le message : on aurait alors mesure « la table s'est remplie »,
   * pas « marcher devant l'ecran ouvre ». Et le panneau ouvert fige le hall,
   * donc on n'aurait meme plus pu en redescendre. */
  const loinDuPoint = async () => {
    for (let k = 0; k < 20; k++) {
      const m = await ou();
      if (!m) return false;
      const dx = m.x - E.x, dy = m.y - E.y;
      if (Math.sqrt(dx * dx + dy * dy) > E.r) return true;
      await marche('ArrowDown', 250);
    }
    return false;
  };
  if (!(await loinDuPoint())) await arrete('impossible de quitter le point de l ecran');
  await p.evaluate((sc) => window.__pousse({ type: 'cinema', cinema: sc }), SEANCE);
  await p.waitForTimeout(400);
  if (!(await versPoint(E, MARGE))) await arrete('impossible de revenir sur le point de l ecran');
  await p.waitForTimeout(500);
  v = await vue();
  ok(v.ouvert, 'marcher devant l ecran ouvre le panneau');
  ok(v.boutons.length === 2, `et il propose les deux versions (${v.boutons.join(', ')})`);
  /* Deux temoins de plus que la seance a bien traverse le VRAI chemin, et
     qu'on ne lit pas un panneau ouvert pour une autre raison : le titre
     envoye remplace le nom que la salle donne a son point, et l'affiche
     envoyee se dessine sur la toile. */
  ok(v.indice.indexOf(SEANCE.titre) >= 0,
     `le point porte le titre annonce (${JSON.stringify(v.indice)})`);
  ok(v.affiche > 0, `et l affiche se projette sur la toile (${v.affiche} fois)`);

  console.log('-- LA CROIX, ET CE QUI SE PASSE APRES --');
  /* ---- ON NE VERIFIE PAS UNE FERMETURE QUI N'A RIEN A FERMER ----
   * Tant que le panneau n'etait pas ouvert, « la croix ferme » et « il reste
   * ferme » repondaient vrai sans rien prouver : deux verts pour un panneau
   * qui n'avait jamais paru. Un essai qui peut passer pour la mauvaise raison
   * est pire qu'un essai absent. */
  if (!v.ouvert) {
    ok(false, 'la croix ne peut pas etre jugee : le panneau ne s est jamais ouvert');
  } else {
    /* ---- LA FERMETURE SE LIT DANS LE MEME SOUFFLE QUE LE CLIC ----
     * Le defaut rouvrait le panneau a l'image SUIVANTE, seize millisecondes
     * plus tard. Mesurer apres une attente aurait donc melange deux questions
     * en une seule reponse rouge : « la croix a-t-elle ferme » et « est-ce
     * reste ferme ». On releve la classe sans rendre la main au navigateur,
     * puis on laisse passer les images. */
    const toutDeSuite = await p.evaluate(() => {
      document.querySelector('#nxArcVoile .nxcf-x').click();
      return document.getElementById('nxArcVoile').classList.contains('on');
    });
    ok(!toutDeSuite, 'la croix retire le panneau sur-le-champ');
    /* ---- C'EST ICI QUE LE DEFAUT VIVAIT ----
     * Fermer marchait deja : ce qui ne marchait pas, c'est RESTER ferme. On
     * attend donc plusieurs images SANS TOUCHER AU CLAVIER, en restant sur le
     * point. Une seule mesure juste apres le clic aurait declare la croix
     * bonne alors qu'elle ne l'etait pas. */
    await p.waitForTimeout(1500);
    v = await vue();
    /* Et l'on verifie qu'on N'A PAS DERIVE : un panneau qui reste ferme parce
       qu'on a glisse hors du point ne prouverait rien du tout. */
    const surLePoint = v.indice.indexOf(SEANCE.titre) >= 0;
    ok(!v.ouvert && surLePoint,
       `et il RESTE ferme quand on ne bouge pas (1,5 s plus tard, toujours sous l ecran : ${surLePoint})`);

    console.log('-- on peut le rouvrir --');
    if (!(await loinDuPoint())) await arrete('impossible de quitter le point apres la fermeture');
    if (!(await versPoint(E, MARGE))) await arrete('impossible de revenir sur le point apres la fermeture');
    await p.waitForTimeout(500);
    ok((await vue()).ouvert, 'repasser devant l ecran le rouvre');
  }

  console.log('-- la page n a rien casse --');
  ok(erreurs.length === 0, erreurs.length ? 'erreurs : ' + erreurs.join(' | ') : 'aucune erreur de page');

  await fin(0);
})();
