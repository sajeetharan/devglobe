export function enrichWithCollaborators(developers) {
  if (!Array.isArray(developers) || developers.length === 0) {
    return [];
  }

  // 1. Build a lookup: normalized repo name -> array of { dev, originalRepoName }
  const repoIndex = new Map();

  for (const dev of developers) {
    if (!dev || !dev.login) continue;
    const repos = Array.isArray(dev.topRepos) ? dev.topRepos : [];
    
    for (const r of repos) {
      const repoName = typeof r === 'string' ? r : r?.name;
      if (!repoName || typeof repoName !== 'string') continue;
      const normalized = repoName.trim().toLowerCase();
      if (!normalized) continue;

      if (!repoIndex.has(normalized)) {
        repoIndex.set(normalized, []);
      }
      repoIndex.get(normalized).push({
        login: dev.login,
        originalName: repoName.trim(),
        dev,
      });
    }
  }

  // 2. For each developer, find their top collaborators
  return developers.map(dev => {
    if (!dev || !dev.login) return dev;
    
    // If dev already has pre-computed collaborators and it's valid, keep it unless we want to rebuild
    const repos = Array.isArray(dev.topRepos) ? dev.topRepos : [];
    const collabMap = new Map(); // login -> { dev, sharedRepos: Set }

    for (const r of repos) {
      const repoName = typeof r === 'string' ? r : r?.name;
      if (!repoName || typeof repoName !== 'string') continue;
      const normalized = repoName.trim().toLowerCase();
      
      const contributors = repoIndex.get(normalized) || [];
      for (const entry of contributors) {
        if (entry.login.toLowerCase() === dev.login.toLowerCase()) continue;

        if (!collabMap.has(entry.login)) {
          collabMap.set(entry.login, {
            dev: entry.dev,
            sharedRepos: [],
          });
        }
        const record = collabMap.get(entry.login);
        if (!record.sharedRepos.includes(entry.originalName)) {
          record.sharedRepos.push(entry.originalName);
        }
      }
    }

    // Rank collaborators: by number of shared repos desc, then by score/stars desc
    const rankedCollabs = Array.from(collabMap.values())
      .sort((a, b) => {
        if (b.sharedRepos.length !== a.sharedRepos.length) {
          return b.sharedRepos.length - a.sharedRepos.length;
        }
        const scoreA = a.dev.score || a.dev.totalStars || 0;
        const scoreB = b.dev.score || b.dev.totalStars || 0;
        return scoreB - scoreA;
      })
      .slice(0, 5)
      .map(entry => ({
        login: entry.dev.login,
        name: entry.dev.name || entry.dev.login,
        avatarUrl: entry.dev.avatarUrl,
        repo: entry.sharedRepos[0] || '',
        sharedRepos: entry.sharedRepos,
        lat: entry.dev.lat ?? null,
        lng: entry.dev.lng ?? null,
        score: entry.dev.score ?? 0,
        location: entry.dev.location || 'Unknown',
      }));

    return {
      ...dev,
      collaborators: rankedCollabs,
    };
  });
}
