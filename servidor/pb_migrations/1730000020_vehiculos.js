/// <reference path="../pb_data/types.d.ts" />

// 3/9 — Colección "vehiculos" (un cliente puede tener varios).

migrate(
  (app) => {
    const LOGGED = '@request.auth.id != ""';
    const DUENO = '@request.auth.rol = "dueno"';
    const STAFF = `(${DUENO} || @request.auth.rol = "recepcion")`;
    const clientes = app.findCollectionByNameOrId("clientes");

    const construir = (indexes) =>
      new Collection({
        type: "base",
        name: "vehiculos",
        fields: [
          { type: "relation",
            name: "cliente",
            required: true,
            collectionId: clientes.id,
            maxSelect: 1,
            cascadeDelete: false, // no se puede borrar un cliente que tiene vehículos
          },
          { type: "text", name: "matricula", required: true, max: 20 },
          { type: "text", name: "marca", required: true, max: 60 },
          { type: "text", name: "modelo", required: true, max: 60 },
          { type: "number", name: "anio", required: true, onlyInt: true, min: 1900, max: 2100 },
          { type: "number", name: "kilometraje", onlyInt: true, min: 0 },
          { type: "autodate", name: "created", onCreate: true },
          { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
        ],
        indexes,
        listRule: LOGGED, // se restringe para el mecánico en "reglas_mecanico"
        viewRule: LOGGED,
        createRule: STAFF,
        updateRule: STAFF,
        deleteRule: DUENO,
      });

    const indices = [
      "CREATE UNIQUE INDEX idx_vehiculos_matricula ON vehiculos (matricula)",
      "CREATE INDEX idx_vehiculos_cliente ON vehiculos (cliente)",
    ];
    app.save(construir(indices));
  },

  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("vehiculos"));
    } catch (_) {}
  }
);
