import { LegalPageLayout } from '../components/LegalPageLayout';

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" subtitle="Last updated: July 28, 2026">
      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Overview</h2>
        <p>
          This policy describes how Nebulla (“we”, “us”) collects, uses, and protects information when you use our web
          application and related services. We aim to handle data responsibly and to support GDPR-aligned practices for
          EU users. This is not a certification claim.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Who we are</h2>
        <p>
          Nebulla is an IDE / product-building platform. For privacy questions contact{' '}
          <a href="mailto:privacy@nebulla.dev" className="text-cyan-400 hover:underline">
            privacy@nebulla.dev
          </a>{' '}
          (or the address published on your deployment). Security reports:{' '}
          <a href="mailto:security@nebulla.dev" className="text-cyan-400 hover:underline">
            security@nebulla.dev
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Information we collect</h2>
        <ul className="list-disc pl-5 space-y-2 text-slate-400">
          <li>
            <span className="text-slate-300">Account data:</span> email, display name, password hash (never the plain
            password), GitHub identifiers/avatar when you use GitHub sign-in, billing tier.
          </li>
          <li>
            <span className="text-slate-300">Project and usage data:</span> plans, files, prompts, and settings you store
            in the product; technical logs (IP, user agent, timestamps) for security and reliability.
          </li>
          <li>
            <span className="text-slate-300">API keys you provide (BYOK):</span> stored encrypted on your account when
            signed in; some project secrets may also remain in your browser until you clear site data.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">How we use information</h2>
        <p>
          We use information to operate and secure the Service, authenticate you, provide features you request (including
          AI-assisted coding and UI generation), communicate about the product, and improve reliability. Lawful bases
          typically include contract performance and legitimate interests in securing and operating the Service; where
          required we rely on consent.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">AI providers</h2>
        <p>
          When you use chat, architecture, coding, or UI generation, prompts and relevant project context may be sent to
          third-party AI providers (for example xAI for Grok, and optionally V0) so those features can run. Do not submit
          data you are not allowed to share with those providers. See their privacy policies for how they process API
          inputs.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Subprocessors</h2>
        <p>We use service providers strictly to deliver the Service, including:</p>
        <ul className="list-disc pl-5 space-y-2 text-slate-400">
          <li>Hosting / infrastructure (e.g. Render) and managed PostgreSQL</li>
          <li>GitHub (OAuth sign-in, when you choose it)</li>
          <li>xAI (Grok) for AI features when enabled</li>
          <li>V0 / v0.dev when you use optional UI generation with a V0 key</li>
          <li>Transactional email (e.g. Resend) for password reset when configured</li>
          <li>Object storage (e.g. Cloudflare R2) when asset storage is configured</li>
        </ul>
        <p>We do not sell your personal information.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">International transfers</h2>
        <p>
          Subprocessors may process data in the EU, UK, US, or other regions. Where GDPR requires safeguards for transfers
          outside the EEA/UK, we rely on appropriate mechanisms offered by those providers (such as standard contractual
          clauses).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Retention</h2>
        <ul className="list-disc pl-5 space-y-2 text-slate-400">
          <li>Account and project data: until you delete your account or remove projects, unless law requires longer.</li>
          <li>Conversation memory files: typically up to about 30 days of rolling retention on the server.</li>
          <li>Backups and operational logs: retained for a limited period by our host for disaster recovery and security.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Security</h2>
        <p>
          We use HTTPS in production, httpOnly session cookies, password hashing, and encryption at rest for
          account-stored AI keys. Production deployments must set strong session and encryption secrets. No method of
          transmission or storage is 100% secure.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Your rights</h2>
        <p>
          Depending on your location you may have rights to access, correct, delete, restrict, or port your personal
          data, and to object to certain processing. In the product you can:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-slate-400">
          <li>
            <span className="text-slate-300">Export:</span> download a JSON export of your account and project metadata
            from Account.
          </li>
          <li>
            <span className="text-slate-300">Delete:</span> permanently delete your account from Account (removes your
            user record, cloud projects, and encrypted keys we store; clears server conversation logs for your user id
            when present).
          </li>
        </ul>
        <p>
          After deletion, residual copies may remain briefly in encrypted backups or provider logs. Browser-stored
          secrets are not deleted by the server — clear site data in your browser. For other requests, email privacy@.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Business customers (DPA)</h2>
        <p>
          A Data Processing Addendum template is available at{' '}
          <a href="/legal/dpa" className="text-cyan-400 hover:underline">
            /legal/dpa
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Changes</h2>
        <p>We may update this policy. The “Last updated” date at the top reflects the latest revision.</p>
      </section>
    </LegalPageLayout>
  );
}
