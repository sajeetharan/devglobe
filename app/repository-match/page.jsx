import RepositoryMatchTool from '../../components/RepositoryMatchTool.jsx';

export const metadata = {
  title: 'Repository Match Report | DevGlobe',
  description: 'Match a public GitHub repository with relevant developers using public contribution, language, and topic evidence.',
  alternates: { canonical: '/repository-match' },
  openGraph: {
    title: 'Build a repository match report | DevGlobe',
    description: 'Find evidence-backed developer matches for any public GitHub repository.',
    url: '/repository-match',
  },
};

export default function RepositoryMatchPage() {
  return <RepositoryMatchTool />;
}