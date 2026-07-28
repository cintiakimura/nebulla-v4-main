import { LegalPageLayout } from '../components/LegalPageLayout';

/** Web-viewable DPA template at `/legal/dpa`. Counsel should review before commercial use. */
export function DpaPage() {
  return (
    <LegalPageLayout
      title="Data Processing Addendum"
      subtitle="Last updated: July 28, 2026 — template for Art. 28-style arrangements; not legal advice"
    >
      <section className="space-y-3">
        <p>
          This Data Processing Addendum (“DPA”) forms part of the agreement between the customer (“Controller”) and the
          operator of the Nebulla service (“Processor”) for processing of personal data in connection with the Service.
          Have counsel review before relying on this in a commercial contract.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">1. Roles</h2>
        <p>
          Controller determines the purposes and means of processing personal data it submits to the Service. Processor
          processes such personal data only to provide the Service, on documented instructions from Controller, and as
          described in the{' '}
          <a href="/privacy" className="text-cyan-400 hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">2. Nature and purpose</h2>
        <p>
          Processing includes hosting, storage, transmission to AI or OAuth subprocessors when features are used,
          support, security, and operating the Service for Controller.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">3. Categories</h2>
        <p>
          As determined by Controller’s use: typically account holders and individuals whose data appears in project
          content. Categories may include identifiers, contact data, authentication data, and content/files.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">4. Duration</h2>
        <p>
          Processing lasts for the term of the Service agreement and any retention required by law or documented backup
          windows after deletion, as described in the Privacy Policy.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">5. Subprocessors</h2>
        <p>
          Processor may use subprocessors listed in the Privacy Policy (hosting, database, OAuth, AI providers, email).
          Processor will impose data-protection obligations no less protective than this DPA.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">6. Security</h2>
        <p>
          Processor implements appropriate technical and organizational measures, including access controls, encryption
          in transit, encryption of certain secrets at rest, audit-oriented logging over time, and account deletion /
          export tooling.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">7. International transfers</h2>
        <p>
          Where personal data is transferred outside the EEA/UK, Processor relies on appropriate safeguards applicable to
          each subprocessor (for example provider SCCs or equivalent mechanisms).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">8. Assistance</h2>
        <p>
          Taking into account the nature of processing, Processor assists Controller with data subject requests, security
          incidents affecting Controller personal data, and DPIAs where reasonable and required by GDPR, at Controller’s
          request.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">9. Breach notification</h2>
        <p>
          Processor will notify Controller without undue delay after becoming aware of a personal data breach affecting
          Controller’s personal data, and provide information reasonably available to help meet GDPR Arts. 33/34.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">10. Return or deletion</h2>
        <p>
          Upon termination or Controller’s written request, Processor will delete or return Controller personal data in
          the Service within a reasonable period, except where retention is required by law or residual backups as
          disclosed in the Privacy Policy. Controller may use in-product data export and account deletion where
          available.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">11. Audits</h2>
        <p>
          Upon reasonable written notice, Processor will make available information necessary to demonstrate compliance
          with this DPA and allow audits agreed in good faith (remote questionnaires preferred).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-headline text-slate-200 font-normal">12. Contact</h2>
        <p>
          Privacy / security: see the Privacy Policy contact section. For countersigned commercial DPAs, use your Nebulla
          commercial contact.
        </p>
        <p className="text-slate-500 text-sm">
          Print or save this page from your browser for your records. Prefer a signed PDF when your counsel requires it.
        </p>
      </section>
    </LegalPageLayout>
  );
}
