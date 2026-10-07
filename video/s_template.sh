#!/usr/bin/env bash
# GABARIT de production d'une vidéo SWOGE (5 plans, 9:16, musique + bruitage).
# Copier en s_<nom>.sh, remplir P0..P4, IMG (refs par plan), les voix, OUT.
# Cles par environnement : export KIE_KEY=... EL_KEY=...   (JAMAIS dans le depot)
# Lancer depuis un dossier de travail contenant mont3.sh, addmusic.sh et une
# musique (ex. island_music.mp3). Les clips/finals sont ecrits dans ce dossier.
set -u
: "${KIE_KEY:?export KIE_KEY=...}"; : "${EL_KEY:?export EL_KEY=...}"
B=https://swoleeswoge.dog/cref           # refs de personnages hebergees
PFX=xx                                    # prefixe unique de cette video
export ISPEED=1.12                        # vitesse (1.12 = dynamique)
OUT=SWOGE_XX_30s.mp4
MUSIC=island_music.mp3

# --- voix ElevenLabs (une par perso qui parle) ---
VSW=qNkzaJoHLLdpvgh5tISm                   # SWOGE host
# VLEO=bIHbv24MWmeRgasZH58o ; VDOGE=VR6AewLTigWG4xSOukaG ; ... (voir VIDEO_PLAYBOOK.md)

# --- refs par plan (URLs separees par espace ; plan muet/sans perso = laisser vide) ---
SW=$B/cast_swoge.png                       # ex. BOSS=$B/cast_boss.png ; PET=$B/cast_pet.png
IMG=("$SW" "$SW" "$SW" "$SW" "$SW")
# --- voix par plan (le perso qui parle dans chaque plan) ---
SPK=($VSW $VSW $VSW $VSW $VSW)

# style unifie + garde-fous (copier tel quel au debut de chaque prompt)
G='Unified FLAT 3D CARTOON, matte toy finish, soft rounded shapes, saturated pastel palette with hot-pink and electric-blue neon accents, NOT photorealistic. Every character is flat 3D cartoon, NEVER realistic. Vertical 9:16. Speaks FAST, starts within 0.3s, no dead air. Native audio. NO on-screen text, NO letters, NO numbers, NO logos, NO brands, NO third-party characters.'

P0="$G SETTING: ... . SWOGE, a buff cream shiba in black shorts, ... . Deep fast voice: \"... punchline-word.\""
P1="$G SETTING: ... . Deep fast voice: \"...\""
P2="$G SETTING: ... . Deep fast voice: \"...\""
P3="$G SETTING: ... . Deep fast voice: \"...\""
P4="$G SETTING: ... . Deep fast voice: \"...\""

# attendre que toutes les refs utilisees soient servies par Pages (code 200)
NEED="cast_swoge"                          # ajouter cast_boss cast_pet ... selon IMG
for w in $(seq 1 60); do ok=1; for r in $NEED; do c=$(curl -s -o /dev/null -w '%{http_code}' $B/$r.png); [ "$c" = "200" ] || ok=0; done; [ $ok -eq 1 ] && { echo "refs ok ($w)"; break; }; sleep 6; done

genclip(){ local n="$1"; [ -f ${PFX}$n.mp4 ] && return 0
  local pv="P$n"; local p="${!pv}"; local im="${IMG[$n]}" body
  if [ -z "$im" ]; then body=$(jq -n --arg p "$p" '{prompt:$p,model:"veo3_fast",aspect_ratio:"9:16",generationType:"TEXT_2_VIDEO"}')
  else local urls=$(printf '%s\n' $im | jq -R . | jq -s .)
    body=$(jq -n --arg p "$p" --argjson u "$urls" '{prompt:$p,model:"veo3_fast",aspect_ratio:"9:16",generationType:"REFERENCE_2_VIDEO",imageUrls:$u}'); fi
  local R=$(curl -sS -X POST https://api.kie.ai/api/v1/veo/generate -H "Authorization: Bearer $KIE_KEY" -H "Content-Type: application/json" -d "$body")
  local TID=$(echo "$R" | jq -r '.data.taskId'); [ "$TID" = "null" ] && { echo "${PFX}$n create fail: $(echo "$R"|jq -c .)"; return 1; }
  local i; for i in $(seq 1 60); do
    local S=$(curl -sS "https://api.kie.ai/api/v1/veo/record-info?taskId=$TID" -H "Authorization: Bearer $KIE_KEY")
    local F=$(echo "$S" | jq -r '.data.successFlag')
    if [ "$F" = "1" ]; then curl -sS -o ${PFX}$n.mp4 "$(echo "$S" | jq -r '.data.response.resultUrls[0]')"; echo "${PFX}$n DONE"; return 0
    elif [ "$F" != "0" ]; then echo "${PFX}$n fail flag=$F : $(echo "$S" | jq -r '.data.errorMessage')"; return 1; fi
    sleep 15
  done; return 1; }

for attempt in 1 2 3 4 5 6 7 8; do
  echo "=== gen attempt $attempt ==="; for n in $(seq 0 4); do genclip "$n"; done
  miss=0; for n in $(seq 0 4); do [ -f ${PFX}$n.mp4 ] || miss=1; done; [ $miss -eq 0 ] && break; sleep 8
done
for n in $(seq 0 4); do [ -f ${PFX}$n.mp4 ] || { echo "MANQUE ${PFX}$n"; exit 1; }; done

echo "=== STS (re-voix par perso) ==="
for n in $(seq 0 4); do
  ffmpeg -nostdin -y -loglevel error -i ${PFX}$n.mp4 -vn -ar 44100 -ac 1 ${PFX}$n.wav
  curl -sS -X POST "https://api.elevenlabs.io/v1/speech-to-speech/${SPK[$n]}?output_format=mp3_44100_128" -H "xi-api-key: $EL_KEY" -F "model_id=eleven_multilingual_sts_v2" -F "remove_background_noise=true" -F "audio=@${PFX}$n.wav;type=audio/wav" -o ${PFX}${n}_sts.mp3
  ffmpeg -nostdin -y -loglevel error -i ${PFX}$n.mp4 -i ${PFX}${n}_sts.mp3 -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k ${PFX}dub$n.mp4
done

echo "=== montage + musique ==="
bash mont3.sh ${PFX} ${PFX}_nomusic.mp4 0 1 2 3 4
bash addmusic.sh ${PFX}_nomusic.mp4 "$MUSIC" "$OUT" 0.42
echo "DUR:"; ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT"
