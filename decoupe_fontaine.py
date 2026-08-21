"""La fontaine qui coule — quatre images, et la pierre qui ne bouge pas.

La planche arrive en 639x213 : quatre images d'une meme fontaine, seule l'eau
devait changer. C'est ce qu'on avait demande — a un detail pres, qui se voit
beaucoup a l'ecran.

---- LA PIERRE DERIVE D'UNE IMAGE A L'AUTRE ----

Mesure : quinze a dix-neuf pour cent des pixels de la STATUE changent d'une
image a la suivante. La statue est en pierre, elle ne bouge pas — ce sont donc
des glissements d'un ou deux pixels, laisses par un modele qui a redessine la
fontaine quatre fois au lieu de n'en changer que l'eau.

Joue a quatre images par seconde, un glissement d'un pixel ne se lit pas comme
un detail : la fontaine entiere TREMBLE.

On recale donc chaque image sur la premiere, en cherchant le decalage qui rend
la STATUE la plus semblable — pas le bassin, ou l'eau change pour de vrai et
fausserait la mesure. Trois pixels de recherche dans chaque sens suffisent :
au-dela ce n'est plus une derive, c'est un autre dessin.

---- ET LA GRILLE EST FIXE ----

`bandes` coupe aux creux, ce qui donne ici des cases de 159, 160, 159 et 161 :
les fontaines ne sont pas exactement au meme endroit dans leur case, et une
coupe au contenu deplacerait donc l'image d'une case a l'autre — ce qu'on
essaie precisement de corriger. On coupe au PAS FIXE.
"""
import planches as P
from PIL import Image, ImageChops

SC = '/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/'
CADRES = 4
RECHERCHE = 3


def cases(im, n):
    """n cases de largeur egale, au pas fixe."""
    w, h = im.size
    pas = w / float(n)
    return [im.crop((round(i * pas), 0, round((i + 1) * pas), h)).resize((round(pas), h))
            for i in range(n)]


def ecart(a, b, zone):
    d = ImageChops.difference(a.convert('RGB').crop(zone), b.convert('RGB').crop(zone))
    px = d.load(); w, h = d.size
    return sum(sum(px[x, y]) for y in range(0, h, 2) for x in range(0, w, 2))


def recale(ref, c, zone):
    """Le decalage qui rend la ZONE la plus semblable a la reference."""
    best, bdx, bdy = None, 0, 0
    for dy in range(-RECHERCHE, RECHERCHE + 1):
        for dx in range(-RECHERCHE, RECHERCHE + 1):
            bouge = ImageChops.offset(c, dx, dy)
            e = ecart(ref, bouge, zone)
            if best is None or e < best:
                best, bdx, bdy = e, dx, dy
    return bdx, bdy


im = Image.open(SC + 'fo1.png').convert('RGBA')
lot = cases(im, CADRES)
L, H = lot[0].size

# La statue : le tiers haut, au centre. C'est la seule partie qui doit etre
# identique d'une image a l'autre — le bassin, lui, change pour de vrai.
STATUE = (int(L * 0.28), 0, int(L * 0.72), int(H * 0.36))

aligne = [lot[0]]
for i, c in enumerate(lot[1:], 1):
    dx, dy = recale(lot[0], c, STATUE)
    print('image %d recalee de (%+d, %+d)' % (i + 1, dx, dy))
    aligne.append(ImageChops.offset(c, dx, dy))

# ---- ET COMME LE DECALAGE NE SUFFIT PAS, ON FIGE LA PIERRE ----
#
# Le recalage rend zero : la derive n'est pas un GLISSEMENT, c'est un
# redessin. Les quatre images ont ete peintes separement — les lanternes se
# deplacent d'un pixel, les massifs de fleurs ne sont pas les memes, le rebord
# du bassin n'a pas la meme epaisseur. Aucun decalage ne corrige ca, et joue en
# boucle, la fontaine entiere GRESILLE.
#
# On a essaye de trouver l'eau par la difference — « l'eau, c'est ce qui
# change ». Mesure faite, ca ne marche pas ici : a tous les seuils, la statue
# change autant que l'eau, parce qu'elle a ete repeinte elle aussi.
#
# On decrit donc la nappe A LA MAIN, par une ellipse. Ce n'est pas un aveu de
# paresse : la nappe est le seul endroit ou l'animation dit quelque chose (les
# rides s'ecartent, l'ecume derive), et tout le reste — statue, lanternes,
# banderoles, fleurs — est de la pierre qui n'a aucune raison de bouger. En
# dehors de l'ellipse, les quatre images prennent donc la premiere.
#
# Le jet qui tombe reste fige lui aussi. C'est voulu : un filet d'eau continu
# se lit comme continu, et l'animer aurait demande de le suivre pixel par
# pixel a travers quatre dessins differents.
from PIL import ImageDraw, ImageFilter

masque = Image.new('L', (L, H), 0)
d = ImageDraw.Draw(masque)
# Centre et rayons de la nappe, en fraction de la case. Mesures sur le dessin.
cx, cy, rx, ry = 0.50, 0.585, 0.355, 0.135
d.ellipse([(cx - rx) * L, (cy - ry) * H, (cx + rx) * L, (cy + ry) * H], fill=255)
masque = masque.filter(ImageFilter.GaussianBlur(2.0))
part = sum(masque.point(lambda v: 1 if v > 127 else 0).convert('L').getdata()) / float(L * H)
print("la nappe couvre %.0f%% du dessin" % (100 * part))
aligne = [aligne[0]] + [Image.composite(c, aligne[0], masque) for c in aligne[1:]]
for i2, c in enumerate(aligne[1:], 1):
    print('  statue image %d : ecart %.0f (zero attendu)'
          % (i2 + 1, ecart(aligne[0], c, STATUE)))

planche = Image.new('RGBA', (L * CADRES, H), (0, 0, 0, 0))
for i, c in enumerate(aligne):
    planche.paste(c, (i * L, 0), c)
P.ecrit(planche, 'img/nexus/tiles/obj_fontaine.webp')
print('%-34s %s  %d images de %dx%d' % ('obj_fontaine.webp', planche.size, CADRES, L, H))
