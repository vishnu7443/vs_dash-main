import { describe, it, expect } from 'vitest';
import { parseLocalDate, formatLocalDateString, getDaysRemaining } from '../src/lib/utils';

describe('Deadlines & Timezone Utilities', () => {
  it('parses YYYY-MM-DD date strings in local time without UTC offset drift', () => {
    const parsed = parseLocalDate('2026-10-27');
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(9); // 0-indexed month
    expect(parsed?.getDate()).toBe(27);
  });

  it('formats local Date object to YYYY-MM-DD string consistently', () => {
    const d = new Date(2026, 9, 27); // Oct 27, 2026
    expect(formatLocalDateString(d)).toBe('2026-10-27');

    const singleDigitMonthDay = new Date(2026, 0, 5); // Jan 5, 2026
    expect(formatLocalDateString(singleDigitMonthDay)).toBe('2026-01-05');
  });

  it('correctly classifies deadlines relative to current date', () => {
    const today = new Date();
    const todayStr = formatLocalDateString(today);

    // Due today
    const dueToday = getDaysRemaining(todayStr);
    expect(dueToday.isOverdue).toBe(false);
    expect(dueToday.isDueSoon).toBe(true);
    expect(dueToday.text).toBe('Due today');

    // Due tomorrow (1 day left)
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dueTomorrow = getDaysRemaining(formatLocalDateString(tomorrow));
    expect(dueTomorrow.isOverdue).toBe(false);
    expect(dueTomorrow.isDueSoon).toBe(true);
    expect(dueTomorrow.text).toBe('1d left');

    // Due in 3 days (amber alert boundary)
    const in3Days = new Date(today);
    in3Days.setDate(today.getDate() + 3);
    const dueIn3Days = getDaysRemaining(formatLocalDateString(in3Days));
    expect(dueIn3Days.isOverdue).toBe(false);
    expect(dueIn3Days.isDueSoon).toBe(true);
    expect(dueIn3Days.text).toBe('3d left');

    // Due in 10 days (normal green boundary)
    const in10Days = new Date(today);
    in10Days.setDate(today.getDate() + 10);
    const dueIn10Days = getDaysRemaining(formatLocalDateString(in10Days));
    expect(dueIn10Days.isOverdue).toBe(false);
    expect(dueIn10Days.isDueSoon).toBe(false);
    expect(dueIn10Days.text).toBe('10d left');

    // Overdue by 4 days
    const past = new Date(today);
    past.setDate(today.getDate() - 4);
    const overdue = getDaysRemaining(formatLocalDateString(past));
    expect(overdue.isOverdue).toBe(true);
    expect(overdue.isDueSoon).toBe(false);
    expect(overdue.text).toBe('4d overdue');

    // Null or undefined
    expect(getDaysRemaining(null).text).toBe('No deadline');
  });
});
