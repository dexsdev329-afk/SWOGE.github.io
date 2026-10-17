/* ==========================================================================
 * PAYER LE CREDIT EN SOL OU EN USDT, SANS SIGNATURE (14 octobre 2026)
 *
 * Demande du proprietaire : recharger le credit en dollars avec du SOL et de
 * l'USDT, « simple pour l'utilisateur ». Le serveur (credit_depot.js du depot
 * serveur) demande a Relay une adresse de depot a usage unique ; le joueur y
 * envoie ses jetons depuis n'importe quel portefeuille ; Relay les convertit
 * en USDC livre a la tresorerie sur Base ; le serveur relit la livraison sur
 * la chaine et credite CE QUI EST ARRIVE, a la session.
 *
 * La page ne decide de rien : la provenance est choisie dans la liste que
 * rend le serveur, l'adresse et le montant a envoyer viennent de lui, et le
 * credit n'est affiche que quand le serveur dit « credited ». Aucune cle,
 * aucune adresse de depot n'est gardee dans le navigateur (la liste des
 * commandes ouvertes se relit sur le serveur).
 *
 * Usage : un element `<div data-credit-depot></div>` dans le dialogue de
 * recharge ; ce script s'y monte tout seul. Quand un depot est credite :
 * l'evenement `swoge:credit` (detail.balanceUsd) part sur `window`.
 *
 * ---- LE DEPOT AUX PARIS (17 octobre 2026) ----
 * `<div data-credit-depot="bet"></div>` monte le meme panneau sur
 * /bet/deposit (bet_depot.js du serveur) : SOL, USDC, USDT ou ETH convertis en
 * $SWOGEBET livres au coffre des paris, 95 % de CE QUI ARRIVE au solde de
 * paris (le frais vient du serveur, jamais de la page). Credite :
 * l'evenement `swoge:betdeposit` (detail.betBalance). Le reste — liste du
 * serveur, une requete {origin, amountUsd}, aucun stockage — est le meme.
 * ======================================================================== */
(function(){
  "use strict";
  if (window.SwogeDepot) return;
  function serveur(){
    try {
      var q = new URLSearchParams(location.search).get("server");
      if (q) { var u = new URL(String(q).replace(/^ws/, "http")); if (/^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname)) return u.origin; }
    } catch (e) {}
    return "https://web-production-220a3.up.railway.app";
  }
  function jeton(){ try { return localStorage.getItem("swogeSession"); } catch (e) { return null; } }
  function dollars(x){ var n = Number(x); return isFinite(n) ? "$" + n.toFixed(2) : "—"; }
  /* Un montant de jetons rendu en texte decimal par le serveur → entier groupe (« 370,500 »). */
  function jetons(x){ var n = Number(String(x == null ? "" : x).split(".")[0]); return isFinite(n) ? n.toLocaleString("en-US") : "—"; }
  function pourcent(f){ var n = Number(f); return isFinite(n) ? (Math.round(n * 100) / 100) + "%" : "?"; }
  /* Les deux panneaux : le credit en dollars (defaut) et le depot aux paris. Les phrases vivent ici. */
  var MODES = {
    credit: {
      route: "/credit/deposit",
      ouvre: "Pay with SOL or USDT instead (no signature)",
      intro: "Send SOL or USDT from any wallet to a one-time address. It is converted to USDC and you are credited what actually arrives.",
      indispo: "Paying with SOL or USDT is not available right now.",
      estime: function(c){ return "Estimate: about " + dollars(c.estimateUsd) + " credited. You are credited what actually arrives in USDC, after network and conversion fees."; },
      recu: "Payment seen - converting to USDC…",
      fait: function(d){ return "Done: " + dollars(d.creditedUsd) + " added. Your credit: " + dollars(d.balanceUsd) + "."; },
      annonce: function(d){ return new CustomEvent("swoge:credit", { detail: { balanceUsd: d.balanceUsd } }); }
    },
    bet: {
      route: "/bet/deposit",
      ouvre: "Deposit with SOL, USDC, USDT or ETH (no $SWOGEBET needed)",
      intro: "Send SOL, USDC, USDT or ETH from any wallet or exchange to a one-time address. It is swapped to $SWOGEBET and added to your bet balance.",
      regles: function(d){ return [pourcent(d.feePercent) + " deposit fee", "Credited in $SWOGEBET - exactly what arrives after the swap"]; },
      indispo: "Depositing with SOL, USDC, USDT or ETH is not available right now.",
      estime: function(c){ return "Estimate: about " + jetons(c.estimateCreditedSwogebet) + " $SWOGEBET after the " + pourcent(c.feePercent) + " deposit fee. You are credited exactly what arrives after the swap, minus the fee - the estimate is not a promise."; },
      recu: "Payment seen - swapping to $SWOGEBET…",
      fait: function(d){ return "Done: " + jetons(d.creditedSwogebet) + " $SWOGEBET added (" + pourcent(d.feePercent) + " fee: " + jetons(d.feeSwogebet) + "). Bet balance: " + jetons(d.betBalance) + " $SWOGEBET."; },
      annonce: function(d){ return new CustomEvent("swoge:betdeposit", { detail: { betBalance: d.betBalance } }); }
    }
  };
  function el(tag, attrs, kids){
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "cls") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function(c){ if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  /* Les styles, bornes a .cdp ; les couleurs de la page quand elle les definit. */
  function styles(){
    if (document.getElementById("cdpStyle")) return;
    var s = document.createElement("style"); s.id = "cdpStyle";
    s.textContent = ".cdp{margin-top:14px;border-top:1px solid var(--line,rgba(0,0,0,.12));padding-top:12px;font-size:13px;line-height:1.45}"
      + ".cdp[hidden],.cdp [hidden]{display:none!important}"
      + ".cdp-ouvre{background:none;border:1px solid var(--line,rgba(0,0,0,.18));border-radius:999px;padding:8px 14px;font:inherit;font-weight:700;cursor:pointer;color:inherit;width:100%}"
      + ".cdp-l{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}"
      + ".cdp-l button{flex:1 1 auto;border:1px solid var(--line,rgba(0,0,0,.18));background:none;border-radius:999px;padding:7px 10px;font:inherit;cursor:pointer;color:inherit;white-space:nowrap}"
      + ".cdp-l button[aria-pressed=true]{border-color:currentColor;font-weight:700}"
      + ".cdp-m{display:flex;gap:8px;align-items:center;margin:8px 0}"
      + ".cdp-m input{width:96px;padding:7px 9px;border:1px solid var(--line,rgba(0,0,0,.18));border-radius:10px;font:inherit;background:transparent;color:inherit}"
      + ".cdp-go{border:0;border-radius:999px;padding:9px 16px;font:inherit;font-weight:700;cursor:pointer;background:var(--pool,#1f6feb);color:#fff;width:100%}"
      + ".cdp-go[disabled]{opacity:.55;cursor:default}"
      + ".cdp-carte{border:1px solid var(--line,rgba(0,0,0,.15));border-radius:14px;padding:12px;margin-top:10px}"
      + ".cdp-adr{display:flex;gap:6px;align-items:center;margin:8px 0}"
      + ".cdp-adr code{flex:1;min-width:0;overflow-wrap:anywhere;font:12px/1.4 'Space Mono',ui-monospace,monospace;padding:7px 8px;border-radius:8px;background:rgba(127,127,127,.12)}"
      + ".cdp-adr button{border:1px solid var(--line,rgba(0,0,0,.18));background:none;border-radius:999px;padding:6px 10px;font:inherit;cursor:pointer;color:inherit}"
      + ".cdp ul{margin:6px 0 0;padding-left:18px}.cdp li{margin:3px 0}"
      + ".cdp-st{margin:8px 0 0;font-weight:700}.cdp-st.err{color:var(--serpent,var(--red,#c0392b))}.cdp-dim{opacity:.75;font-size:12px}";
    document.head.appendChild(s);
  }

  function monte(racine){
    if (!racine || racine.getAttribute("data-cdp-monte")) return;
    racine.setAttribute("data-cdp-monte", "1");
    styles();
    var X = MODES[racine.getAttribute("data-credit-depot")] || MODES.credit;
    var S = { origines: [], choix: null, commande: null, minuteur: null };
    var boite = el("div", { cls: "cdp" });
    var ouvre = el("button", { type: "button", cls: "cdp-ouvre", "aria-expanded": "false", text: X.ouvre });
    var corps = el("div", { hidden: "" });
    var intro = el("p", { cls: "cdp-dim", text: X.intro });
    /* Les regles du depot aux paris (frais, monnaie creditee), ecrites des que le serveur les donne. */
    var regles = el("ul", { cls: "cdp-regles", hidden: "" });
    var choix = el("div", { cls: "cdp-l", role: "group", "aria-label": "Network and token" });
    var montant = el("input", { type: "number", inputmode: "decimal", min: "2", max: "50", step: "1", value: "10", "aria-label": "Amount in dollars" });
    var bornes = el("span", { cls: "cdp-dim" });
    var go = el("button", { type: "button", cls: "cdp-go", text: "Get a deposit address" });
    var carte = el("div", { cls: "cdp-carte", hidden: "" });
    var st = el("p", { cls: "cdp-st", role: "status", "aria-live": "polite" });
    corps.appendChild(intro); corps.appendChild(regles); corps.appendChild(choix);
    corps.appendChild(el("div", { cls: "cdp-m" }, [el("span", { text: "Amount $" }), montant, bornes]));
    corps.appendChild(go); corps.appendChild(carte); corps.appendChild(st);
    boite.appendChild(ouvre); boite.appendChild(corps);
    racine.appendChild(boite);

    function statut(t, err){ st.textContent = t || ""; st.className = "cdp-st" + (err ? " err" : ""); }
    function api(chemin, corpsJson){
      var j = jeton();
      if (!j) return Promise.reject(new Error("Sign in with your wallet first."));
      return fetch(serveur() + chemin, { method: corpsJson ? "POST" : "GET", cache: "no-store",
        headers: Object.assign({ authorization: "Bearer " + j }, corpsJson ? { "content-type": "application/json" } : {}),
        body: corpsJson ? JSON.stringify(corpsJson) : undefined })
        .then(function(r){ return r.json().then(function(x){ x = x || {}; x.http = r.status; return x; }, function(){ return { ok: false, http: r.status, raison: "the server answered " + r.status }; }); });
    }
    function origine(){ for (var i = 0; i < S.origines.length; i++) if (S.origines[i].id === S.choix) return S.origines[i]; return null; }
    function peintChoix(){
      choix.textContent = "";
      S.origines.forEach(function(o){
        var b = el("button", { type: "button", "data-origin": o.id, "aria-pressed": String(o.id === S.choix), text: o.token + " on " + o.network });
        b.addEventListener("click", function(){ S.choix = o.id; peintChoix(); });
        choix.appendChild(b);
      });
      var o = origine();
      if (o) {
        montant.min = String(o.minUsd); montant.max = String(o.maxUsd);
        if (Number(montant.value) < o.minUsd) montant.value = String(o.minUsd);
        bornes.textContent = "$" + o.minUsd + " to $" + o.maxUsd;
      }
    }
    function charge(){
      statut("");
      return api(X.route).then(function(d){
        if (!d.ok) { statut(d.raison || "Not available right now.", true); go.disabled = true; return; }
        S.origines = d.origins || [];
        if (X.regles && d.feePercent != null) {
          regles.textContent = "";
          X.regles(d).forEach(function(t){ regles.appendChild(el("li", null, [el("b", { text: t })])); });
          regles.hidden = false;
        }
        if (!d.available || !S.origines.length) { choix.textContent = ""; go.disabled = true; statut(X.indispo, true); return; }
        if (!S.choix) S.choix = S.origines[0].id;
        go.disabled = false; peintChoix();
        /* Une commande encore ouverte de cette session : on la remontre plutot que d'en ouvrir une autre. */
        var ouverte = (d.orders || []).filter(function(c){ return c.status === "waiting" || c.status === "processing"; })[0];
        if (ouverte && !S.commande) montre(ouverte);
      })["catch"](function(e){ statut(String(e && e.message || e), true); });
    }
    ouvre.addEventListener("click", function(){
      var v = corps.hidden; corps.hidden = !v; ouvre.setAttribute("aria-expanded", String(v));
      if (v) charge();
    });
    go.addEventListener("click", function(){
      var o = origine(); if (!o) return;
      var usd = Math.round(Number(montant.value) * 100) / 100;
      if (!(usd >= o.minUsd && usd <= o.maxUsd)) { statut("Choose an amount between $" + o.minUsd + " and $" + o.maxUsd + " for " + o.token + " on " + o.network + ".", true); return; }
      go.disabled = true; statut("Getting a one-time deposit address…");
      api(X.route, { origin: o.id, amountUsd: usd }).then(function(d){
        go.disabled = false;
        if (!d.ok) { statut(d.raison || "No address right now - nothing was charged.", true); return; }
        statut(""); montre(d);
      })["catch"](function(e){ go.disabled = false; statut("No address right now - nothing was charged. " + String(e && e.message || e).slice(0, 120), true); });
    });

    function montre(c){
      S.commande = c;
      carte.textContent = ""; carte.hidden = false;
      var avant = c.sendBefore ? new Date(c.sendBefore) : null;
      var heure = avant && !isNaN(avant) ? avant.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
      var copie = el("button", { type: "button", text: "Copy" });
      copie.addEventListener("click", function(){
        var fait = function(){ copie.textContent = "Copied"; setTimeout(function(){ copie.textContent = "Copy"; }, 1500); };
        try { navigator.clipboard.writeText(c.depositAddress).then(fait, function(){ selectionne(); }); } catch (e) { selectionne(); }
      });
      var code = el("code", { "data-cdp-adresse": "", text: c.depositAddress });
      function selectionne(){ try { var r = document.createRange(); r.selectNodeContents(code); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {} }
      carte.appendChild(el("div", null, ["Send exactly ", el("b", { "data-cdp-envoi": "", text: c.send + " " + c.token }), " on the ", el("b", { text: c.network }), " network to:"]));
      carte.appendChild(el("div", { cls: "cdp-adr" }, [code, copie]));
      carte.appendChild(el("ul", null, [
        el("li", null, [el("b", { text: "Send only " + c.token + " on " + c.network + "." }), " Another token or another network is lost."]),
        el("li", { text: "Send this amount or more: less is refunded, more is converted too. This address is for this one payment only." }),
        el("li", { text: X.estime(c) }),
        el("li", { text: "Send from your own wallet. If the conversion fails, the payment goes back to the address that sent it - a withdrawal from an exchange may not come back on its own." }),
        heure ? el("li", { text: "Send within 30 minutes (by " + heure + "): the price of the estimate moves." }) : null
      ]));
      suit();
    }
    var TEXTE = { waiting: "Waiting for your payment… (you can close this; it is credited when it arrives)", processing: X.recu };
    function suit(){
      clearTimeout(S.minuteur);
      var c = S.commande; if (!c) return;
      api(X.route + "/" + encodeURIComponent(c.id)).then(function(d){
        if (!d.ok) { statut(d.raison || "Could not read the deposit status.", true); S.minuteur = setTimeout(suit, 15000); return; }
        if (d.status === "credited") {
          statut(X.fait(d));
          S.commande = null;
          try { window.dispatchEvent(X.annonce(d)); } catch (e) {}
          return;
        }
        if (TEXTE[d.status]) { statut(TEXTE[d.status]); S.minuteur = setTimeout(suit, window.SWOGE_DEPOT_MS || 5000); return; }
        statut(d.message || ("This deposit is " + d.status + ". Nothing was credited."), true);
        S.commande = null;
      })["catch"](function(){ S.minuteur = setTimeout(suit, 15000); });
    }
  }

  function monteTout(){ Array.prototype.forEach.call(document.querySelectorAll("[data-credit-depot]"), monte); }
  window.SwogeDepot = { monte: monte };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", monteTout); else monteTout();
})();
