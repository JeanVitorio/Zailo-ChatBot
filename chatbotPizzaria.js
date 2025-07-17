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
const sessionFile = path.join(__dirname, 'session.json');

const client = new Client({
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    session: fs.existsSync(sessionFile) ? JSON.parse(fs.readFileSync(sessionFile, 'utf-8')) : null
});

function logQRCode(qr) {
    console.log('QR Code gerado:', qr);
}

async function generateAndStoreQRCode(qr) {
    try {
        if (!fs.existsSync(qrcodeFolder)) {
            fs.mkdirSync(qrcodeFolder, { recursive: true });
        }
        const qrPath = path.join(qrcodeFolder, 'qrcode.png');
        if (fs.existsSync(qrPath)) {
            fs.unlinkSync(qrPath);
        }
        await qrcode.toFile(qrPath, qr, { type: 'png', width: 300 });
        qrCodeDataUrl = `/QRCODE/qrcode.png`;
        logQRCode(qr);
    } catch (error) {
        console.error('Erro ao gerar QR Code:', error.message);
    }
}

client.on('qr', (qr) => generateAndStoreQRCode(qr));

client.on('authenticated', (session) => {
    console.log('✅ Sessão autenticada! Salvando session.json...');
    fs.writeFileSync(sessionFile, JSON.stringify(session));
});

client.on('ready', () => {
    console.log('✅ Atendente Virtual da Zailon está online!');
    isBotReady = true;
    qrCodeDataUrl = null;
    setInterval(simulateFakeActivity, 40000);
});

client.on('disconnected', (reason) => {
    console.log('❌ Bot desconectado:', reason);
    isBotReady = false;
    qrCodeDataUrl = null;
    if (fs.existsSync(sessionFile)) {
        fs.unlinkSync(sessionFile);
    }
});

client.initialize().catch(err => {
    console.error('❌ Erro ao inicializar cliente:', err.message);
});

app.use('/QRCODE', express.static(qrcodeFolder));

app.get('/get-qrcode', (req, res) => {
    if (qrCodeDataUrl) {
        res.json({ qrcode: qrCodeDataUrl });
    } else {
        res.status(404).json({ error: 'Nenhum QR Code disponível. Bot pode estar autenticado ou offline.' });
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
        console.error('Erro ao simular atividade:', error.message);
    }
}

function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

const clientStates = new Map();

client.on('message', async msg => {
    if (!isBotReady) {
        console.log('Bot não está pronto. Ignorando mensagem:', msg.body);
        return;
    }

    console.log('Mensagem recebida:', { from: msg.from, body: msg.body });
    const chatId = msg.from;
    const originalText = msg.body.trim();
    const normalizedText = normalizeText(originalText);

    let state = clientStates.get(chatId) || { step: 'inicial', lastInteraction: Date.now(), clientData: {} };
    state.lastInteraction = Date.now();
    clientStates.set(chatId, state);

    try {
        await msg.getChat().then(chat => chat.sendStateTyping());

        if (normalizedText.match(/(oi|olá|salve|bom dia|boa tarde|boa noite|e aí|irmão|beleza|fala aí)/) && state.step === 'inicial') {
            console.log('Detectou saudação, enviando resposta...');
            try {
                const response = await axios.get('http://localhost:5000/api/cars', { timeout: 5000 });
                const cars = response.data;
                const carList = cars.modelos?.map(c => `- ${c.nome} (${c.ano || 'sem ano'})`).join('\n') || 'Nenhum carro no estoque!';
                await client.sendMessage(chatId, `Salve, irmão! 👊 Eu sou a Zailon, teu parceiro virtual. Temos esses carros no estoque:\n${carList}\nQuer comprar, financiar, vender ou só dar uma olhada?`);
                state.step = 'aguardando_intencao';
                state.clientData = { name: chatId.split('@')[0], phone: chatId, state: 'inicial', interests: {}, documents: {}, report: 'Conversa iniciada' };
                const clientResponse = await axios.post('http://localhost:5000/api/clients', state.clientData, { timeout: 5000 });
                state.clientData.id = clientResponse.data.id;
                clientStates.set(chatId, state);
            } catch (error) {
                console.error('Erro na API de carros:', error.message);
                await client.sendMessage(chatId, 'Deu ruim no estoque, irmão! Tenta de novo depois.');
            }
            return;
        }

        const intents = {
            'comprar': ['comprar', 'pegar', 'levar', 'quero um carro'],
            'financiar': ['financiar', 'simular', 'parcela'],
            'vender': ['vender', 'trocar', 'passar'],
            'consignar': ['consignar', 'deixar'],
            'detalhes': ['detalhes', 'mais info', 'fala mais']
        };

        let intentDetected = false;
        for (let [intent, keywords] of Object.entries(intents)) {
            if (keywords.some(k => normalizedText.includes(k))) {
                intentDetected = true;
                console.log(`Intenção detectada: ${intent}`);
                if (intent === 'comprar' || intent === 'financiar') {
                    state.step = 'aguardando_carro';
                    try {
                        const response = await axios.get('http://localhost:5000/api/cars', { timeout: 5000 });
                        const cars = response.data;
                        const carList = cars.modelos?.map(c => `${c.nome} (${c.ano || 'sem ano'})`).join(', ');
                        await client.sendMessage(chatId, `Beleza, irmão! Quer ${intent === 'financiar' ? 'financiar' : 'comprar'} um carro? Temos: ${carList}. Qual te interessa?`);
                        state.clientData.interest = intent === 'financiar' ? 'financiamento' : 'compra à vista';
                        state.clientData.state = 'aguardando_carro';
                        await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, state: state.step }, { timeout: 5000 });
                    } catch (error) {
                        console.error('Erro ao buscar carros:', error.message);
                        await client.sendMessage(chatId, 'Deu ruim ao listar os carros, irmão! Tenta de novo.');
                    }
                } else if (intent === 'vender' || intent === 'consignar') {
                    state.step = 'aguardando_detalhes_venda';
                    await client.sendMessage(chatId, `Massa! Quer ${intent === 'vender' ? 'vender' : 'consignar'} teu carro? Me conta o modelo, ano e estado!`);
                    state.clientData.interest = intent === 'vender' ? 'venda' : 'consignação';
                    state.clientData.state = 'aguardando_detalhes_venda';
                    await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, state: state.step }, { timeout: 5000 });
                } else if (intent === 'detalhes') {
                    if (state.lastCar) {
                        await client.sendMessage(chatId, `Detalhes do ${state.lastCar.nome}: Ano ${state.lastCar.ano || 'sem ano'}, ${state.lastCar.descricao || 'sem descrição'}. Quer financiar ou ver outro?`);
                    } else {
                        await client.sendMessage(chatId, 'Fala qual carro tu quer saber mais, irmão!');
                    }
                }
                clientStates.set(chatId, state);
                break;
            }
        }

        if (!intentDetected && state.step === 'aguardando_intencao') {
            console.log('Nenhuma intenção detectada, enviando mensagem padrão...');
            await client.sendMessage(chatId, 'Não saquei, irmão! 😅 Quer comprar, financiar, vender ou só ver os carros? Me guia aí!');
            return;
        }

        if (state.step === 'aguardando_carro') {
            try {
                const response = await axios.get('http://localhost:5000/api/cars', { timeout: 5000 });
                const cars = response.data;
                const carMatch = cars.modelos?.find(c => normalizeText(c.nome).includes(normalizeText(originalText)));
                if (carMatch) {
                    state.lastCar = carMatch;
                    state.clientData.carInterested = carMatch.nome;
                    state.step = state.clientData.interest === 'financiamento' ? 'aguardando_documentos' : 'aguardando_confirmacao';
                    await client.sendMessage(chatId, `Top, curtiu o ${carMatch.nome}! ${state.clientData.interest === 'financiamento' ? 'Pra simular, me passa teu CPF (só números):' : 'Quer fechar essa compra? Diz sim ou não!'}`);
                    state.clientData.state = state.step;
                    await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, state: state.step }, { timeout: 5000 });
                } else {
                    await client.sendMessage(chatId, 'Não achei esse carro, irmão! Tenta outro nome da lista.');
                }
            } catch (error) {
                console.error('Erro ao buscar carros:', error.message);
                await client.sendMessage(chatId, 'Deu ruim ao buscar os carros, irmão! Tenta de novo.');
            }
            clientStates.set(chatId, state);
            return;
        }

        if (state.step === 'aguardando_documentos') {
            if (/^\d{11}$/.test(originalText) && !state.clientData.documents?.cpf) {
                state.clientData.documents = state.clientData.documents || {};
                state.clientData.documents.cpf = originalText;
                state.step = 'aguardando_nascimento';
                await client.sendMessage(chatId, 'CPF ok! Agora me passa tua data de nascimento (DDMMAAAA):');
                state.clientData.state = state.step;
                await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, documents: state.clientData.documents, state: state.step }, { timeout: 5000 });
            } else if (/^\d{8}$/.test(originalText) && state.clientData.documents?.cpf && !state.clientData.documents?.birthdate) {
                state.clientData.documents.birthdate = originalText;
                state.step = 'aguardando_arquivos';
                await client.sendMessage(chatId, 'Data ok! Envia RG, comprovante de renda e residência (fotos ou PDF, um de cada vez).');
                state.clientData.state = state.step;
                await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, documents: state.clientData.documents, state: state.step }, { timeout: 5000 });
            } else if (msg.hasMedia && state.clientData.documents) {
                try {
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
                        } else {
                            await client.sendMessage(chatId, `Recebi o ${currentDoc}! Manda o próximo (${docTypes[Object.keys(state.clientData.documents).length - 2]}).`);
                        }
                        state.clientData.state = state.step;
                        await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, documents: state.clientData.documents, state: state.step }, { timeout: 5000 });
                    }
                } catch (error) {
                    console.error('Erro ao processar mídia:', error.message);
                    await client.sendMessage(chatId, 'Deu erro ao processar o arquivo, irmão! Tenta de novo.');
                }
            } else {
                await client.sendMessage(chatId, 'Tá errado, irmão! CPF com 11 dígitos ou data em DDMMAAAA, ou envia os docs na ordem (RG, renda, residência).');
            }
            clientStates.set(chatId, state);
            return;
        }

        if (state.step === 'aguardando_emprego') {
            state.clientData.job = originalText;
            state.step = 'aguardando_confirmacao';
            await client.sendMessage(chatId, 'Trampo registrado! Vamos simular o financiamento. Confirma? (sim/não)');
            state.clientData.state = state.step;
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, documents: state.clientData.documents, job: state.clientData.job, state: state.step }, { timeout: 5000 });
            clientStates.set(chatId, state);
            return;
        }

        if (state.step === 'aguardando_confirmacao') {
            if (normalizedText.includes('sim')) {
                state.step = 'finalizado';
                state.clientData.state = state.step;
                state.clientData.report = `${state.clientData.interest === 'financiamento' ? 'Financiamento simulado' : 'Compra confirmada'} do ${state.clientData.carInterested}. Dados: ${JSON.stringify(state.clientData)}`;
                await axios.post('http://localhost:5000/api/clients', state.clientData, { timeout: 5000 });
                await client.sendMessage(chatId, `${state.clientData.interest === 'financiamento' ? 'Financiamento simulado' : 'Compra fechada'}, irmão! Te liga o vendedor em breve! 🚗`);
                clientStates.delete(chatId);
            } else if (normalizedText.includes('não')) {
                await client.sendMessage(chatId, 'Beleza, irmão! Se mudar de ideia, é só chamar!');
                state.step = 'inicial';
                state.clientData.state = state.step;
                await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, state: state.step }, { timeout: 5000 });
            } else {
                await client.sendMessage(chatId, 'Diz sim ou não, irmão!');
            }
            clientStates.set(chatId, state);
            return;
        }

        if (state.step === 'aguardando_detalhes_venda') {
            state.clientData.carToSell = originalText;
            state.step = 'finalizado';
            state.clientData.state = state.step;
            state.clientData.report = `Venda solicitada de ${state.clientData.carToSell}. Dados: ${JSON.stringify(state.clientData)}`;
            await axios.post('http://localhost:5000/api/clients', state.clientData, { timeout: 5000 });
            await client.sendMessage(chatId, 'Beleza, vamos avaliar teu carro! Te contata o vendedor!');
            clientStates.delete(chatId);
            return;
        }

        await client.sendMessage(chatId, 'Não entendi, irmão! 😅 Vamos tentar de novo?');
        state.step = 'inicial';
        state.clientData.state = state.step;
        clientStates.set(chatId, state);
    } catch (error) {
        console.error('Erro ao processar mensagem:', error.message);
        await client.sendMessage(chatId, 'Deu ruim, irmão! Tenta de novo mais tarde.');
    }
});

// Resetar estados inativos após 10 minutos
setInterval(() => {
    clientStates.forEach((state, chatId) => {
        if (Date.now() - state.lastInteraction > 10 * 60 * 1000) {
            console.log('Resetando estado para:', chatId);
            clientStates.delete(chatId);
        }
    });
}, 60 * 1000);