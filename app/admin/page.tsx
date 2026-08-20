"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { adminSupabase } from "../supabase-client";
import "./admin.css";
import "./review.css";
import "./dialogs.css";
import "./price-tools.css";

type Listing = { id:string; seller_id:string; seller_name:string; title:string; category:string; brand:string|null; item_condition:string|null; price:number; negotiable:boolean; description:string|null; location:string; phone:string; whatsapp:string|null; image_urls:string[]; status:string; package:string|null; payment_status:string|null; payment_reference:string|null; paid_at:string|null; expires_at:string|null; created_at:string };
type Payment = { id:string; reference:string; package:string; amount:number; status:string; created_at:string };
type Report = { id:string; listing_id:string; reason:string; status:string; created_at:string };
type AnalyticsEvent = { id:number; event_name:string; created_at:string };
type SupportRequest = { id:string; user_id:string; subject:string; message:string; status:string; admin_reply:string|null; replied_at:string|null; replied_by:string|null; replied_by_name:string|null; created_at:string };
type PriceAdjustment = { id:string; listing_id:string; admin_id:string | null; admin_name:string; old_price:number; new_price:number; reason:string | null; created_at:string };
type AdminState = "loading" | "signed_out" | "denied" | "ready";

export default function AdminPortal() {
  const supabase = adminSupabase;
  const [state,setState] = useState<AdminState>("loading");
  const [listings,setListings] = useState<Listing[]>([]);
  const [payments,setPayments] = useState<Payment[]>([]);
  const [reports,setReports] = useState<Report[]>([]);
  const [events,setEvents] = useState<AnalyticsEvent[]>([]);
  const [support,setSupport] = useState<SupportRequest[]>([]);
  const [adjustments,setAdjustments] = useState<PriceAdjustment[]>([]);
  const [filter,setFilter] = useState("pending");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [dataReady,setDataReady] = useState(false);
  const [adminId,setAdminId] = useState("");
  const [adminName,setAdminName] = useState("Admin");
  const [deleteTarget,setDeleteTarget] = useState<Listing | null>(null);
  const [reviewTarget,setReviewTarget] = useState<Listing | null>(null);
  const [rejectTarget,setRejectTarget] = useState<Listing | null>(null);
  const [rejectReason,setRejectReason] = useState("");
  const [priceDraft,setPriceDraft] = useState("");
  const [priceReason,setPriceReason] = useState("");
  const [supportReplies,setSupportReplies] = useState<Record<string,string>>({});

  const loadDashboard = useCallback(async () => {
    setDataReady(false);
    const fetchDashboard = () => Promise.all([
      supabase.from("listings").select("*").order("created_at",{ascending:false}),
      supabase.from("payments").select("*").order("created_at",{ascending:false}),
      supabase.from("listing_reports").select("*").order("created_at",{ascending:false}),
      supabase.from("analytics_events").select("id,event_name,created_at").order("created_at",{ascending:false}).limit(500),
      supabase.from("support_requests").select("*").order("created_at",{ascending:false}),
      supabase.from("listing_price_adjustments").select("*").order("created_at",{ascending:false}),
    ]);
    let [adverts,transactions,reported,activity,requests,priceChanges] = await fetchDashboard();
    const firstError = adverts.error || transactions.error || reported.error || activity.error || requests.error || priceChanges.error;
    if (firstError?.message.toLowerCase().includes("jwt issued at future")) {
      await new Promise(resolve => setTimeout(resolve,4000));
      await supabase.auth.refreshSession();
      [adverts,transactions,reported,activity,requests,priceChanges] = await fetchDashboard();
    }
    const finalError = adverts.error || transactions.error || reported.error || activity.error || requests.error || priceChanges.error;
    if (finalError) {
      setMessage(finalError.message.toLowerCase().includes("jwt issued at future") ? "Your saved data is safe, but the secure session could not be verified. Set Windows date and time to automatic, then sign in again." : `Saved data could not be loaded: ${finalError.message}`);
      return;
    }
    setListings((adverts.data || []) as Listing[]);
    setPayments((transactions.data || []) as Payment[]);
    setReports((reported.data || []) as Report[]);
    setEvents((activity.data || []) as AnalyticsEvent[]);
    setSupport((requests.data || []) as SupportRequest[]);
    setAdjustments((priceChanges.data || []) as PriceAdjustment[]);
    setDataReady(true);
    setMessage("");
  },[]);

  useEffect(() => { supabase.auth.getUser().then(async ({data,error}) => {
    if (error || !data.user) return setState("signed_out");
    setAdminId(data.user.id);
    setAdminName(String(data.user.user_metadata?.full_name || data.user.email || "Admin"));
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

  useEffect(() => {
    if (reviewTarget) {
      setPriceDraft(String(reviewTarget.price));
      setPriceReason("");
    }
  }, [reviewTarget]);

  async function signOut() { await supabase.auth.signOut(); setListings([]); setPayments([]); setDataReady(false); setState("signed_out"); }
  async function moderate(id:string,status:"approved"|"rejected",reason:string|null=null) {
    if (status === "rejected" && !reason?.trim()) { setMessage("Enter a reason before rejecting the advert."); return; }
    setBusy(true); setMessage(""); const {data:updated,error} = await supabase.from("listings").update({status,rejection_reason:reason}).eq("id",id).select("id,seller_id,title").single();
    if(!error&&updated){await supabase.from("notifications").upsert({user_id:updated.seller_id,listing_id:updated.id,type:status,title:status==="approved"?"Advert approved":"Advert needs changes",message:status==="approved"?`${updated.title} is now live in the marketplace.`:`${updated.title} was not approved. ${reason||"Review the advert details."}`,source_key:`moderation-${updated.id}-${status}-${Date.now()}`},{onConflict:"user_id,source_key"});}
    setMessage(error ? error.message : status === "approved" ? "Advert approved, published and seller notified." : "Advert rejected and seller notified."); if (!error) { setRejectTarget(null); setRejectReason(""); await loadDashboard(); } setBusy(false);
  }
  async function resolveReport(id:string,status:"reviewed"|"dismissed"){setBusy(true);const {error}=await supabase.from("listing_reports").update({status}).eq("id",id);setMessage(error?error.message:`Report marked ${status}.`);if(!error)await loadDashboard();setBusy(false);}
  async function replySupport(item:SupportRequest){
    const reply = (supportReplies[item.id] || "").trim();
    if (reply.length < 5) { setMessage("Write a clear reply before sending."); return; }
    setBusy(true); setMessage("");
    const {error} = await supabase.from("support_requests").update({admin_reply:reply,replied_at:new Date().toISOString(),replied_by:adminId||null,replied_by_name:adminName,status:"answered"}).eq("id",item.id);
    if(!error){
      await supabase.from("notifications").upsert({user_id:item.user_id,type:"support_reply",title:"Support has replied",message:`Reply to “${item.subject}”: ${reply.slice(0,120)}${reply.length>120?"…":""}`,source_key:`support-reply-${item.id}-${Date.now()}`},{onConflict:"user_id,source_key"});
      setSupportReplies(previous=>({...previous,[item.id]:""}));
    }
    setMessage(error?error.message:"Support reply sent and customer notified.");
    if(!error)await loadDashboard();
    setBusy(false);
  }
  async function closeSupport(id:string){setBusy(true);const {error}=await supabase.from("support_requests").update({status:"closed"}).eq("id",id);setMessage(error?error.message:"Support request marked resolved.");if(!error)await loadDashboard();setBusy(false);}
  async function deleteSupport(item:SupportRequest){if(item.status!=="closed"){setMessage("Only resolved support requests can be deleted.");return;}setBusy(true);const {error}=await supabase.from("support_requests").delete().eq("id",item.id);setMessage(error?error.message:"Resolved support request deleted.");if(!error)await loadDashboard();setBusy(false);}
  async function removeListing() {
    if (!deleteTarget) return;
    setBusy(true); setMessage("");
    const {error} = await supabase.from("listings").delete().eq("id",deleteTarget.id);
    setMessage(error ? error.message : `“${deleteTarget.title}” was permanently deleted.`);
    if (!error) { setDeleteTarget(null); await loadDashboard(); }
    setBusy(false);
  }
  async function applyDiscount() {
    if (!reviewTarget) return;
    const nextPrice = Number(priceDraft);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0 || nextPrice >= Number(reviewTarget.price)) {
      setMessage("Enter a lower price to apply a discount.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { data: updated, error } = await supabase.from("listings").update({ price: nextPrice }).eq("id", reviewTarget.id).select("id,seller_id,title,price").single();
    if (!error && updated) {
      await supabase.from("listing_price_adjustments").insert({
        listing_id: updated.id,
        admin_id: adminId || null,
        admin_name: adminName,
        old_price: reviewTarget.price,
        new_price: nextPrice,
        reason: priceReason.trim() || "Manual price reduction",
      });
      await supabase.from("notifications").upsert({
        user_id: updated.seller_id,
        listing_id: updated.id,
        type: "price_adjustment",
        title: "Price updated by admin",
        message: `${updated.title} was reduced from GH₵ ${Number(reviewTarget.price).toLocaleString("en-GH")} to GH₵ ${Number(nextPrice).toLocaleString("en-GH")}.`,
        source_key: `price-${updated.id}-${nextPrice}-${Date.now()}`,
      }, { onConflict: "user_id,source_key" });
    }
    setMessage(error ? error.message : "Price updated and seller notified.");
    if (!error) {
      setPriceReason("");
      await loadDashboard();
    }
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
    <section className="admin-stats"><article><small>Pending approval</small><b>{dataReady?listings.filter(item => item.status === "pending").length:"—"}</b></article><article><small>Active adverts</small><b>{dataReady?listings.filter(item => item.status === "approved").length:"—"}</b></article><article><small>Open reports</small><b>{dataReady?reports.filter(item=>item.status==="open").length:"—"}</b></article><article><small>Product views</small><b>{dataReady?events.filter(item=>item.event_name==="listing_view").length:"—"}</b></article><article><small>Successful payments</small><b>{dataReady?successful.length:"—"}</b></article><article><small>Revenue</small><b>{dataReady?`GH₵ ${revenue.toLocaleString("en-GH")}`:"—"}</b></article></section>
    <section className="admin-workspace">
      <div className="admin-section-head"><div><p>LISTING MODERATION</p><h2>Adverts</h2></div><nav>{["pending","approved","rejected","all"].map(item => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</nav></div>
      {visible.length === 0 ? <div className="admin-empty">No {filter === "all" ? "" : filter} adverts found.</div> : <div className="admin-listings">{visible.map(item => <article key={item.id} className="admin-listing-card" onClick={() => setReviewTarget(item)}><img src={item.image_urls[0]} alt=""/><div><small>{item.category} · {item.location}</small><h3>{item.title}</h3><p>{item.seller_name} · {item.phone}</p><b>GH₵ {Number(item.price).toLocaleString("en-GH")}</b><span className={`admin-status ${item.status}`}>{item.status}</span><button className="review-link" onClick={() => setReviewTarget(item)}>View full advert</button></div><aside onClick={event => event.stopPropagation()}>{item.status === "pending" && <><button className="approve" disabled={busy} onClick={() => moderate(item.id,"approved")}>Approve</button><button disabled={busy} onClick={() => {setRejectTarget(item);setRejectReason("");}}>Reject</button></>}<button className="delete" disabled={busy} onClick={() => setDeleteTarget(item)}>Delete</button></aside></article>)}</div>}
    </section>
    <section className="admin-workspace"><div className="admin-section-head"><div><p>FINANCE</p><h2>Recent payments</h2></div></div>{payments.length === 0 ? <div className="admin-empty">No payments recorded.</div> : <div className="admin-table"><div className="admin-row header"><span>Reference</span><span>Package</span><span>Amount</span><span>Status</span><span>Date</span></div>{payments.slice(0,20).map(payment => <div className="admin-row" key={payment.id}><span>{payment.reference}</span><span>{payment.package}</span><span>GH₵ {Number(payment.amount).toLocaleString("en-GH")}</span><span>{payment.status}</span><span>{new Date(payment.created_at).toLocaleDateString("en-GH")}</span></div>)}</div>}</section>
    <section className="admin-workspace"><div className="admin-section-head"><div><p>PRICE CONTROL</p><h2>Recent price changes</h2></div></div>{adjustments.length === 0 ? <div className="admin-empty">No manual price changes yet.</div> : <div className="admin-table"><div className="admin-row header"><span>Advert</span><span>Old price</span><span>New price</span><span>By</span><span>Date</span></div>{adjustments.slice(0,20).map(change => <div className="admin-row" key={change.id}><span>{listings.find(item => item.id === change.listing_id)?.title || "Deleted advert"}</span><span>GH₵ {Number(change.old_price).toLocaleString("en-GH")}</span><span>GH₵ {Number(change.new_price).toLocaleString("en-GH")}</span><span>{change.admin_name}</span><span>{new Date(change.created_at).toLocaleDateString("en-GH")}</span></div>)}</div>}</section>
    <section className="admin-workspace"><div className="admin-section-head"><div><p>TRUST AND SAFETY</p><h2>Recent reports</h2></div></div>{reports.length===0?<div className="admin-empty">No adverts have been reported.</div>:<div className="admin-report-list">{reports.slice(0,20).map(report=><article key={report.id}><b>{listings.find(item=>item.id===report.listing_id)?.title||"Deleted advert"}</b><p>{report.reason}</p><small>{new Date(report.created_at).toLocaleDateString("en-GH")} · {report.status}</small>{report.status==="open"&&<div><button disabled={busy} onClick={()=>resolveReport(report.id,"reviewed")}>Mark reviewed</button><button disabled={busy} onClick={()=>resolveReport(report.id,"dismissed")}>Dismiss</button></div>}</article>)}</div>}</section>
    <section className="admin-workspace"><div className="admin-section-head"><div><p>CUSTOMER CARE</p><h2>Support requests</h2></div></div>{support.length===0?<div className="admin-empty">No support requests.</div>:<div className="admin-report-list">{support.slice(0,20).map(item=><article key={item.id}><b>{item.subject}</b><p>{item.message}</p><small>{new Date(item.created_at).toLocaleDateString("en-GH")} · {item.status}</small>{item.admin_reply&&<div className="admin-support-reply"><strong>Admin reply</strong><p>{item.admin_reply}</p><small>{item.replied_by_name||"Admin"}{item.replied_at?` · ${new Date(item.replied_at).toLocaleDateString("en-GH")}`:""}</small></div>}{item.status!=="closed"&&<label className="admin-support-box">Reply to customer<textarea rows={4} maxLength={1000} value={supportReplies[item.id]??item.admin_reply??""} onChange={event=>setSupportReplies(previous=>({...previous,[item.id]:event.target.value}))} placeholder="Type the response customers will see in their support history."/></label>}<div>{item.status!=="closed"&&<><button disabled={busy} onClick={()=>replySupport(item)}>Send reply</button><button disabled={busy} onClick={()=>closeSupport(item.id)}>Mark resolved</button></>}{item.status==="closed"&&<button className="delete" disabled={busy} onClick={()=>deleteSupport(item)}>Delete resolved</button>}</div></article>)}</div>}</section>
    {reviewTarget && <div className="admin-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setReviewTarget(null); }}><section className="admin-review" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title"><button className="admin-dialog-close" aria-label="Close advert review" onClick={() => setReviewTarget(null)}>×</button><p className="admin-kicker">ADVERT REVIEW</p><h2 id="review-dialog-title">{reviewTarget.title}</h2><div className="admin-review-gallery">{reviewTarget.image_urls.map((url,index)=><img key={url} src={url} alt={`${reviewTarget.title} photo ${index+1}`}/>)}</div><div className="admin-review-grid"><section><h3>Product details</h3><dl><div><dt>Category</dt><dd>{reviewTarget.category}</dd></div><div><dt>Brand</dt><dd>{reviewTarget.brand||"Not provided"}</dd></div><div><dt>Condition</dt><dd>{reviewTarget.item_condition||"Not provided"}</dd></div><div><dt>Price</dt><dd>GH₵ {Number(reviewTarget.price).toLocaleString("en-GH")}{reviewTarget.negotiable?" · Negotiable":""}</dd></div><div><dt>Location</dt><dd>{reviewTarget.location}</dd></div></dl></section><section><h3>Seller and payment</h3><dl><div><dt>Seller</dt><dd>{reviewTarget.seller_name}</dd></div><div><dt>Phone</dt><dd>{reviewTarget.phone}</dd></div><div><dt>WhatsApp</dt><dd>{reviewTarget.whatsapp||"Not provided"}</dd></div><div><dt>Package</dt><dd>{reviewTarget.package||"Not provided"}</dd></div><div><dt>Payment</dt><dd>{reviewTarget.payment_status||"Not recorded"}</dd></div></dl></section></div><section className="admin-review-description"><h3>Description</h3><p>{reviewTarget.description||"No description was provided."}</p></section><section className="admin-price-tools"><h3>Manual price reduction</h3><p>Offer a discount or reduce the advertised price before the listing goes live.</p><label>New price<input type="number" min="1" step="0.01" value={priceDraft} onChange={event=>setPriceDraft(event.target.value)} placeholder="Enter new price"/></label><label>Reason for change<textarea rows={3} maxLength={300} value={priceReason} onChange={event=>setPriceReason(event.target.value)} placeholder="Optional note for the seller"/></label><div className="admin-review-actions"><button disabled={busy} onClick={applyDiscount} type="button">Save price change</button></div></section><div className="admin-review-actions"><button onClick={() => setReviewTarget(null)}>Close</button>{reviewTarget.status === "pending" && <><button disabled={busy} onClick={() => {setRejectTarget(reviewTarget);setRejectReason("");setReviewTarget(null);}}>Reject advert</button><button className="approve" disabled={busy} onClick={async()=>{await moderate(reviewTarget.id,"approved");setReviewTarget(null);}}>Approve and publish</button></>}</div></section></div>}
    {rejectTarget && <div className="admin-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setRejectTarget(null);}}><section className="brand-dialog" role="dialog" aria-modal="true" aria-labelledby="reject-title"><button className="admin-dialog-close" aria-label="Close rejection form" onClick={()=>setRejectTarget(null)}>×</button><span className="brand-dialog-icon" aria-hidden="true">!</span><p className="admin-kicker">ADVERT MODERATION</p><h2 id="reject-title">Why are you rejecting this advert?</h2><p>Give the seller a clear reason so they know what to correct in “{rejectTarget.title}”.</p><label>Reason for rejection<textarea autoFocus value={rejectReason} onChange={event=>setRejectReason(event.target.value)} minLength={5} maxLength={500} rows={5} placeholder="Example: Add clearer product photos and the correct price."/></label><small>{rejectReason.length}/500 characters</small><div className="admin-review-actions"><button disabled={busy} onClick={()=>setRejectTarget(null)}>Cancel</button><button className="danger-action" disabled={busy||rejectReason.trim().length<5} onClick={()=>moderate(rejectTarget.id,"rejected",rejectReason.trim())}>{busy?"Rejecting…":"Reject and notify seller"}</button></div></section></div>}
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
