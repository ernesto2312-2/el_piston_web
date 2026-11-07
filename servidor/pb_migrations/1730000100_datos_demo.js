/// <reference path="../pb_data/types.d.ts" />

// Datos de prueba: 4 usuarios (dueño, recepcionista y dos mecánicos),
// algunos clientes, vehículos y repuestos.
// IMPORTANTE: en un taller real, borra este archivo antes del primer arranque
// y crea los usuarios desde el panel de administración.

migrate(
  (app) => {
    // --- Usuarios -------------------------------------------------------
    const users = app.findCollectionByNameOrId("users");
    const PASSWORD = "Piston2026!";

    [
      { email: "dueno@elpiston.test", name: "Dueño", rol: "dueno" },
      { email: "recepcion@elpiston.test", name: "Recepcionista", rol: "recepcion" },
      { email: "mecanico1@elpiston.test", name: "Mecánico 1", rol: "mecanico" },
      { email: "mecanico2@elpiston.test", name: "Mecánico 2", rol: "mecanico" },
    ].forEach((u) => {
      const r = new Record(users);
      r.set("email", u.email);
      r.set("emailVisibility", true);
      r.set("verified", true);
      r.set("name", u.name);
      r.set("rol", u.rol);
      r.setPassword(PASSWORD);
      app.save(r);
    });

    // --- Clientes y vehículos --------------------------------------------
    const clientes = app.findCollectionByNameOrId("clientes");
    const vehiculos = app.findCollectionByNameOrId("vehiculos");

    const nuevoCliente = (nombre, telefono, direccion) => {
      const r = new Record(clientes);
      r.set("nombre", nombre);
      r.set("telefono", telefono);
      r.set("direccion", direccion);
      app.save(r);
      return r;
    };

    const nuevoVehiculo = (cliente, matricula, marca, modelo, anio, km) => {
      const r = new Record(vehiculos);
      r.set("cliente", cliente.id);
      r.set("matricula", matricula);
      r.set("marca", marca);
      r.set("modelo", modelo);
      r.set("anio", anio);
      r.set("kilometraje", km);
      app.save(r);
    };

    const c1 = nuevoCliente("Carlos Pérez", "52345678", "Calle Martí #120, Pinar del Río");
    const c2 = nuevoCliente("María González", "53456789", "");
    const c3 = nuevoCliente("Luis Fernández", "54567890", "Reparto Hermanos Cruz");

    nuevoVehiculo(c1, "P123456", "Peugeot", "206", 2005, 148000);
    nuevoVehiculo(c1, "P234567", "Lada", "2107", 1995, 210500);
    nuevoVehiculo(c2, "B345678", "Hyundai", "Accent", 2012, 96000);
    nuevoVehiculo(c3, "P456789", "Toyota", "Corolla", 2008, 175300);

    // --- Repuestos ----------------------------------------------------------
    const repuestos = app.findCollectionByNameOrId("repuestos");
    [
      ["Filtro de aceite", "FIL-ACE-01", 8, 25, 5],
      ["Filtro de aire", "FIL-AIR-01", 12, 15, 5],
      ["Aceite de motor 10W40 (litro)", "ACE-1040", 6, 40, 10],
      ["Pastillas de freno delanteras", "FRE-PAS-D", 35, 8, 4],
      ["Bujía", "BUJ-001", 4, 30, 8],
      ["Correa de distribución", "COR-DIS-01", 45, 3, 3], // en el límite: aparece en alertas
      ["Batería 12V 45Ah", "BAT-45", 90, 2, 2], // en el límite
      ["Líquido de frenos (500 ml)", "LIQ-FRE", 7, 12, 4],
      ["Amortiguador delantero", "AMO-DEL", 60, 1, 2], // por debajo del mínimo
      ["Lámpara de faro H4", "LAM-H4", 5, 18, 6],
    ].forEach(([nombre, codigo, precio, existencias, minimo]) => {
      const r = new Record(repuestos);
      r.set("nombre", nombre);
      r.set("codigo", codigo);
      r.set("precio_venta", precio);
      r.set("existencias", existencias);
      r.set("stock_minimo", minimo);
      app.save(r);
    });
  },

  (app) => {
    ["pagos", "orden_repuestos", "trabajos", "ordenes"].forEach((name) => {
      try {
        app.truncateCollection(app.findCollectionByNameOrId(name));
      } catch (_) {}
    });
    ["vehiculos", "clientes", "repuestos"].forEach((name) => {
      try {
        app.truncateCollection(app.findCollectionByNameOrId(name));
      } catch (_) {}
    });
    [
      "dueno@elpiston.test",
      "recepcion@elpiston.test",
      "mecanico1@elpiston.test",
      "mecanico2@elpiston.test",
    ].forEach((email) => {
      try {
        app.delete(app.findAuthRecordByEmail("users", email));
      } catch (_) {}
    });
  }
);
