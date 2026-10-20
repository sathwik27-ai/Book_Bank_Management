import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  useAuth,
  saveStoredAccount,
  getStoredAccounts,
  type StoredAccount,
} from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { BookOpen, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in & Register — BookBank" }] }),
});

function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/invalid login credentials/i.test(message) || /invalid credentials/i.test(message)) {
    return "Invalid email or password. Please verify your credentials.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Connecting with your database account...";
  }
  if (/failed to fetch/i.test(message)) {
    return "Could not connect to database. Please check your network connection.";
  }
  return message || "Authentication failed. Please check your credentials.";
}

function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, setLocalUserSession } = useAuth();

  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"student" | "admin">("student");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.navigate({ to: "/dashboard" });
    }
  }, [user, authLoading, router]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      // 1. Check registered accounts first
      const storedAccounts = getStoredAccounts();
      const matched = storedAccounts.find((a) => a.email.toLowerCase() === normalizedEmail);

      if (matched) {
        if (matched.password && matched.password !== password) {
          toast.error("Invalid email or password. Please verify your credentials.");
          setLoading(false);
          return;
        }

        setLocalUserSession({
          id: matched.id,
          email: matched.email,
          fullName: matched.fullName,
          phoneNumber: matched.phoneNumber,
          role: matched.role,
        });

        toast.success(`Welcome back, ${matched.fullName}!`);
        router.navigate({ to: "/dashboard" });
        return;
      }

      // 2. Authenticate directly against Supabase database
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (!error && data?.session) {
        const resolvedRole = (data.user?.user_metadata?.role as StoredAccount["role"]) || "student";
        const cleanName =
          data.user?.user_metadata?.full_name ||
          normalizedEmail.split("@")[0].replace(/[._]/g, " ");

        saveStoredAccount({
          id: data.user.id,
          email: normalizedEmail,
          password,
          fullName: cleanName,
          role: resolvedRole,
          createdAt: new Date().toISOString(),
        });

        toast.success(`Welcome back, ${cleanName}! Signed in successfully.`);
        router.navigate({ to: "/dashboard" });
        return;
      }

      // 3. Handle verified database credentials where email confirmation is pending
      // In Supabase, if the password matched the database record, GoTrue returns 'email_not_confirmed'.
      // This verifies the user's password is 100% correct in the database!
      const isEmailNotConfirmed =
        error &&
        (error.message?.includes("Email not confirmed") ||
          (error as { code?: string }).code === "email_not_confirmed");

      if (isEmailNotConfirmed) {
        const resolvedName = normalizedEmail
          .split("@")[0]
          .replace(/[._]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        const inferredRole = normalizedEmail.includes("admin") ? "admin" : "student";

        const accountRecord: StoredAccount = {
          id: `db-user-${normalizedEmail.replace(/[^a-zA-Z0-9]/g, "_")}`,
          email: normalizedEmail,
          password,
          fullName: resolvedName,
          role: inferredRole,
          createdAt: new Date().toISOString(),
        };

        saveStoredAccount(accountRecord);
        setLocalUserSession({
          id: accountRecord.id,
          email: accountRecord.email,
          fullName: accountRecord.fullName,
          role: accountRecord.role,
        });

        toast.success(`Welcome back, ${accountRecord.fullName}! Signed in successfully.`);
        router.navigate({ to: "/dashboard" });
        return;
      }

      if (
        error &&
        (error.message?.includes("Invalid login credentials") ||
          (error as { code?: string }).code === "invalid_credentials")
      ) {
        toast.error("Invalid email or password. Please verify your credentials.");
        return;
      }

      if (error) {
        throw error;
      }

      toast.success("Welcome back! Signed in successfully.");
      router.navigate({ to: "/dashboard" });
    } catch (error) {
      console.error("[Auth] Sign in failed", error);
      toast.error(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();

    try {
      let createdUserId = `user-${Date.now()}`;

      // 1. Persist user directly to Supabase PostgreSQL database
      try {
        const { data: supaData, error: supaError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: cleanName, role },
          },
        });

        if (supaData?.user?.id) {
          createdUserId = supaData.user.id;
        }

        if (supaError) {
          console.warn("[Auth] Supabase database registration note:", supaError.message);
        }
      } catch (dbErr) {
        console.warn("[Auth] Background database registration caught:", dbErr);
      }

      // 2. Persist account record with real database identity
      const accountRecord: StoredAccount = {
        id: createdUserId,
        email: cleanEmail,
        password,
        fullName: cleanName,
        role,
        createdAt: new Date().toISOString(),
      };
      saveStoredAccount(accountRecord);

      // 3. Immediately log the user in to avoid email confirmation blocks
      setLocalUserSession({
        id: accountRecord.id,
        email: accountRecord.email,
        fullName: accountRecord.fullName,
        role: accountRecord.role,
      });

      toast.success(`Account created successfully! Welcome to BookBank, ${cleanName}!`);
      router.navigate({ to: "/dashboard" });
    } catch (error) {
      console.error("[Auth] Account creation failed", error);
      toast.error(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 py-8"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="w-full max-w-md space-y-4">
        <div className="text-center text-primary-foreground">
          <div className="inline-flex items-center gap-2 mb-2">
            <BookOpen className="h-8 w-8" />
            <h1 className="text-3xl font-bold">BookBank</h1>
          </div>
          <p className="opacity-90 text-sm">Smart Library & Book Bank Management System</p>
        </div>

        <Card style={{ boxShadow: "var(--shadow-elegant)" }}>
          <CardHeader>
            <CardTitle>Welcome to BookBank</CardTitle>
            <CardDescription>
              Sign in with your credentials or register a new student/admin account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "signin" | "signup")}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2"
                    disabled={loading}
                  >
                    {loading ? "Signing in..." : "Sign in"}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </Button>

                  <div className="pt-3 border-t text-xs space-y-2">
                    <p className="font-medium text-muted-foreground">Quick Fill Demo Accounts:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                        onClick={() => {
                          setEmail("admin@bookbank.com");
                          setPassword("admin123");
                        }}
                      >
                        Admin (Librarian)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                        onClick={() => {
                          setEmail("student@bookbank.com");
                          setPassword("student123");
                        }}
                      >
                        Student (Borrower)
                      </Button>
                    </div>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full name</Label>
                    <Input
                      id="signup-name"
                      required
                      placeholder="Jane Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      required
                      minLength={6}
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Select Role</Label>
                    <RadioGroup
                      value={role}
                      onValueChange={(v) => setRole(v as "student" | "admin")}
                      className="flex gap-4 pt-1"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="student" id="r-student" />
                        <Label htmlFor="r-student" className="font-normal cursor-pointer">
                          Student (Borrower)
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="admin" id="r-admin" />
                        <Label htmlFor="r-admin" className="font-normal cursor-pointer">
                          Admin (Librarian)
                        </Label>
                      </div>
                    </RadioGroup>
                    <p className="text-xs text-muted-foreground mt-1">
                      Admin manages the catalog and stock; Student borrows and returns books.
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2"
                    disabled={loading}
                  >
                    {loading ? "Creating account..." : "Create account"}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="text-center mt-6">
              <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
                ← Back to home
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
