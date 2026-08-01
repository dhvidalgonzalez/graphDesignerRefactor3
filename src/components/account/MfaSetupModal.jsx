import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import Modal from "../common/Modal.jsx";
import { useSecurity } from "../../auth/SecurityContext.jsx";

function formatSecret(secret) {
  return String(secret || "")
    .replace(/\s+/g, "")
    .match(/.{1,4}/g)
    ?.join(" ") || "";
}

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
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const formattedSecret = useMemo(
    () => formatSecret(sharedSecret),
    [sharedSecret],
  );

  useEffect(() => {
    if (setupOpen) return;
    setStep("intro");
    setSetupUri("");
    setSharedSecret("");
    setQrDataUrl("");
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
      const nextSetupUri = details.setupUri || "";
      const nextQrDataUrl = nextSetupUri
        ? await QRCode.toDataURL(nextSetupUri, {
            width: 300,
            margin: 2,
            errorCorrectionLevel: "M",
          })
        : "";

      setSetupUri(nextSetupUri);
      setSharedSecret(details.sharedSecret);
      setQrDataUrl(nextQrDataUrl);
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
              <li><strong>Escanea el QR</strong><span>Abre tu aplicación autenticadora y escanea el código que generaremos.</span></li>
              <li><strong>Conserva la alternativa</strong><span>También tendrás un enlace directo y una clave manual de respaldo.</span></li>
              <li><strong>Confirma el código</strong><span>Ingresa el código temporal de 6 dígitos para completar la activación.</span></li>
            </ol>
          </>
        ) : (
          <div className="mfa-verify-grid">
            <section className="mfa-setup-card mfa-qr-card">
              <span className="eyebrow">Paso 1</span>
              <h3>Escanea el código QR</h3>
              <p>En tu aplicación autenticadora, elige agregar una cuenta y escanea este código.</p>

              <div className="mfa-qr-frame" aria-live="polite">
                {qrDataUrl ? (
                  <img
                    className="mfa-qr-image"
                    src={qrDataUrl}
                    alt="Código QR para vincular la autenticación en dos pasos"
                  />
                ) : (
                  <div className="mfa-qr-unavailable">
                    No fue posible mostrar el QR. Utiliza una de las alternativas disponibles.
                  </div>
                )}
              </div>

              {setupUri && (
                <a className="button button--soft mfa-deep-link" href={setupUri}>
                  Abrir en este dispositivo
                </a>
              )}

              <small>
                El QR contiene la configuración necesaria para vincular esta cuenta. No lo compartas.
              </small>
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

              <details className="mfa-manual-details">
                <summary>No puedo escanear el QR</summary>
                <p>Ingresa esta clave manualmente en tu aplicación autenticadora.</p>
                <div className="mfa-secret-box">
                  <span>Clave de configuración manual</span>
                  <code>{formattedSecret || "No disponible"}</code>
                  <button className="button button--soft" type="button" onClick={copySecret} disabled={!sharedSecret}>
                    {copied ? "Copiada" : "Copiar clave"}
                  </button>
                </div>
              </details>
            </section>
          </div>
        )}

        {error && <div className="form-error-message">{error}</div>}
        <div className="modal-actions">
          <button className="button" type="button" onClick={closeSetup} disabled={busy}>Cancelar</button>
          {step === "intro" ? (
            <button className="button button--primary" type="button" onClick={start} disabled={busy}>
              {busy ? "Generando QR…" : "Generar código QR"}
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
