import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getSiteUrl } from '../../../../lib/site.js';

export async function GET() {
  const skill = await fs.readFile(
    path.join(process.cwd(), '.agents', 'skills', 'devglobe', 'SKILL.md'),
    'utf8',
  );
  const digest = createHash('sha256').update(skill).digest('hex');
  return Response.json({
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [
      {
        name: 'devglobe',
        type: 'skill-md',
        description: 'The open-source talent graph for humans and AI agents. Discover public profiles and request consent-gated introductions.',
        url: `${getSiteUrl()}/.well-known/agent-skills/devglobe/SKILL.md`,
        digest: `sha256:${digest}`,
      },
    ],
  }, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}