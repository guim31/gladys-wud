// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `pending_updates`.
//
// The use case: a glance at the wall tablet tells which containers have an
// update, and how big it is. So the widget shows the number of updates and of
// major ones, then the containers with an update, majors first: name, current
// → new version, a badge with the kind of update; a tap opens the detail
// (image, link to the image page or its release notes, as WUD gives it). One button: check every
// container now.
//
// The figures are sent as values, not bound to device features: the widget
// works before any device is added.
//
// Budget (8 components, 2 texts): two tiles, one card-list of 8 rows at most,
// one text (error or "everything is up to date"), one button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { CONNECTION_TEXT, pick } from './texts.js';

// Action key of the button: permanent once published.
export const ACTIONS = Object.freeze({ CHECK_ALL: 'check_all' });

export const MAX_ROWS = 8;

export const TEXT = {
  pick: {
    en: "Enter the address of What's Up Docker in the configuration of the integration.",
    fr: "Saisissez l'adresse de What's Up Docker dans la configuration de l'intégration.",
    de: "Gib die Adresse von What's Up Docker in der Konfiguration der Integration ein.",
    es: "Introduzca la dirección de What's Up Docker en la configuración de la integración.",
  },
  upToDate: {
    en: 'Every container is up to date.',
    fr: 'Tous les conteneurs sont à jour.',
    de: 'Alle Container sind aktuell.',
    es: 'Todos los contenedores están actualizados.',
  },
  more: {
    en: (count) => `And ${count} more.`,
    fr: (count) => `Et ${count} de plus.`,
    de: (count) => `Und ${count} weitere.`,
    es: (count) => `Y ${count} más.`,
  },
  updates: { en: 'Updates', fr: 'Mises à jour', de: 'Updates', es: 'Actualizaciones' },
  major: { en: 'Major', fr: 'Majeures', de: 'Major', es: 'Mayores' },
  kinds: {
    major: { en: 'Major', fr: 'Majeure', de: 'Major', es: 'Mayor' },
    minor: { en: 'Minor', fr: 'Mineure', de: 'Minor', es: 'Menor' },
    patch: { en: 'Patch', fr: 'Correctif', de: 'Patch', es: 'Parche' },
    digest: { en: 'Digest', fr: 'Empreinte', de: 'Digest', es: 'Digest' },
    other: { en: 'Update', fr: 'Mise à jour', de: 'Update', es: 'Actualización' },
  },
  image: { en: 'Image', fr: 'Image', de: 'Image', es: 'Imagen' },
  more_info: { en: 'More info', fr: 'En savoir plus', de: 'Mehr erfahren', es: 'Más información' },
  checkAll: { en: 'Check now', fr: 'Vérifier', de: 'Jetzt prüfen', es: 'Comprobar' },
  checking: {
    en: 'WUD is checking the registries, the result follows in a minute.',
    fr: 'WUD interroge les registres, le résultat suit dans une minute.',
    de: 'WUD fragt die Registries ab, das Ergebnis folgt in einer Minute.',
    es: 'WUD está consultando los registros, el resultado llegará en un minuto.',
  },
};

const BADGE_COLORS = {
  major: WIDGET_COLORS.DANGER,
  minor: WIDGET_COLORS.WARNING,
  patch: WIDGET_COLORS.INFO,
  digest: WIDGET_COLORS.NEUTRAL,
  other: WIDGET_COLORS.NEUTRAL,
};

const t = (text, language) => pick(text, language);
const shorten = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** One card per container with an update. */
export function cards(pending, language) {
  return pending.slice(0, MAX_ROWS).map((container) => {
    const item = {
      title: shorten(container.displayName || container.name, 60),
      subtitle: shorten(`${container.current} → ${container.latest}`, 60),
      badge: { text: t(TEXT.kinds[container.kind], language), color: BADGE_COLORS[container.kind] },
      description: shorten(
        `${t(TEXT.image, language)}: ${container.image}:${container.tag}\n${container.current} → ${container.latest}`,
        2000,
      ),
    };
    if (/^https:\/\//i.test(container.link ?? '')) {
      item.links = [{ url: container.link, label: t(TEXT.more_info, language) }];
    }
    return item;
  });
}

async function get(hub, { language = 'en' }) {
  if (!hub.client) {
    return message(hub.config?.invalidUrl ? CONNECTION_TEXT.invalidUrl : TEXT.pick, language);
  }
  const components = [];
  const pending = hub.pendingUpdates();
  if (hub.readAt > 0) {
    const major = pending.filter((container) => container.kind === 'major').length;
    components.push(
      {
        type: 'value',
        value: pending.length,
        label: t(TEXT.updates, language),
        icon: 'download',
        color: pending.length > 0 ? WIDGET_COLORS.INFO : WIDGET_COLORS.SUCCESS,
      },
      {
        type: 'value',
        value: major,
        label: t(TEXT.major, language),
        icon: 'alert-triangle',
        color: major > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
      },
    );
  }
  const errorText = hub.errorText(language);
  if (errorText) {
    components.push({ type: 'text', variant: 'body', text: errorText });
  }
  if (pending.length > 0) {
    components.push({ type: 'card-list', display: 'list', items: cards(pending, language) });
    if (pending.length > MAX_ROWS && !errorText) {
      components.push({
        type: 'text',
        variant: 'caption',
        text: pick(TEXT.more, language)(pending.length - MAX_ROWS),
      });
    }
  } else if (!errorText && hub.readAt > 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.upToDate, language) });
  }
  components.push({
    type: 'button',
    label: t(TEXT.checkAll, language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: ACTIONS.CHECK_ALL },
  });
  return { ttl_seconds: errorText ? 60 : 300, components };
}

async function action(hub, { actionKey }) {
  if (actionKey === ACTIONS.CHECK_ALL) {
    await hub.check(null);
    return { message: TEXT.checking };
  }
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
