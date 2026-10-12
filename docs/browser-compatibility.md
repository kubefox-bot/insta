# Браузерная совместимость

Основные desktop браузеры — настоящие Google Chrome и Microsoft Edge с Chromium engine. По умолчанию Playwright использует channels chrome и msedge. Для отдельного подписанного Chrome допускается абсолютный путь ACCEPTANCE_CHROME_EXECUTABLE. Используются временные contexts без пользовательских profiles и без изменения системного доверия. Узкий viewport проверяет layout, а не реальное мобильное устройство.

Обязательные core journeys идут через реальный локальный Traefik и приложение. E02/E05 smoke дополнительно выделены отдельной фазой. Проверяются locale/privacy SSR, JS-disabled и hydration failure, slow CPU/network, reduced motion, keyboard и responsive selection. E03/E08 fault cases имеют отдельную test-only BFF composition с реальной persistence; её граница описана в [testing.md](testing.md).

HTTP/3 имеет самостоятельное доказательство. Факт `http3: {}` в Traefik не доказывает h3. Native Chrome/Edge forced QUIC попытки 9 октября завершились `ERR_QUIC_PROTOCOL_ERROR`; это сохранённый compatibility gap. Основные browser journeys продолжают проверять рабочий TCP путь.

Отдельный pinned diagnostic client `sha256:c3a360869a4e132180f458f83af2ce67b873b2302739eda27274dad4f62155f8` (curl 8.17DEV, quiche 0.24.5) показал `--http3-only → 3 200` и отдельно `--http2 → 2 200` на `insta-core_default`. Его Linux amd64 выполняется как диагностический клиент; приложение остаётся Linux arm64. Эта проверка не доказывает опубликованный host UDP-порт или Chrome h3. TLS bypass действует только для данной команды, системное доверие не меняется. Первичный receipt ROOT: HTTP/3 probe (исторический результат; private логи не входят в поставку); финальный протокольный запуск находится в отчёте runner.

Приёмка BASE `585d0562`: run `9b6879fa-eafb-4f28-ba12-b308982ca7ff`, все13 фаз PASS без retries. Установленные версии — Chrome `155.0.8059.39`, Edge `154.0.4258.62`. Это receipt указанного source/image; последующие scoped fix checks описываются отдельно в DONE-02 fix report (исторический результат; private логи не входят в поставку).

| Проверка | Обязательность core | Фактический результат указанного run |
| --- | --- | --- |
| Chrome / Edge все core journeys | Да | 84 PASS /0 FAIL,4.1m |
| E02/E05 auth/chat smoke | Да, отдельная filtered фаза | 4 PASS /0 FAIL,19.8s; не заменяет полный primary owner |
| E13 slow network / SSR locale/privacy / no-JS | Да | Chrome/Edge PASS в main84/0 |
| E03/E08 native-port fault и cookie/SSR | Да | Chrome/Edge PASS в main84/0; test-only provider-port fault boundary |
| Main Faro receipt при current consent | Да, отдельный optional profile | Chrome/Edge2 PASS /0 FAIL,6.7s; default восстановлен, owned receiver остановлен |
| Browser forced QUIC | Отдельная compatibility граница | Chrome/Edge FAIL: ERR_QUIC_PROTOCOL_ERROR |
| H3-only + отдельный HTTP2 | Отдельное protocol evidence | PASS: actual3/200 и2/200 через pinned Docker client |
| Stories native WebM и сохранённый MP4 path, synthetic permission denial, auto-stop14800ms, Range/seek, track/resource release | Full scope | Текущая provenance и результаты — в Stories acceptance |
| Настоящие camera/mic и OS permission prompts | Ручная аппаратная граница | NOT-RUN; synthetic capture не заменяет устройство |
| Firefox / WebKit / реальное mobile устройство | Дополнительные | not-run |

История failed full runs сохранена в DONE-02 report (исторический результат; private логи не входят в поставку): `9bc4801c` (main46/34,smoke2/2), `013da624` (main78/6), `f7d7f8e6` (main83/1 и provider abuse26/1). A13 race исправлен run-owned namespace. Исторический Chrome slow-CPU SSR `ERR_PROXY_CONNECTION_FAILED` изf7d7f8e6 не воспроизведён diagnostic/target/currentfull; причина остаётся неизвестной. Последующий PASS не объявляется исправлением этого flake.

Stories записывают native WebM VP8/VP9+Opus с metadata repair; сервер
проверяет весь файл и presentation horizon. MP4 H.264/AAC path сохранён;
transcode/remux отсутствует.
Synthetic media и controlled browser/permission ports проверяются отдельно от
реальной камеры/микрофона. OS prompts и физическое устройство не запускались.
Ручной checklist остаётся NOT-RUN: разрешить/отклонить camera и mic; записать
реальную запись до auto-stop14800ms; дождаться final chunk; preview → publish → guest playback;
Range/seek; close/unmount и завершение tracks. Версии фактических browser runs
и проверки source/image рассматриваются отдельно; результаты конкретного
запуска записываются в private acceptance report.

DONE-03 добавляет isolated Conversations state/session lifecycle contracts и
packed installed Kit boundary. Unit/extraction checks не повторяют browser
journeys и сами по себе не доказывают Stories camera/objectURL cleanup.
Изменённый frontend shutdown требует отдельного current-image runtime proof;
приведённая таблица сохраняет точную BASE provenance. Финальный независимый
review всей ветки выполняется отдельным gate после task acceptance.

## Ручная проверка физических устройств — NOT-RUN

Для каждой целевой OS/browser записать версию, устройство и результат каждого шага:

- [ ] Разрешить camera/mic в настоящем OS prompt; отдельно отклонить каждое разрешение и проверить понятный отказ.
- [ ] Записать реальное видео со звуком до auto-stop 14800ms; дождаться final chunk и проверить полный preview.
- [ ] Явно опубликовать; в гостевом context воспроизвести видео со звуком, проверить Range/seek и конец записи.
- [ ] Закрыть recorder/player и уйти со страницы; проверить погасший аппаратный индикатор и завершение tracks.
- [ ] Повторить на физическом mobile устройстве; responsive viewport не заменяет эту проверку.
- [ ] Отдельно проверить WebKit/Safari; Chrome/Edge не доказывают его media compatibility.

Агент эти аппаратные шаги не выполнял. MP4 H.264/AAC остаётся поддержанным путём.
Свежий узкий guest-author registration receipt отражается в результатах browser-проверок.

11 октября узкий public Stories owner на source `8064e2c` прошёл Chrome
`155.0.8059.39` — 7/7 и Edge `155.0.4283.45` — 7/7, без retries. Включён
полный selected-author → новая Mailpit registration → Continue → точный
counterpart и пустые canonical messages до Send. Это не повтор всей core/full
матрицы; результаты относятся только к указанным browser-кейсам.

16 октября 2026 добавлен сценарий `explicit logout outside conversations deletes
retained IndexedDB messages` в существующий `conversations/outbox.spec.ts`:
неотправленное сообщение → полная навигация вне чатов → logout → проверка
IndexedDB → повторный вход. После discovery выполнен локальный продуктовый
прогон: Chrome `155.0.8059.84` — PASS, Edge `155.0.4283.45` — PASS;
2/2, без retries. Настоящий composer/IndexedDB, synthetic accounts и Mailpit,
свежие FE/BE/testhost без source mounts, Stories disabled. Сообщение сохранилось
после ухода из чатов и отсутствовало после logout и повторного login.
Unit-регрессии проверили cleanup после dispose, сохранение при reauth, изоляцию
пользователей и закрытие соединения после settlement/ошибки. Они не заменяют
проверку настоящего IndexedDB и UI. Source identity и история source-прогонов
зафиксированы в [testing.md](testing.md#исправления-logout-и-времени-активности--16-октября-2026).
CSS HMR compatibility падал по deadline внутри sandbox, но прошёл вне sandbox;
весь отдельный compatibility-повтор дал 64 PASS / 1 Linux-only SKIP / 0 FAIL.
Это отдельная tooling-проверка. Новый продуктовый прогон подтверждает только
указанный logout-сценарий; полная браузерная матрица и hardware не повторялись.

21 октября 2026 финальный scoped F7 Stories прогон в Chrome 155.0.8059.85:
3/3 PASS, 48.0 s, без retries. Проверены поздний отказ старого continuation
и отмена поздней квитанции после закрытия Story для guest/authenticated.
Frontend пересобран после исправления; source/image identity и ограничения
приведены в [testing.md](testing.md#завершение-f7--21-октября-2026).
Edge F7 и остальная матрица на окончательном исходнике — NOT RUN по запросу
пользователя. Ручной Browser walkthrough — NOT RUN из-за self-signed certificate;
системное доверие не менялось. Это не аппаратная media acceptance.

В тот же день исправленный strict-CSP owner прошёл Chrome 155.0.8059.85 и Edge
155.0.4283.62 — 2/2 PASS, 14.0 s, без retries. Browser eval остаётся запрещён;
проверены новый prepare/activate contract, delivery envelope и точный applied ACK.
Это узкий повтор CSP, не всей Core/Full матрицы; исходные failing runs сохранены.
Source identity и граница локального fixture описаны в
[testing.md](testing.md#исправление-csp-fixture--21-октября-2026).

### Stories live feed, 2026-10-21

PASS во встроенном браузере Codex на локальном Full: после загрузки исправленного frontend elena держит чат открытым; публикация bod обновляет порядок авторов Stories без reload/visibility trigger. Retry-later и reconnect replay дополнительно проверены реальными Socket.IO-клиентами на финальных Docker images (identity и source manifest — в docs/testing.md). Полная Chrome/Edge/HTTP3-матрица для этого изменения — NOT RUN. Гостевой live WS не заявлен.
