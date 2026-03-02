#!/usr/bin/env node
// generate-media.js — DALL-E 3 images + Sora 2 videos for all people in data.json
// Videos are uploaded to GitHub Releases so they don't bloat the repo.
// Usage:
//   node generate-media.js --images-only
//   node generate-media.js --videos-only
//   node generate-media.js  (both)

import fs from 'fs';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) { console.error('❌ Missing OPENAI_API_KEY'); process.exit(1); }

const IMAGES_ONLY = process.argv.includes('--images-only');
const VIDEOS_ONLY = process.argv.includes('--videos-only');
const RELEASE_TAG  = 'v1-media';
const REPO         = 'gmilano/miniforo-ia';
const JOB_FILE     = 'sora-jobs.json';

// ─── PROMPT GENERATORS ─────────────────────────────────────────────────────

function industryContext(p) {
  const c = (p.company + ' ' + p.role).toLowerCase();
  if (c.includes('blockchain') || c.includes('decentraland') || c.includes('crypto')) return 'holographic blockchain nodes, decentralized web of light, purple and cyan';
  if (c.includes('fintech') || c.includes('dlocal') || c.includes('pagos') || c.includes('bank') || c.includes('itaú')) return 'flowing financial data currents, global payment network, emerald green and white';
  if (c.includes('mercadolibre') || c.includes('ecommerce') || c.includes('fenicio')) return 'digital marketplace constellation, connected commerce nodes, orange and blue';
  if (c.includes('globant')) return 'transformative technology galaxy, software architecture, vibrant green neon';
  if (c.includes('ai') || c.includes('ia') || c.includes('inteligencia')) return 'glowing neural network lattice, pulsing data streams, electric blue and gold';
  if (c.includes('genexus') || c.includes('low-code')) return 'self-writing code streams, automated software construction, teal and white';
  if (c.includes('zonamerica') || c.includes('corporación') || c.includes('aeropuerto')) return 'urban innovation campus, aerial business district at night, warm golden lights';
  if (c.includes('moda') || c.includes('chic') || c.includes('fashion')) return 'elegant fashion geometry, runway lights, rose gold and black';
  if (c.includes('publicidad') || c.includes('notable') || c.includes('marketing')) return 'creative burst of color, advertising energy, bold geometric shapes';
  if (c.includes('fútbol') || c.includes('deportivo') || c.includes('dfc') || p.id === 'diego-forlan') return 'champion golden aura, stadium lights, victory motion blur, World Cup energy';
  if (c.includes('contable') || c.includes('financiero') || c.includes('pittaluga')) return 'crystalline data structures, financial clarity, sapphire blue and silver';
  if (c.includes('kaszek') || c.includes('venture') || c.includes('kazah')) return 'startup ecosystem web, investment network, golden stars and capital flows';
  if (c.includes('ingenier') || c.includes('ciemsa')) return 'precision engineering blueprint, industrial innovation, steel blue and orange';
  if (c.includes('inmobili') || c.includes('joacamar')) return 'architectural blueprint transforms into modern building, city skyline, dawn light';
  return 'professional technology landscape, innovation abstract, dark blue and white light';
}

function imagePrompt(p) {
  const ctx = industryContext(p);
  return `Cinematic ultra-wide abstract visualization for a visionary business leader. ${ctx}. Dramatically lit dark background, volumetric light, futuristic, inspirational, professional. Motion and energy. Absolutely no text, no words, no letters, no faces, no people. Pure abstract concept art. Photorealistic digital art, 8K quality.`;
}

function videoPrompt(p) {
  const ctx = industryContext(p);
  return `Cinematic 5-second abstract visualization. ${ctx}. Slow dramatic camera movement through abstract energy fields. Dark background with volumetric light rays expanding outward. Ultra-HD, professional, inspirational. No people, no text, no faces.`;
}

// ─── HTTP HELPERS ───────────────────────────────────────────────────────────

async function openaiPost(endpoint, body) {
  const res = await fetch(`https://api.openai.com/v1${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err.slice(0,200)}`);
  }
  return res.json();
}

async function openaiGet(endpoint) {
  const res = await fetch(`https://api.openai.com/v1${endpoint}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function downloadUrl(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function downloadApiStream(endpoint, dest) {
  const res = await fetch(`https://api.openai.com/v1${endpoint}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  if (!res.ok) throw new Error(`Download ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── IMAGES ────────────────────────────────────────────────────────────────

async function generateImage(p) {
  const dest = `images/${p.id}.jpg`;
  if (fs.existsSync(dest)) { console.log(`  ✓ ${p.name}`); return dest; }
  console.log(`  🎨 Generating: ${p.name}...`);
  try {
    const result = await openaiPost('/images/generations', {
      model: 'dall-e-3', prompt: imagePrompt(p),
      size: '1792x1024', quality: 'standard', n: 1
    });
    await downloadUrl(result.data[0].url, dest);
    console.log(`  ✅ Saved: ${dest}`);
    await sleep(500);
    return dest;
  } catch(e) {
    console.error(`  ❌ Failed ${p.name}:`, e.message);
    return null;
  }
}

// ─── GITHUB RELEASE ────────────────────────────────────────────────────────

async function ensureRelease() {
  try {
    execSync(`gh release view ${RELEASE_TAG} --repo ${REPO}`, { stdio:'pipe' });
    console.log(`  📦 Release ${RELEASE_TAG} exists`);
  } catch {
    console.log(`  📦 Creating release ${RELEASE_TAG}...`);
    execSync(`gh release create ${RELEASE_TAG} --repo ${REPO} --title "Media Assets v1" --notes "DALL-E 3 images and Sora 2 videos" --prerelease`, { stdio:'pipe' });
  }
}

async function uploadToRelease(filePath, fileName) {
  // Delete existing asset first (ignore error)
  try { execSync(`gh release delete-asset ${RELEASE_TAG} ${fileName} --repo ${REPO} --yes`, { stdio:'pipe' }); } catch{}
  execSync(`gh release upload ${RELEASE_TAG} "${filePath}#${fileName}" --repo ${REPO} --clobber`, { stdio:'pipe' });
  return `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${encodeURIComponent(fileName)}`;
}

// ─── SORA JOBS ─────────────────────────────────────────────────────────────

function loadJobs() {
  return fs.existsSync(JOB_FILE) ? JSON.parse(fs.readFileSync(JOB_FILE,'utf8')) : {};
}
function saveJobs(jobs) { fs.writeFileSync(JOB_FILE, JSON.stringify(jobs,null,2)); }

async function submitSoraJobs(people) {
  const jobs = loadJobs();
  for (const p of people) {
    const dest = `videos/${p.id}.mp4`;
    if (fs.existsSync(dest)) { console.log(`  ✓ Video exists: ${p.name}`); continue; }
    if (jobs[p.id]?.jobId && !['failed','retry'].includes(jobs[p.id].status)) {
      console.log(`  ⏳ Queued: ${p.name} (${jobs[p.id].jobId})`); continue;
    }
    console.log(`  🎬 Submitting Sora: ${p.name}...`);
    try {
      const result = await openaiPost('/videos', { model: 'sora-2', prompt: videoPrompt(p) });
      jobs[p.id] = { jobId: result.id, name: p.name, status: 'pending' };
      saveJobs(jobs);
      console.log(`  📬 Job: ${result.id}`);
      await sleep(2000);
    } catch(e) {
      console.error(`  ❌ Submit failed ${p.name}:`, e.message);
      jobs[p.id] = { jobId: null, name: p.name, status: 'failed', error: e.message };
      saveJobs(jobs);
    }
  }
  return jobs;
}

async function pollAndDownload() {
  fs.mkdirSync('videos', { recursive: true });
  const data = JSON.parse(fs.readFileSync('data.json','utf8'));

  let jobs = loadJobs();
  let pending = () => Object.entries(jobs).filter(([,v]) => v.jobId && !['completed','failed'].includes(v.status));

  while (pending().length > 0) {
    console.log(`\n  🔄 Polling ${pending().length} jobs...`);
    for (const [id, job] of pending()) {
      const dest = `videos/${id}.mp4`;
      if (fs.existsSync(dest)) { job.status = 'completed'; saveJobs(jobs); continue; }
      try {
        const s = await openaiGet(`/videos/${job.jobId}`);
        job.status = s.status;
        job.progress = s.progress;
        const pct = s.progress ? Math.round(s.progress*100)+'%' : '';
        console.log(`  📊 ${job.name}: ${s.status} ${pct}`);

        if (['completed','ready'].includes(s.status)) {
          console.log(`  ⬇️  Downloading: ${job.name}...`);
          await downloadApiStream(`/videos/${job.jobId}/content`, dest);
          console.log(`  ✅ Saved: ${dest}`);
          // Update data.json with local path
          const person = data.people.find(x => x.id === id);
          if (person) { person.video = dest; }
          fs.writeFileSync('data.json', JSON.stringify(data,null,2));
          // Commit update
          try {
            execSync(`cd ${process.cwd()} && git add videos/${id}.mp4 data.json && git commit -m "feat: add Sora video for ${job.name}" && git push`, { stdio:'pipe' });
            console.log(`  🚀 Pushed`);
          } catch(e) { console.warn('  ⚠️  Git push failed:', e.message.slice(0,100)); }
          job.status = 'completed';
        } else if (s.status === 'failed') {
          job.status = 'failed';
          console.error(`  ❌ Sora failed: ${job.name}`);
        }
        saveJobs(jobs);
      } catch(e) {
        console.error(`  ⚠️  Poll error ${job.name}:`, e.message);
      }
      await sleep(500);
    }
    if (pending().length > 0) {
      console.log(`  💤 Waiting 30s (${pending().length} remaining)...`);
      await sleep(30000);
    }
  }
  console.log('  🎉 All Sora jobs done!');
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  const data = JSON.parse(fs.readFileSync('data.json','utf8'));
  console.log(`\n🚀 Mini Foro IA Media Generator — ${data.people.length} people\n`);
  fs.mkdirSync('images', { recursive: true });
  fs.mkdirSync('videos', { recursive: true });

  if (!VIDEOS_ONLY) {
    console.log('📸 IMAGES...');
    for (const p of data.people) await generateImage(p);
    // Update data.json image paths
    for (const p of data.people) { if (fs.existsSync(`images/${p.id}.jpg`)) p.image = `images/${p.id}.jpg`; }
    fs.writeFileSync('data.json', JSON.stringify(data,null,2));
    console.log('\n✅ Images done\n');
  }

  if (!IMAGES_ONLY) {
    console.log('🎬 SORA VIDEOS...');
    await submitSoraJobs(data.people);
    await pollAndDownload();
    console.log('\n✅ Videos done\n');
  }

  console.log('🏁 All done!');
}

main().catch(e => { console.error(e); process.exit(1); });
