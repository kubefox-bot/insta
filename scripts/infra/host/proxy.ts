import { secureDirectory, writePrivateFile } from "../artifacts";
import { readInfraConfig } from "../config";
import type { readHostSettings } from "./config";
import { hostDefaults } from "./conts";

/** Заменяет ожидаемые контейнерные upstreams шаблона на host.docker.internal и корректирует HTTPS redirect для нестандартного порта. Несовпадение шаблона отклоняет; входные строки сохраняет. */
export const renderHostProxy = ({
  settings,
  dynamic,
  static: staticTemplate,
}: {
  readonly settings: ReturnType<typeof readHostSettings>;
  readonly dynamic: string;
  readonly static: string;
}) => {
  const upstreams = dynamic
    .replace(
      "http://be-insta:3001",
      `http://host.docker.internal:${settings.backendPort}`,
    )
    .replace(
      "http://fe-insta:3000",
      `http://host.docker.internal:${settings.frontendPort}`,
    );
  if (
    upstreams === dynamic ||
    upstreams.includes("http://be-insta:") ||
    upstreams.includes("http://fe-insta:") ||
    !staticTemplate.includes("to: websecure")
  )
    throw new Error(
      "Host proxy template does not match owned upstreams and redirect",
    );
  return {
    dynamic: upstreams,
    static:
      settings.httpsPort === hostDefaults.httpsPort
        ? staticTemplate
        : staticTemplate.replace(
            "to: websecure",
            `to: ':${settings.httpsPort}'`,
          ),
  };
};
/** Читает Traefik templates и записывает две приватные project-specific конфигурации в .infra. Возвращает пути; существующие управляемые файлы явно заменяет, сам proxy не запускает. */
export const prepareHostProxy = async (
  settings: ReturnType<typeof readHostSettings>,
) => {
  const [dynamicTemplate, staticTemplate] = await Promise.all([
    Bun.file("infra/traefik/dynamic.yml").text(),
    Bun.file("infra/traefik/static.yml").text(),
  ]);
  const rendered = renderHostProxy({
    settings,
    dynamic: dynamicTemplate,
    static: staticTemplate,
  });
  await secureDirectory(".infra");
  const project = readInfraConfig().project;
  const paths = {
    dynamic: `.infra/${project}-host-traefik.yml`,
    static: `.infra/${project}-host-traefik-static.yml`,
  };
  await writePrivateFile({
    path: paths.dynamic,
    content: rendered.dynamic,
    mode: "replace",
  });
  await writePrivateFile({
    path: paths.static,
    content: rendered.static,
    mode: "replace",
  });
  return paths;
};
