import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "X-IT — Personal AI Computer Assistant",
  description:
    "A full-stack AI workspace with sandbox computer control, tool execution, and app building.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <div className="flex h-screen w-screen overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}