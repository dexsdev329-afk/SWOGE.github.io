#!/usr/bin/env python3
"""
Range games.html en trois rubriques et y ajoute le Connect 4.

Jusqu'ici les dix jeux etaient dans une seule grille « Play now », ce qui ne
dit rien du seul choix qui interesse un joueur qui arrive : est-ce que je joue
CONTRE QUELQU'UN, ou contre la maison ? Les trois rubriques repondent a ca —
et la troisieme, les duels, n'existait pas.

Les cartes ne sont pas reecrites : elles sont DEPLACEES telles quelles. Chacune
porte une capture d'ecran de 100 Ko ; les recomposer a la main les ferait
diverger de ce qu'elles montrent.
"""
import re, sys, os, io, base64
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
MEDIA = '/home/user/SWOGE.github.io/media'

# Les images generees arrivent en PNG avec de la marge autour. On recadre sur
# l'alpha REEL (seuil 8, pas getbbox()) : les halos a alpha 1 comptent dans la
# boite et font rendre la plaque plus petite qu'elle ne devrait a l'ecran.
def plaque(source, nom):
    im = Image.open(os.path.join(ICI, 'img', source)).convert('RGBA')
    masque = im.split()[3].point(lambda v: 255 if v > 8 else 0)
    net = im.crop(masque.getbbox())
    os.makedirs(MEDIA, exist_ok=True)
    chemin = os.path.join(MEDIA, f'band-{nom}.webp')
    net.save(chemin, 'WEBP', quality=92, method=6)
    w, h = net.size
    print(f'  band-{nom}.webp : {w}x{h}, rapport {w/h:.3f}, {os.path.getsize(chemin)/1024:.0f} Ko')
    return round(w / h, 3)

def vignette(source):
    """Une vignette de carte : meme format que les neuf autres, 640x400 JPEG."""
    im = Image.open(os.path.join(ICI, 'img', source)).convert('RGB')
    if im.size != (640, 400):
        im = im.resize((640, 400), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=84, optimize=True, progressive=True)
    return base64.b64encode(b.getvalue()).decode()

def pose_vignette(carte, b64):
    """Remplace l'image d'une carte existante sans toucher a son texte."""
    neuve, n = re.subn(r'(<div class="thumb"><img class="tvid" alt="" src=")data:image/jpeg;base64,[A-Za-z0-9+/=]+',
                       lambda m: m.group(1) + 'data:image/jpeg;base64,' + b64, carte, count=1)
    if n != 1:
        sys.exit('vignette introuvable dans la carte')
    return neuve
CIBLE = '/home/user/SWOGE.github.io/games.html'

src = open(CIBLE, encoding='utf-8').read()
fin_ligne = '\r\n' if '\r\n' in src else '\n'
s = src.replace('\r\n', '\n')

# ------------------------------------------------- 1. on decoupe les cartes
DEBUT = '<div class="sec"><h2 class="plate">Play now</h2></div>'
i = s.find(DEBUT)
if i < 0:
    sys.exit('rubrique « Play now » introuvable')
j = s.find('<div class="sec"><h2 class="plate pl-util">Utility</h2></div>')
if j < 0:
    sys.exit('rubrique « Utility » introuvable')
bloc = s[i:j]

cartes = {}
for m in re.finditer(r'( *)<!-- LIVE: (.+?) -->\n(\s*<a class="card live".*?</a>)\n', bloc, re.S):
    cartes[m.group(2).strip()] = m.group(3)
attendu = ['SWOGE Spin (Volcano)', 'SWOGE Poker', 'SWOGE Blackjack', 'SWOGE Casino',
           'Hi-Lo', 'Mines', 'Crash', 'Plinko', 'Coin Pusher', 'SWOGE Smash']
manque = [n for n in attendu if n not in cartes]
if manque:
    sys.exit('cartes introuvables : ' + ', '.join(manque))
print(f'  {len(cartes)} cartes lues ; « SWOGE Casino » est remplacee par ses deux tables')

# ------------------------------------------------ 2. la carte du Connect 4
C4_VIGNETTE = open(os.path.join(ICI, 'vignette.b64')).read().strip()
C4 = '''<a class="card live" href="connect4.html">
        <div class="thumb"><img class="tvid" alt="" src="data:image/jpeg;base64,''' + C4_VIGNETTE + '''"></div>
        <div class="body">
          <h3>Connect 4</h3>
          <p>One against one, for real $SWOGE. Open a table from <b>10 to 10,000,000</b>, someone
             sits down opposite with the same stake, and <b>the winner takes the pot</b> &mdash;
             the house keeps 5%. Lose the thread for 45 seconds and the match is theirs.
             Beaten? Ask for a rematch, for whatever amount you like.</p>
          <div class="tags"><span class="tag">1v1 duel</span><span class="tag">Winner takes the pot</span><span class="tag">Rematch</span></div>
          <span class="play">&#9654; Play now</span>
        </div>
      </a>'''

# ------------------------- 2 bis. les deux tables, chacune sa carte
# « SWOGE Casino » en couvrait deux d'un coup, avec une seule vignette : un
# joueur qui cherche du Hold'em contre le croupier ne lisait pas qu'il en
# trouverait la. Deux cartes, deux tapis — ce sont les vraies captures, prises
# sur la page elle-meme.
def carte_casino(cle, titre, texte, tags, source):
    b64 = vignette(source)
    tg = ''.join(f'<span class="tag">{t}</span>' for t in tags)
    return (f'<a class="card live" href="swoge_casino.html?game={cle}">\n'
            f'        <div class="thumb"><img class="tvid" alt="" src="data:image/jpeg;base64,{b64}"></div>\n'
            f'        <div class="body">\n'
            f'          <h3>{titre}</h3>\n'
            f'          <p>{texte}</p>\n'
            f'          <div class="tags">{tg}</div>\n'
            f'          <span class="play">&#9654; Play now</span>\n'
            f'        </div>\n'
            f'      </a>')

HOLDEM = carte_casino('holdem', 'Casino Hold&rsquo;em',
    'Texas Hold&rsquo;em rules, but you play the <b>dealer</b>, not a table full of people. '
    'Post the ante, see your two cards and the flop, then <b>call or fold</b> &mdash; no raises to '
    'read, no waiting for anyone. The dealer needs a pair of fours to qualify, and the '
    '<b>AA bonus</b> pays on your first two cards whatever happens next.',
    ['Hold&rsquo;em vs the dealer', 'AA bonus', 'Provably fair'], '14-44-43.png')

THREE = carte_casino('three', 'Three Card',
    'Three cards each, highest hand takes it. A <b>straight beats a flush</b> here &mdash; with only '
    'three cards, straights are the rarer hand. Post the ante and play, or back the '
    '<b>pair plus</b> on your own three cards alone and get paid up to <b>40&times;</b> on a straight flush.',
    ['One decision', 'Pair plus up to 40&times;', 'Provably fair'], '14-43-17.png')

# ------------------------- 2 ter. les vignettes refaites
# Plinko, Hi-Lo et Mines gardent leur texte : seule l'image change.
for nom, src in [('Plinko', '14-40-23.png'), ('Hi-Lo', '14-41-15.png'), ('Mines', '14-42-07.png')]:
    cartes[nom] = pose_vignette(cartes[nom], vignette(src))

# --------------------------------------------------- 3. les trois rubriques
# L'ordre est celui de l'ecran, pas celui de la nouveaute : on ouvre sur ce
# qui se joue tout de suite et tout seul, puis les tables partagees, et les
# duels en bas — c'est la rubrique qui demande le plus a un joueur (trouver
# quelqu'un, engager sa mise contre lui), donc la derniere qu'on lui montre.
RUBRIQUES = [
    ('Against the house', 'b-house', 'play on your own, any time, no waiting', 'grid',
     [HOLDEM, THREE, cartes['SWOGE Blackjack'], cartes['SWOGE Spin (Volcano)'],
      cartes['Mines'], cartes['Hi-Lo'], cartes['Plinko'], cartes['SWOGE Smash']]),
    ('Against other players', 'b-players', 'shared tables and live rounds, no bots', 'grid trio',
     [cartes['SWOGE Poker'], cartes['Coin Pusher'], cartes['Crash']]),
    ('Head to head', 'b-head', '1v1 duels &mdash; the winner takes the loser&rsquo;s stake', 'grid duel', [C4]),
]

morceaux = [DEBUT]
for titre, plaque_cls, sous, classe, liste in RUBRIQUES:
    morceaux.append(
        f'\n    <div class="band {plaque_cls}"><h3>{titre}</h3><span>{sous}</span></div>\n'
        f'    <div class="{classe}">\n\n      ' + '\n\n      '.join(liste) + '\n\n    </div>\n')
neuf = '\n'.join(morceaux) + '\n'

s = s[:i] + neuf + s[j:]

# -------------------------------------------------------------- 4. le style
# Les trois bandeaux peints de la page (Play now, Utility, Documentation) sont
# des DESSINS ; il n'en existe pas pour ces titres-la. Les sous-rubriques sont
# donc en texte grave : net a toutes les tailles, et traduisible.
AR_HEAD = plaque('14-26-38.png', 'head')
AR_PLAY = plaque('14-37-22.png', 'players')
AR_HOUSE = plaque('14-39-26.png', 'house')

STYLE = '''
/* ---- sous-rubriques des jeux ----
   Les titres sont des PLAQUES PEINTES : le mot est dans le dessin, le <h3> ne
   sert plus qu'a le laisser lisible aux lecteurs d'ecran et aux moteurs. D'ou
   text-indent, et pas display:none.

   C'est la LARGEUR qui pilote, pas la hauteur. Les trois plaques n'ont pas le
   meme rapport — a hauteur egale, celle qui porte le texte le plus long est
   la plus large. En posant width = hauteur voulue x rapport, les trois rendent
   des lettres de la meme taille ; et comme la hauteur reste auto, max-width la
   laisse suivre toute seule sur un ecran etroit. */
.band{ display:flex; flex-direction:column; align-items:center; gap:7px;
  max-width:1180px; margin:34px auto 12px; padding:0 4px; }
.band h3{ display:block; max-width:96%;
  background-repeat:no-repeat; background-position:center; background-size:100% 100%;
  color:transparent; text-indent:-9999px; overflow:hidden; white-space:nowrap;
  font-size:0; line-height:0; }
.band.b-head h3{ width:calc(clamp(46px,5.4vw,74px) * AR_HEAD); aspect-ratio:AR_HEAD;
  background-image:url("media/band-head.webp"); }
.band.b-players h3{ width:calc(clamp(46px,5.4vw,74px) * AR_PLAY); aspect-ratio:AR_PLAY;
  background-image:url("media/band-players.webp"); }
.band.b-house h3{ width:calc(clamp(46px,5.4vw,74px) * AR_HOUSE); aspect-ratio:AR_HOUSE;
  background-image:url("media/band-house.webp"); }
.band span{ font-size:11.5px; color:var(--muted); letter-spacing:.3px; text-align:center; }

/* ---- les vignettes de cartes ----
   Il n'y avait de regle de taille QUE pour les vidos : les images etaient
   posees a leur taille naturelle, centrees, et la boite les rognait. Sur une
   carte de 238 px on ne voyait donc qu'un tiers d'une image de 640 — assez
   quand le sujet est au milieu, desastreux quand l'illustration porte un
   cadre. Les douze vignettes font 640x400, exactement le rapport de la boite :
   posees en cover elles tiennent entieres, sans rien perdre. */
.thumb img.tvid{ position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; z-index:0; }

/* ---- la rubrique des duels ----
   Elle n'a qu'un jeu pour l'instant. Une carte seule dans une grille a cinq
   colonnes se range dans un coin et se lit comme un oubli : celle-ci prend
   donc toute la largeur, vignette a gauche et texte a droite. */
.grid.duel{ grid-template-columns:1fr; max-width:920px; margin:0 auto; }
@media (min-width:820px){
  .grid.duel .card{ flex-direction:row; }
  .grid.duel .thumb{ flex:0 0 46%; aspect-ratio:auto;
    border-bottom:0; border-right:1px solid var(--line); }
  .grid.duel .thumb img{ width:100%; height:100%; object-fit:cover; }
  .grid.duel .body{ justify-content:center; padding:22px 26px; gap:10px; }
  .grid.duel .body h3{ font-size:24px; }
  .grid.duel .body p{ font-size:14px; flex:0 1 auto; }
  .grid.duel .play{ margin-left:0 !important; margin-right:0 !important; }
}

/* Trois jeux dans une grille qui en tient cinq laissaient deux colonnes vides
   a droite, et la rubrique avait l'air inachevee. On demande donc TROIS
   colonnes, pas une largeur : plus bas dans la page une regle impose
   repeat(5,1fr) au-dessus de 1000px, et borner la largeur ne faisait
   qu'y ecraser cinq colonnes au lieu d'en enlever deux. */
@media (min-width:1000px){
  .grid.trio{ grid-template-columns:repeat(3,1fr); max-width:1000px; margin:0 auto; }
}
'''
STYLE = (STYLE.replace('AR_HEAD', str(AR_HEAD))
              .replace('AR_PLAY', str(AR_PLAY))
              .replace('AR_HOUSE', str(AR_HOUSE)))
assert 'AR_' not in STYLE, 'un rapport de plaque n a pas ete remplace'

marque = '/* ---- Etiquettes des cartes'
k = s.find(marque)
if k < 0:
    sys.exit('bloc de style des etiquettes introuvable')
s = s[:k] + STYLE.strip('\n') + '\n\n' + s[k:]

# ------------------------------------------ 4 bis. Burn et Holder Scanner
# Les deux manquaient a la rubrique Utility alors que ce sont des pages a part
# entiere, liees depuis la barre de navigation de l'accueil. Leur vignette est
# la PLAQUE DE TITRE de la page — celle qui est deja dans la barre : c'est
# l'embleme le plus juste qu'on ait, et il dit exactement ou l'on va.
def carte_util(href, plaque, titre, texte, tags, bouton):
    tg = ''.join(f'<span class="tag">{t}</span>' for t in tags)
    return (f'<a class="card live util" href="{href}">\n'
            f'        <div class="thumb"><img alt="" src="media/{plaque}">'
            f'<span class="badge util">Utility</span></div>\n'
            f'        <div class="body">\n'
            f'          <h3>{titre}</h3>\n'
            f'          <p>{texte}</p>\n'
            f'          <div class="tags">{tg}</div>\n'
            f'          <span class="open">{bouton}</span>\n'
            f'        </div>\n'
            f'      </a>')

UTILS = '\n\n      '.join([
    carte_util('burn.html', 'nav-burn.webp', 'Burn',
               'Send $SWOGE to the burn address and take it out of the supply for good. '
               'The page shows what has already gone, what it is worth, and what the '
               'circulating supply looks like after it.',
               ['Deflation', 'On-chain', 'Live supply'], 'Open the burn page'),
    carte_util('holder_scan.html', 'nav-scanner.webp', 'Holder Scanner',
               'Paste any Robinhood-Chain contract and see who actually holds it: real '
               'wallets against pools and infrastructure, who arrived when, and who sold '
               'and left. Reads the chain directly &mdash; nothing is taken on trust.',
               ['Any token', 'Pools filtered out', 'Reads the chain'], 'Open the scanner'),
])

ancre_util = '          <span class="open">Open the launchpad</span>\n        </div>\n      </a>\n'
if ancre_util not in s:
    sys.exit('fin de la carte Launchpad introuvable')
s = s.replace(ancre_util, ancre_util + '\n      ' + UTILS + '\n', 1)

# -------------------------------------------------------------- 5. le menu
# games.html etait la seule page sans le menu commun. Elle n'a pas de
# portefeuille a elle — pas de socket, pas de session — donc ses entrees ne
# peuvent pas ouvrir les panneaux ici : elles pointent vers le Coin Pusher avec
# un fragment, et c'est lui qui ouvre le bon panneau une fois connecte. Un seul
# portefeuille, un seul endroit ou il vit.
MENU = """  <button class="menubtn" id="menuBtn" aria-label="Menu" aria-expanded="false">&#9776;</button>
  <div class="gmenu" id="gmenu">
    <a href="swoge_pusher_live.html#wallet">&#128091; My Wallet</a>
    <a href="swoge_pusher_live.html#dep">&#128176; Deposit</a>
    <a href="swoge_pusher_live.html#wd">&#127975; Withdraw</a>
    <a href="swoge_pusher_live.html#quests">&#127919; Daily Quests</a>
    <a href="swoge_staking.html">&#128274; Staking</a>
    <div class="msep"></div>
    <a href="index.html">&#127968; Home</a>
    <a href="https://dexscreener.com/robinhood/0x2dc0fb72d9284228046cc95910eeaabebfe48456" target="_blank" rel="noopener">&#128200; Chart</a>
  </div>
"""
ancre = ('  <a class="buy" href="https://dexscreener.com/robinhood/'
         '0x2dc0fb72d9284228046cc95910eeaabebfe48456" target="_blank" rel="noopener">Buy $SWOGE</a>\n')
if ancre not in s:
    sys.exit('bouton Buy $SWOGE introuvable dans la barre')
s = s.replace(ancre, ancre + MENU, 1)

STYLE_MENU = """
/* ---- le menu commun ----
   games.html n'a pas de portefeuille : ses entrees pointent vers le Coin
   Pusher avec un fragment, et c'est lui qui ouvre le panneau. Le menu est
   donc fait de VRAIS liens — il fonctionne meme si le script ne part pas. */
.menubtn{ flex:0 0 auto; width:40px; height:40px; padding:0; cursor:pointer;
  font-size:19px; line-height:1; color:var(--gold); border-radius:11px;
  background:linear-gradient(180deg,rgba(46,26,10,.9),rgba(20,10,4,.95));
  border:1px solid rgba(230,165,55,.42); }
.gmenu{ position:absolute; right:14px; top:60px; z-index:20; display:none;
  min-width:212px; padding:7px; border-radius:14px;
  background:linear-gradient(180deg,rgba(24,16,8,.98),rgba(12,8,4,.99));
  border:1px solid rgba(230,165,55,.4);
  box-shadow:0 18px 40px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,214,130,.16); }
.gmenu.open{ display:block; }
.gmenu a{ display:block; padding:10px 12px; border-radius:9px;
  font-size:13.5px; color:#F0E2C0; }
.gmenu a:hover{ background:rgba(255,197,61,.12); color:#fff; }
.gmenu .msep{ height:1px; margin:6px 4px; background:rgba(230,165,55,.28); }

/* ---- la barre passe a la ligne sur telephone ----
   Elle porte maintenant cinq choses : la marque, le solde, deux liens et le
   menu. A 390 px elle depassait de 127 px. Le SEPARATEUR prend toute la
   largeur, ce qui pousse tout le reste sur une seconde ligne — et il prend
   `1 1 100%` et non `1 0 100%` : le zero du milieu est le facteur de
   retrecissement, et a zero l'element refuse de se comprimer, ce qui fait
   deborder au lieu de replier. */
@media (max-width:640px){
  nav{ flex-wrap:wrap; row-gap:9px; gap:9px; padding:11px 13px; }
  nav .sp{ flex:1 1 100%; height:0; margin:0; }
  .gmenu{ top:auto; }
}
"""
s = s.replace('/* ---- sous-rubriques des jeux ----', STYLE_MENU.strip('\n') + '\n\n/* ---- sous-rubriques des jeux ----', 1)

# games.html n'avait pas de portefeuille : pas de socket, pas de solde. Le
# module partage sait desormais s'en passer — il presente le jeton de session
# deja range par les pages de jeu et fabrique lui-meme la pastille du solde.
# Le catalogue montre donc solde, rendement et profil, comme les autres.
BULLE = '<script src="stakebubble.js"></script>\n'
if 'stakebubble.js' not in s:
    i = s.find('<script')
    j = s.find('</head>')
    if i < 0 or (0 <= j < i): i = j
    if i < 0:
        sys.exit('ni script ni fin d en-tete dans games.html')
    s = s[:i] + BULLE + s[i:]

SCRIPT_MENU = """<script>
/* Ouverture/fermeture du menu. Dix lignes, sans dependance : la page reste
   utilisable si elles ne s'executent pas, puisque ce sont de vrais liens. */
(function(){
  var b=document.getElementById('menuBtn'), m=document.getElementById('gmenu');
  if(!b||!m) return;
  b.addEventListener('click', function(e){
    e.stopPropagation();
    var ouvert=m.classList.toggle('open');
    b.setAttribute('aria-expanded', ouvert?'true':'false');
  });
  document.addEventListener('click', function(e){
    if(!m.contains(e.target) && e.target!==b){ m.classList.remove('open'); b.setAttribute('aria-expanded','false'); }
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') m.classList.remove('open'); });
})();
</script>
</body>"""
if '</body>' not in s:
    sys.exit('fin de page introuvable')
s = s.replace('</body>', SCRIPT_MENU, 1)

open(CIBLE, 'w', encoding='utf-8', newline=fin_ligne).write(s)
print(f'  games.html reecrit : {os.path.getsize(CIBLE)/1024:.0f} Ko')
