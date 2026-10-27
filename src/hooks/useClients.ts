import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Client, ClientWithRelations, ProjectWithRelations, Proposal, Payment } from '../types';
import { INITIAL_CLIENTS, INITIAL_PROJECTS, INITIAL_PROPOSALS, INITIAL_PAYMENTS, INITIAL_INQUIRIES } from '../lib/mockData';
import { queryKeys } from '../lib/queryKeys';

const CLIENTS_STORAGE_KEY = 'vs_studio_clients';

function getStoredClients(): Client[] {
  const stored = localStorage.getItem(CLIENTS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(INITIAL_CLIENTS));
  return INITIAL_CLIENTS;
}

function setStoredClients(data: Client[]) {
  localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(data));
}

export function useClients() {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.clients;

  const {
    data: clients = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<Client[]> => {
      if (!isSupabaseConfigured) {
        return getStoredClients();
      }

      const { data, error: fetchError } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching clients:', fetchError);
        throw new Error(`Failed to load clients from Supabase: ${fetchError.message}`);
      }

      return (data || []) as Client[];
    },
  });

  const createClientMutation = useMutation({
    mutationFn: async (newClient: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => {
      if (!isSupabaseConfigured) {
        const stored = getStoredClients();
        const created: Client = {
          ...newClient,
          id: `c-${Date.now().toString(36)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setStoredClients([created, ...stored]);
        return created;
      }

      const { data, error: insertError } = await supabase
        .from('clients')
        .insert(newClient as any)
        .select()
        .single();

      if (insertError) throw insertError;
      return data as Client;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients });
    },
  });

  return {
    clients,
    isLoading,
    error,
    refetch,
    createClient: createClientMutation.mutateAsync,
  };
}

export function useClientDetail(clientId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.clientDetail(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ClientWithRelations | null> => {
      if (!clientId) return null;

      if (!isSupabaseConfigured) {
        const stored = getStoredClients();
        const client = stored.find((c) => c.id === clientId);
        if (!client) return null;

        const projects: ProjectWithRelations[] = JSON.parse(
          localStorage.getItem('vs_studio_projects') || JSON.stringify(INITIAL_PROJECTS)
        );
        const clientProjects = projects.filter((p) => p.client_id === clientId);

        const proposals: Proposal[] = JSON.parse(
          localStorage.getItem('vs_studio_proposals') || JSON.stringify(INITIAL_PROPOSALS)
        );
        const payments: Payment[] = JSON.parse(
          localStorage.getItem('vs_studio_payments') || JSON.stringify(INITIAL_PAYMENTS)
        );
        const inquiries = JSON.parse(
          localStorage.getItem('vs_studio_inquiries') || JSON.stringify(INITIAL_INQUIRIES)
        );

        return {
          ...client,
          inquiries: inquiries.filter((i: { id: string }) => i.id === client.inquiry_id),
          projects: clientProjects,
          proposals: proposals.filter((p) =>
            clientProjects.some((cp) => cp.id === p.project_id)
          ),
          payments: payments.filter((py) =>
            clientProjects.some((cp) => cp.id === py.project_id)
          ),
        };
      }

      // Supabase fetch with related projects, inquiries, proposals, and payments
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();

      if (clientError) throw clientError;

      const { data: projects } = await supabase
        .from('projects')
        .select('*')
        .eq('client_id', clientId);

      const projectList = (projects || []) as unknown as ProjectWithRelations[];
      const projectIds = projectList.map((p) => p.id);

      let clientProposals: Proposal[] = [];
      let clientPayments: Payment[] = [];

      if (projectIds.length > 0) {
        const { data: pData } = await supabase
          .from('proposals')
          .select('*')
          .in('project_id', projectIds);
        clientProposals = (pData || []) as Proposal[];

        const { data: payData } = await supabase
          .from('payments')
          .select('*')
          .in('project_id', projectIds);
        clientPayments = (payData || []) as Payment[];
      }

      let clientInquiries: any[] = [];
      if (client.inquiry_id) {
        const { data: inqData } = await supabase
          .from('inquiries')
          .select('*')
          .eq('id', client.inquiry_id);
        clientInquiries = inqData || [];
      }

      return {
        ...(client as Client),
        projects: projectList,
        proposals: clientProposals,
        payments: clientPayments,
        inquiries: clientInquiries,
      } as ClientWithRelations;
    },
  });
}
