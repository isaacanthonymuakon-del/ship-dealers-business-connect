"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase-client";

type Mode = "signin" | "signup";
type SignInMethod = "email" | "phone";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("signin");
  const [signInMethod, setSignInMethod] = useState<SignInMethod>("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

  const helperText = useMemo(() => {
    if (signInMethod === "phone") {
      return mode === "signin"
        ? "Use your registered phone number and password."
        : "Use your name, registered phone number and password to create your account.";
    }
    return mode === "signin"
      ? "Sign in with your email address and password."
      : "Use your name, email address and password to create your account.";
  }, [mode, signInMethod]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const displayName = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const phone = normalizePhoneNumber(String(form.get("phone") || ""));
    const confirmation = String(form.get("confirmPassword") || "");

    setBusy(true);
    setMessage("");

    if (mode === "signup") {
      if (password !== confirmation) {
        setMessage("The passwords do not match.");
        setBusy(false);
        return;
      }

      if (signInMethod === "phone") {
        setMessage("Phone account creation is temporarily paused while SMS verification is being connected. Please create your account with email for now.");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: displayName },
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) setMessage(error.message);
        else if (!data.session) {
          setMessage(
            "Account created. Check your email and click the verification link, then sign in.",
          );
        } else {
          setSession(data.session);
        }
      }
    } else if (signInMethod === "phone") {
      if (!phone) {
        setMessage("Enter your phone number first.");
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: phoneToPrivateEmail(phone),
        password,
      });
      if (error) setMessage(formatAuthError(error.message));
      else setSession(data.session);
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(formatAuthError(error.message));
      else setSession(data.session);
    }

    setBusy(false);
  }

  async function sendReset() {
    if (signInMethod === "phone") {
      setMessage("Phone sign in does not use email reset. Use your registered number and password, or contact support.");
      return;
    }

    const emailInput = document.querySelector<HTMLInputElement>('input[name="email"]');
    const email = emailInput?.value.trim();
    if (!email) {
      setMessage("Enter your email address first.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
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

  if (loading) {
    return (
      <div className="auth-loading">
        <span className="auth-mark">◎</span>
        <p>Securing your connection…</p>
      </div>
    );
  }

  if (recovery && session) {
    return (
      <AuthShell
        title="Choose a new password"
        subtitle="Enter a secure password for your account."
      >
        <form className="auth-form" onSubmit={updatePassword}>
          <PasswordField
            name="newPassword"
            label="New password"
            autoComplete="new-password"
            showPassword={showPassword}
            onToggle={() => setShowPassword(v => !v)}
          />
          <PasswordField
            name="confirmNewPassword"
            label="Confirm new password"
            autoComplete="new-password"
            showPassword={showConfirmPassword}
            onToggle={() => setShowConfirmPassword(v => !v)}
          />
          {message && (
            <p className="auth-message" role="status">
              {message}
            </p>
          )}
          <button className="auth-primary" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </AuthShell>
    );
  }

  if (!session) {
    return (
      <AuthShell
        title={mode === "signin" ? "Welcome back" : "Create your account"}
        subtitle="Verified members can access Ghana’s trusted buy and sell marketplace."
      >
        <div className="auth-methods" aria-label="Sign in method">
          <button
            type="button"
            className={signInMethod === "email" ? "active" : ""}
            onClick={() => {
              setSignInMethod("email");
              setMessage("");
            }}
          >
            Email
          </button>
          <button
            type="button"
            className={signInMethod === "phone" ? "active" : ""}
            onClick={() => {
              setSignInMethod("phone");
              setMessage("");
            }}
          >
            Phone
          </button>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            className={mode === "signin" ? "active" : ""}
            onClick={() => {
              setMode("signin");
              setMessage("");
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              if (signInMethod === "phone") setSignInMethod("email");
              setMessage("");
            }}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={submitAuth}>
          {mode === "signup" && (
            <label>
              Full name
              <input
                name="name"
                required
                autoComplete="name"
                placeholder="Your full name"
              />
            </label>
          )}

          {signInMethod === "email" ? (
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@email.com"
              />
            </label>
          ) : mode === "signin" ? (
            <label>
              Phone number
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                required
                autoComplete="tel"
                placeholder="+233 24 000 0000"
              />
            </label>
          ) : null}

          {mode === "signup" && signInMethod === "phone" && (
            <p className="auth-message" role="status">
              Phone account creation is temporarily paused while SMS verification is being connected. Please use email to create your account today.
            </p>
          )}

          <PasswordField
            name="password"
            label="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="At least 8 characters"
            showPassword={showPassword}
            onToggle={() => setShowPassword(v => !v)}
          />

          {mode === "signup" && (
            <PasswordField
              name="confirmPassword"
              label="Confirm password"
              autoComplete="new-password"
              placeholder="Re-enter your password"
              showPassword={showConfirmPassword}
              onToggle={() => setShowConfirmPassword(v => !v)}
            />
          )}

          {message && (
            <p className="auth-message" role="status">
              {message}
            </p>
          )}

          <button className="auth-primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in securely"
                : "Create account"}
          </button>

          {mode === "signin" && signInMethod === "email" && (
            <button
              className="auth-link"
              type="button"
              onClick={sendReset}
              disabled={busy}
            >
              Forgot your password?
            </button>
          )}
        </form>

        <p className="auth-helper">{helperText}</p>
        <p className="auth-footnote">
          {signInMethod === "email"
            ? "Email verification is required before marketplace access."
            : "Phone sign in is for already-created phone accounts. New users should create an account with email until SMS verification is connected."}
        </p>
      </AuthShell>
    );
  }

  const displayName = String(
    session.user.user_metadata?.full_name ||
      session.user.user_metadata?.phone ||
      session.user.phone ||
      session.user.email ||
      "Member",
  );

  return (
    <div className="member-shell">
      <div className="member-bar">
        <div className="wrap">
          <span>
            ✓ Verified member: <b>{displayName}</b>
          </span>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
      {children}
    </div>
  );
}

function PasswordField({
  name,
  label,
  autoComplete,
  placeholder,
  showPassword,
  onToggle,
}: {
  name: string;
  label: string;
  autoComplete: string;
  placeholder?: string;
  showPassword: boolean;
  onToggle: () => void;
}) {
  return (
    <label>
      {label}
      <div className="password-field">
        <input
          name={name}
          type={showPassword ? "text" : "password"}
          minLength={8}
          required
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
        <button type="button" onClick={onToggle} aria-label={showPassword ? "Hide password" : "Show password"}>
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
    </label>
  );
}

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="auth-brand" href="/">
          <span>◎</span>
          <b>Ship Dealers</b> Business Connect
        </a>
        <div>
          <p className="eyebrow">GHANA’S SECURE MARKETPLACE</p>
          <h1>Buy and sell across Ghana with confidence.</h1>
          <p>
            Discover vehicles, property, electronics, fashion, home items,
            services and everyday deals, all in one place.
          </p>
        </div>
        <small>Secure access · Verified members · Marketplace control</small>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="auth-kicker">MEMBER ACCESS</p>
          <h2>{title}</h2>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

function formatAuthError(message: string) {
  if (message === "Email not confirmed") {
    return "Your account was created. If sign in is blocked, contact support so we can verify it for you.";
  }
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "The login details or password are incorrect.";
  }
  if (message.toLowerCase().includes("already registered")) {
    return "This account already exists. Sign in instead.";
  }
  if (message.toLowerCase().includes("rate limit")) {
    return "Too many account attempts right now. If you already created this phone account, tap Sign in and use the same phone number and password.";
  }
  return message;
}

function normalizePhoneNumber(value: string) {
  const trimmed = value.trim().replace(/[^\d+]/g, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  return `+${digits}`;
}

function phoneToPrivateEmail(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `phone-${digits}@shipdealersconnect.local`;
}
