export type UserRole = "RECRUITER" | "CANDIDATE" | "ADMIN";
export type JobStatus = "DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED";
export type JobType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP";
export type RequirementImportance = "MANDATORY" | "IMPORTANT" | "OPTIONAL";
export type ResumeStatus = "UPLOADED" | "PARSING" | "PARSED" | "FAILED";
export type SkillRelationshipType = "PARENT" | "SYNONYM" | "RELATED" | "TRANSFER";
export type RankingStage = "INITIAL" | "RERANKED";

export interface Organization {
  id: string;
  name: string;
  plan: string;
  createdAt: Date;
}

export interface User {
  id: string;
  orgId: string;
  email: string;
  role: UserRole;
  passwordHash: string;
}

export interface Job {
  id: string;
  orgId: string;
  createdBy: string;
  title: string;
  description: string;
  status: JobStatus;
  jobType: JobType;
  domain: string;
  minExperience?: number;
}

export interface JobRequirement {
  id: string;
  jobId: string;
  skillId?: string;
  importance: RequirementImportance;
  requirementType: string;
  rawText: string;
  weight: number;
}

export interface Candidate {
  id: string;
  userId: string;
  blindId: string;
  createdAt: Date;
}

export interface Resume {
  id: string;
  candidateId: string;
  jobId: string;
  filePath: string;
  fileType: string;
  status: ResumeStatus;
  rawText?: string;
  parsedAt?: Date;
}

export interface CandidateSkill {
  id: string;
  candidateId: string;
  skillId: string;
  evidenceText: string;
  evidenceLevel: string;
  proficiencyScore: number;
  yearsUsed: number;
  sourceSection: string;
}

export interface CandidateExperience {
  id: string;
  candidateId: string;
  company: string;
  title: string;
  startDate?: Date;
  endDate?: Date;
  durationMonths: number;
  responsibilities: string[];
  domain: string;
  isCurrent: boolean;
  relevanceScore: number;
}

export interface CandidateProject {
  id: string;
  candidateId: string;
  title: string;
  description: string;
  techStack: string[];
  impact?: string;
  url?: string;
  relevanceScore: number;
  skillsDemonstrated: string[];
}

export interface CandidateEducation {
  id: string;
  candidateId: string;
  institution: string;
  degree: string;
  field: string;
  gpa?: string;
  year?: number;
}

export interface Skill {
  id: string;
  name: string;
  canonicalName: string;
  category: string;
  aliases: string[];
  embedding?: number[];
  createdAt: Date;
}

export interface SkillRelationship {
  id: string;
  parentId: string;
  childId: string;
  relationshipType: SkillRelationshipType;
}

export interface CandidateScore {
  id: string;
  candidateId: string;
  jobId: string;
  overallScore: number;
  skillScore: number;
  experienceScore: number;
  projectScore: number;
  educationScore: number;
  semanticScore: number;
  mandatoryScore: number;
  evidenceScore: number;
  confidenceScore: number;
  mandatoryMet: number;
  mandatoryTotal: number;
  scoringVersion: string;
  weightsUsed: Record<string, number>;
  rankedAt: Date;
}

export interface ScoreComponent {
  id: string;
  scoreId: string;
  componentName: string;
  rawScore: number;
  weight: number;
  weightedScore: number;
  details: Record<string, unknown>;
}

export interface ScoreEvidence {
  id: string;
  scoreId: string;
  requirementId?: string;
  skillId?: string;
  evidenceText: string;
  matchType: string;
  evidenceLevel: string;
  rawScore: number;
  weight: number;
  contribution: number;
}

export interface RankingResult {
  id: string;
  jobId: string;
  candidateId: string;
  rank: number;
  scoreId: string;
  stage: RankingStage;
  rerankScore?: number;
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  modelVersion?: string;
  scoringVersion?: string;
  createdAt: Date;
}