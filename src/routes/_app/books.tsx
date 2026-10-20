import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen, Sparkles, BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/books")({
  component: BooksPage,
});

export interface Book {
  id: string;
  title: string;
  author: string;
  category: string | null;
  description: string | null;
  available_copies: number;
  total_copies: number;
}

export interface UserBorrowingItem {
  id: string;
  book_id: string;
  user_id: string;
  borrowed_at: string;
  due_date: string;
  returned_at: string | null;
  status: string;
  books: { title: string; author: string };
}

export function BooksPage() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [q, setQ] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [borrowingId, setBorrowingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("books").select("*").order("title");
      if (error) {
        console.error("Failed to fetch books from Supabase", error);
      }
      let loadedBooks = data ?? [];

      // Check any local added books (admin additions)
      if (typeof window !== "undefined") {
        const addedRaw = localStorage.getItem("bookbank_added_books");
        const added: Book[] = addedRaw ? JSON.parse(addedRaw) : [];

        const deletedRaw = localStorage.getItem("bookbank_deleted_books");
        const deletedIds: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];

        loadedBooks = [...added, ...loadedBooks].filter((b) => !deletedIds.includes(b.id));

        // Apply local stock modifications
        const stockMods = localStorage.getItem("bookbank_stock_mods");
        if (stockMods) {
          try {
            const mods: Record<string, number> = JSON.parse(stockMods);
            loadedBooks = loadedBooks.map((b) => ({
              ...b,
              available_copies: mods[b.id] !== undefined ? mods[b.id] : b.available_copies,
            }));
          } catch {
            // Ignore
          }
        }
      }

      setBooks(loadedBooks);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Compute dynamic category list from actual books in catalog
  const categories = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => {
      if (b.category) {
        const main = b.category.split("·")[0].trim();
        if (main) set.add(main);
        if (b.category.includes("·")) {
          set.add(b.category.trim());
        }
      }
    });

    const list = Array.from(set).sort();
    return ["all", ...list];
  }, [books]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    return books.filter((b) => {
      const matchSearch =
        !s ||
        b.title.toLowerCase().includes(s) ||
        b.author.toLowerCase().includes(s) ||
        (b.category ?? "").toLowerCase().includes(s) ||
        (b.description ?? "").toLowerCase().includes(s);

      const matchCat =
        selectedCategory === "all" ||
        (b.category &&
          (b.category === selectedCategory || b.category.startsWith(selectedCategory)));

      return matchSearch && matchCat;
    });
  }, [books, q, selectedCategory]);

  async function borrowBook(book: Book) {
    if (!user) {
      toast.error("Please sign in to borrow books.");
      return;
    }

    if (book.available_copies <= 0) {
      toast.error(`"${book.title}" is currently out of stock.`);
      return;
    }

    setBorrowingId(book.id);

    try {
      const borrowingsKey = `bookbank_borrowings_${user.id}`;
      const existingRaw =
        typeof window !== "undefined" ? localStorage.getItem(borrowingsKey) : null;
      const existing: UserBorrowingItem[] = existingRaw ? JSON.parse(existingRaw) : [];

      // Check if already actively borrowed
      const alreadyBorrowed = existing.find(
        (item) => item.book_id === book.id && item.status === "borrowed",
      );
      if (alreadyBorrowed) {
        toast.warning(`You already have an active loan for "${book.title}".`);
        setBorrowingId(null);
        return;
      }

      let insertedInSupabase = false;
      try {
        const { error } = await supabase.from("borrowings").insert({
          book_id: book.id,
          user_id: user.id,
        });
        if (!error) {
          insertedInSupabase = true;
        }
      } catch {
        // Fall back to local borrowing
      }

      const newDueDate = new Date();
      newDueDate.setDate(newDueDate.getDate() + 14);

      const newRecord: UserBorrowingItem = {
        id: `loan-${Date.now()}`,
        book_id: book.id,
        user_id: user.id,
        borrowed_at: new Date().toISOString(),
        due_date: newDueDate.toISOString(),
        returned_at: null,
        status: "borrowed",
        books: {
          title: book.title,
          author: book.author,
        },
      };

      existing.unshift(newRecord);
      localStorage.setItem(borrowingsKey, JSON.stringify(existing));

      // Adjust stock count
      const stockModsKey = "bookbank_stock_mods";
      const currentMods: Record<string, number> = JSON.parse(
        localStorage.getItem(stockModsKey) || "{}",
      );
      currentMods[book.id] = Math.max(0, book.available_copies - 1);
      localStorage.setItem(stockModsKey, JSON.stringify(currentMods));

      toast.success(`Borrowed "${book.title}". Due in 14 days.`);
      load();
    } catch (err: unknown) {
      console.error("Borrowing error:", err);
      const message = err instanceof Error ? err.message : "Failed to borrow book.";
      toast.error(message);
    } finally {
      setBorrowingId(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Banner */}
      <div
        className="rounded-2xl p-6 sm:p-8 text-primary-foreground relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-elegant)" }}
      >
        <div className="relative z-10 flex items-center gap-3 mb-2">
          <Sparkles className="h-6 w-6 text-amber-300" />
          <h1 className="text-2xl sm:text-3xl font-bold">Library Catalog</h1>
        </div>
        <p className="opacity-90 text-sm sm:text-base max-w-2xl">
          Search textbooks, monographs, and references. Borrow available copies with 14-day
          automatic loan terms.
        </p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search catalog by title, author, category, or description…"
          className="pl-9 h-11 text-sm bg-card/80 backdrop-blur"
        />
      </div>

      {/* Dynamic Category Chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-medium text-muted-foreground mr-1">Categories:</span>
        {categories.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={selectedCategory === c ? "default" : "outline"}
            className="rounded-full text-xs h-7 px-3 capitalize"
            onClick={() => setSelectedCategory(c)}
          >
            {c === "all" ? "All Categories" : c}
          </Button>
        ))}
      </div>

      {/* Catalog Cards Grid */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground space-y-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
          <p className="text-sm">Loading catalog titles...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border rounded-2xl bg-card p-8">
          <BookOpen className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <h3 className="font-semibold text-lg">No books found</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-sm mx-auto">
            {q
              ? `No titles match "${q}". Try clearing filters or searching for different keywords.`
              : "No books are available in the selected category."}
          </p>
          {(q || selectedCategory !== "all") && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setQ("");
                setSelectedCategory("all");
              }}
            >
              Reset Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((b) => {
            const isAvailable = b.available_copies > 0;
            const isProcessing = borrowingId === b.id;

            return (
              <Card
                key={b.id}
                className={cn(
                  "overflow-hidden transition-all duration-200 hover:shadow-lg flex flex-col h-full border bg-card/90",
                  !isAvailable && "opacity-80",
                )}
              >
                <CardContent className="p-5 flex flex-col h-full space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center text-primary-foreground shrink-0 shadow-sm"
                      style={{ background: "var(--gradient-primary)" }}
                    >
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <Badge
                      variant={isAvailable ? "default" : "secondary"}
                      className={cn(
                        "text-[11px] font-medium",
                        isAvailable
                          ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {isAvailable
                        ? `${b.available_copies} of ${b.total_copies} left`
                        : "Out of stock"}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-semibold text-base leading-snug line-clamp-2">{b.title}</h3>
                    <p className="text-xs text-muted-foreground">by {b.author}</p>
                  </div>

                  {b.category && (
                    <Badge variant="outline" className="text-[10px] w-fit font-normal">
                      {b.category}
                    </Badge>
                  )}

                  {b.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
                      {b.description}
                    </p>
                  )}

                  <div className="pt-2 mt-auto">
                    <Button
                      size="sm"
                      className="w-full gap-2 text-xs"
                      onClick={() => borrowBook(b)}
                      disabled={!isAvailable || isProcessing}
                    >
                      {isProcessing ? (
                        "Processing loan..."
                      ) : isAvailable ? (
                        <>
                          <BookmarkPlus className="h-4 w-4" /> Borrow Book
                        </>
                      ) : (
                        "Unavailable"
                      )}
                    </Button>
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
