# Duhnergy!

Duhnergy! is a Home Assistant energy planner and dashboard for one Solis Modbus inverter/battery and one Easee charger. One HACS install provides the backend, persistent energy and money accounting, Shadow-mode simulation, and an automatically registered Lovelace card.

> [!WARNING]
> Duhnergy starts in **Shadow** mode and changes no equipment. Before selecting **Auto**, verify the source mappings and disable every legacy automation that controls the same Solis charge/discharge slots, reserve settings, or Easee charger. Competing automation can repeatedly overwrite safety settings.

## Install or update with HACS

For a first installation:

1. In HACS, open **Integrations**, select the three-dot menu, and choose **Custom repositories**.
2. Add `https://github.com/xprezz/duhnergy` as category **Integration**.
3. Find **Duhnergy!**, download it, and restart Home Assistant.
4. Go to **Settings → Devices & services → Add integration**, search for **Duhnergy!**, and complete the form.
5. Keep **Mode** set to **Shadow** while checking the mappings, forecast, calculated timeline, and simulator log.

To update to v0.2.0, open Duhnergy! in HACS, choose **Update/download**, restart Home Assistant, then hard-refresh the dashboard browser once so the `?v=0.2.0` card resource is loaded.

The setup form is prefilled with known entity IDs for the target installation. Every source, Solis control, sign convention, currency, and planning setting can be changed later under **Settings → Devices & services → Duhnergy! → Configure**. The Easee device ID is derived from the selected charger status entity's entity-registry device and is never hardcoded.

## Add the card

The integration serves and registers its JavaScript automatically:

```yaml
type: custom:duhnergy-card
title: Duhnergy!
```

The v0.2.0 card is optimised for iPad landscape and other widescreen dashboards. It collapses to a single-column layout on narrow screens and includes:

- Live directional power flow among Solar, House, Battery, Grid, and EV.
- One-to-four individually mapped solar surfaces, current weather, live production, today's forecast, and production so far today.
- A dependency-free SVG 24-hour chart with solar area, buy/sell price lines, dual scales, forecast gaps, tooltips, and a current-time marker.
- The calculated action timeline, persistent period stats, Shadow activity stream, guarded controls, and planning settings.
- Native Home Assistant more-info dialogs for every displayed entity-backed metric and node, including keyboard activation with Enter or Space.
- Range sliders for the primary smart optimisations, backed by the existing Duhnergy number entities.

## Forecast sources and sensors

Default sources:

| Input | Default |
|---|---|
| Hourly solar | `sensor.garage_my_solar_forecast_hourly_forecast` attributes `time[]` and `pred_kw[]` |
| Solar today/tomorrow | `sensor.garage_my_solar_forecast_today` / `sensor.garage_my_solar_forecast_tomorrow` |
| Solar surfaces 1–4 | `sensor.solis_pv_power_1` through `sensor.solis_pv_power_4` |
| Solar production today | `sensor.solis_pv_today_energy_generation` |
| Current weather | `weather.forecast_home` |
| Current buy price | `sensor.stromligning_current_price_vat` |
| Buy forecast | `sensor.stromligning_forecasts_vat` attribute `prices: [{start, end, price}]` |
| Current sell price and forecast | `sensor.solar_real_sales_price` attribute `forecast: [{start, price}]` |

Forecast timestamps may be Python `datetime` values supplied by Home Assistant or ISO strings. Duhnergy normalises them safely into 24 bounded, JSON-safe, hourly-aligned arrays while retaining missing values as `null`. `sensor.duhnergy_24_hour_forecast` exposes `timestamps`, `solar_kw`, `buy_price`, `sell_price`, current prices, min/max summaries, currency, and source entities. Dedicated current buy/sell and forecast solar energy sensors are also provided.

The integration options let installations choose one to four solar surfaces and map each channel independently. The card omits unavailable channels, and each displayed surface remains independently clickable. Weather and today's cumulative production source are also selectable.

The planner calculates a 24-hour kWh budget from battery energy above reserve, margin-adjusted solar, and configured household demand. It schedules shortfalls into the cheapest contiguous import window, exportable surplus into the best positive sale window, and a non-overlapping three-hour EV grid window.

## Persistent stats

Stats are stored with Home Assistant's `Store` helper and survive restart and integration reload. Duhnergy maintains Today, ISO Week, Month, Year, and Lifetime buckets in Home Assistant's local timezone.

| Metric | Definition |
|---|---|
| Grid import/export | Preferred delta from mapped cumulative meters; sampled grid power is the fallback |
| Household consumption | Preferred delta from the mapped cumulative household meter; sampled house power is the fallback |
| Solar production | Trapezoidal integration of sampled solar power |
| Battery charged/discharged | Separate trapezoidal integration using the configured battery sign convention |
| EV charged | Trapezoidal integration of positive charger power |
| Import cost | Incremental grid import × current buy price |
| Export revenue | Incremental grid export × current sell price |
| Estimated self-consumption value | Sampled solar production minus measured grid export, floored at zero, × current buy price |
| Net cost | Import cost minus export revenue |

Cumulative meters are re-baselined after a reset and never treat the reset value as new consumption. The first sample establishes a baseline. Power integrations use adjacent samples and ignore intervals longer than 10 minutes, preventing restart or network downtime from being counted as energy. These choices favour defensible accounting over fabricated precision; short gaps and price changes within one coordinator interval can still introduce small estimation error.

Lifetime energy sensors use `total_increasing` for recorder and long-term statistics. Home Assistant permits monetary device-class sensors to use `total`; all lifetime money sensors use that compatible state class. Net cost can fall when revenue is earned. The stats summary sensor exposes all period buckets for the bundled card.

Defaults assume mapped grid power is positive for import and mapped battery power is positive for charging. Both conventions are configurable. Currency defaults to DKK and can be changed; leaving it blank permits inference from Home Assistant/source metadata where available.

## Simulator log and operating modes

- **Shadow** calculates and displays only. For each distinct action, service-operation set, or plan boundary, it records a bounded persistent counterfactual entry such as “If Auto were active, Duhnergy would have applied battery grid charge.” Refreshes with the same decision are deduplicated.
- **Auto** executes the current safe action and exposes the complete timeline.
- **Off** leaves equipment untouched. It does not write execution-shaped simulator entries.

Each Shadow entry includes its timestamp, proposed action, reason, SOC/price/power context, and the high-level Home Assistant/Easee service operations Auto would request. The newest 150 entries are retained. Clear them with the card button, `button.duhnergy_clear_simulator_log`, or:

```yaml
action: duhnergy.clear_simulator_log
```

Guarded commands are **Charge battery now**, **Export now**, **Hold battery**, **EV Solar**, **EV Battery**, **EV Grid**, and **Pause EV**. They expire at the next planned transition, or after one hour when no transition exists. **Resume Auto** clears the override. Shadow and Off never execute these commands.

```yaml
action: duhnergy.command
data:
  command: ev_solar
```

## Planning settings

| Setting | Default | Purpose |
|---|---:|---|
| Hard backup reserve | 20% | Energy below this SOC is never budgeted; Auto applies it to the mapped backup SOC control |
| Export stop SOC | 35% | Battery export is blocked at or below this SOC |
| EV battery stop SOC | 45% | Opportunistic EV use from battery surplus stops here |
| Battery capacity | 10 kWh | Converts SOC into available energy |
| Solar forecast margin | 80% | Discounts the hourly solar forecast |
| Household daily demand | 12 kWh | Expected demand over the next 24 hours |
| Grid current limit | 25 A | Shared single-phase import limit for EV throttling |

## Battery and EV preference switches

Tapping the **Home battery** or **EV charger** node on the card opens a sub-menu of
switch entities created by the integration (`switch.duhnergy_…`). They persist in the
config entry options and survive restarts.

| Switch | Wired into the planner? |
|---|---|
| Allow battery export | **Yes** — turning it off suppresses all planned battery export |
| Stop battery charging | **Yes** — turning it on suppresses planned grid charging of the battery |
| Price based discharge | No — stored preference only |
| Grid TOU charging | No — stored preference only |
| Battery direct grid charging | No — stored preference only |
| Stop / start charger | No — stored preference only |
| EV solar charging sync | No — stored preference only |
| EV direct grid charging | No — stored preference only |
| EV direct battery charging | No — stored preference only |
| EV schedule | No — stored preference only |

The switches marked *No* are surfaced and remembered, but do not yet change planner
output. Do not rely on them as safety interlocks.

## Honest limitations

- Forecasting remains deterministic. Household demand is not time-shaped; conversion losses, weather confidence beyond the margin, seasonal behaviour, tariff components, and required EV energy are not modelled.
- Estimated self-consumption cannot perfectly distinguish solar export from battery export without additional metering.
- Cost uses the price sampled when each energy delta is processed, not a tariff ledger with sub-minute settlement.
- Solis charge-current tuning is mapped but v0.2.0 still operates only the first charge/discharge slots and relies on existing inverter current limits.
- The flow diagram follows the configured grid/battery sign conventions. Verify them in Shadow mode before trusting directional animation.
- Auto focuses on the action active now and disables stale slot-1 charging/discharging while idle. Conflicting automations must be disabled.
- Easee control requires the selected charger entity to be linked to an Easee device in Home Assistant's entity registry.
