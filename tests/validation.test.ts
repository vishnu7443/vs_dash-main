import { describe, it, expect } from 'vitest';
import {
  convertInquirySchema,
  createProposalSchema,
  createPaymentSchema,
  createTaskSchema,
} from '../src/lib/validation';

describe('Runtime Schema Validations', () => {
  describe('convertInquirySchema', () => {
    it('accepts valid lead conversion payload', () => {
      const valid = {
        inquiry_id: 'i-100',
        project_title: 'Nexus AI Portal',
        start_date: '2026-11-01',
        due_date: '2026-12-01',
        assigned_to: 'a-1',
        existing_client_id: 'c-1',
      };
      const result = convertInquirySchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects short project titles and invalid dates', () => {
      const invalid = {
        inquiry_id: 'i-100',
        project_title: 'No', // Too short (< 3 chars)
        start_date: 'invalid-date',
      };
      const result = convertInquirySchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('createProposalSchema', () => {
    it('accepts valid proposal with deliverables', () => {
      const valid = {
        project_id: 'p-1',
        inquiry_id: null,
        total_price: 150000,
        deliverables: [
          {
            id: 'd-1',
            title: 'UX Strategy',
            description: 'Wireframes and research',
            price: 50000,
          },
          {
            id: 'd-2',
            title: 'Design System',
            description: 'Component library',
            price: 100000,
          },
        ],
        status: 'sent',
        valid_until: '2026-11-15',
      };
      const result = createProposalSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects proposal without deliverables', () => {
      const invalid = {
        total_price: 0,
        deliverables: [],
        status: 'draft',
        valid_until: '2026-11-15',
      };
      const result = createProposalSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects negative deliverable prices', () => {
      const invalid = {
        total_price: 100,
        deliverables: [
          {
            id: 'd-1',
            title: 'Bad Item',
            price: -500,
          },
        ],
        status: 'draft',
        valid_until: '2026-11-15',
      };
      const result = createProposalSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('createPaymentSchema', () => {
    it('accepts valid payment with reference and allowed status', () => {
      const valid = {
        project_id: 'proj-1',
        type: 'advance',
        amount: 50000,
        status: 'paid',
        due_date: '2026-10-31',
        reference: 'UTR-98124981',
        method: 'UPI / Direct',
      };
      const result = createPaymentSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('accepts refunded status', () => {
      const valid = {
        project_id: 'proj-1',
        type: 'milestone',
        amount: 25000,
        status: 'refunded',
        due_date: '2026-10-15',
      };
      const result = createPaymentSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects zero or negative payment amounts', () => {
      const invalid = {
        project_id: 'proj-1',
        type: 'advance',
        amount: 0,
        status: 'pending',
        due_date: '2026-10-31',
      };
      const result = createPaymentSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('createTaskSchema', () => {
    it('accepts valid task with priority and status', () => {
      const valid = {
        project_id: 'proj-1',
        title: 'Review Supabase RLS security policies',
        status: 'doing',
        priority: 'urgent',
        due_date: '2026-10-28',
      };
      const result = createTaskSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });
});
