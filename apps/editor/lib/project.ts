import fs from "fs/promises";
import path from "path";

const CONFIG_PATH = path.join(/*turbopackIgnore: true*/ process.cwd(), "active-project.json");

export async function getProjectPath(): Promise<string> {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(data);
    return parsed.projectPath || path.join(/*turbopackIgnore: true*/ process.cwd(), "my-new-project");
  } catch {
    // Default project folder
    const defaultPath = path.join(/*turbopackIgnore: true*/ process.cwd(), "my-new-project");
    // Ensure default folder exists
    await fs.mkdir(defaultPath, { recursive: true });
    return defaultPath;
  }
}

export async function setProjectPath(projectPath: string): Promise<string> {
  const resolved = path.isAbsolute(projectPath)
    ? projectPath
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), projectPath);
  
  await fs.mkdir(resolved, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify({ projectPath: resolved }, null, 2), "utf-8");
  return resolved;
}
