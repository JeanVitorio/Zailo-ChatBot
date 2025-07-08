const express = require('express');
const qrcode = require('qrcode');
const { Client } = require('whatsapp-web.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
let qrCodeDataUrl = null;
let isBotReady = false;

const client = new Client({
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    session: fs.existsSync('session.json') ? JSON.parse(fs.readFileSync('session.json', 'utf-8')) : null
});

let savedQRCode = null;

function logQRCode(qrCodeString) {
    console.log('QR Code gerado:', qrCodeString);
}

async function generateAndStoreQRCode(qr) {
    if (!savedQRCode) {
        savedQRCode = await qrcode.toString(qr, { type: 'terminal' });
        qrCodeDataUrl = await qrcode.toDataURL(qr); // Gera QR Code como base64 para o frontend
        logQRCode(savedQRCode);
    } else {
        console.log('QR Code reutilizado:', savedQRCode);
    }
}

client.on('qr', (qr) => generateAndStoreQRCode(qr));

client.on('authenticated', (session) => {
    console.log('✅ Sessão autenticada! Salvando session.json...');
    fs.writeFileSync('session.json', JSON.stringify(session));
});

client.on('ready', () => {
    console.log('Atendente Virtual da Zailon está online!');
    isBotReady = true;
    qrCodeDataUrl = null; // Limpa QR Code após autenticação
    setInterval(simulateFakeActivity, 40000);
});

client.on('disconnected', (reason) => {
    console.log('❌ Bot desconectado:', reason);
    isBotReady = false;
    qrCodeDataUrl = null;
});

client.initialize().catch(err => console.error('❌ Erro ao inicializar cliente:', err));

// Rota para fornecer o QR Code como base64
app.get('/get-qrcode', (req, res) => {
    if (qrCodeDataUrl) {
        res.json({ qrcode: qrCodeDataUrl });
    } else {
        res.status(404).json({ error: 'Nenhum QR Code disponível no momento.' });
    }
});

// Rota para verificar o status do bot
app.get('/status', (req, res) => {
    res.json({ isReady: isBotReady });
});

app.listen(port, () => {
    console.log(`✅ Servidor iniciado na porta ${port}. Acesse http://localhost:${port}/get-qrcode`);
});

// Normalizar texto para lidar com gírias e erros
function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Simular atividade falsa
async function simulateFakeActivity() {
    try {
        const fakeChatId = '5531999999999@c.us';
        const chat = await client.getChatById(fakeChatId);
        await chat.sendStateTyping();
    } catch (error) {
        console.error('Erro ao simular atividade:', error);
    }
}

// Estados do cliente
const clientStates = new Map();

client.on('message', async msg => {
    const chatId = msg.from;
    const originalText = msg.body.trim();
    const normalizedText = normalizeText(originalText);

    let state = clientStates.get(chatId) || { step: 'initial', lastInteraction: Date.now(), clientData: {} };
    state.lastInteraction = Date.now();
    clientStates.set(chatId, state);

    // Saudação inicial com estoque
    if (normalizedText.match(/(oi|olá|salve|bom dia|boa tarde|boa noite|e aí|irmão)/) && chatId.endsWith('@c.us')) {
        await msg.getChat().then(chat => chat.sendStateTyping());
        try {
            const response = await axios.get('http://localhost:5000/api/cars');
            const cars = response.data;
            const carList = cars.map(c => `- ${c.name} (${c.year || 'Não informado'})`).join('\n') || 'Nenhum carro no bagulho!';
            await client.sendMessage(chatId, `Salve, irmão! 👊 Eu sou a Zailon, teu parceiro virtual. Tem esses carros no estoque:\n${carList}\nQuer comprar, financiar ou só dar uma olhada? Me fala aí!`);
            state.step = 'initial';
        } catch (error) {
            await client.sendMessage(chatId, 'Deu ruim no estoque, tenta de novo depois!');
        }
        return;
    }

    // Detecção de intenções e estados
    const intents = {
        'buy': ['comprar', 'pegar', 'levar', 'quero um carro', 'bora comprar'],
        'finance': ['financiar', 'simular', 'parcela', 'financio', 'quero financiar'],
        'sell': ['vender', 'trocar', 'passar', 'vendo meu carro'],
        'consign': ['consignar', 'deixar', 'colocar pra vender'],
        'details': ['detalhe', 'mais info', 'fala mais', 'quero saber']
    };

    let intentDetected = false;
    for (let [intent, keywords] of Object.entries(intents)) {
        if (keywords.some(k => normalizedText.includes(normalizeText(k)))) {
            intentDetected = true;
            if (intent === 'buy' || intent === 'finance') {
                state.step = 'awaiting_car';
                const cars = (await axios.get('http://localhost:5000/api/cars')).data;
                const carList = cars.map(c => `${c.name} (${c.year || 'Não informado'})`).join(', ');
                await client.sendMessage(chatId, `Beleza, irmão! Quer ${intent === 'finance' ? 'financiar' : 'comprar'} um carro? Temos: ${carList}. Qual te interessa?`);
            } else if (intent === 'sell' || intent === 'consign') {
                state.step = 'awaiting_car_details';
                await client.sendMessage(chatId, `Massa! Quer ${intent === 'sell' ? 'vender' : 'consignar'} teu carro? Me conta o modelo, ano e estado dele!`);
            } else if (intent === 'details') {
                if (state.lastCar) {
                    await client.sendMessage(chatId, `Detalhes do ${state.lastCar.name}: Ano ${state.lastCar.year || 'Não sei'}, ${state.lastCar.description || 'Sem descrição'}. Quer financiar ou ver outro?`);
                } else {
                    await client.sendMessage(chatId, 'Fala qual carro tu quer saber mais, irmão!');
                }
            }
            break;
        }
    }

    // Processar estados
    if (state.step === 'awaiting_car') {
        const cars = (await axios.get('http://localhost:5000/api/cars')).data;
        const carMatch = cars.find(c => normalizedText.includes(normalizeText(c.name)));
        if (carMatch) {
            state.lastCar = carMatch;
            state.clientData.interest = state.step === 'awaiting_car' && normalizedText.includes('financiar') ? 'financiamento' : 'compra à vista';
            state.clientData.carInterested = carMatch.name;
            state.step = state.clientData.interest === 'financiamento' ? 'awaiting_cpf' : 'awaiting_confirmation';
            await client.sendMessage(chatId, `Top, curtiu o ${carMatch.name}! ${state.clientData.interest === 'financiamento' ? 'Pra simular, me passa teu CPF (só números):' : 'Quer fechar essa compra? Diz sim ou não!'}`);
        } else {
            await client.sendMessage(chatId, 'Não achei esse carro, irmão! Tenta outro nome da lista.');
        }
        return;
    }

    if (state.step === 'awaiting_cpf') {
        if (/^\d{11}$/.test(originalText)) {
            state.clientData.documents = state.clientData.documents || {};
            state.clientData.documents.cpf = originalText;
            state.step = 'awaiting_birthdate';
            await client.sendMessage(chatId, 'CPF registrado! Agora me passa tua data de nascimento (DDMMAAAA):');
        } else {
            await client.sendMessage(chatId, 'CPF precisa ter 11 dígitos, irmão! Tenta de novo.');
        }
        return;
    }

    if (state.step === 'awaiting_birthdate') {
        if (/^\d{8}$/.test(originalText)) {
            state.clientData.documents.birthdate = originalText;
            state.step = 'awaiting_documents';
            await client.sendMessage(chatId, 'Beleza, data ok! Envia teu RG, comprovante de renda e residência (fotos ou PDF, um de cada vez).');
        } else {
            await client.sendMessage(chatId, 'Data precisa ser DDMMAAAA, tipo 01011990. Tenta de novo!');
        }
        return;
    }

    if (state.step === 'awaiting_documents') {
        if (msg.hasMedia) {
            const media = await msg.downloadMedia();
            const docType = state.clientData.documentsUploadOrder || ['rg', 'income', 'residence'];
            const currentDoc = docType[Object.keys(state.clientData.documents || {}).length];
            if (currentDoc) {
                const filename = `${chatId}_${currentDoc}_${Date.now()}.${media.mimetype.split('/')[1]}`;
                fs.mkdirSync('./documents', { recursive: true });
                fs.writeFileSync(`./documents/${filename}`, Buffer.from(media.data, 'base64'), 'base64');
                state.clientData.documents[currentDoc] = filename;
                if (Object.keys(state.clientData.documents).length === 3) {
                    state.step = 'awaiting_job';
                    await client.sendMessage(chatId, 'Docs recebidos! Qual é teu trampo (emprego)?');
                } else {
                    await client.sendMessage(chatId, `Recebi o ${currentDoc}! Agora manda o próximo (${docType[Object.keys(state.clientData.documents).length]}).`);
                }
            }
        }
        return;
    }

    if (state.step === 'awaiting_job') {
        state.clientData.job = originalText;
        state.step = 'completed';
        const clientData = {
            name: chatId.split('@')[0], // Placeholder, pode ser melhorado
            phone: chatId,
            interests: state.clientData,
            documents: state.clientData.documents,
            job: state.clientData.job
        };
        await axios.post('http://localhost:5000/api/clients', clientData);
        await client.sendMessage(chatId, 'Tá tudo certo, irmão! Passamos pra nosso vendedor. Te liga em breve! 🚗');
        clientStates.delete(chatId); // Limpa estado após conclusão
        return;
    }

    if (state.step === 'awaiting_car_details') {
        state.clientData.carToSell = originalText;
        state.clientData.interest = 'venda';
        state.step = 'completed';
        const clientData = {
            name: chatId.split('@')[0],
            phone: chatId,
            interests: state.clientData
        };
        await axios.post('http://localhost:5000/api/clients', clientData);
        await client.sendMessage(chatId, 'Beleza, vamos avaliar teu carro! Nosso vendedor te contata. Qualquer coisa, é só chamar!');
        clientStates.delete(chatId);
        return;
    }

    // Resposta padrão
    if (!intentDetected) {
        await msg.getChat().then(chat => chat.sendStateTyping());
        await client.sendMessage(chatId, 'Não captei, irmão! 😅 Quer comprar, financiar, vender ou só ver os carros? Me guia aí!');
    }
});