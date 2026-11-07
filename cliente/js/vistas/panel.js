// Panel de inicio, distinto para cada rol:
//  - Dueño: lo supervisa todo (órdenes, carga por mecánico, repuestos, cobros y facturación).
//  - Recepción: el mostrador (nueva orden, vehículos listos para entregar, lo que falta por cobrar).
//  - Mecánico: solo sus órdenes abiertas.

import { pb, ESTADOS, ESTADOS_ABIERTOS, FILTRO_ABIERTAS, esDueno, esRecepcion, usuario, dinero, aIso, mensajeError } from "../api.js";
import { esc, vacio, cargando, toast } from "../ui.js";
import { tarjetaOrden } from "../componentes.js";

const PERIODOS = [
  { id: "hoy", texto: "Hoy" },
  { id: "semana", texto: "Semana" },
  { id: "mes", texto: "Mes" },
  { id: "rango", texto: "Rango" },
];

export default async function panel(cont) {
  const dueno = esDueno();
  const recepcion = esRecepcion();
  const yo = usuario();

  cont.innerHTML = `
    <div class="pantalla-cab">
      <div>
        <h1>${dueno ? "Panel del taller" : recepcion ? "Recepción" : "Mis órdenes"}</h1>
        <p>Hola, ${esc(yo.name || yo.email)}.</p>
      </div>
      ${dueno || recepcion ? `<a class="btn btn-primario" href="#/ordenes/nueva">+ Nueva orden</a>` : ""}
    </div>
    <div id="mosaicos" class="mosaicos${recepcion ? " tres" : ""}"></div>
    ${recepcion ? `<section class="seccion" id="sec-listas"></section>` : ""}
    <section class="seccion" id="sec-abiertas"></section>
    ${
      dueno
        ? `<section class="seccion" id="sec-mecanicos"></section>
           <section class="seccion" id="sec-repuestos"></section>
           <section class="seccion" id="sec-facturacion"></section>`
        : ""
    }`;

  const q = (id) => cont.querySelector(id);
  q("#sec-abiertas").innerHTML = cargando();

  // Las reglas del servidor ya limitan al mecánico a sus propias órdenes.
  let abiertas;
  try {
    abiertas = await pb.collection("ordenes").getFullList({
      filter: FILTRO_ABIERTAS,
      sort: "-fecha_entrada",
      expand: "vehiculo.cliente,mecanico",
    });
  } catch (err) {
    q("#sec-abiertas").innerHTML = vacio(mensajeError(err, "No se pudieron cargar las órdenes."), "⚠");
    return;
  }

  dibujarAbiertas(q("#sec-abiertas"), abiertas);

  if (!dueno && !recepcion) {
    q("#mosaicos").innerHTML = mosaico("Abiertas", abiertas.length) + mosaico("Listas", contar(abiertas, "lista"));
    return;
  }

  // Misma regla que la pantalla de deudores: trabajo terminado (lista o entregada) y sin cobrar completo.
  const pedirDeuda = () =>
    pb
      .collection("ordenes")
      .getFullList({ filter: '(estado = "lista" || estado = "entregada") && total > pagado', fields: "total,pagado" })
      .catch(() => null);
  const sumarDeuda = (d) => (d ? d.reduce((s, o) => s + (o.total - o.pagado), 0) : null);

  if (recepcion) {
    const listas = abiertas.filter((o) => o.estado === "lista");
    q("#sec-listas").innerHTML =
      `<div class="seccion-cab"><h2>Listas para entregar</h2></div>` +
      (listas.length
        ? `<div class="lista dos">${listas.map(tarjetaOrden).join("")}</div>`
        : `<div class="tarjeta">${vacio("Ningún vehículo está listo todavía. El mecánico avisa al terminar.", "🚗")}</div>`);

    const porCobrarRecep = sumarDeuda(await pedirDeuda());
    q("#mosaicos").innerHTML =
      mosaico("En el taller", abiertas.length, "#/ordenes") +
      mosaico("Listas para entregar", listas.length, "#/ordenes?estado=lista") +
      mosaico("Por cobrar", porCobrarRecep === null ? "—" : dinero(porCobrarRecep), "#/deudores");
    return;
  }

  // Resto del panel (solo dueño): se cargan en paralelo y cada bloque falla por separado.
  const [repuestosBajos, deuda, mecanicos] = await Promise.all([
    pb.collection("repuestos").getFullList({ filter: "existencias <= stock_minimo", sort: "existencias,nombre" }).catch(() => null),
    pedirDeuda(),
    pb.collection("users").getFullList({ filter: 'rol = "mecanico"', sort: "name" }).catch(() => null),
  ]);

  const porCobrar = sumarDeuda(deuda);

  q("#mosaicos").innerHTML =
    mosaico("Órdenes abiertas", abiertas.length, "#/ordenes") +
    mosaico("Listas para entregar", contar(abiertas, "lista"), "#/ordenes?estado=lista") +
    mosaico("Por cobrar", porCobrar === null ? "—" : dinero(porCobrar), "#/deudores") +
    mosaico("Repuestos por agotarse", repuestosBajos ? repuestosBajos.length : "—", "#/inventario?bajos=1", !!repuestosBajos?.length);

  dibujarMecanicos(q("#sec-mecanicos"), abiertas, mecanicos);
  dibujarRepuestos(q("#sec-repuestos"), repuestosBajos);
  dibujarFacturacion(q("#sec-facturacion"));
}

// ---------- utilidades ----------

const contar = (ordenes, estado) => ordenes.filter((o) => o.estado === estado).length;

function mosaico(titulo, valor, enlace, alerta = false) {
  const etiqueta = enlace ? "a" : "div";
  return `<${etiqueta} class="mosaico${alerta ? " alerta" : ""}" ${enlace ? `href="${enlace}"` : ""}>
    <span>${esc(titulo)}</span><strong>${esc(valor)}</strong></${etiqueta}>`;
}

// ---------- órdenes abiertas con filtro por estado ----------

function dibujarAbiertas(sec, abiertas) {
  let filtro = "";

  sec.innerHTML = `
    <div class="seccion-cab"><h2>Órdenes abiertas</h2><a href="#/ordenes">Ver todas</a></div>
    <div class="chips" role="group" aria-label="Filtrar por estado">
      <button type="button" class="chip" data-estado="" aria-pressed="true">Todas<b>${abiertas.length}</b></button>
      ${ESTADOS_ABIERTOS.map(
        (e) =>
          `<button type="button" class="chip" data-estado="${e}" aria-pressed="false">${esc(ESTADOS[e].texto)}<b>${contar(abiertas, e)}</b></button>`
      ).join("")}
    </div>
    <div id="lista-abiertas"></div>`;

  const lista = sec.querySelector("#lista-abiertas");
  const pintar = () => {
    const visibles = filtro ? abiertas.filter((o) => o.estado === filtro) : abiertas;
    lista.innerHTML = visibles.length
      ? `<div class="lista dos">${visibles.map(tarjetaOrden).join("")}</div>`
      : vacio(filtro ? "No hay órdenes en este estado." : "No hay órdenes abiertas. ¡Taller al día!", "✔");
  };

  sec.querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      filtro = chip.dataset.estado;
      sec.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      pintar();
    })
  );
  pintar();
}

// ---------- carga por mecánico ----------

function dibujarMecanicos(sec, abiertas, mecanicos) {
  if (!mecanicos) {
    sec.innerHTML = "";
    return;
  }
  const filas = mecanicos.map((m) => {
    const suyas = abiertas.filter((o) => o.mecanico === m.id);
    return { m, suyas };
  });
  const maximo = Math.max(1, ...filas.map((f) => f.suyas.length));

  sec.innerHTML = `
    <div class="seccion-cab"><h2>Carga de trabajo por mecánico</h2></div>
    <div class="tarjeta">
      ${
        filas.length
          ? filas
              .map(({ m, suyas }) => {
                const segmentos = ESTADOS_ABIERTOS.map((e) => {
                  const n = contar(suyas, e);
                  return n ? `<i class="s-${e}" style="width:${(n / maximo) * 100}%" title="${esc(ESTADOS[e].texto)}: ${n}"></i>` : "";
                }).join("");
                return `<a class="barra-fila" href="#/ordenes?mecanico=${esc(m.id)}">
                  <span>${esc(m.name || m.email)}</span>
                  <span class="barra" aria-hidden="true">${segmentos}</span>
                  <b>${suyas.length}</b>
                </a>`;
              })
              .join("")
          : vacio("No hay mecánicos registrados.")
      }
    </div>`;
}

// ---------- repuestos por agotarse ----------

function dibujarRepuestos(sec, bajos) {
  if (!bajos) {
    sec.innerHTML = "";
    return;
  }
  sec.innerHTML = `
    <div class="seccion-cab"><h2>Repuestos por agotarse</h2><a href="#/inventario">Inventario</a></div>
    <div class="tarjeta">
      ${
        bajos.length
          ? bajos
              .slice(0, 8)
              .map(
                (r) => `<div class="fila-simple">
                  <span>${esc(r.nombre)} <small>${esc(r.codigo)}</small></span>
                  <span class="cantidad ${r.existencias === 0 ? "cero" : ""}">${r.existencias === 0 ? "Agotado" : `Quedan ${r.existencias}`} · mín. ${r.stock_minimo}</span>
                </div>`
              )
              .join("") +
            (bajos.length > 8 ? `<p class="ayuda" style="margin-top:8px">y ${bajos.length - 8} más…</p>` : "")
          : vacio("Todos los repuestos tienen existencias suficientes.", "✔")
      }
    </div>`;
}

// ---------- facturación por período ----------

function rangoDe(periodo, desde, hasta) {
  const ini = new Date();
  ini.setHours(0, 0, 0, 0);
  let fin = new Date(ini);
  fin.setDate(fin.getDate() + 1);

  if (periodo === "semana") {
    ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7)); // lunes
    fin = new Date(ini);
    fin.setDate(fin.getDate() + 7);
  } else if (periodo === "mes") {
    ini.setDate(1);
    fin = new Date(ini.getFullYear(), ini.getMonth() + 1, 1);
  } else if (periodo === "rango") {
    const d = new Date(`${desde}T00:00:00`);
    const h = new Date(`${hasta}T00:00:00`);
    if (isNaN(d) || isNaN(h) || h < d) return null;
    h.setDate(h.getDate() + 1);
    return [d, h];
  }
  return [ini, fin];
}

function dibujarFacturacion(sec) {
  const hoy = new Date().toISOString().slice(0, 10);
  const estado = { periodo: "mes", desde: hoy, hasta: hoy };

  sec.innerHTML = `
    <div class="seccion-cab"><h2>Facturación</h2></div>
    <div class="tarjeta">
      <div class="segmentos" role="group" aria-label="Período">
        ${PERIODOS.map((p) => `<button type="button" data-p="${p.id}" aria-pressed="${p.id === estado.periodo}">${p.texto}</button>`).join("")}
      </div>
      <div class="rango-fechas" id="rango" hidden>
        <div class="campo" style="margin:0"><label for="f-desde">Desde</label><input id="f-desde" type="date" value="${hoy}" max="${hoy}" /></div>
        <div class="campo" style="margin:0"><label for="f-hasta">Hasta</label><input id="f-hasta" type="date" value="${hoy}" /></div>
      </div>
      <div id="cifras"></div>
    </div>`;

  const cifras = sec.querySelector("#cifras");
  const rango = sec.querySelector("#rango");
  let ultima = 0;

  async function cargar() {
    const r = rangoDe(estado.periodo, estado.desde, estado.hasta);
    if (!r) {
      cifras.innerHTML = vacio("Elige un rango de fechas válido.", "📅");
      return;
    }
    const [ini, fin] = r;
    const marca = ++ultima;
    cifras.innerHTML = cargando();
    try {
      const [ordenes, pagos] = await Promise.all([
        pb.collection("ordenes").getFullList({
          filter: pb.filter('estado != "cancelada" && fecha_entrada >= {:a} && fecha_entrada < {:b}', { a: aIso(ini), b: aIso(fin) }),
          fields: "total",
        }),
        pb.collection("pagos").getFullList({
          filter: pb.filter("fecha >= {:a} && fecha < {:b}", { a: aIso(ini), b: aIso(fin) }),
          fields: "monto",
        }),
      ]);
      if (marca !== ultima) return; // llegó tarde una consulta vieja
      const facturado = ordenes.reduce((s, o) => s + o.total, 0);
      const cobrado = pagos.reduce((s, p) => s + p.monto, 0);
      cifras.innerHTML = `
        <div class="cifras">
          <div><span>Facturado</span><strong>${dinero(facturado)}</strong></div>
          <div><span>Cobrado</span><strong>${dinero(cobrado)}</strong></div>
          <div><span>Órdenes</span><strong>${ordenes.length}</strong></div>
        </div>
        <p class="ayuda" style="margin-top:10px">Facturado: total de las órdenes recibidas en el período (sin canceladas). Cobrado: pagos registrados en el período.</p>`;
    } catch (err) {
      if (marca !== ultima) return;
      cifras.innerHTML = vacio("No se pudo calcular la facturación.", "⚠");
      toast(mensajeError(err), "error");
    }
  }

  sec.querySelectorAll("[data-p]").forEach((b) =>
    b.addEventListener("click", () => {
      estado.periodo = b.dataset.p;
      sec.querySelectorAll("[data-p]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      rango.hidden = estado.periodo !== "rango";
      cargar();
    })
  );
  sec.querySelector("#f-desde").addEventListener("change", (ev) => {
    estado.desde = ev.target.value;
    cargar();
  });
  sec.querySelector("#f-hasta").addEventListener("change", (ev) => {
    estado.hasta = ev.target.value;
    cargar();
  });

  cargar();
}
