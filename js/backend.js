import {driveConfig} from './drive-config.js';
import {createBridge,revive,selectRows} from './drive-client.js';
export const configured=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(driveConfig.webAppUrl||'');

const SESSION_KEY='haura_tab_session_v3';
function readSavedSession(){
  try{
    const raw=sessionStorage.getItem(SESSION_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    return (parsed?.token&&parsed?.user?.uid)?parsed:null;
  }catch{return null;}
}
function writeSavedSession(data){
  try{
    if(data?.token&&data?.user?.uid)sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:data.token,user:data.user}));
    else sessionStorage.removeItem(SESSION_KEY);
  }catch{}
}

const initialSession=readSavedSession();
let sessionToken=initialSession?.token||'';
let latestServerTimeMs=0;
function recordServerTime(ms){
  const n=Number(ms||0);
  if(Number.isFinite(n)&&n>latestServerTimeMs){
    latestServerTimeMs=n;
    try{document.dispatchEvent(new CustomEvent('haura-server-time',{detail:{serverTime:n}}));}catch{}
  }
}
export const getServerTime=()=>latestServerTimeMs||Date.now();

const auth={currentUser:initialSession?{...initialSession.user,getIdToken:async()=>sessionToken}:null};
const authObservers=new Set();
let cache={}, cacheUID=auth.currentUser?.uid||null, epoch=0, fileEpoch=0, inFlight=null;
const bridge=createBridge(driveConfig,()=>auth?.currentUser), watchers=new Set(), blobs=new Map(), pendingFiles=new Map();
export const storageConfigured=bridge.configured;
export const requireStorage=()=>{if(!storageConfigured)throw new Error('Konfigurasi webAppUrl di js/drive-config.js belum diisi.');};
export async function init(){return configured;}
export const authInstance=()=>auth;
export const dbInstance=()=>null;
export const stamp=()=>({__serverTime:true});
function emit(){for(const w of [...watchers]){try{const rows=selectRows(revive(cache[w.c]||[]),w.filters);const value=w.id?rows.find(r=>r.id===w.id):rows;const encoded=JSON.stringify(value);if(encoded===w.last)continue;w.last=encoded;if(w.id)w.ok({id:w.id,exists:()=>!!value,data:()=>value});else w.ok(value);}catch(e){w.fail?.(e);}}}
async function sync(){
  const who=auth?.currentUser?.uid||'';
  if(cacheUID!==who){epoch++;cache={};cacheUID=who;inFlight=null;clearFiles();}
  if(inFlight)return inFlight;
  const generation=epoch;
  const job=(async()=>{try{const data=await bridge.call('snapshot');if(generation!==epoch || (auth?.currentUser?.uid||'')!==who)return;if(data?.__serverTime)recordServerTime(data.__serverTime);cache=data;emit();}catch(e){if(generation===epoch)for(const w of [...watchers])w.fail?.(e);if(/^Sesi|^Wajib mengganti/.test(e.message)&&auth.currentUser)setSession(null);throw e;}})();
  inFlight=job;try{await job;}finally{if(inFlight===job)inFlight=null;}
}
setInterval(()=>{if(watchers.size&&!document.hidden&&bridge.configured)sync().catch(()=>{});},Math.max(20000,driveConfig.pollMs||30000));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&watchers.size&&bridge.configured)sync().catch(()=>{});});
function subscribe(c,filters,ok,fail,id){const w={c,filters,ok,fail,id,last:Symbol()};watchers.add(w);if(bridge.configured)queueMicrotask(()=>sync().catch(()=>{}));return()=>watchers.delete(w);}
export const watch=(c,filters,ok,fail)=>subscribe(c,filters,ok,fail);
export async function read(c,id){const result=await bridge.call('read',{c,id});return revive(result);}
async function runAndSync(action,args){const result=await bridge.call(action,args);if(inFlight)await inFlight.catch(()=>{});await sync().catch(()=>{});return result;}
async function mutate(ops){return runAndSync('mutate',{ops});}
export const create=(c,id,data)=>mutate([{op:'set',c,id,data}]);
export const patch=(c,id,data)=>mutate([{op:'patch',c,id,data}]);
export const remove=(c,id)=>mutate([{op:'remove',c,id}]);
export async function add(c,data){const id=crypto.randomUUID();await create(c,id,data);return {id};}
export const F={
  where:(field,op,value)=>{if(op!=='==')throw new Error('Filter tidak didukung.');return {type:'where',field,value};},
  orderBy:(field,direction)=>({type:'orderBy',field,direction}),limit:count=>({type:'limit',count}),
  doc:(_db,c,id)=>({c,id}),onSnapshot:(ref,ok,fail)=>subscribe(ref.c,[],ok,fail,ref.id),
  async getIdTokenResult(){
    try{
      const identity=await bridge.call('identity');
      if(identity?.serverTime)recordServerTime(identity.serverTime);
      return {claims:{admin:identity.admin}};
    }catch(e){
      if(/^Sesi|^Wajib mengganti/.test(e.message)&&auth.currentUser)setSession(null);
      throw e;
    }
  },
  onAuthStateChanged:(_a,cb)=>{authObservers.add(cb);queueMicrotask(()=>cb(auth.currentUser));return()=>authObservers.delete(cb);},
  async signOut(){try{if(auth.currentUser)await bridge.call('authLogout');}finally{setSession(null);}},
  async reload(){const id=await bridge.call('identity');if(id?.serverTime)recordServerTime(id.serverTime);},
  writeBatch:()=>{const ops=[];return {update:(ref,data)=>ops.push({op:'patch',...ref,data}),commit:()=>mutate(ops)};}
};
export function validateFile(file,allowed=['image/jpeg','image/png','image/webp'],max=5*1024*1024){const limit=Math.min(max,10*1024*1024);if(!file||!allowed.includes(file.type))throw new Error('Format berkas tidak didukung.');if(!file.size||file.size>limit)throw new Error('Ukuran berkas melebihi batas maksimal.');}
export async function upload(path,file,allowed,max){requireStorage();validateFile(file,allowed,max);const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});await bridge.call('fileWrite',{path,mime:file.type,base64});return path;}
export const publicFileURL=()=>'';
export async function fileURL(path){
  if(blobs.has(path))return blobs.get(path);if(pendingFiles.has(path))return pendingFiles.get(path);
  const generation=fileEpoch;
  const task=(async()=>{const data=await bridge.call('fileRead',{path});if(fileEpoch!==generation)throw new Error('Sesi berubah.');const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:data.mime}));blobs.set(path,url);return url;})();
  pendingFiles.set(path,task);try{return await task;}finally{if(pendingFiles.get(path)===task)pendingFiles.delete(path);}
}
export async function readHtmlFile(path){
  const data=await bridge.call('fileRead',{path});
  if(data?.html!==undefined)return data.html;
  if(data?.base64){
    const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }
  throw new Error('Konten buku digital tidak ditemukan.');
}
export async function removeFile(path){await bridge.call('fileRemove',{path});if(blobs.has(path))URL.revokeObjectURL(blobs.get(path));blobs.delete(path);}
export function clearFiles(){fileEpoch++;for(const url of blobs.values())URL.revokeObjectURL(url);blobs.clear();pendingFiles.clear();}
export function errorMessage(e){return e?.message||'Operasi gagal. Periksa koneksi internet.';}

function setSession(data){
  if(data?.serverTime)recordServerTime(data.serverTime);
  writeSavedSession(data);
  sessionToken=data?.token||'';
  auth.currentUser=data?{...data.user,getIdToken:async()=>sessionToken}:null;
  epoch++;cache={};cacheUID=auth.currentUser?.uid||'';inFlight=null;clearFiles();
  for(const w of watchers)w.last=Symbol();
  for(const cb of authObservers)cb(auth.currentUser);
  if(configured)queueMicrotask(()=>sync().catch(()=>{}));
}
export function accountFrame(mode='login'){
  requireStorage();const channel=crypto.randomUUID();let target,origin;
  const handler=event=>{const d=event.data;if(!d||d.channel!==channel||(!/^https:\/\/(?:[a-z0-9-]+\.)?googleusercontent\.com$/.test(event.origin)&&event.origin!=='https://script.google.com'))return;
    if(d.type==='haura-account-ready'&&!target){target=event.source;origin=event.origin;if(mode==='change')target.postMessage({type:'haura-account-session',channel,token:sessionToken},origin);return;}
    if(d.type!=='haura-account-done'||event.source!==target||event.origin!==origin)return;
    if(!d.data?.token||!d.data?.user?.uid)return;window.removeEventListener('message',handler);setSession(d.data);document.dispatchEvent(new Event('haura-account-complete'));
  };
  window.addEventListener('message',handler);setTimeout(()=>window.removeEventListener('message',handler),20*60*1000);
  const src=driveConfig.webAppUrl+'?view=account&mode='+encodeURIComponent(mode)+'&channel='+channel+'&parentOrigin='+encodeURIComponent(location.origin);
  return '<iframe title="Akun Haura" referrerpolicy="no-referrer" src="'+src+'" style="width:100%;height:540px;border:0;background:white"></iframe>';
}
export async function resetMember(uid){return bridge.call('authReset',{uid});}
export async function paidEnroll(payload){return runAndSync('paidEnroll',payload);}
export async function submitPayment(payload){return runAndSync('submitPayment',payload);}
export async function recordCashPayment(payload){return runAndSync('recordCashPayment',payload);}
export async function confirmPayment(payload){return runAndSync('confirmPayment',payload);}
export async function verifyReceipt(receiptNumber){return bridge.call('verifyReceipt',{receiptNumber});}
export async function saveEvaluation(payload){return runAndSync('saveEvaluation',payload);}
export async function subscribeChat(payload){return runAndSync('subscribeChat',payload);}
export async function reviewChatPayment(payload){return runAndSync('reviewChatPayment',payload);}
export async function subscribeAccess(payload){return runAndSync('subscribeAccess',payload);}
export async function reviewAccessPayment(payload){return runAndSync('reviewAccessPayment',payload);}
export async function setUserAccess(payload){return runAndSync('setUserAccess',payload);}
export async function donate(payload){return runAndSync('donate',payload);}
export async function reviewDonation(payload){return runAndSync('reviewDonation',payload);}
export async function orderAlkes(payload){return runAndSync('orderAlkes',payload);}
export async function reviewAlkesOrder(payload){return runAndSync('reviewAlkesOrder',payload);}
export async function addExpense(payload){return runAndSync('addExpense',payload);}
export async function removeExpense(expenseId){return runAndSync('removeExpense',{expenseId});}
