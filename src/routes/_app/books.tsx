import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/books")({
  component: BooksPage,
});

type Book = {
  id: string;
  title: string;
  author: string;
  category: string | null;
  description: string | null;
  available_copies: number;
  total_copies: number;
};

// Top-level group keywords mapped from category prefixes
const GROUPS: { key: string; label: string; match: (c: string) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "fiction", label: "Fiction", match: (c) => c.startsWith("Fiction") },
  { key: "mystery", label: "Mystery & Thriller", match: (c) => c.startsWith("Mystery") },
  { key: "scifi", label: "Sci‑Fi & Fantasy", match: (c) => c.startsWith("Sci-Fi") || c.startsWith("Fantasy") },
  { key: "story", label: "Storytelling", match: (c) => c.startsWith("Storytelling") },
  { key: "nonfic", label: "Non‑fiction", match: (c) => c.startsWith("Non-fiction") },
  { key: "subject", label: "Subjects (Courses)", match: (c) => c.startsWith("Subject") },
];

function BooksPage() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const [sub, setSub] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("books").select("*").order("title");
    setBooks(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const inGroup = useMemo(
    () => books.filter((b) => GROUPS.find((g) => g.key === group)!.match(b.category ?? "")),
    [books, group]
  );

  // Sub-categories within selected group (e.g. Fiction · Classic, Subject · Computer Science · …)
  const subOptions = useMemo(() => {
    if (group === "all") return [] as string[];
    const set = new Set<string>();
    inGroup.forEach((b) => {
      const parts = (b.category ?? "").split("·").map((s) => s.trim());
      // For subjects, sub = the discipline (parts[1]); else parts[1] if present
      const s = parts[1];
      if (s) set.add(s);
    });
    return Array.from(set).sort();
  }, [inGroup, group]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return inGroup.filter((b) => {
      const matchQ = !s || b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s) || (b.category ?? "").toLowerCase().includes(s);
      const matchSub = sub === "all" || (b.category ?? "").includes(sub);
      return matchQ && matchSub;
    });
  }, [inGroup, q, sub]);

  async function borrow(b: Book) {
    if (!user) return;
    if (b.available_copies <= 0) return toast.error("No copies available");
    const { error } = await supabase.from("borrowings").insert({ book_id: b.id, user_id: user.id });
    if (error) return toast.error(error.message);
    toast.success(`Borrowed "${b.title}". Due in 14 days.`);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 sm:p-8 text-primary-foreground" style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-elegant)" }}>
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-6 w-6" />
          <h1 className="text-2xl sm:text-3xl font-bold">Explore the Library</h1>
        </div>
        <p className="opacity-90 text-sm sm:text-base">Browse by genre, storytelling, or course-wise subjects.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, author, category…" className="pl-9" />
      </div>

      {/* Group chips */}
      <div className="flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <Button
            key={g.key}
            size="sm"
            variant={group === g.key ? "default" : "outline"}
            className="rounded-full"
            onClick={() => { setGroup(g.key); setSub("all"); }}
          >
            {g.label}
          </Button>
        ))}
      </div>

      {/* Sub-category chips */}
      {subOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={sub === "all" ? "secondary" : "ghost"} className="rounded-full" onClick={() => setSub("all")}>
            All {GROUPS.find((g) => g.key === group)?.label}
          </Button>
          {subOptions.map((s) => (
            <Button key={s} size="sm" variant={sub === s ? "secondary" : "ghost"} className="rounded-full" onClick={() => setSub(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No books found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((b) => (
            <Card key={b.id} className={cn("overflow-hidden hover:shadow-lg transition-shadow group")} style={{ background: "var(--gradient-card)" }}>
              <CardContent className="p-5 space-y-3 flex flex-col h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center text-primary-foreground shrink-0" style={{ background: "var(--gradient-primary)" }}>
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <Badge variant={b.available_copies > 0 ? "default" : "secondary"}>
                    {b.available_copies > 0 ? `${b.available_copies} left` : "Out"}
                  </Badge>
                </div>
                <div>
                  <h3 className="font-semibold text-base leading-tight line-clamp-2">{b.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">by {b.author}</p>
                </div>
                {b.category && <Badge variant="outline" className="text-[10px] w-fit">{b.category}</Badge>}
                {b.description && <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{b.description}</p>}
                <Button size="sm" className="w-full mt-auto" onClick={() => borrow(b)} disabled={b.available_copies <= 0}>
                  Borrow
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
