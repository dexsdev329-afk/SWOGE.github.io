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

6. Un EFFET pose sur un damier ne se detoure pas comme un objet. `detoure`
   rend un alpha binaire : bon pour un crabe, qui a un contour, faux pour une
   flamme, qui n'en a pas. Le halo se retrouve coupe net, et l'effet se lit
   comme un autocollant. Pour un effet il faut DECOMPOSER : le generateur a
   melange l'effet et le damier, on retrouve l'alpha en mesurant de combien
   chaque pixel s'ecarte du fond, et la couleur en retirant ce que le fond y
   a mis. C'est `detoure_effet`.
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


def nettoie_isoles(im, part=0.03, ecart=0.08):
    """Enleve les eclats DETACHES ET LOIN, tranches sur le voisin.

    `nettoie` ne regarde que ce qui touche un bord de la case. Ca suffit quand
    les halos se chevauchent, pas quand le detourage a d'abord efface le fond
    autour d'eux : l'eclat du voisin flotte alors au milieu du vide, sans
    toucher aucun bord, et il entre quand meme dans la boite englobante. Un
    sprite mesure alors toute la largeur de sa case et se retrouve mis a
    l'echelle deux fois trop petit.

    Ce qu'on enleve est a la fois MINUSCULE (`part` de l'aire dessinee) et LOIN
    du dessin principal (`ecart` de la diagonale). Les deux comptent : une
    etincelle qui accompagne une epee est minuscule mais collee a elle, et le
    pommeau detache d'une masse est loin mais gros.

    « Loin » se mesure au DESSIN, pas a sa boite. Une epee posee en diagonale a
    une boite qui remplit toute la case : tout est alors a distance zero de
    cette boite, y compris l'eclat a l'autre coin, et la regle ne trie plus
    rien. On propage donc depuis les pixels du dessin — c'est plus cher d'un
    parcours, et c'est la seule mesure qui veut dire ce qu'elle dit.
    """
    # ---- ON TRAVAILLE SUR UNE COPIE ----
    # `nettoie` le fait deja ; celle-ci ecrivait dans l'image recue. Deux
    # fonctions voisines aux effets differents sont un piege : une image
    # construite par `Image.fromarray` est en LECTURE SEULE, et l'appel
    # explosait au premier eclat a effacer — donc seulement sur les planches
    # qui en avaient un, ce qui est la pire facon de decouvrir un defaut.
    im = im.copy()
    w, h = im.size
    px = im.load()
    vu = bytearray(w * h)
    amas = []
    for y0 in range(h):
        for x0 in range(w):
            i0 = y0 * w + x0
            if vu[i0] or px[x0, y0][3] <= 16:
                continue
            q = deque([(x0, y0)]); vu[i0] = 1; pts = []
            while q:
                x, y = q.popleft(); pts.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                               (1, 1), (1, -1), (-1, 1), (-1, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not vu[ny * w + nx] \
                       and px[nx, ny][3] > 16:
                        vu[ny * w + nx] = 1; q.append((nx, ny))
            amas.append(pts)
    if len(amas) < 2:
        return im
    amas.sort(key=len, reverse=True)
    total = sum(len(a) for a in amas)
    candidats = [a for a in amas[1:] if len(a) <= total * part]
    if not candidats:
        return im
    # distance au DESSIN principal, en pas de grille
    INF = 1 << 30
    dist = [INF] * (w * h)
    q = deque()
    for x, y in amas[0]:
        dist[y * w + x] = 0
        q.append((x, y))
    limite = int(((w * w + h * h) ** 0.5) * ecart) + 1
    while q:
        x, y = q.popleft()
        d = dist[y * w + x]
        if d >= limite:
            continue
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and dist[ny * w + nx] > d + 1:
                dist[ny * w + nx] = d + 1
                q.append((nx, ny))
    for pts in candidats:
        if min(dist[y * w + x] for x, y in pts) <= limite:
            continue
        for x, y in pts:
            px[x, y] = (0, 0, 0, 0)
    return im


def lueur(source, seuil=8, gamma=1.0, gain=1.0):
    """Un dessin de LUMIERE sur fond noir : l'alpha vient de la luminosite.

    `detoure_sombre` propage depuis les bords, et c'est la bonne methode pour un
    objet solide. Elle ne marche pas pour un ANNEAU : le noir enferme au centre
    ne touche aucun bord, la propagation ne l'atteint jamais, et le cercle
    d'annonce se retrouve avec un disque noir opaque au milieu — pose sur le
    sol, il cache le sol.

    On ne peut pas non plus enlever « toutes les poches sombres » comme on
    enleve les poches claires d'un damier : une ombre portee est une poche
    sombre, et c'est du dessin.

    Pour une LUEUR, la question ne se pose pas : ce qui est noir est vide, ce
    qui brille est le dessin, et entre les deux il y a un degrade qu'on veut
    garder — c'est lui qui fait le halo. L'alpha EST la luminosite. Le seuil
    coupe le bruit de compression ; le gamma sert a durcir un halo trop mou.
    """
    im = source if isinstance(source, Image.Image) else Image.open(source)
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            v = max(r, g, b)
            if v <= seuil:
                px[x, y] = (0, 0, 0, 0)
                continue
            k = (v - seuil) / float(255 - seuil)
            if gamma != 1.0:
                k = k ** gamma
            """`gain` multiplie l'alpha SANS toucher a sa forme.

               Le gamma ne suffit pas pour un effet fait de MATIERE plutot que
               de lumiere — un mur de roche, par exemple. Ses blocs gris
               plafonnent a une luminosite moyenne : meme avec un gamma tres
               bas, ils ressortent a moitie transparents et le mur ressemble a
               de la fumee. Le gain les rend opaques tout en laissant le bord
               s'eteindre en degrade, ce qu'un seuil brutal ne fait pas.
               Le fond, lui, est a zero : le multiplier le laisse a zero."""
            px[x, y] = (r, g, b, min(255, int(round(k * 255 * gain))))
    return im


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


def _fondSombre(p, seuil):
    return max(p[0], p[1], p[2]) <= seuil


def detoure_uni(source, tolerance=26, adoucit=1):
    """Retire un fond d'UNE SEULE COULEUR, quelle qu'elle soit.

    `detoure` sait enlever un damier clair, `detoure_sombre` un aplat noir. Le
    generateur rend maintenant des aplats GRIS — ni l'un ni l'autre ne les
    voit, et le sprite sortait avec un rectangle de fond autour.

    La couleur est LUE aux quatre coins et non passee en argument : chaque
    image arrive avec sa nuance (93, 97, 104, 139 sur cinq planches), et
    l'ecrire aurait demande de la relever a la main a chaque fois — donc de se
    tromper une fois sur cinq.

    On propage depuis les BORDS, comme les deux autres. C'est le point qui
    compte : « tout ce qui ressemble au fond » mangerait la pierre grise des
    portails, qui est justement de la meme famille de gris. Ce qui est enclos
    par le dessin — le ciel entre deux colonnes, l'interieur d'une arche —
    reste, parce que la propagation ne l'atteint jamais.
    """
    im = source if isinstance(source, Image.Image) else Image.open(source)
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    coins = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    fr = sum(c[0] for c in coins) // 4
    fg = sum(c[1] for c in coins) // 4
    fb = sum(c[2] for c in coins) // 4

    def estFond(p):
        return (abs(p[0] - fr) + abs(p[1] - fg) + abs(p[2] - fb)) <= tolerance

    fond = bytearray(w * h)
    file = deque()

    def pousse(x, y):
        i = y * w + x
        if fond[i] or not estFond(px[x, y]):
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

    """Le lisere. La compression a bave sur une ou deux rangees : ces pixels ne
       sont plus assez purs pour la propagation, mais ils restent COLLES au
       fond et se voient comme un halo gris autour du sprite. On enleve autant
       de couronnes que demande — au-dela de deux passes, on mange le contour
       noir du dessin, qui est ce qui le tient a l'ecran."""
    for _ in range(adoucit):
        bord = []
        for y in range(h):
            for x in range(w):
                if fond[y * w + x]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and fond[ny * w + nx]:
                        if estFond(px[x, y]) or _proche(px[x, y], (fr, fg, fb), tolerance * 2):
                            bord.append((x, y))
                        break
        for x, y in bord:
            fond[y * w + x] = 1

    for y in range(h):
        for x in range(w):
            if fond[y * w + x]:
                px[x, y] = (0, 0, 0, 0)
    return im


def detoure_effet(source, fond=None, seuil=44, plancher=10, adoucit=0):
    """Un EFFET pose sur un fond clair ou sur un damier : on DECOMPOSE.

    ---- pourquoi pas `detoure` ----

    `detoure` propage depuis les bords et rend un alpha BINAIRE. C'est ce
    qu'il faut pour un objet, qui a un contour. Une flamme n'en a pas : elle
    s'eteint en degrade, et c'est ce degrade qui la fait tenir par-dessus le
    decor. Coupee net, elle se lit comme un autocollant colle sur le monde.

    ---- ce qu'on fait a la place ----

    Le generateur a MELANGE l'effet et son fond : chaque pixel vaut
    `a*C + (1-a)*F`, ou `F` est le fond. On connait `F` — c'est du blanc, ou
    les deux tons d'un damier, tous neutres et tres clairs. On en tire les
    deux inconnues :

      • l'ALPHA, par l'ecart au fond. Un pixel identique au fond est vide ; un
        pixel qui s'en ecarte de `seuil` ou plus est plein ; entre les deux,
        le degrade est conserve. On mesure l'ecart de DEUX facons et l'on
        garde la plus grande : ce qui ASSOMBRIT (la fumee, la braise noire) et
        ce qui COLORE (la flamme). Une seule des deux perdrait la moitie de
        l'effet — un panache gris sur fond blanc n'est pas colore, une flamme
        jaune n'est pas sombre.

      • la COULEUR, en retirant ce que le fond y a mis : `C = (P - (1-a)F)/a`.
        Sans cette etape, tout le degrade reste delave vers le blanc, et
        l'effet parait terne la ou il devrait etre le plus vif.

    `fond` peut etre impose (un triplet) ; par defaut on le lit sur les quatre
    bords, qui sont toujours du fond et jamais du dessin.

    ---- et le PLANCHER, qui n'est pas un detail ----

    Un damier a DEUX tons. Mesure sur la premiere planche : 254 et 247, soit
    sept niveaux d'ecart. Avec un seul `fond` — la mediane, 250 — la moitie
    des carreaux s'ecarte de trois et ressort a sept pour cent d'opacite : un
    voile laiteux sur toute l'image, qui ne se voit pas sur fond blanc et se
    voit tres bien pose sur l'herbe.

    Le plancher est la marge morte sous laquelle on ne croit pas l'ecart.
    Au-dessus du bruit du damier, largement sous le halo le plus tenu d'un
    effet — qui descend, lui, de plusieurs dizaines.
    """
    im = source if isinstance(source, Image.Image) else Image.open(source)
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()

    if fond is None:
        # La MEDIANE des bords, pas la moyenne : un coin ou l'effet deborde
        # tirerait une moyenne, il ne deplace pas une mediane.
        ech = []
        for x in range(0, w, 3):
            ech.append(px[x, 0][:3]); ech.append(px[x, h - 1][:3])
        for y in range(0, h, 3):
            ech.append(px[0, y][:3]); ech.append(px[w - 1, y][:3])
        ech.sort(key=lambda p: p[0] + p[1] + p[2])
        fond = ech[len(ech) // 2]
    fr, fg, fb = float(fond[0]), float(fond[1]), float(fond[2])

    out = Image.new('RGBA', (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            # Ce qui assombrit : de combien le pixel descend sous le fond.
            sombre = max(fr - r, fg - g, fb - b)
            # Ce qui colore : de combien ses canaux s'ecartent entre eux. Le
            # fond est neutre, donc tout ecart vient de l'effet.
            colore = max(r, g, b) - min(r, g, b)
            a = (max(sombre, colore) - plancher) / float(max(1, seuil - plancher))
            if a <= 0:
                op[x, y] = (0, 0, 0, 0); continue
            if a > 1.0:
                a = 1.0
            # On retire ce que le fond a mis. Sur un alpha faible la division
            # explose : on la borne, sinon un halo a peine visible ressort en
            # aplat sature.
            k = max(a, 0.08)
            cr = int(round(min(255.0, max(0.0, (r - (1 - a) * fr) / k))))
            cg = int(round(min(255.0, max(0.0, (g - (1 - a) * fg) / k))))
            cb = int(round(min(255.0, max(0.0, (b - (1 - a) * fb) / k))))
            op[x, y] = (cr, cg, cb, int(round(a * 255)))

    for _ in range(max(0, adoucit)):
        out = nettoie_isoles(out)
    return out


def _proche(p, c, t):
    return (abs(p[0] - c[0]) + abs(p[1] - c[1]) + abs(p[2] - c[2])) <= t


def detoure_sombre(source, seuil=26, adoucit=1):
    """Le meme travail, sur un fond NOIR.

    Le generateur rend tantot un damier clair, tantot un aplat noir, et la
    difference ne se voit qu'a l'oeil. Jeter « tout ce qui est sombre » mange
    les armures noires, les lames d'obsidienne et toutes les ombres portees —
    la moitie de ce qu'on decoupe ici. On propage donc depuis les BORDS,
    exactement comme pour le fond clair : le fond est connexe et touche le
    cadre, une ombre enfermee sous un bras ne l'est pas.

    On ne cherche PAS les poches enfermees, contrairement au fond clair : une
    poche noire au milieu d'un dessin est une ombre, et c'est le dessin.
    """
    im = source if isinstance(source, Image.Image) else Image.open(source)
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    fond = bytearray(w * h)
    file = deque()

    def pousse(x, y):
        i = y * w + x
        if fond[i] or not _fondSombre(px[x, y], seuil):
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

    """Le lisere : une couronne de pixels presque noirs, restes de la
    compression, collee au sprite. Une passe suffit — deux mangent le trait de
    contour, qui est justement noir sur ces dessins."""
    for _ in range(max(0, adoucit)):
        aEffacer = []
        for y in range(h):
            for x in range(w):
                if px[x, y][3] == 0:
                    continue
                if ((x > 0 and px[x - 1, y][3] == 0) or (x < w - 1 and px[x + 1, y][3] == 0)
                        or (y > 0 and px[x, y - 1][3] == 0) or (y < h - 1 and px[x, y + 1][3] == 0)):
                    if _fondSombre(px[x, y], seuil + 12):
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
