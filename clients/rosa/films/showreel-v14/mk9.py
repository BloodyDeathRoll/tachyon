# reel8.html -> reel9.html: the phone floats in 3D for the whole film (like the original showreel)
s = open('reel8.html').read()


def r(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (c, a[:90])
    s = s.replace(a, b)


# an anchor inside the phone, so overlays can read where a phone point lands after the 3D tilt
r('<div id="pw"><div id="phone">', '<div id="pw"><div id="phone"><div id="s2a" class="a" style="width:1px;height:1px;left:0;top:0"></div>')
r("const S2=(x,y)=>[PH.x+(x-195)*PH.s,PH.y+(y-422)*PH.s];",
  "const S2=(x,y)=>{const a=$('s2a');a.style.left=x+'px';a.style.top=y+'px';const r=a.getBoundingClientRect(),cz=PHZ;return[(r.left-W/2-cz.x)/cz.s+W/2,(r.top-H/2-cz.y)/cz.s+H/2]};")
# float: a slow tilt toward the copy on the right, off for the footage morph and the exploded view
r(" return{x,y,s,rx,ry,rz}}",
  " const fw=t<T.col0?E.io3(P(t,3.45,4.7))*(1-E.io3(P(t,T.tap-.35,T.ex0))):E.io3(P(t,T.col0+.15,T.col1+.7));\n"
  " ry+=fw*FL.ry*(1+.32*Math.sin(UU*.42+.6));rx+=fw*FL.rx*(1+.45*Math.sin(UU*.31+1.3));rz+=fw*(FL.rz+1.1*Math.sin(UU*.27+2.1));y+=fw*7*Math.sin(UU*.5+.4);\n"
  " return{x,y,s,rx,ry,rz}}")
r("let TN=0,FQ=-1,PHZ={x:0,y:0,s:1};", "let TN=0,FQ=-1,PHZ={x:0,y:0,s:1},UU=0;const FL={ry:24,rx:8,rz:-3};")
r(" const u=x*SPEED;\n", " const u=x*SPEED;UU=u;\n")
# the phone transform must be set before anything reads the anchor
r(" PH=pose(t);\n", " PH=pose(t);tf(phone,`translate(${PH.x}px,${PH.y}px) rotateX(${PH.rx}deg) rotateY(${PH.ry}deg) rotateZ(${PH.rz}deg) scale(${PH.s})`);\n")
open('reel9.html', 'w').write(s)
print('ok', len(s))
