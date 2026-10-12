import type { ClientSession, Db } from "mongodb";
import type { DeliveryJournal } from "../../../ports/delivery/interfaces";
import { readDeliveryHead } from "./head";
import { materializeDelivery } from "./materialize";
import { pruneDeliveryJournal } from "./prune";
import { readDeliveryRange } from "./range";
import { readDeliveryPage } from "./read";
import { readSourceDeliveries } from "./source";
/** Соединяет операции журнала на заимствованной Mongo DB без владения клиентом; prune получает фабрику собственных временных sessions. */
export const createMongoDeliveryJournal = ({
  db,
  startSession,
}: Readonly<{
  db: Db;
  startSession: () => ClientSession;
}>): DeliveryJournal => ({
  forSource: (input) => readSourceDeliveries({ db, ...input }),
  prune: (input) => pruneDeliveryJournal({ db, startSession, ...input }),
  range: (input) => readDeliveryRange({ db, startSession, ...input }),
  head: (input) => readDeliveryHead({ db, ...input }),
  read: (input) => readDeliveryPage({ db, ...input }),
  materialize: (input) => materializeDelivery({ db, ...input }),
});
