import { EditorView } from "@codemirror/view";
import { LTMatch, PluginSettings } from "./types";

export interface PopoverActions {
	applySuggestion: (match: LTMatch, suggestion: string) => void;
	ignoreRule: (match: LTMatch) => void;
	addToDictionary: (match: LTMatch) => void;
}

export class SuggestionPopover {
	private el: HTMLElement | null = null;
	private view: EditorView | null = null;
	private match: LTMatch | null = null;
	private closeHandler = (ev: MouseEvent) => this.onOutsideClick(ev);
	private escHandler = (ev: KeyboardEvent) => {
		if (ev.key === "Escape") this.hide();
	};

	constructor(private settings: () => PluginSettings, private actions: PopoverActions) {}

	show(view: EditorView, match: LTMatch, x: number, y: number): void {
		this.hide();
		this.view = view;
		this.match = match;

		const el = document.createElement("div");
		el.className = "lt-popover";
		el.style.left = `${x}px`;
		el.style.top = `${y + 4}px`;

		const message = document.createElement("div");
		message.className = "lt-popover__message";
		message.textContent = match.message || match.rule.description || "Error";
		el.appendChild(message);

		if (match.replacements.length > 0) {
			const list = document.createElement("div");
			list.className = "lt-popover__suggestions";
			for (const rep of match.replacements.slice(0, 8)) {
				const btn = document.createElement("button");
				btn.className = "lt-popover__suggestion";
				btn.textContent = rep.value;
				btn.addEventListener("click", () => this.apply(rep.value));
				list.appendChild(btn);
			}
			el.appendChild(list);
		}

		const actions = document.createElement("div");
		actions.className = "lt-popover__actions";
		const ignore = document.createElement("button");
		ignore.className = "lt-popover__action";
		ignore.textContent = "Ignorar";
		ignore.addEventListener("click", () => {
			this.actions.ignoreRule(match);
			this.hide();
		});
		actions.appendChild(ignore);

		const addDict = document.createElement("button");
		addDict.className = "lt-popover__action";
		addDict.textContent = "Añadir al diccionario";
		addDict.addEventListener("click", () => {
			this.actions.addToDictionary(match);
			this.hide();
		});
		actions.appendChild(addDict);
		el.appendChild(actions);

		document.body.appendChild(el);
		this.el = el;
		setTimeout(() => window.addEventListener("mousedown", this.closeHandler), 0);
		window.addEventListener("keydown", this.escHandler);
		this.clampToViewport(el);
	}

	private clampToViewport(el: HTMLElement): void {
		const w = el.offsetWidth;
		const h = el.offsetHeight;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const left = parseFloat(el.style.left);
		const top = parseFloat(el.style.top);
		if (left + w > vw) el.style.left = `${vw - w - 8}px`;
		if (top + h > vh) el.style.top = `${vh - h - 8}px`;
	}

	private apply(suggestion: string): void {
		if (this.view && this.match) {
			this.actions.applySuggestion(this.match, suggestion);
		}
		this.hide();
	}

	private onOutsideClick(ev: MouseEvent): void {
		if (this.el && !this.el.contains(ev.target as Node)) this.hide();
	}

	hide(): void {
		if (this.el) {
			this.el.remove();
			this.el = null;
		}
		window.removeEventListener("mousedown", this.closeHandler);
		window.removeEventListener("keydown", this.escHandler);
	}
}
