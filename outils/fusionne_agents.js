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
 * Le menu commun (.sw-cote) reste celui des quarante autres pages (menu_rangee.test.js, colonne_nav.test.js) ;
 * seule la colonne d affiches de droite tombe, comme le Studio qui n en a pas.
 * Premier habit (14/10) : la charte claire de studio.html. Remplace le 15/10 — voir plus bas.
 *
 * ---- L HABIT SOMBRE, DES IMAGES ET DES FILMS (15/10/2026) ----
 * Le proprietaire : « regarde la difference de qualite entre la page SWOGE AI et SWOGE Agents, c est
 * vraiment pas beau, il manque des images, des videos ». La page prend la charte de swoge_ai.html
 * (outils/agents_habit.css) ; le heros joue media/fond_agents (le fond fait pour cette page, retourne
 * en nuit) avec le Swole Doge 3D officiel en visage de l agent (img/site/ia/agent_doge.webp, detoure
 * de img/site/swoge_meme_ref.jpg) ; sous le chat, six cartes illustrees et les quatre temps d une
 * mission (outils/agents_vitrine.html). Aucune fonction ne change : memes identifiants, memes gestes.
 * Le film clair de fond_anime.js n est plus pose : derriere une page sombre il la blanchissait
 * (le constat deja fait pour swoge_ai.html, fond_anime.test.js). */
const ONGLETS_CSS = '\n' + lis('outils/agents_habit.css');

/* Les icones du Studio (studio.html, <symbol>), deux pour les onglets, quatre pour les temps d une mission. */
const ONGLETS_HTML = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="hb-check" viewBox="0 0 24 24"><path d="M5 12.5l4.4 4.4L19 7.4"/></symbol>
  <symbol id="hb-chat" viewBox="0 0 24 24"><path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6.2L6.5 19.5V16H7a2.5 2.5 0 0 1-2.5-2.5z"/></symbol>
  <symbol id="hb-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8M12 3.4c2.3 2.4 3.5 5.3 3.5 8.6s-1.2 6.2-3.5 8.6c-2.3-2.4-3.5-5.3-3.5-8.6s1.2-6.2 3.5-8.6z"/></symbol>
  <symbol id="hb-user" viewBox="0 0 24 24"><circle cx="12" cy="8.8" r="3.8"/><path d="M4.8 19.5c1.4-3.4 4.1-5.2 7.2-5.2s5.8 1.8 7.2 5.2"/></symbol>
  <symbol id="hb-plan" viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8.2 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.8"/></symbol>
  <symbol id="hb-outil" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></symbol>
  <symbol id="hb-cout" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2.1 0 2.9 5.6 1.5 5.6 4.3 0 1.3-1.2 2.1-2.8 2.1-1.3 0-2.4-.6-2.9-1.5M12 6.2v1.6M12 16.3v1.5"/></symbol>
</svg>
<section class="hub" aria-labelledby="hubTitre">
  <div class="hub-film" aria-hidden="true"><video data-film data-mp4="media/fond_agents.mp4" data-webm="media/fond_agents.webm" poster="img/site/fonds/agents.webp" muted autoplay loop playsinline preload="none" disablepictureinpicture></video></div>
  <div class="hub-sol" aria-hidden="true"><i></i></div>
  <figure class="hub-doge"><img src="img/site/ia/agent_doge.webp" alt="The SWOGE agent, the Swole Doge" width="640" height="565" fetchpriority="high"><figcaption><i></i>SWOGE agent</figcaption></figure>
  <div class="hub-texte">
    <p class="eyebrow">SWOGE Agents<span class="eb2">&nbsp;&middot; mission mode</span></p>
    <h1 id="hubTitre">Give it a mission. <span class="g">Watch every step.</span></h1>
    <p class="sub">Token checks, project research, website recon, new launches on Base: the agent plans the work, runs real tools and shows what each step cost. Images and videos are made in the <a href="studio.html">Studio</a>.</p>
    <ul class="checks" aria-label="How it works">
      <li><svg class="ic"><use href="#hb-check"/></svg>Every step shown</li>
      <li><svg class="ic"><use href="#hb-check"/></svg>Pay per use</li>
      <li><svg class="ic"><use href="#hb-check"/></svg>USDC, signed by your wallet</li>
    </ul>
  </div>
  <div class="rangee">
    <div class="onglets" role="tablist" aria-label="SWOGE Agents">
      <button type="button" role="tab" id="ongletChat" aria-controls="modeChat" aria-selected="true"><svg class="ic"><use href="#hb-chat"/></svg>Chat</button>
      <button type="button" role="tab" id="ongletBrowse" aria-controls="modeBrowse" aria-selected="false" tabindex="-1"><svg class="ic"><use href="#hb-globe"/></svg>Browse</button>
    </div>
    <a class="hub-lien" id="lienCompte" href="swoge_agents.html?mode=account"><svg class="ic"><use href="#hb-user"/></svg>Your eSIMs, hires &amp; API keys</a>
  </div>
  <div class="hub-retour" id="hubRetour" hidden><b id="hubRetourNom"></b><a href="swoge_agents.html?mode=chat" id="hubRetourChat">&larr; Back to the chat</a></div>
</section>
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
  var depart = null;
  function lis(m){ if (m === "agent") return "chat"; return m === "account" ? "compte" : m; }
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
    /* toujours Mission : les boutons de mode sont caches (voir le style plus haut) */
    var bm = document.querySelector('#modeChat .mode[data-mode="mission"]');
    if (bm && bm.getAttribute("aria-pressed") !== "true") bm.click();
    var haut = document.querySelector(".onglets").getBoundingClientRect().top;
    if (!location.hash && haut < 0) window.scrollBy(0, haut - 8);
  });
})();
</script>
`;

/* La vitrine sous le chat (15/10/2026) : outils/agents_vitrine.html. */
const VITRINE = () => lis('outils/agents_vitrine.html');

/* Les films de la page et les gestes des cartes.
 * - Un film ne se charge qu a l ecran (IntersectionObserver ; preload none et aucune source dans le
 *   HTML) et s arrete hors de l ecran ou quand l onglet est cache. Rien pour qui demande moins de
 *   mouvement ni pour qui economise ses donnees : l image reste. H.264 la ou il se lit, VP9 sinon —
 *   un Chromium sans codecs proprietaires ne lit pas le mp4 (meme choix que fond_anime.js).
 * - Une carte de mission appuie sur la suggestion du chat qui porte le meme data-sugg : le texte,
 *   le mode Mission et l indication de saisie sont ceux de swolemind.html, rien n est recopie.
 * - La carte des paiements ouvre la recharge du chat (#recharger) : elle ne signe rien, c est le
 *   joueur qui choisit et signe, comme avant. */
const VITRINE_JS = `<script>
(function(){
  "use strict";
  var calme = false, econome = false;
  try { calme = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  try { econome = !!(navigator.connection && navigator.connection.saveData); } catch (e) {}
  var films = Array.prototype.slice.call(document.querySelectorAll("video[data-film]"));
  var mp4 = false;
  try { mp4 = !!document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"'); } catch (e) {}
  function joue(v){ try { var p = v.play(); if (p && p["catch"]) p["catch"](function(){}); } catch (e) {} }
  function lance(v){
    if (!v.getAttribute("src")) {
      var m = v.getAttribute("data-mp4"), w = v.getAttribute("data-webm");
      var s = (mp4 && m) ? m : (w || m); if (!s) return;
      v.src = s;
    }
    joue(v);
  }
  films.forEach(function(v){ v.addEventListener("playing", function(){ v.classList.add("joue"); }); });
  if (!calme && !econome && films.length && "IntersectionObserver" in window) {
    var vus = new IntersectionObserver(function(es){
      es.forEach(function(e){ if (e.isIntersecting && !document.hidden) lance(e.target); else if (e.target.getAttribute("src")) e.target.pause(); });
    }, { rootMargin: "120px 0px" });
    films.forEach(function(v){ vus.observe(v); });
    document.addEventListener("visibilitychange", function(){
      films.forEach(function(v){ if (!v.getAttribute("src")) return; if (document.hidden) v.pause(); else { var r = v.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) joue(v); } });
    });
  }
  var el = function(id){ return document.getElementById(id); };
  function versLeChat(bloc){
    var c = el("cadre"); if (!c) return;
    try { c.scrollIntoView({ behavior: calme ? "auto" : "smooth", block: bloc }); } catch (e) { c.scrollIntoView(); }
  }
  Array.prototype.forEach.call(document.querySelectorAll("#vitrine [data-mission]"), function(b){
    b.addEventListener("click", function(){
      var s = document.querySelector('#accueil .suggestion[data-sugg="' + b.getAttribute("data-mission") + '"]');
      if (!s) return;
      s.click();
      versLeChat("end");
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll("#vitrine [data-paie]"), function(b){
    b.addEventListener("click", function(){
      var box = el("rechargeBox"), r = el("recharger");
      if (box && box.hidden && r) r.click();
      versLeChat("start");
    });
  });
  var vc = el("vitrineCompte");
  if (vc) vc.addEventListener("click", function(e){ var l = el("lienCompte"); if (!l) return; e.preventDefault(); l.click(); try { scrollTo(0, 0); } catch (x) {} });
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
  /* Archivo avec son axe de largeur (14/10), Inter et JetBrains Mono (15/10, les polices de
     swoge_ai.html), la marque du site en image. */
  tete = remplace(tete, 'family=Archivo:wght@600;700;800', 'family=Archivo:wdth,wght@100..125,400..900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700', 1, 'polices de SWOGE AI');
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
    '<section class="ag-mode" id="modeChat" role="tabpanel" aria-labelledby="ongletChat">\n' + chat.html + VITRINE() + '</section>\n' +
    '<section class="ag-mode" id="modeAgent" role="region" aria-label="Your eSIMs, paid hires and API keys" hidden>\n<div class="ag-cadre">\n' + COMPTE_HTML + html + '</div>\n</section>\n' +
    '<section class="ag-mode" id="modeBrowse" role="tabpanel" aria-labelledby="ongletBrowse" hidden>\n' + BROWSE() + '</section>\n' +
    '<section class="ag-mode" id="modeOsint" role="region" aria-label="OSINT lookup" hidden>\n' + os.html + '</section>\n' +
    '<section class="ag-mode" id="modeEsim" role="region" aria-label="Travel eSIM" hidden>\n' + es.html + '</section>\n' +
    '<section class="ag-mode" id="modeStore" role="region" aria-label="Agent Store" hidden>\n' + st.html + '</section>\n' +
    ONGLETS_JS + VITRINE_JS +
    jsChat + '\n' +
    js + '\n' + os.js + es.js + st.js +
    '</main>' + chat.queue;
}

module.exports = { fusionne, CIBLE };
if (require.main === module) {
  const page = fusionne();
  fs.writeFileSync(path.join(SITE, CIBLE), page);
  console.log(CIBLE + ' : ' + page.length + ' octets, genere depuis swolemind.html, swogeagentic.html, swoge_osint.html et swoge_esim.html');
}
