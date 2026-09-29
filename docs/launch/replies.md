# Answering comments and questions

For you and for Claude when it drafts replies (step E in [publishing.md](publishing.md)). Claude
drafts; **you read, change and post every reply yourself.**

## The basics

- **Answer fast in the first week.** Within a day if you can. That's what turns visitors into users
  (roadmap, "After launch").
- **Say thanks once, then answer.** No long intros.
- **Short sentences, plain words.** The same rule as the app.
- **Only facts you can back.** If you don't know, say "I don't know yet, I'll check" and come back. If
  something is only planned, say "planned", not "coming soon".
- **Admit mistakes quickly.** "You're right, that's wrong. Fixed in [link]" or "I've opened an issue:
  [link]."
- **Never argue about taste.** Answer the facts once, then let it be.
- **Don't delete or hide criticism** you can answer. Report only spam and abuse.
- **Every reply is written for that comment.** Don't paste the same reply into many threads.
- **Don't ask for stars, votes or shares** in replies either.
- **Disclose** in any thread where it's not obvious: "I'm the maker."

## Common comments and how to answer

These are starting points. Always adapt to what the person actually wrote.

**"Is it open source?"**
> It's source-available: all the code is public and you can read it, build it and change it, but the
> app's licence isn't an OSI open-source licence. The parts data is CC BY 4.0 and the firmware on the
> board is MIT. [PRICE LINE].

**"Why isn't it free / why a licence?"**
> Fair question. [Say what is true at that moment: "It's free during the public beta" or "There's a
> 30-day trial"]. The parts data and the firmware are free to reuse whatever happens. I'd rather tell
> you plainly than change it silently later.

**"Does it support board X?"**
> Not yet. Boards are data files, so adding one is mostly checking pin facts against the vendor's
> documents. You can request it here: https://github.com/mojeee/boardpilot/issues/new?template=new-board.yml
> (or, if you want to add it yourself: docs/add-a-board.md).

**"Linux?"**
> Planned, not available yet. The plan includes the serial-port permission steps.

**"Did you test this on real hardware?"**
> [Answer with the exact current state from the fact sheet: which boards, which flows. If not yet:
> "Not yet on real boards. The flows are tested against the simulator and the agents against a
> simulated bus. Real-board tests are next, and I'll post the results."]

**"Is this AI-generated / does it just ask ChatGPT?"**
> The checks and measurements don't use AI: they're rules and real readings from the board, and each
> result says whether it was measured or comes from a datasheet. The AI assistant is optional and
> labels guesses as suggestions.

**"I don't want an app writing to my board."**
> Understandable. It's read-only unless you confirm. Before the first write it backs up the whole
> flash, and "Restore my firmware" puts your program back. The wiring checks and the simulator never
> touch a board.

**A bug report**
> Thanks, that's useful. Could you tell me the board, the app version and what you clicked? I've
> opened an issue to track it: [link]. (Claude drafts the issue; you create it.)

**A feature request**
> Good idea. I've added it to the list here: [issue link]. I can't promise a date, but requests with
> real use cases move up.

**Hostile or rude comment with a real point inside**
> Answer only the point, calmly, once. Example: "The price point is fair to raise. Here's what's true
> today: …"

**Hostile comment with no point**
> Don't answer.

**A moderator removed the post**
> Don't repost and don't argue in public. If the reason isn't clear, send the moderators one polite
> message asking what would fit their rules. Write the reason in `published.csv`.

**Italian comments**
> Answer in Italian. Keep the app's Italian words (see docs/youtube/subtitles-it.md).

## After replying

- Update `published.csv`: `needs_reply` down to 0 when all are answered.
- Every bug or request that came from a comment gets a GitHub issue with a link back to the comment.
