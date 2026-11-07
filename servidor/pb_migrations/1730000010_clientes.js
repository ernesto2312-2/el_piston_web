/// <reference path="../pb_data/types.d.ts" />

// 2/9 — Colección "clientes".

migrate(
  (app) => {
    const LOGGED = '@request.auth.id != ""';
    const DUENO = '@request.auth.rol = "dueno"';
    const STAFF = `(${DUENO} || @request.auth.rol = "recepcion")`;

    const construir = (indexes) =>
      new Collection({
        type: "base",
        name: "clientes",
        fields: [
          { type: "text", name: "nombre", required: true, max: 120 },
          { type: "text", name: "telefono", required: true, max: 30 },
          { type: "text", name: "direccion", max: 250 },
          { type: "autodate", name: "created", onCreate: true },
          { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
        ],
        indexes,
        // Lectura abierta a usuarios autenticados; la migración "reglas_mecanico"
        // la restringe después para que el mecánico solo vea a sus clientes.
        listRule: LOGGED,
        viewRule: LOGGED,
        createRule: STAFF,
        updateRule: STAFF,
        deleteRule: DUENO,
      });

    const indices = ["CREATE INDEX idx_clientes_nombre ON clientes (nombre)"];
    app.save(construir(indices));
  },

  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("clientes"));
    } catch (_) {}
  }
);
