import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getCurrentSessionService } from "../services/auth/session/index.js";
import ensureProfileService from "../services/profile/ensure/index.js";

const SessionContext = createContext(null);

export function SessionProvider({ authenticatorUser, signOut, children }) {
  const [state, setState] = useState({
    status: "loading",
    session: null,
    profile: null,
    workspace: null,
    error: null,
  });

  const load = useCallback(async () => {
    if (!authenticatorUser) return;
    setState((current) => ({ ...current, status: "loading", error: null }));
    try {
      const session = await getCurrentSessionService();
      const { profile, workspace } = await ensureProfileService(session);
      setState({ status: "ready", session, profile, workspace, error: null });
    } catch (error) {
      setState({
        status: "error",
        session: null,
        profile: null,
        workspace: null,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }, [authenticatorUser]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(
    () => ({
      ...state,
      refreshSession: load,
      signOut,
    }),
    [load, signOut, state],
  );

  if (state.status === "loading") {
    return (
      <div className="session-state-page">
        <span className="session-loader" />
        <strong>Preparando tu espacio de trabajo…</strong>
        <p>Estamos verificando tu perfil y tus proyectos.</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="session-state-page session-state-page--error">
        <strong>No fue posible preparar la sesión</strong>
        <p>
          {state.error?.message ||
            "No fue posible completar el acceso. Inténtalo nuevamente."}
        </p>
        <div className="session-state-actions">
          <button
            className="button button--primary"
            type="button"
            onClick={load}
          >
            Reintentar
          </button>
          <button
            className="button button--soft"
            type="button"
            onClick={signOut}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context)
    throw new Error("useSession debe utilizarse dentro de SessionProvider.");
  return context;
}
