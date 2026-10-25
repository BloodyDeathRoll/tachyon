# reel9.html -> reel10.html: favorites joins the CLEAR callouts as one group (first, on top, tapped while the layers lift)
s = open('reel9.html').read()


def r(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (c, a[:90])
    s = s.replace(a, b)


# slots: favorites takes the top row, the other three move down one
r('<script>\n', '<script>\nvar SL=[1,2,3,0];\n')
r('<div id="lab0" class="a lab" style="left:1250px;top:190px"><div class="i">A</div>', '<div id="lab0" class="a lab" style="left:1250px;top:390px"><div class="i">B</div>')
r('<div id="lab1" class="a lab" style="left:1250px;top:390px"><div class="i">B</div>', '<div id="lab1" class="a lab" style="left:1250px;top:590px"><div class="i">C</div>')
r('<div id="lab2" class="a lab" style="left:1250px;top:590px"><div class="i">C</div>', '<div id="lab2" class="a lab" style="left:1250px;top:790px"><div class="i">D</div>')
r('<div id="lab3" class="a lab" style="left:1250px;top:790px"><div class="i">D</div>', '<div id="lab3" class="a lab" style="left:1250px;top:190px"><div class="i">A</div>')
r("for(let k=0;k<4;k++)set('lab'+k,{left:'auto',right:'90px',top:L.lab(k)+'px',textAlign:'right'});",
  "for(let k=0;k<4;k++)set('lab'+k,{left:'auto',right:'90px',top:L.lab(SL[k])+'px',textAlign:'right'});")
# the three page callouts follow the favorites one in the same cascade
r("for(let k=0;k<3;k++){const lb=$('lab'+k),a=T.ex0+.42+k*.2,o=T.col0-.08+k*.04;",
  "for(let k=0;k<3;k++){const lb=$('lab'+k),a=T.ex0+.42+(k+1)*.2,o=T.col0-.08+(k+1)*.04;")
r("ly=L.lab(k)+52", "ly=L.lab(SL[k])+52")
# one finger: taps the star as the layers lift, then slides down to scrub the days
r("const t2=$('touch2'),r2=$('ring2');const ta=E.o3(P(t,T.scrub0-.3,T.scrub0-.1))*(1-P(t,T.scrub1+.05,T.scrub1+.2));\n"
  "  op(t2,ta);tf(t2,`translate(${40+56*dk}px,${track([[T.scrub0-.3,300],[T.scrub0-.05,215,E.o3]],t)}px) scale(${1-.16*P(t,T.scrub0-.1,T.scrub0)})`);",
  "const t2=$('touch2'),r2=$('ring2');const TP=T.ex0+.3;const ta=E.o3(P(t,TP-.32,TP-.14))*(1-P(t,T.scrub1+.05,T.scrub1+.2));\n"
  "  const pre=t<T.scrub0-.1,tx2=pre?track([[TP-.32,180],[TP-.02,236,E.o4],[TP+.25,236],[T.scrub0-.1,40]],t):40+56*dk,ty2=pre?track([[TP-.32,190],[TP-.02,75,E.o4],[TP+.25,75],[T.scrub0-.1,215]],t):215;\n"
  "  op(t2,ta);tf(t2,`translate(${tx2}px,${ty2}px) scale(${1-.2*Math.sin(Math.PI*P(t,TP-.06,TP+.1))-.16*P(t,T.scrub0-.1,T.scrub0)})`);")
# favorites beat on the content clock
i0 = s.index("function favBeat(t){")
i1 = s.index("const OPS=")
s = s[:i0] + r'''function favBeat(t){
 const fs=$('favStar');if(!fs)return;
 const onS=t>=10.88;fs.style.display=onS?'block':'none';
 const TP=T.ex0+.3;
 const fill=t<TP?0:E.oB(P(t,TP,TP+.3),2.4);
 tf($('favFill'),`scale(${fill})`);op($('favFill'),t<TP?0:1);
 [...document.querySelectorAll('.fb')].forEach((d,i)=>{const p=P(t,TP,TP+.53);const a=i/8*6.283;tf(d,`translate(${Math.cos(a)*30*E.o3(p)}px,${Math.sin(a)*30*E.o3(p)}px) scale(${1-p})`);op(d,p>0&&p<1?1:0)});
 const rq=P(t,TP,TP+.48);op($('favRing'),rq>0&&rq<1?1-rq:0);tf($('favRing'),`scale(${.6+rq*1.8})`);
 // label A + connector: first of the four, exits with the others
 const lb=$('lab3'),a=T.ex0+.42,o=T.col0-.08;
 op(lb,t>a-.05&&t<o+.5?1:0);maskIn(lb,t,a,0,.6,o);
 const ii=lb.querySelector('.i'),ss=lb.querySelector('.s');op(ii,E.o3(P(t,a,a+.3))*(1-P(t,o,o+.2)));op(ss,E.o3(P(t,a+.15,a+.5))*(1-P(t,o,o+.2)));tf(ss,`translateY(${14*(1-E.o5(P(t,a+.15,a+.6)))}px)`);
 const p=$('cp3'),c1=$('cd3'),c2=$('ce3');
 if(t>a-.15&&t<T.col1){const r=$('an3').getBoundingClientRect();const cz=PHZ;const ax=(r.left-W/2-cz.x)/cz.s+W/2,ay=(r.top-H/2-cz.y)/cz.s+H/2;const lx=VERT?1000:1226,ly=L.lab(SL[3])+52;
  const d=E.io3(P(t,a-.12,a+.35)),e=E.i3(P(t,o-.05,o+.25));const mx=lerp(ax,lx,.55);
  const bx=VERT?1009:mx;p.setAttribute('d',`M${ax},${ay} L${bx},${ay} L${bx},${ly} L${lx},${ly}`);const LL=p.getTotalLength();p.style.strokeDasharray=LL;p.style.strokeDashoffset=LL*(1-d)-LL*e;op(p,.8);
  c1.setAttribute('cx',ax);c1.setAttribute('cy',ay);c2.setAttribute('cx',lx);c2.setAttribute('cy',ly);op(c1,P(t,a-.12,a-.02)*(1-e));op(c2,P(t,a+.22,a+.3)*(1-P(t,o,o+.2)))}
 else{op(p,0);op(c1,0);op(c2,0)}
}
''' + s[i1:]
open('reel10.html', 'w').write(s)
print('ok', len(s))
