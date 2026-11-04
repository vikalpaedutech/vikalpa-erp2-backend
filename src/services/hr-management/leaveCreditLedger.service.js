import { LeaveBalanceTransaction } from "../../models/user-management/leaveBalanceTransaction.models.js";

/**
 * Consume available credit lots in earliest-expiry-first order.
 * Must be called inside the caller's MongoDB transaction/session.
 */
export async function consumeLeaveCredits({ userId, leaveTypeId, leaveYear, leaveId, amount, session }) {
  let remaining = Number(amount || 0);
  const credits = await LeaveBalanceTransaction.find({
    userId,
    leaveTypeId,
    leaveYear,
    transactionType: { $in: ["Opening Balance", "Accrual", "Carry Forward", "Manual Adjustment"] },
  }).sort({ transactionDate: 1, createdAt: 1 }).session(session);
  // Credits with the nearest expiry are consumed first; non-expiring lots last.
  credits.sort((a, b) => {
    const ae = a.expiryDate ? new Date(a.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;
    const be = b.expiryDate ? new Date(b.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;
    return ae - be || new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime();
  });

  for (const credit of credits) {
    if (remaining <= 0) break;
    const total = Number(credit.amount || 0);
    const consumed = Number(credit.consumedAmount || 0);
    const expired = Number(credit.expiredAmount || 0);
    const lotRemaining = credit.remainingAmount == null
      ? Math.max(0, total - consumed - expired)
      : Number(credit.remainingAmount || 0);
    if (lotRemaining <= 0) continue;
    const take = Math.min(lotRemaining, remaining);
    credit.remainingAmount = lotRemaining - take;
    credit.consumedAmount = consumed + take;
    await credit.save({ session });
    remaining -= take;
  }

  if (remaining > 0.000001) {
    throw new Error("Insufficient unexpired leave credits. Please refresh the leave balance.");
  }
  return true;
}
