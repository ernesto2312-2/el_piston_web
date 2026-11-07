/// <reference path="../pb_data/types.d.ts" />

// 9/9 — Restringe a los mecánicos la lectura de clientes y vehículos: solo ven los de las
// órdenes que tienen asignadas. Se hace al final porque las reglas usan relaciones inversas
// ("vehiculos_via_cliente", "ordenes_via_vehiculo") y esas colecciones deben existir ya.
//
// Es un refuerzo opcional: si PocketBase rechazara estas reglas, se registra un aviso y el
// sistema sigue funcionando con la lectura abierta a cualquier usuario autenticado.

migrate(
  (app) => {
    const STAFF = '(@request.auth.rol = "dueno" || @request.auth.rol = "recepcion")';

    const aplicar = (nombre, regla) => {
      try {
        const c = app.findCollectionByNameOrId(nombre);
        c.listRule = regla;
        c.viewRule = regla;
        app.save(c);
      } catch (err) {
        console.log(`[migración] no se pudo restringir la lectura de ${nombre} para mecánicos: ${err}`);
      }
    };

    aplicar("clientes", `${STAFF} || vehiculos_via_cliente.ordenes_via_vehiculo.mecanico ?= @request.auth.id`);
    aplicar("vehiculos", `${STAFF} || ordenes_via_vehiculo.mecanico ?= @request.auth.id`);
  },

  (app) => {
    ["clientes", "vehiculos"].forEach((nombre) => {
      try {
        const c = app.findCollectionByNameOrId(nombre);
        c.listRule = '@request.auth.id != ""';
        c.viewRule = '@request.auth.id != ""';
        app.save(c);
      } catch (_) {}
    });
  }
);
