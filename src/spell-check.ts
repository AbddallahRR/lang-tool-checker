import { ChangeSet, RangeSetBuilder } from "@codemirror/state";
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

function inWikilink(text: string, pos: number): boolean {
	const open = text.lastIndexOf("[[", pos);
	if (open === -1) return false;
	const close = text.indexOf("]]", open + 2);
	return close === -1 || close >= pos;
}

// ponytail: linear scan per match; precompute fences per doc if docs get huge
function insideCodeFence(text: string, pos: number): boolean {
	let inFence = false;
	let lineStart = 0;
	while (lineStart < text.length && lineStart <= pos) {
		const lineEnd = text.indexOf("\n", lineStart);
		const end = lineEnd === -1 ? text.length : lineEnd;
		if (pos <= end) return inFence;
		if (/^\s*```/.test(text.slice(lineStart, end))) inFence = !inFence;
		lineStart = end + 1;
	}
	return inFence;
}

export function isExcluded(match: LTMatch, docText: string): boolean {
	const pos = match.offset;
	const segment = docText.slice(match.offset, match.offset + match.length);
	return (
		/^[\s\n]+$/.test(segment) ||
		/[`|]/.test(segment) ||
		segment.includes("://") ||
		inWikilink(docText, pos) ||
		insideCodeFence(docText, pos)
	);
}

export function validRange(match: LTMatch, docText: string): { from: number; to: number } | null {
	const from = match.offset;
	const to = from + match.length;
	if (from < 0 || to > docText.length || from >= to) return null;
	return { from, to };
}

// ponytail: newline/.?! boundaries; multi-line sentences or paragraphs degrade to the current line
export function sentenceRange(doc: string, pos: number): { from: number; to: number } {
	const from =
		Math.max(doc.lastIndexOf(".", pos - 1), doc.lastIndexOf("!", pos - 1), doc.lastIndexOf("?", pos - 1), doc.lastIndexOf("\n", pos - 1)) + 1;
	const ends = [doc.indexOf(".", pos), doc.indexOf("!", pos), doc.indexOf("?", pos), doc.indexOf("\n", pos)].filter((i) => i !== -1);
	const to = ends.length ? Math.min(...ends) + 1 : doc.length;
	return { from, to };
}

const live: SpellCheckPlugin[] = [];

export function getSpellCheckPlugin(): SpellCheckPlugin | undefined {
	return live[live.length - 1];
}

class SpellCheckPlugin {
	decorations: DecorationSet;
	skipNextAuto = false;
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
		live.push(this);
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
		const sorted = [...this.matches].sort((a, b) => a.offset - b.offset);
		for (const m of sorted) {
			if (isExcluded(m, docText)) continue;
			const range = validRange(m, docText);
			if (!range) continue;
			builder.add(range.from, range.to, markFor(m));
		}
		return builder.finish();
	}

	private shiftAfterEdit(changes: ChangeSet): void {
		const touched: [number, number][] = [];
		changes.iterChanges((fromA, toA) => touched.push([fromA, toA]));
		const kept: LTMatch[] = [];
		for (const m of this.matches) {
			if (touched.some(([f, t]) => m.offset < t && m.offset + m.length > f)) continue;
			const from = changes.mapPos(m.offset, 1);
			const to = changes.mapPos(m.offset + m.length, -1);
			if (from < 0 || to > this.view.state.doc.length || from >= to) continue;
			kept.push({ ...m, offset: from, length: to - from });
		}
		this.matches = kept;
	}

	async checkSentence(docFrom: number): Promise<void> {
		if (this.checking) return;
		const doc = this.view.state.doc.toString();
		const { from, to } = sentenceRange(doc, Math.max(0, Math.min(docFrom, doc.length)));
		if (to - from <= 0) return;
		this.checking = true;
		try {
			const sent = doc.slice(from, to);
			const raw = await this.cb.onCheck(sent);
			this.matches = this.matches
				.filter((m) => m.offset < from || m.offset + m.length > to)
				.concat(raw.map((m) => ({ ...m, offset: m.offset + from })));
			this.lastCheckedDoc = doc;
			this.decorations = this.buildDecorations(doc);
			this.view.dispatch({});
		} catch {
			this.decorations = this.buildDecorations(doc);
		} finally {
			this.checking = false;
		}
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
		if (!update.docChanged) return;
		if (this.skipNextAuto) {
			this.skipNextAuto = false;
			this.shiftAfterEdit(update.changes);
			this.decorations = Decoration.none;
		} else {
			this.decorations = Decoration.none;
			this.matches = [];
			this.schedule();
		}
	}

	destroy() {
		const i = live.indexOf(this);
		if (i !== -1) live.splice(i, 1);
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
