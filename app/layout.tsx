import type { Metadata } from "next";
import { Lexend } from "next/font/google";
import "./globals.css";

const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-lexend",
});

export const metadata: Metadata = {
  title: "Contact Cleaner",
  description:
    "Clean contact lists before they go into HubSpot. Standardize names, companies, phones, and addresses, line up duplicates, and flag emails that would hurt a send.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${lexend.variable} ${lexend.className} antialiased`}>{children}</body>
    </html>
  );
}
