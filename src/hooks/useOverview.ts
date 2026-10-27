import { useInquiries } from './useInquiries';
import { useProjects } from './useProjects';
import { useTasks } from './useTasks';
import { usePayments } from './usePayments';
import { useProposals } from './useProposals';
import { formatCurrency, parseLocalDate } from '../lib/utils';
import { calculateProjectFinancials, calculateMonthRevenue } from '../lib/financial';

export interface AttentionItem {
  id: string;
  type: 'inquiry' | 'payment' | 'task' | 'proposal';
  title: string;
  subtitle: string;
  urgency: 'high' | 'medium';
  actionUrl: string;
}

export function useOverview() {
  const { inquiries, isLoading: loadingInquiries } = useInquiries();
  const { projects, isLoading: loadingProjects } = useProjects();
  const { tasks, isLoading: loadingTasks } = useTasks();
  const { payments, isLoading: loadingPayments } = usePayments();
  const { proposals, isLoading: loadingProposals } = useProposals();

  const isLoading =
    loadingInquiries || loadingProjects || loadingTasks || loadingPayments || loadingProposals;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  // 1. New inquiries count
  const newInquiriesCount = inquiries.filter((i) => i.status === 'new').length;

  // 2. Active projects count
  const activeProjectsCount = projects.filter(
    (p) => p.status === 'in_progress' || p.status === 'review' || p.status === 'planning'
  ).length;

  // 3. Tasks due this week (using timezone-safe parsing)
  const tasksDueThisWeek = tasks.filter((t) => {
    if (t.status === 'done' || !t.due_date) return false;
    const dueDate = parseLocalDate(t.due_date);
    if (!dueDate) return false;
    dueDate.setHours(0, 0, 0, 0);
    return dueDate >= today && dueDate <= nextWeek;
  });
  const tasksDueThisWeekCount = tasksDueThisWeek.length;

  // 4. Overdue items
  const overdueTasks = tasks.filter((t) => {
    if (t.status === 'done' || !t.due_date) return false;
    const dueDate = parseLocalDate(t.due_date);
    if (!dueDate) return false;
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  });

  const overduePayments = payments.filter((py) => {
    if (py.status === 'paid' || (py.status as string) === 'refunded' || (py.status as string) === 'failed') return false;
    if (py.status === 'overdue') return true;
    if (!py.due_date) return false;
    const dueDate = parseLocalDate(py.due_date);
    if (!dueDate) return false;
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  });

  const overdueItemsCount = overdueTasks.length + overduePayments.length;

  // 5. Total outstanding balance using centralized financial engine
  const financials = calculateProjectFinancials(payments, today);
  const totalOutstandingBalance = financials.outstandingBalance;

  // 6. Net Revenue this month (collected minus refunded in the current month)
  const monthlyRevenue = calculateMonthRevenue(payments, today.getFullYear(), today.getMonth());

  // 7. Attention Needed List
  const attentionNeeded: AttentionItem[] = [];

  // Overdue payments first
  overduePayments.forEach((py) => {
    const project = projects.find((p) => p.id === py.project_id);
    attentionNeeded.push({
      id: `att-py-${py.id}`,
      type: 'payment',
      title: `Overdue Payment: ${formatCurrency(py.amount)}`,
      subtitle: `${project?.title || 'Project'} • Due ${py.due_date}`,
      urgency: 'high',
      actionUrl: '/payments',
    });
  });

  // New uncontacted leads
  inquiries
    .filter((i) => i.status === 'new')
    .slice(0, 3)
    .forEach((inq) => {
      attentionNeeded.push({
        id: `att-inq-${inq.id}`,
        type: 'inquiry',
        title: `Uncontacted Lead: ${inq.name}`,
        subtitle: `${inq.company || inq.service_type} • Budget ${inq.budget_range}`,
        urgency: 'high',
        actionUrl: '/inquiries',
      });
    });

  // Overdue tasks
  overdueTasks.slice(0, 3).forEach((t) => {
    attentionNeeded.push({
      id: `att-task-${t.id}`,
      type: 'task',
      title: `Overdue Task: ${t.title}`,
      subtitle: `Deadline passed on ${t.due_date}`,
      urgency: 'medium',
      actionUrl: '/tasks',
    });
  });

  // Proposals expiring soon
  proposals
    .filter((pr) => pr.status === 'sent' && pr.valid_until)
    .forEach((pr) => {
      const validUntil = parseLocalDate(pr.valid_until!);
      if (validUntil) {
        validUntil.setHours(0, 0, 0, 0);
        if (validUntil >= today && validUntil <= nextWeek) {
          attentionNeeded.push({
            id: `att-prop-${pr.id}`,
            type: 'proposal',
            title: `Proposal Expiring Soon: ${formatCurrency(pr.total_price)}`,
            subtitle: `Valid until ${pr.valid_until}`,
            urgency: 'medium',
            actionUrl: '/proposals',
          });
        }
      }
    });

  return {
    metrics: {
      newInquiriesCount,
      activeProjectsCount,
      tasksDueThisWeekCount,
      overdueItemsCount,
      totalOutstandingBalance,
      monthlyRevenue,
    },
    attentionNeeded,
    isLoading,
  };
}
