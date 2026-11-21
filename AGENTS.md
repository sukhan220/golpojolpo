<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# গল্প জল্প (GolpoJolpo) — AI এজেন্ট আর্কিটেকচার ও ফাইল ম্যাপ গাইড

এই ডকুমেন্টটি তৈরি করা হয়েছে যাতে যেকোনো AI এজেন্ট বা ডেভেলপার পুরো প্রজেক্ট স্ক্যান না করেই এক নজরে বুঝতে পারে কোন ফিচারের কোড কোন ফাইলে আছে এবং কোথায় পরিবর্তন করতে হবে।

---

## ১. প্রজেক্ট ওভারভিউ ও টেক স্ট্যাক

- **ফ্রেমওয়ার্ক:** Next.js `16.4.3` (App Router, Turbopack), React `19.3.0`
- **ডাটাবেস (বর্তমান):** Firebase Cloud Firestore (`firebase ^13.1.0`)
- **ডাটাবেস (ভবিষ্যৎ মাইগ্রেশন):** Prisma ORM (`prisma/schema.prisma` প্রস্তুত রাখা আছে)
- **ডিজাইন ও স্টাইলিং:** কাস্টম ক্লিন সিএসএস (`app/golpojolpo.css` এবং ই-বুক রিডারের জন্য `app/globals.css`), বাংলা ফন্ট (`Hind Siliguri`, `Noto Serif Bengali`, `Tiro Bangla`, `Anek Bangla`)।
- **আর্কিটেকচার প্যাটার্ন:** **Service / Repository Pattern** — কোনো UI কম্পোনেন্ট সরাসরি ফায়ারবেজ কল করে না; সব ডাটা আসে `lib/dataService.js` এর মাধ্যমে।

---

## ২. ডাটাবেস কালেকশন ম্যাপিং (Firestore ➔ অ্যাপ ফিচার)

| Firestore কালেকশন | অ্যাপে ভূমিকা | প্রধান ফিল্ডসমূহ |
| :--- | :--- | :--- |
| **`books`** | **অডিওবুক (Audiobooks)** | `title`, `artist`, `writer`, `writerId`, `cateId`, `voice`, `time`, `url` (অডিও স্ট্রিম/ড্রপবক্স লিংক), `artwork` (কভার ছবি), এবং নেস্টেড সাব-কালেকশন (`tracks` / `episodes` / `chapters` / `parts`)। |
| **`categories`** | **লাইব্রেরি বিভাগ (Library)** | `bn` (বাংলা নাম), `en` (ইংরেজি নাম), `audio` (boolean), `kindle` (boolean)। |
| **`shortStory`** | **ই-বুক (eBooks / গল্প)** | `title`, `writer`, `writerId`, `cateId`, `artwork` (কভার ছবি), `fileUrl` (বইয়ের টেক্সট/কনটেন্ট লিংক)। |
| **`writer`** | **লেখক (Writers)** | `bn` (লেখকের বাংলা নাম), `en` (ইংরেজি নাম), `img` (লেখকের ছবি), `show` (boolean), `cateId` (ক্যাটাগরি আইডির অ্যারে), `categories` (ক্যাটাগরি নামের অ্যারে)। |

---

## ৩. ফাইল ও ডিরেক্টরি ম্যাপ (কোথায় কী আছে)

### ক. কোর ডাটা ও সার্ভিস লেয়ার (`lib/` ও `prisma/`)
> **নির্দেশনা:** ডাটা ফেচিং, ফায়ারবেজ কুয়েরি, অডিও লিংক ফরম্যাটিং বা ভবিষ্যতে Prisma মাইগ্রেশনের কাজ করতে হলে নিচের ফাইলগুলোতে যেতে হবে:

- `lib/firebase.js` — ফায়ারবেজ ইনিশিয়ালাইজেশন, ওয়ান-টাইম ডাটা ফেচার (`getDocs`), মাল্টি-পার্ট/নেস্টেড ট্র্যাক এক্সট্রাক্টর এবং অডিও লিংক কনভার্টার।
  - **Functions:**
    - `getDb()` — Firestore ইনস্ট্যান্স রিটার্ন করে।
    - `extractRawUrl(input)` — স্ট্রিং, অ্যারে বা যেকোনো নামের অবজেক্ট ফিল্ড (`url`, `audioUrl`, `link`, `fileUrl`, `audio` ইত্যাদি) থেকে অডিও লিংক বের করে।
    - `formatAudioUrl(urlInput)` — Dropbox (`dl=0` ➔ `dl.dropboxusercontent.com` + `raw=1`) এবং Google Drive লিংককে সরাসরি HTML5 `<audio>` স্ট্রিমিং উপযোগী লিংকে রূপান্তর করে।
    - `extractInitial(text)` — কভার আর্টওয়ার্ক না থাকলে বই বা লেখকের নামের প্রথম বাংলা অক্ষর বের করে।
    - `parseDurationToSeconds(timeStr)` — `"30:17"` ফরম্যাটের সময়কে সেকেন্ডে (`1817`) রূপান্তর করে।
    - `normalizeCategory(id, data)`, `normalizeAudioBook(id, data)`, `normalizeShortStory(id, data)`, `normalizeWriter(id, data)` — Firestore এবং Reverse API উভয় ক্ষেত্রের ডাটাকে একই স্ট্যান্ডার্ড ফরম্যাটে সাজায় (মাল্টি-পার্ট অডিওসহ)।
    - `fetchCategoriesOnce()`, `fetchAudioBooksOnce()`, `fetchShortStoriesOnce()`, `fetchWritersOnce()`, `fetchBookNestedSubcollectionsOnce(bookId, parentBook)` — ক্যাশ খালি থাকলে কেবল একবার ফায়ারবেজ থেকে ডাটা আনে।
    - `subscribeToAudioBooks`, `subscribeToBookNestedSubcollections`, `subscribeToCategories`, `subscribeToShortStories`, `subscribeToWriters`, `subscribeToReaderBooks` — লিগ্যাসি ও কম্প্যাটিবিলিটি সাবস্ক্রিপশন মেথড।
- `lib/dataService.js` — **ক্যাশ-ফার্স্ট ইউনিফাইড ডাটা রিপোজিটরি লেয়ার**। ফায়ারবেজ সবসময় হিট না করে প্রথমে `localStorage` ও মেমরি ক্যাশ (`golpojolpo_cache_v3_*`) থেকে ডাটা রিটার্ন করে। ক্যাশ খালি থাকলেই কেবল একবার ফায়ারবেজ থেকে (`getDocs`) ফেচ করে ক্যাশ করে রাখে। এছাড়াও Reverse API (`/api/sync`) থেকে নতুন ডাটা আসলে সরাসরি ক্যাশে অ্যাড/আপডেট করে।
  - **Class & Methods (`DataService`):**
    - `DataService.listenCategories(callback)`
    - `DataService.listenAudioBooks(callback)`
    - `DataService.listenBookNestedTracks(book, callback)`
    - `DataService.listenShortStories(callback)`
    - `DataService.listenWriters(callback)`
    - `DataService.syncWithReverseApi()`
    - `DataService.applyReverseEvent(event)`
    - `DataService.getMagazines()`
- `lib/audioCrypto.js` — অডিও লিংক ইনক্রিপশন ও ডিক্রিপশন ইউটিলিটি (`encryptAudioUrl`, `decryptAudioToken`)। যাতে ব্রাউজারের DOM (`<audio src="...">`), লোকাল ক্যাশ বা নেটওয়ার্ক ট্যাবে আসল Dropbox বা এক্সটার্নাল অডিও লিংক দেখা না যায়।
- `app/api/stream/route.js` — **Encrypted Audio Stream Proxy (`GET /api/stream?t=<token>`)**। ইনক্রিপ্টেড টোকেন ডিক্রিপ্ট করে সার্ভার থেকে সরাসরি অডিও বাইট স্ট্রিম (`206 Partial Content` ও `Range` সাপোর্টসহ) পাঠায়।
- `lib/cacheStore.js` — সার্ভার-সাইড ক্যাশ ভার্সন এবং Reverse API ইভেন্ট বাফার (`getServerSyncState`, `recordReverseApiEvent`)।
- `app/api/sync/route.js` — **Reverse API / Webhook এন্ডপয়েন্ট (`GET` ও `POST /api/sync`)**। নতুন কোনো বই, ক্যাটাগরি বা লেখক যোগ করলে এই API-তে `POST` রিকোয়েস্ট পাঠালে ফায়ারবেজ রি-স্ক্যান ছাড়াই সাথে সাথে অ্যাপের ক্যাশে যুক্ত হয়ে যায় অথবা নির্দিষ্ট কালেকশনের ক্যাশ রিফ্রেশ করে।
- `lib/mockData.js` — অফলাইন প্রিভিউ ও ফলব্যাকের জন্য নমুনা ডাটা (`MOCK_CATEGORIES`, `MOCK_WRITERS`, `MOCK_AUDIO_BOOKS`, `MOCK_SHORT_STORIES`, `MOCK_MAGAZINES`)।
- `lib/speedMap.js` — ই-বুক রিডারের অটো-স্ক্রল স্পিড ম্যাপিং কনস্ট্যান্ট (`SPEED_MAP`)।
- `prisma/schema.prisma` — ভবিষ্যতে PostgreSQL/MySQL-এ স্থানান্তরের জন্য প্রস্তুতকৃত Prisma স্কিমা (`Category`, `Book`, `ShortStory`, `Writer`, `WriterCategory` মডেল)।

---

### খ. গ্লোবাল অডিও প্লেয়ার স্টেট (`context/`)
> **নির্দেশনা:** অডিও প্লে/পজ, সিক (Seek), নেক্সট/প্রিভিয়াস পর্ব, স্পিড (0.5x–2x), ভলিউম বা প্লেলিস্ট লজিক পরিবর্তন করতে হলে এখানে যেতে হবে:

- `context/AudioPlayerContext.js` — পুরো অ্যাপের কেন্দ্রীয় HTML5 `<audio>` প্লেয়ার ইঞ্জিন ও স্টেট প্রোভাইডার।
  - **Exports:**
    - `AudioPlayerProvider` — রুট প্লেয়ার প্রোভাইডার (লুকানো `<audio>` এলিমেন্ট পরিচালনা করে)।
    - `useAudioPlayer()` — হুক যা রিটার্ন করে: `currentTrack`, `playlist`, `playlistIndex`, `isPlaying`, `currentTime`, `duration`, `speed`, `volume`, `isFullPlayerOpen`, `audioError`, `playTrack(track, newPlaylist)`, `pauseTrack()`, `togglePlay()`, `seek(sec)`, `skip(deltaSec)`, `playNext()`, `playPrev()`, `setSpeed(s)`, `setVolume(v)`, `openFullPlayer()`, `closeFullPlayer()`।
    - `formatTime(seconds)` — সেকেন্ডকে `M:SS` ফরম্যাটে দেখায়।

---

### গ. অ্যাপ রুট, অ্যাসেট (লোগো ও ফ্যাভিকন) এবং স্টাইলিং (`app/` ও `public/`)
> **নির্দেশনা:** মেটাডাটা, লোগো, ফ্যাভিকন, গ্লোবাল ফন্ট, মূল রাউটিং বা সিএসএস ডিজাইন পরিবর্তনের জন্য:

- `app/layout.js` — রুট HTML লেআউট (`lang="bn"`), ফ্যাভিকন কনফিগারেশন (`/favicon.svg`), Google Fonts (`Hind Siliguri`, `Noto Serif Bengali`) এবং মেটাডাটা ও ভিউপোর্ট কনফিগারেশন।
- `app/logo.svg` ও `public/logo.svg` — গল্পজল্পের মূল অফিশিয়াল SVG লোগো (ডেস্কটপ সাইডবার `Navigation.jsx` এবং মোবাইল টপ বার `Header.jsx`-এ ব্যবহৃত)।
- `app/favicon.svg` ও `public/favicon.svg` — ব্রাউজার ট্যাবের অফিশিয়াল SVG ফ্যাভিকন আইকন।
- `app/page.js` — মেইন এন্ট্রি পয়েন্ট, যা `<GolpoJolpoApp />` রেন্ডার করে।
- `app/golpojolpo.css` — মূল অ্যাপের সম্পূর্ণ রেসপনসিভ ফিক্সড-ভিউপোর্ট (`100dvh`, স্ক্রলবারবিহীন হরিজেন্টাল স্ক্রল) ডিজাইন সিস্টেম (মোবাইল বটম ন্যাভ, ডেস্কটপ স্টিকি সাইডবার, বুক কভার, মিনি প্লেয়ার, ফুল প্লেয়ার, ক্যাটাগরি ও লেখক গ্রিড)।
- `app/globals.css` — ৩ডি পেজ-টার্ন ই-বুক রিডার (`app/reader.js`)-এর থিম, ফ্লিপ অ্যানিমেশন এবং মডাল স্টাইল।
- `app/reader.js` — পূর্ণাঙ্গ ই-বুক রিডার ইঞ্জিন (পেজ ফ্লিপ মোড, স্ক্রল মোড, অটো-স্ক্রল, হাইলাইট, বুকমার্ক, নোট সংরক্ষণ, ফন্ট ও ৪টি থিম: বই, কাগজ, সেপিয়া, রাত)। (Component: `ReaderApp({ initialStory, onBack })`)।

---

### ঘ. প্রধান অ্যাপ অর্কেস্ট্রেটর ও লেআউট (`components/` ও `components/layout/`)
> **নির্দেশনা:** ন্যাভিগেশন বার, হেডার, প্রোফাইল পপআপ বা ভিউ রাউটিং পরিবর্তন করতে হলে:

- `components/GolpoJolpoApp.jsx` — অ্যাপের মূল কন্ট্রোলার। সব Firestore লিসেনার ইনিশিয়ালাইজ করে এবং রাউট স্টেট (`home`, `library`, `category`, `book`, `writers`, `author`, `magazine`, `search`, `player`, `pageflip`) পরিচালনা করে।
- `components/ReaderAppWrapper.jsx` — `GolpoJolpoApp` থেকে কোনো ই-বুক ৩ডি পেজ-টার্ন মোডে ওপেন করলে `app/reader.js`-এর `ReaderApp`-কে র‍্যাপ করে দেখায়।
- `components/Icons.jsx` — অ্যাপ ও ই-বুক রিডারে ব্যবহৃত সব SVG আইকন কম্পোনেন্ট (`PlayIcon`, `PauseIcon`, `SearchIcon`, `HomeNavIcon`, `LibraryNavIcon`, `WriterNavIcon`, `Backward10Icon`, `Forward10Icon`, `BookmarkFilledIcon` ইত্যাদি)।
- `components/layout/Navigation.jsx` — রেসপনসিভ ন্যাভিগেশন বার (মোবাইলে নিচে ফিক্সড বটম বার, ডেস্কটপে বাঁপাশে স্টিকি সাইডবার ও লোগো)।
- `components/layout/Header.jsx` — টপ বার (মোবাইল লোগো/টাইটেল, সার্চ বাটন ও প্রোফাইল বাটন)।
- `components/layout/ProfileDialog.jsx` — ইউজার প্রোফাইল ও সেটিংস পপআপ ডায়ালগ (নোটিফিকেশন টগল, ওয়াইফাই ডাউনলোড টগল, ভাষা ও লগআউট)।

---

### ঙ. অডিও প্লেয়ার কম্পোনেন্ট (`components/player/`)
> **নির্দেশনা:** মিনি প্লেয়ার বা ফুল-স্ক্রিন প্লেয়ারের UI ও কন্ট্রোল পরিবর্তন করতে হলে:

- `components/player/MiniPlayer.jsx` — স্ক্রিনের নিচে ভাসমান পারসিস্টেন্ট মিনি প্লেয়ার। বর্তমান ট্র্যাকের কভার (`artwork`), নাম, লেখক, চলমান সময়, প্লে/পজ বাটন, ১০ সেকেন্ড ফরওয়ার্ড/ব্যাকওয়ার্ড (`skip(-10)` / `skip(10)`), একাধিক পার্ট থাকলে নেক্সট/প্রিভিয়াস পার্ট বাটন (`playPrev` / `playNext`), প্লেলিস্টে অ্যাড করার পপওভার (`Add to Playlist`) ও প্রগ্রেস লাইন দেখায়। ক্লিক করলে ফুল প্লেয়ার ওপেন হয়।
- `components/player/PlayerView.jsx` — ফুল-স্ক্রিন অডিও প্লেয়ার। কভার আর্টওয়ার্ক, কণ্ঠশিল্পীর নাম, ক্লিপস/চ্যাপ্টার জাম্প বাটন, চ্যাপ্টার টিক-মার্কসহ সিক বার, ১০ সেকেন্ড রিওয়াইন্ড/ফরওয়ার্ড, নেক্সট/প্রিভিয়াস পর্ব কন্ট্রোল, প্লেব্যাক স্পিড (`0.5x`–`2x`), ভলিউম স্লাইডার এবং নেস্টেড পর্বের তালিকা দেখায়।

---

### চ. পেইজ ভিউ কম্পোনেন্টসমূহ (`components/views/`)
> **নির্দেশনা:** নির্দিষ্ট কোনো পেইজ বা সেকশনের UI পরিবর্তন করতে হলে সরাসরি নিচের সংশ্লিষ্ট ফাইলে যান:

- `components/views/HomeView.jsx` — হোম পেইজ। ক্যাটাগরি চিপস, কালেকশন শর্টকাট (`PlayLists`, `Favorites`, `History`, `Notes`), **AudioBooks** রো (`books`) এবং **Books / ই-বুক** রো (`shortStory`) দেখায়।
- `components/views/LibraryView.jsx` — লাইব্রেরি পেইজ। `Audio` এবং `Kindle` সেগমেন্ট ট্যাব। Audio ট্যাবে `categories` গ্রিড এবং Kindle ট্যাবে ই-বুক (`shortStory`) গ্রিড দেখায়।
- `components/views/CategoryView.jsx` — নির্দিষ্ট ক্যাটাগরির ভেতরের পেইজ। সংশ্লিষ্ট লেখকদের ফিল্টার চিপস এবং ওই ক্যাটাগরির সব অডিওবুকের গ্রিড দেখায়।
- `components/views/BookDetailView.jsx` — অডিওবুক ডিটেইল পেইজ। বড় কভার (`artwork`), লেখক, সময়, কণ্ঠশিল্পী, **Play Now** বাটন এবং ৩টি ট্যাব:
  1. `Description` — বইয়ের বিবরণ।
  2. `Clips` — অডিওর নির্দিষ্ট অংশে জাম্প করার টাইমস্ট্যাম্প।
  3. `List` — নেস্টেড কালেকশন/পর্বগুলোর তালিকা (ক্লিক করলেই সংশ্লিষ্ট পর্ব প্লে হয় এবং চলমান পর্ব হাইলাইট থাকে)।
- `components/views/EBookDetailView.jsx` — ই-বুক (`shortStory`) ডিটেইল পেইজ। কভার (`artwork`), লেখক, পড়ার অগ্রগতি এবং **Read Now / Continue Reading** বাটন (ক্লিক করলে সরাসরি ই-বুক রিডার পেইজে নিয়ে যায়)।
- `components/views/WritersView.jsx` — সব লেখকের তালিকা (`writer` কালেকশন)। লেখকের নামের আদ্যক্ষরযুক্ত অবতার ও লেখকের ক্যাটাগরি ট্যাগ দেখায়।
- `components/views/AuthorDetailView.jsx` — নির্দিষ্ট লেখকের প্রোফাইল পেইজ। লেখকের ক্যাটাগরি ফিল্টার চিপস, তাঁর সব অডিওবুক এবং ই-বুক/ছোটগল্পের তালিকা দেখায়।
- `components/views/MagazineView.jsx` — ম্যাগাজিন পেইজ। বিশেষ ম্যাগাজিন সংখ্যার গ্রিড দেখায়।
- `components/views/SearchView.jsx` — লাইভ সার্চ পেইজ। টাইপ করার সাথে সাথে অডিওবুক (`books`), ই-বুক (`shortStory`) এবং লেখক (`writer`)-এর মধ্যে একসাথে সার্চ করে ফলাফল দেখায়।
- `components/views/EBookReaderModal.jsx` — দ্রুত ই-বুক পড়ার মডাল। `shortStory`-তে ক্লিক করলে ওপেন হয়; এতে ফন্ট সাইজ (`A-` / `A+`), ৩টি থিম (সাদা, সেপিয়া, রাত) এবং **"ত্রিমাত্রিক পেজ-টার্ন মোডে পড়ুন"** বাটন রয়েছে।

---

### ছ. ৩ডি ই-বুক রিডার সাব-কম্পোনেন্ট (`components/`)
> **নির্দেশনা:** ৩ডি পেজ-টার্ন রিডার (`app/reader.js`) এর ভেতরের মডাল ও ফিচারগুলোর ফাইল:

- `components/PageTurn.js` — বইয়ের পাতা উল্টানোর (Page Flip) অ্যানিমেশন রেন্ডারার।
- `components/BookLoader.jsx` — ৩ডি পাতা উল্টানো অ্যানিমেটেড বুক লোডার (React Native `BookLoader.jsx`-এর আদলে)।
- `components/ChapterSidebar.jsx` — রিডারের সূচিপত্র (Chapters), বুকমার্কস এবং সংরক্ষিত নোটসমূহের ড্রয়ার।
- `components/FontSelector.jsx` — রিডারের বাংলা ফন্ট পরিবর্তন করার ড্রপডাউন ও মডাল (`FONTS_LIST`)।
- `components/SpeedModal.jsx` — রিডারের অটো-স্ক্রল স্পিড স্লাইডার মডাল।
- `components/JumpPageModal.jsx` — নির্দিষ্ট পৃষ্ঠা নম্বরে সরাসরি যাওয়ার মডাল।
- `components/AddNoteModal.jsx` — নির্বাচিত টেক্সটের ওপর পাঠকের নোট যোগ করার মডাল।
- `components/BooklistModal.jsx` — কাস্টম বুকলিস্ট তৈরি ও বই যুক্ত করার মডাল।
- `components/LandscapeOverlay.jsx` — ফুলস্ক্রিন/ল্যান্ডস্কেপ রিডিং মোডের ফ্লোটিং প্রগ্রেস বার ও কন্ট্রোল।

---

## ৪. কমন কাজের কুইক গাইড (কোন কাজের জন্য কোথায় হাত দেবেন)

1. **ফায়ারবেজ কুয়েরি পরিবর্তন বা নতুন ফিল্ড যোগ করতে:** ➔ `lib/firebase.js` এবং `lib/dataService.js`
2. **ফায়ারবেজ বাদ দিয়ে Prisma যুক্ত করতে:** ➔ `prisma/schema.prisma` অনুযায়ী মাইগ্রেট করে শুধুমাত্র `lib/dataService.js`-এর মেথডগুলোকে Prisma API রুট বা Server Action-এর সাথে যুক্ত করুন।
3. **অডিও প্লে হচ্ছে না বা নতুন অডিও হোস্ট (যেমন S3/Cloudflare) সাপোর্ট দিতে:** ➔ `lib/firebase.js`-এর `formatAudioUrl()` এবং `context/AudioPlayerContext.js` দেখুন।
4. **নেস্টেড অডিও পর্বের লিস্ট বা প্লেব্যাক আচরণ বদলাতে:** ➔ `components/views/BookDetailView.jsx` (ট্যাব `l`) এবং `lib/firebase.js`-এর `subscribeToBookNestedSubcollections()` দেখুন।
5. **ডিজাইন, কালার বা ফন্ট সাইজ বদলাতে:** ➔ মূল অ্যাপের জন্য `app/golpojolpo.css` এবং পেজ-টার্ন রিডারের জন্য `app/globals.css` দেখুন।

---

## ৫. YouTube-স্টাইল অডিও চাঙ্ক ক্যাশিং, অফলাইন বাফার ও React Native পোর্টিং নোট

> **AI এজেন্ট ও React Native ডেভেলপমেন্টের জন্য গুরুত্বপূর্ণ রেফারেন্স:**
> অডিও ডাউনলোড ছাড়াই (ফাইল ম্যানেজারে MP3 না রেখেই) YouTube / Spotify-এর মতো বাফারিং, অফলাইন প্লেব্যাক (যতটুকু বাফার হয়েছে) এবং সার্ভার হিট কমানোর আর্কিটেকচার এখানে নথিভুক্ত করা হলো।

### ক. ওয়েব অ্যাপে যেভাবে কাজ করছে:
1. **Direct IndexedDB Offline Audio Cache (`lib/audioOfflineCache.js` — `v2`) + Production SW (`public/sw-audio-cache.js` — `v3`):**
   - **Direct IndexedDB (`golpojolpo_offline_audio_v2`):** Chrome DevTools-এর "Offline" মোড বা ব্রাউজার SW বাইপাস করলেও অফলাইনে চলার জন্য `lib/audioOfflineCache.js` (`bypass_sw=1` দিয়ে ফুল স্ট্রিম ফেচ করে) প্রোগ্রেসিভলি অডিও সেভ করে এবং `URL.createObjectURL(blob)` দিয়ে লোকাল `blob:` URL থেকে প্লে করে। কোনো `blob:` করাপ্ট হলে `invalidateOfflineCachedAudio()` দিয়ে মুছে অটোমেটিক লাইভ সার্ভার থেকে রিকভার করে।
   - **Production Service Worker (`golpojolpo_audio_chunks_v3`):** RFC 9110 Range Parsing (`bytes=a-b`, `bytes=a-`, suffix `bytes=-n`, `416`), আলাদা `chunks` + `chunk_index` স্টোর (Zero-OOM সিঙ্গেল-ট্রানজেকশন LRU ও ৩০ সেকেন্ড থ্রটলড `lastAccess`), অ্যাটমিক রাইট (Zero Race Condition), এবং স্ট্রিক্ট `Content-Range` / `Content-Length` ভ্যালিডেশন।
   - **750 MB LRU Auto-Eviction + Persistent Storage:** `navigator.storage.persist()` রিকোয়েস্ট করা হয় এবং ৭৫০ MB পার হলে সক্রিয় ট্র্যাক সুরক্ষিত রেখে সবচেয়ে পুরনো চাঙ্ক/অডিও মুছে ৮৫%-এ নামিয়ে আনে (৫০০ MB পর্যন্ত একটি সম্পূর্ণ অডিওবুক অফলাইনে থাকে)।
2. **অডিও প্লেয়ার ইঞ্জিন, লাস্ট-প্লে রিস্টোর ও বাফার বার (`context/AudioPlayerContext.js` ও `components/player/PlayerView.jsx`):**
   - পেজ রিলোড হলে `golpojolpo_history_v1` থেকে **সর্বশেষ প্লে করা অডিওবুক** (`currentTime`, `duration`, `playlist` সহ) অটোমেটিক রিস্টোর হয়।
   - `audio.preload = "auto"`, `online` ইভেন্ট অটো-রিকভারি, এবং `bufferedTime` স্টেট দিয়ে সিকবারে `.seek-buffer-track` / `.seek-buffer-fill` দেখানো হয়।
   - **ক্লিপ ও নোট (`golpojolpo_audio_clips_v1`):** `addAudioClip`, `removeAudioClip`, `getClipsForBook`, `playClipSegment` — নির্দিষ্ট `from` থেকে `to` সেকেন্ড পর্যন্ত ক্লিপ প্লে করে অটো-পজ হয় এবং হোম পেইজের `Notes` ও অডিও ডিটেইলসের `Clips` ট্যাবে সিঙ্ক থাকে।
   - **ই-বুক ফাইল স্ট্রিমিং ক্যাশ (`app/reader.js` — `golpojolpo_book_file_cache_v2_`):** `.md`/`.txt` ফাইল চাঙ্ক বাই চাঙ্ক স্ট্রিম করে ক্যাশ করে (`isComplete: true/false`); অসম্পূর্ণ থাকলে পরের বার অটোমেটিক রিলোড করে।

### খ. ভবিষ্যতে React Native (Expo) অ্যাপে একই সুবিধা যেভাবে বসাতে হবে:
- **Android (ExoPlayer):** `SimpleCache` + `LeastRecentlyUsedCacheEvictor(150 * 1024 * 1024)` + `CacheDataSource.Factory` (অথবা `react-native-track-player` এর `maxCacheSize` / `cache` অপশন) ব্যবহার করলে হুবহু একইভাবে ডাউনলোড ছাড়াই 512KB/1MB রেঞ্জ চাঙ্ক অ্যাপের প্রাইভেট ক্যাশ ডিরেক্টরিতে থাকবে।
- **iOS (AVPlayer):** `AVAssetResourceLoaderDelegate` অথবা লোকাল প্রক্সি (`GCDWebServer` / `react-native-video` cache config) দিয়ে প্রাইভেট `Caches/` ডিরেক্টরিতে বাইট-রেঞ্জ চাঙ্ক ক্যাশ + 150MB LRU ইভিকশন করতে হবে।
- **ই-বুক ও ক্লিপ ডাটা স্ট্রাকচার:** ওয়েবের `golpojolpo_audio_clips_v1` (`{ id, bookId, trackId, bookTitle, title, content, from, to }`), `golpojolpo_history_v1`, এবং `golpojolpo_book_file_cache_v2_` (`{ fileUrl, text, isComplete }`) একই স্কিমায় React Native-এর `AsyncStorage` / `expo-file-system` (`FileSystem.cacheDirectory`)-এ পোর্ট করা যাবে।

---

## ৬. Neon PostgreSQL (Prisma), Google লগইন ও সোশ্যাল এনগেজমেন্ট (Like, Comment, Rating)

- **Prisma স্কিমা (`prisma/schema.prisma`) ও ক্লায়েন্ট (`lib/prisma.js`):**
  - Firestore মিরর টেবিল: `categories`, `writers`, `writer_categories`, `books` (`tracksJson` সহ), `short_stories`।
  - অথেনটিকেশন ও রোল (RBAC): `users` (`googleId`, `email`, `name`, `avatar`, `role: UserRole`)। ৫টি রোল ক্যাটাগরি: `SUPER_ADMIN` (Owner), `ADMIN`, `EDITOR`, `ARTIST`, `USER`।
  - সোশ্যাল টেবিল: `likes`, `comments` (`parentId` রিপ্লাই সাপোর্টসহ), `ratings` (`score` ১–৫ ও `review`), যেখানে `targetType` = `AUDIOBOOK` | `EBOOK` এবং `targetId` = Firestore `docId`।
- **Google OAuth ও HS256 JWT (`lib/auth.js`):**
  - এন্ডপয়েন্টসমূহ: `GET /api/auth/google` ➔ `GET /api/auth/callback/google` ➔ `GET /api/auth/me` ➔ `POST /api/auth/logout`।
  - স্টেটলেস HS256 JWT (`signAuthJwt`, `verifyAuthJwt`) — ওয়েবে HttpOnly কুকি (`gj_jwt`) এবং ভবিষ্যতে React Native অ্যাপের জন্য `Authorization: Bearer <jwt>` দুটিই `getSessionUser(request)`-এ সাপোর্টেড। রোল চেক হেল্পার: `hasRole`, `hasMinRole`।
  - ক্লায়েন্ট প্রোভাইডার: `context/AuthContext.js` (`useAuth`), UI: `components/layout/Header.jsx` ও `components/layout/ProfileDialog.jsx`।
- **সোশ্যাল API (`app/api/engagement/route.js`):**
  - `GET /api/engagement?targetType=AUDIOBOOK|EBOOK&targetId=<docId>` — লাইক সংখ্যা, গড় রেটিং, ইউজারের নিজের লাইক/রেটিং ও কমেন্ট লিস্ট রিটার্ন করে।
  - `POST /api/engagement` — লগইনকৃত ইউজারের জন্য `action`: `"like"` | `"rating"` | `"comment"` | `"delete_comment"`।
- **Firebase ➔ Neon সিঙ্ক স্ক্রিপ্ট:** `node scripts/sync-firebase-to-neon.mjs` — Firestore-এর সব কালেকশন (`categories`, `writer`, `books` + নেস্টেড ট্র্যাক, `shortStory`) Neon PostgreSQL-এ মিরর/আপসার্ট করে।
