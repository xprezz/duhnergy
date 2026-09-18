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
    const active = this.shadowRoot?.activeElement;
    if (active?.matches("select, input")) return;
    this._render();
  }

  getCardSize() {
    return 14;
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

  _unit(entityId, fallback = "") {
    return this._state(entityId)?.attributes?.unit_of_measurement || fallback;
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

  _format(value, digits = 2, fallback = "—") {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : fallback;
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

  _entityCard({ entityId, icon, eyebrow, value, unit = "", detail = "", tone = "" }) {
    return `<div class="entity-card ${tone}" data-entity="${this._escape(entityId)}" role="button" tabindex="0">
      <div class="entity-copy">
        <span>${this._escape(eyebrow)}</span>
        <strong>${this._escape(value)}${unit ? ` <small>${this._escape(unit)}</small>` : ""}</strong>
        ${detail ? `<em>${this._escape(detail)}</em>` : ""}
      </div>
      <div class="icon-orb"><ha-icon icon="${icon}"></ha-icon></div>
    </div>`;
  }

  _weatherIcon(condition) {
    const icons = {
      "clear-night": "mdi:weather-night",
      cloudy: "mdi:weather-cloudy",
      exceptional: "mdi:alert-circle-outline",
      fog: "mdi:weather-fog",
      hail: "mdi:weather-hail",
      lightning: "mdi:weather-lightning",
      "lightning-rainy": "mdi:weather-lightning-rainy",
      partlycloudy: "mdi:weather-partly-cloudy",
      pouring: "mdi:weather-pouring",
      rainy: "mdi:weather-rainy",
      snowy: "mdi:weather-snowy",
      "snowy-rainy": "mdi:weather-snowy-rainy",
      sunny: "mdi:weather-sunny",
      windy: "mdi:weather-windy",
      "windy-variant": "mdi:weather-windy-variant",
    };
    return icons[condition] || "mdi:weather-partly-cloudy";
  }

  _productionPill(entityId, icon, label, value, unit, tone = "") {
    return `<div class="production-pill ${tone}" data-entity="${this._escape(entityId)}" role="button" tabindex="0">
      <ha-icon icon="${icon}"></ha-icon><span>${this._escape(label)}</span>
      <strong>${this._escape(value)} <small>${this._escape(unit)}</small></strong>
    </div>`;
  }

  _powerTopology(planAttributes, forecastAttributes) {
    const sources = planAttributes?.source_entities || {};
    const conventions = planAttributes?.conventions || {};
    const solar = this._number("sensor.duhnergy_solar_power");
    const house = this._number("sensor.duhnergy_house_power");
    const battery = this._number("sensor.duhnergy_battery_power");
    const grid = this._number("sensor.duhnergy_grid_net_power");
    const ev = this._number("sensor.duhnergy_ev_power");
    const soc = this._number("sensor.duhnergy_battery_state_of_charge");
    const batteryCharging =
      conventions.battery_power_positive === "discharge" ? battery < 0 : battery > 0;
    const gridImporting =
      conventions.grid_power_positive === "export" ? grid < 0 : grid > 0;
    const gridDirection = Math.abs(grid) < 20 ? "Balanced" : gridImporting ? "Importing" : "Exporting";
    const batteryDirection =
      Math.abs(battery) < 20 ? "Standing by" : batteryCharging ? "Charging" : "Discharging";
    const flowPower = Math.max(solar, house, Math.abs(grid), Math.abs(battery), ev) / 1000;
    const currency = forecastAttributes?.currency || "DKK";
    const solarToday = sources.solar_today;
    const solarTodayEnergy = sources.solar_today_energy;
    const weather = planAttributes?.weather || {};
    const hasSurfaceData = Array.isArray(planAttributes?.solar_surfaces);
    const surfaces = hasSurfaceData
      ? planAttributes.solar_surfaces.slice(0, 4)
      : [
          {
            entity_id: "sensor.duhnergy_solar_power",
            name: "Solar production",
            power_w: solar,
          },
        ];
    const maximumSurfacePower = Math.max(1, ...surfaces.map((surface) => Number(surface.power_w) || 0));
    const solarPaths = surfaces
      .map((surface, index) => {
        const startX = ((index + 0.5) / surfaces.length) * 1000;
        const path = `M${startX.toFixed(1)} 186 C${startX.toFixed(1)} 205 500 205 500 232`;
        return `<path class="base-path" d="${path}"></path><path class="active-path solar-path ${
          Number(surface.power_w) > 20 ? "is-active" : ""
        }" d="${path}"></path>`;
      })
      .join("");
    const paths = [
      ["grid-path", Math.abs(grid) > 20, !gridImporting],
      ["home-path", house > 20, false],
      ["battery-path", Math.abs(battery) > 20, batteryCharging],
    ];

    return `<div class="topology">
      <svg class="topology-lines" viewBox="0 0 1000 590" preserveAspectRatio="none" aria-hidden="true">
        ${solarPaths}
        <path class="base-path" d="M210 326 C300 326 350 310 405 310"></path>
        <path class="base-path" d="M595 310 C655 310 710 326 790 326"></path>
        <path class="base-path" d="M500 394 C500 430 500 450 500 478"></path>
        ${paths
          .map(([className, active, reverse]) => {
            const definitions = {
              "grid-path": reverse
                ? "M405 310 C350 310 300 326 210 326"
                : "M210 326 C300 326 350 310 405 310",
              "home-path": "M595 310 C655 310 710 326 790 326",
              "battery-path": reverse
                ? "M500 478 C500 450 500 430 500 394"
                : "M500 394 C500 430 500 450 500 478",
            };
            return `<path class="active-path ${className} ${active ? "is-active" : ""}" d="${definitions[className]}"></path>`;
          })
          .join("")}
      </svg>

      <div class="solar-array">
        <div class="weather-production">
          <div class="weather-card" data-entity="${this._escape(weather.entity_id || sources.weather)}" role="button" tabindex="0">
            <div class="weather-icon"><ha-icon icon="${this._weatherIcon(weather.condition)}"></ha-icon></div>
            <div><span>Weather now</span><strong>${this._escape(this._label(weather.condition || "Unavailable"))}</strong>
              <em>${weather.temperature == null ? "—" : `${this._format(weather.temperature, 1)}${weather.temperature_unit || "°C"}`} ${
                weather.humidity == null ? "" : `· ${this._format(weather.humidity, 0)}% humidity`
              }</em></div>
          </div>
          <div class="production-pills">
            ${this._productionPill(
              "sensor.duhnergy_solar_power",
              "mdi:solar-power",
              "Producing now",
              this._format(solar / 1000, 1),
              "kW",
              "live",
            )}
            ${this._productionPill(
              solarToday || "sensor.duhnergy_forecast_solar_energy",
              "mdi:weather-sunny",
              "Forecast today",
              solarToday ? this._value(solarToday) : this._value("sensor.duhnergy_forecast_solar_energy"),
              solarToday ? this._unit(solarToday, "kWh") : "kWh",
            )}
            ${this._productionPill(
              solarTodayEnergy || "sensor.duhnergy_lifetime_solar_production",
              "mdi:counter",
              "Produced today",
              planAttributes.solar_today_energy_kwh == null
                ? "—"
                : this._format(planAttributes.solar_today_energy_kwh, 1),
              "kWh",
              "actual",
            )}
          </div>
        </div>
        <div class="section-kicker"><span>Solar surfaces</span><b>${surfaces.length} configured ${
          surfaces.length === 1 ? "surface" : "surfaces"
        }</b></div>
        <div class="solar-cards" style="--surface-count:${Math.max(1, surfaces.length)}">
          ${
            surfaces.length
              ? surfaces
                  .map(
                    (surface, index) => `<div class="surface-card" data-entity="${this._escape(
                      surface.entity_id,
                    )}" role="button" tabindex="0">
                      <div class="surface-head"><span>${this._escape(
                        surface.name,
                      )}</span><b>Surface ${index + 1}</b></div>
                      <div class="surface-main"><div class="icon-orb"><ha-icon icon="mdi:solar-panel-large"></ha-icon></div>
                        <strong>${this._format(Number(surface.power_w) / 1000, 2)} <small>kW</small></strong></div>
                      <i class="surface-track"><u style="width:${
                        Number(surface.power_w) > 0
                          ? Math.max(3, (Number(surface.power_w) / maximumSurfacePower) * 100)
                          : 0
                      }%"></u></i>
                    </div>`,
                  )
                  .join("")
              : `<div class="surface-unavailable"><ha-icon icon="mdi:solar-panel-large"></ha-icon><span>Configured solar surfaces are currently unavailable</span></div>`
          }
        </div>
      </div>

      <div class="topology-node grid-node ${Math.abs(grid) > 20 ? "active-grid" : ""}" data-entity="sensor.duhnergy_grid_net_power" role="button" tabindex="0">
        <div>
          <span>Public power grid</span>
          <strong>${gridDirection} ${this._format(Math.abs(grid) / 1000, 1)} kW</strong>
          <em>${this._format(forecastAttributes?.current_buy_price)} ${this._escape(currency)}/kWh buy</em>
        </div>
        <div class="icon-orb"><ha-icon icon="mdi:transmission-tower"></ha-icon></div>
      </div>

      <div class="topology-node core-node" data-entity="${this._escape(this.config.status_entity)}" role="button" tabindex="0">
        <span>Duhnergy energy manager</span>
        <div class="core-icon"><ha-icon icon="mdi:lightning-bolt"></ha-icon></div>
        <strong>${this._format(flowPower, 1)} kW flow</strong>
        <em>${this._escape(this._label(this._value(this.config.plan_entity, "idle")))}</em>
      </div>

      <div class="topology-node home-node" data-entity="sensor.duhnergy_house_power" role="button" tabindex="0">
        <div class="home-summary">
          <div><span>Household load</span><strong>${this._format(house / 1000, 1)} kW</strong></div>
          <div class="icon-orb"><ha-icon icon="mdi:home-lightning-bolt"></ha-icon></div>
        </div>
        <div class="ev-subnode" data-entity="sensor.duhnergy_ev_power" role="button" tabindex="0">
          <ha-icon icon="mdi:car-electric"></ha-icon>
          <div><span>EV charger</span><strong>${ev > 20 ? `${this._format(ev / 1000, 1)} kW charging` : "Idle"}</strong></div>
        </div>
      </div>

      <div class="topology-node battery-node ${Math.abs(battery) > 20 ? "active-battery" : ""}" data-entity="sensor.duhnergy_battery_power" role="button" tabindex="0">
        <div class="icon-orb"><ha-icon icon="${batteryCharging ? "mdi:battery-charging" : "mdi:battery"}"></ha-icon></div>
        <div>
          <span>Home battery</span>
          <strong>${batteryDirection} ${Math.abs(battery) < 20 ? "" : `${this._format(Math.abs(battery) / 1000, 1)} kW`}</strong>
          <em>Reserve protection active</em>
        </div>
        <div class="soc"><b>${this._format(soc, 0)}%</b><i><u style="width:${Math.min(100, Math.max(0, soc))}%"></u></i></div>
      </div>
    </div>`;
  }

  _chartFrame(attributes) {
    const timestamps = Array.isArray(attributes?.timestamps) ? attributes.timestamps : [];
    const solar = Array.isArray(attributes?.solar_kw) ? attributes.solar_kw : [];
    const buy = Array.isArray(attributes?.buy_price) ? attributes.buy_price : [];
    const sell = Array.isArray(attributes?.sell_price) ? attributes.sell_price : [];
    const width = 760;
    const height = 230;
    const left = 34;
    const right = 742;
    const top = 14;
    const bottom = 190;
    const x = (index) => left + (index / Math.max(1, timestamps.length - 1)) * (right - left);
    const ticks = [...new Set([0, 6, 12, 18, timestamps.length - 1].filter((index) => index < timestamps.length))]
      .map(
        (index) => `<g><line class="chart-grid" x1="${x(index)}" y1="${top}" x2="${x(index)}" y2="${bottom}"></line>
          <text class="chart-label" x="${x(index)}" y="216" text-anchor="middle">${this._escape(
            this._time(timestamps[index], { weekday: undefined }),
          )}</text></g>`,
      )
      .join("");
    return { timestamps, solar, buy, sell, width, height, left, right, top, bottom, x, ticks };
  }

  _solarChart(attributes) {
    const frame = this._chartFrame(attributes);
    if (!frame.timestamps.length) return this._emptyChart();
    const values = frame.solar.filter((value) => value != null && Number.isFinite(Number(value))).map(Number);
    const maximum = Math.max(1, ...values) * 1.12;
    const y = (value) => frame.bottom - (Number(value) / maximum) * (frame.bottom - frame.top);
    const segments = this._segments(frame.solar, frame.x, y);
    const line = (segment) =>
      segment.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
    const grid = [0, 0.5, 1]
      .map((fraction) => {
        const tickY = frame.bottom - fraction * (frame.bottom - frame.top);
        return `<line class="chart-grid horizontal" x1="${frame.left}" y1="${tickY}" x2="${frame.right}" y2="${tickY}"></line>
          <text class="chart-label" x="${frame.left - 7}" y="${tickY + 4}" text-anchor="end">${(maximum * fraction).toFixed(1)}</text>`;
      })
      .join("");
    const areas = segments
      .map((segment) => `<path class="solar-area" d="M${segment[0][0]},${frame.bottom} ${line(segment)} L${segment.at(-1)[0]},${frame.bottom} Z"></path>`)
      .join("");
    const paths = segments.map((segment) => `<path class="solar-line" d="${line(segment)}"></path>`).join("");
    const points = segments
      .flat()
      .map(
        (point) => `<circle class="solar-point" cx="${point[0]}" cy="${point[1]}" r="3"><title>${this._escape(
          this._time(frame.timestamps[point[3]]),
        )}: ${this._format(point[2])} kW</title></circle>`,
      )
      .join("");
    return `<svg class="analytics-chart" viewBox="0 0 ${frame.width} ${frame.height}" role="img" aria-label="24-hour solar forecast">
      <defs><linearGradient id="solar-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f5a900" stop-opacity=".34"></stop><stop offset="100%" stop-color="#f5a900" stop-opacity=".02"></stop></linearGradient></defs>
      ${frame.ticks}${grid}${areas}${paths}${points}
    </svg>`;
  }

  _priceChart(attributes) {
    const frame = this._chartFrame(attributes);
    if (!frame.timestamps.length) return this._emptyChart();
    const values = [...frame.buy, ...frame.sell]
      .filter((value) => value != null && Number.isFinite(Number(value)))
      .map(Number);
    const minimum = Math.min(0, ...values);
    const maximum = Math.max(1, ...values);
    const range = Math.max(0.1, maximum - minimum);
    const y = (value) => frame.bottom - ((Number(value) - minimum) / range) * (frame.bottom - frame.top);
    const sellSegments = this._segments(frame.sell, frame.x, y);
    const sellPaths = sellSegments
      .map((segment) => `<path class="sell-line" d="${segment.map((point, index) => `${index ? "L" : "M"}${point[0]},${point[1]}`).join(" ")}"></path>`)
      .join("");
    const availableBuy = frame.buy.filter((value) => value != null && Number.isFinite(Number(value))).map(Number);
    const low = availableBuy.length ? Math.min(...availableBuy) + (Math.max(...availableBuy) - Math.min(...availableBuy)) * 0.3 : 0;
    const high = availableBuy.length ? Math.min(...availableBuy) + (Math.max(...availableBuy) - Math.min(...availableBuy)) * 0.72 : 0;
    const barWidth = Math.max(5, (frame.right - frame.left) / Math.max(24, frame.timestamps.length) - 4);
    const bars = frame.buy
      .map((value, index) => {
        if (value == null || !Number.isFinite(Number(value))) return "";
        const numeric = Number(value);
        const barY = y(Math.max(0, numeric));
        const zeroY = y(0);
        const className = numeric <= low ? "low" : numeric >= high ? "high" : "normal";
        return `<rect class="price-bar ${className}" x="${frame.x(index) - barWidth / 2}" y="${Math.min(barY, zeroY)}" width="${barWidth}" height="${Math.max(2, Math.abs(zeroY - barY))}" rx="4">
          <title>${this._escape(this._time(frame.timestamps[index]))}: ${this._format(numeric)} ${this._escape(attributes.currency || "")}/kWh buy</title>
        </rect>`;
      })
      .join("");
    const grid = [0, 0.5, 1]
      .map((fraction) => {
        const tickY = frame.bottom - fraction * (frame.bottom - frame.top);
        return `<line class="chart-grid horizontal" x1="${frame.left}" y1="${tickY}" x2="${frame.right}" y2="${tickY}"></line>
          <text class="chart-label" x="${frame.left - 7}" y="${tickY + 4}" text-anchor="end">${(minimum + range * fraction).toFixed(1)}</text>`;
      })
      .join("");
    return `<svg class="analytics-chart" viewBox="0 0 ${frame.width} ${frame.height}" role="img" aria-label="24-hour buy and sell price forecast">
      ${frame.ticks}${grid}${bars}${sellPaths}
    </svg>`;
  }

  _segments(values, xScale, yScale) {
    const result = [];
    let current = [];
    values.forEach((value, index) => {
      if (value == null || !Number.isFinite(Number(value))) {
        if (current.length) result.push(current);
        current = [];
      } else {
        current.push([xScale(index), yScale(value), Number(value), index]);
      }
    });
    if (current.length) result.push(current);
    return result;
  }

  _emptyChart() {
    return `<div class="empty-chart"><ha-icon icon="mdi:chart-bell-curve-cumulative"></ha-icon>Waiting for forecast data</div>`;
  }

  _simulator(entries) {
    if (!entries.length) {
      return `<div class="empty-state">No Shadow decisions yet. New entries appear when the proposed action changes.</div>`;
    }
    return entries
      .slice(0, 8)
      .map(
        (entry) => `<article class="decision">
          <time title="${this._escape(this._time(entry.timestamp, { weekday: "long" }))}">${this._escape(
            this._time(entry.timestamp, { weekday: undefined }),
          )}</time>
          <div><strong>${this._escape(this._label(entry.planned_action))}</strong><p>${this._escape(
            entry.message,
          )}</p><small>${this._escape(entry.reason)} · ${this._escape(this._relativeTime(entry.timestamp))}</small></div>
        </article>`,
      )
      .join("");
  }

  _timeline(items, currency) {
    if (!items.length) return `<div class="empty-state">No grid actions planned in the next 24 hours.</div>`;
    return items
      .map(
        (item) => `<article class="timeline-item">
          <time>${this._escape(this._time(item.start, { weekday: undefined }))}<small>${this._escape(
            this._time(item.end, { weekday: undefined }),
          )}</small></time>
          <i></i>
          <div><strong>${this._escape(this._label(item.action))}</strong><p>${this._escape(item.reason)}</p></div>
          ${item.price == null ? "" : `<b>${this._format(item.price)} ${this._escape(currency)}</b>`}
        </article>`,
      )
      .join("");
  }

  _stats(attributes) {
    const period = attributes?.periods?.[this._statsPeriod] || {};
    const currency = attributes?.currency || "DKK";
    const metrics = [
      ["solar_production_kwh", "Solar", "mdi:solar-power", "kWh", "sensor.duhnergy_lifetime_solar_production"],
      ["household_consumption_kwh", "Household", "mdi:home-lightning-bolt", "kWh", "sensor.duhnergy_lifetime_household_consumption"],
      ["grid_import_kwh", "Grid import", "mdi:transmission-tower-import", "kWh", "sensor.duhnergy_lifetime_grid_import"],
      ["grid_export_kwh", "Grid export", "mdi:transmission-tower-export", "kWh", "sensor.duhnergy_lifetime_grid_export"],
      ["battery_charged_kwh", "Battery in", "mdi:battery-plus", "kWh", "sensor.duhnergy_lifetime_battery_charged"],
      ["battery_discharged_kwh", "Battery out", "mdi:battery-minus", "kWh", "sensor.duhnergy_lifetime_battery_discharged"],
      ["ev_charged_kwh", "EV charged", "mdi:car-electric", "kWh", "sensor.duhnergy_lifetime_ev_charged"],
      ["import_cost", "Import cost", "mdi:cash-minus", currency, "sensor.duhnergy_lifetime_import_cost"],
      ["export_revenue", "Export revenue", "mdi:cash-plus", currency, "sensor.duhnergy_lifetime_export_revenue"],
      ["net_cost", "Net cost", "mdi:scale-balance", currency, "sensor.duhnergy_lifetime_net_cost"],
    ];
    return `<div class="period-tabs" role="tablist">
      ${["today", "week", "month", "year", "lifetime"]
        .map(
          (name) => `<button class="${name === this._statsPeriod ? "selected" : ""}" data-period="${name}" role="tab" aria-selected="${name === this._statsPeriod}">${this._label(name)}</button>`,
        )
        .join("")}
    </div>
    <div class="metric-grid">${metrics
      .map(
        ([key, label, icon, unit, entityId]) => `<div class="metric" data-entity="${entityId}" role="button" tabindex="0">
          <div class="icon-orb"><ha-icon icon="${icon}"></ha-icon></div><span>${label}</span>
          <strong>${this._format(period[key], unit === "kWh" ? 3 : 2)} <small>${unit}</small></strong>
        </div>`,
      )
      .join("")}</div>`;
  }

  _setting(label, entityId, detail = "") {
    const state = this._state(entityId);
    return `<label class="setting-row">
      <span data-entity="${entityId}" role="button" tabindex="0"><strong>${this._escape(label)}</strong>${detail ? `<small>${this._escape(detail)}</small>` : ""}</span>
      <input data-number="${entityId}" type="number" value="${this._escape(state?.state || "")}" min="${state?.attributes?.min ?? ""}" max="${state?.attributes?.max ?? ""}" step="${state?.attributes?.step ?? "1"}">
    </label>`;
  }

  _slider(label, entityId, detail = "") {
    const state = this._state(entityId);
    const value = state?.state || "0";
    const unit = state?.attributes?.unit_of_measurement || "";
    return `<label class="slider-row">
      <span data-entity="${entityId}" role="button" tabindex="0"><strong>${this._escape(
        label,
      )}</strong>${detail ? `<small>${this._escape(detail)}</small>` : ""}</span>
      <div class="slider-value"><output data-output="${entityId}">${this._escape(
        value,
      )} ${this._escape(unit)}</output></div>
      <input data-range="${entityId}" data-number="${entityId}" type="range" value="${this._escape(
        value,
      )}" min="${state?.attributes?.min ?? "0"}" max="${state?.attributes?.max ?? "100"}" step="${
        state?.attributes?.step ?? "1"
      }" aria-label="${this._escape(label)}">
    </label>`;
  }

  _button(command, label, icon = "mdi:gesture-tap-button") {
    return `<button class="command" data-button="button.duhnergy_${command}"><ha-icon icon="${icon}"></ha-icon><span>${this._escape(label)}</span></button>`;
  }

  _render() {
    if (!this.shadowRoot || !this.config || !this._hass) return;
    const openSections = new Map(
      [...this.shadowRoot.querySelectorAll("details[data-section]")].map((details) => [
        details.dataset.section,
        details.open,
      ]),
    );
    const status = this._value(this.config.status_entity, "Loading");
    const reason = this._value(this.config.reason_entity, "Waiting for the first calculation");
    const mode = this._value("select.duhnergy_mode", "shadow");
    const planState = this._state(this.config.plan_entity);
    const planAttributes = planState?.attributes || {};
    const timeline = Array.isArray(planAttributes.timeline) ? planAttributes.timeline : [];
    const forecastAttributes = this._state(this.config.forecast_entity)?.attributes || {};
    const statsAttributes = this._state(this.config.stats_entity)?.attributes || {};
    const logEntries = this._state(this.config.log_entity)?.attributes?.entries || [];
    const currency = forecastAttributes.currency || statsAttributes.currency || "DKK";
    const net = this._number("sensor.duhnergy_predicted_surplus_or_deficit");
    const currentBuy = forecastAttributes.current_buy_price;
    const currentSell = forecastAttributes.current_sell_price;
    const solarValues = (forecastAttributes.solar_kw || []).filter((value) => value != null).map(Number);
    const solarPeak = solarValues.length ? Math.max(...solarValues) : null;
    const generatedAt = planAttributes.generated_at;
    const tone = status.startsWith("auto")
      ? "auto"
      : status.startsWith("manual")
        ? "manual"
        : status.startsWith("off")
          ? "off"
          : "shadow";

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --petroleum: #182830;
          --petroleum-light: #1e323c;
          --petroleum-dark: #111e24;
          --text: #eef3f5;
          --muted: #91a5af;
          --cyan: #12c5df;
          --cyan-soft: rgba(18, 197, 223, .16);
          --amber: #ffb400;
          --amber-soft: rgba(255, 180, 0, .14);
          --green: #28d7a2;
          --green-soft: rgba(40, 215, 162, .14);
          --blue: #57a9ff;
          --red: #eb5757;
          --shadow-flat: 8px 8px 18px rgba(8, 16, 20, .7), -6px -6px 16px rgba(43, 70, 82, .48);
          --shadow-small: 4px 4px 10px rgba(8, 16, 20, .68), -3px -3px 9px rgba(43, 70, 82, .42);
          --shadow-inset: inset 4px 4px 9px rgba(8, 16, 20, .75), inset -3px -3px 8px rgba(43, 70, 82, .4);
          display: block;
          color: var(--text);
        }
        * { box-sizing: border-box; }
        ha-card { overflow: hidden; border: 0; border-radius: var(--ha-card-border-radius, 18px); color: var(--text); background: var(--petroleum); font-family: var(--paper-font-body1_-_font-family, Inter, sans-serif); }
        button, input, select { font: inherit; }
        button { color: inherit; }
        [data-entity] { cursor: pointer; }
        [data-entity]:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--cyan); outline-offset: 3px; }
        .dashboard { padding: 16px; background: radial-gradient(circle at 15% 0%, rgba(18, 197, 223, .045), transparent 32%), var(--petroleum); }
        .neo-panel { min-width: 0; border: 1px solid rgba(255, 255, 255, .025); border-radius: 18px; background: var(--petroleum); box-shadow: var(--shadow-flat); }
        .header { display: flex; justify-content: space-between; align-items: center; gap: 18px; padding: 15px 18px; margin-bottom: 22px; }
        .brand { display: flex; align-items: center; gap: 13px; min-width: 0; }
        .brand .icon-orb { width: 44px; height: 44px; color: var(--cyan); }
        .brand h2 { margin: 0; font-size: 21px; letter-spacing: .4px; }
        .brand p { margin: 3px 0 0; color: var(--muted); font-size: 11px; }
        .header-status { display: flex; align-items: stretch; gap: 12px; }
        .status-box, .mode-box { display: flex; align-items: center; gap: 10px; min-height: 50px; padding: 8px 13px; border-radius: 13px; background: var(--petroleum); box-shadow: var(--shadow-inset); }
        .status-box ha-icon { color: var(--cyan); --mdc-icon-size: 17px; }
        .status-box span, .mode-box label { display: block; color: var(--muted); font-size: 8px; letter-spacing: .8px; text-transform: uppercase; }
        .status-box strong { display: block; margin-top: 2px; font-size: 12px; text-transform: capitalize; }
        .live-badge { display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; border-radius: 8px; color: var(--green); background: var(--green-soft); font-size: 9px; font-weight: 800; }
        .live-badge i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }
        .off .live-badge { color: var(--muted); background: rgba(145, 165, 175, .1); }
        .mode-box select { min-width: 105px; height: 32px; padding: 4px 26px 4px 9px; border: 0; border-radius: 8px; color: var(--cyan); background: var(--petroleum-dark); box-shadow: var(--shadow-inset); cursor: pointer; font-size: 11px; font-weight: 700; text-transform: capitalize; }
        .mode-box option { color: var(--text); background: var(--petroleum); }
        .main-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(310px, 1fr); gap: 22px; }
        .topology-panel { min-height: 590px; padding: 20px; overflow: hidden; }
        .panel-title { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; margin-bottom: 16px; }
        .title-copy h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; letter-spacing: .5px; text-transform: uppercase; }
        .title-copy h3 ha-icon { color: var(--cyan); --mdc-icon-size: 17px; }
        .title-copy p { margin: 4px 0 0; color: var(--muted); font-size: 9px; line-height: 1.4; }
        .budget-badge { padding: 7px 10px; border-radius: 10px; background: var(--petroleum); box-shadow: var(--shadow-inset); color: var(--muted); font-size: 9px; white-space: nowrap; }
        .budget-badge strong { color: ${net < 0 ? "#ff867a" : "var(--green)"}; font-size: 12px; }
        .topology { position: relative; display: grid; grid-template-columns: 1fr 1.16fr 1fr; grid-template-rows: auto 210px 100px; grid-template-areas: "solar solar solar" "grid core home" ". battery ."; gap: 16px 20px; min-height: 540px; }
        .topology-lines { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
        .base-path, .active-path { fill: none; stroke-linecap: round; }
        .base-path { stroke: rgba(145, 165, 175, .13); stroke-width: 3; }
        .active-path { opacity: 0; stroke-width: 3; stroke-dasharray: 7 9; }
        .active-path.is-active { opacity: 1; animation: flow-forward 1.3s linear infinite; }
        .solar-path { stroke: var(--amber); }
        .grid-path { stroke: var(--green); }
        .home-path { stroke: var(--cyan); }
        .battery-path { stroke: var(--green); }
        @keyframes flow-forward { to { stroke-dashoffset: -32; } }
        .solar-array { grid-area: solar; position: relative; z-index: 1; }
        .weather-production { display: grid; grid-template-columns: minmax(170px, .72fr) minmax(0, 1.28fr); gap: 12px; margin-bottom: 14px; }
        .weather-card { display: flex; align-items: center; gap: 11px; min-height: 58px; padding: 9px 12px; border: 1px solid rgba(255, 255, 255, .025); border-radius: 13px; background: var(--petroleum); box-shadow: var(--shadow-small); }
        .weather-icon { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 auto; border-radius: 50%; color: var(--amber); background: var(--petroleum); box-shadow: var(--shadow-small); }
        .weather-icon ha-icon { --mdc-icon-size: 24px; }
        .weather-card span, .production-pill span { display: block; color: var(--muted); font-size: 7px; letter-spacing: .45px; text-transform: uppercase; }
        .weather-card strong { display: block; margin-top: 2px; font-size: 11px; }
        .weather-card em { display: block; margin-top: 2px; color: var(--muted); font-size: 8px; font-style: normal; }
        .production-pills { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
        .production-pill { display: grid; grid-template-columns: 23px minmax(0, 1fr); grid-template-rows: auto auto; align-items: center; gap: 1px 6px; min-width: 0; padding: 8px 9px; border: 1px solid rgba(255, 255, 255, .025); border-radius: 11px; background: var(--petroleum); box-shadow: var(--shadow-small); }
        .production-pill ha-icon { grid-row: 1 / 3; color: var(--amber); --mdc-icon-size: 19px; }
        .production-pill strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
        .production-pill small { color: var(--muted); font-size: 7px; font-weight: 500; }
        .production-pill.live strong, .production-pill.live ha-icon { color: var(--amber); }
        .production-pill.actual strong, .production-pill.actual ha-icon { color: var(--green); }
        .section-kicker { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; color: var(--amber); font-size: 10px; font-weight: 800; letter-spacing: .7px; text-transform: uppercase; }
        .section-kicker b { padding: 3px 7px; border-radius: 7px; color: var(--muted); background: var(--petroleum); box-shadow: var(--shadow-inset); font-size: 8px; font-weight: 500; letter-spacing: 0; text-transform: none; }
        .solar-cards { display: grid; grid-template-columns: repeat(var(--surface-count), minmax(0, 1fr)); gap: 10px; }
        .surface-card { min-width: 0; padding: 10px; border: 1px solid rgba(255, 255, 255, .025); border-radius: 12px; background: var(--petroleum); box-shadow: var(--shadow-small); }
        .surface-head { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 7px; }
        .surface-head span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .surface-head b { flex: 0 0 auto; color: var(--amber); font-size: 7px; }
        .surface-main { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 7px 0; }
        .surface-main .icon-orb { width: 34px; height: 34px; color: var(--amber); }
        .surface-main .icon-orb ha-icon { --mdc-icon-size: 19px; }
        .surface-main strong { font-size: 13px; }
        .surface-main small { color: var(--muted); font-size: 8px; }
        .surface-track { display: block; height: 4px; overflow: hidden; border-radius: 5px; background: var(--petroleum-dark); box-shadow: var(--shadow-inset); }
        .surface-track u { display: block; max-width: 100%; height: 100%; border-radius: inherit; background: var(--amber); box-shadow: 0 0 7px rgba(255, 180, 0, .45); text-decoration: none; }
        .surface-unavailable { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 68px; padding: 12px; border-radius: 12px; color: var(--muted); background: var(--petroleum); box-shadow: var(--shadow-inset); font-size: 9px; text-align: center; }
        .surface-unavailable ha-icon { color: var(--amber); --mdc-icon-size: 19px; }
        .entity-card, .topology-node, .metric { border: 1px solid rgba(255, 255, 255, .025); background: var(--petroleum); box-shadow: var(--shadow-small); transition: border-color .2s, transform .2s, box-shadow .2s; }
        .entity-card:hover, .topology-node:hover, .metric:hover { border-color: rgba(18, 197, 223, .28); transform: translateY(-1px); }
        .entity-card { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 90px; padding: 12px; border-radius: 13px; }
        .entity-copy { min-width: 0; display: flex; flex-direction: column; }
        .entity-copy span, .topology-node span { color: var(--muted); font-size: 8px; letter-spacing: .5px; text-transform: uppercase; }
        .entity-copy strong, .topology-node strong { margin-top: 4px; font-size: 14px; }
        .entity-copy small, .metric small { color: var(--muted); font-size: 9px; font-weight: 500; }
        .entity-copy em, .topology-node em { margin-top: 4px; color: var(--muted); font-size: 8px; font-style: normal; }
        .icon-orb { flex: 0 0 auto; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; color: var(--cyan); background: var(--petroleum); box-shadow: var(--shadow-small); }
        .icon-orb ha-icon { --mdc-icon-size: 22px; }
        .solar-card .icon-orb { color: var(--amber); }
        .topology-node { position: relative; z-index: 1; border-radius: 15px; }
        .grid-node { grid-area: grid; align-self: center; display: flex; justify-content: space-between; align-items: center; gap: 10px; min-height: 88px; padding: 15px; }
        .active-grid strong { color: var(--green); }
        .core-node { grid-area: core; align-self: center; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 178px; padding: 18px; text-align: center; border-color: rgba(18, 197, 223, .25); box-shadow: var(--shadow-flat), 0 0 18px rgba(18, 197, 223, .12); }
        .core-node > span { color: var(--cyan); font-weight: 800; }
        .core-node .core-icon { display: grid; place-items: center; width: 62px; height: 62px; margin: 12px 0; border-radius: 50%; color: var(--cyan); background: var(--petroleum); box-shadow: var(--shadow-small); }
        .core-node .core-icon ha-icon { --mdc-icon-size: 31px; }
        .core-node strong { font-size: 18px; }
        .core-node em { color: var(--cyan); }
        .home-node { grid-area: home; align-self: center; min-height: 135px; padding: 14px; }
        .home-summary { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .ev-subnode { display: flex; align-items: center; gap: 9px; margin-top: 12px; padding: 9px; border-radius: 10px; background: var(--petroleum-dark); box-shadow: var(--shadow-inset); }
        .ev-subnode ha-icon { flex: 0 0 auto; color: var(--blue); --mdc-icon-size: 20px; }
        .ev-subnode span { display: block; }
        .ev-subnode strong { display: block; margin-top: 2px; color: var(--blue); font-size: 10px; }
        .battery-node { grid-area: battery; align-self: start; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; min-height: 86px; padding: 12px 15px; border-top-color: rgba(40, 215, 162, .38); }
        .active-battery strong, .battery-node .icon-orb { color: var(--green); }
        .soc { min-width: 62px; text-align: right; }
        .soc b { font-size: 19px; }
        .soc i { display: block; width: 62px; height: 7px; margin-top: 5px; overflow: hidden; border-radius: 7px; background: var(--petroleum-dark); box-shadow: var(--shadow-inset); }
        .soc u { display: block; height: 100%; border-radius: inherit; background: var(--green); box-shadow: 0 0 8px rgba(40, 215, 162, .45); text-decoration: none; }
        .side-stack { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
        .controls-panel, .log-panel { padding: 18px; }
        .control-list { display: flex; flex-direction: column; gap: 12px; }
        .mode-control, .setting-row, .slider-row { border-radius: 13px; background: var(--petroleum); box-shadow: var(--shadow-small); }
        .mode-control, .setting-row { display: grid; grid-template-columns: minmax(0, 1fr) 112px; align-items: center; gap: 12px; min-height: 57px; padding: 10px 12px; }
        .mode-control span, .setting-row > span, .slider-row > span { display: flex; flex-direction: column; min-width: 0; }
        .mode-control strong, .setting-row strong, .slider-row strong { font-size: 10px; }
        .mode-control small, .setting-row small, .slider-row small { margin-top: 3px; color: var(--muted); font-size: 8px; line-height: 1.35; }
        .mode-control select, .setting-row input { width: 100%; min-height: 34px; border: 0; border-radius: 9px; color: var(--cyan); background: var(--petroleum-dark); box-shadow: var(--shadow-inset); padding: 5px 8px; font-size: 10px; font-weight: 700; }
        .slider-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 10px; padding: 10px 12px; }
        .slider-value { align-self: start; min-width: 49px; padding: 4px 6px; border-radius: 7px; color: var(--cyan); background: var(--cyan-soft); font-size: 8px; font-weight: 800; text-align: center; white-space: nowrap; }
        .slider-row input[type="range"] { grid-column: 1 / -1; width: 100%; height: 14px; margin: 2px 0 0; padding: 0; border: 0; background: transparent; box-shadow: none; appearance: none; cursor: pointer; }
        .slider-row input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 6px; background: var(--petroleum-dark); box-shadow: var(--shadow-inset); }
        .slider-row input[type="range"]::-webkit-slider-thumb { width: 16px; height: 16px; margin-top: -5px; border: 0; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 9px rgba(18, 197, 223, .42); appearance: none; }
        .slider-row input[type="range"]::-moz-range-track { height: 6px; border-radius: 6px; background: var(--petroleum-dark); box-shadow: var(--shadow-inset); }
        .slider-row input[type="range"]::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 9px rgba(18, 197, 223, .42); }
        .decision-log { max-height: 270px; padding: 11px; overflow-y: auto; border-radius: 13px; background: var(--petroleum); box-shadow: var(--shadow-inset); }
        .decision { display: grid; grid-template-columns: 48px 1fr; gap: 10px; margin-bottom: 10px; padding: 10px; border: 1px solid rgba(18, 197, 223, .42); border-radius: 11px; background: rgba(17, 30, 36, .4); }
        .decision:last-child { margin-bottom: 0; }
        .decision time { align-self: start; padding: 4px; border-radius: 6px; color: var(--amber); background: var(--amber-soft); font-family: monospace; font-size: 8px; text-align: center; }
        .decision strong { font-size: 10px; }
        .decision p { margin: 3px 0; color: #d9e2e5; font-size: 9px; line-height: 1.4; }
        .decision small { color: var(--muted); font-size: 8px; }
        .empty-state { padding: 20px 12px; color: var(--muted); font-size: 9px; line-height: 1.45; text-align: center; }
        .analytics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 22px; }
        .chart-panel, .timeline-panel, .stats-panel { padding: 18px; }
        .chart-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .legend { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 9px; color: var(--muted); font-size: 8px; }
        .legend span { display: flex; align-items: center; gap: 4px; }
        .legend i { width: 7px; height: 7px; border-radius: 2px; background: currentColor; }
        .analytics-chart { display: block; width: 100%; min-height: 210px; margin-top: 6px; overflow: visible; }
        .chart-grid { stroke: rgba(255, 255, 255, .055); stroke-width: 1; }
        .chart-grid.horizontal { stroke-dasharray: 3 5; }
        .chart-label { fill: var(--muted); font-size: 8px; }
        .solar-area { fill: url(#solar-fill); }
        .solar-line, .sell-line { fill: none; stroke-linejoin: round; stroke-linecap: round; }
        .solar-line { stroke: var(--amber); stroke-width: 2.4; }
        .solar-point { fill: var(--petroleum); stroke: var(--amber); stroke-width: 2; }
        .sell-line { stroke: var(--green); stroke-width: 2.3; }
        .price-bar.low { fill: rgba(40, 215, 162, .72); }
        .price-bar.normal { fill: rgba(18, 197, 223, .64); }
        .price-bar.high { fill: rgba(235, 87, 87, .73); }
        .empty-chart { display: grid; place-items: center; min-height: 220px; color: var(--muted); font-size: 10px; }
        .lower-grid { display: grid; grid-template-columns: minmax(280px, .8fr) minmax(0, 1.2fr); gap: 22px; margin-top: 22px; }
        .timeline { max-height: 310px; overflow-y: auto; padding-right: 3px; }
        .timeline-item { display: grid; grid-template-columns: 55px 12px 1fr auto; gap: 8px; min-height: 58px; }
        .timeline-item time { font-size: 9px; text-align: right; }
        .timeline-item time small { display: block; margin-top: 2px; color: var(--muted); font-size: 7px; }
        .timeline-item > i { position: relative; border-left: 1px solid rgba(40, 215, 162, .28); }
        .timeline-item > i:before { content: ""; position: absolute; left: -4px; top: 2px; width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 7px rgba(40, 215, 162, .45); }
        .timeline-item strong { font-size: 10px; }
        .timeline-item p { margin: 3px 0; color: var(--muted); font-size: 8px; line-height: 1.35; }
        .timeline-item b { color: var(--cyan); font-size: 8px; white-space: nowrap; }
        .period-tabs { display: flex; gap: 4px; margin-bottom: 13px; padding: 4px; overflow-x: auto; border-radius: 11px; background: var(--petroleum); box-shadow: var(--shadow-inset); }
        .period-tabs button { flex: 1 0 auto; min-height: 29px; padding: 4px 8px; border: 0; border-radius: 8px; color: var(--muted); background: transparent; cursor: pointer; font-size: 8px; font-weight: 700; }
        .period-tabs button.selected { color: var(--cyan); background: var(--petroleum-light); box-shadow: var(--shadow-small); }
        .metric-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 9px; }
        .metric { display: grid; grid-template-columns: 30px 1fr; grid-template-rows: auto auto; align-items: center; gap: 1px 7px; min-width: 0; min-height: 64px; padding: 9px; border-radius: 11px; }
        .metric .icon-orb { grid-row: 1 / 3; width: 30px; height: 30px; color: var(--cyan); }
        .metric .icon-orb ha-icon { --mdc-icon-size: 17px; }
        .metric > span { overflow: hidden; color: var(--muted); font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }
        .metric > strong { font-size: 10px; white-space: nowrap; }
        .expander { margin-top: 22px; }
        .expander > summary { padding: 13px 17px; cursor: pointer; color: var(--muted); font-size: 10px; font-weight: 700; }
        .command-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; padding: 2px 17px 17px; }
        .command { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 7px; border: 1px solid rgba(255, 255, 255, .025); border-radius: 10px; color: var(--text); background: var(--petroleum); box-shadow: var(--shadow-small); cursor: pointer; font-size: 8px; font-weight: 700; }
        .command:active { box-shadow: var(--shadow-inset); transform: translateY(1px); }
        .command ha-icon { color: var(--cyan); --mdc-icon-size: 16px; }
        .extra-settings { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; padding: 2px 17px 17px; }
        .clear-log { min-height: 28px; padding: 5px 8px; }
        .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, .045); color: var(--muted); font-size: 8px; text-align: center; }
        @media (max-width: 1000px) {
          .main-grid { grid-template-columns: 1fr; }
          .side-stack { display: grid; grid-template-columns: 1fr 1fr; }
          .topology-panel { min-height: auto; }
          .metric-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        @media (max-width: 720px) {
          .dashboard { padding: 10px; }
          .header { align-items: flex-start; flex-direction: column; padding: 13px; margin-bottom: 16px; }
          .header-status { width: 100%; display: grid; grid-template-columns: 1fr 1fr; }
          .status-box, .mode-box { min-width: 0; }
          .mode-box { flex-direction: column; align-items: stretch; gap: 4px; }
          .mode-box select { min-width: 0; width: 100%; }
          .topology-panel { padding: 14px; }
          .topology { display: flex; flex-direction: column; min-height: 0; gap: 12px; }
          .topology-lines { display: none; }
          .solar-array, .topology-node { width: 100%; }
          .weather-production { grid-template-columns: 1fr; }
          .solar-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .entity-card { min-height: 76px; }
          .grid-node, .core-node, .home-node, .battery-node { align-self: stretch; }
          .grid-node, .core-node, .home-node, .battery-node { border-top: 2px solid rgba(18, 197, 223, .25); }
          .side-stack, .analytics-grid, .lower-grid { grid-template-columns: 1fr; }
          .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .command-grid { grid-template-columns: repeat(2, 1fr); }
          .extra-settings { grid-template-columns: 1fr; }
          .analytics-chart { min-height: 175px; }
        }
        @media (max-width: 400px) {
          .brand h2 { font-size: 17px; }
          .brand p { font-size: 9px; }
          .header-status { grid-template-columns: 1fr; }
          .panel-title, .chart-header { flex-direction: column; }
          .mode-control, .setting-row { grid-template-columns: 1fr 94px; }
          .production-pills, .solar-cards { grid-template-columns: 1fr; }
          .metric-grid { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) { .active-path.is-active { animation: none; } }
      </style>
      <ha-card class="${tone}">
        <div class="dashboard">
          <header class="neo-panel header">
            <div class="brand">
              <div class="icon-orb"><ha-icon icon="mdi:solar-panel-large"></ha-icon></div>
              <div><h2>${this._escape(this.config.title)}</h2><p>Home energy planning, optimisation and accounting</p></div>
            </div>
            <div class="header-status">
              <div class="status-box" data-entity="${this.config.status_entity}" role="button" tabindex="0">
                <ha-icon icon="mdi:clock-outline"></ha-icon><div><span>Last plan</span><strong>${generatedAt ? this._time(generatedAt, { weekday: undefined }) : "Waiting"}</strong></div>
                <b class="live-badge"><i></i>${mode === "off" ? "OFF" : "LIVE"}</b>
              </div>
              <div class="mode-box"><label for="duhnergy-mode">Operating mode</label><select id="duhnergy-mode" data-select="select.duhnergy_mode">
                ${["shadow", "auto", "off"].map((option) => `<option value="${option}" ${mode === option ? "selected" : ""}>${this._label(option)}</option>`).join("")}
              </select></div>
            </div>
          </header>

          <main class="main-grid">
            <section class="neo-panel topology-panel">
              <div class="panel-title">
                <div class="title-copy"><h3><ha-icon icon="mdi:transmission-tower-export"></ha-icon>Live energy</h3><p data-entity="${this.config.reason_entity}" role="button" tabindex="0">${this._escape(reason)}</p></div>
                <div class="budget-badge">24h budget <strong>${net >= 0 ? "+" : ""}${net.toFixed(1)} kWh</strong></div>
              </div>
              ${this._powerTopology(planAttributes, forecastAttributes)}
            </section>

            <aside class="side-stack">
              <section class="neo-panel controls-panel">
                <div class="panel-title"><div class="title-copy"><h3><ha-icon icon="mdi:tune-variant"></ha-icon>Smart optimisations</h3><p>Core planning controls</p></div></div>
                <div class="control-list">
                  <label class="mode-control"><span><strong>Operating mode</strong><small>Shadow observes; Auto may control mapped equipment</small></span><select data-select="select.duhnergy_mode">
                    ${["shadow", "auto", "off"].map((option) => `<option value="${option}" ${mode === option ? "selected" : ""}>${this._label(option)}</option>`).join("")}
                  </select></label>
                  ${this._slider("Hard backup reserve", "number.duhnergy_hard_backup_reserve", "Battery floor preserved by every plan")}
                  ${this._slider("Export stop SOC", "number.duhnergy_export_stop_soc", "Stop battery export at this level")}
                  ${this._slider("EV battery stop SOC", "number.duhnergy_ev_battery_stop_soc", "Protect stored energy during EV charging")}
                  ${this._slider("Solar forecast margin", "number.duhnergy_solar_forecast_margin", "Discount forecast uncertainty")}
                  ${this._slider("Daily household demand", "number.duhnergy_household_daily_demand", "Expected consumption over 24 hours")}
                  ${this._slider("Grid current limit", "number.duhnergy_grid_current_limit", "Shared import limit for EV charging")}
                </div>
              </section>
              <section class="neo-panel log-panel">
                <div class="panel-title"><div class="title-copy"><h3><ha-icon icon="mdi:brain"></ha-icon>Decision log</h3><p>Persistent Shadow-mode plan transitions</p></div>
                  <button class="command clear-log" data-button="button.duhnergy_clear_simulator_log"><ha-icon icon="mdi:delete-sweep-outline"></ha-icon>Clear</button>
                </div>
                <div class="decision-log">${this._simulator(logEntries)}</div>
              </section>
            </aside>
          </main>

          <section class="analytics-grid">
            <div class="neo-panel chart-panel">
              <div class="chart-header"><div class="title-copy"><h3><ha-icon icon="mdi:chart-areaspline"></ha-icon>Solar forecast (24h)</h3><p>Hourly generation outlook · peak ${this._format(solarPeak, 1)} kW</p></div><div class="legend"><span style="color:var(--amber)"><i></i>Solar</span></div></div>
              ${this._solarChart(forecastAttributes)}
            </div>
            <div class="neo-panel chart-panel">
              <div class="chart-header"><div class="title-copy"><h3><ha-icon icon="mdi:cash-multiple"></ha-icon>Electricity prices (${this._escape(currency)}/kWh)</h3><p>Buy-price bands with sell-price overlay</p></div><div class="legend"><span style="color:var(--green)"><i></i>Low buy</span><span style="color:var(--cyan)"><i></i>Normal buy</span><span style="color:var(--red)"><i></i>High buy</span><span style="color:var(--green)"><i></i>Sell</span></div></div>
              <div class="budget-badge">Buy <strong>${this._format(currentBuy)}</strong> · Sell <strong>${this._format(currentSell)}</strong></div>
              ${this._priceChart(forecastAttributes)}
            </div>
          </section>

          <section class="lower-grid">
            <div class="neo-panel timeline-panel">
              <div class="panel-title"><div class="title-copy"><h3><ha-icon icon="mdi:timeline-clock-outline"></ha-icon>Today plan</h3><p>Calculated charge, export and EV windows</p></div></div>
              <div class="timeline">${this._timeline(timeline, currency)}</div>
            </div>
            <div class="neo-panel stats-panel">
              <div class="panel-title"><div class="title-copy"><h3><ha-icon icon="mdi:chart-box-outline"></ha-icon>Energy and money</h3><p>Persistent local-time accounting</p></div></div>
              ${this._stats(statsAttributes)}
            </div>
          </section>

          <details class="neo-panel expander" data-section="manual"><summary>Manual controls</summary><div class="command-grid">
            ${this._button("charge_battery_now", "Charge battery")}
            ${this._button("export_now", "Export now")}
            ${this._button("hold_battery", "Hold battery")}
            ${this._button("pause_ev", "Pause EV")}
            ${this._button("ev_solar", "EV solar")}
            ${this._button("ev_battery", "EV battery")}
            ${this._button("ev_grid", "EV grid")}
            ${this._button("resume_auto", "Resume Auto", "mdi:play-circle-outline")}
          </div></details>
          <details class="neo-panel expander" data-section="settings"><summary>Additional planning settings</summary><div class="extra-settings">
            ${this._setting("Battery capacity", "number.duhnergy_battery_capacity")}
            ${this._setting("Solar forecast margin", "number.duhnergy_solar_forecast_margin")}
            ${this._setting("Daily demand", "number.duhnergy_household_daily_demand")}
            ${this._setting("Grid current limit", "number.duhnergy_grid_current_limit")}
          </div></details>
          <footer class="footer">Duhnergy! · Home energy planning · Verify Shadow decisions before enabling Auto</footer>
        </div>
      </ha-card>`;

    this._bindEvents(openSections);
  }

  _bindEvents(openSections) {
    this.shadowRoot.querySelectorAll("[data-entity]").forEach((element) => {
      const open = (event) => {
        if (event?.target?.closest?.("button, input, select, summary")) return;
        event?.stopPropagation();
        this._openMoreInfo(element.dataset.entity);
      };
      element.addEventListener("click", open);
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          this._openMoreInfo(element.dataset.entity);
        }
      });
    });
    this.shadowRoot.querySelectorAll("[data-button]").forEach((button) =>
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this._press(button.dataset.button);
      }),
    );
    this.shadowRoot.querySelectorAll("[data-number]").forEach((input) => {
      input.addEventListener("change", () => this._setNumber(input.dataset.number, input.value));
      input.addEventListener("blur", () => this._scheduleRenderAfterInteraction());
    });
    this.shadowRoot.querySelectorAll("[data-range]").forEach((input) =>
      input.addEventListener("input", () => {
        const output = this.shadowRoot.querySelector(`[data-output="${input.dataset.range}"]`);
        const unit = this._state(input.dataset.range)?.attributes?.unit_of_measurement || "";
        if (output) output.textContent = `${input.value} ${unit}`;
      }),
    );
    this.shadowRoot.querySelectorAll("[data-select]").forEach((select) => {
      select.addEventListener("change", () => this._select(select.dataset.select, select.value));
      select.addEventListener("blur", () => this._scheduleRenderAfterInteraction());
    });
    this.shadowRoot.querySelectorAll("[data-period]").forEach((button) =>
      button.addEventListener("click", () => {
        this._statsPeriod = button.dataset.period;
        this._render();
      }),
    );
    this.shadowRoot.querySelectorAll("details[data-section]").forEach((details) => {
      details.open = openSections.get(details.dataset.section) || false;
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

  _scheduleRenderAfterInteraction() {
    clearTimeout(this._interactionRenderTimer);
    this._interactionRenderTimer = setTimeout(() => {
      const active = this.shadowRoot?.activeElement;
      if (!active?.matches("select, input")) this._render();
    }, 0);
  }

  _press(entityId) {
    this._hass.callService("button", "press", { entity_id: entityId });
  }

  _setNumber(entityId, value) {
    return this._hass.callService("number", "set_value", {
      entity_id: entityId,
      value: Number(value),
    });
  }

  _select(entityId, option) {
    return this._hass.callService("select", "select_option", {
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
      "Live energy topology, solar and price forecasts, persistent stats, decision log, settings, and guarded controls.",
    preview: true,
  });
}
console.info(
  "%c DUHNERGY! %c CARD ",
  "color:#111e24;background:#12c5df;font-weight:700",
  "color:#eef3f5;background:#182830",
);
