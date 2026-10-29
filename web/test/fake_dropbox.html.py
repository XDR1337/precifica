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
  if(ep==="sharing/list_mountable_folders") return J({entries:JSON.parse(localStorage.fakepend||"[]")});
  if(ep==="files/get_metadata"){const p=body.path.toLowerCase(); if(d.folders[p]) return J({path_display:"/"+d.folders[p].name,".tag":"folder",sharing_info:d.folders[p].sid?{shared_folder_id:d.folders[p].sid}:undefined}); return J({error_summary:"path/not_found/"},409);}
  if(ep==="files/create_folder_v2"){const p=body.path.toLowerCase(); if(d.folders[p]) return J({error_summary:"path/conflict/folder"},409); d.folders[p]={name:body.path.slice(1)}; S(d); return J({metadata:{}});}
  if(ep==="files/download"){const f=d.files[api.path.toLowerCase()]; if(!f) return new Response('{"error_summary":"path/not_found"}',{status:409}); return new Response(f.c,{status:200,headers:{"dropbox-api-result":JSON.stringify({rev:f.rev})}});}
  if(ep==="files/upload"){const p=api.path.toLowerCase(), f=d.files[p]; if(api.mode[".tag"]==="update"&&(!f||f.rev!==api.mode.update)) return new Response("conflict",{status:409}); if(api.mode[".tag"]==="add"&&f) return new Response("conflict",{status:409}); d.files[p]={c:opt.body,rev:"r"+(++n)}; S(d); return J({});}
  if(ep==="sharing/share_folder"){const p=body.path.toLowerCase(); d.folders[p].sid="sf1"; S(d); return J({shared_folder_id:"sf1"});}
  if(ep==="sharing/add_folder_member"){{const k=Object.keys(d.folders).find(x=>d.folders[x].sid===body.shared_folder_id); if(k){d.folders[k].members=(d.folders[k].members||[]).concat([{id:"dbid:"+body.members[0].member.email,mail:body.members[0].member.email}]); S(d);}} const l=JSON.parse(localStorage.fakeinv||"[]"); l.push(body.members[0].member.email); localStorage.fakeinv=JSON.stringify(l); return J({});}
  if(ep==="sharing/get_folder_metadata"){const k=Object.keys(d.folders).find(x=>d.folders[x].sid===body.shared_folder_id); return J({access_type:{".tag":(k&&d.folders[k].member)?"editor":"owner"}});}
  if(ep==="sharing/relinquish_folder_membership"&&localStorage.fakefail==="1") return new Response("nope",{status:400});
  if(ep==="sharing/relinquish_folder_membership"&&localStorage.fakeowner==="1") return new Response('{"error":{".tag":"folder_owner"},"error_summary":"folder_owner/"}',{status:409});
  if(ep==="sharing/transfer_folder"){const l=JSON.parse(localStorage.faketransfer||"[]"); l.push(body.to_dropbox_id); localStorage.faketransfer=JSON.stringify(l); return J({});}
  if(ep==="sharing/mount_folder"){const p=JSON.parse(localStorage.fakepend||"[]"); const e=p.find(x=>x.shared_folder_id===body.shared_folder_id); localStorage.fakepend=JSON.stringify(p.filter(x=>x!==e)); localStorage.fakemounted=(localStorage.fakemounted||"")+body.shared_folder_id+","; return J({path_display:"/"+(e?e.name:"x")});}
  if(ep==="sharing/unshare_folder"){localStorage.fakepend="[]"; return J({".tag":"async_job_id",async_job_id:"j1"});}
  if(ep==="sharing/check_job_status") return J({".tag":"complete"});
  if(ep==="sharing/relinquish_folder_membership"){localStorage.fakepend=JSON.stringify(JSON.parse(localStorage.fakepend||"[]").filter(e=>e.shared_folder_id!==body.shared_folder_id)); const k=Object.keys(d.folders).find(x=>d.folders[x].sid===body.shared_folder_id); if(k) delete d.folders[k]; S(d); return J({});}
  if(ep==="sharing/list_folders") return J({entries:Object.keys(d.folders).filter(k=>d.folders[k].sid).map(k=>({name:d.folders[k].name,path_lower:k,shared_folder_id:d.folders[k].sid}))});
  if(ep==="sharing/list_folder_members"){const k=Object.keys(d.folders).find(x=>d.folders[x].sid===body.shared_folder_id); const m=(k&&d.folders[k].members)||[]; return J({users:m.filter(x=>x.id).map(x=>({access_type:{".tag":x.owner?"owner":"editor"},user:{account_id:x.id,email:x.mail}})),invitees:m.filter(x=>x.email).map(x=>({invitee:{".tag":"email",email:x.email}}))});}
  if(ep==="sharing/remove_folder_member"){const l=JSON.parse(localStorage.fakelog||"[]"); l.push("rm:"+(body.member.dropbox_id||body.member.email)); localStorage.fakelog=JSON.stringify(l); return J({".tag":"async_job_id",async_job_id:"jr"});}
  if(ep==="files/delete_v2"){const lg=JSON.parse(localStorage.fakelog||"[]"); lg.push("delete"); localStorage.fakelog=JSON.stringify(lg); const p=body.path.toLowerCase(); delete d.folders[p]; for(const k of Object.keys(d.files)) if(k.startsWith(p+"/")) delete d.files[k]; S(d); return J({});}
  if(ep==="sharing/create_shared_link_with_settings") return J({url:"https://fake.dropbox/s/"+encodeURIComponent(body.path)});
  if(ep==="sharing/get_shared_link_file"){const path=decodeURIComponent(api.url.split("/s/")[1]).toLowerCase(); const f=d.files[path]; if(!f) return new Response("{}",{status:409}); return new Response(f.c,{status:200});}
  return J({error_summary:"unhandled "+ep},400);
 };
})();
</script>
"""
if admin:
    html = html.replace("P.ADMIN_IDS = [];", f'P.ADMIN_IDS = ["{admin}"];')
if len(sys.argv) > 2:
    html = html.replace('P.POLICY_URL = "";', f'P.POLICY_URL = "{sys.argv[2]}";')
out = HERE / "out"
out.mkdir(exist_ok=True)
(out / "index.html").write_text(html.replace("<style>", FAKE + "<style>", 1), encoding="utf-8")
print("gerado", out / "index.html")
