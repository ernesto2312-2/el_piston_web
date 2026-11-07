/// <reference path="../pb_data/types.d.ts" />

// Reglas de negocio de las órdenes de servicio.

// ---- Crear -----------------------------------------------------------------
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);

  lib.exigirMecanico(e.app, e.record.getString("mecanico"));

  // Toda orden nace "recibida" y con los totales en cero, vengan lo que vengan en la petición.
  e.record.set("estado", "recibida");
  lib.CAMPOS_TOTALES.forEach((k) => e.record.set(k, 0));
  if (!e.record.getString("fecha_entrada")) {
    e.record.set("fecha_entrada", lib.ahora());
  }

  e.next();
}, "ordenes");

// Al registrar la orden, el kilometraje del vehículo se actualiza al más reciente.
onRecordCreateExecute((e) => {
  e.next();

  const km = e.record.getInt("kilometraje");
  if (km > 0) {
    const vehiculo = e.app.findRecordById("vehiculos", e.record.getString("vehiculo"));
    vehiculo.set("kilometraje", km);
    e.app.save(vehiculo);
  }
}, "ordenes");

// ---- Actualizar ------------------------------------------------------------
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const original = e.record.original();
  const antes = original.getString("estado");
  const despues = e.record.getString("estado");

  // Los totales los calculan los hooks: se ignora cualquier valor enviado.
  lib.CAMPOS_TOTALES.forEach((k) => e.record.set(k, original.get(k)));

  // Una orden entregada o cancelada es definitiva.
  if (lib.estaCerrada(antes) && despues !== antes) {
    throw new BadRequestError("No se puede cambiar el estado de una orden " + antes + ".");
  }

  if (despues !== antes) {
    if (despues === "entregada" && antes !== "lista") {
      throw new BadRequestError("Solo se puede entregar una orden que esté lista para entregar.");
    }
    if (despues === "cancelada" && original.getFloat("pagado") > 0) {
      throw new BadRequestError(
        "No se puede cancelar una orden con pagos registrados. El dueño debe eliminar los pagos primero."
      );
    }
  }

  // Si se reasigna, el nuevo responsable debe ser un mecánico.
  if (e.record.getString("mecanico") !== original.getString("mecanico")) {
    lib.exigirMecanico(e.app, e.record.getString("mecanico"));
  }

  // La recepción recibe y entrega: el progreso (estado intermedio y diagnóstico) es del mecánico.
  // Solo puede entregar una orden lista o cancelar.
  if (e.auth && e.auth.getString("rol") === "recepcion") {
    if (String(e.record.get("diagnostico")) !== String(original.get("diagnostico"))) {
      throw new ForbiddenError("El diagnóstico lo escribe el mecánico.");
    }
    if (despues !== antes && despues !== "entregada" && despues !== "cancelada") {
      throw new ForbiddenError("Recepción solo puede entregar o cancelar una orden. El progreso lo actualiza el mecánico.");
    }
  }

  // El mecánico solo avanza el estado y escribe el diagnóstico.
  if (e.auth && e.auth.getString("rol") === "mecanico") {
    const protegidos = ["vehiculo", "mecanico", "problema", "fecha_entrada", "kilometraje"];
    protegidos.forEach((campo) => {
      if (String(e.record.get(campo)) !== String(original.get(campo))) {
        throw new ForbiddenError("Un mecánico no puede modificar este dato de la orden (" + campo + ").");
      }
    });
    if (despues !== antes && !["en_diagnostico", "en_reparacion", "lista"].includes(despues)) {
      throw new ForbiddenError("Un mecánico solo puede marcar la orden en diagnóstico, en reparación o lista.");
    }
  }

  e.next();
}, "ordenes");

// Si la orden se cancela, los repuestos usados vuelven al inventario.
onRecordUpdateExecute((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const antes = e.record.original().getString("estado");
  e.next();
  if (antes !== "cancelada" && e.record.getString("estado") === "cancelada") {
    lib.devolverStockDeOrden(e.app, e.record.id);
  }
}, "ordenes");
