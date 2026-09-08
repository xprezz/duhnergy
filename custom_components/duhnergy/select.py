"""Duhnergy mode select."""

from homeassistant.components.select import SelectEntity
from homeassistant.const import EntityCategory

from .const import DOMAIN, MODES
from .entity import DuhnergyEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    """Set up the mode selector."""
    async_add_entities([DuhnergyModeSelect(hass.data[DOMAIN][entry.entry_id])])


class DuhnergyModeSelect(DuhnergyEntity, SelectEntity):
    """Select calculation/execution behavior."""

    _attr_name = "Mode"
    _attr_options = MODES
    _attr_icon = "mdi:state-machine"
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "mode")

    @property
    def current_option(self):
        """Return the configured mode."""
        return self.coordinator.config["mode"]

    async def async_select_option(self, option: str) -> None:
        """Persist the selected mode."""
        await self.coordinator.async_set_setting("mode", option)
