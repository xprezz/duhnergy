"""Duhnergy battery and EV preference switches.

These switches are planner *preferences*, persisted through config-entry
options. They constrain what the planner is allowed to propose; they do not
command hardware directly.
"""

from homeassistant.components.switch import SwitchEntity

from .const import DOMAIN, PREFERENCES
from .entity import DuhnergyEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    """Set up preference switches."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        DuhnergyPreferenceSwitch(coordinator, key) for key in PREFERENCES
    )


class DuhnergyPreferenceSwitch(DuhnergyEntity, SwitchEntity):
    """A planner preference stored in config-entry options."""

    def __init__(self, coordinator, key: str) -> None:
        super().__init__(coordinator, key)
        self.key = key
        name, icon, _default = PREFERENCES[key]
        self._attr_name = name
        self._attr_icon = icon

    @property
    def is_on(self) -> bool:
        """Return the stored preference."""
        return bool(self.coordinator.config.get(self.key, PREFERENCES[self.key][2]))

    async def async_turn_on(self, **kwargs) -> None:
        """Enable the preference."""
        await self.coordinator.async_set_setting(self.key, True)

    async def async_turn_off(self, **kwargs) -> None:
        """Disable the preference."""
        await self.coordinator.async_set_setting(self.key, False)
