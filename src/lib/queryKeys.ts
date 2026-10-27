/**
 * VS STUDIO ADMIN — CENTRAL QUERY KEYS
 * Prevents key discrepancies and ensures clean cache invalidation across the app.
 */

export const queryKeys = {
  inquiries: ['inquiries'] as const,
  clients: ['clients'] as const,
  clientDetail: (id: string | undefined) => ['clients', id] as const,
  projects: ['projects'] as const,
  tasks: (projectId?: string) => (projectId ? (['tasks', projectId] as const) : (['tasks'] as const)),
  proposals: ['proposals'] as const,
  payments: (projectId?: string) =>
    projectId ? (['payments', projectId] as const) : (['payments'] as const),
  activityLog: (limit = 20) => ['activity_log', limit] as const,
  admins: ['admins'] as const,
};
