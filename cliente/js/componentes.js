// Piezas de interfaz que usan varias pantallas.

import { esStaff, dinero, fecha } from "./api.js";
import { esc, badgeEstado } from "./ui.js";

// Ejecuta `fn` solo cuando el usuario deja de escribir.
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const nombreVehiculo = (v) => [v?.marca, v?.modelo, v?.anio].filter(Boolean).join(" ");

// Una orden "debe" dinero cuando el trabajo ya está terminado (lista o entregada) y falta cobrar.
export const saldoDe = (o) => Math.max(0, Math.round(((o.total || 0) - (o.pagado || 0)) * 100) / 100);
export const generaDeuda = (o) => (o.estado === "lista" || o.estado === "entregada") && saldoDe(o) > 0;

// Tarjeta de una orden para listas (panel y pantalla de órdenes).
export function tarjetaOrden(o) {
  const v = o.expand?.vehiculo;
  const cliente = v?.expand?.cliente;
  const mec = o.expand?.mecanico;
  const debe = esStaff() && generaDeuda(o) ? ` · <b class="texto-peligro">Debe ${esc(dinero(saldoDe(o)))}</b>` : "";
  return `
    <a class="orden-card estado-${esc(o.estado)}" href="#/ordenes/${esc(o.id)}">
      <div class="oc-fila">
        <span class="oc-matricula">${esc(v?.matricula || "—")}</span>
        ${badgeEstado(o.estado)}
      </div>
      <div class="oc-sub">${esc(nombreVehiculo(v))}${cliente ? " · " + esc(cliente.nombre) : ""}</div>
      <p class="oc-problema">${esc(o.problema)}</p>
      <div class="oc-pie"><span>${esc(mec?.name || "Sin mecánico")}</span><span>${esc(fecha(o.fecha_entrada))}${debe}</span></div>
    </a>`;
}

// Cuadro de búsqueda con el mismo aspecto en todas las pantallas.
export function cajaBusqueda(id, placeholder, valor = "") {
  return `<div class="buscador">
    <span aria-hidden="true">🔍</span>
    <input id="${esc(id)}" type="search" class="entrada" placeholder="${esc(placeholder)}" value="${esc(valor)}" autocomplete="off" aria-label="${esc(placeholder)}" />
  </div>`;
}
