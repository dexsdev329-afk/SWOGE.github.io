'use strict';
/* ==========================================================================
 * L'ASSISTANT DU PORTEFEUILLE (04/10/2026) — comprendre, JAMAIS signer
 * ==========================================================================
 *
 * Demande du proprietaire : « un agent dans le wallet a qui on ecrit (ou on
 * parle) "envoie 0,1 ETH a ce wallet", "achete plus de ce jeton", "fais un
 * pont", et qui est assez intelligent pour le faire ».
 *
 * CE QU'IL FAIT — et la limite qui tient tout :
 *
 *   Il COMPREND la phrase et la transforme en une ACTION LISIBLE (verbe,
 *   jeton, montant, destination). Il ne signe rien, ne detient aucune cle,
 *   n'envoie aucun ordre. La page est non-custodiale : `signer` est lie au
 *   portefeuille du joueur (`provider.getSigner()`), et c'est CE portefeuille,
 *   pas nous, qui demande la confirmation et signe. L'assistant se contente
 *   de PRE-REMPLIR l'ecran Send / Swap / Bridge existant ; le joueur relit
 *   tout, appuie sur le vrai bouton, et SON portefeuille ouvre SA propre
 *   confirmation. Deux gardes, aucune nouvelle voie de signature.
 *
 *   « Assez intelligent pour le faire » = assez intelligent pour te
 *   comprendre et tout preparer a l'exact ; le dernier geste reste le tien.
 *   Un agent qui enverrait de l'argent reel depuis une phrase analysee (ou
 *   une phrase vocale mal entendue) sans que personne ne relise l'adresse
 *   serait un vol en attente — une adresse de travers, « 0,1 » entendu
 *   « 1,0 ». Ici c'est impossible par construction.
 *
 * LES REGLES DE SECURITE DU PROJET, APPLIQUEES ICI :
 *   - L'adresse de destination ne vient QUE de la phrase du joueur, relue en
 *     entier a l'ecran — jamais d'un message recu, d'un contact, d'ailleurs.
 *     (C'est la regle « un geste n'agit que sur une adresse voulue, jamais
 *     sur une adresse venue du message ».)
 *   - Deux adresses dans la phrase : on refuse de deviner laquelle.
 *   - Pas d'adresse valable pour un envoi : on refuse, on ne met aucune
 *     adresse par defaut.
 *   - Rien ici ne porte un drapeau « executer » : la couche DOM ne fait que
 *     pre-remplir et naviguer.
 *
 * Ce fichier ne touche NI la chaine NI le reseau : il lit une chaine de
 * caracteres et rend un objet. Il se teste donc entierement sous node.
 * ======================================================================== */

(function (racine) {

  /* Une adresse EVM : 0x suivi de 40 hexa. On ne verifie pas la somme de
     controle ici (la page le fait avec ethers.isAddress) ; on la REPERE. */
  var RE_EVM = /0x[0-9a-fA-F]{40}\b/g;
  /* Une adresse / un mint Solana : base58 (ni 0, ni O, ni I, ni l), 32 a 44
     caracteres. On exige une frontiere de mot pour ne pas happer un bout
     d'une phrase. Un faux positif reste sans danger : la page revalide, et
     le joueur relit l'adresse en entier avant de signer. */
  var RE_SVM = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

  /* Les verbes, en deux langues. L'ordre compte : « bridge »/« pont » avant
     « send », car « envoie-le par un pont » est un pont, pas un envoi. */
  var VERBES = [
    { a: 'bridge', mots: ['bridge', 'pont', 'ponter', 'passe sur', 'passe vers', 'passer sur', 'traverse'] },
    { a: 'swap',   mots: ['swap', 'echange', 'échange', 'echanger', 'échanger', 'convertis', 'convertir', 'trade', 'troque'] },
    { a: 'burn',   mots: ['burn', 'brule', 'brûle', 'bruler', 'brûler', 'incinere', 'incinère'] },
    { a: 'buy',    mots: ['buy', 'achete', 'achète', 'acheter', 'acheter plus', 'prends', 'prendre', 'get me', 'ape'] },
    { a: 'send',   mots: ['send', 'envoie', 'envoyer', 'envois', 'transfere', 'transfère', 'transferer', 'transférer', 'transfer', 'vire', 'virer', 'paie', 'payer'] }
  ];

  /* Ce qui se brûle : SWOGE et SWOGEBET seulement, comme la page (`BRULABLES`).
     Proposer de brûler autre chose (de l'ETH) serait un piège : une action
     irréversible qui ne mène à rien. On le refuse, et on le dit. */
  var BRULABLES = ['swoge', 'swogebet'];

  /* Des alias de jetons courants, en plus du symbole et du nom lus sur la
     liste reelle de la page. « eth » peut viser l'ETH natif de la Robinhood
     Chain comme celui d'Ethereum : la page tranche selon l'ecran et la
     chaine ; ici on rend la cle la plus probable et on laisse relire. */
  var ALIAS = {
    eth: ['eth', 'ether', 'ethereum', 'weth'],
    sol: ['sol', 'solana'],
    swoge: ['swoge', 'swole doge', 'swoledoge', '$swoge'],
    swogebet: ['swogebet', '$swogebet', 'swoge bet'],
    usdc: ['usdc', 'usd coin', 'dollar coin'],
    usdt: ['usdt', 'tether']
  };

  var sansAccent = function (s) {
    return String(s || '').toLowerCase()
      .normalize ? String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
               : String(s || '').toLowerCase();
  };

  /* Retrouver un jeton nomme dans la phrase, parmi la liste REELLE de la page
     (symbole, nom, cle) et les alias. Rend la cle, ou null. On prend le
     symbole le plus long qui matche, pour que « swogebet » ne soit pas lu
     « swoge ». */
  function trouveJeton(texte, jetons) {
    var t = ' ' + sansAccent(texte) + ' ';
    var candidats = [];
    (jetons || []).forEach(function (j) {
      var noms = [j.sym, j.nom, j.cle].filter(Boolean).map(sansAccent);
      var al = ALIAS[sansAccent(j.cle)] || ALIAS[sansAccent(j.sym)] || [];
      noms = noms.concat(al.map(sansAccent));
      noms.forEach(function (n) {
        n = n.replace(/^\$/, '');
        if (n.length < 2) return;
        if (t.indexOf(' ' + n + ' ') >= 0 || t.indexOf(' ' + n + ',') >= 0
            || t.indexOf('$' + n + ' ') >= 0 || t.indexOf(' ' + n + '.') >= 0) {
          candidats.push({ cle: j.cle, n: n.length });
        }
      });
    });
    if (!candidats.length) return null;
    candidats.sort(function (a, b) { return b.n - a.n; });
    return candidats[0].cle;
  }

  /* Le montant. Rend { type:'token'|'usd'|'max', valeur:Number|null }, ou
     null si rien n'est lisible. « tout », « max », « all » → max. Un montant
     colle a $ ou suivi de « dollars/usd » est en dollars ; sinon en jetons.
     La virgule decimale francaise est acceptee. */
  function trouveMontant(texte) {
    var t = sansAccent(texte);
    if (/\b(max|tout|toute|all|everything|la totalite|le maximum)\b/.test(t)) return { type: 'max', valeur: null };
    /* $50  50$  50 dollars  50 usd  → dollars */
    /* « $50 » ; « 50$ », « 50 dollars », « 50 usd » (mais pas « 50 usdc », qui
       est un jeton : d'ou la sentinelle qui refuse une lettre apres « usd »). */
    var md = t.match(/\$\s*([0-9]+(?:[.,][0-9]+)?)/) ||
             t.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:\$|dollars?|usd|bucks)(?![a-z])/);
    if (md) return { type: 'usd', valeur: parseFloat(md[1].replace(',', '.')) };
    /* un nombre nu → en jetons */
    var mt = t.match(/([0-9]+(?:[.,][0-9]+)?)/);
    if (mt) return { type: 'token', valeur: parseFloat(mt[1].replace(',', '.')) };
    return null;
  }

  /* Quel verbe ? Le premier trouve dans la phrase, selon l'ordre de VERBES
     (bridge et swap avant send). Rend l'action, ou null. */
  function trouveVerbe(texte) {
    var t = sansAccent(texte);
    for (var i = 0; i < VERBES.length; i++) {
      for (var k = 0; k < VERBES[i].mots.length; k++) {
        if (t.indexOf(sansAccent(VERBES[i].mots[k])) >= 0) return VERBES[i].a;
      }
    }
    return null;
  }

  /* Les adresses de la phrase, par famille. On ecarte les bouts qui sont en
     fait un symbole connu (un mint Solana ne se confond pas avec un
     symbole, mais on reste prudent). */
  function trouveAdresses(texte) {
    var evm = (texte.match(RE_EVM) || []);
    /* Les SVM : on retire ce qui chevauche une adresse EVM (0x… n'est pas
       base58 de toute facon) et ce qui est purement numerique. */
    var svm = (texte.match(RE_SVM) || []).filter(function (s) {
      return !/^[0-9]+$/.test(s) && s.indexOf('0x') !== 0;
    });
    return { evm: evm, svm: svm };
  }

  /* ======================= COMPRENDRE =======================
   * texte  : la phrase du joueur (tapee ou dictee)
   * jetons : la liste reelle des jetons de la page [{cle,sym,nom,natif,chaine,solNatif,adr}]
   * chaines: (optionnel) la liste des chaines du pont [{id,nom,alias?}] pour un bridge
   * Rend une ACTION lisible, jamais executable. */
  function comprend(texte, jetons, chaines) {
    texte = String(texte || '').trim();
    if (!texte) return { action: 'inconnu', pourquoi: 'Say what you want to do — for example “send 0.1 ETH to 0x…”.' };

    var action = trouveVerbe(texte);
    var montant = trouveMontant(texte);
    var adr = trouveAdresses(texte);

    if (!action) {
      return { action: 'inconnu', texte: texte,
        pourquoi: 'I did not catch an action. Try “send”, “swap”, “buy” or “bridge”.' };
    }

    /* ---- ENVOI ---- */
    if (action === 'send') {
      var jc = trouveJeton(texte, jetons);
      var total = adr.evm.length + adr.svm.length;
      if (total === 0) {
        return { action: 'inconnu', texte: texte,
          pourquoi: 'A send needs a destination address in your message. Paste the 0x… (or Solana) address.' };
      }
      if (total > 1) {
        return { action: 'inconnu', texte: texte,
          pourquoi: 'I see more than one address — I will not guess which one. Send one address at a time.' };
      }
      var dest = adr.evm[0] || adr.svm[0];
      var destType = adr.evm.length ? 'evm' : 'svm';
      if (!montant) {
        return { action: 'send', jetonCle: jc, montant: null, dest: dest, destType: destType,
          incomplet: 'amount', resume: resume('send', { jetonCle: jc, dest: dest, destType: destType }, jetons) };
      }
      return { action: 'send', jetonCle: jc, montant: montant, dest: dest, destType: destType,
        resume: resume('send', { jetonCle: jc, montant: montant, dest: dest, destType: destType }, jetons) };
    }

    /* ---- ACHAT → un swap vers le jeton nomme ---- */
    if (action === 'buy') {
      var vers = trouveJeton(texte, jetons);
      if (!vers) {
        return { action: 'inconnu', texte: texte,
          pourquoi: 'Which token do you want to buy? Name it, e.g. “buy $50 of SWOGE”.' };
      }
      /* On paie avec la piece native de la chaine du jeton (ETH sur RH), que
         le joueur ajustera sur l'ecran. On ne devine pas un autre jeton a
         vendre. */
      var deCle = natifDe(vers, jetons);
      return { action: 'swap', deCle: deCle, versCle: vers, montant: montant || null,
        depuisAchat: true, resume: resume('swap', { deCle: deCle, versCle: vers, montant: montant }, jetons) };
    }

    /* ---- BRÛLER ---- un envoi vers l'adresse morte, SANS destination à taper.
       La destination (0x…dEaD) est fixe, publique, posée par la page : la règle
       « l'adresse ne vient que de la phrase » est satisfaite d'office — il n'y a
       rien à deviner. On refuse de brûler autre chose que SWOGE / SWOGEBET. */
    if (action === 'burn') {
      var jBr = trouveJeton(texte, jetons);
      if (!jBr) {
        return { action: 'inconnu', texte: texte,
          pourquoi: 'Which token do you want to burn? Name it, e.g. “burn 100 SWOGE”.' };
      }
      if (BRULABLES.indexOf(sansAccent(jBr)) < 0) {
        return { action: 'inconnu', texte: texte,
          pourquoi: 'Only SWOGE and SWOGEBET can be burned — burning anything else is a permanent action that leads nowhere.' };
      }
      return { action: 'burn', jetonCle: jBr, montant: montant || null,
        resume: resume('burn', { jetonCle: jBr, montant: montant }, jetons) };
    }

    /* ---- SWAP ---- */
    if (action === 'swap') {
      /* « échange X contre/en/pour Y » : X avant le mot de liaison, Y apres. */
      var sep = sansAccent(texte).search(/\b(contre|en|pour|to|for|into|vers)\b/);
      var deCle2 = null, versCle2 = null;
      if (sep >= 0) {
        deCle2 = trouveJeton(texte.slice(0, sep), jetons);
        versCle2 = trouveJeton(texte.slice(sep), jetons);
      }
      if (!deCle2 || !versCle2) {
        /* Sans separateur clair : le premier jeton nomme est ce qu'on paie. */
        var tous = jetonsNommes(texte, jetons);
        deCle2 = deCle2 || tous[0] || null;
        versCle2 = versCle2 || tous[1] || null;
      }
      if (!deCle2 || !versCle2) {
        return { action: 'inconnu', texte: texte,
          pourquoi: 'A swap needs two tokens, e.g. “swap 0.1 ETH for SWOGE”.' };
      }
      return { action: 'swap', deCle: deCle2, versCle: versCle2, montant: montant || null,
        resume: resume('swap', { deCle: deCle2, versCle: versCle2, montant: montant }, jetons) };
    }

    /* ---- PONT ---- */
    if (action === 'bridge') {
      var ch = trouveChaines(texte, chaines);
      return { action: 'bridge', deChaine: ch.de, versChaine: ch.vers, montant: montant || null,
        resume: resume('bridge', { de: ch.de, vers: ch.vers, montant: montant }, chaines) };
    }

    return { action: 'inconnu', texte: texte, pourquoi: 'I did not understand. Try a simpler phrasing.' };
  }

  /* Tous les jetons nommes, dans l'ordre d'apparition dans la phrase. */
  function jetonsNommes(texte, jetons) {
    var t = sansAccent(texte), vus = [], pos = [];
    (jetons || []).forEach(function (j) {
      var noms = [j.sym, j.cle].filter(Boolean).map(function (x) { return sansAccent(x).replace(/^\$/, ''); });
      (ALIAS[sansAccent(j.cle)] || []).forEach(function (a) { noms.push(sansAccent(a)); });
      var meilleure = -1;
      noms.forEach(function (n) {
        if (n.length < 2) return;
        var i = t.indexOf(n);
        if (i >= 0 && (meilleure < 0 || i < meilleure)) meilleure = i;
      });
      if (meilleure >= 0 && vus.indexOf(j.cle) < 0) { vus.push(j.cle); pos.push(meilleure); }
    });
    return vus.map(function (c, i) { return { c: c, p: pos[i] }; })
              .sort(function (a, b) { return a.p - b.p; })
              .map(function (x) { return x.c; });
  }

  /* La piece native de la chaine d'un jeton : pour payer un achat. */
  function natifDe(cle, jetons) {
    var j = (jetons || []).filter(function (x) { return x.cle === cle; })[0];
    if (!j) return 'eth';
    if (j.solNatif || j.chaine === 792703809) return 'sol';
    var natifs = (jetons || []).filter(function (x) { return x.natif && (x.chaine || null) === (j.chaine || null); });
    return natifs.length ? natifs[0].cle : 'eth';
  }

  /* Les chaines d'un pont, par nom. Rend { de, vers } (ids ou null). */
  function trouveChaines(texte, chaines) {
    var t = sansAccent(texte), sep = t.search(/\b(vers|to|->|→|sur)\b/);
    var avant = sep >= 0 ? t.slice(0, sep) : t, apres = sep >= 0 ? t.slice(sep) : '';
    var nom = function (part) {
      var trouve = null, best = 0;
      (chaines || []).forEach(function (c) {
        [c.nom].concat(c.alias || []).forEach(function (n) {
          n = sansAccent(n);
          if (n && part.indexOf(n) >= 0 && n.length > best) { trouve = c.id; best = n.length; }
        });
      });
      return trouve;
    };
    return { de: nom(avant), vers: apres ? nom(apres) : null };
  }

  /* Une phrase de resume, en anglais (ce que le joueur relit). Elle ne fait
     que redire ce que l'action contient — aucune donnee nouvelle. */
  function resume(action, a, liste) {
    var symb = function (cle) {
      if (!cle) return 'a token';
      var j = (liste || []).filter(function (x) { return x.cle === cle; })[0];
      return j ? (j.sym || j.cle) : cle;
    };
    var m = a.montant;
    var qte = !m ? '' : m.type === 'max' ? 'all your ' : m.type === 'usd' ? ('$' + m.valeur + ' of ') : (m.valeur + ' ');
    if (action === 'send') {
      var ab = a.dest ? (a.dest.slice(0, 6) + '…' + a.dest.slice(-4)) : 'the address';
      return 'Send ' + (m ? qte : '') + symb(a.jetonCle) + ' to ' + ab + '. You review and sign it yourself.';
    }
    if (action === 'swap') {
      return 'Swap ' + (m ? qte : '') + symb(a.deCle) + ' for ' + symb(a.versCle) + '. You review and sign it yourself.';
    }
    if (action === 'burn') {
      return 'Burn ' + (m ? qte : '') + symb(a.jetonCle) + ' — permanent, it cannot be undone. You review and sign it yourself.';
    }
    if (action === 'bridge') {
      var nomC = function (id) {
        var c = (liste || []).filter(function (x) { return x.id === id; })[0];
        return c ? c.nom : (id ? ('chain ' + id) : 'a chain');
      };
      return 'Bridge ' + (m ? qte : '') + 'from ' + nomC(a.de) + ' to ' + nomC(a.vers) + '. You review and sign it yourself.';
    }
    return '';
  }

  var API = { comprend: comprend, trouveJeton: trouveJeton, trouveMontant: trouveMontant,
    trouveVerbe: trouveVerbe, trouveAdresses: trouveAdresses, _version: '1' };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  racine.SwogeAssistant = API;

})(typeof window !== 'undefined' ? window : this);
