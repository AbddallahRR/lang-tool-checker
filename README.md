# Lang Tool Checker

Plugin de Obsidian (solo escritorio) que corrige ortografía y gramática **100% local** usando [LanguageTool](https://languagetool.org/), con subrayado inline estilo Harper.

## Requisitos

- [Obsidian](https://obsidian.md) de escritorio
- [Java](https://java.com) 8 o superior (`java` en PATH)
- LanguageTool descargado (jar del servidor). Si aún no lo tienes:
  ```bash
  sudo wget https://languagetool.org/download/LanguageTool-stable.zip
  sudo unzip LanguageTool-stable.zip -d /opt/
  ```
  Esto deja el jar en `/opt/LanguageTool-stable/languagetool-server.jar`.

## Instalación del servidor

El plugin gestiona el servidor automáticamente: lo arranca al abrir Obsidian y lo apaga al cerrarlo. Solo necesitas indicarle la ruta al jar en los ajustes.

Si tu instalación quedó en otro lugar, configura la **"Ruta del JAR de LanguageTool"** en Ajustes → Lang Tool Checker.

## Desarrollar / construir el plugin

```bash
pnpm install
pnpm run build     # genera main.js
pnpm test          # self-check de la lógica de offsets/exclusiones
```

## Instalación manual del plugin

1. Crea la carpeta en tu vault: `TuVault/.obsidian/plugins/lang-tool-checker/`
2. Copia `main.js`, `styles.css` y `manifest.json` ahí.
3. En Obsidian: Ajustes → Plugins de la comunidad → recarga y activa **Lang Tool Checker**.

## Uso

- Escribe y los errores se subrayan en línea (rojo = ortografía/gramática, amarillo = estilo).
- Haz clic en una palabra subrayada para ver las sugerencias corregidas, ignorar o añadir al diccionario.
- Haz clic en la sección "LT: listo" de la barra de estado (abajo a la derecha) para abrir el panel de revisión: corrige cada error individualmente o aplica todas las sugerencias a la vez.
- Las palabras/errores en bloques de código, wikilinks (`[[…]]`) y URLs no se marcan.
- Al aplicar una corrección del plugin, solo se re-revisa la oración afectada (no todo el documento).
- Al abrir o renombrar un archivo, se revisa la ortografía de su nombre y avisa si tiene errores.

## Ajustes

- **Autocheck**: revisar automáticamente mientras escribes.
- **Revisar nombres de archivo**: revisar la ortografía del nombre del archivo al abrirlo o renombrarlo.
- **Idioma**: código de LanguageTool (ej. `es`, `en-US`, `fr`, `de`). Por defecto `es`.
- **Puerto del servidor**: puerto local del servidor LT (por defecto `8081`).
- **Ruta del JAR**: ruta a `languagetool-server.jar`.
- **Diccionario personal**: palabras que no se marcan como error.
- **Reglas/categorías deshabilitadas**: IDs de reglas a apagar.
- **Modo picky**: más sugerencias de estilo.
- **Heap máximo de la JVM**: tope de RAM del servidor Java (ej. `512m`, `1g`). Vacío = sin límite.
- **Apagar servidor por inactividad (min)**: si pasan estos minutos sin revisar, el servidor se apaga para ahorrar RAM y se relanza al escribir (varios segundos de lag). `0` = desactivado.
