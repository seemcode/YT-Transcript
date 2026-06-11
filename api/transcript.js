import { YoutubeTranscript } from "youtube-transcript";

function normalizeYoutubeUrl(input) {
  const trimmed = String(input || "").trim();
  const idPattern = /^[a-zA-Z0-9_-]{11}$/;

  if (idPattern.test(trimmed)) {
    return { videoId: trimmed, cleanUrl: `https://www.youtube.com/watch?v=${trimmed}` };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  let videoId = "";

  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] || "";
  }

  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v") || "";
    if (url.pathname.startsWith("/shorts/")) videoId = url.pathname.split("/")[2] || "";
    if (url.pathname.startsWith("/embed/")) videoId = url.pathname.split("/")[2] || "";
  }

  if (!idPattern.test(videoId)) return null;
  return { videoId, cleanUrl: `https://www.youtube.com/watch?v=${videoId}` };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const normalized = normalizeYoutubeUrl(req.body?.url);
  if (!normalized) {
    res.status(400).json({ error: "Paste a valid YouTube URL, Shorts link, share link, or video ID." });
    return;
  }

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(normalized.videoId);
    const lines = transcript.map((item) => ({
      text: item.text,
      offset: Math.round((item.offset || 0) / 1000),
      duration: Math.round((item.duration || 0) / 1000)
    }));

    res.status(200).json({
      videoId: normalized.videoId,
      cleanUrl: normalized.cleanUrl,
      transcript: lines
    });
  } catch {
    res.status(404).json({
      error: "No public transcript was found for this video. Try a video with captions enabled."
    });
  }
}
