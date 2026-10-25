import { type Character } from './data';

/** Small, resolution-independent game pieces, shared by cards and the battlefield. */
export function CatSprite({ cat, className }: { cat: Character; className?: string }) {
  return (
    <svg viewBox="0 0 120 140" fill="none" aria-hidden="true" className={className}>
      <ellipse cx="59" cy="127" rx="33" ry="7" fill="#081322" opacity=".22" />
      <path d="M83 101Q116 104 104 78" stroke={cat.fur} strokeWidth="12" strokeLinecap="round" />
      <path d="M35 79L24 117Q58 134 91 116L79 78Z" fill={cat.accent} stroke="#29394b" strokeWidth="2.5" />
      <path d="M43 106L41 125M72 106L77 125" stroke={cat.fur} strokeWidth="14" strokeLinecap="round" />
      <ellipse cx="59" cy="96" rx="21" ry="22" fill={cat.fur} />
      <path d="M27 48L25 16L48 31Q61 26 76 32L97 17L92 53Q101 83 61 86Q20 84 27 48Z" fill={cat.fur} stroke="#29394b" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M31 26L34 45L44 36ZM90 27L78 37L88 46Z" fill="#dfa6a1" opacity=".65" />
      <ellipse cx="46" cy="57" rx="4" ry="6" fill="#25364a" /><ellipse cx="76" cy="57" rx="4" ry="6" fill="#25364a" />
      <circle cx="47" cy="55" r="1.5" fill="white" /><circle cx="77" cy="55" r="1.5" fill="white" />
      <path d="M57 65L62 69L66 65" fill="#ba7e7e" /><path d="M62 69Q57 77 52 71M62 69Q67 77 72 71" stroke="#604c4c" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M25 60L36 63M25 69L36 68M86 63L99 60M86 68L99 70" stroke="#7f7770" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M35 81Q61 94 86 80L81 91L49 96Z" fill={cat.accent} stroke="#29394b" strokeWidth="2" />
      {cat.role === 'guard' && <><path d="M19 88L41 82L55 93L49 116L33 127L17 113Z" fill={cat.accent} stroke="#e6ddb8" strokeWidth="4" /><path d="M34 91L34 115M25 101L43 101" stroke="#fff0c8" strokeWidth="3" /></>}
      {cat.role === 'fighter' && <><path d="M87 106L107 61L115 57L116 67L97 110Z" fill="#e9eee9" stroke="#415363" strokeWidth="2" /><path d="M83 102L104 111M90 109L86 120" stroke="#e9bf71" strokeWidth="5" strokeLinecap="round" /></>}
      {cat.role === 'ranger' && <><path d="M30 37L55 3L84 35Z" fill={cat.accent} stroke="#29394b" strokeWidth="2.5" /><path d="M21 38Q61 27 95 39" stroke={cat.accent} strokeWidth="9" strokeLinecap="round" /><path d="M99 119L99 57" stroke="#be9964" strokeWidth="5" strokeLinecap="round" /><path d="M99 39L103 50L115 53L104 60L101 72L94 61L83 56L94 50Z" fill="#ffe5a0" stroke="#bd9650" strokeWidth="2" /></>}
      {cat.role === 'healer' && <><path d="M38 31Q55 11 77 28Q61 43 38 31Z" fill="#70a779" /><path d="M98 120L98 66" stroke="#a28d63" strokeWidth="5" strokeLinecap="round" /><circle cx="98" cy="58" r="15" fill={cat.accent} stroke="#eef3cd" strokeWidth="3" /><path d="M98 49V67M89 58H107" stroke="#fff5db" strokeWidth="4" /></>}
      {cat.rarity === 5 && <path d="M57 81L61 75L65 81L72 82L67 87L67 94L61 91L55 94L55 87L50 82Z" fill="#ffe9a8" stroke="#b49148" />}
    </svg>
  );
}

export function ShadowSprite({ boss = false }: { boss?: boolean }) {
  return <svg viewBox="0 0 120 140" fill="none" aria-hidden="true">
    <ellipse cx="60" cy="128" rx="39" ry="7" fill="#090d1c" opacity=".25" />
    <path d="M22 122Q10 63 32 44L24 19L50 35Q65 30 78 38L100 22L94 53Q112 81 100 122L85 113L69 125L51 115L36 125Z" fill={boss ? '#756083' : '#927ea7'} stroke="#3b365a" strokeWidth="3" />
    <path d="M34 65L49 71M73 71L88 65" stroke="#f4d99d" strokeWidth="7" strokeLinecap="round" />
    <path d="M53 91L60 97L68 91" stroke="#463957" strokeWidth="4" strokeLinecap="round" />
    {boss && <path d="M35 35L30 9L50 22L62 4L74 22L93 9L88 35Z" fill="#e4b96a" stroke="#674a5b" strokeWidth="3" />}
  </svg>;
}
