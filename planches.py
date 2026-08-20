# -*- coding: utf-8 -*-
"""DECOUPER LES PLANCHES — l'outil, garde dans le depot.

Il ne part pas au navigateur : il sert a transformer une image generee en
sprites que le jeu sait lire. Il vit ici parce qu'il a ete reecrit TROIS FOIS
apres autant de remises a zero de l'environnement, et que chaque reecriture a
recommis les memes erreurs. Ce qui suit est ce qu'elles ont coute :

1. `getbbox()` retient tout ce qui n'est pas EXACTEMENT transparent. Les halos
   generes descendent a alpha 1 : invisibles, mais ils etirent la boite
   jusqu'aux bords de la case. Un mur horizontal de 190x112 etait mesure
   190x208, donc mis a l'echelle sur sa hauteur, donc trop petit et ne
   joignant plus son voisin. Toute mesure passe par `boite`, avec un seuil.

2. Couper sur le vide ABSOLU fusionne des cases (deux epees de lave collees)
   ou en coupe une en deux (l'orbe de l'oracle separe de son corps). Et un
   seuil relatif ne marche pas non plus : selon la planche, la vallee entre
   deux objets vaut 1 % ou 12 % du pic. On sait en revanche COMBIEN de cases
   on cherche, et un generateur les pose regulierement : on cherche donc
   chaque coupe autour de sa position theorique et on prend le fond de la
   vallee, ou qu'il soit.

3. Quand deux halos se touchent, la coupe laisse un eclat du voisin colle au
   bord. Il ne se voit pas, mais il entre dans la boite : l'objet est alors
   mis a l'echelle comme s'il faisait toute la largeur. On enleve ce qui est a
   la fois minuscule ET colle a un bord — un tesson au milieu fait partie du
   dessin.

4. UNE SEULE echelle pour toute la planche, sinon la bague ressort aussi
   grosse que l'epee et la hierarchie visuelle meurt. Sauf pour les tuiles,
   qui doivent JOINDRE : entre quatre bouts de mur il n'y a pas de hierarchie
   a garder, il y a un raccord a tenir.

5. Un damier de transparence DESSINE dans l'image ne s'efface pas en jetant
   « tous les gris clairs » : ca mange les pinces palees du crabe et les
   plaques du robot. On propage depuis les BORDS — le fond est connexe et
   touche le cadre, une pince enfermee dans son contour ne l'est pas.
"""
from PIL import Image
from collections import deque


# ---------------------------------------------------------------- mesurer

def boite(im, seuil=16):
    """La boite englobante du contenu VISIBLE (voir 1 en tete de fichier)."""
    a = im.getchannel('A').point(lambda v: 255 if v > seuil else 0)
    return a.getbbox()


def occupation(im, axe):
    a = im.getchannel('A')
    w, h = im.size
    px = a.load()
    if axe == 'x':
        return [sum(1 for y in range(h) if px[x, y] > 16) for x in range(w)]
    return [sum(1 for x in range(w) if px[x, y] > 16) for y in range(h)]


# ---------------------------------------------------------------- couper

def _creux(occ, n, bord):
    """Les n-1 coupes qui separent n cases (voir 2 en tete de fichier)."""
    if n <= 1:
        return []
    L = len(occ)
    pas = L / float(n)
    coupes = []
    for k in range(1, n):
        ideal = pas * k
        a = max(bord, int(ideal - pas * 0.38))
        b = min(L - bord, int(ideal + pas * 0.38))
        if b <= a:
            coupes.append(int(ideal)); continue
        mini = min(occ[a:b])
        meilleur, debut, best = None, None, -1
        for i in range(a, b + 1):
            bas = i < b and occ[i] <= mini
            if bas and debut is None:
                debut = i
            if (not bas) and debut is not None:
                if i - debut > best:
                    best, meilleur = i - debut, (debut + i - 1) // 2
                debut = None
        if debut is not None and b - debut > best:
            meilleur = (debut + b - 1) // 2
        coupes.append(meilleur if meilleur is not None else int(ideal))
    return coupes


def bandes(im, n, axe, bord=2):
    occ = occupation(im, axe)
    bornes = [0] + _creux(occ, n, bord) + [len(occ)]
    return [(bornes[i], bornes[i + 1]) for i in range(n)]


def grille(source, cols, lignes=1):
    """Rend une liste de RANGEES, chacune une liste d'images recadrees."""
    im = source if isinstance(source, Image.Image) else Image.open(source)
    im = im.convert('RGBA')
    ry = bandes(im, lignes, 'y') if lignes > 1 else [(0, im.height)]
    out = []
    for (y0, y1) in ry:
        rang = im.crop((0, y0, im.width, y1))
        out.append([rang.crop((x0, 0, x1, rang.height)) for (x0, x1) in bandes(rang, cols, 'x')])
    return out


def reguliere(source, cols, lignes=1):
    """Une grille au PAS FIXE, sans chercher les creux.

    Pour une ANIMATION : ses images doivent garder leur position relative les
    unes aux autres. Recentrer chaque cadre sur son contenu ferait battre un
    anneau qui grandit, et sauter une flamme qui monte."""
    im = source if isinstance(source, Image.Image) else Image.open(source)
    im = im.convert('RGBA')
    w, h = im.width // cols, im.height // lignes
    return [[im.crop((c * w, l * h, (c + 1) * w, (l + 1) * h))
             for c in range(cols)] for l in range(lignes)]


# ---------------------------------------------------------------- nettoyer

def nettoie(im, part=0.04):
    """Enleve les eclats tranches sur le voisin (voir 3 en tete de fichier)."""
    w, h = im.size
    px = im.load()
    vu = [[False] * w for _ in range(h)]
    amas = []
    for y0 in range(h):
        for x0 in range(w):
            if vu[y0][x0] or px[x0, y0][3] <= 16:
                continue
            pile, pts, bord = [(x0, y0)], [], False
            vu[y0][x0] = True
            while pile:
                x, y = pile.pop()
                pts.append((x, y))
                if x == 0 or x == w - 1 or y == 0 or y == h - 1:
                    bord = True
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not vu[ny][nx] and px[nx, ny][3] > 16:
                        vu[ny][nx] = True
                        pile.append((nx, ny))
            amas.append((pts, bord))
    if not amas:
        return im
    gros = max(len(p) for p, _ in amas)
    out = im.copy()
    o = out.load()
    for pts, bord in amas:
        if bord and len(pts) < gros * part:
            for x, y in pts:
                o[x, y] = (0, 0, 0, 0)
    return out


def _fondClair(p, seuilClair, seuilGris):
    r, g, b = p[0], p[1], p[2]
    return min(r, g, b) >= seuilClair and (max(r, g, b) - min(r, g, b)) <= seuilGris


def detoure(source, seuilClair=190, seuilGris=22, adoucit=2):
    """Retire un damier de transparence DESSINE (voir 5 en tete de fichier).

    `adoucit` enleve autant de couronnes de lisere JPEG autour du sprite : le
    damier a bave sur une ou deux rangees, ces pixels ne sont plus assez purs
    pour la propagation mais restent clairs, gris et COLLES au fond. Au-dela
    de deux passes on mange le contour du dessin."""
    im = source if isinstance(source, Image.Image) else Image.open(source)
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    fond = bytearray(w * h)
    file = deque()

    def pousse(x, y):
        i = y * w + x
        if fond[i] or not _fondClair(px[x, y], seuilClair, seuilGris):
            return
        fond[i] = 1
        file.append((x, y))

    for x in range(w):
        pousse(x, 0); pousse(x, h - 1)
    for y in range(h):
        pousse(0, y); pousse(w - 1, y)
    while file:
        x, y = file.popleft()
        if x > 0: pousse(x - 1, y)
        if x < w - 1: pousse(x + 1, y)
        if y > 0: pousse(x, y - 1)
        if y < h - 1: pousse(x, y + 1)
    for y in range(h):
        for x in range(w):
            if fond[y * w + x]:
                px[x, y] = (0, 0, 0, 0)

    """---- LES POCHES ENFERMEES ----
    Le damier pris au piege DANS le dessin — entre les maillons d'une chaine,
    sous un bras — ne touche aucun bord : la propagation ne l'atteint jamais,
    et il reste comme une tache blanche au milieu du sprite.

    On ne peut pas l'enlever en jetant « tout ce qui est clair » : le croissant
    de vent est blanc lui aussi. Ce qui distingue un damier d'un blanc, c'est
    qu'il ALTERNE — mesure faite, une poche de damier change de ton d'un pixel
    au suivant une fois sur quatre, un blanc lisse une fois sur vingt-cinq. */
    """
    amas, dedans = [], bytearray(w * h)
    for y0 in range(h):
        for x0 in range(w):
            i0 = y0 * w + x0
            if dedans[i0] or px[x0, y0][3] == 0 or not _fondClair(px[x0, y0], seuilClair, seuilGris):
                continue
            q = deque([(x0, y0)]); dedans[i0] = 1; pts = []
            while q:
                x, y = q.popleft(); pts.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not dedans[ny * w + nx] \
                       and px[nx, ny][3] > 0 and _fondClair(px[nx, ny], seuilClair, seuilGris):
                        dedans[ny * w + nx] = 1; q.append((nx, ny))
            amas.append(pts)
    for pts in amas:
        if len(pts) < 20:
            continue
        s = set(pts); n = m = 0
        for x, y in pts:
            if (x + 1, y) in s:
                m += 1
                if abs(px[x, y][0] - px[x + 1, y][0]) > 15:
                    n += 1
        if m and (n / float(m)) > 0.12:
            for x, y in pts:
                px[x, y] = (0, 0, 0, 0)

    for _ in range(max(0, adoucit)):
        aEffacer = []
        for y in range(h):
            for x in range(w):
                if px[x, y][3] == 0:
                    continue
                if ((x > 0 and px[x - 1, y][3] == 0) or (x < w - 1 and px[x + 1, y][3] == 0)
                        or (y > 0 and px[x, y - 1][3] == 0) or (y < h - 1 and px[x, y + 1][3] == 0)):
                    if _fondClair(px[x, y], seuilClair - 25, seuilGris + 14):
                        aEffacer.append((x, y))
        if not aEffacer:
            break
        for x, y in aEffacer:
            px[x, y] = (0, 0, 0, 0)
    return im


# ---------------------------------------------------------------- poser

def echelle_commune(cases, cible, marge):
    """UNE echelle pour toute la planche (voir 4 en tete de fichier)."""
    dispo = cible - 2 * marge
    e = None
    for c in cases:
        b = boite(c)
        if not b:
            continue
        k = min(dispo / float(b[2] - b[0]), dispo / float(b[3] - b[1]))
        e = k if e is None else min(e, k)
    return e or 1.0


def pose(cases, cible, marge=4, aligne='centre', filtre=Image.LANCZOS, e=None):
    """Recadre, met a l'echelle commune, et pose au centre d'une case carree.

    `aligne='bas'` garde les pieds plantes : dans un cycle de marche le corps
    doit monter et descendre, pas le sol."""
    if e is None:
        e = echelle_commune(cases, cible, marge)
    bbs = [boite(c) for c in cases]
    bas = max((b[3] for b in bbs if b), default=0)
    haut = min((b[1] for b in bbs if b), default=0)
    sortie = []
    for c, b in zip(cases, bbs):
        f = Image.new('RGBA', (cible, cible), (0, 0, 0, 0))
        if not b:
            sortie.append(f); continue
        c2 = c.crop((b[0], haut, b[2], bas)) if aligne == 'bas' else c.crop(b)
        w = max(1, int(round(c2.width * e)))
        h = max(1, int(round(c2.height * e)))
        c2 = c2.resize((w, h), filtre)
        f.paste(c2, ((cible - w) // 2, (cible - h) // 2), c2)
        sortie.append(f)
    return sortie


def bandeau(images, cible):
    b = Image.new('RGBA', (cible * len(images), cible), (0, 0, 0, 0))
    for i, im in enumerate(images):
        b.paste(im, (i * cible, 0), im)
    return b


def planche(lignes, cible):
    b = Image.new('RGBA', (cible * len(lignes[0]), cible * len(lignes)), (0, 0, 0, 0))
    for j, rang in enumerate(lignes):
        for i, im in enumerate(rang):
            b.paste(im, (i * cible, j * cible), im)
    return b


def ecrit(im, chemin):
    im.save(chemin, 'WEBP', lossless=True, quality=100)
    return chemin
