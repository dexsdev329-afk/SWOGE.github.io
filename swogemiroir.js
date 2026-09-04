/*
 * SWOGE AI — LE MIROIR, COTE ECRAN.
 *
 * « Generer un master wallet, tu envoies de l'ETH Robinhood, tu fais play, et
 *   SWOGE AI achete et vend en meme temps que lui. La cle privee, tu peux la
 *   telecharger ou la copier-coller. Quand tu appuies sur stop, ca revend tout
 *   et ca revient dans le wallet de ton compte. »
 *
 * ---- CE QUE CET ECRAN DOIT DIRE AVANT DE PROPOSER QUOI QUE CE SOIT ----
 *
 * Un bouton « play » sur un portefeuille dont un serveur tient la cle n'est pas
 * un bouton ordinaire. Cette page dit donc, AVANT le bouton et pas dans une
 * note en bas :
 *
 *   — que le serveur tient la cle pendant que le miroir tourne, et ce que ca
 *     veut dire si ce serveur tombe ;
 *   — que le joueur a la cle AUSSI, et qu'il peut partir sans nous demander —
 *     c'est la seule garantie qui ne depende pas de nous ;
 *   — dans quel mode on est. En mode d'essai, RIEN ne part sur la chaine, et un
 *     ecran qui laisserait croire le contraire serait pire que pas d'ecran.
 *
 * ---- IL N'OUVRE PAS DE SECONDE SOCKET ----
 *
 * `stakebubble.js` en tient deja une, ouverte avec le jeton de session, et il
 * l'expose sous `window.swogeFil`. Deux sockets voudraient dire deux
 * authentifications et le doute sur celle qui recoit la reponse.
 *
 * ---- ET LA CLE NE TRAINE PAS DANS LA PAGE ----
 *
 * Elle n'est demandee que sur un geste, montree dans un champ qu'on peut fermer,
 * jamais ecrite dans `localStorage`, jamais dans une adresse, jamais dans un
 * journal. Une cle privee qui survit a la fermeture de l'onglet est une cle qui
 * attend le prochain script tiers.
 */
(function () {
  'use strict';
  if (window.__swogeMiroir) return;
  window.__swogeMiroir = true;

  var hote = document.getElementById('gxMiroir');
  if (!hote) return;

  var ETAT = null;        /* le dernier etat rendu par le serveur */
  var CLE = null;         /* la cle privee, en memoire seulement, sur geste */
  var dit = '';           /* un mot de reponse, sous les boutons */
  var occupe = false;

  function style() {
    if (document.getElementById('mir-css')) return;
    var c = document.createElement('style');
    c.id = 'mir-css';
    /* ---- LES COULEURS VIENNENT DE LA PAGE, PAS D'ICI ----
       Premier rendu : ce panneau etait ecrit pour un fond sombre — libelles
       bleu pale, valeurs presque blanches, cadre de la cle en gris fonce — et
       la page SWOGE AI est BLANCHE. Les valeurs se lisaient a peine. Il prend
       donc les jetons de la page (`--ink`, `--ink-dim`, `--line`…), qui sont
       deja mesures pour ce fond, avec un repli au cas ou il servirait ailleurs. */
    c.textContent =
      '.mir{font-size:13px;line-height:1.55;color:var(--ink,#0A1F44)}' +
      '.mir p{margin:0 0 8px}' +
      '.mir .mir-note{color:var(--ink-dim,#6B7C99);font-size:11.5px;line-height:1.5}' +
      '.mir b{color:var(--ink,#0A1F44)}' +
      /* L'avertissement de garde. Il n'est pas gris et il n'est pas en bas :
         c'est la seule chose que quelqu'un doit lire avant de cliquer. */
      '.mir-garde{border:1px solid rgba(229,72,77,.35);background:rgba(229,72,77,.06);' +
        'border-radius:11px;padding:10px 12px;margin:0 0 10px;font-size:12px;line-height:1.55}' +
      '.mir-garde b{color:var(--loss,#E5484D)}' +
      '.mir-essai{border:1px solid rgba(199,119,0,.35);background:rgba(199,119,0,.07);' +
        'border-radius:11px;padding:9px 11px;margin:0 0 10px;font-size:12px;line-height:1.5}' +
      '.mir-essai b{color:var(--warn,#C77700)}' +
      '.mir-l{display:flex;align-items:center;gap:8px;justify-content:space-between;' +
        'padding:7px 0;border-bottom:1px solid var(--line,#E1E9F6)}' +
      '.mir-l:last-child{border-bottom:0}' +
      '.mir-l span{color:var(--ink-dim,#6B7C99);font-size:11.5px}' +
      '.mir-l b{font-variant-numeric:tabular-nums;text-align:right}' +
      '.mir-adr{font-family:ui-monospace,monospace;font-size:11.5px;overflow-wrap:anywhere;' +
        'color:var(--bleu,#1B5FE0);cursor:pointer}' +
      '.mir-b{display:inline-flex;align-items:center;justify-content:center;gap:6px;' +
        'min-height:40px;padding:9px 14px;border-radius:10px;border:0;cursor:pointer;' +
        'font:inherit;font-weight:800;font-size:12.5px;background:var(--bleu,#1B5FE0);color:#fff}' +
      '.mir-b[disabled]{opacity:.45;cursor:default}' +
      '.mir-b.vide{background:var(--hud-3,#EEF3FB);color:var(--ink,#0A1F44);' +
        'border:1px solid var(--line,#E1E9F6)}' +
      '.mir-b.stop{background:var(--loss,#E5484D);color:#fff}' +
      '.mir-cle{margin-top:10px;padding:10px 12px;border-radius:11px;' +
        'background:var(--hud-3,#EEF3FB);border:1px solid rgba(199,119,0,.45);font-size:12px}' +
      '.mir-cle textarea{width:100%;min-height:64px;resize:vertical;margin-top:7px;' +
        'font-family:ui-monospace,monospace;font-size:11.5px;padding:8px;border-radius:8px;' +
        'background:#fff;color:var(--ink,#0A1F44);border:1px solid var(--line,#E1E9F6)}' +
      '.mir-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}' +
      '.mir-pos{padding:8px 0;border-bottom:1px solid var(--line,#E1E9F6);font-size:12px}' +
      '.mir-pos:last-child{border-bottom:0}' +
      '.mir-pos i{font-style:normal;color:var(--ink-dim,#6B7C99)}' +
      '.mir-j{font-size:11.5px;color:var(--ink-dim,#6B7C99);padding:5px 0;line-height:1.5;' +
        'overflow-wrap:anywhere}' +
      '.mir-j time{color:var(--ink-faint,#93A2BC);margin-right:6px}' +
      '.mir-dit{margin-top:9px;font-size:12px;color:var(--warn,#C77700);min-height:1em}';
    document.head.appendChild(c);
  }

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var court = function (a) { return String(a || '').slice(0, 8) + '…' + String(a || '').slice(-6); };
  var heure = function (t) {
    var d = new Date(t);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  var nb = function (x) {
    var n = parseFloat(x);
    return isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—';
  };

  function envoie(o) {
    if (!window.swogeFil || !window.swogeFil.pret()) { dit = 'Not connected to the game server.'; peint(); return false; }
    window.swogeFil.envoie(o);
    return true;
  }

  /* ---- CE QUE LA PAGE MONTRE ----
   * Un seul rendu pour tous les etats : c'est ce qui empeche deux ecrans de se
   * contredire, et ca oblige a decider ce qui se voit dans CHAQUE cas. */
  function peint() {
    style();
    var h = '';

    if (!ETAT) {
      hote.innerHTML = '<div class="mir"><p class="mir-note">Reading your mirror…</p></div>';
      return;
    }
    if (!ETAT.pret) {
      hote.innerHTML = '<div class="mir"><p>The mirror is <b>off on this server</b>.</p>'
        + '<p class="mir-note">' + esc(ETAT.pourquoi || '') + '</p></div>';
      return;
    }

    /* Le mode, avant tout le reste. */
    if (!ETAT.execute) {
      h += '<div class="mir-essai"><b>Dry run.</b> The mirror follows the colony, prices every '
        + 'order against Uniswap and writes it in the log below — and <b>sends nothing on-chain</b>. '
        + 'Your ETH does not move. This is how you watch it work before a single cent is at stake.</div>';
    }

    if (!ETAT.existe) {
      h += '<p>A <b>mirror wallet</b> is an address of your own. You fund it with ETH (RH), you press '
        + 'Play, and SWOGE AI buys and sells in it at the same moment it does in its own book. '
        + 'Press Stop and it sells everything and sends the ETH back to your account wallet.</p>'
        + '<p class="mir-note">Each order is sized by the colony\'s <b>Banker</b>: it commits the same '
        + 'share of your balance as it does of its own, so its score scale, its caps and its '
        + 'drawdown regime apply to your wallet too. A gas reserve is never spent — it is what pays '
        + 'to <b>sell</b>.</p>'
        + '<div class="mir-garde"><b>Read this before you create one.</b> To trade while your tab is '
        + 'closed, this server holds the wallet\'s private key. If this server is ever compromised, '
        + 'that wallet can be emptied. Two things are true at the same time: keep only what you accept '
        + 'to lose here — it is a stake, not a vault — and <b>you get the private key too</b>, so you '
        + 'can move your funds out at any second without asking us.</div>'
        + '<div class="mir-row"><button class="mir-b" data-m="cree"'
        + (occupe ? ' disabled' : '') + '>Create my mirror wallet</button></div>';
      hote.innerHTML = '<div class="mir">' + h + '</div>' ;
      poseDit();
      return;
    }

    h += '<div class="mir-l"><span>Mirror wallet</span>'
      + '<b class="mir-adr" data-m="copieAdr" title="click to copy">' + esc(court(ETAT.adresse)) + '</b></div>'
      + '<div class="mir-l"><span>Balance</span><b>'
      + (ETAT.solde === null || ETAT.solde === undefined ? 'unknown' : nb(ETAT.solde) + ' ETH (RH)')
      + '</b></div>'
      + '<div class="mir-l"><span>Status</span><b>'
      + (ETAT.actif ? (ETAT.execute ? 'following · real orders' : 'following · dry run') : 'stopped')
      + '</b></div>'
      /* La taille d'un ordre n'est pas un reglage de cette page : c'est le
         Banquier de la colonie qui la decide, et le miroir engage la meme PART
         de sa caisse que lui de la sienne. Le dire evite la question « pourquoi
         seulement 0,004 ETH ? », dont la reponse est « parce que la colonie a
         mis la meme proportion, a cette note-la ». */
      + '<div class="mir-l"><span>Per order</span><b>the Banker\'s own share, '
      + 'up to ' + esc(ETAT.ordreMax) + ' ETH</b></div>';

    if (!ETAT.actif) {
      h += '<p class="mir-note" style="margin-top:9px">Send ETH (RH) to the address above — at least '
        + esc(ETAT.min) + ', at most ' + esc(ETAT.max) + '. '
        + esc(ETAT.gaz) + ' ETH is never spent: it is what pays the gas to <b>sell</b>.'
        + (ETAT.places === 0 ? ' <b>No free slot right now</b> — too many mirrors on the same pools would bid against each other.' : '')
        + '</p>';
    }

    h += '<div class="mir-row">'
      + (ETAT.actif
          ? '<button class="mir-b stop" data-m="stop"' + (occupe ? ' disabled' : '') + '>Stop &amp; sell everything</button>'
          : '<button class="mir-b" data-m="play"' + (occupe || ETAT.places === 0 ? ' disabled' : '') + '>Play</button>')
      + '<button class="mir-b vide" data-m="cle">Show my private key</button>'
      + '</div>';

    if (CLE) {
      h += '<div class="mir-cle"><b>Your private key.</b> '
        + 'Anyone who has it owns that wallet. Save it somewhere only you can read, and do not paste '
        + 'it into a site that asks for it.'
        + '<textarea readonly rows="2">' + esc(CLE) + '</textarea>'
        + '<div class="mir-row"><button class="mir-b vide" data-m="copieCle">Copy</button>'
        + '<button class="mir-b vide" data-m="telecharge">Download</button>'
        + '<button class="mir-b vide" data-m="cacheCle">Hide</button></div></div>';
    }

    if (ETAT.ouvertes && ETAT.ouvertes.length) {
      h += '<h3 style="margin:14px 0 4px;font-size:12px;letter-spacing:.5px;color:#8DA0C4">'
        + 'OPEN IN YOUR MIRROR</h3>';
      h += ETAT.ouvertes.map(function (o) {
        return '<div class="mir-pos"><b>$' + esc(o.sym || court(o.adr)) + '</b> '
          + '<i>' + nb(o.entree) + ' ETH in · ' + heure(o.t) + (o.simule ? ' · dry run' : '') + '</i></div>';
      }).join('');
    }

    if (ETAT.journal && ETAT.journal.length) {
      h += '<h3 style="margin:14px 0 4px;font-size:12px;letter-spacing:.5px;color:#8DA0C4">LOG</h3>';
      h += ETAT.journal.map(function (j) {
        return '<div class="mir-j"><time>' + heure(j.t) + '</time>' + esc(j.txt) + '</div>';
      }).join('');
    }

    hote.innerHTML = '<div class="mir">' + h + '</div>';
    poseDit();
  }

  function poseDit() {
    if (!dit) return;
    var d = document.createElement('div');
    d.className = 'mir-dit';
    d.textContent = dit;
    (hote.querySelector('.mir') || hote).appendChild(d);
  }

  function copie(txt, quoi) {
    try {
      navigator.clipboard.writeText(txt);
      dit = quoi + ' copied.';
    } catch (e) { dit = 'Could not copy — select it and copy by hand.'; }
    peint();
  }

  hote.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-m]');
    if (!b) return;
    var m = b.getAttribute('data-m');
    dit = '';

    if (m === 'copieAdr') return copie(ETAT.adresse, 'Address');
    if (m === 'copieCle') return copie(CLE || '', 'Private key');
    if (m === 'cacheCle') { CLE = null; peint(); return; }
    if (m === 'telecharge') {
      /* Un fichier, pas un presse-papiers : le presse-papiers se perd au copier
         suivant, et c'est justement ce qu'on ne veut pas d'une cle. */
      try {
        var texte = 'SWOGE AI — mirror wallet\r\n'
          + 'address: ' + ETAT.adresse + '\r\n'
          + 'private key: ' + CLE + '\r\n\r\n'
          + 'Anyone who has this key owns that wallet. Keep this file offline.\r\n';
        var u = URL.createObjectURL(new Blob([texte], { type: 'text/plain' }));
        var a = document.createElement('a');
        a.href = u; a.download = 'swoge-mirror-' + String(ETAT.adresse).slice(0, 10) + '.txt';
        a.click(); URL.revokeObjectURL(u);
        dit = 'Saved.';
      } catch (e) { dit = 'Could not download — copy it instead.'; }
      peint(); return;
    }

    if (m === 'cree') {
      occupe = true; dit = 'Creating…'; peint();
      envoie({ type: 'miroirCree' }); return;
    }
    if (m === 'cle') { envoie({ type: 'miroirCle' }); return; }
    if (m === 'play') {
      occupe = true; dit = 'Starting…'; peint();
      envoie({ type: 'miroirPlay' }); return;
    }
    if (m === 'stop') {
      occupe = true;
      dit = ETAT.execute ? 'Selling everything and sweeping back…' : 'Stopping…';
      peint();
      envoie({ type: 'miroirStop' }); return;
    }
  });

  /* ---- LE FIL ----
   * On redemande l'etat a chaque authentification : une reconnexion ne doit pas
   * laisser l'ecran sur ce qu'il savait il y a dix minutes. */
  function reclame() {
    if (!window.swogeFil || !window.swogeFil.pret()) return;
    envoie({ type: 'miroirEtat' });
  }

  if (window.swogeFil) {
    window.swogeFil.ecoute(function (m) {
      if (!m || !m.type) return;
      if (m.type === 'auth') { reclame(); return; }
      if (m.type === 'miroirEtat') { ETAT = m; occupe = false; peint(); return; }
      if (m.type === 'miroirCle') {
        CLE = m.cle;
        dit = m.neuf ? 'Wallet created — save this key now, it is the only copy you control.' : '';
        occupe = false; peint(); return;
      }
      if (m.type === 'miroirStop') {
        occupe = false;
        dit = m.execute
          ? ('Stopped — ' + (m.vendus || []).length + ' position(s) sold'
             + (m.balaye && m.balaye.envoye ? ', ' + nb(m.balaye.envoye) + ' ETH swept back' : '')
             + ((m.rates || []).length ? ', ' + m.rates.length + ' could not be sold' : '') + '.')
          : 'Stopped — dry run, so nothing was sold and nothing was swept.';
        peint(); return;
      }
      if (m.type === 'error' && occupe) { occupe = false; dit = m.error || 'Refused.'; peint(); return; }
    });
  }

  peint();
  reclame();
  /* Le solde du portefeuille bouge sans qu'on fasse rien — un depot arrive, un
     ordre passe. On le redemande, doucement. */
  setInterval(function () { if (!occupe) reclame(); }, 20000);
})();
