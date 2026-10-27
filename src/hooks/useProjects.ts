import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Project, ProjectStatus, ProjectWithRelations, Client, Payment } from '../types';
import { INITIAL_PROJECTS, INITIAL_CLIENTS, INITIAL_PAYMENTS } from '../lib/mockData';
import { calculateProjectFinancials } from '../lib/financial';
import { queryKeys } from '../lib/queryKeys';

const PROJECTS_STORAGE_KEY = 'vs_studio_projects';

function getStoredProjects(): Project[] {
  const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(INITIAL_PROJECTS));
  return INITIAL_PROJECTS;
}

function setStoredProjects(data: Project[]) {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(data));
}

export function useProjects() {
  const queryClient = useQueryClient();
  const activeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const queryKey = queryKeys.projects;

  const {
    data: projects = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<ProjectWithRelations[]> => {
      if (!isSupabaseConfigured) {
        const rawProjects = getStoredProjects();
        const clients: Client[] = JSON.parse(
          localStorage.getItem('vs_studio_clients') || JSON.stringify(INITIAL_CLIENTS)
        );
        const payments: Payment[] = JSON.parse(
          localStorage.getItem('vs_studio_payments') || JSON.stringify(INITIAL_PAYMENTS)
        );

        return rawProjects.map((p) => {
          const client = clients.find((c) => c.id === p.client_id);
          const projectPayments = payments.filter((py) => py.project_id === p.id);
          const financials = calculateProjectFinancials(projectPayments);

          return {
            ...p,
            client,
            payments: projectPayments,
            total_contract: financials.totalContract,
            total_paid: financials.netCollected,
            outstanding_balance: financials.outstandingBalance,
          };
        });
      }

      // Supabase fetch with client and payments joins
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('*, client:clients(*), payments(*)')
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching projects from Supabase:', fetchError);
        throw new Error(`Failed to load projects from Supabase: ${fetchError.message}`);
      }

      return (data || []).map((p: any) => {
        const payments = p.payments || [];
        const financials = calculateProjectFinancials(payments);

        return {
          ...p,
          total_contract: financials.totalContract,
          total_paid: financials.netCollected,
          outstanding_balance: financials.outstandingBalance,
        };
      });
    },
  });

  // Deduplicated Realtime subscription for projects
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channelName = `projects_channel_${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        }
      )
      .subscribe();

    activeChannelRef.current = channel;

    return () => {
      if (activeChannelRef.current) {
        supabase.removeChannel(activeChannelRef.current);
        activeChannelRef.current = null;
      }
    };
  }, [queryClient]);

  // Update Status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProjectStatus }) => {
      if (!isSupabaseConfigured) {
        const current = getStoredProjects();
        const updated = current.map((p) =>
          p.id === id ? { ...p, status, updated_at: new Date().toISOString() } : p
        );
        setStoredProjects(updated);
        return updated.find((p) => p.id === id);
      }

      const { data, error: updateError } = await supabase
        .from('projects')
        .update({ status, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });

  // Update Progress
  const updateProgressMutation = useMutation({
    mutationFn: async ({ id, progress }: { id: string; progress: number }) => {
      const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));

      if (!isSupabaseConfigured) {
        const current = getStoredProjects();
        const updated = current.map((p) =>
          p.id === id
            ? { ...p, progress_percent: safeProgress, updated_at: new Date().toISOString() }
            : p
        );
        setStoredProjects(updated);
        return updated.find((p) => p.id === id);
      }

      const { data, error: updateError } = await supabase
        .from('projects')
        .update({ progress_percent: safeProgress, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });

  // Create Project
  const createProjectMutation = useMutation({
    mutationFn: async (newProject: Omit<Project, 'id' | 'created_at' | 'updated_at'>) => {
      if (!isSupabaseConfigured) {
        const current = getStoredProjects();
        const created: Project = {
          ...newProject,
          id: `p-${Date.now().toString(36)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setStoredProjects([created, ...current]);
        return created;
      }

      const { data, error: insertError } = await supabase
        .from('projects')
        .insert(newProject as any)
        .select()
        .single();

      if (insertError) throw insertError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });

  return {
    projects,
    isLoading,
    error,
    refetch,
    updateStatus: updateStatusMutation.mutateAsync,
    updateProgress: updateProgressMutation.mutateAsync,
    createProject: createProjectMutation.mutateAsync,
  };
}
