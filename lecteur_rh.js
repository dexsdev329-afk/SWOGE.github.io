/* ============================================================================
 * LE LECTEUR DE ROBINHOOD CHAIN DES PAGES DU LAUNCHPAD (18/10/2026)
 *
 * ---- CE QUI EST ARRIVE ----
 * Le proprietaire ouvrait Explore et lisait, par moments : « The launchpads
 * could not be read from the Robinhood Chain node. Press Reload. », sans le
 * jeton V5 SWAI. Mesures du 18/10/2026 :
 *   - depuis le serveur (pas de CORS), 40 eth_getLogs simultanes de tranches
 *     de 9 M de blocs : 40 reussis, le plus lent en 204 ms ;
 *   - depuis un Chromium sans tete, CHAQUE eth_getLogs refuse par le
 *     navigateur : « Access-Control-Allow-Origin header contains multiple
 *     values '*,*' ». Note du 14/10 dans launchpad.html (parTranches) : le meme
 *     refus, vu par de vrais joueurs.
 * Le noeud repond ; c'est le navigateur qui jette sa reponse. Une relecture
 * apres 800 ms retombait sur le meme en-tete double.
 *
 * ---- CE QUE FAIT CE LECTEUR ----
 *   1. Il lit le noeud officiel d'abord.
 *   2. Sur une panne de TRANSPORT (fetch refuse : CORS, reseau coupe ; delai
 *      depasse ; HTTP 429 ou 5xx ; reponse qui n'est pas du JSON), il repasse
 *      LA MEME requete par le relais du serveur (/rpc/rh, lecture seule), puis
 *      reste sur le relais COLLE_MS pour le reste de la session de la page.
 *      Une erreur du noeud lui-meme (revert, plage refusee) n'est PAS une
 *      panne : elle remonte telle quelle, le relais rendrait la meme.
 *   3. Il ne laisse que ENVOL_MAX eth_getLogs en vol a la fois. Explore en
 *      tirait plus de 40 d'un coup (9 lanceurs x 3 evenements x tranches de
 *      9 M de blocs, plus les jetons V5) ; le relais compte 5 appels par
 *      seconde et par IP en regime : une rafale de 40 le viderait pour rien.
 *   4. Il dit qui a servi (« node » / « relay ») dans l'attribut
 *      data-rpc-source de <html> — pour le debogage seulement, jamais aux
 *      joueurs.
 * Il ne signe rien : ce n'est qu'un fournisseur de LECTURE. Le portefeuille
 * signe, et eth_sendRawTransaction n'est de toute facon pas relaye.
 * ==========================================================================*/
(function (racine) {
  "use strict";
  /* CHOISI : 5 minutes collees au relais. Assez pour qu'un chargement d'Explore
     et la fiche ouverte ensuite ne repaient pas chacun le detour par un noeud
     qu'on vient de voir refuse ; assez court pour revenir au noeud officiel
     des qu'il repond proprement. */
  var COLLE_MS = 5 * 60 * 1000;
  /* CHOISI : 6 eth_getLogs en vol. Le noeud en a tenu 40 en 204 ms (18/10) :
     la borne ne protege pas le noeud, elle garde la page sous le debit du
     relais et laisse passer les eth_call de la grille entre deux tranches. */
  var ENVOL_MAX = 6;
  var RELAIS_DEFAUT = "https://web-production-220a3.up.railway.app/rpc/rh";

  /* Une panne de transport, pas une reponse du noeud. */
  function panne(e) {
    if (!e) return false;
    if (e instanceof TypeError) return true;                        // fetch refuse (CORS, reseau)
    var c = e.code;
    if (c === "NETWORK_ERROR" || c === "TIMEOUT") return true;
    if (c === "SERVER_ERROR") {
      if (e.reason === "missing response" || e.reason === "failed response") return true;   // aucune reponse lisible
      var s = Number(e.status);
      if (s === 429 || s >= 500) return true;                       // « bad response » : trop de requetes, passerelle
      if (e.error && e.error.reason === "invalid JSON") return true; // une page HTML a la place du JSON
    }
    return false;
  }

  function cree(o) {
    o = o || {};
    var E = o.ethers || racine.ethers;
    var P = E.providers.StaticJsonRpcProvider;
    var chainId = o.chainId || 4663;
    var relaisUrl = o.relais || RELAIS_DEFAUT;
    var colle = o.colleMs != null ? o.colleMs : COLLE_MS;
    var envolMax = o.envolMax || ENVOL_MAX;
    var maintenant = o.maintenant || function () { return Date.now(); };
    /* 429 : ethers attendrait et relirait jusqu'a 12 fois le meme noeud ; on
       prefere passer tout de suite par le relais. */
    var sansAttente = function () { return Promise.resolve(false); };
    var relais = new P({ url: relaisUrl, throttleCallback: sansAttente }, chainId);
    var surRelaisJusqua = 0, envol = 0, file = [];
    var compte = { node: 0, relay: 0, bascules: 0 };

    function marque(src) {
      compte[src]++;
      try { if (typeof document !== "undefined") document.documentElement.setAttribute("data-rpc-source", src); } catch (e) {}
      if (o.surSource) { try { o.surSource(src); } catch (e) {} }
    }
    function prendPlace() {
      if (envol < envolMax) { envol++; return Promise.resolve(); }
      return new Promise(function (ok) { file.push(ok); });
    }
    function rendPlace() {
      var suivant = file.shift();
      if (suivant) suivant(); else envol--;
    }

    class LecteurRh extends P {
      constructor() { super({ url: o.url, throttleCallback: sansAttente }, chainId); }
      async send(method, params) {
        var borne = method === "eth_getLogs";
        if (borne) await prendPlace();
        try { return await this._envoie(method, params); }
        finally { if (borne) rendPlace(); }
      }
      async _envoie(method, params) {
        var noeud = super.send.bind(this);
        if (maintenant() < surRelaisJusqua) {
          try { var r0 = await relais.send(method, params); marque("relay"); return r0; }
          catch (e) {
            if (!panne(e)) throw e;
            /* Le relais aussi est injoignable : le noeud, une fois. */
            var r1 = await noeud(method, params); marque("node"); return r1;
          }
        }
        try { var r = await noeud(method, params); marque("node"); return r; }
        catch (e) {
          if (!panne(e)) throw e;
          surRelaisJusqua = maintenant() + colle; compte.bascules++;
          var r2 = await relais.send(method, params); marque("relay"); return r2;
        }
      }
    }
    var L = new LecteurRh();
    L.sources = compte;
    L.surRelais = function () { return maintenant() < surRelaisJusqua; };
    return L;
  }

  racine.SwogeLecteurRh = { cree: cree, panne: panne, COLLE_MS: COLLE_MS, ENVOL_MAX: ENVOL_MAX, RELAIS: RELAIS_DEFAUT };
  if (typeof module !== "undefined" && module.exports) module.exports = racine.SwogeLecteurRh;
})(typeof window !== "undefined" ? window : this);
