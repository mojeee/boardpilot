# Outreach: creators, companies and newsletters

Part D of [publishing.md](publishing.md). The goal is a few honest, personal emails to people whose
audience would find BoardPilot useful. Not a campaign.

## Who fits

- YouTube creators who teach ESP32, Arduino, Pico or STM32 (for example the channels in
  [docs/youtube/research.md](../youtube/research.md)), when a recent video of theirs is about a
  problem BoardPilot helps with.
- Board and module makers whose boards are among the 13 (a board file with sources is something they
  can check and share).
- Embedded and maker newsletters that list tools or accept reader submissions.
- Teachers and course makers (the Learn screen, the simulator for classes without hardware).

**Not a fit:** anyone whose only public contact is personal; anyone who says "no pitches" or "no
unsolicited email" on their page; companies whose products compete directly (don't pitch them).

## Research rules (what Claude may collect)

- **Public pages only:** a channel's "About" page (the business email is sometimes behind a "View
  email address" button that needs a CAPTCHA: Claude stops and leaves that to you), a company's
  contact or press page, a newsletter's "submit" or "sponsor" page.
- **Business contacts only**, as published for business enquiries. No personal emails, no guessing
  addresses (no "firstname@company.com"), no scraping tools, no buying lists.
- **Audience size** only as shown on a public page, with where and when it was read ("YouTube About,
  2026-11-10: 120k subscribers"). No estimates from third-party tools presented as facts.
- **Why they fit:** one sentence tied to something specific they made, with its link. Claude must have
  opened that video or product page.
- Keep the list short: 10 to 20 good targets are better than 100 weak ones.

**Privacy (EU):** you are contacting people at their published business address, about something
relevant to their work, one time. Keep only what's in the CSV, delete a row when someone asks, and
don't share the list. When unsure about a target, skip it.

## The CSV

[outreach-targets.csv](outreach-targets.csv), one row per target:

| Column | What goes in |
|---|---|
| `name` | Person or organisation name as they present themselves |
| `type` | creator, company, newsletter, teacher |
| `public_page` | The public page where the contact was found |
| `business_contact` | The published business email or contact form URL |
| `audience_size` | As shown publicly, e.g. "120k subscribers" |
| `audience_source_date` | Where and when it was read |
| `why_they_fit` | One sentence, tied to `recent_work` |
| `recent_work` | Link to the video, post or product the email mentions |
| `draft_ready` | yes / no |
| `status` | researched, drafted, sent, replied, declined, skipped |
| `sent_date` | Date you sent it |
| `follow_up_date` | At most one follow-up, 10+ days later, only if it makes sense |
| `notes` | Anything else (e.g. "asked not to be contacted: removed" → then delete the row) |

## The email

**Rules:** one email per person, written for them; under 150 words; one link; no attachments; no
"quick call?"; easy to say no; you send it from your own address. At most one short follow-up after 10
days or more, and none if they said no or their page asks for no follow-ups.

**Structure:**

1. One sentence about their specific work, and why it made you write (true and specific).
2. Who you are and what BoardPilot does, in one or two sentences.
3. Why it might matter to their audience, tied to point 1.
4. What you offer (not ask): for example, a free licence for them, or the board file or part data to
   use in their own material (CC BY 4.0), or a correction if they find a wrong pin fact.
5. An easy exit: "If it's not a fit, no need to reply."

**Example (for a creator; Claude replaces every bracket with real, checked details):**

```
Subject: Crossed SDA/SCL, from your [video title]

Hi [name],

In your [video title] ([link]) you spent a few minutes on [the specific moment, e.g. why the sensor
wasn't found until the wires were swapped]. That exact problem is why I built BoardPilot: a desktop
app that scans the I2C bus as wired and again with SDA and SCL swapped in software, reads the chip
ID, and shows the result on a 3D model of the board.

I think it could be useful to your viewers when a sensor "isn't found", and it has a simulator, so
nobody needs a board to try it. [REAL-HARDWARE LINE, short]

If you'd like to try it, I'm happy to send [what you offer]. If it's not a fit, no need to reply.

Thanks for [one honest line about their work],
Mojtaba Amini
https://boardpilot.agentflowbind.com
```

**Never:** ask them to "share", "feature" or "post about" it; offer money for a mention without saying
it is a paid sponsorship (and that would need its own decision and disclosure); send the same text to
two people.

## Steps with Claude in Chrome

1. Claude researches up to 5 targets per session and adds rows (status `researched`).
2. You look at the rows and remove any you don't want.
3. Claude drafts each email in a separate block in the chat (status `drafted`).
4. **STOP.** You open your mail, paste, edit, and **you click Send**. Then tell Claude, which sets
   `sent` and the date.
5. Replies: Claude drafts an answer following [replies.md](replies.md); you send it.
