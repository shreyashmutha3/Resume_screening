import type {
  CandidateScore,
  JobRequirement,
  ScoreComponent,
  ScoreEvidence,
} from "./entities";

export interface RequirementMatch {
  requirementId: string;
  skillId?: string;
  evidenceText: string;
  evidenceLevel: string;
  matchType: string;
  rawScore: number;
  contribution?: number;
}

export interface CandidateProfileSignal {
  skillScore: number;
  experienceScore: number;
  projectScore: number;
  educationScore: number;
  semanticScore: number;
  confidenceScore: number;
}

export interface ScoringInput {
  candidateId: string;
  jobId: string;
  requirements: JobRequirement[];
  matchedRequirements: RequirementMatch[];
  signals: CandidateProfileSignal;
  scoringVersion?: string;
}

export interface ScoringResult {
  candidateScore: CandidateScore;
  scoreComponents: ScoreComponent[];
  scoreEvidence: ScoreEvidence[];
}

export interface ScoringWeights {
  skill: number;
  experience: number;
  project: number;
  education: number;
  semantic: number;
  mandatory: number;
  evidence: number;
  confidence: number;
}

export const defaultScoringWeights: ScoringWeights = {
  skill: 0.28,
  experience: 0.2,
  project: 0.12,
  education: 0.08,
  semantic: 0.14,
  mandatory: 0.1,
  evidence: 0.05,
  confidence: 0.03,
};

export function calculateScoringResult(
  input: ScoringInput,
  weights: ScoringWeights = defaultScoringWeights,
): ScoringResult {
  const mandatoryRequirements = input.requirements.filter(
    (requirement) => requirement.importance === "MANDATORY",
  );
  const matchedMandatoryCount = mandatoryRequirements.filter((requirement) =>
    input.matchedRequirements.some(
      (match) => match.requirementId === requirement.id && match.rawScore > 0,
    ),
  ).length;

  const mandatoryScore =
    mandatoryRequirements.length === 0
      ? 1
      : matchedMandatoryCount / mandatoryRequirements.length;

  const evidenceScore = average(
    input.matchedRequirements.map((match) => clamp01(match.rawScore)),
  );

  const componentScores: Array<[string, number, number]> = [
    ["skill", clamp01(input.signals.skillScore), weights.skill],
    ["experience", clamp01(input.signals.experienceScore), weights.experience],
    ["project", clamp01(input.signals.projectScore), weights.project],
    ["education", clamp01(input.signals.educationScore), weights.education],
    ["semantic", clamp01(input.signals.semanticScore), weights.semantic],
    ["mandatory", clamp01(mandatoryScore), weights.mandatory],
    ["evidence", clamp01(evidenceScore), weights.evidence],
    ["confidence", clamp01(input.signals.confidenceScore), weights.confidence],
  ];

  const overallScore = componentScores.reduce(
    (sum, [, rawScore, weight]) => sum + rawScore * weight,
    0,
  );

  const scoreId = stableScoreId(input.candidateId, input.jobId);
  const rankedAt = new Date();

  const scoreComponents: ScoreComponent[] = componentScores.map(
    ([componentName, rawScore, weight]) => ({
      id: `${scoreId}:${componentName}`,
      scoreId,
      componentName,
      rawScore,
      weight,
      weightedScore: rawScore * weight,
      details: {
        scoringVersion: input.scoringVersion ?? "phase-1",
      },
    }),
  );

  const scoreEvidence: ScoreEvidence[] = input.matchedRequirements.map(
    (match, index) => ({
      id: `${scoreId}:evidence:${index}`,
      scoreId,
      requirementId: match.requirementId,
      skillId: match.skillId,
      evidenceText: match.evidenceText,
      matchType: match.matchType,
      evidenceLevel: match.evidenceLevel,
      rawScore: clamp01(match.rawScore),
      weight: match.contribution ?? 1,
      contribution: clamp01(match.contribution ?? match.rawScore),
    }),
  );

  return {
    candidateScore: {
      id: scoreId,
      candidateId: input.candidateId,
      jobId: input.jobId,
      overallScore: clamp01(overallScore),
      skillScore: clamp01(input.signals.skillScore),
      experienceScore: clamp01(input.signals.experienceScore),
      projectScore: clamp01(input.signals.projectScore),
      educationScore: clamp01(input.signals.educationScore),
      semanticScore: clamp01(input.signals.semanticScore),
      mandatoryScore: clamp01(mandatoryScore),
      evidenceScore: clamp01(evidenceScore),
      confidenceScore: clamp01(input.signals.confidenceScore),
      mandatoryMet: matchedMandatoryCount,
      mandatoryTotal: mandatoryRequirements.length,
      scoringVersion: input.scoringVersion ?? "phase-1",
      weightsUsed: { ...weights },
      rankedAt,
    },
    scoreComponents,
    scoreEvidence,
  };
}

export function rankCandidates(scores: CandidateScore[]): CandidateScore[] {
  return [...scores].sort((left, right) => {
    if (right.overallScore !== left.overallScore) {
      return right.overallScore - left.overallScore;
    }

    if (right.mandatoryScore !== left.mandatoryScore) {
      return right.mandatoryScore - left.mandatoryScore;
    }

    return right.confidenceScore - left.confidenceScore;
  });
}

function clamp01(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stableScoreId(candidateId: string, jobId: string): string {
  return `score:${candidateId}:${jobId}`;
}