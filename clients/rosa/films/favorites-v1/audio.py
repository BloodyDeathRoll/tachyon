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
# bed
pad([146.83,220,277.18,329.63],0.0,3.4,.10)
pad([123.47,185,246.94,293.66,369.99],3.4,9.6,.09)
pad([110,164.81,220,277.18,329.63],9.6,14.3,.09)
pad([146.83,220,293.66,369.99,440],14.3,15.0,.12)
# S1 word hits
for a,f in[(.25,587),(.45,659),(.62,880),(1.12,740),(1.52,988)]:add(tone(f,.5,.12),a,.25,(f-700)/600);add(kick(.3),a,.35)
add(whoosh(.35),1.75,.3);add(impact(1.2),2.1,.55)
add(tone(1174.7,1.0,.3,(1,.5,.2)),2.25,.18)
for k,a in enumerate([2.62,2.67,2.72,2.77]):add(click(1800+k*300),a,.25,.3)
for a,g in[(3.0,.3),(3.07,.15),(3.11,.08)]:add(tone(1318,.15,.04),a,g)
add(whoosh(.32),3.1,.5);add(impact(1.4),3.42,.7)
# groove 3.42 - 14.25
b=3.42
while b<14.2:
    add(kick(),b,.55)
    for k in range(4):
        hh=b+k*.125
        if hh<14.2 and k!=0:add(hat(),hh,.10 if k%2 else .05,.4*(-1)**k)
    if int(round((b-3.42)/.5))%4==3:add(rng.standard_normal(int(.18*SR))*env(.18,.002,.05),b+.25,.12)
    b+=.5
# bass line
for k,a in enumerate(np.arange(3.42,14.2,.25)):
    f=[61.74,61.74,73.42,61.74,55,55,82.41,73.42][k%8]
    if a>=9.6:f=[55,55,65.41,55,73.42,73.42,82.41,65.41][k%8]
    add(tone(f,.24,.12,(1,.5,.25,.12)),a,.3)
# events
for a in(5.8,11.8):add(click(3200),a,.4);add(click(900),a+.01,.3)
add(whoosh(.4),5.65,.3);add(whoosh(.5),9.5,.3);add(whoosh(.45),11.55,.3)
add(impact(1.0),7.95,.5)
for k,a in enumerate([8.0,8.12,8.24]):add(tone(1046.5*(1.122**k),.25,.07),a,.18,.6)
for k in range(18):add(click(2600+k*40),10.0+k*.05,.08,-.4)
pk=rng.random(40)
for k in range(40):add(tone(1400+pk[k]*1800,.12,.03),12.0+k*.022+pk[k]*.05,.05,pk[k]*2-1)
add(tone(1318.5,.9,.25,(1,.4,.1)),13.78,.25);add(tone(1760,.9,.25,(1,.4,.1)),13.9,.2)
add(whoosh(.35),13.98,.5);add(impact(1.2),14.32,.75)
add(tone(587.3,.8,.35,(1,.6,.3)),14.34,.15);add(tone(880,.8,.35),14.36,.12)
st=np.stack([L,Rr],1);
# fade tail
st[-int(.08*SR):]*=np.linspace(1,0,int(.08*SR))[:,None]
st=np.tanh(st*1.3)/np.tanh(1.3);st/=np.abs(st).max()*1.12
w=wave.open('audio.wav','wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((st*32767).astype('<i2').tobytes());w.close();print('ok')
