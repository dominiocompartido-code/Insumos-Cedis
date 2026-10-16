import shutil, re, json, sys, os, glob
# Uso: python3 build.py  -> genera app/ (lo que publica Netlify) y vista-previa.html (demo local, no se sube)
R=os.path.dirname(os.path.abspath(__file__))+'/'
D=R+'src/'
h=open(D+'head.html').read()
js='\n'.join(open(D+f).read() for f in ['xlsx-lite.js','ciclo.js','reporte.js','app.js'])
js=js.replace("const CACHE = 'insumos-fch-v1';","")
out=R+'app'
os.makedirs(out, exist_ok=True)
for f in glob.glob(D+'pwa/*'): shutil.copy(f, out)
open(out+'/index.html','w').write(h.replace('<script src="app.js"></script>','<script>\n'+js+'\n</script>'))
# Cada build sube la versión de caché para que los equipos tomen la app nueva
sw=open(D+'pwa/sw.js').read(); m=re.search(r"insumos-fch-v(\d+)", sw)
if m and '--sin-version' not in sys.argv: sw=sw.replace(m.group(0), 'insumos-fch-v%d' % (int(m.group(1))+1))
open(D+'pwa/sw.js','w').write(sw); shutil.copy(D+'pwa/sw.js', out+'/sw.js')
# vista previa
mock=open(D+'mock.json').read(); sbm=open(D+'mock-preview.js').read()
d=json.loads(mock); G={g['id']:g for g in d['grupos']}
opts=''.join(f'<option value="{g}">{G[g]["aprobador"]}{" · " + G[g]["nombre"] if g in ("OFC","CEDIS") else (" · supervisor" if g=="SUP-DAVID" else " · supervisora")}</option>' for g in ['SUP-MARIA','SUP-DAVID','SUP-YESSICA','SUP-MARIOLY','OFC','CEDIS'])
title=re.search(r'<title>.*?</title>',h).group(0); style=re.search(r'<style>.*?</style>',h,re.S).group(0)
darks=re.findall(r'@media \(prefers-color-scheme: dark\)\{:root\{(.*?)\}\}',style,re.S)
style=style.replace('@media (prefers-color-scheme: dark){:root{','@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){')
style=style.replace('</style>',''.join(':root[data-theme="dark"]{'+b+'}' for b in darks)+'''
.demo{background:#fff4d6;color:#4a3300;border-bottom:1px solid #e9cf86;font-size:13px}
.demo-in{max-width:1240px;margin:0 auto;padding:8px 16px;display:flex;gap:10px 16px;align-items:center;flex-wrap:wrap}
.demo-in>span{margin-right:auto}
.demo select{width:auto;max-width:100%;background:#fff;color:#14231f;border-color:#e0c46e;padding:6px 8px}
header.top{top:env(safe-area-inset-top,0px);padding-top:0}
#btnInstalar,#btnLogin{display:none!important}
</style>''')
body=h[h.index('<body>')+6:h.index('</body>')]
tag=re.search(r'<script src="https://cdn.jsdelivr.net/npm/@supabase[^"]*"></script>',body).group(0)
body=body.replace(tag,'<script>window.__MOCK='+mock+';\n'+sbm+'</script>')
body=body.replace('<script src="app.js"></script>','<script>\n'+js.replace("if('serviceWorker' in navigator && location.protocol === 'https:')","if(false)")+'\n</script>')
fechas=[('','Hoy'),('2026-10-18T10:00','18 oct · últimos días para enviar'),('2026-10-23T10:00','23 oct · aprobación'),('2026-10-27T10:00','27 oct · compras'),('2026-11-04T10:00','4 nov · entrega a salas'),('2026-11-12T10:00','12 nov · ciclo cerrado')]
body=body.replace('<header class="top">','''<div class="demo"><div class="demo-in"><span><strong>Vista previa</strong> con solicitudes de ejemplo. Nada se guarda en la base real.</span>
<label style="display:flex;gap:6px;align-items:center">Ver como <select id="demoRol" onchange="verComo(this.value)"><option value="sol">Sucursal o área (sin ingresar)</option><option value="log">Logística CEDIS (tú)</option><option value="consulta">Consulta (solo ver)</option>'''+opts+'''</select></label>
<label style="display:flex;gap:6px;align-items:center">Fecha <select id="demoFecha" onchange="window.__HOY=this.value||null;render()">'''+''.join(f'<option value="{v}">{t}</option>' for v,t in fechas)+'''</select></label></div></div>
<header class="top">''',1)
open(R+'vista-previa.html','w').write('<meta charset="utf-8">\n'+title+'\n'+style+'\n'+body)
print('ok')
