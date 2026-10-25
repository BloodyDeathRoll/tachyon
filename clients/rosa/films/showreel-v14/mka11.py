# audiov7.py -> audiov11.py: no bells anywhere, swoosh-only titles, favorites tap moved into the CLEAR cascade,
# music bed = blues track or a new synth groove (argv: v7|pop)
import re
a = open('audiov7.py').read()


def r(x, y):
    global a
    assert a.count(x) == 1, x
    a = a.replace(x, y)


r("import numpy as np, wave\n", "import numpy as np, wave, sys\nSTYLE=sys.argv[1]\n")
r("add(impact(2.2,38),0.05,.35,0,.5)\n", "")
r("    addR(whoosh(.3,True),u0-.22,.45,0,.4);addR(impact(1.0,40+k*2),u0+.02,.8,0,.4)\n"
  "    for i,f in enumerate([293.66,440,587.33]):addR(pluck(f*(1.122**k),.7,6),u0+.03+i*.02,.12,(i-1)*.4,.9)\n"
  "    addR(swish(.35),u0+.5,.3,.5,.4);addR(tick(3600,.03),u0+.78,.2,.5,.4)\n",
  "    addR(whoosh(.3,True),u0-.22,.45,0,.4);addR(swish(.35),u0+.5,.3,.5,.4)\n")
# favorites: the star tap now happens as the layers lift, and its label leads the CLEAR cascade (4 labels)
r("for k_ in range(3):add(tick(3000,.04),11.62+k_*.2,.25,.6,.5);add(pluck(1174.66*(1+.122*k_),.45,9),11.62+k_*.2,.11,.6,.9)",
  "add(tick(3200,.04),11.48,.35,.3,.4);add(bub(620),11.5,.3,.3,.3)\n"
  "for k_ in range(4):add(tick(3000,.04),11.62+k_*.2,.25,.6,.5);add(pluck(1174.66*(1+.122*k_),.45,9),11.62+k_*.2,.11,.6,.9)")
i0 = a.index("# favorites: tap the star, it fills")
i1 = a.index("addR(tick(2600,.05),U(28.6)")
a = a[:i0] + a[i1:]
# every bell goes: whole loops that only ring bells, then single bell calls
a = re.sub(r"for i,f in enumerate\(\[[^\]]*\]\):addR?\(bell\([^\n]*\n", "", a)
a = re.sub(r";?addR?\(bell\([^()]*\),[^()]*\)", "", a)
a = a.replace("\n;", "\n")
assert a.count("bell(") == 0, [l for l in a.split('\n') if 'bell(' in l]
# music bed replaces the synth groove block
i0 = a.index("# groove 3.35 .. 24.5 at 110 bpm")
i1 = a.index("# intro logo")
a = a[:i0] + open('bed11.py').read() + "\n" + a[i1:]
r("audiov7.wav", "audiov11_'+STYLE+'.wav")
open('audiov11.py', 'w').write(a)
print('ok')
