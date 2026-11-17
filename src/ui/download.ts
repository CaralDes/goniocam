/** Téléchargement et partage de fichiers générés localement (navigateur ou application Android). */
import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Android : la WebView ne gère pas les téléchargements. Le fichier est écrit dans le cache privé
 * de l'application puis proposé via la feuille de partage (Fichiers, Drive, messagerie…).
 */
async function nativeShare(blob: Blob, filename: string) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const res = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title: filename, files: [res.uri], dialogTitle: 'Enregistrer ou envoyer la fiche' });
  } catch (e) {
    // Fermeture de la feuille de partage sans choix : ce n'est pas une erreur.
    if (!/cancel/i.test(String(e))) throw e;
  }
}

export async function download(blob: Blob, filename: string) {
  if (isNative()) return nativeShare(blob, filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Partage natif (feuille de partage du téléphone) si disponible, sinon téléchargement. */
export async function shareFile(blob: Blob, filename: string) {
  if (isNative()) return nativeShare(blob, filename);
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  return download(blob, filename);
}
