"""Persistent energy and money accounting for Duhnergy."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any

ENERGY_METRICS = (
    "grid_import_kwh",
    "grid_export_kwh",
    "solar_production_kwh",
    "household_consumption_kwh",
    "battery_charged_kwh",
    "battery_discharged_kwh",
    "ev_charged_kwh",
)
MONEY_METRICS = (
    "import_cost",
    "export_revenue",
    "self_consumption_value",
    "net_cost",
)
METRICS = ENERGY_METRICS + MONEY_METRICS
PERIODS = ("today", "week", "month", "year", "lifetime")
MAX_INTEGRATION_SECONDS = 10 * 60


def _empty_totals() -> dict[str, float]:
    return {metric: 0.0 for metric in METRICS}


def _period_keys(now: datetime) -> dict[str, str]:
    iso_year, iso_week, _ = now.isocalendar()
    return {
        "today": now.date().isoformat(),
        "week": f"{iso_year}-W{iso_week:02d}",
        "month": f"{now.year}-{now.month:02d}",
        "year": str(now.year),
        "lifetime": "lifetime",
    }


class EnergyStatsModel:
    """Pure stats accumulator whose serialized state is safe for Store."""

    def __init__(self, data: dict[str, Any] | None = None) -> None:
        self.data = self._validated(data)

    @staticmethod
    def _validated(data: dict[str, Any] | None) -> dict[str, Any]:
        fresh = {
            "period_keys": {},
            "periods": {period: _empty_totals() for period in PERIODS},
            "last_counters": {},
            "last_powers": {},
            "last_update": None,
            "currency": "DKK",
        }
        if not isinstance(data, dict):
            return fresh
        for period in PERIODS:
            values = data.get("periods", {}).get(period, {})
            for metric in METRICS:
                try:
                    value = float(values.get(metric, 0.0))
                    fresh["periods"][period][metric] = (
                        value if metric in MONEY_METRICS else max(0.0, value)
                    )
                except (TypeError, ValueError):
                    pass
        fresh["period_keys"] = dict(data.get("period_keys", {}))
        fresh["last_counters"] = dict(data.get("last_counters", {}))
        fresh["last_powers"] = dict(data.get("last_powers", {}))
        fresh["last_update"] = data.get("last_update")
        fresh["currency"] = str(data.get("currency") or "DKK")
        return fresh

    def _counter_delta(self, key: str, value: Any) -> float | None:
        if value is None:
            return None
        try:
            current = float(value)
        except (TypeError, ValueError):
            return None
        previous = self.data["last_counters"].get(key)
        self.data["last_counters"][key] = current
        if previous is None:
            return 0.0
        try:
            previous_value = float(previous)
        except (TypeError, ValueError):
            return 0.0
        if current < previous_value:
            return 0.0
        return current - previous_value

    def _integrated_power(
        self,
        key: str,
        current: Any,
        elapsed_seconds: float,
        transform,
    ) -> float:
        try:
            current_value = float(current)
        except (TypeError, ValueError):
            self.data["last_powers"].pop(key, None)
            return 0.0
        previous = self.data["last_powers"].get(key)
        self.data["last_powers"][key] = current_value
        if (
            previous is None
            or elapsed_seconds <= 0
            or elapsed_seconds > MAX_INTEGRATION_SECONDS
        ):
            return 0.0
        average_w = (
            transform(float(previous)) + transform(current_value)
        ) / 2
        return average_w / 1000 * elapsed_seconds / 3600

    def update(self, now: datetime, sample: dict[str, Any]) -> dict[str, Any]:
        """Apply one sample, handling counter resets and local bucket rollover."""
        keys = _period_keys(now)
        for period in PERIODS:
            if self.data["period_keys"].get(period) != keys[period]:
                if period != "lifetime":
                    self.data["periods"][period] = _empty_totals()
                self.data["period_keys"][period] = keys[period]

        elapsed = 0.0
        if self.data["last_update"]:
            try:
                previous_update = datetime.fromisoformat(self.data["last_update"])
                elapsed = (now - previous_update).total_seconds()
            except (TypeError, ValueError):
                pass
        self.data["last_update"] = now.isoformat()
        self.data["currency"] = str(sample.get("currency") or "DKK")

        grid_import = self._counter_delta(
            "grid_import", sample.get("grid_import_energy_kwh")
        )
        grid_export = self._counter_delta(
            "grid_export", sample.get("grid_export_energy_kwh")
        )
        household = self._counter_delta(
            "household", sample.get("house_energy_kwh")
        )

        grid_positive = sample.get("grid_power_positive", "import")
        integrated_import = self._integrated_power(
            "grid_import",
            sample.get("grid_power_w"),
            elapsed,
            (lambda value: max(0.0, value))
            if grid_positive == "import"
            else (lambda value: max(0.0, -value)),
        )
        integrated_export = self._integrated_power(
            "grid_export",
            sample.get("grid_power_w"),
            elapsed,
            (lambda value: max(0.0, -value))
            if grid_positive == "import"
            else (lambda value: max(0.0, value)),
        )
        if grid_import is None:
            grid_import = (
                0.0
                if "grid_import" in self.data["last_counters"]
                else integrated_import
            )
        if grid_export is None:
            grid_export = (
                0.0
                if "grid_export" in self.data["last_counters"]
                else integrated_export
            )

        solar = self._integrated_power(
            "solar", sample.get("solar_power_w"), elapsed, lambda value: max(0.0, value)
        )
        if household is None:
            integrated_household = self._integrated_power(
                "house",
                sample.get("house_power_w"),
                elapsed,
                lambda value: max(0.0, value),
            )
            household = (
                0.0
                if "household" in self.data["last_counters"]
                else integrated_household
            )
        battery_positive = sample.get("battery_power_positive", "charge")
        battery_charge = self._integrated_power(
            "battery_charge",
            sample.get("battery_power_w"),
            elapsed,
            (lambda value: max(0.0, value))
            if battery_positive == "charge"
            else (lambda value: max(0.0, -value)),
        )
        battery_discharge = self._integrated_power(
            "battery_discharge",
            sample.get("battery_power_w"),
            elapsed,
            (lambda value: max(0.0, -value))
            if battery_positive == "charge"
            else (lambda value: max(0.0, value)),
        )
        ev = self._integrated_power(
            "ev", sample.get("ev_power_w"), elapsed, lambda value: max(0.0, value)
        )

        buy_price = _numeric(sample.get("buy_price"))
        sell_price = _numeric(sample.get("sell_price"))
        estimated_self_consumption = max(0.0, solar - grid_export)
        increments = {
            "grid_import_kwh": grid_import,
            "grid_export_kwh": grid_export,
            "solar_production_kwh": solar,
            "household_consumption_kwh": household,
            "battery_charged_kwh": battery_charge,
            "battery_discharged_kwh": battery_discharge,
            "ev_charged_kwh": ev,
            "import_cost": grid_import * buy_price,
            "export_revenue": grid_export * sell_price,
            "self_consumption_value": estimated_self_consumption * buy_price,
            "net_cost": grid_import * buy_price - grid_export * sell_price,
        }
        for period in PERIODS:
            for metric, increment in increments.items():
                self.data["periods"][period][metric] += increment
        return self.summary()

    def summary(self) -> dict[str, Any]:
        """Return rounded values suitable for HA states and attributes."""
        return {
            "currency": self.data["currency"],
            "period_keys": deepcopy(self.data["period_keys"]),
            "periods": {
                period: {
                    metric: round(value, 3 if metric in ENERGY_METRICS else 2)
                    for metric, value in self.data["periods"][period].items()
                }
                for period in PERIODS
            },
            "definitions": {
                "self_consumption_value": (
                    "Estimated as sampled solar production minus measured grid export, "
                    "valued at the current buy price."
                ),
                "power_integration": (
                    "Solar, battery, and EV energy use trapezoidal power integration; "
                    "sample gaps over 10 minutes are ignored."
                ),
            },
        }


def _numeric(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


class DuhnergyStats:
    """Persist EnergyStatsModel with Home Assistant Store."""

    def __init__(self, hass, entry_id: str) -> None:
        from homeassistant.helpers.storage import Store

        self._store = Store(hass, 1, f"duhnergy.stats.{entry_id}")
        self.model = EnergyStatsModel()

    async def async_load(self) -> None:
        """Load stored counters and baselines."""
        self.model = EnergyStatsModel(await self._store.async_load())

    async def async_update(
        self, now: datetime, sample: dict[str, Any]
    ) -> dict[str, Any]:
        """Update counters and queue a durable write."""
        result = self.model.update(now, sample)
        self._store.async_delay_save(lambda: self.model.data, 30)
        return result

    async def async_save(self) -> None:
        """Flush data during unload."""
        await self._store.async_save(self.model.data)
