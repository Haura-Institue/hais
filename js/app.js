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
let alkesCart={};
let state={cms:{logoText:'HAURA',logoPath:'',welcomeTitle:'Tumbuh bersama. Merawat lebih baik.',welcomeText:'Pelatihan keperawatan, buku digital interaktif, dan konsultasi klinis dalam satu portal.',chatFee:50000,chatDurationLabel:'30 Hari',videoUrl:'',videoPath:'',qrisPath:'',paymentInfo:''},programs:[],news:[],users:[],enrollments:[],chatPayments:[],alkes:[],alkesOrders:[],ebooks:[],certificates:[],expenses:[],messages:[]};
let certImages={main:'./assets/logo.png',partner:'',left:'',right:''};
let certSerial='';
function toast(message){ $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,5000); }
function fail(error){ console.error(error); toast(B?.errorMessage(error)||error.message||'Terjadi kesalahan.'); }
function modal(title,body){ $('#modal-title').textContent=title; $('#modal-body').innerHTML=body; if(!$('#modal').open) $('#modal').showModal(); hydrate(); }
function close(){ $('#modal').close(); $('#modal-body').innerHTML=''; }
function field(label,name,type='text',value='',extra=''){return `<div class="field"><label for="${esc(name)}">${label}</label><input id="${esc(name)}" name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></div>`;}
function area(label,name,value='',extra=''){return `<div class="field"><label for="${esc(name)}">${label}</label><textarea id="${esc(name)}" name="${esc(name)}" ${extra}>${esc(value)}</textarea></div>`;}
const submit = (text='Simpan',klass='') => `<button class="button ${klass}" type="submit">${text}</button>`;
const empty = text => `<p class="empty">${text}</p>`;
const img = (path,klass='avatar',alt='Foto') => `<img src="./assets/logo.png" ${path?`data-file="${esc(path)}"`:''} class="${klass}" alt="${esc(alt)}" loading="lazy">`;
const status = value => `<span class="status ${esc(value)}">${({pending:'Menunggu validasi',approved:'Aktif',rejected:'Nonaktif'})[value]||esc(value)}</span>`;
function safeURL(v){ try{const u=new URL(v);return u.protocol==='https:'?u.href:'';}catch{return '';}}
function ready(){if(!B?.configured)throw new Error('Konfigurasi server belum diisi.');if(!navigator.onLine)throw new Error('Periksa koneksi internet Anda.');}
function member(){ready();if(!me||!profile)throw new Error('Silakan masuk terlebih dahulu.');if(!admin&&(profile.status!=='approved'))throw new Error('Akun menunggu aktivasi admin.');}
function adminOnly(){member();if(!admin)throw new Error('Akses khusus admin.');}
async function hydrate(){
  if(!B?.configured)return;
  document.querySelectorAll('[data-file]').forEach(async el=>{const path=el.dataset.file; el.removeAttribute('data-file');try{const u=await B.fileURL(path); if(el.isConnected) el.src=u;}catch(e){if(el.isConnected){el.title=B.errorMessage(e);}}});
}
function applyBrandLogos(){
  const logoPath=state.cms.logoPath||'';
  const headerLogo=$('#header-logo');
  const heroLogo=$('#hero-logo');
  if(logoPath && B?.storageConfigured){
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
  $('#brand-text').textContent=state.cms.logoText||'HAURA';
  applyBrandLogos();
  if(B?.configured){$('#hero-title').textContent=state.cms.welcomeTitle;$('#hero-description').textContent=state.cms.welcomeText;}
  const video=$('#hero-video'), drivePath=state.cms.videoPath||'', url=drivePath ? '' : safeURL(state.cms.videoUrl);
  if(drivePath&&B?.storageConfigured) B.fileURL(drivePath).then(u=>{if(state.cms.videoPath!==drivePath)return;if(video.getAttribute('src')!==u)video.src=u;video.hidden=false;$('#hero-logo').hidden=true;}).catch(fail);
  if(url&&video.getAttribute('src')!==url)video.src=url;
  if(!url&&!drivePath){video.pause();video.removeAttribute('src');}
  video.hidden=!url; $('#hero-logo').hidden=!!url;

  const paidPrograms=state.programs.filter(p=>HauraFinance.programFee(p)>0);
  $('#public-programs').innerHTML=paidPrograms.length ? paidPrograms.map(p=>{
    const fee=HauraFinance.programFee(p), minDp=HauraFinance.programMinDp(p);
    return `<details><summary>${esc(p.title)} · <b>${money(fee)}</b></summary><p>${esc(p.description)}</p><div class="row spread" style="align-items:center;gap:8px;flex-wrap:wrap"><span class="price">Biaya: <b>${money(fee)}</b> · Min. Daftar: <b>${money(minDp)}</b></span><button class="button small" data-action="enroll" data-id="${esc(p.id)}">Daftar Pelatihan</button></div></details>`;
  }).join(''):empty('Belum ada program tersedia.');
  $('#public-news').innerHTML=state.news.length?state.news.map(n=>`<details><summary>${esc(n.title)}</summary><p>${esc(n.content)}</p><small class="muted">${date(n.createdAt)}</small></details>`).join(''):empty('Belum ada informasi terbaru.');
}
function navRender(){
  $('#auth-nav').innerHTML=me?`<span class="muted" style="color:#d2e2e8">${esc(profile?.name||me.email)}</span><button class="button light compact" data-action="dashboard">Dashboard</button><button class="button ghost compact" data-action="upload-profile">Foto</button><button class="button ghost compact" data-action="change-password">Password</button><button class="button ghost compact" data-action="logout">Keluar</button>`:'<button class="button ghost compact" data-action="login">Masuk Portal</button><button class="button light compact" data-action="register">Pendaftaran</button>';
}
const memberTabs=[['catalog','Program & Evaluasi'],['modules','Buku Digital'],['certificates','Sertifikat'],['chat','Diskusi & Alkes']];
const adminTabs=[['finance','Keuangan & Evaluasi'],['validation','Validasi Akun'],['cms','CMS Web'],['modules-admin','Distribusi Buku'],['cert-admin','Sertifikat'],['chat-admin','Diskusi SBAR']];
function tabsRender(){
  const pendingUsers=state.users.filter(u=>u.status==='pending').length;
  let pendingFinance=0;
  for(const e of state.enrollments)for(const p of (e.payments||[]))if(p.status==='pending')pendingFinance++;
  for(const cp of state.chatPayments)if(cp.status==='pending')pendingFinance++;
  for(const ord of state.alkesOrders)if(ord.status==='pending')pendingFinance++;

  $('#tabs').innerHTML=(admin?adminTabs:memberTabs).map(([id,label])=>{
    let badge='';
    if(id==='validation'&&pendingUsers)badge=`<span class="badge">${pendingUsers}</span>`;
    if(id==='finance'&&pendingFinance)badge=`<span class="badge">${pendingFinance}</span>`;
    return `<button data-action="tab" data-id="${id}" aria-selected="${tab===id}">${label}${badge}</button>`;
  }).join('');
}
function dashboard(){
  if(!me)return loginForm();$('#landing-view').hidden=true;$('#portal-view').hidden=false;
  $('#portal-heading').innerHTML=`<div class="row" style="align-items:center;gap:14px;margin-bottom:8px">${img(profile?.photoPath,'avatar','Foto '+esc(profile?.name||'Peserta'))}<div><span class="eyebrow green">${admin?'PUSAT KENDALI ADMIN':'PORTAL PESERTA'}</span><h2 style="margin:2px 0">${esc(profile?.name||me.email)}</h2><p class="muted" style="margin:0">${profile?.institution?esc(profile.institution):''}</p></div></div>`;
  hydrate();
  if(!profile){$('#tabs').innerHTML='';$('#portal-content').innerHTML='<p>Profil tidak ditemukan.</p>';return;}
  if(!admin&&(profile.status!=='approved')){
    $('#tabs').innerHTML='';$('#portal-content').innerHTML=`<h2>Status Akun</h2><p>${status(profile.status)}</p><p class="muted">Akun Anda sedang dalam proses aktivasi admin.</p><div class="row" style="gap:8px"><button class="button" data-action="refresh-auth">Periksa Status</button><button class="button" data-action="upload-profile">Unggah Pas Foto</button></div>`;return;
  }
  tabsRender();renderTab(true);
}
function renderTab(fresh=false){
  if($('#portal-view').hidden||!profile)return;
  if(tab==='catalog')renderCatalog();
  if(tab==='finance'&&admin)renderFinanceAdmin();
  if(tab==='validation')renderValidation();
  if(tab==='modules')renderMemberModules();
  if(tab==='certificates')renderMemberCertificates();
  if(tab==='cms'&&fresh)renderCMS();
  if(tab==='modules-admin'&&fresh)renderModuleAdmin();
  if(tab==='cert-admin'&&fresh)renderCertificateEditor();
  if(tab==='chat')renderMemberChatAndAlkes();
  if(tab==='chat-admin'&&fresh)renderAdminChat();
  hydrate();
}
function refreshSection(){
  if(!me||!profile||(!admin&&(profile.status!=='approved')))return;
  if(admin)tabsRender();
  if(['catalog','finance','validation','modules','certificates','chat'].includes(tab))renderTab();
  if(tab==='chat-admin')renderChatUsers();
}
function stopPrivate(){ $('#portal-content').innerHTML=''; $('#portal-heading').innerHTML=''; $('#tabs').innerHTML=''; subscriptions.forEach(s=>s());subscriptions=[];ownStop?.();ownStop=null;chatStop?.();chatStop=null;state.users=[];state.enrollments=[];state.chatPayments=[];state.alkesOrders=[];state.ebooks=[];state.certificates=[];state.expenses=[];state.messages=[];targetChat='';alkesCart={};B?.clearFiles();applyBrandLogos(); }
function listen(c,filters,key,extra){subscriptions.push(B.watch(c,filters,rows=>{state[key]=rows;extra?.();refreshSection();},fail));}
function startPrivate(){
  subscriptions.forEach(s=>s());subscriptions=[];
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
  if(admin)listen('ebooks',[],'ebooks');
  else {
    let all=[], mine=[];
    subscriptions.push(B.watch('ebooks',[B.F.where('userId','==','all')],rows=>{all=rows;state.ebooks=[...all,...mine];refreshSection();},fail));
    subscriptions.push(B.watch('ebooks',own,rows=>{mine=rows;state.ebooks=[...all,...mine];refreshSection();},fail));
  }
}
async function handleSession(user){
  const epoch=++session; stopPrivate();me=user;profile=null;admin=false;navRender();
  if(!user){showLanding();return;}
  try{
    const token=await B.F.getIdTokenResult(user);if(epoch!==session)return;admin=token.claims.admin===true;
    ownStop=B.F.onSnapshot(B.F.doc(B.dbInstance(),'users',user.uid),snap=>{
      if(epoch!==session)return;const old=profile;profile=snap.exists()?{id:snap.id,...snap.data()}:null;
      if(profile?.status!=='approved'&&!admin){subscriptions.forEach(s=>s());subscriptions=[];chatStop?.();chatStop=null;B.clearFiles();}
      navRender();
      if(!old||old.status!==profile?.status||old.chatAccess!==profile?.chatAccess||old.photoPath!==profile?.photoPath){startPrivate();if(!registering){tab=admin?'finance':'catalog';dashboard();}}
    },fail);
    profile=await B.read('users',user.uid);if(epoch!==session)return;
    startPrivate();tab=admin?'finance':'catalog';navRender();if(!registering)dashboard();
  }catch(e){fail(e);}
}
function loginForm(){ready();modal('Masuk Portal',B.accountFrame('login'));}
function registerForm(){ready();modal('Pendaftaran Peserta',B.accountFrame('register'));}

/* ============================================================================
   1. PESERTA: PROGRAM BERBAYAR, PELUNASAN & EVALUASI
   ============================================================================ */
function renderCatalog(){
  const myEnr=state.enrollments;
  const availablePrograms=state.programs.filter(p=>HauraFinance.programFee(p)>0);

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
    <h2>Program Saya & Evaluasi</h2>
    <div class="stack" style="margin-bottom:24px">${myEnrHtml}</div>
    <h3 class="section-title">Katalog Program Pelatihan</h3>
    <div class="cards">${catalogHtml}</div>
  `;
}

/* ============================================================================
   2. BUKU DIGITAL HTML FULLSCREEN (PESERTA & ADMIN)
   ============================================================================ */
function renderMemberModules(){
  const root=$('#portal-content');
  const html=state.ebooks.length ? state.ebooks.map(b=>{
    if(b.kind==='html' && b.htmlPath){
      return `<article class="card">
        <h3>${esc(b.title)}</h3>
        <p class="muted" style="font-size:13px">Buku Digital Interaktif</p>
        <button class="button green" data-action="read-ebook" data-id="${esc(b.id)}">Baca Buku Digital (Layar Penuh)</button>
      </article>`;
    }
    return `<article class="card">
      <h3>${esc(b.title)}</h3>
      <a class="button" href="${esc(safeURL(b.url))}" target="_blank" rel="noopener noreferrer">Buka Materi ↗</a>
    </article>`;
  }).join('') : empty('Belum ada buku digital.');
  root.innerHTML=`<h2>Buku Digital & Materi</h2><div class="cards">${html}</div>`;
}

function openEbookReader(title,html){
  const overlay=$('#ebook-reader');
  $('#ebook-reader-title').textContent=title||'Buku Digital';
  const frame=$('#ebook-reader-frame');
  frame.srcdoc=html;
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
}

function renderModuleAdmin(){
  $('#portal-content').innerHTML=`
    <h2>Distribusi Buku Digital HTML</h2>
    <div class="card">
      <form data-form="module-html">
        ${field('Judul Buku Digital','title','text','','required maxlength="180"')}
        <div class="field"><label for="module-user">Peserta Target</label><select id="module-user" name="userId">${userOptions(true)}</select></div>
        ${field('Upload File HTML (opsional, maks 5 MB)','htmlFile','file','','accept=".html,.htm,text/html"')}
        ${area('Atau Tempel Kode HTML Buku Digital di Sini','htmlCode','','rows="8" placeholder="<!doctype html><html>...</html>"')}
        ${submit('Simpan & Publikasikan Buku Digital','green')}
      </form>
    </div>
    <h3 class="section-title">Daftar Buku Digital Aktif</h3>
    <div class="cards">${state.ebooks.map(b=>`
      <article class="card">
        <b>${esc(b.title)}</b>
        <p>${esc(b.userId==='all'?'Semua peserta':state.users.find(u=>u.id===b.userId)?.name||b.userId)}</p>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${b.kind==='html'&&b.htmlPath?`<button class="button small" data-action="read-ebook" data-id="${esc(b.id)}">Pratinjau Fullscreen</button>`:''}
          <button class="button small danger" data-action="delete-module" data-id="${esc(b.id)}">Hapus</button>
        </div>
      </article>
    `).join('')||empty('Belum ada buku digital.')}</div>
  `;
}

/* ============================================================================
   3. SERTIFIKAT PESERTA
   ============================================================================ */
function renderMemberCertificates(){
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
      <p>No. ${esc(c.serial)} · ${date(c.createdAt)}</p>
      ${img(c.imagePath,'certificate-image','Sertifikat '+c.title)}
      <button class="button" data-action="download-cert" data-id="${esc(c.id)}">↓ Unduh Sertifikat PDF</button>
    </article>`;
  }).join('') : empty('Belum ada sertifikat.');
  root.innerHTML=`<h2>Sertifikat Profesional</h2><div class="stack">${html}</div>`;
}

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
      ${field(`Nominal Pembayaran Awal (Rp)`,'amount','number',String(minDp||fee),`required min="${minDp}" max="${fee}" step="1000"`)}
      ${field('Bukti Pembayaran QRIS / Transfer','proof','file','','required accept="image/jpeg,image/png,image/webp"')}
      ${submit('Kirim Pendaftaran','green')}
    </form>
  `);
}

function openInstallmentModal(enrollmentId){
  const enr=state.enrollments.find(e=>e.id===enrollmentId);
  if(!enr)throw new Error('Data pendaftaran tidak ditemukan.');
  const sisa=HauraFinance.remainingBalance(enr);
  modal('Pelunasan Biaya Pelatihan',`
    <p><b>${esc(enr.programTitle||'Program Pelatihan')}</b></p>
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
   4. DISKUSI SBAR BERLANGGANAN (QRIS) & PEMESANAN ALKES (PESERTA)
   ============================================================================ */
function renderMemberChatAndAlkes(){
  const root=$('#portal-content');
  const switcher=`
    <div class="row" style="gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button type="button" class="button ${chatSubTab==='consult'?'green':'ghost'}" data-action="chat-subtab" data-id="consult">Diskusi Klinis (SBAR)</button>
      <button type="button" class="button ${chatSubTab==='alkes'?'green':'ghost'}" data-action="chat-subtab" data-id="alkes">Pemesanan Alkes & BMHP</button>
    </div>
  `;

  if(chatSubTab==='alkes'){
    chatStop?.();chatStop=null;
    const itemsHtml=state.alkes.length ? state.alkes.map(item=>{
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
    for(const item of state.alkes){
      const q=Number(alkesCart[item.id]||0);
      if(q>0){
        const sub=Number(item.price)*q;
        total+=sub;
        selectedLines.push(`• ${esc(item.name)} (${q} ${esc(item.unit)}) = <b>${money(sub)}</b>`);
      }
    }

    const myOrdersHtml=state.alkesOrders.length ? state.alkesOrders.map(o=>`
      <div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-top:8px;background:#f8fafc">
        <div class="row spread"><b>Total: ${money(o.totalAmount)}</b><span class="status ${o.status==='confirmed'?'approved':o.status==='rejected'?'rejected':'pending'}">${o.status==='confirmed'?'Dikonfirmasi':o.status==='rejected'?'Ditolak':'Menunggu Verifikasi'}</span></div>
        <div style="font-size:13px;margin-top:4px">${(o.items||[]).map(i=>`${esc(i.name)} (${i.qty}x)`).join(', ')}</div>
        ${o.note?`<small class="muted">Catatan: ${esc(o.note)}</small>`:''}
      </div>
    `).join('') : empty('Belum ada riwayat pesanan alkes.');

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
            ${area('Alamat Pengiriman / Catatan Pesanan','shippingNote','','required maxlength="500" placeholder="Alamat lengkap / nomor WhatsApp penerima"')}
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

  // Subtab Konsultasi Klinis SBAR
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
   5. ADMIN: KEUANGAN, REKAP KAS BERSIH, DISKON/QRIS, ALKES & EVALUASI
   ============================================================================ */
function renderFinanceAdmin(){
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
          <b>${esc(u?.name||enr.userId)}</b> <small class="muted">(${esc(u?.institution||'-')})</small><br>
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
        <div><b>${esc(u?.name||cp.userId)}</b> · <b>${money(cp.amount)}</b> (${esc(cp.durationLabel||'30 Hari')})<br><small class="muted">${date(cp.createdAt)}</small></div>
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
          <b>${esc(u?.name||ord.userId)}</b> · <b style="color:#087b4b">${money(ord.totalAmount)}</b><br>
          <small>${(ord.items||[]).map(i=>`${esc(i.name)} (${i.qty}x)`).join(', ')}</small><br>
          <small class="muted">Kirim: ${esc(ord.shippingNote||'-')}</small>
        </div>
        <div class="row" style="gap:6px">
          <span class="status ${ord.status==='confirmed'?'approved':ord.status==='rejected'?'rejected':'pending'}">${ord.status==='confirmed'?'Terkonfirmasi':ord.status==='rejected'?'Ditolak':'Pending'}</span>
          <button class="button small" data-action="review-alkes-order" data-id="${esc(ord.id)}">Periksa Pesanan</button>
        </div>
      </div>
    </article>`;
  }).join('') : empty('Belum ada pesanan alkes.');

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

  $('#portal-content').innerHTML=`
    <div class="row spread" style="flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <h2 style="margin:0">Keuangan, QRIS, Alkes & Evaluasi</h2>
      <div class="field" style="margin:0;min-width:240px">
        <select id="finance-filter">${programOptions}</select>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:18px">
      <div class="card" style="padding:12px"><small class="muted">Peserta (Daftar / DP / Lunas)</small><div style="font-size:18px;font-weight:700;margin-top:4px">${recap.totalSubmissions} / ${recap.confirmedDpCount} / ${recap.paidFullCount}</div><small class="muted">Bukti menunggu: <b>${recap.pendingProofCount}</b></small></div>
      <div class="card" style="padding:12px"><small class="muted">Kas Masuk Terkonfirmasi</small><div style="font-size:18px;font-weight:700;color:#087b4b;margin-top:4px">${money(recap.confirmedCashIn)}</div><small class="muted">Pelatihan: ${money(recap.programCashIn)} · Diskusi: ${money(recap.chatCashIn)} · Alkes: ${money(recap.alkesCashIn)}</small></div>
      <div class="card" style="padding:12px"><small class="muted">Total Pengeluaran</small><div style="font-size:18px;font-weight:700;color:#9f1734;margin-top:4px">${money(recap.totalExpense)}</div><small class="muted">BMHP: ${money(recap.bmhp)} · Alkes: ${money(recap.alkes)}</small></div>
      <div class="card" style="padding:12px;background:#f0fdf4;border:1px solid #86efac"><small style="color:#166534;font-weight:600">Kas Bersih</small><div style="font-size:20px;font-weight:800;color:#14532d;margin-top:4px">${money(recap.netCash)}</div><small class="muted">Sisa piutang pelatihan: <b>${money(recap.remainingReceivables)}</b></small></div>
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
      <summary style="font-weight:700;cursor:pointer">Kelola Katalog Alkes & BMHP (${state.alkes.length})</summary>
      <form data-form="add-alkes" style="margin-top:12px">
        ${field('Nama Alkes / BMHP','name','text','','required maxlength="180"')}
        ${field('Satuan (Box / Pcs / Set)','unit','text','Set','required maxlength="60"')}
        ${field('Harga Satuan (Rp)','price','number','','required min="500" step="500"')}
        ${area('Spesifikasi / Deskripsi Singkat','description','','maxlength="1000"')}
        ${field('Foto Produk Alkes (opsional)','alkesImg','file','','accept="image/jpeg,image/png,image/webp"')}
        ${submit('Tambah Produk Alkes','green')}
      </form>
      <div class="cards" style="margin-top:12px">${state.alkes.map(a=>`
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
        <div class="field"><label for="exp-prog">Program Pelatihan</label><select id="exp-prog" name="programId" required><option value="">— Pilih Program —</option>${state.programs.map(p=>`<option value="${esc(p.id)}" ${financeFilterProgram===p.id?'selected':''}>${esc(p.title)}</option>`).join('')}</select></div>
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

      <h3 class="section-title">Verifikasi Pesanan Alkes (${state.alkesOrders.filter(x=>x.status==='pending').length} Pending)</h3>
      <div class="stack" style="margin-bottom:18px">${alkesOrderCards}</div>
    ` : ''}

    <h3 class="section-title">Verifikasi Pembayaran Pelatihan & Input Nilai Evaluasi</h3>
    <div class="stack">${enrollmentCards}</div>
  `;
}

function openReviewPaymentModal(enrollmentId,paymentId){
  const enr=state.enrollments.find(e=>e.id===enrollmentId);
  const pay=(enr?.payments||[]).find(p=>p.id===paymentId);
  if(!enr||!pay)throw new Error('Data tidak ditemukan.');
  const u=state.users.find(x=>x.id===enr.userId);
  modal('Verifikasi Pembayaran Pelatihan',`
    <p>Peserta: <b>${esc(u?.name||enr.userId)}</b> · Nominal: <b style="color:#087b4b">${money(pay.amount)}</b></p>
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
    <p>Peserta: <b>${esc(u?.name||cp.userId)}</b> · Nominal: <b style="color:#087b4b">${money(cp.amount)}</b></p>
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
  modal('Verifikasi Pesanan Alkes',`
    <p>Pemesan: <b>${esc(u?.name||ord.userId)}</b> · Total: <b style="color:#087b4b">${money(ord.totalAmount)}</b></p>
    <p style="font-size:13px">${(ord.items||[]).map(i=>`• ${esc(i.name)} (${i.qty} ${esc(i.unit)}) = ${money(i.subtotal)}`).join('<br>')}</p>
    <p style="font-size:13px">Pengiriman: <b>${esc(ord.shippingNote||'-')}</b></p>
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
    <p><b>${esc(u?.name||enr.userId)}</b> · ${esc(enr.programTitle||'Program')}</p>
    <form data-form="save-grade" data-id="${esc(enr.id)}">
      ${field('Nilai Evaluasi Akhir (0 – 100)','score','number',enr.score!==null&&enr.score!==undefined?String(enr.score):'','min="0" max="100" step="0.1"')}
      ${area('Catatan Evaluasi','evaluationNote',enr.evaluationNote||'','maxlength="1000"')}
      ${submit('Simpan Nilai','green')}
    </form>
  `);
}

function renderValidation(){const list=state.users.filter(u=>u.id!==me.uid);$('#portal-content').innerHTML='<h2>Validasi Akun Peserta</h2><div class="cards">'+(list.map(u=>`<article class="card"><div class="row">${img(u.photoPath)}<div><b>${esc(u.name)}</b><p>${esc(u.email)}<br>${esc(u.institution)}</p></div></div><p>${status(u.status)}</p><div class="row"><button class="button green small" data-action="approve-user" data-id="${esc(u.id)}">Aktifkan</button><button class="button danger small" data-action="reject-user" data-id="${esc(u.id)}">Nonaktifkan</button><button class="button small" data-action="reset-member" data-id="${esc(u.id)}">Reset Password</button></div></article>`).join('')||empty('Belum ada peserta.'))+'</div>';hydrate();}

function renderCMS(){
  const c=state.cms;
  $('#portal-content').innerHTML=`
    <h2>Pengaturan Beranda, Logo & Program</h2>
    <form data-form="cms" class="card">
      ${field('Nama Brand','logoText','text',c.logoText,'required maxlength="30"')}
      ${c.logoPath?`<div style="margin:8px 0"><img src="./assets/logo.png" data-file="${esc(c.logoPath)}" alt="Logo" style="width:72px;height:72px;object-fit:contain;border:1px solid #cbd5e1;border-radius:8px;padding:4px"><br><button type="button" class="button small danger" data-action="reset-logo" style="margin-top:6px">Kembalikan Logo Default</button></div>`:''}
      ${field('Ganti Logo Institusi (PNG/JPG/WebP)','logoFile','file','','accept="image/jpeg,image/png,image/webp"')}
      ${field('Judul Beranda','welcomeTitle','text',c.welcomeTitle,'required maxlength="180"')}
      ${area('Subjudul Beranda','welcomeText',c.welcomeText,'required maxlength="2000"')}
      ${field('URL Video Beranda (HTTPS)','videoUrl','url',c.videoUrl)}
      ${submit('Simpan Pengaturan')}
    </form>

    <h3>Tambah Program Pelatihan</h3>
    <form data-form="program" class="card">
      ${field('Nama Program','title','text','','required maxlength="180"')}
      ${area('Deskripsi','description','','required maxlength="3000"')}
      ${field('Total Biaya Pelatihan (Rp)','totalFee','number','500000','required min="1000" step="1000"')}
      ${field('Minimal Bayar Pendaftaran / DP (Rp)','minDownPayment','number','150000','required min="0" step="1000"')}
      ${submit('Tambah Program')}
    </form>

    <div class="cards">${state.programs.map(p=>{
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

function userOptions(all=false){return `${all?'<option value="all">Semua Peserta Aktif</option>':'<option value="">— Pilih Peserta —</option>'}${state.users.filter(u=>u.status==='approved').map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}`;}

function renderAdminChat(){ $('#portal-content').innerHTML='<h2>Diskusi Klinis (SBAR)</h2><div class="chat-layout"><div class="chat-users" id="chat-users"></div><div id="chat-host" class="chat-room"><p class="empty">Pilih peserta untuk membuka percakapan.</p></div></div>';renderChatUsers();if(targetChat)createRoom(targetChat,state.users.find(u=>u.id===targetChat)?.name||'Peserta'); }
function renderChatUsers(){const el=$('#chat-users');if(!el)return;el.innerHTML=state.users.filter(u=>u.status==='approved'&&u.chatAccess).map(u=>`<button class="chat-user ${targetChat===u.id?'active':''}" data-action="open-chat" data-id="${esc(u.id)}">${esc(u.name)}<br><small>${esc(u.institution||'')}</small></button>`).join('')||empty('Belum ada peserta aktif.');}
function createRoom(id,name){
  targetChat=id;chatStop?.();state.messages=[];messageLimit=100;
  $('#chat-host').innerHTML=`<div class="chat-header">${esc(name)}</div><div class="chat-tools"><button class="button small" data-action="older-chat">Riwayat Sebelumnya</button>${!admin?' <button class="button green small" data-action="sbar">+ Form SBAR</button>':''}</div><div class="messages" id="messages" aria-live="polite"></div><form class="chat-form" data-form="chat"><label class="sr-only" for="chat-text">Pesan</label><input id="chat-text" name="text" required maxlength="4000" placeholder="Tulis pesan…" autocomplete="off"><button class="button" type="submit">Kirim</button></form>`;
  watchMessages();
}
function watchMessages(){chatStop?.();chatStop=B.watch(`conversations/${targetChat}/messages`,[B.F.orderBy('createdAt','desc'),B.F.limit(messageLimit)],rows=>{state.messages=rows.reverse();renderMessages();},fail);}
function renderMessages(){
  const el=$('#messages');if(!el)return;
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

function renderCertificateEditor(){
  certSerial=`HI-${new Date().getFullYear()}-${uid().slice(0,8).toUpperCase()}`;
  const paidEnrollments=state.enrollments.filter(e=>HauraFinance.isPaidFull(e));
  const enrOptions=`<option value="">— Pilih Peserta Lunas —</option>`+
    paidEnrollments.map(e=>{
      const u=state.users.find(x=>x.id===e.userId);
      const prog=state.programs.find(x=>x.id===e.programId);
      const title=e.programTitle||prog?.title||'Program';
      return `<option value="${esc(e.id)}">${esc(u?.name||e.userId)} — ${esc(title)}</option>`;
    }).join('');

  $('#portal-content').innerHTML=`<h2>Generator Sertifikat</h2><div class="cert-grid"><form id="certificate-form" data-form="publish-cert" class="card"><div class="field"><label for="cert-enr">Peserta & Program Lunas</label><select id="cert-enr" name="enrollmentId" required>${enrOptions}</select></div>${field('Nomor Sertifikat','serial','text',certSerial,'required maxlength="80"')}${field('Nama Institusi','heading','text','HAURA INSTITUTE','required maxlength="80"')}${field('Subjudul','subtitle','text','Center of Medical Excellence','maxlength="100"')}${field('Kalimat Pembuka','intro','text','Diberikan kepada:','maxlength="150"')}${field('Kalimat Penghargaan','body','text','Atas partisipasinya dalam program pelatihan:','maxlength="180"')}${field('Nama Pelatihan','course','text','','required maxlength="150"')}<div class="field"><label for="pred">Predikat</label><select id="pred" name="predicate"><option>EXCELLENT</option><option>VERY GOOD</option><option>GOOD</option><option>PARTICIPANT</option></select></div>${field('Tempat','place','text','Lombok Tengah','maxlength="60"')}${field('Tanggal Terbit','issued','date',new Date().toISOString().slice(0,10),'required')}${field('Logo Utama','main','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="main"')}${field('Logo Mitra (opsional)','partner','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="partner"')}${field('Nama Penandatangan Kiri','leftName','text','','maxlength="100"')}${field('Jabatan Kiri','leftTitle','text','','maxlength="100"')}${field('Tanda Tangan Kiri','left','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="left"')}${field('Nama Penandatangan Kanan','rightName','text',author,'maxlength="100"')}${field('Jabatan Kanan','rightTitle','text','Direktur Haura Institute','maxlength="100"')}${field('Tanda Tangan Kanan','right','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="right"')}${submit('Terbitkan Sertifikat','green')}<p><button class="button" type="button" data-action="preview-pdf">Unduh Preview PDF</button></p></form><div class="cert-scroll"><div id="certificate-preview" class="certificate"></div></div></div>`;
  updateCertificate();
}
function certificateData(){const f=$('#certificate-form');return f?Object.fromEntries(new FormData(f)):{};}
function updateCertificate(){
  const el=$('#certificate-preview');if(!el)return;
  const c=certificateData();
  const enr=state.enrollments.find(e=>e.id===c.enrollmentId);
  const u=enr?state.users.find(x=>x.id===enr.userId):null;
  const courseInput=$('#certificate-form')?.elements?.namedItem('course');
  if(enr && courseInput && !courseInput.value){
    const prog=state.programs.find(x=>x.id===enr.programId);
    courseInput.value=enr.programTitle||prog?.title||'';
    c.course=courseInput.value;
  }
  const sign=(key,name,title)=>`<div>${certImages[key]?`<img src="${esc(certImages[key])}" alt="Tanda tangan">`:'<div class="signature-space"></div>'}<b>${esc(name||'________________________')}</b><span>${esc(title)}</span></div>`;
  el.innerHTML=`<div><div class="cert-logos"><img src="${esc(certImages.main)}" alt="Logo">${certImages.partner?`<img src="${esc(certImages.partner)}" alt="Mitra">`:''}</div><h2>${esc(c.heading)}</h2><span class="cert-sub">${esc(c.subtitle)}</span></div><div><p>${esc(c.intro)}</p><h3>${esc(u?.name||'Nama Peserta')}</h3><p>${esc(u?.institution||'Instansi Peserta')}</p><p>${esc(c.body)}</p><div class="cert-course">${esc(c.course||'Nama Program Pelatihan')}</div><p>Predikat: <b>${esc(c.predicate)}</b></p></div><div><p>${esc(c.place)}, ${esc(c.issued?new Date(c.issued+'T12:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}):'')}</p><div class="cert-signatures">${sign('left',c.leftName,c.leftTitle)}${sign('right',c.rightName,c.rightTitle)}</div><p class="cert-meta">No. ${esc(c.serial)} · Haura Institute</p></div>`;
}
async function captureCertificate(){const {html2canvas}=await import('../vendor/pdf.js');await document.fonts.ready;const node=$('#certificate-preview');await Promise.all([...node.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));return html2canvas(node,{scale:2,backgroundColor:'#fff',useCORS:false,logging:false,windowWidth:1500});}
async function pdfDownload(source,title){const {jsPDF}=await import('../vendor/pdf.js');const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});pdf.addImage(source,'JPEG',0,0,297,210);pdf.save(`${title.replace(/[^a-z0-9_-]/gi,'_').slice(0,90)}.pdf`);}

async function doAction(action,el){
  if(action==='login')return loginForm();if(action==='register')return registerForm();if(action==='close-modal')return close();if(action==='install-help')return installHelp();
  if(action==='privacy')return modal('Ketentuan Layanan',`<div class="privacy">${esc(privacyText)}</div>`);
  if(action==='logout'){ready();await B.F.signOut(B.authInstance());close();toast('Berhasil keluar.');return;}
  if(action==='dashboard')return dashboard();
  if(action==='change-password'){ready();if(!me)throw new Error('Silakan masuk.');return modal('Ganti Password',B.accountFrame('change'));}
  if(action==='reset-member'){adminOnly();return modal('Reset Password Peserta',`<p>Buat password sementara untuk peserta ini?</p><button class="button danger" data-action="confirm-reset" data-id="${esc(el.dataset.id)}">Buat Password Sementara</button>`);}
  if(action==='confirm-reset'){adminOnly();const result=await B.resetMember(el.dataset.id);return modal('Password Sementara',`<code style="word-break:break-all">${esc(result.temporary)}</code>`);}
  if(action==='upload-profile'){ready();return modal('Perbarui Pas Foto',`<form data-form="upload-profile">${field('Pilih Pas Foto','photo','file','','required accept="image/jpeg,image/png,image/webp"')}${submit('Unggah Foto')}</form>`);}
  if(action==='refresh-auth'){await B.F.reload(me);await B.F.getIdTokenResult(me,true);await handleSession(B.authInstance().currentUser);return;}
  if(action==='tab'){member();chatStop?.();chatStop=null;tab=el.dataset.id;tabsRender();renderTab(true);return;}
  if(action==='chat-subtab'){member();chatSubTab=el.dataset.id;renderMemberChatAndAlkes();hydrate();return;}
  if(action==='alkes-qty'){member();const id=el.dataset.id,delta=Number(el.dataset.delta||0);alkesCart[id]=Math.max(0,(Number(alkesCart[id]||0)+delta));renderMemberChatAndAlkes();hydrate();return;}
  if(action==='read-ebook'){
    member();
    const b=state.ebooks.find(x=>x.id===el.dataset.id);
    if(!b||!b.htmlPath)throw new Error('Buku digital tidak ditemukan.');
    toast('Memuat buku digital…');
    const html=await B.readHtmlFile(b.htmlPath);
    openEbookReader(b.title,html);
    return;
  }
  if(action==='close-ebook')return closeEbookReader();
  if(action==='toggle-fullscreen-ebook'){
    const overlay=$('#ebook-reader');
    if(!document.fullscreenElement)overlay?.requestFullscreen?.().catch(()=>{});
    else document.exitFullscreen?.().catch(()=>{});
    return;
  }
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
    return toast(action==='confirm-alkes-order'?'Pesanan alkes dikonfirmasi.':'Pesanan ditolak.');
  }
  if(action==='grade-enrollment'){adminOnly();return openGradeModal(el.dataset.id);}
  if(action==='delete-expense'){adminOnly();await B.removeExpense(el.dataset.id);return toast('Pengeluaran dihapus.');}
  if(action==='archive-alkes'){adminOnly();await B.patch('alkes',el.dataset.id,{published:false});return toast('Alkes diarsipkan.');}
  if(action==='reset-logo'){adminOnly();await B.patch('settings','public',{logoPath:'',updatedAt:B.stamp()});return toast('Logo dikembalikan.');}
  if(action==='remove-qris'){adminOnly();await B.patch('settings','public',{qrisPath:'',updatedAt:B.stamp()});return toast('QRIS dihapus.');}
  if(action==='sbar'){member();if(!profile.chatAccess)throw new Error('Akses diskusi belum aktif.');return sbarForm();}
  if(action==='open-chat'){adminOnly();const u=state.users.find(u=>u.id===el.dataset.id);createRoom(u.id,u.name);return renderChatUsers();}
  if(action==='older-chat'){messageLimit=Math.min(messageLimit+100,1000);watchMessages();return;}
  if(action==='download-cert'){member();const c=state.certificates.find(c=>c.id===el.dataset.id);if(!c||c.locked)throw new Error('Sertifikat terkunci.');const url=await B.fileURL(c.imagePath);const response=await fetch(url);const source=await blobData(await response.blob());await pdfDownload(source,c.title);return;}
  if(action==='preview-pdf'){adminOnly();toast('Menyiapkan PDF…');const canvas=await captureCertificate();return pdfDownload(canvas.toDataURL('image/jpeg',.96),'Sertifikat_Preview');}
  if(action==='approve-user'||action==='reject-user'){adminOnly();await B.patch('users',el.dataset.id,{status:action==='approve-user'?'approved':'rejected',updatedAt:B.stamp()});return toast('Status akun diperbarui.');}
  if(['archive-program','archive-news','delete-module'].includes(action)){adminOnly();return modal('Konfirmasi',`<p>Lanjutkan tindakan ini?</p><button class="button danger" data-action="confirm-change" data-kind="${action}" data-id="${esc(el.dataset.id)}">Ya, Lanjutkan</button>`);}
  if(action==='confirm-change'){adminOnly();const kind=el.dataset.kind;if(kind==='delete-module')await B.remove('ebooks',el.dataset.id);else await B.patch(kind==='archive-program'?'programs':'news',el.dataset.id,{published:false,updatedAt:B.stamp()});close();if(tab==='cms')renderCMS();if(tab==='modules-admin')setTimeout(renderModuleAdmin,200);return toast('Perubahan tersimpan.');}
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
function blobData(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});}
async function doSubmit(form){
  const type=form.dataset.form,d=new FormData(form);ready();
  if(type==='upload-profile'){if(!me)throw new Error('Silakan masuk.');const path=`profiles/${me.uid}/${uid()}`;await B.upload(path,d.get('photo'));await B.patch('users',me.uid,{photoPath:path});if(profile)profile.photoPath=path;if(!$('#portal-view').hidden)dashboard();close();toast('Pas foto diperbarui.');return;}
  member();

  if(type==='paid-enroll'){
    const file=d.get('proof');
    const path=`proofs/${me.uid}/${uid()}`;
    toast('Mengunggah bukti…');
    await B.upload(path,file);
    await B.paidEnroll({programId:form.dataset.id,amount:Number(d.get('amount')),proofPath:path});
    close();
    tab='catalog';
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
    const items=[];
    for(const item of state.alkes){
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
    await B.create('settings','public',{
      logoText:d.get('logoText').trim(),
      logoPath,
      welcomeTitle:d.get('welcomeTitle').trim(),
      welcomeText:d.get('welcomeText').trim(),
      chatFee:Number(state.cms.chatFee||50000),
      chatDurationLabel:state.cms.chatDurationLabel||'30 Hari',
      qrisPath:state.cms.qrisPath||'',
      paymentInfo:state.cms.paymentInfo||'',
      videoPath:'',
      videoUrl:safeURL(d.get('videoUrl')),
      updatedAt:B.stamp()
    });
    toast('Pengaturan tersimpan.');
    return;
  }

  if(type==='program'||type==='edit-program'){
    const totalFee=Number(d.get('totalFee')||0);
    const minDownPayment=Number(d.get('minDownPayment')||0);
    if(minDownPayment>totalFee)throw new Error('Minimal DP melebihi total biaya.');
    const data={title:d.get('title').trim(),description:d.get('description').trim(),totalFee,minDownPayment,price:totalFee,published:true,updatedAt:B.stamp()};
    if(type==='program')await B.add('programs',{...data,createdAt:B.stamp()});
    else await B.patch('programs',form.dataset.id,data);
    if(type==='program')form.reset();else close();
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
    const blob=new Blob([htmlStr],{type:'text/html'});
    const htmlPath=`ebooks/${me.uid}/${uid()}`;
    toast('Menyimpan buku digital…');
    await B.upload(htmlPath,blob,['text/html'],5*1024*1024);
    await B.add('ebooks',{title:String(d.get('title')).trim(),kind:'html',htmlPath,url:'',userId:d.get('userId'),createdAt:B.stamp()});
    form.reset();
    toast('Buku digital dipublikasikan.');
    setTimeout(renderModuleAdmin,200);
    return;
  }

  if(type==='publish-cert'){
    const c=certificateData();
    const enr=state.enrollments.find(e=>e.id===c.enrollmentId);
    if(!enr)throw new Error('Pilih peserta lunas.');
    if(!HauraFinance.isPaidFull(enr))throw new Error('Peserta belum lunas.');
    toast('Menerbitkan sertifikat…');
    const canvas=await captureCertificate();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));
    const id=uid(),path=`certificates/${enr.userId}/${id}`;
    await B.upload(path,blob,['image/jpeg'],10*1024*1024);
    await B.create('certificates',id,{userId:enr.userId,programId:enr.programId,enrollmentId:enr.id,title:c.course,serial:c.serial,imagePath:path,createdAt:B.stamp(),issuedBy:me.uid});
    toast('Sertifikat diterbitkan.');
    return;
  }
}
document.addEventListener('click',async event=>{const el=event.target.closest('[data-action]');if(!el)return;event.preventDefault();if(el.disabled)return;el.disabled=true;try{await doAction(el.dataset.action,el);}catch(e){fail(e);}finally{el.disabled=false;}});
document.addEventListener('submit',async event=>{const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();const button=form.querySelector('[type=submit]');if(button?.disabled)return;if(button)button.disabled=true;try{await doSubmit(form);}catch(e){fail(e);}finally{if(button)button.disabled=false;}});
document.addEventListener('input',event=>{if(event.target.closest('#certificate-form'))updateCertificate();});
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.id==='finance-filter'){financeFilterProgram=el.value;renderFinanceAdmin();hydrate();return;}
  if(el.id==='cert-enr'){updateCertificate();return;}
  if(!el.dataset.certImage)return;
  try{const file=el.files[0];if(file){B.validateFile(file);certImages[el.dataset.certImage]=await blobData(file);updateCertificate();}}catch(e){fail(e);el.value='';}
});
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
window.addEventListener('hashchange',()=>{if(location.hash==='#beranda')showLanding();});
async function start(){
  try{
    B=await import('./backend.js');
    if(!await B.init()){const notice=$('#setup-status');notice.hidden=false;notice.textContent='Konfigurasi server belum tersambung.';publicRender();return;}
    publicSubscriptions.push(B.F.onSnapshot(B.F.doc(B.dbInstance(),'settings','public'),snap=>{if(snap.exists())state.cms={...state.cms,...snap.data()};publicRender();},fail));
    for(const key of ['programs','news','alkes'])publicSubscriptions.push(B.watch(key,[B.F.where('published','==',true)],rows=>{state[key]=rows;publicRender();refreshSection();},fail));
    B.F.onAuthStateChanged(B.authInstance(),user=>{if(!registering)handleSession(user);});
  }catch(e){const notice=$('#setup-status');notice.hidden=false;notice.textContent='Portal belum terhubung.';publicRender();}
}
start();

document.addEventListener('haura-account-complete',()=>{close();toast('Akun tersambung.');});
