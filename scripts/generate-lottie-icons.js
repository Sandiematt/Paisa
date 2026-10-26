/* eslint-env node */
/**
 * Writes the Paisa icon animations to assets/animations/.
 *
 *   node scripts/generate-lottie-icons.js
 *
 * Geometry is authored on a 48 grid and scaled to a 512 canvas so each file
 * matches what Creator produces at its default scene size. Nav icons run
 * frame 0 (resting outline, muted) to the last frame (active, filled, light),
 * so the app can drive them with a progress value in either direction.
 * Re-export from Creator over the same filenames to replace any of them.
 */
const fs = require('fs');
const path = require('path');

const S = 512 / 48;
const FPS = 30;

const MUTED = '#A3A3AD';
const LIGHT = '#F5F5F7';
const DARK = '#24242B';

const OUT = path.join(__dirname, '..', 'assets', 'animations');

const rgb = hex => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
  1,
];
const pt = (x, y) => [x * S, y * S];

const OUT_EASE = {o: {x: [0.16], y: [1]}, i: {x: [0.3], y: [1]}};
const LINEAR = {o: {x: [0.5], y: [0.5]}, i: {x: [0.5], y: [0.5]}};

/** Static property. */
const fixed = value => ({a: 0, k: value});

/** Animated property from [frame, value] pairs, eased out between them. */
function anim(frames, ease = OUT_EASE) {
  return {
    a: 1,
    k: frames.map(([t, v], index) => {
      const s = Array.isArray(v) ? v : [v];
      return index === frames.length - 1 ? {t, s} : {t, s, ...ease};
    }),
  };
}

const animColor = frames => anim(frames.map(([t, hex]) => [t, rgb(hex)]));

const tr = ({p = [0, 0], a = [0, 0], s, r, o} = {}) => ({
  ty: 'tr',
  p: Array.isArray(p) ? fixed(p) : p,
  a: fixed(a),
  s: s ?? fixed([100, 100]),
  r: r ?? fixed(0),
  o: o ?? fixed(100),
  sk: fixed(0),
  sa: fixed(0),
});

const group = (nm, items, transform) => ({ty: 'gr', nm, it: [...items, transform ?? tr()]});

const polygon = (points, closed) => ({
  ty: 'sh',
  ks: fixed({
    c: closed,
    i: points.map(() => [0, 0]),
    o: points.map(() => [0, 0]),
    v: points.map(([x, y]) => pt(x, y)),
  }),
});
const rect = (cx, cy, w, h, radius) => ({
  ty: 'rc',
  d: 1,
  s: fixed(pt(w, h)),
  p: fixed(pt(cx, cy)),
  r: fixed(radius * S),
});
const ellipse = (cx, cy, w, h) => ({
  ty: 'el',
  d: 1,
  s: fixed(pt(w, h)),
  p: fixed(pt(cx, cy)),
});
const round = radius => ({ty: 'rd', r: fixed(radius * S)});
const fill = (color, opacity) => ({
  ty: 'fl',
  c: typeof color === 'string' ? fixed(rgb(color)) : color,
  o: typeof opacity === 'number' ? fixed(opacity) : opacity,
  r: 1,
});
const stroke = (color, width, opacity = 100) => ({
  ty: 'st',
  c: typeof color === 'string' ? fixed(rgb(color)) : color,
  o: typeof opacity === 'number' ? fixed(opacity) : opacity,
  w: fixed(width * S),
  lc: 2,
  lj: 2,
});
const trim = end => ({ty: 'tm', s: fixed(0), e: end, o: fixed(0), m: 1});

const layer = (nm, shapes, op) => ({
  ddd: 0,
  ind: 1,
  ty: 4,
  nm,
  sr: 1,
  ks: {o: fixed(100), r: fixed(0), p: fixed([0, 0]), a: fixed([0, 0]), s: fixed([100, 100])},
  ao: 0,
  shapes,
  ip: 0,
  op,
  st: 0,
  bm: 0,
});

const composition = (nm, op, shapes) => ({
  v: '5.7.0',
  fr: FPS,
  ip: 0,
  op,
  w: 512,
  h: 512,
  nm,
  ddd: 0,
  assets: [],
  layers: [layer(nm, shapes, op)],
});

/** Outline to filled: fill fades in while the stroke warms from muted to light. */
const activate = (from = 4, to = 14) => ({
  fill: anim([[from, 0], [to, 100]]),
  line: animColor([[from, MUTED], [to, LIGHT]]),
});

const NAV_END = 36;

function home() {
  const a = activate();
  const squash = anim([
    [0, [100, 100]],
    [5, [88, 88]],
    [14, [106, 106]],
    [24, [100, 100]],
  ]);
  const body = group(
    'body',
    [
      polygon([[24, 9], [40, 21.5], [40, 38], [8, 38], [8, 21.5]], true),
      round(2.5),
      fill(LIGHT, a.fill),
      stroke(a.line, 3),
    ],
    tr({a: pt(24, 26), p: pt(24, 26), s: squash}),
  );
  // Door: an outline at rest, a dark cut-out once the house fills in.
  const doorOutline = group('door-outline', [
    polygon([[20, 38], [20, 30], [28, 30], [28, 38]], false),
    round(1),
    stroke(MUTED, 2.6, anim([[4, 100], [10, 0]])),
  ]);
  const doorCutout = group(
    'door-cutout',
    [rect(24, 33.5, 8, 9, 1.5), fill(DARK, anim([[9, 0], [11, 100]]))],
    tr({
      a: pt(24, 38),
      p: pt(24, 38),
      s: anim([
        [9, [100, 0]],
        [18, [100, 112]],
        [24, [100, 100]],
      ]),
    }),
  );
  return composition('nav-home', NAV_END, [doorCutout, doorOutline, body]);
}

function activity() {
  const a = activate();
  const body = group(
    'receipt',
    [
      polygon([[12, 8], [36, 8], [36, 40], [30, 36], [24, 40], [18, 36], [12, 40]], true),
      round(1.5),
      fill(LIGHT, a.fill),
      stroke(a.line, 3),
    ],
    tr({
      a: pt(24, 24),
      p: pt(24, 24),
      s: anim([
        [0, [100, 100]],
        [5, [92, 92]],
        [14, [104, 104]],
        [24, [100, 100]],
      ]),
      r: anim([[0, 0], [5, -6], [14, 4], [24, 0]]),
    }),
  );
  // Lines are re-printed one after another once the receipt is dark on light.
  const lines = [
    [[18, 16], [30, 16]],
    [[18, 22], [30, 22]],
    [[18, 28], [25, 28]],
  ].map(([from, to], i) => {
    const start = 8 + i * 4;
    return group(`line-${i + 1}`, [
      polygon([from, to], false),
      trim(anim([[4, 100], [5, 0], [start, 0], [start + 10, 100]])),
      stroke(
        animColor([[4, MUTED], [5, DARK]]),
        2.5,
        anim([[4, 100], [5, 0], [start, 0], [start + 1, 100]]),
      ),
    ]);
  });
  return composition('nav-activity', NAV_END, [...lines, body]);
}

function insights() {
  const a = activate();
  const bars = [
    [14, 12],
    [24, 22],
    [34, 17],
  ].map(([cx, h], i) => {
    const lag = i * 3;
    return group(
      `bar-${i + 1}`,
      [
        rect(cx, 38 - h / 2, 8, h, 2),
        fill(LIGHT, a.fill),
        stroke(a.line, 2.6),
      ],
      tr({
        a: pt(cx, 38),
        p: pt(cx, 38),
        s: anim([
          [0, [100, 100]],
          [4 + lag, [100, 40]],
          [12 + lag, [100, 112]],
          [20 + lag, [100, 100]],
        ]),
      }),
    );
  });
  return composition('nav-insights', NAV_END, bars);
}

/** Arrow that draws itself, then gives a small nudge in its direction. */
function arrow(nm, shaft, head, nudge) {
  const drawn = (from, to) => ({
    end: anim([[from, 0], [to, 100]]),
    // A zero-length round-capped stroke still paints a dot, so hide it until it starts.
    visible: anim([[0, 0], [from, 0], [from + 1, 100]], LINEAR),
  });
  const s = drawn(0, 12);
  const h = drawn(8, 18);
  const arrowGroup = group(
    'arrow',
    [
      group('shaft', [polygon(shaft, false), trim(s.end), stroke(LIGHT, 4, s.visible)]),
      group('head', [polygon(head, false), round(0.5), trim(h.end), stroke(LIGHT, 4, h.visible)]),
    ],
    tr({
      p: anim([
        [18, [0, 0]],
        [26, [nudge[0] * S, nudge[1] * S]],
        [36, [0, 0]],
      ]),
    }),
  );
  return composition(nm, 40, [arrowGroup]);
}

const GOLD = '#E9C77B';
const LAVENDER = '#B9A7FF';

/** A filled piece in its own group, so each piece keeps its own colour. */
const piece = (nm, shape, color, transform) =>
  group(nm, [...(Array.isArray(shape) ? shape : [shape]), fill(color, 100)], transform);

function wallet() {
  // A note slides up out of the wallet while the clasp pops in.
  const bill = group(
    'bill',
    [rect(22, 12, 18, 10, 2), fill(LAVENDER, 100)],
    tr({
      p: anim([
        [0, [0, 9 * S]],
        [8, [0, 9 * S]],
        [20, [0, -1.5 * S]],
        [28, [0, 0]],
      ]),
    }),
  );
  const body = group(
    'body',
    [
      piece(
        'clasp',
        ellipse(34, 26, 6, 6),
        DARK,
        tr({
          a: pt(34, 26),
          p: pt(34, 26),
          s: anim([
            [0, [100, 100]],
            [8, [0, 0]],
            [18, [125, 125]],
            [26, [100, 100]],
          ]),
        }),
      ),
      piece('wallet', rect(24, 26, 34, 24, 5), LIGHT),
    ],
    tr({
      a: pt(24, 38),
      p: pt(24, 38),
      s: anim([
        [0, [100, 100]],
        [4, [100, 90]],
        [13, [100, 106]],
        [22, [100, 100]],
      ]),
    }),
  );
  return composition('tile-wallet', 36, [body, bill]);
}

function piggy() {
  const body = group(
    'piggy',
    [
      piece('eye', ellipse(31, 24, 2.4, 2.4), DARK),
      piece('slot', rect(24, 17.5, 9, 2.2, 1.1), DARK),
      piece('snout', ellipse(38, 28, 6, 8), LIGHT),
      piece('ear', [polygon([[16, 19], [17, 11.5], [23, 17]], true), round(1.5)], LIGHT),
      piece('leg-front', rect(30, 37.5, 5, 7, 2), LIGHT),
      piece('leg-back', rect(18, 37.5, 5, 7, 2), LIGHT),
      piece('torso', ellipse(24, 27, 28, 20), LIGHT),
    ],
    tr({
      a: pt(24, 38),
      p: pt(24, 38),
      s: anim([
        [0, [100, 100]],
        [13, [100, 100]],
        [17, [110, 88]],
        [26, [97, 104]],
        [34, [100, 100]],
      ]),
    }),
  );
  // The coin sinks into the slot from behind the body, turning edge-on.
  const coin = group(
    'coin',
    [ellipse(24, 0, 9, 9), fill(GOLD, anim([[0, 100], [13, 100], [15, 0]]))],
    tr({
      a: pt(24, 0),
      p: anim([
        [0, pt(24, 8)],
        [14, pt(24, 17)],
      ]),
      s: anim([
        [0, [100, 100]],
        [6, [100, 100]],
        [13, [35, 100]],
      ]),
    }),
  );
  return composition('tile-piggy', 40, [body, coin]);
}

function bell() {
  const swing = (amp, lag) =>
    anim([
      [lag, 0],
      [lag + 4, -amp],
      [lag + 8, amp * 0.85],
      [lag + 12, -amp * 0.6],
      [lag + 16, amp * 0.35],
      [lag + 20, -amp * 0.15],
      [lag + 24, 0],
    ]);
  const dome = group(
    'bell',
    [
      polygon([[12, 35], [36, 35], [32, 30], [32, 22], [24, 10], [16, 22], [16, 30]], true),
      round(5),
      stroke(LIGHT, 3),
    ],
    tr({a: pt(24, 9), p: pt(24, 9), r: swing(18, 0)}),
  );
  const clapper = group(
    'clapper',
    [rect(24, 40.5, 6, 3, 1.5), fill(LIGHT, 100)],
    tr({a: pt(24, 9), p: pt(24, 9), r: swing(26, 2)}),
  );
  return composition('tile-bell', 30, [clapper, dome]);
}

const icons = {
  'tile-wallet': wallet(),
  'tile-piggy': piggy(),
  'tile-bell': bell(),
  'nav-home': home(),
  'nav-activity': activity(),
  'nav-insights': insights(),
  'tile-expense': arrow(
    'tile-expense',
    [[14, 34], [34, 14]],
    [[19, 14], [34, 14], [34, 29]],
    [3, -3],
  ),
  'tile-income': arrow(
    'tile-income',
    [[34, 14], [14, 34]],
    [[29, 34], [14, 34], [14, 19]],
    [-3, 3],
  ),
};

fs.mkdirSync(OUT, {recursive: true});
Object.entries(icons).forEach(([name, json]) => {
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(json));
  console.log(`wrote assets/animations/${name}.json`);
});
