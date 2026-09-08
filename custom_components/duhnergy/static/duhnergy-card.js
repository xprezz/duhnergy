class DuhnergyCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  static async getConfigElement() {
    return document.createElement("duhnergy-card-editor");
  }

  constructor() {
    super();
    this._statsPeriod = "today";
  }

  setConfig(config) {
    this.config = {
      title: "Duhnergy!",
      status_entity: "sensor.duhnergy_status",
      reason_entity: "sensor.duhnergy_reason",
      plan_entity: "sensor.duhnergy_plan",
      forecast_entity: "sensor.duhnergy_24_hour_forecast",
      stats_entity: "sensor.duhnergy_stats_summary",
      log_entity: "sensor.duhnergy_simulator_log",
      ...config,
    };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 12;
  }

  _state(entityId) {
    return this._hass?.states?.[entityId];
  }

  _value(entityId, fallback = "—") {
    const state = this._state(entityId);
    if (!state || ["unknown", "unavailable"].includes(state.state)) return fallback;
    return state.state;
  }

  _number(entityId, fallback = 0) {
    const value = Number(this._value(entityId, fallback));
    return Number.isFinite(value) ? value : fallback;
  }

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  _label(value) {
    return String(value || "idle")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  _time(value, options = {}) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString([], {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          ...options,
        });
  }

  _relativeTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
    return formatter.format(Math.round(hours / 24), "day");
  }

  _format(value, digits = 2, fallback = "—") {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : fallback;
  }

  _unit(entityId, fallback = "") {
    return this._state(entityId)?.attributes?.unit_of_measurement || fallback;
  }

  _entityTile(icon, label, entityId, value, unit = "", tone = "") {
    const display = value ?? this._value(entityId);
    return `<div class="entity-tile ${tone}" data-entity="${this._escape(entityId)}" role="button" tabindex="0">
      <ha-icon icon="${icon}"></ha-icon>
      <span>${this._escape(label)}</span>
      <strong>${this._escape(display)}${unit ? ` <small>${this._escape(unit)}</small>` : ""}</strong>
    </div>`;
  }

  _forecastChart(attributes) {
    const timestamps = Array.isArray(attributes?.timestamps) ? attributes.timestamps : [];
    const solar = Array.isArray(attributes?.solar_kw) ? attributes.solar_kw : [];
    const buy = Array.isArray(attributes?.buy_price) ? attributes.buy_price : [];
    const sell = Array.isArray(attributes?.sell_price) ? attributes.sell_price : [];
    if (!timestamps.length) {
      return `<div class="empty chart-empty"><ha-icon icon="mdi:chart-bell-curve-cumulative"></ha-icon>Waiting for forecast data.</div>`;
    }

    const width = 900;
    const height = 290;
    const left = 58;
    const right = 844;
    const top = 24;
    const bottom = 238;
    const x = (index) => left + (index / Math.max(1, timestamps.length - 1)) * (right - left);
    const solarValues = solar.filter((value) => Number.isFinite(Number(value))).map(Number);
    const priceValues = [...buy, ...sell]
      .filter((value) => value !== null && Number.isFinite(Number(value)))
      .map(Number);
    const solarMax = Math.max(1, ...solarValues) * 1.1;
    const priceMin = Math.min(0, ...priceValues);
    const priceMax = Math.max(1, ...priceValues);
    const priceRange = Math.max(0.1, priceMax - priceMin);
    const ySolar = (value) => bottom - (Number(value) / solarMax) * (bottom - top);
    const yPrice = (value) => bottom - ((Number(value) - priceMin) / priceRange) * (bottom - top);

    const segments = (values, yScale) => {
      const result = [];
      let current = [];
      values.forEach((value, index) => {
        if (value === null || value === undefined || !Number.isFinite(Number(value))) {
          if (current.length) result.push(current);
          current = [];
        } else {
          current.push([x(index), yScale(value), Number(value), index]);
        }
      });
      if (current.length) result.push(current);
      return result;
    };
    const path = (segment) =>
      segment.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
    const solarSegments = segments(solar, ySolar);
    const buySegments = segments(buy, yPrice);
    const sellSegments = segments(sell, yPrice);
    const areas = solarSegments
      .map((segment) => {
        const start = segment[0][0];
        const end = segment.at(-1)[0];
        return `<path class="solar-area" d="M${start.toFixed(1)},${bottom} ${path(segment)} L${end.toFixed(1)},${bottom} Z"></path>`;
      })
      .join("");
    const lines = (parts, className) =>
      parts.map((segment) => `<path class="${className}" d="${path(segment)}"></path>`).join("");
    const points = (parts, className, values, suffix) =>
      parts
        .flat()
        .map(
          (point) => `<circle class="${className}" cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="3.5">
            <title>${this._escape(this._time(timestamps[point[3]]))}: ${this._format(values[point[3]])} ${this._escape(suffix)}</title>
          </circle>`,
        )
        .join("");
    const xTicks = [...new Set([0, 6, 12, 18, timestamps.length - 1].filter((index) => index < timestamps.length))]
      .map(
        (index) => `<g><line class="grid-line" x1="${x(index)}" y1="${top}" x2="${x(index)}" y2="${bottom}"></line>
          <text class="axis-label" x="${x(index)}" y="266" text-anchor="middle">${this._escape(
            this._time(timestamps[index], { weekday: undefined }),
          )}</text></g>`,
      )
      .join("");
    const yTicks = [0, 0.5, 1]
      .map((fraction) => {
        const y = bottom - fraction * (bottom - top);
        return `<line class="grid-line horizontal" x1="${left}" y1="${y}" x2="${right}" y2="${y}"></line>
          <text class="axis-label" x="48" y="${y + 4}" text-anchor="end">${(solarMax * fraction).toFixed(1)}</text>
          <text class="axis-label" x="855" y="${y + 4}">${(priceMin + priceRange * fraction).toFixed(1)}</text>`;
      })
      .join("");
    const first = new Date(timestamps[0]).getTime();
    const last = new Date(timestamps.at(-1)).getTime();
    const now = Date.now();
    const nowX =
      Number.isFinite(first) && Number.isFinite(last) && now >= first && now <= last
        ? left + ((now - first) / Math.max(1, last - first)) * (right - left)
        : null;
    return `<svg class="forecast-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="24-hour solar, buy price, and sell price forecast">
      <defs>
        <linearGradient id="duh-solar-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffd166" stop-opacity=".62"></stop>
          <stop offset="100%" stop-color="#ffd166" stop-opacity=".03"></stop>
        </linearGradient>
      </defs>
      ${xTicks}${yTicks}
      <text class="axis-title" x="${left}" y="14">Solar kW</text>
      <text class="axis-title" x="${right}" y="14" text-anchor="end">Price ${this._escape(attributes.currency || "")}/kWh</text>
      ${areas}${lines(solarSegments, "solar-line")}${lines(buySegments, "buy-line")}${lines(sellSegments, "sell-line")}
      ${points(solarSegments, "solar-point", solar, "kW")}
      ${points(buySegments, "buy-point", buy, attributes.currency || "")}
      ${points(sellSegments, "sell-point", sell, attributes.currency || "")}
      ${nowX === null ? "" : `<line class="now-line" x1="${nowX}" y1="${top}" x2="${nowX}" y2="${bottom}"></line><text class="now-label" x="${nowX + 5}" y="${top + 11}">Now</text>`}
    </svg>`;
  }

  _powerFlow(planAttributes) {
    const solar = this._number("sensor.duhnergy_solar_power");
    const house = this._number("sensor.duhnergy_house_power");
    const battery = this._number("sensor.duhnergy_battery_power");
    const grid = this._number("sensor.duhnergy_grid_net_power");
    const ev = this._number("sensor.duhnergy_ev_power");
    const conventions = planAttributes?.conventions || {};
    const batteryCharging =
      conventions.battery_power_positive === "discharge" ? battery < 0 : battery > 0;
    const gridImporting =
      conventions.grid_power_positive === "export" ? grid < 0 : grid > 0;
    const edge = (x1, y1, x2, y2, active, reverse, className) => {
      const values = reverse ? [x2, y2, x1, y1] : [x1, y1, x2, y2];
      return `<line class="flow ${active ? "active" : ""} ${className}" x1="${values[0]}" y1="${values[1]}" x2="${values[2]}" y2="${values[3]}" marker-end="url(#flow-arrow)"></line>`;
    };
    const node = (x, y, icon, label, value, entityId, className = "") =>
      `<g class="flow-node ${className}" transform="translate(${x} ${y})" data-entity="${entityId}" role="button" tabindex="0">
        <rect x="-82" y="-35" width="164" height="70" rx="18"></rect>
        <foreignObject x="-68" y="-24" width="32" height="32"><ha-icon icon="${icon}"></ha-icon></foreignObject>
        <text class="node-label" x="-26" y="-7">${label}</text>
        <text class="node-value" x="-26" y="17">${this._format(value / 1000, 2)} kW</text>
      </g>`;
    return `<svg class="power-flow" viewBox="0 0 900 310" role="img" aria-label="Live home energy flow">
      <defs>
        <marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L7,3 z"></path>
        </marker>
        <radialGradient id="home-glow"><stop offset="0%" stop-color="#67e8b3" stop-opacity=".26"></stop><stop offset="100%" stop-color="#67e8b3" stop-opacity="0"></stop></radialGradient>
      </defs>
      <circle class="home-glow" cx="450" cy="155" r="112"></circle>
      ${edge(210, 70, 370, 135, solar > 20, false, "solar-flow")}
      ${edge(210, 240, 370, 175, Math.abs(grid) > 20, !gridImporting, "grid-flow")}
      ${edge(690, 70, 530, 135, Math.abs(battery) > 20, batteryCharging, "battery-flow")}
      ${edge(530, 175, 690, 240, ev > 20, false, "ev-flow")}
      ${node(135, 58, "mdi:solar-power", "Solar", solar, "sensor.duhnergy_solar_power", "solar-node")}
      ${node(135, 252, "mdi:transmission-tower", "Grid", grid, "sensor.duhnergy_grid_net_power")}
      ${node(765, 58, "mdi:battery-charging", "Battery", battery, "sensor.duhnergy_battery_power")}
      ${node(765, 252, "mdi:ev-station", "EV", ev, "sensor.duhnergy_ev_power")}
      ${node(450, 155, "mdi:home-lightning-bolt", "House", house, "sensor.duhnergy_house_power", "house-node")}
    </svg>`;
  }

  _stats(attributes) {
    const period = attributes?.periods?.[this._statsPeriod] || {};
    const currency = attributes?.currency || "DKK";
    const items = [
      ["grid_import_kwh", "Grid import", "mdi:transmission-tower-import", "kWh", "sensor.duhnergy_lifetime_grid_import"],
      ["grid_export_kwh", "Grid export", "mdi:transmission-tower-export", "kWh", "sensor.duhnergy_lifetime_grid_export"],
      ["solar_production_kwh", "Solar production", "mdi:solar-power", "kWh", "sensor.duhnergy_lifetime_solar_production"],
      ["household_consumption_kwh", "House use", "mdi:home-lightning-bolt", "kWh", "sensor.duhnergy_lifetime_household_consumption"],
      ["battery_charged_kwh", "Battery charged", "mdi:battery-plus", "kWh", "sensor.duhnergy_lifetime_battery_charged"],
      ["battery_discharged_kwh", "Battery discharged", "mdi:battery-minus", "kWh", "sensor.duhnergy_lifetime_battery_discharged"],
      ["ev_charged_kwh", "EV charged", "mdi:ev-station", "kWh", "sensor.duhnergy_lifetime_ev_charged"],
      ["import_cost", "Import cost", "mdi:cash-minus", currency, "sensor.duhnergy_lifetime_import_cost"],
      ["export_revenue", "Export revenue", "mdi:cash-plus", currency, "sensor.duhnergy_lifetime_export_revenue"],
      ["self_consumption_value", "Self-use value", "mdi:home-currency-usd", currency, "sensor.duhnergy_lifetime_estimated_self_consumption_value"],
      ["net_cost", "Net cost", "mdi:scale-balance", currency, "sensor.duhnergy_lifetime_net_cost"],
    ];
    return `<div class="period-tabs" role="tablist">
      ${["today", "week", "month", "year", "lifetime"]
        .map(
          (name) => `<button class="${name === this._statsPeriod ? "selected" : ""}" data-period="${name}" role="tab" aria-selected="${name === this._statsPeriod}">${this._label(name)}</button>`,
        )
        .join("")}
    </div>
    <div class="stats-grid">
      ${items
        .map(
          ([key, label, icon, unit, entityId]) => `<div class="stat" data-entity="${entityId}" role="button" tabindex="0">
            <ha-icon icon="${icon}"></ha-icon><span>${label}</span>
            <strong>${this._format(period[key], key.includes("cost") || key.includes("revenue") || key.includes("value") ? 2 : 3)} <small>${unit}</small></strong>
          </div>`,
        )
        .join("")}
    </div>
    <p class="fine-print">Self-use value is estimated from sampled solar minus measured export. Power-derived totals ignore sample gaps over 10 minutes.</p>`;
  }

  _simulator(entries) {
    if (!entries.length) {
      return `<div class="empty">No Shadow decisions recorded yet. The stream updates only when a proposed action or plan boundary changes.</div>`;
    }
    return entries
      .slice(0, 10)
      .map(
        (entry) => `<article class="activity">
          <i></i>
          <div>
            <div class="activity-head"><strong>${this._escape(this._label(entry.planned_action))}</strong><time title="${this._escape(this._time(entry.timestamp, { weekday: "long" }))}">${this._escape(this._relativeTime(entry.timestamp))}</time></div>
            <p>${this._escape(entry.message)}</p>
            <small>${this._escape(entry.reason)}</small>
            <details><summary>Proposed service operations</summary><ul>${(entry.operations || []).map((operation) => `<li>${this._escape(operation)}</li>`).join("")}</ul></details>
          </div>
        </article>`,
      )
      .join("");
  }

  _setting(label, entityId) {
    const state = this._state(entityId);
    return `<label class="setting"><span data-entity="${entityId}" role="button" tabindex="0">${this._escape(label)} <ha-icon icon="mdi:information-outline"></ha-icon></span>
      <input data-number="${entityId}" type="number" value="${this._escape(state?.state || "")}" min="${state?.attributes?.min ?? ""}" max="${state?.attributes?.max ?? ""}" step="${state?.attributes?.step ?? "1"}">
    </label>`;
  }

  _button(command, label, icon = "mdi:gesture-tap-button") {
    return `<button class="command" data-button="button.duhnergy_${command}"><ha-icon icon="${icon}"></ha-icon>${this._escape(label)}</button>`;
  }

  _render() {
    if (!this.shadowRoot || !this.config || !this._hass) return;
    const openDetails = new Map(
      [...this.shadowRoot.querySelectorAll("details[data-section]")].map((item) => [
        item.dataset.section,
        item.open,
      ]),
    );
    const status = this._value(this.config.status_entity, "Loading");
    const reason = this._value(this.config.reason_entity, "Waiting for first calculation");
    const mode = this._value("select.duhnergy_mode", "shadow");
    const plan = this._state(this.config.plan_entity);
    const planAttributes = plan?.attributes || {};
    const timeline = Array.isArray(planAttributes.timeline) ? planAttributes.timeline : [];
    const forecastAttributes = this._state(this.config.forecast_entity)?.attributes || {};
    const statsAttributes = this._state(this.config.stats_entity)?.attributes || {};
    const logEntries = this._state(this.config.log_entity)?.attributes?.entries || [];
    const net = this._number("sensor.duhnergy_predicted_surplus_or_deficit");
    const tone = status.startsWith("auto")
      ? "auto"
      : status.startsWith("manual")
        ? "manual"
        : status.startsWith("off")
          ? "off"
          : "shadow";
    const timelineRows = timeline.length
      ? timeline
          .map(
            (item) => `<article class="timeline-row">
              <div class="timeline-time"><strong>${this._escape(this._time(item.start, { weekday: undefined }))}</strong><span>${this._escape(this._time(item.end, { weekday: undefined }))}</span></div>
              <i></i><div><strong>${this._escape(this._label(item.action))}</strong><p>${this._escape(item.reason)}</p></div>
              <b>${item.price == null ? "" : `${this._format(item.price)} ${this._escape(forecastAttributes.currency || "")}`}</b>
            </article>`,
          )
          .join("")
      : `<div class="empty">No grid actions planned in the next 24 hours.</div>`;
    const solarSummary = forecastAttributes.solar_kw?.filter((value) => Number.isFinite(Number(value))) || [];
    const currency = forecastAttributes.currency || statsAttributes.currency || "DKK";

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --duh-bg: linear-gradient(145deg, #09252c 0%, #123b3d 48%, #142e31 100%);
          --duh-panel: rgba(7, 29, 34, .66);
          --duh-border: rgba(203, 255, 239, .11);
          --duh-text: #f4fbfa;
          --duh-muted: #9dbbb8;
          --duh-green: #68e3ae;
          --duh-yellow: #ffd166;
          --duh-blue: #62b6ff;
          display: block;
        }
        * { box-sizing: border-box; }
        ha-card { overflow: hidden; border: 0; color: var(--duh-text); background: var(--duh-bg); box-shadow: 0 18px 55px rgba(2, 22, 27, .28); }
        .topbar { position: relative; display: grid; grid-template-columns: 1fr auto; gap: 20px; align-items: center; padding: 22px 26px 18px; border-bottom: 1px solid var(--duh-border); }
        .topbar:after { content: ""; position: absolute; width: 340px; height: 200px; right: -80px; top: -135px; border-radius: 50%; background: radial-gradient(circle, rgba(103, 232, 179, .22), transparent 68%); pointer-events: none; }
        .brand { display: flex; gap: 14px; align-items: center; min-width: 0; }
        .brand-mark { display: grid; place-items: center; width: 45px; height: 45px; border-radius: 14px; background: linear-gradient(140deg, rgba(104, 227, 174, .28), rgba(98, 182, 255, .13)); color: var(--duh-green); box-shadow: inset 0 0 0 1px var(--duh-border); }
        .brand-mark ha-icon { --mdc-icon-size: 28px; }
        h2 { margin: 0; font-size: 24px; letter-spacing: -.55px; }
        .status-line { display: flex; align-items: center; gap: 7px; margin-top: 4px; color: var(--duh-muted); font-size: 13px; text-transform: capitalize; cursor: pointer; }
        .status-line:focus-visible, [data-entity]:focus-visible { outline: 2px solid var(--duh-blue); outline-offset: 3px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--duh-yellow); box-shadow: 0 0 12px var(--duh-yellow); }
        .auto .dot { background: var(--duh-green); box-shadow: 0 0 12px var(--duh-green); }
        .manual .dot { background: var(--duh-blue); box-shadow: 0 0 12px var(--duh-blue); }
        .off .dot { background: #829493; box-shadow: none; }
        .mode-block { z-index: 1; display: flex; align-items: center; gap: 10px; }
        .mode-block label { color: var(--duh-muted); font-size: 11px; text-transform: uppercase; letter-spacing: .8px; }
        select, input, button { font: inherit; }
        select, input { min-height: 38px; color: var(--duh-text); border: 1px solid var(--duh-border); border-radius: 10px; background: rgba(255, 255, 255, .08); padding: 7px 10px; }
        select option { color: #123236; }
        .layout { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(360px, .92fr); }
        .panel { min-width: 0; padding: 20px 22px; border-bottom: 1px solid var(--duh-border); }
        .layout > .panel:nth-child(odd) { border-right: 1px solid var(--duh-border); }
        .panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 14px; }
        .eyebrow { margin: 0 0 4px; color: var(--duh-green); font-size: 10px; font-weight: 800; letter-spacing: 1.25px; text-transform: uppercase; }
        h3 { margin: 0; font-size: 17px; letter-spacing: -.25px; }
        .reason { max-width: 560px; margin: 7px 0 0; color: var(--duh-muted); font-size: 12px; line-height: 1.45; cursor: pointer; }
        .budget { flex: 0 0 auto; padding: 9px 12px; border: 1px solid var(--duh-border); border-radius: 12px; background: rgba(255, 255, 255, .05); text-align: right; }
        .budget span { display: block; color: var(--duh-muted); font-size: 10px; }
        .budget strong { color: ${net < 0 ? "#ffad9d" : "var(--duh-green)"}; font-size: 18px; }
        .power-flow { display: block; width: 100%; max-height: 330px; }
        .home-glow { fill: url(#home-glow); }
        .flow { stroke: rgba(189, 226, 220, .18); stroke-width: 5; stroke-linecap: round; marker-end: none; }
        .flow.active { marker-end: url(#flow-arrow); stroke-dasharray: 8 10; animation: energy-flow 1.25s linear infinite; }
        .flow.active.solar-flow { stroke: var(--duh-yellow); }
        .flow.active.grid-flow { stroke: var(--duh-blue); }
        .flow.active.battery-flow { stroke: #b296ff; }
        .flow.active.ev-flow { stroke: var(--duh-green); }
        #flow-arrow path { fill: var(--duh-green); }
        @keyframes energy-flow { to { stroke-dashoffset: -36; } }
        .flow-node { cursor: pointer; }
        .flow-node rect { fill: rgba(10, 43, 48, .94); stroke: var(--duh-border); stroke-width: 1.5; transition: transform .2s, fill .2s; }
        .flow-node:hover rect { fill: rgba(21, 66, 65, .98); }
        .flow-node ha-icon { color: var(--duh-green); --mdc-icon-size: 27px; }
        .solar-node ha-icon { color: var(--duh-yellow); }
        .house-node rect { fill: rgba(26, 76, 67, .95); stroke: rgba(104, 227, 174, .35); }
        .node-label { fill: var(--duh-muted); font-size: 12px; }
        .node-value { fill: var(--duh-text); font-size: 15px; font-weight: 800; }
        .price-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
        .entity-tile { min-width: 0; display: grid; grid-template-columns: 28px 1fr; align-items: center; gap: 1px 6px; padding: 9px 10px; border: 1px solid var(--duh-border); border-radius: 11px; background: rgba(255, 255, 255, .04); cursor: pointer; }
        .entity-tile ha-icon { grid-row: 1 / 3; color: var(--duh-green); --mdc-icon-size: 21px; }
        .entity-tile span { color: var(--duh-muted); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .entity-tile strong { font-size: 13px; white-space: nowrap; }
        .entity-tile strong small { color: var(--duh-muted); font-size: 9px; font-weight: 500; }
        .forecast-chart { display: block; width: 100%; min-height: 260px; overflow: visible; }
        .grid-line { stroke: rgba(206, 239, 234, .07); stroke-width: 1; }
        .horizontal { stroke-dasharray: 3 7; }
        .axis-label, .axis-title, .now-label { fill: var(--duh-muted); font-size: 10px; }
        .axis-title { font-weight: 700; }
        .solar-area { fill: url(#duh-solar-fill); }
        .solar-line, .buy-line, .sell-line { fill: none; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
        .solar-line { stroke: var(--duh-yellow); }
        .buy-line { stroke: var(--duh-blue); }
        .sell-line { stroke: var(--duh-green); }
        .solar-point { fill: var(--duh-yellow); }
        .buy-point { fill: var(--duh-blue); }
        .sell-point { fill: var(--duh-green); }
        .now-line { stroke: rgba(255, 255, 255, .65); stroke-width: 1; stroke-dasharray: 4 4; }
        .legend { display: flex; flex-wrap: wrap; gap: 14px; color: var(--duh-muted); font-size: 10px; }
        .legend span { display: inline-flex; align-items: center; gap: 5px; }
        .legend i { width: 9px; height: 9px; border-radius: 50%; }
        .legend .solar { background: var(--duh-yellow); } .legend .buy { background: var(--duh-blue); } .legend .sell { background: var(--duh-green); }
        .timeline-row { display: grid; grid-template-columns: 58px 13px 1fr auto; gap: 9px; min-height: 62px; }
        .timeline-time { display: flex; flex-direction: column; text-align: right; }
        .timeline-time strong { font-size: 11px; } .timeline-time span { color: var(--duh-muted); font-size: 9px; margin-top: 2px; }
        .timeline-row > i { position: relative; border-left: 2px solid rgba(104, 227, 174, .19); }
        .timeline-row > i:before { content: ""; position: absolute; left: -5px; top: 4px; width: 8px; height: 8px; border-radius: 50%; background: var(--duh-green); box-shadow: 0 0 8px rgba(104, 227, 174, .5); }
        .timeline-row div:nth-child(3) > strong { font-size: 12px; }
        .timeline-row p { margin: 3px 0; color: var(--duh-muted); font-size: 10px; line-height: 1.35; }
        .timeline-row b { color: #d6ebe8; font-size: 10px; white-space: nowrap; }
        .period-tabs { display: flex; gap: 4px; margin-bottom: 12px; padding: 4px; border-radius: 12px; background: rgba(0, 0, 0, .15); overflow-x: auto; }
        .period-tabs button { flex: 1 0 auto; min-height: 32px; border: 0; border-radius: 8px; color: var(--duh-muted); background: transparent; cursor: pointer; font-size: 11px; font-weight: 700; }
        .period-tabs button.selected { color: #0b2b2c; background: var(--duh-green); box-shadow: 0 5px 14px rgba(104, 227, 174, .15); }
        .stats-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
        .stat { display: grid; grid-template-columns: 23px 1fr; align-items: center; gap: 2px 5px; padding: 8px; border: 1px solid var(--duh-border); border-radius: 10px; background: rgba(255, 255, 255, .035); cursor: pointer; }
        .stat ha-icon { grid-row: 1 / 3; color: var(--duh-green); --mdc-icon-size: 19px; }
        .stat span { color: var(--duh-muted); font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stat strong { font-size: 12px; white-space: nowrap; } .stat small { color: var(--duh-muted); font-size: 8px; font-weight: 500; }
        .fine-print { margin: 10px 0 0; color: var(--duh-muted); font-size: 9px; line-height: 1.4; }
        .activity-stream { position: relative; max-height: 330px; overflow-y: auto; padding-right: 4px; }
        .activity { display: grid; grid-template-columns: 12px 1fr; gap: 8px; padding-bottom: 14px; }
        .activity > i { position: relative; border-left: 1px solid rgba(104, 227, 174, .2); margin-left: 4px; }
        .activity > i:before { content: ""; position: absolute; left: -4px; top: 3px; width: 7px; height: 7px; border-radius: 50%; background: var(--duh-yellow); }
        .activity-head { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; }
        .activity-head time { color: var(--duh-muted); white-space: nowrap; }
        .activity p { margin: 4px 0; color: #d6e9e6; font-size: 11px; line-height: 1.4; }
        .activity small { color: var(--duh-muted); font-size: 10px; }
        .activity details { margin-top: 5px; }
        .activity summary { color: var(--duh-green); cursor: pointer; font-size: 9px; }
        .activity ul { margin: 5px 0 0; padding-left: 18px; color: var(--duh-muted); font-family: monospace; font-size: 9px; line-height: 1.45; }
        .empty { display: flex; align-items: center; gap: 8px; min-height: 70px; color: var(--duh-muted); font-size: 11px; line-height: 1.45; }
        .chart-empty { min-height: 260px; justify-content: center; }
        .section-details { border-bottom: 1px solid var(--duh-border); }
        .section-details > summary { padding: 15px 24px; color: #d5e7e4; cursor: pointer; font-size: 12px; font-weight: 700; list-style-position: inside; }
        .controls { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 0 24px 20px; }
        button.command { display: inline-flex; justify-content: center; align-items: center; gap: 6px; min-height: 39px; padding: 7px 9px; border: 1px solid var(--duh-border); border-radius: 10px; color: var(--duh-text); background: rgba(255, 255, 255, .06); cursor: pointer; font-size: 10px; font-weight: 700; }
        button.command:hover { background: rgba(104, 227, 174, .15); }
        button.command ha-icon { --mdc-icon-size: 17px; color: var(--duh-green); }
        .settings { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .setting { display: grid; grid-template-columns: 1fr 100px; align-items: center; gap: 10px; color: var(--duh-muted); font-size: 10px; }
        .setting span { display: flex; align-items: center; gap: 4px; cursor: pointer; }
        .setting ha-icon { --mdc-icon-size: 13px; }
        .setting input { width: 100%; }
        @media (max-width: 900px) {
          .layout { grid-template-columns: 1fr; }
          .layout > .panel:nth-child(odd) { border-right: 0; }
          .stats-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        @media (max-width: 600px) {
          .topbar { grid-template-columns: 1fr; padding: 18px; }
          .mode-block { justify-content: space-between; }
          .mode-block select { flex: 1; }
          .panel { padding: 17px 15px; }
          .price-strip, .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .controls, .settings { grid-template-columns: 1fr 1fr; padding: 0 15px 16px; }
          .power-flow { min-height: 250px; }
          .forecast-chart { min-height: 220px; }
        }
        @media (prefers-reduced-motion: reduce) { .flow.active { animation: none; } }
      </style>
      <ha-card class="${tone}">
        <header class="topbar">
          <div class="brand">
            <div class="brand-mark"><ha-icon icon="mdi:home-lightning-bolt"></ha-icon></div>
            <div><h2>${this._escape(this.config.title)}</h2><div class="status-line" data-entity="${this.config.status_entity}" role="button" tabindex="0"><i class="dot"></i>${this._escape(status)}</div></div>
          </div>
          <div class="mode-block"><label for="duh-mode" data-entity="select.duhnergy_mode" role="button" tabindex="0">Operating mode</label><select id="duh-mode" data-select="select.duhnergy_mode">
            ${["shadow", "auto", "off"].map((item) => `<option value="${item}" ${mode === item ? "selected" : ""}>${this._label(item)}</option>`).join("")}
          </select></div>
        </header>
        <main class="layout">
          <section class="panel">
            <div class="panel-head"><div><p class="eyebrow">Live energy</p><h3>Animated power flow</h3><p class="reason" data-entity="${this.config.reason_entity}" role="button" tabindex="0">${this._escape(reason)}</p></div>
              <div class="budget"><span>24-hour budget</span><strong>${net >= 0 ? "+" : ""}${net.toFixed(1)} kWh</strong></div>
            </div>
            ${this._powerFlow(planAttributes)}
          </section>
          <section class="panel">
            <div class="panel-head"><div><p class="eyebrow">24-hour outlook</p><h3>Solar and market prices</h3></div>
              <div class="legend"><span><i class="solar"></i>Solar</span><span><i class="buy"></i>Buy</span><span><i class="sell"></i>Sell</span></div>
            </div>
            <div class="price-strip">
              ${this._entityTile("mdi:cash-minus", "Buy now", "sensor.duhnergy_current_buy_price", this._format(forecastAttributes.current_buy_price), `${currency}/kWh`)}
              ${this._entityTile("mdi:arrow-down-bold", "Buy low", this.config.forecast_entity, this._format(forecastAttributes.buy_summary?.min), `${currency}/kWh`)}
              ${this._entityTile("mdi:arrow-up-bold", "Buy high", this.config.forecast_entity, this._format(forecastAttributes.buy_summary?.max), `${currency}/kWh`)}
              ${this._entityTile("mdi:cash-plus", "Sell now", "sensor.duhnergy_current_sell_price", this._format(forecastAttributes.current_sell_price), `${currency}/kWh`)}
              ${this._entityTile("mdi:arrow-up-bold-circle", "Sell high", this.config.forecast_entity, this._format(forecastAttributes.sell_summary?.max), `${currency}/kWh`)}
              ${this._entityTile("mdi:weather-sunny", "Solar peak", this.config.forecast_entity, this._format(Math.max(0, ...solarSummary.map(Number))), "kW")}
            </div>
            ${this._forecastChart(forecastAttributes)}
          </section>
          <section class="panel">
            <div class="panel-head"><div><p class="eyebrow">Today plan</p><h3>Calculated timeline</h3></div></div>
            <div class="timeline">${timelineRows}</div>
          </section>
          <section class="panel" data-entity-panel="${this.config.stats_entity}">
            <div class="panel-head"><div><p class="eyebrow">Persistent accounting</p><h3>Energy and money stats</h3></div></div>
            ${this._stats(statsAttributes)}
          </section>
          <section class="panel">
            <div class="panel-head"><div><p class="eyebrow">Shadow mode</p><h3 data-entity="${this.config.log_entity}" role="button" tabindex="0">Simulator activity</h3></div>
              <button class="command" data-button="button.duhnergy_clear_simulator_log"><ha-icon icon="mdi:delete-sweep-outline"></ha-icon>Clear</button>
            </div>
            <div class="activity-stream">${this._simulator(logEntries)}</div>
          </section>
          <section class="panel">
            <div class="panel-head"><div><p class="eyebrow">Live values</p><h3>System snapshot</h3></div></div>
            <div class="stats-grid snapshot">
              ${this._entityTile("mdi:battery", "Battery SOC", "sensor.duhnergy_battery_state_of_charge", this._value("sensor.duhnergy_battery_state_of_charge"), "%")}
              ${this._entityTile("mdi:solar-power", "Solar", "sensor.duhnergy_solar_power", this._format(this._number("sensor.duhnergy_solar_power") / 1000), "kW")}
              ${this._entityTile("mdi:home-lightning-bolt", "House", "sensor.duhnergy_house_power", this._format(this._number("sensor.duhnergy_house_power") / 1000), "kW")}
              ${this._entityTile("mdi:transmission-tower", "Grid net", "sensor.duhnergy_grid_net_power", this._format(this._number("sensor.duhnergy_grid_net_power") / 1000), "kW")}
              ${this._entityTile("mdi:battery-charging", "Battery flow", "sensor.duhnergy_battery_power", this._format(this._number("sensor.duhnergy_battery_power") / 1000), "kW")}
              ${this._entityTile("mdi:ev-station", "EV", "sensor.duhnergy_ev_power", this._format(this._number("sensor.duhnergy_ev_power") / 1000), "kW")}
            </div>
          </section>
        </main>
        <details class="section-details" data-section="manual"><summary>Manual controls</summary><div class="controls">
          ${this._button("charge_battery_now", "Charge battery now")}
          ${this._button("export_now", "Export now")}
          ${this._button("hold_battery", "Hold battery")}
          ${this._button("pause_ev", "Pause EV")}
          ${this._button("ev_solar", "EV Solar")}
          ${this._button("ev_battery", "EV Battery")}
          ${this._button("ev_grid", "EV Grid")}
          ${this._button("resume_auto", "Resume Auto", "mdi:play-circle-outline")}
        </div></details>
        <details class="section-details" data-section="settings"><summary>Planning settings</summary><div class="controls settings">
          ${this._setting("Hard backup reserve", "number.duhnergy_hard_backup_reserve")}
          ${this._setting("Export stop SOC", "number.duhnergy_export_stop_soc")}
          ${this._setting("EV battery stop SOC", "number.duhnergy_ev_battery_stop_soc")}
          ${this._setting("Battery capacity", "number.duhnergy_battery_capacity")}
          ${this._setting("Solar forecast margin", "number.duhnergy_solar_forecast_margin")}
          ${this._setting("Daily demand", "number.duhnergy_household_daily_demand")}
          ${this._setting("Grid current limit", "number.duhnergy_grid_current_limit")}
        </div></details>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-entity]").forEach((element) => {
      const open = () => this._openMoreInfo(element.dataset.entity);
      element.addEventListener("click", open);
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
    this.shadowRoot.querySelectorAll("[data-button]").forEach((button) =>
      button.addEventListener("click", () => this._press(button.dataset.button)),
    );
    this.shadowRoot.querySelectorAll("[data-number]").forEach((input) =>
      input.addEventListener("change", () => this._setNumber(input.dataset.number, input.value)),
    );
    this.shadowRoot.querySelectorAll("[data-select]").forEach((select) =>
      select.addEventListener("change", () => this._select(select.dataset.select, select.value)),
    );
    this.shadowRoot.querySelectorAll("[data-period]").forEach((button) =>
      button.addEventListener("click", () => {
        this._statsPeriod = button.dataset.period;
        this._render();
      }),
    );
    this.shadowRoot.querySelectorAll("details[data-section]").forEach((details) => {
      details.open = openDetails.get(details.dataset.section) || false;
    });
  }

  _openMoreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        detail: { entityId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _press(entityId) {
    this._hass.callService("button", "press", { entity_id: entityId });
  }

  _setNumber(entityId, value) {
    this._hass.callService("number", "set_value", {
      entity_id: entityId,
      value: Number(value),
    });
  }

  _select(entityId, option) {
    this._hass.callService("select", "select_option", {
      entity_id: entityId,
      option,
    });
  }
}

class DuhnergyCardEditor extends HTMLElement {
  setConfig(config) {
    this.config = config;
    this.innerHTML =
      "<p>Duhnergy automatically uses its integration entities. The optional title can be changed in YAML.</p>";
  }

  set hass(hass) {
    this._hass = hass;
  }
}

if (!customElements.get("duhnergy-card")) {
  customElements.define("duhnergy-card", DuhnergyCard);
}
if (!customElements.get("duhnergy-card-editor")) {
  customElements.define("duhnergy-card-editor", DuhnergyCardEditor);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "duhnergy-card")) {
  window.customCards.push({
    type: "duhnergy-card",
    name: "Duhnergy!",
    description:
      "Animated energy flow, 24-hour solar and price forecast, persistent stats, Shadow log, settings, and guarded controls.",
    preview: true,
  });
}
console.info("%c DUHNERGY! %c v0.2.0 ", "color:#09252c;background:#68e3ae;font-weight:700", "color:#f4fbfa;background:#123b3d");
