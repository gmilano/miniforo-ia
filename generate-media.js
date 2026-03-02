#!/usr/bin/env node
// generate-media.js — Generate DALL-E 3 images + Sora 2 videos for all people in data.json
// Usage: OPENAI_API_KEY=sk-... node generate-media.js [--images-only] [--videos-only]

import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) { console.error('Missing OPENAI_API_KEY'); process.exit(1); }

const IMAGES_ONLY = process.argv.includes('--images-only');
const VIDEOS_ONLY = process.argv.includes('--videos-only');

const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
fs.mkdirSync('images', { recursive: true });
fs.mkdirSync('videos', { recursive: true });

// ─── PROMPT GENERATORS ─────────────────────────────────────────────────────

function industryContext(p) {
  const c = (p.company + ' ' + p.role).toLowerCase();
  if (c.includes('ai') || c.includes('ia') || c.includes('inteligencia')) return 'glowing neural network lattice, pulsing data streams, electric blue and gold';
  if (c.includes('blockchain') || c.includes('decentraland') || c.includes('crypto')) return 'holographic blockchain nodes, decentralized web of light, purple and cyan';
  if (c.includes('fintech') || c.includes('dlocal') || c.includes('pagos') || c.includes('bank') || c.includes('itaú')) return 'flowing financial data currents, global payment network, emerald green and white';
  if (c.includes('mercadolibre') || c.includes('ecommerce') || c.includes('fenicio')) return 'digital marketplace constellation, connected commerce nodes, orange and blue';
  if (c.includes('globant')) return 'transformative technology galaxy, software architecture, vibrant green neon';
  if (c.includes('zonamerica') || c.includes('corporación')) return 'urban innovation campus, aerial business district at night, warm golden lights';
  if (c.includes('moda') || c.includes('chic') || c.includes('fashion')) return 'elegant fashion geometry, runway lights, rose gold and black';
  if (c.includes('publicidad') || c.includes('notable') || c.includes('marketing')) return 'creative burst of color, advertising energy, bold geometric shapes';
  if (c.includes('fútbol') || c.includes('deportivo') || c.includes('dfc') || c.includes('forlán')) return 'champion golden aura, stadium lights, victory motion blur, World Cup energy';
  if (c.includes('contable') || c.includes('financiero')) return 'crystalline data structures, financial clarity, sapphire blue and silver';
  if (c.includes('genexus') || c.includes('low-code')) return 'self-writing code streams, automated software construction, teal and white';
  if (c.includes('kaszek') || c.includes('venture')) return 'startup ecosystem web, investment network, stars and capital flows';
  if (c.includes('ingenier') || c.includes('ciemsa')) return 'precision engineering blueprint, industrial innovation, steel blue and orange';
  return 'professional technology landscape, innovation abstract, dark blue and white light';
}

function imagePrompt(p) {
  const ctx = industryContext(p);
  return `Cinematic ultra-wide abstract visualization representing a visionary leader in ${p.role}. ${ctx}. Dramatically lit dark background. Futuristic, inspirational, professional. Motion and energy. Absolutely no text, no words, no letters, no faces, no people. Pure abstract concept art. Photorealistic digital art, 8K quality.`;
}

function videoPrompt(p) {
  const ctx = industryContext(p);
  return `Cinematic 5-second abstract visualization for a technology leader. ${ctx}. Slow dramatic camera movement through abstract landscapes. Dark background with volumetric light rays. Ultra-HD, professional, inspirational mood. No people, no text.`;
}

// ─── HELPERS ───────────────────────────────────────────────────────────────

async function openaiPost(endpoint, body) {
  const res = await fetch(`https://api.openai.com/v1${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function openaiGet(endpoint) {
  const res = await fetch(`https://api.openai.com/v1${endpoint}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function downloadUrl(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function downloadApiStream(endpoint, dest) {
  const res = await fetch(`https://api.openai.com/v1${endpoint}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── IMAGES ────────────────────────────────────────────────────────────────

async function generateImage(p) {
  const dest = `images/${p.id}.jpg`;
  if (fs.existsSync(dest)) {
    console.log(`  ✓ Image exists: ${p.name}`);
    return dest;
  }
  console.log(`  🎨 Generating image: ${p.name}...`);
  try {
    const result = await openaiPost('/images/generations', {
      model: 'dall-e-3',
      prompt: imagePrompt(p),
      size: '1792x1024',
      quality: 'standard',
      n: 1
    });
    const imageUrl = result.data[0].url;
    await downloadUrl(imageUrl, dest);
    console.log(`  ✅ Image saved: ${dest}`);
    await sleep(500); // rate limit buffer
    return dest;
  } catch(e) {
    console.error(`  ❌ Image failed for ${p.name}:`, e.message);
    return null;
  }
}

// ─── VIDEOS ────────────────────────────────────────────────────────────────

const JOB_FILE = 'sora-jobs.json';

function loadJobs() {
  if (fs.existsSync(JOB_FILE)) return JSON.parse(fs.readFileSync(JOB_FILE, 'utf8'));
  return {};
}

function saveJobs(jobs) {
  fs.writeFileSync(JOB_FILE, JSON.stringify(jobs, null, 2));
}

async function submitSoraJobs(people) {
  const jobs = loadJobs();
  for (const p of people) {
    const dest = `videos/${p.id}.mp4`;
    if (fs.existsSync(dest)) { console.log(`  ✓ Video exists: ${p.name}`); continue; }
    if (jobs[p.id] && jobs[p.id].status !== 'failed') {
      console.log(`  ⏳ Job already queued: ${p.name} (${jobs[p.id].jobId})`);
      continue;
    }
    console.log(`  🎬 Submitting Sora job: ${p.name}...`);
    try {
      const result = await openaiPost('/videos', { model: 'sora-2', prompt: videoPrompt(p) });
      jobs[p.id] = { jobId: result.id, name: p.name, status: 'pending' };
      saveJobs(jobs);
      console.log(`  📬 Job submitted: ${result.id}`);
      await sleep(1000);
    } catch(e) {
      console.error(`  ❌ Sora submit failed for ${p.name}:`, e.message);
      jobs[p.id] = { jobId: null, name: p.name, status: 'failed', error: e.message };
      saveJobs(jobs);
    }
  }
  return jobs;
}

async function pollSoraJobs() {
  const jobs = loadJobs();
  let pending = Object.entries(jobs).filter(([,v]) => v.jobId && v.status !== 'completed' && v.status !== 'failed');
  
  while (pending.length > 0) {
    console.log(`\n  🔄 Polling ${pending.length} pending jobs...`);
    for (const [id, job] of pending) {
      const dest = `videos/${id}.mp4`;
      if (fs.existsSync(dest)) { job.status = 'completed'; saveJobs(jobs); continue; }
      try {
        const status = await openaiGet(`/videos/${job.jobId}`);
        job.status = status.status;
        job.progress = status.progress;
        console.log(`  📊 ${job.name}: ${status.status} ${status.progress ? Math.round(status.progress*100)+'%' : ''}`);
        
        if (status.status === 'completed' || status.status === 'ready') {
          console.log(`  ⬇️  Downloading video: ${job.name}...`);
          await downloadApiStream(`/videos/${job.jobId}/content`, dest);
          job.status = 'completed';
          console.log(`  ✅ Video saved: ${dest}`);
        } else if (status.status === 'failed') {
          job.status = 'failed';
          console.error(`  ❌ Sora failed: ${job.name}`);
        }
        saveJobs(jobs);
      } catch(e) {
        console.error(`  ⚠️  Poll error for ${job.name}:`, e.message);
      }
    }
    pending = Object.entries(jobs).filter(([,v]) => v.jobId && v.status !== 'completed' && v.status !== 'failed');
    if (pending.length > 0) {
      console.log(`  💤 Waiting 30s before next poll (${pending.length} remaining)...`);
      await sleep(30000);
    }
  }
  console.log('  🎉 All Sora jobs done!');
}

// ─── UPDATE data.json ───────────────────────────────────────────────────────

function updateDataJson() {
  const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
  const jobs = fs.existsSync(JOB_FILE) ? JSON.parse(fs.readFileSync(JOB_FILE, 'utf8')) : {};
  
  for (const p of data.people) {
    const imgPath = `images/${p.id}.jpg`;
    const vidPath = `videos/${p.id}.mp4`;
    if (fs.existsSync(imgPath)) p.image = imgPath;
    if (fs.existsSync(vidPath)) p.video = vidPath;
  }
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
  console.log('✅ data.json updated with media paths');
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Mini Foro IA — Media Generator`);
  console.log(`   People: ${data.people.length}`);
  console.log(`   Mode: ${IMAGES_ONLY ? 'images only' : VIDEOS_ONLY ? 'videos only' : 'images + videos'}\n`);

  if (!VIDEOS_ONLY) {
    console.log('📸 GENERATING IMAGES...');
    for (const p of data.people) {
      await generateImage(p);
    }
    console.log('\n✅ Images done.\n');
  }

  if (!IMAGES_ONLY) {
    console.log('🎬 GENERATING SORA VIDEOS...');
    await submitSoraJobs(data.people);
    console.log('\n⏳ Polling for completion...\n');
    await pollSoraJobs();
    console.log('\n✅ Videos done.\n');
  }

  updateDataJson();
  console.log('\n🏁 All done! Now run: git add -A && git commit -m "media" && git push\n');
}

main().catch(console.error);
