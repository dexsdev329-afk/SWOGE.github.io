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
 * ---- CE QUE LE PANNEAU EST DEVENU ----
 *
 * Une grille de vignettes disait « voici douze cases », pas « voici ce qui
 * passe ce soir ». Le panneau est maintenant une page de presentation : une
 * BANNIERE en haut — l'affiche de la seance mise en avant en fond large et
 * assombrie, son titre en grand, une ligne d'information, et SES BOUTONS DE
 * VERSION — puis, en dessous, UNE RANGEE PAR RUBRIQUE (films, mangas,
 * series), qui servent a changer la banniere et a rien d'autre.
 *
 * Ce dessin cree une donnee de plus : « laquelle est en avant ». Une donnee de
 * plus est une occasion de plus de se contredire, et c'est ce que cet essai
 * traque le plus serieusement — la banniere qui annonce un film pendant que le
 * cadre en joue un autre, la banniere restee sur une seance que le serveur
 * vient de retirer, l'affiche cliquee qui telecharge un film que personne n'a
 * demande.
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
 *    qui dit ce qui passe, jamais la page. La RANGEE montre AUTANT d'entrees
 *    qu'on en a pousse — nombre relu de ce qu'on a envoye.
 * 6. LA BANNIERE MONTRE UNE SEANCE, et son titre est l'un de ceux qu'on a
 *    pousses — relu de ce qu'on pousse, jamais ecrit en dur. Les BOUTONS DE
 *    VERSION sont DEDANS (prouve par la parente, pas par leur existence), et
 *    ce sont ceux de cette seance-la.
 * 7. LA TABLE EST REMPLACEE ET NON COMPLETEE : on repousse une galerie plus
 *    courte, et le catalogue OUVERT retrecit sans rechargement. C'est le meme
 *    geste qui prouve l'ACCOMMODATION DE MIGRATION, puisque la forme courte
 *    est l'ancien message a une seule seance.
 * 8. CLIQUER UNE AFFICHE DE LA RANGEE PROMEUT cette seance dans la banniere —
 *    et NE CHARGE RIEN. La rangee la marque, la banniere prend ses versions,
 *    le cadre reste vide et le reseau muet.
 * 9. RIEN NE PART SUR LE RESEAU avant le clic sur une VERSION. C'est la
 *    promesse du panneau : entrer dans une salle ne doit pas telecharger un
 *    film que personne n'a demande. On surveille les requetes, et l'on
 *    n'attend pas la fin pour le dire — on le mesure a chaque etape.
 * 10. LA VEDETTE TIENT D'UNE ANNONCE A L'AUTRE. On repousse la MEME galerie
 *    et la banniere ne bouge pas. Sans cette etape, la verification suivante
 *    serait vraie d'une page qui retombe sur la premiere du rang a chaque
 *    message — la bonne reponse pour la mauvaise raison.
 * 11. LE SERVEUR RETIRE LA SEANCE EN VEDETTE : la banniere se rabat sur une
 *    seance ENCORE a l'affiche, et ses boutons de version pointent sur ELLE.
 *    Un titre de repli au-dessus de boutons restes sur le fantome serait le
 *    pire des deux mondes.
 * 12. CLIQUER UNE VERSION DANS LA BANNIERE charge CETTE adresse-la, fait
 *    apparaitre le retour, replie la banniere, et projette l'affiche de cette
 *    seance sur la toile de la salle.
 * 13. LE CADRE DU LECTEUR NE PORTE AUCUN BAC A SABLE. Il en a porte un, et
 *    `allow-popups` n'a pas suffi : un hebergeur a repondu « Streaming
 *    Blocked — the page is running in a sandboxed environment » a la place
 *    du film. Le proprietaire a tranche. Cette verification n'est donc pas
 *    la pour proteger quoi que ce soit — elle est la pour que personne ne le
 *    REMETTE par reflexe sans savoir que ca casse le lecteur sur telephone.
 * 14. ON REVIENT A LA GALERIE, le cadre se vide, et la banniere retrouve la
 *    seance qu'on venait de voir — pas la premiere du rang.
 * 15. LA CROIX FERME — ET LE PANNEAU RESTE FERME plusieurs images durant,
 *    SANS QU'ON BOUGE ET SANS QU'ON QUITTE LE POINT. C'est la verification
 *    qui manquait le jour ou cet essai a ete ecrit.
 * 16. ON PEUT LE ROUVRIR en repassant dessus : une croix qui condamne l'ecran
 *    jusqu'a la sortie serait l'autre facon de se tromper.
 * 17. LES RANGEES SUIVENT UNE SEULE REGLE : on ecarte les rubriques vides,
 *    puis celle de la SALLE passe en premier, les autres suivant dans l'ordre
 *    ou le serveur les annonce. Verifiee sous trois eclairages — une rubrique
 *    vide n'apparait pas, celle de la salle est en tete, et quand c'est ELLE
 *    qui est vide la suivante annoncee prend la place sans qu'aucune ligne du
 *    code ne parle de ce cas. La cle de la salle est relue de la source, les
 *    noms de rubrique sont inventes par l'essai.
 * 18. UNE SEULE GALERIE SUR LE FIL DONNE UNE SEULE RANGEE, avant comme apres
 *    un message par rubriques : c'est la forme que le serveur envoie encore
 *    aujourd'hui, et elle ne doit pas avoir de branche a elle.
 * 19. AU POUCE, SUR 412 px : aucun debord horizontal — ni de la carte, ni de
 *    la page — et chaque cible tactile du dessin tient les quarante-quatre
 *    pixels. La rangee d'affiches defile a l'horizontale, ce qui est
 *    exactement le genre de dessin qui pousse une barre sous toute la page si
 *    le defilement n'est pas confine.
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

/* ---- LA RUBRIQUE DE LA SALLE, D'APRES LA SOURCE ----
 * C'est la salle qui declare sous quelle cle le serveur annonce SA galerie, et
 * c'est cette cle qui doit passer en tete des rangees. La recopier ici aurait
 * fait passer l'essai le jour ou la salle change de rubrique — ou pire, le
 * jour ou quelqu'un ecrit la cle en dur dans le panneau partage, ce qui est
 * precisement la faute que cette salle a deja payee trois fois. */
function rubriqueDeLaSalle() {
  const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
  const b = src.slice(src.indexOf('var SALLE_CINE'));
  const m = b.slice(0, b.indexOf('bornes: [')).match(/rubrique:\s*'([^']*)'/);
  return m ? m[1] : null;
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
    /* Les affiches ne sont plus les enfants directs du catalogue : elles vivent
       dans des RANGEES, une par rubrique. On les releve a plat pour tout ce qui
       ne regarde que « quelles seances sont proposees », et par rangee pour ce
       qui regarde l'ordre et les intitules. Le catalogue masque ne rend rien —
       une grille cachee qui garde ses boutons aurait compte comme affichee. */
    const vues = (el) => (el && !el.hidden) ? [...el.querySelectorAll('button')] : [];
    return { ouvert: !!(v && v.classList.contains('on')),
             salle: window.__salle || 0, moi: window.__moi,
             affiche: window.__affiche || {}, fond: window.__fond || 0,
             fondArgs: window.__fondArgs || null,
             indice: i ? i.textContent : '',
             cadre: f ? f.getAttribute('src') : '',
             /* Ce que le cadre etranger a le DROIT de faire. On releve
                l'attribut tel quel : les jetons sont compares un par un plus
                bas, parce que l'ordre d'une liste de permissions n'engage
                personne et qu'un essai qui recopie la chaine entiere tombe le
                jour ou quelqu'un la reecrit dans un autre ordre. */
             bac: f ? f.getAttribute('sandbox') : null,
             /* ---- LES RANGEES ----
              * Leur ORDRE est la question, donc on les releve dans l'ordre du
              * document. `brut` sur l'intitule pour la meme raison que sur les
              * titres : le nom d'une rubrique vient du serveur, donc d'un
              * humain, et une balise posee en `innerHTML` s'executerait dans la
              * page de chaque joueur. */
             rangs: (g && !g.hidden)
               ? [...g.querySelectorAll('.nxarc-rang')].map((sec) => {
                   const h = sec.querySelector('.nxarc-rang-nom');
                   return { nom: h ? h.textContent : '',
                            brut: h ? h.innerHTML : '',
                            titres: [...sec.querySelectorAll('button .nxarc-nom')]
                                      .map((t) => t.textContent) };
                 })
               : [],
             cat: vues(g).map((b) => {
               const t = b.querySelector('.nxarc-nom');
               /* `brut` est le balisage REELLEMENT produit : un titre pose en
                  `textContent` y ressort echappe, pose en `innerHTML` il y
                  ressort en elements. Comparer les deux textes n'aurait rien
                  distingue — `textContent` rend la meme chaine dans les deux
                  cas. */
               return { titre: t ? t.textContent : '', brut: t ? t.innerHTML : '',
                        vignette: !!b.querySelector('.nxarc-vign'),
                        /* Ce que la rangee dit de la seance mise en avant. Sans
                           ce releve, « la banniere a change » aurait pu etre
                           vrai pendant que la rangee marquait encore l'autre. */
                        marquee: b.classList.contains('actif') };
             }),
             /* ---- LA BANNIERE ----
              * On releve ce qu'elle ANNONCE, et aussi OU sont les boutons de
              * version : « ils existent » et « ils sont dans la banniere » sont
              * deux questions differentes, et seule la parente repond a la
              * seconde. `plate` est l'etat sans decor — lecteur ouvert, ou
              * borne d'arcade. */
             une: (() => {
               const u = document.getElementById('nxArcUne');
               const t = document.getElementById('nxArcUneTitre');
               const nf = document.getElementById('nxArcUneFond');
               const inf = document.getElementById('nxArcUneInfo');
               const im = nf ? nf.querySelector('img') : null;
               return { existe: !!u,
                        plate: !!(u && u.classList.contains('nxarc-plate')),
                        titre: t ? t.textContent : '',
                        brut: t ? t.innerHTML : '',
                        info: inf ? inf.textContent : '',
                        affiche: im ? im.getAttribute('src') : '',
                        porteLesVersions: !!(u && c && u.contains(c)) };
             })(),
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

  console.log('-- LA RANGEE D AFFICHES --');
  /* Le nombre vient de ce qu'on a POUSSE, jamais d'un chiffre ecrit ici : un
     essai qui code en dur ce qu'il verifie ne verifie plus rien. */
  ok(v.cat.length === COMBIEN,
     `la rangee montre autant d entrees qu il y a de seances (${v.cat.length} pour ${COMBIEN})`);
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
  /* ---- UNE SEULE GALERIE SUR LE FIL DONNE UNE SEULE RANGEE ----
   * C'est la forme que le serveur envoie encore aujourd'hui. Le catalogue par
   * rubriques ne doit pas avoir besoin d'une branche pour elle : une rubrique
   * donne une rangee, et rien d'autre ne change. */
  ok(v.rangs.length === 1,
     `une galerie plate donne UNE rangee (${v.rangs.length})`);

  console.log('-- LA BANNIERE --');
  /* ---- ELLE MONTRE UNE SEANCE, ET C'EST L'UNE DES NOTRES ----
   * Le titre attendu est RELU de ce qu'on a pousse. Ecrire ici le nom du film
   * aurait fait passer l'essai le jour ou la banniere annonce autre chose que
   * ce que le serveur annonce — c'est-a-dire exactement le defaut a attraper. */
  const titresPousses = SEANCES.map((s) => s.titre);
  ok(titresPousses.indexOf(v.une.titre) >= 0,
     `la banniere annonce une seance poussee (${JSON.stringify(v.une.titre)})`);
  if (titresPousses.indexOf(v.une.titre) < 0) {
    await arrete('la banniere n annonce aucune des seances poussees : la suite ne mesurerait rien');
  }
  /* Le titre de la banniere vient du meme panneau d'administration que ceux de
     la rangee : pose en `innerHTML`, une balise y serait executee dans la page
     de chaque joueur. Le releve est le BALISAGE produit, pas le texte rendu —
     `textContent` rend la meme chaine des deux facons. */
  ok(!/<[a-z]/i.test(v.une.brut),
     `et son titre n a pose aucune balise dans la page (${JSON.stringify(v.une.brut)})`);
  ok(!v.une.plate, 'et elle porte bien son decor, pas la forme repliee du lecteur');
  /* ---- LES BOUTONS DE VERSION SONT DEDANS ----
   * « Il y a deux boutons quelque part dans le panneau » ne dit rien : la
   * demande est qu'ils soient DANS la banniere. Seule la parente le prouve. */
  ok(v.une.porteLesVersions,
     'les boutons de version sont dans la banniere, pas a cote');
  const vedette = SEANCES.filter((s) => s.titre === v.une.titre)[0];
  const versionsUne = v.boutons.filter((b) => !b.retour).map((b) => b.src).sort();
  ok(versionsUne.length === 2
     && versionsUne.join('|') === [vedette.vf, vedette.vo].sort().join('|'),
     `et ce sont les versions de CETTE seance (${JSON.stringify(versionsUne)})`);
  /* Le retour n'a de sens qu'en sortant d'un lecteur : le proposer dans la
     galerie donnerait un bouton qui ramene la ou l'on est deja. */
  ok(!v.boutons.some((b) => b.retour),
     'et aucun retour n est propose tant qu on parcourt');
  ok(versLesLecteurs.length === 0 && v.cadre === 'about:blank',
     `et rien n est encore parti vers un lecteur (cadre ${v.cadre}, ${versLesLecteurs.length} requete(s))`);
  /* ---- ON MET LE PIEGE DANS LA BANNIERE, SINON ON NE PROUVE RIEN ----
   * La banniere s'ouvre sur la premiere seance, dont le titre est sage : « son
   * titre n'a pose aucune balise » etait donc vrai d'une banniere qui pose TOUT
   * en `innerHTML`. Mesure faite en annulant la correction — la verification
   * ci-dessus est restee verte pendant que la banniere posait du balisage.
   * On met donc en avant CELLE dont le titre est un piege, et l'on relit le
   * balisage produit. Le piege est retrouve dans ce qu'on pousse, jamais ecrit
   * ici : le jour ou l'essai change ses titres, il suit. */
  const PIEGE = SEANCES.filter((x) => /<[a-z]/i.test(x.titre))[0];
  ok(!!PIEGE,
     `l essai pousse bien un titre qui ressemble a du balisage (${JSON.stringify(PIEGE && PIEGE.titre)})`);
  if (!PIEGE) await arrete('aucun titre piege parmi les seances poussees : l echappement ne peut pas etre juge');
  const rangPiege = v.cat.map((c) => c.titre).indexOf(PIEGE.titre);
  if (rangPiege < 0) await arrete('le titre piege n est pas dans la rangee : on ne peut pas le mettre en banniere');
  await p.evaluate((i) => {
    document.querySelectorAll('#nxArcCat button')[i].click();
  }, rangPiege);
  await p.waitForTimeout(400);
  v = await vue();
  ok(v.une.titre === PIEGE.titre && !/<[a-z]/i.test(v.une.brut),
     `et mise en banniere elle y reste un TITRE, pas un element (${JSON.stringify(v.une.brut)})`);

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

  console.log('-- cliquer une affiche PROMEUT, et ne charge rien --');
  /* ---- PAS LA PREMIERE ----
   * L'ancienne page n'ouvrait QUE `FILMS[0]`, et la banniere s'ouvre sur la
   * premiere du rang : promouvoir la premiere entree aurait donc laisse passer
   * les deux defauts a la fois. On prend la DERNIERE. */
  const CHOISIE = SEANCES[SEANCES.length - 1];
  const rang = titresVus.indexOf(CHOISIE.titre);
  ok(rang >= 0, `la seance visee est bien dans la rangee (${CHOISIE.titre})`);
  if (rang < 0) await arrete('la seance visee n est pas dans la rangee');
  /* Si elle etait DEJA en banniere, le clic ne prouverait rien : « la banniere
     montre cette seance » serait vrai avant comme apres. */
  ok(v.une.titre !== CHOISIE.titre,
     `et ce n est pas deja elle qui est en banniere (${JSON.stringify(v.une.titre)})`);
  if (v.une.titre === CHOISIE.titre) {
    await arrete('la seance visee est deja en banniere : le clic ne prouverait rien');
  }
  await raz();
  await p.evaluate((i) => {
    document.querySelectorAll('#nxArcCat button')[i].click();
  }, rang);
  await p.waitForTimeout(500);
  v = await vue();
  ok(v.une.titre === CHOISIE.titre,
     `cliquer une affiche met CETTE seance en banniere (${JSON.stringify(v.une.titre)})`);
  const marquees = v.cat.filter((c) => c.marquee).map((c) => c.titre);
  ok(marquees.length === 1 && marquees[0] === CHOISIE.titre,
     `et la rangee marque celle qui est en avant, elle seule (${JSON.stringify(marquees)})`);
  const versions = v.boutons.filter((b) => !b.retour);
  ok(versions.length === 2
     && versions.map((b) => b.src).sort().join('|')
        === [CHOISIE.vf, CHOISIE.vo].sort().join('|'),
     `et la banniere porte SES versions (${JSON.stringify(versions.map((b) => b.src))})`);
  /* ---- LA PROMESSE DU PANNEAU ----
   * Promouvoir n'est pas lire. Une affiche cliquee qui remplirait le cadre
   * telechargerait un film pour l'avoir regarde de loin. */
  ok(v.cadre === 'about:blank' && versLesLecteurs.length === 0,
     `et promouvoir n a RIEN charge (cadre ${v.cadre}, ${versLesLecteurs.length} requete(s))`);
  ok(v.cat.length === COMBIEN,
     `et la rangee montre toujours toutes les seances (${v.cat.length} pour ${COMBIEN})`);

  console.log('-- le serveur retire la seance en vedette --');
  /* ---- D'ABORD PROUVER QUE LA VEDETTE TIENT ----
   * Sans cette etape, « la banniere en montre une autre » serait vrai aussi
   * d'une page qui retombe sur la premiere du rang a CHAQUE annonce du
   * serveur : la bonne reponse pour la mauvaise raison. On repousse donc la
   * MEME galerie, et l'on verifie que la banniere ne bouge pas. */
  await p.evaluate((l) => window.__pousse({ type: 'cinema', cinemas: l }), SEANCES);
  await p.waitForTimeout(400);
  v = await vue();
  ok(v.une.titre === CHOISIE.titre,
     `une annonce du serveur ne deplace pas la vedette (${JSON.stringify(v.une.titre)})`);
  /* La galerie sans la seance en avant. Ce qui RESTE est relu de ce qu'on
     envoie : ecrire ici le titre de repli aurait fige l'essai sur un choix de
     la page au lieu de le verifier. */
  const SANS = SEANCES.filter((s) => s.titre !== CHOISIE.titre);
  await p.evaluate((l) => window.__pousse({ type: 'cinema', cinemas: l }), SANS);
  await p.waitForTimeout(400);
  v = await vue();
  ok(v.cat.length === SANS.length,
     `la rangee suit la galerie raccourcie (${v.cat.length} pour ${SANS.length})`);
  const restants = SANS.map((s) => s.titre);
  ok(v.une.titre !== CHOISIE.titre && restants.indexOf(v.une.titre) >= 0,
     `et la banniere se rabat sur une seance ENCORE a l affiche (${JSON.stringify(v.une.titre)})`);
  /* Un titre de repli juste au-dessus de boutons restes sur le fantome serait
     le pire des deux mondes : la banniere aurait l'air d'avoir suivi, et son
     bouton chargerait ce que le proprietaire vient de retirer. */
  const repli = SANS.filter((s) => s.titre === v.une.titre)[0];
  const srcsUne = v.boutons.filter((b) => !b.retour).map((b) => b.src);
  ok(!!repli && srcsUne.length === 2
     && srcsUne.every((u) => u === repli.vf || u === repli.vo),
     `et ses boutons de version pointent sur ELLE, pas sur la retiree (${JSON.stringify(srcsUne)})`);
  ok(versLesLecteurs.length === 0,
     `et rien n est parti vers un lecteur pendant tout cela (${versLesLecteurs.length} requete(s))`);

  console.log('-- on remet la galerie entiere, et on repromeut --');
  await p.evaluate((l) => window.__pousse({ type: 'cinema', cinemas: l }), SEANCES);
  await p.waitForTimeout(400);
  v = await vue();
  ok(v.cat.length === COMBIEN,
     `la galerie entiere revient (${v.cat.length} pour ${COMBIEN})`);
  const rang2 = v.cat.map((c) => c.titre).indexOf(CHOISIE.titre);
  if (rang2 < 0) await arrete('la seance visee n est pas revenue dans la rangee');
  await raz();
  await p.evaluate((i) => {
    document.querySelectorAll('#nxArcCat button')[i].click();
  }, rang2);
  await p.waitForTimeout(500);
  v = await vue();
  ok(v.une.titre === CHOISIE.titre,
     `et elle revient en banniere quand on la reclique (${JSON.stringify(v.une.titre)})`);

  console.log('-- on lance une version DEPUIS LA BANNIERE --');
  const vo = v.boutons.filter((b) => !b.retour && b.src === CHOISIE.vo)[0];
  ok(!!vo, `la version VO porte l adresse annoncee (${JSON.stringify(v.boutons.map((b) => b.src))})`);
  if (!vo) await arrete('aucune version ne porte l adresse annoncee');
  await p.evaluate((src) => {
    document.querySelector('#nxArcChoix button[data-src="' + src + '"]').click();
  }, CHOISIE.vo);
  await p.waitForTimeout(900);
  v = await vue();
  ok(v.cadre === CHOISIE.vo, `cliquer la version charge CETTE adresse (${v.cadre})`);
  ok(versLesLecteurs.length > 0 && versLesLecteurs.every((u) => u.indexOf(CHOISIE.vo) === 0),
     `et le reseau ne voit QUE celle-la (${JSON.stringify(versLesLecteurs)})`);

  /* ---- CE QUE LE LECTEUR ETRANGER A LE DROIT DE FAIRE ----
   *
   * Deux pouvoirs que le navigateur donne par defaut a une page encadree, et
   * qui n'ont pas du tout le meme prix.
   *
   * OUVRIR UNE FENETRE A COTE est accorde. Les hebergeurs de lecteurs le
   * verifient avant de jouer : sans lui, le cadre restait noir sur telephone
   * et le film ne demarrait jamais. Un onglet de publicite se ferme.
   *
   * REMPLACER LA PAGE QUI CONTIENT LE CADRE reste refuse. Celui-la emporte la
   * partie en cours — le personnage, la salle, tout — et il faut recharger le
   * Nexus pour revenir. C'est la garantie qui protege la partie du joueur, et
   * elle ne tient a rien d'autre qu'a l'absence d'un jeton dans un attribut :
   * exactement le genre de chose qu'on retire par megarde en reecrivant une
   * ligne, et que personne ne voit jamais en regardant la page.
   *
   * Jeton par jeton, et non la chaine entiere : l'ordre d'une liste de
   * permissions n'engage personne. */
  ok(v.bac === null,
     `le cadre du lecteur ne porte AUCUN bac a sable (${JSON.stringify(v.bac)})`);
  /* On le dit aussi en negatif, jeton par jeton : le jour ou quelqu'un
     remettra un bac a sable « juste un peu permissif », c'est cette ligne-la
     qui nommera le jeton fautif au lieu de dire « ce n'est pas null ». */
  const jetons = (v.bac || '').split(/\s+/).filter(Boolean);
  ok(jetons.length === 0,
     `donc aucun jeton de permission a discuter (${JSON.stringify(jetons)})`);
  /* ---- LE CLIC SUR UNE VERSION FAIT PASSER EN LECTURE ----
   * Il se donne depuis la galerie : sans ce passage, le film jouait derriere
   * la rangee d'affiches, sans ecran visible et sans retour pour en sortir. */
  ok(v.boutons.some((b) => b.retour),
     `et le retour a la galerie apparait (${JSON.stringify(v.boutons.map((b) => b.nom))})`);
  ok(v.une.plate,
     'et la banniere se replie pour laisser la hauteur a l ecran');
  /* L'affiche projetee est celle de la seance ouverte, et non celle du haut de
     la liste : c'est la meme question que « quelle adresse est partie », posee
     a la toile de la salle. */
  const marqueChoisie = CHOISIE.affiche.slice(CHOISIE.affiche.indexOf(MARQUEUR_AFFICHE));
  ok(v.affiche[marqueChoisie] > 0,
     `l ecran de la salle projette l affiche de CETTE seance (${JSON.stringify(Object.keys(v.affiche))})`);

  console.log('-- on revient au catalogue --');
  await p.evaluate(() => document.querySelector('#nxArcChoix button.nxarc-retour').click());
  await p.waitForTimeout(400);
  v = await vue();
  ok(v.cat.length === COMBIEN && !v.boutons.some((b) => b.retour),
     `le retour ramene la rangee entiere (${v.cat.length} entrees, retour ${v.boutons.some((b) => b.retour)})`);
  /* Sortir d'un film pour retrouver la banniere d'un AUTRE donne l'impression
     d'avoir perdu sa place au milieu du catalogue. */
  ok(v.une.titre === CHOISIE.titre && !v.une.plate,
     `et la banniere retrouve la seance qu on venait de voir (${JSON.stringify(v.une.titre)})`);
  /* Le cadre VIDE et pas seulement cache : un lecteur laisse en place
     continuait de jouer son son derriere les affiches. */
  ok(v.cadre === 'about:blank', `et le lecteur est detruit, pas masque (cadre ${v.cadre})`);

  console.log('-- PLUSIEURS RANGEES, UNE PAR RUBRIQUE --');
  /* ---- LA REGLE, ET RIEN QU'ELLE ----
   *
   *   on ECARTE les rubriques vides, puis on met celle de la SALLE en premier,
   *   les autres suivant dans l'ordre ou le serveur les annonce.
   *
   * Ce qui est verifie ici, ce ne sont pas trois comportements : c'est cette
   * phrase-la, sous trois eclairages. La cle de la salle est RELUE de la
   * source — l'ecrire ici aurait fait passer l'essai le jour ou quelqu'un
   * code la cle en dur dans le panneau partage, qui est exactement la faute
   * qu'on cherche a rendre impossible.
   *
   * Les noms de rubrique sont inventes PAR L'ESSAI et relus de ce qu'il
   * pousse : jamais « FILMS », « MANGAS » ni « SERIES » ecrits ici, sans quoi
   * l'essai dirait au serveur comment nommer ses galeries. Et l'un d'eux
   * RESSEMBLE A DU BALISAGE, pour la meme raison que l'un des titres : un nom
   * de categorie traverse le serveur tel quel et se pose dans notre page. */
  const CLE_SALLE = rubriqueDeLaSalle();
  ok(!!CLE_SALLE, `la salle declare sa rubrique (${JSON.stringify(CLE_SALLE)})`);
  if (!CLE_SALLE) await arrete('la salle ne declare aucune rubrique : l ordre des rangees ne veut rien dire');
  /* Une rubrique VIDE, une rubrique etrangere annoncee AVANT celle de la
     salle, et celle de la salle en dernier : si l'ordre affiche etait celui du
     serveur, la rangee de la salle serait troisieme. */
  const VIDE = { cle: 'z-rien', nom: 'RIEN CE SOIR', seances: [] };
  const AUTRE = { cle: 'a-autre', nom: 'AUTRE <b>RANGEE</b>', seances: [SEANCES[1]] };
  const MIENNE = { cle: CLE_SALLE, nom: 'CELLE DE LA SALLE',
                   seances: [SEANCES[0], SEANCES[2]] };
  const TROIS = [VIDE, AUTRE, MIENNE];
  await p.evaluate((l) => window.__pousse({ type: 'cinema', salles: l }), TROIS);
  await p.waitForTimeout(500);
  v = await vue();
  /* Le nombre attendu est COMPTE sur ce qu'on pousse, jamais ecrit : une
     rubrique de plus dans le tableau ci-dessus et l'essai suit tout seul. */
  const PLEINES = TROIS.filter((r) => r.seances.length);
  ok(v.rangs.length === PLEINES.length,
     `autant de rangees que de rubriques NON VIDES (${v.rangs.length} pour ${PLEINES.length})`);
  if (v.rangs.length !== PLEINES.length) {
    await arrete('les rangees ne suivent pas les rubriques poussees : la suite repondrait dans le vide');
  }
  ok(v.rangs.every((r) => r.nom !== VIDE.nom),
     `une rubrique vide n apparait pas du tout (${JSON.stringify(v.rangs.map((r) => r.nom))})`);
  ok(v.rangs[0].nom === MIENNE.nom,
     `la rubrique de la salle est la PREMIERE rangee (${JSON.stringify(v.rangs[0].nom)})`);
  /* Et les autres n'ont pas ete melangees au passage : elles suivent dans
     l'ordre ou le serveur les annonce, ce qui est la seconde moitie de la
     regle et la seule chose qui la distingue d'un tri. */
  ok(v.rangs.slice(1).map((r) => r.nom).join('|')
     === PLEINES.filter((r) => r.cle !== CLE_SALLE).map((r) => r.nom).join('|'),
     `et les autres suivent dans l ordre annonce (${JSON.stringify(v.rangs.slice(1).map((r) => r.nom))})`);
  ok(v.rangs[0].titres.join('|') === MIENNE.seances.map((x) => x.titre).join('|'),
     `chaque rangee porte SES seances (${JSON.stringify(v.rangs[0].titres)})`);
  ok(v.rangs.every((r) => !/<[a-z]/i.test(r.brut)),
     `et aucun nom de rubrique n a pose de balise dans la page (${JSON.stringify(v.rangs.map((r) => r.brut))})`);
  ok(versLesLecteurs.length === 0 || v.cadre === 'about:blank',
     `et le cadre est toujours vide (${v.cadre})`);

  console.log('-- la rubrique de la salle est vide --');
  /* ---- LE MEME REGLE, SANS CAS PARTICULIER ----
   * La salle n'a rien a l'affiche ce soir. Elle disparait a la premiere etape
   * — on ecarte les vides — il ne reste plus personne a mettre devant, et la
   * PREMIERE ANNONCEE prend la tete toute seule. Aucune ligne du code ne parle
   * de ce cas : c'est ce qu'on verifie. */
  const SANS_MOI = [{ cle: CLE_SALLE, nom: MIENNE.nom, seances: [] },
                    AUTRE,
                    { cle: 'b-tiers', nom: 'TROISIEME', seances: [SEANCES[2]] }];
  await p.evaluate((l) => window.__pousse({ type: 'cinema', salles: l }), SANS_MOI);
  await p.waitForTimeout(500);
  v = await vue();
  const RESTE = SANS_MOI.filter((r) => r.seances.length);
  ok(v.rangs.length === RESTE.length,
     `la rangee de la salle disparait avec ses seances (${v.rangs.length} pour ${RESTE.length})`);
  ok(v.rangs.length === RESTE.length && v.rangs[0].nom === RESTE[0].nom,
     `et c est la SUIVANTE ANNONCEE qui prend la tete (${JSON.stringify(v.rangs.map((r) => r.nom))})`);
  /* La banniere suit : elle ne peut pas rester sur une seance qu'aucune rangee
     ne propose plus. */
  const TITRES_RESTANTS = RESTE.reduce((a, r) => a.concat(r.seances.map((x) => x.titre)), []);
  ok(TITRES_RESTANTS.indexOf(v.une.titre) >= 0,
     `et la banniere annonce une seance encore proposee (${JSON.stringify(v.une.titre)})`);

  console.log('-- et l on revient a une seule galerie --');
  /* La forme que le serveur envoie AUJOURD'HUI, repoussee apres les rubriques :
     le catalogue doit redevenir utilisable sans rechargement — une rangee, ses
     affiches, et une banniere qui lance quelque chose. */
  await p.evaluate((l) => window.__pousse({ type: 'cinema', cinemas: l }), SEANCES);
  await p.waitForTimeout(500);
  v = await vue();
  ok(v.rangs.length === 1 && v.cat.length === COMBIEN,
     `une galerie plate redonne UNE rangee et toutes les seances (${v.rangs.length} rangee(s), ${v.cat.length} pour ${COMBIEN})`);
  const encore = SEANCES.filter((x) => x.titre === v.une.titre)[0];
  ok(!!encore && v.boutons.filter((b) => !b.retour).length === 2,
     `et le catalogue reste utilisable : la banniere annonce ${JSON.stringify(v.une.titre)} avec ses deux versions`);

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

  console.log('-- au pouce, sur 412 px --');
  /* ---- LE PANNEAU EST D'ABORD REGARDE SUR UN TELEPHONE ----
   *
   * Deux mesures, et aucune des deux ne se voit sur une capture d'ecran : une
   * carte qui deborde d'un pixel fait apparaitre une barre horizontale sous
   * tout le panneau, et une cible de trente pixels se rate au pouce une fois
   * sur trois. La rangee d'affiches defile a l'horizontale : c'est exactement
   * le genre de dessin qui pousse une barre sous la page entiere si le
   * defilement n'est pas confine a la rangee.
   *
   * Le bouton de fermeture n'est pas mesure ici : il est partage par tous les
   * panneaux du Nexus, et le redimensionner depuis le cinema deplacerait une
   * decision qui appartient a tous.
   *
   * On mesure a la FIN, panneau rouvert : redimensionner au milieu du trajet
   * aurait change la camera entre deux pas et fausse la marche vers le point. */
  if (!(await vue()).ouvert) {
    ok(false, 'le debord ne peut pas etre juge : le panneau n est pas ouvert');
    ok(false, 'les boutons de version ne peuvent pas etre mesures : le panneau n est pas ouvert');
    ok(false, 'les affiches ne peuvent pas etre mesurees : le panneau n est pas ouvert');
  } else {
    await p.setViewportSize({ width: 412, height: 915 });
    await p.waitForTimeout(700);
    const pouce = await p.evaluate(() => {
      const carte = document.querySelector('#nxArcVoile .nxarc-carte');
      const doc = document.documentElement;
      const trop = (el) => {
        const r = el.getBoundingClientRect();
        return r.height < 44 || r.width < 44;
      };
      const vers = [...document.querySelectorAll('#nxArcChoix > button')];
      const aff = [...document.querySelectorAll('#nxArcCat button')];
      return { carte: carte.scrollWidth - carte.clientWidth,
               page: doc.scrollWidth - doc.clientWidth,
               versions: vers.length, versionsPetites: vers.filter(trop).length,
               affiches: aff.length, affichesPetites: aff.filter(trop).length };
    });
    ok(pouce.carte <= 0 && pouce.page <= 0,
       `aucun debord horizontal (carte ${pouce.carte} px, page ${pouce.page} px)`);
    /* `> 0` autant que « aucun trop petit » : `filter` rend une liste vide sur
       une liste vide, et un panneau sans boutons aurait repondu vert. */
    ok(pouce.versions > 0 && pouce.versionsPetites === 0,
       `les ${pouce.versions} boutons de version tiennent les 44 px (${pouce.versionsPetites} trop petits)`);
    ok(pouce.affiches > 0 && pouce.affichesPetites === 0,
       `les ${pouce.affiches} affiches de la rangee tiennent les 44 px (${pouce.affichesPetites} trop petites)`);
    await p.setViewportSize({ width: 1400, height: 900 });
    await p.waitForTimeout(300);
  }

  console.log('-- la page n a rien casse --');
  ok(erreurs.length === 0, erreurs.length ? 'erreurs : ' + erreurs.join(' | ') : 'aucune erreur de page');

  await fin(0);
})();
