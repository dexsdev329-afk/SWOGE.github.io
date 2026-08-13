#!/usr/bin/env python3
"""
Fabrique connect4.html a partir de plinko.html.

Meme raison qu'au Crash : la page du Plinko porte toute la plomberie commune —
connexion du portefeuille, session, depots, retraits, quetes, son, menu.
La reecrire serait la faire diverger.

Chaque decoupe se fait sur un REPERE, jamais sur un numero de ligne, et echoue
bruyamment si le repere a bouge.
"""
import re, sys, os

ICI = os.path.dirname(os.path.abspath(__file__))
SRC = '/home/user/SWOGE.github.io/plinko.html'
OUT = '/home/user/SWOGE.github.io/connect4.html'

lire = lambda p: open(p, encoding='utf-8').read()
src = lire(SRC).replace('\r\n', '\n')
lignes = src.split('\n')

CSS = lire(os.path.join(ICI, 'css.txt')).rstrip('\n')
DOM = lire(os.path.join(ICI, 'dom.txt')).rstrip('\n')
JS = lire(os.path.join(ICI, 'js.txt')).rstrip('\n')
HANDLERS = lire(os.path.join(ICI, 'handlers.txt')).rstrip('\n')


def borne(motif, depuis=0):
    for i in range(depuis, len(lignes)):
        if re.search(motif, lignes[i]):
            return i
    sys.exit('REPERE INTROUVABLE : ' + motif)


# Le fond dore des boutons de mise est repris TEL QUEL du Plinko : c'est un
# cadre vide, le montant est du texte HTML. Le reprendre garde les deux jeux
# dans le meme casino sans dupliquer une image de 8 Ko a la main.
m = re.search(r'^\.pl-groupe button\{.*?background-image:url\("(data:image/png;base64,[A-Za-z0-9+/=]+)"\)',
              src, re.S | re.M)
if not m:
    sys.exit('fond des boutons carres du Plinko introuvable')
FOND_BOUTON = m.group(1)

# ---------------------------------------------------------------- 1. le CSS
a = borne(r'^\.plwrap\{')
b = borne(r'^</style>$', a)
assert b - a > 80, 'bloc CSS du Plinko trop court, le repere a bouge'
css = CSS.replace('.c4-stakes button{ position:relative;',
                  '.c4-stakes button{ position:relative;\n  background-image:url("%s");' % FOND_BOUTON)
assert css != CSS, 'point d insertion du fond des boutons introuvable'
lignes[a:b] = css.split('\n')

# ---------------------------------------------------------------- 2. le DOM
a = borne(r'^\s*<div class="wrap plwrap">')
b = borne(r'^\s*<footer><a href="games\.html">', a)
while not lignes[b - 1].strip():
    b -= 1
assert b - a > 15, 'bloc DOM du Plinko trop court, le repere a bouge'
lignes[a:b] = DOM.split('\n')

# ------------------------------------------------------------------ 3. le JS
a = borne(r'^\s*var PLA=\{')
b = borne(r'^\s*function connect\(\)\{', a)
assert b - a > 100, 'bloc JS du Plinko trop court, le repere a bouge'
lignes[a:b] = JS.split('\n') + ['']

# ----------------------------------------------- 4. les messages du serveur
a = borne(r'else if\(m\.type==="plinko"\)\{')
prof, b = 0, 0
for i in range(a, len(lignes)):
    prof += lignes[i].count('{') - lignes[i].count('}')
    if prof == 0:
        b = i + 1
        break
assert b > a, 'fin du gestionnaire plinko introuvable'
lignes[a:b] = HANDLERS.split('\n')

# ------------------------------- 5. les ecouteurs du Plinko, poses a la main
# Le Connect 4 ecoute par delegation : ce bloc-la n'a plus d'objet.
a = borne(r'^\s*\$\("plRail"\)\.addEventListener')
b = borne(r'^\s*connectBtn\.addEventListener\("click",doConnect\);', a)
assert b - a > 20, 'bloc des ecouteurs du Plinko trop court, le repere a bouge'
del lignes[a:b]

texte = '\n'.join(lignes)

# ------------------------------------------- 6. ce que la charge auth dit encore
# Elle regle le Plinko ; ici elle doit demander l'etat du Connect 4. Les trois
# demandes partent ensemble : la partie en cours, les tables ouvertes, et les
# revanches qui attendent une reponse.
avant = texte
texte = re.sub(
    r'\s*if\(m\.plinkoRangees[^\n]*\n\s*if\(m\.plinkoRisque[^\n]*\n'
    r'\s*if\(m\.casinoMin\)[^\n]*\n\s*if\(m\.casinoMax\)[^\n]*\n',
    '\n        send({type:"p4State"}); send({type:"p4Lobby"}); send({type:"p4Invites"});\n',
    texte)
assert texte != avant, 'reglages plinko de la charge auth introuvables'

texte = texte.replace('plRender(); if(m.stake)', 'c4Render(); if(m.stake)')
assert 'plRender();' not in texte, 'il reste un appel plRender()'

avant = texte
texte = texte.replace(' if(m.plinkoBaremes) PL.baremes=m.plinkoBaremes;', '')
assert texte != avant, 'PL.baremes introuvable dans la charge auth'

# ------------------------------------------------------------ 7. les etiquettes
REMPLACE = [
    ('<title>SWOGE Plinko — play with $SWOGE</title>',
     '<title>SWOGE Connect 4 — 1v1 for $SWOGE</title>'),
    ('content="SWOGE Plinko — drop the ball, watch it fall, provably fair on Robinhood Chain."',
     'content="SWOGE Connect 4 — challenge another player head to head. Both put up the same stake, the winner takes the pot."'),
    ('$SWOGE <span>PLINKO</span>', '$SWOGE <span>CONNECT 4</span>'),
    ('/* ======================= SWOGE Plinko ======================= */',
     '/* ======================= SWOGE Connect 4 ======================= */'),
    ('/* pas de cartes au Plinko */', '/* pas de cartes au Connect 4 */'),
]
for vieux, neuf in REMPLACE:
    assert vieux in texte, 'etiquette introuvable : ' + vieux[:60]
    texte = texte.replace(vieux, neuf)

for mot in ['Plinko', 'plinko', 'PL.', 'PLA']:
    reste = texte.count(mot)
    if reste:
        print(f'  reste {reste} mention(s) de « {mot} » — a verifier a la main')

open(OUT, 'w', encoding='utf-8', newline='\r\n').write(texte)
print(f'connect4.html ecrit : {os.path.getsize(OUT)/1024:.0f} Ko, {texte.count(chr(10))+1} lignes')
