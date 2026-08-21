"""Petworld : la grange, le sol de l'enclos, la cloture et les meubles.

Quatre dessins, quatre traitements — et c'est le detail qui compte : appliquer
le mauvais abime le sprite sans qu'on s'en apercoive.

  - LA GRANGE arrive SANS canal alpha : le damier de transparence est DESSINE
    dedans. Il faut `detoure`, qui propage depuis les bords.
  - LE SOL a son alpha, mais il ne faut surtout pas le recadrer : une texture
    qui se repete doit garder ses bords exacts, sinon la couture se voit a
    chaque tuile.
  - LA CLOTURE se coupe aux creux, puis chaque piece est recadree sur SA
    PERIODE — voir ci-dessous, c'est le coeur du fichier.
  - LES MEUBLES ne se raccordent a rien : une planche de cases carrees suffit,
    a UNE echelle commune pour que l'abreuvoir ne soit pas plus gros que la
    niche sur la meme pelouse.

---- POURQUOI ON RECADRE LA CLOTURE SUR SA PERIODE ----

Une piece posee au centre d'une case carree laisse une marge de chaque cote :
repetee, elle donne une barriere en POINTILLES. On recadre donc la piece
horizontale d'un CENTRE DE POTEAU a l'autre — deux moities de poteau se
rejoignent alors a chaque raccord et font un poteau entier, et les lisses
courent sans interruption.

Les poteaux se trouvent en mesurant l'epaisseur opaque colonne par colonne :
un poteau est plein sur toute sa hauteur, une lisse ne l'est pas. On ne tape
donc pas les coordonnees a la main — le jour ou le dessin change, elles se
retrouvent toutes seules.

La piece verticale se recadre a sa periode mesuree a l'oeil (170 sur 213) :
son profil est brouille par le feuillage qui deborde des deux cotes, et une
detection automatique y voit des poteaux qui n'existent pas. Les BOUTS d'une
barriere sont de toute facon des angles, pas des demi-poteaux : perdre le
dernier chapeau ne se voit pas.
"""
import planches as P
from PIL import Image

SC = '/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/'
CASE = 256
PERIODE_V = 170          # mesuree sur le dessin, voir l'en-tete


def centresDePoteaux(im):
    """Les deux poteaux d'une piece horizontale, par leur epaisseur opaque."""
    px = im.load(); w, h = im.size
    prof = [sum(1 for y in range(0, int(h * 0.75)) if px[x, y][3] > 60) for x in range(w)]
    seuil = max(prof) * 0.88
    gros = [i for i, v in enumerate(prof) if v >= seuil]
    a = [gros[0]]
    for i in gros[1:]:
        if i - a[-1] > 3: break
        a.append(i)
    b = [gros[-1]]
    for i in reversed(gros[:-1]):
        if b[-1] - i > 3: break
        b.append(i)
    return (a[0] + a[-1]) // 2, (b[0] + b[-1]) // 2


# ---- la grange : damier dessine, donc detourage ----
grange = P.detoure(SC + 'g1.png')
grange = grange.crop(P.boite(grange, 24))
P.ecrit(grange, 'img/nexus/tiles/obj_grange.webp')
print('%-30s %s  ratio %.3f' % ('obj_grange.webp', grange.size, grange.size[0] / grange.size[1]))

# ---- le sol : on ne touche a RIEN ----
sol = Image.open(SC + 'g2.png').convert('RGBA')
P.ecrit(sol, 'img/nexus/tiles/ground_ferme.webp')
print('%-30s %s  (repetable, non recadree)' % ('ground_ferme.webp', sol.size))

# ---- la cloture : quatre pieces, chacune a sa periode ----
cases = [P.nettoie(c) for c in P.grille(Image.open(SC + 'g3.png').convert('RGBA'), 4, 1)[0]]
pieces = [c.crop(P.boite(c, 24)) for c in cases]

g, d = centresDePoteaux(pieces[0])
h = pieces[0].crop((g, 0, d, pieces[0].height))
P.ecrit(h, 'img/nexus/tiles/obj_cloture_h.webp')
print('%-30s %s  poteaux a %d et %d' % ('obj_cloture_h.webp', h.size, g, d))

v = pieces[1].crop((0, 0, pieces[1].width, min(PERIODE_V, pieces[1].height)))
P.ecrit(v, 'img/nexus/tiles/obj_cloture_v.webp')
print('%-30s %s' % ('obj_cloture_v.webp', v.size))

for piece, nom in ((pieces[2], 'obj_cloture_coin'), (pieces[3], 'obj_cloture_porte')):
    P.ecrit(piece, 'img/nexus/tiles/%s.webp' % nom)
    print('%-30s %s' % (nom + '.webp', piece.size))

# ---- les meubles : une planche de cases carrees ----
meubles = [P.nettoie(c) for c in P.grille(Image.open(SC + 'g4.png').convert('RGBA'), 4, 1)[0]]
planche = P.bandeau(P.pose(meubles, CASE, marge=6, aligne='bas'), CASE)
P.ecrit(planche, 'img/nexus/tiles/ferme_decor.webp')
print('%-30s %s  4 cases (abreuvoir, foin, niche, mangeoire)' % ('ferme_decor.webp', planche.size))

# ---- l'enseigne, inchangee ----
ens = Image.open(SC + 'f1.png').convert('RGBA')
ens = ens.crop(P.boite(ens, 24))
P.ecrit(ens, 'img/nexus/tiles/obj_petworld_sign.webp')
print('%-30s %s' % ('obj_petworld_sign.webp', ens.size))
