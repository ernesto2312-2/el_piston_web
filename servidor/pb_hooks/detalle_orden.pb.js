/// <reference path="../pb_data/types.d.ts" />

// Trabajos (mano de obra) y repuestos usados dentro de una orden.

// ---- Validaciones comunes a trabajos y orden_repuestos ----------------------
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  lib.exigirOrdenAbierta(e.app, e.record.getString("orden"));
  e.next();
}, "trabajos", "orden_repuestos");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const original = e.record.original();
  if (e.record.getString("orden") !== original.getString("orden")) {
    throw new BadRequestError("No se puede mover un registro a otra orden.");
  }
  lib.exigirOrdenAbierta(e.app, original.getString("orden"));
  e.next();
}, "trabajos");

onRecordDeleteRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  lib.exigirOrdenAbierta(e.app, e.record.getString("orden"));
  e.next();
}, "trabajos", "orden_repuestos");

// ---- Trabajos: recalcular totales -------------------------------------------
onRecordCreateExecute((e) => {
  const lib = require(`${__hooks}/lib.js`);
  e.next();
  lib.recalcular(e.app, e.record.getString("orden"));
}, "trabajos");

onRecordUpdateExecute((e) => {
  const lib = require(`${__hooks}/lib.js`);
  e.next();
  lib.recalcular(e.app, e.record.getString("orden"));
}, "trabajos");

onRecordDeleteExecute((e) => {
  const lib = require(`${__hooks}/lib.js`);
  e.next();
  lib.recalcular(e.app, e.record.getString("orden"));
}, "trabajos");

// ---- Repuestos usados: precio, existencias y totales -------------------------
onRecordCreateRequest((e) => {
  let repuesto;
  try {
    repuesto = e.app.findRecordById("repuestos", e.record.getString("repuesto"));
  } catch (_) {
    throw new BadRequestError("El repuesto indicado no existe.");
  }

  const cantidad = e.record.getInt("cantidad");
  const disponibles = repuesto.getInt("existencias");
  if (cantidad > disponibles) {
    throw new BadRequestError(
      'No hay existencias suficientes de "' + repuesto.getString("nombre") + '". Disponibles: ' + disponibles + "."
    );
  }

  // El precio se congela al usar el repuesto: si luego sube, las órdenes viejas no cambian.
  e.record.set("precio_unitario", repuesto.getFloat("precio_venta"));
  e.next();
}, "orden_repuestos");

onRecordCreateExecute((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const repuesto = e.app.findRecordById("repuestos", e.record.getString("repuesto"));
  const cantidad = e.record.getInt("cantidad");

  // Se vuelve a comprobar dentro de la transacción por si dos personas usan el último repuesto a la vez.
  if (repuesto.getInt("existencias") < cantidad) {
    throw new BadRequestError("Las existencias cambiaron mientras se guardaba. Intenta de nuevo.");
  }

  e.next();

  repuesto.set("existencias", repuesto.getInt("existencias") - cantidad);
  e.app.save(repuesto);
  lib.recalcular(e.app, e.record.getString("orden"));
}, "orden_repuestos");

onRecordDeleteExecute((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const ordenId = e.record.getString("orden");

  // Si la orden fue cancelada, su stock ya se devolvió al cancelarla.
  let cancelada = false;
  try {
    cancelada = e.app.findRecordById("ordenes", ordenId).getString("estado") === "cancelada";
  } catch (_) {}

  e.next();

  if (!cancelada) {
    try {
      const repuesto = e.app.findRecordById("repuestos", e.record.getString("repuesto"));
      repuesto.set("existencias", repuesto.getInt("existencias") + e.record.getInt("cantidad"));
      e.app.save(repuesto);
    } catch (_) {}
  }
  lib.recalcular(e.app, ordenId);
}, "orden_repuestos");
