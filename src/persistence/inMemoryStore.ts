import type {
  Candidate,
  CandidateEducation,
  CandidateExperience,
  CandidateProject,
  CandidateSkill,
  CandidateScore,
  Job,
  JobRequirement,
  Resume,
  RankingResult,
  ScoreComponent,
  ScoreEvidence,
} from "../domain";
import {
  calculateScoringResult,
  rankCandidates,
  type ScoringInput,
  type ScoringResult,
} from "../domain";
import { parseResumeText, type ParsedResumeText } from "../resumeParsing";
import { parseJobDescription } from "../intelligence/jdAgent";
import { extractTextFromFile } from "../parsing/fileExtractor";
import { generateEvidenceChunks } from "../intelligence/chunker";
import { retrieveTopEvidence } from "../scoring/hybridEngine";
import { validateEvidence } from "../scoring/crossEncoder";

export interface CreateJobInput {
  orgId: string;
  createdBy: string;
  title: string;
  description: string;
  jobType: Job["jobType"];
  domain: string;
  status?: Job["status"];
  minExperience?: number;
  requirements?: Array<Pick<JobRequirement, "importance" | "requirementType" | "rawText" | "weight"> & {
    skillId?: string;
  }>;
}

export interface ScoreCandidateInput extends ScoringInput {
  stage?: RankingResult["stage"];
}

export interface JobSnapshot {
  job: Job;
  requirements: JobRequirement[];
  rankings: RankingResult[];
}

export interface ResumeIngestInput {
  candidateId: string;
  jobId: string;
  filePath: string;
  fileType: string;
  rawText: string;
}

export interface ResumeIngestResult {
  resume: Resume;
  parsed: ParsedResumeText;
  candidateSkills: CandidateSkill[];
  candidateExperience: CandidateExperience[];
  candidateProjects: CandidateProject[];
  candidateEducation: CandidateEducation[];
  score: ScoringResult;
}

export interface DemoSeedResult {
  job: JobSnapshot;
  scoreId: string;
  candidateId: string;
}

export interface JobAccessContext {
  orgId: string;
}

export interface ScoreAccessContext extends JobAccessContext {
  userId: string;
}

export class InMemoryResumeScreenerStore {
  private readonly jobs = new Map<string, Job>();
  private readonly requirementsByJob = new Map<string, JobRequirement[]>();
  private readonly scoresByJob = new Map<string, CandidateScore[]>();
  private readonly componentsByScore = new Map<string, ScoreComponent[]>();
  private readonly evidenceByScore = new Map<string, ScoreEvidence[]>();
  private readonly rankingsByJob = new Map<string, RankingResult[]>();
  private readonly resumesByJob = new Map<string, Resume[]>();
  private readonly candidateSkillsByCandidate = new Map<string, CandidateSkill[]>();
  private readonly candidateExperienceByCandidate = new Map<string, CandidateExperience[]>();
  private readonly candidateProjectsByCandidate = new Map<string, CandidateProject[]>();
  private readonly candidateEducationByCandidate = new Map<string, CandidateEducation[]>();
  private sequence = 0;

  async createJob(input: CreateJobInput): Promise<JobSnapshot> {
    const jobId = this.createId("job");
    const job: Job = {
      id: jobId,
      orgId: input.orgId,
      createdBy: input.createdBy,
      title: input.title,
      description: input.description,
      status: input.status ?? "DRAFT",
      jobType: input.jobType,
      domain: input.domain,
      minExperience: input.minExperience,
    };

    this.jobs.set(jobId, job);

    let requirements: JobRequirement[] = (input.requirements ?? []).map((requirement, index) => ({
      id: this.createId(`req-${index + 1}`),
      jobId,
      skillId: requirement.skillId,
      importance: requirement.importance,
      requirementType: requirement.requirementType,
      rawText: requirement.rawText,
      weight: requirement.weight,
    }));

    if (requirements.length === 0 && input.description) {
      const parsedJd = await parseJobDescription(jobId, input.description);
      requirements = [...parsedJd.mustHave, ...parsedJd.niceToHave];
    }

    this.requirementsByJob.set(jobId, requirements);
    this.rankJobCandidates(jobId);

    return {
      job,
      requirements,
      rankings: this.rankingsByJob.get(jobId) ?? [],
    };
  }

  listJobs(orgId: string): Job[] {
    return [...this.jobs.values()].filter((job) => job.orgId === orgId);
  }

  getJobSnapshot(jobId: string, context: JobAccessContext): JobSnapshot | undefined {
    const job = this.jobs.get(jobId);

    if (!job || job.orgId !== context.orgId) {
      return undefined;
    }

    return {
      job,
      requirements: this.requirementsByJob.get(jobId) ?? [],
      rankings: this.rankingsByJob.get(jobId) ?? [],
    };
  }

  scoreCandidate(input: ScoreCandidateInput, context: ScoreAccessContext): ScoringResult {
    const job = this.jobs.get(input.jobId);

    if (!job || job.orgId !== context.orgId) {
      throw new Error("Job not found for this organization");
    }

    const requirements = input.requirements.length > 0
      ? input.requirements
      : this.requirementsByJob.get(input.jobId) ?? [];

    const result = calculateScoringResult({
      candidateId: input.candidateId,
      jobId: input.jobId,
      requirements,
      matchedRequirements: input.matchedRequirements,
      signals: input.signals,
      scoringVersion: input.scoringVersion,
    });

    this.storeScore(result);
    this.rankJobCandidates(input.jobId, input.stage ?? "INITIAL");

    return result;
  }

  getRankings(jobId: string, context: JobAccessContext): RankingResult[] {
    const job = this.jobs.get(jobId);

    if (!job || job.orgId !== context.orgId) {
      return [];
    }

    return [...(this.rankingsByJob.get(jobId) ?? [])].sort((left, right) => left.rank - right.rank);
  }

  getScores(jobId: string, context: JobAccessContext): CandidateScore[] {
    const job = this.jobs.get(jobId);

    if (!job || job.orgId !== context.orgId) {
      return [];
    }

    return [...(this.scoresByJob.get(jobId) ?? [])];
  }

  getComponents(scoreId: string): ScoreComponent[] {
    return this.componentsByScore.get(scoreId) ?? [];
  }

  getEvidence(scoreId: string): ScoreEvidence[] {
    return this.evidenceByScore.get(scoreId) ?? [];
  }

  getResumes(jobId: string, context: JobAccessContext): Resume[] {
    const job = this.jobs.get(jobId);

    if (!job || job.orgId !== context.orgId) {
      return [];
    }

    return [...(this.resumesByJob.get(jobId) ?? [])];
  }

  async ingestResume(input: ResumeIngestInput, context: ScoreAccessContext): Promise<ResumeIngestResult> {
    const job = this.jobs.get(input.jobId);

    if (!job || job.orgId !== context.orgId) {
      throw new Error("Job not found for this organization");
    }

    let rawText = input.rawText;
    if (!rawText) {
      rawText = await extractTextFromFile(input.filePath);
    }

    const parsed = parseResumeText(rawText);
    const resume: Resume = {
      id: this.createId("resume"),
      candidateId: input.candidateId,
      jobId: input.jobId,
      filePath: input.filePath,
      fileType: input.fileType,
      status: "PARSED",
      rawText: rawText,
      parsedAt: new Date(),
    };

    const candidateSkills = parsed.detectedSkills.map((skillName, index) => ({
      id: this.createId(`cand-skill-${index + 1}`),
      candidateId: input.candidateId,
      skillId: normalizeSkillId(skillName),
      evidenceText: parsed.sectionLines.skills.join(" | ") || skillName,
      evidenceLevel: "high",
      proficiencyScore: 0.8,
      yearsUsed: 0,
      sourceSection: parsed.sectionLines.skills.length > 0 ? "skills" : "summary",
    }));

    const candidateExperience = buildSimpleItems<CandidateExperience>(
      this,
      input.candidateId,
      parsed.sectionLines.experience,
      "cand-exp",
      (value) => ({
        company: value,
        title: value,
        durationMonths: 0,
        responsibilities: parsed.sectionLines.experience,
        domain: job.domain,
        isCurrent: false,
        relevanceScore: 0.5,
      }),
    );

    const candidateProjects = buildSimpleItems<CandidateProject>(
      this,
      input.candidateId,
      parsed.sectionLines.projects,
      "cand-proj",
      (value) => ({
        title: value,
        description: value,
        techStack: parsed.detectedSkills,
        impact: undefined,
        url: undefined,
        relevanceScore: 0.5,
        skillsDemonstrated: parsed.detectedSkills,
      }),
    );

    const candidateEducation = buildSimpleItems<CandidateEducation>(
      this,
      input.candidateId,
      parsed.sectionLines.education,
      "cand-edu",
      (value) => ({
        institution: value,
        degree: value,
        field: value,
        gpa: undefined,
        year: undefined,
      }),
    );

    this.storeResume(input.jobId, resume);
    this.candidateSkillsByCandidate.set(input.candidateId, candidateSkills);
    this.candidateExperienceByCandidate.set(input.candidateId, candidateExperience);
    this.candidateProjectsByCandidate.set(input.candidateId, candidateProjects);
    this.candidateEducationByCandidate.set(input.candidateId, candidateEducation);

    const requirements = this.requirementsByJob.get(input.jobId) ?? [];
    
    // AI Pipeline Integration
    const chunks = generateEvidenceChunks(input.candidateId, parsed.sectionLines);
    
    const matchedRequirements = [];
    let avgFitScore = 0;
    let avgConfidence = 0;
    
    for (const req of requirements) {
      const topEvidence = await retrieveTopEvidence(req, chunks);
      const validation = await validateEvidence(req, topEvidence);
      
      avgFitScore += validation.fitScore;
      avgConfidence += validation.confidence;
      
      if (topEvidence.length > 0) {
        matchedRequirements.push({
          requirementId: req.id,
          skillId: req.skillId,
          evidenceText: topEvidence[0].text,
          evidenceLevel: validation.fitScore > 0.8 ? "high" : "medium",
          matchType: "semantic",
          rawScore: validation.fitScore,
          contribution: validation.fitScore * req.weight,
        });
      }
    }
    
    if (requirements.length > 0) {
      avgFitScore /= requirements.length;
      avgConfidence /= requirements.length;
    } else {
      avgFitScore = 1;
      avgConfidence = 1;
    }
    
    // Mix with deterministic score signals
    const signals = deriveResumeSignals(parsed);
    signals.semanticScore = avgFitScore; 
    signals.confidenceScore = avgConfidence;

    const score = calculateScoringResult({
      candidateId: input.candidateId,
      jobId: input.jobId,
      requirements,
      matchedRequirements,
      signals,
      scoringVersion: "ai-pipeline-v1",
    });

    this.storeScore(score);
    this.rankJobCandidates(input.jobId);

    return {
      resume,
      parsed,
      candidateSkills,
      candidateExperience,
      candidateProjects,
      candidateEducation,
      score,
    };
  }

  async seedDemoData(): Promise<DemoSeedResult> {
    const existingJob = this.listJobs("demo-org")[0];

    if (existingJob) {
      const snapshot = this.getJobSnapshot(existingJob.id, { orgId: "demo-org" });

      if (!snapshot) {
        throw new Error("Demo seed exists but could not be loaded");
      }

      const score = this.getScores(existingJob.id, { orgId: "demo-org" })[0];

      if (!score) {
        throw new Error("Demo seed exists but score could not be loaded");
      }

      return {
        job: snapshot,
        scoreId: score.id,
        candidateId: score.candidateId,
      };
    }

    const snapshot = await this.createJob({
      orgId: "demo-org",
      createdBy: "demo-user",
      title: "Senior Full Stack Engineer",
      description: "Build and improve the resume screener product.",
      status: "OPEN",
      jobType: "FULL_TIME",
      domain: "platform",
      minExperience: 4,
      requirements: [
        {
          importance: "MANDATORY",
          requirementType: "skill",
          rawText: "TypeScript and Node.js experience",
          weight: 1,
          skillId: "skill-typescript",
        },
        {
          importance: "IMPORTANT",
          requirementType: "skill",
          rawText: "PostgreSQL or relational database experience",
          weight: 0.8,
          skillId: "skill-postgresql",
        },
        {
          importance: "OPTIONAL",
          requirementType: "skill",
          rawText: "Experience with resume parsing or scoring systems",
          weight: 0.5,
        },
      ],
    });

    const score = this.scoreCandidate(
      {
        candidateId: "demo-candidate",
        jobId: snapshot.job.id,
        requirements: snapshot.requirements,
        matchedRequirements: [
          {
            requirementId: snapshot.requirements[0]?.id ?? "",
            skillId: "skill-typescript",
            evidenceText: "Built TypeScript services with Node.js APIs.",
            evidenceLevel: "high",
            matchType: "skill",
            rawScore: 0.95,
            contribution: 0.95,
          },
          {
            requirementId: snapshot.requirements[1]?.id ?? "",
            skillId: "skill-postgresql",
            evidenceText: "Designed PostgreSQL-backed data models and migration flows.",
            evidenceLevel: "high",
            matchType: "skill",
            rawScore: 0.9,
            contribution: 0.9,
          },
        ],
        signals: {
          skillScore: 0.92,
          experienceScore: 0.86,
          projectScore: 0.78,
          educationScore: 0.7,
          semanticScore: 0.88,
          confidenceScore: 0.9,
        },
        scoringVersion: "demo-seed",
      },
      {
        orgId: "demo-org",
        userId: "demo-user",
      },
    );

    return {
      job: this.getJobSnapshot(snapshot.job.id, { orgId: "demo-org" }) ?? snapshot,
      scoreId: score.candidateScore.id,
      candidateId: score.candidateScore.candidateId,
    };
  }

  private storeScore(result: ScoringResult): void {
    const jobScores = this.scoresByJob.get(result.candidateScore.jobId) ?? [];
    const scoreIndex = jobScores.findIndex((score) => score.id === result.candidateScore.id);

    if (scoreIndex >= 0) {
      jobScores[scoreIndex] = result.candidateScore;
    } else {
      jobScores.push(result.candidateScore);
    }

    this.scoresByJob.set(result.candidateScore.jobId, jobScores);
    this.componentsByScore.set(result.candidateScore.id, result.scoreComponents);
    this.evidenceByScore.set(result.candidateScore.id, result.scoreEvidence);
  }

  private storeResume(jobId: string, resume: Resume): void {
    const resumes = this.resumesByJob.get(jobId) ?? [];
    resumes.push(resume);
    this.resumesByJob.set(jobId, resumes);
  }

  private rankJobCandidates(jobId: string, stage: RankingResult["stage"] = "INITIAL"): void {
    const rankedScores = rankCandidates(this.scoresByJob.get(jobId) ?? []);
    const rankings = rankedScores.map((score, index) => ({
      id: this.createId(`rank-${index + 1}`),
      jobId,
      candidateId: score.candidateId,
      rank: index + 1,
      scoreId: score.id,
      stage,
      rerankScore: stage === "RERANKED" ? score.overallScore : undefined,
      createdAt: new Date(),
    }));

    this.rankingsByJob.set(jobId, rankings);
  }

  createId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }
}

function buildSimpleItems<T>(
  store: InMemoryResumeScreenerStore,
  candidateId: string,
  values: string[],
  prefix: string,
  buildItem: (value: string) => Omit<T, "id" | "candidateId">,
): T[] {
  return values.map((value, index) => ({
    id: store.createId(`${prefix}-${index + 1}`),
    candidateId,
    ...buildItem(value),
  })) as T[];
}

function normalizeSkillId(skillName: string): string {
  return `skill-${skillName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function buildRequirementMatches(
  requirements: JobRequirement[],
  parsed: ParsedResumeText,
  candidateSkills: CandidateSkill[],
): Array<{
  requirementId: string;
  skillId?: string;
  evidenceText: string;
  evidenceLevel: string;
  matchType: string;
  rawScore: number;
  contribution?: number;
}> {
  const detectedSkillIds = new Set(candidateSkills.map((skill) => skill.skillId));

  return requirements.flatMap((requirement) => {
    const requirementText = `${requirement.rawText} ${requirement.requirementType}`.toLowerCase();
    const requirementSkillId = requirement.skillId;
    const skillTextMatch =
      requirementSkillId && detectedSkillIds.has(requirementSkillId)
        ? 0.95
        : parsed.detectedSkills.some((skill) => requirementText.includes(skill.toLowerCase()))
          ? 0.8
          : 0;

    if (skillTextMatch === 0) {
      return [];
    }

    return [
      {
        requirementId: requirement.id,
        skillId: requirementSkillId,
        evidenceText: parsed.summary,
        evidenceLevel: requirement.importance === "MANDATORY" ? "high" : "medium",
        matchType: requirement.skillId ? "skill" : "semantic",
        rawScore: skillTextMatch,
        contribution: skillTextMatch * requirement.weight,
      },
    ];
  });
}

function deriveResumeSignals(parsed: ParsedResumeText) {
  const skillCount = parsed.detectedSkills.length;
  const sectionCount = Object.values(parsed.sectionLines).filter((lines) => lines.length > 0).length;

  return {
    skillScore: clamp01(skillCount / 8),
    experienceScore: clamp01((parsed.sectionLines.experience.length + sectionCount) / 10),
    projectScore: clamp01(parsed.sectionLines.projects.length / 5),
    educationScore: clamp01(parsed.sectionLines.education.length / 4),
    semanticScore: clamp01((parsed.summary.length % 100) / 100),
    confidenceScore: clamp01(0.6 + Math.min(0.3, sectionCount * 0.05)),
  };
}

function clamp01(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export const defaultResumeScreenerStore = new InMemoryResumeScreenerStore();