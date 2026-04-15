import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { isAllowedEmailDomain } from "@/lib/emailAllowlist";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/useAuthStore";
import { Loader2, Eye, EyeOff, Mail } from "lucide-react";
import { toast } from "sonner";

// ─── OAuth icon components ────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.39.07 2.35.73 3.15.8.95-.19 1.86-.87 2.92-.78 1.24.11 2.17.65 2.8 1.63-2.58 1.54-1.97 4.97.54 5.91-.53 1.39-1.2 2.77-2.41 4.32zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AuthModal() {
  const { showAuthModal, authModalMode, closeAuthModal, openAuthModal } =
    useAuthStore();

  const handleOpenChange = (open: boolean) => {
    if (!open) closeAuthModal();
  };

  const isSignup = authModalMode === "signup";

  return (
    <Dialog open={showAuthModal} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl bg-background/95 backdrop-blur-3xl border-border/40 shadow-2xl p-0 overflow-hidden">
        <div className="p-6 pb-4 bg-gradient-to-b from-secondary/40 to-transparent">
          <DialogHeader>
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-2xl shadow-inner border border-primary/20">
                <img
                  src={`${import.meta.env.BASE_URL}logo.svg`}
                  className="w-8 h-8 drop-shadow-sm"
                  alt="li'l Mappo"
                />
              </div>
            </div>
            <DialogTitle className="text-2xl font-black tracking-tight text-center">
              {isSignup ? "Create Account" : "Sign In"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm text-center mt-1">
              {isSignup
                ? "Create your account to complete your purchase."
                : "Welcome back. Sign in to access your account."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6">
          <AuthModalBody
            isSignup={isSignup}
            onSwitchToSignin={() => {
              closeAuthModal();
              // Small delay so the close animation finishes before reopening
              setTimeout(() => openAuthModal(), 150);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal body (separated so state resets cleanly on mode change) ────────────

function AuthModalBody({
  isSignup,
  onSwitchToSignin,
}: {
  isSignup: boolean;
  onSwitchToSignin: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentState, setSentState] = useState<"idle" | "confirm_email">("idle");

  const canSubmit = email.trim() !== "" && password !== "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);

    try {
      if (isSignup) {
        // Frontend domain check — server-side hook is the authoritative guard,
        // but this gives immediate feedback before the network round-trip.
        if (!isAllowedEmailDomain(email.trim())) {
          toast.error("Sign-ups are limited to major email providers (Gmail, Outlook, iCloud, etc.).");
          setIsSubmitting(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        // If email confirmation is required, data.session will be null
        if (!data.session) {
          setSentState("confirm_email");
        }
        // If session exists, onAuthStateChange fires → modal auto-closes
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        // onAuthStateChange → SIGNED_IN → modal auto-closes
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Authentication failed";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setEmail("");
    setPassword("");
    setSentState("idle");
  };

  // ── Sent / confirm states ──────────────────────────────────────────────────

  if (sentState === "confirm_email") {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Mail size={24} className="text-primary" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-sm">Confirm your email</p>
          <p className="text-muted-foreground text-xs mt-1 max-w-[260px]">
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground">{email}</span>. Once
            confirmed, your purchase will proceed automatically.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-xs" onClick={handleReset}>
          Use a different email
        </Button>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 pt-2">
      {/* OAuth buttons — greyed out until providers are configured */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          disabled
          className="h-10 text-sm font-medium gap-2 rounded-xl border-border/50 opacity-40 cursor-not-allowed"
          title="Coming soon"
        >
          <GoogleIcon />
          Google
        </Button>
        <Button
          variant="outline"
          disabled
          className="h-10 text-sm font-medium gap-2 rounded-xl border-border/50 opacity-40 cursor-not-allowed"
          title="Coming soon"
        >
          <AppleIcon />
          Apple
        </Button>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border/50" />
        </div>
        <div className="relative flex justify-center text-[10px] uppercase">
          <span className="bg-background px-3 text-muted-foreground font-medium tracking-wider">
            or continue with email
          </span>
        </div>
      </div>

      {/* Email + password / magic link form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 rounded-xl bg-secondary/30 border-border/50 text-sm placeholder:text-muted-foreground/50"
          autoFocus
        />

        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 rounded-xl bg-secondary/30 border-border/50 text-sm pr-10 placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting || !canSubmit}
          className="h-10 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin mr-2" />
              {isSignup ? "Creating account…" : "Signing in…"}
            </>
          ) : isSignup ? (
            "Create Account"
          ) : (
            "Sign In"
          )}
        </Button>
      </form>

      {/* Signup mode: offer sign-in for existing users */}
      {isSignup && (
        <div className="pt-2 border-t border-border/30 flex items-center justify-center gap-1.5">
          <p className="text-[11px] text-muted-foreground/70">
            Already have an account?
          </p>
          <button
            type="button"
            onClick={onSwitchToSignin}
            className="text-[11px] text-primary hover:text-primary/80 font-semibold transition-colors"
          >
            Sign in
          </button>
        </div>
      )}
    </div>
  );
}
