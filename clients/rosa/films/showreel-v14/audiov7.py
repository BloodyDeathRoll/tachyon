import numpy as np, wave
exec(open('audio.py').read().split('# ---- sea bed')[0].replace('T=15.0','T=30.05'))

INTRO=.95;CARD=.7;CARDS=[3.22,7.54,9.9,15.45,20.58]
def NEW(o):
    n=o if o<9.45 else (9.45 if o<10.25 else o-.8)
    if o>=13.6:n+=1.4
    if o>=25.0:n-=.5
    elif o>=24.5:n-=(o-24.5)
    return n
def U(x):
    o=x+(1 if x>=23.0 else 0)+(.35 if x>=25.5 else 0)
    n=NEW(o);return n+INTRO+CARD*sum(1 for c in CARDS if c<=n)
SP=(INTRO+30.6+5*CARD)/30
_addraw=add
def addR(x,at,g=1.0,pan=0.0,rv=.25):_addraw(x,at/SP,g,pan,rv)
def add(x,at,g=1.0,pan=0.0,rv=.25):addR(x,U(at),g,pan,rv)
t=np.arange(N)/SR
sea=band(rng.standard_normal(N),120,3000)*(.45+.55*np.sin(2*np.pi*t/4.6-.6)**2)
sea2=band(rng.standard_normal(N),120,3000)*(.45+.55*np.sin(2*np.pi*t/5.3+.9)**2)
lvl=np.interp(t,[0,.3]+[U(x)/SP for x in [2.6,3.4,7.3,7.7,10.3,10.8,24.5,25.3,28.3]]+[30.0],[0,1.3,1.3,.25,.25,.7,.7,.25,.25,1.2,1.0,0])
dry[:,0]+=sea*lvl*.09;dry[:,1]+=sea2*lvl*.09
# opening: wave roar + question
add(pad([73.42,110,146.83,220],3.5,.9,.6,700),0,.55,0,.6)
add(impact(2.2,38),0.05,.35,0,.5)
add(bell(587.33,1.8),.6,.12,0,.9);add(bell(880,1.6),.66,.07,.3,.9)
add(riser(.8,150,1200),2.5,.26,0,.4);add(whoosh(.8,True),2.5,.5,0,.4)
add(impact(1.4),3.35,.85,0,.3)
for i in range(10):add(tick(2400+i*80,.025),3.45+i*.1,.08,.4,.3)
add(bell(1174.66,1.2),4.49,.2,.4,.9);add(pluck(1760,.6,7),4.5,.12,.4,.9)
# fast -> epic
add(swish(.5),5.4,.3,.4,.4);add(bub(700),5.42,.22,.4,.4)
for i in range(7):add(tick(2200+i*90,.03),5.75+i*.05,.09,.5,.5)
# free
add(whoosh(.5,True),7.0,.35,0,.5)
for i in range(9):add(tick(3000-i*120,.02),7.8+i*.08,.12,.4,.3)
add(impact(1.5,40),7.8,1.0,.2,.4)
for i,f in enumerate([587.33,739.99,880,1174.66]):add(bell(f,1.4),7.82+i*.05,.1,-.2+i*.25,.9)
for i in range(4):add(bub(500+i*120),8.55+i*.1,.2,.3+(i-1.5)/4,.3)
add(whoosh(.4,False),10.3,.35,0,.4)
# clear
add(tick(3200),10.75,.4,-.3,.4);add(bub(420),10.75,.3,-.3,.3);add(whoosh(.4,True),10.85,.35,-.2,.4)
add(riser(.8,150,900),11.15,.2,0,.4);add(whoosh(.85,None,200,6000),11.15,.4,0,.5)
for k_ in range(3):add(tick(3000,.04),11.62+k_*.2,.25,.6,.5);add(pluck(1174.66*(1+.122*k_),.45,9),11.62+k_*.2,.11,.6,.9)
for i in range(1,7):
    a=12.55+.8*(.5-.5*np.cos(np.pi*(i-.5)/6));add(tick(1700+i*130,.035),a,.3,-.5+i*.1,.4);add(pluck(293.66*2**(i/6),.3,12),a,.12,-.5+i*.1,.8)
add(whoosh(.55,False,200,6000),14.1,.4,0,.4);add(kick(.3,60,90,30),14.65,.45,-.3,.2)
# no ads: each junk item lands like a slap, then one swipe clears it
for i in range(5):
    a=15.15+i*.33
    add(kick(.3,70,160,26),a,.55,-.3,.2);add(band(noise(.12),300,3000)*np.exp(-tt(.12)*30),a,.35,-.3,.3)
    add(tone(196*(1.06**i),.18,.05,(1,.5,.3)) if False else pluck(196*(1.12**i),.25,14,.6),a,.18,-.3,.4)
    add(tick(1200+i*150,.05),a+.05,.2,.5,.4)
add(whoosh(.55,True,300,11000),16.75,.6,.4,.4);add(swish(.5),16.9,.45,.6,.4)
for i in range(5):add(tick(3200+i*200,.03),16.95+i*.06,.15,.5,.4)
add(impact(1.3,46),17.7,.75,.2,.4);add(bell(739.99,1.4),17.72,.13,.4,.9);add(bell(1108.73,1.2),17.78,.08,.4,.9)
add(whoosh(.5,False),19.7,.35,-.5,.4)
# gets better
add(riser(.7,120,700),19.6,.2,0,.5);add(whoosh(.8,None,150,5000),20.0,.45,-.1,.6);add(impact(1.1,50),20.55,.45,0,.4)
pent=[293.66,349.23,440,523.25,587.33,698.46,880,1046.5,1174.66,1396.9,1760]
rr=rng.random((90,3))
for i in range(90):a=20.6+2.7*(i/90);add(pluck(pent[int(rr[i,0]*len(pent))],.35,12,.2),a,.03+.045*rr[i,1],rr[i,2]*2-1,.9)
for i in range(3):add(tick(2000+i*250,.03),22.85+i*.15,.16,.6,.5);add(pluck([880,1046.5,1174.66][i],.4,9),22.85+i*.15,.1,.6,.9)
# closing: iris onto the barrel, logo
add(whoosh(.6,True),24.0,.4,0,.5);add(riser(.8,200,1400),23.8,.2,0,.5)
add(impact(2.2,36.71),24.55,.95,0,.5)
add(pad([73.42,146.83,220,293.66,369.99,440,587.33],5.4,.8,1.4,2400),24.55,.5,0,.8)
for i,f in enumerate([293.66,369.99,440,587.33,739.99,880,1174.66]):add(bell(f,2.6),25.55+i*.06,.13,-.6+i*.2,1.0)
add(bell(1760,2.0),26.25,.06,.2,1.0)
# groove 3.35 .. 24.5 at 110 bpm
beat=60/110;b=U(3.35);k=0
while b<U(24.45):
    addR(kick(.45),b,.62,0,.05)
    if k%2==1:addR(clap(),b,.18,0,.5)
    addR(hat(),b+beat/2,.15,.3,.2);addR(hat(.03),b+beat/4,.06,-.3,.2);addR(hat(.03),b+3*beat/4,.06,-.3,.2)
    b+=beat;k+=1
seq=[36.71,36.71,55,36.71,43.65,43.65,49,55];bar=beat*4
for i,a in enumerate(np.arange(U(3.35),U(24.45),beat/2)):
    sec=int((a-U(3.35))/(bar*2))%4;mul=[1,.891,1.189,1][sec]
    addR(bass(seq[i%8]*2*mul,.24),a,.4,0,.05)
arp=[293.66,440,523.25,659.25,587.33,440,349.23,440]
for i,a in enumerate(np.arange(U(3.35),U(24.45),beat/4)):
    g=.03+.03*((i%4)==0);g*=np.interp(a,[U(3.35),U(5),U(20),U(24.4)],[.4,1,1,1.5])
    sec=int((a-U(3.35))/(bar*2))%4;mul=[1,.891,1.189,1][sec]
    addR(pluck(arp[i%8]*mul*(2 if (i//16)%2 else 1),.33,14,.3),a,g,np.sin(i*.9)*.7,.7)
for s0 in np.arange(U(3.35),U(24.4),bar*2):
    sec=int((s0-U(3.35))/(bar*2))%4;mul=[1,.891,1.189,1][sec]
    addR(pad([f*mul for f in [146.83,174.61,220,261.63,329.63]],min(bar*2,U(24.6)-s0)+.4,.5,.6,1500),s0,.2,0,.6)

# intro logo
addR(bell(587.33,1.8),.12,.14,-.2,.9);addR(bell(880,1.6),.2,.09,.2,.9);addR(impact(1.6,36.71),.1,.55,0,.5);addR(whoosh(.35,True),.75,.25,0,.4)
# title cards: whoosh in, hit, a short chord, whoosh out to the tag
for k,c in enumerate(CARDS):
    u0=INTRO+c+CARD*k
    addR(whoosh(.3,True),u0-.22,.45,0,.4);addR(impact(1.0,40+k*2),u0+.02,.8,0,.4)
    for i,f in enumerate([293.66,440,587.33]):addR(pluck(f*(1.122**k),.7,6),u0+.03+i*.02,.12,(i-1)*.4,.9)
    addR(swish(.35),u0+.5,.3,.5,.4);addR(tick(3600,.03),u0+.78,.2,.5,.4)
# favorites: tap the star, it fills
FU=12.8+INTRO+CARD*3
addR(tick(3200,.04),FU+.3,.35,.3,.4);addR(bub(620),FU+.32,.3,.3,.3)
for i,f in enumerate([880,1108.73,1318.51,1760]):addR(bell(f,1.2),FU+.34+i*.04,.09,.2+i*.1,.9)
for k_ in range(1):addR(tick(3000,.04),FU+.45,.25,.6,.5);addR(pluck(1567.98,.45,9),FU+.45,.11,.6,.9)
addR(tick(2600,.05),U(28.6)-0.0,.0,0,.4)
# CTA lands
CU=27.1-.8+1.4-.5+INTRO+CARD*5
addR(bub(700),CU,.25,0,.3);addR(bell(1174.66,1.4),CU+.02,.12,0,.9);addR(bell(1760,1.2),CU+.5,.06,.2,.9)
# reverb + master
ir_n=int(1.8*SR);tir=np.arange(ir_n)/SR
out=np.zeros((N,2))
for c in range(2):
    ir=band(rng.standard_normal(ir_n),200,7000)*np.exp(-tir*3.0);ir[:int(.012*SR)]=0
    n=N+ir_n;Y=np.fft.irfft(np.fft.rfft(wet[:,c],n)*np.fft.rfft(ir,n),n)[:N]
    out[:,c]=dry[:,c]+Y*.035
out*=np.interp(t,[0,29.55,30.0],[1,1,0])[:,None]
out/=np.abs(out).max();out=np.tanh(out*2.2)/np.tanh(2.2)*.94
w=wave.open('audiov7.wav','wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((out*32767).astype('<i2').tobytes());w.close();print('ok')
