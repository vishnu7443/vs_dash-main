import { describe, it, expect } from 'vitest';
import {
  calculateDeliverablesSubtotal,
  calculateProposalTotals,
  calculateProjectFinancials,
  calculateMonthRevenue,
  roundToCents,
  parseLocalDate,
} from '../src/lib/financial';
import { DeliverableItem, Payment } from '../src/types';

describe('Financial Math Engine', () => {
  it('correctly rounds decimals without IEEE-754 floating-point drift', () => {
    expect(roundToCents(0.1 + 0.2)).toBe(0.3);
    expect(roundToCents(100.005)).toBe(100.01);
    expect(roundToCents(0)).toBe(0);
    expect(roundToCents(NaN)).toBe(0);
  });

  it('calculates deliverable subtotal accurately', () => {
    const deliverables: DeliverableItem[] = [
      { id: '1', title: 'Brand Identity', description: '', price: 45000 },
      { id: '2', title: 'Web App Dev', description: '', price: 125000 },
      { id: '3', title: 'AI Automation Agent', description: '', price: 80000 },
    ];

    expect(calculateDeliverablesSubtotal(deliverables)).toBe(250000);
  });

  it('computes proposal discounts and taxes accurately', () => {
    const deliverables: DeliverableItem[] = [
      { id: '1', title: 'Service A', description: '', price: 100000 },
    ];

    // 10% discount, 18% GST/tax
    const result = calculateProposalTotals(deliverables, 10, 18);
    expect(result.subtotal).toBe(100000);
    expect(result.discountAmount).toBe(10000); // 10% of 100k
    expect(result.taxAmount).toBe(16200); // 18% of 90k
    expect(result.total).toBe(106200); // 90k + 16.2k
  });

  it('accurately distinguishes paid, pending, overdue, refunded, and failed payments', () => {
    const payments: Payment[] = [
      {
        id: 'p-1',
        project_id: 'proj-1',
        type: 'advance',
        amount: 50000,
        status: 'paid',
        due_date: '2026-10-01',
        paid_at: '2026-10-01T10:00:00Z',
        method: 'UPI',
        reference: 'UTR-1001',
        created_at: '2026-10-01',
        updated_at: '2026-10-01',
      },
      {
        id: 'p-2',
        project_id: 'proj-1',
        type: 'milestone',
        amount: 75000,
        status: 'pending',
        due_date: '2026-10-30', // In the future relative to referenceDate 2026-10-27
        paid_at: null,
        method: null,
        reference: null,
        created_at: '2026-10-01',
        updated_at: '2026-10-01',
      },
      {
        id: 'p-3',
        project_id: 'proj-1',
        type: 'milestone',
        amount: 30000,
        status: 'pending',
        due_date: '2026-10-20', // Due date has passed relative to 2026-10-27
        paid_at: null,
        method: null,
        reference: null,
        created_at: '2026-10-01',
        updated_at: '2026-10-01',
      },
      {
        id: 'p-4',
        project_id: 'proj-1',
        type: 'final',
        amount: 15000,
        status: 'refunded',
        due_date: '2026-10-05',
        paid_at: '2026-10-05T10:00:00Z',
        method: 'Bank Wire',
        reference: 'REF-001',
        created_at: '2026-10-01',
        updated_at: '2026-10-10',
      },
      {
        id: 'p-5',
        project_id: 'proj-1',
        type: 'milestone',
        amount: 99999,
        status: 'failed',
        due_date: '2026-10-02',
        paid_at: null,
        method: null,
        reference: null,
        created_at: '2026-10-01',
        updated_at: '2026-10-02',
      },
    ];

    const refDate = new Date(2026, 9, 27); // Oct 27, 2026
    const summary = calculateProjectFinancials(payments, refDate);

    // Contract = 50k (paid) + 75k (pending) + 30k (overdue) + 15k (refunded) = 170k (failed is excluded)
    expect(summary.totalContract).toBe(170000);
    expect(summary.totalPaid).toBe(50000);
    expect(summary.totalRefunded).toBe(15000);
    expect(summary.netCollected).toBe(35000); // 50k - 15k refunded
    expect(summary.totalPending).toBe(75000);
    expect(summary.totalOverdue).toBe(30000);
    // Outstanding balance = 170k - 35k = 135k
    expect(summary.outstandingBalance).toBe(135000);
  });

  it('calculates monthly revenue correctly including refunds', () => {
    const payments: Payment[] = [
      {
        id: 'p-1',
        project_id: 'proj-1',
        type: 'advance',
        amount: 80000,
        status: 'paid',
        due_date: '2026-10-10',
        paid_at: '2026-10-12T14:00:00Z',
        method: 'Wire',
        reference: null,
        created_at: '2026-10-01',
        updated_at: '2026-10-12',
      },
      {
        id: 'p-2',
        project_id: 'proj-1',
        type: 'milestone',
        amount: 50000,
        status: 'paid',
        due_date: '2026-09-15',
        paid_at: '2026-09-15T10:00:00Z', // Previous month
        method: 'UPI',
        reference: null,
        created_at: '2026-09-01',
        updated_at: '2026-09-15',
      },
      {
        id: 'p-3',
        project_id: 'proj-1',
        type: 'milestone',
        amount: 10000,
        status: 'refunded',
        due_date: '2026-10-15',
        paid_at: '2026-10-15T10:00:00Z',
        method: 'UPI',
        reference: null,
        created_at: '2026-10-01',
        updated_at: '2026-10-20T12:00:00Z', // Refunded in October
      },
    ];

    // October 2026: Month 9 in 0-indexed JS Date
    const octRevenue = calculateMonthRevenue(payments, 2026, 9);
    expect(octRevenue).toBe(70000); // 80k paid - 10k refunded
  });
});
