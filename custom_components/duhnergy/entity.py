"""Shared Duhnergy entity base."""

from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


class DuhnergyEntity(CoordinatorEntity):
    """Base entity attached to the Duhnergy coordinator."""

    _attr_has_entity_name = True

    def __init__(self, coordinator, key: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{DOMAIN}_{key}"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, DOMAIN)},
            "name": "Duhnergy!",
            "manufacturer": "Duhnergy",
            "model": "Energy planner",
            "sw_version": "0.1.0",
        }
