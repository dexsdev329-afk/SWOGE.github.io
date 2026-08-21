"""Les deux portails de donjon : la trappe de la Fonderie, la gueule de la Cave.

Ils remplacent une planche unique qui servait aux deux — on ne pouvait pas
savoir, en voyant une porte s'ouvrir a l'autre bout de l'anneau, si elle menait
aux machines ou aux pirates.

---- QUATRE IMAGES, ET C'EST UNE OUVERTURE ----

Pas une boucle : une fente, un ovale etroit, un ovale large, la porte ouverte.
La page le sait deja (`PORTE_OUVERTURE`) et ne rejoue pas la sequence en rond —
sans quoi la porte se refermerait en fente toutes les demi-secondes.

---- ON COUPE AU PAS FIXE ----

`bandes` couperait aux creux, et les quatre images n'ont pas la meme largeur
utile : la premiere ne montre qu'une fente, la derniere deborde d'eclairs et
d'ecume. Une coupe au contenu les recadrerait chacune sur elle-meme, et la
porte se mettrait a sauter d'une image a l'autre — exactement ce qu'on a paye
sur la fontaine.
"""
import planches as P
from PIL import Image

SC = '/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/'
CADRES = 4

CIBLES = [
    (SC + 'pt1.png', 'img/nexus/tiles/obj_portail_forge.webp'),
    (SC + 'pt2.png', 'img/nexus/tiles/obj_portail_cave.webp'),
]

for source, sortie in CIBLES:
    im = Image.open(source).convert('RGBA')
    w, h = im.size
    pas = w / float(CADRES)
    L = int(round(pas))
    planche = Image.new('RGBA', (L * CADRES, h), (0, 0, 0, 0))
    for i in range(CADRES):
        c = im.crop((round(i * pas), 0, round((i + 1) * pas), h)).resize((L, h))
        planche.paste(c, (i * L, 0), c)
    P.ecrit(planche, sortie)
    print('%-36s %s  %d images de %dx%d  (rapport %.2f)'
          % (sortie.split('/')[-1], planche.size, CADRES, L, h, L / float(h)))
