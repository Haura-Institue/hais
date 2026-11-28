/* HAURA v3.6 — JEMBATAN DATA (GitHub Pages <-> Google Apps Script + Drive)
   ============================================================================
   Sudah diperbaiki:
   1. Urutan deklarasi `upload` sebelum ekspor objek `B`.
   2. Pembersihan fungsi (`toDate`) & konversi `{ __hauraTime }` ke ISO string
      sebelum `postMessage` (mencegah DataCloneError).
   3. Penghapusan otomatis kolom terlarang (`id`, `__proto__`, `constructor`,
      `prototype`) pada `op.data` sebelum dikirim ke `Code.gs` (mencegah error
      "Nama kolom dilarang.").
   4. Pemetaan path otomatis (`certAssets/`, `banners/`, `branding/`, `hero/`,
      `qris/`) pada `patch()` maupun `create()` untuk koleksi `settings`.
*/

import {driveConfig} from './drive-config.js';
import {createBridge,revive,selectRows} from './drive-client.js';

const FALLBACK_WEB_APP_URL='https://script.google.com/macros/s/AKfycbxMrI2VcflA1JxS-kjSmYA7DW14R8NQbDhBUB7ZblPFMKN0k5bikt_GKYcaHYI8vjwbpQ/exec';
const effectiveConfig={
  ...driveConfig,
  webAppUrl:String(driveConfig?.webAppUrl||'').trim()||FALLBACK_WEB_APP_URL
};
export const configured=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(effectiveConfig.webAppUrl);

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

/* Bersihkan fungsi/metode dan ubah objek timestamp {__hauraTime} menjadi string ISO
   agar aman saat dikirim via window.postMessage ke iframe Apps Script. */
function sanitizeCloneable(value,seen=new WeakSet()){
  if(value===null||typeof value!=='object'){
    return (typeof value==='function'||typeof value==='symbol')?undefined:value;
  }
  if(Object.prototype.hasOwnProperty.call(value,'__hauraTime')){
    const ms=Number(value.__hauraTime);
    return Number.isFinite(ms)?new Date(ms).toISOString():null;
  }
  if(value instanceof Date)return new Date(value.getTime());
  if(value instanceof ArrayBuffer||ArrayBuffer.isView(value))return value;
  if(typeof Blob!=='undefined'&&value instanceof Blob)return value;
  if(seen.has(value))return undefined;
  seen.add(value);
  if(Array.isArray(value)){
    return value.map(item=>{
      const clean=sanitizeCloneable(item,seen);
      return clean===undefined?null:clean;
    });
  }
  const out={};
  for(const [k,v] of Object.entries(value)){
    if(typeof v==='function'||typeof v==='symbol'||v===undefined)continue;
    if(k.startsWith('__')&&k!=='__serverTime')continue;
    const clean=sanitizeCloneable(v,seen);
    if(clean!==undefined)out[k]=clean;
  }
  return out;
}

/* Hapus properti yang dilarang fungsi time_() di Code.gs ('id', '__proto__', dll.)
   dari payload data sebelum dikirim ke mutate(). */
function stripForbiddenKeys(value,seen=new WeakSet()){
  if(value===null||typeof value!=='object')return value;
  if(seen.has(value))return undefined;
  seen.add(value);
  if(Array.isArray(value))return value.map(item=>stripForbiddenKeys(item,seen));
  const out={};
  for(const [k,v] of Object.entries(value)){
    if(k==='id'||k==='__proto__'||k==='constructor'||k==='prototype')continue;
    out[k]=stripForbiddenKeys(v,seen);
  }
  return out;
}

const auth={currentUser:initialSession?{...initialSession.user,getIdToken:async()=>sessionToken}:null};
const authObservers=new Set();
let cache={}, cacheUID=auth.currentUser?.uid||null, epoch=0, fileEpoch=0, inFlight=null, adminFlag=false;
const rawBridge=createBridge(effectiveConfig,()=>auth?.currentUser);
const bridge={
  ...rawBridge,
  call:(action,args)=>rawBridge.call(action,args===undefined?undefined:sanitizeCloneable(args))
};
const watchers=new Set(), blobs=new Map(), pendingFiles=new Map();
export const storageConfigured=bridge.configured;
export const requireStorage=()=>{if(!storageConfigured)throw new Error('Konfigurasi webAppUrl di js/drive-config.js belum diisi.');};
export async function init(){return configured;}
export const authInstance=()=>auth;
export const dbInstance=()=>null;
export const stamp=()=>({__serverTime:true});

/* Koleksi 'cms' di js/app.js sebenarnya dokumen settings/public di server. */
const ALIAS={cms:{c:'settings',id:'public'}};
function collectionRows(c){
  if(c==='cms'){
    const row=(cache.settings||[]).find(r=>r.id==='public');
    return row?[row]:[];
  }
  return cache[c]||[];
}
function emit(){
  for(const w of [...watchers]){
    try{
      const rows=selectRows(revive(collectionRows(w.c)),w.filters);
      const value=w.id?rows.find(r=>r.id===w.id):rows;
      const encoded=JSON.stringify(value);
      if(encoded===w.last)continue;
      w.last=encoded;
      if(w.id)w.ok({id:w.id,exists:()=>!!value,data:()=>value});
      else w.ok(value);
    }catch(e){w.fail?.(e);}
  }
}
async function sync(){
  const who=auth?.currentUser?.uid||'';
  if(cacheUID!==who){epoch++;cache={};cacheUID=who;inFlight=null;clearFiles();}
  if(inFlight)return inFlight;
  const generation=epoch;
  const job=(async()=>{
    try{
      const data=await bridge.call('snapshot');
      if(generation!==epoch||(auth?.currentUser?.uid||'')!==who)return;
      if(data?.__serverTime)recordServerTime(data.__serverTime);
      cache=data;emit();
    }catch(e){
      if(generation===epoch)for(const w of [...watchers])w.fail?.(e);
      if(/^Sesi|^Wajib mengganti/.test(e.message)&&auth.currentUser)setSession(null);
      throw e;
    }
  })();
  inFlight=job;
  try{await job;}finally{if(inFlight===job)inFlight=null;}
}
setInterval(()=>{if(watchers.size&&!document.hidden&&bridge.configured)sync().catch(()=>{});},Math.max(20000,effectiveConfig.pollMs||30000));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&watchers.size&&bridge.configured)sync().catch(()=>{});});
function subscribe(c,filters,ok,fail,id){const w={c,filters,ok,fail,id,last:Symbol()};watchers.add(w);if(bridge.configured)queueMicrotask(()=>sync().catch(()=>{}));return()=>watchers.delete(w);}
export const watch=(c,filters,ok,fail)=>subscribe(c,filters,ok,fail);
export async function read(c,id){
  const alias=ALIAS[c];
  const result=await bridge.call('read',{c:alias?alias.c:c,id:alias?alias.id:id});
  return revive(result);
}
async function runAndSync(action,args){const result=await bridge.call(action,args);if(inFlight)await inFlight.catch(()=>{});await sync().catch(()=>{});return result;}
async function mutate(ops){
  const cleanOps=(Array.isArray(ops)?ops:[]).map(op=>({
    ...op,
    data:op.data!==undefined?stripForbiddenKeys(op.data):undefined
  }));
  return runAndSync('mutate',{ops:cleanOps});
}
export const create=(c,id,data)=>{
  const row=c==='settings'?mapCMS(data||{}):data;
  return mutate([{op:'set',c,id,data:row}]);
};
export async function patch(c,id,data){
  const row=c==='settings'?mapCMS(data||{}):{...data};
  if(['programs','news','alkes'].includes(c)&&typeof row.published!=='boolean'&&row.archived===undefined)row.published=true;
  return mutate([{op:'patch',c,id,data:row}]);
}
export const remove=(c,id)=>mutate([{op:'remove',c,id}]);

/* ============================================================================
   1. PEMETAAN PATH UNGGAHAN
   ========================================================================== */
const seg=s=>{
  const v=String(s??'').replace(/[^A-Za-z0-9-]/g,'').slice(0,100);
  return v||('f-'+Math.random().toString(36).slice(2,12));
};
const PATH_RULES=[
  [/^avatars\/([^/]+)\/([^/]+)$/,m=>'profiles/'+seg(m[1])+'/'+seg(m[2])],
  [/^paymentProofs\/([^/]+)\/([^/]+)$/,m=>'proofs/'+seg(m[1])+'/'+seg(m[2])], [/^accessPayments\/([^/]+)\/([^/]+)$/,m=>'proofs/'+seg(m[1])+'/'+seg(m[2])],
  [/^chatPayments\/([^/]+)\/([^/]+)$/,m=>'proofs/'+seg(m[1])+'/'+seg(m[2])], [/^alkesOrders\/([^/]+)\/([^/]+)$/,m=>'proofs/'+seg(m[1])+'/'+seg(m[2])],
  [/^pmkDocs\/([^/]+)\/([^/]+)$/,m=>'proofs/'+seg(m[1])+'/'+seg(m[2])], [/^certificates\/([^/]+)\/([^/]+)$/,m=>'certificates/'+seg(m[1])+'/'+seg(m[2])],
  [/^ebooks\/([^/]+)\/([^/]+)$/,m=>'ebooks/'+seg(m[1])+'/'+seg(m[2])], [/^banners\/([^/]+)$/,m=>'public/banners/'+seg(m[1])],
  [/^branding\/([^/]+)$/,m=>'public/logo/'+seg(m[1])], [/^hero\/([^/]+)$/,m=>'public/videos/'+seg(m[1])],
  [/^qris\/([^/]+)$/,m=>'public/qris/'+seg(m[1])], [/^alkesCatalog\/([^/]+)$/,m=>'public/alkes/'+seg(m[1])],
  [/^certAssets\/([^/]+)$/,m=>'public/sign/'+seg(m[1])], [/^donations\/([^/]+)$/,m=>'public/donations/'+seg(m[1])]
];
const SERVER_PATH=/^(?:profiles|proofs|certificates|ebooks)\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+$\vert{}^public\/(?:qris\vert{}logo\vert{}alkes\vert{}videos\vert{}certs\vert{}banners\vert{}charity\vert{}donations\vert{}sign)\/[A-Za-z0-9-]+$/;
export function toServerPath(path){
  const p=String(path||'');
  if(SERVER_PATH.test(p))return p;
  for(const [re,fn] of PATH_RULES){const m=p.match(re);if(m)return fn(m);}
  return p;
}

/* ============================================================================
   2. UNGGAH BERKAS
   ========================================================================== */
function mimeOf(file){return String(file?.type||'application/octet-stream').split(';')[0].trim().toLowerCase();}
export function validateFile(file,allowed=['image/jpeg','image/png','image/webp'],max=5*1024*1024){
  const limit=Math.min(max,10*1024*1024);
  if(!file)throw new Error('Berkas belum dipilih.');
  const type=mimeOf(file);
  if(!allowed.includes(type))throw new Error('Format berkas tidak didukung. Gunakan: '+allowed.join(', ')+'.');
  if(!file.size)throw new Error('Berkas kosong atau gagal dibaca.');
  if(file.size>limit)throw new Error('Ukuran berkas '+Math.ceil(file.size/1048576)+' MB melebihi batas '+Math.floor(limit/1048576)+' MB. Perkecil/kompres dulu.');
}
function readBase64(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result).split(',')[1]||'');
    r.onerror=()=>reject(new Error('Gagal membaca berkas dari perangkat.'));
    r.readAsDataURL(file);
  });
}
const donationUploads=new Map();

export async function uploadFile(path,file,opts={}){
  requireStorage();
  const types=opts.types||['image/jpeg','image/png','image/webp'];
  const maxBytes=Number(opts.maxBytes||5*1024*1024);
  validateFile(file,types,maxBytes);
  const mime=mimeOf(file);
  const serverPath=toServerPath(path);

  if(/^public\/donations\//.test(serverPath)){
    const base64=await readBase64(file);
    const token='donation-upload:'+seg(path);
    donationUploads.set(token,{base64,mime});
    return {path:token,serverPath:'',mime,size:file.size};
  }

  const hardLimit=/^certificates\//.test(serverPath)?10*1024*1024:5*1024*1024;
  if(file.size>hardLimit)throw new Error('Batas server untuk berkas ini '+Math.floor(hardLimit/1048576)+' MB. Kompres dulu (video: 480p/720p, ±30 detik).');

  const base64=await readBase64(file);
  if(!base64)throw new Error('Berkas gagal dikonversi.');
  await bridge.call('fileWrite',{path:serverPath,mime,base64});
  return {path:serverPath,mime,size:file.size};
}

/* ============================================================================
   3. SIMPAN PENGATURAN BERANDA & SERTIFIKAT
   ========================================================================== */
function mapCertConfig(cfg){
  const c={...cfg};
  delete c.id;
  delete c.updatedAt;
  delete c.createdAt;
  delete c.updatedBy;
  if(c.signaturePath)c.signaturePath=toServerPath(c.signaturePath);
  if(c.stampPath)c.stampPath=toServerPath(c.stampPath);
  return c;
}
function mapCMS(cms){
  const data={...cms};
  delete data.id;
  delete data.updatedAt;
  delete data.createdAt;
  delete data.updatedBy;
  delete data.charity;
  delete data.bannersRaw;
  if(cms.charity){
    const ch=cms.charity;
    data.charityConfig={
      ...(cms.charityConfig||{}),
      enabled:ch.enabled!==false,
      title:String(ch.title||'Celengan Amal Haura').slice(0,180),
      description:String(ch.description||'').slice(0,2000),
      totalCollected:Number(ch.totalCollected||0),
      totalDistributed:Number(ch.totalDistributed||0)
    };
  }
  if(data.charityConfig&&typeof data.charityConfig==='object'&&data.charityConfig.qrisPath){
    data.charityConfig={...data.charityConfig,qrisPath:toServerPath(data.charityConfig.qrisPath)};
  }
  if(cms.qrisPath)data.qrisPath=toServerPath(cms.qrisPath);
  if(cms.logoPath)data.logoPath=toServerPath(cms.logoPath);
  if(cms.videoPath)data.videoPath=toServerPath(cms.videoPath);
  if(cms.certConfig)data.certConfig=mapCertConfig(cms.certConfig);
  if(Array.isArray(cms.banners)){
    data.banners=cms.banners.map(b=>({...b,imagePath:toServerPath(b.imagePath)})).slice(0,20);
  }
  if(cms.bannerConfig&&typeof cms.bannerConfig==='object'){
    data.bannerConfig={...cms.bannerConfig};
    if(Array.isArray(cms.bannerConfig.slides)){
      data.bannerConfig.slides=cms.bannerConfig.slides.map(s=>({...s,imagePath:toServerPath(s.imagePath)})).slice(0,20);
    }
  }
  return data;
}
export async function saveCMS(cms){
  requireStorage();
  return mutate([{op:'patch',c:'settings',id:'public',data:mapCMS(cms||{})}]);
}

/* ============================================================================
   4. TULIS DATA
   ========================================================================== */
export async function add(c,data){
  requireStorage();
  if(c==='donations'){
    if(data?.status==='distributed'||data?.distributionTarget){
      await runAndSync('reviewDonation',{
        mode:'distribute',
        amount:Number(data?.amount||0),
        note:String(data?.distributionTarget||data?.note||''),
        proofPath:String(data?.proofPath||'')
      });
      await sync().catch(()=>{});
      return {id:data?.id||''};
    }
    const proof=String(data?.proofPath||'');
    const cached=donationUploads.get(proof);
    const res=await runAndSync('donate',{
      amount:Number(data?.amount||0),
      donorName:String(data?.donorName||'Hamba Allah'),
      note:String(data?.note||''),
      proofBase64:cached?.base64||'',
      proofMime:cached?.mime||''
    });
    if(cached)donationUploads.delete(proof);
    return {id:res?.id||''};
  }
  if(c==='accessPayments'){
    await runAndSync('subscribeAccess',{proofPath:toServerPath(data?.proofPath)});
    await sync().catch(()=>{});
