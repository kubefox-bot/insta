# Свежие WebM fixtures 11 октября 2026

16 synthetic native AV captures: Chrome155.0.8059.39 и Edge155.0.4283.45,
VP8/VP9+Opus, short800ms и production auto-stop14800ms, default `start()` и
streaming `start(250)`. Использован production Stories adapter/finalizer;
provider wrapper только выбирает candidate и наблюдает native events/chunks.
1280×720, actual20fps, mono48kHz. Физические устройства не использовались.

`provenance.json` фиксирует каждый SHA256/size/browser/actual unclamped elapsed.
Все16 original/final пары сохраняют hash/count/size/PTS/duration **каждого**
encoded AV packet, decoder configuration и raw CodecPrivate. Eight default
files сохранились целиком; eight streaming files получили только metadata.
Preview/seek, finaldata→stop→finalizer и release tracks подтверждены отдельно.
Private receipts: `.infra/webm-task4-20261011/` (не попадают в образ/commit).

Дополнительные16s captures с целым AV и коротким audio являются negative
fixtures. В `*-shortaudio-forged.webm` изменена только Duration на1s;
encoded timestamps/payload не менялись. Partial/index/oversize cases создаются
в существующем integration owner из этих fixtures. Исторические MP4/WebM
fixtures сохранены. Whole-file validation проверяет предоставленный файл;
целый Block-prefix не доказывает полную историю capture.
