// Global State
let currentJobId = null;

// Navigation
function loadView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navBtn = Array.from(document.querySelectorAll('.nav-item')).find(el => el.textContent.trim().toLowerCase() === viewId);
    if(navBtn) navBtn.classList.add('active');

    if (viewId === 'jobs') {
        fetchJobs();
    }
}

// Modals
function showCreateJobModal() {
    document.getElementById('modal-create-job').classList.add('active');
}

function showIngestResumeModal() {
    document.getElementById('modal-ingest-resume').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// API Calls
async function fetchJobs() {
    try {
        const res = await fetch('/jobs', { headers: { 'x-org-id': 'demo-org' } });
        const data = await res.json();
        
        const grid = document.getElementById('jobs-list');
        grid.innerHTML = '';
        
        data.jobs.forEach((job, index) => {
            const card = document.createElement('div');
            card.className = 'job-card glass animate-up';
            card.style = `--delay: ${index * 0.1}s`;
            card.innerHTML = `
                <h3>${job.title}</h3>
                <p>${job.domain || 'Engineering'}</p>
                <span class="badge">${job.status}</span>
            `;
            card.onclick = () => loadJobDetails(job.id);
            grid.appendChild(card);
        });

        document.getElementById('total-jobs').innerText = data.jobs.length;
    } catch (err) {
        console.error(err);
    }
}

async function createJob() {
    const btn = document.getElementById('btn-create-job');
    btn.classList.add('loading');
    
    const title = document.getElementById('job-title').value;
    const description = document.getElementById('job-description').value;

    try {
        await fetch('/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-org-id': 'demo-org', 'x-user-id': 'demo-user', 'x-user-role': 'RECRUITER' },
            body: JSON.stringify({
                title,
                description,
                jobType: 'FULL_TIME',
                domain: 'engineering',
                requirements: [] // Trigger Gemini parsing
            })
        });
        
        closeModal('modal-create-job');
        document.getElementById('job-title').value = '';
        document.getElementById('job-description').value = '';
        fetchJobs();
    } catch (err) {
        alert("Failed to create job.");
    } finally {
        btn.classList.remove('loading');
    }
}

async function loadJobDetails(jobId) {
    currentJobId = jobId;
    loadView('job-details');
    
    try {
        const res = await fetch(`/jobs/${jobId}`, { headers: { 'x-org-id': 'demo-org' } });
        const data = await res.json();
        
        const container = document.getElementById('job-details-container');
        container.innerHTML = `
            <h2>${data.job.title}</h2>
            <p style="color: var(--text-muted)">${data.job.description || 'No description provided.'}</p>
            <div class="req-list">
                ${data.requirements.map(req => `
                    <div class="req-item">
                        <span>${req.rawText}</span>
                        <span class="req-important" style="color: ${req.importance === 'MANDATORY' ? 'var(--danger)' : 'var(--accent)'}">${req.importance}</span>
                    </div>
                `).join('')}
            </div>
        `;

        fetchRankings(jobId);
    } catch (err) {
        console.error(err);
    }
}

async function fetchRankings(jobId) {
    try {
        const res = await fetch(`/jobs/${jobId}/resumes`, { headers: { 'x-org-id': 'demo-org' } });
        const data = await res.json(); // Wait, the backend doesn't return rankings on this route. Let's adjust based on what we have.
        // Actually, we can fetch from /jobs/:jobId snapshot for rankings
        const snapshotRes = await fetch(`/jobs/${jobId}`, { headers: { 'x-org-id': 'demo-org' } });
        const snapshot = await snapshotRes.json();
        
        const list = document.getElementById('candidate-list');
        list.innerHTML = '';
        
        if (!snapshot.rankings || snapshot.rankings.length === 0) {
            list.innerHTML = '<p style="color: var(--text-muted)">No candidates yet.</p>';
            return;
        }

        snapshot.rankings.forEach(rank => {
            const el = document.createElement('div');
            el.className = 'candidate-row animate-up';
            const scoreColor = rank.rerankScore > 0.8 ? 'var(--accent)' : (rank.rerankScore > 0.5 ? '#f59e0b' : 'var(--danger)');
            
            el.innerHTML = `
                <div>
                    <h4>Candidate ${rank.candidateId}</h4>
                    <p style="color: var(--text-muted); font-size: 0.85rem">Stage: ${rank.stage}</p>
                </div>
                <div class="score-circle" style="color: ${scoreColor}; border: 2px solid ${scoreColor}; box-shadow: 0 0 15px ${scoreColor}40">
                    ${Math.round(rank.rerankScore ? rank.rerankScore * 100 : 0)}
                </div>
            `;
            list.appendChild(el);
        });
    } catch (err) {
        console.error(err);
    }
}

async function ingestResume() {
    const btn = document.getElementById('btn-ingest-resume');
    const candidateId = document.getElementById('candidate-name').value;
    const fileInput = document.getElementById('resume-file');
    
    if (!fileInput.files.length) {
        alert("Please select a file to upload.");
        return;
    }
    
    const file = fileInput.files[0];
    btn.classList.add('loading');

    try {
        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });

        await fetch(`/jobs/${currentJobId}/resumes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-org-id': 'demo-org', 'x-user-id': 'demo-user', 'x-user-role': 'RECRUITER' },
            body: JSON.stringify({
                candidateId,
                fileName: file.name,
                fileType: file.type || 'application/octet-stream',
                fileData: base64Data
            })
        });
        
        closeModal('modal-ingest-resume');
        document.getElementById('candidate-name').value = '';
        fileInput.value = '';
        fetchRankings(currentJobId);
    } catch (err) {
        alert("Failed to score resume.");
    } finally {
        btn.classList.remove('loading');
    }
}

// Initial Load
fetchJobs();
