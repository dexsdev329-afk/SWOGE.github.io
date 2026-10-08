'use strict';
/* ============================================================================
 * AI TRADING : QUATRE PAGES, UNE ENTREE DE MENU, DES ONGLETS EN HAUT (01/10/2026)
 *
 * Demande du proprietaire : « SWOGE AI, Perp, Predict et Polymarket, fusionne-les comme
 * Agents, ou tu peux changer de page en haut, ca serait plus propre ». Les quatre pages
 * restent des pages (6 000 lignes, chacune ses connexions en direct et ses minuteries :
 * les mettre dans un seul document les ferait tourner toutes a la fois) ; ce qui change :
 *   1. une barre d'onglets IDENTIQUE en tete de chacune, l'onglet courant marque ;
 *   2. le menu du site n'a plus qu'UNE entree « AI Trading » au lieu de quatre.
 *
 *   node outils/onglets_ia.js      reecrit les pages et les menus du site
 * 03/10/2026 : une cinquieme, swoge_colonies.html (Solana & ETH) ; la grille suit PAGES.length.
 * onglets_ia.test.js echoue si une page n'est plus celle que donne ce script.
 * ==========================================================================*/
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..');
const PAGES = [
  { f: 'swoge_ai.html', ic: '&#129302;', nom: 'SWOGE AI', sous: 'Trading colony on new tokens' },
  { f: 'swoge_perp.html', ic: '&#128200;', nom: 'AI Perps', sous: 'Agents on BTC, ETH, SOL perps' },
  { f: 'swoge_predict.html', ic: '&#128302;', nom: 'Predict', sous: 'PancakeSwap rounds, 5 min' },
  { f: 'swoge_polymarket_ai.html', ic: '&#127919;', nom: 'Polymarket AI', sous: '15-minute crypto markets' },
  /* 08/10 : la colonie Solana/Ethereum, scindee en DEUX pages propres (demande du proprietaire) :
     chaque chaine est sa propre colonie papier. swoge_colonies.html redirige vers swoge_sol_ai.html. */
  { f: 'swoge_sol_ai.html', ic: '&#9728;&#65039;', nom: 'Solana AI', sous: 'New Solana tokens, paper colony' },
  { f: 'swoge_eth_ai.html', ic: '&#9670;&#65039;', nom: 'Ethereum AI', sous: 'New Ethereum tokens, paper colony' },
];
const DEBUT = '<!-- ONGLETS-IA:debut (genere par outils/onglets_ia.js, ne pas editer ici) -->';
const FIN = '<!-- ONGLETS-IA:fin -->';
/* Le style commun (01/10) : outils/ia_design.css, recopie tel quel dans chaque page qui porte
   les marqueurs IA-DESIGN (une page sans eux n'est pas touchee : SWOGE AI garde le sien). */
const D_DEBUT = '<!-- IA-DESIGN:debut (copie de outils/ia_design.css par outils/onglets_ia.js, ne pas editer ici) -->';
const D_FIN = '<!-- IA-DESIGN:fin -->';
function design() { return D_DEBUT + '\n<style>\n' + fs.readFileSync(path.join(__dirname, 'ia_design.css'), 'utf8').replace(/\s+$/, '') + '\n</style>\n' + D_FIN; }
const ENTREE = '<a href="swoge_ai.html"%CLS%><span class="ic">&#129302;</span>AI Trading</a>';

function bloc(courante) {
  return DEBUT + '\n<style>\n'
    + '.ia-onglets{margin:0 0 14px;padding:4px;display:grid;grid-template-columns:repeat(' + PAGES.length + ',minmax(0,1fr));gap:4px;background:#E1E9F6;border-radius:16px}\n'
    + '@media (max-width:640px){ .ia-onglets{grid-template-columns:1fr 1fr} }\n'
    + '.ia-onglets a{display:flex;flex-direction:column;gap:2px;min-width:0;padding:8px 12px;border-radius:12px;text-decoration:none;color:#6B7C99;min-height:44px;justify-content:center}\n'
    + '.ia-onglets a:hover{color:#0B1B36}\n'
    + '.ia-onglets a[aria-current="page"]{background:#fff;color:#0B1B36;box-shadow:0 1px 2px rgba(11,27,54,.08),0 4px 12px rgba(11,27,54,.06)}\n'
    + '.ia-onglets b{font:800 14px/1.2 Archivo,system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n'
    + '.ia-onglets small{font-size:11.5px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n'
    + '@media (max-width:420px){ .ia-onglets small{display:none} }\n'
    + '.ia-onglets a:focus-visible{outline:2px solid #1B5FE0;outline-offset:2px}\n'
    + '</style>\n<nav class="ia-onglets" aria-label="AI Trading">\n'
    + PAGES.map((p) => '  <a href="' + p.f + '"' + (p.f === courante ? ' aria-current="page"' : '') + '><b>' + p.ic + ' ' + p.nom + '</b><small>' + p.sous + '</small></a>').join('\n')
    + '\n</nav>\n' + FIN;
}

/* Les quatre entrees du menu deviennent une seule, la ou etait « SWOGE AI ». */
function menu(html, courante) {
  const m = html.match(/<nav class="(?:sw-nav|wl-nav)">[\s\S]*?<\/nav>/);   /* wl-nav : le menu de la page Wallet */
  if (!m) return html;
  let nav = m[0];
  const dansIa = PAGES.some((p) => p.f === courante);
  const ligne = (f) => new RegExp('\\n[ \\t]*<a href="' + f.replace('.', '\\.') + '"[^>]*>[\\s\\S]*?<\\/a>[ \\t]*(?=\\n)');
  /* L entree « AI Trading » : a la place de celle de SWOGE AI, ou deja la. */
  const deja = /<a href="swoge_ai\.html"[^>]*><span class="ic">&#129302;<\/span>AI Trading<\/a>/.test(nav);
  /* Les attributs d origine restent (« vif » : le style des entrees vivantes) ; sur les quatre
     pages, l entree est la page courante. */
  const attrs = (a) => { let x = (a.match(/^<a href="swoge_ai\.html"([^>]*)>/) || [])[1] || '';
    x = x.replace(/\s*aria-current="page"/, '').replace(/\s*class="([^"]*)"/, (m0, c) => { const l = c.split(/\s+/).filter((k) => k && k !== 'on'); return l.length ? ' class="' + l.join(' ') + '"' : ''; });
    if (dansIa) x = /class="/.test(x) ? x.replace(/class="([^"]*)"/, 'class="$1 on"') + ' aria-current="page"' : x + ' class="on" aria-current="page"';
    return x; };
  const remplace = (a) => ENTREE.replace('%CLS%', attrs(a));
  const re = deja ? /<a href="swoge_ai\.html"[^>]*><span class="ic">&#129302;<\/span>AI Trading<\/a>/ : /<a href="swoge_ai\.html"[^>]*>[\s\S]*?<\/a>/;
  if (!re.test(nav)) return html;   /* une page sans entree SWOGE AI : on ne touche a rien */
  nav = nav.replace(re, (a) => remplace(a));
  for (const p of PAGES.slice(1)) nav = nav.replace(ligne(p.f), '');
  return html.replace(m[0], nav);
}

function transforme(f, html) {
  let h = menu(html, f);
  const di = h.indexOf(D_DEBUT);
  if (di >= 0) h = h.slice(0, di) + design() + h.slice(h.indexOf(D_FIN, di) + D_FIN.length);
  if (PAGES.some((p) => p.f === f)) {
    const b = bloc(f);
    const i = h.indexOf(DEBUT);
    if (i >= 0) h = h.slice(0, i) + b + h.slice(h.indexOf(FIN, i) + FIN.length);
    else {
      const m = h.match(/<main[^>]*>\n?/);
      if (!m) throw new Error(f + ' : pas de <main>');
      h = h.replace(m[0], m[0] + (m[0].endsWith('\n') ? '' : '\n') + b + '\n');
    }
  }
  return h;
}

function pagesDuSite() { return fs.readdirSync(SITE).filter((f) => f.endsWith('.html')); }

module.exports = { PAGES, bloc, menu, design, transforme, pagesDuSite, DEBUT, FIN, D_DEBUT, D_FIN, SITE };
if (require.main === module) {
  let n = 0;
  for (const f of pagesDuSite()) {
    const avant = fs.readFileSync(path.join(SITE, f), 'utf8'), apres = transforme(f, avant);
    if (apres !== avant) { fs.writeFileSync(path.join(SITE, f), apres); n++; }
  }
  console.log(n + ' page(s) reecrite(s)');
}
