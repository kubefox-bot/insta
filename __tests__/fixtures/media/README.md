# Нативные media fixtures

Файлы записаны настоящими Chrome 155.0.8059.39 и Edge 155.0.4283.45 через MediaRecorder с синтетическими камерой и микрофоном. Они не конвертировались и не перемультиплексировались. Проверка физической камеры, ОС-разрешений и иных браузеров остаётся отдельной приёмкой.

`*-valid.mp4` — короткие H264/AAC recordings, `*-long.mp4` — записи с длительностью пакетов больше15секунд. `media.test.ts` проверяет исходные пакеты, усечения, неверные данные, codec entry, точные15000/15001мс, размер потока, cancellation и worker admission. `modify.ts` намеренно изменяет длительность последнего видеопакета в конкретной native fixture, чтобы проверить границу независимо от таймера записи; исходный файл сохраняется.

UI Stories записывает VP8/VP9 + Opus; текущие regression fixtures находятся в webm/ и webm/fresh/ и читаются media-webm.test.ts. MP4 H.264/AAC upload/validation/storage/playback и MP4 fixtures сохраняются. Неиспользуемые исторические шесть WebM файлов и их root provenance удалены.

Provenance текущих WebM находится рядом с fixtures в webm/ и webm/fresh/. `mp4-provenance.json` фиксирует параметры и SHA256 MP4. Локальные диагностические probes и исходные неотредактированные результаты находятся в private Task2 evidence, вне публикуемого приложения.

## Ограниченный native-профиль инспектора

Поддерживаются fragmentedMP4 H264/AAC без track edit lists (`edts/elst`), максимум15000мс по доказанным samples и20MiB фактического потока. Общий бюджет разбора одного файла —4096 ISO boxes, глубина12,8192 samples обоих tracks вместе. Count проверяется до создания sample объектов; максимум packet end вычисляется без spread. Эти границы покрывают короткие native recordings и сознательно отвергают более сложные контейнеры.

Geometry budget —921600 coded pixels (1280×720, либо соответствующая портретная ориентация). Container geometry проверяется до decoder, а `ffprobe -max_pixels` отдельно применяет предел к реальному H264 SPS. Camera consumer должен выбирать совместимые constraints. На Linux каждый decoder запускается через `prlimit`:512MiB виртуального address space,8секунд CPU; общий inspection deadline≤10секунд, максимум2 занятого slot. `max_alloc`64MiB ограничивает отдельную аллокацию и не заявляется общим RAM лимитом. На macOS compatibility используется ffprobe с pixel/individual-allocation/deadline ограничениями; Linux RLIMIT там не доказан и не заявляется.

`edit-list.ts`, `sps.ts`, `modify.ts` создают вредоносные варианты исходного Chrome fixture в памяти: leading20s empty edit,8192×8192 SPS при неизменных640×480 container dimensions, один non-VCL video sample. Ни исходные recording bytes, ни product media не ремультиплексируются. Lifecycle fixtures запускают настоящие busy workers и IPC-ready child processes; settlement barrier удерживает completion, чтобы проверить close/admission ownership без production fault controls.
