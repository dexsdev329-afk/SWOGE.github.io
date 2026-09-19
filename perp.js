"use strict";
/* ==========================================================================
 * LES DEUX COLONIES PERPETUELLES — LE PEINTRE
 *
 * Un seul fichier pour BTC et ETH : la page declare `window.PERP_SYM`, et
 * tout le reste est identique. Le moteur est `ai_perp.js` cote serveur, un
 * etat par symbole, et la page lit `GET /ai/perp/<SYM>` — elle ne decide
 * rien, ne signe rien, ne garde aucune cle. C'est du PAPIER au prix reel, et
 * la page le dit en haut, pas en bas.
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
var PP_SYM = String(window.PERP_SYM || "BTCUSDT").toUpperCase();
var PP_NOM = PP_SYM.replace(/USDT$/, "");

/* ---- LES PHRASES, EN DEUX LANGUES ----
 * Jamais en dur dans le peintre : le jour ou une phrase change, elle change
 * une fois, et dans les deux langues a la fois. Ce qui reste en anglais quoi
 * qu'il arrive, ce sont les mots que le SERVEUR ecrit lui-meme (les raisons
 * de refus, le journal) : ils arrivent avec leurs chiffres dedans, et les
 * retraduire ici les inventerait. */
var PP_PHRASES = {
  sousTitre: ["Eight agents read the live perpetual market, take paper positions and learn from what actually worked",
              "Huit agents lisent le marche perpetuel en direct, prennent des positions papier et apprennent de ce qui a marche"],
  papier: ["Paper · real prices", "Papier · prix reels"],
  avis: ["<b>Nothing is signed here.</b> No key, no order, no exchange account. The colony reads public Bitget market data, takes positions on paper at the real price, and is judged on what those positions actually did — funding cost included. This page shows; it decides nothing.",
         "<b>Rien n'est signe ici.</b> Aucune cle, aucun ordre, aucun compte d'echange. La colonie lit les donnees publiques de Bitget, prend des positions sur le papier au prix reel, et se juge sur ce que ces positions ont vraiment fait — cout de financement compris. La page montre ; elle ne decide rien."],
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
  commun: ["The same rules, across all markets", "Les memes regles, sur tous les marches"],
  communSous: function(n, ref, m){
    if(!ref) return "Each market judges its own rules, but twelve observations is a fragile verdict. Pooled across " + m + " markets, the same rule gets several times the sample for the same elapsed time. Nothing is comparable yet: too little has been taken.";
    return "Each market judges its own rules, but twelve observations is a fragile verdict. Pooled across " + m + " markets, a rule is judged against what the colonies actually take (" + ref + "% winners over " + n + " observations).";
  },
  communSousFr: function(n, ref, m){
    if(!ref) return "Chaque marche juge ses propres regles, mais douze observations font un verdict fragile. Mis en commun sur " + m + " marches, une regle recoit plusieurs fois l'echantillon pour le meme temps ecoule. Rien n'est encore comparable : trop peu a ete pris.";
    return "Chaque marche juge ses propres regles, mais douze observations font un verdict fragile. Mis en commun sur " + m + " marches, une regle se juge contre ce que les colonies prennent vraiment (" + ref + " % de gagnantes sur " + n + " observations).";
  },
  communVide: ["No rule has been observed enough times on any market yet.",
               "Aucune regle n'a encore assez d'observations, sur aucun marche."],
  repartition: ["Per market", "Par marche"],
  vDiverge: ["markets disagree", "marches en desaccord"],
  divergeDit: function(e, m){ return "spread of " + e + " points across " + m + " markets — pooling them would give a number that is right about nothing"; },
  divergeDitFr: function(e, m){ return e + " points d'ecart sur " + m + " marches — les additionner donnerait un chiffre juste sur rien"; },
  borne: function(p){ return "Above " + p + " points of spread between markets, the pooled verdict is withheld. That bound was set with no measurement behind it — the colonies were born the same day — so the spread is printed on every line, to be read back against."; },
  borneFr: function(p){ return "Au-dela de " + p + " points d'ecart entre marches, le verdict commun est retenu. Cette borne a ete posee sans aucune mesure — les colonies sont nees le meme jour — donc l'ecart est ecrit sur chaque ligne, pour qu'on puisse la relire contre des chiffres."; },
  journalVide: ["Nothing yet. The colony takes a turn every few minutes.",
                "Rien encore. La colonie joue un tour toutes les quelques minutes."],
  ombres: function(a, j){ return a + " shadows waiting, " + j + " judged"; },
  ombresFr: function(a, j){ return a + " ombres en attente, " + j + " jugees"; },
  attente: ["waiting for data", "en attente de donnees"],
  vieux: ["stale — the server has not answered", "perime — le serveur n'a pas repondu"],
  horizons: function(l, r){ return "Shadows are judged at " + l.join(", ") + " minutes; " + r + " minutes is the reference."; },
  horizonsFr: function(l, r){ return "Les ombres sont jugees a " + l.join(", ") + " minutes ; " + r + " minutes fait reference."; }
};
var PP_MIN = 60;
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
  $$("ppSym").textContent = PP_NOM + " · PERPETUAL";
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
  $$("ppMeilleur").textContent = v.meilleur ? ppPct(v.meilleur.r) : "—";
  $$("ppOuvertes").textContent = v.positions.length;
  var f = v.financement || { n:0, total:0 };
  $$("ppFin").textContent = f.n ? ppPct(f.total, 2) : "—";
  $$("ppFin").className = f.total < 0 ? "pp-rouge" : f.total > 0 ? "pp-vert" : "";
  $$("ppFinSur").textContent = pph("finSur", f.n);
}

function ppPositions(v){
  var c = $$("ppPos");
  if(!v.positions.length){ c.innerHTML = '<div class="pp-vide">' + ppEch(pph("posVide")) + "</div>"; return; }
  var h = '<table class="pp-tab"><tr><th>' + ppEch(pph("sens")) + "</th><th>" + ppEch(pph("entree"))
        + "</th><th>" + ppEch(pph("stop")) + "</th><th>" + ppEch(pph("cible")) + "</th><th>"
        + ppEch(pph("mise")) + "</th><th>" + ppEch(pph("score")) + "</th><th>" + ppEch(pph("depuis")) + "</th></tr>";
  v.positions.forEach(function(p){
    h += "<tr><td><span class='pp-sens " + (p.sens > 0 ? "long'>LONG" : "short'>SHORT") + "</span></td>"
       + "<td class='num'>" + ppPrix(p.prix0) + "</td><td class='num'>" + ppPrix(p.stop) + "</td>"
       + "<td class='num'>" + ppPrix(p.cible) + "</td><td class='num'>" + ppArgent(p.mise) + "</td>"
       + "<td class='num'>" + (p.score == null ? "—" : p.score.toFixed(2)) + "</td>"
       + "<td class='num'>" + ppDuree((Date.now() - p.depuis) / 60000) + "</td></tr>";
  });
  c.innerHTML = h + "</table>";
}

function ppCarnet(v){
  var c = $$("ppCarnet");
  if(!v.carnet.length){ c.innerHTML = '<div class="pp-vide">' + ppEch(pph("carnetVide")) + "</div>"; return; }
  var h = '<table class="pp-tab"><tr><th>' + ppEch(pph("sens")) + "</th><th>" + ppEch(pph("entree"))
        + "</th><th>" + ppEch(pph("brut")) + "</th><th>" + ppEch(pph("fin")) + "</th><th>"
        + ppEch(pph("net")) + "</th><th>" + ppEch(pph("duree")) + "</th><th>" + ppEch(pph("pourquoi")) + "</th></tr>";
  v.carnet.slice(0, 20).forEach(function(t){
    h += "<tr><td><span class='pp-sens " + (t.sens > 0 ? "long'>LONG" : "short'>SHORT") + "</span></td>"
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

/* ---- L AUDIT COMMUN ----
 * La repartition par marche part AVEC le total, jamais apres : c'est elle qui
 * dit si on avait le droit d'additionner. Une ligne dont les marches
 * divergent ne conclut pas — elle montre l'ecart. */
function ppCommun(v){
  var c = v.commun || {};
  var ref = c.reference;
  $$("ppCommunSous").textContent = pphF("communSous", ref ? ref.n : 0, ref ? ref.partGagnantes : null,
                                        (c.symboles || []).length);
  $$("ppBorne").textContent = pphF("borne", c.divergePoints);
  var t = $$("ppCommun");
  var l = c.audit || [];
  if(!l.length){ t.innerHTML = '<div class="pp-vide">' + ppEch(pph("communVide")) + "</div>"; return; }
  var h = '<table class="pp-tab"><tr><th>' + ppEch(pph("regle")) + "</th><th>" + ppEch(pph("obs"))
        + "</th><th>" + ppEch(pph("part")) + "</th><th>" + ppEch(pph("verdict")) + "</th><th>"
        + ppEch(pph("repartition")) + "</th></tr>";
  l.forEach(function(x){
    var w = x.verdict || { verdict:"unknown" };
    var cls = w.verdict === "protects" ? "bon"
            : w.verdict === "costs" ? "mauvais"
            : w.verdict === "diverge" ? "diverge" : "attente";
    var mot = w.verdict === "protects" ? pph("vProtege")
            : w.verdict === "costs" ? pph("vCoute")
            : w.verdict === "diverge" ? pph("vDiverge")
            : w.verdict === "same" ? pph("vPareil")
            : pph("vAttente") + (w.manque ? " · " + pphF("vManque", w.manque) : "");
    var titre = w.verdict === "diverge" ? pphF("divergeDit", w.ecart, w.marches) : "";
    /* Chaque marche avec son effectif : une regle vue mille fois sur BTC et
       trois fois sur DOGE ne doit pas se lire comme « vue partout ». */
    var parts = Object.keys(x.marches || {}).map(function(k){
      var m = x.marches[k];
      return '<span class="pp-m"><b>' + ppEch(k.replace(/USDT$/, "")) + "</b> "
        + (m.partGagnantes == null ? "—" : m.partGagnantes + "%") + " <i>" + m.n + "</i></span>";
    }).join("");
    h += "<tr><td>" + ppEch(x.cle) + "</td><td class='num'>" + x.n + "</td><td class='num'>"
       + x.partGagnantes + "%</td><td><span class='pp-verdict " + cls + "'"
       + (titre ? " title='" + ppEch(titre) + "'" : "") + ">" + ppEch(mot) + "</span>"
       + (x.ecart === null || x.ecart === undefined ? "" : "<small class='pp-ecart'>" + x.ecart + "pt</small>")
       + "</td><td>" + parts + "</td></tr>";
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
  ppTete(v); ppBande(v); ppPositions(v); ppCarnet(v); ppAgents(v); ppAudit(v); ppCommun(v); ppFlux(v);
  $$("ppOmbres").textContent = pphF("ombres", v.ombres.enAttente, v.ombres.jugees);
  $$("ppHorizons").textContent = pphF("horizons", v.horizons, v.horizonRef);
}

/* ---- LA DEMANDE ----
 * Toutes les trente secondes ; le moteur, lui, joue un tour toutes les cinq
 * minutes. On ne demande pas plus vite que ca ne change. */
var PP_DERNIERE = null;
function ppDemande(){
  fetch(PP_SERVEUR + "/ai/perp/" + PP_SYM, { cache:"no-store" })
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
   ["ppTAudit","audit"],["ppTCommun","commun"],["ppTFlux","journal"]].forEach(function(p){
    var e = $$(p[0]); if(e) e.textContent = pph(p[1]);
  });
  $$("ppAgentsSous").textContent = pph("agentsSous");
}

document.addEventListener("DOMContentLoaded", function(){
  ppStatique();
  $$("ppLangue").addEventListener("click", ppLangue);
  ppDemande();
  setInterval(ppDemande, 30000);
});
