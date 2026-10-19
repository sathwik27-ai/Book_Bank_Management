import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calculateFine, CURRENCY_SYMBOL, DAILY_FINE_RATE } from "@/lib/fine-calculator";
import {
  sendOverdueNotification,
  getNotifications,
  submitFormSubmitForm,
  triggerFormSubmitActivation,
  type NotificationPayload,
} from "@/lib/notification-service";
import { toast } from "sonner";
import {
  BookmarkCheck,
  Clock,
  BookOpen,
  ArrowRight,
  RotateCcw,
  Bell,
  Mail,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Send,
} from "lucide-react";

export const Route = createFileRoute("/_app/borrowings")({
  component: BorrowingsPage,
  head: () => ({ meta: [{ title: "My Borrowings & Due Alerts — BookBank" }] }),
});

export interface BorrowingRecord {
  id: string;
  status: string;
  borrowed_at: string;
  due_date: string;
  returned_at: string | null;
  book_id: string;
  books: { title: string; author: string } | null;
}

export function BorrowingsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<BorrowingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "overdue" | "returned">("all");
  const [returningId, setReturningId] = useState<string | null>(null);
  const [sendingAlertId, setSendingAlertId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationPayload[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (user) {
      setNotifications(getNotifications(user.id));
    }
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Fetch from Supabase
      let supaList: BorrowingRecord[] = [];
      try {
        const { data, error } = await supabase
          .from("borrowings")
          .select("id,status,borrowed_at,due_date,returned_at,book_id, books(title, author)")
          .eq("user_id", user.id)
          .order("borrowed_at", { ascending: false });

        if (!error && data) {
          supaList = data as unknown as BorrowingRecord[];
        }
      } catch {
        // Fallback
      }

      // 2. Fetch from local borrowings
      let localList: BorrowingRecord[] = [];
      if (typeof window !== "undefined") {
        const borrowingsKey = `bookbank_borrowings_${user.id}`;
        const raw = localStorage.getItem(borrowingsKey);
        localList = raw ? JSON.parse(raw) : [];
      }

      // Merge avoiding duplicate IDs
      const combined = [...localList];
      supaList.forEach((sb) => {
        if (!combined.some((c) => c.id === sb.id || c.book_id === sb.book_id)) {
          combined.push(sb);
        }
      });

      setRows(combined);
      setNotifications(getNotifications(user.id));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function returnBook(record: BorrowingRecord) {
    setReturningId(record.id);

    try {
      try {
        await supabase
          .from("borrowings")
          .update({ status: "returned", returned_at: new Date().toISOString() })
          .eq("id", record.id);
      } catch {
        // Fallback
      }

      if (user && typeof window !== "undefined") {
        const borrowingsKey = `bookbank_borrowings_${user.id}`;
        const raw = localStorage.getItem(borrowingsKey);
        const list: BorrowingRecord[] = raw ? JSON.parse(raw) : [];

        const updated = list.map((item) => {
          if (item.id === record.id || item.book_id === record.book_id) {
            return {
              ...item,
              status: "returned",
              returned_at: new Date().toISOString(),
            };
          }
          return item;
        });

        localStorage.setItem(borrowingsKey, JSON.stringify(updated));

        const stockModsKey = "bookbank_stock_mods";
        const currentMods: Record<string, number> = JSON.parse(
          localStorage.getItem(stockModsKey) || "{}",
        );
        if (currentMods[record.book_id] !== undefined) {
          currentMods[record.book_id] += 1;
          localStorage.setItem(stockModsKey, JSON.stringify(currentMods));
        }
      }

      toast.success(`Returned "${record.books?.title || "book"}". Thank you!`);
      load();
    } catch (err: unknown) {
      console.error("Return error", err);
      const message = err instanceof Error ? err.message : "Failed to return book.";
      toast.error(message);
    } finally {
      setReturningId(null);
    }
  }

  async function handleSendReminder(record: BorrowingRecord, openDirectTab: boolean = false) {
    if (!user) return;
    setSendingAlertId(record.id);

    const bookTitle = record.books?.title || "Borrowed Textbook";
    const userEmail = user.email || "student@bookbank.local";

    try {
      const result = await sendOverdueNotification({
        userId: user.id,
        userEmail,
        bookTitle,
        dueDate: record.due_date,
        returnedAt: record.returned_at,
        openFormTab: openDirectTab,
      });

      setNotifications(getNotifications(user.id));

      if (openDirectTab) {
        toast.success(`🚀 FormSubmit submission tab opened for ${userEmail}!`, {
          description: "FormSubmit confirmation and delivery screen displayed in new tab.",
          duration: 7000,
        });
      } else if (result.activationRequired) {
        toast.warning(`⚠️ One-Time FormSubmit Activation Required`, {
          description:
            result.formSubmitMessage ||
            `Please check ${userEmail} (Inbox and Spam folder) for the confirmation email from FormSubmit and click 'Activate Form'.`,
          action: {
            label: "Open FormSubmit Direct",
            onClick: () => {
              submitFormSubmitForm({
                userEmail,
                subject: result.notification.subject,
                bookTitle,
                dueDate: new Date(record.due_date).toLocaleDateString(),
                loanStatus:
                  result.notification.daysOverdue > 0
                    ? `${result.notification.daysOverdue} days overdue`
                    : "Due soon",
                fineAmount: `${CURRENCY_SYMBOL}${result.notification.fineAmount}`,
              });
            },
          },
          duration: 9000,
        });
      } else if (result.formSubmitSent) {
        toast.success(`📧 Due alert email dispatched via FormSubmit to ${userEmail}!`, {
          description: "Notification delivered. Please check your Inbox and Spam/Junk folder.",
          action: {
            label: "Open Email App",
            onClick: () => {
              window.location.href = result.notification.mailtoLink;
            },
          },
          duration: 8000,
        });
      } else {
        toast.info(`📧 Due alert notification processed for ${userEmail}`, {
          description:
            result.formSubmitMessage ||
            "Notification recorded. You can also view details or open email app.",
          action: {
            label: "Open Email App",
            onClick: () => {
              window.location.href = result.notification.mailtoLink;
            },
          },
          duration: 7000,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Notification failed: ${msg}`);
    } finally {
      setSendingAlertId(null);
    }
  }

  // Calculate totals and statistics
  const activeLoans = useMemo(() => rows.filter((r) => r.status === "borrowed"), [rows]);
  const overdueLoans = useMemo(
    () => activeLoans.filter((r) => calculateFine(r.due_date).isOverdue),
    [activeLoans],
  );
  const returnedLoans = useMemo(() => rows.filter((r) => r.status === "returned"), [rows]);

  const totalPendingFines = useMemo(() => {
    return overdueLoans.reduce((sum, r) => sum + calculateFine(r.due_date).fineAmount, 0);
  }, [overdueLoans]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "active") return r.status === "borrowed";
      if (filter === "overdue") {
        return r.status === "borrowed" && calculateFine(r.due_date).isOverdue;
      }
      if (filter === "returned") return r.status === "returned";
      return true;
    });
  }, [rows, filter]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            My Borrowings & Due Alerts
          </h1>
          <p className="text-muted-foreground text-sm">
            Track active loans, calculate daily overdue fines ({CURRENCY_SYMBOL}
            {DAILY_FINE_RATE}/day), and receive automated email notifications to your registered
            account.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-xs"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell className="h-4 w-4 text-primary" />
            Email Alerts Log ({notifications.length})
          </Button>

          <Link to="/books">
            <Button size="sm" variant="default" className="gap-2 text-xs">
              <BookOpen className="h-4 w-4" /> Explore Catalog
            </Button>
          </Link>
        </div>
      </div>

      {/* Email Alerts Preferences Card */}
      <Card className="border bg-card/60 backdrop-blur shadow-sm">
        <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Automated Email Due Date & Fine Alerts</span>
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-300"
              >
                Active
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Automated notifications for book due dates and overdue fines ({CURRENCY_SYMBOL}5/day) are dispatched to your registered login email:{" "}
              <span className="font-semibold text-foreground underline decoration-primary/40">
                {user?.email}
              </span>
              . Delivered via FormSubmit.co with 0 external API keys required.
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1 flex items-center gap-1.5">
              <span>💡</span>
              <span>
                <strong>First-Time Inbox Setup:</strong> FormSubmit requires a one-time activation. If you haven't received alerts, check your <strong>Inbox and Spam folder</strong> for an email from <em>FormSubmit</em> and click <strong>"Activate Form"</strong>.
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5 border hover:bg-accent"
              onClick={() => {
                if (!user?.email) return;
                triggerFormSubmitActivation({ userEmail: user.email });
                toast.info(`🚀 FormSubmit verification opened in a new tab!`, {
                  description: `Check ${user.email} (Inbox & Spam folder) for FormSubmit's confirmation email and click "Activate Form".`,
                  duration: 8000,
                });
              }}
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              Verify / Activate Email on FormSubmit
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Outstanding Overdue Fines Banner */}
      {totalPendingFines > 0 && (
        <div className="rounded-xl p-4 bg-destructive/10 border border-destructive/30 text-destructive flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive text-white">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-sm">
                Outstanding Overdue Fines: {CURRENCY_SYMBOL}
                {totalPendingFines}
              </h4>
              <p className="text-xs opacity-90">
                You have {overdueLoans.length} textbook(s) past the 14-day loan period. Fines accrue
                daily at {CURRENCY_SYMBOL}
                {DAILY_FINE_RATE}/day until returned.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="text-xs shrink-0 self-end sm:self-auto"
            onClick={() => setFilter("overdue")}
          >
            Review Overdue Loans
          </Button>
        </div>
      )}

      {/* Notifications Drawer / History Panel */}
      {showNotifications && (
        <Card className="border border-primary/30 shadow-md animate-fade-in">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                Dispatched Email Due Alerts & Notification History
              </CardTitle>
              <CardDescription className="text-xs">
                Log of automated email due alerts dispatched to {user?.email}.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7"
              onClick={() => setShowNotifications(false)}
            >
              Close Log
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {notifications.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No notification alerts dispatched yet. Click "Send Due Alert" on any active loan
                below to test email notification dispatch!
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 rounded-lg border bg-muted/40 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-sky-500" />
                        <span>{n.subject}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {n.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        To: {n.recipientEmail} · {new Date(n.timestamp).toLocaleString()}
                      </p>
                    </div>

                    <a
                      href={n.mailtoLink}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium shrink-0 self-end sm:self-auto"
                    >
                      Open in Email App <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as "all" | "active" | "overdue" | "returned")}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid grid-cols-4 w-full sm:w-auto">
            <TabsTrigger value="all" className="text-xs">
              All ({rows.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="text-xs">
              Active ({activeLoans.length})
            </TabsTrigger>
            <TabsTrigger value="overdue" className="text-xs text-destructive">
              Overdue ({overdueLoans.length})
            </TabsTrigger>
            <TabsTrigger value="returned" className="text-xs">
              Returned ({returnedLoans.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <span className="text-xs text-muted-foreground self-end sm:self-auto">
          Showing {filteredRows.length} of {rows.length} total loan(s)
        </span>
      </div>

      {/* Loans Grid / Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse border" />
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-16 border rounded-2xl bg-card/40 p-8 space-y-3">
          <BookmarkCheck className="h-10 w-10 text-muted-foreground mx-auto" />
          <h3 className="text-base font-semibold">
            {filter === "all"
              ? "No borrowed books yet"
              : filter === "active"
                ? "No active loans"
                : filter === "overdue"
                  ? "No overdue loans! You are all caught up."
                  : "No returned books yet"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {filter === "all" || filter === "active"
              ? "Browse through our collection of textbooks and borrow available copies for your academic terms."
              : "Keep up the great work returning your course materials on schedule."}
          </p>
          <Link to="/books">
            <Button size="sm" className="mt-4 gap-2">
              Browse Books Catalog <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((r) => {
            const dueDate = new Date(r.due_date);
            const isReturning = returningId === r.id;
            const isSendingAlert = sendingAlertId === r.id;
            const fine = calculateFine(r.due_date, r.returned_at);

            return (
              <Card
                key={r.id}
                className="transition-all duration-200 hover:shadow-md border bg-card/90"
              >
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-base leading-tight">
                        {r.books?.title ?? "Book details unavailable"}
                      </h3>

                      {r.status === "returned" ? (
                        <Badge variant="secondary" className="text-[11px] font-medium gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Returned
                        </Badge>
                      ) : fine.isOverdue ? (
                        <Badge variant="destructive" className="text-[11px] font-medium gap-1">
                          <AlertTriangle className="h-3 w-3" /> Overdue ({fine.daysOverdue} days)
                        </Badge>
                      ) : (
                        <Badge variant="default" className="text-[11px] font-medium">
                          Active Loan
                        </Badge>
                      )}

                      {fine.isOverdue && (
                        <Badge
                          variant="outline"
                          className="text-[11px] font-semibold text-destructive border-destructive/40 bg-destructive/5"
                        >
                          Fine: {fine.formattedFine} ({fine.daysOverdue} days @ {CURRENCY_SYMBOL}
                          {DAILY_FINE_RATE}/day)
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      by {r.books?.author ?? "Unknown Author"}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Borrowed: {new Date(r.borrowed_at).toLocaleDateString()}
                      </span>
                      <span>·</span>
                      <span
                        className={
                          fine.isOverdue && r.status === "borrowed"
                            ? "text-destructive font-semibold"
                            : ""
                        }
                      >
                        Due Date: {dueDate.toLocaleDateString()}
                      </span>
                      {r.returned_at && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Returned on {new Date(r.returned_at).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto shrink-0">
                    {r.status === "borrowed" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs border-primary/30 hover:bg-primary/10"
                          onClick={() => handleSendReminder(r, false)}
                          disabled={isSendingAlert}
                          title="Dispatch automated due alert and late fine notification via FormSubmit to registered email"
                        >
                          <Mail className="h-3.5 w-3.5 text-primary" />
                          {isSendingAlert ? "Sending..." : "Send Due Alert (Email)"}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-xs text-muted-foreground hover:text-foreground h-9 px-2.5 border border-dashed border-border/60 hover:border-primary/40"
                          onClick={() => handleSendReminder(r, true)}
                          disabled={isSendingAlert}
                          title="Open FormSubmit delivery & verification screen directly in a new tab"
                        >
                          <ExternalLink className="h-3 w-3 text-primary" />
                          Direct Tab
                        </Button>

                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1.5 text-xs"
                          onClick={() => returnBook(r)}
                          disabled={isReturning}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {isReturning ? "Returning..." : "Return Book"}
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
