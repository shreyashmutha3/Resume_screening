const fs = require('fs');
const { InMemoryResumeScreenerStore } = require('./dist/persistence/inMemoryStore.js');
const store = new InMemoryResumeScreenerStore();

async function run() {
  const job = await store.createJob({
    orgId: "demo-org",
    createdBy: "demo-user",
    title: "Software Engineer",
    description: "Must know Python and React.",
    jobType: "FULL_TIME",
    domain: "Engineering"
  });

  const res = await store.ingestResume({
    candidateId: "Alice",
    jobId: job.job.id,
    filePath: "test.pdf",
    fileType: "application/pdf",
    rawText: "",
    fileData: Buffer.from("Alice knows Python, React, and Java. She has 5 years of experience.").toString("base64")
  }, { orgId: "demo-org", userId: "demo-user" });

  console.log("Score:", res.score.candidateScore.overallScore);
  console.log("Evidence:", JSON.stringify(res.score.scoreEvidence, null, 2));
}

run().catch(console.error);
