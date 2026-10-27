import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useProjects } from '../../hooks/useProjects';
import { PaymentType, PaymentStatus } from '../../types';
import { AlertCircle } from 'lucide-react';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (params: {
    project_id: string;
    type: PaymentType;
    amount: number;
    status: PaymentStatus;
    due_date: string;
    paid_at?: string | null;
    method?: string | null;
    reference?: string | null;
  }) => Promise<unknown>;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const { projects } = useProjects();
  const [projectId, setProjectId] = useState('');
  const [type, setType] = useState<PaymentType>('advance');
  const [amount, setAmount] = useState<number>(150000);
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<PaymentStatus>('pending');
  const [method, setMethod] = useState<string>('UPI / Direct');
  const [reference, setReference] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (projects.length > 0 && !projectId) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) {
      setErrorMsg('Please select a project.');
      return;
    }
    if (!amount || amount <= 0) {
      setErrorMsg('Amount must be greater than zero.');
      return;
    }
    if (!dueDate) {
      setErrorMsg('Please enter a due date.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await onCreate({
        project_id: projectId,
        type,
        amount: Number(amount),
        status,
        due_date: dueDate,
        paid_at: status === 'paid' ? new Date().toISOString() : null,
        method: status === 'paid' ? method : null,
        reference: reference.trim() || null,
      });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to record payment.';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Payment / Invoice"
      description="Track client advance deposits, milestone payments, or final project releases."
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs font-sans">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 shadow-sm"
            required
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">Payment Stage</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PaymentType)}
              className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 shadow-sm"
            >
              <option value="advance">Advance Deposit (Kickoff)</option>
              <option value="milestone">Milestone Release</option>
              <option value="final">Final Settlement</option>
            </select>
          </div>

          <Input
            label="Amount (₹ INR)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            min={1}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">Initial Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PaymentStatus)}
              className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 shadow-sm"
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid & Settled</option>
              <option value="overdue">Overdue</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>

        {status === 'paid' && (
          <div className="grid grid-cols-2 gap-3 animate-fade-in">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Payment Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 shadow-sm"
              >
                <option value="UPI / Direct">UPI / Direct Net Banking</option>
                <option value="Bank Wire">Bank Wire Transfer</option>
                <option value="Stripe Invoice">Stripe Invoice</option>
                <option value="Wise Transfer">Wise</option>
                <option value="Crypto (USDC)">Crypto (USDC)</option>
              </select>
            </div>

            <Input
              label="Transaction / UTR Reference (Optional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. UTR-98234812"
            />
          </div>
        )}

        <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="gradient" size="sm" isLoading={isSubmitting} disabled={isSubmitting}>
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
};
