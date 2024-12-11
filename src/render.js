import { checkAddressStatus } from './helper.js';
import 'telegram-bot-api-jsdoc';
import './types.js';

/**
 * Sends a request to the OpenAI API and returns the first choice.
 * @param {string} key - The API key for authentication.
 * @param {string} endpoint - The endpoint URL for the OpenAI API.
 * @param {string} model - The name of the model to use for completion.
 * @param {string} prompt - The user's prompt for generating completion.
 * @returns {Promise<string>} The completed text from the OpenAI API response.
 */
async function sendOpenAIRequest(key, endpoint, model, prompt) {
    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a professional email summarization assistant.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        }),
    });
    if (!resp.ok) {
        throw new Error(`OpenAI API request failed: ${resp.status}`);
    }
    const body = await resp.json();
    return body?.choices?.[0]?.message?.content || '';
}

/**
 * Render the email list  mode.
 * @param {EmailCache} mail - The email object.
 * @param {Environment} env - The environment object.
 * @returns {Promise<SendMessageParams>} The rendered email list mode object.
 */
export async function renderEmailListMode(mail, env) {
    const {
        DEBUG,
        OPENAI_API_KEY,
        DOMAIN,
    } = env;

    const text = `
${mail.subject}

-----------
From\t:\t${mail.from}
To\t\t:\t${mail.to}
  `;
    const preview = `https://${DOMAIN}/email/${mail.id}?mode=text`;
    const fullHTML = `https://${DOMAIN}/email/${mail.id}?mode=html`;
    const keyboard = [
        {
            text: 'Preview',
            callback_data: `p:${mail.id}`,
        },
        {
            text: 'Text',
            url: preview,
        },
        {
            text: 'HTML',
            url: fullHTML,
        },
    ];

    if (OPENAI_API_KEY) {
        keyboard.splice(1, 0, {
            text: 'Summary',
            callback_data: `s:${mail.id}`,
        });
    }
    if (DEBUG === 'true') {
        keyboard.push({
            text: 'Debug',
            callback_data: `d:${mail.id}`,
        });
    }
    return {
        text,
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [keyboard],
        },
    };
}

/**
 * Render the email detail.
 * @param {string} text - The email text.
 * @param {string} id - The email ID.
 * @returns {SendMessageParams} - The rendered email detail.
 */
function renderEmailDetail(text, id) {
    return {
        text,
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: 'Back',
                        callback_data: `l:${id}`,
                    },
                    {
                        text: 'Delete',
                        callback_data: 'delete',
                    },
                ],
            ],
        },
    };
}

/**
 * Render the email preview  mode.
 * @param {EmailCache} mail - The email object.
 * @param {Environment} env - The environment object.
 * @returns {Promise<SendMessageParams>} The rendered email list mode object.
 */
// eslint-disable-next-line unused-imports/no-unused-vars
export async function renderEmailPreviewMode(mail, env) {
    return renderEmailDetail(mail.text.substring(0, 4096), mail.id);
}

/**
 * Render the email summary  mode.
 * @param {EmailCache} mail - The email object.
 * @param {Environment} env - The environment object.
 * @returns {Promise<SendMessageParams>} The rendered email list mode object.
 */
export async function renderEmailSummaryMode(mail, env) {
    let {
        OPENAI_API_KEY: key,
        OPENAI_COMPLETIONS_API: endpoint,
        OPENAI_CHAT_MODEL: model,
        SUMMARY_TARGET_LANG: targetLang,
    } = env;
    const req = renderEmailDetail('', mail.id);
    endpoint = endpoint || 'https://api.openai.com/v1/chat/completions';
    model = model || 'gpt-4o-mini';
    targetLang = targetLang || 'english';
    const prompt = `Summarize the following email in ${targetLang} ~\n\n${mail.subject}\n\n${mail.text}`;
    req.text = await sendOpenAIRequest(key, endpoint, model, prompt);
    return req;
}

/**
 * Render the email debug  mode.
 * @param {EmailCache} mail - The email object.
 * @param {Environment} env - The environment object.
 * @returns {Promise<SendMessageParams>} The rendered email list mode object.
 */
export async function renderEmailDebugMode(mail, env) {
    const addresses = [
        mail.from,
        mail.to,
    ];
    const res = await checkAddressStatus(addresses, env);
    const obj = {
        ...mail,
        block: res,
    };
    delete obj.html;
    delete obj.text;
    const text = JSON.stringify(obj, null, 2);
    return renderEmailDetail(text, mail.id);
}
