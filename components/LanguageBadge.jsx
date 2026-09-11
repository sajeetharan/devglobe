import { Code2 } from 'lucide-react';
import {
  siC,
  siCplusplus,
  siDotnet,
  siGnubash,
  siGo,
  siHtml5,
  siJavascript,
  siJson,
  siKotlin,
  siMarkdown,
  siOpenjdk,
  siPhp,
  siPython,
  siRuby,
  siRust,
  siSwift,
  siTypescript,
  siYaml,
} from 'simple-icons';
import { getLanguageColor } from '../lib/language-colors.js';

const LANGUAGE_ICONS = new Map([
  ['c', siC],
  ['c#', siDotnet],
  ['c++', siCplusplus],
  ['go', siGo],
  ['html', siHtml5],
  ['java', siOpenjdk],
  ['javascript', siJavascript],
  ['json', siJson],
  ['kotlin', siKotlin],
  ['markdown', siMarkdown],
  ['php', siPhp],
  ['python', siPython],
  ['ruby', siRuby],
  ['rust', siRust],
  ['shell', siGnubash],
  ['swift', siSwift],
  ['typescript', siTypescript],
  ['yaml', siYaml],
]);

export default function LanguageBadge({ language }) {
  const label = language || 'Language not shared';
  const color = getLanguageColor(language);
  const icon = LANGUAGE_ICONS.get(label.toLowerCase());

  return (
    <span className="language-badge" style={{ color }}>
      {icon ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={icon.path} fill="currentColor" />
        </svg>
      ) : (
        <Code2 aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}
