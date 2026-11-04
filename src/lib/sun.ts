// Where the sun is in the sky over the salon at a given date and time, using
// the NOAA solar position equations (the same maths a solar watch face uses):
// declination and hour angle from the date and time, then the sun's altitude
// above the horizon in degrees (negative = below it).

const RAD = Math.PI / 180;

/** The salon's location (Kukatpally, Hyderabad). */
export const SALON_LAT = 17.4935;
export const SALON_LON = 78.3995;

/**
 * Sun altitude in degrees at an Indian time (IST, UTC+5:30).
 * @param iso   date, yyyy-mm-dd
 * @param minute minutes after midnight, salon time
 */
export function sunAltitude(iso: string, minute: number, lat = SALON_LAT, lon = SALON_LON) {
  const utcMs = Date.parse(`${iso}T00:00:00Z`) + (minute - 330) * 60_000;
  const jd = utcMs / 86_400_000 + 2440587.5; // Julian day
  const t = (jd - 2451545) / 36525; // Julian centuries since J2000
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const C =
    Math.sin(M * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * M * RAD) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  // equation of time, minutes
  const eqTime =
    4 *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD)) /
    RAD;
  const utcMinutes = ((utcMs / 60_000) % 1440 + 1440) % 1440;
  const solarTime = (utcMinutes + eqTime + 4 * lon + 1440) % 1440;
  const hourAngle = solarTime / 4 - 180;
  const cosZenith =
    Math.sin(lat * RAD) * Math.sin(decl * RAD) + Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(hourAngle * RAD);
  return 90 - Math.acos(Math.min(1, Math.max(-1, cosZenith))) / RAD;
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * Real sky colours by the sun's altitude (top of the sky, horizon): clear day
 * blue, golden hour, sunset, civil twilight pinks, nautical-twilight blue,
 * astronomical twilight and night.
 */
const SKY: [number, RGB, RGB][] = [
  [-18, hex("#060a18"), hex("#0d1530")], // night
  [-12, hex("#0b1430"), hex("#1d2a57")], // astronomical twilight
  [-6, hex("#172b5e"), hex("#4b5596")], // nautical twilight (deep blue hour)
  [-2, hex("#2e4a8a"), hex("#c9798a")], // civil twilight: indigo over rose
  [1, hex("#4a6fae"), hex("#f2a06b")], // sunset: blue over orange
  [6, hex("#5d8fcf"), hex("#f6c890")], // golden hour
  [15, hex("#5aa0e0"), hex("#cfe5f2")], // low sun, clear
  [35, hex("#3f8fdc"), hex("#bfe0f7")], // full daylight
  [90, hex("#2f86dc"), hex("#b5dcf8")], // high sun
];

const mix = (a: RGB, b: RGB, k: number): RGB => a.map((v, i) => Math.round(v + (b[i]! - v) * k)) as RGB;

export function skyFor(altitude: number) {
  const a = Math.max(-18, Math.min(90, altitude));
  let top = SKY[0]![1];
  let bottom = SKY[0]![2];
  for (let i = 1; i < SKY.length; i++) {
    const [a1, t1, b1] = SKY[i]!;
    const [a0, t0, b0] = SKY[i - 1]!;
    if (a <= a1) {
      const k = (a - a0) / (a1 - a0);
      top = mix(t0, t1, k);
      bottom = mix(b0, b1, k);
      break;
    }
  }
  // dark sky → light text (perceived brightness of the whole gradient)
  const lum = (c: RGB) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const dark = (lum(top) + lum(bottom)) / 2 < 120;
  const css = (c: RGB) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
  return { top: css(top), bottom: css(bottom), dark, altitude: a };
}
