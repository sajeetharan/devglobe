# DevGlobe Hacktoberfest promotion

## Positioning

Lead with a specific problem: finding a useful open-source issue without searching unrelated repositories. Send visitors directly to `/hacktoberfest`, not the globe.

The public matchmaker requires an existing, approved DevGlobe profile. It returns **up to three** open, unassigned, recently updated issues labeled `hacktoberfest`, matched to supported profile languages, with a contribution guide available. Availability varies; issues are not reserved.

DevGlobe is independent of Hacktoberfest. The [official website](https://hacktoberfest.com/) currently says pull requests no longer count toward rewards. Do not promise qualifying PRs, event credit, rewards, or official affiliation.

## Ready-to-post copy

### LinkedIn

Finding an open-source issue can take longer than getting started on it.

For Hacktoberfest, DevGlobe helps you discover up to three fresh, unassigned issues matched to the languages in your public DevGlobe profile, with contribution guidance available.

Enter your GitHub username. No sign-in or private repository access required.

Already on DevGlobe? Try it and tell me whether the matches are useful. If your profile is missing, choose "Add me to globe" on the homepage to submit it for approval.

https://www.devglobe.dev/hacktoberfest?utm_source=linkedin&utm_medium=social&utm_campaign=hacktoberfest-2026

An independent issue finder, not a guarantee of Hacktoberfest eligibility or rewards.

### X

Less issue searching, more contributing.

DevGlobe finds up to 3 Hacktoberfest-labeled issues matched to your DevGlobe languages. Existing profile required; no sign-in.

Try it: https://www.devglobe.dev/hacktoberfest?utm_source=x&utm_medium=social&utm_campaign=hacktoberfest-2026

### Community / Discord

I built a small issue finder for developers looking for open-source work this October.

If your GitHub profile is on DevGlobe, enter your username to get up to three open, unassigned Hacktoberfest-labeled issues matched to your languages. We check for recent updates and an available contribution guide.

It doesn't claim issues or guarantee event rewards. Please read the project's guide and coordinate with maintainers before starting.

I'd value feedback on match quality, especially empty or irrelevant results:
https://www.devglobe.dev/hacktoberfest?utm_source=discord&utm_medium=community&utm_campaign=hacktoberfest-2026

### GitHub discussion

Title: Find an open-source issue matched to your languages this October

DevGlobe's public Hacktoberfest matchmaker uses an existing DevGlobe profile to suggest up to three open, unassigned issues with contribution guidance. No sign-in is required.

Try it:
https://www.devglobe.dev/hacktoberfest?utm_source=github_discussions&utm_medium=community&utm_campaign=hacktoberfest-2026

Share feedback about relevance and availability. Matches are discovery suggestions, not official eligibility checks or issue reservations.

## Launch checklist

1. Deploy and verify matching with several approved profiles across supported languages. Do not promote while the API is returning unavailable or missing-container errors.
2. Check the mobile form, missing-profile path, empty state, and social preview.
3. Post a short screen recording: enter a username, inspect match reasons, open the repository's issue. Use real results with permission; do not fabricate testimonials or activity.
4. Post on your own LinkedIn and X accounts. Share in relevant communities only where promotion is permitted; avoid unsolicited bulk messages.
5. Follow up with useful discoveries and improvements, not repeated identical announcements.

## Measurement

Campaign links use the allow-listed `hacktoberfest-2026` value. The matchmaker records `site_visited` with acquisition source, channel, and the `hacktoberfest_matchmaker` journey. The homepage highlight and issue-opening actions carry the campaign value.

Compare visitors and sessions against the same hours on earlier days, then measure form submissions and issue opens. Distinct browser identifiers are tracked visitors, not verified people; analytics blocking reduces coverage. Browser custom events may not be captured before Application Insights finishes initializing; durable engagement ingestion is a separate source.

Use the confirmed website telemetry location: `AppPageViews` / `AppEvents` in `DefaultWorkspace-0caf9c40-8ea2-43b1-a54f-38c656a8e1f0-EUS`, scoped to the `devglobe-public-api` Application Insights resource and the `devglobe.dev` / `www.devglobe.dev` hosts. Do not substitute MCP callers for website users.

The homepage highlight appears during October 2026 (UTC), including the first-visit tour, and replaces the rotating activity strip in the same space. Outside October the existing activity strip returns. The matching route remains accessible.
