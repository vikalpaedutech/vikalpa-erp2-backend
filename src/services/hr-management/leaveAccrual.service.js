import { User } from "../../models/user.models.js";
import { UserRole } from "../../models/user-management/userRole.models.js";
import { UserDesignation } from "../../models/user-management/userDesignation.models.js";
import { LeavePolicy } from "../../models/hr-management/leavePolicy.models.js";
import { LeaveType } from "../../models/hr-management/leaveType.models.js";
import { UserLeaveBalance } from "../../models/user-management/userLeaveBalance.models.js";
import { LeaveBalanceTransaction } from "../../models/user-management/leaveBalanceTransaction.models.js";

const start = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const dateKey = (d) => start(d).toISOString().slice(0, 10);
const due = (frequency, d) =>
  frequency === "monthly" ? d.getUTCDate() === 1 :
  frequency === "quarterly" ? d.getUTCDate() === 1 && [0, 3, 6, 9].includes(d.getUTCMonth()) :
  frequency === "half_yearly" ? d.getUTCDate() === 1 && [0, 6].includes(d.getUTCMonth()) :
  frequency === "yearly" ? d.getUTCDate() === 1 && d.getUTCMonth() === 0 : false;

async function eligible(policy, users) {
  const e = policy.eligibility || {};
  if (e.applyToAll) return users.map((u) => u._id);
  const [roleIds, designationIds] = await Promise.all([
    e.roles?.length ? UserRole.find({ roleId: { $in: e.roles }, isActive: true }).distinct("userId") : [],
    e.designations?.length ? UserDesignation.find({ designationId: { $in: e.designations }, isActive: true }).distinct("userId") : [],
  ]);
  const ids = new Set([...(e.users || []).map(String), ...roleIds.map(String), ...designationIds.map(String)]);
  return users.filter((u) => ids.has(String(u._id))).map((u) => u._id);
}

const monthEndExpiry = (creditDate, expiryMonths) => {
  if (!(Number(expiryMonths) > 0)) return null;
  // expiryMonths=1 means the credit is valid through its credit month
  // and expires at that month's end; 2 means the following month's end.
  const target = new Date(Date.UTC(creditDate.getUTCFullYear(), creditDate.getUTCMonth() + Number(expiryMonths) - 1, 1));
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 23, 59, 59, 999));
};

export async function runLeaveAccrual(date = new Date()) {
  const day = start(date);
  const users = await User.find({ isActive: true }).select("_id").lean();
  const actor = users[0]?._id;
  if (!actor) return { processed: 0 };
  const policies = await LeavePolicy.find({ isActive: true, accrualFrequency: { $ne: "none" }, accrualAmount: { $gt: 0 } }).lean();
  let processed = 0;
  for (const policy of policies) {
    if (!due(policy.accrualFrequency, day) || new Date(policy.effectiveFrom) > day) continue;
    const type = await LeaveType.findById(policy.leaveTypeId).select("isActive").lean();
    if (!type?.isActive) continue;
    for (const userId of await eligible(policy, users)) {
      const year = day.getUTCFullYear();
      const key = `ACCRUAL:${policy._id}:${userId}:${dateKey(day)}`;
      if (await LeaveBalanceTransaction.exists({ accrualKey: key })) continue;
      let balance = await UserLeaveBalance.findOne({ userId, leaveTypeId: policy.leaveTypeId, leaveYear: year });
      if (!balance) balance = await UserLeaveBalance.create({ userId, leaveTypeId: policy.leaveTypeId, leaveYear: year });
      const before = Number(balance.availableBalance || 0);
      const cap = Number(policy.annualEntitlement || 0);
      const already = Number(balance.accruedBalance || 0);
      const amount = cap > 0 ? Math.max(0, Math.min(Number(policy.accrualAmount), cap - already)) : Number(policy.accrualAmount);
      if (amount <= 0) continue;
      balance.accruedBalance = already + amount;
      balance.availableBalance = before + amount;
      balance.lastUpdatedAt = day;
      await balance.save();
      const expiryDate = monthEndExpiry(day, policy.expiryMonths);
      await LeaveBalanceTransaction.create({
        userId, leaveTypeId: policy.leaveTypeId, leaveBalanceId: balance._id, leaveYear: year,
        transactionType: "Accrual", amount, remainingAmount: amount, consumedAmount: 0,
        expiredAmount: 0, balanceBefore: before, balanceAfter: balance.availableBalance,
        referenceType: "System", reason: `Automated ${policy.accrualFrequency} accrual`,
        transactionDate: day, createdBy: actor, accrualKey: key, expiryDate,
      });
      processed++;
    }
  }
  return { processed };
}

export async function runLeaveExpiry(date = new Date()) {
  const day = start(date);
  const actor = await User.findOne({ isActive: true }).select("_id").lean();
  if (!actor) return { processed: 0 };
  // Opening Balance and monthly/other accrual credits are expired individually.
  const expiryCutoff = new Date(day.getTime() + 86400000);
  const credits = await LeaveBalanceTransaction.find({
    transactionType: { $in: ["Opening Balance", "Accrual", "Carry Forward", "Manual Adjustment"] },
    expiryDate: { $ne: null, $lt: expiryCutoff },
    $or: [{ remainingAmount: { $gt: 0 } }, { remainingAmount: null }],
  }).lean();
  let processed = 0;
  for (const credit of credits) {
    const amount = credit.remainingAmount == null
      ? Math.max(0, Number(credit.amount || 0) - Number(credit.consumedAmount || 0) - Number(credit.expiredAmount || 0))
      : Number(credit.remainingAmount || 0);
    if (amount <= 0) continue;
    const key = `EXPIRY:${credit._id}:${dateKey(day)}`;
    if (await LeaveBalanceTransaction.exists({ accrualKey: key })) continue;
    const balance = await UserLeaveBalance.findById(credit.leaveBalanceId);
    if (!balance) continue;
    const before = Number(balance.availableBalance || 0);
    // Pending requests are reserved against the aggregate balance. Do not expire
    // the portion currently needed to honour those requests; retry on next scheduler tick.
    const protectedPending = Number(balance.pendingBalance || 0);
    const unreservedAvailable = Math.max(0, before - protectedPending);
    // Defer this lot as a whole when pending requests may rely on it.
    if (unreservedAvailable + 0.000001 < amount) continue;
    const expiring = amount;
    if (expiring <= 0) continue;
    balance.availableBalance = before - expiring;
    balance.expiredBalance = Number(balance.expiredBalance || 0) + expiring;
    balance.lastUpdatedAt = day;
    await balance.save();
    await LeaveBalanceTransaction.create({
      userId: credit.userId, leaveTypeId: credit.leaveTypeId, leaveBalanceId: balance._id,
      leaveYear: credit.leaveYear, transactionType: "Expiry", amount: expiring,
      balanceBefore: before, balanceAfter: balance.availableBalance, referenceType: "System",
      reason: `Credit expired (source transaction ${credit._id})`, transactionDate: day,
      createdBy: actor._id, accrualKey: key,
    });
    credit.remainingAmount = Math.max(0, amount - expiring);
    credit.expiredAmount = Number(credit.expiredAmount || 0) + expiring;
    await LeaveBalanceTransaction.updateOne({ _id: credit._id }, { $set: { remainingAmount: credit.remainingAmount, expiredAmount: credit.expiredAmount } });
    processed++;
  }
  return { processed };
}

export async function runLeaveCarryForward(date = new Date()) {
  const day = start(date);
  if (day.getUTCMonth() !== 0 || day.getUTCDate() !== 1) return { processed: 0 };
  const actor = await User.findOne({ isActive: true }).select("_id").lean();
  if (!actor) return { processed: 0 };
  const policies = await LeavePolicy.find({ isActive: true, carryForwardAllowed: true }).lean();
  let processed = 0;
  for (const policy of policies) {
    const old = await UserLeaveBalance.find({ leaveTypeId: policy.leaveTypeId, leaveYear: day.getUTCFullYear() - 1, isActive: true }).lean();
    for (const previous of old) {
      const key = `CARRY:${policy._id}:${previous.userId}:${day.getUTCFullYear()}`;
      if (await LeaveBalanceTransaction.exists({ accrualKey: key })) continue;
      const carry = Math.min(Number(previous.availableBalance || 0), Number(policy.maxCarryForward || 0) > 0 ? Number(policy.maxCarryForward) : Number(previous.availableBalance || 0));
      if (carry <= 0) continue;
      let balance = await UserLeaveBalance.findOne({ userId: previous.userId, leaveTypeId: policy.leaveTypeId, leaveYear: day.getUTCFullYear() });
      if (!balance) balance = await UserLeaveBalance.create({ userId: previous.userId, leaveTypeId: policy.leaveTypeId, leaveYear: day.getUTCFullYear() });
      const before = Number(balance.availableBalance || 0);
      balance.availableBalance = before + carry;
      balance.carryForwardBalance = Number(balance.carryForwardBalance || 0) + carry;
      balance.lastUpdatedAt = day;
      await balance.save();
      await LeaveBalanceTransaction.create({
        userId: previous.userId, leaveTypeId: policy.leaveTypeId, leaveBalanceId: balance._id,
        leaveYear: day.getUTCFullYear(), transactionType: "Carry Forward", amount: carry,
        remainingAmount: carry, consumedAmount: 0, expiredAmount: 0,
        balanceBefore: before, balanceAfter: balance.availableBalance, referenceType: "System",
        reason: `Carry forward from ${day.getUTCFullYear() - 1}`, transactionDate: day,
        createdBy: actor._id, accrualKey: key,
      });
      processed++;
    }
  }
  return { processed };
}

export function startLeaveAccrualScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const today = start(new Date());
      // Replay every due calendar day from the earliest active policy date.
      // Transaction accrualKey makes each replay idempotent after restarts.
      const earliestPolicy = await LeavePolicy.findOne({ isActive: true }).sort({ effectiveFrom: 1 }).select("effectiveFrom").lean();
      const from = earliestPolicy?.effectiveFrom ? start(new Date(earliestPolicy.effectiveFrom)) : today;
      const cursor = new Date(Math.max(from.getTime(), today.getTime() - 366 * 3 * 86400000));
      for (let d = cursor; d <= today; d = new Date(d.getTime() + 86400000)) {
        await runLeaveAccrual(d);
        await runLeaveCarryForward(d);
      }
      // Expiry is independently catch-up capable and checks all overdue credits.
      const expiry = await runLeaveExpiry(today);
      console.log(`[Leave Scheduler] catch-up through ${dateKey(today)}; expiry=${expiry.processed}`);
    } catch (error) {
      console.error("[Leave Scheduler] failed; will retry on next tick", error);
    } finally {
      running = false;
    }
  };
  tick();
  setInterval(tick, 60 * 60 * 1000);
}
