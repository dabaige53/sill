from pathlib import Path
import json
root=Path(__file__).resolve().parent
metadata={'main_module':'worker.mjs','compatibility_date':'2026-10-14','bindings':[],'tags':['sill','public-synthetic-preview']}
boundary='SillPreviewUpload20261014'
parts=[]
for name,ctype,content in [('metadata','application/json',json.dumps(metadata)),('worker.mjs','application/javascript+module',(root/'worker.mjs').read_text()),('index.html','text/plain',(root/'index.html').read_text())]:
 parts.extend(['--'+boundary,'Content-Disposition: form-data; name="'+name+'"'+('' if name=='metadata' else '; filename="'+name+'"'),'Content-Type: '+ctype,'',content])
parts+=['--'+boundary+'--','']
body='\r\n'.join(parts)
code='async () => cloudflare.request('+json.dumps({'method':'PUT','path':'/accounts/8dfc5765c957955fbcca0c22071c824d/workers/scripts/sill-web-preview','contentType':'multipart/form-data; boundary='+boundary,'rawBody':True,'body':body})+')'
(root/'upload-code.json').write_text(json.dumps({'account_id':'8dfc5765c957955fbcca0c22071c824d','code':code}))
print('Prepared plugin upload:',len(body.encode()),'bytes')
