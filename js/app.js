import {installHelp} from './pwa.js';
import {HauraFinance} from './finance.js';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = v => HauraFinance.money(v);
const date = v => v?.toDate ? v.toDate().toLocaleString('id-ID') : (typeof v === 'string' && v ? new Date(v).toLocaleString('id-ID') : '');
const uid = () => crypto.randomUUID();
const author = 'Ns. Ahmad Fudhali, S.Kep.M.Tr.Kep.';
let B, me=null, profile=null, admin=false, registering=false, session=0, tab='catalog', chatSubTab='consult', targetChat='', chatStop=null, ownStop=null, subscriptions=[], publicSubscriptions=[], messageLimit=100, toastTimer;
let financeFilterProgram='ALL';
let certFilterProg='ALL', certFilterBatch='ALL';
let valFilterBatch='ALL';
let alkesCart={}, bajuCart={};
let activeReaderBookId='';
let verifyHandled=false;
let offlineBookIds=new Set();
let state={cms:{logoText:'HAURA',logoPath:'',welcomeTitle:'Tumbuh bersama. Merawat lebih baik.',welcomeText:'Pelatihan keperawatan, buku digital, konsultasi klinis, dan pendampingan praktik mandiri dalam satu portal.',chatFee:50000,chatDurationLabel:'30 Hari',videoUrl:'',videoPath:'',qrisPath:'',paymentInfo:'',certIndex:{}},programs:[],news:[],users:[],enrollments:[],chatPayments:[],alkes:[],alkesOrders:[],ebooks:[],certificates:[],expenses:[],messages:[]};
let certImages={main:'./assets/logo.png',partner:'',left:'',right:''};

const isOffline = () => !navigator.onLine;
const isOfflineSession = () => Boolean(me?.offline || isOffline());

/* ============================================================================
   ANTI-FREEZE / SMART RENDER SCHEDULER (CEGAH JEDA SAAT MENGETIK & BACA BUKU)
   ============================================================================ */
let lastUserInputAt = 0;
let pendingRefresh = false;
let refreshDebounceTimer = null;
let publicDebounceTimer = null;
const renderHashes = {};

function markUserActivity(){ lastUserInputAt = Date.now(); }

function isUserBusy(){
  const reader = $('#ebook-reader');
  if(reader && reader.style.display === 'flex') return true;
  if($('#modal')?.open) return true;
  if(Date.now() - lastUserInputAt < 2500) return true;
  const active = document.activeElement;
  const portal = $('#portal-content');
  if(active && portal && portal.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return true;
  if(portal && portal.querySelector('details[open]')) return true;
  return false;
}

function shouldRender(key, payload, force=false){
  const sig = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if(!force && renderHashes[key] === sig) return false;
  renderHashes[key] = sig;
  return true;
}

function resetRenderHashes(){
  for(const k of Object.keys(renderHashes)) delete renderHashes[k];
}

function schedulePublicRender(){
  clearTimeout(publicDebounceTimer);
  publicDebounceTimer = setTimeout(() => {
    if($('#ebook-reader')?.style.display === 'flex') return;
    publicRender();
  }, 300);
}

function scheduleRefreshSection(){
  clearTimeout(refreshDebounceTimer);
  refreshDebounceTimer = setTimeout(() => {
    if(isUserBusy()){
      pendingRefresh = true;
      return;
    }
    pendingRefresh = false;
    refreshSection(false);
  }, 350);
}

setInterval(() => {
  if(pendingRefresh && !isUserBusy()){
    pendingRefresh = false;
    refreshSection(false);
  }
}, 1500);

/* ============================================================================
   PENYIMPANAN OFFLINE (INDEXEDDB UNTUK BUKU DIGITAL & LOCALSTORAGE UNTUK LOGIN)
   ============================================================================ */
const OFFLINE_ACCOUNTS_KEY = 'haura_offline_accounts_v1';
const OFFLINE_ACTIVE_KEY = 'haura_offline_active_uid_v1';
const OFFLINE_DB_NAME = 'haura_offline_books_db';
const OFFLINE_DB_VER = 1;
let offlineDbPromise = null;
let cachingQueueRunning = false;

function openOfflineDB(){
  if(offlineDbPromise) return offlineDbPromise;
  offlineDbPromise = new Promise((resolve, reject) => {
    if(!('indexedDB' in window)) return reject(new Error('IndexedDB tidak didukung.'));
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', {keyPath: 'userId'});
      if(!db.objectStoreNames.contains('html')) db.createObjectStore('html', {keyPath: 'id'});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return offlineDbPromise;
}

async function idbPut(storeName, value){
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(storeName, key){
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAllKeys(storeName){
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function refreshOfflineBookIndex(){
  try{
    const keys = await idbGetAllKeys('html');
    offlineBookIds = new Set(keys.map(String));
  }catch{}
}

async function saveOfflineEbookHtml(book, htmlContent){
  if(!book?.id || !htmlContent) return;
  try{
    await idbPut('html', {
      id: String(book.id),
      htmlPath: book.htmlPath || '',
      title: book.title || '',
      html: String(htmlContent),
      savedAt: Date.now()
    });
    offlineBookIds.add(String(book.id));
  }catch(e){ console.warn('Gagal menyimpan cache buku offline:', e); }
}

async function getOfflineEbookHtml(bookId){
  try{
    const rec = await idbGet('html', String(bookId));
    return rec?.html || '';
  }catch{ return ''; }
}

async function syncOfflineEbooks(userId, books){
  if(!userId || isOffline()) return;
  try{
    await idbPut('meta', {userId: String(userId), ebooks: books, updatedAt: Date.now()});
    await refreshOfflineBookIndex();
  }catch{}
  if(cachingQueueRunning || !B?.configured) return;
  cachingQueueRunning = true;
  try{
    for(const b of books){
      if(isOffline() || !me || me.uid !== userId) break;
      if(b.kind !== 'html' || !b.htmlPath) continue;
      const existing = await idbGet('html', String(b.id));
      if(existing && existing.htmlPath === b.htmlPath && existing.html) continue;
      while(isUserBusy() && !isOffline()){
        await new Promise(r => setTimeout(r, 1500));
      }
      if(isOffline()) break;
      try{
        const html = await B.readHtmlFile(b.htmlPath);
        if(html) await saveOfflineEbookHtml(b, html);
      }catch{}
      await new Promise(r => setTimeout(r, 900));
    }
    if(tab === 'modules') scheduleRefreshSection();
  }finally{
    cachingQueueRunning = false;
  }
}

async function loadOfflineEbooks(userId){
  await refreshOfflineBookIndex();
  try{
    const rec = await idbGet('meta', String(userId));
    return Array.isArray(rec?.ebooks) ? rec.ebooks : [];
  }catch{ return []; }
}

async function sha256Hex(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const OfflineAuth = {
  all(){
    try{ return JSON.parse(localStorage.getItem(OFFLINE_ACCOUNTS_KEY) || '{}'); }catch{ return {}; }
  },
  writeAll(map){
    try{ localStorage.setItem(OFFLINE_ACCOUNTS_KEY, JSON.stringify(map)); }catch{}
  },
  saveSession({uid: userId, email, profile: prof, admin: isAdm}){
    if(!userId || !prof) return;
    if(!isAdm && prof.status !== 'approved') return;
    const map = this.all();
    const prev = map[userId] || {};
    const normEmail = String(email || prof.email || prev.email || '').trim().toLowerCase();
    map[userId] = {
      uid: userId,
      email: normEmail,
      admin: Boolean(isAdm),
      profile: {...prof},
      passHash: prev.passHash || '',
      passSalt: prev.passSalt || '',
      savedAt: Date.now()
    };
    this.writeAll(map);
    try{ localStorage.setItem(OFFLINE_ACTIVE_KEY, userId); }catch{}
  },
  async setOfflinePassword(userId, plainPassword){
    const map = this.all();
    const rec = map[userId];
    if(!rec) throw new Error('Sesi akun belum tersimpan di perangkat.');
    const salt = uid();
    const passHash = await sha256Hex(`${salt}:${plainPassword}`);
    rec.passSalt = salt;
    rec.passHash = passHash;
    map[userId] = rec;
    this.writeAll(map);
  },
  clearActive(){
    try{ localStorage.removeItem(OFFLINE_ACTIVE_KEY); }catch{}
  },
  getActiveAccount(){
    try{
      const activeId = localStorage.getItem(OFFLINE_ACTIVE_KEY);
      if(!activeId) return null;
      return this.all()[activeId] || null;
    }catch{ return null; }
  },
  listAccounts(){
    return Object.values(this.all()).filter(a => a && (a.admin || a.profile?.status === 'approved'));
  },
  async verifyLogin(identifier, password=''){
    const clean = String(identifier || '').trim().toLowerCase();
    const accounts = this.listAccounts();
    const acc = accounts.find(a => a.email === clean || a.uid === clean) || (accounts.length === 1 && !clean ? accounts[0] : null);
    if(!acc) throw new Error('Akun tidak ditemukan di penyimpanan offline perangkat ini. Silakan masuk saat online terlebih dahulu.');
    if(acc.passHash){
      if(!password) throw new Error('Masukkan Password Offline akun Anda.');
      const check = await sha256Hex(`${acc.passSalt}:${password}`);
      if(check !== acc.passHash) throw new Error('Password Offline salah.');
    }
    try{ localStorage.setItem(OFFLINE_ACTIVE_KEY, acc.uid); }catch{}
    return acc;
  }
};

function toast(message){ $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,5000); }
function fail(error){ console.error(error); toast(B?.errorMessage(error)||error.message||'Terjadi kesalahan.'); }
function modal(title,body){ $('#modal-title').textContent=title; $('#modal-body').innerHTML=body; if(!$('#modal').open) $('#modal').showModal(); hydrate(); }
function close(){ $('#modal').close(); $('#modal-body').innerHTML=''; }
function field(label,name,type='text',value='',extra=''){return `<div class="field"><label for="${esc(name)}">${label}</label><input id="${esc(name)}" name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></div>`;}
function area(label,name,value='',extra=''){return `<div class="field"><label for="${esc(name)}">${label}</label><textarea id="${esc(name)}" name="${esc(name)}" ${extra}>${esc(value)}</textarea></div>`;}
const submit = (text='Simpan',klass='') => `<button class="button ${klass}" type="submit">${text}</button>`;
const empty = text => `<p class="empty">${text}</p>`;
const img = (path,klass='avatar',alt='Foto') => `<img src="./assets/logo.png" ${path&&!isOffline()?`data-file="${esc(path)}"`:''} class="${klass}" alt="${esc(alt)}" loading="lazy">`;
const status = value => `<span class="status ${esc(value)}">${({pending:'Menunggu validasi',approved:'Aktif',rejected:'Nonaktif'})[value]||esc(value)}</span>`;

function safeURL(v){ try{const u=new URL(v);return u.protocol==='https:'?u.href:'';}catch{return '';}}
function youtubeEmbedURL(v){
  const u=safeURL(v);
  if(!u)return '';
  const parsed=new URL(u);
  let id='';
  if(parsed.hostname==='youtu.be')id=parsed.pathname.slice(1).split('/')[0];
  else if(/^(?:www\.|m\.)?youtube\.com$/.test(parsed.hostname)){
    if(parsed.pathname==='/watch')id=parsed.searchParams.get('v')||'';
    else if(parsed.pathname.startsWith('/embed/'))id=parsed.pathname.split('/')[2]||'';
    else if(parsed.pathname.startsWith('/shorts/'))id=parsed.pathname.split('/')[2]||'';
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id)?`https://www.youtube-nocookie.com/embed/${id}?rel=0`:'';
}

function ready(){
  if(isOffline()) throw new Error('Mode offline aktif. Fitur ini memerlukan koneksi internet (hanya Login & Buku Digital yang tersedia offline).');
  if(!B?.configured) throw new Error('Konfigurasi server belum diisi.');
}
function member(){
  ready();
  if(!me||!profile) throw new Error('Silakan masuk terlebih dahulu.');
  if(!admin&&(profile.status!=='approved')) throw new Error('Akun menunggu aktivasi admin.');
}
function memberBooksAccess(){
  if(!me||!profile) throw new Error('Silakan masuk terlebih dahulu.');
  if(!admin&&(profile.status!=='approved')) throw new Error('Akun menunggu aktivasi admin.');
}
function adminOnly(){member();if(!admin)throw new Error('Akses khusus admin.');}

async function hydrate(){
  if(!B?.configured || isOffline()) return;
  if($('#ebook-reader')?.style.display === 'flex') return;
  document.querySelectorAll('[data-file]').forEach(async el=>{
    const path=el.dataset.file;
    el.removeAttribute('data-file');
    try{
      const u=await B.fileURL(path);
      if(el.isConnected) el.src=u;
    }catch(e){
      if(el.isConnected) el.title=B.errorMessage(e);
    }
  });
}

/* ============================================================================
   GENERATOR QR CODE MANDIRI (SCANNABLE UNTUK SERTIFIKAT & ID CARD)
   ============================================================================ */
const QR_EXP=new Uint8Array(512), QR_LOG=new Uint8Array(256);
(()=>{let x=1;for(let i=0;i<255;i++){QR_EXP[i]=x;QR_EXP[i+255]=x;QR_LOG[x]=i;x=(x<<1)^(x&128?0x11d:0);}})();
function qrRsEncode(data,ecLen){
  let poly=[1];
  for(let i=0;i<ecLen;i++){
    const next=new Array(poly.length+1).fill(0);
    for(let j=0;j<poly.length;j++){next[j]^=poly[j];next[j+1]^=QR_EXP[(QR_LOG[poly[j]]+i)%255];}
    poly=next;
  }
  const res=new Uint8Array(data.length+ecLen);res.set(data);
  for(let i=0;i<data.length;i++){
    const f=res[i];
    if(f!==0)for(let j=0;j<poly.length;j++)res[i+j]^=QR_EXP[(QR_LOG[poly[j]]+QR_LOG[f])%255];
  }
  return res.slice(data.length);
}
const QR_VERS=[
  null,
  {size:21,data:19,ec:7,blocks:1,align:[]},
  {size:25,data:34,ec:10,blocks:1,align:[6,18]},
  {size:29,data:55,ec:15,blocks:1,align:[6,22]},
  {size:33,data:80,ec:20,blocks:1,align:[6,26]},
  {size:37,data:108,ec:26,blocks:1,align:[6,30]},
  {size:41,data:136,ec:18,blocks:2,align:[6,34]},
  {size:45,data:156,ec:20,blocks:2,align:[6,22,38],vbits:0x07c94},
  {size:49,data:194,ec:24,blocks:2,align:[6,24,42],vbits:0x085bc}
];
function makeQrDataUrl(text){
  const bytes=new TextEncoder().encode(String(text||'HAURA'));
  let v=1;
  while(v<QR_VERS.length && bytes.length+2>QR_VERS[v].data)v++;
  if(v>=QR_VERS.length)v=QR_VERS.length-1;
  const spec=QR_VERS[v], size=spec.size;
  const maxBytes=Math.min(bytes.length,spec.data-2);
  const bits=[];
  const pushBits=(val,len)=>{for(let i=len-1;i>=0;i--)bits.push((val>>>i)&1);};
  pushBits(0b0100,4);
  pushBits(maxBytes,8);
  for(let i=0;i<maxBytes;i++)pushBits(bytes[i],8);
  pushBits(0,Math.min(4,spec.data*8-bits.length));
  while(bits.length%8!==0)bits.push(0);
  const codewords=[];
  for(let i=0;i<bits.length;i+=8){
    let b=0;for(let j=0;j<8;j++)b=(b<<1)|bits[i+j];
    codewords.push(b);
  }
  let padToggle=0;
  while(codewords.length<spec.data){codewords.push(padToggle?0x11:0xec);padToggle^=1;}
  let stream=[];
  if(spec.blocks===1){
    const ec=qrRsEncode(codewords,spec.ec);
    stream=[...codewords,...ec];
  }else{
    const half=spec.data/2;
    const b1=codewords.slice(0,half), b2=codewords.slice(half);
    const e1=qrRsEncode(b1,spec.ec), e2=qrRsEncode(b2,spec.ec);
    for(let i=0;i<half;i++){stream.push(b1[i],b2[i]);}
    for(let i=0;i<spec.ec;i++){stream.push(e1[i],e2[i]);}
  }
  const mod=Array.from({length:size},()=>new Uint8Array(size));
  const res=Array.from({length:size},()=>new Uint8Array(size));
  const set=(r,c,val)=>{if(r>=0&&r<size&&c>=0&&c<size){mod[r][c]=val?1:0;res[r][c]=1;}};
  const finder=(r0,c0)=>{
    for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){
      const inOuter=r>=0&&r<=6&&c>=0&&c<=6;
      const inInner=r>=2&&r<=4&&c>=2&&c<=4;
      const onEdge=r===0||r===6||c===0||c===6;
      set(r0+r,c0+c,inOuter&&(onEdge||inInner)?1:0);
    }
  };
  finder(0,0);finder(0,size-7);finder(size-7,0);
  for(const r0 of spec.align)for(const c0 of spec.align){
    if(res[r0][c0])continue;
    for(let r=-2;r<=2;r++)for(let c=-2;c<=2;c++){
      set(r0+r,c0+c,(Math.abs(r)===2||Math.abs(c)===2||(r===0&&c===0))?1:0);
    }
  }
  for(let i=8;i<size-8;i++){set(6,i,i%2===0?1:0);set(i,6,i%2===0?1:0);}
  set(size-8,8,1);
  for(let i=0;i<9;i++){if(i!==6){res[8][i]=1;res[i][8]=1;}}
  for(let i=0;i<8;i++){res[8][size-1-i]=1;res[size-1-i][8]=1;}
  if(spec.vbits){
    for(let i=0;i<18;i++){
      const bit=(spec.vbits>>>i)&1;
      const r=Math.floor(i/3), c=size-11+(i%3);
      set(r,c,bit);set(c,r,bit);
    }
  }
  const bitStream=[];
  for(const b of stream)for(let i=7;i>=0;i--)bitStream.push((b>>>i)&1);
  let idx=0, dir=-1;
  for(let col=size-1;col>0;col-=2){
    if(col===6)col--;
    for(let step=0;step<size;step++){
      const r=dir===-1?(size-1-step):step;
      for(let dx=0;dx<2;dx++){
        const c=col-dx;
        if(!res[r][c]){
          const raw=idx<bitStream.length?bitStream[idx++]:0;
          mod[r][c]=raw^(((r+c)%2===0)?1:0);
        }
      }
    }
    dir*=-1;
  }
  const fmt=0x77c4;
  const fCoords1=[[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  const fCoords2=[[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],[8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]];
  for(let i=0;i<15;i++){
    const bit=(fmt>>>(14-i))&1;
    mod[fCoords1[i][0]][fCoords1[i][1]]=bit;
    mod[fCoords2[i][0]][fCoords2[i][1]]=bit;
  }
  const scale=6, margin=4, dim=(size+margin*2)*scale;
  const cv=document.createElement('canvas');
  cv.width=dim;cv.height=dim;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,dim,dim);
  ctx.fillStyle='#082740';
  for(let r=0;r<size;r++)for(let c=0;c<size;c++){
    if(mod[r][c])ctx.fillRect((c+margin)*scale,(r+margin)*scale,scale,scale);
  }
  return cv.toDataURL('image/png');
}

function certVerifyURL(serial){
  const base=location.origin+location.pathname;
  return `${base}?verify=${encodeURIComponent(serial)}`;
}

/* ============================================================================
   PENGECEKAN ORISINALITAS SERTIFIKAT (SCAN QR / BARCODE PUBLIK)
   ============================================================================ */
function checkPublicVerification(){
  if(verifyHandled || isOffline())return;
  const params=new URLSearchParams(location.search);
  const serial=(params.get('verify')||'').trim();
  if(!serial)return;
  const idx=state.cms?.certIndex||{};
  const rec=idx[serial]||Object.values(idx).find(x=>String(x.serial||'').toLowerCase()===serial.toLowerCase());
  if(!rec)return;
  verifyHandled=true;
  modal('Verifikasi Orisinalitas Sertifikat',`
    <div style="background:#ecfdf5;border:2px solid #059669;border-radius:12px;padding:16px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="background:#059669;color:#fff;font-weight:800;padding:4px 10px;border-radius:999px;font-size:12px">✓ TERVERIFIKASI ASLI</span>
        <b style="color:#065f46;font-size:15px">HAURA INSTITUTE</b>
      </div>
      <p style="margin:0 0 10px;color:#064e3b;font-size:14px;line-height:1.5">
        <b>Pernyataan Resmi Haura Institute:</b> Sertifikat digital ini adalah <b>BENAR, SAH, dan tercatat resmi</b> dalam pangkalan data Haura Institute dengan rincian sebagai berikut:
      </p>
      <table style="width:100%;font-size:13px;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden">
        <tr><td style="padding:7px 10px;border-bottom:1px solid #d1fae5;color:#475569;width:38%">Nomor Sertifikat</td><td style="padding:7px 10px;border-bottom:1px solid #d1fae5"><b>${esc(rec.serial)}</b></td></tr>
        <tr><td style="padding:7px 10px;border-bottom:1px solid #d1fae5;color:#475569">Nama Pemilik</td><td style="padding:7px 10px;border-bottom:1px solid #d1fae5"><b>${esc(rec.name)}</b></td></tr>
        <tr><td style="padding:7px 10px;border-bottom:1px solid #d1fae5;color:#475569">Instansi</td><td style="padding:7px 10px;border-bottom:1px solid #d1fae5">${esc(rec.institution||'-')}</td></tr>
        <tr><td style="padding:7px 10px;border-bottom:1px solid #d1fae5;color:#475569">Program Pelatihan</td><td style="padding:7px 10px;border-bottom:1px solid #d1fae5"><b>${esc(rec.course)}</b></td></tr>
        <tr><td style="padding:7px 10px;border-bottom:1px solid #d1fae5;color:#475569">Predikat</td><td style="padding:7px 10px;border-bottom:1px solid #d1fae5"><b>${esc(rec.predicate||'PARTICIPANT')}</b></td></tr>
        <tr><td style="padding:7px 10px;color:#475569">Tanggal Terbit</td><td style="padding:7px 10px">${esc(rec.issuedDate||'-')}</td></tr>
      </table>
    </div>
    ${rec.imagePath?`
      <div style="text-align:center">
        <p style="font-size:13px;font-weight:700;margin:0 0 8px">Dokumen Sertifikat Digital Resmi:</p>
        <img src="./assets/logo.png" data-file="${esc(rec.imagePath)}" alt="Sertifikat ${esc(rec.name)}" style="width:100%;border-radius:10px;border:1px solid #cbd5e1;box-shadow:0 4px 12px rgba(0,0,0,.08)">
      </div>
    `:''}
  `);
}

function applyBrandLogos(){
  const logoPath=state.cms.logoPath||'';
  const headerLogo=$('#header-logo');
  const heroLogo=$('#hero-logo');
  if(logoPath && B?.storageConfigured && !isOffline()){
    B.fileURL(logoPath).then(u=>{
      if(state.cms.logoPath!==logoPath)return;
      if(headerLogo)headerLogo.src=u;
      if(heroLogo)heroLogo.src=u;
      certImages.main=u;
    }).catch(()=>{});
  }else{
    if(headerLogo)headerLogo.src='./assets/logo.png';
    if(heroLogo)heroLogo.src='./assets/logo.png';
    certImages.main='./assets/logo.png';
  }
}

function showLanding(){ $('#landing-view').hidden=false; $('#portal-view').hidden=true; }

function publicRender(){
  const offline = isOffline();
  const paidPrograms=state.programs.filter(p=>(!p.kind||p.kind==='training')&&HauraFinance.programFee(p)>0);
  const sig = JSON.stringify({
    offline,
    cms: {t:state.cms.logoText,l:state.cms.logoPath,wt:state.cms.welcomeTitle,wx:state.cms.welcomeText,vu:state.cms.videoUrl,vp:state.cms.videoPath},
    programs: paidPrograms.map(p=>[p.id,p.title,p.description,p.totalFee,p.minDownPayment]),
    news: state.news.map(n=>[n.id,n.title,n.content,n.createdAt])
  });
  if(!shouldRender('public', sig)) return;

  $('#brand-text').textContent=state.cms.logoText||'HAURA';
  applyBrandLogos();
  if(B?.configured){$('#hero-title').textContent=state.cms.welcomeTitle;$('#hero-description').textContent=state.cms.welcomeText;}

  const video=$('#hero-video'), iframe=$('#hero-iframe'), logo=$('#hero-logo');
  const drivePath=!offline ? (state.cms.videoPath||'') : '';
  const rawUrl=(!offline && !drivePath) ? safeURL(state.cms.videoUrl) : '';
  const ytUrl=rawUrl ? youtubeEmbedURL(rawUrl) : '';
  const directUrl=(rawUrl && !ytUrl) ? rawUrl : '';

  if(drivePath && B?.storageConfigured){
    if(iframe){iframe.hidden=true;iframe.removeAttribute('src');}
    B.fileURL(drivePath).then(u=>{
      if(state.cms.videoPath!==drivePath)return;
      if(video.getAttribute('src')!==u)video.src=u;
      video.hidden=false;
      logo.hidden=true;
    }).catch(()=>{});
  }else if(ytUrl && iframe){
    video.pause();video.removeAttribute('src');video.hidden=true;
    if(iframe.getAttribute('src')!==ytUrl)iframe.src=ytUrl;
    iframe.hidden=false;
    logo.hidden=true;
  }else if(directUrl){
    if(iframe){iframe.hidden=true;iframe.removeAttribute('src');}
    if(video.getAttribute('src')!==directUrl)video.src=directUrl;
    video.hidden=false;
    logo.hidden=true;
  }else{
    video.pause();video.removeAttribute('src');video.hidden=true;
    if(iframe){iframe.hidden=true;iframe.removeAttribute('src');}
    logo.hidden=false;
  }

  $('#public-programs').innerHTML=offline
    ? empty('Mode offline aktif. Silakan klik "Masuk Portal" untuk membaca Buku Digital yang sudah tersimpan di perangkat Anda.')
    : (paidPrograms.length ? paidPrograms.map(p=>{
        const fee=HauraFinance.programFee(p), minDp=HauraFinance.programMinDp(p);
        return `<details><summary>${esc(p.title)} · <b>${money(fee)}</b></summary><p>${esc(p.description)}</p><div class="row spread" style="align-items:center;gap:8px;flex-wrap:wrap"><span class="price">Biaya: <b>${money(fee)}</b> · Min. Daftar: <b>${money(minDp)}</b></span><button class="button small" data-action="enroll" data-id="${esc(p.id)}">Daftar Pelatihan</button></div></details>`;
      }).join(''):empty('Belum ada program tersedia.'));

  $('#public-news').innerHTML=offline
    ? empty('Berita & pengumuman memerlukan koneksi internet.')
    : (state.news.length?state.news.map(n=>`<details><summary>${esc(n.title)}</summary><p>${esc(n.content)}</p><small class="muted">${date(n.createdAt)}</small></details>`).join(''):empty('Belum ada informasi terbaru.'));
}

function navRender(){
  const offline = isOffline();
  if(!me){
    $('#auth-nav').innerHTML = offline
      ? '<button class="button light compact" data-action="login">Masuk Offline (Buku)</button>'
      : '<button class="button ghost compact" data-action="login">Masuk Portal</button><button class="button light compact" data-action="register">Pendaftaran</button>';
    return;
  }
  const displayName = esc(profile?.fullTitleName||profile?.name||me.email);
  if(offline){
    $('#auth-nav').innerHTML = `
      <span class="muted" style="color:#fcd34d">● Mode Offline · ${displayName}</span>
      <button class="button light compact" data-action="dashboard">Buku Digital</button>
      <button class="button ghost compact" data-action="logout">Keluar</button>
    `;
    return;
  }
  $('#auth-nav').innerHTML=`
    <span class="muted" style="color:#d2e2e8">${displayName}</span>
    <button class="button light compact" data-action="dashboard">Dashboard</button>
    <button class="button ghost compact" data-action="edit-biodata">Biodata</button>
    <button class="button ghost compact" data-action="id-card">ID Card</button>
    <button class="button ghost compact" data-action="offline-pass">Sandi Offline</button>
    <button class="button ghost compact" data-action="change-password">Password</button>
    <button class="button ghost compact" data-action="logout">Keluar</button>
  `;
}

const memberTabs=[['catalog','Program & Evaluasi'],['modules','Buku Digital'],['pmk','Praktik Mandiri (PMK)'],['baju','PO Baju Kesehatan'],['certificates','Sertifikat'],['chat','Diskusi & Alkes']];
const adminTabs=[['finance','Keuangan & Evaluasi'],['validation','Peserta & Angkatan'],['cms','CMS Web'],['modules-admin','Buku & Fisik'],['pmk-admin','Bimbingan PMK'],['baju-admin','PO Baju Kesehatan'],['cert-admin','Sertifikat & Cetak'],['chat-admin','Diskusi SBAR']];

function tabsRender(force=false){
  const offline = isOffline();
  const pendingUsers=state.users.filter(u=>u.status==='pending').length;
  let pendingFinance=0;
  for(const e of state.enrollments)for(const p of (e.payments||[]))if(p.status==='pending')pendingFinance++;
  for(const cp of state.chatPayments)if(cp.status==='pending')pendingFinance++;
  for(const ord of state.alkesOrders)if(ord.status==='pending')pendingFinance++;

  const list = offline ? [['modules','Buku Digital (Offline)']] : (admin?adminTabs:memberTabs);
  const sig = JSON.stringify({offline, admin, tab, pendingUsers, pendingFinance});
  if(!shouldRender('tabs', sig, force)) return;

  $('#tabs').innerHTML=list.map(([id,label])=>{
    let badge='';
    if(!offline && id==='validation'&&pendingUsers)badge=`<span class="badge">${pendingUsers}</span>`;
    if(!offline && id==='finance'&&pendingFinance)badge=`<span class="badge">${pendingFinance}</span>`;
    return `<button data-action="tab" data-id="${id}" aria-selected="${tab===id}">${label}${badge}</button>`;
  }).join('');
}

function dashboard(){
  if(!me) return loginForm();
  const offline = isOffline();
  if(offline) tab = 'modules';
  resetRenderHashes();
  $('#landing-view').hidden=true;
  $('#portal-view').hidden=false;
  const displayName=profile?.fullTitleName||profile?.name||me.email;
  $('#portal-heading').innerHTML=`<div class="row spread" style="align-items:center;gap:14px;margin-bottom:8px;flex-wrap:wrap">
    <div class="row" style="align-items:center;gap:14px">
      ${img(profile?.photoPath,'avatar','Foto '+esc(displayName))}
      <div>
        <span class="eyebrow green">${offline?'MODE OFFLINE · BUKU DIGITAL':(admin?'PUSAT KENDALI ADMIN':'PORTAL PESERTA')}</span>
        <h2 style="margin:2px 0">${esc(displayName)}</h2>
        <p class="muted" style="margin:0">${profile?.institution?esc(profile.institution):''}${profile?.batch?` · <b>${esc(profile.batch)}</b>`:''}</p>
      </div>
    </div>
    ${offline ? `
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <span class="pill" style="background:#fef3c7;color:#92400e">Offline: Hanya Buku Digital yang Aktif</span>
      </div>
    ` : `
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button type="button" class="button small" data-action="edit-biodata">Lengkapi / Edit Biodata</button>
        <button type="button" class="button small green" data-action="id-card">Cetak ID Card</button>
      </div>
    `}
  </div>`;
  hydrate();
  if(!profile){$('#tabs').innerHTML='';$('#portal-content').innerHTML='<p>Profil tidak ditemukan.</p>';return;}
  if(!admin&&(profile.status!=='approved')){
    $('#tabs').innerHTML='';$('#portal-content').innerHTML=`<h2>Status Akun</h2><p>${status(profile.status)}</p><p class="muted">Akun Anda sedang dalam proses aktivasi admin. Silakan lengkapi biodata dan pas foto Anda.</p><div class="row" style="gap:8px;flex-wrap:wrap"><button class="button" data-action="refresh-auth">Periksa Status</button><button class="button green" data-action="edit-biodata">Lengkapi Biodata & Foto</button></div>`;return;
  }
  tabsRender(true);
  renderTab(true);
}

function renderTab(fresh=false){
  if($('#portal-view').hidden||!profile)return;
  if(isOffline() && tab !== 'modules'){
    tab = 'modules';
    tabsRender(true);
  }
  if(tab==='catalog')renderCatalog(fresh);
  if(tab==='finance'&&admin)renderFinanceAdmin(fresh);
  if(tab==='validation')renderValidation(fresh);
  if(tab==='modules')renderMemberModules(fresh);
  if(tab==='pmk')renderMemberPMK(fresh);
  if(tab==='baju')renderMemberBaju(fresh);
  if(tab==='certificates')renderMemberCertificates(fresh);
  if(tab==='cms'&&fresh)renderCMS();
  if(tab==='modules-admin'&&fresh)renderModuleAdmin();
  if(tab==='pmk-admin')renderPMKAdmin(fresh);
  if(tab==='baju-admin')renderBajuAdmin(fresh);
  if(tab==='cert-admin'&&fresh)renderCertificateEditor();
  if(tab==='chat')renderMemberChatAndAlkes(fresh);
  if(tab==='chat-admin')renderAdminChat(fresh);
  hydrate();
}

function refreshSection(force=false){
  if(!me||!profile||(!admin&&(profile.status!=='approved')))return;
  if(isOffline()){
    if(tab !== 'modules'){ tab = 'modules'; tabsRender(true); }
    renderMemberModules(force);
    return;
  }
  if(admin) tabsRender(force);
  if(['catalog','finance','validation','modules','pmk','baju','certificates','chat'].includes(tab)) renderTab(force);
  if(tab==='pmk-admin') renderPMKAdmin(force);
  if(tab==='baju-admin') renderBajuAdmin(force);
  if(tab==='chat-admin') renderChatUsers(force);
}

function stopPrivate(){
  $('#portal-content').innerHTML='';
  $('#portal-heading').innerHTML='';
  $('#tabs').innerHTML='';
  resetRenderHashes();
  subscriptions.forEach(s=>s());subscriptions=[];
  ownStop?.();ownStop=null;
  chatStop?.();chatStop=null;
  state.users=[];state.enrollments=[];state.chatPayments=[];state.alkesOrders=[];state.ebooks=[];state.certificates=[];state.expenses=[];state.messages=[];
  targetChat='';alkesCart={};bajuCart={};
  B?.clearFiles();
  applyBrandLogos();
}
function listen(c,filters,key,extra){
  subscriptions.push(B.watch(c,filters,rows=>{
    state[key]=rows;
    extra?.(rows);
    scheduleRefreshSection();
  },fail));
}
function startPrivate(){
  subscriptions.forEach(s=>s());subscriptions=[];
  if(isOffline()){
    if(me?.uid){
      loadOfflineEbooks(me.uid).then(rows=>{
        state.ebooks = rows;
        refreshSection(true);
      });
    }
    return;
  }
  if(!profile||(!admin&&(profile.status!=='approved')))return;
  const own=[B.F.where('userId','==',me.uid)];
  if(admin){
    listen('users',[],'users');
    listen('expenses',[],'expenses');
  }
  listen('enrollments',admin?[]:own,'enrollments');
  listen('chatPayments',admin?[]:own,'chatPayments');
  listen('alkesOrders',admin?[]:own,'alkesOrders');
  listen('certificates',admin?[]:own,'certificates');
  if(admin){
    listen('ebooks',[],'ebooks', rows => syncOfflineEbooks(me.uid, rows));
  } else {
    let all=[], mine=[];
    subscriptions.push(B.watch('ebooks',[B.F.where('userId','==','all')],rows=>{
      all=rows;
      state.ebooks=[...all,...mine];
      syncOfflineEbooks(me.uid, state.ebooks);
      scheduleRefreshSection();
    },fail));
    subscriptions.push(B.watch('ebooks',own,rows=>{
      mine=rows;
      state.ebooks=[...all,...mine];
      syncOfflineEbooks(me.uid, state.ebooks);
      scheduleRefreshSection();
    },fail));
  }
}

async function enterOfflineSession(savedAccount){
  stopPrivate();
  me = {uid: savedAccount.uid, email: savedAccount.email, offline: true};
  profile = savedAccount.profile;
  admin = Boolean(savedAccount.admin);
  tab = 'modules';
  navRender();
  state.ebooks = await loadOfflineEbooks(savedAccount.uid);
  dashboard();
}

async function handleSession(user){
  const epoch=++session;
  if(!user && isOffline()){
    const saved = OfflineAuth.getActiveAccount();
    if(saved){
      await enterOfflineSession(saved);
      return;
    }
  }
  stopPrivate();me=user;profile=null;admin=false;navRender();
  if(!user){showLanding();return;}
  if(isOffline()){
    const saved = OfflineAuth.all()[user.uid];
    if(saved){
      await enterOfflineSession(saved);
      return;
    }
  }
  try{
    const token=await B.F.getIdTokenResult(user);if(epoch!==session)return;admin=token.claims.admin===true;
    ownStop=B.F.onSnapshot(B.F.doc(B.dbInstance(),'users',user.uid),snap=>{
      if(epoch!==session)return;const old=profile;profile=snap.exists()?{id:snap.id,...snap.data()}:null;
      if(profile) OfflineAuth.saveSession({uid:user.uid, email:user.email, profile, admin});
      if(profile?.status!=='approved'&&!admin){subscriptions.forEach(s=>s());subscriptions=[];chatStop?.();chatStop=null;B.clearFiles();}
      navRender();
      if(!old||old.status!==profile?.status||old.chatAccess!==profile?.chatAccess||old.photoPath!==profile?.photoPath||old.fullTitleName!==profile?.fullTitleName||old.batch!==profile?.batch){
        startPrivate();
        if(!registering){
          tab = isOffline() ? 'modules' : (admin?'finance':'catalog');
          dashboard();
        }
      }
    },fail);
    profile=await B.read('users',user.uid);if(epoch!==session)return;
    if(profile) OfflineAuth.saveSession({uid:user.uid, email:user.email, profile, admin});
    startPrivate();
    tab = isOffline() ? 'modules' : (admin?'finance':'catalog');
    navRender();
    if(!registering)dashboard();
  }catch(e){fail(e);}
}

function offlineLoginForm(){
  const accounts = OfflineAuth.listAccounts();
  if(!accounts.length){
    modal('Login Offline Belum Tersedia',`
      <div style="background:#fffbeb;border:1px solid #fde68a;padding:14px;border-radius:10px;color:#78350f">
        <b>Belum ada akun tersimpan di perangkat ini.</b>
        <p style="margin:8px 0 0;font-size:14px">Untuk keamanan, silakan masuk (login) satu kali saat perangkat terhubung ke internet agar akun dan buku digital Anda tersimpan otomatis untuk akses offline.</p>
      </div>
    `);
    return;
  }
  const hasPassword = accounts.some(a => Boolean(a.passHash));
  const defaultEmail = accounts[0]?.email || '';
  const accountOptions = accounts.map(a => `<option value="${esc(a.email)}">${esc(a.profile?.fullTitleName||a.profile?.name||a.email)} (${esc(a.email)})</option>`).join('');
  modal('Masuk Portal (Mode Offline)',`
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:12px;border-radius:10px;margin-bottom:14px;font-size:13.5px;color:#166534">
      <b>Mode Offline Aktif:</b> Anda dapat masuk menggunakan akun yang sudah tersimpan di perangkat ini untuk membaca <b>Buku Digital</b>. Fitur lain tetap terkunci sampai internet terhubung.
    </div>
    <form data-form="offline-login">
      ${accounts.length > 1
        ? `<div class="field"><label for="offline-acc-select">Pilih Akun Tersimpan</label><select id="offline-acc-select" name="email">${accountOptions}</select></div>`
        : field('Email Akun Terdaftar','email','email',defaultEmail,'required autocomplete="username"')
      }
      ${hasPassword
        ? field('Password Offline','offlinePassword','password','','placeholder="Masukkan Password Offline"')
        : '<p class="muted" style="font-size:13px;margin:0 0 12px">Perangkat terverifikasi. Klik tombol di bawah untuk langsung membuka Buku Digital offline.</p>'
      }
      ${submit('Masuk & Buka Buku Digital Offline','green')}
    </form>
  `);
}

function openOfflinePasswordModal(){
  ready();
  if(!me || !profile) throw new Error('Silakan masuk terlebih dahulu.');
  const rec = OfflineAuth.all()[me.uid];
  modal('Atur Password Login Offline',`
    <p style="font-size:14px">Password ini digunakan saat Anda masuk ke portal dalam keadaan <b>offline (tanpa internet)</b> untuk membaca Buku Digital di perangkat ini.</p>
    ${rec?.passHash ? '<p style="color:#087b4b;font-size:13px"><b>✓ Password Offline sudah aktif pada perangkat ini.</b></p>' : ''}
    <form data-form="set-offline-password">
      ${field('Password Offline Baru (minimal 4 karakter)','newOfflinePass','password','','required minlength="4" maxlength="64"')}
      ${field('Ulangi Password Offline','confirmOfflinePass','password','','required minlength="4" maxlength="64"')}
      ${submit('Simpan Password Offline','green')}
    </form>
  `);
}

function loginForm(){
  if(isOffline()) return offlineLoginForm();
  ready();
  modal('Masuk Portal',B.accountFrame('login'));
}
function registerForm(){
  if(isOffline()) throw new Error('Pendaftaran peserta baru memerlukan koneksi internet.');
  ready();
  modal('Pendaftaran Peserta',B.accountFrame('register'));
}

/* ============================================================================
   BIODATA LENGKAP & CETAK ID CARD PESERTA
   ============================================================================ */
function openBiodataModal(targetUid=null){
  const isSelf=!targetUid||targetUid===me.uid;
  const u=isSelf?profile:state.users.find(x=>x.id===targetUid);
  if(!u)throw new Error('Data pengguna tidak ditemukan.');
  modal(isSelf?'Biodata Lengkap Peserta':'Edit Biodata Peserta',`
    <form data-form="save-biodata" data-uid="${esc(u.id)}">
      ${field('Pas Foto Resmi (JPG/PNG/WebP, maks 5 MB)','photo','file','','accept="image/jpeg,image/png,image/webp"')}
      ${field('Nama Lengkap (tanpa gelar)','name','text',u.name||'','required maxlength="120"')}
      ${field('Nama Lengkap + Gelar Akademik / Profesi (untuk Sertifikat & ID Card)','fullTitleName','text',u.fullTitleName||u.name||'','required maxlength="160" placeholder="Contoh: Ns. Budi Santoso, S.Kep."')}
      ${field('NIK (Nomor Induk Kependudukan)','nik','text',u.nik||'','maxlength="30"')}
      ${field('Nomor STR (Surat Tanda Registrasi)','strNumber','text',u.strNumber||'','maxlength="50"')}
      ${field('Nomor NIRA PPNI','niraNumber','text',u.niraNumber||'','maxlength="50"')}
      <div class="row" style="gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:160px">${field('Tempat Lahir','birthPlace','text',u.birthPlace||'','maxlength="80"')}</div>
        <div style="flex:1;min-width:160px">${field('Tanggal Lahir','birthDate','date',u.birthDate||'','')}</div>
      </div>
      <div class="field"><label for="bio-gender">Jenis Kelamin</label><select id="bio-gender" name="gender"><option value="">— Pilih —</option><option value="Laki-laki" ${u.gender==='Laki-laki'?'selected':''}>Laki-laki</option><option value="Perempuan" ${u.gender==='Perempuan'?'selected':''}>Perempuan</option></select></div>
      ${field('No. WhatsApp / HP Aktif','phone','text',u.phone||'','maxlength="30" placeholder="08xxxxxxxxxx"')}
      ${field('Instansi / Rumah Sakit / Puskesmas / Kampus','institution','text',u.institution||'','required maxlength="160"')}
      ${field('Pendidikan Terakhir','education','text',u.education||'','maxlength="80" placeholder="Contoh: D3 Keperawatan / S1 Ners / S2 Keperawatan"')}
      ${admin?field('Angkatan / Kelas / Kelompok','batch','text',u.batch||'','maxlength="80" placeholder="Contoh: Angkatan I - 2026"'):''}
      ${area('Alamat Domisili Lengkap','address',u.address||'','maxlength="400"')}
      ${submit('Simpan Biodata Lengkap','green')}
    </form>
  `);
}

function openIdCardModal(targetUid=null){
  const u=(!targetUid||targetUid===me.uid)?profile:state.users.find(x=>x.id===targetUid);
  if(!u)throw new Error('Data anggota tidak ditemukan.');
  const memberCode='HI-'+(u.id||'').slice(0,8).toUpperCase();
  const displayName=u.fullTitleName||u.name||'Peserta';
  const qrImg=makeQrDataUrl(`${location.origin}${location.pathname}#member=${memberCode}`);
  const logoSrc=certImages.main||'./assets/logo.png';
  modal('Kartu Anggota & Peserta (ID Card)',`
    <div style="overflow-x:auto;padding:8px 0">
      <div id="idcard-preview" style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;background:#fff;padding:12px">
        <!-- SISI DEPAN -->
        <div style="width:240px;height:380px;border-radius:14px;overflow:hidden;border:1.5px solid #082740;background:linear-gradient(160deg,#082740 0%,#0d3b5e 52%,#ffffff 52.5%);display:flex;flex-direction:column;justify-content:space-between;padding:14px;box-sizing:border-box;color:#0f172a;font-family:sans-serif">
          <div style="display:flex;align-items:center;gap:8px;color:#fff">
            <img src="${esc(logoSrc)}" alt="Logo" style="width:34px;height:34px;object-fit:contain;background:#fff;border-radius:8px;padding:2px">
            <div>
              <div style="font-weight:800;font-size:13px;letter-spacing:.5px">${esc(state.cms.logoText||'HAURA')} INSTITUTE</div>
              <div style="font-size:9px;opacity:.85">Center of Medical Excellence</div>
            </div>
          </div>
          <div style="text-align:center;margin-top:4px">
            <img src="./assets/logo.png" ${u.photoPath?`data-file="${esc(u.photoPath)}"`:''} alt="Foto" style="width:94px;height:112px;object-fit:cover;border-radius:10px;border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.18);background:#e2e8f0">
          </div>
          <div style="text-align:center">
            <div style="font-weight:800;font-size:13px;color:#082740;line-height:1.25">${esc(displayName)}</div>
            <div style="font-size:10px;color:#087b4b;font-weight:700;margin-top:2px">${esc(u.batch||'Peserta Terdaftar')}</div>
            <div style="font-size:10px;color:#475569;margin-top:2px">${esc(u.institution||'-')}</div>
          </div>
          <div style="background:#f1f5f9;border-radius:8px;padding:6px 8px;display:flex;justify-content:space-between;align-items:center;font-size:9.5px">
            <div>
              <div style="color:#64748b">ID Anggota</div>
              <b style="color:#082740">${esc(memberCode)}</b>
              ${u.niraNumber?`<div style="color:#475569">NIRA: ${esc(u.niraNumber)}</div>`:''}
            </div>
            <img src="${qrImg}" alt="QR" style="width:44px;height:44px">
          </div>
        </div>
        <!-- SISI BELAKANG -->
        <div style="width:240px;height:380px;border-radius:14px;overflow:hidden;border:1.5px solid #082740;background:#ffffff;display:flex;flex-direction:column;justify-content:space-between;padding:14px;box-sizing:border-box;color:#0f172a;font-family:sans-serif">
          <div>
            <div style="background:#082740;color:#fff;padding:7px 10px;border-radius:8px;font-size:11px;font-weight:700;text-align:center">IDENTITAS PEMEGANG KARTU</div>
            <div style="font-size:10px;margin-top:10px;line-height:1.55">
              <div><span style="color:#64748b">No. STR:</span> <b>${esc(u.strNumber||'-')}</b></div>
              <div><span style="color:#64748b">TTL:</span> ${esc(u.birthPlace||'-')}${u.birthDate?', '+esc(u.birthDate):''}</div>
              <div><span style="color:#64748b">No. HP:</span> ${esc(u.phone||'-')}</div>
              <div><span style="color:#64748b">Alamat:</span> ${esc(u.address||'-')}</div>
            </div>
          </div>
          <div style="font-size:9.5px;color:#475569;background:#f8fafc;padding:8px;border-radius:8px;border:1px solid #e2e8f0">
            Kartu ini adalah identitas resmi peserta pelatihan dan program pengembangan kompetensi <b>Haura Institute</b>.
          </div>
          <div style="text-align:right;font-size:9.5px">
            <div style="color:#64748b">Direktur Haura Institute</div>
            <div style="height:28px"></div>
            <b style="color:#082740">${esc(author)}</b>
          </div>
        </div>
      </div>
    </div>
    <div class="row" style="gap:8px;justify-content:center;margin-top:10px">
      <button type="button" class="button green" data-action="download-idcard-pdf" data-name="${esc(displayName)}">↓ Unduh / Cetak ID Card (PDF)</button>
    </div>
  `);
}

/* ============================================================================
1. PESERTA: PROGRAM PELATIHAN BERBAYAR, PELUNASAN & EVALUASI
   ============================================================================ */
function renderCatalog(force=false){
  const myEnr=state.enrollments.filter(enr=>{
    const prog=state.programs.find(p=>p.id===enr.programId);
    return (!prog?.kind || prog.kind==='training') && enr.kind!=='pmk';
  });
  const availablePrograms=state.programs.filter(p=>(!p.kind||p.kind==='training')&&HauraFinance.programFee(p)>0);
  if(!shouldRender('catalog', {myEnr, availablePrograms}, force)) return;

  const myEnrHtml=myEnr.length ? myEnr.map(enr=>{
    const prog=state.programs.find(p=>p.id===enr.programId);
    const title=enr.programTitle||prog?.title||'Program Pelatihan';
    const st=HauraFinance.statusLabel(enr);
    const lunas=HauraFinance.isPaidFull(enr);
    const sisa=HauraFinance.remainingBalance(enr);
    const hasPending=(enr.payments||[]).some(p=>p.status==='pending');

    return `<article class="card" style="border-left:4px solid ${lunas?'#087b4b':'#d97706'}">
      <div class="row spread" style="flex-wrap:wrap;gap:6px">
        <b>${esc(title)}</b>
        <span class="status ${st.code}">${esc(st.text)}</span>
      </div>
      ${!HauraFinance.isLegacyFree(enr)?`
        <p style="margin:8px 0;font-size:14px">
          Total Biaya: <b>${money(enr.billedTotal)}</b> ·
          Terkonfirmasi: <b style="color:#087b4b">${money(enr.paidAmount)}</b> ·
          Sisa: <b style="color:${sisa>0?'#b45309':'#087b4b'}">${money(sisa)}</b>
        </p>
        <div style="font-size:13px;background:#f8fafc;padding:10px;border-radius:8px;margin-bottom:10px">
          ${(enr.payments||[]).map(p=>`<div style="margin-top:4px">• ${esc(p.label||'Pembayaran')}: <b>${money(p.amount)}</b> — <span class="status ${p.status==='confirmed'?'approved':p.status==='rejected'?'rejected':'pending'}">${p.status==='confirmed'?'Terkonfirmasi':p.status==='rejected'?'Ditolak':'Menunggu Verifikasi'}</span>${p.note?` <i>(${esc(p.note)})</i>`:''}</div>`).join('')}
        </div>
      `:''}
      ${lunas ? `
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;padding:12px;border-radius:10px;color:#065f46">
          <b>Hasil Evaluasi</b>
          <p style="margin:4px 0">Nilai Akhir: <b>${enr.score!==null&&enr.score!==undefined?esc(enr.score):'Belum dinilai'}</b></p>
          ${enr.evaluationNote?`<p style="margin:4px 0;font-size:13px">Catatan: ${esc(enr.evaluationNote)}</p>`:''}
        </div>
      ` : `
        <div style="background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:10px;color:#78350f">
          <b>Nilai Evaluasi & Sertifikat Terkunci</b>
          <p style="margin:4px 0;font-size:13px">Selesaikan pelunasan biaya untuk membuka nilai evaluasi dan sertifikat.</p>
          ${hasPending
            ? `<p style="margin:6px 0 0;font-size:13px;font-weight:600">Bukti pembayaran sedang diverifikasi.</p>`
            : `<button class="button small" style="margin-top:8px;background:#d97706" data-action="pay-installment" data-id="${esc(enr.id)}">Ajukan Pelunasan (${money(sisa)})</button>`
          }
        </div>
      `}
    </article>`;
  }).join('') : empty('Belum ada program yang diikuti.');

  const catalogHtml=availablePrograms.map(p=>{
    const joined=myEnr.some(e=>e.programId===p.id);
    const fee=HauraFinance.programFee(p), minDp=HauraFinance.programMinDp(p);
    return `<article class="card">
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.description)}</p>
      <p style="font-size:14px">Total Biaya: <b>${money(fee)}</b><br>Minimal Daftar: <b>${money(minDp)}</b></p>
      <button class="button" data-action="enroll" data-id="${esc(p.id)}" ${joined?'disabled':''}>${joined?'Sudah Terdaftar':'Daftar Program'}</button>
    </article>`;
  }).join('')||empty('Belum ada program tersedia.');

  $('#portal-content').innerHTML=`
    <h2>Program Pelatihan Saya & Evaluasi</h2>
    <div class="stack" style="margin-bottom:24px">${myEnrHtml}</div>
    <h3 class="section-title">Katalog Program Pelatihan</h3>
    <div class="cards">${catalogHtml}</div>
  `;
}

/* ============================================================================
2. BUKU DIGITAL HTML FULLSCREEN & PEMESANAN BUKU FISIK (PESERTA & ADMIN)
   ============================================================================ */
function renderMemberModules(force=false){
  const root=$('#portal-content');
  const offline = isOffline();
  const cachedIds = [...offlineBookIds];
  if(!shouldRender('modules', {offline, cachedIds, ebooks: state.ebooks, alkesOrders: offline ? [] : state.alkesOrders}, force)) return;

  const html=state.ebooks.length ? state.ebooks.map(b=>{
    const isCached = offlineBookIds.has(String(b.id));
    const hasPhysical = !offline && Number(b.physicalPrice||0)>0 && b.physicalAlkesId;
    const canOpenOffline = !offline || isCached;
    return `<article class="card" style="${isCached?'border-left:4px solid #087b4b':''}">
      <div class="row spread" style="gap:6px;align-items:start;flex-wrap:wrap">
        <h3 style="margin:0">${esc(b.title)}</h3>
        ${b.kind==='html'
          ? `<span class="pill" style="font-size:11px;background:${isCached?'#dcfce7':'#f1f5f9'};color:${isCached?'#166534':'#475569'}">${isCached?'✓ Tersedia Offline':'Online'}</span>`
          : ''
        }
      </div>
      ${b.description?`<p style="font-size:13px">${esc(b.description)}</p>`:''}
      ${hasPhysical?`<p style="font-size:13px;color:#087b4b">Edisi Buku Fisik (Cetak): <b>${money(b.physicalPrice)}</b></p>`:''}
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">
        ${b.kind==='html' && b.htmlPath
          ? `<button class="button green" data-action="read-ebook" data-id="${esc(b.id)}" ${canOpenOffline?'':'disabled'}>${canOpenOffline?'Baca Buku Digital (Layar Penuh)':'Belum Diunduh (Perlu Internet)'}</button>`
          : (!offline && safeURL(b.url)?`<a class="button" href="${esc(safeURL(b.url))}" target="_blank" rel="noopener noreferrer">Buka Materi ↗</a>`:'<span class="muted" style="font-size:13px">Tautan eksternal memerlukan internet.</span>')
        }
        ${hasPhysical
          ? `<button class="button gold" data-action="order-physical-book" data-id="${esc(b.id)}">Pesan Buku Fisik</button>`
          : ''
        }
      </div>
    </article>`;
  }).join('') : empty(offline ? 'Belum ada buku digital yang tersimpan offline di perangkat ini.' : 'Belum ada buku digital.');

  if(offline){
    root.innerHTML=`
      <div style="background:#fffbeb;border:1px solid #fde68a;padding:12px 14px;border-radius:10px;margin-bottom:16px;color:#78350f;font-size:13.5px">
        <b>Mode Baca Offline Aktif:</b> Anda dapat membaca buku digital yang bertanda <b>✓ Tersedia Offline</b> tanpa koneksi internet. Pemesanan buku fisik dan fitur portal lainnya otomatis terkunci hingga internet aktif kembali.
      </div>
      <h2>Buku Digital (Mode Offline)</h2>
      <div class="cards">${html}</div>
    `;
    return;
  }

  const bookOrders=state.alkesOrders.filter(o=>(o.items||[]).some(i=>String(i.name||'').startsWith('[Buku Fisik]')));
  const ordersHtml=bookOrders.length ? bookOrders.map(o=>`
    <div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-top:8px;background:#f8fafc">
      <div class="row spread"><b>Total: ${money(o.totalAmount)}</b><span class="status ${o.status==='confirmed'?'approved':o.status==='rejected'?'rejected':'pending'}">${o.status==='confirmed'?'Dikonfirmasi / Diproses':o.status==='rejected'?'Ditolak':'Menunggu Verifikasi'}</span></div>
      <div style="font-size:13px;margin-top:4px">${(o.items||[]).map(i=>`${esc(i.name)} (${i.qty} eks)`).join(', ')}</div>
      ${o.note?`<small class="muted">Catatan/Resi: ${esc(o.note)}</small>`:''}
    </div>
  `).join('') : empty('Belum ada pesanan buku fisik.');

  root.innerHTML=`
    <h2>Buku Digital & Pemesanan Buku Fisik</h2>
    <div class="cards" style="margin-bottom:22px">${html}</div>
    <h3 class="section-title">Riwayat Pesanan Buku Fisik Saya</h3>
    ${ordersHtml}
  `;
}

function openOrderPhysicalBookModal(ebookId){
  ready();
  const b=state.ebooks.find(x=>x.id===ebookId);
  if(!b||!b.physicalAlkesId||Number(b.physicalPrice||0)<=0)throw new Error('Buku fisik belum tersedia untuk judul ini.');
  modal('Pesan Buku Fisik (Edisi Cetak)',`
    <p><b>${esc(b.title)}</b><br>Harga Cetak: <b style="color:#087b4b">${money(b.physicalPrice)}</b> / eksemplar</p>
    ${paymentInstructionBox()}
    <form data-form="order-physical-book" data-alkes="${esc(b.physicalAlkesId)}">
      ${field('Jumlah Eksemplar','qty','number','1','required min="1" max="50" step="1"')}
      ${area('Alamat Pengiriman Lengkap & No. WhatsApp','shippingNote',profile?.address||'','required maxlength="500" placeholder="Nama penerima, alamat lengkap, kecamatan, kab/kota, kode pos, No. WA"')}
      ${field('Bukti Pembayaran QRIS / Transfer','proof','file','','required accept="image/jpeg,image/png,image/webp"')}
      ${submit('Kirim Pesanan Buku Fisik','green')}
    </form>
  `);
}

function openEbookReader(book){
  const overlay=$('#ebook-reader');
  activeReaderBookId=book.id;
  $('#ebook-reader-title').textContent=book.title||'Buku Digital';
  const orderBtn=$('#ebook-order-physical-btn');
  if(orderBtn){
    orderBtn.hidden=isOffline() || !(Number(book.physicalPrice||0)>0 && book.physicalAlkesId);
  }
  const frame=$('#ebook-reader-frame');
  frame.srcdoc=book._htmlContent||'';
  overlay.style.display='flex';
  document.body.style.overflow='hidden';
  if(overlay.requestFullscreen){
    overlay.requestFullscreen().catch(()=>{});
  }
}
function closeEbookReader(){
  const overlay=$('#ebook-reader');
  if(!overlay)return;
  if(document.fullscreenElement){
    document.exitFullscreen().catch(()=>{});
  }
  $('#ebook-reader-frame').srcdoc='';
  overlay.style.display='none';
  document.body.style.overflow='';
  if(pendingRefresh){
    pendingRefresh = false;
    refreshSection(false);
  }
}

function renderModuleAdmin(){
  $('#portal-content').innerHTML=`
    <h2>Distribusi Buku Digital & Edisi Fisik</h2>
    <div class="card">
      <form data-form="module-html">
        ${field('Judul Buku Digital','title','text','','required maxlength="180"')}
        ${area('Deskripsi Singkat (opsional)','description','','maxlength="600"')}
        <div class="field"><label for="module-user">Peserta Target</label><select id="module-user" name="userId">${userOptions(true)}</select></div>
        ${field('Harga Buku Fisik / Cetak (Rp — isi 0 jika hanya digital)','physicalPrice','number','0','required min="0" step="1000"')}
        ${field('Upload File HTML (opsional, maks 5 MB)','htmlFile','file','','accept=".html,.htm,text/html"')}
        ${area('Atau Tempel Kode HTML Buku Digital di Sini','htmlCode','','rows="8" placeholder="<!doctype html><html>...</html>"')}
        ${submit('Simpan & Publikasikan Buku','green')}
      </form>
    </div>
    <h3 class="section-title">Daftar Buku Aktif</h3>
    <div class="cards">${state.ebooks.map(b=>`
      <article class="card">
        <b>${esc(b.title)}</b>
        <p style="font-size:13px">${esc(b.userId==='all'?'Semua peserta':state.users.find(u=>u.id===b.userId)?.name||b.userId)}${Number(b.physicalPrice||0)>0?` · Buku Fisik: <b>${money(b.physicalPrice)}</b>`:''}</p>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${b.kind==='html'&&b.htmlPath?`<button class="button small" data-action="read-ebook" data-id="${esc(b.id)}">Pratinjau Fullscreen</button>`:''}
          <button class="button small danger" data-action="delete-module" data-id="${esc(b.id)}">Hapus</button>
        </div>
      </article>
    `).join('')||empty('Belum ada buku digital.')}</div>
  `;
}

/* ============================================================================
3. BIMBINGAN PENGAJUAN PRAKTIK MANDIRI KEPERAWATAN (PMK)
   ============================================================================ */
const PMK_STEPS=[
  {key:'str',label:'1. STR Keperawatan Aktif (Seumur Hidup / Berlaku)'},
  {key:'ppni',label:'2. Surat Rekomendasi Organisasi Profesi (DPD PPNI)'},
  {key:'denah',label:'3. Denah Lokasi, Denah Ruangan & Foto Sarana Praktik'},
  {key:'sop',label:'4. Dokumen SOP Pelayanan, Rekam Medis & Limbah Medis'},
  {key:'sipp',label:'5. Pengajuan Izin SIPP (Dinas Kesehatan / OSS)'}
];

function renderMemberPMK(force=false){
  const pmkPrograms=state.programs.filter(p=>p.kind==='pmk'&&HauraFinance.programFee(p)>0);
  const myPmk=state.enrollments.filter(enr=>{
    const prog=state.programs.find(p=>p.id===enr.programId);
    return prog?.kind==='pmk' || enr.kind==='pmk';
  });
  if(!shouldRender('pmk', {pmkPrograms, myPmk}, force)) return;

  const myPmkHtml=myPmk.length ? myPmk.map(enr=>{
    const prog=state.programs.find(p=>p.id===enr.programId);
    const title=enr.programTitle||prog?.title||'Bimbingan Praktik Mandiri Keperawatan';
    const st=HauraFinance.statusLabel(enr);
    const lunas=HauraFinance.isPaidFull(enr);
    const sisa=HauraFinance.remainingBalance(enr);
    const hasPending=(enr.payments||[]).some(p=>p.status==='pending');
    const chk=enr.pmkChecklist||{};

    return `<article class="card" style="border-left:4px solid #087b4b">
      <div class="row spread" style="flex-wrap:wrap;gap:6px">
        <b>${esc(title)}</b>
        <span class="status ${st.code}">${esc(st.text)}</span>
      </div>
      <p style="margin:6px 0;font-size:13px">
        Biaya Bimbingan: <b>${money(enr.billedTotal)}</b> · Terkonfirmasi: <b style="color:#087b4b">${money(enr.paidAmount)}</b> · Sisa: <b>${money(sisa)}</b>
      </p>
      ${!lunas ? `
        <div style="background:#fffbeb;border:1px solid #fde68a;padding:10px;border-radius:8px;margin-bottom:10px">
          ${hasPending?'<small><b>Bukti pembayaran sedang diverifikasi.</b></small>':`<button class="button small" style="background:#d97706" data-action="pay-installment" data-id="${esc(enr.id)}">Ajukan Pelunasan (${money(sisa)})</button>`}
        </div>
      ` : ''}
      <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:10px">
        <div class="row spread" style="margin-bottom:8px">
          <b>Tahapan & Kelengkapan Berkas PMK</b>
          <span class="pill">${esc(enr.pmkStage||'Tahap Pemberkasan')}</span>
        </div>
        ${PMK_STEPS.map(step=>{
          const item=chk[step.key]||{};
          return `<div style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:13px">
            <div><b>${esc(step.label)}</b> — <span style="color:${item.done?'#087b4b':'#b45309'};font-weight:700">${item.done?'Siap / Terunggah':'Belum Lengkap'}</span></div>
            ${item.note?`<div class="muted">Catatan: ${esc(item.note)}</div>`:''}
          </div>`;
        }).join('')}
        ${enr.evaluationNote?`<p style="margin:8px 0 0;font-size:13px;color:#065f46"><b>Arahan Pembimbing:</b> ${esc(enr.evaluationNote)}</p>`:''}
        <button type="button" class="button small green" style="margin-top:10px" data-action="edit-pmk-docs" data-id="${esc(enr.id)}">Update Berkas & Checklist PMK</button>
      </div>
    </article>`;
  }).join('') : empty('Anda belum terdaftar pada bimbingan Praktik Mandiri Keperawatan.');

  const pkgHtml=pmkPrograms.map(p=>{
    const joined=myPmk.some(e=>e.programId===p.id);
    const fee=HauraFinance.programFee(p), minDp=HauraFinance.programMinDp(p);
    return `<article class="card">
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.description)}</p>
      <p style="font-size:14px">Biaya Bimbingan: <b>${money(fee)}</b><br>Minimal Daftar: <b>${money(minDp)}</b></p>
      <button class="button green" data-action="enroll" data-id="${esc(p.id)}" ${joined?'disabled':''}>${joined?'Sudah Terdaftar':'Daftar Bimbingan PMK'}</button>
    </article>`;
  }).join('')||empty('Belum ada paket bimbingan PMK tersedia.');

  $('#portal-content').innerHTML=`
    <h2>Bimbingan Pengajuan Praktik Mandiri Keperawatan (PMK)</h2>
    <div class="stack" style="margin-bottom:24px">${myPmkHtml}</div>
    <h3 class="section-title">Paket Pendampingan & Bimbingan PMK</h3>
    <div class="cards">${pkgHtml}</div>
  `;
}

function openPmkDocsModal(enrollmentId){
  const enr=state.enrollments.find(e=>e.id===enrollmentId);
  if(!enr)throw new Error('Data bimbingan tidak ditemukan.');
  const chk=enr.pmkChecklist||{};
  modal('Kelengkapan Berkas Pengajuan PMK',`
    <form data-form="save-pmk-docs" data-id="${esc(enr.id)}">
      ${PMK_STEPS.map(step=>{
        const item=chk[step.key]||{};
        return `<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:10px">
          <label style="display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer">
            <input type="checkbox" name="done_${step.key}" ${item.done?'checked':''}> ${esc(step.label)}
          </label>
          ${field('Catatan / Tautan Google Drive Berkas','note_'+step.key,'text',item.note||'','maxlength="300" placeholder="Nomor STR / link berkas / keterangan"')}
        </div>`;
      }).join('')}
      ${field('Upload Foto Denah / Dokumen Pendukung (JPG/PNG/WebP, opsional)','pmkFile','file','','accept="image/jpeg,image/png,image/webp"')}
      ${submit('Simpan Progres Berkas PMK','green')}
    </form>
  `);
}

function renderPMKAdmin(force=false){
  const pmkPrograms=state.programs.filter(p=>p.kind==='pmk');
  const pmkEnrs=state.enrollments.filter(enr=>{
    const prog=state.programs.find(p=>p.id===enr.programId);
    return prog?.kind==='pmk' || enr.kind==='pmk';
  });
  if(!shouldRender('pmk-admin', {pmkPrograms, pmkEnrs, users: state.users.map(u=>[u.id,u.name,u.fullTitleName,u.phone])}, force)) return;

  $('#portal-content').innerHTML=`
    <h2>Bimbingan Pengajuan Praktik Mandiri Keperawatan</h2>
    <details class="card" style="margin-bottom:18px">
      <summary style="font-weight:700;cursor:pointer">+ Tambah Paket Bimbingan PMK</summary>
      <form data-form="program-pmk" style="margin-top:12px">
        ${field('Nama Paket Bimbingan PMK','title','text','','required maxlength="180" placeholder="Contoh: Bimbingan Lengkap Pengajuan SIPP Praktik Mandiri Keperawatan"')}
        ${area('Rincian Pendampingan','description','','required maxlength="3000"')}
        ${field('Total Biaya Bimbingan (Rp)','totalFee','number','1000000','required min="1000" step="1000"')}
        ${field('Minimal Bayar Pendaftaran / DP (Rp)','minDownPayment','number','300000','required min="0" step="1000"')}
        ${submit('Simpan Paket PMK','green')}
      </form>
      <div class="cards" style="margin-top:12px">${pmkPrograms.map(p=>`
        <article class="card">
          <b>${esc(p.title)}</b>
          <p style="font-size:13px">${money(HauraFinance.programFee(p))} (DP: ${money(HauraFinance.programMinDp(p))})</p>
          <button type="button" class="button small danger" data-action="archive-program" data-id="${esc(p.id)}">Arsipkan</button>
        </article>
      `).join('')}</div>
    </details>

    <h3 class="section-title">Peserta Bimbingan PMK (${pmkEnrs.length})</h3>
    <div class="stack">${pmkEnrs.length ? pmkEnrs.map(enr=>{
      const u=state.users.find(x=>x.id===enr.userId);
      const st=HauraFinance.statusLabel(enr);
      const chk=enr.pmkChecklist||{};
      const doneCount=PMK_STEPS.filter(s=>chk[s.key]?.done).length;
      return `<article class="card" style="border-left:4px solid #087b4b">
        <div class="row spread" style="flex-wrap:wrap;gap:6px">
          <div>
            <b>${esc(u?.fullTitleName||u?.name||enr.userId)}</b> <small class="muted">(${esc(u?.phone||'-')})</small><br>
            <small style="color:#087b4b;font-weight:600">${esc(enr.programTitle||'Bimbingan PMK')}</small>
          </div>
          <span class="status ${st.code}">${esc(st.text)}</span>
        </div>
        <p style="font-size:13px;margin:8px 0">
          Tahap Saat Ini: <b>${esc(enr.pmkStage||'Tahap Pemberkasan')}</b> · Kelengkapan Berkas: <b>${doneCount}/${PMK_STEPS.length}</b>
        </p>
        <div style="font-size:12.5px;background:#f8fafc;padding:8px;border-radius:8px;margin-bottom:10px">
          ${PMK_STEPS.map(s=>`<div>${chk[s.key]?.done?'✅':'⬜'} ${esc(s.label)} ${chk[s.key]?.note?`<i>(${esc(chk[s.key].note)})</i>`:''}</div>`).join('')}
          ${enr.pmkDocPath?`<div style="margin-top:6px"><img src="./assets/logo.png" data-file="${esc(enr.pmkDocPath)}" alt="Dokumen PMK" style="max-width:220px;border-radius:6px;border:1px solid #cbd5e1"></div>`:''}
        </div>
        <button type="button" class="button small green" data-action="review-pmk" data-id="${esc(enr.id)}">Update Tahap & Arahan Pembimbing</button>
      </article>`;
    }).join('') : empty('Belum ada peserta bimbingan PMK.')}</div>
  `;
}

function openReviewPmkModal(enrollmentId){
  const enr=state.enrollments.find(e=>e.id===enrollmentId);
  if(!enr)throw new Error('Data tidak ditemukan.');
  const u=state.users.find(x=>x.id===enr.userId);
  modal('Update Progres Bimbingan PMK',`
    <p>Peserta: <b>${esc(u?.fullTitleName||u?.name||enr.userId)}</b></p>
    <form data-form="save-pmk-review" data-id="${esc(enr.id)}">
      <div class="field"><label for="pmk-stage">Tahap Bimbingan</label><select id="pmk-stage" name="pmkStage">
        <option ${enr.pmkStage==='Tahap 1: Pemberkasan & STR'?'selected':''}>Tahap 1: Pemberkasan & STR</option>
        <option ${enr.pmkStage==='Tahap 2: Penyusunan SOP & Denah'?'selected':''}>Tahap 2: Penyusunan SOP & Denah</option>
        <option ${enr.pmkStage==='Tahap 3: Rekomendasi PPNI'?'selected':''}>Tahap 3: Rekomendasi PPNI</option>
        <option ${enr.pmkStage==='Tahap 4: Pengajuan SIPP Dinkes/OSS'?'selected':''}>Tahap 4: Pengajuan SIPP Dinkes/OSS</option>
        <option ${enr.pmkStage==='Selesai — SIPP Terbit'?'selected':''}>Selesai — SIPP Terbit</option>
      </select></div>
      ${area('Arahan / Catatan Pembimbing', 'evaluationNote', enr.evaluationNote||'', 'maxlength="1000"')}
      ${submit('Simpan Progres Bimbingan','green')}
    </form>
  `);
}

/* ============================================================================
4. MENU PO BAJU KESEHATAN (PESERTA & ADMIN)
   ============================================================================ */
function renderMemberBaju(force=false){
  const bajuList=state.alkes.filter(a=>a.kind==='baju');
  const myBajuOrders=state.alkesOrders.filter(o=>(o.items||[]).some(i=>String(i.name||'').startsWith('[PO Baju]')));
  if(!shouldRender('baju', {bajuList, bajuCart, myBajuOrders}, force)) return;

  const itemsHtml=bajuList.length ? bajuList.map(item=>{
    const qty=Number(bajuCart[item.id]||0);
    return `<article class="card">
      ${item.imagePath?`<img src="./assets/logo.png" data-file="${esc(item.imagePath)}" alt="${esc(item.name)}" style="width:100%;height:170px;object-fit:cover;border-radius:8px;margin-bottom:8px">`:''}
      <b>${esc(item.name.replace(/^\[PO Baju\]\s*/,''))}</b>
      <p style="font-size:13px;margin:4px 0">${esc(item.description||'')}</p>
      ${item.sizes?`<p style="font-size:12px;color:#475569;margin:2px 0">Ukuran: <b>${esc(item.sizes)}</b></p>`:''}
      ${item.estimate?`<p style="font-size:12px;color:#475569;margin:2px 0">Estimasi PO: <b>${esc(item.estimate)}</b></p>`:''}
      <p style="color:#087b4b;font-weight:700;margin:6px 0">${money(item.price)} <small class="muted">/ ${esc(item.unit||'Set')}</small></p>
      <div class="row" style="gap:8px;align-items:center;margin-top:8px">
        <button type="button" class="button small" data-action="baju-qty" data-id="${esc(item.id)}" data-delta="-1">−</button>
        <b>${qty}</b>
        <button type="button" class="button small green" data-action="baju-qty" data-id="${esc(item.id)}" data-delta="1">+</button>
      </div>
    </article>`;
  }).join('') : empty('Belum ada katalog PO Baju Kesehatan.');

  let total=0;
  const selectedLines=[];
  for(const item of bajuList){
    const q=Number(bajuCart[item.id]||0);
    if(q>0){
      const sub=Number(item.price)*q;
      total+=sub;
      selectedLines.push(`• ${esc(item.name.replace(/^\[PO Baju\]\s*/,''))} (${q} ${esc(item.unit||'Set')}) = <b>${money(sub)}</b>`);
    }
  }

  const ordersHtml=myBajuOrders.length ? myBajuOrders.map(o=>`
    <div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-top:8px;background:#f8fafc">
      <div class="row spread"><b>Total: ${money(o.totalAmount)}</b><span class="status ${o.status==='confirmed'?'approved':o.status==='rejected'?'rejected':'pending'}">${o.status==='confirmed'?'Dikonfirmasi / Produksi PO':o.status==='rejected'?'Ditolak':'Menunggu Verifikasi'}</span></div>
      <div style="font-size:13px;margin-top:4px">${(o.items||[]).map(i=>`${esc(i.name)} (${i.qty}x)`).join(', ')}</div>
      <div style="font-size:12.5px;color:#475569">${esc(o.shippingNote||'')}</div>
      ${o.note?`<small class="muted">Catatan Admin: ${esc(o.note)}</small>`:''}
    </div>
  `).join('') : empty('Belum ada pesanan PO Baju Kesehatan.');

  $('#portal-content').innerHTML=`
    <h2>Pre-Order (PO) Baju Kesehatan</h2>
    <div class="cards" style="margin-bottom:20px">${itemsHtml}</div>
    ${total>0 ? `
      <div class="card" style="border-left:4px solid #087b4b;margin-bottom:20px">
        <h3>Checkout PO Baju Kesehatan</h3>
        <div style="font-size:14px;margin-bottom:8px">${selectedLines.join('<br>')}</div>
        <p style="font-size:16px">Total Pembayaran: <b style="color:#087b4b">${money(total)}</b></p>
        ${paymentInstructionBox()}
        <form data-form="order-baju">
          ${field('Rincian Ukuran (S / M / L / XL / XXL) & Pilihan Warna','sizeDetail','text','','required maxlength="200" placeholder="Contoh: 1x Ukuran L (Navy), 1x Ukuran M (Sage)"')}
          ${field('Nama Bordir di Dada (opsional)','embroideryName','text',profile?.fullTitleName||profile?.name||'','maxlength="120"')}
          ${area('Alamat Pengiriman Lengkap & No. WhatsApp','shippingNote',profile?.address||'','required maxlength="500"')}
          ${field('Bukti Pembayaran QRIS / Transfer','proof','file','','required accept="image/jpeg,image/png,image/webp"')}
          ${submit('Kirim Pesanan PO Baju','green')}
        </form>
      </div>
    ` : ''}
    <h3 class="section-title">Riwayat Pesanan PO Baju Saya</h3>
    ${ordersHtml}
  `;
}

function renderBajuAdmin(force=false){
  const bajuList=state.alkes.filter(a=>a.kind==='baju');
  const bajuOrders=state.alkesOrders.filter(o=>(o.items||[]).some(i=>String(i.name||'').startsWith('[PO Baju]')));
  if(!shouldRender('baju-admin', {bajuList, bajuOrders, users: state.users.map(u=>[u.id,u.name,u.fullTitleName])}, force)) return;

  $('#portal-content').innerHTML=`
    <h2>Kelola PO Baju Kesehatan</h2>
    <div class="card" style="margin-bottom:18px">
      <form data-form="add-baju">
        ${field('Nama Model Baju Kesehatan (Scrubs / Jas Lab / Tunik)','name','text','','required maxlength="180"')}
        ${field('Harga PO (Rp)','price','number','','required min="1000" step="1000"')}
        ${field('Pilihan Ukuran Tersedia','sizes','text','S, M, L, XL, XXL','maxlength="120"')}
        ${field('Estimasi Pengerjaan PO','estimate','text','10 - 14 Hari Kerja','maxlength="80"')}
        ${area('Bahan & Keterangan Warna','description','','maxlength="1000" placeholder="Contoh: Bahan American Drill / Toyobo, tersedia warna Navy, Maroon, Sage Green"')}
        ${field('Foto Model Baju (opsional)','bajuImg','file','','accept="image/jpeg,image/png,image/webp"')}
        ${submit('Tambah Katalog PO Baju','green')}
      </form>
    </div>

    <h3 class="section-title">Katalog PO Baju Aktif (${bajuList.length})</h3>
    <div class="cards" style="margin-bottom:20px">${bajuList.map(b=>`
      <article class="card">
        ${b.imagePath?`<img src="./assets/logo.png" data-file="${esc(b.imagePath)}" alt="${esc(b.name)}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:8px">`:''}
        <b>${esc(b.name.replace(/^\[PO Baju\]\s*/,''))}</b>
        <p style="font-size:13px">${money(b.price)} · Ukuran: ${esc(b.sizes||'-')}</p>
        <button type="button" class="button small danger" data-action="archive-alkes" data-id="${esc(b.id)}">Arsipkan</button>
      </article>
    `).join('')||empty('Belum ada katalog baju.')}</div>

    <h3 class="section-title">Daftar Pesanan PO Baju (${bajuOrders.length})</h3>
    <div class="stack">${bajuOrders.map(ord=>{
      const u=state.users.find(x=>x.id===ord.userId);
      return `<article class="card" style="border-left:4px solid ${ord.status==='confirmed'?'#087b4b':'#d97706'}">
        <div class="row spread" style="flex-wrap:wrap;gap:6px">
          <div>
            <b>${esc(u?.fullTitleName||u?.name||ord.userId)}</b> · <b style="color:#087b4b">${money(ord.totalAmount)}</b><br>
            <small>${(ord.items||[]).map(i=>`${esc(i.name)} (${i.qty}x)`).join(', ')}</small><br>
            <small class="muted">${esc(ord.shippingNote||'-')}</small>
          </div>
          <div class="row" style="gap:6px">
            <span class="status ${ord.status==='confirmed'?'approved':ord.status==='rejected'?'rejected':'pending'}">${ord.status==='confirmed'?'Terkonfirmasi':ord.status==='rejected'?'Ditolak':'Pending'}</span>
            <button class="button small" data-action="review-alkes-order" data-id="${esc(ord.id)}">Periksa & Konfirmasi</button>
          </div>
        </div>
      </article>`;
    }).join('')||empty('Belum ada pesanan PO baju.')}</div>
  `;
}

/* ============================================================================
5. SERTIFIKAT PESERTA & GENERATOR + CETAK MASSAL / PER ANGKATAN (ADMIN)
   ============================================================================ */
function renderMemberCertificates(force=false){
  if(!shouldRender('certificates', state.certificates, force)) return;
  const root=$('#portal-content');
  const html=state.certificates.length ? state.certificates.map(c=>{
    if(c.locked){
      return `<article class="card" style="border-left:4px solid #d97706;background:#fffbeb">
        <h3>${esc(c.title)}</h3>
        <p style="color:#78350f">Sertifikat terkunci sampai pelunasan biaya pelatihan dikonfirmasi.</p>
      </article>`;
    }
    return `<article class="card">
      <h3>${esc(c.title)}</h3>
      <p>No. <b>${esc(c.serial)}</b> · ${date(c.createdAt)}</p>
      ${img(c.imagePath,'certificate-image','Sertifikat '+c.title)}
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="button green" data-action="download-cert" data-id="${esc(c.id)}">↓ Cetak / Unduh Sertifikat PDF</button>
        <button class="button small" data-action="verify-cert-preview" data-serial="${esc(c.serial)}">Cek Orisinalitas QR</button>
      </div>
    </article>`;
  }).join('') : empty('Belum ada sertifikat.');
  root.innerHTML=`<h2>Sertifikat Profesional</h2><div class="stack">${html}</div>`;
}

function nextAutoSerial(offset=0){
  const year=new Date().getFullYear();
  let maxNum=0;
  for(const c of state.certificates){
    const m=String(c.serial||'').match(/(\d+)\s*$/);
    if(m)maxNum=Math.max(maxNum,Number(m[1]));
  }
  const idxCount=Object.keys(state.cms?.certIndex||{}).length;
  const base=Math.max(maxNum,idxCount,state.certificates.length)+1+offset;
  return `HI/${year}/${String(base).padStart(4,'0')}`;
}

function renderCertificateEditor(){
  const paidEnrollments=state.enrollments.filter(e=>HauraFinance.isPaidFull(e));
  const batches=[...new Set(state.users.map(u=>u.batch).filter(Boolean))];
  const filteredPaid=paidEnrollments.filter(e=>{
    const u=state.users.find(x=>x.id===e.userId);
    if(certFilterProg!=='ALL' && e.programId!==certFilterProg)return false;
    if(certFilterBatch!=='ALL' && (u?.batch||'')!==certFilterBatch)return false;
    return true;
  });

  const progOpts=`<option value="ALL">Semua Program</option>`+state.programs.map(p=>`<option value="${esc(p.id)}" ${certFilterProg===p.id?'selected':''}>${esc(p.title)}</option>`).join('');
  const batchOpts=`<option value="ALL">Semua Angkatan / Kelas</option>`+batches.map(b=>`<option value="${esc(b)}" ${certFilterBatch===b?'selected':''}>${esc(b)}</option>`).join('');

  const candidateRows=filteredPaid.length ? filteredPaid.map((e,idx)=>{
    const u=state.users.find(x=>x.id===e.userId);
    const prog=state.programs.find(x=>x.id===e.programId);
    const title=e.programTitle||prog?.title||'Program';
    const alreadyIssued=state.certificates.some(c=>c.enrollmentId===e.id);
    return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid #e2e8f0;cursor:pointer">
      <div style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" class="cert-pick" value="${esc(e.id)}" ${idx===0?'checked':''}>
        <div>
          <b>${esc(u?.fullTitleName||u?.name||e.userId)}</b> <small class="muted">(${esc(u?.batch||'Tanpa Angkatan')})</small><br>
          <small>${esc(title)}</small>
        </div>
      </div>
      <span class="status ${alreadyIssued?'approved':'pending'}">${alreadyIssued?'Sudah Terbit':'Belum Terbit'}</span>
    </label>`;
  }).join('') : empty('Tidak ada peserta lunas pada filter ini.');

  const issuedFiltered=state.certificates.filter(c=>{
    const u=state.users.find(x=>x.id===c.userId);
    if(certFilterProg!=='ALL' && c.programId!==certFilterProg)return false;
    if(certFilterBatch!=='ALL' && (u?.batch||'')!==certFilterBatch)return false;
    return true;
  });

  $('#portal-content').innerHTML=`
    <h2>Generator & Cetak Sertifikat (Satuan / Kelas / Massal)</h2>
    <div class="card" style="margin-bottom:16px">
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:end">
        <div class="field" style="margin:0;flex:1;min-width:200px"><label for="cert-filter-prog">Filter Program</label><select id="cert-filter-prog">${progOpts}</select></div>
        <div class="field" style="margin:0;flex:1;min-width:200px"><label for="cert-filter-batch">Filter Angkatan / Kelas</label><select id="cert-filter-batch">${batchOpts}</select></div>
        <div class="row" style="gap:6px">
          <button type="button" class="button small" data-action="cert-select-all">Pilih Semua (${filteredPaid.length})</button>
          <button type="button" class="button small ghost" data-action="cert-unselect-all">Batal Pilih</button>
        </div>
      </div>
      <div style="max-height:220px;overflow-y:auto;border:1px solid #cbd5e1;border-radius:8px;margin-top:10px;background:#fff">
        ${candidateRows}
      </div>
    </div>

    <div class="cert-grid">
      <form id="certificate-form" data-form="publish-cert-batch" class="card">
        ${field('Nomor Sertifikat Awal (Otomatis Berurutan)','serial','text',nextAutoSerial(0),'required maxlength="80"')}
        ${field('Nama Institusi','heading','text','HAURA INSTITUTE','required maxlength="80"')}
        ${field('Subjudul','subtitle','text','Center of Medical Excellence','maxlength="100"')}
        ${field('Kalimat Pembuka','intro','text','Diberikan kepada:','maxlength="150"')}
        ${field('Kalimat Penghargaan','body','text','Atas partisipasinya dalam program pelatihan:','maxlength="180"')}
        ${field('Nama Pelatihan (kosongkan untuk otomatis mengikuti program)','course','text','','maxlength="150"')}
        <div class="field"><label for="pred">Predikat</label><select id="pred" name="predicate"><option>EXCELLENT</option><option>VERY GOOD</option><option>GOOD</option><option>PARTICIPANT</option></select></div>
        ${field('Tempat','place','text','Lombok Tengah','maxlength="60"')}
        ${field('Tanggal Terbit','issued','date',new Date().toISOString().slice(0,10),'required')}
        ${field('Logo Utama','main','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="main"')}
        ${field('Logo Mitra (opsional)','partner','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="partner"')}
        ${field('Nama Penandatangan Kiri','leftName','text','','maxlength="100"')}
        ${field('Jabatan Kiri','leftTitle','text','','maxlength="100"')}
        ${field('Tanda Tangan Kiri','left','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="left"')}
        ${field('Nama Penandatangan Kanan','rightName','text',author,'maxlength="100"')}
        ${field('Jabatan Kanan','rightTitle','text','Direktur Haura Institute','maxlength="100"')}
        ${field('Tanda Tangan Kanan','right','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="right"')}
        ${submit('Terbitkan & Cetak PDF Terpilih','green')}
        <p><button class="button" type="button" data-action="preview-pdf">Unduh Preview 1 Halaman PDF</button></p>
      </form>
      <div class="cert-scroll"><div id="certificate-preview" class="certificate"></div></div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="row spread" style="flex-wrap:wrap;gap:8px;margin-bottom:10px">
        <h3 style="margin:0">Sertifikat Sudah Terbit (${issuedFiltered.length})</h3>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="button small" data-action="issued-select-all">Centang Semua</button>
          <button type="button" class="button small green" data-action="print-issued-selected">Cetak PDF Sertifikat Dicentang</button>
        </div>
      </div>
      ${issuedFiltered.length ? issuedFiltered.map(c=>{
        const u=state.users.find(x=>x.id===c.userId);
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" class="issued-pick" value="${esc(c.id)}">
            <span><b>${esc(c.serial)}</b> — ${esc(u?.fullTitleName||u?.name||c.userId)} (${esc(c.title)})</span>
          </label>
          <div class="row" style="gap:6px">
            <button type="button" class="button small" data-action="verify-cert-preview" data-serial="${esc(c.serial)}">Cek QR</button>
            <button type="button" class="button small green" data-action="admin-print-one-cert" data-id="${esc(c.id)}">Cetak 1 PDF</button>
          </div>
        </div>`;
      }).join('') : empty('Belum ada sertifikat terbit pada filter ini.')}
    </div>
  `;
  updateCertificate();
}

function certificateData(){const f=$('#certificate-form');return f?Object.fromEntries(new FormData(f)):{};}
function updateCertificate(overrideEnr=null, overrideSerial=null){
  const el=$('#certificate-preview');if(!el)return;
  const c=certificateData();
  const checkedEl=document.querySelector('.cert-pick:checked');
  const enr=overrideEnr||(checkedEl?state.enrollments.find(e=>e.id===checkedEl.value):null);
  const u=enr?state.users.find(x=>x.id===enr.userId):null;
  const prog=enr?state.programs.find(x=>x.id===enr.programId):null;
  const courseName=(c.course||'').trim()||(enr?.programTitle||prog?.title||'Nama Program Pelatihan');
  const serial=overrideSerial||c.serial||nextAutoSerial(0);
  const qrDataUrl=makeQrDataUrl(certVerifyURL(serial));
  const issuedFmt=c.issued?new Date(c.issued+'T12:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}):'';

  const sign=(key,name,title)=>`<div>${certImages[key]?`<img src="${esc(certImages[key])}" alt="Tanda tangan">`:'<div class="signature-space"></div>'}<b>${esc(name||'________________________')}</b><span>${esc(title)}</span></div>`;
  el.innerHTML=`
    <div>
      <div class="cert-logos"><img src="${esc(certImages.main)}" alt="Logo">${certImages.partner?`<img src="${esc(certImages.partner)}" alt="Mitra">`:''}</div>
      <h2>${esc(c.heading)}</h2>
      <span class="cert-sub">${esc(c.subtitle)}</span>
    </div>
    <div>
      <p>${esc(c.intro)}</p>
      <h3>${esc(u?.fullTitleName||u?.name||'Nama Peserta')}</h3>
      <p>${esc(u?.institution||'Instansi Peserta')}</p>
      <p>${esc(c.body)}</p>
      <div class="cert-course">${esc(courseName)}</div>
      <p>Predikat: <b>${esc(c.predicate)}</b></p>
    </div>
    <div style="width:100%">
      <p>${esc(c.place)}, ${esc(issuedFmt)}</p>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px">
        <div style="text-align:center;min-width:96px">
          <img src="${qrDataUrl}" alt="QR Verifikasi" style="width:76px;height:76px;border:1px solid #cbd5e1;padding:3px;background:#fff;border-radius:6px">
          <div style="font-size:8.5px;color:#475569;margin-top:2px">Scan Verifikasi</div>
        </div>
        <div class="cert-signatures" style="flex:1">${sign('left',c.leftName,c.leftTitle)}${sign('right',c.rightName,c.rightTitle)}</div>
      </div>
      <p class="cert-meta">No. ${esc(serial)} · Haura Institute</p>
    </div>
  `;
}

async function captureCertificate(){const {html2canvas}=await import('../vendor/pdf.js');await document.fonts.ready;const node=$('#certificate-preview');await Promise.all([...node.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));return html2canvas(node,{scale:2,backgroundColor:'#fff',useCORS:false,logging:false,windowWidth:1500});}
async function pdfDownload(source,title){const {jsPDF}=await import('../vendor/pdf.js');const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});pdf.addImage(source,'JPEG',0,0,297,210);pdf.save(`${title.replace(/[^a-z0-9_-]/gi,'_').slice(0,90)}.pdf`);}

/* ============================================================================
6. KOTAK PEMBAYARAN QRIS & MODAL PEMBAYARAN PROGRAM
   ============================================================================ */
function paymentInstructionBox(){
  const qris=state.cms.qrisPath;
  const info=state.cms.paymentInfo;
  if(!qris && !info)return `<div style="background:#fef2f2;border:1px solid #fecaca;padding:10px;border-radius:8px;color:#991b1b;font-size:13px;margin-bottom:12px">QRIS / Rekening pembayaran belum diatur admin.</div>`;
  return `<div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:12px;border-radius:10px;margin-bottom:14px">
    <b style="color:#166534;display:block;margin-bottom:6px">Pembayaran QRIS / Transfer Resmi</b>
    ${qris?`<div style="text-align:center;margin:8px 0"><img src="./assets/logo.png" data-file="${esc(qris)}" alt="QRIS Haura Institute" style="max-width:210px;width:100%;border-radius:8px;border:1px solid #cbd5e1"></div>`:''}
    ${info?`<div style="white-space:pre-wrap;font-size:13px;background:#fff;padding:8px;border-radius:6px;border:1px solid #dcfce7">${esc(info)}</div>`:''}
  </div>`;
}

function openPaidEnrollModal(programId){
  const p=state.programs.find(x=>x.id===programId);
  if(!p)throw new Error('Program tidak ditemukan.');
  const fee=HauraFinance.programFee(p), minDp=HauraFinance.programMinDp(p);
  modal('Pendaftaran Program',`
    <p><b>${esc(p.title)}</b></p>
    <p style="font-size:14px">Total Biaya: <b>${money(fee)}</b> · Minimal Daftar: <b>${money(minDp)}</b></p>
    ${paymentInstructionBox()}
    <form data-form="paid-enroll" data-id="${esc(p.id)}">
      ${field('Nominal Pembayaran Awal (Rp)','amount','number',String(minDp||fee),`required min="${minDp}" max="${fee}" step="1000"`)}
      ${field('Bukti Pembayaran QRIS / Transfer','proof','file','','required accept="image/jpeg,image/png,image/webp"')}
      ${submit('Kirim Pendaftaran','green')}
    </form>
  `);
}

function openInstallmentModal(enrollmentId){
  const enr=state.enrollments.find(e=>e.id===enrollmentId);
  if(!enr)throw new Error('Data pendaftaran tidak ditemukan.');
  const sisa=HauraFinance.remainingBalance(enr);
  modal('Pelunasan Biaya',`
    <p><b>${esc(enr.programTitle||'Program')}</b></p>
    <p style="font-size:14px">Sisa Tagihan: <b style="color:#b45309">${money(sisa)}</b></p>
    ${paymentInstructionBox()}
    <form data-form="submit-installment" data-id="${esc(enr.id)}">
      ${field('Nominal Pembayaran (Rp)','amount','number',String(sisa),`required min="1000" max="${sisa}" step="1000"`)}
      ${field('Bukti Pembayaran QRIS / Transfer','proof','file','','required accept="image/jpeg,image/png,image/webp"')}
      ${submit('Kirim Bukti Pelunasan','green')}
    </form>
  `);
}

/* ============================================================================
7. DISKUSI SBAR BERLANGGANAN (QRIS) & PEMESANAN ALKES (PESERTA)
   ============================================================================ */
function renderMemberChatAndAlkes(force=false){
  const root=$('#portal-content');
  if(chatSubTab==='consult' && profile?.chatAccess && $('#messages') && !force){
    return;
  }
  const sig = JSON.stringify({
    chatSubTab,
    chatAccess: Boolean(profile?.chatAccess),
    alkes: state.alkes.filter(a=>!a.kind||a.kind==='alkes'),
    alkesCart,
    alkesOrders: state.alkesOrders,
    chatPayments: state.chatPayments,
    chatFee: state.cms.chatFee,
    chatDurationLabel: state.cms.chatDurationLabel
  });
  if(!shouldRender('chat', sig, force)) return;

  const switcher=`
    <div class="row" style="gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button type="button" class="button ${chatSubTab==='consult'?'green':'ghost'}" data-action="chat-subtab" data-id="consult">Diskusi Klinis (SBAR)</button>
      <button type="button" class="button ${chatSubTab==='alkes'?'green':'ghost'}" data-action="chat-subtab" data-id="alkes">Pemesanan Alkes & BMHP</button>
    </div>
  `;

  if(chatSubTab==='alkes'){
    chatStop?.();chatStop=null;
    const alkesList=state.alkes.filter(a=>!a.kind || a.kind==='alkes');
    const itemsHtml=alkesList.length ? alkesList.map(item=>{
      const qty=Number(alkesCart[item.id]||0);
      return `<article class="card">
        ${item.imagePath?`<img src="./assets/logo.png" data-file="${esc(item.imagePath)}" alt="${esc(item.name)}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:8px">`:''}
        <b>${esc(item.name)}</b>
        <p style="font-size:13px;margin:4px 0">${esc(item.description||'')}</p>
        <p style="color:#087b4b;font-weight:700;margin:4px 0">${money(item.price)} <small class="muted">/ ${esc(item.unit)}</small></p>
        <div class="row" style="gap:8px;align-items:center;margin-top:8px">
          <button type="button" class="button small" data-action="alkes-qty" data-id="${esc(item.id)}" data-delta="-1">−</button>
          <b>${qty}</b>
          <button type="button" class="button small green" data-action="alkes-qty" data-id="${esc(item.id)}" data-delta="1">+</button>
        </div>
      </article>`;
    }).join('') : empty('Belum ada produk alkes tersedia.');

    let total=0;
    const selectedLines=[];
    for(const item of alkesList){
      const q=Number(alkesCart[item.id]||0);
      if(q>0){
        const sub=Number(item.price)*q;
        total+=sub;
        selectedLines.push(`• ${esc(item.name)} (${q} ${esc(item.unit)}) = <b>${money(sub)}</b>`);
      }
    }

    const myOrdersHtml=state.alkesOrders.filter(o=>!(o.items||[]).some(i=>String(i.name||'').startsWith('[PO Baju]')||String(i.name||'').startsWith('[Buku Fisik]'))).map(o=>`
      <div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-top:8px;background:#f8fafc">
        <div class="row spread"><b>Total: ${money(o.totalAmount)}</b><span class="status ${o.status==='confirmed'?'approved':o.status==='rejected'?'rejected':'pending'}">${o.status==='confirmed'?'Dikonfirmasi':o.status==='rejected'?'Ditolak':'Menunggu Verifikasi'}</span></div>
        <div style="font-size:13px;margin-top:4px">${(o.items||[]).map(i=>`${esc(i.name)} (${i.qty}x)`).join(', ')}</div>
        ${o.note?`<small class="muted">Catatan: ${esc(o.note)}</small>`:''}
      </div>
    `).join('') || empty('Belum ada riwayat pesanan alkes.');

    root.innerHTML=`
      ${switcher}
      <h2>Pemesanan Alkes & BMHP</h2>
      <div class="cards" style="margin-bottom:18px">${itemsHtml}</div>
      ${total>0 ? `
        <div class="card" style="border-left:4px solid #087b4b;margin-bottom:20px">
          <h3>Checkout Pesanan Alkes</h3>
          <div style="font-size:14px;margin-bottom:8px">${selectedLines.join('<br>')}</div>
          <p style="font-size:16px">Total Pembayaran: <b style="color:#087b4b">${money(total)}</b></p>
          ${paymentInstructionBox()}
          <form data-form="order-alkes">
            ${area('Alamat Pengiriman / Catatan Pesanan','shippingNote',profile?.address||'','required maxlength="500"')}
            ${field('Bukti Pembayaran QRIS / Transfer','proof','file','','required accept="image/jpeg,image/png,image/webp"')}
            ${submit('Kirim Pesanan Alkes','green')}
          </form>
        </div>
      ` : ''}
      <h3 class="section-title">Riwayat Pesanan Alkes Saya</h3>
      ${myOrdersHtml}
    `;
    return;
  }

  if(profile.chatAccess){
    if(!$('#messages')){
      root.innerHTML=`${switcher}<h2>Diskusi Klinis (SBAR)</h2><div id="chat-host"></div>`;
      createRoom(me.uid,'Tim Konsultan Haura Institute');
    }
    return;
  }

  chatStop?.();chatStop=null;
  const fee=Number(state.cms.chatFee||0);
  const dur=state.cms.chatDurationLabel||'30 Hari';
  const pendingSub=state.chatPayments.find(cp=>cp.status==='pending');
  const rejectedSub=state.chatPayments.find(cp=>cp.status==='rejected');

  root.innerHTML=`
    ${switcher}
    <h2>Paket Langganan Diskusi Klinis (SBAR)</h2>
    <div class="card" style="border-left:4px solid #087b4b">
      <p style="font-size:16px;margin:0 0 8px">Biaya Langganan: <b style="color:#087b4b">${money(fee)}</b> · Masa Aktif: <b>${esc(dur)}</b></p>
      ${pendingSub
        ? `<p><span class="status pending">Menunggu Verifikasi Pembayaran</span></p>`
        : `
          ${rejectedSub?`<p><span class="status rejected">Pembayaran sebelumnya ditolak${rejectedSub.note?': '+esc(rejectedSub.note):''}</span></p>`:''}
          ${fee>0 ? `
            ${paymentInstructionBox()}
            <form data-form="subscribe-chat">
              ${field('Upload Bukti Pembayaran QRIS / Transfer','proof','file','','required accept="image/jpeg,image/png,image/webp"')}
              ${submit('Aktifkan Langganan Diskusi','green')}
            </form>
          ` : '<p class="muted">Paket langganan belum tersedia.</p>'}
        `
      }
    </div>
  `;
}

/* ============================================================================
8. ADMIN: KEUANGAN, QRIS, ALKES & PESERTA / ANGKATAN
   ============================================================================ */
function renderFinanceAdmin(force=false){
  const sig = JSON.stringify({
    financeFilterProgram,
    enrollments: state.enrollments,
    chatPayments: state.chatPayments,
    alkesOrders: state.alkesOrders,
    expenses: state.expenses,
    alkes: state.alkes,
    programs: state.programs.map(p=>[p.id,p.title]),
    users: state.users.map(u=>[u.id,u.name,u.fullTitleName,u.institution]),
    cms: {q:state.cms.qrisPath,p:state.cms.paymentInfo,f:state.cms.chatFee,d:state.cms.chatDurationLabel}
  });
  if(!shouldRender('finance', sig, force)) return;

  const recap=HauraFinance.calculateRecap(state.enrollments, state.chatPayments, state.alkesOrders, state.expenses, financeFilterProgram);
  const programOptions=`<option value="ALL" ${financeFilterProgram==='ALL'?'selected':''}>Semua Pemasukan & Program</option>`+
    state.programs.map(p=>`<option value="${esc(p.id)}" ${financeFilterProgram===p.id?'selected':''}>${esc(p.title)}</option>`).join('');

  const filteredEnrollments=(financeFilterProgram==='ALL'
    ? state.enrollments
    : state.enrollments.filter(e=>e.programId===financeFilterProgram)
  ).filter(e=>!HauraFinance.isLegacyFree(e));

  const filteredExpenses=financeFilterProgram==='ALL'
    ? state.expenses
    : state.expenses.filter(x=>x.programId===financeFilterProgram);

  const enrollmentCards=filteredEnrollments.length ? filteredEnrollments.map(enr=>{
    const u=state.users.find(x=>x.id===enr.userId);
    const prog=state.programs.find(x=>x.id===enr.programId);
    const st=HauraFinance.statusLabel(enr);
    const sisa=HauraFinance.remainingBalance(enr);
    const lunas=HauraFinance.isPaidFull(enr);

    const payRows=(enr.payments||[]).map(p=>`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 8px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;margin-top:6px">
        <div>
          <b>${esc(p.label||'Pembayaran')}</b>: ${money(p.amount)}<br>
          <small class="muted">${date(p.submittedAt)}</small>
        </div>
        <div class="row" style="gap:6px">
          <span class="status ${p.status==='confirmed'?'approved':p.status==='rejected'?'rejected':'pending'}">${p.status==='confirmed'?'Terkonfirmasi':p.status==='rejected'?'Ditolak':'Pending'}</span>
          <button class="button small" data-action="review-payment" data-enr="${esc(enr.id)}" data-pay="${esc(p.id)}">Periksa Bukti</button>
        </div>
      </div>
    `).join('');

    return `<article class="card" style="border-left:4px solid ${lunas?'#087b4b':'#d97706'}">
      <div class="row spread" style="flex-wrap:wrap;gap:6px">
        <div>
          <b>${esc(u?.fullTitleName||u?.name||enr.userId)}</b> <small class="muted">(${esc(u?.institution||'-')})</small><br>
          <small style="color:#087b4b;font-weight:600">${esc(enr.programTitle||prog?.title||'Program')}</small>
        </div>
        <span class="status ${st.code}">${esc(st.text)}</span>
      </div>
      <p style="margin:8px 0;font-size:13px">
        Tagihan: <b>${money(enr.billedTotal)}</b> ·
        Masuk Kas: <b style="color:#087b4b">${money(enr.paidAmount)}</b> ·
        Sisa: <b style="color:${sisa>0?'#b45309':'#087b4b'}">${money(sisa)}</b> ·
        Nilai: <b>${enr.score!==null&&enr.score!==undefined?esc(enr.score):'-'}</b>
      </p>
      <div style="background:#f8fafc;padding:8px;border-radius:8px;margin-bottom:10px">
        ${payRows||'<p class="muted">Belum ada bukti.</p>'}
      </div>
      <button class="button small green" data-action="grade-enrollment" data-id="${esc(enr.id)}">Input Nilai Evaluasi</button>
    </article>`;
  }).join('') : empty('Belum ada peserta pada filter ini.');

  const chatPayCards=state.chatPayments.length ? state.chatPayments.map(cp=>{
    const u=state.users.find(x=>x.id===cp.userId);
    return `<article class="card" style="border-left:4px solid ${cp.status==='confirmed'?'#087b4b':'#d97706'}">
      <div class="row spread" style="flex-wrap:wrap;gap:6px">
        <div><b>${esc(u?.fullTitleName||u?.name||cp.userId)}</b> · <b>${money(cp.amount)}</b> (${esc(cp.durationLabel||'30 Hari')})<br><small class="muted">${date(cp.createdAt)}</small></div>
        <div class="row" style="gap:6px">
          <span class="status ${cp.status==='confirmed'?'approved':cp.status==='rejected'?'rejected':'pending'}">${cp.status==='confirmed'?'Terkonfirmasi':cp.status==='rejected'?'Ditolak':'Pending'}</span>
          <button class="button small" data-action="review-chat-pay" data-id="${esc(cp.id)}">Periksa Bukti</button>
        </div>
      </div>
    </article>`;
  }).join('') : empty('Belum ada pembayaran langganan diskusi.');

  const alkesOrderCards=state.alkesOrders.length ? state.alkesOrders.map(ord=>{
    const u=state.users.find(x=>x.id===ord.userId);
    return `<article class="card" style="border-left:4px solid ${ord.status==='confirmed'?'#087b4b':'#d97706'}">
      <div class="row spread" style="flex-wrap:wrap;gap:6px">
        <div>
          <b>${esc(u?.fullTitleName||u?.name||ord.userId)}</b> · <b style="color:#087b4b">${money(ord.totalAmount)}</b><br>
          <small>${(ord.items||[]).map(i=>`${esc(i.name)} (${i.qty}x)`).join(', ')}</small><br>
          <small class="muted">Kirim: ${esc(ord.shippingNote||'-')}</small>
        </div>
        <div class="row" style="gap:6px">
          <span class="status ${ord.status==='confirmed'?'approved':ord.status==='rejected'?'rejected':'pending'}">${ord.status==='confirmed'?'Terkonfirmasi':ord.status==='rejected'?'Ditolak':'Pending'}</span>
          <button class="button small" data-action="review-alkes-order" data-id="${esc(ord.id)}">Periksa Pesanan</button>
        </div>
      </div>
    </article>`;
  }).join('') : empty('Belum ada pesanan produk.');

  const expenseRows=filteredExpenses.length ? filteredExpenses.map(x=>{
    const prog=state.programs.find(p=>p.id===x.programId);
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #e2e8f0">
      <div>
        <span class="pill" style="font-size:11px">${esc(x.category)}</span> <b>${esc(x.description)}</b><br>
        <small class="muted">${esc(prog?.title||'Program')} · ${esc(x.date)}</small>
      </div>
      <div class="row" style="gap:8px">
        <b style="color:#9f1734">-${money(x.amount)}</b>
        <button class="button small danger" data-action="delete-expense" data-id="${esc(x.id)}">Hapus</button>
      </div>
    </div>`;
  }).join('') : empty('Belum ada catatan pengeluaran.');

  const regularAlkes=state.alkes.filter(a=>!a.kind||a.kind==='alkes');

  $('#portal-content').innerHTML=`
    <div class="row spread" style="flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <h2 style="margin:0">Keuangan, QRIS, Produk & Evaluasi</h2>
      <div class="field" style="margin:0;min-width:240px">
        <select id="finance-filter">${programOptions}</select>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:18px">
      <div class="card" style="padding:12px"><small class="muted">Peserta (Daftar / DP / Lunas)</small><div style="font-size:18px;font-weight:700;margin-top:4px">${recap.totalSubmissions} / ${recap.confirmedDpCount} / ${recap.paidFullCount}</div><small class="muted">Bukti menunggu: <b>${recap.pendingProofCount}</b></small></div>
      <div class="card" style="padding:12px"><small class="muted">Kas Masuk Terkonfirmasi</small><div style="font-size:18px;font-weight:700;color:#087b4b;margin-top:4px">${money(recap.confirmedCashIn)}</div><small class="muted">Program/PMK: ${money(recap.programCashIn)} · Diskusi: ${money(recap.chatCashIn)} · Alkes/Buku/Baju: ${money(recap.alkesCashIn)}</small></div>
      <div class="card" style="padding:12px"><small class="muted">Total Pengeluaran</small><div style="font-size:18px;font-weight:700;color:#9f1734;margin-top:4px">${money(recap.totalExpense)}</div><small class="muted">BMHP: ${money(recap.bmhp)} · Alkes: ${money(recap.alkes)}</small></div>
      <div class="card" style="padding:12px;background:#f0fdf4;border:1px solid #86efac"><small style="color:#166534;font-weight:600">Kas Bersih</small><div style="font-size:20px;font-weight:800;color:#14532d;margin-top:4px">${money(recap.netCash)}</div><small class="muted">Sisa piutang: <b>${money(recap.remainingReceivables)}</b></small></div>
    </div>

    <details class="card" style="margin-bottom:14px">
      <summary style="font-weight:700;cursor:pointer">Pengaturan QRIS, Rekening & Paket Diskusi</summary>
      <form data-form="finance-config" style="margin-top:12px">
        ${state.cms.qrisPath?`<div style="margin-bottom:10px"><img src="./assets/logo.png" data-file="${esc(state.cms.qrisPath)}" alt="QRIS" style="max-width:180px;border-radius:8px;border:1px solid #cbd5e1"><br><button type="button" class="button small danger" data-action="remove-qris" style="margin-top:6px">Hapus QRIS</button></div>`:''}
        ${field('Upload Gambar QRIS Pembayaran','qris','file','','accept="image/jpeg,image/png,image/webp"')}
        ${area('Nomor Rekening / E-Wallet','paymentInfo',state.cms.paymentInfo,'maxlength="2000"')}
        ${field('Biaya Langganan Diskusi SBAR (Rp)','chatFee','number',String(state.cms.chatFee||50000),'required min="0" step="1000"')}
        ${field('Keterangan Masa Aktif Diskusi','chatDurationLabel','text',state.cms.chatDurationLabel||'30 Hari','maxlength="80"')}
        ${submit('Simpan Pengaturan Keuangan','green')}
      </form>
    </details>

    <details class="card" style="margin-bottom:14px">
      <summary style="font-weight:700;cursor:pointer">Kelola Katalog Alkes & BMHP (${regularAlkes.length})</summary>
      <form data-form="add-alkes" style="margin-top:12px">
        ${field('Nama Alkes / BMHP','name','text','','required maxlength="180"')}
        ${field('Satuan (Box / Pcs / Set)','unit','text','Set','required maxlength="60"')}
        ${field('Harga Satuan (Rp)','price','number','','required min="500" step="500"')}
        ${area('Spesifikasi / Deskripsi Singkat','description','','maxlength="1000"')}
        ${field('Foto Produk Alkes (opsional)','alkesImg','file','','accept="image/jpeg,image/png,image/webp"')}
        ${submit('Tambah Produk Alkes','green')}
      </form>
      <div class="cards" style="margin-top:12px">${regularAlkes.map(a=>`
        <article class="card">
          <b>${esc(a.name)}</b>
          <p>${money(a.price)} / ${esc(a.unit)}</p>
          <button type="button" class="button small danger" data-action="archive-alkes" data-id="${esc(a.id)}">Arsipkan</button>
        </article>
      `).join('')}</div>
    </details>

    <details class="card" style="margin-bottom:18px">
      <summary style="font-weight:700;cursor:pointer">Catat Pengeluaran (BMHP / Alkes / Operasional)</summary>
      <form data-form="add-expense" style="margin-top:12px">
        <div class="field"><label for="exp-prog">Program / Unit</label><select id="exp-prog" name="programId" required><option value="">— Pilih Program —</option>${state.programs.map(p=>`<option value="${esc(p.id)}" ${financeFilterProgram===p.id?'selected':''}>${esc(p.title)}</option>`).join('')}</select></div>
        <div class="field"><label for="exp-cat">Kategori</label><select id="exp-cat" name="category" required><option value="BMHP">BMHP</option><option value="Instrumen/Alkes">Instrumen/Alkes</option><option value="Operasional">Operasional</option></select></div>
        ${field('Keterangan Pembelanjaan','description','text','','required maxlength="300"')}
        ${field('Nominal Pengeluaran (Rp)','amount','number','','required min="1" step="500"')}
        ${field('Tanggal','date','date',new Date().toISOString().slice(0,10),'required')}
        ${submit('Simpan Pengeluaran')}
      </form>
      <div style="margin-top:14px">${expenseRows}</div>
    </details>

    ${financeFilterProgram==='ALL' ? `
      <h3 class="section-title">Verifikasi Langganan Diskusi SBAR (${state.chatPayments.filter(x=>x.status==='pending').length} Pending)</h3>
      <div class="stack" style="margin-bottom:18px">${chatPayCards}</div>

      <h3 class="section-title">Verifikasi Pesanan Alkes, Buku Fisik & PO Baju (${state.alkesOrders.filter(x=>x.status==='pending').length} Pending)</h3>
      <div class="stack" style="margin-bottom:18px">${alkesOrderCards}</div>
    ` : ''}

    <h3 class="section-title">Verifikasi Pembayaran Pelatihan & PMK</h3>
    <div class="stack">${enrollmentCards}</div>
  `;
}

function openReviewPaymentModal(enrollmentId,paymentId){
  const enr=state.enrollments.find(e=>e.id===enrollmentId);
  const pay=(enr?.payments||[]).find(p=>p.id===paymentId);
  if(!enr||!pay)throw new Error('Data tidak ditemukan.');
  const u=state.users.find(x=>x.id===enr.userId);
  modal('Verifikasi Pembayaran',`
    <p>Peserta: <b>${esc(u?.fullTitleName||u?.name||enr.userId)}</b> · Nominal: <b style="color:#087b4b">${money(pay.amount)}</b></p>
    <div style="text-align:center;margin:10px 0"><img src="./assets/logo.png" data-file="${esc(pay.proofPath)}" alt="Bukti" style="max-width:100%;max-height:360px;border-radius:8px;border:1px solid #cbd5e1"></div>
    ${field('Catatan Admin','reviewNote','text',pay.note||'','maxlength="300"')}
    <div class="row" style="gap:8px;margin-top:12px">
      <button class="button green" data-action="confirm-payment" data-enr="${esc(enr.id)}" data-pay="${esc(pay.id)}">Konfirmasi Sah</button>
      <button class="button danger" data-action="reject-payment" data-enr="${esc(enr.id)}" data-pay="${esc(pay.id)}">Tolak Bukti</button>
    </div>
  `);
}

function openReviewChatPayModal(paymentId){
  const cp=state.chatPayments.find(x=>x.id===paymentId);
  if(!cp)throw new Error('Data tidak ditemukan.');
  const u=state.users.find(x=>x.id===cp.userId);
  modal('Verifikasi Langganan Diskusi SBAR',`
    <p>Peserta: <b>${esc(u?.fullTitleName||u?.name||cp.userId)}</b> · Nominal: <b style="color:#087b4b">${money(cp.amount)}</b></p>
    <div style="text-align:center;margin:10px 0"><img src="./assets/logo.png" data-file="${esc(cp.proofPath)}" alt="Bukti" style="max-width:100%;max-height:360px;border-radius:8px;border:1px solid #cbd5e1"></div>
    ${field('Catatan Admin','reviewNote','text',cp.note||'','maxlength="300"')}
    <div class="row" style="gap:8px;margin-top:12px">
      <button class="button green" data-action="confirm-chat-pay" data-id="${esc(cp.id)}">Konfirmasi & Aktifkan Diskusi</button>
      <button class="button danger" data-action="reject-chat-pay" data-id="${esc(cp.id)}">Tolak</button>
    </div>
  `);
}

function openReviewAlkesOrderModal(orderId){
  const ord=state.alkesOrders.find(x=>x.id===orderId);
  if(!ord)throw new Error('Pesanan tidak ditemukan.');
  const u=state.users.find(x=>x.id===ord.userId);
  modal('Verifikasi Pesanan',`
    <p>Pemesan: <b>${esc(u?.fullTitleName||u?.name||ord.userId)}</b> · Total: <b style="color:#087b4b">${money(ord.totalAmount)}</b></p>
    <p style="font-size:13px">${(ord.items||[]).map(i=>`• ${esc(i.name)} (${i.qty} ${esc(i.unit)}) = ${money(i.subtotal)}`).join('<br>')}</p>
    <p style="font-size:13px">Keterangan: <b>${esc(ord.shippingNote||'-')}</b></p>
    <div style="text-align:center;margin:10px 0"><img src="./assets/logo.png" data-file="${esc(ord.proofPath)}" alt="Bukti" style="max-width:100%;max-height:360px;border-radius:8px;border:1px solid #cbd5e1"></div>
    ${field('Catatan / Nomor Resi','reviewNote','text',ord.note||'','maxlength="300"')}
    <div class="row" style="gap:8px;margin-top:12px">
      <button class="button green" data-action="confirm-alkes-order" data-id="${esc(ord.id)}">Konfirmasi Pesanan</button>
      <button class="button danger" data-action="reject-alkes-order" data-id="${esc(ord.id)}">Tolak</button>
    </div>
  `);
}

function openGradeModal(enrollmentId){
  const enr=state.enrollments.find(e=>e.id===enrollmentId);
  if(!enr)throw new Error('Data peserta tidak ditemukan.');
  const u=state.users.find(x=>x.id===enr.userId);
  modal('Nilai Evaluasi Peserta',`
    <p><b>${esc(u?.fullTitleName||u?.name||enr.userId)}</b> · ${esc(enr.programTitle||'Program')}</p>
    <form data-form="save-grade" data-id="${esc(enr.id)}">
      ${field('Nilai Evaluasi Akhir (0 – 100)','score','number',enr.score!==null&&enr.score!==undefined?String(enr.score):'','min="0" max="100" step="0.1"')}
      ${area('Catatan Evaluasi','evaluationNote',enr.evaluationNote||'','maxlength="1000"')}
      ${submit('Simpan Nilai','green')}
    </form>
  `);
}

function renderValidation(force=false){
  const allUsers=state.users.filter(u=>u.id!==me.uid);
  if(!shouldRender('validation', {valFilterBatch, allUsers}, force)) return;
  const batches=[...new Set(allUsers.map(u=>u.batch).filter(Boolean))];
  const list=valFilterBatch==='ALL'?allUsers:allUsers.filter(u=>(u.batch||'')===valFilterBatch);

  $('#portal-content').innerHTML=`
    <div class="row spread" style="flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <h2 style="margin:0">Kelola Peserta, Biodata & Angkatan</h2>
      <div class="field" style="margin:0;min-width:220px">
        <select id="val-batch-filter">
          <option value="ALL">Semua Angkatan / Kelas (${allUsers.length})</option>
          ${batches.map(b=>`<option value="${esc(b)}" ${valFilterBatch===b?'selected':''}>${esc(b)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <form data-form="assign-batch" class="row" style="gap:10px;align-items:end;flex-wrap:wrap">
        <div class="field" style="margin:0;flex:1;min-width:220px">${field('Atur Nama Angkatan / Kelas untuk Peserta Tercentang','batchName','text','','required maxlength="80" placeholder="Contoh: Angkatan I - 2026"')}</div>
        ${submit('Terapkan ke Peserta Tercentang','green')}
      </form>
    </div>

    <div class="cards">${list.map(u=>`
      <article class="card">
        <div class="row spread" style="align-items:start">
          <div class="row" style="gap:10px">
            <input type="checkbox" class="user-batch-pick" value="${esc(u.id)}" style="margin-top:6px">
            ${img(u.photoPath)}
            <div>
              <b>${esc(u.fullTitleName||u.name)}</b><br>
              <span class="pill" style="font-size:11px">${esc(u.batch||'Belum diatur angkatan')}</span>
              <p style="font-size:13px;margin:4px 0">${esc(u.email)}<br>${esc(u.institution||'-')}${u.phone?` · WA: ${esc(u.phone)}`:''}</p>
            </div>
          </div>
        </div>
        <p>${status(u.status)}</p>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <button class="button green small" data-action="approve-user" data-id="${esc(u.id)}">Aktifkan</button>
          <button class="button danger small" data-action="reject-user" data-id="${esc(u.id)}">Nonaktifkan</button>
          <button class="button small" data-action="admin-edit-biodata" data-id="${esc(u.id)}">Biodata</button>
          <button class="button small" data-action="admin-id-card" data-id="${esc(u.id)}">ID Card</button>
          <button class="button small" data-action="reset-member" data-id="${esc(u.id)}">Reset Password</button>
        </div>
      </article>
    `).join('')||empty('Belum ada peserta.')}</div>
  `;
  hydrate();
}

function renderCMS(){
  const c=state.cms;
  const regularPrograms=state.programs.filter(p=>!p.kind||p.kind==='training');
  $('#portal-content').innerHTML=`
    <h2>Pengaturan Beranda, Video, Logo & Program</h2>
    <form data-form="cms" class="card">
      ${field('Nama Brand','logoText','text',c.logoText,'required maxlength="30"')}
      ${c.logoPath?`<div style="margin:8px 0"><img src="./assets/logo.png" data-file="${esc(c.logoPath)}" alt="Logo" style="width:72px;height:72px;object-fit:contain;border:1px solid #cbd5e1;border-radius:8px;padding:4px"><br><button type="button" class="button small danger" data-action="reset-logo" style="margin-top:6px">Kembalikan Logo Default</button></div>`:''}
      ${field('Ganti Logo Institusi (PNG/JPG/WebP)','logoFile','file','','accept="image/jpeg,image/png,image/webp"')}
      ${field('Judul Beranda','welcomeTitle','text',c.welcomeTitle,'required maxlength="180"')}
      ${area('Subjudul Beranda','welcomeText',c.welcomeText,'required maxlength="2000"')}
      ${c.videoPath?`<div style="margin:8px 0"><small class="muted">Video terunggah aktif.</small> <button type="button" class="button small danger" data-action="remove-video">Hapus Video</button></div>`:''}
      ${field('Upload Video Beranda MP4/WebM (maks 5 MB)','videoFile','file','','accept="video/mp4,video/webm"')}
      ${field('Atau URL Video Beranda (Link YouTube atau link .mp4)','videoUrl','url',c.videoUrl,'placeholder="https://youtu.be/... atau https://.../video.mp4"')}
      ${submit('Simpan Pengaturan & Video','green')}
    </form>

    <h3>Tambah Program Pelatihan</h3>
    <form data-form="program" class="card">
      ${field('Nama Program','title','text','','required maxlength="180"')}
      ${area('Deskripsi','description','','required maxlength="3000"')}
      ${field('Total Biaya Pelatihan (Rp)','totalFee','number','500000','required min="1000" step="1000"')}
      ${field('Minimal Bayar Pendaftaran / DP (Rp)','minDownPayment','number','150000','required min="0" step="1000"')}
      ${submit('Tambah Program')}
    </form>

    <div class="cards">${regularPrograms.map(p=>{
      const fee=HauraFinance.programFee(p), minDp=HauraFinance.programMinDp(p);
      return `<article class="card">
        <b>${esc(p.title)}</b>
        <p>${esc(p.description)}</p>
        <p style="font-size:13px;color:#087b4b">Biaya: <b>${money(fee)}</b> · Min. Daftar: <b>${money(minDp)}</b></p>
        <button class="button small" data-action="edit-program" data-id="${esc(p.id)}">Edit</button>
        <button class="button small danger" data-action="archive-program" data-id="${esc(p.id)}">Arsipkan</button>
      </article>`;
    }).join('')}</div>

    <h3>Tambah Berita</h3>
    <form data-form="news" class="card">${field('Judul','title','text','','required maxlength="180"')}${area('Isi','content','','required maxlength="5000"')}${submit('Publikasikan Berita')}</form>
    <div class="cards">${state.news.map(n=>`<article class="card"><b>${esc(n.title)}</b><button class="button small danger" data-action="archive-news" data-id="${esc(n.id)}">Arsipkan</button></article>`).join('')}</div>
  `;
}

function userOptions(all=false){return `${all?'<option value="all">Semua Peserta Aktif</option>':'<option value="">— Pilih Peserta —</option>'}${state.users.filter(u=>u.status==='approved').map(u=>`<option value="${esc(u.id)}">${esc(u.fullTitleName||u.name)}</option>`).join('')}`;}

function renderAdminChat(force=false){
  if($('#chat-users') && !force){
    renderChatUsers(false);
    return;
  }
  $('#portal-content').innerHTML='<h2>Diskusi Klinis (SBAR)</h2><div class="chat-layout"><div class="chat-users" id="chat-users"></div><div id="chat-host" class="chat-room"><p class="empty">Pilih peserta untuk membuka percakapan.</p></div></div>';
  renderChatUsers(true);
  if(targetChat)createRoom(targetChat,state.users.find(u=>u.id===targetChat)?.name||'Peserta');
}
function renderChatUsers(force=false){
  const el=$('#chat-users');if(!el)return;
  const activeUsers = state.users.filter(u=>u.status==='approved'&&u.chatAccess);
  if(!shouldRender('chat-users', {targetChat, activeUsers: activeUsers.map(u=>[u.id,u.name,u.fullTitleName,u.institution])}, force)) return;
  el.innerHTML=activeUsers.map(u=>`<button class="chat-user ${targetChat===u.id?'active':''}" data-action="open-chat" data-id="${esc(u.id)}">${esc(u.fullTitleName||u.name)}<br><small>${esc(u.institution||'')}</small></button>`).join('')||empty('Belum ada peserta aktif.');
}
function createRoom(id,name){
  targetChat=id;chatStop?.();state.messages=[];messageLimit=100;
  $('#chat-host').innerHTML=`<div class="chat-header">${esc(name)}</div><div class="chat-tools"><button class="button small" data-action="older-chat">Riwayat Sebelumnya</button>${!admin?' <button class="button green small" data-action="sbar">+ Form SBAR</button>':''}</div><div class="messages" id="messages" aria-live="polite"></div><form class="chat-form" data-form="chat"><label class="sr-only" for="chat-text">Pesan</label><input id="chat-text" name="text" required maxlength="4000" placeholder="Tulis pesan…" autocomplete="off"><button class="button" type="submit">Kirim</button></form>`;
  watchMessages();
}
function watchMessages(){chatStop?.();chatStop=B.watch(`conversations/${targetChat}/messages`,[B.F.orderBy('createdAt','desc'),B.F.limit(messageLimit)],rows=>{state.messages=rows.reverse();renderMessages();},fail);}
function renderMessages(){
  const el=$('#messages');if(!el)return;
  if(!shouldRender('chat-msgs', {targetChat, msgs: state.messages}, false)) return;
  el.innerHTML=state.messages.map(m=>{
    if(m.kind==='sbar'){
      return `<div class="message ${m.senderId===me.uid?'mine':''}"><b>LAPORAN SBAR</b>${['s','b','a','r'].map(k=>`<p><b>${k.toUpperCase()}:</b> ${esc(m.sbar?.[k])}</p>`).join('')}<time>${date(m.createdAt)||'Mengirim…'}</time></div>`;
    }
    if(m.kind==='soap'){
      return `<div class="message ${m.senderId===me.uid?'mine':''}"><b>CATATAN KLINIS</b>${['s','o','a','p'].map(k=>`<p><b>${k.toUpperCase()}:</b> ${esc(m.soap?.[k])}</p>`).join('')}<time>${date(m.createdAt)||'Mengirim…'}</time></div>`;
    }
    return `<div class="message ${m.senderId===me.uid?'mine':''}">${esc(m.text)}<time>${date(m.createdAt)||'Mengirim…'}</time></div>`;
  }).join('')||empty('Belum ada percakapan.');
  el.scrollTop=el.scrollHeight;
}
function sbarForm(){
  modal('Laporan Klinis SBAR',`<form data-form="sbar">
    ${area('S — Situation (Situasi Klinis)','s','','required maxlength="2000"')}
    ${area('B — Background (Latar Belakang)','b','','required maxlength="2000"')}
    ${area('A — Assessment (Pengkajian)','a','','required maxlength="2000"')}
    ${area('R — Recommendation (Rekomendasi)','r','','required maxlength="2000"')}
    ${submit('Kirim Laporan SBAR','green')}
  </form>`);
}
const privacyText=`Portal Pembelajaran & Konsultasi Haura Institute. Seluruh data tersimpan terenkripsi pada server institusi. Aplikasi by. ${author}`;

function blobData(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});}

/* ============================================================================
   EVENT HANDLERS (AKSI TOMBOL & SUBMIT FORMULIR)
   ============================================================================ */
async function doAction(action,el){
  if(action==='login')return loginForm();
  if(action==='register')return registerForm();
  if(action==='close-modal')return close();
  if(action==='install-help')return installHelp();
  if(action==='privacy')return modal('Ketentuan Layanan',`<div class="privacy">${esc(privacyText)}</div>`);
  if(action==='offline-pass')return openOfflinePasswordModal();
  if(action==='logout'){
    OfflineAuth.clearActive();
    if(isOffline() || me?.offline){
      stopPrivate();
      me=null;profile=null;admin=false;
      navRender();
      showLanding();
      close();
      return toast('Keluar dari sesi offline.');
    }
    ready();
    await B.F.signOut(B.authInstance());
    close();
    toast('Berhasil keluar.');
    return;
  }
  if(action==='dashboard')return dashboard();
  if(action==='edit-biodata'){member();return openBiodataModal(me.uid);}
  if(action==='admin-edit-biodata'){adminOnly();return openBiodataModal(el.dataset.id);}
  if(action==='id-card'){member();return openIdCardModal(me.uid);}
  if(action==='admin-id-card'){adminOnly();return openIdCardModal(el.dataset.id);}
  if(action==='download-idcard-pdf'){
    toast('Menyiapkan ID Card PDF…');
    const {html2canvas,jsPDF}=await import('../vendor/pdf.js');
    const node=$('#idcard-preview');
    await Promise.all([...node.querySelectorAll('img')].map(i=>i.decode().catch(()=>{})));
    const canvas=await html2canvas(node,{scale:2.5,backgroundColor:'#ffffff',useCORS:false});
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a5'});
    const ratio=Math.min(190/canvas.width,130/canvas.height);
    const w=canvas.width*ratio, h=canvas.height*ratio;
    pdf.addImage(canvas.toDataURL('image/jpeg',.96),'JPEG',(210-w)/2,(148-h)/2,w,h);
    pdf.save(`ID_Card_${String(el.dataset.name||'Peserta').replace(/[^a-z0-9_-]/gi,'_')}.pdf`);
    return;
  }
  if(action==='change-password'){ready();if(!me)throw new Error('Silakan masuk.');return modal('Ganti Password',B.accountFrame('change'));}
  if(action==='reset-member'){adminOnly();return modal('Reset Password Peserta',`<p>Buat password sementara untuk peserta ini?</p><button class="button danger" data-action="confirm-reset" data-id="${esc(el.dataset.id)}">Buat Password Sementara</button>`);}
  if(action==='confirm-reset'){adminOnly();const result=await B.resetMember(el.dataset.id);return modal('Password Sementara',`<code style="word-break:break-all">${esc(result.temporary)}</code>`);}
  if(action==='refresh-auth'){ready();await B.F.reload(me);await B.F.getIdTokenResult(me,true);await handleSession(B.authInstance().currentUser);return;}
  if(action==='tab'){
    if(isOffline() && el.dataset.id !== 'modules'){
      throw new Error('Mode offline aktif. Hanya menu Buku Digital yang dapat dibuka tanpa internet.');
    }
    if(isOffline()) memberBooksAccess(); else member();
    chatStop?.();chatStop=null;
    tab=el.dataset.id;
    tabsRender(true);
    renderTab(true);
    return;
  }
  if(action==='chat-subtab'){member();chatSubTab=el.dataset.id;renderMemberChatAndAlkes(true);hydrate();return;}
  if(action==='alkes-qty'){member();const id=el.dataset.id,delta=Number(el.dataset.delta||0);alkesCart[id]=Math.max(0,(Number(alkesCart[id]||0)+delta));renderMemberChatAndAlkes(true);hydrate();return;}
  if(action==='baju-qty'){member();const id=el.dataset.id,delta=Number(el.dataset.delta||0);bajuCart[id]=Math.max(0,(Number(bajuCart[id]||0)+delta));renderMemberBaju(true);hydrate();return;}

  if(action==='read-ebook'){
    memberBooksAccess();
    const b=state.ebooks.find(x=>x.id===el.dataset.id);
    if(!b||!b.htmlPath)throw new Error('Buku digital tidak ditemukan.');
    let html = await getOfflineEbookHtml(b.id);
    if(!html){
      if(isOffline()) throw new Error('Buku ini belum tersimpan offline. Hubungkan ke internet sebentar untuk mengunduhnya.');
      toast('Memuat & menyimpan buku digital untuk offline…');
      html = await B.readHtmlFile(b.htmlPath);
      if(html){
        await saveOfflineEbookHtml(b, html);
        if(tab === 'modules') renderMemberModules(true);
      }
    }
    openEbookReader({...b,_htmlContent:html});
    return;
  }
  if(action==='order-physical-book'){member();return openOrderPhysicalBookModal(el.dataset.id);}
  if(action==='order-physical-from-reader'){
    member();
    closeEbookReader();
    if(activeReaderBookId)return openOrderPhysicalBookModal(activeReaderBookId);
    return;
  }
  if(action==='close-ebook')return closeEbookReader();
  if(action==='toggle-fullscreen-ebook'){
    const overlay=$('#ebook-reader');
    if(!document.fullscreenElement)overlay?.requestFullscreen?.().catch(()=>{});
    else document.exitFullscreen?.().catch(()=>{});
    return;
  }

  if(action==='edit-pmk-docs'){member();return openPmkDocsModal(el.dataset.id);}
  if(action==='review-pmk'){adminOnly();return openReviewPmkModal(el.dataset.id);}

  if(action==='enroll'){if(!me)return loginForm();member();return openPaidEnrollModal(el.dataset.id);}
  if(action==='pay-installment'){member();return openInstallmentModal(el.dataset.id);}
  if(action==='review-payment'){adminOnly();return openReviewPaymentModal(el.dataset.enr,el.dataset.pay);}
  if(action==='confirm-payment'||action==='reject-payment'){
    adminOnly();
    const note=$('#reviewNote')?.value||'';
    if(action==='reject-payment'&&!note.trim())throw new Error('Isi alasan penolakan.');
    await B.confirmPayment({enrollmentId:el.dataset.enr,paymentId:el.dataset.pay,decision:action==='confirm-payment'?'confirmed':'rejected',note});
    close();
    return toast(action==='confirm-payment'?'Pembayaran dikonfirmasi.':'Bukti ditolak.');
  }
  if(action==='review-chat-pay'){adminOnly();return openReviewChatPayModal(el.dataset.id);}
  if(action==='confirm-chat-pay'||action==='reject-chat-pay'){
    adminOnly();
    const note=$('#reviewNote')?.value||'';
    await B.reviewChatPayment({paymentId:el.dataset.id,decision:action==='confirm-chat-pay'?'confirmed':'rejected',note});
    close();
    return toast(action==='confirm-chat-pay'?'Akses diskusi diaktifkan.':'Pembayaran ditolak.');
  }
  if(action==='review-alkes-order'){adminOnly();return openReviewAlkesOrderModal(el.dataset.id);}
  if(action==='confirm-alkes-order'||action==='reject-alkes-order'){
    adminOnly();
    const note=$('#reviewNote')?.value||'';
    await B.reviewAlkesOrder({orderId:el.dataset.id,decision:action==='confirm-alkes-order'?'confirmed':'rejected',note});
    close();
    return toast(action==='confirm-alkes-order'?'Pesanan dikonfirmasi.':'Pesanan ditolak.');
  }
  if(action==='grade-enrollment'){adminOnly();return openGradeModal(el.dataset.id);}
  if(action==='delete-expense'){adminOnly();await B.removeExpense(el.dataset.id);return toast('Pengeluaran dihapus.');}
  if(action==='archive-alkes'){adminOnly();await B.patch('alkes',el.dataset.id,{published:false});return toast('Produk diarsipkan.');}
  if(action==='reset-logo'){adminOnly();await B.patch('settings','public',{logoPath:'',updatedAt:B.stamp()});return toast('Logo dikembalikan.');}
  if(action==='remove-video'){adminOnly();await B.patch('settings','public',{videoPath:'',updatedAt:B.stamp()});return toast('Video dihapus.');}
  if(action==='remove-qris'){adminOnly();await B.patch('settings','public',{qrisPath:'',updatedAt:B.stamp()});return toast('QRIS dihapus.');}
  if(action==='sbar'){member();if(!profile.chatAccess)throw new Error('Akses diskusi belum aktif.');return sbarForm();}
  if(action==='open-chat'){adminOnly();const u=state.users.find(u=>u.id===el.dataset.id);createRoom(u.id,u.fullTitleName||u.name);return renderChatUsers(true);}
  if(action==='older-chat'){ready();messageLimit=Math.min(messageLimit+100,1000);watchMessages();return;}

  if(action==='cert-select-all'){document.querySelectorAll('.cert-pick').forEach(cb=>cb.checked=true);updateCertificate();return;}
  if(action==='cert-unselect-all'){document.querySelectorAll('.cert-pick').forEach(cb=>cb.checked=false);updateCertificate();return;}
  if(action==='issued-select-all'){document.querySelectorAll('.issued-pick').forEach(cb=>cb.checked=true);return;}
  if(action==='verify-cert-preview'){
    const serial=el.dataset.serial;
    const idx=state.cms?.certIndex||{};
    const rec=idx[serial];
    if(!rec)throw new Error('Data verifikasi sertifikat belum tercatat.');
    modal('Verifikasi Orisinalitas Sertifikat',`
      <div style="background:#ecfdf5;border:2px solid #059669;border-radius:12px;padding:14px">
        <span style="background:#059669;color:#fff;font-weight:800;padding:3px 9px;border-radius:999px;font-size:12px">✓ TERVERIFIKASI ASLI</span>
        <p style="margin:8px 0;font-size:14px;color:#064e3b"><b>Pernyataan Resmi Haura Institute:</b> Sertifikat dengan Nomor <b>${esc(rec.serial)}</b> atas nama <b>${esc(rec.name)}</b> (${esc(rec.course)}) adalah <b>BENAR dan SAH</b>.</p>
        <p style="font-size:12px;margin:0;color:#065f46">Tautan Scan QR: <br><code style="word-break:break-all">${esc(certVerifyURL(rec.serial))}</code></p>
      </div>
    `);
    return;
  }
  if(action==='download-cert'){
    member();
    const c=state.certificates.find(c=>c.id===el.dataset.id);
    if(!c||c.locked)throw new Error('Sertifikat terkunci.');
    const url=await B.fileURL(c.imagePath);
    const response=await fetch(url);
    const source=await blobData(await response.blob());
    await pdfDownload(source,`${c.serial}_${c.title}`);
    return;
  }
  if(action==='admin-print-one-cert'){
    adminOnly();
    const c=state.certificates.find(x=>x.id===el.dataset.id);
    if(!c)throw new Error('Sertifikat tidak ditemukan.');
    toast('Menyiapkan PDF sertifikat…');
    const url=await B.fileURL(c.imagePath);
    const response=await fetch(url);
    const source=await blobData(await response.blob());
    await pdfDownload(source,`${c.serial}_${c.title}`);
    return;
  }
  if(action==='print-issued-selected'){
    adminOnly();
    const ids=[...document.querySelectorAll('.issued-pick:checked')].map(cb=>cb.value);
    if(!ids.length)throw new Error('Centang minimal 1 sertifikat terbit.');
    toast(`Menggabungkan ${ids.length} sertifikat menjadi PDF…`);
    const {jsPDF}=await import('../vendor/pdf.js');
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    for(let i=0;i<ids.length;i++){
      const c=state.certificates.find(x=>x.id===ids[i]);
      if(!c)continue;
      const url=await B.fileURL(c.imagePath);
      const response=await fetch(url);
      const source=await blobData(await response.blob());
      if(i>0)pdf.addPage();
      pdf.addImage(source,'JPEG',0,0,297,210);
    }
    pdf.save(`Cetak_Sertifikat_Terpilih_${ids.length}.pdf`);
    return;
  }
  if(action==='preview-pdf'){adminOnly();toast('Menyiapkan PDF…');const canvas=await captureCertificate();return pdfDownload(canvas.toDataURL('image/jpeg',.96),'Sertifikat_Preview');}
  if(action==='approve-user'||action==='reject-user'){adminOnly();await B.patch('users',el.dataset.id,{status:action==='approve-user'?'approved':'rejected',...(action==='reject-user'?{chatAccess:false}:{}),updatedAt:B.stamp()});return toast('Status akun diperbarui.');}
  if(['archive-program','archive-news','delete-module'].includes(action)){adminOnly();return modal('Konfirmasi',`<p>Lanjutkan tindakan ini?</p><button class="button danger" data-action="confirm-change" data-kind="${action}" data-id="${esc(el.dataset.id)}">Ya, Lanjutkan</button>`);}
  if(action==='confirm-change'){adminOnly();const kind=el.dataset.kind;if(kind==='delete-module')await B.remove('ebooks',el.dataset.id);else await B.patch(kind==='archive-program'?'programs':'news',el.dataset.id,{published:false,updatedAt:B.stamp()});close();if(tab==='cms')renderCMS();if(tab==='modules-admin')setTimeout(renderModuleAdmin,200);if(tab==='pmk-admin')setTimeout(()=>renderPMKAdmin(true),200);return toast('Perubahan tersimpan.');}
  if(action==='edit-program'){
    adminOnly();
    const p=state.programs.find(p=>p.id===el.dataset.id);
    const fee=HauraFinance.programFee(p), minDp=HauraFinance.programMinDp(p);
    return modal('Edit Program',`<form data-form="edit-program" data-id="${esc(p.id)}">
      ${field('Nama Program','title','text',p.title,'required maxlength="180"')}
      ${area('Deskripsi','description',p.description,'required maxlength="3000"')}
      ${field('Total Biaya Pelatihan (Rp)','totalFee','number',String(fee||500000),'required min="1000" step="1000"')}
      ${field('Minimal Bayar Pendaftaran / DP (Rp)','minDownPayment','number',String(minDp||150000),'required min="0" step="1000"')}
      ${submit('Simpan Perubahan')}
    </form>`);
  }
}

async function doSubmit(form){
  const type=form.dataset.form,d=new FormData(form);

  if(type==='offline-login'){
    const acc = await OfflineAuth.verifyLogin(d.get('email'), d.get('offlinePassword')||'');
    close();
    await enterOfflineSession(acc);
    return toast('Berhasil masuk mode offline. Selamat membaca buku digital.');
  }

  ready();

  if(type==='set-offline-password'){
    if(!me) throw new Error('Silakan masuk.');
    const p1 = String(d.get('newOfflinePass')||'');
    const p2 = String(d.get('confirmOfflinePass')||'');
    if(p1.length < 4) throw new Error('Password minimal 4 karakter.');
    if(p1 !== p2) throw new Error('Konfirmasi password tidak cocok.');
    OfflineAuth.saveSession({uid:me.uid, email:me.email, profile, admin});
    await OfflineAuth.setOfflinePassword(me.uid, p1);
    close();
    return toast('Password Login Offline berhasil disimpan.');
  }

  if(type==='save-biodata'){
    if(!me)throw new Error('Silakan masuk.');
    const targetUid=form.dataset.uid||me.uid;
    if(!admin && targetUid!==me.uid)throw new Error('Tidak diizinkan.');
    const targetUser=targetUid===me.uid?profile:state.users.find(x=>x.id===targetUid);
    let photoPath=targetUser?.photoPath||'';
    const photoFile=d.get('photo');
    if(photoFile && photoFile.size>0){
      photoPath=`profiles/${targetUid}/${uid()}`;
      toast('Mengunggah pas foto…');
      await B.upload(photoPath,photoFile);
    }
    const patchData={
      photoPath,
      name:String(d.get('name')||'').trim(),
      fullTitleName:String(d.get('fullTitleName')||'').trim(),
      nik:String(d.get('nik')||'').trim(),
      strNumber:String(d.get('strNumber')||'').trim(),
      niraNumber:String(d.get('niraNumber')||'').trim(),
      birthPlace:String(d.get('birthPlace')||'').trim(),
      birthDate:String(d.get('birthDate')||'').trim(),
      gender:String(d.get('gender')||'').trim(),
      phone:String(d.get('phone')||'').trim(),
      institution:String(d.get('institution')||'').trim(),
      education:String(d.get('education')||'').trim(),
      address:String(d.get('address')||'').trim(),
      updatedAt:B.stamp()
    };
    if(admin && d.has('batch'))patchData.batch=String(d.get('batch')||'').trim();
    await B.patch('users',targetUid,patchData);
    if(targetUid===me.uid && profile){
      Object.assign(profile,patchData);
      OfflineAuth.saveSession({uid:me.uid, email:me.email, profile, admin});
      navRender();
      if(!$('#portal-view').hidden)dashboard();
    }
    close();
    return toast('Biodata lengkap berhasil disimpan.');
  }

  member();

  if(type==='paid-enroll'){
    const file=d.get('proof');
    const path=`proofs/${me.uid}/${uid()}`;
    toast('Mengunggah bukti…');
    await B.upload(path,file);
    await B.paidEnroll({programId:form.dataset.id,amount:Number(d.get('amount')),proofPath:path});
    close();
    dashboard();
    return toast('Pendaftaran berhasil dikirim.');
  }

  if(type==='submit-installment'){
    const file=d.get('proof');
    const path=`proofs/${me.uid}/${uid()}`;
    toast('Mengunggah bukti…');
    await B.upload(path,file);
    await B.submitPayment({enrollmentId:form.dataset.id,amount:Number(d.get('amount')),proofPath:path});
    close();
    return toast('Bukti pelunasan terkirim.');
  }

  if(type==='subscribe-chat'){
    const file=d.get('proof');
    const path=`proofs/${me.uid}/${uid()}`;
    toast('Mengunggah bukti langganan…');
    await B.upload(path,file);
    await B.subscribeChat({proofPath:path});
    return toast('Bukti langganan diskusi terkirim.');
  }

  if(type==='order-alkes'){
    const alkesList=state.alkes.filter(a=>!a.kind||a.kind==='alkes');
    const items=[];
    for(const item of alkesList){
      const qty=Number(alkesCart[item.id]||0);
      if(qty>0)items.push({alkesId:item.id,qty});
    }
    if(!items.length)throw new Error('Pilih minimal 1 alkes.');
    const file=d.get('proof');
    const path=`proofs/${me.uid}/${uid()}`;
    toast('Mengunggah bukti pesanan…');
    await B.upload(path,file);
    await B.orderAlkes({items,shippingNote:d.get('shippingNote'),proofPath:path});
    alkesCart={};
    return toast('Pesanan alkes berhasil dikirim.');
  }

  if(type==='order-physical-book'){
    const alkesId=form.dataset.alkes;
    const qty=Math.max(1,Number(d.get('qty')||1));
    const file=d.get('proof');
    const path=`proofs/${me.uid}/${uid()}`;
    toast('Mengunggah bukti pesanan buku fisik…');
    await B.upload(path,file);
    await B.orderAlkes({items:[{alkesId,qty}],shippingNote:`[BUKU FISIK] ${String(d.get('shippingNote')||'').trim()}`,proofPath:path});
    close();
    return toast('Pesanan buku fisik berhasil dikirim.');
  }

  if(type==='order-baju'){
    const bajuList=state.alkes.filter(a=>a.kind==='baju');
    const items=[];
    for(const item of bajuList){
      const qty=Number(bajuCart[item.id]||0);
      if(qty>0)items.push({alkesId:item.id,qty});
    }
    if(!items.length)throw new Error('Pilih minimal 1 baju.');
    const file=d.get('proof');
    const path=`proofs/${me.uid}/${uid()}`;
    toast('Mengunggah bukti pesanan PO baju…');
    await B.upload(path,file);
    const detail=`[PO BAJU] Ukuran/Warna: ${String(d.get('sizeDetail')||'').trim()} | Bordir: ${String(d.get('embroideryName')||'-').trim()} | Kirim: ${String(d.get('shippingNote')||'').trim()}`;
    await B.orderAlkes({items,shippingNote:detail,proofPath:path});
    bajuCart={};
    return toast('Pesanan PO Baju Kesehatan berhasil dikirim.');
  }

  if(type==='save-pmk-docs'){
    const enr=state.enrollments.find(e=>e.id===form.dataset.id);
    if(!enr)throw new Error('Data bimbingan tidak ditemukan.');
    const pmkChecklist={};
    for(const s of PMK_STEPS){
      pmkChecklist[s.key]={
        done:d.get('done_'+s.key)==='on',
        note:String(d.get('note_'+s.key)||'').trim()
      };
    }
    let pmkDocPath=enr.pmkDocPath||'';
    const docFile=d.get('pmkFile');
    if(docFile && docFile.size>0){
      pmkDocPath=`proofs/${me.uid}/${uid()}`;
      toast('Mengunggah berkas PMK…');
      await B.upload(pmkDocPath,docFile);
    }
    await B.patch('enrollments',enr.id,{pmkChecklist,pmkDocPath,updatedAt:B.stamp()});
    close();
    return toast('Progres berkas PMK tersimpan.');
  }

  if(type==='chat'||type==='sbar'){
    if(!admin&&!profile.chatAccess)throw new Error('Akses diskusi belum aktif.');
    const data={senderId:me.uid,senderRole:admin?'admin':'peserta',kind:type==='sbar'?'sbar':'text',text:type==='chat'?String(d.get('text')).trim():'',createdAt:B.stamp()};
    if(type==='chat'&&!data.text)return;
    if(type==='sbar')data.sbar=Object.fromEntries(['s','b','a','r'].map(k=>[k,String(d.get(k)).trim()]));
    await B.add(`conversations/${targetChat}/messages`,data);
    form.reset();
    if(type==='sbar'){close();toast('Laporan SBAR terkirim.');}
    return;
  }

  adminOnly();

  if(type==='assign-batch'){
    const batchName=String(d.get('batchName')||'').trim();
    const uids=[...document.querySelectorAll('.user-batch-pick:checked')].map(cb=>cb.value);
    if(!uids.length)throw new Error('Centang minimal 1 peserta terlebih dahulu.');
    for(const id of uids){
      await B.patch('users',id,{batch:batchName,updatedAt:B.stamp()});
    }
    form.reset();
    return toast(`Angkatan "${batchName}" diterapkan ke ${uids.length} peserta.`);
  }

  if(type==='save-pmk-review'){
    await B.patch('enrollments',form.dataset.id,{
      pmkStage:String(d.get('pmkStage')||'').trim(),
      evaluationNote:String(d.get('evaluationNote')||'').trim(),
      updatedAt:B.stamp()
    });
    close();
    return toast('Progres bimbingan PMK diperbarui.');
  }

  if(type==='finance-config'){
    let qrisPath=state.cms.qrisPath||'';
    const qrisFile=d.get('qris');
    if(qrisFile && qrisFile.size>0){
      qrisPath=`public/qris/${uid()}`;
      toast('Mengunggah QRIS…');
      await B.upload(qrisPath,qrisFile);
    }
    await B.patch('settings','public',{
      qrisPath,
      paymentInfo:String(d.get('paymentInfo')||'').trim(),
      chatFee:Number(d.get('chatFee')||0),
      chatDurationLabel:String(d.get('chatDurationLabel')||'30 Hari').trim(),
      updatedAt:B.stamp()
    });
    return toast('Pengaturan keuangan tersimpan.');
  }

  if(type==='add-alkes'){
    let imagePath='';
    const imgFile=d.get('alkesImg');
    if(imgFile && imgFile.size>0){
      imagePath=`public/alkes/${uid()}`;
      await B.upload(imagePath,imgFile);
    }
    await B.add('alkes',{
      kind:'alkes',
      name:String(d.get('name')).trim(),
      unit:String(d.get('unit')).trim(),
      price:Number(d.get('price')),
      description:String(d.get('description')||'').trim(),
      imagePath,
      published:true,
      createdAt:B.stamp()
    });
    form.reset();
    return toast('Produk alkes ditambahkan.');
  }

  if(type==='add-baju'){
    let imagePath='';
    const imgFile=d.get('bajuImg');
    if(imgFile && imgFile.size>0){
      imagePath=`public/alkes/${uid()}`;
      await B.upload(imagePath,imgFile);
    }
    const rawName=String(d.get('name')).trim();
    await B.add('alkes',{
      kind:'baju',
      name:`[PO Baju] ${rawName}`,
      unit:'Set',
      price:Number(d.get('price')),
      sizes:String(d.get('sizes')||'S, M, L, XL, XXL').trim(),
      estimate:String(d.get('estimate')||'10 - 14 Hari Kerja').trim(),
      description:String(d.get('description')||'').trim(),
      imagePath,
      published:true,
      createdAt:B.stamp()
    });
    form.reset();
    return toast('Katalog PO Baju Kesehatan ditambahkan.');
  }

  if(type==='add-expense'){
    await B.addExpense({programId:d.get('programId'),category:d.get('category'),description:d.get('description'),amount:Number(d.get('amount')),date:d.get('date')});
    form.reset();
    return toast('Pengeluaran tercatat.');
  }

  if(type==='save-grade'){
    await B.saveEvaluation({enrollmentId:form.dataset.id,score:d.get('score'),evaluationNote:d.get('evaluationNote')});
    close();
    return toast('Nilai evaluasi tersimpan.');
  }

  if(type==='cms'){
    let logoPath=state.cms.logoPath||'';
    const logoFile=d.get('logoFile');
    if(logoFile && logoFile.size>0){
      logoPath=`public/logo/${uid()}`;
      toast('Mengunggah logo…');
      await B.upload(logoPath,logoFile);
    }
    let videoPath=state.cms.videoPath||'';
    const videoFile=d.get('videoFile');
    if(videoFile && videoFile.size>0){
      videoPath=`public/videos/${uid()}`;
      toast('Mengunggah video…');
      await B.upload(videoPath,videoFile,['video/mp4','video/webm'],5*1024*1024);
    }
    const videoUrl=(videoFile && videoFile.size>0)?'':safeURL(d.get('videoUrl'));
    if(videoUrl)videoPath='';

    await B.create('settings','public',{
      logoText:d.get('logoText').trim(),
      logoPath,
      welcomeTitle:d.get('welcomeTitle').trim(),
      welcomeText:d.get('welcomeText').trim(),
      chatFee:Number(state.cms.chatFee||50000),
      chatDurationLabel:state.cms.chatDurationLabel||'30 Hari',
      qrisPath:state.cms.qrisPath||'',
      paymentInfo:state.cms.paymentInfo||'',
      certIndex:state.cms.certIndex||{},
      videoPath,
      videoUrl,
      updatedAt:B.stamp()
    });
    toast('Pengaturan & video tersimpan.');
    return;
  }

  if(type==='program'||type==='program-pmk'||type==='edit-program'){
    const totalFee=Number(d.get('totalFee')||0);
    const minDownPayment=Number(d.get('minDownPayment')||0);
    if(minDownPayment>totalFee)throw new Error('Minimal DP melebihi total biaya.');
    const existing=type==='edit-program'?state.programs.find(x=>x.id===form.dataset.id):null;
    const kind=type==='program-pmk'?'pmk':(existing?.kind||'training');
    const data={kind,title:d.get('title').trim(),description:d.get('description').trim(),totalFee,minDownPayment,price:totalFee,published:true,updatedAt:B.stamp()};
    if(type==='program'||type==='program-pmk')await B.add('programs',{...data,createdAt:B.stamp()});
    else await B.patch('programs',form.dataset.id,data);
    if(type==='program'||type==='program-pmk')form.reset();else close();
    toast('Program tersimpan.');
    return;
  }

  if(type==='news'){await B.add('news',{title:d.get('title').trim(),content:d.get('content').trim(),published:true,createdAt:B.stamp()});form.reset();toast('Berita dipublikasikan.');return;}

  if(type==='module-html'){
    const htmlFile=d.get('htmlFile');
    let htmlStr=String(d.get('htmlCode')||'').trim();
    if(htmlFile && htmlFile.size>0){
      htmlStr=await htmlFile.text();
    }
    if(!htmlStr)throw new Error('Upload file HTML atau tempel kode HTML buku digital.');
    const title=String(d.get('title')).trim();
    const description=String(d.get('description')||'').trim();
    const physicalPrice=Number(d.get('physicalPrice')||0);
    let physicalAlkesId='';

    if(physicalPrice>0){
      const linked=await B.add('alkes',{
        kind:'book',
        name:`[Buku Fisik] ${title}`,
        unit:'Eksemplar',
        price:physicalPrice,
        description,
        published:true,
        createdAt:B.stamp()
      });
      physicalAlkesId=linked.id;
    }

    const blob=new Blob([htmlStr],{type:'text/html'});
    const htmlPath=`ebooks/${me.uid}/${uid()}`;
    toast('Menyimpan buku digital…');
    await B.upload(htmlPath,blob,['text/html'],5*1024*1024);
    const created=await B.add('ebooks',{title,description,kind:'html',htmlPath,url:'',physicalPrice,physicalAlkesId,userId:d.get('userId'),createdAt:B.stamp()});
    if(created?.id) await saveOfflineEbookHtml({id:created.id,htmlPath,title}, htmlStr);
    form.reset();
    toast('Buku digital dipublikasikan.');
    setTimeout(renderModuleAdmin,200);
    return;
  }

  if(type==='publish-cert-batch'){
    const pickedIds=[...document.querySelectorAll('.cert-pick:checked')].map(cb=>cb.value);
    if(!pickedIds.length)throw new Error('Centang minimal 1 peserta lunas.');
    const c=certificateData();
    const baseSerial=(c.serial||nextAutoSerial(0)).trim();
    const serialMatch=baseSerial.match(/^(.*?)(\d+)$/);
    const prefix=serialMatch?serialMatch[1]:baseSerial+'-';
    const startNum=serialMatch?Number(serialMatch[2]):1;
    const padLen=serialMatch?serialMatch[2].length:4;

    const {jsPDF}=await import('../vendor/pdf.js');
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const certIndex={...(state.cms.certIndex||{})};
    const issuedFmt=c.issued?new Date(c.issued+'T12:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}):'';

    for(let i=0;i<pickedIds.length;i++){
      const enr=state.enrollments.find(e=>e.id===pickedIds[i]);
      if(!enr||!HauraFinance.isPaidFull(enr))continue;
      const u=state.users.find(x=>x.id===enr.userId);
      const prog=state.programs.find(x=>x.id===enr.programId);
      const courseName=(c.course||'').trim()||(enr.programTitle||prog?.title||'Program Pelatihan');
      const serial=pickedIds.length===1 && !serialMatch ? baseSerial : `${prefix}${String(startNum+i).padStart(padLen,'0')}`;

      toast(`Memproses sertifikat ${i+1}/${pickedIds.length} (${serial})…`);
      updateCertificate(enr,serial);
      const canvas=await captureCertificate();
      const dataUrl=canvas.toDataURL('image/jpeg',.94);
      if(i>0)pdf.addPage();
      pdf.addImage(dataUrl,'JPEG',0,0,297,210);

      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));
      const id=uid();
      const memberPath=`certificates/${enr.userId}/${id}`;
      const publicPath=`public/certs/${id}`;
      await B.upload(memberPath,blob,['image/jpeg'],10*1024*1024);
      await B.upload(publicPath,blob,['image/jpeg'],10*1024*1024);

      await B.create('certificates',id,{
        userId:enr.userId,
        programId:enr.programId,
        enrollmentId:enr.id,
        title:courseName,
        serial,
        imagePath:memberPath,
        publicImagePath:publicPath,
        createdAt:B.stamp(),
        issuedBy:me.uid
      });

      certIndex[serial]={
        serial,
        name:u?.fullTitleName||u?.name||enr.userId,
        institution:u?.institution||'-',
        course:courseName,
        predicate:c.predicate||'PARTICIPANT',
        issuedDate:issuedFmt,
        imagePath:publicPath
      };
    }

    await B.patch('settings','public',{certIndex,updatedAt:B.stamp()});
    state.cms.certIndex=certIndex;
    pdf.save(`Sertifikat_Haura_${pickedIds.length}_Peserta.pdf`);
    toast(`${pickedIds.length} sertifikat diterbitkan & diunduh sebagai PDF.`);
    setTimeout(renderCertificateEditor,300);
    return;
  }
}

document.addEventListener('click',async event=>{
  markUserActivity();
  const el=event.target.closest('[data-action]');
  if(!el)return;
  event.preventDefault();
  if(el.disabled)return;
  el.disabled=true;
  try{await doAction(el.dataset.action,el);}catch(e){fail(e);}finally{el.disabled=false;}
});
document.addEventListener('submit',async event=>{
  markUserActivity();
  const form=event.target.closest('form[data-form]');
  if(!form)return;
  event.preventDefault();
  const button=form.querySelector('[type=submit]');
  if(button?.disabled)return;
  if(button)button.disabled=true;
  try{await doSubmit(form);}catch(e){fail(e);}finally{if(button)button.disabled=false;}
});
document.addEventListener('input',event=>{
  markUserActivity();
  if(event.target.closest('#certificate-form'))updateCertificate();
});
document.addEventListener('keydown', markUserActivity);
document.addEventListener('change',async event=>{
  markUserActivity();
  const el=event.target;
  if(el.id==='finance-filter'){financeFilterProgram=el.value;renderFinanceAdmin(true);hydrate();return;}
  if(el.id==='val-batch-filter'){valFilterBatch=el.value;renderValidation(true);return;}
  if(el.id==='cert-filter-prog'){certFilterProg=el.value;renderCertificateEditor();return;}
  if(el.id==='cert-filter-batch'){certFilterBatch=el.value;renderCertificateEditor();return;}
  if(el.classList?.contains('cert-pick')){updateCertificate();return;}
  if(!el.dataset.certImage)return;
  try{const file=el.files[0];if(file){B.validateFile(file);certImages[el.dataset.certImage]=await blobData(file);updateCertificate();}}catch(e){fail(e);el.value='';}
});
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
window.addEventListener('hashchange',()=>{if(location.hash==='#beranda')showLanding();});

window.addEventListener('offline', () => {
  navRender();
  if(me && profile){
    tab = 'modules';
    dashboard();
    toast('Koneksi terputus. Beralih ke Mode Offline (Login & Buku Digital tetap tersedia).');
  } else {
    publicRender();
  }
});

window.addEventListener('online', async () => {
  navRender();
  if(me?.offline){
    const currentUser = B?.authInstance?.().currentUser;
    if(currentUser){
      await handleSession(currentUser);
      toast('Koneksi online kembali. Semua fitur portal aktif.');
    } else {
      toast('Koneksi internet aktif kembali. Silakan masuk ulang jika ingin membuka fitur transaksi.');
      publicRender();
    }
  } else if(me && profile){
    startPrivate();
    dashboard();
    toast('Koneksi internet aktif kembali.');
  } else {
    publicRender();
  }
});

async function start(){
  await refreshOfflineBookIndex();
  try{
    B=await import('./backend.js');
    if(!await B.init()){
      if(isOffline()){
        const saved = OfflineAuth.getActiveAccount();
        if(saved){ await enterOfflineSession(saved); return; }
      }
      const notice=$('#setup-status');notice.hidden=false;notice.textContent='Konfigurasi server belum tersambung.';
      navRender();
      publicRender();
      return;
    }
    if(isOffline()){
      const saved = OfflineAuth.getActiveAccount();
      if(saved){ await enterOfflineSession(saved); return; }
      navRender();
      publicRender();
    }
    publicSubscriptions.push(B.F.onSnapshot(B.F.doc(B.dbInstance(),'settings','public'),snap=>{if(snap.exists())state.cms={...state.cms,...snap.data()};schedulePublicRender();checkPublicVerification();},fail));
    for(const key of ['programs','news','alkes'])publicSubscriptions.push(B.watch(key,[B.F.where('published','==',true)],rows=>{state[key]=rows;schedulePublicRender();scheduleRefreshSection();},fail));
    B.F.onAuthStateChanged(B.authInstance(),user=>{if(!registering)handleSession(user);});
  }catch(e){
    if(isOffline()){
      const saved = OfflineAuth.getActiveAccount();
      if(saved){ await enterOfflineSession(saved); return; }
      navRender();
      publicRender();
      return;
    }
    const notice=$('#setup-status');notice.hidden=false;notice.textContent='Portal belum terhubung.';publicRender();
  }
}
start();

document.addEventListener('haura-account-complete',()=>{close();toast('Akun tersambung.');});
