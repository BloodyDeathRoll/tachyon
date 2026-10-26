# music bed: from the first beat after the FAST card to the closing hit
m0=U(3.35)/SP;m1=U(24.55)/SP;n0=int(m0*SR);n1=int(m1*SR);NB=n1-n0
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
    drop=lambda x:any(c-.04<=x<c+CD for c in COUT)
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
