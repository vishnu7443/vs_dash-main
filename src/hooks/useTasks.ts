import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Task, TaskStatus } from '../types';
import { INITIAL_TASKS } from '../lib/mockData';
import { queryKeys } from '../lib/queryKeys';
import { createTaskSchema } from '../lib/validation';

const TASKS_STORAGE_KEY = 'vs_studio_tasks';

function getStoredTasks(): Task[] {
  const stored = localStorage.getItem(TASKS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(INITIAL_TASKS));
  return INITIAL_TASKS;
}

function setStoredTasks(data: Task[]) {
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(data));
}

export function useTasks(projectId?: string) {
  const queryClient = useQueryClient();
  const activeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const queryKey = queryKeys.tasks(projectId);

  const {
    data: tasks = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<Task[]> => {
      if (!isSupabaseConfigured) {
        const allTasks = getStoredTasks();
        if (projectId) {
          return allTasks.filter((t) => t.project_id === projectId);
        }
        return allTasks;
      }

      let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });
      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) {
        console.error('Error fetching tasks from Supabase:', fetchError);
        throw new Error(`Failed to load tasks from Supabase: ${fetchError.message}`);
      }
      return (data || []) as Task[];
    },
  });

  // Deduplicated Realtime subscription
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channelName = `tasks_channel_${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks() });
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

  // Update Status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      if (!isSupabaseConfigured) {
        const current = getStoredTasks();
        const updated = current.map((t) =>
          t.id === id ? { ...t, status, updated_at: new Date().toISOString() } : t
        );
        setStoredTasks(updated);
        return updated.find((t) => t.id === id);
      }

      const { data, error: updateError } = await supabase
        .from('tasks')
        .update({ status, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks() });
    },
  });

  // Create Task
  const createTaskMutation = useMutation({
    mutationFn: async (newTask: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => {
      const validated = createTaskSchema.parse({
        project_id: newTask.project_id,
        title: newTask.title,
        description: newTask.description || null,
        assignee: newTask.assignee || null,
        status: newTask.status || 'todo',
        priority: newTask.priority || 'medium',
        due_date: newTask.due_date || null,
      });

      if (!isSupabaseConfigured) {
        const current = getStoredTasks();
        const created: Task = {
          ...newTask,
          id: `t-${Date.now().toString(36)}`,
          title: validated.title,
          status: validated.status as TaskStatus,
          priority: validated.priority,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setStoredTasks([created, ...current]);
        return created;
      }

      const { data, error: insertError } = await supabase
        .from('tasks')
        .insert({
          ...newTask,
          title: validated.title,
          status: validated.status,
          priority: validated.priority,
        } as any)
        .select()
        .single();

      if (insertError) throw insertError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks() });
    },
  });

  return {
    tasks,
    isLoading,
    error,
    refetch,
    updateStatus: updateStatusMutation.mutateAsync,
    createTask: createTaskMutation.mutateAsync,
  };
}
