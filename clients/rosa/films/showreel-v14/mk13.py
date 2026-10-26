# reel12.html -> reel13.html: light theme keeps tag/button text white on color
s = open('reel12.html').read()
a = "body.light #eWord{text-shadow:none!important}"
assert s.count(a) == 1
s = s.replace(a, a + "\nbody.light #ctaB,body.light #bPill{color:#fff!important}")
open('reel13.html', 'w').write(s)
print('ok')
