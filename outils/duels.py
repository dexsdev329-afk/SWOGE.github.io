#!/usr/bin/env python3
"""
Fabrique morpion.html et dames.html a partir de connect4.html.

Meme raison qu'au Connect 4 lui-meme : la page du Connect 4 porte deja TOUTE
la plomberie du un-contre-un — le vestibule, la mise, la revanche nominative,
la pendule, le reglement, le profil, le portefeuille. La reecrire deux fois
serait la faire diverger trois fois.

Ce qui change d'un jeu a l'autre tient dans quatre endroits, et quatre
seulement : le plateau (son DOM, son CSS, sa peinture), le coup qu'on envoie,
les noms des messages, et les etiquettes. Tout le reste est repris tel quel.

Chaque decoupe se fait sur un REPERE, jamais sur un numero de ligne, et echoue
bruyamment si le repere a bouge.
"""
import re, sys, os

import os
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(RACINE, 'connect4.html')
SORTIE = {'mp': '/home/user/SWOGE.github.io/morpion.html',
          'dm': '/home/user/SWOGE.github.io/dames.html'}

src = open(SRC, encoding='utf-8').read().replace('\r\n', '\n')


def corps_fonction(texte, nom):
    """Le texte complet de `function nom(...){ ... }`, accolades comptees."""
    m = re.search(r'\n(\s*)function ' + nom + r'\(', texte)
    if not m:
        sys.exit('FONCTION INTROUVABLE : ' + nom)
    i = texte.index('{', m.end())
    prof = 0
    for j in range(i, len(texte)):
        if texte[j] == '{':
            prof += 1
        elif texte[j] == '}':
            prof -= 1
            if prof == 0:
                return texte[m.start() + 1:j + 1]
    sys.exit('FIN DE FONCTION INTROUVABLE : ' + nom)


def remplace_fonction(texte, nom, neuf):
    vieux = corps_fonction(texte, nom)
    return texte.replace(vieux, neuf.strip('\n'), 1)


def remplace(texte, vieux, neuf, quoi, nb=-1):
    if vieux not in texte:
        sys.exit('REPERE INTROUVABLE (' + quoi + ') : ' + vieux[:70])
    return texte.replace(vieux, neuf) if nb < 0 else texte.replace(vieux, neuf, nb)


# ============================================================== LE MORPION

MP_CSS = '''
/* ------------------------------------------------- le plateau du morpion */
.mo-grille{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px;
  aspect-ratio:1/1; width:100%; max-width:420px; margin:0 auto; }
.mo-case{ position:relative; border-radius:14px; cursor:pointer;
  background:radial-gradient(120% 120% at 30% 20%,rgba(255,255,255,.07),rgba(0,0,0,.55));
  border:1px solid rgba(230,165,55,.28);
  display:flex; align-items:center; justify-content:center;
  font-family:"Luckiest Guy",system-ui,sans-serif; font-size:clamp(38px,11vw,74px);
  line-height:1; transition:background .15s,border-color .15s,transform .12s; }
.mo-case.libre:hover{ border-color:#FFC53D; transform:translateY(-2px); }
.mo-case .mk{ animation:moPose .18s ease-out; }
.mo-case .p1{ color:#FF6B5A; text-shadow:0 0 18px rgba(255,107,90,.55); }
.mo-case .p2{ color:#5AC8FF; text-shadow:0 0 18px rgba(90,200,255,.55); }
.mo-case.gagne{ background:rgba(22,217,127,.20); border-color:#16D97F;
  box-shadow:0 0 22px rgba(22,217,127,.35); }
@keyframes moPose{ from{ transform:scale(.4); opacity:0; } to{ transform:scale(1); opacity:1; } }
/* Le jeton du bandeau porte la marque du joueur, pas un pion de Connect 4. */
.c4-joueur .pion{ background:none!important; box-shadow:none!important; border:0!important;
  width:auto!important; height:auto!important; overflow:visible;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif; font-size:16px;
  font-weight:900; line-height:1; display:inline-flex; align-items:center; }
.c4-joueur.j1 .pion::before{ content:"✕"; color:#FF6B5A; }
.c4-joueur.j2 .pion::before{ content:"◯"; color:#5AC8FF; }
'''

MP_DOM = '''      <div class="c4-plateau" id="c4Plateau">
        <div class="mo-grille" id="c4Grille"></div>
      </div>'''

MP_JS = '''
  function c4Construit(){
    var g=$("c4Grille"), h="", i;
    for(i=0;i<9;i++) h+='<div class="mo-case" data-i="'+i+'"></div>';
    g.innerHTML=h;
  }

  function c4PeintPlateau(){
    var m=C4.match, gr=(m&&m.grille)||[], cases=$("c4Grille").children, i, el, v;
    var ligne=(m&&m.ligne)||[];
    var aMoi = m && m.phase==="en_cours" && c4MonJeton()===m.tour;
    for(i=0;i<cases.length;i++){
      el=cases[i]; v=gr[i]||0;
      var voulu = v ? '<span class="mk p'+v+'">'+(v===1?"\\u2715":"\\u25EF")+'</span>' : "";
      if(el.dataset.v!==String(v)){ el.innerHTML=voulu; el.dataset.v=String(v); }
      el.classList.toggle("libre", !!aMoi && !v);
      el.classList.toggle("gagne", ligne.indexOf(i)>=0);
    }
    $("c4Plateau").classList.toggle("fini", !(m&&m.phase==="en_cours"));
    $("c4Plateau").classList.toggle("attend", !!(m&&m.phase==="attente"));
  }
  /* Le morpion n'a pas de colonne a remplir : la case cliquee EST le coup. */
  function c4Creux(){ return 0; }
'''

MP_COUP = '''
  function c4Joue(i){
    var m=C4.match;
    if(!m || m.phase!=="en_cours") return;
    if(c4MonJeton()!==m.tour) return toast("Not your turn");
    if((m.grille||[])[i]) return toast("That square is taken");
    send({type:"duelPlay", id:m.id, coup:i});
  }
  $("c4Grille").addEventListener("click", function(e){
    var c=e.target.closest(".mo-case"); if(!c) return;
    c4Joue(Number(c.dataset.i));
  });
  function c4Survol(){}
'''

# ================================================================ LES DAMES

DM_CSS = '''
/* --------------------------------------------------- le damier des dames */
.dm-grille{ display:grid; grid-template-columns:repeat(8,1fr); gap:0;
  aspect-ratio:1/1; width:100%; max-width:520px; margin:0 auto;
  border-radius:10px; overflow:hidden; border:2px solid rgba(230,165,55,.45); }
.dm-case{ position:relative; display:flex; align-items:center; justify-content:center; }
.dm-case.claire{ background:#3A2A18; }
.dm-case.sombre{ background:#12100C; cursor:pointer; }
.dm-case .pc{ width:74%; height:74%; border-radius:50%; position:relative;
  box-shadow:0 3px 0 rgba(0,0,0,.55), inset 0 2px 3px rgba(255,255,255,.28);
  animation:dmPose .16s ease-out; }
.dm-case .pc.j1{ background:radial-gradient(120% 120% at 32% 26%,#FFF0C8,#E9A73A 55%,#8A5A12); }
.dm-case .pc.j2{ background:radial-gradient(120% 120% at 32% 26%,#8FB6FF,#2E5FD0 55%,#12285E); }
.dm-case .pc.dame::after{ content:"★"; position:absolute; inset:0;
  display:flex; align-items:center; justify-content:center;
  font-size:min(3.4vw,20px); color:rgba(0,0,0,.55); }
/* Les cases jouables sont ALLUMEES par le serveur : le navigateur ne connait
   aucune regle, il eclaire ce qu'on lui donne. C'est ce qui rend impossible
   de jouer un coup illegal depuis un client modifie. */
.dm-case.depart{ box-shadow:inset 0 0 0 3px rgba(255,197,61,.85); }
.dm-case.choisi{ box-shadow:inset 0 0 0 3px #FFC53D; background:#2A2210; }
.dm-case.cible::before{ content:""; width:34%; height:34%; border-radius:50%;
  background:rgba(22,217,127,.55); box-shadow:0 0 14px rgba(22,217,127,.7); }
.dm-case.prise::before{ background:rgba(242,104,94,.75); box-shadow:0 0 14px rgba(242,104,94,.8); }
.dm-case.gagne{ box-shadow:inset 0 0 0 3px #16D97F; }
@keyframes dmPose{ from{ transform:scale(.5); } to{ transform:scale(1); } }
/* Le jeton du bandeau prend la couleur des pieces, pas celle du Connect 4. */
.c4-joueur.j1 .pion{ background:radial-gradient(70% 70% at 35% 28%,#FFF0C8,#E9A73A 55%,#8A5A12); }
.c4-joueur.j2 .pion{ background:radial-gradient(70% 70% at 35% 28%,#8FB6FF,#2E5FD0 55%,#12285E); }
'''

DM_DOM = '''      <div class="c4-plateau" id="c4Plateau">
        <div class="dm-grille" id="c4Grille"></div>
      </div>'''

DM_JS = '''
  function c4Construit(){
    var g=$("c4Grille"), h="", i, l, c;
    for(i=0;i<64;i++){
      l=Math.floor(i/8); c=i%8;
      h+='<div class="dm-case '+(((l+c)%2)?"sombre":"claire")+'" data-i="'+i+'"></div>';
    }
    g.innerHTML=h;
    C4.pris=null;
  }

  function c4PeintPlateau(){
    var m=C4.match, gr=(m&&m.grille)||[], cases=$("c4Grille").children, i, el, v;
    var ligne=(m&&m.ligne)||[], legaux=(m&&m.legaux)||[];
    var aMoi = m && m.phase==="en_cours" && c4MonJeton()===m.tour;
    /* La piece choisie ne survit pas a un coup de l'adversaire ni a une fin
       de partie : sinon on garde une case allumee qui ne veut plus rien dire. */
    if(!aMoi) C4.pris=null;
    if(C4.pris!==null && !legaux.some(function(x){ return x.de===C4.pris; })) C4.pris=null;
    /* Un enchainement force : la piece qui doit continuer est deja choisie,
       le joueur n'a pas a la redesigner. */
    if(aMoi && m.enchaine!=null) C4.pris=m.enchaine;

    var departs={}, cibles={};
    legaux.forEach(function(x){
      departs[x.de]=1;
      if(C4.pris===x.de) cibles[x.vers]=x.prise!=null?2:1;
    });
    for(i=0;i<cases.length;i++){
      el=cases[i]; v=gr[i]||0;
      var cl = v ? "pc "+((v===1||v===3)?"j1":"j2")+((v>2)?" dame":"") : "";
      if(el.dataset.v!==String(v)){
        el.innerHTML = v ? '<div class="'+cl+'"></div>' : "";
        el.dataset.v=String(v);
      }
      el.classList.toggle("depart", !!(aMoi && departs[i] && C4.pris===null));
      el.classList.toggle("choisi", aMoi && C4.pris===i);
      el.classList.toggle("cible", !!(aMoi && cibles[i]));
      el.classList.toggle("prise", cibles[i]===2);
      el.classList.toggle("gagne", ligne.indexOf(i)>=0);
    }
    $("c4Plateau").classList.toggle("fini", !(m&&m.phase==="en_cours"));
    $("c4Plateau").classList.toggle("attend", !!(m&&m.phase==="attente"));
  }
  function c4Creux(){ return 0; }
'''

DM_COUP = '''
  /* Deux clics : la piece, puis la case. Le premier clic ne fait qu'allumer —
     rien ne part au serveur tant que la destination n'est pas designee, donc
     on peut changer d'avis sans consequence. */
  function c4Joue(i){
    var m=C4.match;
    if(!m || m.phase!=="en_cours") return;
    if(c4MonJeton()!==m.tour) return toast("Not your turn");
    var legaux=m.legaux||[];
    if(C4.pris!==null){
      var coup=legaux.filter(function(x){ return x.de===C4.pris && x.vers===i; })[0];
      if(coup) return send({type:"duelPlay", id:m.id, coup:{de:coup.de, vers:coup.vers}});
      if(m.enchaine!=null) return toast("You must finish the capture");
    }
    if(legaux.some(function(x){ return x.de===i; })){ C4.pris=i; return c4PeintPlateau(); }
    if((m.grille||[])[i]) {
      var prise = legaux.length && legaux[0].prise!=null;
      return toast(prise ? "A capture is available \\u2014 you must take it" : "That piece cannot move");
    }
    C4.pris=null; c4PeintPlateau();
  }
  $("c4Grille").addEventListener("click", function(e){
    var c=e.target.closest(".dm-case"); if(!c) return;
    c4Joue(Number(c.dataset.i));
  });
  function c4Survol(){}
'''

JEUX = {
    'mp': dict(css=MP_CSS, dom=MP_DOM, js=MP_JS, coup=MP_COUP,
               titre='TIC-TAC<span>-TOE</span>',
               onglet='SWOGE Tic-Tac-Toe &mdash; 1v1 for $SWOGE',
               marque='$SWOGE <span>TIC-TAC-TOE</span>',
               sous='Three in a row, real $SWOGE. Both players put up the same stake &mdash;\n'
                    '      <b>the winner takes the pot</b>, minus a <b id="c4Rake">5%</b> house fee.\n'
                    '      A draw gives both stakes straight back.',
               desc='SWOGE Tic-Tac-Toe — challenge another player head to head. '
                    'Both put up the same stake, the winner takes the pot, a draw refunds both.',
               s1='X', s2='O',
               raisons='    if(r==="aligne")  return gagne ? "Three in a row" : "They lined up three";\n'
                       '    if(r==="grille pleine") return "Board full \\u2014 a draw, both stakes returned";'),
    'dm': dict(css=DM_CSS, dom=DM_DOM, js=DM_JS, coup=DM_COUP,
               titre='CHECK<span>ERS</span>',
               onglet='SWOGE Checkers &mdash; 1v1 for $SWOGE',
               marque='$SWOGE <span>CHECKERS</span>',
               sous='Twelve pieces each, captures are mandatory. Both players put up the same '
                    'stake &mdash;\n      <b>the winner takes the pot</b>, minus a '
                    '<b id="c4Rake">5%</b> house fee.',
               desc='SWOGE Checkers — 8x8 draughts against another player. '
                    'Both put up the same stake, the winner takes the pot.',
               s1='gold', s2='blue',
               raisons='    if(r==="plus de pions") return gagne ? "You took their last piece" : "They took your last piece";\n'
                       '    if(r==="bloque")  return gagne ? "They had no move left" : "You had no move left";\n'
                       '    if(r==="partie nulle") return "A draw \\u2014 both stakes returned";'),
}

# ---- les messages : le meme protocole, sous d'autres noms ----
PROTOCOLE = [
    ('{type:"p4State"}', '{type:"duelState"}'),
    ('{type:"p4Lobby"}', '{type:"duelLobby", jeu:JEU}'),
    ('{type:"p4Invites"}', '{type:"duelInvites", jeu:JEU}'),
    ('type:"p4Create"', 'type:"duelCreate", jeu:JEU'),
    ('type:"p4Join"', 'type:"duelJoin"'),
    ('type:"p4Rematch"', 'type:"duelRematch"'),
    ('type:"p4Cancel"', 'type:"duelCancel"'),
    ('type:"p4Resign"', 'type:"duelResign"'),
    ('m.type==="p4Match"', 'm.type==="duelMatch"'),
    ('m.type==="p4Lobby"', 'm.type==="duelLobby"'),
    ('m.type==="p4Invites"', 'm.type==="duelInvites"'),
    ('m.type==="p4Expire"', 'm.type==="duelExpire"'),
]


def fabrique(jeu):
    o = JEUX[jeu]
    t = src

    # 1. le plateau : DOM
    a = t.index('      <div class="c4-plateau" id="c4Plateau">')
    b = t.index('</div>', t.index('<div class="c4-grille" id="c4Grille"></div>')) + len('</div>')
    b = t.index('\n', b)
    t = t[:a] + o['dom'] + t[b:]

    # 2. le plateau : CSS, ajoute a la fin de la feuille
    t = remplace(t, '\n</style>', o['css'] + '</style>', 'fin du style', 1)

    # 3. le plateau : peinture et construction.
    # L'ordre compte : on efface les anciennes AVANT de poser les nouvelles,
    # : on efface les anciennes AVANT de poser les nouvelles, sinon la
    # recherche par nom retrouve celles qu'on vient d'ecrire et laisse les
    # anciennes en place — avec leurs references a un DOM disparu.
    for nom in ('c4PeintPlateau', 'c4Creux'):
        t = t.replace(corps_fonction(t, nom), '', 1)
    t = remplace_fonction(t, 'c4Construit', o['js'])

    # 4. le coup : la fonction et ses ecouteurs, d'un seul tenant
    deb = t.index('  function c4Joue(')
    fin = t.index('  c4Render();', deb)
    t = t[:deb] + o['coup'].strip('\n') + '\n\n' + t[fin:]

    # 5. le protocole
    for vieux, neuf in PROTOCOLE:
        t = remplace(t, vieux, neuf, 'protocole')
    t = remplace(t, 'var C4={', 'var JEU="%s";\n  var C4={' % jeu, 'etat du jeu')

    # 6. les raisons de fin : « quatre alignes » n'a de sens qu'au Connect 4
    t = remplace(t, '''    if(r==="aligne")  return gagne ? "Four in a row" : "They lined up four";''',
                 o['raisons'], 'raisons de fin')

    # 7. les etiquettes
    t = remplace(t, '<title>SWOGE Connect 4 — 1v1 for $SWOGE</title>',
                 '<title>' + o['onglet'].replace('&mdash;', '—') + '</title>', 'titre')
    t = re.sub(r'content="SWOGE Connect 4 —[^"]*"', 'content="' + o['desc'] + '"', t)
    t = remplace(t, '$SWOGE <span>CONNECT 4</span>', o['marque'], 'marque')
    t = remplace(t, '<h1 class="c4-titre">CONNECT <span>4</span></h1>',
                 '<h1 class="c4-titre">' + o['titre'] + '</h1>', 'titre de page')
    a = t.index('<p class="c4-sous">')
    b = t.index('</p>', a)
    t = t[:a] + '<p class="c4-sous">' + o['sous'] + t[b:]
    t = remplace(t, 'id="c4S1">red<', 'id="c4S1">' + o['s1'] + '<', 'etiquette joueur 1')
    t = remplace(t, 'id="c4S2">blue<', 'id="c4S2">' + o['s2'] + '<', 'etiquette joueur 2')
    t = t.replace('? "winner" : "red"', '? "winner" : "%s"' % o['s1'])
    t = t.replace('? "winner" : "blue"', '? "winner" : "%s"' % o['s2'])

    reste = t.count('p4')
    if reste:
        print('  ATTENTION : il reste %d mention(s) de « p4 » dans %s' % (reste, jeu))
    open(SORTIE[jeu], 'w', encoding='utf-8', newline='\r\n').write(t)
    print('%s ecrit : %.0f Ko' % (SORTIE[jeu], os.path.getsize(SORTIE[jeu]) / 1024))


for j in ('mp', 'dm'):
    fabrique(j)
