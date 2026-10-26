# reel7.html -> reel8.html: one film, ?theme=light and ?ar=916 switches
s = open('reel7.html').read()


def r(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (c, a[:90])
    s = s.replace(a, b)


# ---------------------------------------------------------------- config
r("const W=1920,H=1080,$=id=>document.getElementById(id);", r"""const Q=new URLSearchParams(location.search),LIGHT=Q.get('theme')=='light',VERT=Q.get('ar')=='916';
const W=VERT?1080:1920,H=VERT?1920:1080,$=id=>document.getElementById(id);
if(LIGHT)document.body.classList.add('light');if(VERT)document.body.classList.add('vert');
const C=LIGHT?{fg:'#0d1225',tabOn:'#0d1225',tabOff:'#57534e',p1:'#0d122580',p0:'#0d122533',nl:'#5b6178',nl2:'#5b617870',grid:'#0d122512',ct:'#0d122570',sk1:'#e6e6ea',sk2:'#ececf0',shim:'rgba(13,18,37,.05)',page:'#f4f3f3',head:'#fcfcfc',tex:'texL/',st:'#0d1225'}
 :{fg:'#f5f0e8',tabOn:'#f5f0e8',tabOff:'#6f7590',p1:'#f5f0e870',p0:'#f5f0e830',nl:'#acb4d2',nl2:'#acb4d270',grid:'#ffffff10',ct:'#f5f0e855',sk1:'#16171d',sk2:'#111218',shim:'rgba(255,255,255,.07)',page:'#060607',head:'#0e0f13',tex:'tex/',st:'#f5f0e8'};
// layout per aspect
const L=VERT?{ph:{x:540,y:690,s:1.1,freeDx:0,ex:520,ey:720,es:.9,exitX:-560},pill:{x:100,y:1285},hy:1650,gl:{x:540,y:660,R:400},chart:{x:110,y:1410},cardW:860,cardY:820,
  lab:k=>[1220,1370,1520,1670][k],intro:{y:930},frO:'540px 150px'}
 :{ph:{x:600,y:548,s:1.08,freeDx:-40,ex:700,ey:612,es:.96,exitX:-420},pill:{x:930,y:290},hy:905,gl:{x:640,y:560,R:370},chart:{x:1180,y:470},cardW:1180,cardY:410,
  lab:k=>[190,390,590,790][k],intro:{y:430},frO:'590px 200px'};
// full-frame elements follow the canvas size
document.documentElement.style.width=document.body.style.width=W+'px';document.documentElement.style.height=document.body.style.height=H+'px';
document.querySelectorAll('[style]').forEach(e=>{if(e.style.width=='1920px')e.style.width=W+'px';if(e.style.height=='1080px')e.style.height=H+'px'});
['bg','fx'].forEach(id=>{$(id).width=W;$(id).height=H});$('con').setAttribute('width',W);$('con').setAttribute('height',H);
$('grain').width=W/2;$('grain').height=H/2;
['stage','cam','pw'].forEach(id=>{$(id).style.width=W+'px';$(id).style.height=H+'px'});
$('cam').style.transformOrigin=$('fx').style.transformOrigin=`${W/2}px ${H/2}px`;$('pw').style.perspectiveOrigin=`${W/2}px ${H/2}px`;
$('prog').style.width=W+'px';
if(LIGHT){$('fBox').innerHTML=$('fBox').innerHTML.replace(/#ffffff14/g,'#0d122514').replace(/#f5f0e860/g,'#0d122560').replace(/#f5f0e8a0/g,'#0d1225a0');
 $('bSub').innerHTML='<span class="mask"><span>16 s W swell &nbsp;&middot;&nbsp; 4 km/h NNE <b style="color:#24b161;font-weight:650">offshore</b></span></span>'}
if(VERT){const set=(id,o)=>Object.assign($(id).style,o);
 set('fBox',{left:'110px',top:'1230px'});
 set('bEy',{left:'110px',top:'1250px'});set('bNum',{left:'100px',top:'1500px'});set('bSub',{left:'110px',top:'1705px',fontSize:'30px'});
 for(const id of ['frCh','frNum','frSub','frChips'])set(id,{left:'0px',width:W+'px'});
 set('frCh',{top:'1230px'});set('frNum',{top:'1262px',fontSize:'300px'});set('frSub',{top:'1610px',fontSize:'32px'});set('frChips',{top:'1690px',flexWrap:'wrap',padding:'0 70px'});
 set('oCh',{left:'auto',right:'90px',top:'1165px'});
 for(let k=0;k<4;k++)set('lab'+k,{left:'auto',right:'90px',top:L.lab(k)+'px',textAlign:'right'});
 set('nCh',{left:'110px',top:'1230px'});set('nList',{left:'110px',top:'1295px',transform:'scale(.86)',transformOrigin:'0 0'});
 set('nBig',{left:'100px',top:'1300px',fontSize:'140px'});set('nSub',{left:'110px',top:'1635px',width:'880px',whiteSpace:'normal',lineHeight:'1.35'});
 set('gCh',{left:'110px',top:'1110px'});set('gNum',{left:'102px',top:'1140px',fontSize:'160px'});set('gSub',{left:'110px',top:'1320px',fontSize:'32px'});
 set('chart',{left:L.chart.x+'px',top:L.chart.y+'px'});set('gChips',{left:'110px',top:'1735px',width:'880px'});
 set('oEy',{top:'820px'});set('oQ',{top:'862px',fontSize:'118px'});
 set('iMark',{top:'852px'});set('iWord',{top:'828px'});
 set('eMark',{top:'700px',width:'170px',height:'185px'});set('eWord',{top:'676px',fontSize:'228px'});set('cta',{top:'990px'});set('eUrl',{top:'1130px'});
 $('prog').style.bottom='auto';$('prog').style.top='100px';
}
""")

# light CSS
r("</style>\n</head>", """
body.light{color:#0d1225}
body.light,body.light #stage{background:#f4f3f3}
body.light .ey{color:#17171c80}body.light .mut{color:#17171c80}body.light .hud{color:#0d122590}
body.light .chap b{color:#0d1225}body.light .sub2{color:#3d4256c8}body.light .sub2 b{color:#0d1225}
body.light #prog span{color:#0d122540}body.light .nl{color:#5b6178}body.light .lab .s{color:#3d4256b0}
body.light .chip{background:#ffffffe0;box-shadow:0 0 0 1px #0d122514 inset,0 10px 28px rgba(13,18,37,.08)}
body.light #body{background:linear-gradient(145deg,#f3f4f6,#c9ccd3 40%,#e8e9ec 70%,#b9bcc4);box-shadow:0 0 0 1.5px #ffffff inset,0 0 0 10px #0b0c10 inset,0 50px 110px rgba(13,18,37,.26),0 12px 30px rgba(13,18,37,.12)}
body.light .edge{background:#c4c7ce!important}body.light .btn{background:#b7bac2}
body.light #base{background:#f4f3f3;background-image:linear-gradient(#0d122509 1px,transparent 1px),linear-gradient(90deg,#0d122509 1px,transparent 1px)}
body.light #tabs{background:#fff;box-shadow:0 8px 26px rgba(0,0,0,.16)}
body.light .touch{background:rgba(13,18,37,.22);border:2px solid rgba(255,255,255,.95);box-shadow:0 4px 18px rgba(13,18,37,.25)}
body.light .slab{box-shadow:0 0 0 1px rgba(13,18,37,.12) inset,0 0 40px rgba(17,183,242,.10)}
body.light #status{color:#0d1225}
body.light #home{background:#f4f3f3!important}
body.light #vig{background:radial-gradient(ellipse at center,transparent 58%,rgba(13,18,37,.10) 100%)!important}
body.light #fade{background:#f4f3f3!important}
body.light #iBg{background:radial-gradient(ellipse at 50% 45%,rgba(244,243,243,.62),rgba(244,243,243,.95) 70%)!important}
body.light #ftB>div.a{background:linear-gradient(90deg,rgba(244,243,243,.72),rgba(244,243,243,.84) 45%,rgba(244,243,243,.78))!important}
body.light #ftCo{background:radial-gradient(ellipse at 50% 46%,rgba(244,243,243,.42),rgba(244,243,243,.8) 75%)!important}
body.light #eWord{text-shadow:none!important}
body.light #oQ{color:#f5f0e8}
body.light #cs{color:#0d1225a0!important}body.light #hTc{color:#0d1225!important}
</style>
</head>""")

# hero data for the light captures
r('<script src="hero.js"></script>', '<script src="hero.js"></script><script src="heroL.js"></script>')
r("const DAYT=DAYS.slice(0,7).map(", "const DAYT=(LIGHT?DAYSL:DAYS).slice(0,7).map(")

# ---------------------------------------------------------------- theme literals
r("background-image:url(tex/${file})", "background-image:url(${C.tex}${file})")
r("background:url(tex/hc${k}.png)", "background:url(${C.tex}hc${k}.png)")
s = s.replace('fill="#f5f0e8"', 'fill="${C.st}"').replace('stroke="#f5f0e888"', 'stroke="${C.st}88"').replace('fill="#f5f0e888"', 'fill="${C.st}88"').replace('fill="#f5f0e855"/></svg>', 'fill="${C.st}55"/></svg>')
r("background:#16171d", "background:${C.sk1}")
r("background:#111218", "background:${C.sk2}", 3)
r("rgba(255,255,255,.07) 50%,transparent 70%)", "${C.shim} 50%,transparent 70%)")
r("background:#060607", "background:${C.page}", 3)
r("background:#0e0f13", "background:${C.head}")
r("$('tab'+k).style.color=k==i?'#f5f0e8':'#6f7590'", "$('tab'+k).style.color=k==i?C.tabOn:C.tabOff")
r("$('fNum').style.color=t>=T.ld1?'#f5f0e8':'#11b7f2';", "$('fNum').style.color=t>=T.ld1?C.fg:'#11b7f2';")
r("$('pg'+i).style.color=on?'#11b7f2':t>=CHT[i+1]?'#f5f0e870':'#f5f0e830'", "$('pg'+i).style.color=on?'#11b7f2':t>=CHT[i+1]?C.p1:C.p0")
r("n.style.color=st>.5?'#acb4d270':'#acb4d2';", "n.style.color=st>.5?C.nl2:C.nl;")
r('stroke="#ffffff10"/>', 'stroke="${C.grid}"/>')
s = s.replace('fill="#f5f0e855" font-size="13"', 'fill="${C.ct}" font-size="13"')
r('<b style="color:#f5f0e8;font-weight:650">${h[0]', '<b style="color:${C.fg};font-weight:650">${h[0]')
r("text-align:center;color:#f5f0e8\">${dLbl(", "text-align:center;color:${C.fg}\">${dLbl(")
r("bk.style.backdropFilter=`blur(${18*bl}px) brightness(${1-.45*bl})`;",
  "bk.style.backdropFilter=LIGHT?`blur(${18*bl}px) brightness(${1+.03*bl})`:`blur(${18*bl}px) brightness(${1-.45*bl})`;if(LIGHT)bk.style.background=`rgba(244,243,243,${.5*bl})`;")

# sky / ocean / globe in light
r("function sky(t,hy,dawn,sunX,sunY,phx,phy,pha){", """function sky(t,hy,dawn,sunX,sunY,phx,phy,pha){
 if(LIGHT){const gd=g.createLinearGradient(0,0,0,H);gd.addColorStop(0,'#f7f6f5');gd.addColorStop(1,'#e7edf2');g.fillStyle=gd;g.fillRect(0,0,W,H);
  const gl=(x,y,r,c)=>{const q=g.createRadialGradient(x,y,0,x,y,r);q.addColorStop(0,c);q.addColorStop(1,'rgba(244,243,243,0)');g.fillStyle=q;g.fillRect(x-r,y-r,2*r,2*r)};
  gl(W*.12+Math.sin(t*.4)*60,H*.3,W*.45,'rgba(17,183,242,.10)');gl(W*.85,H*.75,W*.45,'rgba(36,177,97,.07)');if(pha>0)gl(phx,phy,700,`rgba(17,140,220,${.10*pha})`);return}""")
r("const N=44,zN=1,zF=30,K=(H-hy+110)*zN,oc=mix([3,5,9],[10,16,34],dawn);", "const N=44,zN=1,zF=30,K=(H-hy+110)*zN,oc=LIGHT?[228,235,241]:mix([3,5,9],[10,16,34],dawn);")
r("const xw=(sx-960)/620*z;", "const xw=(sx-W/2)/620*z;")
r("g.lineTo(W+60,H+10);g.closePath();g.fillStyle=rgb(mix(oc,[14,24,48],u*.5*dawn));g.fill();",
  "g.lineTo(W+60,H+10);g.closePath();g.fillStyle=rgb(LIGHT?mix(oc,[214,226,236],u):mix(oc,[14,24,48],u*.5*dawn));g.fill();")
r("const lc=mix(mix([40,150,215],[255,196,150],dawn*(1-u)),[17,183,242],u*.35);", "const lc=LIGHT?[17,120,190]:mix(mix([40,150,215],[255,196,150],dawn*(1-u)),[17,183,242],u*.35);")
r("g.strokeStyle=rgb(mix([120,190,235],[255,220,180],dawn),.5*dim);", "g.strokeStyle=LIGHT?rgb([17,120,190],.25*dim):rgb(mix([120,190,235],[255,220,180],dawn),.5*dim);")
r("const BRGB=[[93,252,159],[36,177,97],[17,183,242],[110,143,184],[69,77,104]];",
  "const BRGB=LIGHT?[[12,103,51],[36,177,97],[17,183,242],[110,143,184],[185,192,207]]:[[93,252,159],[36,177,97],[17,183,242],[110,143,184],[69,77,104]];")
r("rim.addColorStop(0,'rgba(60,170,255,.34)');rim.addColorStop(1,'rgba(60,170,255,0)');",
  "rim.addColorStop(0,LIGHT?'rgba(17,140,220,.22)':'rgba(60,170,255,.34)');rim.addColorStop(1,'rgba(60,170,255,0)');")
r("bd.addColorStop(0,'rgb(18,30,54)');bd.addColorStop(.6,'rgb(7,11,21)');bd.addColorStop(1,'rgb(3,5,10)');",
  "if(LIGHT){bd.addColorStop(0,'#ffffff');bd.addColorStop(.6,'#e8eef5');bd.addColorStop(1,'#cfdbe8')}else{bd.addColorStop(0,'rgb(18,30,54)');bd.addColorStop(.6,'rgb(7,11,21)');bd.addColorStop(1,'rgb(3,5,10)')}")
r("f.strokeStyle='rgba(140,170,230,.07)';f.lineWidth=1;", "f.strokeStyle=LIGHT?'rgba(13,40,90,.08)':'rgba(140,170,230,.07)';f.lineWidth=1;")
r("f.fillStyle=`rgba(160,180,230,${.16+.5*p[2]})`;", "f.fillStyle=LIGHT?`rgba(40,62,104,${.2+.45*p[2]})`:`rgba(160,180,230,${.16+.5*p[2]})`;")
r(" f.globalCompositeOperation='lighter';\n const ss=", " f.globalCompositeOperation=LIGHT?'source-over':'lighter';\n const ss=")
r("c=mix(BRGB[q.b],[255,255,255],fr*.9)", "c=mix(BRGB[q.b],LIGHT?[17,183,242]:[255,255,255],fr*.9)")
r("s=ss*(q.b==0?1.15:1)*(1+2.4*fr)*(.6+.4*p[2]);","s=ss*(q.b==0?1.15:1)*(1+(LIGHT?1.0:2.4)*fr)*(.6+.4*p[2]);")
r("if(fr>.2){f.fillStyle=rgb([17,183,242],.08*fr*p[2]);","if(fr>.2&&!LIGHT){f.fillStyle=rgb([17,183,242],.08*fr*p[2]);")
r("f.fillStyle=rgb(c,(q.b>2?.45:.72)*(.35+.65*p[2]));", "f.fillStyle=rgb(c,(q.b>2?(LIGHT?.55:.45):(LIGHT?.9:.72))*(.35+.65*p[2]));")

# ---------------------------------------------------------------- layout literals
r("""const phone=$('phone');let PH={x:600,y:548,s:1.08};
function pose(t){let x=600,y=548,s=1.08,rx=0,ry=0,rz=0;
 if(t<T.morph1+.4){const k=E.o4(P(t,2.9,T.morph1+.3));s=lerp(1.1,1.08,k)}
 else if(t<T.fr0){const k=E.io3(P(t,4.6,6.4));ry=-7*k;rx=2*k}
 else if(t<T.tap-.1){const k=E.io3(P(t,T.fr0,T.fr0+.8));ry=lerp(-7,8,k);rx=2;x=lerp(600,560,k)}
 else if(t<T.col0){const a=E.io3(P(t,T.tap-.1,T.tap+.3));x=lerp(560,600,a);ry=lerp(8,0,a);rx=lerp(2,0,a);
  const k=E.io4(P(t,T.ex0,T.ex0+.9));x=lerp(x,700,k);y=lerp(548,612,k);ry=lerp(ry,33,k);rx=lerp(rx,7,k);rz=lerp(0,-6,k);s=lerp(1.08,.96,k);ry-=6*P(t,T.ex0+.9,T.col0)}
 else if(t<T.pOut){const k=E.io4(P(t,T.col0,T.col1));x=lerp(700,600,k);y=lerp(612,548,k);ry=lerp(27,0,k);rx=lerp(7,0,k);rz=lerp(-6,0,k);s=lerp(.96,1.08,k);""",
"""const B=L.ph;const phone=$('phone');let PH={x:B.x,y:B.y,s:B.s};
function pose(t){let x=B.x,y=B.y,s=B.s,rx=0,ry=0,rz=0;const xf=B.x+B.freeDx;
 if(t<T.morph1+.4){const k=E.o4(P(t,2.9,T.morph1+.3));s=lerp(B.s*1.02,B.s,k)}
 else if(t<T.fr0){const k=E.io3(P(t,4.6,6.4));ry=-7*k;rx=2*k}
 else if(t<T.tap-.1){const k=E.io3(P(t,T.fr0,T.fr0+.8));ry=lerp(-7,8,k);rx=2;x=lerp(B.x,xf,k)}
 else if(t<T.col0){const a=E.io3(P(t,T.tap-.1,T.tap+.3));x=lerp(xf,B.x,a);ry=lerp(8,0,a);rx=lerp(2,0,a);
  const k=E.io4(P(t,T.ex0,T.ex0+.9));x=lerp(x,B.ex,k);y=lerp(B.y,B.ey,k);ry=lerp(ry,33,k);rx=lerp(rx,7,k);rz=lerp(0,-6,k);s=lerp(B.s,B.es,k);ry-=6*P(t,T.ex0+.9,T.col0)}
 else if(t<T.pOut){const k=E.io4(P(t,T.col0,T.col1));x=lerp(B.ex,B.x,k);y=lerp(B.ey,B.y,k);ry=lerp(27,0,k);rx=lerp(7,0,k);rz=lerp(-6,0,k);s=lerp(B.es,B.s,k);""")
r(" else{const k=E.i3(P(t,T.pOut,T.pOut+.55));x=lerp(600,-420,k);ry=lerp(-6,40,k);y=548+50*k}",
  " else{const k=E.i3(P(t,T.pOut,T.pOut+.55));x=lerp(B.x,B.exitX,k);ry=lerp(-6,40,k);y=B.y+50*k}")
r("const tx=600-195*1.08,ty=548-422*1.08,tw=390*1.08,th=844*1.08,tr=54*1.08;", "const tx=B.x-195*B.s,ty=B.y-422*B.s,tw=390*B.s,th=844*B.s,tr=54*B.s;")
r("lerp(1920,tw,k),lerp(1080,th,k)", "lerp(W,tw,k),lerp(H,th,k)")
r("const inv=(X,Y)=>[(X-960-cx)/cz+960,(Y-540-cy)/cz+540];", "const inv=(X,Y)=>[(X-W/2-cx)/cz+W/2,(Y-H/2-cy)/cz+H/2];")
r("const ax=(r.left-960-cz.x)/cz.s+960,ay=(r.top-540-cz.y)/cz.s+540;const lx=1226,ly=790+52;",
  "const ax=(r.left-W/2-cz.x)/cz.s+W/2,ay=(r.top-H/2-cz.y)/cz.s+H/2;const lx=VERT?1000:1226,ly=L.lab(3)+52;")
r("p.setAttribute('d',`M${ax},${ay} L${mx},${ay} L${mx},${ly} L${lx},${ly}`);const L=p.getTotalLength();p.style.strokeDasharray=L;p.style.strokeDashoffset=L*(1-d)-L*e;op(p,.8);\n  c1.setAttribute",
  "const bx=VERT?1009:mx;p.setAttribute('d',`M${ax},${ay} L${bx},${ay} L${bx},${ly} L${lx},${ly}`);const L=p.getTotalLength();p.style.strokeDasharray=L;p.style.strokeDashoffset=L*(1-d)-L*e;op(p,.8);\n  c1.setAttribute")
r("const lx=1226,ly=[190,390,590][k]+52;", "const lx=VERT?1000:1226,ly=L.lab(k)+52;")
r("p.setAttribute('d',`M${ax},${ay} L${mx},${ay} L${mx},${ly} L${lx},${ly}`);const L=p.getTotalLength();p.style.strokeDasharray=L;p.style.strokeDashoffset=L*(1-d)-L*e;op(p,.8);\n   const c1",
  "const bx=VERT?1036-k*9:mx;p.setAttribute('d',`M${ax},${ay} L${bx},${ay} L${bx},${ly} L${lx},${ly}`);const L=p.getTotalLength();p.style.strokeDasharray=L;p.style.strokeDashoffset=L*(1-d)-L*e;op(p,.8);\n   const c1")
r("tf(bp,`translate(${lerp(px0,930,k)}px,${lerp(py0,290,k)-90*out}px)", "tf(bp,`translate(${lerp(px0,L.pill.x,k)}px,${lerp(py0,L.pill.y,k)-90*out}px)")
r("fn.style.transformOrigin='590px 200px';", "fn.style.transformOrigin=L.frO;")
r("const R=lerp(6,370,k),gx=lerp(960,640,E.o4(P(t,T.g0,T.g0+.85))),gy=lerp(540,560,k);",
  "const R=lerp(6,L.gl.R,k),gx=lerp(W/2,L.gl.x,E.o4(P(t,T.g0,T.g0+.85))),gy=lerp(H/2,L.gl.y,k);")
r("left:${1180+hx-60}px;top:${470+hy2-40}px;", "left:${L.chart.x+hx-60}px;top:${L.chart.y+hy2-40}px;")
r("const hole=lerp(lerp(2300,385,k),0,cl2);", "const hole=lerp(lerp(2300,L.gl.R*1.04,k),0,cl2);")
r("radial-gradient(circle at 640px 560px,", "radial-gradient(circle at ${L.gl.x}px ${L.gl.y}px,")
r("tf($('ftCi'),`scale(${lerp(1.2,1.04,E.o3(P(t,T.iris0,T.iris1+.6)))+.03*P(t,T.iris1,30)})`);$('ftCi').style.transformOrigin='960px 540px';",
  "cover(fc,$('ftCi'),0,0,W,H,0,lerp(1.2,1.04,E.o3(P(t,T.iris0,T.iris1+.6)))+.03*P(t,T.iris1,30));")
r("tf($('ftBi'),`scale(${1.06+.03*P(t,T.fr0,T.frOut)})`)", "cover(fbg,$('ftBi'),0,0,W,H,0,1.06+.03*P(t,T.fr0,T.frOut))")
r("sky(TN,905,0,960,905,", "sky(TN,L.hy,0,W/2,L.hy,")
r("ocean(TN,905,", "ocean(TN,L.hy,")
r(",0,.62,960);", ",0,.62,W/2);")
r("const WW=$('eWord').offsetWidth,LK=190+36+WW,LX=960-LK/2;$('eMark').style.left=LX+'px';$('eWord').style.left=(LX+190+36)+'px';",
  "const MW=$('eMark').offsetWidth,WW=$('eWord').offsetWidth,LK=MW+36+WW,LX=W/2-LK/2;$('eMark').style.left=LX+'px';$('eWord').style.left=(LX+MW+36)+'px';")
r("const WW=$('iWord').offsetWidth,LK=150+28+WW,LX=960-LK/2;", "const WW=$('iWord').offsetWidth,LK=150+28+WW,LX=W/2-LK/2;")
r("$('iMark').style.transformOrigin=$('iWord').style.transformOrigin='960px 430px'", "$('iMark').style.transformOrigin=$('iWord').style.transformOrigin=`${W/2}px ${L.intro.y}px`")
r("cb.style.transformOrigin='960px 48px';", "cb.style.transformOrigin=`${W/2}px 48px`;")
r("const tg=TAG[m.card];const fs=280,base=Math.min(1,1180/c.w),X0=960-c.w*base/2,Y0=410+(1-base)*120;",
  "const tg=TAG[m.card];const fs=280,base=Math.min(1,L.cardW/c.w),X0=W/2-c.w*base/2,Y0=L.cardY+(1-base)*120;")
r("tf(ln,`translate(${960-c.w*base/2}px,", "tf(ln,`translate(${W/2-c.w*base/2}px,")
r("tf(nm,`translate(${960-c.w*base/2+6}px,", "tf(nm,`translate(${W/2-c.w*base/2+6}px,")
r("tf(sb,`translate(${960+c.w*base/2-120}px,", "tf(sb,`translate(${W/2+c.w*base/2-120}px,")

s=s.replace('const L=p.getTotalLength();p.style.strokeDasharray=L;p.style.strokeDashoffset=L*(1-d)-L*e;','const LL=p.getTotalLength();p.style.strokeDasharray=LL;p.style.strokeDashoffset=LL*(1-d)-LL*e;')
open('reel8.html', 'w').write(s)
print('ok', len(s))
