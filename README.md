# Duhnergy!

Compact Home Assistant energy planning for one Solis Modbus inverter/battery and one Easee charger. One HACS install provides the backend and automatically registers the bundled Lovelace card.

> [!WARNING]
> Duhnergy starts in **Shadow** mode and changes no equipment. Before selecting **Auto**, disable every legacy automation that controls the same Solis charge/discharge slots, reserve settings, or Easee charger. Competing automation can repeatedly overwrite safety settings.

## Install now

1. In HACS, open **Integrations**, select the three-dot menu, and choose **Custom repositories**.
2. Add `https://github.com/xprezz/duhnergy` as category **Integration**.
3. Find **Duhnergy!**, download it, and restart Home Assistant.
4. Go to **Settings → Devices & services → Add integration**, search for **Duhnergy!**, and complete the form.
5. Keep **Mode** set to **Shadow** while checking the mappings, calculated budget, and timeline.

The setup form is prefilled with the known entity IDs for the target installation. Every input and Solis control can be changed later under **Settings → Devices & services → Duhnergy! → Configure**. The Easee device ID is never stored or hardcoded: Duhnergy derives it from the selected charger status entity's entity-registry device.

## Add the card

The integration serves and registers the card JavaScript automatically. Add a manual card:

```yaml
type: custom:duhnergy-card
title: Duhnergy!
```

After the first installation or upgrade, refresh the browser without cache if the card is not immediately available.

## What v0.1.0 does

- Calculates a 24-hour kWh budget from battery energy above the hard reserve, margin-adjusted hourly solar forecast, and configured household daily demand.
- Schedules a predicted battery shortfall into the cheapest dynamically sized contiguous import-price window.
- Schedules exportable predicted surplus into the best positive sale-price period while respecting export stop SOC.
- Uses only Solis charge slot 1 and discharge slot 1.
- Prefers household needs and reserve preservation, then opportunistic EV charging from live solar/excess battery, then planned export.
- Gives the EV a cheapest default three-hour grid window, avoids planned house-battery grid charging, and pauses or throttles against the configured single-phase grid current limit.
- Exposes status/reason, complete timeline, predicted surplus/deficit, power flow, configurable number/select entities, guarded buttons, and the `duhnergy.command` service.

Modes:

- **Shadow** — calculate and display only; never call Solis or Easee services.
- **Auto** — execute the current safe action and expose the complete calculated timeline.
- **Off** — stop calculating actions for execution and leave equipment untouched.

Guarded commands are **Charge battery now**, **Export now**, **Hold battery**, **EV Solar**, **EV Battery**, **EV Grid**, and **Pause EV**. They expire at the next planned start/end transition (or after one hour if no transition exists). **Resume Auto** clears the override immediately. In Shadow or Off, commands are displayed but not executed.

The same commands are available as a service:

```yaml
action: duhnergy.command
data:
  command: ev_solar
```

Use `resume_auto` to clear an override.

## Settings

| Setting | Default | Purpose |
|---|---:|---|
| Hard backup reserve | 20% | Battery energy below this SOC is never budgeted. Auto also applies it to the mapped Solis backup SOC control. |
| Export stop SOC | 35% | Export is blocked at or below this SOC. |
| EV battery stop SOC | 45% | Opportunistic EV charging from excess battery stops here. |
| Battery capacity | 10 kWh | Nominal capacity used to convert SOC to available energy. |
| Solar forecast margin | 80% | Discounts the hourly solar forecast before budgeting. |
| Household daily demand | 12 kWh | Expected demand over the next 24 hours. |
| Grid current limit | 25 A | Shared import limit used to throttle or pause EV charging. |

## v1 limitations

This is deliberately a simple, testable first release:

- Forecasting is deterministic over 24 hours. Daily household demand is not time-shaped, and conversion losses, weather confidence beyond the margin, seasonal behavior, tariffs/fees, and EV energy required are not modeled.
- Duhnergy does **not** calculate or publish cost savings/totals.
- Grid-current limiting assumes the mapped net grid power is positive when importing and uses a nominal 230 V single-phase conversion.
- Solis charge-current tuning is mapped but v0.1.0 relies on existing inverter limits; it only operates the first charge/discharge slots.
- Price forecast parsing expects `prices: [{start, end, price}]` for import and `forecast: [{start, price}]` for sale. Hourly solar expects parallel `time[]` and `pred_kw[]` attributes; the daily today/tomorrow sensors provide a coarse time-weighted fallback when hourly data is absent.
- Auto execution intentionally focuses on the action active now. It disables slot-1 grid charging/discharging when idle to avoid stale actions, so conflicting automations must be disabled.
- Easee action depends on the selected charger entity being linked to an Easee device in Home Assistant's entity registry.

Use Shadow mode first, compare the timeline with the source forecasts, and adjust capacity, demand, reserve, and forecast margin before enabling Auto.
