export class FileReaderHelper {
  /**
   * Reads a File or Blob as an ArrayBuffer, with fallback to FileReader for older webviews and jsdom.
   */
  static async readAsArrayBuffer(file: Blob | File): Promise<ArrayBuffer> {
    if (typeof file.arrayBuffer === 'function') {
      try {
        return await file.arrayBuffer();
      } catch (_) {
        // Fallback to FileReader
      }
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error || new Error('Failed to read file as ArrayBuffer'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Reads a File or Blob as text, with fallback to FileReader for older webviews and jsdom.
   */
  static async readAsText(file: Blob | File): Promise<string> {
    if (typeof file.text === 'function') {
      try {
        return await file.text();
      } catch (_) {
        // Fallback to FileReader
      }
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error || new Error('Failed to read file as text'));
      reader.readAsText(file);
    });
  }
}
