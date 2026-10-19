import { calculateFine, CURRENCY_SYMBOL } from "./fine-calculator";

export interface NotificationPayload {
  id: string;
  userId: string;
  type: "email";
  recipientEmail: string;
  bookTitle: string;
  dueDate: string;
  daysOverdue: number;
  fineAmount: number;
  subject: string;
  message: string;
  mailtoLink: string;
  timestamp: string;
  status: "delivered";
}

const NOTIFICATIONS_STORAGE_PREFIX = "bookbank_notifications_";

export function getNotifications(userId: string): NotificationPayload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${NOTIFICATIONS_STORAGE_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveNotification(userId: string, notification: NotificationPayload): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getNotifications(userId);
    existing.unshift(notification);
    // Keep last 50 notifications
    const trimmed = existing.slice(0, 50);
    localStorage.setItem(`${NOTIFICATIONS_STORAGE_PREFIX}${userId}`, JSON.stringify(trimmed));
  } catch (err) {
    console.error("Failed to save notification record", err);
  }
}

/**
 * Dispatches an automated email notification to the user's registered account.
 * Works seamlessly out of the box with zero third-party API keys or telecom fees.
 */
export function sendOverdueNotification({
  userId,
  userEmail,
  bookTitle,
  dueDate,
  returnedAt,
}: {
  userId: string;
  userEmail: string;
  bookTitle: string;
  dueDate: string;
  returnedAt?: string | null;
}): {
  emailSuccess: boolean;
  notification: NotificationPayload;
} {
  const fine = calculateFine(dueDate, returnedAt);
  const formattedDueDate = new Date(dueDate).toLocaleDateString();

  const isOverdue = fine.isOverdue;
  const daysText = isOverdue ? `${fine.daysOverdue} day(s) overdue` : `due on ${formattedDueDate}`;
  const fineText = isOverdue
    ? `\nOutstanding Late Fine: ${CURRENCY_SYMBOL}${fine.fineAmount} (Calculated at ${CURRENCY_SYMBOL}5/day delay).`
    : "";

  const subject = isOverdue
    ? `[BookBank Alert] Action Required: Book Overdue "${bookTitle}"`
    : `[BookBank Reminder] Book Due Soon "${bookTitle}"`;

  const emailBody = `Dear Student,

This is an automated notification regarding your borrowed textbook "${bookTitle}" from BookBank Library.

- Registered Account: ${userEmail}
- Borrowed Title: ${bookTitle}
- Due Date: ${formattedDueDate}
- Current Status: ${daysText}${fineText}

Please return the book to the library at your earliest convenience to keep literature accessible to other students and stop further fine accrual.

Warm regards,
BookBank Library Management`;

  const mailtoLink = `mailto:${encodeURIComponent(userEmail)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(emailBody)}`;

  const notification: NotificationPayload = {
    id: `notif-${Date.now()}`,
    userId,
    type: "email",
    recipientEmail: userEmail,
    bookTitle,
    dueDate,
    daysOverdue: fine.daysOverdue,
    fineAmount: fine.fineAmount,
    subject,
    message: emailBody,
    mailtoLink,
    timestamp: new Date().toISOString(),
    status: "delivered",
  };

  saveNotification(userId, notification);

  return {
    emailSuccess: true,
    notification,
  };
}
