import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface MigrationFile {
  version: number;
  name: string;
  filePath: string;
  sql: string;
}

export interface MigrationManifest {
  directory: string;
  files: MigrationFile[];
}

export function loadMigrationManifest(
  directory = defaultMigrationDirectory(),
): MigrationManifest {
  const fileNames = readdirSync(directory)
    .filter((fileName) => fileName.toLowerCase().endsWith(".sql"))
    .sort(compareMigrationNames);

  return {
    directory,
    files: fileNames.map((fileName) => {
      const filePath = join(directory, fileName);
      const version = parseVersion(fileName);

      return {
        version,
        name: fileName,
        filePath,
        sql: readFileSync(filePath, "utf8"),
      };
    }),
  };
}

export function getMigrationSummary(directory = defaultMigrationDirectory()): Array<
  Pick<MigrationFile, "version" | "name" | "filePath">
> {
  return loadMigrationManifest(directory).files.map(({ version, name, filePath }) => ({
    version,
    name,
    filePath,
  }));
}

function defaultMigrationDirectory(): string {
  return join(process.cwd(), "database");
}

function compareMigrationNames(left: string, right: string): number {
  return parseVersion(left) - parseVersion(right) || left.localeCompare(right);
}

function parseVersion(fileName: string): number {
  const match = fileName.match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}