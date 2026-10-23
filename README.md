# গল্পজল্প পাঠক — Next.js Web

`golpojopo-reader-web` is a standalone Next.js version of the reading experience in the Expo app's `app/reader.jsx`. It lives beside the Expo project and does not modify or depend on that app.

The reader subscribes to the existing Firebase Firestore `shortStory` collection (the Expo app's reading-books collection); the `books` collection is used by that app for audiobooks. It fetches each book's existing `fileUrl`. Firebase settings are loaded from environment variables and are not committed.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Reading a book

- Open the included sample book, upload a `.txt`/`.md` file, or provide a direct URL to a text file.
- Separate explicit pages with `---page---`. Mark chapters with `---chapter: Chapter title---`.
- Use the browser-native 3D page-turn animation, including touch swipes. Choose scrolling or page-by-page reading, optionally show a two-page spread, and use page arrows, keyboard arrows, progress slider, or jump-to-page control. On mobile, double-tap for a landscape two-page fullscreen view; tap once to reveal controls.
- Markdown images written as `![description](image-url)` and images embedded in the book's HTML are displayed in the page. Relative image URLs are resolved from the book's `fileUrl`. Book HTML is rendered through an element/attribute allowlist; scripts and unsafe links are omitted.
- Select a passage to add a note; the passage is highlighted and the note can be revisited or removed from the notes panel.
- Adjust font family and size, cycle through reading themes, use automatic scrolling, and toggle fullscreen.
- Chapters, bookmarks, notes, booklists, books, and reading progress are saved in this browser's local storage. Use **Backup export** to download a JSON backup.

Create `.env.local` from `.env.local.example` and set the Firebase Web API key and project ID. The Firebase Web app needs Firestore read access to `shortStory`; the Expo app already reads this collection without authentication. The existing local `.env.local` is set up from the Expo Firebase project settings.

Each book's `fileUrl` must allow browser cross-origin requests (CORS). If the file host blocks browser requests, upload the text file directly. Reading progress, bookmarks, notes, and booklists remain in this browser; they are not synchronized across devices or browsers.
