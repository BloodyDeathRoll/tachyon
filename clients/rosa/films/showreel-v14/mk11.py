# reel10.html -> reel11.html: GETS BETTER globe + copy block moved 100px left so the pair sits centered (16:9)
s = open('reel10.html').read()


def r(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (c, a[:90])
    s = s.replace(a, b)


r("gl:{x:640,y:560,R:370},chart:{x:1180,y:470}", "gl:{x:540,y:560,R:370},chart:{x:1080,y:470}")
r('<div id="gCh" class="a chap" style="left:1180px;', '<div id="gCh" class="a chap" style="left:1080px;')
r('<div id="gNum" class="a big" style="left:1172px;', '<div id="gNum" class="a big" style="left:1072px;')
r('<div id="gSub" class="a sub2" style="left:1180px;', '<div id="gSub" class="a sub2" style="left:1080px;')
r('<svg id="chart" class="a" width="640" height="300" style="left:1180px;', '<svg id="chart" class="a" width="640" height="300" style="left:1080px;')
r('<div id="gChips" class="a" style="left:1180px;', '<div id="gChips" class="a" style="left:1080px;')
open('reel11.html', 'w').write(s)
print('ok')
