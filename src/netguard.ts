/**
 * Garde réseau (défense en profondeur, en plus de la CSP) : toute tentative de connexion
 * vers une autre origine que l'application est refusée avant d'atteindre le réseau, et comptée.
 * Les URL blob: et data: (fichiers locaux) restent autorisées.
 */
export const blocked: string[] = [];

const allowed = (input: string | URL): boolean => {
  try {
    const u = new URL(String(input), location.href);
    return u.origin === location.origin || u.protocol === 'blob:' || u.protocol === 'data:';
  } catch {
    return false;
  }
};

const urlOf = (input: RequestInfo | URL): string => (input instanceof Request ? input.url : String(input));

function record(url: string) {
  blocked.push(url);
  if (blocked.length === 1) console.warn('[GonioCam] Connexion sortante bloquée :', url);
}

const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = urlOf(input);
  if (!allowed(url)) {
    record(url);
    return Promise.reject(new TypeError('Connexion sortante bloquée par GonioCam'));
  }
  return nativeFetch(input, init);
};

const nativeOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
  if (!allowed(url)) {
    record(String(url));
    throw new TypeError('Connexion sortante bloquée par GonioCam');
  }
  return (nativeOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
} as typeof XMLHttpRequest.prototype.open;

if ('sendBeacon' in navigator) {
  navigator.sendBeacon = (url: string | URL) => {
    if (!allowed(url)) record(String(url));
    return false;
  };
}
