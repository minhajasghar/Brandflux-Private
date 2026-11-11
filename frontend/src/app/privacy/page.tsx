import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Brandflux",
  description: "Brandflux Privacy Policy and Data Protection",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-16 px-6 sm:px-12 lg:px-24">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <Link href="/" className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-lime-400 text-slate-950 flex items-center justify-center font-black">B</span>
            Brandflux
          </Link>
          <span className="text-xs text-slate-400">Last updated: November 2026</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-white">Privacy Policy</h1>

        <div className="space-y-6 text-slate-300 leading-relaxed text-sm sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">1. Introduction</h2>
            <p>
              Brandflux (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) provides an AI-powered social media management and brand marketing automation platform. This Privacy Policy explains how we collect, use, and protect your information when you access or use our services via brandflux.tntinnov.com.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">2. Information We Collect</h2>
            <p>We collect information necessary to provide and enhance our services:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Information:</strong> Name, business email address, hashed passwords, and workspace preferences.</li>
              <li><strong>Brand Information:</strong> Brand name, tagline, target audience, brand colors, uploaded logos, and marketing copy preferences.</li>
              <li><strong>Social Media Connections:</strong> When you connect social accounts (such as Meta/Facebook, Instagram, LinkedIn, TikTok, or X/Twitter), we store OAuth access tokens securely in encrypted format. We never store your social account passwords.</li>
              <li><strong>Content & Analytics Data:</strong> Draft posts, generated images, scheduling history, and post engagement analytics (likes, reach, comments, impressions).</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">3. How We Use Social Media Data</h2>
            <p>
              We access social media platform APIs strictly to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Publish brand content that you or your authorized brand members have scheduled or approved.</li>
              <li>Retrieve post-publishing performance metrics and engagement analytics for your dashboard.</li>
              <li>Verify account connectivity and active publishing permissions.</li>
            </ul>
            <p>We do NOT sell, rent, or trade your personal or social data to any third parties or advertisers.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">4. Data Security & Storage</h2>
            <p>
              All OAuth access tokens are encrypted using industry-standard AES encryption (Fernet). Data in transit is secured via HTTPS/TLS. Image assets are securely stored using cloud object storage (Cloudflare R2).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">5. Data Deletion and Retention</h2>
            <p>
              You maintain full ownership of your data. You may disconnect social media accounts at any time from your Brand Studio Settings. To request the complete deletion of your account and all associated data, visit our{" "}
              <Link href="/data-deletion" className="text-lime-400 underline hover:text-lime-300">
                User Data Deletion page
              </Link>{" "}
              or email us at support@tntinnov.com.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">6. Contact Us</h2>
            <p>
              If you have any questions or concerns regarding this Privacy Policy, please contact TNT Innovations at{" "}
              <span className="text-lime-400">support@tntinnov.com</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

