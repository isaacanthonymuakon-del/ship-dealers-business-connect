"use client";
import { FormEvent, useState } from "react";
import AuthGate from "../AuthGate";
import { supabase } from "../supabase-client";
import "../legal.css";

const SUPPORT_TIMEOUT_MS = 12000;

export default function Support() {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [tone, setTone] = useState<"success" | "error" | "idle">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const subject = String(form.get("subject") || "").trim();
    const message = String(form.get("message") || "").trim();

    setBusy(true);
    setNotice("");
    setTone("idle");

    try {
      const { data } = await withTimeout(
        supabase.auth.getUser(),
        "Your sign in check is taking too long. Please refresh and try again.",
      );

      if (!data.user) {
        setNotice("Please sign in again.");
        setTone("error");
        return;
      }

      const { error } = await withTimeout(
        supabase.from("support_requests").insert({
          user_id: data.user.id,
          subject,
          message,
        }),
        "Support is taking too long to respond. Please try again in a moment.",
      );

      setNotice(error ? error.message : "Your support request has been received.");
      setTone(error ? "error" : "success");
      if (!error) formElement.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not send your support request.");
      setTone("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate>
      <main className="legal-page">
        <header className="legal-header">
          <a href="/">
            <span>◎</span>Ship Dealers Business Connect
          </a>
        </header>
        <article className="legal-content">
          <p className="kicker">CUSTOMER SUPPORT</p>
          <h1>How can we help?</h1>
          <p>
            Send questions about accounts, listings, payments, safety or refunds. Include your payment reference when
            asking about a transaction.
          </p>
          <form className="support-form" onSubmit={submit}>
            <label>
              Subject
              <input name="subject" minLength={5} maxLength={120} required placeholder="What do you need help with?" />
            </label>
            <label>
              Message
              <textarea
                name="message"
                minLength={20}
                maxLength={2000}
                rows={7}
                required
                placeholder="Explain the issue and include useful details."
              />
            </label>
            {notice && (
              <div className={`support-status ${tone === "success" ? "success" : "error"}`} role="status" aria-live="polite">
                <b>{tone === "success" ? "Request sent" : "Something needs attention"}</b>
                <p>{notice}</p>
              </div>
            )}
            <button disabled={busy}>{busy ? "Sending…" : "Send support request"}</button>
          </form>
          <p>
            <a href="/">Return to marketplace</a>
          </p>
        </article>
      </main>
    </AuthGate>
  );
}

function withTimeout<T>(promise: PromiseLike<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), SUPPORT_TIMEOUT_MS);
    Promise.resolve(promise).then(
      value => {
        window.clearTimeout(timer);
        resolve(value);
      },
      error => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
