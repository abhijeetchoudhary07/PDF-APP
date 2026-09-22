import { Page } from '@playwright/test';
import * as path from 'path';

/**
 * Returns absolute path to test fixtures under e2e/test-data/
 */
export function getTestDataPath(relativePath: string): string {
  return path.resolve(__dirname, '../test-data', relativePath);
}

/**
 * Injects Capacitor and Native API mocks into the browser page context
 */
export async function setupCapacitorMocks(page: Page, options: { completeOnboarding?: boolean } = { completeOnboarding: true }): Promise<void> {
  await page.addInitScript((opts) => {
    if (opts.completeOnboarding) {
      try {
        localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
        localStorage.setItem('IFH_ONBOARDING_COMPLETED_V1', 'true');
      } catch (e) {}
    }
    // 1x1 base64 JPEG
    const mockJpgBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    (window as any).Capacitor = {
      isNativePlatform: () => false,
      isPluginAvailable: () => true,
      getPlatform: () => 'web',
      Plugins: {
        Camera: {
          getPhoto: async () => ({
            format: 'jpeg',
            base64String: mockJpgBase64,
            dataUrl: `data:image/jpeg;base64,${mockJpgBase64}`
          }),
          checkPermissions: async () => ({ camera: 'granted', photos: 'granted' }),
          requestPermissions: async () => ({ camera: 'granted', photos: 'granted' })
        },
        Share: {
          share: async (opts: any) => ({ value: true }),
          canShare: async () => ({ value: true })
        },
        Filesystem: {
          writeFile: async (opts: any) => ({ uri: 'file:///mock/storage/saved_file' }),
          readFile: async () => ({ data: mockJpgBase64 })
        },
        Preferences: {
          get: async ({ key }: { key: string }) => {
            const val = localStorage.getItem(key);
            return { value: val };
          },
          set: async ({ key, value }: { key: string; value: string }) => {
            localStorage.setItem(key, value);
          },
          remove: async ({ key }: { key: string }) => {
            localStorage.removeItem(key);
          }
        }
      }
    };
  }, options);
}
