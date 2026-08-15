/*
 * LE MODE ENTRAINEMENT, COTE PAGE.
 *
 * ---- pourquoi ce fichier est si court ----
 *
 * Parce qu'il ne dessine rien. Le serveur renvoie l'etat d'une table
 * d'entrainement sous le nom que la page attend deja — `p4Match` au Connect 4,
 * `duelMatch` aux cinq autres — et la page la peint donc avec son propre
 * afficheur : le plateau, les deux visages, la pendule, le vainqueur. Le coup
 * repart par le meme `p4Play` / `duelPlay`, avec l'identifiant de la table
 * d'entrainement, et le serveur l'aiguille.
 *
 * Il ne reste donc a faire ici que deux choses : POSER LE BOUTON, et dire au
 * joueur qu'il ne mise rien. Le reste existait.
 *
 * C'est ce qui permet a un seul fichier de servir les six jeux. L'autre
 * solution — un afficheur d'entrainement par page — aurait voulu dire six
 * copies a garder d'accord, dans des pages de trois mega-octets et demi.
 *
 * ---- pourquoi on espionne le constructeur WebSocket ----
 *
 * La page garde sa socket dans une variable locale : elle n'est joignable de
 * nulle part ailleurs. Plutot que de demander aux six pages de l'exposer — six
 * modifications, dans six fichiers enormes, pour une variable — on remplace le
 * constructeur avant qu'elles ne s'en servent et on retient l'instance.
 *
 * On n'INTERCEPTE rien : la page garde son `onmessage`, on ajoute seulement un
 * ecouteur a cote. Si ce fichier ne chargeait pas, les six jeux payants
 * continueraient de fonctionner a l'identique — c'est la propriete qu'on veut,
 * parce que ce sont eux qui portent l'argent.
 */
(function () {
  'use strict';

  /* Le jeu, deduit du nom de la page. La cle est celle du serveur, la meme que
     celle des images de cartes et des reglages. */
  var JEUX = {
    connect4: 'p4', morpion: 'mp', dames: 'dm',
    morpion_fantome: 'mf', dernier_chiffre: 'dc', pierre_feuille_bandit: 'pf',
  };
  var page = (location.pathname.split('/').pop() || '').replace(/\.html?$/, '');
  var JEU = JEUX[page];
  if (!JEU) return;               // pas une page de duel : on ne fait rien

  var NOMS = {
    p4: 'Quatre', mp: 'Croix', dm: 'Damier',
    mf: 'Fantome', dc: 'Chiffre', pf: 'Bandit',
  };

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
    /* Les constantes de la classe : du code qui teste `ws.readyState === WebSocket.OPEN`
       lirait `undefined` sans elles, et conclurait que la socket est fermee. */
    Espion.CONNECTING = Vrai.CONNECTING; Espion.OPEN = Vrai.OPEN;
    Espion.CLOSING = Vrai.CLOSING; Espion.CLOSED = Vrai.CLOSED;
    Espion.__swEntraine = true;
    window.WebSocket = Espion;
  })();

  function envoie(o) {
    if (SOCK && SOCK.readyState === 1) { SOCK.send(JSON.stringify(o)); return true; }
    return false;
  }

  // ------------------------------------------------------- l'etat courant

  var enCours = false;            // une table d'entrainement est-elle ouverte ?

  function ecoute(ev) {
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.type !== 'p4Match' && m.type !== 'duelMatch') return;
    /* `match` peut valoir null : la table vient d'etre fermee. */
    var etait = enCours;
    enCours = !!(m.match && m.match.entrainement);
    if (etait !== enCours || enCours) peint(m.match);
  }

  // ------------------------------------------------------- le bouton

  var bouton = null, ruban = null;

  function pose() {
    var creer = document.getElementById('c4Create');
    if (!creer || bouton) return;

    var style = document.createElement('style');
    style.textContent =
      '.sw-ent{margin-top:10px;width:100%;background:linear-gradient(180deg,#2b3550,#1b2338);' +
      'color:#dfe7ff;border:1px solid #46557d;border-radius:12px;padding:11px 12px;' +
      'font:700 14px/1.2 system-ui,sans-serif;cursor:pointer;letter-spacing:.3px}' +
      '.sw-ent:hover{border-color:#7d92cc;color:#fff}' +
      '.sw-ent-note{margin-top:6px;font-size:11.5px;line-height:1.45;opacity:.72}' +
      /* Le ruban est en `position:sticky` en haut du plateau : pendant une
         partie d'entrainement, le joueur doit pouvoir se rappeler a tout moment
         qu'il ne joue rien — sinon il croira avoir gagne de l'argent. */
      '.sw-ent-ruban{position:sticky;top:0;z-index:40;margin:0 0 10px;padding:8px 12px;' +
      'border-radius:11px;background:linear-gradient(180deg,#243a2c,#182a1e);' +
      'border:1px solid #3e6b4c;color:#bff0cf;font:700 12.5px/1.3 system-ui,sans-serif;' +
      'display:flex;align-items:center;gap:10px;justify-content:space-between}' +
      '.sw-ent-ruban button{background:#0f1a13;color:#bff0cf;border:1px solid #3e6b4c;' +
      'border-radius:8px;padding:5px 10px;font:700 12px system-ui,sans-serif;cursor:pointer}' +
      '.sw-ent-ruban button:hover{color:#fff;border-color:#6fbf8c}';
    document.head.appendChild(style);

    bouton = document.createElement('button');
    bouton.className = 'sw-ent';
    bouton.type = 'button';
    bouton.textContent = '🤖 Practice vs ' + NOMS[JEU] + ' — free';
    bouton.addEventListener('click', function () {
      if (!envoie({ type: 'entrainementStart', jeu: JEU })) return;
      bouton.disabled = true;
      setTimeout(function () { bouton.disabled = false; }, 1200);
    });

    var note = document.createElement('div');
    note.className = 'sw-ent-note';
    note.textContent = 'No stake, no payout — the same rules and the same clock as a real '
      + 'table. The bot plays to win.';

    creer.parentNode.insertBefore(bouton, creer.nextSibling);
    bouton.parentNode.insertBefore(note, bouton.nextSibling);
  }

  /** Le ruban vert au-dessus du plateau, pose et retire avec la partie. */
  function peint(match) {
    if (!enCours) {
      if (ruban && ruban.parentNode) ruban.parentNode.removeChild(ruban);
      ruban = null;
      return;
    }
    if (!ruban) {
      ruban = document.createElement('div');
      ruban.className = 'sw-ent-ruban';
      var texte = document.createElement('span');
      texte.textContent = '🤖 Practice — nothing at stake';
      var sortir = document.createElement('button');
      sortir.type = 'button';
      sortir.textContent = 'Leave';
      sortir.addEventListener('click', function () {
        envoie({ type: 'entrainementQuit' });
      });
      ruban.appendChild(texte);
      ruban.appendChild(sortir);
      /* On l'accroche au plateau s'il existe, sinon en tete du contenu : les six
         pages n'ont pas le meme identifiant de plateau, et se tromper d'ancre
         mettrait le ruban hors de l'ecran plutot que de le signaler. */
      var hote = document.querySelector('.wrap') || document.body;
      hote.insertBefore(ruban, hote.firstChild);
    }
    /* Quand la partie est finie, le ruban propose d'en relancer une : c'est le
       geste qu'on veut a ce moment-la, et le bouton « revanche » de la page
       s'adresse, lui, a une table payante. */
    var fini = match && match.phase === 'finie';
    var b = ruban.querySelector('button');
    if (fini && b.dataset.mode !== 'encore') {
      b.dataset.mode = 'encore';
      b.textContent = 'Play again';
      b.onclick = function () { envoie({ type: 'entrainementStart', jeu: JEU }); };
    } else if (!fini && b.dataset.mode === 'encore') {
      b.dataset.mode = '';
      b.textContent = 'Leave';
      b.onclick = function () { envoie({ type: 'entrainementQuit' }); };
    }
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', pose);
  else pose();
})();
