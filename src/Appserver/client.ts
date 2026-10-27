import PQueue from "p-queue";
import { Whispr } from "@cripty2001/whispr";

export type AppserverData =
  number |
  string |
  boolean |
  AppserverData[] |
  null |
  { [key: string]: AppserverData | undefined };

export type ExecOnError = Record<string, (payload: AppserverData) => Promise<void>>;

export type Exec = <I extends AppserverData, O extends AppserverData>(
  action: string,
  data: I,
  onError?: ExecOnError,
) => Promise<O>;

const queue = new PQueue({ concurrency: 50 });

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

export default class AppserverClient {
  private readonly apiUrl: string;
  private readonly token: Whispr<string | null>;
  public readonly setToken: (token: string | null) => void;

  public loggedIn: Whispr<boolean>;
  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
    [this.token, this.setToken] = Whispr.create<string | null>(null);

    this.loggedIn = this.token.transform(token => token !== null);
  }

  public async exec<O extends AppserverData, I extends AppserverData = AppserverData>(
    action: string,
    data: I,
    onError?: ExecOnError,
    priority?: number,
  ): Promise<O> {
    const res = await queue.add(
      async () =>
        fetch(`${this.apiUrl}/exec/${action.startsWith('/') ? action.slice(1) : action}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.token.value}`,
          },
          body: JSON.stringify(data)
        }),
      {
        priority: priority ?? 0,
      }
    )

    if (res.status === 401) {
      this.setToken(null);
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
  };
}

