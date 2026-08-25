/*
 * ================== LA CONNEXION, PARTAGEE PAR DEUX PAGES ==================
 *
 * Ce fichier etait ecrit EN CLAIR dans `index.html`. La page des jeux en a
 * besoin du mot pour mot : deux copies auraient diverge des la premiere
 * retouche, et c'est toujours celle qu'on ne regarde pas qui reste en ligne.
 *
 * Il est SERVI AVEC UN MARQUEUR — `swogecx.js?v=<empreinte>` — et l'essai des
 * marqueurs le garde desormais comme les autres : si le fichier change et que
 * les pages gardent l'ancienne empreinte, l'essai tombe et donne la valeur a
 * ecrire. C'est cette regle-la qui manquait le jour ou une maison poussee et
 * correcte est restee invisible trois semaines.
 *
 * Le STYLE, lui, reste dans chaque page. Le meme essai ne surveille que les
 * `.js` : une feuille partagee et perimee serait exactement le defaut que ce
 * mecanisme existe pour empecher, en silence et avec l'air d'y remedier.
 */
/* ================== LA CONNEXION, ET RIEN D'AUTRE ==================
 *
 * ---- POURQUOI CE SCRIPT EXISTE ALORS QUE LA PAGE EST INERTE ----
 * Tout le reste de la page ne repond pas au doigt, et c'est voulu. Ici on ne
 * simule rien : ces deux chemins entrent VRAIMENT, avec le meme identifiant
 * d'application et les memes appels que les dix-sept pages de jeu. Refaire un
 * second mecanisme a cote du premier aurait donne deux facons de se tromper
 * sur qui est connecte.
 *
 * ---- LE COURRIEL N'EST PAS UN REPLI ----
 * Dans le navigateur interne de Telegram il n'y a AUCUNE extension a
 * interroger, et c'est de la qu'arrive une bonne part des joueurs. Privy y
 * cree le portefeuille tout seul. C'est donc le chemin normal, presente comme
 * tel, et non un lot de consolation propose apres un echec.
 *
 * ---- CE QUE CETTE PAGE NE FAIT PAS ----
 * Elle ne se connecte a AUCUNE socket et ne signe aucun message : entrer ici
 * veut dire « le portefeuille est connu », pas « la partie est ouverte ». La
 * session de jeu se noue sur la page du jeu, ou elle a toujours vecu.
 */
(function () {
  var PRIVY = 'cmsga0yzp00a50biaf9vlzzd2';
  var CHAINE = { hex: '0x1237', nom: 'Robinhood Chain', rpc: 'https://rpc.mainnet.chain.robinhood.com',
                 scan: 'https://robinhoodchain.blockscout.com', sym: 'ETH' };
  var $ = function (i) { return document.getElementById(i); };
  var voile = $('cxVoile'), dit = $('cxDit'), courriel = '';

  function parle(t, quoi) {
    dit.textContent = t;
    dit.className = 'cx-dit' + (quoi ? ' ' + quoi : '');
  }
  function ouvre() {
    $('cxCodeBloc').hidden = true; $('cxVerifie').hidden = true;
    $('cxEnvoie').hidden = false; $('cxCode').value = '';
    parle('A wallet is created for you automatically \u2014 no app needed.');
    voile.hidden = false;
    /* Le SDK se charge PENDANT que le panneau est deja ouvert : demarre avant,
       un reseau lent laisse quelqu'un devant un bouton qui ne fait rien et
       aucune explication. */
    chargePrivy().catch(function () {
      parle("Couldn't load email sign-in \u2014 check your connection and reopen this panel.", 'ko');
    });
    setTimeout(function () { try { $('cxMail').focus(); } catch (e) {} }, 60);
  }
  function ferme() { voile.hidden = true; }

  var enRoute = null;
  function chargePrivy() {
    if (window.SwogePrivy) return Promise.resolve();
    if (enRoute) return enRoute;
    enRoute = new Promise(function (ok, non) {
      var b = document.createElement('script');
      b.src = 'privy-swoge.js';
      b.onload = function () { try { SwogePrivy.init(PRIVY); } catch (e) {} ok(); };
      b.onerror = function () { enRoute = null; non(new Error('load failed')); };
      document.head.appendChild(b);
    });
    return enRoute;
  }

  /* ================== CE QU'ON MONTRE UNE FOIS ENTRE ==================
   *
   * ---- UNE SEULE PASTILLE, ET LES BOUTONS S'EN VONT ----
   * Chaque bouton de connexion prenait l'adresse pour libelle. Il y en a
   * CINQ — deux dans la barre, deux dans la colonne, un sur la carte du
   * bonus — donc l'adresse s'affichait cinq fois. Sur telephone, les deux de
   * la barre se voient d'un coup et cela se lit comme deux portefeuilles.
   * Signale depuis un vrai telephone ; a l'ecran large, on ne le voyait pas.
   * Ils disparaissent donc, et une pastille unique prend leur place.
   *
   * ---- ET ELLE PORTE LES DEUX SOLDES ----
   * C'est la seule chose qu'on veuille savoir une fois entre : combien j'ai.
   * L'ETH pour payer le gaz, le $SWOGE pour jouer. */
  var TOKEN = '0x8a166Fb41Cd659a0a43396272FF73973Ce29F817';

  /* Un entier de la chaine, en clair. On ne charge PAS `ethers` pour ca : la
     bibliotheque pese plus lourd que toutes les images de cette page reunies,
     et deux divisions suffisent. `BigInt` parce qu'un solde de dix-huit
     decimales depasse ce qu'un nombre flottant sait tenir exactement — en
     virgule flottante, 1 000 000 de jetons peut s'afficher 999 999,999.
     ---- ON TRONQUE, ON N'ARRONDIT PAS ----
     0,077187 s'affiche « 0.0771 » et non « 0.0772 ». C'est deliberé : sur un
     SOLDE, arrondir vers le haut annonce plus que ce qu'on possede, et
     quelqu'un qui essaie de tout envoyer se fait refuser sans comprendre.
     Montrer moins que la verite ne trompe personne ; montrer plus, si. */
  function enClair(hex, dec, prec) {
    try {
      var v = BigInt(hex && hex !== '0x' ? hex : '0x0');
      var d = BigInt(10) ** BigInt(dec);
      var ent = v / d;
      var frac = (v % d).toString().padStart(dec, '0').slice(0, prec);
      var mille = ent.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return prec ? mille + '.' + frac : mille;
    } catch (e) { return '?'; }
  }

  function litLesSoldes(fournisseur, adresse) {
    var eEth = $('cxEth'), eSw = $('cxSwoge');
    var pose = function (e, nom, val) { e.innerHTML = '<b>' + val + '</b> ' + nom; };
    fournisseur.request({ method: 'eth_getBalance', params: [adresse, 'latest'] })
      .then(function (h) { pose(eEth, 'ETH', enClair(h, 18, 4)); })
      ['catch'](function () { eEth.textContent = 'ETH \u2014'; });
    /* `balanceOf(address)` : les quatre octets du selecteur, puis l'adresse
       calee a droite sur trente-deux octets. Un appel en lecture, rien de
       signe, rien qui coute. */
    fournisseur.request({ method: 'eth_call', params: [{
      to: TOKEN,
      data: '0x70a08231' + '000000000000000000000000' + String(adresse).replace(/^0x/, '')
    }, 'latest'] })
      .then(function (h) { pose(eSw, '$SWOGE', enClair(h, 18, 0)); })
      ['catch'](function () { eSw.textContent = '$SWOGE \u2014'; });
  }

  function entre(adresse, fournisseur) {
    if (!adresse) return;
    var court = String(adresse).slice(0, 6) + '\u2026' + String(adresse).slice(-4);
    /* Les boutons de connexion s'effacent — TOUS, y compris celui de la carte
       du bonus, qui proposait de se connecter alors qu'on l'est. */
    [].forEach.call(document.querySelectorAll('.cx-wallet, .cx-mail'), function (b) {
      b.hidden = true;
      b.style.display = 'none';
    });
    $('cxAdr').textContent = court;
    $('cxCompte').hidden = false;
    ferme();
    if (fournisseur && fournisseur.request) {
      try { litLesSoldes(fournisseur, adresse); } catch (e) {}
    }
  }

  function connectePortefeuille() {
    var eth = window.ethereum;
    /* Pas d'extension : on n'annonce pas un echec, on montre le chemin qui
       marche. C'est le cas de tout le navigateur de Telegram. */
    if (!eth) { ouvre(); parle('No wallet extension here \u2014 sign in by email instead, we create one for you.'); return; }
    eth.request({ method: 'eth_requestAccounts' }).then(function (c) {
      return eth.request({ method: 'eth_chainId' }).then(function (id) {
        if (id === CHAINE.hex) return c;
        return eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAINE.hex }] })
          ['catch'](function (e) {
            /* 4902 : la chaine est inconnue du portefeuille. On la lui donne
               au lieu de renvoyer quelqu'un lire une documentation. */
            if (e && e.code === 4902) {
              return eth.request({ method: 'wallet_addEthereumChain', params: [{
                chainId: CHAINE.hex, chainName: CHAINE.nom,
                nativeCurrency: { name: 'Ether', symbol: CHAINE.sym, decimals: 18 },
                rpcUrls: [CHAINE.rpc], blockExplorerUrls: [CHAINE.scan] }] });
            }
            throw e;
          }).then(function () { return c; });
      });
    }).then(function (c) {
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      entre(c && c[0], eth);
    })['catch'](function (e) {
      ouvre(); parle(String((e && e.message) || e).slice(0, 120), 'ko');
    });
  }

  [].forEach.call(document.querySelectorAll('.cx-mail'), function (b) { b.addEventListener('click', ouvre); });
  [].forEach.call(document.querySelectorAll('.cx-wallet'), function (b) { b.addEventListener('click', connectePortefeuille); });
  $('cxPortefeuille').addEventListener('click', connectePortefeuille);
  document.querySelector('.cx-fermer').addEventListener('click', ferme);
  voile.addEventListener('click', function (e) { if (e.target === voile) ferme(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !voile.hidden) ferme(); });

  $('cxEnvoie').addEventListener('click', function () {
    var e = ($('cxMail').value || '').trim();
    if (!/.+@.+\..+/.test(e)) { parle('Enter a valid email address.', 'ko'); return; }
    courriel = e; this.disabled = true; parle('Sending code\u2026');
    var moi = this;
    chargePrivy().then(function () { return SwogePrivy.sendCode(e); }).then(function () {
      $('cxCodeBloc').hidden = false; $('cxVerifie').hidden = false; moi.hidden = true;
      parle('Code sent to ' + e + ' \u2014 check your inbox, and your spam.', 'ok');
      try { $('cxCode').focus(); } catch (x) {}
    })['catch'](function (err) {
      parle('Error: ' + String((err && err.message) || err).slice(0, 120), 'ko');
    }).then(function () { moi.disabled = false; });
  });

  $('cxVerifie').addEventListener('click', function () {
    var c = ($('cxCode').value || '').trim();
    if (!c) { parle('Enter the code we emailed you.', 'ko'); return; }
    this.disabled = true; parle('Verifying, and creating your wallet\u2026');
    var moi = this;
    SwogePrivy.verifyCode(courriel, c).then(function () {
      try { localStorage.setItem('swogeAuth', 'email'); } catch (x) {}
      entre(SwogePrivy.getAddress(), SwogePrivy.getProvider());
    })['catch'](function (err) {
      parle('Error: ' + String((err && err.message) || err).slice(0, 140), 'ko');
    }).then(function () { moi.disabled = false; });
  });

  /* ---- ET SI L'ON EST DEJA ENTRE ----
   * Privy garde la session. La retrouver evite de redemander un code a
   * quelqu'un qui s'est connecte il y a dix minutes sur une autre page.
   * `restore()` peut ne JAMAIS repondre — l'iframe de Privy est cloisonnee
   * dans le navigateur de Telegram — donc on ne l'attend pas : on la lance et
   * la page vit sa vie. */
  try {
    if (localStorage.getItem('swogeAuth') === 'email') {
      chargePrivy().then(function () {
        return SwogePrivy.restore();
      }).then(function () {
        var a = SwogePrivy.getAddress();
        if (a) entre(a, SwogePrivy.getProvider());
      })['catch'](function () {});
    }
    /* ---- ET LE PORTEFEUILLE, QUI N ETAIT PAS RESTAURE DU TOUT ----
     *
     * `swogeAuth` valait deja « wallet » depuis le premier jour, et PERSONNE
     * ne le relisait. Consequence, signalee depuis un telephone avec la
     * capture : on connecte son portefeuille, on change de page — ou l on
     * recharge — et « CONNECT WALLET » revient, alors que la pastille de solde
     * affiche les jetons juste a cote. Deux mecanismes savaient, chacun la
     * moitie : celui-ci ne restaurait que le courriel, et celui de la bulle
     * connaissait le portefeuille sans le dire a personne.
     *
     * `eth_accounts` et NON `eth_requestAccounts` : le premier rend les
     * comptes deja autorises sans rien demander, le second ouvre une fenetre.
     * Rouvrir une demande d autorisation a chaque chargement de page serait
     * une bien pire panne que celle qu on repare.
     *
     * Rien n est attendu : si le portefeuille ne repond pas, la page reste
     * telle quelle et l on peut toujours se connecter a la main. */
    if (localStorage.getItem('swogeAuth') === 'wallet' && window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' })
        .then(function (c) { if (c && c[0]) entre(c[0], window.ethereum); })
        ['catch'](function () {});
    }
  } catch (e) {}
})();
