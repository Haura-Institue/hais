import {installHelp} from './pwa.js';
import {HauraFinance} from './finance.js';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = v => HauraFinance.money(v);
const date = v => v?.toDate ? v.toDate().toLocaleString('id-ID') : (typeof v === 'string' && v ? new Date(v).toLocaleString('id-ID') : '');
const uid = () => crypto.randomUUID();
const author = 'Ns. Ahmad Fudhali, S.Kep.M.Tr.Kep.';
let B, me=null, profile=null, admin=false, registering=false, session=0, tab='catalog', targetChat='', chatStop=null, ownStop=null, subscriptions=[], publicSubscriptions=[], messageLimit=100, toastTimer;
let financeFilterProgram='ALL';
let state={cms:{logoText:'HAURA',logoPath:'',welcomeTitle:'Tumbuh bersama. Merawat lebih baik.',welcomeText:'Pelatihan keperawatan, modul pembelajaran, dan diskusi profesional dalam satu portal.',chatFee:0,videoUrl:'',videoPath:'',qrisPath:'',paymentInfo:''},programs:[],news:[],users:[],enrollments:[],payments:[],ebooks:[],certificates:[],expenses:[],messages:[]};
let certImages={main:'./assets/logo.png',partner:'',left:'',right:''};
let certSerial='';
function toast(message){ $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,5500); }
function fail(error){ console.error(error); toast(B?.errorMessage(error)||error.message||'Terjadi kesalahan.'); }
function modal(title,body){ $('#modal-title').textContent=title; $('#modal-body').innerHTML=body; if(!$('#modal').open) $('#modal').showModal(); hydrate(); }
function close(){ $('#modal').close(); $('#modal-body').innerHTML=''; }
function field(label,name,type='text',value='',extra=''){return `<div class="field"><label for="${esc(name)}">${label}</label><input id="${esc(name)}" name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></div>`;}
function area(label,name,value='',extra=''){return `<div class="field"><label for="${esc(name)}">${label}</label><textarea id="${esc(name)}" name="${esc(name)}" ${extra}>${esc(value)}</textarea></div>`;}
const submit = (text='Simpan',klass='') => `<button class="button ${klass}" type="submit">${text}</button>`;
const empty = text => `<p class="empty">${text}</p>`;
const img = (path,klass='avatar',alt='Foto profil') => `<img src="./assets/logo.png" ${path?`data-file="${esc(path)}"`:''} class="${klass}" alt="${esc(alt)}" loading="lazy">`;
const status = value => `<span class="status ${esc(value)}">${({pending:'Menunggu validasi',approved:'Disetujui',rejected:'Ditolak'})[value]||esc(value)}</span>`;
function safeURL(v){ try{const u=new URL(v);return u.protocol==='https:'?u.href:'';}catch{return '';}}
function ready(){if(!B?.configured)throw new Error('Isi satu URL di js/drive-config.js terlebih dahulu. Lihat PANDUAN.html.');if(!navigator.onLine)throw new Error('Fitur ini memerlukan koneksi internet.');}
function member(){ready();if(!me||!profile)throw new Error('Silakan masuk terlebih dahulu.');if(!admin&&(profile.status!=='approved'))throw new Error('Akun harus disetujui admin terlebih dahulu.');}
function adminOnly(){member();if(!admin)throw new Error('Hanya admin yang dapat melakukan tindakan ini.');}
async function hydrate(){
  if(!B?.configured)return;
  document.querySelectorAll('[data-file]').forEach(async el=>{const path=el.dataset.file; el.removeAttribute('data-file');try{const u=await B.fileURL(path); if(el.isConnected) el.src=u;}catch(e){if(el.isConnected){el.alt='Berkas tidak dapat dimuat — periksa akses';el.title=B.errorMessage(e);}}});
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
  }).join(''):empty(B?.configured?'Belum ada program pelatihan berbayar yang dibuka.':'Katalog akan tampil setelah Apps Script disambungkan.');
  $('#public-news').innerHTML=state.news.length?state.news.map(n=>`<details><summary>${esc(n.title)}</summary><p>${esc(n.content)}</p><small class="muted">${date(n.createdAt)}</small></details>`).join(''):empty('Belum ada informasi terbaru.');
}
function navRender(){
  $('#auth-nav').innerHTML=me?`<span class="muted" style="color:#d2e2e8">${esc(profile?.name||me.email)}</span><button class="button light compact" data-action="dashboard">Dashboard</button><button class="button ghost compact" data-action="upload-profile">Foto</button><button class="button ghost compact" data-action="change-password">Ganti Password</button><button class="button ghost compact" data-action="logout">Keluar</button>`:'<button class="button ghost compact" data-action="login">Masuk Portal</button><button class="button light compact" data-action="register">Pendaftaran</button>';
}
const memberTabs=[['catalog','Program & Evaluasi'],['modules','Modul Saya'],['certificates','Sertifikat'],['chat','Diskusi Profesional']];
const adminTabs=[['finance','Keuangan & Evaluasi'],['validation','Validasi Akun'],['cms','CMS Web'],['modules-admin','Distribusi Modul'],['cert-admin','Sertifikat'],['chat-admin','Chat Berkala']];
function pendingCount(){
  const pendingUsers=state.users.filter(u=>u.status==='pending').length;
  let pendingPayments=0;
  for(const e of state.enrollments){
    for(const p of (e.payments||[]))if(p.status==='pending')pendingPayments++;
  }
  return pendingUsers+pendingPayments;
}
function tabsRender(){
  const pendingUsers=state.users.filter(u=>u.status==='pending').length;
  let pendingPay=0;
  for(const e of state.enrollments)for(const p of (e.payments||[]))if(p.status==='pending')pendingPay++;
  $('#tabs').innerHTML=(admin?adminTabs:memberTabs).map(([id,label])=>{
    let badge='';
    if(id==='validation'&&pendingUsers)badge=`<span class="badge">${pendingUsers}</span>`;
    if(id==='finance'&&pendingPay)badge=`<span class="badge">${pendingPay}</span>`;
    return `<button data-action="tab" data-id="${id}" aria-selected="${tab===id}">${label}${badge}</button>`;
  }).join('');
}
function dashboard(){
  if(!me)return loginForm();$('#landing-view').hidden=true;$('#portal-view').hidden=false;
  $('#portal-heading').innerHTML=`<div class="row" style="align-items:center;gap:14px;margin-bottom:8px">${img(profile?.photoPath,'avatar','Foto '+esc(profile?.name||'Peserta'))}<div><span class="eyebrow green">${admin?'PUSAT KENDALI ADMIN':'PORTAL PESERTA'}</span><h2 style="margin:2px 0">Selamat datang, ${esc(profile?.name||me.email)}</h2><p class="muted" style="margin:0">${profile?.institution?esc(profile.institution)+' · ':''}${admin?'Kelola pelatihan, pembayaran, evaluasi, dan rekap kas.':'Ruang belajar, pembayaran pelatihan, dan hasil evaluasi Anda.'}</p></div></div>`;
  hydrate();
  if(!profile){$('#tabs').innerHTML='';$('#portal-content').innerHTML=profileForm();return;}
  if(!admin&&(profile.status!=='approved')){
    $('#tabs').innerHTML='';$('#portal-content').innerHTML=`<h2>Status Pendaftaran Akun</h2><p>${status(profile.status)}</p><p class="muted">Email hanya identitas login; tidak perlu verifikasi email. Persetujuan akun dilakukan oleh admin sebelum Anda dapat mendaftar program pelatihan.</p><button class="button" data-action="refresh-auth">Periksa Status</button> <button class="button" data-action="upload-profile">Perbarui Pas Foto</button>`;return;
  }
  tabsRender();renderTab(true);
}
function renderTab(fresh=false){
  if($('#portal-view').hidden||!profile)return;
  const root=$('#portal-content');
  if(tab==='catalog')renderCatalog();
  if(tab==='finance'&&admin)renderFinanceAdmin();
  if(tab==='validation')renderValidation();
  if(tab==='modules')root.innerHTML=`<h2>Modul & E-Book Saya</h2><p class="muted">Materi yang dibagikan oleh admin.</p><div class="cards">${state.ebooks.length?state.ebooks.map(b=>`<article class="card"><h3>${esc(b.title)}</h3><a class="button" href="${esc(safeURL(b.url))}" target="_blank" rel="noopener noreferrer">Buka Modul ↗</a></article>`).join(''):empty('Belum ada modul yang dibagikan.')}</div>`;
  if(tab==='certificates')renderMemberCertificates();
  if(tab==='cms'&&fresh)renderCMS();
  if(tab==='modules-admin'&&fresh)renderModuleAdmin();
  if(tab==='cert-admin'&&fresh)renderCertificateEditor();
  if(tab==='chat'&&fresh)renderChatGate();
  if(tab==='chat-admin'&&fresh)renderAdminChat();
  hydrate();
}
function refreshSection(){
  if(!me||!profile||(!admin&&(profile.status!=='approved')))return;
  if(admin)tabsRender();
  if(['catalog','finance','validation','modules','certificates'].includes(tab))renderTab();
  if(tab==='chat-admin')renderChatUsers();
}
function stopPrivate(){ $('#portal-content').innerHTML=''; $('#portal-heading').innerHTML=''; $('#tabs').innerHTML=''; subscriptions.forEach(s=>s());subscriptions=[];ownStop?.();ownStop=null;chatStop?.();chatStop=null;state.users=[];state.enrollments=[];state.payments=[];state.ebooks=[];state.certificates=[];state.expenses=[];state.messages=[];targetChat='';B?.clearFiles();applyBrandLogos(); }
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
function profileForm(){return '<p>Profil belum tersedia. Hubungi pengelola.</p>';}
function registerForm(){ready();modal('Daftar Peserta',B.accountFrame('register'));}

/* ============================================================================
   TAMPILAN PESERTA: PROGRAM BERBAYAR, PELUNASAN & PENGUNCIAN EVALUASI
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
          Sisa Tagihan: <b style="color:${sisa>0?'#b45309':'#087b4b'}">${money(sisa)}</b>
        </p>
        <div style="font-size:13px;background:#f8fafc;padding:10px;border-radius:8px;margin-bottom:10px">
          <b>Riwayat Pembayaran:</b>
          ${(enr.payments||[]).map(p=>`<div style="margin-top:4px">• ${esc(p.label||'Pembayaran')}: <b>${money(p.amount)}</b> — <span class="status ${p.status==='confirmed'?'approved':p.status==='rejected'?'rejected':'pending'}">${p.status==='confirmed'?'Terkonfirmasi':p.status==='rejected'?'Ditolak':'Menunggu Verifikasi'}</span>${p.note?` <i>(${esc(p.note)})</i>`:''}</div>`).join('')}
        </div>
      `:''}
      ${lunas ? `
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;padding:12px;border-radius:10px;color:#065f46">
          <b>Hasil Evaluasi & Sertifikat Terbuka</b>
          <p style="margin:4px 0">Nilai Evaluasi: <b>${enr.score!==null&&enr.score!==undefined?esc(enr.score):'Menunggu penilaian pengajar'}</b></p>
          ${enr.evaluationNote?`<p style="margin:4px 0;font-size:13px">Catatan: ${esc(enr.evaluationNote)}</p>`:''}
        </div>
      ` : `
        <div style="background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:10px;color:#78350f">
          <b>🔒 Nilai Evaluasi & Sertifikat Terkunci</b>
          <p style="margin:4px 0;font-size:13px">Selesaikan pelunasan biaya pelatihan dan tunggu konfirmasi admin untuk membuka nilai evaluasi serta sertifikat Anda.</p>
          ${hasPending
            ? `<p style="margin:6px 0 0;font-size:13px;font-weight:600">⏳ Bukti pembayaran Anda sedang diperiksa oleh admin.</p>`
            : `<button class="button small" style="margin-top:8px;background:#d97706" data-action="pay-installment" data-id="${esc(enr.id)}">Ajukan Pelunasan (${money(sisa)})</button>`
          }
        </div>
      `}
    </article>`;
  }).join('') : empty('Anda belum mendaftar program pelatihan.');

  const catalogHtml=availablePrograms.map(p=>{
    const joined=myEnr.some(e=>e.programId===p.id);
    const fee=HauraFinance.programFee(p), minDp=HauraFinance.programMinDp(p);
    return `<article class="card">
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.description)}</p>
      <p style="font-size:14px">Total Biaya: <b>${money(fee)}</b><br>Minimal Bayar Pendaftaran: <b>${money(minDp)}</b></p>
      <button class="button" data-action="enroll" data-id="${esc(p.id)}" ${joined?'disabled':''}>${joined?'Sudah Terdaftar':'Daftar & Bayar Pendaftaran'}</button>
    </article>`;
  }).join('')||empty('Belum ada program berbayar yang dibuka.');

  $('#portal-content').innerHTML=`
    <h2>Program Pelatihan Saya & Evaluasi</h2>
    <p class="muted">Nilai evaluasi dan sertifikat otomatis terbuka setelah pelunasan dikonfirmasi oleh admin.</p>
    <div class="stack" style="margin-bottom:24px">${myEnrHtml}</div>
    <h3 class="section-title">Katalog Program Pelatihan Tersedia</h3>
    <div class="cards">${catalogHtml}</div>
  `;
}

function renderMemberCertificates(){
  const root=$('#portal-content');
  const html=state.certificates.length ? state.certificates.map(c=>{
    if(c.locked){
      return `<article class="card" style="border-left:4px solid #d97706;background:#fffbeb">
        <h3>🔒 ${esc(c.title)}</h3>
        <p style="color:#78350f">Sertifikat terkunci karena pembayaran program pelatihan belum lunas atau belum dikonfirmasi admin.</p>
      </article>`;
    }
    return `<article class="card">
      <h3>${esc(c.title)}</h3>
      <p>No. ${esc(c.serial)} · ${date(c.createdAt)}</p>
      ${img(c.imagePath,'certificate-image','Sertifikat '+c.title)}
      <button class="button" data-action="download-cert" data-id="${esc(c.id)}">↓ Unduh Sertifikat PDF</button>
    </article>`;
  }).join('') : empty('Sertifikat belum diterbitkan.');
  root.innerHTML=`<h2>Sertifikat Profesional</h2><p class="muted">Sertifikat program berbayar aktif otomatis setelah status pembayaran Lunas.</p><div class="stack">${html}</div>`;
}

function paymentInstructionBox(){
  const qris=state.cms.qrisPath;
  const info=state.cms.paymentInfo;
  if(!qris && !info)return `<div style="background:#fef2f2;border:1px solid #fecaca;padding:10px;border-radius:8px;color:#991b1b;font-size:13px;margin-bottom:12px">Admin belum mengunggah QRIS atau nomor rekening. Hubungi admin sebelum mentransfer.</div>`;
  return `<div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:12px;border-radius:10px;margin-bottom:14px">
    <b style="color:#166534;display:block;margin-bottom:6px">Metode Pembayaran Resmi Haura Institute</b>
    ${qris?`<div style="text-align:center;margin:8px 0"><img src="./assets/logo.png" data-file="${esc(qris)}" alt="QRIS Pembayaran Haura Institute" style="max-width:220px;width:100%;border-radius:8px;border:1px solid #cbd5e1"><small class="muted" style="display:block">Scan QRIS di atas melalui m-Banking / e-Wallet</small></div>`:''}
    ${info?`<div style="white-space:pre-wrap;font-size:13px;background:#fff;padding:8px;border-radius:6px;border:1px solid #dcfce7">${esc(info)}</div>`:''}
  </div>`;
}

function openPaidEnrollModal(programId){
  const p=state.programs.find(x=>x.id===programId);
  if(!p)throw new Error('Program tidak ditemukan.');
  const fee=HauraFinance.programFee(p), minDp=HauraFinance.programMinDp(p);
  modal('Pendaftaran Program Pelatihan',`
    <p><b>${esc(p.title)}</b></p>
    <p style="font-size:14px">Total Biaya: <b>${money(fee)}</b> · Minimal Bayar Awal: <b>${money(minDp)}</b></p>
    ${paymentInstructionBox()}
    <form data-form="paid-enroll" data-id="${esc(p.id)}">
      ${field(`Nominal Pembayaran Awal (Rp) — min. ${money(minDp)}`,'amount','number',String(minDp||fee),`required min="${minDp}" max="${fee}" step="1000"`)}
      ${field('Upload Bukti Transfer / Screenshot QRIS (JPG/PNG/WebP, maks 5 MB)','proof','file','','required accept="image/jpeg,image/png,image/webp"')}
      ${submit('Kirim Pendaftaran & Bukti Bayar','green')}
    </form>
  `);
}

function openInstallmentModal(enrollmentId){
  const enr=state.enrollments.find(e=>e.id===enrollmentId);
  if(!enr)throw new Error('Data pendaftaran tidak ditemukan.');
  const sisa=HauraFinance.remainingBalance(enr);
  modal('Ajukan Pelunasan Biaya Pelatihan',`
    <p><b>${esc(enr.programTitle||'Program Pelatihan')}</b></p>
    <p style="font-size:14px">Sisa Tagihan Anda: <b style="color:#b45309">${money(sisa)}</b></p>
    ${paymentInstructionBox()}
    <form data-form="submit-installment" data-id="${esc(enr.id)}">
      ${field('Nominal yang Dibayarkan (Rp)','amount','number',String(sisa),`required min="1000" max="${sisa}" step="1000"`)}
      ${field('Upload Bukti Transfer Pelunasan (JPG/PNG/WebP, maks 5 MB)','proof','file','','required accept="image/jpeg,image/png,image/webp"')}
      ${submit('Kirim Bukti Pelunasan','green')}
    </form>
  `);
}

/* ============================================================================
   TAMPILAN ADMIN: KEUANGAN, REKAP KAS BERSIH, PENGELUARAN & EVALUASI
   ============================================================================ */
function renderFinanceAdmin(){
  const recap=HauraFinance.calculateRecap(state.enrollments, state.expenses, financeFilterProgram);
  const programOptions=`<option value="ALL" ${financeFilterProgram==='ALL'?'selected':''}>Semua Program Pelatihan</option>`+
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
        Nilai Evaluasi: <b>${enr.score!==null&&enr.score!==undefined?esc(enr.score):'Belum dinilai'}</b>
      </p>
      <div style="background:#f8fafc;padding:8px;border-radius:8px;margin-bottom:10px">
        <small><b>Rincian Bukti Bayar:</b></small>
        ${payRows||'<p class="muted">Belum ada bukti.</p>'}
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="button small green" data-action="grade-enrollment" data-id="${esc(enr.id)}">Input / Edit Nilai Evaluasi</button>
      </div>
    </article>`;
  }).join('') : empty('Belum ada peserta pada filter program ini.');

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
      <div>
        <h2 style="margin:0">Keuangan, QRIS & Evaluasi Peserta</h2>
        <p class="muted" style="margin:4px 0 0">Rekap arus kas terkonfirmasi, pengeluaran BMHP/Alkes, dan kunci nilai evaluasi.</p>
      </div>
      <div class="field" style="margin:0;min-width:240px">
        <label for="finance-filter">Filter Program</label>
        <select id="finance-filter">${programOptions}</select>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:18px">
      <div class="card" style="padding:12px"><small class="muted">Pengajuan / DP Konfirmasi / Lunas</small><div style="font-size:18px;font-weight:700;margin-top:4px">${recap.totalSubmissions} / ${recap.confirmedDpCount} / ${recap.paidFullCount}</div><small class="muted">Bukti pending: <b>${recap.pendingProofCount}</b></small></div>
      <div class="card" style="padding:12px"><small class="muted">Kas Masuk Terkonfirmasi</small><div style="font-size:18px;font-weight:700;color:#087b4b;margin-top:4px">${money(recap.confirmedCashIn)}</div><small class="muted">Sisa tagihan: <b>${money(recap.remainingReceivables)}</b></small></div>
      <div class="card" style="padding:12px"><small class="muted">Total Pengeluaran</small><div style="font-size:18px;font-weight:700;color:#9f1734;margin-top:4px">${money(recap.totalExpense)}</div><small class="muted">BMHP: ${money(recap.bmhp)} · Alkes: ${money(recap.alkes)}</small></div>
      <div class="card" style="padding:12px;background:#f0fdf4;border:1px solid #86efac"><small style="color:#166534;font-weight:600">Kas Bersih (Arus Kas)</small><div style="font-size:20px;font-weight:800;color:#14532d;margin-top:4px">${money(recap.netCash)}</div><small class="muted">Rekap kas masuk dikurangi belanja</small></div>
    </div>

    <details class="card" style="margin-bottom:18px">
      <summary style="font-weight:700;cursor:pointer">⚙️ Pengaturan QRIS Barcode & Rekening Pembayaran</summary>
      <form data-form="finance-config" style="margin-top:12px">
        ${state.cms.qrisPath?`<div style="margin-bottom:10px"><img src="./assets/logo.png" data-file="${esc(state.cms.qrisPath)}" alt="QRIS Aktif" style="max-width:180px;border-radius:8px;border:1px solid #cbd5e1"><br><button type="button" class="button small danger" data-action="remove-qris" style="margin-top:6px">Hapus Gambar QRIS</button></div>`:''}
        ${field('Upload Gambar QRIS / Barcode Pembayaran Resmi (JPG/PNG/WebP)','qris','file','','accept="image/jpeg,image/png,image/webp"')}
        ${area('Petunjuk Transfer / Nomor Rekening Bank / E-Wallet','paymentInfo',state.cms.paymentInfo,'maxlength="2000" placeholder="Contoh: Bank BSI 7123456789 a.n. Haura Institute..."')}
        ${submit('Simpan Pengaturan Pembayaran','green')}
      </form>
    </details>

    <details class="card" style="margin-bottom:18px">
      <summary style="font-weight:700;cursor:pointer">🧾 Catat Pengeluaran Program (BMHP / Instrumen Alkes / Operasional)</summary>
      <form data-form="add-expense" style="margin-top:12px">
        <div class="field"><label for="exp-prog">Program Pelatihan</label><select id="exp-prog" name="programId" required><option value="">— Pilih Program —</option>${state.programs.map(p=>`<option value="${esc(p.id)}" ${financeFilterProgram===p.id?'selected':''}>${esc(p.title)}</option>`).join('')}</select></div>
        <div class="field"><label for="exp-cat">Kategori Pengeluaran</label><select id="exp-cat" name="category" required><option value="BMHP">BMHP (Bahan Medis Habis Pakai)</option><option value="Instrumen/Alkes">Instrumen / Alkes</option><option value="Operasional">Operasional Lainnya</option></select></div>
        ${field('Keterangan Pembelanjaan','description','text','','required maxlength="300" placeholder="Contoh: Kasa steril, spuit 3cc, handscoon, cairan NaCl"')}
        ${field('Nominal Pengeluaran (Rp)','amount','number','','required min="1" step="500"')}
        ${field('Tanggal Transaksi','date','date',new Date().toISOString().slice(0,10),'required')}
        ${submit('Simpan Pengeluaran')}
      </form>
      <div style="margin-top:14px"><b>Daftar Pengeluaran (${filteredExpenses.length}):</b>${expenseRows}</div>
    </details>

    <h3 class="section-title">Verifikasi Pembayaran & Input Nilai Evaluasi Peserta</h3>
    <div class="stack">${enrollmentCards}</div>
  `;
}

function openReviewPaymentModal(enrollmentId,paymentId){
  const enr=state.enrollments.find(e=>e.id===enrollmentId);
  const pay=(enr?.payments||[]).find(p=>p.id===paymentId);
  if(!enr||!pay)throw new Error('Data pembayaran tidak ditemukan.');
  const u=state.users.find(x=>x.id===enr.userId);
  modal('Verifikasi Bukti Pembayaran',`
    <p>Peserta: <b>${esc(u?.name||enr.userId)}</b><br>
    Jenis: <b>${esc(pay.label||'Pembayaran')}</b> · Nominal: <b style="color:#087b4b">${money(pay.amount)}</b></p>
    <div style="text-align:center;margin:10px 0">
      <img src="./assets/logo.png" data-file="${esc(pay.proofPath)}" alt="Bukti Transfer" style="max-width:100%;max-height:360px;border-radius:8px;border:1px solid #cbd5e1">
    </div>
    ${field('Catatan Admin (opsional, wajib jika ditolak)','reviewNote','text',pay.note||'','maxlength="300" placeholder="Contoh: Mutasi masuk sesuai / Bukti buram"')}
    <div class="row" style="gap:8px;margin-top:12px">
      <button class="button green" data-action="confirm-payment" data-enr="${esc(enr.id)}" data-pay="${esc(pay.id)}">✓ Konfirmasi Sah (Masuk Kas)</button>
      <button class="button danger" data-action="reject-payment" data-enr="${esc(enr.id)}" data-pay="${esc(pay.id)}">✕ Tolak Bukti</button>
    </div>
  `);
}

function openGradeModal(enrollmentId){
  const enr=state.enrollments.find(e=>e.id===enrollmentId);
  if(!enr)throw new Error('Data peserta tidak ditemukan.');
  const u=state.users.find(x=>x.id===enr.userId);
  const lunas=HauraFinance.isPaidFull(enr);
  modal('Input Nilai Evaluasi Peserta',`
    <p>Peserta: <b>${esc(u?.name||enr.userId)}</b><br>Program: <b>${esc(enr.programTitle||'Program')}</b></p>
    ${!lunas?'<p style="background:#fffbeb;padding:8px;border-radius:8px;color:#92400e;font-size:13px">Catatan: Peserta ini <b>belum lunas</b>. Nilai yang Anda simpan akan tetap terkunci di server dan belum muncul di akun peserta sampai pelunasan dikonfirmasi.</p>':''}
    <form data-form="save-grade" data-id="${esc(enr.id)}">
      ${field('Nilai Evaluasi Akhir (0 – 100)','score','number',enr.score!==null&&enr.score!==undefined?String(enr.score):'','min="0" max="100" step="0.1" placeholder="Contoh: 88.5"')}
      ${area('Catatan Evaluasi / Kompetensi (opsional)','evaluationNote',enr.evaluationNote||'','maxlength="1000"')}
      ${submit('Simpan Nilai Evaluasi','green')}
    </form>
  `);
}

function renderValidation(){const list=state.users.filter(u=>u.id!==me.uid);$('#portal-content').innerHTML='<h2>Kelola Akun Peserta</h2><p class="muted">Periksa pendaftar secara manual sebelum mengaktifkan. Email tidak diverifikasi otomatis.</p><div class="cards">'+(list.map(u=>`<article class="card"><div class="row">${img(u.photoPath)}<div><b>${esc(u.name)}</b><p>${esc(u.email)}<br>${esc(u.institution)}</p></div></div><p>${status(u.status)}</p><div class="row"><button class="button green small" data-action="approve-user" data-id="${esc(u.id)}">Aktifkan Akun</button><button class="button danger small" data-action="reject-user" data-id="${esc(u.id)}">Nonaktifkan</button><button class="button small" data-action="reset-member" data-id="${esc(u.id)}">Reset Password</button></div></article>`).join('')||empty('Belum ada peserta.'))+'</div>';hydrate();}

function renderCMS(){
  const c=state.cms;
  $('#portal-content').innerHTML=`
    <h2>Pengaturan Beranda, Logo & Program</h2>
    <form data-form="cms" class="card">
      ${field('Teks brand','logoText','text',c.logoText,'required maxlength="30"')}
      ${c.logoPath?`<div style="margin:8px 0"><img src="./assets/logo.png" data-file="${esc(c.logoPath)}" alt="Logo Saat Ini" style="width:72px;height:72px;object-fit:contain;border:1px solid #cbd5e1;border-radius:8px;padding:4px"><br><button type="button" class="button small danger" data-action="reset-logo" style="margin-top:6px">Kembalikan Logo Default</button></div>`:''}
      ${field('Ganti Logo Institusi (PNG/JPG/WebP, maks 5 MB)','logoFile','file','','accept="image/jpeg,image/png,image/webp"')}
      ${field('Judul beranda','welcomeTitle','text',c.welcomeTitle,'required maxlength="180"')}
      ${area('Deskripsi','welcomeText',c.welcomeText,'required maxlength="2000"')}
      ${field('URL video HTTPS langsung (opsional)','videoUrl','url',c.videoUrl)}
      ${submit('Simpan Pengaturan & Logo')}
    </form>

    <h3>Tambah Program Pelatihan Berbayar</h3>
    <form data-form="program" class="card">
      ${field('Nama program','title','text','','required maxlength="180"')}
      ${area('Deskripsi','description','','required maxlength="3000"')}
      ${field('Total Biaya Pelatihan (Rp)','totalFee','number','500000','required min="1000" step="1000"')}
      ${field('Minimal Pembayaran Pendaftaran / DP (Rp)','minDownPayment','number','150000','required min="0" step="1000"')}
      ${submit('Tambah Program')}
    </form>

    <div class="cards">${state.programs.map(p=>{
      const fee=HauraFinance.programFee(p), minDp=HauraFinance.programMinDp(p);
      return `<article class="card">
        <b>${esc(p.title)}</b>
        <p>${esc(p.description)}</p>
        ${fee>0
          ? `<p style="font-size:13px;color:#087b4b">Biaya: <b>${money(fee)}</b> · Min. Daftar: <b>${money(minDp)}</b></p>`
          : `<p style="font-size:13px;color:#b45309"><b>Belum diatur biaya</b> (Tidak tampil di pendaftaran baru — klik Edit untuk mengisi biaya)</p>`
        }
        <button class="button small" data-action="edit-program" data-id="${esc(p.id)}">Edit Biaya & Detail</button>
        <button class="button small danger" data-action="archive-program" data-id="${esc(p.id)}">Arsipkan</button>
      </article>`;
    }).join('')}</div>

    <h3>Tambah Berita</h3>
    <form data-form="news" class="card">${field('Judul','title','text','','required maxlength="180"')}${area('Isi','content','','required maxlength="5000"')}${submit('Publikasikan Berita')}</form>
    <div class="cards">${state.news.map(n=>`<article class="card"><b>${esc(n.title)}</b><button class="button small danger" data-action="archive-news" data-id="${esc(n.id)}">Arsipkan</button></article>`).join('')}</div>
  `;
}

function userOptions(all=false){return `${all?'<option value="all">Semua Peserta Disetujui</option>':'<option value="">— Pilih Peserta —</option>'}${state.users.filter(u=>u.status==='approved').map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}`;}
function renderModuleAdmin(){
  $('#portal-content').innerHTML=`<h2>Distribusi Modul & E-Book</h2><p class="muted">Tautan harus HTTPS. Untuk modul terbatas, atur juga izin di penyedia dokumen; tautan publik dapat diteruskan oleh penerima.</p><div class="card"><form data-form="module">${field('Judul Modul','title','text','','required maxlength="180"')}${field('URL PDF / Google Drive (HTTPS)','url','url','','required')}<div class="field"><label for="module-user">Peserta Target</label><select id="module-user" name="userId">${userOptions(true)}</select></div>${submit('Kirim Modul')}</form></div><h3 class="section-title">Modul yang Telah Dibagikan</h3><div class="cards">${state.ebooks.map(b=>`<article class="card"><b>${esc(b.title)}</b><p>${esc(b.userId==='all'?'Semua peserta':state.users.find(u=>u.id===b.userId)?.name||b.userId)}</p><button class="button small danger" data-action="delete-module" data-id="${esc(b.id)}">Cabut Modul</button></article>`).join('')||empty('Belum ada modul.')}</div>`;
}
function renderChatGate(){
  if(tab!=='chat')return;const root=$('#portal-content');
  if(profile.chatAccess){if(!$('#messages')){root.innerHTML='<h2>Diskusi Profesional</h2><p class="muted">Diskusi profesional, bukan layanan gawat darurat. Gunakan data pasien yang telah dianonimkan.</p><div id="chat-host"></div>';createRoom(me.uid,'Tim Haura Institute');}return;}
  root.innerHTML='<h2>Diskusi</h2><p>Akses diskusi belum diaktifkan. Hubungi admin.</p>';
}
function renderAdminChat(){ $('#portal-content').innerHTML='<h2>Chat Berkala</h2><p class="muted">Lindungi kerahasiaan pasien. Jangan mengklaim status online tanpa sistem presence.</p><div class="chat-layout"><div class="chat-users" id="chat-users"></div><div id="chat-host" class="chat-room"><p class="empty">Pilih peserta untuk membuka percakapan.</p></div></div>';renderChatUsers();if(targetChat)createRoom(targetChat,state.users.find(u=>u.id===targetChat)?.name||'Peserta'); }
function renderChatUsers(){const el=$('#chat-users');if(!el)return;el.innerHTML=state.users.filter(u=>u.status==='approved'&&u.chatAccess).map(u=>`<button class="chat-user ${targetChat===u.id?'active':''}" data-action="open-chat" data-id="${esc(u.id)}">${esc(u.name)}<br><small>Akses chat aktif</small></button>`).join('')||empty('Belum ada peserta dengan akses chat.');}
function createRoom(id,name){
  targetChat=id;chatStop?.();state.messages=[];messageLimit=100;
  $('#chat-host').innerHTML=`<div class="chat-header">${esc(name)}<small>Privat peserta–admin · pembaruan ±30 detik · bukan kanal darurat</small></div><div class="chat-tools"><button class="button small" data-action="older-chat">Muat Pesan Lebih Lama</button>${!admin?' <button class="button green small" data-action="soap">+ Form SOAP</button>':''}</div><div class="messages" id="messages" aria-live="polite"></div><form class="chat-form" data-form="chat"><label class="sr-only" for="chat-text">Pesan</label><input id="chat-text" name="text" required maxlength="4000" placeholder="Tulis pesan…" autocomplete="off"><button class="button" type="submit">Kirim</button></form>`;
  watchMessages();
}
function watchMessages(){chatStop?.();chatStop=B.watch(`conversations/${targetChat}/messages`,[B.F.orderBy('createdAt','desc'),B.F.limit(messageLimit)],rows=>{state.messages=rows.reverse();renderMessages();},fail);}
function renderMessages(){const el=$('#messages');if(!el)return;el.innerHTML=state.messages.map(m=>`<div class="message ${m.senderId===me.uid?'mine':''}">${m.kind==='soap'?`<b>LAPORAN SOAP</b>${['s','o','a','p'].map(k=>`<p><b>${k.toUpperCase()}:</b> ${esc(m.soap?.[k])}</p>`).join('')}`:esc(m.text)}<time>${date(m.createdAt)||'Mengirim…'}</time></div>`).join('')||empty('Belum ada percakapan.');el.scrollTop=el.scrollHeight;}
function soapForm(){modal('Laporan SOAP Keperawatan',`<p class="form-message">Jangan masukkan nama pasien, NIK, nomor rekam medis, alamat, atau foto identitas. Gunakan kode kasus anonim.</p><form data-form="soap">${area('S — Subjektif / Keluhan','s','','required maxlength="2000"')}${area('O — Objektif / Data Klinis','o','','required maxlength="2000"')}${area('A — Assessment / Masalah','a','','required maxlength="2000"')}${area('P — Plan / Tindakan','p','','required maxlength="2000"')}<label class="check-label"><input type="checkbox" name="consent" required> Data sudah dianonimkan dan saya berwenang membagikannya untuk diskusi profesional.</label>${submit('Kirim Laporan SOAP','green')}</form>`);}
const privacyText=`Haura Institute menyimpan profil, keanggotaan program, pembayaran, sertifikat, dan diskusi di Google Drive privat. Google Apps Script memeriksa sesi, status pelunasan, dan persetujuan admin. Password diproses pada formulir Google Apps Script, di-hash PBKDF2 dengan salt, dan tidak disimpan sebagai teks biasa. Email hanya identitas akun, bukan bukti kepemilikan email. Sesi disimpan di memori tab, berakhir maksimal 8 jam, dan hilang saat halaman dimuat ulang. Jangan memasukkan identitas pasien/rekam medis. Aplikasi by. ${author}`;

function renderCertificateEditor(){
  certSerial=`HI-${new Date().getFullYear()}-${uid().slice(0,8).toUpperCase()}`;
  const paidEnrollments=state.enrollments.filter(e=>HauraFinance.isPaidFull(e));
  const enrOptions=`<option value="">— Pilih Peserta & Program (Hanya Peserta Lunas) —</option>`+
    paidEnrollments.map(e=>{
      const u=state.users.find(x=>x.id===e.userId);
      const prog=state.programs.find(x=>x.id===e.programId);
      const title=e.programTitle||prog?.title||'Program';
      return `<option value="${esc(e.id)}">${esc(u?.name||e.userId)} — ${esc(title)} (LUNAS)</option>`;
    }).join('');

  $('#portal-content').innerHTML=`<h2>Generator Sertifikat</h2><p class="muted">Hanya peserta dengan status pembayaran <b>Lunas</b> yang dapat dipilih untuk penerbitan sertifikat.</p><div class="cert-grid"><form id="certificate-form" data-form="publish-cert" class="card"><div class="field"><label for="cert-enr">Peserta & Program Lunas</label><select id="cert-enr" name="enrollmentId" required>${enrOptions}</select></div>${field('Nomor Sertifikat','serial','text',certSerial,'required maxlength="80"')}${field('Nama Institusi','heading','text','HAURA INSTITUTE','required maxlength="80"')}${field('Subjudul','subtitle','text','Center of Medical Excellence','maxlength="100"')}${field('Kalimat Pembuka','intro','text','Diberikan kepada:','maxlength="150"')}${field('Kalimat Penghargaan','body','text','Atas partisipasinya dalam program pelatihan:','maxlength="180"')}${field('Nama Pelatihan di Sertifikat','course','text','','required maxlength="150"')}<div class="field"><label for="pred">Predikat</label><select id="pred" name="predicate"><option>EXCELLENT</option><option>VERY GOOD</option><option>GOOD</option><option>PARTICIPANT</option></select></div>${field('Tempat','place','text','Lombok Tengah','maxlength="60"')}${field('Tanggal Terbit','issued','date',new Date().toISOString().slice(0,10),'required')}${field('Logo Utama (default logo CMS Anda)','main','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="main"')}${field('Logo Mitra (opsional)','partner','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="partner"')}${field('Nama Penandatangan Kiri','leftName','text','','maxlength="100"')}${field('Jabatan Kiri','leftTitle','text','','maxlength="100"')}${field('Tanda Tangan Kiri (opsional)','left','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="left"')}${field('Nama Penandatangan Kanan','rightName','text',author,'maxlength="100"')}${field('Jabatan Kanan','rightTitle','text','Direktur Haura Institute','maxlength="100"')}${field('Tanda Tangan Kanan (opsional)','right','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="right"')}${submit('Terbitkan & Kirim Sertifikat','green')}<p><button class="button" type="button" data-action="preview-pdf">Unduh Preview PDF</button></p></form><div class="cert-scroll"><div id="certificate-preview" class="certificate"></div></div></div>`;
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
  el.innerHTML=`<div><div class="cert-logos"><img src="${esc(certImages.main)}" alt="Logo Haura">${certImages.partner?`<img src="${esc(certImages.partner)}" alt="Logo mitra">`:''}</div><h2>${esc(c.heading)}</h2><span class="cert-sub">${esc(c.subtitle)}</span></div><div><p>${esc(c.intro)}</p><h3>${esc(u?.name||'Nama Peserta')}</h3><p>${esc(u?.institution||'Instansi Peserta')}</p><p>${esc(c.body)}</p><div class="cert-course">${esc(c.course||'Nama Program Pelatihan')}</div><p>Predikat: <b>${esc(c.predicate)}</b></p></div><div><p>${esc(c.place)}, ${esc(c.issued?new Date(c.issued+'T12:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}):'')}</p><div class="cert-signatures">${sign('left',c.leftName,c.leftTitle)}${sign('right',c.rightName,c.rightTitle)}</div><p class="cert-meta">No. ${esc(c.serial)} · Diterbitkan Haura Institute</p></div>`;
}
async function captureCertificate(){const {html2canvas}=await import('../vendor/pdf.js');await document.fonts.ready;const node=$('#certificate-preview');await Promise.all([...node.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));return html2canvas(node,{scale:2,backgroundColor:'#fff',useCORS:false,logging:false,windowWidth:1500});}
async function pdfDownload(source,title){const {jsPDF}=await import('../vendor/pdf.js');const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});pdf.addImage(source,'JPEG',0,0,297,210);pdf.save(`${title.replace(/[^a-z0-9_-]/gi,'_').slice(0,90)}.pdf`);}

async function doAction(action,el){
  if(action==='login')return loginForm();if(action==='register')return registerForm();if(action==='close-modal')return close();if(action==='install-help')return installHelp();
  if(action==='privacy')return modal('Privasi & Ketentuan Penggunaan',`<div class="privacy">${esc(privacyText)}</div>`);
  if(action==='logout'){ready();await B.F.signOut(B.authInstance());close();toast('Anda telah keluar.');return;}
  if(action==='dashboard')return dashboard();
  if(action==='change-password'){ready();if(!me)throw new Error('Silakan masuk.');return modal('Ganti Password',B.accountFrame('change'));}
  if(action==='reset-member'){adminOnly();return modal('Konfirmasi Reset',`<p>Reset mencabut semua sesi peserta. Sampaikan password sementara melalui kontak yang sudah Anda verifikasi.</p><button class="button danger" data-action="confirm-reset" data-id="${esc(el.dataset.id)}">Buat Password Sementara</button>`);}
  if(action==='confirm-reset'){adminOnly();const result=await B.resetMember(el.dataset.id);return modal('Password Sementara',`<p>Salin sekarang, lalu kirim melalui kontak peserta yang terverifikasi. Password ini tidak akan ditampilkan ulang.</p><code style="word-break:break-all">${esc(result.temporary)}</code><p>Peserta wajib menggantinya saat masuk.</p>`);}
  if(action==='upload-profile'){ready();return modal('Perbarui Pas Foto',`<form data-form="upload-profile">${field('Foto Profil (maksimal 5 MB)','photo','file','','required accept="image/jpeg,image/png,image/webp"')}${submit('Unggah Pas Foto')}</form>`);}
  if(action==='refresh-auth'){await B.F.reload(me);await B.F.getIdTokenResult(me,true);await handleSession(B.authInstance().currentUser);return;}
  if(action==='tab'){member();chatStop?.();chatStop=null;tab=el.dataset.id;tabsRender();renderTab(true);return;}
  if(action==='enroll'){if(!me)return loginForm();member();return openPaidEnrollModal(el.dataset.id);}
  if(action==='pay-installment'){member();return openInstallmentModal(el.dataset.id);}
  if(action==='review-payment'){adminOnly();return openReviewPaymentModal(el.dataset.enr,el.dataset.pay);}
  if(action==='confirm-payment'||action==='reject-payment'){
    adminOnly();
    const note=$('#reviewNote')?.value||'';
    if(action==='reject-payment'&&!note.trim())throw new Error('Isi alasan penolakan pada kolom Catatan Admin.');
    await B.confirmPayment({enrollmentId:el.dataset.enr,paymentId:el.dataset.pay,decision:action==='confirm-payment'?'confirmed':'rejected',note});
    close();
    return toast(action==='confirm-payment'?'Pembayaran dikonfirmasi masuk kas.':'Bukti pembayaran ditolak.');
  }
  if(action==='grade-enrollment'){adminOnly();return openGradeModal(el.dataset.id);}
  if(action==='delete-expense'){adminOnly();await B.removeExpense(el.dataset.id);return toast('Catatan pengeluaran dihapus.');}
  if(action==='reset-logo'){adminOnly();await B.patch('settings','public',{logoPath:'',updatedAt:B.stamp()});return toast('Logo dikembalikan ke bawaan.');}
  if(action==='remove-qris'){adminOnly();await B.patch('settings','public',{qrisPath:'',updatedAt:B.stamp()});return toast('Gambar QRIS dihapus.');}
  if(action==='soap'){member();if(!profile.chatAccess)throw new Error('Akses chat belum aktif.');return soapForm();}
  if(action==='open-chat'){adminOnly();const u=state.users.find(u=>u.id===el.dataset.id);createRoom(u.id,u.name);return renderChatUsers();}
  if(action==='older-chat'){messageLimit=Math.min(messageLimit+100,1000);watchMessages();return toast(`Memuat hingga ${messageLimit} pesan terbaru.`);}
  if(action==='download-cert'){member();const c=state.certificates.find(c=>c.id===el.dataset.id);if(!c||c.locked)throw new Error('Sertifikat terkunci sampai pelunasan.');const url=await B.fileURL(c.imagePath);const response=await fetch(url);const source=await blobData(await response.blob());await pdfDownload(source,c.title);return;}
  if(action==='preview-pdf'){adminOnly();toast('Menyiapkan PDF…');const canvas=await captureCertificate();return pdfDownload(canvas.toDataURL('image/jpeg',.96),'Sertifikat_Preview');}
  if(action==='approve-user'||action==='reject-user'){adminOnly();await B.patch('users',el.dataset.id,{status:action==='approve-user'?'approved':'rejected',chatAccess:action==='approve-user',updatedAt:B.stamp()});return toast('Status akun diperbarui.');}
  if(['archive-program','archive-news','delete-module'].includes(action)){adminOnly();return modal('Konfirmasi Perubahan',`<p>${action==='delete-module'?'Cabut akses modul ini dari portal?':'Arsipkan item ini dari publikasi? Data pendaftaran lama tetap tersimpan.'}</p><button class="button danger" data-action="confirm-change" data-kind="${action}" data-id="${esc(el.dataset.id)}">Ya, Lanjutkan</button>`);}
  if(action==='confirm-change'){adminOnly();const kind=el.dataset.kind;if(kind==='delete-module')await B.remove('ebooks',el.dataset.id);else await B.patch(kind==='archive-program'?'programs':'news',el.dataset.id,{published:false,updatedAt:B.stamp()});close();if(tab==='cms')renderCMS();if(tab==='modules-admin')setTimeout(renderModuleAdmin,200);return toast('Perubahan tersimpan.');}
  if(action==='edit-program'){
    adminOnly();
    const p=state.programs.find(p=>p.id===el.dataset.id);
    const fee=HauraFinance.programFee(p), minDp=HauraFinance.programMinDp(p);
    return modal('Edit Program & Biaya',`<form data-form="edit-program" data-id="${esc(p.id)}">
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
  if(type==='upload-profile'){if(!me)throw new Error('Silakan masuk.');const path=`profiles/${me.uid}/${uid()}`;await B.upload(path,d.get('photo'));await B.patch('users',me.uid,{photoPath:path});close();toast('Pas foto diperbarui.');return;}
  member();

  if(type==='paid-enroll'){
    const file=d.get('proof');
    const path=`proofs/${me.uid}/${uid()}`;
    toast('Mengunggah bukti pembayaran…');
    await B.upload(path,file);
    await B.paidEnroll({programId:form.dataset.id,amount:Number(d.get('amount')),proofPath:path});
    close();
    tab='catalog';
    dashboard();
    return toast('Pendaftaran berhasil dikirim. Menunggu konfirmasi admin.');
  }

  if(type==='submit-installment'){
    const file=d.get('proof');
    const path=`proofs/${me.uid}/${uid()}`;
    toast('Mengunggah bukti pelunasan…');
    await B.upload(path,file);
    await B.submitPayment({enrollmentId:form.dataset.id,amount:Number(d.get('amount')),proofPath:path});
    close();
    return toast('Bukti pelunasan terkirim. Menunggu verifikasi admin.');
  }

  if(type==='chat'||type==='soap'){
    if(!admin&&!profile.chatAccess)throw new Error('Akses chat belum aktif.');const data={senderId:me.uid,senderRole:admin?'admin':'peserta',kind:type==='soap'?'soap':'text',text:type==='chat'?String(d.get('text')).trim():'',createdAt:B.stamp()};
    if(type==='chat'&&!data.text)return;if(type==='soap')data.soap=Object.fromEntries(['s','o','a','p'].map(k=>[k,String(d.get(k)).trim()]));await B.add(`conversations/${targetChat}/messages`,data);form.reset();if(type==='soap'){close();toast('Laporan SOAP terkirim.');}return;
  }

  adminOnly();

  if(type==='finance-config'){
    let qrisPath=state.cms.qrisPath||'';
    const qrisFile=d.get('qris');
    if(qrisFile && qrisFile.size>0){
      qrisPath=`public/qris/${uid()}`;
      toast('Mengunggah barcode QRIS…');
      await B.upload(qrisPath,qrisFile);
    }
    await B.patch('settings','public',{qrisPath,paymentInfo:String(d.get('paymentInfo')||'').trim(),updatedAt:B.stamp()});
    return toast('Pengaturan QRIS & rekening tersimpan.');
  }

  if(type==='add-expense'){
    await B.addExpense({programId:d.get('programId'),category:d.get('category'),description:d.get('description'),amount:Number(d.get('amount')),date:d.get('date')});
    form.reset();
    return toast('Pengeluaran tercatat di rekap kas.');
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
      toast('Mengunggah logo baru…');
      await B.upload(logoPath,logoFile);
    }
    await B.create('settings','public',{
      logoText:d.get('logoText').trim(),
      logoPath,
      welcomeTitle:d.get('welcomeTitle').trim(),
      welcomeText:d.get('welcomeText').trim(),
      chatFee:0,
      qrisPath:state.cms.qrisPath||'',
      paymentInfo:state.cms.paymentInfo||'',
      videoPath:'',
      videoUrl:safeURL(d.get('videoUrl')),
      updatedAt:B.stamp()
    });
    toast('Pengaturan & logo tersimpan.');
    return;
  }

  if(type==='program'||type==='edit-program'){
    const totalFee=Number(d.get('totalFee')||0);
    const minDownPayment=Number(d.get('minDownPayment')||0);
    if(minDownPayment>totalFee)throw new Error('Minimal pembayaran pendaftaran tidak boleh melebihi total biaya.');
    const data={title:d.get('title').trim(),description:d.get('description').trim(),totalFee,minDownPayment,price:totalFee,published:true,updatedAt:B.stamp()};
    if(type==='program')await B.add('programs',{...data,createdAt:B.stamp()});
    else await B.patch('programs',form.dataset.id,data);
    if(type==='program')form.reset();else close();
    toast('Program berbayar tersimpan.');
    return;
  }

  if(type==='news'){await B.add('news',{title:d.get('title').trim(),content:d.get('content').trim(),published:true,createdAt:B.stamp()});form.reset();toast('Berita dipublikasikan.');return;}
  if(type==='module'){const url=safeURL(d.get('url'));if(!url)throw new Error('Tautan modul wajib HTTPS.');await B.add('ebooks',{title:d.get('title').trim(),url,userId:d.get('userId'),createdAt:B.stamp()});form.reset();toast('Modul dibagikan.');setTimeout(renderModuleAdmin,200);return;}

  if(type==='publish-cert'){
    const c=certificateData();
    const enr=state.enrollments.find(e=>e.id===c.enrollmentId);
    if(!enr)throw new Error('Pilih peserta dan program yang sudah lunas.');
    if(!HauraFinance.isPaidFull(enr))throw new Error('Peserta belum melunasi biaya pelatihan.');
    toast('Memproses sertifikat resolusi tinggi…');
    const canvas=await captureCertificate();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));
    const id=uid(),path=`certificates/${enr.userId}/${id}`;
    await B.upload(path,blob,['image/jpeg'],10*1024*1024);
    await B.create('certificates',id,{userId:enr.userId,programId:enr.programId,enrollmentId:enr.id,title:c.course,serial:c.serial,imagePath:path,createdAt:B.stamp(),issuedBy:me.uid});
    toast('Sertifikat diterbitkan ke akun peserta.');
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
    if(!await B.init()){const notice=$('#setup-status');notice.hidden=false;notice.textContent='Mode persiapan — isi satu URL Apps Script di js/drive-config.js, lalu ikuti PANDUAN.html. Tidak ada akun demo.';publicRender();return;}
    if(!B.storageConfigured){const notice=$('#setup-status');notice.hidden=false;notice.textContent='Hubungkan URL Apps Script di js/drive-config.js.';}
    publicSubscriptions.push(B.F.onSnapshot(B.F.doc(B.dbInstance(),'settings','public'),snap=>{if(snap.exists())state.cms={...state.cms,...snap.data()};publicRender();},fail));
    for(const key of ['programs','news'])publicSubscriptions.push(B.watch(key,[B.F.where('published','==',true)],rows=>{state[key]=rows;publicRender();refreshSection();},fail));
    B.F.onAuthStateChanged(B.authInstance(),user=>{if(!registering)handleSession(user);});
  }catch(e){const notice=$('#setup-status');notice.hidden=false;notice.textContent='Portal belum terhubung. Periksa konfigurasi dan internet. '+(B?.errorMessage(e)||e.message);publicRender();}
}
start();

document.addEventListener('haura-account-complete',()=>{close();toast('Akun tersambung.');});
