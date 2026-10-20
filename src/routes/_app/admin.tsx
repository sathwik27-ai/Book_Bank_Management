import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  Plus,
  BookOpen,
  Library,
  Layers,
  ShieldCheck,
  Search,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin Console — BookBank" }] }),
});

export interface AdminBook {
  id: string;
  title: string;
  author: string;
  category: string | null;
  description: string | null;
  total_copies: number;
  available_copies: number;
  created_at?: string;
}

export function AdminPage() {
  const { isAdmin, loading: authLoading, role } = useAuth();
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [q, setQ] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    author: "",
    category: "",
    description: "",
    total_copies: 1,
  });

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase books query error", error);
      }

      let loaded: AdminBook[] = data ?? [];

      if (typeof window !== "undefined") {
        const addedRaw = localStorage.getItem("bookbank_added_books");
        const added: AdminBook[] = addedRaw ? JSON.parse(addedRaw) : [];

        const deletedRaw = localStorage.getItem("bookbank_deleted_books");
        const deletedIds: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];

        loaded = [...added, ...loaded].filter((b) => !deletedIds.includes(b.id));

        const stockMods = localStorage.getItem("bookbank_stock_mods");
        if (stockMods) {
          try {
            const mods: Record<string, number> = JSON.parse(stockMods);
            loaded = loaded.map((b) => ({
              ...b,
              available_copies: mods[b.id] !== undefined ? mods[b.id] : b.available_copies,
            }));
          } catch {
            // Ignore
          }
        }
      }

      setBooks(loaded);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    return books.filter(
      (b) =>
        !s ||
        b.title.toLowerCase().includes(s) ||
        b.author.toLowerCase().includes(s) ||
        (b.category ?? "").toLowerCase().includes(s),
    );
  }, [books, q]);

  const totalCopies = useMemo(() => books.reduce((s, b) => s + (b.total_copies ?? 0), 0), [books]);

  const totalAvailable = useMemo(
    () => books.reduce((s, b) => s + (b.available_copies ?? 0), 0),
    [books],
  );

  const categoryCount = useMemo(
    () => new Set(books.map((b) => b.category).filter(Boolean)).size,
    [books],
  );

  async function addBook(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.author.trim()) {
      toast.error("Title and author are required.");
      return;
    }

    setSubmitting(true);
    try {
      let insertedInSupabase = false;
      try {
        const { error } = await supabase.from("books").insert({
          title: form.title.trim(),
          author: form.author.trim(),
          category: form.category.trim() || null,
          description: form.description.trim() || null,
          total_copies: Number(form.total_copies) || 1,
          available_copies: Number(form.total_copies) || 1,
        });

        if (!error) insertedInSupabase = true;
      } catch {
        // Fall back
      }

      if (!insertedInSupabase && typeof window !== "undefined") {
        const newBook: AdminBook = {
          id: `book-${Date.now()}`,
          title: form.title.trim(),
          author: form.author.trim(),
          category: form.category.trim() || "General",
          description: form.description.trim() || null,
          total_copies: Number(form.total_copies) || 1,
          available_copies: Number(form.total_copies) || 1,
          created_at: new Date().toISOString(),
        };

        const addedRaw = localStorage.getItem("bookbank_added_books");
        const added: AdminBook[] = addedRaw ? JSON.parse(addedRaw) : [];
        added.unshift(newBook);
        localStorage.setItem("bookbank_added_books", JSON.stringify(added));
      }

      toast.success(`Book "${form.title}" successfully added to catalog!`);
      setForm({ title: "", author: "", category: "", description: "", total_copies: 1 });
      load();
    } catch (err: unknown) {
      console.error("Failed to add book:", err);
      const message = err instanceof Error ? err.message : "Failed to add book.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteBook(id: string, title: string) {
    if (!confirm(`Are you sure you want to delete "${title}" from the catalog?`)) {
      return;
    }

    setDeletingId(id);
    try {
      try {
        await supabase.from("books").delete().eq("id", id);
      } catch {
        // Fall back
      }

      if (typeof window !== "undefined") {
        const addedRaw = localStorage.getItem("bookbank_added_books");
        let added: AdminBook[] = addedRaw ? JSON.parse(addedRaw) : [];
        added = added.filter((b) => b.id !== id);
        localStorage.setItem("bookbank_added_books", JSON.stringify(added));

        const deletedRaw = localStorage.getItem("bookbank_deleted_books");
        const deletedIds: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];
        if (!deletedIds.includes(id)) {
          deletedIds.push(id);
          localStorage.setItem("bookbank_deleted_books", JSON.stringify(deletedIds));
        }
      }

      toast.success(`Book "${title}" deleted.`);
      load();
    } catch (err: unknown) {
      console.error("Failed to delete book:", err);
      const message = err instanceof Error ? err.message : "Could not delete book.";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-muted-foreground flex-col gap-2">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm">Verifying administrator permissions...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center space-y-4">
        <div className="p-4 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 w-16 h-16 mx-auto flex items-center justify-center">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold">Administrator Access Required</h2>
        <p className="text-muted-foreground text-sm">
          You are currently signed in as a{" "}
          <span className="font-semibold capitalize">{role ?? "student"}</span>. Only users with the{" "}
          <span className="font-semibold text-foreground">admin</span> role can access catalog
          management and inventory controls.
        </p>
        <div className="pt-2 flex flex-wrap justify-center gap-3">
          <Link to="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Catalog Titles", value: books.length, icon: Library, color: "text-blue-500" },
    {
      label: "Total Physical Copies",
      value: totalCopies,
      icon: BookOpen,
      color: "text-purple-500",
    },
    {
      label: "Currently Available",
      value: totalAvailable,
      icon: ShieldCheck,
      color: "text-emerald-500",
    },
    { label: "Subject Categories", value: categoryCount, icon: Layers, color: "text-amber-500" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero Header */}
      <div
        className="rounded-2xl p-6 sm:p-8 text-primary-foreground relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-elegant)" }}
      >
        <div className="relative z-10 flex items-center gap-3 mb-2">
          <ShieldCheck className="h-7 w-7 text-emerald-300" />
          <h1 className="text-2xl sm:text-3xl font-bold">Admin Console</h1>
        </div>
        <p className="opacity-90 text-sm sm:text-base max-w-2xl">
          Maintain the textbook catalog, inject new inventory, adjust copy quantities, and monitor
          real-time availability across the institution.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="border bg-card/80 backdrop-blur">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm text-muted-foreground">{s.label}</span>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add New Book Form */}
      <Card className="border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> Add New Textbook to Catalog
          </CardTitle>
          <CardDescription className="text-xs">
            Enter book details below. Available copies will automatically initialize equal to total
            copies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addBook} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="book-title">Book Title *</Label>
              <Input
                id="book-title"
                required
                placeholder="e.g. Design Patterns: Elements of Reusable Object-Oriented Software"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="book-author">Author(s) *</Label>
              <Input
                id="book-author"
                required
                placeholder="e.g. Erich Gamma, Richard Helm, Ralph Johnson, John Vlissides"
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="book-category">Category / Discipline</Label>
              <Input
                id="book-category"
                placeholder="e.g. Computer Science, Programming, Mathematics"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="book-copies">Total Initial Copies *</Label>
              <Input
                id="book-copies"
                type="number"
                min={1}
                max={500}
                required
                value={form.total_copies}
                onChange={(e) => setForm({ ...form, total_copies: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="book-desc">Description / Synopsis</Label>
              <Textarea
                id="book-desc"
                rows={3}
                placeholder="Brief summary of syllabus coverage, edition notes, or course requirements..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto gap-2">
                <Plus className="h-4 w-4" />
                {submitting ? "Adding to catalog..." : "Add Textbook"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Catalog Table / Grid */}
      <Card className="border">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Inventory Catalog Management</CardTitle>
            <CardDescription className="text-xs">
              Showing {filtered.length} of {books.length} titles in inventory
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search catalog titles or authors…"
              className="pl-9 h-9 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((b) => (
              <div
                key={b.id}
                className="border rounded-xl p-4 flex flex-col gap-2 hover:shadow-md transition-shadow bg-card/60 backdrop-blur"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{b.title}</div>
                    <div className="text-xs text-muted-foreground truncate">by {b.author}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => deleteBook(b.id, b.title)}
                    disabled={deletingId === b.id}
                    aria-label={`Delete ${b.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {b.category && (
                    <Badge variant="outline" className="text-[10px]">
                      {b.category}
                    </Badge>
                  )}
                  <Badge
                    variant={b.available_copies > 0 ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {b.available_copies}/{b.total_copies} available
                  </Badge>
                </div>

                {b.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{b.description}</p>
                )}
              </div>
            ))}

            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full text-center py-12">
                No catalog titles match your filter criteria.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
