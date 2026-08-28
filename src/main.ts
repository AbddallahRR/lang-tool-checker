import { MarkdownView, Notice, Plugin, Editor } from "obsidian";
import { Extension } from "@codemirror/state";
import { LanguageToolClient } from "./lt-client";
import { ServerManager, ServerStatus } from "./server-manager";
import { spellCheckExtension } from "./spell-check";
import { SuggestionPopover } from "./suggestion-popover";
import { LangToolSettingTab } from "./settings";
import { DEFAULT_SETTINGS, LTMatch, PluginSettings } from "./types";

export default class LangToolPlugin extends Plugin {
	settings: PluginSettings;
	private client: LanguageToolClient;
	private server: ServerManager;
	private popover: SuggestionPopover;
	private statusBar: HTMLElement;
	private ignoredRules = new Set<string>();

	async onload() {
		await this.loadSettings();
		this.client = new LanguageToolClient(() => this.settings);
		this.server = new ServerManager(() => this.settings, this.client);
		this.popover = new SuggestionPopover(() => this.settings, {
			applySuggestion: (m, s) => this.applySuggestion(m, s),
			ignoreRule: (m) => this.ignoreRule(m),
			addToDictionary: (m) => this.addToDictionary(m),
		});

		this.statusBar = this.addStatusBarItem();
		this.statusBar.setText("LT: iniciando…");
		this.server.onStatus((s) => this.onServerStatus(s));

		this.addSettingTab(new LangToolSettingTab(this.app, this));

		this.registerEditorExtension(this.createExtension());

		this.addCommand({
			id: "check-document",
			name: "Revisar corrección del documento",
			editorCallback: (editor) => this.manualCheck(editor),
		});

		this.app.workspace.onLayoutReady(() => this.startServer());
	}

	private async startServer(): Promise<void> {
		try {
			await this.server.start();
		} catch (e) {
			this.statusBar.setText("LT: error");
			new Notice(`LanguageTool: ${(e as Error).message}`);
		}
	}

	onunload() {
		this.server.stop();
		this.popover.hide();
	}

	private createExtension(): Extension {
		return spellCheckExtension(
			() => this.settings,
			this.client,
			{
				onCheck: async (text: string): Promise<LTMatch[]> => {
					await this.server.waitReady();
					const result = await this.client.checkText(text);
					this.server.pingActive();
					return this.filterMatches(result.matches);
				},
				onClickMatch: (view, match, coords) => {
					this.popover.show(view, match, coords.x, coords.y);
				},
			},
		);
	}

	private filterMatches(matches: LTMatch[]): LTMatch[] {
		const dict = new Set(this.settings.personalDictionary.map((w) => w.toLowerCase()));
		return matches.filter((m) => {
			if (this.ignoredRules.has(m.rule.id)) return false;
			if (this.settings.disabledRules.includes(m.rule.id)) return false;
			if (this.settings.disabledCategories.includes(m.rule.category.id)) return false;
			const word = this.contextWord(m);
			if (word && dict.has(word.toLowerCase())) return false;
			return true;
		});
	}

	private contextWord(match: LTMatch): string {
		if (match.rule.issueType === "misspelling") {
			return match.context.text.slice(match.context.offset, match.context.offset + match.context.length);
		}
		return "";
	}

	private onServerStatus(s: ServerStatus): void {
		switch (s) {
			case "starting":
				this.statusBar.setText("LT: iniciando…");
				break;
			case "running":
				this.statusBar.setText("LT: listo");
				this.server.pingActive();
				break;
			case "stopped":
				this.statusBar.setText("LT: detenido");
				break;
			case "error":
				this.statusBar.setText("LT: error");
				break;
			default:
				break;
		}
	}

	private applySuggestion(match: LTMatch, suggestion: string): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const editor = view.editor;
		const pos = editor.offsetToPos(match.offset);
		const endPos = editor.offsetToPos(match.offset + match.length);
		editor.replaceRange(suggestion, pos, endPos);
	}

	private ignoreRule(match: LTMatch): void {
		this.ignoredRules.add(match.rule.id);
	}

	private addToDictionary(match: LTMatch): void {
		const word = this.contextWord(match);
		if (!word) return;
		if (!this.settings.personalDictionary.includes(word)) {
			this.settings.personalDictionary.push(word);
			this.saveSettings();
		}
	}

	private async manualCheck(editor: Editor): Promise<void> {
		const text = editor.getValue();
		try {
			await this.server.waitReady();
			const result = await this.client.checkText(text);
			const matches = this.filterMatches(result.matches);
			new Notice(`LanguageTool: ${matches.length} sugerencias`);
		} catch (e) {
			new Notice(`LanguageTool: error al revisar: ${(e as Error).message}`);
		}
	}

	async restartServer(): Promise<void> {
		await this.server.stop();
		try {
			await this.server.start();
		} catch (e) {
			new Notice(`LanguageTool: ${(e as Error).message}`);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
