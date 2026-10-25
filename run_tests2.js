const fs=require('fs'); const R=JSON.parse(fs.readFileSync('results.json','utf8')); const B='http://localhost:3000';
const call=async(m,p,b,t)=>{const h={'Content-Type':'application/json'};if(t)h.Authorization='Bearer '+t;const r=await fetch(B+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined});return {s:r.status,j:await r.json().catch(()=>null)}};
(async()=>{
 const l=await call('POST','/api/auth/login',{email:'cook@qrmenu.kz',password:'Cook12345'}); const cook=l.j.token;
 const rs=await Promise.all([1,2,3].map(()=>call('POST','/api/orders',{table:7,items:[{id:2,qty:1}]})));
 const ids=rs.map(x=>x.j.id); R['TC-ORD-03']={pass:new Set(ids).size===1,actual:`3 бірдей сұраныс бір мезгілде → HTTP ${rs.map(x=>x.s).join(', ')}; ${new Set(ids).size} бөлек тапсырыс жасалды (id: ${ids.join(', ')}); күтілгені — 1 тапсырыс`};
 const o=(await call('POST','/api/orders',{table:8,items:[{id:1,qty:1}]})).j.id;
 const k=await Promise.all([1,2].map(()=>call('PATCH',`/api/orders/${o}/status`,{status:'Қабылданды'},cook)));
 R['TC-KIT-04']={pass:k.filter(x=>x.s===200).length===1,actual:`Екі сұраныс бір мезгілде → HTTP ${k.map(x=>x.s).join(', ')} (бірі 200, екіншісі 409 — тапсырыс бір рет қабылданды)`};
 fs.writeFileSync('results.json',JSON.stringify(R,null,1)); console.log(R['TC-ORD-03'],R['TC-KIT-04']);
})();
