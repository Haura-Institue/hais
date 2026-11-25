export const HauraFinance = {
  money(v) {
    return 'Rp ' + Math.round(Number(v || 0)).toLocaleString('id-ID');
  },
  terbilang(n) {
    const num = Math.floor(Math.abs(Number(n || 0)));
    if (num === 0) return 'Nol Rupiah';
    const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
    const sebut = (x) => {
      if (x < 12) return satuan[x];
      if (x < 20) return sebut(x - 10) + ' Belas';
      if (x < 100) return sebut(Math.floor(x / 10)) + ' Puluh' + (x % 10 ? ' ' + sebut(x % 10) : '');
      if (x < 200) return 'Seratus' + (x - 100 ? ' ' + sebut(x - 100) : '');
      if (x < 1000) return sebut(Math.floor(x / 100)) + ' Ratus' + (x % 100 ? ' ' + sebut(x % 100) : '');
      if (x < 2000) return 'Seribu' + (x - 1000 ? ' ' + sebut(x - 1000) : '');
      if (x < 1000000) return sebut(Math.floor(x / 1000)) + ' Ribu' + (x % 1000 ? ' ' + sebut(x % 1000) : '');
      if (x < 1000000000) return sebut(Math.floor(x / 1000000)) + ' Juta' + (x % 1000000 ? ' ' + sebut(x % 1000000) : '');
      return sebut(Math.floor(x / 1000000000)) + ' Miliar' + (x % 1000000000 ? ' ' + sebut(x % 1000000000) : '');
    };
    return (sebut(num) + ' Rupiah').replace(/\s+/g, ' ').trim();
  },
  programFee(p) {
    return Number(p?.totalFee ?? p?.price ?? 0);
  },
  programMinDp(p) {
    const fee = this.programFee(p);
    const dp = Number(p?.minDownPayment ?? fee);
    return Math.min(Math.max(0, dp), fee);
  },
  isLegacyFree(enr) {
    return Number(enr?.billedTotal || 0) <= 0;
  },
  remainingBalance(enr) {
    const billed = Number(enr?.billedTotal || 0);
    const paid = Number(enr?.paidAmount || 0);
    return Math.max(0, billed - paid);
  },
  isPaidFull(enr) {
    if (!enr) return false;
    if (enr.paymentStatus === 'paid_full') return true;
    if (this.isLegacyFree(enr)) return true;
    return this.remainingBalance(enr) === 0 && Number(enr?.billedTotal || 0) > 0;
  },
  billingBreakdown(enr) {
    const billedTotal = Number(enr?.billedTotal || 0);
    const paidAmount = Number(enr?.paidAmount || 0);
    const remainingBalance = Math.max(0, billedTotal - paidAmount);
    const isPaidFull = this.isPaidFull(enr);
    const percentPaid = billedTotal > 0 ? Math.min(100, Math.round((paidAmount / billedTotal) * 100)) : 100;
    const confirmedPayments = (enr?.payments || []).filter(p => p.status === 'confirmed');
    const pendingPayments = (enr?.payments || []).filter(p => p.status === 'pending');
    const pendingAmount = pendingPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
    return {
      billedTotal,
      paidAmount,
      remainingBalance,
      isPaidFull,
      percentPaid,
      confirmedPayments,
      pendingPayments,
      pendingAmount
    };
  },
  canAccessChat(user, enrollments = [], isAdmin = false) {
    if (isAdmin) return true;
    if (!user || user.status !== 'approved') return false;
    if (user.chatAccess === true || user.effectiveChatAccess === true) return true;
    return (enrollments || []).some(e => this.isPaidFull(e));
  },
  checkSubscriptionGate(user, settings = {}, serverTimeMs = Date.now(), isAdmin = false) {
    const gate = settings?.subscriptionGate || {};
    if (isAdmin || gate.enabled !== true) {
      return { blocked: false, reason: '', expiresAtMs: Number(user?.accessExpiresAtMs || 0), daysLeft: null };
    }
    if (!user) {
      return { blocked: false, reason: 'guest', expiresAtMs: 0, daysLeft: null };
    }
    const now = Number(serverTimeMs || Date.now());
    const exp = Number(user.accessExpiresAtMs || 0);
    if (user.accessStatus === 'active' && exp > now) {
      const daysLeft = Math.max(1, Math.ceil((exp - now) / 86400000));
      return { blocked: false, reason: 'active', expiresAtMs: exp, daysLeft };
    }
    return {
      blocked: true,
      reason: exp > 0 ? 'expired' : 'inactive',
      expiresAtMs: exp,
      daysLeft: 0,
      price: Number(gate.price || 50000),
      durationDays: Number(gate.durationDays || 365),
      packageName: gate.packageName || 'Akses Portal & Modul 1 Tahun'
    };
  },
  statusLabel(enr) {
    if (this.isLegacyFree(enr)) return { code: 'approved', text: 'Terdaftar' };
    if (this.isPaidFull(enr)) return { code: 'approved', text: 'Lunas' };
    const paid = Number(enr?.paidAmount || 0);
    const hasPending = (enr?.payments || []).some(p => p.status === 'pending');
    if (paid > 0) return { code: 'pending', text: hasPending ? 'DP Terkonfirmasi · Pelunasan Dicek' : 'DP Terkonfirmasi · Belum Lunas' };
    return { code: 'pending', text: hasPending ? 'Menunggu Verifikasi Bukti' : 'Belum Bayar' };
  },
  calculateRecap(enrollments = [], chatPayments = [], alkesOrders = [], expenses = [], filterProgramId = 'ALL', accessPayments = []) {
    if (!Array.isArray(chatPayments)) {
      expenses = chatPayments || [];
      filterProgramId = alkesOrders || 'ALL';
      chatPayments = [];
      alkesOrders = [];
      accessPayments = [];
    }
    const listEnr = (filterProgramId === 'ALL' ? enrollments : enrollments.filter(e => e.programId === filterProgramId))
      .filter(e => !this.isLegacyFree(e));
    const listExp = filterProgramId === 'ALL' ? expenses : expenses.filter(x => x.programId === filterProgramId);

    let totalSubmissions = listEnr.length;
    let confirmedDpCount = 0;
    let paidFullCount = 0;
    let pendingProofCount = 0;
    let programCashIn = 0;
    let cashMethodIn = 0;
    let transferMethodIn = 0;
    let remainingReceivables = 0;

    for (const enr of listEnr) {
      const paid = Number(enr.paidAmount || 0);
      const sisa = this.remainingBalance(enr);
      programCashIn += paid;
      remainingReceivables += sisa;
      if (this.isPaidFull(enr)) paidFullCount++;
      else if (paid > 0) confirmedDpCount++;
      for (const p of (enr.payments || [])) {
        if (p.status === 'pending') pendingProofCount++;
        if (p.status === 'confirmed') {
          if (p.method === 'cash') cashMethodIn += Number(p.amount || 0);
          else transferMethodIn += Number(p.amount || 0);
        }
      }
    }

    let chatCashIn = 0;
    let alkesCashIn = 0;
    let accessCashIn = 0;
    if (filterProgramId === 'ALL') {
      for (const cp of chatPayments) {
        if (cp.status === 'confirmed') chatCashIn += Number(cp.amount || 0);
        if (cp.status === 'pending') pendingProofCount++;
      }
      for (const ord of alkesOrders) {
        if (ord.status === 'confirmed') alkesCashIn += Number(ord.totalAmount || 0);
        if (ord.status === 'pending') pendingProofCount++;
      }
      for (const ap of (accessPayments || [])) {
        if (ap.status === 'confirmed') accessCashIn += Number(ap.amount || 0);
        if (ap.status === 'pending') pendingProofCount++;
      }
    }

    let totalExpense = 0;
    let bmhp = 0;
    let alkes = 0;
    let operasional = 0;
    for (const x of listExp) {
      const amt = Number(x.amount || 0);
      totalExpense += amt;
      if (x.category === 'BMHP') bmhp += amt;
      else if (x.category === 'Instrumen/Alkes') alkes += amt;
      else operasional += amt;
    }

    const confirmedCashIn = programCashIn + chatCashIn + alkesCashIn + accessCashIn;
    return {
      totalSubmissions,
      confirmedDpCount,
      paidFullCount,
      pendingProofCount,
      programCashIn,
      cashMethodIn,
      transferMethodIn,
      chatCashIn,
      alkesCashIn,
      accessCashIn,
      confirmedCashIn,
      remainingReceivables,
      totalExpense,
      bmhp,
      alkes,
      operasional,
      netCash: confirmedCashIn - totalExpense
    };
  },
  calculateCharityRecap(donations = [], charityConfig = {}) {
    let confirmedIn = 0;
    let pendingIn = 0;
    let distributedOut = 0;
    let donorCount = 0;
    for (const d of (donations || [])) {
      const amt = Number(d.amount || 0);
      if (d.status === 'confirmed') {
        confirmedIn += amt;
        donorCount++;
      } else if (d.status === 'pending') {
        pendingIn += amt;
      } else if (d.status === 'distributed') {
        distributedOut += amt;
      }
    }
    const collected = Math.max(confirmedIn, Number(charityConfig?.totalCollected || 0));
    const distributed = Math.max(distributedOut, Number(charityConfig?.totalDistributed || 0));
    return {
      collected,
      distributed,
      balance: Math.max(0, collected - distributed),
      pendingIn,
      donorCount
    };
  },
  buildReceiptHtml(r, settings = {}) {
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const dt = r.confirmedAt ? new Date(r.confirmedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const isLunas = Number(r.remainingBalance || 0) <= 0;
    const methodLabel = r.method === 'cash' ? 'Tunai (Cash)' : 'Transfer / QRIS';
    const verifyUrl = `${location.origin}${location.pathname}?kuitansi=${encodeURIComponent(r.receiptNumber || '')}`;
    return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kuitansi ${esc(r.receiptNumber || 'Haura Institute')}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;background:#eef3f1;color:#123044;margin:0;padding:18px}
  .sheet{max-width:760px;margin:0 auto;background:#fff;border:2px solid #087b4b;border-radius:12px;padding:24px;position:relative;overflow:hidden}
  .watermark{position:absolute;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-18deg);font-size:64px;font-weight:800;color:rgba(8,123,75,.06);pointer-events:none;white-space:nowrap}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #087b4b;padding-bottom:14px;gap:12px}
  .org h1{margin:0;font-size:20px;color:#087b4b;letter-spacing:.4px}
  .org p{margin:3px 0 0;font-size:12px;color:#466070;line-height:1.4}
  .doc-meta{text-align:right}
  .doc-meta .title{font-size:18px;font-weight:800;color:#123044;letter-spacing:1px}
  .doc-meta .no{font-size:13px;font-weight:700;color:#087b4b;margin-top:4px;background:#e8f6ef;padding:4px 10px;border-radius:6px;display:inline-block}
  table.info{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
  table.info td{padding:7px 4px;vertical-align:top;border-bottom:1px dashed #d5e2de}
  table.info td.lbl{width:190px;color:#4e6775;font-weight:600}
  .terbilang{background:#f3f9f6;border-left:4px solid #087b4b;padding:10px 12px;font-style:italic;font-size:13px;margin:12px 0}
  .summary-box{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}
  .sum-card{border:1px solid #cfe0da;border-radius:8px;padding:10px;background:#fafdfb}
  .sum-card small{display:block;font-size:11px;color:#526878}
  .sum-card strong{display:block;font-size:15px;margin-top:3px;color:#123044}
  .badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;background:${isLunas ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'}}
  .foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:24px;gap:16px;font-size:12px;color:#526878}
  .sign{text-align:center;min-width:220px}
  .sign .line{margin-top:54px;border-top:1px solid #123044;padding-top:5px;font-weight:700;color:#123044}
  .actions{max-width:760px;margin:0 auto 12px;display:flex;gap:8px;justify-content:flex-end}
  .btn{background:#087b4b;color:#fff;border:0;padding:10px 16px;border-radius:8px;font-weight:700;cursor:pointer}
  @media print{body{background:#fff;padding:0}.actions{display:none}.sheet{border-radius:0;box-shadow:none}}
</style></head><body>
<div class="actions"><button class="btn" onclick="window.print()">Cetak / Simpan PDF Kuitansi</button></div>
<div class="sheet">
  <div class="watermark">${isLunas ? 'LUNAS' : 'ANGSURAN'}</div>
  <div class="head">
    <div class="org">
      <h1>${esc(settings.logoText || 'HAURA INSTITUTE')}</h1>
      <p>Lembaga Bimbingan Penunjang Pendidikan Kesehatan · Izin No. 1804220016539<br>Jln. TGH. Turmudzi Badaruddin, Dusun Mesaleng, Desa Bagu, Pringgarata, Lombok Tengah, NTB</p>
    </div>
    <div class="doc-meta">
      <div class="title">KUITANSI PEMBAYARAN</div>
      <div class="no">No: ${esc(r.receiptNumber || '-')}</div>
    </div>
  </div>
  <table class="info">
    <tr><td class="lbl">Telah Terima Dari</td><td>: <strong>${esc(r.participantName || 'Peserta')}</strong> (${esc(r.institution || '-')})</td></tr>
    <tr><td class="lbl">Program / Keperluan</td><td>: ${esc(r.programTitle || '-')} — ${esc(r.label || 'Pembayaran')}</td></tr>
    <tr><td class="lbl">Metode Pembayaran</td><td>: <strong>${esc(methodLabel)}</strong> · <span class="badge">${isLunas ? 'LUNAS' : 'BELUM LUNAS / CICILAN'}</span></td></tr>
    <tr><td class="lbl">Nominal Diterima</td><td>: <strong style="font-size:16px;color:#087b4b">${esc(this.money(r.amount))}</strong></td></tr>
  </table>
  <div class="terbilang">Terbilang: # ${esc(this.terbilang(r.amount))} #</div>
  ${Number(r.billedTotal || 0) > 0 ? `
  <div class="summary-box">
    <div class="sum-card"><small>Total Biaya Program</small><strong>${esc(this.money(r.billedTotal))}</strong></div>
    <div class="sum-card"><small>Total Sudah Dibayar</small><strong style="color:#087b4b">${esc(this.money(r.paidAmount))}</strong></div>
    <div class="sum-card"><small>Sisa Tagihan</small><strong style="color:${isLunas ? '#166534' : '#b45309'}">${esc(this.money(r.remainingBalance))}</strong></div>
  </div>` : ''}
  <div class="foot">
    <div>
      <div>Kuitansi sah diterbitkan secara elektronik oleh sistem Haura Institute.</div>
      <div>Verifikasi keaslian: <strong>${esc(verifyUrl)}</strong></div>
    </div>
    <div class="sign">
      <div>Lombok Tengah, ${esc(dt)}</div>
      <div>Penerima / Pengelola,</div>
      <div class="line">${esc(r.receiverName || 'Ns. Ahmad Fudhali, S.Kep., M.Tr.Kep.')}</div>
    </div>
  </div>
</div>
</body></html>`;
  }
};
