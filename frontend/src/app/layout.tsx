import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import PageTransition from "@/components/shared/PageTransition";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Brandflux — AI Social Media Content Generator, Brand Kit & Auto-Scheduler",
  description:
    "Automate your brand's social media strategy with Brandflux. Scan your website to extract your brand voice and colors, generate 2 branded visual variants with hashtag-ready captions, collaborate with team approvers, and schedule or post live across Instagram, LinkedIn, Facebook, X & TikTok.",
  keywords: [
    "AI social media content generator",
    "brand intelligence platform",
    "social media auto scheduler",
    "AI brand kit extractor",
    "team content approval workflow",
    "multi-platform social publishing",
    "Instagram LinkedIn Facebook X TikTok scheduler",
  ],
  openGraph: {
    title: "Brandflux — AI Social Media Content Generator & Auto-Scheduler",
    description:
      "Scan your website, generate 2 branded visual variants and hashtag-ready captions for 5 platforms, approve as a team, and post or schedule in 1 click.",
    type: "website",
    siteName: "Brandflux",
  },
  twitter: {
    card: "summary_large_image",
    title: "Brandflux — AI Social Media Content Generator & Auto-Scheduler",
    description:
      "Turn your website URL into daily, brand-aligned social posts, visuals, and scheduled campaigns across Instagram, LinkedIn, Facebook, X & TikTok.",
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' }
    ],
    shortcut: '/favicon.ico',
    apple: '/icon.svg'
  },
  other: {
    "tiktok-developers-site-verification": "itD2UYLgYa0x1zD3mbvnQzuDok5vTvTN",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${plusJakartaSans.variable} font-sans antialiased bg-bg text-text selection:bg-accent selection:text-black min-h-screen`}
      >
        <PageTransition>
          {children}
        </PageTransition>
        <Toaster 
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#0D0F16',
              color: '#F4F5F7',
              border: '1px solid #1C2030',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 600,
            },
            success: {
              iconTheme: {
                primary: '#10B981',
                secondary: '#05060A',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#05060A',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
