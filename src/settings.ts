import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type LangToolPlugin from "./main";
import { DEFAULT_SETTINGS } from "./types";

export class LangToolSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: LangToolPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Lang Tool Checker" });

		new Setting(containerEl)
			.setName("Autocheck")
			.setDesc("Revisar ortografía y gramática automáticamente mientras escribes.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoCheck).onChange(async (v) => {
					this.plugin.settings.autoCheck = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Revisar nombres de archivo")
			.setDesc("Revisar la ortografía del nombre del archivo (título) al abrirlo o renombrarlo.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.checkFileNames).onChange(async (v) => {
					this.plugin.settings.checkFileNames = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Idioma")
			.setDesc("Código de idioma para LanguageTool (ej: es, en-US, fr, de).")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.language)
					.setPlaceholder("es")
					.onChange(async (v) => {
						this.plugin.settings.language = v || "es";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Ruta del JAR de LanguageTool")
			.setDesc("Ruta absoluta a languagetool-server.jar.")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.serverJarPath)
					.setPlaceholder(DEFAULT_SETTINGS.serverJarPath)
					.onChange(async (v) => {
						this.plugin.settings.serverJarPath = v || DEFAULT_SETTINGS.serverJarPath;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Puerto del servidor")
			.setDesc("Puerto local para el servidor de LanguageTool.")
			.addText((t) =>
				t
					.setValue(String(this.plugin.settings.port))
					.onChange(async (v) => {
						const p = parseInt(v, 10);
						if (!isNaN(p)) {
							this.plugin.settings.port = p;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Delay de autocheck (ms)")
			.setDesc("Espera tras la última tecla antes de revisar.")
			.addText((t) =>
				t
					.setValue(String(this.plugin.settings.checkDelayMs))
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.checkDelayMs = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Heap máximo de la JVM (ej. 512m, 1g)")
			.setDesc("Tope de memoria del servidor Java. Vacío = sin límite.")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.maxHeap)
					.setPlaceholder(DEFAULT_SETTINGS.maxHeap)
					.onChange(async (v) => {
						this.plugin.settings.maxHeap = v.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Apagar servidor por inactividad (min)")
			.setDesc("0 = desactivado. Si no escribes este tiempo, el servidor se apaga; el siguiente cambio lo relanza (varios segundos de lag).")
			.addText((t) =>
				t
					.setValue(String(this.plugin.settings.idleStopMinutes))
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						if (!isNaN(n) && n >= 0) {
							this.plugin.settings.idleStopMinutes = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Modo picky")
			.setDesc("Generar más sugerencias de estilo.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.picky).onChange(async (v) => {
					this.plugin.settings.picky = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Diccionario personal")
			.setDesc("Palabras que no se marcarán como error (una por línea).")
			.addTextArea((t) =>
				t
					.setValue(this.plugin.settings.personalDictionary.join("\n"))
					.onChange(async (v) => {
						this.plugin.settings.personalDictionary = v
							.split("\n")
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Reglas deshabilitadas")
			.setDesc("IDs de reglas a deshabilitar, separadas por comas.")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.disabledRules.join(","))
					.onChange(async (v) => {
						this.plugin.settings.disabledRules = v.split(",").map((s) => s.trim()).filter(Boolean);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).addButton((b) =>
			b.setButtonText("Guardar y reiniciar servidor").onClick(async () => {
				await this.plugin.restartServer();
				new Notice("Servidor de LanguageTool reiniciado");
			}),
		);
	}
}
