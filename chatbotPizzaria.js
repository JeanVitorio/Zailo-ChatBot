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
const qrcodeFolder = path.join(__dirname, 'QRCODE');
const uploadDir = path.join(__dirname, 'Uploads');

const client = new Client({
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    session: fs.existsSync('session.json') ? JSON.parse(fs.readFileSync('session.json', 'utf-8')) : null
});

const clientStates = new Map();
const ultimoBoasVindas = new Map();

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
    return /^\d{2}\/\d{2}\/\d{4}$/.test(date);
}

function isValidVisitDate(date) {
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

function podeEnviarBoasVindas(chatId) {
    const ultimoEnvio = ultimoBoasVindas.get(chatId);
    if (!ultimoEnvio) return true;
    return (Date.now() - ultimoEnvio) > 24 * 60 * 60 * 1000;
}

function registrarBoasVindas(chatId) {
    ultimoBoasVindas.set(chatId, Date.now());
}

async function salvarFoto(msg, chatId, tipo) {
    if (msg.hasMedia) {
        try {
            const media = await msg.downloadMedia();
            const fileName = `${chatId}_${tipo}_${Date.now()}.${media.mimetype.split('/')[1]}`;
            fs.mkdirSync(uploadDir, { recursive: true });
            fs.writeFileSync(path.join(uploadDir, fileName), Buffer.from(media.data, 'base64'));
            console.log(`✅ Foto salva: ${fileName}`);

            // Limpar fotos antigas (mais de 24 horas)
            fs.readdir(uploadDir, (err, files) => {
                if (err) return console.error('❌ Erro ao limpar Uploads:', err);
                files.forEach(file => {
                    const filePath = path.join(uploadDir, file);
                    fs.stat(filePath, (err, stats) => {
                        if (err) return;
                        const ageInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
                        if (ageInHours > 24) {
                            fs.unlink(filePath, err => {
                                if (err) console.error(`❌ Erro ao deletar ${filePath}:`, err);
                                else console.log(`🗑️ Foto antiga deletada: ${filePath}`);
                            });
                        }
                    });
                });
            });

            return fileName;
        } catch (err) {
            console.error(`❌ Erro ao salvar foto de ${tipo}:`, err);
            return null;
        }
    }
    return false;
}

async function sendCarImages(chatId, car) {
    if (!car.imagens || !Array.isArray(car.imagens)) {
        await client.sendMessage(chatId, `Nenhuma imagem disponível para o ${car.nome}.`);
        return;
    }
    for (const imagePath of car.imagens) {
        try {
            const response = await axios.get(`http://localhost:5000/${imagePath}`, { responseType: 'arraybuffer' });
            const media = new MessageMedia('image/jpeg', Buffer.from(response.data).toString('base64'));
            await client.sendMessage(chatId, media);
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (err) {
            console.error(`❌ Erro ao enviar imagem ${imagePath}:`, err);
        }
    }
}

async function enviarRelatorioParaContatos(chatId, dados) {
    const carsData = (await axios.get('http://localhost:5000/api/cars')).data;
    const contatos = (await axios.get('http://localhost:5000/carros.json')).data.numeros_para_contato;
    let mensagem = `📊 *Novo Relatório de Cliente:*\n📱 Cliente: ${chatId}\n`;

    if (dados.interesses?.length) {
        mensagem += `\n🚗 *Carros visualizados:*\n`;
        dados.interesses.forEach((nome, i) => {
            mensagem += `  ${i + 1}. ${nome}\n`;
        });
    }

    if (dados.financiamento) {
        mensagem += `\n💰 *Solicitou simulação de financiamento:*\n`;
        mensagem += `Carro escolhido: ${dados.financiamento.carroEscolhido || 'Não informado'}\n`;
        mensagem += `Entrada: R$ ${dados.financiamento.entrada || 'Não informado'}\n`;
        mensagem += `Parcelas: ${dados.financiamento.parcelas || 'Não informado'}\n`;
        mensagem += `CPF: ${dados.financiamento.cpf || 'Não informado'}\n`;
        mensagem += `Nascimento: ${dados.financiamento.nascimento || 'Não informado'}\n`;
    }

    if (dados.visita) {
        mensagem += `\n📅 *Solicitou agendamento de visita:*\n`;
        mensagem += `Dia: ${dados.visita.dia || 'Não informado'}\n`;
        mensagem += `Horário: ${dados.visita.horario || 'Não informado'}\n`;
        mensagem += `Nome: ${dados.visita.nome || 'Não informado'}\n`;
    }

    if (dados.troca) {
        mensagem += `\n🔄 *Solicitou troca de veículo:*\n`;
        mensagem += `Modelo: ${dados.troca.modelo || 'Não informado'}\n`;
        mensagem += `Ano: ${dados.troca.ano || 'Não informado'}\n`;
        mensagem += `Estado: ${dados.troca.estado || 'Não informado'}\n`;
        mensagem += `Foto: ${dados.troca.foto || 'Não enviada'}\n`;
    }

    if (dados.venda) {
        mensagem += `\n📤 *Solicitou venda de veículo:*\n`;
        mensagem += `Modelo: ${dados.venda.modelo || 'Não informado'}\n`;
        mensagem += `Ano: ${dados.venda.ano || 'Não informado'}\n`;
        mensagem += `Estado: ${dados.venda.estado || 'Não informado'}\n`;
        mensagem += `Preço: R$ ${dados.venda.preco || 'Não informado'}\n`;
        mensagem += `Foto: ${dados.venda.foto || 'Não enviada'}\n`;
    }

    mensagem += `\n*⚠️ Atenção:* Este relatório contém informações sensíveis. Garanta conformidade com a LGPD.`;

    const sendPromises = contatos.map(async contato => {
        let numeroWhatsApp = contato.numero;
        if (!numeroWhatsApp.includes('@c.us')) {
            numeroWhatsApp = numeroWhatsApp.replace(/\D/g, '') + '@c.us';
        }
        try {
            await client.sendMessage(numeroWhatsApp, mensagem);
            if (dados.troca?.foto) {
                const fotoPath = path.join(uploadDir, dados.troca.foto);
                if (fs.existsSync(fotoPath)) {
                    const media = MessageMedia.fromFilePath(fotoPath);
                    await client.sendMessage(numeroWhatsApp, media, { caption: 'Foto do veículo (Troca)' });
                    console.log(`✅ Foto de troca enviada para ${contato.nome}`);
                }
            }
            if (dados.venda?.foto) {
                const fotoPath = path.join(uploadDir, dados.venda.foto);
                if (fs.existsSync(fotoPath)) {
                    const media = MessageMedia.fromFilePath(fotoPath);
                    await client.sendMessage(numeroWhatsApp, media, { caption: 'Foto do veículo (Venda)' });
                    console.log(`✅ Foto de venda enviada para ${contato.nome}`);
                }
            }
            console.log(`✅ Relatório enviado para ${contato.nome}`);
        } catch (err) {
            console.error(`❌ Erro ao enviar relatório para ${contato.nome}:`, err);
        }
    });

    await Promise.all(sendPromises);
}

async function generateAndStoreQRCode(qr) {
    if (!fs.existsSync(qrcodeFolder)) {
        fs.mkdirSync(qrcodeFolder);
    }
    const qrPath = path.join(qrcodeFolder, 'qrcode.png');
    if (fs.existsSync(qrPath)) {
        fs.unlinkSync(qrPath);
    }
    await qrcode.toFile(qrPath, qr, { type: 'png', width: 300 });
    qrCodeDataUrl = '/QRCODE/qrcode.png';
    console.log('✅ QR Code gerado:', qrPath);
}

client.on('qr', (qr) => generateAndStoreQRCode(qr));

client.on('authenticated', (session) => {
    console.log('✅ Sessão autenticada! Salvando session.json...');
    fs.writeFileSync('session.json', JSON.stringify(session));
});

client.on('ready', () => {
    console.log('✅ Atendente Virtual da Zailon está online!');
    isBotReady = true;
    qrCodeDataUrl = null;
    setInterval(simulateFakeActivity, 40000);
});

client.on('disconnected', async (reason) => {
    console.log('❌ Bot desconectado:', reason);
    isBotReady = false;
    qrCodeDataUrl = null;
    await new Promise(resolve => setTimeout(resolve, 10000));
    try {
        console.log('🔄 Tentando reiniciar o cliente...');
        await client.initialize();
    } catch (err) {
        console.error('❌ Erro ao reiniciar o cliente:', err);
    }
});

client.initialize().catch(err => console.error('❌ Erro ao inicializar cliente:', err));

app.use('/QRCODE', express.static(qrcodeFolder));

app.get('/', (req, res) => {
    if (qrCodeDataUrl && !isBotReady) {
        res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>QR Code - Weiss Multimarcas</title>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f0f0f0; }
                    h1 { color: #333; }
                    img { max-width: 300px; border: 2px solid #333; border-radius: 10px; padding: 10px; background-color: #fff; }
                    p { color: #555; }
                </style>
                <script>
                    async function checkStatus() {
                        try {
                            const response = await fetch('/status');
                            const data = await response.json();
                            if (data.isReady) {
                                document.body.innerHTML = '<h1>Bot Online!</h1><p>O bot está autenticado e funcionando.</p>';
                            } else {
                                setTimeout(checkStatus, 5000);
                            }
                        } catch (err) {
                            console.error('Erro ao verificar status:', err);
                            setTimeout(checkStatus, 5000);
                        }
                    }
                    checkStatus();
                </script>
            </head>
            <body>
                <h1>Escaneie o QR Code com o WhatsApp</h1>
                <img src="${qrCodeDataUrl}" alt="QR Code para autenticação do WhatsApp">
                <p>Aguarde a autenticação...</p>
            </body>
            </html>
        `);
    } else if (isBotReady) {
        res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>QR Code - Weiss Multimarcas</title>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f0f0f0; }
                    h1 { color: #333; }
                    p { color: #555; }
                </style>
            </head>
            <body>
                <h1>Bot Online!</h1>
                <p>O bot está autenticado e funcionando.</p>
            </body>
            </html>
        `);
    } else {
        res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>QR Code - Weiss Multimarcas</title>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f0f0f0; }
                    h1 { color: #333; }
                    p { color: #555; }
                </style>
                <script>
                    async function checkStatus() {
                        try {
                            const response = await fetch('/status');
                            const data = await response.json();
                            if (data.isReady) {
                                document.body.innerHTML = '<h1>Bot Online!</h1><p>O bot está autenticado e funcionando.</p>';
                            } else {
                                setTimeout(checkStatus, 5000);
                            }
                        } catch (err) {
                            console.error('Erro ao verificar status:', err);
                            setTimeout(checkStatus, 5000);
                        }
                    }
                    checkStatus();
                </script>
            </head>
            <body>
                <h1>Aguardando QR Code...</h1>
                <p>Por favor, aguarde enquanto o QR code é gerado.</p>
            </body>
            </html>
        `);
    }
});

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

app.get('/ping', (req, res) => {
    res.status(200).send('Bot is alive!');
    console.log('✅ Recebido ping para manter o bot ativo.');
});

app.listen(port, () => {
    console.log(`✅ Servidor iniciado na porta ${port}. Acesse http://localhost:${port}`);
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

async function enviarMenuInicial(chatId) {
    const mensagem = `🤩 Weiss Multimarcas - Menu Principal\n\nEscolha uma opção digitando o número:\n1 - Ver modelos disponíveis\n2 - Quero um carro financiado\n3 - Quero agendar uma visita\n4 - Falar com um vendedor humano\n5 - Quero trocar meu carro\n6 - Quero vender meu carro\n7 - Ver detalhes de um carro`;
    try {
        await client.sendMessage(chatId, mensagem);
        console.log(`✅ Menu inicial enviado para ${chatId}`);
    } catch (err) {
        console.error(`❌ Erro ao enviar menu inicial para ${chatId}:`, err);
    }
}

async function enviarListaCarros(chatId) {
    try {
        const response = await axios.get('http://localhost:5000/api/cars');
        const cars = response.data;
        let lista = `Temos alguns modelos incríveis disponíveis no momento:\n\n`;
        for (const carro of cars) {
            lista += `🚘 *${carro.nome}* - ${carro.preco}\n`;
        }
        lista += `\nDigite o nome do carro que te interessou ou escolha outra opção do menu (1-7).`;
        await client.sendMessage(chatId, lista);
        console.log(`✅ Lista de carros enviada para ${chatId}`);
    } catch (err) {
        console.error(`❌ Erro ao enviar lista de carros para ${chatId}:`, err);
        await client.sendMessage(chatId, 'Deu ruim no estoque, tenta de novo depois, irmão!');
    }
}

client.on('message', async msg => {
    console.log(`📩 Mensagem recebida de ${msg.from}: ${msg.body} - Estado atual: ${JSON.stringify(clientStates.get(msg.from))}`);
    const chatId = msg.from;
    const textoOriginal = msg.body.trim();
    const texto = normalizeText(textoOriginal);

    let state = clientStates.get(chatId) || { step: 'inicial', lastInteraction: Date.now(), clientData: { interesses: [], financiamento: {}, visita: {}, troca: {}, venda: {} } };
    state.lastInteraction = Date.now();
    clientStates.set(chatId, state);

    if (texto.match(/(oi|olá|salve|bom dia|boa tarde|boa noite|e aí|irmão|beleza|fala aí)/) && state.step === 'inicial') {
        console.log('Detectou saudação, enviando resposta...');
        await msg.getChat().then(chat => chat.sendStateTyping());
        if (podeEnviarBoasVindas(chatId)) {
            await client.sendMessage(chatId, `Olá! 👋 Seja muito bem-vindo à 🤩Weiss Multimarcas 🤩!\nMe chamo Zailon, sou seu consultor virtual. 🚗✨`);
            registrarBoasVindas(chatId);
        }
        state.step = 'menuInicial';
        state.clientData = { id: chatId, phone: chatId, state: 'inicial', interesses: [], financiamento: {}, visita: {}, troca: {}, venda: {}, report: 'Conversa iniciada' };
        await axios.post('http://localhost:5000/api/clients', state.clientData);
        await enviarMenuInicial(chatId);
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
        if (keywords.some(k => texto.includes(k)) && state.step === 'menuInicial') {
            intentDetected = true;
            console.log(`Intenção detectada: ${intent}`);
            if (intent === 'comprar' || intent === 'financiar') {
                state.step = 'aguardandoSelecaoCarro';
                state.clientData.interest = intent === 'financiar' ? 'financiamento' : 'compra à vista';
                state.clientData.state = 'aguardandoSelecaoCarro';
                await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
                await enviarListaCarros(chatId);
            } else if (intent === 'vender' || intent === 'consignar') {
                state.step = intent === 'vender' ? 'aguardandoModeloVenda' : 'aguardandoModeloTroca';
                state.clientData.interest = intent === 'vender' ? 'venda' : 'consignação';
                state.clientData.state = state.step;
                await client.sendMessage(chatId, `Massa! Quer ${intent === 'vender' ? 'vender' : 'trocar'} teu carro? Me conta o modelo!`);
                await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            } else if (intent === 'detalhes') {
                state.step = 'aguardandoSelecaoCarro';
                state.clientData.state = 'aguardandoSelecaoCarro';
                await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
                await client.sendMessage(chatId, 'Fala qual carro tu quer saber mais, irmão!');
                await enviarListaCarros(chatId);
            }
            break;
        }
    }

    if (!intentDetected && state.step === 'menuInicial' && ['1', '2', '3', '4', '5', '6', '7'].includes(textoOriginal)) {
        if (textoOriginal === '1' || textoOriginal === '7') {
            state.step = 'aguardandoSelecaoCarro';
            state.clientData.state = 'aguardandoSelecaoCarro';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await enviarListaCarros(chatId);
        } else if (textoOriginal === '2') {
            state.step = 'aguardandoNomeCarro';
            state.clientData.interest = 'financiamento';
            state.clientData.state = 'aguardandoNomeCarro';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await enviarListaCarros(chatId);
        } else if (textoOriginal === '3') {
            state.step = 'aguardandoDiaVisita';
            state.clientData.state = 'aguardandoDiaVisita';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Perfeito! Para agendar uma visita, me diga o *dia* desejado (ex.: 30/05/2025 ou "amanhã"):`);
        } else if (textoOriginal === '4') {
            state.step = 'menuInicial';
            state.clientData.state = 'menuInicial';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Claro! Um de nossos consultores humanos vai falar com você em instantes. 😊\n\nEnquanto isso, se quiser agilizar, pode chamar direto:\n📞 WhatsApp: +55 46 99137-0461`);
            await enviarMenuInicial(chatId);
        } else if (textoOriginal === '5') {
            state.step = 'aguardandoModeloTroca';
            state.clientData.interest = 'consignação';
            state.clientData.state = 'aguardandoModeloTroca';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Ótimo! Para avaliar seu carro na troca, me diga o *modelo* do veículo (ex.: Honda Civic):`);
        } else if (textoOriginal === '6') {
            state.step = 'aguardandoModeloVenda';
            state.clientData.interest = 'venda';
            state.clientData.state = 'aguardandoModeloVenda';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Perfeito! Para vender seu carro, me diga o *modelo* do veículo (ex.: Toyota Corolla):`);
        }
        return;
    }

    if (state.step === 'aguardandoSelecaoCarro' || state.step === 'aguardandoNomeCarro') {
        const cars = (await axios.get('http://localhost:5000/api/cars')).data;
        const carMatch = cars.find(c => texto.includes(normalizeText(c.nome)));
        if (carMatch) {
            state.clientData.interesses.push(carMatch.nome);
            state.lastCar = carMatch;
            state.step = state.clientData.interest === 'financiamento' ? 'aguardandoEntrada' : 'aguardandoConfirmacao';
            state.clientData.state = state.step;
            state.clientData.financiamento.carroEscolhido = carMatch.nome;
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `🔍 Aqui estão os detalhes do carro *${carMatch.nome}*:\n\n🗓 Ano: ${carMatch.ano}\n💲 Preço: ${carMatch.preco}\nDescrição: ${carMatch.descricao}`);
            await sendCarImages(chatId, carMatch);
            await client.sendMessage(chatId, state.clientData.interest === 'financiamento' ? `Ótimo, vamos simular o financiamento para o *${carMatch.nome}*. Informe o valor da *entrada* disponível (R$):` : `Quer fechar essa compra do *${carMatch.nome}*? Diz sim ou não!`);
        } else {
            await client.sendMessage(chatId, `Carro não encontrado. Digite o nome de um carro válido ou escolha uma opção do menu (1-7).`);
            await enviarListaCarros(chatId);
        }
        return;
    }

    if (state.step === 'aguardandoEntrada') {
        if (isValidAmount(textoOriginal)) {
            state.clientData.financiamento.entrada = textoOriginal;
            state.step = 'aguardandoParcelas';
            state.clientData.state = 'aguardandoParcelas';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Entrada de R$ ${textoOriginal} registrada. Quantas *parcelas* você pretende pagar?`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um valor válido para a entrada (ex.: 10000 ou 10000.00).`);
        }
        return;
    }

    if (state.step === 'aguardandoParcelas') {
        if (isValidParcels(textoOriginal)) {
            state.clientData.financiamento.parcelas = textoOriginal;
            state.step = 'aguardandoCPF';
            state.clientData.state = 'aguardandoCPF';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Parcelas registradas: ${textoOriginal}. Agora, informe seu *CPF* (apenas números):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um número válido de parcelas (ex.: 36).`);
        }
        return;
    }

    if (state.step === 'aguardandoCPF') {
        if (isValidCPF(textoOriginal)) {
            state.clientData.financiamento.cpf = textoOriginal;
            state.step = 'aguardandoNascimento';
            state.clientData.state = 'aguardandoNascimento';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `📅 Agora, informe sua *data de nascimento* (dd/mm/aaaa):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um CPF válido com 11 dígitos (apenas números).`);
        }
        return;
    }

    if (state.step === 'aguardandoNascimento') {
        if (isValidDate(textoOriginal)) {
            state.clientData.financiamento.nascimento = textoOriginal;
            state.step = 'aguardandoDocumentos';
            state.clientData.state = 'aguardandoDocumentos';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Data ok! Envia RG, comprovante de renda e residência (fotos ou PDF, um de cada vez).`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe a data de nascimento no formato dd/mm/aaaa (ex.: 01/01/1990).`);
        }
        return;
    }

    if (state.step === 'aguardandoDocumentos') {
        if (msg.hasMedia) {
            const docTypes = ['rg', 'income', 'residence'];
            const currentDoc = docTypes[Object.keys(state.clientData.financiamento).filter(k => ['rg', 'income', 'residence'].includes(k)).length];
            if (currentDoc) {
                const fotoPath = await salvarFoto(msg, chatId, currentDoc);
                if (fotoPath) state.clientData.financiamento[currentDoc] = fotoPath;
                if (Object.keys(state.clientData.financiamento).filter(k => ['rg', 'income', 'residence'].includes(k)).length === 3) {
                    state.step = 'aguardandoEmprego';
                    state.clientData.state = 'aguardandoEmprego';
                    await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
                    await client.sendMessage(chatId, `Docs recebidos! Qual é teu trampo (emprego)?`);
                } else {
                    await client.sendMessage(chatId, `Recebi o ${currentDoc}! Manda o próximo (${docTypes[Object.keys(state.clientData.financiamento).filter(k => ['rg', 'income', 'residence'].includes(k)).length]}).`);
                }
            }
        } else {
            await client.sendMessage(chatId, `Por favor, envie uma foto do documento (RG, renda ou residência) na ordem solicitada.`);
        }
        return;
    }

    if (state.step === 'aguardandoEmprego') {
        state.clientData.financiamento.job = textoOriginal;
        state.step = 'aguardandoConfirmacao';
        state.clientData.state = 'aguardandoConfirmacao';
        state.clientData.report = `Financiamento simulado do ${state.clientData.financiamento.carroEscolhido}. Dados: ${JSON.stringify(state.clientData.financiamento)}`;
        await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
        await client.sendMessage(chatId, `Trampo registrado! Vamos simular o financiamento. Confirma? (sim/não)`);
        await enviarRelatorioParaContatos(chatId, state.clientData);
        return;
    }

    if (state.step === 'aguardandoConfirmacao') {
        if (texto.includes('sim')) {
            state.step = 'finalizado';
            state.clientData.state = 'finalizado';
            state.clientData.report = `${state.clientData.interest === 'financiamento' ? 'Financiamento simulado' : 'Compra confirmada'} do ${state.clientData.financiamento?.carroEscolhido || state.lastCar?.nome}. Dados: ${JSON.stringify(state.clientData)}`;
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `${state.clientData.interest === 'financiamento' ? 'Financiamento simulado' : 'Compra fechada'}, irmão! Te contata o vendedor com os detalhes! 🚗`);
            await enviarRelatorioParaContatos(chatId, state.clientData);
            clientStates.delete(chatId);
            await enviarMenuInicial(chatId);
        } else if (texto.includes('não')) {
            await client.sendMessage(chatId, `Beleza, irmão! Se mudar de ideia, é só chamar!`);
            state.step = 'menuInicial';
            state.clientData.state = 'menuInicial';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await enviarMenuInicial(chatId);
        } else {
            await client.sendMessage(chatId, `Diz sim ou não, irmão!`);
        }
        return;
    }

    if (state.step === 'aguardandoModeloTroca') {
        if (isValidModel(textoOriginal)) {
            state.clientData.troca.modelo = textoOriginal;
            state.step = 'aguardandoAnoTroca';
            state.clientData.state = 'aguardandoAnoTroca';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Modelo registrado: ${textoOriginal}. Agora, informe o *ano* do veículo (ex.: 2018):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um modelo válido (ex.: Honda Civic).`);
        }
        return;
    }

    if (state.step === 'aguardandoAnoTroca') {
        if (isValidYear(textoOriginal)) {
            state.clientData.troca.ano = textoOriginal;
            state.step = 'aguardandoEstadoTroca';
            state.clientData.state = 'aguardandoEstadoTroca';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Ano registrado: ${textoOriginal}. Descreva o *estado de conservação* do veículo (ex.: Bom estado, revisado):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um ano válido (ex.: 2018).`);
        }
        return;
    }

    if (state.step === 'aguardandoEstadoTroca') {
        if (isValidCondition(textoOriginal)) {
            state.clientData.troca.estado = textoOriginal;
            state.step = 'aguardandoFotoTroca';
            state.clientData.state = 'aguardandoFotoTroca';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Estado registrado: ${textoOriginal}. Envie uma *foto* do veículo ou digite "NÃO" para pular:`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe o estado de conservação (ex.: Bom estado, revisado).`);
        }
        return;
    }

    if (state.step === 'aguardandoFotoTroca') {
        if (texto === 'não' || msg.hasMedia) {
            if (msg.hasMedia) {
                const fotoPath = await salvarFoto(msg, chatId, 'troca');
                if (fotoPath) state.clientData.troca.foto = fotoPath;
            }
            state.step = 'finalizado';
            state.clientData.state = 'finalizado';
            state.clientData.report = `Troca solicitada de ${state.clientData.troca.modelo}. Dados: ${JSON.stringify(state.clientData.troca)}`;
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `✅ Solicitação de troca enviada! Um consultor entrará em contato para avaliar seu veículo. 😊`);
            await enviarRelatorioParaContatos(chatId, state.clientData);
            clientStates.delete(chatId);
            await enviarMenuInicial(chatId);
        } else {
            await client.sendMessage(chatId, `Por favor, envie uma foto do veículo ou digite "NÃO" para pular.`);
        }
        return;
    }

    if (state.step === 'aguardandoModeloVenda') {
        if (isValidModel(textoOriginal)) {
            state.clientData.venda.modelo = textoOriginal;
            state.step = 'aguardandoAnoVenda';
            state.clientData.state = 'aguardandoAnoVenda';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Modelo registrado: ${textoOriginal}. Agora, informe o *ano* do veículo (ex.: 2020):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um modelo válido (ex.: Toyota Corolla).`);
        }
        return;
    }

    if (state.step === 'aguardandoAnoVenda') {
        if (isValidYear(textoOriginal)) {
            state.clientData.venda.ano = textoOriginal;
            state.step = 'aguardandoEstadoVenda';
            state.clientData.state = 'aguardandoEstadoVenda';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Ano registrado: ${textoOriginal}. Descreva o *estado de conservação* do veículo (ex.: Ótimo estado, único dono):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um ano válido (ex.: 2020).`);
        }
        return;
    }

    if (state.step === 'aguardandoEstadoVenda') {
        if (isValidCondition(textoOriginal)) {
            state.clientData.venda.estado = textoOriginal;
            state.step = 'aguardandoPrecoVenda';
            state.clientData.state = 'aguardandoPrecoVenda';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Estado registrado: ${textoOriginal}. Informe o *preço desejado* para a venda (ex.: 50000):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe o estado de conservação (ex.: Ótimo estado, único dono).`);
        }
        return;
    }

    if (state.step === 'aguardandoPrecoVenda') {
        if (isValidAmount(textoOriginal)) {
            state.clientData.venda.preco = textoOriginal;
            state.step = 'aguardandoFotoVenda';
            state.clientData.state = 'aguardandoFotoVenda';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Preço registrado: R$ ${textoOriginal}. Envie uma *foto* do veículo ou digite "NÃO" para pular:`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um preço válido (ex.: 50000 ou 50000.00).`);
        }
        return;
    }

    if (state.step === 'aguardandoFotoVenda') {
        if (texto === 'não' || msg.hasMedia) {
            if (msg.hasMedia) {
                const fotoPath = await salvarFoto(msg, chatId, 'venda');
                if (fotoPath) state.clientData.venda.foto = fotoPath;
            }
            state.step = 'finalizado';
            state.clientData.state = 'finalizado';
            state.clientData.report = `Venda solicitada de ${state.clientData.venda.modelo}. Dados: ${JSON.stringify(state.clientData.venda)}`;
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `✅ Solicitação de venda enviada! Um consultor entrará em contato para discutir a proposta. 😊`);
            await enviarRelatorioParaContatos(chatId, state.clientData);
            clientStates.delete(chatId);
            await enviarMenuInicial(chatId);
        } else {
            await client.sendMessage(chatId, `Por favor, envie uma foto do veículo ou digite "NÃO" para pular.`);
        }
        return;
    }

    if (state.step === 'aguardandoDiaVisita') {
        if (isValidVisitDate(textoOriginal)) {
            state.clientData.visita.dia = textoOriginal;
            state.step = 'aguardandoHorarioVisita';
            state.clientData.state = 'aguardandoHorarioVisita';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Dia registrado: ${textoOriginal}. Agora, informe o *horário* desejado (ex.: 14:30):`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um dia válido (ex.: 30/05/2025 ou "amanhã").`);
        }
        return;
    }

    if (state.step === 'aguardandoHorarioVisita') {
        if (isValidVisitTime(textoOriginal)) {
            state.clientData.visita.horario = textoOriginal;
            state.step = 'aguardandoNomeVisita';
            state.clientData.state = 'aguardandoNomeVisita';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `Horário registrado: ${textoOriginal}. Agora, informe seu *nome completo*:`);
        } else {
            await client.sendMessage(chatId, `Por favor, informe um horário válido (ex.: 14:30).`);
        }
        return;
    }

    if (state.step === 'aguardandoNomeVisita') {
        if (isValidFullName(textoOriginal)) {
            state.clientData.visita.nome = textoOriginal;
            state.step = 'finalizado';
            state.clientData.state = 'finalizado';
            state.clientData.report = `Visita agendada para ${state.clientData.visita.dia} às ${state.clientData.visita.horario}. Nome: ${state.clientData.visita.nome}`;
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `✅ Agendamento solicitado! Um consultor entrará em contato para confirmar a disponibilidade. 😊`);
            await enviarRelatorioParaContatos(chatId, state.clientData);
            clientStates.delete(chatId);
            await enviarMenuInicial(chatId);
        } else {
            await client.sendMessage(chatId, `Por favor, informe seu nome completo (ex.: João Silva).`);
        }
        return;
    }

    if (!intentDetected) {
        const cars = (await axios.get('http://localhost:5000/api/cars')).data;
        const carMatch = cars.find(c => texto.includes(normalizeText(c.nome)));
        if (carMatch) {
            state.clientData.interesses.push(carMatch.nome);
            state.lastCar = carMatch;
            state.step = 'aguardandoFinanciamento';
            state.clientData.state = 'aguardandoFinanciamento';
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, state.clientData);
            await client.sendMessage(chatId, `🔍 Aqui estão os detalhes do carro *${carMatch.nome}*:\n\n🗓 Ano: ${carMatch.ano}\n💲 Preço: ${carMatch.preco}\nDescrição: ${carMatch.descricao}`);
            await sendCarImages(chatId, carMatch);
            await client.sendMessage(chatId, `Deseja simular um financiamento deste carro?\nDigite "SIMULAR", ou envie outro nome de carro.`);
        } else {
            await client.sendMessage(chatId, `Desculpe, não entendi sua mensagem. Por favor, escolha uma das opções enviando o número correspondente (1-7) ou diga o nome de um carro.`);
            await enviarMenuInicial(chatId);
        }
    }
});