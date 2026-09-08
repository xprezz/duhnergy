"""Small, dependency-free energy planner for Duhnergy."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
import math
from typing import Any


@dataclass(slots=True)
class PricePeriod:
    """A normalized price period."""

    start: datetime
    end: datetime
    price: float


@dataclass(slots=True)
class PlanItem:
    """One planned state interval."""

    start: datetime
    end: datetime
    action: str
    reason: str
    price: float | None = None
    energy_kwh: float | None = None

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON-safe representation."""
        result = asdict(self)
        result["start"] = self.start.isoformat()
        result["end"] = self.end.isoformat()
        return result


def _dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def normalize_prices(
    raw: Any, now: datetime, default_duration: timedelta = timedelta(hours=1)
) -> list[PricePeriod]:
    """Normalize common Home Assistant forecast attribute shapes."""
    if not isinstance(raw, list):
        return []
    parsed: list[tuple[datetime, datetime | None, float]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        start = _dt(item.get("start") or item.get("time") or item.get("from"))
        end = _dt(item.get("end") or item.get("to"))
        try:
            price = float(item.get("price"))
        except (TypeError, ValueError):
            continue
        if start is not None:
            if start.tzinfo is None:
                start = start.replace(tzinfo=now.tzinfo)
            if end is not None and end.tzinfo is None:
                end = end.replace(tzinfo=now.tzinfo)
            parsed.append((start, end, price))
    parsed.sort(key=lambda period: period[0])
    result: list[PricePeriod] = []
    for index, (start, end, price) in enumerate(parsed):
        inferred_end = (
            parsed[index + 1][0] if index + 1 < len(parsed) else start + default_duration
        )
        actual_end = end or inferred_end
        if actual_end > now:
            result.append(PricePeriod(max(start, now), actual_end, price))
    return result


def forecast_solar_kwh(raw: Any, margin_percent: float, now: datetime) -> float:
    """Integrate an hourly kW forecast over its future time intervals."""
    if not isinstance(raw, dict):
        return 0.0
    times = raw.get("time")
    powers = raw.get("pred_kw")
    if not isinstance(times, list) or not isinstance(powers, list):
        return 0.0
    points: list[tuple[datetime, float]] = []
    for stamp, power in zip(times, powers, strict=False):
        parsed = _dt(stamp)
        try:
            numeric = max(0.0, float(power))
        except (TypeError, ValueError):
            continue
        if parsed is not None:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=now.tzinfo)
            points.append((parsed, numeric))
    points.sort(key=lambda point: point[0])
    if not points:
        try:
            today = max(0.0, float(raw.get("today_kwh", 0)))
            tomorrow = max(0.0, float(raw.get("tomorrow_kwh", 0)))
        except (TypeError, ValueError):
            return 0.0
        hours_remaining_today = 24 - (
            now.hour + now.minute / 60 + now.second / 3600
        )
        today_fraction = hours_remaining_today / 24
        fallback = today * today_fraction + tomorrow * (1 - today_fraction)
        return fallback * margin_percent / 100
    total = 0.0
    horizon = now + timedelta(hours=24)
    for index, (start, power) in enumerate(points):
        if start >= horizon:
            break
        end = points[index + 1][0] if index + 1 < len(points) else start + timedelta(hours=1)
        interval_start = max(start, now)
        hours = max(
            0.0, (min(end, horizon) - interval_start).total_seconds() / 3600
        )
        total += power * hours
    return total * margin_percent / 100


def _best_contiguous_window(
    periods: list[PricePeriod], required_hours: float, cheapest: bool
) -> list[PricePeriod]:
    """Select a contiguous price window that covers the required duration."""
    if not periods or required_hours <= 0:
        return []
    best: tuple[float, float, list[PricePeriod]] | None = None
    for start_index in range(len(periods)):
        window: list[PricePeriod] = []
        duration = 0.0
        weighted_cost = 0.0
        previous_end: datetime | None = None
        for period in periods[start_index:]:
            if previous_end is not None and period.start - previous_end > timedelta(minutes=1):
                break
            available_hours = (period.end - period.start).total_seconds() / 3600
            if available_hours <= 0:
                continue
            used_hours = min(available_hours, required_hours - duration)
            used_end = period.start + timedelta(hours=used_hours)
            window.append(PricePeriod(period.start, used_end, period.price))
            duration += used_hours
            weighted_cost += period.price * used_hours
            previous_end = period.end
            if math.isclose(duration, required_hours) or duration >= required_hours:
                average = weighted_cost / duration
                score = average if cheapest else -average
                candidate = (score, duration, list(window))
                if best is None or candidate[:2] < best[:2]:
                    best = candidate
                break
    return best[2] if best else []


def _average_price(window: list[PricePeriod]) -> float:
    """Return the duration-weighted price of a window."""
    durations = [
        (period.end - period.start).total_seconds() / 3600 for period in window
    ]
    return sum(
        period.price * duration
        for period, duration in zip(window, durations, strict=True)
    ) / sum(durations)


def build_plan(
    *,
    now: datetime,
    soc: float,
    settings: dict[str, Any],
    import_forecast: Any,
    sale_forecast: Any,
    solar_forecast: Any,
) -> dict[str, Any]:
    """Build a 24-hour energy budget and actionable timeline."""
    capacity = float(settings["battery_capacity"])
    reserve = float(settings["hard_backup_reserve"])
    export_stop = max(reserve, float(settings["export_stop_soc"]))
    forecast_margin = float(settings["solar_forecast_margin"])
    demand = float(settings["household_daily_demand"])
    grid_current = float(settings["grid_current_limit"])

    battery_above_reserve = max(0.0, (soc - reserve) / 100 * capacity)
    battery_above_export_stop = max(0.0, (soc - export_stop) / 100 * capacity)
    solar_kwh = forecast_solar_kwh(solar_forecast, forecast_margin, now)
    net_kwh = battery_above_reserve + solar_kwh - demand
    deficit_kwh = max(0.0, -net_kwh)
    surplus_kwh = max(0.0, net_kwh)
    timeline: list[PlanItem] = []

    horizon = now + timedelta(hours=24)

    def within_horizon(periods: list[PricePeriod]) -> list[PricePeriod]:
        return [
            PricePeriod(period.start, min(period.end, horizon), period.price)
            for period in periods
            if period.start < horizon
        ]

    import_periods = within_horizon(normalize_prices(import_forecast, now))
    usable_charge_kw = max(1.4, min(11.0, grid_current * 230 / 1000))
    if deficit_kwh > 0 and import_periods:
        required_hours = deficit_kwh / usable_charge_kw
        window = _best_contiguous_window(import_periods, required_hours, cheapest=True)
        if window:
            timeline.append(
                PlanItem(
                    window[0].start,
                    window[-1].end,
                    "battery_grid_charge",
                    f"Cover predicted {deficit_kwh:.1f} kWh shortfall",
                    _average_price(window),
                    min(deficit_kwh, required_hours * usable_charge_kw),
                )
            )

    sale_periods = [
        period
        for period in within_horizon(normalize_prices(sale_forecast, now))
        if period.price > 0
    ]
    exportable_kwh = min(surplus_kwh, battery_above_export_stop)
    if exportable_kwh > 0 and sale_periods:
        discharge_kw = min(5.0, usable_charge_kw)
        window = _best_contiguous_window(
            sale_periods, exportable_kwh / discharge_kw, cheapest=False
        )
        if window:
            timeline.append(
                PlanItem(
                    window[0].start,
                    window[-1].end,
                    "battery_export",
                    f"Export surplus while preserving {export_stop:.0f}% SOC",
                    _average_price(window),
                    exportable_kwh,
                )
            )

    battery_ranges = [
        (item.start, item.end)
        for item in timeline
        if item.action in {"battery_grid_charge", "battery_export"}
    ]
    ev_periods = [
        period
        for period in import_periods
        if not any(
            period.start < battery_end and period.end > battery_start
            for battery_start, battery_end in battery_ranges
        )
    ]
    ev_window = _best_contiguous_window(ev_periods, 3.0, cheapest=True)
    if ev_window:
        timeline.append(
            PlanItem(
                ev_window[0].start,
                ev_window[-1].end,
                "ev_grid_charge",
                "Cheapest available three-hour EV window",
                _average_price(ev_window),
            )
        )

    timeline.sort(key=lambda item: item.start)
    current = next(
        (item.action for item in timeline if item.start <= now < item.end), "idle"
    )
    reason = {
        "battery_grid_charge": "Predicted energy shortfall; charging in cheapest window",
        "battery_export": "Predicted surplus; exporting in best positive sale period",
        "ev_grid_charge": "EV charging in cheapest non-overlapping window",
        "idle": "No scheduled grid action now",
    }[current]
    return {
        "generated_at": now.isoformat(),
        "horizon_hours": 24,
        "battery_above_reserve_kwh": round(battery_above_reserve, 2),
        "usable_solar_forecast_kwh": round(solar_kwh, 2),
        "expected_demand_kwh": round(demand, 2),
        "net_budget_kwh": round(net_kwh, 2),
        "deficit_kwh": round(deficit_kwh, 2),
        "surplus_kwh": round(surplus_kwh, 2),
        "current_action": current,
        "reason": reason,
        "timeline": [item.as_dict() for item in timeline],
        "limitations": (
            "24-hour deterministic forecast; daily demand is not time-shaped and "
            "conversion losses, weather uncertainty, and EV energy need are not modeled."
        ),
    }
