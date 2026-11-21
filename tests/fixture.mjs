import vm from 'node:vm';import fs from 'node:fs';import crypto from 'node:crypto';
const source=fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
let baseline;
export function environment({fresh=false}={}){
 const properties={SITE_ORIGIN:'https://haura-test.github.io',ADMIN_EMAIL:'admin@haura.test',ADMIN_PASSWORD:'Admin-Password-123!'};
 const files=new Map();let index=0;
 const blob=v=>({getBytes:()=>[...Buffer.from(typeof v==='string'?v:v||[])].map(x=>x>127?x-256:x),getDataAsString:()=>typeof v==='string'?v:Buffer.from(v||[]).toString()});
 const file=(value,name)=>{const id='file-'+(++index),f={id,name,content:typeof value==='string'?value:value.getDataAsString(),getId:()=>id,getBlob:()=>blob(f.content),getParents:()=>({hasNext:()=>true}),setContent:v=>{f.content=v;},setTrashed:v=>{f.trashed=v;}};files.set(id,f);return f;};
 const folder={getId:()=> 'folder',createFile:(a,b)=> typeof a==='string'?file(b,a):file(a,'upload')};
 const context=vm.createContext({MimeType:{PLAIN_TEXT:'text/plain'},console,Uint8Array,Uint32Array,DataView,ArrayBuffer,TextEncoder,TextDecoder,PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||null,setProperty:(k,v)=>{properties[k]=v;},deleteProperty:k=>{delete properties[k];}})},Utilities:{getUuid:()=>crypto.randomUUID(),newBlob:v=>blob(v),base64Encode:v=>Buffer.from(v).toString('base64'),base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url'),base64Decode:v=>[...Buffer.from(v,'base64')].map(x=>x>127?x-256:x),computeDigest:(_alg,s)=>[...crypto.createHash('sha256').update(s).digest()].map(x=>x>127?x-256:x),DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},formatDate:()=> '20261110-000000'},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},DriveApp:{createFolder:()=>folder,getFolderById:()=>folder,getFileById:id=>{if(!files.has(id))throw new Error('File missing');return files.get(id);}},HtmlService:{XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createHtmlOutput:html=>({html,setXFrameOptionsMode(){return this;}})}});
 vm.runInContext(source,context);
 if(!fresh){if(!baseline){context.siapkanHaura_();baseline=JSON.parse(files.get(properties.DB_FILE_ID).content);}else{const f=file(JSON.stringify(baseline),'haura-database.json');properties.DB_FILE_ID=f.id;properties.DRIVE_FOLDER_ID='folder';delete properties.ADMIN_PASSWORD;}}
 return {c:context,properties,files,state:()=>JSON.parse(files.get(properties.DB_FILE_ID).content),save:db=>files.get(properties.DB_FILE_ID).setContent(JSON.stringify(db)),call:(action,args={},token='')=>JSON.parse(JSON.stringify(context.api({action,args,token}))),setOrigin:origin=>properties.SITE_ORIGIN=origin};
}
export function login(e,email='admin@haura.test',password='Admin-Password-123!'){const r=e.call('authLogin',{email,password});if(!r.ok)throw new Error(r.error);return r.data;}
export function register(e,email='alice@haura.test',password='Member-Password-123!'){const r=e.call('authRegister',{email,password,name:'Alice',institution:'Haura Study',consent:'on'});if(!r.ok)throw new Error(r.error);return r.data;}
export function approve(e,admin,member){return e.call('mutate',{ops:[{op:'patch',c:'users',id:member.user.uid,data:{status:'approved',chatAccess:true}}]},admin.token);}
