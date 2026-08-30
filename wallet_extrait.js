'use strict';
/*
 * SORTIR DE LA PAGE LES MORCEAUX QU'ON VEUT ESSAYER.
 *
 * Le script de swoge_wallet.html est une fermeture en mode strict : rien
 * n'en sort par `window`, et l'evaluer en entier demanderait un DOM.
 * Mais essayer une COPIE de son encodeur ne prouverait rien — deux
 * encodeurs ecrits l'un apres l'autre divergent au premier changement.
 *
 * On extrait donc du fichier les declarations qui comptent et on les
 * execute telles quelles. Si la page change de forme, les essais qui
 * s'appuient sur ce module le voient tout de suite.
 */
const fs = require('fs');
const vm = require('node:vm');

function bloc(src, entete) {
  const d = src.indexOf(entete);
  if (d < 0) throw new Error('introuvable dans la page : ' + entete);
  let n = 0;
  for (let k = src.indexOf('{', d); k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (n === 0) return src.slice(d, k + 1); }
  }
  throw new Error('accolades non fermees : ' + entete);
}
/* `bloc` compte les accolades ; un tableau se ferme sur `];`. Employer l'un
   pour l'autre coupe la declaration a la premiere accolade fermante, au
   milieu du premier element. */
function tableau(src, entete) {
  const d = src.indexOf(entete);
  if (d < 0) throw new Error('introuvable dans la page : ' + entete);
  const f = src.indexOf('\n];', d);
  if (f < 0) throw new Error('tableau non ferme : ' + entete);
  return src.slice(d, f + 3);
}
function ligne(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('constante introuvable dans la page : ' + re);
  return m[0];
}

/* Rend le code extrait, en clair, pour qui veut le lire ou l'evaluer. */
function code(chemin) {
  const src = fs.readFileSync(chemin, 'utf8');
  const abiD = src.indexOf('var R02_ABI');
  const abiF = src.indexOf('\n];', abiD);
  if (abiD < 0 || abiF < 0) throw new Error('R02_ABI introuvable dans la page');
  return [
    ligne(src, /var WETH\s*=\s*'[^']+';/),
    ligne(src, /var SWOGE\s*=\s*'[^']+';/),
    ligne(src, /var SWOGEBET\s*=\s*'[^']+';/),
    ligne(src, /var ROUTER02\s*=\s*'[^']+';/),
    ligne(src, /var FRAIS_V3\s*=\s*\d+;/),
    ligne(src, /var ADDRESS_THIS\s*=\s*'[^']+';/),
    /* `morceauxDe` interroge `J()` pour savoir si un jeton a ete ajoute par le
       joueur : sans la liste ni la fonction, les routes personnalisees
       rendraient toujours `null` et l'essai passerait en ne mesurant rien. */
    ligne(src, /var ETH_AFF\s*=\s*'[^']+';/),
    tableau(src, 'var JETONS = ['),
    bloc(src, 'function J(cle)'),
    ligne(src, /var TOLERANCE\s*=\s*[\d.]+;/),
    ligne(src, /var GAZ_ECHANGE\s*=\s*\d+;/),
    ligne(src, /var GAZ_ENVOI\s*=\s*\d+;/),
    src.slice(abiD, abiF + 3),
    bloc(src, 'function moinsTolerance('),
    bloc(src, 'function morceauxDe('),
  ].join('\n\n');
}

/* L'ENCODEUR QR, sorti de la page et rendu appelable.
 * Meme principe : c'est le code de la page qui tourne, pas une copie. */
function qr(chemin) {
  const src = fs.readFileSync(chemin, 'utf8');
  const morceaux = [
    ligne(src, /var QR_TAILLE\s*=[^;]+;/),
    bloc(src, 'function qrCorps('),
    ligne(src, /var QRC\s*=\s*qrCorps\(\);/),
    bloc(src, 'function qrMul('),
    bloc(src, 'function qrGenerateur('),
    bloc(src, 'function qrReste('),
    bloc(src, 'function qrOctets('),
    bloc(src, 'function qrCodets('),
    bloc(src, 'function qrEntrelace('),
    bloc(src, 'function qrMasque('),
    bloc(src, 'function qrTrame('),
    bloc(src, 'function qrFormat('),
    bloc(src, 'function qrPoseFormat('),
    ligne(src, /var QR_N3\s*=\s*\[[^\]]+\];/),
    bloc(src, 'function qrCherche('),
    bloc(src, 'function qrClair('),
    bloc(src, 'function qrRegle3('),
    bloc(src, 'function qrPenalite('),
    bloc(src, 'function qrMatrice('),
  ].join('\n\n');
  const c = vm.createContext({ console });
  vm.runInContext(morceaux, c);
  return {
    code: morceaux,
    matrice(txt) { c.__t = txt; return vm.runInContext('qrMatrice(__t)', c); },
    lignes(txt) { const m = this.matrice(txt); return m && m.map((r) => r.join('')); },
    get TAILLE() { return c.QR_TAILLE; },
    get CAPACITE() { return c.QR_DONNEES - 2; },
  };
}

/* Rend un bac a sable ou ce code TOURNE, avec de quoi l'appeler. */
function bac(chemin, ethers) {
  const c = vm.createContext({ ethers, moi: null, console });
  vm.runInContext(code(chemin), c);
  return {
    ctx: c,
    get TOLERANCE()   { return c.TOLERANCE; },
    get GAZ_ECHANGE() { return c.GAZ_ECHANGE; },
    get GAZ_ENVOI()   { return c.GAZ_ENVOI; },
    pourQui(adr) { c.moi = adr; },
    /* Un jeton ajoute par le joueur, pose dans la liste du bac a sable. */
    ajoutePerso(j) {
      c.__j = j;
      vm.runInContext('JETONS.push(__j)', c);
      return j.cle;
    },
    videPerso() { vm.runInContext('for(var i=JETONS.length-1;i>=0;i--) if(JETONS[i].perso) JETONS.splice(i,1);', c); },
    morceauxDe(de, vers, entree, mini) {
      c.__a = [de, vers, entree, mini];
      return vm.runInContext('morceauxDe(__a[0],__a[1],__a[2],__a[3])', c);
    },
    moinsTolerance(bn) { c.__b = bn; return vm.runInContext('moinsTolerance(__b)', c); },
  };
}

/* `ethers` vit dans le depot du serveur, pas dans celui du site. */
function trouveEthers() {
  for (const p of ['ethers', '/home/user/swoge-pusher-server.github.io/node_modules/ethers']) {
    try { const m = require(p); return m.ethers || m; } catch (e) {}
  }
  return null;
}

module.exports = { code, bac, qr, trouveEthers };
