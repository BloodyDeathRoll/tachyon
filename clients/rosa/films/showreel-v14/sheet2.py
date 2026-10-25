import sys
from PIL import Image
out=sys.argv[1];cols=int(sys.argv[2]);ts=sys.argv[3:]
im0=Image.open('prev/q_%.2f.jpg'%float(ts[0]));w,h=(480,270) if im0.width>im0.height else (270,480)
rows=(len(ts)+cols-1)//cols
s=Image.new('RGB',(w*cols,h*rows),'#222')
for i,t in enumerate(ts):s.paste(Image.open('prev/q_%.2f.jpg'%float(t)).resize((w,h)),((i%cols)*w,(i//cols)*h))
s.save('prev/'+out,quality=82)
