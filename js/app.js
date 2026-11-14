
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const $ = (id) => document.getElementById(id);
const configured = SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("PEGA_AQUI") &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes("PEGA_AQUI");

let supabase = null;
let user = null;
let events = [];
let selectedDate = dateKey(new Date());
let cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let viewMode = "month";
let authMode = "login";
let toastTimer;
let selectionMode = false;
let rangeAnchor = null;
let copiedDayRecords = [];

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
  "enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre"
];

const weekdayNames = ["L","M","X","J","V","S","D"];

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function parseDate(key) {
  const [y,m,d] = key.split("-").map(Number);
  return new Date(y,m-1,d);
}

function prettyDate(key, options={weekday:"long",day:"numeric",month:"long"}) {
  return parseDate(key).toLocaleDateString("es-ES", options);
}

function escapeHTML(value="") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>$("toast").classList.remove("show"),2600);
}

function setConnection(online,text) {
  const el=$("connection-status");
  el.classList.toggle("online",!!online);
  el.innerHTML=`<i></i> ${text}`;
}

function showAuth(message="") {
  $("auth-view").classList.remove("hidden");
  $("app-view").classList.add("hidden");
  $("auth-message").textContent=message;
  setConnection(false,configured?"Sin sesión":"Configuración pendiente");
}

function showApp() {
  $("auth-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  $("account-email").textContent=user?.email || "";
  $("today-label").textContent=prettyDate(
    dateKey(new Date()),
    {weekday:"long",day:"numeric",month:"long"}
  ).toUpperCase();
  setConnection(true,"Sincronizado");
  render();
}

function setAuthMode(mode) {
  authMode=mode;
  document.querySelectorAll(".auth-tab").forEach(b =>
    b.classList.toggle("active",b.dataset.authTab===mode)
  );
  $("auth-title").textContent=mode==="login"
    ?"Qué bien tenerte de vuelta":"Crea tu espacio personal";
  $("auth-subtitle").textContent=mode==="login"
    ?"Accede a tu calendario personal."
    :"Regístrate para guardar tus datos en la nube.";
  $("auth-submit").innerHTML=mode==="login"
    ?'Entrar <span>→</span>':'Crear cuenta <span>→</span>';
  $("auth-password").autocomplete=mode==="login"
    ?"current-password":"new-password";
  $("auth-message").textContent="";
}

async function loadEvents() {
  const {data,error}=await supabase
    .from("calendar_events")
    .select("*")
    .order("event_date");

  if(error) throw error;
  events=data||[];
}

function eventHours(e) {
  if(e.hours!==null && e.hours!==undefined && e.hours!=="")
    return Number(e.hours)||0;

  if(e.start_time && e.end_time) {
    const [sh,sm]=e.start_time.split(":").map(Number);
    const [eh,em]=e.end_time.split(":").map(Number);
    let mins=(eh*60+em)-(sh*60+sm);
    if(mins<0) mins+=1440;
    return Math.round(mins/60*100)/100;
  }
  return 0;
}

// PREVISIÓN DE FINALIZACIÓN

function estimateFinishDate(practiceTotal) {
  let remaining=Math.max(0,PRACTICE_TARGET-practiceTotal);

  if(remaining<=0)
    return {date:null,detail:"Objetivo completado"};

  const byDate=new Map();

  events.forEach(e=>{
    if(!byDate.has(e.event_date))
      byDate.set(e.event_date,[]);
    byDate.get(e.event_date).push(e);
  });

  const cursorDate=new Date();
  cursorDate.setHours(0,0,0,0);
  cursorDate.setDate(cursorDate.getDate()+1);

  let days=0,guard=0;

  while(remaining>0 && guard<2500) {
    const key=dateKey(cursorDate);
    const dow=cursorDate.getDay();
    const dayEvents=byDate.get(key)||[];

    if(dow!==0 && dow!==6 && dayEvents.length===0) {
      remaining-=DEFAULT_PRACTICE_HOURS;
      days++;
    }

    cursorDate.setDate(cursorDate.getDate()+1);
    guard++;
  }

  cursorDate.setDate(cursorDate.getDate()-1);

  return {
    date:dateKey(cursorDate),
    detail:`Previsión con ${DEFAULT_PRACTICE_HOURS} h por laborable · ${days} días estimados`
  };
}

function renderStats() {
  const practice=events
    .filter(e=>e.type==="practice")
    .reduce((s,e)=>s+eventHours(e),0);

  const work=events
    .filter(e=>e.type==="work")
    .reduce((s,e)=>s+eventHours(e),0);

  const days=new Set(events.map(e=>e.event_date));
  const personal=events.filter(e=>e.type==="personal").length;
  const leaves=events.filter(e=>e.type==="leave").length;

  const pct=Math.min(100,practice/PRACTICE_TARGET*100);

  $("practice-hours").textContent=
    practice.toLocaleString("es-ES",{maximumFractionDigits:2});

  $("practice-progress").style.width=pct+"%";
  $("practice-percent").textContent=Math.round(pct)+"% completado";

  $("practice-remaining").textContent=
    Math.max(0,PRACTICE_TARGET-practice)
      .toLocaleString("es-ES",{maximumFractionDigits:2})+" h restantes";

  $("work-hours").textContent=
    work.toLocaleString("es-ES",{maximumFractionDigits:2});

  $("total-days").textContent=days.size;
  $("personal-days").textContent=
    `${personal} personales · ${leaves} libranzas`;

  const estimate=estimateFinishDate(practice);

  $("finish-date").textContent=estimate.date
    ?prettyDate(estimate.date,{day:"numeric",month:"long",year:"numeric"})
    :"¡Objetivo completado!";

  $("finish-detail").textContent=estimate.detail;
}

// CALENDARIO

function renderCalendar() {
  const root=$("calendar");
  root.innerHTML="";
  root.classList.toggle("week-grid",viewMode==="week");

  weekdayNames.forEach(d=>{
    const el=document.createElement("div");
    el.className="weekday";
    el.textContent=d;
    root.append(el);
  });

  let start;

  if(viewMode==="month") {
    const first=new Date(cursor.getFullYear(),cursor.getMonth(),1);
    start=new Date(first);
    start.setDate(first.getDate()-(first.getDay()+6)%7);
  } else {
    const selected=parseDate(selectedDate);
    start=new Date(selected);
    start.setDate(selected.getDate()-(selected.getDay()+6)%7);
  }

  const count=viewMode==="month"?42:7;

  for(let i=0;i<count;i++) {
    const d=new Date(start);
    d.setDate(start.getDate()+i);
    const key=dateKey(d);

    const cell=document.createElement("div");
    cell.className="day-cell";

    if(d.getMonth()!==cursor.getMonth() && viewMode==="month")
      cell.classList.add("other-month");

    if(key===dateKey(new Date()))
      cell.classList.add("today");

    if(key===selectedDate)
      cell.classList.add("selected");

    if(selectedDates.has(key))
      cell.classList.add("multi-selected");

    const dayEvents=events.filter(e=>e.event_date===key);

    const top=document.createElement("div");
    top.className="day-top";

    const num=document.createElement("span");
    num.className="day-number";
    num.textContent=d.getDate();
    top.append(num);

    if(dayEvents.some(e=>e.highlighted)) {
      const star=document.createElement("span");
      star.className="day-highlight";
      star.textContent="★";
      top.append(star);
    }

    cell.append(top);

    dayEvents.slice(0,2).forEach(e=>{
      const pill=document.createElement("span");
      pill.className=`event-pill ${e.type}`;
      pill.textContent=e.title||typeNames[e.type];
      cell.append(pill);
    });

    if(dayEvents.length>2) {
      const more=document.createElement("span");
      more.className="event-pill more";
      more.textContent=`+${dayEvents.length-2} más`;
      cell.append(more);
    }

    // SELECCIÓN TIPO EXCEL

    cell.addEventListener("click",ev=>{
      const ctrl=ev.ctrlKey||ev.metaKey;
      const shift=ev.shiftKey;

      if(selectionMode||ctrl||shift) {
        selectionMode=true;

        if(shift && rangeAnchor) {
          selectedDates.clear();

          const startDate=parseDate(rangeAnchor);
          const endDate=parseDate(key);
          const direction=startDate<=endDate?1:-1;
          const current=new Date(startDate);

          while(direction===1?current<=endDate:current>=endDate) {
            selectedDates.add(dateKey(current));
            current.setDate(current.getDate()+direction);
          }
        } else {
          if(selectedDates.has(key))
            selectedDates.delete(key);
          else
            selectedDates.add(key);

          rangeAnchor=key;
        }

        updateBulkToolbar();
        renderCalendar();
        return;
      }

      selectedDate=key;
      rangeAnchor=key;

      if(viewMode==="week")
        cursor=new Date(d.getFullYear(),d.getMonth(),1);

      render();
    });

    root.append(cell);
  }

  $("month-title").textContent=viewMode==="month"
    ?`${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`
    :`Semana del ${prettyDate(dateKey(start),{day:"numeric",month:"short"})}`;

  $("month-count").textContent=
    `${events.filter(e=>e.event_date.slice(0,7)===dateKey(cursor).slice(0,7)).length} registros este mes`;
}

// DETALLE DEL DÍA

function renderDayDetails() {
  $("selected-date-title").textContent=
    prettyDate(selectedDate,{weekday:"short",day:"numeric",month:"long"});

  const root=$("day-details");
  root.innerHTML="";

  const dayEvents=events.filter(e=>e.event_date===selectedDate);

  if(!dayEvents.length) {
    root.innerHTML=`
      <div class="empty-state">
        <div class="empty-illustration">✳</div>
        <strong>Día sin jornadas</strong>
        <p>Aún no has añadido nada para esta fecha.</p>
      </div>`;
    return;
  }

  dayEvents.forEach(e=>{
    const div=document.createElement("article");
    div.className="detail-item";
    const hours=eventHours(e);

    div.innerHTML=`
      <div class="detail-top">
        <span class="detail-type ${e.type}">${typeNames[e.type]}</span>
        <span class="detail-actions">
          <button data-edit="${e.id}">Editar</button>
          <button data-delete="${e.id}">Eliminar</button>
        </span>
      </div>
      ${e.title?`<div class="detail-title">${escapeHTML(e.title)}</div>`:""}
      <div class="detail-meta">
        ${e.start_time&&e.end_time
          ?`<span>◷ ${escapeHTML(e.start_time)} – ${escapeHTML(e.end_time)}</span>`:""}
        ${hours?`<span>◌ ${hours.toLocaleString("es-ES")} h</span>`:""}
      </div>
      ${e.notes?`<p class="detail-notes">${escapeHTML(e.notes)}</p>`:""}
      ${e.highlighted?'<div class="highlight-label">★ Día destacado</div>':""}`;

    root.append(div);
  });

  root.querySelectorAll("[data-edit]").forEach(b=>
    b.addEventListener("click",()=>openModal(events.find(e=>e.id===b.dataset.edit)))
  );

  root.querySelectorAll("[data-delete]").forEach(b=>
    b.addEventListener("click",()=>deleteEvent(b.dataset.delete))
  );
}

function render() {
  renderStats();
  renderCalendar();
  renderDayDetails();
}

// FORMULARIO

function openModal(event=null,presetType=null) {
  $("event-form").reset();
  $("event-error").textContent="";
  $("event-id").value=event?.id||"";
  $("event-date").value=event?.event_date||selectedDate;

  const initialType=event?.type||presetType||"practice";

  document.querySelector(
    `input[name="event-type"][value="${initialType}"]`
  ).checked=true;

  $("event-title").value=event?.title||"";
  $("event-start").value=event?.start_time||"";
  $("event-end").value=event?.end_time||"";

  $("event-hours").value=event?.hours??
    (initialType==="practice"?DEFAULT_PRACTICE_HOURS:"");

  updateTypeFields();

  $("event-highlight").checked=!!event?.highlighted;
  $("event-notes").value=event?.notes||"";

  $("modal-title").textContent=event
    ?"Editar registro":"Añadir al calendario";

  $("delete-event").classList.toggle("hidden",!event);
  $("event-modal").classList.remove("hidden");
}

function closeModal() {
  $("event-modal").classList.add("hidden");
}

function updateTypeFields() {
  const type=document.querySelector(
    'input[name="event-type"]:checked'
  )?.value||"practice";

  const isLeave=type==="leave";

  $("event-start").disabled=isLeave;
  $("event-end").disabled=isLeave;
  $("event-hours").disabled=isLeave;

  if(isLeave) {
    $("event-start").value="";
    $("event-end").value="";
    $("event-hours").value="";
  } else if(type==="practice"&&!$("event-hours").value) {
    $("event-hours").value=DEFAULT_PRACTICE_HOURS;
  }

  $("leave-reason-wrap").querySelector("label").innerHTML=
    isLeave
      ?'Motivo de libranza <span class="optional">opcional</span>'
      :'Título <span class="optional">opcional</span>';

  $("event-title").placeholder=isLeave
    ?"Ej. Festivo, vacaciones, asuntos propios…"
    :"Ej. Jornada en la empresa";
}

async function saveEvent(e) {
  e.preventDefault();
  $("event-error").textContent="";

  const id=$("event-id").value;
  const type=document.querySelector(
    'input[name="event-type"]:checked'
  ).value;

  const hoursRaw=$("event-hours").value;

  const payload={
    user_id:user.id,
    event_date:$("event-date").value,
    type,
    title:$("event-title").value.trim(),
    start_time:type==="leave"?null:($("event-start").value||null),
    end_time:type==="leave"?null:($("event-end").value||null),
    hours:type==="leave"?null:(hoursRaw===""?null:Number(hoursRaw)),
    highlighted:$("event-highlight").checked,
    notes:$("event-notes").value.trim()
  };

  if(!payload.event_date) {
    $("event-error").textContent="Selecciona una fecha.";
    return;
  }

  if(payload.hours!==null&&(payload.hours<0||payload.hours>24)) {
    $("event-error").textContent="Las horas deben estar entre 0 y 24.";
    return;
  }

  if(type==="practice"&&payload.hours===null)
    payload.hours=DEFAULT_PRACTICE_HOURS;

  if(payload.start_time&&payload.end_time&&!payload.hours) {
    const [a,b]=[payload.start_time,payload.end_time].map(t=>
      t.split(":").reduce((h,m)=>h*60+Number(m),0)
    );

    payload.hours=Math.round(((b-a+(b<a?1440:0))/60)*100)/100;
  }

  const button=$("event-form").querySelector('button[type="submit"]');
  button.disabled=true;
  button.textContent="Guardando…";

  const result=id
    ?await supabase.from("calendar_events").update(payload).eq("id",id).select().single()
    :await supabase.from("calendar_events").insert(payload).select().single();

  button.disabled=false;
  button.textContent="Guardar jornada";

  if(result.error) {
    $("event-error").textContent=result.error.message;
    return;
  }

  selectedDate=payload.event_date;
  await loadEvents();
  closeModal();
  render();
  showToast(id?"Cambios guardados":"Jornada añadida");
}

async function deleteEvent(id) {
  if(!confirm("¿Quieres eliminar este registro?"))return;

  const {error}=await supabase.from("calendar_events").delete().eq("id",id);

  if(error) {
    showToast("No se ha podido eliminar: "+error.message);
    return;
  }

  await loadEvents();
  closeModal();
  render();
  showToast("Registro eliminado");
}

// SELECCIÓN MÚLTIPLE

function updateBulkToolbar() {
  $("bulk-toolbar").classList.toggle("hidden",!selectionMode);
  $("selection-toggle").classList.toggle("active",selectionMode);
  $("selection-toggle").textContent=
    selectionMode?"Salir de selección":"Selección múltiple";
  $("selected-count").textContent=selectedDates.size;
}

async function applyBulk(type) {
  const dates=[...selectedDates].sort();

  if(!dates.length) {
    showToast("Selecciona primero uno o varios días");
    return;
  }

  const existing=new Set(events.map(e=>e.event_date));
  const conflicts=dates.filter(d=>existing.has(d));
  const fresh=dates.filter(d=>!existing.has(d));

  if(!fresh.length) {
    showToast("Todos los días seleccionados ya tienen registros");
    return;
  }

  const label=typeNames[type].toLowerCase();

  if(!confirm(
    `Se añadirán ${fresh.length} días como ${label}. `+
    `${conflicts.length?`${conflicts.length} días ocupados se conservarán. `:""}`+
    "¿Continuar?"
  ))return;

  const payload=fresh.map(event_date=>({
    user_id:user.id,
    event_date,
    type,
    title:type==="leave"?"Libranza":"",
    start_time:null,
    end_time:null,
    hours:type==="practice"?DEFAULT_PRACTICE_HOURS:null,
    highlighted:false,
    notes:""
  }));

  const {error}=await supabase.from("calendar_events").insert(payload);

  if(error) {
    showToast("No se pudieron guardar los días: "+error.message);
    return;
  }

  selectedDate=fresh[0];
  selectedDates.clear();
  selectionMode=false;
  updateBulkToolbar();

  await loadEvents();
  render();

  showToast(`${fresh.length} días añadidos como ${label}`);
}

// COPIAR Y PEGAR JORNADAS

function copySelectedDay() {
  copiedDayRecords=events
    .filter(e=>e.event_date===selectedDate)
    .map(e=>({
      type:e.type,
      title:e.title,
      start_time:e.start_time,
      end_time:e.end_time,
      hours:e.hours,
      highlighted:e.highlighted,
      notes:e.notes
    }));

  if(!copiedDayRecords.length) {
    showToast("El día seleccionado no tiene jornadas");
    return;
  }

  showToast(
    `${copiedDayRecords.length} jornada(s) copiadas`
  );
}

async function pasteCopiedDay() {
  if(!copiedDayRecords.length) {
    showToast("Primero copia una jornada con Ctrl + C");
    return;
  }

  const targetDate=selectedDate;

  if(events.some(e=>e.event_date===targetDate)) {
    const accepted=confirm(
      `El ${prettyDate(targetDate)} ya tiene registros.\n\n`+
      "¿Quieres añadir las jornadas copiadas sin borrar las existentes?"
    );

    if(!accepted)return;
  }

  const payload=copiedDayRecords.map(e=>({
    user_id:user.id,
    event_date:targetDate,
    type:e.type,
    title:e.title||"",
    start_time:e.start_time||null,
    end_time:e.end_time||null,
    hours:e.hours??null,
    highlighted:!!e.highlighted,
    notes:e.notes||""
  }));

  const {error}=await supabase
    .from("calendar_events")
    .insert(payload);

  if(error) {
    showToast("Error al pegar: "+error.message);
    return;
  }

  await loadEvents();
  render();

  showToast(
    `${payload.length} jornada(s) pegadas correctamente`
  );
}

// COPIA Y PEGADO DE FECHAS SELECCIONADAS

function exportBackup() {
  const data={
    exported_at:new Date().toISOString(),
    calendar_events:events
  };

  const blob=new Blob(
    [JSON.stringify(data,null,2)],
    {type:"application/json"}
  );

  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="mi-calendario-copia.json";
  a.click();
  URL.revokeObjectURL(url);

  showToast("Copia de seguridad descargada");
}

async function refresh() {
  try {
    await loadEvents();
    setConnection(true,"Sincronizado");
    render();
  } catch(err) {
    setConnection(false,"Error de conexión");
    showToast("No se han podido cargar los datos: "+err.message);
  }
}

// AUTENTICACIÓN

$("auth-form").addEventListener("submit",async e=>{
  e.preventDefault();
  $("auth-message").textContent="";

  if(!configured) {
    $("auth-message").textContent=
      "Primero hay que conectar Supabase.";
    return;
  }

  const email=$("auth-email").value.trim();
  const password=$("auth-password").value;

  $("auth-submit").disabled=true;

  const result=authMode==="login"
    ?await supabase.auth.signInWithPassword({email,password})
    :await supabase.auth.signUp({email,password});

  $("auth-submit").disabled=false;

  if(result.error) {
    $("auth-message").textContent=result.error.message;
    return;
  }

  if(authMode==="signup"&&!result.data.session) {
    $("auth-message").textContent=
      "Cuenta creada. Revisa tu correo para confirmar el registro.";
    return;
  }

  user=result.data.user;
  await refresh();
  showApp();
});

document.querySelectorAll("[data-auth-tab]").forEach(b=>
  b.addEventListener("click",()=>setAuthMode(b.dataset.authTab))
);

// BOTONES DE JORNADA

$("quick-practice").addEventListener("click",()=>openModal(null,"practice"));
$("quick-work").addEventListener("click",()=>openModal(null,"work"));
$("quick-leave").addEventListener("click",()=>openModal(null,"leave"));
$("add-event-side").addEventListener("click",()=>openModal());

$("close-modal").addEventListener("click",closeModal);
$("cancel-modal").addEventListener("click",closeModal);

$("event-modal").addEventListener("click",e=>{
  if(e.target===$("event-modal"))closeModal();
});

$("event-form").addEventListener("submit",saveEvent);

document.querySelectorAll('input[name="event-type"]').forEach(r=>
  r.addEventListener("change",updateTypeFields)
);

$("delete-event").addEventListener("click",()=>
  deleteEvent($("event-id").value)
);

// BOTONES DE SELECCIÓN

$("selection-toggle").addEventListener("click",()=>{
  selectionMode=!selectionMode;

  if(!selectionMode) {
    selectedDates.clear();
    rangeAnchor=null;
  }

  updateBulkToolbar();
  renderCalendar();
});

$("clear-selection").addEventListener("click",()=>{
  selectedDates.clear();
  selectionMode=false;
  rangeAnchor=null;
  updateBulkToolbar();
  renderCalendar();
});

$("select-weekdays").addEventListener("click",()=>{
  selectedDates.clear();

  const year=cursor.getFullYear();
  const month=cursor.getMonth();
  const last=new Date(year,month+1,0).getDate();

  for(let day=1;day<=last;day++) {
    const d=new Date(year,month,day);
    if(d.getDay()!==0&&d.getDay()!==6)
      selectedDates.add(dateKey(d));
  }

  selectionMode=true;
  updateBulkToolbar();
  renderCalendar();
});

document.querySelectorAll("[data-bulk-type]").forEach(b=>
  b.addEventListener("click",()=>applyBulk(b.dataset.bulkType))
);

// NAVEGACIÓN

$("prev-month").addEventListener("click",()=>{
  const d=viewMode==="month"
    ?new Date(cursor.getFullYear(),cursor.getMonth()-1,1)
    :parseDate(selectedDate);

  if(viewMode==="week")d.setDate(d.getDate()-7);

  cursor=new Date(d.getFullYear(),d.getMonth(),1);

  if(viewMode==="week")selectedDate=dateKey(d);

  render();
});

$("next-month").addEventListener("click",()=>{
  const d=viewMode==="month"
    ?new Date(cursor.getFullYear(),cursor.getMonth()+1,1)
    :parseDate(selectedDate);

  if(viewMode==="week")d.setDate(d.getDate()+7);

  cursor=new Date(d.getFullYear(),d.getMonth(),1);

  if(viewMode==="week")selectedDate=dateKey(d);

  render();
});

$("today-button").addEventListener("click",()=>{
  const now=new Date();
  cursor=new Date(now.getFullYear(),now.getMonth(),1);
  selectedDate=dateKey(now);
  render();
});

$("view-select").addEventListener("change",e=>{
  viewMode=e.target.value;
  renderCalendar();
});

$("export-button").addEventListener("click",exportBackup);

// CUENTA

$("account-button").addEventListener("click",()=>
  $("account-menu").classList.toggle("hidden")
);

$("signout-button").addEventListener("click",async()=>{
  await supabase.auth.signOut();
  user=null;
  events=[];
  $("account-menu").classList.add("hidden");
  showAuth();
});

document.addEventListener("click",e=>{
  if(!e.target.closest(".topbar-right")&&!e.target.closest("#account-menu"))
    $("account-menu").classList.add("hidden");
});

// ATAJOS DE TECLADO

document.addEventListener("keydown",async e=>{
  const tag=e.target.tagName;

  // No interferir con campos de texto
  if(
    ["INPUT","TEXTAREA","SELECT"].includes(tag) ||
    e.target.isContentEditable
  )return;

  const modifier=e.ctrlKey||e.metaKey;

  if(!modifier)return;

  if(e.key.toLowerCase()==="c") {
    e.preventDefault();
    copySelectedDay();
  }

  if(e.key.toLowerCase()==="v") {
    e.preventDefault();
    await pasteCopiedDay();
  }
});

// INICIALIZACIÓN

if(!configured) {
  showAuth("La aplicación está lista, pero falta conectar Supabase.");
} else {
  supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

  supabase.auth.onAuthStateChange(async(_event,session)=>{
    if(session?.user) {
      user=session.user;
      try {
        await refresh();
        showApp();
      } catch(err) {
        showAuth(err.message);
      }
    } else {
      user=null;
      events=[];
      showAuth();
    }
  });

  const {data:{session}}=await supabase.auth.getSession();

  if(session?.user) {
    user=session.user;
    await refresh();
    showApp();
  } else {
    showAuth();
  }
}
