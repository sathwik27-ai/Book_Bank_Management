import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { calculateFine, CURRENCY_SYMBOL, DAILY_FINE_RATE } from "@/lib/fine-calculator";
import {
  BookOpen,
  Library,
  Clock,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  PlusCircle,
  BookmarkCheck,
  Sparkles,
  AlertTriangle,
  Mail,
  Coins,
} from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

interface DashboardStats {
  books: number;
  totalCopies: number;
  available: number;
  borrowed: number;
  returned: number;
  overdue: number;
  totalFine: number;
}

export function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    books: 0,
    totalCopies: 0,
    available: 0,
    borrowed: 0,
    returned: 0,
    overdue: 0,
    totalFine: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Load book catalog statistics
      const { data: books } = await supabase.from("books").select("available_copies, total_copies");

      const totalTitles = books?.length ?? 0;
      const totalCopiesCount = books?.reduce((s, b) => s + (b.total_copies ?? 0), 0) ?? 0;
      const totalAvailable = books?.reduce((s, b) => s + (b.available_copies ?? 0), 0) ?? 0;

      // 2. Load borrowings statistics (Admin sees system-wide, Student sees personal)
      let borrowedCount = 0;
      let returnedCount = 0;
      let overdueCount = 0;
      let totalFineSum = 0;

      if (isAdmin) {
        const { data: allBorrowings } = await supabase.from("borrowings").select("*");
        if (allBorrowings) {
          allBorrowings.forEach((b) => {
            if (b.status === "borrowed") {
              borrowedCount++;
              const fine = calculateFine(b.due_date, b.returned_at);
              if (fine.isOverdue) {
                overdueCount++;
                totalFineSum += fine.fineAmount;
              }
            } else if (b.status === "returned") {
              returnedCount++;
            }
          });
        }
      } else {
        const { data: userBorrowings } = await supabase
          .from("borrowings")
          .select("*")
          .eq("user_id", user.id);

        if (userBorrowings) {
          userBorrowings.forEach((b) => {
            if (b.status === "borrowed") {
              borrowedCount++;
              const fine = calculateFine(b.due_date, b.returned_at);
              if (fine.isOverdue) {
                overdueCount++;
                totalFineSum += fine.fineAmount;
              }
            } else if (b.status === "returned") {
              returnedCount++;
            }
          });
        }
      }

      // Check localStorage backup
      if (typeof window !== "undefined") {
        const borrowingsKey = `bookbank_borrowings_${user.id}`;
        const raw = localStorage.getItem(borrowingsKey);
        if (raw) {
          interface LocalBorrowing {
            status: string;
            due_date: string;
            returned_at?: string | null;
          }
          const localList: LocalBorrowing[] = JSON.parse(raw);
          const activeLocal = localList.filter((b) => b.status === "borrowed");
          borrowedCount = Math.max(borrowedCount, activeLocal.length);
          const localReturned = localList.filter((b) => b.status === "returned").length;
          returnedCount = Math.max(returnedCount, localReturned);

          let localOverdue = 0;
          let localFines = 0;
          activeLocal.forEach((b) => {
            const f = calculateFine(b.due_date, b.returned_at);
            if (f.isOverdue) {
              localOverdue++;
              localFines += f.fineAmount;
            }
          });
          overdueCount = Math.max(overdueCount, localOverdue);
          totalFineSum = Math.max(totalFineSum, localFines);
        }
      }

      setStats({
        books: totalTitles,
        totalCopies: totalCopiesCount,
        available: totalAvailable,
        borrowed: borrowedCount,
        returned: returnedCount,
        overdue: overdueCount,
        totalFine: totalFineSum,
      });
    } catch (err) {
      console.error("Failed to load dashboard metrics", err);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const cards = [
    {
      label: "Total Titles",
      value: stats.books,
      sub: `${stats.totalCopies} physical copies`,
      icon: Library,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Copies Available",
      value: stats.available,
      sub: `${stats.totalCopies - stats.available} currently issued`,
      icon: BookOpen,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: isAdmin ? "Active Circulation" : "My Active Loans",
      value: stats.borrowed,
      sub: stats.overdue > 0 ? `${stats.overdue} overdue loan(s)` : "All on schedule",
      icon: Clock,
      color: stats.overdue > 0 ? "text-amber-500" : "text-indigo-500",
      bg: stats.overdue > 0 ? "bg-amber-500/10" : "bg-indigo-500/10",
    },
    {
      label: stats.overdue > 0 ? "Accrued Fines" : "Returned Books",
      value: stats.overdue > 0 ? `${CURRENCY_SYMBOL}${stats.totalFine}` : stats.returned,
      sub:
        stats.overdue > 0
          ? `Rate: ${CURRENCY_SYMBOL}${DAILY_FINE_RATE}/day overdue`
          : "Clean return record",
      icon: stats.overdue > 0 ? Coins : CheckCircle2,
      color: stats.overdue > 0 ? "text-rose-500" : "text-purple-500",
      bg: stats.overdue > 0 ? "bg-rose-500/10" : "bg-purple-500/10",
    },
  ];

  const displayName =
    user?.user_metadata?.full_name || (user?.email ? user.email.split("@")[0] : "User");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Banner */}
      <div
        className="rounded-2xl p-6 sm:p-8 text-primary-foreground relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-elegant)" }}
      >
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-amber-300" />
              <span className="text-xs font-semibold tracking-wider uppercase opacity-80">
                {isAdmin ? "Library Administrator Portal" : "Student Book Bank Hub"}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back, {displayName}
            </h1>
            <p className="mt-1 text-sm opacity-90 max-w-xl">
              {isAdmin
                ? "Monitor inventory levels, catalog distribution, and student loans in real time."
                : "Search course titles, borrow available textbooks for 14-day terms, and track returns."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <Link to="/books">
              <Button size="sm" variant="secondary" className="gap-2 text-xs">
                <BookOpen className="h-4 w-4" /> Browse Catalog
              </Button>
            </Link>
            {isAdmin && (
              <Link to="/admin">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-xs bg-card/20 hover:bg-card/40 border-white/20 text-white"
                >
                  <PlusCircle className="h-4 w-4" /> Add Book
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card
            key={c.label}
            className="border bg-card/80 backdrop-blur transition-all duration-200 hover:shadow-md"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
              <div className={`p-2 rounded-lg ${c.bg}`}>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{loading ? "—" : c.value}</div>
              <p className="text-[11px] text-muted-foreground mt-1">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Overdue Warning Banner if applicable */}
      {stats.overdue > 0 && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-rose-700 dark:text-rose-300 text-sm sm:text-base">
                Action Required: {stats.overdue} Overdue Book{stats.overdue > 1 ? "s" : ""}
              </h3>
              <p className="text-xs text-rose-600/90 dark:text-rose-400/90 mt-0.5">
                Accrued late fine:{" "}
                <strong className="font-bold underline">
                  {CURRENCY_SYMBOL}
                  {stats.totalFine}
                </strong>{" "}
                (calculated at {CURRENCY_SYMBOL}
                {DAILY_FINE_RATE}/day delay). Automated email alerts have been dispatched.
              </p>
            </div>
          </div>
          <Link to="/borrowings">
            <Button size="sm" variant="destructive" className="text-xs whitespace-nowrap">
              Review Loans & Returns
            </Button>
          </Link>
        </div>
      )}

      {/* Quick Access Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border hover:border-primary/50 transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Books Catalog
            </CardTitle>
            <CardDescription className="text-xs">
              Explore all textbook titles, course materials, and available copies.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link to="/books">
              <Button variant="ghost" size="sm" className="w-full justify-between text-xs">
                <span>View all titles</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border hover:border-primary/50 transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookmarkCheck className="h-5 w-5 text-emerald-500" />
              My Borrowings
            </CardTitle>
            <CardDescription className="text-xs">
              Review your active book loans, check due dates, and record returns.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link to="/borrowings">
              <Button variant="ghost" size="sm" className="w-full justify-between text-xs">
                <span>Manage my loans</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card className="border border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60 transition-colors">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
                Admin Console
              </CardTitle>
              <CardDescription className="text-xs">
                Full administrative rights: Add books, update catalog, manage copies.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Link to="/admin">
                <Button
                  size="sm"
                  className="w-full justify-between text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <span>Open Admin Console</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                Loan & Due Policy
              </CardTitle>
              <CardDescription className="text-xs">
                Standard loan term is 14 days per textbook. Fine rate: {CURRENCY_SYMBOL}
                {DAILY_FINE_RATE}/day delay.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Mail className="h-3 w-3 text-sky-500" /> Automated Email Notifications Active
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
