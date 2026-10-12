/** Opaque RGB colors only. Transparent semantic tokens are shown without a guessed ratio. */
export function colorContrast(foreground: string, background: string): number | null {
  const parse = (value: string): number[] | null => {
    const short = /^#([\da-f]{3})$/i.exec(value.trim());
    const normalized = short ? `#${short[1].split('').map(char => char + char).join('')}` : value.trim();
    const hex = /^#([\da-f]{6})$/i.exec(normalized);
    if (hex) return [0, 2, 4].map(index => parseInt(hex[1].slice(index, index + 2), 16));
    const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(value.trim());
    return rgb ? rgb.slice(1).map(Number) : null;
  };
  const luminance = (rgb: number[]) => rgb.map(value => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  }).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
  const fg = parse(foreground), bg = parse(background);
  if (!fg || !bg) return null;
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
