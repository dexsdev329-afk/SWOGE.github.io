"""Les familiers de Petworld, ramenes au format du jeu.

Les planches arrivent en 1280x1280 : vingt-cinq cases de 256, une par image
d'une animation, un fichier par (animation, direction). C'est le format d'un
rendu isometrique — huit directions, vingt-cinq images — et notre jeu n'en
demande ni huit ni vingt-cinq.

---- CE QU'ON GARDE, ET POURQUOI ----

QUATRE DIRECTIONS. Le moteur dessine une creature avec quatre rangees, dans
l'ordre `up, down, left, right` (DIRS_M). Le nord-est et le sud-est n'ont
personne pour les demander : la page n'a que quatre directions a donner. La
GAUCHE n'existe pas dans la livraison — elle est le miroir de la droite, et
c'est ainsi que toutes les planches du jeu sont faites.

QUATRE IMAGES sur vingt-cinq. Le cycle de marche du jeu tourne a quatre
images ; en garder vingt-cinq demanderait une planche de six mille pixels de
large par direction, pour une difference qu'on ne voit pas a la taille ou une
creature est dessinee.

---- POURQUOI ON NE RECADRE PAS CASE PAR CASE ----

`pose` recadrerait chaque image sur SON contenu, et le familier se mettrait a
sauter d'une image a l'autre : dans un cycle de marche, le corps monte et
descend, et c'est justement ce mouvement qu'un recadrage par image supprime.
On garde donc les cases telles quelles, a leur place dans la grille.
"""
import planches as P
from PIL import Image
import os

SRC = '/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad'
CASE = 256
COLS = 5                      # la planche source est une grille 5x5
IMAGES = [0, 6, 12, 18]       # quatre images reparties sur le cycle de vingt-cinq
DIRS = ['up', 'down', 'left', 'right']

FAMILIERS = [
    ('pet', 'img/nexus/monstres/pet_shiba.webp'),
    ('pet_glace', 'img/nexus/monstres/pet_shiba_glace.webp'),
    ('pet_tenebre', 'img/nexus/monstres/pet_shiba_tenebre.webp'),
    ('pet_terre', 'img/nexus/monstres/pet_shiba_terre.webp'),
    ('pet_feu', 'img/nexus/monstres/pet_shiba_feu.webp'),
    ('pet_arc', 'img/nexus/monstres/pet_shiba_legendaire.webp'),
]


def case(im, i):
    """La i-eme image de la grille 5x5, sans recadrage."""
    c, l = i % COLS, i // COLS
    return im.crop((c * CASE, l * CASE, (c + 1) * CASE, (l + 1) * CASE))


for dossier, sortie in FAMILIERS:
    base = os.path.join(SRC, dossier)
    if not os.path.isdir(base):
        print('%-40s source absente, saute' % sortie)
        continue
    sources = {d: Image.open(os.path.join(base, 'run_%s.png' % d)).convert('RGBA')
               for d in ('up', 'down', 'right')}
    planche = Image.new('RGBA', (CASE * len(IMAGES), CASE * len(DIRS)), (0, 0, 0, 0))
    for r, d in enumerate(DIRS):
        src = sources['right' if d == 'left' else d]
        for c, i in enumerate(IMAGES):
            img = case(src, i)
            if d == 'left':
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            planche.paste(img, (c * CASE, r * CASE), img)
    P.ecrit(planche, sortie)
    print('%-40s %s  4 images x 4 directions' % (sortie.split('/')[-1], planche.size))
