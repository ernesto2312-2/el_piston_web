/// <reference path="../pb_data/types.d.ts" />

// Reparto de responsabilidades por rol (no cambia la estructura, solo las reglas de acceso):
//
//  - Mecánico: anota los trabajos y los repuestos usados, y solo en las órdenes que tiene asignadas.
//  - Recepción: recibe las órdenes y entrega los vehículos. Ve el progreso, pero no lo modifica.
//  - Dueño: ve y puede hacerlo todo (también corrige trabajos y repuestos si hace falta).
//  - Inventario: solo el dueño lo gestiona; los demás lo consultan.

migrate(
  (app) => {
    const DUENO = '@request.auth.rol = "dueno"';
    const STAFF = '(@request.auth.rol = "dueno" || @request.auth.rol = "recepcion")';
    const SUYA = "orden.mecanico = @request.auth.id";

    const aplicar = (nombre, reglas) => {
      const c = app.findCollectionByNameOrId(nombre);
      Object.keys(reglas).forEach((k) => {
        c[k] = reglas[k];
      });
      app.save(c);
    };

    // Trabajos y repuestos usados: solo el mecánico de la orden o el dueño escriben.
    // La recepción los puede leer (necesita ver el total para entregar y cobrar).
    aplicar("trabajos", {
      listRule: `${STAFF} || ${SUYA}`,
      viewRule: `${STAFF} || ${SUYA}`,
      createRule: `${DUENO} || @request.body.orden.mecanico = @request.auth.id`,
      updateRule: `${DUENO} || ${SUYA}`,
      deleteRule: `${DUENO} || ${SUYA}`,
    });
    aplicar("orden_repuestos", {
      listRule: `${STAFF} || ${SUYA}`,
      viewRule: `${STAFF} || ${SUYA}`,
      createRule: `${DUENO} || @request.body.orden.mecanico = @request.auth.id`,
      updateRule: null,
      deleteRule: `${DUENO} || ${SUYA}`,
    });

    // Inventario: lectura para todos (hace falta para mostrar los nombres en las órdenes),
    // altas, cambios y compras solo del dueño. Las existencias bajan por el hook al usar un repuesto.
    aplicar("repuestos", {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: DUENO,
      updateRule: DUENO,
      deleteRule: DUENO,
    });
  },

  (app) => {
    const DUENO = '@request.auth.rol = "dueno"';
    const STAFF = '(@request.auth.rol = "dueno" || @request.auth.rol = "recepcion")';
    const SUYA = "orden.mecanico = @request.auth.id";

    const aplicar = (nombre, reglas) => {
      const c = app.findCollectionByNameOrId(nombre);
      Object.keys(reglas).forEach((k) => {
        c[k] = reglas[k];
      });
      app.save(c);
    };

    aplicar("trabajos", {
      createRule: `${STAFF} || @request.body.orden.mecanico = @request.auth.id`,
      updateRule: `${STAFF} || ${SUYA}`,
      deleteRule: `${STAFF} || ${SUYA}`,
    });
    aplicar("orden_repuestos", {
      createRule: `${STAFF} || @request.body.orden.mecanico = @request.auth.id`,
      deleteRule: `${STAFF} || ${SUYA}`,
    });
    aplicar("repuestos", { createRule: STAFF, updateRule: STAFF, deleteRule: DUENO });
  }
);
