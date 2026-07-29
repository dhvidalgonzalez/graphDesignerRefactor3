import { useEffect, useMemo, useState } from "react";
import Modal from "../common/Modal.jsx";
import Icon from "../common/Icon.jsx";
import { formatDate, getInitials } from "../../utils/format.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";

const ROLE_LABELS = {
  owner: "Propietario",
  editor: "Puede editar",
  viewer: "Sólo lectura",
};

const EMAIL_STATUS_LABELS = {
  SENT: "Correo enviado",
  FAILED: "Correo no enviado",
  PENDING: "Envío pendiente",
};

function normalizeInvitation(invitation) {
  return {
    ...invitation,
    id: invitation.id || invitation.invitationId,
    emailDeliveryStatus: invitation.emailDeliveryStatus || "PENDING",
  };
}

export default function InviteMembersModal() {
  const { activeProject, inviteMembersOpen, actions } = useWorkspace();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [message, setMessage] = useState(null);

  const pendingInvitations = useMemo(
    () => (activeProject?.invitations ?? [])
      .filter((item) => item.status === "PENDING")
      .map(normalizeInvitation),
    [activeProject?.invitations],
  );

  useEffect(() => {
    if (!inviteMembersOpen) return;
    setEmail("");
    setRole("viewer");
    setSubmitting(false);
    setResendingId(null);
    setMessage(null);
  }, [inviteMembersOpen]);

  if (!activeProject) return null;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const invitation = await actions.inviteMember({ email, role });
      setEmail("");

      if (invitation.emailDeliveryStatus === "SENT") {
        setMessage({
          tone: "success",
          text: `La invitación se registró y el correo fue enviado a ${invitation.email}.`,
        });
      } else {
        setMessage({
          tone: "warning",
          text: `La invitación quedó registrada, pero SES no pudo enviar el correo: ${invitation.emailError || "revisa la configuración del remitente y el estado sandbox"}.`,
        });
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error
          ? error.message
          : "No se pudo crear la invitación.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async (invitationId) => {
    setResendingId(invitationId);
    setMessage(null);

    try {
      const invitation = await actions.resendInvitation(invitationId);
      setMessage({
        tone: invitation.emailDeliveryStatus === "SENT" ? "success" : "warning",
        text: invitation.emailDeliveryStatus === "SENT"
          ? `El correo fue reenviado a ${invitation.email}.`
          : `La invitación sigue activa, pero el reenvío falló: ${invitation.emailError || "revisa Amazon SES"}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error
          ? error.message
          : "No se pudo reenviar la invitación.",
      });
    } finally {
      setResendingId(null);
    }
  };

  return (
    <Modal
      open={inviteMembersOpen}
      title="Personas con acceso"
      subtitle={activeProject.name}
      onClose={actions.closeInviteMembers}
      size="large"
    >
      <div className="invite-modal-layout">
        <section className="invite-modal-form-section">
          <h3>Invitar a una persona</h3>
          <p>
            El correo contendrá un enlace para iniciar sesión o crear una cuenta
            y aceptar el acceso al proyecto.
          </p>

          <form onSubmit={submit}>
            <label className="property-field">
              <span>Correo electrónico</span>
              <input
                type="email"
                required
                disabled={submitting || !activeProject.canManage}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="persona@organizacion.cl"
              />
            </label>

            <label className="property-field">
              <span>Permiso</span>
              <select
                disabled={submitting || !activeProject.canManage}
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="viewer">Sólo lectura</option>
                <option value="editor">Puede editar</option>
              </select>
            </label>

            <div className="invite-role-help">
              <Icon name="users" size={18} />
              <span>
                <strong>{role === "editor" ? "Editor" : "Lector"}</strong>
                <small>
                  {role === "editor"
                    ? "Podrá modificar hojas y sincronizar cambios."
                    : "Podrá navegar, seleccionar e inspeccionar sin editar."}
                </small>
              </span>
            </div>

            <button
              className="button button--primary button--full"
              type="submit"
              disabled={!email.trim() || submitting || !activeProject.canManage}
            >
              {submitting
                ? <><span className="inline-spinner" /> Enviando invitación…</>
                : "Enviar invitación"}
            </button>
          </form>

          {!activeProject.canManage && (
            <div className="invite-preview-note">
              <strong>Acceso restringido</strong>
              <span>Sólo el propietario puede administrar invitaciones.</span>
            </div>
          )}

          {message && (
            <div className={`invite-preview-note invite-preview-note--${message.tone}`}>
              <strong>
                {message.tone === "success"
                  ? "Invitación enviada"
                  : message.tone === "warning"
                    ? "Invitación registrada"
                    : "No se pudo invitar"}
              </strong>
              <span>{message.text}</span>
            </div>
          )}
        </section>

        <section className="invite-member-section">
          <div className="access-heading">
            <div>
              <h3>Acceso actual</h3>
              <p>{activeProject.members.length} personas e invitaciones registradas.</p>
            </div>
          </div>

          <div className="member-list">
            {activeProject.members
              .filter((member) => member.status !== "pending")
              .map((member) => (
                <div className="member-row" key={member.id}>
                  <span className="member-avatar">{getInitials(member.displayName)}</span>
                  <span className="member-copy">
                    <strong>{member.displayName}</strong>
                    <small>
                      {member.id === activeProject.owner.id
                        ? "Creador del proyecto"
                        : member.email || "Colaborador"}
                    </small>
                  </span>
                  <span className="member-role">
                    {ROLE_LABELS[member.role] ?? member.role}
                  </span>
                </div>
              ))}
          </div>

          <div className="pending-invitations-heading">
            <strong>Invitaciones pendientes</strong>
            <small>{pendingInvitations.length}</small>
          </div>

          <div className="pending-invitation-list">
            {pendingInvitations.length ? pendingInvitations.map((invitation) => (
              <article className="pending-invitation-row" key={invitation.id}>
                <div>
                  <strong>{invitation.email}</strong>
                  <small>
                    {ROLE_LABELS[String(invitation.role).toLowerCase()] ?? invitation.role}
                    {" · vence "}{formatDate(invitation.expiresAt)}
                  </small>
                  <span className={`email-delivery-chip email-delivery-chip--${String(invitation.emailDeliveryStatus).toLowerCase()}`}>
                    {EMAIL_STATUS_LABELS[invitation.emailDeliveryStatus] ?? "Estado desconocido"}
                  </span>
                  {invitation.emailError && (
                    <small className="invitation-email-error" title={invitation.emailError}>
                      {invitation.emailError}
                    </small>
                  )}
                </div>

                <button
                  className="button button--soft"
                  type="button"
                  disabled={resendingId === invitation.id || !activeProject.canManage}
                  onClick={() => resend(invitation.id)}
                >
                  {resendingId === invitation.id
                    ? <><span className="inline-spinner" /> Reenviando…</>
                    : "Reenviar"}
                </button>
              </article>
            )) : (
              <div className="pending-invitations-empty">
                No hay invitaciones pendientes.
              </div>
            )}
          </div>

          <div className="future-access-note">
            <strong>Acceso protegido</strong>
            <span>
              El destinatario debe iniciar sesión con el mismo correo antes de
              que se agregue su identidad a las reglas del proyecto y sus hojas.
            </span>
          </div>
        </section>
      </div>
    </Modal>
  );
}
