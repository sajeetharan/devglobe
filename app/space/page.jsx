import LiveDeveloperSpace from '../../components/LiveDeveloperSpace.jsx';

export const metadata = {
  title: "Who's coding right now | DevGlobe",
  description: 'See developers who have explicitly chosen to share their current coding presence on DevGlobe.',
  alternates: { canonical: '/space' },
};

export default function LiveDeveloperSpaceRoute() {
  return <LiveDeveloperSpace />;
}