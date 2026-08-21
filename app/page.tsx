"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AuthGate from "./AuthGate";
import { supabase } from "./supabase-client";
import "./customer-dialogs.css";
import "./customer-dashboard.css";

type Listing = {
  id: string;
  seller_id: string;
  seller_name: string;
  title: string;
  category: string;
  brand: string;
  item_condition: string;
  price: number;
  negotiable: boolean;
  description: string;
  location: string;
  phone: string;
  whatsapp: string | null;
  image_urls: string[];
  status: "awaiting_payment" | "pending" | "approved" | "rejected" | "sold";
  package: "standard" | "featured" | "business";
  payment_status: "unpaid" | "paid" | "failed" | "refunded" | "free";
  payment_reference: string | null;
  rejection_reason: string | null;
  created_at: string;
  expires_at: string | null;
};

type Payment = {
  id: string;
  reference: string;
  package: string;
  amount: number;
  status: string;
  channel: string | null;
  paid_at: string | null;
  created_at: string;
};

type Review = {
  id: string;
  listing_id: string;
  seller_id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

type Notification = {
  id: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

type Follow = {
  follower_id: string;
  follower_name: string;
  seller_id: string;
  seller_name: string;
  created_at: string;
};

type ChatThread = {
  id: string;
  listing_id: string;
  buyer_id: string;
  buyer_name: string;
  seller_id: string;
  seller_name: string;
  listing_title: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

type ChatMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type SupportRequest = {
  id: string;
  subject: string;
  message: string;
  status: string;
  admin_reply: string | null;
  replied_at: string | null;
  replied_by_name: string | null;
  created_at: string;
};

type AnalyticsEvent = {
  id: number;
  user_id: string;
  listing_id: string | null;
  event_name: string;
  created_at: string;
};

type DashboardTab = "marketplace" | "mine" | "profile" | "messages" | "support";

const categories = [
  "Vehicles",
  "Property",
  "Mobile Phones",
  "Electronics",
  "Home & Furniture",
  "Fashion",
  "Health & Beauty",
  "Jobs",
  "Services",
  "Agriculture",
  "Kids & Babies",
  "Other",
];

const PAGE_SIZE = 12;
const DAY = 24 * 60 * 60 * 1000;
const SUPPORT_TIMEOUT_MS = 12000;

export default function Home() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [followers, setFollowers] = useState<Follow[]>([]);
  const [following, setFollowing] = useState<Follow[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messagesByThread, setMessagesByThread] = useState<Record<string, ChatMessage[]>>({});
  const [supportTickets, setSupportTickets] = useState<SupportRequest[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsEvent[]>([]);
  const [tab, setTab] = useState<DashboardTab>("marketplace");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [location, setLocation] = useState("All Ghana");
  const [condition, setCondition] = useState("All conditions");
  const [maxPrice, setMaxPrice] = useState("");
  const [page, setPage] = useState(1);
  const [sellOpen, setSellOpen] = useState(false);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [soldTarget, setSoldTarget] = useState<Listing | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(true);
  const [memberId, setMemberId] = useState("");
  const [memberName, setMemberName] = useState("Member");
  const [memberIsAdmin, setMemberIsAdmin] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportNotice, setSupportNotice] = useState("");

  const loadPrimaryData = useCallback(async () => {
    const [listingsRes, reviewsRes, notificationsRes, supportRes, analyticsRes] = await Promise.all([
      supabase.from("listings").select("*").order("created_at", { ascending: false }),
      supabase.from("seller_reviews").select("*").order("created_at", { ascending: false }),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("support_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("analytics_events").select("*").order("created_at", { ascending: false }).limit(500),
    ]);

    if (!listingsRes.error) setListings((listingsRes.data || []) as Listing[]);
    if (!reviewsRes.error) setReviews((reviewsRes.data || []) as Review[]);
    if (!notificationsRes.error) setNotifications((notificationsRes.data || []) as Notification[]);
    if (!supportRes.error) setSupportTickets((supportRes.data || []) as SupportRequest[]);
    if (!analyticsRes.error) setAnalytics((analyticsRes.data || []) as AnalyticsEvent[]);
  }, []);

  const loadMemberData = useCallback(async (uid: string, preferredThreadId?: string) => {
    const [followersRes, followingRes, threadsRes, messagesRes] = await Promise.all([
      supabase.from("user_follows").select("*").eq("seller_id", uid).order("created_at", { ascending: false }),
      supabase.from("user_follows").select("*").eq("follower_id", uid).order("created_at", { ascending: false }),
      supabase.from("chat_threads").select("*").or(`buyer_id.eq.${uid},seller_id.eq.${uid}`).order("last_message_at", { ascending: false }),
      supabase.from("chat_messages").select("*").order("created_at", { ascending: true }),
    ]);

    if (!followersRes.error) setFollowers((followersRes.data || []) as Follow[]);
    if (!followingRes.error) setFollowing((followingRes.data || []) as Follow[]);
    if (!threadsRes.error) {
      const threadRows = (threadsRes.data || []) as ChatThread[];
      setThreads(threadRows);
      setActiveThreadId(current => {
        if (preferredThreadId && threadRows.some(thread => thread.id === preferredThreadId)) return preferredThreadId;
        if (current && threadRows.some(thread => thread.id === current)) return current;
        return threadRows[0]?.id || "";
      });
    }
    if (!messagesRes.error) {
      const grouped: Record<string, ChatMessage[]> = {};
      for (const message of (messagesRes.data || []) as ChatMessage[]) {
        if (!grouped[message.thread_id]) grouped[message.thread_id] = [];
        grouped[message.thread_id].push(message);
      }
      setMessagesByThread(grouped);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      const uid = user?.id || "";
      const displayName = String(user?.user_metadata?.full_name || user?.phone || user?.email || "Member");
      const isAdmin = user?.app_metadata?.role === "admin";
      if (cancelled) return;

      setMemberId(uid);
      setMemberName(displayName);
      setMemberIsAdmin(isAdmin);

      await loadPrimaryData();
      if (uid) {
        await loadMemberData(uid);
      }

      const reference = new URLSearchParams(window.location.search).get("reference");
      if (reference) {
        setPaymentNotice("Verifying your payment…");
        const verified = await supabase.functions.invoke("verify-paystack", { body: { reference } });
        setPaymentNotice(
          verified.error || !verified.data?.success
            ? "Payment could not be verified. Check My adverts or try again."
            : "Payment confirmed. Your advert is now waiting for approval.",
        );
        window.history.replaceState({}, "", window.location.pathname);
        await loadPrimaryData();
        if (uid) await loadMemberData(uid);
      }

      if (!cancelled) setLoading(false);
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [loadMemberData, loadPrimaryData]);

  useEffect(() => {
    if (showNotifications) void markNotificationsRead();
  }, [showNotifications]);

  useEffect(() => {
    if (tab === "messages" && activeThreadId) {
      void markThreadRead(activeThreadId);
    }
  }, [activeThreadId, tab]);

  const visibleListings = useMemo(
    () =>
      listings.filter(item => {
        if (tab === "marketplace" && item.status !== "approved") return false;
        if (tab === "mine" && item.seller_id !== memberId) return false;
        const haystack = `${item.title} ${item.brand} ${item.description} ${item.location}`.toLowerCase();
        return (
          haystack.includes(query.toLowerCase()) &&
          (category === "All" || item.category === category) &&
          (location === "All Ghana" || item.location === location) &&
          (condition === "All conditions" || item.item_condition === condition) &&
          (!maxPrice || Number(item.price) <= Number(maxPrice))
        );
      }),
    [category, condition, listings, location, maxPrice, memberId, query, tab],
  );

  const pageCount = Math.max(1, Math.ceil(visibleListings.length / PAGE_SIZE));
  const pagedListings = visibleListings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const locations = useMemo(
    () => ["All Ghana", ...Array.from(new Set(listings.map(item => item.location)))],
    [listings],
  );

  const myListings = useMemo(() => listings.filter(item => item.seller_id === memberId), [listings, memberId]);
  const myListingIds = useMemo(() => new Set(myListings.map(item => item.id)), [myListings]);
  const myReviews = useMemo(() => reviews.filter(item => item.seller_id === memberId), [reviews, memberId]);
  const averageRating = myReviews.length
    ? myReviews.reduce((sum, review) => sum + review.rating, 0) / myReviews.length
    : 0;
  const myViews = analytics.filter(event => event.event_name === "listing_view" && event.listing_id && myListingIds.has(event.listing_id)).length;
  const myCalls = analytics.filter(event => event.event_name === "call_click" && event.listing_id && myListingIds.has(event.listing_id)).length;
  const myWhatsAppClicks = analytics.filter(event => event.event_name === "whatsapp_click" && event.listing_id && myListingIds.has(event.listing_id)).length;
  const mySoldCount = myListings.filter(item => item.status === "sold").length;
  const followingCount = following.length;
  const followersCount = followers.length;
  const unreadNotifications = notifications.filter(notification => !notification.read_at).length;
  const activeThread = threads.find(thread => thread.id === activeThreadId) || null;
  const currentThreadMessages = activeThreadId ? messagesByThread[activeThreadId] || [] : [];
  const isFollowingSelectedSeller = selected ? following.some(follow => follow.seller_id === selected.seller_id) : false;

  useEffect(() => {
    setPage(1);
  }, [category, condition, location, maxPrice, query, tab]);

  async function markNotificationsRead() {
    const unread = notifications.filter(notification => !notification.read_at);
    if (!unread.length) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unread.map(notification => notification.id));
    setNotifications(items => items.map(notification => (notification.read_at ? notification : { ...notification, read_at: new Date().toISOString() })));
  }

  async function markThreadRead(threadId: string) {
    const messages = messagesByThread[threadId] || [];
    const unreadIds = messages.filter(message => !message.read_at && message.sender_id !== memberId).map(message => message.id);
    if (!unreadIds.length) return;
    const now = new Date().toISOString();
    await supabase.from("chat_messages").update({ read_at: now }).in("id", unreadIds);
    setMessagesByThread(previous => {
      const threadMessages = previous[threadId] || [];
      return {
        ...previous,
        [threadId]: threadMessages.map(message => (unreadIds.includes(message.id) ? { ...message, read_at: now } : message)),
      };
    });
  }

  async function markSold(id: string) {
    if (soldTarget?.id !== id) {
      setActionMessage("");
      setSoldTarget(listings.find(item => item.id === id) || null);
      return;
    }

    const { error } = await supabase.from("listings").update({ status: "sold" }).eq("id", id);
    if (error) {
      setActionMessage(error.message);
    } else {
      setSoldTarget(null);
      setActionMessage("Your advert is now marked as sold and has been removed from active listings.");
      await loadPrimaryData();
      if (memberId) await loadMemberData(memberId);
    }
  }

  async function openChatForListing(listing: Listing) {
    if (!memberId || listing.seller_id === memberId) return;
    const existing = await supabase
      .from("chat_threads")
      .select("*")
      .eq("listing_id", listing.id)
      .eq("buyer_id", memberId)
      .maybeSingle();
    if (existing.error) {
      setActionMessage(existing.error.message);
      return;
    }

    let thread = existing.data as ChatThread | null;
    if (!thread) {
      const created = await supabase
        .from("chat_threads")
        .insert({
          listing_id: listing.id,
          buyer_id: memberId,
          buyer_name: memberName,
          seller_id: listing.seller_id,
          seller_name: listing.seller_name,
          listing_title: listing.title,
        })
        .select("*")
        .single();
      if (created.error || !created.data) {
        setActionMessage(created.error?.message || "The chat could not be started.");
        return;
      }
      thread = created.data as ChatThread;
    }

    setTab("messages");
    setActiveThreadId(thread.id);
    setSelected(null);
    await loadMemberData(memberId, thread.id);
  }

  async function toggleFollowSeller(listing: Listing) {
    if (!memberId || listing.seller_id === memberId) return;

    const isFollowing = following.some(item => item.seller_id === listing.seller_id);
    if (isFollowing) {
      const { error } = await supabase.from("user_follows").delete().eq("follower_id", memberId).eq("seller_id", listing.seller_id);
      if (error) {
        setActionMessage(error.message);
        return;
      }
      setActionMessage(`You are no longer following ${listing.seller_name}.`);
    } else {
      const { error } = await supabase.from("user_follows").insert({
        follower_id: memberId,
        follower_name: memberName,
        seller_id: listing.seller_id,
        seller_name: listing.seller_name,
      });
      if (error) {
        setActionMessage(error.message);
        return;
      }
      setActionMessage(`You are now following ${listing.seller_name}.`);
    }

    await loadMemberData(memberId);
  }

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeThreadId || !memberId) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get("message") || "").trim();
    if (!body) return;

    const { error } = await supabase.from("chat_messages").insert({
      thread_id: activeThreadId,
      sender_id: memberId,
      sender_name: memberName,
      body,
    });
    if (error) {
      setActionMessage(error.message);
      return;
    }

    await supabase
      .from("chat_threads")
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", activeThreadId);

    formElement.reset();
    await loadMemberData(memberId, activeThreadId);
  }

  async function sendSupportRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberId) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const subject = String(form.get("subject") || "").trim();
    const message = String(form.get("message") || "").trim();
    if (subject.length < 5 || message.length < 20) {
      setSupportNotice("Please write a clear subject and at least 20 characters in the message.");
      return;
    }

    setSupportBusy(true);
    setSupportNotice("");
    try {
      const { error } = await withTimeout(
        supabase.from("support_requests").insert({
          user_id: memberId,
          subject,
          message,
        }),
        "Support is taking too long to respond. Please try again in a moment.",
      );
      setSupportNotice(error ? error.message : "Your support request has been received.");
      if (!error) {
        formElement.reset();
        setSupportSubject("");
        setSupportMessage("");
        await loadPrimaryData();
      }
    } catch (error) {
      setSupportNotice(error instanceof Error ? error.message : "We could not send your support request.");
    } finally {
      setSupportBusy(false);
    }
  }

  if (loading) {
    return <div className="auth-loading"><span className="auth-mark">◎</span><p>Loading your marketplace…</p></div>;
  }

  return (
    <AuthGate>
      <main className="market-app">
        <header className="market-header">
          <div className="wrap market-nav">
            <button className="market-brand" onClick={() => setTab("marketplace")} type="button">
              <span>◎</span>
              <b>Ship Dealers</b>
              <small>Business Connect</small>
            </button>

            <div className="market-search">
              <input
                aria-label="Search products"
                placeholder="What are you looking for?"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
              <button type="button" onClick={() => setTab("marketplace")}>Search</button>
            </div>

            <button className="sell-cta" onClick={() => setSellOpen(true)} type="button">
              ＋ SELL
            </button>
          </div>
        </header>

        <div className="market-tabs wrap">
          <button className={tab === "marketplace" ? "active" : ""} onClick={() => setTab("marketplace")} type="button">
            Marketplace
          </button>
          <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")} type="button">
            My adverts
          </button>
          <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")} type="button">
            My profile
          </button>
          <button className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")} type="button">
            Messages
          </button>
          <button className={tab === "support" ? "active" : ""} onClick={() => setTab("support")} type="button">
            Support
          </button>
          <button
            className="notification-button"
            onClick={() => setShowNotifications(previous => !previous)}
            type="button"
          >
            Notifications {unreadNotifications > 0 && <span>{unreadNotifications}</span>}
          </button>
          <button className="mobile-sell" onClick={() => setSellOpen(true)} type="button">
            Post advert
          </button>
        </div>

        {showNotifications && (
          <section className="notification-panel wrap">
            <div>
              <h3>Notifications</h3>
              <button onClick={() => setShowNotifications(false)} type="button">
                Close
              </button>
            </div>
            {notifications.length === 0 ? (
              <p>No notifications yet.</p>
            ) : (
              notifications.map(notification => (
                <article key={notification.id}>
                  <b>{notification.title}</b>
                  <p>{notification.message}</p>
                  <small>{new Date(notification.created_at).toLocaleDateString("en-GH")}</small>
                </article>
              ))
            )}
          </section>
        )}

        {paymentNotice && <div className="payment-notice wrap">{paymentNotice}</div>}

        <section className="market-hero">
          <div className="wrap">
            <p>GHANA’S TRUSTED ONLINE MARKETPLACE</p>
            <h1>Buy and sell with confidence.</h1>
            <div className="hero-search">
              <select aria-label="Product category" value={category} onChange={event => setCategory(event.target.value)}>
                <option>All</option>
                {categories.map(item => <option key={item}>{item}</option>)}
              </select>
              <input
                aria-label="Search listings"
                placeholder="Search phones, cars, property and more"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
              <select aria-label="Location" value={location} onChange={event => setLocation(event.target.value)}>
                {locations.map(item => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="quick-filters">
              <select value={condition} onChange={event => setCondition(event.target.value)} aria-label="Condition">
                <option>All conditions</option>
                <option>Brand new</option>
                <option>Used</option>
                <option>Refurbished</option>
              </select>
              <input
                value={maxPrice}
                onChange={event => setMaxPrice(event.target.value)}
                type="number"
                min="1"
                placeholder="Maximum price GH₵"
                aria-label="Maximum price"
              />
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory("All");
                  setLocation("All Ghana");
                  setCondition("All conditions");
                  setMaxPrice("");
                }}
              >
                Clear filters
              </button>
            </div>
          </div>
        </section>

        {(tab === "marketplace" || tab === "mine") && (
          <section className="market-body wrap">
            <aside>
              <h3>Categories</h3>
              <button className={category === "All" ? "active" : ""} onClick={() => setCategory("All")} type="button">
                <span>◉</span>All categories
              </button>
              {categories.map((item, index) => (
                <button
                  className={category === item ? "active" : ""}
                  onClick={() => setCategory(item)}
                  key={item}
                  type="button"
                >
                  <span>{["◆", "⌂", "▣", "▤", "▦", "♢", "✦", "▧", "●", "♣", "★", "•••"][index]}</span>
                  {item}
                </button>
              ))}
              <div className="safety-card">
                <b>Buy safely</b>
                <p>Meet in a public place, inspect the item and pay only when satisfied.</p>
              </div>
            </aside>

            <div className="listing-area">
              <div className="listing-head">
                <div>
                  <p>{tab === "marketplace" ? "LATEST LISTINGS" : "SELLER DASHBOARD"}</p>
                  <h2>{tab === "marketplace" ? "Fresh opportunities" : "My adverts"}</h2>
                </div>
                <strong>
                  {visibleListings.length} advert{visibleListings.length === 1 ? "" : "s"}
                </strong>
              </div>

              {visibleListings.length === 0 ? (
                <div className="market-empty">
                  <b>{tab === "marketplace" ? "No approved adverts yet" : "You haven’t posted an advert yet"}</b>
                  <p>
                    {tab === "marketplace"
                      ? "Be the first seller to list a product."
                      : "Post your first product and reach verified buyers."}
                  </p>
                  <button onClick={() => setSellOpen(true)} type="button">
                    Post an advert
                  </button>
                </div>
              ) : (
                <>
                  <div className="product-grid">
                    {pagedListings.map(item => {
                      const expired = Boolean(item.expires_at && new Date(item.expires_at) <= new Date());
                      return (
                        <article className="product-card" key={item.id} onClick={() => setSelected(item)}>
                          <div className="product-image">
                            <img loading="lazy" decoding="async" src={item.image_urls[0]} alt={item.title} />
                            {item.image_urls.length > 1 && <span>▧ {item.image_urls.length}</span>}
                            <i className={`status-${item.status}`}>{expired ? "expired" : item.status}</i>
                          </div>
                          <div className="product-copy">
                            <p>{item.location} · {item.item_condition}</p>
                            <h3>{item.title}</h3>
                            <small>{item.brand} · {item.category}</small>
                            <strong>GH₵ {Number(item.price).toLocaleString("en-GH")}</strong>
                            {item.negotiable && <em>Negotiable</em>}
                          </div>
                          {tab === "mine" && item.status === "approved" && !expired && (
                            <button
                              className="sold-button"
                              onClick={event => {
                                event.stopPropagation();
                                markSold(item.id);
                              }}
                              type="button"
                            >
                              Mark as sold
                            </button>
                          )}
                          {tab === "mine" && expired && (
                            <button
                              className="sold-button"
                              onClick={event => {
                                event.stopPropagation();
                                setSellOpen(true);
                              }}
                              type="button"
                            >
                              Renew with a new advert
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>

                  {pageCount > 1 && (
                    <nav className="pagination" aria-label="Listing pages">
                      <button disabled={page === 1} onClick={() => setPage(current => current - 1)} type="button">
                        Previous
                      </button>
                      <span>
                        Page {page} of {pageCount}
                      </span>
                      <button disabled={page === pageCount} onClick={() => setPage(current => current + 1)} type="button">
                        Next
                      </button>
                    </nav>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {tab === "profile" && (
          <CustomerDashboard
            memberName={memberName}
            myListings={myListings}
            reviews={myReviews}
            averageRating={averageRating}
            views={myViews}
            calls={myCalls}
            whatsappClicks={myWhatsAppClicks}
            followers={followers}
            following={following}
            supportTickets={supportTickets}
            onOpenListing={listing => setSelected(listing)}
            onSell={() => setSellOpen(true)}
          />
        )}

        {tab === "messages" && (
          <MessagesPanel
            memberId={memberId}
            memberName={memberName}
            threads={threads}
            activeThreadId={activeThreadId}
            messagesByThread={messagesByThread}
            onSelectThread={threadId => setActiveThreadId(threadId)}
            onSendMessage={sendChatMessage}
            onOpenListing={listingId => {
              const listing = listings.find(item => item.id === listingId);
              if (listing) setSelected(listing);
            }}
          />
        )}

        {tab === "support" && (
          <SupportPanel
            supportTickets={supportTickets}
            supportSubject={supportSubject}
            setSupportSubject={setSupportSubject}
            supportMessage={supportMessage}
            setSupportMessage={setSupportMessage}
            supportBusy={supportBusy}
            supportNotice={supportNotice}
            onSubmit={sendSupportRequest}
          />
        )}

        <footer className="market-footer">
          <div className="wrap">
            <b>Ship Dealers Business Connect</b>
            <nav>
              <a href="/support">Contact support</a>
              <a href="/safety">Safety advice</a>
              <a href="/terms">Terms</a>
              <a href="/privacy">Privacy</a>
              <a href="/refunds">Refund policy</a>
            </nav>
            <small>Buy and sell responsibly across Ghana.</small>
          </div>
        </footer>

        {sellOpen && (
          <SellModal
            isAdmin={memberIsAdmin}
            onClose={() => setSellOpen(false)}
            onCreated={message => {
              setSellOpen(false);
              setTab("mine");
              setPaymentNotice(message || "");
              void loadPrimaryData();
              if (memberId) void loadMemberData(memberId);
            }}
          />
        )}

        {selected && (
          <ListingModal
            listing={selected}
            mine={selected.seller_id === memberId}
            userId={memberId}
            memberName={memberName}
            reviews={reviews}
            isFollowing={isFollowingSelectedSeller}
            onReviewsChanged={async () => {
              const refreshed = await supabase.from("seller_reviews").select("*").order("created_at", { ascending: false });
              if (!refreshed.error) setReviews((refreshed.data || []) as Review[]);
            }}
            onOpenChat={async () => {
              await openChatForListing(selected);
            }}
            onToggleFollow={async () => {
              await toggleFollowSeller(selected);
            }}
            onClose={() => setSelected(null)}
          />
        )}

        {soldTarget && (
          <div className="modal-backdrop">
            <section className="customer-dialog" role="dialog" aria-modal="true" aria-labelledby="sold-dialog-title">
              <button className="modal-close" aria-label="Close confirmation" onClick={() => setSoldTarget(null)} type="button">
                ×
              </button>
              <span className="customer-dialog-icon">✓</span>
              <p className="modal-kicker">UPDATE YOUR ADVERT</p>
              <h2 id="sold-dialog-title">Mark this item as sold?</h2>
              <p>“{soldTarget.title}” will leave the active marketplace. Buyers will no longer be able to contact you about it.</p>
              {actionMessage && <p className="dialog-error">{actionMessage}</p>}
              <div className="customer-dialog-actions">
                <button onClick={() => setSoldTarget(null)} type="button">
                  Keep it active
                </button>
                <button className="confirm-action" onClick={() => markSold(soldTarget.id)} type="button">
                  Yes, mark as sold
                </button>
              </div>
            </section>
          </div>
        )}

        {actionMessage && !soldTarget && (
          <div className="modal-backdrop">
            <section className="customer-dialog customer-success" role="status" aria-modal="true">
              <button className="modal-close" aria-label="Close message" onClick={() => setActionMessage("")} type="button">
                ×
              </button>
              <span className="customer-dialog-icon">✓</span>
              <p className="modal-kicker">ADVERT UPDATED</p>
              <h2>Done successfully</h2>
              <p>{actionMessage}</p>
              <div className="customer-dialog-actions">
                <button className="confirm-action" onClick={() => setActionMessage("")} type="button">
                  Continue
                </button>
              </div>
            </section>
          </div>
        )}
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

function CustomerDashboard({
  memberName,
  myListings,
  reviews,
  averageRating,
  views,
  calls,
  whatsappClicks,
  followers,
  following,
  supportTickets,
  onOpenListing,
  onSell,
}: {
  memberName: string;
  myListings: Listing[];
  reviews: Review[];
  averageRating: number;
  views: number;
  calls: number;
  whatsappClicks: number;
  followers: Follow[];
  following: Follow[];
  supportTickets: SupportRequest[];
  onOpenListing: (listing: Listing) => void;
  onSell: () => void;
}) {
  const recentListings = myListings.slice(0, 4);
  const recentReviews = reviews.slice(0, 4);
  const recentFollowers = followers.slice(0, 6);
  const recentFollowing = following.slice(0, 6);
  const approvedCount = myListings.filter(item => item.status === "approved").length;
  const soldCount = myListings.filter(item => item.status === "sold").length;
  const pendingCount = myListings.filter(item => item.status === "pending").length;
  const openSupportCount = supportTickets.filter(ticket => ticket.status !== "closed").length;

  return (
    <section className="customer-center wrap">
      <div className="dashboard-hero">
        <div>
          <p className="modal-kicker">CUSTOMER PROFILE</p>
          <h2>{memberName}</h2>
          <p>
            Manage your adverts, feedback, performance, followers, chat and support from one mobile-friendly dashboard.
          </p>
        </div>
        <button type="button" onClick={onSell}>
          Post an advert
        </button>
      </div>

      <div className="dashboard-metrics">
        <article>
          <small>My adverts</small>
          <b>{myListings.length}</b>
        </article>
        <article>
          <small>Approved</small>
          <b>{approvedCount}</b>
        </article>
        <article>
          <small>Followers</small>
          <b>{followers.length}</b>
        </article>
        <article>
          <small>Average rating</small>
          <b>{averageRating ? averageRating.toFixed(1) : "—"}</b>
        </article>
        <article>
          <small>Views</small>
          <b>{views}</b>
        </article>
        <article>
          <small>Contacts</small>
          <b>{calls + whatsappClicks}</b>
        </article>
      </div>

      <div className="dashboard-layout">
        <section className="dashboard-card dashboard-card-wide">
          <div className="dashboard-section-head">
            <div>
              <p>MY ADVERTS</p>
              <h3>What you are selling</h3>
            </div>
          </div>
          {recentListings.length === 0 ? (
            <div className="dashboard-empty">
              <b>No adverts yet</b>
              <p>Post your first advert and it will appear here after admin review.</p>
            </div>
          ) : (
            <div className="dashboard-list">
              {recentListings.map(listing => (
                <article key={listing.id} onClick={() => onOpenListing(listing)}>
                  <img src={listing.image_urls[0]} alt={listing.title} />
                  <div>
                    <small>
                      {listing.category} · {listing.location}
                    </small>
                    <h4>{listing.title}</h4>
                    <p>GH₵ {Number(listing.price).toLocaleString("en-GH")}</p>
                    <span className={`listing-pill status-${listing.status}`}>{listing.status}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <div className="dashboard-section-head">
            <div>
              <p>PERFORMANCE</p>
              <h3>How your adverts are doing</h3>
            </div>
          </div>
          <div className="profile-stats">
            <article>
              <small>Sold</small>
              <b>{soldCount}</b>
            </article>
            <article>
              <small>Pending</small>
              <b>{pendingCount}</b>
            </article>
            <article>
              <small>Support requests</small>
              <b>{openSupportCount}</b>
            </article>
          </div>
          <div className="tiny-stat-list">
            <p><b>{views}</b> product views</p>
            <p><b>{calls}</b> call clicks</p>
            <p><b>{whatsappClicks}</b> WhatsApp taps</p>
          </div>
        </section>

        <section className="dashboard-card">
          <div className="dashboard-section-head">
            <div>
              <p>FEEDBACK</p>
              <h3>Buyer ratings</h3>
            </div>
          </div>
          {recentReviews.length === 0 ? (
            <div className="dashboard-empty">
              <b>No feedback yet</b>
              <p>Once buyers review your adverts, their ratings will show here.</p>
            </div>
          ) : (
            <div className="feedback-list">
              {recentReviews.map(review => (
                <article key={review.id}>
                  <b>{review.rating}★</b>
                  <p>{review.comment || "No written comment."}</p>
                  <small>{new Date(review.created_at).toLocaleDateString("en-GH")}</small>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <div className="dashboard-section-head">
            <div>
              <p>FOLLOWERS</p>
              <h3>People following your shop</h3>
            </div>
          </div>
          {recentFollowers.length === 0 ? (
            <div className="dashboard-empty">
              <b>No followers yet</b>
              <p>As customers follow your shop, they will appear here.</p>
            </div>
          ) : (
            <div className="people-list">
              {recentFollowers.map(follow => (
                <article key={`${follow.follower_id}-${follow.seller_id}`}>
                  <b>{follow.follower_name}</b>
                  <small>{new Date(follow.created_at).toLocaleDateString("en-GH")}</small>
                </article>
              ))}
            </div>
          )}
          <div className="dashboard-divider" />
          <p className="mini-title">You are following</p>
          {recentFollowing.length === 0 ? (
            <p className="dashboard-muted">You are not following any shops yet.</p>
          ) : (
            <div className="people-list compact">
              {recentFollowing.map(follow => (
                <article key={`${follow.follower_id}-${follow.seller_id}`}>
                  <b>{follow.seller_name}</b>
                  <small>{new Date(follow.created_at).toLocaleDateString("en-GH")}</small>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function MessagesPanel({
  memberId,
  memberName,
  threads,
  activeThreadId,
  messagesByThread,
  onSelectThread,
  onSendMessage,
  onOpenListing,
}: {
  memberId: string;
  memberName: string;
  threads: ChatThread[];
  activeThreadId: string;
  messagesByThread: Record<string, ChatMessage[]>;
  onSelectThread: (threadId: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onOpenListing: (listingId: string) => void;
}) {
  const activeThread = threads.find(thread => thread.id === activeThreadId) || null;
  const activeMessages = activeThreadId ? messagesByThread[activeThreadId] || [] : [];

  return (
    <section className="customer-center wrap">
      <div className="dashboard-hero">
        <div>
          <p className="modal-kicker">MESSAGES</p>
          <h2>Buyer and seller chat</h2>
          <p>Keep conversations on the platform, follow up on interest, and manage each advert’s chat in one place.</p>
        </div>
      </div>

      <div className="messages-shell">
        <aside className="messages-thread-list">
          <div className="dashboard-section-head">
            <div>
              <p>CONVERSATIONS</p>
              <h3>Your chats</h3>
            </div>
          </div>
          {threads.length === 0 ? (
            <div className="dashboard-empty">
              <b>No chats yet</b>
              <p>Open a listing and tap “Message seller” to start the first conversation.</p>
            </div>
          ) : (
            threads.map(thread => {
              const isMineListing = thread.seller_id === memberId;
              const counterpart = isMineListing ? thread.buyer_name : thread.seller_name;
              const preview = (messagesByThread[thread.id] || []).at(-1)?.body || "No message yet.";
              return (
                <button
                  key={thread.id}
                  type="button"
                  className={thread.id === activeThreadId ? "thread-item active" : "thread-item"}
                  onClick={() => onSelectThread(thread.id)}
                >
                  <b>{counterpart}</b>
                  <small>{thread.listing_title}</small>
                  <span>{preview}</span>
                </button>
              );
            })
          )}
        </aside>

        <section className="messages-panel">
          {activeThread ? (
            <>
              <div className="messages-panel-head">
                <div>
                  <p className="modal-kicker">ACTIVE CHAT</p>
                  <h3>{activeThread.listing_title}</h3>
                  <small>
                    {activeThread.seller_id === memberId ? activeThread.buyer_name : activeThread.seller_name}
                  </small>
                </div>
                <button type="button" onClick={() => onOpenListing(activeThread.listing_id)}>
                  View advert
                </button>
              </div>

              <div className="messages-thread">
                {activeMessages.length === 0 ? (
                  <div className="dashboard-empty">
                    <b>Start the conversation</b>
                    <p>Send a friendly opening message below.</p>
                  </div>
                ) : (
                  activeMessages.map(message => (
                    <article key={message.id} className={message.sender_id === memberId ? "message-item mine" : "message-item"}>
                      <b>{message.sender_id === memberId ? memberName : message.sender_name}</b>
                      <p>{message.body}</p>
                      <small>{new Date(message.created_at).toLocaleString("en-GH")}</small>
                    </article>
                  ))
                )}
              </div>

              <form className="message-form" onSubmit={onSendMessage}>
                <textarea name="message" rows={3} placeholder="Write your message…" minLength={1} maxLength={1000} required />
                <button type="submit">Send message</button>
              </form>
            </>
          ) : (
            <div className="dashboard-empty">
              <b>Select a chat</b>
              <p>Pick a conversation from the list to start messaging.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function SupportPanel({
  supportTickets,
  supportSubject,
  setSupportSubject,
  supportMessage,
  setSupportMessage,
  supportBusy,
  supportNotice,
  onSubmit,
}: {
  supportTickets: SupportRequest[];
  supportSubject: string;
  setSupportSubject: (value: string) => void;
  supportMessage: string;
  setSupportMessage: (value: string) => void;
  supportBusy: boolean;
  supportNotice: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <section className="customer-center wrap">
      <div className="dashboard-hero">
        <div>
          <p className="modal-kicker">CUSTOMER SUPPORT</p>
          <h2>Need help?</h2>
          <p>Send questions about your account, adverts, payments, refunds or safety and we’ll keep the ticket in your dashboard.</p>
        </div>
      </div>

      <div className="dashboard-layout support-layout">
        <section className="dashboard-card dashboard-card-wide">
          <div className="dashboard-section-head">
            <div>
              <p>NEW REQUEST</p>
              <h3>Contact support</h3>
            </div>
          </div>
          <form className="support-form" onSubmit={onSubmit}>
            <label>
              Subject
              <input
                name="subject"
                minLength={5}
                maxLength={120}
                required
                placeholder="What do you need help with?"
                value={supportSubject}
                onChange={event => setSupportSubject(event.target.value)}
              />
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
                value={supportMessage}
                onChange={event => setSupportMessage(event.target.value)}
              />
            </label>
            {supportNotice && <p className="legal-note" role="status">{supportNotice}</p>}
            <button disabled={supportBusy} type="submit">
              {supportBusy ? "Sending…" : "Send support request"}
            </button>
          </form>
        </section>

        <section className="dashboard-card">
          <div className="dashboard-section-head">
            <div>
              <p>HISTORY</p>
              <h3>Your support tickets</h3>
            </div>
          </div>
          {supportTickets.length === 0 ? (
            <div className="dashboard-empty">
              <b>No requests yet</b>
              <p>Any request you send will appear here so you can track it later.</p>
            </div>
          ) : (
            <div className="people-list ticket-list">
              {supportTickets.slice(0, 8).map(ticket => (
                <article key={ticket.id}>
                  <b>{ticket.subject}</b>
                  <p>{ticket.message}</p>
                  {ticket.admin_reply && (
                    <div className="ticket-reply">
                      <strong>Support reply</strong>
                      <p>{ticket.admin_reply}</p>
                      <small>
                        {ticket.replied_by_name || "Support team"}
                        {ticket.replied_at ? ` · ${new Date(ticket.replied_at).toLocaleDateString("en-GH")}` : ""}
                      </small>
                    </div>
                  )}
                  <small>
                    {new Date(ticket.created_at).toLocaleDateString("en-GH")} · {ticket.status}
                  </small>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

async function optimizeProductImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
}

function SellModal({
  isAdmin,
  onClose,
  onCreated,
}: {
  isAdmin: boolean;
  onClose: () => void;
  onCreated: (message?: string) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [error, setError] = useState("");
  const [freeListingEligible, setFreeListingEligible] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkEligibility() {
      if (isAdmin) {
        if (!cancelled) {
          setFreeListingEligible(true);
          setChecking(false);
        }
        return;
      }

      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) {
        if (!cancelled) setChecking(false);
        return;
      }

      const { count, error: countError } = await supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", userId);

      if (!cancelled) {
        setFreeListingEligible(!countError && (count || 0) === 0);
        setChecking(false);
      }
    }

    checkEligibility();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (files.length < 1 || files.length > 6) {
      setError("Upload between 1 and 6 product photos.");
      return;
    }

    setBusy(true);
    setUploadedCount(0);
    setError("");

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setError("Your session expired. Sign in again.");
      setBusy(false);
      return;
    }

    const urls: string[] = [];
    for (const file of files) {
      if (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 10 * 1024 * 1024) {
        setError("Use JPG, PNG or WebP images under 10 MB each.");
        setBusy(false);
        return;
      }

      const optimized = await optimizeProductImage(file);
      const path = `${auth.user.id}/${crypto.randomUUID()}-${optimized.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`;
      const upload = await supabase.storage.from("product-images").upload(path, optimized, {
        cacheControl: "31536000",
        upsert: false,
      });
      if (upload.error) {
        setError(upload.error.message);
        setBusy(false);
        return;
      }
      urls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
      setUploadedCount(count => count + 1);
    }

    const formData = new FormData(form);
    const listing = {
      seller_name: String(auth.user.user_metadata?.full_name || auth.user.phone || "Verified seller"),
      title: String(formData.get("title") || ""),
      category: String(formData.get("category") || ""),
      brand: String(formData.get("brand") || ""),
      item_condition: String(formData.get("condition") || ""),
      price: Number(formData.get("price")),
      negotiable: formData.get("negotiable") === "on",
      location: String(formData.get("location") || ""),
      description: String(formData.get("description") || ""),
      phone: String(formData.get("phone") || ""),
      whatsapp: formData.get("whatsapp") ? String(formData.get("whatsapp")) : null,
      image_urls: urls,
      package: String(formData.get("package") || "standard"),
    };

    const postingAsAdmin = auth.user.app_metadata?.role === "admin";

    if (freeListingEligible || postingAsAdmin) {
      const inserted = await supabase.from("listings").insert({
        seller_id: auth.user.id,
        seller_name: listing.seller_name,
        title: listing.title,
        category: listing.category,
        brand: listing.brand,
        item_condition: listing.item_condition,
        price: listing.price,
        negotiable: listing.negotiable,
        description: listing.description,
        location: listing.location,
        phone: listing.phone,
        whatsapp: listing.whatsapp,
        image_urls: listing.image_urls,
        package: listing.package,
        status: postingAsAdmin ? "approved" : "pending",
        payment_status: "free",
        payment_reference: null,
        expires_at: new Date(Date.now() + 30 * DAY).toISOString(),
      });

      if (inserted.error) {
        setError(inserted.error.message);
        setBusy(false);
        return;
      }

      onCreated(
        postingAsAdmin
          ? "Admin advert posted without payment and is now live in the marketplace."
          : "Your first advert is free and is waiting for admin approval.",
      );
      return;
    }

    let payment;
    try {
      payment = await Promise.race([
        supabase.functions.invoke("initialize-paystack", { body: { listing } }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("The payment service took too long. Please check your connection and try again.")),
            25000,
          ),
        ),
      ]);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Payment could not be started.");
      setBusy(false);
      return;
    }

    if (payment.error || !payment.data?.authorization_url) {
      setError(payment.data?.error || payment.error?.message || "Payment could not be started.");
      setBusy(false);
      return;
    }

    window.location.assign(payment.data.authorization_url);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="sell-modal">
        <button className="modal-close" onClick={onClose} aria-label="Close" type="button">
          ×
        </button>
        <p className="modal-kicker">CREATE AN ADVERT</p>
        <h2>What are you selling?</h2>
        <p>
          {checking
            ? "Checking posting options…"
            : isAdmin
              ? "Admin posting is free. Submit the advert and it will enter review before it appears on the marketplace."
            : freeListingEligible
              ? "Your first advert is free. Submit it and the admin will review it before it appears on the marketplace."
              : "Choose a package, pay securely, then your advert will enter review."}
        </p>
        <form onSubmit={submit} className="sell-form">
          <fieldset className="package-picker full">
            <legend>Choose listing package</legend>
            <label>
              <input type="radio" name="package" value="standard" defaultChecked />
              <b>Standard</b>
              <span>GH₵10</span>
              <small>One advert for 30 days</small>
            </label>
            <label>
              <input type="radio" name="package" value="featured" />
              <b>Featured</b>
              <span>GH₵25</span>
              <small>Priority placement for 30 days</small>
            </label>
            <label>
              <input type="radio" name="package" value="business" />
              <b>Business</b>
              <span>GH₵80</span>
              <small>Business seller package</small>
            </label>
          </fieldset>
          <label className="full">
            Product photos (1 to 6)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              required
              onChange={event => setFiles(Array.from(event.target.files || []).slice(0, 6))}
            />
            <small>
              {files.length
                ? `${files.length} photo${files.length > 1 ? "s" : ""} selected. Maximum 10 MB each.`
                : "JPG, PNG or WebP. Maximum 10 MB each."}
            </small>
          </label>
          <label>
            Title
            <input name="title" minLength={5} maxLength={120} required placeholder="e.g. Samsung Galaxy phone" />
          </label>
          <label>
            Category
            <select name="category" required>
              <option value="">Choose category</option>
              {categories.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Brand
            <input name="brand" required placeholder="e.g. Samsung" />
          </label>
          <label>
            Condition
            <select name="condition" required>
              <option>Brand new</option>
              <option>Used</option>
              <option>Refurbished</option>
            </select>
          </label>
          <label>
            Price (GH₵)
            <input name="price" type="number" min="1" step="0.01" required placeholder="25000" />
          </label>
          <label className="check">
            <input name="negotiable" type="checkbox" />
            Price is negotiable
          </label>
          <label>
            Location
            <input name="location" required placeholder="e.g. Tema, Greater Accra" />
          </label>
          <label>
            Phone number
            <input name="phone" type="tel" required placeholder="e.g. 024 000 0000" />
          </label>
          <label>
            WhatsApp number
            <input name="whatsapp" type="tel" placeholder="Optional" />
          </label>
          <label className="full">
            Description
            <textarea
              name="description"
              minLength={20}
              maxLength={3000}
              required
              rows={6}
              placeholder="Describe the product, specifications, age, condition and what is included."
            />
          </label>
          {error && <p className="form-error full">{error}</p>}
          <div className="form-actions full">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="post-button" disabled={busy}>
              {busy
                ? uploadedCount < files.length
                  ? `Uploading photos ${uploadedCount} of ${files.length}…`
                  : "Opening secure payment…"
                : freeListingEligible || isAdmin
                  ? "Submit for free review"
                  : "Continue to secure payment"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ListingModal({
  listing,
  mine,
  userId,
  memberName,
  reviews,
  isFollowing,
  onReviewsChanged,
  onOpenChat,
  onToggleFollow,
  onClose,
}: {
  listing: Listing;
  mine: boolean;
  userId: string;
  memberName: string;
  reviews: Review[];
  isFollowing: boolean;
  onReviewsChanged: () => Promise<void>;
  onOpenChat: () => Promise<void>;
  onToggleFollow: () => Promise<void>;
  onClose: () => void;
}) {
  const [photo, setPhoto] = useState(0);
  const [notice, setNotice] = useState("");
  const [trustDialog, setTrustDialog] = useState<"report" | "review" | null>(null);
  const [trustText, setTrustText] = useState("");
  const [score, setScore] = useState(5);
  const [trustBusy, setTrustBusy] = useState(false);
  const sellerReviews = reviews.filter(review => review.seller_id === listing.seller_id);
  const rating = sellerReviews.length ? sellerReviews.reduce((sum, review) => sum + review.rating, 0) / sellerReviews.length : 0;
  const wa = (listing.whatsapp || listing.phone).replace(/\D/g, "").replace(/^0/, "233");

  useEffect(() => {
    if (userId) {
      void supabase.from("analytics_events").insert({ user_id: userId, listing_id: listing.id, event_name: "listing_view" });
    }
  }, [listing.id, userId]);

  async function submitTrust() {
    setTrustBusy(true);
    if (trustDialog === "report") {
      if (trustText.trim().length < 5) {
        setNotice("Please explain the problem in at least 5 characters.");
        setTrustBusy(false);
        return;
      }
      const { error } = await supabase.from("listing_reports").insert({
        listing_id: listing.id,
        reporter_id: userId,
        reason: trustText.trim(),
      });
      setNotice(error?.code === "23505" ? "You already reported this advert." : error ? error.message : "Thank you. The admin will review this advert.");
      if (!error) setTrustDialog(null);
    } else {
      const { error } = await supabase.from("seller_reviews").insert({
        listing_id: listing.id,
        seller_id: listing.seller_id,
        reviewer_id: userId,
        rating: score,
        comment: trustText.trim() || null,
      });
      setNotice(
        error?.code === "23505"
          ? "You already reviewed this seller for this advert."
          : error
            ? error.message
            : "Your seller review was added.",
      );
      if (!error) {
        setTrustDialog(null);
        await onReviewsChanged();
      }
    }
    setTrustBusy(false);
  }

  async function track(name: "call_click" | "whatsapp_click") {
    if (userId) {
      await supabase.from("analytics_events").insert({ user_id: userId, listing_id: listing.id, event_name: name });
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="detail-modal">
        <button className="modal-close" onClick={onClose} aria-label="Close" type="button">
          ×
        </button>
        <div className="detail-gallery">
          <img src={listing.image_urls[photo]} alt={listing.title} />
          <div>
            {listing.image_urls.map((url, index) => (
              <button className={photo === index ? "active" : ""} key={url} onClick={() => setPhoto(index)} type="button">
                <img loading="lazy" src={url} alt="" />
              </button>
            ))}
          </div>
        </div>
        <div className="detail-info">
          <p className="modal-kicker">
            {listing.category} · {listing.location}
          </p>
          <h2>{listing.title}</h2>
          <div className="detail-price">GH₵ {Number(listing.price).toLocaleString("en-GH")}</div>
          {listing.negotiable && <span className="negotiable">Negotiable</span>}
          <dl>
            <div>
              <dt>Brand</dt>
              <dd>{listing.brand}</dd>
            </div>
            <div>
              <dt>Condition</dt>
              <dd>{listing.item_condition}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{listing.status}</dd>
            </div>
          </dl>
          <h3>Description</h3>
          <p className="description">{listing.description}</p>
          <div className="seller-box">
            <b>✓ {listing.seller_name}</b>
            <small>
              Verified member · {rating ? `${rating.toFixed(1)} ★ from ${sellerReviews.length} review${sellerReviews.length === 1 ? "" : "s"}` : "New seller with no ratings yet"}
            </small>
            {!mine && (
              <>
                <a onClick={() => track("call_click")} className="call-button" href={`tel:${listing.phone}`}>
                  Call seller · {listing.phone}
                </a>
                <a
                  onClick={() => track("whatsapp_click")}
                  className="whatsapp-button"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hello, I saw your ${listing.title} on Ship Dealers Business Connect. Is it still available?`)}`}
                >
                  Chat on WhatsApp
                </a>
                <button className="follow-button" type="button" onClick={onToggleFollow}>
                  {isFollowing ? "Following seller" : "Follow seller"}
                </button>
                <button className="follow-button follow-button-secondary" type="button" onClick={onOpenChat}>
                  Message seller
                </button>
                <div className="trust-actions">
                  <button type="button" onClick={() => { setTrustText(""); setTrustDialog("review"); }}>
                    Rate seller
                  </button>
                  <button type="button" onClick={() => { setTrustText(""); setTrustDialog("report"); }}>
                    Report advert
                  </button>
                </div>
              </>
            )}
          </div>
          {notice && <p className="pending-note">{notice}</p>}
          {listing.status === "pending" && <p className="pending-note">This advert is awaiting owner review.</p>}
          {listing.status === "rejected" && <p className="rejected-note">Changes required: {listing.rejection_reason || "Please review the advert details."}</p>}
        </div>
      </section>
      {trustDialog && (
        <div className="trust-dialog-backdrop">
          <section className="trust-dialog" role="alertdialog" aria-modal="true">
            <button className="modal-close" onClick={() => setTrustDialog(null)} aria-label="Close" type="button">
              ×
            </button>
            <p className="modal-kicker">{trustDialog === "review" ? "SELLER FEEDBACK" : "TRUST AND SAFETY"}</p>
            <h2>{trustDialog === "review" ? "Rate this seller" : "Report this advert"}</h2>
            <p>
              {trustDialog === "review"
                ? "Your feedback helps other buyers make safer decisions."
                : "Tell us what looks suspicious or breaks the marketplace rules."}
            </p>
            {trustDialog === "review" && (
              <div className="star-picker" aria-label="Seller rating">
                {[1, 2, 3, 4, 5].map(value => (
                  <button key={value} className={value <= score ? "active" : ""} onClick={() => setScore(value)} aria-label={`${value} star${value === 1 ? "" : "s"}`} type="button">
                    ★
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={trustText}
              onChange={event => setTrustText(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder={trustDialog === "review" ? "Optional comment" : "Describe the problem"}
            />
            <div className="admin-dialog-actions">
              <button type="button" onClick={() => setTrustDialog(null)}>
                Cancel
              </button>
              <button className="confirm-delete" disabled={trustBusy} onClick={submitTrust} type="button">
                {trustBusy ? "Sending…" : trustDialog === "review" ? "Submit rating" : "Send report"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
