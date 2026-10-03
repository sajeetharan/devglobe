import HacktoberfestMatchmaker from '../../components/HacktoberfestMatchmaker.jsx';

export const metadata = {
  title: 'Hacktoberfest Matchmaker | DevGlobe',
  description: 'Find up to three fresh, unassigned Hacktoberfest-labeled issues using your DevGlobe profile or guest language and task preferences. No sign-in required.',
  alternates: { canonical: '/hacktoberfest' },
  openGraph: {
    title: 'Find your Hacktoberfest matches | DevGlobe',
    description: 'Discover up to three issues using your profile or guest preferences, with task badges and contribution guides. No sign-in required.',
    url: '/hacktoberfest',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Find your next open-source contribution | DevGlobe',
    description: 'Hacktoberfest-labeled issues matched to your profile or guest preferences. No sign-in required.',
    images: ['/hacktoberfest/opengraph-image'],
  },
};

export default function HacktoberfestPage() {
  return <HacktoberfestMatchmaker />;
}