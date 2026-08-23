import HacktoberfestMatchmaker from '../../components/HacktoberfestMatchmaker.jsx';

export const metadata = {
  title: 'Hacktoberfest Matchmaker | DevGlobe',
  description: 'Enter your GitHub username and find contribution-ready Hacktoberfest issues matched to your public DevGlobe profile.',
  alternates: { canonical: '/hacktoberfest' },
  openGraph: {
    title: 'Find your Hacktoberfest matches | DevGlobe',
    description: 'Three fresh, unassigned Hacktoberfest issues matched to your languages.',
    url: '/hacktoberfest',
  },
};

export default function HacktoberfestPage() {
  return <HacktoberfestMatchmaker />;
}