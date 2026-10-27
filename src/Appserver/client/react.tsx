import { useCallback, useEffect, type ReactNode, createContext, useContext, useMemo, useRef, } from "react";
import { AuthProvider, useAuth, type AuthProviderProps } from "react-oidc-context";
import AppserverClient, { AuthApiError, AppserverData, ExecOnError } from "../client.js";
import { useSafeRef } from "../../react-whispr.js";

type LoginSheetPropsConfig = {
  issuer: string;
  clientId: string;
  scopes: string[];
  apiUrl: string;
};

type LoginSheetProps = {
  children: ReactNode;
  templates: {
    Loading: ({ message }: {
      message: string
    }) => ReactNode;
    Error: ({ message, callback }: {
      message: string,
      callback: () => Promise<void>
    }) => ReactNode;
  };
  config: LoginSheetPropsConfig;
};

type LoginState = {
  returnTo: string;
};

export default function ApiProvider({ children, config, templates }: LoginSheetProps) {
  const oidcConfig: AuthProviderProps = {
    authority: config.issuer,
    client_id: config.clientId,
    redirect_uri: `${window.location.origin}/`,
    scope: [
      "openid", "offline_access",
      ...config.scopes
    ].join(" "),
    extraQueryParams: {},
    extraTokenParams: { resource: config.apiUrl },
    onSigninCallback: (user) => {
      const state = user?.state as LoginState | undefined;

      window.location.replace(state?.returnTo ?? "/");
    },
  };

  return (
    <AuthProvider {...oidcConfig}>
      <_ApiProvider apiUrl={config.apiUrl}>
        <_LoginSheet config={config} templates={templates}>{children}</_LoginSheet>
      </_ApiProvider>
    </AuthProvider>
  );
}

function _LoginSheet({ children, config, templates }: LoginSheetProps) {
  const auth = useAuth();

  const login = useCallback(async () => {
    const state: LoginState = {
      returnTo: window.location.href
    };
    await auth.signinRedirect({
      extraQueryParams: {
        prompt: "consent",
        resource: config.apiUrl
      },
      state
    });
  }, [auth]);

  useEffect(() => {
    if (auth.isLoading)
      return;
    if (auth.isAuthenticated && auth.user)
      return;

    if (auth.error)
      return;

    login();
  }, [auth, login]);

  if (auth.isLoading)
    return <templates.Loading message="Restoring your session..." />;

  if (auth.isAuthenticated && auth.user)
    return <>{children}</>;

  return <templates.Error
    message={auth.error?.message ?? "An error occurred while restoring your session."}
    callback={login}
  />;
}

type ApiContextValue = {
  exec: AppserverClient['exec'];
  logout: (remote: boolean) => Promise<void>;
  profile: Record<string, unknown> | undefined
};

const ApiContext = createContext<ApiContextValue | null>(null);

type _ApiProviderProps = {
  children: ReactNode;
  apiUrl: string;
};
function _ApiProvider({ children, apiUrl }: _ApiProviderProps) {
  const auth = useAuth();
  const client = useSafeRef(() => new AppserverClient(apiUrl));

  const profile = useMemo(() => {
    if (!auth.user)
      return undefined;

    return auth.user.profile;
  }, [auth]);

  const logout = useCallback(async (remote: boolean = false) => {
    client.setToken(null);

    if (remote) {
      await auth.signoutRedirect();
    }
    else {
      auth.removeUser();
    }
  }, [auth]);

  // useEffect(() => {
  //   auth.events
  //     .addUserLoaded((user) => {
  //       client.setToken(user?.access_token ?? null);
  //     })
  //   auth.events
  //     .addUserUnloaded(() => {
  //       client.setToken(null);
  //     });
  // }, [auth.events]);

  const exec = useCallback(
    async <
      O extends AppserverData,
      I extends AppserverData = AppserverData
    >(action: string, data: I, onError?: ExecOnError): Promise<O> => {
      try {
        client.setToken(auth.user?.access_token ?? null);

        return await client.exec(action, data, onError);
      } catch (e) {
        if (e instanceof AuthApiError && e.recoverable) {
          logout(false);
        }
        throw e;
      }
    },
    [client, logout]
  );

  const contextValue = useMemo(() => ({
    exec,
    logout,
    profile
  }), [client, logout, profile]);

  return <ApiContext.Provider value={contextValue}> {children} </ApiContext.Provider>;
}

export function useApi(): ApiContextValue {
  const ctx = useContext(ApiContext);
  if (!ctx)
    throw new Error("useApi must be used within ApiProvider");
  return ctx;
}