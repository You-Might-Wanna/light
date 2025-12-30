import type { ScoreSignals } from '@ledger/shared';

interface ScoreDisplayProps {
  signals: ScoreSignals;
  showLabels?: boolean;
}

const signalLabels: Record<keyof ScoreSignals, string> = {
  severity: 'Severity',
  intent: 'Intent',
  scope: 'Scope',
  recidivism: 'Recidivism',
  deception: 'Deception',
  accountability: 'Accountability',
};

const signalDescriptions: Record<keyof ScoreSignals, string> = {
  severity: 'Magnitude of harm caused',
  intent: 'Degree of intentionality (negligence to deliberate)',
  scope: 'Number of people, dollars, or facilities affected',
  recidivism: 'Pattern of repeat offenses',
  deception: 'Concealment or misleading statements',
  accountability: 'Quality of remediation efforts',
};

export default function ScoreDisplay({
  signals,
  showLabels = true,
}: ScoreDisplayProps) {
  const signalKeys = Object.keys(signalLabels) as Array<keyof ScoreSignals>;

  return (
    <div className="space-y-2">
      {signalKeys.map((key) => {
        const value = signals[key];
        const percentage = (value / 5) * 100;

        return (
          <div key={key} className="group">
            {showLabels && (
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700" title={signalDescriptions[key]}>
                  {signalLabels[key]}
                </span>
                <span className="text-gray-500">{value}/5</span>
              </div>
            )}
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  value >= 4
                    ? 'bg-red-500'
                    : value >= 3
                    ? 'bg-orange-500'
                    : value >= 2
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${percentage}%` }}
                role="progressbar"
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={5}
                aria-label={`${signalLabels[key]}: ${value} out of 5`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface OverallScoreProps {
  score: number;
  maxScore?: number;
}

export function OverallScore({ score, maxScore = 100 }: OverallScoreProps) {
  const percentage = (score / maxScore) * 100;

  return (
    <div className="text-center">
      <div
        className={`text-4xl font-bold ${
          score >= 70
            ? 'text-red-600'
            : score >= 50
            ? 'text-orange-500'
            : score >= 30
            ? 'text-yellow-500'
            : 'text-green-600'
        }`}
      >
        {score.toFixed(0)}
      </div>
      <div className="text-sm text-gray-500 mt-1">Overall Score</div>
      <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            score >= 70
              ? 'bg-red-500'
              : score >= 50
              ? 'bg-orange-500'
              : score >= 30
              ? 'bg-yellow-500'
              : 'bg-green-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
