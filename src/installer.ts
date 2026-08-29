import { execFileSync } from "child_process";
import * as fs from "fs";
import * as https from "https";
import { IncomingMessage } from "http";
import * as os from "os";
import * as path from "path";
import { FileSystemAdapter } from "obsidian";
import type LangToolPlugin from "./main";

const LT_DOWNLOAD_URL = "https://languagetool.org/download/LanguageTool-stable.zip";

export class LanguageToolInstaller {
	constructor(private plugin: LangToolPlugin) {}

	get installDir(): string {
		const adapter = this.plugin.app.vault.adapter as FileSystemAdapter;
		const basePath = adapter.getBasePath();
		return path.join(basePath, ".obsidian", "plugins", this.plugin.manifest.id, "lt");
	}

	get jarPath(): string {
		return path.join(this.installDir, "languagetool-server.jar");
	}

	isInstalled(): boolean {
		return fs.existsSync(this.jarPath);
	}

	async install(onProgress?: (pct: number) => void): Promise<string> {
		this.cleanupStaleTempDownloads();
		this.ensureDir(this.installDir);
		const zip = path.join(this.installDir, "LanguageTool-stable.zip");
		await this.download(zip, onProgress);
		try {
			// decompress with python3 (already a runtime dep of the server launcher)
			// ponytail: python3 -m zipfile, add yauzl/extract-zip if Windows lacks python3
			execFileSync("python3", ["-m", "zipfile", "-e", zip, this.installDir], { stdio: "pipe" });
		} finally {
			fs.rmSync(zip, { force: true });
		}
		// the jar is nested under a versioned folder (e.g. LanguageTool-6.6/...)
		// — locate it and copy it to the canonical path we expect
		const found = this.locateJar();
		if (!found) {
			throw new Error("No se encontró languagetool-server.jar tras descomprimir");
		}
		if (path.resolve(found) !== path.resolve(this.jarPath)) {
			fs.copyFileSync(found, this.jarPath);
		}
		this.cleanupExtracted();
		return this.jarPath;
	}

	/** recursive search for languagetool-server.jar under installDir */
	private locateJar(dir = this.installDir): string | null {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				const sub = this.locateJar(full);
				if (sub) return sub;
			} else if (entry.name === "languagetool-server.jar") {
				return full;
			}
		}
		return null;
	}

	/** remove the versioned extracted folder we copied the jar out of */
	private cleanupExtracted(): void {
		for (const entry of fs.readdirSync(this.installDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const full = path.join(this.installDir, entry.name);
			if (path.resolve(full) !== path.resolve(this.jarPath)) {
				fs.rmSync(full, { recursive: true, force: true });
			}
		}
	}

	private ensureDir(dir: string): void {
		fs.mkdirSync(dir, { recursive: true });
	}

	/** remove leftover lt-*.zip downloads in the temp dir from failed/aborted runs */
	private cleanupStaleTempDownloads(): void {
		try {
			const prefix = "lt-";
			for (const name of fs.readdirSync(os.tmpdir())) {
				if (name.startsWith(prefix) && name.endsWith(".zip")) {
					fs.rmSync(path.join(os.tmpdir(), name), { force: true });
				}
			}
		} catch {
			// best-effort cleanup; ignore any fs/permission errors
		}
	}

	private async download(zip: string, onProgress?: (pct: number) => void): Promise<void> {
		// plain https (node builtin) streams the download so we get real progress,
		// and runs in the electron main/renderer node context, avoiding the CORS that
		// blocks fetch from app://obsidian.md
		const tmp = path.join(os.tmpdir(), `lt-${Date.now()}.zip`);
		try {
			const file = fs.createWriteStream(tmp);
			const resp = await new Promise<IncomingMessage>((resolve, reject) => {
				https.get(LT_DOWNLOAD_URL, (res) => resolve(res)).on("error", reject);
			});
			if (resp.statusCode !== 200) {
				file.destroy();
				throw new Error(`Fallo al descargar LanguageTool: ${resp.statusCode}`);
			}
			const total = Number(resp.headers["content-length"]) || 0;
			let received = 0;
			resp.on("data", (chunk: Buffer) => {
				file.write(chunk);
				received += chunk.length;
				if (total) onProgress?.(Math.round((received / total) * 100));
			});
			await new Promise<void>((resolve, reject) => {
				resp.on("end", () => file.end((err?: Error | null) => (err ? reject(err) : resolve())));
				resp.on("error", reject);
			});
			// copy not rename: /tmp may live on a different filesystem than the vault (EXDEV)
			fs.copyFileSync(tmp, zip);
			onProgress?.(100);
		} finally {
			// always remove the temp download, even on a mid-download failure
			fs.rmSync(tmp, { force: true });
		}
	}
}
