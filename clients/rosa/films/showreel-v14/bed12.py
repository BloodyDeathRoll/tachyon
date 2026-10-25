# music bed: three takes on a Popping Bottles style party beat (99 bpm, F minor), each with real instruments on top
# STYLE: brass (horn stabs + sliding 808) | guitar (funk guitar + clav, no shouts) | keys (electric piano + whistle hook)
m0=U(3.35)/SP;m1=U(24.55)/SP;n0=int(m0*SR);n1=int(m1*SR);NB=n1-n0
bpm=99.38;bt=60/bpm;st=bt/4;bar=4*bt;nbar=int(np.ceil((m1-m0)/bar))
L_DR,L_BS,L_IN,L_WET=[np.zeros((NB,2)) for _ in range(4)]
def put(buf,x,at,g=1.,pan=0.):
    i=int(at*SR)
    if i<0 or i>=NB:return
    x=x[:NB-i];buf[i:i+len(x),0]+=x*g*np.sqrt(.5*(1-pan));buf[i:i+len(x),1]+=x*g*np.sqrt(.5*(1+pan))
mf=lambda m:440*2**((m-69)/12)
def saw(f,t):ph=np.cumsum(f*np.ones(len(t)))/SR;return 2*(ph%1)-1
def bright(x,env,lo,dark,hi):return band(x,lo,dark)*(1-env)+band(x,lo,hi)*env
# ---- drums (the pop beat)
def kk():return np.concatenate([band(noise(.006),2000,9000)*.5,np.zeros(int(.214*SR))])[:int(.22*SR)]+kick(.22,52,150,38)
def ghost():return band(noise(.07),900,6000)*np.exp(-tt(.07)*55)
def ohat():return fade(band(noise(.28),6500,15000)*np.exp(-tt(.28)*9),.002,.04)
def snr():t=tt(.16);return band(noise(.16),180,5000)*np.exp(-t*22)+np.sin(2*np.pi*190*t)*np.exp(-t*30)
def snap():t=tt(.06);return band(noise(.06),1800,7000)*np.exp(-t*70)
def hey():
    d=.24;t=tt(d);out=np.zeros(len(t))
    for f0,dt in [(205,0),(176,.008),(232,.014),(190,.02)]:
        f=f0*(1+.06*np.exp(-t*12))-18*t;src=2*((np.cumsum(f)/SR)%1)-1+.35*band(noise(d),300,6000)
        vo=sum(g*band(src,c*.85,c*1.15) for c,g in [(700,1),(1850,.7),(2700,.35)]);sh=int(dt*SR);out+=np.concatenate([np.zeros(sh),vo])[:len(t)]
    return out*np.minimum(1,t/.012)*np.exp(-t*9)/3
def pop():
    t=tt(.09);f=520*(1+1.4*np.exp(-t*60));return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*45)+band(noise(.09),1200,7000)*np.exp(-t*90)*.6
KP=[[0,3,10,13,15],[0,3,10]]
HEY={'brass':lambda b,s_:.5,'guitar':lambda b,s_:0,'keys':lambda b,s_:.6 if (s_==12 and b%2) else 0}[STYLE]
for b in range(nbar):
    b0=b*bar;full=b>=1
    for s_ in KP[b%2]:put(L_DR,kk(),b0+s_*st,.62)
    for s_ in(4,12):
        put(L_DR,clap(),b0+s_*st,.42,.05);put(L_DR,snr(),b0+s_*st,.22)
        if STYLE=='guitar':put(L_DR,snap(),b0+s_*st+.006,.3,-.3)
        h=HEY(b,s_)
        if h:put(L_DR,hey(),b0+s_*st+.004,.5*h,-.08);put(L_WET,hey(),b0+s_*st,.3*h)
    if full:
        for s_ in(7,9,10,15):put(L_DR,ghost(),b0+s_*st,.13,.2)
    for s_ in range(16):
        if s_==14 and b%2:put(L_DR,ohat(),b0+s_*st,.09,.3);continue
        put(L_DR,hat(.035,7000),b0+s_*st,[.34,.15,.24,.16][s_%4]*(1 if full else .6),(.35 if s_%2 else -.15))
        if s_%2==0:put(L_DR,fade(band(noise(.09),4000,12000)*np.exp(-tt(.09)*30),.004,.02),b0+s_*st+.01,.14,-.3)
put(L_DR,pop(),0,.4,.3)
# ---- 808 with slides, F minor riff (A/B bars)
def b808(m,d,to=None,gl=.12):
    t=tt(d);f=mf(m)*np.ones(len(t))
    if to is not None:k=np.clip((t-(d-gl))/gl,0,1);f=mf(m)+(mf(to)-mf(m))*k*k
    f=f*(1+1.2*np.exp(-t*45));x=np.sin(2*np.pi*np.cumsum(f)/SR)*np.minimum(1,t/.003)*np.exp(-t*2.6)
    return fade(np.tanh(x*2.6)/np.tanh(2.6),.002,.03)
BA=[[(0,41,.3,None),(3,41,.4,None),(10,42,.3,41),(13,40,.12,None),(15,39,.12,None)],[(0,41,.3,None),(3,41,.4,None),(10,44,.5,41)]]
for b in range(nbar):
    for s_,m,d,to in BA[b%2]:put(L_BS,b808(m,d,to),b*bar+s_*st,1)
# ---- instruments
if STYLE=='brass':
    def horn(ms,d,fall=0):
        t=tt(d);y=np.zeros(len(t))
        for m in ms:
            for det in(-.08,0,.09):
                f=mf(m+det)*(1-.035*np.exp(-t*40))*(1-fall*np.clip((t-d*.4)/(d*.6),0,1));y+=saw(f,t)
        env=np.minimum(1,t/.012)*np.exp(-t*(3 if d>.25 else 9));br=np.exp(-t*7)*.8+.2
        return fade(bright(y,br,150,900,5200)*env,.003,.04)/len(ms)/3
    FM7=[53,56,60,63,65];DB=[49,53,56,60,61];EB=[51,55,58,63]
    RIFF=[[(2,FM7,.12),(7,FM7,.12),(10,FM7,.32)],[(0,FM7,.1),(6,DB,.14),(8,DB,.3),(14,EB,.12)]]
    for b in range(1,nbar):
        for s_,ch,d in RIFF[b%2]:
            fl=.06 if (b%4==3 and s_==8) else 0
            put(L_IN,horn(ch,d+(.25 if fl else 0),fl),b*bar+s_*st,1,.15);put(L_WET,horn(ch,d,fl),b*bar+s_*st,.5)
elif STYLE=='guitar':
    KS={}
    def ks(f,d,damp):
        key=(round(f,2),d,damp)
        if key in KS:return KS[key]
        n=int(d*SR);p=max(2,int(SR/f));buf=rng.uniform(-1,1,p);out=np.zeros(n)
        for i in range(n):out[i]=buf[i%p];buf[i%p]=damp*.5*(buf[i%p]+buf[(i+1)%p])
        KS[key]=band(out,90,7000);return KS[key]
    def strum(ms,d,damp,dn=True):
        y=np.zeros(int((d+.03)*SR))
        for j,m in enumerate(ms if dn else ms[::-1]):x=ks(mf(m),d,damp);i=int(j*.006*SR);y[i:i+len(x)]+=x
        return fade(y,.001,.02)/len(ms)
    CH=[[53,58,63,68],[53,58,63,68]];CH=[[48,55,58,63],[46,53,56,61]]  # Cm7 / Bbm7 shapes: a Fm feel without the root
    for b in range(1,nbar):
        for s_ in range(16):
            acc=s_ in(2,6,10,14) or (b%2 and s_ in(3,11))
            put(L_IN,strum(CH[b%2],.16 if acc else .05,.996 if acc else .93,s_%2==0),b*bar+s_*st,.9 if acc else .32,-.45)
    def clav(m,d=.16):
        t=tt(d);ph=(np.cumsum(np.full(len(t),mf(m)))/SR)%1;x=(ph<.18).astype(float)-.18
        return fade(band(x,250,6000)*np.exp(-t*16)*np.minimum(1,t/.002),.001,.02)
    CL=[[(0,53),(2,53),(3,56),(5,58),(6,59),(7,60),(10,63),(11,60),(13,53)],[(0,53),(3,56),(6,53),(8,51),(10,53)]]
    for b in range(2,nbar):
        for s_,m in CL[b%2]:put(L_IN,clav(m),b*bar+s_*st,.7,.4);put(L_WET,clav(m),b*bar+s_*st,.25)
else:
    def rhodes(ms,d):
        t=tt(d);y=np.zeros(len(t))
        for m in ms:
            f=mf(m);I=2.2*np.exp(-t*6)+.25
            y+=np.sin(2*np.pi*f*t+I*np.sin(2*np.pi*f*t))+.12*np.sin(2*np.pi*f*14*t)*np.exp(-t*30)
        return fade(y*np.minimum(1,t/.004)*np.exp(-t*2.2)*(1+.18*np.sin(2*np.pi*5*t)),.003,.06)/len(ms)
    RH=[[(2,[56,60,63,67],.55),(10,[56,60,63,67],.3),(14,[56,60,63,67],.12)],[(2,[56,60,61,65],.55),(8,[56,60,61,65],.25),(11,[55,58,62,65],.4)]]
    for b in range(1,nbar):
        for s_,ch,d in RH[b%2]:put(L_IN,rhodes(ch,d),b*bar+s_*st,.8,-.2);put(L_WET,rhodes(ch,d),b*bar+s_*st,.35)
    def whistle(notes,d):
        t=tt(d);f=np.zeros(len(t))
        for k,(at,m) in enumerate(notes):
            i=int(at*SR);f[i:]=mf(m)
        f=np.convolve(f,np.ones(int(.03*SR))/int(.03*SR),'same');f[:int(.03*SR)]=f[int(.03*SR)]
        vib=1+.006*np.sin(2*np.pi*5.6*t)*np.clip((t-.15)/.3,0,1)
        x=np.sin(2*np.pi*np.cumsum(f*vib)/SR)+.04*band(noise(d),1500,6000)
        return fade(x,.02,.06)
    HK=[[(0,[(0,70),(.12,69)],.5),(3,[(0,72)],.3),(6,[(0,68)],.25),(8,[(0,65)],.55)],[(2,[(0,65)],.15),(3,[(0,68)],.25),(6,[(0,70),(.12,69)],.4),(10,[(0,72)],.25),(12,[(0,70)],.45)]]
    for b in range(2,nbar):
        for s_,nt,d in HK[b%2]:put(L_IN,whistle(nt,d),b*bar+s_*st,.5,.25);put(L_WET,whistle(nt,d),b*bar+s_*st,.4)
# room on drums, balance layers by RMS, then into the mix
irn=int(.45*SR);ir=band(rng.standard_normal(irn),300,9000)*np.exp(-np.arange(irn)/SR*9);ir[:int(.008*SR)]=0
for c in range(2):
    nn=NB+irn;L_DR[:,c]+=np.fft.irfft(np.fft.rfft(L_DR[:,c],nn)*np.fft.rfft(ir,nn),nn)[:NB]*.012
rms=lambda x:np.sqrt((x**2).mean())+1e-9
seg=L_DR/rms(L_DR)+L_BS/rms(L_BS)*.72+L_IN/rms(L_IN)*{'brass':.62,'guitar':.6,'keys':.58}[STYLE]
bw=L_WET/rms(L_WET)*.25
MG=.075
e=np.ones(NB);fo=int(.16*SR);e[-fo:]=np.linspace(1,0,fo)**1.5
dry[n0:n1]+=seg*e[:,None]*MG;wet[n0:n1]+=bw*e[:,None]*MG
