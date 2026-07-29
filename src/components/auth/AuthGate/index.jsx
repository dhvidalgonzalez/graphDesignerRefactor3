import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import AuthGateView from "./view.jsx";
import { SessionProvider } from "../../../auth/SessionContext.jsx";

const formFields = {
  signIn: {
    username: {
      label: "Correo electrónico",
      placeholder: "tu@correo.cl",
    },
    password: {
      label: "Contraseña",
      placeholder: "Ingresa tu contraseña",
    },
  },
  signUp: {
    email: {
      label: "Correo electrónico",
      placeholder: "tu@correo.cl",
      order: 1,
    },
    given_name: {
      label: "Nombre",
      placeholder: "Tu nombre",
      order: 2,
    },
    family_name: {
      label: "Apellido",
      placeholder: "Tu apellido",
      order: 3,
    },
    password: {
      label: "Contraseña",
      placeholder: "Crea una contraseña",
      order: 4,
    },
    confirm_password: {
      label: "Confirmar contraseña",
      placeholder: "Repite la contraseña",
      order: 5,
    },
  },
};

function AuthGateContent({ children }) {
  const { authStatus, user, signOut } = useAuthenticator((context) => [
    context.authStatus,
    context.user,
  ]);

  if (authStatus === "configuring") {
    return (
      <div className="session-state-page">
        <span className="session-loader" />
        <strong>Verificando tu sesión…</strong>
        <p>Estamos conectando la aplicación con Amazon Cognito.</p>
      </div>
    );
  }

  if (authStatus !== "authenticated") {
    return (
      <AuthGateView>
        <Authenticator
          loginMechanisms={["email"]}
          signUpAttributes={["given_name", "family_name"]}
          formFields={formFields}
        />
      </AuthGateView>
    );
  }

  return (
    <SessionProvider authenticatorUser={user} signOut={signOut}>
      {children}
    </SessionProvider>
  );
}

export default function AuthGate({ children }) {
  return (
    <Authenticator.Provider>
      <AuthGateContent>{children}</AuthGateContent>
    </Authenticator.Provider>
  );
}
