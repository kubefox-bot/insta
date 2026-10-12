import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import {
  outboxDatabaseVersion,
  outboxOwnerIndex,
  outboxStoreName,
} from "../../../domain/conts";
import { transact } from "./transaction";
import type { TransactionRunner } from "./types";

type Attempt = Readonly<{
  ready: Promise<IDBDatabase>;
  reject: (reason: Error) => void;
}>;
type ConnectionState =
  | Readonly<{ phase: "idle" | "closed" }>
  | Readonly<{ phase: "opening"; attempt: Attempt }>
  | Readonly<{ phase: "ready"; database: IDBDatabase }>;

/** Открывает и при обновлении создаёт хранилище с индексом владельца; поздний успех отозванной попытки закрывает, versionchange передаёт владельцу освобождения. */
const beginOpen = ({
  factory,
  databaseName,
  ownsAttempt,
  fail,
  accept,
  release,
  resolve,
}: Readonly<{
  factory: IDBFactory;
  databaseName: string;
  ownsAttempt: () => boolean;
  fail: (error: Error) => void;
  accept: (database: IDBDatabase) => void;
  release: (database: IDBDatabase) => void;
  resolve: (database: IDBDatabase) => void;
}>) => {
  try {
    const request = factory.open(databaseName, outboxDatabaseVersion);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(outboxStoreName, {
        keyPath: "operationId",
      });
      store.createIndex(outboxOwnerIndex, "ownerId");
    };
    request.onerror = () =>
      fail(request.error ?? new Error("Outbox open failed"));
    request.onblocked = () => fail(new Error("Outbox upgrade blocked"));
    request.onsuccess = () => {
      const database = request.result;
      if (!ownsAttempt()) {
        database.close();
        return;
      }
      accept(database);
      database.onversionchange = () => {
        release(database);
      };
      resolve(database);
    };
  } catch {
    fail(new Error("Outbox open failed"));
  }
};

/** Создаёт исполнитель транзакций с проверкой отмены и владения соединением; сбой открытия возвращает PERSISTENCE_FAILED. */
const createRunner =
  (
    open: () => Promise<IDBDatabase>,
    owns: (database: IDBDatabase) => boolean,
  ): TransactionRunner =>
  async (mode, execute, options) => {
    if (options?.signal?.aborted)
      return Result.Error(SessionErrorCode.ActorChanged);
    try {
      const database = await open();
      if (!owns(database)) return Result.Error("PERSISTENCE_FAILED");
      return await transact({
        database,
        mode,
        execute,
        signal: options?.signal,
      });
    } catch {
      return Result.Error("PERSISTENCE_FAILED");
    }
  };

/** Освобождает только ресурсы предыдущего состояния после отзыва владения. */
const releaseConnection = (state: ConnectionState) => {
  switch (state.phase) {
    case "opening":
      state.attempt.reject(new Error("Outbox closed"));
      return;
    case "ready":
      state.database.close();
      return;
    case "idle":
    case "closed":
      return;
    default: {
      const exhaustive: never = state;
      throw new Error(`Unknown outbox connection state: ${exhaustive}`);
    }
  }
};

/** Владеет ленивым IDB-соединением и общей попыткой открытия; закрытие отзывает владение до освобождения ресурсов. */
export const createConnection = ({
  factory,
  databaseName,
}: Readonly<{ factory: IDBFactory; databaseName: string }>) => {
  let state: ConnectionState = { phase: "idle" };
  /** Переиспользует соединение или Promise открытия; после close отказывает, после сбоя позволяет следующую попытку. */
  const open = (): Promise<IDBDatabase> => {
    switch (state.phase) {
      case "closed":
        return Promise.reject(new Error("Outbox closed"));
      case "ready":
        return Promise.resolve(state.database);
      case "opening":
        return state.attempt.ready;
      case "idle":
        break;
      default: {
        const exhaustive: never = state;
        throw new Error(`Unknown outbox connection state: ${exhaustive}`);
      }
    }
    const deferred = Promise.withResolvers<IDBDatabase>();
    const attempt: Attempt = {
      ready: deferred.promise,
      reject: deferred.reject,
    };
    state = { phase: "opening", attempt };
    /** Проверяет, что результат открытия относится к всё ещё текущей попытке. */
    const ownsAttempt = () =>
      state.phase === "opening" && state.attempt === attempt;
    /** Возвращает текущую неудачную попытку в idle и отклоняет её Promise; устаревшую попытку не трогает. */
    const fail = (error: Error) => {
      if (!ownsAttempt()) return;
      state = { phase: "idle" };
      attempt.reject(error);
    };
    beginOpen({
      factory,
      databaseName,
      ownsAttempt,
      fail,
      /** Передаёт принятое IDB-соединение во владение ready-состояния. */
      accept: (database) => {
        state = { phase: "ready", database };
      },
      /** При versionchange отзывает только текущее соединение и закрывает его, позволяя последующее открытие. */
      release: (database) => {
        if (state.phase !== "ready" || state.database !== database) return;
        state = { phase: "idle" };
        database.close();
      },
      resolve: deferred.resolve,
    });
    return attempt.ready;
  };
  return {
    run: createRunner(
      open,
      (database) => state.phase === "ready" && state.database === database,
    ),
    /** Необратимо переводит этот владелец соединения в closed, затем освобождает ресурсы прежнего состояния. */
    close: () => {
      const previous = state;
      state = { phase: "closed" };
      releaseConnection(previous);
    },
  };
};
