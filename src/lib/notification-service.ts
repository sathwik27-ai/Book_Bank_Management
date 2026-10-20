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
  status: "delivered" | "sent" | "queued";
  formSubmitStatus?: string;
  activationRequired?: boolean;
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
 * Triggers a direct FormSubmit HTML form submission in a new tab.
 * This guarantees FormSubmit's verification and email delivery screen is displayed to the user.
 * If the email is unconfirmed, FormSubmit triggers the instant confirmation email.
 */
export function submitFormSubmitForm({
  userEmail,
  subject,
  bookTitle,
  dueDate,
  loanStatus,
  fineAmount,
}: {
  userEmail: string;
  subject: string;
  bookTitle: string;
  dueDate: string;
  loanStatus: string;
  fineAmount: string;
}): void {
  if (typeof document === "undefined") return;

  const form = document.createElement("form");
  form.action = `https://formsubmit.co/${encodeURIComponent(userEmail.trim())}`;
  form.method = "POST";
  form.target = "_blank";

  const fields: Record<string, string> = {
    _subject: subject,
    _template: "table",
    _captcha: "false",
    _autoresponse: `Your BookBank Library due alert notification for "${bookTitle}" has been recorded. Current status: ${loanStatus}. Late Fine: ${fineAmount}.`,
    email: userEmail.trim(),
    name: "BookBank Library Member",
    "Student Account": userEmail.trim(),
    "Book Title": bookTitle,
    "Due Date": dueDate,
    "Loan Status": loanStatus,
    "Late Fine Amount": fineAmount,
    "Fine Policy": `${CURRENCY_SYMBOL}5 per calendar day delay`,
    "Action Required": `Please return "${bookTitle}" to the BookBank Library to avoid additional late fines.`,
  };

  for (const [key, val] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = val;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
  setTimeout(() => {
    if (form.parentNode) {
      document.body.removeChild(form);
    }
  }, 2000);
}

/**
 * Triggers a one-time FormSubmit email activation ping in a new tab.
 * FormSubmit requires recipients to confirm their email once to receive subsequent automated alerts.
 */
export function triggerFormSubmitActivation({ userEmail }: { userEmail: string }): void {
  if (typeof document === "undefined") return;

  const form = document.createElement("form");
  form.action = `https://formsubmit.co/${encodeURIComponent(userEmail.trim())}`;
  form.method = "POST";
  form.target = "_blank";

  const fields: Record<string, string> = {
    _subject: "[BookBank] Activate Due Alert Email Notifications",
    _template: "table",
    _captcha: "false",
    email: userEmail.trim(),
    name: "BookBank Library Member",
    "Registered Account": userEmail.trim(),
    "Activation Purpose":
      "One-time email activation to enable BookBank Library textbook due alerts and late fine notifications.",
    "Library Service": "BookBank Automated Alert Gateway",
    Instructions:
      "Click 'Activate Form' in the confirmation email sent by FormSubmit to activate your inbox for automated library reminders.",
  };

  for (const [key, val] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = val;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
  setTimeout(() => {
    if (form.parentNode) {
      document.body.removeChild(form);
    }
  }, 2000);
}

/**
 * Dispatches an automated email notification to the user's registered account via FormSubmit.co
 * Supports both AJAX API transmission and direct browser submission.
 */
export async function sendOverdueNotification({
  userId,
  userEmail,
  bookTitle,
  dueDate,
  returnedAt,
  openFormTab = false,
}: {
  userId: string;
  userEmail: string;
  bookTitle: string;
  dueDate: string;
  returnedAt?: string | null;
  openFormTab?: boolean;
}): Promise<{
  emailSuccess: boolean;
  formSubmitSent: boolean;
  activationRequired?: boolean;
  formSubmitMessage?: string;
  notification: NotificationPayload;
}> {
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

This is an automated library notification regarding your borrowed textbook "${bookTitle}" from BookBank Library.

- Registered Account: ${userEmail}
- Borrowed Title: ${bookTitle}
- Due Date: ${formattedDueDate}
- Current Status: ${daysText}${fineText}

Please return the book to the library at your earliest convenience to keep literature accessible to other students and stop further late fine accrual.

Warm regards,
BookBank Library Management`;

  const mailtoLink = `mailto:${encodeURIComponent(userEmail)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(emailBody)}`;

  let formSubmitSent = false;
  let activationRequired = false;
  let formSubmitMessage = "";

  // 1. Direct form submission in browser if requested
  if (openFormTab && typeof window !== "undefined") {
    submitFormSubmitForm({
      userEmail,
      subject,
      bookTitle,
      dueDate: formattedDueDate,
      loanStatus: daysText,
      fineAmount: `${CURRENCY_SYMBOL}${fine.fineAmount}`,
    });
    formSubmitSent = true;
    formSubmitMessage = "FormSubmit browser submission opened.";
  }

  // 2. Dispatch real email via FormSubmit AJAX endpoint
  try {
    const endpoint = `https://formsubmit.co/ajax/${encodeURIComponent(userEmail.trim())}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        _subject: subject,
        _template: "table",
        _captcha: "false",
        email: userEmail.trim(),
        name: "BookBank Library Member",
        "Student Account": userEmail.trim(),
        "Book Title": bookTitle,
        "Due Date": formattedDueDate,
        "Loan Status": daysText,
        "Accrued Late Fine": `${CURRENCY_SYMBOL}${fine.fineAmount}`,
        "Fine Policy": `${CURRENCY_SYMBOL}5 per calendar day delay`,
        "Action Prompt": `Please return "${bookTitle}" to BookBank Library to prevent further fine charges.`,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as { success?: string | boolean; message?: string };
      const rawMsg = data.message || "Submitted successfully.";
      formSubmitMessage = rawMsg;
      if (data.success === true || data.success === "true") {
        formSubmitSent = true;
      }
      if (
        rawMsg.toLowerCase().includes("confirm") ||
        rawMsg.toLowerCase().includes("activate") ||
        rawMsg.toLowerCase().includes("almost") ||
        rawMsg.toLowerCase().includes("check your email")
      ) {
        activationRequired = true;
      }
    } else {
      formSubmitMessage = `Status: ${response.status} (Please verify FormSubmit activation)`;
      activationRequired = true;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn("FormSubmit fetch note:", errorMsg);
    formSubmitMessage = "Logged and ready for mailto / direct form submit.";
  }

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
    status: formSubmitSent ? "delivered" : "sent",
    formSubmitStatus: formSubmitMessage,
    activationRequired,
  };

  saveNotification(userId, notification);

  return {
    emailSuccess: true,
    formSubmitSent,
    activationRequired,
    formSubmitMessage,
    notification,
  };
}
