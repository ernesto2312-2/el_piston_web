// Deudores: cuánto debe cada cliente con saldo pendiente.
// Una orden genera deuda cuando el trabajo ya está terminado (lista o entregada) y falta cobrar.

import { pb, dinero, fecha, aFecha, mensajeError } from "../api.js";
import { esc, badgeEstado, vacio, cargando } from "../ui.js";
import { cajaBusqueda, saldoDe, generaDeuda } from "../componentes.js";

export default async function deudores(cont) {
  let incluirEnProceso = false;
  let q = "";
  let ordenes = [];

  cont.innerHTML = `
    <div class="pantalla-cab">
      <div><h1>Deudores</h1><p>Clientes con saldo pendiente de pago.</p></div>
    </div>
    <div id="resumen"></div>
    ${cajaBusqueda("buscar", "Cliente, teléfono o matrícula")}
    <label class="interruptor">
      <input type="checkbox" id="en-proceso" />
      <span>Incluir también órdenes que aún están en proceso</span>
    </label>
    <div id="lista">${cargando()}</div>`;

  const lista = cont.querySelector("#lista");
  const resumen = cont.querySelector("#resumen");

  function agrupar() {
    const grupos = new Map();
    ordenes
      .filter((o) => (incluirEnProceso ? saldoDe(o) > 0 : generaDeuda(o)))
      .forEach((o) => {
        const v = o.expand?.vehiculo;
        const c = v?.expand?.cliente;
        const clave = c?.id || "sin-cliente";
        if (!grupos.has(clave)) grupos.set(clave, { cliente: c, ordenes: [], saldo: 0 });
        const g = grupos.get(clave);
        g.ordenes.push(o);
        g.saldo += saldoDe(o);
      });

    const t = q.toLowerCase();
    return [...grupos.values()]
      .filter(
        (g) =>
          !t ||
          g.cliente?.nombre.toLowerCase().includes(t) ||
          g.cliente?.telefono.includes(t) ||
          g.ordenes.some((o) => o.expand?.vehiculo?.matricula.toLowerCase().includes(t))
      )
      .sort((a, b) => b.saldo - a.saldo);
  }

  function pintar() {
    const grupos = agrupar();
    const total = grupos.reduce((s, g) => s + g.saldo, 0);

    resumen.innerHTML = `<div class="mosaicos dos-col" style="margin-bottom:16px">
      <div class="mosaico${total > 0 ? " alerta" : ""}"><span>Total por cobrar</span><strong>${esc(dinero(total))}</strong></div>
      <div class="mosaico"><span>Clientes con deuda</span><strong>${grupos.length}</strong></div>
    </div>`;

    lista.innerHTML = grupos.length
      ? `<div class="lista">${grupos.map(tarjetaDeudor).join("")}</div>`
      : vacio(q ? "Ningún deudor coincide con la búsqueda." : "Nadie debe nada. ¡Cuentas al día!", "✔");
  }

  function tarjetaDeudor(g) {
    const c = g.cliente;
    const masAntigua = g.ordenes.map((o) => aFecha(o.fecha_entrada)).sort((a, b) => a - b)[0];
    const dias = masAntigua ? Math.floor((Date.now() - masAntigua.getTime()) / 86400000) : 0;

    return `<details class="deudor">
      <summary>
        <span class="deudor-nombre">
          <strong>${esc(c?.nombre || "Cliente desconocido")}</strong>
          <small>${g.ordenes.length} ${g.ordenes.length === 1 ? "orden" : "órdenes"}${dias >= 1 ? ` · la más antigua, hace ${dias} ${dias === 1 ? "día" : "días"}` : ""}</small>
        </span>
        <b class="texto-peligro">${esc(dinero(g.saldo))}</b>
      </summary>
      <div class="deudor-cuerpo">
        <div class="acciones">
          ${c?.telefono ? `<a class="btn btn-ghost btn-chico" href="tel:${esc(c.telefono)}">📞 ${esc(c.telefono)}</a>` : ""}
          ${c ? `<a class="btn btn-ghost btn-chico" href="#/clientes/${esc(c.id)}">Ver cliente</a>` : ""}
        </div>
        ${g.ordenes
          .map((o) => {
            const v = o.expand?.vehiculo;
            return `<a class="fila-item fila-link" href="#/ordenes/${esc(o.id)}">
              <span class="fi-texto">${esc(v?.matricula || "")} · ${esc(fecha(o.fecha_entrada))}<small>${badgeEstado(o.estado)} Pagado ${esc(dinero(o.pagado))} de ${esc(dinero(o.total))}</small></span>
              <b class="texto-peligro">${esc(dinero(saldoDe(o)))}</b>
            </a>`;
          })
          .join("")}
      </div>
    </details>`;
  }

  cont.querySelector("#buscar").addEventListener("input", (ev) => {
    q = ev.target.value.trim();
    pintar();
  });
  cont.querySelector("#en-proceso").addEventListener("change", (ev) => {
    incluirEnProceso = ev.target.checked;
    pintar();
  });

  try {
    ordenes = await pb.collection("ordenes").getFullList({
      filter: 'estado != "cancelada" && total > pagado',
      sort: "fecha_entrada",
      expand: "vehiculo.cliente",
    });
  } catch (err) {
    lista.innerHTML = vacio(mensajeError(err, "No se pudieron cargar los saldos."), "⚠");
    return;
  }
  pintar();
}
