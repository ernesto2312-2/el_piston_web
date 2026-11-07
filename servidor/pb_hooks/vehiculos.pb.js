/// <reference path="../pb_data/types.d.ts" />

// Normaliza la matrícula (mayúsculas, sin espacios) y evita duplicados, para que
// "p 123456" y "P123456" no se registren como vehículos distintos.

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const matricula = e.record.getString("matricula").replace(/\s+/g, "").toUpperCase();
  e.record.set("matricula", matricula);
  lib.exigirUnico(e.app, "vehiculos", "matricula", matricula, "", `Ya existe un vehículo con la matrícula ${matricula}.`);
  e.next();
}, "vehiculos");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const matricula = e.record.getString("matricula").replace(/\s+/g, "").toUpperCase();
  e.record.set("matricula", matricula);
  lib.exigirUnico(e.app, "vehiculos", "matricula", matricula, e.record.id, `Ya existe un vehículo con la matrícula ${matricula}.`);
  e.next();
}, "vehiculos");
