/// <reference path="../pb_data/types.d.ts" />

// 4/9 — Colección "repuestos" (inventario).

migrate(
  (app) => {
    const LOGGED = '@request.auth.id != ""';
    const DUENO = '@request.auth.rol = "dueno"';
    const STAFF = `(${DUENO} || @request.auth.rol = "recepcion")`;

    const construir = (indexes) =>
      new Collection({
        type: "base",
        name: "repuestos",
        fields: [
          { type: "text", name: "nombre", required: true, max: 120 },
          { type: "text", name: "codigo", required: true, max: 40 },
          { type: "number", name: "precio_venta", required: true, min: 0 },
          { type: "number", name: "existencias", onlyInt: true, min: 0 },
          { type: "number", name: "stock_minimo", onlyInt: true, min: 0 },
          { type: "autodate", name: "created", onCreate: true },
          { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
        ],
        indexes,
        // Los mecánicos consultan el inventario pero no lo modifican: las existencias
        // solo bajan mediante el hook al usar un repuesto en una orden.
        listRule: LOGGED,
        viewRule: LOGGED,
        createRule: STAFF,
        updateRule: STAFF,
        deleteRule: DUENO,
      });

    const indices = [
      "CREATE UNIQUE INDEX idx_repuestos_codigo ON repuestos (codigo)",
      "CREATE INDEX idx_repuestos_nombre ON repuestos (nombre)",
    ];
    app.save(construir(indices));
  },

  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("repuestos"));
    } catch (_) {}
  }
);
