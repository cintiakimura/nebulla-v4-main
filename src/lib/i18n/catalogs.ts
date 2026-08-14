/**
 * Static IDE chrome catalogs. Never call Grok to translate chrome.
 * TODO-native-review: fr/it/es/de critical keys are machine-assisted.
 */

import type { IdeLocaleCode } from './locales';
import { IDE_CATALOGS } from './ideCatalog';

export type CatalogNamespace = 'common' | 'chat' | 'appStatus' | 'settings' | 'ide';

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
  'chat.mode.chatHint': 'Plan & discuss — no file writes until Agent',
  'chat.mode.agentHint': 'Can edit files and run Go when you ask',
  'chat.greeting': 'Ready when you are — ask a question or continue what you want to create today.',
  'chat.greetingSub': 'Plan in Chat, or switch to Agent when you want files changed.',
  /** Softer empty state when My Projects / discovery is already the center hero. */
  'chat.greeting.projects': 'The center is for starting a project.',
  'chat.greetingSub.projects': 'Ask me anything here once you begin — or open a file to edit in Code.',
  'chat.goMasterPlanHint': 'Complete the Master Plan first for a solid build',
  'chat.goMasterPlanHint.soft': 'After you start in the center, finish the Master Plan before Go.',
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
  'chat.thinking': 'Thinking…',
  'chat.interruptVoice': 'Interrupt Grok voice',
  'chat.voiceStopped': 'Stopped voice playback and any pending dictation send.',
  'chat.stayHint': 'Staying in Chat — keep planning.',
  'chat.goNeedsAgent': 'Go needs Agent mode — click to switch or use the Agent toggle',
  'chat.goAgentTitle': 'Go: Grok Code writes files to your workspace',
  'chat.openTalkOn':
    'Open talk is on — speak naturally. I wait at least 10s while you talk, then 3s after you pause, then send.',
  'chat.openTalkError': 'Open talk: {{error}}',
  'chat.openTalkMicDenied': 'Open talk: allow the microphone for this site.',
  'chat.speechUnsupported': 'Speech recognition is not supported in this browser.',
  'chat.openTalkStartFailed': 'Could not start open talk — check browser permissions.',
  'chat.status.chat': 'Chat · plan & discuss',
  'chat.status.agent': 'Agent · coding',
  'chat.idle.chat':
    'Chat mode — plan & discuss. Switch to Agent when you are ready to build or edit code.',
  'chat.idle.agent':
    'Agent mode — Go runs Grok Code and writes files. Switch to Chat to plan without spending agent tokens.',
  'chat.switchPrompt':
    "You're in **Chat** (plan & discuss) — I won't write files or run the coding agent while we talk.{{discovery}}\n\nSwitch to **Agent** to {{kind}}?",
  'chat.switchKind.debug': 'debug',
  'chat.switchKind.ui': 'generate UI',
  'chat.switchKind.implement': 'implement',
  'chat.switchDiscovery':
    ' Discovery is still open on this project — Agent will keep those gates.',
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
  'appStatus.friendly.previewLoadTitle': 'Preview couldn’t load',
  'appStatus.friendly.previewLoadBody':
    'The live preview didn’t open. Try reload — or ask Agent to check the project setup.',
  'appStatus.friendly.brokeTitle': 'Something broke on this screen',
  'appStatus.friendly.missingPropBody':
    'A piece of the page was missing when the app tried to use it{{where}}. Agent can usually fix this quickly.',
  'appStatus.friendly.moduleBody':
    'The app looked for a file or piece that wasn’t there{{where}}.',
  'appStatus.friendly.hydratBody':
    'The page didn’t match what React expected when it loaded{{where}}.',
  'appStatus.friendly.networkTitle': 'The app couldn’t reach the server',
  'appStatus.friendly.networkBody':
    'A request from the preview failed. This can be a missing API or a temporary network issue.',
  'appStatus.friendly.rateLimitTitle': 'Too many requests — wait a minute',
  'appStatus.friendly.rateLimitBody':
    'Grok was asked too often. This is not a preview crash — wait, then continue building.',
  'appStatus.friendly.genericBody':
    'The preview hit a problem. Open Technical details if you want the exact message.',
  'appStatus.friendly.genericBodyWhere':
    'The preview hit a problem{{where}}. Open Technical details if you want the exact message.',
  'appStatus.validateReloadHint': 'Reload the preview to validate the fix.',
  'appStatus.validateReloadCta': 'Reload preview',
  'appStatus.looksFixed': 'Looks fixed.',
  'appStatus.ndmNudge': 'Tip: start with Verify next time.',
  'appStatus.time.justNow': 'just now',
  'appStatus.time.secondsAgo': '{{count}}s ago',
  'appStatus.time.minutesAgo': '{{count}}m ago',
  'appStatus.time.hoursAgo': '{{count}}h ago',
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
  'chat.thinking': 'Réflexion…',
  'chat.interruptVoice': 'Couper la voix Grok',
  'chat.voiceStopped': 'Lecture vocale et dictée en attente arrêtées.',
  'chat.stayHint': 'On reste en Chat — continue à brainstormer.',
  'chat.goNeedsAgent': 'Go nécessite le mode Agent — bascule ou utilise le sélecteur Agent',
  'chat.goAgentTitle': 'Go : Grok Code écrit les fichiers dans le projet',
  'chat.openTalkOn':
    'Open talk activé — parle naturellement. J’attends au moins 10 s pendant que tu parles, puis 3 s après une pause, puis j’envoie.',
  'chat.openTalkError': 'Open talk : {{error}}',
  'chat.openTalkMicDenied': 'Open talk : autorise le micro pour ce site.',
  'chat.speechUnsupported': 'La reconnaissance vocale n’est pas prise en charge dans ce navigateur.',
  'chat.openTalkStartFailed': 'Impossible de démarrer Open talk — vérifie les permissions du navigateur.',
  'chat.status.chat': 'Chat · brainstorm',
  'chat.status.agent': 'Agent · code',
  'chat.idle.chat':
    'Mode Chat — brainstorm & plan. Passe en Agent pour construire ou modifier du code.',
  'chat.idle.agent':
    'Mode Agent — Go lance Grok Code et écrit les fichiers. Passe en Chat pour brainstormer sans tokens agent.',
  'chat.switchPrompt':
    'Tu es en **Chat** (brainstorm & plan) — je n’écris pas de fichiers ni ne lance l’agent de code pendant qu’on parle.{{discovery}}\n\nPasser en **Agent** pour {{kind}} ?',
  'chat.switchKind.debug': 'déboguer',
  'chat.switchKind.ui': 'générer l’UI',
  'chat.switchKind.implement': 'implémenter',
  'chat.switchDiscovery':
    ' La Discovery est encore ouverte — Agent gardera ces garde-fous.',
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
  'appStatus.friendly.previewLoadTitle': 'L’aperçu n’a pas pu charger',
  'appStatus.friendly.previewLoadBody':
    'L’aperçu live ne s’est pas ouvert. Recharge — ou demande à Agent de vérifier le projet.',
  'appStatus.friendly.brokeTitle': 'Un problème sur cet écran',
  'appStatus.friendly.missingPropBody':
    'Un élément de la page manquait quand l’app a essayé de l’utiliser{{where}}. Agent peut souvent corriger vite.',
  'appStatus.friendly.moduleBody':
    'L’app cherchait un fichier ou un morceau introuvable{{where}}.',
  'appStatus.friendly.hydratBody':
    'La page ne correspondait pas à ce que React attendait au chargement{{where}}.',
  'appStatus.friendly.networkTitle': 'L’app n’a pas atteint le serveur',
  'appStatus.friendly.networkBody':
    'Une requête de l’aperçu a échoué. Clé API manquante ou réseau temporaire possible.',
  'appStatus.friendly.rateLimitTitle': 'Trop de requêtes — attendez une minute',
  'appStatus.friendly.rateLimitBody':
    'Grok a été sollicité trop souvent. Ce n’est pas un crash de l’aperçu — attendez, puis continuez.',
  'appStatus.friendly.genericBody':
    'L’aperçu a rencontré un problème. Ouvre Détails techniques pour le message exact.',
  'appStatus.friendly.genericBodyWhere':
    'L’aperçu a rencontré un problème{{where}}. Ouvre Détails techniques pour le message exact.',
  'appStatus.validateReloadHint': 'Recharge l’aperçu pour valider la correction.',
  'appStatus.validateReloadCta': 'Recharger l’aperçu',
  'appStatus.looksFixed': 'Ça a l’air corrigé.',
  'appStatus.ndmNudge': 'Astuce : commence par Vérifier la prochaine fois.',
  'appStatus.time.justNow': 'à l’instant',
  'appStatus.time.secondsAgo': 'il y a {{count}} s',
  'appStatus.time.minutesAgo': 'il y a {{count}} min',
  'appStatus.time.hoursAgo': 'il y a {{count}} h',
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
  'chat.thinking': 'Sto pensando…',
  'chat.interruptVoice': 'Interrompi voce Grok',
  'chat.voiceStopped': 'Riproduzione vocale e dettatura in sospeso interrotte.',
  'chat.stayHint': 'Resto in Chat — continua a fare brainstorm.',
  'chat.goNeedsAgent': 'Go richiede la modalità Agent — passa ad Agent o usa il selettore',
  'chat.goAgentTitle': 'Go: Grok Code scrive i file nel workspace',
  'chat.openTalkOn':
    'Open talk attivo — parla naturalmente. Aspetto almeno 10s mentre parli, poi 3s dopo una pausa, poi invio.',
  'chat.openTalkError': 'Open talk: {{error}}',
  'chat.openTalkMicDenied': 'Open talk: consenti il microfono per questo sito.',
  'chat.speechUnsupported': 'Il riconoscimento vocale non è supportato in questo browser.',
  'chat.openTalkStartFailed': 'Impossibile avviare Open talk — controlla i permessi del browser.',
  'chat.status.chat': 'Chat · brainstorm',
  'chat.status.agent': 'Agent · codice',
  'chat.idle.chat':
    'Modalità Chat — brainstorm e piano. Passa ad Agent per costruire o modificare codice.',
  'chat.idle.agent':
    'Modalità Agent — Go esegue Grok Code e scrive file. Passa a Chat per brainstorm senza token agent.',
  'chat.switchPrompt':
    'Sei in **Chat** (brainstorm e piano) — non scrivo file né avvio l’agent di coding mentre parliamo.{{discovery}}\n\nPassare ad **Agent** per {{kind}}?',
  'chat.switchKind.debug': 'eseguire debug',
  'chat.switchKind.ui': 'generare UI',
  'chat.switchKind.implement': 'implementare',
  'chat.switchDiscovery':
    ' La Discovery è ancora aperta — Agent manterrà quei vincoli.',
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
  'appStatus.friendly.previewLoadTitle': 'Anteprima non caricata',
  'appStatus.friendly.previewLoadBody':
    'L’anteprima live non si è aperta. Ricarica — o chiedi ad Agent di controllare il progetto.',
  'appStatus.friendly.brokeTitle': 'Qualcosa non va su questa schermata',
  'appStatus.friendly.missingPropBody':
    'Mancava un pezzo della pagina quando l’app ha cercato di usarlo{{where}}. Agent di solito sistema in fretta.',
  'appStatus.friendly.moduleBody':
    'L’app cercava un file o un pezzo che non c’era{{where}}.',
  'appStatus.friendly.hydratBody':
    'La pagina non corrispondeva a ciò che React si aspettava al caricamento{{where}}.',
  'appStatus.friendly.networkTitle': 'L’app non ha raggiunto il server',
  'appStatus.friendly.networkBody':
    'Una richiesta dall’anteprima è fallita. Può essere un’API mancante o un problema di rete temporaneo.',
  'appStatus.friendly.rateLimitTitle': 'Troppe richieste — attendi un minuto',
  'appStatus.friendly.rateLimitBody':
    'Grok è stato chiamato troppe volte. Non è un crash dell’anteprima — attendi, poi continua.',
  'appStatus.friendly.genericBody':
    'L’anteprima ha avuto un problema. Apri Dettagli tecnici per il messaggio esatto.',
  'appStatus.friendly.genericBodyWhere':
    'L’anteprima ha avuto un problema{{where}}. Apri Dettagli tecnici per il messaggio esatto.',
  'appStatus.validateReloadHint': 'Ricarica l’anteprima per validare la correzione.',
  'appStatus.validateReloadCta': 'Ricarica anteprima',
  'appStatus.looksFixed': 'Sembra sistemato.',
  'appStatus.ndmNudge': 'Suggerimento: la prossima volta inizia da Verify.',
  'appStatus.time.justNow': 'adesso',
  'appStatus.time.secondsAgo': '{{count}}s fa',
  'appStatus.time.minutesAgo': '{{count}}m fa',
  'appStatus.time.hoursAgo': '{{count}}h fa',
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
  'chat.thinking': 'Pensando…',
  'chat.interruptVoice': 'Interrumpir voz de Grok',
  'chat.voiceStopped': 'Se detuvo la voz y cualquier dictado pendiente.',
  'chat.stayHint': 'Sigues en Chat — sigue haciendo brainstorm.',
  'chat.goNeedsAgent': 'Go necesita el modo Agent — cambia o usa el selector Agent',
  'chat.goAgentTitle': 'Go: Grok Code escribe archivos en el workspace',
  'chat.openTalkOn':
    'Open talk activo — habla con naturalidad. Espero al menos 10s mientras hablas, luego 3s tras una pausa, y envío.',
  'chat.openTalkError': 'Open talk: {{error}}',
  'chat.openTalkMicDenied': 'Open talk: permite el micrófono para este sitio.',
  'chat.speechUnsupported': 'El reconocimiento de voz no es compatible con este navegador.',
  'chat.openTalkStartFailed': 'No se pudo iniciar Open talk — revisa los permisos del navegador.',
  'chat.status.chat': 'Chat · brainstorm',
  'chat.status.agent': 'Agent · código',
  'chat.idle.chat':
    'Modo Chat — brainstorm y plan. Pasa a Agent para construir o editar código.',
  'chat.idle.agent':
    'Modo Agent — Go ejecuta Grok Code y escribe archivos. Pasa a Chat para brainstorm sin tokens de agent.',
  'chat.switchPrompt':
    'Estás en **Chat** (brainstorm y plan) — no escribiré archivos ni ejecutaré el agent de código mientras hablamos.{{discovery}}\n\n¿Cambiar a **Agent** para {{kind}}?',
  'chat.switchKind.debug': 'depurar',
  'chat.switchKind.ui': 'generar UI',
  'chat.switchKind.implement': 'implementar',
  'chat.switchDiscovery':
    ' Discovery sigue abierta — Agent mantendrá esas barreras.',
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
  'appStatus.friendly.previewLoadTitle': 'La vista previa no cargó',
  'appStatus.friendly.previewLoadBody':
    'La vista previa en vivo no se abrió. Recarga — o pide a Agent que revise el proyecto.',
  'appStatus.friendly.brokeTitle': 'Algo falló en esta pantalla',
  'appStatus.friendly.missingPropBody':
    'Faltaba una parte de la página cuando la app intentó usarla{{where}}. Agent suele arreglarlo rápido.',
  'appStatus.friendly.moduleBody':
    'La app buscó un archivo o pieza que no estaba{{where}}.',
  'appStatus.friendly.hydratBody':
    'La página no coincidió con lo que React esperaba al cargar{{where}}.',
  'appStatus.friendly.networkTitle': 'La app no pudo llegar al servidor',
  'appStatus.friendly.networkBody':
    'Falló una petición de la vista previa. Puede ser una API faltante o un problema de red temporal.',
  'appStatus.friendly.rateLimitTitle': 'Demasiadas solicitudes — espera un minuto',
  'appStatus.friendly.rateLimitBody':
    'Grok recibió demasiadas peticiones. No es un fallo de la vista previa — espera y sigue construyendo.',
  'appStatus.friendly.genericBody':
    'La vista previa tuvo un problema. Abre Detalles técnicos para el mensaje exacto.',
  'appStatus.friendly.genericBodyWhere':
    'La vista previa tuvo un problema{{where}}. Abre Detalles técnicos para el mensaje exacto.',
  'appStatus.validateReloadHint': 'Recarga la vista previa para validar la corrección.',
  'appStatus.validateReloadCta': 'Recargar vista previa',
  'appStatus.looksFixed': 'Parece corregido.',
  'appStatus.ndmNudge': 'Consejo: la próxima vez empieza por Verify.',
  'appStatus.time.justNow': 'ahora',
  'appStatus.time.secondsAgo': 'hace {{count}} s',
  'appStatus.time.minutesAgo': 'hace {{count}} min',
  'appStatus.time.hoursAgo': 'hace {{count}} h',
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
  'chat.thinking': 'Denke nach…',
  'chat.interruptVoice': 'Grok-Stimme unterbrechen',
  'chat.voiceStopped': 'Sprachwiedergabe und ausstehende Diktate gestoppt.',
  'chat.stayHint': 'Bleibe im Chat — weiter brainstormen.',
  'chat.goNeedsAgent': 'Go braucht den Agent-Modus — wechsle oder nutze den Agent-Schalter',
  'chat.goAgentTitle': 'Go: Grok Code schreibt Dateien in den Workspace',
  'chat.openTalkOn':
    'Open talk an — sprich natürlich. Ich warte mind. 10s während du sprichst, dann 3s nach einer Pause, dann sende ich.',
  'chat.openTalkError': 'Open talk: {{error}}',
  'chat.openTalkMicDenied': 'Open talk: Mikrofon für diese Seite erlauben.',
  'chat.speechUnsupported': 'Spracherkennung wird in diesem Browser nicht unterstützt.',
  'chat.openTalkStartFailed': 'Open talk konnte nicht starten — Browser-Berechtigungen prüfen.',
  'chat.status.chat': 'Chat · Brainstorming',
  'chat.status.agent': 'Agent · Coding',
  'chat.idle.chat':
    'Chat-Modus — brainstormen & planen. Wechsle zu Agent, um Code zu bauen oder zu ändern.',
  'chat.idle.agent':
    'Agent-Modus — Go führt Grok Code aus und schreibt Dateien. Wechsle zu Chat zum Brainstormen ohne Agent-Tokens.',
  'chat.switchPrompt':
    'Du bist im **Chat** (Brainstorm & Plan) — ich schreibe keine Dateien und starte keinen Coding-Agenten während wir sprechen.{{discovery}}\n\nZu **Agent** wechseln, um zu {{kind}}?',
  'chat.switchKind.debug': 'debuggen',
  'chat.switchKind.ui': 'UI generieren',
  'chat.switchKind.implement': 'implementieren',
  'chat.switchDiscovery':
    ' Discovery ist noch offen — Agent behält diese Gates.',
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
  'appStatus.friendly.previewLoadTitle': 'Vorschau konnte nicht laden',
  'appStatus.friendly.previewLoadBody':
    'Die Live-Vorschau hat nicht geöffnet. Neu laden — oder Agent bitten, das Projekt zu prüfen.',
  'appStatus.friendly.brokeTitle': 'Etwas ist auf diesem Bildschirm kaputt',
  'appStatus.friendly.missingPropBody':
    'Ein Teil der Seite fehlte, als die App ihn nutzen wollte{{where}}. Agent kann das meist schnell beheben.',
  'appStatus.friendly.moduleBody':
    'Die App suchte eine Datei oder ein Stück, das nicht da war{{where}}.',
  'appStatus.friendly.hydratBody':
    'Die Seite stimmte nicht mit dem überein, was React beim Laden erwartete{{where}}.',
  'appStatus.friendly.networkTitle': 'Die App erreichte den Server nicht',
  'appStatus.friendly.networkBody':
    'Eine Anfrage aus der Vorschau ist fehlgeschlagen. Fehlende API oder temporäres Netzwerk möglich.',
  'appStatus.friendly.rateLimitTitle': 'Zu viele Anfragen — eine Minute warten',
  'appStatus.friendly.rateLimitBody':
    'Grok wurde zu oft aufgerufen. Das ist kein Vorschau-Absturz — warten, dann weiterbauen.',
  'appStatus.friendly.genericBody':
    'Die Vorschau hatte ein Problem. Öffne Technische Details für die genaue Meldung.',
  'appStatus.friendly.genericBodyWhere':
    'Die Vorschau hatte ein Problem{{where}}. Öffne Technische Details für die genaue Meldung.',
  'appStatus.validateReloadHint': 'Lade die Vorschau neu, um den Fix zu validieren.',
  'appStatus.validateReloadCta': 'Vorschau neu laden',
  'appStatus.looksFixed': 'Sieht behoben aus.',
  'appStatus.ndmNudge': 'Tipp: beginne nächstes Mal mit Verify.',
  'appStatus.time.justNow': 'gerade eben',
  'appStatus.time.secondsAgo': 'vor {{count}} s',
  'appStatus.time.minutesAgo': 'vor {{count}} Min.',
  'appStatus.time.hoursAgo': 'vor {{count}} Std.',
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
  en: { ...enCommon, ...enChat, ...enAppStatus, ...enSettings, ...IDE_CATALOGS.en },
  fr: { ...frCommon, ...frChat, ...frAppStatus, ...frSettings, ...IDE_CATALOGS.fr },
  it: { ...itCommon, ...itChat, ...itAppStatus, ...itSettings, ...IDE_CATALOGS.it },
  es: { ...esCommon, ...esChat, ...esAppStatus, ...esSettings, ...IDE_CATALOGS.es },
  de: { ...deCommon, ...deChat, ...deAppStatus, ...deSettings, ...IDE_CATALOGS.de },
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
