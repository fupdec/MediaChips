const fs=require('fs'),path=require('path');
const root=process.cwd();
const load=p=>require(path.join(root,'.backend-build',p));
const Database=require('better-sqlite3');
const {connectNas}=load('api/services/nas/transport.js');
const {createNasCredentialStore}=load('api/services/nas/credentials.js');
const {createNasSourceAdapter}=load('api/services/mediaSources/nasAdapter.js');
const {createNasMediaInput}=load('api/services/nas/mediaInput.js');
const {probeNasMedia,createNasThumbnail}=load('api/services/nas/mediaProbe.js');
(async()=>{
const config=JSON.parse(fs.readFileSync('public/config.json'));
const db=new Database(path.join(config.path,'db.sqlite'),{readonly:true});
const rows=db.prepare("select m.id,l.resourceKey,l.connectionId from media m join mediaLocations l on l.mediaId=m.id where m.path like 'nas://%' order by m.id desc limit 3").all();
for(const row of rows){
 const result={id:row.id};const signal=AbortSignal.timeout(110000);
 const connection=db.prepare('select config,credentialRef from sourceConnections where id=?').get(row.connectionId);
 const settings=JSON.parse(connection.config);
 const credentials=createNasCredentialStore().get(connection.credentialRef);
 let connections=0;const open=async active=>{connections++;return createNasSourceAdapter(await connectNas(settings,credentials,active))};
 let input;
 try{
 let t=performance.now();const adapter=await open(signal);let file;try{file=await adapter.stat(row.resourceKey,signal)}finally{adapter.close()}
 result.connectAndStatMs=Math.round(performance.now()-t);result.sizeMb=Math.round(file.size/1048576);
 input=await createNasMediaInput({file,open,assertCurrent(){},signal,maxBytes:32*1048576});
 t=performance.now();const probe=await probeNasMedia(input.url,signal);input.assertHealthy();result.metadataMs=Math.round(performance.now()-t);result.metadataMb=+(input.bytesRead/1048576).toFixed(2);input.close();input=null;
 input=await createNasMediaInput({file,open,assertCurrent(){},signal,maxBytes:64*1048576});
 t=performance.now();await createNasThumbnail(input.url,path.join(root,'output/nas-benchmark',`${row.id}.jpg`),'video',probe.metadata.duration,probe.coverIndex,signal);input.assertHealthy();result.thumbnailMs=Math.round(performance.now()-t);result.thumbnailMb=+(input.bytesRead/1048576).toFixed(2);
 }catch(e){result.error=e.code||e.name;result.message=String(e.message).split('\n')[0].slice(0,180)}finally{input?.close()}
 result.connections=connections;console.log(JSON.stringify(result));
}
db.close();
})().catch(e=>{console.error(e.code||e.name,e.message);process.exitCode=1});
