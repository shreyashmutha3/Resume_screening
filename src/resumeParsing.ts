const skillLexicon = [
  "typescript",
  "node.js",
  "nodejs",
  "postgresql",
  "sql",
  "react",
  "javascript",
  "python",
  "mongodb",
  "docker",
  "aws",
  "git",
  "api",
  "testing",
  "system design",
];

const sectionMatchers = [
  { name: "skills", pattern: /^(skills?|technical skills?|technologies)$/i },
  { name: "experience", pattern: /^(experience|work experience|employment)$/i },
  { name: "projects", pattern: /^(projects?|selected projects)$/i },
  { name: "education", pattern: /^(education|academics)$/i },
];

export interface ParsedResumeText {
  sectionLines: Record<string, string[]>;
  detectedSkills: string[];
  summary: string;
}

export function parseResumeText(rawText: string): ParsedResumeText {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sectionLines: Record<string, string[]> = {
    skills: [],
    experience: [],
    projects: [],
    education: [],
    other: [],
  };

  let currentSection = "other";

  for (const line of lines) {
    const matchedSection = sectionMatchers.find(({ pattern }) => pattern.test(line));

    if (matchedSection) {
      currentSection = matchedSection.name;
      continue;
    }

    sectionLines[currentSection] = sectionLines[currentSection] ?? [];
    sectionLines[currentSection].push(stripBullet(line));
  }

  const normalizedText = rawText.toLowerCase();
  const detectedSkills = skillLexicon.filter((skill) =>
    normalizedText.includes(skill.toLowerCase()),
  );

  const summary = [
    summarizeSection(sectionLines.skills, "skills"),
    summarizeSection(sectionLines.experience, "experience"),
    summarizeSection(sectionLines.projects, "projects"),
    summarizeSection(sectionLines.education, "education"),
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    sectionLines,
    detectedSkills,
    summary: summary || "Unstructured resume text",
  };
}

function stripBullet(value: string): string {
  return value.replace(/^[-*•\u2022]+\s*/, "").trim();
}

function summarizeSection(lines: string[] | undefined, label: string): string {
  if (!lines || lines.length === 0) {
    return "";
  }

  return `${label}: ${lines.slice(0, 2).join("; ")}`;
}