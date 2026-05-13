import { LegalPageLayout } from '../components/LegalPageLayout';

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" subtitle="Last updated: April 24, 2026">
      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Overview</h2>
        <p>
          This policy describes how nebulla (&quot;we&quot;, &quot;us&quot;) collects, uses, and protects information when you use
          our web application and related services. We aim to be transparent and to handle data responsibly.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Information we collect</h2>
        <ul className="list-disc pl-5 space-y-2 text-slate-400">
          <li>
            <span className="text-slate-300">Account data:</span> when you create an account with email and password, we
            store your email and a password hash (never the plain password). When you sign in with GitHub, we receive
            identifiers, display name, email, and profile image as provided by GitHub.
          </li>
          <li>
            <span className="text-slate-300">Project and usage data:</span> content you create in the product (for
            example plans, prompts, and files you choose to store) is processed to provide the service.
          </li>
          <li>
            <span className="text-slate-300">Technical data:</span> standard server logs may include IP address, browser
            type, and timestamps for security and reliability.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">How we use information</h2>
        <p>We use information to operate, secure, and improve the service; authenticate users; and communicate about the product where appropriate.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Sharing</h2>
        <p>
          We do not sell your personal information. We may use subprocessors (such as hosting or AI providers) strictly
          to deliver features you use. Those relationships are governed by their terms and our agreements with them.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Security & retention</h2>
        <p>
          We apply reasonable technical and organizational measures to protect data. Retention depends on what is
          needed to run the service and meet legal obligations; you may request deletion of your account where
          applicable law allows.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Your choices</h2>
        <p>
          You can disconnect integrated accounts through your provider where supported, and contact us regarding
          access or correction requests. Regional privacy rights may apply depending on your location.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Changes</h2>
        <p>We may update this policy from time to time. The &quot;Last updated&quot; date at the top reflects the latest revision.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Contact</h2>
        <p>For privacy questions, please reach out through the contact channels published on your deployment of nebulla.</p>
      </section>
    </LegalPageLayout>
  );
}
