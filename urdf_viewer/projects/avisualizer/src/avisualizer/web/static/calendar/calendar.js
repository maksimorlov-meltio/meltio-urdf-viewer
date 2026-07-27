// Calendar domain factory (extracted byte-exact from urdf_viewer.js). Owns the
// event list + view/anchor/selection state and the render/DOM logic for the
// maintenance-calendar screen (month/week/day/agenda grids, the event modal,
// event chips with drag-to-reschedule, and the details panel). The god-file
// creates ONE instance via createCalendar(ctx) and destructures the returned
// API back to the original function names, so its call sites are unchanged;
// the toolbar nav (prev/today/next/view) calls stepRange/goToToday/setView and
// the open flag is read via calendar.isScreenOpen.
//
// Pure date formatters live in ./calendarFormat.js. setCalendarScreenOpen is a
// menu coordinator: it closes the other overlays via ctx callbacks, and the
// notifications<->calendar mutual-close pair is wired with lazy ctx arrows in
// the god-file to avoid a factory-creation-order cycle.
import {
  formatCalendarDateTime,
  formatCalendarTime,
  formatCalendarDurationHours,
  toLocalDateTimeInputValue,
} from "./calendarFormat.js?v=1";
const CALENDAR_VIEW_VALUES = Object.freeze(["month", "week", "day", "agenda"]);
const CALENDAR_EVENT_TYPE_META = Object.freeze({
  completed_print: Object.freeze({ label: "Printed job", className: "type-completed_print" }),
  scheduled_print: Object.freeze({ label: "Scheduled print", className: "type-scheduled_print" }),
  maintenance: Object.freeze({ label: "Maintenance", className: "type-maintenance" }),
  completed_maintenance: Object.freeze({ label: "Completed maintenance", className: "type-completed_maintenance" }),
  warning_maintenance: Object.freeze({ label: "Warning / overdue maintenance", className: "type-warning_maintenance" }),
  unavailable: Object.freeze({ label: "Machine unavailable", className: "type-unavailable" }),
});

export function createCalendar(ctx) {
  const {
    calendarScreenEl,
    calendarGridEl,
    calendarRangeLabelEl,
    calendarViewMonthEl,
    calendarViewWeekEl,
    calendarViewDayEl,
    calendarViewAgendaEl,
    calendarEventDetailsBodyEl,
    calendarEventModalEl,
    calendarEventModalTitleEl,
    calendarEventTitleInputEl,
    calendarEventTypeInputEl,
    calendarEventStartInputEl,
    calendarEventEndInputEl,
    calendarEventFileInputEl,
    calendarEventMaterialInputEl,
    calendarEventEstimatedHoursInputEl,
    calendarEventActualHoursInputEl,
    calendarEventMaterialUsedInputEl,
    calendarEventMachineInputEl,
    calendarEventNotesInputEl,
    calendarEventDeleteEl,
    calendarEventValidationEl,
    topbarCalendarToggleEl,
    escapeHtml,
    markUserActivity,
    MELTIO_MATERIAL_LIBRARY,
    getCloudFileLibraryEntries,
    setNotificationCenterOpen,
    setNotificationHistoryScreenOpen,
    setControlsPanelOpen,
    isControlsPanelOpen,
    setCloudModelMenuOpen,
    isCloudModelMenuOpen,
    setMaterialsMenuOpen,
    isMaterialsMenuOpen,
    closeHotspotContextPanel,
    setTopbarSettingsMenuOpen,
  } = ctx;
let isCalendarScreenOpen = false;
let calendarCurrentView = "month";
let calendarAnchorDate = new Date();
let selectedCalendarEventId = null;
let editingCalendarEventId = null;
let activeCalendarDragEventId = null;
let activeCalendarDragStartDateIso = null;
let calendarEventIdCounter = 1;
const calendarEvents = [];

function normalizeCalendarView(view) {
  const normalized = String(view || "").trim().toLowerCase();
  return CALENDAR_VIEW_VALUES.includes(normalized) ? normalized : "month";
}

function normalizeCalendarEventType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CALENDAR_EVENT_TYPE_META, normalized)
    ? normalized
    : "scheduled_print";
}

function createCalendarEvent(event) {
  const nowIso = new Date().toISOString();
  const id = event.id || `evt-${calendarEventIdCounter++}`;
  return {
    id,
    title: String(event.title || "Untitled event").trim() || "Untitled event",
    type: normalizeCalendarEventType(event.type),
    startTime: new Date(event.startTime).toISOString(),
    endTime: new Date(event.endTime).toISOString(),
    status: String(event.status || "planned").trim() || "planned",
    relatedPrintFile: String(event.relatedPrintFile || "").trim(),
    material: String(event.material || "").trim(),
    estimatedPrintTime: Number.isFinite(Number(event.estimatedPrintTime)) ? Number(event.estimatedPrintTime) : null,
    actualPrintTime: Number.isFinite(Number(event.actualPrintTime)) ? Number(event.actualPrintTime) : null,
    materialUsedGrams: Number.isFinite(Number(event.materialUsedGrams)) ? Number(event.materialUsedGrams) : null,
    machineName: String(event.machineName || "M600-PRO-1").trim() || "M600-PRO-1",
    notes: String(event.notes || "").trim(),
    createdAt: event.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

function seedCalendarEventsIfNeeded() {
  if (calendarEvents.length) {
    return;
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0);
  const inHours = (hours) => new Date(startOfDay.getTime() + (hours * 60 * 60 * 1000));

  calendarEvents.push(
    createCalendarEvent({
      title: "Small Torture Test - Scheduled",
      type: "scheduled_print",
      startTime: inHours(2),
      endTime: inHours(5),
      status: "scheduled",
      relatedPrintFile: "Small Torture Test.stl",
      material: "316L Stainless Steel",
      estimatedPrintTime: 3,
      materialUsedGrams: 120,
      notes: "Priority queue",
    }),
    createCalendarEvent({
      title: "Filter Neck Printing - Completed",
      type: "completed_print",
      startTime: inHours(-10),
      endTime: inHours(-6),
      status: "completed",
      relatedPrintFile: "0110908_Filter Neck Printing.stl",
      material: "17-4PH Stainless Steel",
      estimatedPrintTime: 4,
      actualPrintTime: 3.8,
      materialUsedGrams: 95,
      notes: "Completed without alarms",
    }),
    createCalendarEvent({
      title: "Nozzle Cleaning",
      type: "maintenance",
      startTime: inHours(28),
      endTime: inHours(30),
      status: "scheduled",
      notes: "Auto-suggested from print load",
    }),
    createCalendarEvent({
      title: "Bed Alignment - Overdue",
      type: "warning_maintenance",
      startTime: inHours(-30),
      endTime: inHours(-29),
      status: "overdue",
      notes: "Overdue by schedule placeholder rule",
    }),
  );
}

function suggestMaintenanceEventsFromSchedule() {
  const scheduledPrintCount = calendarEvents.filter((event) => event.type === "scheduled_print").length;
  const existingSuggested = calendarEvents.some((event) => event.notes.includes("Auto-suggested from print load"));

  if (scheduledPrintCount >= 2 && !existingSuggested) {
    const maintenanceStart = new Date(calendarAnchorDate);
    maintenanceStart.setDate(maintenanceStart.getDate() + 3);
    maintenanceStart.setHours(9, 0, 0, 0);
    const maintenanceEnd = new Date(maintenanceStart.getTime() + (2 * 60 * 60 * 1000));

    calendarEvents.push(createCalendarEvent({
      title: "Preventive Maintenance Window",
      type: "maintenance",
      startTime: maintenanceStart,
      endTime: maintenanceEnd,
      status: "scheduled",
      notes: "Auto-suggested from print load",
    }));
  }
}

function getCalendarEventsSorted() {
  return [...calendarEvents].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}

function isSameCalendarDay(dateA, dateB) {
  return dateA.getFullYear() === dateB.getFullYear()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getDate() === dateB.getDate();
}

function getCalendarWeekStart(dateLike) {
  const date = new Date(dateLike);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function buildCalendarRangeLabel() {
  const anchor = new Date(calendarAnchorDate);

  if (calendarCurrentView === "month") {
    return anchor.toLocaleDateString([], { month: "long", year: "numeric" });
  }

  if (calendarCurrentView === "day") {
    return anchor.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  }

  const start = getCalendarWeekStart(anchor);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toLocaleDateString([], { month: "short", day: "2-digit" })} - ${end.toLocaleDateString([], { month: "short", day: "2-digit", year: "numeric" })}`;
}

function clearCalendarGrid() {
  if (!calendarGridEl) {
    return;
  }
  calendarGridEl.textContent = "";
}

function getEventsForCalendarDay(dayDate) {
  const dayStartMs = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, 0, 0, 0).getTime();
  const dayEndMs = dayStartMs + (24 * 60 * 60 * 1000);
  return getCalendarEventsSorted().filter((event) => {
    const startMs = new Date(event.startTime).getTime();
    const endMs = new Date(event.endTime).getTime();
    return startMs < dayEndMs && endMs >= dayStartMs;
  });
}

function renderCalendarEventDetails() {
  if (!calendarEventDetailsBodyEl) {
    return;
  }

  const selectedEvent = calendarEvents.find((event) => event.id === selectedCalendarEventId) || null;
  if (!selectedEvent) {
    calendarEventDetailsBodyEl.innerHTML = "<p class=\"calendar-empty-state\">Select an event to review details.</p>";
    return;
  }

  const typeMeta = CALENDAR_EVENT_TYPE_META[selectedEvent.type] || CALENDAR_EVENT_TYPE_META.scheduled_print;
  const details = [
    `<p><strong>Title:</strong> ${escapeHtml(selectedEvent.title)}</p>`,
    `<p><strong>Type:</strong> ${escapeHtml(typeMeta.label)}</p>`,
    `<p><strong>Start:</strong> ${escapeHtml(formatCalendarDateTime(selectedEvent.startTime))}</p>`,
    `<p><strong>End:</strong> ${escapeHtml(formatCalendarDateTime(selectedEvent.endTime))}</p>`,
    `<p><strong>Duration:</strong> ${escapeHtml(formatCalendarDurationHours(selectedEvent.startTime, selectedEvent.endTime))}</p>`,
    `<p><strong>Status:</strong> ${escapeHtml(selectedEvent.status || "planned")}</p>`,
    `<p><strong>Print File:</strong> ${escapeHtml(selectedEvent.relatedPrintFile || "-")}</p>`,
    `<p><strong>Material:</strong> ${escapeHtml(selectedEvent.material || "-")}</p>`,
    `<p><strong>Estimated Print Time:</strong> ${escapeHtml(selectedEvent.estimatedPrintTime != null ? `${selectedEvent.estimatedPrintTime}h` : "-")}</p>`,
    `<p><strong>Actual Print Time:</strong> ${escapeHtml(selectedEvent.actualPrintTime != null ? `${selectedEvent.actualPrintTime}h` : "-")}</p>`,
    `<p><strong>Material Used:</strong> ${escapeHtml(selectedEvent.materialUsedGrams != null ? `${Math.round(selectedEvent.materialUsedGrams)}g` : "-")}</p>`,
    `<p><strong>Machine:</strong> ${escapeHtml(selectedEvent.machineName || "M600-PRO-1")}</p>`,
    `<p><strong>Maintenance Notes:</strong> ${escapeHtml(selectedEvent.notes || "-")}</p>`,
  ];

  calendarEventDetailsBodyEl.innerHTML = details.join("");
}

function openCalendarEventModal(eventId = null, anchorDate = null) {
  if (!calendarEventModalEl) {
    return;
  }

  populateCalendarEventFormOptions();
  const event = eventId ? calendarEvents.find((entry) => entry.id === eventId) : null;
  editingCalendarEventId = event ? event.id : null;

  if (calendarEventModalTitleEl) {
    calendarEventModalTitleEl.textContent = event ? "Edit Event" : "Add Event";
  }

  const startDate = event
    ? new Date(event.startTime)
    : (anchorDate ? new Date(anchorDate) : new Date());
  const endDate = event
    ? new Date(event.endTime)
    : new Date(startDate.getTime() + (60 * 60 * 1000));

  if (calendarEventTitleInputEl) {
    calendarEventTitleInputEl.value = event ? event.title : "";
  }
  if (calendarEventTypeInputEl) {
    calendarEventTypeInputEl.value = event ? event.type : "scheduled_print";
  }
  if (calendarEventStartInputEl) {
    calendarEventStartInputEl.value = toLocalDateTimeInputValue(startDate);
  }
  if (calendarEventEndInputEl) {
    calendarEventEndInputEl.value = toLocalDateTimeInputValue(endDate);
  }
  if (calendarEventFileInputEl) {
    calendarEventFileInputEl.value = event ? (event.relatedPrintFile || "") : "";
  }
  if (calendarEventMaterialInputEl) {
    calendarEventMaterialInputEl.value = event ? (event.material || "") : "";
  }
  if (calendarEventEstimatedHoursInputEl) {
    calendarEventEstimatedHoursInputEl.value = event && event.estimatedPrintTime != null ? String(event.estimatedPrintTime) : "";
  }
  if (calendarEventActualHoursInputEl) {
    calendarEventActualHoursInputEl.value = event && event.actualPrintTime != null ? String(event.actualPrintTime) : "";
  }
  if (calendarEventMaterialUsedInputEl) {
    calendarEventMaterialUsedInputEl.value = event && event.materialUsedGrams != null ? String(Math.round(event.materialUsedGrams)) : "";
  }
  if (calendarEventMachineInputEl) {
    calendarEventMachineInputEl.value = event ? (event.machineName || "M600-PRO-1") : "M600-PRO-1";
  }
  if (calendarEventNotesInputEl) {
    calendarEventNotesInputEl.value = event ? (event.notes || "") : "";
  }

  if (calendarEventDeleteEl) {
    calendarEventDeleteEl.hidden = !event;
  }
  if (calendarEventValidationEl) {
    calendarEventValidationEl.hidden = true;
    calendarEventValidationEl.textContent = "";
  }

  calendarEventModalEl.hidden = false;
  calendarEventModalEl.setAttribute("aria-hidden", "false");
}

function closeCalendarEventModal() {
  if (!calendarEventModalEl) {
    return;
  }

  calendarEventModalEl.hidden = true;
  calendarEventModalEl.setAttribute("aria-hidden", "true");
  editingCalendarEventId = null;
  if (calendarEventValidationEl) {
    calendarEventValidationEl.hidden = true;
    calendarEventValidationEl.textContent = "";
  }
}

function populateCalendarEventFormOptions() {
  if (calendarEventFileInputEl) {
    const previous = calendarEventFileInputEl.value;
    calendarEventFileInputEl.textContent = "";
    const emptyFileOption = document.createElement("option");
    emptyFileOption.value = "";
    emptyFileOption.textContent = "Not linked";
    calendarEventFileInputEl.appendChild(emptyFileOption);

    const names = Array.from(new Set(getCloudFileLibraryEntries().map((entry) => entry.name)))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    for (const name of names) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      calendarEventFileInputEl.appendChild(option);
    }

    if (previous && names.includes(previous)) {
      calendarEventFileInputEl.value = previous;
    }
  }

  if (calendarEventMaterialInputEl) {
    const previous = calendarEventMaterialInputEl.value;
    calendarEventMaterialInputEl.textContent = "";
    const emptyMaterialOption = document.createElement("option");
    emptyMaterialOption.value = "";
    emptyMaterialOption.textContent = "Not specified";
    calendarEventMaterialInputEl.appendChild(emptyMaterialOption);

    for (const material of MELTIO_MATERIAL_LIBRARY) {
      const option = document.createElement("option");
      option.value = material.label;
      option.textContent = material.label;
      calendarEventMaterialInputEl.appendChild(option);
    }

    if (previous) {
      calendarEventMaterialInputEl.value = previous;
    }
  }
}

function saveCalendarEventFromModal() {
  if (!calendarEventTitleInputEl || !calendarEventTypeInputEl || !calendarEventStartInputEl || !calendarEventEndInputEl) {
    return;
  }

  const title = String(calendarEventTitleInputEl.value || "").trim();
  const type = normalizeCalendarEventType(calendarEventTypeInputEl.value);
  const startTime = new Date(String(calendarEventStartInputEl.value || "").trim());
  const endTime = new Date(String(calendarEventEndInputEl.value || "").trim());

  if (!title || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime <= startTime) {
    if (calendarEventValidationEl) {
      calendarEventValidationEl.hidden = false;
      calendarEventValidationEl.textContent = "Please provide a title and valid start/end times.";
    }
    return;
  }

  const patch = {
    title,
    type,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    status: type === "completed_print" || type === "completed_maintenance" ? "completed" : "scheduled",
    relatedPrintFile: String(calendarEventFileInputEl?.value || "").trim(),
    material: String(calendarEventMaterialInputEl?.value || "").trim(),
    estimatedPrintTime: Number.isFinite(Number(calendarEventEstimatedHoursInputEl?.value))
      ? Number(calendarEventEstimatedHoursInputEl.value)
      : null,
    actualPrintTime: Number.isFinite(Number(calendarEventActualHoursInputEl?.value))
      ? Number(calendarEventActualHoursInputEl.value)
      : null,
    materialUsedGrams: Number.isFinite(Number(calendarEventMaterialUsedInputEl?.value))
      ? Number(calendarEventMaterialUsedInputEl.value)
      : null,
    machineName: String(calendarEventMachineInputEl?.value || "M600-PRO-1").trim() || "M600-PRO-1",
    notes: String(calendarEventNotesInputEl?.value || "").trim(),
    updatedAt: new Date().toISOString(),
  };

  if (editingCalendarEventId) {
    const index = calendarEvents.findIndex((event) => event.id === editingCalendarEventId);
    if (index >= 0) {
      calendarEvents[index] = {
        ...calendarEvents[index],
        ...patch,
      };
      selectedCalendarEventId = editingCalendarEventId;
    }
  } else {
    const created = createCalendarEvent(patch);
    calendarEvents.push(created);
    selectedCalendarEventId = created.id;
  }

  suggestMaintenanceEventsFromSchedule();
  closeCalendarEventModal();
  renderCalendarScreen();
}

function deleteCalendarEventFromModal() {
  if (!editingCalendarEventId) {
    return;
  }

  const index = calendarEvents.findIndex((event) => event.id === editingCalendarEventId);
  if (index >= 0) {
    calendarEvents.splice(index, 1);
  }
  if (selectedCalendarEventId === editingCalendarEventId) {
    selectedCalendarEventId = null;
  }
  closeCalendarEventModal();
  renderCalendarScreen();
}

function createCalendarEventChip(event) {
  const button = document.createElement("button");
  const typeMeta = CALENDAR_EVENT_TYPE_META[event.type] || CALENDAR_EVENT_TYPE_META.scheduled_print;
  button.type = "button";
  button.className = `calendar-event-chip ${typeMeta.className}`;
  button.textContent = `${event.title} (${formatCalendarTime(event.startTime)})`;
  button.setAttribute("draggable", "true");

  if (selectedCalendarEventId === event.id) {
    button.classList.add("is-selected");
  }

  button.addEventListener("click", () => {
    markUserActivity();
    selectedCalendarEventId = event.id;
    renderCalendarScreen();
  });

  button.addEventListener("dblclick", () => {
    markUserActivity();
    openCalendarEventModal(event.id);
  });

  button.addEventListener("dragstart", () => {
    activeCalendarDragEventId = event.id;
    activeCalendarDragStartDateIso = event.startTime;
  });

  button.addEventListener("dragend", () => {
    activeCalendarDragEventId = null;
    activeCalendarDragStartDateIso = null;
  });

  return button;
}

function renderCalendarMonthOrWeekView({ isWeek = false } = {}) {
  if (!calendarGridEl) {
    return;
  }

  const grid = document.createElement("div");
  grid.className = `calendar-grid-layout ${isWeek ? "week-view" : "month-view"}`;

  const anchor = new Date(calendarAnchorDate);
  const start = isWeek
    ? getCalendarWeekStart(anchor)
    : new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  if (!isWeek) {
    start.setDate(start.getDate() - start.getDay());
  }

  const today = new Date();
  const totalDays = isWeek ? 7 : 42;
  for (let offset = 0; offset < totalDays; offset += 1) {
    const dayDate = new Date(start);
    dayDate.setDate(start.getDate() + offset);

    const dayCell = document.createElement("div");
    dayCell.className = "calendar-day-cell";
    if (isSameCalendarDay(dayDate, today)) {
      dayCell.classList.add("is-today");
    }
    if (!isWeek && dayDate.getMonth() !== anchor.getMonth()) {
      dayCell.classList.add("is-outside-month");
    }

    dayCell.addEventListener("dblclick", () => {
      markUserActivity();
      openCalendarEventModal(null, dayDate);
    });

    dayCell.addEventListener("dragover", (domEvent) => {
      domEvent.preventDefault();
    });

    dayCell.addEventListener("drop", () => {
      if (!activeCalendarDragEventId || !activeCalendarDragStartDateIso) {
        return;
      }

      const draggedEvent = calendarEvents.find((entry) => entry.id === activeCalendarDragEventId);
      if (!draggedEvent) {
        return;
      }

      const originalStart = new Date(activeCalendarDragStartDateIso);
      const originalEnd = new Date(draggedEvent.endTime);
      const durationMs = Math.max(originalEnd.getTime() - originalStart.getTime(), 30 * 60 * 1000);
      const nextStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), originalStart.getHours(), originalStart.getMinutes(), 0, 0);
      const nextEnd = new Date(nextStart.getTime() + durationMs);

      draggedEvent.startTime = nextStart.toISOString();
      draggedEvent.endTime = nextEnd.toISOString();
      draggedEvent.updatedAt = new Date().toISOString();
      selectedCalendarEventId = draggedEvent.id;
      renderCalendarScreen();
    });

    const header = document.createElement("div");
    header.className = "calendar-day-header";
    header.innerHTML = `<span>${dayDate.toLocaleDateString([], { weekday: "short" })}</span><span>${dayDate.getDate()}</span>`;
    dayCell.appendChild(header);

    const dayEvents = getEventsForCalendarDay(dayDate);
    for (const event of dayEvents.slice(0, 4)) {
      dayCell.appendChild(createCalendarEventChip(event));
    }

    if (dayEvents.length > 4) {
      const overflow = document.createElement("p");
      overflow.className = "calendar-empty-state";
      overflow.textContent = `+${dayEvents.length - 4} more`;
      dayCell.appendChild(overflow);
    }

    grid.appendChild(dayCell);
  }

  calendarGridEl.appendChild(grid);
}

function renderCalendarDayView() {
  if (!calendarGridEl) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "calendar-grid-layout day-view";
  const events = getEventsForCalendarDay(new Date(calendarAnchorDate));
  if (!events.length) {
    wrapper.innerHTML = "<p class=\"calendar-empty-state\">No events for this day. Double-click to add one.</p>";
  } else {
    for (const event of events) {
      wrapper.appendChild(createCalendarEventChip(event));
    }
  }

  calendarGridEl.appendChild(wrapper);
}

function renderCalendarAgendaView() {
  if (!calendarGridEl) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "calendar-grid-layout agenda-view";
  const events = getCalendarEventsSorted();
  if (!events.length) {
    wrapper.innerHTML = "<p class=\"calendar-empty-state\">No events planned.</p>";
  } else {
    for (const event of events) {
      wrapper.appendChild(createCalendarEventChip(event));
    }
  }

  calendarGridEl.appendChild(wrapper);
}

function renderCalendarScreen() {
  if (!calendarScreenEl || !calendarGridEl) {
    return;
  }

  if (calendarRangeLabelEl) {
    calendarRangeLabelEl.textContent = buildCalendarRangeLabel();
  }

  const viewButtons = [calendarViewMonthEl, calendarViewWeekEl, calendarViewDayEl, calendarViewAgendaEl];
  for (const buttonEl of viewButtons) {
    if (!buttonEl) {
      continue;
    }
    const isActive = buttonEl.dataset.view === calendarCurrentView;
    buttonEl.setAttribute("aria-pressed", isActive ? "true" : "false");
  }

  clearCalendarGrid();
  if (calendarCurrentView === "month") {
    renderCalendarMonthOrWeekView({ isWeek: false });
  } else if (calendarCurrentView === "week") {
    renderCalendarMonthOrWeekView({ isWeek: true });
  } else if (calendarCurrentView === "day") {
    renderCalendarDayView();
  } else {
    renderCalendarAgendaView();
  }

  renderCalendarEventDetails();
}

function setCalendarScreenOpen(isOpen) {
  isCalendarScreenOpen = Boolean(isOpen);

  if (!calendarScreenEl) {
    return;
  }

  calendarScreenEl.hidden = !isCalendarScreenOpen;
  calendarScreenEl.setAttribute("aria-hidden", isCalendarScreenOpen ? "false" : "true");

  if (topbarCalendarToggleEl) {
    topbarCalendarToggleEl.setAttribute("aria-pressed", isCalendarScreenOpen ? "true" : "false");
    topbarCalendarToggleEl.classList.toggle("is-active", isCalendarScreenOpen);
  }

  if (isCalendarScreenOpen) {
    setNotificationCenterOpen(false);
    if (isControlsPanelOpen()) {
      setControlsPanelOpen(false);
    }
    if (isCloudModelMenuOpen()) {
      setCloudModelMenuOpen(false, { skipResetOnClose: true });
    }
    if (isMaterialsMenuOpen()) {
      setMaterialsMenuOpen(false, { skipBottomNavUpdate: true });
    }
    closeHotspotContextPanel();
    setTopbarSettingsMenuOpen(false);
    setNotificationHistoryScreenOpen(false);
    renderCalendarScreen();
  }
}



  // --- Toolbar navigation (moved from the god-file's calendar listeners) --
  function stepRange(direction) {
    if (calendarCurrentView === "month") {
      calendarAnchorDate.setMonth(calendarAnchorDate.getMonth() + direction);
    } else if (calendarCurrentView === "week") {
      calendarAnchorDate.setDate(calendarAnchorDate.getDate() + (direction * 7));
    } else {
      calendarAnchorDate.setDate(calendarAnchorDate.getDate() + direction);
    }
    renderCalendarScreen();
  }
  function goToToday() {
    calendarAnchorDate = new Date();
    renderCalendarScreen();
  }
  function setView(view) {
    calendarCurrentView = normalizeCalendarView(view);
    renderCalendarScreen();
  }

  return {
    setCalendarScreenOpen,
    renderCalendarScreen,
    seedCalendarEventsIfNeeded,
    suggestMaintenanceEventsFromSchedule,
    openCalendarEventModal,
    closeCalendarEventModal,
    saveCalendarEventFromModal,
    deleteCalendarEventFromModal,
    stepRange,
    goToToday,
    setView,
    get isScreenOpen() { return isCalendarScreenOpen; },
  };
}
