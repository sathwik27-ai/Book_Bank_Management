/**
 * Fine Calculation Engine for BookBank
 *
 * Rules:
 * - Standard loan period: 14 days
 * - Daily overdue fine rate: ₹5 / day (or $1 / day)
 * - Fine accumulates daily after midnight of the due date until the book is returned
 */

export const DAILY_FINE_RATE = 5; // Currency units (e.g. ₹5 per day)
export const CURRENCY_SYMBOL = "₹";

export interface FineDetails {
  isOverdue: boolean;
  daysOverdue: number;
  fineAmount: number;
  formattedFine: string;
}

export function calculateFine(
  dueDateStr: string,
  returnedAtStr?: string | null,
  rate: number = DAILY_FINE_RATE,
): FineDetails {
  const dueDate = new Date(dueDateStr);
  const endDate = returnedAtStr ? new Date(returnedAtStr) : new Date();

  // Strip time component to calculate calendar day differences
  const dueMidnight = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  ).getTime();
  const endMidnight = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  ).getTime();

  const diffMs = endMidnight - dueMidnight;
  const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysDiff > 0) {
    const fineAmount = daysDiff * rate;
    return {
      isOverdue: true,
      daysOverdue: daysDiff,
      fineAmount,
      formattedFine: `${CURRENCY_SYMBOL}${fineAmount}`,
    };
  }

  return {
    isOverdue: false,
    daysOverdue: 0,
    fineAmount: 0,
    formattedFine: `${CURRENCY_SYMBOL}0`,
  };
}
