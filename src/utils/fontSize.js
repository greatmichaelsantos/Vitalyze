import { PixelRatio, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

// Scale is capped at 1.0 — fonts will scale DOWN on screens narrower
// than the 390pt reference (e.g. small Android phones) but will NEVER
// scale UP on tablets, web, or larger phones where width > 390.
// This prevents the layout-breaking 2–3× blowout that occurs on web
// preview or wide-screen devices.
const scale = Math.min(width / 390, 1.0);

/**
 * Returns a proportionally scaled font size, capped at the designed size.
 * Safe to use anywhere — the result is always ≤ the original value.
 */
export const fontSize = (size) =>
  Math.round(PixelRatio.roundToNearestPixel(size * scale));
