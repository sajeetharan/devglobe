import LeaderboardPage from '../../components/LeaderboardPage.jsx';

export const metadata = {
  title: 'Open-source impact leaderboard | DevGlobe',
  description: 'Explore developers ranked by transparent, dataset-relative open-source impact across GitHub and Stack Overflow.',
  alternates: { canonical: '/leaderboard' },
};

export default function LeaderboardRoute() {
  return <LeaderboardPage />;
}