/**
 * Carga turnos de ejemplo para ver el panel con datos.
 *   node server/seed.js            → llena los próximos 3 días
 *   node server/seed.js --limpiar  → vacía la base antes de llenarla
 */
import { db } from './db.js';
import { reservar, bloquear, canchasDe } from './turnos.js';
import { DISCIPLINAS } from './config.js';
import * as T from './tiempo.js';

if (process.argv.includes('--limpiar')) {
  db.exec('DELETE FROM ocupacion; DELETE FROM reservas;');
  console.log('Base vaciada.');
}

const NOMBRES = [
  'Martín Suárez', 'Lucía Ferrari', 'Nicolás Paz', 'Camila Duarte', 'Facundo Ríos',
  'Julieta Moreno', 'Tomás Alcaraz', 'Sofía Bianchi', 'Ignacio Vega', 'Valentina Roldán',
  'Bruno Castelli', 'Agustina Peralta', 'Joaquín Méndez', 'Delfina Ortiz', 'Santiago Rossi',
];

const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];
const telefono = () => `223${String(Math.floor(1000000 + Math.random() * 8999999))}`;

let creadas = 0;
let choques = 0;

for (let d = 0; d < 3; d++) {
  const fecha = T.sumarDias(T.hoy(), d);

  for (const disciplina of DISCIPLINAS) {
    const canchas = canchasDe(disciplina.slug);
    // Más movimiento a la tarde-noche, como en la vida real.
    const franjas = [
      { desde: 9,  hasta: 13, intentos: canchas.length },
      { desde: 15, hasta: 19, intentos: canchas.length * 2 },
      { desde: 19, hasta: 23, intentos: canchas.length * 3 },
    ];

    for (const f of franjas) {
      for (let i = 0; i < f.intentos; i++) {
        const hora = f.desde + Math.floor(Math.random() * (f.hasta - f.desde));
        const media = Math.random() < 0.5 ? '00' : '30';
        try {
          reservar({
            disciplina: disciplina.slug,
            fecha,
            hora: `${String(hora).padStart(2, '0')}:${media}`,
            duracionMin: azar(disciplina.duraciones),
            nombre: azar(NOMBRES),
            telefono: telefono(),
          }, null);
          creadas++;
        } catch {
          choques++; // horario tomado o fuera de rango: es esperable
        }
      }
    }
  }
}

// Un bloqueo de mantenimiento para que se vea en la grilla:
// probamos cancha por cancha hasta encontrar una con el horario libre.
let bloqueado = false;
for (const cancha of canchasDe('padel')) {
  try {
    bloquear({
      canchaId: cancha.id,
      fecha: T.sumarDias(T.hoy(), 1),
      hora: '09:00',
      duracionMin: 180,
      motivo: 'Mantenimiento de césped',
    });
    console.log(`Bloqueo de mantenimiento creado en ${cancha.nombre}.`);
    bloqueado = true;
    break;
  } catch { /* esa cancha ya estaba ocupada */ }
}
if (!bloqueado) console.log('No quedó ninguna cancha libre para el bloqueo de ejemplo.');

console.log(`Listo: ${creadas} turnos de ejemplo creados (${choques} intentos descartados por superposición).`);
