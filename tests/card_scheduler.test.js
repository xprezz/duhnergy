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

function configuredCard(config = {}) {
  const Card = registry.get("duhnergy-card");
  const card = new Card();
  card.shadowRoot = {};
  card._render = () => {};
  card.connectedCallback = () => {};
  card.setConfig({ type: "custom:duhnergy-card", ...config });
  card._hass = { user: { is_admin: true }, states: {} };
  return card;
}

test("isolated current prices are visible even when the remaining forecast is missing", () => {
  const card = configuredCard();
  const markup = card._unifiedForecast({
    timestamps: ["2026-11-02T10:00:00Z", "2026-11-02T11:00:00Z"],
    buy_price: [3.32, null],
    sell_price: [2.15, null],
    solar_kw: [null, null],
    currency: "EUR",
  });
  assert.match(markup, /circle class="forecast-buy-line forecast-point"/);
  assert.match(markup, /circle class="forecast-sell-line forecast-point"/);
  assert.match(markup, /Solar forecast unavailable/);
  assert.match(markup, /EUR\/kWh/);
  assert.doesNotMatch(markup, /DKK|NaN|Infinity/);
  assert.match(markup, /data-solar="—"/);
});

test("forecast gaps are not fabricated as zeroes or joined across missing values", () => {
  const card = configuredCard();
  const segments = card._segments([1, null, "", -2, 0], (x) => x, (y) => y);
  assert.deepEqual(segments.map((segment) => segment.map((point) => point[2])), [[1], [-2, 0]]);
  assert.equal(card._format(null), "—");
  assert.equal(card._format(undefined), "—");
  assert.equal(card._format(""), "—");
  assert.equal(card._format(0), "0.00");
  assert.equal(card._displayPower(null), null);
});

test("forecast sensor discovery supports renamed entities but rejects ambiguous matches", () => {
  const card = configuredCard();
  const state = {
    entity_id: "sensor.renamed_forecast",
    attributes: { timestamps: [], buy_price: [], solar_kw: [] },
  };
  card._hass.states[state.entity_id] = state;
  assert.equal(card._forecastState(), state);
  card._hass.states["sensor.other_forecast"] = { ...state, entity_id: "sensor.other_forecast" };
  assert.equal(card._forecastState(), undefined);
  card.config.forecast_entity = state.entity_id;
  assert.equal(card._forecastState(), state);
});

test("negative and zero forecasts remain visible with no missing-series warning", () => {
  const card = configuredCard();
  const markup = card._unifiedForecast({
    timestamps: ["2026-11-02T10:00:00Z", "2026-11-02T11:00:00Z"],
    buy_price: [-1, 0],
    sell_price: [0, -0.5],
    solar_kw: [0, 0],
  });
  assert.match(markup, /path class="forecast-buy-line"/);
  assert.match(markup, /path class="forecast-sell-line"/);
  assert.doesNotMatch(markup, /forecast-notice|NaN|Infinity/);
});

test("mapping options identify PV array positions and auto-selected weather", () => {
  const card = configuredCard();
  const pv = card.config.pv_entities[2];
  assert.deepEqual(card._mappingOptions(pv, "pv_entities:2").map((item) => item.key), ["pv_entities:2"]);
  assert.deepEqual(card._mappingOptions("weather.home", "weather_entity"), [
    { key: "weather_entity", label: "Weather", value: "weather.home" },
  ]);
});

test("mapping saves preserve nested sections, sibling cards, and planner settings", async () => {
  const card = configuredCard();
  const oldConfig = card._rawConfig;
  const sibling = { type: "entities", entities: ["sensor.other"] };
  const original = {
    title: "Energy",
    views: [{ sections: [{ cards: [sibling, { type: "vertical-stack", cards: [oldConfig] }] }] }],
  };
  let saved;
  const dashboard = { mode: "storage", config: original, async saveConfig(config) { saved = config; } };
  card.parentNode = { parentNode: null, lovelace: dashboard };
  card._hass.states["sensor.new_grid"] = { state: "12", attributes: {} };
  await card._saveEntityMapping("grid_power_entity", "sensor.new_grid");
  assert.equal(saved.views[0].sections[0].cards[1].cards[0].grid_power_entity, "sensor.new_grid");
  assert.deepEqual(saved.views[0].sections[0].cards[0], sibling);
  assert.equal(original.views[0].sections[0].cards[1].cards[0], oldConfig);
  assert.equal(card.config.grid_power_entity, "sensor.new_grid");
});

test("PV remapping preserves all other channels and raw config options", async () => {
  const card = configuredCard({ title: "My energy", grid_options: { columns: 12 } });
  let saved;
  card._dashboardContext = () => ({
    mode: "storage", config: { views: [{ cards: [card._rawConfig] }] },
    async saveConfig(config) { saved = config; },
  });
  card._hass.states["sensor.new_pv"] = { state: "0", attributes: {} };
  const previous = [...card.config.pv_entities];
  await card._saveEntityMapping("pv_entities:2", "sensor.new_pv");
  assert.deepEqual(saved.views[0].cards[0].pv_entities, [previous[0], previous[1], "sensor.new_pv", previous[3]]);
  assert.deepEqual(saved.views[0].cards[0].grid_options, { columns: 12 });
});

test("failed, ambiguous, read-only and unauthorized mapping saves cannot mutate config", async () => {
  const card = configuredCard();
  const original = card._rawConfig;
  card._hass.states["sensor.new_grid"] = { state: "0", attributes: {} };
  const dashboard = {
    mode: "storage", config: { views: [{ cards: [original, original] }] },
    async saveConfig() { throw new Error("backend failed"); },
  };
  card._dashboardContext = () => dashboard;
  await assert.rejects(card._saveEntityMapping("grid_power_entity", "sensor.new_grid"), /uniquely identified/);
  dashboard.config.views[0].cards.pop();
  await assert.rejects(card._saveEntityMapping("grid_power_entity", "sensor.new_grid"), /backend failed/);
  assert.equal(card._rawConfig, original);
  dashboard.mode = "yaml";
  await assert.rejects(card._saveEntityMapping("grid_power_entity", "sensor.new_grid"), /YAML/);
  dashboard.mode = "storage";
  card._hass.user.is_admin = false;
  await assert.rejects(card._saveEntityMapping("grid_power_entity", "sensor.new_grid"), /administrator/);
  card._hass.user.is_admin = true;
  await assert.rejects(card._saveEntityMapping("grid_power_entity", "sensor.missing"), /existing/);
});

test("compact overview includes daily totals and all requested status colour states", () => {
  const card = configuredCard();
  const put = (id, value, unit = "W") => {
    card._hass.states[id] = { state: String(value), attributes: { unit_of_measurement: unit } };
  };
  put(card.config.grid_power_entity, -1200);
  put(card.config.battery_soc_entity, 66, "%");
  put(card.config.battery_power_entity, -158);
  put(card.config.house_power_entity, 504);
  put(card.config.ev_power_entity, 4000);
  put(card.config.pv_total_entity, 360);
  card._skyPanel = () => "";
  const overview = () => card._illustratedOverview({}, {}, {
    periods: { today: {
      household_consumption_kwh: 33.7, import_cost: 12.5,
      self_consumption_value: 10, export_revenue: 5,
    } },
  });
  let markup = overview();
  assert.match(markup, /grid-selling/);
  assert.match(markup, /soc-high battery-discharging/);
  assert.match(markup, /ev-active/);
  assert.match(markup, /Consumed/);
  assert.match(markup, /Spend/);
  assert.match(markup, /Est\. savings/);
  assert.match(markup, /15\.00/);
  assert.doesNotMatch(markup, /NaN|Infinity/);
  put(card.config.grid_power_entity, 3500);
  markup = overview();
  assert.match(markup, /grid-heavy/);
  put(card.config.grid_power_entity, 10);
  assert.match(overview(), /grid-neutral/);
});

test("visual editor loads Home Assistant form components before opening", async () => {
  const Card = registry.get("duhnergy-card");
  let loaded = false;
  const previousCreate = document.createElement;
  window.loadCardHelpers = async () => ({
    createCardElement(config) {
      assert.deepEqual(config, { type: "entities", entities: [] });
      return { constructor: {
        async getConfigElement() { loaded = true; },
      } };
    },
  });
  document.createElement = (name) => {
    assert.equal(loaded, true);
    return { name };
  };
  try {
    assert.deepEqual(await Card.getConfigElement(), { name: "duhnergy-card-editor" });
  } finally {
    document.createElement = previousCreate;
    delete window.loadCardHelpers;
  }
});
