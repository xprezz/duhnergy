"""Duhnergy sensors."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from homeassistant.components.sensor import SensorEntity
from homeassistant.const import UnitOfEnergy, UnitOfPower

from .const import DOMAIN
from .entity import DuhnergyEntity


@dataclass(frozen=True, kw_only=True)
class Description:
    """Description of a coordinator-backed sensor."""

    key: str
    name: str
    value: Callable[[dict[str, Any]], Any]
    unit: str | None = None
    icon: str | None = None


DESCRIPTIONS = [
    Description(key="status", name="Status", value=lambda data: data["status"], icon="mdi:home-lightning-bolt"),
    Description(key="reason", name="Reason", value=lambda data: data["reason"], icon="mdi:text-box-outline"),
    Description(
        key="net_budget",
        name="Predicted surplus or deficit",
        value=lambda data: data["plan"]["net_budget_kwh"],
        unit=UnitOfEnergy.KILO_WATT_HOUR,
        icon="mdi:scale-balance",
    ),
    Description(
        key="predicted_surplus",
        name="Predicted surplus",
        value=lambda data: data["plan"]["surplus_kwh"],
        unit=UnitOfEnergy.KILO_WATT_HOUR,
        icon="mdi:transmission-tower-export",
    ),
    Description(
        key="predicted_deficit",
        name="Predicted deficit",
        value=lambda data: data["plan"]["deficit_kwh"],
        unit=UnitOfEnergy.KILO_WATT_HOUR,
        icon="mdi:transmission-tower-import",
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
    ),
    Description(
        key="house_power",
        name="House power",
        value=lambda data: data["house_power_w"],
        unit=UnitOfPower.WATT,
        icon="mdi:home-lightning-bolt-outline",
    ),
    Description(
        key="grid_power",
        name="Grid net power",
        value=lambda data: data["grid_power_w"],
        unit=UnitOfPower.WATT,
        icon="mdi:transmission-tower",
    ),
    Description(
        key="battery_power",
        name="Battery power",
        value=lambda data: data["battery_power_w"],
        unit=UnitOfPower.WATT,
        icon="mdi:battery-charging",
    ),
    Description(
        key="ev_power",
        name="EV power",
        value=lambda data: data["ev_power_w"],
        unit=UnitOfPower.WATT,
        icon="mdi:ev-station",
    ),
]


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    """Set up coordinator-backed sensors."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = [DuhnergySensor(coordinator, description) for description in DESCRIPTIONS]
    entities.append(DuhnergyPlanSensor(coordinator))
    async_add_entities(entities)


class DuhnergySensor(DuhnergyEntity, SensorEntity):
    """A scalar Duhnergy sensor."""

    def __init__(self, coordinator, description: Description) -> None:
        super().__init__(coordinator, description.key)
        self.description = description
        self._attr_name = description.name
        self._attr_native_unit_of_measurement = description.unit
        self._attr_icon = description.icon

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
        }
