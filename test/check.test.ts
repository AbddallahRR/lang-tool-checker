import { isExcluded, validRange, sentenceRange } from "../src/spell-check";
import { ChangeSet } from "@codemirror/state";
import { LTMatch } from "../src/types";

function match(offset: number, length: number, issueType = "misspelling"): LTMatch {
	return {
		message: "",
		offset,
		length,
		context: { text: "", offset, length },
		replacements: [],
		rule: { id: "", description: "", issueType, category: { id: "", name: "" } },
		ignoreForIncompleteSentence: false,
	};
}

let failures = 0;

function assert(name: string, cond: boolean) {
	if (!cond) {
		failures++;
		console.error(`FAIL: ${name}`);
	} else {
		console.log(`ok: ${name}`);
	}
}

// Accented char before the error must still map to char offset 8 (LT returns char offsets, not bytes)
const doc = "Árbol y pruaba.";
const r = validRange(match(8, 6, "misspelling"), doc);
assert("char-offset maps correctly (Á is 2 bytes but offset 8 is char index)", r !== null && r.from === 8 && r.to === 14);
assert("slice equals 'pruaba'", doc.slice(r!.from, r!.to) === "pruaba");

// Out of range should be rejected
assert("negative offset rejected", validRange(match(-1, 5), doc) === null);
assert("overflowing range rejected", validRange(match(18, 10), doc) === null);
assert("zero-length rejected", validRange(match(0, 0), doc) === null);

// Exclusions: code fences and URLs
assert("backtick excluded", isExcluded(match(0, 3), "`hi` rest"));
assert("url excluded", isExcluded(match(0, 21), "https://example.com foo"));
assert("whitespace-only excluded", isExcluded(match(0, 3), "   foo"));
assert("normal word not excluded", !isExcluded(match(0, 6), "pruaba x"));

// Exclusions: wikilinks and code fences
assert("wikilink excluded", isExcluded(match(2, 6), "[[pruaba]] x"));
assert("outside wikilink not excluded", !isExcluded(match(9, 6), "[[ok]] pruaba"));
const fenced = "```js\npruaba\n```";
assert("code fence excluded", isExcluded(match(7, 6), fenced));
const openFence = "```js\npruaba";
assert("unterminated code fence excluded", isExcluded(match(7, 6), openFence));
assert("outside code fence not excluded", !isExcluded(match(0, 6), "pruaba\n```js\nx\n```"));

// Sentence range
assert("sentence start after previous terminator", sentenceRange("Uno. Dos tres.", 6).from === 4);
assert("sentence end at next terminator", sentenceRange("Uno. Dos tres.", 6).to === 14);
assert("unterminated sentence goes to end", sentenceRange("abc def ghi", 4).to === 11);
assert("newline acts as boundary", sentenceRange("primera\nsegunda linea", 9).from === 8);
const shifted = ChangeSet.of({ from: 4, to: 4, insert: "X" }, "abcd");
assert("change maps positions after insert", shifted.mapPos(4, 1) === 5);

if (failures > 0) {
	console.error(`\n${failures} check(s) failed`);
	process.exit(1);
}
console.log("\nAll checks passed");
