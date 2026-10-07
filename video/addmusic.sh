#!/usr/bin/env bash
# Musique de fond duckee sous l'audio existant (dialogues+sfx), sans saturation.
# Opere dans le repertoire courant. usage: addmusic.sh IN.mp4 MUSIC.mp3 OUT.mp4 [VOL]
set -u
IN="$1"; MUS="$2"; OUT="$3"; VOL="${4:-0.42}"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
FO=$(awk "BEGIN{print $DUR-0.6}")
ffmpeg -nostdin -y -loglevel error -i "$IN" -stream_loop -1 -i "$MUS" -filter_complex \
 "[1:a]atrim=0:${DUR},aresample=48000,afade=t=in:d=0.6,afade=t=out:st=${FO}:d=0.6,volume=${VOL}[mus];
  [0:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.9,asplit=2[a1][a2];
  [mus][a1]sidechaincompress=threshold=0.03:ratio=8:attack=5:release=320[musd];
  [a2][musd]amix=inputs=2:normalize=0[mix];
  [mix]alimiter=limit=0.89:attack=1:release=60[aout]" \
 -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 160k -ar 48000 -movflags +faststart "$OUT"
echo "exit=$?"
