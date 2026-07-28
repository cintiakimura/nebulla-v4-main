/**
 * Static IDE chrome catalogs. Never call Grok to translate chrome.
 * TODO-native-review: fr/it/es/de critical keys are machine-assisted.
 */

import type { IdeLocaleCode } from './locales';

export type CatalogNamespace = 'common' | 'chat' | 'appStatus' | 'settings';

type Catalog = Record<string, string>;

const enCommon: Catalog = {
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.retry': 'Retry',
  'common.loading': 'Loading…',
  'common.error': 'Something went wrong',
};

const enChat: Catalog = {
  'chat.mode.chat': 'Chat',
  'chat.mode.agent': 'Agent',
  'chat.mode.chatHint': 'Brainstorm freely — no file writes until Agent',
  'chat.mode.agentHint': 'Can edit files and run Go when you ask',
  'chat.greeting': "What's up? What would you like to create today?",
  'chat.greetingSub': 'Brainstorm in Chat, or switch to Agent when you want files changed.',
  'chat.placeholder.chat': 'Message Nebulla…',
  'chat.placeholder.agent': 'Describe what to build or fix…',
  'chat.attach': 'Attach file',
  'chat.mic': 'Voice input',
  'chat.micStop': 'Stop listening',
  'chat.send': 'Send',
  'chat.replyingIn': 'Replying in {{lang}}',
  'chat.grokMissing': 'Grok is not configured. Add your API key in Settings to chat.',
  'chat.uploadFailed': 'Upload failed. Try again.',
  'chat.voiceUnsupported': 'Voice for this language isn’t available here — using English.',
  'chat.switchToAgent': 'Switch to Agent',
  'chat.stayInChat': 'Stay in Chat',
  'chat.goBlocked': 'Switch to Agent to run Go / apply file changes.',
  'chat.goCta': 'Go — write code to workspace',
  'chat.sendMessage': 'Send message',
  'chat.uploading': 'Uploading…',
  'chat.attached': 'Attached.',
};

const enAppStatus: Catalog = {
  'appStatus.title': 'App Status',
  'appStatus.healthy': 'Looking good',
  'appStatus.issues': 'Needs attention',
  'appStatus.unknown': 'Status unknown',
  'appStatus.fixWithAgent': 'Fix with Agent',
  'appStatus.askAgentFix': 'Ask Agent to fix',
  'appStatus.clear': 'Clear',
  'appStatus.technicalDetails': 'Technical details',
  'appStatus.refresh': 'Refresh status',
  'appStatus.noPreview': 'Open Preview to check the live app.',
  'appStatus.crossOrigin': 'Preview is on another origin — limited status only.',
  'appStatus.looksOk': 'App looks OK',
  'appStatus.somethingBroke': 'Something broke',
  'appStatus.nIssues': '{{count}} issues',
  'appStatus.healthyDetail': "Live preview looks fine. You don’t need DevTools for this.",
  'appStatus.issuesDetail': 'We caught a problem in the preview — no need to Inspect the page.',
  'appStatus.titleAttr': 'App status — preview health',
  'appStatus.voiceNudge': 'Something broke in the preview. Want me to fix it?',
  'appStatus.previewOk': 'App status: OK — open in chat',
  'appStatus.previewIssues': 'App status: {{count}} issue(s) — open in chat',
};

const enSettings: Catalog = {
  'settings.language': 'Language',
  'settings.ideLanguage': 'IDE language',
  'settings.ideLanguageHint': 'Menus, buttons, and chrome. Automatic follows your device.',
  'settings.ide.auto': 'Automatic (device)',
  'settings.contentMode': 'Chat & plans',
  'settings.contentModeHint': 'Language for chat replies and Master Plan prose.',
  'settings.content.mirror': 'Match my writing',
  'settings.content.matchIde': 'Match IDE language',
  'settings.resolved': 'Resolved',
  'settings.resolvedIde': 'IDE: {{locale}}',
  'settings.resolvedContent': 'Content: {{locale}}',
};

const frCommon: Catalog = {
  'common.cancel': 'Annuler',
  'common.close': 'Fermer',
  'common.save': 'Enregistrer',
  'common.retry': 'Réessayer',
  'common.loading': 'Chargement…',
  'common.error': 'Une erreur est survenue',
};

const frChat: Catalog = {
  'chat.mode.chat': 'Chat',
  'chat.mode.agent': 'Agent',
  'chat.mode.chatHint': 'Brainstorm libre — pas d’écriture de fichiers avant Agent',
  'chat.mode.agentHint': 'Peut modifier les fichiers et lancer Go sur demande',
  'chat.greeting': 'Salut ! Qu’est-ce que tu aimerais créer aujourd’hui ?',
  'chat.greetingSub': 'Brainstorm en Chat, ou passe en Agent pour modifier des fichiers.',
  'chat.placeholder.chat': 'Écrire à Nebulla…',
  'chat.placeholder.agent': 'Décris ce qu’il faut construire ou corriger…',
  'chat.attach': 'Joindre un fichier',
  'chat.mic': 'Entrée vocale',
  'chat.micStop': 'Arrêter l’écoute',
  'chat.send': 'Envoyer',
  'chat.replyingIn': 'Réponse en {{lang}}',
  'chat.grokMissing': 'Grok n’est pas configuré. Ajoute ta clé API dans Réglages.',
  'chat.uploadFailed': 'Échec du téléversement. Réessaie.',
  'chat.voiceUnsupported': 'La voix pour cette langue n’est pas dispo — anglais utilisé.',
  'chat.switchToAgent': 'Passer en Agent',
  'chat.stayInChat': 'Rester en Chat',
  'chat.goBlocked': 'Passe en Agent pour lancer Go / appliquer les fichiers.',
  'chat.goCta': 'Go — écrire le code dans le projet',
  'chat.sendMessage': 'Envoyer le message',
  'chat.uploading': 'Téléversement…',
  'chat.attached': 'Pièce jointe.',
};

const frAppStatus: Catalog = {
  'appStatus.title': 'État de l’app',
  'appStatus.healthy': 'Tout va bien',
  'appStatus.issues': 'À vérifier',
  'appStatus.unknown': 'État inconnu',
  'appStatus.fixWithAgent': 'Corriger avec Agent',
  'appStatus.askAgentFix': 'Demander à Agent de corriger',
  'appStatus.clear': 'Effacer',
  'appStatus.technicalDetails': 'Détails techniques',
  'appStatus.refresh': 'Actualiser',
  'appStatus.noPreview': 'Ouvre Aperçu pour vérifier l’app live.',
  'appStatus.crossOrigin': 'Aperçu sur une autre origine — statut limité.',
  'appStatus.looksOk': 'App OK',
  'appStatus.somethingBroke': 'Un problème est survenu',
  'appStatus.nIssues': '{{count}} problèmes',
  'appStatus.healthyDetail': 'L’aperçu live a l’air bon. Pas besoin de DevTools.',
  'appStatus.issuesDetail': 'Problème détecté dans l’aperçu — pas besoin d’Inspecter la page.',
  'appStatus.titleAttr': 'État de l’app — santé de l’aperçu',
  'appStatus.voiceNudge': 'Un problème dans l’aperçu. Je corrige ?',
  'appStatus.previewOk': 'État app : OK — ouvrir dans le chat',
  'appStatus.previewIssues': 'État app : {{count}} problème(s) — ouvrir dans le chat',
};

const frSettings: Catalog = {
  'settings.language': 'Langue',
  'settings.ideLanguage': 'Langue de l’IDE',
  'settings.ideLanguageHint': 'Menus, boutons et chrome. Automatique suit l’appareil.',
  'settings.ide.auto': 'Automatique (appareil)',
  'settings.contentMode': 'Chat & plans',
  'settings.contentModeHint': 'Langue des réponses chat et du Master Plan.',
  'settings.content.mirror': 'Suivre mon écriture',
  'settings.content.matchIde': 'Suivre la langue de l’IDE',
  'settings.resolved': 'Résolu',
  'settings.resolvedIde': 'IDE : {{locale}}',
  'settings.resolvedContent': 'Contenu : {{locale}}',
};

const itCommon: Catalog = {
  'common.cancel': 'Annulla',
  'common.close': 'Chiudi',
  'common.save': 'Salva',
  'common.retry': 'Riprova',
  'common.loading': 'Caricamento…',
  'common.error': 'Qualcosa è andato storto',
};

const itChat: Catalog = {
  'chat.mode.chat': 'Chat',
  'chat.mode.agent': 'Agent',
  'chat.mode.chatHint': 'Brainstorm libero — nessuna scrittura file finché non sei in Agent',
  'chat.mode.agentHint': 'Può modificare file ed eseguire Go quando lo chiedi',
  'chat.greeting': 'Ciao! Cosa vorresti creare oggi?',
  'chat.greetingSub': 'Brainstorm in Chat, o passa ad Agent per modificare i file.',
  'chat.placeholder.chat': 'Messaggio a Nebulla…',
  'chat.placeholder.agent': 'Descrivi cosa costruire o correggere…',
  'chat.attach': 'Allega file',
  'chat.mic': 'Input vocale',
  'chat.micStop': 'Interrompi ascolto',
  'chat.send': 'Invia',
  'chat.replyingIn': 'Risposta in {{lang}}',
  'chat.grokMissing': 'Grok non è configurato. Aggiungi la chiave API in Impostazioni.',
  'chat.uploadFailed': 'Caricamento non riuscito. Riprova.',
  'chat.voiceUnsupported': 'Voce non disponibile per questa lingua — uso inglese.',
  'chat.switchToAgent': 'Passa ad Agent',
  'chat.stayInChat': 'Resta in Chat',
  'chat.goBlocked': 'Passa ad Agent per eseguire Go / applicare i file.',
  'chat.goCta': 'Go — scrivi il codice nel workspace',
  'chat.sendMessage': 'Invia messaggio',
  'chat.uploading': 'Caricamento…',
  'chat.attached': 'Allegato.',
};

const itAppStatus: Catalog = {
  'appStatus.title': 'Stato app',
  'appStatus.healthy': 'Tutto ok',
  'appStatus.issues': 'Serve attenzione',
  'appStatus.unknown': 'Stato sconosciuto',
  'appStatus.fixWithAgent': 'Correggi con Agent',
  'appStatus.askAgentFix': 'Chiedi ad Agent di correggere',
  'appStatus.clear': 'Cancella',
  'appStatus.technicalDetails': 'Dettagli tecnici',
  'appStatus.refresh': 'Aggiorna stato',
  'appStatus.noPreview': 'Apri Anteprima per controllare l’app live.',
  'appStatus.crossOrigin': 'Anteprima su un’altra origine — stato limitato.',
  'appStatus.looksOk': 'App OK',
  'appStatus.somethingBroke': 'Qualcosa non va',
  'appStatus.nIssues': '{{count}} problemi',
  'appStatus.healthyDetail': 'L’anteprima live sembra a posto. Non serve DevTools.',
  'appStatus.issuesDetail': 'Problema nell’anteprima — non serve Ispezionare la pagina.',
  'appStatus.titleAttr': 'Stato app — salute anteprima',
  'appStatus.voiceNudge': 'Qualcosa si è rotto nell’anteprima. Lo sistemo?',
  'appStatus.previewOk': 'Stato app: OK — apri in chat',
  'appStatus.previewIssues': 'Stato app: {{count}} problema/i — apri in chat',
};

const itSettings: Catalog = {
  'settings.language': 'Lingua',
  'settings.ideLanguage': 'Lingua IDE',
  'settings.ideLanguageHint': 'Menu, pulsanti e chrome. Automatico segue il dispositivo.',
  'settings.ide.auto': 'Automatico (dispositivo)',
  'settings.contentMode': 'Chat e piani',
  'settings.contentModeHint': 'Lingua delle risposte chat e del Master Plan.',
  'settings.content.mirror': 'Segui la mia scrittura',
  'settings.content.matchIde': 'Segui la lingua IDE',
  'settings.resolved': 'Risolto',
  'settings.resolvedIde': 'IDE: {{locale}}',
  'settings.resolvedContent': 'Contenuto: {{locale}}',
};

const esCommon: Catalog = {
  'common.cancel': 'Cancelar',
  'common.close': 'Cerrar',
  'common.save': 'Guardar',
  'common.retry': 'Reintentar',
  'common.loading': 'Cargando…',
  'common.error': 'Algo salió mal',
};

const esChat: Catalog = {
  'chat.mode.chat': 'Chat',
  'chat.mode.agent': 'Agent',
  'chat.mode.chatHint': 'Brainstorm libre — sin escribir archivos hasta Agent',
  'chat.mode.agentHint': 'Puede editar archivos y ejecutar Go cuando lo pidas',
  'chat.greeting': '¿Qué tal? ¿Qué te gustaría crear hoy?',
  'chat.greetingSub': 'Brainstorm en Chat, o pasa a Agent para cambiar archivos.',
  'chat.placeholder.chat': 'Mensaje a Nebulla…',
  'chat.placeholder.agent': 'Describe qué construir o corregir…',
  'chat.attach': 'Adjuntar archivo',
  'chat.mic': 'Entrada de voz',
  'chat.micStop': 'Dejar de escuchar',
  'chat.send': 'Enviar',
  'chat.replyingIn': 'Respondiendo en {{lang}}',
  'chat.grokMissing': 'Grok no está configurado. Añade tu clave API en Ajustes.',
  'chat.uploadFailed': 'Error al subir. Inténtalo de nuevo.',
  'chat.voiceUnsupported': 'Voz no disponible para este idioma — uso inglés.',
  'chat.switchToAgent': 'Cambiar a Agent',
  'chat.stayInChat': 'Seguir en Chat',
  'chat.goBlocked': 'Cambia a Agent para ejecutar Go / aplicar archivos.',
  'chat.goCta': 'Go — escribir código en el workspace',
  'chat.sendMessage': 'Enviar mensaje',
  'chat.uploading': 'Subiendo…',
  'chat.attached': 'Adjunto.',
};

const esAppStatus: Catalog = {
  'appStatus.title': 'Estado de la app',
  'appStatus.healthy': 'Todo bien',
  'appStatus.issues': 'Requiere atención',
  'appStatus.unknown': 'Estado desconocido',
  'appStatus.fixWithAgent': 'Corregir con Agent',
  'appStatus.askAgentFix': 'Pedir a Agent que lo corrija',
  'appStatus.clear': 'Borrar',
  'appStatus.technicalDetails': 'Detalles técnicos',
  'appStatus.refresh': 'Actualizar estado',
  'appStatus.noPreview': 'Abre Vista previa para revisar la app en vivo.',
  'appStatus.crossOrigin': 'Vista previa en otro origen — estado limitado.',
  'appStatus.looksOk': 'App OK',
  'appStatus.somethingBroke': 'Algo falló',
  'appStatus.nIssues': '{{count}} problemas',
  'appStatus.healthyDetail': 'La vista previa se ve bien. No hace falta DevTools.',
  'appStatus.issuesDetail': 'Problema en la vista previa — no hace falta Inspeccionar.',
  'appStatus.titleAttr': 'Estado de la app — salud de la vista previa',
  'appStatus.voiceNudge': 'Algo se rompió en la vista previa. ¿Lo arreglo?',
  'appStatus.previewOk': 'Estado app: OK — abrir en el chat',
  'appStatus.previewIssues': 'Estado app: {{count}} problema(s) — abrir en el chat',
};

const esSettings: Catalog = {
  'settings.language': 'Idioma',
  'settings.ideLanguage': 'Idioma del IDE',
  'settings.ideLanguageHint': 'Menús, botones y chrome. Automático sigue el dispositivo.',
  'settings.ide.auto': 'Automático (dispositivo)',
  'settings.contentMode': 'Chat y planes',
  'settings.contentModeHint': 'Idioma de las respuestas del chat y del Master Plan.',
  'settings.content.mirror': 'Seguir mi escritura',
  'settings.content.matchIde': 'Seguir el idioma del IDE',
  'settings.resolved': 'Resuelto',
  'settings.resolvedIde': 'IDE: {{locale}}',
  'settings.resolvedContent': 'Contenido: {{locale}}',
};

const deCommon: Catalog = {
  'common.cancel': 'Abbrechen',
  'common.close': 'Schließen',
  'common.save': 'Speichern',
  'common.retry': 'Erneut versuchen',
  'common.loading': 'Laden…',
  'common.error': 'Etwas ist schiefgelaufen',
};

const deChat: Catalog = {
  'chat.mode.chat': 'Chat',
  'chat.mode.agent': 'Agent',
  'chat.mode.chatHint': 'Frei brainstormen — keine Dateischreibzugriffe vor Agent',
  'chat.mode.agentHint': 'Kann Dateien bearbeiten und Go auf Anfrage ausführen',
  'chat.greeting': 'Hey! Was möchtest du heute erstellen?',
  'chat.greetingSub': 'Brainstorme im Chat oder wechsle zu Agent, um Dateien zu ändern.',
  'chat.placeholder.chat': 'Nachricht an Nebulla…',
  'chat.placeholder.agent': 'Beschreibe, was gebaut oder behoben werden soll…',
  'chat.attach': 'Datei anhängen',
  'chat.mic': 'Spracheingabe',
  'chat.micStop': 'Zuhören beenden',
  'chat.send': 'Senden',
  'chat.replyingIn': 'Antwort auf {{lang}}',
  'chat.grokMissing': 'Grok ist nicht konfiguriert. API-Schlüssel in den Einstellungen hinzufügen.',
  'chat.uploadFailed': 'Upload fehlgeschlagen. Bitte erneut versuchen.',
  'chat.voiceUnsupported': 'Stimme für diese Sprache nicht verfügbar — Englisch wird verwendet.',
  'chat.switchToAgent': 'Zu Agent wechseln',
  'chat.stayInChat': 'Im Chat bleiben',
  'chat.goBlocked': 'Wechsle zu Agent, um Go auszuführen / Dateien anzuwenden.',
  'chat.goCta': 'Go — Code in den Workspace schreiben',
  'chat.sendMessage': 'Nachricht senden',
  'chat.uploading': 'Hochladen…',
  'chat.attached': 'Angehängt.',
};

const deAppStatus: Catalog = {
  'appStatus.title': 'App-Status',
  'appStatus.healthy': 'Alles in Ordnung',
  'appStatus.issues': 'Aufmerksamkeit nötig',
  'appStatus.unknown': 'Status unbekannt',
  'appStatus.fixWithAgent': 'Mit Agent beheben',
  'appStatus.askAgentFix': 'Agent bitten zu beheben',
  'appStatus.clear': 'Leeren',
  'appStatus.technicalDetails': 'Technische Details',
  'appStatus.refresh': 'Status aktualisieren',
  'appStatus.noPreview': 'Öffne Vorschau, um die Live-App zu prüfen.',
  'appStatus.crossOrigin': 'Vorschau auf anderem Origin — begrenzter Status.',
  'appStatus.looksOk': 'App OK',
  'appStatus.somethingBroke': 'Etwas ist kaputt',
  'appStatus.nIssues': '{{count}} Probleme',
  'appStatus.healthyDetail': 'Live-Vorschau sieht gut aus. DevTools nicht nötig.',
  'appStatus.issuesDetail': 'Problem in der Vorschau — Seite nicht inspizieren nötig.',
  'appStatus.titleAttr': 'App-Status — Vorschau-Gesundheit',
  'appStatus.voiceNudge': 'In der Vorschau ist etwas kaputt. Soll ich es beheben?',
  'appStatus.previewOk': 'App-Status: OK — im Chat öffnen',
  'appStatus.previewIssues': 'App-Status: {{count}} Problem(e) — im Chat öffnen',
};

const deSettings: Catalog = {
  'settings.language': 'Sprache',
  'settings.ideLanguage': 'IDE-Sprache',
  'settings.ideLanguageHint': 'Menüs, Buttons und Chrome. Automatisch folgt dem Gerät.',
  'settings.ide.auto': 'Automatisch (Gerät)',
  'settings.contentMode': 'Chat & Pläne',
  'settings.contentModeHint': 'Sprache für Chat-Antworten und Master-Plan-Prosa.',
  'settings.content.mirror': 'Meiner Schreibweise folgen',
  'settings.content.matchIde': 'IDE-Sprache folgen',
  'settings.resolved': 'Aufgelöst',
  'settings.resolvedIde': 'IDE: {{locale}}',
  'settings.resolvedContent': 'Inhalt: {{locale}}',
};

const CATALOGS: Record<IdeLocaleCode, Catalog> = {
  en: { ...enCommon, ...enChat, ...enAppStatus, ...enSettings },
  fr: { ...frCommon, ...frChat, ...frAppStatus, ...frSettings },
  it: { ...itCommon, ...itChat, ...itAppStatus, ...itSettings },
  es: { ...esCommon, ...esChat, ...esAppStatus, ...esSettings },
  de: { ...deCommon, ...deChat, ...deAppStatus, ...deSettings },
};

export function getCatalog(locale: IdeLocaleCode): Catalog {
  return CATALOGS[locale] || CATALOGS.en;
}

export function translateKey(
  locale: IdeLocaleCode,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const primary = CATALOGS[locale]?.[key];
  const fallback = CATALOGS.en[key];
  let out = primary || fallback || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return out;
}
