/* ==========================================================================
 * SWOGE AI — LE TERMINAL DE LA COLONIE (peintre)
 *
 * Demande du 27 septembre 2026 : un « AI Trading Colony Terminal » au-dessus
 * de la console d'origine, SANS rien inventer — ni trade, ni profit, ni taux,
 * ni agent, ni statut d'API, ni evenement de chaine.
 *
 * Ce fichier ne fait AUCUN appel reseau. Il lit la vue que la page a deja
 * recue (`VUE`, `RECU`, `ERREUR_RESEAU`, `LANGUE`, declares par le script de
 * la colonie) et repeint sur le signal « swoge:vue ». Ce qui n'est pas dans la
 * vue s'ecrit « N/A » ; ce qui est trop maigre pour conclure le dit, avec son
 * nombre d'observations (meme regle que BANCS_ASSEZ / REEL_ASSEZ de la page).
 *
 * Les rares calculs faits ici sont des LECTURES de la vue, jamais des
 * estimations : un rapport (gains / trades), une somme de lignes du carnet sur
 * une fenetre, le plus grand recul de la courbe servie. Chacun dit sur quoi il
 * porte.
 * ======================================================================== */
(function(){
  "use strict";
  if(!document.getElementById("tm")) return;

  /* ---- CE QU'ON LIT DE LA PAGE ---- */
  function G(){
    const o = { v:null, recu:0, err:null, fr:false };
    try{ o.v = VUE; }catch(e){}
    try{ o.recu = RECU; }catch(e){}
    try{ o.err = ERREUR_RESEAU; }catch(e){}
    try{ o.fr = LANGUE === "fr"; }catch(e){}
    return o;
  }
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const num = x => (typeof x === "number" && isFinite(x)) ? x : null;

  /* Les seuils sous lesquels on refuse de conclure. */
  const WIN_ASSEZ = 20;        /* un taux de gain sur moins de 20 trades est de la chance */
  const REEL_ASSEZ = 5;        /* comme la carte « What a mirror actually got » */
  const SECOND_ASSEZ = 40;     /* comme AUDIT7_ASSEZ : une part de montees sous 40 jetons est du bruit */
  const LECON_ASSEZ = 10;      /* une lecon sur moins de 10 observations ne se lit pas */
  const BANCS_ASSEZ = 100;     /* comme la carte des jeux de regles */
  const VIVANT_MS = 15 * 60e3; /* comme la pastille LIVE de la page */

  /* ==================== LES PHRASES, EN DEUX LANGUES ====================
   * [anglais, francais]. Le texte statique du HTML (attribut data-tt) est
   * releve une fois en anglais ; seule sa traduction vit ici. */
  const P = {
    badgePapier:[null,"PAPIER"], kicker:[null,"LA COLONIE DE TRADING AUTONOME"],
    devise:[null,"Des agents IA découvrent. Ils se contredisent. La colonie apprend."],
    entrer:[null,"ENTRER DANS LA COLONIE"], voirPreuve:[null,"VOIR LES PREUVES"],
    papier:[null,"<b>PAPER TRADING — Aucune transaction réelle n'est signée par cette interface.</b> Les trades de la colonie ci-dessous sont du papier, aux prix réels. L'argent réel ne bouge que sur un portefeuille miroir que vous créez et alimentez vous-même (marqué LIVE)."],
    sScan:[null,"Jetons scannés"], sSignaux:[null,"Signaux générés"], sTrades:[null,"Trades papier"],
    sAgents:[null,"Agents actifs"], sWin:[null,"Taux de gain"], sPnl:[null,"P&amp;L papier"],
    chargement:[null,"Chargement…"], tFil:[null,"Activité de la colonie en direct"], tSante:[null,"Santé de la colonie"],
    tColonie:[null,"La colonie"], sColonie:[null,"Chaque agent, ce qu'il fait maintenant et ce qu'il a décidé. Les paquets ne bougent que quand le serveur rapporte un vrai événement."],
    tConsole:[null,"Console de la colonie"], sConsole:[null,"La vue d'origine : le village, les positions de papier et tous les panneaux de mesure. Votre miroir est en haut de la page."],
    tMarche:[null,"Scanner de marché"], cherche:[null,"Chercher un jeton ou une adresse"],
    fTout:[null,"Tout"], fAchat:[null,"Achat"], fVeille:[null,"Surveillé"], fRefus:[null,"Refusé"], fRisque:[null,"Risque élevé"], fNeuf:[null,"Nouveaux"],
    choisis:[null,"Choisissez un jeton dans le tableau pour voir comment la colonie l'a jugé."],
    tTrades:[null,"Terminal des trades"], tEquite:[null,"Courbe de trésorerie"], tOuvertes:[null,"Positions ouvertes"],
    tLive:[null,"Live · portefeuilles miroirs"], tFermees:[null,"Trades fermés"], tBacktest:[null,"Backtest"],
    sBacktest:[null,"Les trades papier fermés de la colonie sur une fenêtre — rien ici n'est une simulation."],
    tSecond:[null,"Chaque jeton a droit à un second regard"], sSecond:[null,"Acheté ou refusé, chaque jeton est suivi jusqu'à son échéance et réévalué."],
    tApprend:[null,"Ce que la colonie apprend"], tEvts:[null,"Événements d'apprentissage"],
    tPreuve:[null,"Preuves"], sPreuve:[null,"Tout ce que le serveur a gardé, le plus récent d'abord. Chaque jeton mène à sa paire sur DexScreener."],
    tInfra:[null,"Infrastructure de données"], sInfra:[null,"Chaque source lue par la colonie, avec son vrai taux de réussite depuis le dernier redémarrage."],
    tComment:[null,"Comment ça marche"],
    tMiroirT:[null,"Votre miroir"], sMiroirT:[null,"De l'argent réel, sur un portefeuille miroir que vous créez et alimentez vous-même : la colonie y achète et y vend au même moment que sur son papier."],
    voirTout:(n)=>["Show all ("+n+")","Tout voir ("+n+")"], voirMoins:["Show less","Voir moins"],
    infraToutVa:(n)=>["All "+n+" sources in use are healthy.","Les "+n+" sources utilisées sont en forme."],
    details:["Details","Détails"],
    e1:[null,"<b>Découvrir</b>Le Scout balaie les nouvelles piscines, les profils frais, les boosts et les launchpads de Robinhood Chain."],
    e2:[null,"<b>Filtrer</b>Des planchers de liquidité, de capitalisation, d'âge et de mouvement écartent ce qui ne se trade pas."],
    e3:[null,"<b>Se contredire</b>Le Warden lit le contrat, Whale-Watch les détenteurs, Whisper les trades un par un. Chacun peut opposer un veto."],
    e4:[null,"<b>Noter</b>L'Oracle note ce qui a survécu avec ce qu'il a mesuré, et décide."],
    e5:[null,"<b>Tester la sortie</b>Le Cobaye simule la vente sur la chaîne avant tout achat, sans rien signer."],
    e6:[null,"<b>Trader sur papier</b>Le Banquier dose la mise, le Closer ouvre et ferme aux prix réels. Les miroirs peuvent suivre pour de vrai."],
    e7:[null,"<b>Apprendre</b>Chaque jeton, acheté ou refusé, est réévalué à son échéance. Les agents mettent à jour ce qu'ils croient."],

    /* le texte peint */
    etatCo:["CONNECTING…","CONNEXION…"], etatOn:["COLONY ONLINE","COLONIE EN LIGNE"], etatPause:["PAUSED","EN PAUSE"],
    etatVieux:["STALE","PÉRIMÉE"], etatOff:["OFFLINE","HORS LIGNE"],
    na:["N/A","N/D"], rienLu:["Waiting for the server…","En attente du serveur…"],
    horsLigne:(e)=>["The server did not answer ("+e+"). Nothing is shown in its place.","Le serveur n'a pas répondu ("+e+"). Rien n'est affiché à la place."],
    scanS:(d)=>["token readings since "+d,"lectures de jetons depuis le "+d],
    sigS:["cleared every guard","ont passé toutes les gardes"],
    trS:(o,n)=>[o+" open · "+n+" opened",o+" ouverte(s) · "+n+" ouvertes au total"],
    agS:(n)=>[n ? n+" born from the colony" : "none born yet", n ? n+" né(s) de la colonie" : "aucun né pour l'instant"],
    winS:(n)=>["on "+n+" closed trades","sur "+n+" trades fermés"],
    winPeu:(n)=>["needs "+WIN_ASSEZ+" closed trades ("+n+" so far)","il faut "+WIN_ASSEZ+" trades fermés ("+n+" pour l'instant)"],
    pnlS:(r,d)=>[r+" on the $"+d+" start",r+" sur le départ à $"+d],
    ilya:(s)=>[s+" ago","il y a "+s],
    /* statuts */
    ONLINE:["ONLINE","EN LIGNE"], ANALYZING:["ANALYZING","ANALYSE"], THINKING:["THINKING","RÉFLÉCHIT"], SIGNAL:["SIGNAL","SIGNAL"],
    EXECUTING:["EXECUTING","EXÉCUTE"], LEARNING:["LEARNING","APPREND"], IDLE:["IDLE","AU REPOS"], OFFLINE:["OFFLINE","HORS LIGNE"],
    lu:(n,r)=>["Read "+n+" token(s) this turn · vetoed "+r,"A lu "+n+" jeton(s) ce tour · veto sur "+r],
    signale:(s,sc)=>["Signalled BUY $"+s+(sc!=null?" (score "+sc+")":""),"A signalé ACHAT $"+s+(sc!=null?" (score "+sc+")":"")],
    ouvert:(s,m)=>["Opened $"+s+" on paper, stake $"+m,"A ouvert $"+s+" sur papier, mise $"+m],
    dose:(s,m)=>["Sized $"+s+" at $"+m,"A dosé $"+s+" à $"+m],
    conseils:(n)=>["Gave a view on "+n+" borderline token(s) this turn","A donné un avis sur "+n+" jeton(s) limite(s) ce tour"],
    surveille:(n)=>["Watching "+n+" open position(s)","Surveille "+n+" position(s) ouverte(s)"],
    dernierVeto:(s,r)=>["Last veto: $"+s+" — "+r,"Dernier veto : $"+s+" — "+r],
    decisions:["Decisions","Décisions"], passe:["Pass rate","Taux de passage"], activite:["Last activity","Dernière activité"],
    derniereAction:["Last action","Dernière action"],
    revus:(v,b)=>[v.toLocaleString("en-US")+" reviewed · "+b.toLocaleString("en-US")+" vetoed",v.toLocaleString("fr-FR")+" revus · "+b.toLocaleString("fr-FR")+" veto"],
    croit:(q,n,m)=>["Believes most: « "+q+" » ("+n+" obs, "+m+")","Croit surtout : « "+q+" » ("+n+" obs, "+m+")"],
    apprendEncore:(n)=>["Still learning ("+Math.round(n)+" obs)","Apprend encore ("+Math.round(n)+" obs)"],
    ROLE:{ source:["Discovery","Découverte"], garde:["Guard","Garde"], note:["Scoring","Notation"], conseil:["Advisor","Conseil"],
           veille:["Risk watch","Veille du risque"], prolonge:["Hold extension","Prolongation"], banque:["Sizing","Mise"],
           execution:["Execution","Exécution"], epreuve:["Exit test","Épreuve de sortie"], specialiste:["Specialist","Spécialiste"], suivi:["Monitoring","Suivi"] },
    /* fil */
    fSignal:(a,s)=>[a+" signalled BUY $"+s,a+" signale ACHAT $"+s],
    fVente:(s,r)=>["Closed $"+s+" at "+r,"$"+s+" fermé à "+r],
    fRejet:(a,s)=>[a+" rejected $"+s,a+" refuse $"+s],
    fPasse:(s)=>["$"+s+" cleared every guard","$"+s+" passe toutes les gardes"],
    fAppris:["The colony reorganised itself","La colonie se réorganise"],
    tSIGNAL:["SIGNAL","SIGNAL"], tTRADE:["TRADE","TRADE"], tREJET:["REJECT","REFUS"], tAPPRIS:["LEARN","APPREND"],
    filN:(n)=>[n+" events","événements : "+n],
    /* sante */
    battement:["Heartbeat","Battement"], tourN:(n)=>["turn #"+n,"tour n°"+n], cadence:["Turn cadence","Cadence"],
    depuis:["Running since","Tourne depuis"], sources:["Sources healthy","Sources en forme"],
    enAttente:["Tokens awaiting their deadline","Jetons en attente d'échéance"], alertesT:["Alerts","Alertes"],
    aucuneAlerte:["No alert: the colony asks for nothing.","Aucune alerte : la colonie ne demande rien."],
    pause:["The owner paused the colony.","Le propriétaire a mis la colonie en pause."],
    lectureKo:(e)=>["Last turn could not read the chain: "+e,"Le dernier tour n'a pas pu lire la chaîne : "+e],
    /* marche */
    marS:(n,h,w)=>[n+" tokens examined in the last turn ("+h+") · "+w+" on the watchlist",n+" jetons examinés au dernier tour ("+h+") · "+w+" surveillés"],
    marN:(n,t)=>[n+" / "+t+" shown",n+" / "+t+" affichés"],
    aucunJeton:["No token matches.","Aucun jeton ne correspond."],
    dACHAT:["BUY","ACHAT"], dPASSE:["CLEARED","PASSE"], dVEILLE:["WATCH","SURVEILLÉ"], dREFUS:["REJECT","REFUS"],
    rHAUT:["HIGH","ÉLEVÉ"], rNONLU:["UNREAD","NON LU"], rAUCUN:["NO FLAG","AUCUN"], rNONEVAL:["NOT CHECKED","NON ÉVALUÉ"],
    bLiq:["Liquidity vs buy floor","Liquidité / plancher d'achat"], bMc:["Market cap vs bounds","Capitalisation / bornes"],
    bAge:["Age vs bounds","Âge / bornes"], bMove:["5-min move vs limits","Mouvement 5 min / limites"],
    bTop:["Largest holder share","Part du plus gros détenteur"], bAch:["Distinct buyers","Acheteurs distincts"],
    bScore:["Colony score vs threshold","Score / seuil"], nonLu:["not read","non lu"],
    decisionIA:["AI DECISION","DÉCISION IA"], confiance:["CONFIDENCE","CONFIANCE"], pourquoi:["WHY?","POURQUOI ?"],
    confS:(s)=>["the Oracle's score; it buys at ≥ "+s,"le score de l'Oracle ; il achète à ≥ "+s],
    passeTout:["Cleared every guard.","A passé toutes les gardes."],
    parAgent:(a)=>["Vetoed by "+a+": ","Veto de "+a+" : "],
    epreuveOk:(n)=>["Exit simulated on chain: "+n+" holder(s) could sell.","Sortie simulée sur la chaîne : "+n+" détenteur(s) peuvent vendre."],
    epreuveKo:(r)=>["Exit test: "+r,"Épreuve de sortie : "+r],
    retour:(p)=>["A real round trip would return "+p+"% of the stake.","Un aller-retour réel rendrait "+p+" % de la mise."],
    conseilT:(a)=>["Advisor: "+a,"Conseil : "+a],
    veilleT:(v,n,b)=>["Watchlist verdict: "+v+" · seen "+n+" time(s) · best score "+b,"Verdict de surveillance : "+v+" · vu "+n+" fois · meilleur score "+b],
    voirDex:["View on DexScreener ↗","Voir sur DexScreener ↗"],
    /* trades */
    capInit:["Initial capital","Capital initial"], solde:["Current balance","Solde actuel"], pnl:["P&L","P&L"], rendement:["Return","Rendement"],
    tradesT:["Trades","Trades"], winT:["Win rate","Taux de gain"], ddT:["Max drawdown","Recul max"],
    ddS:(n)=>["on the last "+n+" readings","sur les "+n+" derniers relevés"], ouvertesS:(n)=>[n+" open",n+" ouverte(s)"],
    fermesS:["closed","fermés"], depuisD:(d)=>["since "+d,"depuis le "+d],
    eqS:(n)=>["paper treasury, last "+n+" readings served by the server","trésorerie papier, "+n+" derniers relevés servis par le serveur"],
    pasDeCourbe:["No curve served yet.","Aucune courbe servie pour l'instant."],
    aucuneOuverte:["No open position right now. The colony waits for a token that clears every guard.","Aucune position ouverte. La colonie attend un jeton qui passe toutes les gardes."],
    nonRelu:["not re-read","non relu"],
    fermN:(k,n)=>[k+" kept by the server · "+n+" closed in total",k+" gardés par le serveur · "+n+" fermés au total"],
    aucunFerme:["No closed trade kept yet.","Aucun trade fermé gardé pour l'instant."],
    liveTx:(n,m)=>["Real money: every close on a player's mirror wallet, measured. "+n+" real closes, average "+m+".","Argent réel : chaque fermeture sur le miroir d'un joueur, mesurée. "+n+" fermetures réelles, moyenne "+m+"."],
    liveEcart:(e,n)=>["The paper counts "+e+" pts more than the wallet gets ("+n+" paired closes): that is the real cost of a round trip.","Le papier compte "+e+" pts de plus que ce que touche le portefeuille ("+n+" fermetures appariées) : c'est le vrai coût d'un aller-retour."],
    livePeu:(n)=>["Too few real closes to conclude ("+n+"/"+REEL_ASSEZ+").","Trop peu de fermetures réelles pour conclure ("+n+"/"+REEL_ASSEZ+")."],
    liveEnvois:(e,s)=>["Buys sent to mirrors: "+e+" · followed: "+s,"Achats envoyés aux miroirs : "+e+" · suivis : "+s],
    liveRien:["No real close measured yet.","Aucune fermeture réelle mesurée pour l'instant."],
    liveLien:["Trade with the colony on your own mirror →","Trader avec la colonie sur votre miroir →"],
    btCollecte:(d,j)=>["Collecting historical data… The server's trade record covers "+j+" day(s) so far (oldest kept trade: "+d+").","Collecte de l'historique… Le relevé du serveur couvre "+j+" jour(s) pour l'instant (plus ancien trade gardé : "+d+")."],
    btRien:["Collecting historical data…","Collecte de l'historique…"],
    btTrades:["Closed trades","Trades fermés"], btPnl:["Paper P&L","P&L papier"], btMoy:["Average return","Rendement moyen"],
    btMeilleur:["Best / worst","Meilleur / pire"], btDepart:(d)=>["The colony started with $1,000 of paper on "+d+".","La colonie est partie de 1 000 $ de papier le "+d+"."],
    btBancs:["Exit rules replayed on the same bought tokens","Règles de sortie rejouées sur les mêmes jetons achetés"],
    btEnVigueur:["trading today","en vigueur"], btPeu:(n)=>["too few ("+n+"/"+BANCS_ASSEZ+")","trop peu ("+n+"/"+BANCS_ASSEZ+")"],
    /* second regard */
    q1:["Correct signals","Signaux justes"], q1s:(m,n)=>["of "+n+" bought tokens went +20% by the deadline","sur "+n+" jetons achetés ont fait +20 % à l'échéance"],
    q2:["Missed opportunities","Occasions manquées"], q2s:["rejected, then went +20%","refusés, puis +20 %"],
    q3:["Correct rejections","Refus justes"], q3s:["rejected, then fell −30%","refusés, puis −30 %"],
    q4:["False rejections","Faux refus"], q4s:(n)=>["rules turning away more winners than we buy (≥ "+SECOND_ASSEZ+" tokens each)","règles qui écartent plus de gagnants qu'on n'en achète (≥ "+SECOND_ASSEZ+" jetons chacune)"],
    slN:(j,a)=>[j.toLocaleString("en-US")+" re-priced · "+a.toLocaleString("en-US")+" awaiting deadline",j.toLocaleString("fr-FR")+" réévalués · "+a.toLocaleString("fr-FR")+" en attente"],
    regleS:(n,m,e,moy)=>[n+" followed · "+m+" went up · "+e+" collapsed · avg "+moy,n+" suivis · "+m+" montés · "+e+" effondrés · moy. "+moy],
    vFaux:["FALSE REJECTION","FAUX REFUS"], vJuste:["CORRECT REJECTION","REFUS JUSTE"], vPareil:["NO DIFFERENCE","PAS DE DIFFÉRENCE"],
    vPeu:(n)=>["TOO FEW "+n+"/"+SECOND_ASSEZ,"TROP PEU "+n+"/"+SECOND_ASSEZ], vRef:["REFERENCE · WHAT WE BUY","RÉFÉRENCE · CE QU'ON ACHÈTE"], vRefCourt:["REFERENCE","RÉFÉRENCE"],
    montesP:(p)=>[p+"% went up",p+" % montés"], gagnantesP:(p)=>[p+"% winning trades",p+" % de trades gagnants"], refMarque:(p)=>["gold mark: "+p+"% for what we buy","repère or : "+p+" % pour ce qu'on achète"],
    pasAudit:["No rule has been audited yet: every rejected token needs to reach its deadline first.","Aucune règle auditée pour l'instant : chaque jeton refusé doit d'abord atteindre son échéance."],
    /* apprentissage */
    appN:(n)=>[n+" agents with lessons",n+" agents avec des leçons"],
    obsT:(n)=>[Math.round(n).toLocaleString("en-US")+" observations",Math.round(n).toLocaleString("fr-FR")+" observations"],
    peu:["too few","trop peu"], lectureRatee:["a failed reading","une lecture ratée"],
    bornesT:["Learned bounds","Bornes apprises"], appris:["learned","apprise"], defaut:["default","par défaut"],
    tenueT:["Holding time","Durée de tenue"], tenueS:(m,n)=>["holds "+m+" min, learned on "+Math.round(n)+" trades","tient "+m+" min, apprise sur "+Math.round(n)+" trades"],
    banqueT:["Stake sizing","Dosage de la mise"], banqueS:(m,r,a)=>["method « "+m+" », regime « "+r+" » · "+(a?"learned":"default"),"méthode « "+m+" », régime « "+r+" » · "+(a?"apprise":"par défaut")],
    conseilTT:["The Advisor (an LLM)","Le Conseiller (un LLM)"], conseilS:(m,n,d)=>[m+" · "+n+" views given · "+d,m+" · "+n+" avis rendus · "+d],
    conseilOff:["off: no key on the server","éteint : pas de clé sur le serveur"],
    aucunEvt:["No structural change yet.","Aucun changement de structure pour l'instant."],
    evtN:(n)=>[n+" kept",n+" gardés"],
    /* preuve */
    pSignal:["SIGNAL","SIGNAL"], pTrade:["TRADE","TRADE"], pRefus:["REJECTION","REFUS"], pAppris:["LEARNING","APPRENTISSAGE"],
    pAchat:(sc,m,mc)=>["BUY signal"+(sc!=null?" · score "+sc:"")+(m!=null?" · stake $"+m:"")+(mc?" · cap "+mc:""),"Signal d'ACHAT"+(sc!=null?" · score "+sc:"")+(m!=null?" · mise $"+m:"")+(mc?" · cap "+mc:"")],
    pVente:(r,c)=>["SELL signal at "+r+(c?" · "+c:""),"Signal de VENTE à "+r+(c?" · "+c:"")],
    pFerme:(r,g,h,p)=>["Closed at "+r+" ("+g+") after "+h+" min · "+p,"Fermé à "+r+" ("+g+") après "+h+" min · "+p],
    pVeille:(v)=>["Watched only: "+v,"Seulement surveillé : "+v],
    prN:(n)=>[n+" records",n+" lignes"], aucunePreuve:["Nothing kept for this filter yet.","Rien de gardé pour ce filtre pour l'instant."],
    /* infra */
    infN:(o,t)=>[o+" / "+t+" healthy",o+" / "+t+" en forme"],
    srvS:(p,n,l)=>[p+"% of "+n+" reads · last "+l,p+" % de "+n+" lectures · dernière "+l],
    srvJamais:["not used yet","pas encore utilisée"], jamais:["never","jamais"],
    horsT:["Not usable from the server: ","Inutilisables depuis le serveur : "],
    cgT:(p)=>["plan "+p,"offre "+p],
    page:(a,b)=>[a+" / "+b,a+" / "+b],
  };
  function t(k){
    const e = P[k]; if(!e) return k;
    const f = G().fr ? 1 : 0;
    if(typeof e === "function"){ const r = e.apply(null, [].slice.call(arguments, 1)); return r[f]; }
    return e[f] == null ? e[0] : e[f];
  }
  /* ---- CE QUE LE SERVEUR A ECRIT EN FRANCAIS, EN ANGLAIS ----
   * « Faut en anglais aussi. » Quelques textes viennent du serveur deja
   * rediges : un specialiste ne avant que ses missions s'ecrivent en anglais,
   * et d'anciennes familles de l'audit (cles tronquees a 40 caracteres).
   * Traduits a l'affichage seulement ; en francais, ils restent tels quels. */
  const VERS_ANGLAIS = [
    [/^Recoupe « (.+?) » par (\S+)\s*:.*$/, (m, a, b) => "Splits « " + a + " » by " + b + ": the Scout's bucket there is too spread out"],
    [/\bne de <10 min\b/g, "born <10 min ago"],
    [/^deja \+#% en cinq minutes : on paierait.*$/, "already up #% in five minutes: we would be paying the top"],
    [/^piscine de \$# : sous le plancher d'ac.*$/, "pool of $#: below the buy floor"],
    [/^capitalisation de \$# : au-dessus du.*$/, "cap of $#: above the buy ceiling"],
  ];
  function en(txt){
    let x = String(txt == null ? "" : txt);
    if(G().fr) return x;
    for(const [re, par] of VERS_ANGLAIS) x = x.replace(re, par);
    return x;
  }
  const NOM_BORNE = { ageMin:["Minimum age (min)","Âge minimum (min)"], liqParMise:["Pool depth per stake (×)","Profondeur par mise (×)"],
                      mcMax:["Maximum market cap ($)","Capitalisation max ($)"], pumpMax:["Maximum 5-min rise (%)","Hausse max sur 5 min (%)"] };
  const nomBorne = k => NOM_BORNE[k] ? NOM_BORNE[k][G().fr ? 1 : 0] : k;
  /* Ce qui est replie : les longues listes montrent leur debut, le reste d'un clic. */
  const DEPLIE = { regles:false, evts:false, infra:false, lecons:false };
  const fichesOuvertes = new Set();
  const boutonPlus = (k, n) => '<button type="button" class="tm-plus" data-plus="' + k + '">' + esc(DEPLIE[k] ? t("voirMoins") : t("voirTout", n)) + "</button>";
  function role(r){ const e = P.ROLE[r]; return e ? e[G().fr ? 1 : 0] : (r || "—"); }

  /* ---- LES FORMATS ---- */
  const loc = () => G().fr ? "fr-FR" : "en-US";
  const entier = n => num(n) == null ? t("na") : Math.round(n).toLocaleString(loc());
  const usd = (n, signe) => {
    if(num(n) == null) return t("na");
    const a = Math.abs(n), s = a >= 100 ? a.toLocaleString("en-US", { maximumFractionDigits:0 }) : a.toFixed(2);
    return (signe ? (n >= 0 ? "+" : "−") : (n < 0 ? "−" : "")) + "$" + s;
  };
  const pct = (n, dec) => num(n) == null ? t("na") : (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(dec == null ? 1 : dec) + "%";
  const compact = n => {
    if(num(n) == null) return t("na");
    const a = Math.abs(n);
    return "$" + (a >= 1e9 ? (n/1e9).toFixed(2)+"B" : a >= 1e6 ? (n/1e6).toFixed(2)+"M" : a >= 1e3 ? (n/1e3).toFixed(1)+"k" : n.toFixed(0));
  };
  const prix = p => {
    if(num(p) == null || p <= 0) return t("na");
    if(p >= 1) return "$" + p.toFixed(p >= 100 ? 0 : 2);
    if(p >= 0.001) return "$" + p.toPrecision(3);
    /* 0.00000498 → $0.0₅498 : les zeros comptes, comme les ecrans de trading */
    const z = Math.floor(-Math.log10(p)) - 1, sous = "₀₁₂₃₄₅₆₇₈₉";
    const chiffres = String(Math.round(p * Math.pow(10, z + 4)));
    return "$0.0" + String(z).split("").map(c => sous[+c]).join("") + chiffres.slice(0, 3);
  };
  const age = m => {
    if(num(m) == null) return t("na");
    if(m < 60) return Math.round(m) + "m";
    if(m < 1440) return Math.floor(m/60) + "h" + String(Math.round(m % 60)).padStart(2, "0");
    return Math.floor(m/1440) + "d";
  };
  const duree = ms => {
    const s = Math.max(0, Math.round(ms/1000));
    if(s < 60) return s + " s";
    if(s < 3600) return Math.round(s/60) + " min";
    if(s < 86400) return Math.round(s/3600) + " h";
    return Math.round(s/86400) + (G().fr ? " j" : " d");
  };
  const ilya = ts => num(ts) == null || !ts ? t("jamais") : t("ilya", duree(Date.now() - ts));
  const hm = ts => { const d = new Date(ts); return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0"); };
  const jour = ts => new Date(ts).toLocaleDateString(loc(), { month:"short", day:"numeric" });
  const jourHeure = ts => jour(ts) + " " + hm(ts);
  const lienDex = (adr, pool) => {
    const x = String(pool || adr || "");
    return /^0x[0-9a-f]{6,}/i.test(x) ? "https://dexscreener.com/robinhood/" + x : null;
  };
  const symLien = (sym, adr, pool) => {
    const l = lienDex(adr, pool), s = "$" + esc(sym || "?");
    return l ? '<a href="' + esc(l) + '" target="_blank" rel="noopener">' + s + "</a>" : s;
  };
  const pastille = (tx, cl) => '<span class="tm-pastille ' + (cl || "") + '"><i></i>' + esc(tx) + "</span>";

  /* ==================== L'ETAT DE LA COLONIE ==================== */
  function etatColonie(){
    const g = G(), v = g.v;
    if(!v) return g.err ? "off" : "co";
    if(v.pause) return "pause";
    const src = v.dernierTour || v.maj || 0;
    const age = Date.now() - g.recu + (g.recu - src);
    if(!src || age > VIVANT_MS || g.err) return "vieux";
    return "on";
  }

  /* ==================== LES AGENTS : LE PIPELINE REEL ====================
   * Le chemin d'un jeton est celui du roster servi : la source, les gardes
   * dans l'ordre que la colonie a elle-meme choisi, la note, l'epreuve, la
   * banque, l'execution. Les autres agents s'accrochent a celui qu'ils
   * servent. Rien n'est dessine qui ne soit pas dans `roster`. */
  const RANG = { source:0, garde:1, note:3, epreuve:4, banque:5, execution:6 };
  function structure(v){
    const r = (v && v.roster) || [];
    const principal = r.filter(a => a.role in RANG)
      .sort((a, b) => (RANG[a.role] - RANG[b.role]) || ((a.ordre || 0) - (b.ordre || 0)));
    const cles = principal.map(a => a.key);
    const ancre = a => {
      if(a.parent && cles.indexOf(a.parent) >= 0) return a.parent;
      if(a.role === "conseil") return (principal.find(x => x.role === "note") || principal[principal.length-1] || {}).key;
      return (principal.find(x => x.role === "execution") || principal[principal.length-1] || {}).key;
    };
    const cotes = r.filter(a => !(a.role in RANG)).map(a => ({ a, ancre: ancre(a) }));
    return { tous:r, principal, cles, cotes, par:Object.fromEntries(r.map(a => [a.key, a])) };
  }
  /* Jusqu'ou un candidat du dernier tour est alle dans le pipeline. */
  function portee(S, c){
    if(!c.quiRefuse) return S.cles.indexOf((S.tous.find(a => a.role === "note") || {}).key);
    let i = S.cles.indexOf(c.quiRefuse);
    if(i < 0){ const cote = S.cotes.find(x => x.a.key === c.quiRefuse); i = cote ? S.cles.indexOf(cote.ancre) : 0; }
    return i;
  }
  function statuts(v, S){
    const out = {}, etat = etatColonie(), now = Date.now();
    const cands = (v && v.candidats) || [], flux = (v && v.flux) || [], sig = (v && v.signaux) || [];
    const journal = (v && v.journalStructure) || [], pos = (v && v.positions) || [];
    const achat = sig.filter(s => s.k === "achat").sort((a, b) => b.t - a.t)[0];
    const achatRecent = achat && now - achat.t < 10 * 60e3;
    for(const a of S.tous){
      const k = a.key;
      if(etat === "pause"){ out[k] = { code:"IDLE", action:t("pause") }; continue; }
      if(etat !== "on"){ out[k] = { code:"OFFLINE", action:"—" }; continue; }
      const f = flux.filter(x => x.par === k).sort((x, y) => y.t - x.t)[0];
      const refus = cands.filter(c => c.quiRefuse === k);
      const idx = S.cles.indexOf(k);
      const lus = idx >= 0 ? cands.filter(c => portee(S, c) >= idx).length : 0;
      const ev = journal.filter(j => now - j.t < 30 * 60e3 && (String(j.txt || "").indexOf(a.nom) >= 0 ||
        (j.chiffres || []).some(x => x && (x.agent === k || x.parent === k)))).sort((x, y) => y.t - x.t)[0];
      let s;
      if(a.role === "note" && achatRecent) s = { code:"SIGNAL", action:t("signale", achat.sym, num(achat.score)), t:achat.t };
      else if(a.role === "execution" && achatRecent) s = { code:"EXECUTING", action:t("ouvert", achat.sym, num(achat.mise) != null ? achat.mise.toFixed(2) : "?"), t:achat.t };
      else if(a.role === "banque" && achatRecent) s = { code:"EXECUTING", action:t("dose", achat.sym, num(achat.mise) != null ? achat.mise.toFixed(2) : "?"), t:achat.t };
      else if(f && now - f.t < 10 * 60e3) s = { code:"EXECUTING", action:"$" + f.sym + " · " + f.txt, t:f.t };
      else if(a.role === "conseil" && cands.some(c => c.conseil)) s = { code:"THINKING", action:t("conseils", cands.filter(c => c.conseil).length), t:v.dernierTour };
      else if(ev) s = { code:"LEARNING", action:ev.txt, t:ev.t };
      else if(lus > 0) s = { code:"ANALYZING", action:t("lu", lus, refus.length), t:v.dernierTour };
      else if((a.role === "veille" || a.role === "suivi" || a.role === "prolonge") && pos.length) s = { code:"ANALYZING", action:t("surveille", pos.length), t:v.dernierTour };
      else s = { code:"ONLINE", action: f ? "$" + f.sym + " · " + f.txt : (refus[0] ? t("dernierVeto", refus[0].sym, refus[0].refus) : a.mission), t: f ? f.t : null };
      if(refus.length && s.code === "ANALYZING") s.action = t("lu", lus, refus.length) + " — $" + refus[0].sym + ": " + refus[0].refus;
      out[k] = s;
    }
    return out;
  }
  /* Lisibles sur fond blanc (la page est restee blanche, 27/09). */
  const COUL_STATUT = { ONLINE:"#1B5FE0", ANALYZING:"#0E7490", THINKING:"#6D28D9", SIGNAL:"#B45309", EXECUTING:"#0E8A45", LEARNING:"#9333EA", IDLE:"#8A99B4", OFFLINE:"#8A99B4" };
  const CL_STATUT = { ONLINE:"tm-p-bleu", ANALYZING:"tm-p-cyan", THINKING:"tm-p-violet", SIGNAL:"tm-p-ambre", EXECUTING:"tm-p-vert", LEARNING:"tm-p-violet", IDLE:"", OFFLINE:"" };

  /* ==================== LE HERO ==================== */
  function peintHero(){
    const g = G(), v = g.v, e = etatColonie();
    const el = $("tmEtat"), tx = $("tmEtatTx");
    const map = { co:["etatCo","tm-p-ambre"], on:["etatOn","tm-p-vert"], pause:["etatPause","tm-p-ambre"], vieux:["etatVieux","tm-p-ambre"], off:["etatOff","tm-p-rouge"] };
    el.className = "tm-pastille " + map[e][1];
    tx.textContent = t(map[e][0]);
    el.querySelector("i").className = e === "on" ? "tm-point-vivant" : "";
    const pose = (id, val, sous, cl) => { $(id).textContent = val; $(id + "S").textContent = sous || ""; $(id).className = cl || ""; };
    if(!v){
      const s = g.err ? t("horsLigne", g.err) : t("rienLu");
      ["tmScan","tmSig","tmTr","tmAg","tmWin","tmPnl"].forEach((id, i) => pose(id, "—", i ? "" : s));
      return;
    }
    const c = v.compteurs || {};
    pose("tmScan", num(c.scoutVu) != null ? entier(c.scoutVu) : t("na"), v.depuis ? t("scanS", jour(v.depuis)) : "");
    pose("tmSig", num(c.oracleOk) != null ? entier(c.oracleOk) : t("na"), num(c.oracleOk) != null ? t("sigS") : "");
    pose("tmTr", entier(v.trades), t("trS", (v.positions || []).length, num(v.ouvertures) != null ? entier(v.ouvertures) : t("na")));
    const ro = v.roster || [];
    pose("tmAg", ro.length ? String(ro.length) : t("na"), t("agS", ro.filter(a => a.role === "specialiste").length));
    if(num(v.trades) != null && v.trades >= WIN_ASSEZ) pose("tmWin", Math.round(v.gains / v.trades * 100) + "%", t("winS", entier(v.trades)));
    else pose("tmWin", "—", t("winPeu", num(v.trades) || 0));
    const p = num(v.tresor) != null && num(v.depart) != null ? v.tresor - v.depart : null;
    pose("tmPnl", p == null ? t("na") : usd(p, true), p == null ? "" : t("pnlS", pct(p / v.depart * 100), entier(v.depart)), p == null ? "" : (p >= 0 ? "tm-up" : "tm-dn"));
  }

  /* La constellation du hero : les agents du roster servi, autour de la
     colonie. Elle tourne lentement (decor) ; elle ne s'allume que sur un
     evenement reel (voir `eclate`). */
  let empreinteConst = "";
  function peintConstellation(){
    const v = G().v, svg = $("tmConstellation");
    const r = (v && v.roster) || [];
    const emp = r.map(a => a.key).join(",");
    if(emp === empreinteConst && svg.childNodes.length) return;
    empreinteConst = emp;
    const n = r.length, R = 150;
    let h = '<defs><radialGradient id="tmCoeur"><stop offset="0" stop-color="#6366F1" stop-opacity=".9"/><stop offset="1" stop-color="#0B1020" stop-opacity="0"/></radialGradient></defs>';
    h += '<circle cx="200" cy="200" r="150" fill="none" stroke="rgba(148,163,184,.14)" stroke-dasharray="3 6"/>';
    h += '<circle cx="200" cy="200" r="95" fill="none" stroke="rgba(148,163,184,.10)"/>';
    h += '<g class="tm-coeur"><circle cx="200" cy="200" r="70" fill="url(#tmCoeur)"/><circle cx="200" cy="200" r="34" fill="#0C111B" stroke="#6366F1" stroke-width="2"/>'
       + '<text x="200" y="207" text-anchor="middle" font-size="22">🐕</text></g>';
    h += '<g class="tm-orbite">';
    r.forEach((a, i) => {
      const ang = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      const x = 200 + Math.cos(ang) * R, y = 200 + Math.sin(ang) * R;
      h += '<line x1="200" y1="200" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + esc(a.couleur || "#3B82F6") + '" stroke-opacity=".22"/>';
      h += '<g data-k="' + esc(a.key) + '"><g class="tm-contre"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="19" fill="#0C111B" stroke="' + esc(a.couleur || "#3B82F6") + '" stroke-width="2"/>'
         + '<text x="' + x.toFixed(1) + '" y="' + (y + 6).toFixed(1) + '" text-anchor="middle" font-size="16">' + esc(a.emoji || "•") + "</text></g></g>";
    });
    h += "</g>";
    svg.innerHTML = h;
  }
  function eclate(k){
    if(RM) return;
    const g = $("tmConstellation").querySelector('g[data-k="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"] circle');
    if(!g) return;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", g.getAttribute("cx")); c.setAttribute("cy", g.getAttribute("cy")); c.setAttribute("r", "19");
    c.setAttribute("fill", "none"); c.setAttribute("stroke", g.getAttribute("stroke")); c.setAttribute("stroke-width", "2");
    c.setAttribute("class", "tm-eclat");
    g.parentNode.appendChild(c);
    setTimeout(() => c.remove(), 1300);
  }

  /* ==================== LE FIL EN DIRECT ==================== */
  const vusFil = new Set();
  let filPeint = false;
  function evenements(v){
    const S = structure(v), nom = k => (S.par[k] || {}).nom || k, emo = k => (S.par[k] || {}).emoji || "•";
    const out = [];
    const sig = v.signaux || [];
    const oracle = (S.tous.find(a => a.role === "note") || { key:"oracle" }).key;
    const closer = (S.tous.find(a => a.role === "execution") || { key:"closer" }).key;
    for(const s of sig){
      if(s.k === "achat") out.push({ id:"a" + s.t + s.sym, t:s.t, type:"SIGNAL", e:emo(oracle), titre:t("fSignal", nom(oracle), s.sym),
        d:[num(s.score) != null ? "score " + s.score : "", num(s.mise) != null ? "stake $" + s.mise.toFixed(2) : "", s.mc ? "cap " + compact(s.mc) : ""].filter(Boolean).join(" · ") });
      else if(s.k === "vente") out.push({ id:"v" + s.t + s.sym, t:s.t, type:"TRADE", e:emo(closer), titre:t("fVente", s.sym, pct(num(s.r))), d:s.comment || "" });
    }
    for(const f of (v.flux || [])){
      if(f.tag === "open") continue;                                   /* deja dit par le signal d'achat */
      if(sig.some(s => s.sym === f.sym && Math.abs(s.t - f.t) < 5000)) continue;
      out.push({ id:"f" + f.t + f.sym, t:f.t, type:"TRADE", e:emo(f.par), titre:"$" + f.sym + " · " + (f.par ? nom(f.par) : ""), d:f.txt || "" });
    }
    for(const j of (v.journalStructure || [])) out.push({ id:"j" + j.t, t:j.t, type:"APPRIS", e:"🧠", titre:t("fAppris"), d:j.txt || "" });
    const tour = v.dernierTour || v.maj || 0;
    for(const c of (v.candidats || [])){
      if(c.quiRefuse) out.push({ id:"r" + tour + (c.addr || c.sym), t:tour, type:"REJET", e:emo(c.quiRefuse), titre:t("fRejet", nom(c.quiRefuse), c.sym), d:c.refus || "" });
      else out.push({ id:"p" + tour + (c.addr || c.sym), t:tour, type:"SIGNAL", e:emo(oracle), titre:t("fPasse", c.sym), d:num(c.score) != null ? "score " + c.score : "" });
    }
    return out.sort((a, b) => b.t - a.t);
  }
  function peintFil(){
    const v = G().v, ul = $("tmFil");
    if(!v){ ul.innerHTML = '<li class="tm-vide">' + esc(G().err ? t("horsLigne", G().err) : t("rienLu")) + "</li>"; $("tmFilN").textContent = "—"; return; }
    const l = evenements(v).slice(0, 40);
    $("tmFilN").textContent = t("filN", l.length);
    if(!l.length){ ul.innerHTML = '<li class="tm-vide">' + esc(t("rienLu")) + "</li>"; return; }
    const CL = { SIGNAL:"tm-p-ambre", TRADE:"tm-p-vert", REJET:"tm-p-rouge", APPRIS:"tm-p-violet" };
    const TX = { SIGNAL:"tSIGNAL", TRADE:"tTRADE", REJET:"tREJET", APPRIS:"tAPPRIS" };
    ul.innerHTML = l.map(x => {
      const neuf = filPeint && !vusFil.has(x.id);
      return '<li class="' + (neuf ? "neuf" : "") + '"><span class="h">' + esc(hm(x.t)) + '</span><span class="e" aria-hidden="true">' + esc(x.e) + "</span>"
        + '<span class="c">' + pastille(t(TX[x.type]), CL[x.type]) + " <b>" + esc(x.titre) + '</b><span class="d">' + esc(x.d) + "</span></span></li>";
    }).join("");
    l.forEach(x => vusFil.add(x.id));
    filPeint = true;
  }

  /* ==================== LA SANTE ==================== */
  function santeServices(v){
    const s = v.services || [], now = Date.now();
    return s.map(x => {
      const n = x.essais || 0, p = n ? x.reussites / n : null;
      let e = "rien";
      if(n){ e = p >= 0.9 && (!x.dernier || now - x.dernier < 30 * 60e3) ? "ok" : p >= 0.5 ? "moyen" : "ko"; }
      return Object.assign({ etat:e, part:p }, x);
    });
  }
  function peintSante(){
    const v = G().v, box = $("tmSante");
    if(!v){ box.innerHTML = '<div class="tm-vide">' + esc(G().err ? t("horsLigne", G().err) : t("rienLu")) + "</div>"; $("tmSanteN").textContent = "—"; return; }
    const src = v.dernierTour || v.maj || 0;
    const srv = santeServices(v), utilises = srv.filter(x => x.etat !== "rien"), ok = utilises.filter(x => x.etat === "ok").length;
    const ombres = v.ombres || {};
    const ligne = (k, val, cl) => '<div class="tm-regle" style="grid-template-columns:minmax(0,1fr) auto"><span class="q">' + esc(k) + '</span><b class="mono ' + (cl || "") + '">' + val + "</b></div>";
    let h = "";
    h += ligne(t("battement"), esc(src ? ilya(src) : t("na")), etatColonie() === "on" ? "tm-up" : "tm-dn");
    h += ligne(t("cadence"), esc(num(v.cadence) != null ? duree(v.cadence) : t("na")));
    h += ligne(t("depuis"), esc(v.depuis ? jour(v.depuis) + " · " + duree(Date.now() - v.depuis) : t("na")));
    h += ligne(t("sources"), esc(utilises.length ? ok + " / " + utilises.length : t("na")), utilises.length && ok === utilises.length ? "tm-up" : "");
    h += ligne(t("enAttente"), esc(num(ombres.enAttente) != null ? entier(ombres.enAttente) : t("na")));
    const al = v.alertes || [];
    h += ligne(t("alertesT"), esc(String(al.length)), al.length ? "tm-dn" : "tm-up");
    if(v.pause) h += '<div class="tm-alerte">' + esc(t("pause")) + "</div>";
    if(v.erreur) h += '<div class="tm-alerte haute">' + esc(t("lectureKo", v.erreur)) + "</div>";
    if(!al.length) h += '<div class="tm-petit">' + esc(t("aucuneAlerte")) + "</div>";
    al.slice(0, 3).forEach(a => {
      h += '<div class="tm-alerte ' + (a.gravite === "haute" ? "haute" : "") + '"><b>' + esc(a.quoi) + "</b>" + (a.quoiFaire ? '<div class="tm-petit" style="margin-top:4px">' + esc(String(a.quoiFaire).slice(0, 360)) + (String(a.quoiFaire).length > 360 ? "…" : "") + "</div>" : "") + "</div>";
    });
    box.innerHTML = h;
    $("tmSanteN").textContent = num(v.tours) != null ? t("tourN", entier(v.tours)) : "—";
  }

  /* ==================== LE RESEAU DES AGENTS ==================== */
  let empreinteReseau = "", POS = {};
  function peintReseau(){
    const v = G().v, svg = $("tmReseau");
    const S = structure(v);
    if(!S.tous.length){ svg.innerHTML = '<text x="500" y="180" text-anchor="middle" fill="#8A99B4" font-size="16">' + esc(v ? t("na") : t("rienLu")) + "</text>"; empreinteReseau = ""; return; }
    const st = statuts(v, S);
    const emp = S.tous.map(a => a.key + ":" + a.ordre).join(",");
    if(emp !== empreinteReseau){
      empreinteReseau = emp; POS = {};
      const n = S.principal.length;
      S.principal.forEach((a, i) => { POS[a.key] = { x: n > 1 ? 70 + i * (860 / (n - 1)) : 500, y: 165 }; });
      /* Les agents de cote se rangent au-dessus (le conseil) ou au-dessous,
         au plus pres de celui qu'ils servent, sans jamais se chevaucher :
         trois agents accroches au Closer tombaient au meme endroit. */
      const range = (liste, y) => {
        const PAS = 118, voulu = liste.map(a => ({ a, x: (POS[(S.cotes.find(c => c.a === a) || {}).ancre] || { x:500 }).x }))
          .sort((p, q) => p.x - q.x);
        for(let i = 1; i < voulu.length; i++) voulu[i].x = Math.max(voulu[i].x, voulu[i-1].x + PAS);
        const deborde = voulu.length ? voulu[voulu.length - 1].x - 940 : 0;
        if(deborde > 0) voulu.forEach(p => { p.x -= deborde; });
        for(let i = voulu.length - 2; i >= 0; i--) voulu[i].x = Math.min(voulu[i].x, voulu[i+1].x - PAS);
        voulu.forEach(p => { POS[p.a.key] = { x: Math.max(60, p.x), y }; });
      };
      range(S.cotes.filter(c => c.a.role === "conseil").map(c => c.a), 50);
      range(S.cotes.filter(c => c.a.role !== "conseil").map(c => c.a), 290);
      let h = '<g id="tmAretes">';
      for(let i = 1; i < S.principal.length; i++){
        const a = POS[S.principal[i-1].key], b = POS[S.principal[i].key];
        h += '<line class="arete" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
      }
      S.cotes.forEach(c => { const a = POS[c.ancre], b = POS[c.a.key]; if(a && b) h += '<line class="arete lat" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>'; });
      h += '</g><g id="tmNoeuds">';
      S.tous.forEach(a => {
        const p = POS[a.key]; if(!p) return;
        const c = esc(a.couleur || "#3B82F6");
        h += '<g class="noeud" data-k="' + esc(a.key) + '" transform="translate(' + p.x.toFixed(1) + "," + p.y + ')"><title>' + esc(a.nom + " — " + (a.mission || "")) + "</title>"
          + '<circle class="anneau" r="25" stroke="' + c + '"/><circle class="fond" r="23" stroke="' + c + '"/>'
          + '<text y="7" font-size="20">' + esc(a.emoji || "•") + '</text><text class="nom" y="42">' + esc(a.nom) + '</text><text class="st" y="56"></text></g>';
      });
      h += '</g><g id="tmPaquets"></g>';
      svg.innerHTML = h;
    }
    S.tous.forEach(a => {
      const g = svg.querySelector('g.noeud[data-k="' + (window.CSS && CSS.escape ? CSS.escape(a.key) : a.key) + '"]'); if(!g) return;
      const s = st[a.key] || { code:"ONLINE" };
      const txt = g.querySelector(".st"); txt.textContent = t(s.code); txt.style.fill = COUL_STATUT[s.code];
      g.classList.toggle("actif", ["ANALYZING","THINKING","SIGNAL","EXECUTING","LEARNING"].indexOf(s.code) >= 0);
    });
    $("tmLegende").innerHTML = ["SIGNAL","EXECUTING","ANALYZING","LEARNING","THINKING","ONLINE"]
      .map(k => '<span><i style="background:' + COUL_STATUT[k] + '"></i>' + esc(t(k)) + "</span>").join("")
      + '<span><i style="background:#22C55E"></i>' + esc(G().fr ? "paquet : jeton qui passe" : "packet: token cleared") + "</span>"
      + '<span><i style="background:#EF4444"></i>' + esc(G().fr ? "paquet : veto" : "packet: veto") + "</span>";
  }
  /* Un paquet suit le pipeline jusqu'a l'agent `jusqua` (inclus). */
  let paquetsVivants = 0;
  function paquet(S, jusqua, couleur, delai){
    if(RM || paquetsVivants > 40) return;
    const pts = S.cles.slice(0, jusqua + 1).map(k => POS[k]).filter(Boolean);
    if(pts.length < 1) return;
    setTimeout(() => {
      const box = $("tmPaquets"); if(!box) return;
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("r", "6"); c.setAttribute("fill", couleur); c.setAttribute("class", "paquet"); c.style.color = couleur;
      box.appendChild(c); paquetsVivants++;
      const long = []; let tot = 0;
      for(let i = 1; i < pts.length; i++){ const d = Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y); long.push(d); tot += d; }
      const vit = 360, t0 = performance.now(), dureeMs = Math.max(500, tot / vit * 1000);
      (function pas(now){
        let f = Math.min(1, (now - t0) / dureeMs), d = f * tot, i = 0;
        while(i < long.length && d > long[i]){ d -= long[i]; i++; }
        const a = pts[Math.min(i, pts.length - 1)], b = pts[Math.min(i + 1, pts.length - 1)], l = long[i] || 1;
        c.setAttribute("cx", (a.x + (b.x - a.x) * Math.min(1, d / l)).toFixed(1));
        c.setAttribute("cy", (a.y + (b.y - a.y) * Math.min(1, d / l)).toFixed(1));
        if(f < 1) requestAnimationFrame(pas);
        else { c.setAttribute("r", "10"); c.style.opacity = ".0"; c.style.transition = "opacity .5s, r .5s"; setTimeout(() => { c.remove(); paquetsVivants--; }, 520); }
      })(t0);
    }, delai || 0);
  }
  /* Les evenements reels depuis la derniere vue. */
  let dernierTourVu = null, dernierSignalVu = null;
  function animeEvenements(){
    const v = G().v; if(!v) return;
    const S = structure(v);
    const sig = v.signaux || [];
    const maxSig = sig.reduce((m, s) => Math.max(m, s.t || 0), 0);
    const tour = v.dernierTour || 0;
    if(tour && tour !== dernierTourVu){
      (v.candidats || []).slice(0, 14).forEach((c, i) => {
        const j = portee(S, c);
        if(j >= 0) paquet(S, j, c.quiRefuse ? "#EF4444" : "#22C55E", i * 260);
        if(c.quiRefuse) setTimeout(() => eclate(c.quiRefuse), i * 260);
      });
      dernierTourVu = tour;
    }
    if(dernierSignalVu !== null){
      sig.filter(s => s.t > dernierSignalVu).forEach((s, i) => {
        const fin = S.cles.length - 1;
        paquet(S, fin, s.k === "achat" ? "#FBBF24" : (num(s.r) >= 0 ? "#22C55E" : "#EF4444"), 400 + i * 400);
        const k = s.k === "achat" ? (S.tous.find(a => a.role === "note") || {}).key : (S.tous.find(a => a.role === "execution") || {}).key;
        if(k) eclate(k);
      });
    }
    dernierSignalVu = maxSig;
  }

  /* ==================== LES FICHES DES AGENTS ==================== */
  function peintFiches(){
    const v = G().v, box = $("tmFiches");
    const S = structure(v);
    if(!S.tous.length){ box.innerHTML = '<div class="tm-vide">' + esc(v ? t("na") : (G().err ? t("horsLigne", G().err) : t("rienLu"))) + "</div>"; return; }
    const st = statuts(v, S), ag = v.agents || {}, c = v.compteurs || {};
    const ordre = S.principal.concat(S.cotes.map(x => x.a));
    box.innerHTML = ordre.map(a => {
      const s = st[a.key] || { code:"ONLINE", action:"" };
      const vus = num(a.vus) || 0, bl = num(a.bloques) || 0;
      let dl = "";
      if(vus > 0){
        dl += "<dt>" + esc(t("decisions")) + "</dt><dd>" + esc(t("revus", vus, bl)) + "</dd>";
        dl += "<dt>" + esc(t("passe")) + "</dt><dd>" + esc(Math.round((vus - bl) / vus * 100) + "%") + "</dd>";
      } else {
        const extra = { banque: v.banque ? (v.banque.methode + " · " + (v.banque.prochaine && num(v.banque.prochaine.mise) != null ? "next $" + v.banque.prochaine.mise.toFixed(2) : "—")) : null,
          execution: num(v.trades) != null ? entier(v.trades) + " " + t("fermesS") : null,
          veille: num(c.sentinelleCoupe) != null ? entier(c.sentinelleCoupe) + (G().fr ? " coupes" : " cuts") : null,
          conseil: v.conseiller ? (v.conseiller.actif ? entier(v.conseiller.rendus) + (G().fr ? " avis" : " views") : t("conseilOff")) : null,
          prolonge: num(c.promoteurProlonge) != null ? entier(c.promoteurProlonge) + (G().fr ? " prolongées" : " extended") : null,
          suivi: num(c.veilles) != null ? entier(c.veilles) + (G().fr ? " relectures" : " re-reads") : null }[a.role];
        dl += "<dt>" + esc(t("decisions")) + "</dt><dd>" + esc(extra == null ? t("na") : extra) + "</dd>";
      }
      dl += "<dt>" + esc(t("activite")) + "</dt><dd>" + esc(s.t ? ilya(s.t) : "—") + "</dd>";
      const l = ((ag[a.key] || {}).lecons || [])[0];
      const lecon = l ? (l.n >= LECON_ASSEZ && !l.nonLue ? t("croit", l.quoi, Math.round(l.n), pct(l.moyenne)) : t("apprendEncore", (ag[a.key] || {}).obs || l.n)) : "";
      const ouvert = fichesOuvertes.has(a.key);
      return '<article class="tm-fiche' + (ouvert ? " ouvert" : "") + '" data-k="' + esc(a.key) + '" tabindex="0" aria-expanded="' + ouvert + '"><div class="t"><span class="em" style="box-shadow:inset 0 0 0 1px ' + esc(a.couleur || "#3B82F6") + '">' + esc(a.emoji || "•") + "</span>"
        + "<span><b>" + esc(a.nom) + "</b><small>" + esc(role(a.role)) + "</small></span>" + pastille(t(s.code), CL_STATUT[s.code]) + "</div>"
        + '<div class="m act"><b style="color:var(--t-titre)">' + esc(t("derniereAction")) + " · </b>" + esc(en(String(s.action || "—")).slice(0, 220)) + "</div>"
        + '<div class="plus"><dl>' + dl + "</dl>" + (lecon ? '<div class="m">' + esc(en(lecon)) + "</div>" : "") + "</div></article>";
    }).join("");
  }

  /* ==================== LE MARCHE ==================== */
  let filtre = "tout", choisi = null;
  /* Le risque n'est dit que par les gardes de securite (contrat, detenteurs,
     sortie simulee) ou par la concentration lue. Un jeton arrete AVANT eux
     (planchers du Scout) n'a jamais ete evalue : l'ecrire « non lu » le
     ferait passer pour une lecture ratee. */
  function risque(c, S){
    if(c.quiRefuse === "warden" || c.quiRefuse === "whale" || c.quiRefuse === "cobaye" || (num(c.top) != null && c.top >= 50)) return "HAUT";
    const garde = S.principal.findIndex(a => a.role === "garde");
    if(garde >= 0 && portee(S, c) < garde) return "NONEVAL";
    if(c.chaineVue === false) return "NONLU";
    return "AUCUN";
  }
  function lignesMarche(v){
    const S = structure(v);
    const achats = (v.signaux || []).filter(s => s.k === "achat").map(s => String(s.adr || "").toLowerCase());
    const tenus = (v.positions || []).map(p => String(p.adr || "").toLowerCase());
    const out = (v.candidats || []).map(c => {
      const a = String(c.addr || "").toLowerCase();
      const dec = c.quiRefuse ? "REFUS" : (achats.indexOf(a) >= 0 || tenus.indexOf(a) >= 0 ? "ACHAT" : "PASSE");
      return { src:"c", c, sym:c.sym, adr:c.addr, pool:c.pool, prix:c.prix, liq:c.liq, vol:null, age:c.minutes, porteurs:c.porteurs, score:c.score, risque:risque(c, S), dec };
    });
    for(const s of (v.surveillance || [])){
      if(out.some(x => String(x.adr || "").toLowerCase() === String(s.addr || "").toLowerCase())) continue;
      out.push({ src:"s", c:s, sym:s.sym, adr:s.addr, pool:null, prix:null, liq:s.liq, vol:null, age:null, porteurs:null, score:s.note, risque:"AUCUN", dec:"VEILLE" });
    }
    return out.sort((a, b) => (num(b.score) || -1) - (num(a.score) || -1));
  }
  function passeFiltre(x, q){
    if(q && (String(x.sym || "").toLowerCase().indexOf(q) < 0 && String(x.adr || "").toLowerCase().indexOf(q) < 0)) return false;
    if(filtre === "achat") return x.dec === "ACHAT" || x.dec === "PASSE";
    if(filtre === "veille") return x.dec === "VEILLE";
    if(filtre === "refus") return x.dec === "REFUS";
    if(filtre === "risque") return x.risque === "HAUT";
    if(filtre === "neuf") return num(x.age) != null && x.age < 60;
    return true;
  }
  const CL_DEC = { ACHAT:"tm-p-vert", PASSE:"tm-p-bleu", VEILLE:"tm-p-ambre", REFUS:"tm-p-rouge" };
  const TX_DEC = { ACHAT:"dACHAT", PASSE:"dPASSE", VEILLE:"dVEILLE", REFUS:"dREFUS" };
  const CL_RISQUE = { HAUT:"tm-p-rouge", NONLU:"tm-p-ambre", AUCUN:"", NONEVAL:"" };
  const TX_RISQUE = { HAUT:"rHAUT", NONLU:"rNONLU", AUCUN:"rAUCUN", NONEVAL:"rNONEVAL" };
  function peintMarche(){
    const v = G().v, tb = $("tmLignes");
    if(!v){ tb.innerHTML = '<tr><td colspan="9" class="tm-vide">' + esc(G().err ? t("horsLigne", G().err) : t("rienLu")) + "</td></tr>"; $("tmMarN").textContent = "—"; return; }
    const tout = lignesMarche(v), q = String($("tmCherche").value || "").trim().toLowerCase();
    const l = tout.filter(x => passeFiltre(x, q));
    $("tmMarS").textContent = t("marS", (v.candidats || []).length, v.dernierTour ? hm(v.dernierTour) : "—", (v.surveillance || []).length);
    $("tmMarN").textContent = t("marN", l.length, tout.length);
    if(!l.length){ tb.innerHTML = '<tr><td colspan="9" class="tm-vide">' + esc(t("aucunJeton")) + "</td></tr>"; }
    else tb.innerHTML = l.map(x => {
      const sc = num(x.score);
      return '<tr data-adr="' + esc(x.adr || x.sym) + '" class="' + (choisi && choisi === (x.adr || x.sym) ? "choisi" : "") + '" tabindex="0">'
        + '<td><span class="sym">$' + esc(x.sym || "?") + '</span><span class="tm-adr">' + esc(x.adr ? String(x.adr).slice(0, 8) + "…" + String(x.adr).slice(-4) : "") + "</span></td>"
        + "<td>" + esc(prix(x.prix)) + "</td><td>" + esc(num(x.liq) != null ? compact(x.liq) : t("na")) + "</td><td>" + esc(t("na")) + "</td>"
        + "<td>" + esc(age(x.age)) + "</td><td>" + esc(num(x.porteurs) != null ? entier(x.porteurs) : t("na")) + "</td>"
        + '<td class="' + (sc == null ? "" : sc >= ((v.seuil) || 50) ? "tm-up" : "tm-mu") + '">' + esc(sc == null ? t("na") : sc) + "</td>"
        + "<td>" + (x.src === "c" ? pastille(t(TX_RISQUE[x.risque]), CL_RISQUE[x.risque]) : esc(t("na"))) + "</td>"
        + "<td>" + pastille(t(TX_DEC[x.dec]), CL_DEC[x.dec]) + "</td></tr>";
    }).join("");
    if(choisi){ const x = tout.find(y => (y.adr || y.sym) === choisi); if(x) peintAnalyse(x, v); }
  }
  function barre(label, valeur, frac, etat){
    const cl = etat === false ? "ko" : etat === null ? "nd" : "";
    const w = frac == null ? 0 : Math.max(3, Math.min(100, frac * 100));
    return '<div class="tm-barre ' + cl + '"><div class="l"><span>' + esc(label) + "</span><b>" + esc(valeur) + '</b></div><div class="j"><i style="width:' + w.toFixed(0) + '%"></i></div></div>';
  }
  function peintAnalyse(x, v){
    const box = $("tmAnalyse"), c = x.c, pl = v.planchers || {}, S = structure(v);
    const lien = lienDex(x.adr, x.pool);
    let h = '<div class="tm-titre" style="margin:0"><h3>$' + esc(x.sym || "?") + "</h3>" + pastille(t(TX_DEC[x.dec]), CL_DEC[x.dec]) + "</div>"
      + '<div class="tm-petit mono" style="margin-top:4px;overflow-wrap:anywhere">' + esc(x.adr || "") + "</div>"
      + (lien ? '<div class="tm-petit"><a href="' + esc(lien) + '" target="_blank" rel="noopener">' + esc(t("voirDex")) + "</a></div>" : "");
    if(x.src === "c"){
      const nl = t("nonLu");
      h += barre(t("bLiq"), num(c.liq) != null ? compact(c.liq) + (num(pl.liq) != null ? " / " + compact(pl.liq) : "") : nl, num(c.liq) != null && pl.liq ? c.liq / pl.liq : null, num(c.liq) != null && pl.liq ? c.liq >= pl.liq : null);
      const mcOk = num(c.mc) != null && pl.mc && pl.mcMax ? (c.mc >= pl.mc && c.mc <= pl.mcMax) : null;
      h += barre(t("bMc"), num(c.mc) != null ? compact(c.mc) + (num(pl.mc) != null && num(pl.mcMax) != null ? " (" + compact(pl.mc) + "–" + compact(pl.mcMax) + ")" : "") : nl,
        num(c.mc) != null && pl.mc && pl.mcMax ? (c.mc < pl.mc ? c.mc / pl.mc : c.mc > pl.mcMax ? pl.mcMax / c.mc : 1) : null, mcOk);
      const amin = num(pl.ageMin), amax = num(v.ageMax);
      h += barre(t("bAge"), age(c.minutes) + (amin != null ? " (" + amin + "m–" + (amax != null ? age(amax) : "?") + ")" : ""),
        num(c.minutes) != null && amin ? Math.min(1, c.minutes / amin) : null, num(c.minutes) != null && amin != null ? (c.minutes >= amin && (amax == null || c.minutes <= amax)) : null);
      const pm = num(pl.pumpM5), dm = num(pl.dumpM5);
      h += barre(t("bMove"), num(c.ch_m5) != null ? pct(c.ch_m5) + (pm != null ? " (−" + dm + "% / +" + pm + "%)" : "") : nl,
        num(c.ch_m5) != null && pm ? 1 - Math.min(1, Math.abs(c.ch_m5) / (c.ch_m5 >= 0 ? pm : (dm || pm))) : null,
        num(c.ch_m5) != null && pm != null ? (c.ch_m5 <= pm && (dm == null || c.ch_m5 >= -dm)) : null);
      h += barre(t("bTop"), num(c.top) != null ? c.top + "%" : nl, num(c.top) != null ? 1 - c.top / 100 : null, num(c.top) != null ? (c.top < 50) : null);
      h += barre(t("bAch"), num(c.acheteurs) != null ? String(c.acheteurs) : nl, num(c.acheteurs) != null ? Math.min(1, c.acheteurs / 20) : null, null);
      h += barre(t("bScore"), num(c.score) != null ? c.score + " / " + (v.seuil || "?") : nl, num(c.score) != null ? c.score / 100 : null, num(c.score) != null && v.seuil ? c.score >= v.seuil : null);
      h += '<div class="tm-verdict"><div><small>' + esc(t("decisionIA")) + '</small><b class="' + (x.dec === "REFUS" ? "tm-dn" : "tm-up") + '">' + esc(t(TX_DEC[x.dec])) + "</b></div>"
        + "<div><small>" + esc(t("confiance")) + "</small><b>" + esc(num(c.score) != null ? c.score + "/100" : t("na")) + '</b><span class="tm-petit" style="margin-top:3px;display:block">' + esc(t("confS", v.seuil || "?")) + "</span></div></div>";
      let why = c.quiRefuse ? t("parAgent", (S.par[c.quiRefuse] || {}).nom || c.quiRefuse) + (c.refus || "") : t("passeTout");
      if(c.epreuve){
        if(c.epreuve.teste && c.epreuve.passe) why += "\n" + t("epreuveOk", c.epreuve.essais || "?");
        else if(c.epreuve.raison) why += "\n" + t("epreuveKo", c.epreuve.raison);
        if(c.epreuve.retour && num(c.epreuve.retour.pct) != null) why += "\n" + t("retour", c.epreuve.retour.pct);
      }
      if(c.conseil) why += "\n" + t("conseilT", typeof c.conseil === "string" ? c.conseil : (c.conseil.avis || c.conseil.txt || JSON.stringify(c.conseil)).toString().slice(0, 200));
      h += '<div class="tm-pourquoi"><b>' + esc(t("pourquoi")) + "</b>" + esc(why).replace(/\n/g, "<br>") + "</div>";
    } else {
      h += barre(t("bLiq"), num(c.liq) != null ? compact(c.liq) + (num(pl.liq) != null ? " / " + compact(pl.liq) : "") : t("nonLu"), num(c.liq) != null && pl.liq ? c.liq / pl.liq : null, num(c.liq) != null && pl.liq ? c.liq >= pl.liq : null);
      h += barre(t("bScore"), (c.note != null ? c.note : "?") + " / " + (v.seuil || "?"), num(c.note) != null ? c.note / 100 : null, num(c.note) != null && v.seuil ? c.note >= v.seuil : null);
      h += '<div class="tm-pourquoi"><b>' + esc(t("pourquoi")) + "</b>" + esc(t("veilleT", c.verdict || "—", c.vu || 0, c.meilleure != null ? c.meilleure : "?")) + (c.dernier ? "<br>" + esc(ilya(c.dernier)) : "") + "</div>";
    }
    box.innerHTML = h;
  }

  /* ==================== LES TRADES ==================== */
  let pageFerm = 0, fenetre = 7;
  function peintTrades(){
    const v = G().v;
    if(!v){
      const m = '<div class="tm-vide">' + esc(G().err ? t("horsLigne", G().err) : t("rienLu")) + "</div>";
      $("tmTuiles").innerHTML = m; $("tmOuvertes").innerHTML = ""; $("tmLive").innerHTML = ""; $("tmFermees").innerHTML = ""; $("tmBtCorps").innerHTML = "";
      dessineCourbe(null); return;
    }
    const pnl = num(v.tresor) != null && num(v.depart) != null ? v.tresor - v.depart : null;
    const courbe = (v.courbe || []).filter(x => num(x) != null);
    let dd = null;
    if(courbe.length > 1){ let pic = courbe[0]; dd = 0; for(const x of courbe){ pic = Math.max(pic, x); dd = Math.min(dd, (x - pic) / pic * 100); } }
    const tuile = (k, val, sous, cl) => '<div class="tm-tuile"><small>' + esc(k) + '</small><b class="' + (cl || "") + '">' + esc(val) + "</b><span>" + esc(sous || "") + "</span></div>";
    $("tmTuiles").innerHTML = tuile(t("capInit"), usd(v.depart), v.depuis ? t("depuisD", jour(v.depuis)) : "")
      + tuile(t("solde"), usd(v.tresor), "")
      + tuile(t("pnl"), pnl == null ? t("na") : usd(pnl, true), "", pnl == null ? "" : pnl >= 0 ? "tm-up" : "tm-dn")
      + tuile(t("rendement"), pnl == null ? t("na") : pct(pnl / v.depart * 100), "", pnl == null ? "" : pnl >= 0 ? "tm-up" : "tm-dn")
      + tuile(t("tradesT"), entier(v.trades), t("ouvertesS", (v.positions || []).length))
      + tuile(t("winT"), num(v.trades) != null && v.trades >= WIN_ASSEZ ? Math.round(v.gains / v.trades * 100) + "%" : "—", num(v.trades) != null && v.trades >= WIN_ASSEZ ? t("winS", entier(v.trades)) : t("winPeu", num(v.trades) || 0))
      + tuile(t("ddT"), dd == null ? t("na") : pct(dd), dd == null ? "" : t("ddS", courbe.length), dd == null ? "" : "tm-dn");
    $("tmTrN").textContent = t("fermN", ((v.carnet || {}).lignes || []).length, entier(v.trades));
    $("tmEqS").textContent = courbe.length ? t("eqS", courbe.length) : "";
    dessineCourbe(courbe.length > 1 ? courbe : null, v.depart);

    /* positions ouvertes */
    const pos = v.positions || [];
    $("tmOuvN").textContent = String(pos.length);
    $("tmOuvertes").innerHTML = pos.length ? '<div class="tm-tab-box"><table class="tm-table" style="min-width:420px"><thead><tr><th>Token</th><th>Stake</th><th>Latent</th><th>Held</th><th>Cap</th></tr></thead><tbody>'
      + pos.map(p => "<tr><td>" + symLien(p.sym, p.adr, p.pool) + "</td><td>" + esc(usd(p.mise)) + '</td><td class="' + (num(p.latent) == null ? "tm-mu" : p.latent >= 0 ? "tm-up" : "tm-dn") + '">'
        + esc(num(p.latent) == null ? t("nonRelu") : pct(p.latent)) + "</td><td>" + esc(num(p.ouverteDepuis) != null ? duree(p.ouverteDepuis) : t("na")) + "</td><td>" + esc(num(p.mcMaintenant) != null ? compact(p.mcMaintenant) : num(p.mcAchat) != null ? compact(p.mcAchat) : t("na")) + "</td></tr>").join("")
      + "</tbody></table></div>" : '<div class="tm-vide">' + esc(t("aucuneOuverte")) + "</div>";

    /* live : les miroirs, argent reel */
    const r = v.reel || {}, sm = v.suiviMiroir || null;
    let lv = "";
    if(num(r.n) != null && r.n > 0){
      lv += '<div class="tm-petit" style="margin-top:0;color:var(--t-texte)">' + esc(t("liveTx", entier(r.n), pct(r.moyenne))) + "</div>";
      if(r.n >= REEL_ASSEZ && num(r.ecart) != null) lv += '<div class="tm-petit">' + esc(t("liveEcart", r.ecart.toFixed(1), num(r.nEcart) != null ? r.nEcart : r.n)) + "</div>";
      else lv += '<div class="tm-petit">' + esc(t("livePeu", r.n)) + "</div>";
      const b = r.bilan && r.bilan.tout;
      if(b && num(b.n) != null) lv += '<div class="tm-grille3" style="margin-top:10px">' + tuile(t("btTrades"), entier(b.n), "") + tuile(t("winT"), b.n >= WIN_ASSEZ ? b.partGagnantes + "%" : "—", b.n >= WIN_ASSEZ ? t("winS", b.n) : t("winPeu", b.n)) + tuile(t("btMoy"), pct(b.moyenne), "", b.moyenne >= 0 ? "tm-up" : "tm-dn") + "</div>";
    } else lv += '<div class="tm-vide">' + esc(t("liveRien")) + "</div>";
    if(sm && num(sm.envois) != null) lv += '<div class="tm-petit">' + esc(t("liveEnvois", entier(sm.envois), entier(sm.suivis))) + "</div>";
    lv += '<div class="tm-petit"><a href="#tm-console">' + esc(t("liveLien")) + "</a></div>";
    $("tmLive").innerHTML = lv;

    /* fermes */
    const lignes = ((v.carnet || {}).lignes || []).slice().sort((a, b) => (b.t || 0) - (a.t || 0));
    $("tmFermN").textContent = t("fermN", lignes.length, entier(v.trades));
    const PAR = 10, nb = Math.max(1, Math.ceil(lignes.length / PAR));
    pageFerm = Math.min(pageFerm, nb - 1);
    const vue = lignes.slice(pageFerm * PAR, pageFerm * PAR + PAR);
    $("tmFermees").innerHTML = vue.length ? vue.map(l => "<tr><td>" + symLien(l.sym, l.adr) + "</td><td>" + esc(l.t ? jourHeure(l.t) : t("na")) + "</td><td>" + esc(num(l.tenue) != null ? l.tenue + " min" : t("na"))
      + "</td><td>" + esc(usd(l.mise)) + '</td><td class="' + (num(l.r) >= 0 ? "tm-up" : "tm-dn") + '">' + esc(pct(l.r)) + '</td><td class="' + (num(l.gain) >= 0 ? "tm-up" : "tm-dn") + '">' + esc(usd(l.gain, true))
      + '</td><td class="tm-sortie">' + esc([l.par, l.raison].filter(Boolean).join(" · ").slice(0, 90) || "—") + "</td></tr>").join("")
      : '<tr><td colspan="7" class="tm-vide">' + esc(t("aucunFerme")) + "</td></tr>";
    pages("tmFermP", pageFerm, nb, p => { pageFerm = p; peintTrades(); });

    peintBacktest(v, lignes);
  }
  function pages(id, p, nb, va){
    const box = $(id);
    if(nb <= 1){ box.innerHTML = ""; return; }
    box.innerHTML = '<button type="button" data-p="-1" aria-label="Previous"' + (p <= 0 ? " disabled" : "") + '>‹</button><span>' + esc(t("page", p + 1, nb)) + '</span><button type="button" data-p="1" aria-label="Next"' + (p >= nb - 1 ? " disabled" : "") + ">›</button>";
    box.querySelectorAll("button").forEach(b => b.addEventListener("click", () => va(Math.max(0, Math.min(nb - 1, p + Number(b.dataset.p))))));
  }
  function peintBacktest(v, lignes){
    const box = $("tmBtCorps");
    document.querySelectorAll("#tmBacktest [data-w]").forEach(b => b.setAttribute("aria-pressed", Number(b.dataset.w) === fenetre ? "true" : "false"));
    const now = Date.now(), debut = now - fenetre * 86400e3;
    const plusVieux = lignes.reduce((m, l) => Math.min(m, l.t0 || l.t || Infinity), Infinity);
    let h = "";
    if(!lignes.length) h += '<div class="tm-vide">' + esc(t("btRien")) + "</div>";
    else if(plusVieux > debut) h += '<div class="tm-vide">' + esc(t("btCollecte", jour(plusVieux), Math.max(0, Math.floor((now - plusVieux) / 86400e3)))) + "</div>";
    else {
      const l = lignes.filter(x => (x.t || 0) >= debut);
      const g = l.filter(x => num(x.r) > 0).length, somme = l.reduce((s, x) => s + (num(x.gain) || 0), 0);
      const moy = l.length ? l.reduce((s, x) => s + (num(x.r) || 0), 0) / l.length : null;
      const rs = l.map(x => num(x.r)).filter(x => x != null);
      const tu = (k, val, sous, cl) => '<div class="tm-tuile"><small>' + esc(k) + '</small><b class="' + (cl || "") + '">' + esc(val) + "</b><span>" + esc(sous || "") + "</span></div>";
      h += '<div class="tm-tuiles" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">'
        + tu(t("btTrades"), String(l.length), "")
        + tu(t("winT"), l.length >= WIN_ASSEZ ? Math.round(g / l.length * 100) + "%" : "—", l.length >= WIN_ASSEZ ? t("winS", l.length) : t("winPeu", l.length))
        + tu(t("btPnl"), usd(somme, true), "", somme >= 0 ? "tm-up" : "tm-dn")
        + tu(t("btMoy"), moy == null ? t("na") : pct(moy), "", moy >= 0 ? "tm-up" : "tm-dn")
        + tu(t("btMeilleur"), rs.length ? pct(Math.max.apply(null, rs), 0) + " / " + pct(Math.min.apply(null, rs), 0) : t("na"), "")
        + "</div>";
    }
    if(v.depuis) h += '<div class="tm-petit">' + esc(t("btDepart", jour(v.depuis))) + "</div>";
    const bancs = v.bancs || [];
    if(bancs.length){
      h += '<div class="tm-titre" style="margin:16px 0 6px"><h2 style="font-size:11px">' + esc(t("btBancs")) + "</h2></div>";
      h += bancs.map(b => {
        const r = b.retenus || b;
        const assez = num(r.n) != null && r.n >= BANCS_ASSEZ;
        return '<div class="tm-regle" style="grid-template-columns:minmax(0,1fr) auto"><span class="q"><b>' + esc(b.quoi || b.cle) + "</b>" + (b.cle === "en vigueur" ? " " + pastille(t("btEnVigueur"), "tm-p-bleu") : "")
          + "<span>" + esc(num(r.n) != null ? r.n + " · " + (assez ? t("gagnantesP", r.partGagnantes) : t("btPeu", r.n)) : "") + "</span></span>"
          + '<b class="mono ' + (assez ? (r.moyenne >= 0 ? "tm-up" : "tm-dn") : "tm-mu") + '">' + esc(assez ? pct(r.moyenne) : "—") + "</b></div>";
      }).join("");
    }
    box.innerHTML = h;
  }
  function dessineCourbe(pts, depart){
    const c = $("tmCourbe"); if(!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth || 600, h = c.clientHeight || 220;
    c.width = w * dpr; c.height = h * dpr;
    const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
    if(!pts){ x.fillStyle = "#64748B"; x.font = "13px Outfit, system-ui, sans-serif"; x.fillText(t(G().v ? "pasDeCourbe" : "rienLu"), 14, h / 2); return; }
    const lo = Math.min.apply(null, pts.concat(num(depart) != null ? [depart] : [])), hi = Math.max.apply(null, pts.concat(num(depart) != null ? [depart] : []));
    const rng = (hi - lo) || 1, G0 = 54, D0 = 10;
    const X = i => G0 + i / (pts.length - 1) * (w - G0 - D0), Y = y => h - 22 - (y - lo) / rng * (h - 40);
    x.strokeStyle = "rgba(148,163,184,.10)"; x.lineWidth = 1; x.fillStyle = "#64748B"; x.font = "11px JetBrains Mono, monospace";
    for(let i = 0; i <= 3; i++){ const y = lo + rng * i / 3, yy = Y(y); x.beginPath(); x.moveTo(G0, yy); x.lineTo(w - D0, yy); x.stroke(); x.fillText("$" + Math.round(y).toLocaleString("en-US"), 2, yy + 4); }
    if(num(depart) != null){ x.setLineDash([4, 5]); x.strokeStyle = "rgba(251,191,36,.5)"; x.beginPath(); x.moveTo(G0, Y(depart)); x.lineTo(w - D0, Y(depart)); x.stroke(); x.setLineDash([]); }
    const monte = pts[pts.length - 1] >= pts[0], coul = monte ? "34,197,94" : "239,68,68";
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(" + coul + ",.28)"); gr.addColorStop(1, "rgba(" + coul + ",0)");
    x.beginPath(); x.moveTo(X(0), h - 22); pts.forEach((p, i) => x.lineTo(X(i), Y(p))); x.lineTo(X(pts.length - 1), h - 22); x.closePath(); x.fillStyle = gr; x.fill();
    x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(X(i), Y(p)) : x.moveTo(X(i), Y(p))); x.strokeStyle = "rgb(" + coul + ")"; x.lineWidth = 2; x.stroke();
    const ex = X(pts.length - 1), ey = Y(pts[pts.length - 1]);
    x.fillStyle = "rgb(" + coul + ")"; x.beginPath(); x.arc(ex, ey, 3.5, 0, 7); x.fill();
  }

  /* ==================== LE SECOND REGARD ==================== */
  function peintSecond(){
    const v = G().v;
    const quatre = $("tmQuatre"), box = $("tmRegles");
    if(!v){ quatre.innerHTML = ""; box.innerHTML = '<div class="tm-vide">' + esc(G().err ? t("horsLigne", G().err) : t("rienLu")) + "</div>"; $("tmSlN").textContent = "—"; return; }
    const o = v.ombres || {};
    $("tmSlN").textContent = num(o.jugees) != null ? t("slN", o.jugees, o.enAttente || 0) : "—";
    const l = v.audit || [];
    const ref = l.find(x => x.cle === "achete ou retenu");
    const regles = l.filter(x => x !== ref);
    const refP = ref ? ref.partMontes : null;
    const tu = (k, val, sous, cl) => '<div class="tm-tuile"><small>' + esc(k) + '</small><b class="' + (cl || "") + '">' + esc(val) + "</b><span>" + esc(sous || "") + "</span></div>";
    const sm = regles.reduce((s, x) => s + (x.montes || 0), 0), se = regles.reduce((s, x) => s + (x.effondres || 0), 0);
    const cher = x => refP != null && x.n >= SECOND_ASSEZ && x.partMontes >= refP + 10;
    const protege = x => refP != null && x.n >= SECOND_ASSEZ && x.partMontes <= refP - 15;
    quatre.innerHTML = tu(t("q1"), ref ? entier(ref.montes) : t("na"), ref ? t("q1s", ref.montes, entier(ref.n)) : "", "tm-up")
      + tu(t("q2"), regles.length ? entier(sm) : t("na"), t("q2s"), "tm-dn")
      + tu(t("q3"), regles.length ? entier(se) : t("na"), t("q3s"), "tm-up")
      + tu(t("q4"), refP != null ? String(regles.filter(cher).length) + " / " + regles.length : t("na"), t("q4s"));
    if(!l.length){ box.innerHTML = '<div class="tm-vide">' + esc(t("pasAudit")) + "</div>"; return; }
    const tous = (ref ? [ref] : []).concat(regles.slice().sort((a, b) => (b.partMontes || 0) - (a.partMontes || 0)));
    const ordre = DEPLIE.regles ? tous : tous.slice(0, 8);
    const S = structure(v);
    box.innerHTML = ordre.map(x => {
      const i = String(x.cle).indexOf(" · "), qui = i > 0 ? x.cle.slice(0, i) : "", quoi = i > 0 ? x.cle.slice(i + 3) : x.cle;
      const a = S.par[qui];
      let verdict;
      if(x === ref) verdict = pastille(t("vRefCourt"), "tm-p-bleu");
      else if(x.n < SECOND_ASSEZ) verdict = pastille(t("vPeu", x.n), "");
      else if(cher(x)) verdict = pastille(t("vFaux"), "tm-p-rouge");
      else if(protege(x)) verdict = pastille(t("vJuste"), "tm-p-vert");
      else verdict = pastille(t("vPareil"), "");
      return '<div class="tm-regle"><span class="q"><b>' + (a ? esc(a.emoji) + " " : "") + esc(x === ref ? t("vRef") : en(quoi)) + "</b><span>" + esc((a ? a.nom + " · " : "") + t("regleS", entier(x.n), entier(x.montes), entier(x.effondres), pct(x.moyenne))) + "</span></span>"
        + '<span><div class="tm-petit" style="margin:0 0 4px">' + esc(t("montesP", x.partMontes)) + '</div><div class="tm-duo" title="' + esc(refP != null ? t("refMarque", refP) : "") + '"><i style="width:' + Math.min(100, x.partMontes || 0) + '%"></i>'
        + (refP != null ? '<em style="left:' + Math.min(100, refP) + '%"></em>' : "") + "</div></span><span>" + verdict + "</span></div>";
    }).join("") + (tous.length > 8 ? boutonPlus("regles", tous.length) : "");
  }

  /* ==================== CE QUE LA COLONIE APPREND ==================== */
  function peintApprend(){
    const v = G().v, box = $("tmLecons");
    if(!v){ box.innerHTML = '<div class="tm-vide">' + esc(G().err ? t("horsLigne", G().err) : t("rienLu")) + "</div>"; $("tmAppN").textContent = "—"; peintEvts(); return; }
    const S = structure(v), ag = v.agents || {};
    const cartes = [];
    const avec = S.tous.filter(a => ag[a.key] && (ag[a.key].lecons || []).length);
    (DEPLIE.lecons ? avec : avec.slice(0, 5)).forEach(a => {
      const x = ag[a.key];
      cartes.push('<div class="tm-carte"><div class="tm-titre" style="margin-bottom:8px"><h2 style="font-size:12px;letter-spacing:1px">' + esc(a.emoji + " " + a.nom) + '</h2><span class="tm-n">' + esc(t("obsT", x.obs || 0)) + "</span></div>"
        + x.lecons.slice(0, 3).map(l => {
          const peu = l.n < LECON_ASSEZ;
          return '<div class="tm-regle" style="grid-template-columns:minmax(0,1fr) auto;padding:7px 0"><span class="q"><b>' + esc(en(l.quoi)) + "</b><span>" + esc(Math.round(l.n) + " obs" + (peu ? " · " + t("peu") : "") + (l.nonLue ? " · " + t("lectureRatee") : "")) + "</span></span>"
            + '<b class="mono ' + (peu || l.nonLue ? "tm-mu" : l.moyenne >= 0 ? "tm-up" : "tm-dn") + '">' + esc(peu ? "—" : pct(l.moyenne)) + "</b></div>";
        }).join("") + "</div>");
    });
    const bornes = v.bornes || [];
    if(bornes.length) cartes.push('<div class="tm-carte"><div class="tm-titre" style="margin-bottom:8px"><h2 style="font-size:12px;letter-spacing:1px">📐 ' + esc(t("bornesT")) + "</h2></div>"
      + bornes.map(b => {
        const f = num(b.min) != null && num(b.max) != null && b.max > b.min ? (b.valeur - b.min) / (b.max - b.min) : null;
        return '<div class="tm-borne" style="padding:6px 0"><div class="tm-barre" style="margin:0"><div class="l"><span>' + esc(nomBorne(b.cle)) + " · " + esc(b.appris ? t("appris") : t("defaut")) + "</span><b>" + esc(entier(b.valeur)) + " (" + esc(entier(b.min)) + "–" + esc(entier(b.max)) + ")</b></div></div>"
          + '<div class="j">' + (f == null ? "" : '<i style="left:' + Math.max(0, Math.min(100, f * 100)).toFixed(0) + '%"></i>') + "</div></div>";
      }).join("") + "</div>");
    const div = [];
    if(v.tenue && num(v.tenue.min) != null) div.push("<b>⏱ " + esc(t("tenueT")) + "</b><span>" + esc(t("tenueS", v.tenue.min, v.tenue.n || 0)) + "</span>");
    if(v.banque && v.banque.methode) div.push("<b>🏦 " + esc(t("banqueT")) + "</b><span>" + esc(t("banqueS", v.banque.methode, v.banque.regime || "—", !!v.banque.appris)) + "</span>");
    if(v.conseiller){
      const cs = v.conseiller, au = cs.audit || {};
      div.push("<b>🧠 " + esc(t("conseilTT")) + "</b><span>" + esc(cs.actif ? t("conseilS", cs.modele || "?", entier(cs.rendus || 0), au.detail || au.verdict || "—") : t("conseilOff")) + "</span>");
    }
    if(div.length) cartes.push('<div class="tm-carte">' + div.map(d => '<div class="tm-regle" style="grid-template-columns:minmax(0,1fr)"><span class="q">' + d + "</span></div>").join("") + "</div>");
    box.innerHTML = (cartes.length ? cartes.join("") : '<div class="tm-vide">' + esc(t("na")) + "</div>")
      + (avec.length > 5 ? '<div style="grid-column:1/-1">' + boutonPlus("lecons", avec.length) + "</div>" : "");
    $("tmAppN").textContent = t("appN", avec.length);
    peintEvts();
  }
  function peintEvts(){
    const v = G().v, box = $("tmEvts");
    if(!v){ box.innerHTML = '<div class="tm-vide">' + esc(G().err ? t("horsLigne", G().err) : t("rienLu")) + "</div>"; $("tmEvtN").textContent = "—"; return; }
    const j = (v.journalStructure || []).slice().sort((a, b) => b.t - a.t);
    $("tmEvtN").textContent = t("evtN", j.length);
    const CL = { naissance:"tm-p-vert", retrait:"tm-p-rouge", ordre:"tm-p-bleu", regard:"tm-p-violet" };
    const jv = DEPLIE.evts ? j : j.slice(0, 4);
    box.innerHTML = j.length ? jv.map(e => '<div class="tm-evt"><span class="h">' + esc(jourHeure(e.t)) + "</span><span>" + pastille(String(e.quoi || "event").toUpperCase(), CL[e.quoi] || "") + " " + esc(e.txt) + "</span></div>").join("") + (j.length > 4 ? boutonPlus("evts", j.length) : "")
      : '<div class="tm-vide">' + esc(t("aucunEvt")) + "</div>";
  }

  /* ==================== LA PREUVE ==================== */
  let filtrePreuve = "tout", pagePreuve = 0;
  function preuves(v){
    const S = structure(v), out = [];
    for(const s of (v.signaux || [])){
      if(s.k === "achat") out.push({ t:s.t, type:"signal", qui:symLien(s.sym, s.adr, s.pool), quoi:t("pAchat", num(s.score), num(s.mise) != null ? s.mise.toFixed(2) : null, s.mc ? compact(s.mc) : "") });
      else out.push({ t:s.t, type:"signal", qui:symLien(s.sym, s.adr, s.pool), quoi:t("pVente", pct(num(s.r)), s.comment || "") });
    }
    for(const l of ((v.carnet || {}).lignes || [])) out.push({ t:l.t, type:"trade", qui:symLien(l.sym, l.adr), quoi:t("pFerme", pct(l.r), usd(l.gain, true), num(l.tenue) != null ? l.tenue : "?", [l.par, l.raison].filter(Boolean).join(" · ") || "—") });
    const tour = v.dernierTour || v.maj || 0;
    for(const c of (v.candidats || [])) if(c.quiRefuse) out.push({ t:tour, type:"refus", qui:symLien(c.sym, c.addr, c.pool), quoi:((S.par[c.quiRefuse] || {}).nom || c.quiRefuse) + " · " + (c.refus || "") });
    for(const s of (v.surveillance || [])) if(s.dernier) out.push({ t:s.dernier, type:"refus", qui:symLien(s.sym, s.addr), quoi:t("pVeille", s.verdict || "—") });
    for(const j of (v.journalStructure || [])) out.push({ t:j.t, type:"appris", qui:esc(String(j.quoi || "").toUpperCase()), quoi:j.txt || "" });
    return out.filter(x => x.t).sort((a, b) => b.t - a.t);
  }
  function peintPreuve(){
    const v = G().v, tb = $("tmPreuve");
    document.querySelectorAll("#tmPrF [data-p]").forEach(b => b.setAttribute("aria-pressed", b.dataset.p === filtrePreuve ? "true" : "false"));
    if(!v){ tb.innerHTML = '<tr><td colspan="4" class="tm-vide">' + esc(G().err ? t("horsLigne", G().err) : t("rienLu")) + "</td></tr>"; $("tmPrN").textContent = "—"; $("tmPrP").innerHTML = ""; return; }
    const tout = preuves(v), l = filtrePreuve === "tout" ? tout : tout.filter(x => x.type === filtrePreuve);
    $("tmPrN").textContent = t("prN", l.length);
    const PAR = 15, nb = Math.max(1, Math.ceil(l.length / PAR));
    pagePreuve = Math.min(pagePreuve, nb - 1);
    const CL = { signal:"tm-p-ambre", trade:"tm-p-vert", refus:"tm-p-rouge", appris:"tm-p-violet" };
    const TX = { signal:"pSignal", trade:"pTrade", refus:"pRefus", appris:"pAppris" };
    const vue = l.slice(pagePreuve * PAR, pagePreuve * PAR + PAR);
    tb.innerHTML = vue.length ? vue.map(x => "<tr><td>" + esc(jourHeure(x.t)) + "</td><td>" + pastille(t(TX[x.type]), CL[x.type]) + "</td><td>" + x.qui + "</td><td>" + esc(x.quoi) + "</td></tr>").join("")
      : '<tr><td colspan="4" class="tm-vide">' + esc(t("aucunePreuve")) + "</td></tr>";
    pages("tmPrP", pagePreuve, nb, p => { pagePreuve = p; peintPreuve(); });
  }

  /* ==================== L'INFRASTRUCTURE ==================== */
  function peintInfra(){
    const v = G().v, box = $("tmInfra");
    if(!v){ box.innerHTML = '<div class="tm-vide">' + esc(G().err ? t("horsLigne", G().err) : t("rienLu")) + "</div>"; $("tmInfN").textContent = "—"; $("tmHors").textContent = ""; return; }
    const s = santeServices(v), u = s.filter(x => x.etat !== "rien");
    $("tmInfN").textContent = u.length ? t("infN", u.filter(x => x.etat === "ok").length, u.length) : "—";
    const cg = v.coingecko || null;
    const aVoir = DEPLIE.infra ? s : s.filter(x => x.etat !== "ok");
    box.innerHTML = s.length ? (aVoir.length ? "" : '<div class="tm-petit" style="grid-column:1/-1;margin:0">' + esc(t("infraToutVa", u.length)) + "</div>") + aVoir.map(x => {
      let sous = x.etat === "rien" ? t("srvJamais") : t("srvS", Math.round(x.part * 100), entier(x.essais), x.dernier ? ilya(x.dernier) : t("jamais"));
      if(x.cle === "coingecko" && cg && cg.porte) sous += " · " + t("cgT", cg.porte);
      const echec = x.dernierEchec && x.etat !== "ok" ? '<span style="color:var(--t-dn)">' + esc(String(x.dernierEchec).slice(0, 120)) + "</span>" : "";
      return '<div class="tm-service"><i class="' + (x.etat === "rien" ? "" : x.etat) + '" aria-hidden="true"></i><div><b>' + esc(x.nom) + "</b><span>" + esc(x.quoi || "") + "</span><span>" + esc(sous) + "</span>" + echec + "</div>"
        + "<em>" + esc(x.etat === "rien" ? "—" : Math.round(x.part * 100) + "%") + "</em></div>";
    }).join("") + (aVoir.length < s.length || DEPLIE.infra ? '<div style="grid-column:1/-1">' + boutonPlus("infra", s.length) + "</div>" : "") : '<div class="tm-vide">' + esc(t("na")) + "</div>";
    const hs = v.horsService || {};
    const k = Object.keys(hs);
    $("tmHors").textContent = k.length ? t("horsT") + k.map(x => hs[x]).join(" · ") : "";
  }

  /* ==================== LA LANGUE ==================== */
  const EN = {};
  document.querySelectorAll("#tm [data-tt], #tmSuite [data-tt]").forEach(e => { if(!(e.dataset.tt in EN)) EN[e.dataset.tt] = e.innerHTML; });
  const EN_PH = {};
  document.querySelectorAll("[data-tt-ph]").forEach(e => { EN_PH[e.dataset.ttPh] = e.getAttribute("placeholder"); });
  function poseLangue(){
    const fr = G().fr;
    document.querySelectorAll("#tm [data-tt], #tmSuite [data-tt]").forEach(e => {
      const k = e.dataset.tt, f = P[k] && P[k][1];
      /* un « Loading… » deja remplace par une donnee n'est plus touche */
      if(k === "chargement" && !e.isConnected) return;
      e.innerHTML = fr && f ? f : EN[k];
    });
    document.querySelectorAll("[data-tt-ph]").forEach(e => { const k = e.dataset.ttPh, f = P[k] && P[k][1]; e.setAttribute("placeholder", fr && f ? f : EN_PH[k]); });
  }

  /* ==================== LA NAVIGATION ==================== */
  function hauteurBarre(){
    const b = document.querySelector(".sw-haut");
    const h = b && getComputedStyle(b).position === "sticky" ? b.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty("--t-haut", Math.round(h) + "px");
    /* La barre du bas (telephone) : `stakebubble.js` publie `--swbb-h` pour
       exactement ca — ses bulles et ses toasts se posent au-dessus. Sans elle,
       les deux bulles couvraient LEARN et PROOF. */
    const bn = $("tmBnav");
    const hb = bn && getComputedStyle(bn).display !== "none" ? bn.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty("--swbb-h", Math.round(hb) + "px");
  }
  hauteurBarre();
  addEventListener("resize", hauteurBarre);
  const SECTIONS = ["tm-live", "tm-colony", "tm-market", "tm-trades", "tm-learning", "tm-proof"];
  function actif(id){ document.querySelectorAll(".tm-nav a, .tm-bnav a").forEach(a => a.classList.toggle("on", a.dataset.s === id)); }
  if("IntersectionObserver" in window){
    const vis = {};
    const io = new IntersectionObserver(es => {
      es.forEach(e => { vis[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0; });
      let best = null, r = 0;
      SECTIONS.forEach(id => { if((vis[id] || 0) > r){ r = vis[id]; best = id; } });
      if(best) actif(best);
    }, { threshold:[0, .1, .25, .5], rootMargin:"-30% 0px -50% 0px" });
    SECTIONS.forEach(id => { const e = $(id); if(e) io.observe(e); });
  }
  actif("tm-live");

  /* ==================== LES GESTES ==================== */
  $("tmFiltres").addEventListener("click", e => {
    const b = e.target.closest("[data-f]"); if(!b) return;
    filtre = b.dataset.f;
    document.querySelectorAll("#tmFiltres [data-f]").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    peintMarche();
  });
  $("tmCherche").addEventListener("input", peintMarche);
  function choisit(tr){
    if(!tr || !tr.dataset.adr) return;
    choisi = tr.dataset.adr;
    document.querySelectorAll("#tmLignes tr").forEach(x => x.classList.toggle("choisi", x === tr));
    const v = G().v; if(!v) return;
    const x = lignesMarche(v).find(y => (y.adr || y.sym) === choisi);
    if(x) peintAnalyse(x, v);
    if(getComputedStyle($("tmAnalyse")).position !== "sticky") $("tmAnalyse").scrollIntoView({ block:"nearest", behavior: RM ? "auto" : "smooth" });
  }
  $("tmLignes").addEventListener("click", e => choisit(e.target.closest("tr")));
  $("tmLignes").addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); choisit(e.target.closest("tr")); } });
  document.querySelectorAll("#tmBacktest [data-w]").forEach(b => b.addEventListener("click", () => {
    fenetre = Number(b.dataset.w); const v = G().v;
    peintBacktest(v || {}, v ? ((v.carnet || {}).lignes || []).slice().sort((a, c) => (c.t || 0) - (a.t || 0)) : []);
  }));
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest(".tm-plus");
    if(b){ DEPLIE[b.dataset.plus] = !DEPLIE[b.dataset.plus]; ({ regles:peintSecond, evts:peintEvts, infra:peintInfra, lecons:peintApprend })[b.dataset.plus](); return; }
    const f = e.target.closest && e.target.closest(".tm-fiche");
    if(f && !e.target.closest("a")){ const k = f.dataset.k; fichesOuvertes.has(k) ? fichesOuvertes.delete(k) : fichesOuvertes.add(k); peintFiches(); }
  });
  $("tmFiches").addEventListener("keydown", e => {
    const f = e.target.closest(".tm-fiche"); if(!f || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault(); f.click();
    const g = document.querySelector('.tm-fiche[data-k="' + f.dataset.k + '"]'); if(g) g.focus();
  });
  $("tmPrF").addEventListener("click", e => {
    const b = e.target.closest("[data-p]"); if(!b) return;
    filtrePreuve = b.dataset.p; pagePreuve = 0; peintPreuve();
  });

  /* ==================== TOUT REPEINDRE ==================== */
  function peintTout(){
    const zones = [peintHero, peintConstellation, peintFil, peintSante, peintReseau, peintFiches, peintMarche, peintTrades, peintSecond, peintApprend, peintPreuve, peintInfra];
    /* Une zone qui casse ne doit pas emporter les autres : elle se tait, les
       autres continuent — et l'erreur remonte a la console pour qu'on la voie. */
    zones.forEach(f => { try{ f(); }catch(e){ setTimeout(() => { throw e; }); } });
  }
  addEventListener("swoge:vue", () => { peintTout(); try{ animeEvenements(); }catch(e){ setTimeout(() => { throw e; }); } });
  addEventListener("swoge:langue", () => { poseLangue(); peintTout(); });
  addEventListener("resize", () => { const v = G().v; if(v){ const c = (v.courbe || []).filter(x => num(x) != null); dessineCourbe(c.length > 1 ? c : null, v.depart); } });
  /* Les « il y a » et le battement vieillissent sans nouvelle vue. */
  setInterval(() => { if(document.visibilityState !== "hidden"){ try{ peintHero(); peintSante(); }catch(e){} } }, 15000);
  poseLangue();
  peintTout();
  if(G().v) animeEvenements();
  window.SwogeTerminal = { peintTout, en };
  try{ peintAudit(); }catch(e){}   /* la console relit ses cles avec `en` des qu'il existe */
})();
