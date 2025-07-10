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
const qrcodeFolder = path.join(__dirname, 'QRCODE');

const client = new Client({
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    session: fs.existsSync('session.json') ? JSON.parse(fs.readFileSync('session.json', 'utf-8')) : null
});

let savedQRCode = null;

function logQRCode(qrCodeString) {
    console.log('QR Code gerado:', qrCodeString);
}

async function generateAndStoreQRCode(qr) {
    if (!fs.existsSync(qrcodeFolder)) {
        fs.mkdirSync(qrcodeFolder);
    }

    const oldQrPath = path.join(qrcodeFolder, 'qrcode.png');
    if (fs.existsSync(oldQrPath)) {
        fs.unlinkSync(oldQrPath);
    }

    const newQrPath = path.join(qrcodeFolder, 'qrcode.png');
    await qrcode.toFile(newQrPath, qr, { type: 'png', width: 300 });
    savedQRCode = qr;
    qrCodeDataUrl = `/QRCODE/qrcode.png`;
    logQRCode(qr);
}

client.on('qr', (qr) => generateAndStoreQRCode(qr));

client.on('authenticated', (session) => {
    console.log('✅ Sessão autenticada! Salvando session.json...');
    fs.writeFileSync('session.json', JSON.stringify(session));
});

client.on('ready', () => {
    console.log('Atendente Virtual da Zailon está online!');
    isBotReady = true;
    qrCodeDataUrl = null;
    setInterval(simulateFakeActivity, 40000);
});

client.on('disconnected', (reason) => {
    console.log('❌ Bot desconectado:', reason);
    isBotReady = false;
    qrCodeDataUrl = null;
});

client.initialize().catch(err => console.error('❌ Erro ao inicializar cliente:', err));

app.use('/QRCODE', express.static(qrcodeFolder));

app.get('/get-qrcode', (req, res) => {
    if (qrCodeDataUrl) {
        res.json({ qrcode: qrCodeDataUrl });
    } else {
        res.status(404).json({ error: 'Nenhum QR Code disponível no momento.' });
    }
});

app.get('/status', (req, res) => {
    res.json({ isReady: isBotReady });
});

app.listen(port, () => {
    console.log(`✅ Servidor iniciado na porta ${port}. Acesse http://localhost:${port}/get-qrcode`);
});

async function simulateFakeActivity() {
    try {
        const fakeChatId = '5531999999999@c.us';
        const chat = await client.getChatById(fakeChatId);
        await chat.sendStateTyping();
    } catch (error) {
        console.error('Erro ao simular atividade:', error);
    }
}

function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/(comprar|pegar|levar|quero um carro|bora comprar|quero um bagulho)/g, 'comprar')
        .replace(/(financiar|simular|parcela|financio|quero financiar|posso parcelar)/g, 'financiar')
        .replace(/(vender|trocar|passar|vendo meu carro|despejo meu tranco)/g, 'vender')
        .replace(/(consignar|deixar|colocar pra vender|deixa comigo)/g, 'consignar')
        .replace(/(detalhe|mais info|fala mais|quero saber|me conta aí)/g, 'detalhes');
}

const clientStates = new Map();

client.on('message', async msg => {
    console.log('Mensagem recebida:', msg.body); // Log pra debug
    const chatId = msg.from;
    const originalText = msg.body.trim();
    const normalizedText = normalizeText(originalText);

    let state = clientStates.get(chatId) || { step: 'inicial', lastInteraction: Date.now(), clientData: {} };
    state.lastInteraction = Date.now();
    clientStates.set(chatId, state);

    if (normalizedText.match(/(oi|olá|salve|bom dia|boa tarde|boa noite|e aí|irmão|beleza|fala aí)/) && state.step === 'inicial') {
        console.log('Detectou saudação, enviando resposta...');
        await msg.getChat().then(chat => chat.sendStateTyping());
        try {
            const response = await axios.get('http://localhost:5000/api/cars');
            const cars = response.data;
            const carList = cars.map(c => `- ${c.name} (${c.year || 'sem ano'})`).join('\n') || 'Nenhum carro no bagulho!';
            await client.sendMessage(chatId, `Salve, irmão! 👊 Eu sou a Zailon, teu parceiro virtual. Tem esses carros no estoque:\n${carList}\nQuer comprar, financiar, vender ou só dar uma olhada?`);
            state.step = 'aguardando_intencao';
            const clientData = { name: chatId.split('@')[0], phone: chatId, state: 'inicial', interests: {}, documents: {}, report: 'Conversa iniciada' };
            await axios.post('http://localhost:5000/api/clients', clientData);
        } catch (error) {
            console.error('Erro na API de carros:', error);
            await client.sendMessage(chatId, 'Deu ruim no estoque, tenta de novo depois, irmão!');
        }
        return;
    }

    const intents = {
        'comprar': ['comprar'],
        'financiar': ['financiar'],
        'vender': ['vender', 'trocar', 'passar'],
        'consignar': ['consignar', 'deixar'],
        'detalhes': ['detalhes']
    };

    let intentDetected = false;
    for (let [intent, keywords] of Object.entries(intents)) {
        if (keywords.some(k => normalizedText.includes(k))) {
            intentDetected = true;
            console.log(`Intenção detectada: ${intent}`);
            if (intent === 'comprar' || intent === 'financiar') {
                state.step = 'aguardando_carro';
                const cars = (await axios.get('http://localhost:5000/api/cars')).data;
                const carList = cars.map(c => `${c.name} (${c.year || 'sem ano'})`).join(', ');
                await client.sendMessage(chatId, `Beleza, irmão! Quer ${intent === 'financiar' ? 'financiar' : 'comprar'} um carro? Temos: ${carList}. Qual te interessa?`);
                state.clientData.interest = intent === 'financiar' ? 'financiamento' : 'compra à vista';
                state.clientData.state = 'aguardando_carro';
                await axios.put('http://localhost:5000/api/clients/' + state.clientData.id, { interests: state.clientData, state: state.step });
            } else if (intent === 'vender' || intent === 'consignar') {
                state.step = 'aguardando_detalhes_venda';
                await client.sendMessage(chatId, `Massa! Quer ${intent === 'vender' ? 'vender' : 'consignar'} teu carro? Me conta o modelo, ano e estado!`);
                state.clientData.interest = intent === 'vender' ? 'venda' : 'consignação';
                state.clientData.state = 'aguardando_detalhes_venda';
                await axios.put('http://localhost:5000/api/clients/' + state.clientData.id, { interests: state.clientData, state: state.step });
            } else if (intent === 'detalhes') {
                if (state.lastCar) {
                    await client.sendMessage(chatId, `Detalhes do ${state.lastCar.name}: Ano ${state.lastCar.year || 'sem ano'}, ${state.lastCar.description || 'sem descrição'}. Quer financiar ou ver outro?`);
                } else {
                    await client.sendMessage(chatId, 'Fala qual carro tu quer saber mais, irmão!');
                }
            }
            break;
        }
    }

    if (!intentDetected && state.step === 'aguardando_intencao') {
        console.log('Nenhuma intenção detectada, enviando mensagem padrão...');
        await client.sendMessage(chatId, 'Não saquei, irmão! 😅 Quer comprar, financiar, vender ou só ver os carros? Me guia aí!');
        return;
    }

    if (state.step === 'aguardando_carro') {
        const cars = (await axios.get('http://localhost:5000/api/cars')).data;
        const carMatch = cars.find(c => normalizedText.includes(normalizeText(c.name)));
        if (carMatch) {
            state.lastCar = carMatch;
            state.clientData.carInterested = carMatch.name;
            state.step = state.clientData.interest === 'financiamento' ? 'aguardando_documentos' : 'aguardando_confirmacao';
            await client.sendMessage(chatId, `Top, curtiu o ${carMatch.name}! ${state.clientData.interest === 'financiamento' ? 'Pra simular, me passa teu CPF (só números):' : 'Quer fechar essa compra? Diz sim ou não!'}`);
            state.clientData.state = state.step;
            await axios.put('http://localhost:5000/api/clients/' + state.clientData.id, { interests: state.clientData, state: state.step });
        } else {
            await client.sendMessage(chatId, 'Não achei esse carro, irmão! Tenta outro nome da lista.');
        }
        return;
    }

    if (state.step === 'aguardando_documentos') {
        if (/^\d{11}$/.test(originalText) && !state.clientData.documents?.cpf) {
            state.clientData.documents = state.clientData.documents || {};
            state.clientData.documents.cpf = originalText;
            state.step = 'aguardando_nascimento';
            await client.sendMessage(chatId, 'CPF ok! Agora me passa tua data de nascimento (DDMMAAAA):');
            state.clientData.state = state.step;
            await axios.put('http://localhost:5000/api/clients/' + state.clientData.id, { interests: state.clientData, documents: state.clientData.documents, state: state.step });
        } else if (/^\d{8}$/.test(originalText) && state.clientData.documents?.cpf && !state.clientData.documents?.birthdate) {
            state.clientData.documents.birthdate = originalText;
            state.step = 'aguardando_arquivos';
            await client.sendMessage(chatId, 'Data ok! Envia RG, comprovante de renda e residência (fotos ou PDF, um de cada vez).');
            state.clientData.state = state.step;
            await axios.put('http://localhost:5000/api/clients/' + state.clientData.id, { interests: state.clientData, documents: state.clientData.documents, state: state.step });
        } else if (msg.hasMedia && state.clientData.documents) {
            const media = await msg.downloadMedia();
            const docTypes = ['rg', 'income', 'residence'];
            const currentDoc = docTypes[Object.keys(state.clientData.documents).length - 2];
            if (currentDoc) {
                const filename = `${chatId}_${currentDoc}_${Date.now()}.${media.mimetype.split('/')[1]}`;
                fs.mkdirSync('./documents', { recursive: true });
                fs.writeFileSync(`./documents/${filename}`, Buffer.from(media.data, 'base64'), 'base64');
                state.clientData.documents[currentDoc] = filename;
                if (Object.keys(state.clientData.documents).length === 5) {
                    state.step = 'aguardando_emprego';
                    await client.sendMessage(chatId, 'Docs recebidos! Qual é teu trampo (emprego)?');
                    state.clientData.state = state.step;
                    await axios.put('http://localhost:5000/api/clients/' + state.clientData.id, { interests: state.clientData, documents: state.clientData.documents, state: state.step });
                } else {
                    await client.sendMessage(chatId, `Recebi o ${currentDoc}! Manda o próximo (${docTypes[Object.keys(state.clientData.documents).length - 2]}).`);
                    state.clientData.state = state.step;
                    await axios.put('http://localhost:5000/api/clients/' + state.clientData.id, { interests: state.clientData, documents: state.clientData.documents, state: state.step });
                }
            }
        } else {
            await client.sendMessage(chatId, 'Tá errado, irmão! CPF com 11 dígitos ou data em DDMMAAAA, ou envia os docs na ordem (RG, renda, residência).');
        }
        return;
    }

    if (state.step === 'aguardando_emprego') {
        state.clientData.job = originalText;
        state.step = 'aguardando_confirmacao';
        await client.sendMessage(chatId, 'Trampo registrado! Vamos simular o financiamento. Confirma? (sim/não)');
        state.clientData.state = state.step;
        await axios.put('http://localhost:5000/api/clients/' + state.clientData.id, { interests: state.clientData, documents: state.clientData.documents, job: state.clientData.job, state: state.step });
        return;
    }

    if (state.step === 'aguardando_confirmacao') {
        if (normalizedText.includes('sim') && state.clientData.interest === 'compra à vista') {
            state.step = 'finalizado';
            const clientData = {
                name: chatId.split('@')[0],
                phone: chatId,
                interests: state.clientData,
                documents: state.clientData.documents,
                job: state.clientData.job,
                state: state.step,
                report: `Compra confirmada do ${state.clientData.carInterested}. Dados: ${JSON.stringify(state.clientData)}`
            };
            await axios.post('http://localhost:5000/api/clients', clientData);
            await client.sendMessage(chatId, 'Compra fechada, irmão! Te liga o vendedor em breve! 🚗');
            clientStates.delete(chatId);
        } else if (normalizedText.includes('sim') && state.clientData.interest === 'financiamento') {
            state.step = 'finalizado';
            const clientData = {
                name: chatId.split('@')[0],
                phone: chatId,
                interests: state.clientData,
                documents: state.clientData.documents,
                job: state.clientData.job,
                state: state.step,
                report: `Financiamento simulado do ${state.clientData.carInterested}. Dados: ${JSON.stringify(state.clientData)}`
            };
            await axios.post('http://localhost:5000/api/clients', clientData);
            await client.sendMessage(chatId, 'Financiamento simulado, irmão! Te contata o vendedor com os detalhes!');
            clientStates.delete(chatId);
        } else if (normalizedText.includes('não')) {
            await client.sendMessage(chatId, 'Beleza, irmão! Se mudar de ideia, é só chamar!');
            state.step = 'inicial';
            state.clientData.state = state.step;
            await axios.put('http://localhost:5000/api/clients/' + state.clientData.id, { interests: state.clientData, state: state.step });
        } else {
            await client.sendMessage(chatId, 'Diz sim ou não, irmão!');
        }
        return;
    }

    if (state.step === 'aguardando_detalhes_venda') {
        state.clientData.carToSell = originalText;
        state.step = 'finalizado';
        const clientData = {
            name: chatId.split('@')[0],
            phone: chatId,
            interests: state.clientData,
            state: state.step,
            report: `Venda solicitada de ${state.clientData.carToSell}. Dados: ${JSON.stringify(state.clientData)}`
        };
        await axios.post('http://localhost:5000/api/clients', clientData);
        await client.sendMessage(chatId, 'Beleza, vamos avaliar teu carro! Te contata o vendedor!');
        clientStates.delete(chatId);
        return;
    }
});