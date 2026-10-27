import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Proposal, ProposalStatus, DeliverableItem } from '../types';
import { INITIAL_PROPOSALS } from '../lib/mockData';
import { queryKeys } from '../lib/queryKeys';
import { createProposalSchema } from '../lib/validation';
import { calculateDeliverablesSubtotal } from '../lib/financial';

const PROPOSALS_STORAGE_KEY = 'vs_studio_proposals';

function getStoredProposals(): Proposal[] {
  const stored = localStorage.getItem(PROPOSALS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  localStorage.setItem(PROPOSALS_STORAGE_KEY, JSON.stringify(INITIAL_PROPOSALS));
  return INITIAL_PROPOSALS;
}

function setStoredProposals(data: Proposal[]) {
  localStorage.setItem(PROPOSALS_STORAGE_KEY, JSON.stringify(data));
}

export function useProposals() {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.proposals;

  const {
    data: proposals = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<Proposal[]> => {
      if (!isSupabaseConfigured) {
        return getStoredProposals();
      }

      const { data, error: fetchError } = await supabase
        .from('proposals')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching proposals from Supabase:', fetchError);
        throw new Error(`Failed to load proposals from Supabase: ${fetchError.message}`);
      }
      return (data || []) as Proposal[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProposalStatus }) => {
      if (!isSupabaseConfigured) {
        const current = getStoredProposals();
        const existing = current.find((p) => p.id === id);
        if (existing?.status === 'accepted' && status !== 'accepted') {
          throw new Error('Accepted commercial proposals are locked and cannot be demoted without a formal revision.');
        }

        const updated = current.map((p) =>
          p.id === id ? { ...p, status, updated_at: new Date().toISOString() } : p
        );
        setStoredProposals(updated);
        return updated.find((p) => p.id === id);
      }

      // Check if existing proposal was already accepted
      const { data: currentProp } = await supabase
        .from('proposals')
        .select('status')
        .eq('id', id)
        .single();

      if (currentProp?.status === 'accepted' && status !== 'accepted') {
        throw new Error('Accepted commercial proposals are legally locked and cannot be reverted.');
      }

      const { data, error: updateError } = await supabase
        .from('proposals')
        .update({ status, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.proposals });
    },
  });

  const createProposalMutation = useMutation({
    mutationFn: async (newProposal: Omit<Proposal, 'id' | 'created_at' | 'updated_at'>) => {
      const deliverablesList = (newProposal.deliverables as unknown as DeliverableItem[]) || [];

      // Validate pricing on trusted server/client boundary
      const computedTotalPrice = calculateDeliverablesSubtotal(deliverablesList);

      const validated = createProposalSchema.parse({
        project_id: newProposal.project_id || null,
        inquiry_id: newProposal.inquiry_id || null,
        total_price: computedTotalPrice,
        deliverables: deliverablesList,
        status: newProposal.status,
        valid_until: newProposal.valid_until || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        sent_at: newProposal.sent_at || null,
      });

      if (!isSupabaseConfigured) {
        const current = getStoredProposals();
        const created: Proposal = {
          ...newProposal,
          id: `pr-${Date.now().toString(36)}`,
          total_price: validated.total_price,
          deliverables: validated.deliverables as any,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setStoredProposals([created, ...current]);
        return created;
      }

      const { data, error: insertError } = await supabase
        .from('proposals')
        .insert({
          ...newProposal,
          total_price: validated.total_price,
          deliverables: validated.deliverables as any,
        } as any)
        .select()
        .single();

      if (insertError) throw insertError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.proposals });
    },
  });

  return {
    proposals,
    isLoading,
    error,
    refetch,
    updateStatus: updateStatusMutation.mutateAsync,
    createProposal: createProposalMutation.mutateAsync,
  };
}
