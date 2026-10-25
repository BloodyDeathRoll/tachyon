# reel11.html -> reel12.html: closing = accelerating zoom into the spinning globe, then the wave footage fades in; no "Showreel" label
s = open('reel11.html').read()


def r(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (c, a[:90])
    s = s.replace(a, b)


r('<div class="a hud" style="right:60px;top:48px">Showreel &nbsp;<span id="hTc"', '<div class="a hud" style="right:60px;top:48px"><span id="hTc"')
r("  const R=lerp(6,L.gl.R,k),gx=lerp(W/2,L.gl.x,E.o4(P(t,T.g0,T.g0+.85))),gy=lerp(H/2,L.gl.y,k);\n",
  "  const Z=E.i3(P(t,T.gOut,T.iris1+.35)),zc=E.io3(P(t,T.gOut,T.iris1));\n"
  "  const R=lerp(6,L.gl.R,k)*Math.pow(4.2,Z),gx=lerp(lerp(W/2,L.gl.x,E.o4(P(t,T.g0,T.g0+.85))),W/2,zc),gy=lerp(lerp(H/2,L.gl.y,k),H/2,zc);\n")
r("  const cl2=E.io3(P(t,T.iris1,T.iris1+.45));globe(gx,gy,R*(1-cl2),lon+220*cl2,lat,day,P(t,T.g0,T.g0+.12)*(1-P(t,T.iris1+.3,T.iris1+.45)));\n",
  "  globe(gx,gy,R,lon+260*Math.pow(Z,2.2),lat,day,P(t,T.g0,T.g0+.12)*(1-P(t,T.iris1+.3,T.iris1+.45)));\n")
r("const fc=$('ftC');const showCl=t>=T.iris0;", "const fc=$('ftC');const showCl=t>=T.iris1-.15;")
r("  const cl2=E.io3(P(t,T.iris1,T.iris1+.45));const hole=lerp(lerp(2300,L.gl.R*1.04,k),0,cl2);fc.style.clipPath='none';const mk=hole>.5?`radial-gradient(circle at ${L.gl.x}px ${L.gl.y}px, transparent ${hole}px, #000 ${hole+1.5}px)`:'none';fc.style.webkitMaskImage=mk;fc.style.maskImage=mk;\n"
  "  cover(fc,$('ftCi'),0,0,W,H,0,lerp(1.2,1.04,E.o3(P(t,T.iris0,T.iris1+.6)))+.03*P(t,T.iris1,30));\n",
  "  fc.style.clipPath='none';fc.style.webkitMaskImage=fc.style.maskImage='none';op(fc,E.io3(P(t,T.iris1-.15,T.iris1+.4)));\n"
  "  cover(fc,$('ftCi'),0,0,W,H,0,lerp(1.25,1.04,E.o3(P(t,T.iris1-.15,T.iris1+1)))+.03*P(t,T.iris1,30));\n")
r(" const ls=Math.min(3.4,Math.max(1.3,R*.0062));"," const zf=Math.max(1,R/L.gl.R)**.7,ls=Math.min(3.4*zf,Math.max(1.3,R*.0062));")
r(" const ss=Math.min(4.2,Math.max(1.4,R*.0058));"," const ss=Math.min(4.2*zf,Math.max(1.4,R*.0058));")
open('reel12.html', 'w').write(s)
print('ok')
