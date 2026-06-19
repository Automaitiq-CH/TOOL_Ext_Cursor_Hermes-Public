"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
suite('Extension Activation Tests', () => {
    suiteSetup(() => {
        // Extension is auto-activated by vscode-test activationEvents
    });
    test('Extension should be present', () => {
        const ext = vscode.extensions.getExtension('automaitiq.hermes-agent');
        assert.ok(ext, 'Hermes Agent extension should be installed');
    });
    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('automaitiq.hermes-agent');
        if (ext && !ext.isActive) {
            await ext.activate();
        }
        assert.ok(ext?.isActive, 'Extension should be active after activation');
    });
});
suite('Package.json Validation', () => {
    test('package.json should have required fields', () => {
        const pkg = require('../package.json');
        assert.ok(pkg.name, 'name should be defined');
        assert.ok(pkg.version, 'version should be defined');
        assert.ok(pkg.displayName, 'displayName should be defined');
        assert.ok(pkg.activationEvents, 'activationEvents should be defined');
        assert.ok(pkg.contributes, 'contributes should be defined');
    });
    test('activationEvents should include sidebar view', () => {
        const pkg = require('../package.json');
        assert.ok(pkg.activationEvents.includes('onView:hermesSidebar'), 'Should activate on hermesSidebar view');
    });
});
//# sourceMappingURL=extension.test.js.map