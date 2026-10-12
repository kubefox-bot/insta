import { AuthErrorCode } from "@insta/contracts/errors";
import { passwordAdmission } from "./conts";
export class PasswordAdmissionError extends Error {
  readonly code = AuthErrorCode.AuthBusy;
  readonly retryAfterSeconds = passwordAdmission.retryAfterSeconds;
  /**
   * Создаёт ожидаемый отказ при исчерпании password capacity; код AuthBusy и Retry-After
   * заданы политикой класса.
   */
  constructor() {
    super("Password capacity unavailable");
  }
}
