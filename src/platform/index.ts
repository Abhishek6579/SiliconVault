import { isTauri } from '@tauri-apps/api/core';
import { desktopPlatform } from './desktop';
import { webPlatform } from './web';

// Resolve the host once so feature code never needs to detect an operating system or shell.
export const platform = isTauri() ? desktopPlatform : webPlatform;
export const isDesktopApp = () => platform.kind === 'desktop';
