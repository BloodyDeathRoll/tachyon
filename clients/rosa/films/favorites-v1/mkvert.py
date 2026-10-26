import re
def R(s,pairs,name):
    for a,b in pairs:
        n=s.count(a)
        assert n>=1,(name,a)
        s=s.replace(a,b)
    return s
common=[
 ('html,body{width:1920px;height:1080px','html,body{width:1080px;height:1920px'),
 ('transform-origin:960px 540px','transform-origin:540px 960px'),
 ('<canvas id="bg" width="1920" height="1080">','<canvas id="bg" width="1080" height="1920">'),
 ('<div id="end" class="a" style="left:0;top:0;width:1920px;height:1080px">','<div id="end" class="a" style="left:0;top:0;width:1080px;height:1920px">'),
 ('id="endMark" class="a" style="left:676px;top:404px','id="endMark" class="a" style="left:256px;top:824px'),
 ('id="endWord" class="a big" style="left:890px;top:398px','id="endWord" class="a big" style="left:470px;top:818px'),
 ('style="left:0;width:1920px;top:690px;text-align:center','style="left:0;width:1080px;top:1110px;text-align:center'),
 ('style="left:0;width:1920px;top:740px;text-align:center','style="left:0;width:1080px;top:1160px;text-align:center'),
 ('<canvas id="grain" width="480" height="270" style="width:1920px;height:1080px','<canvas id="grain" width="270" height="480" style="width:1080px;height:1920px'),
 ('createImageData(480,270)','createImageData(270,480)'),
 ('<svg class="a" width="1920" height="1080" style="left:0;top:0" fill="none"','<svg class="a" width="1080" height="1920" style="left:0;top:0" fill="none"'),
 ('M30 60V30h30M1890 60V30h-30M30 1020v30h30M1890 1020v30h-30','M30 60V30h30M1050 60V30h-30M30 1860v30h30M1050 1860v30h-30'),
 ("width:lerp(2000,r.width,k)+'px',height:lerp(1160,r.height,k)+'px'","width:lerp(1160,r.width,k)+'px',height:lerp(2000,r.height,k)+'px'"),
]
# ---------- dark film
s=open('index.html').read()
s=R(s,common+[
 ('const W=1920,H=1080,','const W=1080,H=1920,'),
 ('style="left:0;top:0;width:1920px;text-align:center;font-size:170px"','style="left:0;top:0;width:1080px;text-align:center;font-size:146px"'),
 ('class="a" style="width:1920px;top:0"','class="a" style="width:1080px;top:0"'),
 ('<svg id="lines" class="a" width="1920" height="1080"','<svg id="lines" class="a" width="1080" height="1920"'),
 ('id="h3" class="a" style="left:150px;top:300px"','id="h3" class="a" style="left:80px;top:250px"'),
 ('id="h4" class="a" style="left:1150px;top:170px"','id="h4" class="a" style="left:80px;top:150px"'),
 ('id="c1" class="a callout" style="left:1150px;top:300px"','id="c1" class="a callout" style="right:90px;text-align:right;top:1230px"'),
 ('id="c2" class="a callout" style="left:1150px;top:510px"','id="c2" class="a callout" style="right:90px;text-align:right;top:1440px"'),
 ('id="c3" class="a callout" style="left:1150px;top:720px"','id="c3" class="a callout" style="right:90px;text-align:right;top:1650px"'),
 ('id="h5" class="a" style="left:150px;top:150px;display:flex;gap:90px"','id="h5" class="a" style="left:80px;top:170px;display:flex;gap:56px"'),
 ('style="font-size:150px;margin-top:10px" id="r1"','style="font-size:124px;margin-top:10px" id="r1"'),
 ('style="font-size:150px;margin-top:10px" id="r2"','style="font-size:124px;margin-top:10px" id="r2"'),
 ('id="h6" class="a" style="left:130px;top:640px"','id="h6" class="a" style="left:80px;top:1060px"'),
 ('id="cnt" style="font-size:260px"','id="cnt" style="font-size:200px"'),
 ('style="font-size:58px;margin-top:6px;letter-spacing:-.03em">spots','style="font-size:50px;margin-top:6px;letter-spacing:-.03em">spots'),
 ("const k=5.1*z, px=lo=>760+(lo-cl)*k, py=la=>560-(la-ca)*k;","const k=2.9*z, px=lo=>540+(lo-cl)*k, py=la=>660-(la-ca)*k;"),
 ("const X=h=>60+h/24*1800, Y=h=>660-170*Math.cos","const X=h=>50+h/24*980, Y=h=>720-140*Math.cos"),
 ("g.lineTo(X(hEnd),1080);g.lineTo(X(0),1080);","g.lineTo(X(hEnd),H);g.lineTo(X(0),H);"),
 ("createLinearGradient(0,480,0,1080)","createLinearGradient(0,560,0,1500)"),
 ("const x0=lerp(0,960,c), x1=lerp(lerp(0,1920,d),960,c)","const x0=lerp(0,540,c), x1=lerp(lerp(0,1080,d),540,c)"),
 ("const y=600+Math.sin(x*.012-t*6)","const y=1020+Math.sin(x*.012-t*6)"),
 ("const hx=x1,hy=600;","const hx=x1,hy=1020;"),
 ("g.arc(960,600,4+12*c,0,7)","g.arc(540,1020,4+12*c,0,7)"),
 ("glow(250+Math.sin(t*.5)*80,1050,900","glow(140+Math.sin(t*.5)*80,1900,900"),
 ("glow(1700+Math.cos(t*.4)*80,1080,800","glow(960+Math.cos(t*.4)*80,1920,800"),
 ("glow(960,540,700,","glow(540,960,700,"),
 ("swell(t,swA,t>14?640:660);","swell(t,swA,t>14?1200:1240);"),
 ("el.style.top='400px';","el.style.top='820px';"),
 ("const mx=lerp(960,960-275,slide);tf(lock,`translate(${mx}px,600px)`);","const mx=lerp(540,540-275,slide);tf(lock,`translate(${mx}px,1020px)`);"),
 ("const px=track([[3.4,960],[3.95,960],[4.7,1250],[6.05,1250],[6.65,700],[9.6,700],[10.3,1300],[11.9,1300],[12.6,1440],[13.3,1440],[13.85,960]],t);",
  "const px=track([[3.4,540],[11.9,540],[12.6,800],[13.3,800],[13.85,540]],t);"),
 ("const py=track([[3.4,540],[12,540],[12.6,560],[13.3,560],[13.85,540]],t)",
  "const py=track([[3.4,960],[3.95,960],[4.7,1240],[6.05,1240],[6.65,720],[9.6,720],[10.3,1400],[11.9,1400],[12.6,1560],[13.3,1560],[13.85,960]],t)"),
 ("const ps=track([[3.4,1],[3.95,1],[4.7,.98],[7.7,.98],[8.3,1.12],[9.6,1.12],[10.3,.98],[11.9,.98],[12.6,.74],[13.3,.74],[13.85,.96],[14.15,.96],[14.5,3.2]],t,E.io3);",
  "const ps=track([[3.4,1],[3.95,1],[4.7,.92],[6.05,.92],[6.65,.92],[7.7,.92],[8.3,.98],[9.6,.98],[10.3,.8],[11.9,.8],[12.6,.62],[13.3,.62],[13.85,.96],[14.15,.96],[14.5,3.2]],t,E.io3);"),
 ("const x0=a.right+4,y0=a.top+a.height/2,x2=1130,y2=b.top+42;const x1=lerp(x0,x2,.55);",
  "const x0=a.right+4,y0=a.top+a.height/2,x1=1010,y2=b.top+58;"),
 ("const path=`M${x0} ${y0} L${x1} ${y0} L${x2-10} ${y2} L${x2} ${y2}`;const ln=Math.hypot(x1-x0,0)+Math.hypot(x2-10-x1,y2-y0)+10;",
  "const path=`M${x0} ${y0} L${x1} ${y0} L${x1} ${y2} L${x1-14} ${y2}`;const ln=Math.abs(x1-x0)+Math.abs(y2-y0)+14;"),
],'index')
open('index_v.html','w').write(s)
# ---------- favorites film
s=open('fav.html').read()
s=R(s,common+[
 ('<script src="lib.js"></script>','<script src="lib_v.js"></script>'),
 ('id="names" class="a" style="left:0;top:0;width:1920px;height:1080px"','id="names" class="a" style="left:0;top:0;width:1080px;height:1920px"'),
 ('viewBox="0 0 24 24" style="left:830px;top:410px"','viewBox="0 0 24 24" style="left:410px;top:830px"'),
 ('id="hL" class="a big" style="left:120px;top:400px;font-size:104px"','id="hL" class="a big" style="left:80px;top:190px;font-size:100px"'),
 ('id="hR" class="a big" style="right:120px;top:400px;font-size:104px;','id="hR" class="a big" style="right:80px;top:1520px;font-size:100px;'),
 ('id="h6" class="a" style="left:120px;top:690px"','id="h6" class="a" style="left:80px;top:1080px"'),
 ('id="favHud" style="left:0;width:1920px;top:44px;','id="favHud" style="left:0;width:1080px;top:96px;'),
 ("return{x:side<0?150:1410,y:150+k*132,","return{x:side<0?70:650,y:1062+k*124,"),
 ("style=\"top:${150+i*62}px;${L?'right:'+(1920-930)+'px;text-align:right':'left:990px'};font-size:56px;","style=\"top:${470+i*80}px;${L?'right:'+(1080-512)+'px;text-align:right':'left:568px'};font-size:44px;"),
 ("starSvg(44,'#11b7f2','#11b7f2')}</span><span class=\"nt\">","starSvg(36,'#11b7f2','#11b7f2')}</span><span class=\"nt\">"),
 ("const y0=150+i*62, cy=540-y0;","const y0=470+i*80, cy=960-y0;"),
 ("const k=5*z,px=lo=>960+(lo-8)*k,py=la=>560-(la-6)*k;","const k=2.85*z,px=lo=>540+(lo-8)*k,py=la=>720-(la-6)*k;"),
 ("glow(260+Math.sin(t*.5)*80,1080,900","glow(140+Math.sin(t*.5)*80,1920,900"),
 ("glow(1680+Math.cos(t*.4)*80,1080,800","glow(940+Math.cos(t*.4)*80,1920,800"),
 ("glow(960,300,800,","glow(540,500,800,"),
 ("[14.3,.7]],t),680);","[14.3,.7]],t),1250);"),
 ("tf(lock,`translate(${lerp(960,685,slide)}px,560px)`);","tf(lock,`translate(${lerp(540,265,slide)}px,980px)`);"),
 ("const px=track([[3.4,960],[FAV0+.3,960],[11.55,960],[11.95,960],[13.4,960]],t);","const px=track([[3.4,540],[13.4,540]],t);"),
 ("const py=track([[3.4,540],[11.55,540],[12.05,1500],[13.35,1500],[13.85,540]],t,E.ioX)",
  "const py=track([[3.4,960],[3.95,960],[4.6,610],[FAV0,610],[FAV0+.5,960],[11.55,960],[12.05,2700],[13.35,2700],[13.85,960]],t,E.ioX)"),
 ("const ps=track([[3.4,1],[3.95,1],[4.6,.96],[FAV0,.96],[FAV0+.5,.98],[11.55,.98],",
  "const ps=track([[3.4,1],[3.95,1],[4.6,.88],[FAV0,.88],[FAV0+.5,.92],[11.55,.92],"),
 ("s=lerp(.25,1,E.oB(Math.min(1,f*1.3)))","s=lerp(.25,1.1,E.oB(Math.min(1,f*1.3)))"),
],'fav')
open('fav_v.html','w').write(s)
open('lib_v.js','w').write(open('lib.js').read().replace('const W=1920,H=1080,','const W=1080,H=1920,'))
assert 'const W=1080' in open('lib_v.js').read()
print('ok')
