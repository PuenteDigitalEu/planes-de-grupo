/**
 * CALENDARIO DEL GRUPO
 *
 * La configuración (ID del calendario, código del grupo...) está en el archivo "Config".
 * Este archivo se puede sustituir entero cuando haya una versión nueva.
 *
 * 1) Página de alta: cada amigo pone su nombre, su correo de Google y el código
 *    del grupo, y queda como EDITOR del calendario compartido.
 * 2) Cada plan del calendario tiene su ficha: quién va y una lista de lo que hace
 *    falta (comida, regalos, tareas...) donde cada uno se apunta. Bote opcional.
 *    El resumen se escribe solo en la descripción del evento del calendario.
 * 3) Planes sorpresa: si el título o la descripción llevan "sorpresa" o 🤫, no se
 *    escribe nada en el evento, y en la ficha se elige a quién se le oculta.
 *
 * Todo se guarda en una hoja de cálculo de tu Google Drive ("Datos — ...").
 */

const TIPOS = {
  comida: { icono: '🍽', nombre: 'Comida / bebida' },
  regalo: { icono: '🎁', nombre: 'Regalo' },
  tarea: { icono: '📋', nombre: 'Tarea' },
  otro: { icono: '📦', nombre: 'Otro' }
};
const SEPARADOR = '━━━━━━━━━━━━━━━━';
const CABECERA_RESUMEN = '📌 ORGANIZACIÓN DEL PLAN';


// ================= PÁGINAS =================

function doGet(e) {
  const p = (e && e.parameter) || {};
  let t;
  if (p.f) {
    t = HtmlService.createTemplateFromFile('Ficha');
    t.token = String(p.f).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  } else if (p.s) {
    t = HtmlService.createTemplateFromFile('Sorteo');
    t.modo = 'privado';
    t.token = limpiarToken_(p.s);
  } else if (p.v === 'sorteo') {
    t = HtmlService.createTemplateFromFile('Sorteo');
    t.modo = 'organizador';
    t.token = '';
  } else if (p.v === 'planes') {
    t = HtmlService.createTemplateFromFile('Planes');
  } else {
    t = HtmlService.createTemplateFromFile('Index');
  }
  t.nombreGrupo = CONFIG.NOMBRE_GRUPO;
  t.calendarId = CONFIG.CALENDAR_ID;
  t.urlApp = urlApp_();
  return t.evaluate()
    .setTitle(CONFIG.NOMBRE_GRUPO)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


// ================= ALTA EN EL CALENDARIO =================

function unirse(datos) {
  const nombre = String((datos && datos.nombre) || '').trim().slice(0, 80);
  const email = String((datos && datos.email) || '').trim().toLowerCase();
  const codigo = String((datos && datos.codigo) || '').trim().toLowerCase();

  if (!nombre) throw new Error('Escribe tu nombre.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ese correo no parece válido.');
  if (codigo !== CONFIG.CODIGO_GRUPO.trim().toLowerCase()) throw new Error('El código del grupo no es correcto.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (yaEsMiembro_(email)) {
      registrar_(nombre, email, 'Ya era miembro');
      return { ok: true, yaEstaba: true };
    }
    if (contarMiembros_() >= CONFIG.MAX_MIEMBROS) {
      throw new Error('El calendario está completo. Habla con el organizador.');
    }
    try {
      Calendar.Acl.insert(
        { role: 'writer', scope: { type: 'user', value: email } },
        CONFIG.CALENDAR_ID,
        { sendNotifications: true }
      );
    } catch (e) {
      registrar_(nombre, email, 'ERROR: ' + e.message);
      throw new Error('No he podido darte acceso. Comprueba que es el correo de tu cuenta de Google.');
    }
    registrar_(nombre, email, 'Añadido como editor');
    return { ok: true, yaEstaba: false };
  } finally {
    lock.releaseLock();
  }
}


// ================= FICHAS DE LOS PLANES =================

/** La página de la ficha la pide al abrirse y cada 30 segundos. */
function getFicha(token, persona) {
  persona = String(persona || '').trim();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = buscarFicha_(String(token || ''));
    if (!r) throw new Error('No encuentro este plan. Puede que el enlace esté mal copiado.');
    let cambio = normalizar_(r.datos);
    let ev = null;
    try {
      ev = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID).getEventById(r.datos.eventId);
      if (ev) {
        if (refrescar_(r.datos, ev)) cambio = true;
      } else if (!r.datos.cancelado) {
        r.datos.cancelado = true;
        cambio = true;
      }
    } catch (e) { /* si el calendario falla, se muestra lo guardado */ }
    if (cambio) {
      guardarFicha_(r.fila, r.datos);
      if (ev) actualizarEvento_(ev, r.datos);
    }
    return respuesta_(r.datos, persona);
  } finally {
    lock.releaseLock();
  }
}

/** Todo lo que se hace en una ficha pasa por aquí. */
function accion(token, persona, tipo, datos) {
  persona = String(persona || '').trim().slice(0, 80);
  const miembros = miembros_();
  if (!persona) throw new Error('Primero elige quién eres, arriba del todo.');
  if (miembros.length && miembros.indexOf(persona) === -1) throw new Error('Elige tu nombre en la lista de arriba.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = buscarFicha_(String(token || ''));
    if (!r) throw new Error('No encuentro este plan.');
    normalizar_(r.datos);
    if (ocultoPara_(r.datos, persona)) throw new Error('🤫 Este plan es una sorpresa.');
    aplicar_(r.datos, persona, String(tipo || ''), datos || {}, miembros);
    guardarFicha_(r.fila, r.datos);
    try {
      const ev = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID).getEventById(r.datos.eventId);
      if (ev) actualizarEvento_(ev, r.datos);
    } catch (e) { Logger.log('No se pudo actualizar el evento: ' + e.message); }
    return respuesta_(r.datos, persona, miembros);
  } finally {
    lock.releaseLock();
  }
}

/** Próximos planes, para la página "Planes del grupo". */
function listarPlanes(persona) {
  persona = String(persona || '').trim();
  const miembros = miembros_();
  const h = hojaFichas_();
  if (h.getLastRow() < 2) return { planes: [], miembros: miembros };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const planes = h.getRange(2, 3, h.getLastRow() - 1, 1).getValues()
    .map(function (r) { try { const f = JSON.parse(r[0]); normalizar_(f); return f; } catch (e) { return null; } })
    .filter(function (f) {
      if (!f || f.cancelado || new Date(f.inicio) < hoy) return false;
      // Sin saber quién mira, los planes sorpresa no se enseñan
      if (f.sorpresa && (!persona || ocultoPara_(f, persona))) return false;
      return true;
    })
    .sort(function (a, b) { return new Date(a.inicio) - new Date(b.inicio); })
    .map(function (f) {
      const a = f.asistencia;
      return {
        token: f.token, titulo: f.titulo, inicio: f.inicio, todoElDia: f.todoElDia,
        fechaDia: f.fechaDia, lugar: f.lugar, sorpresa: !!f.sorpresa,
        van: Object.keys(a).filter(function (n) { return a[n] === 'si'; }).length,
        cosas: f.items.length,
        faltan: f.items.filter(function (i) { return i.apuntados.length < i.cupo; }).length
      };
    });
  return { planes: planes, miembros: miembros };
}

function respuesta_(f, persona, miembros) {
  miembros = miembros || miembros_();
  if (persona && ocultoPara_(f, persona)) {
    return { oculto: true, ficha: { titulo: f.titulo, inicio: f.inicio, todoElDia: f.todoElDia, fechaDia: f.fechaDia, lugar: f.lugar }, miembros: miembros };
  }
  return { ficha: f, miembros: miembros, organizador: (CONFIG.ORGANIZADOR || '').trim() };
}

/** Quien creó una cosa de la lista y el organizador pueden cambiarla y apuntar a otros. */
function puedeGestionar_(it, persona) {
  return persona === it.creadoPor || persona === (CONFIG.ORGANIZADOR || '').trim();
}

function ocultoPara_(f, persona) {
  return !!(f.sorpresa && persona && (f.sorpresa.para || []).indexOf(persona) !== -1);
}

function aplicar_(f, persona, tipo, d, miembros) {
  switch (tipo) {
    // ----- Quién va -----
    case 'asistencia': {
      const estado = String(d.estado || '');
      if (!estado) { delete f.asistencia[persona]; return; }
      if (['si', 'quiza', 'no'].indexOf(estado) === -1) throw new Error('Respuesta no válida.');
      f.asistencia[persona] = estado;
      return;
    }

    // ----- Lista de lo que hace falta -----
    case 'item_add': {
      const texto = txt_(d.texto, 100);
      if (!texto) throw new Error('Escribe qué hace falta.');
      if (f.items.length >= 150) throw new Error('La lista de este plan está llena.');
      const t = TIPOS[d.tipo] ? d.tipo : 'otro';
      let cupo = parseInt(d.cupo, 10);
      if (!(cupo >= 1)) cupo = 1;
      f.items.push({ id: id_(), tipo: t, texto: texto, nota: txt_(d.nota, 200),
                     cupo: Math.min(cupo, 50), apuntados: [], creadoPor: persona });
      return;
    }
    case 'item_apuntar': {
      const it = buscar_(f.items, d.id, 'Eso ya no está en la lista.');
      if (it.apuntados.indexOf(persona) !== -1) return;
      if (it.apuntados.length >= it.cupo) {
        throw new Error(it.cupo === 1 ? 'Ya se lo ha pedido ' + it.apuntados[0] + '.' : 'Ya está completo.');
      }
      it.apuntados.push(persona);
      return;
    }
    case 'item_soltar': {
      const it = buscar_(f.items, d.id, 'Eso ya no está en la lista.');
      it.apuntados = it.apuntados.filter(function (n) { return n !== persona; });
      return;
    }
    case 'item_cupo': {
      const it = buscar_(f.items, d.id, 'Eso ya no está en la lista.');
      if (!puedeGestionar_(it, persona)) throw new Error('Solo puede cambiarlo quien lo apuntó (' + it.creadoPor + ') o el organizador.');
      let cupo = parseInt(d.cupo, 10);
      if (!(cupo >= 1)) cupo = 1;
      if (cupo < it.apuntados.length) throw new Error('Ya hay ' + it.apuntados.length + ' apuntados. Quita a alguien antes de bajar el número.');
      it.cupo = Math.min(cupo, 50);
      return;
    }
    case 'item_asignar': {
      const it = buscar_(f.items, d.id, 'Eso ya no está en la lista.');
      if (!puedeGestionar_(it, persona)) throw new Error('Solo puede apuntar a otros quien lo apuntó (' + it.creadoPor + ') o el organizador.');
      const nombre = txt_(d.nombre, 80);
      if (!nombre) throw new Error('Elige a quién apuntar.');
      if (miembros && miembros.length && miembros.indexOf(nombre) === -1) throw new Error('Esa persona no está en el grupo.');
      if (ocultoPara_(f, nombre)) throw new Error('No puedes apuntar a ' + nombre + ': el plan es una sorpresa para él o ella.');
      if (it.apuntados.indexOf(nombre) !== -1) return;
      if (it.apuntados.length >= it.cupo) it.cupo = Math.min(it.apuntados.length + 1, 50); // si está lleno, se amplía
      it.apuntados.push(nombre);
      return;
    }
    case 'item_quitar': {
      const it = buscar_(f.items, d.id, 'Eso ya no está en la lista.');
      const nombre = txt_(d.nombre, 80);
      if (nombre !== persona && !puedeGestionar_(it, persona)) throw new Error('Solo puede quitar a otros quien lo apuntó (' + it.creadoPor + ') o el organizador.');
      it.apuntados = it.apuntados.filter(function (n) { return n !== nombre; });
      return;
    }
    case 'item_borrar': {
      const it = buscar_(f.items, d.id, 'Eso ya no está en la lista.');
      const otros = it.apuntados.filter(function (n) { return n !== persona; });
      if (otros.length && !puedeGestionar_(it, persona)) {
        throw new Error('No se puede borrar: ya se ha apuntado ' + otros.join(', ') + '.');
      }
      f.items = f.items.filter(function (x) { return x.id !== it.id; });
      return;
    }

    // ----- Bote -----
    case 'bote_config':
      f.bote.activo = true;
      f.bote.concepto = txt_(d.concepto, 100);
      f.bote.objetivo = num_(d.objetivo);
      f.bote.cuota = num_(d.cuota);
      return;
    case 'bote_quitar':
      f.bote.activo = false;
      return;
    case 'bote_aportar': {
      const importe = num_(d.importe);
      const mia = f.bote.aportaciones.filter(function (a) { return a.nombre === persona; })[0];
      if (!importe) {
        f.bote.aportaciones = f.bote.aportaciones.filter(function (a) { return a.nombre !== persona; });
      } else if (mia) {
        mia.importe = importe;
      } else {
        f.bote.aportaciones.push({ nombre: persona, importe: importe, pagado: false });
      }
      return;
    }
    case 'bote_pagado': {
      const nombre = txt_(d.nombre, 80);
      const a = f.bote.aportaciones.filter(function (x) { return x.nombre === nombre; })[0];
      if (!a) throw new Error('Esa aportación ya no existe.');
      a.pagado = !!d.pagado;
      return;
    }

    // ----- Sorpresa -----
    case 'sorpresa': {
      if (!d.activa) { f.sorpresa = null; f.sorpresaQuitada = true; return; }
      const para = (Array.isArray(d.para) ? d.para : [])
        .map(function (n) { return txt_(n, 80); })
        .filter(function (n, i, arr) { return n && arr.indexOf(n) === i; })
        .filter(function (n) { return !miembros || !miembros.length || miembros.indexOf(n) !== -1; });
      if (para.indexOf(persona) !== -1) throw new Error('No puedes ocultarte el plan a ti mismo.');
      f.sorpresa = { para: para };
      return;
    }

    default:
      throw new Error('Acción desconocida.');
  }
}


// ================= SINCRONIZACIÓN CON EL CALENDARIO =================

/**
 * Se ejecuta sola cada 15 minutos (después de "activarAutomatico").
 * Crea la ficha de cada plan nuevo y escribe el resumen en la descripción del evento.
 */
function sincronizarEventos() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const cal = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
    if (!cal) throw new Error('No encuentro el calendario. Revisa CALENDAR_ID en Config.');
    if (!urlApp_()) throw new Error('Falta el enlace de la app en URL_APP (Config).');

    const h = hojaFichas_();
    const filas = h.getLastRow() > 1 ? h.getRange(2, 1, h.getLastRow() - 1, 3).getValues() : [];
    const porEvento = {};
    filas.forEach(function (r, i) {
      let datos = null;
      try { datos = JSON.parse(r[2]); } catch (e) { /* fila dañada, se ignora */ }
      if (datos) porEvento[r[1]] = { fila: i + 2, datos: datos, visto: false };
    });

    const desde = new Date();
    const hasta = new Date(desde.getTime() + CONFIG.DIAS_A_REVISAR * 86400000);

    cal.getEvents(desde, hasta).forEach(function (ev) {
      if (ev.isRecurringEvent()) return; // los eventos que se repiten no llevan ficha
      const id = ev.getId();
      let reg = porEvento[id];
      if (reg) {
        reg.visto = true;
        const c1 = normalizar_(reg.datos);
        const c2 = refrescar_(reg.datos, ev);
        if (c1 || c2) guardarFicha_(reg.fila, reg.datos);
      } else {
        const token = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
        const datos = fichaNueva_(token, ev);
        h.appendRow([token, id, JSON.stringify(datos), new Date()]);
        reg = porEvento[id] = { fila: h.getLastRow(), datos: datos, visto: true };
      }
      actualizarEvento_(ev, reg.datos);
    });

    // Planes futuros que ya no salen: borrados o movidos fuera del periodo revisado
    Object.keys(porEvento).forEach(function (id) {
      const reg = porEvento[id];
      if (reg.visto || reg.datos.cancelado || new Date(reg.datos.inicio) < desde) return;
      const ev = cal.getEventById(id);
      if (!ev) {
        reg.datos.cancelado = true;
        guardarFicha_(reg.fila, reg.datos);
      } else if (refrescar_(reg.datos, ev)) {
        guardarFicha_(reg.fila, reg.datos);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

/** Escribe (o quita, si es sorpresa) el resumen en la descripción del evento. */
function actualizarEvento_(ev, f) {
  const actual = ev.getDescription() || '';
  const nueva = descripcionNueva_(actual, f);
  if (nueva !== actual) ev.setDescription(nueva);
}

function descripcionNueva_(actual, f) {
  let base = String(actual || '');
  const corte = base.indexOf(SEPARADOR);
  if (corte !== -1) base = base.slice(0, corte);
  // Formato antiguo: solo el enlace a la ficha
  base = base.replace(/👉 Ficha del plan[^\n]*\n?\s*https?:\/\/\S+/g, '');
  base = base.replace(/(\s|<br\s*\/?>)+$/i, '');
  if (f.sorpresa) return base;
  return (base ? base + '\n\n' : '') + resumen_(f);
}

function resumen_(f) {
  const l = [SEPARADOR, CABECERA_RESUMEN];
  const a = f.asistencia;
  const por = function (e) { return Object.keys(a).filter(function (n) { return a[n] === e; }).sort(); };
  const van = por('si'), quiza = por('quiza'), no = por('no');
  if (van.length) l.push('👥 Van (' + van.length + '): ' + van.join(', '));
  else l.push('👥 Todavía no ha confirmado nadie');
  if (quiza.length) l.push('🤔 Quizá (' + quiza.length + '): ' + quiza.join(', '));
  if (no.length) l.push('❌ No van (' + no.length + '): ' + no.join(', '));

  if (f.items.length) {
    l.push('');
    Object.keys(TIPOS).forEach(function (t) {
      f.items.filter(function (i) { return i.tipo === t; }).forEach(function (i) {
        let s = TIPOS[t].icono + ' ' + i.texto;
        if (i.cupo > 1) s += ' (' + i.apuntados.length + '/' + i.cupo + ')';
        if (i.apuntados.length) s += ': ' + i.apuntados.join(', ');
        const faltan = i.cupo - i.apuntados.length;
        if (faltan > 0) s += i.apuntados.length ? ' · falta' + (faltan > 1 ? 'n ' : ' ') + faltan : ' · ❗ sin asignar';
        l.push(s);
      });
    });
  }

  if (f.bote.activo) {
    const total = f.bote.aportaciones.reduce(function (s, x) { return s + x.importe; }, 0);
    let s = '💰 Bote' + (f.bote.concepto ? ' (' + f.bote.concepto + ')' : '') + ': ' + eur_(total);
    if (f.bote.objetivo) s += ' de ' + eur_(f.bote.objetivo);
    const n = f.bote.aportaciones.length;
    s += ' · ' + n + (n === 1 ? ' persona' : ' personas');
    l.push('', s);
  }

  l.push('', '👉 Apúntate y organiza aquí:', urlApp_() + '?f=' + f.token);
  return l.join('\n');
}


// ================= EJECÚTALAS TÚ DESDE EL EDITOR =================

/** 1º) Da los permisos, comprueba el calendario y crea la hoja de datos. */
function comprobarConfiguracion() {
  const cal = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!cal) throw new Error('No encuentro el calendario. Revisa CALENDAR_ID.');
  Calendar.Acl.list(CONFIG.CALENDAR_ID); // comprueba que el servicio avanzado está activado
  hojaFichas_();
  Logger.log('Calendario OK: ' + cal.getName());
  Logger.log('Miembros actuales: ' + contarMiembros_());
  Logger.log('Hoja de datos: ' + getLibro_().getUrl());
  Logger.log('Zona horaria del proyecto: ' + Session.getScriptTimeZone() + ' (debería ser Europe/Madrid)');
}

/** 2º) Después de rellenar URL_APP: activa la creación automática de fichas. */
function activarAutomatico() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'sincronizarEventos'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sincronizarEventos').timeBased().everyMinutes(15).create();
  sincronizarEventos();
  Logger.log('Listo. Cada 15 minutos se crean las fichas de los planes nuevos.');
}


// ================= FUNCIONES INTERNAS =================

function urlApp_() {
  if (CONFIG.URL_APP) return CONFIG.URL_APP.trim();
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

function esSorpresa_(ev) {
  return /sorpresa|🤫/i.test((ev.getTitle() || '') + ' ' + (ev.getDescription() || ''));
}

function datosEvento_(ev) {
  const inicio = ev.isAllDayEvent() ? ev.getAllDayStartDate() : ev.getStartTime();
  return {
    titulo: ev.getTitle() || 'Plan sin título',
    inicio: ev.getStartTime().toISOString(),
    todoElDia: ev.isAllDayEvent(),
    fechaDia: Utilities.formatDate(inicio, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    lugar: ev.getLocation() || ''
  };
}

function fichaNueva_(token, ev) {
  const f = { token: token, eventId: ev.getId(), cancelado: false };
  normalizar_(f);
  if (esSorpresa_(ev)) f.sorpresa = { para: [] };
  const n = datosEvento_(ev);
  Object.keys(n).forEach(function (k) { f[k] = n[k]; });
  return f;
}

/** Completa campos que falten y pasa fichas de la versión anterior al formato nuevo. */
function normalizar_(f) {
  let cambio = false;
  if (!f.asistencia) { f.asistencia = {}; cambio = true; }
  if (!f.items) { f.items = []; cambio = true; }
  if (f.sorpresa === undefined) { f.sorpresa = null; cambio = true; }
  if (!f.bote) { f.bote = {}; cambio = true; }
  const b = f.bote;
  if (!b.aportaciones) { b.aportaciones = []; cambio = true; }
  if (b.activo === undefined) {
    b.activo = !!(f.modulos && f.modulos.bote) || !!b.concepto || b.aportaciones.length > 0;
    cambio = true;
  }
  (f.regalos || []).forEach(function (g) {
    f.items.push({ id: g.id || id_(), tipo: 'regalo', texto: g.nombre,
      nota: [g.precio ? eur_(g.precio) : '', g.enlace || ''].filter(String).join(' · '),
      cupo: 1, apuntados: g.reservadoPor ? [g.reservadoPor] : [], creadoPor: g.propuestoPor || '' });
  });
  (f.tareas || []).forEach(function (t) {
    f.items.push({ id: t.id || id_(), tipo: 'tarea', texto: t.texto, nota: '',
      cupo: 1, apuntados: t.asignadoA ? [t.asignadoA] : [], creadoPor: t.creadaPor || '' });
  });
  ['regalos', 'tareas', 'modulos'].forEach(function (k) {
    if (k in f) { delete f[k]; cambio = true; }
  });
  return cambio;
}

/** Copia título/fecha/lugar del evento a la ficha. Devuelve true si algo cambió. */
function refrescar_(f, ev) {
  const n = datosEvento_(ev);
  let cambio = !!f.cancelado;
  f.cancelado = false;
  Object.keys(n).forEach(function (k) {
    if (f[k] !== n[k]) { f[k] = n[k]; cambio = true; }
  });
  if (!f.sorpresa && esSorpresa_(ev) && !f.sorpresaQuitada) {
    f.sorpresa = { para: [] };
    cambio = true;
  }
  return cambio;
}

function getLibro_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('HOJA_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* se crea de nuevo */ }
  }
  const ss = SpreadsheetApp.create('Datos — ' + CONFIG.NOMBRE_GRUPO);
  const hoja = ss.getSheets()[0];
  hoja.setName('Altas');
  hoja.appendRow(['Fecha', 'Nombre', 'Correo', 'Resultado']);
  hoja.setFrozenRows(1);
  props.setProperty('HOJA_ID', ss.getId());
  return ss;
}

function hojaAltas_() {
  return getLibro_().getSheets()[0];
}

function hojaFichas_() {
  const ss = getLibro_();
  let h = ss.getSheetByName('Fichas');
  if (!h) {
    h = ss.insertSheet('Fichas');
    h.appendRow(['Token', 'ID evento', 'Datos (no tocar)', 'Actualizado']);
    h.setFrozenRows(1);
  }
  return h;
}

function buscarFicha_(token) {
  if (!/^[a-zA-Z0-9]{8,32}$/.test(token)) return null;
  const h = hojaFichas_();
  if (h.getLastRow() < 2) return null;
  const celda = h.getRange(2, 1, h.getLastRow() - 1, 1)
    .createTextFinder(token).matchEntireCell(true).findNext();
  if (!celda) return null;
  const fila = celda.getRow();
  return { fila: fila, datos: JSON.parse(h.getRange(fila, 3).getValue()) };
}

function guardarFicha_(fila, datos) {
  hojaFichas_().getRange(fila, 3, 1, 2).setValues([[JSON.stringify(datos), new Date()]]);
}

/** Nombres de los que se han dado de alta, más el organizador. */
function miembros_() {
  const h = hojaAltas_();
  const nombres = {};
  if (h.getLastRow() > 1) {
    h.getRange(2, 1, h.getLastRow() - 1, 4).getValues().forEach(function (r) {
      const nombre = String(r[1] || '').trim();
      const res = String(r[3] || '');
      if (nombre && (res.indexOf('Añadido') === 0 || res.indexOf('Ya era') === 0)) nombres[nombre] = true;
    });
  }
  if (CONFIG.ORGANIZADOR) nombres[CONFIG.ORGANIZADOR.trim()] = true;
  return Object.keys(nombres).sort(function (a, b) { return a.localeCompare(b, 'es'); });
}

function yaEsMiembro_(email) {
  try {
    const regla = Calendar.Acl.get(CONFIG.CALENDAR_ID, 'user:' + email);
    return regla && (regla.role === 'writer' || regla.role === 'owner');
  } catch (e) {
    return false;
  }
}

function contarMiembros_() {
  let total = 0;
  let pageToken;
  do {
    const res = Calendar.Acl.list(CONFIG.CALENDAR_ID, { pageToken: pageToken });
    (res.items || []).forEach(function (r) {
      if (r.scope && r.scope.type === 'user') total++;
    });
    pageToken = res.nextPageToken;
  } while (pageToken);
  return total;
}

function registrar_(nombre, email, resultado) {
  try {
    hojaAltas_().appendRow([new Date(), nombre, email, resultado]);
  } catch (e) {
    Logger.log('No se pudo registrar: ' + e.message);
  }
}

function buscar_(lista, id, mensaje) {
  const x = lista.filter(function (i) { return i.id === id; })[0];
  if (!x) throw new Error(mensaje);
  return x;
}

function txt_(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function num_(v) {
  if (v === null || v === undefined || v === '') return null;
  let s = String(v).replace(/\s|€/g, '');
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,50
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');      // 1.000
  const n = parseFloat(s);
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function eur_(n) {
  const partes = (Math.round((n || 0) * 100) / 100).toFixed(2).split('.');
  return partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + partes[1] + ' €';
}

function id_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}
