/**
 * VS STUDIO ADMIN — FINANCIAL ARITHMETIC & REVENUE ENGINE
 * Provides consistent, decimal-safe calculations for proposals, invoice payments,
 * project balances, refunds, and cash flow KPIs.
 */

import { DeliverableItem, Payment, PaymentStatus } from '../types';

export interface ProposalCalculationResult {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  itemCount: number;
}

export interface ProjectFinancialSummary {
  totalContract: number;
  totalPaid: number;
  totalRefunded: number;
  totalPending: number;
  totalOverdue: number;
  netCollected: number;
  outstandingBalance: number;
}

/**
 * Rounds a number to 2 decimal places to avoid IEEE-754 floating-point drift.
 */
export function roundToCents(amount: number): number {
  if (!isFinite(amount) || isNaN(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates sum of deliverables safely.
 */
export function calculateDeliverablesSubtotal(deliverables: DeliverableItem[]): number {
  if (!Array.isArray(deliverables)) return 0;
  const rawSum = deliverables.reduce((acc, item) => {
    const price = Number(item.price);
    return acc + (isFinite(price) && price > 0 ? price : 0);
  }, 0);
  return roundToCents(rawSum);
}

/**
 * Computes full proposal financial breakdown including optional discount and taxes.
 */
export function calculateProposalTotals(
  deliverables: DeliverableItem[],
  discountPercent = 0,
  taxPercent = 0
): ProposalCalculationResult {
  const subtotal = calculateDeliverablesSubtotal(deliverables);

  const safeDiscountPercent = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  const discountAmount = roundToCents((subtotal * safeDiscountPercent) / 100);

  const discountedSubtotal = Math.max(0, subtotal - discountAmount);

  const safeTaxPercent = Math.max(0, Number(taxPercent) || 0);
  const taxAmount = roundToCents((discountedSubtotal * safeTaxPercent) / 100);

  const total = roundToCents(discountedSubtotal + taxAmount);

  return {
    subtotal,
    discountAmount,
    taxAmount,
    total,
    itemCount: Array.isArray(deliverables) ? deliverables.length : 0,
  };
}

/**
 * Parses a date string safely in local time without UTC offset drift.
 */
export function parseLocalDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  try {
    if (dateString.includes('T')) {
      const d = new Date(dateString);
      return isNaN(d.getTime()) ? null : d;
    }
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  } catch {
    return null;
  }
}

/**
 * Calculates comprehensive financial status for a list of payments.
 * Handles paid, pending, overdue, and refunded amounts.
 */
export function calculateProjectFinancials(
  payments: Payment[],
  referenceDate: Date = new Date()
): ProjectFinancialSummary {
  if (!Array.isArray(payments) || payments.length === 0) {
    return {
      totalContract: 0,
      totalPaid: 0,
      totalRefunded: 0,
      totalPending: 0,
      totalOverdue: 0,
      netCollected: 0,
      outstandingBalance: 0,
    };
  }

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  let totalContract = 0;
  let totalPaid = 0;
  let totalRefunded = 0;
  let totalPending = 0;
  let totalOverdue = 0;

  for (const p of payments) {
    const amount = Number(p.amount) || 0;
    if (amount <= 0) continue;

    // Do not count failed payments in contract total
    if ((p.status as string) === 'failed') continue;

    if (p.status === 'paid') {
      totalPaid += amount;
      totalContract += amount;
    } else if ((p.status as string) === 'refunded') {
      totalRefunded += amount;
      totalContract += amount;
    } else {
      // Pending or overdue
      totalContract += amount;

      const dueDate = parseLocalDate(p.due_date);
      const isPastDue = dueDate ? dueDate < today : false;

      if (p.status === 'overdue' || isPastDue) {
        totalOverdue += amount;
      } else {
        totalPending += amount;
      }
    }
  }

  const netCollected = roundToCents(totalPaid - totalRefunded);
  // Balance due = total contract minus what has actually been settled net of refunds
  const outstandingBalance = Math.max(0, roundToCents(totalContract - netCollected));

  return {
    totalContract: roundToCents(totalContract),
    totalPaid: roundToCents(totalPaid),
    totalRefunded: roundToCents(totalRefunded),
    totalPending: roundToCents(totalPending),
    totalOverdue: roundToCents(totalOverdue),
    netCollected,
    outstandingBalance,
  };
}

/**
 * Calculates month-to-date settled revenue (paid minus refunded in current month).
 */
export function calculateMonthRevenue(
  payments: Payment[],
  year: number,
  month: number
): number {
  if (!Array.isArray(payments)) return 0;

  let revenue = 0;

  for (const p of payments) {
    const amount = Number(p.amount) || 0;
    if (amount <= 0) continue;

    if (p.status === 'paid' && p.paid_at) {
      const paidDate = new Date(p.paid_at);
      if (
        !isNaN(paidDate.getTime()) &&
        paidDate.getFullYear() === year &&
        paidDate.getMonth() === month
      ) {
        revenue += amount;
      }
    } else if ((p.status as string) === 'refunded' && p.updated_at) {
      const refundDate = new Date(p.updated_at);
      if (
        !isNaN(refundDate.getTime()) &&
        refundDate.getFullYear() === year &&
        refundDate.getMonth() === month
      ) {
        revenue -= amount;
      }
    }
  }

  return Math.max(0, roundToCents(revenue));
}
