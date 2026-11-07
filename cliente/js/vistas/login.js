// Pantalla de inicio de sesión.

import { pb, mensajeError } from "../api.js";
import { MOSTRAR_ACCESOS_DEMO } from "../config.js";
import { esc, conBoton } from "../ui.js";

const CUENTAS_DEMO = [
  { texto: "Dueño", email: "dueno@elpiston.test" },
  { texto: "Recepción", email: "recepcion@elpiston.test" },
  { texto: "Mecánico 1", email: "mecanico1@elpiston.test" },
  { texto: "Mecánico 2", email: "mecanico2@elpiston.test" },
];
const PASSWORD_DEMO = "Piston2026!";

export default function login(contenedor, alEntrar) {
  contenedor.innerHTML = `
    <div class="login">
      <div class="login-caja">
        <div class="login-marca">
          <div class="marca-logo" aria-hidden="true">⚙</div>
          <h1>Taller El Pistón</h1>
          <p>Control de órdenes, inventario y cobros</p>
        </div>
        <form class="tarjeta" id="form-login" novalidate>
          <div id="error-login" class="error-form" role="alert" hidden></div>
          <div class="campo">
            <label for="email">Correo</label>
            <input id="email" name="email" type="email" autocomplete="username" inputmode="email" required />
          </div>
          <div class="campo">
            <label for="password">Contraseña</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required />
          </div>
          <button class="btn btn-primario btn-bloque" type="submit">Entrar</button>
          ${
            MOSTRAR_ACCESOS_DEMO
              ? `<div class="demo">
                  <p>Acceso rápido con las cuentas de prueba:</p>
                  <div class="demo-botones">
                    ${CUENTAS_DEMO.map(
                      (c) => `<button type="button" class="btn btn-ghost btn-chico" data-email="${esc(c.email)}">${esc(c.texto)}</button>`
                    ).join("")}
                  </div>
                </div>`
              : ""
          }
        </form>
      </div>
    </div>`;

  const form = contenedor.querySelector("#form-login");
  const caja = contenedor.querySelector("#error-login");
  const campoEmail = form.elements.email;
  const campoPassword = form.elements.password;
  campoEmail.focus();

  const mostrarError = (texto) => {
    caja.textContent = texto;
    caja.hidden = !texto;
  };

  async function entrar(email, password, boton) {
    mostrarError("");
    if (!email || !password) {
      mostrarError("Escribe tu correo y tu contraseña.");
      return;
    }
    await conBoton(boton, async () => {
      try {
        await pb.collection("users").authWithPassword(email.trim(), password);
        alEntrar();
      } catch (err) {
        mostrarError(
          err.status === 400 ? "Correo o contraseña incorrectos." : mensajeError(err, "No se pudo iniciar sesión.")
        );
        campoPassword.select();
      }
    });
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    entrar(campoEmail.value, campoPassword.value, form.querySelector('button[type="submit"]'));
  });

  form.querySelectorAll("[data-email]").forEach((b) =>
    b.addEventListener("click", () => entrar(b.dataset.email, PASSWORD_DEMO, b))
  );
}
