import CodingStatsDashboard from '../../components/CodingStatsDashboard.jsx';

export const metadata = {
  title: 'Your coding activity | DevGlobe',
  description: 'Private coding-time totals collected from your opt-in DevGlobe presence heartbeats.',
  robots: { index: false, follow: false },
};

export default function CodingStatsPage() {
  return <CodingStatsDashboard />;
}