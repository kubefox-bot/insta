import { WebmFailure } from "../failure";
import { clusterChildIds, ids, maxLayoutElements, segmentIds } from "./conts";
import { readElement } from "./element";
import { readInfo } from "./info";
import type { Element, InfoLayout, WebmLayout } from "./types";

class LayoutReader {
  private elements = 0;
  private info: InfoLayout | undefined = undefined;
  private indexed = false;
  private clusterSeen = false;
  private tracksSeen = false;
  /** Заимствует bytes для ограниченного обхода контейнера, не копируя и не изменяя их. */
  constructor(private readonly bytes: Uint8Array) {}

  /** Читает очередной элемент, учитывая общий предел количества элементов layout. */
  private readonly elementAt = (start: number, end: number) => {
    if (++this.elements > maxLayoutElements)
      throw new WebmFailure("unsupported-layout");
    return readElement({ bytes: this.bytes, start, end });
  };
  /** Проверяет допустимость конечного child Cluster и отмечает наличие позиционного индекса. */
  private readonly readClusterChild = (child: Element) => {
    if (!clusterChildIds.includes(child.id) || child.unknown)
      throw new WebmFailure("unsupported-layout");
    if (child.id === ids.position) this.indexed = true;
  };
  /** Отмечает Cluster и проверяет его конечных детей; детей Cluster неизвестного размера обходит внешний reader сегмента, отвергая неизвестный размер самих детей. */
  private readonly readCluster = (element: Element) => {
    this.clusterSeen = true;
    if (element.unknown) return;
    for (let offset = element.dataStart; offset < element.end; ) {
      const child = this.elementAt(offset, element.end);
      this.readClusterChild(child);
      offset = child.end;
    }
  };
  /** Разбирает поддержанные секции Segment, проверяя порядок Info/Tracks и наличие индексов; CRC и неизвестные секции отклоняет. */
  private readonly readSection = (element: Element) => {
    if (element.unknown) throw new WebmFailure("unsupported-layout");
    switch (element.id) {
      case ids.info:
        if (this.info || this.clusterSeen)
          throw new WebmFailure("unsupported-layout");
        this.info = readInfo({ bytes: this.bytes, element });
        return;
      case ids.tracks:
        if (this.tracksSeen || this.clusterSeen)
          throw new WebmFailure("unsupported-layout");
        this.tracksSeen = true;
        return;
      case ids.seekHead:
      case ids.cues:
        this.indexed = true;
        return;
      case ids.void:
        return;
      default:
        // Includes segment CRC: editing Info would invalidate its checksum.
        throw new WebmFailure("unsupported-layout");
    }
  };
  /** Обходит Segment, различая продолжение Cluster неизвестного размера и начало следующей секции. */
  private readonly readSegment = (segment: Element) => {
    let unknownCluster = false;
    for (let offset = segment.dataStart; offset < segment.end; ) {
      const element = this.elementAt(offset, segment.end);
      if (unknownCluster && !segmentIds.includes(element.id)) {
        this.readClusterChild(element);
      } else if (element.id === ids.cluster) {
        this.readCluster(element);
        unknownCluster = element.unknown;
        if (element.unknown) {
          offset = element.dataStart;
          continue;
        }
      } else {
        unknownCluster = false;
        this.readSection(element);
      }
      offset = element.end;
    }
  };
  /** Требует EBML header и один Segment до конца bytes, затем Info, Tracks и Cluster; возвращает layout для ремонта, не проверяя кодеки. */
  readonly read = (): WebmLayout => {
    const header = this.elementAt(0, this.bytes.length);
    if (header.id !== ids.ebml || header.unknown)
      throw new WebmFailure("invalid-layout");
    const segment = this.elementAt(header.end, this.bytes.length);
    if (segment.id !== ids.segment || segment.end !== this.bytes.length)
      throw new WebmFailure("invalid-layout");
    this.readSegment(segment);
    if (!this.info || !this.tracksSeen || !this.clusterSeen)
      throw new WebmFailure("invalid-layout");
    return { segment, info: this.info, indexed: this.indexed };
  };
}
/** A bounded native layout reader, not a codec/payload or server acceptance validator. */
export const readLayout = (bytes: Uint8Array): WebmLayout =>
  new LayoutReader(bytes).read();
