import 'dotenv/config';
import { verifyGitHubOAuthCredentials } from '../lib/github-oauth-health.js';

try {
  const result = await verifyGitHubOAuthCredentials({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  });
  if (!result.valid) {
    console.error('GitHub rejected the configured OAuth client credentials.');
    process.exitCode = 1;
  } else {
    console.log('GitHub OAuth client credentials are recognized.');
  }
} catch (error) {
  console.error(`GitHub OAuth health check failed: ${error.message}`);
  process.exitCode = 1;
}