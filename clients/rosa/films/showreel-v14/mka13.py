# v9 beds (blues | synth) with the v11 swoosh cut; synth plays straight through the titles (no drop-outs)
exec(open('mka10.py').read().replace("open('audiov10.py', 'w').write(a)", "pass").replace("print('ok')", ""))
sw = open('mka12.py').read()
sw = sw[sw.index("# swooshes:"):sw.index("open('audiov12.py'")]


def r2(x, y):
    global a
    assert a.count(x) == 1, x
    a = a.replace(x, y)


exec(sw)
r2("    drop=lambda x:any(c-.04<=x<c+CD for c in COUT)\n", "    drop=lambda x:False\n")
r2("audiov10_'+STYLE+'.wav", "audiov13_'+STYLE+'.wav")
open('audiov13.py', 'w').write(a)
print('ok', a.count('whoosh('), a.count('swish('), a.count('riser('))
