
import https from 'https';
import FormData from 'form-data';
import * as BotCore from './bot-core.js';
import { getDb } from './db-manager.js';

let pollingActive = false;
let lastOffset = 0;
let botToken = null;

const ensureBaleActive = () => {
    if (!botToken) {
        try {
            const token = getDb()?.settings?.baleBotToken;
            if (token) {
                initBaleBot(token);
            }
        } catch (e) {
            console.error("Auto init Bale failed:", e.message);
        }
    }
};

const callApi = (method, data, isMultipart = false) => {
    return new Promise((resolve, reject) => {
        if (!botToken) return reject(new Error("No Token"));
        let headers = { 'Content-Type': 'application/json' };
        if (isMultipart && data) {
            headers = data.getHeaders ? data.getHeaders() : {};
            try {
                if (typeof data.getLengthSync === 'function') {
                    const len = data.getLengthSync();
                    if (typeof len === 'number' && len > 0) {
                        headers['Content-Length'] = len;
                    }
                }
            } catch (e) {}
        }
        const options = {
            hostname: 'tapi.bale.ai',
            path: `/bot${botToken}/${method}`,
            method: 'POST',
            headers,
            timeout: 25000 // 25 seconds timeout
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (parsed && parsed.ok === false) {
                        return reject(new Error(parsed.description || `خطای بله: ${parsed.error_code || 'نامشخص'}`));
                    }
                    resolve(parsed);
                } catch(e) {
                    resolve({ raw: body });
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error("Request timeout"));
        });

        if (isMultipart) data.pipe(req);
        else {
            if(data) req.write(JSON.stringify(data));
            req.end();
        }
    });
};

const downloadBaleFile = async (filePath) => {
    if (!filePath) throw new Error("آدرس فایل در سرور بله یافت نشد.");
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const urlsToTry = [
        `https://tapi.bale.ai/file/bot${botToken}/${cleanPath}`,
        `https://tapi.bale.ai/file/bot${botToken}/${filePath}`,
        `https://tapi.bale.ai/bot${botToken}/getFile/${cleanPath}`
    ];

    let lastError = null;

    for (const urlStr of urlsToTry) {
        try {
            const buf = await new Promise((resolve, reject) => {
                const urlObj = new URL(urlStr);
                const req = https.request({
                    hostname: urlObj.hostname,
                    port: urlObj.port || 443,
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': '*/*'
                    },
                    timeout: 30000
                }, (res) => {
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        const redirectUrl = res.headers.location.startsWith('http') 
                            ? res.headers.location 
                            : `https://${urlObj.hostname}${res.headers.location}`;
                        const redObj = new URL(redirectUrl);
                        const redReq = https.request({
                            hostname: redObj.hostname,
                            port: redObj.port || 443,
                            path: redObj.pathname + redObj.search,
                            method: 'GET',
                            headers: { 'User-Agent': 'Mozilla/5.0' },
                            timeout: 30000
                        }, (redRes) => {
                            if (redRes.statusCode !== 200) {
                                return reject(new Error(`HTTP ${redRes.statusCode}`));
                            }
                            const chunks = [];
                            redRes.on('data', c => chunks.push(c));
                            redRes.on('end', () => resolve(Buffer.concat(chunks)));
                        });
                        redReq.on('error', reject);
                        redReq.on('timeout', () => { redReq.destroy(); reject(new Error("Timeout")); });
                        redReq.end();
                        return;
                    }

                    if (res.statusCode !== 200) {
                        return reject(new Error(`HTTP ${res.statusCode}`));
                    }
                    const chunks = [];
                    res.on('data', c => chunks.push(c));
                    res.on('end', () => resolve(Buffer.concat(chunks)));
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error("مهلت زمان دانلود فایل به پایان رسید (Timeout)"));
                });
                req.end();
            });

            if (buf && buf.length > 0) {
                return buf;
            }
        } catch (err) {
            lastError = err;
        }
    }

    // Secondary fallback with axios and custom https agent
    try {
        const axios = (await import('axios')).default;
        const res = await axios.get(urlsToTry[0], {
            responseType: 'arraybuffer',
            timeout: 30000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
        if (res.data) {
            return Buffer.from(res.data);
        }
    } catch (axiosErr) {
        lastError = axiosErr;
    }

    throw lastError || new Error("دانلود فایل از سرور بله ناموفق بود.");
};

export const initBaleBot = (token) => {
    if (!token) {
        pollingActive = false;
        botToken = null;
        return;
    }
    if (botToken === token && pollingActive) return;

    botToken = token;
    
    if (!pollingActive) {
        pollingActive = true;
        poll();
        console.log(">>> Bale Bot Started ✅");
    }

    // Try to set commands for Bale (similar to Telegram)
    callApi('setMyCommands', {
        commands: [
            { command: 'start', description: 'شروع و منوی اصلی' },
            { command: 'menu', description: 'نمایش منو' }
        ]
    }).catch(() => {});
};

const poll = async () => {
    if (!pollingActive) return;
    try {
        const res = await callApi('getUpdates', { offset: lastOffset + 1 });
        if (res.ok && res.result && res.result.length > 0) {
            for (const u of res.result) {
                lastOffset = u.update_id;
                
                const sendFn = (id, txt, opts) => callApi('sendMessage', { chat_id: id, text: txt, ...opts }).catch(e => console.error("Bale Send Err", e.message));
                
                const sendPhotoFn = (platform, id, buffer, caption, opts) => {
                    const safeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
                    const form = new FormData();
                    form.append('chat_id', String(id));
                    form.append('photo', safeBuf, { filename: 'image.png' });
                    form.append('caption', caption || '');
                    if (opts && opts.reply_markup) form.append('reply_markup', JSON.stringify(opts.reply_markup));
                    return callApi('sendPhoto', form, true).catch(e => console.error("Bale Photo Err", e.message));
                };

                // FIXED: Ensure buffer is appended correctly with filename and 3-attempt retry system
                const sendDocFn = async (id, buffer, name, caption, attempt = 1) => {
                    try {
                        const safeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
                        const form = new FormData();
                        form.append('chat_id', String(id));
                        form.append('document', safeBuf, { filename: name || 'document.pdf' });
                        form.append('caption', caption || '');
                        const res = await callApi('sendDocument', form, true);
                        if (!res || !res.ok) {
                            throw new Error(res ? res.description : "Empty reply");
                        }
                        return res;
                    } catch (e) {
                        console.error(`Bale Doc Err (Attempt ${attempt}/3):`, e.message);
                        if (attempt < 3) {
                            await new Promise(r => setTimeout(r, 2000 * attempt));
                            return sendDocFn(id, buffer, name, caption, attempt + 1);
                        }
                        throw e;
                    }
                }

                const checkMembershipFn = async (userId, channelId) => {
                    try {
                        let cleanId = channelId;
                        if (typeof cleanId === 'string' && cleanId.startsWith('@')) {
                            cleanId = cleanId.substring(1);
                        }
                        
                        // First try with original
                        let res = await callApi('getChatMember', { chat_id: channelId, user_id: userId });
                        
                        // If not successful, try without @ prefix which is common in Bale
                        if ((!res || !res.ok) && channelId.toString().startsWith('@')) {
                            res = await callApi('getChatMember', { chat_id: cleanId, user_id: userId });
                        }

                        console.log(`[Bale Membership] User: ${userId}, Channel: ${channelId}, Res Status: ${res && res.result ? res.result.status : 'ERR'}, Full:`, JSON.stringify(res));

                        if (res && res.result && res.result.status) {
                            const status = res.result.status;
                            return ['creator', 'administrator', 'member', 'restricted'].includes(status);
                        }
                        return false;
                    } catch(e) {
                        console.error("[Bale Membership Error]", e.message);
                        return false;
                    }
                };

                try {
                    if (u.message && (u.message.voice || u.message.audio)) {
                        const isPrivate = !u.message.chat?.type || u.message.chat.type === 'private' || (!String(u.message.chat.id).startsWith('-') && !u.message.chat.title);
                        if (!isPrivate) {
                            // CRITICAL PRIVACY PROTECTION: Group audio/voice notes must NEVER be transcribed or replied to publicly
                            continue;
                        }

                        const chatId = u.message.chat.id;
                        const fileId = u.message.voice?.file_id || u.message.audio?.file_id;
                        const mimeType = u.message.voice?.mime_type || u.message.audio?.mime_type || 'audio/ogg';

                        try {
                            const fileInfo = await callApi('getFile', { file_id: fileId });
                            if (fileInfo && fileInfo.ok && fileInfo.result && fileInfo.result.file_path) {
                                const audioBuffer = await downloadBaleFile(fileInfo.result.file_path);

                                const aiModule = await import('./ai-service.js');
                                const result = await aiModule.processVoiceAudio(audioBuffer, mimeType);

                                let replyContent = `🎙️ *متن پیام صوتی شما:*\n«_${result.transcription}_»\n\n🤖 *پاسخ هوش مصنوعی ERP:*\n${result.replyText}`;
                                await sendFn(chatId, replyContent, { parse_mode: 'Markdown' });

                                const triggered = await BotCore.detectAndTriggerReport('bale', chatId, u.message.from?.id || chatId, result.transcription, sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);

                                const userSession = BotCore.sessions[chatId];
                                if (!triggered && userSession && userSession.state !== 'IDLE' && userSession.state !== 'SALES_WAIT_BROADCAST_MSG' && result.transcription) {
                                    await BotCore.handleMessage('bale', chatId, result.transcription, sendFn, sendPhotoFn, sendDocFn, checkMembershipFn, u.message.from?.id || chatId, u.message);
                                }
                            }
                        } catch (voiceErr) {
                            console.error("[Bale Voice Processing Error]:", voiceErr.message);
                            sendFn(chatId, `🎙️ پیام صوتی دریافت شد، اما در پردازش با هوش مصنوعی خطایی رخ داد: ${voiceErr.message}`);
                        }
                        continue;
                    }

                    // Support Photos and Documents (for PDF Merger and Secretariat Letters) in Bale
                    if (u.message && (u.message.photo || u.message.document)) {
                        const isPrivate = !u.message.chat?.type || u.message.chat.type === 'private' || (!String(u.message.chat.id).startsWith('-') && !u.message.chat.title);
                        const chatId = u.message.chat.id;
                        const hasActiveSession = BotCore.sessions[chatId] && BotCore.sessions[chatId].state !== 'IDLE';

                        if (isPrivate || hasActiveSession) {
                            let fileId = null;
                            let fileName = null;
                            let fileType = 'image';

                            if (u.message.photo) {
                                const photo = Array.isArray(u.message.photo) ? u.message.photo[u.message.photo.length - 1] : u.message.photo;
                                fileId = photo.file_id;
                                fileName = `photo_${Date.now()}.jpg`;
                                fileType = 'image';
                            } else if (u.message.document) {
                                fileId = u.message.document.file_id;
                                fileName = u.message.document.file_name || `document_${Date.now()}`;
                                const isPdf = (u.message.document.mime_type === 'application/pdf') || (fileName && fileName.toLowerCase().endsWith('.pdf'));
                                fileType = isPdf ? 'pdf' : 'image';
                            }

                            if (fileId) {
                                try {
                                    const fileInfo = await callApi('getFile', { file_id: fileId });
                                    if (fileInfo && fileInfo.ok && fileInfo.result && fileInfo.result.file_path) {
                                        const fileBuffer = await downloadBaleFile(fileInfo.result.file_path);

                                        await BotCore.handleIncomingFile('bale', chatId, u.message.from?.id || chatId, {
                                            fileId,
                                            fileName,
                                            type: fileType,
                                            buffer: fileBuffer
                                        }, sendFn, sendPhotoFn, sendDocFn, checkMembershipFn, u.message);
                                    } else {
                                        sendFn(chatId, '⚠️ امکان دریافت مسیر فایل از سرور بله فراهم نشد.');
                                    }
                                } catch (baleFileErr) {
                                    console.error("[Bale File Processing Error]:", baleFileErr);
                                    sendFn(chatId, `⚠️ خطا در دریافت فایل: ${baleFileErr.message}`);
                                }
                            }
                            continue;
                        }
                    }

                    if (u.message && u.message.text) {
                        const text = u.message.text;
                        const chatId = u.message.chat.id;

                        // Allow /id in groups
                        if (text.startsWith('/id') || text === 'آیدی') {
                            sendFn(chatId, `🆔 شناسه این چت: ${chatId}`);
                            continue;
                        }

                        const isDaily = text.toLowerCase().includes('daily') || text.includes('گزارش روزانه');
                        const hasActiveSession = BotCore.sessions[chatId] && BotCore.sessions[chatId].state !== 'IDLE';

                        const senderId = u.message.from ? u.message.from.id : chatId;
                        const isReply = !!u.message.reply_to_message;

                        // Ignore group messages unless it's a command, part of active session, report request, or a reply
                        if (u.message.chat.type && u.message.chat.type !== 'private' && !text.startsWith('/') && !hasActiveSession && !isDaily && !isReply) continue;

                        // Run handling in background to not block the poll loop
                        BotCore.handleMessage('bale', chatId, text, sendFn, sendPhotoFn, sendDocFn, checkMembershipFn, senderId, u.message).catch(e => console.error("Bale Core Handle Err", e));
                    } else if (u.callback_query) {
                        const userId = u.callback_query.from ? u.callback_query.from.id : u.callback_query.message.chat.id;
                        BotCore.handleCallback('bale', u.callback_query.message.chat.id, userId, u.callback_query.data, sendFn, sendPhotoFn, sendDocFn, checkMembershipFn).catch(e => console.error("Bale Callback Err", e));
                    }
                } catch (err) {
                    console.error("Bale Message Handler Error:", err);
                }
            }
        }
    } catch (e) { /* Ignore poll errors */ }
    setTimeout(poll, 2000);
};

export const sendBotMessage = (chatId, text, opts) => {
    ensureBaleActive();
    if (!botToken) {
        const token = getDb()?.settings?.baleBotToken;
        if (token) initBaleBot(token);
    }
    if (!botToken) return Promise.reject(new Error("ربات بله غیرفعال است. لطفاً توکن ربات بله را در «تنظیمات سیستم ⚙️ -> تب ربات‌ها» وارد نمایید."));
    return callApi('sendMessage', { chat_id: chatId, text: text, ...opts });
};

export const sendBotPhoto = (chatId, buffer, caption, opts) => {
    ensureBaleActive();
    if (!botToken) {
        const token = getDb()?.settings?.baleBotToken;
        if (token) initBaleBot(token);
    }
    if (!botToken) return Promise.reject(new Error("ربات بله غیرفعال است. لطفاً توکن ربات بله را در «تنظیمات سیستم ⚙️ -> تب ربات‌ها» وارد نمایید."));
    const safeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const safeCaption = caption && caption.length > 1000 ? caption.slice(0, 995) + '...' : caption;
    const form = new FormData();
    form.append('chat_id', String(chatId));
    const filename = (opts && opts.filename) ? opts.filename : 'image.png';
    form.append('photo', safeBuf, { filename });
    form.append('caption', safeCaption || '');
    if (opts && opts.reply_markup) form.append('reply_markup', JSON.stringify(opts.reply_markup));
    return callApi('sendPhoto', form, true);
};

export const sendBotDocument = (chatId, buffer, name, caption) => {
    ensureBaleActive();
    if (!botToken) {
        const token = getDb()?.settings?.baleBotToken;
        if (token) initBaleBot(token);
    }
    if (!botToken) return Promise.reject(new Error("ربات بله غیرفعال است. لطفاً توکن ربات بله را در «تنظیمات سیستم ⚙️ -> تب ربات‌ها» وارد نمایید."));
    const safeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const safeCaption = caption && caption.length > 1000 ? caption.slice(0, 995) + '...' : caption;
    const contentType = name && name.endsWith('.xlsx')
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : (name && name.endsWith('.csv') ? 'text/csv' : 'application/pdf');
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('document', safeBuf, { filename: name || 'document.pdf', contentType });
    form.append('caption', safeCaption || '');
    return callApi('sendDocument', form, true);
};

export const deleteBotMessage = (chatId, messageId) => {
    return callApi('deleteMessage', { chat_id: chatId, message_id: messageId }).catch(e => console.error("Bale delete error:", e.message));
};
