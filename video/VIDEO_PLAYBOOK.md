# SWOGE — playbook vidéo virale

> Comment on fabrique les vidéos SWOGE (SWOGE ISLAND, SWOGE WORLD, pubs casino/bet).
> Ce fichier existe pour **ne pas reperdre le procédé** : chaque règle ici a coûté
> des essais ratés et des crédits. Le lire avant de lancer une vidéo.
> Texte montré au public en **anglais** ; notes et commentaires en **français**.

---

## 0. Le pipeline en une phrase

**Veo 3 Fast** (kie.ai) génère des plans de 8 s → **ElevenLabs Speech-to-Speech**
re-voix chaque plan avec une voix de personnage fixe (garde le lip-sync) →
**ffmpeg** coupe au plus près de la parole, ajoute musique + bruitages + étalonnage,
et sort un vertical 9:16.

Trois scripts font tout : `gen_refs.sh` (images de référence), un script de
production par vidéo (`s_<nom>.sh`, calqué sur `s_template.sh`), et `mont3.sh`
+ `addmusic.sh` (montage). Les clés API ne sont **jamais** dans le dépôt :
`export KIE_KEY=...` et `export EL_KEY=...` avant de lancer.

---

## 1. Les règles d'écriture (ce qui rend viral)

- **Format** : vertical 9:16, 5 plans, ~27–30 s. Une seule réplique par plan.
- **Hook dans les 0,3 s** : l'action et la voix démarrent tout de suite, zéro
  silence au début. Le prompt dit « starts within 0.3s, no dead air ».
- **≤ 18 mots par réplique**, le **mot le plus fort ou le plus drôle en DERNIER**
  (la chute). C'est là que se joue la rétention.
- **UN seul personnage qui parle par plan.** Indispensable pour un lip-sync
  propre au Speech-to-Speech. Les autres persos sont muets / en fond.
- **Ton** : choisir et tenir. Comédie/autodérision (ISLAND) OU 100 % positif/hype
  (pubs produit). Ne pas mélanger. Pour une pub on reste positif : pas de « you
  will lose money », on vend le frisson et le « provably fair ».
- **Mécanique de vote A/B** pour une série (fait commenter) : dernier plan =
  SWOGE tient un orbe bleu « A » et un rouge « B », question à la caméra.
- **Chute + boucle** : la fin se rebranche visuellement sur le début (flash blanc
  + reprise) pour le replay.

---

## 2. Références de personnages (cref) — À FAIRE EN PREMIER

Pour une qualité et une cohérence constantes, chaque personnage/monstre a une
**image de référence verrouillée**, réutilisée dans tous les plans. Sans ça, Veo
réinvente le perso à chaque clip.

- Générées avec **nano-banana** (`google/nano-banana`) via kie.ai `jobs/createTask`.
  Voir `gen_refs.sh`. Text-to-image (pas d'`image_urls`) pour un nouveau perso ;
  image-edit (`image_urls:[ref]`) pour décliner un perso existant (ex. un bébé
  à partir de `cast_swoge`).
- **Hébergées** dans `cref/` du dépôt site, servies par Pages à
  `https://swoleeswoge.dog/cref/<nom>.png`. **Veo va chercher l'URL publique** :
  il faut committer + pousser sur `main` + attendre que Pages serve (le script
  attend le code 200 avant de générer).
- Cast déjà dispo (extrait) : `cast_swoge`, `cast_leo`, `cast_doge`, `cast_pepe`,
  `cast_shiba`, `cast_landwolf`, `cast_claude`, `cast_orange`, + candidates
  (`cast_dolly`, `cast_bibi`, `cast_luna`, `cast_lani`, `cast_olive`, `cast_kira`,
  `cast_mina`, `cast_roxy`, `cast_marina`, `cast_hattie`, `cast_scout`).
- Perso SWOGE World : `cast_boss` (méga-boss de lave), `cast_pet` (shiba Prism).
- À étendre pour une série jeu : autres boss (Dreadstump, Stormbound Warden),
  les 6 pets (Ember/Frost/Verdant/Umbra/Prism), mascottes (OG Swoge, Brett).

### Voix ElevenLabs (STS) — une par personnage
| perso | voice_id |
|---|---|
| SWOGE (host) | `qNkzaJoHLLdpvgh5tISm` |
| Leo | `bIHbv24MWmeRgasZH58o` |
| Doge | `VR6AewLTigWG4xSOukaG` |
| Pepe | `SAz9YHcvj6GT2YYXdXww` |
| Shiba | `ErXwobaYiN019PkySvjV` |
| Brenda (frigo) | `EXAVITQu4vr4xnSDxMaL` |
| Orange | `IKne3meq5aSn9XLyUdCD` |
| Landwolf | `onwK4e9ZLuTAKqWW03F9` |
| Claude (terminal) | `pNInz6obpgDQGcFmaJgB` |
| Dolly / Bibi / Lani / Luna / Olive / Kira / Mina … | voir `CAST_ROSTER` (scratchpad) |

---

## 3. Veo 3 Fast (kie.ai) — génération des plans

- Créer : `POST https://api.kie.ai/api/v1/veo/generate`
  body : `{prompt, model:"veo3_fast", aspect_ratio:"9:16",
  generationType:"REFERENCE_2_VIDEO", imageUrls:[...]}`.
  Sans référence : `generationType:"TEXT_2_VIDEO"` (pas d'`imageUrls`).
- Suivre : `GET /api/v1/veo/record-info?taskId=<id>` → `data.successFlag`
  (`1` = fini → `resultUrls[0]` ; `0` = en cours ; autre = échec).
- **Le filtre de sécurité bloque** : texte à l'écran, noms/lettres/chiffres,
  marques, personnages tiers (IP). D'où le bloc imposé dans CHAQUE prompt :
  « NO on-screen text, NO letters, NO numbers, NO logos, NO brands, NO
  third-party characters ». Un nom écrit (« Greg », « REWILTS ») ressort en
  carton illisible → le réécrire en « ABSOLUTELY NO words/letters anywhere ».
- **Style unifié** (copier tel quel au début du prompt) :
  « Unified FLAT 3D CARTOON, matte toy finish, soft rounded shapes, saturated
  pastel palette with hot-pink and electric-blue neon accents, NOT
  photorealistic. Every character is flat 3D cartoon, NEVER realistic. » — la
  dernière phrase évite le décrochage réaliste (bug vécu sur un shiba du plan
  pets).
- Pour fixer A ET B du vote : le seul texte autorisé = un « A » et un « B »
  blancs propres sur deux orbes, et on le dit explicitement : « the letters A
  and B are the ONLY writing in the shot ».

---

## 4. ElevenLabs Speech-to-Speech — re-voix

- `POST https://api.elevenlabs.io/v1/speech-to-speech/<voice_id>?output_format=mp3_44100_128`
  form : `model_id=eleven_multilingual_sts_v2`, `remove_background_noise=true`,
  `audio=@plan.wav`.
- On extrait l'audio du plan Veo (`ffmpeg -vn -ar 44100 -ac 1`), on le repasse
  dans la voix du perso, on recolle (`-map 0:v -map 1:a -c:v copy`). Le STS garde
  le **timing des lèvres** du clip d'origine → lip-sync conservé.

---

## 5. Montage — `mont3.sh` puis `addmusic.sh`

`mont3.sh PFX OUT i0 i1 …`
- **synccut** : pour chaque plan, `silencedetect` trouve le début de parole
  (onset) et la dernière fin de parole ; on coupe la VIDÉO ET L'AUDIO ENSEMBLE
  juste avant la parole (tête ≤ 1,3 s, 0 pour le plan 0) et juste après la
  dernière phrase (+0,06 s). C'est ça qui donne le rythme serré, zéro temps mort.
- **bed** : accord sinus doux + tremolo en fond (très bas).
- **whoosh** : un bruit court 0,28 s calé avant chaque coupe.
- **grade** néon chaud (`eq=saturation=1.13:contrast=1.04`).
- **fin** : flash blanc 2 frames + boucle.
- **ISPEED** (env, déf 1.0) : accélère légèrement l'ensemble. On utilise
  **1.12** pour un rendu dynamique sans voix de canard.

`addmusic.sh IN MUSIC OUT [VOL]`
- Musique en boucle, fade in/out, **duckée** sous la voix (`sidechaincompress`
  threshold 0.03 ratio 8), mix, puis **`alimiter=limit=0.89`** (PAS de
  `loudnorm` dans le mix final : un overshoot de loudnorm a déjà fait saturer
  une piste). VOL musique ≈ 0.42.
- Musique : `island_music.mp3` (thème Suno, instrumental). Pour en générer une
  autre : Suno via `POST /api/v1/generate` (endpoint dédié, avec `callBackUrl` +
  poll `/api/v1/generate/record-info`, `model:"V4_5"`, `instrumental:true`) —
  **pas** `jobs/createTask` (renvoie « model not supported »).

---

## 6. Les erreurs qui ont coûté cher (ne pas refaire)

1. **`ffmpeg` mange le stdin d'une boucle `while read`** → la boucle s'arrête
   au 1er tour. TOUJOURS `ffmpeg -nostdin` dans une boucle.
2. **Veo « Internal Error, flag=3 »** : transitoire. Boucle de retry 6–8 passages,
   les plans manquants se régénèrent.
3. **Texte/nom à l'écran** rendu en carton illisible → interdire tout texte dans
   le prompt (sauf A/B explicite).
4. **Saturation audio** : ne pas empiler `loudnorm` + limiter. Mix propre =
   sidechain + `alimiter` seul. Vérifier les pics (`astats`, viser ≤ −1 dB).
5. **Références non servies** : Veo ne lit QUE des URL publiques. Committer les
   refs dans `cref/`, pousser `main`, attendre le 200 (le script attend).
6. **Vidéos dans le scratchpad = éphémères.** Réencoder web (CRF 28 `+faststart`,
   ~moitié de poids) puis committer les finals dans `media/cinema/` pour les
   garder (page `swoge_cinema.html`).
7. **Décrochage de style réaliste** → ajouter « every character flat 3D cartoon,
   NEVER realistic » dans le prompt global.
8. **Marqueur de cache** : éditer un script versionné ou une page auto-versionnée
   oblige à recalculer le marqueur (`node cache_marqueur.test.js`). Une nouvelle
   page de vitrine qui ne référence que des scripts partagés inchangés n'a rien
   à recalculer.
9. **Les décors casino/sport font FUIR du texte** (scores, cotes, tickets,
   compteurs de jackpot, enseignes) → Veo le rend en charabia (« WI8NG »,
   « BEETING »). Deux parades combinées : (a) ne PAS décrire de prop à texte —
   pas d'« écran de score », pas de « ticket gagnant », pas de « compteur » ;
   remplacer par des props VIERGES (« blank golden ticket », « blank gold coin »,
   « meter of pure rising light bars », « plain-faced cards ») ; (b) un bloc
   NO-TEXT durci répété : « ABSOLUTELY NO text anywhere: no words, letters,
   numbers, scoreboards, odds, writing on any ticket/card/screen/coin/wall/neon ;
   screens and meters show only abstract colorful light ; every prop is blank ».

---

## 7. Recette express pour une nouvelle vidéo

1. Décider le sujet, le ton (comédie / positif), les 5 chutes.
2. S'il manque un perso/monstre : `gen_refs.sh`, vérifier l'image, committer dans
   `cref/`, pousser `main`, attendre le 200.
3. Copier `s_template.sh` → `s_<nom>.sh`. Remplir `P0..P4` (style + setting +
   réplique), la table `IMG` (refs par plan), `VSW`/voix, `OUT`.
4. `export KIE_KEY=... EL_KEY=...` puis `bash s_<nom>.sh` (en tâche de fond,
   plusieurs minutes).
5. Extraire 5 frames, faire une planche contact, vérifier 0 défaut (texte
   parasite, style, lip-sync, pics audio).
6. Livrer le MP4. Si ça vaut le coup, réencoder + ajouter au SWOGE AI Cinema.

---

## 8. Coûts / crédits (à surveiller)

- **kie.ai** : Veo 3 Fast + nano-banana consomment des crédits (solde lu sur
  `GET /api/v1/chat/credit`). Un reel 5 plans ≈ une poignée de crédits + les
  retries. Garder de la marge.
- **ElevenLabs** : STS facture au caractère audio ; 5 répliques courtes = peu.
- Ordre de grandeur : une vidéo complète reste bon marché face à sa valeur
  d'acquisition si elle marche. Le vrai coût, c'est le temps des essais — d'où
  ce playbook.

---

## 9. Où sont les choses

| chemin | quoi |
|---|---|
| `cref/cast_*.png` | références de personnages (servies par Pages) |
| `media/cinema/*.mp4` | épisodes finaux hébergés (réencodés web) |
| `img/site/cinema/*.webp` | affiches des épisodes |
| `swoge_cinema.html` | la vitrine publique (lecteur + vote + partage) |
| `video/mont3.sh` | montage (synccut, bed, whoosh, grade, flash) |
| `video/addmusic.sh` | mix musique duckée sans saturation |
| `video/s_template.sh` | gabarit de script de production (clés par env) |
| `video/gen_refs.sh` | générateur d'images de référence (nano-banana) |
| `video/VIDEO_PLAYBOOK.md` | ce fichier |
