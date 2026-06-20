# Publishing Guide — Hermes Agent Extension

## Prerequisites

### 1. Create a VS Code Marketplace Publisher

1. Go to https://marketplace.visualstudio.com/manage
2. Sign in with a Microsoft account
3. Create a publisher with ID **`automaitiq`** (must match `package.json` `publisher` field)
4. Fill in publisher display name, description, email

### 2. Create an Azure DevOps PAT

1. Go to https://dev.azure.com → User Settings → Personal Access Tokens
2. New Token:
   - **Organization**: All accessible organizations
   - **Scopes**: Marketplace → check **Manage**
   - **Expiration**: 90 days (or custom)
3. Copy the token immediately (it won't show again)

### 3. (Optional) Open VSX Registry Token

For Cursor and VSCodium compatibility:

1. Go to https://open-vsx.org/user-settings/tokens
2. Create a token
3. Create a namespace `automaitiq` on Open VSX

## Publishing

### Quick publish (VS Code Marketplace only):

```bash
export VSCE_PAT="your-azure-devops-pat"
./scripts/publish.sh
```

### Full publish (Marketplace + Open VSX):

```bash
export VSCE_PAT="your-azure-devops-pat"
export OVSX_TOKEN="your-open-vsx-token"
./scripts/publish.sh
```

### Manual one-liner:

```bash
VSCE_PAT=xxx npx vsce publish
```

## After Publishing

- **VS Code Marketplace**: https://marketplace.visualstudio.com/items?itemName=automaitiq.hermes-agent
- **Open VSX**: https://open-vsx.org/extension/automaitiq/hermes-agent
- Listing takes 5-10 minutes to appear after publish

## Updating the Extension

1. Bump version in `package.json`
2. Run `./scripts/publish.sh`
3. Marketplace auto-reviews (usually approved within minutes)

## Package Contents

- **VSIX size**: ~448KB
- **Files**: 47 (source, compiled JS, assets, README, LICENSE)
- **Excluded**: screenshots/, scripts/, spikes/, tests coverage, .env files
