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
 * 4. LE FOND D'ATTENTE SE DESSINE quand rien n'est choisi : une toile noire
 *    entre deux seances se lit comme un projecteur en panne. Et il COUVRE le
 *    rectangle de l'ecran au lieu de s'y etirer — une image etiree ne leve
 *    aucune erreur, elle a seulement l'air moins bien.
 * 5. LA GALERIE ARRIVE PAR LE RESEAU et l'ecran s'allume : c'est le serveur
 *    qui dit ce qui passe, jamais la page. Le catalogue montre AUTANT
 *    d'entrees qu'on en a pousse — nombre relu de ce qu'on a envoye.
 * 6. LA TABLE EST REMPLACEE ET NON COMPLETEE : on repousse une galerie plus
 *    courte, et le catalogue OUVERT retrecit sans rechargement. C'est le meme
 *    geste qui prouve l'ACCOMMODATION DE MIGRATION, puisque la forme courte
 *    est l'ancien message a une seule seance.
 * 7. RIEN NE PART SUR LE RESEAU avant le clic sur une VERSION. C'est la
 *    promesse du panneau : entrer dans une salle ne doit pas telecharger un
 *    film que personne n'a demande. On surveille les requetes, et l'on
 *    n'attend pas la fin pour le dire — on le mesure a chaque etape.
 * 8. CHOISIR UNE SEANCE PUIS UNE VERSION charge CETTE adresse-la, et pas
 *    celle de la premiere seance de la liste.
 * 9. ON REVIENT A LA GALERIE depuis une seance ouverte, et le cadre se vide.
 * 10. LA CROIX FERME — ET LE PANNEAU RESTE FERME plusieurs images durant,
 *    SANS QU'ON BOUGE ET SANS QU'ON QUITTE LE POINT. C'est la verification
 *    qui manquait le jour ou cet essai a ete ecrit.
 * 11. ON PEUT LE ROUVRIR en repassant dessus : une croix qui condamne l'ecran
 *    jusqu'a la sortie serait l'autre facon de se tromper.
 *
 * ---- LE CONTRAT DE FIL, ET SA FENETRE DE MIGRATION ----
 *
 * Le serveur annonce une GALERIE (`cinemas`) la ou il annoncait une seance
 * unique (`cinema`). Les deux depots ne se deploient pas a la meme seconde,
 * donc la page accepte encore l'ancienne forme et la traite comme une galerie
 * d'un element. Cet essai le verifie — mais SEULEMENT tant que la page le
 * fait : il relit `nexus.js` pour savoir si l'accommodation y est encore, et
 * cesse tout seul de l'exiger le jour ou elle est retiree. Un essai qui
 * reclamerait une compatibilite volontairement supprimee serait un essai qu'on
 * finit par desactiver.
 *
 * ---- LA SOCKET EST FAUSSE, ET C'EST VOULU ----
 *
 * La galerie vient du serveur. Faire tourner le vrai serveur pour cet essai
 * l'aurait rendu dependant de son etat du moment. On remplace donc le
 * constructeur WebSocket AVANT que la page ne charge — la page en fait
 * autant, elle enveloppe le notre — et l'on pousse le message tel quel. Le
 * chemin traverse est le VRAI : meme `traite`, meme `poseLesSeances`.
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

/* ---- LE FOND D'ATTENTE, D'APRES LA SOURCE ----
 * Le nom de la planche est une PROPRIETE DE LA SALLE, pas une constante du
 * cinema : le jour ou la salle manga ouvre avec la sienne, ou celui ou le
 * cinema change de fond, cet essai doit suivre sans qu'on y pense. On verifie
 * au passage que le fichier existe : une adresse qui repond 404 ne se dessine
 * jamais, et l'essai n'aurait mesure que ca. */
function fondDeLaSalle() {
  const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
  const b = src.slice(src.indexOf('var SALLE_CINE'));
  const m = b.slice(0, b.indexOf('bornes: [')).match(/fond:\s*'([^']+)'/);
  return m ? m[1] : null;
}

/* ---- LA SURFACE DE L'ECRAN, D'APRES LA SOURCE ----
 * La salle la declare ; la recopier ici aurait fait passer l'essai le jour ou
 * la piece est redessinee et ou le fond se pose a cote. */
function rectDeLEcran() {
  const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
  const b = src.slice(src.indexOf('var SALLE_CINE'));
  const e = b.slice(b.indexOf('ecran: {'), b.indexOf('}', b.indexOf('ecran: {')));
  const f = (c) => Number(e.match(new RegExp(c + ':\\s*1600 \\* ([\\d.]+)'))[1]) * 1600;
  return { l: f('x1') - f('x0'), h: f('y1') - f('y0') };
}

/* ---- L'ACCOMMODATION DE MIGRATION EST-ELLE ENCORE LA ? ----
 * On lit la page, on ne le suppose pas. Tant qu'elle rattrape l'ancien
 * message a une seule seance, cet essai l'exige ; le jour ou la ligne est
 * retiree, il arrete de la reclamer au lieu de virer au rouge pour un
 * nettoyage voulu. */
function accommodationMigration() {
  const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
  return /m\.cinemas\s*\|\|\s*\(m\.cinema/.test(src);
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
 * `__affiche`: l'affiche PROJETEE, comptee PAR SEANCE. Chaque seance porte sa
 *              propre chaine de recherche, et la table rendue dit laquelle a
 *              ete dessinee : un seul compteur aurait repondu « une affiche »
 *              sans dire si c'etait celle qu'on venait de choisir ou celle du
 *              haut de la liste. La compter par « ce qui vient d'ailleurs » ne
 *              marchait pas : une adresse injoignable ne se charge jamais, et
 *              zero aurait voulu dire deux choses.
 * `__fond`   : le fond d'attente de la salle, reconnu au nom de sa planche.
 *              C'est le temoin de « rien n'est choisi » : sans lui, une toile
 *              vide et une toile qui montre le fond se ressemblent.
 *
 * `__raz` remet les deux compteurs a zero. Sans lui on mesurait toujours
 * « depuis le debut », et « le fond se dessine encore » aurait ete vrai grace
 * a des images vieilles de trente secondes. */
const ESPION = (planche, marqueur, fond) => `(() => {
  const C = CanvasRenderingContext2D.prototype;
  if (C.__espionCine) return;
  C.__espionCine = true;
  window.__salle = 0; window.__moi = null;
  window.__raz = () => { window.__affiche = {}; window.__fond = 0; window.__fondArgs = null; };
  window.__raz();
  const MARQ = ${JSON.stringify(marqueur)};
  const di = C.drawImage;
  C.drawImage = function (im) {
    const u = (im && (im.currentSrc || im.src)) || '';
    if (u.indexOf(${JSON.stringify(planche.replace('.webp', ''))}) >= 0) window.__salle++;
    if (u.indexOf(${JSON.stringify(fond)}) >= 0) {
      window.__fond++;
      /* ---- ON RELEVE COMMENT IL EST POSE, PAS SEULEMENT QU'IL L'EST ----
       * Une image ETIREE se dessine aussi : elle ne leve aucune erreur, elle a
       * juste l'air moins bien. Le seul chiffre qui separe « couvre » de
       * « s'etire » est la forme de l'appel — neuf arguments, donc un decoupage
       * dans la source — et le rapport de ce qu'on y decoupe. */
      window.__fondArgs = { n: arguments.length,
                            a: [].slice.call(arguments, 1).map((x) => Math.round(x)) };
    }
    const q = u.indexOf(MARQ);
    if (q >= 0) {
      const k = u.slice(q);
      window.__affiche[k] = (window.__affiche[k] || 0) + 1;
    }
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
  const fond = fondDeLaSalle();
  const site = await servirLeSite(SITE);
  /* ---- TROIS SEANCES, ET PAS UNE ----
   * Le catalogue ne se distingue d'un raccourci vers la premiere entree que
   * s'il y en a plusieurs. Chacune a son affiche MARQUEE : c'est ce qui
   * permettra de dire laquelle a ete projetee, et de refuser un essai qui
   * passerait parce que la page dessine toujours la premiere.
   * Les adresses de lecture sont INJOIGNABLES EXPRES : rien ne doit partir
   * sur le reseau tant qu'on n'a pas clique une version, et si l'une d'elles
   * se chargeait la promesse du panneau serait fausse. */
  /* Un titre qui RESSEMBLE A DU BALISAGE : les titres sont saisis dans le
     panneau d'administration et traversent le serveur tels quels. Pose en
     `innerHTML`, celui-ci deviendrait un element de notre page ; en
     `textContent` il reste ce qu'il est, un titre bizarre. C'est la seule
     facon de le prouver — un titre sage passerait des deux facons. */
  const SEANCES = ['SWOGE NIGHT', 'MOON <b>RUNNER</b>', 'LAST TRAIN'].map((t, i) => ({
    titre: t,
    affiche: `http://127.0.0.1:${site.port}/img/nexus/tiles/nexus_magie.webp?${MARQUEUR_AFFICHE}-${i}`,
    vf: `https://exemple.invalid/vf-${i}`,
    vo: `https://exemple.invalid/vo-${i}`,
  }));
  /* Le nombre attendu est RELU de ce qu'on pousse : ecrire « 3 » aurait fait
     passer l'essai le jour ou l'on ajoute une quatrieme seance ici sans que
     la page la montre. */
  const COMBIEN = SEANCES.length;
  /* Toutes les adresses de lecture, prises de ce qu'on a envoye : c'est la
     liste de ce qui n'a PAS le droit de partir sur le reseau avant un clic. */
  const ADRESSES = SEANCES.reduce((a, s) => a.concat([s.vf, s.vo]), []);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  /* ---- CE QUI PART VERS UN LECTEUR ----
   * On ne compte pas « les requetes » : la page en fait des centaines pour
   * ses propres planches, et le catalogue demande les AFFICHES, ce qui est
   * normal et voulu. On ne retient que ce qui vise une adresse de lecture —
   * la seule chose qui ne doit pas partir sans qu'on l'ait demandee. */
  const versLesLecteurs = [];
  p.on('request', (r) => {
    const u = r.url();
    if (ADRESSES.some((a) => u.indexOf(a) === 0)) versLesLecteurs.push(u);
  });
  await p.addInitScript(FAUSSE_SOCKET);
  await p.goto(`http://127.0.0.1:${site.port}/nexus.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);
  await p.evaluate(ESPION(planche, MARQUEUR_AFFICHE, fond ? path.basename(fond, '.webp') : 'ecran_cinema'));

  const marche = async (t, ms) => {
    await p.keyboard.down(t); await p.waitForTimeout(ms);
    await p.keyboard.up(t); await p.waitForTimeout(180);
  };
  /* Tout se lit dans le DOM et sur la toile, jamais dans une variable de la
     page : ce que le joueur voit est la seule chose qui compte, et une
     variable juste sous un affichage faux resterait verte. Les listes sont
     relevees SEULEMENT si leur conteneur est visible — un catalogue masque
     qui garde ses boutons aurait compte comme un catalogue affiche. */
  const vue = () => p.evaluate(() => {
    const v = document.getElementById('nxArcVoile');
    const c = document.getElementById('nxArcChoix');
    const g = document.getElementById('nxArcCat');
    const i = document.getElementById('nxIndice');
    const f = document.getElementById('nxArcJeu');
    const vus = (el) => (el && !el.hidden) ? [...el.querySelectorAll(':scope > button')] : [];
    return { ouvert: !!(v && v.classList.contains('on')),
             salle: window.__salle || 0, moi: window.__moi,
             affiche: window.__affiche || {}, fond: window.__fond || 0,
             fondArgs: window.__fondArgs || null,
             indice: i ? i.textContent : '',
             cadre: f ? f.getAttribute('src') : '',
             cat: vus(g).map((b) => {
               const t = b.querySelector('.nxarc-nom');
               /* `brut` est le balisage REELLEMENT produit : un titre pose en
                  `textContent` y ressort echappe, pose en `innerHTML` il y
                  ressort en elements. Comparer les deux textes n'aurait rien
                  distingue — `textContent` rend la meme chaine dans les deux
                  cas. */
               return { titre: t ? t.textContent : '', brut: t ? t.innerHTML : '',
                        vignette: !!b.querySelector('.nxarc-vign') };
             }),
             /* Le retour est un bouton de la meme barre : on le distingue par
                sa classe et par l'absence d'adresse, sinon « deux versions »
                aurait ete vrai avec une version et un retour. */
             boutons: vus(c).map((b) => ({ nom: b.textContent,
                                           src: b.getAttribute('data-src'),
                                           retour: b.classList.contains('nxarc-retour') })) };
  });
  const raz = () => p.evaluate(() => window.__raz());
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

  console.log('-- le fond d attente est sur la toile --');
  /* ---- RIEN DE CHOISI N'EST PAS RIEN A MONTRER ----
   * On remet le compteur a zero et l'on regarde les images SUIVANTES : mesure
   * depuis le debut, « le fond se dessine » aurait pu tenir a une image
   * vieille de trente secondes. La toile de la salle est un rectangle releve
   * dans la source ; le laisser noir entre deux seances se lit comme un
   * projecteur en panne. */
  ok(!!fond, `la salle declare son fond d attente (${fond || 'aucun'})`);
  /* Sans `&&`, cette verification DISPARAISSAIT quand la salle ne declare
     rien : le total passait de 31 a 30 et deux executions ne se comparaient
     plus. Un essai dont le nombre de questions depend de la reponse ne se
     relit pas. */
  ok(!!fond && fs.existsSync(path.join(SITE, fond)), `et la planche existe (${fond})`);
  await raz();
  await p.waitForTimeout(600);
  v = await vue();
  ok(v.fond > 0, `le fond d attente se dessine quand rien n est choisi (${v.fond} fois)`);
  /* ---- IL COUVRE, IL NE S'ETIRE PAS ----
   * La planche fait 2,00:1 et la surface d'ecran 2,02:1 : l'ecart est trop
   * faible pour se voir sur une capture, et trop grand pour ne pas se sentir.
   * Deux mesures, parce qu'un fond peut etre juste sur l'une et faux sur
   * l'autre : il remplit LE rectangle que la salle declare, et ce qu'on
   * decoupe dans la source a le MEME rapport que ce rectangle — donc rien
   * n'est deforme. Les deux chiffres viennent de la source et du moteur,
   * aucun n'est ecrit ici. */
  const R = rectDeLEcran();
  const FA = v.fondArgs;
  ok(!!FA && Math.abs(FA.a[FA.n === 9 ? 6 : 2] - R.l) <= 1
          && Math.abs(FA.a[FA.n === 9 ? 7 : 3] - R.h) <= 1,
     `et il remplit le rectangle que la salle declare (${Math.round(R.l)}x${Math.round(R.h)}, pose ${FA ? FA.a.slice(-2).join('x') : 'nulle part'})`);
  const deforme = (FA && FA.n === 9)
    ? Math.abs((FA.a[2] / FA.a[3]) / (R.l / R.h) - 1) : 1;
  ok(deforme < 0.005,
     `et il est DECOUPE dans sa planche, pas etire (${FA ? FA.n : 0} arguments, deformation ${(deforme * 100).toFixed(2)} %)`);

  console.log('-- la galerie arrive par le reseau --');
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
  await p.evaluate((l) => window.__pousse({ type: 'cinema', cinemas: l }), SEANCES);
  await p.waitForTimeout(400);
  if (!(await versPoint(E, MARGE))) await arrete('impossible de revenir sur le point de l ecran');
  await p.waitForTimeout(500);
  v = await vue();
  ok(v.ouvert, 'marcher devant l ecran ouvre le panneau');
  if (!v.ouvert) await arrete('le panneau ne s est pas ouvert : le catalogue ne peut pas etre juge');

  console.log('-- LE CATALOGUE --');
  /* Le nombre vient de ce qu'on a POUSSE, jamais d'un chiffre ecrit ici : un
     essai qui code en dur ce qu'il verifie ne verifie plus rien. */
  ok(v.cat.length === COMBIEN,
     `le catalogue montre autant d entrees qu il y a de seances (${v.cat.length} pour ${COMBIEN})`);
  const titresVus = v.cat.map((c) => c.titre);
  ok(SEANCES.every((s) => titresVus.indexOf(s.titre) >= 0),
     `et chaque titre annonce y figure (${JSON.stringify(titresVus)})`);
  /* La vignette tient sa place meme quand l'affiche ne vient pas : c'est elle
     qui empeche un trou dans la grille. On verifie qu'elle est la pour
     TOUTES, pas seulement pour celles dont l'image a repondu. */
  /* ---- ON N'INTERROGE PAS UNE GRILLE VIDE ----
   * `every` repond VRAI sur une liste vide : sans cet arret, un catalogue qui
   * ne s'affiche pas donnait deux verts — « chaque entree porte sa vignette »
   * et « aucun titre n a pose de balise » — juste au-dessous du rouge qui
   * disait qu'il n'y avait aucune entree. */
  if (v.cat.length !== COMBIEN) {
    await arrete(`le catalogue ne montre pas la galerie poussee (${v.cat.length} pour ${COMBIEN}) : la suite repondrait vrai dans le vide`);
  }
  ok(v.cat.every((c) => c.vignette), 'chaque entree porte sa vignette');
  ok(v.cat.every((c) => !/<[a-z]/i.test(c.brut)),
     `et aucun titre n a pose de balise dans la page (${JSON.stringify(v.cat.map((c) => c.brut))})`);
  ok(v.boutons.length === 0,
     `aucune version proposee tant qu on n a pas choisi de seance (${JSON.stringify(v.boutons.map((b) => b.nom))})`);
  ok(versLesLecteurs.length === 0,
     `et rien n est encore parti vers un lecteur (${versLesLecteurs.length} requete(s))`);

  console.log('-- la table est REMPLACEE, pas completee --');
  /* ---- LE MEME GESTE PROUVE DEUX CHOSES ----
   * Une galerie plus courte poussee sur un catalogue OUVERT : s'il retrecit
   * sans rechargement, c'est que la table est remplacee et que le panneau la
   * tient par reference. Et comme la forme courte utilisee ici est l'ANCIEN
   * message a une seule seance, c'est aussi l'accommodation de migration qui
   * est verifiee — tant que la page la porte encore. */
  const migration = accommodationMigration();
  if (migration) {
    await p.evaluate((sc) => window.__pousse({ type: 'cinema', cinema: sc }), SEANCES[0]);
    await p.waitForTimeout(300);
    v = await vue();
    ok(v.cat.length === 1 && v.cat[0].titre === SEANCES[0].titre,
       `l ancien message a une seance est encore compris (${JSON.stringify(v.cat.map((c) => c.titre))})`);
  } else {
    ok(true, 'l accommodation de migration a ete retiree de la page : plus rien a verifier');
  }
  await p.evaluate((l) => window.__pousse({ type: 'cinema', cinemas: l }), SEANCES);
  await p.waitForTimeout(300);
  v = await vue();
  ok(v.cat.length === COMBIEN,
     `et la galerie complete revient sans rechargement (${v.cat.length} pour ${COMBIEN})`);
  if (v.cat.length !== COMBIEN) await arrete('le catalogue ne suit pas la table : la suite ne mesurerait rien');

  console.log('-- on choisit une seance, puis une version --');
  /* ---- PAS LA PREMIERE ----
   * L'ancienne page n'ouvrait QUE `FILMS[0]`. Choisir la premiere entree
   * aurait donc laisse passer exactement le defaut qu'on corrige : on prend
   * la DERNIERE, et l'on verifie que c'est bien son adresse qui part. */
  const CHOISIE = SEANCES[SEANCES.length - 1];
  const rang = titresVus.indexOf(CHOISIE.titre);
  ok(rang >= 0, `la seance visee est bien dans le catalogue (${CHOISIE.titre})`);
  if (rang < 0) await arrete('la seance visee n est pas dans le catalogue');
  await raz();
  await p.evaluate((i) => {
    document.querySelectorAll('#nxArcCat > button')[i].click();
  }, rang);
  await p.waitForTimeout(500);
  v = await vue();
  const versions = v.boutons.filter((b) => !b.retour);
  ok(versions.length === 2 && v.boutons.some((b) => b.retour),
     `choisir une seance montre ses versions et le retour (${JSON.stringify(v.boutons.map((b) => b.nom))})`);
  ok(v.cadre === 'about:blank' && versLesLecteurs.length === 0,
     `et TOUJOURS rien sur le reseau avant le clic sur une version (cadre ${v.cadre}, ${versLesLecteurs.length} requete(s))`);
  /* L'affiche projetee est celle de la seance choisie, et non celle du haut
     de la liste : c'est la meme question que « quelle adresse va partir »,
     posee a la toile. */
  const marqueChoisie = CHOISIE.affiche.slice(CHOISIE.affiche.indexOf(MARQUEUR_AFFICHE));
  ok(v.affiche[marqueChoisie] > 0,
     `l ecran de la salle projette l affiche de CETTE seance (${JSON.stringify(Object.keys(v.affiche))})`);

  const vo = versions.filter((b) => b.src === CHOISIE.vo)[0];
  ok(!!vo, `la version VO porte l adresse annoncee (${JSON.stringify(versions.map((b) => b.src))})`);
  if (!vo) await arrete('aucune version ne porte l adresse annoncee');
  await p.evaluate((src) => {
    document.querySelector('#nxArcChoix button[data-src="' + src + '"]').click();
  }, CHOISIE.vo);
  await p.waitForTimeout(900);
  v = await vue();
  ok(v.cadre === CHOISIE.vo, `cliquer la version charge CETTE adresse (${v.cadre})`);
  ok(versLesLecteurs.length > 0 && versLesLecteurs.every((u) => u.indexOf(CHOISIE.vo) === 0),
     `et le reseau ne voit QUE celle-la (${JSON.stringify(versLesLecteurs)})`);

  console.log('-- on revient au catalogue --');
  await p.evaluate(() => document.querySelector('#nxArcChoix button.nxarc-retour').click());
  await p.waitForTimeout(400);
  v = await vue();
  ok(v.cat.length === COMBIEN && v.boutons.length === 0,
     `le retour ramene la galerie entiere (${v.cat.length} entrees, ${v.boutons.length} bouton(s) de version)`);
  /* Le cadre VIDE et pas seulement cache : un lecteur laisse en place
     continuait de jouer son son derriere les affiches. */
  ok(v.cadre === 'about:blank', `et le lecteur est detruit, pas masque (cadre ${v.cadre})`);

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
       qu'on a glisse hors du point ne prouverait rien du tout.
       Le temoin est le NOM DU POINT et non plus le titre de la seance : le
       point ne porte plus le titre du film — il y en a douze — et la salle
       nomme le sien dans la source, d'ou l'essai le relit. */
    const surLePoint = v.indice.indexOf(E.nom) >= 0;
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
