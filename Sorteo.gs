/**
 * AMIGO INVISIBLE
 *
 * - El organizador crea el sorteo (título, tope de gasto opcional y participantes)
 *   y lo sortea. Nadie se toca a sí mismo; no hay exclusiones.
 * - Cada participante recibe por correo un enlace privado con su token.
 * - La hoja "Sorteos" NO guarda el token ni el receptor en claro: guarda un hash del token
 *   (para encontrar la fila) y el receptor cifrado con ese mismo token. Así ni el organizador
 *   puede ver quién regala a quién mirando la hoja.
 *
 * Nota: el organizador sí puede rehacer el sorteo mientras nadie haya visto su resultado.
 */

const HOJA_SORTEOS = 'Sorteos';
const MIN_PARTICIPANTES_SORTEO = 3;


// ================= LLAMADAS DESDE LA PÁGINA DEL ORGANIZADOR =================

/** Lista de sorteos y de miembros, solo para el organizador. */
function sorteoPanel(persona) {
  soloOrganizador_(persona);
  const sorteos = leerSorteos_().map(function (s) {
    const d = s.datos;
    const asig = d.asignaciones || [];
    const vistos = asig.filter(function (a) { return !!a.visto; }).length;
    return {
      id: s.id,
      titulo: d.titulo,
      tope: d.tope,
      estado: s.estado,
      participantes: (d.participantes || []).length,
      vistos: vistos,
      puedeRehacer: s.estado === 'sorteado' && vistos === 0
    };
  });
  return { sorteos: sorteos, miembros: miembros_(), organizador: CONFIG.ORGANIZADOR };
}

/** Crea un sorteo en estado "abierto". Valida nombres, correos y tope. */
function sorteoCrear(persona, datos) {
  soloOrganizador_(persona);
  datos = datos || {};

  const titulo = txt_(datos.titulo, 60);
  if (!titulo) throw new Error('Ponle un título al sorteo, por ejemplo "Amigo invisible de Navidad".');

  let tope = null;
  if (String(datos.tope || '').trim() !== '') {
    tope = num_(datos.tope);
    if (tope === null) throw new Error('El tope de gasto no es válido. Pon un importe, por ejemplo 20.');
  }

  const miembros = miembros_();
  const elegidos = (datos.participantes || [])
    .map(function (n) { return txt_(n, 80); })
    .filter(function (n) { return !!n; });
  const unicos = elegidos.filter(function (n, i) { return elegidos.indexOf(n) === i; });

  if (unicos.length < MIN_PARTICIPANTES_SORTEO) {
    throw new Error('Hacen falta al menos ' + MIN_PARTICIPANTES_SORTEO + ' personas en el sorteo.');
  }
  unicos.forEach(function (n) {
    if (miembros.indexOf(n) === -1) throw new Error(n + ' no está dado de alta en el calendario.');
  });

  const correos = correosMiembros_();
  const sinCorreo = unicos.filter(function (n) { return !correos[n]; });
  if (sinCorreo.length) {
    throw new Error('Falta el correo de: ' + sinCorreo.join(', ') +
      '. Tienen que darse de alta con su correo de Google para recibir su enlace.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    hojaSorteos_().appendRow([
      id_(), titulo, 'abierto',
      JSON.stringify({ titulo: titulo, tope: tope, participantes: unicos, asignaciones: [] }),
      new Date()
    ]);
  } finally {
    lock.releaseLock();
  }
  return sorteoPanel(persona);
}

/**
 * Sortea (o rehace) el sorteo y manda a cada participante su enlace privado por correo.
 * Solo se puede rehacer si nadie ha visto todavía su resultado.
 */
function sorteoSortear(persona, id) {
  soloOrganizador_(persona);
  const correos = correosMiembros_();
  const enviar = [];
  let datos = null;

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const s = buscarSorteo_(id);
    datos = s.datos;
    if ((datos.asignaciones || []).some(function (a) { return !!a.visto; })) {
      throw new Error('Alguien ya ha visto su resultado, así que ya no se puede rehacer el sorteo.');
    }

    const nombres = datos.participantes;
    const orden = ordenSinPuntosFijos_(nombres.length);

    datos.asignaciones = nombres.map(function (dador, i) {
      const token = Utilities.getUuid().replace(/-/g, '');
      enviar.push({ correo: correos[dador], dador: dador, token: token });
      return {
        dador: dador,
        hash: hashToken_(token),
        cifrado: cifrar_(nombres[orden[i]], token),
        visto: null
      };
    });
    datos.sorteadoEl = new Date().toISOString();
    guardarSorteo_(s.fila, datos, 'sorteado');
  } finally {
    lock.releaseLock();
  }

  // Los tokens solo existen aquí, en memoria, y van al correo: no se guardan en ningún sitio.
  const resultado = enviarCorreos_(enviar, datos.titulo, datos.tope);
  return {
    enviados: resultado.enviados,
    fallidos: resultado.fallidos,
    panel: sorteoPanel(persona)
  };
}


// ================= LLAMADAS DESDE EL ENLACE PRIVADO =================

/** Datos que se pueden mostrar antes de revelar el resultado. No incluye el receptor. */
function sorteoPrivado(token) {
  const r = buscarAsignacion_(limpiarToken_(token));
  return {
    titulo: r.sorteo.titulo,
    tope: r.sorteo.tope,
    dador: r.asig.dador,
    visto: !!r.asig.visto
  };
}

/** Descifra y devuelve a quién le toca regalar. Marca el resultado como visto. */
function sorteoRevelar(token) {
  const t = limpiarToken_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = buscarAsignacion_(t);
    if (!r.asig.visto) {
      r.asig.visto = new Date().toISOString();
      guardarSorteo_(r.fila, r.sorteo, r.estado);
    }
    return {
      titulo: r.sorteo.titulo,
      tope: r.sorteo.tope,
      dador: r.asig.dador,
      receptor: descifrar_(r.asig.cifrado, t)
    };
  } finally {
    lock.releaseLock();
  }
}


// ================= INTERNAS =================

function esOrganizador_(persona) {
  return !!CONFIG.ORGANIZADOR && String(persona || '').trim() === String(CONFIG.ORGANIZADOR).trim();
}

function soloOrganizador_(persona) {
  if (!esOrganizador_(persona)) throw new Error('Solo el organizador puede gestionar el amigo invisible.');
}

function hojaSorteos_() {
  const ss = getLibro_();
  let h = ss.getSheetByName(HOJA_SORTEOS);
  if (!h) {
    h = ss.insertSheet(HOJA_SORTEOS);
    h.appendRow(['Id', 'Título', 'Estado', 'Datos (no tocar)', 'Creado']);
    h.setFrozenRows(1);
  }
  return h;
}

function leerSorteos_() {
  const h = hojaSorteos_();
  if (h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, 4).getValues().map(function (r, i) {
    return { fila: i + 2, id: String(r[0]), estado: String(r[2]), datos: JSON.parse(r[3] || '{}') };
  });
}

function buscarSorteo_(id) {
  const s = leerSorteos_().filter(function (x) { return x.id === String(id || ''); })[0];
  if (!s) throw new Error('No encuentro este sorteo.');
  return s;
}

function guardarSorteo_(fila, datos, estado) {
  hojaSorteos_().getRange(fila, 3, 1, 2).setValues([[estado, JSON.stringify(datos)]]);
}

/** Busca la asignación de un token. Si el sorteo se rehizo, el token viejo ya no vale. */
function buscarAsignacion_(token) {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Este enlace no es válido.');
  const h = hashToken_(token);
  const s = leerSorteos_().filter(function (x) {
    return (x.datos.asignaciones || []).some(function (a) { return a.hash === h; });
  })[0];
  if (!s) throw new Error('Este enlace ya no vale. Si el sorteo se ha rehecho, usa el correo más reciente.');
  const asig = s.datos.asignaciones.filter(function (a) { return a.hash === h; })[0];
  return { fila: s.fila, estado: s.estado, sorteo: s.datos, asig: asig };
}

/** Correo de cada miembro dado de alta (la última alta gana). */
function correosMiembros_() {
  const mapa = {};
  const h = hojaAltas_();
  if (h.getLastRow() > 1) {
    h.getRange(2, 1, h.getLastRow() - 1, 4).getValues().forEach(function (r) {
      const nombre = String(r[1] || '').trim();
      const correo = String(r[2] || '').trim();
      const resultado = String(r[3] || '');
      if (nombre && correo && (resultado.indexOf('Añadido') === 0 || resultado.indexOf('Ya era') === 0)) {
        mapa[nombre] = correo;
      }
    });
  }
  return mapa;
}

function limpiarToken_(t) {
  return String(t || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32).toLowerCase();
}

function hashToken_(token) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
}

/**
 * Permutación aleatoria sin puntos fijos y en un único ciclo (algoritmo de Sattolo).
 * Devuelve p tal que la persona i regala a la persona p[i]. Nadie se regala a sí mismo.
 */
function ordenSinPuntosFijos_(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/** Flujo de bytes derivado del token (HMAC-SHA256 en bloques). */
function flujo_(longitud, clave) {
  const out = [];
  for (let i = 0; out.length < longitud; i++) {
    const bloque = Utilities.computeHmacSha256Signature('bloque' + i, clave);
    for (let j = 0; j < bloque.length && out.length < longitud; j++) out.push(bloque[j]);
  }
  return out;
}

/** Cifra un texto con una clave (el token). Devuelve base64. */
function cifrar_(texto, clave) {
  const bytes = Utilities.newBlob(String(texto), 'text/plain').getBytes();
  const ks = flujo_(bytes.length, clave);
  return Utilities.base64Encode(bytes.map(function (b, i) { return b ^ ks[i]; }));
}

function descifrar_(b64, clave) {
  const bytes = Utilities.base64Decode(b64);
  const ks = flujo_(bytes.length, clave);
  const plano = bytes.map(function (b, i) { return b ^ ks[i]; });
  return Utilities.newBlob(plano, 'text/plain').getDataAsString('UTF-8');
}

function enviarCorreos_(lista, titulo, tope) {
  const url = urlApp_();
  const fallidos = [];
  let enviados = 0;
  lista.forEach(function (x) {
    try {
      const enlace = url + '?s=' + x.token;
      const cuerpo = 'Hola ' + x.dador + ',\n\n' +
        'Ya está el sorteo "' + titulo + '".\n' +
        (tope ? 'Tu regalo puede costar entre 1 € y ' + eur_(tope) + '.\n' : '') +
        '\nEste es tu enlace privado. Ábrelo para ver a quién te toca:\n' + enlace +
        '\n\nNo lo compartas: es solo tuyo.';
      GmailApp.sendEmail(x.correo, '🎁 Tu amigo invisible: ' + titulo, cuerpo, { name: CONFIG.NOMBRE_GRUPO });
      enviados++;
    } catch (e) {
      Logger.log('No se pudo enviar a ' + x.dador + ': ' + e.message);
      fallidos.push(x.dador);
    }
  });
  return { enviados: enviados, fallidos: fallidos };
}
