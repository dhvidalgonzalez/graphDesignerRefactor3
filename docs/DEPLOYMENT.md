# Despliegue y sandbox

## Requisitos

- Node.js 18.16 o superior;
- credenciales AWS configuradas;
- proyecto Amplify Gen 2;
- npm.

## Desarrollo

```bash
npm install
npm run sandbox
```

Mantén el sandbox activo y, en otra terminal:

```bash
npm run dev
```

## Salidas

El sandbox genera `amplify_outputs.json`. Este archivo contiene la configuración que `src/config/amplify.js` entrega a la librería cliente.

El repositorio incluye `amplify_outputs.json.example`, pero no credenciales reales.

## Primera prueba funcional

1. Registrar una cuenta.
2. Confirmar el correo.
3. Iniciar sesión.
4. Verificar creación de perfil y workspace.
5. Crear un proyecto con demostración.
6. Abrir una hoja.
7. Modificar un equipo y esperar “Guardado en la nube”.
8. Recargar y comprobar el documento.
9. Crear una segunda cuenta.
10. Invitarla como lector o editor.
11. Aceptar la invitación desde el segundo dashboard.
12. Comprobar permisos de lectura/escritura.

## Eliminación del sandbox

```bash
npm run sandbox:delete
```

## Hosting

Para Amplify Hosting, configura el build como una aplicación Vite estándar:

```text
build command: npm run build
output directory: dist
```

El backend Gen 2 se despliega desde la carpeta `amplify/`.
