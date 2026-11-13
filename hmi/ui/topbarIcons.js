// Top bar icons (2026-11-12, Maksim): his web components, used unmodified --
// <m600-chiller>, <m600-movement>, <m600-notifications>, <m600-calendar>,
// <m600-settings> and <m600-ventilation>. The component files live beside the
// app entry (static/ui/m600-*.js) and are registered by it; nothing in hmi/
// imports them. Each one draws and animates itself from its attributes; the
// app only mirrors its state into them, and every write is guarded, so a page
// without the components simply shows no icons:
//   chiller, fan      hmi/utilities.js      setTopbarUtilityToggleState, syncTopbarFanIcon
//   bell              hmi/notifications.js  updateNotificationBellState
//   calendar          hmi/calendar.js       setCalendarScreenOpen
//   settings          hmi/settings.js       setTopbarSettingsMenuOpen
//   movement          the app entry         setControlsPanelOpen
// This file holds the one helper those call sites share. It touches no DOM at
// import time, so it is safe to import from any hmi/ module and from tests.

// Mirror an open/closed panel into a top bar icon component. Written only on
// a change, so repeated calls neither replay the animation nor touch the DOM.
export function setTopbarIconActive(iconEl, isActive) {
  if (iconEl && iconEl.hasAttribute("active") !== Boolean(isActive)) {
    iconEl.toggleAttribute("active", Boolean(isActive));
  }
}
