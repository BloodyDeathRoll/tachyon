# audiov7.py -> audiov9.py: swoosh-only title cards, one bell in the intro, a real music bed (argv: rock|techno)
a = open('audiov7.py').read()


def r(x, y):
    global a
    assert a.count(x) == 1, x
    a = a.replace(x, y)


r("import numpy as np, wave\n", "import numpy as np, wave, sys\nSTYLE=sys.argv[1]\n")
# intro: the logo keeps its bells; the question lands on the whoosh alone (no second bell, no boom)
r("add(impact(2.2,38),0.05,.35,0,.5)\n", "")
r("add(bell(587.33,1.8),.6,.12,0,.9);add(bell(880,1.6),.66,.07,.3,.9)\n", "")
# title cards: whoosh in, swish out, nothing else
r("    addR(whoosh(.3,True),u0-.22,.45,0,.4);addR(impact(1.0,40+k*2),u0+.02,.8,0,.4)\n"
  "    for i,f in enumerate([293.66,440,587.33]):addR(pluck(f*(1.122**k),.7,6),u0+.03+i*.02,.12,(i-1)*.4,.9)\n"
  "    addR(swish(.35),u0+.5,.3,.5,.4);addR(tick(3600,.03),u0+.78,.2,.5,.4)\n",
  "    addR(whoosh(.3,True),u0-.22,.45,0,.4);addR(swish(.35),u0+.5,.3,.5,.4)\n")
# music: the synth groove is replaced by a track, from the first beat to the closing hit
i0 = a.index("# groove 3.35 .. 24.5 at 110 bpm")
i1 = a.index("# intro logo")
a = a[:i0] + '''# music bed: a real track, entering on a section start, out on the closing hit
MUS={'rock':('mus_rock.wav',75.30,.58),'techno':('mus_techno.wav',63.45,.50)}[STYLE]
mw=wave.open(MUS[0]);mx=np.frombuffer(mw.readframes(mw.getnframes()),'<i2').reshape(-1,2)/32768;assert mw.getframerate()==SR
m0=U(3.35)/SP;m1=U(24.55)/SP;n0=int(m0*SR);n1=int(m1*SR);seg=mx[int(MUS[1]*SR):int(MUS[1]*SR)+n1-n0].copy()
e=np.ones(len(seg));fi=int(.006*SR);fo=int(.16*SR);e[:fi]=np.linspace(0,1,fi);e[-fo:]=np.linspace(1,0,fo)**1.5
dry[n0:n1]+=seg*e[:,None]*MUS[2]

''' + a[i1:]
r("audiov7.wav", "audiov9_'+STYLE+'.wav")
open('audiov9.py', 'w').write(a)
print('ok')
