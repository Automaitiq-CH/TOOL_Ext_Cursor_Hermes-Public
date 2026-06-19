# Hermes Agent — Brand Guidelines

> Extension VS Code / Cursor · Publisher: Automaitiq · v1.0 — June 2026

---

## 1. Name

### Final Name

| Context | Value |
|---|---|
| **Product name** | Hermes Agent |
| **Marketplace display name** | Hermes Agent for Cursor & VS Code |
| **Package slug** | `hermes-agent` |
| **Publisher ID** | `automaitiq` |
| **Tagline** | Your AI agent, inside your editor. |

### Naming Rationale

**Hermes** — messager des dieux dans la mythologie grecque. Rapide, fiable, omniprésent. Métaphore parfaite pour un agent AI qui fait le pont entre le développeur et l'intelligence artificielle.

**Pourquoi pas un autre nom ?**

| Alternative | Verdict |
|---|---|
| Hermes Bridge | Trop technique, pas assez mémorable |
| Hermes Link | Générique, confusions réseau |
| Hermes Companion | Positionnement passif, pas agent |
| Hermes Pilot | Conflit avec GitHub Copilot |
| Wing (aile d'Hermes) | Perte de lien avec l'écosystème Hermes |

**Hermes Agent** reste le choix optimal :
- Cohérence avec l'écosystème Hermes (Nous Research)
- "Agent" positionne clairement comme autonome (vs. autocomplete)
- Distinct sur le marketplace face à Copilot, Cline, Continue, Cody
- Court, mémorable, prononçable dans toutes les langues

### Usage Rules

- Toujours écrire **Hermes Agent** (deux mots, H et A majuscules)
- Ne jamais abréger en "HA" ou "Hermes" seul dans les communications officielles
- Le slug `hermes-agent` est toujours en minuscules avec tiret
- "for Cursor & VS Code" est un suffixe marketplace, pas partie du nom

---

## 2. Logo

### Primary Logo (assets/logo.svg)

Le logo principal est un H majuscule blanc centré dans un orbe indigo, flanqué de trois paires d'ailes stylisées (référence aux sandales ailées d'Hermes), sur fond navy avec coins arrondis.

**Éléments :**
- **Orbe central** : cercle avec gradient radial indigo (#818CF8 → #6366F1 → #4F46E5)
- **Lettre H** : blanc #F1F5F9, font-weight 700, système sans-serif
- **Ailes** : 3 plumes superposées par côté, gradient du clair au foncé, opacité dégressive (0.95 → 0.75 → 0.55)
- **Dots messagers** : 3 points indigo sous l'orbe, reliés par une ligne subtile (référence au caducée)
- **Fond** : navy #1E1E2E avec gradient diagonal subtil, border-radius 48px (forme squircle)

### Icon (assets/icon.svg)

Version simplifiée pour petites tailles (activity bar 24px, tab icon 48px). Uniquement l'orbe indigo avec le H blanc, sans ailes ni dots.

### Monochrome (assets/logo-mono.svg)

Version pour contextes sans couleur (watermarks, impressions, fonds variables). Ailes en gris slate, orbe en #475569, fond navy conservé.

### Available Files

| File | Size | Usage |
|---|---|---|
| `logo.svg` | Vector | Source principale, web, print |
| `logo.png` | 256×256 | Marketplace icon, package.json |
| `logo-512.png` | 512×512 | Marketplace hero, social cards |
| `logo-256.png` | 256×256 | README, documentation |
| `logo-128.png` | 128×128 | Thumbnails, listes |
| `icon.svg` | Vector 24×24 | Source icône simplifiée |
| `icon.png` | 128×128 | Favicon, small contexts |
| `activitybar-icon.png` | 24×24 | VS Code activity bar |
| `tab-icon.png` | 48×48 | VS Code tab/panel icon |
| `logo-mono.svg` | Vector | Version monochrome |
| `logo-mono.png` | 256×256 | Monochrome raster |

### Clear Space & Minimum Size

- **Clear space** : minimum 1× la hauteur de l'orbe autour du logo
- **Taille minimum** : 24px (icon), 64px (logo complet)
- **Ne jamais** : étirer, tourner, ajouter d'ombre portée, changer les couleurs

---

## 3. Color Palette

### Primary Colors

| Token | Hex | Usage |
|---|---|---|
| **Indigo** (accent) | `#6366F1` | Boutons, liens, éléments interactifs, orbe logo |
| **Indigo Light** | `#818CF8` | Hover states, ailes logo, highlights |
| **Indigo Dark** | `#4F46E5` | Active states, pressed, orbe gradient deep |
| **Indigo Pale** | `#A5B4FC` | Wing tips, subtle accents, badges |

### Background Colors

| Token | Hex | Usage |
|---|---|---|
| **Navy** | `#1E1E2E` | Fond principal (dark theme), logo background |
| **Navy Deep** | `#161622` | Fond secondaire, sections en retrait |
| **Surface** | `#2A2A3C` | Cards, inputs, éléments élevés |

### Text Colors

| Token | Hex | Usage |
|---|---|---|
| **Text Primary** | `#E2E8F0` (slate-200) | Corps de texte, titres |
| **Text Secondary** | `#94A3B8` (slate-400) | Labels, timestamps, texte atténué |
| **Text on Accent** | `#F1F5F9` (slate-100) | Texte sur fond indigo |

### Status Colors

| Token | Hex | Usage |
|---|---|---|
| **Success** | `#34D399` (emerald-400) | Connecté, validation, succès |
| **Warning** | `#FBBF24` (amber-400) | Connecting, attention, pending |
| **Error** | `#F87171` (red-400) | Erreurs, déconnecté, échec |

### Border

| Token | Hex | Usage |
|---|---|---|
| **Border** | `#3A3A50` | Séparateurs, outlines (dark) |
| **Border Light** | `#94A3B8` | Séparateurs (light theme) |

### Light Theme Override

| Token | Hex |
|---|---|
| Background | `#F8FAFC` |
| Background Secondary | `#E2E8F0` |
| Surface | `#CBD5E1` |
| Text Primary | `#1E293B` |
| Text Secondary | `#64748B` |
| Accent | `#6366F1` (identique) |

---

## 4. Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

Pour le code et les éléments monospace :
```css
font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Menlo', monospace;
```

### Type Scale (sidebar)

| Element | Size | Weight |
|---|---|---|
| Header title | 14px | 600 |
| Nav label | 10px | 500 |
| Body text | 13px | 400 |
| Chat bubbles | 12px | 400 |
| Code inline | 11px | 400 (mono) |
| Timestamps | 9px | 400 |
| Buttons | 12px | 600 |

---

## 5. Design Tokens (CSS Variables)

```css
:root {
  --bg-primary: #1E1E2E;
  --bg-secondary: #161622;
  --bg-tertiary: #2A2A3C;
  --text-primary: #E2E8F0;
  --text-secondary: #94A3B8;
  --accent: #6366F1;
  --accent-hover: #818CF8;
  --accent-dark: #4F46E5;
  --accent-pale: #A5B4FC;
  --border: #3A3A50;
  --success: #34D399;
  --warning: #FBBF24;
  --error: #F87171;
  --radius: 6px;
}
```

---

## 6. Visual Style

### Principles

1. **Dark-first** : le dark theme est le défaut. Le light theme est un override.
2. **Minimal** : pas de décorations superflues. Chaque pixel sert l'information.
3. **Tech-forward** : palette froide (indigo/navy), gradients subtils, glow effects discrets.
4. **Native feel** : l'extension doit sembler faire partie de l'IDE, pas un corps étranger.

### UI Conventions

- Border radius : `6px` partout (boutons, inputs, cards, badges)
- Transitions : `0.15s ease` sur hover/focus
- Pas de box-shadow en dark theme (le contraste des fonds suffit)
- Status dots : 6px de diamètre, avec animation pulse pour "connecting"
- Chat bubbles : user alignées à droite (accent bg), assistant à gauche (surface bg)

### Gallery Banner (VS Code Marketplace)

- Couleur : `#1E1E2E` (navy)
- Thème : `dark`
- Le logo 512px centré sur fond navy

---

## 7. Marketplace Assets Checklist

- [x] Logo 128×128 PNG (marketplace minimum)
- [x] Logo 256×256 PNG (README, docs)
- [x] Logo 512×512 PNG (marketplace hero)
- [x] Activity bar icon 24×24 PNG
- [x] Tab icon 48×48 PNG
- [x] SVG sources (vector, scalable)
- [x] Monochrome variant
- [x] Gallery banner color defined
- [x] Screenshots (6 images dans /screenshots)
- [x] Demo GIF (screenshots/demo.gif)

---

## 8. Do's and Don'ts

### Do

- Utiliser les couleurs exactes du palette (pas d'approximations)
- Respecter le clear space autour du logo
- Utiliser la version monochrome sur fonds photographiques
- Garder le fond navy comme défaut dans tous les supports

### Don't

- Ne pas changer le gradient des ailes
- Ne pas utiliser le logo sur fond blanc sans le container navy
- Ne pas ajouter de drop-shadow au logo
- Ne pas remplacer la font système par une font custom
- Ne pas utiliser "Hermes" seul comme nom produit (toujours "Hermes Agent")
