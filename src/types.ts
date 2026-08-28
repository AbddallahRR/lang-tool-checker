export interface LTReplacement {
	value: string;
	shortDescription?: string;
}

export interface LTContext {
	text: string;
	offset: number;
	length: number;
}

export interface LTRule {
	id: string;
	description: string;
	issueType: string;
	category: {
		id: string;
		name: string;
	};
}

export interface LTMatch {
	message: string;
	shortMessage?: string;
	offset: number;
	length: number;
	context: LTContext;
	replacements: LTReplacement[];
	rule: LTRule;
	ignoreForIncompleteSentence: boolean;
}

export interface LTCheckResult {
	software: { name: string; version: string };
	language: { name: string; code: string };
	matches: LTMatch[];
}

export interface PluginSettings {
	language: string;
	port: number;
	serverJarPath: string;
	autoCheck: boolean;
	checkFileNames: boolean;
	checkDelayMs: number;
	personalDictionary: string[];
	disabledRules: string[];
	disabledCategories: string[];
	picky: boolean;
	debug: boolean;
	maxHeap: string;
	idleStopMinutes: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	language: "es",
	port: 8081,
	serverJarPath: "/opt/languagetool/languagetool-server.jar",
	autoCheck: true,
	checkFileNames: true,
	checkDelayMs: 500,
	personalDictionary: [],
	disabledRules: [],
	disabledCategories: [],
	picky: false,
	debug: false,
	maxHeap: "512m",
	idleStopMinutes: 0,
};
