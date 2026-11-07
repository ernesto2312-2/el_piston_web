/// <reference path="../pb_data/types.d.ts" />

// 7/9 — Colección "orden_repuestos" (repuestos usados en cada orden).

migrate(
  (app) => {
    const DUENO = '@request.auth.rol = "dueno"';
    const STAFF = `(${DUENO} || @request.auth.rol = "recepcion")`;
    const ordenes = app.findCollectionByNameOrId("ordenes");
    const repuestos = app.findCollectionByNameOrId("repuestos");

    const construir = (indexes) =>
      new Collection({
        type: "base",
        name: "orden_repuestos",
        fields: [
          { type: "relation", name: "orden", required: true, collectionId: ordenes.id, maxSelect: 1, cascadeDelete: true },
          { type: "relation", name: "repuesto", required: true, collectionId: repuestos.id, maxSelect: 1, cascadeDelete: false },
          { type: "number", name: "cantidad", required: true, onlyInt: true, min: 1 },
          // Se copia del inventario al usar el repuesto (lo pone el hook)
          { type: "number", name: "precio_unitario", min: 0 },
          { type: "autodate", name: "created", onCreate: true },
          { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
        ],
        indexes,
        listRule: `${STAFF} || orden.mecanico = @request.auth.id`,
        viewRule: `${STAFF} || orden.mecanico = @request.auth.id`,
        createRule: `${STAFF} || @request.body.orden.mecanico = @request.auth.id`,
        updateRule: null, // para corregir: eliminar y volver a agregar (así el stock siempre cuadra)
        deleteRule: `${STAFF} || orden.mecanico = @request.auth.id`,
      });

    const indices = [
      "CREATE INDEX idx_orden_repuestos_orden ON orden_repuestos (orden)",
      "CREATE INDEX idx_orden_repuestos_repuesto ON orden_repuestos (repuesto)",
    ];
    app.save(construir(indices));
  },

  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("orden_repuestos"));
    } catch (_) {}
  }
);
