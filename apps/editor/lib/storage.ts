import fs from "fs/promises";
import path from "path";
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Interface for File Nodes matching Editor's FileTree structures
export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

export interface StorageProvider {
  readFile(projectId: string, fileRelativePath: string): Promise<string>;
  readBinaryFile(projectId: string, fileRelativePath: string): Promise<Buffer>;
  writeFile(projectId: string, fileRelativePath: string, content: string | Buffer): Promise<void>;
  createDirectory(projectId: string, dirRelativePath: string): Promise<void>;
  listProjectFiles(projectId: string): Promise<FileNode[]>;
  move(projectId: string, oldPath: string, newPath: string): Promise<void>;
  delete(projectId: string, fileRelativePath: string): Promise<void>;
}

// -------------------------------------------------------------
// 1. Local File System Storage Provider
// -------------------------------------------------------------
export class LocalStorageProvider implements StorageProvider {
  private getLocalPath(projectId: string, fileRelativePath: string): string {
    // Standard workspace path resolution (e.g. apps/editor/projects/UUID)
    const baseDir = projectId === "default" || !projectId
      ? path.join(process.cwd(), "my-new-project")
      : path.join(process.cwd(), "projects", projectId);
    const resolved = path.resolve(baseDir, fileRelativePath);
    if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) {
      throw new Error("Directory traversal attempt detected");
    }
    return resolved;
  }

  async readFile(projectId: string, fileRelativePath: string): Promise<string> {
    const fullPath = this.getLocalPath(projectId, fileRelativePath);
    return await fs.readFile(fullPath, "utf-8");
  }

  async readBinaryFile(projectId: string, fileRelativePath: string): Promise<Buffer> {
    const fullPath = this.getLocalPath(projectId, fileRelativePath);
    return await fs.readFile(fullPath);
  }

  async writeFile(projectId: string, fileRelativePath: string, content: string | Buffer): Promise<void> {
    const fullPath = this.getLocalPath(projectId, fileRelativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    if (typeof content === "string") {
      await fs.writeFile(fullPath, content, "utf-8");
    } else {
      await fs.writeFile(fullPath, content);
    }
  }

  async createDirectory(projectId: string, dirRelativePath: string): Promise<void> {
    const fullPath = this.getLocalPath(projectId, dirRelativePath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  async move(projectId: string, oldPath: string, newPath: string): Promise<void> {
    const oldFullPath = this.getLocalPath(projectId, oldPath);
    const newFullPath = this.getLocalPath(projectId, newPath);
    await fs.mkdir(path.dirname(newFullPath), { recursive: true });
    await fs.rename(oldFullPath, newFullPath);
  }

  async delete(projectId: string, fileRelativePath: string): Promise<void> {
    const fullPath = this.getLocalPath(projectId, fileRelativePath);
    await fs.rm(fullPath, { recursive: true, force: true });
  }

  async listProjectFiles(projectId: string): Promise<FileNode[]> {
    const baseDir = projectId === "default" || !projectId
      ? path.join(process.cwd(), "my-new-project")
      : path.join(process.cwd(), "projects", projectId);

    try {
      await fs.mkdir(baseDir, { recursive: true });
    } catch {
      // Ignored
    }

    const EXCLUDED = new Set(["node_modules", ".git", ".next", ".eve", ".workflow-data"]);

    const scan = async (dir: string, relativeRoot = ""): Promise<FileNode[]> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const nodes: FileNode[] = [];

      for (const entry of entries) {
        if (EXCLUDED.has(entry.name) || entry.name.endsWith(".pdf")) continue;
        const relPath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const children = await scan(fullPath, relPath);
          nodes.push({
            name: entry.name,
            path: relPath,
            isDir: true,
            children,
          });
        } else {
          nodes.push({
            name: entry.name,
            path: relPath,
            isDir: false,
          });
        }
      }

      return nodes.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
    };

    return await scan(baseDir);
  }
}

// -------------------------------------------------------------
// 2. S3 / Cloud / Railway Storage Buckets Provider
// -------------------------------------------------------------
class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      endpoint: process.env.AWS_ENDPOINT,
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
      forcePathStyle: true, // Crucial for Railway / MinIO / LocalStack
    });
    this.bucket = process.env.AWS_BUCKET_NAME || "latex-editor";
  }

  private getS3Key(projectId: string, fileRelativePath: string): string {
    const cleanProj = projectId || "default";
    const normalized = path.posix.normalize(fileRelativePath);
    if (normalized.startsWith("../") || normalized === "..") {
      throw new Error("Directory traversal attempt detected");
    }
    return `projects/${cleanProj}/${normalized.replace(/^\//, "")}`;
  }

  async readFile(projectId: string, fileRelativePath: string): Promise<string> {
    const key = this.getS3Key(projectId, fileRelativePath);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    return (await response.Body?.transformToString()) || "";
  }

  async readBinaryFile(projectId: string, fileRelativePath: string): Promise<Buffer> {
    const key = this.getS3Key(projectId, fileRelativePath);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    const byteArray = await response.Body?.transformToByteArray();
    return byteArray ? Buffer.from(byteArray) : Buffer.alloc(0);
  }

  async writeFile(projectId: string, fileRelativePath: string, content: string | Buffer): Promise<void> {
    const key = this.getS3Key(projectId, fileRelativePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: typeof content === "string" ? Buffer.from(content, "utf-8") : content,
        ContentType: fileRelativePath.endsWith(".pdf")
          ? "application/pdf"
          : fileRelativePath.endsWith(".tex")
          ? "text/plain"
          : "application/octet-stream",
      })
    );
  }

  async createDirectory(projectId: string, dirRelativePath: string): Promise<void> {
    // S3 has virtual folders, so directory creation is a virtual no-op.
    // We can write a placeholder file to establish the folder prefix structure if desired.
    const key = this.getS3Key(projectId, `${dirRelativePath}/.keep`);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: "",
      })
    );
  }

  async move(projectId: string, oldPath: string, newPath: string): Promise<void> {
    const oldPrefix = this.getS3Key(projectId, oldPath);
    const newPrefix = this.getS3Key(projectId, newPath);

    const listResponse = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: oldPrefix,
      })
    );

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      try {
        await this.client.send(
          new CopyObjectCommand({
            Bucket: this.bucket,
            CopySource: encodeURIComponent(`${this.bucket}/${oldPrefix}`),
            Key: newPrefix,
          })
        );
        await this.client.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: oldPrefix,
          })
        );
      } catch (error) {
        console.error("Direct S3 move failed:", error instanceof Error ? error.message : String(error));
      }
      return;
    }

    for (const object of listResponse.Contents) {
      if (!object.Key) continue;
      const relativePart = object.Key.substring(oldPrefix.length);
      const destKey = newPrefix + relativePart;

      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: encodeURIComponent(`${this.bucket}/${object.Key}`),
          Key: destKey,
        })
      );

      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: object.Key,
        })
      );
    }
  }

  async delete(projectId: string, fileRelativePath: string): Promise<void> {
    const prefix = this.getS3Key(projectId, fileRelativePath);

    const listResponse = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      })
    );

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: prefix,
        })
      );
      return;
    }

    for (const object of listResponse.Contents) {
      if (!object.Key) continue;
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: object.Key,
        })
      );
    }
  }

  async listProjectFiles(projectId: string): Promise<FileNode[]> {
    const prefix = `projects/${projectId || "default"}/`;
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      })
    );

    if (!response.Contents) return [];

    const fileNodes: FileNode[] = [];
    const dirMap = new Map<string, FileNode>();

    for (const object of response.Contents) {
      if (!object.Key) continue;
      
      // Get path relative to the project folder prefix
      const relativePath = object.Key.substring(prefix.length);
      if (!relativePath || relativePath === ".keep" || relativePath.endsWith(".pdf")) continue;

      const parts = relativePath.split("/");
      let currentPath = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = i === parts.length - 1;

        if (!isLast) {
          // It's a directory
          if (!dirMap.has(currentPath)) {
            const dirNode: FileNode = {
              name: part,
              path: currentPath,
              isDir: true,
              children: [],
            };
            dirMap.set(currentPath, dirNode);

            if (parentPath) {
              dirMap.get(parentPath)?.children?.push(dirNode);
            } else {
              fileNodes.push(dirNode);
            }
          }
        } else {
          // It's a file
          if (part === ".keep") continue;
          const fileNode: FileNode = {
            name: part,
            path: currentPath,
            isDir: false,
          };
          if (parentPath) {
            dirMap.get(parentPath)?.children?.push(fileNode);
          } else {
            fileNodes.push(fileNode);
          }
        }
      }
    }

    // Sort function for structure consistency
    const sortNodes = (nodes: FileNode[]) => {
      nodes.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
      for (const node of nodes) {
        if (node.children) sortNodes(node.children);
      }
    };

    sortNodes(fileNodes);
    return fileNodes;
  }
}

// -------------------------------------------------------------
// Singleton Instance Selection based on environment variables
// -------------------------------------------------------------
// S3 errors now propagate to callers — a storage failure must fail the request,
// never silently write to ephemeral local disk.
export const storage: StorageProvider =
  process.env.STORAGE_PROVIDER === "s3"
    ? new S3StorageProvider()
    : new LocalStorageProvider();

