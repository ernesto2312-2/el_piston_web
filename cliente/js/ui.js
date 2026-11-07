// Piezas de interfaz reutilizables: escape de HTML, avisos, confirmaciones y modales.

import { ESTADOS } from "./api.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Todo texto que venga de la base de datos pasa por aquí antes de insertarse como HTML.
export const esc = (valor) => String(valor ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function badgeEstado(estado) {
  const e = ESTADOS[estado] || { texto: estado, clase: "" };
  return `<span class="badge ${e.clase}">${esc(e.texto)}</span>`;
}

export const vacio = (mensaje, icono = "∅") =>
  `<div class="vacio"><div class="vacio-icono" aria-hidden="true">${icono}</div><p>${esc(mensaje)}</p></div>`;

export const cargando = () =>
  `<div class="cargando" role="status" aria-label="Cargando"><span class="spinner"></span></div>`;

// ---- Avisos (toasts) ----------------------------------------------------------
export function toast(mensaje, tipo = "ok", ms = 4000) {
  const cont = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast toast-${tipo}`;
  el.setAttribute("role", tipo === "error" ? "alert" : "status");
  el.textContent = mensaje;
  cont.appendChild(el);
  requestAnimationFrame(() => el.classList.add("visible"));
  setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 250);
  }, ms);
}

// ---- Modal --------------------------------------------------------------------
// Devuelve { cuerpo, cerrar }. El contenido se pasa ya como HTML escapado.
export function abrirModal(titulo, htmlCuerpo, { ancho = "460px", alCerrar } = {}) {
  const raiz = document.getElementById("modal-root");
  const fondo = document.createElement("div");
  fondo.className = "modal-fondo";
  fondo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" style="max-width:${ancho}">
      <div class="modal-cab">
        <h2>${esc(titulo)}</h2>
        <button type="button" class="icono-btn" data-cerrar aria-label="Cerrar">✕</button>
      </div>
      <div class="modal-cuerpo">${htmlCuerpo}</div>
    </div>`;
  raiz.appendChild(fondo);
  document.body.classList.add("sin-scroll");

  const previo = document.activeElement;
  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    fondo.remove();
    document.removeEventListener("keydown", alTeclear);
    if (!raiz.children.length) document.body.classList.remove("sin-scroll");
    previo?.focus?.();
    alCerrar?.();
  };
  // Con varios modales apilados, Escape solo cierra el de arriba.
  const alTeclear = (ev) => ev.key === "Escape" && raiz.lastElementChild === fondo && cerrar();
  document.addEventListener("keydown", alTeclear);
  fondo.addEventListener("click", (ev) => {
    if (ev.target === fondo || ev.target.closest("[data-cerrar]")) cerrar();
  });

  const cuerpo = fondo.querySelector(".modal-cuerpo");
  cuerpo.querySelector("input, select, textarea, button")?.focus();
  return { cuerpo, cerrar };
}

// ---- Confirmación (para acciones que no se pueden deshacer) -------------------
export function confirmar(titulo, mensaje, { textoOk = "Confirmar", peligro = false } = {}) {
  return new Promise((resolver) => {
    let decidido = false;
    const decidir = (valor) => {
      if (decidido) return;
      decidido = true;
      resolver(valor);
    };
    // Cerrar con ✕, Escape o clic fuera cuenta como "no".
    const { cuerpo, cerrar } = abrirModal(
      titulo,
      `<p class="modal-texto">${esc(mensaje)}</p>
       <div class="modal-acciones">
         <button type="button" class="btn btn-ghost" data-no>Volver</button>
         <button type="button" class="btn ${peligro ? "btn-peligro" : "btn-primario"}" data-si>${esc(textoOk)}</button>
       </div>`,
      { alCerrar: () => decidir(false) }
    );
    cuerpo.querySelector("[data-si]").addEventListener("click", () => {
      decidir(true);
      cerrar();
    });
    cuerpo.querySelector("[data-no]").addEventListener("click", cerrar);
  });
}

// Desactiva un botón mientras se ejecuta una acción asíncrona (evita dobles envíos).
export async function conBoton(boton, accion) {
  const texto = boton.textContent;
  boton.disabled = true;
  boton.classList.add("ocupado");
  try {
    return await accion();
  } finally {
    boton.disabled = false;
    boton.classList.remove("ocupado");
    boton.textContent = texto;
  }
}
