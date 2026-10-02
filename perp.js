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
  meilleur: ["Best / worst trade", "Meilleur / pire trade"],
  /* 28/09/2026 : le meilleur trade s'affichait seul, au chiffre papier. Le pire
     a cote, les deux aux frais reels, avec leur effectif. */
  extremesSur: function(n){ return "at real fees, over " + n + " trades"; },
  extremesSurFr: function(n){ return "aux frais reels, sur " + n + " trades"; },
  profitSur: function(d, n){ return "since " + d + " \u00b7 " + n + " closed trades"; },
  profitSurFr: function(d, n){ return "depuis le " + d + " \u00b7 " + n + " trades fermes"; },
  ciNet: function(lo, hi){ return "95% CI " + lo + " to " + hi; },
  ciNetFr: function(lo, hi){ return "IC 95 % " + lo + " a " + hi; },
  ouvertes: ["Open now", "Ouvertes"],
  /* « Funding paid » en vert disait l'inverse du chiffre : le financement s'AJOUTE
     au net (ai_perp.js, rReelDe : brut + financement - frais), positif = recu. */
  financement: ["Funding (net)", "Financement (net)"],
  finSur: function(n, t){ return !n ? "nothing closed yet" : (t > 0 ? "received" : t < 0 ? "paid" : "net zero") + " over " + n + " closed trades"; },
  finSurFr: function(n, t){ return !n ? "rien de ferme" : (t > 0 ? "recu" : t < 0 ? "paye" : "nul") + " sur " + n + " trades fermes"; },
  positions: ["Open positions", "Positions ouvertes"],
  posVide: ["No position open right now.", "Aucune position ouverte pour le moment."],
  sens: ["Side", "Sens"], entree: ["Entry", "Entree"], stop: ["Stop", "Stop"],
  cible: ["Target", "Cible"], mise: ["Size", "Mise"], score: ["Score", "Score"],
  maintenant: ["Now", "Maintenant"],
  latent: ["Open P&L", "Gain latent"],
  depuis: ["Held", "Tenue"],
  carnet: ["Closed trades", "Trades fermes"],
  carnetSous: function(n, tot){ return "Every closed trade the server keeps (" + n + (tot > n ? " of " + tot : "") + "), newest first. \u201cReal fees\u201d is the same trade at Bitget's real fees: taker 0.06% to enter, at a stop and at the clock, maker 0.02% at a target."; },
  carnetSousFr: function(n, tot){ return "Chaque trade ferme que le serveur garde (" + n + (tot > n ? " sur " + tot : "") + "), le plus recent d'abord. \u00ab Frais reels \u00bb est le meme trade aux vrais frais Bitget : taker 0,06 % a l'entree, au stop et a l'echeance, maker 0,02 % a la cible."; },
  fraisReels: ["Real fees", "Frais reels"],
  netTrade: ["Net per trade", "Net par trade"],
  pasJugeable: function(n, s){ return "not judgeable (" + n + "/" + s + ")"; },
  pasJugeableFr: function(n, s){ return "pas jugeable (" + n + "/" + s + ")"; },
  jugeableSur: function(n, j){ return "real fees · on " + n + " trades, " + j + " day(s)"; },
  jugeableSurFr: function(n, j){ return "frais reels \u00b7 sur " + n + " trades, " + j + " jour(s)"; },
  tauxSur: function(n, lo, hi){ return "on " + n + (lo == null ? "" : " \u00b7 95% CI " + lo + "\u2013" + hi + "%"); },
  tauxSurFr: function(n, lo, hi){ return "sur " + n + (lo == null ? "" : " \u00b7 IC 95 % " + lo + "\u2013" + hi + " %"); },
  encore: [function(k){ return "need " + k + " more"; }, function(k){ return "encore " + k + " trades"; }],
  tauxSurRecents: function(n, lo, hi){ return "on the " + n + " most recent" + (lo == null ? "" : " \u00b7 95% CI " + lo + "\u2013" + hi + "%"); },
  tauxSurRecentsFr: function(n, lo, hi){ return "sur les " + n + " plus recents" + (lo == null ? "" : " \u00b7 IC 95 % " + lo + "\u2013" + hi + " %"); },
  issue: ["What taking actually did", "Ce que prendre a vraiment rapporte"],
  /* Le meme trade pris dans l'autre sens (serveur, `noteInverse`, 02/10) : une
     hypothese trouvee en cherchant dans le passe, mesuree sur les trades A VENIR. */
  miroir: function(d){ return "The same trades, taken the other way" + (d ? " · counted since " + d : ""); },
  miroirFr: function(d){ return "Les memes trades, pris dans l'autre sens" + (d ? " · comptes depuis le " + d : ""); },
  miroirDit: function(s){ return "A hypothesis, not a result: on the first 114 trades the score looked backwards (+0.21% a trade the other way, t 1.65), but that was found by searching the past. It is now counted on every NEW trade, at the real fees of the opposite exit, and judged only at " + s + " trades. Nothing is traded on it."; },
  miroirDitFr: function(s){ return "Une hypothese, pas un resultat : sur les 114 premiers trades, la note semblait a l'envers (+0,21 % par trade dans l'autre sens, t 1,65), mais c'etait trouve en cherchant dans le passe. Elle est maintenant comptee sur chaque NOUVEAU trade, aux frais reels de la sortie inverse, et jugee seulement a " + s + " trades. Rien n'est trade dessus."; },
  miroirVerdict: function(v){ return v === "opposite side wins" ? "the other way wins" : v === "opposite side loses" ? "the other way loses too" : v === "no difference" ? "no difference" : ""; },
  miroirVerdictFr: function(v){ return v === "opposite side wins" ? "l'autre sens gagne" : v === "opposite side loses" ? "l'autre sens perd aussi" : v === "no difference" ? "aucune difference" : ""; },
  issueDit: function(n, s){ return "The shadows above are judged at a fixed 4 hours. Trades exit at their stop, their target or the 12-hour clock: this is what they actually returned, at real fees, on its own line. Not judgeable below " + s + " trades."; },
  issueDitFr: function(n, s){ return "Les ombres ci-dessus sont jugees a 4 h fixes. Les trades sortent a leur stop, leur cible ou a l'echeance de 12 h : voici ce qu'ils ont vraiment rendu, aux frais reels, sur une ligne a part. Pas jugeable sous " + s + " trades."; },
  sortie: ["Exit", "Sortie"], moyenne: ["Mean", "Moyenne"],
  sortieNoms: function(k){ return ({ stop: "stop", target: "target", time: "clock" })[k] || k; },
  sortieNomsFr: function(k){ return ({ stop: "stop", target: "cible", time: "echeance" })[k] || k; },
  tous: ["All", "Tous"],
  enSigma: ["In σ units", "En unites de σ"],
  auDessus: ["≥ +1σ", "≥ +1σ"],
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
    return "Every refusal is shadowed and judged later against what the colony actually takes (" + ref + "% of them up at least +1.5% after 4 hours, over " + n + " observations). Returns are also read in units of each market's own 4-hour volatility (σ), so a rule that mostly turns away DOGE is not judged on DOGE's size. Below " + PP_MIN + " observations a rule gets no verdict at all: that minimum comes from a power calculation, not a round number.";
  },
  auditSousFr: function(n, ref){
    if(!ref) return "Chaque refus laisse une ombre, jugee plus tard. Rien n'est encore comparable : la colonie a pris trop peu de positions pour avoir une reference.";
    return "Chaque refus laisse une ombre, jugee plus tard contre ce que la colonie prend vraiment (" + ref + " % montent d'au moins +1,5 % a 4 h, sur " + n + " observations). Les rendements se lisent aussi en unites de la volatilite a 4 h de chaque marche (σ), pour qu'une regle qui ecarte surtout du DOGE ne soit pas jugee sur la taille de DOGE. En dessous de " + PP_MIN + " observations, une regle n'a aucun verdict : ce minimum vient d'un calcul de puissance, pas d'un chiffre rond.";
  },
  /* « Winners » valait deux choses : net > 0 pour un trade (36 %), ≥ +1,5 % a 4 h
     pour une ombre de l'audit (10 %). Deux mots, chacun sa definition. */
  regle: ["Rule", "Regle"], obs: ["Obs", "Obs"], part: ["Winners (net > 0)", "Gagnants (net > 0)"],
  partOmbre: ["≥ +1.5% at 4 h", "≥ +1,5 % a 4 h"],
  /* Le verdict se juge en unites de σ : son effectif est celui-la, pas la colonne Obs. */
  vSigmaObs: function(n, m){ return "σ-obs " + n + "/" + m; },
  vSigmaObsFr: function(n, m){ return "obs. en σ " + n + "/" + m; },
  vReference: function(k){ return "reference needs " + k + " more"; },
  vReferenceFr: function(k){ return "la reference attend encore " + k; },
  marchesSeuil: function(k){ return "Green or red only from " + k + " closed trades on a market: below that, it is noise."; },
  marchesSeuilFr: function(k){ return "Vert ou rouge seulement a partir de " + k + " trades fermes sur un marche : en dessous, c'est du bruit."; },
  tours: function(n){ return n + " turns"; },
  toursFr: function(n){ return n + " tours"; },
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
  horizonsFr: function(l, r){ return "Les ombres sont jugees a " + l.join(", ") + " minutes ; " + r + " minutes fait reference."; },
  /* ---- LA REFONTE DU 01/10/2026 ----
   * Quatre blocs de plus, tous lus sur /ai/perp : les marches en tete, la courbe de la
   * tresorerie papier, la position en cours, et le chemin d'une decision — construit avec
   * les agents, la barre et les plafonds que le serveur envoie, pas recopie d'une maquette. */
  faits: [[["Paper money only", "No key, no order, no exchange account. Nothing is ever signed."],
           ["Real prices, real costs", "Public Bitget prices; funding and Bitget's real fees are counted."],
           ["Judged on what happened", "Every refusal is shadowed and scored later against what was taken."]],
          [["Argent papier seulement", "Aucune cle, aucun ordre, aucun compte d'echange. Rien n'est jamais signe."],
           ["Prix reels, couts reels", "Prix publics de Bitget ; le financement et les vrais frais Bitget sont comptes."],
           ["Juge sur ce qui s'est passe", "Chaque refus laisse une ombre, notee plus tard contre ce qui a ete pris."]]],
  tMarchesTete: ["Markets read every turn", "Marches lus a chaque tour"],
  mtFermes: function(n, g){ return n ? n + " closed \u00b7 " + g : "no trade closed yet"; },
  mtFermesFr: function(n, g){ return n ? n + " fermes \u00b7 " + g : "aucun trade ferme"; },
  mtOuvert: function(s, p){ return s + " open \u00b7 now " + p; },
  mtOuvertFr: function(s, p){ return s + " ouvert \u00b7 maintenant " + p; },
  mtRien: ["no position", "aucune position"],
  tCourbe: ["Paper treasury", "Tresorerie papier"],
  courbeSous: ["The paper treasury after each closed trade. An open position counts only once it closes.",
               "La tresorerie papier apres chaque trade ferme. Une position ouverte ne compte qu'une fois fermee."],
  periodes: [["24H", "7D", "All"], ["24 h", "7 j", "Tout"]],
  courbeDit: function(p, n, g, seuil, nTot){ return p + ": " + n + " trade" + (n === 1 ? "" : "s") + " closed \u00b7 " + g + " on paper" + (nTot < seuil ? " \u2014 not judgeable below " + seuil + " trades (" + nTot + " so far)." : "."); },
  courbeDitFr: function(p, n, g, seuil, nTot){ return p + " : " + n + " trade" + (n === 1 ? "" : "s") + " ferme" + (n === 1 ? "" : "s") + " \u00b7 " + g + " sur le papier" + (nTot < seuil ? " \u2014 pas jugeable sous " + seuil + " trades (" + nTot + " a ce jour)." : "."); },
  courbeNoms: function(h){ return h === 24 ? "Last 24 hours" : h === 168 ? "Last 7 days" : "Since the start"; },
  courbeNomsFr: function(h){ return h === 24 ? "24 dernieres heures" : h === 168 ? "7 derniers jours" : "Depuis le debut"; },
  courbeVide: ["No trade closed in this period.", "Aucun trade ferme sur cette periode."],
  tCourante: ["Current position", "Position en cours"],
  couranteAutres: function(k){ return k ? "+ " + k + " more open below" : ""; },
  couranteAutresFr: function(k){ return k ? "+ " + k + " autre(s) ouverte(s) plus bas" : ""; },
  gagnants: ["Wins", "Gagnants"], perdants: ["Losses", "Perdants"], tousMarches: ["All markets", "Tous les marches"],
  filtreDit: function(k, n){ return k + " of " + n + " trades shown"; },
  filtreDitFr: function(k, n){ return k + " trades montres sur " + n; },
  tFlot: ["How the colony decides", "Comment la colonie decide"],
  flotSous: ["One turn, every few minutes, built from the agents and limits the server reports right now.",
             "Un tour, toutes les quelques minutes, construit avec les agents et les limites que le serveur donne en ce moment."],
  flot: function(v, noms){
    return [["Read", "Public Bitget data on " + (v.marches || []).length + " markets: price, funding, order book." + (noms.scout ? " " + noms.scout + " scout(s) first." : "") + (v.tours ? " " + v.tours + " turns so far." : "")],
            ["Guard", (noms.garde || "The guards") + " can refuse a market outright: trading against the deeper trend, a dead market or a storm."],
            ["Score", (noms.specialiste || "The specialists") + " each add their reading; a candidate below " + (v.seuil != null ? "a score of " + v.seuil : "the bar") + " is refused (\u201cscore below the bar\u201d)."],
            ["Limits", (v.positionsMax ? "At most " + v.positionsMax + " positions at once, " : "") + (v.memeSensMax ? v.memeSensMax + " in the same direction, " : "") + "one per market."],
            ["Size", (noms.banque || "The banker") + " stakes a fixed 10% of the paper treasury per position: nothing is learned there until it is measured."],
            ["Exit", (noms.execution || "The closer") + " closes at the stop, the target or the 12-hour clock, at Bitget's real fees."],
            ["Shadow", "Every refusal is followed as if taken and judged later" + ((v.horizons || []).length ? ", at " + v.horizons.join(", ") + " minutes" : "") + ", so each rule can be priced."]];
  },
  flotFr: function(v, noms){
    return [["Lire", "Donnees publiques Bitget sur " + (v.marches || []).length + " marches : prix, financement, carnet." + (noms.scout ? " " + noms.scout + " eclaire(nt) d'abord." : "") + (v.tours ? " " + v.tours + " tours a ce jour." : "")],
            ["Garder", (noms.garde || "Les gardes") + " peuvent refuser un marche d'emblee : contre la tendance profonde, un marche mort ou une tempete."],
            ["Noter", (noms.specialiste || "Les specialistes") + " ajoutent chacun leur lecture ; un candidat sous " + (v.seuil != null ? "le score " + v.seuil : "la barre") + " est refuse (\u00ab score below the bar \u00bb)."],
            ["Limiter", (v.positionsMax ? "Au plus " + v.positionsMax + " positions a la fois, " : "") + (v.memeSensMax ? v.memeSensMax + " dans le meme sens, " : "") + "une par marche."],
            ["Miser", (noms.banque || "Le banquier") + " mise une part fixe de 10 % de la tresorerie papier par position : rien d'appris la tant que rien n'est mesure."],
            ["Sortir", (noms.execution || "Le cloturier") + " ferme au stop, a la cible ou a l'echeance de 12 h, aux vrais frais Bitget."],
            ["Ombre", "Chaque refus est suivi comme s'il avait ete pris et juge plus tard" + ((v.horizons || []).length ? ", a " + v.horizons.join(", ") + " minutes" : "") + ", pour chiffrer chaque regle."]];
  },
  avisFin: ["<b>Paper trading only.</b> Every position on this page is simulated with fake money at real prices. Nothing here is a profit, a promise or investment advice.",
            "<b>Papier seulement.</b> Chaque position de cette page est simulee avec de l'argent fictif au prix reel. Rien ici n'est un gain, une promesse ou un conseil d'investissement."]
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
                   : vieux ? pph("vieux") : ppHeure(v.maj) + " · " + pphF("tours", v.tours));
}

function ppBande(v){
  var p = v.profit;
  $$("ppProfit").textContent = ppSigne(p);
  $$("ppProfit").className = p > 0 ? "pp-vert" : p < 0 ? "pp-rouge" : "";
  var ps = $$("ppProfitSur");
  if(ps) ps.textContent = v.depuis ? pphF("profitSur", new Date(v.depuis).toLocaleDateString(PP_LANGUE === "fr" ? "fr-FR" : "en-US", { day:"numeric", month:"short" }), v.trades || 0) : "";
  $$("ppTresor").textContent = ppArgent(v.tresor);
  /* Le taux de gain n'a de sens qu'au-dela d'une poignee de trades : en
     dessous, il n'est pas affiche du tout. Quinze trades a 60 %, c'est neuf
     trades — on ne conclut pas la-dessus. */
  /* Le taux porte sur `bilan.n` trades, pas sur `trades` : 27/09, un taux
     calcule sur les 200 derniers s'affichait « on 300 » avec l'intervalle
     des 300. Un serveur sans bilan (d'avant) le calculait sur le carnet,
     200 lignes au plus : on ne lui prete pas plus. */
  var bi = v.bilan || null;
  var nT = bi ? (bi.n || 0) : Math.min(v.trades || 0, 200);
  var recents = bi ? (bi.manquants > 0) : ((v.trades || 0) > 200);
  var assez = nT >= 20;
  $$("ppTaux").textContent = (assez && v.partGagnantes != null) ? v.partGagnantes + "%" : "—";
  /* L'intervalle de Wilson a cote du taux : 32 % sur 47 trades, c'est
     « quelque part entre 20 et 46 % » — et la page le dit. Meme source que
     le taux (le bilan), donc toujours le sien. */
  var w = bi && bi.wilson ? bi.wilson : null;
  var lo = w ? Math.round(w[0]) : null, hi = w ? Math.round(w[1]) : null;
  $$("ppTauxSur").textContent = nT ? (assez ? (recents ? pphF("tauxSurRecents", nT, lo, hi) : pphF("tauxSur", nT, lo, hi))
                                            : pph("encore", 20 - nT)) : "";
  /* ---- LE NET PAR TRADE, AUX FRAIS REELS, AVEC SON ERREUR-TYPE ----
   * Sous `seuil` trades (143 : ce qu'il faut pour voir +0,30 % par trade a
   * 80 %), le chiffre s'affiche mais la case dit qu'il n'est pas jugeable. */
  var net = $$("ppNet"), netSur = $$("ppNetSur");
  if(net){
    if(bi && bi.n && bi.netReel != null){
      /* « ± 0,09 » etait l'erreur-type, lue comme un intervalle. L'intervalle a
         95 % (± 1,96 erreur-type) est ecrit en clair a cote. */
      net.textContent = ppPct(bi.netReel);
      net.className = bi.jugeable ? (bi.netReel - 1.96 * (bi.seReel || 0) > 0 ? "pp-vert" : bi.netReel + 1.96 * (bi.seReel || 0) < 0 ? "pp-rouge" : "") : "";
      var ci = bi.seReel != null ? pphF("ciNet", ppPct(bi.netReel - 1.96 * bi.seReel), ppPct(bi.netReel + 1.96 * bi.seReel)) + " \u00b7 " : "";
      netSur.textContent = ci + (bi.jugeable ? pphF("jugeableSur", bi.n, bi.jours) : pphF("pasJugeable", bi.n, bi.seuil));
    } else { net.textContent = "—"; net.className = ""; netSur.textContent = ""; }
  }
  $$("ppTrades").textContent = v.trades || 0;
  /* Le meilleur ET le pire, aux frais reels, lus dans le carnet — quand il porte
     tous les trades ; sinon le seul chiffre du serveur (papier), sans pire invente. */
  var rr = (v.carnet || []).map(function(t){ return typeof t.rReel === "number" ? t.rReel : null; }).filter(function(x){ return x != null; });
  var mSur = $$("ppMeilleurSur");
  if(rr.length && rr.length >= (v.trades || 0)){
    $$("ppMeilleur").textContent = ppPct(Math.max.apply(null, rr)) + " / " + ppPct(Math.min.apply(null, rr));
    if(mSur) mSur.textContent = pphF("extremesSur", rr.length);
  } else {
    $$("ppMeilleur").textContent = (typeof v.meilleur === "number" && v.meilleur) ? ppPct(v.meilleur) : "—";
    if(mSur) mSur.textContent = "";
  }
  /* « 2 » ne dit pas si la colonie est pleine ou si elle a de la place. Le
     plafond existe parce que la mise est une part de la tresorerie : trois
     positions font trois dixiemes d exposition. */
  $$("ppOuvertes").textContent = v.positions.length + (v.positionsMax ? " / " + v.positionsMax : "");
  var f = v.financement || { n:0, total:0 };
  $$("ppFin").textContent = f.n ? ppPct(f.total, 2) : "—";
  $$("ppFin").className = f.total < 0 ? "pp-rouge" : f.total > 0 ? "pp-vert" : "";
  $$("ppFinSur").textContent = pphF("finSur", f.n, f.total);
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
  var cs = $$("ppCarnetSous");
  if(cs) cs.textContent = v.carnet.length ? pphF("carnetSous", v.carnet.length, v.trades || v.carnet.length) : "";
  if(!v.carnet.length){ c.innerHTML = '<div class="pp-vide">' + ppEch(pph("carnetVide")) + "</div>"; return; }
  var h = '<table class="pp-tab"><tr><th>' + ppEch(pph("marche")) + "</th><th>" + ppEch(pph("sens"))
        + "</th><th>" + ppEch(pph("entree"))
        + "</th><th>" + ppEch(pph("brut")) + "</th><th>" + ppEch(pph("fin")) + "</th><th>"
        + ppEch(pph("net")) + "</th><th>" + ppEch(pph("fraisReels")) + "</th><th>" + ppEch(pph("duree")) + "</th><th>" + ppEch(pph("pourquoi")) + "</th></tr>";
  /* Le carnet ENTIER : le serveur le sert en entier depuis le 27/09/2026. */
  v.carnet.forEach(function(t){
    h += "<tr data-m='" + ppEch(ppNom(t.sym)) + "' data-r='" + (t.r > 0 ? "g" : t.r < 0 ? "p" : "0") + "'><td><b>" + ppEch(ppNom(t.sym)) + "</b></td>"
       + "<td><span class='pp-sens " + (t.sens > 0 ? "long'>LONG" : "short'>SHORT") + "</span></td>"
       + "<td class='num'>" + ppPrix(t.prix0) + "</td>"
       + "<td class='num'>" + ppPct(t.brut) + "</td>"
       /* Le financement est montre A PART du mouvement du prix : c'est la
          ligne qu'on regarde quand le papier a l'air bon et que le net ne
          suit pas. */
       + "<td class='num " + (t.financement < 0 ? "pp-rouge" : "") + "'>" + ppPct(t.financement) + "</td>"
       + "<td class='num " + (t.r > 0 ? "pp-vert" : t.r < 0 ? "pp-rouge" : "") + "'>" + ppPct(t.r) + "</td>"
       + "<td class='num " + (t.rReel > 0 ? "pp-vert" : t.rReel < 0 ? "pp-rouge" : "") + "'>" + (typeof t.rReel === "number" ? ppPct(t.rReel) : "—") + "</td>"
       + "<td class='num'>" + ppDuree(t.minutes) + "</td>"
       + "<td>" + ppEch(pphF("sortieNoms", t.pourquoi)) + "</td></tr>";
  });
  c.innerHTML = h + "</table>";
  ppFiltreMarches(v);
  ppFiltre();
}

/* ---- LES FILTRES DU CARNET (01/10) ----
 * Gagnants, perdants (net comptabilise), et un marche. Rien n'est recalcule : les lignes
 * ne font que se cacher, et la page dit combien elle en montre sur combien. */
var PP_FILTRE = { r: "", m: "" };
function ppFiltreMarches(v){
  var s = $$("ppFiltreM"); if(!s) return;
  var vus = {}, l = [];
  (v.marches || []).concat((v.carnet || []).map(function(t){ return t.sym; })).forEach(function(x){ var n = ppNom(x); if(n && !vus[n]){ vus[n] = 1; l.push(n); } });
  var garde = PP_FILTRE.m;
  s.innerHTML = '<option value="">' + ppEch(pph("tousMarches")) + "</option>" + l.map(function(n){ return '<option value="' + ppEch(n) + '">' + ppEch(n) + "</option>"; }).join("");
  s.value = l.indexOf(garde) >= 0 ? garde : "";
  PP_FILTRE.m = s.value;
}
function ppFiltre(){
  var lignes = document.querySelectorAll("#ppCarnet tr[data-m]"), k = 0;
  [].forEach.call(lignes, function(tr){
    var vu = (!PP_FILTRE.m || tr.getAttribute("data-m") === PP_FILTRE.m) && (!PP_FILTRE.r || tr.getAttribute("data-r") === PP_FILTRE.r);
    tr.hidden = !vu; if(vu) k++;
  });
  var d = $$("ppFiltreDit"); if(d) d.textContent = lignes.length ? pphF("filtreDit", k, lignes.length) : "";
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
        + "</th><th>" + ppEch(pph("partOmbre")) + "</th><th>" + ppEch(pph("verdict")) + "</th><th>"
        + ppEch(pph("enSigma")) + "</th><th>" + ppEch(pph("auDessus")) + "</th></tr>";
  lignes.forEach(function(l){
    var w = parCle[l.cle] || { verdict:"unknown" };
    /* « protege » veut dire : ce qu'on a refuse a MOINS bien marche que ce
       qu'on prend. « coute » veut dire l'inverse, et c'est la ligne qu'on
       vient chercher. En dessous de l'echantillon, aucun des deux. */
    var cls = w.verdict === "protects" ? "bon" : w.verdict === "costs" ? "mauvais" : "attente";
    var mot = w.verdict === "protects" ? pph("vProtege")
            : w.verdict === "costs" ? pph("vCoute")
            : w.verdict === "same" ? pph("vPareil")
            : pph("vAttente") + (w.minObs ? " · " + pphF("vSigmaObs", w.n || 0, w.minObs)
                                 : w.manqueReference ? " · " + pphF("vReference", w.manqueReference)
                                 : w.manque ? " · " + pphF("vManque", w.manque) : "");
    /* ---- EN UNITES DE σ, AVEC LEUR EFFECTIF ----
     * La moyenne ± erreur-type et la part a ≥ +1 σ (Wilson) portent leur
     * propre n : les anciennes ombres n ont pas de σ, et « 0 » ne doit pas
     * se lire comme « rien ne monte ». */
    var sg = l.sigma || null;
    var cSig = (sg && sg.n) ? (sg.moyenne >= 0 ? "+" : "") + sg.moyenne.toFixed(2) + "σ" + (sg.se != null ? " ± " + sg.se.toFixed(2) : "")
                              + " <i class='pp-n'>" + sg.n + "</i>" : "—";
    var cDes = (sg && sg.n) ? sg.part + "%" + (sg.wilson ? "<span class='pp-ic'>" + sg.wilson[0] + "–" + sg.wilson[1] + "%</span>" : "") : "—";
    h += "<tr><td>" + ppEch(l.cle) + "</td><td class='num'>" + l.n + "</td><td class='num'>"
       + l.partGagnantes + "%</td><td><span class='pp-verdict " + cls + "'>" + ppEch(mot) + "</span></td>"
       + "<td class='num'>" + cSig + "</td><td class='num'>" + cDes + "</td></tr>";
  });
  c.innerHTML = h + "</table>";
}

/* ---- CE QUE PRENDRE A VRAIMENT RAPPORTE ----
 * L audit juge les ombres a 4 h fixes ; les trades, eux, sortent au stop, a
 * la cible ou a 12 h. Leur issue reelle, aux frais reels, est une ligne A
 * PART, avec son effectif, son erreur-type et le seuil ou elle devient
 * jugeable. Rien ne s y melange a la reference des ombres. */
function ppIssue(v){
  var c = $$("ppIssue"); if(!c) return;
  var b = v.bilan;
  if(!b || !b.n){ c.innerHTML = '<div class="pp-vide">' + ppEch(pph("carnetVide")) + "</div>"; return; }
  var cel = function(n, m, se){
    return "<td class='num'>" + n + "</td><td class='num " + (m > 0 ? "pp-vert" : m < 0 ? "pp-rouge" : "") + "'>"
      + ppPct(m) + (se != null ? " ± " + se.toFixed(2) : "") + "</td>";
  };
  var h = '<p class="sur">' + ppEch(pphF("issueDit", b.n, b.seuil)) + "</p>"
        + '<table class="pp-tab"><tr><th>' + ppEch(pph("sortie")) + "</th><th>" + ppEch(pph("obs")) + "</th><th>"
        + ppEch(pph("fraisReels")) + "</th></tr>";
  h += "<tr><td><b>" + ppEch(pph("tous")) + "</b> <i class='pp-n'>"
     + ppEch(b.jugeable ? "" : pphF("pasJugeable", b.n, b.seuil)) + "</i></td>" + cel(b.n, b.netReel, b.seReel) + "</tr>";
  Object.keys(b.parSortie || {}).sort().forEach(function(k){
    var o = b.parSortie[k];
    h += "<tr><td>" + ppEch(pphF("sortieNoms", k)) + "</td>" + cel(o.n, o.moyenneReel, null) + "</tr>";
  });
  /* Le miroir : une ligne a part, sa propre date, son propre seuil. Sous le
     seuil, le chiffre s'affiche sans couleur — il n'a encore rien prouve. */
  var mi = v.inverse;
  if(mi && mi.n){
    var d = mi.depuis ? new Date(mi.depuis).toLocaleDateString(PP_LANGUE === "fr" ? "fr-FR" : "en-US", { day:"numeric", month:"short" }) : "";
    var lab = mi.jugeable ? pphF("miroirVerdict", mi.verdict) : pphF("pasJugeable", mi.n, mi.seuil);
    h += "<tr id='ppMiroir'><td><b>" + ppEch(pphF("miroir", d)) + "</b> <i class='pp-n'>" + ppEch(lab) + "</i></td>"
       + "<td class='num'>" + mi.n + "</td><td class='num " + (mi.jugeable ? (mi.net > 0 ? "pp-vert" : mi.net < 0 ? "pp-rouge" : "") : "") + "'>"
       + ppPct(mi.net) + (mi.se != null ? " \u00b1 " + mi.se.toFixed(2) : "") + "</td></tr>";
  }
  c.innerHTML = h + "</table>" + (mi && mi.n ? '<p class="sur">' + ppEch(pphF("miroirDit", mi.seuil)) + "</p>" : "");
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
  /* 28/09/2026 : « Made » etait vert ou rouge sur 11 a 18 trades. Sous le seuil du
     bilan (le meme calcul de puissance), le chiffre reste, la couleur non. */
  var seuilM = (v.bilan && v.bilan.seuil) || 143;
  var ms = $$("ppMarchesSous"); if(ms) ms.textContent = pph("marchesSous") + " " + pphF("marchesSeuil", seuilM);
  var h = '<table class="pp-tab"><tr><th>' + ppEch(pph("marche")) + "</th><th>" + ppEch(pph("fermes"))
        + "</th><th>" + ppEch(pph("part")) + "</th><th>" + ppEch(pph("rapporte")) + "</th><th>"
        + ppEch(pph("fin")) + "</th><th>" + ppEch(pph("appris")) + "</th></tr>";
  l.forEach(function(m){
    /* Aucun trade ferme : des tirets, jamais des zeros. « 0 % de gagnantes »
       se lit comme un marche qui perd tout ; ici on n a rien vu du tout. */
    h += "<tr><td><b>" + ppEch(m.nom) + "</b></td>"
       + "<td class='num'>" + (m.n || "—") + "</td>"
       + "<td class='num'>" + (m.n ? m.partGagnantes + "%" : "—") + "</td>"
       + "<td class='num " + (m.n < seuilM ? "" : m.gain > 0 ? "pp-vert" : m.gain < 0 ? "pp-rouge" : "") + "'>"
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

/* ---- LES MARCHES EN TETE (01/10) ----
 * Un marche par puce : ses trades fermes et ce qu'ils ont rendu (lus dans parMarche), et
 * la position ouverte s'il y en a une, au dernier prix lu par le serveur. */
function ppMarchesTete(v){
  var c = $$("ppMarchesTete"); if(!c) return;
  var par = {}; (v.parMarche || []).forEach(function(m){ par[m.sym] = m; });
  var pos = {}; (v.positions || []).forEach(function(p){ pos[p.sym] = p; });
  c.innerHTML = (v.marches || []).map(function(sym){
    var m = par[sym] || {}, p = pos[sym];
    return '<div class="pp-mt"><b>' + ppEch(ppNom(sym)) + "</b><span>" + ppEch(pphF("mtFermes", m.n || 0, m.n ? ppSigne(m.gain) : "")) + "</span>"
      + (p ? '<span class="pp-sens ' + (p.sens > 0 ? 'long">' : 'short">') + ppEch(pphF("mtOuvert", p.sens > 0 ? "LONG" : "SHORT", p.prix == null ? "\u2014" : ppPrix(p.prix))) + "</span>"
           : '<span class="pp-mt-rien">' + ppEch(pph("mtRien")) + "</span>") + "</div>";
  }).join("");
}

/* ---- LA COURBE DE LA TRESORERIE PAPIER (01/10) ----
 * Depart : la tresorerie moins tout ce que le carnet montre (vrai que le carnet porte
 * tous les trades ou seulement les 200 derniers). Un point par trade ferme, dans l'ordre. */
var PP_PERIODE = 0;
function ppCourbe(v){
  var g = $$("ppCourbe"), dit = $$("ppCourbeDit"); if(!g) return;
  g.textContent = ""; if(dit) dit.textContent = "";
  var l = (v.carnet || []).filter(function(t){ return typeof t.gain === "number" && t.t; }).slice().sort(function(a, b){ return a.t - b.t; });
  var somme = 0; l.forEach(function(t){ somme += t.gain; });
  var niveau = (typeof v.tresor === "number" ? v.tresor : (v.depart || 0)) - somme, pts = [];
  var depuis = PP_PERIODE ? Date.now() - PP_PERIODE * 3600000 : 0, n = 0, gain = 0;
  l.forEach(function(t){
    if(t.t >= depuis){ if(!pts.length) pts.push({ t: Math.max(depuis, t.ouvert || t.t), y: niveau }); n++; gain += t.gain; }
    niveau += t.gain;
    if(t.t >= depuis) pts.push({ t: t.t, y: niveau });
  });
  var seuil = (v.bilan && v.bilan.seuil) || 143, nTot = (v.bilan && v.bilan.n) || v.trades || 0;
  if(!n){ g.innerHTML = '<div class="vide">' + ppEch(pph("courbeVide")) + "</div>"; return; }
  if(dit) dit.textContent = pphF("courbeDit", pphF("courbeNoms", PP_PERIODE), n, ppSigne(gain), seuil, nTot);
  var W = Math.max(280, Math.min(900, (g.clientWidth || 600) - 22)), H = W < 480 ? 190 : 220, G = 72, D = 12, Hh = 12, B = 24;
  var ys = pts.map(function(p){ return p.y; }), lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
  var m = Math.max((hi - lo) * 0.12, 1); lo -= m; hi += m;
  var t0 = pts[0].t, t1 = pts[pts.length - 1].t; if(t1 === t0){ t0 -= 1800000; t1 += 1800000; }
  var X = function(t){ return G + (t - t0) / (t1 - t0) * (W - G - D); }, Y = function(y){ return Hh + (hi - y) / (hi - lo) * (H - Hh - B); };
  var h = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + ppEch(pph("tCourbe")) + '">';
  for(var i = 0; i <= 4; i++){ var y = lo + (hi - lo) * i / 4;
    h += '<line x1="' + G + '" x2="' + (W - D) + '" y1="' + Y(y).toFixed(1) + '" y2="' + Y(y).toFixed(1) + '" stroke="#E6EBF2"/>'
       + '<text x="' + (G - 6) + '" y="' + (Y(y) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#5B6B86">' + ppEch(ppArgent(y)) + "</text>"; }
  var dep = v.depart || 1000;
  if(dep > lo && dep < hi) h += '<line x1="' + G + '" x2="' + (W - D) + '" y1="' + Y(dep).toFixed(1) + '" y2="' + Y(dep).toFixed(1) + '" stroke="#9AA6BA" stroke-dasharray="4 4"/>';
  [t0, t1].forEach(function(t, j){ var d = new Date(t);
    h += '<text x="' + X(t).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (j ? "end" : "start") + '" font-size="11" fill="#5B6B86">'
       + ppEch(d.toISOString().slice(5, 10) + " " + d.toISOString().slice(11, 16) + (j ? " UTC" : "")) + "</text>"; });
  var dPath = pts.map(function(p, j){ return (j ? "L" : "M") + X(p.t).toFixed(1) + " " + Y(p.y).toFixed(1); }).join(" ");
  var fin = pts[pts.length - 1], coul = fin.y >= pts[0].y ? "#0E8A4F" : "#C8322B";
  h += '<path d="' + dPath + ' L' + X(fin.t).toFixed(1) + " " + (H - B) + " L" + X(pts[0].t).toFixed(1) + " " + (H - B) + ' Z" fill="' + coul + '" opacity=".07"/>'
     + '<path d="' + dPath + '" fill="none" stroke="#1652F0" stroke-width="2.4" stroke-linejoin="round"/>'
     + '<circle cx="' + X(fin.t).toFixed(1) + '" cy="' + Y(fin.y).toFixed(1) + '" r="4" fill="#1652F0"/></svg>';
  g.innerHTML = h;
}

/* ---- LA POSITION EN COURS (01/10) ----
 * La plus recente des positions ouvertes, et ou en est son prix entre le stop et la cible.
 * Les autres restent dans le tableau « Open positions ». */
function ppCourante(v){
  var c = $$("ppCourante"); if(!c) return;
  var l = (v.positions || []).slice().sort(function(a, b){ return (b.depuis || 0) - (a.depuis || 0); });
  if(!l.length){ c.innerHTML = '<div class="pp-vide">' + ppEch(pph("posVide")) + "</div>"; return; }
  var p = l[0], cls = p.net > 0 ? "pp-vert" : p.net < 0 ? "pp-rouge" : "";
  var bas = Math.min(p.stop, p.cible), haut = Math.max(p.stop, p.cible), x = p.prix == null ? null : Math.max(0, Math.min(1, (p.prix - bas) / ((haut - bas) || 1)));
  var ligne = function(k, val){ return "<dt>" + ppEch(pph(k)) + "</dt><dd>" + val + "</dd>"; };
  c.innerHTML = '<div class="pp-cour-t"><b>' + ppEch(p.nom || ppNom(p.sym)) + '</b><span class="pp-sens ' + (p.sens > 0 ? 'long">LONG' : 'short">SHORT') + "</span>"
    + '<span class="pp-cour-g ' + cls + '">' + (p.net == null ? "\u2014" : ppEch(ppSigne(p.gain)) + " <i>" + ppEch(ppPct(p.net)) + "</i>") + "</span></div>"
    + "<dl>" + ligne("entree", ppEch(ppPrix(p.prix0))) + ligne("maintenant", "<b>" + (p.prix == null ? "\u2014" : ppEch(ppPrix(p.prix))) + "</b>")
    + ligne("stop", ppEch(ppPrix(p.stop))) + ligne("cible", ppEch(ppPrix(p.cible))) + ligne("mise", ppEch(ppArgent(p.mise)))
    + ligne("depuis", ppEch(ppDuree((Date.now() - p.depuis) / 60000))) + "</dl>"
    + (x == null ? "" : '<div class="pp-cour-barre"><span class="s">' + ppEch(p.stop < p.cible ? pph("stop") : pph("cible")) + '</span><div><i style="left:' + (x * 100).toFixed(1) + '%"></i></div><span class="c">'
       + ppEch(p.stop < p.cible ? pph("cible") : pph("stop")) + "</span></div>")
    + '<p class="sur">' + ppEch(pphF("couranteAutres", l.length - 1)) + "</p>";
}

/* ---- LE CHEMIN D'UNE DECISION (01/10) ----
 * Les noms viennent de v.agents (par role), la barre de v.seuil, les plafonds de
 * v.positionsMax / v.memeSensMax, les horizons de v.horizons. */
function ppFlot(v){
  var c = $$("ppFlot"); if(!c) return;
  var noms = {};
  (v.agents || []).forEach(function(a){ noms[a.role] = (noms[a.role] ? noms[a.role] + ", " : "") + a.nom; });
  var etapes = (PP_LANGUE === "fr" ? PP_PHRASES.flotFr : PP_PHRASES.flot)(v, noms);
  c.innerHTML = etapes.map(function(e){ return "<li><b>" + ppEch(e[0]) + "</b>" + ppEch(e[1]) + "</li>"; }).join("");
}

function ppPeint(v){
  PP_MIN = v.minObs || PP_MIN;
  PP_PROFIL = v.profilMinObs || PP_PROFIL;

  ppTete(v); ppBande(v); ppPositions(v); ppCarnet(v); ppAgents(v); ppAudit(v); ppIssue(v); ppParMarche(v); ppFlux(v);
  ppMarchesTete(v); ppCourbe(v); ppCourante(v); ppFlot(v);
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
   ["ppLMeilleur","meilleur"],["ppLOuvertes","ouvertes"],["ppLFin","financement"],["ppLNet","netTrade"],["ppTIssue","issue"],
   ["ppTPos","positions"],["ppTCarnet","carnet"],["ppTAgents","agents"],
   ["ppTAudit","audit"],["ppTMarches","marches"],["ppTSoupape","soupape"],["ppTFlux","journal"]].forEach(function(p){
    var e = $$(p[0]); if(e) e.textContent = pph(p[1]);
  });
  $$("ppAgentsSous").textContent = pph("agentsSous");
  $$("ppMarchesSous").textContent = pph("marchesSous");
  $$("ppAppris").textContent = pphF("apprisDit", PP_PROFIL);
  $$("ppUne").textContent = pph("une");
  /* La refonte (01/10) : les textes fixes des nouveaux blocs. */
  var f = PP_PHRASES.faits[PP_LANGUE === "fr" ? 1 : 0];
  [0, 1, 2].forEach(function(i){ var e = $$("ppFait" + i); if(e){ e.querySelector("b").textContent = f[i][0]; e.querySelector("span").textContent = f[i][1]; } });
  [["ppTMarchesTete","tMarchesTete"],["ppTCourbe","tCourbe"],["ppCourbeSous","courbeSous"],["ppTCourante","tCourante"],["ppTFlot","tFlot"],["ppFlotSous","flotSous"]].forEach(function(p){
    var e = $$(p[0]); if(e) e.textContent = pph(p[1]);
  });
  var per = PP_PHRASES.periodes[PP_LANGUE === "fr" ? 1 : 0];
  [].forEach.call(document.querySelectorAll("#ppPeriodes button"), function(b, i){ b.textContent = per[i]; });
  [["ppFTous","tous"],["ppFGagnants","gagnants"],["ppFPerdants","perdants"]].forEach(function(p){ var e = $$(p[0]); if(e) e.textContent = pph(p[1]); });
  var af = $$("ppAvisFin"); if(af) af.innerHTML = pph("avisFin");
}

document.addEventListener("DOMContentLoaded", function(){
  ppStatique();
  $$("ppSym").textContent = PP_MARCHES.map(ppNom).join(" · ") || "PERPETUAL";
  $$("ppLangue").addEventListener("click", ppLangue);
  /* La refonte (01/10) : periodes de la courbe, filtres du carnet, redessin a la largeur. */
  [].forEach.call(document.querySelectorAll("#ppPeriodes button"), function(b){
    b.addEventListener("click", function(){
      PP_PERIODE = Number(b.getAttribute("data-h")) || 0;
      [].forEach.call(document.querySelectorAll("#ppPeriodes button"), function(x){ x.setAttribute("aria-pressed", String(x === b)); });
      if(PP_DERNIERE) ppCourbe(PP_DERNIERE);
    });
  });
  [].forEach.call(document.querySelectorAll("#ppFiltreR button"), function(b){
    b.addEventListener("click", function(){
      PP_FILTRE.r = b.getAttribute("data-r") || "";
      [].forEach.call(document.querySelectorAll("#ppFiltreR button"), function(x){ x.setAttribute("aria-pressed", String(x === b)); });
      ppFiltre();
    });
  });
  var fm = $$("ppFiltreM"); if(fm) fm.addEventListener("change", function(){ PP_FILTRE.m = fm.value; ppFiltre(); });
  var largeur = window.innerWidth, minu = null;
  window.addEventListener("resize", function(){ if(window.innerWidth === largeur) return; largeur = window.innerWidth; clearTimeout(minu); minu = setTimeout(function(){ if(PP_DERNIERE) ppCourbe(PP_DERNIERE); }, 200); });
  ppDemande();
  setInterval(function(){ ppDemande(); }, 30000);
});
