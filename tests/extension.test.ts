import * as assert from 'assert';
import * as vscode from 'vscode';

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
    assert.ok(
      pkg.activationEvents.includes('onView:hermesSidebar'),
      'Should activate on hermesSidebar view'
    );
  });
});
