import LiveDeveloperSpace from '../../components/LiveDeveloperSpace.jsx';

export const metadata = {
  title: 'Developers coding worldwide | DevGlobe',
  description: 'See developers who have explicitly chosen to share live and recent coding presence on DevGlobe.',
  alternates: { canonical: '/space' },
};

export default function LiveDeveloperSpaceRoute() {
  return <LiveDeveloperSpace />;
}