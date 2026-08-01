import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  fetchMFAPreference,
  setUpTOTP,
  updateMFAPreference,
  verifyTOTPSetup,
} from "aws-amplify/auth";
import { useSession } from "./SessionContext.jsx";

const SecurityContext = createContext(null);

function normalizePreference(result) {
  const enabled = Array.isArray(result?.enabled) ? result.enabled : [];
  return {
    enabled,
    preferred: result?.preferred ?? null,
    totpEnabled: enabled.includes("TOTP"),
  };
}

export function SecurityProvider({ children }) {
  const { session } = useSession();
  const [state, setState] = useState({
    status: "loading",
    enabled: [],
    preferred: null,
    totpEnabled: false,
    error: null,
  });
  const [setupOpen, setSetupOpen] = useState(false);

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, status: "loading", error: null }));
    try {
      const preference = normalizePreference(await fetchMFAPreference());
      setState({ status: "ready", ...preference, error: null });
      return preference;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      setState({
        status: "error",
        enabled: [],
        preferred: null,
        totpEnabled: false,
        error: normalized,
      });
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh, session?.userId]);

  const beginTotpSetup = useCallback(async () => {
    const details = await setUpTOTP();
    const setupUri = details.getSetupUri("Gestion Diagrams", session?.email || undefined);
    return {
      setupUri: setupUri.toString(),
      sharedSecret: details.sharedSecret || "",
    };
  }, [session?.email]);

  const verifyTotpSetup = useCallback(async (code) => {
    await verifyTOTPSetup({ code: String(code || "").trim() });
    await updateMFAPreference({ totp: "PREFERRED" });
    await refresh();
  }, [refresh]);

  const disableTotp = useCallback(async () => {
    await updateMFAPreference({ totp: "DISABLED" });
    await refresh();
  }, [refresh]);

  const value = useMemo(() => ({
    ...state,
    setupOpen,
    openSetup: () => setSetupOpen(true),
    closeSetup: () => setSetupOpen(false),
    refresh,
    beginTotpSetup,
    verifyTotpSetup,
    disableTotp,
  }), [
    beginTotpSetup,
    disableTotp,
    refresh,
    setupOpen,
    state,
    verifyTotpSetup,
  ]);

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error("useSecurity debe utilizarse dentro de SecurityProvider.");
  }
  return context;
}
