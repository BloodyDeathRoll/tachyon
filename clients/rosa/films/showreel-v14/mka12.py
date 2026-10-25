# audiov11 chain -> audiov12.py: fewer swooshes, music bed from bed12.py (argv: brass|guitar|keys)
exec(open('mka11.py').read().replace("open('audiov11.py', 'w').write(a)", "pass").replace("print('ok')", ""))


def r2(x, y):
    global a
    assert a.count(x) == 1, x
    a = a.replace(x, y)


a = a.replace(open('bed11.py').read(), open('bed12.py').read())
r2("audiov11_'+STYLE+'.wav", "audiov12_'+STYLE+'.wav")
# swooshes: keep the intro one, one per title (in only, softer), the clutter swipe and the closing iris; the rest go
r2("add(riser(.8,150,1200),2.5,.26,0,.4);add(whoosh(.8,True),2.5,.5,0,.4)\n", "")
r2("add(swish(.5),5.4,.3,.4,.4);add(bub(700)", "add(bub(700)")
r2("add(whoosh(.5,True),7.0,.35,0,.5)\n", "")
r2("add(whoosh(.4,False),10.3,.35,0,.4)\n", "")
r2(";add(whoosh(.4,True),10.85,.35,-.2,.4)", "")
r2("add(riser(.8,150,900),11.15,.2,0,.4);add(whoosh(.85,None,200,6000),11.15,.4,0,.5)\n", "")
r2("add(whoosh(.55,False,200,6000),14.1,.4,0,.4);", "")
r2("add(whoosh(.55,True,300,11000),16.75,.6,.4,.4);add(swish(.5),16.9,.45,.6,.4)", "add(whoosh(.55,True,300,11000),16.75,.35,.4,.4)")
r2("add(whoosh(.5,False),19.7,.35,-.5,.4)\n", "")
r2("add(riser(.7,120,700),19.6,.2,0,.5);add(whoosh(.8,None,150,5000),20.0,.45,-.1,.6);", "")
r2("add(whoosh(.6,True),24.0,.4,0,.5)", "add(whoosh(.6,True),24.0,.28,0,.5)")
r2("    addR(whoosh(.3,True),u0-.22,.45,0,.4);addR(swish(.35),u0+.5,.3,.5,.4)\n", "    addR(whoosh(.3,True),u0-.22,.28,0,.4)\n")
open('audiov12.py', 'w').write(a)
print('ok', a.count('whoosh('), a.count('swish('), a.count('riser('))
