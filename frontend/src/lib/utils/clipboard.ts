import { toast } from 'sonner';

/**
 * Copy text to clipboard with toast notifications.
 * @param text - The text to copy
 * @param successMessage - Optional custom success message (default: 'Copied to clipboard')
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export async function copyToClipboard(
  text: string,
  successMessage = 'Copied to clipboard'
): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
      return true;
    }
  } catch {
    // clipboard API failed (e.g. non-HTTPS), fall through to fallback
  }

  // Fallback for non-secure contexts (HTTP)
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    toast.success(successMessage);
    return true;
  } catch {
    toast.error('Failed to copy to clipboard');
    return false;
  }
}
