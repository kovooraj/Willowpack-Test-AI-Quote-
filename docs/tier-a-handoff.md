# Tier A handoff copy

Source: "Willowpack AI Quote Agent — Tier A Handoff Copy" (Sai). Riley's wording for Tier A customers follows that document. The copy lives in the n8n chat workflow's system prompt (step 8b) and in the Rep Connect workflow, not in this repo; this page records what was implemented and the decisions behind it.

## How it works
1. Riley collects specs, quantity and timeline as usual. Pricing runs, but for Tier A the price is held for the rep and never shown.
2. Riley picks one **bridge** message by the customer's strongest signal. A deadline always wins:
   B deadline › F cannabis › D technical specs › A multi-SKU › C supplier pain › E "just want a price" (default).
3. Riley checks whether Dan is Active in the admin Live chat tab and adds the matching availability lines (two buttons at most):
   - **Dan available:** connect now, or book a time.
   - **Dan busy:** see his calendar, or email me instead (deadline leads see the calendar straight away).
   - **After hours** (outside Mon–Fri 9:00–17:00 Toronto): calendar straight away.
4. **Live chat:** if Dan doesn't join within **60 seconds**, Riley shows his calendar instead.
5. **Hesitation nudge:** if the customer doesn't answer for **45 seconds**, the website quietly asks Riley to send the nudge, once per chat ("Prefer a call or a quick email from Dan instead?").
6. Booking confirmation asks the customer to reply to the calendar invite with dielines, photos or spec sheets. The chat does not accept file uploads.

## Settings and decisions
| Item | Decision |
|---|---|
| Tier A call length | 15 minutes (Tier A calls with Dan only; other bookings stay 30 minutes) |
| "Email me instead" | Dan is alerted by email and Google Chat; promise to the customer is **within one business day** |
| "Can't you just send a quote?" | No ballpark. Riley says Dan sends a firm number (the doc's "I can send a ballpark" was changed because Tier A prices are held) |
| Coffee roaster proof point (bridge C) | Used without naming the customer |
| "Launch" wording | Dropped from customer-facing copy (Tier B language) |
| Bridge timing | After pricing (not right after classification), so Dan's brief includes a real price and the bridge mirrors real specs |
| Dan's title | "Senior packaging specialist" until a specific credential is confirmed |

## Sai additions
Content taken from Sai's document as written, not verified separately:
- **Cannabis bridge (F):** "He can walk you through our CR test reports and **RUSH capacity** in one call."

## Measuring it
- `bridge_variant` (Sessions sheet, column BO): the bridge Riley used for each Tier A chat. Use it to compare bridge A against E.
- Live chats: joined, missed and ended in the admin Live chat tab (Supabase `live_sessions`).
- Bookings: `meeting_time`; call-backs and email requests: `callback_request` (`… | email` for email requests).
- Watch the calendar booking rate per bridge; below about 40% means the bridge isn't building enough value before the ask.
