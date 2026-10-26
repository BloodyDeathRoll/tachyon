import numpy as np, wave
SR=48000;T=15.0;n=int(SR*T);L=np.zeros(n);Rr=np.zeros(n)
rng=np.random.default_rng(5)
def add(x,at,gain=1.0,pan=0.0):
    i=int(at*SR)
    if i<0:x=x[-i:];i=0
    x=x[:max(0,n-i)]
    L[i:i+len(x)]+=x*gain*(1-pan)*.7+x*gain*.3;Rr[i:i+len(x)]+=x*gain*(1+pan)*.7+x*gain*.3
def lp(x,a):
    y=np.empty_like(x);acc=0.
    for i in range(len(x)):acc+=a*(x[i]-acc);y[i]=acc
    return y
def env(d,a=.005,r=None):
    m=int(d*SR);e=np.ones(m);ai=max(1,int(a*SR));e[:ai]=np.linspace(0,1,ai)
    tt=np.arange(m)/SR;return e*np.exp(-tt/(r if r else d/4))
def kick(d=.45):
    tt=np.arange(int(d*SR))/SR;f=45+120*np.exp(-tt*30);return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*7)
def hat():
    x=rng.standard_normal(int(.06*SR));x=x-lp(x,.3);return x*env(.06,.001,.015)
def click(f=2200):
    tt=np.arange(int(.05*SR))/SR;return np.sin(2*np.pi*f*tt)*np.exp(-tt*120)
def whoosh(d,up=True):
    m=int(d*SR);x=rng.standard_normal(m);tt=np.linspace(0,1,m);sh=tt**2 if up else (1-tt)**2
    y=np.zeros(m);acc=0;a=.02+.25*sh
    for i in range(m):acc+=a[i]*(x[i]-acc);y[i]=acc
    return y*sh*1.8
def impact(d=1.6):
    tt=np.arange(int(d*SR))/SR;nz=lp(rng.standard_normal(len(tt)),.08)*np.exp(-tt*5)
    return kick(d)*1.2+nz*1.2+np.sin(2*np.pi*42*tt)*np.exp(-tt*2.2)*.8
def tone(f,d,dec=None,h=(1,.3,.1)):
    tt=np.arange(int(d*SR))/SR;return sum(a*np.sin(2*np.pi*f*(k+1)*tt) for k,a in enumerate(h))*env(d,.004,dec or d/3)
def pluck(f,d=.35):
    tt=np.arange(int(d*SR))/SR
    return (np.sin(2*np.pi*f*tt)+.35*np.sin(2*np.pi*2*f*tt)+.12*np.sin(2*np.pi*3*f*tt))*np.exp(-tt*14)
def pad(freqs,start,end,g):
    m=int((end-start)*SR);tt=np.arange(m)/SR;y=np.zeros(m)
    for f in freqs:
        for det in(-.12,.12):y+=np.sign(np.sin(2*np.pi*(f+det)*tt+rng.random()*6))*.15+np.sin(2*np.pi*f*tt)*.4
    y=lp(y,.02);e=np.minimum(1,np.minimum(tt/.6,(end-start-tt)/.8));add(y*e,start,g)
def bubble(f0):
    d=.09;tt=np.arange(int(d*SR))/SR;f=f0*(1+tt*14);return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*45)
def splash(d=.9):
    tt=np.arange(int(d*SR))/SR;x=rng.standard_normal(len(tt))
    y=lp(x,.25)-lp(x,.02);return y*np.exp(-tt*4)*np.minimum(1,tt/.03)
# sea ambience
tt=np.arange(n)/SR;sea=lp(rng.standard_normal(n),.012)*(0.55+0.45*np.sin(2*np.pi*tt/3.4)**2)
sea*=np.minimum(1,tt/.8)*np.minimum(1,(T-tt)/1.0);L+=sea*.9;Rr+=np.roll(sea,2400)*.9

pent=[587.33,659.25,739.99,880,987.77,1174.66,1318.51,1479.98,1760,1975.53,2349.32]
# S1 bands: descending as the scale goes from Calm to Stay out
for k in range(5):
    a=.1+k*.2;f=[1174.66,987.77,880,739.99,587.33][k]
    add(whoosh(.22),a-.12,.25,(-1 if k%2==0 else 1)*.7);add(pluck(f,.5),a+.05,.32,(-1 if k%2==0 else 1)*.5);add(pluck(f/2,.5),a+.05,.25)
    add(kick(.3),a+.05,.22)
pad([293.66,369.99,440,554.37],0.0,2.3,.07)
add(whoosh(.48),1.38,.45);add(impact(1.3),1.86,.6)
for k,a in enumerate([1.9,1.99,2.08]):add(click(1600+k*400),a,.18,.3)
add(tone(1318,.2,.05),2.6,.15)
add(click(3200),2.97,.35);add(tone(220,.18,.05,(1,.6,.3)),2.99,.4);add(pluck(1479.98,.6),3.0,.25);add(pluck(1760,.6),3.08,.2)
pad([293.66,440,587.33,739.99],2.3,4.6,.07)
for k,a in enumerate([3.22,3.3]):add(click(2400+k*500),a,.15)
add(whoosh(.55),3.35,.45,-.2);add(click(2600),3.92,.25)
# flood
add(splash(1.0),3.95,.9);add(whoosh(.35),3.93,.4)
rb=rng.random((40,2))
for k in range(40):add(bubble(300+rb[k,0]*900),3.98+k*.019+rb[k,1]*.05,.18,rb[k,0]*2-1)
add(impact(1.0),4.6,.45)
# groove 4.6..12.4
b=4.6
while b<12.38:
    add(kick(),b,.5)
    for k in range(4):
        hh=b+k*.125
        if hh<12.4 and k!=0:add(hat(),hh,.09 if k%2 else .045,.4*(-1)**k)
    if int(round((b-4.6)/.5))%2==1:add(rng.standard_normal(int(.15*SR))*env(.15,.002,.04),b,.1)
    b+=.5
for k,a in enumerate(np.arange(4.6,12.4,.25)):
    f=[73.42,73.42,110,73.42,92.5,92.5,82.41,110][k%8]
    if a>=8.6:f=[61.74,61.74,92.5,61.74,82.41,82.41,110,92.5][k%8]
    add(tone(f,.24,.12,(1,.5,.25,.12)),a,.28)
pad([293.66,369.99,440,587.33],4.6,8.6,.06)
pad([246.94,369.99,493.88,587.33],8.6,12.4,.07)
# home pops
for k,a in enumerate([4.62,4.75,4.82,4.89,4.96]):add(pluck(pent[k+3],.3),a,.18,(k%2*2-1)*.4)
add(whoosh(.45),5.25,.35);
for k in range(4):add(pluck(pent[k+1],.4),5.6+k*.08,.22,(k-1.5)/2)
add(pluck(1760,.5),6.05,.2)
add(click(3000),6.66,.3);add(whoosh(.4),6.82,.4)
add(whoosh(.4),7.2,.3,-.5)
for k in range(5):add(pluck(pent[k+4],.4),7.65+k*.2,.24,.6);add(click(4000),7.65+k*.2,.08,.6)
add(whoosh(.35),8.9,.35,.6);add(whoosh(.45),8.95,.3)
add(whoosh(.3),9.25,.4);add(impact(1.2),9.48,.75)
for k in range(3):add(pluck([880,1174.66,1479.98][k],.6),9.5+k*.05,.2)
add(whoosh(.3),9.88,.25);add(click(3600),10.18,.25)
add(whoosh(.45),10.3,.3)
# tide swell
sw=whoosh(.6);add(sw,10.75,.45);add(splash(.8),11.25,.35)
for k in range(3):add(pluck([587.33,440,587.33][k],.7),11.3+k*.12,.3,(k-1)*.6);add(pluck([1174.66,880,1174.66][k],.5),11.32+k*.12,.15,(k-1)*.6)
for k in range(10):add(bubble(500+rb[k,0]*500),11.55+k*.075,.12,(k/5-1))
add(whoosh(.5,False),12.4,.4)
# end
add(whoosh(.4),12.55,.4);add(impact(1.6),12.95,.8)
for k,f in enumerate([587.33,739.99,880,1174.66,1479.98]):add(pluck(f,1.2),12.97+k*.06,.22,(k-2)/2.5)
pad([293.66,440,587.33,739.99,880],12.95,15.0,.12)
add(tone(1760,1.4,.5,(1,.4,.1)),13.5,.1)
st=np.stack([L,Rr],1)
st[-int(.3*SR):]*=np.linspace(1,0,int(.3*SR))[:,None]
st=np.tanh(st*1.3)/np.tanh(1.3);st/=np.abs(st).max()*1.12
w=wave.open('audio.wav','wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((st*32767).astype('<i2').tobytes());w.close();print('ok')
