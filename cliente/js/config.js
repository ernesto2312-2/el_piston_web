// Configuración del cliente.

// Dirección del servidor PocketBase.
// - Si el cliente se sirve desde el propio PocketBase (puerto 8090), usa ese mismo origen.
// - En cualquier otro caso usa 127.0.0.1:8090.
// Se puede cambiar sin tocar el código: localStorage.setItem("pb_url", "http://192.168.1.10:8090")
export const PB_URL =
  localStorage.getItem("pb_url") || (location.port === "8090" ? location.origin : "http://127.0.0.1:8090");

// Muestra botones de "acceso rápido" con las cuentas de prueba en la pantalla de login.
// Ponlo en false en un taller real.
export const MOSTRAR_ACCESOS_DEMO = true;

// Símbolo que se antepone a los importes.
export const MONEDA = "$";

// Una pieza se considera "por agotarse" cuando existencias <= stock mínimo.
