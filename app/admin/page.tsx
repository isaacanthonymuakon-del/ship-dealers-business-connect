"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { adminSupabase } from "../supabase-client";
import "./admin.css";
import "./review.css";

type Listing = { id:string; seller_id:string; seller_name:string; title:string; category:string; brand:string|null; item_condition:string|null; price:number; negotiable:boolean; description:string|null; location:string; phone:string; whatsapp:string|null; image_urls:string[]; status:string; package:string|null; payment_status:string|null; payment_reference:string|null; paid_at:string|null; expires_at:string|null; created_at:string };
type Payment = { id:string; reference:string; package:string; amount:number; status:string; created_at:string };
type Report = { id:string; listing_id:string; reason:string; status:string; created_at:string };
type AnalyticsEvent = { id:number; event_name:string; created_at:string };
type SupportRequest = { id:string; subject:string; message:string; status:string; created_at:string };
type AdminState = "loading" | "signed_out" | "denied" | "ready";

export default function AdminPortal() {
  const supabase = adminSupabase;
  const [state,setState] = useState<AdminState>("loading");
  const [listings,setListings] = useState<Listing[]>([]);
  const [payments,setPayments] = useState<Payment[]>([]);
  const [reports,setReports] = useState<Report[]>([]);
  const [events,setEvents] = useState<AnalyticsEvent[]>([]);
  const [support,setSupport] = useState<SupportRequest[]>([]);
  const [filter,setFilter] = useState("pending");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [deleteTarget,setDeleteTarget] = useState<Listing | null>(null);
  const [reviewTarget,setReviewTarget] = useState<Listing | null>(null);

  const loadDashboard = useCallback(async () => {
    const [adverts,transactions,reported,activity,requests] = await Promise.all([
      supabase.from("listings").select("*").order("created_at",{ascending:false}),
      supabase.from("payments").select("*").order("created_at",{ascending:false}),
      supabase.from("listing_reports").select("*").order("created_at",{ascending:false}),
      supabase.from("analytics_events").select("id,event_name,created_at").order("created_at",{ascending:false}).limit(500),
      supabase.from("support_requests").select("*").order("created_at",{ascending:false}),
    ]);
    if (adverts.error || transactions.error || reported.error || activity.error || requests.error) return setMessage(adverts.error?.message || transactions.error?.message || reported.error?.message || activity.error?.message || requests.error?.message || "Dashboard data could not be loaded.");
    setListings((adverts.data || []) as Listing[]);
    setPayments((transactions.data || []) as Payment[]);
    setReports((reported.data || []) as Report[]);
    setEvents((activity.data || []) as AnalyticsEvent[]);
    setSupport((requests.data || []) as SupportRequest[]);
  },[]);

  useEffect(() => { supabase.auth.getUser().then(async ({data,error}) => {
    if (error || !data.user) return setState("signed_out");
    if (data.user.app_metadata?.role !== "admin") return setState("denied");
    setState("ready"); await loadDashboard();
  }); },[loadDashboard]);

  async function signIn(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage("");
    const {data,error} = await supabase.auth.signInWithPassword({email:String(form.get("email") || "").trim(),password:String(form.get("password") || "")});
    if (error || !data.user) { setMessage(error?.message || "Admin sign in failed."); setBusy(false); return; }
    if (data.user.app_metadata?.role !== "admin") { await supabase.auth.signOut(); setMessage("This account does not have administrator permission."); setState("signed_out"); setBusy(false); return; }
    setState("ready"); await loadDashboard(); setBusy(false);
  }

  async function signOut() { await supabase.auth.signOut(); setListings([]); setPayments([]); setState("signed_out"); }
  async function moderate(id:string,status:"approved"|"rejected") {
    const reason = status === "rejected" ? window.prompt("Reason for rejecting this advert:") : null;
    if (status === "rejected" && reason === null) return;
    setBusy(true); setMessage(""); const {data:updated,error} = await supabase.from("listings").update({status,rejection_reason:reason}).eq("id",id).select("id,seller_id,title").single();
    if(!error&&updated){await supabase.from("notifications").upsert({user_id:updated.seller_id,listing_id:updated.id,type:status,title:status==="approved"?"Advert approved":"Advert needs changes",message:status==="approved"?`${updated.title} is now live in the marketplace.`:`${updated.title} was not approved. ${reason||"Review the advert details."}`,source_key:`moderation-${updated.id}-${status}-${Date.now()}`},{onConflict:"user_id,source_key"});}
    setMessage(error ? error.message : status === "approved" ? "Advert approved, published and seller notified." : "Advert rejected and seller notified."); if (!error) await loadDashboard(); setBusy(false);
  }
  async function resolveReport(id:string,status:"reviewed"|"dismissed"){setBusy(true);const {error}=await supabase.from("listing_reports").update({status}).eq("id",id);setMessage(error?error.message:`Report marked ${status}.`);if(!error)await loadDashboard();setBusy(false);}
  async function closeSupport(id:string){setBusy(true);const {error}=await supabase.from("support_requests").update({status:"closed"}).eq("id",id);setMessage(error?error.message:"Support request closed.");if(!error)await loadDashboard();setBusy(false);}
  async function removeListing() {
    if (!deleteTarget) return;
    setBusy(true); setMessage("");
    const {error} = await supabase.from("listings").delete().eq("id",deleteTarget.id);
    setMessage(error ? error.message : `“${deleteTarget.title}” was permanently deleted.`);
    if (!error) { setDeleteTarget(null); await loadDashboard(); }
    setBusy(false);
  }

  const visible = useMemo(() => filter === "all" ? listings : listings.filter(item => item.status === filter),[filter,listings]);
  const successful = payments.filter(payment => payment.status === "success");
  const revenue = successful.reduce((total,payment) => total + Number(payment.amount),0);

  if (state === "loading") return <main className="admin-loading"><span>◎</span><p>Checking administrator access…</p></main>;
  if (state === "signed_out") return <AdminLogin onSubmit={signIn} busy={busy} message={message}/>;
  if (state === "denied") return <main className="admin-login"><section className="admin-login-card"><span className="admin-logo">◎</span><p className="admin-kicker">RESTRICTED PORTAL</p><h1>Access denied</h1><p>This signed in account is a customer account and cannot access administration.</p><button onClick={signOut}>Sign in with an admin account</button><a href="/">Return to marketplace</a></section></main>;

  return <main className="admin-app">
    <header className="admin-header"><a href="/"><span>◎</span><b>Ship Dealers</b><small>Administration</small></a><div><span>Secure owner portal</span><button onClick={signOut}>Sign out</button></div></header>
    <section className="admin-title"><div><p>ADMIN CONTROL CENTRE</p><h1>Marketplace overview</h1></div><a href="/">View customer website</a></section>
    {message && <div className="admin-notice" role="status">{message}</div>}
    <section className="admin-stats"><article><small>Pending approval</small><b>{listings.filter(item => item.status === "pending").length}</b></article><article><small>Active adverts</small><b>{listings.filter(item => item.status === "approved").length}</b></article><article><small>Open reports</small><b>{reports.filter(item=>item.status==="open").length}</b></article><article><small>Product views</small><b>{events.filter(item=>item.event_name==="listing_view").length}</b></article><article><small>Successful payments</small><b>{successful.length}</b></article><article><small>Revenue</small><b>GH₵ {revenue.toLocaleString("en-GH")}</b></article></section>
    <section className="admin-workspace">
      <div className="admin-section-head"><div><p>LISTING MODERATION</p><h2>Adverts</h2></div><nav>{["pending","approved","rejected","all"].map(item => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</nav></div>
      {visible.length === 0 ? <div className="admin-empty">No {filter === "all" ? "" : filter} adverts found.</div> : <div className="admin-listings">{visible.map(item => <article key={item.id} className="admin-listing-card" onClick={() => setReviewTarget(item)}><img src={item.image_urls[0]} alt=""/><div><small>{item.category} · {item.location}</small><h3>{item.title}</h3><p>{item.seller_name} · {item.phone}</p><b>GH₵ {Number(item.price).toLocaleString("en-GH")}</b><span className={`admin-status ${item.status}`}>{item.status}</span><button className="review-link" onClick={() => setReviewTarget(item)}>View full advert</button></div><aside onClick={event => event.stopPropagation()}>{item.status === "pending" && <><button className="approve" disabled={busy} onClick={() => moderate(item.id,"approved")}>Approve</button><button disabled={busy} onClick={() => moderate(item.id,"rejected")}>Reject</button></>}<button className="delete" disabled={busy} onClick={() => setDeleteTarget(item)}>Delete</button></aside></article>)}</div>}
    </section>
    <section className="admin-workspace"><div className="admin-section-head"><div><p>FINANCE</p><h2>Recent payments</h2></div></div>{payments.length === 0 ? <div className="admin-empty">No payments recorded.</div> : <div className="admin-table"><div className="admin-row header"><span>Reference</span><span>Package</span><span>Amount</span><span>Status</span><span>Date</span></div>{payments.slice(0,20).map(payment => <div className="admin-row" key={payment.id}><span>{payment.reference}</span><span>{payment.package}</span><span>GH₵ {Number(payment.amount).toLocaleString("en-GH")}</span><span>{payment.status}</span><span>{new Date(payment.created_at).toLocaleDateString("en-GH")}</span></div>)}</div>}</section>
    <section className="admin-workspace"><div className="admin-section-head"><div><p>TRUST AND SAFETY</p><h2>Recent reports</h2></div></div>{reports.length===0?<div className="admin-empty">No adverts have been reported.</div>:<div className="admin-report-list">{reports.slice(0,20).map(report=><article key={report.id}><b>{listings.find(item=>item.id===report.listing_id)?.title||"Deleted advert"}</b><p>{report.reason}</p><small>{new Date(report.created_at).toLocaleDateString("en-GH")} · {report.status}</small>{report.status==="open"&&<div><button disabled={busy} onClick={()=>resolveReport(report.id,"reviewed")}>Mark reviewed</button><button disabled={busy} onClick={()=>resolveReport(report.id,"dismissed")}>Dismiss</button></div>}</article>)}</div>}</section>
    <section className="admin-workspace"><div className="admin-section-head"><div><p>CUSTOMER CARE</p><h2>Support requests</h2></div></div>{support.length===0?<div className="admin-empty">No support requests.</div>:<div className="admin-report-list">{support.slice(0,20).map(item=><article key={item.id}><b>{item.subject}</b><p>{item.message}</p><small>{new Date(item.created_at).toLocaleDateString("en-GH")} · {item.status}</small>{item.status!=="closed"&&<div><button disabled={busy} onClick={()=>closeSupport(item.id)}>Mark closed</button></div>}</article>)}</div>}</section>
    {reviewTarget && <div className="admin-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setReviewTarget(null); }}><section className="admin-review" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title"><button className="admin-dialog-close" aria-label="Close advert review" onClick={() => setReviewTarget(null)}>×</button><p className="admin-kicker">ADVERT REVIEW</p><h2 id="review-dialog-title">{reviewTarget.title}</h2><div className="admin-review-gallery">{reviewTarget.image_urls.map((url,index)=><img key={url} src={url} alt={`${reviewTarget.title} photo ${index+1}`}/>)}</div><div className="admin-review-grid"><section><h3>Product details</h3><dl><div><dt>Category</dt><dd>{reviewTarget.category}</dd></div><div><dt>Brand</dt><dd>{reviewTarget.brand||"Not provided"}</dd></div><div><dt>Condition</dt><dd>{reviewTarget.item_condition||"Not provided"}</dd></div><div><dt>Price</dt><dd>GH₵ {Number(reviewTarget.price).toLocaleString("en-GH")}{reviewTarget.negotiable?" · Negotiable":""}</dd></div><div><dt>Location</dt><dd>{reviewTarget.location}</dd></div></dl></section><section><h3>Seller and payment</h3><dl><div><dt>Seller</dt><dd>{reviewTarget.seller_name}</dd></div><div><dt>Phone</dt><dd>{reviewTarget.phone}</dd></div><div><dt>WhatsApp</dt><dd>{reviewTarget.whatsapp||"Not provided"}</dd></div><div><dt>Package</dt><dd>{reviewTarget.package||"Not provided"}</dd></div><div><dt>Payment</dt><dd>{reviewTarget.payment_status||"Not recorded"}</dd></div></dl></section></div><section className="admin-review-description"><h3>Description</h3><p>{reviewTarget.description||"No description was provided."}</p></section><div className="admin-review-actions"><button onClick={() => setReviewTarget(null)}>Close</button>{reviewTarget.status === "pending" && <><button disabled={busy} onClick={() => moderate(reviewTarget.id,"rejected")}>Reject advert</button><button className="approve" disabled={busy} onClick={async()=>{await moderate(reviewTarget.id,"approved");setReviewTarget(null);}}>Approve and publish</button></>}</div></section></div>}
    {deleteTarget && <div className="admin-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setDeleteTarget(null); }}>
      <section className="admin-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description">
        <button className="admin-dialog-close" aria-label="Close delete confirmation" disabled={busy} onClick={() => setDeleteTarget(null)}>×</button>
        <span className="admin-dialog-icon" aria-hidden="true">!</span>
        <p className="admin-kicker">CONFIRM DELETION</p>
        <h2 id="delete-dialog-title">Delete this advert?</h2>
        <p id="delete-dialog-description">This action is permanent. The advert will disappear from the marketplace and cannot be restored.</p>
        <div className="admin-dialog-item"><img src={deleteTarget.image_urls[0]} alt=""/><div><b>{deleteTarget.title}</b><small>{deleteTarget.seller_name} · GH₵ {Number(deleteTarget.price).toLocaleString("en-GH")}</small></div></div>
        <div className="admin-dialog-actions"><button disabled={busy} onClick={() => setDeleteTarget(null)}>Keep advert</button><button className="confirm-delete" disabled={busy} onClick={removeListing}>{busy ? "Deleting…" : "Yes, delete advert"}</button></div>
      </section>
    </div>}
  </main>;
}

function AdminLogin({onSubmit,busy,message}:{onSubmit:(event:FormEvent<HTMLFormElement>)=>void;busy:boolean;message:string}) {
  return <main className="admin-login"><section className="admin-login-card"><span className="admin-logo">◎</span><p className="admin-kicker">SHIP DEALERS BUSINESS CONNECT</p><h1>Administrator login</h1><p>Use the authorized owner email and password. Customer accounts cannot enter this portal.</p><form onSubmit={onSubmit}><label>Admin email<input name="email" type="email" required autoComplete="username"/></label><label>Password<input name="password" type="password" required autoComplete="current-password"/></label>{message && <div className="admin-error">{message}</div>}<button disabled={busy}>{busy ? "Verifying access…" : "Enter admin portal"}</button></form><a href="/">Return to customer marketplace</a></section></main>;
}
