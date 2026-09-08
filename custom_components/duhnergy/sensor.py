"""Duhnergy sensors."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.const import UnitOfEnergy, UnitOfPower

from .const import DOMAIN
from .entity import DuhnergyEntity
from .stats import ENERGY_METRICS, MONEY_METRICS


@dataclass(frozen=True, kw_only=True)
class Description:
    """Description of a coordinator-backed sensor."""

    key: str
    name: str
    value: Callable[[dict[str, Any]], Any]
    unit: str | None = None
    icon: str | None = None
    device_class: SensorDeviceClass | None = None
    state_class: SensorStateClass | None = None


DESCRIPTIONS = [
    Description(key="status", name="Status", value=lambda data: data["status"], icon="mdi:home-lightning-bolt"),
    Description(key="reason", name="Reason", value=lambda data: data["reason"], icon="mdi:text-box-outline"),
    Description(
        key="net_budget",
        name="Predicted surplus or deficit",
        value=lambda data: data["plan"]["net_budget_kwh"],
        unit=UnitOfEnergy.KILO_WATT_HOUR,
        icon="mdi:scale-balance",
        device_class=SensorDeviceClass.ENERGY,
    ),
    Description(
        key="predicted_surplus",
        name="Predicted surplus",
        value=lambda data: data["plan"]["surplus_kwh"],
        unit=UnitOfEnergy.KILO_WATT_HOUR,
        icon="mdi:transmission-tower-export",
        device_class=SensorDeviceClass.ENERGY,
    ),
    Description(
        key="predicted_deficit",
        name="Predicted deficit",
        value=lambda data: data["plan"]["deficit_kwh"],
        unit=UnitOfEnergy.KILO_WATT_HOUR,
        icon="mdi:transmission-tower-import",
        device_class=SensorDeviceClass.ENERGY,
    ),
    Description(
        key="battery_soc",
        name="Battery state of charge",
        value=lambda data: data["battery_soc"],
        unit="%",
        icon="mdi:battery",
    ),
    Description(
        key="solar_power",
        name="Solar power",
        value=lambda data: data["solar_power_w"],
        unit=UnitOfPower.WATT,
        icon="mdi:solar-power",
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    Description(
        key="house_power",
        name="House power",
        value=lambda data: data["house_power_w"],
        unit=UnitOfPower.WATT,
        icon="mdi:home-lightning-bolt-outline",
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    Description(
        key="grid_power",
        name="Grid net power",
        value=lambda data: data["grid_power_w"],
        unit=UnitOfPower.WATT,
        icon="mdi:transmission-tower",
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    Description(
        key="battery_power",
        name="Battery power",
        value=lambda data: data["battery_power_w"],
        unit=UnitOfPower.WATT,
        icon="mdi:battery-charging",
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    Description(
        key="ev_power",
        name="EV power",
        value=lambda data: data["ev_power_w"],
        unit=UnitOfPower.WATT,
        icon="mdi:ev-station",
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    Description(
        key="forecast_solar_energy",
        name="Forecast solar energy",
        value=lambda data: data["plan"]["usable_solar_forecast_kwh"],
        unit=UnitOfEnergy.KILO_WATT_HOUR,
        icon="mdi:solar-power-variant",
        device_class=SensorDeviceClass.ENERGY,
    ),
]

STAT_NAMES = {
    "grid_import_kwh": "Grid import",
    "grid_export_kwh": "Grid export",
    "solar_production_kwh": "Solar production",
    "household_consumption_kwh": "Household consumption",
    "battery_charged_kwh": "Battery charged",
    "battery_discharged_kwh": "Battery discharged",
    "ev_charged_kwh": "EV charged",
    "import_cost": "Import cost",
    "export_revenue": "Export revenue",
    "self_consumption_value": "Estimated self-consumption value",
    "net_cost": "Net cost",
}


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    """Set up coordinator-backed sensors."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = [DuhnergySensor(coordinator, description) for description in DESCRIPTIONS]
    entities.extend(
        [
            DuhnergyPlanSensor(coordinator),
            DuhnergyForecastSensor(coordinator),
            DuhnergyCurrentPriceSensor(coordinator, "buy"),
            DuhnergyCurrentPriceSensor(coordinator, "sell"),
            DuhnergyStatsSummarySensor(coordinator),
            DuhnergySimulatorLogSensor(coordinator),
        ]
    )
    entities.extend(
        DuhnergyLifetimeStatSensor(coordinator, metric)
        for metric in (*ENERGY_METRICS, *MONEY_METRICS)
    )
    async_add_entities(entities)


class DuhnergySensor(DuhnergyEntity, SensorEntity):
    """A scalar Duhnergy sensor."""

    def __init__(self, coordinator, description: Description) -> None:
        super().__init__(coordinator, description.key)
        self.description = description
        self._attr_name = description.name
        self._attr_native_unit_of_measurement = description.unit
        self._attr_icon = description.icon
        self._attr_device_class = description.device_class
        self._attr_state_class = description.state_class

    @property
    def native_value(self):
        """Return the current value."""
        return self.description.value(self.coordinator.data)


class DuhnergyPlanSensor(DuhnergyEntity, SensorEntity):
    """Expose the full timeline as attributes."""

    _attr_name = "Plan"
    _attr_icon = "mdi:timeline-clock-outline"

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "plan")

    @property
    def native_value(self):
        """Return the active planned action."""
        return self.coordinator.data["plan"]["current_action"]

    @property
    def extra_state_attributes(self):
        """Return plan details for automations and the card."""
        plan = self.coordinator.data["plan"]
        return {
            "generated_at": plan["generated_at"],
            "horizon_hours": plan["horizon_hours"],
            "timeline": plan["timeline"],
            "battery_above_reserve_kwh": plan["battery_above_reserve_kwh"],
            "usable_solar_forecast_kwh": plan["usable_solar_forecast_kwh"],
            "expected_demand_kwh": plan["expected_demand_kwh"],
            "net_budget_kwh": plan["net_budget_kwh"],
            "manual_command": self.coordinator.data["manual_command"],
            "manual_expires_at": self.coordinator.data["manual_expires_at"],
            "limitations": plan["limitations"],
            "source_entities": self.coordinator.data["source_entities"],
            "conventions": self.coordinator.data["conventions"],
        }


class DuhnergyForecastSensor(DuhnergyEntity, SensorEntity):
    """Expose aligned solar and price arrays for the bundled chart."""

    _attr_name = "24-hour forecast"
    _attr_icon = "mdi:chart-areaspline"

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "forecast_24h")

    @property
    def native_value(self):
        """Return the forecast horizon."""
        return "24 hours"

    @property
    def extra_state_attributes(self):
        """Return bounded normalized arrays and price summaries."""
        forecast = self.coordinator.data["forecast_24h"]

        def summary(values):
            available = [
                (index, value)
                for index, value in enumerate(values)
                if value is not None
            ]
            minimum = min(available, key=lambda item: item[1]) if available else None
            maximum = max(available, key=lambda item: item[1]) if available else None
            return {
                "min": minimum[1] if minimum else None,
                "min_at": forecast["timestamps"][minimum[0]] if minimum else None,
                "max": maximum[1] if maximum else None,
                "max_at": forecast["timestamps"][maximum[0]] if maximum else None,
            }

        return {
            **forecast,
            "buy_summary": summary(forecast["buy_price"]),
            "sell_summary": summary(forecast["sell_price"]),
            "current_buy_price": self.coordinator.data["import_price"],
            "current_sell_price": self.coordinator.data["sale_price"],
            "currency": self.coordinator.data["currency"],
            "source_entities": self.coordinator.data["source_entities"],
        }


class DuhnergyCurrentPriceSensor(DuhnergyEntity, SensorEntity):
    """Expose a selected current price as a standard monetary sensor."""

    _attr_icon = "mdi:cash-clock"

    def __init__(self, coordinator, kind: str) -> None:
        super().__init__(coordinator, f"current_{kind}_price")
        self.kind = kind
        self._attr_name = f"Current {kind} price"

    @property
    def native_value(self):
        """Return current buy or sell price."""
        key = "import_price" if self.kind == "buy" else "sale_price"
        return self.coordinator.data[key]

    @property
    def native_unit_of_measurement(self):
        """Return configured currency per kWh."""
        return f"{self.coordinator.data['currency']}/kWh"

    @property
    def extra_state_attributes(self):
        """Identify the mapped source entity."""
        source_key = "import_price" if self.kind == "buy" else "sale_price"
        return {"source_entity": self.coordinator.data["source_entities"][source_key]}


class DuhnergyLifetimeStatSensor(DuhnergyEntity, SensorEntity):
    """Expose a lifetime counter for HA recorder and long-term statistics."""

    def __init__(self, coordinator, metric: str) -> None:
        super().__init__(coordinator, f"lifetime_{metric.removesuffix('_kwh')}")
        self.metric = metric
        self._attr_name = f"Lifetime {STAT_NAMES[metric].lower()}"
        self._attr_icon = (
            "mdi:counter"
            if metric in ENERGY_METRICS
            else "mdi:cash-multiple"
        )
        if metric in ENERGY_METRICS:
            self._attr_device_class = SensorDeviceClass.ENERGY
            self._attr_native_unit_of_measurement = UnitOfEnergy.KILO_WATT_HOUR
            self._attr_state_class = SensorStateClass.TOTAL_INCREASING
        else:
            self._attr_device_class = SensorDeviceClass.MONETARY
            self._attr_state_class = SensorStateClass.TOTAL

    @property
    def native_value(self):
        """Return the durable lifetime value."""
        return self.coordinator.data["stats"]["periods"]["lifetime"][self.metric]

    @property
    def native_unit_of_measurement(self):
        """Return kWh or the configured currency."""
        if self.metric in ENERGY_METRICS:
            return UnitOfEnergy.KILO_WATT_HOUR
        return self.coordinator.data["stats"]["currency"]


class DuhnergyStatsSummarySensor(DuhnergyEntity, SensorEntity):
    """Expose all period buckets for the card and automations."""

    _attr_name = "Stats summary"
    _attr_icon = "mdi:chart-box-outline"
    _attr_device_class = SensorDeviceClass.MONETARY

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "stats_summary")

    @property
    def native_value(self):
        """Use today's net cost as the compact state."""
        return self.coordinator.data["stats"]["periods"]["today"]["net_cost"]

    @property
    def native_unit_of_measurement(self):
        """Return configured currency."""
        return self.coordinator.data["stats"]["currency"]

    @property
    def extra_state_attributes(self):
        """Return all local-time buckets and accounting definitions."""
        return self.coordinator.data["stats"]


class DuhnergySimulatorLogSensor(DuhnergyEntity, SensorEntity):
    """Expose the persisted Shadow activity stream."""

    _attr_name = "Simulator log"
    _attr_icon = "mdi:history"

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "simulator_log")

    @property
    def native_value(self):
        """Return the latest proposed action."""
        entries = self.coordinator.data["simulator_log"]
        return entries[0]["planned_action"] if entries else "empty"

    @property
    def extra_state_attributes(self):
        """Return the bounded newest-first stream."""
        entries = self.coordinator.data["simulator_log"]
        return {"entries": entries, "entry_count": len(entries), "maximum_entries": 150}
