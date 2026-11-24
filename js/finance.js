export const HauraFinance = {
  money(v) {
    return 'Rp ' + Math.round(Number(v || 0)).toLocaleString('id-ID');
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
    if (this.isLegacyFree(enr)) return true;
    return this.remainingBalance(enr) === 0 && Number(enr?.billedTotal || 0) > 0;
  },
  statusLabel(enr) {
    if (this.isLegacyFree(enr)) return { code: 'approved', text: 'Terdaftar' };
    if (this.isPaidFull(enr)) return { code: 'approved', text: 'Lunas' };
    const paid = Number(enr?.paidAmount || 0);
    const hasPending = (enr?.payments || []).some(p => p.status === 'pending');
    if (paid > 0) return { code: 'pending', text: hasPending ? 'DP Terkonfirmasi · Pelunasan Dicek' : 'DP Terkonfirmasi · Belum Lunas' };
    return { code: 'pending', text: hasPending ? 'Menunggu Verifikasi Bukti' : 'Belum Bayar' };
  },
  calculateRecap(enrollments = [], chatPayments = [], alkesOrders = [], expenses = [], filterProgramId = 'ALL') {
    if (!Array.isArray(chatPayments)) {
      expenses = chatPayments || [];
      filterProgramId = alkesOrders || 'ALL';
      chatPayments = [];
      alkesOrders = [];
    }
    const listEnr = (filterProgramId === 'ALL' ? enrollments : enrollments.filter(e => e.programId === filterProgramId))
      .filter(e => !this.isLegacyFree(e));
    const listExp = filterProgramId === 'ALL' ? expenses : expenses.filter(x => x.programId === filterProgramId);

    let totalSubmissions = listEnr.length;
    let confirmedDpCount = 0;
    let paidFullCount = 0;
    let pendingProofCount = 0;
    let programCashIn = 0;
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
      }
    }

    let chatCashIn = 0;
    let alkesCashIn = 0;
    if (filterProgramId === 'ALL') {
      for (const cp of chatPayments) {
        if (cp.status === 'confirmed') chatCashIn += Number(cp.amount || 0);
        if (cp.status === 'pending') pendingProofCount++;
      }
      for (const ord of alkesOrders) {
        if (ord.status === 'confirmed') alkesCashIn += Number(ord.totalAmount || 0);
        if (ord.status === 'pending') pendingProofCount++;
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

    const confirmedCashIn = programCashIn + chatCashIn + alkesCashIn;
    return {
      totalSubmissions,
      confirmedDpCount,
      paidFullCount,
      pendingProofCount,
      programCashIn,
      chatCashIn,
      alkesCashIn,
      confirmedCashIn,
      remainingReceivables,
      totalExpense,
      bmhp,
      alkes,
      operasional,
      netCash: confirmedCashIn - totalExpense
    };
  }
};
