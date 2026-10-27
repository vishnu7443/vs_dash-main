/**
 * VS STUDIO ADMIN — RUNTIME SCHEMA VALIDATIONS (ZOD)
 * Enforces data boundaries on client conversion, proposals, payments, and tasks.
 */

import { z } from 'zod';

export const deliverableItemSchema = z.object({
  id: z.string().min(1, 'Deliverable ID is required'),
  title: z.string().trim().min(2, 'Deliverable title must be at least 2 characters'),
  description: z.string().optional().default(''),
  price: z.number().nonnegative('Deliverable price must be zero or positive'),
});

export const createProposalSchema = z.object({
  project_id: z.string().nullable().optional(),
  inquiry_id: z.string().nullable().optional(),
  total_price: z.number().nonnegative('Total price must be non-negative'),
  deliverables: z
    .array(deliverableItemSchema)
    .min(1, 'Proposal must include at least one deliverable item'),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected']),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid until must be a YYYY-MM-DD date'),
  sent_at: z.string().nullable().optional(),
});

export const convertInquirySchema = z.object({
  inquiry_id: z.string().min(1, 'Inquiry ID is required'),
  project_title: z.string().trim().min(3, 'Project title must be at least 3 characters'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be a valid YYYY-MM-DD date'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be a valid YYYY-MM-DD date').optional().or(z.literal('')),
  assigned_to: z.string().optional().nullable(),
  existing_client_id: z.string().optional().nullable(),
});

export const createPaymentSchema = z.object({
  project_id: z.string().min(1, 'Project is required'),
  type: z.enum(['advance', 'milestone', 'final']),
  amount: z.number().positive('Payment amount must be greater than zero'),
  status: z.enum(['pending', 'paid', 'overdue', 'refunded', 'failed']),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be a valid YYYY-MM-DD date'),
  paid_at: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
});

export const createTaskSchema = z.object({
  project_id: z.string().min(1, 'Project ID is required'),
  title: z.string().trim().min(2, 'Task title must be at least 2 characters'),
  description: z.string().optional().nullable(),
  assignee: z.string().optional().nullable(),
  status: z.enum(['todo', 'doing', 'done']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be a valid YYYY-MM-DD date').optional().nullable(),
});
