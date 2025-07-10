const express = require('express');
const qrcode = require('qrcode');
const { Client, MessageMedia } = require('whatsapp-web.js');
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

process.on('unhandledRejection', (reason, promise) => console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason));
process.on('uncaughtException', (err) => console.error('❌ Uncaught Exception:', err));

let cars;
try {
    cars = JSON.parse(fs.readFileSync('./carros.json', 'utf-8'));
    console.log('✅ carros.json carregado com sucesso.');
} catch (err) {
    console.error('❌ Erro ao carregar carros.json:', err);
    process.exit(1);
}

const clientStates = new Map();
const clientData = new Map();
const lastWelcome = new Map();

function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/(opa|oi|olá|salve|bom dia|boa tarde|boa noite|e aí|irmão|beleza|fala aí|bão|belezinha)/g, 'saudacao')
        .replace(/(quero saber|detalhes|mais info|fala mais|me conta|queria ver|vi aí)/g, 'detalhes')
        .replace(/(comprar|pegar|levar|quero um carro|bora comprar|me interessa)/g, 'comprar')
        .replace(/(financiar|simular|parcela|financio|posso parcelar|quero financiar)/g, 'financiar')
        .replace(/(vender|trocar|passar|vendo meu carro|despejo meu tranco)/g, 'vender')
        .replace(/(deixar|consignar|colocar pra vender|deixa comigo)/g, 'consignar')
        .replace(/(visita|agendar|quero ver|passar aí)/g, 'visita');
}

function canSendWelcome(chatId) {
    const last = lastWelcome.get(chatId);
    return !last || (Date.now() - last) > 24 * 60 * 60 * 1000;
}

function registerWelcome(chatId) {
    lastWelcome.set(chatId, Date.now());
}

function isValidAmount(amount) {
    return /^\d+(\.\d{1,2})?$/.test(amount) || /^\d+$/.test(amount);
}

function isValidParcels(parcels) {
    return /^\d+$/.test(parcels) && parseInt(parcels) > 0;
}

function isValidCPF(cpf) {
    return /^\d{11}$/.test(cpf);
}

function isValidDate(date) {
    return /^\d{2}\/\d{2}\/\d{4}$/.test(date) || /^[a-zA-Z\s]+$/.test(date);
}

function isValidVisitTime(time) {
    return /^\d{2}:\d{2}$/.test(time);
}

function isValidFullName(name) {
    return name.trim().split(/\s+/).length >= 2 && /^[a-zA-Z\s]+$/.test(name);
}

function isValidModel(model) {
    return /^[a-zA-Z0-9\s]+$/.test(model) && model.trim().length > 0;
}

function isValidYear(year) {
    return /^\d{4}$/.test(year) && parseInt(year) >= 1900 && parseInt(year) <= new Date().getFullYear() + 1;
}

function isValidCondition(condition) {
    return condition.trim().length > 0;
}

async function saveMedia(msg, chatId, type) {
    if (msg.hasMedia) {
        try {
            const media = await msg.downloadMedia();
            const filename = `${chatId}_${type}_${Date.now()}.${media.mimetype.split('/')[1]}`;
            const filePath = path.join(__dirname, 'Uploads', filename);
            fs.mkdirSync(path.join(__dirname, 'Uploads'), { recursive: true });
            fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
            console.log(`✅ Media salva: ${filePath}`);
            return filename;
        } catch (err) {
            console.error(`❌ Erro ao salvar media de ${type}:`, err);
            return null;
        }
    }
    return false;
}

async function sendCarImages(chatId, car) {
    if (!car.imagens || !Array.isArray(car.imagens)) return;
    for (let i = 0; i < Math.min(car.imagens.length, 1); i++) {
        const imgPath = path.join(__dirname, car.imagens[i]);
        if (fs.existsSync(imgPath)) {
            const media = MessageMedia.fromFilePath(imgPath);
            await client.sendMessage(chatId, media);
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
}

async function sendReport(chatId) {
    const data = clientData.get(chatId);
    if (!data) return;

    let message = `📊 *Novo Relatório de Cliente:*\n📱 Cliente: ${chatId}\n`;
    if (data.interests?.length) message += `\n🚗 *Carros visualizados:*\n${data.interests.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}`;
    if (data.financing) {
        message += `\n💰 *Financiamento:*\nCarro: ${data.financing.car || 'Não informado'}\nEntrada: R$ ${data.financing.downPayment || 'Não informado'}\nParcelas: ${data.financing.parcels || 'Não informado'}\nCPF: ${data.financing.cpf || 'Não informado'}\nNascimento: ${data.financing.birthDate || 'Não informado'}`;
    }
    if (data.visit) message += `\n📅 *Visita:*\nDia: ${data.visit.date || 'Não informado'}\nHorário: ${data.visit.time || 'Não informado'}\nNome: ${data.visit.name || 'Não informado'}`;
    if (data.trade) message += `\n🔄 *Troca:*\nModelo: ${data.trade.model || 'Não informado'}\nAno: ${data.trade.year || 'Não informado'}\nEstado: ${data.trade.condition || 'Não informado'}\nFoto: ${data.trade.photo || 'Não enviada'}`;
    if (data.sell) message += `\n📤 *Venda:*\nModelo: ${data.sell.model || 'Não informado'}\nAno: ${data.sell.year || 'Não informado'}\nEstado: ${data.sell.condition || 'Não informado'}\nPreço: R$ ${data.sell.price || 'Não informado'}\nFoto: ${data.sell.photo || 'Não enviada'}`;
    message += `\n*⚠️ Atenção:* Dados sensíveis. Conformidade LGPD.`;

    for (const contact of cars.numeros_para_contato) {
        const number = contact.numero.replace(/\D/g, '') + '@c.us';
        try {
            await client.sendMessage(number, message);
            if (data.trade?.photo) {
                const photoPath = path.join(__dirname, 'Uploads', data.trade.photo);
                if (fs.existsSync(photoPath)) {
                    const media = MessageMedia.fromFilePath(photoPath);
                    await client.sendMessage(number, media, { caption: 'Foto (Troca)' });
                }
            }
            if (data.sell?.photo) {
                const photoPath = path.join(__dirname, 'Uploads', data.sell.photo);
                if (fs.existsSync(photoPath)) {
                    const media = MessageMedia.fromFilePath(photoPath);
                    await client.sendMessage(number, media, { caption: 'Foto (Venda)' });
                }
            }
        } catch (err) {
            console.error(`❌ Erro ao enviar relatório para ${contact.nome}:`, err);
        }
    }
}

client.on('qr', async qr => {
    console.log('📱 Novo QR code gerado:', qr);
    qrCodeDataUrl = await qrcode.toDataURL(qr);
    console.log(`✅ QR code gerado. Acesse http://localhost:${port}`);
});

client.on('authenticated', session => {
    console.log('✅ Sessão autenticada! Salvando session.json...');
    fs.writeFileSync('session.json', JSON.stringify(session));
});

client.on('ready', () => {
    console.log('✅ Bot da Zailon online!');
    isBotReady = true;
    qrCodeDataUrl = null;
});

client.on('disconnected', async reason => {
    console.log('❌ Bot desconectado:', reason);
    isBotReady = false;
    qrCodeDataUrl = null;
    await new Promise(resolve => setTimeout(resolve, 10000));
    await client.initialize();
});

client.initialize().catch(err => console.error('❌ Erro ao inicializar cliente:', err));

app.get('/', (req, res) => {
    if (qrCodeDataUrl && !isBotReady) {
        res.send(`<html><body><img src="${qrCodeDataUrl}"><p>Escaneie com o WhatsApp...</p></body></html>`);
    } else if (isBotReady) {
        res.send('<html><body><h1>Bot Online!</h1></body></html>');
    } else {
        res.send('<html><body><h1>Aguardando QR Code...</h1></body></html>');
    }
});

app.get('/status', (req, res) => res.json({ isReady: isBotReady }));
app.get('/ping', (req, res) => { res.send('Bot is alive!'); console.log('✅ Ping recebido.'); });

app.listen(port, () => console.log(`✅ Servidor na porta ${port}. Acesse http://localhost:${port}`));

client.on('message', async msg => {
    console.log(`📩 Mensagem de ${msg.from}: "${msg.body}" - Estado: ${JSON.stringify(clientStates.get(msg.from))}`);
    const chatId = msg.from;
    const text = normalizeText(msg.body);
    let state = clientStates.get(chatId) || { step: 'initial' };
    let data = clientData.get(chatId) || { interests: [], financing: {}, visit: {}, trade: {}, sell: {} };

    if (state.step === 'initial' && text.includes('saudacao')) {
        if (canSendWelcome(chatId)) {
            await client.sendMessage(chatId, `Salve, irmão! 👊 Eu sou a Zailon, teu parceiro virtual da Zailonsoft. Como posso te ajudar hoje? Tô ligado pra papos como 'quero saber do gol quadrado' ou 'bora comprar'!`);
            registerWelcome(chatId);
        }
        state.step = 'awaiting_intent';
        clientStates.set(chatId, state);
        return;
    }

    if (state.step === 'awaiting_intent') {
        const carMatch = cars.modelos.find(c => text.includes(normalizeText(c.nome)));
        if (text.includes('detalhes') && carMatch) {
            data.interests.push(carMatch.nome);
            await client.sendMessage(chatId, `🔍 Detalhes do *${carMatch.nome}*: Ano: ${carMatch.ano}, Preço: ${carMatch.preco}, Descrição: ${carMatch.descricao || 'Sem detalhes'}`);
            await sendCarImages(chatId, carMatch);
            await client.sendMessage(chatId, `Quer financiar ou comprar? Me fala aí, irmão!`);
            state.step = 'awaiting_action';
            state.lastCar = carMatch.nome;
            data.lastCar = carMatch.nome;
        } else if (text.includes('comprar') && carMatch) {
            data.interests.push(carMatch.nome);
            await client.sendMessage(chatId, `Top, curtiu o *${carMatch.nome}* pra comprar! Me diz teu nome e telefone pra gente agilizar, irmão!`);
            state.step = 'awaiting_client_info';
            state.intent = 'buy';
            state.lastCar = carMatch.nome;
            data.lastCar = carMatch.nome;
        } else if (text.includes('financiar') && carMatch) {
            data.interests.push(carMatch.nome);
            await client.sendMessage(chatId, `Massa, quer financiar o *${carMatch.nome}*! Me passa teu nome e CPF (só números) pra simular, irmão!`);
            state.step = 'awaiting_client_info';
            state.intent = 'finance';
            state.lastCar = carMatch.nome;
            data.lastCar = carMatch.nome;
        } else if (text.includes('vender') || text.includes('trocar')) {
            await client.sendMessage(chatId, `Beleza, quer vender ou trocar teu carro! Me conta o modelo, ano e estado, tipo 'gol 2015 bom estado'!`);
            state.step = 'awaiting_trade_sell_details';
            state.intent = text.includes('vender') ? 'sell' : 'trade';
        } else if (text.includes('visita')) {
            await client.sendMessage(chatId, `Top, quer agendar uma visita! Me diz o dia (ex.: 'amanhã' ou '15/07/2025') e horário (ex.: '14:30'), irmão!`);
            state.step = 'awaiting_visit_details';
        } else {
            await client.sendMessage(chatId, `Não saquei direito, irmão! 😅 Tenta algo como 'quero saber do gol quadrado' ou 'bora comprar'!`);
        }
        clientStates.set(chatId, state);
        clientData.set(chatId, data);
        return;
    }

    if (state.step === 'awaiting_client_info') {
        const [name, phoneOrCpf] = text.split(' ').filter(w => w);
        if (isValidFullName(msg.body) && !data.clientName) {
            data.clientName = msg.body;
            await client.sendMessage(chatId, `Nome registrado: ${data.clientName}. Agora me passa teu ${state.intent === 'finance' ? 'CPF (11 dígitos)' : 'telefone'}!`);
        } else if ((state.intent === 'finance' && isValidCPF(phoneOrCpf)) || (state.intent === 'buy' && /^\d{10,11}$/.test(phoneOrCpf))) {
            data[state.intent === 'finance' ? 'cpf' : 'phone'] = phoneOrCpf;
            if (state.intent === 'finance') {
                await client.sendMessage(chatId, `CPF ${phoneOrCpf} ok! Me passa tua data de nascimento (ex.: 15/07/1990), irmão!`);
                state.step = 'awaiting_birthdate';
            } else {
                await client.sendMessage(chatId, `Telefone ${phoneOrCpf} ok! Confirma a compra do *${state.lastCar}*? Diz 'sim' ou 'não'!`);
                state.step = 'awaiting_confirmation';
            }
        } else {
            await client.sendMessage(chatId, `Tá quase, irmão! Me passa teu ${!data.clientName ? 'nome completo' : state.intent === 'finance' ? 'CPF (11 dígitos)' : 'telefone'}!`);
        }
        clientStates.set(chatId, state);
        clientData.set(chatId, data);
        return;
    }

    if (state.step === 'awaiting_birthdate') {
        if (isValidDate(msg.body)) {
            data.birthDate = msg.body;
            await client.sendMessage(chatId, `Data ${msg.body} ok! Envia RG, comprovante de renda e residência (fotos ou PDF, um de cada vez), irmão!`);
            state.step = 'awaiting_documents';
        } else {
            await client.sendMessage(chatId, `Data errada, irmão! Usa o formato 15/07/1990 ou algo como '15 de julho de 1990'!`);
        }
        clientStates.set(chatId, state);
        clientData.set(chatId, data);
        return;
    }

    if (state.step === 'awaiting_documents') {
        if (msg.hasMedia) {
            const mediaType = Object.keys(data.documents || {}).length < 3 ? ['rg', 'income', 'residence'][Object.keys(data.documents || {}).length] : null;
            if (mediaType) {
                const filename = await saveMedia(msg, chatId, mediaType);
                if (filename) {
                    data.documents = data.documents || {};
                    data.documents[mediaType] = filename;
                    await client.sendMessage(chatId, `Recebi o ${mediaType}! Manda o próximo (${Object.keys(data.documents).length < 2 ? ['income', 'residence'][Object.keys(data.documents).length] : 'próximo passo'}), irmão!`);
                    if (Object.keys(data.documents).length === 3) {
                        await client.sendMessage(chatId, `Docs completos! Confirma o financiamento do *${state.lastCar}*? Diz 'sim' ou 'não'!`);
                        state.step = 'awaiting_confirmation';
                    }
                }
            }
        } else {
            await client.sendMessage(chatId, `Manda os docs (RG, renda, residência) um de cada vez, irmão!`);
        }
        clientStates.set(chatId, state);
        clientData.set(chatId, data);
        return;
    }

    if (state.step === 'awaiting_confirmation') {
        if (text.includes('sim')) {
            data.confirmed = true;
            await client.sendMessage(chatId, `Fechado, irmão! O *${state.lastCar}* tá garantido! Te liga o vendedor em breve! 🚗`);
            await axios.post('http://localhost:5000/api/clients', {
                name: data.clientName || chatId.split('@')[0],
                phone: data.phone || chatId,
                interests: { car: state.lastCar, type: state.intent },
                documents: data.documents || {},
                cpf: data.cpf,
                birthDate: data.birthDate,
                report: `Cliente ${data.clientName} confirmou ${state.intent} do ${state.lastCar}`
            });
            await sendReport(chatId);
            clientStates.delete(chatId);
            clientData.delete(chatId);
        } else if (text.includes('não')) {
            await client.sendMessage(chatId, `Tranquilo, irmão! Se mudar de ideia, é só chamar!`);
            state.step = 'initial';
        } else {
            await client.sendMessage(chatId, `Diz 'sim' ou 'não', irmão!`);
        }
        clientStates.set(chatId, state);
        clientData.set(chatId, data);
        return;
    }

    if (state.step === 'awaiting_trade_sell_details') {
        const [model, year, condition] = text.split(' ').filter(w => w);
        if (isValidModel(model) && isValidYear(year) && isValidCondition(condition)) {
            data[state.intent] = { model, year, condition };
            await client.sendMessage(chatId, `Beleza, ${state.intent === 'sell' ? 'venda' : 'troca'} do *${model} ${year}* em ${condition} registrada! Envia uma foto ou diz 'não' pra pular!`);
            state.step = 'awaiting_trade_sell_photo';
        } else {
            await client.sendMessage(chatId, `Me manda modelo, ano e estado, tipo 'gol 2015 bom estado', irmão!`);
        }
        clientStates.set(chatId, state);
        clientData.set(chatId, data);
        return;
    }

    if (state.step === 'awaiting_trade_sell_photo') {
        if (msg.hasMedia) {
            const filename = await saveMedia(msg, chatId, state.intent);
            if (filename) data[state.intent].photo = filename;
            await client.sendMessage(chatId, `Foto recebida! ${state.intent === 'sell' ? 'Venda' : 'Troca'} enviada, irmão! Te contata o vendedor!`);
            await axios.post('http://localhost:5000/api/clients', {
                name: data.clientName || chatId.split('@')[0],
                phone: chatId,
                interests: { type: state.intent, model: data[state.intent].model, year: data[state.intent].year, condition: data[state.intent].condition },
                photo: data[state.intent].photo,
                report: `${state.intent} solicitada de ${data[state.intent].model} ${data[state.intent].year}`
            });
            await sendReport(chatId);
            clientStates.delete(chatId);
            clientData.delete(chatId);
        } else if (text.includes('não')) {
            await client.sendMessage(chatId, `${state.intent === 'sell' ? 'Venda' : 'Troca'} enviada sem foto, irmão! Te contata o vendedor!`);
            await axios.post('http://localhost:5000/api/clients', {
                name: data.clientName || chatId.split('@')[0],
                phone: chatId,
                interests: { type: state.intent, model: data[state.intent].model, year: data[state.intent].year, condition: data[state.intent].condition },
                report: `${state.intent} solicitada de ${data[state.intent].model} ${data[state.intent].year}`
            });
            await sendReport(chatId);
            clientStates.delete(chatId);
            clientData.delete(chatId);
        } else {
            await client.sendMessage(chatId, `Manda a foto ou diz 'não', irmão!`);
        }
        return;
    }

    if (state.step === 'awaiting_visit_details') {
        const [date, time] = text.split(' ').filter(w => w);
        if ((isValidDate(date) || /^[a-zA-Z\s]+$/.test(date)) && isValidVisitTime(time)) {
            data.visit = { date, time };
            await client.sendMessage(chatId, `Visita agendada pra ${date} às ${time}! Me passa teu nome completo, irmão!`);
            state.step = 'awaiting_visit_name';
        } else {
            await client.sendMessage(chatId, `Me manda dia (ex.: 'amanhã' ou '15/07/2025') e horário (ex.: '14:30'), irmão!`);
        }
        clientStates.set(chatId, state);
        clientData.set(chatId, data);
        return;
    }

    if (state.step === 'awaiting_visit_name') {
        if (isValidFullName(msg.body)) {
            data.visit.name = msg.body;
            await client.sendMessage(chatId, `Visita confirmada, ${data.visit.name}! Te contata o vendedor pra ajustar!`);
            await axios.post('http://localhost:5000/api/clients', {
                name: data.visit.name,
                phone: chatId,
                interests: { type: 'visit', date: data.visit.date, time: data.visit.time },
                report: `Visita agendada por ${data.visit.name} em ${data.visit.date} às ${data.visit.time}`
            });
            await sendReport(chatId);
            clientStates.delete(chatId);
            clientData.delete(chatId);
        } else {
            await client.sendMessage(chatId, `Me passa teu nome completo, tipo 'João Silva', irmão!`);
        }
        clientStates.set(chatId, state);
        clientData.set(chatId, data);
        return;
    }

    await client.sendMessage(chatId, `Não saquei, irmão! 😅 Tenta algo como 'quero saber do gol quadrado' ou 'bora comprar'!`);
    state.step = 'awaiting_intent';
    clientStates.set(chatId, state);
    clientData.set(chatId, data);
});