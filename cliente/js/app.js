// Punto de entrada: sesión, navegación por hash (#/panel, #/ordenes...) y estructura general.

import { pb, usuario, esDueno, rol, ROLES } from "./api.js";
import { esc, cargando, toast, vacio } from "./ui.js";

// Cada ruta carga su módulo solo cuando se visita. `roles` limita quién la ve.
const RUTAS = [
  { id: "panel", texto: "Panel", icono: "▦", modulo: "./vistas/panel.js", roles: ["dueno", "recepcion", "mecanico"] },
  { id: "ordenes", texto: "Órdenes", icono: "🔧", modulo: "./vistas/ordenes.js", roles: ["dueno", "recepcion", "mecanico"] },
  { id: "clientes", texto: "Clientes", icono: "👤", modulo: "./vistas/clientes.js", roles: ["dueno", "recepcion"] },
  { id: "inventario", texto: "Inventario", icono: "📦", modulo: "./vistas/inventario.js", roles: ["dueno", "mecanico"] },
  { id: "deudores", texto: "Deudores", icono: "💰", modulo: "./vistas/deudores.js", roles: ["dueno", "recepcion"] },
];

const app = document.getElementById("app");
let desuscribir = null;

// ---- Arranque -----------------------------------------------------------------
async function iniciar() {
  if (pb.authStore.isValid) {
    try {
      await pb.collection("users").authRefresh(); // comprueba que la sesión siga vigente
    } catch (err) {
      if (err.status === 401 || err.status === 403 || err.status === 404) pb.authStore.clear();
    }
  }
  window.addEventListener("hashchange", navegar);
  navegar();
}

// ---- Navegación ---------------------------------------------------------------
function rutaActual() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [camino, consulta = ""] = hash.split("?");
  const [id, ...resto] = camino.split("/");
  return { id: id || "panel", params: resto, consulta: new URLSearchParams(consulta) };
}

async function navegar() {
  if (!pb.authStore.isValid) {
    pararAvisos();
    const { default: login } = await import("./vistas/login.js");
    app.className = "";
    login(app, () => {
      location.hash = "#/panel";
      navegar();
    });
    return;
  }

  const { id, params, consulta } = rutaActual();
  const visibles = RUTAS.filter((r) => r.roles.includes(rol()));
  const ruta = visibles.find((r) => r.id === id);
  if (!ruta) {
    location.hash = "#/panel";
    return;
  }

  if (!document.getElementById("vista")) dibujarMarco(visibles);
  marcarActiva(ruta.id);
  iniciarAvisos();

  const vista = document.getElementById("vista");
  vista.innerHTML = cargando();
  window.scrollTo(0, 0);

  // Si el usuario cambia de pantalla mientras esta carga, se descarta el resultado viejo.
  const solicitud = (navegar.contador = (navegar.contador || 0) + 1);

  try {
    const modulo = await import(ruta.modulo);
    if (solicitud !== navegar.contador) return;
    vista.innerHTML = "";
    await modulo.default(vista, { params, consulta });
  } catch (err) {
    if (solicitud !== navegar.contador) return;
    console.error(err);
    const faltaModulo = err instanceof TypeError && /dynamically imported module|Failed to fetch/i.test(err.message);
    vista.innerHTML = faltaModulo
      ? vacio("Esta pantalla todavía no está disponible.", "🚧")
      : vacio("No se pudo cargar la pantalla. Revisa la conexión con el servidor.", "⚠");
  }
}

// ---- Marco de la aplicación (cabecera + menú) ----------------------------------
function dibujarMarco(visibles) {
  const u = usuario();
  app.className = "con-marco";
  app.innerHTML = `
    <header class="cabecera">
      <a class="marca" href="#/panel"><span class="marca-logo" aria-hidden="true">⚙</span> El Pistón</a>
      <div class="cabecera-usuario">
        <span class="usuario-datos"><strong>${esc(u.name || u.email)}</strong><small>${esc(ROLES[u.rol] || "")}</small></span>
        <button type="button" class="btn btn-ghost btn-chico" id="salir">Salir</button>
      </div>
    </header>
    <nav class="menu" aria-label="Principal">
      ${visibles
        .map(
          (r) =>
            `<a href="#/${r.id}" data-ruta="${r.id}"><span class="menu-icono" aria-hidden="true">${r.icono}</span><span>${esc(r.texto)}</span></a>`
        )
        .join("")}
    </nav>
    <main id="vista" tabindex="-1"></main>`;
  document.getElementById("salir").addEventListener("click", cerrarSesion);
}

function marcarActiva(id) {
  document.querySelectorAll(".menu a").forEach((a) => {
    const activa = a.dataset.ruta === id;
    a.classList.toggle("activa", activa);
    a.toggleAttribute("aria-current", activa);
  });
}

function cerrarSesion() {
  pararAvisos();
  pb.authStore.clear();
  app.innerHTML = "";
  location.hash = "";
  navegar();
}

// ---- Aviso en vivo cuando un repuesto llega al mínimo (es el dueño quien compra) ----
function iniciarAvisos() {
  if (desuscribir || !esDueno()) return;
  desuscribir = pb
    .collection("repuestos")
    .subscribe("*", (ev) => {
      const r = ev.record;
      if (ev.action === "update" && r.existencias <= r.stock_minimo) {
        toast(`Por agotarse: ${r.nombre} (quedan ${r.existencias})`, "aviso", 7000);
      }
    })
    .catch(() => null);
}

function pararAvisos() {
  if (!desuscribir) return;
  pb.collection("repuestos").unsubscribe("*").catch(() => null);
  desuscribir = null;
}

// Si el servidor invalida la sesión (por ejemplo, el dueño borra al usuario), volver al login.
pb.authStore.onChange(() => {
  if (!pb.authStore.isValid && document.getElementById("vista")) {
    pararAvisos();
    app.innerHTML = "";
    navegar();
  }
});

iniciar();
