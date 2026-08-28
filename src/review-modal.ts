import { App, Modal, Notice } from "obsidian";
import { LTMatch } from "./types";

export interface ReviewActions {
	applySuggestion: (match: LTMatch, suggestion: string) => void;
	applyAll: () => boolean;
	ignoreRule: (match: LTMatch) => void;
	getMatches: () => LTMatch[];
}

export class ReviewModal extends Modal {
	private list: HTMLElement | null = null;

	constructor(
		app: App,
		private matches: LTMatch[],
		private ignoredRules: Set<string>,
		private actions: ReviewActions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("lt-review");

		this.titleEl.setText("Corrección de idioma");

		const header = contentEl.createDiv({ cls: "lt-review__header" });
		header.createEl("span", { text: `${this.matches.length} sugerencias` });
		const applyAll = header.createEl("button", {
			cls: "mod-cta",
			text: "Aplicar todas",
		});
		applyAll.addEventListener("click", () => {
			if (this.actions.applyAll()) {
				this.close();
			} else {
				new Notice("No hay sugerencias para aplicar");
			}
		});

		this.list = contentEl.createDiv({ cls: "lt-review__rows" });
		this.renderList();
	}

	private rerender(): void {
		this.matches = this.actions.getMatches();
		if (!this.list) return;
		this.list.empty();
		this.renderList();
	}

	private renderList(): void {
		const list = this.list;
		if (!list) return;
		let shown = 0;
		for (const match of this.matches) {
			if (this.ignoredRules.has(match.rule.id)) continue;
			shown++;
			const row = list.createDiv({ cls: "lt-review__row" });

			const ctx = match.context;
			if (ctx && ctx.text) {
				const ctxLine = row.createDiv({ cls: "lt-review__context" });
				ctxLine.createSpan({ text: ctx.text.slice(0, ctx.offset) });
				ctxLine.createSpan({
					cls: "lt-review__context-word",
					text: ctx.text.slice(ctx.offset, ctx.offset + ctx.length),
				});
				ctxLine.createSpan({ text: ctx.text.slice(ctx.offset + ctx.length) });
			}

			row.createDiv({
				cls: "lt-review__word",
				text: match.message || match.rule.description || "Error",
			});

			const suggs = row.createDiv({ cls: "lt-review__suggs" });
			if (match.replacements.length === 0) {
				suggs.createSpan({ cls: "lt-review__none", text: "Sin sugerencias" });
			} else {
				for (const rep of match.replacements.slice(0, 5)) {
					suggs.createEl("button", {
						cls: "lt-review__sugg",
						text: rep.value,
					}).addEventListener("click", () => {
						this.actions.applySuggestion(match, rep.value);
						this.rerender();
					});
				}
			}

			const rowActs = row.createDiv({ cls: "lt-review__row-acts" });
			rowActs.createEl("button", {
				cls: "lt-review__ignore",
				text: "Ignorar",
			}).addEventListener("click", () => {
				this.actions.ignoreRule(match);
				this.rerender();
			});
		}
		if (shown === 0) {
			list.createDiv({ text: "Todos los errores han sido ignorados o corregidos." });
		}
	}

	onClose(): void {
		this.contentEl.empty();
		this.list = null;
	}
}
