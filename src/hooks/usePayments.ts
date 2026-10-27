import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Payment, PaymentStatus, PaymentType } from '../types';
import { INITIAL_PAYMENTS } from '../lib/mockData';
import { queryKeys } from '../lib/queryKeys';
import { createPaymentSchema } from '../lib/validation';

const PAYMENTS_STORAGE_KEY = 'vs_studio_payments';

function getStoredPayments(): Payment[] {
  const stored = localStorage.getItem(PAYMENTS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(INITIAL_PAYMENTS));
  return INITIAL_PAYMENTS;
}

function setStoredPayments(data: Payment[]) {
  localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(data));
}

export function usePayments(projectId?: string) {
  const queryClient = useQueryClient();
  const activeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const queryKey = queryKeys.payments(projectId);

  const {
    data: payments = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<Payment[]> => {
      if (!isSupabaseConfigured) {
        const allPayments = getStoredPayments();
        if (projectId) {
          return allPayments.filter((p) => p.project_id === projectId);
        }
        return allPayments;
      }

      let query = supabase.from('payments').select('*').order('due_date', { ascending: true });
      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) {
        console.error('Error fetching payments from Supabase:', fetchError);
        throw new Error(`Failed to load payments from Supabase: ${fetchError.message}`);
      }
      return (data || []) as Payment[];
    },
  });

  // Deduplicated Realtime subscription for payments
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channelName = `payments_channel_${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.payments() });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      })
      .subscribe();

    activeChannelRef.current = channel;

    return () => {
      if (activeChannelRef.current) {
        supabase.removeChannel(activeChannelRef.current);
        activeChannelRef.current = null;
      }
    };
  }, [queryClient]);

  // Record/Update Payment status
  const markPaymentPaidMutation = useMutation({
    mutationFn: async ({
      id,
      method,
      reference,
      paidAt,
    }: {
      id: string;
      method: string;
      reference?: string;
      paidAt?: string;
    }) => {
      const now = paidAt || new Date().toISOString();

      if (!isSupabaseConfigured) {
        const current = getStoredPayments();
        const updated = current.map((p) =>
          p.id === id
            ? {
                ...p,
                status: 'paid' as PaymentStatus,
                method,
                reference: reference || p.reference || null,
                paid_at: now,
                updated_at: now,
              }
            : p
        );
        setStoredPayments(updated);
        return updated.find((p) => p.id === id);
      }

      const { data, error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'paid',
          method,
          reference: reference || null,
          paid_at: now,
          updated_at: now,
        } as any)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments() });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });

  // Refund Payment mutation
  const refundPaymentMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const now = new Date().toISOString();

      if (!isSupabaseConfigured) {
        const current = getStoredPayments();
        const updated = current.map((p) =>
          p.id === id
            ? {
                ...p,
                status: 'refunded' as PaymentStatus,
                updated_at: now,
              }
            : p
        );
        setStoredPayments(updated);
        return updated.find((p) => p.id === id);
      }

      const { data, error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'refunded',
          updated_at: now,
        } as any)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments() });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });

  // Create Payment record
  const createPaymentMutation = useMutation({
    mutationFn: async (newPayment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>) => {
      // Validate with Zod
      const validated = createPaymentSchema.parse({
        project_id: newPayment.project_id,
        type: newPayment.type,
        amount: Number(newPayment.amount),
        status: newPayment.status || 'pending',
        due_date: newPayment.due_date,
        paid_at: newPayment.paid_at,
        method: newPayment.method,
        reference: newPayment.reference,
      });

      if (!isSupabaseConfigured) {
        const current = getStoredPayments();
        const created: Payment = {
          ...newPayment,
          id: `py-${Date.now().toString(36)}`,
          amount: validated.amount,
          status: validated.status as PaymentStatus,
          reference: validated.reference || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setStoredPayments([created, ...current]);
        return created;
      }

      const { data, error: insertError } = await supabase
        .from('payments')
        .insert({
          ...newPayment,
          amount: validated.amount,
          status: validated.status,
          reference: validated.reference || null,
        } as any)
        .select()
        .single();

      if (insertError) throw insertError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments() });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });

  return {
    payments,
    isLoading,
    error,
    refetch,
    markPaid: markPaymentPaidMutation.mutateAsync,
    refundPayment: refundPaymentMutation.mutateAsync,
    createPayment: createPaymentMutation.mutateAsync,
  };
}
