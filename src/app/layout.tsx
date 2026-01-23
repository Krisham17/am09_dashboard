import "./globals.css";

export const metadata = { title: "AM09 • Smart Traffic Dashboard" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans min-h-screen bg-neutral-100 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
