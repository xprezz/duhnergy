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
      weather_entity: "",
      sun_entity: "sun.sun",
      pv_entities: [
        "sensor.solis_pv_power_1",
        "sensor.solis_pv_power_2",
        "sensor.solis_pv_power_3",
        "sensor.solis_pv_power_4",
      ],
      pv_total_entity: "sensor.solis_total_pv_power",
      pv_today_entity: "sensor.solis_pv_today_energy_generation",
      phase_entities: [
        "sensor.solis_meter_active_power_a",
        "sensor.solis_meter_active_power_b",
        "sensor.solis_meter_active_power_c",
      ],
      battery_charged_today_entity: "sensor.solis_today_battery_charge_energy",
      battery_discharged_today_entity: "sensor.solis_today_battery_discharge_energy",
      house_today_entity: "sensor.solis_household_load_today_energy",
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

  _entityNumber(entityId, fallback = null) {
    const state = this._state(entityId);
    if (!state || ["unknown", "unavailable", ""].includes(state.state)) return fallback;
    const value = Number(state.state);
    if (!Number.isFinite(value)) return fallback;
    const unit = String(state.attributes?.unit_of_measurement || "").toLowerCase();
    if (unit === "kw") return value * 1000;
    if (unit === "mw") return value * 1000000;
    return value;
  }

  _energy(entityId, fallback = null) {
    const state = this._state(entityId);
    if (!state || ["unknown", "unavailable", ""].includes(state.state)) return fallback;
    const value = Number(state.state);
    if (!Number.isFinite(value)) return fallback;
    const unit = String(state.attributes?.unit_of_measurement || "kWh").toLowerCase();
    if (unit === "wh") return value / 1000;
    if (unit === "mwh") return value * 1000;
    return value;
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

  _weatherEntity(sourceEntities = {}) {
    if (this.config.weather_entity && this._state(this.config.weather_entity)) {
      return this.config.weather_entity;
    }
    if (sourceEntities.weather && this._state(sourceEntities.weather)) {
      return sourceEntities.weather;
    }
    const weatherEntities = Object.keys(this._hass?.states || {}).filter((entityId) =>
      entityId.startsWith("weather."),
    );
    return weatherEntities.length === 1 ? weatherEntities[0] : "";
  }

  _moonPhase(date = new Date()) {
    const synodicMonth = 29.530588853;
    const referenceNewMoon = Date.UTC(2000, 0, 6, 18, 14);
    const age =
      (((date.getTime() - referenceNewMoon) / 86400000) % synodicMonth + synodicMonth) %
      synodicMonth;
    const fraction = age / synodicMonth;
    const names = [
      "New moon",
      "Waxing crescent",
      "First quarter",
      "Waxing gibbous",
      "Full moon",
      "Waning gibbous",
      "Last quarter",
      "Waning crescent",
    ];
    return {
      age,
      fraction,
      illumination: (1 - Math.cos(fraction * Math.PI * 2)) / 2,
      waxing: fraction < 0.5,
      name: names[Math.round(fraction * 8) % 8],
    };
  }

  _skyData() {
    const now = new Date();
    const sun = this._state(this.config.sun_entity);
    const above = sun?.state === "above_horizon";
    const nextRising = new Date(sun?.attributes?.next_rising || now.getTime() + 12 * 3600000);
    const nextSetting = new Date(sun?.attributes?.next_setting || now.getTime() + 6 * 3600000);
    let start;
    let end;
    if (above) {
      start = new Date(nextRising.getTime() - 86400000);
      end = nextSetting;
    } else {
      start = new Date(nextSetting.getTime() - 86400000);
      end = nextRising;
    }
    if (!(start < now && now < end)) {
      start = new Date(now);
      start.setHours(above ? 6 : 18, 0, 0, 0);
      end = new Date(start.getTime() + 12 * 3600000);
    }
    const progress = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
    return {
      now,
      above,
      start,
      end,
      progress,
      x: 14 + progress * 172,
      y: 78 - Math.sin(progress * Math.PI) * 57,
      moon: this._moonPhase(now),
      elevation: Number(sun?.attributes?.elevation),
    };
  }

  _weatherArtwork(condition) {
    const normalized = String(condition || "clear").toLowerCase();
    const cloudy = [
      "cloudy",
      "partlycloudy",
      "rainy",
      "pouring",
      "snowy",
      "snowy-rainy",
      "hail",
      "lightning",
      "lightning-rainy",
      "fog",
    ].includes(normalized);
    const rain = ["rainy", "pouring", "lightning-rainy", "snowy-rainy"].includes(normalized);
    const snow = ["snowy", "snowy-rainy", "hail"].includes(normalized);
    const lightning = ["lightning", "lightning-rainy"].includes(normalized);
    const fog = normalized === "fog";
    const wind = normalized.startsWith("windy");
    return `<g class="weather-art weather-${this._escape(normalized)}">
      ${
        cloudy
          ? `<g class="cloud cloud-a"><ellipse cx="27" cy="25" rx="13" ry="6"></ellipse><circle cx="22" cy="22" r="7"></circle><circle cx="31" cy="20" r="9"></circle></g>
             <g class="cloud cloud-b"><ellipse cx="73" cy="34" rx="16" ry="7"></ellipse><circle cx="68" cy="30" r="8"></circle><circle cx="79" cy="29" r="10"></circle></g>`
          : ""
      }
      ${
        rain
          ? `<g class="rain-drops"><path d="M21 34l-3 9M29 35l-3 9M67 44l-3 9M77 44l-3 9"></path></g>`
          : ""
      }
      ${
        snow
          ? `<g class="snow-flakes"><text x="20" y="47">✦</text><text x="31" y="43">✦</text><text x="69" y="53">✦</text><text x="80" y="49">✦</text></g>`
          : ""
      }
      ${lightning ? `<path class="lightning" d="M73 38l-7 12h6l-4 10 12-15h-6l5-7z"></path>` : ""}
      ${
        fog
          ? `<g class="fog-lines"><path d="M12 42h35M20 49h42M51 42h36M42 56h38"></path></g>`
          : ""
      }
      ${
        wind
          ? `<g class="wind-lines"><path d="M10 27h30c9 0 9-10 2-10M20 38h52c12 0 12 12 2 12M49 29h36"></path></g>`
          : ""
      }
    </g>`;
  }

  _skyPanel(sourceEntities) {
    const sky = this._skyData();
    const weatherEntity = this._weatherEntity(sourceEntities);
    const weather = this._state(weatherEntity);
    const condition = weather?.state || (sky.above ? "sunny" : "clear-night");
    const object = sky.above
      ? `<g class="sun-object" transform="translate(${sky.x} ${sky.y})"><circle r="7"></circle><g class="sun-rays"><path d="M0-13v4M0 9v4M-13 0h4M9 0h4M-9-9l3 3M6 6l3 3M9-9L6-6M-6 6l-3 3"></path></g></g>`
      : `<g class="moon-object" transform="translate(${sky.x} ${sky.y})">
          <circle r="8" class="moon-disc"></circle>
          <ellipse class="moon-shadow ${sky.moon.waxing ? "waxing" : "waning"}" cx="${
            sky.moon.waxing ? -8 + sky.moon.illumination * 16 : 8 - sky.moon.illumination * 16
          }" cy="0" rx="${Math.max(1, 8 * Math.abs(1 - sky.moon.illumination * 2))}" ry="8"></ellipse>
        </g>`;
    return `<section class="tech-panel sky-panel" data-entity="${this._escape(
      weatherEntity || this.config.sun_entity,
    )}" role="button" tabindex="0">
      <svg viewBox="0 0 200 88" aria-label="${this._escape(
        `${condition}, ${sky.above ? "sun" : sky.moon.name}`,
      )}">
        <defs><linearGradient id="skyGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${
          sky.above ? "#2376a7" : "#08152c"
        }"></stop><stop offset="1" stop-color="${sky.above ? "#68bde7" : "#19284a"}"></stop></linearGradient></defs>
        <rect width="200" height="88" fill="url(#skyGradient)"></rect>
        <path class="horizon-arc" d="M12 78Q100 5 188 78"></path>
        <path class="horizon-ground" d="M0 78H200V88H0z"></path>
        <g class="stars">${sky.above ? "" : `<circle cx="24" cy="16" r=".7"></circle><circle cx="72" cy="12" r=".5"></circle><circle cx="163" cy="18" r=".7"></circle><circle cx="122" cy="28" r=".5"></circle>`}</g>
        ${object}<g transform="translate(50 0)">${this._weatherArtwork(condition)}</g>
        <line class="position-line" x1="${sky.x}" y1="${sky.y + 9}" x2="${sky.x}" y2="78"></line>
      </svg>
      <div class="sky-labels"><span>${this._time(sky.start, { weekday: undefined })}</span><strong>${
        sky.above ? "SUN" : this._escape(sky.moon.name.toUpperCase())
      } · ${this._escape(this._label(condition))}</strong><span>${this._time(sky.end, {
        weekday: undefined,
      })}</span></div>
    </section>`;
  }

  _panelIllustration(power, unavailable) {
    const intensity = unavailable ? 0 : Math.min(1, Math.max(0.08, power / 1500));
    return `<svg class="panel-art" viewBox="0 0 160 74" aria-hidden="true" style="--pv:${intensity}">
      <defs><linearGradient id="cellGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#29466d"></stop><stop offset="1" stop-color="#102846"></stop></linearGradient></defs>
      <path class="panel-frame" d="M27 12h108l17 46H8z"></path>
      <path class="panel-glass" d="M31 17h99l13 35H17z"></path>
      <g class="panel-grid"><path d="M53 17L41 52M78 17L71 52M103 17L101 52M24 28h113M20 40h121"></path></g>
      <path class="panel-stand" d="M65 58l-7 10M105 58l8 10M45 68h82"></path>
    </svg>`;
  }

  _deviceArt(kind, soc = 0) {
    const art = {
      grid: `<svg viewBox="0 0 100 100"><g class="pylon"><path d="M50 8L23 88M50 8l27 80M31 62h38M36 45h28M41 28h18M18 88h64M29 62l42 26M71 62L29 88M36 45l28 17M64 45L36 62"></path><path class="grid-spark" d="M13 31h23M64 31h23M9 50h27M64 50h27"></path></g></svg>`,
      inverter: `<svg viewBox="0 0 120 90"><rect class="machine" x="13" y="13" width="94" height="64" rx="8"></rect><rect class="screen" x="24" y="28" width="50" height="31" rx="3"></rect><path class="wave" d="M29 46c7 0 7-13 14-13s7 25 14 25 7-18 14-18"></path><circle class="led" cx="87" cy="34" r="4"></circle><path d="M82 52h14M82 60h14"></path></svg>`,
      house: `<svg viewBox="0 0 120 100"><path class="house-roof" d="M12 49L60 10l48 39-9 10-39-31-39 31z"></path><path class="house-body" d="M26 51v38h68V51L60 25z"></path><rect x="39" y="62" width="15" height="27"></rect><g class="house-window"><rect x="67" y="58" width="18" height="19"></rect><path d="M76 58v19M67 67h18"></path></g><path class="grass" d="M18 89h84"></path></svg>`,
      battery: `<svg viewBox="0 0 140 80"><rect class="battery-case" x="8" y="14" width="119" height="54" rx="8"></rect><path class="battery-tip" d="M127 30h8v22h-8"></path><rect class="battery-fill" x="15" y="21" width="${Math.max(
        0,
        Math.min(105, soc * 1.05),
      )}" height="40" rx="4"></rect><path class="battery-bolt" d="M76 23L58 46h15l-7 18 24-28H75z"></path></svg>`,
      ev: `<svg viewBox="0 0 150 90"><path class="car" d="M13 58l10-25h67l13 25v19H13z"></path><path class="car-window" d="M32 38h48l10 18H25z"></path><circle class="wheel" cx="35" cy="77" r="8"></circle><circle class="wheel" cx="84" cy="77" r="8"></circle><rect class="charger" x="113" y="12" width="25" height="50" rx="5"></rect><path class="charge-bolt" d="M128 20l-9 14h7l-5 12 13-16h-7z"></path><path class="cable" d="M126 62c0 18-12 18-19 8"></path></svg>`,
    };
    return art[kind] || "";
  }

  _metricValue(value, digits = 0, unit = "W") {
    if (value == null || !Number.isFinite(Number(value))) return `<b class="unavailable">UNAVAILABLE</b>`;
    return `<strong>${Number(value).toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    })} <small>${unit}</small></strong>`;
  }

  _batteryFlowState({ battery, solar, house, grid, ev, gridImporting, convention }) {
    const magnitude = Math.abs(battery);
    const conventionalCharging = convention === "discharge" ? battery < 0 : battery > 0;
    if (magnitude < 20) {
      return { charging: false, discharging: false, inferred: false };
    }
    const gridSupply = gridImporting ? Math.abs(grid) : -Math.abs(grid);
    const balanceBatterySupply = house + ev - solar - gridSupply;
    const balanceError = Math.abs(Math.abs(balanceBatterySupply) - magnitude);
    const reliableBalance =
      Math.abs(balanceBatterySupply) > Math.max(150, magnitude * 0.25) &&
      balanceError <= Math.max(500, magnitude * 0.55);
    const charging = reliableBalance ? balanceBatterySupply < 0 : conventionalCharging;
    return { charging, discharging: !charging, inferred: reliableBalance };
  }

  _unifiedForecast(attributes) {
    const timestamps = Array.isArray(attributes?.timestamps) ? attributes.timestamps : [];
    const solar = Array.isArray(attributes?.solar_kw) ? attributes.solar_kw : [];
    const buy = Array.isArray(attributes?.buy_price) ? attributes.buy_price : [];
    const sell = Array.isArray(attributes?.sell_price) ? attributes.sell_price : [];
    if (!timestamps.length) return this._emptyChart();
    const width = 1200;
    const height = 285;
    const left = 66;
    const right = 1142;
    const top = 24;
    const bottom = 226;
    const x = (index) => left + (index / Math.max(1, timestamps.length - 1)) * (right - left);
    const prices = [...buy, ...sell].filter((value) => Number.isFinite(Number(value))).map(Number);
    const solarValues = solar.filter((value) => Number.isFinite(Number(value))).map(Number);
    const minPrice = Math.min(0, ...prices);
    const maxPrice = Math.max(1, ...prices);
    const maxSolar = Math.max(1, ...solarValues);
    const priceY = (value) =>
      bottom - ((Number(value) - minPrice) / Math.max(0.1, maxPrice - minPrice)) * (bottom - top);
    const solarY = (value) => bottom - (Number(value) / maxSolar) * (bottom - top);
    const line = (values, yScale, className) =>
      this._segments(values, x, yScale)
        .map(
          (segment) =>
            `<path class="${className}" d="${segment
              .map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`)
              .join(" ")}"></path>`,
        )
        .join("");
    const solarAreas = this._segments(solar, x, solarY)
      .map(
        (segment) =>
          `<path class="forecast-solar-area" d="M${segment[0][0]},${bottom} ${segment
            .map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`)
            .join(" ")} L${segment.at(-1)[0]},${bottom}Z"></path>`,
      )
      .join("");
    const dayLines = timestamps
      .map((timestamp, index) => {
        const date = new Date(timestamp);
        const previous = index ? new Date(timestamps[index - 1]) : null;
        if (index && date.toDateString() === previous?.toDateString()) return "";
        return `<line class="day-line" x1="${x(index)}" y1="${top}" x2="${x(index)}" y2="${bottom + 26}"></line>
          <text class="day-label" x="${x(index) + 7}" y="${bottom + 43}">${this._escape(
            date.toLocaleDateString([], { weekday: "short", day: "numeric" }),
          )}</text>`;
      })
      .join("");
    const horizontalGrid = [0, 0.25, 0.5, 0.75, 1]
      .map((fraction) => {
        const y = bottom - fraction * (bottom - top);
        return `<line class="chart-grid" x1="${left}" y1="${y}" x2="${right}" y2="${y}"></line>
          <text class="price-axis" x="${left - 9}" y="${y + 4}" text-anchor="end">${(
            minPrice +
            (maxPrice - minPrice) * fraction
          ).toFixed(2)}</text>
          <text class="solar-axis" x="${right + 10}" y="${y + 4}">${(maxSolar * fraction).toFixed(
            1,
          )}</text>`;
      })
      .join("");
    const now = Date.now();
    const first = new Date(timestamps[0]).getTime();
    const last = new Date(timestamps.at(-1)).getTime();
    const nowX =
      now >= first && now <= last ? left + ((now - first) / Math.max(1, last - first)) * (right - left) : null;
    const hitWidth = (right - left) / Math.max(1, timestamps.length);
    const hitAreas = timestamps
      .map(
        (timestamp, index) =>
          `<rect class="chart-hit" x="${x(index) - hitWidth / 2}" y="${top}" width="${hitWidth}" height="${
            bottom - top
          }" data-chart-index="${index}" data-time="${this._escape(
            this._time(timestamp),
          )}" data-buy="${this._format(buy[index], 2)}" data-sell="${this._format(
            sell[index],
            2,
          )}" data-solar="${this._format(solar[index], 2)}"></rect>`,
      )
      .join("");
    return `<div class="forecast-wrap">
      <svg class="forecast-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Solar and DKK price forecast">
        <defs><linearGradient id="forecastSolarFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd84d" stop-opacity=".72"></stop><stop offset="1" stop-color="#ffd84d" stop-opacity=".05"></stop></linearGradient></defs>
        ${horizontalGrid}${dayLines}${solarAreas}${line(solar, solarY, "forecast-solar-line")}${line(
          buy,
          priceY,
          "forecast-buy-line",
        )}${line(sell, priceY, "forecast-sell-line")}
        ${
          nowX == null
            ? ""
            : `<line class="now-line" x1="${nowX}" y1="${top}" x2="${nowX}" y2="${bottom}"></line><text class="now-label" x="${nowX + 5}" y="${top + 10}">NOW</text>`
        }
        <text class="axis-title" x="8" y="18">DKK/kWh</text><text class="axis-title solar-title" x="1144" y="18">kW</text>
        ${hitAreas}
      </svg>
      <div class="chart-tooltip" hidden></div>
    </div>`;
  }

  _illustratedOverview(planAttributes, forecastAttributes, statsAttributes) {
    const sources = planAttributes?.source_entities || {};
    const conventions = planAttributes?.conventions || {};
    const solar = this._entityNumber(this.config.pv_total_entity, this._number("sensor.duhnergy_solar_power"));
    const house = this._number("sensor.duhnergy_house_power");
    const battery = this._number("sensor.duhnergy_battery_power");
    const grid = this._number("sensor.duhnergy_grid_net_power");
    const ev = this._number("sensor.duhnergy_ev_power");
    const soc = this._number("sensor.duhnergy_battery_state_of_charge");
    const gridImporting =
      conventions.grid_power_positive === "export" ? grid < 0 : grid > 0;
    const batteryFlow = this._batteryFlowState({
      battery,
      solar,
      house,
      grid,
      ev,
      gridImporting,
      convention: conventions.battery_power_positive || "charge",
    });
    const batteryCharging = batteryFlow.charging;
    const today = statsAttributes?.periods?.today || {};
    const value = (key) => {
      const number = Number(today[key]);
      return Number.isFinite(number) ? Math.max(0, number) : 0;
    };
    const pvToday =
      this._energy(this.config.pv_today_entity, null) ??
      Number(planAttributes?.solar_today_energy_kwh) ??
      value("solar_production_kwh");
    const houseToday = this._energy(this.config.house_today_entity, null) ?? value("household_consumption_kwh");
    const batteryCharged =
      this._energy(this.config.battery_charged_today_entity, null) ?? value("battery_charged_kwh");
    const batteryDischarged =
      this._energy(this.config.battery_discharged_today_entity, null) ?? value("battery_discharged_kwh");
    const evToday = value("ev_charged_kwh");
    const buyEntity = sources.import_price || "sensor.duhnergy_current_buy_price";
    const sellEntity = sources.sale_price || "sensor.duhnergy_current_sell_price";
    const buy = forecastAttributes?.current_buy_price;
    const sell = forecastAttributes?.current_sell_price;
    const phaseEntities = Array.isArray(this.config.phase_entities) ? this.config.phase_entities : [];
    const phases = phaseEntities.slice(0, 3).map((entityId, index) => ({
      entityId,
      name: `L${index + 1}`,
      value: this._entityNumber(entityId, null),
    }));
    const pvEntities = Array.isArray(this.config.pv_entities) ? this.config.pv_entities : [];
    const pvLayout = [
      { index: 2, direction: "NORTH" },
      { index: 0, direction: "SOUTH" },
      { index: 3, direction: "EAST" },
      { index: 1, direction: "WEST" },
    ];
    const strings = pvLayout.map(({ index, direction }) => {
      const entityId = pvEntities[index] || sources[`solar_surface_${index + 1}`];
      return {
        entityId,
        power: this._entityNumber(entityId, null),
        index,
        direction,
      };
    });
    const batteryDischarging = batteryFlow.discharging;
    const gridSupplying = Math.abs(grid) > 20 && gridImporting;
    const solarToHouse = Math.max(
      0,
      Math.min(
        house,
        solar -
          (gridImporting ? 0 : Math.abs(grid)) -
          (batteryCharging ? Math.abs(battery) : 0) -
          ev,
      ),
    );
    const supplyCandidates = [
      {
        key: "grid",
        label: "GRID",
        power: gridSupplying ? Math.min(house, Math.abs(grid)) : 0,
        tone: "grid-source",
      },
      {
        key: "battery",
        label: "BATTERY",
        power: batteryDischarging ? Math.min(house, Math.abs(battery)) : 0,
        tone: "battery-source",
      },
    ];
    supplyCandidates.push({
      key: "pv",
      label: "PV",
      power: solarToHouse,
      tone: "solar-source",
    });
    const strongestSupply = supplyCandidates.sort((a, b) => b.power - a.power)[0];
    const mainHouseSource =
      house <= 20
        ? { key: "idle", label: "IDLE", power: 0, tone: "load" }
        : strongestSupply.power > 20
          ? strongestSupply
          : { key: "idle", label: "UNKNOWN", power: 0, tone: "load" };
    const maximumFlow = Math.max(200, solar, house, Math.abs(grid), Math.abs(battery), ev);
    const speed = (power) =>
      Math.max(3, 8 - Math.min(1, Math.abs(power) / maximumFlow) * 5);
    this._flowModel = [
      ...strings.map((item, index) => ({
        from: [`.pv-string:nth-child(${index + 1})`, "bottom", 0.5],
        to: [`.pv-tap:nth-child(${index + 1})`, "center", 0.5],
        tone: "solar",
        active: (item.power || 0) > 20,
        power: item.power || 0,
        speed: speed(item.power || 0),
        route: "straight",
      })),
      {
        from: [".pv-tap:nth-child(1)", "center", 0.5],
        to: [".pv-merge", "center", 0.5],
        tone: "solar",
        active: (strings[0].power || 0) + (strings[1].power || 0) > 20,
        power: (strings[0].power || 0) + (strings[1].power || 0),
        speed: speed((strings[0].power || 0) + (strings[1].power || 0)),
        route: "straight",
        noJunction: true,
      },
      {
        from: [".pv-tap:nth-child(4)", "center", 0.5],
        to: [".pv-merge", "center", 0.5],
        tone: "solar",
        active: (strings[2].power || 0) + (strings[3].power || 0) > 20,
        power: (strings[2].power || 0) + (strings[3].power || 0),
        speed: speed((strings[2].power || 0) + (strings[3].power || 0)),
        route: "straight",
        noJunction: true,
      },
      {
        from: [".pv-merge", "center", 0.5],
        to: [".inverter-module", "top", 0.5],
        tone: "solar",
        active: solar > 20,
        power: solar,
        speed: speed(solar),
        route: "straight",
        trunk: true,
        noJunction: true,
      },
      {
        from: [".grid-module", "right", 0.5],
        to: [".inverter-module", "left", 0.35],
        tone: gridImporting ? "grid" : "sale",
        active: Math.abs(grid) > 20,
        reversed: !gridImporting,
        power: Math.abs(grid),
        speed: speed(grid),
        route: "horizontal",
      },
      {
        from: [".battery-module", "right", 0.5],
        to: [".inverter-module", "left", 0.76],
        tone: "battery",
        active: Math.abs(battery) > 20,
        reversed: batteryCharging,
        power: Math.abs(battery),
        speed: speed(battery),
        route: "horizontal",
      },
      {
        from: [".inverter-module", "right", 0.35],
        to: [".house-module", "left", 0.5],
        tone: mainHouseSource.tone,
        active: house > 20,
        power: house,
        speed: speed(house),
        route: "horizontal",
      },
      {
        from: [".inverter-module", "right", 0.75],
        to: [".ev-module", "left", 0.5],
        tone: "ev",
        active: ev > 20,
        power: ev,
        speed: speed(ev),
        route: "horizontal",
      },
    ];
    const systemStatus = this._value(this.config.status_entity, "Loading");
    const selfSufficiency =
      houseToday > 0 ? Math.max(0, Math.min(100, (1 - value("grid_import_kwh") / houseToday) * 100)) : null;
    return `<div class="technical-board">
      <div class="top-row">
        ${this._skyPanel(sources)}
        <section class="tech-panel pv-summary" data-entity="${this._escape(
          this.config.pv_today_entity,
        )}" role="button" tabindex="0">
          <span>PV PRODUCTION TODAY</span>
          <strong>${this._format(pvToday, 1)} <small>kWh</small></strong>
          <em>CURRENT ACTIVE</em>
          <b>${Math.round(solar).toLocaleString()} W</b>
        </section>
      </div>
      <div class="pv-strings">
        ${strings
          .map(
            ({ entityId, power, index, direction }) => `<section class="tech-panel pv-string ${
              power == null ? "is-unavailable" : ""
            }" data-entity="${this._escape(entityId || "")}" role="button" tabindex="0" style="--pv-level:${
              power == null ? 0 : Math.min(1, power / 1500)
            }">
              <h3>${direction} <small>PV ${index + 1}</small></h3>${this._panelIllustration(
                power || 0,
                power == null,
              )}
              <div><span>${power == null ? "OFFLINE" : power > 20 ? "ACTIVE" : "IDLE"}</span>${this._metricValue(
                power,
                0,
                "W",
              )}</div>
            </section>`,
          )
          .join("")}
      </div>
      <div class="energy-topology topology">
        <svg class="flow-layer" aria-hidden="true" focusable="false"></svg>
        <div class="pv-network" aria-hidden="true">
          <i class="pv-tap"></i><i class="pv-tap"></i><i class="pv-tap"></i><i class="pv-tap"></i>
          <b class="pv-merge"></b>
        </div>
        <section class="tech-panel device-module grid-module" data-entity="sensor.duhnergy_grid_net_power" role="button" tabindex="0">
          <div class="device-art">${this._deviceArt("grid")}</div><div class="device-copy"><h3>GRID</h3><span class="${
            gridImporting ? "cyan" : "orange"
          }">${Math.abs(grid) < 20 ? "BALANCED" : gridImporting ? "BUYING" : "SELLING"}</span>${this._metricValue(
            Math.abs(grid),
            0,
            "W",
          )}</div>
        </section>
        <section class="tech-panel device-module inverter-module" data-entity="${this._escape(
          this.config.pv_total_entity,
        )}" role="button" tabindex="0">
          <h3>INVERTER</h3><div class="device-art">${this._deviceArt("inverter")}</div><span>ACTIVE PRODUCTION</span>${this._metricValue(
            solar,
            0,
            "W",
          )}
        </section>
        <section class="tech-panel device-module house-module source-${mainHouseSource.key}" data-entity="sensor.duhnergy_house_power" role="button" tabindex="0">
          <div class="device-art">${this._deviceArt("house")}</div><div class="device-copy"><h3>HOUSE</h3><span>ACTIVE USAGE</span>${this._metricValue(
            house,
            0,
            "W",
          )}<em>MAIN SOURCE ${mainHouseSource.label} · TODAY ${this._format(houseToday, 1)} kWh</em></div>
        </section>
        <section class="tech-panel phase-module">
          <div class="phase-values">${phases
            .map(
              (phase) => `<div data-entity="${this._escape(phase.entityId)}" role="button" tabindex="0"><span>${
                phase.name
              }</span>${this._metricValue(phase.value, 0, "W")}</div>`,
            )
            .join("")}</div>
          <div class="price-values">
            <div data-entity="${this._escape(buyEntity)}" role="button" tabindex="0"><span>BUY PRICE</span><strong>${this._format(
              buy,
              2,
            )} <small>DKK/kWh</small></strong></div>
            <div class="sell" data-entity="${this._escape(sellEntity)}" role="button" tabindex="0"><span>SELL PRICE</span><strong>${this._format(
              sell,
              2,
            )} <small>DKK/kWh</small></strong></div>
          </div>
        </section>
        <section class="tech-panel device-module battery-module" data-entity="sensor.duhnergy_battery_state_of_charge" role="button" tabindex="0">
          <h3>BATTERY</h3><div class="battery-row"><div class="device-art">${this._deviceArt(
            "battery",
            soc,
          )}</div><div><span>${Math.abs(battery) < 20 ? "IDLE" : batteryCharging ? "CHARGING" : "DISCHARGING"}</span>${this._metricValue(
            Math.abs(battery),
            0,
            "W",
          )}<em>SOC ${this._format(soc, 0)}%</em></div></div>
          <div class="battery-totals"><span>CHARGED TODAY <b>${this._format(
            batteryCharged,
            1,
          )} kWh</b></span><span>DISCHARGED TODAY <b>${this._format(
            batteryDischarged,
            1,
          )} kWh</b></span></div>
        </section>
        <section class="tech-panel device-module ev-module ${
          ev > 20 ? "ev-active" : ""
        }" data-entity="sensor.duhnergy_ev_power" role="button" tabindex="0">
          <div class="device-art">${this._deviceArt("ev")}</div><div class="device-copy"><h3>EV CHARGER</h3><span>${
            ev > 20 ? "ACTIVE" : "IDLE"
          }</span>${this._metricValue(ev, 0, "W")}<em>TODAY ${this._format(evToday, 1)} kWh</em></div>
        </section>
      </div>
      <section class="tech-panel forecast-panel">
        <div class="forecast-heading"><h3>PRICE &amp; SOLAR FORECAST</h3><div class="forecast-legend"><span class="buy-key">BUY PRICE</span><span class="sell-key">SELL PRICE</span><span class="solar-key">SOLAR FORECAST</span></div></div>
        ${this._unifiedForecast(forecastAttributes)}
      </section>
      <div class="status-strip">
        <span>SYSTEM STATUS <b>${this._escape(this._label(systemStatus))}</b></span>
        <span>SELF SUFFICIENCY <b>${selfSufficiency == null ? "—" : `${selfSufficiency.toFixed(0)}%`}</b></span>
        <span>UPDATED <b>${this._time(planAttributes?.generated_at || new Date(), {
          weekday: undefined,
        })}</b></span>
      </div>
    </div>`;
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

  _render() {
    if (!this.shadowRoot || !this.config || !this._hass) return;
    const stableFlowLayer = this.shadowRoot.querySelector(".flow-layer");
    const flowAnimationState = this._captureFlowAnimationState(stableFlowLayer);
    stableFlowLayer?.remove();
    const openSections = new Map(
      [...this.shadowRoot.querySelectorAll("details[data-section]")].map((details) => [
        details.dataset.section,
        details.open,
      ]),
    );
    const status = this._value(this.config.status_entity, "Loading");
    const reason = this._value(this.config.reason_entity, "Waiting for the first calculation");
    const mode = this._value("select.duhnergy_mode", "shadow");
    const planAttributes = this._state(this.config.plan_entity)?.attributes || {};
    const forecastAttributes = this._state(this.config.forecast_entity)?.attributes || {};
    const statsAttributes = this._state(this.config.stats_entity)?.attributes || {};
    const timeline = Array.isArray(planAttributes.timeline) ? planAttributes.timeline : [];
    const logEntries = this._state(this.config.log_entity)?.attributes?.entries || [];

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          container-type: inline-size;
          display: block;
          --navy: #08192b;
          --navy-2: #0d2239;
          --navy-3: #132c47;
          --outline: #2c4764;
          --outline-bright: #476784;
          --text: #f4f7fb;
          --muted: #a5b4c5;
          --green: #78d24b;
          --cyan: #67d5ff;
          --orange: #f5a14a;
          --yellow: #ffda4c;
          --violet: #ab91ff;
          color: var(--text);
          font-family: "Arial Narrow", "Roboto Condensed", "Segoe UI", sans-serif;
          font-variant-numeric: tabular-nums;
        }
        * { box-sizing: border-box; }
        ha-card { overflow: hidden; border: 1px solid #182f49; border-radius: var(--ha-card-border-radius, 16px); background: var(--navy); color: var(--text); }
        button, input, select { font: inherit; }
        button { color: inherit; }
        [data-entity] { cursor: pointer; }
        [data-entity]:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible, summary:focus-visible {
          outline: 3px solid var(--cyan);
          outline-offset: 2px;
        }
        .dashboard { display: grid; gap: 12px; padding: 14px; background:
          radial-gradient(circle at 16% 2%, rgba(67, 133, 184, .13), transparent 24%),
          linear-gradient(180deg, #071626, #091b2e 65%, #071626); }
        .command-bar { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 9px 12px; border: 2px solid var(--outline); background: #0a1d31; }
        .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .brand-mark { display: grid; place-items: center; width: 36px; height: 36px; color: var(--yellow); border: 2px solid var(--outline-bright); background: #102944; }
        .brand-mark ha-icon { --mdc-icon-size: 23px; }
        .brand h2 { margin: 0; color: var(--yellow); font-size: clamp(20px, 2vw, 29px); line-height: 1; letter-spacing: 1px; text-transform: uppercase; }
        .brand p { margin: 3px 0 0; overflow: hidden; color: var(--muted); font: 700 11px/1.2 "Segoe UI", sans-serif; letter-spacing: .7px; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .command-status { display: flex; align-items: center; gap: 8px; }
        .mode-control, .status-chip { min-height: 38px; padding: 5px 9px; border: 1px solid var(--outline); background: #071727; }
        .mode-control label, .status-chip span { display: block; color: var(--muted); font-size: 9px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; }
        .mode-control select { min-width: 84px; padding: 0; border: 0; color: var(--cyan); background: transparent; font-weight: 900; text-transform: uppercase; }
        .mode-control option { color: var(--text); background: var(--navy-2); }
        .status-chip b { display: block; max-width: 240px; overflow: hidden; color: var(--green); font-size: 12px; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }

        .technical-board { display: grid; gap: 10px; min-width: 0; }
        .tech-panel { position: relative; min-width: 0; overflow: hidden; border: 2px solid var(--outline); background: linear-gradient(180deg, rgba(16, 43, 70, .98), rgba(8, 26, 44, .98)); box-shadow: inset 0 0 0 1px rgba(255,255,255,.018); }
        .tech-panel:before, .tech-panel:after { content: ""; position: absolute; width: 9px; height: 9px; pointer-events: none; }
        .tech-panel:before { left: -2px; top: -2px; border-left: 3px solid var(--outline-bright); border-top: 3px solid var(--outline-bright); }
        .tech-panel:after { right: -2px; bottom: -2px; border-right: 3px solid var(--outline-bright); border-bottom: 3px solid var(--outline-bright); }
        .top-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(310px, 1.18fr); gap: 10px; }
        .sky-panel { min-height: 145px; background: #0c2943; }
        .sky-panel svg { display: block; width: 100%; height: 121px; }
        .horizon-arc { fill: none; stroke: #e5e8ad; stroke-width: 1.2; stroke-dasharray: 2 2; }
        .horizon-ground { fill: #142942; opacity: .94; }
        .position-line { stroke: #e5e8ad; stroke-width: 1; stroke-dasharray: 2 2; }
        .stars circle { fill: #d9e8ff; animation: twinkle 2s ease-in-out infinite alternate; }
        .sun-object circle { fill: var(--yellow); stroke: #ffb931; stroke-width: 1.5; filter: drop-shadow(0 0 7px #ffe663); animation: sun-pulse 2s ease-in-out infinite; }
        .sun-rays path { fill: none; stroke: var(--yellow); stroke-width: 1.8; stroke-linecap: round; transform-box: fill-box; transform-origin: center; animation: ray-spin 12s linear infinite; }
        .moon-disc { fill: #f1edcf; filter: drop-shadow(0 0 7px rgba(231,237,255,.65)); }
        .moon-shadow { fill: #172743; opacity: .93; }
        .sky-labels { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; height: 24px; padding: 0 9px; color: #aebbd0; background: #122944; font-weight: 900; }
        .sky-labels span { font-size: 12px; }
        .sky-labels strong { overflow: hidden; color: #fff; font-size: 11px; letter-spacing: .5px; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
        .weather-art { fill: #eaf4fb; stroke: #d9eaf4; stroke-width: .5; }
        .cloud { animation: cloud-drift 8s ease-in-out infinite alternate; opacity: .92; }
        .cloud-b { animation-delay: -4s; }
        .rain-drops path { fill: none; stroke: #6ed8ff; stroke-width: 1.2; stroke-linecap: round; stroke-dasharray: 3 3; animation: rain-fall .8s linear infinite; }
        .snow-flakes { fill: #fff; stroke: none; font-size: 6px; animation: snow-fall 2.4s linear infinite; }
        .lightning { fill: #ffe76b; stroke: #fff4a4; animation: lightning-flash 2.8s steps(1) infinite; }
        .fog-lines path, .wind-lines path { fill: none; stroke: #d9eaf4; stroke-width: 1.3; stroke-linecap: round; }
        .fog-lines { animation: fog-shift 5s ease-in-out infinite alternate; opacity: .72; }
        .wind-lines { animation: wind-shift 2.2s linear infinite; }
        .pv-summary { display: flex; flex-direction: column; justify-content: center; min-height: 145px; padding: 18px 25px; }
        .pv-summary span { color: var(--green); font-size: clamp(18px, 2.2vw, 30px); font-weight: 950; letter-spacing: 1px; }
        .pv-summary > strong { color: var(--green); font-size: clamp(38px, 5vw, 62px); line-height: 1; }
        .pv-summary small { font-size: .58em; }
        .pv-summary em { margin-top: 7px; color: #fff; font-size: 15px; font-style: normal; font-weight: 900; letter-spacing: .7px; }
        .pv-summary b { font-size: clamp(25px, 3vw, 38px); line-height: 1; }

        .pv-strings { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
        .pv-string { display: flex; flex-direction: column; min-height: 155px; padding: 8px 10px 10px; }
        .pv-string h3, .device-module h3, .forecast-heading h3 { margin: 0; font-size: clamp(16px, 1.8vw, 25px); font-weight: 950; letter-spacing: .8px; text-align: center; }
        .pv-string h3 { color: var(--yellow); }
        .pv-string h3 small { color: #aebed0; font-size: .48em; letter-spacing: .7px; vertical-align: middle; }
        .panel-art { width: 100%; height: 92px; filter: drop-shadow(0 0 calc(2px + var(--pv-level) * 9px) rgba(255,218,76,calc(.08 + var(--pv-level) * .45))); }
        .panel-frame { fill: #9aa9b7; stroke: #d9e3e9; stroke-width: 2; }
        .panel-glass { fill: url(#cellGradient); stroke: #7d91ab; stroke-width: 1; }
        .panel-grid path { fill: none; stroke: #7088a8; stroke-width: 1; }
        .panel-stand { fill: none; stroke: #8392a0; stroke-width: 3; }
        .pv-string > div { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
        .pv-string span, .device-module span, .phase-module span { color: #fff; font-size: 12px; font-weight: 900; letter-spacing: .6px; }
        .pv-string strong { color: var(--green); font-size: clamp(20px, 2.2vw, 30px); }
        .pv-string small, .device-module small, .phase-module small { color: inherit; font-size: .55em; }
        .is-unavailable { opacity: .6; filter: grayscale(.6); }
        .unavailable { color: var(--muted) !important; font-size: 12px !important; letter-spacing: .5px; }

        .energy-topology { position: relative; display: grid; grid-template-columns: minmax(220px, .95fr) minmax(245px, 1.05fr) minmax(220px, .95fr); grid-template-areas:
          "grid inverter house"
          "phase battery ev"; gap: 72px 112px; min-height: 455px; padding: 42px 0 24px; }
        .flow-layer { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
        .pv-network { position: absolute; z-index: 2; left: 12.5%; right: 12.5%; top: 10px; height: 12px; pointer-events: none; }
        .pv-tap, .pv-merge { position: absolute; top: 50%; width: 8px; height: 8px; border: 2px solid var(--green); border-radius: 50%; background: #071727; box-shadow: 0 0 5px rgba(120,210,75,.55); transform: translate(-50%, -50%); }
        .pv-tap:nth-child(1) { left: 0; }
        .pv-tap:nth-child(2) { left: 33.333%; }
        .pv-tap:nth-child(3) { left: 66.666%; }
        .pv-tap:nth-child(4) { left: 100%; }
        .pv-merge { left: 50%; width: 11px; height: 11px; background: var(--green); box-shadow: 0 0 8px rgba(120,210,75,.8); }
        .device-module, .phase-module { z-index: 1; min-height: 156px; padding: 12px; }
        .grid-module { grid-area: grid; }
        .inverter-module { grid-area: inverter; text-align: center; }
        .house-module { grid-area: house; }
        .phase-module { grid-area: phase; }
        .battery-module { grid-area: battery; }
        .ev-module { grid-area: ev; }
        .device-module { display: flex; align-items: center; justify-content: center; gap: 10px; }
        .inverter-module, .battery-module { flex-direction: column; }
        .device-art { flex: 0 1 132px; min-width: 88px; color: #d7e1e9; }
        .device-art svg { display: block; width: 100%; max-height: 98px; overflow: visible; }
        .device-copy { min-width: 0; }
        .device-copy h3 { text-align: left; }
        .device-module strong { display: block; color: var(--cyan); font-size: clamp(22px, 2.35vw, 34px); line-height: 1.02; }
        .device-module em { display: block; margin-top: 5px; color: #fff; font-size: 12px; font-style: normal; font-weight: 900; }
        .device-module .orange, .price-values .sell strong { color: var(--orange); }
        .device-module .cyan { color: var(--cyan); }
        .pylon path { fill: none; stroke: #a5b5c7; stroke-width: 4; }
        .pylon .grid-spark { stroke: var(--green); stroke-width: 2.5; stroke-dasharray: 4 5; animation: grid-live 1.4s linear infinite; }
        .machine { fill: #85929e; stroke: #d4dde4; stroke-width: 3; }
        .screen { fill: #163f50; stroke: #0a121c; stroke-width: 3; }
        .wave { fill: none; stroke: #71ddf8; stroke-width: 4; stroke-linecap: round; stroke-dasharray: 10 5; animation: wave-run 1.1s linear infinite; }
        .led { fill: var(--yellow); animation: led-blink 1.2s steps(1) infinite; }
        .house-roof { fill: #8898aa; stroke: #060b12; stroke-width: 4; }
        .house-body { fill: #b8c5d0; stroke: #172333; stroke-width: 3; }
        .house-window rect { fill: var(--yellow); stroke: #5b4c19; stroke-width: 2; animation: house-light 4s ease-in-out infinite; }
        .house-window path { stroke: #5b4c19; stroke-width: 2; }
        .grass { stroke: var(--green); stroke-width: 7; }
        .house-module .house-roof, .house-module .house-body, .house-module .house-window rect { transition: fill .4s ease, filter .4s ease; }
        .house-module.source-grid .house-roof { fill: #479ee4; }
        .house-module.source-grid .house-body { fill: #8dc9ef; }
        .house-module.source-grid .house-window rect { fill: #d7efff; }
        .house-module.source-pv .house-roof { fill: #e8b93e; }
        .house-module.source-pv .house-body { fill: #f2d979; }
        .house-module.source-pv .house-window rect { fill: #fff29a; }
        .house-module.source-battery .house-roof { fill: #58ad50; }
        .house-module.source-battery .house-body { fill: #91d07a; }
        .house-module.source-battery .house-window rect { fill: #d9f5ad; }
        .battery-row { display: grid; grid-template-columns: minmax(120px, 1fr) auto; align-items: center; gap: 8px; width: 100%; }
        .battery-case { fill: #6e7b88; stroke: #cbd4dc; stroke-width: 4; }
        .battery-tip { fill: #8b99a5; }
        .battery-fill { fill: var(--green); filter: drop-shadow(0 0 6px rgba(120,210,75,.6)); animation: battery-pulse 2s ease-in-out infinite; }
        .battery-bolt { fill: #b6ee62; }
        .battery-totals { display: grid; grid-template-columns: 1fr 1fr; width: 100%; padding-top: 8px; border-top: 1px solid var(--outline); }
        .battery-totals span { padding: 0 7px; color: var(--green); font-size: 10px; }
        .battery-totals span + span { border-left: 1px solid var(--outline); color: #fff; }
        .battery-totals b { display: block; font-size: 15px; }
        .car { fill: #7bd7ff; stroke: #071421; stroke-width: 4; }
        .car-window { fill: #173b57; stroke: #071421; stroke-width: 3; }
        .wheel { fill: #071421; stroke: #8fa3b7; stroke-width: 3; }
        .charger { fill: #a7dff4; stroke: #071421; stroke-width: 4; }
        .charge-bolt { fill: #167aa7; }
        .cable { fill: none; stroke: #62cbf2; stroke-width: 4; stroke-linecap: round; stroke-dasharray: 5 4; }
        .ev-active .charge-bolt { animation: ev-pulse 1.2s ease-in-out infinite; }
        .ev-active .cable { animation: cable-charge 1s linear infinite; }
        .phase-module { display: grid; grid-template-rows: 1fr 1fr; padding: 0; }
        .phase-values, .price-values { display: grid; grid-template-columns: repeat(3, 1fr); }
        .phase-values > div, .price-values > div { display: grid; place-items: center; min-width: 0; padding: 9px 5px; }
        .phase-values > div + div, .price-values > div + div { border-left: 1px solid var(--outline); }
        .phase-values strong { color: #a7dc80; font-size: clamp(17px, 1.8vw, 25px); }
        .price-values { grid-template-columns: 1fr 1fr; border-top: 1px solid var(--outline); }
        .price-values strong { color: var(--green); font-size: clamp(17px, 1.8vw, 25px); text-align: center; }

        .flow-track-shadow, .flow-track { fill: none; stroke-linecap: round; stroke-linejoin: round; }
        .flow-track-shadow { stroke: #020913; stroke-width: 10; opacity: .9; }
        .flow-track { stroke: var(--outline-bright); stroke-width: 6; opacity: .75; }
        .flow-track-center { fill: none; stroke: #0b1826; stroke-width: 2; stroke-dasharray: 2 7; }
        .flow-live { --dash-period: 16; fill: none; stroke-width: 3.5; stroke-linecap: round; stroke-dasharray: 4 12; filter: drop-shadow(0 0 3px currentColor); animation: feeder-flow var(--flow-speed, 5s) linear infinite; }
        .flow-live.trunk { --dash-period: 17; stroke-width: 5; stroke-dasharray: 6 11; }
        .flow-particle { fill: currentColor; filter: drop-shadow(0 0 4px currentColor); pointer-events: none; }
        .flow-solar { color: var(--green); stroke: var(--green); }
        .flow-grid { color: var(--green); stroke: var(--green); }
        .flow-sale { color: var(--orange); stroke: var(--orange); }
        .flow-battery { color: var(--violet); stroke: var(--violet); }
        .flow-load, .flow-ev { color: var(--cyan); stroke: var(--cyan); }
        .flow-grid-source { color: #4aaeff; stroke: #4aaeff; }
        .flow-solar-source { color: var(--yellow); stroke: var(--yellow); }
        .flow-battery-source { color: var(--green); stroke: var(--green); }
        .flow-junction { fill: #0c1f34; stroke: currentColor; stroke-width: 2; }
        .forecast-panel { min-height: 300px; padding: 9px 12px 4px; }
        .forecast-heading { display: flex; align-items: center; justify-content: space-between; gap: 15px; }
        .forecast-heading h3 { text-align: left; }
        .forecast-legend { display: flex; flex-wrap: wrap; gap: 16px; color: #fff; font-size: 11px; font-weight: 900; }
        .forecast-legend span:before { content: ""; display: inline-block; width: 22px; height: 4px; margin-right: 6px; vertical-align: middle; background: currentColor; }
        .buy-key { color: var(--green); }
        .sell-key { color: var(--orange); }
        .solar-key { color: var(--yellow); }
        .solar-key:before { height: 12px !important; border: 2px solid var(--yellow); background: rgba(255,218,76,.45) !important; }
        .forecast-wrap { position: relative; min-width: 0; }
        .forecast-chart { display: block; width: 100%; height: auto; min-height: 230px; overflow: visible; }
        .chart-grid { stroke: rgba(142,170,197,.18); stroke-width: 1; stroke-dasharray: 3 5; }
        .day-line { stroke: rgba(142,170,197,.38); stroke-width: 1.4; }
        .day-label, .price-axis, .solar-axis, .axis-title, .now-label { fill: #a9b9ca; font-size: 12px; font-weight: 800; }
        .axis-title { fill: var(--green); }
        .solar-title { fill: var(--yellow); }
        .forecast-solar-area { fill: url(#forecastSolarFill); }
        .forecast-solar-line, .forecast-buy-line, .forecast-sell-line { fill: none; stroke-linecap: round; stroke-linejoin: round; }
        .forecast-solar-line { stroke: var(--yellow); stroke-width: 3; }
        .forecast-buy-line { stroke: var(--green); stroke-width: 3; }
        .forecast-sell-line { stroke: var(--orange); stroke-width: 3; }
        .now-line { stroke: #fff; stroke-width: 1.5; stroke-dasharray: 4 4; }
        .now-label { fill: #fff; font-size: 10px; }
        .chart-hit { fill: transparent; pointer-events: all; }
        .chart-tooltip { position: absolute; z-index: 5; min-width: 150px; padding: 7px 9px; border: 1px solid var(--outline-bright); color: #fff; background: rgba(3, 13, 24, .96); box-shadow: 0 8px 25px rgba(0,0,0,.45); font: 700 11px/1.55 "Segoe UI", sans-serif; pointer-events: none; transform: translate(-50%, -110%); }
        .chart-tooltip b { color: var(--yellow); }
        .status-strip { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--outline); color: #fff; font-size: clamp(10px, 1.2vw, 15px); font-weight: 900; letter-spacing: .6px; text-transform: uppercase; }
        .status-strip span { padding: 6px 12px; text-align: center; }
        .status-strip span + span { border-left: 1px solid var(--outline); }
        .status-strip b { margin-left: 7px; color: var(--green); font-size: 1.25em; }

        .secondary { display: grid; gap: 9px; }
        .secondary details { border: 2px solid var(--outline); background: #0a1d31; }
        .secondary summary { display: flex; align-items: center; gap: 8px; padding: 11px 13px; cursor: pointer; list-style: none; font-size: 14px; font-weight: 900; letter-spacing: .5px; text-transform: uppercase; }
        .secondary summary::-webkit-details-marker { display: none; }
        .secondary summary ha-icon { color: var(--cyan); --mdc-icon-size: 19px; }
        .secondary summary i { margin-left: auto; color: var(--muted); font-size: 10px; font-style: normal; font-weight: 700; text-transform: none; }
        .secondary summary:after { content: "＋"; margin-left: 4px; color: var(--cyan); }
        .secondary details[open] summary:after { content: "−"; }
        .secondary-body { padding: 0 12px 12px; border-top: 1px solid var(--outline); }
        .secondary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .secondary h4 { margin: 10px 0 7px; color: var(--yellow); font-size: 12px; letter-spacing: .6px; text-transform: uppercase; }
        .timeline, .decision-log { display: grid; gap: 7px; max-height: 340px; overflow: auto; }
        .timeline-item { display: grid; grid-template-columns: 64px 8px minmax(0,1fr) auto; gap: 8px; padding: 7px; border: 1px solid var(--outline); background: #071727; }
        .timeline-item time, .timeline-item b, .decision time { font-size: 10px; font-weight: 900; }
        .timeline-item time small { display: block; color: var(--muted); }
        .timeline-item > i { border-left: 3px solid var(--green); }
        .timeline-item strong, .decision strong { font-size: 12px; }
        .timeline-item p, .decision p { margin: 2px 0; color: #d8e2ec; font: 600 11px/1.35 "Segoe UI", sans-serif; }
        .timeline-item b { color: var(--green); }
        .decision { display: grid; grid-template-columns: 50px minmax(0,1fr); gap: 8px; padding: 7px; border: 1px solid var(--outline); background: #071727; }
        .decision time { color: var(--orange); }
        .decision small { color: var(--muted); font-size: 10px; }
        .period-tabs { display: flex; gap: 3px; padding: 9px 0; overflow-x: auto; }
        .period-tabs button { min-height: 32px; padding: 0 13px; border: 1px solid var(--outline); color: var(--muted); background: #071727; cursor: pointer; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .period-tabs button.selected { border-color: var(--cyan); color: #04111d; background: var(--cyan); }
        .metric-grid { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 7px; }
        .metric { display: grid; grid-template-columns: 28px minmax(0,1fr); grid-template-rows: auto auto; align-items: center; gap: 0 7px; min-width: 0; padding: 8px; border: 1px solid var(--outline); background: #071727; }
        .metric .icon-orb { grid-row: 1/3; color: var(--cyan); }
        .metric .icon-orb ha-icon { --mdc-icon-size: 20px; }
        .metric > span { overflow: hidden; color: var(--muted); font-size: 9px; font-weight: 800; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .metric > strong { font-size: 14px; white-space: nowrap; }
        .control-grid, .extra-settings, .command-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; padding-top: 11px; }
        .slider-row, .setting-row { display: grid; gap: 6px; min-width: 0; padding: 9px; border: 1px solid var(--outline); background: #071727; }
        .slider-row > span, .setting-row > span { min-width: 0; }
        .slider-row strong, .setting-row strong { display: block; font-size: 11px; }
        .slider-row small, .setting-row small { display: block; color: var(--muted); font-size: 9px; }
        .slider-value { color: var(--cyan); font-size: 11px; font-weight: 900; }
        .slider-row input, .setting-row input { width: 100%; }
        .setting-row input { min-height: 32px; padding: 5px; border: 1px solid var(--outline); color: var(--cyan); background: #03111e; }
        .command { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 42px; padding: 7px; border: 1px solid var(--outline); color: #fff; background: #071727; cursor: pointer; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .command:hover { border-color: var(--cyan); background: #102e48; }
        .command ha-icon { color: var(--cyan); --mdc-icon-size: 18px; }
        .empty-state, .empty-chart { display: grid; place-items: center; min-height: 100px; color: var(--muted); font-size: 12px; text-align: center; }
        .footer { color: #71869a; font-size: 10px; text-align: center; }

        @keyframes sun-pulse { 50% { filter: drop-shadow(0 0 12px #ffe663) brightness(1.12); } }
        @keyframes ray-spin { to { transform: rotate(360deg); transform-origin: center; } }
        @keyframes twinkle { to { opacity: .3; } }
        @keyframes cloud-drift { to { transform: translateX(5px); } }
        @keyframes rain-fall { to { stroke-dashoffset: -6; } }
        @keyframes snow-fall { to { transform: translateY(8px); opacity: .25; } }
        @keyframes lightning-flash { 0%, 88%, 94%, 100% { opacity: 0; } 89%, 92% { opacity: 1; } }
        @keyframes fog-shift { to { transform: translateX(8px); opacity: .45; } }
        @keyframes wind-shift { to { transform: translateX(7px); opacity: .35; } }
        @keyframes grid-live { to { stroke-dashoffset: -18; } }
        @keyframes wave-run { to { stroke-dashoffset: -30; } }
        @keyframes led-blink { 50% { opacity: .25; } }
        @keyframes house-light { 50% { filter: drop-shadow(0 0 7px #ffdf48); } }
        @keyframes battery-pulse { 50% { opacity: .76; } }
        @keyframes ev-pulse { 50% { transform: scale(1.08); transform-origin: center; } }
        @keyframes cable-charge { to { stroke-dashoffset: -18; } }
        @keyframes feeder-flow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: calc(-1 * var(--dash-period)); }
        }

        @container (max-width: 1050px) {
          .energy-topology { column-gap: 70px; }
          .metric-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
          .control-grid, .extra-settings, .command-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
        }
        @container (max-width: 820px) {
          .top-row { grid-template-columns: 1fr; }
          .pv-summary { min-height: 120px; }
          .pv-strings { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .energy-topology { grid-template-columns: 1fr 1fr; grid-template-areas: "inverter inverter" "grid house" "phase ev" "battery battery"; gap: 18px; padding: 10px 0; }
          .flow-layer, .pv-network { display: none; }
          .secondary-grid { grid-template-columns: 1fr; }
          .status-strip { grid-template-columns: 1fr; }
          .status-strip span + span { border-top: 1px solid var(--outline); border-left: 0; }
        }
        @container (max-width: 580px) {
          .dashboard { padding: 8px; }
          .command-bar { align-items: stretch; flex-direction: column; }
          .command-status { display: grid; grid-template-columns: 1fr 1fr; }
          .status-chip b { max-width: 150px; }
          .pv-strings, .energy-topology { grid-template-columns: 1fr; }
          .energy-topology { grid-template-areas: "inverter" "grid" "house" "battery" "ev" "phase"; }
          .phase-module { min-height: 180px; }
          .forecast-heading { align-items: flex-start; flex-direction: column; }
          .forecast-chart { min-width: 680px; }
          .forecast-wrap { overflow-x: auto; }
          .metric-grid, .control-grid, .extra-settings, .command-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
        }
        @container (max-width: 380px) {
          .pv-strings, .metric-grid, .control-grid, .extra-settings, .command-grid { grid-template-columns: 1fr; }
          .brand p, .secondary summary i { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *:before, *:after { scroll-behavior: auto !important; animation-duration: .001ms !important; animation-iteration-count: 1 !important; }
          .flow-particle { display: none; }
        }
      </style>
      <ha-card>
        <div class="dashboard">
          <header class="command-bar">
            <div class="brand"><div class="brand-mark"><ha-icon icon="mdi:lightning-bolt"></ha-icon></div><div><h2>${this._escape(
              this.config.title,
            )}</h2><p>Illustrated live energy control</p></div></div>
            <div class="command-status">
              <div class="status-chip" data-entity="${this._escape(
                this.config.reason_entity,
              )}" role="button" tabindex="0"><span>System</span><b>${this._escape(reason)}</b></div>
              <div class="mode-control"><label for="duhnergy-mode">Mode</label><select id="duhnergy-mode" data-select="select.duhnergy_mode">
                ${["shadow", "auto", "off"]
                  .map(
                    (option) =>
                      `<option value="${option}" ${mode === option ? "selected" : ""}>${this._label(
                        option,
                      )}</option>`,
                  )
                  .join("")}
              </select></div>
            </div>
          </header>

          ${this._illustratedOverview(planAttributes, forecastAttributes, statsAttributes)}

          <section class="secondary">
            <details data-section="operations">
              <summary tabindex="0"><ha-icon icon="mdi:timeline-clock-outline"></ha-icon>Plan &amp; simulator<i>Existing planning and Shadow-mode activity</i></summary>
              <div class="secondary-body secondary-grid">
                <div><h4>Calculated plan</h4><div class="timeline">${this._timeline(
                  timeline,
                  "DKK",
                )}</div></div>
                <div><h4>Simulator log</h4><div class="decision-log">${this._simulator(
                  logEntries,
                )}</div></div>
              </div>
            </details>
            <details data-section="stats">
              <summary tabindex="0"><ha-icon icon="mdi:chart-box-outline"></ha-icon>Energy &amp; money statistics<i>Persistent tracked totals</i></summary>
              <div class="secondary-body">${this._stats(statsAttributes)}</div>
            </details>
            <details data-section="controls">
              <summary tabindex="0"><ha-icon icon="mdi:tune-variant"></ha-icon>Smart optimisations<i>Planning limits applied to every calculated plan</i></summary>
              <div class="secondary-body"><div class="control-grid">
                ${this._slider("Hard backup reserve", "number.duhnergy_hard_backup_reserve", "Battery floor preserved by every plan")}
                ${this._slider("Export stop SOC", "number.duhnergy_export_stop_soc", "Stop battery export at this level")}
                ${this._slider("EV battery stop SOC", "number.duhnergy_ev_battery_stop_soc", "Protect stored energy during EV charging")}
                ${this._slider("Solar forecast margin", "number.duhnergy_solar_forecast_margin", "Discount forecast uncertainty")}
                ${this._slider("Daily household demand", "number.duhnergy_household_daily_demand", "Expected consumption over 24 hours", "kWh")}
                ${this._slider("Grid current limit", "number.duhnergy_grid_current_limit", "Shared import limit for EV charging", "A")}
              </div></div>
            </details>
            <details data-section="manual">
              <summary tabindex="0"><ha-icon icon="mdi:gesture-tap-button"></ha-icon>Manual controls<i>Guarded service operations</i></summary>
              <div class="secondary-body"><div class="command-grid">
                ${this._button("charge_battery_now", "Charge battery", "mdi:battery-charging-high")}
                ${this._button("export_now", "Export now", "mdi:transmission-tower-export")}
                ${this._button("hold_battery", "Hold battery", "mdi:battery-lock")}
                ${this._button("pause_ev", "Pause EV", "mdi:pause-octagon-outline")}
                ${this._button("ev_solar", "EV solar", "mdi:solar-power-variant")}
                ${this._button("ev_battery", "EV battery", "mdi:home-battery-outline")}
                ${this._button("ev_grid", "EV grid", "mdi:transmission-tower-import")}
                ${this._button("resume_auto", "Resume Auto", "mdi:play-circle-outline")}
              </div></div>
            </details>
            <details data-section="settings">
              <summary tabindex="0"><ha-icon icon="mdi:cog-outline"></ha-icon>Settings<i>Integration-backed numeric controls</i></summary>
              <div class="secondary-body"><div class="extra-settings">
                ${this._setting("Battery capacity", "number.duhnergy_battery_capacity")}
                ${this._setting("Solar forecast margin", "number.duhnergy_solar_forecast_margin")}
                ${this._setting("Daily demand", "number.duhnergy_household_daily_demand")}
                ${this._setting("Grid current limit", "number.duhnergy_grid_current_limit")}
              </div></div>
            </details>
          </section>
          <footer class="footer">${this._escape(status)} · Verify source mappings and signs in Shadow before enabling Auto</footer>
        </div>
      </ha-card>`;

    if (stableFlowLayer) {
      this.shadowRoot.querySelector(".flow-layer")?.replaceWith(stableFlowLayer);
      this._restoreFlowAnimationState(stableFlowLayer, flowAnimationState);
    }
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
    const chart = this.shadowRoot.querySelector(".forecast-wrap");
    const tooltip = chart?.querySelector(".chart-tooltip");
    chart?.querySelectorAll("[data-chart-index]").forEach((hitArea) => {
      const show = (event) => {
        if (!tooltip) return;
        const pointer = event.touches?.[0] || event;
        const bounds = chart.getBoundingClientRect();
        tooltip.innerHTML = `<b>${this._escape(hitArea.dataset.time)}</b><br>Buy ${
          hitArea.dataset.buy
        } DKK/kWh · Sell ${hitArea.dataset.sell} DKK/kWh<br>Solar ${hitArea.dataset.solar} kW`;
        tooltip.style.left = `${Math.min(bounds.width - 80, Math.max(80, pointer.clientX - bounds.left))}px`;
        tooltip.style.top = `${Math.max(55, pointer.clientY - bounds.top)}px`;
        tooltip.hidden = false;
      };
      hitArea.addEventListener("pointermove", show);
      hitArea.addEventListener("pointerenter", show);
      hitArea.addEventListener("touchstart", show, { passive: true });
      hitArea.addEventListener("pointerleave", () => {
        if (tooltip) tooltip.hidden = true;
      });
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

  _captureFlowAnimationState(layer) {
    if (!layer) return null;
    let svgTime = null;
    try {
      svgTime = Number(layer.getCurrentTime?.());
    } catch {
      svgTime = null;
    }
    const cssTimes = new Map();
    layer.querySelectorAll("[data-flow-index]").forEach((group) => {
      const animation = group
        .querySelector(".flow-live")
        ?.getAnimations?.()
        .find((candidate) => candidate.animationName === "feeder-flow");
      const currentTime = Number(animation?.currentTime);
      if (Number.isFinite(currentTime)) cssTimes.set(group.dataset.flowIndex, currentTime);
    });
    return {
      capturedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
      cssTimes,
      svgTime: Number.isFinite(svgTime) ? svgTime : null,
    };
  }

  _restoreFlowAnimationState(layer, state) {
    if (!layer || !state) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsedMilliseconds = Math.max(0, now - state.capturedAt);
    if (state.svgTime != null) {
      try {
        layer.setCurrentTime?.(state.svgTime + elapsedMilliseconds / 1000);
      } catch {
        // Browsers without SVG timeline controls keep their native animation state.
      }
    }
    requestAnimationFrame(() => {
      layer.querySelectorAll("[data-flow-index]").forEach((group) => {
        const savedTime = state.cssTimes.get(group.dataset.flowIndex);
        if (!Number.isFinite(savedTime)) return;
        const animation = group
          .querySelector(".flow-live")
          ?.getAnimations?.()
          .find((candidate) => candidate.animationName === "feeder-flow");
        if (animation) animation.currentTime = savedTime + elapsedMilliseconds;
      });
    });
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

  _curve(from, to, flow = {}, index = 0) {
    const [ax, ay] = from;
    const [bx, by] = to;
    const round = (value) => Math.round(value * 10) / 10;
    if (flow.route === "straight") {
      return `M${round(ax)},${round(ay)} L${round(bx)},${round(by)}`;
    }
    if (flow.route === "vertical") {
      const direction = by >= ay ? 1 : -1;
      const laneDistance = Math.min(Math.abs(by - ay) / 2, 20 + index * 11);
      const laneY = ay + direction * laneDistance;
      return `M${round(ax)},${round(ay)} L${round(ax)},${round(laneY)} L${round(
        bx,
      )},${round(laneY)} L${round(bx)},${round(by)}`;
    }
    const laneX = ax + (bx - ax) / 2;
    return `M${round(ax)},${round(ay)} L${round(laneX)},${round(ay)} L${round(
      laneX,
    )},${round(by)} L${round(bx)},${round(by)}`;
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

    const descriptors = this._flowModel
      .map((flow, index) => {
        const start = this._anchor(container, ...flow.from);
        const end = this._anchor(container, ...flow.to);
        if (!start || !end) return null;
        const [from, to] = flow.reversed ? [end, start] : [start, end];
        const path = this._curve(from, to, flow, index);
        const intensity = Math.max(0.35, Math.min(1, Number(flow.power || 0) / 5000));
        return { flow, index, from, path, intensity, speed: flow.speed || 5 };
      })
      .filter(Boolean);
    const signature = descriptors
      .map(
        ({ flow, index }) =>
          `${index}:${flow.tone}:${flow.active ? 1 : 0}:${flow.reversed ? 1 : 0}:${
            flow.trunk ? 1 : 0
          }:${flow.noJunction ? 1 : 0}`,
      )
      .join("|");

    if (layer.dataset.flowSignature !== signature) {
      layer.innerHTML = descriptors
        .map(({ flow, index, from, path, intensity, speed }) => {
          const junction = flow.noJunction
            ? ""
            : `<circle class="flow-junction flow-${flow.tone}" cx="${from[0]}" cy="${
                from[1]
              }" r="${3 + intensity * 2}"></circle>`;
          const particles = flow.active
            ? [0, 1, 2]
                .map((particleIndex) => {
                  const begin = -((speed * particleIndex) / 3);
                  return `<circle class="flow-particle flow-${flow.tone}" r="${
                    2.5 + intensity
                  }" opacity="0">
                    <animateMotion dur="${speed}s" begin="${begin}s" repeatCount="indefinite" path="${path}"></animateMotion>
                    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.92;1" dur="${speed}s" begin="${begin}s" repeatCount="indefinite"></animate>
                  </circle>`;
                })
                .join("")
            : "";
          return `<g data-flow-index="${index}">
            <path class="flow-track-shadow" d="${path}"></path>
            <path class="flow-track${flow.trunk ? " trunk" : ""}" d="${path}"></path>
            <path class="flow-track-center" d="${path}"></path>${junction}${
              flow.active
                ? `<path class="flow-live flow-${flow.tone}${
                    flow.trunk ? " trunk" : ""
                  }" data-speed="${speed}" style="--flow-speed:${speed}s;opacity:${
                    0.55 + intensity * 0.45
                  }" d="${path}"></path>${particles}`
                : ""
            }
          </g>`;
        })
        .join("");
      layer.dataset.flowSignature = signature;
      return;
    }

    descriptors.forEach(({ flow, index, from, path, intensity, speed }) => {
      const group = layer.querySelector(`[data-flow-index="${index}"]`);
      if (!group) return;
      group.querySelectorAll(".flow-track-shadow, .flow-track, .flow-track-center, .flow-live").forEach(
        (element) => element.setAttribute("d", path),
      );
      const junction = group.querySelector(".flow-junction");
      if (junction) {
        junction.setAttribute("cx", from[0]);
        junction.setAttribute("cy", from[1]);
        junction.setAttribute("r", 3 + intensity * 2);
      }
      const live = group.querySelector(".flow-live");
      if (live) {
        live.style.opacity = 0.55 + intensity * 0.45;
        const previousSpeed = Number(live.dataset.speed || speed);
        if (Math.abs(previousSpeed - speed) > 0.01) {
          const animation = live.getAnimations?.().find(
            (candidate) => candidate.animationName === "feeder-flow",
          );
          const previousDuration = previousSpeed * 1000;
          const currentTime = Number(animation?.currentTime);
          const progress =
            animation && Number.isFinite(currentTime) && previousDuration > 0
              ? (((currentTime % previousDuration) + previousDuration) % previousDuration) /
                previousDuration
              : null;
          live.style.setProperty("--flow-speed", `${speed}s`);
          live.dataset.speed = speed;
          if (animation && progress != null) {
            animation.effect?.updateTiming({ duration: speed * 1000, iterations: Infinity });
            animation.currentTime = progress * speed * 1000;
          }
        }
      }
      group.querySelectorAll(".flow-particle").forEach((particle) => {
        particle.setAttribute("r", 2.5 + intensity);
        particle.querySelector("animateMotion")?.setAttribute("path", path);
      });
    });
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
      "<p>Duhnergy uses the integration entities automatically. Optional title, weather_entity, sun_entity, PV, phase, and daily-energy entity overrides can be configured in YAML.</p>";
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
      "Illustrated live energy topology, animated sky and feeders, DKK price and solar forecast, stats, simulator, settings, and guarded controls.",
    preview: true,
  });
}
console.info(
  "%c DUHNERGY! %c CARD ",
  "color:#111e24;background:#12c5df;font-weight:700",
  "color:#eef3f5;background:#182830",
);
