// Conexión con PocketBase y utilidades compartidas por todas las pantallas.

import PocketBase from "./vendor/pocketbase.es.mjs";
import { PB_URL, MONEDA } from "./config.js";

export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false); // varias pantallas lanzan consultas en paralelo

// ---- Estados de una orden -----------------------------------------------------
export const ESTADOS = {
  recibida: { texto: "Recibida", clase: "e-recibida" },
  en_diagnostico: { texto: "En diagnóstico", clase: "e-diagnostico" },
  en_reparacion: { texto: "En reparación", clase: "e-reparacion" },
  lista: { texto: "Lista para entregar", clase: "e-lista" },
  entregada: { texto: "Entregada", clase: "e-entregada" },
  cancelada: { texto: "Cancelada", clase: "e-cancelada" },
};
export const ESTADOS_ABIERTOS = ["recibida", "en_diagnostico", "en_reparacion", "lista"];
export const FILTRO_ABIERTAS = 'estado != "entregada" && estado != "cancelada"';

// ---- Usuario y roles ----------------------------------------------------------
export const usuario = () => pb.authStore.record;
export const rol = () => pb.authStore.record?.rol || "";
export const esStaff = () => rol() === "dueno" || rol() === "recepcion";
export const esDueno = () => rol() === "dueno";
export const esMecanico = () => rol() === "mecanico";
export const esRecepcion = () => rol() === "recepcion";
// Anotar trabajos y repuestos: el mecánico asignado a la orden, o el dueño (para corregir).
export const puedeAnotar = (orden) => esDueno() || (esMecanico() && orden?.mecanico === usuario()?.id);
export const ROLES = { dueno: "Dueño", recepcion: "Recepción", mecanico: "Mecánico" };

// ---- Formato ------------------------------------------------------------------
export function dinero(n) {
  const v = Number(n) || 0;
  return (
    MONEDA +
    v.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

// PocketBase guarda fechas como "2026-11-05 14:30:00.000Z"
export function aFecha(s) {
  return s ? new Date(String(s).replace(" ", "T")) : null;
}

export function fecha(s) {
  const d = aFecha(s);
  return d ? d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export function fechaHora(s) {
  const d = aFecha(s);
  return d
    ? d.toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";
}

// Date -> texto que entiende el filtro de PocketBase
export const aIso = (d) => d.toISOString().replace("T", " ");

// Mensaje legible a partir de un error del SDK
export function mensajeError(err, porDefecto = "Ocurrió un error. Intenta de nuevo.") {
  if (!err) return porDefecto;
  if (err.status === 0) return "No hay conexión con el servidor. ¿Está encendido PocketBase?";
  const campos = err.response?.data;
  if (campos && typeof campos === "object") {
    const primero = Object.entries(campos)[0];
    if (primero) {
      const [campo, info] = primero;
      if (info?.code === "validation_not_unique") return `Ya existe un registro con ese valor en "${campo}".`;
      return `${campo}: ${info?.message || info}`;
    }
  }
  return err.response?.message || err.message || porDefecto;
}
