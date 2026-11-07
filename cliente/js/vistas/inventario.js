// Inventario de repuestos. Lo gestiona el dueño; los mecánicos solo lo consultan.
// Las existencias bajan solas cuando un repuesto se usa en una orden (hook del servidor).

import { pb, esDueno, dinero, mensajeError } from "../api.js";
import { esc, vacio, cargando, toast, confirmar } from "../ui.js";
import { cajaBusqueda } from "../componentes.js";
import { formularioModal } from "../formularios.js";

const nivel = (r) => (r.existencias <= 0 ? "cero" : r.existencias <= r.stock_minimo ? "bajo" : "ok");

export default async function inventario(cont, { consulta }) {
  const dueno = esDueno();
  const staff = dueno; // solo el dueño da de alta, edita y repone el inventario
  let vista = consulta.get("bajos") ? "bajos" : "todos";
  let q = "";
  let repuestos = [];

  cont.innerHTML = `
    <div class="pantalla-cab">
      <div><h1>Inventario</h1><p id="contador">&nbsp;</p></div>
      ${staff ? `<button type="button" class="btn btn-primario" data-accion="nuevo">+ Nuevo repuesto</button>` : ""}
    </div>
    ${cajaBusqueda("buscar", "Nombre o código")}
    <div class="chips" id="chips" role="group" aria-label="Filtrar inventario" style="margin-top:10px"></div>
    <div id="lista"></div>`;

  const lista = cont.querySelector("#lista");
  const chips = cont.querySelector("#chips");
  lista.innerHTML = cargando();

  async function cargar() {
    try {
      repuestos = await pb.collection("repuestos").getFullList({ sort: "nombre" });
    } catch (err) {
      lista.innerHTML = vacio(mensajeError(err, "No se pudo cargar el inventario."), "⚠");
      return false;
    }
    return true;
  }

  function pintar() {
    const bajos = repuestos.filter((r) => nivel(r) !== "ok");
    const agotados = repuestos.filter((r) => nivel(r) === "cero");
    const opciones = [
      ["todos", "Todos", repuestos.length],
      ["bajos", "Por agotarse", bajos.length],
      ["agotados", "Agotados", agotados.length],
    ];
    chips.innerHTML = opciones
      .map(([id, texto, n]) => `<button type="button" class="chip" data-vista="${id}" aria-pressed="${id === vista}">${texto}<b>${n}</b></button>`)
      .join("");

    const t = q.toLowerCase();
    let visibles = vista === "bajos" ? bajos : vista === "agotados" ? agotados : repuestos;
    if (t) visibles = visibles.filter((r) => r.nombre.toLowerCase().includes(t) || r.codigo.toLowerCase().includes(t));

    cont.querySelector("#contador").textContent = `${visibles.length} de ${repuestos.length} repuestos`;
    lista.innerHTML = visibles.length
      ? `<div class="lista">${visibles.map(fila).join("")}</div>`
      : vacio(
          repuestos.length ? "Ningún repuesto coincide con el filtro." : "El inventario está vacío. Agrega el primer repuesto.",
          "📦"
        );
  }

  function fila(r) {
    const n = nivel(r);
    const estado = n === "cero" ? "Agotado" : n === "bajo" ? `Quedan ${r.existencias}` : `${r.existencias} en stock`;
    return `<div class="inv-item nivel-${n}">
      <div class="inv-main">
        <strong>${esc(r.nombre)}</strong>
        <small>${esc(r.codigo)} · ${esc(dinero(r.precio_venta))}</small>
      </div>
      <div class="inv-stock">
        <span class="cantidad ${n === "cero" ? "cero" : n === "ok" ? "ok" : ""}">${esc(estado)}</span>
        <small>mínimo ${r.stock_minimo ?? 0}</small>
      </div>
      ${
        staff
          ? `<div class="inv-acciones">
              <button type="button" class="btn btn-ghost btn-chico" data-accion="stock" data-id="${esc(r.id)}">+ Stock</button>
              <button type="button" class="btn btn-ghost btn-chico" data-accion="editar" data-id="${esc(r.id)}">Editar</button>
              ${dueno ? `<button type="button" class="icono-btn" data-accion="borrar" data-id="${esc(r.id)}" aria-label="Eliminar ${esc(r.nombre)}">🗑</button>` : ""}
            </div>`
          : ""
      }
    </div>`;
  }

  const camposRepuesto = [
    { name: "nombre", label: "Nombre", requerido: true, max: 120 },
    { name: "codigo", label: "Código", requerido: true, max: 40, ayuda: "Debe ser único." },
    { name: "precio_venta", label: "Precio de venta", tipo: "number", requerido: true, min: 0, paso: 0.01 },
    { name: "existencias", label: "Existencias", tipo: "number", requerido: true, min: 0 },
    { name: "stock_minimo", label: "Stock mínimo", tipo: "number", requerido: true, min: 0, ayuda: "Al llegar a esta cantidad aparece en las alertas." },
  ];

  const acciones = {
    nuevo: async () => {
      const r = await formularioModal({
        titulo: "Nuevo repuesto",
        campos: camposRepuesto,
        valores: { existencias: 0, stock_minimo: 3 },
        enviar: (d) => pb.collection("repuestos").create({ ...d, codigo: d.codigo.toUpperCase() }),
      });
      if (r) {
        toast("Repuesto agregado.");
        if (await cargar()) pintar();
      }
    },
    editar: async (b) => {
      const actual = repuestos.find((r) => r.id === b.dataset.id);
      const r = await formularioModal({
        titulo: "Editar repuesto",
        campos: camposRepuesto,
        valores: actual,
        nota: "Cambiar las existencias aquí es una corrección de inventario. Para una compra, usa “+ Stock”.",
        enviar: (d) => pb.collection("repuestos").update(actual.id, { ...d, codigo: d.codigo.toUpperCase() }),
      });
      if (r) {
        toast("Repuesto actualizado.");
        if (await cargar()) pintar();
      }
    },
    stock: async (b) => {
      const actual = repuestos.find((r) => r.id === b.dataset.id);
      const r = await formularioModal({
        titulo: `Entrada de stock: ${actual.nombre}`,
        textoBoton: "Sumar al inventario",
        nota: `Existencias actuales: ${actual.existencias}.`,
        campos: [{ name: "cantidad", label: "Unidades recibidas", tipo: "number", requerido: true, min: 1 }],
        // "existencias+" suma en el servidor, así no se pisa un descuento simultáneo.
        enviar: (d) => pb.collection("repuestos").update(actual.id, { "existencias+": d.cantidad }),
      });
      if (r) {
        toast(`${actual.nombre}: ahora hay ${r.existencias} en stock.`);
        if (await cargar()) pintar();
      }
    },
    borrar: async (b) => {
      const actual = repuestos.find((r) => r.id === b.dataset.id);
      const ok = await confirmar("Eliminar repuesto", `¿Eliminar “${actual.nombre}” del inventario?`, { textoOk: "Eliminar", peligro: true });
      if (!ok) return;
      try {
        await pb.collection("repuestos").delete(actual.id);
        toast("Repuesto eliminado.");
        if (await cargar()) pintar();
      } catch (err) {
        toast(
          err.status === 400 ? "No se puede eliminar: el repuesto ya se usó en alguna orden." : mensajeError(err),
          "error",
          6000
        );
      }
    },
  };

  cont.addEventListener("click", (ev) => {
    const chip = ev.target.closest("[data-vista]");
    if (chip) {
      vista = chip.dataset.vista;
      pintar();
      return;
    }
    const b = ev.target.closest("[data-accion]");
    if (b) acciones[b.dataset.accion]?.(b);
  });
  cont.querySelector("#buscar").addEventListener("input", (ev) => {
    q = ev.target.value.trim();
    pintar();
  });

  if (await cargar()) pintar();
}
