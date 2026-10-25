import numpy as np, wave, sys
STYLE=sys.argv[1]
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

add(impact(1.4),3.35,.85,0,.3)
for i in range(10):add(tick(2400+i*80,.025),3.45+i*.1,.08,.4,.3)
add(pluck(1760,.6,7),4.5,.12,.4,.9)
# fast -> epic
add(bub(700),5.42,.22,.4,.4)
for i in range(7):add(tick(2200+i*90,.03),5.75+i*.05,.09,.5,.5)
# free
for i in range(9):add(tick(3000-i*120,.02),7.8+i*.08,.12,.4,.3)
add(impact(1.5,40),7.8,1.0,.2,.4)
for i in range(4):add(bub(500+i*120),8.55+i*.1,.2,.3+(i-1.5)/4,.3)
# clear
add(tick(3200),10.75,.4,-.3,.4);add(bub(420),10.75,.3,-.3,.3)
add(tick(3200,.04),11.48,.35,.3,.4);add(bub(620),11.5,.3,.3,.3)
for k_ in range(4):add(tick(3000,.04),11.62+k_*.2,.25,.6,.5);add(pluck(1174.66*(1+.122*k_),.45,9),11.62+k_*.2,.11,.6,.9)
for i in range(1,7):
    a=12.55+.8*(.5-.5*np.cos(np.pi*(i-.5)/6));add(tick(1700+i*130,.035),a,.3,-.5+i*.1,.4);add(pluck(293.66*2**(i/6),.3,12),a,.12,-.5+i*.1,.8)
add(kick(.3,60,90,30),14.65,.45,-.3,.2)
# no ads: each junk item lands like a slap, then one swipe clears it
for i in range(5):
    a=15.15+i*.33
    add(kick(.3,70,160,26),a,.55,-.3,.2);add(band(noise(.12),300,3000)*np.exp(-tt(.12)*30),a,.35,-.3,.3)
    add(tone(196*(1.06**i),.18,.05,(1,.5,.3)) if False else pluck(196*(1.12**i),.25,14,.6),a,.18,-.3,.4)
    add(tick(1200+i*150,.05),a+.05,.2,.5,.4)
for i in range(5):add(tick(3200+i*200,.03),16.95+i*.06,.15,.5,.4)
add(impact(1.3,46),17.7,.75,.2,.4)
# gets better
add(impact(1.1,50),20.55,.45,0,.4)
pent=[293.66,349.23,440,523.25,587.33,698.46,880,1046.5,1174.66,1396.9,1760]
rr=rng.random((90,3))
for i in range(90):a=20.6+2.7*(i/90);add(pluck(pent[int(rr[i,0]*len(pent))],.35,12,.2),a,.03+.045*rr[i,1],rr[i,2]*2-1,.9)
for i in range(3):add(tick(2000+i*250,.03),22.85+i*.15,.16,.6,.5);add(pluck([880,1046.5,1174.66][i],.4,9),22.85+i*.15,.1,.6,.9)
# closing: iris onto the barrel, logo
add(impact(2.2,36.71),25.3,.95,0,.5)
add(pad([73.42,146.83,220,293.66,369.99,440,587.33],5.4,.8,1.4,2400),25.3,.5,0,.8)

# music bed: from the first beat after the FAST card to the closing hit
m0=U(3.35)/SP;m1=U(25.3)/SP;n0=int(m0*SR);n1=int(m1*SR);NB=n1-n0
if STYLE=='blues':
    mw=wave.open('../../assets/music/old-steel-449645.wav');mx=np.frombuffer(mw.readframes(mw.getnframes()),'<i2').reshape(-1,2)/32768;assert mw.getframerate()==SR
    seg=mx[int(34.68*SR):int(34.68*SR)+NB].copy();bw=np.zeros((NB,2))
    MG=.52
else:
    # a new take on the v7 groove: 116 bpm, D minor, four-chord loop, pumping pads, a pluck hook with echo
    bpm=116.;bt=60/bpm;bar=4*bt;nb=int(np.ceil((m1-m0)/bt))+1
    seg=np.zeros((NB,2));sc=np.zeros((NB,2));hk=np.zeros((NB,2));bw=np.zeros((NB,2))
    def put(buf,x,at,g=1.,pan=0.):
        i=int(at*SR)
        if i<0 or i>=NB:return
        x=x[:NB-i];buf[i:i+len(x),0]+=x*g*np.sqrt(.5*(1-pan));buf[i:i+len(x),1]+=x*g*np.sqrt(.5*(1+pan))
    mf=lambda m:440*2**((m-69)/12)
    prog=[[62,65,69,72,76],[58,62,65,69,72],[53,57,60,64,69],[55,60,64,67,69]]
    roots=[38,34,41,36]
    COUT=[(INTRO+c+CARD*k)/SP-m0 for k,c in enumerate(CARDS)];CD=CARD/SP
    drop=lambda x:False
    kicks=[]
    for b in range(nb):
        at=b*bt;br=b//4;ch=br%4;bp=b%4
        if not drop(at):
            put(seg,kick(.36,46,125,30),at,.78);kicks.append(at)
            if bp in(1,3):put(seg,clap(),at,.2,.1)
        for s_ in range(4):
            hs=at+s_*bt/4+(bt/4*.14 if s_%2 else 0)
            if drop(hs):continue
            put(seg,hat(.07 if s_==2 else .035,6500 if s_==2 else 8500),hs,[.045,.022,.1,.028][s_]*(1 if br>=1 else .55),.3 if s_%2 else -.2)
        r0=mf(roots[ch])
        if bp==0:put(sc,bass(r0,.3),at,.5)
        put(sc,bass(r0*(2 if bp==2 else 1),.18),at+bt/2,.42)
        put(sc,bass(r0*2,.12),at+bt*.75,.2)
    for br in range((nb+3)//4):
        op_=min(1,(br+1)/3);ch=br%4
        put(sc,pad([mf(m) for m in prog[ch]],bar+.35,.04,.3,900+2800*op_),br*bar,.34,0)
        for st in(1.5,3.5):put(sc,pad([mf(m+12) for m in prog[ch][1:4]],.16,.004,.1,4200),br*bar+st*bt,.16,.25)
    # hook: two bars, D minor pentatonic, enters on bar 3, doubles an octave up after the NO ADS card
    HOOK=[(0,81),(.75,79),(1.5,77),(2,76),(3,74),(4,81),(4.75,79),(5.5,77),(6,79),(6.5,72),(7,74)]
    for br in range(2,(nb+3)//4,2):
        for bb,m in HOOK:
            at=br*bar+bb*bt
            if at>=m1-m0-.1:continue
            put(hk,pluck(mf(m),.4,10,.35),at,.12,np.sin(bb)*.4)
            if at>COUT[3]:put(hk,pluck(mf(m+12),.3,13,.2),at+.004,.05,-.3)
    d=int(.75*bt*SR);ech=hk.copy()
    for k_ in range(1,4):
        g=.38**k_;ech[d*k_:,0]+=hk[:NB-d*k_,1]*g;ech[d*k_:,1]+=hk[:NB-d*k_,0]*g
    env=np.ones(NB);tt_=np.arange(NB)/SR
    for k_ in kicks:
        i=int(k_*SR);j=min(NB,i+int(bt*SR));env[i:j]=np.minimum(env[i:j],1-.62*np.exp(-(tt_[i:j]-k_)*9))
    seg+=sc*env[:,None]+ech*(.75+.25*env[:,None])
    bw=sc*env[:,None]*.6+ech*.8
    MG=.62
e=np.ones(NB);fi=int(.006*SR);fo=int(.16*SR);e[:fi]=np.linspace(0,1,fi);e[-fo:]=np.linspace(1,0,fo)**1.5
dry[n0:n1]+=seg*e[:,None]*MG;wet[n0:n1]+=bw*e[:,None]*MG

# intro logo
addR(impact(1.6,36.71),.1,.55,0,.5)
# title cards: whoosh in, hit, a short chord, whoosh out to the tag
for k,c in enumerate(CARDS):
    u0=INTRO+c+CARD*k
    addR(whoosh(.3,True),u0-.22,.28,0,.4)
addR(tick(2600,.05),U(28.6)-0.0,.0,0,.4)
# CTA lands
CU=27.1-.8+1.4-.5+INTRO+CARD*5
addR(bub(700),CU,.25,0,.3)
# reverb + master
ir_n=int(1.8*SR);tir=np.arange(ir_n)/SR
out=np.zeros((N,2))
for c in range(2):
    ir=band(rng.standard_normal(ir_n),200,7000)*np.exp(-tir*3.0);ir[:int(.012*SR)]=0
    n=N+ir_n;Y=np.fft.irfft(np.fft.rfft(wet[:,c],n)*np.fft.rfft(ir,n),n)[:N]
    out[:,c]=dry[:,c]+Y*.035
out*=np.interp(t,[0,29.55,30.0],[1,1,0])[:,None]
out/=np.abs(out).max();out=np.tanh(out*2.2)/np.tanh(2.2)*.94
w=wave.open('audiov15_'+STYLE+'.wav','wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((out*32767).astype('<i2').tobytes());w.close();print('ok')
