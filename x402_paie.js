/* ==========================================================================
 * PAYER UNE REQUETE x402 DEPUIS UNE PAGE, EN USDC (BASE OU SOLANA)
 *
 * Demande du proprietaire, 29 septembre 2026 : « le $SWOGE devrait etre une
 * option, et pouvoir payer facilement en signature wallet avec les autres
 * devises ». Le paiement de la boutique eSIM (swoge_esim.html), sorti en un
 * fichier que toute page peut charger :
 *
 *   SwogePaie.paie({ reseau: "base" | "solana", serveur, appel, statut })
 *     appel(entetes) → fetch(...) : la MEME requete, sans puis avec
 *                      l'en-tete PAYMENT-SIGNATURE ;
 *     rend la reponse finale (Response) apres signature.
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
        return o.appel({ "payment-signature": b64({ x402Version: 2, resource: req.resource, accepted: acc, payload: { signature: signature, authorization: auth }, extensions: req.extensions }) });
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
      return o.appel({ "payment-signature": b64({ x402Version: 2, resource: req.resource, accepted: acc, payload: { transaction: racine.SwogeSolana.b64(new Uint8Array(signe)) }, extensions: req.extensions }) });
    }).then(function (r) {
      if (r.status === 200 || sansMemo || !lu || lu.programmes.length <= 6) return r;
      /* Le portefeuille a ajoute des instructions (Phantom : jusqu'a 3) et le facilitateur plafonne a 6 : une fois encore, sans le memo. */
      return r.clone().text().then(function (t) {
        if (!/smart_wallet|instructions_length/.test(t)) return r;
        statut("Your wallet added instructions the facilitator refuses - sign once more (a shorter transaction)…");
        return solUneFois(o, true);
      });
    });
  }
  function paieSolana(o) { return solConnecte(o).then(function () { return solUneFois(o, false); }); }

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
    paie: function (o) { return o.reseau === "solana" ? paieSolana(o) : paieBase(o); },
    lit: lit,
    solanaDispo: function () { return etat.portefeuilles.filter(solPeutSigner).length > 0; },
    baseDispo: function () { return !!racine.ethereum; }
  };
})(typeof window !== "undefined" ? window : this);
