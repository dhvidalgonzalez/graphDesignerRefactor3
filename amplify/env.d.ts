/**
 * Declaración de respaldo para los módulos de entorno generados por Amplify.
 *
 * Amplify reemplaza/resuelve estos módulos durante sandbox o pipeline-deploy.
 * Esta declaración solo evita que la validación TypeScript falle antes de que
 * Amplify termine de generar los archivos dentro de .amplify/generated/env.
 */
declare module "$amplify/env/*" {
  export const env: any;
}
