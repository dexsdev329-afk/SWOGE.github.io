/*
 * LE NEXUS, MULTIJOUEUR.
 *
 * ---- ce que c'est ----
 *
 * Un hall calme entre les parties : une fontaine au centre, un etal qui mene
 * a la boutique, une porte qui mene au coffre du personnage, un portail qui
 * mene au hall des jeux. Le joueur s'y promene avec le skin qu'il porte
 * deja, et entre dans chaque lieu en marchant dessus — comme dans RotMG, pas
 * en cliquant un bouton. Les autres joueurs presents s'y promenent aussi,
 * sous nos yeux : c'est le sens meme d'un hall — un endroit ou l'on se
 * croise, pas une piece vide qu'on visite seul.
 *
 * ---- comment la position circule ----
 *
 * Le client envoie sa position au clavier, quelques fois par seconde — pas a
 * chaque trame, ca n'apporterait rien de plus au reseau. Le serveur ne fait
 * confiance a AUCUN champ « skin » venu du client : il diffuse celui qu'il
 * connait deja (`skinActif`), pour qu'un joueur ne puisse pas se deguiser en
 * un personnage qu'il ne possede pas aux yeux des autres. En retour, un
 * instantane COMPLET arrive plusieurs fois par seconde — pas des evenements
 * d'entree/sortie a tenir a jour : qui n'y est plus n'apparait simplement
 * plus dans l'instantane suivant.
 *
 * ---- pourquoi on espionne le constructeur WebSocket ----
 *
 * Meme raison qu'entrainement.js : la socket vit dans une variable privee de
 * stakebubble.js, et ce qu'il nous faut — savoir quel skin est actif, envoyer
 * et recevoir les positions — ne justifie pas de modifier ce fichier de trois
 * mille lignes pour l'exposer. On remplace le constructeur avant que la page
 * ne s'en serve, et on ajoute un ecouteur A COTE du sien : si ce fichier ne
 * chargeait pas, le reste du site continuerait de fonctionner a l'identique.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('nxCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  // ------------------------------------------------------- la socket

  var SOCK = null;
  (function espionne() {
    var Vrai = window.WebSocket;
    if (!Vrai || Vrai.__swEntraine) return;
    function Espion(url, protos) {
      var s = (protos === undefined) ? new Vrai(url) : new Vrai(url, protos);
      SOCK = s;
      try { s.addEventListener('message', ecoute); } catch (e) {}
      return s;
    }
    Espion.prototype = Vrai.prototype;
    Espion.CONNECTING = Vrai.CONNECTING; Espion.OPEN = Vrai.OPEN;
    Espion.CLOSING = Vrai.CLOSING; Espion.CLOSED = Vrai.CLOSED;
    Espion.__swEntraine = true;
    window.WebSocket = Espion;
  })();

  function envoie(o) {
    if (SOCK && SOCK.readyState === 1) { SOCK.send(JSON.stringify(o)); return true; }
    return false;
  }

  var MON_ADRESSE = null;     // la notre, pour se filtrer soi-meme des instantanes recus
  var enLigne = false;        // connecte ET entre dans le Nexus : on peut emettre notre position
  var chronoEnvoi = 0, ENVOI_INTERVAL = 0.12;
  var demande = false;
  function ecoute(ev) {
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    traite(m);
  }
  /* ---- LE MESSAGE, SEPARE DE SA LIVRAISON ----
   * `ecoute` recoit un evenement de socket, `traite` recoit un MESSAGE. La
   * distinction sert des qu'une reponse en porte plusieurs : l'echange
   * d'equipement renvoie d'un coup la fiche, le coffre et le sac, et on veut
   * les reposer par les memes chemins que d'habitude — pas en ecrire une
   * seconde version qui, un jour, oubliera quelque chose. */
  function traite(m) {
    if (m.type === 'auth' && !demande) {
      demande = true;
      MON_ADRESSE = String(m.address || '').toLowerCase();
      envoie({ type: 'skins' });
      envoie({ type: 'nexusJoin' });
      envoie({ type: 'profile' });
      enLigne = true;
    }
    /* ---- DEUX QUESTIONS DIFFERENTES, DEUX CONDITIONS ----
     *
     * « Faut-il changer de sprites ? » et « faut-il demander la fiche ? » ne
     * se posent pas au meme moment. Elles etaient fondues dans un seul
     * `m.actif !== PERSO`, et ca cassait le cas le plus courant : `PERSO`
     * vaut « andy » par defaut, donc un joueur qui porte JUSTEMENT Andy
     * tombait dans « rien n'a change » — et sa fiche n'etait jamais
     * demandee. Panneau vide, sans une erreur nulle part. */
    if (m.type === 'skins') {
      SKINS_C = m.catalogue || SKINS_C;
      if (m.error) shopMsg = { texte: m.error, ok: false };
      else if (m.achete) shopMsg = { texte: '\u2728 ' + m.achete + ' is yours', ok: true };
      if (m.balance != null && BOUTIQUE) BOUTIQUE.balance = m.balance;
      if (shopOuvert) peintShop();
      if (coffreOuvert) peintCoffreMenu();
      SKIN_POSSEDE = !!m.actif;
      if (m.actif && PERSONNAGES[m.actif]) {
        if (m.actif !== PERSO) { PERSO = m.actif; assureCharge(PERSO); }
        /* Demande a CHAQUE reponse `skins`, meme si le skin n'a pas bouge :
           c'est aussi ce message qui revient apres un achat ou un changement
           de tenue, et la fiche a pu changer sans que le skin change. */
        envoie({ type: 'personnage', skin: PERSO });
        envoie({ type: 'equipable' });
      } else {
        /* Aucun skin porte : il n'y a pas de fiche a montrer, et c'est une
           reponse legitime — pas une panne. Le panneau le dira. */
        FICHE = null; SAC = [];
      }
      peintPanneau();
    }
    /* Notre nom vient du profil. On le demande une fois : le panneau
       l'affiche en tete, comme la fiche d'origine. */
    if (m.type === 'profile' && m.profile) { MON_NOM = m.profile.name || null; peintPanneau(); }
    if (m.type === 'personnage' && m.etat && m.etat.skin === PERSO) {
      /* Le niveau qui MONTE s'entend. On compare a celui d'avant plutot
         que d'attendre un message dedie : la fiche arrive de toute facon
         et porte deja la reponse. Le PREMIER envoi ne sonne pas — on ne
         « monte » pas au niveau qu'on avait deja en arrivant. */
      var avantNiv = FICHE ? FICHE.niveau : null;
      FICHE = m.etat;
      /* ---- ET ON DEMANDE LA PLANCHE DE SON ARME ----
       * `chargeTirs` tournait a l'entree dans le monde, et seulement la. Or la
       * fiche arrive par un AUTRE message, souvent apres : au moment ou l'on
       * prechargeait, le personnage n'avait pas encore d'arme, on demandait
       * donc la planche du POING — qui n'existe pas — et jamais celle de la
       * lame. Le premier tir partait alors en trait de secours pendant les
       * trois cents millisecondes que met l'image a arriver.
       * Mesure faite : 279 ms entre le clic et le projectile vraiment dessine,
       * sur une machine locale ou le reseau ne coute rien. Deux appels au lieu
       * d'un, et le meme cache derriere : ca ne coute rien de le redemander. */
      chargeTirs();
      if (avantNiv !== null && m.etat.niveau > avantNiv) joueSample('niveau', { vol: 0.9 });
      peintPanneau(); if (coffreOuvert) peintCoffreMenu();
    }
    /* ---- LA REPONSE DE L'ECHANGE ----
     * Un seul message pour trois etats : ce qu'on porte, le coffre, le sac.
     * On les repose en repassant par les MEMES chemins que les messages qui
     * les portent d'habitude — sinon on aurait deux facons de mettre la fiche
     * a jour, et un jour l'une des deux oublierait quelque chose. */
    if (m.type === 'equipeDuSac') {
      if (m.error) {
        coffreErreur = m.error;
        if (coffreOuvert) peintCoffreMenu();
        peintPanneau();
      } else {
        if (m.etat) traite({ type: 'personnage', skin: m.skin, etat: m.etat });
        if (m.equipable) traite(Object.assign({ type: 'equipable' }, m.equipable, { sac: m.sacJoueur }));
        else if (m.sacJoueur) { SAC = m.sacJoueur; peintPanneau(); }
        /* Ce qui REVIENT dans le sac se dit : sans ca, le joueur voit son
           arme disparaitre de l'emplacement et doit deviner ou elle est
           passee. C'est exactement la question qu'on nous a posee. */
        if (m.rendu) {
          var q = (SAC || []).filter(function (o) { return o.id === m.rendu; })[0];
          flotte((q && q.nom ? q.nom : 'Your gear') + ' \u2192 backpack');
        } else if (m.item) {
          /* ---- ET QUAND RIEN NE REVIENT, ON LE DIT AUSSI ----
           * L'emplacement etait VIDE : il n'y a pas d'echange, la piece est
           * simplement mise. La case du sac se vide donc, et la piece part au
           * coffre — parce que c'est la que vit ce qu'on porte. Sans un mot,
           * ce geste se lit « elle a disparu de mon sac et s'est mise dans mon
           * vault », ce qui est exact et pourtant faux : elle est SUR SOI.
           * On nous l'a signale deux fois. */
          var w = null;
          if (FICHE) {
            ['equipFruit', 'equipArme', 'equipArmure', 'equipBague'].forEach(function (k) {
              if (FICHE[k] && FICHE[k].item === m.item) w = FICHE[k];
            });
          }
          flotte((w && w.nom ? w.nom : 'Your gear') + ' \u2192 equipped');
        }
      }
    }
    if (m.type === 'fioleRange' || m.type === 'fioleSort' || m.type === 'fioleBoit') {
      if (m.error) coffreErreur = m.error;
      else coffreErreur = '';
      if (m.fioles) FIOLES_C = m.fioles;
      if (m.sacJoueur) SAC = m.sacJoueur;
      if (m.etat && m.skin === PERSO) { FICHE = m.etat; }
      if (m.type === 'fioleBoit' && !m.error) {
        /* Le meme son que la montee de niveau : boire une fiole ajoute un
           point pour toujours, c'est exactement ce que fait un niveau. */
        joueSample('niveau', { vol: 0.7, hauteur: 1.25 });
        flotte('+' + (m.pas || 1) + ' ' + String(m.stat || '').toUpperCase());
      }
      if (coffreOuvert) peintCoffreMenu();
      peintPanneau();
    }
    if (m.type === 'sacDeplace') {
      if (m.sacJoueur) { SAC = m.sacJoueur; peintPanneau(); }
      if (m.error) { coffreErreur = m.error; if (coffreOuvert) peintCoffreMenu(); }
    }
    if (m.type === 'leaderboardMonde') { RANG = m; if (rangOuvert) peintRang(); }
    if (m.type === 'equipable') {
      /* Le SAC est ce que le serveur envoie sous `sac` — le butin ramasse —
         et RIEN d'autre. Il contenait auparavant tout ce qu'on possede
         d'equipable, c'est-a-dire le contenu du COFFRE : ca montrait les
         achats a un endroit ou ils ne sont pas, et laissait croire qu'ils
         partaient avec le personnage. */
      SAC = m.sac || [];
      /* Les quatre listes SONT le coffre : ce que la boutique nous a vendu.
         Le panneau n'en montre que le sac ; la salle du coffre, elle, les
         pose au sol. On les garde donc au lieu de les jeter. */
      COFFRE = { fruits: m.fruits || [], armes: m.armes || [],
                 armures: m.armures || [], bagues: m.bagues || [] };
      if (m.fioles) FIOLES_C = m.fioles;
      coffreErreur = m.error || '';
      POTIONS_C = m.potions || POTIONS_C;
      if (m.balance != null && BOUTIQUE) BOUTIQUE.balance = m.balance;
      if (m.achat) shopMsg = { texte: '\u2728 ' + m.achat.livre + ' potion' +
        (m.achat.livre > 1 ? 's' : '') + ' \u2014 ' + m.achat.prix + ' $SWOGE', ok: true };
      if (shopOuvert) peintShop();
      if (coffreOuvert) peintCoffreMenu();
      peintPanneau();
    }
    /* La reponse de la boutique. `gagne` n'arrive qu'apres une ouverture :
       c'est le seul moment ou l'on a quelque chose a annoncer. */
    if (m.type === 'shop') {
      BOUTIQUE = m;
      if (m.catalogue && m.catalogue.saison) shopSaison = m.catalogue.saison;
      if (m.error) shopMsg = { texte: m.error, ok: false };
      else if (m.gagne && m.gagne.item) {
        /* Le nom LISIBLE de la rarete vit dans le catalogue ; l'objet ne
           porte que sa cle (« mythique »). On traduit ici plutot que
           d'ecrire une seconde table de correspondance. */
        var rar = (m.catalogue && m.catalogue.raretes || [])
          .filter(function (r) { return r.cle === m.gagne.rarete; })[0];
        shopMsg = { texte: '\u2728 ' + (m.gagne.item.nom || 'New item') +
                           (rar ? ' \u2014 ' + rar.nom : '') +
                           ' \u00b7 waiting in your vault', ok: true };
        /* Le coffre vient de changer : on le redemande, sinon le menu du
           coffre montrerait encore l'inventaire d'avant l'achat. */
        if (enLigne) envoie({ type: 'equipable' });
      } else shopMsg = '';
      if (shopOuvert) peintShop();
    }
    /* L'etal des potions. Il arrive apres une mise en vente, une reprise, un
       achat — et aussi tout seul apres un achat de potion, parce que la file
       vient de bouger. */
    if (m.type === 'potionMarche') {
      MARCHE_P = m;
      if (m.potions) POTIONS_C = m.potions;
      if (m.fioles) FIOLES_C = m.fioles;
      if (m.balance != null && BOUTIQUE) BOUTIQUE.balance = m.balance;
      if (m.error) shopMsg = { texte: m.error, ok: false };
      else if (m.misEnVente) shopMsg = { texte: '\uD83C\uDFF7 ' + m.misEnVente +
        ' listed \u2014 you get paid when they sell', ok: true };
      else if (m.repris) shopMsg = { texte: '\u21A9 ' + m.repris + ' taken back', ok: true };
      else if (m.achete) shopMsg = { texte: '\u2728 ' + m.achete + ' stat potion' +
        (m.achete > 1 ? 's' : '') + ' \u2014 ' + m.paye + ' $SWOGE', ok: true };
      if (shopOuvert) peintShop();
      if (coffreOuvert) peintCoffreMenu();
      peintPanneau();
    }
    /* On vient de sauter aupres d'un ami : la position vient du SERVEUR, comme
       toute position dans le monde de combat. Se deplacer ici et l'annoncer
       ensuite laisserait une image ou l'on est a deux endroits. */
    /* On vient de sauter a une balise. La position vient du SERVEUR, comme
       toute position dans le monde de combat. */
    if (m.type === 'realmBalise') {
      joueur.x = m.x; joueur.y = m.y;
      RECALE = null; ENVOIS.length = 0;
      peintBalises();
      flotte('\uD83D\uDCCD Beacon');
    }
    if (m.type === 'realmBaliseRefus') {
      flotte(m.raison === 'donjon' ? 'Not from inside a dungeon'
                                   : 'That beacon is not lit yet');
    }
    if (m.type === 'realmRejoint') {
      joueur.x = m.x; joueur.y = m.y;
      RECALE = null; ENVOIS.length = 0;
      flotte('\u2192 ' + (m.nom || 'teammate'));
    }
    if (m.type === 'realmRejointRefus') {
      flotte({ 'pas-ami': 'Add them as a friend first',
               'pas-la': 'They are not in this world',
               'no-one': 'Nobody to join' }[m.raison] || 'Cannot join them');
    }
    /* La reponse de la table. Un seul type pour les cinq gestes : c'est
       l'ETAT qui revient, pas un accuse de reception — la page n'a donc rien a
       deviner de ce que son message a produit. */
    if (m.type === 'bj') {
      BJ = m.state || null;
      bjErreur = '';
      if (BJ && BJ.balance != null && BOUTIQUE) BOUTIQUE.balance = BJ.balance;
      /* ---- LE SOLDE DU HAUT SUIT LA TABLE ----
       * Il ne bougeait pas d'une main a l'autre : `majSolde` s'accroche a
       * `m.balance`, tout en haut du message, et la table met le sien dans
       * `state.balance`. On gagnait quarante $SWOGE, le panneau les annoncait,
       * et le compteur de l'ecran restait sur l'ancien chiffre jusqu'a ce
       * qu'on recharge la page — c'est-a-dire jusqu'a ce qu'on doute d'avoir
       * gagne. */
      if (BJ && BJ.balance != null) majSolde(BJ.balance);
      if (bjOuvert) peintBj();
      peintPanneau();
    }
    /* Le serveur refuse par `error`, comme partout ailleurs. On ne le montre
       QUE si la table est ouverte : la meme socket porte les erreurs de tout
       le jeu, et les afficher ici ferait dire a la table des choses qui ne la
       concernent pas. */
    if (m.type === 'error' && bjOuvert) {
      bjErreur = String(m.error || '');
      peintBj();
    }
    if (m.type === 'potionBue') {
      POTIONS_C = m.potions || POTIONS_C;
      if (m.pv !== null && m.pv !== undefined) { VIE.pv = m.pv; moiMonde.pv = m.pv; }
      if (m.mp !== null && m.mp !== undefined) { VIE.mp = m.mp; peintPouvoir(); }
      /* Boire est un soin : meme spirale, plus courte parce qu'on est
         souvent en train de fuir quand on boit. */
      poseSoin(joueur.x, joueur.y);
      joueSample('clic2', { vol: 0.55, hauteur: 1.3 });
      flotte('+' + m.soigne + ' ' + (m.quoi === 'hp' ? 'HP' : 'MP'));
      peintPanneau();
    }
    if (m.type === 'realmEntre') entreMonde(m);
    if (m.type === 'realmRefus') {
      if (indiceEl) {
        indiceEl.innerHTML = m.raison === 'no-character'
          ? 'Buy a character first — the wild is no place without one'
          : 'The gate refused you';
        indiceEl.classList.add('on');
      }
    }
    /* ---- UNE PORTE VIENT DE S'OUVRIR ----
     * Elle arrive DEJA avec l'etat, donc on la dessinerait sans ce message. Il
     * sert a autre chose : une porte qui apparait a cent quatre-vingt-dix
     * unites derriere une creature qu'on regardait mourir, au milieu des eclats
     * et des chiffres de degats, se rate. On la manque, on s'en va, et le donjon
     * qu'on vient de meriter se referme tout seul sans qu'on ait su qu'il
     * existait. Le message ne dit rien de plus — il dit QUAND. */
    if (m.type === 'realmPortail') {
      joueSample('niveau', { vol: 0.5, hauteur: 0.72 });
      flotte(m.donjon ? 'A PORTAL OPENS' : 'THE WAY BACK OPENS');
      if (indiceEl) {
        indiceEl.innerHTML = m.donjon
          ? 'A portal to the <b>' + ech(m.donjon) + '</b> opened behind it — walk in to enter'
          : 'A way back opened behind it';
        indiceEl.classList.add('on');
        indiceActuel = null;   // la ligne d'ambiance reprendra la main
      }
    }
    /* ---- QUELQU'UN A OUVERT UNE PORTE ----
     * Pas forcement nous, et pas forcement pres d'ici. On garde la position et
     * son compte a rebours : la fleche au bord de l'ecran vit de ca. */
    if (m.type === 'realmPortailOuvert' && SCENE === 'monde') {
      var deja = false;
      for (var iP = 0; iP < PORTAILS_LOIN.length; iP++) {
        if (PORTAILS_LOIN[iP].i === m.id) { deja = true; break; }
      }
      if (!deja) {
        PORTAILS_LOIN.push({ i: m.id, x: m.x, y: m.y, dj: m.donjon,
                             nom: m.nom || null, reste: m.duree || 180 });
      }
      /* Celui qui l'a ouverte a deja son propre message — le sien dit
         « derriere toi », celui-la dirait la meme chose en moins bien. */
      if (!m.mien) {
        joueSample('niveau', { vol: 0.42, hauteur: 0.8 });
        flotte('A PORTAL OPENED');
        if (indiceEl) {
          indiceEl.innerHTML = (m.nom ? '<b>' + ech(m.nom) + '</b> opened a portal to the '
                                      : 'A portal to the ') +
            '<b>' + ech(m.donjon || 'dungeon') + '</b> — follow the arrow';
          indiceEl.classList.add('on');
          indiceActuel = null;
        }
      }
    }
    /* Un refus de porte. Il arrive toujours, comme celui du pouvoir : un bouton
       qui ne repond rien se lit comme un defaut. */
    if (m.type === 'realmPorteRefus') {
      var pourquoi = { 'deja-dedans': 'You are already inside',
                       'pas-de-portail': 'No portal under your feet',
                       'trop-de-donjons': 'Too many dungeons open — try again shortly',
                       'pas-dedans': 'You are not in a dungeon',
                       'no-character': 'Buy a character first' }[m.raison];
      flotte(pourquoi || 'The gate refused you');
    }
    if (m.type === 'realmEtat' && SCENE === 'monde') recoitMonde(m);
    /* ---- LA REPONSE A LA BARRE D'ESPACE ----
     * Elle arrive TOUJOURS, y compris sur un refus : une touche qui ne
     * repond rien se lit comme un bug, pas comme un manque de mana. On le
     * dit avec le meme texte flottant que le reste — au milieu de l'ecran,
     * la ou le joueur regarde, pas dans un coin du panneau. */
    if (m.type === 'realmPouvoir') {
      if (m.refus === 'mana') {
        flotte('Not enough mana');
        joueSample('clic', { vol: 0.3, hauteur: 0.7 });
      } else if (m.refus === 'recharge') {
        flotte('Recharging \u2014 ' + m.reste.toFixed(1) + 's');
      } else if (m.refus === 'aucun') {
        flotte('No fruit equipped');
      } else if (!m.refus) {
        VIE.mp = m.mp;
        POUVOIR_ETAT.recharge = m.recharge || 0;
        if (m.cle === 'rafale') { POUVOIR_ETAT.rafale = m.duree || 0; flotte('RAPID FIRE'); }
        if (m.cle === 'stase') flotte('STASIS \u00b7 ' + (m.figes || []).length);
        if (m.cle === 'foudre') flotte(m.vide ? 'No target in range' : '\u26a1 ' + m.perte);
        effetPouvoir(m);
        joueSample(m.cle === 'stase' ? 'vault' : 'niveau',
                   { vol: m.cle === 'foudre' ? 0.55 : 0.4, hauteur: m.cle === 'stase' ? 0.75 : 1.35,
                     duree: 0.5 });
        majJauges(); peintPouvoir();
      }
    }
    /* ---- CE QU'ON TOUCHE, ET CE QU'ON ENCAISSE ----
     *
     * Un monstre touche pousse le MEME cri que lorsqu'il meurt, en beaucoup
     * plus discret et coupe court : c'est la meme creature qui souffre, et
     * lui donner deux voix sans rapport donnerait l'impression de deux
     * bestioles differentes. La mort se distingue par le volume et par le
     * fait qu'elle va au bout.
     *
     * Nos propres degats gardent `degat.mp3`, franc et grave : ce qui nous
     * arrive ne doit surtout pas ressembler a ce qu'on inflige. */
    if (m.type === 'realmTouche' && SCENE === 'monde') {
      joueSample(Math.random() < 0.5 ? 'mort' : 'mort2',
                 { vol: 0.22, hauteur: 1.15 + Math.random() * 0.2, duree: 0.28 });
      /* Le point du coup vient du serveur. Sans lui on savait qu'on avait
         touche, jamais ou. */
      if (m.x !== undefined && m.y !== undefined) poseCoup(m.x, m.y - DECALAGE_TIR);
    }
    if (m.type === 'realmCoup' && SCENE === 'monde') {
      VIE.pv = m.pv; moiMonde.pv = m.pv;
      /* ---- LA BRULURE NE COGNE PAS ----
       * Elle enleve un point toutes les huit dixiemes de seconde. Lui donner
       * le grondement et la secousse d'une morsure ferait trembler l'ecran en
       * continu pendant cinq secondes, pour un dixieme du degat. Elle a sa
       * propre voix, breve et haute, et elle ne bouscule pas la camera. */
      if (m.quoi === 'brulure') {
        joueSample('degat', { vol: 0.16, hauteur: 1.8, duree: 0.14 });
      } else {
        joueSample('degat', { vol: 0.75, hauteur: 0.8, duree: 0.8 });
        secousse = 0.16;
      }
      /* ---- LE COUP QUI POSE UN ETAT ----
       * Perdre le controle sans un mot se lit comme une page qui a plante,
       * pas comme une attaque. On le NOMME, chacun avec sa voix, et l'anneau
       * autour des pieds dira le temps qu'il reste. */
      /* ---- LE MANA VOLE ----
       * La barre bleue baissait sans un mot. C'est la seule attaque qui ne
       * prend ni la vie ni le controle, et sans nom on croit a un defaut
       * d'affichage plutot qu'a un coup recu. */
      if (m.mp > 0) {
        VIE.mp = Math.max(0, VIE.mp - m.mp);
        flotte('\u2212' + m.mp + ' MP');
        joueSample('clic', { vol: 0.4, hauteur: 0.6 });
        peintPouvoir();
      }
      if (m.effet === 'paralyse' || m.paralyse > 0) {
        PARALYSE = m.duree || m.paralyse;
        flotte('PARALYZED');
        joueSample('vault', { vol: 0.5, hauteur: 0.55, duree: 0.7 });
        secousse = 0.3;
      } else if (m.effet === 'ralenti') {
        RALENTI = m.duree || 3;
        flotte('SLOWED');
        joueSample('vault', { vol: 0.35, hauteur: 0.9, duree: 0.4 });
      } else if (m.effet === 'brulure') {
        BRULURE = m.duree || 5;
        flotte('BURNING');
        joueSample('degat', { vol: 0.45, hauteur: 1.4, duree: 0.5 });
      }
      majJauges();
    }
    if (m.type === 'realmKill') {
      /* Deux cris tires au hasard : un monstre qui meurt toujours pareil
         devient une machine au bout de dix. */
      joueSample(Math.random() < 0.5 ? 'mort' : 'mort2', { vol: 0.7 });
      moiMonde.xp = m.total;
      flotte('+' + m.xp + ' XP');
      /* ---- LA BARRE MONTE TOUT DE SUITE ----
       * Elle ne bougeait qu'a la prochaine fiche complete, c'est-a-dire au
       * prochain changement d'equipement : on tuait dix monstres sans rien
       * voir avancer. Le serveur envoie deja le total avec chaque mise a
       * mort — il ne manquait que de le poser.
       *
       * Les BORNES du niveau (debut et fin) ne changent qu'en changeant de
       * niveau. Tant qu'on reste dans le meme, l'XP suffit ; quand il monte,
       * on redemande la fiche parce que les stats bougent avec. */
      if (FICHE) {
        FICHE.xp = m.total;
        if (m.niveau !== FICHE.niveau) { if (enLigne) envoie({ type: 'personnage', skin: PERSO }); }
        else peintPanneau();
      }
      if (m.monte) {
        joueSample('niveau', { vol: 0.9 });
        flotte('LEVEL ' + m.niveau);
        poseNiveau(joueur.x, joueur.y);
      }
    }
    /* ---- CE QU'ON VIENT DE RAMASSER ----
     * Le serveur a deja tout tranche : quel sac, ce qu'il contenait, et si
     * l'on pouvait le prendre. Il ne reste ici qu'a le DIRE. Un sac qui
     * disparait sans un mot se lit comme un sac perdu. */
    /* Les reponses du hall repassent par les MEMES chemins que celles du monde
       de combat : deux facons de poser un sac dans la page auraient fini par
       en oublier une. On renomme, on ne duplique pas. */
    if (m.type === 'nexusRamasse') { traite(Object.assign({}, m, { type: 'realmRamasse' })); return; }
    if (m.type === 'nexusDepose') { traite(Object.assign({}, m, { type: 'realmDepose' })); return; }
    if (m.type === 'realmRamasse') {
      if (m.rien) { /* on s'est eloigne entre la demande et la reponse */ }
      else if (m.refus) {
        /* Un seul mot, parce qu'un seul geste : depuis qu'on prend en TOUCHANT
           la case, un refus repond a une demande explicite. Il n'y a plus rien
           a etouffer — c'est le ramassage automatique qui redemandait sans fin
           ce qu'on ne pouvait pas prendre. */
        /* « AT MAX » ne peut plus concerner une fiole de stat : elle se
           ramasse desormais meme au plafond, et se boit plus tard. Il ne
           reste que le sac plein, et les fioles de soin a leur pile. */
        /* ---- UN REFUS AUTOMATIQUE MERITE PLUS QU'UN MOT ----
         * Celui-la n'a pas ete demande : on a marche sur un sac, et il n'est
         * rien entre. « BAG FULL » tout court laisse chercher CE qu'on vient
         * de laisser derriere soi — et quand c'est une fiole de stat, une sur
         * cinquante morts, on ne le laisse pas deux fois. */
        flotte(m.refus === 'sac-plein'
                 ? (m.auto && m.stat ? 'BAG FULL — STAT POTION LEFT BEHIND'
                    : m.auto ? 'BAG FULL — LOOT LEFT BEHIND' : 'BAG FULL')
             : m.refus === 'plein' ? 'AT MAX'
             : String(m.refus).toUpperCase());
        joueSample('clic', { vol: m.auto && m.stat ? 0.6 : 0.35,
                             hauteur: m.auto && m.stat ? 0.7 : 1 });
      } else if (m.stat) {
        /* ---- UNE FIOLE SE RAMASSE, ELLE NE SE BOIT PLUS ----
         * Cette branche annoncait encore « +1 DEF (3/6) », comme au temps ou
         * ramasser voulait dire boire — et elle ne reposait PAS le sac. La
         * fiole prenait donc une place qui restait vide a l'ecran : le joueur
         * la voyait disparaitre. C'est ce qu'on nous a rapporte.
         * Elle se traite maintenant comme une piece, parce que c'en est une :
         * elle occupe une case, et cette case doit se remplir. */
        if (m.sacJoueur) SAC = m.sacJoueur;
        if (m.fioles) FIOLES_C = m.fioles;
        flotte('+1 ' + (NOM_STAT[m.stat] || m.stat).toUpperCase() + ' POTION');
        joueSample('clic2', { vol: 0.6 });
        peintPanneau();
      } else if (m.item) {
        /* Une PIECE. Le sac complet revient avec la reponse : sans lui, la
           grille de gauche resterait telle qu'elle etait jusqu'a la prochaine
           fiche, et on aurait ramasse quelque chose qu'on ne voit nulle
           part. */
        if (m.sacJoueur) SAC = m.sacJoueur;
        flotte(m.nom || 'ITEM');
        joueSample('clic2', { vol: 0.6 });
        peintPanneau();
      } else if (m.potion) {
        POTIONS_C = m.potions || POTIONS_C;
        flotte('+1 ' + (m.nom || 'POTION') + '  (' + m.quantite + ')');
        joueSample('clic2', { vol: 0.6 });   // pas de son de ramassage : celui de l'effet fait l'affaire
        peintPanneau();
      }
      /* La grille ne s'efface pas toute seule : le prochain `realmEtat` dira
         ce qu'il reste dans le sac. On la vide tout de suite quand le serveur
         annonce qu'il est vide, pour ne pas laisser une fiole dessinee sur une
         place qui n'existe plus — un deuxieme clic irait dans le vide. */
      if (m.vide) { SAC_PIEDS = null; SAC_SIGNE = ''; peintButin(); }
    }
    /* Ce qu'on vient de POSER par terre. Le sac complet revient avec la
       reponse pour la meme raison que ci-dessus : la case doit se vider tout
       de suite, sinon on croit avoir rate son geste et on recommence. */
    if (m.type === 'realmDepose') {
      if (m.refus) {
        flotte(m.refus === 'sac-plein' ? 'GROUND BAG FULL' : String(m.refus).toUpperCase());
        joueSample('clic', { vol: 0.35 });
      } else {
        if (m.sacJoueur) SAC = m.sacJoueur;
        flotte('DROPPED  ' + (m.nom || ''));
        joueSample('clic2', { vol: 0.5 });
        peintPanneau();
      }
    }
    /* La mort arrive du SERVEUR : c'est lui qui l'a constatee, jamais nous. */
    if (m.type === 'realmMort') {
      SCENE = 'nexus'; peintBoutonTir();
      MONSTRES_C = {}; TIRS_C = []; TIRS_M = []; DEVINES = []; DISTANTS_M = {}; TOMBES_C = []; SACS_C = [];
      ZONES_C = []; ONDES = [];
      RECALE = null; ENVOIS.length = 0; CADENCE_M = 0; CADENCE_M = 0;
      OBSTACLES_C = []; SALLES_C = [];
      SAC_PIEDS = null; SAC_SIGNE = ''; peintButin();
      /* Mourir dans un donjon en fait sortir : le serveur a deja remis le
         joueur dans le monde ouvert. Laisser `DONJON_C` pose ici aurait garde le
         sol de pierre et le bouton « EXIT » sur l'ecran du Nexus. */
      DONJON_C = null; TUILES_D = null; PORTAILS_C = []; PORTAILS_LOIN = [];
      PORTAIL_PIEDS = null; PORTAIL_SIGNE = ''; peintPorte();
      POUVOIR_C = null; EFFETS_P = []; PARALYSE = 0; RALENTI = 0; BRULURE = 0;
      VITESSE = 260; peintPouvoir();
      var pp = PORTAIL_L;
      joueur.x = pp.x; joueur.y = pp.y + pp.rayon + 60;
      VIE.pv = VIE.max;
      if (indiceEl) indiceEl.classList.remove('on');
      joueSample('mort2', { vol: 0.9 });
      montreMort(m);
    }
    if (m.type === 'nexusEtat') {
      majJoueursDistants(m.joueurs || []);
      /* ---- LE SOL DU HALL ----
       * Le MEME registre que le monde de combat : `SACS_C`. Le serveur envoie
       * exactement le meme objet des deux cotes (sacs.js), et la page n'a donc
       * qu'une facon de lire un sac — le dessin, la grille et la detection
       * sous les pieds servent aux deux sans une ligne de plus. */
      if (SCENE === 'nexus') SACS_C = m.sacs || [];
      /* ---- COMBIEN SONT DERRIERE CHAQUE PORTE ----
       * Deux cartes, et le vrai risque n'est pas de mal choisir : c'est
       * d'entrer dans une carte vide. Le chiffre repond a « est-ce que je vais
       * croiser quelqu'un », qui est la seule question qu'on se pose devant
       * deux portes identiques. */
      if (m.portes) PORTES_C = m.portes;
    }
    /* Le solde suit n'importe quel message qui le porte — pas seulement
       `auth` — exactement comme `poseSolde` le fait pour le reste du site :
       un achat de skin ou de coffre depuis le tiroir, ouvert par-dessus le
       Nexus, doit mettre a jour le chiffre affiche ici sans recharger la page. */
    if (m.balance != null) majSolde(m.balance);
  }

  var soldeEl = document.getElementById('nxSolde');
  /* Le solde MIS EN FORME, garde a part : la boutique l'affiche aussi, et
     refaire la mise en forme la-bas donnerait deux facons d'ecrire le meme
     nombre — « 8.97M » d'un cote, « 8 973 000 » de l'autre. */
  var SOLDE_TEXTE = '';
  /* La VALEUR, gardee au meme endroit que sa mise en forme. La table de
     blackjack lisait `BOUTIQUE.balance`, qui n'existe qu'une fois la boutique
     ouverte : on arrivait donc sur la table avec « Balance 0 » et cinq mille
     $SWOGE en poche. Une deuxieme lecture ailleurs aurait fait un deuxieme
     chiffre a tenir d'accord ; celle-ci est posee la ou le solde arrive. */
  var SOLDE_NUM = 0;
  function majSolde(v) {
    var n = parseFloat(v || 0);
    if (isNaN(n)) return;
    SOLDE_NUM = n;
    var t = n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
      : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(2);
    SOLDE_TEXTE = t + ' $SWOGE';
    if (shopOuvert) peintShop();
    if (bjOuvert) peintBj();
    if (!soldeEl) return;
    soldeEl.innerHTML = '<b>' + t + '</b><em>$SWOGE</em>';
    soldeEl.classList.add('on');
  }

  // ================== LE PANNEAU DU PERSONNAGE ==================

  var MON_NOM = null;      // le pseudo du profil
  var FICHE = null;        // la reponse `personnage` du skin porte
  var SAC = [];            // le butin ramasse dans le monde (pas le coffre)
  var SKIN_POSSEDE = true; // faux tant qu'on n'a achete aucun personnage

  var elNom = document.getElementById('nxNom');
  var elOr = document.getElementById('nxOr');
  var elRepli = document.getElementById('nxRepli');
  var elPotions = document.getElementById('nxPotions');
  var POTIONS_C = [];
  /* ---- L'ETAL DES POTIONS ----
   * Le stock du magasin vient des joueurs. `MARCHE_P` porte, pour chaque
   * sorte, ce qu'on en a, ce qu'on en a mis en vente, et ce que le serveur en
   * a. Le serveur le renvoie ENTIER a chaque geste : la page ne recalcule
   * jamais un stock, elle affiche celui qu'on vient de lui dire. */
  var MARCHE_P = null;
  var shopVente = false;      // l'onglet potions montre-t-il le comptoir de vente
  var venteQte = {};          // combien on met en vente, par sorte
  /* Le nom court d'une stat, pour les mots qui flottent. « +1 att » ne se lit
     pas au milieu d'un combat ; « +1 ATT » si. */
  var NOM_STAT = { hp: 'hp', mp: 'mp', att: 'att', def: 'def',
                   spd: 'spd', dex: 'dex', vit: 'vit', wis: 'wis' };
  var elHpJauge = document.getElementById('nxHpJauge');
  var elMpJauge = document.getElementById('nxMpJauge');
  if (elRepli) elRepli.addEventListener('click', function () { clic(true); retourNexus('bouton'); });
  var elVignette = document.getElementById('nxVignette');
  var elLvl = document.getElementById('nxLvl'), elLvlJauge = document.getElementById('nxLvlJauge');
  var elXp = document.getElementById('nxXp');
  var elHp = document.getElementById('nxHp'), elMp = document.getElementById('nxMp');
  var elStats = document.getElementById('nxStats');
  var elEquip = document.getElementById('nxEquip'), elSac = document.getElementById('nxSac');
  var elGens = document.getElementById('nxGens');
  var elBalises = document.getElementById('nxBalises');
  var elVide = document.getElementById('nxVide');
  var enveloppe = document.getElementById('nxWrap');

  /* Replier le panneau. L'etat se garde d'une visite a l'autre : sur
     telephone, quelqu'un qui l'a range ne veut pas le retrouver deplie a
     chaque retour au Nexus. */
  (function poseBascule() {
    var b = document.getElementById('nxBascule');
    if (!b || !enveloppe) return;
    var CLE = 'swogeNexusPanneauReplie';
    try { if (localStorage.getItem(CLE) === '1') enveloppe.classList.add('replie'); } catch (e) {}
    /* `#nxCoffreVoile` vit HORS de `#nxWrap` : un selecteur descendant ne
       l'atteindrait pas. On recopie donc l'etat sur le <body>, qui les
       contient tous les deux. */
    var suitRepli = function () {
      document.body.classList.toggle('nxreplie', enveloppe.classList.contains('replie'));
    };
    suitRepli();
    /* On place le bouton d'apres la largeur MESUREE du panneau, pas d'apres
       la variable CSS : les deux different des qu'une barre de defilement
       s'intercale, et le bouton finissait par recouvrir la premiere lettre de
       chaque stat. Mesurer, c'est etre juste a toutes les tailles d'ecran
       sans avoir de decalage a deviner. */
    var ECART = 10;
    function place() {
      var pan = document.getElementById('nxPanneau');
      if (!pan) return;
      var replie = enveloppe.classList.contains('replie');
      var l = replie ? 0 : pan.getBoundingClientRect().width;
      b.style.right = (l + ECART) + 'px';
    }
    b.addEventListener('click', function () {
      var replie = enveloppe.classList.toggle('replie');
      suitRepli();
      b.setAttribute('aria-label', replie ? 'Show panel' : 'Hide panel');
      try { localStorage.setItem(CLE, replie ? '1' : '0'); } catch (e) {}
      place();
    });
    window.addEventListener('resize', place);
    window.addEventListener('orientationchange', place);
    place();
    b.setAttribute('aria-label',
      enveloppe.classList.contains('replie') ? 'Show panel' : 'Hide panel');
  })();

  /* Les six attributs de la grille. HP et MP n'y sont pas : ils ont leurs
     barres au-dessus, et les repeter en chiffres ferait dire deux fois la
     meme chose a deux endroits. L'ordre est celui de la fiche d'origine. */
  var ATTRIBUTS = ['att', 'def', 'spd', 'dex', 'vit', 'wis'];
  var NOM_ATTR = { att: 'ATT', def: 'DEF', spd: 'SPD', dex: 'DEX', vit: 'VIT', wis: 'WIS' };
  /* Les quatre emplacements, dans l'ordre de l'image : arme, armure, fruit,
     bague — ce que l'on tient, ce que l'on porte, puis les deux bijoux. */
  var EMPLACEMENTS = ['equipArme', 'equipArmure', 'equipFruit', 'equipBague'];
  var CASES_SAC = 8;

  /* ---- « OG » : LA PIECE EST NUMEROTEE ----
   *
   * Les pieces de la BOUTIQUE existent en nombre fini et se paient en $SWOGE :
   * quarante legendaires pour toute une saison, quatre reliques. Celles qui
   * tombent dans le monde ne coutent rien et ne se comptent pas.
   *
   * Rien ne les distinguait a l'oeil — memes saisons, memes raretes, memes
   * dessins de rarete. Or c'est la seule chose qu'un joueur a besoin de savoir
   * avant de risquer une piece dans la lave, ou elle disparait s'il meurt.
   *
   * Le drapeau vient du SERVEUR : la page ne peut pas le deviner, seul le
   * catalogue sait laquelle se vend. */
  /* Ce qu'une piece VAUT, en un chiffre, pour la ranger. On somme ce qu'elle
     donne plutot que de trier sur sa rarete : les deux disent la meme chose
     dans le meme ordre, et celui-ci n'a besoin de rien d'autre que la ligne
     qu'on tient deja. Les jauges se comptent par dix — trente points de vie
     et trois de defense ne se totalisent pas dans la meme unite. */
  function forceDe(o) {
    var t = 0;
    var b = (o && o.bonus) || {};
    for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) {
      t += (k === 'hp' || k === 'mp') ? b[k] / 10 : b[k];
    }
    /* Une arme n'a pas de bonus : ses DEGATS sont sa fiche. */
    if (o && o.degats) t += (o.degats[0] + o.degats[1]) / 2;
    return t;
  }

  /* La colonne d'une fiole sur sa planche, en pourcentage de fond. L'ordre
     vient du SERVEUR — c'est lui qui dit dans quel ordre les huit fioles sont
     dessinees — et se recopier ici les ferait deriver le jour ou une neuvieme
     stat apparait. */
  /* La HAUTEUR d'une pile de fioles, quand il y en a plus d'une. Le chiffre
     vient du serveur : c'est lui qui tient les cases du sac, et le recompter
     ici ferait deux verites sur ce qu'on transporte. */
  function pileFiole(o) {
    var q = o && Number(o.quantite);
    return q > 1 ? '<b class="nxp-pile">' + q + '</b>' : '';
  }

  function colonneFiole(o) {
    /* La colonne vient AVEC la ligne : le serveur la compte, parce que l'ordre
       des huit stats n'existe cote page que dans le monde de combat — dans le
       Nexus on aurait dessine huit fois la meme fiole. */
    var col = (o && typeof o.col === 'number') ? o.col : 0;
    var n = (o && o.cols) || 8;
    return ((col / Math.max(1, n - 1)) * 100).toFixed(3);
  }

  function marqueOG(o) {
    return (o && o.og) ? '<b class="nxp-og">OG</b>' : '';
  }

  function ech(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function court(a) { return a ? a.slice(0, 6) : '—'; }

  /** La somme des bonus d'equipement qui visent UNE stat. La fiche rend deja
      le total dans `stats`, mais pas le detail : sans ce calcul on ne pourrait
      pas dire « 80 (+30) », seulement « 80 » — et un objet equipe ne se
      verrait nulle part. */
  /* `bonus` est un OBJET {stat: valeur} : un objet touche plusieurs stats a
     la fois. On somme donc ce que chaque piece donne sur CETTE stat, au lieu
     de ne regarder que sa stat principale — sinon le +130 MP d'un casque
     n'apparaitrait nulle part, alors qu'il compte dans le total. */
  function bonusPour(stat) {
    if (!FICHE) return 0;
    var t = 0;
    EMPLACEMENTS.forEach(function (k) {
      var e = FICHE[k];
      if (e && e.bonus) t += (e.bonus[stat] || 0);
    });
    return t;
  }

  /** Le detail d'un objet, en une ligne — « +14 DEX, +8 SPD ». Sert
      d'infobulle : la case est trop petite pour tout montrer, mais rien ne
      doit rester invisible. */
  function detailBonus(e) {
    if (!e || !e.bonus) return '';
    var out = [];
    for (var s in e.bonus) if (e.bonus[s]) out.push('+' + e.bonus[s] + ' ' + s.toUpperCase());
    if (e.degats) out.push('dmg ' + e.degats[0] + '-' + e.degats[1]);
    return out.join(', ');
  }

  /** La valeur montree sur la case : la PLUS GROSSE du profil. Afficher la
      somme n'aurait pas de sens (10 points de sagesse et 130 de mana ne
      s'ajoutent pas), et afficher la stat principale seule mentirait sur un
      objet dont une autre stat pese davantage en chiffres. */
  function bonusEnTete(e) {
    if (!e || !e.bonus) return 0;
    var max = 0;
    for (var s in e.bonus) if (e.bonus[s] > max) max = e.bonus[s];
    return max;
  }

  /* La pastille du coin a ete retiree : un seul chiffre pose sur une case ne
     pouvait pas dire « +21 DEF et +170 HP », et choisir le plus gros des deux
     revenait a en cacher un. C'est la FICHE au survol qui porte l'information
     maintenant, en entier. `bonusEnTete` reste : la mini-carte et le menu du
     coffre s'en servent encore pour trier. */

  /* ================== LA FICHE D'UN OBJET ==================
   *
   * Une case de sac fait vingt pixels de cote : elle ne peut pas dire ce que
   * la piece apporte. La pastille essayait, avec un seul chiffre, et elle
   * mentait des qu'un objet touchait plus d'une stat — « +21 » sur un
   * plastron qui donne aussi 170 points de vie.
   *
   * Le survol ouvre donc la fiche complete. Elle vit sur `document`, en un
   * seul exemplaire : les cases sont refaites a chaque peinture du panneau,
   * et des ecouteurs poses sur elles disparaitraient avec.
   */
  var elFiche = null;

  /** L'objet derriere une case, d'ou qu'elle vienne. Les trois surfaces —
      equipement, sac, coffre — portent la meme forme de donnee, mais pas au
      meme endroit : on les cherche la ou elles sont plutot que de recopier
      l'objet dans le HTML. */
  function objetDeLaCase(el) {
    if (!el || !el.dataset) return null;
    if (el.dataset.slot && el.dataset.item) return FICHE ? FICHE[el.dataset.slot] : null;
    /* ---- UNE PIECE AU SOL SE SURVOLE COMME LES AUTRES ----
     * C'est meme LA que la question se pose : « est-ce qu'elle vaut mieux que
     * celle que je porte ? » On ne la posait nulle part ailleurs devant un sac
     * ouvert, et il fallait la ramasser pour savoir — donc faire de la place,
     * donc parfois jeter la bonne. Le serveur envoie desormais la fiche avec
     * la piece ; on ne fait que renommer ses champs. */
    if (el.dataset.butin !== undefined) {
      var c = SAC_PIEDS && SAC_PIEDS.c && SAC_PIEDS.c[Number(el.dataset.butin)];
      if (!c) return null;
      /* Le meme ordre de colonnes que la grille : il vient du serveur, comme
         partout ailleurs — la page ne decide pas dans quel ordre les fioles
         sont dessinees sur leur planche. */
      var d = contenuDeLaPlace(c, (MONDE_C && MONDE_C.stats) || []);
      /* Une fiole de STAT donne un point pour toujours : c'est un bonus, et
         il s'ecrit comme les autres. Le dire « sans bonus » serait faux — et
         c'est justement la seule chose qu'on veuille savoir devant elle. */
      if (c.st) {
        var pts = {};
        pts[c.st] = (c.st === 'hp' || c.st === 'mp') ? 5 : 1;
        return { nom: 'Stat potion', bonus: pts, couleur: '#EAF2FF',
                 note: 'Permanent — and lost when this character dies' };
      }
      if (c.po) return { nom: d.titre, couleur: '#EAF2FF',
                         note: c.po === 'vie' ? 'Restores health' : 'Restores mana' };
      return { nom: c.nm || d.titre, bonus: c.bo || null, degats: c.dg || null,
               couleur: c.co || '#8DA0C4', og: !!c.og };
    }
    if (el.dataset.sac) {
      /* Par la PLACE et non par l'identifiant : deux exemplaires du meme
         objet occupent deux cases, et chercher par identifiant rendrait
         toujours le premier — juste ici, faux le jour ou les deux
         differeront. */
      var pl = Number(el.dataset.place);
      var parPlace = (SAC || []).filter(function (o) { return o.place === pl; })[0];
      if (parPlace && parPlace.fiole) {
        return { nom: 'Stat potion', bonus: parPlace.bonus, couleur: parPlace.couleur,
                 note: 'Double-click to drink \u2014 or store it in your vault' };
      }
      return parPlace || (SAC || []).filter(function (o) { return o.id === Number(el.dataset.sac); })[0] || null;
    }
    if (el.dataset.item && el.classList && el.classList.contains('nxcf-i')) {
      var id = Number(el.dataset.item), t = null;
      ['fruits', 'armes', 'armures', 'bagues'].forEach(function (c) {
        if (t) return;
        t = ((COFFRE && COFFRE[c]) || []).filter(function (o) { return o.id === id; })[0] || null;
      });
      return t;
    }
    return null;
  }

  function montreFiche(o, cible) {
    if (!o) return cacheFiche();
    if (!elFiche) elFiche = document.getElementById('nxFiche');
    if (!elFiche) return;
    var lignes = '';
    for (var k in (o.bonus || {})) {
      if (o.bonus[k]) lignes += '<s>+' + o.bonus[k] + ' ' + k.toUpperCase() + '</s>';
    }
    if (o.degats) lignes += '<i>' + o.degats[0] + '\u2013' + o.degats[1] + ' damage</i>';
    /* Une arme ne donne plus aucune stat : sans ce mot, sa fiche n'aurait
       qu'une ligne de degats et donnerait l'impression d'etre incomplete. */
    /* `degats` n'est pose que sur les armes : c'est donc lui, et pas la
       saison, qui reconnait une arme — la saison n'accompagne pas toutes les
       formes d'objet envoyees par le serveur. */
    if (o.degats) lignes += '<em>Weapons give damage, not stats</em>';
    /* ---- CE QUE LE FRUIT DECLENCHE ----
     * On portait un fruit sans savoir ce qu'il faisait : ses deux lignes de
     * bonus ne disent rien de la foudre, et la seule facon de l'apprendre
     * etait d'aller la lancer dans un combat.
     * La phrase vient du SERVEUR, avec ses chiffres. La page pourrait la
     * calculer, au prix de deux tables recopiees — et une copie qui diverge
     * ferait dire « 3x » a un fruit dont le serveur applique deux. */
    if (o.sort) {
      lignes += '<i class="nxfi-sort">\u26A1 ' + ech(o.sort.nom) +
        ' \u00b7 ' + o.sort.cout + ' MP</i>' +
        '<em>' + ech(o.sort.quoi) + ' \u00b7 ' + o.sort.recharge + 's cooldown</em>';
    }
    /* `note` dit ce qu'un objet fait quand ce n'est pas un bonus — une fiole
       qui rend de la vie n'a pas de stat a montrer, et « sans bonus » serait
       faux plutot que vide. */
    else if (o.note) lignes += '<em>' + ech(o.note) + '</em>';
    else if (!lignes) lignes = '<em>No stat bonus</em>';
    /* Les numerotees le disent ici aussi : c'est la fiche qu'on lit avant de
       decider si l'on ramasse. */
    if (o.og) lignes += '<em style="color:#C89BFF">OG \u2014 limited series</em>';
    elFiche.innerHTML = '<b>' + ech(o.nom || '') + '</b>' + lignes;
    elFiche.style.setProperty('--fc', o.couleur || '#EAF2FF');
    elFiche.classList.add('on');
    poseFiche(cible);
  }

  /** On l'ancre a la CASE, pas au pointeur : une fiche qui suit la souris
      tremble sous le doigt et sort de l'ecran au bord. Le panneau est a
      droite, donc elle s'ouvre a GAUCHE de la case ; si la place manque, elle
      repasse a droite plutot que d'etre coupee. */
  function poseFiche(cible) {
    if (!elFiche || !cible) return;
    var r = cible.getBoundingClientRect();
    var f = elFiche.getBoundingClientRect();
    var x = r.left - f.width - 10;
    if (x < 8) x = Math.min(window.innerWidth - f.width - 8, r.right + 10);
    var y = Math.min(window.innerHeight - f.height - 8, Math.max(8, r.top - 4));
    elFiche.style.left = Math.round(x) + 'px';
    elFiche.style.top = Math.round(y) + 'px';
  }

  function cacheFiche() {
    if (elFiche) elFiche.classList.remove('on');
  }

  /* Le survol a la souris. Sur telephone il n'existe pas : c'est le
     GLISSEMENT qui ouvre la fiche (voir `debutPrise`), ce qui revient au meme
     geste — on prend la piece pour savoir ce qu'elle vaut. */
  document.addEventListener('pointerover', function (ev) {
    if (ev.pointerType && ev.pointerType !== 'mouse') return;
    if (PRISE) return;
    var el = ev.target.closest ? ev.target.closest('[data-sac],[data-slot],[data-butin],.nxcf-i') : null;
    if (!el) return cacheFiche();
    montreFiche(objetDeLaCase(el), el);
  });
  document.addEventListener('pointerout', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-sac],[data-slot],[data-butin],.nxcf-i') : null;
    if (el) cacheFiche();
  });

  /* ================== PRENDRE ET DEPOSER ==================
   *
   * Le menu du coffre avait des boutons « store » et une fleche. Ca marche,
   * mais ce n'est pas le geste : on veut ATTRAPER un objet et le poser ou on
   * le veut — dans le sac, sur un emplacement, dans le coffre.
   *
   * On n'utilise PAS le glisser-deposer natif du navigateur : il ne repond
   * pas au doigt, et la moitie des joueurs sont sur telephone. On suit le
   * POINTEUR, qui couvre les deux d'un seul code.
   *
   * Trois origines et trois destinations, et toutes les combinaisons ne se
   * valent pas :
   *   coffre  -> emplacement : on s'equipe
   *   coffre  -> sac         : on ressort la piece (elle redevient perissable)
   *   sac     -> coffre      : on la met a l'abri
   *   sac     -> emplacement : il faut d'abord la ranger — deux messages,
   *                            dans l'ordre, sur la meme socket
   *   equipe  -> sac         : on la retire PUIS on la ressort
   *   equipe  -> coffre      : on la retire, elle y est deja
   */
  var PRISE = null, elFantome = null;

  function familleDuSlot(k) {
    return { equipFruit: 'equipeFruit', equipArme: 'equipeArme',
             equipArmure: 'equipeArmure', equipBague: 'equipeBague' }[k];
  }
  /** L'emplacement auquel un objet appartient, d'apres sa saison. */
  function slotDeLObjet(id) {
    var t = null;
    ['fruits', 'armes', 'armures', 'bagues'].forEach(function (champ, i) {
      if (t) return;
      if (((COFFRE && COFFRE[champ]) || []).some(function (o) { return o.id === id; })) {
        t = ['equipFruit', 'equipArme', 'equipArmure', 'equipBague'][i];
      }
    });
    if (t) return t;
    // pas au coffre : on cherche dans le sac, par la saison de l'objet
    var o = (SAC || []).filter(function (x) { return x.id === id; })[0];
    if (!o) return null;
    return { 1: 'equipFruit', 2: 'equipArme', 3: 'equipArmure', 4: 'equipBague' }[o.saison] || null;
  }

  function ouEstLePointeur(x, y) {
    var el = document.elementFromPoint(x, y);
    while (el) {
      if (el.id === 'nxSac' || (el.classList && el.classList.contains('nxp-c')
          && el.closest && el.closest('#nxSac'))) {
        /* LA CASE, pas seulement le sac : on peut ranger ses huit places, et
           pour ca il faut savoir laquelle on vise. Une case VIDE compte — c'est
           meme la ou l'on veut poser le plus souvent, et elle ne porte pas de
           `data-place` puisqu'elle ne porte pas de piece. On lit donc son RANG
           parmi les huit, qui est vrai des deux cotes. */
        var cs = (el.classList && el.classList.contains('nxp-c')) ? el
               : (el.closest ? el.closest('#nxSac .nxp-c') : null);
        var pl = null;
        if (cs) {
          var toutes = [].slice.call(document.querySelectorAll('#nxSac .nxp-c'));
          var k = toutes.indexOf(cs);
          if (k >= 0) pl = k;
        }
        return { quoi: 'sac', place: pl };
      }
      if (el.id === 'nxButin' || el.id === 'nxButinCases') return { quoi: 'butin' };
      if (el.id === 'nxEquip' || (el.dataset && el.dataset.slot)) {
        var c = el.closest ? el.closest('[data-slot]') : null;
        return { quoi: 'equip', slot: c ? c.dataset.slot : null };
      }
      if (el.id === 'nxCoffreVoile' || (el.classList && el.classList.contains('nxcf-carte'))) {
        return { quoi: 'coffre' };
      }
      /* ---- LE SOL ----
       * Lacher une piece SUR LA SCENE, dans le monde de combat, la pose par
       * terre. C'etait le seul geste du jeu qu'on ne pouvait pas faire : le
       * sol n'existait comme cible que s'il y avait deja un sac dessous, et
       * sans sac il n'y avait plus rien a viser. On ne pouvait donc jeter
       * quelque chose que la ou quelque chose etait deja tombe.
       * Le serveur, lui, savait le faire depuis le debut : `depose` cree un
       * sac s'il n'en trouve pas. Il ne manquait que le geste. */
      if (el.tagName === 'CANVAS' && (SCENE === 'monde' || SCENE === 'nexus')) {
        return { quoi: 'sol' };
      }
      el = el.parentElement;
    }
    return null;
  }

  function lachePrise(x, y) {
    var cible = ouEstLePointeur(x, y);
    var p = PRISE;
    finPrise();
    if (!p || !cible) return;
    var id = p.id;
    /* ---- DEPUIS LE SAC AU SOL ----
     * Ou qu'on lache — sac, equipement, coffre — la piece va d'abord DANS LE
     * SAC. C'est le seul endroit ou une trouvaille peut atterrir, et vouloir
     * s'equiper directement depuis le sol demanderait trois messages a la
     * suite pour un geste qu'on refera de toute facon a l'arret. */
    if (p.de === 'butin') { prendDuButin(p.place); return; }
    /* ---- VERS LE SAC AU SOL ----
     * L'autre moitie de l'echange. Le sol ne prend que ce qui vient du SAC :
     * une piece portee doit d'abord etre retiree, et une piece du coffre est
     * a l'abri — l'envoyer par terre depuis la salle du coffre serait un
     * geste qu'on ne peut pas faire, puisqu'on n'y est pas dans le monde. */
    if (cible.quoi === 'butin' || cible.quoi === 'sol') {
      if (p.de !== 'sac') return;
      debloqueSon();
      /* Le MEME message dans les deux cas. Le serveur pose la piece dans le
         sac sous les pieds s'il y en a un, et en cree un sinon : deux
         messages pour deux facons de dire la meme chose auraient donne deux
         regles a tenir d'accord. */
      /* Le geste est le meme ; c'est la SIMULATION qui change. Un seul nom de
         message pour les deux aurait oblige le serveur a deviner ou se tient
         le joueur — et deviner, sur un sol que tout le monde peut vider, est
         exactement ce qu'il ne doit jamais faire. */
      envoie({ type: SCENE === 'nexus' ? 'nexusDepose' : 'realmDepose', item: id });
      clic(true);
      return;
    }
    if (cible.quoi === 'equip') {
      /* L'objet va dans SA case, pas dans celle qu'on a visee. Viser juste
         n'a aucun interet — un fruit ne peut aller nulle part ailleurs que
         dans l'emplacement fruit — et le serveur refuse de toute facon un
         fruit envoye au slot d'arme. Lacher n'importe ou sur l'equipement
         doit donc suffire. */
      /* Depuis le SAC, un seul message : il porte la piece ET rend celle
         qu'on avait dans le sac. Le glissement et le double-clic font donc
         exactement la meme chose — deux gestes pour un resultat, pas deux
         resultats pour un geste. */
      if (p.de === 'sac') { porteDuSac(id); return; }
      var slot = slotDeLObjet(id) || cible.slot;
      var msg = familleDuSlot(slot);
      if (!msg) return;
      envoie({ type: msg, skin: PERSO, item: id });
      clic(true);
    } else if (cible.quoi === 'sac') {
      /* ---- RANGER SON SAC ----
       * Huit places, et le droit de les ranger. Ce n'est pas un confort : le
       * sac se lit d'un coup d'oeil en combat, et « ma potion est toujours en
       * bas a droite » vaut une demi-seconde a chaque fois qu'on la cherche.
       * On ECHANGE les deux cases : un decalage bougerait tout ce qui suit, et
       * le joueur en deplacerait une pour en retrouver six ailleurs. */
      if (p.de === 'sac') {
        if (cible.place === null || cible.place === undefined) return;
        if (!(p.place >= 0) || p.place === cible.place) return;
        envoie({ type: 'sacDeplace', de: p.place, vers: cible.place });
        clic(true);
        return;
      }
      if (p.de === 'equip') envoie({ type: familleDuSlot(p.slot), skin: PERSO, item: null });
      envoie({ type: 'sortCoffre', item: id });
      clic(true);
    } else if (cible.quoi === 'coffre') {
      /* Une fiole se range aussi — c'est meme tout l'interet du coffre a
         fioles : ce qu'on y met survit a la mort du personnage. */
      if (p.de === 'sac' && p.fiole) { envoie({ type: 'fioleRange', stat: p.fiole }); clic(true); }
      else if (p.de === 'sac') { envoie({ type: 'rangeCoffre', item: id }); clic(true); }
      else if (p.de === 'equip') { envoie({ type: familleDuSlot(p.slot), skin: PERSO, item: null }); clic(true); }
    }
  }

  function finPrise() {
    cacheFiche();
    if (elFantome) { elFantome.remove(); elFantome = null; }
    PRISE = null;
    document.body.classList.remove('nxdrag');
  }

  function debutPrise(ev, source) {
    PRISE = source;
    /* Au doigt il n'y a pas de survol : prendre la piece EST le geste par
       lequel on demande « c'est quoi ? ». On ouvre donc la fiche a ce
       moment-la, ancree a la case d'origine. */
    if (source.el) montreFiche(objetDeLaCase(source.el), source.el);
    document.body.classList.add('nxdrag');
    /* ---- LE FANTOME EST UNE COPIE, PAS UNE IMAGE ----
     *
     * C'etait un `<img>` dont on remplissait la source avec celle de la case.
     * Ca marche pour une piece — elle a un `<img>` — et pas pour une FIOLE de
     * stat : elle est dessinee par un fond CSS sur un `<u>`, il n'y a aucune
     * source a copier. On prenait donc une fiole et le fantome qui suivait le
     * doigt etait vide. C'est ce qu'on nous a rapporte : « la photo ne
     * s'affiche pas ».
     *
     * On COPIE ce que la case montre, quelle que soit sa forme. La page n'a
     * plus a savoir comment un objet est dessine — et le jour ou une troisieme
     * facon apparait, elle n'aura pas a l'apprendre non plus. */
    elFantome = document.createElement('div');
    elFantome.className = 'nxp-fantome';
    var dessin = source.el && source.el.querySelector
      ? source.el.querySelector('img, u.fiole') : null;
    if (dessin) elFantome.appendChild(dessin.cloneNode(true));
    else if (source.src) {
      var im = document.createElement('img');
      im.src = source.src;
      elFantome.appendChild(im);
    }
    document.body.appendChild(elFantome);
    bougePrise(ev.clientX, ev.clientY);
    clic(false);
  }
  function bougePrise(x, y) {
    if (elFantome) { elFantome.style.left = x + 'px'; elFantome.style.top = y + 'px'; }
  }

  /* UN seul couple d'ecouteurs sur le document, pas un par case : les cases
     sont refaites a chaque peinture du panneau, et des ecouteurs poses sur
     elles disparaitraient avec. */
  document.addEventListener('pointerdown', function (ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    var el = ev.target.closest
      ? ev.target.closest('[data-sac],[data-item],[data-slot],[data-butin]') : null;
    if (!el) return;
    /* Le bouton « reprendre » du menu garde son propre geste : on ne le
       transforme pas en poignee de glissement. */
    if (ev.target.classList && ev.target.classList.contains('nxcf-sortir')) return;
    var img = el.querySelector('img');
    var src = img ? img.getAttribute('src') : '';
    if (el.dataset.butin) {
      /* Une case vide n'est pas une poignee : la prendre ferait glisser un
         fantome sans image jusqu'a un lacher qui ne pourrait rien faire. */
      if (el.classList.contains('vide')) return;
      debutPrise(ev, { de: 'butin', place: Number(el.dataset.butin), src: src, el: el });
    } else if (el.dataset.sac) {
      debutPrise(ev, { de: 'sac', id: el.dataset.fiole ? 'st:' + el.dataset.fiole
                                                       : Number(el.dataset.sac),
                       fiole: el.dataset.fiole || null,
                       place: Number(el.dataset.place), src: src, el: el });
    } else if (el.dataset.slot && el.dataset.item) {
      debutPrise(ev, { de: 'equip', slot: el.dataset.slot, id: Number(el.dataset.item), src: src, el: el });
    } else if (el.dataset.item && el.classList.contains('nxcf-i')) {
      debutPrise(ev, { de: 'coffre', id: Number(el.dataset.item), src: src, el: el });
    } else return;
    ev.preventDefault();
  });
  /* ---- DOUBLE-CLIC SUR UNE PIECE DU SAC : ON LA PORTE ----
   *
   * Le meme geste que sur le sac au sol, et pour la meme raison : la case est
   * une POIGNEE, donc un clic simple ne peut pas agir — un clic legerement de
   * travers deviendrait un equipement qu'on n'a pas demande.
   *
   * Un seul message. La page le faisait en deux — « range au coffre », puis
   * « equipe » — et l'ancienne piece restait alors AU COFFRE, que le joueur
   * ne voit pas depuis le monde de combat : il la croyait perdue. Elle revient
   * maintenant dans le sac, a la place qu'occupait celle qu'on vient de
   * mettre. Un pour un : le sac ne deborde jamais. */
  function porteDuSac(id) {
    if (!id || !PERSO) return;
    debloqueSon();
    /* ---- UNE FIOLE SE BOIT, ELLE NE SE PORTE PAS ----
     * Le meme geste sur la meme case, parce que c'est le meme sens : « utilise
     * ca ». Une piece se met sur soi, une fiole se boit. Demander deux gestes
     * differents obligerait le joueur a savoir laquelle est laquelle avant de
     * la toucher. */
    var st = String(id).slice(0, 3) === 'st:' ? String(id).slice(3) : null;
    if (st) { envoie({ type: 'fioleBoit', skin: PERSO, stat: st }); clic(true); return; }
    envoie({ type: 'equipeDuSac', skin: PERSO, item: Number(id) });
    clic(true);
  }
  if (elSac) {
    elSac.addEventListener('dblclick', function (ev) {
      var c = ev.target.closest ? ev.target.closest('[data-sac]') : null;
      if (!c) return;
      ev.preventDefault();
      porteDuSac(c.dataset.sac);
    });
  }

  document.addEventListener('pointermove', function (ev) {
    if (PRISE) { bougePrise(ev.clientX, ev.clientY); ev.preventDefault(); }
  });
  document.addEventListener('pointerup', function (ev) {
    if (PRISE) lachePrise(ev.clientX, ev.clientY);
  });
  document.addEventListener('pointercancel', finPrise);

  function peintPanneau() {
    // ---- le nom et sa vignette
    if (elNom) elNom.textContent = MON_NOM || court(MON_ADRESSE) || '—';
    /* ---- L'OR ----
     * Deux nombres, pas un : le total DEJA acquis, et ce que le personnage
     * vivant rapportera s'il meurt. Les confondre ferait croire qu'on possede
     * une somme qu'on peut encore perdre — c'est exactement l'inverse, elle
     * n'est versee qu'a la mort. Le second est donc ecrit en retrait. */
    /* Le repli ne s'affiche QUE s'il y a un endroit d'ou revenir. Dans le
       Nexus il ne ferait rien, et un bouton qui ne fait rien apprend au
       joueur a ne plus le regarder. */
    if (elRepli) elRepli.style.display = (SCENE === 'nexus') ? 'none' : '';
    if (elOr && FICHE) {
      var acquis = FICHE.fameCompte || 0, enCours = FICHE.fame || 0;
      elOr.innerHTML = '\uD83C\uDFC6<b>' + acquis.toLocaleString('en-US') + '</b>' +
        (enCours ? '<i>+' + enCours.toLocaleString('en-US') + '</i>' : '');
      elOr.title = 'Gold: ' + acquis.toLocaleString('en-US') + ' banked' +
        (enCours ? ', ' + enCours.toLocaleString('en-US') + ' riding on this character' : '');
    }
    if (elVignette) {
      elVignette.src = 'img/skins/skin_' + encodeURIComponent(PERSO) + '.webp';
      elVignette.onerror = function () { elVignette.style.visibility = 'hidden'; };
    }

    // ---- les trois barres
    if (FICHE) {
      var plein = FICHE.xpProchain
        ? Math.max(0, Math.min(100, Math.round(
            (FICHE.xp - FICHE.xpNiveau) * 100 / (FICHE.xpProchain - FICHE.xpNiveau))))
        : 100;
      elLvl.textContent = 'Lvl ' + FICHE.niveau;
      elLvlJauge.style.width = plein + '%';
      elXp.textContent = FICHE.xpProchain ? plein + '%' : 'MAX';
      /* La barre lit les PV COURANTS, pas le plafond — le meme nombre que
         le repli automatique. Deux lectures separees finiraient par
         diverger, et on se replierait a un pourcentage que la barre ne
         montre pas. Rien ne fait encore de degats, donc `pv` vaut `max` :
         c'est exact, ce n'est pas un chiffre invente. */
      poseVieMax(FICHE.stats.hp, FICHE.stats.mp);
      elHp.textContent = VIE.pv;
      elMp.textContent = VIE.mp;
      /* ---- LA JAUGE SE VIDE ----
       * Elle etait figee a 100 % : le nombre baissait, la barre non. Dans un
       * combat on ne lit pas un nombre, on regarde une longueur — c'est
       * pour ca qu'on en met une. */
      if (elHpJauge) elHpJauge.style.width =
        (VIE.max > 0 ? Math.max(0, Math.min(100, VIE.pv * 100 / VIE.max)) : 100) + '%';
      if (elMpJauge) elMpJauge.style.width =
        (VIE.mpMax > 0 ? Math.max(0, Math.min(100, VIE.mp * 100 / VIE.mpMax)) : 100) + '%';
    } else {
      elLvl.textContent = 'Lvl —'; elLvlJauge.style.width = '0%';
      elXp.textContent = ''; elHp.textContent = ''; elMp.textContent = '';
    }
    /* Un panneau vide sans raison se lit comme une panne. Celui qui n'a pas
       encore de personnage doit lire ce qui lui manque, et pouvoir y aller
       d'un geste — c'est la seule chose a faire depuis cet ecran-la. */
    if (elVide) {
      /* `display:'block'` explicitement, PAS `''` : la regle de base de
         `.nxp-vide` est `display:none`, donc effacer le style en ligne
         rendrait la main a cette regle-la et le message resterait cache —
         ecrit, mais invisible. */
      if (!SKIN_POSSEDE) {
        elVide.innerHTML = 'No character yet — <a href="games.html?open=sk">pick one</a> to get stats and gear.';
        elVide.style.display = 'block';
      } else if (!FICHE) {
        elVide.textContent = 'Loading your character…';
        elVide.style.display = 'block';
      } else elVide.style.display = 'none';
    }

    // ---- les six attributs
    elStats.innerHTML = ATTRIBUTS.map(function (k) {
      if (!FICHE) return '<div class="nxp-st">' + NOM_ATTR[k] + ' - <b>—</b></div>';
      var b = bonusPour(k);
      /* ---- CE QU'IL MANQUE POUR ETRE AU PLAFOND ----
       *
       * Le plafond vient du SERVEUR (`plafond[k]`), et la page ne le refait
       * pas : elle aurait pu — elle a `base` et la table des potions — mais ce
       * serait la meme formule ecrite des deux cotes du reseau, et le jour ou
       * la courbe des niveaux change, l'un des deux dirait encore l'ancien
       * plafond. Le joueur lirait « il te manque 3 » sur une stat deja pleine
       * sans aucun moyen de savoir lequel des deux chiffres ment.
       *
       * On compare la part PERMANENTE — niveau plus potions bues — et pas le
       * total affiche : celui-la contient l'equipement, qui se prete et se
       * perd a la mort. Une stat qui passerait pour pleine parce qu'on porte
       * une bague redeviendrait creuse en changeant de bague, sans que rien ne
       * l'explique. */
      var pl = FICHE.plafond && FICHE.plafond[k];
      var reste = pl ? Math.max(0, pl.max - pl.atteint) : null;
      var plein = pl && reste === 0;
      return '<div class="nxp-st' + (b ? ' up' : '') + (plein ? ' max' : '') + '">' +
        NOM_ATTR[k] +
        ' - <b>' + FICHE.stats[k] + '</b>' +
        (b ? ' <u>(+' + b + ')</u>' : '') +
        /* Le manque en petit, a cote : c'est une information de progression,
           pas le chiffre qu'on lit en combat. Rien quand c'est plein — le
           jaune le dit deja, et « MAX » a cote d'un chiffre jaune serait deux
           fois la meme chose. */
        (reste > 0 ? ' <i>+' + reste + '</i>' : '') +
        '</div>';
    }).join('');

    // ---- les quatre cases d'equipement
    elEquip.innerHTML = EMPLACEMENTS.map(function (k) {
      var e = FICHE && FICHE[k];
      /* La case porte son EMPLACEMENT meme vide : c'est ce qui permet d'y
         lacher une piece, et une case vide est justement celle ou l'on veut
         deposer. */
      if (!e) return '<div class="nxp-c vide" data-slot="' + k + '"></div>';
      /* Le FRUIT porte le pouvoir : c'est la seule case qui a un etat de
         recharge. Le voile est pose vide ici et rempli par `majJauges`, dix
         fois par seconde — le reconstruire a chaque image detruirait la piece
         qu'on est peut-etre en train de faire glisser. */
      var cd = (k === 'equipFruit' && POUVOIR_C) ? '<i class="cd"></i>' : '';
      /* Plus de pastille, et plus de `title` : la premiere disait UNE stat
         sur trois sans dire laquelle, le second est l'infobulle du
         navigateur — lente, laide, et impossible a mettre aux couleurs du
         jeu. Le survol ouvre la vraie fiche (voir `montreFiche`). */
      return '<div class="nxp-c" data-slot="' + k + '" data-item="' + e.item + '">' +
        '<img alt="" src="img/shop/' + encodeURIComponent(e.cle) + '.webp" ' +
        'onerror="this.style.visibility=\'hidden\'">' + cd + marqueOG(e) + '</div>';
    }).join('');

    // ---- le sac : le butin ramasse, pas les achats
    /* ---- CHAQUE PIECE A SA CASE ----
     * On posait la liste dans l'ordre ou elle arrive. Ca revient au meme tant
     * qu'on ne fait qu'ajouter, mais pas quand on ECHANGE : la piece rendue
     * reprend la case de celle qu'on vient de mettre, et le serveur le dit
     * dans `place`. L'ignorer ferait glisser tout le sac d'un cran sous les
     * doigts du joueur, au moment precis ou il regarde ce qu'il a fait. */
    var parPlace = [];
    for (var i = 0; i < SAC.length; i++) {
      var q = SAC[i];
      var pl = (q && typeof q.place === 'number' && q.place >= 0 && q.place < CASES_SAC)
        ? q.place : parPlace.length;
      while (parPlace[pl]) pl++;      // deux pieces sur une case : la seconde glisse
      if (pl < CASES_SAC) parPlace[pl] = q;
    }
    var cases = [];
    for (var i = 0; i < CASES_SAC; i++) {
      var o = parPlace[i];
      /* Une FIOLE DE STAT n'a pas d'image de boutique : elle se lit sur la
         planche des fioles, a la colonne de sa stat — la meme que dans le sac
         au sol, pour qu'on reconnaisse la meme chose aux deux endroits. */
      var img = o && o.fiole
        ? '<u class="fiole" style="background-position:' + colonneFiole(o) + '% 0"></u>'
        : (o ? '<img alt="" src="img/shop/' + encodeURIComponent(o.cle) + '.webp" ' +
               'onerror="this.style.visibility=\'hidden\'">' : '');
      cases.push(o
        ? '<div class="nxp-c" data-sac="' + (o.fiole ? 'st:' + o.fiole : o.id) +
          '" data-place="' + i + '"' + (o.fiole ? ' data-fiole="' + o.fiole + '"' : '') + '>' +
          img + marqueOG(o) + pileFiole(o) + '</div>'
        : '<div class="nxp-c vide"><u>' + (i + 1) + '</u></div>');
    }
    elSac.innerHTML = cases.join('');

    /* ---- LES POTIONS ----
       Deux places qui s'empilent, sous le sac. On les BOIT en tapant dessus,
       et seulement dans le monde : ailleurs la potion serait consommee sans
       rien soigner, et le serveur refuse — autant griser le bouton plutot
       que de laisser le joueur decouvrir le refus. */
    if (elPotions) {
      elPotions.innerHTML = (POTIONS_C || []).map(function (p) {
        var vide = !p.quantite;
        return '<button type="button" data-pot="' + ech(p.cle) + '"' +
          (vide || SCENE !== 'monde' ? ' disabled' : '') +
          ' title="' + ech(p.nom + ' — restores ' + p.soigne + ' ' +
            (p.quoi === 'hp' ? 'HP' : 'MP') +
            (SCENE === 'monde' ? '' : ' (only out in the wild)')) + '">' +
          '<img alt="" src="img/nexus/objets/' + encodeURIComponent(p.image) +
          '.webp" onerror="this.remove()"><b>' + p.quantite + '</b></button>';
      }).join('');
      Array.prototype.forEach.call(elPotions.querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          boitPotion(b.getAttribute('data-pot'));
        });
      });
    }

    /* Le panneau vient d'etre reconstruit : le voile de recharge du fruit est
       neuf et vide. On lui redonne son etat, sinon un fruit en pleine
       recharge repasserait en couleur a chaque changement de niveau. */
    majFruit();
    peintPotionsTactiles();
    peintGens();
  }

  /** Les joueurs a portee, en bas du panneau. Le nombre ne suffit pas : on
      veut savoir QUI est la, c'est tout l'interet d'un lieu de rencontre. */
  /* ---- LES BALISES DU MONDE, DANS LE PANNEAU ----
   *
   * Elles ne se montrent QUE dans le monde de combat, et seulement une fois
   * allumees. Une liste de balises eteintes serait une liste de boutons morts
   * — et un joueur qui apprend qu'un bouton ne fait rien cesse de le regarder
   * le jour ou il se met a marcher.
   *
   * Le nom dit l'ANNEAU et pas le numero : « Snow » se retient, « salle 2 »
   * ne veut rien dire tant qu'on ne l'a pas deja visitee.
   */
  var NOM_ANNEAU = { terre: 'Dirt', marais: 'Swamp', neige: 'Snow',
                     cendres: 'Ashes', lave: 'Lava',
                     donjon: 'Forge', cave: 'Pirate Cave' };
  /*
   * ==================== LA TABLE DE BLACKJACK ====================
   *
   * Le jeu existe DEJA tout entier cote serveur : `bj_bet`, `bj_hit`,
   * `bj_stand`, `bj_double`, `bj_insure`, sur la meme socket et le meme solde
   * que le reste. Il n'y avait donc rien a ecrire de ce cote-la — seulement
   * une porte. Ce panneau ne decide de rien : il envoie les cinq messages et
   * peint l'etat que le serveur renvoie.
   *
   * Les CARTES viennent de la meme planche que la table du casino. Un
   * deuxieme jeu de dessins aurait donne deux valets de pique differents dans
   * le meme jeu, selon la porte par laquelle on est entre.
   */
  var elBjVoile = document.getElementById('nxBjVoile');
  var elBjCorps = elBjVoile ? elBjVoile.querySelector('.nxbj-corps') : null;
  var bjOuvert = false, BJ = null, bjMise = 10, bjErreur = '';

  /* rang 0=A, 1..8 = 2..9, 9=10, 10=J, 11=Q, 12=K — et quatre enseignes. La
     table est celle de swoge_blackjack.html, recopiee ici parce que c'est de
     la DONNEE (des noms de fichiers), pas une regle : la dupliquer ne peut
     pas faire diverger deux comportements, seulement deux listes d'images. */
  var BJ_ART = [
    ['img/d28b37ae6758.png','img/ff0e0ec96647.png','img/a816746fc318.png','img/f761e7e9413e.png'],
    ['img/20d5e6379842.png','img/9ed6934f72fb.png','img/62533678a787.png','img/380e1bc76fad.png'],
    ['img/bfa372441c27.png','img/baa362c891f0.png','img/f116d07a3911.png','img/98cb838a4200.png'],
    ['img/5441341f1628.png','img/2992ecd67b6f.png','img/ffe2e67f5f6c.png','img/8839015a9d5a.png'],
    ['img/6505c0f01954.png','img/3d469c1a86b1.png','img/b9eb7be1a115.png','img/24f4405415bf.png'],
    ['img/7cfa6a04f532.png','img/17c6cbecef93.png','img/feb7a5f8eac0.png','img/215c4bfd0870.png'],
    ['img/54139cd4e34b.png','img/0d70498b3b5a.png','img/a1efb84d3eb8.png','img/26beb5783892.png'],
    ['img/ca526f505e6c.png','img/07e33c92abcc.png','img/e537d11fe1c9.png','img/17bac737803f.png'],
    ['img/ae32cf8d933b.png','img/676e81ca20e7.png','img/7a26228ebbf2.png','img/c58b8560477f.png'],
    ['img/167b09be5c1c.png','img/68b3b5a6c138.png','img/ad1149eda680.png','img/1c33fb3cefd2.png'],
    ['img/0190e01c43f6.png','img/c3b722b56ad8.png','img/3aa89cf46679.png','img/5035c7637dd5.png'],
    ['img/4fbca9fbe650.png','img/16de477601ef.png','img/2d404029b6b9.png','img/f9de1e9b75a1.png'],
    ['img/aba02d7cff4d.png','img/1df00603b61f.png','img/8e26bdfec10e.png','img/49a50eaa20a1.png'],
  ];

  /* ---- LA DONNE SE VOIT ARRIVER ----
   *
   * Le panneau repeignait la main entiere a chaque message : deux cartes
   * apparaissaient d'un bloc, et l'on ne pouvait pas dire si le serveur venait
   * de distribuer ou si l'ecran s'etait simplement rafraichi. Le probleme
   * n'etait pas l'absence de joliesse, c'etait l'absence d'EVENEMENT.
   *
   * On garde donc les cartes DEJA vues, par main. Celles qui n'y sont pas
   * volent depuis le sabot, decalees de 130 ms, avec leur bruit. Le reste ne
   * bouge pas : une carte posee qui redecolle a chaque rafraichissement serait
   * pire que pas d'animation du tout.
   *
   * La comparaison se fait sur le PREFIXE. Une main qui commence par les memes
   * cartes est la meme main qu'on prolonge ; une main qui differe des le debut
   * est une nouvelle donne, et tout y est neuf — y compris quand elle tombe
   * par hasard sur les memes valeurs. */
  var BJ_VU_D = [], BJ_VU_J = [], BJ_VU_DOS = false, BJ_VU_FINI = false;
  var BJ_SONS = [];
  var BJ_SIG = null;
  var BJ_PAS = 130;                                  // ms entre deux cartes

  function bjNeufDepuis(avant, apres) {
    var i = 0;
    while (i < avant.length && i < apres.length && avant[i] === apres[i]) i++;
    /* Le prefixe casse : ce n'est plus la meme main, tout est neuf. */
    return i === avant.length ? avant.length : 0;
  }

  /* Trois prises pour le meme geste, tirees au hasard — meme raison que les
     deux cris de mort : quatre cartes distribuees avec exactement le meme
     bruit sonnent comme une machine, pas comme un croupier. */
  var A_CHARGER_BJ = {
    bjCarte1:   'img/nexus/bj/carte1.wav',
    bjCarte2:   'img/nexus/bj/carte2.wav',
    bjCarte3:   'img/nexus/bj/carte3.wav',
    bjRetourne: 'img/nexus/bj/retourne.wav',
    bjJeton:    'img/nexus/bj/jeton.wav',
  };
  function sonBj(nom, delai) {
    /* Le decalage doit valoir pour le SON comme pour l'image : un bruit de
       carte qui part avant que la carte ne se pose s'entend comme un bug. */
    BJ_SONS.push(setTimeout(function () {
      joueSample(nom, { vol: 0.6, hauteur: 0.96 + Math.random() * 0.08 });
    }, delai || 0));
  }
  function sonCarte(delai) {
    sonBj('bjCarte' + (1 + Math.floor(Math.random() * 3)), delai);
  }
  function bjTaisToi() {
    BJ_SONS.forEach(clearTimeout);
    BJ_SONS = [];
  }

  function bjCarte(c, delai) {
    var n = Number(c) || 0;
    var rang = ((n % 13) + 13) % 13;
    var ens = Math.floor((((n % 52) + 52) % 52) / 13);
    var jeu = BJ_ART[rang] || BJ_ART[0];
    return '<div class="nxbj-c' + (delai == null ? '' : ' neuf') + '"' +
           (delai ? ' style="animation-delay:' + delai + 'ms"' : '') +
           '><img alt="" src="' + (jeu[ens] || jeu[0]) +
           '" onerror="this.remove()"></div>';
  }
  function bjDos(delai) {
    return '<div class="nxbj-c dos' + (delai == null ? '' : ' neuf') + '"' +
           (delai ? ' style="animation-delay:' + delai + 'ms"' : '') + '></div>';
  }

  function ouvreBj() {
    if (!elBjVoile) return;
    bjOuvert = true;
    bjErreur = '';
    /* Les bruits de la table ne sont charges qu'ICI. Les mettre avec le reste
       ferait telecharger cinquante kilo-octets de cartes a tous ceux qui ne
       s'assoient jamais. */
    debloqueSon();
    chargeSamples(A_CHARGER_BJ);
    BJ_SIG = null;                                   // la carte a pu changer pendant qu'on etait ailleurs
    peintBj();
    elBjVoile.classList.add('on');
  }
  function fermeBj(parLaMain) {
    bjOuvert = false;
    bjTaisToi();
    if (parLaMain) marqueFerme('casino');
    if (elBjVoile) elBjVoile.classList.remove('on');
  }
  if (elBjVoile) {
    elBjVoile.addEventListener('click', function (e) {
      var c = e.target.classList;
      if (e.target === elBjVoile || (c && c.contains('nxcf-x'))) fermeBj(true);
    });
  }

  /* La banniere peinte, pour les resultats qui en ont une. */
  var BJ_BANNIERE = { win: 'ban-win', blackjack: 'ban-blackjack',
                      bust: 'ban-bust', push: 'ban-push' };

  function peintBj() {
    if (!elBjCorps) return;
    var st = BJ;
    /* Celui de l'etat s'il y en a un — il est plus frais que tout le reste,
       puisqu'il vient de la main qu'on vient de jouer. Sinon celui du
       panneau, qui arrive avec la connexion. */
    var solde = (st && st.balance != null) ? Number(st.balance) : SOLDE_NUM;
    var enMain = st && st.stage && st.stage !== 'done';

    /* ---- ON NE REPEINT QUE SI QUELQUE CHOSE A CHANGE ----
     * Sans ce garde-fou, le message de solde qui suit la donne reconstruisait
     * le HTML une centaine de millisecondes apres elle : les cartes en plein
     * vol retombaient d'un coup a leur place, et l'animation ne se voyait
     * qu'une fois sur deux, au hasard du reseau. */
    var sig = [st ? st.stage : '-', st ? st.player.cards.join(',') : '',
               st ? st.dealer.cards.join(',') : '', st ? (st.dealer.hidden ? 'h' : '') : '',
               st ? st.result : '', st ? st.payout : '', st ? st.canDouble : '',
               st ? st.insuranceMax : '', Math.floor(solde), bjMise, bjErreur].join('|');
    if (sig === BJ_SIG) return;
    BJ_SIG = sig;

    var html = '';
    if (bjErreur) {
      html += '<div class="nxcf-refus">' + ech(bjErreur) + '</div>';
    }

    if (st) {
      var dc = st.dealer.cards, jc = st.player.cards;
      /* Trois cas, et le premier est le plus important : LE TAPIS N'A PAS
         CHANGE. Il arrive a chaque fois qu'on touche un jeton apres une main
         finie — et sans ce cas, la main deja jouee redecollerait a chaque
         clic. */
      var identique = BJ_VU_J.join() === jc.join() && BJ_VU_D.join() === dc.join()
                      && BJ_VU_DOS === !!st.dealer.hidden;
      var dNeuf, jNeuf, dosNeuf;
      if (identique) { dNeuf = dc.length; jNeuf = jc.length; dosNeuf = false; }
      else if (BJ_VU_FINI) {
        /* La main d'avant etait FINIE : ce qu'on voit est forcement une
           nouvelle donne, meme si elle commence par les memes cartes. Le
           prefixe se tromperait exactement ce jour-la. */
        dNeuf = 0; jNeuf = 0; dosNeuf = !!st.dealer.hidden;
      } else {
        dNeuf = bjNeufDepuis(BJ_VU_D, dc);
        jNeuf = bjNeufDepuis(BJ_VU_J, jc);
        /* Le dos ne vole que la premiere fois qu'il se montre : il reste
           ensuite en place jusqu'a ce que la vraie carte le remplace. */
        dosNeuf = st.dealer.hidden && (!BJ_VU_DOS || dNeuf === 0);
      }
      /* Le premier decouvert du croupier n'est pas une carte donnee, c'est une
         carte RETOURNEE — et ca ne fait pas le meme bruit. */
      var retourne = !identique && BJ_VU_DOS && !st.dealer.hidden && dNeuf < dc.length;

      /* L'ordre du tapis : joueur, croupier, joueur, croupier. On le
         reconstitue meme si le serveur, lui, ne nous envoie que l'etat final —
         c'est l'ordre que le joueur reconnait. */
      var dTot = (dc.length - dNeuf) + (dosNeuf ? 1 : 0);
      var jTot = jc.length - jNeuf;
      var rang = 0, delaiD = [], delaiJ = [];
      for (var k = 0; k < Math.max(dTot, jTot); k++) {
        if (k < jTot) delaiJ[k] = (rang++) * BJ_PAS;
        if (k < dTot) delaiD[k] = (rang++) * BJ_PAS;
      }

      bjTaisToi();
      html += '<div class="nxbj-tapis">';
      html += '<div class="nxbj-main"><i>Dealer <b>' +
        (st.dealer.hidden ? '?' : st.dealer.value) + '</b></i>' +
        '<div class="nxbj-cartes">' +
        dc.map(function (c, k) {
          if (k < dNeuf) return bjCarte(c, null);
          var d = delaiD[k - dNeuf];
          if (retourne && k === dNeuf) sonBj('bjRetourne', d); else sonCarte(d);
          return bjCarte(c, d);
        }).join('') +
        /* La carte cachee se DESSINE : sans elle, le croupier a une seule
           carte a l'ecran et l'on croit la donne incomplete. */
        (st.dealer.hidden ? bjDos(dosNeuf ? delaiD[dc.length - dNeuf] : null) : '') +
        '</div></div>';
      html += '<div class="nxbj-main"><i>You <b>' + st.player.value + '</b>' +
        (st.doubled ? ' &middot; doubled' : '') + '</i>' +
        '<div class="nxbj-cartes">' +
        jc.map(function (c, k) {
          if (k < jNeuf) return bjCarte(c, null);
          var d = delaiJ[k - jNeuf];
          sonCarte(d);
          return bjCarte(c, d);
        }).join('') + '</div></div>';
      html += '</div>';

      BJ_VU_D = dc.slice();
      BJ_VU_J = jc.slice();
      BJ_VU_DOS = !!st.dealer.hidden;
      BJ_VU_FINI = st.stage === 'done';
    } else {
      BJ_VU_D = []; BJ_VU_J = []; BJ_VU_DOS = false; BJ_VU_FINI = false;
    }

    if (enMain) {
      if (st.stage === 'insurance') {
        html += '<div class="nxbj-act">' +
          '<button type="button" data-bj="ins">Insure ' + st.insuranceMax + '</button>' +
          '<button type="button" class="gris" data-bj="noins">No insurance</button></div>';
      } else {
        html += '<div class="nxbj-act">' +
          '<button type="button" class="plaque" data-bj="hit">Hit</button>' +
          '<button type="button" class="plaque" data-bj="stand">Stand</button>' +
          /* ---- DOUBLER RESTE A L'ECRAN, MEME QUAND ON NE PEUT PAS ----
           * Il disparaissait des la deuxieme carte tiree — ce qui est la
           * regle — mais un bouton qui S'EN VA se lit « le jeu me l'a
           * retire », pas « pas maintenant ». Grise, la plaque garde sa
           * place et l'on apprend QUAND on peut doubler au lieu de se
           * demander ou elle est passee. */
          '<button type="button" class="plaque" data-bj="double"' +
          (st.canDouble ? '' : ' disabled') + '>Double</button>' +
          '</div>';
      }
    } else {
      /* ---- LE RESULTAT, AVANT LA MISE SUIVANTE ----
       * Il doit rester a l'ecran pendant qu'on remise : le remplacer par le
       * formulaire ferait disparaitre « tu as gagne 40 » au moment ou l'on
       * regarde son solde changer. */
      if (st && st.result) {
        var gagne = st.payout > (st.doubled ? st.bet * 2 : st.bet);
        var nul = st.payout === (st.doubled ? st.bet * 2 : st.bet);
        var ban = BJ_BANNIERE[st.result];
        /* Quand la banniere DIT le resultat, le mot en dessous ne fait que le
           repeter. On ne garde alors que ce que le dessin ne peut pas dire :
           combien on a recupere. */
        var txt = ban ? (st.payout ? '+' + st.payout + ' $SWOGE' : '')
          : ech(String(st.result).replace(/_/g, ' ').toUpperCase()) +
            (st.payout ? ' &middot; +' + st.payout + ' $SWOGE' : '');
        html += '<div class="nxbj-res ' + (nul ? 'nul' : gagne ? 'gagne' : 'perdu') +
          (ban ? ' ban ' + ban : '') + (ban && !txt ? ' vide' : '') +
          '" data-res="' + ech(st.result) + '">' + txt + '</div>';
      }
      /* Les jetons AJOUTENT — on pose un jeton sur le tapis, on ne remplace
         pas sa mise par lui. C'est le geste de la table, et il permet 130
         sans passer par le clavier. */
      html += '<div class="nxbj-mise">' +
        '<input id="nxBjMise" type="number" min="1" step="1" value="' + bjMise + '">' +
        '<button type="button" class="efface" data-mise="0">Clear</button>' +
        '</div>' +
        '<div class="nxbj-jetons">' +
        [10, 100, 1000].map(function (v) {
          return '<button type="button" class="nxbj-jeton" data-mise="' + v + '">+' + v + '</button>';
        }).join('') +
        '<button type="button" class="nxbj-jeton" data-mise="max">Max</button>' +
        '</div>' +
        '<div class="nxbj-act"><button type="button" class="plaque" data-bj="deal">Deal</button></div>';
    }
    html += '<div class="nxbj-solde">Balance <b>' + Math.floor(solde) + '</b> $SWOGE</div>';
    elBjCorps.innerHTML = html;

    var champ = document.getElementById('nxBjMise');
    if (champ) {
      champ.addEventListener('change', function () {
        bjMise = Math.max(1, Math.floor(Number(champ.value) || 1));
        champ.value = bjMise;
        BJ_SIG = null;
      });
    }
    Array.prototype.forEach.call(elBjCorps.querySelectorAll('[data-mise]'), function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-mise');
        if (v === 'max') bjMise = Math.max(1, Math.floor(solde));
        else if (v === '0') bjMise = 1;
        else bjMise = Math.max(1, bjMise + Number(v));
        joueSample('bjJeton', { vol: 0.5, hauteur: 0.95 + Math.random() * 0.1 }) || clic(false);
        peintBj();
      });
    });
    Array.prototype.forEach.call(elBjCorps.querySelectorAll('[data-bj]'), function (b) {
      b.addEventListener('click', function () {
        var q = b.getAttribute('data-bj');
        clic(true);
        bjErreur = '';
        if (q === 'deal') { envoie({ type: 'bj_bet', amount: bjMise }); return; }
        if (q === 'hit') { envoie({ type: 'bj_hit' }); return; }
        if (q === 'stand') { envoie({ type: 'bj_stand' }); return; }
        if (q === 'double') { envoie({ type: 'bj_double' }); return; }
        if (q === 'ins') { envoie({ type: 'bj_insure', amount: BJ ? BJ.insuranceMax : 0 }); return; }
        if (q === 'noins') { envoie({ type: 'bj_insure', amount: 0 }); return; }
      });
    });
  }

  function peintBalises() {
    if (!elBalises) return;
    var l = (SCENE === 'monde' && !DONJON_C)
      ? BALISES_C.filter(function (b) { return b.on; }) : [];
    if (!l.length) {
      elBalises.innerHTML = '';
      elBalises.classList.remove('on');
      return;
    }
    elBalises.classList.add('on');
    elBalises.innerHTML = '<i class="nxp-bt">&#128205; Beacons</i>' +
      l.map(function (b) {
        var nom = NOM_ANNEAU[biomeEn(b.x, b.y)] || 'Beacon';
        /* La distance dit s'il vaut la peine d'y sauter. Sans elle, on clique
           pour decouvrir qu'on etait deja a cote. */
        var d = Math.round(Math.hypot(b.x - joueur.x, b.y - joueur.y));
        return '<button type="button" class="nxp-bal" data-bal="' + b.i +
          '" title="Travel to the ' + ech(nom) + ' beacon">' +
          ech(nom) + ' <u>' + (d > 999 ? (d / 1000).toFixed(1) + 'k' : d) + '</u></button>';
      }).join('');
    Array.prototype.forEach.call(elBalises.querySelectorAll('[data-bal]'), function (b) {
      b.addEventListener('click', function () {
        clic(true);
        envoie({ type: 'realmBalise', i: Number(b.getAttribute('data-bal')) });
      });
    });
  }

  function peintGens() {
    if (!elGens) return;
    /* ---- LA LISTE SUIT LE MONDE OU L'ON EST ----
     * Elle ne lisait que le Nexus : dans le monde de combat elle affichait
     * « Nobody else around » avec cinq personnes a l'ecran. Deux registres
     * pour deux simulations, et c'est le MEME registre qui dessine — donc la
     * liste ne peut pas mentir sur qui est la. */
    var dansLeMonde = SCENE === 'monde';
    var src = dansLeMonde ? DISTANTS_M : DISTANTS;
    var l = Object.keys(src).map(function (a) {
      var d = src[a];
      return { addr: d.addr || a, nom: d.nom, skin: d.skin, ami: !!d.ami };
    });
    if (!l.length) {
      elGens.innerHTML = '<i class="nxp-seul">Nobody else around.</i>';
      return;
    }
    /* Les amis en tete : c'est eux qu'on cherche dans la liste, et c'est sur
       eux qu'il y a quelque chose a faire. */
    l.sort(function (a, b) { return (b.ami ? 1 : 0) - (a.ami ? 1 : 0); });
    elGens.innerHTML = l.slice(0, 12).map(function (d) {
      /* ---- LE BOUTON N'EXISTE QUE LA OU LE SAUT EST POSSIBLE ----
       * Pas d'ami, pas de bouton ; pas dans le monde de combat, pas de bouton.
       * Un bouton grise qu'on ne peut jamais presser dans le Nexus
       * apprendrait a ne plus le regarder le jour ou il sert. */
      var saut = dansLeMonde && d.ami;
      return '<div class="nxp-g' + (d.ami ? ' ami' : '') +
        '" title="' + ech(d.nom || d.addr) + (d.ami ? ' — teammate' : '') + '">' +
        '<img alt="" src="img/skins/skin_' + encodeURIComponent(d.skin) + '.webp" ' +
        'onerror="this.style.visibility=\'hidden\'">' +
        '<span>' + ech(d.nom || court(d.addr)) + '</span>' +
        (saut ? '<button type="button" class="nxp-tp" data-tp="' + ech(d.addr) +
                '" title="Teleport to ' + ech(d.nom || court(d.addr)) +
                '">&#10132;</button>' : '') +
        '</div>';
    }).join('');
    Array.prototype.forEach.call(elGens.querySelectorAll('[data-tp]'), function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        clic(true);
        envoie({ type: 'realmRejoint', addr: b.getAttribute('data-tp') });
      });
    });
  }

  // ------------------------------------------------------- les personnages
  //
  // Cinq sont stockes en bande — vingt-cinq images de 256px cote a cote sur
  // une seule ligne. OG Swoge depasse la largeur maximale d'un WebP une fois
  // mis bout a bout (16384px pour 16383 autorises) et reste donc en grille
  // huit par huit. Les deux formes se lisent avec la meme formule, seul le
  // nombre de colonnes change.

  var PERSONNAGES = {
    andy: { disposition: 'bande', images: 25 },
    claude: { disposition: 'bande', images: 25 },
    brett: { disposition: 'bande', images: 25 },
    landwolf: { disposition: 'bande', images: 25 },
    pepe: { disposition: 'bande', images: 25 },
    ogswoge: { disposition: 'grille', images: 64, colonnes: 8 },
  };
  var CADRE = 256;
  var ANIMS = ['idle', 'run', 'jump'];
  var DIRS = ['up', 'down', 'left', 'right'];

  var PERSO = 'andy';              // notre skin, avant meme la reponse du serveur
  /* Un cache par personnage, pas un seul jeu d'images pour « le » personnage
     affiche : le Nexus montre potentiellement les six a la fois, le notre et
     ceux des joueurs croises. `assureCharge` demarre le chargement au premier
     besoin et le rend telle quelle ensuite — jamais deux fois pour le meme. */
  var SPRITES = {};                // { cle: { images: {anim_dir: Image}, pret: bool } }
  function assureCharge(cle) {
    var s = SPRITES[cle];
    if (s) return s;
    s = SPRITES[cle] = { images: {}, pret: false };
    var restant = ANIMS.length * DIRS.length, echoue = false;
    ANIMS.forEach(function (a) {
      DIRS.forEach(function (d) {
        var img = new Image();
        img.onload = function () {
          restant--;
          /* Toutes les DOUZE a la fois, pas une par une : sinon un
             personnage a moitie charge se dessinerait avec un pied idle et
             un pied qui court, le temps que le reste arrive. */
          if (restant === 0 && !echoue) s.pret = true;
        };
        img.onerror = function () { echoue = true; };
        img.src = 'img/nexus/' + cle + '/' + a + '_' + d + '.webp';
        s.images[a + '_' + d] = img;
      });
    });
    return s;
  }
  assureCharge(PERSO);

  function rectangleCadre(cle, indice) {
    var c = PERSONNAGES[cle];
    if (c.disposition === 'grille') {
      var col = indice % c.colonnes, rangee = Math.floor(indice / c.colonnes);
      return { sx: col * CADRE, sy: rangee * CADRE };
    }
    return { sx: indice * CADRE, sy: 0 };
  }

  // ------------------------------------------------------- le decor

  var TUILE = 128;
  var CARTE = { cols: 20, rows: 15 };            // 2560 x 1920
  var MONDE = { w: CARTE.cols * TUILE, h: CARTE.rows * TUILE };
  var CENTRE = { x: MONDE.w / 2, y: MONDE.h / 2 - 32 };

  var TUILES = { herbe: new Image(), chemin: new Image(), ferme: new Image() };
  TUILES.herbe.src = 'img/nexus/tiles/ground_grass.webp';
  TUILES.chemin.src = 'img/nexus/tiles/ground_path.webp';
  /* La terre battue de l'enclos. Un troisieme sol, et pas un chemin teinte :
     c'est ce qui dit ou l'enclos COMMENCE, avant meme qu'on voie la barriere. */
  TUILES.ferme.src = 'img/nexus/tiles/ground_ferme.webp';

  /* Chaque lieu : son image, sa taille affichee, son point d'ancrage (les
     pieds, pas le centre — c'est ce qui permet de le trier avec le joueur),
     et — sauf la fontaine, purement decorative — la destination qu'on
     rejoint en marchant dessus. */
  var LIEUX = [
    { cle: 'fontaine', src: 'img/nexus/tiles/obj_fountain_plaza.webp',
      x: CENTRE.x, y: CENTRE.y, larg: 340, haut: 355, collision: 108 },
    /* ---- DEUX PORTES AU NORD, ET C'EST UN CHOIX ----
     *
     * La porte violette etait seule au bout du chemin : on marchait dedans
     * sans rien decider. A deux, le meme geste devient une decision — et la
     * decision se prend AVANT d'entrer, pas une fois qu'on s'est fait tuer.
     *
     * Elles sont volontairement JUMELLES : meme arche, meme socle, meme
     * angle. Seule la couleur change. Deux dessins differents auraient donne
     * deux decors ; deux dessins identiques a la teinte pres donnent une
     * paire, et une paire se lit comme une question.
     *
     * Ecartees de 420 unites — deux fois le rayon d'entree, plus la marge :
     * on ne peut pas etre dans les deux a la fois, et l'on ne franchit pas
     * l'une en visant l'autre. */
    { cle: 'portail', src: 'img/nexus/tiles/obj_portal.webp',
      x: CENTRE.x - 210, y: CENTRE.y - 500, larg: 210, haut: 324,
      rayon: 110, href: 'games.html', nom: 'the wild', monde: 'ouvert' },
    { cle: 'portailPvp', src: 'img/nexus/tiles/obj_portal_pvp.webp',
      x: CENTRE.x + 210, y: CENTRE.y - 500, larg: 210, haut: 324,
      rayon: 110, nom: 'the Crimson Reach', monde: 'crimson' },
    { cle: 'etal', src: 'img/nexus/tiles/obj_market_stall.webp',
      x: CENTRE.x - 620, y: CENTRE.y, larg: 260, haut: 244,
      /* Ouvre sur les coffres, mais la meme feuille porte l'onglet
         « Character skins » juste a cote dans sa barre — le nom dit les
         deux, pour qu'on sache que l'un mene aussi a l'autre. */
      rayon: 120, href: 'games.html?open=sh', nom: 'the shop' },
    { cle: 'coffre', src: 'img/nexus/tiles/obj_vault_door.webp',
      x: CENTRE.x + 620, y: CENTRE.y, larg: 260, haut: 251,
      rayon: 120, href: 'games.html?open=ap', nom: 'your vault' },
    /* ---- LA TABLE DE BLACKJACK, AU SUD ----
     *
     * Les trois autres destinations partent au nord, a l'ouest et a l'est. Le
     * sud etait vide — et c'est precisement la qu'on APPARAIT en arrivant. On
     * se levait donc au milieu d'un carre d'herbe.
     *
     * Elle ouvre son panneau sur place, comme l'etal : le blackjack existe
     * deja tout entier cote serveur, sur la MEME socket et le MEME solde. Il
     * n'y avait rien a ecrire de ce cote-la — seulement une porte. */
    /* ---- PETWORLD, AU SUD-EST ----
     * La ferme n'ouvre encore rien : `bientot` le DIT au lieu de laisser le
     * joueur marcher dedans et se demander pourquoi rien ne se passe. Un lieu
     * muet se lit comme un lieu casse.
     * L'enclos dessine n'est pas praticable : une seule image occupe l'espace
     * AU-DESSUS de son point d'ancrage, et quiconque s'y tiendrait serait
     * recouvert par elle. Marcher dedans demandera une cloture en pieces, pas
     * une cloture peinte. */
    /* La grange se pose SUR le bord haut de l'enclos : c'est le fond de la
       cour, et la barriere passe derriere elle. */
    { cle: 'petworld', src: 'img/nexus/tiles/obj_grange.webp',
      x: CENTRE.x + 832, y: CENTRE.y + 352, larg: 420, haut: 334,
      rayon: 150, nom: 'Petworld', bientot: 1 },
    { cle: 'petworldEnseigne', src: 'img/nexus/tiles/obj_petworld_sign.webp',
      x: CENTRE.x + 400, y: CENTRE.y + 700, larg: 140, haut: 209 },
    { cle: 'casino', src: 'img/nexus/tiles/obj_bj_table.webp',
      x: CENTRE.x, y: CENTRE.y + 470, larg: 300, haut: 251,
      rayon: 120, nom: 'the blackjack table' },
    /* L'enseigne est du DECOR : pas de rayon, donc rien a ouvrir. Elle sert a
       voir de loin qu'il y a quelque chose la-bas — c'est ce qui manquait le
       plus a cette carte, de quoi viser. */
    { cle: 'enseigne', src: 'img/nexus/tiles/obj_bj_enseigne.webp',
      x: CENTRE.x - 230, y: CENTRE.y + 400, larg: 120, haut: 193 },
  ];
  LIEUX.forEach(function (l) { l.img = new Image(); l.img.src = l.src; l.dwell = 0; });
  /* ---- ON DESIGNE UN LIEU PAR SON NOM, PAS PAR SA PLACE ----
   * Quatre endroits lisaient `LIEUX[0]` et `LIEUX[1]` — la fontaine et le
   * portail. Ajouter la porte rouge au milieu de la liste aurait suffi a
   * faire renaitre les morts sur une enseigne, et rien ne l'aurait dit :
   * l'indice existe toujours, il designe simplement autre chose. */
  function lieu(cle) {
    for (var i = 0; i < LIEUX.length; i++) if (LIEUX[i].cle === cle) return LIEUX[i];
    return null;
  }
  var FONTAINE = lieu('fontaine'), PORTAIL_L = lieu('portail');

  /* ---- LE BASSIN DE LA FONTAINE ----
     Un CERCLE de rayon 108 centre sur le point d'ancrage ne collait pas au
     dessin : la fontaine est large et basse, et son bassin est pose SUR
     l'ancre, donc au-dessus d'elle. Le cercle laissait passer par les cotes —
     la ou la pierre est — et bloquait sous le bassin, la ou il n'y a rien.
     Une ellipse mesuree sur le dessin colle. Les tirs s'en servent aussi :
     un pas et un projectile doivent buter sur la MEME pierre. */
  var COL_FONT = { rx: 152, ry: 70, dy: 62 };

  /* ================== LA VIE, ET LE REPLI ==================
   *
   * `VIE.pv` est la SEULE source de verite sur les points de vie : la barre
   * du panneau la lit, le repli automatique la lit. Rien ne fait encore de
   * degats, donc elle vaut toujours le plafond — mais le jour ou un donjon
   * en fera, il n'y aura qu'un endroit a baisser et les deux suivront
   * ensemble. C'est la difference entre une place « prete » et une place
   * REELLE.
   *
   * Le plafond change quand on s'equipe : on garde alors la PROPORTION de
   * vie, pas le nombre. Enfiler un plastron qui donne +170 PV ne doit pas
   * soigner, et en retirer un ne doit pas tuer. */
  var VIE = { pv: 0, max: 0, mp: 0, mpMax: 0 };
  function poseVieMax(hp, mp) {
    hp = hp | 0; mp = mp | 0;
    if (VIE.max <= 0) { VIE.pv = hp; VIE.mp = mp; }
    else {
      if (hp !== VIE.max) VIE.pv = Math.max(1, Math.round(VIE.pv * hp / VIE.max));
      if (mp !== VIE.mpMax && VIE.mpMax > 0) VIE.mp = Math.round(VIE.mp * mp / VIE.mpMax);
    }
    VIE.max = hp; VIE.mpMax = mp;
    VIE.pv = Math.min(VIE.pv, VIE.max);
    VIE.mp = Math.min(VIE.mp, VIE.mpMax);
  }
  function partVie() { return VIE.max > 0 ? VIE.pv / VIE.max : 1; }

  /* ---- LE REPLI VERS LE NEXUS ----
   *
   * Une touche (E par defaut, reassignable) et un seuil automatique en
   * pourcentage de vie. Le seuil ne PROTEGE PAS : entre l'instant ou les
   * points de vie passent sous la barre et celui ou le repli s'execute, il
   * s'ecoule au moins une image — et un coup qui enleve tout d'un seul
   * tenant ne laisse aucune image. C'est vrai dans le jeu d'origine, et ce
   * serait malhonnete de le cacher derriere un reglage qui a l'air d'une
   * assurance. Le texte du panneau le dit.
   *
   * `franchi` retient qu'on est DEJA passe sous la barre : sans lui, le
   * repli se redeclencherait a chaque image tant que la vie reste basse. */
  var REPLI = { actif: false, seuil: 35, franchi: false };
  var CLE_REPLI = 'swogeNexusRepli';
  try {
    var brut = JSON.parse(localStorage.getItem(CLE_REPLI) || 'null');
    if (brut && typeof brut === 'object') {
      REPLI.actif = !!brut.actif;
      REPLI.seuil = Math.max(5, Math.min(95, Number(brut.seuil) || 35));
    }
  } catch (e) {}
  function sauveRepli() {
    try { localStorage.setItem(CLE_REPLI, JSON.stringify({ actif: REPLI.actif, seuil: REPLI.seuil })); } catch (e) {}
  }

  /** Rentrer au Nexus, d'ou qu'on soit. Rend `true` si on a bouge. */
  function retourNexus(raison) {
    if (SCENE === 'coffre') { sortCoffre(); return true; }
    if (SCENE === 'monde') { quitteMonde(); return true; }
    /* Depuis le Nexus lui-meme il n'y a nulle part d'ou revenir. Ce n'est
       pas un echec : c'est la seule reponse juste tant que le monde de
       combat n'existe pas. */
    return false;
  }

  function verifieRepli() {
    if (!REPLI.actif) { REPLI.franchi = false; return; }
    var pct = partVie() * 100;
    if (pct > REPLI.seuil + 1) { REPLI.franchi = false; return; }
    if (REPLI.franchi) return;
    REPLI.franchi = true;
    retourNexus('vie');
  }

  /* ================== L'INTERIEUR DU COFFRE ==================
   *
   * Le coffre etait une PORTE qui renvoyait sur games.html. C'est une salle
   * maintenant : on y entre, on y marche, et on voit poses au sol tous les
   * objets achetes a la boutique. C'est la difference entre une liste et un
   * lieu — et le coffre est justement l'endroit ou l'on va « voir ses
   * affaires », pas consulter un tableau.
   *
   * Les bornes sont mesurees sur le dessin, pas devinees : le dallage
   * jouable occupe la fraction .185-.825 en largeur et .20-.84 en hauteur de
   * l'image, le reste etant mur, etageres et tonneaux. La porte est sur le
   * mur GAUCHE, a mi-hauteur : c'est par la qu'on ressort, comme on est
   * entre.
   *
   * Rien de ce qui est ici ne se joue sur le serveur : le coffre est deja
   * calcule et envoye (message `equipable`), la salle ne fait que le
   * MONTRER. Un joueur qui triche sur sa position n'y gagne donc rien. */
  var SALLE = {
    img: null, src: 'img/nexus/tiles/room_vault.webp',
    w: 1600, h: 1600,
    // la zone ou l'on pose les pieds, en unites de monde
    x0: 1600 * 0.185, x1: 1600 * 0.825,
    y0: 1600 * 0.200, y1: 1600 * 0.840,
    /* ---- LE PORTAIL DE RETOUR ----
     * Sortir se faisait en repassant par la porte du mur gauche. Deux
     * problemes : on APPARAISSAIT dessus — on entrait et on ressortait dans
     * la seconde — et une porte de decor ne se lit pas comme une sortie. Un
     * portail, si : c'est deja par un portail qu'on quitte le Nexus. */
    /* Devant la porte du mur gauche, et LARGE : un cercle de soixante unites
       dans une piece qui en fait mille six cents se rate en marchant. On le
       pose assez pres du mur pour qu'en longeant celui-ci on tombe dedans —
       c'est le geste naturel de quelqu'un qui cherche la sortie. */
    portail: { x: 1600 * 0.225, y: 1600 * 0.470, r: 104, larg: 104, haut: 160 },
    /* Les cinq coffres du mur du bas, releves sur le dessin. UN SEUL est
       ouvrable — celui du milieu, le plus facile a trouver. Les quatre autres
       restent du decor, en attendant qu'on leur donne chacun son role.
       Les faire tous ouvrir le meme menu etait plus simple, mais mentait :
       cinq poignees pour une seule porte laissent croire a cinq rangements
       differents, et le jour ou ils en auront vraiment, le joueur aura pris
       l'habitude qu'ils soient interchangeables. */
    /* DEUX coffres ouvrables sur les cinq du dessin, et ils ne font pas la
       meme chose : celui du milieu porte les objets, celui de gauche les
       personnages. Les trois autres restent du decor en attendant leur role.
       Un coffre par usage plutot qu'un menu a onglets : on va au coffre des
       personnages pour changer de personnage, et le chemin dit deja ce qu'on
       vient faire. */
    /* Trois coffres, aux trois dessins du milieu de la piece. La planche en
       montre cinq : celui de gauche et celui de droite restent decoratifs, et
       c'est tres bien — une salle ou tout est cliquable n'a plus de decor. */
    coffres: [
      { x: 1600 * 0.500, y: 1600 * 0.842, r: 74, role: 'objets' },
      { x: 1600 * 0.375, y: 1600 * 0.842, r: 70, role: 'skins' },
      /* LES FIOLES. Ce qu'on y range survit a la mort du personnage — c'est la
         seule chose dans ce jeu, avec le coffre aux pieces, qui y survive. */
      { x: 1600 * 0.617, y: 1600 * 0.842, r: 70, role: 'fioles' },
    ],
  };
  SALLE.img = new Image(); SALLE.img.src = SALLE.src;

  /* Ou l'on se tenait dans le Nexus avant d'entrer : on ressort exactement
     la, sinon on reapparait au centre de la carte sans savoir pourquoi. */
  var SCENE = 'nexus';
  var RETOUR = null;
  var COFFRE = null;        // les quatre listes du message `equipable`
  var FIOLES_C = [];        // les fioles de stat : ce qu'on a au coffre et au sac
  var coffreOuvert = false;   // le menu du coffre, au centre de l'ecran
  var coffreFerme = null;     // le coffre qu'on vient de refermer a la main
  var coffreErreur = '';      // le refus du serveur, s'il y en a un

  function scene() {
    if (SCENE === 'coffre') return SALLE;
    if (SCENE === 'monde' && MONDE_C) return MONDE_C.monde;
    return { w: MONDE.w, h: MONDE.h };
  }

  /* ================== LE MONDE DE COMBAT, COTE CLIENT ==================
   *
   * Le serveur simule tout : les monstres, les degats, les morts, l'XP. Ce
   * qui suit ne fait que DESSINER ce qu'il annonce, et lui renvoyer deux
   * choses — ou l'on est, et dans quelle direction on tire.
   *
   * Consequence directe : rien ici ne doit « decider ». Un monstre a les
   * points de vie que le serveur lui donne, pas ceux qu'on a compte en
   * regardant nos propres tirs. Si les deux divergent, c'est le serveur qui
   * a raison, toujours.
   *
   * Les positions arrivent DIX fois par seconde. A soixante images, un
   * monstre poserait donc six fois le pied au meme endroit puis sauterait.
   * On garde une position AFFICHEE qui glisse vers la derniere recue —
   * exactement ce que fait deja le Nexus pour les autres joueurs.
   */
  var MONDE_C = null;
  /* Les pierres tombales visibles autour de nous. */
  var TOMBES_C = [];          // la description recue a l'entree
  /* Les sacs de butin au sol. Comme les tombes : le serveur les tient, la
     page les dessine, et personne ici ne decide de leur contenu. */
  var SACS_C = [];
  /* Le monde de chaque porte : { ouvert: n, crimson: n }. Vide tant que le
     serveur n'a rien dit — on ne dessine pas « 0 inside » sur une porte dont
     on ignore l'etat, ce serait une information fausse. */
  var PORTES_C = null;
  /* Les blocs du monde. Ils viennent du SERVEUR une fois, a l'entree : la
     page ne peut pas les redeviner — elle n'a pas le meme hasard — et un
     desaccord se verrait tout de suite, on marcherait dans un rocher ou l'on
     serait arrete par du vide. */
  var OBSTACLES_C = [];
  /* Les salles gardees. Leur dalle remplace le sol de l'anneau : c'est ce qui
     les rend visibles de loin, et donc ce qui en fait une destination. */
  var SALLES_C = [];
  /* ---- LES BALISES ----
   * Toutes, pas seulement celles a l'ecran : une balise sert a aller
   * AILLEURS, et n'afficher que celles qu'on voit deja reviendrait a ne
   * proposer de voyager que vers l'endroit ou l'on se tient. */
  var BALISES_C = [];
  var signatureBalises = '';
  /* Les zones marquees au sol, en attente de frapper. */
  var ZONES_C = [];
  var IMG_ANNONCE = null, IMG_ONDE = null;
  /* ---- LE CERCLE DU DONJON EST UN AUTRE CERCLE ----
   * Meme forme, meme nombre d'images, autre metal. Ce n'est pas de la
   * decoration : le cercle qui previent est la seule chose qu'on regarde
   * pendant la seconde et demie ou l'on decide de partir, et un joueur qui a
   * appris a lire celui de la lave doit sentir qu'il n'est plus dans la lave.
   * Deux planches plutot qu'une teinte : une couleur passee par-dessus aurait
   * demande un canevas de plus par image. */
  var IMG_ANNONCE_DJ = null, IMG_ONDE_DJ = null;
  var ANNONCE_CADRES = 4, ONDE_CADRES = 4, ONDE_DUREE = 0.55;
  var IMG_SACS = null, IMG_OBST = null, IMG_MUR = null, IMG_TEMPLE = null;
  var IMG_MUR_DJ = null, IMG_MUR_CAVE = null, IMG_PORTE = null, IMG_BALISE = null;
  /* Le coffre des salles gardees : ferme, entrouvert, ouvert. */
  var IMG_COFFRE = null, COFFRE_CADRES = 3;
  /* Sa hauteur en unites de monde. Un peu moins qu'un personnage : il doit se
     voir de la porte — c'est ce qu'on vient chercher — sans couvrir la piece
     ni cacher les gardiens qui tournent autour. */
  var COFFRE_H = 120;
  /* Le temps que met le couvercle a s'ouvrir. Court : c'est une recompense,
     pas une ceremonie — le sac tombe deja au meme instant. */
  var COFFRE_OUVERTURE = 0.45;
  /* Le sac SUR LEQUEL on se tient, et la signature de ce qu'il contient : on
     ne repeint la grille que quand l'une des deux change, sinon on
     reconstruirait huit cases dix fois par seconde sous le doigt de qui est
     en train d'en toucher une. */
  var SAC_PIEDS = null, SAC_SIGNE = '';
  /* Les portes ouvertes autour de nous, et celle sous nos pieds. Une liste a
     part des sacs, comme cote serveur : un sac se RAMASSE, une porte se
     FRANCHIT, et les melanger aurait demande a chaque ligne qui touche aux sacs
     de se souvenir d'ecarter celle-la. */
  var PORTAILS_C = [];
  var PORTAIL_PIEDS = null, PORTAIL_SIGNE = '';
  /* Le nom du donjon ou l'on se trouve, ou null dehors. Et la forme de son sol,
     tuile par tuile. */
  var DONJON_C = null, TUILES_D = null;
  /* ---- LES PORTES QU'ON NE VOIT PAS ENCORE ----
   * L'etat du monde ne porte que ce qui est a moins de 1400 unites. Une porte
   * qui s'ouvre a l'autre bout de la carte n'y est donc PAS — et c'est bien la
   * seule qu'on ait besoin qu'on nous montre : celle qu'on a sous les pieds,
   * on la voit.
   * Le serveur annonce l'ouverture a tout le monde ; on garde la position et
   * l'on dessine une fleche au bord de l'ecran tant que la porte vit. C'est ce
   * qui fait la difference entre « un donjon existe quelque part » et « c'est
   * par la, il reste deux minutes ». */
  var PORTAILS_LOIN = [];
  var MONSTRES_C = {};         // id -> etat interpole
  var TIRS_C = [];             // nos projectiles, tels que le serveur les voit
  var TIRS_M = [];             // ceux des monstres, contre nous
  var DISTANTS_M = {};         // les autres joueurs du monde
  var signatureGensM = '';     // la composition de la liste, pour ne repeindre qu'utile
  var TUILES_M = {};           // les sols des anneaux, charges a l'entree
  var moiMonde = { pv: 0, pvMax: 1, xp: 0 };

  /* Les sols des anneaux. Charges A L'ENTREE et pas au demarrage : un joueur
     qui ne met jamais les pieds dans le monde n'a pas a telecharger cinq
     textures de six cents kilos.

     LA REGLE DE LA CARTE : on lit le danger AU SOL. Chaque anneau a son
     propre dessin, et un anneau qui ressemblerait a son voisin serait un
     piege — c'est pour ca qu'en ajouter demandait d'abord des textures. */
  var FICHIER_SOL = { terre: 'ground_dirt', marais: 'ground_marais',
                      neige: 'ground_snow', cendres: 'ground_cendres',
                      lave: 'ground_lava',
                      /* Le donjon n'est pas un anneau de plus : c'est un monde
                         a lui, qui n'envoie qu'UN anneau couvrant tout.
                         `biomeEn` rend donc 'donjon' partout, et cette ligne
                         suffit — pas un deuxieme mode de dessin a apprendre a
                         la page. */
                      donjon: 'ground_donjon',
                      /* La cave des pirates a son bois et son fer. Un donjon
                         de plus, c'est une LIGNE de plus ici — pas un mode de
                         dessin de plus : le serveur nomme le sol dans son
                         anneau unique, et la page le lit comme les autres. */
                      cave: 'ground_cave' };
  function chargeSols() {
    Object.keys(FICHIER_SOL).forEach(function (b) {
      if (TUILES_M[b]) return;
      var i = new Image();
      i.src = 'img/nexus/tiles/' + FICHIER_SOL[b] + '.webp';
      TUILES_M[b] = i;
    });
  }
  var ATLAS_M = {};
  /* Le dessin d'une espece. Le nom du fichier n'est PAS toujours celui de
     l'espece : une creature dont l'image n'existe pas encore emprunte celle
     d'une autre, et c'est le serveur qui le dit (`sprite`, dans la table des
     especes). Le jour ou l'image arrive, on la depose et on retire une ligne
     de donnee cote serveur — aucun code ne change ici. */
  /* ================== LA PIERRE ET LE SOIN ==================
   *
   * Deux images que tu m'avais envoyees et que je n'avais jamais branchees.
   * Elles sont chargees a la demande, comme le reste : une page qui ne met
   * jamais les pieds dans le monde n'a pas a les telecharger.
   */
  var IMG_TOMBE = null, IMG_SOIN = null, IMG_RAFALE = null, IMG_STASE = null;
  var IMG_COUP = null, IMG_NIVEAU = null, IMG_PARA = null;
  var NIVEAU_CADRES = 5, NIVEAU_DUREE = 1.3, PARA_CADRES = 4;
  var COUP_CADRES = 9, COUP_DUREE = 0.26;
  /* ---- L'ECLAT QUAND ON TOUCHE ----
   * Tirer sur un monstre est le geste le plus frequent du jeu, et il ne
   * produisait RIEN a l'ecran : un son, et c'est tout. On voyait le
   * projectile disparaitre, sans savoir s'il avait porte ou s'il etait
   * arrive au bout de sa portee.
   *
   * L'anneau blanc s'ouvre au point exact du contact — que le serveur envoie
   * maintenant avec le coup — et il dure un quart de seconde : assez pour
   * etre vu, assez peu pour qu'une cadence de quatre tirs par seconde ne
   * transforme pas l'ecran en bouillie. */
  var COUPS = [];
  function poseCoup(x, y) {
    chargeEffets();
    COUPS.push({ x: x, y: y, vie: COUP_DUREE });
    /* Une borne, parce qu'un arc mythique a la rafale peut poser dix eclats
       par seconde et qu'aucun d'eux ne merite de survivre aux autres. */
    if (COUPS.length > 40) COUPS.shift();
  }
  function peintCoups(dt) {
    if (!COUPS.length) return;
    var pret = IMG_COUP && IMG_COUP.complete && IMG_COUP.naturalWidth;
    var cw = pret ? IMG_COUP.naturalWidth / COUP_CADRES : 0;
    var ch = pret ? IMG_COUP.naturalHeight : 0;
    for (var i = COUPS.length - 1; i >= 0; i--) {
      var e = COUPS[i];
      e.vie -= dt;
      if (e.vie <= 0) { COUPS.splice(i, 1); continue; }
      if (!pret) continue;
      var c = Math.min(COUP_CADRES - 1,
                       Math.floor((1 - e.vie / COUP_DUREE) * COUP_CADRES));
      var T = 46;
      ctx.save();
      /* Il PALIT en s'ouvrant : l'anneau le plus large est aussi le plus
         tenu, ce qui evite qu'une volee de tirs laisse neuf disques blancs
         pleins par-dessus le monstre qu'on essaie de viser. */
      ctx.globalAlpha = Math.max(0.15, e.vie / COUP_DUREE);
      ctx.drawImage(IMG_COUP, c * cw, 0, cw, ch, e.x - T / 2, e.y - T / 2, T, T);
      ctx.restore();
    }
  }
  var SOIN_CADRES = 6, SOIN_DUREE = 1.1;
  var RAFALE_CADRES = 4, STASE_CADRES = 3;
  function chargeEffets() {
    if (!IMG_TOMBE) { IMG_TOMBE = new Image(); IMG_TOMBE.src = 'img/nexus/effets/tombe.webp'; }
    if (!IMG_SOIN) { IMG_SOIN = new Image(); IMG_SOIN.src = 'img/nexus/effets/soin.webp'; }
    if (!IMG_RAFALE) { IMG_RAFALE = new Image(); IMG_RAFALE.src = 'img/nexus/effets/rafale.webp'; }
    if (!IMG_STASE) { IMG_STASE = new Image(); IMG_STASE.src = 'img/nexus/effets/stase.webp'; }
    if (!IMG_COUP) { IMG_COUP = new Image(); IMG_COUP.src = 'img/nexus/tirs/coup.webp'; }
    if (!IMG_NIVEAU) { IMG_NIVEAU = new Image(); IMG_NIVEAU.src = 'img/nexus/effets/niveau.webp'; }
    if (!IMG_PARA) { IMG_PARA = new Image(); IMG_PARA.src = 'img/nexus/effets/paralysie.webp'; }
    chargeSacs();
    if (!IMG_OBST) { IMG_OBST = new Image(); IMG_OBST.src = 'img/nexus/tiles/obstacles.webp'; }
    if (!IMG_MUR) { IMG_MUR = new Image(); IMG_MUR.src = 'img/nexus/tiles/mur_ruine.webp'; }
    if (!IMG_MUR_DJ) { IMG_MUR_DJ = new Image(); IMG_MUR_DJ.src = 'img/nexus/tiles/mur_donjon.webp'; }
    if (!IMG_MUR_CAVE) { IMG_MUR_CAVE = new Image(); IMG_MUR_CAVE.src = 'img/nexus/tiles/mur_cave.webp'; }
    if (!IMG_BALISE) { IMG_BALISE = new Image(); IMG_BALISE.src = 'img/nexus/tiles/obj_balise.webp'; }
    if (!IMG_PORTE) { IMG_PORTE = new Image(); IMG_PORTE.src = 'img/nexus/tiles/obj_portail.webp'; }
    if (!IMG_TEMPLE) { IMG_TEMPLE = new Image(); IMG_TEMPLE.src = 'img/nexus/tiles/ground_temple.webp'; }
    if (!IMG_COFFRE) { IMG_COFFRE = new Image(); IMG_COFFRE.src = 'img/nexus/tiles/obj_coffre_garde.webp'; }
    if (!IMG_ANNONCE) { IMG_ANNONCE = new Image(); IMG_ANNONCE.src = 'img/nexus/effets/annonce.webp'; }
    if (!IMG_ONDE) { IMG_ONDE = new Image(); IMG_ONDE.src = 'img/nexus/effets/onde.webp'; }
    if (!IMG_ANNONCE_DJ) { IMG_ANNONCE_DJ = new Image(); IMG_ANNONCE_DJ.src = 'img/nexus/effets/annonce_donjon.webp'; }
    if (!IMG_ONDE_DJ) { IMG_ONDE_DJ = new Image(); IMG_ONDE_DJ.src = 'img/nexus/effets/onde_donjon.webp'; }
  }

  /* ---- L'AURA DE RAFALE ----
   * La rafale etait le seul des trois pouvoirs sans aucun signe a l'ecran :
   * on tirait plus vite pendant quatre secondes et rien ne disait pourquoi ni
   * jusqu'a quand. L'aura tourne autour du personnage tant qu'elle dure.
   *
   * Elle est dessinee SOUS lui et non par-dessus : quatre secondes de
   * tourbillon dore devant le visage cacheraient justement ce qu'on regarde
   * pendant qu'on tire.
   *
   * Elle PALIT dans la derniere demi-seconde. Sans ca, la rafale s'arreterait
   * net et on ne saurait jamais qu'elle allait finir.
   */
  var RAFALE_TOUR = 0;
  function peintRafale(dt) {
    if (!(POUVOIR_ETAT.rafale > 0)) return;
    if (!IMG_RAFALE || !IMG_RAFALE.complete || !IMG_RAFALE.naturalWidth) return;
    RAFALE_TOUR += dt;
    var cw = IMG_RAFALE.naturalWidth / RAFALE_CADRES;
    var ch = IMG_RAFALE.naturalHeight;
    var c = Math.floor(RAFALE_TOUR * 14) % RAFALE_CADRES;
    var T = 104;
    ctx.save();
    ctx.globalAlpha = Math.min(1, POUVOIR_ETAT.rafale / 0.5) * 0.85;
    /* Ecrasee en hauteur : l'aura est vue du DESSUS, comme le sol. Un disque
       parfait se lirait comme une bulle posee a la verticale. */
    ctx.drawImage(IMG_RAFALE, c * cw, 0, cw, ch,
                  joueur.x - T / 2, joueur.y - T * 0.34, T, T * 0.62);
    ctx.restore();
  }

  /* Les soins en cours. Chacun est ancre a un POINT du monde et n'y bouge
     plus : l'effet jaillit du sol, il ne suit pas celui qui s'en va. */
  var SOINS = [];
  function poseSoin(x, y) {
    chargeEffets();
    SOINS.push({ x: x, y: y, vie: SOIN_DUREE });
  }

  /* ---- LA MONTEE DE NIVEAU ----
   * Elle avait un son et un mot flottant, et rien la ou l'on regarde. Les
   * anneaux d'or montent des pieds : c'est le seul moment du jeu ou quelque
   * chose de BON arrive au milieu d'un combat, et il merite d'etre vu sans
   * avoir a lire. */
  var NIVEAUX = [];
  function poseNiveau(x, y) {
    chargeEffets();
    NIVEAUX.push({ x: x, y: y, vie: NIVEAU_DUREE });
  }
  function peintNiveaux(dt) {
    if (!NIVEAUX.length) return;
    var pret = IMG_NIVEAU && IMG_NIVEAU.complete && IMG_NIVEAU.naturalWidth;
    var cw = pret ? IMG_NIVEAU.naturalWidth / NIVEAU_CADRES : 0;
    var ch = pret ? IMG_NIVEAU.naturalHeight : 0;
    for (var i = NIVEAUX.length - 1; i >= 0; i--) {
      var e = NIVEAUX[i];
      e.vie -= dt;
      if (e.vie <= 0) { NIVEAUX.splice(i, 1); continue; }
      if (!pret) continue;
      var c = Math.min(NIVEAU_CADRES - 1,
                       Math.floor((1 - e.vie / NIVEAU_DUREE) * NIVEAU_CADRES));
      var T = 132;
      ctx.drawImage(IMG_NIVEAU, c * cw, 0, cw, ch, e.x - T / 2, e.y - T + 16, T, T);
    }
  }

  /** Les six images de la spirale, dans l'ordre, sur toute la duree. Elles
      sont calees a la MEME hauteur qu'a l'origine : les trois dernieres
      decollent du sol, et les recaler en bas collerait l'effet a terre
      pendant qu'il s'envole. La case fait donc 96 x 192 et on la pose
      entiere, ancree aux pieds. */
  function peintSoins(dt) {
    if (!SOINS.length) return;
    var pret = IMG_SOIN && IMG_SOIN.complete && IMG_SOIN.naturalWidth;
    var cw = pret ? IMG_SOIN.naturalWidth / SOIN_CADRES : 0;
    var ch = pret ? IMG_SOIN.naturalHeight : 0;
    for (var i = SOINS.length - 1; i >= 0; i--) {
      var e = SOINS[i];
      e.vie -= dt;
      if (e.vie <= 0) { SOINS.splice(i, 1); continue; }
      if (!pret) continue;
      var avance = 1 - e.vie / SOIN_DUREE;
      var c = Math.min(SOIN_CADRES - 1, Math.floor(avance * SOIN_CADRES));
      /* Deux tiers de la taille d'origine : a l'echelle un, la spirale fait
         deux fois la hauteur du personnage et on ne voit plus que ca. */
      var L = cw * 0.66, H = ch * 0.66;
      ctx.drawImage(IMG_SOIN, c * cw, 0, cw, ch,
                    e.x - L / 2, e.y - H + 10, L, H);
    }
  }

  /** Une pierre tombale, posee au sol. Le nom au-dessus : « quelqu'un est
      mort ici » ne vaut rien, « Dodexel est mort ici » fait reculer.
      Elle palit dans ses dernieres secondes plutot que de disparaitre d'un
      coup — sinon on croit a un defaut d'affichage. */
  /* ---- UN SAC AU SOL ----
   *
   * Six couleurs, dans l'ordre exact de la planche : le serveur envoie le NOM
   * du sac, pas son numero de colonne. Traduire ici plutot que la-bas garde la
   * regle du butin lisible cote serveur (« bleu » veut dire quelque chose,
   * « 1 » ne veut rien dire) et l'ordre du dessin lisible ici.
   *
   * Il CLIGNOTE sur ses dix dernieres secondes. Sans ca, un sac qu'on avait
   * repere disparait sans prevenir pendant qu'on finit un combat, et le joueur
   * conclut que le jeu le lui a repris. */
  var COLONNE_SAC = { brun: 0, bleu: 1, violet: 2, or: 3, rouge: 4, blanc: 5 };
  var SAC_FIN = 10;           // secondes de clignotement avant la fin
  /* ---- LA MEME REGLE QUE LE SERVEUR, MOT POUR MOT ----
   *
   * Le serveur BORNE, il ne deplace pas : c'est la page qui fait avancer le
   * personnage. Une page qui laisserait marcher dans la pierre verrait donc
   * son joueur ramene en arriere par a-coups — ce qui se lit comme un defaut
   * de reseau, pas comme un rocher.
   *
   * Le rayon (22) et le glissement sur les deux axes sont ceux de realm.js.
   * Deux regles differentes des deux cotes donneraient exactement le
   * tremblement qu'on cherche a eviter.
   */
  var RAYON_MOI = 22;
  function blocEn(x, y, rayon) {
    for (var i = 0; i < OBSTACLES_C.length; i++) {
      var o = OBSTACLES_C[i];
      var dx = o.x - x, dy = o.y - y, d = o.r + rayon;
      if (dx * dx + dy * dy < d * d) return o;
    }
    return null;
  }
  function glisse(deX, deY, x, y) {
    /* Etre dedans n'est pas une prison — meme regle que le serveur, sinon la
       page refuserait un pas que le serveur accepte. */
    if (blocEn(deX, deY, RAYON_MOI)) return { x: x, y: y };
    if (!blocEn(x, y, RAYON_MOI)) return { x: x, y: y };
    if (!blocEn(x, deY, RAYON_MOI)) return { x: x, y: deY };
    if (!blocEn(deX, y, RAYON_MOI)) return { x: deX, y: y };
    return { x: deX, y: deY };
  }

  /* Un bloc au sol. Le pied porte l'ombre : sans elle un rocher flotte, et on
     ne sait pas ou commence ce qu'on ne peut pas traverser. */
  /* Le mur d'une salle et le rocher du dehors sont le MEME genre de bloc : ils
     arretent la meme chose, se trient pareil, se ramassent dans la meme
     liste. Seule la planche change, et c'est `t` qui la designe — au-dela de
     MUR_BASE on lit le mur. Deux listes separees auraient donne deux
     collisions a tenir d'accord. */
  var MUR_BASE = 4;
  /* Et un cran plus loin, le mur de donjon. Meme raisonnement pousse d'un
     rang : une seule liste de blocs, une seule collision, un seul tri de
     dessin, trois planches. Deux listes separees auraient donne deux
     collisions a tenir d'accord. */
  var MUR_DONJON = 8;
  /* Le temps que met une porte a s'ouvrir en grand. Court : c'est un
     dechirement, pas une animation d'attente — et pendant ce temps-la elle est
     plus etroite qu'elle ne le sera, donc moins visible. */
  var PORTE_OUVERTURE = 0.7;
  /* ---- OU S'ARRETE VRAIMENT LE DESSIN D'UN BLOC ----
   *
   * Les rochers avaient l'air POSES SUR le sol plutot que dedans : un
   * croissant d'ombre restait visible sous eux. La faute n'etait pas dans
   * l'ombre, elle etait dans l'idee que le dessin remplit sa case. Il ne la
   * remplit pas, et pas du meme montant selon la piece : le rocher moussu
   * laisse quinze pixels de vide sous lui, l'eclat de glace deux. En calant
   * la CASE, on calait donc quatre pieces a quatre hauteurs differentes — la
   * premiere flottait de treize pixels, la troisieme touchait.
   *
   * On mesure la planche une fois et on cale le BAS REEL de chaque piece.
   * Rien n'est ecrit en dur : le jour ou l'on redessine les rochers, ils se
   * reposent tout seuls. */
  var BAS_PLANCHES = {};
  /* Ou tombe ce bas, par rapport au centre de collision. L'ombre s'arrete a
     0,40 rayon ; on va juste au-dela, pour qu'AUCUN croissant d'ombre ne
     reste sous la pierre. C'est ce croissant, et lui seul, qui se lit comme
     « ca flotte ». */
  var BLOC_ASSISE = 0.50;
  function basDesBlocs(img, cle) {
    if (BAS_PLANCHES[cle]) return BAS_PLANCHES[cle];
    var cadre = img.naturalHeight, n = Math.max(1, Math.round(img.naturalWidth / cadre));
    var bas = [];
    try {
      var cv = document.createElement('canvas');
      cv.width = cadre; cv.height = cadre;
      var c2 = cv.getContext('2d', { willReadFrequently: true });
      for (var k = 0; k < n; k++) {
        c2.clearRect(0, 0, cadre, cadre);
        c2.drawImage(img, k * cadre, 0, cadre, cadre, 0, 0, cadre, cadre);
        var d = c2.getImageData(0, 0, cadre, cadre).data, b = 0;
        for (var y = 0; y < cadre; y++) {
          for (var x = 0; x < cadre; x++) {
            /* Le seuil compte : un halo a alpha 1 sous le dessin ferait
               mesurer la case entiere, c'est-a-dire ne rien mesurer. */
            if (d[(y * cadre + x) * 4 + 3] >= 40) { b = y; break; }
          }
        }
        bas.push((b + 1) / cadre);
      }
    } catch (e) {
      /* Canevas souille : on retombe sur « le dessin remplit sa case ». C'est
         ce qu'on faisait avant, en moins bien — mais ca reste dessine. */
      for (var j = 0; j < n; j++) bas.push(1);
    }
    BAS_PLANCHES[cle] = bas;
    return bas;
  }

  function dessineObstacle(o) {
    var t = o.t || 0;
    /* Les bornes viennent du SERVEUR quand il les envoie : deux nombres tenus
       d'accord de part et d'autre du reseau finissent par ne plus l'etre, et le
       desaccord serait muet — le donjon se dessinerait avec la pierre des
       salles gardees. Les constantes ci-dessus ne servent plus qu'a un vieux
       message d'entree qui ne les porterait pas. */
    var mb = (MONDE_C && MONDE_C.murs && MONDE_C.murs.base) || MUR_BASE;
    var md = (MONDE_C && MONDE_C.murs && MONDE_C.murs.donjon) || MUR_DONJON;
    var mur = t >= mb;
    /* Le rang le plus HAUT d'abord : ecrit dans l'autre sens, un bloc de donjon
       (8) serait passe par la branche du mur de ruine (>= 4) et se serait
       dessine avec sa planche — le donjon aurait ressemble a une salle gardee,
       et rien n'aurait plante pour le dire. */
    /* Quel mur de donjon : le serveur le NOMME avec le plan. Le deduire du
       nom du donjon ici aurait demande a la page de tenir une deuxieme table
       en face de celle du serveur, et le troisieme donjon aurait eu ses murs
       dans une des deux seulement. */
    var murDJ = (MONDE_C && MONDE_C.mur === 'cave') ? IMG_MUR_CAVE : IMG_MUR_DJ;
    var img = t >= md ? murDJ : (mur ? IMG_MUR : IMG_OBST);
    if (!img || !img.complete || !img.naturalWidth) return;
    var cadre = img.naturalHeight;
    var col = t >= md ? (t - md) : (mur ? (t - mb) : t);
    /* Un mur remplit sa tuile, un rocher deborde un peu : le premier doit
       JOINDRE son voisin, le second doit avoir l'air pose. */
    var T = mur ? o.r * 2 : o.r * 2.7;
    if (!mur) {
      ctx.save();
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(o.x, o.y, o.r * 0.95, o.r * 0.40, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    /* ---- LE QUART DE TOUR ----
     * La planche ne porte qu'UNE orientation de chaque piece. Poser le meme
     * angle aux quatre coins en laisse trois a l'envers, et le mur se lit
     * alors comme un decor colle plutot que comme une piece batie. Le serveur
     * dit combien de quarts de tour ; on ne les redevine pas ici. */
    if (mur && o.a) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.a * Math.PI / 2);
      ctx.drawImage(img, col * cadre, 0, cadre, cadre, -T / 2, -T / 2, T, T);
      ctx.restore();
      return;
    }
    if (mur) {
      ctx.drawImage(img, col * cadre, 0, cadre, cadre,
                    o.x - T / 2, o.y - T + o.r, T, T);
      return;
    }
    /* Le bas REEL de la piece se pose a `BLOC_ASSISE` rayons sous le centre,
       quelle que soit la hauteur de vide que la planche lui laisse. */
    var bas = basDesBlocs(img, 'obstacles')[col] || 1;
    ctx.drawImage(img, col * cadre, 0, cadre, cadre,
                  o.x - T / 2, o.y + o.r * BLOC_ASSISE - bas * T, T, T);
  }

  /* La dalle d'une salle, posee AVANT tout le reste : c'est un sol, pas un
     objet. Elle deborde volontairement sous les murs — un lisere du sol de
     l'anneau qui depasserait entre la dalle et la pierre se lirait comme un
     defaut d'affichage. */
  /* ---- LE CERCLE QUI PREVIENT ----
   *
   * Il se remplit pendant que le compte a rebours descend, et il frappe quand
   * il est plein. C'est la meme chose vue a deux moments : sans lui, une
   * attaque qui couvre une zone entiere n'est pas difficile, elle est
   * injuste — rien ne l'annonce, on ne peut que la subir.
   *
   * Il est peint AU SOL, sous tout le monde : par-dessus, il cacherait
   * justement ce qu'on doit regarder pour en sortir. */
  /* ---- LE CERCLE PEINT DOIT COUVRIR LA ZONE REELLE ----
   *
   * Le dessin ne remplit pas sa case : le cercle de la premiere image tient
   * dans 90 % du carre, celui de la derniere en deborde de 4 %. Le poser a
   * `2 * rayon` de large peindrait donc, pendant les trois premiers quarts de
   * l'annonce, un cercle PLUS PETIT que la zone qui va frapper.
   *
   * C'est le seul defaut qu'on ne peut pas se permettre ici. Un joueur qui se
   * tient a un cheveu du bord peint se croit dehors ; il prend le coup, et il
   * a raison de trouver ca injuste. Un cercle trop GRAND, lui, ne coute rien :
   * on sort d'un pas de trop.
   *
   * On mesure donc la planche — une fois, au premier dessin — et on garde la
   * plus PETITE des quatre images. Toutes les autres deborderont, et aucune
   * ne mentira. Le chiffre est lu dans le fichier et pas ecrit ici : le jour
   * ou l'on redessine l'annonce, l'echelle suit toute seule. */
  /* Un plein PAR PLANCHE. Il etait garde dans un seul nombre, ce qui allait
     tant qu'il n'y avait qu'un cercle : la deuxieme planche aurait recu la
     mesure de la premiere, et son cercle serait sorti a la mauvaise taille —
     donc aurait promis un rayon que le serveur n'applique pas. */
  var ANNONCE_PLEIN = {};

  /* La planche du cercle, ici ou dans un donjon. On retombe sur celle du monde
     tant que l'autre n'est pas chargee : mieux vaut le mauvais metal qu'aucun
     cercle — un coup de zone qui frappe sans avoir ete annonce n'est pas
     difficile, il est arbitraire. */
  function plancheAnnonce() {
    return (DONJON_C && IMG_ANNONCE_DJ && IMG_ANNONCE_DJ.complete &&
            IMG_ANNONCE_DJ.naturalWidth)
      ? { img: IMG_ANNONCE_DJ, cle: 'donjon' }
      : { img: IMG_ANNONCE, cle: 'monde' };
  }
  function plancheOnde() {
    return (DONJON_C && IMG_ONDE_DJ && IMG_ONDE_DJ.complete && IMG_ONDE_DJ.naturalWidth)
      ? IMG_ONDE_DJ : IMG_ONDE;
  }
  /* Si la mesure est impossible (canvas souille), on prend une valeur assez
     BASSE pour que le cercle peint deborde quoi qu'il arrive. Se tromper vers
     le grand fait sortir trop tot ; se tromper vers le petit tue. */
  var ANNONCE_PLEIN_SECOURS = 0.85;
  function pleinDeLAnnonce(planche, cle) {
    var img = planche || IMG_ANNONCE;
    cle = cle || 'monde';
    if (!img || !img.naturalWidth) return ANNONCE_PLEIN_SECOURS;
    if (ANNONCE_PLEIN[cle]) return ANNONCE_PLEIN[cle];
    var cw = img.naturalWidth / ANNONCE_CADRES, ch = img.naturalHeight;
    var demi = Math.min(cw, ch) / 2, mini = 0;
    try {
      var cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      var c2 = cv.getContext('2d', { willReadFrequently: true });
      for (var k = 0; k < ANNONCE_CADRES; k++) {
        c2.clearRect(0, 0, cw, ch);
        c2.drawImage(img, k * cw, 0, cw, ch, 0, 0, cw, ch);
        var d = c2.getImageData(0, 0, cw, ch).data, loin = 0;
        for (var y = 0; y < ch; y++) {
          for (var x = 0; x < cw; x++) {
            /* Le seuil compte : un halo a alpha 1 autour du dessin ferait
               mesurer la case entiere au lieu du cercle. */
            if (d[(y * cw + x) * 4 + 3] < 40) continue;
            var dx = x + 0.5 - cw / 2, dy = y + 0.5 - ch / 2;
            var r = Math.sqrt(dx * dx + dy * dy);
            if (r > loin) loin = r;
          }
        }
        if (loin > 0 && (!mini || loin < mini)) mini = loin;
      }
    } catch (e) { mini = 0; }
    ANNONCE_PLEIN[cle] = mini > 0 ? mini / demi : ANNONCE_PLEIN_SECOURS;
    return ANNONCE_PLEIN[cle];
  }

  function dessineZones() {
    if (!ZONES_C.length) return;
    var pl = plancheAnnonce();
    var img = pl.img;
    if (!img || !img.complete || !img.naturalWidth) return;
    var cw = img.naturalWidth / ANNONCE_CADRES, ch = img.naturalHeight;
    var plein = pleinDeLAnnonce(img, pl.cle);
    for (var i = 0; i < ZONES_C.length; i++) {
      var z = ZONES_C[i];
      var av = z.d ? Math.max(0, Math.min(1, 1 - z.t / z.d)) : 1;
      var c = Math.min(ANNONCE_CADRES - 1, Math.floor(av * ANNONCE_CADRES));
      var T = (z.r * 2) / plein;
      ctx.drawImage(img, c * cw, 0, cw, ch, z.x - T / 2, z.y - T / 2, T, T);
    }
  }

  /* Ce qui reste quand la zone a frappe. L'onde n'a que quatre images : la
     cinquieme, un anneau blanc qui s'efface, etait du blanc translucide sur
     un damier blanc et n'a pas survecu au detourage. On fait donc le fondu
     ici — c'est le meme resultat, et ca ne pretend pas avoir une image qu'on
     n'a plus. */
  var ONDES = [];
  function peintOndes(dt) {
    if (!ONDES.length) return;
    var img = plancheOnde();
    var pret = img && img.complete && img.naturalWidth;
    var cw = pret ? img.naturalWidth / ONDE_CADRES : 0;
    var ch = pret ? img.naturalHeight : 0;
    for (var i = ONDES.length - 1; i >= 0; i--) {
      var o = ONDES[i];
      o.vie -= dt;
      if (o.vie <= 0) { ONDES.splice(i, 1); continue; }
      if (!pret) continue;
      var av = 1 - o.vie / ONDE_DUREE;
      var c = Math.min(ONDE_CADRES - 1, Math.floor(av * ONDE_CADRES));
      var T = o.r * 2.1;
      ctx.save();
      /* Le dernier quart s'efface : c'est la cinquieme image, faite en alpha. */
      ctx.globalAlpha = av > 0.75 ? Math.max(0, (1 - av) * 4) : 1;
      ctx.drawImage(img, c * cw, 0, cw, ch, o.x - T / 2, o.y - T / 2, T, T);
      ctx.restore();
    }
  }

  function dessineSalles() {
    if (!SALLES_C.length) return;
    if (!IMG_TEMPLE || !IMG_TEMPLE.complete || !IMG_TEMPLE.naturalWidth) return;
    var t = IMG_TEMPLE.naturalWidth;
    for (var i = 0; i < SALLES_C.length; i++) {
      var s = SALLES_C[i];
      if (Math.abs(s.x - joueur.x) > 2200 || Math.abs(s.y - joueur.y) > 2000) continue;
      var x0 = s.x - s.cote / 2, y0 = s.y - s.cote / 2;
      for (var y = 0; y < s.cote; y += t) {
        for (var x = 0; x < s.cote; x += t) {
          var w = Math.min(t, s.cote - x), h = Math.min(t, s.cote - y);
          ctx.drawImage(IMG_TEMPLE, 0, 0, w, h, x0 + x, y0 + y, w, h);
        }
      }
    }
  }

  /* ---- LE COFFRE D'UNE SALLE GARDEE ----
   *
   * Il est la AVANT le combat, ferme, au milieu de la piece. C'est lui qui
   * fait d'une salle une destination : de la porte, on voit qu'il y a quelque
   * chose a prendre, et on voit de loin qu'une salle a deja ete faite.
   *
   * Il ne bloque rien et il ne se ramasse pas. Ce qu'on prend, c'est le sac
   * qui tombe quand le dernier gardien meurt — le coffre ne fait que dire
   * pourquoi on est entre.
   */
  /* ---- UNE BALISE ALLUMEE SE VOIT DE LOIN ----
   * Sans marque au sol, « cette salle est faite » ne se lit qu'en entrant —
   * et on y entre pour rien. L'anneau dit les deux a la fois : la salle est
   * videe, et on peut revenir ici d'un clic. */
  var BALISE_CADRES = 3, BALISE_H = 150;
  function dessineBalise(b) {
    /* ---- ETEINTE, ELLE SE DESSINE QUAND MEME ----
     * C'est ce qui en fait un REPERE. Une carte de 7680 unites sans rien a
     * viser se traverse au hasard ; une pierre sombre a l'horizon dit « il y a
     * quelque chose la-bas », et une fois allumee elle dit « et tu peux y
     * revenir ». Le meme objet repond aux deux questions, a deux moments — et
     * c'est ce qui manquait le plus a cette carte : de quoi viser. */
    if (!IMG_BALISE || !IMG_BALISE.complete || !IMG_BALISE.naturalWidth) return;
    var cadre = IMG_BALISE.naturalHeight;
    var col = b.on ? BALISE_CADRES - 1 : 0;
    /* L'anneau au sol AVANT la pierre : par-dessus, il la barrerait. Il ne
       sort que si elle est allumee — c'est lui qui dit « on peut revenir
       ici », pas la pierre. La MEME horloge que les autres battements du jeu :
       un compteur par balise aurait demande de le creer a l'allumage et de
       l'effacer a la sortie du monde, donc deux occasions de fuir. */
    if (b.on) {
      var R = 78 + Math.sin(performance.now() / 450) * 6;
      ctx.save();
      ctx.strokeStyle = 'rgba(124,255,155,.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, R, R * 0.46, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(124,255,155,.12)';
      ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(IMG_BALISE, col * cadre, 0, cadre, cadre,
                  b.x - BALISE_H / 2, b.y - BALISE_H + 18, BALISE_H, BALISE_H);
  }

  function dessineCoffre(s) {
    if (!IMG_COFFRE || !IMG_COFFRE.complete || !IMG_COFFRE.naturalWidth) return;
    var cadre = IMG_COFFRE.naturalHeight;
    /* L'ouverture avance avec le temps, pas avec les messages : le serveur dit
       « videe », il ne dit pas « image 2 sur 3 ». Lui demander chaque image
       serait dix messages pour une demi-seconde d'animation. */
    var av = Math.max(0, Math.min(1, (s.ouvre || 0) / COFFRE_OUVERTURE));
    var col = Math.min(COFFRE_CADRES - 1, Math.floor(av * COFFRE_CADRES));
    var T = COFFRE_H;
    /* Ouvert, il fait de la lumiere. C'est ce qui le rend visible a travers la
       piece une fois le combat fini — sinon on cherche le sac au sol. */
    if (av > 0) halo(s.x, s.y - T * 0.30, T * 0.55, '#FFC53D', 0.10 + 0.22 * av);
    /* Comme les rochers : on cale le BAS REEL, pas le bas de la case. Les
       trois images du coffre ne s'arretent pas a la meme ligne — cale sur la
       case, il sauterait de sept pixels en s'ouvrant. */
    var bas = basDesBlocs(IMG_COFFRE, 'coffre')[col] || 1;
    ctx.drawImage(IMG_COFFRE, col * cadre, 0, cadre, cadre,
                  s.x - T / 2, s.y - bas * T, T, T);
  }

  /* ---- LA PLANCHE DES SACS SE CHARGE TOUTE SEULE ----
   *
   * Elle arrivait avec `chargeEffets()`, appele en ENTRANT dans le monde de
   * combat. Le hall dessine pourtant les memes sacs depuis qu'on peut y jeter
   * une piece — et celui qui n'etait pas encore alle se battre n'avait aucune
   * image : le serveur tenait bien le sac, la page le dessinait bien, et le
   * dessin renoncait a la premiere ligne. On voyait le sol vide.
   *
   * Le dessin demande donc lui-meme sa planche. C'est le seul endroit qui
   * sache qu'il en a besoin, et il n'y a plus de troisieme scene a penser a
   * brancher le jour ou l'on posera des sacs ailleurs. */
  function chargeSacs() {
    if (!IMG_SACS) { IMG_SACS = new Image(); IMG_SACS.src = 'img/nexus/objets/sacs.webp'; }
  }
  function dessineSac(s) {
    chargeSacs();
    if (!IMG_SACS.complete || !IMG_SACS.naturalWidth) return;
    var cadre = IMG_SACS.naturalHeight;          // la planche est une rangee
    var col = COLONNE_SAC[s.s] === undefined ? 0 : COLONNE_SAC[s.s];
    var T = 42;
    ctx.save();
    if (s.r < SAC_FIN) {
      /* Deux clignotements par seconde, et jamais jusqu'a l'invisible : un sac
         qu'on ne voit plus par instants est plus dur a viser qu'un sac pale. */
      var bat = 0.45 + 0.55 * Math.abs(Math.cos(performance.now() / 1000 * Math.PI * 2));
      ctx.globalAlpha = Math.max(0.35, bat);
    }
    /* Le halo dit « celui-la vaut quelque chose ». Le brun n'en a pas : c'est
       du consommable, et un halo sur tout ne distingue plus rien. */
    if (s.s !== 'brun') {
      var teinte = { bleu: '#5AA9FF', violet: '#C07BFF', or: '#FFC53D',
                     rouge: '#F2685E', blanc: '#FFFFFF' }[s.s] || '#FFFFFF';
      halo(s.x, s.y + 4, T * 0.62, teinte, s.s === 'blanc' ? 0.34 : 0.22);
    }
    ctx.drawImage(IMG_SACS, col * cadre, 0, cadre, cadre,
                  s.x - T / 2, s.y - T + 10, T, T);
    ctx.restore();
  }

  /* ---- LA PORTE, ET SON TOURNOIEMENT ----
   *
   * Quatre images de cent vingt-huit, comme les effets : on ne code pas ce
   * chiffre, on le mesure sur la planche (`naturalWidth / naturalHeight`). On
   * ne garde PAS de compteur d'image par portail — l'horloge suffit, et un
   * compteur par porte aurait demande de le creer a la naissance et de
   * l'effacer a la fermeture, donc deux occasions de fuir.
   *
   * Une porte de donjon et une porte de retour se dessinent PAREIL, et c'est
   * voulu : ce qui les distingue est ce qui est ecrit sur le bouton, pas leur
   * apparence. Deux dessins auraient demande deux planches, et un joueur qui
   * apprend a reconnaitre « la porte verte » finirait par entrer dans un donjon
   * en croyant en sortir.
   *
   * `dessinePorte`, et pas `dessinePortail` : ce nom-la est DEJA pris par le
   * portail de la salle du coffre, plus haut dans ce fichier. Deux declarations
   * du meme nom dans la meme portee ne se plaignent pas — la derniere gagne, en
   * silence — et la salle du coffre se serait mise a appeler celle-ci sans
   * argument, donc a jeter une exception a chaque image. Le seul symptome
   * aurait ete un ecran de coffre noir.
   */
  /* ---- CE QUE LA PLANCHE OCCUPE VRAIMENT DE SA CASE ----
   *
   * La porte est un OVALE ETROIT dans un carre : sa derniere image tient sur
   * soixante et un pixels de large et cent vingt-trois de haut, dans une case
   * de cent vingt-huit. Caler la CASE sur le rayon du portail donnait donc une
   * porte moitie moins large que le cercle ou l'on entre — on marchait dedans
   * sans avoir l'impression d'y etre.
   *
   * On MESURE, comme pour le cercle d'annonce et pour l'assise des rochers :
   * une fois, sur la derniere image (celle de la porte ouverte), et l'on garde
   * la largeur et le bas du dessin en fraction de la case. Les ecrire a la main
   * aurait fait deux nombres a tenir d'accord avec un dessin qu'on remplacera.
   */
  var PORTE_MESURE = null;
  function mesurePorte() {
    if (PORTE_MESURE) return PORTE_MESURE;
    var repli = { large: 0.48, haute: 0.96, bas: 0.96 };
    if (!IMG_PORTE || !IMG_PORTE.naturalWidth) return repli;
    var c = IMG_PORTE.naturalHeight;
    var n = Math.max(1, Math.round(IMG_PORTE.naturalWidth / c));
    try {
      var cv = document.createElement('canvas');
      cv.width = c; cv.height = c;
      var c2 = cv.getContext('2d', { willReadFrequently: true });
      c2.drawImage(IMG_PORTE, (n - 1) * c, 0, c, c, 0, 0, c, c);
      var d = c2.getImageData(0, 0, c, c).data;
      var x0 = c, x1 = -1, y0 = c, y1 = -1;
      for (var y = 0; y < c; y++) {
        for (var x = 0; x < c; x++) {
          /* Le seuil compte : ces planches descendent a alpha 1 autour du
             dessin, invisible a l'oeil mais assez pour faire mesurer la case
             entiere. C'est la meme lecon que dans le decoupeur. */
          if (d[(y * c + x) * 4 + 3] < 40) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
      if (x1 < x0 || y1 < y0) return repli;
      PORTE_MESURE = { large: (x1 - x0 + 1) / c, haute: (y1 - y0 + 1) / c,
                       bas: (y1 + 1) / c };
    } catch (e) { return repli; }
    return PORTE_MESURE;
  }

  function dessinePorte(p) {
    var teinte = p.rt ? '#7CFF9B' : '#C07BFF';
    var R = (MONDE_C && MONDE_C.portail && MONDE_C.portail.rayon) || 72;
    /* Le halo d'abord, sous elle : c'est ce qui la fait voir de loin, au milieu
       des eclats et des chiffres de degats. Une porte qui s'ouvre a cent
       quatre-vingt-dix unites derriere une creature qu'on regardait mourir se
       rate sans lui. Il a le rayon OU L'ON ENTRE : c'est la seule facon de dire
       « d'ici, ca marche » sans ecrire un chiffre. */
    var bat = 0.82 + 0.18 * Math.sin(performance.now() / 460);
    halo(p.x, p.y + 6, R * bat, teinte, 0.30);
    if (!IMG_PORTE || !IMG_PORTE.complete || !IMG_PORTE.naturalWidth) return;
    var cadre = IMG_PORTE.naturalHeight;
    var n = Math.max(1, Math.round(IMG_PORTE.naturalWidth / cadre));

    /* ---- ELLE S'OUVRE UNE FOIS, ELLE NE CLIGNOTE PAS ----
     *
     * Les quatre images ne sont pas une boucle : c'est une OUVERTURE. Une
     * fente, un ovale etroit, un ovale large, la porte ouverte. Jouees en
     * rond, la porte se refermait en fente toutes les demi-secondes — et la
     * premiere image ne remplit que quatre pour cent de sa case. Elle
     * passait donc les trois quarts du temps invisible, et l'on nous a
     * rapporte exactement ca : « je ne vois pas le portail ».
     *
     * L'AGE se DEDUIT, il ne se garde pas : le serveur envoie le temps
     * restant, la duree totale est arrivee a l'entree, et la difference est
     * l'age. Un compteur par porte aurait demande de le creer a la naissance
     * et de l'effacer a la fermeture — deux occasions de fuir, pour un
     * chiffre qu'on possede deja. */
    var img = n - 1;
    if (p.r !== null && p.r !== undefined) {
      var duree = (MONDE_C && MONDE_C.portail && MONDE_C.portail.duree) || 180;
      var age = duree - p.r;
      if (age < PORTE_OUVERTURE) {
        img = Math.max(0, Math.min(n - 1, Math.floor(age / (PORTE_OUVERTURE / n))));
      }
    }

    /* ---- LA TAILLE SE PREND SUR LE DESSIN, ET PAR SA HAUTEUR ----
     * Sur la case, l'ovale serait moitie moins large que le cercle ou l'on
     * entre — on marcherait dedans sans avoir l'impression d'y etre.
     * Mais sur sa LARGEUR non plus : la planche est un ovale haut et etroit,
     * et l'ajuster en largeur au cercle d'entree le fait monter a plus de
     * trois cents unites — quatre fois la taille du personnage, la moitie de
     * l'ecran. C'est donc la HAUTEUR qui commande, a un peu moins de trois
     * fois le rayon : une porte se lit debout, et celle-la doit se voir de
     * loin sans manger la scene. */
    var m = mesurePorte();
    /* ---- ELLE A MAIGRI, ET ELLE EST ENTREE DANS LE SOL ----
     * A deux fois huit dixiemes du rayon d'entree elle montait a deux cents
     * unites : plus haute que la fontaine, et elle mangeait la creature qu'on
     * combattait devant. Deux fois un dixieme la ramene a la taille d'une
     * porte — assez pour se voir de loin, assez peu pour qu'on voie ce qui
     * arrive derriere.
     * Et le bas s'enfonce : pose a six unites elle avait l'air d'un decor
     * COLLE sur l'herbe. A vingt-deux, sa base disparait dans le sol et l'on
     * croit a un trou, ce qu'un portail est cense etre. */
    var T = (R * 2.1) / Math.max(0.05, m.haute);
    var haut = p.y + 22 - m.bas * T;

    ctx.save();
    /* Elle respire une fois ouverte. Sans ca une porte ouverte est un decor
       colle : c'est le seul mouvement qui dit qu'elle est vivante, et il ne la
       fait jamais disparaitre. */
    if (img === n - 1) {
      var souffle = 1 + 0.035 * Math.sin(performance.now() / 520);
      ctx.translate(p.x, p.y + 22);
      ctx.scale(1, souffle);
      ctx.translate(-p.x, -(p.y + 6));
    }
    /* Elle clignote sur la fin, comme un sac : c'est la seule facon de dire « il
       sera trop tard dans dix secondes » sans ecrire un chiffre par-dessus le
       jeu. Une porte qui ne se referme jamais (`r` nul) ne clignote pas. */
    if (p.r !== null && p.r !== undefined && p.r < 12) {
      var cl = 0.45 + 0.55 * Math.abs(Math.cos(performance.now() / 1000 * Math.PI * 2));
      ctx.globalAlpha = Math.max(0.35, cl);
    }
    ctx.drawImage(IMG_PORTE, img * cadre, 0, cadre, cadre,
                  p.x - T / 2, haut, T, T);
    ctx.restore();
  }

  function dessineTombe(t) {
    if (!IMG_TOMBE || !IMG_TOMBE.complete || !IMG_TOMBE.naturalWidth) return;
    var H = 86, L = H * (IMG_TOMBE.naturalWidth / IMG_TOMBE.naturalHeight);
    ctx.save();
    if (t.r < 6) ctx.globalAlpha = Math.max(0, t.r / 6);
    ctx.drawImage(IMG_TOMBE, t.x - L / 2, t.y - H + 12, L, H);
    if (t.nom) {
      ctx.font = '700 12px Archivo, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(t.nom, t.x, t.y - H + 4);
      ctx.fillStyle = '#C9D3F2';
      ctx.fillText(t.nom, t.x, t.y - H + 4);
      ctx.textAlign = 'start';
    }
    ctx.restore();
  }

  function atlasMonstre(espece) {
    if (ATLAS_M[espece] !== undefined) return ATLAS_M[espece];
    var t = MONDE_C && MONDE_C.especes && MONDE_C.especes[espece];
    var fichier = (t && t.sprite) || espece;
    var i = new Image();
    i.src = 'img/nexus/monstres/' + encodeURIComponent(fichier) + '.webp';
    ATLAS_M[espece] = i;
    return i;
  }

  /** Le biome sous un point. MEME regle que monde.js, avec les rayons que le
      serveur nous a envoyes — on ne recopie pas les nombres, on les recoit. */
  function biomeEn(x, y) {
    if (!MONDE_C) return 'terre';
    var dx = x - MONDE_C.centre.x, dy = y - MONDE_C.centre.y;
    var r = Math.sqrt(dx * dx + dy * dy) / (MONDE_C.monde.w / 2);
    for (var i = 0; i < MONDE_C.anneaux.length; i++) {
      if (r <= MONDE_C.anneaux[i].jusqua) return MONDE_C.anneaux[i].biome;
    }
    /* ---- LE REPLI EST LE DERNIER ANNEAU, PAS « terre » ----
     * Le dernier anneau du monde ouvert EST la terre, donc le repli en dur y
     * disait la verite — par chance. Un donjon n'envoie qu'un anneau, et il ne
     * s'appelle pas terre : le jour ou sa borne arrive mal (un `Infinity`
     * devenu `null` en traversant JSON, par exemple), la page se serait mise a
     * poser le sol du monde ouvert SUR le donjon, avec les tuiles au bon
     * endroit et la mauvaise texture, et rien nulle part pour dire pourquoi.
     * Le dernier anneau est toujours la bonne reponse : c'est celui qui va
     * jusqu'au bord. */
    var dernier = MONDE_C.anneaux[MONDE_C.anneaux.length - 1];
    return (dernier && dernier.biome) || 'terre';
  }

  /* Ce que le serveur voit autour de nous, dix fois par seconde. On ne
     REMPLACE pas nos monstres : on met a jour ceux qu'on connait, on ajoute
     les nouveaux, on retire ceux qui ne sont plus la. Sans ca, chaque
     message repartirait de zero et l'interpolation n'aurait rien a suivre. */
  function recoitMonde(m) {
    var vus = {};
    (m.monstres || []).forEach(function (o) {
      vus[o.i] = 1;
      var e = MONSTRES_C[o.i];
      if (!e) {
        e = MONSTRES_C[o.i] = { espece: o.e, rx: o.x, ry: o.y, cadre: 0, chrono: 0 };
        atlasMonstre(o.e);
      }
      e.x = o.x; e.y = o.y; e.dir = o.d; e.pv = o.pv; e.pvMax = o.pvMax;
      /* La stase, quand le serveur la marque. Sans ce report, cinq secondes
         de monstres immobiles se liraient comme un serveur qui a lache. */
      e.stase = o.st || 0;
    });
    Object.keys(MONSTRES_C).forEach(function (k) { if (!vus[k]) delete MONSTRES_C[k]; });

    /* ---- LES PROJECTILES AVANCENT ENTRE DEUX ETATS ----
     *
     * Ils etaient REMPLACES en bloc, dix fois par seconde, et dessines la ou
     * ils etaient au dernier message. Un tir a 340 unites par seconde restait
     * donc fige six images puis sautait de trente-quatre unites. Ca se lit
     * comme du lag alors que rien ne rame — c'est meme la premiere chose qu'on
     * voit, parce qu'un projectile est ce qui va le plus vite a l'ecran.
     *
     * Un projectile va TOUT DROIT a vitesse constante : connaissant son angle
     * et sa vitesse, la page peut le placer exactement, pas approximativement.
     * On garde donc son point de depart et l'age de ce point, et on l'avance
     * a chaque image. Le prochain etat remet le point a jour.
     */
    /* ---- LES ZONES, ET CE QUI RESTE QUAND ELLES PARTENT ----
     * Une zone ne disparait que pour UNE raison : elle vient de frapper. Pas
     * besoin d'un message de plus — on regarde celles qui manquent, et on
     * pose l'onde de choc a leur place. Un evenement en moins est un
     * evenement qui ne peut pas se perdre. */
    /* ---- L'ETAT DES SALLES ----
     * Le serveur n'envoie que « gardee » ou « videe ». La position et la
     * taille, on les a depuis l'entree : une salle ne bouge pas. On pose donc
     * le bit sur la salle qu'on a deja, sans la remplacer — sinon on perdrait
     * tout le reste. Les salles hors de portee ne sont PAS dans le message :
     * ne rien recevoir ne veut pas dire « rearmee », ca veut dire « je ne
     * vois pas », et on garde alors ce qu'on savait. */
    if (m.salles) {
      for (var si = 0; si < m.salles.length; si++) {
        var vu = m.salles[si];
        for (var sj = 0; sj < SALLES_C.length; sj++) {
          if (SALLES_C[sj].i !== vu.i) continue;
          var etait = SALLES_C[sj].vide;
          SALLES_C[sj].vide = !!vu.v;
          /* Rearmee : le couvercle se referme d'un coup. On ne joue pas
             l'ouverture a l'envers — une salle qu'on retrouve gardee n'est
             pas une salle qui se referme sous nos yeux, c'est une salle
             qu'on n'a pas vue changer. */
          if (!vu.v) SALLES_C[sj].ouvre = 0;
          else if (!etait && SALLES_C[sj].ouvre === undefined) SALLES_C[sj].ouvre = 0;
          break;
        }
      }
    }

    var avant = {};
    for (var zi = 0; zi < ZONES_C.length; zi++) avant[ZONES_C[zi].i] = ZONES_C[zi];
    ZONES_C = m.zones || [];
    var encore = {};
    for (var zj = 0; zj < ZONES_C.length; zj++) encore[ZONES_C[zj].i] = 1;
    Object.keys(avant).forEach(function (k) {
      if (!encore[k]) ONDES.push({ x: avant[k].x, y: avant[k].y, r: avant[k].r, vie: ONDE_DUREE });
    });

    TIRS_C = repereTirs(TIRS_C, m.tirs || []);
    TIRS_M = repereTirs(TIRS_M, m.tirsM || []);
    /* Nos tirs devines localement s'effacent des que le serveur envoie LE
       SIEN : on les reconnait a l'angle, et garder les deux ferait deux
       projectiles cote a cote separes par la latence. */
    oublieDevines(m.tirs || []);
    /* Les pierres viennent du serveur en entier a chaque image : elles sont
       peu nombreuses et ne bougent pas, il n'y a rien a interpoler. */
    TOMBES_C = m.tombes || [];
    SACS_C = m.sacs || [];
    /* Les portes viennent en entier a chaque image, comme les pierres : elles
       sont trois au plus, elles ne bougent pas, et il n'y a rien a
       interpoler. */
    PORTAILS_C = m.portails || [];
    if (m.balises) {
      BALISES_C = m.balises;
      /* On ne repeint la liste que si une balise a CHANGE d'etat. L'instantane
         arrive dix fois par seconde, et refabriquer les memes boutons ferait
         clignoter le panneau pour rien. */
      var sigB = BALISES_C.map(function (b) { return b.i + ':' + b.on; }).join('|');
      if (sigB !== signatureBalises) { signatureBalises = sigB; peintBalises(); }
    }

    var vusJ = {};
    (m.joueurs || []).forEach(function (o) {
      vusJ[o.a] = 1;
      var d = DISTANTS_M[o.a];
      if (!d) d = DISTANTS_M[o.a] = { rx: o.x, ry: o.y, cadre: 0, chrono: 0 };
      d.x = o.x; d.y = o.y; d.dir = o.dir; d.anim = o.anim;
      d.skin = o.skin || 'andy'; d.nom = o.nom; d.pv = o.pv; d.pvMax = o.pvMax;
      /* « Ami » est une RELATION, pas une propriete de la personne : le
         serveur la calcule pour NOUS, a chaque instantane. Le meme joueur est
         vert chez l'un et gris chez l'autre. */
      d.ami = !!o.ami; d.addr = o.a;
      assureCharge(d.skin);
    });
    Object.keys(DISTANTS_M).forEach(function (k) { if (!vusJ[k]) delete DISTANTS_M[k]; });
    /* Meme precaution que dans le Nexus : un instantane arrive dix fois par
       seconde, et refabriquer le HTML pour les memes noms ferait clignoter la
       liste. On ne repeint que si la COMPOSITION change — le drapeau « ami »
       en fait partie, puisqu'il decide du bouton. */
    var sigM = Object.keys(DISTANTS_M).sort().map(function (a) {
      return a + ':' + DISTANTS_M[a].skin + ':' + (DISTANTS_M[a].nom || '') +
             ':' + (DISTANTS_M[a].ami ? 1 : 0);
    }).join('|');
    if (sigM !== signatureGensM) { signatureGensM = sigM; peintGens(); }

    if (m.moi) {
      moiMonde.pv = m.moi.pv; moiMonde.pvMax = m.moi.pvMax; moiMonde.xp = m.moi.xp;
      /* ---- LA VIE ET LE MANA VIENNENT DU SERVEUR, TOUJOURS ----
       * Ils ne descendent plus seulement : ils REMONTENT tout seuls, a la
       * vitalite et a la sagesse. Ne recopier que sur inegalite des points de
       * vie laisserait la barre de mana figee pendant qu'elle se remplit
       * cote serveur — et le bouton du pouvoir resterait eteint alors qu'il
       * est pret. */
      /* ---- ON NE REPEINT PAS TOUT DIX FOIS PAR SECONDE ----
       * La vie et le mana remontent seuls : ils changent en permanence. Passer
       * par `peintPanneau` a ce rythme reconstruirait le HTML de l'equipement
       * et du sac plusieurs fois par seconde — sous le doigt de qui fait
       * glisser une piece. Seules les jauges bougent ici. La structure ne se
       * refait que quand elle change pour de vrai : plafond de vie modifie
       * (un niveau, un objet), fruit different. */
      var structure = (VIE.max !== m.moi.pvMax || VIE.mpMax !== m.moi.mpMax);
      VIE.pv = m.moi.pv; VIE.max = m.moi.pvMax;
      if (m.moi.mp !== undefined) { VIE.mp = m.moi.mp; VIE.mpMax = m.moi.mpMax; }
      if (m.moi.po !== undefined && m.moi.po !== POUVOIR_C) { POUVOIR_C = m.moi.po; structure = true; }
      POUVOIR_ETAT.recharge = m.moi.poR || 0;
      POUVOIR_ETAT.rafale = m.moi.raf || 0;
      /* Le serveur fait foi sur la paralysie : la page decompte entre deux
         messages pour que ce soit fluide, mais elle se recale sur lui a
         chaque image recue. */
      PARALYSE = m.moi.par || 0;
      RALENTI = m.moi.ral || 0;
      BRULURE = m.moi.feu || 0;
      /* La vitesse peut changer en cours de partie — un niveau gagne, une
         piece d'armure equipee — donc on la relit a chaque image plutot que
         de la figer a l'entree. */
      if (m.moi.v) VITESSE = m.moi.v;
      /* La cadence vient du SERVEUR, comme la vitesse. La page se limitait a
         celle de l'arme et ignorait la dexterite et la rafale : elle
         demandait donc moins de tirs que le serveur en acceptait. Un joueur a
         78 de dexterite tirait au rythme d'un debutant, et « Rapid fire » ne
         changeait rien du tout. */
      if (m.moi.c) CADENCE_M = m.moi.c;
      if (structure) peintPanneau(); else majJauges();
      peintPouvoir();
      /* ---- SE RECALER SANS SE TELEPORTER ----
       *
       * La position du serveur a un dixieme de seconde de retard : s'y poser
       * a chaque message ferait reculer le personnage sans arret. Mais
       * l'ancienne regle sautait DUR des que l'ecart depassait 220 unites —
       * et 220 unites de teleportation, c'est une seconde de marche qui
       * disparait d'un coup, au milieu d'un combat.
       *
       * Trois zones, parce qu'un ecart n'a pas une seule cause :
       *
       *   moins de 40 : le retard normal du reseau. On ne touche a rien —
       *     corriger ici ferait vibrer le personnage en permanence.
       *   40 a 700 : on a diverge (un rocher pris d'un cote et pas de
       *     l'autre, une gigue). On TIRE vers la verite au lieu d'y sauter :
       *     l'ecart se resorbe en une demi-seconde et personne ne le voit.
       *   au-dela de 700 : ce n'est plus une derive, c'est un autre endroit —
       *     une mort, une entree, un refus net. La, sauter est la bonne
       *     reponse : lisser sur une demi-seconde ferait glisser le
       *     personnage a travers la carte.
       */
      /* ---- ON COMPARE A CE QU'ON A ANNONCE, PAS A OU L'ON EST ----
       *
       * L'ancienne regle comparait la position du serveur a la position
       * COURANTE. Or celle du serveur a un aller-retour de retard : sur un
       * serveur proche, deux unites d'ecart, on ne voyait rien. Sur un
       * serveur lointain — le notre est a Railway — deux cent cinquante
       * millisecondes de retard a deux cent vingt unites par seconde font
       * CINQUANTE-CINQ unites, donc au-dela du seuil de quarante : le
       * personnage etait tire en arriere en permanence, a chaque message,
       * pendant qu'on marchait. C'est exactement la saccade decrite — et elle
       * ne se voit jamais en local, ou le retard est de dix millisecondes.
       *
       * La bonne comparaison ne depend pas du retard : le serveur nous
       * renvoie la position qu'il a ACCEPTEE, c'est-a-dire l'une de celles
       * qu'on lui a annoncees. On cherche donc, parmi les dernieres
       * annoncees, celle dont il est le plus proche. Ce qui reste est ce
       * qu'il a vraiment corrige — un rocher pris d'un cote et pas de
       * l'autre, un pas refuse — et cela, il faut le suivre.
       *
       * Et on l'applique en ECART, pas en position absolue : se poser sur une
       * position vieille d'un quart de seconde, c'est perdre ce quart de
       * seconde de marche. */
      var d2Abs = (m.moi.x - joueur.x) * (m.moi.x - joueur.x)
                + (m.moi.y - joueur.y) * (m.moi.y - joueur.y);
      if (d2Abs > 700 * 700) {
        /* Ce n'est plus une derive, c'est un autre endroit : une mort, une
           entree, un refus net. Sauter est la bonne reponse, et l'historique
           des annonces ne vaut plus rien. */
        joueur.x = m.moi.x; joueur.y = m.moi.y;
        ENVOIS.length = 0;
        RECALE = null;
      } else {
        var k = -1, d2m = Infinity;
        for (var ei = 0; ei < ENVOIS.length; ei++) {
          var ax2 = m.moi.x - ENVOIS[ei].x, ay2 = m.moi.y - ENVOIS[ei].y;
          var q = ax2 * ax2 + ay2 * ay2;
          if (q < d2m) { d2m = q; k = ei; }
        }
        if (k < 0) {
          /* Rien d'annonce encore — on vient d'entrer. Le serveur fait foi. */
          var ex0 = m.moi.x - joueur.x, ey0 = m.moi.y - joueur.y;
          RECALE = (ex0 * ex0 + ey0 * ey0 > 40 * 40) ? { x: m.moi.x, y: m.moi.y } : null;
        } else {
          /* On NE JETTE PAS les annonces plus anciennes. Les messages
             n'arrivent pas toujours dans l'ordre, et surtout : plus le
             serveur est loin, plus celle qu'il nous renvoie est vieille. En
             elaguant a chaque message, un etat un peu en retard ne retrouvait
             plus sa position dans la liste, tombait sur la plus recente, et
             l'ecart entre les deux — c'est-a-dire le RETARD, pas une
             correction — etait applique au personnage. On garde donc les deux
             ou trois dernieres secondes d'annonces, et il suffit que le
             serveur en reconnaisse UNE pour qu'on sache qu'il ne corrige
             rien. */
          var ex = m.moi.x - ENVOIS[k].x, ey = m.moi.y - ENVOIS[k].y;
          if (d2m > 4 * 4) RECALE = { x: joueur.x + ex, y: joueur.y + ey };
          else RECALE = null;
        }
      }
    }
  }

  /* Un texte qui monte et s'efface : « +75 XP », « LEVEL 4 ». Il double une
     information deja dans le panneau, mais au moment ou elle se produit et
     a l'endroit ou l'on regarde. */
  /* La position vers laquelle on se recale doucement, ou `null`. */
  var RECALE = null;
  /* La cadence de tir que le serveur accorde : arme x dexterite x rafale.
     Zero tant qu'il ne l'a pas dite — on retombe alors sur celle de l'arme. */
  var CADENCE_M = 0;
  /* Les dernieres positions ANNONCEES au serveur, la plus recente en tete.
     C'est a elles qu'on compare ce qu'il renvoie — voir plus haut. */
  var ENVOIS = [];
  function suitLeRecalage(dt) {
    if (!RECALE) return;
    var ex = RECALE.x - joueur.x, ey = RECALE.y - joueur.y;
    if (ex * ex + ey * ey < 4 * 4) { RECALE = null; return; }
    /* Un sixieme de l'ecart par centieme de seconde : l'ecart tombe de moitie
       en un dixieme de seconde, et il ne reste rien au bout d'une demie. Assez
       vite pour que le serveur reste la verite, assez doux pour qu'on ne voie
       pas le personnage bouger tout seul. */
    var t = Math.min(1, dt * 6);
    joueur.x += ex * t; joueur.y += ey * t;
  }

  var FLOTTANTS = [];
  function flotte(t) { FLOTTANTS.push({ t: t, vie: 1.5, max: 1.5 }); }
  var secousse = 0;             // l'ecran tremble quand on encaisse

  function entreMonde(m) {
    MONDE_C = m;
    MONSTRES_C = {}; TIRS_C = []; TIRS_M = []; DEVINES = []; DISTANTS_M = {}; TOMBES_C = []; SACS_C = [];
    ZONES_C = []; ONDES = [];
    RECALE = null; ENVOIS.length = 0; CADENCE_M = 0;
    SAC_PIEDS = null; SAC_SIGNE = ''; peintButin();
    /* APRES la remise a zero, jamais avant : la ligne au-dessus vide les
       listes du monde precedent, et poser les blocs plus haut revenait a les
       effacer aussitot. Le symptome etait muet — on marchait dans les rochers
       et aucun n'etait dessine. */
    OBSTACLES_C = m.obstacles || [];
    SALLES_C = m.salles || [];
    /* ---- OU L'ON EST ----
     * Un seul champ separe un donjon du monde ouvert : son nom. Tout le reste —
     * le sol, les murs, le bouton pour sortir — se deduit de lui.
     * `TUILES_D` est la forme EXACTE du sol, recue une fois : sans elle, la
     * page redessinerait la forme a partir des memes cinq nombres que le
     * serveur, et le jour ou le plan gagne une salle, l'un des deux dessins
     * l'oublierait. */
    DONJON_C = m.donjon || null;
    TUILES_D = null;
    if (m.tuiles && m.tuiles.length) {
      TUILES_D = Object.create(null);
      for (var iT = 0; iT < m.tuiles.length; iT++) {
        TUILES_D[m.tuiles[iT][0] + ',' + m.tuiles[iT][1]] = 1;
      }
    }
    PORTAILS_C = []; PORTAILS_LOIN = [];
    PORTAIL_PIEDS = null; PORTAIL_SIGNE = ''; peintPorte();
    moiMonde = { pv: m.moi.pv, pvMax: m.moi.pvMax, xp: 0 };
    VIE.pv = m.moi.pv; VIE.max = m.moi.pvMax;
    if (m.moi.mpMax !== undefined) { VIE.mp = m.moi.mp; VIE.mpMax = m.moi.mpMax; }
    /* La table des couts arrive AVEC l'entree, jamais ecrite ici : un chiffre
       en dur cote page finirait par ne plus etre celui que le serveur
       preleve, et le bouton mentirait sur le prix. */
    POUVOIRS_C = m.pouvoirs || null;
    if (m.effets && m.effets.ralenti) FREIN = m.effets.ralenti.facteur;
    if (m.moi.v) VITESSE = m.moi.v;
    POUVOIR_C = m.moi.pouvoir || null;
    POUVOIR_ETAT = { recharge: 0, rafale: 0 };
    PARALYSE = 0; RALENTI = 0; BRULURE = 0;
    EFFETS_P = []; COUPS = []; NIVEAUX = [];
    joueur.x = m.moi.x; joueur.y = m.moi.y; joueur.dir = 'up';
    SCENE = 'monde';
    peintBoutonTir();
    chargeEffets();
    chargeSols();
    chargeTirs();
    fermeCoffreMenu(); fermeShop(); fermeBj();
    LIEUX.forEach(function (l) { l.dwell = 0; });
    indiceActuel = null;
    if (indiceEl) {
      /* La ligne d'accueil du monde dit les DEUX choses qu'on ne devine pas :
         par ou repartir, et que la barre d'espace fait quelque chose. Le nom
         du pouvoir vient avec — « special attack » n'apprend rien, « Stasis »
         donne envie d'essayer. */
      var nomPo = (POUVOIRS_C && POUVOIR_C && POUVOIRS_C[POUVOIR_C])
        ? POUVOIRS_C[POUVOIR_C].nom : null;
      /* Dans un donjon, la ligne dit AUTRE CHOSE : « press E to run home »
         serait un mensonge — E ramene au Nexus, ce qui abandonne le donjon sans
         rien en tirer. Ce qu'il faut savoir la, c'est par ou l'on repart. */
      indiceEl.innerHTML = DONJON_C
        ? 'You are deep in the <b>' + ech(DONJON_C) + '</b> &middot; ' +
          (nomPo ? '<b>' + (nomTouche(PERSO_TOUCHES.pouvoir) || 'Space') + '</b> for ' +
                   ech(nomPo) + ' &middot; ' : '') +
          'the gate you came through takes you back'
        : 'You are in the <b>wild</b> &middot; ' +
          (nomPo ? '<b>' + (nomTouche(PERSO_TOUCHES.pouvoir) || 'Space') + '</b> for ' +
                   ech(nomPo) + ' &middot; ' : '') +
          'press E to run home';
      indiceEl.classList.add('on');
    }
    peintPanneau();
  }

  function quitteMonde() {
    if (SCENE !== 'monde') return false;
    if (enLigne) envoie({ type: 'realmLeave' });
    SCENE = 'nexus';
    peintBoutonTir();
    /* On abandonne le donjon avec le monde : `realmLeave` sort de la simulation
       ou l'on etait, quelle qu'elle soit. Garder `DONJON_C` pose ici aurait
       laisse le bouton « EXIT » sur l'ecran du Nexus. */
    DONJON_C = null; TUILES_D = null; PORTAILS_C = []; PORTAILS_LOIN = [];
    PORTAIL_PIEDS = null; PORTAIL_SIGNE = ''; peintPorte();
    MONSTRES_C = {}; TIRS_C = []; TIRS_M = []; DEVINES = []; DISTANTS_M = {}; TOMBES_C = []; SACS_C = [];
    ZONES_C = []; ONDES = [];
    RECALE = null; ENVOIS.length = 0; CADENCE_M = 0;
    OBSTACLES_C = []; SALLES_C = [];
    SAC_PIEDS = null; SAC_SIGNE = ''; peintButin();
    /* On revient AU PIED DU PORTAIL, pas au centre : c'est par la qu'on est
       parti, et reapparaitre ailleurs donne l'impression d'avoir ete
       deplace. Un cran plus bas pour ne pas repartir aussitot. */
    var p = PORTAIL_L;
    joueur.x = p.x; joueur.y = p.y + p.rayon + 60;
    joueur.dir = 'down';
    LIEUX.forEach(function (l) { l.dwell = 0; });
    indiceActuel = null;
    if (indiceEl) indiceEl.classList.remove('on');
    /* LA FONTAINE SOIGNE. Rentrer au Nexus rend toute la vie — c'est le
       sens de la place centrale, et c'est ce qui fait qu'on ose repartir. */
    VIE.pv = VIE.max;
    /* La fontaine rend la vie ET le mana : revenir au Nexus avec une reserve
       vide obligerait a attendre trois minutes sur la place avant de
       repartir, ce qui n'est pas du jeu. */
    VIE.mp = VIE.mpMax;
    /* ET CA SE VOIT. Les barres remontaient d'un coup, sans un signe : on ne
       savait pas si la fontaine avait soigne ou si l'affichage s'etait
       recale tout seul. La spirale part des pieds, la ou l'on regarde. */
    poseSoin(joueur.x, joueur.y);
    POUVOIR_C = null; EFFETS_P = []; PARALYSE = 0; RALENTI = 0; BRULURE = 0;
    VITESSE = 260;
    peintPouvoir();
    joueSample('vault', { vol: 0.6, hauteur: 1.25 });
    peintPanneau();
    return true;
  }

  /* ================== L'ECRAN DE FIN ==================
   *
   * Mourir est definitif : l'equipement porte est detruit, le sac part, le
   * niveau retombe a zero. Renvoyer le joueur au Nexus sans un mot lui ferait
   * croire a une panne — il verrait ses stats changer sans explication.
   *
   * On montre donc les trois choses qu'il vient chercher : ce qu'il a gagne
   * (l'experience et l'or), ce qu'il a perdu (nommement), et ce qui reste.
   * Le troisieme point compte autant que les deux autres : perdre son
   * equipement et croire qu'on a perdu ses personnages, ce n'est pas la meme
   * partie.
   *
   * L'or, c'est la FAME du serveur. Le mot « fame » ne dit rien a qui n'a
   * jamais joue a RotMG ; « gold » se lit tout seul. Le champ garde son nom
   * cote serveur — renommer un protocole pour une etiquette serait payer
   * cher une question de vocabulaire.
   */
  var elMortVoile = document.getElementById('nxMortVoile');
  var skinChoisi = null;

  function nbCourt(v) {
    var n = Number(v) || 0;
    return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
         : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
  }

  function montreMort(m) {
    if (!elMortVoile) return;
    var q = function (c) { return elMortVoile.querySelector(c); };
    /* ---- TOMBER DANS LE ROUGE N'EST PAS MOURIR ----
     * Le meme panneau, mais il ne doit pas raconter la meme chose : il n'y a
     * ni fame encaissee, ni personnage a remplacer, et annoncer « You died »
     * au-dessus d'un compteur d'or a zero ferait croire a une perte qui n'a
     * pas eu lieu. Un joueur qui croit avoir perdu sa relique n'y retourne
     * pas. */
    elMortVoile.classList.toggle('pvp', !!m.pvp);
    q('.nxmt-titre').textContent = m.pvp ? 'You went down' : 'You died';
    q('.nxmt-go').textContent = m.pvp ? 'Back to the Nexus' : 'Play again';
    var garde = q('.nxmt-garde');
    if (garde) {
      garde.textContent = m.pvp
        ? 'Nothing was destroyed. Your gear, your level and your vault came home with you.'
        : 'Your characters are safe, and so is everything you stored in the vault. Only what you carried is gone.';
    }
    /* ---- « Killed by a Lime » ET « Killed by Alice » ----
     * L'article est faux des que le tueur est quelqu'un : on ne meurt pas
     * « d'un Alice ». Le drapeau vient du serveur — la page ne devine pas a
     * la forme du nom. */
    q('.nxmt-par').textContent = m.par
      ? (m.pvp ? 'Killed by ' : 'Killed by a ') +
        String(m.par).replace(/^./, function (c) { return c.toUpperCase(); })
      : 'Your run is over.';
    q('.nxmt-xp').textContent = nbCourt(m.xp);
    q('.nxmt-or').textContent = '+' + nbCourt(m.fameGagnee);
    q('.nxmt-ort').textContent = nbCourt(m.fameTotale);

    /* Ce qu'on a perdu, NOMMEMENT. « Vous avez perdu votre equipement » ne
       dit pas si la piece mythique y etait ; la liste, si. */
    var bouts = [];
    if (m.perdus && m.perdus.length) {
      bouts.push('Destroyed: <b>' + m.perdus.map(function (o) {
        return ech(o.nom || 'an item'); }).join('</b>, <b>') + '</b>');
    }
    if (m.sacPerdu) {
      bouts.push('Backpack: <b>' + m.sacPerdu + ' item' + (m.sacPerdu > 1 ? 's' : '') + '</b> lost');
    }
    /* ---- TOMBER DANS LA CARTE ROUGE N'EST PAS MOURIR ----
     * L'ecran de mort annonce « Destroyed » et remet un personnage a choisir.
     * Dans le rouge, rien n'est detruit : on garde son equipement, son niveau
     * et son coffre, et l'on n'a perdu que ce qu'on avait ramasse. Le dire
     * autrement ferait croire a une perte qui n'a pas eu lieu — et un joueur
     * qui croit avoir perdu sa relique n'y retourne pas. */
    if (m.pvp) {
      bouts.length = 0;
      bouts.push('Your <b>backpack</b> stayed where you fell &mdash; go take it back.');
      bouts.push('<i>Your gear, your level and your vault are untouched.</i>');
    }
    q('.nxmt-perdu').innerHTML = bouts.length ? bouts.join('<br>')
      : 'You were carrying nothing. Nothing was lost.';


    /* Choisir avec QUI repartir. Les skins survivent toujours — c'est ce qui
       permet de relancer tout de suite au lieu de racheter un personnage. */
    var dispo = (m.skins && m.skins.length) ? m.skins : (PERSO ? [PERSO] : []);
    skinChoisi = dispo.indexOf(PERSO) >= 0 ? PERSO : dispo[0] || null;
    q('.nxmt-skins').innerHTML = dispo.map(function (id) {
      return '<button type="button" data-skin="' + ech(id) + '"' +
        (id === skinChoisi ? ' class="on"' : '') + '>' +
        '<img alt="" src="img/skins/skin_' + encodeURIComponent(id) + '.webp"' +
        ' onerror="this.style.visibility=\'hidden\'">' + ech(id) + '</button>';
    }).join('');
    Array.prototype.forEach.call(q('.nxmt-skins').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        skinChoisi = b.getAttribute('data-skin');
        Array.prototype.forEach.call(q('.nxmt-skins').querySelectorAll('button'), function (x) {
          x.classList.toggle('on', x === b);
        });
        clic(false);
      });
    });
    elMortVoile.classList.add('on');

    /* Le sac du panneau se vide TOUT DE SUITE. Le serveur vient de nous dire
       qu'il est perdu ; attendre le message d'inventaire pour le croire
       laisserait le joueur voir son butin intact derriere l'ecran qui lui
       annonce qu'il l'a perdu.
       APRES avoir montre l'ecran, jamais avant : une erreur dans le repeint
       du panneau ne doit pas empecher le bilan de s'afficher. C'est ce qui
       s'est passe a mon premier essai — l'ecran restait a moitie construit,
       sans la liste des personnages. */
    SAC = [];
    try { peintPanneau(); } catch (e) {}
  }

  if (elMortVoile) {
    elMortVoile.querySelector('.nxmt-go').addEventListener('click', function () {
      clic(true);
      /* On change de personnage AVANT de repartir : le serveur repondra
         `skins`, qui redemande la fiche et l'inventaire. Rien a recharger. */
      if (skinChoisi && skinChoisi !== PERSO) envoie({ type: 'skinChoisi', id: skinChoisi });
      else { envoie({ type: 'skins' }); envoie({ type: 'equipable' }); }
      elMortVoile.classList.remove('on');
    });
  }

  /* ================== LA BOUTIQUE, DANS LE JEU ==================
   *
   * L'etal renvoyait sur games.html : pour acheter un coffre il fallait
   * QUITTER la partie, puis revenir par le menu. C'etait le dernier endroit
   * du Nexus qui faisait sortir du jeu.
   *
   * Rien n'est reecrit du chemin de l'argent : on parle au serveur avec les
   * memes messages que le panneau du hall — `shop` pour lire, `shopOpen`
   * pour ouvrir une caisse. Le prix, les chances et le solde viennent de lui.
   * Un second calcul de prix ici serait une seconde verite sur ce qu'on
   * paie, et c'est exactement ce qu'il ne faut pas dupliquer.
   */
  var BOUTIQUE = null, shopSaison = 2, shopOuvert = false, shopMsg = '', shopLot = 1;
  var SKINS_C = [];            // le catalogue des personnages
  var elShopVoile = document.getElementById('nxShopVoile');
  var elShopOng = elShopVoile ? elShopVoile.querySelector('.nxsh-ong') : null;
  var elShopCorps = elShopVoile ? elShopVoile.querySelector('.nxsh-corps') : null;
  var elShopSolde = elShopVoile ? elShopVoile.querySelector('.nxsh-solde b') : null;
  var elShopMsg = elShopVoile ? elShopVoile.querySelector('.nxsh-msg') : null;

  function ouvreShop() {
    if (!elShopVoile) return;
    shopOuvert = true;
    shopMsg = '';
    if (enLigne) envoie({ type: 'shop', season: shopSaison });
    peintShop();
    elShopVoile.classList.add('on');
  }
  /* ---- ON NE ROUVRE PAS CE QU'ON VIENT DE FERMER ----
   *
   * L'etal se rouvrait UNE DEMI-SECONDE apres la croix : la condition etait
   * « on est dessus et il est ferme », et fermer la rendait vraie a nouveau.
   * La croix marchait donc parfaitement, et elle etait annulee aussitot — ce
   * qui se lit exactement comme un bouton mort. On ne pouvait pas s'ecarter
   * de l'etal sans voir la boutique clignoter.
   *
   * Le coffre avait deja ce garde-fou ; l'etal ne l'avait pas. Deux
   * conditions doivent etre reunies pour rouvrir tout seul :
   *
   *   — s'etre ECARTE de l'etal depuis la fermeture. C'est la regle du
   *     coffre, et c'est elle qui resout le cas signale : rester dessus ne
   *     rouvre plus jamais, quel que soit le temps ;
   *   — et DIX SECONDES ecoulees. Elle couvre le rebond de celui qui longe
   *     l'etal en repartant : sortir du rayon d'un pas et y rentrer du
   *     suivant ne doit pas relancer la boutique.
   *
   * Ouvrir a la main reste possible a tout moment : ce blocage ne concerne
   * que l'ouverture AUTOMATIQUE, celle qu'on n'a pas demandee. */
  /* ---- LE REPOS, POUR TOUS LES LIEUX QUI OUVRENT UN PANNEAU ----
   *
   * Ecrit une fois et indexe par la CLE du lieu. L'etal avait le sien, ecrit a
   * la main ; la table de blackjack aurait eu exactement le meme, recopie —
   * et le troisieme panneau aurait eu le sien, legerement different, parce que
   * c'est ce qui arrive a la troisieme copie.
   *
   * Deux conditions independantes pour rouvrir tout seul :
   *   — s'etre ECARTE du lieu depuis la fermeture. C'est elle qui resout le
   *     defaut signale : rester dessus ne rouvre plus jamais ;
   *   — et DIX SECONDES ecoulees, ce qui couvre le rebond de celui qui longe
   *     le lieu en repartant.
   * Les faire dependre l'une de l'autre ferait tomber la seconde avec la
   * premiere — le rebond reviendrait par la fenetre. */
  var REPOS = {};
  var REPOS_MS = 10000;

  function marqueFerme(cle) { REPOS[cle] = { a: performance.now(), ici: true }; }
  function quitteLieu(cle) { if (REPOS[cle]) REPOS[cle].ici = false; }
  function peutRouvrir(cle) {
    var r = REPOS[cle];
    if (!r) return true;
    if (r.ici) return false;                                   // toujours dessus
    return (performance.now() - r.a) >= REPOS_MS;              // et le repos passe
  }

  function fermeShop(parLaMain) {
    shopOuvert = false;
    if (parLaMain) marqueFerme('etal');
    if (elShopVoile) elShopVoile.classList.remove('on');
  }
  if (elShopVoile) {
    elShopVoile.addEventListener('click', function (e) {
      var c = e.target.classList;
      if (e.target === elShopVoile || (c && c.contains('nxcf-x'))) fermeShop(true);
    });
  }

  /* Les fleches remplacent la barre de defilement : une barre est laide, et
     sur telephone elle n'existe meme pas — on ne devine pas qu'il y a
     quelque chose a droite. Elles s'effacent quand tout tient a l'ecran. */
  function majFleches() {
    if (!elShopOng) return;
    var g = elShopVoile.querySelector('.nxsh-fg'), d = elShopVoile.querySelector('.nxsh-fd');
    if (!g || !d) return;
    var deborde = elShopOng.scrollWidth > elShopOng.clientWidth + 2;
    g.style.display = deborde ? '' : 'none';
    d.style.display = deborde ? '' : 'none';
    g.classList.toggle('off', elShopOng.scrollLeft <= 2);
    d.classList.toggle('off',
      elShopOng.scrollLeft >= elShopOng.scrollWidth - elShopOng.clientWidth - 2);
  }
  if (elShopOng) elShopOng.addEventListener('scroll', majFleches);
  if (elShopVoile) {
    ['fg', 'fd'].forEach(function (c) {
      var b = elShopVoile.querySelector('.nxsh-' + c);
      if (!b) return;
      b.addEventListener('click', function () {
        elShopOng.scrollBy({ left: (c === 'fg' ? -1 : 1) * elShopOng.clientWidth * 0.7,
                             behavior: 'smooth' });
        clic(false);
      });
    });
  }

  function peintShop() {
    if (!elShopCorps) return;
    if (elShopSolde) elShopSolde.textContent = SOLDE_TEXTE || '—';
    if (elShopMsg) {
      elShopMsg.textContent = shopMsg ? shopMsg.texte : '';
      elShopMsg.className = 'nxsh-msg' + (shopMsg && shopMsg.ok ? ' ok' : '');
    }
    if (!BOUTIQUE) { elShopCorps.innerHTML = '<div class="nxcf-vide">Opening the shop…</div>'; return; }

    // ---- les saisons
    if (elShopOng) {
      /* « Season 2 — Weapons » sur quatre onglets deborde de tous les
         telephones. Le numero et le SUJET suffisent : on sait ce qu'on
         ouvre, et les quatre tiennent enfin cote a cote. */
      var SUJET = { fruit: 'Fruits', weapon: 'Weapons', armor: 'Armor', ring: 'Rings' };
      elShopOng.innerHTML = (BOUTIQUE.saisons || []).map(function (s) {
        var court = SUJET[s.sujet] || String(s.nom).split('—').pop().trim();
        return '<button type="button" data-s="' + s.n + '"' +
               (s.n === shopSaison ? ' class="on"' : '') +
               '><b>S' + s.n + '</b> ' + ech(court) + '</button>';
      }).join('') +
      /* Les potions ne sont pas une saison : pas de tirage, pas de plafond,
         prix fixe. Elles ont donc leur onglet a part, apres les quatre —
         les glisser dans la liste des saisons aurait fait croire a une
         cinquieme collection. */
      '<button type="button" data-s="pot"' + (shopSaison === 'pot' ? ' class="on"' : '') +
      '>&#129514; Potions</button>' +
      '<button type="button" data-s="skin"' + (shopSaison === 'skin' ? ' class="on"' : '') +
      '>&#127917; Characters</button>';
      majFleches();
      Array.prototype.forEach.call(elShopOng.querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-s');
          shopSaison = (v === 'pot' || v === 'skin') ? v : Number(v);
          shopMsg = '';
          clic(false);
          if (shopSaison === 'pot') peintShop();
          else if (shopSaison === 'skin') { if (enLigne) envoie({ type: 'skins' }); peintShop(); }
          else if (enLigne) envoie({ type: 'shop', season: shopSaison });
        });
      });
    }

    // ---- le rayon des potions
    if (shopSaison === 'pot') {
      var soldeP = Number(BOUTIQUE.balance || 0);
      /* Le stock du magasin appartient aux JOUEURS. Tant que le marche n'est
         pas arrive, on ne montre pas un comptoir vide qui dirait « personne ne
         vend » : on le demande, et on affiche ce qu'on sait deja. */
      if (!MARCHE_P && enLigne) envoie({ type: 'potionMarche' });
      var lignesM = (MARCHE_P && MARCHE_P.lignes) || [];
      var deM = function (cle) {
        for (var i = 0; i < lignesM.length; i++) if (lignesM[i].cle === cle) return lignesM[i];
        return null;
      };

      /* ---- LE COMPTOIR DE VENTE ----
       * Un seul bouton fait la bascule, et il porte le mot qu'on cherche :
       * « Sell my potions ». Deux onglets de plus en haut auraient noye les
       * saisons, qui sont la raison principale d'ouvrir cette boutique. */
      var bascule = '<button type="button" class="nxsh-bascule' + (shopVente ? ' on' : '') +
        '" data-vente="1">' + (shopVente ? '\u2190 Back to buying'
                                         : '\uD83C\uDFF7 Sell my potions') + '</button>';

      if (shopVente) {
        /* On ne montre que ce qu'on peut vendre ou reprendre : une liste de
           huit fioles a zero serait huit lignes mortes a lire avant de
           trouver la seule qui compte. */
        var vendables = lignesM.filter(function (l) { return l.jai > 0 || l.enVente > 0; });
        elShopCorps.innerHTML = bascule +
          '<div class="nxsh-note">Players stock this shop. You keep <b>' +
          (100 - (MARCHE_P ? MARCHE_P.maison : 50)) +
          '%</b> of every sale, and you are paid when someone actually buys \u2014 ' +
          'not when you list. Take yours back any time.</div>' +
          (vendables.length ? vendables.map(function (l) {
            var q = Math.max(1, Math.min(venteQte[l.cle] || 1, Math.max(1, l.jai)));
            return '<div class="nxsh-vente">' +
              (l.image
                ? '<img alt="" src="img/nexus/objets/' + encodeURIComponent(l.image) +
                  '.webp" onerror="this.remove()">'
                : '<u class="fiole" style="background-position:' + colonneFiole(l) + '% 0"></u>') +
              '<span class="i"><span class="n">' + ech(l.nom) + '</span>' +
              '<span class="o">You have <b>' + l.jai + '</b>' +
              (l.enVente ? ' &middot; <b>' + l.enVente + '</b> listed' : '') +
              ' &middot; <b>' + l.stock + '</b> in the shop</span></span>' +
              '<span class="g">+' + l.gain + ' <i>$SWOGE each</i></span>' +
              '<span class="b">' +
                (l.jai > 0
                  ? '<span class="nxsh-qte">' +
                      '<button type="button" data-moins="' + ech(l.cle) + '">&minus;</button>' +
                      '<b>' + q + '</b>' +
                      '<button type="button" data-plus="' + ech(l.cle) + '">+</button>' +
                      '<button type="button" data-tout="' + ech(l.cle) + '">All</button>' +
                    '</span>' +
                    '<button type="button" class="nxsh-act sell" data-vend="' + ech(l.cle) +
                    '">Sell ' + q + '</button>'
                  : '') +
                (l.enVente > 0
                  ? '<button type="button" class="nxsh-act" data-reprend="' + ech(l.cle) +
                    '">Take back</button>' : '') +
              '</span></div>';
          }).join('')
            : '<div class="nxsh-note">Nothing to sell yet. Health and magic potions ' +
              'drop in the wild, and stat potions come off big monsters \u2014 ' +
              'store them in your vault and they show up here.</div>');

        Array.prototype.forEach.call(elShopCorps.querySelectorAll('[data-moins],[data-plus],[data-tout]'), function (b) {
          b.addEventListener('click', function () {
            var k = b.getAttribute('data-moins') || b.getAttribute('data-plus') || b.getAttribute('data-tout');
            var l = deM(k); if (!l) return;
            var q = Math.max(1, Math.min(venteQte[k] || 1, Math.max(1, l.jai)));
            if (b.hasAttribute('data-moins')) q = Math.max(1, q - 1);
            else if (b.hasAttribute('data-plus')) q = Math.min(l.jai, q + 1);
            else q = l.jai;
            venteQte[k] = q;
            clic(false); peintShop();
          });
        });
        Array.prototype.forEach.call(elShopCorps.querySelectorAll('[data-vend],[data-reprend]'), function (b) {
          b.addEventListener('click', function () {
            clic(true);
            var v = b.getAttribute('data-vend');
            if (v) {
              var l = deM(v);
              envoie({ type: 'potionVend', cle: v,
                       qte: Math.max(1, Math.min(venteQte[v] || 1, l ? l.jai : 1)) });
            } else {
              var r = b.getAttribute('data-reprend');
              var lr = deM(r);
              envoie({ type: 'potionReprend', cle: r, qte: lr ? lr.enVente : 1 });
            }
          });
        });
        Array.prototype.forEach.call(elShopCorps.querySelectorAll('[data-vente]'), function (b) {
          b.addEventListener('click', function () { shopVente = false; shopMsg = ''; clic(false); peintShop(); });
        });
        return;
      }

      /* ---- LE RAYON NE MONTRE QUE CE QUI EST VRAIMENT EN VENTE ----
       *
       * La boutique ne fabrique plus rien : soin, mana et fioles de stat
       * viennent tous des joueurs. Une ligne « Health Potion — out of stock »
       * affichee en permanence est un rayon vide qu'on apprend a ne plus
       * regarder, et le jour ou quelqu'un en met enfin en vente, personne ne
       * le remarque. On n'affiche donc la ligne QUE si elle a du stock : le
       * rayon dit ce qu'on peut acheter, pas ce qui existerait si quelqu'un
       * vendait. */
      /* La ligne EXISTE des qu'il y a du stock, le sien compris (`total`) ;
         c'est `stock` — ce que CE joueur peut acheter — qui commande le
         bouton. Filtrer sur `stock` montrait un magasin vide a celui qui
         venait d'y mettre ses potions : il ne pouvait pas verifier que son
         annonce existait. */
      var enRayon = (POTIONS_C || []).filter(function (p) {
        var l = deM(p.cle);
        return l && l.total > 0;
      });
      elShopCorps.innerHTML = bascule + enRayon.map(function (p) {
        var reste = p.max - p.quantite;
        var l = deM(p.cle);
        /* Le sien n'est pas achetable : on ne se rachete pas a soi-meme. Le
           bouton le dit, au lieu de refuser au clic. */
        var mien = !!l && l.stock <= 0 && l.enVente > 0;
        return '<button type="button" class="nxsh-cof' + (mien ? ' mien' : '') +
          '" data-pot="' + ech(p.cle) + '"' +
          (!mien && soldeP >= p.prix && reste > 0 ? '' : ' disabled') + '>' +
          '<img alt="" src="img/nexus/objets/' + encodeURIComponent(p.image) +
          '.webp" onerror="this.remove()">' +
          '<span><span class="n">' + ech(p.nom) + '</span><span class="o">Restores <b>' +
          p.soigne + '</b> ' + (p.quoi === 'hp' ? 'HP' : 'MP') +
          ' &middot; you carry <b>' + p.quantite + '</b> of ' + p.max +
          /* D'ou vient ce qu'on achete. Sans cette ligne, « le stock vient des
             joueurs » est une phrase de Telegram et rien dans l'ecran ne la
             confirme. */
          '<br><i class="nxsh-src">' + (l ? l.total : 0) + ' in stock from players' +
          (l && l.enVente ? ' \u00b7 <b>' + l.enVente + ' yours</b>' : '') + '</i>' +
          '</span></span><span class="p">' +
          (mien ? '<b class="nxsh-mien">Yours</b>' : p.prix + ' $SWOGE') +
          '</span></button>';
      }).join('') +
      /* Les lots ne servent qu'aux potions de soin, et seulement s'il y en a :
         trois boutons « Buy x25 » au-dessus d'un rayon vide sont trois
         boutons qui ne peuvent rien acheter. */
      (enRayon.length
        /* Dix par dix : personne n'achete des potions une par une, et taper
           dix fois le meme bouton n'a jamais amuse personne. */
        ? '<div class="nxsh-lots">' + [1, 10, 25].map(function (q) {
            return '<button type="button" data-lot="' + q + '">Buy x' + q + '</button>';
          }).join('') + '</div>'
        : '') +
      /* ---- LES FIOLES DE STAT, QUAND UN JOUEUR EN VEND ----
       * Elles n'ont pas de fond de la maison : la ligne n'existe que s'il y en
       * a vraiment une en vente. Un rayon vide en permanence apprendrait a ne
       * plus le regarder. */
      (function () {
        var f = lignesM.filter(function (l) { return l.stat && l.total > 0; });
        if (!f.length) return '';
        return '<div class="nxsh-grp">Stat potions \u2014 sold by players only</div>' +
          f.map(function (l) {
            var sien = l.stock <= 0 && l.enVente > 0;
            return '<button type="button" class="nxsh-cof' + (sien ? ' mien' : '') +
              '" data-fiole="' + ech(l.stat) + '"' +
              (!sien && soldeP >= l.prix ? '' : ' disabled') + '>' +
              '<u class="fiole" style="background-position:' + colonneFiole(l) + '% 0"></u>' +
              '<span><span class="n">+' + l.pas + ' ' + ech(String(l.stat).toUpperCase()) +
              '</span><span class="o">Permanent \u2014 and it stays if you die' +
              ' &middot; <b>' + l.total + '</b> in stock' +
              (l.enVente ? ' \u00b7 <b>' + l.enVente + ' yours</b>' : '') + '</span></span>' +
              '<span class="p">' +
              (sien ? '<b class="nxsh-mien">Yours</b>' : l.prix + ' $SWOGE') +
              '</span></button>';
          }).join('');
      })();

      /* ---- LE RAYON ENTIEREMENT VIDE ----
       * Ce n'est pas une panne, c'est l'etat normal d'un magasin dont le stock
       * vient des joueurs — et il faut le DIRE, sinon il se lit comme une
       * boutique cassee. La phrase pointe vers le seul geste qui le remplit. */
      if (!elShopCorps.querySelector('[data-pot],[data-fiole]')) {
        elShopCorps.innerHTML = bascule +
          '<div class="nxsh-note">Nothing for sale right now. Every potion in this ' +
          'shop was found and listed by a player \u2014 <b>put yours up</b> and ' +
          'you keep half of every sale.</div>';
      }

      var lot = shopLot || 1;
      Array.prototype.forEach.call(elShopCorps.querySelectorAll('[data-lot]'), function (b) {
        b.classList.toggle('on', Number(b.getAttribute('data-lot')) === lot);
        b.addEventListener('click', function () {
          shopLot = Number(b.getAttribute('data-lot'));
          clic(false); peintShop();
        });
      });
      Array.prototype.forEach.call(elShopCorps.querySelectorAll('[data-pot]'), function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          clic(true);
          envoie({ type: 'potionAchat', cle: b.getAttribute('data-pot'), qte: shopLot || 1 });
        });
      });
      Array.prototype.forEach.call(elShopCorps.querySelectorAll('[data-fiole]'), function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          clic(true);
          envoie({ type: 'fioleAchat', stat: b.getAttribute('data-fiole'), qte: 1 });
        });
      });
      Array.prototype.forEach.call(elShopCorps.querySelectorAll('[data-vente]'), function (b) {
        b.addEventListener('click', function () { shopVente = true; shopMsg = ''; clic(false); peintShop(); });
      });
      return;
    }

    /* ---- LE RAYON DES PERSONNAGES ----
       Rien a voir avec les saisons : pas de tirage, pas de plafond, pas de
       rarete. Un catalogue fixe, un prix, et on l'a ou on ne l'a pas. Celui
       qu'on possede deja se PORTE au lieu de s'acheter — c'est le meme
       bouton, et c'est ce qu'on veut en tapant dessus. */
    if (shopSaison === 'skin') {
      var soldeS = Number(BOUTIQUE.balance || 0);
      elShopCorps.innerHTML = (SKINS_C || []).map(function (k) {
        var a = k.id === PERSO;
        return '<button type="button" class="nxsh-cof" data-skin="' + ech(k.id) + '"' +
          ' data-a="' + (k.possede ? (a ? 'porte' : 'porter') : 'acheter') + '"' +
          (k.possede || soldeS >= k.prix ? '' : ' disabled') + (a ? ' class="nxsh-cof on"' : '') + '>' +
          '<img alt="" src="img/skins/skin_' + encodeURIComponent(k.id) +
          '.webp" onerror="this.remove()">' +
          '<span><span class="n">' + ech(k.nom) +
          (k.offert ? ' <u class="nxsh-free">FREE</u>' : '') +
          '</span><span class="o">' +
          ech(k.pouvoir || '') + '</span></span><span class="p">' +
          /* « FREE » et pas « 0 $SWOGE » : un prix a zero se lit comme un prix
             qu'on n'a pas su calculer, le mot se lit comme une promesse. */
          (k.possede ? (a ? 'worn' : 'wear')
                     : k.offert ? 'FREE'
                     : Math.round(k.prix).toLocaleString('en-US') + ' $SWOGE') +
          '</span></button>';
      }).join('');
      Array.prototype.forEach.call(elShopCorps.querySelectorAll('[data-skin]'), function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          var quoi = b.getAttribute('data-a');
          if (quoi === 'porte') return;
          clic(true);
          envoie(quoi === 'acheter'
            ? { type: 'skinBuy', id: b.getAttribute('data-skin') }
            : { type: 'skinChoisi', id: b.getAttribute('data-skin') });
        });
      });
      return;
    }

    // ---- les caisses
    var C = BOUTIQUE.catalogue || {};
    var solde = Number(BOUTIQUE.balance || 0);
    var coffres = C.coffres || [];
    if (!coffres.length) {
      elShopCorps.innerHTML = '<div class="nxcf-vide">Nothing on sale in this season right now.</div>';
      return;
    }
    elShopCorps.innerHTML = coffres.map(function (c) {
      /* Le DESSIN suit `image` et non `cle` : les caisses d'armes empruntent
         celui des coffres a fruits tant que le leur n'existe pas, et c'est le
         serveur qui le decide — comme dans le panneau du hall. */
      var dessin = c.image || c.cle;
      return '<button type="button" class="nxsh-cof" data-cle="' + ech(c.cle) +
        '" data-dessin="' + ech(dessin) + '"' +
        (solde >= c.prix ? '' : ' disabled') + '>' +
        '<img alt="" src="img/shop/coffre_' + encodeURIComponent(dessin) + '.webp" onerror="this.remove()">' +
        '<span><span class="n">' + ech(c.nom) + '</span><span class="o">' +
        (c.chances || []).map(function (x) {
          return '<span style="white-space:nowrap"><b style="color:' + ech(x.couleur) + '">' +
                 (Math.round(x.pourcent * 10) / 10) + '%</b> ' + ech(x.nom) + '</span>';
        }).join(' &middot; ') +
        '</span></span><span class="p">' + Math.round(c.prix).toLocaleString('en-US') + ' $SWOGE</span>' +
        '</button>';
    }).join('');
    Array.prototype.forEach.call(elShopCorps.querySelectorAll('.nxsh-cof'), function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        b.disabled = true;
        shopMsg = { texte: 'Opening…', ok: false };
        peintShop();
        /* L'animation part au CLIC, pas a la reponse du serveur. Attendre
           l'aller-retour ferait un decalage de plusieurs dixiemes entre le
           doigt et le coffre qui s'ouvre, et c'est precisement ce qui fait
           qu'une interface parait molle. C'est la scene de stakebubble.js,
           pas une copie : le meme achat doit montrer la meme chose ici et
           dans le hall. */
        try {
          if (window.swogeCoffre && window.swogeCoffre.ouvre) {
            window.swogeCoffre.ouvre(b.getAttribute('data-dessin') || b.getAttribute('data-cle'));
          }
        } catch (e) {}
        envoie({ type: 'shopOpen', chest: b.getAttribute('data-cle'), season: shopSaison });
      });
    });
  }

  /* ---- LE MENU DU COFFRE ----
   *
   * Les objets etaient poses au sol : joli, mais il fallait marcher sur
   * chacun pour lire son nom, et rien ne permettait de s'equiper. Ils sont
   * maintenant dans un menu qu'un coffre de la salle ouvre — on va au coffre,
   * on l'ouvre, on change son equipement, comme dans le jeu d'origine.
   *
   * Une seule table pour les quatre categories : `champ` est la cle du
   * message `equipable`, `etat` celle de la fiche du personnage, `msg` celle
   * qu'on renvoie pour s'equiper. Les trois ne peuvent pas se desaccorder. */
  var CATEGORIES = [
    { champ: 'fruits',  etat: 'equipFruit',  msg: 'equipeFruit',  titre: 'Power fruit' },
    { champ: 'armes',   etat: 'equipArme',   msg: 'equipeArme',   titre: 'Weapon' },
    { champ: 'armures', etat: 'equipArmure', msg: 'equipeArmure', titre: 'Armor' },
    { champ: 'bagues',  etat: 'equipBague',  msg: 'equipeBague',  titre: 'Ring' },
  ];
  var elCoffreVoile = document.getElementById('nxCoffreVoile');
  var elCoffreCorps = elCoffreVoile ? elCoffreVoile.querySelector('.nxcf-corps') : null;
  var elCoffreNb = elCoffreVoile ? elCoffreVoile.querySelector('.nxcf-nb') : null;
  var elCoffreFleches = elCoffreVoile ? elCoffreVoile.querySelector('.nxcf-fleches') : null;

  /* ---- LE COMPTE, EN HAUT ----
   * Chaque role du coffre compte autre chose — des pieces, des personnages,
   * des fioles — mais la question du joueur est toujours la meme : combien
   * j'en ai. Un seul endroit repond, avec le mot qui va avec. */
  function compteCoffre(n, mot) {
    if (!elCoffreNb) return;
    if (!n) { elCoffreNb.hidden = true; elCoffreNb.textContent = ''; return; }
    elCoffreNb.hidden = false;
    elCoffreNb.textContent = n + ' ' + mot + (n > 1 ? 's' : '');
  }

  /* ---- LES FLECHES A LA PLACE DE LA BARRE ----
   *
   * Elles ne se montrent QUE s'il y a quelque chose sous le bord. Deux
   * fleches grises en permanence au-dessus d'un coffre de trois pieces, ce
   * serait deux boutons qui ne font rien — le joueur apprendrait a ne plus
   * les regarder, et elles ne serviraient plus le jour ou elles servent.
   *
   * La marge d'un pixel absorbe les hauteurs fractionnaires : sans elle, un
   * corps de 400,5 px sur 400 px allumerait les fleches pour un demi-pixel. */
  function majFlechesCoffre() {
    if (!elCoffreCorps || !elCoffreFleches) return;
    var trop = elCoffreCorps.scrollHeight - elCoffreCorps.clientHeight;
    if (trop <= 1) { elCoffreFleches.hidden = true; return; }
    elCoffreFleches.hidden = false;
    var y = elCoffreCorps.scrollTop;
    Array.prototype.forEach.call(elCoffreFleches.querySelectorAll('.nxcf-fl'), function (b) {
      var vers = Number(b.getAttribute('data-fl'));
      b.disabled = vers < 0 ? y <= 1 : y >= trop - 1;
    });
  }
  if (elCoffreCorps && elCoffreFleches) {
    elCoffreCorps.addEventListener('scroll', majFlechesCoffre);
    window.addEventListener('resize', majFlechesCoffre);
    Array.prototype.forEach.call(elCoffreFleches.querySelectorAll('.nxcf-fl'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        clic(true);
        /* Un peu moins d'une hauteur d'ecran : la derniere ligne lue reste
           visible en haut apres le saut, sinon on ne sait plus ou on en est. */
        var pas = Math.max(120, Math.round(elCoffreCorps.clientHeight * 0.8));
        elCoffreCorps.scrollTop += pas * Number(b.getAttribute('data-fl'));
        majFlechesCoffre();
      });
    });
  }

  var coffreRole = 'objets';
  function ouvreCoffreMenu(role) {
    if (!elCoffreVoile) return;
    coffreOuvert = true;
    coffreRole = role || 'objets';
    if (coffreRole === 'skins') { if (enLigne) envoie({ type: 'skins' }); }
    else if (!COFFRE && enLigne) envoie({ type: 'equipable' });
    peintCoffreMenu();
    elCoffreVoile.classList.add('on');
  }
  function fermeCoffreMenu(parLaMain) {
    coffreOuvert = false;
    /* Fermer a la main marque CE coffre : tant qu'on ne s'en ecarte pas, il
       ne se rouvre plus. Une fermeture automatique (on sort de la salle) ne
       marque rien — il n'y a plus de coffre a retenir. */
    if (parLaMain) coffreFerme = coffreSous;
    if (elCoffreVoile) elCoffreVoile.classList.remove('on');
  }
  var coffreSous = null;      // le coffre sur lequel on se tient
  if (elCoffreVoile) {
    elCoffreVoile.addEventListener('click', function (e) {
      var c = e.target.classList;
      if (e.target === elCoffreVoile || (c && c.contains('nxcf-x'))) fermeCoffreMenu(true);
    });
  }

  /* ==================== LE CLASSEMENT DU MONDE ====================
   *
   * Les personnages VIVANTS, a l'XP. Le niveau plafonne a vingt, et apres ?
   * On continuait de tuer pour du butin, et c'est tout.
   *
   * On classe le PERSONNAGE, pas le compte : « tu meurs, tu perds tout » n'est
   * vrai que si le rang tombe avec lui. Et la ligne montre CE QU'IL PORTE —
   * etre en haut doit faire de vous une cible, ce qu'un nom seul ne dit pas.
   */
  var elRangVoile = document.getElementById('nxRangVoile');
  var elRangCorps = document.getElementById('nxRangCorps');
  var elRangSous = document.getElementById('nxRangSous');
  var RANG = null, rangOuvert = false, rangChrono = 0;
  function ouvreRang() {
    if (!elRangVoile) return;
    rangOuvert = true;
    if (enLigne) { envoie({ type: 'leaderboardMonde', n: 20 }); rangChrono = 0; }
    peintRang();
    elRangVoile.classList.add('on');
  }
  function fermeRang() {
    rangOuvert = false;
    if (elRangVoile) elRangVoile.classList.remove('on');
  }
  if (elRangVoile) {
    elRangVoile.addEventListener('click', function (e) {
      var c = e.target.classList;
      if (e.target === elRangVoile || (c && c.contains('nxcf-x'))) fermeRang();
    });
  }
  var elRangBtn = document.getElementById('nxRang');
  if (elRangBtn) elRangBtn.addEventListener('click', function () {
    if (rangOuvert) fermeRang(); else ouvreRang();
  });

  function ligneDeRang(r, mien) {
    /* La meme vignette que le panneau : `img/skins/skin_<nom>.webp`. On la
       fabrique plutot que de la faire voyager avec chaque ligne — vingt
       lignes, ce serait vingt fois la meme adresse dans le message. */
    var v = PERSONNAGES[r.skin] ? 'img/skins/skin_' + encodeURIComponent(r.skin) + '.webp' : '';
    /* Ce qu'il porte, en quatre pastilles de couleur : de quoi lire d'un coup
       d'oeil qu'il y a une mythique en face, sans lire quatre noms. Le detail
       est dans l'infobulle — on la survole quand on veut savoir laquelle. */
    var t = (r.tenue || []).map(function (o) {
      return '<i style="background:' + (o.couleur || '#8DA0C4') + '" title="' +
             ech(o.nom + ' — ' + o.rarete) + '"></i>';
    }).join('');
    return '<div class="nxrg-l' + (mien ? ' moi' : '') + '">' +
      '<b class="nxrg-r">' + r.rang + '</b>' +
      (v ? '<img class="nxrg-v" alt="" src="' + v + '" onerror="this.style.visibility=\'hidden\'">' : '<i class="nxrg-v"></i>') +
      '<span class="nxrg-q">' +
        '<b class="nxrg-n">' + ech(r.name || (r.address || '').slice(0, 10)) +
        /* ---- COMBIEN DE STATS IL A POUSSEES AU BOUT ----
         * Le niveau dit combien il a joue, ce chiffre dit combien il a
         * INVESTI : deux personnages de niveau vingt ne se valent pas si
         * l'un a bu vingt fioles et l'autre aucune, et rien sur la ligne ne
         * le montrait. Le compte vient du serveur — c'est lui qui sait ce
         * qu'est une stat pleine, et la fiche du joueur jaunit les memes.
         * A zero, on n'affiche rien : « 0/8 » sur toutes les lignes du
         * tableau serait une colonne de zeros qu'on apprend a ne plus lire. */
        (r.pleines && r.pleines.n > 0
          ? ' <u class="nxrg-max' + (r.pleines.n >= r.pleines.total ? ' plein' : '') +
            '" title="' + r.pleines.n + ' of ' + r.pleines.total +
            ' stats maxed out for good">' + r.pleines.n + '/' + r.pleines.total + '</u>'
          : '') + '</b>' +
        '<em class="nxrg-x">Lvl ' + r.niveau + ' &middot; ' + r.skin +
          ' &middot; ' + (r.xp || 0).toLocaleString('en-US') + ' XP</em>' +
      '</span>' +
      (t ? '<span class="nxrg-t">' + t + '</span>' : '') +
      '</div>';
  }

  function peintRang() {
    if (!elRangCorps) return;
    if (!RANG) {
      elRangCorps.innerHTML = '<div class="nxrg-vide">Loading&hellip;</div>';
      return;
    }
    var moi = {};
    (RANG.moi || []).forEach(function (r) { moi[r.address + '/' + r.skin] = true; });
    var html = (RANG.top || []).map(function (r) {
      return ligneDeRang(r, moi[r.address + '/' + r.skin]);
    }).join('');
    /* Si l'on n'est PAS dans le tableau montre, sa propre ligne part quand
       meme, en dessous : un classement ou l'on ne se trouve pas ne sert a
       personne. */
    var dedans = {};
    (RANG.top || []).forEach(function (r) { dedans[r.address + '/' + r.skin] = true; });
    var dehors = (RANG.moi || []).filter(function (r) { return !dedans[r.address + '/' + r.skin]; });
    if (dehors.length) {
      html += '<div class="nxrg-vide">&middot; &middot; &middot;</div>' +
              dehors.map(function (r) { return ligneDeRang(r, true); }).join('');
    }
    elRangCorps.innerHTML = html ||
      '<div class="nxrg-vide">Nobody has earned XP yet. Be the first.</div>';
    if (elRangSous) {
      var pr = RANG.prochain;
      elRangSous.innerHTML = 'The living, by XP &mdash; die and you drop off the board.' +
        (pr ? '<br><b style="color:#ffd447">&#127942; ' + pr.total.toLocaleString('en-US') +
              ' gold</b> shared between the top ' + (RANG.parts || []).length +
              ' every month &middot; ' + RANG.vivants + ' alive' : '');
    }
  }

  function peintCoffreMenu() {
    if (!elCoffreCorps) return;
    var titre = elCoffreVoile.querySelector('.nxcf-titre');
    var sous = elCoffreVoile.querySelector('.nxcf-sous');
    /* ---- LE COFFRE AUX PERSONNAGES ----
       On CHANGE de personnage, on n'en achete pas ici : la boutique est a
       l'autre bout du Nexus et c'est sa place. Celui qu'on ne possede pas
       s'affiche quand meme, grise — savoir ce qui existe fait partie de ce
       qu'un coffre montre. */
    if (coffreRole === 'skins') {
      if (titre) titre.innerHTML = '\uD83C\uDFAD Your characters';
      if (sous) sous.textContent = 'Tap one to play it. Buy new ones at the shop.';
      var liste = SKINS_C || [];
      elCoffreCorps.innerHTML = liste.length
        ? '<div class="nxcf-l">' + liste.map(function (k) {
            var a = k.id === PERSO;
            return '<button type="button" class="nxcf-i' + (a ? ' actif' : '') +
              '" data-perso="' + ech(k.id) + '"' + (k.possede ? '' : ' disabled') +
              ' style="--c:' + ech(k.couleur || '#8DA0C4') + '"' +
              ' title="' + ech(k.nom + ' — ' + (k.pouvoir || '')) + '">' +
              '<img alt="" src="img/skins/skin_' + encodeURIComponent(k.id) +
              '.webp" onerror="this.remove()">' +
              '<span><b>' + ech(k.nom) + '</b><em>' +
              (k.possede ? (a ? 'playing' : 'ready') : 'not owned') + '</em></span>' +
              (a ? '<u>worn</u>' : '') + '</button>';
          }).join('') + '</div>'
        : '<div class="nxcf-vide">Loading your characters…</div>';
      Array.prototype.forEach.call(elCoffreCorps.querySelectorAll('[data-perso]'), function (b) {
        b.addEventListener('click', function () {
          if (b.disabled || b.classList.contains('actif')) return;
          clic(true);
          envoie({ type: 'skinChoisi', id: b.getAttribute('data-perso') });
        });
      });
      compteCoffre(liste.filter(function (k) { return k.possede; }).length, 'character');
      majFlechesCoffre();
      return;
    }
    /* ---- LE COFFRE AUX FIOLES ----
     * Ce qu'on y range survit a la mort du personnage. C'est la seule chose,
     * avec le coffre aux pieces, qui y survive — et donc le seul endroit ou
     * une potion trouvee peut attendre le personnage suivant. */
    if (coffreRole === 'fioles') {
      if (titre) titre.innerHTML = '\uD83E\uDDEA Stat potions';
      if (sous) sous.textContent =
        'Stored here, they survive your death. Carried in your backpack, they do not.';
      var f = FIOLES_C || [];
      var aBoire = f.filter(function (x) { return x.coffre > 0 || x.sac > 0; });
      elCoffreCorps.innerHTML = aBoire.length
        ? '<div class="nxcf-l">' + aBoire.map(function (x) {
            var pas = x.pas || 1;
            return '<div class="nxcf-i" style="--c:#EAF2FF">' +
              '<u class="fiole" style="background-position:' +
                colonneFiole(x) + '% 0"></u>' +
              '<span><b>+' + pas + ' ' + ech(x.cle.toUpperCase()) + '</b>' +
              '<em>' + x.coffre + ' stored &middot; ' + x.sac + ' carried</em></span>' +
              (x.sac > 0 ? '<button type="button" class="nxcf-act" data-range="' + ech(x.cle) +
                           '" title="Store it — safe from death">&uarr;</button>' : '') +
              (x.coffre > 0 ? '<button type="button" class="nxcf-act" data-sort="' + ech(x.cle) +
                           '" title="Take one out">&darr;</button>' : '') +
              '<button type="button" class="nxcf-act boire" data-boit="' + ech(x.cle) +
                '" title="Drink it — permanent, and lost when this character dies">Drink</button>' +
              '</div>';
          }).join('') + '</div>'
        : '<div class="nxcf-vide">No stat potions yet. They drop in the wild — walk over a bag to pick them up.</div>';
      Array.prototype.forEach.call(elCoffreCorps.querySelectorAll('[data-range],[data-sort],[data-boit]'), function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          clic(true);
          if (b.hasAttribute('data-range')) envoie({ type: 'fioleRange', stat: b.getAttribute('data-range') });
          else if (b.hasAttribute('data-sort')) envoie({ type: 'fioleSort', stat: b.getAttribute('data-sort') });
          else envoie({ type: 'fioleBoit', skin: PERSO, stat: b.getAttribute('data-boit') });
        });
      });
      if (coffreErreur) {
        elCoffreCorps.insertAdjacentHTML('afterbegin',
          '<div class="nxcf-refus">' + ech(coffreErreur) + '</div>');
      }
      /* Rangees ET portees : le joueur en possede autant dans les deux cas,
         c'est l'endroit qui change, pas le nombre. */
      compteCoffre(aBoire.reduce(function (n, x) {
        return n + (x.coffre || 0) + (x.sac || 0);
      }, 0), 'potion');
      majFlechesCoffre();
      return;
    }
    if (titre) titre.innerHTML = '\uD83E\uDDFA Your vault';
    if (sous) sous.textContent = 'Everything you bought from the shop. Tap an item to wear it.';
    if (!COFFRE) {
      elCoffreCorps.innerHTML = '<div class="nxcf-vide">Opening your vault…</div>';
      compteCoffre(0); majFlechesCoffre(); return;
    }
    /* Un refus du serveur — « celle-la, tu la portes » — doit se lire. Sans
       ca le joueur tape le bouton et rien ne bouge, ce qui se lit comme une
       panne plutot que comme une regle. */
    var html = coffreErreur
      ? '<div class="nxcf-refus">' + ech(coffreErreur) + '</div>' : '';
    var total = 0, exemplaires = 0;
    CATEGORIES.forEach(function (cat) {
      var liste = (COFFRE[cat.champ] || []).slice();
      total += liste.length;
      /* Le compte affiche des OBJETS, pas des lignes : trois anneaux
         identiques tiennent sur une ligne mais restent trois anneaux, et
         c'est ce chiffre-la que le joueur compare a ce qu'il a achete. */
      liste.forEach(function (o) { exemplaires += Math.max(1, Number(o.quantite) || 1); });
      if (!liste.length) return;
      /* ---- LES NUMEROTEES D'ABORD ----
       * Le coffre melange ce qu'on a paye et ce qu'on a ramasse puis range.
       * Ce qui coute de l'argent reel se cherche en premier : le mettre en
       * tete evite de faire defiler quinze trouvailles pour retrouver son
       * epee. A egalite, la plus rare devant — c'est l'ordre dans lequel on
       * regarde de toute facon. */
      liste.sort(function (a, b) {
        if (!!a.og !== !!b.og) return a.og ? -1 : 1;
        var d = forceDe(b) - forceDe(a);
        if (d) return d;
        return String(a.nom || '').localeCompare(String(b.nom || ''));
      });
      var porte = FICHE && FICHE[cat.etat];
      html += '<div class="nxcf-grp"><i>' + cat.titre + '</i><div class="nxcf-l">';
      liste.forEach(function (o) {
        var actif = !!(porte && porte.item === o.id);
        html += '<button type="button" class="nxcf-i' + (actif ? ' actif' : '') +
          '" data-msg="' + cat.msg + '" data-item="' + o.id + '"' +
          ' style="--c:' + ech(o.couleur || '#8DA0C4') + '"' +
          ' title="' + ech(o.nom + ' — ' + (detailBonus(o) || 'no bonus')) + '">' +
          '<img alt="" src="img/shop/' + encodeURIComponent(o.cle) + '.webp" onerror="this.remove()">' +
          '<span><b>' + ech(o.nom) + '</b><em>' + ech(detailBonus(o) || '—') + '</em></span>' +
          (o.og ? '<b class="nxcf-og">OG</b>' : '') +
          (actif ? '<u>worn</u>'
                 : '<u>' + (o.quantite > 1 ? 'x' + o.quantite : '') +
                   '<b class="nxcf-sortir" data-sortir="' + o.id +
                   '" title="Take it out — it will be lost if you die">&darr;</b></u>') +
          '</button>';
      });
      html += '</div></div>';
    });
    /* ---- LE SAC, A COTE DU COFFRE ----
     *
     * Le sac ne se voyait que dans le panneau lateral, que le menu recouvre
     * sur telephone : on ne pouvait donc pas savoir ce qu'on transportait au
     * moment meme ou l'on range. Il est ici, sous le coffre, avec le geste
     * qui va avec.
     *
     * C'est le SEUL endroit du jeu ou passer de l'un a l'autre est possible,
     * et c'est voulu : le sac part avec le personnage s'il meurt, le coffre
     * survit. Ranger est donc le geste qui met a l'abri, et il doit demander
     * de revenir ici — sinon la mort ne couterait plus rien. */
    var sac = SAC || [];
    html += '<div class="nxcf-grp nxcf-sac"><i>Backpack &mdash; ' + sac.length +
            '/8 slots &middot; lost if you die</i>';
    if (!sac.length) {
      html += '<div class="nxcf-vide">Empty. Loot you pick up in the world lands here — ' +
              'store it in the vault to keep it for good.</div>';
    } else {
      html += '<div class="nxcf-l">' + sac.map(function (o) {
        /* Deux exemplaires identiques sont DEUX boutons : le sac compte des
           places, pas des lignes. */
        return '<button type="button" class="nxcf-i" data-range="' + o.id +
          '" data-sac="' + o.id + '" data-place="' + o.place + '"' +
          ' style="--c:' + ech(o.couleur || '#8DA0C4') + '"' +
          ' title="' + ech(o.nom + ' — store in the vault') + '">' +
          '<img alt="" src="img/shop/' + encodeURIComponent(o.cle) + '.webp" onerror="this.remove()">' +
          '<span><b>' + ech(o.nom) + '</b><em>' + ech(detailBonus(o) || '—') + '</em></span>' +
          '<u>store &rarr;</u>' +
          '</button>';
      }).join('') + '</div>';
    }
    html += '</div>';

    elCoffreCorps.innerHTML = total ? html
      : '<div class="nxcf-vide">Your vault is empty. Chests bought at the shop drop their items straight in here.</div>' + html;
    compteCoffre(exemplaires, 'item');
    majFlechesCoffre();
    /* Un clic equipe TOUT DE SUITE : le geste EST la confirmation. Retaper la
       piece deja portee la retire — sinon on ne pourrait jamais rien enlever,
       et il faudrait un second bouton sur chaque ligne. */
    Array.prototype.forEach.call(elCoffreCorps.querySelectorAll('.nxcf-i'), function (b) {
      b.addEventListener('click', function () {
        var range = b.getAttribute('data-range');
        if (range) { envoie({ type: 'rangeCoffre', item: Number(range) }); return; }
        var deja = b.classList.contains('actif');
        envoie({ type: b.getAttribute('data-msg'), skin: PERSO,
                 item: deja ? null : Number(b.getAttribute('data-item')) });
      });
    });
    /* Reprendre : le petit bouton du coin, sur les pieces du coffre. Il ne
       s'affiche pas sur celle qu'on PORTE — la sortir desequiperait le
       personnage tout seul, et le serveur la refuserait de toute facon. */
    Array.prototype.forEach.call(elCoffreCorps.querySelectorAll('.nxcf-sortir'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        envoie({ type: 'sortCoffre', item: Number(b.getAttribute('data-sortir')) });
      });
    });
  }

  function entreCoffre() {
    // si le coffre n'est pas encore arrive, on le redemande en entrant
    if (!COFFRE && enLigne) envoie({ type: 'equipable' });
    RETOUR = { x: joueur.x, y: joueur.y };
    SCENE = 'coffre';
    /* On arrive au MILIEU de la piece, pas sur la sortie. La version
       precedente posait le joueur a quarante unites du seuil, dont le rayon
       en fait soixante-dix : il apparaissait DEDANS et ressortait aussitot.
       Un delai de grace masquait le probleme au lieu de le resoudre — il
       suffisait de ne pas bouger pour etre ejecte. */
    joueur.x = (SALLE.x0 + SALLE.x1) / 2;
    joueur.y = (SALLE.y0 + SALLE.y1) / 2 + 70;
    joueur.dir = 'down';
    LIEUX.forEach(function (l) { l.dwell = 0; });
    /* Ceinture ET bretelles : le portail ne mord qu'apres qu'on s'en soit
       ecarte une fois. Meme pose dessus par erreur, on ne repart pas. */
    SALLE.portailArme = false;
    fermeCoffreMenu();
    joueSample('vault', { vol: 0.85 });
  }

  function sortCoffre() {
    SCENE = 'nexus';
    fermeCoffreMenu();
    joueSample('vault', { vol: 0.85 });
    /* Le bandeau garde son dernier texte tant que le lieu proche ne CHANGE
       pas — sinon on ressort du coffre avec le nom d'un objet du coffre
       affiche par-dessus le Nexus. On le vide, et on oublie le dernier lieu
       pour que le prochain se reannonce. */
    indiceActuel = null;
    if (indiceEl) { indiceEl.classList.remove('on'); indiceEl.innerHTML = ''; }
    if (RETOUR) { joueur.x = RETOUR.x; joueur.y = RETOUR.y; }
    joueur.dir = 'down';
    // on se pose HORS du rayon de la porte, sinon on rentre aussitot
    var d = LIEUX.filter(function (l) { return l.cle === 'coffre'; })[0];
    if (d) { joueur.x = d.x; joueur.y = d.y + d.rayon + 50; }
    LIEUX.forEach(function (l) { l.dwell = 0; });
  }

  /* Les couloirs de chemin, en cercles et rectangles du MONDE — pas des
     tuiles listees une par une : a chaque case visible on demande juste
     "es-tu dans un de ces cinq morceaux ?". */
  var CLAIRIERE_R = 260;
  var COULOIRS = [
    { x0: CENTRE.x - 105, y0: CENTRE.y - 470, x1: CENTRE.x + 105, y1: CENTRE.y },
    /* Le chemin du nord s'ouvre en PLACE devant les deux portes. Sans elle,
       la porte rouge serait posee dans l'herbe a cote du chemin, et le chemin
       continuerait de ne designer que la violette : le dallage est ce qui dit
       « c'est ici qu'on va », et il doit donc mener aux deux. */
    { x0: CENTRE.x - 360, y0: CENTRE.y - 590, x1: CENTRE.x + 360, y1: CENTRE.y - 380 },
    { x0: CENTRE.x - 620, y0: CENTRE.y - 105, x1: CENTRE.x, y1: CENTRE.y + 105 },
    { x0: CENTRE.x, y0: CENTRE.y - 105, x1: CENTRE.x + 620, y1: CENTRE.y + 105 },
    /* Le chemin du sud, vers la table. Sans lui, la table serait posee dans
       l'herbe et rien ne dirait qu'on peut y aller — les trois autres
       destinations ont chacune la sienne, et c'est le chemin qui les annonce
       bien avant qu'on les voie. */
    { x0: CENTRE.x - 105, y0: CENTRE.y, x1: CENTRE.x + 105, y1: CENTRE.y + 470 },
    /* ---- L'EMBRANCHEMENT VERS LA FERME ----
     *
     * Sans dallage, Petworld serait pose dans l'herbe et rien ne dirait qu'on
     * peut y aller : c'est le chemin qui annonce une destination, bien avant
     * qu'on la voie.
     *
     * ATTENTION A LA LARGEUR. Le sol se peint par TUILE de 128, en testant le
     * CENTRE de chaque tuile. Un couloir de cent cinq unites de haut peut donc
     * ne contenir aucun centre et ne rien peindre du tout — c'est arrive ici,
     * et le chemin etait simplement invisible. Les bornes ci-dessous encadrent
     * des centres de tuiles (…, 1216, 1344, 1472, 1600, …), pas des jolis
     * chiffres ronds. */
    { x0: CENTRE.x - 105, y0: CENTRE.y + 470, x1: CENTRE.x + 105, y1: CENTRE.y + 830 },
    { x0: CENTRE.x + 105, y0: CENTRE.y + 700, x1: CENTRE.x + 940, y1: CENTRE.y + 830 },
  ];
  function estChemin(px, py) {
    var dx = px - CENTRE.x, dy = py - CENTRE.y;
    if (dx * dx + dy * dy < CLAIRIERE_R * CLAIRIERE_R) return true;
    for (var i = 0; i < COULOIRS.length; i++) {
      var c = COULOIRS[i];
      if (px >= c.x0 && px <= c.x1 && py >= c.y0 && py <= c.y1) return true;
    }
    return false;
  }

  /* ================== PETWORLD : UN ENCLOS OU L'ON MARCHE ==================
   *
   * La premiere version etait UNE image : grange, cour, barriere et animaux
   * dans le meme dessin. Elle etait belle et on ne pouvait pas y entrer — une
   * image occupe l'espace AU-DESSUS de son point d'ancrage, et quiconque se
   * serait tenu dans la cour aurait ete recouvert par elle.
   *
   * L'enclos est donc un LIEU, pas un dessin : un rectangle de terre battue,
   * une barriere posee piece par piece autour, un portail au sud, et des
   * meubles a l'interieur. Chaque piece se trie par les pieds comme le reste
   * du Nexus — on passe donc devant la barriere du bas et derriere celle du
   * haut, ce qui est exactement ce qu'on attend en y entrant.
   *
   * ---- POURQUOI LA BARRIERE ARRETE ----
   *
   * Sans collision, on traverserait la cloture partout et le portail ne
   * servirait a rien : une barriere qu'on franchit n'est plus une barriere,
   * c'est un dessin de barriere. Cinq rectangles minces — les quatre cotes,
   * le bas coupe en deux par l'ouverture — et l'on repousse par le cote le
   * plus proche. On ne peut donc entrer que par le portail.
   */
  /* ---- IL FAUT DE LA PLACE DEVANT LE PORTAIL ----
   * La premiere pose laissait cent vingt unites entre le portail et le bord
   * de la carte : on arrivait dos au vide, colle contre la borne du monde, et
   * il fallait se tortiller pour se presenter en face. Une entree doit avoir
   * un parvis, sinon elle se rate. */
  /* ---- L'ENCLOS TIENT SUR LA GRILLE DES TUILES ----
   *
   * Le sol se peint par tuile de 128, en testant le CENTRE de chaque tuile :
   * une cour dont les bords tombent au milieu d'une tuile laisse donc une
   * bande d'herbe A L'INTERIEUR de sa barriere, du cote ou le centre est
   * dehors. On voyait la terre commencer trente unites trop loin sur deux
   * cotes, et la cloture flotter dans le gazon.
   *
   * Les quatre bornes sont donc des MULTIPLES de 128. Ce ne sont pas de jolis
   * chiffres, ce sont les seuls qui font coincider la terre et la barriere. */
  var FERME = {
    x0: CENTRE.x + 512, y0: CENTRE.y + 352,
    x1: CENTRE.x + 1152, y1: CENTRE.y + 736,
    porteX: CENTRE.x + 832, porteL: 176,
  };
  /* Les pieces, a l'echelle du monde. Les rapports viennent des dessins :
     131x129 pour la lisse horizontale, 73x170 pour la verticale. On garde
     leurs proportions — une barriere ecrasee se voit tout de suite. */
  var CL = {
    h:     { src: 'img/nexus/tiles/obj_cloture_h.webp',     larg: 112, haut: 110 },
    v:     { src: 'img/nexus/tiles/obj_cloture_v.webp',     larg: 62,  haut: 145 },
    coin:  { src: 'img/nexus/tiles/obj_cloture_coin.webp',  larg: 122, haut: 128 },
    porte: { src: 'img/nexus/tiles/obj_cloture_porte.webp', larg: 166, haut: 117 },
  };
  /* Les rapports des dessins. Une piece de barriere se dessine a la taille du
     PAS, pas a une taille choisie : un pas plus grand que la piece laisse un
     trou a chaque raccord, et une barriere trouee n'arrete visiblement rien.
     C'est donc le pas qui commande, et la largeur suit le rapport. */
  var CL_RH = 131 / 129, CL_RV = 73 / 170;
  /* ---- OU EST LE POTEAU DANS LA PIECE D'ANGLE ----
   * Mesure sur le dessin : les colonnes pleines vont de 16 a 53 sur 143 de
   * large, centre a 24,1 %. L'angle doit poser SON POTEAU sur le coin de la
   * cour ; le poser au centre de la case le decalerait d'un quart de piece, et
   * c'est exactement le decalage qu'on voyait aux quatre coins. */
  var CL_COIN_POTEAU = 0.241;
  var CL_RC = 143 / 150;
  Object.keys(CL).forEach(function (k) { CL[k].img = new Image(); CL[k].img.src = CL[k].src; });
  var IMG_FERME_DECOR = new Image();
  IMG_FERME_DECOR.src = 'img/nexus/tiles/ferme_decor.webp';

  /* Les meubles de la cour. Places a la main, et ECARTES du portail : un
     abreuvoir en travers de l'entree se contourne mal quand on arrive au
     doigt. Les colonnes suivent la planche : abreuvoir, foin, niche,
     mangeoire. */
  var FERME_MEUBLES = [
    { col: 0, x: FERME.x0 + 105, y: FERME.y1 - 60,  taille: 132 },
    { col: 1, x: FERME.x1 - 105, y: FERME.y1 - 80,  taille: 140 },
    { col: 2, x: FERME.x1 - 120, y: FERME.y0 + 190, taille: 138 },
    { col: 3, x: FERME.x0 + 120, y: FERME.y0 + 215, taille: 120 },
  ];

  /* ---- LA BARRIERE, PIECE PAR PIECE ----
   * Construite UNE fois : les positions ne bougent jamais, et les recalculer
   * a chaque image reviendrait a refaire soixante divisions par tour pour
   * obtenir le meme resultat. La grange occupe le milieu du bord haut : la
   * barriere s'arrete de part et d'autre au lieu de lui passer au travers. */
  var CLOTURE = (function () {
    var out = [];
    var gauchePorte = FERME.porteX - FERME.porteL / 2;
    var droitePorte = FERME.porteX + FERME.porteL / 2;
    var grangeG = FERME.porteX - 210, grangeD = FERME.porteX + 210;
    function remplitH(x0, x1, y) {
      var n = Math.max(0, Math.round((x1 - x0) / CL.h.larg));
      if (!n) return;
      var pas = (x1 - x0) / n;
      for (var i = 0; i < n; i++) {
        out.push({ p: CL.h, x: x0 + pas * (i + 0.5), y: y,
                   larg: pas, haut: pas / CL_RH });
      }
    }
    function remplitV(y0, y1, x) {
      var n = Math.max(0, Math.round((y1 - y0) / CL.v.haut));
      if (!n) return;
      var pas = (y1 - y0) / n;
      for (var i = 0; i < n; i++) {
        out.push({ p: CL.v, x: x, y: y0 + pas * (i + 1),
                   larg: pas * CL_RV, haut: pas });
      }
    }
    remplitH(FERME.x0, grangeG, FERME.y0);
    remplitH(grangeD, FERME.x1, FERME.y0);
    remplitH(FERME.x0, gauchePorte, FERME.y1);
    remplitH(droitePorte, FERME.x1, FERME.y1);
    remplitV(FERME.y0, FERME.y1, FERME.x0);
    remplitV(FERME.y0, FERME.y1, FERME.x1);
    out.push({ p: CL.porte, x: FERME.porteX, y: FERME.y1 });

    /* ---- LES QUATRE ANGLES, EN DERNIER ----
     *
     * Une piece de lisse va d'un CENTRE de poteau au suivant : une course
     * posee bord a bord commence et finit donc sur un DEMI-poteau. C'est ce
     * qu'on voyait aux quatre coins — des montants coupes dans la longueur,
     * et un trou la ou la lisse rencontre le montant.
     *
     * L'angle est le poteau entier qui ferme les deux directions. Il vient
     * apres tout le reste dans la liste, donc par-dessus a y egal, et son
     * poteau se pose SUR le coin de la cour — pas au centre de sa case, qui
     * le decalerait d'un quart de piece. */
    var hc = (CL.h.larg > 0 ? (FERME.x1 - FERME.x0) / Math.max(1, Math.round((FERME.x1 - FERME.x0) / CL.h.larg)) : 110);
    var coinH = (hc / CL_RH) * 1.16, coinL = coinH * CL_RC;
    var dx = coinL * (0.5 - CL_COIN_POTEAU);
    [[FERME.x0, FERME.y0], [FERME.x0, FERME.y1]].forEach(function (c) {
      out.push({ p: CL.coin, x: c[0] + dx, y: c[1], larg: coinL, haut: coinH });
    });
    [[FERME.x1, FERME.y0], [FERME.x1, FERME.y1]].forEach(function (c) {
      /* A droite, la meme piece RETOURNEE : son poteau est a gauche du dessin,
         et une deuxieme planche pour la meme chose finirait par diverger. */
      out.push({ p: CL.coin, x: c[0] - dx, y: c[1], larg: coinL, haut: coinH, mir: 1 });
    });
    return out;
  })();

  /* Ce qui arrete le pas. Assez epais pour qu'on ne traverse pas en une
     image a pleine vitesse, assez mince pour ne pas voler de terrain a la
     cour. */
  var CL_EP = 24;
  var BARRIERES = (function () {
    var f = FERME, g = f.porteX - f.porteL / 2, d = f.porteX + f.porteL / 2;
    return [
      { x0: f.x0 - CL_EP, y0: f.y0 - CL_EP, x1: f.x1 + CL_EP, y1: f.y0 + CL_EP },
      { x0: f.x0 - CL_EP, y0: f.y0 - CL_EP, x1: f.x0 + CL_EP, y1: f.y1 + CL_EP },
      { x0: f.x1 - CL_EP, y0: f.y0 - CL_EP, x1: f.x1 + CL_EP, y1: f.y1 + CL_EP },
      { x0: f.x0 - CL_EP, y0: f.y1 - CL_EP, x1: g,            y1: f.y1 + CL_EP },
      { x0: d,            y0: f.y1 - CL_EP, x1: f.x1 + CL_EP, y1: f.y1 + CL_EP },
    ];
  })();

  /** Le sol sous un point : la terre de l'enclos, le dallage, ou l'herbe. */
  function solEn(px, py) {
    if (px >= FERME.x0 && px <= FERME.x1 && py >= FERME.y0 && py <= FERME.y1) return TUILES.ferme;
    return estChemin(px, py) ? TUILES.chemin : TUILES.herbe;
  }

  // ------------------------------------------------------- le joueur

  var joueur = { x: CENTRE.x, y: CENTRE.y + 300, vx: 0, vy: 0, dir: 'down', anim: 'idle', cadre: 0, chrono: 0 };
  /* ---- LA VITESSE VIENT DU SERVEUR ----
   * Elle etait la meme pour tout le monde, et la statistique de VITESSE ne
   * servait donc a rien : elle montait avec les niveaux, se payait en
   * equipement, et ne changeait pas d'un pixel la facon de se deplacer.
   *
   * Le serveur la calcule maintenant a partir de la statistique et l'envoie
   * avec chaque image du monde. La page ne la recalcule PAS de son cote :
   * deux formules a tenir d'accord finiraient par se contredire, et le joueur
   * se ferait ramener en arriere sans comprendre pourquoi — c'est le serveur
   * qui borne, c'est donc lui qui a raison.
   *
   * 260 reste la valeur de depart, celle du Nexus ou l'on ne combat pas et ou
   * personne n'a besoin de savoir. */
  var VITESSE = 260;               // unites/s, remplacee par celle du serveur
  var FPS_ANIM = 14;

  var saut = { en_cours: false, chrono: 0, cadre: 0, duree: 0 };

  /** Avance le cadre d'anim d'une fiche (le joueur local ou un joueur
      distant) — la meme horloge pour tout le monde, le personnage change
      juste le nombre total de cadres a boucler. */
  function avanceCadre(fiche, cle, dt) {
    var total = PERSONNAGES[cle] ? PERSONNAGES[cle].images : 1;
    fiche.chrono += dt;
    if (fiche.chrono >= 1 / FPS_ANIM) {
      fiche.chrono = 0;
      fiche.cadre = (fiche.cadre + 1) % total;
    }
  }

  // ------------------------------------------------------- les autres joueurs
  //
  // Un instantane COMPLET arrive plusieurs fois par seconde — pas un message
  // par arrivee ou par depart. On fusionne donc a chaque fois avec ce qu'on
  // avait deja : une fiche connue garde son cadre d'animation et sa position
  // AFFICHEE (`rx`/`ry`), qu'on glisse ensuite vers la position RECUE
  // (`x`/`y`) plutot que d'y sauter — sinon chaque instantane ferait un petit
  // bond au lieu d'un mouvement continu. Une fiche absente du dernier
  // instantane est simplement supprimee : c'est ainsi qu'un depart se voit,
  // sans le moindre message dedie.
  var DISTANTS = {};                 // { addr: {x,y,rx,ry,dir,anim,skin,nom,cadre,chrono} }
  var signatureGens = '';
  function majJoueursDistants(liste) {
    var vus = {};
    liste.forEach(function (j) {
      if (!j || !j.addr || j.addr === MON_ADRESSE) return;
      vus[j.addr] = true;
      var d = DISTANTS[j.addr];
      if (!d) d = DISTANTS[j.addr] = { x: j.x, y: j.y, rx: j.x, ry: j.y, cadre: 0, chrono: 0 };
      d.x = j.x; d.y = j.y; d.dir = j.dir; d.anim = j.anim; d.skin = j.skin; d.nom = j.nom;
      assureCharge(j.skin);
    });
    Object.keys(DISTANTS).forEach(function (a) { if (!vus[a]) delete DISTANTS[a]; });

    /* On ne repeint la liste que si sa COMPOSITION a change. Un instantane
       arrive sept fois par seconde ; refabriquer le HTML a chaque fois pour
       les memes noms ferait clignoter la liste et travailler le navigateur
       pour rien — la position, elle, se rejoue sur le canvas, pas ici. */
    var sig = Object.keys(DISTANTS).sort().map(function (a) {
      return a + ':' + DISTANTS[a].skin + ':' + (DISTANTS[a].nom || '');
    }).join('|');
    if (sig !== signatureGens) { signatureGens = sig; peintGens(); }
  }

  // ------------------------------------------------------- le bruit de pas
  //
  // Une seule boucle, posee et retiree selon qu'on avance ou non — pas un
  // coup par cadre d'animation, qui aurait demande de decouper le fichier en
  // un pas exact par cadre. `debloque()` lance puis coupe aussitot le son au
  // tout PREMIER geste (touche ou pave) : c'est le geste qui autorise le
  // navigateur a jouer du son sur cette page, et sans cet appel fait DANS le
  // geste, le tout premier `play()` reel — lui, lance depuis la boucle de
  // jeu — risquerait d'etre refuse.
  var pas = new Audio('img/nexus/pas.mp3');
  /* 0.135 = 0.45 baisse de 70 % : le pas doit se sentir sous le reste, pas
     se faire entendre par-dessus. */
  pas.loop = true; pas.volume = 0.135; pas.preload = 'auto';
  var debloque = false;
  function debloqueSon() {
    if (debloque) return;
    debloque = true;
    pas.play().then(function () { pas.pause(); pas.currentTime = 0; }).catch(function () {});
    contexteSon();   // meme geste, meme autorisation : le tir aussi doit sonner
  }

  /* ================== LE SON DES TIRS ==================
   *
   * SYNTHETISE, pas enregistre. Sept armes voudraient sept fichiers, plus un
   * pour l'impact ; a la cadence des dagues (quatre coups par seconde) on
   * jonglerait avec des lectures qui se chevauchent et se coupent. Web Audio
   * fabrique chaque coup a la demande, sans un octet a telecharger, et donne
   * a chaque coup une hauteur legerement differente — sans quoi un tir
   * repete sonne comme une machine, pas comme une arme.
   *
   * Trois recettes suffisent a couvrir les sept familles :
   *   souffle — du bruit filtre dont la bande DESCEND : une lame qui fend
   *             l'air. Court et clair pour la dague, long et grave pour la
   *             hache.
   *   corde   — un oscillateur qui chute vite : la corde de l'arc.
   *   choc    — une sinusoide grave qui s'effondre : le marteau, le poing.
   *
   * Le contexte n'est cree qu'au premier geste du joueur. Un AudioContext
   * fabrique avant reste « suspended » sur tous les navigateurs recents, et
   * on n'entendrait rien sans jamais savoir pourquoi. */
  var AUDIO = null, BRUIT = null, SORTIE_TIR = null;
  function contexteSon() {
    if (AUDIO) { if (AUDIO.state === 'suspended') AUDIO.resume(); return AUDIO; }
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { AUDIO = new C(); } catch (e) { return null; }
    /* UN seul tampon de bruit, fabrique une fois. En refaire un par coup
       allouerait vingt mille echantillons quatre fois par seconde. */
    var n = Math.floor(AUDIO.sampleRate * 0.4);
    BRUIT = AUDIO.createBuffer(1, n, AUDIO.sampleRate);
    var d = BRUIT.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    SORTIE_TIR = AUDIO.createGain();
    SORTIE_TIR.gain.value = 0.55;
    SORTIE_TIR.connect(AUDIO.destination);
    chargeSamples();
    return AUDIO;
  }

  /* ---- LES SONS ENREGISTRES ----
   *
   * La premiere version SYNTHETISAIT tout : trois recettes, sept armes, zero
   * fichier a telecharger. C'etait defendable tant qu'on n'avait rien ; on a
   * maintenant de vrais enregistrements, et un vrai son bat une imitation.
   *
   * Ils sont decodes UNE fois en memoire, puis rejoues depuis ce tampon. Un
   * <audio> par coup ne tiendrait pas la cadence des dagues — quatre par
   * seconde — parce qu'une lecture relancee se coupe elle-meme ; ici chaque
   * coup a sa propre source et ils se superposent proprement. */
  var SAMPLES = {};
  var A_CHARGER = {
    tir:   'img/nexus/tir.mp3',
    vault: 'img/nexus/vault.mp3',
    clic:  'img/nexus/clic_souris.mp3',
    clic2: 'img/nexus/clic_effet.mp3',
    /* Ces deux-la n'ont encore rien pour les declencher : aucun monstre n'est
       dessine cote client. Ils sont charges d'avance parce que le monde de
       combat est la prochaine chose branchee, et qu'un son qui arrive une
       seconde apres le coup ne sert a rien. */
    degat: 'img/nexus/degat.mp3',
    /* DEUX cris de mort, tires au hasard. Un monstre qui meurt toujours de
       la meme facon devient une machine au bout de dix ; deux suffisent a
       casser la repetition sans qu'on entende la boucle. */
    mort:  'img/nexus/mort.mp3',
    mort2: 'img/nexus/mort2.mp3',
    niveau: 'img/nexus/niveau.mp3',
  };
  /* ---- CHARGEMENT PAR GROUPES ----
   * Tout ce qu'on ecoute n'interesse pas tout le monde : les cinquante
   * kilo-octets de la table de blackjack n'ont aucune raison de partir chez
   * qui traverse le Nexus sans s'asseoir. La fonction prend donc un LOT, et
   * le Nexus ne charge le sien qu'au premier geste ; la table demande le sien
   * quand on ouvre le panneau. */
  function chargeSamples(lot) {
    if (!AUDIO) return;
    var L = lot || A_CHARGER;
    Object.keys(L).forEach(function (nom) {
      if (nom in SAMPLES) return;
      SAMPLES[nom] = null;                    // en cours : on ne redemande pas
      fetch(L[nom])
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (b) {
          return new Promise(function (res, rej) {
            /* Deux formes d'API : la moderne rend une promesse, l'ancienne
               (Safari) prend deux fonctions. On accepte les deux. */
            var p = AUDIO.decodeAudioData(b, res, rej);
            if (p && p.then) p.then(res, rej);
          });
        })
        .then(function (buf) { SAMPLES[nom] = buf; })
        .catch(function () { SAMPLES[nom] = null; });
    });
  }

  /**
   * Joue un echantillon. `hauteur` multiplie la vitesse de lecture : c'est ce
   * qui donne au marteau une voix plus grave qu'aux dagues sans exiger sept
   * fichiers. `duree` coupe la queue — le son de tir dure une seconde et
   * demie, et a quatre coups par seconde on empilerait six copies qui se
   * changeraient en bouillie.
   */
  function joueSample(nom, opts) {
    var ctx = AUDIO;
    if (!ctx || ctx.state !== 'running') return false;
    var buf = SAMPLES[nom];
    if (!buf) return false;
    opts = opts || {};
    var t0 = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.25, Math.min(4, opts.hauteur || 1));
    var g = ctx.createGain();
    var vol = opts.vol === undefined ? 1 : opts.vol;
    g.gain.setValueAtTime(vol, t0);
    var duree = buf.duration / src.playbackRate.value;
    if (opts.duree && opts.duree < duree) {
      /* Une coupure NETTE claquerait. Quatre-vingts millisecondes de descente
         s'entendent comme une fin, pas comme un couac. */
      var fin = Math.max(0.06, opts.duree);
      g.gain.setValueAtTime(vol, t0 + Math.max(0.01, fin - 0.08));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + fin);
      duree = fin;
    }
    src.connect(g); g.connect(SORTIE_TIR);
    src.start(t0);
    src.stop(t0 + duree + 0.03);
    return true;
  }

  /* La VOIX de chaque arme : une hauteur et un volume, sur le meme
     enregistrement. Le marteau parle grave et fort, les dagues aigu et court.
     Chaque famille garde son caractere sans sept prises de son. */
  var VOIX_ARME = {
    lame:    { hauteur: 1.15, vol: 0.85 },
    hache:   { hauteur: 0.82, vol: 1.00 },
    lance:   { hauteur: 1.05, vol: 0.85 },
    arc:     { hauteur: 1.30, vol: 0.75 },
    marteau: { hauteur: 0.68, vol: 1.00 },
    dagues:  { hauteur: 1.55, vol: 0.65 },
    poing:   { hauteur: 1.00, vol: 0.55 },
  };

  function joueSon(famille) {
    var v = VOIX_ARME[famille] || VOIX_ARME.poing;
    var a = ARMES[famille] || ARMES.poing;
    /* +/- 5 % d'une fois a l'autre : deux coups identiques a la milliseconde
       pres sonnent comme une machine, pas comme une arme. */
    var h = v.hauteur * (1 + (Math.random() - 0.5) * 0.1);
    /* ---- LE TIR, BAISSE DE 70 % ----
     * Il couvrait tout le reste — les pas, l'impact, l'or qui tombe — et a
     * quatre coups par seconde il devenait fatigant. Un bruit qu'on entend
     * cent fois par minute doit se tenir SOUS le reste, pas devant. */
    return joueSample('tir', { hauteur: h, vol: v.vol * 0.3, duree: 1.35 / a.cadence });
  }

  /** Un clic d'interface. Deux sons : le leger pour naviguer, le plein pour
      un geste qui ENGAGE — acheter, s'equiper, ranger. */
  function clic(fort) {
    joueSample(fort ? 'clic2' : 'clic', { vol: fort ? 0.7 : 0.5, duree: 0.35 });
  }

  /* L'impact : le meme choc, plus court et bien plus discret. Il part a
     chaque projectile qui s'arrete, et il y en a plus que de coups tires. */
  /* Le choc sur la PIERRE reste synthetise : on n'a pas d'enregistrement pour
     ca, et emprunter celui du monstre blesse serait faux — un projectile qui
     s'ecrase sur une fontaine ne crie pas. */
  function enveloppeGain(t0, duree, vol) {
    var g = AUDIO.createGain();
    /* Attaque de 6 ms : instantanee a l'oreille, mais pas nulle — un saut sec
       de zero a plein fait un « clic » parasite sur les petits haut-parleurs. */
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duree);
    return g;
  }

  function sonImpact() {
    if (!AUDIO || AUDIO.state !== 'running') return;
    var t0 = AUDIO.currentTime, h = 1 + (Math.random() - 0.5) * 0.3;
    var g = enveloppeGain(t0, 0.12, 0.16);
    g.connect(SORTIE_TIR);
    var src = AUDIO.createBufferSource(); src.buffer = BRUIT;
    var f = AUDIO.createBiquadFilter(); f.type = 'bandpass';
    f.Q.value = 1.0; f.frequency.setValueAtTime(1200 * h, t0);
    f.frequency.exponentialRampToValueAtTime(320 * h, t0 + 0.12);
    src.connect(f); f.connect(g);
    src.start(t0); src.stop(t0 + 0.14);
  }

  // ------------------------------------------------------- les commandes
  //
  // Les fleches marchent TOUJOURS, quoi qu'on reassigne — un repli qui ne
  // peut jamais se perdre en bricolant les reglages. Le reste (par defaut
  // WASD + espace) se reassigne depuis la roue dentee, et se garde d'une
  // visite a l'autre dans le navigateur.

  var TOUCHES = { up: false, down: false, left: false, right: false };
  var CLE_STOCKAGE = 'swogeNexusTouches';
  /* ---- LA BARRE D'ESPACE CHANGE DE METIER ----
   * Elle lancait le saut, une animation decorative du Nexus. Elle lance
   * maintenant le POUVOIR du fruit, qui coute du mana et decide d'un combat.
   * Le saut recule sur F : entre une figure et une attaque speciale, c'est
   * l'attaque qui merite la touche que tout le monde trouve sans chercher. */
  /* ---- ET LES POTIONS PRENNENT DEUX TOUCHES ----
   * Elles ne se buvaient qu'en TAPANT le panneau. En combat, on ne quitte pas
   * son personnage des yeux pour viser un bouton de trente pixels dans un
   * coin — et sur telephone le panneau est replie pendant qu'on se bat. On
   * mourait donc avec des potions plein le sac.
   * Q et E sont la ou la main gauche est deja posee, au-dessus de WASD. Le
   * retour au Nexus quitte E pour R : boire est un geste de combat, rentrer
   * chez soi n'en est pas un, et c'est le geste de combat qui merite la
   * touche facile. */
  var DEFAUTS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
                  pouvoir: 'Space', jump: 'KeyF',
                  vie: 'KeyQ', mana: 'KeyE',
                  auto: 'KeyI', nexus: 'KeyR' };
  var FLECHES_FIXES = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  var ACTIONS = [
    { cle: 'up', nom: 'Move up' }, { cle: 'down', nom: 'Move down' },
    { cle: 'left', nom: 'Move left' }, { cle: 'right', nom: 'Move right' },
    { cle: 'pouvoir', nom: 'Special attack' },
    { cle: 'vie', nom: 'Drink health potion' },
    { cle: 'mana', nom: 'Drink magic potion' },
    { cle: 'jump', nom: 'Jump' },
    { cle: 'auto', nom: 'Auto-fire' },
    { cle: 'nexus', nom: 'Return to Nexus' },
  ];

  var PERSO_TOUCHES = chargeTouches();
  var CODE_VERS_ACTION = {};
  function reconstruitLookup() {
    CODE_VERS_ACTION = {};
    Object.keys(FLECHES_FIXES).forEach(function (c) { CODE_VERS_ACTION[c] = FLECHES_FIXES[c]; });
    ACTIONS.forEach(function (a) {
      if (PERSO_TOUCHES[a.cle]) CODE_VERS_ACTION[PERSO_TOUCHES[a.cle]] = a.cle;
    });
  }
  function chargeTouches() {
    var t = {};
    try { t = JSON.parse(localStorage.getItem(CLE_STOCKAGE) || '{}') || {}; } catch (e) { t = {}; }
    /* Un joueur qui a deja joue a « Space » enregistre pour le SAUT. Le
       laisser tel quel donnerait deux actions sur la meme touche, et c'est
       la derniere ecrite qui gagnerait — un joueur perdrait son pouvoir sans
       comprendre pourquoi. On le renvoie donc au nouveau defaut du saut. */
    if (t.jump === 'Space') t.jump = DEFAUTS.jump;
    var o = {}, pris = {};
    ACTIONS.forEach(function (a) {
      var c = (typeof t[a.cle] === 'string' && t[a.cle]) ? t[a.cle] : DEFAUTS[a.cle];
      /* Deux actions sur la meme touche : la seconde retombe sur son propre
         defaut, et si celui-la est pris aussi elle reste sans touche plutot
         que de voler celle d'une autre. Mieux vaut une action a rebinder
         qu'une action qui en ecrase une autre en silence. */
      if (pris[c]) c = pris[DEFAUTS[a.cle]] ? '' : DEFAUTS[a.cle];
      if (c) pris[c] = a.cle;
      o[a.cle] = c;
    });
    return o;
  }
  function sauveTouches() {
    try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify(PERSO_TOUCHES)); } catch (e) {}
    reconstruitLookup();
    /* Le bouton du pouvoir affiche la touche : la reassigner sans le repeindre
       laisserait « Space » ecrit sur un bouton qui repond a autre chose. */
    if (typeof peintPouvoir === 'function') peintPouvoir();
  }
  reconstruitLookup();

  /** Un nom lisible pour un `KeyboardEvent.code` — « W », « Space », « ↑ »,
      plutot que le nom technique que personne ne reconnait. */
  function nomTouche(code) {
    if (!code) return '—';
    if (code === 'Space') return 'Space';
    if (code === 'ArrowUp') return '↑'; if (code === 'ArrowDown') return '↓';
    if (code === 'ArrowLeft') return '←'; if (code === 'ArrowRight') return '→';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    return code;
  }

  window.addEventListener('keydown', function (ev) {
    if (ecouteRebind) { captureRebind(ev); return; }
    if (panelOuvert) return;         // les reglages sont ouverts : rien ne bouge derriere
    var d = CODE_VERS_ACTION[ev.code];
    if (!d) return;
    debloqueSon(); ev.preventDefault();
    if (d === 'jump') lanceSaut();
    else if (d === 'pouvoir') lancePouvoir();
    else if (d === 'auto') basculeAuto();
    else if (d === 'nexus') retourNexus('key');
    else if (d === 'vie' || d === 'mana') boitPotion(d === 'vie' ? 'vie' : 'mana');
    else TOUCHES[d] = true;
  });
  window.addEventListener('keyup', function (ev) {
    var d = CODE_VERS_ACTION[ev.code];
    /* Les actions PONCTUELLES ne se relachent pas : elles n'ont pas d'etat
       « appuye ». Les lister ici plutot que de tester le contraire evite
       qu'une action ajoutee plus tard se retrouve traitee comme une
       direction, et coince le personnage dans un mur. */
    var PONCTUELLES = ['jump', 'pouvoir', 'auto', 'nexus', 'vie', 'mana'];
    if (d && PONCTUELLES.indexOf(d) < 0) TOUCHES[d] = false;
  });

  /* ---- BOIRE ----
   *
   * Un seul chemin, partout : la touche, le bouton du panneau et le bouton
   * tactile passent tous par ici. Trois copies de la meme demande auraient
   * fini par ne plus verifier les memes choses — et celle qu'on oublie est
   * toujours celle qu'on utilise en mourant.
   *
   * Le refus est DIT. Une touche qui ne repond pas se lit comme un jeu qui a
   * lache, pas comme un sac vide.
   */
  function boitPotion(cle) {
    if (SCENE !== 'monde') { flotte('OUT IN THE WILD ONLY'); return; }
    var p = (POTIONS_C || []).filter(function (x) { return x.cle === cle; })[0];
    if (!p || !p.quantite) {
      flotte('NO ' + (cle === 'vie' ? 'HEALTH' : 'MAGIC') + ' POTION');
      joueSample('clic', { vol: 0.3 });
      return;
    }
    if (!enLigne) return;
    clic(true);
    envoie({ type: 'potionBoit', cle: cle });
  }

  function lanceSaut() {
    if (saut.en_cours) return;
    var c = PERSONNAGES[PERSO];
    saut.en_cours = true; saut.chrono = 0; saut.cadre = 0;
    saut.duree = c.images / FPS_ANIM;
  }

  // ======================= LE TIR =======================
  //
  // ---- ce qui existe, et ce qui manque ----
  //
  // Le Nexus est une zone sure : on peut y tirer, rien n'y meurt. C'est aussi
  // le cas dans le jeu d'origine, et ca rend le systeme testable des
  // maintenant — on voit partir les projectiles, on regle la portee et la
  // cadence, sans attendre les monstres.
  //
  // Ce qui manque donc VRAIMENT : les cibles. Le tir automatique vise
  // « l'ennemi le plus proche » ; tant qu'il n'y en a aucun, il tire droit
  // devant. Ce n'est pas un pis-aller, c'est le comportement du Nexus.
  //
  // ---- l'arme decide ----
  //
  // Portee, nombre de projectiles et cadence viennent de la FAMILLE de
  // l'arme equipee, pas d'un reglage global : c'est ce qui fait qu'un arc et
  // un marteau ne se jouent pas pareil. Sans arme, on tire quand meme — a
  // mains nues, court et lent.

  var ARMES = {
    lame:    { portee: 320, tirs: 1, cadence: 3.2, vitesse: 560, teinte: '#cfe8ff' },
    hache:   { portee: 210, tirs: 1, cadence: 1.7, vitesse: 430, teinte: '#ffb06b' },
    lance:   { portee: 420, tirs: 1, cadence: 2.2, vitesse: 640, teinte: '#d8dee9' },
    arc:     { portee: 460, tirs: 2, cadence: 2.6, vitesse: 700, teinte: '#9dff9d' },
    marteau: { portee: 180, tirs: 1, cadence: 1.3, vitesse: 380, teinte: '#ffd76b' },
    dagues:  { portee: 300, tirs: 2, cadence: 4.0, vitesse: 620, teinte: '#c9a0ff' },
    /* Sans arme : court, lent, mais on tire — un joueur qui appuie et ne voit
       rien partir croit que la commande est cassee, pas qu'il lui manque un
       objet. */
    poing:   { portee: 150, tirs: 1, cadence: 1.6, vitesse: 340, teinte: '#8DA0C4' },
  };

  function familleArme() {
    var e = FICHE && FICHE.equipArme;
    return (e && e.famille) || null;
  }
  function armeCourante() {
    return ARMES[familleArme()] || ARMES.poing;
  }

  /* ---- LES DESSINS DE PROJECTILES ----
   *
   * Une bande de quatre images par famille d'arme, chargee a la demande. Une
   * famille sans dessin garde le trace au canvas : on peut donc les livrer
   * une par une sans que les cinq autres cessent de tirer entre-temps.
   *
   * Le dessin regarde vers la DROITE, comme l'angle 0 : `ctx.rotate(angle)`
   * l'oriente donc sans correction a appliquer. */
  var CADRE_TIR = 96;
  var SPRITES_TIR = {};
  /* ---- LES DESSINS DE PROJECTILE, AVANT LE PREMIER TIR ----
   *
   * Ils se chargeaient A LA DEMANDE : le premier tir de chaque session
   * sortait donc en rectangle de secours, et le dessin n'arrivait qu'apres.
   * Mesure faite — plus d'un demi-seconde entre le clic et le premier
   * projectile VRAIMENT dessine, sur une machine locale ou le reseau ne
   * coute rien.
   *
   * On les demande tous a l'entree dans le monde : le notre et celui de
   * chaque espece. Une dizaine de petites images, une fois, pendant que le
   * joueur regarde la carte apparaitre — au lieu d'une saccade au moment
   * precis ou une creature tire pour la premiere fois. */
  function chargeTirs() {
    spriteTir(familleArme() || 'poing');
    var t = MONDE_C && MONDE_C.especes;
    if (!t) return;
    Object.keys(t).forEach(function (k) {
      if (t[k] && t[k].tir && t[k].tir.sprite) spriteTir(t[k].tir.sprite);
    });
  }
  /* ---- LES FAMILLES QUI N'ONT PAS ENCORE LEUR PLANCHE ----
   * Le poing n'est pas une arme qu'on achete : c'est ce qui reste quand on n'a
   * plus rien — apres une mort, par exemple, ou l'equipement est detruit. Il
   * n'a jamais eu de dessin, et le trace de secours (un trait a la teinte de
   * l'arme) dit ce qu'il faut : quelque chose part, ca fait mal, c'est court.
   * On l'ecrit ICI plutot que de laisser la page demander un fichier absent.
   * Un 404 par session ne casse rien de visible — et c'est le probleme : il
   * apprend a ignorer les 404, et le jour ou `lame.webp` disparaitra du depot
   * personne ne le verra. Cette liste RETRECIT : le jour ou la planche du
   * poing arrive, on retire la ligne. */
  var SANS_PLANCHE = { poing: 1 };
  function spriteTir(fam) {
    if (!fam) return null;
    if (SPRITES_TIR[fam] !== undefined) return SPRITES_TIR[fam];
    if (SANS_PLANCHE[fam]) { SPRITES_TIR[fam] = null; return null; }
    var img = new Image();
    /* `null` des le depart, pas `img` : tant qu'elle n'est pas chargee on
       veut le trace de secours, pas une case vide. */
    SPRITES_TIR[fam] = null;
    img.onload = function () { SPRITES_TIR[fam] = img; };
    img.onerror = function () { SPRITES_TIR[fam] = null; };
    img.src = 'img/nexus/tirs/' + fam + '.webp';
    return null;
  }

  /* De combien un projectile se DESSINE au-dessus de sa position reelle.
     Purement visuel : il part a hauteur de poitrine mais existe, pour la
     collision, la ou le personnage se tient. */
  var DECALAGE_TIR = 40;
  var TIRS = [];              // projectiles en vol
  var IMPACTS = [];           // eclats en cours, au point de contact
  var DUREE_IMPACT = 0.28;
  var viseur = { x: 0, y: 0, actif: false };   // en coordonnees ECRAN
  var tireur = { presse: false, auto: false, recharge: 0 };

  /* ---- VISER ----
   * L'angle part du personnage vers le curseur. On garde le pointeur en
   * coordonnees ECRAN et on le convertit au moment du tir : la camera bouge
   * entre deux images, donc une position monde memorisee serait deja fausse. */
  canvas.addEventListener('mousemove', function (ev) {
    var r = canvas.getBoundingClientRect();
    viseur.x = ev.clientX - r.left; viseur.y = ev.clientY - r.top;
    viseur.actif = true;
  });
  canvas.addEventListener('mouseleave', function () { viseur.actif = false; });

  /* ---- ON TIRE AU CLIC GAUCHE ----
   *
   * Le gauche est le geste par defaut : c'est celui qu'on fait sans y penser,
   * et le seul dont un joueur est sur qu'il existe. Le droit reste accepte
   * pour qui a pris l'habitude — les deux mettent le meme drapeau, donc
   * relacher l'un pendant que l'autre est tenu n'arrete rien de travers.
   * Le menu contextuel du canvas part quand meme : sans ca, le clic droit
   * ouvrirait le menu du navigateur par-dessus le jeu.
   *
   * Rien d'autre ne consomme le clic gauche sur le canvas : la scene ne porte
   * aucun bouton, ils sont tous dans le panneau HTML a cote. */
  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  canvas.addEventListener('mousedown', function (ev) {
    if (ev.button !== 0 && ev.button !== 2) return;
    ev.preventDefault(); debloqueSon();
    /* On ne tire pas dans le coffre : c'est une piece fermee, il n'y a rien
       a viser, et les projectiles y chercheraient la fontaine du Nexus. */
    if (SCENE !== 'coffre') tireur.presse = true;
  });
  window.addEventListener('mouseup', function (ev) {
    if (ev.button === 0 || ev.button === 2) tireur.presse = false;
  });

  /* ================== LE POUVOIR DU FRUIT ==================
   *
   * ---- ce que le client decide, et ce qu'il ne decide pas ----
   *
   * Il decide QUAND on appuie. C'est tout. Quelle cible, combien de degats,
   * combien de mana, si la recharge est passee : le serveur tranche, comme
   * pour les tirs. Ce fichier n'a meme pas la table des couts en dur — elle
   * arrive dans `realmEntre`. Un chiffre ecrit ici finirait par diverger de
   * celui du serveur, et le bouton mentirait sur le prix.
   *
   * ---- ce qu'on montre quand meme sans attendre le serveur ----
   *
   * L'etat du bouton (pret / pas assez de mana / en recharge) se calcule ici,
   * a partir du mana et de la recharge que `realmEtat` envoie dix fois par
   * seconde. On ne veut pas d'un aller-retour pour savoir si le bouton doit
   * s'allumer : il doit s'eteindre a la seconde ou le mana descend.
   */
  var POUVOIRS_C = null;          // la table des pouvoirs, envoyee a l'entree
  var POUVOIR_C = null;           // le pouvoir du fruit porte, ou null
  var POUVOIR_ETAT = { recharge: 0, rafale: 0 };
  /* ---- LA PARALYSIE ----
   * Ce qu'il en reste, en secondes, tel que le serveur nous le dit. La page
   * n'en decide RIEN : elle cesse d'obeir aux touches parce que le serveur
   * refuse deja le deplacement, et continuer a avancer localement ferait
   * glisser le personnage puis le ramenerait d'un coup — le pire des deux
   * mondes. Elle obeit tout de suite pour que ce soit franc. */
  var PARALYSE = 0;
  /* Le ralentissement et la brulure, tels que le serveur les annonce. `FREIN`
     arrive avec la table des effets a l'entree du monde : le facteur n'est
     pas ecrit ici, sinon il finirait par ne plus etre celui qu'on subit. */
  var RALENTI = 0, BRULURE = 0, FREIN = 0.5;
  var elPow = document.getElementById('nxPow');
  var elPowNom = document.getElementById('nxPowNom');
  var elPowCout = document.getElementById('nxPowCout');
  var elPowTouche = document.getElementById('nxPowTouche');
  var elPowJauge = document.getElementById('nxPowJauge');
  var elPowIco = document.getElementById('nxPowIco');

  /* ================== CE QUI BOUGE EN CONTINU ==================
   *
   * La vie et le mana remontent tout seuls : ils changent plusieurs fois par
   * seconde. Repeindre TOUT le panneau a ce rythme reconstruirait a chaque
   * fois le HTML de l'equipement, du sac et des potions — c'est-a-dire
   * detruirait sous le doigt la piece qu'on est en train de faire glisser, et
   * ferait clignoter des images qui n'ont pas change.
   *
   * On separe donc : `peintPanneau` refait la structure quand elle change
   * vraiment (un objet equipe, un niveau gagne), et cette fonction-ci ne
   * touche qu'aux trois choses qui bougent seules — les deux jauges et le
   * voile de recharge du fruit.
   */
  function majJauges() {
    if (!FICHE) return;
    if (elHp) elHp.textContent = VIE.pv;
    if (elMp) elMp.textContent = VIE.mp;
    if (elHpJauge) elHpJauge.style.width =
      (VIE.max > 0 ? Math.max(0, Math.min(100, VIE.pv * 100 / VIE.max)) : 100) + '%';
    if (elMpJauge) elMpJauge.style.width =
      (VIE.mpMax > 0 ? Math.max(0, Math.min(100, VIE.mp * 100 / VIE.mpMax)) : 100) + '%';
    majFruit();
  }

  /* Le fruit se grise pendant sa recharge et revient en couleur des qu'il est
     pret. On ne touche qu'aux classes et a une hauteur : aucun HTML n'est
     reconstruit, donc rien ne clignote et rien ne se detache du doigt. */
  function majFruit() {
    if (!elEquip) return;
    var c = elEquip.querySelector('[data-slot="equipFruit"]');
    if (!c) return;
    var P = (POUVOIRS_C && POUVOIR_C) ? POUVOIRS_C[POUVOIR_C] : null;
    /* Hors du monde de combat, le pouvoir ne se lance pas : on n'affiche donc
       ni grisement ni liseré — un fruit grise dans le Nexus se lirait comme
       un objet casse. */
    if (!P || SCENE !== 'monde') {
      c.classList.remove('froid'); c.classList.remove('chaud');
      var v0 = c.querySelector('.cd'); if (v0) v0.style.height = '0%';
      return;
    }
    var reste = POUVOIR_ETAT.recharge || 0;
    /* « Pret » veut dire les DEUX : la recharge passee ET assez de mana. Un
       fruit en couleur qu'on ne peut pas lancer faute de mana serait un
       mensonge de la meme famille que le bouton grise et muet. */
    var pret = reste <= 0 && VIE.mp >= P.cout;
    c.classList.toggle('froid', !pret);
    c.classList.toggle('chaud', pret);
    var v = c.querySelector('.cd');
    if (v) v.style.height = reste > 0
      ? Math.max(0, Math.min(100, reste / P.recharge * 100)) + '%'
      : '0%';
  }

  function peintPouvoir() {
    if (!elPow) return;
    var actif = SCENE === 'monde' && POUVOIR_C && POUVOIRS_C && POUVOIRS_C[POUVOIR_C];
    elPow.classList.toggle('on', !!actif);
    if (!actif) return;
    var P = POUVOIRS_C[POUVOIR_C];
    var assez = VIE.mp >= P.cout;
    var prete = POUVOIR_ETAT.recharge <= 0;
    elPowNom.textContent = P.nom || POUVOIR_C;
    /* L'icone porte la classe du pouvoir : au milieu d'un combat on ne lit
       pas un mot, on reconnait une forme. */
    if (elPowIco) elPowIco.className = POUVOIR_C;
    elPowCout.textContent = P.cout + ' MP';
    elPowTouche.textContent = nomTouche(PERSO_TOUCHES.pouvoir) || '—';
    elPow.classList.toggle('pret', assez && prete);
    elPow.classList.toggle('vide', !assez || !prete);
    /* Le fruit dit la MEME chose que le bouton, toujours : deux etats a tenir
       d'accord a la main finiraient par se contredire. */
    majFruit();
    /* La jauge se REMPLIT pendant la recharge plutot que de se vider : on lit
       « ce qui reste a attendre » plus vite sur une barre qui avance. */
    elPowJauge.style.width = prete ? '0%'
      : Math.max(0, Math.min(100, (1 - POUVOIR_ETAT.recharge / P.recharge) * 100)) + '%';
  }

  /** Appuyer. On envoie, on ne devine rien : meme le prelevement de mana
      attend la reponse du serveur. Afficher un mana deja depense qui
      reviendrait ensuite serait pire qu'un dixieme de seconde d'attente. */
  function lancePouvoir() {
    if (SCENE !== 'monde') return;
    if (!POUVOIR_C) {
      flotte('No fruit equipped');
      return;
    }
    if (enLigne) envoie({ type: 'realmPouvoir' });
  }

  if (elPow) {
    elPow.addEventListener('click', function (ev) {
      ev.preventDefault(); debloqueSon(); lancePouvoir();
    });
    /* Sur telephone, `click` arrive avec trois cents millisecondes de retard
       apres le doigt. Pour une attaque, c'est visible. */
    elPow.addEventListener('touchstart', function (ev) {
      ev.preventDefault(); debloqueSon(); lancePouvoir();
    }, { passive: false });
  }

  /* ---- CE QUE LE POUVOIR LAISSE A L'ECRAN ----
   *
   * Un pouvoir qui coute soixante mana et ne se voit pas se lit comme une
   * touche cassee. Trois traces, une par pouvoir :
   *   - la FOUDRE laisse un eclair brise entre nous et la cible, quelques
   *     dixiemes de seconde ;
   *   - la STASE laisse un cercle qui se retracte, plus un anneau autour de
   *     chaque monstre fige (dessine ailleurs, avec le monstre) ;
   *   - la RAFALE ne laisse rien ici : elle se voit au rythme des tirs, et
   *     un effet permanent par-dessus quatre secondes de tir serait du
   *     brouillard.
   */
  var EFFETS_P = [];
  function effetPouvoir(m) {
    if (m.cle === 'foudre' && !m.vide) {
      EFFETS_P.push({ cle: 'foudre', x1: joueur.x, y1: joueur.y, x2: m.cx, y2: m.cy,
                      vie: 0.32, max: 0.32, graine: Math.random() * 1000 });
    } else if (m.cle === 'stase') {
      EFFETS_P.push({ cle: 'stase', x: m.x, y: m.y, r: m.rayon, vie: 0.8, max: 0.8 });
    }
  }

  function peintEffetsPouvoir(dt) {
    for (var i = EFFETS_P.length - 1; i >= 0; i--) {
      var e = EFFETS_P[i];
      e.vie -= dt;
      if (e.vie <= 0) { EFFETS_P.splice(i, 1); continue; }
      var t = e.vie / e.max;
      ctx.save();
      if (e.cle === 'foudre') {
        /* Un trait BRISE, pas une droite : une droite se lit comme un rayon
           laser, et l'eclair doit se lire comme un eclair. Les cassures sont
           tirees d'une graine fixee a la naissance de l'effet, sinon elles
           danseraient a chaque image. */
        var a = { x: e.x1, y: e.y1 }, b = { x: e.x2, y: e.y2 };
        ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (var passe = 0; passe < 2; passe++) {
          ctx.strokeStyle = passe === 0 ? 'rgba(190,140,255,.55)' : '#FFFFFF';
          ctx.lineWidth = passe === 0 ? 13 : 4;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          var seg = 6;
          for (var k = 1; k < seg; k++) {
            var p = k / seg;
            var px = a.x + (b.x - a.x) * p, py = a.y + (b.y - a.y) * p;
            /* Le decalage perpendiculaire au trait, pseudo-aleatoire mais
               STABLE : sin(graine + k) rend le meme nombre a chaque image. */
            var d = Math.sin(e.graine + k * 2.7) * 22 * Math.sin(p * Math.PI);
            var nx = -(b.y - a.y), ny = (b.x - a.x);
            var n = Math.sqrt(nx * nx + ny * ny) || 1;
            ctx.lineTo(px + nx / n * d, py + ny / n * d);
          }
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        /* L'impact : un halo qui s'ouvre a l'arrivee. */
        ctx.globalAlpha = t * 0.8;
        ctx.fillStyle = '#E6D2FF';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 10 + (1 - t) * 34, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.cle === 'stase') {
        var pret = IMG_STASE && IMG_STASE.complete && IMG_STASE.naturalWidth;
        if (pret) {
          /* ---- L'ANNEAU DE GIVRE ----
           * Les trois images grandissent : c'est la CROISSANCE dessinee par
           * l'artiste qui fait l'onde, on ne la refabrique pas en changeant
           * l'echelle. On cale simplement la derniere sur le rayon reel du
           * pouvoir, pour que ce qu'on voit soit ce qui gele vraiment.
           *
           * Ecrase de moitie en hauteur : l'anneau est au SOL, vu du dessus.
           * Un cercle parfait se lirait comme une bulle verticale. */
          var cw = IMG_STASE.naturalWidth / STASE_CADRES;
          var ch = IMG_STASE.naturalHeight;
          var av = 1 - t;                       // 0 au depart, 1 a la fin
          var ci = Math.min(STASE_CADRES - 1, Math.floor(av * STASE_CADRES));
          var L = e.r * 2, H = L * 0.5;
          ctx.globalAlpha = Math.min(1, t * 2.2);
          ctx.drawImage(IMG_STASE, ci * cw, 0, cw, ch,
                        e.x - L / 2, e.y - H / 2, L, H);
        } else {
          /* Repli tant que l'image n'est pas la : mieux vaut un cercle nu
             qu'un pouvoir de soixante-quinze mana sans aucun signe. */
          ctx.globalAlpha = t * 0.75;
          ctx.strokeStyle = '#9DE8FF';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r * (0.55 + t * 0.45), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  /* Le tir auto se commande de DEUX endroits — la touche et le bouton des
     reglages — et se montre a un TROISIEME, le temoin sur la scene. Une seule
     fonction les tient d'accord : trois etats a synchroniser a la main
     finiraient par se contredire, et le joueur verrait « OFF » pendant que ca
     tire. L'etat se garde d'une visite a l'autre, comme le repli du panneau. */
  var elAuto = document.getElementById('nxAuto');
  var elAutoBtn = document.getElementById('nxAutoBtn');
  var CLE_AUTO = 'swogeNexusAuto';
  function peintAuto() {
    if (elAuto) elAuto.classList.toggle('on', tireur.auto);
    if (elAutoBtn) {
      elAutoBtn.classList.toggle('on', tireur.auto);
      elAutoBtn.textContent = tireur.auto ? 'ON' : 'OFF';
      elAutoBtn.setAttribute('aria-pressed', tireur.auto ? 'true' : 'false');
    }
  }
  function basculeAuto() {
    tireur.auto = !tireur.auto;
    try { localStorage.setItem(CLE_AUTO, tireur.auto ? '1' : '0'); } catch (e) {}
    peintAuto();
  }
  try { tireur.auto = localStorage.getItem(CLE_AUTO) === '1'; } catch (e) {}
  if (elAutoBtn) elAutoBtn.addEventListener('click', basculeAuto);
  peintAuto();

  /* ---- les commandes de l'auto-Nexus ----
     La bascule et le curseur se peignent ensemble : le curseur grise quand
     la bascule est sur OFF, sinon on croirait regler quelque chose d'actif. */
  var elEscBtn = document.getElementById('nxEscBtn');
  var elEscPct = document.getElementById('nxEscPct');
  var elEscVal = document.getElementById('nxEscVal');
  var elEscLigne = document.getElementById('nxEscLigne');
  function peintRepli() {
    if (elEscBtn) {
      elEscBtn.classList.toggle('on', REPLI.actif);
      elEscBtn.textContent = REPLI.actif ? 'ON' : 'OFF';
      elEscBtn.setAttribute('aria-pressed', REPLI.actif ? 'true' : 'false');
    }
    if (elEscPct) elEscPct.value = String(REPLI.seuil);
    if (elEscVal) elEscVal.textContent = REPLI.seuil + '%';
    if (elEscLigne) elEscLigne.classList.toggle('off', !REPLI.actif);
  }
  if (elEscBtn) elEscBtn.addEventListener('click', function () {
    REPLI.actif = !REPLI.actif;
    /* On repart d'un seuil NON franchi : sinon activer l'option alors qu'on
       est deja sous la barre ne declencherait rien. */
    REPLI.franchi = false;
    sauveRepli(); peintRepli();
  });
  if (elEscPct) elEscPct.addEventListener('input', function () {
    REPLI.seuil = Math.max(5, Math.min(95, Number(elEscPct.value) || 35));
    REPLI.franchi = false;
    sauveRepli(); peintRepli();
  });
  peintRepli();


  /** L'ennemi le plus proche, en coordonnees monde — ou `null`. Il n'y en a
      aucun aujourd'hui : les autres JOUEURS n'en sont pas, on ne se tire pas
      dessus dans une zone sure. La fonction existe pour que le jour ou les
      monstres arrivent, il n'y ait qu'une liste a lui donner. */
  function cibleLaPlusProche() {
    /* Dans le Nexus il n'y a rien a viser — c'est une zone sure, et c'est
       voulu. Dans le monde, on prend le plus proche, tout simplement : viser
       le plus faible ou le plus dangereux demanderait au joueur de deviner
       la regle, et il n'y en aurait aucune bonne. */
    if (SCENE !== 'monde') return null;
    var mieux = null, d2 = Infinity;
    for (var k in MONSTRES_C) {
      var e = MONSTRES_C[k];
      var dx = e.rx - joueur.x, dy = (e.ry - 30) - joueur.y;
      var q = dx * dx + dy * dy;
      if (q < d2) { d2 = q; mieux = e; }
    }
    /* Hors de portee de l'arme, on ne vise pas : le tir partirait dans une
       direction ou rien ne peut arriver, et le joueur croirait que la visee
       est cassee alors qu'il est simplement trop loin. */
    var a = ARMES[familleArme() || 'poing'] || ARMES.poing;
    var maxi = a.portee * 1.15;
    if (!mieux || d2 > maxi * maxi) return null;
    return { x: mieux.rx, y: mieux.ry - 30 };
  }

  /** La direction du tir, en radians. Trois sources, dans cet ordre : la
      cible automatique, le curseur, puis le regard du personnage. */
  function angleDeTir(camX, camY) {
    /* Le bouton tactile vise tout seul, que le reglage « auto-fire » soit
       allume ou non : c'est le geste qui le demande, pas la preference. */
    var c = (tireur.auto || VISE_AUTO) ? cibleLaPlusProche() : null;
    if (c) return Math.atan2(c.y - joueur.y, c.x - joueur.x);
    if (viseur.actif) {
      /* On vise depuis le point de DESSIN du projectile (les pieds moins le
         decalage visuel), sinon la trajectoire ne partirait pas de la ou on
         la voit naitre. */
      var z = DERNIERE_CAM.z || 1;
      var mx = viseur.x / z + camX, my = viseur.y / z + camY;
      return Math.atan2(my - (joueur.y - DECALAGE_TIR), mx - joueur.x);
    }
    var DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    return DIR_ANGLE[joueur.dir] || 0;
  }

  function tire(angle) {
    var a = armeCourante();
    /* UN son par tir, pas un par projectile : l'arc et les dagues en lancent
       deux d'un coup, et deux sons identiques a la meme milliseconde ne font
       pas « deux fleches », ils font un son deux fois trop fort. */
    joueSon(familleArme() || 'poing');
    /* Plusieurs projectiles partent en EVENTAIL, pas superposes : deux tirs
       exactement confondus se verraient comme un seul et le joueur ne saurait
       pas que son arc en lance deux. */
    var ecart = 0.13;
    for (var i = 0; i < a.tirs; i++) {
      var d = a.tirs === 1 ? 0 : (i - (a.tirs - 1) / 2) * ecart;
      var duree = a.portee / a.vitesse;
      /* Le projectile nait aux PIEDS du joueur, pas a hauteur de poitrine.
         Le `-40` est un decalage de DESSIN : l'appliquer a la position du
         monde le faisait naitre 40px plus pres de ce qu'il vise — donc
         DEJA dans la zone de collision de la fontaine quand on est colle a
         elle, et chaque tir explosait aux pieds du joueur. La position du
         monde doit vivre dans le meme espace que la collision du joueur. */
      TIRS.push({ x: joueur.x, y: joueur.y, a: angle + d,
                  v: a.vitesse, reste: duree, duree: duree,
                  teinte: a.teinte, fam: familleArme() });
    }
  }

  function majTirs(dt, camX, camY) {
    /* ---- UNE SEULE BOUCLE TIRE A LA FOIS ----
     *
     * Il y en a deux : celle-ci, qui tire dans le NEXUS, et celle du monde de
     * combat, dans `maj`. La boucle d'images appelait les DEUX a chaque tour,
     * et toutes deux faisaient descendre la MEME recharge.
     *
     * Dans le monde elle descendait donc deux fois par image, et les deux
     * blocs tiraient a tour de role. Mesure faite sur deux secondes et demie
     * d'appui : huit tirs par le monde, et huit par le Nexus.
     *
     * Les huit du Nexus ne se voyaient PAS. Ils partent dans `TIRS`, la liste
     * que seule la scene du Nexus dessine — mais ils faisaient leur bruit.
     * C'est exactement ce qu'on nous a rapporte : « on entend le son des tirs
     * mais on ne voit pas les tirs ». Ca arrivait a chaque tir, pas seulement
     * en tir automatique, et un joueur sur deux devait croire que la moitie
     * de ses tirs se perdait.
     *
     * Ils coutaient aussi leur travail a chaque image : une recherche de
     * cible sur tous les monstres, puis un test de collision contre la
     * fontaine — pour des projectiles que personne ne verra jamais.
     *
     * Le reste de la fonction continue de tourner : un tir parti juste avant
     * de franchir le portail doit finir sa course, pas rester fige au-dessus
     * de la fontaine jusqu'au retour. */
    if (SCENE === 'monde') return majTirsNexus(dt);
    var a = armeCourante();
    tireur.recharge -= dt;
    if ((tireur.presse || tireur.auto) && tireur.recharge <= 0) {
      tire(angleDeTir(camX, camY));
      tireur.recharge = 1 / a.cadence;
    }
    majTirsNexus(dt);
  }

  /* Ce qui reste en l'air dans le Nexus, quelle que soit la scene. */
  function majTirsNexus(dt) {
    var f = FONTAINE;   // la fontaine : le seul obstacle solide du Nexus
    for (var i = TIRS.length - 1; i >= 0; i--) {
      var t = TIRS[i];
      t.x += Math.cos(t.a) * t.v * dt;
      t.y += Math.sin(t.a) * t.v * dt;
      t.reste -= dt;

      /* ---- LA PIERRE ARRETE LE TIR ----
       * Les projectiles traversaient la fontaine, ce qu'aucun joueur ne lit
       * comme normal. Elle a deja un rayon de collision — celui qui empeche
       * d'y entrer a pied — et le reutiliser evite d'en inventer un second
       * qui finirait par diverger du premier. */
      var dx = t.x - f.x, dy = t.y - (f.y - COL_FONT.dy);
      var tu = dx / COL_FONT.rx, tv = dy / COL_FONT.ry;
      if (tu * tu + tv * tv < 1) {
        IMPACTS.push({ x: t.x, y: t.y, reste: DUREE_IMPACT });
        sonImpact();
        TIRS.splice(i, 1);
        continue;
      }

      /* La portee EST la duree de vie : un projectile disparait apres avoir
         parcouru la distance de son arme, pas au bord de l'ecran — sinon la
         portee dependrait de la taille de la fenetre. Il s'eteint sans
         eclat : il n'a rien touche. */
      if (t.reste <= 0) TIRS.splice(i, 1);
    }
    for (var j = IMPACTS.length - 1; j >= 0; j--) {
      IMPACTS[j].reste -= dt;
      if (IMPACTS[j].reste <= 0) IMPACTS.splice(j, 1);
    }
  }

  function dessineTirs() {
    for (var i = 0; i < TIRS.length; i++) {
      var t = TIRS[i];
      var img = spriteTir(t.fam);
      ctx.save();
      ctx.translate(t.x, t.y - DECALAGE_TIR); ctx.rotate(t.a);
      if (img) {
        /* Le cadre suit la VIE du projectile, pas une horloge a part : un
           tir court traverse quand meme ses quatre images, et la
           dissipation tombe donc toujours juste avant qu'il disparaisse. */
        var n = Math.floor(img.width / CADRE_TIR) || 1;
        var k = Math.min(n - 1, Math.floor((1 - t.reste / t.duree) * n));
        var taille = 46;
        ctx.drawImage(img, k * CADRE_TIR, 0, CADRE_TIR, CADRE_TIR,
                      -taille / 2, -taille / 2, taille, taille);
      } else {
        /* Pas encore de dessin pour cette famille : une navette allongee
           dans le sens du vol. Seul ce bloc connait la forme d'un
           projectile — livrer une image ne touche a rien d'autre. */
        ctx.fillStyle = t.teinte;
        ctx.shadowColor = t.teinte; ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    /* Les eclats, apres les projectiles pour passer par-dessus. Ils ne
       TOURNENT pas : une explosion n'a pas de sens de vol, et la faire
       pivoter avec l'angle du tir se verrait comme un defaut. */
    var imp = spriteTir('impact');
    if (imp) {
      var nb = Math.floor(imp.width / CADRE_TIR) || 1;
      for (var k = 0; k < IMPACTS.length; k++) {
        var e = IMPACTS[k];
        var c = Math.min(nb - 1, Math.floor((1 - e.reste / DUREE_IMPACT) * nb));
        var t2 = 54;
        ctx.drawImage(imp, c * CADRE_TIR, 0, CADRE_TIR, CADRE_TIR,
                      e.x - t2 / 2, e.y - DECALAGE_TIR - t2 / 2, t2, t2);
      }
    }
  }

  // ------------------------------------------------------- la roue des reglages

  var panelOuvert = false, ecouteRebind = null;
  var captureRebind = function () {};   // remplacee une fois le panneau construit, plus bas
  (function poseReglages() {
    var bouton = document.getElementById('nxReglages');
    var voile = document.getElementById('nxReglagesVoile');
    if (!bouton || !voile) return;
    var carte = voile.querySelector('.nxrp-carte');
    var liste = voile.querySelector('.nxrp-liste');
    var lignes = {};

    ACTIONS.forEach(function (a) {
      var l = document.createElement('div'); l.className = 'nxrp-ligne';
      var nom = document.createElement('span'); nom.className = 'nxrp-nom'; nom.textContent = a.nom;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'nxrp-touche';
      b.addEventListener('click', function () { basculeEcoute(a.cle, b); });
      l.appendChild(nom); l.appendChild(b);
      liste.appendChild(l);
      lignes[a.cle] = b;
    });

    function peint() {
      ACTIONS.forEach(function (a) { lignes[a.cle].textContent = nomTouche(PERSO_TOUCHES[a.cle]); });
    }
    peint();

    function basculeEcoute(cle, b) {
      if (ecouteRebind === cle) { annuleEcoute(); return; }
      annuleEcoute();
      ecouteRebind = cle; b.textContent = 'Press a key…'; b.classList.add('attend');
    }
    function annuleEcoute() {
      if (!ecouteRebind) return;
      var av = ecouteRebind; ecouteRebind = null;
      if (lignes[av]) lignes[av].classList.remove('attend');
      peint();
    }
    /* Remplace la fonction-relais declaree plus haut : une seule liste
       d'ecouteurs `keydown` sur `window`, pas deux qui pourraient se
       marcher dessus selon l'ordre d'attachement. */
    captureRebind = function (ev) {
      var cle = ecouteRebind;
      ev.preventDefault();
      if (ev.code === 'Escape') { annuleEcoute(); return; }
      /* Les fleches restent un repli fixe : les y attacher AUSSI creerait
         une deuxieme entree pour le meme code, ambigue au moment de lire
         quelle action elle declenche. */
      if (FLECHES_FIXES[ev.code]) { annuleEcoute(); return; }
      /* Deux actions ne partagent jamais la meme touche : si celle-ci
         servait deja a une autre, elles echangent leurs touches plutot que
         l'une n'ecrase l'autre en silence. */
      var autre = ACTIONS.filter(function (a) { return a.cle !== cle && PERSO_TOUCHES[a.cle] === ev.code; })[0];
      if (autre) PERSO_TOUCHES[autre.cle] = PERSO_TOUCHES[cle];
      PERSO_TOUCHES[cle] = ev.code;
      sauveTouches();
      ecouteRebind = null;
      lignes[cle].classList.remove('attend');
      peint();
    };

    bouton.addEventListener('click', function () {
      panelOuvert = true; voile.classList.add('on'); peint();
      Object.keys(TOUCHES).forEach(function (k) { TOUCHES[k] = false; });  // une touche deja enfoncee ne continue pas de marcher derriere
    });
    function ferme() {
      annuleEcoute();
      panelOuvert = false; voile.classList.remove('on');
      Object.keys(TOUCHES).forEach(function (k) { TOUCHES[k] = false; });  // rien ne reste enfonce en sortant
    }
    voile.querySelector('.nxrp-x').addEventListener('click', ferme);
    voile.addEventListener('click', function (ev) { if (ev.target === voile) ferme(); });
    voile.querySelector('.nxrp-reset').addEventListener('click', function () {
      ACTIONS.forEach(function (a) { PERSO_TOUCHES[a.cle] = DEFAUTS[a.cle]; });
      sauveTouches(); annuleEcoute(); peint();
    });
  })();

  /* ================== LE MANCHE ==================
   *
   * C'etait une croix de quatre boutons. Au CLAVIER quatre touches suffisent,
   * parce qu'on en tient deux a la fois : la diagonale se fait a l'index et au
   * majeur. Au POUCE on n'en tient qu'une — la croix n'avait donc que quatre
   * directions la ou le clavier en a huit, et contourner un rocher demandait
   * deux mouvements en escalier pendant qu'on se faisait tirer dessus.
   *
   * Le manche rend une direction CONTINUE. Elle entre par le meme chemin que
   * le clavier — `dx, dy`, normalises juste apres — donc aucune regle de
   * deplacement ne change : ni la borne de vitesse, ni le ralentissement, ni
   * la paralysie, ni les rochers. C'est une SOURCE de plus, pas un deuxieme
   * deplacement a tenir d'accord avec le premier.
   *
   * La distance au centre ne sert PAS a doser la vitesse. Le personnage n'a
   * qu'une allure — celle que le serveur borne — et un manche qui ferait
   * marcher moins vite en le poussant a moitie donnerait au joueur un moyen de
   * se punir sans le savoir. Il ne sert qu'a l'angle, et a la zone morte.
   */
  var MANCHE = { actif: false, x: 0, y: 0, pointeur: null };
  /* Sous ce rayon, on ne bouge pas : un pouce pose ne vaut pas un pas, et sans
     zone morte le personnage part tout seul des qu'on effleure. */
  var MANCHE_MORT = 0.22;
  (function poseLeManche() {
    var pave = document.getElementById('nxPad');
    if (!pave) return;
    var socle = pave.querySelector('.socle');
    var pommeau = pave.querySelector('.pommeau');
    if (!socle || !pommeau) return;
    var cx = 0, cy = 0, R = 1;

    /* On mesure le socle AU MOMENT de la prise, pas une fois pour toutes :
       la barre du navigateur mobile apparait et disparait au defilement, et
       un centre mesure au chargement se retrouve a cinquante pixels de la
       verite des qu'elle bouge. */
    function ancre() {
      var r = socle.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      R = Math.max(24, r.width / 2);
      pommeau.style.left = (cx - pave.getBoundingClientRect().left) + 'px';
      pommeau.style.top = (cy - pave.getBoundingClientRect().top) + 'px';
    }
    function poseLePommeau(dx, dy) {
      var b = pave.getBoundingClientRect();
      pommeau.style.left = (cx - b.left + dx) + 'px';
      pommeau.style.top = (cy - b.top + dy) + 'px';
    }
    function lit(ev) {
      var dx = ev.clientX - cx, dy = ev.clientY - cy;
      var d = Math.sqrt(dx * dx + dy * dy);
      /* Au-dela du socle, le pommeau reste au bord et la direction continue de
         tourner. Sans ca on perdrait le controle des qu'on deborde — ce qui
         arrive a chaque fois qu'on pousse fort. */
      var k = d > R ? R / d : 1;
      poseLePommeau(dx * k, dy * k);
      if (d < R * MANCHE_MORT) { MANCHE.x = 0; MANCHE.y = 0; return; }
      MANCHE.x = dx / d;
      MANCHE.y = dy / d;
    }
    function prend(ev) {
      debloqueSon();
      MANCHE.actif = true;
      MANCHE.pointeur = ev.pointerId;
      pave.classList.add('on');
      ancre();
      lit(ev);
      if (pave.setPointerCapture) { try { pave.setPointerCapture(ev.pointerId); } catch (e) {} }
      ev.preventDefault();
    }
    function suit(ev) {
      if (!MANCHE.actif || ev.pointerId !== MANCHE.pointeur) return;
      lit(ev);
      ev.preventDefault();
    }
    function lache(ev) {
      if (ev && MANCHE.actif && ev.pointerId !== MANCHE.pointeur) return;
      /* ---- ON REND LA CAPTURE ----
       * La prendre sans la rendre laisse l'element proprietaire du pointeur.
       * Le doigt suivant portant le meme identifiant n'arrive alors plus par
       * le chemin normal : le manche marchait deux ou trois fois puis cessait
       * de repondre, sans erreur nulle part. C'est aussi ce qui arriverait a
       * un joueur dont le doigt sort de l'ecran par le bas — le geste le plus
       * courant du monde sur un telephone. */
      if (MANCHE.pointeur !== null && pave.releasePointerCapture) {
        try {
          if (!pave.hasPointerCapture || pave.hasPointerCapture(MANCHE.pointeur)) {
            pave.releasePointerCapture(MANCHE.pointeur);
          }
        } catch (e) {}
      }
      MANCHE.actif = false; MANCHE.pointeur = null;
      MANCHE.x = 0; MANCHE.y = 0;
      pave.classList.remove('on');
      ancre();
    }
    pave.addEventListener('pointerdown', prend);
    pave.addEventListener('pointermove', suit);
    pave.addEventListener('pointerup', lache);
    pave.addEventListener('pointercancel', lache);
    /* Pas de `pointerleave` : avec la capture, le doigt qui sort de la zone
       continue d'etre suivi — et c'est exactement ce qu'on veut. Le lacher est
       le seul evenement qui arrete le personnage. */
    ancre();
    window.addEventListener('resize', ancre);
  })();

  /* ================== LE BOUTON DE TIR TACTILE ==================
   *
   * A la souris on vise ou l'on veut ; au doigt, viser ET se deplacer en meme
   * temps demande deux pouces et une precision qu'on n'a pas. Ce bouton fait
   * les deux gestes d'un coup : il tire, et il VISE TOUT SEUL l'ennemi le
   * plus proche.
   *
   * Il ne touche PAS au reglage `auto` des reglages : celui-la est un choix
   * durable du joueur, celui-ci est un mode de saisie. Melanger les deux
   * ferait qu'appuyer une fois sur le bouton changerait le comportement de la
   * souris pour toujours.
   */
  var VISE_AUTO = false;
  var elTir = document.getElementById('nxTir');
  if (elTir) {
    var presseTir = function (ev) {
      ev.preventDefault(); debloqueSon();
      if (SCENE === 'coffre') return;
      VISE_AUTO = true; tireur.presse = true;
      elTir.classList.add('presse');
    };
    var lacheTir = function () {
      VISE_AUTO = false; tireur.presse = false;
      elTir.classList.remove('presse');
    };
    elTir.addEventListener('pointerdown', presseTir);
    elTir.addEventListener('pointerup', lacheTir);
    elTir.addEventListener('pointercancel', lacheTir);
    elTir.addEventListener('pointerleave', lacheTir);
  }

  /* Il ne se montre QUE dans le monde de combat, et seulement au doigt :
     dans le Nexus il n'y a rien a viser, et a la souris il gene. */
  /* ---- LE RETOUR AU NEXUS, A DROITE ----
   * Il a d'abord ete pose au-dessus de la fleche du haut. C'etait une erreur :
   * le pouce gauche tient les quatre directions en continu pendant un combat,
   * et un bouton qui SORT du monde a un demi-centimetre de « avancer » finit
   * par etre touche pendant qu'on recule d'un golem. Il passe a droite, au-
   * dessus du tir : cette main-la ne fait que des gestes ponctuels. */
  var elMaison = document.getElementById('nxMaison');
  var elPotTac = document.getElementById('nxPot');
  /* Un seul ecouteur pose une fois, pas un par bouton : les boutons sont
     refaits a chaque changement de quantite, et des ecouteurs poses sur eux
     disparaitraient avec. */
  if (elPotTac) {
    elPotTac.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-pot]') : null;
      if (!b || b.disabled) return;
      ev.preventDefault(); debloqueSon();
      boitPotion(b.getAttribute('data-pot'));
    });
  }

  /* Les deux fioles au doigt. Elles portent le MEME compte que le panneau —
     une seule source — et le meme chemin pour boire. */
  function peintPotionsTactiles() {
    if (!elPotTac) return;
    var tactile = false;
    try { tactile = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    if (!tactile || SCENE !== 'monde') { elPotTac.classList.remove('on'); return; }
    elPotTac.innerHTML = (POTIONS_C || []).map(function (p) {
      return '<button type="button" data-pot="' + p.cle + '"' +
        (p.quantite ? '' : ' disabled') +
        ' aria-label="' + (p.nom || p.cle) + '">' +
        '<img alt="" src="img/nexus/objets/' + encodeURIComponent(p.image) +
        '.webp" onerror="this.remove()"><b>' + p.quantite + '</b></button>';
    }).join('');
    elPotTac.classList.add('on');
  }
  if (elMaison) {
    elMaison.addEventListener('click', function (ev) {
      ev.preventDefault(); debloqueSon(); retourNexus('pad');
    });
  }

  function peintBoutonTir() {
    var tactile = false;
    try { tactile = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    /* Les deux ensemble : ils n'ont de sens que dans le monde de combat, et
       seulement au doigt. Les separer aurait fini par en laisser un allume
       dans le Nexus. */
    var montre = tactile && SCENE === 'monde';
    if (elTir) elTir.classList.toggle('on', montre);
    if (elMaison) elMaison.classList.toggle('on', montre);
    peintPotionsTactiles();
  }

  /* ---- RAMASSER EN MARCHANT DESSUS ----
   *
   * Pas de touche a apprendre : on passe sur le sac, on le prend. Une touche
   * de plus dans un jeu ou l'on tient deja quatre directions et le tir serait
   * une touche qu'on oublie au moment ou l'on en a besoin — c'est-a-dire au
   * milieu d'un combat, la ou tombent les sacs.
   *
   * La page ne dit QUE « je ramasse ». Elle ne nomme pas le sac : la distance
   * et le choix se tranchent au serveur, sinon il suffirait d'une ligne dans
   * la console pour s'attribuer un sac a l'autre bout de la carte — et les
   * sacs sont exactement ce qu'on aurait interet a voler.
   *
   * Deux freins. Un delai court entre deux demandes, parce que marcher sur un
   * sac produirait sinon dix demandes par seconde. Et un delai LONG apres un
   * refus : quand on est plein, rester sur le sac redemanderait sans fin une
   * chose qu'on ne peut pas prendre, et le message clignoterait sans arret.
   */
  /* ---- LA GRILLE DU SAC AU SOL ----
   *
   * Huit places, comme les siennes, mais visiblement A PART : liseré de la
   * couleur du sac et fond plus chaud. Sans cette distinction, on croirait
   * son propre sac passe de huit a seize places — et on partirait en laissant
   * le butin par terre.
   *
   * La colonne de la fiole se DEDUIT de l'ordre des stats que le serveur a
   * envoye : rouge = hp, bleue = mp, epee = att, bouclier = def, ailes = spd,
   * verte = dex, coeur = vit, oeil = wis. Ecrire cet ordre ici en aurait fait
   * un deuxieme a garder d'accord avec le premier, et le desaccord aurait ete
   * silencieux : une potion de defense sous l'image d'une potion de vitesse.
   */
  var elPorte = document.getElementById('nxPorte');
  var elPorteBtn = document.getElementById('nxPorteBtn');
  var elPorteNom = document.getElementById('nxPorteNom');
  var elPorteTemps = document.getElementById('nxPorteTemps');
  if (elPorteBtn) elPorteBtn.addEventListener('click', franchit);
  var elButin = document.getElementById('nxButin');
  var elFlot = document.getElementById('nxButinFlot');
  var elButinNom = document.getElementById('nxButinNom');
  var elButinCases = document.getElementById('nxButinCases');
  var COUL_SAC = { brun: '#B08050', bleu: '#5AA9FF', violet: '#C07BFF',
                   or: '#FFC53D', rouge: '#F2685E', blanc: '#FFFFFF' };
  var NOM_SAC = { brun: 'Loot bag', bleu: 'Stat potion', violet: 'Rare drop',
                  or: 'Legendary drop', rouge: 'Mythic drop', blanc: 'RELIC' };
  var IMG_POTION = { vie: 'img/nexus/objets/potion_rouge.webp',
                     mana: 'img/nexus/objets/potion_bleue.webp' };

  /* Ce que porte UNE place, decrit une fois pour les deux surfaces. Deux
     rendus separes auraient fini par ne plus montrer la meme chose — et le
     desaccord se verrait la ou on ne regarde pas. */
  function contenuDeLaPlace(o, ordre) {
    if (o.st) {
      var col = ordre.indexOf(o.st);
      if (col < 0) col = 0;
      /* Huit images sur une bande : la position se compte en HUITIEMES de
         deplacement, donc sur sept intervalles. */
      var pos = (col / Math.max(1, ordre.length - 1)) * 100;
      return { titre: '+' + (o.st === 'hp' || o.st === 'mp' ? 5 : 1) + ' ' + o.st.toUpperCase(),
               html: '<u class="fiole" style="background-position:' + pos.toFixed(3) + '% 0"></u>' };
    }
    if (o.po) {
      return { titre: o.po === 'vie' ? 'Health Potion' : 'Magic Potion',
               html: '<img alt="" src="' + IMG_POTION[o.po] + '">' };
    }
    /* Une PIECE, deposee par quelqu'un ou tombee d'un monstre. Son nom et sa
       cle d'image sont venus avec elle : la page n'a pas a les retrouver dans
       un catalogue qu'elle ne possede peut-etre pas. */
    return { titre: o.nm || 'Item',
             html: '<img alt="" src="img/shop/' + encodeURIComponent(o.cl || '') +
                   '.webp" onerror="this.style.visibility=\'hidden\'">' };
  }

  /* ---- LA RANGEE FLOTTANTE ----
   *
   * Le panneau se lit A L'ARRET, et sur telephone on le replie justement pour
   * se battre. Or un sac au sol n'existe qu'une minute, pendant qu'on se fait
   * tirer dessus : le ranger dans une surface qu'on ferme pour combattre etait
   * l'erreur, pas le fait qu'elle soit fermee.
   *
   * Elle ne montre QUE les places pleines — huit cases dont six vides
   * prendraient la moitie de la largeur d'un telephone pour ne rien dire — et
   * un appui prend. Pas de double-appui : ici la case n'est pas une poignee,
   * il n'y a rien vers quoi glisser.
   */
  function peintFlot(s, ordre) {
    if (!elFlot) return;
    var tactile = false;
    try { tactile = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    if (!tactile || !s || !s.c.length) { elFlot.classList.remove('on'); elFlot.innerHTML = ''; return; }
    elFlot.innerHTML = s.c.map(function (o, i) {
      var d = contenuDeLaPlace(o, ordre);
      return '<button type="button" class="fl" data-flot="' + i + '" title="' + d.titre + '">' +
             d.html + '<b>' + d.titre + '</b></button>';
    }).join('');
    elFlot.classList.add('on');
  }

  function peintButin() {
    if (!elButin) return;
    var ordreG = (MONDE_C && MONDE_C.stats) || [];
    peintFlot(SAC_PIEDS, ordreG);
    if (!SAC_PIEDS) { elButin.hidden = true; return; }
    var s = SAC_PIEDS;
    var couleur = COUL_SAC[s.s] || '#C9D3F2';
    var cases = (MONDE_C && MONDE_C.sac && MONDE_C.sac.cases) || 8;
    var ordre = (MONDE_C && MONDE_C.stats) || [];
    var html = [];
    for (var i = 0; i < cases; i++) {
      var o = s.c[i];
      if (!o) { html.push('<div class="nxp-c vide"></div>'); continue; }
      var d = contenuDeLaPlace(o, ordre);
      /* Plus de `title` : l'infobulle du navigateur met une seconde a venir,
         ne dit qu'un nom, et se superposerait a la vraie fiche. Le survol
         ouvre celle du jeu, qui porte les bonus — c'est devant un sac ouvert
         qu'on veut savoir si la piece vaut mieux que celle qu'on porte. */
      html.push('<div class="nxp-c" data-butin="' + i + '">' +
                d.html + marqueOG(o.og ? { og: true } : null) + '</div>');
    }
    elButinCases.innerHTML = html.join('');
    elButinNom.textContent = NOM_SAC[s.s] || 'Loot';
    elButinNom.style.color = couleur;
    elButin.style.borderTop = '1px dashed ' + couleur;
    elButin.hidden = false;
  }

  /* ---- DEUX GESTES POUR LE MEME RESULTAT ----
   *
   * Le DOUBLE-CLIC prend la piece et l'envoie dans le sac. Le clic simple
   * faisait la meme chose et c'etait une erreur : la case est aussi une
   * poignee de glissement, et un clic qui part legerement de travers devenait
   * un ramassage qu'on n'avait pas demande.
   *
   * Le GLISSEMENT fait le meme trajet a la main, et surtout il fait l'INVERSE
   * — poser une piece de son sac dans le sac au sol. C'est ce qui rend
   * l'echange possible : lacher son epee commune, prendre celle qu'on vient
   * de trouver, sans passer par le coffre.
   *
   * Dans les deux cas la page ne dit que « ce sac-la, cette place-la ». Le
   * serveur verifie qu'on est bien dessus — sans quoi nommer un identifiant
   * suffirait a vider un sac a l'autre bout de la carte. */
  function prendDuButin(place) {
    if (!SAC_PIEDS || !enLigne) return;
    debloqueSon();
    envoie({ type: SCENE === 'nexus' ? 'nexusRamasse' : 'realmRamasse',
             i: SAC_PIEDS.i, place: Number(place) });
  }
  /* Un simple appui sur la rangee flottante. C'est le seul endroit du jeu ou
     un clic simple prend quelque chose, et c'est justifie : cette case-la
     n'est pas une poignee. */
  if (elFlot) {
    elFlot.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-flot]') : null;
      if (!b) return;
      ev.preventDefault();
      prendDuButin(b.dataset.flot);
    });
  }
  if (elButinCases) {
    elButinCases.addEventListener('dblclick', function (ev) {
      var c = ev.target.closest ? ev.target.closest('[data-butin]') : null;
      if (!c) return;
      ev.preventDefault();
      prendDuButin(c.dataset.butin);
    });
  }

  function sacSousLesPieds() {
    /* Le hall a un sol lui aussi depuis qu'on peut y jeter une piece. La
       scene « coffre » n'en a pas : c'est une piece fermee, pas un lieu de
       rencontre. */
    if ((SCENE !== 'monde' && SCENE !== 'nexus') || !SACS_C.length) return null;
    var r = (MONDE_C && MONDE_C.sac && MONDE_C.sac.rayon) || 56;
    var pres = null, d2mini = r * r;
    for (var i = 0; i < SACS_C.length; i++) {
      var dx = SACS_C[i].x - joueur.x, dy = SACS_C[i].y - joueur.y;
      var d2 = dx * dx + dy * dy;
      /* Le PLUS PROCHE : deux sacs cote a cote et c'est celui de derriere
         qu'on ouvrirait. Meme regle que cote serveur, et c'est voulu — la
         grille doit montrer le sac que le serveur videra. */
      if (d2 <= d2mini) { d2mini = d2; pres = SACS_C[i]; }
    }
    return pres;
  }

  /* ---- LA PORTE SOUS NOS PIEDS ----
   *
   * La page le calcule pour AFFICHER le bouton, jamais pour decider. C'est le
   * serveur qui verifie qu'on est bien dessus quand on appuie — sans quoi
   * nommer un identifiant depuis la console suffirait a entrer dans un donjon
   * depuis l'autre bout de la carte, et un donjon est exactement ce qu'on
   * aurait interet a atteindre sans le meriter.
   *
   * Le rayon vient du serveur (`MONDE_C.portail.rayon`). L'ecrire ici en dur
   * aurait fait deux chiffres a tenir d'accord, et le desaccord serait le pire
   * des defauts : un bouton qui s'affiche a un endroit ou le serveur refuse
   * d'entrer, donc un bouton qui ne marche pas.
   */
  function portailSousLesPieds() {
    if (!PORTAILS_C.length) return null;
    var R = (MONDE_C && MONDE_C.portail && MONDE_C.portail.rayon) || 72;
    var pres = null, d2mini = R * R;
    for (var i = 0; i < PORTAILS_C.length; i++) {
      var p = PORTAILS_C[i];
      var dx = p.x - joueur.x, dy = p.y - joueur.y, d2 = dx * dx + dy * dy;
      if (d2 <= d2mini) { d2mini = d2; pres = p; }
    }
    return pres;
  }

  function regardePortails() {
    var p = portailSousLesPieds();
    /* La signature porte le SENS de la porte autant que son identite : une porte
       de donjon et une porte de retour ne mettent pas le meme mot sur le bouton,
       et deux portes qui se succedent au meme endroit doivent repeindre. */
    var signe = p ? (p.i + ':' + (p.rt ? 'r' : 'e') + ':' + (p.dj || '')) : '';
    if (signe === PORTAIL_SIGNE) return;
    PORTAIL_SIGNE = signe;
    PORTAIL_PIEDS = p;
    peintPorte();
  }

  /* ---- LE BOUTON, SOUS LE SAC ----
   *
   * Il n'apparait que quand on se tient sur une porte, et c'est tout ce qui
   * fait qu'entrer est un CHOIX. Une porte qui aspirerait en marchant dessus
   * enverrait dans le donjon le plus dur du jeu quelqu'un qui traversait pour
   * ramasser un sac — avec un equipement paye en argent reel, et une mort qui
   * le detruit.
   *
   * Il est SOUS le sac au sol et non par-dessus : quand les deux sont la, on
   * ramasse d'abord et l'on entre ensuite. C'est l'ordre dans lequel on veut
   * que ca se fasse, et la place du bouton le dit sans un mot. */
  function peintPorte() {
    if (!elPorte) return;
    var p = PORTAIL_PIEDS;
    if (!p || SCENE !== 'monde') { elPorte.hidden = true; return; }
    var retour = !!p.rt;
    elPorteBtn.textContent = retour ? 'EXIT' : 'ENTER';
    elPorteBtn.className = 'nxp-porte-b' + (retour ? ' retour' : '');
    elPorteNom.textContent = retour
      ? 'Back to the wild'
      : ('The ' + (p.dj || 'dungeon') + ' — enter?');
    /* Le compte a rebours, quand il y en a un. Une porte qui ne se referme
       jamais rend `null` : on n'ecrit alors rien, plutot qu'un « 0s » qui ferait
       croire qu'elle va disparaitre. */
    elPorteTemps.textContent = (p.r === null || p.r === undefined)
      ? '' : Math.max(0, Math.ceil(p.r)) + 's';
    elPorte.hidden = false;
  }

  function franchit() {
    var p = PORTAIL_PIEDS;
    if (!p || !enLigne) return;
    debloqueSon();
    /* La page ne nomme PAS la porte : elle dit « j'entre » ou « je sors », et le
       serveur trouve laquelle est sous les pieds. Nommer l'identifiant aurait
       suffi a franchir une porte a l'autre bout de la carte. */
    envoie({ type: p.rt ? 'realmSort' : 'realmPorte' });
  }

  function regardeSacs() {
    var s = sacSousLesPieds();
    /* La signature : l'identite du sac ET son contenu. Sans le contenu, prendre
       une potion dans un sac a deux places ne repeindrait pas la grille — la
       fiole prise resterait dessinee, et un deuxieme clic irait chercher une
       place qui n'existe plus. */
    var signe = s ? (s.i + ':' + s.c.map(function (o) { return o.st || o.po; }).join(',')) : '';
    if (signe === SAC_SIGNE) return;
    SAC_SIGNE = signe;
    SAC_PIEDS = s;
    peintButin();
  }

  // ------------------------------------------------------- la boucle

  var indiceEl = document.getElementById('nxIndice');
  var indiceActuel = null;

  function maj(dt) {
    /* Le classement se rafraichit tant qu'il est OUVERT, et pas autrement :
       un tableau ferme qu'on redemande toutes les cinq secondes, c'est une
       requete par joueur et par tranche de cinq secondes pour un ecran que
       personne ne regarde. Le serveur ne le fabrique qu'une fois par seconde,
       mais le message, lui, part quand meme. */
    if (rangOuvert && enLigne) {
      rangChrono -= dt;
      if (rangChrono <= 0) { rangChrono = 5; envoie({ type: 'leaderboardMonde', n: 20 }); }
    }
    if (PARALYSE > 0) PARALYSE = Math.max(0, PARALYSE - dt);
    if (RALENTI > 0) RALENTI = Math.max(0, RALENTI - dt);
    if (BRULURE > 0) BRULURE = Math.max(0, BRULURE - dt);
    /* Le manche PREND LE PAS quand on le tient : les deux sources donnent la
       meme chose — une direction — et les additionner ferait s'annuler un
       pouce qui pousse a droite et une touche restee enfoncee a gauche. Le
       geste en cours gagne. */
    var dx = MANCHE.actif ? MANCHE.x : (TOUCHES.right ? 1 : 0) - (TOUCHES.left ? 1 : 0);
    var dy = MANCHE.actif ? MANCHE.y : (TOUCHES.down ? 1 : 0) - (TOUCHES.up ? 1 : 0);
    /* ---- CLOUE AU SOL ----
     * On garde la DIRECTION du regard : se retourner n'est pas se deplacer,
     * et un personnage fige qui tire dans le dos de ce qu'il vise serait
     * absurde. Le tir, lui, n'est pas touche du tout — c'est toute la
     * difference entre paralyser et etourdir, et c'est ce qui laisse une
     * reponse au joueur au lieu de le faire regarder mourir. */
    if (PARALYSE > 0) {
      /* Le meme axe dominant qu'en marchant : un personnage fige doit regarder
         la ou l'on pousse, pas a cote. */
      if (dx || dy) {
        if (Math.abs(dx) >= Math.abs(dy)) joueur.dir = dx > 0 ? 'right' : 'left';
        else joueur.dir = dy > 0 ? 'down' : 'up';
      }
      dx = 0; dy = 0;
    }
    var bouge = dx !== 0 || dy !== 0;
    if (bouge) {
      var n = Math.sqrt(dx * dx + dy * dy);
      /* ---- LE RALENTISSEMENT SE SENT ICI ----
       * Le serveur BORNE, il ne deplace pas : c'est la page qui fait avancer
       * le personnage. Un ralentissement que seul le serveur connaitrait ne
       * se verrait donc pas — le joueur courrait normalement et se ferait
       * ramener en arriere par a-coups, ce qui se lit comme un defaut de
       * reseau et non comme une attaque. */
      var vit = VITESSE * (RALENTI > 0 ? FREIN : 1);
      var deX = joueur.x, deY = joueur.y;
      joueur.x += (dx / n) * vit * dt;
      joueur.y += (dy / n) * vit * dt;
      /* Les blocs n'existent que dans le monde de combat : le Nexus a ses
         propres murs, et sa liste est vide. */
      if (OBSTACLES_C.length) {
        var p = glisse(deX, deY, joueur.x, joueur.y);
        joueur.x = p.x; joueur.y = p.y;
      }
      /* ---- L'AXE DOMINANT, PAS « dx n'est pas nul » ----
       * Au clavier `dx` vaut 0 ou 1, et « non nul » suffisait. Le manche rend
       * une direction CONTINUE : pousser droit vers le haut donne un `dx` de
       * deux centiemes, et l'ancien test faisait alors regarder le personnage
       * a DROITE pendant qu'il monte. On compare donc les deux. */
      if (Math.abs(dx) >= Math.abs(dy)) joueur.dir = dx > 0 ? 'right' : 'left';
      else joueur.dir = dy > 0 ? 'down' : 'up';
    }
    if (bouge && pas.paused) pas.play().catch(function () {});
    else if (!bouge && !pas.paused) pas.pause();
    joueur.anim = saut.en_cours ? 'jump' : (bouge ? 'run' : 'idle');

    /* ---- DANS LA SALLE DU COFFRE ----
       Bornes du dallage, seuil de sortie, objet le plus proche. On sort tot :
       ni fontaine, ni lieux, ni envoi reseau ici — le serveur ne connait pas
       la salle, et continuer a lui envoyer notre position ferait glisser
       notre avatar a travers le Nexus pendant qu'on est a l'interieur. */
    /* Le repli se verifie a CHAQUE image, dans les deux scenes : on peut
       perdre sa vie n'importe ou, et un controle qui ne tourne que dans un
       lieu serait une protection qui s'eteint sans prevenir. */
    verifieRepli();

    /* ---- DANS LE MONDE ----
       Les bornes sont celles de la carte, la position part au serveur, et on
       tire vers ce qu'on vise. Rien d'autre : les degats, les morts et l'XP
       arrivent par messages, on ne les calcule pas. */
    if (SCENE === 'monde' && MONDE_C) {
      joueur.x = Math.min(Math.max(joueur.x, 40), MONDE_C.monde.w - 40);
      joueur.y = Math.min(Math.max(joueur.y, 40), MONDE_C.monde.h - 40);

      Object.keys(MONSTRES_C).forEach(function (k) {
        var e = MONSTRES_C[k];
        var t = Math.min(1, dt * 9);
        e.rx += (e.x - e.rx) * t; e.ry += (e.y - e.ry) * t;
        /* Le cadre avance avec la DISTANCE parcourue et non avec le temps :
           un monstre arrete ne doit pas pedaler sur place. */
        e.chrono += dt;
        if (e.chrono > 0.14) { e.chrono = 0; e.cadre = (e.cadre + 1) % 4; }
      });
      Object.keys(DISTANTS_M).forEach(function (k) {
        var d = DISTANTS_M[k];
        avanceCadre(d, d.skin, dt);
        var t = Math.min(1, dt * 10);
        d.rx += (d.x - d.rx) * t; d.ry += (d.y - d.ry) * t;
      });

      for (var fi = FLOTTANTS.length - 1; fi >= 0; fi--) {
        FLOTTANTS[fi].vie -= dt;
        if (FLOTTANTS[fi].vie <= 0) FLOTTANTS.splice(fi, 1);
      }

      /* Le couvercle des coffres. Il avance ICI et pas au dessin : une salle
         qu'on quitte des yeux une seconde ne doit pas retrouver son couvercle
         a mi-course en revenant. */
      for (var ci = 0; ci < SALLES_C.length; ci++) {
        var sc = SALLES_C[ci];
        if (!sc.vide) { sc.ouvre = 0; continue; }
        if (sc.ouvre === undefined) sc.ouvre = 0;
        if (sc.ouvre < COFFRE_OUVERTURE) sc.ouvre = Math.min(COFFRE_OUVERTURE, sc.ouvre + dt);
      }
      if (secousse > 0) secousse -= dt;

      /* On TIRE : le serveur applique la cadence, donc envoyer a chaque image
         ne donne pas plus de projectiles — seulement du trafic. On s'aligne
         sur la cadence de l'arme portee. */
      var aM = armeCourante();
      tireur.recharge -= dt;
      if ((tireur.presse || tireur.auto) && tireur.recharge <= 0) {
        var angM = angleDeTir(DERNIERE_CAM.x, DERNIERE_CAM.y);
        /* ---- LA POSITION PART AVEC LE TIR ----
         * Le serveur faisait naitre le projectile a la derniere position
         * annoncee — vieille d'au plus 120 ms. A l'arret, c'est la meme et on
         * touche. En COURANT, ce sont vingt-six unites de retard : le tir
         * naissait derriere le personnage, sur l'angle vise depuis l'avant,
         * et il passait a cote. On visait juste et on ratait.
         * Elle rejoint la liste des annonces comme un pas : le serveur nous
         * la renverra, et le recalage doit pouvoir la reconnaitre. */
        var tx = Math.round(joueur.x), ty = Math.round(joueur.y);
        envoie({ type: 'realmTir', a: angM, x: tx, y: ty });
        ENVOIS.unshift({ x: tx, y: ty });
        if (ENVOIS.length > 24) ENVOIS.pop();
        /* Le projectile part ICI, pas a la reponse du serveur. Meme raison
           que le son juste en dessous, en plus visible : il met un tick plus
           un aller-retour a revenir, et pendant ce cinquieme de seconde on a
           clique sans que rien ne bouge. Celui-ci ne fait aucun degat — le
           serveur reste seul juge de ce qui touche — il ne fait que se voir,
           et il s'efface des que le vrai arrive. */
        deviner(angM, joueur.x, joueur.y);
        /* Le son part ICI et non a la reponse du serveur : le projectile
           met un dixieme de seconde a revenir, et un tir qu'on entend apres
           l'avoir vu partir se lit comme un decalage, pas comme un tir. */
        joueSon(familleArme() || 'poing');
        /* La cadence du SERVEUR, pas celle de l'arme seule : elle porte deja
           la dexterite et la rafale. Se limiter a l'arme revenait a refuser
           la moitie de ses propres tirs. */
        tireur.recharge = 1 / (CADENCE_M || aM.cadence);
      }

      chronoEnvoi += dt;
      if (chronoEnvoi >= ENVOI_INTERVAL && enLigne) {
        chronoEnvoi = 0;
        var ax = Math.round(joueur.x), ay = Math.round(joueur.y);
        envoie({ type: 'realmMove', x: ax, y: ay, dir: joueur.dir, anim: joueur.anim });
        /* On garde ce qu'on vient d'annoncer. Le serveur nous renverra CETTE
           position-la, un aller-retour plus tard : c'est a elle qu'il faut la
           comparer, pas a l'endroit ou l'on est arrive entre-temps. */
        ENVOIS.unshift({ x: ax, y: ay });
        if (ENVOIS.length > 24) ENVOIS.pop();
      }
      regardeSacs();
      regardePortails();
      if (!saut.en_cours) avanceCadre(joueur, PERSO, dt);
      else {
        saut.chrono += dt;
        saut.cadre = Math.min(PERSONNAGES[PERSO].images - 1, Math.floor(saut.chrono * FPS_ANIM));
        if (saut.chrono >= saut.duree) saut.en_cours = false;
      }
      return;
    }

    if (SCENE === 'coffre') {
      joueur.x = Math.min(Math.max(joueur.x, SALLE.x0), SALLE.x1);
      joueur.y = Math.min(Math.max(joueur.y, SALLE.y0), SALLE.y1);
      /* Le portail ne mord qu'apres qu'on s'en soit ecarte une fois : sans
         ce verrou, apparaitre a portee suffirait a ressortir. */
      var px = joueur.x - SALLE.portail.x, py = joueur.y - SALLE.portail.y;
      var surPortail = px * px + py * py < SALLE.portail.r * SALLE.portail.r;
      if (!surPortail) SALLE.portailArme = true;
      else if (SALLE.portailArme) { sortCoffre(); return; }

      /* Les coffres : on marche dessus, le menu s'ouvre. On ne le REFERME pas
         en s'en allant — on vient peut-etre d'y changer une piece, le fermer
         sous les doigts serait pire que de le laisser ouvert. */
      var surCoffre = null;
      for (var ci = 0; ci < SALLE.coffres.length; ci++) {
        var cf = SALLE.coffres[ci];
        var cdx = joueur.x - cf.x, cdy = joueur.y - cf.y;
        if (cdx * cdx + cdy * cdy < cf.r * cf.r) { surCoffre = cf; break; }
      }
      /* ON NE ROUVRE PAS CE QU'ON VIENT DE FERMER. Le menu se rouvrait a
         l'image SUIVANTE : on est toujours sur le coffre, donc la condition
         « dessus et pas ouvert » redevenait vraie aussitot. La croix
         marchait — elle etait annulee un seizieme de seconde plus tard, ce
         qui se lit exactement comme un bouton mort. On retient donc le
         coffre qu'on a ferme, et on ne le rouvre qu'apres en etre parti. */
      coffreSous = surCoffre;
      if (surCoffre !== coffreFerme) coffreFerme = null;
      if (surCoffre && !coffreOuvert && surCoffre !== coffreFerme) ouvreCoffreMenu(surCoffre.role);

      var quoi = surPortail ? 'portail' : (surCoffre ? 'coffre' : 'salle');
      if (quoi !== indiceActuel) {
        indiceActuel = quoi;
        if (indiceEl) {
          indiceEl.innerHTML = quoi === 'portail'
            ? 'Step in to return to the <b>Nexus</b>'
            : quoi === 'coffre' ? 'Your <b>vault</b> is open'
            : 'Walk onto a chest to open your vault &middot; the portal takes you home';
          indiceEl.classList.add('on');
        }
      }
      if (!saut.en_cours) avanceCadre(joueur, PERSO, dt);
      else {
        saut.chrono += dt;
        saut.cadre = Math.min(PERSONNAGES[PERSO].images - 1, Math.floor(saut.chrono * FPS_ANIM));
        if (saut.chrono >= saut.duree) saut.en_cours = false;
      }
      return;
    }

    // bords du monde
    joueur.x = Math.min(Math.max(joueur.x, 40), MONDE.w - 40);
    joueur.y = Math.min(Math.max(joueur.y, 40), MONDE.h - 40);

    // la fontaine ne se traverse pas : on ressort le joueur au bord du cercle
    var f = FONTAINE;
    var fdx = joueur.x - f.x, fdy = joueur.y - (f.y - COL_FONT.dy);
    var fu = fdx / COL_FONT.rx, fv = fdy / COL_FONT.ry;
    var fdd = fu * fu + fv * fv;
    if (fdd < 1 && fdd > 1e-6) {
      var fk = 1 / Math.sqrt(fdd);       // de combien il faut s'ecarter
      joueur.x = f.x + fdx * fk;
      joueur.y = (f.y - COL_FONT.dy) + fdy * fk;
    }

    /* ---- LA BARRIERE DE L'ENCLOS ----
     * On repousse par le cote le PLUS PROCHE : quelqu'un qui arrive du sud
     * ressort par le sud, et l'on ne se retrouve jamais projete de l'autre
     * cote de la cloture pour avoir marche dessus de travers. */
    for (var bi = 0; bi < BARRIERES.length; bi++) {
      var b = BARRIERES[bi];
      if (joueur.x <= b.x0 || joueur.x >= b.x1 || joueur.y <= b.y0 || joueur.y >= b.y1) continue;
      var pg = joueur.x - b.x0, pd = b.x1 - joueur.x;
      var ph = joueur.y - b.y0, pb = b.y1 - joueur.y;
      var mini2 = Math.min(pg, pd, ph, pb);
      if (mini2 === pg) joueur.x = b.x0;
      else if (mini2 === pd) joueur.x = b.x1;
      else if (mini2 === ph) joueur.y = b.y0;
      else joueur.y = b.y1;
    }

    // le saut, en cadres, independamment du deplacement
    if (saut.en_cours) {
      saut.chrono += dt;
      saut.cadre = Math.min(PERSONNAGES[PERSO].images - 1, Math.floor(saut.chrono * FPS_ANIM));
      if (saut.chrono >= saut.duree) saut.en_cours = false;
    }

    // l'animation de marche/repos, en boucle — le saut a sa propre pendule plus haut
    if (!saut.en_cours) avanceCadre(joueur, PERSO, dt);

    // notre position part au serveur, au clavier — pas a chaque trame, le
    // reseau n'en tire rien de plus
    chronoEnvoi += dt;
    if (chronoEnvoi >= ENVOI_INTERVAL && enLigne) {
      chronoEnvoi = 0;
      envoie({ type: 'nexusMove', x: Math.round(joueur.x), y: Math.round(joueur.y),
               dir: joueur.dir, anim: joueur.anim });
    }
    /* Le hall a un sol : la grille du sac sous les pieds s'y ouvre comme dans
       le monde de combat. Meme fonction, parce que c'est la meme question. */
    regardeSacs();

    // les joueurs croises : leur cadre avance comme le notre, et leur
    // position AFFICHEE glisse vers la derniere recue plutot que d'y sauter
    Object.keys(DISTANTS).forEach(function (a) {
      var d = DISTANTS[a];
      avanceCadre(d, d.skin, dt);
      var t = Math.min(1, dt * 10);
      d.rx += (d.x - d.rx) * t;
      d.ry += (d.y - d.ry) * t;
    });

    // les lieux : proximite, entree apres un court sejour, indice affiche
    var proche = null, plusPresDist = Infinity, entre = false;
    LIEUX.forEach(function (l) {
      /* `return` dans un forEach ne sort que du tour courant. Sans ce verrou,
         entrer dans le coffre deplacerait le joueur dans la salle, et les
         lieux SUIVANTS seraient mesures avec ces coordonnees-la — on
         ressortirait aussitot par une porte qu'on n'a pas prise. */
      if (entre || !l.rayon) return;
      var ddx = joueur.x - l.x, ddy = joueur.y - (l.y - l.haut * 0.15);
      var dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist < l.rayon) {
        l.dwell += dt;
        if (l.dwell > 0.45) {
          if (l.cle === 'coffre') { entreCoffre(); entre = true; return; }
          /* Le portail menait au hall des jeux. Il mene au MONDE : c'est ce
             qu'un portail au milieu d'un nexus promet, et le hall a deja son
             bouton dans l'en-tete du panneau. */
          /* ---- LE LIEU PORTE SON MONDE ----
           * Le test etait `l.cle === 'portail'`. Ajouter une porte aurait
           * demande d'ajouter une cle ici, puis une troisieme le jour d'une
           * troisieme carte — et la porte qu'on aurait oublie d'inscrire
           * n'aurait rien fait, sans rien dire. C'est le LIEU qui nomme sa
           * destination ; cette ligne-ci ne la connait pas. */
          if (l.monde) {
            if (enLigne) envoie({ type: 'realmJoin', monde: l.monde });
            l.dwell = 0; entre = true; return;
          }
          /* Un lieu qui n'ouvre encore rien. On le laisse SUR la carte plutot
             que d'attendre qu'il soit fini : un batiment qu'on voit se
             construire donne une raison de revenir. Mais il doit le dire — un
             lieu ou l'on marche et ou rien ne se passe se lit comme un lieu
             casse, pas comme un lieu a venir. */
          if (l.bientot) { l.dwell = 0; entre = true; return; }
          /* L'etal etait le dernier endroit du Nexus qui faisait SORTIR du
             jeu pour acheter. Il ouvre son panneau sur place.
             Le garde-fou compte : le sejour se remet a zero et RECOMMENCE a
             s'accumuler tant qu'on reste dessus. Sans lui, la boutique se
             rouvrait toutes les demi-secondes et chaque reouverture
             redemandait son etat au serveur — ce qui effacait l'annonce du
             coffre qu'on venait d'ouvrir, sous les yeux du joueur. */
          if (l.cle === 'etal') {
            if (!shopOuvert && peutRouvrir('etal')) ouvreShop();
            l.dwell = 0; entre = true; return;
          }
          /* La table de blackjack, au sud. Meme geste que l'etal, meme repos :
             c'est le meme mecanisme, indexe par la cle du lieu. */
          if (l.cle === 'casino') {
            if (!bjOuvert && peutRouvrir('casino')) ouvreBj();
            l.dwell = 0; entre = true; return;
          }
          location.href = l.href;
        }
      } else {
        l.dwell = 0;
        /* On s'est ecarte : ce lieu cesse d'etre « celui qu'on vient de
           fermer ». Le repos de dix secondes, lui, court toujours. */
        quitteLieu(l.cle);
      }
      if (dist < l.rayon * 1.8 && dist < plusPresDist) { plusPresDist = dist; proche = l; }
    });
    if (entre) return;
    if (proche !== indiceActuel) {
      indiceActuel = proche;
      if (indiceEl) {
        if (proche) {
          indiceEl.innerHTML = proche.bientot
            ? '<b>' + proche.nom + '</b> &middot; opening soon'
            : 'Walk in to open <b>' + proche.nom + '</b>';
          indiceEl.classList.add('on');
        }
        else indiceEl.classList.remove('on');
      }
    }
  }

  /* ================== LE ZOOM ==================
   *
   * Le monde etait dessine en 1:1 : sur un grand ecran on voyait donc la
   * carte ENTIERE, minuscule, avec du vide tout autour — et sur un petit
   * ecran, un mouchoir de poche. La taille du personnage dependait du
   * moniteur, ce qu'aucun jeu ne fait.
   *
   * On fixe desormais la HAUTEUR DE MONDE visible et on met a l'echelle
   * pour la faire tenir. Le joueur voit toujours la meme chose, sur un
   * telephone comme sur un ecran large — c'est la regle de RotMG, et c'est
   * aussi la seule qui rende le jeu equitable : sinon un grand ecran verrait
   * arriver les monstres plus tot.
   *
   * On ne descend jamais sous 1 : agrandir des pixels est acceptable, les
   * reduire rend le pixel art sale. */
  /* ---- COMBIEN DE MONDE ON VOIT ----
   *
   * Le zoom n'etait borne qu'en HAUT (jamais plus de 4) et bloque a 1 en bas.
   * Sur telephone, la fenetre utile fait six cent quarante pixels de haut : le
   * calcul rendait 0,64, la borne le remontait a 1, et l'ecran montrait donc
   * SIX CENT QUARANTE unites de monde la ou un ordinateur en montre mille.
   * Le plus petit ecran voyait le moins loin — exactement l'inverse de ce
   * qu'il faut, puisque c'est la qu'on a le moins de place pour reagir.
   *
   * Au doigt, on vise donc plus large ET l'on autorise le zoom a descendre
   * sous 1. La borne basse n'est pas un gout : sous 0,55 un personnage de
   * quatre-vingts unites tombe a quarante pixels et les petites creatures a
   * quinze — on ne les distingue plus du decor, et un jeu ou l'on ne voit pas
   * ce qui tire n'est pas plus lisible parce qu'il montre plus de terrain.
   *
   * `pointer: coarse` et pas la largeur : c'est le DOIGT qui change le besoin,
   * pas la taille de la fenetre. Une tablette large au doigt a le meme
   * probleme qu'un telephone, et une petite fenetre de navigateur a la souris
   * ne l'a pas. */
  var TACTILE = (function () {
    try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); }
    catch (e) { return false; }
  })();
  var MONDE_VISIBLE_H = 1000;         // unites de monde vues verticalement
  var MONDE_VISIBLE_TACTILE = 1400;   // au doigt : plus haut, on voit venir
  /* ---- ET C'EST UN REGLAGE, PAS UN CHIFFRE EN DUR ----
   *
   * « Je veux voir plus loin » n'a pas de bonne reponse universelle : plus
   * large montre les creatures plus tot, plus serre les garde lisibles. Un
   * telephone de six pouces et une tablette n'ont pas le meme arbitrage, et
   * personne ici ne peut le trancher a la place du joueur. On lui donne donc
   * le curseur, et on garde son choix.
   *
   * La BORNE BASSE du zoom suit la cible au lieu d'etre fixe. Elle valait
   * 0,55 en dur : au-dela de mille cent soixante unites le calcul rendait
   * moins, la borne le remontait, et le curseur n'aurait plus rien fait
   * passe la moitie de sa course — un reglage qui ne repond plus est pire
   * qu'un chiffre fige, parce qu'on croit avoir regle quelque chose.
   *
   * Elle ne descend pas sous 0,38 pour autant : a ce zoom un personnage de
   * quatre-vingts unites fait trente pixels et les petites creatures une
   * douzaine. Un jeu ou l'on ne distingue plus ce qui tire n'est pas plus
   * lisible parce qu'il montre plus de terrain. */
  var VUE_MIN = 900, VUE_MAX = 1800;
  var CLE_VUE = 'swogeNexusVue';
  var vueChoisie = 0;                 // 0 = pas de choix : on prend le defaut
  try {
    var vv = parseInt(localStorage.getItem(CLE_VUE) || '', 10);
    if (vv >= VUE_MIN && vv <= VUE_MAX) vueChoisie = vv;
  } catch (e) {}
  function cibleVue() {
    if (vueChoisie) return vueChoisie;
    return TACTILE ? MONDE_VISIBLE_TACTILE : MONDE_VISIBLE_H;
  }
  function zoomCourant(vueH) {
    var cible = cibleVue();
    /* Sur un ecran a la souris on ne reduit jamais sous 1 tant que le joueur
       n'a rien demande : agrandir des pixels est acceptable, les reduire rend
       le pixel art sale. Des qu'il regle, c'est lui qui decide. */
    var mini = (TACTILE || vueChoisie) ? 0.38 : 1;
    return Math.max(mini, Math.min(4, vueH / cible));
  }

  /* ---- LE CURSEUR VIT ICI, PAS AVEC LES AUTRES REGLAGES ----
   * Il etait cable plus haut, avec l'auto-Nexus. `vueChoisie` et `TACTILE`
   * sont declares ICI : plus haut dans le fichier ils existent (var), mais ne
   * valent encore RIEN. Le curseur se peignait donc avec la valeur par defaut
   * au lieu du choix relu, et l'on rouvrait les reglages sur un chiffre qui
   * n'etait pas celui qu'on subissait. */
  /* ---- LE CURSEUR DE DISTANCE DE VUE ----
   * Il agit tout de suite : le zoom est relu a chaque image, il n'y a donc
   * rien a rafraichir. Ce qui compte est de GARDER le choix — un reglage
   * qu'on refait a chaque visite n'est pas un reglage. */
  var elVuePct = document.getElementById('nxVuePct');
  var elVueVal = document.getElementById('nxVueVal');
  function peintVue() {
    var v = cibleVue();
    if (elVuePct) elVuePct.value = String(v);
    /* On affiche ce qu'on VOIT, pas ce qu'on a demande. Sur un petit ecran la
       borne du zoom mord avant le haut de la course : un curseur qui annonce
       mille huit cents quand on en voit mille six cent quatre-vingts ment, et
       le joueur croit que le reglage ne marche plus alors qu'il est au bout. */
    if (elVueVal) {
      var h = window.innerHeight || 640;
      elVueVal.textContent = String(Math.round(h / zoomCourant(h)));
    }
  }
  if (elVuePct) elVuePct.addEventListener('input', function () {
    var v = Math.max(VUE_MIN, Math.min(VUE_MAX, Number(elVuePct.value) || 0));
    vueChoisie = v;
    try { localStorage.setItem(CLE_VUE, String(v)); } catch (e) {}
    peintVue();
  });
  peintVue();
  /* Tourner le telephone change la hauteur, donc ce qu'on voit : le chiffre
     doit suivre, sinon il decrit l'ecran d'avant. */
  window.addEventListener('resize', peintVue);

  function camAxe(pos, vue, monde) {
    if (monde <= vue) return (monde - vue) / 2;
    return Math.min(Math.max(pos - vue / 2, 0), monde - vue);
  }

  /* La largeur que le panneau prend sur la droite. On la LIT plutot que de la
     recopier : elle est definie en CSS (`--nxp`) et change avec la taille de
     l'ecran — deux chiffres a tenir d'accord finiraient par diverger, et le
     personnage se retrouverait a moitie cache derriere le panneau sur une
     seule des trois tailles. */
  function largeurPanneau() {
    var p = document.getElementById('nxPanneau');
    if (!p) return 0;
    var cs = getComputedStyle(p);
    if (cs.display === 'none') return 0;
    /* Replie, il est toujours LA — juste pousse hors de l'ecran par un
       `translateX`. Sa largeur mesuree reste donc la meme, et s'y fier
       laisserait le joueur decale a gauche pour rien. On lit l'etat, pas la
       geometrie. */
    if (enveloppe && enveloppe.classList.contains('replie')) return 0;
    return p.getBoundingClientRect().width || 0;
  }

  function dessine(dt) {
    dt = dt || 0;
    var vueW = canvas.width / DPR, vueH = canvas.height / DPR;
    var zoom = zoomCourant(vueH);
    /* On centre le joueur sur la partie VISIBLE, pas sur la fenetre : sinon
       il marche sous le panneau, et on avance a l'aveugle vers la droite. */
    /* La largeur libre, convertie en unites de MONDE : c'est en monde que la
       camera se cadre, et melanger les deux mettrait le personnage a cote du
       centre des que le zoom change. */
    var libre = Math.max(120, vueW - largeurPanneau()) / zoom;
    var hauteurMonde = vueH / zoom;
    /* `camAxe` cadre sur la largeur LIBRE : le joueur se retrouve donc au
       milieu de ce qu'on voit. Le canvas, lui, continue de peindre toute la
       fenetre — le surplus passe derriere le panneau, ce qui evite une bande
       vide a sa gauche quand on longe le bord droit de la carte. */
    var lieu = scene();
    var camX = camAxe(joueur.x, libre, lieu.w);
    var camY = camAxe(joueur.y, hauteurMonde, lieu.h);

    ctx.save();
    ctx.scale(DPR, DPR);
    ctx.fillStyle = '#0A1128';
    ctx.fillRect(0, 0, vueW, vueH);
    /* Le pixel art se met a l'echelle SANS lissage : interpole, il devient
       flou et perd exactement ce qui fait son style. */
    ctx.imageSmoothingEnabled = false;
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    /* ---- LE MONDE DE COMBAT ----
       Le sol par anneaux, les monstres, les autres, et nos projectiles. Tout
       vient du serveur ; on ne fait que le poser a l'ecran. */
    if (SCENE === 'monde' && MONDE_C) {
      var TM = MONDE_C.monde.tuile || 128;
      var mc0 = Math.max(0, Math.floor(camX / TM));
      var mc1 = Math.floor((camX + libre + TM) / TM);
      var mr0 = Math.max(0, Math.floor(camY / TM));
      var mr1 = Math.floor((camY + hauteurMonde + TM) / TM);
      for (var mr = mr0; mr <= mr1; mr++) {
        for (var mc = mc0; mc <= mc1; mc++) {
          /* ---- DANS UN DONJON, LE SOL S'ARRETE ----
           * Dehors, chaque tuile de la carte a un sol : c'est un monde, il n'a
           * pas de bord visible. Un donjon en a un, et c'est ce qui le fait lire
           * comme un INTERIEUR. Un sol de pierre etale jusqu'a l'horizon aurait
           * donne l'impression d'un deuxieme monde ouvert dont on aurait bati
           * trois pieces au milieu — et les murs n'auraient plus rien enferme.
           * On ne devine pas la forme : elle est arrivee avec l'entree. */
          if (TUILES_D && !TUILES_D[mc + ',' + mr]) continue;
          var b = biomeEn(mc * TM + TM / 2, mr * TM + TM / 2);
          var img = TUILES_M[b];
          if (img && img.complete) ctx.drawImage(img, mc * TM, mr * TM, TM, TM);
        }
      }

      /* La dalle des salles PAR-DESSUS le sol de l'anneau, et sous tout le
         reste : c'est un sol, pas un objet. C'est elle qui rend une salle
         visible de loin — donc qui en fait une destination. */
      dessineSalles();
      /* Les balises allumees, au sol, sous tout le reste : elles disent « ici
         c'est fait » et « on peut revenir ici », deux choses qu'on veut lire
         de loin sans entrer. */
      for (var iB = 0; iB < BALISES_C.length; iB++) {
        var bb = BALISES_C[iB];
        if (Math.abs(bb.x - joueur.x) > 2200 || Math.abs(bb.y - joueur.y) > 2000) continue;
        dessineBalise(bb);
      }

      /* L'aura de rafale d'abord : elle est au SOL, sous tout le monde. */
      peintRafale(dt);
      /* Le cercle qui previent, et l'onde qui suit : au sol eux aussi. Poses
         par-dessus les creatures, ils cacheraient ce qu'on doit regarder pour
         en sortir. */
      dessineZones();
      peintOndes(dt);

      /* Tout ce qui marche se trie par les PIEDS : ce qui est plus bas passe
         devant, comme dans le Nexus. */
      var pileM = [];
      /* Les pierres se trient AVEC les vivants : un joueur qui passe derriere
         une tombe doit passer derriere, pas devant. C'est un objet au sol
         comme un autre, et le traiter a part le ferait flotter. */
      TOMBES_C.forEach(function (t) {
        pileM.push({ y: t.y, dessine: function () { dessineTombe(t); } });
      });
      /* Les sacs se trient avec les vivants, comme les pierres : un sac pose
         devant un monstre doit passer devant lui. */
      SACS_C.forEach(function (s) {
        pileM.push({ y: s.y, dessine: function () { dessineSac(s); } });
      });
      /* Les portes aussi. Une porte dessinee par-dessus tout aurait recouvert la
         creature qu'on combat devant ; dessinee sous tout, elle aurait disparu
         derriere le sac qu'elle accompagne. Elle se trie par les pieds, comme le
         reste — c'est un objet au sol. */
      PORTAILS_C.forEach(function (p) {
        pileM.push({ y: p.y, dessine: function () { dessinePorte(p); } });
      });
      /* Les blocs se trient avec les vivants : passer DERRIERE un rocher doit
         se voir, sinon on ne comprend pas qu'il fait couvert. On ne pousse
         que ceux qui sont a l'ecran — deux cent quarante dessins par image
         dont deux cents hors champ seraient du travail pur. */
      /* Le coffre se trie avec les vivants : passer DERRIERE lui doit se
         voir, comme derriere un rocher. */
      SALLES_C.forEach(function (sa) {
        if (Math.abs(sa.x - joueur.x) > 1400 || Math.abs(sa.y - joueur.y) > 1100) return;
        pileM.push({ y: sa.y, dessine: function () { dessineCoffre(sa); } });
      });
      OBSTACLES_C.forEach(function (o) {
        /* Autour du JOUEUR, pas autour de `camX` : celui-la est le bord
           gauche du cadrage, pas son centre, et le seuil aurait rogne les
           rochers de droite sur un ecran large. */
        if (Math.abs(o.x - joueur.x) > 1400 || Math.abs(o.y - joueur.y) > 1100) return;
        pileM.push({ y: o.y, dessine: function () { dessineObstacle(o); } });
      });
      Object.keys(MONSTRES_C).forEach(function (k) {
        var e = MONSTRES_C[k];
        pileM.push({ y: e.ry, dessine: function () { dessineMonstre(e); } });
      });
      Object.keys(DISTANTS_M).forEach(function (k) {
        var d = DISTANTS_M[k];
        pileM.push({ y: d.ry, dessine: function () {
          /* ---- UN COEQUIPIER SE RECONNAIT AVANT D'ETRE LU ----
           * A dix personnages a l'ecran, chercher un nom au-dessus d'une tete
           * pendant qu'on esquive coute le combat. Un carre vert au sol se lit
           * sans lecture — vert, comme tout ce qui est acquis dans ce jeu.
           * Il est dessine AU SOL et sous les pieds : par-dessus, il cacherait
           * justement ce qu'on regarde. */
          if (d.ami) {
            ctx.save();
            ctx.strokeStyle = 'rgba(124,255,155,.9)';
            ctx.lineWidth = 2;
            ctx.strokeRect(d.rx - 15, d.ry - 8, 30, 16);
            ctx.fillStyle = 'rgba(124,255,155,.16)';
            ctx.fillRect(d.rx - 15, d.ry - 8, 30, 16);
            ctx.restore();
          }
          dessineAvatar(d.rx, d.ry, d.skin, d.dir, d.anim, d.cadre);
          barreVie(d.rx, d.ry, d.pv, d.pvMax, 44);
        } });
      });
      pileM.push({ y: joueur.y, dessine: function () {
        /* ---- CLOUE AU SOL, ET CA SE VOIT ----
         * Un anneau sous les pieds qui se REFERME : il dit a la fois « tu ne
         * bouges pas » et « encore combien de temps ». Sans le second, on
         * appuie sur les touches au hasard en croyant a un blocage du jeu.
         * Il est dessine AVANT le personnage, au sol : par-dessus, il
         * cacherait justement ce qu'on regarde. */
        /* ---- LES TROIS ETATS, TROIS ANNEAUX ----
         * Chacun se referme sur lui-meme pour dire combien de temps il reste.
         * Sans ce second signe, on appuie sur les touches au hasard en
         * croyant a un blocage du jeu. Trois RAYONS differents pour qu'ils se
         * lisent meme quand ils se superposent — rien n'interdit d'etre
         * paralyse, ralenti et en feu en meme temps. */
        /* La PARALYSIE a son propre dessin : des entraves de pierre qui se
           referment. Elle garde quand meme son anneau — le dessin dit « tu es
           pris », l'anneau dit « encore combien de temps », et les deux
           questions se posent en meme temps. */
        if (PARALYSE > 0 && IMG_PARA && IMG_PARA.complete && IMG_PARA.naturalWidth
            && MONDE_C && MONDE_C.effets) {
          var pcw = IMG_PARA.naturalWidth / PARA_CADRES;
          var pch = IMG_PARA.naturalHeight;
          /* Les entraves se REFERMENT : on lit les images a l'envers du temps
             qui reste, donc de la pierre fendue vers l'etau complet. */
          var av = 1 - PARALYSE / MONDE_C.effets.paralyse.duree;
          var pc = Math.min(PARA_CADRES - 1, Math.floor(av * PARA_CADRES));
          var PT = 96;
          ctx.save();
          ctx.globalAlpha = 0.92;
          ctx.drawImage(IMG_PARA, pc * pcw, 0, pcw, pch,
                        joueur.x - PT / 2, joueur.y - PT * 0.40, PT, PT * 0.58);
          ctx.restore();
        }
        var etats = MONDE_C && MONDE_C.effets ? [
          { reste: PARALYSE, max: MONDE_C.effets.paralyse.duree, c: '#C07BFF', r: 34 },
          { reste: RALENTI,  max: MONDE_C.effets.ralenti.duree,  c: '#7CC8FF', r: 42 },
          { reste: BRULURE,  max: MONDE_C.effets.brulure.duree,  c: '#FF9142', r: 26 },
        ] : [];
        etats.forEach(function (e) {
          if (!(e.reste > 0)) return;
          var part = Math.max(0, Math.min(1, e.reste / e.max));
          ctx.save();
          ctx.strokeStyle = e.c;
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.ellipse(joueur.x, joueur.y + 4, e.r, e.r * 0.44, 0, -Math.PI / 2,
                      -Math.PI / 2 + part * Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = e.c;
          ctx.beginPath();
          ctx.ellipse(joueur.x, joueur.y + 4, e.r, e.r * 0.44, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
        var cM = joueur.anim === 'jump' ? saut.cadre : joueur.cadre;
        dessineAvatar(joueur.x, joueur.y, PERSO, joueur.dir, joueur.anim, cM);
        /* ---- SA VIE ET SON MANA, SOUS SES PIEDS ----
         * Les deux jauges vivaient dans le panneau, en haut a droite. Or on
         * ne regarde pas le coin de l'ecran pendant un combat : on regarde
         * son personnage. On les lisait donc APRES, en mourant.
         * Elles sont ici pour tout le monde, souris comme doigt — sur
         * telephone le panneau est souvent replie, et c'etait alors le seul
         * endroit ou la vie s'affichait. */
        barreVieMana(joueur.x, joueur.y, VIE.pv, VIE.max, VIE.mp, VIE.mpMax, 56);
      } });
      pileM.sort(function (a, b) { return a.y - b.y; });
      pileM.forEach(function (p) { p.dessine(); });

      dessineTirsMonde();
      peintCoups(dt);
      peintNiveaux(dt);
      /* Les traces des pouvoirs par-dessus tout, mais AVANT `restore` : elles
         sont posees en coordonnees du monde comme le reste de la scene. */
      peintEffetsPouvoir(dt);
      peintSoins(dt);
      ctx.restore();
      DERNIERE_CAM.x = camX; DERNIERE_CAM.y = camY; DERNIERE_CAM.z = zoom;
      /* APRES `restore` : la boussole est a l'ecran, pas dans le monde. Et
         apres la camera, parce qu'elle a besoin du zoom du tour en cours pour
         savoir jusqu'ou l'on voit. */
      peintBoussole(dt);
      peintFlottants();
      return;
    }

    /* ---- LA SALLE DU COFFRE ----
       Un seul dessin, mis a l'echelle de la piece : pas de tuiles a decouper,
       la salle EST une image. On sort tot, le Nexus ne la concerne pas. */
    if (SCENE === 'coffre') {
      if (SALLE.img.complete) ctx.drawImage(SALLE.img, 0, 0, SALLE.w, SALLE.h);
      /* Un halo doux sous chaque coffre : le dessin de la piece en montre
         cinq, mais rien n'y dit qu'on peut marcher dessus. */
      /* Deux couleurs pour deux usages : l'or pour les objets, le violet pour
         les personnages. Le meme halo partout ferait croire a deux portes
         vers la meme piece. */
      SALLE.coffres.forEach(function (cf) {
        halo(cf.x, cf.y, cf.r, cf.role === 'skins' ? '#C07BFF' : '#FFC53D', 0.18);
      });
      var pileC = [{ y: SALLE.portail.y, dessine: dessinePortail }];
      pileC.push({ y: joueur.y, dessine: function () {
        var cadreC = joueur.anim === 'jump' ? saut.cadre : joueur.cadre;
        dessineAvatar(joueur.x, joueur.y, PERSO, joueur.dir, joueur.anim, cadreC);
      } });
      pileC.sort(function (a, b) { return a.y - b.y; });
      pileC.forEach(function (p) { p.dessine(); });
      ctx.restore();
      DERNIERE_CAM.x = camX; DERNIERE_CAM.y = camY; DERNIERE_CAM.z = zoom;
      return;
    }

    // le sol : seulement les tuiles qui touchent l'ecran
    var c0 = Math.max(0, Math.floor(camX / TUILE));
    var c1 = Math.min(CARTE.cols - 1, Math.ceil((camX + libre + TUILE) / TUILE));
    var r0 = Math.max(0, Math.floor(camY / TUILE));
    var r1 = Math.min(CARTE.rows - 1, Math.ceil((camY + hauteurMonde + TUILE) / TUILE));
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var cx = c * TUILE + TUILE / 2, cy = r * TUILE + TUILE / 2;
        var t = solEn(cx, cy);
        if (t.complete) ctx.drawImage(t, c * TUILE, r * TUILE, TUILE, TUILE);
      }
    }

    // les lieux, le joueur et les autres, tries par leurs "pieds" : ce qui
    // est plus bas a l'ecran se dessine par-dessus, comme dans n'importe
    // quelle vue du dessus a la RotMG.
    var pile = LIEUX.map(function (l) { return { y: l.y, dessine: function () {
      if (l.img.complete) ctx.drawImage(l.img, l.x - l.larg / 2, l.y - l.haut, l.larg, l.haut);
    } }; });
    pile.push({ y: joueur.y, dessine: function () {
      var cadre = joueur.anim === 'jump' ? saut.cadre : joueur.cadre;
      dessineAvatar(joueur.x, joueur.y, PERSO, joueur.dir, joueur.anim, cadre);
    } });
    /* Les sacs poses dans le hall se trient avec les vivants, comme dans le
       monde de combat : un sac pose devant quelqu'un doit passer devant lui.
       Meme fonction de dessin — c'est le meme sac, il doit se reconnaitre. */
    /* ---- LA CLOTURE ET LES MEUBLES DE L'ENCLOS ----
     * Dans la MEME pile que les vivants : on passe devant la barriere du bas
     * et derriere celle du haut, ce qui est exactement ce qu'on attend en
     * entrant dans une cour. Les dessiner a part, avant ou apres tout le
     * monde, aurait donne un joueur soit toujours devant, soit toujours
     * derriere — et l'enclos aurait cesse d'etre un lieu. */
    CLOTURE.forEach(function (c) {
      pile.push({ y: c.y, dessine: function () {
        if (!c.p.img.complete || !c.p.img.naturalWidth) return;
        var L = c.larg || c.p.larg, H = c.haut || c.p.haut;
        if (!c.mir) { ctx.drawImage(c.p.img, c.x - L / 2, c.y - H, L, H); return; }
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(-1, 1);
        ctx.drawImage(c.p.img, -L / 2, -H, L, H);
        ctx.restore();
      } });
    });
    if (IMG_FERME_DECOR.complete && IMG_FERME_DECOR.naturalWidth) {
      var cadreM = IMG_FERME_DECOR.naturalHeight;   // quatre cases carrees
      FERME_MEUBLES.forEach(function (m) {
        pile.push({ y: m.y, dessine: function () {
          ctx.drawImage(IMG_FERME_DECOR, m.col * cadreM, 0, cadreM, cadreM,
                        m.x - m.taille / 2, m.y - m.taille, m.taille, m.taille);
        } });
      });
    }
    SACS_C.forEach(function (sc) {
      pile.push({ y: sc.y, dessine: function () { dessineSac(sc); } });
    });
    Object.keys(DISTANTS).forEach(function (a) {
      var d = DISTANTS[a];
      pile.push({ y: d.ry, dessine: function () {
        dessineAvatar(d.rx, d.ry, d.skin, d.dir, d.anim, d.cadre);
      } });
    });
    pile.sort(function (a, b) { return a.y - b.y; });
    pile.forEach(function (p) { p.dessine(); });

    /* ---- COMBIEN SONT DERRIERE CHAQUE PORTE ----
     *
     * Deux portes identiques a la couleur pres posent une question, et le
     * chiffre est la moitie de la reponse : on entre la ou il y a quelqu'un.
     * A trente-neuf joueurs, une carte vide est le seul echec possible du
     * systeme, et un horaire annonce ne le regle qu'a l'heure dite.
     *
     * Il se dessine APRES la pile, jamais dedans : c'est une etiquette, pas
     * un objet du monde. La trier avec les vivants l'aurait fait passer
     * derriere le portail qu'elle decrit. */
    if (PORTES_C) {
      LIEUX.forEach(function (l) {
        if (!l.monde) return;
        var n = PORTES_C[l.monde];
        if (typeof n !== 'number') return;
        var t = n === 0 ? 'empty' : n === 1 ? '1 inside' : n + ' inside';
        var y = l.y - l.haut - 12;
        ctx.save();
        ctx.font = '800 13px Archivo, system-ui, sans-serif';
        ctx.textAlign = 'center';
        var w = ctx.measureText(t).width + 18;
        ctx.fillStyle = 'rgba(8,11,18,.82)';
        ctx.strokeStyle = n > 0 ? 'rgba(124,255,155,.55)' : 'rgba(255,255,255,.18)';
        ctx.lineWidth = 2;
        /* Une pilule, pas un rectangle : le Nexus n'a pas un seul angle
           droit, et un cadre carre au-dessus d'une arche se voit comme une
           piece rapportee. */
        var x0 = l.x - w / 2, y0 = y - 20, h = 24, r = 12;
        ctx.beginPath();
        ctx.moveTo(x0 + r, y0);
        ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
        ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
        ctx.arcTo(x0, y0 + h, x0, y0, r);
        ctx.arcTo(x0, y0, x0 + w, y0, r);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = n > 0 ? '#8CFFB4' : '#8DA0C4';
        ctx.fillText(t, l.x, y - 3);
        ctx.textAlign = 'start';
        ctx.restore();
      });
    }

    /* Les projectiles passent PAR-DESSUS tout le monde : ils volent, ils ne
       marchent pas. Les trier avec les personnages les ferait disparaitre
       derriere une fontaine a mi-course. */
    dessineTirs();
    /* Le soin de la fontaine se joue ICI, dans le Nexus : c'est en rentrant
       qu'on est soigne. */
    peintSoins(dt);

    ctx.restore();
    /* La camera de CETTE image sert a convertir le curseur en coordonnees
       monde au tir suivant. La retenir ici evite de la recalculer, et surtout
       d'en utiliser une autre que celle qu'on vient de peindre. */
    DERNIERE_CAM.x = camX; DERNIERE_CAM.y = camY; DERNIERE_CAM.z = zoom;
  }
  var DERNIERE_CAM = { x: 0, y: 0, z: 1 };

  /** Une tache lumineuse posee au sol : « ici, il se passe quelque chose »,
      sans poser un second dessin par-dessus le decor. */
  function halo(x, y, r, couleur, force) {
    ctx.save();
    ctx.globalAlpha = force;
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* Le portail du coffre : le MEME dessin que celui du Nexus, en plus petit.
     Reutiliser l'image plutot que d'en inventer une seconde fait qu'un joueur
     reconnait la sortie sans qu'on la lui explique. */
  function dessinePortail() {
    var p = SALLE.portail;
    halo(p.x, p.y, p.r, '#8FD4FF', 0.24);
    var img = PORTAIL_L && PORTAIL_L.img;
    if (img && img.complete) ctx.drawImage(img, p.x - p.larg / 2, p.y - p.haut, p.larg, p.haut);
  }

  /* Un monstre : la rangee de l'atlas EST sa direction, l'index sa marche.
     C'est le decoupage qui l'a garanti, pas une table ici. */
  var DIRS_M = { up: 0, down: 1, left: 2, right: 3 };
  /* ---- LA TAILLE D'UNE CREATURE N'EST PAS UNE DEUXIEME TABLE ----
   *
   * Toutes etaient dessinees a 118 px, quel que soit leur rayon : un insecte
   * et un colosse se ressemblaient de loin, et la seule facon de savoir ce
   * qui arrivait etait de lire sa barre de vie.
   *
   * Le serveur connait deja le RAYON de chacune — c'est lui qui tranche les
   * collisions et les tirs qui portent. Le dessin en decoule. Ecrire une
   * table de tailles a cote serait la deuxieme table qui finit par ne plus
   * dire la meme chose que la premiere, et ce desaccord-la se verrait :
   * on tirerait a cote de ce qu'on voit.
   *
   * Le rapport est cale sur ce qui existait — rayon moyen des huit especes
   * 39, et 39 x 3 rend les 118 d'avant. Rien ne bouge pour elles, les
   * nouvelles se rangent toutes seules. */
  var RAPPORT_M = 3.0, TAILLE_M_DEFAUT = 118;
  function tailleDe(espece) {
    var t = MONDE_C && MONDE_C.especes && MONDE_C.especes[espece];
    return t && t.rayon ? t.rayon * RAPPORT_M : TAILLE_M_DEFAUT;
  }
  /* Le cote d'une case de l'atlas se LIT sur l'image : quatre directions,
     quatre images de marche, donc toujours un quart de sa largeur. Le 128
     ecrit en dur obligeait chaque nouvelle creature a se plier au format des
     anciennes, meme quand elle est huit fois plus grosse. */
  function cadreDe(img) { return img.naturalWidth / 4; }
  /* Le canevas de teinte, cree UNE fois et reutilise. En creer un par
     monstre et par image ferait naitre des dizaines de canevas par seconde,
     que le ramasse-miettes paierait au pire moment — pendant un combat. */
  var GEL = null;
  function gel(cote) {
    if (!GEL) {
      GEL = { el: document.createElement('canvas'), ctx: null, cote: 0 };
      GEL.ctx = GEL.el.getContext('2d');
    }
    /* On ne l'agrandit que vers le HAUT, jamais on ne le retaille au plus
       juste : ecrire `width` vide le contexte, ce qui remettrait le lissage
       a « oui » — donc flouterait le pixel art — a chaque changement de
       creature dans une melee. */
    if (cote > GEL.cote) {
      GEL.el.width = GEL.el.height = cote;
      GEL.cote = cote;
      GEL.ctx.imageSmoothingEnabled = false;
    }
    return GEL;
  }

  function dessineMonstre(e) {
    var img = ATLAS_M[e.espece];
    if (!img || !img.complete || !img.naturalWidth) return;
    var r = DIRS_M[e.dir] === undefined ? 1 : DIRS_M[e.dir];
    var C = cadreDe(img), T = tailleDe(e.espece);
    /* ---- UN MONSTRE FIGE SE VOIT ----
     * Deux marques, parce qu'une seule ne suffit pas : un ANNEAU au sol dit
     * « celui-la est pris », et le sprite vire au bleu glace. L'anneau seul se
     * perdrait dans une melee a dix monstres ; la teinte seule passerait
     * inapercue sur un revenant des glaces, qui est deja bleu. */
    var fige = e.stase > 0;
    if (fige) {
      ctx.save();
      ctx.strokeStyle = 'rgba(157,232,255,.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(e.rx, e.ry + 4, T * 0.36, T * 0.17, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    var sx = e.rx - T / 2, sy = e.ry - T + 14;
    /* ---- LA MEDUSE EMPRUNTE UN DESSIN, PAS UNE IDENTITE ----
     * Elle porte pour l'instant l'image du revenant de glace. Deux creatures
     * identiques a l'ecran dont une seule paralyse, c'est un piege : le
     * joueur apprendrait « ce monstre-la paralyse parfois », ce qui est faux
     * et impossible a jouer. On la teinte donc en violet, la couleur des
     * effets dans ce jeu, et on lui pose une aura : elle se reconnait du
     * premier coup d'oeil, avant meme d'avoir tire.
     * Le jour ou son propre dessin arrive, ces lignes sautent. */
    var empruntee = (MONDE_C && MONDE_C.especes && MONDE_C.especes[e.espece]
                     && MONDE_C.especes[e.espece].sprite) ? true : false;
    if (empruntee) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#C07BFF';
      ctx.beginPath();
      ctx.ellipse(e.rx, e.ry + 4, T * 0.34, T * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (fige) {
      /* La teinte passe par un CANEVAS A PART. Teinter directement sur la
         scene avec `source-atop` toucherait aussi le sol : a cet endroit le
         decor est deja peint, donc « la ou il y a quelque chose » ne veut pas
         dire « la ou il y a le monstre ». Sur un canevas vide qui ne contient
         que le sprite, la question a la bonne reponse. */
      var g = gel(C);
      g.ctx.clearRect(0, 0, C, C);
      g.ctx.globalCompositeOperation = 'source-over';
      g.ctx.globalAlpha = 1;
      g.ctx.drawImage(img, e.cadre * C, r * C, C, C,
                      0, 0, C, C);
      g.ctx.globalCompositeOperation = 'source-atop';
      g.ctx.globalAlpha = 0.38;
      g.ctx.fillStyle = '#9DE8FF';
      g.ctx.fillRect(0, 0, C, C);
      ctx.drawImage(g.el, 0, 0, C, C, sx, sy, T, T);
    } else if (empruntee) {
      var g2 = gel(C);
      g2.ctx.clearRect(0, 0, C, C);
      g2.ctx.globalCompositeOperation = 'source-over';
      g2.ctx.globalAlpha = 1;
      g2.ctx.drawImage(img, e.cadre * C, r * C, C, C,
                       0, 0, C, C);
      g2.ctx.globalCompositeOperation = 'source-atop';
      g2.ctx.globalAlpha = 0.45;
      g2.ctx.fillStyle = '#C07BFF';
      g2.ctx.fillRect(0, 0, C, C);
      ctx.drawImage(g2.el, 0, 0, C, C, sx, sy, T, T);
    } else {
      ctx.drawImage(img, e.cadre * C, r * C, C, C,
                    sx, sy, T, T);
    }
    barreVie(e.rx, e.ry, e.pv, e.pvMax, T * 0.46);
  }

  /* La barre de vie ne s'affiche QUE si la creature est blessee : cinquante
     barres pleines a l'ecran cachent le decor et n'apprennent rien. */
  function barreVie(x, y, pv, pvMax, larg) {
    if (!pvMax || pv >= pvMax) return;
    var h = 5, p = Math.max(0, Math.min(1, pv / pvMax));
    var gx = x - larg / 2, gy = y + 6;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(gx - 1, gy - 1, larg + 2, h + 2);
    ctx.fillStyle = p > 0.5 ? '#7CFF9B' : p > 0.25 ? '#FFC53D' : '#F2685E';
    ctx.fillRect(gx, gy, larg * p, h);
  }

  /* ---- LES DEUX JAUGES DU JOUEUR ----
   *
   * Contrairement a `barreVie`, celles-ci s'affichent TOUJOURS, meme pleines.
   * Une barre qui n'apparait qu'une fois blessee arrive trop tard : ce qu'on
   * veut savoir en combat, c'est ou l'on en est AVANT de decider de rester.
   *
   * Le mana est en dessous et plus fin : il ne tue pas. Sa jauge n'existe que
   * si le personnage a du mana — un poing nu sans fruit n'a rien a y lire, et
   * une jauge vide en permanence apprend a ne plus regarder. */
  function barreVieMana(x, y, pv, pvMax, mp, mpMax, larg) {
    if (!pvMax) return;
    var h = 5, gx = x - larg / 2, gy = y + 8;
    var p = Math.max(0, Math.min(1, pv / pvMax));
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(gx - 1, gy - 1, larg + 2, h + 2);
    ctx.fillStyle = p > 0.5 ? '#7CFF9B' : p > 0.25 ? '#FFC53D' : '#F2685E';
    ctx.fillRect(gx, gy, larg * p, h);
    if (mpMax > 0) {
      var q = Math.max(0, Math.min(1, mp / mpMax));
      var my = gy + h + 2, mh = 3;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(gx - 1, my - 1, larg + 2, mh + 2);
      ctx.fillStyle = '#5AA9FF';
      ctx.fillRect(gx, my, larg * q, mh);
    }
    ctx.restore();
  }

  /* Les projectiles du monde viennent du SERVEUR : on ne connait ni leur
     duree ni leur portee, seulement ou ils sont. On reutilise les memes
     dessins que le Nexus — un tir de lame doit se ressembler partout. */
  /* Le meme projectile d'un etat a l'autre garde son AGE : sinon il repart de
     sa position de reference a chaque message, et on retrouve le saut qu'on
     voulait supprimer. Ceux qui ne sont plus la ont touche ou expire. */
  function repereTirs(avant, recus) {
    var vieux = {};
    for (var i = 0; i < avant.length; i++) if (avant[i].i !== undefined) vieux[avant[i].i] = avant[i];
    for (var k = 0; k < recus.length; k++) {
      var t = recus[k], v = vieux[t.i];
      /* L'age repart de zero : la position recue est la verite du moment ou
         le serveur l'a ecrite. Elle a mis un aller a nous parvenir, et c'est
         exactement ce que l'age suivant rattrapera. */
      t.age = 0;
      if (v) t.vu = v.vu;
    }
    return recus;
  }

  /* ---- NOTRE PROPRE TIR, TOUT DE SUITE ----
   *
   * Le tir partait au serveur et n'apparaissait qu'au retour : cent
   * millisecondes de tick, plus l'aller-retour. On cliquait, et il ne se
   * passait rien pendant un cinquieme de seconde — c'est la latence qu'on
   * SENT, bien avant celle des monstres.
   *
   * On le dessine donc immediatement, et on l'efface des que le serveur
   * renvoie le sien. Le serveur reste seul juge de ce qui touche : ce
   * projectile-la ne fait aucun degat, il ne fait que se voir.
   */
  var DEVINES = [];
  function deviner(a, ax, ay) {
    var arme = armeCourante();
    /* L'eventail comme le vrai : une arme qui lance deux fleches doit en
       montrer deux tout de suite, sinon la deuxieme apparait un cinquieme de
       seconde plus tard et on croit avoir rate. */
    var ecart = 0.13;
    for (var i = 0; i < (arme.tirs || 1); i++) {
      var d = (arme.tirs || 1) === 1 ? 0 : (i - ((arme.tirs || 1) - 1) / 2) * ecart;
      DEVINES.push({ x: ax, y: ay, a: a + d, v: arme.vitesse,
                     f: familleArme() || 'poing', age: 0, devine: true });
    }
  }
  function oublieDevines(recus) {
    if (!DEVINES.length) return;
    var miens = [];
    for (var i = 0; i < recus.length; i++) if (recus[i].mien) miens.push(recus[i]);
    if (!miens.length) return;
    for (var d = DEVINES.length - 1; d >= 0; d--) {
      for (var j = 0; j < miens.length; j++) {
        /* Le meme angle a un centieme pres : c'est notre tir, revenu du
           serveur. Deux tirs simultanes au meme angle sont le meme geste. */
        var ecart = Math.abs(((miens[j].a - DEVINES[d].a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (ecart > 0.02) continue;
        DEVINES.splice(d, 1);
        break;
      }
    }
    /* Un devine qui n'a jamais trouve son jumeau ne reste pas eternellement :
       le serveur a pu refuser le tir (recharge, mort). */
    for (var e = DEVINES.length - 1; e >= 0; e--) if (DEVINES[e].age > 0.5) DEVINES.splice(e, 1);
  }

  /* L'age de chaque projectile avance avec l'image, pas avec le reseau. */
  function vieillitTirs(dt) {
    for (var i = 0; i < TIRS_C.length; i++) TIRS_C[i].age = (TIRS_C[i].age || 0) + dt;
    for (var j = 0; j < TIRS_M.length; j++) TIRS_M[j].age = (TIRS_M[j].age || 0) + dt;
    for (var k = DEVINES.length - 1; k >= 0; k--) {
      DEVINES[k].age += dt;
      if (DEVINES[k].age > 0.6) DEVINES.splice(k, 1);
    }
  }

  function dessineTirsMonde() {
    /* Les DEUX listes, la notre et la leur. Elles se dessinent pareil — un
       projectile est un projectile — mais elles restent separees parce que
       le serveur les separe : melanger ici reintroduirait la question « a
       qui est-ce ? » qu'on a justement supprimee la-bas. */
    var tout = TIRS_C.concat(TIRS_M).concat(DEVINES);
    for (var i = 0; i < tout.length; i++) {
      var t = tout[i];
      var sp = spriteTir(t.f);
      /* La position EXACTE : point de reference plus ce qu'il a parcouru
         depuis. Un projectile va tout droit a vitesse constante — il n'y a
         rien a lisser, seulement a calculer. */
      var age = t.age || 0, vt = t.v || 0;
      var px = t.x + Math.cos(t.a) * vt * age;
      var py = t.y + Math.sin(t.a) * vt * age;
      ctx.save();
      ctx.translate(px, py - DECALAGE_TIR);
      ctx.rotate(t.a);
      if (sp && sp.complete && sp.naturalWidth) {
        ctx.drawImage(sp, 0, 0, CADRE_TIR, CADRE_TIR,
                      -CADRE_TIR / 2, -CADRE_TIR / 2, CADRE_TIR, CADRE_TIR);
      } else {
        var a = ARMES[t.f] || ARMES.poing;
        ctx.fillStyle = a.teinte;
        ctx.fillRect(-14, -3, 28, 6);
      }
      ctx.restore();
    }
  }

  /* ---- LA FLECHE VERS LA PORTE ----
   *
   * En coordonnees ECRAN, comme les textes qui montent : elle parle au joueur,
   * pas au decor. C'est la seule chose qui rend le donjon TROUVABLE — sans
   * elle, « un portail s'est ouvert » est une nouvelle sans suite, et trois
   * minutes ne suffisent pas a fouiller une carte de sept mille sept cents
   * unites de cote.
   *
   * Elle disparait quand la porte entre dans le cadre : a partir de la, on la
   * VOIT, et une fleche qui continuerait de pointer un objet visible se lit
   * comme un defaut d'affichage.
   *
   * La distance est ecrite dessus. « Par la » ne dit pas s'il faut dix
   * secondes ou une minute et demie, et c'est exactement la question qu'on se
   * pose avec un compte a rebours qui court.
   */
  function peintBoussole(dt) {
    if (!PORTAILS_LOIN.length) return;
    var vw = canvas.width / DPR, vh = canvas.height / DPR;
    var libreB = Math.max(120, vw - largeurPanneau());
    var cx = libreB / 2, cy = vh / 2;
    /* Le rayon du cadre ou l'on pose la fleche : un ovale inscrit dans la
       partie libre, avec de la marge — collee au bord elle serait a moitie
       rognee sur telephone. */
    var rx = libreB / 2 - 46, ry = vh / 2 - 46;
    ctx.save();
    ctx.scale(DPR, DPR);
    for (var i = PORTAILS_LOIN.length - 1; i >= 0; i--) {
      var q = PORTAILS_LOIN[i];
      q.reste -= dt;
      if (q.reste <= 0) { PORTAILS_LOIN.splice(i, 1); continue; }
      var dx = q.x - joueur.x, dy = q.y - joueur.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      /* Dans le cadre : on la voit pour de vrai, la fleche n'a plus rien a
         dire. La demi-diagonale de l'ecran en unites du monde, c'est la portee
         du regard — on la CALCULE depuis le zoom plutot que de l'ecrire, sinon
         la fleche resterait sur un ecran large et partirait trop tot sur un
         telephone. */
      var z = DERNIERE_CAM.z || 1;
      var vue = Math.sqrt((libreB / z / 2) * (libreB / z / 2) + (vh / z / 2) * (vh / z / 2));
      if (d < vue * 0.82) continue;
      var a = Math.atan2(dy, dx);
      var px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
      var bat = 0.75 + 0.25 * Math.sin(performance.now() / 380);
      ctx.save();
      ctx.translate(px, py);
      ctx.globalAlpha = q.reste < 15
        ? Math.max(0.35, 0.45 + 0.55 * Math.abs(Math.cos(performance.now() / 500)))
        : bat;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(20, 0); ctx.lineTo(-12, 12); ctx.lineTo(-5, 0); ctx.lineTo(-12, -12);
      ctx.closePath();
      ctx.fillStyle = '#C07BFF';
      ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 3;
      ctx.stroke(); ctx.fill();
      ctx.restore();
      /* Le texte NE TOURNE PAS avec la fleche : une distance a l'envers ne se
         lit pas, et c'est le seul chiffre du cadre. */
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 12px system-ui, sans-serif';
      var t = Math.round(d) + 'u · ' + Math.max(0, Math.ceil(q.reste)) + 's';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(t, 0, 26);
      ctx.fillStyle = '#EBD9FF';
      ctx.fillText(t, 0, 26);
      ctx.restore();
    }
    ctx.restore();
  }

  /* Les textes qui montent : en coordonnees ECRAN, pas monde. Ils parlent au
     joueur, pas au decor — les accrocher a une position les ferait sortir du
     cadre au premier pas. */
  function peintFlottants() {
    if (!FLOTTANTS.length) return;
    ctx.save();
    ctx.scale(DPR, DPR);
    var vw = canvas.width / DPR, vh = canvas.height / DPR;
    var libreF = Math.max(120, vw - largeurPanneau());
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = 0; i < FLOTTANTS.length; i++) {
      var f = FLOTTANTS[i];
      var k = 1 - f.vie / f.max;
      ctx.globalAlpha = Math.min(1, f.vie * 2.2);
      ctx.font = '900 22px system-ui, sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      var y = vh * 0.34 - k * 52 - i * 26;
      ctx.strokeText(f.t, libreF / 2, y);
      ctx.fillStyle = '#FFD97A';
      ctx.fillText(f.t, libreF / 2, y);
    }
    ctx.restore();
  }

  function dessineAvatar(x, y, cle, dir, anim, cadre) {
    var s = SPRITES[cle];
    var img = s && s.pret && s.images[anim + '_' + dir];
    if (!img) {
      // pas encore charge : un jeton simple a la place, pour que la scene
      // reste lisible pendant le prechargement plutot que de rester vide.
      ctx.fillStyle = '#8DA0C4';
      ctx.beginPath(); ctx.ellipse(x, y - 40, 26, 34, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    var rc = rectangleCadre(cle, cadre);
    var disp = 150;
    ctx.drawImage(img, rc.sx, rc.sy, CADRE, CADRE, x - disp / 2, y - disp + 20, disp, disp);
  }

  // ------------------------------------------------------- la carte du lieu
  //
  // Le decor ne bouge JAMAIS : on le peint une fois pour toutes sur un canvas
  // garde en memoire, et chaque trame ne recopie que ce fond plus les points
  // qui, eux, se deplacent. Redessiner l'herbe soixante fois par seconde pour
  // qu'elle ne change pas serait le plus gros travail du panneau, pour rien.

  var mini = document.getElementById('nxMini');
  var mctx = mini && mini.getContext('2d');
  var MINI = 120;                       // cotes du canvas, en pixels
  var fondMini = null;

  function construitFondMini() {
    var c = document.createElement('canvas');
    c.width = MINI; c.height = MINI;
    var g = c.getContext('2d');
    /* La carte n'est pas carree (2560 x 1920) : on garde ses proportions et
       on centre, plutot que de l'etirer — une carte deformee ne se
       superpose plus a ce qu'on voit a l'ecran. */
    var e = Math.min(MINI / MONDE.w, MINI / MONDE.h);
    var ox = (MINI - MONDE.w * e) / 2, oy = (MINI - MONDE.h * e) / 2;
    g.fillStyle = '#000'; g.fillRect(0, 0, MINI, MINI);
    g.fillStyle = '#24401c'; g.fillRect(ox, oy, MONDE.w * e, MONDE.h * e);
    // les chemins, echantillonnes a la tuile
    for (var r = 0; r < CARTE.rows; r++) {
      for (var c2 = 0; c2 < CARTE.cols; c2++) {
        var cx = c2 * TUILE + TUILE / 2, cy = r * TUILE + TUILE / 2;
        var t = solEn(cx, cy);
        if (t === TUILES.herbe) continue;
        /* La cour a sa couleur : sur une carte de cent vingt pixels, deux
           gris identiques ne distinguent plus un enclos d'un carrefour. */
        g.fillStyle = t === TUILES.ferme ? '#b58a4a' : '#8f8f88';
        g.fillRect(ox + c2 * TUILE * e, oy + r * TUILE * e,
                   Math.ceil(TUILE * e), Math.ceil(TUILE * e));
      }
    }
    // les lieux, chacun de sa couleur
    var TEINTE = { fontaine: '#3fa9f5', portail: '#c04ce0', portailPvp: '#e0453c',
                   etal: '#e0a33c', coffre: '#d8d8d8', casino: '#2fa86a',
                   enseigne: '#2fa86a', petworld: '#e07b3c',
                   petworldEnseigne: '#e07b3c' };
    LIEUX.forEach(function (l) {
      g.fillStyle = TEINTE[l.cle] || '#fff';
      var w = Math.max(3, l.larg * e * 0.6), h = Math.max(3, l.haut * e * 0.6);
      g.fillRect(ox + l.x * e - w / 2, oy + l.y * e - h, w, h);
    });
    fondMini = { c: c, e: e, ox: ox, oy: oy };
  }

  function peintMini() {
    /* ---- LA CARTE DU MONDE ----
     * Elle montrait le NEXUS pendant qu'on se battait ailleurs — le plan de
     * l'endroit ou l'on n'est pas. Elle montre maintenant le monde : ses
     * trois anneaux, les ennemis en rouge, les autres joueurs en vert, et
     * nous en blanc. C'est la seule chose qui dise « le coeur est par la »
     * sans qu'on ait a marcher pour le decouvrir. */
    if (SCENE === 'monde' && MONDE_C && mctx) {
      var W = MONDE_C.monde.w, H = MONDE_C.monde.h;
      var e = Math.min(MINI / W, MINI / H);
      var ox = (MINI - W * e) / 2, oy = (MINI - H * e) / 2;
      mctx.clearRect(0, 0, MINI, MINI);
      /* Les anneaux, du plus large au plus etroit : dessines dans cet ordre,
         chacun recouvre le precedent et on obtient les trois couronnes sans
         calculer une seule intersection. */
      /* Une couleur par anneau, choisie sur la teinte dominante de sa
         texture : la mini-carte doit repondre a « ou suis-je » du meme coup
         d'oeil que le sol sous les pieds. Le repli gris sert au jour ou le
         serveur declarera un anneau dont la page ignore encore le nom — mieux
         vaut une couronne terne qu'un trou noir. */
      var COUL = { terre: '#4a3a2c', marais: '#3d4a2e', neige: '#c9dcea',
                   cendres: '#5a5a5e', lave: '#8a2418' };
      var cx = ox + MONDE_C.centre.x * e, cy = oy + MONDE_C.centre.y * e;
      /* Le fond porte la couleur de l'anneau EXTERIEUR, celui dont le rayon
         est infini : il n'a pas de cercle a lui, il est tout le reste. */
      var dehors = MONDE_C.anneaux[MONDE_C.anneaux.length - 1];
      mctx.fillStyle = COUL[dehors && dehors.biome] || '#4a3a2c';
      mctx.fillRect(ox, oy, W * e, H * e);
      for (var ai = MONDE_C.anneaux.length - 1; ai >= 0; ai--) {
        var an = MONDE_C.anneaux[ai];
        if (!isFinite(an.jusqua)) continue;
        mctx.fillStyle = COUL[an.biome] || '#444';
        mctx.beginPath();
        mctx.arc(cx, cy, an.jusqua * (W / 2) * e, 0, Math.PI * 2);
        mctx.fill();
      }
      /* ---- LES SALLES, TOUJOURS VISIBLES ----
       *
       * Elles sont des DESTINATIONS : les cacher jusqu'a ce qu'on tombe
       * dessus les aurait rendues introuvables, et une destination qu'on ne
       * peut pas viser n'en est pas une. Ce n'est pas une carte de triche —
       * les murs ne bougent pas, on les verrait de toute facon en passant a
       * cote, et le hasard de la promenade n'a pas a decider si le jeu a une
       * direction.
       *
       * Le carre porte la couleur de son BUTIN, comme le sac : blanc pour la
       * relique, or pour le legendaire. On sait donc laquelle vaut le
       * detour avant de traverser un anneau pour y aller. */
      var COUL_BUTIN = { relique: '#FFFFFF', mythique: '#FF4655',
                         legendaire: '#FFC53D', epique: '#C07BFF' };
      SALLES_C.forEach(function (s) {
        var c = COUL_BUTIN[s.butin] || '#FFC53D';
        var t = Math.max(4, s.cote * e);
        mctx.save();
        mctx.strokeStyle = c;
        mctx.lineWidth = 1.5;
        mctx.globalAlpha = 0.95;
        mctx.strokeRect(ox + (s.x - s.cote / 2) * e, oy + (s.y - s.cote / 2) * e, t, t);
        mctx.globalAlpha = 0.20;
        mctx.fillStyle = c;
        mctx.fillRect(ox + (s.x - s.cote / 2) * e, oy + (s.y - s.cote / 2) * e, t, t);
        mctx.restore();
      });

      /* Les ennemis en ROUGE, les autres joueurs en VERT. On ne montre que
         ce qu'on VOIT — le serveur ne nous envoie que les alentours, et
         afficher toute la carte peuplee serait une carte de triche. */
      mctx.fillStyle = '#F2685E';
      Object.keys(MONSTRES_C).forEach(function (k) {
        var mm = MONSTRES_C[k];
        mctx.fillRect(ox + mm.rx * e - 1.5, oy + mm.ry * e - 1.5, 3, 3);
      });
      mctx.fillStyle = '#7CFF9B';
      Object.keys(DISTANTS_M).forEach(function (k) {
        var dd = DISTANTS_M[k];
        mctx.fillRect(ox + dd.rx * e - 1.5, oy + dd.ry * e - 1.5, 3, 3);
      });
      mctx.fillStyle = '#fff';
      mctx.fillRect(ox + joueur.x * e - 2, oy + joueur.y * e - 2, 4, 4);
      return;
    }
    /* Dans la salle du coffre, la mini-carte montrerait le Nexus — un plan
       de l'endroit ou l'on n'est PAS. On la remplace par son nom : c'est la
       seule chose vraie qu'on puisse y ecrire. */
    if (SCENE === 'coffre') {
      var gc = mini && mini.getContext ? mini.getContext('2d') : null;
      if (!gc) return;
      gc.clearRect(0, 0, MINI, MINI);
      gc.fillStyle = '#1b1710'; gc.fillRect(0, 0, MINI, MINI);
      gc.fillStyle = '#C8A24A';
      gc.font = '700 11px system-ui, sans-serif';
      gc.textAlign = 'center'; gc.textBaseline = 'middle';
      gc.fillText('VAULT', MINI / 2, MINI / 2);
      return;
    }
    if (!mctx) return;
    if (!fondMini) construitFondMini();
    mctx.clearRect(0, 0, MINI, MINI);
    mctx.drawImage(fondMini.c, 0, 0);
    var e = fondMini.e, ox = fondMini.ox, oy = fondMini.oy;
    // les autres, en vert ; nous, en blanc et un cran plus gros
    mctx.fillStyle = '#63d13f';
    Object.keys(DISTANTS).forEach(function (a) {
      var d = DISTANTS[a];
      mctx.fillRect(ox + d.rx * e - 1.5, oy + d.ry * e - 1.5, 3, 3);
    });
    mctx.fillStyle = '#fff';
    mctx.fillRect(ox + joueur.x * e - 2, oy + joueur.y * e - 2, 4, 4);
  }

  // ------------------------------------------------------- le cadrage

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  function redimensionne() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * DPR);
    canvas.height = Math.round(window.innerHeight * DPR);
  }
  window.addEventListener('resize', redimensionne);
  window.addEventListener('orientationchange', redimensionne);
  redimensionne();

  var dernier = null;
  function boucle(t) {
    if (dernier === null) dernier = t;
    var dt = Math.min((t - dernier) / 1000, 1 / 20);
    dernier = t;
    maj(dt);
    majTirs(dt, DERNIERE_CAM.x, DERNIERE_CAM.y);
    vieillitTirs(dt);
    suitLeRecalage(dt);
    dessine(dt);
    peintMini();
    requestAnimationFrame(boucle);
  }
  requestAnimationFrame(boucle);
  peintBoutonTir();
  peintPanneau();   // le panneau existe des la premiere image, meme vide
})();
