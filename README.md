# Taller El Pistón — sistema web

Aplicación web para llevar el trabajo diario de un taller mecánico de barrio (dos mecánicos y una recepcionista): clientes, vehículos, órdenes de servicio, inventario de repuestos, cobros y deudores. La información está centralizada en un servidor **PocketBase**, y el cliente (HTML, CSS y JavaScript) se usa igual desde la computadora de recepción que desde el teléfono de los mecánicos.

- **Asignatura:** Programación para Dispositivos Móviles
- **Profesor:** Ing. Roilán Rodríguez Castillo
- **Modalidad:** individual

## Estructura del repositorio

```
taller-el-piston/
├── servidor/                  PocketBase 0.41.1
│   ├── pb_migrations/         esquema, relaciones y reglas de acceso + datos de prueba
│   └── pb_hooks/              lógica de negocio en el servidor (stock, totales, pagos)
├── cliente/                   HTML + CSS + JavaScript (módulos ES, sin framework)
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js             sesión, rutas y menú por rol
│       ├── api.js             conexión con PocketBase y utilidades
│       ├── ui.js              avisos, modales y confirmaciones
│       ├── formularios.js     formulario modal genérico (cliente, vehículo…)
│       ├── componentes.js     piezas compartidas entre pantallas
│       ├── vendor/            SDK oficial de PocketBase (copia local)
│       └── vistas/            login, panel, órdenes, clientes, inventario, deudores
├── capturas/                  capturas de la aplicación en uso
└── README.md
```

## Cómo ejecutar el proyecto (Windows)

**Requisitos:** PocketBase 0.41.1 para Windows (`pocketbase_0.41.1_windows_amd64.zip`, de https://github.com/pocketbase/pocketbase/releases) y, para servir el cliente, Python 3 (o usar el propio PocketBase, ver opción B).

1. Descomprime el zip de PocketBase y copia `pocketbase.exe` dentro de la carpeta `servidor/`.
2. Abre una terminal en `servidor/` y crea el superusuario del panel de administración:
   ```
   .\pocketbase.exe superuser upsert admin@elpiston.test admin12345678
   ```
3. Arranca el servidor (la primera vez aplica las migraciones y crea las colecciones y los datos de prueba):
   ```
   .\pocketbase.exe serve
   ```
   - API: http://127.0.0.1:8090/api/
   - Panel de administración: http://127.0.0.1:8090/_/
4. Sirve el cliente, con una de estas dos opciones:
   - **A) Servidor estático aparte.** En otra terminal, dentro de `cliente/`:
     ```
     python -m http.server 5500
     ```
     y abre http://localhost:5500. (No funciona abriendo `index.html` con doble clic, porque usa módulos ES.)
   - **B) Desde el propio PocketBase**, sin segundo servidor:
     ```
     .\pocketbase.exe serve --publicDir ..\cliente
     ```
     y abre http://127.0.0.1:8090.

Si PocketBase corre en otra dirección (por ejemplo, para probar desde el teléfono dentro de la misma red), se cambia sin tocar el código, desde la consola del navegador:
`localStorage.setItem("pb_url", "http://192.168.1.10:8090")`.

### Cuentas de prueba

Todas usan la contraseña `Piston2026!`.

| Usuario | Rol |
|---|---|
| dueno@elpiston.test | Dueño |
| recepcion@elpiston.test | Recepción |
| mecanico1@elpiston.test | Mecánico |
| mecanico2@elpiston.test | Mecánico |

La pantalla de login tiene botones de acceso rápido con estas cuentas. En un taller real: borrar `servidor/pb_migrations/1730000100_datos_demo.js` antes del primer arranque, poner `MOSTRAR_ACCESOS_DEMO = false` en `cliente/js/config.js` y crear los usuarios desde el panel de administración.

## Modelo de datos

```
users (auth, campo rol)           clientes ──< vehiculos ──< ordenes >── users (mecánico)
 dueno | recepcion | mecanico                                  │
                                              ┌────────────────┼────────────────┐
                                           trabajos     orden_repuestos      pagos
                                        (mano de obra)   │ (cantidad,         (monto, fecha,
                                                         │  precio_unitario)   método)
                                                     repuestos (inventario)
```

| Colección | Campos principales |
|---|---|
| `users` | email, nombre, **rol** (`dueno`, `recepcion`, `mecanico`) |
| `clientes` | nombre, teléfono, dirección (opcional) |
| `vehiculos` | cliente, matrícula (única), marca, modelo, año, kilometraje |
| `ordenes` | vehículo, mecánico, fecha de entrada, problema, diagnóstico, kilometraje, **estado**, totales calculados |
| `trabajos` | orden, descripción, precio de mano de obra |
| `repuestos` | nombre, código (único), precio de venta, existencias, stock mínimo |
| `orden_repuestos` | orden, repuesto, cantidad, precio unitario (copiado al usarlo) |
| `pagos` | orden, monto, fecha, método, nota, registrado por |

Estados de una orden: `recibida → en_diagnostico → en_reparacion → lista → entregada`, y `cancelada`.

## Reglas de acceso

| | Dueño | Recepción | Mecánico |
|---|---|---|---|
| Usuarios | crear, editar, borrar | ver | ver; editar su perfil (sin cambiar su rol) |
| Clientes y vehículos | todo | registrar y editar | solo los de sus órdenes (lectura) |
| Órdenes | ve y puede todo | crea órdenes; **lee** el progreso; entrega (si está lista) y cancela | **solo las asignadas**: avanza el estado hasta "lista" y escribe el diagnóstico |
| Trabajos y repuestos usados | edita (para corregir) | solo lectura | **los anota**, solo en sus órdenes |
| Inventario | gestiona todo (altas, cambios, compras) | no entra | solo consulta |
| Pagos | todo (incluye borrar) | registra al entregar | sin acceso |
| Facturación, carga por mecánico y alertas de stock | sí | no | no |

En resumen: el **mecánico** hace el trabajo y lo anota; la **recepción** recibe al cliente, entrega el vehículo y cobra, y solo mira el progreso; el **dueño** lo supervisa todo.

Las reglas se declaran en `servidor/pb_migrations/` (un archivo por colección, que PocketBase ejecuta en orden; `1730000090_roles_v2.js` reparte las responsabilidades entre los tres roles). Las que no se pueden expresar como regla de colección (por ejemplo, "el mecánico solo puede tocar el estado") las valida el servidor en `pb_hooks/`, así que no dependen de que el cliente se porte bien.

## Lógica de negocio en el servidor (`pb_hooks/`)

- **Existencias:** al agregar un repuesto a una orden, las existencias bajan dentro de la misma transacción. Si no alcanzan, se rechaza con un mensaje claro. Al quitarlo, vuelven; al cancelar la orden, vuelven todos.
- **Precio congelado:** el precio del repuesto se copia a la línea de la orden. Si luego el inventario sube de precio, las órdenes viejas no cambian.
- **Totales calculados por el servidor:** mano de obra, repuestos, total y pagado se recalculan en cada cambio y el cliente no puede escribirlos.
- **Pagos:** no se puede pagar más que el saldo pendiente, ni en órdenes canceladas. Soportan pagos en dos partes (el saldo se actualiza solo).
- **Órdenes:** nacen "recibidas"; solo se entrega una orden que esté "lista"; una orden entregada o cancelada es definitiva y ya no admite cambios; no se puede cancelar una orden con pagos; solo se asigna a usuarios con rol mecánico. La recepción solo puede entregar o cancelar (no cambia estados intermedios ni escribe el diagnóstico) y el mecánico no puede entregar ni cancelar.
- **Kilometraje:** al crear la orden, el kilometraje del vehículo se actualiza al último registrado.
- **Matrículas y códigos de repuesto:** se guardan en mayúsculas y sin espacios, y el servidor rechaza duplicados ("p 123456" y "P123456" no son dos vehículos).

## Decisiones de diseño

El enunciado dejaba algunos puntos abiertos. Esto es lo que decidí y por qué:

1. **El dueño es un usuario más, con rol propio.** El cliente web necesita que alguien con permisos completos pueda entrar sin usar el panel de PocketBase.
2. **Números de orden.** Las órdenes se identifican por matrícula, fecha y cliente, no por un número consecutivo, porque es como las busca el personal en un taller de barrio.
3. **Deuda = trabajo terminado y sin cobrar completo.** Una orden "lista" o "entregada" con saldo cuenta como deuda. Las órdenes aún en proceso no, porque su total todavía puede cambiar (hay un interruptor para incluirlas). Se puede entregar con saldo pendiente: precisamente por eso existe la pantalla de deudores.
4. **Facturación = total de las órdenes recibidas en el período** (sin las canceladas). Además se muestra lo **cobrado** (pagos registrados en el período), porque ambas cifras responden preguntas distintas.
5. **Alerta de repuestos:** un repuesto está "por agotarse" cuando `existencias <= stock mínimo`. Aparece en el panel del dueño (que es quien compra) y, además, recibe un aviso en pantalla en tiempo real cuando un repuesto cruza el mínimo (suscripción de PocketBase).
6. **Pagos y líneas de repuestos no se editan:** se eliminan y se vuelven a crear. Así el stock y los saldos siempre cuadran, y solo el dueño puede borrar pagos.
7. **Responsabilidades por rol:** el mecánico anota trabajos y repuestos (como describe el enunciado); la recepción recibe y entrega, y por eso solo lee el progreso; el cobro se hace en recepción porque ocurre al entregar. El dueño puede hacerlo todo, para supervisar y corregir. El inventario lo gestiona el dueño, que es quien compra.
8. **Moneda:** importes con el símbolo `$` (configurable en `cliente/js/config.js`).

### Experiencia de usuario

- **Móvil primero:** menú inferior en el teléfono y lateral en la computadora; tarjetas en vez de tablas anchas; botones y campos de al menos 44 px; ventanas modales que suben desde abajo en el móvil.
- **Cada rol ve lo suyo:** el mecánico entra a "Mis órdenes" (sin dinero, clientes ni deudores) y tiene el inventario en modo consulta; la recepción tiene un panel de mostrador (nueva orden, vehículos listos para entregar, lo que falta por cobrar); el dueño tiene el panel completo con facturación, carga por mecánico y alertas de repuestos. El menú y los botones cambian según el rol, y el servidor lo exige además con sus propias reglas.
- **Nueva orden en tres pasos** (cliente → vehículo → datos), con búsqueda por nombre, teléfono o matrícula; un cliente con un solo vehículo lo trae ya seleccionado; el kilometraje se rellena con el último registrado; y se sugiere el mecánico con menos órdenes abiertas.
- **Detalle de orden:** barra de progreso del estado, botón principal con el siguiente paso, trabajos comunes sugeridos al escribir, selector de repuestos con búsqueda que muestra existencias y deshabilita los agotados, pagos con el saldo pendiente ya propuesto, y botón de imprimir.
- **Retroalimentación:** avisos de éxito o error, botones que se desactivan mientras envían, estados de carga y mensajes de "no hay resultados", y confirmación antes de entregar, cancelar o eliminar.
- **Seguridad en el cliente:** todo texto que viene de la base de datos se escapa antes de mostrarse; el SDK de PocketBase va incluido en el proyecto, por lo que el sistema no depende de internet.
- **Accesibilidad básica:** etiquetas en los campos, foco visible, `aria-pressed` en filtros, `role="alert"` en errores y respeto de "reducir movimiento".

## Limitaciones conocidas

- Una sola moneda y un solo taller.
- Los pagos y las líneas de repuestos no se editan (ver decisión 6).
- No hay recuperación de contraseña por correo: el dueño restablece contraseñas desde el panel de administración de PocketBase.
- Las capturas de `capturas/` corresponden a los datos de prueba.
