export default function manifest() {
  return {
    name: 'DevGlobe - Open-Source Talent Graph',
    short_name: 'DevGlobe',
    description: 'The open-source talent graph for humans and AI agents. Discover and compare developers by expertise, location, language, rankings, and contributions.',
    start_url: '/',
    display: 'standalone',
    background_color: '#080b10',
    theme_color: '#080b10',
    categories: ['developer tools', 'social', 'productivity'],
    icons: [
      {
        src: '/devglobe.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  };
}