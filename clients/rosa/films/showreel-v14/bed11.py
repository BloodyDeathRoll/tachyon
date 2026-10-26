# music bed (argv): v7 = the v7 synth groove as it was; pop = a party beat after the Popping Bottles reference
m0=U(3.35)/SP;m1=U(24.55)/SP;n0=int(m0*SR);n1=int(m1*SR);NB=n1-n0
if STYLE=='v7':
    exec(open('groove_v7.txt').read())
else:
    bpm=99.38;bt=60/bpm;st=bt/4;bar=4*bt;nbar=int(np.ceil((m1-m0)/bar))
    seg=np.zeros((NB,2));bw=np.zeros((NB,2))
    def put(buf,x,at,g=1.,pan=0.):
        i=int(at*SR)
        if i<0 or i>=NB:return
        x=x[:NB-i];buf[i:i+len(x),0]+=x*g*np.sqrt(.5*(1-pan));buf[i:i+len(x),1]+=x*g*np.sqrt(.5*(1+pan))
    mf=lambda m:440*2**((m-69)/12)
    def k808(f,d=.5,gl=0):
        t=tt(d);fr=f*(1+1.8*np.exp(-t*40))+gl*t;x=np.sin(2*np.pi*np.cumsum(fr)/SR)*np.exp(-t*4.5)
        return np.tanh(x*2.2)/np.tanh(2.2)*np.minimum(1,t/.002)
    def kk():
        t=tt(.22);return kick(.22,52,150,38)+band(noise(.012),1500,8000)[:len(t)]*.0 if False else np.concatenate([band(noise(.006),2000,9000)*.5,np.zeros(int(.214*SR))])[:int(.22*SR)]+kick(.22,52,150,38)
    def hey():
        d=.24;t=tt(d);out=np.zeros(len(t))
        for v,(f0,dt) in enumerate([(205,0),(176,.008),(232,.014),(190,.02)]):
            f=f0*(1+.06*np.exp(-t*12))-18*t;ph=np.cumsum(f)/SR;saw=2*(ph%1)-1
            src=saw+.35*band(noise(d),300,6000)
            vo=sum(g*band(src,c*.85,c*1.15) for c,g in [(700,1),(1850,.7),(2700,.35)])
            sh=int(dt*SR);vo=np.concatenate([np.zeros(sh),vo])[:len(t)];out+=vo
        e=np.minimum(1,t/.012)*np.exp(-t*9);return out*e/3
    def ghost():return band(noise(.07),900,6000)*np.exp(-tt(.07)*55)
    def ohat():return fade(band(noise(.28),6500,15000)*np.exp(-tt(.28)*9),.002,.04)
    def stab(ms,d=.14):
        t=tt(d);y=np.zeros(len(t))
        for m in ms:
            for det in(-.12,0,.12):
                f=mf(m+det);ph=np.cumsum(np.full(len(t),f))/SR;y+=2*(ph%1)-1
        y=band(y,180,3800);return fade(y*np.exp(-t*14),.003,.03)/len(ms)/3
    def pop():
        t=tt(.09);f=520*(1+1.4*np.exp(-t*60));x=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*45)
        return x+band(noise(.09),1200,7000)*np.exp(-t*90)*.6
    KP=[[0,3,10,13,15],[0,3,10]]
    BASS=[[34,34,34,37,32],[34,34,39]]
    for b in range(nbar):
        b0=b*bar;full=b>=1
        for j,s_ in enumerate(KP[b%2]):
            put(seg,kk(),b0+s_*st,.62);put(seg,k808(mf(BASS[b%2][j]),.26 if s_<15 else .16),b0+s_*st,.3)
        for s_ in(4,12):put(seg,clap(),b0+s_*st,.42,.05);put(seg,band(noise(.16),180,5000)*np.exp(-tt(.16)*22)+np.sin(2*np.pi*190*tt(.16))*np.exp(-tt(.16)*30),b0+s_*st,.22);put(seg,hey(),b0+s_*st+.004,.5,-.08);put(bw,hey(),b0+s_*st,.3)
        if full:
            for s_ in(7,9,10,15):put(seg,ghost(),b0+s_*st,.13,.2)
        for s_ in range(16):
            if s_==14 and b%2:put(seg,ohat(),b0+s_*st,.09,.3);continue
            put(seg,hat(.035,7000),b0+s_*st,[.34,.15,.24,.16][s_%4]*(1 if full else .6),(.35 if s_%2 else -.15))
            if s_%2==0:put(seg,fade(band(noise(.09),4000,12000)*np.exp(-tt(.09)*30),.004,.02),b0+s_*st+.01,.14,-.3)
        if b%4==3 or b0+m0>((INTRO+CARDS[3]+CARD*3)/SP):
            for s_ in(0,2,4,8,10,12):put(seg,stab([58,61,65,70]),b0+s_*st,.15,.15);put(bw,stab([58,61,65,70]),b0+s_*st,.12)
    put(seg,pop(),0,.4,.3)
    irn=int(.45*SR);ir=band(rng.standard_normal(irn),300,9000)*np.exp(-np.arange(irn)/SR*9);ir[:int(.008*SR)]=0
    for c in range(2):
        nn=NB+irn;seg[:,c]+=np.fft.irfft(np.fft.rfft(seg[:,c],nn)*np.fft.rfft(ir,nn),nn)[:NB]*.012
    MG=.95
    e=np.ones(NB);fo=int(.16*SR);e[-fo:]=np.linspace(1,0,fo)**1.5
    dry[n0:n1]+=seg*e[:,None]*MG;wet[n0:n1]+=bw*e[:,None]*MG
