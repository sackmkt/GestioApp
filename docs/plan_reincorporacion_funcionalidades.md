# Plan para reincorporar funcionalidades avanzadas sin conflictos

Este plan resume un camino sugerido para volver a introducir los módulos de agenda, perfil profesional extendido, ciclo de cobranzas y gestión de centros de salud minimizando conflictos en GitHub. La idea es trabajar en ramas cortas y revisables, agrupando cambios relacionados y verificando cada paso antes de abrir un Pull Request.

## 1. Preparación del entorno

1. Asegurate de tener la rama principal actualizada:
   ```bash
   git checkout main
   git pull origin main
   ```
2. Creá una rama de trabajo limpia por cada feature. Ejemplo para la agenda de turnos:
   ```bash
   git checkout -b feature/agenda-turnos
   ```
3. Ejecutá los tests básicos antes de empezar (build del frontend y, si aplica, pruebas unitarias del backend) para confirmar que el punto de partida está estable.

## 2. Reintroducir funcionalidades en iteraciones chicas

### 2.1 Agenda de turnos básica
- Añadí únicamente el modelo `Turno`, las rutas CRUD en el backend y un listado simple en el frontend sin filtros avanzados.
- Validá el flujo con `npm run build --prefix frontend` y pruebas manuales en el backend con herramientas como Postman.
- Abrí un PR específico describiendo solo esta funcionalidad.

### 2.2 Recordatorios y mejoras de interfaz
- Partiendo de `main`, creá otra rama (`feature/turnos-recordatorios`).
- Extiende el modelo para soportar recordatorios, añade colas de trabajo o banderas de notificación según sea necesario y ajusta las vistas.
- Este segundo PR se apoya en el anterior ya mergeado, por lo que el diff será pequeño.

### 2.3 Perfil profesional extendido
- Rama: `feature/perfil-profesional`.
- Modifica el esquema de usuario, crea el flujo de finalización de perfil y la pantalla de edición.
- Evita tocar archivos no relacionados (por ejemplo, facturas o turnos) para minimizar conflictos.

### 2.4 Ciclo de cobranzas enriquecido
- Rama: `feature/facturacion-lifecycle`.
- Introduce los nuevos estados, fechas de vencimiento y lógica de retenciones paso a paso.
- Documenta cualquier migración de datos necesaria para los documentos existentes.

### 2.5 Centros de salud y vinculación con pacientes
- Rama: `feature/centros-salud`.
- Implementa el modelo, rutas y UI para administrar centros y asociarlos a pacientes.
- Incluye migraciones o scripts para poblar datos de centros si hiciera falta.

## 3. Buenas prácticas para evitar conflictos

- **Commits pequeños y descriptivos:** cada commit debe cubrir un cambio coherente (por ejemplo, “Agregar endpoint POST /api/turnos”).
- **Rebase frecuente:** antes de empujar tu rama, ejecutá `git fetch` y `git rebase origin/main` para incorporar cambios recientes.
- **Resolver conflictos localmente:** si aparece un conflicto, resolvelo en tu entorno, corré los tests y recién ahí empujá la rama actualizada.
- **Revisiones tempranas:** abrí el PR aun cuando falten detalles (como _draft_) para recibir feedback temprano y detectar conflictos potenciales.
- **Documentación y notas de despliegue:** mantené un registro de cambios en `docs/` para que el equipo sepa qué migraciones o pasos manuales deben ejecutarse.

## 4. Checklist antes de abrir cada PR

- [ ] Ejecutaste `npm install` en `backend` y `frontend` si agregaste nuevas dependencias.
- [ ] Corriste `npm run build --prefix frontend` y las pruebas del backend (`npm test` o scripts equivalentes).
- [ ] Probaste manualmente los endpoints nuevos con datos reales o de ejemplo.
- [ ] Actualizaste el archivo `.env.example` si incorporaste variables de entorno.
- [ ] Añadiste instrucciones en la documentación en caso de nuevas migraciones o tareas programadas.

Seguir esta secuencia te permitirá reincorporar todas las funcionalidades avanzadas reduciendo el riesgo de conflictos grandes y manteniendo un historial de commits claro para el equipo.
