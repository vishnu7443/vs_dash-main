import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Inquiry, InquiryStatus, Client, Project } from '../types';
import { INITIAL_INQUIRIES, INITIAL_CLIENTS, INITIAL_PROJECTS } from '../lib/mockData';
import { useToast } from '../components/ui/Toast';
import { queryKeys } from '../lib/queryKeys';
import { convertInquirySchema } from '../lib/validation';

const INQUIRIES_STORAGE_KEY = 'vs_studio_inquiries';

function getStoredInquiries(): Inquiry[] {
  const stored = localStorage.getItem(INQUIRIES_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  localStorage.setItem(INQUIRIES_STORAGE_KEY, JSON.stringify(INITIAL_INQUIRIES));
  return INITIAL_INQUIRIES;
}

function setStoredInquiries(data: Inquiry[]) {
  localStorage.setItem(INQUIRIES_STORAGE_KEY, JSON.stringify(data));
}

export function useInquiries() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const activeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const queryKey = queryKeys.inquiries;

  const {
    data: inquiries = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<Inquiry[]> => {
      if (!isSupabaseConfigured) {
        return getStoredInquiries();
      }

      const { data, error: fetchError } = await supabase
        .from('inquiries')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching inquiries from Supabase:', fetchError);
        // Do NOT silently return mock data in production mode
        throw new Error(`Failed to load inquiries from Supabase: ${fetchError.message}`);
      }

      return (data || []) as Inquiry[];
    },
  });

  // Deduplicated Realtime subscription for inquiries
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channelName = `inquiries_feed_${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inquiries' },
        (payload) => {
          const newInquiry = payload.new as Inquiry;
          toast({
            type: 'lead',
            title: `🚀 New Lead: ${newInquiry.name}`,
            description: `${newInquiry.company || 'Private Client'} • Budget: ${newInquiry.budget_range}`,
            duration: 8000,
          });
          queryClient.invalidateQueries({ queryKey: queryKeys.inquiries });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inquiries' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.inquiries });
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
  }, [queryClient, toast]);

  // Update Status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InquiryStatus }) => {
      if (!isSupabaseConfigured) {
        const current = getStoredInquiries();
        const updated = current.map((item) =>
          item.id === id ? { ...item, status, updated_at: new Date().toISOString() } : item
        );
        setStoredInquiries(updated);
        return updated.find((i) => i.id === id);
      }

      const { data, error: updateError } = await supabase
        .from('inquiries')
        .update({ status, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inquiries });
    },
  });

  // Update Notes mutation
  const updateNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      if (!isSupabaseConfigured) {
        const current = getStoredInquiries();
        const updated = current.map((item) =>
          item.id === id ? { ...item, notes, updated_at: new Date().toISOString() } : item
        );
        setStoredInquiries(updated);
        return updated.find((i) => i.id === id);
      }

      const { data, error: updateError } = await supabase
        .from('inquiries')
        .update({ notes, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inquiries });
    },
  });

  // Safe & Transactional Convert Inquiry to Client + Project
  const convertToProjectMutation = useMutation({
    mutationFn: async ({
      inquiry,
      projectTitle,
      startDate,
      dueDate,
      assignedTo,
      existingClientId,
    }: {
      inquiry: Inquiry;
      projectTitle: string;
      startDate: string;
      dueDate?: string;
      assignedTo?: string;
      existingClientId?: string;
    }) => {
      // 1. Runtime validation with Zod
      const validated = convertInquirySchema.parse({
        inquiry_id: inquiry.id,
        project_title: projectTitle,
        start_date: startDate,
        due_date: dueDate || '',
        assigned_to: assignedTo || null,
        existing_client_id: existingClientId || null,
      });

      // 2. Mock / Demo Mode execution
      if (!isSupabaseConfigured) {
        const storedClients: Client[] = JSON.parse(
          localStorage.getItem('vs_studio_clients') || JSON.stringify(INITIAL_CLIENTS)
        );
        const storedProjects: Project[] = JSON.parse(
          localStorage.getItem('vs_studio_projects') || JSON.stringify(INITIAL_PROJECTS)
        );

        // Check if an existing client is selected or matching
        let targetClient = existingClientId
          ? storedClients.find((c) => c.id === existingClientId)
          : storedClients.find(
              (c) =>
                c.inquiry_id === inquiry.id ||
                c.email.toLowerCase() === inquiry.email.toLowerCase()
            );

        if (!targetClient) {
          const clientId = `c-${Date.now().toString(36)}`;
          targetClient = {
            id: clientId,
            inquiry_id: inquiry.id,
            name: inquiry.name,
            email: inquiry.email,
            phone: inquiry.phone,
            company: inquiry.company,
            notes: `Converted from inquiry: ${inquiry.requirements}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          localStorage.setItem(
            'vs_studio_clients',
            JSON.stringify([targetClient, ...storedClients])
          );
        }

        const projectId = `p-${Date.now().toString(36)}`;
        const newProject: Project = {
          id: projectId,
          client_id: targetClient.id,
          title: validated.project_title,
          service_type: inquiry.service_type,
          status: 'planning',
          start_date: validated.start_date,
          due_date: validated.due_date || null,
          assigned_to: validated.assigned_to || null,
          progress_percent: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        localStorage.setItem(
          'vs_studio_projects',
          JSON.stringify([newProject, ...storedProjects])
        );

        // Mark inquiry accepted
        const currentInquiries = getStoredInquiries();
        const updatedInquiries = currentInquiries.map((i) =>
          i.id === inquiry.id
            ? { ...i, status: 'accepted' as InquiryStatus, updated_at: new Date().toISOString() }
            : i
        );
        setStoredInquiries(updatedInquiries);

        // Append to activity log
        const storedLogs = JSON.parse(
          localStorage.getItem('vs_studio_activity_log') || '[]'
        );
        storedLogs.unshift({
          id: `al-${Date.now()}`,
          entity_type: 'inquiry',
          entity_id: inquiry.id,
          action: `Converted inquiry to Client "${targetClient.name}" & Project "${newProject.title}"`,
          actor: 'Founder Admin',
          metadata: { clientId: targetClient.id, projectId: newProject.id },
          created_at: new Date().toISOString(),
        });
        localStorage.setItem('vs_studio_activity_log', JSON.stringify(storedLogs));

        return { client: targetClient, project: newProject };
      }

      // 3. Supabase Flow: Attempt Atomic Database RPC first
      try {
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          'convert_inquiry_to_project',
          {
            p_inquiry_id: inquiry.id,
            p_project_title: validated.project_title,
            p_start_date: validated.start_date,
            p_due_date: validated.due_date || null,
            p_assigned_to: validated.assigned_to || null,
            p_existing_client_id: validated.existing_client_id || null,
          }
        );

        if (!rpcError && rpcResult) {
          const resultObj = rpcResult as any;
          return {
            clientId: resultObj.client_id,
            projectId: resultObj.project_id,
          };
        }
      } catch (rpcErr) {
        console.warn('RPC convert_inquiry_to_project unavailable, executing fallback with rollback:', rpcErr);
      }

      // 4. Safe Fallback with Manual Rollback
      let createdClientId: string | null = null;
      try {
        let clientIdToUse = existingClientId || null;

        if (!clientIdToUse) {
          // Check if client with matching email already exists
          const { data: existingClient } = await supabase
            .from('clients')
            .select('id')
            .eq('email', inquiry.email)
            .maybeSingle();

          if (existingClient?.id) {
            clientIdToUse = existingClient.id;
          } else {
            const { data: newClient, error: clientError } = await supabase
              .from('clients')
              .insert({
                inquiry_id: inquiry.id,
                name: inquiry.name,
                email: inquiry.email,
                phone: inquiry.phone,
                company: inquiry.company,
                notes: `Converted from inquiry: ${inquiry.requirements}`,
              } as any)
              .select('id')
              .single();

            if (clientError) throw clientError;
            clientIdToUse = newClient.id;
            createdClientId = newClient.id;
          }
        }

        // Insert project
        const { data: newProject, error: projectError } = await supabase
          .from('projects')
          .insert({
            client_id: clientIdToUse,
            title: validated.project_title,
            service_type: inquiry.service_type,
            status: 'planning',
            start_date: validated.start_date,
            due_date: validated.due_date || null,
            assigned_to: validated.assigned_to || null,
            progress_percent: 0,
          } as any)
          .select('id, title')
          .single();

        if (projectError) {
          // Rollback newly created client row if project insertion failed
          if (createdClientId) {
            await supabase.from('clients').delete().eq('id', createdClientId);
          }
          throw projectError;
        }

        // Update inquiry status
        await supabase
          .from('inquiries')
          .update({ status: 'accepted' } as any)
          .eq('id', inquiry.id);

        // Append to activity log
        await supabase.from('activity_log').insert({
          entity_type: 'inquiry',
          entity_id: inquiry.id,
          action: `Converted inquiry to Client & Project "${newProject.title}"`,
          actor: 'Founder Admin',
          metadata: { clientId: clientIdToUse, projectId: newProject.id },
        } as any);

        return { clientId: clientIdToUse, projectId: newProject.id };
      } catch (err) {
        console.error('Lead conversion failed:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inquiries });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      queryClient.invalidateQueries({ queryKey: queryKeys.activityLog() });
    },
  });

  // Simulated submission for testing
  const submitTestInquiry = async (testInquiry: Partial<Inquiry>) => {
    const fullInquiry: Inquiry = {
      id: `i-test-${Date.now().toString(36)}`,
      name: testInquiry.name || 'Test Client',
      email: testInquiry.email || 'client@example.com',
      phone: testInquiry.phone || '+91 98765 43210',
      company: testInquiry.company || 'Zephyr Labs',
      service_type: testInquiry.service_type || 'ai_agents_automation',
      requirements:
        testInquiry.requirements ||
        'Testing real-time lead ingestion on VS Studio Admin dashboard.',
      budget_range: testInquiry.budget_range || '₹10,00,000 - ₹18,00,000',
      deadline: '2026-11-25',
      reference_links: 'https://linear.app, https://resend.com',
      file_urls: [],
      status: 'new',
      assigned_to: null,
      notes: 'Test lead submitted from client portal simulator.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      const { error: insertError } = await supabase.from('inquiries').insert(fullInquiry as any);
      if (insertError) throw insertError;
    } else {
      const current = getStoredInquiries();
      setStoredInquiries([fullInquiry, ...current]);
      queryClient.invalidateQueries({ queryKey: queryKeys.inquiries });
      toast({
        type: 'lead',
        title: `🚀 Live Test Lead Received: ${fullInquiry.name}`,
        description: `${fullInquiry.company} • Budget: ${fullInquiry.budget_range}`,
      });
    }
  };

  return {
    inquiries,
    isLoading,
    error,
    refetch,
    updateStatus: updateStatusMutation.mutateAsync,
    updateNotes: updateNotesMutation.mutateAsync,
    convertToProject: convertToProjectMutation.mutateAsync,
    submitTestInquiry,
    isConverting: convertToProjectMutation.isPending,
  };
}
