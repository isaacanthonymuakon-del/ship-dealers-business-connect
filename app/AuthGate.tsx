"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase-client";

type Mode = "signin" | "signup";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(nextSession);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    setBusy(true);
    setMessage("");

    if (mode === "signup") {
      const name = String(form.get("name") || "").trim();
      const confirmation = String(form.get("confirmPassword") || "");
      if (password !== confirmation) {
        setMessage("The passwords do not match.");
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
      });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage("Account created. Check your email and click the verification link, then sign in.");
      else setSession(data.session);
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message === "Email not confirmed" ? "Verify your email first, then sign in." : error.message);
      else setSession(data.session);
    }
    setBusy(false);
  }

  async function sendReset() {
    const emailInput = document.querySelector<HTMLInputElement>('input[name="email"]');
    const email = emailInput?.value.trim();
    if (!email) {
      setMessage("Enter your email address first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setMessage(error ? error.message : "Password reset email sent. Check your inbox.");
    setBusy(false);
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("newPassword") || "");
    const confirmation = String(form.get("confirmNewPassword") || "");
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setMessage(error ? error.message : "Password updated successfully.");
    if (!error) setRecovery(false);
    setBusy(false);
  }

  if (loading) return <div className="auth-loading"><span className="auth-mark">◎</span><p>Securing your connection…</p></div>;

  if (recovery && session) {
    return <AuthShell title="Choose a new password" subtitle="Enter a secure password for your account.">
      <form className="auth-form" onSubmit={updatePassword}>
        <label>New password<input name="newPassword" type="password" minLength={8} required autoComplete="new-password" /></label>
        <label>Confirm new password<input name="confirmNewPassword" type="password" minLength={8} required autoComplete="new-password" /></label>
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="auth-primary" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
      </form>
    </AuthShell>;
  }

  if (!session) {
    return <AuthShell title={mode === "signin" ? "Welcome back" : "Create your account"} subtitle="Verified members can access Ghana’s trusted buy and sell marketplace.">
      <div className="auth-tabs" role="tablist">
        <button className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setMessage(""); }}>Sign in</button>
        <button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setMessage(""); }}>Create account</button>
      </div>
      <form className="auth-form" onSubmit={submitAuth}>
        {mode === "signup" && <label>Full name<input name="name" required autoComplete="name" placeholder="Your full name" /></label>}
        <label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@email.com" /></label>
        <label>Password<input name="password" type="password" minLength={8} required autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="At least 8 characters" /></label>
        {mode === "signup" && <label>Confirm password<input name="confirmPassword" type="password" minLength={8} required autoComplete="new-password" /></label>}
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="auth-primary" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in securely" : "Create account"}</button>
        {mode === "signin" && <button className="auth-link" type="button" onClick={sendReset} disabled={busy}>Forgot your password?</button>}
      </form>
      <p className="auth-footnote">Email verification is required before marketplace access.</p>
    </AuthShell>;
  }

  const displayName = String(session.user.user_metadata?.full_name || session.user.email || "Member");
  return <div className="member-shell">
    <div className="member-bar"><div className="wrap"><span>✓ Verified member: <b>{displayName}</b></span><button onClick={() => supabase.auth.signOut()}>Sign out</button></div></div>
    {children}
  </div>;
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <main className="auth-page">
    <section className="auth-story">
      <a className="auth-brand" href="/"><span>◎</span><b>Ship Dealers</b> Business Connect</a>
      <div><p className="eyebrow">GHANA’S SECURE MARKETPLACE</p><h1>Buy and sell across Ghana with confidence.</h1><p>Discover vehicles, property, electronics, fashion, home items, services and everyday deals, all in one place.</p></div>
      <small>Secure access · Verified email · Members only marketplace</small>
    </section>
    <section className="auth-panel"><div className="auth-card"><p className="auth-kicker">MEMBER ACCESS</p><h2>{title}</h2><p className="auth-subtitle">{subtitle}</p>{children}</div></section>
  </main>;
}
