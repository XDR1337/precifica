"""Gera test/out/index.html: o Precifica.html com um Dropbox falso (guardado no localStorage) para testar o login no navegador.
Uso: python web/test/fake_dropbox.html.py [ID_DO_ADMIN]   e depois sirva test/out/ (python -m http.server)."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
html = (HERE.parent / "Precifica.html").read_text(encoding="utf-8")
admin = sys.argv[1] if len(sys.argv) > 1 else ""
FAKE = r"""<script>
(function(){
 const K="fakedbx"; const L=()=>JSON.parse(localStorage.getItem(K)||'{"folders":{},"files":{}}'); const S=(o)=>localStorage.setItem(K,JSON.stringify(o));
 const J=(o,st)=>new Response(JSON.stringify(o),{status:st||200,headers:{"content-type":"application/json"}});
 let n=Date.now();
 window.fetch=async function(url,opt){
  url=String(url); opt=opt||{}; const h=opt.headers||{}; const api=h["Dropbox-API-Arg"]?JSON.parse(h["Dropbox-API-Arg"]):null;
  let body={}; try{ if(typeof opt.body==="string"&&!api) body=JSON.parse(opt.body);}catch(e){}
  const d=L(); const ep=url.replace(/^https:\/\/[^/]+\/2\//,"");
  if(url.includes("/oauth2/token")) return J({access_token:"tok",expires_in:14400});
  if(ep==="files/list_folder") return J({entries:Object.keys(d.folders).map(k=>({".tag":"folder",name:d.folders[k].name})),has_more:false});
  if(ep==="sharing/list_mountable_folders") return J({entries:[]});
  if(ep==="files/get_metadata"){const p=body.path.toLowerCase(); if(d.folders[p]) return J({path_display:"/"+d.folders[p].name,".tag":"folder",sharing_info:d.folders[p].sid?{shared_folder_id:d.folders[p].sid}:undefined}); return J({error_summary:"path/not_found/"},409);}
  if(ep==="files/create_folder_v2"){const p=body.path.toLowerCase(); if(d.folders[p]) return J({error_summary:"path/conflict/folder"},409); d.folders[p]={name:body.path.slice(1)}; S(d); return J({metadata:{}});}
  if(ep==="files/download"){const f=d.files[api.path.toLowerCase()]; if(!f) return new Response('{"error_summary":"path/not_found"}',{status:409}); return new Response(f.c,{status:200,headers:{"dropbox-api-result":JSON.stringify({rev:f.rev})}});}
  if(ep==="files/upload"){const p=api.path.toLowerCase(), f=d.files[p]; if(api.mode[".tag"]==="update"&&(!f||f.rev!==api.mode.update)) return new Response("conflict",{status:409}); if(api.mode[".tag"]==="add"&&f) return new Response("conflict",{status:409}); d.files[p]={c:opt.body,rev:"r"+(++n)}; S(d); return J({});}
  if(ep==="sharing/share_folder"){const p=body.path.toLowerCase(); d.folders[p].sid="sf1"; S(d); return J({shared_folder_id:"sf1"});}
  if(ep==="sharing/add_folder_member") return J({});
  return J({error_summary:"unhandled "+ep},400);
 };
})();
</script>
"""
if admin:
    html = html.replace("P.ADMIN_IDS = [];", f'P.ADMIN_IDS = ["{admin}"];')
out = HERE / "out"
out.mkdir(exist_ok=True)
(out / "index.html").write_text(html.replace("<style>", FAKE + "<style>", 1), encoding="utf-8")
print("gerado", out / "index.html")
