/// <reference path="../pb_data/types.d.ts" />

// 5/9 — Colección "ordenes" (órdenes de servicio).

migrate(
  (app) => {
    const DUENO = '@request.auth.rol = "dueno"';
    const STAFF = `(${DUENO} || @request.auth.rol = "recepcion")`;
    const vehiculos = app.findCollectionByNameOrId("vehiculos");
    const users = app.findCollectionByNameOrId("users");

    const construir = (indexes) =>
      new Collection({
        type: "base",
        name: "ordenes",
        fields: [
          { type: "relation", name: "vehiculo", required: true, collectionId: vehiculos.id, maxSelect: 1, cascadeDelete: false },
          { type: "relation", name: "mecanico", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
          { type: "date", name: "fecha_entrada", required: true },
          { type: "text", name: "problema", required: true, max: 2000 },
          { type: "text", name: "diagnostico", max: 2000 },
          { type: "number", name: "kilometraje", onlyInt: true, min: 0 },
          { type: "select",
            name: "estado",
            required: true,
            maxSelect: 1,
            values: ["recibida", "en_diagnostico", "en_reparacion", "lista", "entregada", "cancelada"],
          },
          // Totales calculados por los hooks (el cliente no puede modificarlos)
          { type: "number", name: "total_mano_obra", min: 0 },
          { type: "number", name: "total_repuestos", min: 0 },
          { type: "number", name: "total", min: 0 },
          { type: "number", name: "pagado", min: 0 },
          { type: "autodate", name: "created", onCreate: true },
          { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
        ],
        indexes,
        // El mecánico solo ve y actualiza las órdenes que tiene asignadas.
        // Qué campos puede tocar lo valida el hook (pb_hooks/ordenes.pb.js).
        listRule: `${STAFF} || mecanico = @request.auth.id`,
        viewRule: `${STAFF} || mecanico = @request.auth.id`,
        createRule: STAFF,
        updateRule: `${STAFF} || mecanico = @request.auth.id`,
        deleteRule: DUENO,
      });

    const indices = [
      "CREATE INDEX idx_ordenes_estado ON ordenes (estado)",
      "CREATE INDEX idx_ordenes_mecanico ON ordenes (mecanico)",
      "CREATE INDEX idx_ordenes_vehiculo ON ordenes (vehiculo)",
      "CREATE INDEX idx_ordenes_fecha ON ordenes (fecha_entrada)",
    ];
    app.save(construir(indices));
  },

  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("ordenes"));
    } catch (_) {}
  }
);
