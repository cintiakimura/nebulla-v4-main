import { LegalPageLayout } from '../components/LegalPageLayout';

export function TermsOfServicePage() {
  return (
    <LegalPageLayout title="Terms of Service" subtitle="Last updated: July 28, 2026">
      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Agreement</h2>
        <p>
          By accessing or using Nebulla (“Service”), you agree to these Terms and our{' '}
          <a href="/privacy" className="text-cyan-400 hover:underline">
            Privacy Policy
          </a>
          . If you do not agree, do not use the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">The Service</h2>
        <p>
          Nebulla provides software tools for planning, coding assistance, UI generation, and related collaboration.
          Features may change. We strive for reliability but do not guarantee uninterrupted or error-free operation.
          AI outputs may be incorrect — review before relying on them in production.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Accounts</h2>
        <p>
          You are responsible for safeguarding credentials and for activity under your account. You must provide accurate
          information and comply with applicable laws and the policies of sign-in and AI providers you use. You may delete
          your account from the Account page; see the Privacy Policy for what deletion covers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Acceptable use</h2>
        <p>
          You agree not to misuse the Service — for example by attempting unauthorized access, disrupting others,
          scraping at abusive rates, or violating intellectual property or export laws. Do not use the Service to process
          unlawful content or secrets you are not allowed to share with subprocessors (including AI APIs).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Content and license</h2>
        <p>
          You retain rights to content you submit. You grant us the license necessary to host, process, and display that
          content solely to operate the Service for you, including transmission to subprocessors you enable. You
          represent you have the rights needed for what you upload or generate.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Third-party services</h2>
        <p>
          The Service integrates third-party APIs (GitHub OAuth, xAI, optional V0, hosting). Those services have their own
          terms; your use of them is also subject to their policies. Nebulla does not mark up provider usage fees you pay
          directly to those providers for your own keys.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Business terms / DPA</h2>
        <p>
          Organizations that need a data processing addendum may use the template at{' '}
          <a href="/legal/dpa" className="text-cyan-400 hover:underline">
            /legal/dpa
          </a>{' '}
          or request a signed version from their Nebulla commercial contact.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Disclaimers</h2>
        <p>
          The Service is provided “as is” to the fullest extent permitted by law. Automated outputs may be incorrect; you
          should review important results before relying on them.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Nebulla and its suppliers will not be liable for indirect, incidental,
          special, consequential, or punitive damages, or for loss of profits or data, arising from your use of the
          Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Termination</h2>
        <p>
          We may suspend or terminate access for violations of these Terms or to protect the Service. You may stop using
          the Service and delete your account at any time.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Changes</h2>
        <p>We may update these Terms. Continued use after changes become effective constitutes acceptance of the revised Terms.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Contact</h2>
        <p>
          Questions:{' '}
          <a href="mailto:privacy@nebulla.dev" className="text-cyan-400 hover:underline">
            privacy@nebulla.dev
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
