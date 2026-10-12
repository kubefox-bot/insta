import { isoLayout } from "./conts";
import type { IsoBox } from "./types";
export class BoxReader {
  private position: number;
  /**
   * Привязывает локальный курсор к payload одного ISO box; DataView заимствуется без
   * копирования.
   */
  constructor(
    private readonly view: DataView,
    private readonly box: IsoBox,
  ) {
    this.position = box.data;
  }
  /** Читает беззнаковое 32-битное поле после проверки границ и сдвигает локальный курсор. */
  readonly unsigned = () => {
    this.require(isoLayout.wordBytes);
    const value = this.view.getUint32(this.position);
    this.position += isoLayout.wordBytes;
    return value;
  };
  /** Читает знаковое 32-битное поле для offset с проверкой границ и продвижением курсора. */
  readonly signed = () => {
    this.require(isoLayout.wordBytes);
    const value = this.view.getInt32(this.position);
    this.position += isoLayout.wordBytes;
    return value;
  };
  /**
   * Читает 64-битное беззнаковое поле и отклоняет значение вне safe integer, чтобы не
   * потерять точность media offset.
   */
  readonly long = () => {
    this.require(isoLayout.longBytes);
    const value = Number(this.view.getBigUint64(this.position));
    this.position += isoLayout.longBytes;
    if (!Number.isSafeInteger(value)) throw new Error("Unsafe media offset");
    return value;
  };
  /**
   * Потребляет unsigned поле только при установленном флаге; иначе сохраняет курсор и
   * использует default контейнера.
   */
  readonly optionalUnsigned = (present: number, fallback: number) =>
    present ? this.unsigned() : fallback;
  /**
   * Потребляет безопасное 64-битное поле только при установленном флаге, иначе возвращает
   * переданную базу.
   */
  readonly optionalLong = (present: number, fallback: number) =>
    present ? this.long() : fallback;
  /** Условно читает знаковый offset, не продвигая курсор при отсутствии поля. */
  readonly optionalSigned = (present: number, fallback: number) =>
    present ? this.signed() : fallback;
  /** Пропускает заданное число байтов только внутри текущего box payload. */
  readonly skip = (bytes: number) => {
    this.require(bytes);
    this.position += bytes;
  };
  /** Возвращает непрочитанный остаток payload для проверки размера sample table. */
  readonly remaining = () => this.box.end - this.position;
  /** Требует полного потребления payload, отклоняя лишние либо несовпадающие поля box. */
  readonly finish = () => {
    if (this.position !== this.box.end) throw new Error("Box payload bounds");
  };
  /** Не допускает чтение или пропуск за концом текущего box; курсор не изменяет. */
  private readonly require = (bytes: number) => {
    if (this.position + bytes > this.box.end)
      throw new Error("Box field bounds");
  };
}
