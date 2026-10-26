import { useCallback, useEffect, type ReactNode, createContext, useContext, useMemo, } from "react";
import { AuthProvider, useAuth, type AuthProviderProps } from "react-oidc-context";

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
    sessionStorage.setItem("auth_redirect_url", window.location.href);
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
//---

export type AppserverData =
  number |
  string |
  boolean |
  AppserverData[] |
  null |
  {
    [key: string]: AppserverData;
  };

export type ExecOnError = Record<string, (payload: AppserverData) => Promise<void>>;

export type Exec = <I extends AppserverData, O extends AppserverData>(
  action: string,
  data: I,
  onError?: ExecOnError,
) => Promise<O>;

type ApiContextValue = {
  exec: Exec;
  logout: (remote: boolean) => Promise<void>;
  profile: Record<string, unknown> | undefined
};

const ApiContext = createContext<ApiContextValue | null>(null);

export class ApiError extends Error { }
export class AuthApiError extends ApiError {
  public readonly recoverable: boolean;
  constructor(recoverable: boolean) {
    super(recoverable ?
      "Authentication required" :
      "Permission denied"
    );
    this.recoverable = recoverable;
  }
}
export class ValidationApiError extends ApiError {
  data: AppserverData;
  constructor(data: AppserverData) {
    super();
    this.data = data;
  }
}

export class ClientApiError extends ApiError {
  public readonly code: string;
  public readonly message: string;
  public readonly details?: AppserverData;
  constructor(code: string, message: string, details?: AppserverData) {
    super();
    this.code = code;
    this.message = message;
    this.details = details;
  }
}
export class UnknownApiError extends ApiError {
  constructor() {
    super();
    this.message = "An unknown error occurred";
  }
}

type _ApiProviderProps = {
  children: ReactNode;
  apiUrl: string;
};
function _ApiProvider({ children, apiUrl }: _ApiProviderProps) {
  const auth = useAuth();

  const profile = useMemo(() => {
    if (!auth.user)
      return undefined;

    return auth.user.profile;
  }, [auth]);

  const logout = useCallback(async (remote: boolean = false) => {
    if (remote) {
      await auth.signoutRedirect();
    }
    else {
      auth.removeUser();
    }
  }, [auth]);

  const exec = useCallback(async <I extends AppserverData, O extends AppserverData>(
    action: string,
    data: I,
    onError?: ExecOnError,
  ): Promise<O> => {
    const res = await fetch(`${apiUrl}/exec/${action.startsWith('/') ? action.slice(1) : action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${auth.user?.access_token}`,
      },
      body: JSON.stringify(data)
    });

    if (res.status === 401) {
      auth.removeUser();
      throw new AuthApiError(true);
    }

    if (res.status === 403) {
      throw new AuthApiError(false);
    }

    if (res.status === 422) {
      const body = await res.json();
      throw new ValidationApiError(body);
    }

    if (res.status === 400) {
      const body = await res.json() as {
        code: string;
        message: string;
        details?: AppserverData;
      }

      const handler = onError?.[body.code];
      if (handler)
        await handler(body.details ?? {});

      throw new ClientApiError(
        body.code,
        body.message,
        body.details
      );
    }

    if (res.status === 200) {
      const body = await res.json() as O;
      return body;
    }

    throw new UnknownApiError();
  }, [auth]);

  return <ApiContext.Provider value={{ exec, logout, profile }}> {children} </ApiContext.Provider>;
}

export function useApi(): ApiContextValue {
  const ctx = useContext(ApiContext);
  if (!ctx)
    throw new Error("useApi must be used within ApiProvider");
  return ctx;
}