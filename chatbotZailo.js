const express = require('express');
const qrcode = require('qrcode');
const { Client } = require('whatsapp-web.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Função para formatar timestamp nos logs
function getTimestamp() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Função para formatar preço
function formatPrice(price) {
  // Remove "R$" e quaisquer caracteres não numéricos, exceto ponto e vírgula
  const cleanPrice = typeof price === 'string'
    ? price.replace(/[^\d,.]/g, '').replace(',', '.')
    : price.toString();
  const numberPrice = parseFloat(cleanPrice);
  return numberPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Carregar lista de carros do arquivo carros.json
let cars = { modelos: [] };
const carsFile = path.join(__dirname, 'carros.json');
try {
  cars = JSON.parse(fs.readFileSync(carsFile, 'utf-8'));
  console.log(`[${getTimestamp()}] ✅ Lista de carros carregada de carros.json:`, cars.modelos.length, 'carros encontrados.');
} catch (error) {
  console.error(`[${getTimestamp()}] Erro ao carregar carros.json:`, error.message);
}

// Log indicando que o fallback baseado em regex será usado
console.log(`[${getTimestamp()}] Usando detecção de intenções baseada em regex (sem Transformers.js).`);

const app = express();
const port = process.env.PORT || 3000;
let qrCodeDataUrl = null;
let isBotReady = false;
const qrcodeFolder = path.join(__dirname, 'QRCODE');
const sessionFile = path.join(__dirname, 'session.json');
const documentsFolder = path.join(__dirname, 'documents');

const client = new Client({
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
  session: fs.existsSync(sessionFile) ? JSON.parse(fs.readFileSync(sessionFile, 'utf-8')) : null
});

client.on('qr', (qr) => {
  console.log(`[${getTimestamp()}] QR Code gerado:`, qr);
  generateAndStoreQRCode(qr);
});

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
    console.log(`[${getTimestamp()}] QR Code salvo em: ${qrPath}`);
  } catch (error) {
    console.error(`[${getTimestamp()}] Erro ao gerar QR Code:`, error.message);
  }
}

client.on('authenticated', (session) => {
  console.log(`[${getTimestamp()}] ✅ Sessão autenticada! Session data:`, session);
  if (session) {
    try {
      fs.writeFileSync(sessionFile, JSON.stringify(session));
      console.log(`[${getTimestamp()}] session.json salvo com sucesso.`);
    } catch (error) {
      console.error(`[${getTimestamp()}] Erro ao salvar session.json:`, error.message);
    }
  } else {
    console.warn(`[${getTimestamp()}] ⚠️ Session data é undefined. Não salvando session.json.`);
  }
});

client.on('ready', async () => {
  console.log(`[${getTimestamp()}] ✅ Atendente Virtual da Zailon está online! isBotReady: ${isBotReady}`);
  isBotReady = true;
  // Enviar mensagem de autenticação para o número especificado
  try {
    const targetNumber = '5546991370461@c.us';
    await client.sendMessage(targetNumber, 'autenticado :');
    console.log(`[${getTimestamp()}] Mensagem "autenticado :" enviada para ${targetNumber}`);
  } catch (error) {
    console.error(`[${getTimestamp()}] Erro ao enviar mensagem de autenticação para 5546991370461@c.us:`, error.message);
  }
});

client.on('disconnected', (reason) => {
  console.log(`[${getTimestamp()}] ❌ Bot desconectado:`, reason);
  isBotReady = false;
  qrCodeDataUrl = null;
  if (fs.existsSync(sessionFile)) {
    fs.unlinkSync(sessionFile);
    console.log(`[${getTimestamp()}] session.json removido devido à desconexão.`);
  }
});

client.on('message', async msg => {
  // Log detalhado para confirmar que a mensagem foi recebida
  console.log(`[${getTimestamp()}] 📩 Mensagem recebida - De: ${msg.from}, Conteúdo: "${msg.body || ''}", Normalizado: "${normalizeText(msg.body || '')}", Tipo: ${msg.type}, Tem mídia: ${msg.hasMedia}`);

  const chatId = msg.from;
  const originalText = msg.body ? msg.body.trim() : '';
  const normalizedText = normalizeText(originalText);

  // Resposta inicial para confirmar recebimento, mesmo se o bot não estiver pronto
  try {
    await msg.getChat().then(chat => chat.sendStateTyping());
    await client.sendMessage(chatId, 'Recebi tua mensagem, irmão! Tô processando... 😎');
  } catch (error) {
    console.error(`[${getTimestamp()}] Erro ao enviar resposta inicial:`, error.message);
    return;
  }

  // Verificar estado do bot
  if (!isBotReady) {
    console.warn(`[${getTimestamp()}] Bot não está pronto (isBotReady: ${isBotReady}). Enviando resposta padrão.`);
    await client.sendMessage(chatId, 'Opa, irmão! Tô conectando ainda... Tenta de novo em alguns segundos! 😅');
    return;
  }

  // Atualizar estado do cliente
  let state = clientStates.get(chatId) || { step: 'inicial', lastInteraction: Date.now(), clientData: {} };
  state.lastInteraction = Date.now();
  clientStates.set(chatId, state);

  console.log(`[${getTimestamp()}] Estado atual: ${state.step}, ClientData:`, state.clientData);

  try {
    // Tratar saudações iniciais
    if (normalizedText.match(/(oi|olá|salve|bom dia|boa tarde|boa noite|e aí|irmão|beleza|fala aí|opa|hey)/) && state.step === 'inicial') {
      console.log(`[${getTimestamp()}] Detectou saudação, enviando resposta...`);
      try {
        const carList = cars.modelos && cars.modelos.length > 0
          ? cars.modelos.map(c => `- ${c.nome} (${c.ano || 'sem ano'}) - ${formatPrice(c.preco)} - ${c.descricao.replace(/\r\n/g, ', ')}`).join('\n')
          : 'Nenhum carro no estoque!';
        await client.sendMessage(chatId, `Salve, irmão! 👊 Eu sou a Zailon, teu parceiro virtual. Temos esses carros no estoque:\n${carList}\nQuer comprar, financiar, trocar ou só dar uma olhada?`);
      } catch (error) {
        console.error(`[${getTimestamp()}] Erro ao processar lista de carros:`, error.message);
        await client.sendMessage(chatId, `Salve, irmão! 👊 Eu sou a Zailon, teu parceiro virtual. Quer comprar, financiar, trocar ou só dar uma olhada?`);
      }
      state.step = 'aguardando_intencao';
      state.clientData = { name: chatId.split('@')[0], phone: chatId, state: 'inicial', interests: {}, documents: {}, report: 'Conversa iniciada' };
      try {
        const clientResponse = await axios.post('http://localhost:5000/api/clients', state.clientData, { timeout: 5000 });
        state.clientData.id = clientResponse.data.id;
      } catch (error) {
        console.error(`[${getTimestamp()}] Erro ao salvar cliente:`, error.message);
      }
      clientStates.set(chatId, state);
      return;
    }

    // Processar intenção
    const botResponse = await getBotpressResponse(chatId, originalText);

    if ((botResponse.includes('comprar') || botResponse.includes('à vista')) && state.step === 'aguardando_intencao') {
      try {
        const carList = cars.modelos && cars.modelos.length > 0
          ? cars.modelos.map(c => `${c.nome} (${c.ano || 'sem ano'}) - ${formatPrice(c.preco)} - ${c.descricao.replace(/\r\n/g, ', ')}`).join('\n')
          : 'Nenhum carro disponível no momento.';
        await client.sendMessage(chatId, `Beleza, irmão! Temos:\n${carList}\nQual te interessa? 🚗`);
        state.step = 'aguardando_carro';
        state.clientData.interest = 'compra à vista';
        await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, state: state.step }, { timeout: 5000 });
      } catch (error) {
        console.error(`[${getTimestamp()}] Erro ao processar lista de carros:`, error.message);
        await client.sendMessage(chatId, 'Deu ruim ao listar os carros, irmão! Tenta de novo. 😓');
      }
    } else if (botResponse.includes('financiar') && state.step === 'aguardando_intencao') {
      try {
        const carList = cars.modelos && cars.modelos.length > 0
          ? cars.modelos.map(c => `${c.nome} (${c.ano || 'sem ano'}) - ${formatPrice(c.preco)} - ${c.descricao.replace(/\r\n/g, ', ')}`).join('\n')
          : 'Nenhum carro disponível no momento.';
        await client.sendMessage(chatId, `Massa, vamos financiar? Temos:\n${carList}\nQual tu quer? 💸`);
        state.step = 'aguardando_carro';
        state.clientData.interest = 'financiamento';
        await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, state: state.step }, { timeout: 5000 });
      } catch (error) {
        console.error(`[${getTimestamp()}] Erro ao processar lista de carros:`, error.message);
        await client.sendMessage(chatId, 'Deu ruim ao listar os carros, irmão! Tenta de novo. 😓');
      }
    } else if (botResponse.includes('trocar') && state.step === 'aguardando_intencao') {
      try {
        const carList = cars.modelos && cars.modelos.length > 0
          ? cars.modelos.map(c => `${c.nome} (${c.ano || 'sem ano'}) - ${formatPrice(c.preco)} - ${c.descricao.replace(/\r\n/g, ', ')}`).join('\n')
          : 'Nenhum carro disponível no momento.';
        await client.sendMessage(chatId, `Beleza, quer trocar? Temos:\n${carList}\nQual carro tu quer? E me conta sobre o teu carro: modelo, ano e estado (ex.: "Gol 2018, bom estado"). 🚙`);
        state.step = 'aguardando_troca_detalhes';
        state.clientData.interest = 'troca';
        await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, state: state.step }, { timeout: 5000 });
      } catch (error) {
        console.error(`[${getTimestamp()}] Erro ao processar lista de carros:`, error.message);
        await client.sendMessage(chatId, 'Deu ruim ao listar os carros, irmão! Tenta de novo. 😓');
      }
    } else if (state.step === 'aguardando_carro') {
      try {
        const carMatch = cars.modelos?.find(c => normalizeText(c.nome).includes(normalizedText));
        if (carMatch) {
          state.lastCar = carMatch;
          state.clientData.carInterested = carMatch.nome;
          state.step = state.clientData.interest === 'financiamento' ? 'aguardando_documentos' : 'aguardando_confirmacao';
          await client.sendMessage(chatId, `Top, curtiu o ${carMatch.nome}! ${state.clientData.interest === 'financiamento' ? 'Pra simular, me passa teu CPF (só números):' : 'Quer fechar essa compra? Diz sim ou não!'} 🚘`);
          state.clientData.state = state.step;
          await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, state: state.step }, { timeout: 5000 });
        } else {
          await client.sendMessage(chatId, 'Não achei esse carro, irmão! Tenta outro nome da lista. 😅');
        }
      } catch (error) {
        console.error(`[${getTimestamp()}] Erro ao processar carro selecionado:`, error.message);
        await client.sendMessage(chatId, 'Deu ruim ao buscar o carro, irmão! Tenta de novo. 😓');
      }
    } else if (state.step === 'aguardando_troca_detalhes') {
      try {
        const carMatch = cars.modelos?.find(c => normalizeText(c.nome).includes(normalizedText.split(' ')[0]));
        if (carMatch) {
          state.lastCar = carMatch;
          state.clientData.carInterested = carMatch.nome;
          state.clientData.tradeCar = { details: originalText };
          state.step = 'aguardando_confirmacao';
          await client.sendMessage(chatId, `Entendi, tu quer o ${carMatch.nome} e tá oferecendo: "${originalText}". Confirma a proposta de troca? (sim/não) 🤝`);
          state.clientData.state = state.step;
          await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, tradeCar: state.clientData.tradeCar, state: state.step }, { timeout: 5000 });
        } else {
          await client.sendMessage(chatId, 'Não achei o carro que tu quer na lista, irmão! Tenta outro nome e me fala do teu carro de novo (modelo, ano, estado). 😅');
        }
      } catch (error) {
        console.error(`[${getTimestamp()}] Erro ao processar detalhes da troca:`, error.message);
        await client.sendMessage(chatId, 'Deu ruim ao processar a troca, irmão! Tenta de novo. 😓');
      }
    } else if (state.step === 'aguardando_documentos') {
      if (/^\d{11}$/.test(normalizedText) && !state.clientData.documents?.cpf) {
        state.clientData.documents = state.clientData.documents || {};
        state.clientData.documents.cpf = originalText;
        state.step = 'aguardando_nascimento';
        await client.sendMessage(chatId, 'CPF ok! Agora me passa tua data de nascimento (DDMMAAAA): 📝');
        state.clientData.state = state.step;
        await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, documents: state.clientData.documents, state: state.step }, { timeout: 5000 });
      } else if (/^\d{8}$/.test(normalizedText) && state.clientData.documents?.cpf && !state.clientData.documents?.birthdate) {
        state.clientData.documents.birthdate = originalText;
        state.step = 'aguardando_arquivos';
        await client.sendMessage(chatId, 'Data ok! Envia RG, comprovante de renda e residência (fotos ou PDF, um de cada vez). 📷');
        state.clientData.state = state.step;
        await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, documents: state.clientData.documents, state: state.step }, { timeout: 5000 });
      } else if (msg.hasMedia && state.clientData.documents) {
        try {
          const media = await msg.downloadMedia();
          const docTypes = ['rg', 'income', 'residence'];
          const currentDoc = docTypes[Object.keys(state.clientData.documents).length - 2];
          if (currentDoc) {
            const filename = `${chatId}_${currentDoc}_${Date.now()}.${media.mimetype.split('/')[1]}`;
            fs.mkdirSync(documentsFolder, { recursive: true });
            fs.writeFileSync(`${documentsFolder}/${filename}`, Buffer.from(media.data, 'base64'), 'base64');
            state.clientData.documents[currentDoc] = filename;
            if (Object.keys(state.clientData.documents).length === 5) {
              state.step = 'aguardando_emprego';
              await client.sendMessage(chatId, 'Docs recebidos! Qual é teu trampo (emprego)? 💼');
            } else {
              await client.sendMessage(chatId, `Recebi o ${currentDoc}! Manda o próximo (${docTypes[Object.keys(state.clientData.documents).length - 2]}). 📤`);
            }
            state.clientData.state = state.step;
            await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, documents: state.clientData.documents, state: state.step }, { timeout: 5000 });
          }
        } catch (error) {
          console.error(`[${getTimestamp()}] Erro ao processar mídia:`, error.message);
          await client.sendMessage(chatId, 'Deu erro ao processar o arquivo, irmão! Tenta de novo. 😓');
        }
      } else {
        await client.sendMessage(chatId, 'Tá errado, irmão! CPF com 11 dígitos ou data em DDMMAAAA, ou envia os docs na ordem (RG, renda, residência). 😅');
      }
    } else if (state.step === 'aguardando_emprego') {
      state.clientData.job = originalText;
      state.step = 'aguardando_confirmacao';
      await client.sendMessage(chatId, 'Trampo registrado! Vamos simular o financiamento. Confirma? (sim/não) ✅');
      state.clientData.state = state.step;
      await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, documents: state.clientData.documents, job: state.clientData.job, state: state.step }, { timeout: 5000 });
    } else if (state.step === 'aguardando_confirmacao') {
      if (normalizedText.includes('sim')) {
        state.step = 'finalizado';
        state.clientData.state = state.step;
        state.clientData.report = state.clientData.interest === 'troca'
          ? `Proposta de troca do ${state.clientData.carInterested} pelo carro do cliente (${state.clientData.tradeCar.details}). Dados: ${JSON.stringify(state.clientData)}`
          : `${state.clientData.interest === 'financiamento' ? 'Financiamento simulado' : 'Compra confirmada'} do ${state.clientData.carInterested}. Dados: ${JSON.stringify(state.clientData)}`;
        await axios.post('http://localhost:5000/api/clients', state.clientData, { timeout: 5000 });
        await client.sendMessage(chatId, `${state.clientData.interest === 'troca' ? 'Proposta de troca registrada' : state.clientData.interest === 'financiamento' ? 'Financiamento simulado' : 'Compra fechada'}, irmão! Te liga o vendedor em breve! 🚗`);
        clientStates.delete(chatId);
      } else if (normalizedText.includes('não')) {
        await client.sendMessage(chatId, 'Beleza, irmão! Se mudar de ideia, é só chamar! 😎');
        state.step = 'inicial';
        state.clientData.state = state.step;
        await axios.put(`http://localhost:5000/api/clients/${state.clientData.id}`, { interests: state.clientData, state: state.step }, { timeout: 5000 });
      } else {
        await client.sendMessage(chatId, 'Diz sim ou não, irmão! 😄');
      }
    } else {
      await client.sendMessage(chatId, botResponse);
    }

    clientStates.set(chatId, state);
  } catch (error) {
    console.error(`[${getTimestamp()}] Erro ao processar mensagem:`, error.message);
    await client.sendMessage(chatId, 'Deu ruim, irmão! Tenta de novo mais tarde. 😓');
  }
});

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

const clientStates = new Map();

async function getBotpressResponse(chatId, message) {
  try {
    const normalizedText = normalizeText(message);
    console.log(`[${getTimestamp()}] Processando intenção com regex para mensagem: "${normalizedText}"`);

    // Fallback baseado em regex (fortalecido)
    if (normalizedText.includes('comprar') || normalizedText.includes('compra') || normalizedText.includes('adquirir') || normalizedText.includes('quero um carro') || normalizedText.includes('comprar carro')) {
      return 'Beleza, irmão! Quer comprar um carro à vista? Me diz qual modelo te interessa! 🚗';
    } else if (normalizedText.includes('financiar') || normalizedText.includes('financiamento') || normalizedText.includes('parcelar') || normalizedText.includes('financiamento de carro') || normalizedText.includes('financiar carro')) {
      return 'Massa, vamos financiar? Qual carro tu quer? 💸';
    } else if (normalizedText.includes('troca') || normalizedText.includes('trocar') || normalizedText.includes('permuta') || normalizedText.includes('quero trocar') || normalizedText.includes('troca de carro')) {
      return 'Beleza, quer trocar um carro? Me diz qual carro tu quer do estoque e me conta sobre o teu (modelo, ano, estado)! 🤝';
    } else if (normalizedText.includes('vender') || normalizedText.includes('venda') || normalizedText.includes('meu carro') || normalizedText.includes('vender carro')) {
      return 'Quer vender teu carro? Me conta mais sobre ele (modelo, ano, estado)! 🚘';
    } else if (normalizedText.includes('olhada') || normalizedText.includes('estoque') || normalizedText.includes('ver carros') || normalizedText.includes('quais carros') || normalizedText.includes('catálogo')) {
      return 'Quer dar uma olhada no estoque? Te mostro os carros disponíveis! 🔍';
    } else if (normalizedText.includes('ajuda') || normalizedText.includes('suporte') || normalizedText.includes('como funciona') || normalizedText.includes('o que você faz')) {
      return 'Beleza, irmão! Como posso te ajudar hoje? 😎';
    }
    return 'Não entendi, irmão! 😅 Pode repetir ou dizer o que quer (comprar, financiar, trocar, vender)?';
  } catch (error) {
    console.error(`[${getTimestamp()}] Erro ao processar intenção:`, error.message);
    return 'Deu ruim, irmão! Tenta de novo! 😓';
  }
}

client.initialize().catch(err => {
  console.error(`[${getTimestamp()}] ❌ Erro ao inicializar cliente:`, err.message);
});
console.log(`[${getTimestamp()}] Iniciando cliente WhatsApp...`);

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
  console.log(`[${getTimestamp()}] ✅ Servidor iniciado na porta ${port}. Acesse http://localhost:${port}/get-qrcode`);
});

async function simulateFakeActivity() {
  try {
    const fakeChatId = '5531999999999@c.us';
    const chat = await client.getChatById(fakeChatId);
    await chat.sendStateTyping();
  } catch (error) {
    console.error(`[${getTimestamp()}] Erro ao simular atividade:`, error.message);
  }
}

// Resetar estados inativos após 10 minutos
setInterval(() => {
  clientStates.forEach((state, chatId) => {
    if (Date.now() - state.lastInteraction > 10 * 60 * 1000) {
      console.log(`[${getTimestamp()}] Resetando estado para: ${chatId}`);
      clientStates.delete(chatId);
    }
  });
}, 60 * 1000);