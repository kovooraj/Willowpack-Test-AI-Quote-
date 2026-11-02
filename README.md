# Willowpack quote chat landing page

Static page that embeds the Willowpack AI quote assistant (n8n chat).

- `index.html` – the page. The n8n webhook URL is set in the `WEBHOOK_URL` constant near the bottom.
- `vercel.json` – static hosting settings (no build step).

## Deploy
1. Push this folder to a GitHub repo (e.g. `kovooraj/willowpack-quote-chat`).
2. In Vercel: Add New → Project → import the repo. Framework preset: **Other**. No build command, no output directory.
3. Add the Vercel domain (e.g. `https://willowpack-quote-chat.vercel.app`) and any custom domain to
   **Allowed Origins** on the n8n "When chat message received" trigger, then re-publish that workflow.
