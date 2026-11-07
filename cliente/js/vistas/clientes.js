// Clientes y vehículos, con el historial de servicios de cada uno.
//   #/clientes                           lista y búsqueda
//   #/clientes/ID                        ficha del cliente
//   #/clientes/ID?vehiculo=VID           ficha con el historial filtrado a un vehículo

import { pb, esDueno, dinero, fecha, mensajeError } from "../api.js";
import { esc, badgeEstado, vacio, cargando, toast, confirmar, conBoton } from "../ui.js";
import { cajaBusqueda, debounce, nombreVehiculo, saldoDe, generaDeuda } from "../componentes.js";
import { abrirFormCliente, abrirFormVehiculo } from "../formularios.js";

export default async function clientes(cont, { params, consulta }) {
  const [id] = params;
  return id ? detalleCliente(cont, id, consulta) : listaClientes(cont);
}

/* ==========================================================================
   LISTA
   ========================================================================== */

function listaClientes(cont) {
  cont.innerHTML = `
    <div class="pantalla-cab">
      <div><h1>Clientes</h1><p id="contador">&nbsp;</p></div>
      <button type="button" class="btn btn-primario" id="nuevo">+ Nuevo cliente</button>
    </div>
    ${cajaBusqueda("buscar", "Nombre, teléfono o matrícula")}
    <div id="resultado"></div>
    <div id="mas" style="text-align:center;margin-top:14px"></div>`;

  const resultado = cont.querySelector("#resultado");
  const mas = cont.querySelector("#mas");
  const contador = cont.querySelector("#contador");
  let q = "";
  let items = [];
  let pagina = 0;
  let token = 0;

  async function cargar(reiniciar) {
    const mio = ++token;
    if (reiniciar) {
      pagina = 0;
      items = [];
      resultado.innerHTML = cargando();
      mas.innerHTML = "";
    }
    try {
      const r = await pb.collection("clientes").getList(pagina + 1, 20, {
        filter: q ? pb.filter("nombre ~ {:q} || telefono ~ {:q} || vehiculos_via_cliente.matricula ~ {:q}", { q }) : "",
        sort: "nombre",
        expand: "vehiculos_via_cliente",
      });
      if (mio !== token) return;
      pagina = r.page;
      items = items.concat(r.items);
      contador.textContent = r.totalItems === 1 ? "1 cliente" : `${r.totalItems} clientes`;
      resultado.innerHTML = items.length
        ? `<div class="lista dos">${items.map(tarjetaCliente).join("")}</div>`
        : vacio(q ? "Ningún cliente coincide con la búsqueda." : "Aún no hay clientes. Registra el primero.", "👤");
      mas.innerHTML = r.page < r.totalPages ? `<button type="button" class="btn btn-ghost" id="btn-mas">Cargar más</button>` : "";
      mas.querySelector("#btn-mas")?.addEventListener("click", (ev) => conBoton(ev.currentTarget, () => cargar(false)));
    } catch (err) {
      if (mio === token) resultado.innerHTML = vacio(mensajeError(err, "No se pudieron cargar los clientes."), "⚠");
    }
  }

  cont.querySelector("#buscar").addEventListener(
    "input",
    debounce((ev) => {
      q = ev.target.value.trim();
      cargar(true);
    })
  );
  cont.querySelector("#nuevo").addEventListener("click", async () => {
    const c = await abrirFormCliente();
    if (c) {
      toast("Cliente registrado.");
      location.hash = `#/clientes/${c.id}`;
    }
  });

  return cargar(true);
}

function tarjetaCliente(c) {
  const vs = c.expand?.vehiculos_via_cliente || [];
  return `<a class="orden-card" href="#/clientes/${esc(c.id)}">
    <div class="oc-fila"><strong>${esc(c.nombre)}</strong><small>${vs.length} ${vs.length === 1 ? "vehículo" : "vehículos"}</small></div>
    <div class="oc-sub">${esc(c.telefono)}${c.direccion ? " · " + esc(c.direccion) : ""}</div>
    ${vs.length ? `<div class="placas">${vs.map((v) => `<span class="placa">${esc(v.matricula)}</span>`).join("")}</div>` : ""}
  </a>`;
}

/* ==========================================================================
   FICHA DEL CLIENTE
   ========================================================================== */

async function detalleCliente(cont, id, consulta) {
  const dueno = esDueno();
  let vehSel = consulta.get("vehiculo") || "";
  let datos = null;

  cont.innerHTML = `<div id="detalle"></div>`;
  const raiz = cont.querySelector("#detalle");

  async function leer() {
    const [cliente, vehiculos, historial] = await Promise.all([
      pb.collection("clientes").getOne(id),
      pb.collection("vehiculos").getFullList({ filter: pb.filter("cliente = {:c}", { c: id }), sort: "matricula" }),
      pb.collection("ordenes").getFullList({
        filter: pb.filter("vehiculo.cliente = {:c}", { c: id }),
        sort: "-fecha_entrada",
        expand: "vehiculo",
      }),
    ]);
    return { cliente, vehiculos, historial };
  }

  async function recargar() {
    try {
      datos = await leer();
    } catch (err) {
      toast(mensajeError(err), "error");
      return;
    }
    dibujar();
  }

  function dibujar() {
    const { cliente, vehiculos, historial } = datos;
    const saldo = historial.filter(generaDeuda).reduce((s, o) => s + saldoDe(o), 0);
    if (vehSel && !vehiculos.some((v) => v.id === vehSel)) vehSel = "";
    const visibles = vehSel ? historial.filter((o) => o.vehiculo === vehSel) : historial;
    const cuenta = (vid) => historial.filter((o) => o.vehiculo === vid).length;

    raiz.innerHTML = `
      <a class="volver" href="#/clientes">← Clientes</a>

      <section class="tarjeta cab-orden">
        <h1>${esc(cliente.nombre)}</h1>
        <p class="cab-datos">
          <span>Tel.: <a href="tel:${esc(cliente.telefono)}">${esc(cliente.telefono)}</a></span>
          ${cliente.direccion ? `<span>${esc(cliente.direccion)}</span>` : ""}
        </p>
        <div class="acciones" style="margin-top:12px">
          <a class="btn btn-primario btn-chico" href="#/ordenes/nueva?cliente=${esc(cliente.id)}">+ Nueva orden</a>
          <button type="button" class="btn btn-ghost btn-chico" data-accion="editar-cliente">Editar</button>
          ${dueno ? `<button type="button" class="btn btn-ghost btn-chico texto-peligro" data-accion="borrar-cliente">Eliminar</button>` : ""}
        </div>
      </section>

      <div class="mosaicos tres" style="margin-top:16px">
        <div class="mosaico"><span>Vehículos</span><strong>${vehiculos.length}</strong></div>
        <div class="mosaico"><span>Servicios</span><strong>${historial.length}</strong></div>
        <a class="mosaico${saldo > 0 ? " alerta" : ""}" href="#/deudores"><span>Saldo pendiente</span><strong>${esc(dinero(saldo))}</strong></a>
      </div>

      <section class="seccion">
        <div class="seccion-cab">
          <h2>Vehículos</h2>
          <button type="button" class="btn btn-ghost btn-chico" data-accion="nuevo-vehiculo">+ Agregar vehículo</button>
        </div>
        ${
          vehiculos.length
            ? `<div class="lista dos">${vehiculos
                .map(
                  (v) => `<div class="tarjeta">
                    <div class="oc-fila"><span class="oc-matricula">${esc(v.matricula)}</span><small>${v.kilometraje ? v.kilometraje.toLocaleString("es") + " km" : "km sin registrar"}</small></div>
                    <div class="oc-sub">${esc(nombreVehiculo(v))}</div>
                    <div class="acciones" style="margin-top:10px">
                      <button type="button" class="btn btn-ghost btn-chico" data-accion="historial" data-id="${esc(v.id)}">Historial (${cuenta(v.id)})</button>
                      <a class="btn btn-ghost btn-chico" href="#/ordenes/nueva?vehiculo=${esc(v.id)}">Nueva orden</a>
                      <button type="button" class="btn btn-ghost btn-chico" data-accion="editar-vehiculo" data-id="${esc(v.id)}">Editar</button>
                      ${dueno ? `<button type="button" class="btn btn-ghost btn-chico texto-peligro" data-accion="borrar-vehiculo" data-id="${esc(v.id)}">Eliminar</button>` : ""}
                    </div>
                  </div>`
                )
                .join("")}</div>`
            : `<div class="tarjeta">${vacio("Este cliente no tiene vehículos registrados.", "🚗")}</div>`
        }
      </section>

      <section class="seccion" id="historial">
        <div class="seccion-cab"><h2>Historial de servicios</h2></div>
        ${
          vehiculos.length > 1
            ? `<div class="chips" role="group" aria-label="Filtrar por vehículo">
                <button type="button" class="chip" data-accion="historial" data-id="" aria-pressed="${vehSel === ""}">Todos<b>${historial.length}</b></button>
                ${vehiculos
                  .map(
                    (v) => `<button type="button" class="chip" data-accion="historial" data-id="${esc(v.id)}" aria-pressed="${vehSel === v.id}">${esc(v.matricula)}<b>${cuenta(v.id)}</b></button>`
                  )
                  .join("")}
              </div>`
            : ""
        }
        <div class="lista">
          ${
            visibles.length
              ? visibles
                  .map((o) => {
                    const v = o.expand?.vehiculo;
                    return `<a class="orden-card estado-${esc(o.estado)}" href="#/ordenes/${esc(o.id)}">
                      <div class="oc-fila"><span><strong>${esc(fecha(o.fecha_entrada))}</strong> · ${esc(v?.matricula || "")}</span>${badgeEstado(o.estado)}</div>
                      <p class="oc-problema">${esc(o.problema)}</p>
                      <div class="oc-pie"><span>Total ${esc(dinero(o.total))}</span>${generaDeuda(o) ? `<b class="texto-peligro">Debe ${esc(dinero(saldoDe(o)))}</b>` : `<span></span>`}</div>
                    </a>`;
                  })
                  .join("")
              : vacio("Sin servicios registrados todavía.", "🧾")
          }
        </div>
      </section>`;
  }

  const acciones = {
    "editar-cliente": async () => {
      const c = await abrirFormCliente(datos.cliente);
      if (c) {
        toast("Cliente actualizado.");
        recargar();
      }
    },
    "borrar-cliente": async () => {
      if (datos.vehiculos.length) {
        toast("No se puede eliminar: el cliente tiene vehículos registrados. Elimina primero sus vehículos.", "error", 6000);
        return;
      }
      const ok = await confirmar("Eliminar cliente", `¿Eliminar a ${datos.cliente.nombre}? Esta acción no se puede deshacer.`, {
        textoOk: "Eliminar",
        peligro: true,
      });
      if (!ok) return;
      try {
        await pb.collection("clientes").delete(id);
        toast("Cliente eliminado.");
        location.hash = "#/clientes";
      } catch (err) {
        toast(mensajeError(err), "error");
      }
    },
    "nuevo-vehiculo": async () => {
      const v = await abrirFormVehiculo(id);
      if (v) {
        toast("Vehículo registrado.");
        recargar();
      }
    },
    "editar-vehiculo": async (b) => {
      const actual = datos.vehiculos.find((v) => v.id === b.dataset.id);
      const v = await abrirFormVehiculo(id, actual);
      if (v) {
        toast("Vehículo actualizado.");
        recargar();
      }
    },
    "borrar-vehiculo": async (b) => {
      const v = datos.vehiculos.find((x) => x.id === b.dataset.id);
      if (datos.historial.some((o) => o.vehiculo === v.id)) {
        toast("No se puede eliminar: el vehículo tiene órdenes en su historial.", "error", 6000);
        return;
      }
      const ok = await confirmar("Eliminar vehículo", `¿Eliminar el vehículo ${v.matricula}?`, { textoOk: "Eliminar", peligro: true });
      if (!ok) return;
      try {
        await pb.collection("vehiculos").delete(v.id);
        toast("Vehículo eliminado.");
        recargar();
      } catch (err) {
        toast(mensajeError(err), "error");
      }
    },
    historial: (b) => {
      vehSel = b.dataset.id;
      dibujar();
      raiz.querySelector("#historial").scrollIntoView({ behavior: "smooth", block: "start" });
    },
  };

  raiz.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-accion]");
    if (b) acciones[b.dataset.accion]?.(b);
  });

  try {
    datos = await leer();
  } catch (err) {
    raiz.innerHTML = vacio(err.status === 404 ? "El cliente no existe." : mensajeError(err), err.status === 404 ? "🔎" : "⚠");
    return;
  }
  dibujar();
}
