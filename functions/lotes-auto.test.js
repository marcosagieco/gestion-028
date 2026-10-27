// Pruebas de la regla de lotes-auto.js (corre con: node lotes-auto.test.js).
const { _decidirEstadoLote: decidir } = require("./lotes-auto");

let fallas = 0;
function ok(nombre, cond) { console.log((cond ? "OK   - " : "FALLA - ") + nombre); if (!cond) fallas++; }

const item = (stock) => ({ id: Math.random().toString(36), product: "X", currentStock: stock, initialStock: 10 });

ok("activo con stock: no se toca", decidir({ items: [item(3), item(0)] }) === null);
ok("activo sin stock en ningún producto: se termina", decidir({ items: [item(0), item(0)] }) === "terminar");
ok("stock negativo cuenta como vacío", decidir({ items: [item(-1), item(0)] }) === "terminar");
ok("lote recién creado sin productos: no se termina", decidir({ items: [] }) === null);
ok("lote sin campo items: no se termina", decidir({}) === null);
ok("terminado solo, vuelve a tener stock: se reabre", decidir({ finalizedAt: "2026-10-01", finalizadoAuto: true, items: [item(2)] }) === "reabrir");
ok("terminado solo y sigue en 0: queda terminado", decidir({ finalizedAt: "2026-10-01", finalizadoAuto: true, items: [item(0)] }) === null);
ok("terminado A MANO con stock: no se reabre", decidir({ finalizedAt: "2026-10-01", items: [item(5)] }) === null);
ok("terminado a mano (finalizadoAuto false) con stock: no se reabre", decidir({ finalizedAt: "2026-10-01", finalizadoAuto: false, items: [item(5)] }) === null);
ok("reabierto a mano (finalizedAt null) con stock: no se toca", decidir({ finalizedAt: null, finalizadoAuto: true, items: [item(4)] }) === null);

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodas pasaron.");
process.exit(fallas ? 1 : 0);
