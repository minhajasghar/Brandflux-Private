import Link from "next/link";

export const metadata = {
  title: "User Data Deletion Instructions | Brandflux",
  description: "Instructions on how users can request deletion of their data from Brandflux",
};

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-16 px-6 sm:px-12 lg:px-24">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <Link href="/" className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-lime-400 text-slate-950 flex items-center justify-center font-black">B</span>
            Brandflux
          </Link>
          <span className="text-xs text-slate-400">Compliance & User Rights</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-white">User Data Deletion Instructions</h1>

        <div className="space-y-6 text-slate-300 leading-relaxed text-sm sm:text-base">
          <p>
            At Brandflux, we respect your privacy and give you full control over your stored personal data, brand assets, and social media authorizations in accordance with Meta, TikTok, LinkedIn, and Google platform policies.
          </p>

          <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold text-white">Method 1: Instant Disconnect via Brand Studio</h2>
            <p>
              You can immediately revoke and delete your connected social media tokens at any time directly in the application:
            </p>
            <ol className="list-decimal pl-6 space-y-2 text-slate-300">
              <li>Log in to your Brandflux workspace at <span className="text-lime-400">brandflux.tntinnov.com</span>.</li>
              <li>Navigate to <strong>Brand Studio Settings &gt; Connected Accounts</strong>.</li>
              <li>Click the <strong>Disconnect</strong> button next to the relevant platform (Facebook, Instagram, LinkedIn, TikTok, or X).</li>
              <li>All associated OAuth tokens, page identifiers, and permissions are instantly and permanently purged from our database.</li>
            </ol>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold text-white">Method 2: Revoking Access Directly from Social Platforms</h2>
            <p>
              You can also revoke Brandflux permissions directly from your social network accounts:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Facebook &amp; Instagram:</strong> Go to <em>Facebook Settings &amp; Privacy &gt; Settings &gt; Business Integrations</em> (or Apps and Websites), select <strong>Brandflux</strong>, and click <strong>Remove</strong>.
              </li>
              <li>
                <strong>LinkedIn:</strong> Go to <em>Settings &amp; Privacy &gt; Data privacy &gt; Other applications</em>, find Brandflux, and click <strong>Remove</strong>.
              </li>
              <li>
                <strong>TikTok:</strong> Go to <em>Settings &amp; Privacy &gt; Security &amp; Permissions &gt; Manage app permissions</em>, select Brandflux, and revoke access.
              </li>
              <li>
                <strong>X / Twitter:</strong> Go to <em>Settings and privacy &gt; Security and account access &gt; Apps and sessions &gt; Connected apps</em>, select Brandflux, and click <strong>Revoke app permissions</strong>.
              </li>
            </ul>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold text-white">Method 3: Complete Account &amp; Data Purge Request</h2>
            <p>
              If you wish to delete your complete user account, brand profiles, image files, and audit records:
            </p>
            <p>
              Send an email to <span className="text-lime-400 font-semibold">support@tntinnov.com</span> with the subject line <strong>&quot;Data Deletion Request&quot;</strong> from your registered account email.
            </p>
            <p>
              Our engineering team will verify your identity and permanently delete all your data within 48 business hours, sending you a confirmation ticket upon completion.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

