/**
 * Mock data matching Firestore database collections:
 * - categories (লাইব্রেরি)
 * - books (অডিও)
 * - shortStory (ই বুক)
 * - writer (লেখক)
 *
 * Used as fallback / initial state when Firestore is loading or offline.
 */

export const MOCK_CATEGORIES = [
  { id: "c-1", bn: "ছোট গল্প", en: "Short Story", audio: true, kindle: true },
  { id: "c-2", bn: "ভ্রমণ কাহিনী", en: "Travelogue", audio: true, kindle: true },
  { id: "c-3", bn: "প্রবন্ধ", en: "Essay", audio: true, kindle: false },
  { id: "c-4", bn: "রম্য রচনা", en: "Humour", audio: true, kindle: true },
  { id: "c-5", bn: "বিজ্ঞান ও প্রযুক্তি", en: "Science & Tech", audio: true, kindle: true },
  { id: "c-6", bn: "রহস্য রোমাঞ্চ", en: "Mystery & Thriller", audio: true, kindle: true },
  { id: "c-7", bn: "নাটক", en: "Drama", audio: true, kindle: false },
  { id: "c-8", bn: "কমিক্স", en: "Comics", audio: false, kindle: true },
  { id: "c-10", bn: "শিশু সাহিত্য", en: "Children Literature", audio: true, kindle: true },
  { id: "c-11", bn: "উপন্যাস", en: "Novel", audio: true, kindle: true },
  { id: "c-17", bn: "বিজ্ঞান কল্প কাহিনী", en: "Sci-Fi", audio: true, kindle: true },
  { id: "c-19", bn: "অনুবাদ", en: "Translation", audio: true, kindle: true },
  { id: "c-20", bn: "কিশোর সাহিত্য", en: "Young Adult", audio: true, kindle: true },
  { id: "c-24", bn: "কবিতা", en: "Poetry", audio: true, kindle: true },
  { id: "c-25", bn: "ডায়েরি", en: "Diary & Memoir", audio: true, kindle: false },
];

export const MOCK_WRITERS = [
  {
    id: "w-1",
    bn: "রবীন্দ্রনাথ ঠাকুর",
    name: "রবীন্দ্রনাথ ঠাকুর",
    letter: "র",
    cateId: ["c-1", "c-8", "c-4", "c-20", "c-11", "c-10", "c-24"],
    categories: ["ছোটগল্প", "কবিতা", "উপন্যাস", "নাটক", "শিশু সাহিত্য"],
  },
  {
    id: "w-2",
    bn: "বিভূতিভূষণ বন্দ্যোপাধ্যায়",
    name: "বিভূতিভূষণ বন্দ্যোপাধ্যায়",
    letter: "বি",
    cateId: ["c-1", "c-11", "c-2"],
    categories: ["ছোটগল্প", "উপন্যাস", "ভ্রমণ কাহিনী"],
  },
  {
    id: "w-3",
    bn: "মানিক বন্দ্যোপাধ্যায়",
    name: "মানিক বন্দ্যোপাধ্যায়",
    letter: "মা",
    cateId: ["c-1", "c-11"],
    categories: ["ছোটগল্প", "উপন্যাস"],
  },
  {
    id: "w-4",
    bn: "জীবনানন্দ দাশ",
    name: "জীবনানন্দ দাশ",
    letter: "জী",
    cateId: ["c-24", "c-1"],
    categories: ["কবিতা", "ছোটগল্প"],
  },
  {
    id: "w-5",
    bn: "শরৎচন্দ্র চট্টোপাধ্যায়",
    name: "শরৎচন্দ্র চট্টোপাধ্যায়",
    letter: "শ",
    cateId: ["c-1", "c-11"],
    categories: ["উপন্যাস", "ছোটগল্প"],
  },
  {
    id: "w-6",
    bn: "হুমায়ূন আহমেদ",
    name: "হুমায়ূন আহমেদ",
    letter: "হু",
    cateId: ["c-1", "c-6", "c-17", "c-11"],
    categories: ["উপন্যাস", "রহস্য রোমাঞ্চ", "সায়েন্স ফিকশন"],
  },
];

export const MOCK_AUDIO_BOOKS = [
  {
    id: "mock-track-001",
    isMock: true,
    title: "ডিটেকটিভ",
    artist: "রবীন্দ্রনাথ ঠাকুর",
    writer: "রবীন্দ্রনাথ ঠাকুর",
    writerId: "w-1",
    cateId: "c-1",
    voice: "জয় বিশ্বাস",
    time: "30:17",
    durationSec: 1817,
    letter: "ড",
    url: "",
    artwork: "https://i.pinimg.com/736x/fc/3c/6b/fc3c6b2c594713e8d7bb6807d9d71c1f.jpg",
    description: "রবীন্দ্রনাথ ঠাকুরের বিখ্যাত গোয়েন্দা কাহিনী 'ডিটেকটিভ'।",
    tracks: [],
  },
];

export const MOCK_SHORT_STORIES = [
  {
    id: "s-001",
    title: "কনে দেখা",
    writer: "বিভূতিভূষণ বন্দ্যোপাধ্যায়",
    writerId: "w-2",
    cateId: "c-1",
    letter: "ক",
    artwork: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR6sF0A_mE",
    fileUrl: "https://raw.githubusercontent.com/sukhan220/books/main/kone-dekha.txt",
    sampleText: `---chapter: কনে দেখা: সূচনা---
রেলগাড়ির জানালায় মুখ রেখে শৈলেন বাইরের ধূলিধূসর মাঠের দিকে তাকিয়ে ছিল। দূর গ্রামের পথ ধরে কয়েকজন চাষী বাড়ি ফিরছে।
গাড়ির চাকার একটানা ছন্দে তার মন যেন বহু দূরের স্মৃতির মধ্যে হারিয়ে যাচ্ছিল। আজ সে চলেছে নতুন এক জীবনে পা দিতে—কনে দেখতে।

---page---
---chapter: দ্বিতীয় অধ্যায়: অচেনা আঙিনা---
গ্রামের বাড়িটিতে যখন পৌঁছাল, তখন গোধূলির ম্লান আলো বাঁশঝাড়ের মাথায় নেমে এসেছে।
উঠোনে মাটির গন্ধ, তুলসীতলায় সাঁঝের প্রদীপ জ্বলছে। ঘরের ভেতর থেকে একজোড়া শান্ত চোখের দৃষ্টি ক্ষণিকের জন্য তার ওপর পড়ল।
সেই দৃষ্টিতে ভয় ছিল না, ছিল এক গভীর বিস্ময় আর মায়া।

---page---
---chapter: তৃতীয় অধ্যায়: একটি নীরব সিদ্ধান্ত---
কোনো লম্বা প্রশ্নমালা ছিল না, ছিল না কোনো কৃত্রিম আয়োজন। এক পেয়ালা চা আর কিছু ঘরের তৈরি মিষ্টির মাঝে শৈলেন বুঝেছিল, সৌন্দর্য মুখের সাজে নয়, অন্তরের সহজ সরল সারল্যের মধ্যেই বাস করে।`,
  },
  {
    id: "s-002",
    title: "পোস্টমাস্টার",
    writer: "রবীন্দ্রনাথ ঠাকুর",
    writerId: "w-1",
    cateId: "c-1",
    letter: "পো",
    artwork: "",
    fileUrl: "",
    sampleText: `---chapter: প্রথম পরিচ্ছেদ---
উলাপুর গ্রামে পোস্টমাস্টারকে প্রথম কর্মে আসিতে হইল। গ্রামটি অতি সামান্য। নিকটে একটি নীলকুঠি আছে, তাই কুঠির সাহেবের অনুগ্রহে একটি পোস্ট-আপিস হইয়াছে।
আমাদের পোস্টমাস্টার কলিকাতার ছেলে। জলের মাছকে ডাঙায় তুলিলে যেরূপ অবস্থা হয়, সেইরকম এক অবস্থা।

---page---
---chapter: রতনের সান্নিধ্য---
রতন নাম্নী গ্রামের এক অনাথ বালিকা পোস্টমাস্টারের ফরমাইশ খাটিত, একবেলা দুটি খাইতে পাইত।
পোস্টমাস্টার সন্ধ্যাবেলায় যখন ঘরের দাওয়ায় বসিতেন, রতন তামাক সাজিয়া আনিত। দুইজনে গ্রামের নির্জনতায় কত যে সুখদুঃখের কথা হইত!`,
  },
  {
    id: "s-003",
    title: "নদীর ওপারে",
    writer: "জীবনানন্দ দাশ",
    writerId: "w-4",
    cateId: "c-24",
    letter: "ন",
    artwork: "",
    fileUrl: "",
    sampleText: `---chapter: সূচনা---
নদীর ওপারে ঘন হয়ে আছে বন। সেই বনের ভেতর দিয়ে মেঠো পথ হারিয়ে গেছে রূপসী বাংলার কোনো এক অদেখা গহীনে।
ধানসিঁড়ি নদীর তীরে পাখি উড়ে যায়, ঘাসের উপর দিয়ে বয়ে যায় স্নিগ্ধ কুয়াশা।`,
  },
  {
    id: "s-004",
    title: "দর্পণ",
    writer: "মানিক বন্দ্যোপাধ্যায়",
    writerId: "w-3",
    cateId: "c-1",
    letter: "দ",
    artwork: "",
    fileUrl: "",
    sampleText: `---chapter: দর্পণ---
মানুষের মুখের রেখায় কত কথা লেখা থাকে। কখনো সে কথা বলা যায়, কখনো থাকে গোপন। সমাজের কঠিন বাস্তবের সামনে দাঁড়িয়ে এক যুবকের বেঁচে থাকার সংগ্রাম।`,
  },
];

export const MOCK_MAGAZINES = [
  { id: "mag-1", title: "শারদীয় সংখ্যা", letter: "শ", issue: "১২", year: "২০২৬" },
  { id: "mag-2", title: "বইমেলা বিশেষ", letter: "ব", issue: "১১", year: "২০২৬" },
  { id: "mag-3", title: "কিশোর ভুবন", letter: "কি", issue: "১০", year: "২০২৬" },
  { id: "mag-4", title: "বিজ্ঞান ও কল্পনা", letter: "বি", issue: "০৯", year: "২০২৫" },
  { id: "mag-5", title: "ভ্রমণ পত্র", letter: "ভ্র", issue: "০৮", year: "২০২৫" },
  { id: "mag-6", title: "কবিতা সমগ্র", letter: "ক", issue: "০৭", year: "২০২৫" },
];
