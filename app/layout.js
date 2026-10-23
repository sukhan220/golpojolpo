import "./globals.css";

export const metadata = {
  title: "গল্পজল্প পাঠক",
  description: "বই পড়ুন, বুকমার্ক রাখুন এবং নিজের নোট সংরক্ষণ করুন।",
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
