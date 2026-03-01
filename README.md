# Human Typing Composer (Chrome Extension)

English + 中文双语说明

## Features
- One-by-one character typing simulation for focused editable elements.
- Smart target fallback: if no focused editable field, extension auto-selects the best visible editable area.
- Text/Markdown input area with automatic markdown-friendly font mode.
- Optional directive mode: turn syntax directives on/off.
- Typing speed control by range (`seconds per 100 chars`) with optional randomization.
- Typo simulation (nearby keyboard character, then delete and correct) by count/range per 100 chars.
- Random whitespace noise (spaces / blank lines) by count/range per 100 chars, optional keep-or-delete.
- Human pause behavior:
  - pause min/max range (engine uses average with slight jitter),
  - pause event count per 100 chars.
- Emergency stop and emergency clear shortcuts (customizable in popup, detected in-page).
- Custom writing syntax directives:
  - `[[rev:draft=>final]]`
  - `[[del:text]]`
  - `[[pause:1200]]`
  - `[[pause:500-1600]]`
  - `[[choice:a||b||c]]`
  - `[[chance:35|text]]`
  - `[[repeat:2|text]]`
  - `[[speed:20-45]] ... [[speed:default]]`
  - `[[typo:on/off/default/2-5]]`
  - `[[ws:on/off/default/1-3/keep/drop]]`
  - `[[fix:off/immediate/delayed/random/default]]`
  - `[[fixdelay:300-1800]]`
  - `[[back:12]]`
  - `[[raw:literal [[text]]]]`
  - `[[note:comment]]`
  - nested directives and escape support (`\[[`, `\]]`, `\|`)
- When syntax directives are used, built-in random typo/whitespace/pause noise is auto-disabled to avoid conflicts.
- OpenAI-compatible rewrite:
  - custom API base URL,
  - API key,
  - model name,
  - target count for deleted-sentence events.
- Popup supports English and Chinese.
- Light / dark UI theme switch.
- Target lock preview before typing: highlight target first, confirm, then start.
- Pin mode: keep a floating control panel on-page (Start/Stop/Cancel + progress).
- When pin mode is on, the separate mini progress widget is hidden.
- Separate Settings page (`Options`) for language, shortcuts, behavior, and AI config.
- In-page mini progress widget after start (progress + ETA + Stop + Cancel).
- Popup progress bar with estimated finish time.

## Install
1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder:
   - `/Users/yuanch/Documents/New project`

## How To Use
1. Open popup and paste text in input area.
2. Use top-right gear icon to open Settings page for advanced config.
3. (Optional) Use AI rewrite first.
4. Click `Start Typing` once to preview-lock target (highlight appears on page).
5. Confirm start in popup (`Confirm Start`) or click Start again.
6. Popup auto-closes after start so focus returns to the document.
7. Optional: use `📌` pin button to open a persistent floating control panel in page.
8. Watch progress/ETA in popup or floating panel.
9. Use `Stop` or `Cancel & Clear` when needed.

## Directive Grammar
- `[[rev:draft=>final]]`
  - Types `draft`, pauses briefly, deletes it, then types `final`.
- `[[del:text]]`
  - Types text and then deletes it.
- `[[pause:1200]]`
  - Adds an explicit pause of 1200ms.
- `[[pause:500-1600]]`
  - Pauses randomly in the given range (ms).
- `[[choice:option A||option B||option C]]`
  - Randomly chooses one variant and types it.
- `[[chance:35|this part may appear]]`
  - Types the text with 35% probability.
- `[[repeat:3|echo. ]]`
  - Repeats the payload text 3 times.
- `[[speed:20-45]] ... [[speed:default]]`
  - Temporarily changes typing speed (seconds per 100 chars), then restores default.
- `[[typo:off]]`, `[[typo:on]]`, `[[typo:default]]`, `[[typo:2-5]]`
  - Dynamically controls typo behavior.
- `[[ws:on]]`, `[[ws:off]]`, `[[ws:default]]`, `[[ws:1-3]]`, `[[ws:keep]]`, `[[ws:drop]]`
  - Dynamically controls random whitespace behavior and keep/drop policy.
- `[[fix:off|immediate|delayed|random|default]]`
  - Controls typo/whitespace auto-correction mode inline.
- `[[fixdelay:300-1800]]`
  - Sets correction delay range (ms) inline.
- `[[back:12]]`
  - Deletes previous 12 characters.
- `[[raw:literal [[text]]]]`
  - Outputs payload literally.
- `[[note:any text]]`
  - No-op marker for annotations.
- `choice/chance/repeat` support nested directives.
- Escapes:
  - `\[[` => literal `[[`
  - `\]]` => literal `]]`
  - `\|` => literal `|`
- Numeric ranges accept `-`, `–`, `—`, `~`, and `to`.

Example:
```text
We should [[rev:ship this tonight=>ship this tomorrow]] after review.
[[del:Ignore this sentence.]]
[[pause:900]]Then continue writing.
[[choice:This version sounds calm.||This version sounds bold.]]
[[chance:40|Maybe we add this optional sentence.]]
[[repeat:2|Echo line. ]]
[[speed:18-30]]Fast segment here.[[speed:default]]
[[typo:off]]No typo zone.[[typo:default]]
[[ws:on]][[ws:2-4]][[ws:keep]]
```

## Notes
- This extension types into the currently focused editable element (`input`, `textarea`, `contenteditable`).
- If nothing is focused, it tries to pick a visible editable target automatically.
- In Google Docs, the extension restricts target selection to document editor area and excludes title input.
- Chrome internal pages like `chrome://...` cannot receive content scripts.
- Extension cannot uninstall itself by shortcut due Chrome security model.
- Background command shortcuts also exist and can be changed in `chrome://extensions/shortcuts`.
- Manifest default shortcuts:
  - Stop: `Ctrl+Shift+X` / `Command+Shift+X`
  - Clear: `Ctrl+Shift+Y` / `Command+Shift+Y`
