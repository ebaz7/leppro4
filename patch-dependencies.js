import fs from 'fs';
import path from 'path';

// 1. Patch @capgo/capacitor-share-target build.gradle
const filePath = path.join(process.cwd(), 'node_modules/@capgo/capacitor-share-target/android/build.gradle');
try {
  if (fs.existsSync(filePath)) {
    console.log(`Patching @capgo/capacitor-share-target/android/build.gradle at: ${filePath}`);
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes("classpath 'com.android.tools.build:gradle:8.13.0'")) {
      content = content.replace(
        "classpath 'com.android.tools.build:gradle:8.13.0'",
        "classpath 'com.android.tools.build:gradle:8.2.1'"
      );
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Successfully patched build.gradle to use AGP 8.2.1!');
    } else {
      console.log('AGP 8.13.0 classpath not found, or already patched.');
    }
  }
} catch (error) {
  console.error('Error while patching @capgo/capacitor-share-target build.gradle:', error);
}

// 2. Patch whatsapp-web.js for WhatsApp Web 2025/2026 compatibility (hasSynced race, sendSeen crash, GroupMetadata & getChat resilience)
const wwebClientPath = path.join(process.cwd(), 'node_modules/whatsapp-web.js/src/Client.js');
try {
  if (fs.existsSync(wwebClientPath)) {
    let clientContent = fs.readFileSync(wwebClientPath, 'utf8');
    let modified = false;

    // 2a. Guard WAWebSyncGatingUtils in attachEventListeners so read-only/missing module never aborts READY
    const oldGating = `const gatingUtils = window.require('WAWebSyncGatingUtils');\n            gatingUtils.isPlaceholderMessageResendEnabled = () => true;`;
    const newGating = `try { const gatingUtils = window.require('WAWebSyncGatingUtils'); if (gatingUtils) gatingUtils.isPlaceholderMessageResendEnabled = () => true; } catch (e) {}`;
    if (clientContent.includes(oldGating)) {
      clientContent = clientContent.replace(oldGating, newGating);
      modified = true;
    }

    // 2b. Guard WAWebCallCollection in attachEventListeners
    const oldCallCol = `const WAWebCallCollection = window.require('WAWebCallCollection');`;
    const newCallCol = `let WAWebCallCollection = null; try { WAWebCallCollection = window.require('WAWebCallCollection'); } catch (e) {}`;
    if (clientContent.includes(oldCallCol) && !clientContent.includes(`let WAWebCallCollection = null;`)) {
      clientContent = clientContent.replace(oldCallCol, newCallCol);
      modified = true;
    }

    // 2c. Trigger onAppStateHasSyncedEvent immediately if Socket.hasSynced is already true when inject() attaches listeners
    const oldHasSynced = `.Socket.on('change:hasSynced', () => {\n                    window.onAppStateHasSyncedEvent();\n                });`;
    const newHasSynced = `.Socket.on('change:hasSynced', () => {\n                    window.onAppStateHasSyncedEvent();\n                });\n            if (window.require('WAWebSocketModel').Socket.hasSynced) {\n                setTimeout(() => window.onAppStateHasSyncedEvent(), 100);\n            }`;
    if (clientContent.includes(oldHasSynced) && !clientContent.includes(`if (window.require('WAWebSocketModel').Socket.hasSynced)`)) {
      clientContent = clientContent.replace(oldHasSynced, newHasSynced);
      modified = true;
    }

    // 2d. Guard sendSeen and getMessageModel inside Client.prototype.sendMessage
    const oldSendSeenBlock = `if (sendSeen) {\n                    await window.WWebJS.sendSeen(chatId);\n                }`;
    const newSendSeenBlock = `if (sendSeen) {\n                    try { await window.WWebJS.sendSeen(chatId); } catch (e) {}\n                }`;
    if (clientContent.includes(oldSendSeenBlock)) {
      clientContent = clientContent.replace(oldSendSeenBlock, newSendSeenBlock);
      modified = true;
    }

    const oldGetMsgModel = `return msg ? window.WWebJS.getMessageModel(msg) : undefined;`;
    const newGetMsgModel = `try { return msg ? window.WWebJS.getMessageModel(msg) : undefined; } catch (e) { return msg && msg.id ? { id: msg.id } : undefined; }`;
    if (clientContent.includes(oldGetMsgModel)) {
      clientContent = clientContent.replace(oldGetMsgModel, newGetMsgModel);
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(wwebClientPath, clientContent, 'utf8');
      console.log('Successfully patched whatsapp-web.js/src/Client.js!');
    }
  }
} catch (error) {
  console.error('Error while patching whatsapp-web.js/src/Client.js:', error);
}

const wwebUtilsPath = path.join(process.cwd(), 'node_modules/whatsapp-web.js/src/util/Injected/Utils.js');
try {
  if (fs.existsSync(wwebUtilsPath)) {
    let utilsContent = fs.readFileSync(wwebUtilsPath, 'utf8');
    let modified = false;

    // Wrap sendSeen in try/catch
    const oldSendSeen = `window.WWebJS.sendSeen = async (chatId) => {\n        const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });\n        if (chat) {\n            window.require('WAWebStreamModel').Stream.markAvailable();\n            await window.require('WAWebUpdateUnreadChatAction').sendSeen({\n                chat: chat,\n                threadId: undefined,\n            });\n            window.require('WAWebStreamModel').Stream.markUnavailable();\n            return true;\n        }\n        return false;\n    };`;
    const newSendSeen = `window.WWebJS.sendSeen = async (chatId) => {\n        try {\n            const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });\n            if (chat) {\n                try { window.require('WAWebStreamModel').Stream.markAvailable(); } catch (e) {}\n                await window.require('WAWebUpdateUnreadChatAction').sendSeen({\n                    chat: chat,\n                    threadId: undefined,\n                });\n                try { window.require('WAWebStreamModel').Stream.markUnavailable(); } catch (e) {}\n                return true;\n            }\n        } catch (e) {}\n        return false;\n    };`;
    if (utilsContent.includes(oldSendSeen)) {
      utilsContent = utilsContent.replace(oldSendSeen, newSendSeen);
      modified = true;
    }

    // Improve getChat to support Chat.find and GroupMetadata.update
    const oldGetChatElse = `        } else {\n            chat =\n                window.require('WAWebCollections').Chat.get(chatWid) ||\n                (\n                    await window\n                        .require('WAWebFindChatAction')\n                        .findOrCreateLatestChat(chatWid)\n                )?.chat;\n        }`;
    const newGetChatElse = `        } else {\n            const ChatCol = window.require('WAWebCollections').Chat;\n            chat = ChatCol.get(chatWid);\n            if (!chat) {\n                try {\n                    const found = await window.require('WAWebFindChatAction').findOrCreateLatestChat(chatWid);\n                    chat = found?.chat || found;\n                } catch (e) {}\n            }\n            if (!chat && typeof ChatCol.find === 'function') {\n                try { chat = await ChatCol.find(chatWid); } catch (e) {}\n            }\n            if (chat && typeof chatWid.isGroup === 'function' && chatWid.isGroup()) {\n                try { await window.require('WAWebCollections').GroupMetadata.update(chatWid); } catch (e) {}\n            }\n        }`;
    if (utilsContent.includes(oldGetChatElse)) {
      utilsContent = utilsContent.replace(oldGetChatElse, newGetChatElse);
      modified = true;
    }

    // Fix PDF & Image media sending in sendMessage, processMediaData & getMessageModel for whatsapp-web.js@1.34.7
    const oldMediaPrep134 = `            mediaOptions.caption = options.caption;\n            content = options.sendMediaAsSticker\n                ? undefined\n                : mediaOptions.preview;\n            mediaOptions.isViewOnce = options.isViewOnce;\n            delete options.media;\n            delete options.sendMediaAsSticker;`;
    const newMediaPrep134 = `            const inputFilename = options.media.filename;\n            mediaOptions.caption = options.caption;\n            content = options.sendMediaAsSticker\n                ? undefined\n                : (mediaOptions.preview ?? '');\n            if (inputFilename && !mediaOptions.filename) {\n                try { mediaOptions.filename = inputFilename; } catch (e) {}\n            }\n            mediaOptions.isViewOnce = options.isViewOnce;\n            delete options.media;\n            delete options.sendMediaAsSticker;`;
    if (utilsContent.includes(oldMediaPrep134)) {
      utilsContent = utilsContent.replace(oldMediaPrep134, newMediaPrep134);
      modified = true;
    }

    const oldLinkPreview134 = `        if (options.linkPreview) {\n            delete options.linkPreview;\n            const link = findLink(content);`;
    const newLinkPreview134 = `        if (options.linkPreview) {\n            delete options.linkPreview;\n            let link = null;\n            try {\n                link = typeof content === 'string' && content ? findLink(content) : null;\n            } catch (e) { link = null; }`;
    if (utilsContent.includes(oldLinkPreview134)) {
      utilsContent = utilsContent.replace(oldLinkPreview134, newLinkPreview134);
      modified = true;
    }

    const oldMediaBlob134 = `        if (!(mediaData.mediaBlob instanceof OpaqueData)) {\n            mediaData.mediaBlob = await OpaqueData.createFromData(\n                mediaData.mediaBlob,\n                mediaData.mediaBlob.type,\n            );\n        }\n\n        mediaData.renderableUrl = mediaData.mediaBlob.url();\n        mediaObject.consolidate(mediaData.toJSON());\n\n        mediaData.mediaBlob.autorelease();\n        const shouldUseMediaCache = window\n            .require('WAWebMediaDataUtils')\n            .shouldUseMediaCache(\n                window.require('WAWebMmsMediaTypes').castToV4(mediaObject.type),\n            );\n        if (shouldUseMediaCache && mediaData.mediaBlob instanceof OpaqueData) {\n            const formData = mediaData.mediaBlob.formData();\n            window\n                .require('WAWebMediaInMemoryBlobCache')\n                .InMemoryMediaBlobCache.put(mediaObject.filehash, formData);\n        }`;
    const newMediaBlob134 = `        if (mediaData.mediaBlob && !(mediaData.mediaBlob instanceof OpaqueData)) {\n            mediaData.mediaBlob = await OpaqueData.createFromData(\n                mediaData.mediaBlob,\n                mediaData.mediaBlob.type || mediaInfo.mimetype,\n            );\n        }\n\n        mediaData.renderableUrl = mediaData.mediaBlob && typeof mediaData.mediaBlob.url === 'function' ? mediaData.mediaBlob.url() : '';\n        mediaObject.consolidate(mediaData.toJSON());\n\n        try {\n            if (mediaData.mediaBlob && typeof mediaData.mediaBlob.autorelease === 'function') {\n                mediaData.mediaBlob.autorelease();\n            }\n        } catch (e) {}\n        try {\n            const shouldUseMediaCache = window\n                .require('WAWebMediaDataUtils')\n                .shouldUseMediaCache(\n                    window.require('WAWebMmsMediaTypes').castToV4(mediaObject.type),\n                );\n            if (\n                shouldUseMediaCache &&\n                mediaData.mediaBlob instanceof OpaqueData &&\n                typeof mediaData.mediaBlob.formData === 'function'\n            ) {\n                const formData = mediaData.mediaBlob.formData();\n                window\n                    .require('WAWebMediaInMemoryBlobCache')\n                    .InMemoryMediaBlobCache.put(mediaObject.filehash, formData);\n            }\n        } catch (e) {}`;
    if (utilsContent.includes(oldMediaBlob134)) {
      utilsContent = utilsContent.replace(oldMediaBlob134, newMediaBlob134);
      modified = true;
    }

    const oldFindLinks134 = `        msg.links = findLinks(\n            message.mediaObject ? message.caption : message.body,\n        ).map((link) => ({\n            link: link.href,\n            isSuspicious: Boolean(\n                link.suspiciousCharacters && link.suspiciousCharacters.size,\n            ),\n        }));`;
    const newFindLinks134 = `        try {\n            const textForLinks = (message.mediaObject ? message.caption : message.body) || '';\n            msg.links = (typeof textForLinks === 'string' && textForLinks ? findLinks(textForLinks) : []).map((link) => ({\n                link: link.href,\n                isSuspicious: Boolean(\n                    link.suspiciousCharacters && link.suspiciousCharacters.size,\n                ),\n            }));\n        } catch (e) {\n            msg.links = [];\n        }`;
    if (utilsContent.includes(oldFindLinks134)) {
      utilsContent = utilsContent.replace(oldFindLinks134, newFindLinks134);
      modified = true;
    }

    const oldMediaInfoToFile = `    window.WWebJS.mediaInfoToFile = ({ data, mimetype, filename }) => {\n        const binaryData = window.atob(data);\n\n        const buffer = new ArrayBuffer(binaryData.length);\n        const view = new Uint8Array(buffer);\n        for (let i = 0; i < binaryData.length; i++) {\n            view[i] = binaryData.charCodeAt(i);\n        }\n\n        const blob = new Blob([buffer], { type: mimetype });\n        return new File([blob], filename, {`;
    const newMediaInfoToFile = `    window.WWebJS.mediaInfoToFile = ({ data, mimetype, filename }) => {\n        const binaryData = window.atob(data);\n\n        const buffer = new ArrayBuffer(binaryData.length);\n        const view = new Uint8Array(buffer);\n        for (let i = 0; i < binaryData.length; i++) {\n            view[i] = binaryData.charCodeAt(i);\n        }\n\n        const safeFilename = filename || (String(mimetype || '').startsWith('image/') ? 'image.png' : 'document.pdf');\n        const blob = new Blob([buffer], { type: mimetype });\n        return new File([blob], safeFilename, {`;
    if (utilsContent.includes(oldMediaInfoToFile)) {
      utilsContent = utilsContent.replace(oldMediaInfoToFile, newMediaInfoToFile);
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(wwebUtilsPath, utilsContent, 'utf8');
      console.log('Successfully patched whatsapp-web.js/src/util/Injected/Utils.js!');
    }
  }
} catch (error) {
  console.error('Error while patching whatsapp-web.js/src/util/Injected/Utils.js:', error);
}

console.log('Dependencies patched successfully.');

