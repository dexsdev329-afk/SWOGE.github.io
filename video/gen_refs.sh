#!/usr/bin/env bash
# Generer des IMAGES DE REFERENCE de personnages (nano-banana / kie.ai).
# Cle par environnement : export KIE_KEY=...
# Deux modes : text-to-image (nouveau perso) ou image-edit (decliner une ref).
# Apres generation : verifier l'image, la copier dans cref/, committer, pousser
# main, attendre que Pages la serve (code 200) avant de l'utiliser dans Veo.
set -u
: "${KIE_KEY:?export KIE_KEY=...}"
STYLE='Unified FLAT 3D CARTOON, matte toy finish, soft rounded shapes, saturated pastel palette with hot-pink and electric-blue neon accents, NOT photorealistic. Full body, centered, clean simple background. NO on-screen text, NO letters, NO numbers, NO logos.'

# gen <fichier.png> "<prompt>" "<ref_url|vide>" "<image_size ex 9:16|3:4>"
gen(){ local name="$1" prompt="$2" ref="$3" size="$4" inp
  if [ -n "$ref" ]; then inp=$(jq -n --arg p "$prompt" --arg u "$ref" --arg s "$size" '{model:"google/nano-banana", input:{prompt:$p, image_urls:[$u], output_format:"png", image_size:$s}}')
  else inp=$(jq -n --arg p "$prompt" --arg s "$size" '{model:"google/nano-banana", input:{prompt:$p, output_format:"png", image_size:$s}}'); fi
  local R=$(curl -sS -X POST https://api.kie.ai/api/v1/jobs/createTask -H "Authorization: Bearer $KIE_KEY" -H "Content-Type: application/json" -d "$inp")
  local TID=$(echo "$R" | jq -r '.data.taskId'); [ "$TID" = "null" ] && { echo "$name create fail: $R"; return 1; }
  local i
  for i in $(seq 1 40); do
    local Z=$(curl -sS "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=$TID" -H "Authorization: Bearer $KIE_KEY")
    local U=$(echo "$Z" | jq -r '.data.resultJson // empty' | jq -r '.resultUrls[0] // empty' 2>/dev/null)
    local st=$(echo "$Z" | jq -r '.data.state // .data.status // empty')
    if [ -n "$U" ] && [ "$U" != "null" ]; then curl -sS -o "$name" "$U"; echo "$name DONE ($(stat -c%s "$name")b)"; return 0; fi
    [ "$st" = "fail" ] || [ "$st" = "failed" ] && { echo "$name FAIL: $Z"; return 1; }
    sleep 8
  done; echo "$name timeout"; return 1; }

# --- EXEMPLES (adapter) ---
# Nouveau monstre (text-to-image) :
# gen cast_boss.png "$STYLE A colossal lava-rock idol mega-boss ... absolutely NOT a dog." "" "9:16"
# Decliner un perso existant (image-edit sur une ref deja hebergee) :
# gen cast_pet.png "$STYLE Redraw the referenced shiba as a tiny rainbow prism puppy ..." "https://swoleeswoge.dog/cref/cast_swoge.png" "3:4"
echo "Editer ce script : decommenter/adapter les appels gen ci-dessus."
