import { LTCheckResult, PluginSettings } from "./types";

export class LanguageToolClient {
	private abortController: AbortController | null = null;

	constructor(private settings: () => PluginSettings) {}

	get baseUrl(): string {
		return `http://127.0.0.1:${this.settings().port}/v2`;
	}

	async checkText(text: string): Promise<LTCheckResult> {
		const settings = this.settings();

		const body = new URLSearchParams();
		body.append("language", settings.language);
		body.append("text", text);
		if (settings.picky) body.append("level", "picky");
		if (settings.disabledRules.length) {
			body.append("disabledRules", settings.disabledRules.join(","));
		}
		if (settings.disabledCategories.length) {
			body.append("disabledCategories", settings.disabledCategories.join(","));
		}

		const controller = new AbortController();
		this.abortController?.abort();
		this.abortController = controller;
		const timer = setTimeout(() => controller.abort(), 15000);

		try {
			const resp = await fetch(`${this.baseUrl}/check`, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: body.toString(),
				signal: controller.signal,
			});
			if (!resp.ok) {
				throw new Error(`LanguageTool server responded with ${resp.status}`);
			}
			return (await resp.json()) as LTCheckResult;
		} finally {
			clearTimeout(timer);
			this.abortController = null;
		}
	}

	cancel(): void {
		this.abortController?.abort();
		this.abortController = null;
	}

	async isServerUp(): Promise<boolean> {
		try {
			const resp = await fetch(`${this.baseUrl}/languages`, {
				signal: AbortSignal.timeout(2000),
			});
			return resp.ok;
		} catch {
			return false;
		}
	}
}
