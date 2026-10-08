/* coffre.js — le choix du coffre sur les jeux de casino (08/10/2026)
 *
 * Un ami l'a demande : « sur les jeux de casino, on peut choisir de miser nos
 * Swoge vault ($SWOGE) ou Swoge bet ($SWOGEBET) ». Le $SWOGEBET est le meme
 * coffre que le sport.
 *
 * Ce fichier ne tient QUE l'interface du choix. Il ne decide rien : la page
 * MONTRE un bouton, le serveur revalide a chaque geste, debite le bon coffre
 * sur `ws.addr`, et fige le jeton a l'ouverture de la manche (meme jeton a
 * l'entree et a la sortie — jamais une passerelle entre les deux coffres).
 * Cacher un bouton n'est pas un controle d'acces.
 *
 * Sans $SWOGEBET, le selecteur ne s'affiche pas : il n'y a rien a choisir, et
 * `jeton()` rend toujours 'swoge'. Le defaut est donc STRICTEMENT le
 * comportement d'avant — une page qui ne se cable pas a ce fichier mise en
 * $SWOGE comme toujours.
 *
 * API (une instance par page, sur window) :
 *   SwogeCoffre.vu(m)            nourrit un message serveur ; lit m.betBalance s'il existe
 *   SwogeCoffre.jeton()          'swoge' | 'swogebet' (toujours 'swoge' sans bet vault)
 *   SwogeCoffre.soldeBet()       le solde $SWOGEBET connu, en nombre
 *   SwogeCoffre.actif()          vrai s'il y a un $SWOGEBET a miser
 *   SwogeCoffre.set(j)           pose le choix par programme
 *   SwogeCoffre.monte(ancre, auChangement)
 *                                pose le selecteur juste apres `ancre` ;
 *                                `auChangement(jeton)` est rappele a chaque
 *                                changement de choix OU de solde, pour que la
 *                                page recalcule son plafond et son bouton.
 */
(function () {
  if (window.SwogeCoffre) return;

  var bet = 0;                 // dernier solde $SWOGEBET connu (nombre)
  var choix = 'swoge';         // 'swoge' | 'swogebet' — ce que le joueur a demande
  var boite = null;            // le selecteur, une fois pose
  var onCh = null;             // rappel de la page

  try { if (localStorage.getItem('swogeCoffre') === 'swogebet') choix = 'swogebet'; } catch (e) {}

  function actif() { return bet > 1e-7; }
  /* Le jeton reellement mise : 'swogebet' SEULEMENT si le joueur l'a choisi ET
     qu'il a de quoi. Sinon 'swoge'. C'est cette valeur que la page met dans sa
     mise ; le serveur la revalide de toute facon. */
  function jeton() { return (choix === 'swogebet' && actif()) ? 'swogebet' : 'swoge'; }
  function sauve() { try { localStorage.setItem('swogeCoffre', choix); } catch (e) {} }

  function fmt(b) {
    b = parseFloat(b || 0);
    return b >= 1e9 ? (b / 1e9).toFixed(2) + 'B'
         : b >= 1e6 ? (b / 1e6).toFixed(2) + 'M'
         : b >= 1000 ? (b / 1000).toFixed(1) + 'k'
         : b.toFixed(2);
  }

  function previent() { if (onCh) { try { onCh(jeton()); } catch (e) {} } }

  function vu(m) {
    if (!m || m.betBalance == null) return;
    var b = parseFloat(m.betBalance) || 0;
    if (b === bet) return;
    bet = b;
    /* Le bet vault s'est vide pendant qu'il etait choisi : on retombe sur
       $SWOGE, sinon la page miserait un coffre a sec. */
    if (!actif() && choix === 'swogebet') { choix = 'swoge'; sauve(); }
    rend();
    previent();
  }

  function set(j) {
    var nv = (j === 'swogebet' && actif()) ? 'swogebet' : 'swoge';
    if (nv === choix) return;
    choix = nv; sauve(); rend(); previent();
  }

  function rend() {
    if (!boite) return;
    /* 'flex' explicite, pas '' : la feuille met `.coffre-choix{display:none}`
       par defaut, donc '' retomberait dessus et le selecteur resterait cache. */
    boite.style.display = actif() ? 'flex' : 'none';   // rien a choisir sans bet vault
    var j = jeton();
    var bS = boite.querySelector('[data-coffre="swoge"]');
    var bB = boite.querySelector('[data-coffre="swogebet"]');
    if (bS) bS.setAttribute('aria-pressed', j === 'swoge' ? 'true' : 'false');
    if (bB) {
      bB.setAttribute('aria-pressed', j === 'swogebet' ? 'true' : 'false');
      var s = bB.querySelector('.cf-b'); if (s) s.textContent = fmt(bet);
    }
  }

  function monte(ancre, auChangement) {
    onCh = auChangement || null;
    if (!ancre || !ancre.parentNode || boite) { return; }
    if (!document.getElementById('coffre-css')) {
      var st = document.createElement('style');
      st.id = 'coffre-css';
      st.textContent =
        '.coffre-choix{display:none;gap:6px;margin:8px 0;flex-wrap:wrap;align-items:center}' +
        '.coffre-choix .cf-lab{font-size:12px;opacity:.7;margin-right:2px}' +
        '.coffre-choix .cf-btn{cursor:pointer;border:1px solid rgba(205,191,159,.4);' +
        'background:rgba(0,0,0,.25);color:#cdbf9f;border-radius:999px;padding:6px 12px;' +
        'font:inherit;font-size:13px;line-height:1}' +
        '.coffre-choix .cf-btn[aria-pressed="true"]{background:#cdbf9f;color:#1a1a1a;' +
        'border-color:#cdbf9f;font-weight:700}';
      document.head.appendChild(st);
    }
    boite = document.createElement('div');
    boite.className = 'coffre-choix';
    boite.setAttribute('role', 'group');
    boite.setAttribute('aria-label', 'Stake from');
    boite.innerHTML =
      '<span class="cf-lab">Stake from</span>' +
      '<button type="button" class="cf-btn" data-coffre="swoge" aria-pressed="true">Vault $SWOGE</button>' +
      '<button type="button" class="cf-btn" data-coffre="swogebet" aria-pressed="false">' +
      'Bet $SWOGEBET · <span class="cf-b">0</span></button>';
    boite.querySelector('[data-coffre="swoge"]').addEventListener('click', function () { set('swoge'); });
    boite.querySelector('[data-coffre="swogebet"]').addEventListener('click', function () { set('swogebet'); });
    ancre.parentNode.insertBefore(boite, ancre.nextSibling);
    rend();
  }

  window.SwogeCoffre = {
    vu: vu, jeton: jeton, soldeBet: function () { return bet; },
    actif: actif, set: set, monte: monte,
  };
})();
