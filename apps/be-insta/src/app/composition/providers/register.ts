import {
  conversationsDependenciesToken,
  messagesDependenciesToken,
  receiptsDependenciesToken,
} from "../../../domains/conversations/http/server";
import { privacyDependenciesToken } from "../../../domains/privacy/http/index";
import { supportDependenciesToken } from "../../../domains/support-reports/http/index";
import {
  authDependenciesToken,
  directoryDependenciesToken,
  registrationDependenciesToken,
  ticketDependenciesToken,
} from "../../../domains/users/http/server";
import {
  clientSourceToken,
  createClientSourceReader,
} from "../../../lib/http/index";
import { createUnavailablePrivacy } from "../privacy/index";
import type { RuntimeDependencies } from "../runtime/index";
import { unavailableAuth } from "../users/index";
import { storyProviders } from "./stories";
/** Связывает Nest tokens с уже собранными capability-портами; offline-зависимости остаются явно недоступными. */
export const createDomainProviders = (dependencies: RuntimeDependencies) => [
  {
    provide: receiptsDependenciesToken,
    useValue: dependencies.chat?.receipts ?? null,
  },
  ...storyProviders(dependencies.stories),
  {
    provide: ticketDependenciesToken,
    useValue: dependencies.users?.tickets ?? null,
  },
  {
    provide: messagesDependenciesToken,
    useValue: dependencies.chat?.messages ?? null,
  },
  {
    provide: conversationsDependenciesToken,
    useValue: dependencies.chat?.conversations ?? null,
  },
  {
    provide: directoryDependenciesToken,
    useValue: dependencies.directory ?? null,
  },
  { provide: supportDependenciesToken, useValue: dependencies.support ?? null },
  {
    provide: registrationDependenciesToken,
    useValue: dependencies.users?.registration
      ? {
          ...dependencies.users.registration,
          limits: dependencies.users.limits,
        }
      : null,
  },
  {
    provide: authDependenciesToken,
    useValue: dependencies.users
      ? { ...dependencies.users.auth, limits: dependencies.users.limits }
      : unavailableAuth,
  },
  {
    provide: clientSourceToken,
    useValue:
      dependencies.clientSource ??
      createClientSourceReader({ clock: Date.now }),
  },
  {
    provide: privacyDependenciesToken,
    useValue: dependencies.privacy ?? createUnavailablePrivacy(),
  },
];
