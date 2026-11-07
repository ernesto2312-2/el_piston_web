// Formularios en ventana modal: un generador común y los de cliente y vehículo.

import { pb, mensajeError } from "./api.js";
import { esc, abrirModal, conBoton } from "./ui.js";

function htmlCampo(c, valores) {
  const id = `f-${c.name}`;
  const valor = valores[c.name] ?? c.valor ?? "";
  const comunes = `id="${id}" name="${esc(c.name)}"${c.requerido ? " required" : ""}${c.max && c.tipo !== "number" && c.tipo !== "textarea" ? ` maxlength="${c.max}"` : ""}${
    c.placeholder ? ` placeholder="${esc(c.placeholder)}"` : ""
  }`;
  let control;
  if (c.tipo === "select") {
    control = `<select ${comunes}>${(c.opciones || [])
      .map((o) => `<option value="${esc(o.valor)}"${String(o.valor) === String(valor) ? " selected" : ""}>${esc(o.texto)}</option>`)
      .join("")}</select>`;
  } else if (c.tipo === "textarea") {
    control = `<textarea ${comunes} rows="3"${c.max ? ` maxlength="${c.max}"` : ""}>${esc(valor)}</textarea>`;
  } else {
    const tipo = c.tipo || "text";
    const num = tipo === "number";
    control = `<input ${comunes} type="${tipo}" value="${esc(valor)}" autocomplete="off"${
      num ? ` inputmode="decimal" min="${c.min ?? 0}"${c.maxNum !== undefined ? ` max="${c.maxNum}"` : ""} step="${c.paso ?? 1}"` : ""
    }${c.lista ? ` list="${id}-lista"` : ""} />${
      c.lista ? `<datalist id="${id}-lista">${c.lista.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>` : ""
    }`;
  }
  return `<div class="campo"><label for="${id}">${esc(c.label)}${c.requerido ? "" : " <small>(opcional)</small>"}</label>${control}${
    c.ayuda ? `<span class="ayuda">${esc(c.ayuda)}</span>` : ""
  }</div>`;
}

/**
 * Abre un formulario modal. `enviar(datos)` hace la llamada al servidor y devuelve el resultado.
 * Si lanza un error, se muestra dentro del formulario y la ventana sigue abierta.
 * La promesa devuelve el resultado de `enviar`, o null si el usuario cancela.
 */
export function formularioModal({ titulo, campos, valores = {}, textoBoton = "Guardar", enviar, ancho, nota = "" }) {
  return new Promise((resolver) => {
    let resultado = null;
    const { cuerpo, cerrar } = abrirModal(
      titulo,
      `<form novalidate>
        ${nota ? `<p class="ayuda" style="margin-bottom:12px">${esc(nota)}</p>` : ""}
        <div class="error-form" role="alert" hidden></div>
        ${campos.map((c) => htmlCampo(c, valores)).join("")}
        <div class="modal-acciones">
          <button type="button" class="btn btn-ghost" data-cancelar>Cancelar</button>
          <button type="submit" class="btn btn-primario">${esc(textoBoton)}</button>
        </div>
      </form>`,
      { ancho, alCerrar: () => resolver(resultado) }
    );

    const form = cuerpo.querySelector("form");
    const caja = cuerpo.querySelector(".error-form");
    cuerpo.querySelector("[data-cancelar]").addEventListener("click", cerrar);

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      caja.hidden = true;
      if (!form.reportValidity()) return;

      const datos = {};
      campos.forEach((c) => {
        const crudo = form.elements[c.name].value;
        if (c.tipo === "number") datos[c.name] = crudo === "" ? null : Number(crudo);
        else datos[c.name] = crudo.trim();
      });

      await conBoton(form.querySelector('[type="submit"]'), async () => {
        try {
          resultado = await enviar(datos);
          cerrar();
        } catch (err) {
          caja.textContent = mensajeError(err);
          caja.hidden = false;
        }
      });
    });
  });
}

// ---- Cliente ----------------------------------------------------------------
export function abrirFormCliente(cliente = null) {
  return formularioModal({
    titulo: cliente ? "Editar cliente" : "Nuevo cliente",
    valores: cliente || {},
    campos: [
      { name: "nombre", label: "Nombre", requerido: true, max: 120 },
      { name: "telefono", label: "Teléfono", tipo: "tel", requerido: true, max: 30 },
      { name: "direccion", label: "Dirección", max: 250 },
    ],
    enviar: (d) => (cliente ? pb.collection("clientes").update(cliente.id, d) : pb.collection("clientes").create(d)),
  });
}

// ---- Vehículo ---------------------------------------------------------------
export function abrirFormVehiculo(clienteId, vehiculo = null) {
  const anioMax = new Date().getFullYear() + 1;
  return formularioModal({
    titulo: vehiculo ? "Editar vehículo" : "Nuevo vehículo",
    valores: vehiculo || {},
    campos: [
      { name: "matricula", label: "Matrícula", requerido: true, max: 20, ayuda: "Se guarda en mayúsculas y sin espacios." },
      { name: "marca", label: "Marca", requerido: true, max: 60 },
      { name: "modelo", label: "Modelo", requerido: true, max: 60 },
      { name: "anio", label: "Año", tipo: "number", requerido: true, min: 1900, maxNum: anioMax },
      { name: "kilometraje", label: "Kilometraje actual", tipo: "number", min: 0 },
    ],
    enviar: (d) =>
      vehiculo
        ? pb.collection("vehiculos").update(vehiculo.id, d)
        : pb.collection("vehiculos").create({ ...d, cliente: clienteId }),
  });
}
