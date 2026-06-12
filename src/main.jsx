import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import {
  BadgeCheck,
  Clock3,
  Copy,
  CreditCard,
  FileText,
  History,
  LockKeyhole,
  LogIn,
  Play,
  Sparkles,
  User,
  X,
} from "lucide-react";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const buildStamp = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
}).format(new Date());

function normalizeYoutubeUrl(value) {
  const input = value.trim();
  const idPattern = /^[a-zA-Z0-9_-]{11}$/;

  if (idPattern.test(input)) {
    return { videoId: input, cleanUrl: `https://www.youtube.com/watch?v=${input}` };
  }

  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v") || "";
      if (url.pathname.startsWith("/shorts/")) videoId = url.pathname.split("/")[2] || "";
      if (url.pathname.startsWith("/embed/")) videoId = url.pathname.split("/")[2] || "";
    }

    if (!idPattern.test(videoId)) return null;
    return { videoId, cleanUrl: `https://www.youtube.com/watch?v=${videoId}` };
  } catch {
    return null;
  }
}

function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function demoTranscript(cleanUrl) {
  return [
    { offset: 0, text: `TranscriptFlow cleaned this video URL: ${cleanUrl}` },
    { offset: 8, text: "Connect Supabase to save transcripts across devices." },
    { offset: 16, text: "Deploy on Vercel to use the serverless transcript endpoint." },
  ];
}

function App() {
  const [url, setUrl] = useState("");
  const [normalized, setNormalized] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [user, setUser] = useState(null);
  const [freeUsed, setFreeUsed] = useState(false);

  const transcriptText = useMemo(
    () => transcript.map((line) => `[${formatTimestamp(line.offset)}] ${line.text}`).join("\n"),
    [transcript],
  );

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUser(data.session.user);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !user?.id) return;

    supabase
      .from("transcripts")
      .select("id, video_id, clean_url, lines, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (!data) return;
        setHistory(
          data.map((item) => ({
            id: item.id,
            title: item.video_id,
            cleanUrl: item.clean_url,
            createdAt: item.created_at,
            lines: item.lines || [],
          })),
        );
      });
  }, [user]);

  async function handleAuth(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    setStatus("");
    setError("");

    if (supabase) {
      const action =
        authMode === "login"
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({ email, password });
      const { data, error: authError } = await action;
      if (authError) {
        setError(authError.message);
        return;
      }
      setUser(data.user || { email });
    } else {
      setUser({ email });
      setStatus("Demo account active. Add Supabase env vars for real authentication.");
    }

    setShowAuth(false);
  }

  async function generateTranscript() {
    const clean = normalizeYoutubeUrl(url);
    setError("");
    setStatus("");
    setNormalized(clean);

    if (!clean) {
      setError("Paste a valid YouTube URL, Shorts link, share link, or video ID.");
      return;
    }

    if (!user && freeUsed) {
      setShowAuth(true);
      setStatus(
        "Your first generation is free, but you need to log in or create an account first.",
      );
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: clean.cleanUrl }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          "Local Vite preview is showing a demo transcript. Deploy on Vercel to run the transcript API.",
        );
      }

      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error);

      setTranscript(payload.transcript);
      await saveHistory(clean, payload.transcript);
    } catch (requestError) {
      const fallback = demoTranscript(clean.cleanUrl);
      setTranscript(fallback);
      await saveHistory(clean, fallback);
      setStatus(
        requestError.message ||
          "Demo transcript shown. The live endpoint will run after deployment.",
      );
    } finally {
      setFreeUsed(true);
      setLoading(false);
    }
  }

  async function saveHistory(clean, lines) {
    const item = {
      id: crypto.randomUUID(),
      title: clean.videoId,
      cleanUrl: clean.cleanUrl,
      createdAt: new Date().toISOString(),
      lines,
    };
    setHistory((items) => [item, ...items].slice(0, 8));

    if (supabase && user?.id) {
      await supabase.from("transcripts").insert({
        user_id: user.id,
        video_id: clean.videoId,
        clean_url: clean.cleanUrl,
        lines,
      });
    }
  }

  async function copyTranscript() {
    if (!transcriptText) return;
    await navigator.clipboard.writeText(transcriptText);
    setStatus("Transcript copied to clipboard.");
  }

  function claimOffer() {
    setStatus("Offer marked ready. Connect Stripe checkout when plan IDs are available.");
  }

  return (
    <main id="top">
      <section className="offer">
        <span>Limited time offer: generate unlimited transcripts for 7 days</span>
        <button onClick={claimOffer}>Claim now</button>
      </section>

      <header className="nav">
        <a href="#top" className="brand" aria-label="TranscriptFlow home">
          <span className="brandMark">
            <FileText size={20} />
          </span>
          TranscriptFlow
        </a>
        <nav>
          <a href="#generator">Generator</a>
          <a href="#history">History</a>
          <a href="#account">Account</a>
        </nav>
        <button className="ghostButton" onClick={() => setShowAuth(true)}>
          <LogIn size={18} />
          {user ? "Account" : "Come In"}
        </button>
      </header>

      <section className="hero" id="generator">
        <div className="heroCopy">
          <span className="eyebrow">
            <Sparkles size={16} /> AI powered YouTube transcripts
          </span>
          <h1>Paste any YouTube link. Get a clean transcript in seconds.</h1>
          <p>
            Supabase-backed history, plain text or timestamps, and a desktop app option built for
            people who want the transcript first.
          </p>
        </div>

        <div className="generatorPanel">
          <div className="inputRow">
            <input
              aria-label="YouTube URL, Shorts link, share link, or video ID"
              placeholder="Paste YouTube URL, Shorts link, or video ID"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && generateTranscript()}
            />
            <button className="primaryButton" onClick={generateTranscript} disabled={loading}>
              <Play size={18} />
              {loading ? "Generating" : "Generate"}
            </button>
          </div>

          {normalized && <p className="cleanUrl">Clean video URL: {normalized.cleanUrl}</p>}
          {error && <p className="message error">{error}</p>}
          {status && <p className="message">{status}</p>}

          <div className="outputHeader">
            <span>Output</span>
            <button className="iconButton" onClick={copyTranscript} aria-label="Copy transcript">
              <Copy size={18} />
            </button>
          </div>
          <article className="output">
            {transcript.length ? (
              transcript.map((line, index) => (
                <p key={`${line.offset}-${index}`}>
                  <time>{formatTimestamp(line.offset)}</time>
                  <span>{line.text}</span>
                </p>
              ))
            ) : (
              <>
                <h2>Your transcript will land here.</h2>
                <p>
                  Login once, paste a link, and your generated text stays copy-ready with history
                  saved.
                </p>
              </>
            )}
          </article>
        </div>
      </section>

      <section className="dashboard">
        <div className="panel" id="history">
          <div className="panelTitle">
            <History size={20} />
            <span>History</span>
            <b>{history.length} saved</b>
          </div>
          {history.length ? (
            <div className="historyList">
              {history.map((item) => (
                <button key={item.id} onClick={() => setTranscript(item.lines)}>
                  <span>{item.title}</span>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="emptyState">No transcript history yet.</p>
          )}
        </div>

        <div className="panel" id="account">
          <div className="panelTitle">
            <User size={20} />
            <span>Account settings</span>
            <b>{user ? "Active" : "Guest"}</b>
          </div>
          <div className="stats">
            <div>
              <Clock3 size={18} />
              <span>Credits today</span>
              <strong>{user ? "Unlimited" : freeUsed ? "0" : "1"}</strong>
            </div>
            <div>
              <CreditCard size={18} />
              <span>Billing</span>
              <strong>Locked</strong>
            </div>
            <div>
              <BadgeCheck size={18} />
              <span>Offer</span>
              <strong>Ready</strong>
            </div>
          </div>
          <p className="stripeNote">
            Stripe is intentionally stubbed here: the UI and database are ready for billing fields,
            and checkout can be added when your Stripe keys and plan IDs are available.
          </p>
        </div>
      </section>

      {showAuth && (
        <div className="modalBackdrop" role="dialog" aria-modal="true">
          <form className="authModal" onSubmit={handleAuth}>
            <button
              className="closeButton"
              type="button"
              onClick={() => setShowAuth(false)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <LockKeyhole size={28} />
            <h2>{authMode === "login" ? "Login to continue" : "Create your account"}</h2>
            <p>{status || "Save transcripts, sync history, and unlock daily credits."}</p>
            <input name="email" type="email" placeholder="Email address" required />
            <input name="password" type="password" placeholder="Password" required minLength={6} />
            <button className="primaryButton" type="submit">
              {authMode === "login" ? "Login" : "Create account"}
            </button>
            <button
              className="linkButton"
              type="button"
              onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
            >
              {authMode === "login" ? "New here? Create account" : "Already have an account? Login"}
            </button>
          </form>
        </div>
      )}

      <footer aria-label="App version">TranscriptFlow v0.1.1 · Build {buildStamp}</footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
