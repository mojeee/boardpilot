# Publishing calendar: the first 8 weeks

Rhythm decided on Sep 29: **1 long video every 2 weeks and 2 Shorts a week.** Over 8 weeks that is
4 long videos and 16 Shorts. Videos 5 and 6 are ready too, so the plan has a buffer of two long
videos going into week 9.

**Start:** week 1 begins Monday **Nov 2, 2026**, the week after the 0.7.0 launch planned in
`docs/roadmap-2026-10.md`. Videos show features from `CHANGELOG.md` "Unreleased", so the channel
starts only when a release ships them. If 0.7.0 moves, move the whole calendar with it.

**Days (a suggestion, general knowledge, not measured):** long videos on **Thursday**, Shorts on
**Tuesday** and **Saturday**, at 16:00 Italian time (morning in the US east coast). After 8 weeks,
check your own YouTube Studio numbers for the hours your viewers are online and adjust.

## Week 0 · Oct 26 to Nov 1 (launch week): set up

- [ ] Create the channel (name decided in [format.md](format.md#positioning)), banner, About text
      with the one-line positioning, links to the website and GitHub.
- [ ] Channel settings: default language English; subtitles language Italian added; "Made for
      kids": no.
- [ ] Two playlists: "Why doesn't it work?" and "Embedded for software developers".
- [ ] Video 1 and video 2 **recorded and edited** (the buffer). Video 1 uploaded as **private** for a
      final check.
- [ ] Shorts 1 and 2 edited.

## The 8 weeks

| Week | Dates | Tuesday Short | Thursday long video | Saturday Short |
|---|---|---|---|---|
| 1 | Nov 2–8 | Nov 3 · Short 2 "GPIO 34 can't light an LED" | **Nov 5 · Video 1** "My I2C sensor is not found" (Why? #1) | Nov 7 · Short 1 "Your I2C sensor isn't dead. The wires are crossed." |
| 2 | Nov 9–15 | Nov 10 · Short 3 "Your BME280 might be a BMP280" | (no long video) | Nov 14 · Short 4 "Garbage on serial? It's the speed." |
| 3 | Nov 16–22 | Nov 17 · Short 5 "GPIO 12 HIGH at boot" | **Nov 19 · Video 2** "What is a microcontroller?" (Lesson 1) | Nov 21 · Short 15 "main() never returns" (cut from video 2) |
| 4 | Nov 23–29 | Nov 24 · Short 6 "ADC2 stops when Wi-Fi is on" | (no long video) | Nov 28 · Short 12 "Before any write: a full backup" |
| 5 | Nov 30–Dec 6 | Dec 1 · Short 11 "0x78 on the board, 0x3C in code" | **Dec 3 · Video 3** "My BME280 has no humidity" (Why? #2) | Dec 5 · Short 10 "Two BME280s, same address" |
| 6 | Dec 7–13 | Dec 8 · Short 13 "Let the app pick your pins" | (no long video) | Dec 12 · Short 14 "Watch a plant-watering program think" |
| 7 | Dec 14–20 | Dec 15 · Short 7 "HC-SR04 sends 5 V into a 3.3 V pin" | **Dec 17 · Video 4** "Hardware basics" (Lesson 2) | Dec 19 · Short 8 "150 Ω, not 130" (cut from video 4) |
| 8 | Dec 21–27 | Dec 22 · Short 9 "Same pull-up, 400 kHz broken" (cut from video 4) | (no long video) | Dec 26 · Short 16 "Your AI coding agent can read the real pins" (only if recorded end to end; otherwise a Short cut from video 3) |

Shorts 1 to 4 have full scripts in [shorts.md](shorts.md); 5 to 16 are listed there as ideas with
their source, to be scripted two weeks before they go out.

**After week 8:** video 5 ("My ESP32 keeps restarting", Why? #3) on Thursday Dec 31, or Jan 7 if you
take a holiday week. A break said in advance is fine; a silent one is what hurts (research R14).
Then video 6 (Lesson 3, C for embedded) two weeks later.

## Production rhythm (so the calendar holds)

Each long video moves through four stages, one per week, so two videos are always in progress:

| Stage | When | What |
|---|---|---|
| Script check | 3 weeks before | Run every step of the script on the current release; fix the script where the app says something else; real-board gate |
| Record | 2 weeks before | Screen, desk, voice (see [recording-setup.md](recording-setup.md)) |
| Edit | 1 week before | Cut, on-screen text, thumbnail, English captions, Italian subtitles |
| Publish | Thursday | Upload as private on Tuesday, final check, you click Publish (see `docs/launch/publishing.md`) |

**Time budget (rough estimate):** a long video about 8 to 10 hours spread over three weeks (script
check 1 h, recording 2 to 3 h, editing 4 to 5 h, subtitles 1 h, upload 30 min). A Short about 1 hour.
About 6 to 7 hours a week in total.

## Checking what works

48 hours after each long video, write down in `docs/launch/published.csv`: views, average view
duration, click-through rate (from your YouTube Studio), comments that need an answer. After 8 weeks,
compare the two series and the Short topics, and change the plan for weeks 9 to 16 from those
numbers, not from guesses.
