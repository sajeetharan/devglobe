function fuseRankedResults(vectorResults = [], textResults = [], limit = 10) {
  const scores = new Map();
  const developers = new Map();
  const rankConstant = 60;

  for (const results of [vectorResults, textResults]) {
    results.forEach((developer, index) => {
      if (!developer?.login) return;
      scores.set(developer.login, (scores.get(developer.login) || 0) + 1 / (rankConstant + index + 1));
      developers.set(developer.login, developer);
    });
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([login]) => developers.get(login));
}

module.exports = { fuseRankedResults };
