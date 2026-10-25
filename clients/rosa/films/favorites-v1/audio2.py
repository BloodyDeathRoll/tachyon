import numpy as np, wave
SR=48000;T=15.0;n=int(SR*T);L=np.zeros(n);Rr=np.zeros(n)
t=np.arange(n)/SR;rng=np.random.default_rng(3)
def add(x,at,gain=1.0,pan=0.0):
    i=int(at*SR);x=x[:max(0,n-i)]
    L[i:i+len(x)]+=x*gain*(1-pan)*.7+x*gain*.3;Rr[i:i+len(x)]+=x*gain*(1+pan)*.7+x*gain*.3
def env(d,a=.005,r=None):
    m=int(d*SR);e=np.ones(m);ai=max(1,int(a*SR));e[:ai]=np.linspace(0,1,ai)
    tt=np.arange(m)/SR;return e*np.exp(-tt/(r if r else d/4))
def lp(x,a):
    y=np.zeros_like(x);acc=0.
    for i in range(len(x)):acc+=a*(x[i]-acc);y[i]=acc
    return y
def kick(d=.45):
    tt=np.arange(int(d*SR))/SR;f=45+120*np.exp(-tt*30);ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.exp(-tt*7)
def hat():
    x=rng.standard_normal(int(.06*SR));x=x-lp(x,.3);return x*env(.06,.001,.015)
def click(f=2200):
    tt=np.arange(int(.05*SR))/SR;return np.sin(2*np.pi*f*tt)*np.exp(-tt*120)
def whoosh(d,up=True):
    m=int(d*SR);x=rng.standard_normal(m);tt=np.linspace(0,1,m)
    sh=tt**2 if up else (1-tt)**2
    y=np.zeros(m);acc=0;a=.02+.25*(sh if up else sh)
    for i in range(m):acc+=a[i]*(x[i]-acc);y[i]=acc
    return y*sh*1.8
def impact(d=1.6):
    tt=np.arange(int(d*SR))/SR;x=kick(d)*1.2;nz=rng.standard_normal(len(tt));nz=lp(nz,.08)*np.exp(-tt*5)
    sub=np.sin(2*np.pi*42*tt)*np.exp(-tt*2.2)
    return x+nz*1.2+sub*.8
def tone(f,d,dec=None,h=(1,.3,.1)):
    tt=np.arange(int(d*SR))/SR;y=sum(a*np.sin(2*np.pi*f*(k+1)*tt) for k,a in enumerate(h))
    return y*env(d,.004,dec or d/3)
def pad(freqs,start,end,g):
    m=int((end-start)*SR);tt=np.arange(m)/SR;y=np.zeros(m)
    for f in freqs:
        for det in(-.12,.12):y+=np.sign(np.sin(2*np.pi*(f+det)*tt+rng.random()*6))*.15+np.sin(2*np.pi*f*tt)*.4
    y=lp(y,.02);e=np.minimum(1,np.minimum(tt/.6,(end-start-tt)/.8));add(y*e,start,g)

D=[1.05,.82,.64,.52,.44,.38,.34,.31,.29,.28,.27,.27]
ST=[];x=3.98
for d in D:ST.append(x);x+=d
TAP=[s+min(.36,d*.32) for s,d in zip(ST,D)]
SW0=[s+d*.55 for s,d in zip(ST,D)];SW1=[s+d*.96 for s,d in zip(ST,D)]
TABT=TAP[-1]+.42;FAV0=TABT+.1
ARR=[];a=.42;g=.21
for i in range(12):ARR.append(a);a+=g;g=max(.055,g*.84)
pent=[587.33,659.25,739.99,880,987.77,1174.66,1318.51,1479.98,1760,1975.53,2349.32,2637.02]
def pluck(f,d=.35):
    tt=np.arange(int(d*SR))/SR
    return (np.sin(2*np.pi*f*tt)+.35*np.sin(2*np.pi*2*f*tt)+.12*np.sin(2*np.pi*3*f*tt))*np.exp(-tt*14)
pad([293.66,369.99,440,554.37],0.0,3.4,.08)
pad([293.66,369.99,440,587.33,659.25],3.4,FAV0,.07)
pad([246.94,369.99,493.88,587.33],FAV0,11.7,.08)
pad([329.63,415.3,493.88,659.25],11.7,14.3,.08)
pad([293.66,440,587.33,739.99],14.3,15.0,.11)
add(tone(1174.7,.6,.15),0.05,.12)
add(pluck(2349.3,.6),.33,.3)
for i,a in enumerate(ARR):
    add(pluck(pent[i]),a+.1,.22,(-1 if i%2==0 else 1)*.7);add(whoosh(.18),a-.06,.12,(-1 if i%2==0 else 1)*.8)
add(whoosh(.3),1.7,.35);add(impact(1.2),2.0,.5)
for k,a in enumerate([2.52,2.57,2.62,2.67]):add(click(1800+k*300),a,.22,.3)
for a,gg in[(2.95,.3),(3.02,.15),(3.06,.08)]:add(tone(1318,.15,.04),a,gg)
add(whoosh(.32),3.1,.5);add(impact(1.4),3.42,.65)
b=3.42
while b<14.2:
    add(kick(),b,.5)
    for k in range(4):
        hh=b+k*.125
        if hh<14.2 and k!=0:add(hat(),hh,.09 if k%2 else .045,.4*(-1)**k)
    if int(round((b-3.42)/.5))%2==1:add(rng.standard_normal(int(.15*SR))*env(.15,.002,.04),b,.10)
    b+=.5
for k,a in enumerate(np.arange(3.42,14.2,.25)):
    f=[73.42,73.42,110,73.42,92.5,92.5,82.41,110][k%8]
    if a>=FAV0:f=[61.74,61.74,92.5,61.74,82.41,82.41,110,92.5][k%8]
    add(tone(f,.24,.12,(1,.5,.25,.12)),a,.28)
for i,a in enumerate(TAP):
    side=-1 if i%2==0 else 1
    add(click(3000),a,.3);add(pluck(pent[i]*.5,.5),a+.01,.3);add(pluck(pent[i],.4),a+.03,.18,side*.6)
    add(whoosh(.35),a+.02,.18,side*.9)
for i in range(11):add(whoosh(max(.12,SW1[i]-SW0[i])),SW0[i],.12,-.3)
add(click(3000),TABT,.35);add(impact(.8),FAV0,.35)
for k in range(12):add(pluck(pent[11-k]*.5,.3),FAV0+.2+k*.05,.12,(k%2*2-1)*.5)
pk=rng.random(30)
for k in range(30):add(tone(1400+pk[k]*1600,.12,.03),11.8+k*.02+pk[k]*.05,.04,pk[k]*2-1)
for k in range(12):add(pluck(pent[k],.25),12.0+k*.06,.1,(k%2*2-1)*.6)
add(tone(1318.5,.9,.25,(1,.4,.1)),13.78,.25);add(tone(1760,.9,.25,(1,.4,.1)),13.9,.2)
add(whoosh(.35),13.98,.45);add(impact(1.2),14.32,.7)
add(pluck(1174.66,.9),14.34,.25);add(pluck(1479.98,.9),14.38,.2);add(pluck(1760,.9),14.42,.18)
st=np.stack([L,Rr],1);
# fade tail
st[-int(.08*SR):]*=np.linspace(1,0,int(.08*SR))[:,None]
st=np.tanh(st*1.3)/np.tanh(1.3);st/=np.abs(st).max()*1.12
w=wave.open('audio2.wav','wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((st*32767).astype('<i2').tobytes());w.close();print('ok')
