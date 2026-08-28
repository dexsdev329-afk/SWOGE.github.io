'use strict';
/*
 * ON NE FAIT PAS RESIGNER QUELQU UN QUI A DEJA UNE SESSION.
 *
 * ---- ce qui etait signale ----
 *
 * « swoge_poker.html ne redemande pas de connecter son wallet si on est deja
 * connecte a la page. »
 *
 * ---- pourquoi ca revenait ----
 *
 * Un premier correctif avait deja ferme le chemin de `hello`. Celui-ci en est
 * un AUTRE, et c'est une course — d'ou un defaut qui revient « une fois sur
 * deux » et qu'on croit corrige.
 *
 * `autoReconnect()` part en meme temps que `connect()`. Il attend le
 * portefeuille : `eth_accounts` pour un wallet, une iframe Privy pour un compte
 * e-mail. Quand cette attente se termine APRES l'ouverture de la socket, il
 * trouve `ws.readyState === 1` et appelle `doLogin()` de lui-meme — c'est-a-dire
 * un message a faire signer, alors que la reprise de session est deja partie et
 * va repondre toute seule. Portefeuille rapide : rien. Portefeuille lent, ou
 * Telegram, ou un telephone : la fenetre de signature.
 *
 * Le jeton en reserve est le signal, ici comme dans `hello`. S'il est perime,
 * `resumeFailed` l'efface AVANT de rappeler `autoReconnect`, et le chemin long
 * repart alors normalement.
 *
 * Treize pages portaient la meme course ; une seule avait ete signalee.
 *
 * ---- ce que cet essai tient ----
 *
 * Il rejoue la course, dans les deux sens :
 *
 *   AVEC un jeton en reserve — le cas signale — la page doit ouvrir sa session
 *   sans faire signer une seule fois, et n'envoyer que `resume`.
 *
 *   SANS jeton — quelqu un qui arrive pour la premiere fois — elle DOIT faire
 *   signer. Sans cette seconde moitie, on pourrait « corriger » le defaut en
 *   supprimant la connexion, et l essai n y verrait rien.
 *
 * La socket et le portefeuille sont simules, et le portefeuille repond LENTEMENT
 * expres : c'est la lenteur qui produit la course. Un portefeuille instantane ne
 * montrerait jamais le defaut.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('signature_reprise.test.js : playwright absent — essai saute'); process.exit(0); }

const SITE = __dirname;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.svg': 'image/svg+xml' };

const ADRESSE = '0x1111111111111111111111111111111111111111';

/* Le decor : une socket et un portefeuille de theatre, poses AVANT le premier
   script de la page. */
function decor(avecJeton) {
  window.__sign = 0;
  window.__envois = [];
  try {
    localStorage.setItem('swogeAuth', 'wallet');
    if (avecJeton) localStorage.setItem('swogeSession', 'jeton-de-test');
    else localStorage.removeItem('swogeSession');
  } catch (e) {}

  /* Le portefeuille repond en 300 ms : assez lentement pour que la socket soit
     ouverte quand `autoReconnect` reprend la main. C'est la course. */
  window.ethereum = {
    isMetaMask: true,
    request: function (q) {
      if (q && q.method === 'eth_accounts') {
        return new Promise(function (r) { setTimeout(function () { r([ADRESSE]); }, 300); });
      }
      if (q && (q.method === 'personal_sign' || q.method === 'eth_sign')) {
        window.__sign++;
        return Promise.resolve('0x' + '22'.repeat(65));
      }
      return Promise.resolve(null);
    },
    on: function () {}, removeListener: function () {},
  };

  /* Le strict necessaire d'ethers pour que `signMessage` arrive bien au
     portefeuille — la vraie bibliotheque vient d'un CDN, qu'on ne joint pas
     depuis un essai. */
  window.ethers = {
    providers: {
      Web3Provider: function (fournisseur) {
        this.getSigner = function () {
          return {
            signMessage: function (msg) {
              return fournisseur.request({ method: 'personal_sign', params: [msg, ADRESSE] });
            },
            getAddress: function () { return Promise.resolve(ADRESSE); },
          };
        };
      },
    },
    utils: { formatUnits: function (v) { return String(v); },
             parseUnits: function (v) { return String(v); } },
  };

  /* ---- UN PANTIN POUR `THREE` ----
     Les deux pages du Coin Pusher chargent three.js depuis un CDN, qu'un essai
     ne joint pas. Sans lui, leur script meurt sur « THREE is not defined »
     avant meme d'ouvrir la socket, et l'essai aurait conclu « aucune
     signature » sur une page qui n'a rien execute — un vert qui ne prouve
     rien. Ce pantin repond a tout sans rien faire : il suffit a laisser le
     script aller jusqu'a sa connexion, qui est ce qu'on mesure. */
  (function () {
    var poignees = {
      get: function (c, p) {
        if (p === Symbol.toPrimitive || p === 'valueOf') return function () { return 0; };
        if (p === Symbol.iterator) return function () { return [][Symbol.iterator](); };
        if (p === 'then') return undefined;
        return pion();
      },
      apply: function () { return pion(); },
      construct: function () { return pion(); },
      set: function () { return true; },
      has: function () { return true; },
    };
    function pion() { return new Proxy(function () {}, poignees); }
    window.THREE = pion();
  })();

  /* On ne fait PAS heriter de `WebSocket.prototype` : `readyState` y est un
     accesseur en lecture seule qui exige les entrailles d'une vraie socket.
     Un objet ordinaire suffit — la page ne lit que `readyState`, `send`,
     `close` et les quatre gestionnaires. */
  function Fausse() {
    var self = this;
    this.readyState = 0;
    this.send = function (s) { try { window.__envois.push(JSON.parse(s)); } catch (e) {} };
    this.close = function () { self.readyState = 3; };
    setTimeout(function () {
      self.readyState = 1;
      if (self.onopen) self.onopen({});
      /* `hello` arrive juste apres l'ouverture, comme le vrai serveur. */
      if (self.onmessage) self.onmessage({ data: JSON.stringify({
        type: 'hello', loginNonce: 'nonce-de-test', serverSeedHash: '00', vault: null,
        token: null, minWithdraw: 1 }) });
    }, 40);
  }
  Fausse.CONNECTING = 0; Fausse.OPEN = 1; Fausse.CLOSING = 2; Fausse.CLOSED = 3;
  window.WebSocket = Fausse;
}

(async () => {
  const s = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const port = s.address().port;
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* Les pages qui portent la course : celles ou `autoReconnect` existe et peut
     appeler `doLogin` de lui-meme. On les reconnait a la FONCTION, pas au
     correctif — sinon l'essai ne regarderait que les pages deja corrigees et
     laisserait passer la prochaine qui ne le serait pas. */
  const PAGES = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'))
    .filter((f) => {
      const t = fs.readFileSync(path.join(SITE, f), 'utf8');
      if (!t.includes('async function autoReconnect()') || !t.includes('doLogin')) return false;
      /* `swoge_pusher.html` est ecartee, et il faut le dire : elle n'a AUCUNE
         reprise de session — son `hello` ne presente pas de jeton, son `auth`
         n'en garde pas, et `resumeFailed` n'y est pas traite. Elle resigne donc
         a chaque ouverture, et la garde posee ailleurs n'aurait rien a garder.
         Lui donner une reprise n'est pas poser un garde-fou, c'est ajouter un
         mecanisme — et le fichier note lui-meme, en dix endroits, que « plus
         aucun lien n'atteint » cette page ; la version vivante est
         `swoge_pusher_live.html`, qui est testee. A reprendre le jour ou cette
         page revient. */
      return f !== 'swoge_pusher.html';
    }).sort();

  const joue = async (page, avecJeton) => {
    const p = await nav.newPage({ viewport: { width: 1280, height: 800 } });
    await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p.addInitScript(`(${decor.toString()})(${avecJeton});`
      .replace(/ADRESSE/g, JSON.stringify(ADRESSE)));
    await p.goto(`http://127.0.0.1:${port}/${page}`, { waitUntil: 'domcontentloaded' });
    /* 40 ms pour l'ouverture, 300 pour le portefeuille : on laisse largement. */
    await p.waitForTimeout(1500);
    const v = await p.evaluate(() => ({
      sign: window.__sign,
      types: (window.__envois || []).map((m) => m && m.type).filter(Boolean),
    }));
    await p.close();
    return v;
  };

  console.log(`-- ${PAGES.length} pages, une session deja en reserve --`);
  for (const f of PAGES) {
    const v = await joue(f, true);
    ok(v.sign === 0,
       v.sign === 0
         ? `${f} : aucune signature demandee (messages : ${v.types.join(', ') || 'aucun'})`
         : `${f} : ${v.sign} signature(s) demandee(s) a quelqu un de deja connecte`);
    ok(v.types.includes('resume'),
       v.types.includes('resume')
         ? `${f} : et la session est bien reprise`
         : `${f} : aucun 'resume' envoye — la reprise ne part pas (${v.types.join(', ') || 'rien'})`);
  }

  console.log('\n-- et sans jeton, la connexion doit toujours se faire --');
  for (const f of PAGES) {
    const v = await joue(f, false);
    ok(v.sign >= 1,
       v.sign >= 1
         ? `${f} : la signature est bien demandee (${v.sign})`
         : `${f} : AUCUNE signature — un nouveau venu ne peut plus se connecter`);
  }

  await nav.close(); s.close();
  console.log(rates ? `\nsignature_reprise.test.js : ${rates} echec(s) sur ${n}\n`
                    : `\nsignature_reprise.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
