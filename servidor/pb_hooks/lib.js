// Funciones compartidas por los hooks. Se cargan con:
//   const lib = require(`${__hooks}/lib.js`);
// (los handlers de PocketBase no comparten variables globales, por eso se usa require)

const CAMPOS_TOTALES = ["total_mano_obra", "total_repuestos", "total", "pagado"];

function ahora() {
  // Formato de fecha que usa PocketBase: "2026-11-05 14:30:00.000Z"
  return new Date().toISOString().replace("T", " ");
}

function redondear(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function estaCerrada(estado) {
  return estado === "entregada" || estado === "cancelada";
}

// Garantiza valores únicos en el servidor (matrícula, código de repuesto), con un mensaje claro.
function exigirUnico(app, coleccion, campo, valor, idActual, mensaje) {
  let repetido = true;
  try {
    app.findFirstRecordByFilter(coleccion, `${campo} = {:v} && id != {:id}`, { v: valor, id: idActual || "" });
  } catch (_) {
    repetido = false; // no se encontró otro registro igual
  }
  if (repetido) throw new BadRequestError(mensaje);
}

function cargarOrden(app, id) {
  try {
    return app.findRecordById("ordenes", id);
  } catch (_) {
    throw new BadRequestError("La orden indicada no existe.");
  }
}

// Las órdenes entregadas o canceladas ya no admiten cambios en trabajos ni repuestos.
function exigirOrdenAbierta(app, ordenId) {
  const orden = cargarOrden(app, ordenId);
  if (estaCerrada(orden.getString("estado"))) {
    throw new BadRequestError(
      "La orden está " + (orden.getString("estado") === "entregada" ? "entregada" : "cancelada") + " y ya no admite cambios."
    );
  }
  return orden;
}

function exigirMecanico(app, userId) {
  let u;
  try {
    u = app.findRecordById("users", userId);
  } catch (_) {
    throw new BadRequestError("Debes asignar un mecánico válido a la orden.");
  }
  if (u.getString("rol") !== "mecanico") {
    throw new BadRequestError("La orden solo puede asignarse a un usuario con rol de mecánico.");
  }
}

// Recalcula mano de obra, repuestos, total y pagado de una orden.
function recalcular(app, ordenId) {
  let orden;
  try {
    orden = app.findRecordById("ordenes", ordenId);
  } catch (_) {
    return; // la orden se está eliminando
  }

  let manoObra = 0;
  let repuestos = 0;
  let pagado = 0;

  app.findAllRecords("trabajos", $dbx.hashExp({ orden: ordenId })).forEach((t) => {
    manoObra += t.getFloat("precio");
  });
  app.findAllRecords("orden_repuestos", $dbx.hashExp({ orden: ordenId })).forEach((r) => {
    repuestos += r.getInt("cantidad") * r.getFloat("precio_unitario");
  });
  app.findAllRecords("pagos", $dbx.hashExp({ orden: ordenId })).forEach((p) => {
    pagado += p.getFloat("monto");
  });

  orden.set("total_mano_obra", redondear(manoObra));
  orden.set("total_repuestos", redondear(repuestos));
  orden.set("total", redondear(manoObra + repuestos));
  orden.set("pagado", redondear(pagado));
  app.save(orden);
}

// Devuelve al inventario todos los repuestos de una orden (al cancelarla).
function devolverStockDeOrden(app, ordenId) {
  app.findAllRecords("orden_repuestos", $dbx.hashExp({ orden: ordenId })).forEach((linea) => {
    try {
      const rep = app.findRecordById("repuestos", linea.getString("repuesto"));
      rep.set("existencias", rep.getInt("existencias") + linea.getInt("cantidad"));
      app.save(rep);
    } catch (_) {}
  });
}

module.exports = {
  CAMPOS_TOTALES,
  ahora,
  redondear,
  estaCerrada,
  exigirUnico,
  cargarOrden,
  exigirOrdenAbierta,
  exigirMecanico,
  recalcular,
  devolverStockDeOrden,
};
