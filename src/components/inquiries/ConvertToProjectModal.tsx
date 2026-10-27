import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Inquiry } from '../../types';
import { formatServiceType } from '../../lib/utils';
import { useClients } from '../../hooks/useClients';
import { ArrowRight, UserCheck, AlertCircle } from 'lucide-react';

interface ConvertToProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  inquiry: Inquiry | null;
  onConvert: (params: {
    inquiry: Inquiry;
    projectTitle: string;
    startDate: string;
    dueDate?: string;
    assignedTo?: string;
    existingClientId?: string;
  }) => Promise<unknown>;
}

export const ConvertToProjectModal: React.FC<ConvertToProjectModalProps> = ({
  isOpen,
  onClose,
  inquiry,
  onConvert,
}) => {
  const { clients } = useClients();
  const [projectTitle, setProjectTitle] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('a0000000-0000-0000-0000-000000000001');
  const [existingClientId, setExistingClientId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-detect matching client by email or company
  const matchingClient = useMemo(() => {
    if (!inquiry) return null;
    return clients.find(
      (c) =>
        c.email.toLowerCase() === inquiry.email.toLowerCase() ||
        (inquiry.company && c.company?.toLowerCase() === inquiry.company.toLowerCase())
    );
  }, [clients, inquiry]);

  useEffect(() => {
    if (inquiry) {
      setProjectTitle(`${inquiry.company || inquiry.name} — ${formatServiceType(inquiry.service_type)}`);
      setDueDate(inquiry.deadline || '');
      setErrorMsg(null);
      if (matchingClient) {
        setExistingClientId(matchingClient.id);
      } else {
        setExistingClientId('');
      }
    }
  }, [inquiry, matchingClient]);

  if (!inquiry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectTitle.trim()) {
      setErrorMsg('Please specify a project title.');
      return;
    }
    if (!startDate) {
      setErrorMsg('Please select a valid start date.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await onConvert({
        inquiry,
        projectTitle: projectTitle.trim(),
        startDate,
        dueDate: dueDate || undefined,
        assignedTo,
        existingClientId: existingClientId || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Conversion failed. Please try again.';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Convert Inquiry to Client + Project"
      description="Launch this inquiry into an active project in Planning status with atomic database integrity."
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 font-sans text-xs">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Source Inquiry Summary */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Lead Contact:</span>
            <span className="font-bold text-slate-800">{inquiry.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Email:</span>
            <span className="text-slate-800 font-medium">{inquiry.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Company:</span>
            <span className="text-slate-800 font-medium">{inquiry.company || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Budget Range:</span>
            <span className="font-bold text-emerald-700">{inquiry.budget_range}</span>
          </div>
        </div>

        {/* Client Association */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-700">Client Profile</label>
            {matchingClient && !existingClientId && (
              <button
                type="button"
                onClick={() => setExistingClientId(matchingClient.id)}
                className="text-[11px] text-emerald-700 font-medium hover:underline flex items-center gap-1"
              >
                <UserCheck className="w-3 h-3" />
                Match existing: {matchingClient.name}
              </button>
            )}
          </div>
          <select
            value={existingClientId}
            onChange={(e) => setExistingClientId(e.target.value)}
            className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 shadow-sm"
          >
            <option value="">+ Create New Client Profile ({inquiry.name})</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                Link to: {c.name} {c.company ? `(${c.company})` : ''} — {c.email}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Project Title"
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start Date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <Input
            label="Due Date / Launch Target"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700">Assign Lead Founder</label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 shadow-sm"
          >
            <option value="a0000000-0000-0000-0000-000000000001">VISHNU VARDHAN R G (AI & Engineering Lead)</option>
            <option value="a0000000-0000-0000-0000-000000000002">SRIRAM S (Brand & Design Lead)</option>
          </select>
        </div>

        <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="gradient"
            size="sm"
            isLoading={isSubmitting}
            disabled={isSubmitting}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Confirm & Launch Project
          </Button>
        </div>
      </form>
    </Modal>
  );
};
