# TranscriptFlow

TranscriptFlow is a Vite/React web app for generating clean YouTube transcripts from watch URLs, Shorts links, share links, and raw video IDs.

## Local Development

```bash
npm install
npm run dev
```

## Supabase

Add these values to `.env.local` to enable real authentication and cloud history:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Create a `transcripts` table with columns for `id`, `user_id`, `video_id`, `clean_url`, `lines`, and `created_at`.

## Deployment

The app is ready for Vercel. The `/api/transcript` function fetches public YouTube captions when available. Stripe checkout is intentionally stubbed until keys and plan IDs are available.
