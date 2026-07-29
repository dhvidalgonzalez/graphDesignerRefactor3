import { useMemo, useState } from "react";
import Icon from "../common/Icon.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

export default function InvitationAcceptPage({ invitationId }) {
  const { myInvitations, actions } = useWorkspace();
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const invitation = useMemo(
    () => myInvitations.find((item) => item.id === invitationId) ?? null,
    [invitationId, myInvitations],
  );

  const accept = async () => {
    setStatus("accepting");
    setError(null);

    try {
      await actions.acceptInvitation(invitationId);
      setStatus("accepted");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError
          : new Error("No se pudo aceptar la invitación."),
      );
      setStatus("error");
    }
  };

  return (
    <div className="invitation-page">
      <header className="invitation-page-header">
        <a className="landing-brand" href="#/">
          <span className="brand-mark">GD</span>
          <span>
            <strong>Graph Designer</strong>
            <small>Invitación a un proyecto</small>
          </span>
        </a>
      </header>

      <main className="invitation-card">
        <span className="invitation-card-icon">
          <Icon name="users" size={28} />
        </span>

        {status === "accepted" ? (
          <>
            <span className="workspace-kicker">Acceso concedido</span>
            <h1>La invitación fue aceptada</h1>
            <p>
              El proyecto ya está disponible en tu espacio de trabajo con el
              permiso asignado por su propietario.
            </p>
            <button
              className="button button--primary"
              type="button"
              onClick={actions.openWorkspace}
            >
              Ir a Mis proyectos
            </button>
          </>
        ) : (
          <>
            <span className="workspace-kicker">Invitación pendiente</span>
            <h1>{invitation?.projectName || "Te invitaron a un proyecto"}</h1>
            <p>
              {invitation
                ? `${invitation.invitedByDisplayName} te otorgó acceso ${String(invitation.role).toLowerCase() === "editor" ? "de edición" : "de sólo lectura"}.`
                : "Confirma la invitación para incorporar el proyecto a tu espacio de trabajo."}
            </p>

            <div className="invitation-access-summary">
              <span>
                <small>Cuenta</small>
                <strong>{invitation?.email || "Sesión autenticada"}</strong>
              </span>
              <span>
                <small>Permiso</small>
                <strong>
                  {String(invitation?.role || "VIEWER").toLowerCase() === "editor"
                    ? "Puede editar"
                    : "Sólo lectura"}
                </strong>
              </span>
            </div>

            {error && (
              <div className="invite-preview-note invite-preview-note--error">
                <strong>No se pudo aceptar</strong>
                <span>{error.message}</span>
              </div>
            )}

            <div className="invitation-card-actions">
              <button
                className="button button--primary"
                type="button"
                disabled={status === "accepting"}
                onClick={accept}
              >
                {status === "accepting" ? "Aceptando…" : "Aceptar invitación"}
              </button>
              <button
                className="button button--soft"
                type="button"
                disabled={status === "accepting"}
                onClick={actions.openWorkspace}
              >
                Volver a Mis proyectos
              </button>
            </div>

            <small className="invitation-id-copy">Referencia: {invitationId}</small>
          </>
        )}
      </main>
    </div>
  );
}
