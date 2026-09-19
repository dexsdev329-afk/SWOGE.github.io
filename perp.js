"use strict";
/* ==========================================================================
 * LES DEUX COLONIES PERPETUELLES — LE PEINTRE
 *
 * ---- UNE COLONIE, TOUS LES MARCHES ----
 * Il y a eu une page par marche, puis une page pour cinq colonies. Il n y a
 * plus qu une colonie : une tresorerie, une memoire, un audit, qui lisent les
 * cinq marches a chaque tour et prennent le meilleur. « Il faudrait une
 * colonie pour tous les perps » — c est le bon sens d un bureau de trading,
 * et ca corrige ce que le decoupage cachait : cinq memoires nourries chacune
 * d un cinquieme des observations n apprennent rien.
 *
 * Ce que le decoupage faisait bien — savoir sur quel marche la colonie gagne
 * — ne doit pas etre perdu : la page RESTITUE la repartition par marche, et
 * le marche est devenu un trait que la memoire apprend.
 *
 * Le moteur est `ai_perp.js` cote serveur, et la page lit `GET /ai/perp` —
 * elle ne decide rien, ne signe rien, ne garde aucune cle. C est du PAPIER au
 * prix reel, et la page le dit en haut, pas en bas.
 *
 * ---- CE QUI EST INTERDIT ICI ----
 * Une carte qui montre un chiffre dit sur combien d'observations il porte, et
 * se tait en dessous. Un ecart sur quinze trades est de la chance : le
 * serveur donne `minObs`, et un verdict en dessous s'ecrit « pas encore »
 * plutot qu'un avis invente. C'est la meme regle que le panneau de la
 * colonie, et c'est elle qui empeche la page de mentir gentiment.
 * ======================================================================== */

/* ---- OU EST LE SERVEUR ----
 * Meme resolution que les autres pages : `?server=` pour essayer une autre
 * instance, sinon Railway. */
function ppServeur(){
  try{
    var q = new URLSearchParams(location.search).get("server");
    if(q) return String(q).replace(/^ws/, "http");
  }catch(e){}
  return "https://web-production-220a3.up.railway.app";
}
var PP_SERVEUR = ppServeur();
/* Les marches suivis : poses par la page, corriges par le serveur des la
   premiere reponse. Ils ne servent plus a choisir quoi demander — il n y a
   qu une vue — mais a les nommer avant qu elle arrive. */
var PP_MARCHES = (window.PERP_MARCHES || []).map(function(x){ return String(x).toUpperCase(); });
function ppNom(sym){ return String(sym || "").replace(/USDT$/, ""); }

/* ---- LES PHRASES, EN DEUX LANGUES ----
 * Jamais en dur dans le peintre : le jour ou une phrase change, elle change
 * une fois, et dans les deux langues a la fois. Ce qui reste en anglais quoi
 * qu'il arrive, ce sont les mots que le SERVEUR ecrit lui-meme (les raisons
 * de refus, le journal) : ils arrivent avec leurs chiffres dedans, et les
 * retraduire ici les inventerait. */
var PP_PHRASES = {
  sousTitre: ["One colony, one treasury. Eight agents read every perpetual market each turn, take the best paper position they can find, and learn from what actually worked",
              "Une colonie, une tresorerie. Huit agents lisent tous les marches perpetuels a chaque tour, prennent la meilleure position papier qu'ils trouvent, et apprennent de ce qui a marche"],
  papier: ["Paper · real prices", "Papier · prix reels"],
  avis: ["<b>Nothing is signed here.</b> No key, no order, no exchange account. The colony reads public Bitget market data on every market it follows, takes positions on paper at the real price, and is judged on what those positions actually did — funding cost included. This page shows; it decides nothing.",
         "<b>Rien n'est signe ici.</b> Aucune cle, aucun ordre, aucun compte d'echange. La colonie lit les donnees publiques de Bitget sur chacun des marches qu'elle suit, prend des positions sur le papier au prix reel, et se juge sur ce que ces positions ont vraiment fait — cout de financement compris. La page montre ; elle ne decide rien."],
  profit: ["Profit", "Profit"],
  tresor: ["Paper treasury", "Tresorerie papier"],
  taux: ["Win rate", "Taux de gain"],
  trades: ["Closed trades", "Trades fermes"],
  meilleur: ["Best trade", "Meilleur"],
  ouvertes: ["Open now", "Ouvertes"],
  financement: ["Funding paid", "Financement paye"],
  finSur: function(n){ return n ? "over " + n + " closed trades" : "nothing closed yet"; },
  positions: ["Open positions", "Positions ouvertes"],
  posVide: ["No position open right now.", "Aucune position ouverte pour le moment."],
  sens: ["Side", "Sens"], entree: ["Entry", "Entree"], stop: ["Stop", "Stop"],
  cible: ["Target", "Cible"], mise: ["Size", "Mise"], score: ["Score", "Score"],
  maintenant: ["Now", "Maintenant"],
  latent: ["Open P&L", "Gain latent"],
  depuis: ["Held", "Tenue"],
  carnet: ["Last closed trades", "Derniers trades fermes"],
  carnetVide: ["Nothing closed yet — the colony has not finished a trade on this market.",
               "Rien de ferme — la colonie n'a pas encore termine un trade sur ce marche."],
  brut: ["Price", "Prix"], fin: ["Funding", "Financement"], net: ["Net", "Net"],
  duree: ["Minutes", "Minutes"], pourquoi: ["Closed by", "Ferme par"],
  agents: ["The eight agents", "Les huit agents"],
  agentsSous: ["Not the token colony's agents: a perpetual market is read differently. Trend, regime, funding, range, order book, session, sizing, exit.",
               "Pas les agents de la colonie de jetons : un marche perpetuel ne se lit pas pareil. Tendance, regime, financement, couloir, carnet, seance, mise, sortie."],
  audit: ["What each refusal is worth", "Ce que vaut chaque refus"],
  auditSous: function(n, ref){
    if(!ref) return "Every refusal is shadowed and judged later. Nothing is comparable yet: the colony has taken too few positions to have a reference.";
    return "Every refusal is shadowed and judged later against what the colony actually takes (" + ref + "% winners over " + n + " observations). Below " + PP_MIN + " observations a rule gets no verdict at all.";
  },
  auditSousFr: function(n, ref){
    if(!ref) return "Chaque refus laisse une ombre, jugee plus tard. Rien n'est encore comparable : la colonie a pris trop peu de positions pour avoir une reference.";
    return "Chaque refus laisse une ombre, jugee plus tard contre ce que la colonie prend vraiment (" + ref + " % de gagnantes sur " + n + " observations). En dessous de " + PP_MIN + " observations, une regle n'a aucun verdict.";
  },
  regle: ["Rule", "Regle"], obs: ["Obs", "Obs"], part: ["Winners", "Gagnantes"],
  verdict: ["Verdict", "Verdict"],
  vProtege: ["protects", "protege"], vCoute: ["costs", "coute"],
  vPareil: ["same as taking", "comme prendre"], vAttente: ["not yet", "pas encore"],
  vManque: function(k){ return k + " more"; },
  vManqueFr: function(k){ return "encore " + k; },
  auditVide: ["No rule has been observed enough times yet.", "Aucune regle n'a encore assez d'observations."],
  journal: ["What just happened", "Ce qui vient de se passer"],
  marches: ["What each market gave back", "Ce que chaque marche a rendu"],
  marchesSous: ["One colony reads all of them each turn and takes the best score, wherever it is. This is the breakdown the five separate colonies used to give for free — and the only thing they did better.",
                "Une seule colonie les lit tous a chaque tour et prend le meilleur score, ou qu'il soit. C'est la repartition que les cinq colonies separees donnaient gratuitement — et la seule chose qu'elles faisaient mieux."],
  marchesVide: ["No market has been read yet.", "Aucun marche n'a encore ete lu."],
  journalDit: function(j, mo){ return "Every turn is also written raw to disk — " + j + " day(s), " + mo
    + " MB — so questions nobody thought to ask yet can still be answered later. Counters cannot be un-summed."; },
  journalDitFr: function(j, mo){ return "Chaque tour est aussi ecrit brut sur le disque \u2014 " + j + " jour(s), " + mo
    + " Mo \u2014 pour que les questions qu'on n'a pas encore posees aient une reponse plus tard. Un compteur ne se desadditionne pas."; },
  journalVideDit: ["The raw journal is empty: nothing has been written yet.",
                   "Le journal brut est vide : rien n'a encore ete ecrit."],
  marche: ["Market", "Marche"],
  fermes: ["Closed", "Fermes"],
  rapporte: ["Made", "Rapporte"],
  appris: ["Learned", "Appris"],
  apprisDit: function(k){ return "\u201cLearned\u201d is the colony's memory of that market, across every judged shadow — far more than the closed trades beside it. Below " + k + " observations it says nothing at all."; },
  apprisDitFr: function(k){ return "\u00ab Appris \u00bb est ce que la colonie a retenu du marche, sur toutes les ombres jugees \u2014 bien plus nombreuses que les trades fermes a cote. En dessous de " + k + " observations, elle ne dit rien."; },
  une: ["One colony · all markets", "Une colonie · tous les marches"],
  soupape: ["Famine valve", "Soupape de famine"],
  soupapeDit: function(t, d, n){
    return "When nothing passes the bar for " + t + " turns in a row, the colony takes the best candidate safety still allows — otherwise it can never build the reference every rule is judged against. "
      + (n ? n + " taken that way so far." : "Never used so far.")
      + (d ? " Currently " + d + " turn(s) without taking anything." : ""); },
  soupapeDitFr: function(t, d, n){
    return "Quand rien ne passe la barre pendant " + t + " tours d'affilee, la colonie prend le meilleur candidat que la securite laisse passer \u2014 sinon elle ne peut jamais construire la reference contre laquelle chaque regle est jugee. "
      + (n ? n + " prise(s) ainsi jusqu'ici." : "Jamais utilisee jusqu'ici.")
      + (d ? " Actuellement " + d + " tour(s) sans rien prendre." : ""); },
  soupapePasComparable: ["Not comparable yet: both groups need enough closed trades before the valve can be judged.",
                         "Pas encore comparable : les deux groupes ont besoin d'assez de trades fermes avant de juger la soupape."],
  parLaSoupape: ["Taken by the valve", "Prises par la soupape"],
  parLaColonie: ["Taken normally", "Prises normalement"],
  journalVide: ["Nothing yet. The colony takes a turn every few minutes.",
                "Rien encore. La colonie joue un tour toutes les quelques minutes."],
  ombres: function(a, j){ return a + " shadows waiting, " + j + " judged"; },
  ombresFr: function(a, j){ return a + " ombres en attente, " + j + " jugees"; },
  attente: ["waiting for data", "en attente de donnees"],
  vieux: ["stale — the server has not answered", "perime — le serveur n'a pas repondu"],
  horizons: function(l, r){ return "Shadows are judged at " + l.join(", ") + " minutes; " + r + " minutes is the reference."; },
  horizonsFr: function(l, r){ return "Les ombres sont jugees a " + l.join(", ") + " minutes ; " + r + " minutes fait reference."; }
};
var PP_MIN = 12;
var PP_PROFIL = 8;
var PP_LANGUE = (function(){
  try{ return localStorage.getItem("swogeLangue") === "fr" ? "fr" : "en"; }catch(e){ return "en"; }
})();
function pph(k){
  var e = PP_PHRASES[k];
  if(!e) return k;
  if(typeof e === "function") return e.apply(null, [].slice.call(arguments, 1));
  var v = e[PP_LANGUE === "fr" ? 1 : 0];
  return typeof v === "function" ? v.apply(null, [].slice.call(arguments, 1)) : v;
}
/* Quelques phrases ont une forme francaise a part (un pluriel, une espace
   avant le pour-cent) : on les nomme `...Fr` plutot que de bricoler la
   phrase anglaise a coups de remplacement. */
function pphF(k){
  var args = [].slice.call(arguments, 1);
  if(PP_LANGUE === "fr" && PP_PHRASES[k + "Fr"]) return PP_PHRASES[k + "Fr"].apply(null, args);
  var e = PP_PHRASES[k];
  return typeof e === "function" ? e.apply(null, args) : pph.apply(null, [k].concat(args));
}

/* ---- LES PETITS FORMATEURS ---- */
function ppEch(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
  return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
function ppArgent(n){
  if(n == null || !isFinite(n)) return "—";
  /* Les centimes sont gardes partout : une tresorerie a « $1,063 » a cote
     d'un profit a « +$63.20 » donne deux chiffres du meme bandeau qui ne se
     lisent pas de la meme facon, et on cherche lequel des deux est arrondi. */
  var s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 });
  return (n < 0 ? "-$" : "$") + s;
}
function ppSigne(n){
  if(n == null || !isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + ppArgent(n).replace("$-", "-$");
}
function ppPct(n, d){
  if(n == null || !isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(d == null ? 2 : d) + "%";
}
function ppPrix(n){
  if(n == null || !isFinite(n)) return "—";
  return n >= 100 ? n.toLocaleString("en-US", { maximumFractionDigits:1 })
                  : n.toLocaleString("en-US", { maximumFractionDigits:4 });
}
function ppDuree(min){
  min = Math.round(min);
  if(min < 60) return min + "m";
  var h = Math.floor(min / 60);
  return h < 24 ? h + "h" + String(min % 60).padStart(2, "0") : Math.floor(h / 24) + "d" + (h % 24) + "h";
}
function ppHeure(t){
  var d = new Date(t);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
function $$(id){ return document.getElementById(id); }

/* ==========================================================================
 * LE PEINTRE
 * ======================================================================== */

function ppTete(v){
  /* Le titre nomme les marches lus, pas un seul : il n y a qu une colonie, et
     elle les regarde tous a chaque tour. */
  if(v.marches && v.marches.length){ PP_MARCHES = v.marches.slice(); }
  $$("ppSym").textContent = PP_MARCHES.map(ppNom).join(" · ") || "PERPETUAL";
  var st = $$("ppStamp");
  /* Un etat vieux de plus de vingt minutes se DIT : sans ca, une page figee
     depuis une heure se lit comme un marche calme. */
  var vieux = !v.maj || (Date.now() - v.maj) > 20 * 60000;
  st.className = "pp-puce" + (vieux ? " vieux" : "");
  st.textContent = "● " + (!v.maj ? pph("attente")
                   : vieux ? pph("vieux") : ppHeure(v.maj) + " · " + v.tours + " turns");
}

function ppBande(v){
  var p = v.profit;
  $$("ppProfit").textContent = ppSigne(p);
  $$("ppProfit").className = p > 0 ? "pp-vert" : p < 0 ? "pp-rouge" : "";
  $$("ppTresor").textContent = ppArgent(v.tresor);
  /* Le taux de gain n'a de sens qu'au-dela d'une poignee de trades : en
     dessous, il n'est pas affiche du tout. Quinze trades a 60 %, c'est neuf
     trades — on ne conclut pas la-dessus. */
  var assez = v.trades >= 20;
  $$("ppTaux").textContent = (assez && v.partGagnantes != null) ? v.partGagnantes + "%" : "—";
  $$("ppTauxSur").textContent = v.trades ? (assez ? "on " + v.trades : "need " + (20 - v.trades) + " more") : "";
  $$("ppTrades").textContent = v.trades || 0;
  $$("ppMeilleur").textContent = (typeof v.meilleur === "number" && v.meilleur) ? ppPct(v.meilleur) : "—";
  $$("ppOuvertes").textContent = v.positions.length;
  var f = v.financement || { n:0, total:0 };
  $$("ppFin").textContent = f.n ? ppPct(f.total, 2) : "—";
  $$("ppFin").className = f.total < 0 ? "pp-rouge" : f.total > 0 ? "pp-vert" : "";
  $$("ppFinSur").textContent = pph("finSur", f.n);
}

function ppPositions(v){
  var c = $$("ppPos");
  if(!v.positions.length){ c.innerHTML = '<div class="pp-vide">' + ppEch(pph("posVide")) + "</div>"; return; }
  /* ---- LE PRIX MAINTENANT, ET CE QUE LA POSITION VAUT ----
   * Le tableau ne montrait que l entree, le stop et la cible : trois chiffres
   * figes au moment de l ouverture. « On ne voit pas le prix actuel ni
   * combien on gagne » — c est pourtant la seule chose qu on vient voir sur
   * une position ouverte. Le marche est en premiere colonne : avec une
   * colonie sur cinq marches, « SHORT a 81 214 » ne dit pas de quoi on parle. */
  var h = '<table class="pp-tab"><tr><th>' + ppEch(pph("marche")) + "</th><th>" + ppEch(pph("sens"))
        + "</th><th>" + ppEch(pph("entree")) + "</th><th>" + ppEch(pph("maintenant"))
        + "</th><th>" + ppEch(pph("latent")) + "</th><th>"
        + ppEch(pph("stop")) + "</th><th>" + ppEch(pph("cible")) + "</th><th>"
        + ppEch(pph("mise")) + "</th><th>" + ppEch(pph("depuis")) + "</th></tr>";
  v.positions.forEach(function(p){
    /* Le gain latent porte le financement deja paye : sans lui, le chiffre
       affiche serait plus flatteur que celui qu on encaissera. */
    var cls = p.net > 0 ? "pp-vert" : p.net < 0 ? "pp-rouge" : "";
    h += "<tr><td><b>" + ppEch(p.nom || ppNom(p.sym)) + "</b></td>"
       + "<td><span class='pp-sens " + (p.sens > 0 ? "long'>LONG" : "short'>SHORT") + "</span></td>"
       + "<td class='num'>" + ppPrix(p.prix0) + "</td>"
       + "<td class='num'><b>" + (p.prix == null ? "—" : ppPrix(p.prix)) + "</b></td>"
       + "<td class='num " + cls + "'>" + (p.net == null ? "—"
            : "<b>" + ppSigne(p.gain) + "</b> <i class='pp-n'>" + ppPct(p.net) + "</i>") + "</td>"
       + "<td class='num'>" + ppPrix(p.stop) + "</td>"
       + "<td class='num'>" + ppPrix(p.cible) + "</td><td class='num'>" + ppArgent(p.mise) + "</td>"
       + "<td class='num'>" + ppDuree((Date.now() - p.depuis) / 60000) + "</td></tr>";
  });
  c.innerHTML = h + "</table>";
}

function ppCarnet(v){
  var c = $$("ppCarnet");
  if(!v.carnet.length){ c.innerHTML = '<div class="pp-vide">' + ppEch(pph("carnetVide")) + "</div>"; return; }
  var h = '<table class="pp-tab"><tr><th>' + ppEch(pph("marche")) + "</th><th>" + ppEch(pph("sens"))
        + "</th><th>" + ppEch(pph("entree"))
        + "</th><th>" + ppEch(pph("brut")) + "</th><th>" + ppEch(pph("fin")) + "</th><th>"
        + ppEch(pph("net")) + "</th><th>" + ppEch(pph("duree")) + "</th><th>" + ppEch(pph("pourquoi")) + "</th></tr>";
  v.carnet.slice(0, 20).forEach(function(t){
    h += "<tr><td><b>" + ppEch(ppNom(t.sym)) + "</b></td>"
       + "<td><span class='pp-sens " + (t.sens > 0 ? "long'>LONG" : "short'>SHORT") + "</span></td>"
       + "<td class='num'>" + ppPrix(t.prix0) + "</td>"
       + "<td class='num'>" + ppPct(t.brut) + "</td>"
       /* Le financement est montre A PART du mouvement du prix : c'est la
          ligne qu'on regarde quand le papier a l'air bon et que le net ne
          suit pas. */
       + "<td class='num " + (t.financement < 0 ? "pp-rouge" : "") + "'>" + ppPct(t.financement) + "</td>"
       + "<td class='num " + (t.r > 0 ? "pp-vert" : t.r < 0 ? "pp-rouge" : "") + "'>" + ppPct(t.r) + "</td>"
       + "<td class='num'>" + ppDuree(t.minutes) + "</td>"
       + "<td>" + ppEch(t.pourquoi) + "</td></tr>";
  });
  c.innerHTML = h + "</table>";
}

/* ---- LE ROLE EST UNE CLE, PAS UN MOT A MONTRER ----
 * Le serveur nomme les roles en francais — `garde`, `specialiste`, `banque`,
 * `execution` — parce que tout le code l'est. Affiches tels quels, ils
 * mettaient quatre mots francais au milieu d'un panneau anglais. Ce sont des
 * cles : elles se traduisent ici, dans les deux langues, comme le reste. */
var PP_ROLES = {
  scout:       ["scout", "eclaireur"],
  garde:       ["guard", "garde"],
  specialiste: ["specialist", "specialiste"],
  banque:      ["sizing", "mise"],
  execution:   ["exit", "sortie"]
};
function ppRole(r){
  var e = PP_ROLES[r];
  return e ? e[PP_LANGUE === "fr" ? 1 : 0] : r;
}
function ppAgents(v){
  $$("ppAgents").innerHTML = v.agents.map(function(a){
    return '<div class="pp-ag"><div class="t"><span class="e">' + ppEch(a.emoji) + "</span><b>"
      + ppEch(a.nom) + '</b><span class="r">' + ppEch(ppRole(a.role)) + "</span></div><p>"
      + ppEch(a.quoi) + "</p></div>";
  }).join("");
}

function ppAudit(v){
  var ref = v.reference;
  $$("ppAuditSous").textContent = pphF("auditSous", ref ? ref.n : 0, ref ? ref.partGagnantes : null);
  var c = $$("ppAudit");
  var lignes = (v.audit || []).filter(function(l){ return l.cle !== "pris"; });
  if(!lignes.length){ c.innerHTML = '<div class="pp-vide">' + ppEch(pph("auditVide")) + "</div>"; return; }
  var parCle = {};
  (v.verdicts || []).forEach(function(x){ parCle[x.cle] = x; });
  var h = '<table class="pp-tab"><tr><th>' + ppEch(pph("regle")) + "</th><th>" + ppEch(pph("obs"))
        + "</th><th>" + ppEch(pph("part")) + "</th><th>" + ppEch(pph("verdict")) + "</th></tr>";
  lignes.forEach(function(l){
    var w = parCle[l.cle] || { verdict:"unknown" };
    /* « protege » veut dire : ce qu'on a refuse a MOINS bien marche que ce
       qu'on prend. « coute » veut dire l'inverse, et c'est la ligne qu'on
       vient chercher. En dessous de l'echantillon, aucun des deux. */
    var cls = w.verdict === "protects" ? "bon" : w.verdict === "costs" ? "mauvais" : "attente";
    var mot = w.verdict === "protects" ? pph("vProtege")
            : w.verdict === "costs" ? pph("vCoute")
            : w.verdict === "same" ? pph("vPareil")
            : pph("vAttente") + (w.manque ? " · " + pphF("vManque", w.manque) : "");
    h += "<tr><td>" + ppEch(l.cle) + "</td><td class='num'>" + l.n + "</td><td class='num'>"
       + l.partGagnantes + "%</td><td><span class='pp-verdict " + cls + "'>" + ppEch(mot) + "</span></td></tr>";
  });
  c.innerHTML = h + "</table>";
}

/* ---- CE QUE CHAQUE MARCHE A RENDU ----
 * Le decoupage en cinq colonies donnait cette repartition gratuitement. Une
 * colonie unique doit la RENDRE, sinon on perd la seule chose que le
 * decoupage faisait bien : savoir sur quel marche la colonie gagne.
 *
 * Deux colonnes, et elles ne disent pas la meme chose : « fermes » porte sur
 * les trades reellement clotures, « appris » sur toutes les ombres jugees —
 * bien plus nombreuses. Chacune avec son effectif, parce qu un marche vu
 * trois fois ne se compare pas a un marche vu cent fois. */
function ppParMarche(v){
  /* Ce que le journal brut porte. Ce n'est pas une decoration : sans lui on
     ne sait pas si la question « comment gagne-t-on sur la duree » a
     seulement de quoi etre posee. */
  /* La soupape : sans elle la colonie ne prend rien, et sans rien de pris
     l audit ne peut jamais conclure. Elle doit donc se voir. */
  var sp = v.soupape;
  if(sp){
    $$("ppSoupapeDit").textContent = pphF("soupapeDit", sp.tours, sp.disette, sp.prises);
    var lg = [[pph("parLaSoupape"), sp.soupape], [pph("parLaColonie"), sp.colonie]];
    $$("ppSoupape").innerHTML = '<table class="pp-tab"><tr><th></th><th>' + ppEch(pph("fermes"))
      + "</th><th>" + ppEch(pph("part")) + "</th><th>" + ppEch(pph("net")) + "</th></tr>"
      + lg.map(function(x){
          return "<tr><td>" + ppEch(x[0]) + "</td><td class='num'>" + (x[1].n || "—")
            + "</td><td class='num'>" + (x[1].n ? x[1].partGagnantes + "%" : "—")
            + "</td><td class='num " + (x[1].moyenne > 0 ? "pp-vert" : x[1].moyenne < 0 ? "pp-rouge" : "") + "'>"
            + (x[1].n ? ppPct(x[1].moyenne) : "—") + "</td></tr>";
        }).join("") + "</table>"
      + (sp.comparable ? "" : '<p class="sur">' + ppEch(pph("soupapePasComparable")) + "</p>");
  }
  var j = v.journal;
  $$("ppJournal").textContent = (j && j.jours)
    ? pphF("journalDit", j.jours, Math.max(0.1, Math.round(j.octets / 104857.6) / 10))
    : pph("journalVideDit");
  var t = $$("ppMarches");
  var l = v.parMarche || [];
  if(!l.length){ t.innerHTML = '<div class="pp-vide">' + ppEch(pph("marchesVide")) + "</div>"; return; }
  var h = '<table class="pp-tab"><tr><th>' + ppEch(pph("marche")) + "</th><th>" + ppEch(pph("fermes"))
        + "</th><th>" + ppEch(pph("part")) + "</th><th>" + ppEch(pph("rapporte")) + "</th><th>"
        + ppEch(pph("fin")) + "</th><th>" + ppEch(pph("appris")) + "</th></tr>";
  l.forEach(function(m){
    /* Aucun trade ferme : des tirets, jamais des zeros. « 0 % de gagnantes »
       se lit comme un marche qui perd tout ; ici on n a rien vu du tout. */
    h += "<tr><td><b>" + ppEch(m.nom) + "</b></td>"
       + "<td class='num'>" + (m.n || "—") + "</td>"
       + "<td class='num'>" + (m.n ? m.partGagnantes + "%" : "—") + "</td>"
       + "<td class='num " + (m.gain > 0 ? "pp-vert" : m.gain < 0 ? "pp-rouge" : "") + "'>"
       + (m.n ? ppSigne(m.gain) : "—") + "</td>"
       + "<td class='num " + (m.financement < 0 ? "pp-rouge" : "") + "'>"
       + (m.n ? ppPct(m.financement, 2) : "—") + "</td>"
       + "<td class='num'>" + (m.appris
            ? "<b>" + ppPct(m.appris.moyenne, 2) + "</b> <i class='pp-n'>" + m.appris.n + "</i>"
            : "<span class='pp-verdict attente'>" + ppEch(pph("vAttente"))
              + (m.obs ? " · " + m.obs + "/" + PP_PROFIL : "") + "</span>")
       + "</td></tr>";
  });
  t.innerHTML = h + "</table>";
}

function ppFlux(v){
  var c = $$("ppFlux");
  if(!v.flux || !v.flux.length){ c.innerHTML = '<div class="pp-vide">' + ppEch(pph("journalVide")) + "</div>"; return; }
  c.innerHTML = '<ul class="pp-flux">' + v.flux.map(function(f){
    return "<li><time>" + ppHeure(f.t) + "</time><span>" + ppEch(f.quoi)
      + (f.score == null ? "" : " <b>" + f.score.toFixed(2) + "</b>") + "</span></li>";
  }).join("") + "</ul>";
}

function ppPeint(v){
  PP_MIN = v.minObs || PP_MIN;
  PP_PROFIL = v.profilMinObs || PP_PROFIL;

  ppTete(v); ppBande(v); ppPositions(v); ppCarnet(v); ppAgents(v); ppAudit(v); ppParMarche(v); ppFlux(v);
  $$("ppOmbres").textContent = pphF("ombres", v.ombres.enAttente, v.ombres.jugees);
  $$("ppHorizons").textContent = pphF("horizons", v.horizons, v.horizonRef);
}

/* ---- LA DEMANDE ----
 * Toutes les trente secondes ; le moteur, lui, joue un tour toutes les cinq
 * minutes. On ne demande pas plus vite que ca ne change. */
var PP_DERNIERE = null;
function ppDemande(){
  fetch(PP_SERVEUR + "/ai/perp", { cache:"no-store" })
    .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(v){
      if(v && v.erreur){ $$("ppStamp").textContent = "● " + v.erreur; return; }
      PP_DERNIERE = v; ppPeint(v);
    })
    ["catch"](function(){
      /* On garde le dernier etat peint : un ecran vide dirait « la colonie
         s'est arretee », alors que c'est la demande qui a rate. */
      var st = $$("ppStamp"); if(st && !PP_DERNIERE) st.textContent = "● " + pph("attente");
    });
}

function ppLangue(){
  PP_LANGUE = PP_LANGUE === "fr" ? "en" : "fr";
  try{ localStorage.setItem("swogeLangue", PP_LANGUE); }catch(e){}
  ppStatique();
  if(PP_DERNIERE) ppPeint(PP_DERNIERE);
}

/* Les textes qui ne dependent pas du serveur. */
function ppStatique(){
  $$("ppLangue").textContent = PP_LANGUE === "fr" ? "🇫🇷" : "🇬🇧";
  $$("ppSous").textContent = pph("sousTitre");
  $$("ppAvis").innerHTML = pph("avis");
  $$("ppPapier").textContent = pph("papier");
  [["ppLProfit","profit"],["ppLTresor","tresor"],["ppLTaux","taux"],["ppLTrades","trades"],
   ["ppLMeilleur","meilleur"],["ppLOuvertes","ouvertes"],["ppLFin","financement"],
   ["ppTPos","positions"],["ppTCarnet","carnet"],["ppTAgents","agents"],
   ["ppTAudit","audit"],["ppTMarches","marches"],["ppTSoupape","soupape"],["ppTFlux","journal"]].forEach(function(p){
    var e = $$(p[0]); if(e) e.textContent = pph(p[1]);
  });
  $$("ppAgentsSous").textContent = pph("agentsSous");
  $$("ppMarchesSous").textContent = pph("marchesSous");
  $$("ppAppris").textContent = pphF("apprisDit", PP_PROFIL);
  $$("ppUne").textContent = pph("une");
}

document.addEventListener("DOMContentLoaded", function(){
  ppStatique();
  $$("ppSym").textContent = PP_MARCHES.map(ppNom).join(" · ") || "PERPETUAL";
  $$("ppLangue").addEventListener("click", ppLangue);
  ppDemande();
  setInterval(function(){ ppDemande(); }, 30000);
});
