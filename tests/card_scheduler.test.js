const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const registry = new Map();
global.HTMLElement = class {};
global.CustomEvent = class {};
global.document = {
  hidden: false,
  addEventListener() {},
  removeEventListener() {},
};
global.window = { customCards: [] };
global.customElements = {
  define(name, constructor) {
    registry.set(name, constructor);
  },
  get(name) {
    return registry.get(name);
  },
};
global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};

require(path.join(
  __dirname,
  "..",
  "custom_components",
  "duhnergy",
  "static",
  "duhnergy-card.js",
));

test("flow markers update on every animation frame after initialization", () => {
  const Card = registry.get("duhnergy-card");
  const card = new Card();
  const transforms = [];
  const marker = {
    style: {
      set transform(value) {
        transforms.push(value);
      },
      set opacity(_value) {},
    },
  };
  card._flowConnected = true;
  card._motionMedia = { matches: false };
  card._syncFlowScheduler = () => {};
  card._flowEntries = new Map([
    [
      0,
      {
        points: [
          [0, 0],
          [100, 0],
        ],
        segments: [{ from: [0, 0], to: [100, 0], length: 100 }],
        totalLength: 100,
        markers: [marker],
        phase: 0,
        velocity: 50,
        targetVelocity: 50,
        opacity: 1,
        targetOpacity: 1,
      },
    ],
  ]);

  [0, 16.6, 33.2, 49.8, 66.4].forEach((timestamp) => card._animateFlows(timestamp));

  assert.equal(transforms.length, 4);
  assert.equal(new Set(transforms).size, 4);
  assert.equal(card._flowRenderedFrames, 4);
});

test("flow scheduler clamps only pathological elapsed gaps", () => {
  const Card = registry.get("duhnergy-card");
  const card = new Card();
  const marker = { style: {} };
  const entry = {
    points: [
      [0, 0],
      [100, 0],
    ],
    segments: [{ from: [0, 0], to: [100, 0], length: 100 }],
    totalLength: 100,
    markers: [marker],
    phase: 0,
    velocity: 50,
    targetVelocity: 50,
    opacity: 1,
    targetOpacity: 1,
  };
  card._flowConnected = true;
  card._motionMedia = { matches: false };
  card._syncFlowScheduler = () => {};
  card._flowEntries = new Map([[0, entry]]);

  card._animateFlows(0);
  card._animateFlows(1000);

  assert.ok(Math.abs(entry.phase - 0.05) < 1e-9);
});
