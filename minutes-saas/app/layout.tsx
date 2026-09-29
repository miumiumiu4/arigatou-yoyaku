export const metadata = { title: "議事録SaaS" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ fontFamily: "sans-serif", maxWidth: 860, margin: "0 auto", padding: 16, lineHeight: 1.7 }}>
        {children}
      </body>
    </html>
  );
}
