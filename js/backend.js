/* HAURA v3.6 — JEMBATAN DATA (GitHub Pages <-> Google Apps Script + Drive)
   ============================================================================
   File ini MENGGANTIKAN js/backend.js versi 3.0 yang lama.

   Masalah yang diperbaiki:
   js/app.js versi 3.6 memanggil 16 fungsi yang TIDAK ADA di backend.js 3.0:
     uploadFile, saveCMS, setMemberStatus, submitPaidEnrollment, submitInstallment,
     directCashEnroll, confirmPayment(ada)/rejectPayment, confirmAccessPayment,
     rejectAccessPayment, confirmChatPayment, rejectChatPayment, confirmAlkesOrder,
     rejectAlkesOrder, confirmDonation, rejectDonation, functionsInstance
   Setiap panggilan itu melempar "TypeError: B.xxx is not a function", sehingga
   unggah foto/bukti/video GAGAL, pengaturan beranda GAGAL disimpan, chat GAGAL
   terkirim, dan video beranda tidak pernah terunggah.

   Selain itu path unggahan versi 3.6 (avatars/, paymentProofs/, banners/, hero/,
   branding/, qris/, alkesCatalog/, certAssets/, chatPayments/, accessPayments/,
   alkesOrders/, pmkDocs/, ebooks/*.html) TIDAK diizinkan oleh path_() di
   apps-script/Code.gs. File ini memetakan path tersebut ke path yang sah.

   Tidak ada token/password yang disimpan di file ini.
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

const auth={currentUser:initialSession?{...initialSession.user,getIdToken:async()=>sessionToken}:null};
const authObservers=new Set();
let cache={}, cacheUID=auth.currentUser?.uid||null, epoch=0, fileEpoch=0, inFlight=null, adminFlag=false;
const bridge=createBridge(effectiveConfig,()=>auth?.currentUser), watchers=new Set(), blobs=new Map(), pendingFiles=new Map();
export const storageConfigured=bridge.configured;
export const requireStorage=()=>{if(!storageConfigured)throw new Error('Konfigurasi webAppUrl di js/drive-config.js belum diisi.');};
export async function init(){return configured;}
export const authInstance=()=>auth;
export const dbInstance=()=>null;
export const stamp=()=>({__serverTime:true});

/* Koleksi 'cms' di js/app.js sebenarnya dokumen settings/public di server.
   Tanpa alias ini, watch('cms') selalu menerima array kosong sehingga judul,
   logo, banner, dan videoPath yang disimpan admin TIDAK PERNAH sampai ke
   beranda — video tidak pernah berputar walau sudah diunggah. */
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
async function mutate(ops){return runAndSync('mutate',{ops});}
export const create=(c,id,data)=>mutate([{op:'set',c,id,data}]);
export async function patch(c,id,data){
  const row={...data};
  if(['programs','news','alkes'].includes(c)&&typeof row.published!=='boolean'&&row.archived===undefined)row.published=true;
  return mutate([{op:'patch',c,id,data:row}]);
}
export const remove=(c,id)=>mutate([{op:'remove',c,id}]);

/* ============================================================================
   1. PEMETAAN PATH UNGGAHAN
   js/app.js memakai nama folder versi 3.6 yang tidak ada di daftar putih
   path_() pada apps-script/Code.gs. Fungsi ini menerjemahkannya.
   ========================================================================== */
const seg=s=>{
  const v=String(s??'').replace(/[^A-Za-z0-9-]/g,'').slice(0,100);
  return v||('f-'+Math.random().toString(36).slice(2,12));
};
const PATH_RULES=[
  [/^avatars\/([^/]+)\/([^/]+)$/,m=>'profiles/'+seg(m[1])+'/'+seg(m[2])],
  [/^paymentProofs\/([^/]+)\/([^/]+)$/,m=>'proofs/'+seg(m[1])+'/'+seg(m[2])],
  [/^accessPayments\/([^/]+)\/([^/]+)$/,m=>'proofs/'+seg(m[1])+'/'+seg(m[2])],
  [/^chatPayments\/([^/]+)\/([^/]+)$/,m=>'proofs/'+seg(m[1])+'/'+seg(m[2])],
  [/^alkesOrders\/([^/]+)\/([^/]+)$/,m=>'proofs/'+seg(m[1])+'/'+seg(m[2])],
  [/^pmkDocs\/([^/]+)\/([^/]+)$/,m=>'proofs/'+seg(m[1])+'/'+seg(m[2])],
  [/^certificates\/([^/]+)\/([^/]+)$/,m=>'certificates/'+seg(m[1])+'/'+seg(m[2])],
  [/^ebooks\/([^/]+)\/([^/]+)$/,m=>'ebooks/'+seg(m[1])+'/'+seg(m[2])],
  [/^banners\/([^/]+)$/,m=>'public/banners/'+seg(m[1])],
  [/^branding\/([^/]+)$/,m=>'public/logo/'+seg(m[1])],
  [/^hero\/([^/]+)$/,m=>'public/videos/'+seg(m[1])],
  [/^qris\/([^/]+)$/,m=>'public/qris/'+seg(m[1])],
  [/^alkesCatalog\/([^/]+)$/,m=>'public/alkes/'+seg(m[1])],
  [/^certAssets\/([^/]+)$/,m=>'public/sign/'+seg(m[1])],
  [/^donations\/([^/]+)$/,m=>'public/donations/'+seg(m[1])]
];
const SERVER_PATH=/^(?:profiles|proofs|certificates|ebooks)\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+$|^public\/(?:qris|logo|alkes|videos|certs|banners|charity|donations|sign)\/[A-Za-z0-9-]+$/;
export function toServerPath(path){
  const p=String(path||'');
  if(SERVER_PATH.test(p))return p;
  for(const [re,fn] of PATH_RULES){const m=p.match(re);if(m)return fn(m);}
  return p;
}

/* ============================================================================
   2. UNGGAH BERKAS (foto, bukti bayar, banner, logo, video, e-book HTML)
   Batas keras server: base64 <= 13.981.024 karakter dan isi <= 5 MB
   (10 MB khusus certificates/). Video dibatasi 5 MB oleh server.
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

  // Amal (donasi) ditulis oleh server lewat endpoint donate, bukan fileWrite.
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
   3. SIMPAN PENGATURAN BERANDA (setara B.saveCMS)
   ========================================================================== */
function mapCertConfig(cfg){
  const c={...cfg};
  if(c.signaturePath)c.signaturePath=toServerPath(c.signaturePath);
  if(c.stampPath)c.stampPath=toServerPath(c.stampPath);
  return c;
}
function mapCMS(cms){
  const data={...cms};
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
  if(cms.qrisPath)data.qrisPath=toServerPath(cms.qrisPath);
  if(cms.logoPath)data.logoPath=toServerPath(cms.logoPath);
  if(cms.videoPath)data.videoPath=toServerPath(cms.videoPath);
  if(cms.certConfig)data.certConfig=mapCertConfig(cms.certConfig);
  data.banners=Array.isArray(cms.banners)?cms.banners.map(b=>({...b,imagePath:toServerPath(b.imagePath)})).slice(0,20):[];
  return data;
}
export async function saveCMS(cms){
  requireStorage();
  return mutate([{op:'patch',c:'settings',id:'public',data:mapCMS(cms||{})}]);
}

/* ============================================================================
   4. TULIS DATA: add() dirutekan ke endpoint transaksi yang benar
   writeOne_ menolak chatPayments/accessPayments/alkesOrders/expenses/
   evaluationSubmissions dan paksa lewat endpoint khusus.
   ========================================================================== */
export async function add(c,data){
  requireStorage();
  if(c==='donations'){
    /* Pencatatan penyaluran dana oleh admin memakai status 'distributed',
       bukan donasi masuk. Tanpa cabang ini, penyaluran amal ikut tercatat
       sebagai donasi pending dan saldo Celengan Amal menjadi salah. */
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
    return {id:data?.id||''};
  }
  if(c==='chatPayments'){
    await runAndSync('subscribeChat',{proofPath:toServerPath(data?.proofPath)});
    await sync().catch(()=>{});
    return {id:data?.id||''};
  }
  if(c==='alkesOrders'){
    await runAndSync('orderAlkes',{
      items:data?.items||[],
      proofPath:toServerPath(data?.proofPath),
      shippingNote:String(data?.shippingNote||'')
    });
    await sync().catch(()=>{});
    return {id:data?.id||''};
  }
  if(c==='expenses'){
    const res=await runAndSync('addExpense',{
      programId:String(data?.programId||''),
      category:String(data?.category||'BMHP'),
      description:String(data?.description||''),
      amount:Number(data?.amount||0),
      date:String(data?.date||'')
    });
    await sync().catch(()=>{});
    return {id:res?.id||''};
  }
  if(c==='settings'){
    const id='public';
    await mutate([{op:'set',c,id,data:mapCMS(data)}]);
    return {id};
  }
  const id=crypto.randomUUID();
  const row={...data};
  /* Server hanya menampilkan baris dengan published===true (canRead_), dan
     orderAlkes menolak produk published!==true. Form admin tidak pernah
     mengirim published, jadi program/produk/berita baru tidak pernah terlihat
     peserta. Default di sini menutup celah itu. */
  if(['programs','news','alkes'].includes(c)&&typeof row.published!=='boolean')row.published=true;
  if(row.archived===undefined&&['programs','news','alkes'].includes(c))row.archived=false;
  await create(c,id,row);
  return {id};
}

/* ============================================================================
   5. FUNGSI YANG HILANG DI backend.js 3.0 (penyebab utama fitur gagal)
   ========================================================================== */
export async function setMemberStatus(userId,status){
  return mutate([{op:'patch',c:'users',id:userId,data:{status}}]);
}
export async function submitPaidEnrollment(payload){
  return runAndSync('paidEnroll',{
    programId:payload?.programId,
    amount:Number(payload?.amount||0),
    proofPath:toServerPath(payload?.proofPath),
    method:'transfer'
  });
}
export async function submitInstallment(payload){
  return runAndSync('submitPayment',{
    enrollmentId:payload?.enrollmentId,
    amount:Number(payload?.amount||0),
    proofPath:toServerPath(payload?.proofPath),
    method:'transfer'
  });
}
export async function directCashEnroll(payload){
  return runAndSync('recordCashPayment',{
    userId:payload?.userId,
    programId:payload?.programId,
    amount:Number(payload?.amount||0),
    note:String(payload?.note||''),
    label:String(payload?.label||'')
  });
}
export async function submitPayment(payload){
  const enr=String(payload?.enrollmentId||'');
  if(enr)return submitInstallment(payload);
  return runAndSync('paidEnroll',payload);
}
export async function confirmPayment(payload){
  return runAndSync('confirmPayment',{...payload,decision:'confirmed'});
}
export async function rejectPayment(payload){
  return runAndSync('confirmPayment',{...payload,decision:'rejected'});
}
export async function confirmAccessPayment(payload){
  return runAndSync('reviewAccessPayment',{paymentId:payload?.paymentId||payload?.id,decision:'confirmed',note:String(payload?.note||'')});
}
export async function rejectAccessPayment(payload){
  return runAndSync('reviewAccessPayment',{paymentId:payload?.paymentId||payload?.id,decision:'rejected',note:String(payload?.note||'')});
}
export async function confirmChatPayment(payload){
  return runAndSync('reviewChatPayment',{paymentId:payload?.paymentId||payload?.id,decision:'confirmed',note:String(payload?.note||'')});
}
export async function rejectChatPayment(payload){
  return runAndSync('reviewChatPayment',{paymentId:payload?.paymentId||payload?.id,decision:'rejected',note:String(payload?.note||'')});
}
export async function confirmAlkesOrder(payload){
  return runAndSync('reviewAlkesOrder',{orderId:payload?.orderId||payload?.id,decision:'confirmed',note:String(payload?.note||'')});
}
export async function rejectAlkesOrder(payload){
  return runAndSync('reviewAlkesOrder',{orderId:payload?.orderId||payload?.id,decision:'rejected',note:String(payload?.note||'')});
}
export async function confirmDonation(payload){
  return runAndSync('reviewDonation',{donationId:payload?.donationId||payload?.id,decision:'confirmed',published:true,note:String(payload?.note||'')});
}
export async function rejectDonation(payload){
  return runAndSync('reviewDonation',{donationId:payload?.donationId||payload?.id,decision:'rejected',published:false,note:String(payload?.note||'')});
}
export const functionsInstance=()=>({app:'haura',region:'apps-script'});

async function sendChatMessage(payload){
  const uid=auth.currentUser?.uid;
  if(!uid)throw new Error('Silakan masuk terlebih dahulu.');
  const peer=String(payload?.peerId||uid);
  const id=crypto.randomUUID();
  const isSbar=payload?.kind==='sbar';
  const body=isSbar
    ?{senderId:uid,kind:'sbar',text:'',sbar:{s:String(payload?.sbar?.s||''),b:String(payload?.sbar?.b||''),a:String(payload?.sbar?.a||''),r:String(payload?.sbar?.r||'')},createdAt:stamp()}
    :{senderId:uid,kind:'text',text:String(payload?.text||'').slice(0,4000),createdAt:stamp()};
  const write=role=>mutate([{op:'set',c:'conversations/'+peer+'/messages',id,data:{...body,senderRole:role}}]);
  const roles=adminFlag?['admin','peserta']:['peserta','admin'];
  let lastError=null;
  for(const role of roles){
    try{await write(role);return {ok:true};}catch(e){lastError=e;}
  }
  throw lastError||new Error('Pesan gagal dikirim.');
}

/* ============================================================================
   6. KOMPATIBILITAS API GAYA FIREBASE YANG DIPAKAI js/app.js
   ========================================================================== */
export const F={
  where:(field,op,value)=>{if(op!=='==')throw new Error('Filter tidak didukung.');return {type:'where',field,value};},
  orderBy:(field,direction)=>({type:'orderBy',field,direction}),limit:count=>({type:'limit',count}),
  documentId:()=>'id',
  doc:(_db,c,id)=>({c,id}),onSnapshot:(ref,ok,fail)=>subscribe(ref.c,[],ok,fail,ref.id),
  httpsCallable:(_inst,name)=>{
    if(name==='sendMessage')return sendChatMessage;
    return async()=>{throw new Error('Fungsi '+name+' belum tersedia.');};
  },
  async getIdTokenResult(){
    try{
      const identity=await bridge.call('identity');
      if(identity?.serverTime)recordServerTime(identity.serverTime);
      adminFlag=identity?.admin===true;
      return {claims:{admin:adminFlag}};
    }catch(e){
      if(/^Sesi|^Wajib mengganti/.test(e.message)&&auth.currentUser)setSession(null);
      throw e;
    }
  },
  onAuthStateChanged:(_a,cb)=>{authObservers.add(cb);queueMicrotask(()=>cb(auth.currentUser));return()=>authObservers.delete(cb);},
  async signOut(){try{if(auth.currentUser)await bridge.call('authLogout');}finally{setSession(null);}},
  async reload(){const id=await bridge.call('identity');if(id?.serverTime)recordServerTime(id.serverTime);adminFlag=id?.admin===true;},
  writeBatch:()=>{const ops=[];return {update:(ref,data)=>ops.push({op:'patch',...ref,data}),commit:()=>mutate(ops)};}
};

export const publicFileURL=()=>'';
export async function fileURL(path){
  const key=String(path||'');
  if(!key)throw new Error('Path berkas kosong.');
  if(blobs.has(key))return blobs.get(key);
  if(pendingFiles.has(key))return pendingFiles.get(key);
  const generation=fileEpoch;
  const task=(async()=>{
    const data=await bridge.call('fileRead',{path:key});
    if(fileEpoch!==generation)throw new Error('Sesi berubah.');
    const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:data.mime}));
    blobs.set(key,url);
    return url;
  })();
  pendingFiles.set(key,task);
  try{return await task;}finally{if(pendingFiles.get(key)===task)pendingFiles.delete(key);}
}
export async function readHtmlFile(path){
  const data=await bridge.call('fileRead',{path:toServerPath(path)});
  if(data?.html!==undefined)return data.html;
  if(data?.base64){
    const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }
  throw new Error('Konten buku digital tidak ditemukan.');
}
export async function removeFile(path){
  const target=toServerPath(path);
  await bridge.call('fileRemove',{path:target});
  if(blobs.has(target))URL.revokeObjectURL(blobs.get(target));
  blobs.delete(target);
  if(blobs.has(path))URL.revokeObjectURL(blobs.get(path));
  blobs.delete(path);
}
export function clearFiles(){
  fileEpoch++;
  for(const url of blobs.values())URL.revokeObjectURL(url);
  blobs.clear();pendingFiles.clear();donationUploads.clear();
}
export function errorMessage(e){return e?.message||'Operasi gagal. Periksa koneksi internet.';}

function setSession(data){
  if(data?.serverTime)recordServerTime(data.serverTime);
  writeSavedSession(data);
  sessionToken=data?.token||'';
  auth.currentUser=data?{...data.user,getIdToken:async()=>sessionToken}:null;
  adminFlag=false;
  epoch++;cache={};cacheUID=auth.currentUser?.uid||'';inFlight=null;clearFiles();
  for(const w of watchers)w.last=Symbol();
  for(const cb of authObservers)cb(auth.currentUser);
  if(configured)queueMicrotask(()=>sync().catch(()=>{}));
}
export function accountFrame(mode='login'){
  requireStorage();const channel=crypto.randomUUID();let target,origin;
  const handler=event=>{
    const d=event.data;
    if(!d||d.channel!==channel||(!/^https:\/\/(?:[a-z0-9-]+\.)?googleusercontent\.com$/.test(event.origin)&&event.origin!=='https://script.google.com'))return;
    if(d.type==='haura-account-ready'&&!target){
      target=event.source;origin=event.origin;
      if(mode==='change')target.postMessage({type:'haura-account-session',channel,token:sessionToken},origin);
      return;
    }
    if(d.type!=='haura-account-done'||event.source!==target||event.origin!==origin)return;
    if(!d.data?.token||!d.data?.user?.uid)return;
    window.removeEventListener('message',handler);
    const modal=document.querySelector('#modal');
    if(modal?.open){modal.close();const body=document.querySelector('#modal-body');if(body)body.innerHTML='';}
    setSession(d.data);
    document.dispatchEvent(new Event('haura-account-complete'));
  };
  window.addEventListener('message',handler);
  setTimeout(()=>window.removeEventListener('message',handler),20*60*1000);
  const src=effectiveConfig.webAppUrl+'?view=account&mode='+encodeURIComponent(mode)+'&channel='+channel+'&parentOrigin='+encodeURIComponent(location.origin);
  return '<iframe title="Akun Haura" referrerpolicy="no-referrer" src="'+src+'" style="width:100%;height:540px;border:0;background:white"></iframe>';
}
export async function resetMember(uid){return bridge.call('authReset',{uid});}
export async function paidEnroll(payload){return submitPaidEnrollment(payload);}
export async function recordCashPayment(payload){
  const [uId,pId]=String(payload?.enrollmentId||'').split('_');
  return runAndSync('recordCashPayment',{...payload,userId:payload?.userId||uId,programId:payload?.programId||pId});
}
export async function verifyReceipt(receiptNumber){
  const found=await bridge.call('verifyReceipt',{receiptNumber});
  return found?{valid:true,receipt:found}:{valid:false,receipt:null};
}
export async function saveEvaluation(payload){return runAndSync('saveEvaluation',payload);}
export async function saveCertConfig(payload){
  const args=payload&&Object.prototype.hasOwnProperty.call(payload,'certConfig')?payload:{certConfig:payload};
  if(args.certConfig)args.certConfig=mapCertConfig(args.certConfig);
  return runAndSync('saveCertConfig',args);
}
export async function startEvaluation(payload){
  const args=typeof payload==='string'?{evaluationId:payload}:payload;
  const result=await runAndSync('startEvaluation',args);
  if(result?.serverTime)recordServerTime(result.serverTime);
  return result;
}
export async function submitEvaluation(payload){return runAndSync('submitEvaluation',payload);}
export async function resetEvaluationSubmission(payload){return runAndSync('resetEvaluationSubmission',payload);}
export async function subscribeChat(payload){return runAndSync('subscribeChat',payload);}
export async function reviewChatPayment(payload){return runAndSync('reviewChatPayment',payload);}
export async function subscribeAccess(payload){return runAndSync('subscribeAccess',payload);}
export async function reviewAccessPayment(payload){return runAndSync('reviewAccessPayment',payload);}
export async function setUserAccess(payload){return runAndSync('setUserAccess',payload);}
export async function donate(payload){return runAndSync('donate',payload);}
export async function reviewDonation(payload){
  const args=payload?.decision==='distribute'?{...payload,mode:'distribute',note:payload.note||payload.distributionTarget||''}:payload;
  return runAndSync('reviewDonation',args);
}
export async function orderAlkes(payload){return runAndSync('orderAlkes',payload);}
export async function reviewAlkesOrder(payload){return runAndSync('reviewAlkesOrder',payload);}
export async function addExpense(payload){return runAndSync('addExpense',payload);}
export async function removeExpense(expenseId){return runAndSync('removeExpense',{expenseId});}
export async function freeEnroll(programId){return runAndSync('freeEnroll',{programId});}

export const B={
  configured,getServerTime,storageConfigured,requireStorage,init,authInstance,dbInstance,stamp,
  watch,read,create,patch,remove,add,F,validateFile,upload,uploadFile,publicFileURL,fileURL,
  readHtmlFile,removeFile,clearFiles,errorMessage,accountFrame,resetMember,paidEnroll,submitPayment,
  submitPaidEnrollment,submitInstallment,directCashEnroll,recordCashPayment,confirmPayment,
  rejectPayment,confirmAccessPayment,rejectAccessPayment,confirmChatPayment,rejectChatPayment,
  confirmAlkesOrder,rejectAlkesOrder,confirmDonation,rejectDonation,saveCMS,setMemberStatus,
  functionsInstance,verifyReceipt,saveEvaluation,saveCertConfig,startEvaluation,submitEvaluation,
  resetEvaluationSubmission,subscribeChat,reviewChatPayment,subscribeAccess,reviewAccessPayment,
  setUserAccess,donate,reviewDonation,orderAlkes,reviewAlkesOrder,addExpense,removeExpense,freeEnroll
};
export const upload=uploadFile;
export default B;
