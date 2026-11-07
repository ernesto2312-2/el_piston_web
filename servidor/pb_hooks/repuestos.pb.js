/// <reference path="../pb_data/types.d.ts" />

// El código de un repuesto se guarda en mayúsculas y no puede repetirse.

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const codigo = e.record.getString("codigo").replace(/\s+/g, "").toUpperCase();
  e.record.set("codigo", codigo);
  lib.exigirUnico(e.app, "repuestos", "codigo", codigo, "", `Ya existe un repuesto con el código ${codigo}.`);
  e.next();
}, "repuestos");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const codigo = e.record.getString("codigo").replace(/\s+/g, "").toUpperCase();
  e.record.set("codigo", codigo);
  lib.exigirUnico(e.app, "repuestos", "codigo", codigo, e.record.id, `Ya existe un repuesto con el código ${codigo}.`);
  e.next();
}, "repuestos");
