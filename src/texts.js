// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// errors. Four languages, the four of the Gladys interface; German says "du",
// Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './wud/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noInstance: {
    en: "Enter the address of What's Up Docker in the configuration.",
    fr: "Saisissez l'adresse de What's Up Docker dans la configuration.",
    de: "Gib die Adresse von What's Up Docker in der Konfiguration ein.",
    es: "Introduzca la dirección de What's Up Docker en la configuración.",
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.2:3000',
    fr: 'Adresse incomprise, ex. http://192.168.1.2:3000',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.2:3000',
    es: 'Dirección no válida, p. ej. http://192.168.1.2:3000',
  },
};

// One short explanation per error kind (src/wud/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: "What's Up Docker does not answer",
    fr: "What's Up Docker ne répond pas",
    de: "What's Up Docker antwortet nicht",
    es: "What's Up Docker no responde",
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'user, password or token refused by WUD',
    fr: 'utilisateur, mot de passe ou jeton refusé par WUD',
    de: 'Benutzer, Passwort oder Token von WUD abgelehnt',
    es: 'usuario, contraseña o token rechazado por WUD',
  },
  [ERROR_KINDS.AUTH_MISSING]: {
    en: 'WUD asks for a user and password, or an API token',
    fr: "WUD demande un utilisateur et un mot de passe, ou un jeton d'API",
    de: 'WUD verlangt Benutzer und Passwort oder ein API-Token',
    es: 'WUD pide un usuario y una contraseña, o un token de API',
  },
  [ERROR_KINDS.READ_ONLY]: {
    en: 'check refused: the WUD user or token is read-only',
    fr: "vérification refusée : l'utilisateur ou le jeton WUD est en lecture seule",
    de: 'Prüfung abgelehnt: Der WUD-Benutzer oder das Token darf nur lesen',
    es: 'comprobación rechazada: el usuario o el token de WUD es de solo lectura',
  },
  [ERROR_KINDS.NOT_WUD]: {
    en: "no What's Up Docker API at this address",
    fr: "aucune API What's Up Docker à cette adresse",
    de: "keine What's-Up-Docker-API unter dieser Adresse",
    es: "no hay ninguna API de What's Up Docker en esta dirección",
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'OK',
    containers: (count) => `${count} container(s) watched`,
    updates: (count) => `${count} update(s) available`,
    major: (count) => `${count} major`,
  },
  fr: {
    ok: 'OK',
    containers: (count) => `${count} conteneur(s) surveillé(s)`,
    updates: (count) => `${count} mise(s) à jour disponible(s)`,
    major: (count) => `dont ${count} majeure(s)`,
  },
  de: {
    ok: 'OK',
    containers: (count) => `${count} Container überwacht`,
    updates: (count) => `${count} Update(s) verfügbar`,
    major: (count) => `davon ${count} Major`,
  },
  es: {
    ok: 'OK',
    containers: (count) => `${count} contenedor(es) vigilado(s)`,
    updates: (count) => `${count} actualización(es) disponible(s)`,
    major: (count) => `${count} mayor(es)`,
  },
};

// Errors of the scene actions (shown in Gladys).
export const ACTION_TEXT = {
  noInstance: {
    en: "What's Up Docker is not configured.",
    fr: "What's Up Docker n'est pas configuré.",
    de: "What's Up Docker ist nicht konfiguriert.",
    es: "What's Up Docker no está configurado.",
  },
  unknownContainer: {
    en: 'This container is no longer watched by WUD.',
    fr: "Ce conteneur n'est plus surveillé par WUD.",
    de: 'Dieser Container wird von WUD nicht mehr überwacht.',
    es: 'Este contenedor ya no está vigilado por WUD.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
