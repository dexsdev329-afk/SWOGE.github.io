"""Le sac d'oeuf : un septieme sac, et son propre fichier.

---- POURQUOI PAS UNE SEPTIEME CASE DE LA PLANCHE ----

Les six autres vivent dans `sacs.webp`, six cases de 96 sur une rangee. Y
ajouter la septieme aurait demande de refaire la planche entiere a chaque
ajout — et celle-ci est deja en ligne, dans le cache de tous les joueurs.
Un sac de plus, c'est un FICHIER de plus et une ligne dans `SAC_A_PART` ;
la planche ne bouge pas.

---- ON DETOURE, ON NE RECADRE PAS ----

`detoure` part des BORDS et remplit vers l'interieur : le damier ou le fond
plat s'en va, et ce qui est enclos par le dessin reste. C'est la lecon de
l'enseigne de Crimson Reach, ou un fond blanc pris au piege entre un support
et des chaines etait reste en place — verifie sur fond sombre, invisible.

`boite` recadre ensuite au contenu REEL. Sans ce recadrage, le sac serait
dessine plus petit qu'il ne doit l'etre : la page cale sa taille sur celle du
fichier, et une marge transparente de vingt pour cent le reduit d'autant.
"""
import planches as P
from PIL import Image

SC = '/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/'
SOURCE = SC + 'sac_oeuf.png'
SORTIE = 'img/nexus/objets/sac_oeuf.webp'

def fond_lumineux(im, couleur=(199, 253, 190), tolerance=26):
    """La lueur peinte DANS le dessin devient une vraie lueur.

    Le generateur a peint le halo en aplat : une bande de vert pale opaque,
    large de vingt pixels, tout autour du sac. Pose sur l'herbe, ce n'est pas
    une lueur — c'est un autocollant, avec un bord net qui dit « image collee »
    au lieu de « objet qui brille ».

    Et il y en a DEUX : la page dessine deja son propre halo derriere le sac.
    Les superposer aurait donne un anneau dur par-dessus un halo doux.

    On garde donc la bande, mais on lui rend un DEGRADE : son alpha decroit
    avec la distance au dessin. La mesure se fait par propagation depuis le
    dessin lui-meme (un parcours en largeur), et non par un flou — un flou
    aurait aussi mange le contour noir, qui est justement ce qui tient le
    sprite a l'ecran.

    Les etincelles sont vertes elles aussi, mais SATUREES : elles sont donc du
    dessin, pas du fond. C'est l'ecart a la couleur du halo qui decide, pas la
    teinte.
    """
    from collections import deque
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    cr, cg, cb = couleur

    def est_halo(x, y):
        r, g, b, a = px[x, y]
        if a < 40:
            return False
        return abs(r - cr) + abs(g - cg) + abs(b - cb) <= tolerance

    """Le DESSIN : tout ce qui est opaque et n'est pas la bande. Il sert de
       source a la propagation — la distance qu'on mesure est « a quel point
       suis-je loin de quelque chose de reel »."""
    dist = [[-1] * w for _ in range(h)]
    file = deque()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a >= 40 and not est_halo(x, y):
                dist[y][x] = 0
                file.append((x, y))
    while file:
        x, y = file.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and dist[ny][nx] < 0 and est_halo(nx, ny):
                dist[ny][nx] = dist[y][x] + 1
                file.append((nx, ny))

    """La portee : la bande la plus epaisse du dessin. La mesurer plutot que
       de l'ecrire evite d'avoir a la retrouver le jour ou l'on regenere
       l'image avec un halo plus large."""
    portee = max((dist[y][x] for y in range(h) for x in range(w) if dist[y][x] > 0),
                 default=1)
    for y in range(h):
        for x in range(w):
            d = dist[y][x]
            if d <= 0:
                continue
            r, g, b, a = px[x, y]
            """Le carre de la decroissance : lineaire, la lueur garde un bord
               visible a mi-course. Au carre, elle s'eteint la ou l'oeil
               s'attend a ce qu'elle s'eteigne."""
            part = max(0.0, 1.0 - d / float(portee))
            px[x, y] = (r, g, b, int(round(a * part * part)))
    return im

# ---- UNE PLANCHE DE QUATRE ----
# Le sac scintille maintenant. Memes regles que les autres decors animes :
#  - coupe au PAS FIXE, jamais au contenu — une coupe au contenu deplacerait
#    le sac d'une case a l'autre, et il sauterait au rythme de ses etincelles ;
#  - recadrage sur l'UNION des quatre boites, et non sur celle de chacune, pour
#    la meme raison : les etincelles depassent du contour et ne sont pas au
#    meme endroit d'une image a l'autre.
#
# `boite` rend une BOITE, pas une image : c'est une mesure, et c'est a
# l'appelant de decider s'il recadre dessus. La lire comme une image donne un
# tuple qu'on essaie d'enregistrer, et le message d'erreur parle alors de
# `tuple.save` — trois lignes plus loin que la faute.
CADRES = 4

im = Image.open(SOURCE).convert('RGBA')
# Le fond arrive tantot en damier clair, tantot en aplat gris. On regarde
# lequel plutot que de le supposer : une planche detouree avec le mauvais
# outil ressort avec son rectangle de fond, et ca ne se voit qu'a l'ecran.
coin = im.convert('RGB').getpixel((2, 2))
if abs(coin[0] - coin[1]) + abs(coin[1] - coin[2]) < 12 and coin[0] < 200:
    im = P.detoure_uni(im, tolerance=30)
else:
    im = P.detoure(im, seuilClair=232, seuilGris=18)
    im = P.nettoie_isoles(im)

pas = im.width / float(CADRES)
lot = [im.crop((round(i * pas), 0, round((i + 1) * pas), im.height))
       for i in range(CADRES)]
lot = [fond_lumineux(c) for c in lot]
boites = [P.boite(c, seuil=12) for c in lot]
x0 = min(b[0] for b in boites); y0 = min(b[1] for b in boites)
x1 = max(b[2] for b in boites); y1 = max(b[3] for b in boites)
lot = [c.crop((x0, y0, x1, y1)) for c in lot]

# ---- ET A LA TAILLE DES AUTRES ----
# Les six sacs de la planche font 96 pixels de cote. Le generateur en rend 640,
# et sans reduction le fichier pesait 238 ko contre 54 pour les SIX autres
# reunis — pour un sac dessine a cinquante unites de monde, ou l'oeil ne fait
# aucune difference (verifie a 96, 128, 192 et 256 : les quatre rendus sont
# indiscernables au format du jeu).
# LANCZOS et non NEAREST : la source n'est pas une vraie grille de pixels — ses
# plages de couleur identique font UN pixel de long, pas dix. Un NEAREST y
# choisirait un pixel sur sept au hasard et hacherait les contours.
LARGE = 96
lot = [c.resize((LARGE, int(round(LARGE * c.height / float(c.width)))), Image.LANCZOS)
       for c in lot]
L, H = lot[0].size
planche = Image.new('RGBA', (L * CADRES, H), (0, 0, 0, 0))
for i, c in enumerate(lot):
    planche.paste(c, (i * L, 0), c)
P.ecrit(planche, SORTIE)
print('%-34s %s  %d images de %dx%d  (rapport %.2f)'
      % (SORTIE.split('/')[-1], planche.size, CADRES, L, H, L / float(H)))
