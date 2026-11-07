// Órdenes de servicio: lista con filtros, alta en tres pasos y detalle completo.
//   #/ordenes            lista
//   #/ordenes/nueva      nueva orden (?cliente=ID o ?vehiculo=ID para saltar pasos)
//   #/ordenes/ID         detalle

import {
  pb,
  ESTADOS,
  FILTRO_ABIERTAS,
  esStaff,
  esDueno,
  esMecanico,
  esRecepcion,
  puedeAnotar,
  dinero,
  fechaHora,
  aIso,
  mensajeError,
} from "../api.js";
import { esc, badgeEstado, vacio, cargando, toast, confirmar, abrirModal, conBoton } from "../ui.js";
import { tarjetaOrden, cajaBusqueda, debounce, nombreVehiculo, saldoDe } from "../componentes.js";
import { formularioModal, abrirFormCliente, abrirFormVehiculo } from "../formularios.js";

const FLUJO = ["recibida", "en_diagnostico", "en_reparacion", "lista", "entregada"];
const ESTADOS_MECANICO = ["en_diagnostico", "en_reparacion", "lista"];
const TRABAJOS_COMUNES = [
  "Cambio de aceite y filtro",
  "Alineación y balanceo",
  "Cambio de pastillas de freno",
  "Cambio de bujías",
  "Revisión del sistema eléctrico",
  "Diagnóstico con escáner",
  "Cambio de correa de distribución",
  "Cambio de amortiguadores",
];

export default async function ordenes(cont, { params, consulta }) {
  const [sub] = params;
  if (sub === "nueva") {
    if (!esStaff()) {
      location.hash = "#/ordenes";
      return;
    }
    return nuevaOrden(cont, consulta);
  }
  if (sub) return detalle(cont, sub);
  return lista(cont, consulta);
}

/* ==========================================================================
   LISTA
   ========================================================================== */

async function lista(cont, consulta) {
  const staff = esStaff();
  const est = { vista: consulta.get("estado") || "abiertas", mecanico: consulta.get("mecanico") || "", q: "" };
  const mecanicos = staff
    ? await pb.collection("users").getFullList({ filter: 'rol = "mecanico"', sort: "name" }).catch(() => [])
    : [];

  const VISTAS = [
    ["abiertas", "Abiertas"],
    ...Object.entries(ESTADOS).map(([k, v]) => [k, v.texto]),
    ["todas", "Todas"],
  ];

  cont.innerHTML = `
    <div class="pantalla-cab">
      <div><h1>${staff ? "Órdenes" : "Mis órdenes"}</h1><p id="contador">&nbsp;</p></div>
      ${staff ? `<a class="btn btn-primario" href="#/ordenes/nueva">+ Nueva orden</a>` : ""}
    </div>
    <div class="filtros-fila">
      ${cajaBusqueda("buscar", "Matrícula, cliente o problema")}
      ${
        staff
          ? `<select id="f-mecanico" class="entrada" aria-label="Filtrar por mecánico">
              <option value="">Todos los mecánicos</option>
              ${mecanicos
                .map((m) => `<option value="${esc(m.id)}"${m.id === est.mecanico ? " selected" : ""}>${esc(m.name || m.email)}</option>`)
                .join("")}
            </select>`
          : ""
      }
    </div>
    <div class="chips" role="group" aria-label="Filtrar por estado" style="margin-top:10px">
      ${VISTAS.map(([id, texto]) => `<button type="button" class="chip" data-vista="${id}" aria-pressed="${id === est.vista}">${esc(texto)}</button>`).join("")}
    </div>
    <div id="resultado"></div>
    <div id="mas" style="text-align:center;margin-top:14px"></div>`;

  const resultado = cont.querySelector("#resultado");
  const mas = cont.querySelector("#mas");
  const contador = cont.querySelector("#contador");
  let items = [];
  let pagina = 0;
  let token = 0;

  function filtro() {
    const partes = [];
    const p = {};
    if (est.vista === "abiertas") partes.push(FILTRO_ABIERTAS);
    else if (est.vista !== "todas") {
      partes.push("estado = {:estado}");
      p.estado = est.vista;
    }
    if (est.mecanico) {
      partes.push("mecanico = {:mec}");
      p.mec = est.mecanico;
    }
    if (est.q) {
      partes.push("(vehiculo.matricula ~ {:q} || vehiculo.cliente.nombre ~ {:q} || problema ~ {:q})");
      p.q = est.q;
    }
    return pb.filter(partes.join(" && "), p);
  }

  async function cargar(reiniciar) {
    const mio = ++token;
    if (reiniciar) {
      pagina = 0;
      items = [];
      resultado.innerHTML = cargando();
      mas.innerHTML = "";
    }
    try {
      const r = await pb.collection("ordenes").getList(pagina + 1, 20, {
        filter: filtro(),
        sort: "-fecha_entrada",
        expand: "vehiculo.cliente,mecanico",
      });
      if (mio !== token) return;
      pagina = r.page;
      items = items.concat(r.items);
      contador.textContent = r.totalItems === 1 ? "1 orden" : `${r.totalItems} órdenes`;
      resultado.innerHTML = items.length
        ? `<div class="lista dos">${items.map(tarjetaOrden).join("")}</div>`
        : vacio(est.q ? "Ninguna orden coincide con la búsqueda." : "No hay órdenes con estos filtros.", "🔎");
      mas.innerHTML =
        r.page < r.totalPages ? `<button type="button" class="btn btn-ghost" id="btn-mas">Cargar más</button>` : "";
      mas.querySelector("#btn-mas")?.addEventListener("click", (ev) => conBoton(ev.currentTarget, () => cargar(false)));
    } catch (err) {
      if (mio !== token) return;
      resultado.innerHTML = vacio(mensajeError(err, "No se pudieron cargar las órdenes."), "⚠");
    }
  }

  cont.querySelector("#buscar").addEventListener(
    "input",
    debounce((ev) => {
      est.q = ev.target.value.trim();
      cargar(true);
    })
  );
  cont.querySelector("#f-mecanico")?.addEventListener("change", (ev) => {
    est.mecanico = ev.target.value;
    cargar(true);
  });
  cont.querySelectorAll("[data-vista]").forEach((b) =>
    b.addEventListener("click", () => {
      est.vista = b.dataset.vista;
      cont.querySelectorAll("[data-vista]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      cargar(true);
    })
  );

  cargar(true);
}

/* ==========================================================================
   NUEVA ORDEN (cliente → vehículo → datos)
   ========================================================================== */

async function nuevaOrden(cont, consulta) {
  const s = { cliente: null, vehiculo: null };
  let mecanicos = null;

  cont.innerHTML = `
    <div class="pantalla-cab">
      <div><h1>Nueva orden</h1><p>Cliente, vehículo y problema reportado.</p></div>
      <a class="btn btn-ghost" href="#/ordenes">Cancelar</a>
    </div>
    <section class="tarjeta" id="paso-cliente"></section>
    <section class="tarjeta" id="paso-vehiculo" hidden></section>
    <section class="tarjeta" id="paso-datos" hidden></section>`;

  const $ = (sel) => cont.querySelector(sel);
  const cabecera = (n, titulo) => `<div class="paso-cab"><span class="paso-num">${n}</span><h2>${esc(titulo)}</h2></div>`;

  // Si venimos desde un cliente o un vehículo, se saltan pasos.
  try {
    if (consulta.get("vehiculo")) {
      const v = await pb.collection("vehiculos").getOne(consulta.get("vehiculo"), { expand: "cliente" });
      s.vehiculo = v;
      s.cliente = v.expand?.cliente || null;
    } else if (consulta.get("cliente")) {
      s.cliente = await pb.collection("clientes").getOne(consulta.get("cliente"));
    }
  } catch (err) {
    toast("No se encontró el cliente o el vehículo indicado.", "error");
  }

  // ---- Paso 1: cliente
  function pasoCliente() {
    const sec = $("#paso-cliente");
    if (s.cliente) {
      sec.innerHTML = `${cabecera(1, "Cliente")}
        <div class="seleccion">
          <div><strong>${esc(s.cliente.nombre)}</strong><br /><small>${esc(s.cliente.telefono)}</small></div>
          <button type="button" class="btn btn-ghost btn-chico" id="cambiar-cliente">Cambiar</button>
        </div>`;
      sec.querySelector("#cambiar-cliente").addEventListener("click", () => {
        s.cliente = null;
        s.vehiculo = null;
        render();
      });
      return;
    }

    sec.innerHTML = `${cabecera(1, "Cliente")}
      ${cajaBusqueda("q-cliente", "Nombre, teléfono o matrícula")}
      <div id="res-clientes" class="opciones"></div>
      <button type="button" class="btn btn-ghost btn-bloque" id="nuevo-cliente" style="margin-top:10px">+ Cliente nuevo</button>`;

    const res = sec.querySelector("#res-clientes");
    let tk = 0;
    let ultimos = [];

    const buscar = async (q) => {
      const mio = ++tk;
      try {
        const r = await pb.collection("clientes").getList(1, 8, {
          filter: q
            ? pb.filter("nombre ~ {:q} || telefono ~ {:q} || vehiculos_via_cliente.matricula ~ {:q}", { q })
            : "",
          sort: q ? "nombre" : "-updated",
          expand: "vehiculos_via_cliente",
        });
        if (mio !== tk) return;
        ultimos = r.items;
        res.innerHTML = r.items.length
          ? `<p class="ayuda">${q ? "Resultados" : "Clientes recientes"}</p>` +
            r.items
              .map((c) => {
                const placas = (c.expand?.vehiculos_via_cliente || []).map((v) => v.matricula).join(" · ");
                return `<button type="button" class="opcion" data-id="${esc(c.id)}">
                  <strong>${esc(c.nombre)}</strong>
                  <small>${esc(c.telefono)}${placas ? " · " + esc(placas) : ""}</small>
                </button>`;
              })
              .join("")
          : vacio("Sin resultados. Registra al cliente nuevo.", "🔎");
      } catch (err) {
        if (mio === tk) res.innerHTML = vacio(mensajeError(err), "⚠");
      }
    };

    res.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-id]");
      if (!b) return;
      s.cliente = ultimos.find((c) => c.id === b.dataset.id);
      s.vehiculo = null;
      render();
    });
    sec.querySelector("#q-cliente").addEventListener("input", debounce((ev) => buscar(ev.target.value.trim())));
    sec.querySelector("#nuevo-cliente").addEventListener("click", async () => {
      const c = await abrirFormCliente();
      if (c) {
        toast("Cliente registrado.");
        s.cliente = c;
        s.vehiculo = null;
        render();
      }
    });
    buscar("");
  }

  // ---- Paso 2: vehículo
  async function pasoVehiculo() {
    const sec = $("#paso-vehiculo");
    if (!s.cliente) {
      sec.hidden = true;
      $("#paso-datos").hidden = true;
      return;
    }
    sec.hidden = false;
    sec.innerHTML = cabecera(2, "Vehículo") + cargando();

    let vs;
    try {
      vs = await pb.collection("vehiculos").getFullList({ filter: pb.filter("cliente = {:c}", { c: s.cliente.id }), sort: "matricula" });
    } catch (err) {
      sec.innerHTML = cabecera(2, "Vehículo") + vacio(mensajeError(err), "⚠");
      return;
    }
    if (!s.vehiculo && vs.length === 1) s.vehiculo = vs[0];

    sec.innerHTML = `${cabecera(2, "Vehículo")}
      ${
        vs.length
          ? `<div class="opciones">${vs
              .map(
                (v) => `<label class="opcion opcion-radio">
                  <input type="radio" name="veh" value="${esc(v.id)}"${s.vehiculo?.id === v.id ? " checked" : ""} />
                  <span><strong>${esc(v.matricula)}</strong><small>${esc(nombreVehiculo(v))}${v.kilometraje ? " · " + v.kilometraje.toLocaleString("es") + " km" : ""}</small></span>
                </label>`
              )
              .join("")}</div>`
          : `<p class="ayuda" style="margin-bottom:10px">Este cliente todavía no tiene vehículos registrados.</p>`
      }
      <button type="button" class="btn btn-ghost btn-bloque" id="nuevo-vehiculo" style="margin-top:10px">+ Agregar vehículo</button>`;

    sec.querySelectorAll('input[name="veh"]').forEach((r) =>
      r.addEventListener("change", () => {
        s.vehiculo = vs.find((v) => v.id === r.value);
        pasoDatos();
      })
    );
    sec.querySelector("#nuevo-vehiculo").addEventListener("click", async () => {
      const v = await abrirFormVehiculo(s.cliente.id);
      if (v) {
        toast("Vehículo registrado.");
        s.vehiculo = v;
        pasoVehiculo();
      }
    });
    pasoDatos();
  }

  async function cargarMecanicos() {
    const [users, abiertas] = await Promise.all([
      pb.collection("users").getFullList({ filter: 'rol = "mecanico"', sort: "name" }),
      pb.collection("ordenes").getFullList({ filter: FILTRO_ABIERTAS, fields: "mecanico" }),
    ]);
    return users.map((u) => ({
      id: u.id,
      nombre: u.name || u.email,
      abiertas: abiertas.filter((o) => o.mecanico === u.id).length,
    }));
  }

  // ---- Paso 3: datos de la orden
  async function pasoDatos() {
    const sec = $("#paso-datos");
    if (!s.vehiculo) {
      sec.hidden = true;
      return;
    }
    sec.hidden = false;
    try {
      mecanicos = mecanicos || (await cargarMecanicos());
    } catch (err) {
      sec.innerHTML = cabecera(3, "Datos de la orden") + vacio(mensajeError(err), "⚠");
      return;
    }
    if (!mecanicos.length) {
      sec.innerHTML = cabecera(3, "Datos de la orden") + vacio("No hay mecánicos registrados. Crea uno desde el panel de PocketBase.", "⚠");
      return;
    }
    // Se sugiere el mecánico con menos órdenes abiertas.
    const sugerido = [...mecanicos].sort((a, b) => a.abiertas - b.abiertas)[0];
    const kmPrevio = s.vehiculo.kilometraje;

    sec.innerHTML = `${cabecera(3, "Datos de la orden")}
      <form novalidate>
        <div class="error-form" role="alert" hidden></div>
        <div class="campo">
          <label for="problema">Problema que reporta el cliente</label>
          <textarea id="problema" name="problema" required maxlength="2000" rows="3" placeholder="Ej.: hace ruido al frenar y se calienta el motor"></textarea>
        </div>
        <div class="campo">
          <label for="km">Kilometraje actual <small>(opcional)</small></label>
          <input id="km" name="km" type="number" inputmode="numeric" min="0" step="1" value="${kmPrevio ?? ""}" />
          ${kmPrevio ? `<span class="ayuda">Último kilometraje registrado: ${kmPrevio.toLocaleString("es")} km</span>` : ""}
        </div>
        <div class="campo">
          <label for="mecanico">Mecánico asignado</label>
          <select id="mecanico" name="mecanico" required>
            ${mecanicos
              .map(
                (m) =>
                  `<option value="${esc(m.id)}"${m.id === sugerido.id ? " selected" : ""}>${esc(m.nombre)} · ${m.abiertas} ${m.abiertas === 1 ? "abierta" : "abiertas"}</option>`
              )
              .join("")}
          </select>
        </div>
        <button type="submit" class="btn btn-primario btn-bloque">Crear orden</button>
      </form>`;

    const form = sec.querySelector("form");
    const caja = sec.querySelector(".error-form");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      caja.hidden = true;
      if (!form.reportValidity()) return;
      await conBoton(form.querySelector('[type="submit"]'), async () => {
        try {
          const km = form.elements.km.value;
          const orden = await pb.collection("ordenes").create({
            vehiculo: s.vehiculo.id,
            mecanico: form.elements.mecanico.value,
            problema: form.elements.problema.value.trim(),
            kilometraje: km === "" ? null : Number(km),
            estado: "recibida",
            fecha_entrada: aIso(new Date()),
          });
          toast("Orden creada.");
          location.hash = `#/ordenes/${orden.id}`;
        } catch (err) {
          caja.textContent = mensajeError(err);
          caja.hidden = false;
        }
      });
    });
  }

  function render() {
    pasoCliente();
    pasoVehiculo();
  }
  render();
}

/* ==========================================================================
   DETALLE
   ========================================================================== */

async function detalle(cont, id) {
  const staff = esStaff();
  const dueno = esDueno();
  const mecanico = esMecanico();
  const recepcion = esRecepcion();
  let datos = null;

  cont.innerHTML = `<div id="detalle"></div>`;
  const raiz = cont.querySelector("#detalle");

  async function leer() {
    const filtro = pb.filter("orden = {:o}", { o: id });
    const [orden, trabajos, usados, pagos] = await Promise.all([
      pb.collection("ordenes").getOne(id, { expand: "vehiculo.cliente,mecanico" }),
      pb.collection("trabajos").getFullList({ filter: filtro, sort: "created" }),
      pb.collection("orden_repuestos").getFullList({ filter: filtro, sort: "created", expand: "repuesto" }),
      staff ? pb.collection("pagos").getFullList({ filter: filtro, sort: "created", expand: "registrado_por" }) : [],
    ]);
    return { orden, trabajos, usados, pagos };
  }

  async function recargar() {
    const y = window.scrollY;
    try {
      datos = await leer();
    } catch (err) {
      toast(mensajeError(err), "error");
      return;
    }
    dibujar();
    window.scrollTo(0, y);
  }

  // ---- Dibujo ---------------------------------------------------------------
  function dibujar() {
    const { orden, trabajos, usados, pagos } = datos;
    const cerrada = orden.estado === "entregada" || orden.estado === "cancelada";
    const v = orden.expand?.vehiculo;
    const cliente = v?.expand?.cliente;
    const mec = orden.expand?.mecanico;
    const pendiente = saldoDe(orden);
    // Anotar diagnóstico, trabajos y repuestos: solo el mecánico de la orden (o el dueño).
    const anota = puedeAnotar(orden) && !cerrada;

    // Siguiente paso natural del flujo. El mecánico llega hasta "lista"; recepción solo entrega.
    let siguiente = FLUJO[FLUJO.indexOf(orden.estado) + 1] || null;
    if (mecanico && siguiente && !ESTADOS_MECANICO.includes(siguiente)) siguiente = null;
    if (recepcion && siguiente !== "entregada") siguiente = null;

    const pasos = FLUJO.map((e, i) => {
      const actual = FLUJO.indexOf(orden.estado);
      const clase = orden.estado === "cancelada" ? "" : i < actual ? "hecho" : i === actual ? "actual" : "";
      return `<li class="${clase}"><span>${esc(ESTADOS[e].texto)}</span></li>`;
    }).join("");

    raiz.innerHTML = `
      <a class="volver" href="#/ordenes">← Órdenes</a>

      <section class="tarjeta cab-orden">
        <div class="oc-fila">
          <h1>${esc(v?.matricula || "Orden")}</h1>
          ${badgeEstado(orden.estado)}
        </div>
        <p>${esc(nombreVehiculo(v))}${orden.kilometraje ? ` · ${orden.kilometraje.toLocaleString("es")} km` : ""}</p>
        <p class="cab-datos">
          <span>Cliente: ${
            cliente
              ? staff
                ? `<a href="#/clientes/${esc(cliente.id)}"><strong>${esc(cliente.nombre)}</strong></a> · <a href="tel:${esc(cliente.telefono)}">${esc(cliente.telefono)}</a>`
                : `<strong>${esc(cliente.nombre)}</strong>`
              : "—"
          }</span>
          <span>Mecánico: <strong>${esc(mec?.name || "—")}</strong></span>
          <span>Entrada: ${esc(fechaHora(orden.fecha_entrada))}</span>
        </p>
        ${staff ? `<button type="button" class="btn btn-ghost btn-chico no-imprimir" data-accion="imprimir">Imprimir</button>` : ""}
      </section>

      ${
        orden.estado === "cancelada"
          ? `<div class="aviso-banda aviso-peligro">Esta orden fue cancelada. Los repuestos volvieron al inventario.</div>`
          : `<ol class="pasos" aria-label="Progreso de la orden">${pasos}</ol>`
      }

      ${
        cerrada
          ? ""
          : `<div class="acciones no-imprimir">
              ${
                siguiente
                  ? `<button type="button" class="btn btn-primario" data-accion="siguiente" data-estado="${siguiente}">${
                      siguiente === "entregada" ? "Entregar al cliente" : "Pasar a: " + esc(ESTADOS[siguiente].texto)
                    }</button>`
                  : mecanico && orden.estado === "lista"
                    ? `<p class="ayuda">Recepción se encarga de entregar el vehículo.</p>`
                    : recepcion
                      ? `<p class="ayuda">El mecánico va actualizando el progreso. Podrás entregar el vehículo cuando esté lista.</p>`
                      : ""
              }
              ${recepcion ? "" : `<button type="button" class="btn btn-ghost" data-accion="estado">Cambiar estado…</button>`}
              ${staff ? `<button type="button" class="btn btn-ghost texto-peligro" data-accion="cancelar">Cancelar orden</button>` : ""}
            </div>`
      }

      <section class="seccion">
        <div class="seccion-cab"><h2>Problema y diagnóstico</h2></div>
        <div class="tarjeta">
          <small>Problema reportado</small>
          <p class="texto-multi">${esc(orden.problema)}</p>
          <small style="display:block;margin-top:12px">Diagnóstico del mecánico</small>
          ${
            !anota
              ? `<p class="texto-multi">${esc(orden.diagnostico || "Todavía sin diagnóstico.")}</p>`
              : `<textarea id="diagnostico" class="entrada" rows="3" maxlength="2000" placeholder="Qué se encontró y qué se recomienda…">${esc(orden.diagnostico)}</textarea>
                 <button type="button" class="btn btn-ghost btn-chico no-imprimir" data-accion="diag" style="margin-top:8px">Guardar diagnóstico</button>`
          }
        </div>
      </section>

      <section class="seccion">
        <div class="seccion-cab">
          <h2>Mano de obra</h2>
          ${!anota ? "" : `<button type="button" class="btn btn-ghost btn-chico no-imprimir" data-accion="add-trabajo">+ Agregar trabajo</button>`}
        </div>
        <div class="tarjeta">
          ${
            trabajos.length
              ? trabajos
                  .map(
                    (t) => `<div class="fila-item">
                      <span class="fi-texto">${esc(t.descripcion)}</span>
                      <b>${esc(dinero(t.precio))}</b>
                      ${!anota ? "" : `<button type="button" class="icono-btn no-imprimir" data-accion="del-trabajo" data-id="${esc(t.id)}" aria-label="Quitar trabajo">🗑</button>`}
                    </div>`
                  )
                  .join("")
              : vacio("Aún no hay trabajos anotados.", "🔧")
          }
        </div>
      </section>

      <section class="seccion">
        <div class="seccion-cab">
          <h2>Repuestos usados</h2>
          ${!anota ? "" : `<button type="button" class="btn btn-ghost btn-chico no-imprimir" data-accion="add-repuesto">+ Agregar repuesto</button>`}
        </div>
        <div class="tarjeta">
          ${
            usados.length
              ? usados
                  .map((u) => {
                    const r = u.expand?.repuesto;
                    return `<div class="fila-item">
                      <span class="fi-texto">${esc(r?.nombre || "Repuesto")}<small>${u.cantidad} × ${esc(dinero(u.precio_unitario))}</small></span>
                      <b>${esc(dinero(u.cantidad * u.precio_unitario))}</b>
                      ${!anota ? "" : `<button type="button" class="icono-btn no-imprimir" data-accion="del-repuesto" data-id="${esc(u.id)}" aria-label="Quitar repuesto">🗑</button>`}
                    </div>`;
                  })
                  .join("")
              : vacio("No se han usado repuestos.", "📦")
          }
        </div>
      </section>

      <section class="seccion">
        <div class="seccion-cab"><h2>Resumen</h2></div>
        <div class="tarjeta resumen">
          <div class="res-fila"><span>Mano de obra</span><b>${esc(dinero(orden.total_mano_obra))}</b></div>
          <div class="res-fila"><span>Repuestos</span><b>${esc(dinero(orden.total_repuestos))}</b></div>
          <div class="res-fila res-total"><span>Total</span><b>${esc(dinero(orden.total))}</b></div>
          ${
            staff
              ? `<div class="res-fila"><span>Pagado</span><b>${esc(dinero(orden.pagado))}</b></div>
                 <div class="res-fila ${pendiente > 0 ? "res-debe" : "res-ok"}"><span>${pendiente > 0 ? "Pendiente" : orden.total > 0 ? "Saldado" : "Pendiente"}</span><b>${esc(dinero(pendiente))}</b></div>
                 <div class="progreso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${orden.total ? Math.round((orden.pagado / orden.total) * 100) : 0}">
                   <i style="width:${orden.total ? Math.min(100, (orden.pagado / orden.total) * 100) : 0}%"></i>
                 </div>`
              : ""
          }
        </div>
      </section>

      ${
        staff
          ? `<section class="seccion">
              <div class="seccion-cab">
                <h2>Pagos</h2>
                ${pendiente > 0 && orden.estado !== "cancelada" ? `<button type="button" class="btn btn-primario btn-chico no-imprimir" data-accion="add-pago">+ Registrar pago</button>` : ""}
              </div>
              <div class="tarjeta">
                ${
                  pagos.length
                    ? pagos
                        .map(
                          (p) => `<div class="fila-item">
                            <span class="fi-texto">${esc(fechaHora(p.fecha))} · ${esc(p.metodo)}<small>${esc(p.nota || "")}${p.expand?.registrado_por ? (p.nota ? " · " : "") + esc(p.expand.registrado_por.name || "") : ""}</small></span>
                            <b>${esc(dinero(p.monto))}</b>
                            ${dueno ? `<button type="button" class="icono-btn no-imprimir" data-accion="del-pago" data-id="${esc(p.id)}" aria-label="Eliminar pago">🗑</button>` : ""}
                          </div>`
                        )
                        .join("")
                    : vacio("Todavía no hay pagos registrados.", "💵")
                }
              </div>
            </section>`
          : ""
      }`;
  }

  // ---- Acciones ---------------------------------------------------------------
  async function aplicarEstado(nuevo) {
    const { orden } = datos;
    if (nuevo === "entregada") {
      const deuda = saldoDe(orden);
      const ok = await confirmar(
        "Entregar vehículo",
        deuda > 0
          ? `El cliente aún debe ${dinero(deuda)}. ¿Entregar el vehículo de todos modos? Quedará en la lista de deudores.`
          : "¿Confirmas que el vehículo se entrega al cliente? Después la orden ya no se podrá modificar.",
        { textoOk: "Entregar" }
      );
      if (!ok) return;
    }
    if (nuevo === "cancelada") {
      const ok = await confirmar(
        "Cancelar orden",
        "Los repuestos usados volverán al inventario y la orden quedará cancelada. Esta acción no se puede deshacer.",
        { textoOk: "Cancelar orden", peligro: true }
      );
      if (!ok) return;
    }
    try {
      await pb.collection("ordenes").update(id, { estado: nuevo });
      toast(`Orden: ${ESTADOS[nuevo].texto.toLowerCase()}.`);
      await recargar();
    } catch (err) {
      toast(mensajeError(err), "error");
    }
  }

  function elegirEstado() {
    const actual = datos.orden.estado;
    let permitidos = mecanico ? [...ESTADOS_MECANICO] : ["recibida", "en_diagnostico", "en_reparacion", "lista"];
    if (dueno && actual === "lista") permitidos.push("entregada");
    permitidos = permitidos.filter((e) => e !== actual);

    const { cuerpo, cerrar } = abrirModal(
      "Cambiar estado",
      `<div class="opciones">${permitidos
        .map((e) => `<button type="button" class="opcion" data-e="${e}">${badgeEstado(e)}</button>`)
        .join("")}</div>
       ${dueno && actual !== "lista" ? `<p class="ayuda" style="margin-top:10px">Para entregar, la orden debe estar primero “lista para entregar”.</p>` : ""}`
    );
    cuerpo.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-e]");
      if (!b) return;
      cerrar();
      aplicarEstado(b.dataset.e);
    });
  }

  async function agregarTrabajo() {
    const r = await formularioModal({
      titulo: "Agregar trabajo",
      textoBoton: "Agregar",
      campos: [
        { name: "descripcion", label: "Trabajo realizado", requerido: true, max: 300, lista: TRABAJOS_COMUNES },
        { name: "precio", label: "Mano de obra", tipo: "number", requerido: true, min: 0, paso: 0.01 },
      ],
      enviar: (d) => pb.collection("trabajos").create({ orden: id, ...d }),
    });
    if (r) {
      toast("Trabajo agregado.");
      recargar();
    }
  }

  async function agregarRepuesto() {
    let todos;
    try {
      todos = await pb.collection("repuestos").getFullList({ sort: "nombre" });
    } catch (err) {
      toast(mensajeError(err), "error");
      return;
    }

    const { cuerpo, cerrar } = abrirModal("Agregar repuesto", `<div id="rep-paso"></div>`, { ancho: "520px" });
    const paso = cuerpo.querySelector("#rep-paso");

    function paso1() {
      paso.innerHTML = `${cajaBusqueda("q-rep", "Buscar por nombre o código")}<div id="rep-res" class="opciones" style="margin-top:10px"></div>`;
      const res = paso.querySelector("#rep-res");
      const pintar = (q = "") => {
        const t = q.trim().toLowerCase();
        const vis = todos.filter((r) => !t || r.nombre.toLowerCase().includes(t) || r.codigo.toLowerCase().includes(t));
        res.innerHTML = vis.length
          ? vis
              .map(
                (r) => `<button type="button" class="opcion" data-id="${esc(r.id)}"${r.existencias < 1 ? " disabled" : ""}>
                  <strong>${esc(r.nombre)}</strong>
                  <small>${esc(r.codigo)} · ${esc(dinero(r.precio_venta))} · ${r.existencias < 1 ? "agotado" : r.existencias + " disponibles"}</small>
                </button>`
              )
              .join("")
          : vacio("No hay repuestos con ese nombre.", "🔎");
      };
      pintar();
      paso.querySelector("#q-rep").addEventListener("input", (ev) => pintar(ev.target.value));
      paso.querySelector("#q-rep").focus();
      res.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-id]");
        if (b) paso2(todos.find((r) => r.id === b.dataset.id));
      });
    }

    function paso2(r) {
      paso.innerHTML = `
        <form novalidate>
          <div class="seleccion" style="margin-bottom:14px">
            <div><strong>${esc(r.nombre)}</strong><br /><small>${esc(dinero(r.precio_venta))} c/u · ${r.existencias} disponibles</small></div>
          </div>
          <div class="error-form" role="alert" hidden></div>
          <div class="campo">
            <label for="cantidad">Cantidad</label>
            <input id="cantidad" name="cantidad" type="number" inputmode="numeric" min="1" max="${r.existencias}" step="1" value="1" required />
          </div>
          <p>Subtotal: <strong id="subtotal">${esc(dinero(r.precio_venta))}</strong></p>
          <div class="modal-acciones" style="margin-top:14px">
            <button type="button" class="btn btn-ghost" data-volver>Volver</button>
            <button type="submit" class="btn btn-primario">Agregar</button>
          </div>
        </form>`;
      const form = paso.querySelector("form");
      const caja = paso.querySelector(".error-form");
      const sub = paso.querySelector("#subtotal");
      form.elements.cantidad.addEventListener("input", (ev) => {
        sub.textContent = dinero((Number(ev.target.value) || 0) * r.precio_venta);
      });
      form.elements.cantidad.focus();
      form.elements.cantidad.select();
      paso.querySelector("[data-volver]").addEventListener("click", paso1);
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        caja.hidden = true;
        if (!form.reportValidity()) return;
        await conBoton(form.querySelector('[type="submit"]'), async () => {
          try {
            await pb.collection("orden_repuestos").create({
              orden: id,
              repuesto: r.id,
              cantidad: Number(form.elements.cantidad.value),
            });
            cerrar();
            toast(`${r.nombre} agregado. Existencias actualizadas.`);
            recargar();
          } catch (err) {
            caja.textContent = mensajeError(err);
            caja.hidden = false;
          }
        });
      });
    }

    paso1();
  }

  async function registrarPago() {
    const pend = saldoDe(datos.orden);
    const r = await formularioModal({
      titulo: "Registrar pago",
      textoBoton: "Registrar",
      nota: `Saldo pendiente de la orden: ${dinero(pend)}. Si el cliente paga en dos partes, registra cada pago por separado.`,
      valores: { monto: pend, metodo: "efectivo" },
      campos: [
        { name: "monto", label: "Monto", tipo: "number", requerido: true, min: 0.01, maxNum: pend, paso: 0.01 },
        {
          name: "metodo",
          label: "Método de pago",
          tipo: "select",
          requerido: true,
          opciones: [
            { valor: "efectivo", texto: "Efectivo" },
            { valor: "transferencia", texto: "Transferencia" },
            { valor: "tarjeta", texto: "Tarjeta" },
          ],
        },
        { name: "nota", label: "Nota", max: 300 },
      ],
      enviar: (d) => pb.collection("pagos").create({ orden: id, ...d }),
    });
    if (r) {
      toast("Pago registrado.");
      recargar();
    }
  }

  async function eliminar(coleccion, regId, titulo, mensaje, aviso) {
    const ok = await confirmar(titulo, mensaje, { textoOk: "Eliminar", peligro: true });
    if (!ok) return;
    try {
      await pb.collection(coleccion).delete(regId);
      toast(aviso);
      recargar();
    } catch (err) {
      toast(mensajeError(err), "error");
    }
  }

  const acciones = {
    siguiente: (b) => aplicarEstado(b.dataset.estado),
    estado: elegirEstado,
    cancelar: () => aplicarEstado("cancelada"),
    imprimir: () => window.print(),
    diag: (b) =>
      conBoton(b, async () => {
        try {
          await pb.collection("ordenes").update(id, { diagnostico: raiz.querySelector("#diagnostico").value.trim() });
          toast("Diagnóstico guardado.");
          await recargar();
        } catch (err) {
          toast(mensajeError(err), "error");
        }
      }),
    "add-trabajo": agregarTrabajo,
    "add-repuesto": agregarRepuesto,
    "add-pago": registrarPago,
    "del-trabajo": (b) => eliminar("trabajos", b.dataset.id, "Quitar trabajo", "¿Quitar este trabajo de la orden?", "Trabajo eliminado."),
    "del-repuesto": (b) =>
      eliminar("orden_repuestos", b.dataset.id, "Quitar repuesto", "El repuesto volverá a las existencias del inventario. ¿Quitarlo de la orden?", "Repuesto devuelto al inventario."),
    "del-pago": (b) =>
      eliminar("pagos", b.dataset.id, "Eliminar pago", "El monto dejará de contarse como pagado. ¿Eliminar este pago?", "Pago eliminado."),
  };

  raiz.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-accion]");
    if (b) acciones[b.dataset.accion]?.(b);
  });

  // ---- Primera carga ------------------------------------------------------------
  try {
    datos = await leer();
  } catch (err) {
    raiz.innerHTML = vacio(
      err.status === 404 ? "La orden no existe o no tienes acceso a ella." : mensajeError(err),
      err.status === 404 ? "🔎" : "⚠"
    );
    return;
  }
  dibujar();
}
