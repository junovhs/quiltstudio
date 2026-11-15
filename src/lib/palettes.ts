/* Colour presets for the random quilt generator: a few classic quilting colour stories,
 * five fabrics each, light to dark. The generator decides which fabric plays light, medium,
 * dark and accent, so the order here doesn't matter. */
import type { Doc, Fabric } from './model';

export interface Palette { id: string; name: string; colors: [string, string][] }

export const PALETTES: Palette[] = [
  { id: 'americana', name: 'Americana', colors: [['Muslin', '#f4ecd8'], ['Wheat', '#d9b56b'], ['Denim', '#5a7aa8'], ['Barn red', '#a8322d'], ['Navy', '#1f2f55']] },
  { id: 'indigo', name: 'Indigo', colors: [['Undyed', '#f2f0ea'], ['Pale indigo', '#c9d6e8'], ['Mid indigo', '#6d8fbf'], ['Indigo', '#2c4a7c'], ['Deep indigo', '#14213d']] },
  { id: 'farmhouse', name: 'Farmhouse', colors: [['Linen', '#f5efe3'], ['Oat', '#d8cbb3'], ['Khaki', '#a99377'], ['Walnut', '#6b5a48'], ['Charcoal', '#2f2a26']] },
  { id: 'scandi', name: 'Scandi', colors: [['Snow', '#fbfaf6'], ['Mint', '#cfe7dc'], ['Sage', '#8cc5b0'], ['Coral', '#f2a48c'], ['Slate', '#3a4a48']] },
  { id: 'harvest', name: 'Harvest', colors: [['Cream', '#f3e6cf'], ['Mustard', '#e3a857'], ['Rust', '#c4602d'], ['Plum', '#7a3b2e'], ['Olive', '#3c4a2f']] },
  { id: 'amish', name: 'Amish', colors: [['Black', '#1b1b1b'], ['Plum', '#6a2c70'], ['Cranberry', '#b83b5e'], ['Teal', '#2f7f86'], ['Cornflower', '#6f9fd8']] },
  { id: 'blush', name: 'Blush & Sage', colors: [['Ivory', '#fbf4ef'], ['Blush', '#f2c9c0'], ['Rose', '#d98f86'], ['Sage', '#9db49c'], ['Forest', '#4d5d4a']] },
  { id: 'ocean', name: 'Seaside', colors: [['Sea foam', '#f1f7f8'], ['Aqua', '#a8dadc'], ['Harbor', '#457b9d'], ['Navy', '#1d3557'], ['Buoy red', '#e63946']] },
  { id: 'brights', name: 'Brights', colors: [['White', '#ffffff'], ['Sunshine', '#ffcf3d'], ['Watermelon', '#ff6b6b'], ['Jade', '#3fb6a8'], ['Ink', '#3b3b98']] },
  { id: 'mono', name: 'Monochrome', colors: [['White', '#f7f7f5'], ['Silver', '#cfcfcc'], ['Grey', '#8a8a87'], ['Charcoal', '#3d3d3b'], ['Black', '#111111']] },
  { id: 'candy', name: 'Candy', colors: [['Cream', '#f6f1e4'], ['Bubblegum', '#f4a7c7'], ['Lilac', '#c9b3e6'], ['Tangerine', '#f39a3c'], ['Lemon', '#f4d35e'], ['Kelly', '#1f9e6e'], ['Cobalt', '#3a52c4'], ['Liquorice', '#222222']] },
  { id: 'sunflower', name: 'Sunflower', colors: [['Butter', '#fffbea'], ['Sunflower', '#ffd23f'], ['Apricot', '#f4a261'], ['Bark', '#6b4f2a'], ['Deep teal', '#264653']] },
];

/** the quilt with its fabrics swapped for a palette's */
export function withPalette(doc: Doc, id: string | null): Doc {
  const p = PALETTES.find(p => p.id === id);
  if (!p) return doc;
  const fabrics: Fabric[] = p.colors.map(([name, color], i) => ({ id: `${p.id}${i}`, name, color, tile: 6 }));
  const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
  // binding in the darkest colour, as its own fabric so the quilt can still use that colour
  const darkest = fabrics.toSorted((a, b) => lum(a.color) - lum(b.color))[0];
  const binding: Fabric = { id: `${p.id}b`, name: 'Binding', color: darkest.color, tile: 6 };
  return { ...doc, fabrics: [...fabrics, binding], settings: { ...doc.settings, binding: binding.id } };
}
