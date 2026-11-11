import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Brandflux",
  description: "Brandflux Terms of Service and Usage Agreement",
};

export default function TermsPage() {
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

        <h1 className="text-3xl sm:text-4xl font-extrabold text-white">Terms of Service</h1>

        <div className="space-y-6 text-slate-300 leading-relaxed text-sm sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">1. Agreement to Terms</h2>
            <p>
              By signing up for or using Brandflux (brandflux.tntinnov.com), operated by TNT Innovations, you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">2. Acceptable Use and Platform Policies</h2>
            <p>
              Brandflux enables automated content generation and social media scheduling. When using our services, you agree:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>To comply with the Developer Terms and Community Guidelines of Meta (Facebook & Instagram), LinkedIn, TikTok, and X (Twitter).</li>
              <li>Not to generate or publish spam, misleading information, defamatory, or abusive content.</li>
              <li>To retain full responsibility for all content generated, reviewed, and published to your connected channels.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">3. Intellectual Property & Brand Assets</h2>
            <p>
              You retain all ownership rights in your brand logos, trademarks, and generated content. By uploading assets, you grant Brandflux the license to process and display them solely to provide the services requested.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">4. Account Security & Team Access</h2>
            <p>
              Account creators and approvers must maintain the confidentiality of their credentials. You are responsible for all actions taken under your account or by invited team members.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">5. Termination</h2>
            <p>
              You may terminate your account at any time. We reserve the right to suspend or terminate accounts that violate platform policies or abuse API quotas.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">6. Contact Information</h2>
            <p>
              For legal inquiries regarding these terms, contact TNT Innovations at{" "}
              <span className="text-lime-400">legal@tntinnov.com</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

