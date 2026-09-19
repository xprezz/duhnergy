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
    if (!this._openMenus) this._openMenus = new Set();
    this._render();
    this.connectedCallback();
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

  _powerTopology(planAttributes, forecastAttributes, statsAttributes) {
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
    const today = statsAttributes?.periods?.today || {};
    const todayValue = (key) => {
      const value = Number(today[key]);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    };
    const importedToday = todayValue("grid_import_kwh");
    const importCostToday = todayValue("import_cost");
    const exportedToday = todayValue("grid_export_kwh");
    const exportRevenueToday = todayValue("export_revenue");
    const householdToday = todayValue("household_consumption_kwh");
    const solarProducedToday = todayValue("solar_production_kwh");
    const batteryChargedToday = todayValue("battery_charged_kwh");
    const batteryDischargedToday = todayValue("battery_discharged_kwh");
    const evToday = todayValue("ev_charged_kwh");
    const estimatedSolarToHouse = Math.min(
      householdToday,
      Math.max(0, solarProducedToday - exportedToday - batteryChargedToday),
    );
    const estimatedBatteryToHouse = Math.min(
      Math.max(0, householdToday - estimatedSolarToHouse),
      batteryDischargedToday,
    );
    const estimatedGridToHouse = Math.min(
      Math.max(0, householdToday - estimatedSolarToHouse - estimatedBatteryToHouse),
      importedToday,
    );
    const estimatedOtherToHouse = Math.max(
      0,
      householdToday - estimatedSolarToHouse - estimatedBatteryToHouse - estimatedGridToHouse,
    );
    const currentSupply = [
      ["Solar", Math.max(0, solar - (gridImporting ? 0 : Math.abs(grid)) - (batteryCharging ? Math.abs(battery) : 0))],
      ["Battery", batteryCharging ? 0 : Math.abs(battery)],
      ["Grid", gridImporting ? Math.abs(grid) : 0],
    ].filter(([, value]) => value > 20);
    const currentSupplyTotal = currentSupply.reduce((total, [, value]) => total + value, 0);
    const supplySummary = currentSupply.length
      ? currentSupply
          .map(([name, value]) => `${name} ${Math.round((value / currentSupplyTotal) * 100)}%`)
          .join(" / ")
      : "Source unavailable";
    const supplyLabel =
      currentSupply.length === 1 ? currentSupply[0][0] : currentSupply.length > 1 ? "Mix" : "Unknown";
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

    const gridFlow = Math.abs(grid);
    const batteryFlow = Math.abs(battery);
    const gridExporting = gridFlow > 20 && !gridImporting;
    const batteryDischarging = batteryFlow > 20 && !batteryCharging;
    const solarSurplus = Math.max(0, solar - house);
    // Exporting and importing are the more newsworthy states, so they are
    // weighted slightly above raw solar harvest when ranking the headline mode.
    const coreCandidates = [
      ["solar", solar > 20 ? solar : 0],
      ["export", gridExporting ? gridFlow * 1.35 : 0],
      ["import", gridImporting && gridFlow > 20 ? gridFlow * 1.35 : 0],
      ["battery", batteryDischarging ? batteryFlow : 0],
      ["charging", batteryCharging && batteryFlow > 20 ? batteryFlow : 0],
    ].sort((a, b) => b[1] - a[1]);
    const coreMode = coreCandidates[0][1] > 0 ? coreCandidates[0][0] : "idle";
    const coreSummary = {
      solar: "Harvesting solar",
      export: "Exporting to grid",
      import: "Drawing from grid",
      battery: "Discharging battery",
      charging: "Charging battery",
      idle: "Standing by",
    }[coreMode];

    // Colour the battery link by what is driving it, and the household link
    // by whichever source is currently supplying most of the load.
    const batteryTone = batteryCharging
      ? solarSurplus > gridFlow
        ? "solar"
        : "grid"
      : "battery";
    const homeTone = currentSupply.length
      ? { Solar: "solar", Battery: "battery", Grid: "grid" }[
          currentSupply.slice().sort((a, b) => b[1] - a[1])[0][0]
        ]
      : "idle";
    const evTone = solarSurplus > 20 ? "solar" : gridImporting ? "grid" : "battery";

    this._flowModel = [
      ...surfaces.map((surface, index) => ({
        from: [`.surface-card:nth-of-type(${index + 1})`, "bottom", 0.5],
        to: [".solar-merge", "center", (index + 0.5) / surfaces.length],
        tone: "solar",
        active: Number(surface.power_w) > 20,
      })),
      {
        from: [".solar-merge", "center", 0.5],
        to: [".core-node", "top", 0.5],
        tone: "solar",
        trunk: true,
        active: solar > 20,
      },
      {
        from: [".grid-node", "right", 0.5],
        to: [".core-node", "left", 0.3],
        tone: "grid",
        active: gridFlow > 20,
        reversed: !gridImporting,
      },
      {
        from: [".battery-node", "right", 0.5],
        to: [".core-node", "left", 0.75],
        tone: batteryTone,
        active: batteryFlow > 20,
        reversed: batteryCharging,
      },
      {
        from: [".core-node", "right", 0.3],
        to: [".home-node", "left", 0.5],
        tone: homeTone,
        active: house > 20,
      },
      {
        from: [".core-node", "right", 0.75],
        to: [".ev-node", "left", 0.5],
        tone: evTone,
        active: ev > 20,
      },
    ];

    return `<div class="topology">
      <svg class="flow-layer" aria-hidden="true" focusable="false"></svg>

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
              "Now",
              this._format(solar / 1000, 1),
              "kW",
              "live",
            )}
            ${this._productionPill(
              solarToday || "sensor.duhnergy_forecast_solar_energy",
              "mdi:weather-sunny",
              "Forecast",
              solarToday ? this._value(solarToday) : this._value("sensor.duhnergy_forecast_solar_energy"),
              solarToday ? this._unit(solarToday, "kWh") : "kWh",
            )}
            ${this._productionPill(
              solarTodayEnergy || "sensor.duhnergy_lifetime_solar_production",
              "mdi:counter",
              "Today",
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

      <div class="solar-merge" aria-hidden="true"></div>

      <div class="topology-node detail-node grid-node ${gridFlow > 20 ? "active-grid" : ""}" data-entity="sensor.duhnergy_grid_net_power" role="button" tabindex="0">
        <div class="node-heading">
          <div><span>Grid</span><strong>${gridDirection}${gridFlow > 20 ? ` ${this._format(gridFlow / 1000, 1)} kW` : ""}</strong></div>
          <div class="icon-orb"><ha-icon icon="mdi:transmission-tower"></ha-icon></div>
        </div>
        <div class="node-pills compact">
          <div class="node-pill" data-entity="sensor.duhnergy_lifetime_grid_import" role="button" tabindex="0"><span>Imported</span><strong>${this._format(importedToday, 1)} kWh</strong><small>${this._format(importCostToday, 2)} ${this._escape(currency)}</small></div>
          <div class="node-pill earning" data-entity="sensor.duhnergy_lifetime_grid_export" role="button" tabindex="0"><span>Exported</span><strong>${this._format(exportedToday, 1)} kWh</strong><small>${this._format(exportRevenueToday, 2)} ${this._escape(currency)}</small></div>
        </div>
      </div>

      <div class="topology-node core-node core-${coreMode}" data-entity="${this._escape(this.config.status_entity)}" role="button" tabindex="0" title="${this._escape(coreSummary)}">
        <div class="core-icon brain-icon">
          <i class="electron electron-one"></i><i class="electron electron-two"></i>
          <i class="electron electron-three"></i><i class="electron electron-four"></i>
          <ha-icon icon="mdi:brain"></ha-icon>
        </div>
        <span>Smart Brain</span>
        <em>${this._escape(coreSummary)}</em>
      </div>

      <div class="topology-node detail-node home-node" data-entity="sensor.duhnergy_house_power" role="button" tabindex="0">
        <div class="node-heading">
          <div><span>Household</span><strong>${this._format(house / 1000, 1)} kW now</strong></div>
          <div class="icon-orb"><ha-icon icon="mdi:home-lightning-bolt"></ha-icon></div>
        </div>
        <div class="node-pills compact">
          <div class="node-pill live"><span>Supplied by</span><strong>${this._escape(supplyLabel)}</strong><small>${this._escape(supplySummary)}</small></div>
          <div class="node-pill" data-entity="sensor.duhnergy_lifetime_household_consumption" role="button" tabindex="0"><span>Used today</span><strong>${this._format(householdToday, 1)} kWh</strong>
            <div class="source-pills" aria-label="Estimated household consumption by source today, in kWh">
              <span><b>Solar</b>${this._format(estimatedSolarToHouse, 1)}</span>
              <span><b>Batt</b>${this._format(estimatedBatteryToHouse, 1)}</span>
              <span><b>Grid</b>${this._format(estimatedGridToHouse, 1)}</span>
              ${estimatedOtherToHouse > 0.05 ? `<span><b>Other</b>${this._format(estimatedOtherToHouse, 1)}</span>` : ""}
            </div>
          </div>
        </div>
      </div>

      <div class="node-cluster ev-node ${ev > 20 ? "active-ev" : ""}">
        <button class="topology-node cluster-face" type="button" data-menu="ev" aria-expanded="${this._menuOpen("ev")}">
          <div class="icon-orb"><ha-icon icon="mdi:car-electric"></ha-icon></div>
          <div class="cluster-copy"><span>EV charger</span><strong>${ev > 20 ? `${this._format(ev / 1000, 1)} kW charging` : "Idle"}</strong><em>${this._format(evToday, 1)} kWh today</em></div>
          <ha-icon class="cluster-chevron" icon="mdi:chevron-down"></ha-icon>
        </button>
        ${this._preferenceMenu("ev", [
          ["switch.duhnergy_ev_charger_enabled", "Stop / start charger", "mdi:ev-station"],
          ["switch.duhnergy_ev_solar_charging_sync", "Solar charging sync", "mdi:solar-power-variant"],
          ["switch.duhnergy_ev_direct_grid_charging", "Direct grid charging", "mdi:transmission-tower-import"],
          ["switch.duhnergy_ev_direct_battery_charging", "Direct battery charging", "mdi:home-battery-outline"],
          ["switch.duhnergy_ev_schedule", "Enable schedule", "mdi:calendar-clock"],
        ])}
      </div>

      <div class="node-cluster battery-node ${batteryFlow > 20 ? "active-battery" : ""}">
        <button class="topology-node cluster-face battery-face" type="button" data-menu="battery" aria-expanded="${this._menuOpen("battery")}">
          <div class="icon-orb"><ha-icon icon="${batteryCharging ? "mdi:battery-charging-high" : "mdi:home-battery"}"></ha-icon></div>
          <div class="cluster-copy">
            <span>Home battery</span>
            <strong>${batteryDirection}${batteryFlow < 20 ? "" : ` ${this._format(batteryFlow / 1000, 1)} kW`}</strong>
            <em>${this._format(batteryChargedToday, 1)} in · ${this._format(batteryDischargedToday, 1)} out kWh</em>
          </div>
          <div class="soc"><span class="soc-label">State of charge<b>${this._format(soc, 0)}%</b></span><i><u style="width:${Math.min(100, Math.max(0, soc))}%"></u></i></div>
          <ha-icon class="cluster-chevron" icon="mdi:chevron-down"></ha-icon>
        </button>
        ${this._preferenceMenu("battery", [
          ["switch.duhnergy_allow_battery_export", "Allow battery export", "mdi:transmission-tower-export"],
          ["switch.duhnergy_price_based_discharge", "Price based discharge", "mdi:cash-clock"],
          ["switch.duhnergy_grid_tou_charging", "Grid TOU charging", "mdi:clock-time-four-outline"],
          ["switch.duhnergy_battery_direct_grid_charging", "Direct grid charging", "mdi:transmission-tower-import"],
          ["switch.duhnergy_stop_battery_charging", "Stop battery charging", "mdi:battery-off-outline"],
        ])}
      </div>
    </div>`;
  }

  _menuOpen(name) {
    return this._openMenus?.has(name) ? "true" : "false";
  }

  _preferenceMenu(name, rows) {
    const open = this._openMenus?.has(name);
    return `<div class="cluster-menu ${open ? "open" : ""}" ${open ? "" : "hidden"}>
      ${rows
        .map(([entityId, label, icon]) => {
          const state = this._state(entityId);
          if (!state) {
            return `<div class="menu-row unavailable"><ha-icon icon="${icon}"></ha-icon><span>${this._escape(
              label,
            )}</span><b>Not set up</b></div>`;
          }
          const on = state.state === "on";
          return `<button class="menu-row ${on ? "on" : ""}" type="button" role="switch" aria-checked="${on}" data-toggle="${this._escape(
            entityId,
          )}"><ha-icon icon="${icon}"></ha-icon><span>${this._escape(
            label,
          )}</span><i class="menu-switch" aria-hidden="true"></i></button>`;
        })
        .join("")}
      <div class="menu-foot">Planner preferences · stored with Duhnergy!</div>
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
          <strong>${this._format(period[key], unit === "kWh" ? 1 : 2)} <small>${unit}</small></strong>
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

  _slider(label, entityId, detail = "", unitOverride = "") {
    const state = this._state(entityId);
    const value = state?.state || "0";
    const unit = unitOverride || state?.attributes?.unit_of_measurement || "";
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
          container-type: inline-size;
          container-name: card;
          --bg: #131f26;
          --petroleum: #1a2a33;
          --petroleum-light: #22343f;
          --petroleum-dark: #142229;
          --line: rgba(255, 255, 255, .075);
          --line-strong: rgba(255, 255, 255, .13);
          --text: #f2f7f9;
          --muted: #9db1bc;
          --cyan: #2ad4ea;
          --cyan-soft: rgba(42, 212, 234, .15);
          --amber: #ffb63d;
          --amber-soft: rgba(255, 182, 61, .14);
          --green: #34d99f;
          --green-soft: rgba(52, 217, 159, .14);
          --blue: #5aa9ff;
          --violet: #b08bff;
          --coral: #ff7a6b;
          --red: #ff6b6b;

          --f1: 12px;
          --f2: 13px;
          --f3: 14px;
          --f4: 16px;
          --f5: 18px;
          --f6: 21px;
          --f7: 27px;

          --s1: 4px;
          --s2: 8px;
          --s3: 12px;
          --s4: 16px;
          --s5: 20px;
          --s6: 24px;
          --s7: 32px;

          --r1: 10px;
          --r2: 14px;
          --r3: 18px;
          --r4: 24px;

          --shadow-flat: 0 1px 2px rgba(0, 0, 0, .3), 0 10px 28px rgba(0, 0, 0, .26);
          --shadow-small: 0 1px 2px rgba(0, 0, 0, .28), 0 4px 12px rgba(0, 0, 0, .2);
          --shadow-inset: inset 0 1px 0 rgba(255, 255, 255, .05), inset 0 -1px 0 rgba(0, 0, 0, .22);
          display: block;
          color: var(--text);
          font-variant-numeric: tabular-nums;
          -webkit-font-smoothing: antialiased;
        }
        * { box-sizing: border-box; }
        ha-card { overflow: hidden; border: 0; border-radius: var(--ha-card-border-radius, 18px); color: var(--text); background: var(--petroleum); font-family: var(--paper-font-body1_-_font-family, Inter, sans-serif); }
        button, input, select { font: inherit; }
        button { color: inherit; }
        [data-entity] { cursor: pointer; }
        [data-entity]:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--cyan); outline-offset: 3px; }
        .dashboard { display: flex; flex-direction: column; gap: var(--s3); padding: var(--s4); background:
          radial-gradient(1200px 420px at 12% -10%, rgba(42, 212, 234, .07), transparent 60%),
          radial-gradient(900px 380px at 96% 4%, rgba(255, 182, 61, .05), transparent 60%),
          var(--bg); }
        .panel { position: relative; min-width: 0; border: 1px solid var(--line); border-radius: var(--r3); background: linear-gradient(180deg, var(--petroleum-light) 0%, var(--petroleum) 58%); box-shadow: var(--shadow-flat); }
        .panel:before { content: ""; position: absolute; inset: 0 0 auto; height: 1px; border-radius: inherit; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .13), transparent); pointer-events: none; }

        .header { display: flex; justify-content: space-between; align-items: center; gap: var(--s4); flex: 0 0 auto; padding: var(--s3) var(--s4); }
        .brand { display: flex; align-items: center; gap: var(--s3); min-width: 0; }
        .brand-mark { display: grid; place-items: center; width: 42px; height: 42px; flex: 0 0 auto; border-radius: var(--r2); color: #06222a; background: linear-gradient(145deg, var(--cyan), #14a7c4); box-shadow: 0 6px 16px rgba(42, 212, 234, .3); }
        .brand-mark ha-icon { --mdc-icon-size: 24px; }
        .brand-copy { min-width: 0; }
        .brand h2 { margin: 0; font-size: var(--f6); font-weight: 700; letter-spacing: -.2px; }
        .brand p { margin: 2px 0 0; overflow: hidden; color: var(--muted); font-size: var(--f2); text-overflow: ellipsis; white-space: nowrap; }
        .header-status { display: flex; align-items: center; gap: var(--s2); }
        .chip { display: flex; align-items: center; gap: var(--s2); min-height: 46px; padding: var(--s1) var(--s3); border: 1px solid var(--line); border-radius: var(--r2); background: rgba(0, 0, 0, .22); }
        .chip > ha-icon { flex: 0 0 auto; color: var(--cyan); --mdc-icon-size: 20px; }
        .chip span, .chip label { display: block; color: var(--muted); font-size: var(--f1); font-weight: 600; letter-spacing: .6px; text-transform: uppercase; }
        .chip strong { display: block; margin-top: 1px; font-size: var(--f3); }
        .live-badge { display: inline-flex; align-items: center; gap: 6px; padding: 7px 11px; border: 1px solid rgba(52, 217, 159, .3); border-radius: 999px; color: var(--green); background: var(--green-soft); font-size: var(--f1); font-weight: 800; letter-spacing: .8px; }
        .live-badge i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }
        .off .live-badge { border-color: var(--line-strong); color: var(--muted); background: rgba(255, 255, 255, .05); }
        .mode-chip select { width: 100%; min-width: 92px; margin-top: 1px; padding: 0; border: 0; color: var(--cyan); background: transparent; cursor: pointer; font-size: var(--f3); font-weight: 700; text-transform: capitalize; }
        .mode-chip option { color: var(--text); background: var(--petroleum); }

        .workspace { flex: 1 1 auto; display: grid; grid-template-columns: minmax(0, 3.1fr) minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "flow solar plan" "flow price log"; gap: var(--s3); min-height: 0; height: clamp(560px, calc(100vh - 170px), 900px); }
        .flow-panel { grid-area: flow; }
        .solar-panel { grid-area: solar; }
        .price-panel { grid-area: price; }
        .plan-panel { grid-area: plan; }
        .log-panel { grid-area: log; }
        .workspace .panel { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
        .panel-head { display: flex; justify-content: space-between; align-items: center; gap: var(--s3); flex: 0 0 auto; padding: var(--s3) var(--s4); border-bottom: 1px solid var(--line); }
        .panel-body { flex: 1 1 auto; min-height: 0; padding: var(--s4); }
        .scroll-body { overflow-y: auto; overscroll-behavior: contain; }
        .scroll-body::-webkit-scrollbar { width: 6px; }
        .scroll-body::-webkit-scrollbar-thumb { border-radius: 99px; background: var(--line-strong); }
        .title-copy { min-width: 0; }
        .title-copy h3 { display: flex; align-items: center; gap: var(--s2); margin: 0; font-size: var(--f4); font-weight: 650; letter-spacing: -.1px; }
        .title-copy h3 ha-icon { flex: 0 0 auto; color: var(--cyan); --mdc-icon-size: 19px; }
        .title-copy p { margin: 3px 0 0 27px; overflow: hidden; color: var(--muted); font-size: var(--f2); text-overflow: ellipsis; white-space: nowrap; }
        .head-badge { flex: 0 0 auto; padding: 6px 11px; border: 1px solid var(--line); border-radius: var(--r1); background: rgba(0, 0, 0, .22); text-align: right; }
        .head-badge span { display: block; color: var(--muted); font-size: var(--f1); font-weight: 600; letter-spacing: .5px; text-transform: uppercase; }
        .head-badge strong { display: block; margin-top: 1px; font-size: var(--f3); white-space: nowrap; }
        .head-badge.is-positive strong { color: var(--green); }
        .head-badge.is-negative strong { color: var(--red); }
        .ghost-button { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; min-height: 34px; padding: 0 11px; border: 1px solid var(--line); border-radius: var(--r1); color: var(--muted); background: rgba(0, 0, 0, .2); cursor: pointer; font-size: var(--f2); font-weight: 600; }
        .ghost-button:hover { border-color: var(--line-strong); color: var(--text); }
        .ghost-button ha-icon { --mdc-icon-size: 16px; }
        .off .live-badge { color: var(--muted); background: rgba(145, 165, 175, .1); }
        .mode-box select { min-width: 105px; height: 38px; padding: 5px 26px 5px 9px; border: 0; border-radius: 8px; color: var(--cyan); background: var(--petroleum-dark); box-shadow: var(--shadow-inset); cursor: pointer; font-size: 13px; font-weight: 700; text-transform: capitalize; }
        .mode-box option { color: var(--text); background: var(--petroleum); }
        .main-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(310px, 1fr); gap: var(--s5); }
        .flow-panel .panel-body { display: flex; flex-direction: column; padding: var(--s3); overflow-y: auto; overscroll-behavior: contain; }
        .topology { position: relative; flex: 1 1 auto; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(118px, .4fr) minmax(0, 1.15fr); grid-template-rows: auto minmax(40px, .72fr) auto minmax(10px, .3fr) minmax(150px, .92fr) minmax(0, .14fr); grid-template-areas: "solar solar solar" "merge merge merge" "grid core home" ". core ." "battery core ev" ". . ."; align-content: stretch; gap: var(--s2) var(--s3); }
        .solar-merge { grid-area: merge; pointer-events: none; }
        .flow-layer { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }
        .flow-track { fill: none; stroke: var(--line-strong); stroke-width: 2; stroke-linecap: round; }
        .flow-track.trunk { stroke-width: 3.5; }
        .flow-live { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-dasharray: 2 11; animation: flow-move 1.5s linear infinite; }
        .flow-live.trunk { stroke-width: 5; stroke-dasharray: 3 12; }
        .flow-solar { stroke: var(--amber); }
        .flow-grid { stroke: var(--green); }
        .flow-home { stroke: var(--cyan); }
        .flow-battery { stroke: var(--violet); }
        .flow-ev { stroke: var(--blue); }
        .flow-idle { stroke: var(--line-strong); }
        @keyframes flow-move { to { stroke-dashoffset: -26; } }
        .solar-array { grid-area: solar; position: relative; z-index: 1; display: grid; grid-template-columns: minmax(148px, .64fr) minmax(0, 1.36fr); gap: var(--s2) var(--s3); }
        .weather-production { display: contents; }
        .weather-card { display: flex; align-items: center; gap: var(--s2); min-height: 46px; padding: var(--s1) var(--s3); border: 1px solid var(--line); border-radius: var(--r2); background: linear-gradient(145deg, rgba(255, 182, 61, .1), rgba(0, 0, 0, .2)); }
        .weather-icon { display: grid; place-items: center; width: 34px; height: 34px; flex: 0 0 auto; border-radius: 50%; color: var(--amber); background: rgba(0, 0, 0, .25); }
        .weather-icon ha-icon { --mdc-icon-size: 21px; }
        .weather-card > div { min-width: 0; }
        .weather-card span, .production-pill span { display: block; overflow: hidden; color: var(--muted); font-size: var(--f1); font-weight: 600; letter-spacing: .4px; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .weather-card strong { display: block; margin-top: 1px; overflow: hidden; font-size: var(--f3); text-overflow: ellipsis; white-space: nowrap; }
        .weather-card em { display: block; color: var(--muted); font-size: var(--f1); font-style: normal; }
        .production-pills { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s2); }
        .production-pill { display: grid; grid-template-columns: 20px minmax(0, 1fr); grid-template-rows: auto auto; align-items: center; gap: 0 var(--s2); min-width: 0; padding: var(--s1) var(--s3); border: 1px solid var(--line); border-radius: var(--r2); background: rgba(0, 0, 0, .2); }
        .production-pill ha-icon { grid-row: 1 / 3; color: var(--muted); --mdc-icon-size: 18px; }
        .production-pill strong { overflow: hidden; font-size: var(--f4); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
        .production-pill small { color: var(--muted); font-size: var(--f1); font-weight: 600; }
        .production-pill.live strong, .production-pill.live ha-icon { color: var(--amber); }
        .production-pill.actual strong, .production-pill.actual ha-icon { color: var(--green); }
        .section-kicker { display: none; }
        .solar-cards { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(var(--surface-count), minmax(0, 1fr)); gap: var(--s2); }
        .surface-card { display: grid; grid-template-columns: 26px minmax(0, 1fr); grid-template-rows: auto auto auto; align-items: center; gap: 0 var(--s2); min-width: 0; padding: var(--s1) var(--s2); border: 1px solid var(--line); border-radius: var(--r2); background: rgba(0, 0, 0, .2); }
        .surface-head { grid-column: 2; display: flex; justify-content: space-between; gap: var(--s2); color: var(--muted); font-size: var(--f1); font-weight: 600; }
        .surface-head span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .surface-head b { display: none; }
        .surface-main { grid-column: 1 / -1; display: grid; grid-template-columns: 26px minmax(0, 1fr); align-items: center; gap: var(--s2); }
        .surface-main .icon-orb { width: 26px; height: 26px; color: var(--amber); background: rgba(255, 182, 61, .12); box-shadow: none; }
        .surface-main .icon-orb ha-icon { --mdc-icon-size: 16px; }
        .surface-main strong { font-size: var(--f4); font-weight: 650; }
        .surface-main small { color: var(--muted); font-size: var(--f1); font-weight: 600; }
        .surface-track { grid-column: 1 / -1; display: block; height: 3px; margin-top: 3px; overflow: hidden; border-radius: 99px; background: rgba(0, 0, 0, .4); }
        .surface-track u { display: block; max-width: 100%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #ff9d2e, var(--amber)); text-decoration: none; transition: width .5s ease; }
        .surface-unavailable { display: flex; align-items: center; justify-content: center; gap: var(--s2); min-height: 52px; padding: var(--s3); border: 1px dashed var(--line-strong); border-radius: var(--r2); color: var(--muted); font-size: var(--f2); text-align: center; }
        .surface-unavailable ha-icon { color: var(--amber); --mdc-icon-size: 18px; }
        .topology-node, .metric { border: 1px solid var(--line); background: linear-gradient(180deg, rgba(255, 255, 255, .035), rgba(0, 0, 0, .16)); box-shadow: var(--shadow-small); transition: border-color .18s ease, transform .18s ease; }
        .topology-node:hover, .metric:hover { border-color: rgba(42, 212, 234, .35); transform: translateY(-1px); }
        .topology-node span { display: block; color: var(--muted); font-size: var(--f1); font-weight: 600; letter-spacing: .5px; text-transform: uppercase; }
        .topology-node strong { display: block; margin-top: 2px; font-size: var(--f4); font-weight: 650; }
        .topology-node em { display: block; margin-top: 2px; color: var(--muted); font-size: var(--f1); font-style: normal; }
        .icon-orb { flex: 0 0 auto; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; color: var(--cyan); background: rgba(0, 0, 0, .25); }
        .icon-orb ha-icon { --mdc-icon-size: 19px; }
        .topology-node { position: relative; z-index: 1; border-radius: var(--r2); }
        .grid-node { grid-area: grid; }
        .active-grid .node-heading strong { color: var(--green); }
        .detail-node { align-self: stretch; display: flex; flex-direction: column; min-height: 0; padding: var(--s2) var(--s3); }
        .node-heading { display: flex; justify-content: space-between; align-items: center; gap: var(--s2); margin-bottom: var(--s1); }
        .node-heading > div:first-child { min-width: 0; }
        .node-pills { flex: 1 1 auto; display: grid; align-content: start; gap: var(--s1); }
        .node-pill { min-width: 0; padding: 5px var(--s2); border-radius: var(--r1); background: rgba(0, 0, 0, .26); }
        .node-pill span { display: block; font-size: 12px; }
        .node-pill strong { display: block; margin-top: 3px; font-size: 15px; }
        .node-pill small { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; line-height: 1.35; }
        .node-pill > span { display: block; color: var(--muted); font-size: var(--f1); font-weight: 600; letter-spacing: .4px; text-transform: uppercase; }
        .node-pill > strong { display: block; margin-top: 1px; overflow: hidden; font-size: var(--f3); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
        .node-pill > small { display: block; overflow: hidden; color: var(--muted); font-size: var(--f1); font-weight: 600; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
        .node-pill.live strong { color: var(--cyan); }
        .node-pill.earning strong { color: var(--green); }
        .node-pills.compact { gap: 5px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
        .home-node .node-pills.compact { grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); }
        .source-pills { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 3px; margin-top: var(--s1); }
        .source-pills span { padding: 4px 2px; border-radius: 7px; background: rgba(0, 0, 0, .3); color: var(--text); font-size: var(--f1); font-weight: 650; text-align: center; text-transform: none; }
        .source-pills b { display: block; margin-bottom: 1px; color: var(--muted); font-size: var(--f1); font-weight: 600; }
        .estimate-note { display: block; margin-top: 3px; color: var(--muted); font-size: var(--f1); line-height: 1.3; }

        .core-node { grid-area: core; align-self: center; justify-self: center; width: min(100%, 152px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; padding: var(--s3) var(--s2); text-align: center; border-color: var(--core-ring); background: radial-gradient(125% 95% at 50% 0%, var(--core-wash), rgba(0, 0, 0, .2)); box-shadow: var(--shadow-flat), 0 0 30px var(--core-glow); transition: border-color .4s ease, box-shadow .4s ease, background .4s ease; --core-accent: var(--cyan); --core-ring: rgba(42, 212, 234, .34); --core-wash: rgba(42, 212, 234, .14); --core-glow: rgba(42, 212, 234, .16); }
        .core-node.core-solar { --core-accent: var(--amber); --core-ring: rgba(255, 182, 61, .4); --core-wash: rgba(255, 182, 61, .16); --core-glow: rgba(255, 182, 61, .2); }
        .core-node.core-export { --core-accent: var(--green); --core-ring: rgba(52, 217, 159, .4); --core-wash: rgba(52, 217, 159, .16); --core-glow: rgba(52, 217, 159, .2); }
        .core-node.core-import { --core-accent: var(--coral); --core-ring: rgba(255, 122, 107, .4); --core-wash: rgba(255, 122, 107, .16); --core-glow: rgba(255, 122, 107, .2); }
        .core-node.core-battery, .core-node.core-charging { --core-accent: var(--violet); --core-ring: rgba(176, 139, 255, .4); --core-wash: rgba(176, 139, 255, .16); --core-glow: rgba(176, 139, 255, .2); }
        .core-node > span { color: var(--core-accent); font-size: var(--f2); font-weight: 700; letter-spacing: .6px; text-transform: uppercase; transition: color .4s ease; }
        .core-node em { display: block; color: var(--muted); font-size: var(--f1); font-style: normal; font-weight: 600; line-height: 1.3; }
        .core-node .core-icon { position: relative; display: grid; place-items: center; width: 52px; height: 52px; margin-bottom: var(--s1); overflow: visible; border-radius: 50%; color: #06222a; background: linear-gradient(145deg, var(--core-accent), color-mix(in srgb, var(--core-accent) 62%, #000)); box-shadow: 0 0 24px var(--core-glow); transition: background .4s ease; }
        .core-node .core-icon ha-icon { --mdc-icon-size: 28px; }
        .electron { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: var(--core-accent); box-shadow: 0 0 8px var(--core-accent); opacity: 0; pointer-events: none; }
        .electron-one { animation: electron-one 1.9s ease-out infinite; }
        .electron-two { animation: electron-two 2.2s .45s ease-out infinite; }
        .electron-three { animation: electron-three 2s .85s ease-out infinite; }
        .electron-four { animation: electron-four 2.3s 1.2s ease-out infinite; }
        @keyframes electron-one { 0% { transform: translate(-6px,-5px) scale(.5); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(-26px,-22px) scale(1); opacity: 0; } }
        @keyframes electron-two { 0% { transform: translate(6px,-6px) scale(.5); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(27px,-20px) scale(1); opacity: 0; } }
        @keyframes electron-three { 0% { transform: translate(-6px,5px) scale(.5); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(-28px,20px) scale(1); opacity: 0; } }
        @keyframes electron-four { 0% { transform: translate(6px,4px) scale(.5); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(27px,22px) scale(1); opacity: 0; } }

        .home-node { grid-area: home; align-self: start; }
        .grid-node { align-self: start; }

        .node-cluster { position: relative; z-index: 2; display: flex; flex-direction: column; align-self: start; }
        .ev-node { grid-area: ev; }
        .battery-node { grid-area: battery; align-self: stretch; }
        .battery-face { flex: 1 1 auto; min-height: 0; align-content: center; }
        .cluster-face { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--s3); width: 100%; padding: var(--s3) var(--s6) var(--s3) var(--s3); border-radius: var(--r2); color: inherit; font: inherit; text-align: left; cursor: pointer; }
        .cluster-face:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
        .cluster-copy { min-width: 0; }
        .cluster-copy span { display: block; color: var(--muted); font-size: var(--f1); font-weight: 600; letter-spacing: .5px; text-transform: uppercase; }
        .cluster-copy strong { display: block; margin-top: 1px; font-size: var(--f4); font-weight: 650; }
        .cluster-copy em { display: block; margin-top: 2px; color: var(--muted); font-size: var(--f1); font-style: normal; font-weight: 600; }
        .cluster-chevron { position: absolute; top: 50%; right: 6px; margin-top: -10px; color: var(--muted); transition: transform .22s ease; --mdc-icon-size: 20px; }
        .cluster-face[aria-expanded="true"] .cluster-chevron { transform: rotate(180deg); }
        .battery-node .icon-orb { width: 46px; height: 46px; color: var(--violet); background: rgba(176, 139, 255, .14); }
        .battery-node .icon-orb ha-icon { --mdc-icon-size: 26px; }
        .battery-face { grid-template-columns: auto minmax(0, 1fr); padding: var(--s3) var(--s6) var(--s3) var(--s3); }
        .battery-face .cluster-copy strong { font-size: var(--f5); }
        .battery-face .soc { grid-column: 1 / -1; min-width: 0; margin-top: 2px; text-align: left; }
        .battery-face .soc b { font-size: var(--f4); }
        .battery-face .soc i { width: 100%; height: 6px; }
        .active-battery .cluster-copy strong { color: var(--violet); }
        .ev-node .icon-orb { color: var(--blue); background: rgba(90, 169, 255, .14); }
        .active-ev .cluster-copy strong { color: var(--blue); }
        .cluster-menu { display: grid; gap: 3px; margin-top: 5px; padding: var(--s2); border: 1px solid var(--line); border-radius: var(--r2); background: linear-gradient(180deg, rgba(255, 255, 255, .05), rgba(0, 0, 0, .3)); box-shadow: var(--shadow-small); }
        .cluster-menu[hidden] { display: none; }
        .menu-row { display: grid; grid-template-columns: 20px minmax(0, 1fr) 34px; align-items: center; gap: var(--s2); width: 100%; padding: 7px var(--s2); border: 0; border-radius: var(--r1); background: rgba(0, 0, 0, .22); color: var(--text); font: inherit; font-size: var(--f2); font-weight: 600; text-align: left; cursor: pointer; }
        .menu-row ha-icon { color: var(--muted); --mdc-icon-size: 18px; }
        .menu-row:hover { background: rgba(255, 255, 255, .06); }
        .menu-row:focus-visible { outline: 2px solid var(--cyan); outline-offset: 1px; }
        .menu-row.on ha-icon { color: var(--cyan); }
        .menu-switch { position: relative; display: block; width: 34px; height: 19px; border-radius: 99px; background: rgba(255, 255, 255, .14); transition: background .2s ease; }
        .menu-switch:after { content: ""; position: absolute; top: 2px; left: 2px; width: 15px; height: 15px; border-radius: 50%; background: #dbe7ec; transition: transform .2s ease; }
        .menu-row.on .menu-switch { background: var(--cyan); }
        .menu-row.on .menu-switch:after { transform: translateX(15px); }
        .menu-row.unavailable { cursor: default; opacity: .65; }
        .menu-row.unavailable b { grid-column: 3; color: var(--muted); font-size: var(--f1); font-weight: 600; white-space: nowrap; }
        .menu-foot { padding: 3px var(--s2) 0; color: var(--muted); font-size: var(--f1); }

        .soc { min-width: 54px; text-align: right; }
        .soc b { font-size: var(--f5); font-weight: 700; }
        .soc i { display: block; width: 54px; height: 5px; margin-top: 4px; overflow: hidden; border-radius: 99px; background: rgba(0, 0, 0, .4); }
        .battery-face .soc-label { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s2); color: var(--muted); font-size: var(--f1); font-weight: 600; }
        .cluster-copy em, .cluster-copy strong, .cluster-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .soc u { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #7c5cf0, var(--violet)); text-decoration: none; transition: width .5s ease; }

        .control-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: var(--s2); padding: 0 var(--s4) var(--s4); }
        .setting-row, .slider-row { border: 1px solid var(--line); border-radius: var(--r2); background: rgba(0, 0, 0, .2); }
        .setting-row { display: grid; grid-template-columns: minmax(0, 1fr) 104px; align-items: center; gap: var(--s3); padding: var(--s2) var(--s3); }
        .setting-row > span, .slider-row > span { display: flex; flex-direction: column; min-width: 0; }
        .setting-row strong, .slider-row strong { font-size: var(--f3); font-weight: 650; }
        .setting-row small, .slider-row small { margin-top: 2px; color: var(--muted); font-size: var(--f1); font-weight: 600; line-height: 1.35; }
        .setting-row input { width: 100%; min-height: 36px; padding: 5px 9px; border: 1px solid var(--line); border-radius: var(--r1); color: var(--cyan); background: rgba(0, 0, 0, .3); font-size: var(--f2); font-weight: 700; }
        .slider-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--s1) var(--s3); padding: var(--s2) var(--s3) var(--s3); }
        .slider-value { align-self: start; min-width: 58px; padding: 4px 8px; border: 1px solid rgba(42, 212, 234, .22); border-radius: 99px; color: var(--cyan); background: var(--cyan-soft); font-size: var(--f1); font-weight: 800; text-align: center; white-space: nowrap; }
        .slider-row input[type="range"] { grid-column: 1 / -1; width: 100%; height: 18px; margin: 2px 0 0; padding: 0; border: 0; background: transparent; appearance: none; cursor: pointer; }
        .slider-row input[type="range"]::-webkit-slider-runnable-track { height: 5px; border-radius: 99px; background: rgba(0, 0, 0, .42); }
        .slider-row input[type="range"]::-webkit-slider-thumb { width: 18px; height: 18px; margin-top: -6.5px; border: 3px solid var(--petroleum); border-radius: 50%; background: var(--cyan); box-shadow: 0 2px 6px rgba(0, 0, 0, .5); appearance: none; }
        .slider-row input[type="range"]::-moz-range-track { height: 5px; border-radius: 99px; background: rgba(0, 0, 0, .42); }
        .slider-row input[type="range"]::-moz-range-thumb { width: 18px; height: 18px; border: 3px solid var(--petroleum); border-radius: 50%; background: var(--cyan); }
        .decision-log { display: grid; gap: var(--s2); }
        .decision { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: var(--s3); padding: var(--s2) var(--s3); border: 1px solid var(--line); border-left: 2px solid var(--cyan); border-radius: var(--r1); background: rgba(255, 255, 255, .03); }
        .decision time { align-self: start; padding: 3px 4px; border-radius: 6px; color: var(--amber); background: var(--amber-soft); font-size: var(--f1); font-weight: 700; text-align: center; }
        .decision strong { font-size: var(--f3); font-weight: 650; }
        .decision p { margin: 3px 0 0; color: #dbe5e9; font-size: var(--f2); line-height: 1.45; }
        .decision small { display: block; margin-top: 3px; color: var(--muted); font-size: var(--f1); line-height: 1.4; }
        .empty-state { display: grid; place-items: center; height: 100%; min-height: 90px; padding: var(--s5) var(--s3); color: var(--muted); font-size: var(--f2); line-height: 1.5; text-align: center; }
        .chart-body { display: flex; flex-direction: column; gap: var(--s2); padding: var(--s3) var(--s4) var(--s3); }
        .legend { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--s3); flex: 0 0 auto; color: var(--muted); font-size: var(--f1); font-weight: 600; }
        .legend span { display: flex; align-items: center; gap: 5px; }
        .legend i { width: 8px; height: 8px; border-radius: 3px; background: currentColor; }
        .legend i.is-line { height: 2px; width: 12px; border-radius: 99px; }
        .analytics-chart { display: block; flex: 1 1 auto; width: 100%; height: 100%; min-height: 0; overflow: visible; }
        .chart-grid { stroke: rgba(255, 255, 255, .06); stroke-width: 1; }
        .chart-grid.horizontal { stroke-dasharray: 3 5; }
        .chart-label { fill: var(--muted); font-size: 11px; }
        .solar-area { fill: url(#solar-fill); }
        .solar-line, .sell-line { fill: none; stroke-linejoin: round; stroke-linecap: round; }
        .solar-line { stroke: var(--amber); stroke-width: 2.4; }
        .solar-point { fill: var(--petroleum); stroke: var(--amber); stroke-width: 2; }
        .sell-line { stroke: var(--green); stroke-width: 2.3; }
        .price-bar.low { fill: rgba(52, 217, 159, .72); }
        .price-bar.normal { fill: rgba(42, 212, 234, .6); }
        .price-bar.high { fill: rgba(255, 107, 107, .72); }
        .empty-chart { display: grid; place-items: center; height: 100%; min-height: 120px; color: var(--muted); font-size: var(--f2); }
        .timeline { display: grid; gap: var(--s2); }
        .timeline-item { display: grid; grid-template-columns: 50px 10px minmax(0, 1fr) auto; gap: var(--s2); align-items: start; }
        .timeline-item time { font-size: var(--f1); font-weight: 700; text-align: right; }
        .timeline-item time small { display: block; margin-top: 1px; color: var(--muted); font-size: var(--f1); font-weight: 600; }
        .timeline-item > i { position: relative; align-self: stretch; border-left: 1px solid var(--line-strong); }
        .timeline-item > i:before { content: ""; position: absolute; left: -4px; top: 3px; width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px rgba(52, 217, 159, .5); }
        .timeline-item strong { font-size: var(--f3); font-weight: 650; }
        .timeline-item p { margin: 2px 0 0; color: var(--muted); font-size: var(--f1); line-height: 1.4; }
        .timeline-item b { color: var(--cyan); font-size: var(--f1); white-space: nowrap; }

        .stats-strip { flex: 0 0 auto; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--s4); padding: var(--s2) var(--s3); }
        .period-tabs { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 99px; background: rgba(0, 0, 0, .28); }
        .period-tabs button { flex: 0 0 auto; min-height: 32px; padding: 0 14px; border: 0; border-radius: 99px; color: var(--muted); background: transparent; cursor: pointer; font-size: var(--f2); font-weight: 650; transition: color .16s ease, background .16s ease; }
        .period-tabs button:hover { color: var(--text); }
        .period-tabs button.selected { color: #06222a; background: var(--cyan); }
        .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(158px, 1fr)); gap: var(--s2); }
        .metric { display: grid; grid-template-columns: 28px minmax(0, 1fr); grid-template-rows: auto auto; align-items: center; gap: 0 var(--s2); min-width: 0; padding: var(--s2) var(--s3); border-radius: var(--r2); }
        .metric .icon-orb { grid-row: 1 / 3; width: 28px; height: 28px; color: var(--cyan); }
        .metric .icon-orb ha-icon { --mdc-icon-size: 16px; }
        .metric > span { overflow: hidden; color: var(--muted); font-size: var(--f1); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .metric > strong { font-size: var(--f4); font-weight: 650; white-space: nowrap; }
        .metric small { color: var(--muted); font-size: var(--f1); font-weight: 600; }
        .expander { flex: 0 0 auto; }
        .expander > summary { display: flex; align-items: center; gap: var(--s2); padding: var(--s3) var(--s4); cursor: pointer; font-size: var(--f3); font-weight: 650; list-style: none; }
        .expander > summary::-webkit-details-marker { display: none; }
        .expander > summary:after { content: ""; width: 7px; height: 7px; margin-left: auto; border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted); transform: rotate(45deg) translateY(-2px); transition: transform .2s ease; }
        .expander[open] > summary:after { transform: rotate(-135deg) translateY(-2px); }
        .expander > summary ha-icon { color: var(--cyan); --mdc-icon-size: 19px; }
        .expander > summary i { color: var(--muted); font-size: var(--f2); font-style: normal; font-weight: 500; }
        .command-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--s2); padding: 0 var(--s4) var(--s4); }
        .command { display: flex; align-items: center; justify-content: center; gap: var(--s2); min-height: 42px; padding: var(--s2); border: 1px solid var(--line); border-radius: var(--r2); color: var(--text); background: rgba(0, 0, 0, .2); cursor: pointer; font-size: var(--f2); font-weight: 650; transition: border-color .16s ease, background .16s ease, transform .1s ease; }
        .command:hover { border-color: rgba(42, 212, 234, .35); background: rgba(42, 212, 234, .08); }
        .command:active { transform: translateY(1px); }
        .command ha-icon { color: var(--cyan); --mdc-icon-size: 17px; }
        .extra-settings { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: var(--s2); padding: 0 var(--s4) var(--s4); }
        .footer { flex: 0 0 auto; padding-top: var(--s2); color: var(--muted); font-size: var(--f1); text-align: center; }

        @container card (max-width: 1080px) {
          .workspace { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); grid-template-rows: minmax(300px, 1.25fr) minmax(190px, .75fr) minmax(190px, .75fr); grid-template-areas: "flow solar" "flow price" "plan log"; height: auto; }
          .metric-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
          .topology { grid-template-columns: minmax(0, 1.25fr) minmax(104px, .3fr) minmax(0, 1.25fr); }
          .cluster-copy strong, .cluster-copy em, .node-pill > strong, .node-pill > small { overflow: visible; white-space: normal; }
          .node-pills.compact, .home-node .node-pills.compact { grid-template-columns: minmax(0, 1fr); }
        }
        @container card (max-width: 900px) {
          .stats-strip { grid-template-columns: minmax(0, 1fr); }
          .period-tabs { overflow-x: auto; }
          .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .workspace { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; grid-template-areas: "flow" "solar" "price" "plan" "log"; }
          .workspace .chart-panel { min-height: 240px; }
          .plan-panel, .log-panel { max-height: 340px; }
        }
        @container card (max-width: 760px) {
          .dashboard { gap: var(--s2); padding: var(--s2); }
          .header { align-items: stretch; flex-direction: column; gap: var(--s3); }
          .header-status { flex-wrap: wrap; }
          .chip { flex: 1 1 auto; }
          .topology { display: flex; flex-direction: column; gap: var(--s2); }
          .flow-layer { display: none; }
          .solar-array { display: grid; grid-template-columns: minmax(0, 1fr); }
          .production-pills { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .solar-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .core-node, .battery-node, .ev-node { align-self: stretch; }
          .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @container card (max-width: 460px) {
          .brand p { display: none; }
          .production-pills, .solar-cards, .metric-grid, .source-pills { grid-template-columns: minmax(0, 1fr); }
          .title-copy p { margin-left: 0; }
        }
        @media (prefers-reduced-motion: reduce) { .flow-live, .electron { animation: none; } }
      </style>
      <ha-card class="${tone}">
        <div class="dashboard">
          <header class="panel header">
            <div class="brand">
              <div class="brand-mark"><ha-icon icon="mdi:lightning-bolt"></ha-icon></div>
              <div class="brand-copy"><h2>${this._escape(this.config.title)}</h2><p>Energy planning, optimisation and accounting</p></div>
            </div>
            <div class="header-status">
              <div class="chip" data-entity="${this.config.status_entity}" role="button" tabindex="0">
                <ha-icon icon="mdi:update"></ha-icon><div><span>Last plan</span><strong>${generatedAt ? this._time(generatedAt, { weekday: undefined }) : "Waiting"}</strong></div>
              </div>
              <div class="chip mode-chip">
                <ha-icon icon="${mode === "auto" ? "mdi:robot" : mode === "off" ? "mdi:power-standby" : "mdi:eye-outline"}"></ha-icon>
                <div><label for="duhnergy-mode">Operating mode</label>
                <select id="duhnergy-mode" data-select="select.duhnergy_mode">
                  ${["shadow", "auto", "off"].map((option) => `<option value="${option}" ${mode === option ? "selected" : ""}>${this._label(option)}</option>`).join("")}
                </select></div>
              </div>
              <b class="live-badge"><i></i>${mode === "off" ? "OFF" : "LIVE"}</b>
            </div>
          </header>

          <main class="workspace">
            <section class="panel flow-panel">
              <div class="panel-head">
                <div class="title-copy"><h3><ha-icon icon="mdi:transmission-tower-export"></ha-icon>Live energy</h3><p data-entity="${this.config.reason_entity}" role="button" tabindex="0">${this._escape(reason)}</p></div>
                <div class="head-badge ${net < 0 ? "is-negative" : "is-positive"}"><span>24h budget</span><strong>${net >= 0 ? "+" : ""}${net.toFixed(1)} kWh</strong></div>
              </div>
              <div class="panel-body">${this._powerTopology(planAttributes, forecastAttributes, statsAttributes)}</div>
            </section>

            <section class="panel chart-panel solar-panel">
              <div class="panel-head">
                <div class="title-copy"><h3><ha-icon icon="mdi:weather-sunny"></ha-icon>Solar forecast</h3><p>Next 24 hours</p></div>
                <div class="head-badge"><span>Peak</span><strong>${this._format(solarPeak, 1)} kW</strong></div>
              </div>
              <div class="panel-body chart-body">
                ${this._solarChart(forecastAttributes)}
                <div class="legend"><span style="color:var(--amber)"><i></i>Solar forecast</span></div>
              </div>
            </section>

            <section class="panel chart-panel price-panel">
              <div class="panel-head">
                <div class="title-copy"><h3><ha-icon icon="mdi:cash-multiple"></ha-icon>Prices</h3><p>${this._escape(currency)} per kWh</p></div>
                <div class="head-badge"><span>Buy / sell</span><strong>${this._format(currentBuy)} · ${this._format(currentSell)}</strong></div>
              </div>
              <div class="panel-body chart-body">
                ${this._priceChart(forecastAttributes)}
                <div class="legend"><span style="color:var(--green)"><i></i>Low</span><span style="color:var(--cyan)"><i></i>Normal</span><span style="color:var(--red)"><i></i>High</span><span style="color:var(--green)"><i class="is-line"></i>Sell</span></div>
              </div>
            </section>

            <section class="panel plan-panel">
              <div class="panel-head">
                <div class="title-copy"><h3><ha-icon icon="mdi:timeline-clock-outline"></ha-icon>Today's plan</h3><p>Charge, export and EV windows</p></div>
              </div>
              <div class="panel-body scroll-body"><div class="timeline">${this._timeline(timeline, currency)}</div></div>
            </section>

            <section class="panel log-panel">
              <div class="panel-head">
                <div class="title-copy"><h3><ha-icon icon="mdi:message-text-clock-outline"></ha-icon>Decision log</h3><p>Shadow-mode plan transitions</p></div>
                <button class="ghost-button clear-log" data-button="button.duhnergy_clear_simulator_log" title="Clear decision log"><ha-icon icon="mdi:delete-sweep-outline"></ha-icon>Clear</button>
              </div>
              <div class="panel-body scroll-body"><div class="decision-log">${this._simulator(logEntries)}</div></div>
            </section>
          </main>

          <section class="panel stats-strip">${this._stats(statsAttributes)}</section>

          <details class="panel expander" data-section="controls"><summary><ha-icon icon="mdi:tune-variant"></ha-icon>Smart optimisations<i>Planning limits applied to every calculated plan</i></summary><div class="control-grid">
            ${this._slider("Hard backup reserve", "number.duhnergy_hard_backup_reserve", "Battery floor preserved by every plan")}
            ${this._slider("Export stop SOC", "number.duhnergy_export_stop_soc", "Stop battery export at this level")}
            ${this._slider("EV battery stop SOC", "number.duhnergy_ev_battery_stop_soc", "Protect stored energy during EV charging")}
            ${this._slider("Solar forecast margin", "number.duhnergy_solar_forecast_margin", "Discount forecast uncertainty")}
            ${this._slider("Daily household demand", "number.duhnergy_household_daily_demand", "Expected consumption over 24 hours", "kWh")}
            ${this._slider("Grid current limit", "number.duhnergy_grid_current_limit", "Shared import limit for EV charging", "A")}
          </div></details>

          <details class="panel expander" data-section="manual"><summary><ha-icon icon="mdi:gesture-tap-button"></ha-icon>Manual controls<i>Override the calculated plan</i></summary><div class="command-grid">
            ${this._button("charge_battery_now", "Charge battery", "mdi:battery-charging-high")}
            ${this._button("export_now", "Export now", "mdi:transmission-tower-export")}
            ${this._button("hold_battery", "Hold battery", "mdi:battery-lock")}
            ${this._button("pause_ev", "Pause EV", "mdi:pause-octagon-outline")}
            ${this._button("ev_solar", "EV solar", "mdi:solar-power-variant")}
            ${this._button("ev_battery", "EV battery", "mdi:home-battery-outline")}
            ${this._button("ev_grid", "EV grid", "mdi:transmission-tower-import")}
            ${this._button("resume_auto", "Resume Auto", "mdi:play-circle-outline")}
          </div></details>
          <details class="panel expander" data-section="settings"><summary><ha-icon icon="mdi:cog-outline"></ha-icon>Additional planning settings<i>Values read from the integration</i></summary><div class="extra-settings">
            ${this._setting("Battery capacity", "number.duhnergy_battery_capacity")}
            ${this._setting("Solar forecast margin", "number.duhnergy_solar_forecast_margin")}
            ${this._setting("Daily demand", "number.duhnergy_household_daily_demand")}
            ${this._setting("Grid current limit", "number.duhnergy_grid_current_limit")}
          </div></details>
          <footer class="footer">Duhnergy! · Home energy planning · Verify Shadow decisions before enabling Auto</footer>
        </div>
      </ha-card>`;

    this._bindEvents(openSections);
    this._scheduleFlowDraw();
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
    this.shadowRoot.querySelectorAll("[data-menu]").forEach((button) =>
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const name = button.dataset.menu;
        if (!this._openMenus) this._openMenus = new Set();
        if (this._openMenus.has(name)) this._openMenus.delete(name);
        else this._openMenus.add(name);
        this._render();
      }),
    );
    this.shadowRoot.querySelectorAll("[data-toggle]").forEach((button) =>
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this._hass.callService("switch", "toggle", { entity_id: button.dataset.toggle });
      }),
    );
    this.shadowRoot.querySelectorAll("details[data-section]").forEach((details) => {
      const remembered = openSections.get(details.dataset.section);
      details.open = remembered === undefined ? details.hasAttribute("open") : remembered;
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

  connectedCallback() {
    if (!this._resizeObserver && typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this._drawFlows());
      this._resizeObserver.observe(this);
    }
  }

  disconnectedCallback() {
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    cancelAnimationFrame(this._flowFrame);
    clearTimeout(this._interactionRenderTimer);
  }

  _scheduleFlowDraw() {
    cancelAnimationFrame(this._flowFrame);
    this._flowFrame = requestAnimationFrame(() => this._drawFlows());
  }

  _anchor(container, selector, side, position) {
    const element = this.shadowRoot?.querySelector(selector);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    if (!box.width && !box.height) return null;
    const x = box.x - container.x;
    const y = box.y - container.y;
    const alongX = x + box.width * position;
    const alongY = y + box.height * position;
    if (side === "top") return [alongX, y];
    if (side === "bottom") return [alongX, y + box.height];
    if (side === "center") return [x + box.width / 2, y + box.height / 2];
    if (side === "left") return [x, alongY];
    return [x + box.width, alongY];
  }

  _curve(from, to) {
    const [ax, ay] = from;
    const [bx, by] = to;
    const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);
    const bend = horizontal ? (bx - ax) * 0.45 : (by - ay) * 0.45;
    const c1 = horizontal ? [ax + bend, ay] : [ax, ay + bend];
    const c2 = horizontal ? [bx - bend, by] : [bx, by - bend];
    const round = (value) => Math.round(value * 10) / 10;
    return `M${round(ax)},${round(ay)} C${round(c1[0])},${round(c1[1])} ${round(c2[0])},${round(c2[1])} ${round(bx)},${round(by)}`;
  }

  _drawFlows() {
    const root = this.shadowRoot;
    const topology = root?.querySelector(".topology");
    const layer = root?.querySelector(".flow-layer");
    if (!topology || !layer || !this._flowModel) return;
    const container = topology.getBoundingClientRect();
    if (!container.width || !container.height) return;
    if (getComputedStyle(layer).display === "none") return;
    layer.setAttribute("viewBox", `0 0 ${Math.round(container.width)} ${Math.round(container.height)}`);

    const markup = this._flowModel
      .map((flow) => {
        const start = this._anchor(container, ...flow.from);
        const end = this._anchor(container, ...flow.to);
        if (!start || !end) return "";
        const [from, to] = flow.reversed ? [end, start] : [start, end];
        const path = this._curve(from, to);
        return `<path class="flow-track${flow.trunk ? " trunk" : ""}" d="${path}"></path>${
          flow.active
            ? `<path class="flow-live flow-${flow.tone}${flow.trunk ? " trunk" : ""}" d="${path}"></path>`
            : ""
        }`;
      })
      .join("");
    layer.innerHTML = markup;
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
