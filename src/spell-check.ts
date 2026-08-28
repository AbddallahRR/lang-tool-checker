import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { LTMatch, PluginSettings } from "./types";
import { LanguageToolClient } from "./lt-client";

export interface SpellCheckCallbacks {
	onCheck: (text: string) => Promise<LTMatch[]>;
	onClickMatch: (view: EditorView, match: LTMatch, coords: { x: number; y: number }) => void;
}

const spellMark = Decoration.mark({
	class: "lt-spell-error",
	attributes: { "data-lt": "word" },
});
const grammarMark = Decoration.mark({
	class: "lt-grammar-error",
	attributes: { "data-lt": "grammar" },
});
const styleMark = Decoration.mark({
	class: "lt-style-error",
	attributes: { "data-lt": "style" },
});

function markFor(match: LTMatch): Decoration {
	const issue = match.rule.issueType || "";
	if (issue === "misspelling") return spellMark;
	if (issue === "style") return styleMark;
	return grammarMark;
}

export function isExcluded(match: LTMatch, docText: string): boolean {
	const segment = docText.slice(match.offset, match.offset + match.length);
	return /^[\s\n]+$/.test(segment) || /[`|]/.test(segment) || segment.includes("://");
}

export function validRange(match: LTMatch, docText: string): { from: number; to: number } | null {
	const from = match.offset;
	const to = from + match.length;
	if (from < 0 || to > docText.length || from >= to) return null;
	return { from, to };
}

class SpellCheckPlugin {
	decorations: DecorationSet;
	private matches: LTMatch[] = [];
	private checking = false;
	private pending = false;
	private timer: number | null = null;
	private lastCheckedDoc = "";

	constructor(
		private view: EditorView,
		private settings: () => PluginSettings,
		private client: LanguageToolClient,
		private cb: SpellCheckCallbacks,
	) {
		this.decorations = Decoration.none;
		if (settings().autoCheck) this.schedule();
	}

	private schedule() {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => this.check(), this.settings().checkDelayMs);
	}

	private async check() {
		this.timer = null;
		if (this.checking) {
			this.pending = true;
			return;
		}
		const doc = this.view.state.doc.toString();
		if (doc === this.lastCheckedDoc) return;
		this.checking = true;
		try {
			this.matches = await this.cb.onCheck(doc);
			this.lastCheckedDoc = doc;
			this.decorations = this.buildDecorations(doc);
			this.view.dispatch({});
		} catch {
			this.decorations = Decoration.none;
			this.matches = [];
		} finally {
			this.checking = false;
			if (this.pending) {
				this.pending = false;
				this.schedule();
			}
		}
	}

	private buildDecorations(docText: string): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		for (const m of this.matches) {
			if (isExcluded(m, docText)) continue;
			const range = validRange(m, docText);
			if (!range) continue;
			builder.add(range.from, range.to, markFor(m));
		}
		return builder.finish();
	}

	onClick(view: EditorView, event: MouseEvent): boolean {
		const el = (event.target as HTMLElement).closest("[data-lt]") as HTMLElement | null;
		if (!el) return false;
		const doc = view.state.doc.toString();
		const from = Math.max(0, view.posAtDOM(el, 0));
		const to = Math.min(doc.length, view.posAtDOM(el, Math.max(1, el.childNodes.length)));
		const text = doc.slice(from, to);
		const match = this.findByText(doc, text);
		if (!match) return false;
		const rect = el.getBoundingClientRect();
		this.cb.onClickMatch(view, match, { x: rect.left, y: rect.bottom });
		return true;
	}

	private findByText(doc: string, text: string): LTMatch | null {
		for (const m of this.matches) {
			if (doc.slice(m.offset, m.offset + m.length) === text) return m;
		}
		return null;
	}

	update(update: ViewUpdate) {
		if (update.docChanged) {
			this.decorations = Decoration.none;
			this.matches = [];
			this.schedule();
		}
	}

	destroy() {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.client.cancel();
	}
}

export function spellCheckExtension(
	settings: () => PluginSettings,
	client: LanguageToolClient,
	cb: SpellCheckCallbacks,
): Extension {
	return ViewPlugin.fromClass(
		class extends SpellCheckPlugin {
			constructor(view: EditorView) {
				super(view, settings, client, cb);
			}
		},
		{
			decorations: (v) => (v as SpellCheckPlugin).decorations,
			eventHandlers: {
				click: function (this: SpellCheckPlugin, event, view) {
					return this.onClick(view, event as MouseEvent);
				},
			},
		},
	);
}
