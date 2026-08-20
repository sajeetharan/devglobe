export function resolveIdentityCardDeveloper(selectedDeveloper, user, developers = []) {
  if (selectedDeveloper) return selectedDeveloper;
  if (!user?.login) return null;

  const login = user.login.toLowerCase();
  return developers.find(developer => developer.login?.toLowerCase() === login) || {
    id: user.login,
    login: user.login,
    name: user.name || user.login,
    avatarUrl: user.avatarUrl,
  };
}
