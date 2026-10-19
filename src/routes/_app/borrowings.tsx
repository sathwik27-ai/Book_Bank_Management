import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/borrowings")({
  component: BorrowingsPage,
});

type Row = {
  id: string;
  status: string;
  borrowed_at: string;
  due_date: string;
  returned_at: string | null;
  book_id: string;
  books: { title: string; author: string } | null;
};

function BorrowingsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("borrowings")
      .select("id,status,borrowed_at,due_date,returned_at,book_id, books(title, author)")
      .eq("user_id", user.id)
      .order("borrowed_at", { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }, [user]);
  useEffect(() => {
    load();
  }, [load]);

  async function returnBook(id: string) {
    const { error } = await supabase
      .from("borrowings")
      .update({ status: "returned", returned_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Book returned. Thanks!");
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Borrowings</h1>
        <p className="text-muted-foreground">Track your borrowed books and return them.</p>
      </div>
      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">You haven't borrowed any books yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const overdue = r.status === "borrowed" && new Date(r.due_date) < new Date();
            return (
              <Card key={r.id}>
                <CardContent className="p-4 flex flex-wrap items-center gap-4 justify-between">
                  <div>
                    <h3 className="font-semibold">{r.books?.title ?? "Unknown book"}</h3>
                    <p className="text-sm text-muted-foreground">by {r.books?.author}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Borrowed {new Date(r.borrowed_at).toLocaleDateString()} · Due{" "}
                      {new Date(r.due_date).toLocaleDateString()}
                      {r.returned_at &&
                        ` · Returned ${new Date(r.returned_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        r.status === "returned" ? "secondary" : overdue ? "destructive" : "default"
                      }
                    >
                      {r.status === "returned" ? "Returned" : overdue ? "Overdue" : "Borrowed"}
                    </Badge>
                    {r.status === "borrowed" && (
                      <Button size="sm" onClick={() => returnBook(r.id)}>
                        Return
                      </Button>
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
