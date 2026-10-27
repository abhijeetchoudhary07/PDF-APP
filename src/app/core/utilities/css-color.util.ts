/**
 * CSS colour parsing, shared by the SVG converters.
 *
 * The old parser understood hex and four names, and returned black for
 * everything else. `fill="rgb(37,99,235)"` or `fill="tomato"` silently became
 * black, which is worse than failing: the file converts and looks wrong.
 */

export interface Rgba {
  r: number; // 0-1, as pdf-lib wants
  g: number;
  b: number;
  a: number; // 0-1
}

/** The CSS named colours, which SVG inherits wholesale. */
const NAMED_COLORS: Record<string, string> = {
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4',
  azure: 'f0ffff', beige: 'f5f5dc', bisque: 'ffe4c4', black: '000000',
  blanchedalmond: 'ffebcd', blue: '0000ff', blueviolet: '8a2be2', brown: 'a52a2a',
  burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00', chocolate: 'd2691e',
  coral: 'ff7f50', cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c',
  cyan: '00ffff', darkblue: '00008b', darkcyan: '008b8b', darkgoldenrod: 'b8860b',
  darkgray: 'a9a9a9', darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b',
  darkmagenta: '8b008b', darkolivegreen: '556b2f', darkorange: 'ff8c00',
  darkorchid: '9932cc', darkred: '8b0000', darksalmon: 'e9967a', darkseagreen: '8fbc8f',
  darkslateblue: '483d8b', darkslategray: '2f4f4f', darkslategrey: '2f4f4f',
  darkturquoise: '00ced1', darkviolet: '9400d3', deeppink: 'ff1493',
  deepskyblue: '00bfff', dimgray: '696969', dimgrey: '696969', dodgerblue: '1e90ff',
  firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22', fuchsia: 'ff00ff',
  gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff', gold: 'ffd700', goldenrod: 'daa520',
  gray: '808080', green: '008000', greenyellow: 'adff2f', grey: '808080',
  honeydew: 'f0fff0', hotpink: 'ff69b4', indianred: 'cd5c5c', indigo: '4b0082',
  ivory: 'fffff0', khaki: 'f0e68c', lavender: 'e6e6fa', lavenderblush: 'fff0f5',
  lawngreen: '7cfc00', lemonchiffon: 'fffacd', lightblue: 'add8e6',
  lightcoral: 'f08080', lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2',
  lightgray: 'd3d3d3', lightgreen: '90ee90', lightgrey: 'd3d3d3', lightpink: 'ffb6c1',
  lightsalmon: 'ffa07a', lightseagreen: '20b2aa', lightskyblue: '87cefa',
  lightslategray: '778899', lightslategrey: '778899', lightsteelblue: 'b0c4de',
  lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32', linen: 'faf0e6',
  magenta: 'ff00ff', maroon: '800000', mediumaquamarine: '66cdaa',
  mediumblue: '0000cd', mediumorchid: 'ba55d3', mediumpurple: '9370db',
  mediumseagreen: '3cb371', mediumslateblue: '7b68ee', mediumspringgreen: '00fa9a',
  mediumturquoise: '48d1cc', mediumvioletred: 'c71585', midnightblue: '191970',
  mintcream: 'f5fffa', mistyrose: 'ffe4e1', moccasin: 'ffe4b5', navajowhite: 'ffdead',
  navy: '000080', oldlace: 'fdf5e6', olive: '808000', olivedrab: '6b8e23',
  orange: 'ffa500', orangered: 'ff4500', orchid: 'da70d6', palegoldenrod: 'eee8aa',
  palegreen: '98fb98', paleturquoise: 'afeeee', palevioletred: 'db7093',
  papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f', pink: 'ffc0cb',
  plum: 'dda0dd', powderblue: 'b0e0e6', purple: '800080', rebeccapurple: '663399',
  red: 'ff0000', rosybrown: 'bc8f8f', royalblue: '4169e1', saddlebrown: '8b4513',
  salmon: 'fa8072', sandybrown: 'f4a460', seagreen: '2e8b57', seashell: 'fff5ee',
  sienna: 'a0522d', silver: 'c0c0c0', skyblue: '87ceeb', slateblue: '6a5acd',
  slategray: '708090', slategrey: '708090', snow: 'fffafa', springgreen: '00ff7f',
  steelblue: '4682b4', tan: 'd2b48c', teal: '008080', thistle: 'd8bfd8',
  tomato: 'ff6347', turquoise: '40e0d0', violet: 'ee82ee', wheat: 'f5deb3',
  white: 'ffffff', whitesmoke: 'f5f5f5', yellow: 'ffff00', yellowgreen: '9acd32'
};

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360 / 360;
  const sat = clamp01(s);
  const light = clamp01(l);
  if (sat === 0) return [light, light, light];

  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const channel = (t: number) => {
    let temp = t;
    if (temp < 0) temp += 1;
    if (temp > 1) temp -= 1;
    if (temp < 1 / 6) return p + (q - p) * 6 * temp;
    if (temp < 1 / 2) return q;
    if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
    return p;
  };
  return [channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)];
}

/**
 * Parses any CSS colour SVG can carry. Returns null for `none`, for
 * `url(#gradient)` references and for anything unrecognised, so callers can
 * tell "not painted" and "could not be represented" apart from black.
 */
export function parseCssColor(input: string | null | undefined): Rgba | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (!value || value === 'none' || value === 'transparent') return null;
  if (value.startsWith('url(')) return null;

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const expand = (c: string) => parseInt(c + c, 16) / 255;
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: expand(hex[0]),
        g: expand(hex[1]),
        b: expand(hex[2]),
        a: hex.length === 4 ? expand(hex[3]) : 1
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      const pair = (i: number) => parseInt(hex.substring(i, i + 2), 16) / 255;
      const parsed = {
        r: pair(0),
        g: pair(2),
        b: pair(4),
        a: hex.length === 8 ? pair(6) : 1
      };
      return Number.isNaN(parsed.r + parsed.g + parsed.b + parsed.a) ? null : parsed;
    }
    return null;
  }

  const functional = value.match(/^(rgba?|hsla?)\s*\(([^)]*)\)$/);
  if (functional) {
    const name = functional[1];
    // Both comma and space separated forms are legal, and `/` precedes alpha.
    const parts = functional[2]
      .replace(/\//g, ' ')
      .split(/[\s,]+/)
      .filter(part => part.length > 0);
    const component = (raw: string, scale: number): number => {
      if (raw.endsWith('%')) return (parseFloat(raw) / 100) * scale;
      return parseFloat(raw);
    };

    if (name.startsWith('rgb')) {
      if (parts.length < 3) return null;
      const r = component(parts[0], 255) / 255;
      const g = component(parts[1], 255) / 255;
      const b = component(parts[2], 255) / 255;
      const a = parts.length > 3 ? component(parts[3], 1) : 1;
      if ([r, g, b, a].some(n => Number.isNaN(n))) return null;
      return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
    }

    if (parts.length < 3) return null;
    const hue = parseFloat(parts[0]);
    const sat = component(parts[1], 1);
    const light = component(parts[2], 1);
    const alpha = parts.length > 3 ? component(parts[3], 1) : 1;
    if ([hue, sat, light, alpha].some(n => Number.isNaN(n))) return null;
    const [r, g, b] = hslToRgb(hue, sat, light);
    return { r, g, b, a: clamp01(alpha) };
  }

  const named = NAMED_COLORS[value];
  if (named) {
    const pair = (i: number) => parseInt(named.substring(i, i + 2), 16) / 255;
    return { r: pair(0), g: pair(2), b: pair(4), a: 1 };
  }

  return null;
}

/** Same, but falls back to black for a value that should paint something. */
export function parseCssColorOrBlack(input: string | null | undefined): Rgba {
  return parseCssColor(input) ?? BLACK;
}

/** True when a paint value points at a gradient or pattern definition. */
export function isPaintReference(input: string | null | undefined): boolean {
  return !!input && input.trim().toLowerCase().startsWith('url(');
}

/** Pulls the id out of `url(#name)`. */
export function paintReferenceId(input: string): string | null {
  const match = input.match(/url\(\s*['"]?#([^'")\s]+)/i);
  return match ? match[1] : null;
}

/**
 * CSS length to user units. SVG allows px, pt, pc, mm, cm, in and unitless
 * values; percentages need a reference length the caller supplies.
 */
export function parseCssLength(
  input: string | null | undefined,
  percentBasis = 0
): number | null {
  if (input === null || input === undefined) return null;
  const value = String(input).trim().toLowerCase();
  if (!value) return null;

  const match = value.match(/^([+-]?[\d.]+(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in|em|rem|%)?$/);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  if (Number.isNaN(amount)) return null;

  switch (match[2]) {
    case 'in': return amount * 96;
    case 'cm': return amount * (96 / 2.54);
    case 'mm': return amount * (96 / 25.4);
    case 'pt': return amount * (96 / 72);
    case 'pc': return amount * 16;
    case 'em':
    case 'rem': return amount * 16;
    case '%': return (amount / 100) * percentBasis;
    default: return amount;
  }
}
