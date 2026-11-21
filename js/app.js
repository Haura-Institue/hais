import {installHelp} from './pwa.js';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = v => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v)||0);
const date = v => v?.toDate ? v.toDate().toLocaleString('id-ID') : '';
const uid = () => crypto.randomUUID();
const author = 'Ns. Ahmad Fudhali, S.Kep.M.Tr.Kep.';
let B, me=null, profile=null, admin=false, registering=false, session=0, tab='catalog', targetChat='', chatStop=null, ownStop=null, subscriptions=[], publicSubscriptions=[], messageLimit=100, toastTimer;
let state={cms:{logoText:'HAURA',welcomeTitle:'Tumbuh bersama. Merawat lebih baik.',welcomeText:'Pelatihan keperawatan, modul pembelajaran, dan diskusi profesional dalam satu portal.',chatFee:0,videoUrl:'',videoPath:'',qrisPath:''},programs:[],news:[],users:[],enrollments:[],payments:[],ebooks:[],certificates:[],messages:[]};
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
  document.querySelectorAll('[data-file]').forEach(async el=>{const path=el.dataset.file; el.removeAttribute('data-file');try{const u=await B.fileURL(path); if(el.isConnected) el.src=u;}catch(e){if(el.isConnected){el.alt='Berkas tidak dapat dimuat — periksa akses/CORS';el.title=B.errorMessage(e);}}});
}
function showLanding(){ $('#landing-view').hidden=false; $('#portal-view').hidden=true; }
function publicRender(){
  $('#brand-text').textContent=state.cms.logoText||'HAURA';
  if(B?.configured){$('#hero-title').textContent=state.cms.welcomeTitle;$('#hero-description').textContent=state.cms.welcomeText;}
  const video=$('#hero-video'), drivePath=state.cms.videoPath||'', url=drivePath ? '' : safeURL(state.cms.videoUrl);
  if(drivePath&&B?.storageConfigured) B.fileURL(drivePath).then(u=>{if(state.cms.videoPath!==drivePath)return;if(video.getAttribute('src')!==u)video.src=u;video.hidden=false;$('#hero-logo').hidden=true;}).catch(fail);
  if(url&&video.getAttribute('src')!==url)video.src=url;
  if(!url&&!drivePath){video.pause();video.removeAttribute('src');}
  video.hidden=!url; $('#hero-logo').hidden=!!url;
  $('#public-programs').innerHTML=state.programs.length ? state.programs.map(p=>`<details><summary>${esc(p.title)}</summary><p>${esc(p.description)}</p><div class="row spread"><span class="price">Tanpa pembayaran</span><button class="button small" data-action="enroll" data-id="${esc(p.id)}">Daftar Pelatihan</button></div></details>`).join(''):empty(B?.configured?'Belum ada program yang dipublikasikan.':'Katalog akan tampil setelah Apps Script disambungkan.');
  $('#public-news').innerHTML=state.news.length?state.news.map(n=>`<details><summary>${esc(n.title)}</summary><p>${esc(n.content)}</p><small class="muted">${date(n.createdAt)}</small></details>`).join(''):empty('Belum ada informasi terbaru.');
}
function navRender(){
  $('#auth-nav').innerHTML=me?`<span class="muted" style="color:#d2e2e8">${esc(profile?.name||me.email)}</span><button class="button light compact" data-action="dashboard">Dashboard</button><button class="button ghost compact" data-action="upload-profile">Foto</button><button class="button ghost compact" data-action="change-password">Ganti Password</button><button class="button ghost compact" data-action="logout">Keluar</button>`:'<button class="button ghost compact" data-action="login">Masuk Portal</button><button class="button light compact" data-action="register">Pendaftaran</button>';
}
const memberTabs=[['catalog','Katalog Pelatihan'],['modules','Modul Saya'],['certificates','Sertifikat'],['chat','Diskusi Profesional']];
const adminTabs=[['validation','Validasi Data'],['cms','CMS Web'],['modules-admin','Distribusi Modul'],['cert-admin','Sertifikat'],['chat-admin','Chat Berkala']];
function pendingCount(){return state.users.filter(u=>u.status==='pending').length+state.enrollments.filter(e=>e.status==='pending').length+state.payments.filter(p=>p.status==='pending').length;}
function tabsRender(){ $('#tabs').innerHTML=(admin?adminTabs:memberTabs).map(([id,label])=>`<button data-action="tab" data-id="${id}" aria-selected="${tab===id}">${label}${id==='validation'&&pendingCount()?`<span class="badge">${pendingCount()}</span>`:''}</button>`).join(''); }
function dashboard(){
  if(!me)return loginForm();$('#landing-view').hidden=true;$('#portal-view').hidden=false;
  $('#portal-heading').innerHTML=`<span class="eyebrow green">${admin?'PUSAT KENDALI ADMIN':'PORTAL PESERTA'}</span><h2>Selamat datang, ${esc(profile?.name||me.email)}</h2><p class="muted">${admin?'Kelola pelatihan, pembelajaran, dan layanan profesional.':'Ruang belajar dan pengembangan kompetensi Anda.'}</p>`;
  if(!profile){$('#tabs').innerHTML='';$('#portal-content').innerHTML=profileForm();return;}
  if(!admin&&(profile.status!=='approved')){
    $('#tabs').innerHTML='';$('#portal-content').innerHTML=`<h2>Status Pendaftaran</h2><p>${status(profile.status)}</p><p class="muted">Email hanya identitas login; tidak perlu verifikasi email. Persetujuan akun dilakukan oleh admin.</p><button class="button" data-action="refresh-auth">Periksa Status</button> <button class="button" data-action="upload-profile">Perbarui Pas Foto</button><p class="muted">Akun yang ditolak dapat menghubungi pengelola Haura Institute. Jangan mengunggah data pasien ke profil.</p>`;return;
  }
  tabsRender();renderTab(true);
}
function renderTab(fresh=false){
  if($('#portal-view').hidden||!profile)return;
  const root=$('#portal-content');
  if(tab==='catalog')renderCatalog();
  if(tab==='validation')renderValidation();
  if(tab==='modules')root.innerHTML=`<h2>Modul & E-Book Saya</h2><p class="muted">Materi yang dibagikan oleh admin.</p><div class="cards">${state.ebooks.length?state.ebooks.map(b=>`<article class="card"><h3>${esc(b.title)}</h3><a class="button" href="${esc(safeURL(b.url))}" target="_blank" rel="noopener noreferrer">Buka Modul ↗</a></article>`).join(''):empty('Belum ada modul yang dibagikan.')}</div>`;
  if(tab==='certificates')root.innerHTML=`<h2>Sertifikat Profesional</h2><p class="muted">Dokumen diterbitkan oleh admin Haura Institute.</p><div class="stack">${state.certificates.length?state.certificates.map(c=>`<article class="card"><h3>${esc(c.title)}</h3><p>No. ${esc(c.serial)} · ${date(c.createdAt)}</p>${img(c.imagePath,'certificate-image','Sertifikat '+c.title)}<button class="button" data-action="download-cert" data-id="${esc(c.id)}">↓ Unduh Sertifikat PDF</button></article>`).join(''):empty('Sertifikat belum diterbitkan.')}</div>`;
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
  if(['catalog','validation','modules','certificates'].includes(tab))renderTab();
  if(tab==='chat-admin')renderChatUsers();
}
function stopPrivate(){ $('#portal-content').innerHTML=''; $('#portal-heading').innerHTML=''; $('#tabs').innerHTML=''; certImages={main:'./assets/logo.png',partner:'',left:'',right:''}; subscriptions.forEach(s=>s());subscriptions=[];ownStop?.();ownStop=null;chatStop?.();chatStop=null;state.users=[];state.enrollments=[];state.payments=[];state.ebooks=[];state.certificates=[];state.messages=[];targetChat='';B?.clearFiles();}
function listen(c,filters,key,extra){subscriptions.push(B.watch(c,filters,rows=>{state[key]=rows;extra?.();refreshSection();},fail));}
function startPrivate(){
  subscriptions.forEach(s=>s());subscriptions=[];
  if(!profile||(!admin&&(profile.status!=='approved')))return;
  const own=[B.F.where('userId','==',me.uid)];
  if(admin)listen('users',[],'users');
  listen('enrollments',admin?[]:own,'enrollments');
  listen('chatPayments',admin?[]:own,'payments',()=>{if(tab==='chat'&&!$('#portal-view').hidden)renderChatGate();});
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
      if(!old||old.status!==profile?.status||old.chatAccess!==profile?.chatAccess){startPrivate();if(!registering){tab=admin?'validation':'catalog';dashboard();}}
    },fail);
    profile=await B.read('users',user.uid);if(epoch!==session)return;
    startPrivate();tab=admin?'validation':'catalog';navRender();if(!registering)dashboard();
  }catch(e){fail(e);}
}
function loginForm(){ready();modal('Masuk Portal',B.accountFrame('login'));}
function profileFields(){return `${field('Nama Lengkap & Gelar','name','text','','required maxlength="150" autocomplete="name"')}${field('Tanggal Lahir','dob','date','','required')}${field('Instansi / Rumah Sakit','institution','text','','required maxlength="160"')}${area('Alamat Domisili','address','','required maxlength="500"')}${field('Pas Foto Resmi (JPG/PNG/WebP, maksimal 5 MB)','photo','file','','required accept="image/jpeg,image/png,image/webp"')}`;}
function profileForm(){return '<p>Profil belum tersedia. Hubungi pengelola.</p>';}
function registerForm(){ready();modal('Daftar Peserta',B.accountFrame('register'));}
function renderCatalog(){ $('#portal-content').innerHTML='<h2>Katalog Program & Pendaftaran</h2><p class="muted">Pendaftaran tanpa transaksi pembayaran.</p><div class="cards">'+(state.programs.map(p=>{const joined=state.enrollments.some(e=>e.programId===p.id);return `<article class="card"><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><button class="button" data-action="enroll" data-id="${esc(p.id)}" ${joined?'disabled':''}>${joined?'Sudah Terdaftar':'Ikuti Program'}</button></article>`;}).join('')||empty('Belum ada program.'))+'</div>'; }

function renderValidation(){const list=state.users.filter(u=>u.id!==me.uid);$('#portal-content').innerHTML='<h2>Kelola Akun Peserta</h2><p class="muted">Periksa pendaftar secara manual sebelum mengaktifkan. Email tidak diverifikasi otomatis.</p><div class="cards">'+(list.map(u=>`<article class="card"><div class="row">${img(u.photoPath)}<div><b>${esc(u.name)}</b><p>${esc(u.email)}<br>${esc(u.institution)}</p></div></div><p>${status(u.status)}</p><div class="row"><button class="button green small" data-action="approve-user" data-id="${esc(u.id)}">Aktifkan Akun</button><button class="button danger small" data-action="reject-user" data-id="${esc(u.id)}">Nonaktifkan</button><button class="button small" data-action="reset-member" data-id="${esc(u.id)}">Reset Password</button></div></article>`).join('')||empty('Belum ada peserta.'))+'</div>';hydrate();}

function renderCMS(){const c=state.cms;$('#portal-content').innerHTML=`<h2>Pengaturan Beranda & Konten</h2><form data-form="cms" class="card">${field('Teks brand','logoText','text',c.logoText,'required maxlength="30"')}${field('Judul beranda','welcomeTitle','text',c.welcomeTitle,'required maxlength="180"')}${area('Deskripsi','welcomeText',c.welcomeText,'required maxlength="2000"')}${field('URL video HTTPS langsung (opsional)','videoUrl','url',c.videoUrl)}${submit('Simpan Pengaturan')}</form><h3>Tambah Program Gratis</h3><form data-form="program" class="card">${field('Nama program','title','text','','required maxlength="180"')}${area('Deskripsi','description','','required maxlength="3000"')}${submit('Tambah Program')}</form><div class="cards">${state.programs.map(p=>`<article class="card"><b>${esc(p.title)}</b><p>${esc(p.description)}</p><button class="button small" data-action="edit-program" data-id="${esc(p.id)}">Edit</button> <button class="button small danger" data-action="archive-program" data-id="${esc(p.id)}">Arsipkan</button></article>`).join('')}</div><h3>Tambah Berita</h3><form data-form="news" class="card">${field('Judul','title','text','','required maxlength="180"')}${area('Isi','content','','required maxlength="5000"')}${submit('Publikasikan Berita')}</form><div class="cards">${state.news.map(n=>`<article class="card"><b>${esc(n.title)}</b><button class="button small danger" data-action="archive-news" data-id="${esc(n.id)}">Arsipkan</button></article>`).join('')}</div>`;}

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
function soapForm(){modal('Laporan SOAP Keperawatan',`<p class="form-message">Jangan masukkan nama pasien, NIK, nomor rekam medis, alamat, atau foto identitas. Gunakan kode kasus anonim. SOAP dan SBAR adalah format berbeda; formulir ini menggunakan SOAP.</p><form data-form="soap">${area('S — Subjektif / Keluhan','s','','required maxlength="2000"')}${area('O — Objektif / Data Klinis','o','','required maxlength="2000"')}${area('A — Assessment / Masalah','a','','required maxlength="2000"')}${area('P — Plan / Tindakan','p','','required maxlength="2000"')}<label class="check-label"><input type="checkbox" name="consent" required> Data sudah dianonimkan dan saya berwenang membagikannya untuk diskusi profesional.</label>${submit('Kirim Laporan SOAP','green')}</form>`);}
const privacyText=`Haura Institute menyimpan profil, keanggotaan program, sertifikat, dan diskusi di Google Drive privat. Google Apps Script memeriksa sesi dan persetujuan admin. Password diproses pada formulir Google Apps Script, di-hash PBKDF2 dengan salt, dan tidak disimpan sebagai teks biasa. Email hanya identitas akun, bukan bukti kepemilikan email. Tidak ada email verifikasi/reset otomatis. Sesi disimpan di memori tab, berakhir maksimal 8 jam, dan hilang saat halaman dimuat ulang. Pengelola bertanggung jawab memverifikasi peserta, menetapkan retensi, kontak resmi, backup, dan penghapusan. Versi GitHub adalah portal pembelajaran nontransaksi; jangan memasukkan identitas pasien/rekam medis. Modul eksternal mengikuti izin pemilik dokumen. Bukan layanan darurat atau sistem rekam medis. Aplikasi by. ${author}`;
function renderCertificateEditor(){
  certSerial=`HI-${new Date().getFullYear()}-${uid().slice(0,8).toUpperCase()}`;
  $('#portal-content').innerHTML=`<h2>Generator Sertifikat</h2><p class="muted">Isi identitas penandatangan yang sah. Sertifikat berupa dokumen visual; bukan tanda tangan elektronik tersertifikasi atau bukti akreditasi otomatis.</p><div class="cert-grid"><form id="certificate-form" data-form="publish-cert" class="card"><div class="field"><label for="cert-user">Peserta</label><select id="cert-user" name="userId" required>${userOptions()}</select></div>${field('Nomor Sertifikat','serial','text',certSerial,'required maxlength="80"')}${field('Nama Institusi','heading','text','HAURA INSTITUTE','required maxlength="80"')}${field('Subjudul','subtitle','text','Center of Medical Excellence','maxlength="100"')}${field('Kalimat Pembuka','intro','text','Diberikan kepada:','maxlength="150"')}${field('Kalimat Penghargaan','body','text','Atas partisipasinya dalam program pelatihan:','maxlength="180"')}${field('Nama Pelatihan','course','text','','required maxlength="150"')}<div class="field"><label for="pred">Predikat</label><select id="pred" name="predicate"><option>EXCELLENT</option><option>VERY GOOD</option><option>GOOD</option><option>PARTICIPANT</option></select></div>${field('Tempat','place','text','Lombok Tengah','maxlength="60"')}${field('Tanggal Terbit','issued','date',new Date().toISOString().slice(0,10),'required')}${field('Logo Utama (default logo Anda)','main','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="main"')}${field('Logo Mitra (opsional)','partner','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="partner"')}${field('Nama Penandatangan Kiri','leftName','text','','maxlength="100"')}${field('Jabatan Kiri','leftTitle','text','','maxlength="100"')}${field('Tanda Tangan Kiri (opsional)','left','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="left"')}${field('Nama Penandatangan Kanan','rightName','text',author,'maxlength="100"')}${field('Jabatan Kanan','rightTitle','text','Direktur Haura Institute','maxlength="100"')}${field('Tanda Tangan Kanan (opsional)','right','file','','accept="image/jpeg,image/png,image/webp" data-cert-image="right"')}${submit('Terbitkan & Kirim Sertifikat','green')}<p><button class="button" type="button" data-action="preview-pdf">Unduh Preview PDF</button></p></form><div class="cert-scroll"><div id="certificate-preview" class="certificate"></div></div></div>`;updateCertificate();
}
function certificateData(){const f=$('#certificate-form');return f?Object.fromEntries(new FormData(f)):{};}
function updateCertificate(){const el=$('#certificate-preview');if(!el)return;const c=certificateData(),u=state.users.find(u=>u.id===c.userId);const sign=(key,name,title)=>`<div>${certImages[key]?`<img src="${esc(certImages[key])}" alt="Tanda tangan">`:'<div class="signature-space"></div>'}<b>${esc(name||'________________________')}</b><span>${esc(title)}</span></div>`;
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
  if(action==='enroll'){if(!me)return loginForm();member();await B.enroll(el.dataset.id);return toast('Pendaftaran program tersimpan.');}
  if(action==='soap'){member();if(!profile.chatAccess)throw new Error('Akses chat belum aktif.');return soapForm();}
  if(action==='open-chat'){adminOnly();const u=state.users.find(u=>u.id===el.dataset.id);createRoom(u.id,u.name);return renderChatUsers();}
  if(action==='older-chat'){messageLimit=Math.min(messageLimit+100,1000);watchMessages();return toast(`Memuat hingga ${messageLimit} pesan terbaru.`);}
  if(action==='download-cert'){member();const c=state.certificates.find(c=>c.id===el.dataset.id);const url=await B.fileURL(c.imagePath);const response=await fetch(url);const source=await blobData(await response.blob());await pdfDownload(source,c.title);return;}
  if(action==='preview-pdf'){adminOnly();toast('Menyiapkan PDF…');const canvas=await captureCertificate();return pdfDownload(canvas.toDataURL('image/jpeg',.96),'Sertifikat_Preview');}
  if(action==='approve-user'||action==='reject-user'){adminOnly();await B.patch('users',el.dataset.id,{status:action==='approve-user'?'approved':'rejected',chatAccess:action==='approve-user',updatedAt:B.stamp()});return toast('Status akun diperbarui.');}
  if(['archive-program','archive-news','delete-module'].includes(action)){adminOnly();return modal('Konfirmasi Perubahan',`<p>${action==='delete-module'?'Cabut akses modul ini dari portal?':'Arsipkan item ini dari publikasi? Data pendaftaran lama tetap tersimpan.'}</p><button class="button danger" data-action="confirm-change" data-kind="${action}" data-id="${esc(el.dataset.id)}">Ya, Lanjutkan</button>`);}
  if(action==='confirm-change'){adminOnly();const kind=el.dataset.kind;if(kind==='delete-module')await B.remove('ebooks',el.dataset.id);else await B.patch(kind==='archive-program'?'programs':'news',el.dataset.id,{published:false,updatedAt:B.stamp()});close();if(tab==='cms')renderCMS();if(tab==='modules-admin')setTimeout(renderModuleAdmin,200);return toast('Perubahan tersimpan.');}
  if(action==='edit-program'){adminOnly();const p=state.programs.find(p=>p.id===el.dataset.id);return modal('Edit Program',`<form data-form="edit-program" data-id="${esc(p.id)}">${field('Nama Program','title','text',p.title,'required maxlength="180"')}${area('Deskripsi','description',p.description,'required maxlength="3000"')}${submit()}</form>`);}
}
function blobData(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});}
async function doSubmit(form){
  const type=form.dataset.form,d=new FormData(form);ready();
  if(type==='upload-profile'){if(!me)throw new Error('Silakan masuk.');const path=`profiles/${me.uid}/${uid()}`;await B.upload(path,d.get('photo'));await B.patch('users',me.uid,{photoPath:path});close();toast('Pas foto diperbarui.');return;}
  member();
  if(type==='chat'||type==='soap'){
    if(!admin&&!profile.chatAccess)throw new Error('Akses chat belum aktif.');const data={senderId:me.uid,senderRole:admin?'admin':'peserta',kind:type==='soap'?'soap':'text',text:type==='chat'?String(d.get('text')).trim():'',createdAt:B.stamp()};
    if(type==='chat'&&!data.text)return;if(type==='soap')data.soap=Object.fromEntries(['s','o','a','p'].map(k=>[k,String(d.get(k)).trim()]));await B.add(`conversations/${targetChat}/messages`,data);form.reset();if(type==='soap'){close();toast('Laporan SOAP terkirim.');}return;
  }
  adminOnly();
  if(type==='cms'){await B.create('settings','public',{logoText:d.get('logoText').trim(),welcomeTitle:d.get('welcomeTitle').trim(),welcomeText:d.get('welcomeText').trim(),chatFee:0,qrisPath:'',videoPath:'',videoUrl:safeURL(d.get('videoUrl')),updatedAt:B.stamp()});toast('Pengaturan tersimpan.');return;}
  if(type==='program'||type==='edit-program'){const data={title:d.get('title').trim(),description:d.get('description').trim(),price:0,published:true,updatedAt:B.stamp()};if(type==='program')await B.add('programs',{...data,createdAt:B.stamp()});else await B.patch('programs',form.dataset.id,data);if(type==='program')form.reset();else close();toast('Program tersimpan.');return;}
  if(type==='news'){await B.add('news',{title:d.get('title').trim(),content:d.get('content').trim(),published:true,createdAt:B.stamp()});form.reset();toast('Berita dipublikasikan.');return;}
  if(type==='module'){const url=safeURL(d.get('url'));if(!url)throw new Error('Tautan modul wajib HTTPS.');await B.add('ebooks',{title:d.get('title').trim(),url,userId:d.get('userId'),createdAt:B.stamp()});form.reset();toast('Modul dibagikan.');setTimeout(renderModuleAdmin,200);return;}
  if(type==='publish-cert'){
    const c=certificateData(),user=state.users.find(u=>u.id===c.userId);if(!user)throw new Error('Pilih peserta.');toast('Memproses sertifikat resolusi tinggi…');const canvas=await captureCertificate();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));const id=uid(),path=`certificates/${c.userId}/${id}`;await B.upload(path,blob,['image/jpeg'],10*1024*1024);await B.create('certificates',id,{userId:c.userId,title:c.course,serial:c.serial,imagePath:path,createdAt:B.stamp(),issuedBy:me.uid});toast('Sertifikat diterbitkan ke akun peserta.');return;
  }
}
document.addEventListener('click',async event=>{const el=event.target.closest('[data-action]');if(!el)return;event.preventDefault();if(el.disabled)return;el.disabled=true;try{await doAction(el.dataset.action,el);}catch(e){fail(e);}finally{el.disabled=false;}});
document.addEventListener('submit',async event=>{const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();const button=form.querySelector('[type=submit]');if(button?.disabled)return;if(button)button.disabled=true;try{await doSubmit(form);}catch(e){fail(e);}finally{if(button)button.disabled=false;}});
document.addEventListener('input',event=>{if(event.target.closest('#certificate-form'))updateCertificate();});
document.addEventListener('change',async event=>{const el=event.target;if(!el.dataset.certImage)return;try{const file=el.files[0];if(file){B.validateFile(file);certImages[el.dataset.certImage]=await blobData(file);updateCertificate();}}catch(e){fail(e);el.value='';}});
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
