/// <reference path="../pb_data/types.d.ts" />

// Pagos: validan que no se cobre de más y mantienen el "pagado" de la orden.

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const orden = lib.cargarOrden(e.app, e.record.getString("orden"));

  if (orden.getString("estado") === "cancelada") {
    throw new BadRequestError("No se pueden registrar pagos en una orden cancelada.");
  }

  const monto = e.record.getFloat("monto");
  const pendiente = lib.redondear(orden.getFloat("total") - orden.getFloat("pagado"));
  if (monto > pendiente + 0.001) {
    throw new BadRequestError("El pago (" + monto + ") supera el saldo pendiente de la orden (" + pendiente + ").");
  }

  if (!e.record.getString("fecha")) {
    e.record.set("fecha", lib.ahora());
  }
  if (e.auth) {
    e.record.set("registrado_por", e.auth.id);
  }

  e.next();
}, "pagos");

onRecordCreateExecute((e) => {
  const lib = require(`${__hooks}/lib.js`);
  e.next();
  lib.recalcular(e.app, e.record.getString("orden"));
}, "pagos");

onRecordDeleteExecute((e) => {
  const lib = require(`${__hooks}/lib.js`);
  e.next();
  lib.recalcular(e.app, e.record.getString("orden"));
}, "pagos");
