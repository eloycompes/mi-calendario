
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const $ = (id) => document.getElementById(id);

const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("PEGA_AQUI") &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes("PEGA_AQUI");

let supabase = null;
let user = null;
let events = [];
let selectedDate = dateKey(new Date());
let bulkSelectionActive = false;
let multiSelectMode = false;
let cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let weekCursor = new Date();

let viewMode = "year";
let authMode = "login";
let toastTimer;
const selectedDates = new Set();

const PRACTICE_TARGET = 500;
const DEFAULT_PRACTICE_HOURS = 6;

const typeNames = {
  practice: "Prácticas",
  work: "Trabajo",
  personal: "Personal",
  leave: "Libranza"
};

const monthNames = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

const weekdayNames = ["L", "M", "X", "J", "V", "S", "D"];

// --------------------------------------------------
// SELECCIÓN POR ARRASTRE
// --------------------------------------------------

let dragActive = false;
let dragMoved = false;
let dragStartDate = null;
let suppressCalendarClick = false;

function getCalendarCellFromPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  return element?.closest("#calendar .day-cell") || null;
}

function addDraggedDate(date) {
  if (!date || selectedDates.has(date)) return;

  selectedDates.add(date);

  const cell = document.querySelector(
    `#calendar .day-cell[data-date="${date}"]`
  );

  if (cell) {
    cell.classList.add("multi-selected");
  }
}

function startCalendarDrag(e) {
  const cell = e.target.closest("#calendar .day-cell");

  if (cell && !multiSelectMode) return;

  if (!cell || e.button !== 0) {
    // Los gestos de desplazamiento móvil no deben borrar la selección.
    if (window.matchMedia("(max-width: 720px)").matches) return;

    // Controles de navegación y acciones mantienen la selección para trabajar en varios meses.
    if (e.target.closest("#calendar, #bulk-toolbar, .calendar-actions, #prev-month, #next-month, #add-event-side, #add-note-button, #note-modal, #event-modal")) return;

    // Un clic fuera del calendario elimina la selección acumulada.
    {
      selectedDates.clear();
      selectedDate = null;
      bulkSelectionActive = false;
      updateBulkToolbar();
      renderCalendar();
      renderDayDetails();
    }
    return;
  }

  dragActive = true;
  dragMoved = false;
  dragStartDate = cell.dataset.date;
}

function moveCalendarDrag(e) {
  if (!dragActive || !(e.buttons & 1)) return;

  const cell = getCalendarCellFromPoint(e.clientX, e.clientY);
  if (!cell) return;

  const currentDate = cell.dataset.date;
  if (currentDate === dragStartDate && !dragMoved) return;

  if (!dragMoved) {
    dragMoved = true;
    addDraggedDate(dragStartDate);
  }

  addDraggedDate(currentDate);
}

function finishCalendarDrag() {
  if (!dragActive) return;

  dragActive = false;

  if (dragMoved) {
    suppressCalendarClick = true;
    bulkSelectionActive = true;
    updateBulkToolbar();

    // Repintar todas las casillas: elimina el resaltado individual anterior
    // y deja visibles únicamente los días incluidos en el arrastre.
    renderCalendar();

    setTimeout(() => {
      suppressCalendarClick = false;
    }, 0);
  } else {
    // El clic simple añadirá la fecha sin borrar las ya seleccionadas.
    updateBulkToolbar();
  }

  dragStartDate = null;
}

function cancelCalendarDrag() {
  dragActive = false;
  dragMoved = false;
  dragStartDate = null;
}

document.addEventListener("pointerdown", startCalendarDrag);
document.addEventListener("pointermove", moveCalendarDrag);
document.addEventListener("pointerup", finishCalendarDrag);
document.addEventListener("pointercancel", cancelCalendarDrag);

// Cualquier clic fuera de una casilla del calendario limpia TODA la selección.
// Se ejecuta en captura para que no dependa de los manejadores de cada componente.
document.addEventListener("click", (e) => {
  if (window.matchMedia("(max-width: 720px)").matches) {
    // El desplazamiento no genera un clic, pero un toque fuera sí limpia la selección.
    if (e.target.closest("#calendar, #bulk-toolbar, .calendar-actions, #prev-month, #next-month, #add-event-side, #add-note-button, #note-modal, #event-modal")) return;
  } else if (e.target.closest("#calendar, #bulk-toolbar, .calendar-actions, #prev-month, #next-month, #add-event-side, #add-note-button, #note-modal, #event-modal")) {
    return;
  }

  const hadSelection = selectedDate !== null || selectedDates.size > 0;
  if (!hadSelection) return;

  selectedDate = null;
  selectedDates.clear();
  bulkSelectionActive = false;
  updateBulkToolbar();
  renderCalendar();
  renderDayDetails();
}, true);

// Evitar que el navegador seleccione texto al arrastrar.
document.addEventListener("selectstart", (e) => {
  if (dragActive || dragMoved) {
    e.preventDefault();
  }
});

// --------------------------------------------------
// FECHAS Y UTILIDADES
// --------------------------------------------------

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function parseDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function prettyDate(
  key,
  options = { weekday: "long", day: "numeric", month: "long" }
) {
  return parseDate(key).toLocaleDateString("es-ES", options);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    $("toast").classList.remove("show");
  }, 2600);
}

function setConnection(online, text) {
  const el = $("connection-status");

  el.classList.toggle("online", !!online);
  el.innerHTML = `<i></i> ${text}`;
}

// --------------------------------------------------
// AUTENTICACIÓN
// --------------------------------------------------

function showAuth(message = "") {
  $("auth-view").classList.remove("hidden");
  $("app-view").classList.add("hidden");

  $("auth-message").textContent = message;

  setConnection(false, configured ? "Sin sesión" : "Configuración pendiente");
}

function showApp() {
  $("auth-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");

  $("account-email").textContent = user?.email || "";
  $("view-select").value = "year";
  viewMode = "year";

  $("today-label").textContent = prettyDate(
    dateKey(new Date()),
    { weekday: "long", day: "numeric", month: "long" }
  ).toUpperCase();

  setConnection(true, "Sincronizado");
  render();
}

function setAuthMode(mode) {
  authMode = mode;

  document.querySelectorAll(".auth-tab").forEach(b => {
    b.classList.toggle("active", b.dataset.authTab === mode);
  });

  $("auth-title").textContent =
    mode === "login"
      ? "Qué bien tenerte de vuelta"
      : "Crea tu espacio personal";

  $("auth-subtitle").textContent =
    mode === "login"
      ? "Accede a tu calendario personal."
      : "Regístrate para guardar tus datos en la nube.";

  $("auth-submit").innerHTML =
    mode === "login"
      ? 'Entrar <span>→</span>'
      : 'Crear cuenta <span>→</span>';

  $("auth-password").autocomplete =
    mode === "login" ? "current-password" : "new-password";

  $("auth-message").textContent = "";
}

// --------------------------------------------------
// SUPABASE Y DATOS
// --------------------------------------------------

async function loadEvents() {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .order("event_date");

  if (error) throw error;

  events = data || [];
}

function eventHours(e) {
  if (e.hours !== null && e.hours !== undefined && e.hours !== "") {
    return Number(e.hours) || 0;
  }

  if (e.start_time && e.end_time) {
    const [sh, sm] = e.start_time.split(":").map(Number);
    const [eh, em] = e.end_time.split(":").map(Number);

    let mins = (eh * 60 + em) - (sh * 60 + sm);

    if (mins < 0) mins += 1440;

    return Math.round(mins / 60 * 100) / 100;
  }

  return 0;
}



// --------------------------------------------------
// CONTADOR DE PRÁCTICAS
// --------------------------------------------------

function renderStats() {
  const practice = events
    .filter(e => e.type === "practice")
    .reduce((total, e) => total + eventHours(e), 0);

  const pct = Math.min(100, practice / PRACTICE_TARGET * 100);

  $("practice-hours").textContent =
    practice.toLocaleString("es-ES", { maximumFractionDigits: 2 });

  $("practice-progress").style.width = pct + "%";
  $("practice-percent").textContent = Math.round(pct) + "% completado";

  $("practice-remaining").textContent =
    Math.max(0, PRACTICE_TARGET - practice)
      .toLocaleString("es-ES", { maximumFractionDigits: 2 }) + " h restantes";
}

// --------------------------------------------------
// CALENDARIO MENSUAL, SEMANAL Y ANUAL
// --------------------------------------------------

function renderCalendar() {
  const root = $("calendar");
  $("app-view").classList.toggle("year-view", viewMode === "year");
  root.innerHTML = "";
  root.classList.remove("week-grid", "year-grid");
  root.style.userSelect = "none";
  root.style.webkitUserSelect = "none";
  root.style.touchAction = window.matchMedia("(max-width: 720px)").matches ? "pan-y" : "none";

  if (viewMode === "year") {
    renderYearCalendar(root);
    return;
  }

  root.classList.toggle("week-grid", viewMode === "week");

  weekdayNames.forEach(day => {
    const el = document.createElement("div");
    el.className = "weekday";
    el.textContent = day;
    root.append(el);
  });

  let start;
  if (viewMode === "month") {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    start = new Date(first);
    start.setDate(first.getDate() - (first.getDay() + 6) % 7);
  } else {
    const selected = parseDate(selectedDate || dateKey(new Date()));
    start = new Date(selected);
    start.setDate(selected.getDate() - (selected.getDay() + 6) % 7);
  }

  const count = viewMode === "month" ? 42 : 7;
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    root.append(createDayCell(d, dateKey(d), viewMode === "month"));
  }

  $("month-title").textContent =
    viewMode === "month"
      ? `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`
      : `Semana del ${prettyDate(dateKey(start), { day: "numeric", month: "short" })}`;

  const monthKey = dateKey(cursor).slice(0, 7);
  $("month-count").textContent =
    `${events.filter(e => e.event_date.startsWith(monthKey)).length} registros este mes`;
}

function createDayCell(date, key, showOtherMonth = true, mini = false) {
  const cell = document.createElement("div");
  cell.className = mini ? "mini-day day-cell" : "day-cell";
  cell.dataset.date = key;

  if (showOtherMonth && date.getMonth() !== cursor.getMonth()) {
    cell.classList.add("other-month");
  }
  if (key === dateKey(new Date())) cell.classList.add("today");
  if (key === selectedDate && selectedDates.size === 0) cell.classList.add("selected");
  if (selectedDates.has(key)) cell.classList.add("multi-selected");

  const dayEvents = events.filter(e => e.event_date === key);
  const top = document.createElement("div");
  top.className = "day-top";

  const num = document.createElement("span");
  num.className = "day-number";
  num.textContent = date.getDate();
  top.append(num);

  if (dayEvents.some(e => e.highlighted)) {
    const star = document.createElement("span");
    star.className = "day-highlight";
    star.textContent = "★";
    top.append(star);
  }
  cell.append(top);

  if (mini) {
    // Un día representa una única jornada: coloreamos toda la casilla.
    if (dayEvents.length) {
      cell.classList.add(`event-${dayEvents[0].type}`);
      cell.title = dayEvents[0].title || typeNames[dayEvents[0].type];
    }
  } else {
    dayEvents.slice(0, 2).forEach(e => {
      const pill = document.createElement("span");
      pill.className = `event-pill ${e.type}`;
      pill.textContent = e.title || typeNames[e.type];
      cell.append(pill);
    });

    if (dayEvents.length > 2) {
      const more = document.createElement("span");
      more.className = "event-pill more";
      more.textContent = `+${dayEvents.length - 2} más`;
      cell.append(more);
    }
  }

  cell.addEventListener("click", () => {
    if (suppressCalendarClick) {
      suppressCalendarClick = false;
      return;
    }

    selectedDate = key;
    if (!multiSelectMode) selectedDates.clear();
    selectedDates.add(key);
    bulkSelectionActive = true;
    weekCursor = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    cursor = new Date(date.getFullYear(), date.getMonth(), 1);
    render();
  });

  return cell;
}

function renderYearCalendar(root) {
  root.classList.add("year-grid");
  const year = cursor.getFullYear();

  for (let month = 0; month < 12; month++) {
    const card = document.createElement("section");
    card.className = "mini-month";
    card.dataset.yearMonth = `${year}-${String(month + 1).padStart(2, "0")}`;

    const heading = document.createElement("button");
    heading.type = "button";
    heading.className = "mini-month-title";
    heading.textContent = monthNames[month];
    heading.addEventListener("click", () => {
      cursor = new Date(year, month, 1);
      selectedDate = dateKey(new Date(year, month, 1));
      viewMode = "month";
      $("view-select").value = "month";
      render();
    });
    card.append(heading);

    const weekdays = document.createElement("div");
    weekdays.className = "mini-weekdays";
    weekdayNames.forEach(day => {
      const label = document.createElement("span");
      label.textContent = day;
      weekdays.append(label);
    });
    card.append(weekdays);

    const days = document.createElement("div");
    days.className = "mini-days";

    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((offset + totalDays) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      const dayNumber = i - offset + 1;

      if (dayNumber < 1 || dayNumber > totalDays) {
        const blank = document.createElement("span");
        blank.className = "mini-day blank";
        days.append(blank);
      } else {
        const date = new Date(year, month, dayNumber);
        days.append(createDayCell(date, dateKey(date), false, true));
      }
    }

    card.append(days);
    root.append(card);
  }

  $("month-title").textContent = String(year);
  const count = events.filter(e => e.event_date.startsWith(String(year))).length;
  $("month-count").textContent = `${count} registros este año`;
}

// --------------------------------------------------
// DETALLES DEL DÍA
// --------------------------------------------------

function renderDayDetails() {
  const root = $("day-details");
  root.innerHTML = "";

  if (!selectedDate) {
    $("selected-date-title").textContent = "Selecciona un día";
    root.innerHTML = `
      <div class="empty-state">
        <div class="empty-illustration">✳</div>
        <strong>Tu día, a tu manera</strong>
        <p>Selecciona una fecha del calendario para consultar o añadir una jornada, notas y recordatorios.</p>
      </div>
    `;
    return;
  }

  $("selected-date-title").textContent =
    prettyDate(selectedDate, { weekday: "short", day: "numeric", month: "long" });

  const dayEvents = events.filter(e => e.event_date === selectedDate);

  if (!dayEvents.length) {
    root.innerHTML = `
      <div class="empty-state">
        <div class="empty-illustration">✳</div>
        <strong>Día sin jornadas</strong>
        <p>Aún no has añadido nada para esta fecha. Puedes registrar prácticas, trabajo o una nota personal.</p>
      </div>
    `;

    return;
  }

  dayEvents.forEach(e => {
    const div = document.createElement("article");

    div.className = "detail-item";

    const hours = eventHours(e);

    div.innerHTML = `
      <div class="detail-top">
        <span class="detail-type ${e.type}">${typeNames[e.type]}</span>
        <span class="detail-actions">
          <button data-edit="${e.id}" title="Editar">Editar</button>
          <button data-delete="${e.id}" title="Eliminar">Eliminar</button>
        </span>
      </div>
      ${e.title ? `<div class="detail-title">${escapeHTML(e.title)}</div>` : ""}
      <div class="detail-meta">
        ${e.start_time && e.end_time
          ? `<span>◷ ${escapeHTML(e.start_time)} – ${escapeHTML(e.end_time)}</span>`
          : ""}
        ${hours ? `<span>◌ ${hours.toLocaleString("es-ES")} h</span>` : ""}
      </div>
      ${e.notes ? `<p class="detail-notes">${escapeHTML(e.notes)}</p>` : ""}
      ${e.highlighted ? '<div class="highlight-label">★ Día destacado</div>' : ""}
    `;

    root.append(div);
  });

  root.querySelectorAll("[data-edit]").forEach(b => {
    b.addEventListener("click", () => {
      openModal(events.find(e => e.id === b.dataset.edit));
    });
  });

  root.querySelectorAll("[data-delete]").forEach(b => {
    b.addEventListener("click", () => {
      deleteEvent(b.dataset.delete);
    });
  });
}

function render() {
  updateBulkToolbar();
  renderStats();
  renderCalendar();
  renderDayDetails();
}

function openNoteModal() {
  const noteDate = selectedDate || (selectedDates.size === 1 ? [...selectedDates][0] : null);
  if (!noteDate) {
    showToast(selectedDates.size > 1
      ? "Selecciona un solo día para añadir una nota"
      : "Selecciona un día para añadir una nota");
    return;
  }

  const dayEvent = events.find(event => event.event_date === noteDate && event.notes)
    || events.find(event => event.event_date === noteDate);

  $("note-event-id").value = dayEvent?.id || "";
  $("note-date-value").value = noteDate;
  $("note-date-label").textContent = prettyDate(noteDate, {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  $("note-text").value = dayEvent?.notes || "";
  $("note-error").textContent = "";
  $("note-modal").classList.remove("hidden");
  $("note-text").focus();
}

function closeNoteModal() {
  $("note-modal").classList.add("hidden");
}

async function saveNote(e) {
  e.preventDefault();
  $("note-error").textContent = "";

  const notes = $("note-text").value.trim();
  const noteDate = $("note-date-value").value;
  if (!notes) {
    $("note-error").textContent = "Escribe una nota antes de guardarla.";
    return;
  }
  if (!noteDate) {
    $("note-error").textContent = "Selecciona un día para guardar esta nota.";
    return;
  }

  const eventId = $("note-event-id").value;
  const result = eventId
    ? await supabase.from("calendar_events").update({ notes }).eq("id", eventId).eq("user_id", user.id).select().single()
    : await supabase.from("calendar_events").insert({
        user_id: user.id,
        event_date: noteDate,
        type: "personal",
        title: "Nota del día",
        start_time: null,
        end_time: null,
        hours: null,
        highlighted: false,
        notes
      }).select().single();

  if (result.error) {
    $("note-error").textContent = result.error.message;
    return;
  }

  selectedDate = noteDate;
  closeNoteModal();
  await loadEvents();
  render();
  showToast("Nota guardada");
}

// --------------------------------------------------
// MODAL Y REGISTRO DE JORNADAS
// --------------------------------------------------

function openModal(event = null, presetType = null) {
  $("event-form").reset();
  $("event-error").textContent = "";

  $("event-id").value = event?.id || "";
  $("event-date").value = event?.event_date || selectedDate;

  const initialType = event?.type || presetType || "practice";

  document.querySelector(
    `input[name="event-type"][value="${initialType}"]`
  ).checked = true;

  $("event-title").value = event?.title || "";
  $("event-start").value = event?.start_time || "";
  $("event-end").value = event?.end_time || "";

  $("event-hours").value =
    event?.hours ?? (initialType === "practice" ? DEFAULT_PRACTICE_HOURS : "");

  updateTypeFields();

  $("event-highlight").checked = !!event?.highlighted;
  $("event-notes").value = event?.notes || "";

  $("modal-title").textContent = event
    ? "Editar registro"
    : "Añadir al calendario";

  $("delete-event").classList.toggle("hidden", !event);
  $("event-modal").classList.remove("hidden");
}

function closeModal() {
  $("event-modal").classList.add("hidden");
}

function updateTypeFields() {
  const type =
    document.querySelector('input[name="event-type"]:checked')?.value || "practice";

  const isLeave = type === "leave";

  $("event-start").disabled = isLeave;
  $("event-end").disabled = isLeave;
  $("event-hours").disabled = isLeave;

  if (isLeave) {
    $("event-start").value = "";
    $("event-end").value = "";
    $("event-hours").value = "";
  } else if (type === "practice" && !$("event-hours").value) {
    $("event-hours").value = DEFAULT_PRACTICE_HOURS;
  }

  $("leave-reason-wrap").querySelector("label").innerHTML =
    isLeave
      ? 'Motivo de libranza <span class="optional">opcional</span>'
      : 'Título <span class="optional">opcional</span>';

  $("event-title").placeholder = isLeave
    ? "Ej. Festivo, vacaciones, asuntos propios…"
    : "Ej. Jornada en la empresa";
}

async function saveEvent(e) {
  e.preventDefault();

  $("event-error").textContent = "";

  const id = $("event-id").value;

  const type =
    document.querySelector('input[name="event-type"]:checked').value;

  const hoursRaw = $("event-hours").value;

  const payload = {
    user_id: user.id,
    event_date: $("event-date").value,
    type,
    title: $("event-title").value.trim(),
    start_time: type === "leave" ? null : ($("event-start").value || null),
    end_time: type === "leave" ? null : ($("event-end").value || null),
    hours: type === "leave"
      ? null
      : (hoursRaw === "" ? null : Number(hoursRaw)),
    highlighted: $("event-highlight").checked,
    notes: $("event-notes").value.trim()
  };

  if (!payload.event_date) {
    $("event-error").textContent = "Selecciona una fecha.";
    return;
  }

  if (payload.hours !== null && (payload.hours < 0 || payload.hours > 24)) {
    $("event-error").textContent = "Las horas deben estar entre 0 y 24.";
    return;
  }

  if (type === "practice" && payload.hours === null) {
    payload.hours = DEFAULT_PRACTICE_HOURS;
  }

  if (payload.start_time && payload.end_time && !payload.hours) {
    const [a, b] = [payload.start_time, payload.end_time].map(t =>
      t.split(":").reduce((h, m) => h * 60 + Number(m), 0)
    );

    payload.hours =
      Math.round(((b - a + (b < a ? 1440 : 0)) / 60) * 100) / 100;
  }

  const button = $("event-form").querySelector('button[type="submit"]');

  button.disabled = true;
  button.textContent = "Guardando…";

  const result = id
    ? await supabase.from("calendar_events").update(payload).eq("id", id).select().single()
    : await supabase.from("calendar_events").insert(payload).select().single();

  button.disabled = false;
  button.textContent = "Guardar jornada";

  if (result.error) {
    $("event-error").textContent = result.error.message;
    return;
  }

  selectedDate = payload.event_date;

  await loadEvents();

  closeModal();
  render();

  showToast(id ? "Cambios guardados" : "Jornada añadida");
}

async function deleteEvent(id) {
  if (!confirm("¿Quieres eliminar este registro?")) return;

  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", id);

  if (error) {
    showToast("No se ha podido eliminar: " + error.message);
    return;
  }

  await loadEvents();

  closeModal();
  render();

  showToast("Registro eliminado");
}


async function deleteSelectedDays() {
  const dates = [...selectedDates].sort();

  if (!dates.length) {
    showToast("Selecciona uno o varios días en el calendario");
    return;
  }

  const matchingEvents = events.filter(event => dates.includes(event.event_date));
  if (!matchingEvents.length) {
    showToast("Los días seleccionados no tienen jornadas que eliminar");
    return;
  }

  const dateLabel = dates.length === 1 ? "el día seleccionado" : "los días seleccionados";
  if (!confirm(`Se eliminarán ${matchingEvents.length} jornadas de ${dateLabel}. Esta acción no se puede deshacer. ¿Continuar?`)) {
    return;
  }

  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .in("event_date", dates)
    .eq("user_id", user.id);

  if (error) {
    showToast("No se pudieron eliminar las jornadas: " + error.message);
    return;
  }

  selectedDate = dates[0];
  updateBulkToolbar();
  await loadEvents();
  render();
  showToast(`${matchingEvents.length} jornadas eliminadas`);
}

// --------------------------------------------------
// SELECCIÓN MÚLTIPLE Y ACCIONES EN BLOQUE
// --------------------------------------------------

function updateBulkToolbar() {
  $("selected-count").textContent = selectedDates.size;
  $("app-view").classList.toggle("mobile-actions-active", bulkSelectionActive);
  const toggle = $("multi-select-toggle");
  toggle.classList.toggle("active", multiSelectMode);
  toggle.setAttribute("aria-pressed", String(multiSelectMode));
  toggle.title = multiSelectMode ? "Desactivar selección múltiple" : "Activar selección múltiple";
}

async function applyBulk(type) {
  const dates = [...selectedDates].sort();

  if (!dates.length) {
    showToast("Selecciona uno o varios días en el calendario");
    return;
  }

  const existing = new Set(events.map(e => e.event_date));

  const conflicts = dates.filter(d => existing.has(d));
  const fresh = dates.filter(d => !existing.has(d));

  if (!fresh.length) {
    showToast("Todos los días seleccionados ya tienen registros; no se ha modificado nada");
    return;
  }

  const label = typeNames[type].toLowerCase();

  if (!confirm(
    `Se añadirán ${fresh.length} días como ${label}. ${
      conflicts.length
        ? `${conflicts.length} días con registros existentes se conservarán sin cambios.`
        : ""
    } ¿Continuar?`
  )) {
    return;
  }

  const payload = fresh.map(event_date => ({
    user_id: user.id,
    event_date,
    type,
    title: type === "leave" ? "Libranza" : "",
    start_time: null,
    end_time: null,
    hours: type === "practice" ? DEFAULT_PRACTICE_HOURS : null,
    highlighted: false,
    notes: ""
  }));

  const { error } = await supabase
    .from("calendar_events")
    .insert(payload);

  if (error) {
    showToast("No se pudieron guardar los días: " + error.message);
    return;
  }

  selectedDate = fresh[0];

  updateBulkToolbar();

  await loadEvents();
  render();

  showToast(
    `${fresh.length} días añadidos como ${label}${
      conflicts.length ? `; ${conflicts.length} conservados` : ""
    }`
  );
}

// --------------------------------------------------
// EXPORTACIÓN
// --------------------------------------------------

async function exportBackup() {
  const data = {
    exported_at: new Date().toISOString(),
    calendar_events: events
  };

  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;
  a.download = "mi-calendario-copia.json";
  a.click();

  URL.revokeObjectURL(url);

  showToast("Copia de seguridad descargada");
}

// --------------------------------------------------
// ACTUALIZACIÓN DE DATOS
// --------------------------------------------------

async function refresh() {
  try {
    await loadEvents();

    setConnection(true, "Sincronizado");
    render();
  } catch (err) {
    setConnection(false, "Error de conexión");
    showToast("No se han podido cargar los datos: " + err.message);
  }
}

// --------------------------------------------------
// EVENTOS DE LA INTERFAZ
// --------------------------------------------------

$("auth-form").addEventListener("submit", async e => {
  e.preventDefault();

  $("auth-message").textContent = "";

  if (!configured) {
    $("auth-message").textContent =
      "Primero hay que conectar Supabase. Sigue las instrucciones del archivo LEEME.";
    return;
  }

  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;

  $("auth-submit").disabled = true;

  const result = authMode === "login"
    ? await supabase.auth.signInWithPassword({ email, password })
    : await supabase.auth.signUp({ email, password });

  $("auth-submit").disabled = false;

  if (result.error) {
    $("auth-message").textContent = result.error.message;
    return;
  }

  if (authMode === "signup" && !result.data.session) {
    $("auth-message").textContent =
      "Cuenta creada. Revisa tu correo para confirmar el registro y después inicia sesión.";
    return;
  }

  user = result.data.user;

  await refresh();
  showApp();
});

document.querySelectorAll("[data-auth-tab]").forEach(b => {
  b.addEventListener("click", () => setAuthMode(b.dataset.authTab));
});


$("add-event-side").addEventListener("click", () => openModal());
$("add-note-button").addEventListener("click", openNoteModal);
$("close-note-modal").addEventListener("click", closeNoteModal);
$("cancel-note-modal").addEventListener("click", closeNoteModal);
$("note-form").addEventListener("submit", saveNote);
$("note-modal").addEventListener("click", e => {
  if (e.target === $("note-modal")) closeNoteModal();
});

$("close-modal").addEventListener("click", closeModal);
$("cancel-modal").addEventListener("click", closeModal);

$("event-modal").addEventListener("click", e => {
  if (e.target === $("event-modal")) closeModal();
});

$("event-form").addEventListener("submit", saveEvent);

document.querySelectorAll('input[name="event-type"]').forEach(r => {
  r.addEventListener("change", updateTypeFields);
});

$("delete-event").addEventListener("click", () => {
  deleteEvent($("event-id").value);
});

$("delete-selected-days").addEventListener("click", deleteSelectedDays);

$("select-weekdays").addEventListener("click", () => {
  multiSelectMode = true;
  bulkSelectionActive = true;

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const last = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= last; day++) {
    const d = new Date(year, month, day);

    if (d.getDay() !== 0 && d.getDay() !== 6) {
      selectedDates.add(dateKey(d));
    }
  }

  updateBulkToolbar();
  renderCalendar();
});

document.querySelectorAll("[data-bulk-type]").forEach(b => {
  b.addEventListener("click", () => applyBulk(b.dataset.bulkType));
});

$("prev-month").addEventListener("click", () => {
  if (viewMode === "year") {
    cursor = new Date(cursor.getFullYear() - 1, 0, 1);
  } else if (viewMode === "month") {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  } else {
    const d = new Date(weekCursor);
    d.setDate(d.getDate() - 7);
    weekCursor = new Date(d);
    selectedDate = dateKey(d);
    cursor = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  render();
});

$("next-month").addEventListener("click", () => {
  if (viewMode === "year") {
    cursor = new Date(cursor.getFullYear() + 1, 0, 1);
  } else if (viewMode === "month") {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  } else {
    const d = new Date(weekCursor);
    d.setDate(d.getDate() + 7);
    weekCursor = new Date(d);
    selectedDate = dateKey(d);
    cursor = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  render();
});



$("today-button").addEventListener("click", () => {
  const now = new Date();

  cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  selectedDate = dateKey(now);
  if (!multiSelectMode) selectedDates.clear();
  selectedDates.add(selectedDate);
  weekCursor = new Date(now);
  bulkSelectionActive = true;

  render();
  if (viewMode === "year" && window.matchMedia("(max-width: 720px)").matches) {
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    document.querySelector(`#calendar .mini-month[data-year-month="${monthKey}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

$("multi-select-toggle").addEventListener("click", () => {
  multiSelectMode = !multiSelectMode;

  if (!multiSelectMode && selectedDates.size > 1) {
    selectedDates.clear();
    if (selectedDate) selectedDates.add(selectedDate);
  }

  updateBulkToolbar();
  renderCalendar();
});

$("view-select").addEventListener("change", e => {
  viewMode = e.target.value;
  if (viewMode === "year") {
    cursor = new Date(cursor.getFullYear(), 0, 1);
  } else if (viewMode === "week") {
    if (selectedDate) weekCursor = parseDate(selectedDate);
    else {
      weekCursor = new Date();
      selectedDate = dateKey(weekCursor);
    }
  }
  renderCalendar();
});

$("export-button").addEventListener("click", exportBackup);

$("account-button").addEventListener("click", () => {
  $("account-menu").classList.toggle("hidden");
});

$("signout-button").addEventListener("click", async () => {
  await supabase.auth.signOut();

  user = null;
  events = [];

  $("account-menu").classList.add("hidden");

  showAuth();
});

document.addEventListener("click", e => {
  if (
    !e.target.closest(".topbar-right") &&
    !e.target.closest("#account-menu")
  ) {
    $("account-menu").classList.add("hidden");
  }
});

// --------------------------------------------------
// INICIO DE LA APLICACIÓN
// --------------------------------------------------

if (!configured) {
  showAuth(
    "La aplicación está lista, pero falta conectar tu proyecto de Supabase. Consulta LEEME."
  );
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      user = session.user;

      try {
        await refresh();
        showApp();
      } catch (err) {
        showAuth(err.message);
      }
    } else {
      user = null;
      events = [];

      showAuth();
    }
  });

  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    user = session.user;

    await refresh();
    showApp();
  } else {
    showAuth();
  }
}
