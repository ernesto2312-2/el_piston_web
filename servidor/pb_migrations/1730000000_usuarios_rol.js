/// <reference path="../pb_data/types.d.ts" />

// 1/9 — Usuarios: campo "rol" y reglas de acceso de la colección users.
// Las migraciones se ejecutan en orden por el número del nombre del archivo.

migrate(
  (app) => {
    const LOGGED = '@request.auth.id != ""';
    const DUENO = '@request.auth.rol = "dueno"';

    const settings = app.settings();
    settings.meta.appName = "Taller El Pistón";
    app.save(settings);

    const users = app.findCollectionByNameOrId("users");
    users.fields.add(
      new SelectField({
        name: "rol",
        required: true,
        maxSelect: 1,
        values: ["dueno", "recepcion", "mecanico"],
      })
    );
    // Todos los usuarios autenticados ven nombre y rol (para asignar mecánicos).
    users.listRule = LOGGED;
    users.viewRule = LOGGED;
    // Solo el dueño crea y borra usuarios; cada uno edita su perfil pero no su rol.
    users.createRule = DUENO;
    users.updateRule = `${DUENO} || (id = @request.auth.id && @request.body.rol:isset = false)`;
    users.deleteRule = DUENO;
    app.save(users);
  },

  (app) => {
    try {
      const users = app.findCollectionByNameOrId("users");
      users.fields.removeByName("rol");
      users.listRule = "id = @request.auth.id";
      users.viewRule = "id = @request.auth.id";
      users.createRule = "";
      users.updateRule = "id = @request.auth.id";
      users.deleteRule = "id = @request.auth.id";
      app.save(users);
    } catch (_) {}
  }
);
