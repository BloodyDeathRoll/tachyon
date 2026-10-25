cd "$(dirname "$0")" && python3 - <<'PY'
L=open('film.html').read().split('\n')
body=open('reel7_body.html').read();js=open('reel7_js.js').read()
out='\n'.join(L[0:55])+'\n'+body+'\n'+L[133]+'\n<script>\n'+'\n'.join(L[135:162])+'\n'
out+='\n'.join(l for l in L[168:195] if "$('map')" not in l and 'pinR' not in l and 'bigRow' not in l)+'\n'
out+='\n'.join(L[224:257])+'\n'+js+'\n</script>\n</body></html>\n'
open('reel7.html','w').write(out.replace('<title>Rosa - Dawn Check</title>','<title>Rosa Showreel 30 v2</title>'))
PY
