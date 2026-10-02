import HacktoberfestMatchmaker from '../../components/HacktoberfestMatchmaker.jsx';

export const metadata = {
  title: 'Hacktoberfest Matchmaker | DevGlobe',
  description: 'Find up to three fresh, unassigned Hacktoberfest-labeled issues matched to your DevGlobe language profile. No sign-in required.',
  alternates: { canonical: '/hacktoberfest' },
  openGraph: {
    title: 'Find your Hacktoberfest matches | DevGlobe',
    description: 'Less searching. More contributing. Discover up to three issues matched to your DevGlobe language profile, without signing in.',
    url: '/hacktoberfest',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Find your next open-source contribution | DevGlobe',
    description: 'Hacktoberfest-labeled issues matched to your public DevGlobe language profile. No sign-in required.',
    images: ['/hacktoberfest/opengraph-image'],
  },
};

export default function HacktoberfestPage() {
  return <HacktoberfestMatchmaker />;
}