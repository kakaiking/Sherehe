import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function fontDir(fromMetaUrl: string): string {
  const bundled = join(dirname(fileURLToPath(fromMetaUrl)), "../../assets/fonts");
  const candidates = [
    bundled,
    join(process.cwd(), "server/assets/fonts"),
    join(process.cwd(), "assets/fonts"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "Sora-Variable.ttf"))) return dir;
  }
  return bundled;
}
