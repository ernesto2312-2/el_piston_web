/// <reference path="../pb_data/types.d.ts" />

// 6/9 — Colección "trabajos" (mano de obra de cada orden).

migrate(
  (app) => {
    const DUENO = '@request.auth.rol = "dueno"';
    const STAFF = `(${DUENO} || @request.auth.rol = "recepcion")`;
    const ordenes = app.findCollectionByNameOrId("ordenes");

    const construir = (indexes) =>
      new Collection({
        type: "base",
        name: "trabajos",
        fields: [
          { type: "relation", name: "orden", required: true, collectionId: ordenes.id, maxSelect: 1, cascadeDelete: true },
          { type: "text", name: "descripcion", required: true, max: 300 },
          { type: "number", name: "precio", min: 0 },
          { type: "autodate", name: "created", onCreate: true },
          { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
        ],
        indexes,
        listRule: `${STAFF} || orden.mecanico = @request.auth.id`,
        viewRule: `${STAFF} || orden.mecanico = @request.auth.id`,
        createRule: `${STAFF} || @request.body.orden.mecanico = @request.auth.id`,
        updateRule: `${STAFF} || orden.mecanico = @request.auth.id`,
        deleteRule: `${STAFF} || orden.mecanico = @request.auth.id`,
      });

    const indices = ["CREATE INDEX idx_trabajos_orden ON trabajos (orden)"];
    app.save(construir(indices));
  },

  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("trabajos"));
    } catch (_) {}
  }
);
