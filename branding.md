# Hermes Agent — Extension Branding Guide

## Extension Identity

| Field | Value |
|---|---|
| **Display Name** | Hermes Agent for Cursor |
| **Extension ID** | `automaitiq.hermes-agent` |
| **Short Description** | AI coding agent powered by Hermes — right in your IDE |
| **Publisher** | Automaitiq |
| **Repository** | `TOOL_Ext_Cursor_Hermes` |

## Color Palette

| Role | Hex | Usage |
|---|---|---|
| **Primary** | `#6366F1` | Main brand color, icons, buttons |
| **Primary Dark** | `#4F46E5` | Hover states, active elements |
| **Primary Light** | `#818CF8` | Accents, highlights |
| **Background** | `#1E1E2E` | Dark theme base |
| **Surface** | `#2A2A3C` | Panels, cards |
| **Text Primary** | `#E2E8F0` | Main text |
| **Text Secondary** | `#94A3B8` | Muted text, placeholders |
| **Success** | `#34D399` | Success states |
| **Warning** | `#FBBF24` | Warnings |
| **Error** | `#F87171` | Errors |

## Typography

- **UI Font**: System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- **Monospace**: `'JetBrains Mono', 'Fira Code', 'Consolas', monospace`

## Logo Assets

All assets live in `assets/` at the project root.

| File | Size | Usage |
|---|---|---|
| `logo.svg` | vector | Source file, scalable |
| `logo.png` | 256×256 | Standard logo, documentation |
| `icon.png` | 512×512 | VS Code Marketplace icon |
| `activitybar-icon.png` | 48×48 | Activity bar icon (dark bg) |
| `tab-icon.png` | 16×16 | Tab/title bar icon |

### Logo description
Winged "H" emblem on a dark background. Symmetrical wing-like shapes flank a central indigo circle containing a bold white "H". Three accent dots below. Design evokes speed, agility, and the Greek messenger god Hermes — fitting for an AI agent.

### Regenerating assets
```bash
python3 generate_assets.py
```
Requires: Pillow (`pip install Pillow`).

## Design Principles

1. **Minimal** — Clean, functional, no visual noise
2. **IDE-native** — Blends with VS Code/Cursor dark theme
3. **Hermes identity** — Wing/messenger motif, indigo palette
4. **Professional** — Matches Automaitiq agency standards

## VS Code Marketplace Metadata

```json
{
  "displayName": "Hermes Agent for Cursor",
  "name": "hermes-agent",
  "publisher": "automaitiq",
  "description": "AI coding agent powered by Hermes — right in your IDE",
  "categories": ["AI", "Chat", "Programming Languages"],
  "keywords": ["hermes", "ai", "agent", "coding", "cursor", "chat", "autonomous"]
}
```
