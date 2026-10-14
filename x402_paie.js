/* ==========================================================================
 * PAYER UNE REQUETE x402 DEPUIS UNE PAGE, EN USDC (BASE OU SOLANA)
 *
 * Demande du proprietaire, 29 septembre 2026 : « le $SWOGE devrait etre une
 * option, et pouvoir payer facilement en signature wallet avec les autres
 * devises ». Le paiement de la boutique eSIM (swoge_esim.html), sorti en un
 * fichier que toute page peut charger :
 *
 *   SwogePaie.paie({ reseau: "base" | "solana", serveur, appel, statut, montantUsd? })
 *     appel(entetes) → fetch(...) : la MEME requete, sans puis avec
 *                      l'en-tete PAYMENT-SIGNATURE ;
 *     montantUsd     : le montant que le JOUEUR a choisi (une recharge de 5 $) ;
 *                      une demande de paiement qui en sort n'est jamais signee ;
 *     rend la reponse finale (Response) apres signature.
 *   SwogePaie.echec(e, "Not topped up") → la phrase a montrer d'un echec : « not
 *     charged » SEULEMENT pour un echec avant la signature, ou quand le serveur le dit.
 *
 * Base : EIP-3009 transferWithAuthorization, domaine « USD Coin » v2 (lu sur la
 * chaine le 27/09), signe par eth_signTypedData_v4. Solana : Wallet Standard +
 * x402_solana.js (Phantom d'abord) ; un portefeuille qui ajoute des
 * instructions au-dela de ce que le facilitateur accepte : une seconde
 * signature sans le memo. La page ne voit jamais de cle ; le serveur verifie
 * tout (montant, destinataire, reseau) avant de servir.
 * ======================================================================== */
(function (racine) {
  "use strict";
  var USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", BASE_ID = "0x2105";
  var SOL = { reseau: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", chaine: "solana:mainnet" };
  var etat = { compte: null, portefeuilles: [], sol: null, solCompte: null };

  /* Les portefeuilles Solana s'annoncent (Wallet Standard) : on ecoute des le chargement. */
  (function () {
    function enregistre() { for (var i = 0; i < arguments.length; i++) if (etat.portefeuilles.indexOf(arguments[i]) < 0) etat.portefeuilles.push(arguments[i]); return function () {}; }
    var api = Object.freeze({ register: enregistre });
    try { racine.addEventListener("wallet-standard:register-wallet", function (e) { try { e.detail(api); } catch (x) {} }); } catch (e) {}
    try { var ev = new Event("wallet-standard:app-ready"); Object.defineProperty(ev, "detail", { value: api }); racine.dispatchEvent(ev); } catch (e) {}
  })();

  function b64(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
  function de64(s) { return JSON.parse(decodeURIComponent(escape(atob(s)))); }
  function hex32() { var a = new Uint8Array(32); crypto.getRandomValues(a); return "0x" + Array.prototype.map.call(a, function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
  function adresseOk(a) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || "")); }
  function erreur(t) { return new Error(t); }
  /* ---- LE MONTANT SIGNE EST CELUI QUE LE JOUEUR A CHOISI ----
   * Releve du 13/10 (studio.html?server=<hote>) : la page faisait signer le montant ET le
   * destinataire que la reponse 402 annoncait, sans les comparer a rien — 5 000 USDC demandes
   * pour une recharge de 5 $. Quand la page dit ce que le joueur a choisi (`montantUsd`), la
   * demande doit tomber entre ce montant et ce montant + FRAIS_MAX : le serveur y ajoute ses frais
   * de reglement (x402.js : FRAIS_CDP_USD 0,001 $ sur Base, FRAIS_SOLANA_USD 0,002 $ sur Solana),
   * soit 5,001 USDC sur Base pour 5 $. Un centime de plafond : cinq fois le plus cher des deux.
   * Le destinataire n'est pas epingle ici : il vient de la configuration de l'hote
   * (X402_BASE_PAYTO, X402_SOLANA_PAYTO), qu'aucun depot ne porte. */
  var FRAIS_MAX = 10000;   /* 0,01 USDC, en unites de 6 decimales */
  function montantAttendu(o, acc) {
    if (o.montantUsd == null) return;
    var voulu = Math.round(Number(o.montantUsd) * 1e6), demande = Number(acc.amount);
    if (!(voulu > 0) || !(demande >= voulu && demande <= voulu + FRAIS_MAX))
      throw erreur("the payment request (" + (demande / 1e6) + " USDC) does not match the $" + (voulu / 1e6).toFixed(2) + " you chose - nothing was signed");
  }

  /* La demande de paiement : la requete SANS signature doit rendre un 402 avec PAYMENT-REQUIRED. */
  function demande(o) {
    return o.appel({}).then(function (r) {
      if (r.status !== 402) return r.text().then(function (t) { var c = null; try { c = JSON.parse(t); } catch (e) {}
        throw erreur((c && c.raison) || "the server did not ask for a payment (HTTP " + r.status + ")"); });
      var h = r.headers.get("payment-required");
      if (!h) throw erreur("no payment request from the server");
      return de64(h);
    });
  }

  function versBase(eth) {
    return eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_ID }] })["catch"](function (e) {
      if (!e || e.code !== 4902) throw e;
      return eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: BASE_ID, chainName: "Base",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://mainnet.base.org"], blockExplorerUrls: ["https://basescan.org"] }] });
    });
  }

  function paieBase(o) {
    var eth = racine.ethereum, statut = o.statut || function () {};
    if (!eth) return Promise.reject(erreur("No wallet found in this browser - open this page inside your wallet app."));
    statut("Connecting your wallet on Base…");
    return eth.request({ method: "eth_requestAccounts" }).then(function (l) {
      if (!l || !adresseOk(l[0])) throw erreur("no account");
      etat.compte = l[0];
      return versBase(eth);
    }).then(function () {
      statut("Asking for the payment request…");
      return demande(o);
    }).then(function (req) {
      var acc = (req.accepts || []).filter(function (a) { return a.network === "eip155:8453"; })[0];
      if (!acc) throw erreur("Base is not available right now - try Solana");
      if (String(acc.asset).toLowerCase() !== USDC_BASE.toLowerCase() || !adresseOk(acc.payTo) || !/^[0-9]+$/.test(String(acc.amount))) throw erreur("unexpected payment request");
      montantAttendu(o, acc);
      var s = Math.floor(Date.now() / 1000);
      var auth = { from: etat.compte, to: acc.payTo, value: String(acc.amount), validAfter: String(s - 600),
                   validBefore: String(s + Math.max(30, (Number(acc.maxTimeoutSeconds) || 120) - 20)), nonce: hex32() };
      var extra = acc.extra || {};
      var typed = { types: {
          EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
          TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
        primaryType: "TransferWithAuthorization",
        domain: { name: extra.name || "USD Coin", version: extra.version || "2", chainId: 8453, verifyingContract: acc.asset }, message: auth };
      statut("Sign in your wallet: " + (Number(acc.amount) / 1e6) + " USDC to SWOGE (" + acc.payTo.slice(0, 6) + "…" + acc.payTo.slice(-4) + ").");
      return eth.request({ method: "eth_signTypedData_v4", params: [etat.compte, JSON.stringify(typed)] }).then(function (signature) {
        statut("Signed. The payment settles - a few seconds…");
        return envoieSigne(o, { "payment-signature": b64({ x402Version: 2, resource: req.resource, accepted: acc, payload: { signature: signature, authorization: auth }, extensions: req.extensions }) }, true);
      });
    });
  }

  function solPeutSigner(w) { var f = w && w.features || {}; return !!(f["solana:signTransaction"] && f["standard:connect"]) && (!w.chains || w.chains.indexOf(SOL.chaine) >= 0); }
  function solConnecte(o) {
    if (etat.sol && etat.solCompte) return Promise.resolve();
    var l = etat.portefeuilles.filter(solPeutSigner);
    l.sort(function (a, b) { return (/phantom/i.test(b.name) ? 1 : 0) - (/phantom/i.test(a.name) ? 1 : 0); });
    if (!l.length) return Promise.reject(erreur("No Solana wallet found in this browser - install Phantom, Solflare or Backpack, or open this page in its app."));
    var choix = l.length > 1 && o.choisit ? Promise.resolve(o.choisit(l)) : Promise.resolve(l[0]);
    return choix.then(function (w) {
      if (!w) throw erreur("no wallet chosen");
      (o.statut || function () {})("Connecting to " + String(w.name || "your wallet").slice(0, 40) + "…");
      return Promise.resolve(w.features["standard:connect"].connect()).then(function (r) {
        var c = (r && r.accounts && r.accounts[0]) || (w.accounts && w.accounts[0]);
        if (!c || !c.address) throw erreur("no account");
        etat.sol = w; etat.solCompte = c;
      });
    });
  }
  function solBlockhash(o, acc) {
    return fetch(o.serveur + "/agentic/solana/blockhash", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ok && d.blockhash) return d.blockhash;
      if (acc.extra && acc.extra.recentBlockhash) return acc.extra.recentBlockhash;
      throw erreur("no recent Solana blockhash - try again");
    });
  }
  function solUneFois(o, sansMemo) {
    var req, acc, lu = null, statut = o.statut || function () {};
    if (!racine.SwogeSolana) return Promise.reject(erreur("Solana payments are not loaded on this page"));
    statut("Asking for the payment request…");
    return demande(o).then(function (r) {
      req = r;
      acc = (req.accepts || []).filter(function (x) { return x.network === SOL.reseau; })[0];
      if (!acc) throw erreur("Solana is not available right now - try Base");
      if (acc.asset !== SOL.usdc || !/^[0-9]+$/.test(String(acc.amount)) || !(acc.extra && acc.extra.feePayer)) throw erreur("unexpected payment request");
      montantAttendu(o, acc);
      return solBlockhash(o, acc);
    }).then(function (bh) {
      return racine.SwogeSolana.construit(acc, { payeur: etat.solCompte.address, blockhash: bh, sansMemo: sansMemo });
    }).then(function (t) {
      statut("Approve in your wallet: " + (Number(acc.amount) / 1e6) + " USDC to SWOGE.");
      return etat.sol.features["solana:signTransaction"].signTransaction({ account: etat.solCompte, transaction: t.octets, chain: SOL.chaine });
    }).then(function (sorties) {
      var signe = sorties && sorties[0] && sorties[0].signedTransaction;
      if (!signe || !signe.length) throw erreur("the wallet returned no signed transaction");
      try { lu = racine.SwogeSolana.lit(new Uint8Array(signe)); } catch (e) { lu = null; }
      statut("Signed. The payment settles - a few seconds…");
      return envoieSigne(o, { "payment-signature": b64({ x402Version: 2, resource: req.resource, accepted: acc, payload: { transaction: racine.SwogeSolana.b64(new Uint8Array(signe)) }, extensions: req.extensions }) }, false);
    }).then(function (r) {
      if (r.status === 200 || sansMemo || !lu || lu.programmes.length <= 6) return r;
      /* Le portefeuille a ajoute des instructions (Phantom : jusqu'a 3) et le facilitateur plafonne a 6 : une fois encore, sans le memo. */
      return r.clone().text().then(function (t) {
        if (!/smart_wallet|instructions_length/.test(t)) return r;
        /* Refusee a la verification (avant tout reglement) : la premiere signature n'a rien debite. */
        o._suivi.signe = false;
        statut("Your wallet added instructions the facilitator refuses - sign once more (a shorter transaction)…");
        return solUneFois(o, true);
      });
    });
  }
  function paieSolana(o) { return solConnecte(o).then(function () { return solUneFois(o, false); }); }

  /* ---- APRES LA SIGNATURE : ATTENDRE LA CHAINE, NE JAMAIS CONCLURE « NOT CHARGED » ----
   * Releve du 14/10 (revue de studio.html, sonde s1, 5 cas sur 5) : toute issue autre qu'un 200 apres
   * la signature s'affichait « Not topped up, not charged ». Trois issues reelles du serveur le
   * dementent :
   *  - reglement en attente : 402 + PAYMENT-RESPONSE (settlement_pending ou unexpected_settle_error),
   *    SANS PAYMENT-REQUIRED (x402.js, traite, cas 'attente'). Le credit n'est ajoute que sur le 200
   *    (credits.js, recharge) et le serveur ne reconcilie que la MEME signature representee, pendant
   *    GARDE_ATTENTE_MS = 10 min (x402.js:192, reconcilie). On la represente donc, avec un delai
   *    croissant, jusqu'a 10 min. Solana : le serveur ne reconcilie pas (une signature representee y
   *    est « already presented ») : on ne represente pas, on le dit.
   *  - reglement fait mais credit illisible (502, credits.js) : la phrase du serveur, telle quelle.
   *  - reseau coupe apres l'envoi signe : le serveur a pu regler ; on ne conclut rien.
   * `o._suivi.signe` : vrai des que la requete signee part ; une erreur levee avant porte
   * `avantSignature` (refus du portefeuille, montant hors borne, aucune demande de paiement). */
  var GARDE_MS = 10 * 60 * 1000;
  function delais() { var d = racine.SWOGE_PAIE_DELAIS; return Array.isArray(d) && d.length ? d : [3000, 5000, 10000, 15000, 30000]; }
  function attenteDe(r) {
    if (r.status !== 402 || r.headers.get("payment-required")) return null;
    var h = r.headers.get("payment-response"); if (!h) return null;
    var x = null; try { x = de64(h); } catch (e) { return null; }
    return x && (x.errorReason === "settlement_pending" || x.errorReason === "unexpected_settle_error") ? x : null;
  }
  function apres(t, champs) { var e = erreur(t); e.apresSignature = true; for (var k in champs) e[k] = champs[k]; return e; }
  function envoieSigne(o, entetes, representable) {
    var statut = o.statut || function () {}, debut = Date.now(), essai = 0;
    o._suivi.signe = true;
    function un() {
      return o.appel(entetes).then(function (r) {
        var x = attenteDe(r);
        if (!x) return r;
        var tx = x.transaction || null;
        if (!representable) throw apres("the payment was sent and the chain has not confirmed it yet - don't sign again", { attente: true, tx: tx });
        var d = delais(), pause = d[Math.min(essai, d.length - 1)];
        if (Date.now() - debut + pause > GARDE_MS) throw apres("the payment was sent and the chain has not confirmed it after 10 minutes - don't sign again", { attente: true, tx: tx });
        essai++;
        statut("Payment sent, waiting for the chain - don't sign again…");
        return new Promise(function (s) { setTimeout(s, pause); }).then(un);
      }, function (e) {
        /* La requete signee perdue en route : le serveur a pu la recevoir et la regler. */
        if (e && e.apresSignature) throw e;
        throw apres("the connection dropped after you signed - don't sign again", { reseauCoupe: true });
      });
    }
    return un();
  }
  /* La phrase d'un echec pour le joueur. `quoi` : « Not topped up », « Not bought »… */
  function echec(e, quoi) {
    var m = String(e && (e.message || e.code) || e || "").slice(0, 200);
    if (e && e.avantSignature) return quoi + ", not charged: " + m;
    if (e && (e.attente || e.reseauCoupe))
      return "Payment sent - " + m.replace(/^the payment was sent and /, "") + ". If it went through, your balance shows it within a few minutes; if not, contact support" + (e.tx ? " with transaction " + e.tx : "") + ".";
    /* Le serveur a repondu apres la signature : sa phrase, telle quelle (« nothing was charged »
       quand il le dit, « the payment settled… » sinon), sans rien y ajouter. */
    return quoi + ": " + m;
  }

  /** Lit le corps d'une reponse finale : { ok, corps, tx } (tx : la transaction du PAYMENT-RESPONSE). */
  function lit(r) {
    var rep = r.headers.get("payment-response");
    return r.text().then(function (t) {
      var c = null; try { c = JSON.parse(t); } catch (e) {}
      var tx = null; try { tx = rep ? de64(rep) : null; } catch (e) {}
      return { ok: r.status === 200 && !!(c && c.ok !== false), statut: r.status, corps: c, tx: tx && tx.transaction || null,
        raison: String(c && (c.raison || c.error || c.detail) || ("HTTP " + r.status)).slice(0, 200) };
    });
  }

  racine.SwogePaie = {
    paie: function (o) {
      o._suivi = { signe: false };
      return (o.reseau === "solana" ? paieSolana(o) : paieBase(o))["catch"](function (e) {
        if (o._suivi.signe) throw e;
        var f = e;
        try { e.avantSignature = true; } catch (x) { f = null; }
        if (!f || f.avantSignature !== true) { f = erreur(String(e && (e.message || e.code) || e)); f.avantSignature = true; }
        throw f;
      });
    },
    lit: lit,
    echec: echec,
    solanaDispo: function () { return etat.portefeuilles.filter(solPeutSigner).length > 0; },
    baseDispo: function () { return !!racine.ethereum; }
  };
})(typeof window !== "undefined" ? window : this);
