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
    ligne(src, /var TOLERANCE\s*=\s*[\d.]+;/),
    ligne(src, /var GAZ_ECHANGE\s*=\s*\d+;/),
    ligne(src, /var GAZ_ENVOI\s*=\s*\d+;/),
    src.slice(abiD, abiF + 3),
    bloc(src, 'function moinsTolerance('),
    bloc(src, 'function morceauxDe('),
  ].join('\n\n');
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

module.exports = { code, bac, trouveEthers };
