import { desktopPlatform } from './desktop';

// SiliconVault runs inside the Tauri desktop shell; there is no standalone browser adapter.
export const platform = desktopPlatform;
