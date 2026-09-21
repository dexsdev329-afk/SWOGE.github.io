"use strict";
/* ==========================================================================
 * SWOGE MARKETS — LE MOTEUR DE DONNEES DE MARCHE LIVE
 *
 * Vraies donnees, jamais simulees. L architecture est celle du cahier des
 * charges : Adapter -> Discovery -> Store -> WebSocket Manager -> UI.
 *
 * ---- CE QUI EST REEL, MESURE ----
 * Hyperliquid : WS ouvert, CORS *, VERIFIE en direct (BTC recu, 1102 prix
 * sur UNE connexion, premier tick en 4 s). C est la source par defaut.
 * OKX / Binance / Bybit : voir leur adapter — certains ne sont joignables
 * qu en WS direct depuis le navigateur d une region permise. On ne marque
 * jamais « LIVE » un flux qu on n a pas vu vivre : le statut vient de la
 * socket, pas d une promesse.
 *
 * ---- SEPARATION STRICTE ----
 * Ce fichier NE FAIT QUE des donnees de marche. Il ne signe rien, ne detient
 * aucune cle, ne passe aucun ordre. Le paper trading (la colonie) vit
 * ailleurs, cote serveur. Une future execution reelle serait un module a
 * part, derriere permissions et cles — jamais ici. */

/* ==================================================================
 * 1. LE STORE CENTRAL — etat normalise, abonnements par cle
 * ==================================================================
 * Le frontend ne lit QUE le store, jamais le format d un exchange. Chaque
 * changement previent les seuls abonnes concernes : on ne rerend pas la page
 * a chaque tick. */
function MarketStore() {
  this.marches = new Map();        /* cle -> marche normalise (metadonnees + dernier etat) */
  this.tickers = new Map();        /* cle -> { last, t } prix live */
  this.detail = new Map();         /* cle -> { book, trades, funding, oi, mark, index } */
  this.statut = {};                /* exchange -> 'live' | 'reconnecting' | 'offline' */
  this._abonnes = new Map();       /* sujet -> Set(callbacks) */
  this._sales = new Set();         /* sujets a notifier au prochain cadre */
  this._cadre = null;
}
MarketStore.prototype.on = function (sujet, cb) {
  if (!this._abonnes.has(sujet)) this._abonnes.set(sujet, new Set());
  this._abonnes.get(sujet).add(cb);
  return () => this._abonnes.get(sujet).delete(cb);
};
/* On marque « sale » et on regroupe la notification sur un cadre d animation :
   mille ticks en une seconde ne declenchent qu un rendu, et seulement des
   elements qui ont bouge. C est le throttling intelligent demande. */
MarketStore.prototype._touche = function (sujet) {
  this._sales.add(sujet);
  if (this._cadre) return;
  var self = this;
  this._cadre = (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : function (f) { return setTimeout(f, 16); })(function () {
    self._cadre = null;
    var sales = self._sales; self._sales = new Set();
    sales.forEach(function (s) {
      var set = self._abonnes.get(s); if (set) set.forEach(function (cb) { try { cb(); } catch (e) {} });
    });
  });
};
MarketStore.prototype.poseMarches = function (liste) {
  for (var i = 0; i < liste.length; i++) { var m = liste[i]; this.marches.set(m.symbole, m); }
  this._touche('marches');
};
MarketStore.prototype.majTicker = function (cle, last, t) {
  var m = this.marches.get(cle);
  this.tickers.set(cle, { last: last, t: t || Date.now() });
  if (m) { m.last = last; m.horodatage = t || Date.now(); }
  this._touche('ticker:' + cle);
  this._touche('liste');           /* la liste du selecteur suit les prix */
};
MarketStore.prototype.majDetail = function (cle, champs) {
  var d = this.detail.get(cle) || {};
  for (var k in champs) d[k] = champs[k];
  d.horodatage = Date.now();
  this.detail.set(cle, d);
  this._touche('detail:' + cle);
};
MarketStore.prototype.majStatut = function (exchange, etat) {
  if (this.statut[exchange] === etat) return;
  this.statut[exchange] = etat;
  this._touche('statut');
};

/* ==================================================================
 * 2. LES ADAPTERS — un exchange, sa forme, ses abonnements
 * ==================================================================
 * Chacun sait : ou est son WS, comment s abonner a TOUS les prix sur une
 * connexion, comment s abonner au detail d UN marche, et comment lire ses
 * messages vers le store. Ajouter un exchange = un objet de plus. */
var Adapters = {};

Adapters.hyperliquid = {
  nom: 'Hyperliquid',
  ws: 'wss://api.hyperliquid.xyz/ws',
  /* Un abonnement pour TOUS les prix : le coeur de « plusieurs marches sur
     une connexion ». */
  abonnementGlobal: function () { return { method: 'subscribe', subscription: { type: 'allMids' } }; },
  /* Le detail d un marche affiche : carnet et trades. */
  abonnementDetail: function (id) {
    return [
      { method: 'subscribe', subscription: { type: 'l2Book', coin: id } },
      { method: 'subscribe', subscription: { type: 'trades', coin: id } },
    ];
  },
  desabonnementDetail: function (id) {
    return [
      { method: 'unsubscribe', subscription: { type: 'l2Book', coin: id } },
      { method: 'unsubscribe', subscription: { type: 'trades', coin: id } },
    ];
  },
  ping: function () { return { method: 'ping' }; },
  /* Lit un message et le range dans le store. Rend true si c etait un vrai
     message de donnees (pour la detection de flux mort). */
  lit: function (msg, store, marchesParId) {
    if (msg.channel === 'pong') return true;
    if (msg.channel === 'allMids' && msg.data && msg.data.mids) {
      var mids = msg.data.mids, t = Date.now();
      for (var id in mids) {
        var cle = id + '/USD:PERP';
        if (store.marches.has(cle)) store.majTicker(cle, Number(mids[id]), t);
      }
      return true;
    }
    if (msg.channel === 'l2Book' && msg.data) {
      var coin = msg.data.coin; var cle2 = coin + '/USD:PERP';
      var niv = msg.data.levels || [[], []];
      store.majDetail(cle2, { book: {
        bids: niv[0].slice(0, 15).map(function (x) { return [Number(x.px), Number(x.sz)]; }),
        asks: niv[1].slice(0, 15).map(function (x) { return [Number(x.px), Number(x.sz)]; }),
      } });
      return true;
    }
    if (msg.channel === 'trades' && msg.data && msg.data.length) {
      var coin2 = msg.data[0].coin; var cle3 = coin2 + '/USD:PERP';
      store.majDetail(cle3, { trades: msg.data.slice(-30).map(function (x) {
        return { px: Number(x.px), sz: Number(x.sz), cote: x.side, t: x.time };
      }).reverse() });
      return true;
    }
    return false;
  },
};

/* ==================================================================
 * 3. LE WEBSOCKET MANAGER + CONNECTION MANAGER
 * ==================================================================
 * Une connexion par exchange. Reconnexion a backoff exponentiel, heartbeat
 * ping/pong, detection de flux mort (aucun message depuis N s -> on tue et
 * on rouvre), protection contre les boucles de reconnexion. Une deconnexion
 * ne casse jamais l application : le dernier etat reste peint, le statut
 * passe a « reconnecting ».  */
function WSManager(adapter, store) {
  this.a = adapter; this.store = store;
  this.ws = null; this.vivant = false;
  this.recul = 1000;               /* backoff : 1s, puis x2, plafond 30s */
  this.reculMax = 30000;
  this.dernierMsg = 0;
  this.detailAbonnes = new Set();  /* ids des marches au detail actif */
  this.ferme = false;
  this._battement = null; this._veille = null;
  this._journal = [];
}
WSManager.prototype.log = function (m) {
  this._journal.push({ t: Date.now(), m: m });
  if (this._journal.length > 200) this._journal.shift();
  if (typeof console !== 'undefined' && window.SWOGE_DEBUG) console.log('[ws:' + this.a.nom + '] ' + m);
};
WSManager.prototype.ouvre = function () {
  if (this.ferme) return;
  var self = this;
  this.store.majStatut(this.a.nom, this.vivant ? 'live' : 'reconnecting');
  try { this.ws = new WebSocket(this.a.ws); }
  catch (e) { this.log('ouverture impossible : ' + e.message); return this.programmeReconnexion(); }
  this.ws.onopen = function () {
    self.log('ouverte'); self.recul = 1000; self.dernierMsg = Date.now();
    self.ws.send(JSON.stringify(self.a.abonnementGlobal()));
    /* On rabonne le detail des marches encore affiches. */
    self.detailAbonnes.forEach(function (id) { self.a.abonnementDetail(id).forEach(function (s) { self._envoie(s); }); });
    self.battement(); self.surveille();
  };
  this.ws.onmessage = function (ev) {
    self.dernierMsg = Date.now();
    var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    var vrai = self.a.lit(msg, self.store, null);
    if (vrai && !self.vivant) { self.vivant = true; self.store.majStatut(self.a.nom, 'live'); }
  };
  this.ws.onclose = function () { self.log('fermee'); self.vivant = false; self.arreteTimers();
    self.store.majStatut(self.a.nom, 'reconnecting'); self.programmeReconnexion(); };
  this.ws.onerror = function () { self.log('erreur'); try { self.ws.close(); } catch (e) {} };
};
WSManager.prototype._envoie = function (o) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); } catch (e) {} };
/* Heartbeat : un ping regulier. Sans lui, Hyperliquid ferme apres 60 s. */
WSManager.prototype.battement = function () {
  var self = this; this.arreteBattement();
  this._battement = setInterval(function () { self._envoie(self.a.ping()); }, 30000);
};
/* Detection de flux mort : si aucun message depuis 45 s, la socket est morte
   meme si elle se croit ouverte (cable debranche, wifi coupe). On la tue,
   onclose declenche la reconnexion. */
WSManager.prototype.surveille = function () {
  var self = this; this.arreteVeille();
  this._veille = setInterval(function () {
    if (Date.now() - self.dernierMsg > 45000) { self.log('flux mort, on rouvre'); self.vivant = false;
      try { self.ws.close(); } catch (e) {} }
  }, 15000);
};
WSManager.prototype.arreteBattement = function () { if (this._battement) clearInterval(this._battement); this._battement = null; };
WSManager.prototype.arreteVeille = function () { if (this._veille) clearInterval(this._veille); this._veille = null; };
WSManager.prototype.arreteTimers = function () { this.arreteBattement(); this.arreteVeille(); };
/* Reconnexion a backoff exponentiel, avec un peu d aleatoire pour ne pas
   marteler l exchange en rafale (protection anti-boucle). */
WSManager.prototype.programmeReconnexion = function () {
  if (this.ferme) return;
  var self = this;
  var attente = Math.min(this.recul, this.reculMax) * (0.8 + Math.random() * 0.4);
  this.log('reconnexion dans ' + Math.round(attente) + 'ms');
  setTimeout(function () { self.ouvre(); }, attente);
  this.recul = Math.min(this.recul * 2, this.reculMax);
};
WSManager.prototype.abonneDetail = function (id) {
  if (this.detailAbonnes.has(id)) return;
  this.detailAbonnes.add(id);
  var self = this; this.a.abonnementDetail(id).forEach(function (s) { self._envoie(s); });
};
WSManager.prototype.desabonneDetail = function (id) {
  if (!this.detailAbonnes.has(id)) return;
  this.detailAbonnes.delete(id);
  var self = this; this.a.desabonnementDetail(id).forEach(function (s) { self._envoie(s); });
};
WSManager.prototype.arrete = function () { this.ferme = true; this.arreteTimers(); try { this.ws.close(); } catch (e) {} };

/* ==================================================================
 * 4. LE MARKET MANAGER — decouverte, cache, selection
 * ==================================================================
 * Il charge les marches (via le serveur, qui les decouvre et normalise),
 * les met dans le store, ouvre le WS, et gere le marche AFFICHE : abonner
 * son detail, desabonner le precedent. Il porte aussi recherche, tri,
 * filtres et favoris. */
function MarketManager(store, opt) {
  this.store = store; this.opt = opt || {};
  this.serveur = this.opt.serveur || '';
  this.ws = null; this.adapter = Adapters.hyperliquid;
  this.affiche = null;             /* cle du marche au detail actif */
  this.favoris = this._litFavoris();
  this.recents = this._litRecents();
}
MarketManager.prototype._litFavoris = function () {
  try { return new Set(JSON.parse(localStorage.getItem('swogeMktFav') || '[]')); } catch (e) { return new Set(); }
};
MarketManager.prototype._ecritFavoris = function () {
  try { localStorage.setItem('swogeMktFav', JSON.stringify([].concat.apply([], [Array.from(this.favoris)]))); } catch (e) {}
};
MarketManager.prototype._litRecents = function () {
  try { return JSON.parse(localStorage.getItem('swogeMktRecents') || '[]'); } catch (e) { return []; }
};
MarketManager.prototype.favori = function (cle) {
  if (this.favoris.has(cle)) this.favoris.delete(cle); else this.favoris.add(cle);
  this._ecritFavoris(); this.store._touche('liste');
};
/* Le cache local des metadonnees : on ne recharge pas la liste a chaque
   visite si elle est fraiche. Les prix, eux, viennent du WS. */
MarketManager.prototype.charge = function () {
  var self = this;
  var cache = null;
  try { cache = JSON.parse(localStorage.getItem('swogeMktCache') || 'null'); } catch (e) {}
  if (cache && cache.marches && Date.now() - cache.t < 10 * 60 * 1000) {
    self.store.poseMarches(cache.marches);   /* affichage immediat depuis le cache */
  }
  /* Puis on rafraichit en arriere-plan, sans bloquer le rendu. */
  return fetch(this.serveur + '/marches/perp', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (v) {
      self.store.poseMarches(v.marches);
      self.exchanges = v.exchanges;
      try { localStorage.setItem('swogeMktCache', JSON.stringify({ t: Date.now(), marches: v.marches })); } catch (e) {}
      return v;
    });
};
/* Ouvre le flux live. Le WS d Hyperliquid porte deja TOUS les prix : un seul
   abonnement fait ticker toute la liste. */
MarketManager.prototype.demarre = function () {
  this.ws = new WSManager(this.adapter, this.store);
  this.ws.ouvre();
};
/* Selectionner un marche : abonner son detail (carnet, trades), desabonner
   le precedent — on ne connecte le flux DETAILLE que pour ce qui est
   affiche. */
MarketManager.prototype.selectionne = function (cle) {
  var m = this.store.marches.get(cle); if (!m) return;
  if (this.affiche && this.affiche !== cle) {
    var vieux = this.store.marches.get(this.affiche);
    if (this.ws && vieux) this.ws.desabonneDetail(vieux.idExchange);
  }
  this.affiche = cle;
  if (this.ws) this.ws.abonneDetail(m.idExchange);
  /* Marches recents, garde locale. */
  this.recents = [cle].concat(this.recents.filter(function (x) { return x !== cle; })).slice(0, 8);
  try { localStorage.setItem('swogeMktRecents', JSON.stringify(this.recents)); } catch (e) {}
  this.store._touche('detail:' + cle);
};
/* La liste triee/filtree/cherchee, pour le selecteur. Tri par volume, var,
   funding, OI. Filtre par quote (USDT/USD/…). Recherche par symbole. */
MarketManager.prototype.liste = function (o) {
  o = o || {};
  var arr = Array.from(this.store.marches.values());
  var self = this;
  if (o.recherche) {
    var q = o.recherche.toUpperCase();
    arr = arr.filter(function (m) { return m.symbole.indexOf(q) !== -1 || m.base.indexOf(q) !== -1; });
  }
  if (o.quote && o.quote !== 'ALL') arr = arr.filter(function (m) { return m.quote === o.quote; });
  if (o.exchange && o.exchange !== 'ALL') arr = arr.filter(function (m) { return m.exchange === o.exchange; });
  if (o.favorisSeuls) arr = arr.filter(function (m) { return self.favoris.has(m.symbole); });
  var cle = o.tri || 'volume24h';
  var sens = o.sens === 'asc' ? 1 : -1;
  arr.sort(function (a, b) {
    var x = a[cle], y = b[cle];
    if (x == null && y == null) return 0;
    if (x == null) return 1; if (y == null) return -1;   /* les inconnus en bas */
    return (x - y) * sens;
  });
  return arr;
};

/* Le point d entree unique de la page. */
if (typeof window !== 'undefined') {
  window.SwogeMarkets = { MarketStore: MarketStore, MarketManager: MarketManager, WSManager: WSManager, Adapters: Adapters };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MarketStore: MarketStore, MarketManager: MarketManager, WSManager: WSManager, Adapters: Adapters };
}
