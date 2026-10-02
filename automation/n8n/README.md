# Workflows del bot 028

Este directorio contiene snapshots versionados de los cinco workflows activos que forman el bot de 028 Import.

- Los JSON incluyen nodos, conexiones y ajustes necesarios para auditar la automatizacion.
- No incluyen tokens ni identificadores de credenciales de n8n.
- Los nombres de credenciales se conservan para documentar la dependencia, pero la credencial debe existir en la instancia antes de importar.
- `manifest.json` registra la fecha del snapshot, el estado y la cantidad de nodos de cada workflow.

## Alcance

Los workflows cubren el puente de WhatsApp/Chatwoot, el agente principal, las derivaciones al equipo, la resolucion de cotizaciones de Uber y el aviso de entrega. No representan ni modifican el resto del frontend del cliente.

## Actualizacion

Antes de cambiar produccion, exportar un respaldo privado completo. Luego aplicar el cambio, comprobar que los workflows sigan activos y regenerar estos snapshots sanitizados. Nunca agregar claves, tokens ni archivos `*.local` al repositorio.
