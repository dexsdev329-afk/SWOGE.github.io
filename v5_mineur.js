/* ============================================================
   SWOGE V5 — MINAGE DU SEL DU HOOK, DANS LE NAVIGATEUR (18/10/2026)

   Le meme calcul que contrats/v5/script/MineHookSalt.s.sol (HookMiner), au bit
   pres :
     sel_i  = keccak256(abi.encode("swoge.v5.hook", i))      i = 0, 1, 2, ...
     s      = keccak256(abi.encode(proprietaire, sel_i))
     proxy  = keccak256(0xff ‖ deployeur ‖ s ‖ keccak256(PROXY_INIT))[12:]
     hook   = keccak256(0xd6 0x94 ‖ proxy ‖ 0x01)[12:]
   et le premier i dont l'adresse porte exactement 0x2ACC dans ses 14 bits de
   poids faible gagne. Le premier, pas un autre : la page et le script forge
   trouvent donc le MEME sel pour le meme couple (deployeur, proprietaire), et
   la repetition sur fork se compare au deploiement reel.

   Charge comme Web Worker par v5_deploy.html (le calcul ne gele pas la page),
   ou comme module par l'essai v5_deploy_page.test.js, qui le confronte a
   ethers.utils.keccak256 et au sel que trouve forge.

   Keccak-f[1600] en mots de 32 bits : aucune bibliotheque, rien a charger dans
   le worker. Aucune cle, aucun reseau.
   ============================================================ */
(function (racine) {
  "use strict";
  var RC = [1, 0, 32898, 0, 32906, 2147483648, 2147516416, 2147483648, 32907, 0, 2147483649, 0, 2147516545, 2147483648,
    32777, 2147483648, 138, 0, 136, 0, 2147516425, 0, 2147483658, 0, 2147516555, 0, 139, 2147483648, 32905, 2147483648,
    32771, 2147483648, 32770, 2147483648, 128, 2147483648, 32778, 0, 2147483658, 2147483648, 2147516545, 2147483648,
    32896, 2147483648, 2147483649, 0, 2147516424, 2147483648];
  // decalages rho, par voie x + 5y
  var ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
  // pi : la voie (x, y) part en (y, 2x + 3y)
  var PI = new Array(25);
  for (var x = 0; x < 5; x++) for (var y = 0; y < 5; y++) PI[x + 5 * y] = y + 5 * ((2 * x + 3 * y) % 5);

  var A = new Uint32Array(50), B = new Uint32Array(50), C = new Uint32Array(10);
  function f1600() {
    for (var r = 0; r < 24; r++) {
      var x, y, i, lo, hi, n;
      for (x = 0; x < 5; x++) {
        C[2 * x] = A[2 * x] ^ A[2 * x + 10] ^ A[2 * x + 20] ^ A[2 * x + 30] ^ A[2 * x + 40];
        C[2 * x + 1] = A[2 * x + 1] ^ A[2 * x + 11] ^ A[2 * x + 21] ^ A[2 * x + 31] ^ A[2 * x + 41];
      }
      for (x = 0; x < 5; x++) {
        var p = (x + 4) % 5, q = (x + 1) % 5;
        var dl = C[2 * p] ^ ((C[2 * q] << 1) | (C[2 * q + 1] >>> 31));
        var dh = C[2 * p + 1] ^ ((C[2 * q + 1] << 1) | (C[2 * q] >>> 31));
        for (y = 0; y < 25; y += 5) { A[2 * (x + y)] ^= dl; A[2 * (x + y) + 1] ^= dh; }
      }
      for (i = 0; i < 25; i++) {
        lo = A[2 * i]; hi = A[2 * i + 1]; n = ROT[i];
        if (n >= 32) { var t = lo; lo = hi; hi = t; n -= 32; }
        var j = PI[i];
        if (n === 0) { B[2 * j] = lo; B[2 * j + 1] = hi; }
        else { B[2 * j] = (lo << n) | (hi >>> (32 - n)); B[2 * j + 1] = (hi << n) | (lo >>> (32 - n)); }
      }
      for (y = 0; y < 25; y += 5) for (x = 0; x < 5; x++) {
        var a = 2 * (x + y), b = 2 * (((x + 1) % 5) + y), c = 2 * (((x + 2) % 5) + y);
        A[a] = B[a] ^ (~B[b] & B[c]);
        A[a + 1] = B[a + 1] ^ (~B[b + 1] & B[c + 1]);
      }
      A[0] ^= RC[2 * r]; A[1] ^= RC[2 * r + 1];
    }
  }
  /** keccak256 (le remplissage 0x01 de Keccak, pas le 0x06 de SHA-3), Uint8Array -> Uint8Array(32) */
  function keccak(m) {
    A.fill(0);
    var RATE = 136, i, k, blocs = Math.floor(m.length / RATE) + 1, pad = new Uint8Array(blocs * RATE);
    pad.set(m); pad[m.length] ^= 0x01; pad[pad.length - 1] ^= 0x80;
    for (k = 0; k < pad.length; k += RATE) {
      for (i = 0; i < RATE; i += 4) {
        var w = pad[k + i] | (pad[k + i + 1] << 8) | (pad[k + i + 2] << 16) | (pad[k + i + 3] << 24);
        A[i >> 2] ^= w;
      }
      f1600();
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 32; i++) out[i] = (A[i >> 2] >>> (8 * (i & 3))) & 255;
    return out;
  }
  function octets(hex) {
    hex = String(hex).replace(/^0x/, "");
    var o = new Uint8Array(hex.length / 2);
    for (var i = 0; i < o.length; i++) o[i] = parseInt(hex.substr(2 * i, 2), 16);
    return o;
  }
  function hexa(o) { var s = "0x"; for (var i = 0; i < o.length; i++) s += (o[i] < 16 ? "0" : "") + o[i].toString(16); return s; }

  var PROXY_INIT = octets("67363d3d37363d34f03d5260086018f3");
  var FLAGS = 0x2ACC, MASK = 0x3FFF;
  var ETIQUETTE = "swoge.v5.hook";

  /* abi.encode("swoge.v5.hook", i) : [0x40][i][13]["swoge.v5.hook" cale a gauche], 128 octets */
  var encSel = new Uint8Array(128);
  encSel[31] = 0x40; encSel[95] = ETIQUETTE.length;
  for (var e = 0; e < ETIQUETTE.length; e++) encSel[96 + e] = ETIQUETTE.charCodeAt(e);
  function sel(i) {
    for (var b = 32; b < 64; b++) encSel[b] = 0;
    var v = i, pos = 63;
    while (v > 0) { encSel[pos--] = v % 256; v = Math.floor(v / 256); }
    return keccak(encSel);
  }
  /** SwogeDeployerV5.addressOf(par, sel), sans appel */
  function adresseDe(deployeur, par, s32) {
    var e1 = new Uint8Array(64); e1.set(octets(par), 12); e1.set(s32, 32);
    var s = keccak(e1);
    var e2 = new Uint8Array(85); e2[0] = 0xff; e2.set(octets(deployeur), 1); e2.set(s, 21); e2.set(keccak(PROXY_INIT), 53);
    var proxy = keccak(e2).subarray(12);
    var e3 = new Uint8Array(23); e3[0] = 0xd6; e3[1] = 0x94; e3.set(proxy, 2); e3[22] = 0x01;
    return keccak(e3).subarray(12);
  }
  function porteDrapeaux(a20) { return (((a20[18] << 8) | a20[19]) & MASK) === FLAGS; }
  /** Le premier i >= depuis dont le hook porte 0x2ACC (HookMiner.mine), ou null apres `combien` essais. */
  function mine(deployeur, proprietaire, depuis, combien) {
    for (var i = depuis; i < depuis + combien; i++) {
      var s = sel(i), h = adresseDe(deployeur, proprietaire, s);
      if (porteDrapeaux(h)) return { i: i, salt: hexa(s), hook: hexa(h) };
    }
    return null;
  }
  var api = { keccak: keccak, hexa: hexa, octets: octets, sel: function (i) { return hexa(sel(i)); },
    adresseDe: function (d, p, s) { return hexa(adresseDe(d, p, octets(s))); }, mine: mine, FLAGS: FLAGS, MASK: MASK };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  if (typeof racine.WorkerGlobalScope !== "undefined" && racine instanceof racine.WorkerGlobalScope) {
    /* Par tranches de 4 096 : la page voit avancer le compteur. Le plafond est celui de HookMiner
       (4 000 000 essais) ; la moyenne est 2^14 = 16 384. */
    racine.onmessage = function (ev) {
      var d = ev.data || {}, i = 0, PAS = 4096, MAX = 4000000;
      while (i < MAX) {
        var r = mine(d.deployeur, d.proprietaire, i, PAS);
        if (r) { racine.postMessage({ fini: true, i: r.i, salt: r.salt, hook: r.hook }); return; }
        i += PAS;
        racine.postMessage({ essais: i });
      }
      racine.postMessage({ fini: true, echec: "no salt in " + MAX + " tries" });
    };
  } else {
    racine.SwogeMineur = api;
  }
})(typeof self !== "undefined" ? self : this);
