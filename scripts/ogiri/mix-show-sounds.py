"""Build five recorded party stingers with ffmpeg; source URLs and filenames are in docs/ogiri-audio-sources.md."""
from pathlib import Path
import array, struct, subprocess, sys, wave
RATE=22050
ROOT=Path(__file__).resolve().parents[2]
SRC=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'.artifacts/ogiri/audio-sources'
VOICES=Path(sys.argv[2]) if len(sys.argv)>2 else SRC
OUT=ROOT/'.artifacts/ogiri/long-sfx-raw'; OUT.mkdir(parents=True,exist_ok=True)
PUB=ROOT/'public/audio/ogiri'
def load(path):
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ac','1','-ar',str(RATE),'-f','f32le','-'])
 a=array.array('f'); a.frombytes(raw); peak=max(abs(v) for v in a)
 return [v/peak for v in a]
def layer(dst,src,start,gain=1.,end=None,fade_in=.002,fade_out=.02,env=None):
 source=src if end is None else src[:round(end*RATE)]
 n=len(source); offset=round(start*RATE)
 for i,v in enumerate(source):
  at=offset+i
  if at>=len(dst): break
  t=i/RATE; factor=min(1.,t/max(fade_in,1e-6),(n-1-i)/RATE/max(fade_out,1e-6))
  if env:
   for j in range(1,len(env)):
    if t<=env[j][0]:
     p,q=env[j-1],env[j]; factor*=p[1]+(q[1]-p[1])*(t-p[0])/(q[0]-p[0]); break
   else: factor*=env[-1][1]
  dst[at]+=v*gain*max(0,factor)
def write(name,seconds,arr):
 peak=max(abs(v) for v in arr) or 1
 arr=[v*.85/peak*min(1.,i/RATE/.002,(len(arr)-1-i)/RATE/.045) for i,v in enumerate(arr)]
 wavpath=OUT/(name+'.wav')
 with wave.open(str(wavpath),'wb') as f:
  f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE)
  f.writeframes(struct.pack('<'+'h'*len(arr),*[round(max(-1,min(1,v))*32767) for v in arr]))
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(wavpath),'-ar',str(RATE),'-ac','1','-b:a','64k',str(PUB/(name+'.mp3'))],check=True)
 print(f'{name}: {seconds:.3f}s, {(PUB/(name+".mp3")).stat().st_size}B')
 return arr
pop=load(SRC/'unfa-cartoon-pop-clean.mp3')
roll=load(SRC/'snare-roll-2.mp3')
sticks=load(SRC/'sticks-drum-roll.mp3')
applause=load(SRC/'applause-short-burst.mp3')
claps=load(SRC/'well-done.ogg')
classic=load(SRC/'classic-fanfare.ogg')
tuba=load(SRC/'happy-tuba.ogg')
yay=load(VOICES/'short-yay.mp3')
crowd=load(VOICES/'crowd-yay.mp3')
# Answer arrival: actual mouth pop with soft natural reflections and an unpitched air tail.
raw=subprocess.check_output(['ffmpeg','-v','error','-f','lavfi','-i','anoisesrc=color=pink:seed=1729:sample_rate=22050:duration=0.45:amplitude=0.5','-af','highpass=f=1400,lowpass=f=5000','-f','f32le','-'])
air=array.array('f'); air.frombytes(raw)
a=[0.]*round(.62*RATE)
layer(a,pop,0,.85); layer(a,pop,.17,.12);layer(a,pop,.31,.035)
layer(a,air,.10,.42,fade_in=.035,fade_out=.22)
write('answer-pop',.62,a)
# Full performed phrase; retain its natural final cadence.
a=[0.]*round(3.0*RATE);layer(a,classic,0,.85,fade_out=.025);write('start-stinger',3.0,a)
# Count starts immediately; an actual snare pickup hands off to Yay at the one-second payoff.
a=[0.]*round(2.8*RATE)
layer(a,pop,0,.35,fade_in=.001,fade_out=.015)
layer(a,roll,0,.55,end=1.25,fade_out=.15,env=[(0,.45),(.85,1.),(1.25,.05)])
layer(a,yay,1.,.88,fade_in=.002,fade_out=.012)
layer(a,applause,1.12,.23,end=1.68,fade_in=.10,fade_out=.30)
write('points-cheer',2.8,a)
# Different recorded sticks and a complete comic tuba phrase for the leaderboard.
a=[0.]*round(3.7*RATE)
layer(a,sticks,0,.4,end=.85,fade_out=.15)
layer(a,tuba,.65,.85,fade_out=.035)
layer(a,claps,2.9,.10,end=.8,fade_in=.03,fade_out=.16)
write('ranking-stinger',3.7,a)
# Wider finale: complete brass cadence, a separate group Yay, and a real applause ending.
a=[0.]*round(4.8*RATE)
layer(a,classic,0,.45,fade_out=.03,env=[(0,1.),(.75,1.),(1.,.35),(2.7,.35),(2.926,.6)])
layer(a,crowd,.85,.88,fade_in=.002,fade_out=.012)
layer(a,applause,0,.20,fade_in=.15,fade_out=.35)
write('cheer',4.8,a)
(PUB/'boing.mp3').write_bytes((PUB/'answer-pop.mp3').read_bytes())
(PUB/'score-count.mp3').write_bytes((PUB/'points-cheer.mp3').read_bytes())
