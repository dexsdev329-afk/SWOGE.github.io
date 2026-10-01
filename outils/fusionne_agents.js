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

const TITRE = 'SWOGE Agents · AI chat and AI agent tasks';
const RESUME = 'SWOGE Agents: chat with Claude, ChatGPT and Grok, create images and videos, or give an AI agent a task — it reads tokens, the SWOGE AI colony and the web, then answers with sources.';
const LIEN = '<a href="swoge_agents.html" class="on" aria-current="page"><span class="ic">&#129504;</span>Agents</a>';

const ONGLETS_CSS = `
/* ---- SWOGE AGENTS : deux onglets, une page (30/09/2026) ----
 * Une entree de menu au lieu de deux. Chaque onglet dit en une ligne ce
 * qu il fait : le joueur choisit sans connaitre les anciens noms. Le bouton
 * general de la page (Anton, majuscules, fond bleu) est entierement repris. */
.onglets-cadre{max-width:780px;margin:0 auto;padding:12px 16px 0}
.onglets{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;padding:4px;background:var(--panel2);border-radius:16px}
@media (max-width:560px){ .onglets{grid-template-columns:1fr 1fr} }
.onglets button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;min-width:0;
  font:inherit;text-transform:none;letter-spacing:0;background:transparent;color:var(--dim);
  border:0;border-radius:12px;padding:7px 12px;min-height:44px;cursor:pointer}
.onglets button:hover{transform:none;filter:none;color:var(--paper)}
.onglets button[aria-selected="true"]{background:var(--panel);color:var(--paper);
  box-shadow:0 1px 2px rgba(11,27,54,.08),0 4px 12px rgba(11,27,54,.06)}
.onglets button:focus-visible{outline:2px solid var(--pool);outline-offset:2px}
.onglets b{font:800 14px/1.2 'Archivo',system-ui,sans-serif}
.onglets small{font-size:11.5px;line-height:1.3;color:var(--dim)}
@media (max-width:420px){ .onglets small{display:none} }
.ag-mode[hidden]{display:none}
.ag-cadre{max-width:780px;margin:0 auto;padding:12px 16px 0}
/* Les onglets NOMMENT les deux vues : les titres « SwoleMind » et
   « SwogeAgentic » faisaient doublon. Et ils coutaient la place que la barre
   prend : le chat pose le curseur dans sa saisie, collee en bas, et le
   navigateur defile jusqu a elle. Mesure a 1280x860 avec titres : la page
   arrivait defilee de 100 px, la barre d onglets a moitie sous le haut de
   l ecran (SwoleMind seule : 23 px). */
#modeChat .chat-tete .titre,#modeAgent .ag-tete h1{display:none}
#modeChat .chat-tete .droite{margin-left:0}
#modeChat .chat{padding-top:12px}
/* OSINT et eSIM (30/09) : l onglet les nomme, leurs grands titres restent ; eSIM garde sa
   typographie a lui, le bouton general de la page (Anton, majuscules) est repris. */
#modeOsint .wrap{padding-top:14px}
/* Browse (30/09) : le navigateur a sa propre vue (outils/browse_onglet.html). */
#modeEsim .es-cadre{font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--encre)}
#modeEsim h1{font-family:inherit;text-transform:none;letter-spacing:0}
#modeEsim button{text-transform:none;letter-spacing:0}
#modeEsim button:hover{transform:none;filter:none}
`;

const ONGLETS_HTML = `<div class="onglets-cadre">
  <div class="onglets" role="tablist" aria-label="SWOGE Agents">
    <button type="button" role="tab" id="ongletChat" aria-controls="modeChat" aria-selected="true">
      <b>&#128172; Chat &amp; create</b><small>Claude, ChatGPT, Grok &middot; images &middot; videos</small></button>
    <button type="button" role="tab" id="ongletAgent" aria-controls="modeAgent" aria-selected="false" tabindex="-1">
      <b>&#129302; Agent</b><small>Give it a task: tokens, the colony, the web</small></button>
    <button type="button" role="tab" id="ongletBrowse" aria-controls="modeBrowse" aria-selected="false" tabindex="-1">
      <b>&#127760; Browse</b><small>A real browser; Screen asks the AI about what you see</small></button>
    <button type="button" role="tab" id="ongletOsint" aria-controls="modeOsint" aria-selected="false" tabindex="-1">
      <b>&#128269; OSINT</b><small>Domain, IP, site or address, from public sources</small></button>
    <button type="button" role="tab" id="ongletEsim" aria-controls="modeEsim" aria-selected="false" tabindex="-1">
      <b>&#128246; eSIM</b><small>Travel data, paid in USDC from your wallet</small></button>
  </div>
</div>
`;

/* Browse (30/09) : le navigateur et son bouton Screen, ecrits a part pour rester lisibles. */
const BROWSE = () => lis('outils/browse_onglet.html');

/* Pose la vue avant que les deux gros scripts tournent : pas d eclair du
   mauvais onglet. `?mode=` (lien partageable) passe avant le choix garde. A
   l affichage, la zone de saisie est redimensionnee : cachee, elle mesurait 0. */
const ONGLETS_JS = `<script>
(function(){
  "use strict";
  var ordre = ["chat", "agent", "browse", "osint", "esim"];
  var onglets = { chat: document.getElementById("ongletChat"), agent: document.getElementById("ongletAgent"), browse: document.getElementById("ongletBrowse"),
                  osint: document.getElementById("ongletOsint"), esim: document.getElementById("ongletEsim") };
  /* Browse (30/09) : un vrai navigateur, sur un service a part (outils/browse_onglet.html). */
  var vues = { chat: document.getElementById("modeChat"), agent: document.getElementById("modeAgent"), browse: document.getElementById("modeBrowse"),
               osint: document.getElementById("modeOsint"), esim: document.getElementById("modeEsim") };
  var saisies = { chat: "question", agent: "ag-question" };
  var courant = "chat";
  function montre(m, garde){
    if (!vues[m]) m = "chat";
    courant = m;
    Object.keys(vues).forEach(function(k){
      onglets[k].setAttribute("aria-selected", String(k === m));
      onglets[k].tabIndex = k === m ? 0 : -1;
    });
    Object.keys(vues).forEach(function(k){ vues[k].hidden = k !== m; });
    var t = document.getElementById(saisies[m]);
    if (t) try { t.dispatchEvent(new Event("input")); } catch (e) {}
    if (!garde) return;
    try { localStorage.setItem("swogeAgentsVue", m); } catch (e) {}
    try { var u = new URL(location.href); u.searchParams.set("mode", m); history.replaceState(history.state, "", u); } catch (e) {}
  }
  var depart = null;
  /* Les liens des anciennes pages rouvrent leur onglet : ?q= (enquete OSINT partagee),
     ?order= (le lien de commande eSIM, seul moyen de revoir son code d activation). */
  try { var u0 = new URLSearchParams(location.search); depart = u0.get("mode") || (u0.get("order") ? "esim" : u0.get("q") ? "osint" : null); } catch (e) {}
  if (!depart && /^#(agent|browse|chat|osint|esim)$/.test(location.hash)) depart = location.hash.slice(1);
  if (!depart) try { depart = localStorage.getItem("swogeAgentsVue"); } catch (e) {}
  montre(depart || "chat", false);
  Object.keys(onglets).forEach(function(k){
    onglets[k].addEventListener("click", function(){ montre(k, true); });
    onglets[k].addEventListener("keydown", function(e){
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var autre = ordre[(ordre.indexOf(k) + (e.key === "ArrowRight" ? 1 : ordre.length - 1)) % ordre.length];
      montre(autre, true); onglets[autre].focus(); e.preventDefault();
    });
  });
  /* Le chat pose le curseur dans sa saisie au demarrage, et le navigateur
     defile jusqu a elle. Mesure a 390x800 : SwoleMind seule arrive a 287 px,
     la page fusionnee a 304 — la barre d onglets 237 px au-dessus de l ecran,
     le choix Chat/Agent invisible. Si elle est passee au-dessus, on remonte
     juste assez pour la montrer ; a 1280 elle reste visible et rien ne bouge. */
  document.addEventListener("DOMContentLoaded", function(){
    montre(courant, false);
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
  const os = osint(), es = esim();
  const jsChat = remplace(chat.script, 'document.querySelectorAll(".suggestion")', 'document.querySelectorAll("#accueil .suggestion")', 1, 'chat : suggestions');

  return tete +
    '<main class="chat-main">\n' +
    '<!-- GENERE par outils/fusionne_agents.js depuis swolemind.html et swogeagentic.html : ne pas editer ici. -->\n' +
    chat.styles.map((s) => '<style>' + s + '</style>\n').join('') +
    '<style>\n/* ==== SWOGEAGENTIC, borne a #modeAgent (genere) ==== */\n' + cssAgent + '</style>\n' +
    '<style>\n/* ==== OSINT, borne a #modeOsint (genere) ==== */\n' + os.css + '</style>\n' +
    '<style>\n/* ==== eSIM, borne a #modeEsim (genere) ==== */\n' + es.css + '</style>\n' +
    '<style>' + ONGLETS_CSS + '</style>\n' +
    ONGLETS_HTML +
    '<section class="ag-mode" id="modeChat" role="tabpanel" aria-labelledby="ongletChat">\n' + chat.html + '</section>\n' +
    '<section class="ag-mode" id="modeAgent" role="tabpanel" aria-labelledby="ongletAgent" hidden>\n<div class="ag-cadre">\n' + html + '</div>\n</section>\n' +
    '<section class="ag-mode" id="modeBrowse" role="tabpanel" aria-labelledby="ongletBrowse" hidden>\n' + BROWSE() + '</section>\n' +
    '<section class="ag-mode" id="modeOsint" role="tabpanel" aria-labelledby="ongletOsint" hidden>\n' + os.html + '</section>\n' +
    '<section class="ag-mode" id="modeEsim" role="tabpanel" aria-labelledby="ongletEsim" hidden>\n' + es.html + '</section>\n' +
    ONGLETS_JS +
    jsChat + '\n' +
    js + '\n' + os.js + es.js +
    '</main>' + chat.queue;
}

module.exports = { fusionne, CIBLE };
if (require.main === module) {
  const page = fusionne();
  fs.writeFileSync(path.join(SITE, CIBLE), page);
  console.log(CIBLE + ' : ' + page.length + ' octets, genere depuis swolemind.html, swogeagentic.html, swoge_osint.html et swoge_esim.html');
}
