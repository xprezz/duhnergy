"""Configurable Duhnergy number entities."""

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.const import EntityCategory

from .const import DOMAIN, SETTING_RANGES
from .entity import DuhnergyEntity

NAMES = {
    "hard_backup_reserve": "Hard backup reserve",
    "export_stop_soc": "Export stop SOC",
    "ev_battery_stop_soc": "EV battery stop SOC",
    "battery_capacity": "Battery capacity",
    "solar_forecast_margin": "Solar forecast margin",
    "household_daily_demand": "Household daily demand",
    "grid_current_limit": "Grid current limit",
}


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    """Set up configurable settings."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        DuhnergyNumber(coordinator, key, *values)
        for key, values in SETTING_RANGES.items()
    )


class DuhnergyNumber(DuhnergyEntity, NumberEntity):
    """A setting persisted in config-entry options."""

    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator, key, minimum, maximum, step, unit) -> None:
        super().__init__(coordinator, key)
        self.key = key
        self._attr_name = NAMES[key]
        self._attr_native_min_value = minimum
        self._attr_native_max_value = maximum
        self._attr_native_step = step
        self._attr_native_unit_of_measurement = unit
        self._attr_mode = NumberMode.BOX

    @property
    def native_value(self):
        """Return the configured value."""
        return self.coordinator.config[self.key]

    async def async_set_native_value(self, value: float) -> None:
        """Persist a setting."""
        await self.coordinator.async_set_setting(self.key, value)
