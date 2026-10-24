declare const __APP_VERSION__: string;

/** Full version from package.json, e.g. "2.2.0" (injected by Vite at build time). */
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/** Version as shown in the UI: "v2.2" (patch releases are not shown). */
export const APP_VERSION_LABEL = `v${APP_VERSION.split('.').slice(0, 2).join('.')}`;
