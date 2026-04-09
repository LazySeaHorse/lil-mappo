import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/useAuthStore';
import { Mail, Github, Loader2 } from 'lucide-react';

/**
 * Auth modal for sign in / sign up.
 * Phase 1: UI shell only — no real Supabase calls.
 * Phase 2: Wire to supabase.auth.signInWithOtp / signInWithOAuth.
 */
export function AuthModal() {
  const { showAuthModal, closeAuthModal } = useAuthStore();
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSending(true);
    // Phase 2: await supabase.auth.signInWithOtp({ email })
    await new Promise((r) => setTimeout(r, 1200)); // Simulate
    setIsSending(false);
    setSent(true);
  };

  const handleOAuthGoogle = () => {
    // Phase 2: supabase.auth.signInWithOAuth({ provider: 'google' })
  };

  const handleOAuthGithub = () => {
    // Phase 2: supabase.auth.signInWithOAuth({ provider: 'github' })
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeAuthModal();
      // Reset state on close
      setTimeout(() => { setEmail(''); setSent(false); setIsSending(false); }, 200);
    }
  };

  return (
    <Dialog open={showAuthModal} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <img
              src={`${import.meta.env.BASE_URL}logo.svg`}
              className="w-7 h-7"
              alt="li'l Mappo"
            />
            <DialogTitle className="text-lg font-bold tracking-tight">Sign in to li'l Mappo</DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-sm">
            Cloud renders, cloud saves, and more — all with one account.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail size={24} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">Check your email</p>
              <p className="text-muted-foreground text-xs mt-1">
                We sent a magic link to <span className="font-medium text-foreground">{email}</span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => { setSent(false); setEmail(''); }}
            >
              Use a different email
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-2">
            {/* OAuth Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-10 text-sm font-medium gap-2 rounded-xl border-border/50 hover:bg-accent/50 transition-all"
                onClick={handleOAuthGoogle}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google
              </Button>
              <Button
                variant="outline"
                className="h-10 text-sm font-medium gap-2 rounded-xl border-border/50 hover:bg-accent/50 transition-all"
                onClick={handleOAuthGithub}
              >
                <Github size={16} />
                GitHub
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

            {/* Magic Link */}
            <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
              <Input
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 rounded-xl bg-secondary/30 border-border/50 text-sm placeholder:text-muted-foreground/50"
                autoFocus
              />
              <Button
                type="submit"
                disabled={isSending || !email.trim()}
                className="h-10 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                {isSending ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail size={16} className="mr-2" />
                    Send Magic Link
                  </>
                )}
              </Button>
            </form>

            {/* Terms */}
            <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
