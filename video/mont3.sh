#!/usr/bin/env bash
# Montage SWOGE : lip-sync (coupe dub V+A ensemble), bed, whoosh, grade neon chaud,
# fin flash blanc + boucle, ISPEED (accel.), 48k. Opere dans le repertoire courant.
# usage: mont3.sh PFX OUT i0 i1 ...   (lit ${PFX}dub<n>.mp4 dans le cwd)
set -u
PFX="$1"; OUT="$2"; shift 2; ORDER=("$@"); SPEED=${ISPEED:-1.0}
CROP="crop=w='ih*0.88*9/16':h='ih*0.88':x='(iw-ih*0.88*9/16)/2':y=0,scale=720:1280,setsar=1,fps=30,format=yuv420p"
GRADE="eq=saturation=1.13:contrast=1.04:brightness=0.01"
: > ${PFX}cc.txt; CUTS=(); ACC=0; i=0
for n in "${ORDER[@]}"; do
  DUB=${PFX}dub$n.mp4
  SIL=$(ffmpeg -nostdin -nostats -i "$DUB" -af silencedetect=n=-34dB:d=0.12 -f null - 2>&1)
  ONSET=$(echo "$SIL" | grep -m1 silence_end | sed -E 's/.*silence_end: ([0-9.]+).*/\1/'); ONSET=${ONSET:-0}
  TOT=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$DUB")
  LASTS=$(echo "$SIL" | grep silence_start | tail -1 | sed -E 's/.*silence_start: ([0-9.]+).*/\1/')
  END=$(awk -v t="$TOT" -v l="${LASTS:-$TOT}" 'BEGIN{ if (t-l>0.1 && t-l<7.9) print l; else print t }')
  if [ $i -eq 0 ]; then HMAX=0.0; else HMAX=1.3; fi
  HEAD=$(awk -v o="$ONSET" -v m="$HMAX" 'BEGIN{h=o-0.25; if(h<0)h=0; if(h>m)h=m; printf "%.2f",h}')
  LEN=$(awk -v e="$END" -v h="$HEAD" 'BEGIN{d=e+0.06-h; if(d<1.3)d=1.3; if(d>8)d=8; printf "%.2f",d}')
  echo "clip $n: onset=$ONSET end=$END head=$HEAD len=$LEN"
  ffmpeg -nostdin -y -loglevel error -ss "$HEAD" -i "$DUB" -t "$LEN" -vf "$CROP" -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 160k -ar 48000 ${PFX}s$i.mp4
  echo "file '$PWD/${PFX}s$i.mp4'" >> ${PFX}cc.txt
  ACC=$(awk "BEGIN{print $ACC + $LEN}"); [ $i -lt $(( ${#ORDER[@]} -1 )) ] && CUTS+=("$ACC"); i=$((i+1))
done
ffmpeg -nostdin -y -loglevel error -f concat -safe 0 -i ${PFX}cc.txt -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 160k -ar 48000 ${PFX}_j.mp4
TOT=$(ffprobe -v error -show_entries format=duration -of csv=p=0 ${PFX}_j.mp4)
ffmpeg -nostdin -y -loglevel error -f lavfi -t $TOT -i "sine=f=220:r=48000" -f lavfi -t $TOT -i "sine=f=277.18:r=48000" \
  -f lavfi -t $TOT -i "sine=f=329.63:r=48000" -f lavfi -t $TOT -i "sine=f=440:r=48000" \
  -filter_complex "[0][1][2][3]amix=inputs=4:normalize=0,tremolo=f=0.5:d=0.5,lowpass=f=1600,highpass=f=150,volume=0.18[b]" -map "[b]" bed.wav
ffmpeg -nostdin -y -loglevel error -f lavfi -i "anoisesrc=d=0.4:color=white:r=48000" -af "highpass=f=500,lowpass=f=9000,afade=t=in:d=0.25,afade=t=out:st=0.28:d=0.12,volume=0.85" wh.wav
amix_in=(); filt=""; inputs=(-i base_sfx.wav); idx=1
ffmpeg -nostdin -y -loglevel error -f lavfi -t "$TOT" -i "anullsrc=r=48000:cl=stereo" base_sfx.wav
for c in "${CUTS[@]}"; do ms=$(awk "BEGIN{printf \"%d\", ($c-0.28)*1000}"); [ $ms -lt 0 ] && ms=0
  inputs+=(-i wh.wav); filt+="[$idx]adelay=${ms}|${ms}[w$idx];"; amix_in+=("[w$idx]"); idx=$((idx+1)); done
nmix=$(( ${#CUTS[@]} + 1 )); filt+="[0]${amix_in[*]}amix=inputs=${nmix}:normalize=0[sfx]"; filt=${filt// /}
ffmpeg -nostdin -y -loglevel error "${inputs[@]}" -filter_complex "$filt" -map "[sfx]" -t "$TOT" sfx.wav
ffmpeg -nostdin -y -loglevel error -i ${PFX}_j.mp4 -i sfx.wav -i bed.wav -filter_complex \
  "[0:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[d1][d2];[2:a][d1]sidechaincompress=threshold=0.04:ratio=3:attack=10:release=300:makeup=1[bdk];[d2][1:a]amix=inputs=2:normalize=0[ds];[ds][bdk]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-2:LRA=9,aresample=48000,alimiter=limit=0.85:level=disabled[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 160k -ar 48000 ${PFX}_m.mp4
ffmpeg -nostdin -y -loglevel error -i ${PFX}_m.mp4 -filter_complex \
  "[0:v]$GRADE,drawbox=x=0:y=0:w=iw:h=ih:color=white@1:t=fill:enable='between(t,$TOT-0.067,$TOT)',setpts=PTS/$SPEED[v];[0:a]atempo=$SPEED[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 160k -ar 48000 -movflags +faststart "$OUT"
echo "exit=$?"; ls -la "$OUT"; ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT"; echo fini
