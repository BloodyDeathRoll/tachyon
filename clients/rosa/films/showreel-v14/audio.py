import numpy as np, wave
SR=48000;T=15.0;N=int(SR*T)
dry=np.zeros((N,2));wet=np.zeros((N,2))
rng=np.random.default_rng(11)
def add(x,at,g=1.0,pan=0.0,rv=.25):
    i=int(at*SR)
    if i<0:x=x[-i:];i=0
    x=x[:max(0,N-i)]
    l=x*g*np.sqrt(.5*(1-pan));r=x*g*np.sqrt(.5*(1+pan))
    dry[i:i+len(x),0]+=l;dry[i:i+len(x),1]+=r
    wet[i:i+len(x),0]+=l*rv;wet[i:i+len(x),1]+=r*rv
def tt(d):return np.arange(int(d*SR))/SR
def band(x,lo,hi):
    X=np.fft.rfft(x);f=np.fft.rfftfreq(len(x),1/SR)
    m=1/(1+(lo/np.maximum(f,1))**6)/(1+(f/hi)**6);return np.fft.irfft(X*m,len(x))
def noise(d):return rng.standard_normal(int(d*SR))
def fade(x,a=.005,r=.02):
    n=len(x);e=np.ones(n);ai=max(1,int(a*SR));ri=max(1,int(r*SR));e[:ai]=np.linspace(0,1,ai);e[-ri:]*=np.linspace(1,0,ri);return x*e
def kick(d=.42,f0=48,sw=110,k=28):
    t=tt(d);f=f0+sw*np.exp(-t*k);return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*8)
def hat(d=.05,hp=7000):return fade(band(noise(d),hp,16000)*np.exp(-tt(d)*90),.001,.005)
def clap():
    x=band(noise(.16),900,6000);t=tt(.16);e=np.exp(-t*38)+.6*np.exp(-np.abs(t-.012)*400)+.5*np.exp(-np.abs(t-.024)*400);return x*e
def tick(f=2600,d=.04):t=tt(d);return np.sin(2*np.pi*f*t)*np.exp(-t*160)
def pluck(f,d=.5,k=9,br=.4):
    t=tt(d);return (np.sin(2*np.pi*f*t)+br*np.sin(2*np.pi*2*f*t)*np.exp(-t*14)+br*.4*np.sin(2*np.pi*3*f*t)*np.exp(-t*22))*np.exp(-t*k)*np.minimum(1,t/.003)
def bell(f,d=1.6):
    t=tt(d);return (np.sin(2*np.pi*f*t)+.5*np.sin(2*np.pi*f*2.76*t)*np.exp(-t*6)+.25*np.sin(2*np.pi*f*5.4*t)*np.exp(-t*10))*np.exp(-t*3.2)*np.minimum(1,t/.002)
def bass(f,d=.22):
    t=tt(d);x=np.sin(2*np.pi*f*t)+.45*np.sin(2*np.pi*2*f*t)+.2*np.sin(2*np.pi*3*f*t);return fade(x*np.exp(-t*7),.004,.03)
def whoosh(d,up=True,lo=300,hi=9000):
    n=int(d*SR);u=np.linspace(0,1,n);a=band(noise(d),lo,lo*4);b=band(noise(d),hi/3,hi)
    k=u if up else 1-u;e=np.sin(np.pi*u)**1.5 if up is None else (u**2.2 if up else (1-u)**1.6)
    return fade((a*(1-k)+b*k*1.2)*e,.01,.03)
def swish(d):
    n=int(d*SR);u=np.linspace(0,1,n);return fade(band(noise(d),1500,9000)*np.sin(np.pi*u)**2,.01,.02)
def impact(d=1.4,f=42):
    t=tt(d);return kick(d,f,150,22)*1.3+band(noise(d),40,900)*np.exp(-t*6)*.9+np.sin(2*np.pi*f*t)*np.exp(-t*2.6)*.8
def pad(freqs,d,att=.5,rel=.8,bright=1200):
    t=tt(d);y=np.zeros(len(t))
    for f in freqs:
        for det in(-.35,0,.35):
            ph=rng.random()*6.28;saw=sum(np.sin(2*np.pi*(f+det)*h*t+ph*h)/h for h in range(1,9));y+=saw
    y=band(y,60,bright);e=np.minimum(1,t/att)*np.minimum(1,(d-t)/rel);return y*e/len(freqs)/3
def riser(d,f0=200,f1=1600):
    t=tt(d);u=t/d;f=f0*(f1/f0)**u;return (np.sin(2*np.pi*np.cumsum(f)/SR)*.5+band(noise(d),800,9000)*.5*u)*u**2
def bub(f0=500):
    t=tt(.08);f=f0*(1+t*16);return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*50)

# ---- sea bed
t=np.arange(N)/SR
sea=band(rng.standard_normal(N),150,2400)*(.45+.55*np.sin(2*np.pi*t/4.6-.6)**2)
sea2=band(rng.standard_normal(N),150,2400)*(.45+.55*np.sin(2*np.pi*t/5.3+.9)**2)
lvl=np.interp(t,[0,.4,1.6,2.2,11.6,12.4,14.2,15],[0,.9,.9,.35,.35,.9,.9,.5])
dry[:,0]+=sea*lvl*.085;dry[:,1]+=sea2*lvl*.085

D=[73.42,146.83,293.66];Dm9=[146.83,174.61,220,261.63,329.63]
# ---- A: first light
add(pad([73.42,110,146.83],2.6,1.0,.6,500),0,.5,0,.5)
w=.96*np.sin(np.pi*np.linspace(0,1,int(.9*SR)))**2;add(band(noise(.9),2000,9000)*w,.05,.10,0,.6)
for i in range(5):add(tick(1500+i*120,.05),.30+i*.07,.22,-.4+i*.2,.5);add(pluck([293.66,349.23,440,523.25,659.25][i],.7,7),.30+i*.07,.13,-.4+i*.2,.7)
add(riser(.62,180,1300),1.43,.28,0,.4);add(whoosh(.62,True),1.43,.5,0,.4)
add(impact(1.5),2.05,.95,0,.3);add(bell(587.33,1.6),2.06,.16,0,.9);add(bell(880,1.4),2.08,.09,.3,.9)
# ---- groove 2.05 .. 11.75
B0=2.05;beat=.5
b=B0;k=0
while b<11.7:
    add(kick(),b,.62,0,.05)
    if k%2==1:add(clap(),b,.20,0,.5)
    add(hat(),b+.25,.16,.3,.2);add(hat(.03),b+.125,.07,-.3,.2);add(hat(.03),b+.375,.07,-.3,.2)
    b+=beat;k+=1
seq=[36.71,36.71,55,36.71,43.65,43.65,49,55]
for i,a in enumerate(np.arange(B0,11.7,.25)):
    f=seq[i%8]*2*(1 if a<6.8 else (.891 if (i//8)%2 else 1))
    add(bass(f),a+.0,.42,0,.05)
arp=[293.66,440,523.25,659.25,587.33,440,349.23,440]
for i,a in enumerate(np.arange(B0,11.7,.125)):
    g=.035+.035*((i%4)==0);g*=np.interp(a,[2.05,3,9.8,11.7],[.4,1,1,1.5])
    add(pluck(arp[i%8]*(2 if (i//16)%2 else 1),.3,16,.3),a,g,np.sin(i*.9)*.7,.7)
add(pad(Dm9,5.0,.5,.6,1400),2.05,.22,0,.6);add(pad([130.81,196,261.63,329.63,392],2.6,.4,.5,1500),6.8,.20,0,.6);add(pad(Dm9,2.6,.4,.6,1700),9.2,.22,0,.6)
# B sfx
add(swish(.5),2.55,.3,.4,.4);add(pluck(880,.5,8),3.05,.14,.5,.8);add(bub(700),3.07,.22,.4,.4)
for i in range(7):add(tick(2200+i*90,.03),2.92+i*.045,.09,.5,.5)
add(swish(.3),3.05,.22,-.2,.3);add(swish(.35),3.42,.2,-.2,.3)
add(tick(3200),4.0,.4,-.3,.4);add(bub(420),4.0,.3,-.3,.3)
add(whoosh(.42,True),4.1,.4,-.2,.4)
# C explode
add(riser(.7,150,900),4.5,.2,0,.4)
for i,(a,f) in enumerate([(4.62,440),(4.75,587.33),(4.88,739.99),(5.0,880)]):add(pluck(f,.6,7),a,.2,-.3+i*.2,.9);add(tick(1800+i*300,.05),a,.2,-.3+i*.2,.4)
add(whoosh(.75,None,200,6000),4.5,.4,0,.5)
for k_ in range(3):add(tick(3000,.04),4.92+k_*.17,.25,.6,.5);add(pluck(1174.66*(1+.122*k_),.4,10),4.92+k_*.17,.11,.6,.9)
for i in range(1,7):
    a=5.5+ .62*(.5-.5*np.cos(np.pi*(i-.5)/6))
    add(tick(1700+i*130,.035),a,.3,-.5+i*.1,.4);add(pluck(293.66*2**(i/6),.25,14),a,.12,-.5+i*.1,.8)
add(whoosh(.5,False,200,6000),6.15,.4,0,.4);add(kick(.3,60,90,30),6.72,.5,-.3,.2)
# D
add(swish(.6),6.82,.3,-.5,.3)
add(whoosh(.55,True),7.4,.5,.3,.4);add(impact(1.3,46),7.95,.9,.2,.35);add(bell(739.99,1.2),7.96,.13,.4,.9)
for i,a in enumerate([8.0,8.13,8.26]):add(pluck([587.33,739.99,880][i],.5,8),a+.02,.17,.3+i*.2,.9);add(bub(500+i*150),a,.2,.3+i*.2,.3)
for i in range(10):add(tick(2400+i*60,.02),8.08+i*.055,.06,.5,.4)
add(whoosh(.45,False),8.8,.35,.5,.4)
# E map + globe
add(tick(3200),9.2,.4,-.4,.4);add(bub(420),9.2,.3,-.4,.3);add(swish(.4),9.27,.25,-.4,.4)
add(riser(.75,120,700),9.8,.22,0,.5);add(whoosh(.8,None,150,5000),9.85,.5,-.1,.6);add(impact(1.2,50),10.05,.5,0,.4)
pent=[293.66,349.23,440,523.25,587.33,698.46,880,1046.5,1174.66,1396.9,1760]
rr=rng.random((60,3))
for i in range(60):
    a=10.08+1.25*(i/60)**.9;add(pluck(pent[int(rr[i,0]*len(pent))],.35,12,.2),a,.035+.05*rr[i,1],rr[i,2]*2-1,.9)
for i in range(5):add(tick(2000+i*200,.03),10.68+i*.07,.14,.6,.5)
# F sunrise
add(whoosh(.5,False,150,4000),11.6,.4,0,.5)
add(impact(2.2,36),11.76,.9,0,.5)
add(riser(1.9,90,520),11.95,.2,0,.6)
add(pad([116.54,174.61,233.08,293.66,349.23,440],2.3,1.6,.5,2200),11.7,.42,0,.8)
sw=band(noise(1.6),400,7000)*np.linspace(0,1,int(1.6*SR))**2.5;add(fade(sw,.01,.05),12.3,.22,0,.7)
# G lockup
add(whoosh(.5,True),13.38,.4,.3,.5)
add(impact(1.6,36.71),13.9,1.0,0,.4)
for i,f in enumerate([293.66,369.99,440,587.33,739.99,880,1174.66]):add(bell(f,2.0),13.9+i*.045,.14,-.6+i*.2,1.0)
add(pad([73.42,146.83,220,293.66,369.99,440,587.33],1.35,.25,.9,2600),13.6,.5,0,.8)
for i in range(4):add(pluck(293.66*(i+1),.5,10),13.3+i*.07,.12,-.3+i*.2,.9)
# ---- reverb
ir_n=int(1.6*SR);tir=np.arange(ir_n)/SR
out=np.zeros((N,2))
for c in range(2):
    ir=band(rng.standard_normal(ir_n),200,7000)*np.exp(-tir*3.4);ir[:int(.012*SR)]=0
    n=N+ir_n;Y=np.fft.irfft(np.fft.rfft(wet[:,c],n)*np.fft.rfft(ir,n),n)[:N]
    out[:,c]=dry[:,c]+Y*.035
out[-int(.5*SR):]*=np.linspace(1,0,int(.5*SR))[:,None]**1.5
out/=np.abs(out).max();out=np.tanh(out*2.2)/np.tanh(2.2)*.94
print('rms',np.sqrt((out**2).mean()))
w=wave.open('audio.wav','wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((out*32767).astype('<i2').tobytes());w.close();print('ok')
