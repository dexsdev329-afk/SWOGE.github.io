/* ==================== LE FOND D'ECRAN ANIME ====================
 *
 * « Un fond d'écran pas trop rempli pour chaque page, animé en vidéo. »
 *
 * Une page le demande en une ligne, a la fin du <body> :
 *   <script src="fond_anime.js?v=…" data-fond="wallet" defer></script>
 * et il pose derriere tout le contenu `media/fond_<nom>.mp4`, avec son
 * affiche `img/site/fonds/<nom>.webp`.
 *
 * Les fonds sont faits pour s'effacer : un centre vide et clair, un motif
 * pale sur les bords — le texte de la page reste lisible par-dessus.
 *
 * ---- CE QU'IL NE COUTE PAS ----
 * - Moins de 115 ko par film (12 s, 960 x 540, sans son ; 35 ko en VP9), et
 *   l'affiche seule fait moins de 8 ko.
 * - Sous 700 pixels de large, l'affiche seule : sur un telephone en
 *   portrait, `cover` ne garde que le centre, qui est vide — telecharger un
 *   film pour montrer du blanc serait payer pour rien.
 * - Ni film ni mouvement pour qui demande moins de mouvement, ni pour qui
 *   economise ses donnees (`saveData`).
 * - Le film s'arrete quand l'onglet est cache.
 *
 * ---- POURQUOI `isolation:isolate` SUR LE <body> ----
 * Le fond est en `z-index:-1`. Sur une page ou <html> porte sa propre
 * couleur, le fond du <body> est peint dans le flux, AU-DESSUS d'une couche
 * negative : le film etait la, et invisible (swogebet, predict, agents —
 * mesure le 01/10). Faire du <body> un contexte d'empilement fait peindre
 * son fond en premier, puis la couche. `isolation` ne deplace rien : ni
 * position, ni bloc conteneur des elements fixes.
 */
(function(){
  'use strict';
  var s = document.currentScript;
  var nom = s && s.getAttribute('data-fond');
  if(!nom || !/^[a-z_]+$/.test(nom)) return;
  var html = document.documentElement;
  /* Dans le cadre d'une autre page (le portefeuille ouvert par-dessus un
     jeu), le fond de la page d'en dessous suffit. */
  if(html.classList.contains('wl-encadre')) return;

  /* L'affiche tout de suite (moins de 8 ko), le film une fois la page
     chargee : il ne doit rien retarder de ce qu'elle a a montrer. */
  var d = document.querySelector('.sw-fond-anime');
  if(d || !document.body) return;
  d = document.createElement('div');
  d.className = 'sw-fond-anime';
  d.setAttribute('aria-hidden', 'true');
  /* .92 : la teinte propre a chaque page transparait encore un peu. */
  d.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;opacity:.92;'
    + 'background:url(img/site/fonds/' + nom + '.webp) center/cover no-repeat;';
  document.body.style.isolation = 'isolate';
  document.body.insertBefore(d, document.body.firstChild);

  function film(){
    var calme = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var econome = !!(navigator.connection && navigator.connection.saveData);
    if(calme || econome || window.innerWidth < 700) return;
    var v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.setAttribute('disablepictureinpicture', '');
    v.preload = 'auto';
    v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
      + 'opacity:0;transition:opacity 1.2s ease;';
    /* Il n'apparait qu'une fois en marche : un film qui charge se montre noir. */
    v.addEventListener('playing', function(){ v.style.opacity = '1'; });
    /* H.264 la ou il se lit (partout ou le materiel le decode), VP9 sinon : un
       Chromium compile sans codecs proprietaires ne lit pas le mp4 (mesure le
       01/10, canPlayType vide) — il aurait garde l'affiche pour toujours. */
    var mp4 = v.canPlayType('video/mp4; codecs="avc1.42E01E"');
    v.src = 'media/fond_' + nom + (mp4 ? '.mp4' : '.webm');
    d.appendChild(v);
    var joue = function(){ var p = v.play(); if(p && p['catch']) p['catch'](function(){}); };
    joue();
    document.addEventListener('visibilitychange', function(){
      if(document.hidden) v.pause(); else joue();
    });
  }
  if(document.readyState === 'complete') film();
  else window.addEventListener('load', film);
})();
