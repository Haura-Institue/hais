export const HauraFinance = {
  money(v) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(Number(v) || 0);
  },

  programFee(p) {
    if (!p) return 0;
    const v = p.totalFee !== undefined ? Number(p.totalFee) : Number(p.price || 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  },

  programMinDp(p) {
    if (!p) return 0;
    const v = Number(p.minDownPayment || 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  },

  isLegacyFree(enr) {
    return enr && enr.billedTotal === undefined && enr.status === 'approved' && Number(enr.amount || 0) === 0;
  },

  isPaidFull(enr) {
    if (!enr) return false;
    if (enr.paymentStatus === 'paid_full') return true;
    if (this.isLegacyFree(enr)) return true;
    const billed = Number(enr.billedTotal || 0);
    const paid = Number(enr.paidAmount || 0);
    return billed > 0 && paid >= billed;
  },

  remainingBalance(enr) {
    if (!enr || this.isLegacyFree(enr)) return 0;
    const billed = Number(enr.billedTotal || 0);
    const paid = Number(enr.paidAmount || 0);
    return Math.max(0, billed - paid);
  },

  statusLabel(enr) {
    if (this.isLegacyFree(enr)) return { code: 'approved', text: 'Program Lama (Gratis)' };
    if (this.isPaidFull(enr)) return { code: 'approved', text: 'Lunas' };
    if (enr.paymentStatus === 'dp_confirmed') return { code: 'pending', text: 'DP Terkonfirmasi (Belum Lunas)' };
    if (enr.paymentStatus === 'rejected') return { code: 'rejected', text: 'Bukti Ditolak' };
    return { code: 'pending', text: 'Menunggu Konfirmasi DP' };
  },

  calculateRecap(enrollments = [], expenses = [], filterProgramId = 'ALL') {
    const enrList = filterProgramId === 'ALL'
      ? enrollments
      : enrollments.filter(e => e.programId === filterProgramId);

    const expList = filterProgramId === 'ALL'
      ? expenses
      : expenses.filter(x => x.programId === filterProgramId);

    let totalSubmissions = enrList.length;
    let confirmedDpCount = 0;
    let paidFullCount = 0;
    let pendingProofCount = 0;
    let confirmedCashIn = 0;
    let remainingReceivables = 0;

    for (const enr of enrList) {
      if (this.isLegacyFree(enr)) continue;
      const billed = Number(enr.billedTotal || 0);
      const paid = Number(enr.paidAmount || 0);
      confirmedCashIn += paid;
      if (billed > paid) remainingReceivables += (billed - paid);
      if (this.isPaidFull(enr)) {
        paidFullCount++;
        confirmedDpCount++;
      } else if (enr.paymentStatus === 'dp_confirmed') {
        confirmedDpCount++;
      }
      for (const p of (enr.payments || [])) {
        if (p.status === 'pending') pendingProofCount++;
      }
    }

    let bmhp = 0, alkes = 0, operasional = 0;
    for (const x of expList) {
      const amt = Number(x.amount || 0);
      if (x.category === 'BMHP') bmhp += amt;
      else if (x.category === 'Instrumen/Alkes') alkes += amt;
      else operasional += amt;
    }
    const totalExpense = bmhp + alkes + operasional;

    return {
      totalSubmissions,
      confirmedDpCount,
      paidFullCount,
      pendingProofCount,
      confirmedCashIn,
      remainingReceivables,
      bmhp,
      alkes,
      operasional,
      totalExpense,
      netCash: confirmedCashIn - totalExpense
    };
  }
};