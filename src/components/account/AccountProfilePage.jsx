import { useState } from "react";
import Icon from "../common/Icon.jsx";
import { useSecurity } from "../../auth/SecurityContext.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

export default function AccountProfilePage() {
  const { profile, session } = useWorkspace();
  const security = useSecurity();
  const [disabling, setDisabling] = useState(false);
  const [message, setMessage] = useState("");

  const disable = async () => {
    if (!window.confirm("¿Desactivar la autenticación en dos pasos para esta cuenta?")) return;
    setDisabling(true);
    setMessage("");
    try {
      await security.disableTotp();
      setMessage("La autenticación en dos pasos fue desactivada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible actualizar la seguridad de la cuenta.");
    } finally {
      setDisabling(false);
    }
  };

  const statusLabel = security.status === "loading"
    ? "Consultando…"
    : security.totpEnabled
      ? "Activada"
      : "No activada";

  return (
    <div className="workspace-content-scroll account-page">
      <header className="workspace-content-header">
        <div>
          <span className="workspace-kicker">Cuenta personal</span>
          <h1>Mi perfil</h1>
          <p>Revisa tus datos de acceso y configura la protección de tu cuenta.</p>
        </div>
      </header>

      <div className="account-page-grid">
        <section className="account-card">
          <div className="account-card-heading">
            <span className="account-card-icon"><Icon name="users" size={18} /></span>
            <div><h2>Información personal</h2><p>Datos utilizados para identificarte dentro de los proyectos compartidos.</p></div>
          </div>
          <dl className="account-details-list">
            <div><dt>Nombre</dt><dd>{profile?.displayName || session?.displayName || "Usuario"}</dd></div>
            <div><dt>Correo electrónico</dt><dd>{session?.email || profile?.email || "—"}</dd></div>
            <div><dt>Tipo de acceso</dt><dd>{session?.isGlobalAdmin ? "Administrador global" : "Usuario"}</dd></div>
          </dl>
        </section>

        <section className="account-card account-security-card">
          <div className="account-card-heading">
            <span className={`account-card-icon ${security.totpEnabled ? "account-card-icon--success" : ""}`}>
              <Icon name="shield" size={18} />
            </span>
            <div><h2>Autenticación en dos pasos</h2><p>Agrega un código temporal además de tu contraseña al iniciar sesión.</p></div>
          </div>

          <div className="account-security-status">
            <span>Estado</span>
            <strong className={security.totpEnabled ? "is-enabled" : ""}>{statusLabel}</strong>
          </div>

          {security.totpEnabled ? (
            <div className="account-security-copy">
              <p>Tu cuenta solicitará un código generado por la aplicación autenticadora durante el inicio de sesión.</p>
              <div className="account-security-actions">
                <button className="button button--soft" type="button" onClick={security.openSetup}>Volver a vincular</button>
                <button className="button danger-outline" type="button" onClick={disable} disabled={disabling}>
                  {disabling ? "Desactivando…" : "Desactivar"}
                </button>
              </div>
            </div>
          ) : (
            <div className="account-security-copy">
              <p>Actívala para reducir el riesgo de acceso no autorizado aunque alguien conozca tu contraseña.</p>
              <button className="button button--primary" type="button" onClick={security.openSetup} disabled={security.status === "loading"}>
                Activar autenticación en dos pasos
              </button>
            </div>
          )}

          {security.status === "error" && (
            <div className="form-error-message">No fue posible consultar el estado de seguridad. Intenta nuevamente.</div>
          )}
          {message && <div className="account-operation-message">{message}</div>}
        </section>
      </div>
    </div>
  );
}
