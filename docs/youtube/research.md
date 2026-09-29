# YouTube research: what works for embedded and maker channels

Issue #23, part 1. Written Sep 29, 2026.

## Read this first: how much of this is checked

I could not open YouTube from where this was written: youtube.com, Social Blade and similar
sites were blocked for me. So I could not sort channels by "Popular", read view counts, or watch
the first 15 seconds of videos. That means:

- **No view counts and no "top 5 videos" are in this file yet.** I did not guess them. The
  tables in part 3 have empty rows to fill in, with the exact steps to do it in Chrome.
- Facts marked **[web]** come from a web search on Sep 29, 2026, with the link. Search
  snippets can be wrong about dates, so treat them as "probably true, check once".
- Facts marked **[gk]** are general knowledge about these channels from before today. They
  are patterns, not numbers. Each one must be confirmed on the channel before we rely on it.
- Nothing here is live YouTube analytics. We have no access to any channel's analytics,
  including our own (we have no channel yet).

`format.md` points every recommendation to a finding here (R1, R2…). When the Chrome pass is
done, re-read each finding. If a finding turns out wrong, change the recommendation that
points to it.

## 1. The ten channels

| # | Channel | Link | Still active? | Why it is on the list |
|---|---|---|---|---|
| 1 | Andreas Spiess | <https://www.youtube.com/@AndreasSpiess> | Yes, likely. A search summary (Aug 2025) says about 510,000 subscribers and 500 videos [web: [SPEAKRJ stats](https://www.speakrj.com/audit/report/andreasspiess/youtube)] | ESP32, sensors, measurements. Closest audience to ours. |
| 2 | GreatScott! | <https://www.youtube.com/@greatscottlab> | **Paused.** A video titled "No More Videos for a While (Channel Update 2025)" is listed as posted Dec 28, 2025 [web: [video](https://www.youtube.com/watch?v=R17IPmIz0fU)] | Electronics basics, DIY vs buy. Keep for patterns, not for "what works now". |
| 3 | DroneBot Workshop | <https://www.youtube.com/@Dronebotworkshop> | Yes, likely. A search result lists an ESP32 PWM fan controller video in July 2025 and a "2025 Videos" forum section [web: [forum](https://forum.dronebotworkshop.com/2025-videos/)] | Long, complete tutorials with a written article for every video. |
| 4 | Phil's Lab | <https://www.youtube.com/@PhilsLab> | Yes, likely (to check) [web: [phils-lab.net](https://www.phils-lab.net/)] | STM32 hardware and PCB design, numbered episodes. |
| 5 | Low Level (was Low Level Learning) | <https://www.youtube.com/c/LowLevelLearning> | Yes, but renamed and now mostly security and programming [web: [Wikitubia](https://youtube.fandom.com/wiki/Low_Level)] | Software-developer audience that likes low-level topics. A channel that moved away from embedded. |
| 6 | Shawn Hymel | <https://www.youtube.com/@shawnhymel> | Yes. Launched an ESP-IDF course on his own platform in June 2025 [web: [press release](https://www.cbs42.com/business/press-releases/ein-presswire/817406204/engineer-educator-shawn-hymel-launches-iot-firmware-development-course-while-advancing-ai-innovation/), [courses](https://shawnhymel.com/courses/)] | Structured embedded courses (RTOS, Zephyr, ESP-IDF). Free videos lead to paid courses. |
| 7 | Ben Eater | <https://www.youtube.com/@BenEater> | Uploads are rare; a search summary says the latest was around June 2025 (to check) [web: [channel](https://www.youtube.com/beneater)] | Calm, hands-and-breadboard teaching. The closest model to "voice and hands only". |
| 8 | Jeff Geerling | <https://www.youtube.com/@JeffGeerling> | Yes [web: [Wikipedia](https://en.wikipedia.org/wiki/Jeff_Geerling)] | Raspberry Pi and hardware testing. Plans videos in public GitHub issues [web: [geerlingguy/youtube issue](https://github.com/geerlingguy/youtube/issues/12)]. |
| 9 | Paul McWhorter | <https://www.youtube.com/@paulmcwhorter> | Yes, likely. Pico W lessons playlist; lessons bundled with SunFounder kits [web: [SunFounder](https://docs.sunfounder.com/projects/kepler-kit/en/latest/video_course/video_course.html), [playlist](https://www.youtube.com/playlist?list=PLQVRY-ZYf1cQnVHHVMxrhVdSlcNFscZSV)] | Long numbered lessons for absolute beginners. |
| 10 | Paolo Aliverti (Italian) | <https://www.youtube.com/zeppelinmaker> | Yes, likely. Numbered "Corso ESP32" videos; books and Udemy courses [web: [Udemy](https://www.udemy.com/course/realizzare-progetti-elettronici-connessi-con-esp32/), [Moreware review of his ESP32 book](https://www.moreware.org/wp/blog/2024/01/25/20385/)] | The Italian audience for Arduino and ESP32. |

**If two channels turn out inactive** (GreatScott! is paused, Ben Eater posts rarely), keep
them for patterns and add two active ones in the Chrome pass. Candidates to check, from
general knowledge only [gk]: Unexpected Maker (ESP32 boards he designs), Electronoobs,
bitluni, Digi-Key's own channel (Shawn Hymel's older series ran there), Mitch Davis (embedded
C tutorials). Pick the two with the most recent uploads about ESP32, Pico or STM32.

## 2. Patterns (the findings `format.md` points to)

Each finding says where it comes from. [gk] findings need the Chrome check in part 3.

**R1. Numbered episodes build a habit.** Andreas Spiess numbers every video ("#NNN"), Phil's
Lab numbers them ("Phil's Lab #NNN"), Paul McWhorter numbers lessons, Paolo Aliverti numbers
the "Corso ESP32" [web for Phil's Lab: [#65](https://www.youtube.com/watch?v=aVUqaB0IMh4),
[#127](https://www.youtube.com/watch?v=nkHFoxe0mrU); Paolo Aliverti:
[Corso ESP32 n.03](https://www.youtube.com/watch?v=VDlzH0lxRKc); others gk].

**R2. Every video has a written companion.** DroneBot Workshop publishes an article with
diagrams and code for every video [web: [dronebotworkshop.com](https://dronebotworkshop.com/esp32-2/)].
Phil's Lab links files and a website [web]. Viewers copy code from the page, and search engines
find the page. We already have pages for this: parts pages, pinout pages, wiring guides.

**R3. Hands and hardware can carry a whole channel.** Ben Eater's videos are mostly close-ups of
a breadboard with his hands and his voice, with very little face [gk]. His audience is large and
loyal while he posts rarely [gk]. This is the evidence that "voice and hands only" can work, if
the hardware shots are clear and the explanation is careful.

**R4. The tested claim beats the tutorial.** Andreas Spiess often tests a claim with
measurements ("is X really true?") instead of only showing how to use a part [gk]. GreatScott!'s
"DIY or Buy" and AliExpress "hidden gems" series compare and test [web: the "Hidden Gems …
(Part 17)" title appears in search results for Dec 2025]. Our debug flows produce measurements
with sources, so "Why doesn't it work?" fits this pattern.

**R5. Titles name a problem or a result, in plain words.** Across these channels titles are short
and concrete: the part or board name plus what happens ("ESP32 PWM Fan Control", "KiCad 6 STM32
PCB Design Full Tutorial") [web: titles above]. Question titles and curiosity titles appear too
(GreatScott!'s "Long-Range is Finally Easy?!") [web]. **To check:** which pattern the top 5 videos
of each channel use (part 3).

**R6. Thumbnails: one object, few words, high contrast.** Face-led channels (GreatScott!, Jeff
Geerling, Low Level) put a face with an expression next to the object [gk]. Hardware-first
channels show the board or circuit large, with 0 to 4 words [gk]. We have no face, so the second
style is the one to study. **To check:** thumbnails of the top 5 per channel.

**R7. The first 15 seconds show the problem or the result, not a logo.** [gk, needs checking]
Tutorial channels that do well get to the point fast: the finished thing, the failure, or the
question, then the promise of the video. Long intros with music are rare among the big ones.
Andreas Spiess keeps a fixed spoken greeting, which is short [gk]. **To check:** write down the
first 15 seconds of each top video in part 3.

**R8. Length follows the job.** Full tutorials run long (DroneBot Workshop and Paul McWhorter
often 30 to 60 minutes; Phil's Lab design videos too) [gk]. Explainers and "one problem" videos
run about 8 to 20 minutes [gk]. **To check:** the length of each top video.

**R9. Sponsors and own products are said out loud, early and briefly.** Channels in this niche
often name PCB makers (JLCPCB, PCBWay) as sponsors near the start, and link courses or kits in
the description [gk]. Paul McWhorter's lessons use SunFounder kits and say so [web: SunFounder
page above]. Shawn Hymel's free videos point to his courses [web]. Jeff Geerling says when a
company sent hardware [gk]. Viewers accept the maker talking about their own product when it is
said plainly. **To check:** how and when each top video mentions sponsors or own products.

**R10. Series by level.** Paul McWhorter and Paolo Aliverti run beginner lesson series; Phil's
Lab and Shawn Hymel go deeper for engineers [gk + web]. A channel can hold both if the series are
clearly named.

**R11. Planning in public works for developer audiences.** Jeff Geerling keeps a public GitHub
repo with an issue per video [web: [geerlingguy/youtube](https://github.com/geerlingguy/youtube/issues/12)].
Our plans are already GitHub issues.

**R12. Channels can drift away from embedded.** Low Level Learning renamed to Low Level and moved
to security and programming [web]. Software developers watch low-level content, but embedded
alone may be a smaller audience than general programming. Our "Embedded for software developers"
series speaks to the larger group.

**R13. Italian embedded content exists but is a smaller pool.** Paolo Aliverti covers Arduino and
ESP32 in Italian with courses and books [web]. Italian subtitles on an English channel reach
Italian viewers without splitting the channel. **To check:** whether Italian channels add English
subtitles, and whether top English channels offer Italian subtitles.

**R14. A channel can pause.** GreatScott! announced a break in Dec 2025 [web]. A rhythm that one
person can keep matters more than a high rhythm (this is why the owner chose 1 long video every 2
weeks plus 2 Shorts).

## 3. To fill in with Claude in Chrome

For each channel, in your logged-in Chrome, Claude:

1. Opens the channel's **Videos** tab and picks **Popular**.
2. Keeps only videos uploaded in the last 2 years (from Sep 2024). YouTube does not filter by
   date on this tab, so Claude reads the upload age under each video and skips older ones.
3. For each of the top 5: title, link, views, upload date, length.
4. Opens each one and writes down: the words said and shown in the first 15 seconds, how the
   hardware is shown (overhead, close-up, bench, screen), face or no face, and how sponsors or
   own products are mentioned (when, how long, where in the description).
5. Notes whether there is a pinned comment from the channel (and what kind) and what the end
   screen shows.
6. Notes the thumbnail style in a few words (object, text, face, colours). **No screenshots of
   thumbnails are saved in the repo** (they are the creators' work).
7. Adds the rows below. Views are a snapshot: write the date they were read.

Nothing is posted, liked, subscribed or commented during this research.

Template, one per channel:

```
### <Channel>  (read on YYYY-MM-DD)
| # | Title | Link | Views | Uploaded | Length | Hook (first 15 s) | Hardware on screen | Face | Sponsor / own product | Pinned comment | End screen |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | |
Thumbnail style:
Title pattern:
```

### Andreas Spiess
_Not filled yet._

### GreatScott!
_Not filled yet._

### DroneBot Workshop
_Not filled yet._

### Phil's Lab
_Not filled yet._

### Low Level
_Not filled yet._

### Shawn Hymel
_Not filled yet._

### Ben Eater
_Not filled yet._

### Jeff Geerling
_Not filled yet._

### Paul McWhorter
_Not filled yet._

### Paolo Aliverti
_Not filled yet._

## 4. Gaps BoardPilot can fill

These are my reading of the patterns above, not measured facts. The Chrome pass should confirm
or reject them.

1. **Debugging, shown step by step.** Most tutorials show a project that works. Few show a
   systematic way to find out why it does not, with measurements (R4 is the closest). "My I2C
   sensor is not found" is one of the most common beginner problems, and our debug flow answers
   it with a scan, a swap test and the chip ID.
2. **Embedded for people who already code.** Beginner series start from zero; engineering channels
   assume electronics knowledge. Software developers moving into embedded sit in between (R10,
   R12). Our 11 lessons were written for them, with interview questions.
3. **Seeing inside the board.** Pins, wires and bus transactions on a 3D board are hard to show
   with a camera alone. The app shows them next to the real board.
4. **The same problem on several boards.** Channels usually pick one board per video. Our board
   files let us show the ESP32, the Pico and the Uno side by side (pins, voltages, what to avoid).
5. **Honest sources on screen.** Every claim in the app has a source label (measured, datasheet
   section). Showing that on screen is unusual and builds trust.
6. **Italian viewers** through careful Italian subtitles, with the same words as the Italian app
   (R13).

## 5. No copying

We learn patterns (structure, length, hook timing, thumbnail layout). We never reuse anyone's
titles, thumbnails, footage, music, catchphrases or intros. The "fixed greeting" idea (R7) means
we write our own short greeting, not a version of someone else's.
