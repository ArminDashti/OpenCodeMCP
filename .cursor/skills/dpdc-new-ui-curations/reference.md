# DPDC New UI Curations — templates

Companion to `SKILL.md`. Book root: `./.armin/preferences/`.

## Chapter subsection template

Append to `./.armin/preferences/descriptions/<chapter>.md`:

```markdown
## <section-number> <pattern_title>

<2–4 sentences: what good looks like — hierarchy, density, grouping. Generic; no page names or URLs.>

### Rules

- <rule 1>
- <rule 2>
- <rule 3>

### When agents apply this

<Page types / archetypes in generic terms — e.g. “sales report filters with entity popups”.>

### Do not

- <business-specific or one-off items>

### Figure (optional)

![Figure <x.y>](../figures/<subfolder>/<descriptive-name>.jpg)

*Figure <x.y> — <short caption>*
```

## Figure index row template

Append to `./.armin/preferences/descriptions/04-figures.md`:

```markdown
| F-<ch>-<nn> | `figures/<subfolder>/<filename>` | <ch> | <caption without page name> |
```

Figure ID series:

| Chapter | Prefix |
|---------|--------|
| Report filters | `F-01-` |
| Grids / kartabl | `F-02-` |
| Forms / popups | `F-03-` |

## Archetype → chapter file

| Archetype | Chapter file |
|-----------|--------------|
| Dense multi-filter / report filter | `book/01-report-filters.md` |
| Grid / worklist / kardex / kartabl | `book/02-grids-and-kartabl.md` |
| Data entry / popup form | `book/03-forms-and-popups.md` |
| Shell / mixed | `book/00-how-agents-use-this.md` + closest chapter |

## Figure folders

| Subfolder | Use for |
|-----------|---------|
| `figures/filters/` | Filter / report panel illustrations |
| `figures/grids/` | Grid / kartabl illustrations |
| `figures/forms/` | Form / popup illustrations |
| `figures/general/` | Shell, navigation, mixed |

Filename: descriptive purpose, e.g. `dense-filter-center-grid.jpg` — not `<PageName>.jpg`.

## Rework loop read order

For target archetype `X`:

1. `./.armin/preferences/descriptions/best-ui-design-index.md` — pick chapter
2. Read `./.armin/preferences/descriptions/00-how-agents-use-this.md` on first UI pass in a session (optional if already read)
3. Read the archetype chapter in full
4. Open figures only when a visual check helps; apply **written rules** as Problems source

## Optional screenshot capture

Only when the human **explicitly** asks for a new screenshot in the same turn:

- `python target-pages/screenshot-pages.py` or Cursor IDE browser (`cursor-ide-browser`)
- Save to `figures/<subfolder>/` with a descriptive name
- **Strip** URL and page name from all book text; describe layout only

Default path is **no browser** — human supplies image or text-only pattern.
