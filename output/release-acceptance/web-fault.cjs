const fs=require('fs'),crypto=require('crypto'),assert=require('node:assert/strict');
const root='/tmp/mc-packaged-acceptance',base='http://127.0.0.1:12332',run=new Date().toISOString();
const log=v=>{const t=JSON.stringify({time:new Date().toISOString(),run,...v});console.log(t);fs.appendFileSync(root+'/results.jsonl',t+'\n',{mode:384})};
async function api(url,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(85000)});return{status:r.status,j:await r.json()}}
async function relay(on){return(await fetch('http://127.0.0.1:18527/set?enabled='+(on?'1':'0'),{method:'POST'})).json()}
async function range(url,bytes='bytes=0-65535'){const r=await fetch(base+url,{headers:{Range:bytes},signal:AbortSignal.timeout(40000)});const b=Buffer.from(await r.arrayBuffer());return{status:r.status,bytes:b.length,range:r.headers.get('content-range'),sha:crypto.createHash('sha256').update(b).digest('hex')}}
(async()=>{try{
 await relay(true);
 const i=await api('/api/web-video/import',{url:'https://www.w3.org/2010/05/video/mediaevents.html'});log({step:'fault-web-import',status:i.status,message:i.j.message});assert.equal(i.status,200);
 let p;for(let attempt=1;attempt<=5;attempt++){p=await api('/api/web-video/'+i.j.id+'/playable?fresh=1');log({step:'fault-web-fresh-prepare',attempt,status:p.status,message:p.j.message});assert.equal(p.status,200)}
 const baseline=await range(p.j.url);log({step:'fault-web-baseline',...baseline});assert.equal(baseline.status,206);assert.equal(baseline.bytes,65536);assert.equal(baseline.sha,'f33aee9066ea738a2fd89dd0ead5684b83c151258eb77ae9e63baa4a2e62c10f');
 const before=await(await fetch('http://127.0.0.1:18527')).json();
 const r=await fetch(base+p.j.url,{headers:{Range:'bytes=0-4372372'},signal:AbortSignal.timeout(40000)});const reader=r.body.getReader();let received=0;await reader.read().then(x=>received+=x.value?.length||0);const rr=await relay(false);log({step:'web-cut-relay',...rr});assert.ok(rr.connections>before.connections,'No new transfer traversed relay');let interrupted=false;try{while(true){const x=await reader.read();if(x.done)break;received+=x.value.length}}catch{interrupted=true}log({step:'web-active-transfer-cut',status:r.status,received,interrupted});assert.ok(interrupted);assert.ok(received>0&&received<4372373);
 const offline=await range(p.j.url);log({step:'web-while-offline',...offline});assert.equal(offline.status,502);
 await relay(true);const restored=await range(p.j.url);log({step:'web-restored-old-session',...restored});assert.deepEqual(restored,baseline);
 const seek=await range(p.j.url,'bytes=1048576-1114111');log({step:'web-restored-seek',...seek});assert.equal(seek.status,206);assert.equal(seek.sha,'eea847992e4223a73b5a7cfb0c12411202029d5fd56fbf911d2efaa40c856bcc');
 const re=await api('/api/web-video/'+i.j.id+'/playable?fresh=1');log({step:'web-refresh-source',status:re.status,message:re.j.message});assert.equal(re.status,200);const refreshed=await range(re.j.url);log({step:'web-refreshed-source-range',...refreshed});assert.deepEqual(refreshed,baseline);log({step:'web-fault-complete',passed:true,mediaId:i.j.id});
 }finally{await relay(true)}})().catch(e=>{log({error:e.name,message:e.message});process.exitCode=1});
