import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import { LanguageToolClient } from "./lt-client";
import { PluginSettings } from "./types";

export type ServerStatus = "idle" | "starting" | "running" | "stopped" | "error";

export class ServerManager {
	private proc: ChildProcess | null = null;
	private status: ServerStatus = "idle";
	private onStatusChange: (s: ServerStatus) => void = () => {};
	private idleTimer: NodeJS.Timeout | null = null;

	constructor(private settings: () => PluginSettings, private client: LanguageToolClient) {}

	get serverStatus(): ServerStatus {
		return this.status;
	}

	onStatus(cb: (s: ServerStatus) => void): void {
		this.onStatusChange = cb;
	}

	pingActive(): void {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = null;
		const mins = this.settings().idleStopMinutes;
		if (mins > 0 && this.status === "running") {
			this.idleTimer = setTimeout(() => this.stop(), mins * 60000);
		}
	}

	private setStatus(s: ServerStatus): void {
		this.status = s;
		if (s !== "running" && this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		this.onStatusChange(s);
	}

	private javaBinary(): string {
		const platform = process.platform;
		const exe = platform === "win32" ? "java.exe" : "java";
		const candidates: string[] = [];

		if (process.platform !== "win32") {
			if (process.env.JAVA_HOME) {
				candidates.push(`${process.env.JAVA_HOME}/bin/${exe}`);
			}
			candidates.push(`/usr/bin/${exe}`, `/usr/local/bin/${exe}`, `/opt/java/bin/${exe}`);
		}
		for (const p of candidates) {
			if (fs.existsSync(p)) return p;
		}
		return exe;
	}

	async start(): Promise<void> {
		if (this.proc) return;
		const settings = this.settings();

		if (!fs.existsSync(settings.serverJarPath)) {
			this.setStatus("error");
			throw new Error(`No se encontró el JAR de LanguageTool en: ${settings.serverJarPath}`);
		}

		// if a working LanguageTool server is already answering on this port (e.g. a
		// leftover from a previous load), just adopt it instead of spawning a duplicate
		if (await this.client.isServerUp()) {
			this.setStatus("running");
			console.info(`[LangTool] usando servidor ya activo en el puerto ${settings.port}`);
			return;
		}

		this.setStatus("starting");

		const java = this.javaBinary();
		const args = [
			...(settings.maxHeap ? ["-Xmx" + settings.maxHeap] : []),
			"-jar",
			settings.serverJarPath,
			"--port",
			String(settings.port),
			"--allow-origin",
			"*",
		];
		console.info(`[LangTool] lanzando servidor: ${java} ${args.join(" ")}`);

		// retry a few times to ride out reload races (port briefly held by the old server)
		let lastError = "";
		for (let attempt = 1; attempt <= 3; attempt++) {
			// ensure the port is free before each spawn (an old server may still be
			// releasing it after a reload)
			await this.waitPortFree(8000);
			const result = await this.spawnAndWait(java, args, settings.port);
			if (result === "ok") {
				this.setStatus("running");
				return;
			}
			lastError = result;
			const detail = lastError.trim().split("\n").pop() || "";
			console.info(`[LangTool] intento ${attempt}/3 sin éxito${detail ? `: ${detail}` : ""}`);
			await new Promise((r) => setTimeout(r, 2000));
		}

		this.setStatus("error");
		throw new Error(
			`LanguageTool no respondió en el puerto ${settings.port} (java: ${java}).${lastError ? ` ${lastError.trim().split("\n").pop()}` : " ¿Está instalado Java?"}`,
		);
	}

	private spawnAndWait(java: string, args: string[], port: number): Promise<"ok" | string> {
		return new Promise((resolve) => {
			let stderr = "";
			const proc = spawn(java, args, {
				stdio: ["ignore", "ignore", "pipe"],
				detached: false,
			});
			this.proc = proc;

			proc.stderr?.on("data", (d) => {
				stderr += String(d);
				const line = String(d).trim();
				if (line && !line.includes("BindException") && !line.includes("PortBindingException")) {
					console.info(`[LangTool] ${line}`);
				}
			});

			let settled = false;
			const finish = (result: "ok" | string) => {
				if (settled) return;
				settled = true;
				resolve(result);
			};

			proc.once("error", (err) => {
				console.error(`[LangTool] error al lanzar java: ${err.message}`);
				finish(err.message);
			});
			proc.once("exit", () => {
				// server died before becoming ready
				finish(stderr || "el proceso java terminó");
			});

			const timeout = setTimeout(() => {
				finish("temporizador agotado");
				proc.kill();
			}, 60000);

			const tick = async () => {
				if (settled) return;
				if (await this.client.isServerUp()) {
					clearTimeout(timeout);
					finish("ok");
					return;
				}
				if (proc.exitCode !== null) {
					clearTimeout(timeout);
					finish(stderr);
					return;
				}
				setTimeout(tick, 1000);
			};
			tick();
		});
	}

	private waitPortFree(timeoutMs: number): Promise<void> {
		const start = Date.now();
		return new Promise((resolve) => {
			const tick = async () => {
				if (!(await this.client.isServerUp())) {
					resolve();
					return;
				}
				if (Date.now() - start > timeoutMs) {
					resolve();
					return;
				}
				setTimeout(tick, 500);
			};
			tick();
		});
	}

	stop(): Promise<void> {
		const proc = this.proc;
		this.proc = null;
		if (proc && proc.exitCode === null) {
			proc.kill();
			return new Promise<void>((resolve) => {
				proc.once("exit", () => {
					this.setStatus("stopped");
					resolve();
				});
				setTimeout(() => {
					this.setStatus("stopped");
					resolve();
				}, 5000);
			});
		}
		this.setStatus("stopped");
		return Promise.resolve();
	}
}
