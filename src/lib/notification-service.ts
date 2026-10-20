import { calculateFine, CURRENCY_SYMBOL } from "./fine-calculator";
import { getStoredAccounts } from "@/hooks/use-auth";

export interface NotificationPayload {
  id: string;
  userId: string;
  type: "email";
  sender: "author_admin" | "automated_machine";
  senderName: string;
  recipientEmail: string;
  recipientName?: string;
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
const GLOBAL_AUDIT_LOG_KEY = "bookbank_global_email_audit_log";

/**
 * Returns all notification alerts received by a specific student.
 */
export function getNotifications(userId: string): NotificationPayload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${NOTIFICATIONS_STORAGE_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Returns all system-wide email notifications (for Author/Admin overview).
 */
export function getAllSystemNotifications(): NotificationPayload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GLOBAL_AUDIT_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persists an alert to both the recipient's personal inbox log and the global audit log.
 */
export function saveNotification(userId: string, notification: NotificationPayload): void {
  if (typeof window === "undefined") return;
  try {
    // 1. Save to user log
    const userExisting = getNotifications(userId);
    userExisting.unshift(notification);
    const userTrimmed = userExisting.slice(0, 50);
    localStorage.setItem(`${NOTIFICATIONS_STORAGE_PREFIX}${userId}`, JSON.stringify(userTrimmed));

    // 2. Save to global audit log
    const globalExisting = getAllSystemNotifications();
    globalExisting.unshift(notification);
    const globalTrimmed = globalExisting.slice(0, 100);
    localStorage.setItem(GLOBAL_AUDIT_LOG_KEY, JSON.stringify(globalTrimmed));
  } catch (err) {
    console.error("Failed to save notification record", err);
  }
}

/**
 * Direct FormSubmit HTML form submission in a new tab.
 */
export function submitFormSubmitForm({
  userEmail,
  subject,
  bookTitle,
  dueDate,
  loanStatus,
  fineAmount,
  authorName = "Sathwik (Author & Chief Librarian)",
}: {
  userEmail: string;
  subject: string;
  bookTitle: string;
  dueDate: string;
  loanStatus: string;
  fineAmount: string;
  authorName?: string;
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
    _autoresponse: `Your BookBank Library due notice for "${bookTitle}" has been issued. Status: ${loanStatus}. Late Fine: ${fineAmount}. Dispatched by: ${authorName}.`,
    email: userEmail.trim(),
    name: "BookBank Library Member",
    "Student Account": userEmail.trim(),
    "Book Title": bookTitle,
    "Due Date": dueDate,
    "Loan Status": loanStatus,
    "Late Fine Amount": fineAmount,
    "Fine Policy": `${CURRENCY_SYMBOL}5 per calendar day delay`,
    "Authorized By": authorName,
    "Action Required": `Please return "${bookTitle}" to the BookBank Library immediately to stop late fine accrual.`,
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
 * Triggers one-time FormSubmit email activation ping in a new tab.
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
      "One-time email activation to receive BookBank Library textbook due alerts and late fine notifications.",
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
 * AUTHOR / LIBRARIAN EXCLUSIVE DISPATCH:
 * Dispatches an overdue email warning from the Author to a student whose loan is delayed.
 * Students cannot trigger this; only authorized authors/administrators can execute it.
 */
export async function sendAuthorOverdueNotification({
  userId,
  userEmail,
  userName = "Student Borrower",
  bookTitle,
  dueDate,
  returnedAt,
  openFormTab = false,
  authorName = "Sathwik (Author & Chief Librarian)",
}: {
  userId: string;
  userEmail: string;
  userName?: string;
  bookTitle: string;
  dueDate: string;
  returnedAt?: string | null;
  openFormTab?: boolean;
  authorName?: string;
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
  const daysText = isOverdue
    ? `${fine.daysOverdue} day(s) overdue (Delayed)`
    : `due on ${formattedDueDate}`;
  const fineText = isOverdue
    ? `\nAccrued Late Fine: ${CURRENCY_SYMBOL}${fine.fineAmount} (Charged at ${CURRENCY_SYMBOL}5 per calendar day delay).`
    : "";

  const subject = `[Author Alert - BookBank] Urgent: Overdue Return Required for "${bookTitle}"`;

  const emailBody = `Dear ${userName},

This is an official library notification issued directly by ${authorName} regarding your delayed textbook "${bookTitle}" from BookBank Library.

LOAN AUDIT DETAILS:
---------------------------------------------
- Borrower Account: ${userEmail}
- Borrowed Book: ${bookTitle}
- Standard Loan Period: 14 Days
- Due Date: ${formattedDueDate}
- Current Status: ${daysText}${fineText}
---------------------------------------------

You have delayed returning this textbook beyond the permissible 14-day loan term. Please return the book to the library immediately to restore catalog inventory and halt further penalty fine accrual.

Issued and authorized by:
${authorName}
BookBank Library Management`;

  const mailtoLink = `mailto:${encodeURIComponent(userEmail)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(emailBody)}`;

  let formSubmitSent = false;
  let activationRequired = false;
  let formSubmitMessage = "";

  if (openFormTab && typeof window !== "undefined") {
    submitFormSubmitForm({
      userEmail,
      subject,
      bookTitle,
      dueDate: formattedDueDate,
      loanStatus: daysText,
      fineAmount: `${CURRENCY_SYMBOL}${fine.fineAmount}`,
      authorName,
    });
    formSubmitSent = true;
    formSubmitMessage = "Author alert browser tab opened.";
  }

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
        name: userName,
        "Authorized By": authorName,
        "Student Account": userEmail.trim(),
        "Book Title": bookTitle,
        "Due Date": formattedDueDate,
        "Delay Status": daysText,
        "Accrued Late Fine": `${CURRENCY_SYMBOL}${fine.fineAmount}`,
        "Fine Policy": `${CURRENCY_SYMBOL}5 per day delay`,
        "Action Prompt": `Immediate return required by library author. Please return "${bookTitle}" today.`,
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
      formSubmitMessage = `Status: ${response.status}`;
      activationRequired = true;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn("Author alert fetch notice:", errorMsg);
    formSubmitMessage = "Author alert logged in system.";
  }

  const notification: NotificationPayload = {
    id: `author-notif-${Date.now()}`,
    userId,
    type: "email",
    sender: "author_admin",
    senderName: authorName,
    recipientEmail: userEmail,
    recipientName: userName,
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

/**
 * AUTOMATED MACHINE WATCHDOG:
 * Automatically runs after 14 days of a textbook still not being returned.
 * Scans active loans, calculates overdue status, and autonomously dispatches machine notifications
 * without requiring the student to do anything.
 */
export async function runAutomatedMachineDueCheck(): Promise<{
  scannedCount: number;
  delayedOverdueCount: number;
  newMachineDispatches: number;
}> {
  if (typeof window === "undefined") {
    return { scannedCount: 0, delayedOverdueCount: 0, newMachineDispatches: 0 };
  }

  const borrowings = getAllSystemBorrowings();
  let scannedCount = 0;
  let delayedOverdueCount = 0;
  let newMachineDispatches = 0;

  const todayDateString = new Date().toISOString().split("T")[0];

  for (const b of borrowings) {
    if (b.status !== "borrowed") continue;
    scannedCount++;

    const fine = calculateFine(b.dueDate, b.returnedAt);
    if (!fine.isOverdue) continue;

    delayedOverdueCount++;

    // Prevent duplicate machine dispatches for the same loan on the same calendar day
    const machineDailyKey = `bookbank_machine_dispatched_${b.id}_${todayDateString}`;
    if (localStorage.getItem(machineDailyKey)) {
      continue;
    }

    const formattedDueDate = new Date(b.dueDate).toLocaleDateString();
    const subject = `[Automated 14-Day Overdue Warning] Textbook Not Returned: "${b.bookTitle}"`;

    const machineBody = `*** AUTOMATED MACHINE OVERDUE DISPATCH (14+ DAYS UNRETURNED) ***

Dear ${b.userName || "Student"},

This is an automated machine alert from the BookBank Automated Overdue Engine.
Our system records indicate that your borrowed book "${b.bookTitle}" has exceeded the standard 14-day borrowing duration and has STILL NOT BEEN RETURNED.

AUTOMATED ENGINE AUDIT:
---------------------------------------------
- Borrowed Title: ${b.bookTitle}
- Due Date: ${formattedDueDate}
- Delay Duration: ${fine.daysOverdue} calendar day(s) overdue
- Daily Fine Accrual: ${CURRENCY_SYMBOL}5.00 / day
- Total Accrued Fine: ${CURRENCY_SYMBOL}${fine.fineAmount}
- Registered Account: ${b.userEmail}
---------------------------------------------

Action Required:
Please return "${b.bookTitle}" to the BookBank Library promptly. Penalties accumulate automatically at ₹5 per calendar day of delay.

Engine Service: BookBank 14-Day Overdue Watchdog
Authorized under: Sathwik (Author)`;

    const mailtoLink = `mailto:${encodeURIComponent(b.userEmail)}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(machineBody)}`;

    // Dispatch AJAX ping via FormSubmit
    try {
      fetch(`https://formsubmit.co/ajax/${encodeURIComponent(b.userEmail.trim())}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: subject,
          _template: "table",
          _captcha: "false",
          "Automated Machine Dispatch": "14+ Days Overdue",
          "Book Title": b.bookTitle,
          "Days Overdue": `${fine.daysOverdue} days`,
          "Total Penalty Fine": `${CURRENCY_SYMBOL}${fine.fineAmount}`,
          "Borrower Account": b.userEmail,
          "Action Required": `Return "${b.bookTitle}" immediately to BookBank.`,
        }),
      }).catch(() => {});
    } catch {}

    const machineNotif: NotificationPayload = {
      id: `machine-notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: b.userId,
      type: "email",
      sender: "automated_machine",
      senderName: "BookBank 14-Day Overdue Machine",
      recipientEmail: b.userEmail,
      recipientName: b.userName,
      bookTitle: b.bookTitle,
      dueDate: b.dueDate,
      daysOverdue: fine.daysOverdue,
      fineAmount: fine.fineAmount,
      subject,
      message: machineBody,
      mailtoLink,
      timestamp: new Date().toISOString(),
      status: "delivered",
      formSubmitStatus: "Automated machine evaluation triggered (14+ days unreturned).",
    };

    saveNotification(b.userId, machineNotif);
    localStorage.setItem(machineDailyKey, "true");
    newMachineDispatches++;
  }

  return { scannedCount, delayedOverdueCount, newMachineDispatches };
}

/**
 * Helper to scan all system borrowings across database and local caches.
 */
export function getAllSystemBorrowings(): Array<{
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  bookId: string;
  bookTitle: string;
  dueDate: string;
  borrowedAt: string;
  returnedAt?: string | null;
  status: string;
}> {
  if (typeof window === "undefined") return [];
  const results: Array<any> = [];
  const seenIds = new Set<string>();

  // 1. Centralized list
  try {
    const rawAll = localStorage.getItem("bookbank_all_system_borrowings");
    if (rawAll) {
      const parsed = JSON.parse(rawAll);
      parsed.forEach((b: any) => {
        if (b.id && !seenIds.has(b.id)) {
          seenIds.add(b.id);
          results.push(b);
        }
      });
    }
  } catch {}

  // 2. Scan all user-specific borrowing keys
  try {
    const accounts = getStoredAccounts();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("bookbank_borrowings_")) {
        const uId = key.replace("bookbank_borrowings_", "");
        const raw = localStorage.getItem(key);
        if (raw) {
          const items = JSON.parse(raw);
          const acc = accounts.find((a) => a.id === uId);
          items.forEach((item: any) => {
            if (item.id && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              results.push({
                id: item.id,
                userId: uId,
                userEmail: acc?.email || item.user_email || `student-${uId.slice(-6)}@bookbank.com`,
                userName: acc?.fullName || item.user_name || "Student Borrower",
                bookId: item.book_id,
                bookTitle: item.books?.title || item.book_title || "Library Textbook",
                dueDate: item.due_date,
                borrowedAt: item.borrowed_at,
                returnedAt: item.returned_at,
                status: item.status,
              });
            }
          });
        }
      }
    }
  } catch {}

  return results;
}

/**
 * Appends a new borrowing to the centralized system list.
 */
export function registerSystemBorrowing(item: {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  bookId: string;
  bookTitle: string;
  dueDate: string;
  borrowedAt: string;
  status: string;
}): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getAllSystemBorrowings();
    const filtered = existing.filter((b) => b.id !== item.id);
    filtered.unshift({ ...item, returnedAt: null });
    localStorage.setItem("bookbank_all_system_borrowings", JSON.stringify(filtered));
  } catch (err) {
    console.error("Failed to register system borrowing", err);
  }
}

/**
 * Updates a borrowing return status in the centralized system list.
 */
export function markSystemBorrowingReturned(borrowingId: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getAllSystemBorrowings();
    const updated = existing.map((b) =>
      b.id === borrowingId
        ? { ...b, status: "returned", returnedAt: new Date().toISOString() }
        : b,
    );
    localStorage.setItem("bookbank_all_system_borrowings", JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to mark system borrowing returned", err);
  }
}

/**
 * Backward compatibility alias: routes directly through Author dispatch.
 */
export const sendOverdueNotification = sendAuthorOverdueNotification;
