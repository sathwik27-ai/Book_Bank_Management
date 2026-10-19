import { createFileRoute, Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  BookOpen,
  LayoutDashboard,
  Library,
  ClipboardList,
  ShieldCheck,
  LogOut,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, role, loading, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.navigate({ to: "/login" });
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground flex-col gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm">Loading BookBank workspace...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const items = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/books", label: "Books Catalog", icon: Library },
    { to: "/borrowings", label: "My Borrowings", icon: ClipboardList },
  ];

  if (isAdmin) {
    items.push({ to: "/admin", label: "Admin Console", icon: ShieldCheck });
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "border-r bg-sidebar text-sidebar-foreground transition-all duration-300 flex flex-col shrink-0",
          open ? "w-64" : "w-16",
        )}
      >
        <div className="flex h-16 items-center gap-2 px-4 border-b border-sidebar-border">
          <BookOpen className="h-6 w-6 text-primary shrink-0" />
          {open && (
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="font-bold text-lg tracking-tight">BookBank</span>
            </div>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {items.map((it) => {
            const active = pathname.startsWith(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-muted-foreground",
                )}
              >
                <it.icon className="h-4 w-4 shrink-0" />
                {open && <span>{it.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-2 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
            onClick={async () => {
              await signOut();
              router.navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4" />
            {open && "Sign out"}
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card flex items-center px-4 gap-4 sticky top-0 z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <div className="text-right text-xs">
              <div className="font-medium text-foreground truncate max-w-[180px]">
                {user.user_metadata?.full_name || user.email}
              </div>
              <div className="text-muted-foreground flex items-center justify-end gap-1.5">
                <span className="capitalize">{role ?? "student"}</span>
                {isAdmin ? (
                  <Badge className="text-[10px] h-4 px-1 bg-emerald-600 hover:bg-emerald-600 text-white">
                    Admin
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1">
                    Student
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
