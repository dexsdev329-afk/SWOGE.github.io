/* Banc d'essai : la page SANS socket a elle (hall des jeux, accueil) doit se
   RECONNECTER quand sa socket tombe. Avant le correctif elle ne le faisait
   pas : le badge de solde pose par la page porte l'identifiant `bal`, celui-la
   meme qui sert a reconnaitre une page de jeu, et la reconnexion s'arretait
   des la premiere authentification. */
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || path.join(__dirname, 'stakebubble.js');

// ------------------------------------------------------------- le faux DOM
function noeud(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '', className: '', textContent: '', innerHTML: '', title: '', type: '',
    dataset: {}, style: { display: '', setProperty() {} }, children: [], parentNode: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { c.parentNode = el; el.children.push(c); enregistre(c); return c; },
    insertBefore(c) { c.parentNode = el; el.children.push(c); enregistre(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    remove() {}, addEventListener() {}, removeEventListener() {},
    contains() { return false; }, matches() { return false; },
    setAttribute(k, v) { el[k] = v; }, getAttribute(k) { return el[k]; },
    /* Un noeud rend TOUJOURS un enfant pour un selecteur, et toujours le meme :
       le script en accroche des ecouteurs, et un null ferait tomber le
       chargement bien avant l essai qui nous interesse. */
    _cache: new Map(),
    querySelector(s) {
      if (!el._cache.has(s)) el._cache.set(s, noeud('div'));
      return el._cache.get(s);
    },
    querySelectorAll() { return []; },
    value: '',
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
    focus() {}, click() {}, closest() { return null; },
  };
  return el;
}
const parId = new Map();
function enregistre(el) {
  if (el.id) parId.set(el.id, el);
  (el.children || []).forEach(enregistre);
  // innerHTML peut poser un id sans passer par appendChild : on le lit a la main
  const m = /id="([^"]+)"/.exec(el.innerHTML || '');
  if (m) parId.set(m[1], noeud('b'));
}
const barre = noeud('nav');
const corps = noeud('body');
const doc = {
  readyState: 'complete', visibilityState: 'visible',
  head: noeud('head'), body: corps, documentElement: noeud('html'),
  createElement: noeud,
  createTextNode(t) { const n = noeud('#text'); n.textContent = t; return n; },
  getElementById(id) { return parId.get(id) || null; },
  querySelector(s) { return s === 'nav' ? barre : null; },
  querySelectorAll() { return []; },
  addEventListener() {}, removeEventListener() {},
};

// ------------------------------------------------------- les fausses sockets
const ouvertes = [];
class FausseSocket {
  constructor(url) {
    this.url = url; this.readyState = 0; this.envoyes = []; this.ecouteurs = {};
    ouvertes.push(this);
  }
  addEventListener(t, f) { (this.ecouteurs[t] = this.ecouteurs[t] || []).push(f); }
  removeEventListener() {}
  send(d) {
    if (this.readyState !== 1) throw new Error('socket fermee');
    this.envoyes.push(d);
  }
  close() { this.readyState = 3; this.emet('close', {}); }
  emet(t, ev) { (this.ecouteurs[t] || []).forEach((f) => f(Object.assign({ target: this }, ev))); }
  /** Le serveur parle. */
  dit(obj) { this.emet('message', { data: JSON.stringify(obj) }); }
  /** La poignee de main complete : hello -> resume -> auth. */
  ouvre() { this.readyState = 1; this.emet('open', {}); this.dit({ type: 'hello' }); }
}

// ------------------------------------------------------ les fausses minuteries
let horloge = 0;
const minuteries = [];
global.setTimeout = (f, ms) => { minuteries.push({ t: horloge + (ms || 0), f }); return minuteries.length; };
global.setInterval = () => 0;          // rien de periodique dans ce banc
global.clearTimeout = () => {};
global.clearInterval = () => {};
function avance(ms) {
  horloge += ms;
  for (;;) {
    const i = minuteries.findIndex((m) => m.t <= horloge);
    if (i < 0) break;
    const m = minuteries.splice(i, 1)[0];
    m.f();
  }
}

// ------------------------------------------------------------- le faux window
const magasin = { swogeSession: 'un-jeton-valide' };
const win = {
  WebSocket: FausseSocket,
  document: doc,
  location: { search: '', href: 'https://swoleeswoge.dog/games.html', origin: 'https://swoleeswoge.dog' },
  localStorage: {
    getItem: (k) => (k in magasin ? magasin[k] : null),
    setItem: (k, v) => { magasin[k] = String(v); },
    removeItem: (k) => { delete magasin[k]; },
  },
  navigator: { userAgent: 'banc', clipboard: { writeText: () => Promise.resolve() } },
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addListener() {}, addEventListener() {} }),
  requestAnimationFrame: () => 0,
  getComputedStyle: () => ({ display: '', getPropertyValue: () => '' }),
  URLSearchParams, Date, Math, JSON, console,
  setTimeout: global.setTimeout, setInterval: global.setInterval,
  clearTimeout: global.clearTimeout, clearInterval: global.clearInterval,
  innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
  open() {}, confirm: () => true, prompt: () => null, alert() {},
  fetch: () => Promise.reject(new Error('pas de reseau dans le banc')),
};
win.window = win; win.self = win; win.globalThis = win;

// ---------------------------------------------------------------- le chargement
const code = fs.readFileSync(SRC, 'utf8');
const vm = require('vm');
const bac = vm.createContext(win);
Object.assign(bac, {
  window: win, document: doc, location: win.location, localStorage: win.localStorage,
  navigator: win.navigator, URLSearchParams, console, JSON, Math, Date,
  setTimeout: global.setTimeout, setInterval: global.setInterval,
  clearTimeout: global.clearTimeout, clearInterval: global.clearInterval,
  fetch: win.fetch, Promise, Error, String, Number, Object, Array, RegExp, parseFloat, parseInt, isFinite,
});
vm.runInContext(code, bac, { filename: 'stakebubble.js' });

// -------------------------------------------------------------------- l'essai
let rates = 0;
function eq(a, b, quoi) {
  const ok = a === b;
  if (!ok) rates++;
  console.log((ok ? '  ok   ' : '  RATE ') + quoi + (ok ? '' : '  (attendu ' + b + ', obtenu ' + a + ')'));
}

console.log('\nUne page sans socket a elle : le hall des jeux, l accueil.\n');

eq(ouvertes.length, 1, 'au chargement, la page ouvre UNE socket');
const s1 = ouvertes[0];

s1.ouvre();
eq(s1.envoyes.length, 1, 'elle presente son jeton de session au « hello »');
eq(JSON.parse(s1.envoyes[0]).type, 'resume', 'et ce qu elle presente est bien une reprise');

s1.dit({ type: 'auth', address: '0xabc', balance: '5000' });
eq(!!doc.getElementById('bal'), true, 'le badge de solde apparait — il porte l id « bal »');

// C est ici que le piege se refermait : `#bal` existe maintenant, pose par la
// page elle-meme, et la reconnexion le prenait pour la marque d une page de jeu.
s1.close();
eq(ouvertes.length, 1, 'la fermeture ne rouvre rien dans la seconde');
avance(5000);
eq(ouvertes.length, 2, 'quelques secondes plus tard, la page S EST RECONNECTEE');

const s2 = ouvertes[1];
if (s2) {
  s2.ouvre();
  s2.dit({ type: 'auth', address: '0xabc', balance: '5000' });
  eq(s2.readyState, 1, 'et la nouvelle socket est vivante');
  // Une seule socket a la fois, meme si deux reconnexions partent ensemble.
  avance(20000);
  eq(ouvertes.length, 2, 'aucune socket en double ne s empile derriere');
}

console.log(rates ? '\n' + rates + ' essai(s) rate(s)\n' : '\nTout passe.\n');
process.exit(rates ? 1 : 0);
