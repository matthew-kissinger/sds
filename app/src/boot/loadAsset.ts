// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

export type LoadProgress = (fraction: number) => void;

/** Load one same-origin committed asset and report only observed byte progress. */
export function loadAssetBytes(
  url: string,
  label: string,
  onProgress?: LoadProgress,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url);
    request.responseType = 'arraybuffer';
    request.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    };
    request.onerror = () => reject(new Error(`${label}: network error`));
    request.onabort = () => reject(new Error(`${label}: request aborted`));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`${label}: ${request.status} ${request.statusText}`));
        return;
      }
      if (!(request.response instanceof ArrayBuffer)) {
        reject(new Error(`${label}: response was not binary data`));
        return;
      }
      onProgress?.(1);
      resolve(request.response);
    };
    request.send();
  });
}
