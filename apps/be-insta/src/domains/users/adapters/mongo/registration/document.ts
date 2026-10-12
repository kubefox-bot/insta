import type { ObjectId } from "mongodb";
import type { RegistrationPersistence } from "../../../auth/ports/registration/persistence";
import { emailKey } from "../../../domain/policy";
import type { UserDocument } from "../types";
/**
 * Строит pending-документ после подтверждения email, сохраняя прежний id; живой срок
 * регистрации может только сократиться, истёкший заменяется новым.
 */
export const confirmedPending = ({
  input,
  existing,
  proposedId,
  now,
}: Readonly<{
  input: Parameters<RegistrationPersistence["confirmEmail"]>[0];
  existing: Extract<UserDocument, { status: "pending_setup" }> | null;
  proposedId: ObjectId;
  now: number;
}>): Extract<UserDocument, { status: "pending_setup" }> => ({
  _id: existing?._id ?? proposedId,
  status: "pending_setup",
  emailKey: emailKey(input.email),
  emailVerifiedAt: new Date(now),
  registrationExpiresAt: new Date(
    existing && existing.registrationExpiresAt.getTime() > now
      ? Math.min(
          existing.registrationExpiresAt.getTime(),
          input.registrationExpiresAt,
        )
      : input.registrationExpiresAt,
  ),
});
