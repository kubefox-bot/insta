# WebM fixtures

Небольшая portable-подвыборка измеренного preflight от2026-10-11. Источник,
браузер, размер и SHA256 каждого бинарного файла — в `provenance.json`.
Tests читают только эти committed fixtures; `.infra/` не требуется.

Chrome VP8/VP9 и14.8s margin — native streaming AV, затем ранее проверенная
Info-only вставка Duration с сохранением encoded payload/Cluster headers.
Edge VP8/VP9 — исходные native indexed записи с положительной Duration.
Long-video fixture — исходные Chrome video timestamps до15.951s, короткое
Opus audio до0.802s, metadata1s; чистый decode не делает его допустимым.
Все источники используют synthetic AV; физические camera/microphone не трогались.

`modify.ts` строит тестовые повреждения и допустимые изменения контейнера,
не перекодирует AV. Полный unknown-size prefix, заканчивающийся на целом Block,
может остаться другим валидным предоставленным файлом; это не доказательство
того, что клиент загрузил все когда-либо записанные кадры.
