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

    // Fix PDF document sending in sendMessage & processMediaData (filename preservation, undefined preview, OpaqueData.formData guard, findLinks guard)
    const oldMediaPrep = `            content = options.sendMediaAsSticker ? undefined : mediaOptions.preview;\n            options.isViewOnce = options.isViewOnce ? true : undefined;\n\n            delete options.media;\n            delete options.sendMediaAsSticker;`;
    const newMediaPrep = `            const inputFilename = options.media.filename;\n            content = options.sendMediaAsSticker ? undefined : (mediaOptions.preview ?? '');\n            if (inputFilename && !mediaOptions.filename) {\n                mediaOptions.filename = inputFilename;\n            }\n            options.isViewOnce = options.isViewOnce ? true : undefined;\n\n            delete options.media;\n            delete options.sendMediaAsSticker;`;
    if (utilsContent.includes(oldMediaPrep)) {
      utilsContent = utilsContent.replace(oldMediaPrep, newMediaPrep);
      modified = true;
    }

    const oldLinkPreview = `        if (options.linkPreview) {\n            delete options.linkPreview;\n            const link = window.require('WALinkify').findLink(content);`;
    const newLinkPreview = `        if (options.linkPreview) {\n            delete options.linkPreview;\n            const link = typeof content === 'string' && content ? window.require('WALinkify').findLink(content) : null;`;
    if (utilsContent.includes(oldLinkPreview)) {
      utilsContent = utilsContent.replace(oldLinkPreview, newLinkPreview);
      modified = true;
    }

    const oldMediaCache = `        if (\n            window.require('WAWebMediaDataUtils').shouldUseMediaCache(\n                window.require('WAWebMediaStorage').castToV4(\n                    mediaData.type\n                )\n            )\n        ) {\n            const formData = mediaData.mediaBlob.formData();\n            window.require('WAWebMediaInMemoryStorage').MediaBlobCache.put(\n                mediaData.filehash,\n                formData\n            );\n        }`;
    const newMediaCache = `        try {\n            if (\n                window.require('WAWebMediaDataUtils').shouldUseMediaCache(\n                    window.require('WAWebMediaStorage').castToV4(\n                        mediaData.type\n                    )\n                ) &&\n                mediaData.mediaBlob &&\n                typeof mediaData.mediaBlob.formData === 'function'\n            ) {\n                const formData = mediaData.mediaBlob.formData();\n                window.require('WAWebMediaInMemoryStorage').MediaBlobCache.put(\n                    mediaData.filehash,\n                    formData\n                );\n            }\n        } catch (e) {}`;
    if (utilsContent.includes(oldMediaCache)) {
      utilsContent = utilsContent.replace(oldMediaCache, newMediaCache);
      modified = true;
    }

    const oldFindLinks = `        msg.links = (window.require('WALinkify').findLinks(message.mediaObject ? message.caption : message.body)).map((link) => ({\n            link: link.href,\n            isSuspicious: Boolean(link.suspiciousCharacters && link.suspiciousCharacters.size)\n        }));`;
    const newFindLinks = `        try {\n            const textForLinks = (message.mediaObject ? message.caption : message.body) || '';\n            msg.links = (typeof textForLinks === 'string' && textForLinks ? window.require('WALinkify').findLinks(textForLinks) : []).map((link) => ({\n                link: link.href,\n                isSuspicious: Boolean(link.suspiciousCharacters && link.suspiciousCharacters.size)\n            }));\n        } catch (e) {\n            msg.links = [];\n        }`;
    if (utilsContent.includes(oldFindLinks)) {
      utilsContent = utilsContent.replace(oldFindLinks, newFindLinks);
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

