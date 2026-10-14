'use strict';
/* ==========================================================================
 * SWOGE AGENTS — LA PAGE EST GENEREE, NE PAS L EDITER A LA MAIN
 *
 *     node outils/fusionne_agents.js
 *
 * Demande du proprietaire (30/09/2026) : « fusionner SwoleMind et
 * SwogeAgentic sur une page, simple a utiliser ». Les deux pages restent les
 * SOURCES et restent en ligne : le serveur les cite (decouverte x402, fiche
 * MCP, annonces) et douze essais les chargent. `swoge_agents.html` en est
 * l assemblage : deux onglets, Chat et Agent, sous une seule entree de menu.
 * 14/10/2026 : un seul chat (Chat et Browse en onglets), au gabarit de studio.html — voir
 * « UN SEUL CHAT, AU GABARIT DU STUDIO » plus bas.
 *
 * La premiere fusion, faite a la main, remplacait CHAQUE `</script>` de la
 * page : le code des onglets se retrouvait neuf fois a l interieur des autres
 * scripts, qui tombaient tous en erreur de syntaxe — la page en ligne ne
 * faisait plus rien. Et dix-sept identifiants existaient deux fois
 * (`question`, `envoyer`, `solde`…) : l agent aurait ecrit dans le chat.
 *
 * Deux pages dans un meme document, deux regles :
 *   - les identifiants de l agent prennent le prefixe `ag-`, son `$()` aussi.
 *     Son script n atteint le DOM que par `$()` (verifie le 30/09), plus trois
 *     requetes globales reecrites une par une ci-dessous ; le chat en a une,
 *     `.suggestion`, qui aurait accroche les boutons de l agent ;
 *   - ses styles sont bornes a sa section (`#modeAgent …`) : une regle de
 *     l agent ne touche jamais le chat.
 * Chaque reecriture exige de trouver son motif le nombre de fois attendu :
 * si une source change de forme, l outil s arrete et dit ou, plutot que de
 * produire une page qui casse sans bruit. `agents_fusion.test.js` echoue si
 * la page ne correspond plus a ses sources.
 * ======================================================================== */
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..');
const CIBLE = 'swoge_agents.html';
const lis = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');

function remplace(s, motif, par, fois, quoi) {
  const n = s.split(motif).length - 1;
  if (n !== fois) throw new Error(quoi + ' : motif trouve ' + n + ' fois au lieu de ' + fois + ' — ' + JSON.stringify(motif.slice(0, 90)));
  return s.split(motif).join(par);
}
function position(s, motif, depuis, quoi) {
  const i = s.indexOf(motif, depuis || 0);
  if (i < 0) throw new Error(quoi + ' : introuvable — ' + JSON.stringify(motif.slice(0, 90)));
  return i;
}

/* Decoupe une page source en : tete (jusqu a <main>), styles, HTML, script, queue. */
function decoupe(src, ouvreMain, quoi) {
  const iMain = position(src, ouvreMain, 0, quoi + ' <main>');
  const apresMain = iMain + ouvreMain.length;
  const iScript = position(src, '\n<script>\n', apresMain, quoi + ' script');
  const iFinScript = position(src, '</script>', iScript, quoi + ' fin du script') + '</script>'.length;
  const iFinMain = position(src, '</main>', iFinScript, quoi + ' </main>');
  if (src.slice(iFinScript, iFinMain).trim()) throw new Error(quoi + ' : du contenu entre le script et </main>');
  const corps = src.slice(apresMain, iScript);
  /* Les blocs <style> de tete de <main>, puis le HTML. */
  const styles = [];
  let k = 0;
  for (;;) {
    const m = /^\s*<style>([\s\S]*?)<\/style>/.exec(corps.slice(k));
    if (!m) break;
    styles.push(m[1]); k += m[0].length;
  }
  if (!styles.length) throw new Error(quoi + ' : aucun <style> en tete de <main>');
  return {
    tete: src.slice(0, iMain), styles, html: corps.slice(k).replace(/^\n+/, ''),
    script: src.slice(iScript + 1, iFinScript), queue: src.slice(iFinMain + '</main>'.length)
  };
}

/* Borne chaque selecteur a `portee`. Les commentaires tombent (les sources
   les gardent) ; @media/@supports sont parcourus, les autres @-regles copiees ;
   `:root` reste global : c est la variable que stakebubble.js lit. */
function borne(css, portee, opts) {
  opts = opts || {};
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selecteurs = (tete) => {
    const parts = []; let prof = 0, d = 0;
    for (let i = 0; i < tete.length; i++) {
      const c = tete[i];
      if (c === '(') prof++; else if (c === ')') prof--;
      else if (c === ',' && !prof) { parts.push(tete.slice(d, i)); d = i + 1; }
    }
    parts.push(tete.slice(d));
    const r = parts.map((p) => p.trim()).map((p) => {
      if (p === ':root') return opts.racineVersPortee ? portee : p;
      if (opts.retire && opts.retire.test(p)) return null;
      if (opts.remplace && opts.remplace[p]) return opts.remplace[p];
      if (/^(html|body|:root)\b/.test(p)) throw new Error('CSS : selecteur global a trancher a la main — ' + p);
      return portee + ' ' + p;
    }).filter(Boolean);
    return r.length ? r.join(',') : null;
  };
  const bloc = (s) => {
    let res = '', k = 0;
    while (k < s.length) {
      const ouvre = s.indexOf('{', k);
      if (ouvre < 0) { if (s.slice(k).trim()) throw new Error('CSS agent : reste sans accolade — ' + s.slice(k, k + 60)); break; }
      const tete = s.slice(k, ouvre).trim();
      if (tete.includes(';')) throw new Error('CSS agent : regle sans bloc (@import ?) — ' + tete.slice(0, 60));
      let prof = 1, j = ouvre + 1;
      while (prof && j < s.length) {
        const c = s[j];
        if (c === '{') prof++;
        else if (c === '}') prof--;
        else if (c === '"' || c === "'") { j = s.indexOf(c, j + 1); if (j < 0) throw new Error('CSS agent : chaine non fermee'); }
        j++;
      }
      if (prof) throw new Error('CSS agent : accolade non fermee apres ' + tete.slice(0, 60));
      const corps = s.slice(ouvre + 1, j - 1);
      if (/^@(media|supports|container)\b/i.test(tete)) res += tete + '{' + bloc(corps) + '}\n';
      else if (tete.startsWith('@')) res += tete + '{' + corps + '}\n';
      else { const sel = selecteurs(tete); if (sel) res += sel + '{' + corps.trim() + '}\n'; }
      k = j;
    }
    return res;
  };
  return bloc(css);
}

function prefixeIds(html, p) {
  return html.replace(/(\s)id="([^"]+)"/g, '$1id="' + p + '$2"')
             .replace(/(\s)(for|aria-labelledby|aria-describedby|aria-controls)="([^"]+)"/g, '$1$2="' + p + '$3"');
}
function equilibre(html, quoi) {
  const o = (html.match(/<div[\s>]/g) || []).length, f = (html.match(/<\/div>/g) || []).length;
  if (o !== f) throw new Error(quoi + ' : ' + o + ' <div> ouverts pour ' + f + ' fermes');
}
function scripte(js) { return '<script>\n(function(){\n' + js + '\n})();\n</script>\n'; }

/* ---- OSINT (30/09, « OSINT et eSIM devraient fonctionner avec Agents, une fusion pour
   gagner de la place ») ----
   Sa feuille d en-tete est celle de SwoleMind, a la ligne pres (compare le 30/09) : seules
   ses regles de <main> sont ajoutees, bornees a #modeOsint. Son script n etait pas enferme
   (« use strict » au niveau du fichier) : il l est, sinon $, etat, enquete deviendraient
   globaux. Il n atteint le DOM que par `$(selecteur)` : les « #id » y prennent le prefixe. */
function osint() {
  const src = lis('swoge_osint.html');
  const a = position(src, '\n<main>\n', 0, 'osint <main>') + '\n<main>\n'.length;
  const b = position(src, '  <!-- LA COLONNE DE DROITE', a, 'osint colonne de droite');
  let bloc = src.slice(a, b);
  const css = [];
  bloc = bloc.replace(/<style>([\s\S]*?)<\/style>/g, (m, c) => { css.push(c); return ''; });
  if (!css.length) throw new Error('osint : aucun <style> dans <main>');
  /* <main> n est jamais ferme dans la source, et le </div> de .sw-corps y est avant la colonne :
     on retire le dernier </div> orphelin pour que le bloc soit equilibre. */
  const k = bloc.lastIndexOf('</div>'); const essai = bloc.slice(0, k) + bloc.slice(k + 6);
  const o = (bloc.match(/<div[\s>]/g) || []).length, f = (bloc.match(/<\/div>/g) || []).length;
  if (f === o + 1) bloc = essai;
  equilibre(bloc, 'osint');
  const i = position(src, '<script>\n"use strict";', b, 'osint script');
  let js = src.slice(i + '<script>\n'.length, position(src, '</script>', i, 'osint fin du script'));
  js = remplace(js, 'const $ = s => document.querySelector(s);', 'const $ = s => document.querySelector(String(s).replace(/^#/, "#os-"));', 1, 'osint : $');
  js = remplace(js, 'document.querySelectorAll(".calque")', 'document.querySelectorAll("#modeOsint .calque")', 2, 'osint : calques');
  if (/getElementById\(/.test(js)) throw new Error('osint : un getElementById contourne $()');
  return { html: prefixeIds(bloc, 'os-'), css: css.map((c) => borne(c, '#modeOsint')).join(''), js: scripte(js) };
}

/* ---- eSIM ----
   Sa feuille propre (avant « LA NOUVELLE BARRE ») est bornee a #modeEsim, ses variables de
   couleur aussi (:root -> #modeEsim), `main` devient son cadre, `html`/`body` tombent (le
   decor est celui de la page). Son script — dont le generateur de QR, en fonctions
   globales — est enferme ; il n atteint le DOM que par `$(id)` et les radios « reseau ».
   Le lien de commande se construit sur l adresse de la page : `?order=` rouvre l onglet. */
function esim() {
  const src = lis('swoge_esim.html');
  const s0 = position(src, '<style>\n:root{ --fond:', 0, 'esim styles');
  const s1 = position(src, '/* ==================== LA NOUVELLE BARRE', s0, 'esim fin des styles propres');
  const css = borne(src.slice(s0 + '<style>\n'.length, s1), '#modeEsim',
    { racineVersPortee: true, retire: /^(html|body)\b/, remplace: { main: '#modeEsim .es-cadre' } });
  const a = position(src, '\n<main>\n', 0, 'esim <main>') + '\n<main>\n'.length;
  let html = src.slice(a, position(src, '\n</main>', a, 'esim </main>'));
  equilibre(html, 'esim');
  html = remplace(html, 'name="reseau"', 'name="esReseau"', 2, 'esim : radios');
  const i = position(src, '<script>\n/* ---- LE QR DU CODE', 0, 'esim script');
  let js = src.slice(i + '<script>\n'.length, position(src, '</script>', i, 'esim fin du script'));
  js = remplace(js, 'var $ = function(id){ return document.getElementById(id); };', 'var $ = function(id){ return document.getElementById("es-" + id); };', 1, 'esim : $');
  js = remplace(js, 'input[name="reseau"]', 'input[name="esReseau"]', 2, 'esim : radios');
  if ((js.match(/getElementById\(/g) || []).length !== 1) throw new Error('esim : un getElementById contourne $()');
  return { html: '<div class="es-cadre">\n' + prefixeIds(html, 'es-') + '</div>\n', css, js: scripte(js) };
}

/* ---- AGENT STORE (01/10, « met le dans Agents ») ----
   agent_store.html reste en ligne (le serveur et des liens exterieurs la citent) ; l onglet en
   reprend le contenu de <main>, ses identifiants prefixes `st-`, ses regles bornees a
   #modeStore. Ses variables de couleur (--fond, --pale…) existent aussi dans le chat avec
   d autres valeurs : elles sont posees sur #modeStore et non sur :root. */
function store() {
  const src = lis('agent_store.html');
  const v0 = position(src, '<style>\n:root{ --fond:', 0, 'store styles') + '<style>\n'.length;
  const v1 = position(src, '\n', v0, 'store fin des variables');
  const vars = src.slice(v0 + ':root{'.length, v1).replace(/\}\s*$/, '');
  const c0 = position(src, 'main{ max-width:1080px;', v1, 'store regles');
  const c1 = position(src, '/* ==================== LA NOUVELLE BARRE', c0, 'store fin des regles');
  /* Sa barre a deux rayons s appelle `.onglets`, comme celle de la page : renommee, sinon la
     grille a six colonnes d Agents s y applique. */
  const css = '#modeStore{' + vars + '}\n' + borne(remplace(src.slice(c0, c1), '.onglets', '.st-onglets', 3, 'store : classe des rayons'), '#modeStore');
  const a = position(src, '\n<main>\n', 0, 'store <main>') + '\n<main>\n'.length;
  let html = src.slice(a, position(src, '\n</main>', a, 'store </main>'));
  equilibre(html, 'store');
  html = remplace(html, 'class="onglets"', 'class="st-onglets"', 1, 'store : barre des rayons');
  const i = position(src, '<script>\n(function(){\n  "use strict";\n  var $ = function(id){ return document.getElementById(id); };', 0, 'store script');
  let js = src.slice(i + '<script>\n'.length, position(src, '</script>', i, 'store fin du script'));
  js = remplace(js, 'var $ = function(id){ return document.getElementById(id); };', 'var $ = function(id){ return document.getElementById("st-" + id); };', 1, 'store : $');
  if ((js.match(/getElementById\(/g) || []).length !== 1 || /querySelector/.test(js)) throw new Error('store : une requete contourne $()');
  return { html: '<div class="st-cadre">\n' + prefixeIds(html, 'st-') + '</div>\n', css, js: '<script>\n' + js + '</script>\n' };
}

const TITRE = 'SWOGE Agents · AI chat and AI agent tasks';
const RESUME = 'SWOGE Agents: chat with Claude, ChatGPT and Grok, create images and videos, or give an AI agent a task — it reads tokens, the SWOGE AI colony and the web, then answers with sources.';
const LIEN = '<a href="swoge_agents.html" class="on" aria-current="page"><span class="ic">&#129504;</span>Agents</a>';

/* ---- UN SEUL CHAT, AU GABARIT DU STUDIO (14/10/2026) ----
 * Demande du proprietaire : « le store ca sert a rien de l afficher, c est bien d avoir ses
 * donnees si on demande a l agent de trouver un bon service ; le osint aussi sert a rien, on
 * peut demander dans le chat ; le esim aussi ; et peut-etre meme que chat et agent chat c est
 * la meme chose, autant mettre qu un chat ; et refaire le design de la page comme swoge studio ».
 *
 * Ce qui a ete lu avant de trancher (14/10) :
 *   - Chat et Agent partent vers la MEME route : le mode Mission du chat (swolemind.html,
 *     envoyerMission) et la tache de l agent (swogeagentic.html) postent tous deux sur
 *     /studio/agent, avec le meme catalogue (/studio/agent/catalogue) et donc les memes outils
 *     cote serveur (studio_agent.js : scan_token, colony_activity, osint_lookup,
 *     find_esim_plans / propose_esim_purchase, find_paid_services / hire_paid_service,
 *     web_search, read_page…). Le chat montre deja l offre eSIM et la carte de lancement.
 *     Mission est le mode par defaut d un nouveau visiteur depuis le 29/09.
 *   - Ce que seul l onglet Agent montrait : les embauches du jour et leur plafond, la liste
 *     « Your eSIMs » (le code d activation d une eSIM achetee par le chat y arrive), la section
 *     x402 et les cles d API. Ce n est pas un second chat : c est un compte. Il reste dans la
 *     page (vue « account », lien sous les onglets), sans son cadre de tache.
 *   - OSINT, eSIM et Store restent dans la page, sans onglet : `?q=` (enquete partagee),
 *     `?order=` (le lien de commande, SEUL moyen de revoir son code d activation hors compte),
 *     `?mode=osint|esim|store` et `?tab=x402` rouvrent toujours leur vue. Le chat les atteint
 *     par ses outils (osint_lookup, find_esim_plans, find_paid_services).
 *
 * La page prend la charte de studio.html : fond #EEF3FB sous un halo, cartes blanches bordees
 * #E1E9F6, encre #0B1B36, UN accent bleu #1B5FE0, Archivo elargie, titre au mot surligne,
 * onglets en pilule dont l actif est marine, icones SVG en ligne. Le menu commun (.sw-cote)
 * reste celui des quarante autres pages (menu_rangee.test.js, colonne_nav.test.js) ; seule la
 * colonne d affiches de droite tombe, comme le Studio qui n en a pas. */
const ONGLETS_CSS = `
:root{--hb-bg:#EEF3FB;--hb-line:#E1E9F6;--hb-ink:#0B1B36;--hb-navy:#0A1F44;--hb-text2:#3A4C6B;--hb-dim:#5A6B85;--hb-dim2:#5F6E88;
  --hb-blue:#1B5FE0;--hb-blue-soft:#EAF1FF;--hb-green:#12805A;
  --hb-sh-card:0 1px 2px rgba(11,27,54,.06),0 8px 24px rgba(11,27,54,.05);
  --hb-sh-box:0 2px 14px rgba(11,27,54,.06),0 30px 60px -30px rgba(27,95,224,.30);
  --hb-f:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
body{background:radial-gradient(900px 420px at 50% -140px,#D9E6FF 0%,rgba(217,230,255,0) 72%),var(--hb-bg)}
/* La barre du haut : verre blanc et marque du Studio (l icone du site, pas l emoji). */
.sw-haut{background:rgba(255,255,255,.94);backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px)}
.sw-marque img{width:36px;height:36px;border-radius:11px;box-shadow:0 0 0 1px var(--hb-line);display:block}
.sw-marque b,.sw-marque i{font-family:var(--hb-f)}
.sw-marque i{color:var(--hb-dim2)}
.sw-nav a{font-family:var(--hb-f);color:var(--hb-text2)}
.sw-nav a:hover{background:var(--hb-blue-soft);color:var(--hb-blue)}
.sw-nav a.on{color:var(--hb-blue)}
@media (min-width:1361px){
  .sw-lat{display:none}
  .sw-corps{grid-template-columns:230px minmax(0,1fr);max-width:1480px;gap:24px;padding:14px 24px}
}
.hub{max-width:1040px;margin:0 auto;padding:20px 16px 0;text-align:center;font-family:var(--hb-f);color:var(--hb-ink)}
.hub .ic{width:18px;height:18px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.hub .eyebrow{display:inline-flex;align-items:center;gap:8px;padding:5px 12px 5px 6px;border-radius:999px;background:#fff;border:1px solid var(--hb-line);
  font:800 11.5px/1 var(--hb-f);letter-spacing:1.6px;text-transform:uppercase;color:var(--hb-navy);box-shadow:var(--hb-sh-card)}
.hub .eyebrow span{width:22px;height:22px;border-radius:999px;background:var(--hb-blue);display:grid;place-items:center;color:#fff}
.hub .eyebrow .ic{width:13px;height:13px;stroke-width:2.2}
.hub h1{font:850 42px/1.06 var(--hb-f);font-stretch:106%;letter-spacing:-1.5px;text-transform:none;color:var(--hb-navy);margin:12px auto 8px;max-width:860px}
.hub .hl{display:inline-block;background:var(--hb-blue);color:#fff;padding:0 .2em .04em;border-radius:12px;
  box-shadow:0 12px 30px -8px rgba(27,95,224,.55);transform:rotate(-1.2deg)}
.hub .sub{font:500 16px/1.5 var(--hb-f);color:var(--hb-dim);max-width:760px;margin:0 auto}
.hub .checks{list-style:none;display:flex;justify-content:center;flex-wrap:wrap;gap:8px 18px;margin:12px 0 0;padding:0}
.hub .checks li{display:inline-flex;align-items:center;gap:6px;font:700 13.5px/1 var(--hb-f);color:var(--hb-navy)}
.hub .checks .ic{width:16px;height:16px;color:#fff;background:var(--hb-green);border-radius:999px;padding:3px;stroke-width:3}
.hub .rangee{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px 14px;margin:16px 0 14px}
/* Les onglets du Studio. Le bouton general de la page (Anton, majuscules, fond bleu) est repris en entier. */
.onglets{display:inline-flex;gap:4px;padding:5px;background:#fff;border:1px solid var(--hb-line);border-radius:999px;box-shadow:var(--hb-sh-card)}
.onglets button{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 20px;border:0;border-radius:999px;background:transparent;min-width:0;
  font:650 15px/1 var(--hb-f);text-transform:none;letter-spacing:0;color:var(--hb-dim);cursor:pointer;box-shadow:none}
.onglets button:hover{color:var(--hb-navy);transform:none;filter:none;background:transparent}
.onglets button[aria-selected="true"]{background:var(--hb-navy);color:#fff;box-shadow:0 6px 16px -6px rgba(10,31,68,.55)}
.onglets button:focus-visible,.hub a:focus-visible{outline:2px solid var(--hb-blue);outline-offset:2px}
.hub-lien{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 14px;border-radius:999px;font:650 13.5px/1 var(--hb-f);
  color:var(--hb-text2);text-decoration:none;border:1px solid transparent}
.hub-lien:hover{background:#fff;border-color:var(--hb-line);color:var(--hb-blue)}
.hub-lien[aria-current="page"]{background:var(--hb-blue-soft);color:var(--hb-blue)}
.hub-retour[hidden]{display:none}
.hub-retour{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px 12px;margin:0 0 12px;font:600 13.5px/1.4 var(--hb-f);color:var(--hb-dim)}
.hub-retour b{color:var(--hb-navy)}
.hub-retour a{color:var(--hb-blue);text-decoration:none;font-weight:700}
.ag-mode[hidden]{display:none}
/* Le chat et le compte prennent la largeur du Studio ; le cadre du chat devient une carte du Studio. */
#modeChat .chat{max-width:1040px}
#modeChat .ch-cadre{border-radius:22px;border-color:var(--hb-line);box-shadow:var(--hb-sh-box)}
/* Les onglets NOMMENT la vue : le titre « SwoleMind » faisait doublon (mesure du 30/09 a
   1280x860 : avec titres, la page arrivait defilee de 100 px). */
#modeChat .chat-tete .titre{display:none}
#modeChat .chat-tete .droite{margin-left:0}
#modeChat .chat{padding-top:0}
/* L accueil du chat se centrait en flex : plus haut que le cadre, son haut passait SOUS le bord, hors
   d atteinte (titre coupe a 1440x900 avant ce changement deja). Des marges automatiques centrent sans
   jamais couper : ce qui deborde defile. */
#modeChat .accueil{justify-content:flex-start}
#modeChat .accueil > :first-child{margin-top:auto}
#modeChat .accueil > :last-child{margin-bottom:auto}
/* Le titre et l intro Mission de l accueil redisent ce que dit le titre de la page : ils tombent ici
   (swolemind.html, seule, les garde). Reste ce qui sert : les suggestions et la facon de payer. */
#modeChat .accueil > h1,#modeChat .accueil > .mission-intro{display:none}
/* Le compte : ce que l onglet Agent avait en plus du chat (embauches, eSIM, x402, cles d API). Son
   cadre de tache ne s affiche plus : la tache part du chat, mode Mission, sur la meme route. */
.ag-cadre{max-width:1040px;margin:0 auto;padding:0 16px}
#modeAgent .ta-cadre{display:none}
#modeAgent .ta-plus{margin-top:0}
#modeAgent details.dev{background:#fff;border:1px solid var(--hb-line);border-radius:18px;box-shadow:var(--hb-sh-card)}
.compte-vide{font:500 14px/1.5 var(--hb-f);color:var(--hb-dim);text-align:center;margin:0 0 12px}
/* Browse : « .bw-cadre img{display:block} » l emportait sur l attribut hidden — avant la premiere
   page, le texte de remplacement de l ecran vide s affichait sous la consigne (releve du 14/10). */
#modeBrowse .bw-cadre img[hidden]{display:none}
/* OSINT et eSIM : l onglet n est plus la, leurs grands titres les nomment. */
#modeOsint .wrap{padding-top:14px}
#modeEsim .es-cadre{font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--encre)}
#modeEsim h1{font-family:inherit;text-transform:none;letter-spacing:0}
#modeEsim button{text-transform:none;letter-spacing:0}
#modeEsim button:hover{transform:none;filter:none}
#modeStore .st-cadre{max-width:1080px;margin:0 auto;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--encre)}
#modeStore h1{font-family:inherit;text-transform:none;letter-spacing:-.01em}
#modeStore button{text-transform:none;letter-spacing:0}
#modeStore button:hover{transform:none;filter:none}
/* La hauteur va au chat : les trois garanties ne s affichent que sur un grand ecran. */
@media (max-height:1000px){ .hub .checks{display:none} }
/* Un ecran bas : le chat doit tenir sous l en-tete, composeur visible a l arrivee (1024x768). */
@media (max-height:860px){
  .hub{padding-top:14px}
  .hub h1{font-size:34px;letter-spacing:-1.1px;margin:10px auto 6px}
  .hub .checks{display:none}
  .hub .rangee{margin:12px 0 10px}
}
@media (max-height:780px){ .hub .sub{display:none} }
@media (max-width:720px){
  .hub{padding:14px 16px 0}
  .hub .eyebrow{font-size:10.5px}
  .hub h1{font-size:28px;letter-spacing:-.9px;margin:10px auto 6px}
  .hub .hl{border-radius:9px}
  .hub .sub{font-size:14.5px}
  .hub .sub .s2,.hub .checks{display:none}
  /* Au telephone, la place va au composeur : le titre et les onglets disent deja tout. */
  .hub .sub{display:none}
  .hub .rangee{margin:12px 0 10px}
  .onglets{display:flex;width:100%}
  .onglets button{flex:1 1 0;justify-content:center;height:40px;padding:0 8px;font-size:14px}
  .hub-lien{height:34px}
}
`;

/* Les icones du Studio (studio.html, <symbol>), et deux de plus pour les onglets. */
const ONGLETS_HTML = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="hb-spark" viewBox="0 0 24 24"><path d="M11 2.8l2.1 6 6.1 2.1-6.1 2.1-2.1 6-2.1-6-6.1-2.1 6.1-2.1z" fill="currentColor" stroke="none"/><path d="M18.6 14.6l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" fill="currentColor" stroke="none"/></symbol>
  <symbol id="hb-check" viewBox="0 0 24 24"><path d="M5 12.5l4.4 4.4L19 7.4"/></symbol>
  <symbol id="hb-chat" viewBox="0 0 24 24"><path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6.2L6.5 19.5V16H7a2.5 2.5 0 0 1-2.5-2.5z"/></symbol>
  <symbol id="hb-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8M12 3.4c2.3 2.4 3.5 5.3 3.5 8.6s-1.2 6.2-3.5 8.6c-2.3-2.4-3.5-5.3-3.5-8.6s1.2-6.2 3.5-8.6z"/></symbol>
  <symbol id="hb-user" viewBox="0 0 24 24"><circle cx="12" cy="8.8" r="3.8"/><path d="M4.8 19.5c1.4-3.4 4.1-5.2 7.2-5.2s5.8 1.8 7.2 5.2"/></symbol>
</svg>
<div class="hub">
  <span class="eyebrow"><span><svg class="ic"><use href="#hb-spark"/></svg></span>SWOGE Agents</span>
  <h1>One chat that <span class="hl">gets it done.</span></h1>
  <p class="sub">Ask Claude, ChatGPT or Grok, make an image or a video, or give it a mission.<span class="s2"> It runs real tools &mdash; tokens, the colony, the web, domains, eSIMs &mdash; and shows each step&rsquo;s cost.</span></p>
  <ul class="checks" aria-label="How it works">
    <li><svg class="ic"><use href="#hb-check"/></svg>Claude, ChatGPT, Grok</li>
    <li><svg class="ic"><use href="#hb-check"/></svg>Every step shown</li>
    <li><svg class="ic"><use href="#hb-check"/></svg>Pay per use</li>
  </ul>
  <div class="rangee">
    <div class="onglets" role="tablist" aria-label="SWOGE Agents">
      <button type="button" role="tab" id="ongletChat" aria-controls="modeChat" aria-selected="true"><svg class="ic"><use href="#hb-chat"/></svg>Chat</button>
      <button type="button" role="tab" id="ongletBrowse" aria-controls="modeBrowse" aria-selected="false" tabindex="-1"><svg class="ic"><use href="#hb-globe"/></svg>Browse</button>
    </div>
    <a class="hub-lien" id="lienCompte" href="swoge_agents.html?mode=account"><svg class="ic"><use href="#hb-user"/></svg>Your eSIMs, hires &amp; API keys</a>
  </div>
  <div class="hub-retour" id="hubRetour" hidden><b id="hubRetourNom"></b><a href="swoge_agents.html?mode=chat" id="hubRetourChat">&larr; Back to the chat</a></div>
</div>
`;

/* Le compte : ce qui coiffe la vue « account ». Le reste vient de swogeagentic.html. */
const COMPTE_HTML = `<p class="compte-vide">Missions run in the chat. Here: the eSIMs you bought, the paid services the agent hired for you and their daily limit, and API keys for your own agents.</p>
`;

/* Browse (30/09) : le navigateur et son bouton Screen, ecrits a part pour rester lisibles. */
const BROWSE = () => lis('outils/browse_onglet.html');

/* Pose la vue avant que les gros scripts tournent : pas d eclair de la mauvaise vue. `?mode=`
   (lien partageable) passe avant le choix garde. A l affichage, la zone de saisie est
   redimensionnee : cachee, elle mesurait 0. Deux onglets (Chat, Browse) ; les autres vues n ont
   pas d onglet, s ouvrent par leur adresse et disent comment revenir au chat. */
const ONGLETS_JS = `<script>
(function(){
  "use strict";
  var el = function(id){ return document.getElementById(id); };
  var ordre = ["chat", "browse"];
  var onglets = { chat: el("ongletChat"), browse: el("ongletBrowse") };
  var vues = { chat: el("modeChat"), compte: el("modeAgent"), browse: el("modeBrowse"), osint: el("modeOsint"), esim: el("modeEsim"), store: el("modeStore") };
  var NOMS = { compte: "Your eSIMs, paid hires and API keys", osint: "OSINT lookup \\u2014 or just ask the chat", esim: "Travel eSIM \\u2014 or just ask the chat", store: "Agent Store \\u2014 the chat finds paid services for you" };
  /* L adresse : « account » pour le compte (l identifiant de la section reste modeAgent). */
  var ADRESSE = { compte: "account" };
  var saisies = { chat: "question" };
  var courant = "chat";
  function montre(m, garde){
    if (!vues[m]) m = "chat";
    courant = m;
    Object.keys(onglets).forEach(function(k){
      onglets[k].setAttribute("aria-selected", String(k === m));
      onglets[k].tabIndex = (k === m || (!onglets[m] && k === "chat")) ? 0 : -1;
    });
    Object.keys(vues).forEach(function(k){ vues[k].hidden = k !== m; });
    el("hubRetour").hidden = !!onglets[m];
    el("hubRetourNom").textContent = NOMS[m] || "";
    if (m === "compte") el("lienCompte").setAttribute("aria-current", "page"); else el("lienCompte").removeAttribute("aria-current");
    var t = el(saisies[m]);
    if (t) try { t.dispatchEvent(new Event("input")); } catch (e) {}
    if (!garde) return;
    /* Seules les vues a onglet se retiennent : un ancien choix (agent, osint, esim, store) rouvre le chat. */
    if (onglets[m]) try { localStorage.setItem("swogeAgentsVue", m); } catch (e) {}
    try { var u = new URL(location.href); u.searchParams.set("mode", ADRESSE[m] || m); history.replaceState(history.state, "", u); } catch (e) {}
  }
  /* ?mode=agent (les liens d avant le 14/10) : le chat, en mode Mission — la meme route
     /studio/agent, les memes outils. ?mode=account : le compte. */
  var depart = null, mission = false;
  function lis(m){ if (m === "agent") { mission = true; return "chat"; } return m === "account" ? "compte" : m; }
  /* Les liens des anciennes pages rouvrent leur vue : ?q= (enquete OSINT partagee), ?order= (le
     lien de commande eSIM, seul moyen de revoir son code d activation), ?tab=x402 (l ancien rayon
     « x402 services » de l Agent Store). */
  try { var u0 = new URLSearchParams(location.search);
    depart = u0.get("mode") ? lis(u0.get("mode")) : u0.get("order") ? "esim" : u0.get("q") ? "osint" : u0.get("tab") === "x402" ? "store" : null; } catch (e) {}
  if (!depart && /^#(agent|account|browse|chat|osint|esim|store)$/.test(location.hash)) depart = lis(location.hash.slice(1));
  if (!depart) try { var g = localStorage.getItem("swogeAgentsVue"); if (onglets[g]) depart = g; } catch (e) {}
  montre(depart || "chat", false);
  Object.keys(onglets).forEach(function(k){
    onglets[k].addEventListener("click", function(){ montre(k, true); });
    onglets[k].addEventListener("keydown", function(e){
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var autre = ordre[(ordre.indexOf(k) + (e.key === "ArrowRight" ? 1 : ordre.length - 1)) % ordre.length];
      montre(autre, true); onglets[autre].focus(); e.preventDefault();
    });
  });
  el("lienCompte").addEventListener("click", function(e){ e.preventDefault(); montre("compte", true); });
  el("hubRetourChat").addEventListener("click", function(e){ e.preventDefault(); montre("chat", true); el("ongletChat").focus(); });
  /* Le chat pose le curseur dans sa saisie au demarrage, et le navigateur defile jusqu a elle.
     Mesure a 390x800 (30/09) : la barre d onglets finissait 237 px au-dessus de l ecran. Si elle
     est passee au-dessus, on remonte juste assez pour la montrer ; sinon rien ne bouge. */
  document.addEventListener("DOMContentLoaded", function(){
    montre(courant, false);
    if (mission) { var b = document.querySelector('#modeChat .mode[data-mode="mission"]'); if (b) b.click(); }
    var haut = document.querySelector(".onglets").getBoundingClientRect().top;
    if (!location.hash && haut < 0) window.scrollBy(0, haut - 8);
  });
})();
</script>
`;

function fusionne() {
  const chat = decoupe(lis('swolemind.html'), '<main class="chat-main">\n', 'swolemind.html');
  const ag = decoupe(lis('swogeagentic.html'), '<main class="chat-main ag">\n', 'swogeagentic.html');

  /* ---- la tete : celle du chat, renommee ---- */
  let tete = chat.tete;
  tete = remplace(tete, '<title>SwoleMind · AI chat with Claude, ChatGPT and Grok</title>', '<title>' + TITRE + '</title>', 1, 'titre');
  tete = remplace(tete, 'content="SwoleMind · AI chat with Claude, ChatGPT and Grok"', 'content="' + TITRE + '"', 2, 'titres de partage');
  tete = remplace(tete, 'https://swoleeswoge.dog/swolemind.html', 'https://swoleeswoge.dog/' + CIBLE, 2, 'adresse canonique');
  tete = remplace(tete, 'SwoleMind: chat with Claude, ChatGPT and Grok, search the web with sources, create images and videos.', RESUME, 3, 'resumes');
  remplace(tete, LIEN, LIEN, 1, 'entree Agents du menu');
  if (/href="swolemind\.html"|href="swogeagentic\.html"/.test(tete)) throw new Error('tete : le menu pointe encore vers une ancienne page');
  /* Le gabarit du Studio (14/10) : Archivo avec son axe de largeur, la marque du site en image. */
  tete = remplace(tete, 'family=Archivo:wght@600;700;800', 'family=Archivo:wdth,wght@100..125,400..900', 1, 'police du Studio');
  tete = remplace(tete, '<span class="sw-patte">&#128062;</span>', '<img src="img/site/icone-180.png" alt="" width="36" height="36">', 1, 'marque du Studio');

  /* ---- l agent : identifiants prefixes, requetes globales bornees ---- */
  let html = ag.html.replace(/(\s)id="([^"]+)"/g, '$1id="ag-$2"')
                    .replace(/(\s)(for|aria-labelledby|aria-describedby|aria-controls)="([^"]+)"/g, '$1$2="ag-$3"');
  html = remplace(html, 'name="rcReseau"', 'name="agRcReseau"', 2, 'agent : reseau de recharge');
  let js = ag.script;
  js = remplace(js, 'var $ = function(id){ return document.getElementById(id); };',
                    'var $ = function(id){ return document.getElementById("ag-" + id); };', 1, 'agent : $()');
  js = remplace(js, 'input[name="rcReseau"]', 'input[name="agRcReseau"]', 2, 'agent : reseau de recharge');
  js = remplace(js, '"#rcMontants [data-usd]"', '"#ag-rcMontants [data-usd]"', 2, 'agent : montants de recharge');
  js = remplace(js, 'document.querySelectorAll(".suggestion")', 'document.querySelectorAll("#ag-accueil .suggestion")', 1, 'agent : suggestions');
  if (/getElementById\((?!"ag-" \+ id\))/.test(js)) throw new Error('agent : un getElementById contourne $()');
  const cssAgent = ag.styles.map((s) => borne(s, '#modeAgent')).join('');

  /* ---- le chat : sa seule requete globale qui aurait pris les boutons de l agent ---- */
  const os = osint(), es = esim(), st = store();
  let jsChat = remplace(chat.script, 'document.querySelectorAll(".suggestion")', 'document.querySelectorAll("#accueil .suggestion")', 1, 'chat : suggestions');
  /* L eSIM achetee depuis le chat : son code arrive dans le compte de CETTE page, plus « sur SwogeAgentic ». */
  jsChat = remplace(jsChat, '"Bought. Your activation code is under \u201cYour eSIMs\u201d on SwogeAgentic."',
    '"Bought. Your activation code is under \u201cYour eSIMs, hires & API keys\u201d, just above the chat."', 1, 'chat : eSIM livree');
  jsChat = remplace(jsChat, '"Paid: your eSIM is being prepared (see SwogeAgentic)."',
    '"Paid: your eSIM is being prepared. It will appear under \u201cYour eSIMs, hires & API keys\u201d, just above the chat."', 1, 'chat : eSIM en preparation');

  return tete +
    '<main class="chat-main">\n' +
    '<!-- GENERE par outils/fusionne_agents.js depuis swolemind.html et swogeagentic.html : ne pas editer ici. -->\n' +
    chat.styles.map((s) => '<style>' + s + '</style>\n').join('') +
    '<style>\n/* ==== SWOGEAGENTIC, borne a #modeAgent (genere) ==== */\n' + cssAgent + '</style>\n' +
    '<style>\n/* ==== OSINT, borne a #modeOsint (genere) ==== */\n' + os.css + '</style>\n' +
    '<style>\n/* ==== eSIM, borne a #modeEsim (genere) ==== */\n' + es.css + '</style>\n' +
    '<style>\n/* ==== Agent Store, borne a #modeStore (genere) ==== */\n' + st.css + '</style>\n' +
    '<style>' + ONGLETS_CSS + '</style>\n' +
    ONGLETS_HTML +
    '<section class="ag-mode" id="modeChat" role="tabpanel" aria-labelledby="ongletChat">\n' + chat.html + '</section>\n' +
    '<section class="ag-mode" id="modeAgent" role="region" aria-label="Your eSIMs, paid hires and API keys" hidden>\n<div class="ag-cadre">\n' + COMPTE_HTML + html + '</div>\n</section>\n' +
    '<section class="ag-mode" id="modeBrowse" role="tabpanel" aria-labelledby="ongletBrowse" hidden>\n' + BROWSE() + '</section>\n' +
    '<section class="ag-mode" id="modeOsint" role="region" aria-label="OSINT lookup" hidden>\n' + os.html + '</section>\n' +
    '<section class="ag-mode" id="modeEsim" role="region" aria-label="Travel eSIM" hidden>\n' + es.html + '</section>\n' +
    '<section class="ag-mode" id="modeStore" role="region" aria-label="Agent Store" hidden>\n' + st.html + '</section>\n' +
    ONGLETS_JS +
    jsChat + '\n' +
    js + '\n' + os.js + es.js + st.js +
    '</main>' + chat.queue.replace('</body>', FOND() + '</body>');
}

/* Le fond d ecran anime (fond_anime.js), avec l empreinte du fichier relue a chaque generation :
   un marqueur ecrit a la main ici serait perime au premier changement du script. */
function FOND() {
  const v = require('crypto').createHash('md5').update(fs.readFileSync(path.join(SITE, 'fond_anime.js'))).digest('hex').slice(0, 8);
  return '<!-- Le fond d ecran anime, derriere tout : voir fond_anime.js. -->\n<script src="fond_anime.js?v=' + v + '" data-fond="agents" defer></script>\n';
}

module.exports = { fusionne, CIBLE };
if (require.main === module) {
  const page = fusionne();
  fs.writeFileSync(path.join(SITE, CIBLE), page);
  console.log(CIBLE + ' : ' + page.length + ' octets, genere depuis swolemind.html, swogeagentic.html, swoge_osint.html et swoge_esim.html');
}
