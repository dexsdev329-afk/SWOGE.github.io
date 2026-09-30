/* ==========================================================================
 * LANCER UN JETON V4 DEPUIS UNE CARTE D'AGENT (SwogeAgentic, SwoleMind) — 29/09/2026
 *
 * Demande du proprietaire : « des agents IA qui peuvent creer des tokens facilement avec le
 * nouveau launchpad ». L'agent PREPARE une offre (serveur, lancement_v4.js) ; cette carte la
 * montre et c'est le PORTEFEUILLE DU JOUEUR qui signe. Le serveur ne signe rien, la page ne
 * voit aucune cle. Le joueur paie le frais, devient le createur et touche 50 % des frais.
 *
 * La page ne croit pas l'offre sur parole : seules les DEUX adresses deployees et relues le
 * 30/09 et leurs frais EXACTS sont acceptees (LAUNCHPADS ci-dessous). Une offre qui viserait
 * un autre contrat, ou un autre montant, est refusee avant toute signature.
 *
 *   SwogeLance.carte(offre)             → l'element a inserer sous la reponse de l'agent
 *   SwogeLance.lance(offre, { statut, chaine? }) → { token, pool, tx }
 *   (chaine : les operations de portefeuille ; injectable pour les essais)
 * ======================================================================== */
(function (racine) {
  "use strict";
  var CHAIN = { id: 4663, hex: "0x1237", name: "Robinhood Chain", rpc: "https://rpc.mainnet.chain.robinhood.com", scan: "https://robinhoodchain.blockscout.com" };
  var SWOGE = "0x8a166Fb41Cd659a0a43396272FF73973Ce29F817";
  /* Redeployes par le serveur le 30/09 (deploiement_v4.js), parametres relus sur la chaine,
     source verifiee exact_match sur Sourcify. Ceux du 29/09 (0x6532C42a…, 0xEfD0fd35…) creaient
     des jetons au owner() constant, notes « hidden owner » par GoPlus : ils ne sont plus acceptes
     ici. Ils ne portaient que nos deux jetons de test. */
  var LAUNCHPADS = {
    swoge: { adresse: "0xF090C095ae6F1c75F382Ce1Feb07626460996549", feeWei: "10000000000000000000000", payable: false },
    eth:   { adresse: "0xe3fB4f9790504D2F95D022d73993eb916f407759", feeWei: "100000000000000", payable: true }
  };
  var PARAMS = "(string name,string symbol,bytes32 salt,string telegram,string twitter,string website,string logo)";
  var EVT = "event LaunchedInstant(address indexed token, address indexed creator, address pool, uint256 lpTokenId)";

  /* createToken prend UNE structure : ses parentheses font partie de la signature (et du selecteur). */
  function abiCreate(payable) { return "function createToken(" + PARAMS + " p) " + (payable ? "payable " : "") + "returns (address)"; }
  function erreur(t) { return new Error(t); }
  function meme(a, b) { return String(a || "").toLowerCase() === String(b || "").toLowerCase(); }
  function sel() { var a = new Uint8Array(32); crypto.getRandomValues(a); return "0x" + Array.prototype.map.call(a, function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
  function court(a) { return String(a).slice(0, 6) + "…" + String(a).slice(-4); }
  function lienSur(u) { return /^https:\/\//i.test(String(u || "")) ? String(u) : ""; }

  /** Ce que la page accepte de signer : un des deux launchpads, son frais exact, un sel, un nom. */
  function verifie(o) {
    if (!o || typeof o !== "object") return "no launch offer";
    var lp = LAUNCHPADS[o.pool];
    if (!lp) return "unknown pool";
    if (Number(o.chainId) !== CHAIN.id) return "this offer is not for Robinhood Chain";
    if (!meme(o.launchpad, lp.adresse)) return "this offer points to an unknown contract - it was refused";
    if (String(o.feeWei) !== lp.feeWei) return "this offer carries an unexpected fee - it was refused";
    if (o.pool === "swoge" && o.swoge && !meme(o.swoge, SWOGE)) return "this offer points to an unknown $SWOGE contract - it was refused";
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(o.salt || ""))) return "the offer has no valid salt";
    if (!String(o.name || "").trim() || !/^[A-Z0-9]{2,10}$/.test(String(o.symbol || ""))) return "the offer has no valid name or symbol";
    if (o.expire && Date.now() > Number(o.expire)) return "this offer expired - ask the agent again";
    return null;
  }

  /* ---- le portefeuille reel (ethers 5, deja charge par la page) ---- */
  function chaineEthers() {
    var eth = racine.ethereum, E = racine.ethers;
    if (!eth) return Promise.reject(erreur("No wallet found in this browser - open this page inside your wallet app."));
    if (!E) return Promise.reject(erreur("the wallet library is still loading - try again in a second"));
    return eth.request({ method: "eth_requestAccounts" }).then(function () {
      return eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.hex }] })["catch"](function (e) {
        if (!e || e.code !== 4902) throw e;
        return eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN.hex, chainName: CHAIN.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [CHAIN.rpc], blockExplorerUrls: [CHAIN.scan] }] });
      });
    }).then(function () {
      var prov = new E.providers.Web3Provider(eth, "any"), s = prov.getSigner();
      return s.getAddress().then(function (moi) {
        var erc = function (a) { return new E.Contract(a, ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"], s); };
        var lp = function (a, payable) { return new E.Contract(a, [abiCreate(payable), EVT], s); };
        return {
          compte: moi,
          reseau: function () { return prov.getNetwork().then(function (n) { return Number(n.chainId); }); },
          soldeEth: function () { return prov.getBalance(moi).then(String); },
          soldeSwoge: function () { return erc(SWOGE).balanceOf(moi).then(String); },
          autorisation: function (spender) { return erc(SWOGE).allowance(moi, spender).then(String); },
          autorise: function (spender, montant) { return erc(SWOGE).approve(spender, montant).then(function (tx) { return tx.wait(); }); },
          simule: function (a, payable, p, valeur) { return lp(a, payable).callStatic.createToken(p, valeur ? { value: valeur } : {}); },
          envoie: function (a, payable, p, valeur) { return lp(a, payable).createToken(p, valeur ? { value: valeur } : {}); },
          attend: function (tx) { return tx.wait(); },
          lancementDe: function (a, recu) {
            var I = new E.utils.Interface([EVT]);
            for (var i = 0; i < (recu.logs || []).length; i++) {
              var l = recu.logs[i];
              if (!meme(l.address, a)) continue;
              try { var ev = I.parseLog(l); if (ev.name === "LaunchedInstant") return { token: ev.args.token, pool: ev.args.pool }; } catch (x) {}
            }
            return null;
          }
        };
      });
    });
  }

  /** Le lancement, signe par le joueur. */
  function lance(o, opts) {
    opts = opts || {};
    var statut = opts.statut || function () {};
    var err = verifie(o);
    if (err) return Promise.reject(erreur(err));
    var lp = LAUNCHPADS[o.pool], frais = lp.feeWei, C;
    var p = { name: String(o.name), symbol: String(o.symbol), salt: o.salt, telegram: lienSur(o.telegram), twitter: lienSur(o.twitter), website: lienSur(o.website), logo: "" };
    statut("Connecting your wallet on Robinhood Chain…");
    return Promise.resolve(opts.chaine ? opts.chaine() : chaineEthers()).then(function (c) {
      C = c;
      return C.reseau();
    }).then(function (id) {
      if (Number(id) !== CHAIN.id) throw erreur("Switch your wallet to Robinhood Chain, then press Launch again.");
      if (o.pool === "eth") {
        return C.soldeEth().then(function (b) {
          if (BigInt(b) <= BigInt(frais)) throw erreur("You need a little more than 0.0001 ETH on Robinhood Chain (fee + gas).");
        });
      }
      return C.soldeSwoge().then(function (b) {
        if (BigInt(b) < BigInt(frais)) throw erreur("You need 10,000 $SWOGE for the launch fee (you have " + (Number(BigInt(b) / 10n ** 18n)).toLocaleString("en-US") + ").");
        return C.autorisation(lp.adresse);
      }).then(function (a) {
        if (BigInt(a) >= BigInt(frais)) return null;
        statut("Step 1 of 2: approve the 10,000 $SWOGE launch fee in your wallet (it is burned at launch)…");
        return C.autorise(lp.adresse, frais);
      });
    }).then(function () {
      /* Un sel deja pris, ou un pool amorce par un tiers : on essaie AVANT de faire signer, et
         on tire un autre sel une fois (le contrat le permet : CREATE2 avec sel, voir SwogeFunV4). */
      var valeur = lp.payable ? frais : null;
      return C.simule(lp.adresse, lp.payable, p, valeur)["catch"](function () {
        p.salt = sel();
        return C.simule(lp.adresse, lp.payable, p, valeur);
      }).then(function () {
        statut((o.pool === "swoge" ? "Step 2 of 2: " : "") + "confirm the launch in your wallet" + (o.pool === "eth" ? " (0.0001 ETH fee)" : "") + "…");
        return C.envoie(lp.adresse, lp.payable, p, valeur);
      });
    }).then(function (tx) {
      statut("Launching on Robinhood Chain — waiting for the block…");
      return C.attend(tx).then(function (recu) {
        if (!recu || recu.status === 0) throw erreur("the launch transaction failed - nothing was launched");
        var l = C.lancementDe(lp.adresse, recu);
        if (!l) throw erreur("the transaction went through but no launch was found in it - check it on the explorer");
        return { token: l.token, pool: l.pool, tx: tx.hash || recu.transactionHash };
      });
    });
  }

  /* ---- la carte ---- */
  function css() {
    if (document.getElementById("lv4-css")) return;
    var s = document.createElement("style"); s.id = "lv4-css";
    s.textContent = ".lv4{border:1px solid #D6E2F5;border-radius:14px;background:#FFFFFF;color:#0A1F44;padding:14px 16px;margin:10px 0;max-width:560px}"
      + ".lv4 h4{margin:0 0 6px;font-size:16px}.lv4 p{margin:6px 0;font-size:13.5px;line-height:1.45;color:#34466B}.lv4 .lv4-b{margin-top:8px;padding:11px 16px;border:none;border-radius:10px;"
      + "background:#1B5FE0;color:#fff;font-weight:700;cursor:pointer;font-size:14px}.lv4 .lv4-b[disabled]{opacity:.55;cursor:default}.lv4 .lv4-s{font-size:13px;color:#1B5FE0}"
      + ".lv4 .lv4-s.err{color:#B42318}.lv4 a{color:#1B5FE0;word-break:break-all}.lv4 .lv4-ok{background:#ECFDF3;border-radius:10px;padding:8px 10px;margin-top:8px}";
    document.head.appendChild(s);
  }
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function lien(t, u) { var a = el("a", null, t); a.href = u; a.target = "_blank"; a.rel = "noopener"; return a; }

  function carte(o, opts) {
    css();
    var c = el("div", "lv4"), err = verifie(o);
    c.appendChild(el("h4", null, "🚀 Launch " + String(o && o.name || "") + " ($" + String(o && o.symbol || "") + ")"));
    if (err) { c.appendChild(el("p", "lv4-s err", err)); return c; }
    var eth = o.pool === "eth";
    c.appendChild(el("p", null, "Pool: " + (eth ? "ETH (paired with WETH)" : "$SWOGE") + " · fee " + (eth ? "0.0001 ETH, to the SWOGE treasury" : "10,000 $SWOGE, burned")
      + " · on Robinhood Chain."));
    c.appendChild(el("p", null, "1,000,000,000 supply, all of it in the pool; liquidity locked forever; no owner, no tax, no mint. You are the creator: you earn 50% of the trading fees ("
      + (eth ? "in WETH" : "in $SWOGE") + "); nobody gets free tokens, you buy at the market like everyone."));
    var liens = [o.website, o.twitter, o.telegram].filter(lienSur);
    if (liens.length) c.appendChild(el("p", null, "Links: " + liens.join(" · ")));
    c.appendChild(el("p", null, "You sign with your own wallet: SWOGE never holds your keys. The offer is valid until " + new Date(Number(o.expire) || Date.now()).toTimeString().slice(0, 5) + "."));
    var b = el("button", "lv4-b", "Launch with my wallet"); b.type = "button";
    var s = el("p", "lv4-s"); s.setAttribute("role", "status");
    b.addEventListener("click", function () {
      b.disabled = true; s.className = "lv4-s";
      lance(o, { statut: function (t) { s.textContent = t; }, chaine: opts && opts.chaine }).then(function (r) {
        b.textContent = "Launched"; s.textContent = "";
        var ok = el("div", "lv4-ok");
        ok.appendChild(el("p", null, "✅ $" + o.symbol + " is live: " + r.token));
        var pl = el("p");
        pl.appendChild(lien("Token on the explorer", CHAIN.scan + "/token/" + r.token)); pl.appendChild(document.createTextNode(" · "));
        pl.appendChild(lien("Launch transaction", CHAIN.scan + "/tx/" + r.tx)); pl.appendChild(document.createTextNode(" · "));
        pl.appendChild(lien("DexScreener (after the first trade)", "https://dexscreener.com/robinhood/" + String(r.pool).toLowerCase()));
        ok.appendChild(pl);
        c.appendChild(ok);
      })["catch"](function (e) {
        b.disabled = false;
        var m = String((e && (e.reason || (e.data && e.data.message) || e.message)) || e || "the launch failed");
        if (/user rejected|denied|4001/i.test(m) || (e && e.code === 4001) || (e && e.code === "ACTION_REJECTED")) m = "You cancelled in your wallet - nothing was launched.";
        s.className = "lv4-s err"; s.textContent = m.slice(0, 220);
      });
    });
    c.appendChild(b); c.appendChild(s);
    return c;
  }

  racine.SwogeLance = { carte: carte, lance: lance, verifie: verifie, LAUNCHPADS: LAUNCHPADS, abiCreate: abiCreate, EVT: EVT };
})(window);
