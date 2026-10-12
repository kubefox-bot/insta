import type { AuthDialogDependencies } from "./types";
/**
 * Связывает смену auth-режима, закрытие и успешный вход с очисткой временно перенесённых полей
 * формы.
 */
export const createAuthDialogOperations = ({
  inputTransfer,
  chooseAuthentication,
}: AuthDialogDependencies) => ({
  /**
   * Удаляет снимок прежних полей перед выбором нового режима аутентификации.
   */
  chooseMode: (
    input: Parameters<AuthDialogDependencies["chooseAuthentication"]>[0],
  ) => {
    inputTransfer.clear();
    chooseAuthentication(input);
  },
  close: inputTransfer.clear,
  authenticated: inputTransfer.clear,
});
