#!/usr/bin/env node
import fs from 'fs';

const KEY = process.env.OPENAI_API_KEY;
const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

async function translatePerson(person) {
  const fields = { role: person.role, tagline: person.tagline, bio: person.bio, company_desc: person.company_desc };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `Translate these fields from Spanish to English. Keep proper nouns unchanged. Return JSON with keys: role_en, tagline_en, bio_en, company_desc_en.\n\n${JSON.stringify(fields)}`
      }]
    })
  });
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content);
}

const PARALLEL = 6;
for (let i = 0; i < data.people.length; i += PARALLEL) {
  const batch = data.people.slice(i, i + PARALLEL);
  const results = await Promise.allSettled(batch.map(p => translatePerson(p)));
  results.forEach((r, j) => {
    if (r.status === 'fulfilled') {
      Object.assign(batch[j], r.value);
      console.log(`✅ ${batch[j].name}`);
    } else {
      console.error(`❌ ${batch[j].name}: ${r.reason?.message}`);
    }
  });
}

fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
console.log(`\n✅ data.json updated`);
