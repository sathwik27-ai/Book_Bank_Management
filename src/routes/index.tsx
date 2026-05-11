import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BookOpen, Search, Clock, Shield } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "BookBank — Library Management Made Simple" },
      { name: "description", content: "Manage, borrow and track books with role-based access for students and admins." },
    ],
  }),
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="container mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl">BookBank</span>
        </div>
        <Link to="/login">
          <Button>Sign in</Button>
        </Link>
      </header>
      <section className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="container mx-auto px-6 py-24 text-center text-primary-foreground">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">Your library, perfectly organized.</h1>
          <p className="mt-6 text-lg opacity-90 max-w-2xl mx-auto">
            A modern book bank management system. Search, borrow, and return books with role-based access for students and administrators.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/login">
              <Button size="lg" variant="secondary">Get started</Button>
            </Link>
          </div>
        </div>
      </section>
      <section className="container mx-auto px-6 py-20 grid md:grid-cols-3 gap-8">
        {[
          { icon: Search, title: "Smart Search", body: "Find books instantly by title, author, or category." },
          { icon: Clock, title: "Borrow & Return", body: "Track due dates and manage returns in one place." },
          { icon: Shield, title: "Role-based access", body: "Students browse and borrow; admins manage the catalog." },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl p-6 border bg-card" style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}>
            <f.icon className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold text-lg">{f.title}</h3>
            <p className="text-muted-foreground mt-1 text-sm">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
