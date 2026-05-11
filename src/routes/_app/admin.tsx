import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, BookOpen, Library, Layers, ShieldCheck, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
});

type Book = {
  id: string;
  title: string;
  author: string;
  category: string | null;
  description: string | null;
  total_copies: number;
  available_copies: number;
};

function AdminPage() {
  const { isAdmin, loading: authLoading, role } = useAuth();
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ title: "", author: "", category: "", description: "", total_copies: 1 });

  async function load() {
    const { data } = await supabase.from("books").select("*").order("created_at", { ascending: false });
    setBooks(data ?? []);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    // Only redirect after auth + role are resolved
    if (authLoading) return;
    if (role === null) return; // still resolving role
    if (!isAdmin) {
      toast.error("Admin access required");
      router.navigate({ to: "/dashboard" });
    }
  }, [authLoading, isAdmin, role, router]);

  if (authLoading || role === null) {
    return <div className="text-muted-foreground">Checking admin access…</div>;
  }
  if (!isAdmin) return null;

  async function addBook(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("books").insert({
      title: form.title,
      author: form.author,
      category: form.category || null,
      description: form.description || null,
      total_copies: form.total_copies,
      available_copies: form.total_copies,
    });
    if (error) return toast.error(error.message);
    toast.success("Book added");
    setForm({ title: "", author: "", category: "", description: "", total_copies: 1 });
    load();
  }

  async function del(id: string) {
    if (!confirm("Delete this book?")) return;
    const { error } = await supabase.from("books").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Book deleted");
    load();
  }

  const filtered = books.filter((b) => {
    const s = q.toLowerCase();
    return !s || b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s) || (b.category ?? "").toLowerCase().includes(s);
  });

  const totalCopies = books.reduce((s, b) => s + b.total_copies, 0);
  const totalAvailable = books.reduce((s, b) => s + b.available_copies, 0);
  const categoryCount = new Set(books.map((b) => b.category).filter(Boolean)).size;

  const stats = [
    { label: "Titles", value: books.length, icon: Library },
    { label: "Total copies", value: totalCopies, icon: BookOpen },
    { label: "Available", value: totalAvailable, icon: ShieldCheck },
    { label: "Categories", value: categoryCount, icon: Layers },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 sm:p-8 text-primary-foreground" style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-elegant)" }}>
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="h-7 w-7" />
          <h1 className="text-2xl sm:text-3xl font-bold">Admin Console</h1>
        </div>
        <p className="opacity-90 text-sm sm:text-base">Curate the catalog, monitor inventory, and manage availability.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => (
          <Card key={s.label} style={{ background: "var(--gradient-card)" }}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm text-muted-foreground">{s.label}</span>
                <s.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Add a new book</CardTitle>
          <CardDescription>Provide title, author and total copies. Category is optional but recommended.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addBook} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Author</Label>
              <Input required value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input placeholder="e.g. Fiction · Mystery" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Total copies</Label>
              <Input type="number" min={1} value={form.total_copies} onChange={(e) => setForm({ ...form, total_copies: Number(e.target.value) })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full sm:w-auto">Add book</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>Catalog</CardTitle>
            <CardDescription>{filtered.length} of {books.length} books</CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search catalog…" className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((b) => (
              <div key={b.id} className="border rounded-xl p-4 flex flex-col gap-2 hover:shadow-md transition-shadow" style={{ background: "var(--gradient-card)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{b.title}</div>
                    <div className="text-xs text-muted-foreground truncate">by {b.author}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => del(b.id)} aria-label="Delete book">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {b.category && <Badge variant="outline" className="text-xs">{b.category}</Badge>}
                  <Badge variant={b.available_copies > 0 ? "default" : "secondary"} className="text-xs">
                    {b.available_copies}/{b.total_copies} available
                  </Badge>
                </div>
                {b.description && <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full text-center py-8">No books match your search.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
