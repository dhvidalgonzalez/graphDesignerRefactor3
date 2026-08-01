import { useEffect, useState } from "react";
import Modal from "../common/Modal.jsx";
import { useSecurity } from "../../auth/SecurityContext.jsx";

export default function MfaSetupModal() {
  const {
    setupOpen,
    closeSetup,
    beginTotpSetup,
    verifyTotpSetup,
  } = useSecurity();
  const [step, setStep] = useState("intro");
  const [setupUri, setSetupUri] = useState("");
  const [sharedSecret, setSharedSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (setupOpen) return;
    setStep("intro");
    setSetupUri("");
    setSharedSecret("");
    setCode("");
    setBusy(false);
    setError("");
    setCopied(false);
  }, [setupOpen]);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const details = await beginTotpSetup();
      setSetupUri(details.setupUri);
      setSharedSecret(details.sharedSecret);
      setStep("verify");
    } catch (nextError) {
      setError(nextError instanceof Error
        ? nextError.message
        : "No fue posible preparar la autenticación en dos pasos.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const normalizedCode = code.trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      setError("Ingresa el código de 6 dígitos mostrado por tu aplicación autenticadora.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await verifyTotpSetup(normalizedCode);
      closeSetup();
    } catch (nextError) {
      setError(nextError instanceof Error
        ? nextError.message
        : "No fue posible verificar el código. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(sharedSecret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      open={setupOpen}
      title="Activar autenticación en dos pasos"
      subtitle="Vincula una aplicación autenticadora con tu cuenta"
      onClose={busy ? undefined : closeSetup}
      size="large"
    >
      <div className="mfa-setup-layout">
        {step === "intro" ? (
          <>
            <section className="mfa-intro-card">
              <span className="mfa-security-mark" aria-hidden="true">✓</span>
              <div>
                <h3>Agrega una verificación adicional al iniciar sesión</h3>
                <p>
                  Podrás usar Google Authenticator, Microsoft Authenticator,
                  Authy u otra aplicación compatible con códigos TOTP.
                </p>
              </div>
            </section>
            <ol className="mfa-step-list">
              <li><strong>Vincula tu cuenta</strong><span>Abre tu aplicación autenticadora e incorpora una nueva cuenta.</span></li>
              <li><strong>Guarda la clave</strong><span>Usa el enlace directo o copia la clave manual.</span></li>
              <li><strong>Confirma el código</strong><span>Ingresa el código temporal de 6 dígitos para completar la activación.</span></li>
            </ol>
          </>
        ) : (
          <div className="mfa-verify-grid">
            <section className="mfa-setup-card">
              <span className="eyebrow">Paso 1</span>
              <h3>Vincula la aplicación</h3>
              <p>En un teléfono compatible puedes abrir directamente la aplicación autenticadora.</p>
              <a className="button button--primary mfa-deep-link" href={setupUri}>Abrir aplicación autenticadora</a>
              <div className="mfa-secret-box">
                <span>Clave de configuración manual</span>
                <code>{sharedSecret || "No disponible"}</code>
                <button className="button button--soft" type="button" onClick={copySecret} disabled={!sharedSecret}>
                  {copied ? "Copiada" : "Copiar clave"}
                </button>
              </div>
              <small>No compartas esta clave. Permite generar códigos de acceso para tu cuenta.</small>
            </section>

            <section className="mfa-setup-card">
              <span className="eyebrow">Paso 2</span>
              <h3>Verifica el vínculo</h3>
              <p>Ingresa el código actual que muestra la aplicación autenticadora.</p>
              <label className="property-field mfa-code-field">
                <span>Código de 6 dígitos</span>
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  maxLength={6}
                  placeholder="123456"
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={busy}
                />
              </label>
              <div className="mfa-help-note">
                El código cambia periódicamente. Utiliza el que esté visible al momento de confirmar.
              </div>
            </section>
          </div>
        )}

        {error && <div className="form-error-message">{error}</div>}
        <div className="modal-actions">
          <button className="button" type="button" onClick={closeSetup} disabled={busy}>Cancelar</button>
          {step === "intro" ? (
            <button className="button button--primary" type="button" onClick={start} disabled={busy}>
              {busy ? "Preparando…" : "Comenzar configuración"}
            </button>
          ) : (
            <button className="button button--primary" type="button" onClick={verify} disabled={busy || code.length !== 6}>
              {busy ? "Verificando…" : "Verificar y activar"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
