export default function CorrectionsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Corrections & Retractions
      </h1>

      {/* Policy */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Corrections Policy
        </h2>
        <p className="text-gray-700 mb-4">
          We are committed to accuracy. When errors are identified, we correct
          them promptly and transparently. All corrections are publicly logged
          here.
        </p>

        <h3 className="text-lg font-medium text-gray-800 mb-2">
          Types of Corrections
        </h3>
        <ul className="list-disc list-inside text-gray-700 mb-6 space-y-2">
          <li>
            <strong>Minor corrections:</strong> Typos, formatting, or
            non-substantive updates. Card status remains "Published."
          </li>
          <li>
            <strong>Material corrections:</strong> Substantive changes to claims
            or evidence. Card status changes to "Corrected" with explanation.
          </li>
          <li>
            <strong>Retractions:</strong> When evidence is fundamentally flawed
            or claims cannot be supported. Card status changes to "Retracted."
          </li>
        </ul>

        <h3 className="text-lg font-medium text-gray-800 mb-2">
          Retraction Criteria
        </h3>
        <p className="text-gray-700 mb-2">
          A card may be retracted when:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-2">
          <li>Source documents are determined to be inauthentic or tampered</li>
          <li>The claim cannot be supported by the cited evidence</li>
          <li>Significant factual errors undermine the card's validity</li>
          <li>New evidence fundamentally contradicts the original claim</li>
        </ul>
      </section>

      {/* Dispute Process */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Dispute Process
        </h2>
        <p className="text-gray-700 mb-4">
          Entities mentioned in evidence cards may dispute the content through
          official channels. All disputes are reviewed and logged.
        </p>

        <ol className="list-decimal list-inside text-gray-700 space-y-2">
          <li>
            Submit dispute with specific factual objections and supporting
            evidence.
          </li>
          <li>
            Our team reviews the dispute against original sources within 7
            business days.
          </li>
          <li>
            If dispute has merit, card is marked "Disputed" while under review.
          </li>
          <li>
            Final determination results in correction, retraction, or
            reaffirmation.
          </li>
          <li>
            All dispute communications are preserved in the card's counterpoint
            section.
          </li>
        </ol>
      </section>

      {/* Version History */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Version History
        </h2>
        <p className="text-gray-700 mb-4">
          Every evidence card maintains a complete version history. Previous
          versions are preserved and can be accessed by version number.
          This ensures full transparency about how our records evolve.
        </p>
      </section>

      {/* Recent Corrections */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Recent Corrections
        </h2>
        <div className="bg-gray-50 border border-gray-200 rounded-md p-6 text-center">
          <p className="text-gray-500">
            No corrections have been made yet.
          </p>
        </div>
      </section>
    </div>
  );
}
