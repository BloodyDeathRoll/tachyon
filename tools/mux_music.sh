#!/usr/bin/env bash
# mux_music.sh <video.mp4> <music.mp3|wav> <out.mp4> [offset_s] — music under the whole film, 0.4 s fade-in,
# 1.5 s fade-out to the end, loudnorm -14 LUFS, AAC 128k 48 kHz, all metadata stripped (spec_check profile).
set -e
V=$1; M=$2; O=$3; OFF=${4:-0}
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$V")
FO=$(python3 -c "print(max(0,float('$D')-1.5))")
ffmpeg -v error -y -i "$V" -ss "$OFF" -t "$D" -i "$M" -map 0:v -map 1:a -c:v copy \
  -af "afade=t=in:st=0:d=0.4,afade=t=out:st=$FO:d=1.5,loudnorm=I=-14:TP=-1.5:LRA=9" \
  -map_metadata -1 -fflags +bitexact -flags:a +bitexact -c:a aac -b:a 128k -ar 48000 -ac 2 -shortest -movflags +faststart "$O"
