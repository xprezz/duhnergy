class DuhnergyCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  static async getConfigElement() {
    return document.createElement("duhnergy-card-editor");
  }

  setConfig(config) {
    this.config = {
      title: "Duhnergy!",
      status_entity: "sensor.duhnergy_status",
      reason_entity: "sensor.duhnergy_reason",
      plan_entity: "sensor.duhnergy_plan",
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
    return 6;
  }

  _state(entityId) {
    return this._hass?.states?.[entityId];
  }

  _value(entityId, fallback = "—") {
    const state = this._state(entityId);
    if (!state || ["unknown", "unavailable"].includes(state.state)) return fallback;
    return state.state;
  }

  _metric(icon, label, entityId, suffix = "") {
    const state = this._state(entityId);
    const unit = state?.attributes?.unit_of_measurement || suffix;
    return `<div class="metric"><ha-icon icon="${icon}"></ha-icon><div><span>${this._escape(label)}</span><strong>${this._escape(this._value(entityId))}${unit ? ` ${this._escape(unit)}` : ""}</strong></div></div>`;
  }

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  _time(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }

  _label(value) {
    return String(value || "idle").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  _render() {
    if (!this.shadowRoot || !this.config) return;
    const openSections = [...this.shadowRoot.querySelectorAll("details")].map((item) => item.open);
    const status = this._value(this.config.status_entity, "Loading");
    const reason = this._value(this.config.reason_entity, "Waiting for first calculation");
    const plan = this._state(this.config.plan_entity);
    const timeline = Array.isArray(plan?.attributes?.timeline) ? plan.attributes.timeline : [];
    const mode = this._value("select.duhnergy_mode", "shadow");
    const net = Number(this._value("sensor.duhnergy_predicted_surplus_or_deficit", 0));
    const tone = status.startsWith("auto") ? "auto" : status.startsWith("manual") ? "manual" : status.startsWith("off") ? "off" : "shadow";
    const rows = timeline.length
      ? timeline.map((item) => `<div class="timeline-row">
          <div class="rail"><i></i></div>
          <div><strong>${this._escape(this._label(item.action))}</strong><span>${this._escape(this._time(item.start))}–${this._escape(this._time(item.end))}</span><small>${this._escape(item.reason)}</small></div>
          ${item.price == null ? "" : `<b>${Number(item.price).toFixed(2)}</b>`}
        </div>`).join("")
      : `<div class="empty">No grid actions planned in the next 24 hours.</div>`;

    this.shadowRoot.innerHTML = `
      <style>
        :host { --duh-bg: linear-gradient(145deg, #102b33, #193e43 55%, #183632); display:block; }
        ha-card { overflow:hidden; color:#f4fbfa; background:var(--duh-bg); border:0; box-shadow:0 12px 30px rgba(5,30,35,.22); }
        .hero { padding:22px 22px 15px; position:relative; }
        .hero:after { content:""; position:absolute; width:160px; height:160px; border-radius:50%; right:-45px; top:-75px; background:radial-gradient(circle,rgba(90,230,179,.2),transparent 68%); }
        h2 { margin:0 0 12px; font-size:23px; letter-spacing:-.4px; }
        .state { display:flex; align-items:center; gap:8px; font-weight:700; text-transform:capitalize; }
        .dot { width:10px; height:10px; border-radius:50%; background:#ffc857; box-shadow:0 0 10px #ffc857; }
        .auto .dot { background:#64e6ad; box-shadow:0 0 10px #64e6ad; } .manual .dot { background:#62b5ff; } .off .dot { background:#9aa9aa; box-shadow:none; }
        .reason { margin:7px 0 0; color:#bad1cf; line-height:1.35; font-size:13px; max-width:90%; }
        .budget { margin:0 18px 16px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; border-radius:12px; background:rgba(255,255,255,.07); }
        .budget span { color:#b7cecb; font-size:12px; } .budget strong { color:${net < 0 ? "#ffad9d" : "#6be4ad"}; font-size:18px; }
        .metrics { display:grid; grid-template-columns:repeat(2,1fr); gap:1px; background:rgba(255,255,255,.08); }
        .metric { display:flex; align-items:center; gap:10px; padding:13px 17px; background:rgba(7,34,38,.48); }
        .metric ha-icon { color:#67d9b0; --mdc-icon-size:22px; } .metric div { min-width:0; display:flex; flex-direction:column; }
        .metric span { color:#9eb8b6; font-size:11px; } .metric strong { font-size:15px; margin-top:2px; }
        .section { padding:17px 20px; } .section h3 { font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#9fbbb8; margin:0 0 12px; }
        .timeline-row { display:grid; grid-template-columns:16px 1fr auto; gap:9px; min-height:55px; }
        .timeline-row .rail { position:relative; border-left:2px solid rgba(103,217,176,.2); margin-left:4px; }
        .timeline-row i { display:block; position:absolute; left:-5px; top:4px; width:8px; height:8px; border-radius:50%; background:#67d9b0; }
        .timeline-row div:nth-child(2) { display:flex; flex-direction:column; } .timeline-row strong { font-size:13px; }
        .timeline-row span,.timeline-row small { color:#a9c1bf; font-size:11px; margin-top:2px; } .timeline-row b { font-size:12px; color:#d4e9e6; }
        .empty { color:#9eb8b6; font-size:13px; }
        details { border-top:1px solid rgba(255,255,255,.1); } summary { cursor:pointer; padding:15px 20px; color:#c5d9d7; font-weight:600; }
        .controls { padding:0 20px 19px; display:grid; grid-template-columns:repeat(2,1fr); gap:8px; }
        button,select,input { box-sizing:border-box; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.08); color:#f4fbfa; border-radius:8px; min-height:36px; padding:7px 9px; }
        button { cursor:pointer; font-weight:600; } button:hover { background:rgba(103,217,176,.2); }
        select { width:100%; } select option { color:#152f34; } .wide { grid-column:1/-1; }
        .setting { display:grid; grid-template-columns:1fr 90px; align-items:center; gap:10px; color:#c0d4d2; font-size:12px; }
        @media (max-width:420px) { .metrics,.controls { grid-template-columns:1fr; } .wide { grid-column:auto; } }
      </style>
      <ha-card class="${tone}">
        <div class="hero"><h2>${this._escape(this.config.title)}</h2><div class="state"><i class="dot"></i>${this._escape(status)}</div><p class="reason">${this._escape(reason)}</p></div>
        <div class="budget"><span>24-hour energy budget</span><strong>${net >= 0 ? "+" : ""}${net.toFixed(1)} kWh</strong></div>
        <div class="metrics">
          ${this._metric("mdi:battery", "Battery", "sensor.duhnergy_battery_state_of_charge")}
          ${this._metric("mdi:solar-power", "Solar", "sensor.duhnergy_solar_power")}
          ${this._metric("mdi:home-lightning-bolt-outline", "House", "sensor.duhnergy_house_power")}
          ${this._metric("mdi:transmission-tower", "Grid", "sensor.duhnergy_grid_net_power")}
          ${this._metric("mdi:battery-charging", "Battery flow", "sensor.duhnergy_battery_power")}
          ${this._metric("mdi:ev-station", "EV", "sensor.duhnergy_ev_power")}
        </div>
        <div class="section"><h3>Calculated timeline</h3>${rows}</div>
        <details><summary>Manual controls</summary><div class="controls">
          ${this._button("charge_battery_now", "Charge battery now")}
          ${this._button("export_now", "Export now")}
          ${this._button("hold_battery", "Hold battery")}
          ${this._button("pause_ev", "Pause EV")}
          ${this._button("ev_solar", "EV Solar")}
          ${this._button("ev_battery", "EV Battery")}
          ${this._button("ev_grid", "EV Grid")}
          ${this._button("resume_auto", "Resume Auto")}
        </div></details>
        <details><summary>Settings</summary><div class="controls">
          <label class="setting wide">Mode<select data-select="select.duhnergy_mode">${["shadow","auto","off"].map((item) => `<option value="${item}" ${mode === item ? "selected" : ""}>${this._label(item)}</option>`).join("")}</select></label>
          ${this._setting("Hard backup reserve", "number.duhnergy_hard_backup_reserve")}
          ${this._setting("Export stop SOC", "number.duhnergy_export_stop_soc")}
          ${this._setting("EV battery stop SOC", "number.duhnergy_ev_battery_stop_soc")}
          ${this._setting("Battery capacity", "number.duhnergy_battery_capacity")}
          ${this._setting("Solar forecast margin", "number.duhnergy_solar_forecast_margin")}
          ${this._setting("Daily demand", "number.duhnergy_household_daily_demand")}
          ${this._setting("Grid current limit", "number.duhnergy_grid_current_limit")}
        </div></details>
      </ha-card>`;
    this.shadowRoot.querySelectorAll("[data-button]").forEach((button) => button.addEventListener("click", () => this._press(button.dataset.button)));
    this.shadowRoot.querySelectorAll("[data-number]").forEach((input) => input.addEventListener("change", () => this._setNumber(input.dataset.number, input.value)));
    this.shadowRoot.querySelectorAll("[data-select]").forEach((select) => select.addEventListener("change", () => this._select(select.dataset.select, select.value)));
    this.shadowRoot.querySelectorAll("details").forEach((item, index) => { item.open = openSections[index] || false; });
  }

  _button(command, label) {
    return `<button data-button="button.duhnergy_${command}">${this._escape(label)}</button>`;
  }

  _setting(label, entityId) {
    const state = this._state(entityId);
    return `<label class="setting">${this._escape(label)}<input data-number="${entityId}" type="number" value="${this._escape(state?.state || "")}" min="${state?.attributes?.min ?? ""}" max="${state?.attributes?.max ?? ""}" step="${state?.attributes?.step ?? "1"}"></label>`;
  }

  _press(entityId) {
    this._hass.callService("button", "press", { entity_id: entityId });
  }

  _setNumber(entityId, value) {
    this._hass.callService("number", "set_value", { entity_id: entityId, value: Number(value) });
  }

  _select(entityId, option) {
    this._hass.callService("select", "select_option", { entity_id: entityId, option });
  }
}

class DuhnergyCardEditor extends HTMLElement {
  setConfig(config) {
    this.config = config;
    this.innerHTML = `<p>Duhnergy automatically uses its integration entities. The optional title can be changed in YAML.</p>`;
  }

  set hass(hass) {
    this._hass = hass;
  }
}

customElements.define("duhnergy-card", DuhnergyCard);
customElements.define("duhnergy-card-editor", DuhnergyCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "duhnergy-card",
  name: "Duhnergy!",
  description: "Energy budget, timeline, power flow, settings, and guarded controls.",
  preview: true,
});
