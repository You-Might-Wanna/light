import { DEFAULT_SCORING_WEIGHTS } from '@ledger/shared';

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        About the Accountability Ledger
      </h1>

      {/* Mission */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Mission</h2>
        <p className="text-gray-700 mb-4">
          The Accountability Ledger is a public, evidence-first platform that
          documents corporate and government misconduct using verified public
          sources. Our goal is to create a transparent, accessible record of
          accountability that serves the public interest.
        </p>
        <p className="text-gray-700">
          Every claim on this platform is backed by primary source documents
          from official agencies, court filings, and other public records. We
          believe that accountability requires evidence, not allegations.
        </p>
      </section>

      {/* Methodology */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Methodology
        </h2>

        <h3 className="text-lg font-medium text-gray-800 mb-2">
          Evidence Standards
        </h3>
        <ul className="list-disc list-inside text-gray-700 mb-6 space-y-2">
          <li>
            <strong>Primary sources preferred:</strong> We prioritize official
            documents from government agencies, courts, and regulatory bodies.
          </li>
          <li>
            <strong>Secondary sources labeled:</strong> When primary sources
            are unavailable, secondary sources are clearly identified.
          </li>
          <li>
            <strong>Falsifiable claims:</strong> Every claim must be specific
            enough to be verified or refuted.
          </li>
          <li>
            <strong>Fact vs. interpretation:</strong> We clearly separate
            documented facts from editorial interpretation.
          </li>
        </ul>

        <h3 className="text-lg font-medium text-gray-800 mb-2">
          Source Verification
        </h3>
        <p className="text-gray-700 mb-4">
          All source documents are cryptographically verified using SHA-256
          hashing and digitally signed using AWS KMS. This ensures that source
          materials cannot be tampered with after publication.
        </p>
        <ul className="list-disc list-inside text-gray-700 mb-6 space-y-2">
          <li>Documents are hashed upon upload</li>
          <li>Verification manifests are signed with our public key</li>
          <li>Original source URLs are preserved for independent verification</li>
        </ul>
      </section>

      {/* Scoring */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Scoring System
        </h2>
        <p className="text-gray-700 mb-4">
          Scores are computed from transparent signals on each evidence card.
          The scoring system is designed to be reproducible — anyone can
          verify how a score was calculated.
        </p>

        <h3 className="text-lg font-medium text-gray-800 mb-2">
          Signal Definitions (0-5 scale)
        </h3>
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-6">
          <dl className="space-y-4">
            <div>
              <dt className="font-medium text-gray-900">Severity</dt>
              <dd className="text-sm text-gray-600">
                Magnitude of harm caused to individuals, communities, or
                institutions.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Intent</dt>
              <dd className="text-sm text-gray-600">
                Degree of intentionality, from negligence (1) to deliberate
                action (5).
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Scope</dt>
              <dd className="text-sm text-gray-600">
                Number of people affected, financial magnitude, or geographic
                extent.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Recidivism</dt>
              <dd className="text-sm text-gray-600">
                Pattern of repeat offenses or similar prior conduct.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Deception</dt>
              <dd className="text-sm text-gray-600">
                Degree of concealment, cover-up, or misleading statements.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Accountability</dt>
              <dd className="text-sm text-gray-600">
                Quality of remediation efforts, restitution, or reform measures.
                Higher scores indicate worse accountability.
              </dd>
            </div>
          </dl>
        </div>

        <h3 className="text-lg font-medium text-gray-800 mb-2">
          Current Weights
        </h3>
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="pb-2 text-gray-600">Signal</th>
                <th className="pb-2 text-gray-600">Weight</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr>
                <td className="py-1">Severity</td>
                <td>{(DEFAULT_SCORING_WEIGHTS.severity * 100).toFixed(0)}%</td>
              </tr>
              <tr>
                <td className="py-1">Intent</td>
                <td>{(DEFAULT_SCORING_WEIGHTS.intent * 100).toFixed(0)}%</td>
              </tr>
              <tr>
                <td className="py-1">Scope</td>
                <td>{(DEFAULT_SCORING_WEIGHTS.scope * 100).toFixed(0)}%</td>
              </tr>
              <tr>
                <td className="py-1">Recidivism</td>
                <td>{(DEFAULT_SCORING_WEIGHTS.recidivism * 100).toFixed(0)}%</td>
              </tr>
              <tr>
                <td className="py-1">Deception</td>
                <td>{(DEFAULT_SCORING_WEIGHTS.deception * 100).toFixed(0)}%</td>
              </tr>
              <tr>
                <td className="py-1">Accountability</td>
                <td>{(DEFAULT_SCORING_WEIGHTS.accountability * 100).toFixed(0)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Privacy */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Privacy & Ethics
        </h2>
        <ul className="list-disc list-inside text-gray-700 space-y-2">
          <li>
            <strong>No personal information:</strong> We do not publish
            non-public personal data.
          </li>
          <li>
            <strong>Public officials only:</strong> Individual names appear only
            for public officials in their official capacity.
          </li>
          <li>
            <strong>No harassment:</strong> We explicitly prohibit content that
            could encourage harassment or vigilantism.
          </li>
          <li>
            <strong>Right of reply:</strong> Entities may submit responses
            through official channels; these are logged and displayed.
          </li>
        </ul>
      </section>

      {/* Contact */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Contact</h2>
        <p className="text-gray-700">
          For corrections, disputes, or general inquiries, please contact us
          through official channels. All communications are logged for
          transparency.
        </p>
      </section>
    </div>
  );
}
