import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Library, Clock, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState({ books: 0, available: 0, borrowed: 0, returned: 0 });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: books } = await supabase.from("books").select("available_copies, total_copies");
      const totalBooks = books?.length ?? 0;
      const totalAvailable = books?.reduce((s, b) => s + (b.available_copies ?? 0), 0) ?? 0;
      const { count: borrowed } = await supabase.from("borrowings").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "borrowed");
      const { count: returned } = await supabase.from("borrowings").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "returned");
      setStats({ books: totalBooks, available: totalAvailable, borrowed: borrowed ?? 0, returned: returned ?? 0 });
    })();
  }, [user]);

  const cards = [
    { label: "Total titles", value: stats.books, icon: Library, color: "text-primary" },
    { label: "Copies available", value: stats.available, icon: BookOpen, color: "text-accent-foreground" },
    { label: "Currently borrowed", value: stats.borrowed, icon: Clock, color: "text-primary" },
    { label: "Returned", value: stats.returned, icon: CheckCircle2, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}</h1>
        <p className="text-muted-foreground">Signed in as <span className="capitalize font-medium">{role ?? "user"}</span></p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} style={{ background: "var(--gradient-card)" }}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Quick tips</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Head to <strong>Books</strong> to search the catalog and borrow titles.</p>
          <p>• Track borrowed titles and return them from <strong>My Borrowings</strong>.</p>
          {role === "admin" && <p>• Use the <strong>Admin</strong> page to add or edit books in the catalog.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
