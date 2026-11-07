/// <reference path="../pb_data/types.d.ts" />

// 8/9 — Colección "pagos".

migrate(
  (app) => {
    const DUENO = '@request.auth.rol = "dueno"';
    const STAFF = `(${DUENO} || @request.auth.rol = "recepcion")`;
    const ordenes = app.findCollectionByNameOrId("ordenes");
    const users = app.findCollectionByNameOrId("users");

    const construir = (indexes) =>
      new Collection({
        type: "base",
        name: "pagos",
        fields: [
          { type: "relation", name: "orden", required: true, collectionId: ordenes.id, maxSelect: 1, cascadeDelete: false },
          { type: "number", name: "monto", required: true, min: 0.01 },
          { type: "date", name: "fecha" },
          { type: "select",
            name: "metodo",
            required: true,
            maxSelect: 1,
            values: ["efectivo", "transferencia", "tarjeta"],
          },
          { type: "text", name: "nota", max: 300 },
          { type: "relation", name: "registrado_por", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
          { type: "autodate", name: "created", onCreate: true },
          { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
        ],
        indexes,
        // Los mecánicos no ven dinero cobrado.
        listRule: STAFF,
        viewRule: STAFF,
        createRule: STAFF,
        updateRule: null, // un pago mal registrado lo elimina el dueño y se vuelve a registrar
        deleteRule: DUENO,
      });

    const indices = [
      "CREATE INDEX idx_pagos_orden ON pagos (orden)",
      "CREATE INDEX idx_pagos_fecha ON pagos (fecha)",
    ];
    app.save(construir(indices));
  },

  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("pagos"));
    } catch (_) {}
  }
);
