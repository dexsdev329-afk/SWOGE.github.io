/*
 * SWOGE PREDICT — L'ÉTAGE 2 PANCAKESWAP, CÔTÉ ÉCRAN.
 *
 * « Faire une réelle connexion au jeu, comme SWOGE AI. » Ce panneau est le
 * frère du miroir (`swogemiroir.js`) : un portefeuille dont le serveur tient la
 * clé, un bouton Play, un bouton Stop. Mais il joue de vrais BNB sur PancakeSwap
 * Prediction (BSC), sur un portefeuille DÉDIÉ et isolé du miroir de la colonie.
 *
 * ---- CE QU'IL DIT AVANT DE PROPOSER QUOI QUE CE SOIT ----
 *   — le serveur tient la clé pendant que ça tourne (et ce que ça veut dire
 *     s'il tombe) ; le joueur a la clé AUSSI, il peut partir sans nous ;
 *   — dans quel mode on est : sans le verrou EXECUTE côté hôte, RIEN ne part
 *     sur la chaîne — c'est un essai à blanc, et l'écran le dit ;
 *   — les vrais paris sont réservés au propriétaire (AI_OWNER), revérifié côté
 *     serveur à chaque geste. La page ne fait que montrer les boutons.
 *
 * ---- IL N'OUVRE PAS DE SECONDE SOCKET ----
 * `stakebubble.js` en tient une, ouverte avec le jeton de session, exposée sous
 * `window.swogeFil`. On s'y abonne, on n'en ouvre pas d'autre.
 *
 * ---- LA CLÉ NE TRAÎNE PAS ----
 * Demandée sur un geste, montrée dans un champ qu'on peut fermer, jamais dans
 * `localStorage`, jamais dans un état, jamais dans un journal.
 */
(function () {
  'use strict';
  if (window.__swogePancake) return;
  window.__swogePancake = true;

  var hote = document.getElementById('pkReel');
  if (!hote) return;

  var ETAT = null;      /* dernier pancakeReelEtat du serveur */
  var CLE = null;       /* la clé privée, en mémoire seulement, sur geste */
  var dit = '';         /* un mot de réponse, sous les boutons */
  var occupe = false;
  var connecte = false;

  function ech(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function court(a) { a = String(a || ''); return a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a; }
  function nb(v, d) { if (v == null) return '—'; return Number(v).toLocaleString('en-US', { maximumFractionDigits: d == null ? 4 : d }); }

  function envoie(o) {
    if (!window.swogeFil || !window.swogeFil.pret()) { dit = 'Not connected to the game server.'; peint(); return false; }
    window.swogeFil.envoie(o); return true;
  }

  function boutons() {
    if (!ETAT || !ETAT.aWallet) return '';
    var b = '';
    if (ETAT.actif) b += '<button class="go stop" data-pk="stop">STOP · claim + sweep to my wallet</button>';
    else b += '<button class="go" data-pk="play">PLAY · ' + (ETAT.execute ? 'bet real BNB' : 'dry run (EXECUTE off)') + '</button>';
    b += '<button class="pk-lien" data-pk="cle">Show private key</button>';
    return '<div class="pr-boutons">' + b + '</div>';
  }

  function peint() {
    var h = '<h3>Play it for real · PancakeSwap wallet (stage 2)</h3>';

    if (!connecte) {
      h += '<p class="pr-note" style="margin-top:0">This runs <b>real BNB</b> on PancakeSwap Prediction (BSC), on a wallet the server signs for — like SWOGE AI\'s mirror, but a <b>dedicated, isolated</b> wallet. <b>Connect your wallet</b> in the header to arm it. Real bets are <b>owner-only</b> (AI_OWNER).</p>';
      hote.innerHTML = h + (dit ? '<div class="pr-note" style="margin-top:8px">' + ech(dit) + '</div>' : '');
      return;
    }
    if (!ETAT || !ETAT.proprietaire) {
      h += '<p class="pr-note" style="margin-top:0">The real PancakeSwap bot is <b>owner-only</b> — your address is not in <code>AI_OWNER</code>. The paper card above is live for everyone; this one is the owner\'s real-money wallet.</p>';
      hote.innerHTML = h;
      return;
    }
    /* Propriétaire, connecté. Le préambule d'honnêteté, toujours. */
    h += '<p class="pr-note" style="margin-top:0">A <b>dedicated</b> BSC wallet, <b>separate</b> from the SWOGE AI mirror. The server holds its key while it plays — if the server goes down it stops betting; <b>you hold the key too</b> and can leave without us. Real bets need all three: <code>EXECUTE</code> on the host, your owner address, and Play. Same EV gate + martingale as the paper card. It never bets more than the wallet holds, and it can bust — a martingale does not always recover.</p>';

    if (!ETAT.aWallet) {
      h += '<p class="pr-note"><b>Mode:</b> ' + (ETAT.execute ? '<span class="pos">ARMED (EXECUTE=1)</span> — Play signs real BNB.' : '<span class="neg">dry run</span> — EXECUTE is off on the host, nothing signs.') + '</p>';
      h += '<div class="pr-boutons"><button class="go" data-pk="cree">Generate PancakeSwap wallet</button></div>';
    } else {
      var ba = ETAT.banque || {}, mt = ETAT.martingale || {};
      h += '<div class="pr-note" style="margin:8px 0">Wallet <b>' + ech(court(ETAT.adresse)) + '</b> · <button class="pk-lien" data-pk="copie" data-adr="' + ech(ETAT.adresse) + '">copy</button> · balance <b>' + nb(ETAT.solde) + ' BNB</b> · ' + (ETAT.actif ? '<span class="pos">PLAYING</span>' : 'stopped') + ' · ' + (ETAT.execute ? '<span class="pos">real</span>' : '<span class="neg">dry run</span>') + '</div>';
      h += '<div class="pr-stats">' + [
        ['P/L', (ba.pl >= 0 ? '+' : '') + nb(ba.pl) + ' BNB', ba.pl >= 0 ? 'pos' : 'neg'],
        ['Win rate', nb(ba.winRate, 1) + '%'], ['Bets', ba.mises || 0],
        ['Wins', ba.wins || 0, 'pos'], ['Losses', ba.losses || 0, 'neg'], ['Skipped · bad odds', ba.skips || 0],
      ].map(function (x) { return '<div class="pr-s"><div class="k">' + x[0] + '</div><div class="v ' + (x[2] || '') + '">' + x[1] + '</div></div>'; }).join('') + '</div>';
      if (mt.on) h += '<div class="pr-mart" style="margin-top:10px">Martingale ×' + mt.facteur + ' · next stake <b>' + nb(mt.miseCourante) + ' BNB</b> · step ' + mt.palier + '/' + mt.paliers + (mt.busts > 0 ? ' · <span class="bust">busted ' + mt.busts + '×</span>' : '') + '<br><span style="color:var(--dim)">A win resets to base; past the cap the ladder busts back to base — it does not always recover.</span></div>';
      if (!ETAT.execute) h += '<p class="pr-note"><span class="neg">Dry run:</span> EXECUTE is off on the host, so Play decides and logs but signs nothing.</p>';
      h += boutons();
    }

    if (CLE) {
      h += '<div class="pk-cle"><div class="pr-note" style="margin:0 0 6px"><b>Private key — shown once.</b> Save it now; it is the only copy you control. Never share it.</div>'
         + '<textarea readonly rows="2" class="pk-cle-in">' + ech(CLE) + '</textarea>'
         + '<div class="pr-boutons"><button class="pk-lien" data-pk="cleferme">Hide key</button></div></div>';
    }
    if (dit) h += '<div class="pr-note" style="margin-top:8px">' + ech(dit) + '</div>';
    hote.innerHTML = h;
  }

  hote.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-pk]') : null;
    if (!b) return;
    var geste = b.getAttribute('data-pk');
    if (geste === 'copie') {
      var a = b.getAttribute('data-adr') || '';
      try { navigator.clipboard.writeText(a); dit = 'Address copied.'; peint(); } catch (x) {}
      return;
    }
    if (geste === 'cleferme') { CLE = null; peint(); return; }
    if (geste === 'cree') {
      if (!confirm('Generate a dedicated PancakeSwap wallet on BSC? The server holds its key (encrypted); you will see the key ONCE to save it. Fund it with BNB to play.')) return;
      occupe = true; dit = 'Creating…'; peint(); envoie({ type: 'pancakeReelCree' }); return;
    }
    if (geste === 'cle') { envoie({ type: 'pancakeReelCle' }); return; }
    if (geste === 'play') {
      var m = ETAT && ETAT.execute
        ? 'Arm REAL BNB bets on PancakeSwap Prediction? It will bet from the dedicated wallet when the EV gate and martingale say so. You can Stop anytime.'
        : 'Start in dry run? EXECUTE is off on the host, so nothing signs — it only decides and logs.';
      if (!confirm(m)) return;
      occupe = true; dit = 'Starting…'; peint(); envoie({ type: 'pancakeReelPlay' }); return;
    }
    if (geste === 'stop') {
      if (!confirm('Stop and sweep the BNB back to your account wallet?')) return;
      occupe = true; dit = 'Stopping…'; peint(); envoie({ type: 'pancakeReelStop' }); return;
    }
  });

  function reclame() { if (window.swogeFil && window.swogeFil.pret()) envoie({ type: 'pancakeReelEtat' }); }

  if (window.swogeFil) {
    window.swogeFil.ecoute(function (m) {
      if (!m || !m.type) return;
      if (m.type === 'auth') { connecte = true; reclame(); return; }
      if (m.type === 'pancakeReelEtat') { ETAT = m; occupe = false; peint(); return; }
      if (m.type === 'pancakeReelCle') {
        CLE = m.cle;
        dit = m.neuf ? 'Wallet created — save this key now, it is the only copy you control.' : '';
        occupe = false; peint(); return;
      }
      if (m.type === 'pancakeReelPlay') { dit = m.execute ? 'Playing — real BNB when the odds and martingale say so.' : 'Playing (dry run) — nothing signs.'; occupe = false; peint(); return; }
      if (m.type === 'pancakeReelStop') { dit = m.execute ? ('Stopped — ' + (m.reclames || 0) + ' round(s) claimed' + (m.balaye && !m.balaye.vide ? ', ' + nb(m.balaye.montant) + ' BNB swept back' : '') + '.') : 'Stopped — dry run, nothing was signed or swept.'; occupe = false; peint(); return; }
      if (m.type === 'error' && /login required/i.test(m.error || '')) { connecte = false; ETAT = null; occupe = false; dit = ''; peint(); return; }
      if (m.type === 'error' && occupe) { occupe = false; dit = m.error || 'Refused.'; peint(); return; }
    });
  }

  peint();
  reclame();
  setInterval(function () { if (!occupe) reclame(); }, 20000);
})();
