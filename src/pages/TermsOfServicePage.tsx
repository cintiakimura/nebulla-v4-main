import { LegalPageLayout } from '../components/LegalPageLayout';

export function TermsOfServicePage() {
  return (
    <LegalPageLayout title="Terms of Service" subtitle="Last updated: April 24, 2026">
      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Agreement</h2>
        <p>
          By accessing or using nebulla (&quot;Service&quot;), you agree to these Terms. If you do not agree, do not use the
          Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">The Service</h2>
        <p>
          nebulla provides software tools for design, planning, and collaboration. Features may change as we improve the
          product. We strive for reliability but do not guarantee uninterrupted or error-free operation.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Accounts</h2>
        <p>
          You are responsible for safeguarding credentials and for activity under your account. You must provide
          accurate information and comply with applicable laws and the policies of sign-in providers you use.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Acceptable use</h2>
        <p>You agree not to misuse the Service—for example by attempting unauthorized access, disrupting others, or violating intellectual property or export laws.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Content</h2>
        <p>
          You retain rights to content you submit. You grant us the license necessary to host, process, and display that
          content solely to operate the Service for you. You represent you have the rights needed for what you upload or
          generate.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Third-party services</h2>
        <p>
          The Service may integrate third-party APIs or sign-in. Those services have their own terms; your use of them
          is also subject to their policies.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Disclaimers</h2>
        <p>
          The Service is provided &quot;as is&quot; to the fullest extent permitted by law. Automated outputs may be incorrect;
          you should review important results before relying on them.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, nebulla and its suppliers will not be liable for indirect, incidental,
          special, consequential, or punitive damages, or for loss of profits or data, arising from your use of the
          Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Termination</h2>
        <p>We may suspend or terminate access for violations of these Terms or to protect the Service. You may stop using the Service at any time.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Changes</h2>
        <p>We may update these Terms. Continued use after changes become effective constitutes acceptance of the revised Terms.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">Contact</h2>
        <p>For questions about these Terms, use the contact information provided on your deployment of nebulla.</p>
      </section>
    </LegalPageLayout>
  );
}
