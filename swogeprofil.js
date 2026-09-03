/* ==================== LE MENU DU PROFIL ====================
 *
 * ---- POURQUOI IL EST DANS UN FICHIER ----
 *
 * Il vivait EN CLAIR dans `games.html` : cent soixante lignes, la seule page
 * du site a savoir ouvrir un menu de compte. Il en fallait un sur l accueil
 * aussi — l avatar y etait deja, inerte, ce qui est la pire chose qu un
 * avatar puisse faire : il a exactement l air d un bouton.
 *
 * Recopier ces cent soixante lignes dans la seconde page aurait fait deux
 * menus a tenir d accord. Le jour ou une rangee change, elle ne changerait
 * que d un cote — celui qu on regarde en developpant, jamais l autre.
 *
 * Le style, lui, reste dans chaque page : le site recopie deja sa feuille
 * entiere d une page a l autre, avec une raison ecrite (l essai des marqueurs
 * de cache ne surveille que les `.js`, et une feuille commune perimee serait
 * exactement le defaut que ce mecanisme existe pour empecher). Ce fichier-ci
 * EST un `.js` : il est versionne, donc il peut etre partage.
 *
 * ---- CE QU IL ATTEND DE LA PAGE ----
 *
 * Un `#gxProfil` (le bouton) et un `#gxMenu` (la boite, vide). Sans les deux,
 * il ne fait rien et ne se plaint pas : une page qui n a pas d avatar n a pas
 * besoin de menu.
 */
(function(){
  "use strict";
  var bouton = document.getElementById("gxProfil");
  var menu   = document.getElementById("gxMenu");
  if(!bouton || !menu) return;

  /* ---- LES RANGEES SE LISENT, ELLES NE SE RECOPIENT PAS ----
   * `swogecompte.js` pose un `#menu` cache : c'est LA declaration de ce qui
   * existe — mon portefeuille, le staking, le depot, le retrait, les quetes.
   * Le tiroir sombre le recopie ; on fait pareil, en clair. Ecrire la liste
   * ici en ferait une seconde, et le jour ou un panneau s'ajoute il ne serait
   * que d'un cote — celui qu'on regarde en developpant, jamais l'autre.
   * On garde le lien D'ORIGINE et l'on renvoie le clic dessus : c'est son
   * gestionnaire qui sait ouvrir le panneau, et le refaire ici serait un
   * second chemin vers le meme argent. */
  function coupe(t){
    /* Le premier caractere est un emoji : il devient l'icone, le reste le mot.
       Un emoji colle au mot ne s'aligne pas d'une ligne a l'autre.
       Mais toutes les rangees n'ONT pas d'emoji : « Open bets », « Settled
       bets », « Overview »... viennent du tiroir de `stakebubble.js`, pas du
       menu de la page, et leur premier mot est un mot ordinaire. Coupe a
       l'aveugle, il devenait l'icone — « Open » ecrase dans une case de
       18 px prevue pour un symbole — et « bets » s'affichait colle dessus.
       On ne coupe donc que si le premier token ne contient AUCUNE lettre :
       un emoji n'en a jamais, un mot en a toujours. */
    var s = String(t||"").trim();
    var m = s.match(/^(\S+)\s+(.*)$/);
    if(m && !/[A-Za-z]/.test(m[1])) return { ic:m[1], mot:m[2] };
    return { ic:"", mot:s };
  }
  /* ---- LE TIROIR PORTE DEJA TOUT ----
   * `stakebubble.js` construit un tiroir de navigation qui contient SES
   * sections — la boutique, le classement, les coffres, le marche, les
   * familiers, les paris, les amis — ET les entrees du menu de la page, qu'il
   * recopie. Il est donc la liste complete, groupee, et deja tenue a jour.
   * Le menu de la page en montre le meme contenu, en clair. On ne choisit pas
   * « les plus utiles » : choisir serait inventer, et la rangee qu'on
   * ecarterait serait introuvable ici sans qu'aucun texte ne le dise.
   *
   * Il n'existe qu'une fois le joueur AUTHENTIFIE — c'est a ce moment que le
   * script le monte. Avant, on retombe sur le `#menu` de `swogecompte.js`,
   * qui est la declaration minimale et suffit a deposer. */
  function duTiroir(){
    var t = document.querySelector(".swp .swp-t") || document.querySelector(".swp-t");
    if(!t) return [];
    var l = [];
    [].forEach.call(t.children, function(n){
      if(n.classList && n.classList.contains("swp-g")){
        l.push({ groupe:(n.textContent||"").trim() }); return;
      }
      if(n.tagName !== "BUTTON") return;
      if(n.style && n.style.display === "none") return;   // une rangee que la page cache
      var c = coupe(n.textContent);
      l.push({ ic:c.ic, mot:c.mot, href:"#", vers:n, tiroir:true });
    });
    return l;
  }
  function duMenu(){
    var src = document.getElementById("menu");
    if(!src) return [];
    return [].map.call(src.children, function(n){
      if(n.classList && n.classList.contains("msep")) return { sep:true };
      if(n.tagName !== "A") return null;
      /* ---- UNE RANGEE QUE LA PAGE CACHE RESTE CACHEE ----
       * `duTiroir` ecarte deja les rangees masquees ; celle-ci ne le faisait
       * pas, et les deux listes ne repondaient donc pas pareil a la meme
       * question. Le cas concret : une fois entre, la page cache « Sign in »
       * de son propre menu — et le profil, tant que le tiroir n est pas
       * monte, le remontrait. On proposait de se connecter a quelqu un qui
       * l etait deja, dans le menu de son compte.
       * On regarde la rangee ELLE-MEME, pas si elle est visible a l ecran :
       * `#menu` est souvent cache EN ENTIER — c est une declaration, pas un
       * menu qu on ouvre — et « invisible » y serait vrai de tout le monde.
       * Meme critere que `duTiroir`, pour que les deux listes repondent
       * pareil a la meme question. */
      if(n.hidden || (n.style && n.style.display === "none")) return null;
      /* Plus de rangee « Wallet » ici : le portefeuille s ouvre par le rond
         en bas de page, sur toutes les pages. Meme tri que le tiroir. */
      if(n.getAttribute("data-panel") === "wallet" || n.id === "mnWallet"
         || /swoge_wallet\.html/i.test(n.getAttribute("href") || "")) return null;
      var c = coupe(n.textContent);
      return { ic:c.ic, mot:c.mot, href: n.getAttribute("href")||"#", vers:n };
    }).filter(Boolean);
  }
  function rangees(){
    var t = duTiroir();
    return t.length ? t : duMenu();
  }

  function peint(){
    var l = rangees(), h = "";
    /* ---- L'ADRESSE N'EST PAS REPETEE ICI ----
     * Elle y etait, en tete du menu, avec les deux soldes. Mesure a l'ecran :
     * la pastille qui les porte est visible a TOUTES les largeurs — mille
     * quatre cents, huit cent vingt, trois cent quatre-vingt-dix — et elle est
     * collee au bouton qui ouvre ce menu. On lisait donc la meme adresse deux
     * fois, l'une sous l'autre.
     * C'est exactement la plainte que cette page a deja traitee une fois :
     * l'adresse s'affichait a cinq endroits, et sur telephone deux d'entre eux
     * se voyaient d'un coup — « cela se lit comme deux portefeuilles ». La
     * remettre ici serait refaire le meme defaut en plus petit. */
    if(!l.length){
      /* Le script des panneaux n'a pas encore pose sa declaration — ou ne
         chargera pas. On ne fabrique pas de fausses rangees : elles
         n'ouvriraient rien, et un menu dont les lignes ne font rien est pire
         qu'un menu absent. */
      h += '<a href="swoge_pusher_live.html"><i>&#128176;</i>Deposit &amp; play</a>';
    } else {
      h += l.map(function(r, i){
        if(r.sep) return '<div class="gx-sep"></div>';
        if(r.groupe) return '<div class="gx-g">'+r.groupe+'</div>';
        return '<a href="'+r.href+'" data-i="'+i+'"><i>'+r.ic+'</i>'+r.mot+'</a>';
      }).join("");
    }
    menu.innerHTML = h;
    [].forEach.call(menu.querySelectorAll("a[data-i]"), function(a){
      var r = l[Number(a.getAttribute("data-i"))];
      if(!r || !r.vers) return;
      a.addEventListener("click", function(ev){
        /* Une vraie navigation — « Home » — se laisse passer telle quelle. Un
           panneau, lui, s'ouvre par son lien d'origine. */
        if(r.href && r.href !== "#") { ferme(); return; }
        ev.preventDefault(); ferme();
        /* ---- UNE RANGEE DU TIROIR NE L'OUVRE PAS ----
         * Son gestionnaire change l'ONGLET et redessine le contenu ; il ne
         * MONTRE pas la boite, parce que la-bas on ne peut cliquer une rangee
         * qu'une fois le tiroir deja ouvert. Appelee d'ici, elle reglait donc
         * l'onglet dans une boite invisible, et le clic ne faisait
         * visiblement RIEN — c'est le second defaut signale.
         * On ouvre par la POIGNEE du tiroir, dont c'est le travail, puis on
         * choisit la rangee. Refaire l'ouverture ici serait un second chemin
         * vers la meme boite. */
        if(r.tiroir){
          var poignee = document.querySelector(".swpb");
          if(poignee) poignee.click();
        }
        r.vers.click();
      });
    });
  }

  function ouvre(){ peint(); menu.hidden = false; bouton.setAttribute("aria-expanded","true"); }
  function ferme(){ menu.hidden = true; bouton.setAttribute("aria-expanded","false"); }

  bouton.addEventListener("click", function(ev){
    ev.stopPropagation();
    if(!menu.hidden){ ferme(); return; }
    /* ---- PAS ENCORE ENTRE : ON OUVRE LA CONNEXION ----
     * Un menu de compte propose a quelqu'un qui n'en a pas se lit comme une
     * panne : chaque rangee repondrait « connectez-vous d'abord », une par
     * une. On l'emmene la ou il faut aller, en un geste.
     *
     * ---- MAIS ON DEMANDE A CELUI QUI SAIT ----
     * On interrogeait `#cxCompte`, c'est-a-dire `swogecx.js`. Or ce menu
     * montre les rangees du TIROIR, et c'est `stakebubble.js` qui le monte, a
     * l'authentification — celle-la meme qui affiche le solde. Les deux
     * scripts ont leur PROPRE session : dans le navigateur de Telegram, ou il
     * n'existe aucune extension a interroger, le premier peut tres bien
     * ignorer une connexion que le second a etablie.
     * Resultat, signale : on est connecte, le solde s'affiche a trois
     * centimetres, et le profil repond « connectez-vous ». On demande donc a
     * la source des rangees qu'on s'apprete a montrer — une seule question,
     * et c'est la bonne. */
    /* La MEME question que la marque, par le meme chemin : elle vit dans
       `swogecx.js`, et deux endroits qui la poseraient chacun de leur cote
       finiraient par ne plus repondre pareil — c'est exactement le defaut
       qu'on vient de corriger ici. */
    var dedans = (typeof window.swogeConnecte === "function") && window.swogeConnecte();
    if(!dedans){
      var b = document.querySelector(".cx-mail") || document.querySelector(".cx-wallet");
      if(b){ b.click(); return; }
    }
    ouvre();
  });
  /* Un menu qui ne se referme pas au clic a cote reste ouvert sous le doigt et
     avale le geste suivant. */
  document.addEventListener("click", function(ev){
    if(menu.hidden) return;
    if(!menu.contains(ev.target)) ferme();
  });
  document.addEventListener("keydown", function(ev){ if(ev.key === "Escape") ferme(); });
})();
