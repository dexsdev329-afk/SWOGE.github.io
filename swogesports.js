/*
 * SWOGE — LES RENCONTRES DU JOUR, ET LE PARI SUR PLACE.
 *
 * ---- POURQUOI CE FICHIER EXISTE ----
 *
 * Le bloc « SWOGE SPORTS » etait ecrit EN CLAIR dans `games.html`, et
 * `index.html` en portait une version de MAQUETTE : quatre rencontres a la
 * main, cotes comprises, jouees le 15 aout. La page d accueil annoncait donc
 * des matchs finis a des prix qui n existent plus — la seule sorte de mensonge
 * qu un visiteur verifie en un geste, et il le verifie toujours.
 *
 * Recopier le bloc du hall dans l accueil aurait fait deux calendriers a tenir
 * d accord. Il vit donc ici, une fois, et les deux pages le chargent. C est un
 * `.js` : il est versionne, donc l essai des marqueurs de cache le couvre.
 *
 * ---- ET ON PARIE SANS QUITTER LA PAGE ----
 *
 * DEMANDE : « les gens peuvent selectionner ici sans que ca les redirige vers
 * SWOGE Bet […] peut-etre qu ils voulaient miser vite sur le match affiche a
 * droite ». La carte entiere etait un lien vers la page de paris : cliquer une
 * cote emmenait ailleurs, et il fallait la retrouver la-bas pour la reposer.
 *
 * Le pari part d ici, par le MEME message que la page de paris — `parie`, avec
 * les memes selections et la meme mise. Rien n est recalcule : ni la cote, ni
 * le retour, ni le minimum. Un second calcul de ce qu on paie serait la pire
 * chose a dupliquer sur ce site.
 *
 * ---- IL N OUVRE PAS DE SECONDE SOCKET ----
 *
 * `stakebubble.js` en tient deja une, ouverte avec le jeton de session, et il
 * l expose sous `window.swogeFil`. Deux sockets voudraient dire deux
 * authentifications, deux soldes a garder d accord, et le doute sur celle qui
 * recevra la reponse d un pari.
 *
 * ---- CE QU IL ATTEND DE LA PAGE ----
 *
 * Un `#gxSports` (la liste, vide) et, s il existe, un `.onglets[data-groupe=
 * "sports"]` pour filtrer. Sans le premier il ne fait rien et ne se plaint
 * pas : une page sans affiche n a pas besoin de calendrier.
 */
(function () {
  "use strict";
  var hote = document.getElementById("gxSports");
  if (!hote) return;
  var onglets = document.querySelector('.onglets[data-groupe="sports"]');

  /* Le meme parametre que sur les autres pages du site : sans lui, un essai
     automatise irait lire — et PARIER SUR — la production. */
  function gxServeur() {
    try {
      var q = new URLSearchParams(location.search).get("server");
      if (q) return String(q).replace(/^ws/, "http");
    } catch (e) {}
    return "https://web-production-220a3.up.railway.app";
  }
  function ech(x) {
    return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  /* Le drapeau se FABRIQUE a partir du code ISO — deux lettres, deux symboles
     indicateurs regionaux. Aucune image a telecharger, rien a tenir a jour
     quand un pays s ajoute, et la meme fonction que sur la page de paris.
     Un code absent rend une case vide : le nom se lit tres bien seul. */
  function drapeau(c) {
    if (!c || !/^[A-Z]{2}$/.test(c)) return "";
    return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65, 0x1F1E6 + c.charCodeAt(1) - 65);
  }
  /* « Today » et « Tomorrow » plutot qu une date : c est exactement ce qu on
     vient chercher sur une affiche, et une date se relit deux fois. */
  function quand(t) {
    var d = new Date(t), n = new Date();
    var j0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    var j1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var ec = Math.round((j1 - j0) / 86400000);
    var h = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    if (ec === 0) return "TODAY &middot; " + h;
    if (ec === 1) return "TOMORROW &middot; " + h;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase()
         + " &middot; " + h;
  }
  /* Le nombre de marches EN PLUS du resultat. Il vient du serveur, jamais d un
     nombre ecrit ici : le jour ou un marche s ajoute ou disparait, « +5 »
     deviendrait faux en silence — et c est le genre de chiffre qu un joueur
     verifie en un clic. */
  function enPlus(m) {
    var k = m && m.marches ? Object.keys(m.marches).length : 1;
    return k > 1 ? k - 1 : 0;
  }

  /* Le nom lisible d un sport, donne par le SERVEUR. « foot » est la cle qui
     sert au filtre ; « Football » est ce qu on lit. Une table ecrite ici
     serait un second endroit ou nommer les sports, et le jour ou l un
     s ajoute il n y serait pas — l affiche annoncait « FOOT · TEST LEAGUE »,
     vu au rendu. */
  var NOMS = {};
  function nomSport(k) { return NOMS[k] || k; }

  /* ---- LE MARCHE DE BASE, ET LUI SEUL ----
   * On ne propose ici que le resultat. Les cinq autres marches tiennent dans
   * la page de paris, ou il y a la place de les nommer ; ici, « +5 » dit
   * qu ils existent et le lien y mene. Proposer « handicap −1,5 » sur une
   * affiche de trois lignes serait proposer un pari qu on ne peut pas lire. */
  var BASE = "1n2";
  var MOTS = { "1": "Home", "N": "Draw", "2": "Away" };
  var MOTS_DUEL = { "1": "Player 1", "2": "Player 2" };
  var DUEL = { tennis: true };
  function motIssue(m, c) {
    var deux = m && DUEL[m.sport] && issuesDe(m).length === 2;
    return (deux ? MOTS_DUEL : MOTS)[c] || c;
  }
  function issuesDe(m) {
    return (m.marches && m.marches[BASE] && m.marches[BASE].issues) || m.issues || [];
  }
  function coteDe(m, c) {
    var t = (m.marches && m.marches[BASE] && m.marches[BASE].cotes) || m.cotes || {};
    return t[c];
  }

  var TOUT = [], filtre = "";
  /* Cinq rencontres : la carte en portait quatre, et au-dela le panneau pousse
     le reste de la page hors de l ecran. Ce n est pas le calendrier, c est
     l affiche — le calendrier est a un clic. */
  var COMBIEN = 5;
  /* La selection en cours. UNE seule : on est ici pour miser vite sur la
     rencontre qu on vient de voir passer. Un combine se construit sur la page
     de paris, qui a la place de le montrer. */
  var choix = null;      /* { id, issue } */
  var mise = 0, min = 0, max = 0, occupe = false, dit = "";

  function carte(m) {
    var iss = issuesDe(m);
    /* « X » a l ecran, « N » sur le fil : le nul se nomme X partout ou l on
       parie, et la cle du serveur n a pas a remonter jusqu au visiteur. */
    var mot = function (i) { return i === "N" ? "X" : i; };
    var plus = enPlus(m);
    var titre = [nomSport(m.sport), m.competition, m.pays].filter(Boolean).join(" · ").toUpperCase();
    var dd = drapeau(m.paysDomicile), de = drapeau(m.paysExterieur);
    return '<div class="match">'
      + '<div class="ligue">' + ech(titre) + '</div>'
      + '<div class="duel">'
        + '<span class="eq">' + (dd ? '<span>' + dd + '</span>' : '') + '<b>' + ech(m.domicile) + '</b></span>'
        + '<span class="sc">' + quand(m.debut) + '</span>'
        + '<span class="eq d"><b>' + ech(m.exterieur) + '</b>' + (de ? '<span>' + de + '</span>' : '') + '</span>'
      + '</div>'
      + '<div class="cotes">'
        + iss.map(function (i) {
            var c = coteDe(m, i);
            var pris = choix && choix.id === m.id && choix.issue === i;
            return '<button type="button" class="vif' + (pris ? ' on' : '') + '"'
                 + ' data-m="' + ech(m.id) + '" data-c="' + ech(i) + '"'
                 + ' aria-pressed="' + (pris ? 'true' : 'false') + '">'
                 + ech(mot(i)) + ' <small>'
                 + (typeof c === "number" ? c.toFixed(2) : "&mdash;") + '</small></button>';
          }).join("")
        /* « +5 » MENE au tableau : c est la seule chose de cette carte qu on ne
           peut pas faire ici, donc c est la seule qui a besoin d un lien. */
        + (plus ? '<a class="plus vif" href="swogebet.html" title="More markets on the board">+'
                  + plus + '</a>' : '')
      + '</div></div>';
  }

  function peint() {
    var l = TOUT.filter(function (m) { return !filtre || m.sport === filtre; });
    if (!l.length) {
      hote.innerHTML = '<div class="gx-dit">'
        + (TOUT.length ? "Nothing open in this sport right now. "
                       : "No fixture is open right now &mdash; the calendar fills up "
                         + "before each matchday. ")
        + '<a class="vif" href="swogebet.html">See the board &rarr;</a></div>';
      peintBulletin();
      return;
    }
    hote.innerHTML = l.slice(0, COMBIEN).map(carte).join("");
    peintBulletin();
  }

  function trouve(id) {
    for (var i = 0; i < TOUT.length; i++) if (TOUT[i].id === id) return TOUT[i];
    return null;
  }

  /* ==================== LE BULLETIN, EN TROIS LIGNES ====================
   *
   * Il vit SOUS la liste, dans la meme carte : un panneau flottant par-dessus
   * l accueil masquerait ce qu on est venu voir. Il n existe que lorsqu on a
   * choisi quelque chose — un bulletin vide en permanence est un bloc mort qui
   * prend la place d une rencontre. */
  var bulletin = document.createElement("div");
  bulletin.className = "gx-bul";
  bulletin.hidden = true;
  hote.parentNode.insertBefore(bulletin, hote.nextSibling);

  function fmt(n) {
    n = Number(n) || 0;
    return n >= 1000000 ? (n / 1000000).toFixed(n >= 10000000 ? 0 : 1) + "M"
         : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k"
         : String(Math.round(n));
  }

  function peintBulletin() {
    if (!choix) { bulletin.hidden = true; bulletin.innerHTML = ""; return; }
    var m = trouve(choix.id);
    if (!m) { choix = null; bulletin.hidden = true; bulletin.innerHTML = ""; return; }
    var c = coteDe(m, choix.issue);
    var retour = (typeof c === "number" && mise > 0) ? Math.floor(mise * c) : 0;
    bulletin.hidden = false;
    bulletin.innerHTML =
        '<div class="gx-bl">'
      +   '<b>' + ech(m.domicile) + ' &ndash; ' + ech(m.exterieur) + '</b>'
      +   '<span>' + ech(motIssue(m, choix.issue))
      +     ' @ ' + (typeof c === "number" ? c.toFixed(2) : "&mdash;") + '</span>'
      +   '<button type="button" class="gx-ote vif" aria-label="remove">&times;</button>'
      + '</div>'
      + '<div class="gx-mise">'
      +   '<input id="gxMise" class="vif" type="number" inputmode="numeric"'
      +     ' min="' + min + '" max="' + max + '" step="100" value="' + mise + '"'
      +     ' aria-label="stake in $SWOGE">'
      +   '<span class="gx-ret">' + (retour ? "returns <b>" + fmt(retour) + "</b>" : "&nbsp;") + '</span>'
      + '</div>'
      + '<button type="button" class="sw-b sw-b-plein gx-go vif"'
      +   (occupe ? " disabled" : "") + '>' + ech(libelleBouton()) + '</button>'
      + (dit ? '<div class="gx-dit gx-msg">' + ech(dit) + '</div>' : '');
  }

  /* Le bouton DIT pourquoi il ne marchera pas, plutot que de refuser en
     silence une fois presse. Les bornes viennent du serveur ; tant qu il ne
     les a pas envoyees, on ne les invente pas — on annonce simplement le
     pari. */
  function libelleBouton() {
    if (occupe) return "Placing…";
    if (min && mise < min) return "Min " + fmt(min) + " $SWOGE";
    if (max && mise > max) return "Max " + fmt(max) + " $SWOGE";
    return "PLACE BET";
  }

  /* ==================== LE FIL ====================
   *
   * On demande `parisListe` des qu il y a une socket : c est le message que la
   * page de paris envoie, et sa reponse porte les bornes de mise et les cotes
   * a jour. On ne fixe donc aucun minimum ici — un minimum ecrit dans cette
   * page serait faux le jour ou le serveur change le sien, et il le serait en
   * silence. */
  var demande = false;
  function reclame() {
    if (demande || !window.swogeFil || !window.swogeFil.pret()) return;
    demande = true;
    window.swogeFil.envoie({ type: "parisListe" });
  }
  if (window.swogeFil) {
    window.swogeFil.ecoute(function (m) {
      if (!m || !m.type) return;
      if (m.type === "auth") { demande = false; reclame(); return; }
      if (m.type === "parisListe") {
        if (m.min != null) { min = m.min; if (!mise) mise = m.min; }
        if (m.max != null) max = m.max;
        /* Les rencontres du fil REMPLACENT celles lues par la route publique :
           c est la meme source, en plus frais, et la cote qu on s apprete a
           prendre doit etre celle que le serveur tient a cet instant. */
        if (m.matchs && m.matchs.length) {
          (m.sports || []).forEach(function (s) { if (s && s.cle) NOMS[s.cle] = s.nom || s.cle; });
          TOUT = m.matchs.slice().sort(function (a, b) { return a.debut - b.debut; });
          majOnglets(); peint();
        }
        return;
      }
      if (m.type === "pariPose") {
        occupe = false; choix = null;
        dit = "";
        peint();
        avis("✅ Bet placed · returns " + fmt(m.pari && m.pari.rapport) + " $SWOGE");
        return;
      }
      if (m.type === "need_deposit") { occupe = false; dit = "Not enough $SWOGE."; peintBulletin(); return; }
      if (m.type === "error" && occupe) { occupe = false; dit = m.error || "Bet refused."; peintBulletin(); return; }
    });
    /* La socket peut etre deja ouverte quand ce fichier arrive. */
    setTimeout(reclame, 1200);
    setTimeout(reclame, 4000);
  }

  /* Un mot qui passe, la ou l on vient de cliquer. Les pages n ont pas toutes
     la meme fenetre de message, et en emprunter une reviendrait a dependre de
     ce que chacune veut bien poser. */
  function avis(t) {
    var d = document.createElement("div");
    d.className = "gx-avis";
    d.textContent = t;
    document.body.appendChild(d);
    setTimeout(function () { d.classList.add("part"); }, 2600);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3200);
  }

  function pose() {
    if (occupe || !choix) return;
    var m = trouve(choix.id);
    if (!m) return;
    /* ---- LA PORTE D ABORD ----
     * Sans session, le serveur refuse — et il a raison. Mais le refus
     * arriverait APRES COUP, sous forme d une phrase rouge : on ouvre donc la
     * porte de connexion, qui est ce que le joueur aurait a faire de toute
     * facon. C est la meme porte que partout ailleurs sur le site.
     *
     * On ne demande PAS a la socket : elle est ouverte des la premiere seconde,
     * connecte ou non, et `pret()` ne dit que « il y a un fil ». La premiere
     * version s y fiait, envoyait le pari, et affichait le refus du serveur a
     * quelqu un qui n avait simplement pas de compte.
     * La question « suis-je entre » vit dans `swogecx.js`, en un seul endroit,
     * et elle regarde d abord le jeton de session — celui-la meme que le
     * serveur exige. */
    var entre = (typeof window.swogeConnecte === "function") ? window.swogeConnecte() : null;
    if (entre === false || !window.swogeFil || !window.swogeFil.pret()) {
      if (window.swogeConnexion && window.swogeConnexion.ouvre) {
        window.swogeConnexion.ouvre();
        return;
      }
      dit = "Connect to place a bet.";
      peintBulletin();
      return;
    }
    if (min && mise < min) return;
    if (max && mise > max) return;
    occupe = true; dit = "";
    peintBulletin();
    /* LE MEME MESSAGE QUE LA PAGE DE PARIS, aux memes champs. Un second format
       de pari serait un second endroit ou se tromper sur ce qu on engage. */
    window.swogeFil.envoie({
      type: "parie",
      selections: [{ match: choix.id, marche: BASE, choix: choix.issue }],
      mise: Math.floor(mise),
    });
    /* Si rien ne repond, le bouton ne reste pas « Placing… » pour toujours. */
    setTimeout(function () {
      if (occupe) { occupe = false; dit = "No answer from the board."; peintBulletin(); }
    }, 12000);
  }

  hote.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button[data-m]");
    if (!b) return;
    var id = b.getAttribute("data-m"), c = b.getAttribute("data-c");
    /* Recliquer la meme reponse la retire ; en cliquer une autre REMPLACE.
       Le meme geste que sur la page de paris. */
    if (choix && choix.id === id && choix.issue === c) choix = null;
    else choix = { id: id, issue: c };
    dit = "";
    reclame();
    peint();
  });

  bulletin.addEventListener("click", function (e) {
    if (e.target.closest(".gx-ote")) { choix = null; dit = ""; peint(); return; }
    if (e.target.closest(".gx-go")) { pose(); return; }
  });
  bulletin.addEventListener("input", function (e) {
    if (!e.target || e.target.id !== "gxMise") return;
    mise = Math.floor(Number(e.target.value) || 0);
    /* On ne repeint que ce qui change : refaire le bulletin entier reprendrait
       le champ sous les doigts et remettrait le curseur au debut. */
    var r = bulletin.querySelector(".gx-ret");
    var m = trouve(choix && choix.id), c = m && coteDe(m, choix.issue);
    var retour = (typeof c === "number" && mise > 0) ? Math.floor(mise * c) : 0;
    if (r) r.innerHTML = retour ? "returns <b>" + fmt(retour) + "</b>" : "&nbsp;";
    var g = bulletin.querySelector(".gx-go");
    if (g) g.textContent = libelleBouton();
  });

  /* ---- LES ONGLETS DISENT CE QU ON PROPOSE VRAIMENT ----
     Un sport sans rencontre ouverte s eteint au lieu de disparaitre : absent,
     on ne saurait pas qu il revient ; vif, on cliquerait sur une liste vide. */
  function cleOnglet(b) {
    var k = b.getAttribute("data-sport");
    if (k != null) return k;
    return (b.textContent || "").trim().toLowerCase();
  }
  function majOnglets() {
    if (!onglets) return;
    var vus = {};
    TOUT.forEach(function (m) { vus[m.sport] = (vus[m.sport] || 0) + 1; });
    [].forEach.call(onglets.querySelectorAll("button"), function (b) {
      var k = cleOnglet(b);
      var vide = !!k && !vus[k];
      b.classList.toggle("eteint", vide);
      b.disabled = vide;
      b.title = vide ? "No fixture open right now" : "";
    });
  }
  if (onglets) {
    onglets.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b || b.disabled) return;
      filtre = cleOnglet(b);
      [].forEach.call(onglets.querySelectorAll("button"), function (x) {
        x.classList.toggle("on", x === b);
      });
      peint();
    });
  }

  fetch(gxServeur() + "/paris/calendrier", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) {
      /* Du plus proche au plus lointain : une affiche montre ce qui vient, et
         le serveur ne promet aucun ordre. */
      (j.sports || []).forEach(function (s) { if (s && s.cle) NOMS[s.cle] = s.nom || s.cle; });
      TOUT = (j.matchs || []).slice().sort(function (a, b) { return a.debut - b.debut; });
      majOnglets(); peint();
      reclame();
    })
    .catch(function () {
      /* On ne remet PAS d exemple : de fausses cotes affichees « en attendant »
         finissent par etre prises pour les vraies. On dit que ca n a pas
         repondu, et le lien reste. */
      hote.innerHTML = '<div class="gx-dit">Fixtures could not be loaded. '
        + '<a class="vif" href="swogebet.html">Open the board &rarr;</a></div>';
    });

  /* ==================== L HABIT ====================
   * Seulement ce que CE fichier introduit. Les deux pages habillent deja
   * `.match`, `.ligue`, `.duel` et `.cotes` — les reprendre ici en ferait une
   * troisieme version, et c est justement ce qu on evite. */
  (function () {
    if (document.getElementById("gx-sports-css")) return;
    var st = document.createElement("style");
    st.id = "gx-sports-css";
    st.textContent =
      ".gx-liste{display:flex;flex-direction:column;gap:8px}" +
      ".gx-dit{font:600 12px/1.5 'Inter',system-ui,sans-serif;color:#6B7C99;padding:10px 2px}" +
      ".gx-dit a{color:#1B5FE0;text-decoration:none;font-weight:800}" +
      /* La cote prise se marque : sans elle, on ne sait plus ce qu on a
         choisi des que le bulletin passe sous le pouce. */
      ".cotes button.on{background:#1B5FE0;border-color:#1B5FE0;color:#fff}" +
      ".cotes button.on small{color:#fff}" +
      ".gx-bul{margin-top:10px;padding:11px;border-radius:12px;" +
        "background:#F4F7FC;border:1px solid #E1E9F6;display:flex;" +
        "flex-direction:column;gap:8px}" +
      ".gx-bul[hidden]{display:none}" +
      ".gx-bl{display:flex;align-items:center;gap:8px}" +
      ".gx-bl b{font:800 12px/1.3 'Inter',system-ui,sans-serif;color:#0B1B36;" +
        "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".gx-bl span{font:700 11.5px/1 'Inter',system-ui,sans-serif;color:#1B5FE0;white-space:nowrap}" +
      ".gx-ote{flex:0 0 auto;width:24px;height:24px;border-radius:7px;border:1px solid #E1E9F6;" +
        "background:#fff;color:#6B7C99;font-size:15px;line-height:1;cursor:pointer}" +
      ".gx-ote:hover{color:#0B1B36;border-color:#1B5FE0}" +
      ".gx-mise{display:flex;align-items:center;gap:9px}" +
      ".gx-mise input{flex:1;min-width:0;padding:9px 11px;border-radius:9px;" +
        "border:1px solid #E1E9F6;background:#fff;color:#0B1B36;" +
        "font:800 13px/1 'Inter',system-ui,sans-serif}" +
      ".gx-ret{font:700 11.5px/1 'Inter',system-ui,sans-serif;color:#6B7C99;white-space:nowrap}" +
      ".gx-ret b{color:#12A150}" +
      ".gx-go{width:100%;padding:11px;border-radius:10px;border:0;cursor:pointer;" +
        "font:800 12.5px/1 'Inter',system-ui,sans-serif;letter-spacing:.3px;" +
        "background:#1B5FE0;color:#fff}" +
      ".gx-go[disabled]{opacity:.6;cursor:progress}" +
      ".gx-msg{padding:0 2px;color:#B22A24}" +
      /* Le mot qui passe. `fixed` et tres haut : sur ces pages il y a une
         barre collante en haut et une bulle en bas. */
      ".gx-avis{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);" +
        "z-index:2147483000;background:#0A1F44;color:#fff;padding:11px 18px;" +
        "border-radius:12px;font:700 12.5px/1 'Inter',system-ui,sans-serif;" +
        "box-shadow:0 12px 32px rgba(11,27,54,.28);transition:opacity .5s;" +
        "pointer-events:none;max-width:90vw;text-align:center}" +
      ".gx-avis.part{opacity:0}";
    document.head.appendChild(st);
  })();
})();
