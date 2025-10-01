import { invoke } from '@tauri-apps/api/core';
import { readTextFile, exists } from '@tauri-apps/plugin-fs';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/**
 * Detect which package manager is used in a project by checking for lock files
 */
export async function detectPackageManager(projectPath: string): Promise<PackageManager> {
  try {
    // Check for lock files in order of preference
    const lockFiles: Array<[PackageManager, string]> = [
      ['pnpm', `${projectPath}/pnpm-lock.yaml`],
      ['yarn', `${projectPath}/yarn.lock`],
      ['bun', `${projectPath}/bun.lockb`],
      ['npm', `${projectPath}/package-lock.json`],
    ];

    for (const [manager, lockFile] of lockFiles) {
      try {
        const fileExists = await exists(lockFile);
        if (fileExists) {
          return manager;
        }
      } catch (error) {
        // File doesn't exist, continue checking
        continue;
      }
    }

    // Default to npm if no lock file found
    return 'npm';
  } catch (error) {
    console.error('Failed to detect package manager:', error);
    return 'npm';
  }
}

/**
 * Get the dev command from package.json
 * Returns the full command to run (e.g., "npm run dev")
 */
export async function getDevCommand(projectPath: string): Promise<string | null> {
  try {
    const packageJsonPath = `${projectPath}/package.json`;
    const fileExists = await exists(packageJsonPath);

    if (!fileExists) {
      console.log('No package.json found at:', packageJsonPath);
      return null;
    }

    const content = await readTextFile(packageJsonPath);
    const packageJson = JSON.parse(content);

    if (!packageJson.scripts) {
      console.log('No scripts found in package.json');
      return null;
    }

    // Detect package manager
    const packageManager = await detectPackageManager(projectPath);

    // Look for common dev script names in order of preference
    const devScriptNames = ['dev', 'start', 'serve', 'dev:start'];

    for (const scriptName of devScriptNames) {
      if (packageJson.scripts[scriptName]) {
        // Format command based on package manager
        switch (packageManager) {
          case 'npm':
            return `npm run ${scriptName}`;
          case 'yarn':
            return `yarn ${scriptName}`;
          case 'pnpm':
            return `pnpm ${scriptName}`;
          case 'bun':
            return `bun run ${scriptName}`;
        }
      }
    }

    // If no dev script found, return null
    console.log('No dev script found in package.json scripts:', Object.keys(packageJson.scripts));
    return null;
  } catch (error) {
    console.error('Failed to read package.json:', error);
    return null;
  }
}

/**
 * Get all available scripts from package.json
 */
export async function getAllScripts(projectPath: string): Promise<Record<string, string>> {
  try {
    const packageJsonPath = `${projectPath}/package.json`;
    const fileExists = await exists(packageJsonPath);

    if (!fileExists) {
      return {};
    }

    const content = await readTextFile(packageJsonPath);
    const packageJson = JSON.parse(content);

    return packageJson.scripts || {};
  } catch (error) {
    console.error('Failed to read package.json scripts:', error);
    return {};
  }
}