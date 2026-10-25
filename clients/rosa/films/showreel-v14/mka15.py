# audiov14 -> audiov15: swooshes only on the five step titles; the closing hit + music end move onto the wave fade-in
exec(open('mka14.py').read().replace("open('audiov14.py', 'w').write(a)", "pass").replace("print('ok', [l for l in a.split('\\n') if ('whoosh(' in l or 'riser(' in l or 'swish(' in l) and 'def ' not in l])", ""))
r2(";addR(whoosh(.35,True),.75,.25,0,.4)", "")
r2("add(impact(2.2,36.71),24.55,", "add(impact(2.2,36.71),25.3,")
r2("2400),24.55,.5,0,.8)", "2400),25.3,.5,0,.8)")
r2("m1=U(24.55)/SP", "m1=U(25.3)/SP")
r2("audiov14_'+STYLE+'.wav", "audiov15_'+STYLE+'.wav")
open('audiov15.py', 'w').write(a)
print('ok', [l.strip()[:90] for l in a.split('\n') if ('whoosh(' in l or 'riser(' in l or 'swish(' in l) and 'def ' not in l])
